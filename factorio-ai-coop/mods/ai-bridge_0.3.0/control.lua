-- ai-bridge: lets external agents (Claude, Codex, ...) play Factorio as
-- characters in an ordinary multiplayer game, while a human watches and gives
-- orders.
--
-- Why a mod at all, when RCON can already run Lua? Because a console command
-- lives for exactly one tick. Walking, mining and crafting happen *over* ticks,
-- and only a mod can hold an on_tick handler across a save/load. So:
--
--   agent -> RCON -> remote.call("ai", "submit", name, ...)   intent, once
--   mod   -> on_tick state machine, one per agent             execution, per tick
--   agent -> RCON -> remote.call("ai", "poll", id)            result, when ready
--
-- Nothing but plain data and entity references goes into `storage`, which is
-- what keeps the world saveable while agents are attached.

local Tasks = require("tasks")

local RESULT_HISTORY = 128     -- completed tasks kept for polling, all agents
-- Long enough for a walk that has to re-route around terrain a few times.
local DEFAULT_TIMEOUT = 7200   -- ticks (2 minutes) before a task is abandoned
local MAX_QUEUE = 64           -- per agent; refuse work rather than grow forever
local MAX_AGENTS = 8
local MAX_OBSERVE_RADIUS = 200 -- one observe runs inside a single tick
local PATH_ANSWER_TTL = 1800   -- ticks an uncollected path answer may linger
local CHAT_HISTORY = 50

-- Recipes the self-directed ladder reasons about. Reported with every
-- inventory so an agent can ask "can I build this yet?" instead of trying and
-- failing in a loop.
local PLANNING_RECIPES = {
  "burner-mining-drill", "iron-chest", "stone-furnace", "wooden-chest",
  "iron-gear-wheel", "transport-belt", "copper-cable", "electronic-circuit",
  "lab", "automation-science-pack", "assembling-machine-1", "inserter",
  "pipe", "boiler", "steam-engine", "offshore-pump", "small-electric-pole",
}

-- A headless server only writes back to the save it was started from when it
-- shuts down cleanly. Closing the window or killing the process loses
-- everything, and the autosaves the server settings produce go to separate
-- `_autosave` files that the next start never loads. So the world saves itself
-- over the file it came from, on a timer.
local AUTOSAVE_INTERVAL = 60 * 60 * 5   -- ticks (5 minutes)

local MARKER_INTERVAL = 30   -- ticks between nametag/map-tag refreshes
local TAG_MOVE_EPSILON = 6   -- tiles an agent may drift before its map tag moves

-- Distinct enough to tell apart at a glance on a dark map.
local COLORS = {
  { r = 0.35, g = 0.80, b = 1.00 },
  { r = 1.00, g = 0.75, b = 0.25 },
  { r = 0.55, g = 1.00, b = 0.45 },
  { r = 1.00, g = 0.50, b = 0.80 },
  { r = 0.70, g = 0.60, b = 1.00 },
  { r = 1.00, g = 0.40, b = 0.35 },
  { r = 0.45, g = 0.95, b = 0.90 },
  { r = 0.90, g = 0.90, b = 0.55 },
}

--------------------------------------------------------------------- storage

local function init()
  storage.agents = storage.agents or {}
  -- Iteration order of a hash table is not something to bet a multiplayer
  -- checksum on, so the agents are driven through an explicit list.
  storage.order = storage.order or {}
  storage.results = storage.results or {}
  storage.result_order = storage.result_order or {}
  storage.paths = storage.paths or {}
  storage.chat = storage.chat or {}
  storage.next_id = storage.next_id or 1
  storage.next_index = storage.next_index or 0
end

script.on_init(init)
script.on_configuration_changed(init)

local function agent(name)
  return storage.agents[name]
end

local function body(a)
  if a and a.char and a.char.valid then return a.char end
  return nil
end

--------------------------------------------------------------- visibility

-- An agent's character is not a player, so the game gives it neither a nametag
-- nor a dot on the minimap. Both have to be drawn by hand, and they are two
-- different mechanisms: a render object follows the entity in the world, while
-- only a map tag shows up on the map and minimap.

local function drop_marker(a)
  if a.label and a.label.valid then a.label.destroy() end
  if a.tag and a.tag.valid then a.tag.destroy() end
  a.label, a.tag = nil, nil
end

local function marker_text(a)
  if a.current then
    return a.name .. " · " .. a.current.type
  end
  if #a.queue > 0 then
    return a.name .. " · " .. #a.queue .. " queued"
  end
  return a.name
end

local function refresh_marker(a)
  local b = body(a)
  if not b then
    drop_marker(a)
    return
  end

  local color = COLORS[(((a.index or 1) - 1) % #COLORS) + 1]

  if not (a.label and a.label.valid) then
    a.label = rendering.draw_text {
      text = marker_text(a),
      surface = b.surface,
      target = { entity = b, offset = { 0, -2.2 } },
      color = color,
      scale = 0.9,
      alignment = "center",
      scale_with_zoom = false,
      only_in_alt_mode = false,
    }
  else
    a.label.text = marker_text(a)
  end

  -- Chart tags cannot be moved, only replaced, so only redraw when the agent
  -- has actually walked somewhere. Otherwise every agent churns a tag twice a
  -- second for no visible difference.
  local moved = not (a.tag and a.tag.valid)
    or Tasks.dist(a.tag.position, b.position) > TAG_MOVE_EPSILON
  if moved then
    if a.tag and a.tag.valid then a.tag.destroy() end
    local ok, tag = pcall(function()
      return b.force.add_chart_tag(b.surface, {
        position = b.position,
        text = a.name,
      })
    end)
    -- add_chart_tag returns nil on an uncharted chunk; try again next time.
    a.tag = (ok and tag) or nil
  end
end

script.on_nth_tick(AUTOSAVE_INTERVAL, function()
  -- server_save with no name writes over the save the server is running, which
  -- is the one the next start will load. pcall because this is meaningless
  -- (and an error) outside a headless server.
  local ok = pcall(function() game.server_save() end)
  if ok then
    storage.last_save_tick = game.tick
  end
end)

script.on_nth_tick(MARKER_INTERVAL, function()
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a then pcall(refresh_marker, a) end
  end
end)

--------------------------------------------------------------------- results

local function archive(a, task, status)
  storage.results[task.id] = {
    id = task.id,
    agent = a.name,
    type = task.type,
    status = status,
    result = task.result,
    error = task.error,
    finished_tick = game.tick,
  }
  table.insert(storage.result_order, task.id)
  -- Ring buffer: keep memory flat no matter how long the session runs.
  while #storage.result_order > RESULT_HISTORY do
    local oldest = table.remove(storage.result_order, 1)
    storage.results[oldest] = nil
  end
end

-- Every task ends here and nowhere else. Scattering "stop walking, stop mining,
-- record the result" across call sites is how a cancelled task leaves its
-- character walking away while the next one tries to craft.
local function finish(a, task, status)
  local b = body(a)
  if b then
    pcall(function()
      Tasks.halt(b)
      b.mining_state = { mining = false }
    end)
  end
  archive(a, task, status)
  a.current = nil
end

local function drop_queue(a, reason)
  for _, pending in ipairs(a.queue) do
    pending.error = reason
    archive(a, pending, "failed")
  end
  a.queue = {}
end

--------------------------------------------------------------------- the loop

local function drive_agent(a)
  local b = body(a)
  if not b then
    if a.current then
      a.current.error = "character died or was removed"
      finish(a, a.current, "failed")
    end
    -- Nothing can run without a character, so do not let the queue sit there
    -- answering "queued" to an agent that would wait forever.
    if #a.queue > 0 then
      drop_queue(a, "character died or was removed")
    end
    return
  end

  if not a.current then
    a.current = table.remove(a.queue, 1)
    if not a.current then return end
    a.current.started_tick = game.tick
  end

  local task = a.current
  local handler = Tasks[task.type]
  local ctx = { bot = b, task = task, surface = b.surface, tick = game.tick }

  -- A raw Lua error inside on_tick does not just fail the task: Factorio tears
  -- the whole server down with "multiplayer error", dropping every human in the
  -- game. An agent that can pass a bad recipe name must not be able to do that.
  local ok, status = pcall(function()
    if not task.started then
      task.started = true
      return handler.start(ctx)
    end
    return handler.step(ctx)
  end)

  if not ok then
    task.error = "lua error: " .. tostring(status)
    status = "failed"
  end

  if status == "running" then
    if game.tick - task.started_tick > (task.timeout_ticks or DEFAULT_TIMEOUT) then
      task.error = string.format(
        "timeout after %d ticks at %.1f,%.1f", game.tick - task.started_tick,
        b.position.x, b.position.y)
      status = "failed"
    else
      return
    end
  end

  finish(a, task, status)
end

local function drive()
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a then drive_agent(a) end
  end
end

-- Second belt: even a bug in the queue bookkeeping itself must not take the
-- server down mid-session.
script.on_event(defines.events.on_tick, function()
  local ok, err = pcall(drive)
  if not ok then
    log("ai-bridge: internal error in the drive loop: " .. tostring(err))
    for _, name in ipairs(storage.order) do
      local a = storage.agents[name]
      if a and a.current then
        a.current.error = "internal error: " .. tostring(err)
        pcall(finish, a, a.current, "failed")
        a.current = nil
      end
    end
  end
end)

-- The pathfinder answers asynchronously. Park the answer under its request id
-- and let whichever task asked for it pick it up on its next step; that keeps
-- nested walks (a mine task walking to its ore) working without extra wiring.
script.on_event(defines.events.on_script_path_request_finished, function(event)
  -- `try_again_later` is not a failure: the pathfinder was busy, which happens
  -- constantly on long walks. Treating it as "unreachable" is how an agent
  -- gives up on a patch it could have walked to.
  storage.paths[event.id] = {
    path = event.path or false,
    try_again_later = event.try_again_later or false,
    tick = event.tick,
  }
end)

-- There is no API to cancel a path request, so an answer whose task was
-- cancelled, timed out or died has nobody left to collect it. Waypoint lists are
-- kilobytes each, and `storage` is not only saved but also shipped to every
-- player who joins, so an uncollected answer leaks into join times.
script.on_nth_tick(600, function()
  for id, entry in pairs(storage.paths) do
    if game.tick - entry.tick > PATH_ANSWER_TTL then
      storage.paths[id] = nil
    end
  end
end)

-- Chat is the command channel: the human types, the agents read it on their next
-- poll and answer with `say`. Kept as a small ring so the log never grows.
script.on_event(defines.events.on_console_chat, function(event)
  if not event.player_index then return end
  local player = game.get_player(event.player_index)
  if not player then return end
  table.insert(storage.chat, { tick = event.tick, player = player.name, message = event.message })
  while #storage.chat > CHAT_HISTORY do
    table.remove(storage.chat, 1)
  end
end)

--------------------------------------------------------------- observation

-- Aggregated, not enumerated. An LLM does not need 4,000 ore tiles; it needs
-- "iron ore: 812 tiles, 96k units, nearest at (34,-12)".
local function observe(name, opts)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  opts = opts or {}
  -- An observe runs entirely inside one tick, and a console command is
  -- replicated to every peer, so an unbounded scan freezes the humans too.
  local radius = math.min(opts.radius or 64, MAX_OBSERVE_RADIUS)
  local surface, origin = b.surface, b.position

  local resources = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = origin, radius = radius, type = "resource",
  }) do
    local r = resources[e.name]
    if not r then
      r = { tiles = 0, amount = 0, nearest = nil, nearest_dist = math.huge }
      resources[e.name] = r
    end
    r.tiles = r.tiles + 1
    r.amount = r.amount + e.amount
    local d = Tasks.dist(origin, e.position)
    if d < r.nearest_dist then
      r.nearest_dist = d
      r.nearest = { x = e.position.x, y = e.position.y }
    end
  end
  for _, r in pairs(resources) do
    r.nearest_dist = math.floor(r.nearest_dist * 10) / 10
  end

  -- Filter by force in the engine rather than walking every tree, rock and
  -- dropped item in the radius and asking each one what it is.
  local buildings = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = origin, radius = radius, force = b.force,
  }) do
    if e.type ~= "character" and e.type ~= "resource" then
      local entry = buildings[e.name]
      if not entry then
        entry = { count = 0, nearest = nil, nearest_dist = math.huge }
        buildings[e.name] = entry
      end
      entry.count = entry.count + 1
      local d = Tasks.dist(origin, e.position)
      if d < entry.nearest_dist then
        entry.nearest_dist = d
        entry.nearest = { x = e.position.x, y = e.position.y }
      end
    end
  end
  for _, entry in pairs(buildings) do
    entry.nearest_dist = math.floor(entry.nearest_dist * 10) / 10
  end

  local hostiles = #surface.find_entities_filtered {
    position = origin, radius = radius, force = "enemy",
  }

  -- Who else is nearby: the humans watching, and the other agents working.
  local humans, mates = {}, {}
  for _, p in pairs(game.connected_players) do
    humans[#humans + 1] = {
      name = p.name,
      spectating = p.character == nil,
      x = p.position.x, y = p.position.y,
      distance = math.floor(Tasks.dist(origin, p.position) * 10) / 10,
    }
  end
  for _, other in ipairs(storage.order) do
    local o = storage.agents[other]
    local ob = body(o)
    if ob and other ~= name then
      mates[#mates + 1] = {
        name = other, x = ob.position.x, y = ob.position.y,
        distance = math.floor(Tasks.dist(origin, ob.position) * 10) / 10,
        busy = o.current ~= nil,
      }
    end
  end

  return {
    tick = game.tick,
    agent = name,
    position = { x = origin.x, y = origin.y },
    radius = radius,
    resources = resources,
    buildings = buildings,
    hostiles = hostiles,
    humans = humans,
    agents = mates,
  }
end

local function inventory(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local inv = b.get_main_inventory()
  local out = {}
  if inv then
    -- 2.0 returns an array of {name, count, quality}; normalise to name -> count.
    for _, stack in pairs(inv.get_contents()) do
      out[stack.name] = (out[stack.name] or 0) + stack.count
    end
  end
  -- What could be hand-crafted right now, counting intermediates. Guessing this
  -- from the raw item list means re-deriving every recipe tree in the agent;
  -- the game already knows, and it knows about research too.
  local craftable = {}
  for _, recipe in ipairs(PLANNING_RECIPES) do
    if prototypes.recipe[recipe] then
      local ok, count = pcall(function() return b.get_craftable_count(recipe) end)
      craftable[recipe] = (ok and count) or 0
    end
  end

  return {
    agent = name, items = out, craftable = craftable,
    health = b.health, x = b.position.x, y = b.position.y,
  }
end

local function agent_status(name)
  local a = agent(name)
  if not a then return { error = "no such agent: " .. tostring(name) } end
  local b = body(a)
  local queued = {}
  for _, t in ipairs(a.queue) do queued[#queued + 1] = { id = t.id, type = t.type } end
  return {
    name = name,
    alive = b ~= nil,
    x = b and b.position.x or nil,
    y = b and b.position.y or nil,
    health = b and b.health or nil,
    force = b and b.force.name or nil,
    labelled = (a.label ~= nil and a.label.valid) or false,
    on_map = (a.tag ~= nil and a.tag.valid) or false,
    current = a.current and {
      id = a.current.id, type = a.current.type,
      elapsed = game.tick - a.current.started_tick,
    } or nil,
    queued = queued,
  }
end

------------------------------------------------------------------- tasks

-- `Tasks` also exports helpers like dist/halt, which are functions, not
-- handlers. Checking truthiness alone would accept "halt" as a task type and
-- fail later with "attempt to index a function value".
local function handler_for(task_type)
  local handler = Tasks[task_type]
  if type(handler) == "table" and handler.start and handler.step then return handler end
  return nil
end

local function make_task(task_type, params)
  local task = {
    id = storage.next_id,
    type = task_type,
    params = params or {},
    state = {},
    timeout_ticks = (params and params.timeout_ticks) or DEFAULT_TIMEOUT,
  }
  storage.next_id = storage.next_id + 1
  return task
end

------------------------------------------------------------------- interface

local function spawn_at(name, force_name, position, adopt)
  local surface = game.surfaces[1]
  local character = adopt

  if not character then
    local pos = surface.find_non_colliding_position("character", position, 60, 1)
    if not pos then return { error = "no free space to spawn a character" } end
    -- Create before destroying anything: if this throws, an existing agent
    -- keeps the character it already had instead of losing it to a typo.
    local ok, fresh = pcall(function()
      return surface.create_entity { name = "character", position = pos, force = force_name }
    end)
    if not ok or not fresh then
      return { error = "could not create character: " .. tostring(fresh) }
    end
    character = fresh
  end

  local existing = agent(name)
  if existing then
    local old = body(existing)
    if old and old ~= character then old.destroy() end
    drop_queue(existing, "agent respawned")
    drop_marker(existing)
    existing.char, existing.current = character, nil
  else
    storage.next_index = (storage.next_index or 0) + 1
    storage.agents[name] = {
      name = name, char = character, queue = {}, current = nil,
      index = storage.next_index,
    }
    table.insert(storage.order, name)
  end
  pcall(refresh_marker, storage.agents[name])

  return {
    name = name,
    unit_number = character.unit_number,
    x = character.position.x, y = character.position.y,
    force = character.force.name,
  }
end

remote.add_interface("ai", {
  -- Add an agent. Same force as the humans by default, so everyone shares
  -- research, map and buildings.
  spawn = function(name, force_name)
    name = tostring(name or "agent")
    force_name = force_name or "player"
    if not game.forces[force_name] then
      return { error = "no such force: " .. force_name }
    end
    if not storage.agents[name] and #storage.order >= MAX_AGENTS then
      return { error = "too many agents (max " .. MAX_AGENTS .. ")" }
    end

    -- Start new agents next to whoever is around, so they appear where the
    -- action is rather than at the origin.
    local anchor = { 0, 0 }
    for _, p in pairs(game.connected_players) do
      anchor = p.position
      break
    end
    for _, other in ipairs(storage.order) do
      local ob = body(storage.agents[other])
      if ob then
        anchor = ob.position
        break
      end
    end
    return spawn_at(name, force_name, anchor, nil)
  end,

  remove = function(name)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    drop_marker(a)
    local b = body(a)
    if b then b.destroy() end
    drop_queue(a, "agent removed")
    storage.agents[name] = nil
    for index, other in ipairs(storage.order) do
      if other == name then
        table.remove(storage.order, index)
        break
      end
    end
    return { removed = name, remaining = #storage.order }
  end,

  list = function()
    local out = {}
    for _, name in ipairs(storage.order) do
      out[#out + 1] = agent_status(name)
    end
    return { agents = out, tick = game.tick, count = #out }
  end,

  status = agent_status,
  observe = observe,
  inventory = inventory,

  submit = function(name, task_type, params)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    if not handler_for(task_type) then
      return { error = "unknown task type: " .. tostring(task_type) }
    end
    if #a.queue >= MAX_QUEUE then
      return { error = "queue is full (" .. MAX_QUEUE .. "); cancel or wait" }
    end
    local task = make_task(task_type, params)
    table.insert(a.queue, task)
    return { id = task.id, agent = name, queued = #a.queue }
  end,

  -- Queue a whole plan in one round trip. All or nothing: a plan that is
  -- rejected must not leave the character already walking its first two steps.
  submit_many = function(name, list)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    list = list or {}
    if #a.queue + #list > MAX_QUEUE then
      return { error = "queue would overflow (" .. MAX_QUEUE .. " max)" }
    end
    for index, item in ipairs(list) do
      if not handler_for(item.type) then
        return { error = string.format("step %d: unknown task type: %s", index, tostring(item.type)) }
      end
    end
    local ids = {}
    for _, item in ipairs(list) do
      local task = make_task(item.type, item.params)
      table.insert(a.queue, task)
      ids[#ids + 1] = task.id
    end
    return { ids = ids, agent = name }
  end,

  poll = function(id)
    if storage.results[id] then return storage.results[id] end
    for _, name in ipairs(storage.order) do
      local a = storage.agents[name]
      if a.current and a.current.id == id then
        return { id = id, agent = name, status = "running", type = a.current.type,
                 elapsed = game.tick - a.current.started_tick }
      end
      for _, t in ipairs(a.queue) do
        if t.id == id then return { id = id, agent = name, status = "queued", type = t.type } end
      end
    end
    return { id = id, status = "unknown" }
  end,

  cancel = function(name)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    local dropped = #a.queue
    drop_queue(a, "cancelled")
    if a.current then
      a.current.error = "cancelled"
      finish(a, a.current, "failed")
      dropped = dropped + 1
    else
      local b = body(a)
      if b then
        Tasks.halt(b)
        b.mining_state = { mining = false }
      end
    end
    return { agent = name, cancelled = dropped }
  end,

  cancel_all = function()
    local total = 0
    for _, name in ipairs(storage.order) do
      total = total + (remote.call("ai", "cancel", name).cancelled or 0)
    end
    return { cancelled = total, agents = #storage.order }
  end,

  give = function(name, items)
    local a = agent(name)
    local b = body(a)
    if not b then return { error = "no such agent: " .. tostring(name) } end
    for item, count in pairs(items or {}) do b.insert { name = item, count = count } end
    return inventory(name)
  end,

  -- Look at what is actually standing on a spot. Automation needs this: a
  -- mining drill decides for itself which tile it drops ore onto, so the chest
  -- has to go where the drill says, not where we guessed.
  inspect = function(x, y, radius)
    local out = {}
    for _, e in pairs(game.surfaces[1].find_entities_filtered {
      position = { x, y }, radius = radius or 2, limit = 8,
    }) do
      if e.type ~= "character" and e.type ~= "resource" then
        local info = {
          name = e.name, type = e.type, direction = e.direction,
          x = e.position.x, y = e.position.y,
        }
        local ok, drop = pcall(function() return e.drop_position end)
        if ok and drop then
          info.drop_x, info.drop_y = drop.x, drop.y
        end
        -- Enough to answer "is this thing actually running?" without guessing
        -- from the outside.
        pcall(function() info.energy = e.energy end)
        pcall(function() info.network = e.electric_network_id end)
        pcall(function() info.status = e.status end)
        out[#out + 1] = info
      end
    end
    return { entities = out }
  end,

  -- The recipe and technology graphs, read straight from the game.
  --
  -- A planner aiming at a rocket cannot carry a hand-written ladder: the chain
  -- from ore to silo is hundreds of steps long, and any step transcribed by
  -- hand is a step that can be wrong. The game already holds the whole graph,
  -- including what research has unlocked, so the planner walks that instead.
  recipe = function(name)
    local proto = prototypes.recipe[name]
    if not proto then return { error = "no such recipe: " .. tostring(name) } end

    local ingredients, products = {}, {}
    for _, item in pairs(proto.ingredients) do
      ingredients[#ingredients + 1] = { name = item.name, amount = item.amount, type = item.type }
    end
    for _, item in pairs(proto.products) do
      products[#products + 1] = {
        name = item.name, amount = item.amount or item.amount_max, type = item.type,
      }
    end

    local force = game.forces["player"]
    return {
      name = proto.name,
      category = proto.category,
      energy = proto.energy,
      ingredients = ingredients,
      products = products,
      -- `enabled` is per force: a recipe exists from the start but may be
      -- locked behind research.
      enabled = force.recipes[name] and force.recipes[name].enabled or false,
      hand_craftable = proto.category == "crafting",
    }
  end,

  technology = function(name)
    local force = game.forces["player"]
    local tech = force.technologies[name]
    if not tech then return { error = "no such technology: " .. tostring(name) } end

    local prerequisites, packs = {}, {}
    for key in pairs(tech.prerequisites) do prerequisites[#prerequisites + 1] = key end
    for _, unit in pairs(tech.research_unit_ingredients) do
      packs[#packs + 1] = { name = unit.name, amount = unit.amount }
    end
    table.sort(prerequisites)

    local unlocks = {}
    for _, effect in pairs(tech.prototype.effects or {}) do
      if effect.type == "unlock-recipe" then unlocks[#unlocks + 1] = effect.recipe end
    end

    -- 2.0 gates the earliest technologies behind an action rather than science
    -- packs: electronics wants ten copper plates crafted, steam power fifty
    -- iron ones. An agent that only knows about labs can never start.
    local trigger = tech.prototype.research_trigger
    local trigger_info = nil
    if trigger then
      trigger_info = { type = trigger.type, count = trigger.count or 1 }
      if trigger.item then
        trigger_info.item = type(trigger.item) == "string" and trigger.item or trigger.item.name
      end
      if trigger.entity then trigger_info.entity = trigger.entity end
      if trigger.fluid then trigger_info.fluid = trigger.fluid end
    end

    return {
      name = tech.name,
      researched = tech.researched,
      enabled = tech.enabled,
      prerequisites = prerequisites,
      packs = packs,
      count = tech.research_unit_count,
      unlocks = unlocks,
      trigger = trigger_info,
    }
  end,

  -- Everything that could be started right now: prerequisites met, not yet
  -- researched. The planner picks from here instead of guessing tech names.
  available_research = function()
    local force = game.forces["player"]
    local out = {}
    for name, tech in pairs(force.technologies) do
      if tech.enabled and not tech.researched then
        local ready = true
        for _, prereq in pairs(tech.prerequisites) do
          if not prereq.researched then ready = false break end
        end
        if ready then
          local packs = {}
          for _, unit in pairs(tech.research_unit_ingredients) do
            packs[#packs + 1] = { name = unit.name, amount = unit.amount }
          end
          local trigger = tech.prototype.research_trigger
          out[#out + 1] = {
            name = name,
            count = tech.research_unit_count,
            packs = packs,
            trigger_type = trigger and trigger.type or nil,
            trigger_item = trigger and trigger.item
              and (type(trigger.item) == "string" and trigger.item or trigger.item.name) or nil,
            trigger_count = trigger and (trigger.count or 1) or nil,
          }
        end
      end
    end
    table.sort(out, function(a, b) return a.name < b.name end)
    return { available = out }
  end,

  -- Which technology unlocks a recipe, so the planner can ask "why can I not
  -- build this yet?" without a lookup table of its own.
  unlocked_by = function(recipe_name)
    local force = game.forces["player"]
    for _, tech in pairs(force.technologies) do
      for _, effect in pairs(tech.prototype.effects or {}) do
        if effect.type == "unlock-recipe" and effect.recipe == recipe_name then
          return { technology = tech.name, researched = tech.researched }
        end
      end
    end
    return { technology = nil }
  end,

  research = function(name)
    local force = game.forces["player"]
    local tech = force.technologies[name]
    if not tech then return { error = "no such technology: " .. tostring(name) } end
    if tech.researched then return { already = true, name = name } end
    local ok, err = pcall(function() force.add_research(name) end)
    if not ok then return { error = tostring(err) } end
    return { queued = name, queue_length = #force.research_queue }
  end,

  -- Where an offshore pump could go. There is no API for "a spot on the shore",
  -- so this brute-forces it: find water, then try the four directions on the
  -- tiles around it and let the game say which placement it accepts.
  water_sites = function(x, y, radius, wanted)
    local surface = game.surfaces[1]
    local force = game.forces["player"]
    local tiles = surface.find_tiles_filtered {
      position = { x, y }, radius = math.min(radius or 120, 200),
      name = { "water", "deepwater" }, limit = 400,
    }
    if #tiles == 0 then return { sites = {}, water_found = false } end

    local sites, seen = {}, {}
    local directions = { defines.direction.north, defines.direction.east,
                         defines.direction.south, defines.direction.west }
    for _, tile in pairs(tiles) do
      for dx = -1, 1 do
        for dy = -1, 1 do
          local spot = { x = tile.position.x + dx + 0.5, y = tile.position.y + dy + 0.5 }
          local key = spot.x .. ":" .. spot.y
          if not seen[key] then
            seen[key] = true
            for _, direction in ipairs(directions) do
              if surface.can_place_entity {
                name = "offshore-pump", position = spot, direction = direction,
                force = force, build_check_type = defines.build_check_type.manual,
              } then
                sites[#sites + 1] = { x = spot.x, y = spot.y, direction = direction }
                break
              end
            end
          end
          if #sites >= (wanted or 3) then
            return { sites = sites, water_found = true }
          end
        end
      end
    end
    return { sites = sites, water_found = true, water_tiles = #tiles }
  end,

  research_status = function()
    local force = game.forces["player"]
    local queue = {}
    for _, tech in pairs(force.research_queue or {}) do queue[#queue + 1] = tech.name end
    local labs = #game.surfaces[1].find_entities_filtered { name = "lab", force = force }
    return {
      current = force.current_research and force.current_research.name or nil,
      progress = force.research_progress,
      queue = queue,
      labs = labs,
    }
  end,

  -- Force a save right now, over the file the server is running.
  save = function()
    local ok, err = pcall(function() game.server_save() end)
    if not ok then return { error = tostring(err) } end
    storage.last_save_tick = game.tick
    return { saved = true, tick = game.tick }
  end,

  save_status = function()
    return {
      tick = game.tick,
      last_save_tick = storage.last_save_tick,
      ticks_since_save = storage.last_save_tick and (game.tick - storage.last_save_tick) or nil,
      interval = AUTOSAVE_INTERVAL,
    }
  end,

  chat = function(since_tick)
    local out = {}
    for _, line in ipairs(storage.chat) do
      if not since_tick or line.tick > since_tick then out[#out + 1] = line end
    end
    return { tick = game.tick, messages = out }
  end,

  say = function(text, who)
    game.print("[" .. tostring(who or "AI") .. "] " .. tostring(text))
    return { said = text, tick = game.tick }
  end,

  -- Put a human into the observer seat. Their character does not have to be
  -- thrown away: handing it to a new agent keeps the inventory and gives the
  -- watcher one more worker instead of a corpse standing in the field.
  spectate = function(player_name, adopt_as)
    local p = game.get_player(player_name)
    if not p then return { error = "no such player: " .. tostring(player_name) } end

    local vacated = p.character
    local ok = pcall(function()
      p.set_controller { type = defines.controllers.spectator }
    end)
    if not ok then
      -- Older or restricted setups: god mode still detaches the body and lets
      -- the camera move freely.
      local fallback = pcall(function()
        p.set_controller { type = defines.controllers.god }
      end)
      if not fallback then return { error = "could not switch controller" } end
    end

    local adopted = nil
    if vacated and vacated.valid then
      if adopt_as then
        local result = spawn_at(tostring(adopt_as), vacated.force.name, vacated.position, vacated)
        if result.error then return result end
        adopted = result.name
      else
        vacated.destroy()
      end
    end
    return { player = player_name, spectating = true, adopted = adopted }
  end,

  unspectate = function(player_name)
    local p = game.get_player(player_name)
    if not p then return { error = "no such player: " .. tostring(player_name) } end
    if p.character then return { player = player_name, spectating = false } end

    local surface = game.surfaces[1]
    local pos = surface.find_non_colliding_position("character", p.position, 60, 1)
    if not pos then return { error = "no free space to place a character" } end
    local ok, character = pcall(function()
      return surface.create_entity { name = "character", position = pos, force = p.force }
    end)
    if not ok or not character then
      return { error = "could not create character: " .. tostring(character) }
    end
    p.set_controller { type = defines.controllers.character, character = character }
    return { player = player_name, spectating = false, x = pos.x, y = pos.y }
  end,
})

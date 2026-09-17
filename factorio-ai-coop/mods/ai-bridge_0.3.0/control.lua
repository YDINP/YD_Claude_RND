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
local DEFAULT_TIMEOUT = 3600   -- ticks (60s) before a task is abandoned
local MAX_QUEUE = 64           -- per agent; refuse work rather than grow forever
local MAX_AGENTS = 8
local MAX_OBSERVE_RADIUS = 200 -- one observe runs inside a single tick
local PATH_ANSWER_TTL = 1800   -- ticks an uncollected path answer may linger
local CHAT_HISTORY = 50

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
  storage.paths[event.id] = { path = event.path or false, tick = event.tick }
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
  return { agent = name, items = out, health = b.health, x = b.position.x, y = b.position.y }
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
    existing.char, existing.current = character, nil
  else
    storage.agents[name] = { name = name, char = character, queue = {}, current = nil }
    table.insert(storage.order, name)
  end

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
        out[#out + 1] = info
      end
    end
    return { entities = out }
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

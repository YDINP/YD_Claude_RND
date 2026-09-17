-- ai-bridge: lets an external agent (Claude, Codex, ...) play Factorio as a
-- character in an ordinary multiplayer game, alongside human players.
--
-- Why a mod at all, when RCON can already run Lua? Because a console command
-- lives for exactly one tick. Walking, mining and crafting are things that
-- happen *over* ticks, and only a mod can hold an on_tick handler across a
-- save/load. So the split is:
--
--   agent  -> RCON -> remote.call("ai", "submit", ...)   intent, once
--   mod    -> on_tick state machine                      execution, every tick
--   agent  -> RCON -> remote.call("ai", "poll", id)      result, when ready
--
-- Nothing but plain data and entity references goes into `storage`, which is
-- what keeps the world saveable while the agent is attached.

local Tasks = require("tasks")

local RESULT_HISTORY = 64      -- completed tasks kept for polling
local DEFAULT_TIMEOUT = 3600   -- ticks (60s) before a task is abandoned
local MAX_QUEUE = 64           -- refuse work rather than grow storage forever
local MAX_OBSERVE_RADIUS = 200 -- one observe runs inside a single tick
local PATH_ANSWER_TTL = 1800   -- ticks an uncollected path answer may linger

--------------------------------------------------------------------- storage

local function init()
  storage.bot = storage.bot or nil
  storage.queue = storage.queue or {}
  storage.current = storage.current or nil
  storage.results = storage.results or {}
  storage.result_order = storage.result_order or {}
  storage.paths = storage.paths or {}
  storage.chat = storage.chat or {}
  storage.next_id = storage.next_id or 1
end

local CHAT_HISTORY = 50

script.on_init(init)
script.on_configuration_changed(init)

local function bot()
  if storage.bot and storage.bot.valid then return storage.bot end
  return nil
end

--------------------------------------------------------------------- results

local function archive(task, status)
  storage.results[task.id] = {
    id = task.id,
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
-- record the result" across six call sites is how a cancelled task leaves the
-- character walking away while the next one tries to craft.
local function finish(task, status)
  local b = bot()
  if b then
    pcall(function()
      Tasks.halt(b)
      b.mining_state = { mining = false }
    end)
  end
  archive(task, status)
  storage.current = nil
end

--------------------------------------------------------------------- the loop

local function drive()
  local b = bot()
  if not b then
    if storage.current then
      storage.current.error = "character died or was removed"
      finish(storage.current, "failed")
    end
    -- Nothing can run without a character, so do not let the queue sit there
    -- answering "queued" to an agent that will wait forever.
    for _, pending in ipairs(storage.queue) do
      pending.error = "character died or was removed"
      archive(pending, "failed")
    end
    storage.queue = {}
    return
  end

  if not storage.current then
    storage.current = table.remove(storage.queue, 1)
    if not storage.current then return end
    storage.current.started_tick = game.tick
  end

  local task = storage.current
  local handler = Tasks[task.type]
  local ctx = { bot = b, task = task, surface = b.surface, tick = game.tick }

  -- A raw Lua error inside on_tick does not just fail the task: Factorio tears
  -- the whole server down with "multiplayer error", dropping the humans who are
  -- playing with the agent. An agent that can pass a bad recipe name must not be
  -- able to do that, so every handler runs under pcall and errors become
  -- ordinary task failures.
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

  finish(task, status)
end

-- Second belt: even a bug in the queue bookkeeping itself must not take the
-- server down mid-session.
script.on_event(defines.events.on_tick, function()
  local ok, err = pcall(drive)
  if not ok then
    log("ai-bridge: dropping task after internal error: " .. tostring(err))
    if storage.current then
      storage.current.error = "internal error: " .. tostring(err)
      pcall(finish, storage.current, "failed")
    end
    storage.current = nil
  end
end)

-- The pathfinder answers asynchronously. Park the answer under its request id
-- and let whichever task asked for it pick it up on its next step; that keeps
-- nested walks (a mine task walking to its ore) working without extra wiring.
script.on_event(defines.events.on_script_path_request_finished, function(event)
  storage.paths[event.id] = { path = event.path or false, tick = event.tick }
end)

-- There is no API to cancel a path request, so an answer whose task was
-- cancelled, timed out or died has nobody left to collect it. Waypoint lists
-- are kilobytes each, and `storage` is not only saved but also shipped to every
-- player who joins, so an uncollected answer is a slow leak into join times.
script.on_nth_tick(600, function()
  for id, entry in pairs(storage.paths) do
    if game.tick - entry.tick > PATH_ANSWER_TTL then
      storage.paths[id] = nil
    end
  end
end)

-- Chat is the coop channel: the human types, the agent reads it on its next
-- poll and answers with `say`. Kept as a small ring so the log never grows.
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
local function observe(opts)
  local b = bot()
  if not b then return { error = "no character" } end
  opts = opts or {}
  -- An observe runs entirely inside one tick, and a console command is
  -- replicated to every peer, so an unbounded scan freezes the humans too.
  local radius = math.min(opts.radius or 64, MAX_OBSERVE_RADIUS)
  local surface = b.surface
  local origin = b.position

  local resources = {}
  for _, e in pairs(surface.find_entities_filtered { position = origin, radius = radius, type = "resource" }) do
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

  local humans = {}
  for _, p in pairs(game.connected_players) do
    if p.character then
      humans[#humans + 1] = {
        name = p.name,
        x = p.character.position.x,
        y = p.character.position.y,
        distance = math.floor(Tasks.dist(origin, p.character.position) * 10) / 10,
      }
    end
  end

  return {
    tick = game.tick,
    position = { x = origin.x, y = origin.y },
    radius = radius,
    resources = resources,
    buildings = buildings,
    hostiles = hostiles,
    humans = humans,
  }
end

local function inventory()
  local b = bot()
  if not b then return { error = "no character" } end
  local inv = b.get_main_inventory()
  local out = {}
  if inv then
    -- 2.0 returns an array of {name, count, quality}; normalise to name -> count.
    for _, stack in pairs(inv.get_contents()) do
      out[stack.name] = (out[stack.name] or 0) + stack.count
    end
  end
  return { items = out, health = b.health, x = b.position.x, y = b.position.y }
end

------------------------------------------------------------------- interface

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

local function submit(task_type, params)
  if not handler_for(task_type) then
    return { error = "unknown task type: " .. tostring(task_type) }
  end
  if #storage.queue >= MAX_QUEUE then
    return { error = "queue is full (" .. MAX_QUEUE .. "); cancel or wait" }
  end
  local task = make_task(task_type, params)
  table.insert(storage.queue, task)
  return { id = task.id, queued = #storage.queue }
end

remote.add_interface("ai", {
  -- Create the agent's character. Same force as the humans by default, so the
  -- two of you share research, map and buildings.
  spawn = function(force_name)
    force_name = force_name or "player"
    if not game.forces[force_name] then
      return { error = "no such force: " .. tostring(force_name) }
    end

    local surface = game.surfaces[1]
    local anchor = { 0, 0 }
    for _, p in pairs(game.connected_players) do
      if p.character then
        anchor = p.character.position
        break
      end
    end
    local pos = surface.find_non_colliding_position("character", anchor, 60, 1)
    if not pos then
      return { error = "no free space to spawn a character" }
    end

    -- Create before destroying. If this throws, the agent keeps the character
    -- it already had instead of losing it and its inventory to a typo.
    local ok, fresh = pcall(function()
      return surface.create_entity { name = "character", position = pos, force = force_name }
    end)
    if not ok or not fresh then
      return { error = "could not create character: " .. tostring(fresh) }
    end

    local previous = bot()
    if previous then previous.destroy() end

    storage.bot = fresh
    storage.queue, storage.current = {}, nil
    return { unit_number = fresh.unit_number, x = pos.x, y = pos.y, force = fresh.force.name }
  end,

  despawn = function()
    local b = bot()
    if b then b.destroy() end
    storage.bot, storage.queue, storage.current = nil, {}, nil
    return { ok = true }
  end,

  submit = submit,

  -- Queue a whole plan in one round trip; the agent polls the last id.
  -- All or nothing: a plan that is rejected must not leave the character
  -- already walking the first two steps of it.
  submit_many = function(list)
    list = list or {}
    if #storage.queue + #list > MAX_QUEUE then
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
      table.insert(storage.queue, task)
      ids[#ids + 1] = task.id
    end
    return { ids = ids }
  end,

  poll = function(id)
    if storage.results[id] then return storage.results[id] end
    if storage.current and storage.current.id == id then
      return { id = id, status = "running", type = storage.current.type,
               elapsed = game.tick - storage.current.started_tick }
    end
    for _, t in ipairs(storage.queue) do
      if t.id == id then return { id = id, status = "queued", type = t.type } end
    end
    return { id = id, status = "unknown" }
  end,

  cancel_all = function()
    local dropped = #storage.queue
    for _, pending in ipairs(storage.queue) do
      pending.error = "cancelled"
      archive(pending, "failed")
    end
    storage.queue = {}

    if storage.current then
      storage.current.error = "cancelled"
      finish(storage.current, "failed")
      dropped = dropped + 1
    else
      local b = bot()
      if b then
        Tasks.halt(b)
        b.mining_state = { mining = false }
      end
    end
    return { cancelled = dropped }
  end,

  status = function()
    local b = bot()
    local queued = {}
    for _, t in ipairs(storage.queue) do queued[#queued + 1] = { id = t.id, type = t.type } end
    return {
      tick = game.tick,
      alive = b ~= nil,
      x = b and b.position.x or nil,
      y = b and b.position.y or nil,
      health = b and b.health or nil,
      current = storage.current and {
        id = storage.current.id, type = storage.current.type,
        elapsed = game.tick - storage.current.started_tick,
      } or nil,
      queued = queued,
      players_online = #game.connected_players,
    }
  end,

  observe = observe,
  inventory = inventory,

  -- Read what the humans have been saying since a given tick.
  chat = function(since_tick)
    local out = {}
    for _, line in ipairs(storage.chat) do
      if not since_tick or line.tick > since_tick then out[#out + 1] = line end
    end
    return { tick = game.tick, messages = out }
  end,

  -- Speak into the shared chat so the humans can see what the agent is doing.
  say = function(text)
    game.print("[AI] " .. tostring(text))
    return { said = text, tick = game.tick }
  end,

  -- Testing convenience. Real play should craft or mine instead.
  give = function(items)
    local b = bot()
    if not b then return { error = "no character" } end
    for name, count in pairs(items or {}) do b.insert { name = name, count = count } end
    return inventory()
  end,
})

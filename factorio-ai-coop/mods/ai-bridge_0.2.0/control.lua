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

--------------------------------------------------------------------- the loop

local function drive()
  local b = bot()
  if not b then
    if storage.current then
      storage.current.error = "character died or was removed"
      archive(storage.current, "failed")
      storage.current = nil
    end
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
    pcall(function()
      Tasks.halt(b)
      b.mining_state = { mining = false }
    end)
    task.error = "lua error: " .. tostring(status)
    status = "failed"
  end

  if status == "running" then
    if game.tick - task.started_tick > (task.timeout_ticks or DEFAULT_TIMEOUT) then
      Tasks.halt(b)
      b.mining_state = { mining = false }
      task.error = string.format(
        "timeout after %d ticks at %.1f,%.1f", game.tick - task.started_tick,
        b.position.x, b.position.y)
      status = "failed"
    else
      return
    end
  end

  archive(task, status)
  storage.current = nil
end

-- Second belt: even a bug in the queue bookkeeping itself must not take the
-- server down mid-session.
script.on_event(defines.events.on_tick, function()
  local ok, err = pcall(drive)
  if not ok then
    log("ai-bridge: dropping task after internal error: " .. tostring(err))
    storage.current = nil
  end
end)

-- The pathfinder answers asynchronously. Park the answer under its request id
-- and let whichever task asked for it pick it up on its next step; that keeps
-- nested walks (a mine task walking to its ore) working without extra wiring.
script.on_event(defines.events.on_script_path_request_finished, function(event)
  storage.paths[event.id] = event.path or false
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
  local radius = opts.radius or 64
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

  local buildings, hostiles = {}, 0
  for _, e in pairs(surface.find_entities_filtered { position = origin, radius = radius }) do
    if e.force == b.force and e.type ~= "character" and e.type ~= "resource" and e.is_entity_with_owner then
      buildings[e.name] = (buildings[e.name] or 0) + 1
    elseif e.force.name == "enemy" then
      hostiles = hostiles + 1
    end
  end

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

local function submit(task_type, params)
  if not Tasks[task_type] then
    return { error = "unknown task type: " .. tostring(task_type) }
  end
  local task = {
    id = storage.next_id,
    type = task_type,
    params = params or {},
    state = {},
    timeout_ticks = (params and params.timeout_ticks) or DEFAULT_TIMEOUT,
  }
  storage.next_id = storage.next_id + 1
  table.insert(storage.queue, task)
  return { id = task.id, queued = #storage.queue }
end

remote.add_interface("ai", {
  -- Create the agent's character. Same force as the humans by default, so the
  -- two of you share research, map and buildings.
  spawn = function(force_name)
    local surface = game.surfaces[1]
    local previous = bot()
    if previous then previous.destroy() end   -- never leave orphans behind
    local anchor = { 0, 0 }
    for _, p in pairs(game.connected_players) do
      if p.character then
        anchor = p.character.position
        break
      end
    end
    local pos = surface.find_non_colliding_position("character", anchor, 60, 1)
    storage.bot = surface.create_entity {
      name = "character", position = pos, force = force_name or "player",
    }
    storage.queue, storage.current = {}, nil
    return { unit_number = storage.bot.unit_number, x = pos.x, y = pos.y, force = storage.bot.force.name }
  end,

  despawn = function()
    local b = bot()
    if b then b.destroy() end
    storage.bot, storage.queue, storage.current = nil, {}, nil
    return { ok = true }
  end,

  submit = submit,

  -- Queue a whole plan in one round trip; the agent polls the last id.
  submit_many = function(list)
    local ids = {}
    for _, item in ipairs(list or {}) do
      local r = submit(item.type, item.params)
      if r.error then return { error = r.error, submitted = ids } end
      ids[#ids + 1] = r.id
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
    local b = bot()
    if b then
      Tasks.halt(b)
      b.mining_state = { mining = false }
    end
    local dropped = #storage.queue
    storage.queue = {}
    if storage.current then
      storage.current.error = "cancelled"
      archive(storage.current, "failed")
      storage.current = nil
    end
    return { cancelled = dropped + 1 }
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

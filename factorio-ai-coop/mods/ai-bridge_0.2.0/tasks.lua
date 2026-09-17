-- Task handlers for the AI bridge.
--
-- Every handler is a { start = fn, step = fn } pair driven by the on_tick loop
-- in control.lua. Handlers return "running", "done" or "failed", and may set
-- ctx.task.result (the payload handed back to the agent) or ctx.task.error.
--
-- Handlers never block: an agent submits a task, gets an id back immediately,
-- and polls for the result later. That gap is what lets a multi-second LLM turn
-- sit on top of a 60-tick-per-second simulation.

local M = {}

local STUCK_WINDOW = 90       -- ticks between progress checks while walking
local STUCK_EPSILON = 0.5     -- tiles of progress required per window
local PATH_WAIT_TICKS = 180   -- how long to wait for the pathfinder

--------------------------------------------------------------------- helpers

local function dist(a, b)
  local dx, dy = a.x - b.x, a.y - b.y
  return math.sqrt(dx * dx + dy * dy)
end

-- Factorio 2.0 uses 16 compass directions; north is 0, values grow clockwise.
local function direction_to(from, to)
  local dx, dy = to.x - from.x, to.y - from.y
  return math.floor(0.5 + (math.atan2(dx, -dy) / (math.pi / 8))) % 16
end

local function steer(bot, goal)
  bot.walking_state = { walking = true, direction = direction_to(bot.position, goal) }
end

local function halt(bot)
  bot.walking_state = { walking = false, direction = defines.direction.north }
end

local function count_item(bot, name)
  local inv = bot.get_main_inventory()
  return inv and inv.get_item_count(name) or 0
end

-- Shared "am I making progress?" guard. Any task that walks uses this, so a
-- character wedged against a cliff fails loudly instead of hanging forever.
local function stuck(ctx)
  local st = ctx.task.state
  if not st.probe_tick then
    st.probe_tick, st.probe_pos = ctx.tick, ctx.bot.position
    return false
  end
  if ctx.tick - st.probe_tick < STUCK_WINDOW then return false end
  local moved = dist(ctx.bot.position, st.probe_pos)
  st.probe_tick, st.probe_pos = ctx.tick, ctx.bot.position
  return moved < STUCK_EPSILON
end

M.dist = dist
M.halt = halt
M.count_item = count_item

-- Task composition: any handler that needs to be somewhere first delegates the
-- travel to walk_to, so it inherits pathfinding and stuck detection instead of
-- re-implementing a straight line that dies on the first lake.
local function approach(ctx, target, tolerance)
  local st = ctx.task.state
  local sub_ctx = function()
    return { bot = ctx.bot, task = st.sub, surface = ctx.surface, tick = ctx.tick }
  end

  if not st.sub then
    st.sub = { params = { x = target.x, y = target.y, tolerance = tolerance }, state = {} }
    return M.walk_to.start(sub_ctx())
  end

  local status = M.walk_to.step(sub_ctx())
  if status == "failed" then
    ctx.task.error = st.sub.error
    st.sub = nil
  elseif status == "done" then
    st.sub = nil
  end
  return status
end

--------------------------------------------------------------------- walk_to

M.walk_to = {
  start = function(ctx)
    local goal = { x = ctx.task.params.x, y = ctx.task.params.y }
    ctx.task.state.goal = goal
    ctx.task.state.tolerance = ctx.task.params.tolerance or 0.5

    -- Ask the game's own pathfinder. The answer arrives later, as an event.
    local proto = prototypes.entity["character"]
    ctx.task.state.path_request = ctx.surface.request_path {
      bounding_box = proto.collision_box,
      collision_mask = proto.collision_mask,
      start = ctx.bot.position,
      goal = goal,
      force = ctx.bot.force,
      radius = ctx.task.state.tolerance,
      pathfind_flags = { cache = false, low_priority = false },
    }
    ctx.task.state.requested_tick = ctx.tick
    return "running"
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot

    -- The pathfinder answers asynchronously; control.lua drops the result in
    -- storage.paths. Until it lands we walk the straight line, so open terrain
    -- costs us nothing.
    if st.path_request and not st.path and not st.path_failed then
      local answer = storage.paths[st.path_request]
      if answer ~= nil then
        storage.paths[st.path_request] = nil
        if answer then
          st.path, st.path_index = answer, 1
        else
          st.path_failed = true
        end
      elseif ctx.tick - st.requested_tick > PATH_WAIT_TICKS then
        st.path_failed = true
      else
        steer(bot, st.goal)
        return "running"
      end
    end

    local target = st.goal
    if st.path then
      local wp = st.path[st.path_index]
      if not wp then
        st.path = nil
      else
        target = wp.position
        if dist(bot.position, target) < 1.0 then
          st.path_index = st.path_index + 1
          st.probe_tick = nil       -- reaching a waypoint counts as progress
          return "running"
        end
      end
    end

    if dist(bot.position, st.goal) <= st.tolerance then
      halt(bot)
      ctx.task.result = { x = bot.position.x, y = bot.position.y }
      return "done"
    end

    if stuck(ctx) then
      halt(bot)
      ctx.task.error = string.format("stuck at %.1f,%.1f", bot.position.x, bot.position.y)
      return "failed"
    end

    steer(bot, target)
    return "running"
  end,
}

----------------------------------------------------------------------- mine

M.mine = {
  start = function(ctx)
    local p = ctx.task.params
    local found = ctx.surface.find_entities_filtered {
      position = { p.x, p.y }, radius = p.search_radius or 3,
      type = "resource", limit = 1,
    }[1]
    if not found then
      ctx.task.error = string.format("no resource near %s,%s", p.x, p.y)
      return "failed"
    end
    local st = ctx.task.state
    st.ore = found
    st.product = found.prototype.mineable_properties.products[1].name
    st.baseline = count_item(ctx.bot, st.product)
    st.want = p.count or 10
    return "running"
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot
    local gained = count_item(bot, st.product) - st.baseline

    if gained >= st.want then
      bot.mining_state = { mining = false }
      halt(bot)
      ctx.task.result = { mined = gained, item = st.product }
      return "done"
    end

    if not st.ore.valid then
      -- The patch ran out under us; step to the next tile of ore nearby.
      local next_ore = ctx.surface.find_entities_filtered {
        position = bot.position, radius = 8, type = "resource", limit = 1,
      }[1]
      if not next_ore then
        halt(bot)
        ctx.task.result = { mined = gained, item = st.product, exhausted = true }
        return "done"
      end
      st.ore, st.sub = next_ore, nil
    end

    if dist(bot.position, st.ore.position) > bot.resource_reach_distance - 0.5 then
      bot.mining_state = { mining = false }
      local travel = approach(ctx, st.ore.position, math.max(1.0, bot.resource_reach_distance - 1.0))
      if travel == "failed" then
        halt(bot)
        ctx.task.error = "cannot reach ore: " .. tostring(ctx.task.error)
        return "failed"
      end
      return "running"
    end

    halt(bot)

    -- `mining_state` is useless here: with no player driving the character the
    -- engine clears it again the same tick and nothing is ever mined. What does
    -- work is calling mine_entity, which yields one unit per call (and only
    -- returns true on the call that exhausts the tile). So we call it on a
    -- timer derived from the prototype, which reproduces hand-mining speed
    -- instead of vacuuming the patch at 60 ore/second.
    if not st.interval then
      local mining_time = st.ore.prototype.mineable_properties.mining_time
      local ok, modifier = pcall(function() return bot.character_mining_speed_modifier end)
      local speed = 0.5 * (1 + ((ok and modifier) or 0))
      st.interval = math.max(6, math.floor(60 * mining_time / speed))
    end

    if not st.last_mine or ctx.tick - st.last_mine >= st.interval then
      st.last_mine = ctx.tick
      bot.mine_entity(st.ore)
    end
    return "running"
  end,
}

---------------------------------------------------------------------- build

M.build = {
  start = function(ctx)
    local p = ctx.task.params
    if count_item(ctx.bot, p.name) < 1 then
      ctx.task.error = "no " .. tostring(p.name) .. " in inventory"
      return "failed"
    end
    ctx.task.state.spot = { x = p.x, y = p.y }
    ctx.task.state.direction = p.direction or defines.direction.north
    return "running"
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot
    local p = ctx.task.params

    if dist(bot.position, st.spot) > bot.build_distance - 0.5 then
      local travel = approach(ctx, st.spot, math.max(1.0, math.min(bot.build_distance - 1.0, 4.0)))
      if travel == "failed" then
        halt(bot)
        ctx.task.error = "cannot reach build site: " .. tostring(ctx.task.error)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    if not ctx.surface.can_place_entity {
      name = p.name, position = st.spot, direction = st.direction,
      force = bot.force, build_check_type = defines.build_check_type.manual,
    } then
      ctx.task.error = "blocked: cannot place " .. tostring(p.name)
      return "failed"
    end

    local built = ctx.surface.create_entity {
      name = p.name, position = st.spot, direction = st.direction,
      force = bot.force, raise_built = true,
    }
    if not built then
      ctx.task.error = "create_entity returned nil"
      return "failed"
    end
    bot.remove_item { name = p.name, count = 1 }
    ctx.task.result = {
      name = built.name, x = built.position.x, y = built.position.y,
      direction = built.direction, unit_number = built.unit_number,
    }
    return "done"
  end,
}

---------------------------------------------------------------------- craft

M.craft = {
  start = function(ctx)
    local p = ctx.task.params
    local started = ctx.bot.begin_crafting { count = p.count or 1, recipe = p.recipe, silent = true }
    if started == 0 then
      ctx.task.error = "cannot craft " .. tostring(p.recipe) .. " (missing ingredients or not researched)"
      return "failed"
    end
    ctx.task.state.started = started
    return "running"
  end,

  step = function(ctx)
    if ctx.bot.crafting_queue_size == 0 then
      ctx.task.result = { crafted = ctx.task.state.started, recipe = ctx.task.params.recipe }
      return "done"
    end
    return "running"
  end,
}

----------------------------------------------------------------------- wait

M.wait = {
  start = function(ctx)
    ctx.task.state.until_tick = ctx.tick + (ctx.task.params.ticks or 60)
    return "running"
  end,

  step = function(ctx)
    if ctx.tick >= ctx.task.state.until_tick then
      ctx.task.result = { waited = ctx.task.params.ticks or 60 }
      return "done"
    end
    return "running"
  end,
}

return M

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
-- Walking direction is game state, so it is covered by the multiplayer
-- checksum. atan2 would send that through the platform libm, where a Windows
-- client and a Linux server can differ by an ulp; comparisons and sign tests
-- cannot. It costs nothing to stay on the safe side of that line.
local DIAGONAL = 0.4142135623730951   -- tan(22.5 degrees)

local function direction_to(from, to)
  local dx, dy = to.x - from.x, to.y - from.y
  local ax, ay = math.abs(dx), math.abs(dy)
  local north, south = dy < 0, dy > 0
  local east, west = dx > 0, dx < 0

  if ax <= ay * DIAGONAL then
    return north and defines.direction.north or defines.direction.south
  end
  if ay <= ax * DIAGONAL then
    return east and defines.direction.east or defines.direction.west
  end
  if north and east then return defines.direction.northeast end
  if south and east then return defines.direction.southeast end
  if south and west then return defines.direction.southwest end
  if north and west then return defines.direction.northwest end
  return defines.direction.north
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
      local entry = storage.paths[st.path_request]
      if entry ~= nil then
        storage.paths[st.path_request] = nil
        if entry.path then
          st.path, st.path_index = entry.path, 1
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
    local product = found.prototype.mineable_properties.products[1]
    if product.type == "fluid" then
      -- crude oil shows up in observe() like any other resource, so the agent
      -- will try. It needs a pumpjack, not hands.
      ctx.task.error = found.name .. " cannot be hand-mined; it needs a pumpjack"
      return "failed"
    end

    local st = ctx.task.state
    st.ore = found
    st.ore_name = found.name
    st.product = product.name
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
      -- Same ore only. Without the name filter a depleted iron tile at the edge
      -- of a patch hands us a copper tile, and `gained` never moves again
      -- because it counts iron.
      local next_ore = ctx.surface.find_entities_filtered {
        position = bot.position, radius = 8, name = st.ore_name, limit = 1,
      }[1]
      if not next_ore then
        halt(bot)
        ctx.task.result = { mined = gained, item = st.product, exhausted = true }
        return "done"
      end
      st.ore, st.sub, st.interval = next_ore, nil, nil
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
    if not p.name or not prototypes.entity[p.name] then
      ctx.task.error = "no such entity: " .. tostring(p.name)
      return "failed"
    end
    if count_item(ctx.bot, p.name) < 1 then
      ctx.task.error = "no " .. tostring(p.name) .. " in inventory"
      return "failed"
    end
    ctx.task.state.direction = p.direction or defines.direction.north
    if p.snap then
      -- Caller wants "somewhere around here", not an exact tile.
      local free = ctx.surface.find_non_colliding_position(p.name, { p.x, p.y }, 16, 1)
      if not free then
        ctx.task.error = "no free spot near " .. p.x .. "," .. p.y
        return "failed"
      end
      ctx.task.state.spot = { x = free.x, y = free.y }
    else
      ctx.task.state.spot = { x = p.x, y = p.y }
    end
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
    if not p.recipe or not prototypes.recipe[p.recipe] then
      ctx.task.error = "no such recipe: " .. tostring(p.recipe)
      return "failed"
    end
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

------------------------------------------------------------ insert / take

-- Anything with an inventory: a furnace to feed, a chest to stock, a drill to
-- fuel. Without these two the agent can mine and build but never actually run
-- a production chain.
local function target_entity(ctx, p)
  local candidates = ctx.surface.find_entities_filtered {
    position = { p.x, p.y }, radius = p.search_radius or 1.5,
  }
  for _, e in pairs(candidates) do
    if e.type ~= "character" and e.type ~= "resource" and e.get_inventory ~= nil then
      return e
    end
  end
  return nil
end

M.insert = {
  start = function(ctx)
    local p = ctx.task.params
    local target = target_entity(ctx, p)
    if not target then
      ctx.task.error = string.format("nothing with an inventory at %s,%s", p.x, p.y)
      return "failed"
    end
    if count_item(ctx.bot, p.name) < 1 then
      ctx.task.error = "no " .. tostring(p.name) .. " to insert"
      return "failed"
    end
    ctx.task.state.target = target
    return "running"
  end,

  step = function(ctx)
    local st, bot, p = ctx.task.state, ctx.bot, ctx.task.params
    if not st.target.valid then
      ctx.task.error = "target disappeared"
      return "failed"
    end

    if dist(bot.position, st.target.position) > bot.reach_distance - 0.5 then
      local travel = approach(ctx, st.target.position, math.max(1.0, bot.reach_distance - 1.5))
      if travel == "failed" then
        halt(bot)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    local wanted = math.min(p.count or 1, count_item(bot, p.name))
    local moved = st.target.insert { name = p.name, count = wanted }
    if moved > 0 then bot.remove_item { name = p.name, count = moved } end
    ctx.task.result = { inserted = moved, item = p.name, into = st.target.name }
    return "done"
  end,
}

M.take = {
  start = function(ctx)
    local p = ctx.task.params
    local target = target_entity(ctx, p)
    if not target then
      ctx.task.error = string.format("nothing with an inventory at %s,%s", p.x, p.y)
      return "failed"
    end
    ctx.task.state.target = target
    return "running"
  end,

  step = function(ctx)
    local st, bot, p = ctx.task.state, ctx.bot, ctx.task.params
    if not st.target.valid then
      ctx.task.error = "target disappeared"
      return "failed"
    end

    if dist(bot.position, st.target.position) > bot.reach_distance - 0.5 then
      local travel = approach(ctx, st.target.position, math.max(1.0, bot.reach_distance - 1.5))
      if travel == "failed" then
        halt(bot)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    local taken = st.target.remove_item { name = p.name, count = p.count or 1 }
    if taken > 0 then bot.insert { name = p.name, count = taken } end
    ctx.task.result = { taken = taken, item = p.name, from = st.target.name }
    return "done"
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

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

local MAX_PATH_TRIES = 5      -- pathfinder attempts before giving up on a goal

-- 막히면 «옆으로» 비켜 간다.
--
-- 사용자: "캐릭터가 이동하다 3초동안 이동이 안되면 우회하서 갈 수 있도록
--          로직개선할 것."
--
-- 지금까지는 막히면 길찾기를 다시 불렀다. 그런데 «같은 자리»에서 «같은
-- 목적지»를 물으면 대개 같은 답이 온다. 다섯 번 묻고 실패한다.
--
-- 그리고 막은 것이 나무나 바위면 치우면 되지만(clear_obstacle), 우리
-- 벨트 줄이나 화로 벽이면 치울 수 없다. 실측: 제련구역 화로 열두 대가
-- 한 줄로 서 있고 그 남쪽에 벨트가 깔리면, 그 사이로 들어간 사람은
-- 어느 쪽으로도 못 나온다.
--
-- 옆으로 한 점을 찍고 거기부터 다시 간다. 좌우를 번갈아, 걸음을 늘려
-- 가며 - 한쪽이 막히면 반대쪽이 열린다.
local DETOUR_STEP = 6         -- 한 번에 비켜서는 거리
local DETOUR_MAX = 4          -- 이만큼 해보고 안 되면 길찾기에 맡긴다
local DETOUR_TICKS = 180      -- 우회점 하나에 매달리는 시간 (3초)
local CLEAR_REACH = 2.6       -- how close an obstacle must be to chop it
local CLEAR_INTERVAL = 12     -- ticks between swings at a tree or rock

-- Ask the game's own pathfinder. The answer arrives later, as an event, and
-- control.lua parks it under the request id.
local function request_path(ctx, resolution)
  local st = ctx.task.state
  local proto = prototypes.entity["character"]
  st.path_request = ctx.surface.request_path {
    bounding_box = proto.collision_box,
    collision_mask = proto.collision_mask,
    start = ctx.bot.position,
    goal = st.goal,
    force = ctx.bot.force,
    radius = math.max(st.tolerance, 0.5),
    path_resolution_modifier = resolution or 0,
    -- Without this the character's own collision box occupies the start tile
    -- and the pathfinder reports "no path" before it has taken a step.
    entity_to_ignore = ctx.bot,
    pathfind_flags = { cache = false, low_priority = false, allow_paths_through_own_entities = true },
  }
  st.requested_tick = ctx.tick
  st.tries = (st.tries or 0) + 1
  st.path, st.path_index, st.path_failed = nil, nil, false
  st.probe_tick = nil
  -- 새 길을 받았으면 우회 이력은 지운다. 돌아간 자리에서 다시 막히면
  -- 그때는 다시 처음부터 좌우를 번갈아 본다.
  st.detour, st.detours = nil, nil
  return "running"
end

-- 진행 방향의 «직각»으로 한 점. 좌우를 번갈아 보고, 갈수록 멀리 돈다.
--
-- 제자리 옆으로만 가면 같은 벽에 다시 붙으므로, 앞으로도 한 걸음 섞는다.
local function side_step(ctx, target)
  local st, bot = ctx.task.state, ctx.bot
  st.detours = (st.detours or 0) + 1
  if st.detours > DETOUR_MAX then return nil end

  local dx, dy = target.x - bot.position.x, target.y - bot.position.y
  local span = math.sqrt(dx * dx + dy * dy)
  if span < 0.1 then return nil end
  dx, dy = dx / span, dy / span

  local side = (st.detours % 2 == 1) and 1 or -1
  local reach = DETOUR_STEP * math.ceil(st.detours / 2)
  return {
    x = bot.position.x - dy * side * reach + dx * DETOUR_STEP,
    y = bot.position.y + dx * side * reach + dy * DETOUR_STEP,
  }
end

-- Trees and rocks are not walls; a player chops through them. Without this an
-- agent stands in a forest shoving a tree until its stuck timer fires.
local function clear_obstacle(ctx)
  local st, bot = ctx.task.state, ctx.bot

  if st.chopping and st.chopping.valid then
    if ctx.tick - (st.last_chop or 0) >= CLEAR_INTERVAL then
      st.last_chop = ctx.tick
      bot.mine_entity(st.chopping)
    end
    return true
  end
  st.chopping = nil

  local ahead = st.path and st.path[st.path_index] and st.path[st.path_index].position or st.goal
  local dx, dy = ahead.x - bot.position.x, ahead.y - bot.position.y
  local span = math.sqrt(dx * dx + dy * dy)
  if span < 0.01 then return false end
  local probe = {
    x = bot.position.x + dx / span * 1.5,
    y = bot.position.y + dy / span * 1.5,
  }

  for _, candidate in pairs(ctx.surface.find_entities_filtered {
    position = probe, radius = CLEAR_REACH,
    type = { "tree", "simple-entity" },
  }) do
    if candidate.prototype.mineable_properties.minable then
      st.chopping, st.last_chop = candidate, ctx.tick
      bot.mine_entity(candidate)
      return true
    end
  end
  return false
end

-- 가방에 빈 칸이 있는가.
--
-- 캘 때마다 물건이 가방으로 들어온다. 가방이 차면 mine_entity 는 조용히
-- false 를 돌려주고 아무 일도 안 일어난다. 그 값을 안 보면 같은 자리에서
-- 영원히 곡괭이질을 한다 - 실측(2026-09-18): 여덟 캐릭터 중 여섯이 빈 칸
-- 0 이었고, 한 명은 demolish 를 띄운 채 가만히 서 있었다.
--
-- 못 하는 일을 못 한다고 말해야 부르는 쪽이 다른 일을 한다.
local function bag_full(bot)
  local inv = bot.get_main_inventory()
  return inv ~= nil and inv.count_empty_stacks() == 0
end

M.walk_to = {
  start = function(ctx)
    ctx.task.state.goal = { x = ctx.task.params.x, y = ctx.task.params.y }
    ctx.task.state.tolerance = ctx.task.params.tolerance or 0.5
    return request_path(ctx)
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot

    if dist(bot.position, st.goal) <= st.tolerance then
      halt(bot)
      ctx.task.result = { x = bot.position.x, y = bot.position.y, tries = st.tries }
      return "done"
    end

    -- Waiting on an answer.
    if st.path_request and not st.path and not st.path_failed then
      local entry = storage.paths[st.path_request]
      if entry ~= nil then
        storage.paths[st.path_request] = nil
        if entry.path then
          st.path, st.path_index = entry.path, 1
        elseif entry.try_again_later then
          st.last_answer = 'try_again_later'
          -- The pathfinder was busy, not defeated. Long walks hit this often.
          if st.tries < MAX_PATH_TRIES then return request_path(ctx) end
          st.path_failed = true
        else
          -- Genuinely no route at this resolution. A coarser search can find
          -- one through gaps the fine search rejected.
          st.last_answer = 'no_path'
          if st.tries < MAX_PATH_TRIES then return request_path(ctx, -1) end
          halt(bot)
          ctx.task.error = string.format(
            "no path from %.1f,%.1f to %.0f,%.0f (%d tries, last=%s)",
            bot.position.x, bot.position.y, st.goal.x, st.goal.y,
            st.tries, tostring(st.last_answer))
          return "failed"
        end
      elseif ctx.tick - st.requested_tick > PATH_WAIT_TICKS then
        if st.tries < MAX_PATH_TRIES then return request_path(ctx) end
        st.path_failed = true
      else
        -- 길이 오기 전에는 걷지 않는다.
        --
        --   사용자: "이동할때 상자랑상자사이는 건너갈 수 없으니까 이동할 때
        --            이동경로를 먼저 짜고나서 이동시키도록"
        --
        -- 열두 칸 안이면 «눈 감고» 곧장 걸었다. 열린 땅에선 빨랐지만 선반은
        -- 상자 줄·팔 줄·상자 줄이 붙어 있어, 곧장 걷다 상자 사이에 몸이
        -- 끼면 그 자리에서 길찾기를 불러도 출발점부터 막힌다. 길이 올 때까지
        -- 서 있는 몇 틱이 낀 몸을 빼는 3초보다 싸다.
        halt(bot)
        return "running"
      end
    end

    local target = st.goal

    -- 우회 중이면 «우회점»이 목표다. 닿거나 3초가 지나면 푼다.
    if st.detour then
      if dist(bot.position, st.detour) < 2.0
          or ctx.tick - (st.detour_tick or 0) > DETOUR_TICKS then
        st.detour, st.probe_tick = nil, nil
      else
        steer(bot, st.detour)
        return "running"
      end
    end

    if st.path then
      local waypoint = st.path[st.path_index]
      if not waypoint then
        st.path = nil
      else
        target = waypoint.position
        if dist(bot.position, target) < 1.0 then
          st.path_index = st.path_index + 1
          st.probe_tick = nil       -- reaching a waypoint counts as progress
          return "running"
        end
      end
    end

    if stuck(ctx) then
      -- Something is in the way. Chop it, or ask for a new route from here -
      -- the old one was computed from a position we are no longer in.
      if clear_obstacle(ctx) then
        st.probe_tick = nil
        return "running"
      end

      -- 길을 따라가다 막힌 것은 «길이 낡은» 것이다 - 그 길을 잰 뒤에 누가
      -- 무언가를 세웠다. 먼저 지금 자리에서 길을 다시 잰다. 눈 감고 옆으로
      -- 비켜서는 것(side_step)은 절벽 주머니와 상자 사이로 몸을 밀어 넣어
      -- 두 번 정찰병을 가뒀다. 길찾기가 다섯 번 다 실패했을 때만 쓴다.
      if st.tries < MAX_PATH_TRIES then
        halt(bot)
        st.path, st.path_index = nil, nil
        return request_path(ctx)
      end

      local aside = side_step(ctx, st.goal)
      if aside then
        st.detour, st.detour_tick, st.probe_tick = aside, ctx.tick, nil
        st.path, st.path_index = nil, nil
        return "running"
      end
      halt(bot)
      ctx.task.error = string.format("stuck at %.1f,%.1f after %d routes",
                                     bot.position.x, bot.position.y, st.tries)
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

    -- 무엇을 캐라고 했는지 지킨다.
    --
    -- 실측(새 판 20분째): (78,46)에서 석탄 30개를 캐라고 시켰더니
    -- copper-ore 30개를 캐 왔다. 구리 광맥 432타일이 석탄 위에 겹쳐 있고,
    -- 이름 없이 type="resource" 로 찾으면 엔진이 주는 대로 집기 때문이다.
    --
    -- 그래서 「연료가 없습니다, 석탄 캐러 갑니다」가 전부 구리 채굴이
    -- 되었다. 넷이 구리만 천 개 넘게 캔 이유가 이것이다. 이름을 주면
    -- 그 광석만 찾고, 그 자리에 없으면 조금 더 넓게 본다.
    local found
    if p.name then
      for _, reach in ipairs({ p.search_radius or 3, 12, 32 }) do
        found = ctx.surface.find_entities_filtered {
          position = { p.x, p.y }, radius = reach, name = p.name, limit = 1,
        }[1]
        if found then break end
      end
      if not found then
        ctx.task.error = string.format("no %s near %s,%s", p.name, p.x, p.y)
        return "failed"
      end
    else
      found = ctx.surface.find_entities_filtered {
        position = { p.x, p.y }, radius = p.search_radius or 3,
        type = "resource", limit = 1,
      }[1]
    end
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
    if bag_full(ctx.bot) then
      ctx.task.error = "bag is full - nothing more fits"
      return "failed"
    end
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
      -- 아직 «만드는 중»일 수 있다. 걸으면서 만들게 한 값이 여기서 나온다:
      -- 손에 없다고 바로 실패하면 병렬로 만든 보람이 없다. 큐가 돌고
      -- 있으면 기다린다 - 큐가 비었는데도 없으면 그때가 진짜 실패다.
      if ctx.bot.crafting_queue_size > 0 then
        ctx.task.state.awaiting = true
        return "running"
      end
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

    -- 만들어지길 기다리던 중이었다면, 손에 들어온 뒤에 자리를 정한다.
    if st.awaiting then
      if count_item(bot, p.name) < 1 then
        if bot.crafting_queue_size > 0 then return "running" end
        ctx.task.error = "no " .. tostring(p.name) .. " in inventory"
        return "failed"
      end
      st.awaiting = nil
      st.direction = p.direction or defines.direction.north
      if p.snap then
        local free = ctx.surface.find_non_colliding_position(p.name, { p.x, p.y }, 16, 1)
        if not free then
          ctx.task.error = "no free spot near " .. p.x .. "," .. p.y
          return "failed"
        end
        st.spot = { x = free.x, y = free.y }
      else
        st.spot = { x = p.x, y = p.y }
      end
    end

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
      -- 지하벨트는 입구/출구가 있다 (p.type = "input" | "output").
      type = p.type,
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
    if bag_full(ctx.bot) then
      -- 만든 것을 넣을 칸이 없으면 만들 수 없다. 실측(2026-09-18): 여덟
      -- 캐릭터 전부 빈 칸 0 이었고 둘이 craft 에 걸린 채 서 있었다.
      ctx.task.error = "bag is full - nowhere to put what I make"
      return "failed"
    end
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

    -- 만드는 동안 «서 있을» 이유가 없다.
    --
    -- 사용자가 짚었다: "캐릭터 craft는 병렬로 처리해도 되지않나? 어짜피
    -- 생산하면서 다른거해도 되잖아"
    --
    -- 맞다. 팩토리오의 제작은 뒤에서 돌아가는 큐고, 캐릭터는 그동안
    -- 걷고 캐고 지을 수 있다. 그런데 이 단계는 큐가 빌 때까지 「running」을
    -- 돌려주며 제자리에 세워 뒀다 - 벨트 서른다섯 칸을 만드는 동안
    -- 창고 앞에 가만히 서 있었다는 뜻이다.
    --
    -- `wait = false` 면 주문만 넣고 바로 넘어간다. 걷는 동안 만들어지고,
    -- 도착할 즈음이면 손에 있다.
    if ctx.task.params.wait == false then
      ctx.task.result = { ordered = started, recipe = ctx.task.params.recipe,
                          waited = false }
      return "done"
    end
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
-- 요청한 칸에 있는 것을 고른다. 그리고 꺼낼 때는 그 물건을 실제로 가진
-- 쪽을 고른다.
--
-- 실측(672분째): 「take 실패: burner-inserter is empty of coal」 이 열 번.
-- 석탄 상자에서 꺼내려는데 한 칸 옆에 붙은 급유 인서터를 집고 있었다.
-- 반경 1.5 가 둘 다 잡고, 먼저 나오는 쪽이 이겼기 때문이다. 급유 장치가
-- 상자와 인서터를 한 칸 간격으로 세우므로 이 둘은 언제나 같이 잡힌다.
--
-- 인서터도 연료 칸이 있어서 get_inventory 를 통과한다. 「창고인가」로
-- 거르는 것보다 「요청한 자리인가, 가지고 있는가」로 고르는 편이 옳다 -
-- 화로에서 꺼내는 일도 같은 함수를 쓰기 때문이다.
--
-- 「가지고 있는가」로는 모자랐다. 16회차 실측:
--
--     부른 칸          (-70,15)
--     석탄 상자        가운데 (-69.5,15.5)  거리 0.707  석탄 1363
--     급유 인서터      가운데 (-70.5,14.5)  거리 0.707  석탄 1
--
-- 거리가 «같고» 둘 다 가산점 100을 받아 동점이 되었다. 먼저 나온 쪽이
-- 이겼고, 석탄 600개를 달라 했는데 1개를 받아 왔다. 그러고도 성공이었다.
--
-- 고르는 기준은 「가지고 있는가」가 아니라 «달라는 만큼 가지고 있는가»다.
local function target_entity(ctx, p, wants, how_many)
  local best, best_score = nil, -math.huge
  for _, e in pairs(ctx.surface.find_entities_filtered {
    position = { p.x, p.y }, radius = p.search_radius or 1.5,
  }) do
    if e.type ~= "character" and e.type ~= "resource" and e.get_inventory ~= nil then
      -- 가까울수록 높게. 요청한 칸에 정확히 선 것이 1순위다.
      local score = -dist({ x = p.x, y = p.y }, e.position)
      if wants then
        local ok, held = pcall(function() return e.get_item_count(wants) end)
        if ok and held and held > 0 then
          score = score + 100
          -- 달라는 만큼 있으면 한 번 더. 한 개짜리 인서터가 천 개짜리
          -- 상자와 동점이 되는 일을 막는 것이 이 줄의 전부다.
          if held >= (how_many or 1) then score = score + 100 end
        end
      end
      if score > best_score then best, best_score = e, score end
    end
  end
  return best
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

    -- «넣었다»와 «들어갔다»는 다른 말이다.
    --
    -- 0개를 넣고도 «done» 을 돌려주고 있었다. 부르는 쪽은 성공으로 읽고
    -- 다음 일로 넘어가므로, 안 들어간 줄을 아무도 모른다.
    --
    -- 실측(새 판 77분째): 요원 둘이 버너 인서터에 석탄을 넣으러 가서
    -- 둘 다 «오류 없이» 끝났는데 인서터 연료칸은 0이었다. 그동안 벨트는
    -- 90개로 꽉 차 있었고 채굴기 열한 대가 전부 서 있었다. 스물다섯 분을
    -- 그렇게 보냈다 - 로그에 실패가 한 줄도 없었기 때문이다.
    --
    -- 왜 0이었는지는 여기서 따지지 않는다. 다만 «0이면 0이라고 말한다».
    if moved == 0 then
      ctx.task.error = string.format("%s 0 into %s (wanted %d, had %d)",
        tostring(p.name), st.target.name, p.count or 1, count_item(bot, p.name))
      return "failed"
    end
    return "done"
  end,
}

M.take = {
  start = function(ctx)
    local p = ctx.task.params
    -- 무엇을 «몇 개» 꺼낼지 알고 있으니 둘 다 알려준다. 그러면 그만큼
    -- 가진 쪽이 뽑힌다.
    local target = target_entity(ctx, p, p.name, p.count)
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

    -- 한 개도 못 가져왔으면 실패다. 예전에는 이것도 「done」이었고, 그래서
    -- 빈 상자까지 걸어가 성공으로 친 다음 뒤따르는 insert 가 하나씩
    -- 「no coal to insert」로 무너졌다. 열 번씩 그랬다.
    --
    -- 여덟이 같은 상자를 노리므로, 계획을 세울 때 들어 있던 것이 도착할
    -- 때 남아 있으리라는 보장이 없다. 그 사실을 여기서 말해줘야 부르는
    -- 쪽이 그 상자를 잠시 접어둘 수 있다.
    if taken == 0 then
      ctx.task.error = string.format("%s is empty of %s",
        st.target.name, tostring(p.name))
      return "failed"
    end
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

---------------------------------------------------------------------- give

-- Handing materials to a crewmate. `insert` deliberately skips characters,
-- because at a position you almost always mean the furnace and not the person
-- standing next to it, so passing goods between agents needs its own task.
--
-- The recipient walks around while the courier is on its way, so the goal is
-- re-checked every step and the pinned path is thrown away once it has gone
-- stale. Without that the courier arrives where the other one used to be.

local HANDOFF_DRIFT = 6  -- tiles the recipient may wander before we re-path

local function crewmate(name)
  local a = storage.agents and storage.agents[name]
  if a and a.char and a.char.valid then return a.char end
  return nil
end

M.give = {
  start = function(ctx)
    local p = ctx.task.params
    if not crewmate(p.to) then
      ctx.task.error = "no crewmate named " .. tostring(p.to)
      return "failed"
    end
    if count_item(ctx.bot, p.name) < 1 then
      ctx.task.error = "nothing to give: no " .. tostring(p.name)
      return "failed"
    end
    return "running"
  end,

  step = function(ctx)
    local st, bot, p = ctx.task.state, ctx.bot, ctx.task.params
    local mate = crewmate(p.to)
    if not mate then
      halt(bot)
      ctx.task.error = "crewmate " .. tostring(p.to) .. " is gone"
      return "failed"
    end

    local reach = bot.reach_distance - 0.5
    if dist(bot.position, mate.position) > reach then
      if st.sub and dist(st.sub.params, mate.position) > HANDOFF_DRIFT then
        st.sub = nil
      end
      local travel = approach(ctx, mate.position, math.max(1.0, reach - 1.0))
      if travel == "failed" then
        halt(bot)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    local wanted = math.min(p.count or 1, count_item(bot, p.name))
    local moved = mate.insert { name = p.name, count = wanted }
    if moved > 0 then bot.remove_item { name = p.name, count = moved } end
    ctx.task.result = { given = moved, item = p.name, to = p.to }
    return "done"
  end,
}

---------------------------------------------------------------------- chop

-- 나무는 광맥이 아니다. mine 은 type="resource" 만 찾으므로 나무는 영영
-- 걸리지 않았고, 그래서 전봇대(나무 1 + 구리선 2)를 못 만들어 전력이
-- 막혀 있었다. 사슬은 «wood 1개가 필요하다»고 정확히 말하고 있었는데
-- 그걸 실행할 손이 없었던 셈이다.
--
-- 베는 동작 자체는 광석과 같다: 다가가서 mine_entity 를 반복한다. 다른
-- 것은 «다음 대상 찾기»뿐이라, 한 그루를 베면 다음 그루를 다시 찾는다.

local CHOP_SEARCH = 48      -- 이 반경 안에서 나무를 찾는다

local function nearest_tree(ctx, origin)
  local found = ctx.surface.find_entities_filtered {
    position = origin, radius = CHOP_SEARCH, type = "tree",
  }
  local best, best_d = nil, math.huge
  for _, tree in pairs(found) do
    if tree.valid then
      local d = dist(origin, tree.position)
      if d < best_d then best, best_d = tree, d end
    end
  end
  return best
end

M.chop = {
  start = function(ctx)
    local st, p = ctx.task.state, ctx.task.params
    st.origin = { x = p.x or ctx.bot.position.x, y = p.y or ctx.bot.position.y }
    st.wanted = p.count or 4
    st.start_wood = count_item(ctx.bot, "wood")
    st.tree = nearest_tree(ctx, st.origin)
    if not st.tree then
      ctx.task.error = string.format("no tree within %d tiles of %.0f,%.0f",
        CHOP_SEARCH, st.origin.x, st.origin.y)
      return "failed"
    end
    return "running"
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot

    local gained = count_item(bot, "wood") - st.start_wood
    if gained >= st.wanted then
      halt(bot)
      ctx.task.result = { wood = gained }
      return "done"
    end

    if not (st.tree and st.tree.valid) then
      st.tree = nearest_tree(ctx, bot.position)
      st.sub = nil
      if not st.tree then
        halt(bot)
        -- 한 그루라도 벴으면 실패가 아니다.
        if gained > 0 then
          ctx.task.result = { wood = gained }
          return "done"
        end
        ctx.task.error = "ran out of trees"
        return "failed"
      end
    end

    if dist(bot.position, st.tree.position) > bot.resource_reach_distance - 0.2 then
      local travel = approach(ctx, st.tree.position,
                              math.max(0.8, bot.resource_reach_distance - 1.0))
      if travel == "failed" then
        halt(bot)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    -- 나무는 광석과 달리 한 번에 쓰러진다. 간격은 광석과 같은 이유로
    -- 둔다 - 매 틱 mine_entity 를 부르면 엔진이 무시한다.
    if not st.next_swing or ctx.tick >= st.next_swing then
      st.next_swing = ctx.tick + 20
      local ok = pcall(function() bot.mine_entity(st.tree) end)
      if not ok then st.tree = nil end
    end
    return "running"
  end,
}

------------------------------------------------------------------ demolish

-- 우리 건물을 걷어낸다. 지금까지 에이전트는 «놓을» 줄만 알고 «치울» 줄을
-- 몰랐다. 그래서 광맥이 채굴기 오십 대로 덮여 길이 사라져도, 잘못 놓인
-- 기계가 다음 자리를 막아도 손을 못 댔다. 더하기만 할 수 있으면 실수는
-- 영원히 남는다.
--
-- 부수는 게 아니라 «캐는» 것이라 자재가 가방으로 돌아온다. 자리를 옮기는
-- 것은 이것과 build 를 이어 붙이면 된다.

M.demolish = {
  start = function(ctx)
    local p = ctx.task.params
    -- 우리 힘(force)으로 제한하면 안 된다. 우주선 잔해는 절반이 neutral 이고
    -- 바위와 나무도 그렇다. 사람이 「저거 치워」라고 할 때 그것들이 전부
    -- 빠져나가면 「부비기만」 한다.
    local found = ctx.surface.find_entities_filtered {
      position = { p.x, p.y }, radius = p.search_radius or 1.5,
    }
    local target = nil
    for _, e in pairs(found) do
      -- 광맥은 여기서 다루지 않는다. 캐는 것은 mine 의 일이고, 그쪽은
      -- 「몇 개」를 셀 줄 안다.
      if e.type ~= "character" and e.type ~= "item-entity"
          and e.type ~= "resource" and e.minable
          and (not p.name or e.name == p.name) then
        target = e
        break
      end
    end
    if not target then
      ctx.task.error = string.format("nothing of ours at %.0f,%.0f", p.x, p.y)
      return "failed"
    end
    if not target.minable then
      ctx.task.error = target.name .. " cannot be mined"
      return "failed"
    end
    ctx.task.state.target = target
    ctx.task.state.label = target.name
    return "running"
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot
    if not st.target.valid then
      -- 누가 먼저 치웠다. 실패가 아니다.
      halt(bot)
      ctx.task.result = { removed = st.label }
      return "done"
    end

    if dist(bot.position, st.target.position) > bot.resource_reach_distance - 0.2 then
      local travel = approach(ctx, st.target.position,
                              math.max(0.8, bot.resource_reach_distance - 1.0))
      if travel == "failed" then
        halt(bot)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    if bag_full(bot) then
      ctx.task.error = string.format("bag is full - cannot pick up %s",
        tostring(st.label))
      return "failed"
    end

    if not st.next_swing or ctx.tick >= st.next_swing then
      st.next_swing = ctx.tick + 12
      local ok, mined = pcall(function() return bot.mine_entity(st.target) end)
      if not ok then
        ctx.task.error = "could not mine " .. tostring(st.label)
        return "failed"
      end
      -- 곡괭이질은 여러 번 걸릴 수 있다. 다만 «몇 번을 해도 아무 일도
      -- 안 일어나는» 것은 못 하는 것이다.
      if mined == false then
        st.misses = (st.misses or 0) + 1
        if st.misses >= 5 then
          ctx.task.error = string.format("cannot mine %s (five tries, nothing moved)",
            tostring(st.label))
          return "failed"
        end
      else
        st.misses = 0
      end
    end
    return "running"
  end,
}


------------------------------------------------------------------- sweep

-- 바닥에 흩어진 것을 줍는다.
--
-- 출구가 없는 채굴기는 캔 것을 땅에 떨군다. 실측하니 채굴기 아흔두 대 중
-- 예순여덟 대가 그 상태였고, 그 앞에 화로를 놓으려 하자 can_place_entity 가
-- 전부 거절했다 - 막고 있는 것이 «item-on-ground» 였다. 바닥의 광석이 제
-- 출구를 스스로 막고 있었던 셈이다.
--
-- 그러니 줍는 것은 치우는 일이면서 동시에 거두는 일이다. 광석은 광석이다.
M.sweep = {
  start = function(ctx)
    local p = ctx.task.params
    ctx.task.state.spot = { x = p.x, y = p.y }
    ctx.task.state.reach = p.radius or 3
    ctx.task.state.taken = 0
    return "running"
  end,

  step = function(ctx)
    local st, bot = ctx.task.state, ctx.bot

    if dist(bot.position, st.spot) > bot.resource_reach_distance - 0.5 then
      local travel = approach(ctx, st.spot,
                              math.max(0.8, bot.resource_reach_distance - 1.0))
      if travel == "failed" then
        halt(bot)
        return "failed"
      end
      return "running"
    end
    halt(bot)

    -- 손이 닿는 것만 줍는다. 한 틱에 몇 개씩 - 채굴기 하나 앞에 수백 개가
    -- 쌓여 있어서, 전부 한 번에 집으면 그 틱이 길어진다.
    if bag_full(bot) then
      ctx.task.result = { swept = st.taken, full = true }
      return "done"     -- 주운 만큼은 주웠다. 나머지는 가방을 비우고 다시.
    end

    local reach = math.min(st.reach, bot.resource_reach_distance)
    local litter = ctx.surface.find_entities_filtered {
      position = bot.position, radius = reach, type = "item-entity",
    }
    if #litter == 0 then
      ctx.task.result = { swept = st.taken, x = st.spot.x, y = st.spot.y }
      return "done"
    end
    for i = 1, math.min(#litter, 16) do
      local e = litter[i]
      if e.valid and pcall(function() bot.mine_entity(e) end) then
        st.taken = st.taken + 1
      end
    end
    return "running"
  end,
}

return M

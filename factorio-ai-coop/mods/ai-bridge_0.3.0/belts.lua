-- 벨트 - 캐는 구역에서 제련 구역까지 광석을 나르는 길.
--
-- 구역을 나누면 그 사이를 잇는 일이 생긴다. 사람이 나르면 걸음마다 시간이
-- 들고 가방 크기만큼만 나른다. 벨트는 한 번 깔면 자지도 않고 쉬지도 않는다.
-- 노란 벨트 한 줄이 초당 15개를 나르는데, 그것은 버너 채굴기 예순 대의
-- 산출과 같다.
--
-- 버너 시대에 벨트를 쓰려면 세 토막이 필요하다:
--
--   1) 올라타는 곳   채굴기가 벨트 칸에 «직접 떨군다». 인서터가 필요 없다.
--                    상자에서 옮길 때는 사람이 벨트에 얹는다.
--   2) 길            벨트 줄. 전기가 필요 없다.
--   3) 내리는 곳     벨트 옆에 버너 인서터를 세워 화로에 넣는다.
--                    벨트는 스스로 화로에 넣지 못한다 - 이것을 빠뜨리면
--                    광석이 줄 끝에 쌓이기만 한다.
--
-- 세 토막을 한 번에 다 세울 필요는 없다. 이 파일은 «아직 없는 것»만 돌려주고,
-- 부르는 쪽이 한 번에 나를 수 있는 만큼씩 세운다. 이미 선 벨트는 장애물이
-- 아니라 이미 해둔 일이다 - 전봇대에서 그것을 몰라 스물두 쌍을 겹쳐 놓았다.

local Core = require("core")
local agent = Core.agent
local body = Core.body

local Tasks = require("tasks")

local Zones = require("zones")
local zones = Zones.zones

local BELT = "transport-belt"
local ARM = "burner-inserter"

-- 화로 블록의 치수. layout.py 의 FURNACE_* 와 같은 값이어야 한다.
local FURNACE_PITCH = 3
local FURNACE_ROW = 12

local function dir_of(from, to)
  if to.x > from.x then return defines.direction.east end
  if to.x < from.x then return defines.direction.west end
  if to.y > from.y then return defines.direction.south end
  return defines.direction.north
end

-- 길 찾기.
--
-- 처음에는 ㄱ자로 걸었다 - 한 축을 맞추고 다른 축을 맞춘다. 그런데 첫 칸부터
-- 막혔다. 시작점이 채굴기 밭 한복판이고, 캐는 구역의 테두리 상자가 제련
-- 구역을 통째로 감싸고 있어서 직선으로는 빠져나갈 데가 없었다.
--
-- 그러니 돌아가야 한다. 칸 수가 뻔하므로(수십 칸) 너비 우선으로 찾는다.
-- 이미 벨트가 선 칸은 «지나갈 수 있는 칸»으로 친다 - 그것이 바로 우리가
-- 깔아둔 길이기 때문이다.
-- 길 찾는 법이 바뀔 때마다 올린다. 옛 길을 버리는 표시다.
local PLAN = 3

local MAX_VISIT = 20000
local STEPS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }

local function passable(surface, force, x, y)
  local here = surface.find_entities_filtered {
    position = { x, y }, radius = 0.4, name = BELT, limit = 1,
  }[1]
  if here then return true end
  return surface.can_place_entity {
    name = BELT, position = { x, y }, direction = defines.direction.east,
    force = force,
  }
end

-- 트인 쪽에서 파고 들어간다. 그리고 되도록 곧게.
--
-- 두 번 고쳤다.
--
-- 처음에는 ㄱ자로 걸었다 - 첫 칸부터 막혔다. 시작점 주변 169칸 중 60칸만
-- 열려 있었고 그나마 서로 끊겨 있었다. 채굴기 밭 한복판은 원래 그렇다.
--
-- 다음에는 너비 우선으로 바꿨다. 돌아갈 줄은 알게 되었는데, 대각선을 한 칸씩
-- 번갈아 가는 «계단»이 나왔다. 칸 수로는 최단이지만 사람이 까는 모양이 아니고,
-- 나중에 옆에 무엇을 붙이기도 어렵다.
--
-- 사람이 까는 벨트는 길게 곧고 드물게 꺾인다. 그러니 재는 것을 바꾼다 -
-- 칸 수가 아니라 «꺾이는 횟수»를 줄인다. 곧게 가는 것은 공짜(0), 꺾는 것은
-- 1. 0/1 뿐이니 우선순위 큐 없이 덱 하나로 된다(0-1 BFS).
--
-- 이미 벨트가 선 칸은 지나갈 수 있는 칸으로 친다 - 그것이 바로 우리가 깔아둔
-- 길이기 때문이다.
local function walk(surface, force, from, goal)
  local function key(x, y, d) return x .. ":" .. y .. ":" .. d end

  -- 덱. 앞뒤로 넣고 앞에서 뺀다.
  local deque, head, tail = {}, 0, -1
  local function push_front(v) deque[head - 1] = v; head = head - 1 end
  local function push_back(v) tail = tail + 1; deque[tail] = v end

  local turns, came = {}, {}
  for _, step in pairs(STEPS) do
    local d = dir_of({ x = 0, y = 0 }, { x = step[1], y = step[2] })
    turns[key(goal.x, goal.y, d)] = 0
    push_back({ x = goal.x, y = goal.y, d = d })
  end
  head = 0

  local best, best_gap, best_turn = nil, math.huge, math.huge
  local visits = 0

  while head <= tail and visits < MAX_VISIT do
    local at = deque[head]
    deque[head] = nil
    head = head + 1
    visits = visits + 1
    local cost = turns[key(at.x, at.y, at.d)]

    local gap = math.abs(at.x - from.x) + math.abs(at.y - from.y)
    if gap < best_gap or (gap == best_gap and cost < best_turn) then
      best, best_gap, best_turn = at, gap, cost
    end

    for _, step in pairs(STEPS) do
      local nd = dir_of({ x = 0, y = 0 }, { x = step[1], y = step[2] })
      local nx, ny = at.x + step[1], at.y + step[2]
      local add = (nd == at.d) and 0 or 1
      local k = key(nx, ny, nd)
      if turns[k] == nil or turns[k] > cost + add then
        local open = (nx == from.x and ny == from.y)
                     or passable(surface, force, nx, ny)
        if open then
          turns[k] = cost + add
          came[k] = at
          if add == 0 then
            push_front({ x = nx, y = ny, d = nd })
          else
            push_back({ x = nx, y = ny, d = nd })
          end
        else
          turns[k] = -1   -- 막힌 칸. 다시 보지 않는다.
        end
      end
    end
  end

  if not best then return nil end

  -- best 에서 제련 구역까지 거슬러 올라가면 «캐는 쪽 -> 제련 쪽» 순서가 된다.
  -- 광석이 흐르는 방향과 같다.
  local tiles, at = {}, best
  while at do
    local back = came[key(at.x, at.y, at.d)]
    tiles[#tiles + 1] = { x = at.x, y = at.y,
                          dir = back and dir_of(at, back)
                                or defines.direction.east }
    at = back
    if #tiles > 400 then break end
  end
  -- 마지막 칸(제련 구역 줄머리)은 내리는 줄이 맡는다. 두 번 세지 않는다.
  tiles[#tiles] = nil
  return tiles, best_gap, best_turn
end

-- 시작점이 막혀 있으면 가장 가까운 빈 칸으로 옮긴다. 채굴기 밭 한복판에서
-- 줄을 시작할 수는 없다.
local function open_spot(surface, force, at)
  for r = 0, 12 do
    for dx = -r, r do
      for dy = -r, r do
        if math.abs(dx) == r or math.abs(dy) == r then
          if passable(surface, force, at.x + dx, at.y + dy) then
            return { x = at.x + dx, y = at.y + dy }
          end
        end
      end
    end
  end
  return at
end

-- 제련 블록의 벨트 두 줄.
--
-- 화로 줄 0 은 smelt.y-1 과 smelt.y 를, 줄 1 은 smelt.y+4 와 smelt.y+5 를
-- 차지한다(layout.py 의 FURNACE_AISLE = 5). 그 사이와 바깥으로:
--
--     smelt.y - 3   들어오는 벨트  (광석 + 석탄)
--     smelt.y - 2   버너 인서터 ↑  벨트에서 집어 화로에 넣는다
--     smelt.y - 1   화로 줄 0
--     smelt.y + 1   버너 인서터 ↑  화로에서 집어 벨트에 얹는다
--     smelt.y + 2   나가는 벨트    (판금)
--     smelt.y + 3   버너 인서터 ↓  화로 줄 1 에서 집어 벨트에 얹는다
--     smelt.y + 4   화로 줄 1
--
-- 두 줄이 가운데 벨트 하나를 같이 쓴다. 이것이 사람이 짓는 제련 블록의 모양이고
-- (reference/smelting-column.jpg), 그래서 화로를 줄로 세운 것이다.
--
-- 들어오는 벨트에 광석과 석탄을 «같이» 얹는다. 벨트 한 줄에는 두 차선이 있고,
-- 인서터는 집히는 대로 집어 화로에 넣는다. 화로는 석탄을 연료칸에, 광석을
-- 재료칸에 알아서 나눠 담는다. 덤으로 버너 인서터가 제가 나르는 석탄으로
-- 스스로를 먹인다 - 줄 하나가 광석과 연료와 인서터 밥을 한꺼번에 해결한다.
local function feed_line(smelt)
  local into, arms = {}, {}
  local out_lane, out_arms = {}, {}
  local y = smelt.y - 3
  local wide = FURNACE_PITCH * (FURNACE_ROW - 1)

  for i = 0, wide do
    into[#into + 1] = { x = smelt.x - 1 + i, y = y,
                        dir = defines.direction.east }
    out_lane[#out_lane + 1] = { x = smelt.x - 1 + i, y = smelt.y + 2,
                                dir = defines.direction.east }
  end
  for n = 0, FURNACE_ROW - 1 do
    local x = smelt.x + FURNACE_PITCH * n
    -- 집는 쪽이 direction 이다. 벨트가 위에 있으므로 north.
    arms[#arms + 1] = { x = x, y = y + 1, dir = defines.direction.north }
    -- 화로 줄 0 에서 집어 아래 벨트에 얹는다. 집는 쪽은 화로 = north.
    out_arms[#out_arms + 1] = { x = x, y = smelt.y + 1,
                                dir = defines.direction.north }
    -- 화로 줄 1 에서 집어 위 벨트에 얹는다. 집는 쪽은 화로 = south.
    out_arms[#out_arms + 1] = { x = x, y = smelt.y + 3,
                                dir = defines.direction.south }
  end
  return into, arms, { x = smelt.x - 1, y = y }, out_lane, out_arms
end

-- 아직 없는 것만. 이미 선 벨트는 «이미 해둔 일»이다.
local function missing(surface, force, tiles, what)
  local out, standing = {}, 0
  for _, tile in pairs(tiles) do
    local here = surface.find_entities_filtered {
      position = { tile.x, tile.y }, radius = 0.4, name = what, limit = 1,
    }[1]
    if here then
      standing = standing + 1
      if what == BELT and here.direction ~= tile.dir then
        out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir, turn = true }
      end
    elseif surface.can_place_entity {
      name = what, position = { tile.x, tile.y },
      direction = tile.dir, force = force,
    } then
      out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir }
    else
      out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir, blocked = true }
    end
  end
  return out, standing
end

-- 물류 - «무엇이 어디서 어디로 흐르는가».
--
-- 처음에는 광석 길 하나만 있었다. 그런데 판금도 석탄도 똑같이 «어디서 나와
-- 어디로 간다». 하나만 특별 취급하면 둘째가 생길 때 그 코드를 통째로 다시
-- 쓴다. 그래서 흐름을 «목록»으로 둔다.
--
--   ore     캐는 구역 상자      -> 제련 구역 들어오는 벨트
--   plate   제련 구역 나가는 줄 -> 조립 구역 (끝에 상자)
--
-- 흐름마다 제 길을 따로 기억한다(storage.lines). 길은 한 번 정하면 남는다 -
-- 부를 때마다 다시 찾으면 깐 벨트가 늘 «새 길 위에 없는» 벨트가 되고,
-- 영원히 깔면서 영원히 못 끝낸다. 실제로 마흔 칸을 그렇게 버렸다.
local function route_for(key, surface, force, from, goal)
  storage.lines = storage.lines or {}
  local kept = storage.lines[key]
  if kept and kept.plan == PLAN and kept.goal
     and kept.goal.x == goal.x and kept.goal.y == goal.y
     and kept.tiles and #kept.tiles > 0 then
    return kept.tiles, kept.short, kept.bends
  end
  local start = open_spot(surface, force, from)
  local tiles, short, bends = walk(surface, force, start, goal)
  if not tiles then return nil end
  storage.lines[key] = { goal = goal, tiles = tiles, short = short,
                         bends = bends, plan = PLAN }
  return tiles, short, bends
end

local function gather(surface, force, parts)
  local todo, standing, want = {}, {}, {}
  for _, part in ipairs(parts) do
    local need, up = missing(surface, force, part.tiles, part.what)
    standing[part.tag] = up
    want[part.tag] = #part.tiles
    for _, one in pairs(need) do
      one.what = part.what
      todo[#todo + 1] = one
    end
  end
  return todo, standing, want
end

local function cut(todo, limit)
  local out = {}
  for i = 1, math.min(#todo, limit or 20) do
    -- 막힌 칸에서 멈춘다. 건너뛰면 길이 끊기고, 끊긴 길은 아무것도 안 나른다.
    if todo[i].blocked then break end
    out[#out + 1] = todo[i]
  end
  return out
end

-- 캐는 구역 -> 제련 구역. 광석과 석탄이 같은 줄로 들어오고, 판금이 가운데
-- 줄로 나간다.
local function ore_line(name, fx, fy, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  local smelt, mine = here.smelt, here.mine
  if not smelt then return { error = "no smelting zone yet" } end
  if not mine and not fx then return { error = "no mining zone yet" } end

  local lane, arms, head, out_lane, out_arms = feed_line(smelt)
  local trunk, short, bends = route_for("ore", surface, force,
    { x = math.floor(fx or mine.x), y = math.floor(fy or mine.y) }, head)
  if not trunk then
    return { error = "no route from the mine to the smelter" }
  end

  -- 순서가 있다. 길이 없으면 내리는 곳을 세워도 아무것도 안 온다. 그리고
  -- 나가는 줄을 빠뜨리면 화로가 판금으로 제 출력칸을 막고 다시 선다.
  local todo, standing, want = gather(surface, force, {
    { tag = "trunk", what = BELT, tiles = trunk },
    { tag = "lane", what = BELT, tiles = lane },
    { tag = "arms", what = ARM, tiles = arms },
    { tag = "out", what = BELT, tiles = out_lane },
    { tag = "pick", what = ARM, tiles = out_arms },
  })

  return {
    todo = cut(todo, limit), left = #todo,
    standing = standing, want = want,
    head = head, from = trunk[1] or head,
    short = short, bends = bends,
  }
end

-- 제련 구역 -> 조립 구역. 판금이 흐른다.
--
-- 나가는 줄의 동쪽 끝에서 출발해 조립 구역까지 간다. 줄 끝에는 상자를 두고
-- 인서터로 부린다 - 벨트는 스스로 상자에 못 넣는다. 들어오는 쪽에서 이미
-- 한 번 겪은 함정이다.
local SINK = "wooden-chest"

local function plate_line(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  if not here.smelt or not here.craft then
    return { error = "no smelting or crafting zone yet" }
  end

  local _, _, _, out_lane = feed_line(here.smelt)
  local tail = out_lane[#out_lane]
  local goal = { x = here.craft.x, y = here.craft.y - 2 }

  local trunk, short, bends = route_for("plate", surface, force,
    { x = goal.x, y = goal.y }, { x = tail.x, y = tail.y })
  if not trunk then return { error = "no route from the smelter to the shop" } end

  -- walk 는 «goal 쪽으로 흐르는» 순서를 준다. 여기서는 제련 구역이 goal 이므로
  -- 뒤집어야 판금이 조립 구역 쪽으로 흐른다.
  local flow = {}
  for i = #trunk, 1, -1 do
    local one = trunk[i]
    local nxt = trunk[i - 1]
    flow[#flow + 1] = { x = one.x, y = one.y,
                        dir = nxt and dir_of(one, nxt)
                              or defines.direction.east }
  end

  local last = flow[#flow] or goal
  local sink = { { x = last.x, y = last.y + 2 } }
  local hand = { { x = last.x, y = last.y + 1,
                   dir = defines.direction.north } }

  local todo, standing, want = gather(surface, force, {
    { tag = "trunk", what = BELT, tiles = flow },
    { tag = "hand", what = ARM, tiles = hand },
    { tag = "sink", what = SINK, tiles = sink },
  })

  return {
    todo = cut(todo, limit), left = #todo,
    standing = standing, want = want,
    head = { x = last.x, y = last.y }, from = flow[1] or goal,
    short = short, bends = bends,
  }
end

-- 흐름 전체를 한눈에. 부르는 쪽은 «아직 안 끝난 첫 흐름»을 집으면 된다.
local FLOWS = {
  { flow = "ore", plan = function(name, limit) return ore_line(name, nil, nil, limit) end },
  { flow = "plate", plan = function(name, limit) return plate_line(name, limit) end },
}

local function flows(name, limit)
  local out = {}
  for _, one in ipairs(FLOWS) do
    local answer = one.plan(name, limit)
    out[#out + 1] = {
      flow = one.flow, error = answer.error,
      left = answer.left, standing = answer.standing, want = answer.want,
      from = answer.from, head = answer.head,
    }
  end
  return { flows = out }
end

-- 한 흐름의 다음 할 일. 이름으로 고른다.
local function flow_plan(name, which, limit)
  for _, one in ipairs(FLOWS) do
    if one.flow == which then return one.plan(name, limit) end
  end
  return { error = "no such flow: " .. tostring(which) }
end

-- 길 위에 없는 벨트들.
--
-- 길을 부를 때마다 새로 찾던 시절에 깔린 것들이다. 실측하니 마흔 칸이
-- 그렇게 버려져 있었다 - 철판 예순 개어치다. 걷어내면 손에 돌아오고,
-- 그 손으로 진짜 길을 이어 깔면 된다.
--
-- 「길 위에 있는가」는 정해진 길이 있어야 물을 수 있다. 그러니 길을 한 번
-- 정해두는 것은 낭비를 막는 일이기도 하다.
local function loose_belts(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local here = zones(name)
  if not here.smelt then return { loose = {} } end
  local lane, _, _, out_lane = feed_line(here.smelt)

  local mine_route = {}
  -- 길 찾는 법이 바뀌면 옛 길은 버린다. 계단으로 깔린 것을
  -- 그대로 들고 가면 고친 보람이 없다.
  local kept = storage.ore_line
  if kept and kept.plan ~= PLAN then kept = nil end
  for _, tile in pairs((kept and kept.tiles) or {}) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end
  for _, tile in pairs(lane) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end
  for _, tile in pairs(out_lane) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end

  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    name = BELT, force = b.force,
  }) do
    local k = math.floor(e.position.x) .. ":" .. math.floor(e.position.y)
    if not mine_route[k] and e.minable then
      out[#out + 1] = { x = e.position.x, y = e.position.y,
                        distance = math.floor(Tasks.dist(b.position, e.position)) }
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  local near = {}
  for i = 1, math.min(#out, limit or 12) do near[i] = out[i] end
  return { loose = near, total = #out }
end

return {
  ore_line = ore_line,
  flows = flows,
  flow_plan = flow_plan,
  loose_belts = loose_belts,
}

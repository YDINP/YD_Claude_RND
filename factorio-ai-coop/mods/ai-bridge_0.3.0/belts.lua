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
local MAX_VISIT = 6000
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

-- 트인 쪽에서 파고 들어간다.
--
-- 캐는 구역 쪽에서 출발하면 첫 칸부터 막힌다 - 실측하니 시작점 주변 169칸
-- 중 60칸만 열려 있었고 그나마 서로 끊겨 있었다. 채굴기 밭 한복판은 원래
-- 그렇다. 제련 구역 쪽은 161/169 로 훤하다.
--
-- 그러니 제련 구역에서 출발해 캐는 구역 쪽으로 파고 들어간다. 닿는 데까지만
-- 깔고, 남은 몇 걸음은 사람이 걷는다. 「줄이 끝까지 안 닿으니 아예 안 깐다」는
-- 것보다 「닿는 데까지 깔아둔다」가 언제나 낫다 - 다음 사람이 이어 깐다.
local function walk(surface, force, from, goal)
  local function key(x, y) return x .. ":" .. y end
  local seen = { [key(goal.x, goal.y)] = false }
  local queue = { { x = goal.x, y = goal.y } }
  local head, visits = 1, 0

  local best, best_gap = { x = goal.x, y = goal.y },
                         math.abs(goal.x - from.x) + math.abs(goal.y - from.y)

  while head <= #queue and visits < MAX_VISIT do
    local at = queue[head]
    head = head + 1
    visits = visits + 1

    local gap = math.abs(at.x - from.x) + math.abs(at.y - from.y)
    if gap < best_gap then best, best_gap = at, gap end
    if gap == 0 then break end

    for _, step in pairs(STEPS) do
      local nx, ny = at.x + step[1], at.y + step[2]
      local k = key(nx, ny)
      if seen[k] == nil then
        if (nx == from.x and ny == from.y)
           or passable(surface, force, nx, ny) then
          seen[k] = { x = at.x, y = at.y }
          queue[#queue + 1] = { x = nx, y = ny }
        else
          seen[k] = false   -- 막힌 칸. 다시 보지 않는다.
        end
      end
    end
  end

  -- best 에서 제련 구역까지 거슬러 올라가면 «캐는 쪽 -> 제련 쪽» 순서가 된다.
  -- 광석이 흐르는 방향과 같다.
  local tiles, at = {}, best
  while at do
    local nxt = seen[key(at.x, at.y)] or nil
    tiles[#tiles + 1] = { x = at.x, y = at.y,
                          dir = nxt and dir_of(at, nxt)
                                or defines.direction.east }
    at = nxt
  end
  if #tiles == 0 then return nil end
  -- 마지막 칸(제련 구역 줄머리)은 내리는 줄이 맡는다. 두 번 세지 않는다.
  tiles[#tiles] = nil
  return tiles, best_gap
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

-- 제련 구역에서 광석이 내리는 줄.
--
-- 화로 줄 0 은 smelt.y-1 과 smelt.y 를 차지한다. 그 바깥으로
--
--     smelt.y - 3   광석 벨트
--     smelt.y - 2   버너 인서터  (벨트에서 집어 화로에 넣는다)
--     smelt.y - 1   화로
--
-- 인서터의 direction 은 «집는 쪽»이다. 벨트가 위에 있으므로 north.
local function feed_line(smelt)
  local lane, arms = {}, {}
  local y = smelt.y - 3
  local wide = FURNACE_PITCH * (FURNACE_ROW - 1)
  for i = 0, wide do
    lane[#lane + 1] = { x = smelt.x - 1 + i, y = y,
                        dir = defines.direction.east }
  end
  for n = 0, FURNACE_ROW - 1 do
    arms[#arms + 1] = { x = smelt.x + FURNACE_PITCH * n, y = y + 1,
                        dir = defines.direction.north }
  end
  return lane, arms, { x = smelt.x - 1, y = y }
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

-- 캐는 구역에서 제련 구역까지의 광석 길 전체.
--
-- from 을 주면 거기서 시작한다(보통 광석이 쌓인 상자 무리). 안 주면 캐는
-- 구역의 무게중심에서 시작한다.
local function ore_line(name, fx, fy, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  local smelt, mine = here.smelt, here.mine
  if not smelt then return { error = "no smelting zone yet" } end
  if not mine and not fx then return { error = "no mining zone yet" } end

  local lane, arms, head = feed_line(smelt)

  -- 길은 한 번 정하면 남는다.
  --
  -- 처음에는 부를 때마다 다시 찾았다. 그런데 너비 우선은 같은 거리의 길이
  -- 여럿일 때 아무거나 고르고, 그 사이 채굴기와 상자가 늘어나 지형도 바뀐다.
  -- 그래서 부를 때마다 다른 길이 나왔고, 실측하니 벨트 마흔 칸을 깔아놓고도
  -- 「트렁크 0칸」이라고 답했다 - 깐 벨트가 새 길 위에 없었던 것이다.
  -- 그대로 두면 영원히 깔면서 영원히 못 끝낸다.
  local kept = storage.ore_line
  local trunk, short
  if kept and kept.head and kept.head.x == head.x and kept.head.y == head.y
     and kept.tiles and #kept.tiles > 0 then
    trunk, short = kept.tiles, kept.short
  else
    local from_at = open_spot(surface, force,
      { x = math.floor(fx or mine.x), y = math.floor(fy or mine.y) })
    trunk, short = walk(surface, force, from_at, head)
    if not trunk then
      return { error = "no route from the mine to the smelter" }
    end
    storage.ore_line = { head = head, tiles = trunk, short = short,
                         from = trunk[1] }
  end
  local from = trunk[1] or head

  local need_trunk, up_trunk = missing(surface, force, trunk, BELT)
  local need_lane, up_lane = missing(surface, force, lane, BELT)
  local need_arms, up_arms = missing(surface, force, arms, ARM)

  -- 순서가 있다. 길이 없으면 내리는 곳을 세워도 아무것도 안 온다.
  local todo = {}
  for _, one in pairs(need_trunk) do one.what = BELT; todo[#todo + 1] = one end
  for _, one in pairs(need_lane) do one.what = BELT; todo[#todo + 1] = one end
  for _, one in pairs(need_arms) do one.what = ARM; todo[#todo + 1] = one end

  local next_up = {}
  for i = 1, math.min(#todo, limit or 20) do
    if todo[i].blocked then break end     -- 막힌 칸에서 멈춘다. 건너뛰면 길이 끊긴다.
    next_up[#next_up + 1] = todo[i]
  end

  return {
    todo = next_up, left = #todo,
    standing = { trunk = up_trunk, lane = up_lane, arms = up_arms },
    want = { trunk = #trunk, lane = #lane, arms = #arms },
    head = head, from = from,
    -- 줄이 캐는 구역까지 몇 칸 못 미쳤는가. 그만큼은 사람이 걷는다.
    short = short,
  }
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
  local lane = feed_line(here.smelt)

  local mine_route = {}
  local kept = storage.ore_line
  for _, tile in pairs((kept and kept.tiles) or {}) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end
  for _, tile in pairs(lane) do
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
  loose_belts = loose_belts,
}

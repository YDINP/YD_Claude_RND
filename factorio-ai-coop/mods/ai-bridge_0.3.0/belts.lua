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

local Zones = require("zones")
local zones = Zones.zones

local BELT = "transport-belt"
local ARM = "burner-inserter"

-- 화로 블록의 치수. layout.py 의 FURNACE_* 와 같은 값이어야 한다.
local FURNACE_PITCH = 3
local FURNACE_ROW = 12
local FURNACE_AISLE = 5

local function dir_of(from, to)
  if to.x > from.x then return defines.direction.east end
  if to.x < from.x then return defines.direction.west end
  if to.y > from.y then return defines.direction.south end
  return defines.direction.north
end

local function belt_at(surface, tile)
  return surface.find_entities_filtered {
    position = { tile.x, tile.y }, radius = 0.4, name = BELT, limit = 1,
  }[1]
end

-- 한 칸씩 걷는 ㄱ자 길. 한 축을 맞추고 다른 축을 맞춘다.
local function walk(from, goal)
  local tiles, here = {}, { x = from.x, y = from.y }
  local function run(axis)
    while (axis == "x" and here.x ~= goal.x)
       or (axis == "y" and here.y ~= goal.y) do
      local nxt = { x = here.x, y = here.y }
      if axis == "x" then
        nxt.x = here.x + (goal.x > here.x and 1 or -1)
      else
        nxt.y = here.y + (goal.y > here.y and 1 or -1)
      end
      tiles[#tiles + 1] = { x = here.x, y = here.y, dir = dir_of(here, nxt) }
      here = nxt
      if #tiles > 400 then return end
    end
  end
  -- 먼 축부터 맞춘다. 꺾이는 데가 목적지 가까이에 있어야 길이 짧다.
  if math.abs(goal.x - from.x) >= math.abs(goal.y - from.y) then
    run("x"); run("y")
  else
    run("y"); run("x")
  end
  tiles[#tiles + 1] = { x = goal.x, y = goal.y,
                        dir = tiles[#tiles] and tiles[#tiles].dir
                              or defines.direction.east }
  return tiles
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
  local from = { x = math.floor(fx or mine.x), y = math.floor(fy or mine.y) }
  local trunk = walk(from, head)

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
  }
end

return {
  ore_line = ore_line,
}

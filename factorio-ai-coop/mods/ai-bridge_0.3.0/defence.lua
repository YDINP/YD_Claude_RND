-- 방어 - 언제, 어디를, 무엇으로 막는가.
--
-- 바이터는 아무 때나 오지 않는다. 공해가 둥지에 닿으면 그쪽이 찾아온다.
-- 그러니 방어의 첫 질문은 「적이 보이는가」가 아니라 「우리 공해가 어디까지
-- 갔는가」다. 아직 안 보인다는 것과 안전하다는 것은 다르다.
--
-- 그리고 방어선은 사람 둘레가 아니라 «구역 둘레»에 선다. 사람은 움직이고
-- 구역은 움직이지 않는다. 지킬 것은 사람이 아니라 공장이다.

local Stock = require("stock")
local base = Stock.base

local Core = require("core")
local agent = Core.agent
local body = Core.body

local Zones = require("zones")
local zones = Zones.zones

local TURRET = "gun-turret"
local WALL = "stone-wall"
local AMMO = "firearm-magazine"
-- 이 아래로 떨어진 터렛은 굶은 것으로 친다. 한 탄창이 열 발이고, 작은
-- 바이터 한 마리에 서너 발이 든다.
local AMMO_FLOOR = 5
-- 한 번 채울 때 이만큼. 터렛 탄약칸은 한 칸에 200발까지 들어간다.
local AMMO_FILL = 20

-- 방어선을 구역 테두리에서 이만큼 밖에 세운다. 터렛 사거리가 18이므로,
-- 이만큼 띄우면 터렛이 공장에 닿기 전에 적을 잡는다.
local STANDOFF = 10
-- 방어선 위에 터렛을 이만큼 간격으로. 사거리 18짜리 둘이 겹쳐 서도록.
local TURRET_GAP = 14

-- 우리 것 전부를 감싸는 네모.
local MINE = { "furnace", "mining-drill", "assembling-machine", "lab",
               "boiler", "generator", "container", "electric-pole" }

-- 지킬 값어치가 있는 곳만 감싼다.
--
-- 사용자: "또 기지 박살낫네". 실측이 왜인지 말해준다:
--
--     터렛 2대   (-60,-74), (-60,-60)   탄약 0
--     기지        (104,-44)
--
-- 터렛이 기지에서 164타일 떨어진 곳에 서 있었다. 방어선을 «우리 건물
-- 전체»의 테두리로 잡았기 때문이다. 옛 발전소 쪽에 남은 전봇대 몇 개가
-- 테두리를 그리로 끌고 갔고, 터렛은 그 테두리 위에 섰다.
--
-- 지킬 것은 「우리 것 전부」가 아니라 「공장」이다. 낙오한 전봇대 하나를
-- 지키자고 공장을 비워둘 수는 없다. 그러니 «기지에서 멀리 떨어진 것»은
-- 테두리에서 뺀다. 그것들은 어차피 못 지킨다.
-- 방어선은 «지킬 수 있는 만큼»이어야 한다.
--
-- 아흔 타일로 뒀더니 테두리가 139x89 가 나왔다. 터렛 사거리가 18이니
-- 그 둘레를 덮으려면 서른 대가 넘게 든다. 우리는 두 대를 세웠고 그나마
-- 탄약이 없었다.
--
-- 못 지키는 방어선은 방어선이 아니다. 지킬 수 있는 크기로 줄이고, 그
-- 밖의 것은 잃을 셈 친다 - 채굴기 몇 대를 잃는 것과 공장을 잃는 것은
-- 다르다.
local STRAY_OUT = 45

local function perimeter(surface, force)
  local home = base().home
  local lo = { x = math.huge, y = math.huge }
  local hi = { x = -math.huge, y = -math.huge }
  local seen, left_out = 0, 0
  for _, e in pairs(surface.find_entities_filtered { type = MINE, force = force }) do
    local far = home and (math.abs(e.position.x - home.x) > STRAY_OUT
                       or math.abs(e.position.y - home.y) > STRAY_OUT)
    if far then
      left_out = left_out + 1
    else
      lo.x, lo.y = math.min(lo.x, e.position.x), math.min(lo.y, e.position.y)
      hi.x, hi.y = math.max(hi.x, e.position.x), math.max(hi.y, e.position.y)
      seen = seen + 1
    end
  end
  if seen == 0 then return nil end
  return { left = math.floor(lo.x) - STANDOFF, top = math.floor(lo.y) - STANDOFF,
           right = math.ceil(hi.x) + STANDOFF, bottom = math.ceil(hi.y) + STANDOFF,
           count = seen, left_out = left_out }
end

-- 적은 어느 쪽에서 오는가.
--
-- 둥지가 스물여덟 곳이면 사방에 있다. 그래도 «가장 가까운 쪽»부터 막는 것이
-- 맞다 - 공해가 먼저 닿는 곳이 거기고, 먼저 오는 것도 거기다.
local function threat_side(surface, home)
  local nests = surface.find_entities_filtered {
    type = "unit-spawner", force = game.forces.enemy,
  }
  if #nests == 0 then return nil, 0, nil end
  local near, gap = nil, math.huge
  for _, n in pairs(nests) do
    local dx, dy = n.position.x - home.x, n.position.y - home.y
    local d = math.sqrt(dx * dx + dy * dy)
    if d < gap then near, gap = n, d end
  end
  local dx, dy = near.position.x - home.x, near.position.y - home.y
  local side
  if math.abs(dx) >= math.abs(dy) then
    side = dx < 0 and "west" or "east"
  else
    side = dy < 0 and "north" or "south"
  end
  return side, #nests, { x = math.floor(near.position.x),
                         y = math.floor(near.position.y),
                         gap = math.floor(gap) }
end

-- 그 면의 방어선 위에 터렛이 설 자리들.
local function turret_seats(surface, force, box, side)
  local seats = {}
  local function try(x, y)
    if surface.can_place_entity { name = TURRET, position = { x, y },
                                  force = force } then
      seats[#seats + 1] = { x = x, y = y }
    end
  end
  if side == "west" or side == "east" then
    local x = (side == "west") and box.left or box.right
    for y = box.top, box.bottom, TURRET_GAP do try(x, y) end
  else
    local y = (side == "north") and box.top or box.bottom
    for x = box.left, box.right, TURRET_GAP do try(x, y) end
  end
  return seats
end

-- 우리 공해는 어디까지 갔고, 둥지는 얼마나 먼가.
--
-- 이 둘의 차이가 남은 시간이다. 공해가 둥지에 닿는 순간 그쪽이 온다.
local function pollution_reach(surface, home, toward)
  local here = surface.get_pollution(home)
  if here <= 0 or not toward then return 0, here end
  local dx, dy = toward.x - home.x, toward.y - home.y
  local span = math.sqrt(dx * dx + dy * dy)
  if span < 1 then return 0, here end
  local ux, uy = dx / span, dy / span
  local far = 0
  for step = 32, math.floor(span), 32 do
    local at = { x = home.x + ux * step, y = home.y + uy * step }
    if surface.get_pollution(at) > 0.5 then far = step else break end
  end
  return far, here
end

local function defence(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  local home = here.home or { x = b.position.x, y = b.position.y }
  local box = perimeter(surface, force)
  local side, nests, nearest = threat_side(surface, home)
  local reach, at_home = pollution_reach(surface, home, nearest)

  local turrets = surface.find_entities_filtered { name = TURRET, force = force }

  -- 빈 총은 없는 총이다.
  --
  -- 실측(습격 직후): 터렛 다섯 대 중 둘이 탄약 0 이었고, 탄약 누적 생산은
  -- 0 이었다. 세상에 있는 스물아홉 발은 전부 시작 재고다. 한 번도 만든
  -- 적이 없다.
  --
  -- 세우고 잊는 것 - 채굴기에서도 화로에서도 겪은 그것이다. 이번에는
  -- 값이 더 비쌌다: 화로 8대, 벨트 19칸, 그리고 요원 하나를 잃었다.
  local starved, rounds = {}, 0
  for _, t in pairs(turrets) do
    local inv = t.get_inventory(defines.inventory.turret_ammo)
    local have = inv and inv.get_item_count(AMMO) or 0
    rounds = rounds + have
    if have < AMMO_FLOOR then
      starved[#starved + 1] = { x = math.floor(t.position.x),
                                y = math.floor(t.position.y), ammo = have }
    end
  end
  local seats = (box and side) and turret_seats(surface, force, box, side) or {}

  -- 이미 터렛이 선 자리는 뺀다.
  local want = {}
  for _, seat in pairs(seats) do
    local taken = false
    for _, t in pairs(turrets) do
      local dx, dy = t.position.x - seat.x, t.position.y - seat.y
      if dx * dx + dy * dy < TURRET_GAP * TURRET_GAP / 4 then taken = true break end
    end
    if not taken then want[#want + 1] = seat end
  end

  return {
    side = side, nests = nests, nearest = nearest,
    perimeter = box, home = home,
    pollution = math.floor(at_home), pollution_reach = reach,
    -- 공해가 둥지까지 몇 타일 남았는가. 0 이하면 이미 닿았다.
    slack = nearest and (nearest.gap - reach) or nil,
    turrets = #turrets,
    -- 굶은 터렛과 그 자리. 총을 더 놓는 것보다 먼저다.
    starved = starved, rounds = rounds,
    fill = AMMO_FILL,
    walls = #surface.find_entities_filtered { name = WALL, force = force },
    seats = want,
    can_turret = force.technologies[TURRET].researched,
    can_wall = force.technologies[WALL].researched,
    ammo = AMMO,
  }
end

-- 아무것도 안 내놓으면서 공해만 뿜는 기계들.
--
-- 버너 기계는 멈춰 있어도 연료를 태우는 동안 공해를 낸다. 막혀서 선
-- 채굴기는 캐지도 않으면서 둥지를 깨운다 - 방어의 첫걸음은 총이 아니라
-- 이것들을 치우는 일이다.
local IDLE = {
  [defines.entity_status.waiting_for_space_in_destination] = true,
  [defines.entity_status.no_minable_resources] = true,
}

-- 판정표를 만들어놓고 쓰지를 않았다.
--
--   if IDLE[e.status] and e.status == no_minable_resources
--
-- 뒤의 조건이 앞의 표를 통째로 무효로 만든다. 그래서 「광맥이 말랐다」만
-- 잡고 「출구가 막혔다」는 한 대도 안 잡았다. 실측에서 그 차이가 이렇다:
--
--   no_minable_resources             몇 대
--   waiting_for_space_in_destination 96대
--
-- 이번 주 여섯 번째다 - 기능은 있는데 그것을 가리키는 조건이 틀렸다.
--
-- 그리고 이것은 방어 문제다. 막혀 선 채굴기는 캐지도 않으면서 연료를
-- 태우고 공해를 낸다. 지금 공해가 둥지까지 43타일 남았다. 총을 더 놓기
-- 전에 둥지를 깨우는 것을 먼저 끄는 것이 맞다.
local function smoking_idle(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local out, total, why = {}, 0, {}
  for _, e in pairs(b.surface.find_entities_filtered {
    type = "mining-drill", force = b.force,
  }) do
    if IDLE[e.status] then
      total = total + 1
      local tag = tostring(e.status)
      why[tag] = (why[tag] or 0) + 1
      if #out < (limit or 8) then
        out[#out + 1] = { name = e.name, x = e.position.x, y = e.position.y,
                          status = e.status }
      end
    end
  end
  return { idle = out, total = total, why = why,
           dry = defines.entity_status.no_minable_resources,
           jammed = defines.entity_status.waiting_for_space_in_destination }
end

return {
  defence = defence,
  smoking_idle = smoking_idle,
}

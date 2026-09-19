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

-- 지킬 것은 «구역»이다. 모든 기계의 무게중심이 아니다.
--
-- 전멸(2026-09-19 18:59)의 실측이 이랬다:
--
--     base().home        (23, 33)      <- 발전소와 외곽 채굴기가 끌고 간 자리
--     제련 구역          (38, 87)
--     조립 구역          (48, 68)
--     유통 구역          (62, 82)
--     터렛 8대가 실제로   x -20~-49, y -16~41,  탄약 10발씩 만재
--     잡은 적             없음
--
-- STRAY_OUT 이 45 라, 무게중심에서 45칸 밖인 제련 구역(y=87)이 테두리에서
-- 통째로 빠졌다. 남은 것은 발전소와 외곽 채굴기뿐이었고, 그래서 상자가
-- 서북쪽으로 끌려갔다. 탄약 여든 발을 채운 터렛 여덟 대가 공장에서 60~130
-- 타일 떨어진 빈 땅을 지켰다.
--
-- 구역은 이미 정해져 있다(zones). 우리가 「여기가 제련이다」라고 적어둔
-- 자리를 안 보고, 기계 위치의 평균을 다시 계산해서 딴 데를 가리켰다.
-- 적어둔 것이 있으면 그것을 본다.
local function core_box(here)
  if not here then return nil end
  local lo = { x = math.huge, y = math.huge }
  local hi = { x = -math.huge, y = -math.huge }
  local seen = 0
  for _, z in pairs({ here.smelt, here.craft, here.depot }) do
    if z and z.x and z.w then
      seen = seen + 1
      lo.x = math.min(lo.x, z.x)
      lo.y = math.min(lo.y, z.y)
      hi.x = math.max(hi.x, z.x + z.w)
      hi.y = math.max(hi.y, z.y + z.h)
    end
  end
  if seen == 0 then return nil end
  return { left = math.floor(lo.x) - STANDOFF, top = math.floor(lo.y) - STANDOFF,
           right = math.ceil(hi.x) + STANDOFF, bottom = math.ceil(hi.y) + STANDOFF,
           count = seen, from = "zones" }
end

local function perimeter(surface, force, here)
  -- 구역이 정해져 있으면 그것이 답이다. 아래 길은 구역을 아직 모를 때 -
  -- 개국 직후 - 를 위한 것이다.
  local zoned = core_box(here)
  if zoned then return zoned end
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
-- 둥지 쪽부터, 그다음 옆구리, 마지막이 반대쪽.
--
-- 사용자: "포탑은 최대한 방어적으로 구성하되, 심시티는 잘 해야함."
--
-- 지금까지는 «한 면»만 세웠다. 둥지가 남쪽이면 남쪽에만 선다. 그런데
-- 바이터는 둥지에서 곧장 오지 않는다 - 공해 구름을 따라오고, 길을 막으면
-- 돌아온다. 한 면만 막힌 공장은 나머지 세 면이 열려 있는 공장이다.
--
-- 그렇다고 네 면을 한꺼번에 세우면 총이 흩어진다. 둘레가 네 배가 되면
-- 같은 수로 네 배 성기게 서고, 성긴 방어선은 어디서도 못 막는다.
--
-- 그래서 «순서»를 준다. 둥지 쪽을 먼저 채우고, 다 차면 옆구리, 그다음
-- 반대쪽. 자리 목록이 그 순서로 나오므로 세우는 쪽은 앞에서부터 가져간다.
local FLANK = {
  north = { "north", "west", "east", "south" },
  south = { "south", "west", "east", "north" },
  west  = { "west", "north", "south", "east" },
  east  = { "east", "north", "south", "west" },
}

local function seats_on(surface, force, box, side, seats)
  local function try(x, y)
    if surface.can_place_entity { name = TURRET, position = { x, y },
                                  force = force } then
      seats[#seats + 1] = { x = x, y = y, side = side }
    end
  end
  if side == "west" or side == "east" then
    local x = (side == "west") and box.left or box.right
    for y = box.top, box.bottom, TURRET_GAP do try(x, y) end
  else
    local y = (side == "north") and box.top or box.bottom
    for x = box.left, box.right, TURRET_GAP do try(x, y) end
  end
end

local function turret_seats(surface, force, box, side)
  local seats = {}
  for _, face in pairs(FLANK[side] or { side }) do
    seats_on(surface, force, box, face, seats)
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

-- 적이 «왔는가».
--
-- 사용자 지시: "적이 온걸 인식할것."
--
-- 지금까지는 「몇 마리가 몇 타일 앞에 있다」만 말했다. 그런데 이백 타일
-- 밖의 열 마리와 공장 한복판의 세 마리는 전혀 다른 일이다. 앞의 것은
-- 소식이고 뒤의 것은 사건이다.
--
-- 그리고 우리는 사건을 놓쳐왔다. 지난 판에서 화로 11대와 채굴기 14대와
-- 요원 74번을 잃는 동안, 무리가 한 번도 「습격이다」라고 말하지 않았다.
-- 알아볼 눈이 없었기 때문이다.
--
-- 두 가지를 본다.
--
--   들어왔는가   방어선 «안»에 적이 있는가. 밖은 소식, 안은 사건이다.
--   맞았는가     우리 것이 피를 흘리고 있는가. 적이 안 보여도 건물이
--                깎이고 있으면 이미 당하는 중이다.
local function raid(surface, force, box, home)
  local inside, hurt, worst = 0, 0, nil
  if box then
    local area = { { box.left, box.top }, { box.right, box.bottom } }
    inside = surface.count_entities_filtered {
      area = area, force = game.forces.enemy, type = "unit",
    }
    for _, e in pairs(surface.find_entities_filtered {
      area = area, force = force,
    }) do
      -- 「얼마나 다쳤는가」는 게임에 묻는다. 2.0 의 프로토타입에는
      -- max_health 가 없고, 체력이 없는 것(아이템·나무)도 섞여 온다.
      -- get_health_ratio 는 체력이 없으면 nil 을 준다 - 그 한 번의 물음이
      -- 두 경우를 다 가른다.
      local ok, ratio = pcall(function() return e.get_health_ratio() end)
      if ok and ratio and ratio < 1 then
        hurt = hurt + 1
        if not worst or ratio < worst.ratio then
          worst = { name = e.name, ratio = math.floor(ratio * 100) / 100,
                    x = math.floor(e.position.x), y = math.floor(e.position.y) }
        end
      end
    end
  end
  -- 기지 코앞. 방어선이 아직 없을 때도 이것은 안다.
  local near_home = home and surface.count_entities_filtered {
    position = home, radius = 60, force = game.forces.enemy, type = "unit",
  } or 0
  return {
    inside = inside, near_home = near_home,
    hurt = hurt, worst = worst,
    -- 「습격 중」이라고 말할 수 있는 때. 둘 중 하나면 충분하다.
    now = (inside > 0 or near_home > 0 or hurt > 0),
  }
end

-- 공해가 자란 만큼 총이 있어야 한다.
--
-- 사용자 지시: "공해도가 올라가면 적이 공격오니까 우린 자원도 자원나름이지만
-- 방어가 최우선임."
--
-- 맞다. 그리고 지금까지 방어는 «조건부»였다 - 여유가 예순 타일 아래로
-- 내려오면 그때 급해졌다. 그런데 공해는 그 전부터 자라고, 자란 만큼
-- 둥지를 깨운다. 닿고 나서 급한 것은 늦은 것이다.
--
-- 그러니 「몇 대가 있어야 하는가」를 공해가 정하게 한다. 그리고 모자란
-- 만큼이 «빚»이다. 빚이 있으면 굴뚝을 더 세우지 않는다 - 굴뚝을 더
-- 세우는 것은 빚을 더 지는 것이다.
--
--   여유 150타일 넘음   2대   아직 멀다. 최소한만.
--   여유 60~150         4대   자라는 중. 한 면은 막는다.
--   여유 20~60          8대   가깝다. 오는 쪽을 덮는다.
--   여유 20 이하/모름   12대  닿았거나 모른다. 둘 다 최악으로 친다.
local function turrets_wanted(slack)
  if slack == nil then return 12 end
  if slack > 150 then return 2 end
  if slack > 60 then return 4 end
  if slack > 20 then return 8 end
  return 12
end

local function defence(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  local home = here.home or { x = b.position.x, y = b.position.y }
  local box = perimeter(surface, force, here)
  -- 적이 어느 쪽에서 오는가도 «구역» 한가운데서 잰다. 지킬 것이 거기
  -- 있으므로 거기서 재야 맞는 면이 나온다. 무게중심에서 재면, 무게중심이
  -- 공장 밖일 때 엉뚱한 면을 고른다 - 그것이 이번 전멸의 값이다.
  local heart = box and { x = (box.left + box.right) / 2,
                          y = (box.top + box.bottom) / 2 } or home
  local side, nests, nearest = threat_side(surface, heart)
  local reach, at_home = pollution_reach(surface, heart, nearest)

  local turrets = surface.find_entities_filtered { name = TURRET, force = force }
  local slack_now = nearest and (nearest.gap - reach) or nil
  local want_turrets = turrets_wanted(slack_now)

  -- 빈 총은 없는 총이다.
  --
  -- 실측(습격 직후): 터렛 다섯 대 중 둘이 탄약 0 이었고, 탄약 누적 생산은
  -- 0 이었다. 세상에 있는 스물아홉 발은 전부 시작 재고다. 한 번도 만든
  -- 적이 없다.
  --
  -- 세우고 잊는 것 - 채굴기에서도 화로에서도 겪은 그것이다. 이번에는
  -- 값이 더 비쌌다: 화로 8대, 벨트 19칸, 그리고 요원 하나를 잃었다.
  local starved, rounds, armed = {}, 0, 0
  for _, t in pairs(turrets) do
    local inv = t.get_inventory(defines.inventory.turret_ammo)
    local have = inv and inv.get_item_count(AMMO) or 0
    rounds = rounds + have
    if have >= AMMO_FLOOR then armed = armed + 1 end
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
    -- 적이 왔는가. 이것이 「몇 타일 앞」보다 먼저 봐야 할 값이다.
    raid = raid(surface, force, box, home),
    side = side, nests = nests, nearest = nearest,
    perimeter = box, home = home,
    pollution = math.floor(at_home), pollution_reach = reach,
    -- 공해가 둥지까지 몇 타일 남았는가. 0 이하면 이미 닿았다.
    slack = nearest and (nearest.gap - reach) or nil,
    turrets = #turrets,
    -- 공해가 요구하는 수와, 모자란 만큼의 «빚».
    --
    -- 탄약이 없는 총은 없는 총이다. 그러니 세운 수가 아니라 «먹인 수»를
    -- 센다 - 지난 판에서 다섯 대 중 둘이 빈 총이었고, 그 둘은 습격에
    -- 아무것도 못 했다.
    want = want_turrets,
    armed = armed,
    -- 갚을 수 있을 때만 빚이다.
    --
    -- 연구가 안 끝났으면 총을 못 세운다. 그때도 빚으로 세면 성장이
    -- 영원히 멈추는데, 정작 갚을 방법이 없다. 그것은 빚이 아니라 벌이다.
    --
    -- 그때 할 일은 총을 세우는 것이 아니라 «연구를 끝내는 것»이고,
    -- 연구는 공장이 돌아야 끝난다.
    debt = force.technologies[TURRET].researched
           and math.max(0, want_turrets - armed) or 0,
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

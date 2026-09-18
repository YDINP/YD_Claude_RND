-- 무엇을 어디에 세울 것인가 - 광맥 위, 화로 앞, 벨트 길.

local Tasks = require("tasks")
local Core = require("core")
local MAX_OBSERVE_RADIUS = Core.MAX_OBSERVE_RADIUS
local agent              = Core.agent
local body               = Core.body

-- 공해는 바람처럼 퍼져서 둥지에 닿고, 닿으면 그쪽이 찾아온다. 그때 가서
-- 놀라지 않으려면 «얼마나 가까운지»와 «무엇이 잠겨 있는지»를 보고 있어야
-- 한다. 아직 둥지가 안 보인다는 것과 안전하다는 것은 다르다.
-- 길. 채굴기를 빈틈없이 붙여 놓으면 캐릭터가 지나다닐 데가 없어진다 -
-- 실제로 광맥 하나가 채굴기 오십 대로 덮여 사람이 갇혔다. 여덟 칸마다
-- 한 줄을 비워두면 격자 모양 길이 남는다. 광맥은 넓고 길은 싸다.
local LANE_EVERY = 8

local function blocks_lane(position, half)
  half = half or 1
  for tx = math.floor(position.x - half), math.floor(position.x + half) do
    if tx % LANE_EVERY == 0 then return true end
  end
  for ty = math.floor(position.y - half), math.floor(position.y + half) do
    if ty % LANE_EVERY == 0 then return true end
  end
  return false
end

-- 길을 막고 선 우리 건물들. 여덟 칸마다 비워두기로 한 줄 위에 이미
-- 놓여버린 것들이라, 새로 짓기 전에 이것부터 치워야 한다.
local function blocking(name, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or 120, MAX_OBSERVE_RADIUS)
  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, force = b.force,
    name = { "burner-mining-drill", "iron-chest", "stone-furnace" },
  }) do
    if blocks_lane(e.position, 1) and e.minable then
      out[#out + 1] = {
        name = e.name, x = e.position.x, y = e.position.y,
        distance = math.floor(Tasks.dist(b.position, e.position) * 10) / 10,
      }
    end
    if #out >= 20 then break end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  return { agent = name, blocking = out }
end

local function threat(name, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local reach = math.min(radius or 300, 500)

  local nests = surface.find_entities_filtered {
    type = "unit-spawner", force = "enemy", position = b.position, radius = reach,
  }
  local nearest, near_d = nil, math.huge
  for _, nest in pairs(nests) do
    local d = Tasks.dist(b.position, nest.position)
    if d < near_d then nearest, near_d = nest, d end
  end

  local units = surface.find_entities_filtered {
    type = "unit", force = "enemy", position = b.position, radius = reach,
  }
  local closest_unit = math.huge
  for _, u in pairs(units) do
    local d = Tasks.dist(b.position, u.position)
    if d < closest_unit then closest_unit = d end
  end

  local evo = 0
  pcall(function()
    if surface.get_evolution_factor then evo = surface.get_evolution_factor(force) end
  end)

  return {
    agent = name,
    pollution = math.floor(surface.get_pollution(b.position)),
    nests = #nests,
    nearest_nest = nearest and math.floor(near_d) or nil,
    attackers = #units,
    nearest_attacker = (#units > 0) and math.floor(closest_unit) or nil,
    evolution = math.floor(evo * 1000) / 1000,
    turrets = #surface.find_entities_filtered { type = "ammo-turret", force = force },
    -- 대비 수단이 열려 있는가. 아직 잠겨 있으면 «위협 없음»은 위안이 안 된다.
    can_build_turret = force.recipes["gun-turret"] ~= nil
      and force.recipes["gun-turret"].enabled or false,
    can_make_ammo = force.recipes["firearm-magazine"] ~= nil
      and force.recipes["firearm-magazine"].enabled or false,
  }
end

------------------------------------------------------------- 채굴기 방향

-- 버너 채굴기는 바라보는 방향 바로 앞 칸에 광석을 떨군다. 그 칸이 막혀
-- 있으면 - 다른 채굴기든 바위든 - 채굴기는 몇 개 떨구다 그대로 선다.
-- 기본 방향으로 그냥 놓으면 두 대를 나란히 세웠을 때 아래쪽이 위쪽 몸통에
-- 대고 떨구게 된다. 실제로 그렇게 멈춰 있었다.
--
-- 건물은 돌릴 수 있다. 그러니 놓기 전에 «출구가 비는 방향»을 고르고,
-- 이미 잘못 놓인 것은 돌려서 고친다. 비는지 아닌지는 짐작하지 않고
-- can_place_entity 로 게임에게 물어본다.

local DIRECTIONS = { defines.direction.north, defines.direction.east,
                     defines.direction.south, defines.direction.west }

-- 채굴기 중심에서 산출 칸까지의 거리. 2x2 라 중심에서 1.5칸 앞이다.
local DROP_REACH = 1.5

local function drop_tile(position, direction)
  local dx, dy = 0, 0
  if direction == defines.direction.north then dy = -DROP_REACH
  elseif direction == defines.direction.south then dy = DROP_REACH
  elseif direction == defines.direction.east then dx = DROP_REACH
  else dx = -DROP_REACH end
  return { x = position.x + dx, y = position.y + dy }
end

-- 출구 칸이 쓸 만한가. 무엇을 받게 할지는 부르는 쪽이 정한다 - 상자를
-- 놓으면 광석이 쌓이기만 하고, 화로를 놓으면 인서터 없이 바로 제련된다.
-- 채굴기는 캐자마자 바라보는 방향 앞 칸에 떨구고, 그 칸에 연료나 재료를
-- 받을 수 있는 기계가 있으면 바닥에 흘리지 않고 그 안으로 넣는다.
local function outlet_ok(surface, force, spot, receiver)
  receiver = receiver or "iron-chest"
  local here = surface.find_entities_filtered { position = { spot.x, spot.y }, radius = 0.4 }
  for _, e in pairs(here) do
    if e.type == "container" then return true, "chest" end
    if e.name == receiver then return true, "receiver" end
    if e.type ~= "character" and e.type ~= "item-entity" then return false end
  end
  if surface.can_place_entity { name = receiver, position = spot, force = force } then
    return true, "free"
  end
  return false
end

-- 광맥 위에서 «채굴기가 들어가고 출구도 비는» 자리와 방향을 찾는다.
-- 한 대의 채굴기가 얼마나 오래 사는가.
--
-- 실측(2026-09-18, 이 맵): 철광석 617칸의 매장량이 최소 1, 최대 1674,
-- 평균 565였다. 같은 광맥 안에서 1670배 차이가 난다. 지금까지는 게임이
-- 돌려준 순서대로 «놓을 수 있는 첫 칸»에 세웠고, 그 순서는 광맥의 바깥
-- 테두리부터다. 매장량 1짜리 칸에 세운 채굴기는 4초 만에 죽는다.
--
-- 버너 채굴기는 2x2 를 캔다. 그 네 칸의 합이 이 자리의 «수명»이고,
-- 0.25/s 로 나누면 몇 초짜리인지 나온다.
local function richness(surface, spot)
  local total = 0
  -- 2x2 짜리 엔티티의 중심은 정수 좌표라, 캐는 네 칸은 중심에서 한 칸씩이다.
  for _, tile in pairs(surface.find_entities_filtered {
    area = { { spot.x - 1, spot.y - 1 }, { spot.x + 1, spot.y + 1 } },
    type = "resource",
  }) do
    total = total + tile.amount
  end
  return total
end

local function drill_site(name, x, y, radius, receiver, want)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local reach = math.min(radius or 12, 40)

  -- 어느 광석인지 가린다.
  --
  -- 실측(새 판): 석탄 광맥 위에 채굴기 여섯 대가 북쪽을 보고 상자에
  -- 떨구고 있었다. 석탄은 automate_coal 로 가서 «서로 마주보는 쌍»이
  -- 되어야 하는데, 그 분기를 타지 않은 것들이다.
  --
  -- 이름을 안 주니 「그 근처의 자원」을 전부 후보로 봤고, 돌을 자동화하러
  -- 간 일감이 반경 안의 석탄 칸을 집어 상자를 달았다. 게다가 방금 매장량
  -- 내림차순 정렬을 넣었으니, 근처에 더 두꺼운 다른 광석이 있으면 언제나
  -- 그쪽을 고르게 된다 - 고치려던 것이 더 크게 어긋날 뻔했다.
  local filter = { position = { x, y }, radius = reach, limit = 600 }
  if want then filter.name = want else filter.type = "resource" end
  local ore = surface.find_entities_filtered(filter)

  -- 두꺼운 칸부터 본다.
  --
  -- 5회차에 매장량으로 자리를 매기게 고쳤는데, 후보를 «엔진이 주는 순서»로
  -- 마흔 개만 모은 뒤 그 안에서 줄을 세웠다. 그 순서는 광맥 테두리부터라,
  -- 테두리 마흔 개를 줄 세운 것에 지나지 않았다.
  --
  -- 실측(새 판): 석탄 채굴기 넷이 777 / 656 / 502 / 272 위에 섰다. 같은
  -- 광맥의 가장 두꺼운 칸은 2,117이고 평균은 693이다. 넷 중 셋이 평균
  -- 이하였고 하나는 평균의 40%였다.
  --
  -- 줄 세우기를 «고른 다음»이 아니라 «고르기 전»에 한다. 그러면 처음
  -- 몇 개만 시험해도 두꺼운 자리가 나온다.
  table.sort(ore, function(p, q) return p.amount > q.amount end)

  local sites = {}
  local tried = 0
  for _, patch in pairs(ore) do
    local spot = patch.position
    if not blocks_lane(spot, 1) then
      for _, dir in pairs(DIRECTIONS) do
        if surface.can_place_entity {
          name = "burner-mining-drill", position = spot, direction = dir,
          force = force,
        } and not blocks_lane(drop_tile(spot, dir), 1) then
          local ok, how = outlet_ok(surface, force, drop_tile(spot, dir), receiver)
          if ok then
            local drop = drop_tile(spot, dir)
            local rich = richness(surface, spot)
            sites[#sites + 1] = {
              x = spot.x, y = spot.y, direction = dir, outlet = how,
              drop_x = drop.x, drop_y = drop.y,
              resource = patch.name,
              richness = rich,
              seconds = math.floor(rich / 0.25),
              distance = math.floor(Tasks.dist(b.position, spot) * 10) / 10,
            }
            break
          end
        end
      end
      tried = tried + 1
    end
    -- 두꺼운 순으로 보고 있으므로 여덟 자리를 찾으면 그만 본다. 더 봐도
    -- 더 좋은 자리는 안 나온다.
    if #sites >= 8 or tried > 200 then break end
  end

  -- 한 번 더 정확히. 정렬 기준은 한 칸의 양이었지만, 채굴기가 먹는 것은
  -- 2x2 네 칸의 합이다. 둘은 대체로 같이 가지만 같지는 않다.
  table.sort(sites, function(p, q) return p.richness > q.richness end)
  return { agent = name, sites = sites }
end

local function coal_pair_site(name, x, y, radius, pairs_wanted)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local reach = math.min(radius or 16, 40)
  local coal = surface.find_entities_filtered {
    position = { x, y }, radius = reach, name = "coal", limit = 400,
  }

  -- 두꺼운 칸부터. 채굴기 자리를 고를 때와 같은 이유다 - 엔진이 주는
  -- 순서는 광맥 테두리부터라, 그대로 쓰면 제일 얇은 곳에 쌍을 세운다.
  table.sort(coal, function(p, q) return p.amount > q.amount end)

  -- 마주보는 축 두 가지. 두 대가 2타일 간격으로 서로를 본다. 각자 캔
  -- 석탄이 상대의 연료함으로 직행해서 둘이 서로를 영원히 먹인다.
  local axes = {
    { step = { x = 2, y = 0 },
      first = defines.direction.east, second = defines.direction.west },
    { step = { x = 0, y = 2 },
      first = defines.direction.south, second = defines.direction.north },
  }

  -- 쌍을 여러 벌 돌려준다. 사용자가 말한 「네 개를 서로 마주보게」는
  -- 이 쌍 두 벌이다. 재료가 되는 만큼 세우면 된다.
  local want = math.max(1, math.min(pairs_wanted or 2, 4))
  local found, taken = {}, {}

  local function busy(p)
    for _, seat in pairs(taken) do
      if math.abs(seat.x - p.x) < 2 and math.abs(seat.y - p.y) < 2 then
        return true
      end
    end
    return false
  end

  for _, patch in pairs(coal) do
    local one = patch.position
    for _, axis in pairs(axes) do
      local two = { x = one.x + axis.step.x, y = one.y + axis.step.y }
      if not busy(one) and not busy(two)
          and surface.can_place_entity {
            name = "burner-mining-drill", position = one,
            direction = axis.first, force = force }
          and surface.can_place_entity {
            name = "burner-mining-drill", position = two,
            direction = axis.second, force = force } then
        found[#found + 1] = {
          first = { x = one.x, y = one.y, direction = axis.first },
          second = { x = two.x, y = two.y, direction = axis.second },
          richness = richness(surface, one) + richness(surface, two),
          distance = math.floor(Tasks.dist(b.position, one)),
        }
        taken[#taken + 1] = one
        taken[#taken + 1] = two
        break
      end
    end
    if #found >= want then break end
  end

  if #found == 0 then
    return { error = "no room for a facing pair on coal" }
  end
  -- 예전 이름도 남겨둔다. 첫 쌍만 쓰던 호출부가 그대로 돌아간다.
  return {
    agent = name, pairs = found,
    first = found[1].first, second = found[1].second,
    distance = found[1].distance,
  }
end

local function aim_drill(name, x, y)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local drill = b.surface.find_entities_filtered {
    position = { x, y }, radius = 1.5, type = "mining-drill", force = b.force, limit = 1,
  }[1]
  if not drill then return { error = "no drill at " .. x .. "," .. y } end

  local ok = outlet_ok(b.surface, b.force, drop_tile(drill.position, drill.direction))
  if ok then
    local drop = drill.drop_position
    return { turned = false, x = drill.position.x, y = drill.position.y,
             drop_x = drop.x, drop_y = drop.y }
  end

  for _, dir in pairs(DIRECTIONS) do
    if dir ~= drill.direction
        and outlet_ok(b.surface, b.force, drop_tile(drill.position, dir)) then
      drill.direction = dir
      local drop = drill.drop_position
      return { turned = true, direction = dir,
               x = drill.position.x, y = drill.position.y,
               drop_x = drop.x, drop_y = drop.y }
    end
  end
  return { error = "every side of the drill is blocked" }
end

-- 공장이 실제로 «돌고 있는가». 세운 수가 아니라 도는 수를 센다.
--
-- 실측(259분째): 버너 채굴기 194대 중 도는 것은 24대(12%)였다. 101대는
-- 상자가 꽉 차서, 57대는 연료가 없어서, 12대는 밑의 광석이 다 떨어져서
-- 서 있었다. 그런데 무리는 계속 채굴기를 더 세우고 있었다 - 「세운 수」만
-- 셌기 때문이다. 스물넷이 도는데 백칠십이 서 있으면, 문제는 부족이 아니라
-- 막힘이다. 한 대 더 세우는 것은 낭비를 한 대 더 세우는 것이다.
-- 기계 한 대를 「영구히」 먹이는 장치의 자리를 찾는다.
--
--   [석탄 상자] -> [버너 인서터] -> [기계]
--
-- 이게 되는 이유: 버너 인서터는 자기가 나르는 물건이 연료일 때만 그중
-- 일부를 떼어 자기 연료로 쓴다. 석탄을 나르는 인서터는 영원히 자급한다.
-- (광석을 나르는 인서터는 안 된다 - 그쪽은 손이 계속 가야 한다.)
--
-- 규모 계산(리서치): 인서터 처리량 0.79개/s, 채굴기 한 대의 연료 소비
-- 0.0375개/s. 인서터 한 대가 채굴기 스물한 대분을 감당한다. 채굴기 66대가
-- 굶는 것은 처리량 한계가 아니라 인서터가 안 박혀서다.
--
-- 방향 실측(2026-09-18): 인서터의 direction 은 「집는 쪽」이다. dir=north 면
-- 북쪽에서 집어 남쪽에 놓는다. 반대로 알았으면 거꾸로 놓을 뻔했다.
local function fuel_rig(name, x, y)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local machine = nil
  for _, e in pairs(surface.find_entities_filtered {
    position = { x, y }, radius = 1.6, force = force,
  }) do
    if e.type ~= "character" and e.type ~= "item-entity"
        and e.type ~= "inserter" and e.type ~= "container" then
      machine = e
      break
    end
  end
  if not machine then
    return { error = string.format("nothing to feed at %.0f,%.0f", x, y) }
  end

  local box = machine.bounding_box
  local half = math.max((box.right_bottom.x - box.left_top.x) / 2,
                        (box.right_bottom.y - box.left_top.y) / 2)
  local at = machine.position

  local sides = {
    { d = defines.direction.north, ux = 0, uy = -1 },
    { d = defines.direction.east, ux = 1, uy = 0 },
    { d = defines.direction.south, ux = 0, uy = 1 },
    { d = defines.direction.west, ux = -1, uy = 0 },
  }

  for _, side in ipairs(sides) do
    -- 인서터는 기계 바로 바깥, 상자는 그 한 칸 더 바깥.
    local arm = { x = at.x + side.ux * (half + 0.5),
                  y = at.y + side.uy * (half + 0.5) }
    local shelf = { x = at.x + side.ux * (half + 1.5),
                    y = at.y + side.uy * (half + 1.5) }

    -- 이미 상자가 있으면 그것을 쓴다. 옆에 또 놓을 이유가 없다.
    local standing = surface.find_entities_filtered {
      position = { shelf.x, shelf.y }, radius = 0.4, type = "container",
      force = force, limit = 1,
    }[1]

    local arm_free = surface.can_place_entity {
      name = "burner-inserter", position = arm, direction = side.d, force = force,
    }
    local shelf_free = standing ~= nil or surface.can_place_entity {
      name = "iron-chest", position = shelf, force = force,
    }

    if arm_free and shelf_free then
      -- 세워보고 실제로 기계를 향해 놓는지 확인한다. 기하를 믿지 않는다.
      local probe = surface.create_entity {
        name = "burner-inserter", position = arm, direction = side.d,
        force = force, raise_built = false,
      }
      local aims = false
      if probe then
        local drop = probe.drop_position
        aims = drop.x > box.left_top.x and drop.x < box.right_bottom.x
           and drop.y > box.left_top.y and drop.y < box.right_bottom.y
        probe.destroy()
      end
      if aims then
        return {
          machine = machine.name,
          inserter = { x = arm.x, y = arm.y, direction = side.d },
          chest = { x = shelf.x, y = shelf.y, standing = standing ~= nil },
        }
      end
    end
  end

  return { error = "no room beside " .. machine.name }
end

-- 급유 장치는 세웠는데 상자가 빈 것들.
--
-- 실측(315분째): 버너 인서터 30대를 세웠더니 29대가
-- waiting_for_source_items 였다. 빈 찬장을 서른 개 지어놓은 셈이다.
-- 장치를 세우는 것과 밥을 넣는 것은 다른 일인데 하나로 묶어두고
-- 「넣기」쪽이 실패해도 조용히 넘어가고 있었다.
--
-- 인서터가 집는 칸을 그대로 물어본다. 상자가 어디 있는지 다시 계산할
-- 이유가 없다 - 인서터 자신이 알고 있다.
-- 갇힌 에이전트를 꺼낸다.
--
-- 실측(429분째): 한 명이 (92.2, 6.1)에 서서 한 시간 넘게 같은 실패만
-- 반복했다. 호숫가였고, 그 열은 북쪽으로만 뚫려 있는데 모든 일감은
-- 남서쪽 150타일 밖이었다. 서로 다른 실패 44종 중 25종이 이 한 좌표에서
-- 나왔다. 여덟 중 하나가 죽은 인력이었을 뿐 아니라, 동쪽 일감에 「가장
-- 가까운 사람」이라 배차를 계속 빨아들이고 있었다.
--
-- 걸어서 못 나오는 곳에 있으면 걸어서 꺼낼 수 없다. 동료 옆으로 옮긴다.
-- 조립기에 무엇을 만들지 정해준다. 레시피 없는 조립기는 전기만 먹는다.
local function set_recipe(name, x, y, recipe_name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local machine = b.surface.find_entities_filtered {
    position = { x, y }, radius = 1.6, type = "assembling-machine",
    force = b.force, limit = 1,
  }[1]
  if not machine then
    return { error = string.format("no assembler at %.0f,%.0f", x, y) }
  end
  local recipe = b.force.recipes[recipe_name]
  if not recipe then return { error = "no such recipe: " .. tostring(recipe_name) } end
  if not recipe.enabled then
    return { error = recipe_name .. " is not researched yet" }
  end

  local ok, err = pcall(function() machine.set_recipe(recipe) end)
  if not ok then return { error = tostring(err) } end
  return { agent = name, recipe = recipe_name,
           x = machine.position.x, y = machine.position.y }
end

-- 랩 옆에 조립기를 놓을 자리와, 그 사이 인서터 자리를 찾는다.
--
--   [조립기] → [인서터] → [랩]
--
-- 조립기 1호 한 대가 만드는 과학팩은 0.1개/초, 랩 한 대가 먹는 것도
-- 0.1개/초다. 정확히 한 대가 한 대를 채운다 - 리서치에서 나온 수치이고,
-- 초반에 이보다 깔끔한 비율은 없다.
--
-- 자리는 계산하지 않고 세워보고 묻는다. 인서터가 실제로 조립기에서 집어
-- 랩에 넣는지는 pickup_position 과 drop_position 이 답해준다.
local function assembler_site(name, x, y, arm)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  arm = arm or "inserter"

  local surface, force = b.surface, b.force
  local lab = surface.find_entities_filtered {
    position = { x, y }, radius = 2, name = "lab", force = force, limit = 1,
  }[1]
  if not lab then
    return { error = string.format("no lab at %.0f,%.0f", x, y) }
  end

  -- 실측(699분째): 조립기를 랩에서 네 칸 떨어뜨리고 그 사이에 인서터를
  -- 놓았더니, 인서터가 집는 칸이 조립기 충돌 상자에 0.2타일만 걸쳤다.
  -- 3x3 엔티티의 충돌 상자는 타일 발자국보다 0.3씩 안쪽이라 계산이
  -- 아슬아슬하게 빗나간다. 과학팩 열 개를 만들어놓고 인서터가 허공을
  -- 집고 있었다.
  --
  -- 그래서 좌표를 믿지 않는다. 임시로 세워보고 «네가 무엇을 집고 무엇에
  -- 넣느냐»를 인서터에게 직접 묻는다. pickup_target 과 drop_target 이
  -- 그 답이고, 그보다 확실한 근거는 없다.
  local sides = {
    { d = defines.direction.north, ux = 0, uy = -1 },
    { d = defines.direction.east, ux = 1, uy = 0 },
    { d = defines.direction.south, ux = 0, uy = 1 },
    { d = defines.direction.west, ux = -1, uy = 0 },
  }

  for _, side in ipairs(sides) do
    for gap = 3, 5 do
      local at = lab.position
      local hand = { x = at.x + side.ux * 2, y = at.y + side.uy * 2 }
      local shop = { x = at.x + side.ux * gap, y = at.y + side.uy * gap }

      if surface.can_place_entity {
        name = arm, position = hand, direction = side.d, force = force,
      } and surface.can_place_entity {
        name = "assembling-machine-1", position = shop, force = force,
      } then
        local mill = surface.create_entity {
          name = "assembling-machine-1", position = shop, force = force,
          raise_built = false,
        }
        local probe = mill and surface.create_entity {
          name = arm, position = hand, direction = side.d, force = force,
          raise_built = false,
        }
        local joined = false
        if probe then
          joined = probe.pickup_target == mill and probe.drop_target == lab
        end
        if probe then probe.destroy() end
        if mill then mill.destroy() end

        if joined then
          return {
            lab = { x = at.x, y = at.y },
            inserter = { x = hand.x, y = hand.y, direction = side.d, name = arm },
            assembler = { x = shop.x, y = shop.y },
          }
        end
      end
    end
  end
  return { error = "no room for an assembler beside the lab" }
end

local function unstick(name, x, y)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local target = nil
  if x and y then
    target = { x = x, y = y }
  else
    -- 목적지를 안 주면 가장 가까운 동료 옆으로. 동료가 서 있는 곳은
    -- 적어도 동료가 걸어간 곳이다.
    local near = math.huge
    for _, other in pairs(storage.agents or {}) do
      local mate = body(other)
      if mate and mate.valid and mate ~= b then
        local d = Tasks.dist(b.position, mate.position)
        if d < near then near, target = d, mate.position end
      end
    end
  end
  if not target then return { error = "nowhere to move to" } end

  local spot = b.surface.find_non_colliding_position(
    "character", target, 24, 0.5)
  if not spot then return { error = "no room near the target" } end

  local was = { x = b.position.x, y = b.position.y }
  if not b.teleport(spot, b.surface) then
    return { error = "teleport refused" }
  end
  return {
    agent = name,
    from = was,
    to = { x = spot.x, y = spot.y },
    moved = math.floor(Tasks.dist(was, spot)),
  }
end

-- 얇은 자리에 선 채굴기.
--
-- 실측(새 판 34분째): 매장량 기준으로 자리를 고치기 전에 세운 석탄 채굴기
-- 둘이 120과 162 위에 앉아 있었다. 0.25/s 로 8분이면 마른다. 같은 광맥의
-- 두꺼운 칸은 2,000이 넘는다.
--
-- 완전히 마를 때까지(no_minable_resources) 기다릴 이유가 없다. 걷어내서
-- 두꺼운 자리에 다시 세우면 한 번의 걸음으로 열여섯 배가 된다. 마르기를
-- 기다리는 것은 그 자리에서 8분을 더 캐려고 20분을 버리는 일이다.
-- 두 점을 잇는 벨트 길을 놓는다.
--
--   [채굴기] → [벨트][벨트][벨트] → [인서터] → [화로]
--
-- 채굴기는 벨트에 «직접» 떨군다. 인서터가 필요한 곳은 화로 쪽 하나뿐이다.
-- 이 한 줄이 지금까지 측정된 병목 둘을 동시에 없앤다 - 꽉 찬 상자에 막힌
-- 채굴기와, 그 옆에서 굶는 화로.
--
-- 길은 ㄱ 자로 꺾는다. 벨트는 직진과 직각 회전만 하므로 그것으로 충분하고,
-- 꺾는 순서를 둘 다 시험해서 되는 쪽을 쓴다.
local function belt_route(name, fx, fy, tx, ty, kind)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  kind = kind or "transport-belt"

  local surface, force = b.surface, b.force
  local from = { x = math.floor(fx) + 0.5, y = math.floor(fy) + 0.5 }
  local goal = { x = math.floor(tx) + 0.5, y = math.floor(ty) + 0.5 }

  local function dir_of(from_tile, to_tile)
    if to_tile.x > from_tile.x then return defines.direction.east end
    if to_tile.x < from_tile.x then return defines.direction.west end
    if to_tile.y > from_tile.y then return defines.direction.south end
    return defines.direction.north
  end

  -- 한 축을 먼저 맞추고 다른 축을 맞춘다. 두 순서를 다 본다.
  local function walk(first_axis)
    local tiles, here = {}, { x = from.x, y = from.y }
    local function step_to(target, axis)
      while (axis == "x" and here.x ~= target.x)
          or (axis == "y" and here.y ~= target.y) do
        local nxt = { x = here.x, y = here.y }
        if axis == "x" then
          nxt.x = here.x + (target.x > here.x and 1 or -1)
        else
          nxt.y = here.y + (target.y > here.y and 1 or -1)
        end
        tiles[#tiles + 1] = { x = here.x, y = here.y, dir = dir_of(here, nxt) }
        here = nxt
        if #tiles > 120 then return false end
      end
      return true
    end
    if first_axis == "x" then
      if not step_to(goal, "x") then return nil end
      if not step_to(goal, "y") then return nil end
    else
      if not step_to(goal, "y") then return nil end
      if not step_to(goal, "x") then return nil end
    end
    -- 마지막 칸은 목적지를 향한 채로 끝난다.
    tiles[#tiles + 1] = { x = here.x, y = here.y,
                          dir = #tiles > 0 and tiles[#tiles].dir
                                or dir_of(here, goal) }
    return tiles
  end

  for _, order in ipairs({ "x", "y" }) do
    local tiles = walk(order)
    if tiles then
      local blocked = nil
      for _, t in ipairs(tiles) do
        if not surface.can_place_entity {
          name = kind, position = { t.x, t.y }, direction = t.dir, force = force,
        } then
          -- 이미 우리 벨트가 같은 방향으로 서 있으면 막힌 게 아니다.
          local standing = surface.find_entities_filtered {
            position = { t.x, t.y }, radius = 0.3, name = kind,
            force = force, limit = 1,
          }[1]
          if not (standing and standing.direction == t.dir) then
            blocked = t
            break
          end
        end
      end
      if not blocked then
        return { agent = name, kind = kind, tiles = tiles, length = #tiles }
      end
    end
  end
  return { error = "no clear belt route" }
end

-- 출구가 없는 채굴기. 버너 채굴기는 캔 것을 앞칸에 «떨군다» - 거기에 아무것도
-- 없으면 땅바닥에 쌓이고, 그 칸이 차면 채굴기가 선다.
--
-- 실측(이 맵, 2026-09-18): 채굴기 81대 중 57대가 이 상태였다. drop_target 이
-- 전부 nil 이고, 그 옆에서 화로 63대 중 60대가 광석이 없어 놀고 있었다.
-- 캐는 쪽과 녹이는 쪽이 둘 다 멈춰 있었고 둘을 잇는 것이 하나도 없었다.
--
-- 버너 시대의 정석은 «떨구는 자리에 화로를 놓는 것»이다. 인서터도 벨트도
-- 전기도 필요 없다 - 채굴기가 화로 안으로 직접 넣는다. 채굴기 0.25/s,
-- 돌화로 0.3125/s 이므로 한 대에 한 대가 맞다.
--
-- 돌화로는 2x2 라 중심이 정수 좌표다. 떨구는 칸을 덮는 중심은 넷 중 하나다.
local function furnace_over(surface, force, drop)
  local tx, ty = math.floor(drop.x), math.floor(drop.y)
  for _, seat in pairs({ { x = tx, y = ty }, { x = tx + 1, y = ty },
                         { x = tx, y = ty + 1 }, { x = tx + 1, y = ty + 1 } }) do
    if surface.can_place_entity {
      name = "stone-furnace", position = seat, force = force,
    } then
      -- 정말 그 칸을 덮는지 확인한다. 덮지 않으면 채굴기는 여전히 허공에
      -- 떨군다 - 「놓기는 놓았는데 안 이어진」 것이 이 저장소의 단골 실수다.
      local box = { { seat.x - 1, seat.y - 1 }, { seat.x + 1, seat.y + 1 } }
      if drop.x >= box[1][1] and drop.x <= box[2][1]
         and drop.y >= box[1][2] and drop.y <= box[2][2] then
        return seat
      end
    end
  end
  return nil
end

return {
  DIRECTIONS = DIRECTIONS,
  LANE_EVERY = LANE_EVERY,
  aim_drill = aim_drill,
  assembler_site = assembler_site,
  belt_route = belt_route,
  blocking = blocking,
  blocks_lane = blocks_lane,
  coal_pair_site = coal_pair_site,
  drill_site = drill_site,
  drop_tile = drop_tile,
  fuel_rig = fuel_rig,
  furnace_over = furnace_over,
  outlet_ok = outlet_ok,
  richness = richness,
  set_recipe = set_recipe,
  threat = threat,
  unstick = unstick,
}

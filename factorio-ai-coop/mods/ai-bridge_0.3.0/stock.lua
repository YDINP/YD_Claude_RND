-- 무엇이 어디에 얼마나 있는가, 그리고 무엇이 멈춰 있는가.

local Tasks = require("tasks")
local Core = require("core")
local MAX_OBSERVE_RADIUS = Core.MAX_OBSERVE_RADIUS
local agent              = Core.agent
local body               = Core.body
local Craft = require("craft")
local smelted_from = Craft.smelted_from
local Sites = require("sites")
local furnace_over = Sites.furnace_over
local richness     = Sites.richness

---------------------------------------------------------- 화로에 남은 것

-- 제련을 시켜놓고 못 돌아오는 일은 계속 생긴다 - 작업이 시간을 넘기거나,
-- 사람이 캐릭터를 넘겨받거나, 그냥 다른 급한 일이 끼어든다. 그때 판금은
-- 화로 안에 그대로 남고, 아무도 그걸 세지 않는다. 광석을 새로 캐는 것보다
-- 이미 녹은 걸 꺼내오는 편이 언제나 싸다.

-- 상자에 무엇이 들어 있는가. 석탄 드릴의 상자에는 석탄이 쌓이는데,
-- 정작 굶는 드릴에 그걸 가져다 넣는 작업이 없어서 여섯 중 넷이 «석탄을
-- 넣겠습니다»만 반복하고 있었다. 가진 곳을 알아야 나를 수 있다.
-- 상자들 안에 무엇이 얼마나 들어 있는가. 품목을 지정하지 않고 통째로.
--
-- 사람이 «상자에 석탄 많이 남았잖아»라고 말했는데 반장이 «석탄이 없습니다»로
-- 답한 적이 있다. 반장이 본 것은 각자의 가방뿐이었다. 없는 것을 근거로
-- 판단한 게 아니라, 보이지 않는 것을 없다고 판단한 것이다.
local function stores(name, radius, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or MAX_OBSERVE_RADIUS, MAX_OBSERVE_RADIUS)
  local out, total = {}, {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, type = "container", force = b.force,
  }) do
    local inv = e.get_inventory(defines.inventory.chest)
    if inv and not inv.is_empty() then
      local items = {}
      for _, stack in pairs(inv.get_contents()) do
        items[stack.name] = (items[stack.name] or 0) + stack.count
        total[stack.name] = (total[stack.name] or 0) + stack.count
      end
      out[#out + 1] = {
        x = e.position.x, y = e.position.y, items = items,
        distance = math.floor(Tasks.dist(b.position, e.position) * 10) / 10,
      }
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)

  local near = {}
  for i = 1, math.min(#out, limit or 12) do near[i] = out[i] end
  return { agent = name, chests = near, chest_count = #out, total = total }
end

-- 서로 마주보는 석탄 채굴기 한 쌍은 캔 석탄을 서로의 연료칸에 넣는다. 그래서
-- 이 구조물에는 출력 상자가 없고, 캐낸 석탄이 전부 연료칸에 쌓인다.
--
-- 즉 이 쌍은 «스스로 채워지는 석탄 창고»다. 사람이 쓸 몫은 연료칸에서 덜어
-- 오면 된다. 한 대가 태우는 것은 초당 0.0375개인데 캐는 것은 0.25개이니,
-- 이만큼만 남겨두면 다시 가득 찰 때까지 멈추지 않는다.
local COAL_KEEP = 25

local function coal_banks(surface, force, near, reach, keep)
  local out = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = near, radius = reach, name = "burner-mining-drill", force = force,
  }) do
    -- 석탄을 캐는 채굴기만이다. 철광석 위에 선 채굴기의 연료를 빼 가면
    -- 그것은 창고에서 꺼내는 게 아니라 그 기계를 세우는 일이다.
    local digs = e.mining_target
    local on_coal = digs ~= nil and digs.valid and digs.name == "coal"
    if not on_coal then
      on_coal = surface.find_entities_filtered {
        area = e.bounding_box, name = "coal", limit = 1,
      }[1] ~= nil
    end
    if on_coal then
      local fuel = e.get_fuel_inventory()
      local held = fuel and fuel.get_item_count("coal") or 0
      local spare = held - (keep or COAL_KEEP)
      if spare > 0 then
        out[#out + 1] = {
          x = e.position.x, y = e.position.y, count = spare, held = held,
          well = true,
          distance = math.floor(Tasks.dist(near, e.position) * 10) / 10,
        }
      end
    end
  end
  return out
end

local function chest_stock(name, item, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or MAX_OBSERVE_RADIUS, MAX_OBSERVE_RADIUS)
  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, type = "container", force = b.force,
  }) do
    local inv = e.get_inventory(defines.inventory.chest)
    if inv then
      local held = inv.get_item_count(item)
      if held > 0 then
        out[#out + 1] = {
          x = e.position.x, y = e.position.y, count = held,
          distance = math.floor(Tasks.dist(b.position, e.position) * 10) / 10,
        }
      end
    end
  end
  -- 석탄은 상자에만 있는 것이 아니다. 자급쌍의 연료칸이 곧 석탄 창고다.
  if item == "coal" then
    for _, well in pairs(coal_banks(b.surface, b.force, b.position, reach)) do
      out[#out + 1] = well
    end
  end

  table.sort(out, function(p, q) return p.distance < q.distance end)
  return { agent = name, item = item, chests = out }
end

local function furnace_stock(name, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or MAX_OBSERVE_RADIUS, MAX_OBSERVE_RADIUS)
  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, type = "furnace", force = b.force,
  }) do
    local result = e.get_output_inventory()
    if result and not result.is_empty() then
      -- 이 판금이 «다른» 광석을 막고 있는가.
      --
      -- 실측: 구리판 1개가 철광석 54개를 막고 있었다. 거두는 기준이
      -- 「10개 이상」이라 그 한 개는 영영 안 거둬졌고, 화로는 영영 멈춰
      -- 있었다. 양이 적을수록 오래 막는 셈이다.
      local waiting = nil
      local src = e.get_inventory(defines.inventory.furnace_source)
      if src then
        for _, st in pairs(src.get_contents()) do waiting = st.name break end
      end
      for _, stack in pairs(result.get_contents()) do
        out[#out + 1] = {
          name = stack.name, count = stack.count,
          x = e.position.x, y = e.position.y,
          jammed = waiting ~= nil
            and smelted_from(b.force, waiting) ~= stack.name or nil,
          waiting = waiting,
          distance = math.floor(Tasks.dist(b.position, e.position) * 10) / 10,
        }
      end
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  return { agent = name, stock = out }
end

-------------------------------------------------------- 멈춰 선 기계 찾기

-- 숙련자들이 입을 모으는 첫 번째 원칙이 «병목을 쫓아라»인데, 우리 에이전트는
-- 무엇이 멈췄는지 볼 눈이 없었다. 연료가 떨어진 채굴기, 출력이 꽉 찬 화로,
-- 상자 없이 땅에 광석을 떨구다 멈춘 드릴 - 전부 지어놓고 잊은 것들이다.
--
-- 짐작할 필요가 없다. 게임이 기계마다 status 를 갖고 있고, 거기에 «왜 안
-- 도는지»가 적혀 있다.

local STATUS_NAME = {}

local FIXABLE = {}

local function init_status_names()
  if next(STATUS_NAME) then return end
  for label, value in pairs(defines.entity_status) do
    STATUS_NAME[value] = label
  end
  -- 우리가 손으로 고칠 수 있는 것들. 나머지(전력 없음 등)는 사람 손이 아니라
  -- 설비가 필요한 문제라 여기서 다루지 않는다.
  FIXABLE[defines.entity_status.no_fuel] = "fuel"
  FIXABLE[defines.entity_status.full_output] = "empty"
  FIXABLE[defines.entity_status.full_burnt_result_output] = "empty"
  if defines.entity_status.not_enough_space_in_output then
    FIXABLE[defines.entity_status.not_enough_space_in_output] = "empty"
  end
  if defines.entity_status.waiting_for_space_in_destination then
    FIXABLE[defines.entity_status.waiting_for_space_in_destination] = "chest"
  end
  -- 빈 화로는 고장이 아니지만 놀고 있는 것도 사실이다. 공장은 끊임없이
  -- 돌아야 하므로 «먹일 것»으로 따로 표시한다. 우선순위는 파이썬이 정한다 -
  -- 진짜 고장보다 뒤로 밀어야 노는 화로가 병목을 가리지 않는다.
  if defines.entity_status.no_ingredients then
    FIXABLE[defines.entity_status.no_ingredients] = "feed"
  end
  -- 밑의 광석이 다 떨어진 채굴기. 이건 「고장」이 아니라 「끝난 것」이라
  -- 손볼 방법이 없다. 그대로 두면 자리만 차지하고 영원히 안 돈다.
  -- 걷어내면 채굴기가 통째로 재고로 돌아와 두꺼운 자리에 다시 선다.
  if defines.entity_status.no_minable_resources then
    FIXABLE[defines.entity_status.no_minable_resources] = "spent"
  end
  -- 전기는 들어왔는데 과학팩이 없는 랩. 실측(539분째): 랩이 이 상태로
  -- 서 있는 동안 에이전트 둘이 빨간 과학팩을 열 개씩 주머니에 넣고
  -- 다니고 있었다. 만들어 놓고 넣지를 않아서 아홉 시간 동안 연구가
  -- 멈춰 있었다. 이건 사람 손으로 고칠 수 있는 종류다.
  if defines.entity_status.missing_science_packs then
    FIXABLE[defines.entity_status.missing_science_packs] = "science"
  end
  -- 레시피는 들어갔는데 재료가 없는 조립기. 무엇이 몇 개 모자란지는
  -- 레시피와 입력 칸을 견주면 게임이 답해준다 - 짐작할 이유가 없다.
  if defines.entity_status.item_ingredient_shortage then
    FIXABLE[defines.entity_status.item_ingredient_shortage] = "supply"
  end
end

local TENDED = { "burner-mining-drill", "stone-furnace", "steel-furnace",
                 "electric-furnace", "assembling-machine-1", "boiler", "lab" }

local function broken(name, radius)
  init_status_names()
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or MAX_OBSERVE_RADIUS, MAX_OBSERVE_RADIUS)
  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, name = TENDED, force = b.force,
  }) do
    local fix = FIXABLE[e.status]
    if fix then
      local entry = {
        name = e.name, fix = fix,
        status = STATUS_NAME[e.status] or tostring(e.status),
        x = e.position.x, y = e.position.y,
        distance = math.floor(Tasks.dist(b.position, e.position) * 10) / 10,
      }
      -- 조립기가 무엇을 기다리는지. 레시피의 재료에서 이미 든 것을 빼면
      -- 그것이 가져다줄 목록이다.
      if fix == "supply" then
        local recipe = e.get_recipe and e.get_recipe()
        local box = e.get_inventory(defines.inventory.assembling_machine_input)
        if recipe and box then
          entry.wants = {}
          for _, ing in pairs(recipe.ingredients) do
            if ing.type ~= "fluid" then
              local have = box.get_item_count(ing.name)
              local need = (ing.amount or 1) * 10   -- 열 번 돌릴 만큼
              if have < need then
                entry.wants[#entry.wants + 1] = {
                  name = ing.name, count = need - have,
                }
              end
            end
          end
        end
      end

      -- 내놓을 데가 없어 멈춘 채굴기: 상자가 아예 없는 것과 꽉 찬 것은
      -- 손보는 방법이 다르다. 무엇이 얼마나 들었는지까지 알려준다.
      if fix == "chest" and e.drop_target and e.drop_target.valid then
        local inv = e.drop_target.get_output_inventory()
            or e.drop_target.get_inventory(defines.inventory.chest)
        if inv then
          for _, stack in pairs(inv.get_contents()) do
            entry.holding = stack.name
            entry.held = stack.count
            break
          end
        end
        entry.outlet = { x = e.drop_target.position.x, y = e.drop_target.position.y }
      end
      out[#out + 1] = entry
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  return { agent = name, stopped = out }
end

local function hungry_rigs(name, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or MAX_OBSERVE_RADIUS, MAX_OBSERVE_RADIUS)
  local out = {}
  for _, arm in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, type = "inserter", force = b.force,
  }) do
    if arm.status == defines.entity_status.waiting_for_source_items then
      local at = arm.pickup_position
      local shelf = b.surface.find_entities_filtered {
        position = at, radius = 0.6, type = "container", force = b.force, limit = 1,
      }[1]
      if shelf then
        local inv = shelf.get_inventory(defines.inventory.chest)
        local held = inv and inv.get_item_count("coal") or 0
        if held < 10 then
          out[#out + 1] = {
            x = shelf.position.x, y = shelf.position.y, coal = held,
            distance = math.floor(Tasks.dist(b.position, shelf.position) * 10) / 10,
          }
        end
      end
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  local near = {}
  for i = 1, math.min(#out, 12) do near[i] = out[i] end
  return { agent = name, empty = near, total = #out }
end

-- 기지가 어디인가 - 우리 건물 전체의 무게중심. 반경으로 자르지 않는다.
--
-- 에이전트 중심의 조회(observe, health, blind_drills ...)는 전부 그 사람
-- 반경 200 안만 본다. 그래서 한 번 멀리 나가면 기지가 «안 보이고», 안 보이니
-- 할 일이 없고, 할 일이 없으니 돌아올 이유도 못 찾는다. 실측: 요원이
-- (322, 13)에 서 있었고 기지는 x 43~72 였다 - 250타일 밖이라 한 사람도
-- 기지를 보지 못했다. 그때 화로 63대와 눈먼 채굴기 22대가 그대로 멈춰 있었다.
--
-- 그러니 「여기가 기지다」를 말해주는 자리가 하나는 있어야 한다.
local HOME_KINDS = { "burner-mining-drill", "stone-furnace", "boiler",
                     "steam-engine", "lab", "assembling-machine-1" }

local function base()
  local s = game.surfaces[1]
  local sx, sy, n = 0, 0, 0
  local counts = {}
  for _, kind in pairs(HOME_KINDS) do
    local found = s.find_entities_filtered { name = kind, force = game.forces.player }
    counts[kind] = #found
    for _, e in pairs(found) do
      sx, sy, n = sx + e.position.x, sy + e.position.y, n + 1
    end
  end
  if n == 0 then return { home = nil, count = 0 } end
  return { home = { x = math.floor(sx / n + 0.5), y = math.floor(sy / n + 0.5) },
           count = n, counts = counts }
end

-- 기지에서 너무 멀리 떨어져 홀로 선 우리 건물들.
--
-- 화로가 한 줄로 동쪽으로 274타일 도망간 자리다. 그 끝의 화로들은 광석이
-- 닿지 않으니 영원히 놀고, 대신 사람을 그쪽으로 끌고 간다. 걷어내면 화로가
-- 통째로 손에 돌아오고, 그 손으로 눈먼 채굴기 앞에 다시 세우면 된다.
-- 제련 블록의 왼쪽 위 모서리. 한 번 정하면 바뀌지 않는다.
--
-- 지금까지 화로 자리의 기준점은 «묻는 사람 주변 화로 여덟 대의 평균»이었다.
-- 그래서 사람이 움직일 때마다 기준이 흔들렸고, 화로가 대각선으로 흩뿌려졌다.
-- 기준은 누가 묻든 같아야 하고, 한 번 정해지면 남아 있어야 한다.
local SMELT_W, SMELT_H = 38, 16
local WATER = { "water", "deepwater", "water-shallow", "water-mud",
                "water-green", "deepwater-green" }
local BUILT = { "furnace", "mining-drill", "assembling-machine", "lab",
                "boiler", "generator", "container", "transport-belt",
                "inserter", "electric-pole", "pipe" }

local function smelter(x, y)
  if x and y then
    storage.smelter = { x = math.floor(x), y = math.floor(y) }
    return { smelter = storage.smelter, chosen = true }
  end
  if storage.smelter then return { smelter = storage.smelter } end

  local home = base().home
  if not home then return { smelter = nil } end
  local s = game.surfaces[1]

  -- 자리가 되는가. 빈 땅이면 되는 것이 아니라 «광맥이 아니어야» 된다.
  --
  -- 사용자가 짚었다: "제련을 왜 돌채광지에서해?"
  --
  -- 실측이 그대로였다. 제련 구역 608칸 중 155칸이 돌 광맥이었고, 그 돌
  -- 광맥은 통째로 203타일이었다. 광맥의 76%를 깔고 앉은 것이다. 건물이
  -- 덮은 밑은 영영 못 캔다.
  --
  -- 그렇게 된 까닭은 첫 화로를 «돌 캐던 자리»에서 만들어 그 자리에 놓았고,
  -- 기준점이 그것을 따랐기 때문이다. 첫 화로를 따르는 것은 맞다 - 다만
  -- 광맥 위는 아니다. 광맥은 채굴 구역의 것이고, 제련은 그 옆에 선다.
  local ORE = { "stone", "iron-ore", "copper-ore", "coal", "uranium-ore" }

  local function fits(at)
    local box = { { at.x - 2, at.y - 2 },
                  { at.x + SMELT_W, at.y + SMELT_H } }
    return s.count_entities_filtered { area = box, type = BUILT } <= 1
       and s.count_tiles_filtered { area = box, name = WATER } == 0
       and s.count_entities_filtered { area = box, name = ORE } == 0
  end

  -- 녹일 것에서 가까워야 한다.
  --
  -- 실측(이 맵):
  --
  --     제련 구역  (-12,84)     돌 광맥 옆
  --     철광석     (110,-49)    200타일 밖
  --     구리광석   (80,67)      95타일 밖
  --
  -- 개판의 첫 일이 「돌부터 캐서 화로를 만들겠습니다」이므로 첫 화로는 돌
  -- 광맥 근처에서 만들어진다. 그런데 «돌은 화로의 재료»이지 녹이는 대상이
  -- 아니다. 녹이는 것은 철과 구리다.
  --
  -- 광맥을 피하라는 규칙(앞 커밋)은 맞는데, 하필 광석에서 «멀어지는» 쪽으로
  -- 피했다. 피하는 것과 멀어지는 것은 다르다 - 제련은 광맥 위가 아니라
  -- 광맥 «옆»에 서야 한다.
  local SMELTED = { "iron-ore", "copper-ore" }

  local function ore_gap(at)
    local near = math.huge
    for _, ore in pairs(SMELTED) do
      local found = s.find_entities_filtered {
        position = { at.x + SMELT_W / 2, at.y + SMELT_H / 2 },
        radius = 250, name = ore, limit = 1,
      }[1]
      -- limit=1 은 「아무거나 하나」라 거리를 못 준다. 반경을 좁혀가며
      -- 있는지 물어 가장 가까운 테를 찾는다.
      if found then
        for r = 20, 250, 20 do
          local hit = s.count_entities_filtered {
            position = { at.x + SMELT_W / 2, at.y + SMELT_H / 2 },
            radius = r, name = ore, limit = 1,
          }
          if hit > 0 then near = math.min(near, r) break end
        end
      end
    end
    return near
  end

  -- 이미 선 화로가 있으면 «그것이 0번 자리»다.
  --
  -- 실측(새 판 1분째): 첫 화로가 (49,75)에 섰는데 제련 구역은 (59,75)로
  -- 잡혔다. 열 타일 어긋났고, 그래서 첫 건물이 놓이자마자 「제자리가
  -- 아님」이 되었다. 무리는 그것을 걷어서 열 칸 옆에 다시 놓는다.
  --
  -- 빈 땅을 찾는 것은 맞는 일인데, 화로가 이미 서 있을 때는 틀린 일이다.
  -- 기준점은 «고를» 것이 아니라 이미 정해진 것이다 - 첫 화로가 그것을
  -- 정했다. 열 타일 옮기자고 첫 건물을 걷는 것은 순서가 거꾸로다.
  local standing = s.find_entities_filtered {
    name = "stone-furnace", force = game.forces.player, limit = 2,
  }
  if #standing == 1 then
    local first = { x = math.floor(standing[1].position.x),
                    y = math.floor(standing[1].position.y) }
    -- 첫 화로 자리부터. 안 되면 «그 화로 둘레»로 넓혀간다 - 기지에서
    -- 다시 찾으면 화로가 있는 쪽과 상관없는 데로 가버린다.
    -- 첫 화로 둘레를 훑되, «되는 자리 중 광석에 가장 가까운» 자리를 고른다.
    -- 처음 되는 자리를 집으면 그것이 광석 반대쪽일 수 있다.
    local best, best_gap, best_r = nil, math.huge, nil
    for r = 0, 60, 4 do
      local ring = (r == 0) and { { 0, 0 } }
        or { { r, 0 }, { 0, r }, { -r, 0 }, { 0, -r },
             { r, r }, { -r, r }, { r, -r }, { -r, -r } }
      for _, step in pairs(ring) do
        local at = { x = first.x + step[1], y = first.y + step[2] }
        if fits(at) then
          local gap = ore_gap(at)
          if gap < best_gap then best, best_gap, best_r = at, gap, r end
        end
      end
      -- 광석 옆(스무 타일 안)을 찾았으면 더 볼 것 없다.
      if best and best_gap <= 20 then break end
    end
    if best then
      storage.smelter = best
      return { smelter = best, chosen = true, anchored = true,
               ore_gap = best_gap, nudged = (best_r or 0) > 0 and best_r or nil }
    end
  end

  -- 기지에서 가까운 데부터, 블록이 통째로 들어갈 빈 땅을 찾는다.
  for r = 10, 70, 5 do
    for _, step in pairs({ { r, 0 }, { 0, r }, { -r, 0 }, { 0, -r },
                           { r, r }, { -r, r }, { r, -r }, { -r, -r } }) do
      local at = { x = math.floor(home.x + step[1]),
                   y = math.floor(home.y + step[2]) }
      if fits(at) then
        storage.smelter = at
        return { smelter = at, chosen = true }
      end
    end
  end
  return { smelter = nil, crowded = true }
end

-- 제 구역 «안»에 선 것은 길 잃은 것이 아니다.
--
-- 사용자: "자꾸 돌용광로를 재배치하는 이유가 뭐임"
--
-- 규칙 둘이 같은 화로를 보고 반대로 답하고 있었다:
--
--   misplaced  제자리 아님 {} / 정착 smelt 2      "잘 서 있다"
--   strays     "기지에서 87타일 밖에 홀로 서 있습니다. 걷어오겠습니다"
--
-- 그래서 옮기고, 되돌리고, 또 옮긴다.
--
-- `strays` 가 구역보다 먼저 있던 규칙이라 그렇다. 그때는 「기지에서 멀다」가
-- 곧 「잊고 버려둔 것」이었다. 지금은 아니다 - 제련 구역은 광맥을 피해
-- 일부러 떨어뜨려 놓고, 기지는 채굴기까지 포함한 «움직이는 무게중심»이라
-- 공장이 커질수록 제련 구역에서 멀어진다.
--
-- 거리는 더 이상 길 잃음의 증거가 아니다. 구역이 그 자리를 답한다.
local ZONE_PAD = 4

local function in_own_zone(e)
  local z = storage.zones or {}
  local mine = nil
  if e.type == "furnace" then
    mine = storage.smelter and { x = storage.smelter.x, y = storage.smelter.y,
                                 w = SMELT_W, h = SMELT_H }
  elseif e.type == "lab" or e.type == "assembling-machine" then
    mine = z.craft and { x = z.craft.x, y = z.craft.y, w = 24, h = 14 }
  end
  if not mine then return false end
  return e.position.x >= mine.x - ZONE_PAD
     and e.position.x <= mine.x + mine.w + ZONE_PAD
     and e.position.y >= mine.y - ZONE_PAD
     and e.position.y <= mine.y + mine.h + ZONE_PAD
end

local function strays(kind, far)
  local home = base().home
  if not home then return { strays = {} } end
  local s = game.surfaces[1]
  local out = {}
  for _, e in pairs(s.find_entities_filtered {
    name = kind or "stone-furnace", force = game.forces.player,
  }) do
    local d = Tasks.dist(home, e.position)
    if d > (far or 60) and e.minable and not in_own_zone(e) then
      out[#out + 1] = { name = e.name, x = e.position.x, y = e.position.y,
                        distance = math.floor(d * 10) / 10 }
    end
  end
  -- 가장 먼 것부터. 그쪽이 가장 쓸모없는 자리다.
  table.sort(out, function(p, q) return p.distance > q.distance end)
  local near = {}
  for i = 1, math.min(#out, 12) do near[i] = out[i] end
  return { home = home, strays = near, total = #out }
end

-- 이 채굴기가 지금 무엇에게 넣고 있는가. 놓은 뒤에 확인하기 위한 것이다.
-- 「놓기는 놓았는데 안 이어진」 것이 이 저장소의 단골 실수라, 세우는 쪽마다
-- 게임에 직접 물어보는 짝을 하나씩 둔다.
local function feeds(x, y)
  local d = game.surfaces[1].find_entities_filtered {
    position = { x, y }, radius = 1.5, type = "mining-drill", limit = 1,
  }[1]
  if not d then return { error = string.format("no drill at %s,%s", x, y) } end
  local t = d.drop_target
  return { drill = d.name, onto = t and t.name or nil,
           x = d.position.x, y = d.position.y,
           status = d.status }
end

local function blind_drills(name, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or MAX_OBSERVE_RADIUS, MAX_OBSERVE_RADIUS)
  local out, total = {}, 0
  for _, d in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, type = "mining-drill", force = b.force,
  }) do
    if d.drop_target == nil then
      total = total + 1
      local ore = d.mining_target
      local seat, litter = furnace_over(b.surface, b.force,
                                          d.drop_position)
      if seat then
        out[#out + 1] = {
          x = d.position.x, y = d.position.y,
          ore = (ore and ore.valid) and ore.name or nil,
          seat = seat, litter = litter or nil,
          stuck = d.status == defines.entity_status
                              .waiting_for_space_in_destination or nil,
          distance = math.floor(Tasks.dist(b.position, d.position) * 10) / 10,
        }
      end
    end
  end
  -- 멈춘 것부터, 그다음 가까운 것부터.
  table.sort(out, function(p, q)
    if (p.stuck or false) ~= (q.stuck or false) then return p.stuck end
    return p.distance < q.distance
  end)
  local near = {}
  for i = 1, math.min(#out, 12) do near[i] = out[i] end
  -- total 은 출구가 없는 채굴기 전부, #out 은 그중 화로를 놓을
  -- 자리가 있는 것. 둘의 차이가 「자리가 없어 못 살리는」 수다.
  return { agent = name, blind = near, with_seat = #out, total = total }
end

local function poor_drills(name, floor, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local bar = floor or 400
  local reach = math.min(radius or 200, MAX_OBSERVE_RADIUS)
  local out = {}
  for _, d in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, name = "burner-mining-drill",
    force = b.force,
  }) do
    local left = richness(b.surface, d.position)
    if left < bar then
      out[#out + 1] = {
        x = d.position.x, y = d.position.y, left = left,
        seconds = math.floor(left / 0.25),
        distance = math.floor(Tasks.dist(b.position, d.position) * 10) / 10,
      }
    end
  end
  table.sort(out, function(p, q) return p.left < q.left end)
  local near = {}
  for i = 1, math.min(#out, 6) do near[i] = out[i] end
  return { agent = name, poor = near, total = #out }
end

local function health(name, radius)
  init_status_names()
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local reach = math.min(radius or 400, 500)
  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = reach, name = TENDED, force = b.force,
  }) do
    local row = out[e.name]
    if not row then
      row = { built = 0, working = 0, why = {} }
      out[e.name] = row
    end
    row.built = row.built + 1
    if e.status == defines.entity_status.working then
      row.working = row.working + 1
    else
      local label = STATUS_NAME[e.status] or tostring(e.status)
      row.why[label] = (row.why[label] or 0) + 1
    end
  end
  return { agent = name, machines = out }
end

return {
  COAL_KEEP = COAL_KEEP,
  FIXABLE = FIXABLE,
  HOME_KINDS = HOME_KINDS,
  STATUS_NAME = STATUS_NAME,
  TENDED = TENDED,
  base = base,
  blind_drills = blind_drills,
  broken = broken,
  chest_stock = chest_stock,
  coal_banks = coal_banks,
  feeds = feeds,
  furnace_stock = furnace_stock,
  health = health,
  hungry_rigs = hungry_rigs,
  init_status_names = init_status_names,
  poor_drills = poor_drills,
  stores = stores,
  smelter = smelter,
  strays = strays,
}

-- 무엇을 만들 수 있는가 - 재료를 거슬러 올라가 계획을 세운다.

local Tasks = require("tasks")
local Core = require("core")
local MAX_OBSERVE_RADIUS = Core.MAX_OBSERVE_RADIUS
local agent              = Core.agent
local body               = Core.body

------------------------------------------------------- 무엇부터 해야 하는가

-- 에이전트가 «랩을 만들자»고 정했는데 못 만들 때, 예전에는 그냥 다른 일을
-- 하러 갔다. 구리 광석 35개와 화로 23대를 손에 쥐고도 구리를 제련하면
-- 된다는 걸 몰랐다. 랩 <- 전자회로 <- 구리선 <- 구리판 <- 구리광석 이라는
-- 사슬이 어디에도 적혀 있지 않았기 때문이다.
--
-- 적을 필요가 없다. 게임이 레시피 그래프를 갖고 있고 인벤토리도 갖고 있다.
-- 여기서 한 번에 물어보면, 파이썬이 트리를 걸어다니며 RCON을 스무 번
-- 왕복할 이유가 사라진다.

local MAX_PLAN_DEPTH = 8

local function product_count(recipe, item)
  for _, p in pairs(recipe.products) do
    if p.name == item then
      if p.amount then return p.amount end
      if p.amount_min and p.amount_max then
        return (p.amount_min + p.amount_max) / 2
      end
      return 1
    end
  end
  return 1
end

-- pool 은 «아직 임자가 없는 재고»다. 재귀하면서 깎아 나가야, 철판 10개를
-- 기어에도 쓰고 회로에도 쓰는 두 번 세기가 생기지 않는다.
local function expand(force, pool, item, count, out, depth)
  local have = pool[item] or 0
  if have >= count then
    pool[item] = have - count
    return true
  end
  pool[item] = 0
  local missing = count - have

  -- 가방에 없으면 창고를 본다.
  --
  -- 실측(281분째): 상자에 철판 819장, 구리판 165장, 철광석 9,004개가 들어
  -- 있는데 계획은 「철광석을 캐러 가라」로 끝났다. pool 을 가방 하나로만
  -- 세고 있었기 때문이다. 캐야 할 것이 없는데 캐러 보내는 것은, 없어서가
  -- 아니라 보이지 않아서다.
  if out.stored then
    local shelf = out.stored[item]
    if shelf and shelf.count > 0 then
      local take = math.min(shelf.count, missing)
      shelf.count = shelf.count - take
      missing = missing - take
      out.fetch[#out.fetch + 1] = {
        name = item, count = take, x = shelf.x, y = shelf.y,
      }
      if missing <= 0 then return true end
    end
  end

  if depth > MAX_PLAN_DEPTH then
    out.blocked[item] = (out.blocked[item] or 0) + missing
    return false
  end

  local recipe = force.recipes[item]
  if not recipe or not recipe.enabled then
    -- 레시피가 없으면 땅에서 나오는 것이고, 있는데 잠겨 있으면 연구가
    -- 먼저다. 둘은 다른 문제라 나눠서 돌려준다.
    if prototypes.recipe[item] == nil then
      out.mine[item] = (out.mine[item] or 0) + missing
    else
      out.locked[item] = (out.locked[item] or 0) + missing
    end
    return false
  end

  local per = product_count(recipe, item)
  if per <= 0 then per = 1 end
  local runs = math.ceil(missing / per)

  local ready = true
  for _, ing in pairs(recipe.ingredients) do
    if ing.type == "fluid" then
      -- 유체는 손으로 못 나른다. 여기서 막혔다고 말하는 편이 낫다.
      out.blocked[ing.name] = (out.blocked[ing.name] or 0) + (ing.amount or 0) * runs
      ready = false
    elseif not expand(force, pool, ing.name, (ing.amount or 0) * runs, out, depth + 1) then
      ready = false
    end
  end

  -- 재료가 다 갖춰진 것만 «지금 할 수 있는 일»이다. 깊은 것부터 쌓이므로
  -- 목록 순서가 곧 작업 순서가 된다.
  if ready then
    local step = {
      action = (recipe.category == "smelting") and "smelt" or "craft",
      name = item,
      recipe = recipe.name,
      count = runs,
      hand = recipe.category == "crafting",
      category = recipe.category,
    }
    -- 제련은 화로에 «무엇을 몇 개» 넣어야 하는지가 필요하다. 광석 이름을
    -- 판금 이름에서 짐작하면 돌벽돌(돌 2 -> 벽돌 1)에서 절반만 넣게 된다.
    if step.action == "smelt" then
      for _, ing in pairs(recipe.ingredients) do
        if ing.type ~= "fluid" then
          step.input = ing.name
          step.input_count = (ing.amount or 1) * runs
          break
        end
      end
      -- 얼마나 기다려야 하는지도 게임이 안다. 돌 화로는 제작속도 1이라
      -- 레시피 시간이 곧 초다. 짐작해서 짧게 기다리면 광석만 화로에
      -- 남기고 빈손으로 돌아온다 - 구리 35개를 그렇게 잃었다.
      step.seconds = (recipe.energy or 3.2) * runs
    end
    out.steps[#out.steps + 1] = step
  end
  return ready
end

-- 이 광석을 받아줄 화로를 고른다.
--
-- 실측(새 판): 화로 넷이 이 꼴로 서 있었다 —
--   (52,16) full_output  in[iron-ore=54]  out[copper-plate=9]
--   (76,16) full_output  in[iron-ore=54]  out[copper-plate=1]
-- 철광석 164개가 구리판 22개에 막혀 있고, 그 옆에 빈 화로가 아홉 대
-- 놀고 있었다.
--
-- 돌 화로의 출력 칸은 한 종류만 담는다. 구리판이 남은 채로 철광석을 넣으면
-- 철판을 만들어도 내놓을 데가 없어 멈춘다. 그런데 화로를 고르는 자리가
-- limit = 1, 그냥 «첫 번째»였다.
--
-- 받아줄 수 있는 화로란: 출력이 비었거나 같은 것을 내고 있고, 입력이
-- 비었거나 같은 것을 먹고 있는 화로. 그중 빈 화로가 언제나 낫다 - 비어
-- 있으면 넣는 순간 돈다.
-- 이 광석을 녹이면 무엇이 나오는가. 이름을 짐작하지 않는다 - 돌은
-- 「stone-plate」가 아니라 벽돌이 되고, 그런 예외를 외우는 것보다 레시피에
-- 물어보는 편이 짧고 틀리지 않는다.
local SMELTS_TO = {}

local function smelted_from(force, ore)
  if SMELTS_TO[ore] ~= nil then return SMELTS_TO[ore] or nil end
  local found = false
  for _, r in pairs(force.recipes) do
    if r.category == "smelting" then
      for _, ing in pairs(r.ingredients) do
        if ing.name == ore then
          SMELTS_TO[ore] = r.products[1] and r.products[1].name or false
          found = true
          break
        end
      end
    end
    if found then break end
  end
  if not found then SMELTS_TO[ore] = false end
  return SMELTS_TO[ore] or nil
end

local function pick_furnace(surface, force, near, ore)
  local best, best_score = nil, -math.huge
  for _, e in pairs(surface.find_entities_filtered {
    position = near, radius = MAX_OBSERVE_RADIUS, name = "stone-furnace",
    force = force,
  }) do
    local src = e.get_inventory(defines.inventory.furnace_source)
    local res = e.get_inventory(defines.inventory.furnace_result)
    local busy_in, busy_out = nil, nil
    if src then
      for _, st in pairs(src.get_contents()) do busy_in = st.name break end
    end
    if res then
      for _, st in pairs(res.get_contents()) do busy_out = st.name break end
    end

    -- 다른 광석을 먹고 있거나 다른 판금을 물고 있으면 못 받는다.
    local takes = (busy_in == nil or busy_in == ore)
    if takes and ore and busy_out then
      takes = (busy_out == smelted_from(force, ore))
    end

    if takes then
      local d = Tasks.dist(near, e.position)
      -- 빈 화로가 언제나 낫다. 거리보다 앞선다.
      local score = (busy_in == nil and busy_out == nil) and 1000 or 0
      score = score - d
      if score > best_score then best, best_score = e, score end
    end
  end
  return best
end

local function compute_plan(name, item, count)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  if not prototypes.item[item] and not prototypes.recipe[item] then
    return { error = "no such item: " .. tostring(item) }
  end

  local pool = {}
  local inv = b.get_main_inventory()
  if inv then
    for _, stack in pairs(inv.get_contents()) do
      pool[stack.name] = (pool[stack.name] or 0) + stack.count
    end
  end

  -- 가까운 상자들 안에 무엇이 있는지. 같은 품목이 여러 상자에 있으면
  -- 가장 가까운 상자 하나로 몰아둔다 - 한 번 걸어가서 꺼내면 되도록.
  local stored = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    position = b.position, radius = MAX_OBSERVE_RADIUS, type = "container",
    force = b.force,
  }) do
    local inv = e.get_inventory(defines.inventory.chest)
    if inv then
      local d = Tasks.dist(b.position, e.position)
      for _, stack in pairs(inv.get_contents()) do
        local shelf = stored[stack.name]
        if not shelf then
          stored[stack.name] = { count = stack.count, x = e.position.x,
                                 y = e.position.y, distance = d }
        else
          shelf.count = shelf.count + stack.count
          if d < shelf.distance then
            shelf.x, shelf.y, shelf.distance = e.position.x, e.position.y, d
          end
        end
      end
    end
  end

  local out = { steps = {}, mine = {}, locked = {}, blocked = {},
                stored = stored, fetch = {} }
  local ok, done = pcall(expand, b.force, pool, item, count or 1, out, 0)
  if not ok then return { error = "plan failed: " .. tostring(done) } end

  -- 제련은 화로가 있어야 한다. 없으면 «지금 할 수 있는 일»이 아니다.
  -- 아무 화로나가 아니라 «이 광석을 받아줄» 화로여야 한다.
  local smelting = nil
  for _, step in pairs(out.steps) do
    if step.action == "smelt" then smelting = step.input break end
  end
  local furnace = pick_furnace(b.surface, b.force, b.position, smelting)

  return {
    item = item, count = count or 1, ready = done,
    steps = out.steps, mine = out.mine, locked = out.locked, blocked = out.blocked,
    -- 창고에서 꺼내오면 되는 것들. 캐기 전에 이것부터.
    fetch = out.fetch,
    furnace = furnace and { x = furnace.position.x, y = furnace.position.y } or nil,
  }
end

return {
  MAX_PLAN_DEPTH = MAX_PLAN_DEPTH,
  SMELTS_TO = SMELTS_TO,
  compute_plan = compute_plan,
  expand = expand,
  pick_furnace = pick_furnace,
  product_count = product_count,
  smelted_from = smelted_from,
}

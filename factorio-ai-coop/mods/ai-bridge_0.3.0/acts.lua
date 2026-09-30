-- 사람이 할 수 있는 조작 (run25 규칙, 사용자 2026-10-01).
--
--   "스크립트에서 게임을 바꾸는 Lua API 금지. 사람이 할 수 있는 행동만,
--    캐릭터 주문으로, 손이 닿는지 게임이 확인하게."
--
-- 여기 있는 것은 run24 까지 스크립트가 ai.lua 로 «직접» 하던 조작을
-- 캐릭터의 일감으로 옮긴 것이다. 규칙은 둘이다.
--
--   (1) 손으로 하는 것 (레시피 · 요청 · 필터 · 조건 · 칸 제한 · 돌리기 ·
--       발사 버튼) 은 그 캐릭터의 손이 닿아야 한다 - can_reach_entity.
--       안 닿으면 걸어간다 (submit) 또는 거절한다 (act, 즉시 실행).
--   (2) 지도에서 하는 것 (유령 · 해체 표시 · 교체 표시 · 블루프린트식
--       아이템 요청 · 연구 선택) 은 거리가 없다. 대신 «지도에 보이는 곳»
--       (charted chunk) 이어야 하고, 유령은 can_place_entity{manual_ghost}
--       를 통과해야 한다 - 사람이 놓을 수 없는 자리에는 못 놓는다.
--
-- 이 파일은 tasks 표에 일감을 «더한다». 옛 일감은 그대로다.

local Tasks = require("tasks")
local dist, halt = Tasks.dist, Tasks.halt

local M = {}

-- 거리 없는 일감 (지도 · GUI). act 로 즉시 실행해도 된다.
M.NO_REACH = {
  place_ghost = true, deconstruct_mark = true, upgrade_mark = true,
  request_items = true, research = true,
}

--------------------------------------------------------------------- helpers

local function charted(bot, x, y)
  return bot.force.is_chunk_charted(bot.surface, { x = math.floor(x / 32), y = math.floor(y / 32) })
end

local function need_xy(ctx)
  local p = ctx.task.params
  if p.x == nil or p.y == nil then
    ctx.task.error = "x, y required"
    return false
  end
  return true
end

-- 우리 힘의 엔티티 하나 (유령 · 캐릭터 · 땅의 물건 제외). p.name 은 엔티티 이름 필터.
local function find_own(ctx, p, types)
  local found = ctx.surface.find_entities_filtered {
    position = { p.x, p.y }, radius = p.search_radius or 1.6,
    force = ctx.bot.force, type = types,
  }
  local best, best_d = nil, math.huge
  for _, e in pairs(found) do
    if e.type ~= "entity-ghost" and e.type ~= "tile-ghost" and e.type ~= "character"
        and e.type ~= "item-request-proxy" and (not p.name or e.name == p.name) then
      local d = dist({ x = p.x, y = p.y }, e.position)
      if d < best_d then best, best_d = e, d end
    end
  end
  return best
end

-- 이 아이템을 사람이 가질 수 있는가: 만드는 레시피가 열렸거나, 손에 있다.
local function obtainable(bot, item)
  if (bot.get_item_count(item) or 0) > 0 then return true end
  local recipes = prototypes.get_recipe_filtered {
    { filter = "has-product-item", elem_filters = { { filter = "name", name = item } } },
  }
  for name in pairs(recipes) do
    local r = bot.force.recipes[name]
    if r and r.enabled then return true end
  end
  return false
end

local function placeable_item(entity_name)
  local proto = prototypes.entity[entity_name]
  if not proto then return nil end
  local items = proto.items_to_place_this
  if not items or #items == 0 then return nil end
  local first = items[1]
  return type(first) == "table" and first.name or first
end

-- 손이 닿을 때까지 걷는다. "here" | "running" | "failed".
-- act (즉시 실행) 에서는 걷지 않는다 - 안 닿으면 실패.
local function within(ctx, target)
  local bot, st = ctx.bot, ctx.task.state
  if not target or not target.valid then
    ctx.task.error = "target disappeared"
    return "failed"
  end
  if bot.can_reach_entity(target) then
    if not st.instant then halt(bot) end
    return "here"
  end
  if st.instant then
    ctx.task.error = string.format("out of reach: %s at %.1f,%.1f (stand within %.0f tiles, or submit as an order)",
      target.name, target.position.x, target.position.y, bot.reach_distance)
    return "failed"
  end
  local travel = Tasks.approach(ctx, target.position, math.max(1.0, bot.reach_distance - 2.0))
  if travel == "failed" then
    halt(bot)
    ctx.task.error = "cannot reach " .. target.name .. ": " .. tostring(ctx.task.error)
    return "failed"
  end
  if travel == "done" and not bot.can_reach_entity(target) then
    st.arrivals = (st.arrivals or 0) + 1
    if st.arrivals >= 3 then
      halt(bot)
      ctx.task.error = "walked there but still cannot reach " .. target.name
      return "failed"
    end
  end
  return "running"
end

-- 손으로 하는 일감의 뼈대: 찾고 (start) → 닿을 때까지 걷고 → 한다 (act).
local function reach_task(spec)
  return {
    start = function(ctx)
      local p = ctx.task.params
      local e, err
      if spec.self and (p.target == "self" or p.x == nil) then
        e = ctx.bot
      else
        if not need_xy(ctx) then return "failed" end
        e, err = spec.find(ctx, p)
      end
      if not e then
        ctx.task.error = err or string.format("nothing to %s at %s,%s", ctx.task.type, tostring(p.x), tostring(p.y))
        return "failed"
      end
      if spec.check then
        local bad = spec.check(ctx, p, e)
        if bad then
          ctx.task.error = bad
          return "failed"
        end
      end
      ctx.task.state.target = e
      return "running"
    end,
    step = function(ctx)
      local st = ctx.task.state
      if st.target ~= ctx.bot then
        local w = within(ctx, st.target)
        if w ~= "here" then return w end
      end
      return spec.act(ctx, ctx.task.params, st.target)
    end,
  }
end

-- 빠져나온 물건은 사람 가방으로, 넘치면 발밑에 (사람이 레시피를 바꿀 때와 같다).
local function pocket(ctx, removed)
  local n = 0
  if type(removed) ~= "table" then return 0 end
  for k, v in pairs(removed) do
    local name, count, quality
    if type(v) == "table" then name, count, quality = v.name, v.count, v.quality
    else name, count = k, v end
    if name and count and count > 0 then
      local stack = { name = name, count = count, quality = quality }
      local put = ctx.bot.insert(stack)
      if put < count then
        stack.count = count - put
        ctx.surface.spill_item_stack {
          position = ctx.bot.position, stack = stack, enable_looted = true, force = ctx.bot.force,
        }
      end
      n = n + count
    end
  end
  return n
end

------------------------------------------------------------------ set_recipe

-- {x, y, recipe, quality?, clear?}  조립기 · 화학 공장 · 정유소 (assembling-machine 형).
M.set_recipe = reach_task {
  find = function(ctx, p) return find_own(ctx, p, "assembling-machine") end,
  check = function(ctx, p, e)
    if e.prototype.fixed_recipe then return e.name .. " has a fixed recipe" end
    if p.clear then return nil end
    local r = ctx.bot.force.recipes[p.recipe or ""]
    if not r then return "no such recipe: " .. tostring(p.recipe) end
    if not r.enabled then return tostring(p.recipe) .. " is not researched yet" end
    return nil
  end,
  act = function(ctx, p, e)
    local cur = e.get_recipe()
    if not p.clear and cur and cur.name == p.recipe then
      ctx.task.result = { name = e.name, recipe = p.recipe, x = e.position.x, y = e.position.y, already = true }
      return "done"
    end
    local ok, removed = pcall(function()
      if p.clear then return e.set_recipe(nil) end
      return e.set_recipe(p.recipe, p.quality)
    end)
    if not ok then
      ctx.task.error = "set_recipe: " .. tostring(removed)
      return "failed"
    end
    ctx.task.result = { name = e.name, recipe = p.clear and nil or p.recipe,
                        x = e.position.x, y = e.position.y, returned = pocket(ctx, removed) }
    return "done"
  end,
}

---------------------------------------------------------------------- rotate

-- {x, y, name?, direction?, reverse?}  R 키. direction 을 주면 그쪽을 볼 때까지 돌린다.
M.rotate = reach_task {
  find = function(ctx, p)
    local e = find_own(ctx, p)
    if e and not e.rotatable then return nil, e.name .. " cannot be rotated" end
    return e
  end,
  act = function(ctx, p, e)
    local turns = 0
    if p.direction ~= nil then
      while e.valid and e.direction ~= p.direction and turns < 16 do
        if not e.rotate { reverse = p.reverse and true or false } then break end
        turns = turns + 1
      end
      if not e.valid or e.direction ~= p.direction then
        ctx.task.error = string.format("%s cannot face %s", e.valid and e.name or "?", tostring(p.direction))
        return "failed"
      end
    else
      if not e.rotate { reverse = p.reverse and true or false } then
        ctx.task.error = "rotate refused for " .. e.name
        return "failed"
      end
      turns = 1
    end
    ctx.task.result = { name = e.name, x = e.position.x, y = e.position.y, direction = e.direction, turns = turns }
    local okd, drop = pcall(function() return e.drop_position end)
    if okd and drop then ctx.task.result.drop_x, ctx.task.result.drop_y = drop.x, drop.y end
    return "done"
  end,
}

------------------------------------------------------------------ set_filter

-- {x, y, item?, quality?, slot?, mode?}         팔 (필터 팔) · 저장 상자
-- {x, y, item?, input_priority?, output_priority?}  분배기
-- item 이 없으면 그 칸을 비운다.
M.set_filter = reach_task {
  find = function(ctx, p)
    return find_own(ctx, p, { "inserter", "splitter", "logistic-container" })
  end,
  check = function(ctx, p, e)
    if p.item and not prototypes.item[p.item] then return "no such item: " .. tostring(p.item) end
    if e.type == "inserter" and (e.prototype.filter_count or 0) == 0 then
      return e.name .. " has no filter slots"
    end
    if e.type == "logistic-container" and e.prototype.logistic_mode ~= "storage" then
      return e.name .. ": only storage chests take a filter (use set_requests)"
    end
    return nil
  end,
  act = function(ctx, p, e)
    local want = p.item and { name = p.item, quality = p.quality or "normal" } or nil
    local ok, err = pcall(function()
      if e.type == "inserter" then
        if want then e.use_filters = true end
        if p.mode then e.inserter_filter_mode = p.mode end
        e.set_filter(p.slot or 1, want)
      elseif e.type == "splitter" then
        e.splitter_filter = want
        if p.input_priority then e.splitter_input_priority = p.input_priority end
        if p.output_priority then e.splitter_output_priority = p.output_priority end
      else
        e.set_filter(1, want)
      end
    end)
    if not ok then
      ctx.task.error = "set_filter: " .. tostring(err)
      return "failed"
    end
    ctx.task.result = { name = e.name, x = e.position.x, y = e.position.y, item = p.item or false }
    return "done"
  end,
}

------------------------------------------------------------------- set_limit

-- {x, y, slots?}  상자의 칸 제한 (빨간 X). slots 가 없으면 푼다.
M.set_limit = reach_task {
  find = function(ctx, p)
    return find_own(ctx, p, { "container", "logistic-container", "cargo-wagon" })
  end,
  act = function(ctx, p, e)
    local inv = e.get_inventory(defines.inventory.chest) or e.get_inventory(defines.inventory.cargo_wagon)
    if not inv or not inv.supports_bar() then
      ctx.task.error = e.name .. " has no slot limit"
      return "failed"
    end
    local ok, err = pcall(function()
      if p.slots then inv.set_bar(math.max(0, math.floor(p.slots)) + 1) else inv.set_bar() end
    end)
    if not ok then
      ctx.task.error = "set_limit: " .. tostring(err)
      return "failed"
    end
    ctx.task.result = { name = e.name, x = e.position.x, y = e.position.y, slots = p.slots or false }
    return "done"
  end,
}

---------------------------------------------------------------- set_requests

-- {x, y, requests, section?, mode?, trash_unrequested?, request_from_buffers?}
-- {target = "self", requests, ...}  - 자기 몸 (캐릭터 물류 요청) 은 손이 필요 없다.
--   requests: { {name=, min=, max=?, quality=?}, ... }  또는  { [name] = min }
--   mode: "replace" (기본 - 그 구역을 이 목록으로) | "merge" (준 것만 고친다, min=0 이면 지운다)
M.set_requests = reach_task {
  self = true,
  find = function(ctx, p)
    return find_own(ctx, p, { "logistic-container", "character", "rocket-silo", "space-platform-hub", "cargo-landing-pad" })
  end,
  check = function(ctx, p, e)
    local ok, sections = pcall(function() return e.get_logistic_sections() end)
    if not ok or not sections then return e.name .. " takes no logistic requests" end
    if e.type == "logistic-container" then
      local mode = e.prototype.logistic_mode
      if mode ~= "requester" and mode ~= "buffer" then
        return e.name .. " (" .. tostring(mode) .. ") takes no requests"
      end
    end
    if type(p.requests) ~= "table" then return "requests required" end
    return nil
  end,
  act = function(ctx, p, e)
    local want = {}
    for k, v in pairs(p.requests) do
      if type(v) == "table" then
        want[#want + 1] = { name = v.name, min = v.min or v.count or 0, max = v.max, quality = v.quality }
      else
        want[#want + 1] = { name = k, min = v }
      end
    end
    for _, w in ipairs(want) do
      if not prototypes.item[w.name or ""] then
        ctx.task.error = "no such item: " .. tostring(w.name)
        return "failed"
      end
    end
    local ok, err = pcall(function()
      local lp = e.get_logistic_sections()
      local index = p.section or 1
      for _ = #lp.sections + 1, index do lp.add_section() end
      local sec = lp.sections[index]
      if not sec then error("no section " .. index, 0) end
      if not sec.is_manual then error("section " .. index .. " is not editable (group-driven)", 0) end
      local function slot_of(name, quality)
        for i = 1, sec.filters_count do
          local f = sec.get_slot(i)
          local v = f and f.value
          local fname = v and (type(v) == "table" and v.name or v)
          local fq = v and type(v) == "table" and v.quality or "normal"
          if fname == name and (fq == (quality or "normal")) then return i end
        end
        return nil
      end
      if (p.mode or "replace") == "replace" then
        for i = sec.filters_count, 1, -1 do sec.clear_slot(i) end
      end
      for _, w in ipairs(want) do
        local i = slot_of(w.name, w.quality)
        if w.min == 0 and not w.max and (p.mode == "merge") then
          if i then sec.clear_slot(i) end
        else
          if not i then
            i = 1
            while sec.get_slot(i) and sec.get_slot(i).value do i = i + 1 end
          end
          sec.set_slot(i, { value = { type = "item", name = w.name, quality = w.quality or "normal" },
                            min = w.min, max = w.max })
        end
      end
      if p.trash_unrequested ~= nil then lp.trash_not_requested = p.trash_unrequested and true or false end
      if p.request_from_buffers ~= nil and e.type == "logistic-container" then
        e.request_from_buffers = p.request_from_buffers and true or false
      end
    end)
    if not ok then
      ctx.task.error = "set_requests: " .. tostring(err)
      return "failed"
    end
    ctx.task.result = { name = e.name, x = e.position.x, y = e.position.y, count = #want }
    return "done"
  end,
}

--------------------------------------------------------------- set_condition

-- {x, y, kind = "logistic"|"circuit", signal = item, comparator = "<", constant = N, off?}
-- 팔 · 벨트 · 펌프 · 해안 펌프 · 램프 같은 켬/끔 조건. off=true 면 조건을 끈다.
M.set_condition = reach_task {
  find = function(ctx, p)
    return find_own(ctx, p, { "inserter", "transport-belt", "pump", "offshore-pump", "lamp",
                              "mining-drill", "train-stop", "rail-signal", "power-switch" })
  end,
  check = function(ctx, p, e)
    local kind = p.kind or "logistic"
    if kind ~= "logistic" and kind ~= "circuit" then return "kind must be logistic or circuit" end
    if not p.off then
      if not p.signal or not prototypes.item[p.signal] then return "signal (item name) required" end
      if p.constant == nil then return "constant required" end
    end
    return nil
  end,
  act = function(ctx, p, e)
    local kind = p.kind or "logistic"
    local ok, err = pcall(function()
      local cb = e.get_or_create_control_behavior()
      if not cb then error("no control behavior", 0) end
      local cond = (not p.off) and {
        first_signal = { type = "item", name = p.signal },
        comparator = p.comparator or "<", constant = p.constant,
      } or nil
      if kind == "logistic" then
        cb.connect_to_logistic_network = not p.off
        if cond then cb.logistic_condition = cond end
      else
        cb.circuit_enable_disable = not p.off
        if cond then cb.circuit_condition = cond end
      end
    end)
    if not ok then
      ctx.task.error = "set_condition: " .. tostring(err)
      return "failed"
    end
    local net = nil
    pcall(function() net = e.logistic_network and e.logistic_network.network_id end)
    ctx.task.result = { name = e.name, x = e.position.x, y = e.position.y, kind = kind,
                        off = p.off and true or false, network = net }
    return "done"
  end,
}

---------------------------------------------------------------- launch_rocket

-- {x, y}  사일로 GUI 의 발사 버튼. 로켓이 준비돼 있어야 한다.
M.launch_rocket = reach_task {
  find = function(ctx, p) return find_own(ctx, p, "rocket-silo") end,
  act = function(ctx, p, e)
    if e.rocket_silo_status ~= defines.rocket_silo_status.rocket_ready then
      ctx.task.error = "rocket not ready (status " .. tostring(e.rocket_silo_status) .. ")"
      return "failed"
    end
    local ok, launched = pcall(function() return e.launch_rocket() end)
    if not ok or not launched then
      ctx.task.error = "launch refused: " .. tostring(launched)
      return "failed"
    end
    ctx.task.result = { launched = true, x = e.position.x, y = e.position.y }
    return "done"
  end,
}

------------------------------------------------------------ 지도 조작 (거리 없음)

local function map_task(fn)
  return {
    start = function(ctx)
      if not need_xy(ctx) then return "failed" end
      local p = ctx.task.params
      if not charted(ctx.bot, p.x, p.y) then
        ctx.task.error = string.format("%.0f,%.0f is not on the map (uncharted) - walk there first", p.x, p.y)
        return "failed"
      end
      return fn(ctx, p)
    end,
    step = function(ctx) return "failed" end,
  }
end

-- 유령에 딸려 갈 아이템 (블루프린트에 담기는 것): 모듈 · 포탑 탄 · 연료.
local MODULE_INV = {
  ["assembling-machine"] = "assembling_machine_modules", furnace = "furnace_modules",
  ["mining-drill"] = "mining_drill_modules", lab = "lab_modules", beacon = "beacon_modules",
  ["rocket-silo"] = "rocket_silo_modules",
}

local function insert_plan(entity_proto, items)
  local plan, err = {}, nil
  local next_stack = {}
  for name, count in pairs(items or {}) do
    local item = prototypes.item[name]
    if not item then return nil, "no such item: " .. tostring(name) end
    local inv_name
    if item.type == "module" then inv_name = MODULE_INV[entity_proto.type]
    elseif item.type == "ammo" and (entity_proto.type == "ammo-turret" or entity_proto.type == "artillery-turret") then
      inv_name = entity_proto.type == "ammo-turret" and "turret_ammo" or "artillery_turret_ammo"
    elseif item.fuel_value and item.fuel_value > 0 and entity_proto.burner_prototype then inv_name = "fuel"
    end
    if not inv_name or not defines.inventory[inv_name] then
      return nil, string.format("%s cannot be requested into %s (modules, turret ammo, fuel only)", name, entity_proto.name)
    end
    local inv = defines.inventory[inv_name]
    local slots = {}
    if item.type == "module" then
      for _ = 1, count do
        local k = next_stack[inv] or 0
        slots[#slots + 1] = { inventory = inv, stack = k, count = 1 }
        next_stack[inv] = k + 1
      end
    else
      local k = next_stack[inv] or 0
      slots[1] = { inventory = inv, stack = k, count = math.min(count, item.stack_size) }
      next_stack[inv] = k + 1
    end
    plan[#plan + 1] = { id = { name = name }, items = { in_inventory = slots } }
  end
  return plan, err
end

-- {name, x, y, direction?, quality?, type?, recipe?, items?}
--   type: 지하 벨트 "input"|"output".  items: { [item] = count } (모듈 · 탄 · 연료).
-- 나무 · 바위는 사람이 유령을 놓을 때처럼 해체 표시가 붙는다.
M.place_ghost = map_task(function(ctx, p)
  local bot, surface = ctx.bot, ctx.surface
  local proto = prototypes.entity[p.name or ""]
  if not proto then
    ctx.task.error = "no such entity: " .. tostring(p.name)
    return "failed"
  end
  local item = placeable_item(p.name)
  if not item then
    ctx.task.error = p.name .. " cannot be placed by a player"
    return "failed"
  end
  if not obtainable(bot, item) then
    ctx.task.error = item .. " is not unlocked (no enabled recipe, none in hand)"
    return "failed"
  end
  local dir = p.direction or defines.direction.north
  local same = surface.find_entities_filtered {
    position = { p.x, p.y }, radius = 0.5, force = bot.force, ghost_name = p.name,
  }[1] or surface.find_entities_filtered {
    position = { p.x, p.y }, radius = 0.5, force = bot.force, name = p.name,
  }[1]
  if same then
    ctx.task.result = { already = true, name = p.name, x = same.position.x, y = same.position.y,
                        ghost = same.type == "entity-ghost" }
    return "done"
  end
  if not surface.can_place_entity {
    name = p.name, position = { p.x, p.y }, direction = dir, force = bot.force,
    build_check_type = defines.build_check_type.manual_ghost,
  } then
    ctx.task.error = string.format("blocked: cannot place a %s ghost at %.1f,%.1f", p.name, p.x, p.y)
    return "failed"
  end
  local plan, perr = nil, nil
  if p.items then
    plan, perr = insert_plan(proto, p.items)
    if not plan then
      ctx.task.error = perr
      return "failed"
    end
  end
  local g = surface.create_entity {
    name = "entity-ghost", inner_name = p.name, position = { p.x, p.y }, direction = dir,
    force = bot.force, quality = p.quality, type = p.type,
  }
  if not g then
    ctx.task.error = "ghost was not created"
    return "failed"
  end
  local notes = {}
  if p.recipe then
    local ok, err = pcall(function() g.set_recipe(p.recipe, p.quality) end)
    if not ok then notes[#notes + 1] = "recipe: " .. tostring(err) end
  end
  if plan then
    local ok, err = pcall(function() g.insert_plan = plan end)
    if not ok then notes[#notes + 1] = "items: " .. tostring(err) end
  end
  -- 사람이 유령을 놓으면 그 밑의 나무 · 바위에 해체 표시가 붙는다.
  local marked = 0
  local box = g.bounding_box
  for _, e in pairs(surface.find_entities_filtered { area = box, type = { "tree", "simple-entity" } }) do
    if e.valid and e.minable and not e.to_be_deconstructed() then
      if e.order_deconstruction(bot.force) then marked = marked + 1 end
    end
  end
  ctx.task.result = { ghost = true, name = p.name, x = g.position.x, y = g.position.y,
                      direction = g.direction, marked = marked,
                      note = (#notes > 0) and table.concat(notes, "; ") or nil }
  return "done"
end)

local function area_of(p)
  if p.area then
    local a = p.area
    return { { a[1] or a.left, a[2] or a.top }, { a[3] or a.right, a[4] or a.bottom } }
  end
  local r = p.radius or 0.5
  return { { p.x - r, p.y - r }, { p.x + r, p.y + r } }
end

local MARK_MAX = 400   -- 한 번에 표시하는 수 (해체 계획서 한 번 끌기)

-- {x, y, name?, radius? | area = {l,t,r,b}, cancel?, ghosts?}  해체 계획서.
-- 우리 건물 · 나무 · 바위 · 땅의 물건. 적의 것은 안 된다 (사람도 못 한다).
-- ghosts = true: 우리 유령을 지운다 (계획서를 유령 위에 끌면 유령은 바로 사라진다).
--   name 은 유령 속 이름 (ghost_name) 으로 거른다.
M.deconstruct_mark = map_task(function(ctx, p)
  local bot = ctx.bot
  local out = { marked = 0, already = 0, cancelled = 0, skipped = 0, ghosts = 0 }
  if p.ghosts and not p.cancel then
    local ghosts = ctx.surface.find_entities_filtered {
      area = area_of(p), force = bot.force, type = "entity-ghost", ghost_name = p.name,
    }
    for _, g in pairs(ghosts) do
      if out.ghosts >= MARK_MAX then break end
      if g.valid then g.destroy() out.ghosts = out.ghosts + 1 end
    end
    ctx.task.result = out
    if out.ghosts == 0 then
      ctx.task.error = string.format("no ghost to remove at %.0f,%.0f", p.x, p.y)
      return "failed"
    end
    return "done"
  end
  for _, e in pairs(ctx.surface.find_entities_filtered { area = area_of(p), name = p.name }) do
    if out.marked + out.cancelled >= MARK_MAX then break end
    local mine = e.force == bot.force or e.force.name == "neutral"
    if e.valid and mine and e.type ~= "character" and e.type ~= "resource"
        and e.type ~= "entity-ghost" and e.type ~= "item-request-proxy" and e.minable then
      if p.cancel then
        if e.to_be_deconstructed() and e.cancel_deconstruction(bot.force) then out.cancelled = out.cancelled + 1 end
      elseif e.to_be_deconstructed() then
        out.already = out.already + 1
      elseif e.order_deconstruction(bot.force) then
        out.marked = out.marked + 1
      else
        out.skipped = out.skipped + 1
      end
    end
  end
  ctx.task.result = out
  if out.marked + out.already + out.cancelled == 0 then
    ctx.task.error = string.format("nothing to mark at %.0f,%.0f", p.x, p.y)
    return "failed"
  end
  return "done"
end)

-- {x, y, target, name?, quality?, radius? | area, cancel?}  교체 계획서.
-- 같은 fast_replaceable_group 이거나 next_upgrade 인 것으로만 (사람의 계획서도 그렇다).
M.upgrade_mark = map_task(function(ctx, p)
  local bot = ctx.bot
  local to = prototypes.entity[p.target or ""]
  if not p.cancel then
    if not to then
      ctx.task.error = "no such entity: " .. tostring(p.target)
      return "failed"
    end
    local item = placeable_item(p.target)
    if not item or not obtainable(bot, item) then
      ctx.task.error = tostring(p.target) .. " is not unlocked"
      return "failed"
    end
  end
  local out = { marked = 0, already = 0, cancelled = 0, refused = 0 }
  for _, e in pairs(ctx.surface.find_entities_filtered { area = area_of(p), force = bot.force, name = p.name }) do
    if out.marked + out.cancelled >= MARK_MAX then break end
    if e.valid and e.type ~= "entity-ghost" and e.type ~= "character" then
      if p.cancel then
        if e.to_be_upgraded() and e.cancel_upgrade(bot.force) then out.cancelled = out.cancelled + 1 end
      elseif e.name == p.target then
        -- 이미 그것이다
      elseif e.to_be_upgraded() then
        out.already = out.already + 1
      else
        local fits = (e.prototype.next_upgrade and e.prototype.next_upgrade.name == p.target)
          or (e.prototype.fast_replaceable_group ~= nil
              and e.prototype.fast_replaceable_group == to.fast_replaceable_group)
        local ok = fits and pcall(function()
          e.order_upgrade { target = p.quality and { name = p.target, quality = p.quality } or p.target,
                            force = bot.force }
        end)
        if ok then out.marked = out.marked + 1 else out.refused = out.refused + 1 end
      end
    end
  end
  ctx.task.result = out
  if out.marked + out.already + out.cancelled == 0 then
    ctx.task.error = string.format("nothing to upgrade to %s at %.0f,%.0f (refused %d)",
      tostring(p.target), p.x, p.y, out.refused)
    return "failed"
  end
  return "done"
end)

-- {x, y, items = {[item]=count}, name?, replace?}
-- 선 건물에 블루프린트를 덧붙여 «모듈 · 포탑 탄 · 연료» 를 로봇에게 부탁하는 것과 같다.
-- 조립기 입력 · 출력칸 (재료 나르기) 은 안 된다 - 그건 팔 · 요청 상자 · 사람 손의 일.
M.request_items = map_task(function(ctx, p)
  local e = find_own(ctx, p)
  if not e then
    ctx.task.error = string.format("nothing of ours at %.0f,%.0f", p.x, p.y)
    return "failed"
  end
  if type(p.items) ~= "table" then
    ctx.task.error = "items required"
    return "failed"
  end
  local plan, err = insert_plan(e.prototype, p.items)
  if not plan then
    ctx.task.error = err
    return "failed"
  end
  -- 모듈은 빈 칸만큼만 (블루프린트도 든 모듈을 빼지는 않는다 - 빼려면 사람 손 take).
  for _, one in ipairs(plan) do
    local slots = one.items.in_inventory
    local inv = e.get_inventory(slots[1].inventory)
    if not inv then
      ctx.task.error = e.name .. " has no such inventory"
      return "failed"
    end
    if prototypes.item[one.id.name].type == "module" then
      local free = {}
      for i = 1, #inv do if not inv[i].valid_for_read then free[#free + 1] = i - 1 end end
      local keep = {}
      for k = 1, math.min(#slots, #free) do keep[k] = { inventory = slots[k].inventory, stack = free[k], count = 1 } end
      one.items.in_inventory = keep
    end
  end
  local clean = {}
  for _, one in ipairs(plan) do if #one.items.in_inventory > 0 then clean[#clean + 1] = one end end
  if #clean == 0 then
    ctx.task.error = e.name .. " has no free slot for that"
    return "failed"
  end
  local old = ctx.surface.find_entities_filtered { name = "item-request-proxy", position = e.position, radius = 0.6 }
  if #old > 0 then
    if not p.replace then
      ctx.task.result = { already = true, name = e.name, x = e.position.x, y = e.position.y }
      return "done"
    end
    for _, px in pairs(old) do if px.valid and px.proxy_target == e then px.destroy() end end
  end
  local px = ctx.surface.create_entity {
    name = "item-request-proxy", position = e.position, force = ctx.bot.force, target = e, modules = clean,
  }
  if not px then
    ctx.task.error = "request was not created"
    return "failed"
  end
  ctx.task.result = { requested = #clean, name = e.name, x = e.position.x, y = e.position.y }
  return "done"
end)

-------------------------------------------------------------------- research

-- {name, mode = "add"|"front"|"remove"}  또는  {queue = {name, ...}}  - 연구 GUI.
local function tech_ok(force, name)
  local t = force.technologies[name or ""]
  if not t then return nil, "no such technology: " .. tostring(name) end
  if t.researched then return nil, name .. " is already researched" end
  if not t.enabled then return nil, name .. " is not available" end
  return t
end

local function queue_names(force)
  local out = {}
  for _, t in pairs(force.research_queue or {}) do out[#out + 1] = t.name end
  return out
end

M.research = {
  start = function(ctx)
    local p, force = ctx.task.params, ctx.bot.force
    local mode = p.mode or "add"
    local ok, err = pcall(function()
      if p.queue then
        local list = {}
        for _, n in ipairs(p.queue) do
          local t, why = tech_ok(force, n)
          if not t then error(why, 0) end
          list[#list + 1] = t
        end
        force.research_queue = list
      elseif mode == "remove" then
        local list = {}
        for _, t in pairs(force.research_queue or {}) do
          if t.name ~= p.name then list[#list + 1] = t end
        end
        force.research_queue = list
      else
        local t, why = tech_ok(force, p.name)
        if not t then error(why, 0) end
        if mode == "front" then
          local list = { t }
          for _, q in pairs(force.research_queue or {}) do
            if q.name ~= t.name then list[#list + 1] = q end
          end
          force.research_queue = list
        else
          if not force.add_research(t) then error("the queue refused " .. t.name, 0) end
        end
      end
    end)
    if not ok then
      ctx.task.error = "research: " .. tostring(err)
      return "failed"
    end
    ctx.task.result = {
      current = force.current_research and force.current_research.name or nil,
      queue = queue_names(force),
    }
    return "done"
  end,
  step = function(ctx) return "failed" end,
}

------------------------------------------------------------------ 즉시 실행

M.ACTS = {
  "set_recipe", "rotate", "set_filter", "set_limit", "set_requests", "set_condition",
  "launch_rocket", "place_ghost", "deconstruct_mark", "upgrade_mark", "request_items", "research",
}

for _, name in ipairs(M.ACTS) do Tasks[name] = M[name] end

-- 서 있는 자리에서 «지금» 한다 (걷지 않는다). 손이 안 닿으면 거절한다.
-- 사람이 GUI 를 여는 것과 같다 - 지도 조작은 어디서나, 손 조작은 닿는 데서만.
function M.act(a, bot, task_type, params)
  local handler = M[task_type]
  if type(handler) ~= "table" or not handler.start then
    return { error = "act supports: " .. table.concat(M.ACTS, ", ") }
  end
  local task = { id = 0, type = task_type, params = params or {}, state = { instant = true } }
  local ctx = { bot = bot, task = task, surface = bot.surface, tick = game.tick }
  local ok, status = pcall(function()
    local s = handler.start(ctx)
    if s == "running" then s = handler.step(ctx) end
    return s
  end)
  if not ok then return { error = "lua error: " .. tostring(status) } end
  if status == "done" then
    local r = task.result or {}
    r.agent = a.name
    return r
  end
  if status == "running" then
    return { error = "not finished in one tick - submit it as an order" }
  end
  return { error = task.error or "failed" }
end

return M

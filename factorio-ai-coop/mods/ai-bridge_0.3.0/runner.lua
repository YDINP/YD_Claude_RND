-- 일감을 실제로 돌리는 곳 - 큐, 매 틱의 전진, 끝난 일의 보관.

local Tasks = require("tasks")
local Core = require("core")
local DEFAULT_TIMEOUT = Core.DEFAULT_TIMEOUT
local RESULT_HISTORY  = Core.RESULT_HISTORY
local agent           = Core.agent
local body            = Core.body
local Stock = require("stock")
local health = Stock.health
local Panel = require("panel")
local drop_marker    = Panel.drop_marker
local refresh_marker = Panel.refresh_marker
local remember_line  = Panel.remember_line

--------------------------------------------------------------------- results

local function archive(a, task, status)
  storage.results[task.id] = {
    id = task.id,
    agent = a.name,
    type = task.type,
    status = status,
    -- 실패한 태스크가 «무엇을 하려다»였는지는 params에만 남는다. 마른 광맥에
    -- 대고 실패한 mine이 어느 광석이었는지 알아야 동료에게 부탁할 수 있다.
    params = task.params,
    result = task.result,
    error = task.error,
    finished_tick = game.tick,
  }
  table.insert(storage.result_order, task.id)
  -- Ring buffer: keep memory flat no matter how long the session runs.
  while #storage.result_order > RESULT_HISTORY do
    local oldest = table.remove(storage.result_order, 1)
    storage.results[oldest] = nil
  end
end

--------------------------------------------------------------- 트리거 기술

-- 2.0 의 앞쪽 기술들은 과학팩이 아니라 «무엇을 만들었는가»로 열린다. 그런데
-- 엔진은 그걸 on_player_crafted_item 에서 세고, 우리 캐릭터에는 플레이어가
-- 붙어 있지 않다.
--
-- 실측(2026-09-17): 에이전트가 랩을 제작해 crafted=1 을 돌려받았는데도
-- automation-science-pack 은 researched=false 로 남았다. add_research 로
-- 큐에 넣는 것도 거부된다 - 트리거 기술은 랩이 연구하는 것이 아니라서다.
-- 그대로 두면 AI 는 기술 트리 두 번째 칸에서 영원히 멈춘다.
--
-- 그래서 엔진이 사람에게 세어주는 것과 «똑같은 조건»으로 우리가 센다.
-- 제련해서 얻은 판금은 세지 않는다 - 사람이 제련해도 craft 트리거는 열리지
-- 않기 때문이다. 세는 것은 오직 손으로 만든 것뿐이다.

local function trigger_item_name(trigger)
  local want = trigger.item
  if type(want) == "table" then return want.name end
  return want
end

local function count_craft(force, item, amount)
  if not item or amount <= 0 then return end
  storage.crafted = storage.crafted or {}
  storage.crafted[item] = (storage.crafted[item] or 0) + amount

  for _, tech in pairs(force.technologies) do
    if tech.enabled and not tech.researched then
      local trigger = tech.prototype.research_trigger
      if trigger and trigger.type == "craft-item"
          and trigger_item_name(trigger) == item
          and storage.crafted[item] >= (trigger.count or 1) then
        tech.researched = true
        pcall(remember_line, "AI", "손으로 " .. item .. "을(를) 만들어 «"
          .. tech.name .. "» 기술이 열렸습니다.")
      end
    end
  end
end

local function count_crafted_recipe(force, recipe_name, runs)
  local recipe = prototypes.recipe[recipe_name]
  if not recipe or runs <= 0 then return end
  for _, product in pairs(recipe.products) do
    if product.type == "item" then
      count_craft(force, product.name, (product.amount or 1) * runs)
    end
  end
end

-- Every task ends here and nowhere else. Scattering "stop walking, stop mining,
-- record the result" across call sites is how a cancelled task leaves its
-- character walking away while the next one tries to craft.
local function finish(a, task, status)
  local b = body(a)
  -- 손으로 만든 것은 트리거 기술을 연다. 엔진이 우리 캐릭터를 세어주지
  -- 않으므로 여기서 센다.
  if status == "done" and task.type == "craft" and task.result and b then
    pcall(count_crafted_recipe, b.force, task.result.recipe,
          task.result.crafted or 0)
  end
  if b then
    pcall(function()
      Tasks.halt(b)
      b.mining_state = { mining = false }
    end)
  end
  archive(a, task, status)
  a.current = nil
end

local function drop_queue(a, reason)
  for _, pending in ipairs(a.queue) do
    pending.error = reason
    archive(a, pending, "failed")
  end
  a.queue = {}
end

--------------------------------------------------------------------- the loop

local function drive_agent(a)
  local b = body(a)
  if not b then
    if a.current then
      a.current.error = "character died or was removed"
      finish(a, a.current, "failed")
    end
    -- Nothing can run without a character, so do not let the queue sit there
    -- answering "queued" to an agent that would wait forever.
    if #a.queue > 0 then
      drop_queue(a, "character died or was removed")
    end
    return
  end

  if not a.current then
    a.current = table.remove(a.queue, 1)
    if not a.current then return end
    a.current.started_tick = game.tick
  end

  local task = a.current
  local handler = Tasks[task.type]
  local ctx = { bot = b, task = task, surface = b.surface, tick = game.tick }

  -- A raw Lua error inside on_tick does not just fail the task: Factorio tears
  -- the whole server down with "multiplayer error", dropping every human in the
  -- game. An agent that can pass a bad recipe name must not be able to do that.
  local ok, status = pcall(function()
    if not task.started then
      task.started = true
      return handler.start(ctx)
    end
    return handler.step(ctx)
  end)

  if not ok then
    task.error = "lua error: " .. tostring(status)
    status = "failed"
  end

  if status == "running" then
    if game.tick - task.started_tick > (task.timeout_ticks or DEFAULT_TIMEOUT) then
      task.error = string.format(
        "timeout after %d ticks at %.1f,%.1f", game.tick - task.started_tick,
        b.position.x, b.position.y)
      status = "failed"
    else
      return
    end
  end

  finish(a, task, status)
end

local function drive()
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a then drive_agent(a) end
  end
end

local function agent_status(name)
  local a = agent(name)
  if not a then return { error = "no such agent: " .. tostring(name) } end
  local b = body(a)
  local queued = {}
  for _, t in ipairs(a.queue) do queued[#queued + 1] = { id = t.id, type = t.type } end
  return {
    name = name,
    alive = b ~= nil,
    x = b and b.position.x or nil,
    y = b and b.position.y or nil,
    health = b and b.health or nil,
    force = b and b.force.name or nil,
    labelled = (a.label ~= nil and a.label.valid) or false,
    on_map = (a.tag ~= nil and a.tag.valid) or false,
    current = a.current and {
      id = a.current.id, type = a.current.type,
      elapsed = game.tick - a.current.started_tick,
    } or nil,
    queued = queued,
  }
end

------------------------------------------------------------------- tasks

-- `Tasks` also exports helpers like dist/halt, which are functions, not
-- handlers. Checking truthiness alone would accept "halt" as a task type and
-- fail later with "attempt to index a function value".
local function handler_for(task_type)
  local handler = Tasks[task_type]
  if type(handler) == "table" and handler.start and handler.step then return handler end
  return nil
end

local function make_task(task_type, params)
  local task = {
    id = storage.next_id,
    type = task_type,
    params = params or {},
    state = {},
    timeout_ticks = (params and params.timeout_ticks) or DEFAULT_TIMEOUT,
  }
  storage.next_id = storage.next_id + 1
  return task
end

------------------------------------------------------------------- interface

local function spawn_at(name, force_name, position, adopt)
  local surface = game.surfaces[1]
  local character = adopt

  if not character then
    local pos = surface.find_non_colliding_position("character", position, 60, 1)
    if not pos then return { error = "no free space to spawn a character" } end
    -- Create before destroying anything: if this throws, an existing agent
    -- keeps the character it already had instead of losing it to a typo.
    local ok, fresh = pcall(function()
      return surface.create_entity { name = "character", position = pos, force = force_name }
    end)
    if not ok or not fresh then
      return { error = "could not create character: " .. tostring(fresh) }
    end
    character = fresh
  end

  local existing = agent(name)
  if existing then
    local old = body(existing)
    if old and old ~= character then old.destroy() end
    drop_queue(existing, "agent respawned")
    drop_marker(existing)
    existing.char, existing.current = character, nil
  else
    storage.next_index = (storage.next_index or 0) + 1
    storage.agents[name] = {
      name = name, char = character, queue = {}, current = nil,
      index = storage.next_index,
    }
    table.insert(storage.order, name)
  end
  pcall(refresh_marker, storage.agents[name])

  return {
    name = name,
    unit_number = character.unit_number,
    x = character.position.x, y = character.position.y,
    force = character.force.name,
  }
end

return {
  agent_status = agent_status,
  archive = archive,
  count_craft = count_craft,
  count_crafted_recipe = count_crafted_recipe,
  drive = drive,
  drive_agent = drive_agent,
  drop_queue = drop_queue,
  finish = finish,
  handler_for = handler_for,
  make_task = make_task,
  spawn_at = spawn_at,
  trigger_item_name = trigger_item_name,
}

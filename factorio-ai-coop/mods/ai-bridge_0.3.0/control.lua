

-- 하는 일은 전부 아래 모듈에 있다. 여기 남는 것은 «게임이 부르는
-- 자리»뿐이다 - 이벤트 처리기와 원격 인터페이스.
--
--   core     숫자, 저장소, 누가 어느 몸인가
--   craft    무엇을 만들 수 있는가
--   power    물가, 발전소 자리, 전선, 끊긴 데
--   sites    무엇을 어디에 세울 것인가
--   stock    무엇이 어디에 얼마나 있고, 무엇이 멈춰 있는가
--   observe  한 번의 호출로 주변을 통째로 읽는다
--   panel    이름표, 지도 표시, 패널, 대화창
--   runner   큐와 매 틱의 전진
--   tasks    걷기/캐기/짓기 한 걸음씩

local Tasks = require("tasks")
local Core = require("core")
local Plots = require("plots")
local mine_seats = Plots.mine_seats
local AUTOSAVE_INTERVAL = Core.AUTOSAVE_INTERVAL
local CHAT_HISTORY      = Core.CHAT_HISTORY
local MARKER_INTERVAL   = Core.MARKER_INTERVAL
local MAX_AGENTS        = Core.MAX_AGENTS
local MAX_QUEUE         = Core.MAX_QUEUE
local PATH_ANSWER_TTL   = Core.PATH_ANSWER_TTL
local agent             = Core.agent
local body              = Core.body
local init              = Core.init
local Craft = require("craft")
local compute_plan = Craft.compute_plan
local Power = require("power")
local pole_route     = Power.pole_route
local power_reach    = Power.power_reach
local power_faults     = Power.power_faults
local power_plan       = Power.power_plan
local power_status     = Power.power_status
local water_sites_near = Power.water_sites_near
local wire_spot        = Power.wire_spot
local Sites = require("sites")
local feed_belts   = Sites.feed_belts
local aim_drill      = Sites.aim_drill
local assembler_site = Sites.assembler_site
local belt_route     = Sites.belt_route
local blocking       = Sites.blocking
local coal_pair_site = Sites.coal_pair_site
local drill_site     = Sites.drill_site
local fuel_rig       = Sites.fuel_rig
local set_recipe     = Sites.set_recipe
local threat         = Sites.threat
local unstick        = Sites.unstick
local Stock = require("stock")
local base          = Stock.base
local blind_drills  = Stock.blind_drills
local broken        = Stock.broken
local chest_stock   = Stock.chest_stock
local feeds         = Stock.feeds
local furnace_stock = Stock.furnace_stock
local health        = Stock.health
local hungry_rigs   = Stock.hungry_rigs
local poor_drills   = Stock.poor_drills
local smelter       = Stock.smelter
local stores        = Stock.stores
local strays        = Stock.strays
local Observe = require("observe")
local inventory = Observe.inventory
local observe   = Observe.observe

local Panel = require("panel")
local CHAT_CLOSE     = Panel.CHAT_CLOSE
local CHAT_NAME      = Panel.CHAT_NAME
local CHAT_TOGGLE    = Panel.CHAT_TOGGLE
local PANEL_NAME     = Panel.PANEL_NAME
local WATCH_PREFIX   = Panel.WATCH_PREFIX
local build_chat     = Panel.build_chat
local build_panel    = Panel.build_panel
local chat_rows      = Panel.chat_rows
local drop_marker    = Panel.drop_marker
local panel_rows     = Panel.panel_rows
local refresh_marker = Panel.refresh_marker
local remember_line  = Panel.remember_line
local watch          = Panel.watch
local Audit = require("audit")
local audit = Audit.audit

local Defence = require("defence")
local defence      = Defence.defence
local smoking_idle = Defence.smoking_idle

local Belts = require("belts")
local loose_belts = Belts.loose_belts
local ore_line    = Belts.ore_line
local flows       = Belts.flows
local flow_plan   = Belts.flow_plan
local claim_work  = Belts.claim_work

local City = require("city")
local lay_out = City.lay_out
local read_map = City.read_map

local Zones = require("zones")
local draw_zones = Zones.draw_zones
local misplaced  = Zones.misplaced
local next_seat  = Zones.next_seat
local zones      = Zones.zones

local Runner = require("runner")
local agent_status = Runner.agent_status
local drive        = Runner.drive
local drop_queue   = Runner.drop_queue
local finish       = Runner.finish
local handler_for  = Runner.handler_for
local make_task    = Runner.make_task
local spawn_at     = Runner.spawn_at

script.on_init(init)

script.on_configuration_changed(init)

script.on_nth_tick(AUTOSAVE_INTERVAL, function()
  -- server_save with no name writes over the save the server is running, which
  -- is the one the next start will load. pcall because this is meaningless
  -- (and an error) outside a headless server.
  local ok = pcall(function() game.server_save() end)
  if ok then
    storage.last_save_tick = game.tick
  end
end)

-- One handler for both: registering on_nth_tick twice with the same interval
-- replaces the first, which would have silently killed the nametags.
-- 접속하면 바로 보이게 한다. 모드가 바뀌면 클라이언트를 다시 붙여야 하고,
-- 그때마다 어디서 켜는지 찾게 만들 이유가 없다.
script.on_event(defines.events.on_player_joined_game, function(event)
  local player = game.get_player(event.player_index)
  if not player then return end
  pcall(build_panel, player)
  pcall(build_chat, player)
end)

script.on_event(defines.events.on_gui_click, function(event)
  local element = event.element
  if not (element and element.valid) then return end
  local player = game.get_player(event.player_index)
  if not player then return end

  if element.name == CHAT_TOGGLE then
    if player.gui.screen[CHAT_NAME] then
      player.gui.screen[CHAT_NAME].destroy()
    else
      pcall(build_chat, player)
    end
  elseif element.name == CHAT_CLOSE then
    if player.gui.screen[CHAT_NAME] then
      player.gui.screen[CHAT_NAME].destroy()
    end
  elseif string.sub(element.name, 1, #WATCH_PREFIX) == WATCH_PREFIX then
    local name = string.sub(element.name, #WATCH_PREFIX + 1)
    pcall(watch, player, name)
  end
end)

-- A character with no player attached reveals nothing: charting follows
-- players, not bodies. So the crew walked 280 tiles north and the map stayed
-- black for the human ("여전히 캐릭터가 탐색한 안개지형이 나한테 공유가안됨").
-- Chart what a walking player would see - a few chunks around where the body
-- actually stands - and nothing more. force.chart over the whole map stays
-- forbidden: fog lifts by walking (docs/playbook.md).
local WALK_SIGHT = 64   -- tiles each way = 2 chunks, about one map screen

local function chart_underfoot(a)
  local b = body(a)
  if not b then return end
  local p = b.position
  b.force.chart(b.surface, {
    { p.x - WALK_SIGHT, p.y - WALK_SIGHT }, { p.x + WALK_SIGHT, p.y + WALK_SIGHT },
  })
end

script.on_nth_tick(MARKER_INTERVAL, function()
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a then
      pcall(refresh_marker, a)
      pcall(chart_underfoot, a)
    end
  end
  for _, player in pairs(game.connected_players) do
    local frame = player.gui.left[PANEL_NAME]
    if frame and frame.valid then
      pcall(panel_rows, frame)
    end
    local chat = player.gui.screen[CHAT_NAME]
    if chat and chat.valid then
      pcall(chat_rows, chat)
    end
  end
end)

-- Second belt: even a bug in the queue bookkeeping itself must not take the
-- server down mid-session.
script.on_event(defines.events.on_tick, function()
  local ok, err = pcall(drive)
  if not ok then
    log("ai-bridge: internal error in the drive loop: " .. tostring(err))
    for _, name in ipairs(storage.order) do
      local a = storage.agents[name]
      if a and a.current then
        a.current.error = "internal error: " .. tostring(err)
        pcall(finish, a, a.current, "failed")
        a.current = nil
      end
    end
  end
end)

-- The pathfinder answers asynchronously. Park the answer under its request id
-- and let whichever task asked for it pick it up on its next step; that keeps
-- nested walks (a mine task walking to its ore) working without extra wiring.
script.on_event(defines.events.on_script_path_request_finished, function(event)
  -- `try_again_later` is not a failure: the pathfinder was busy, which happens
  -- constantly on long walks. Treating it as "unreachable" is how an agent
  -- gives up on a patch it could have walked to.
  storage.paths[event.id] = {
    path = event.path or false,
    try_again_later = event.try_again_later or false,
    tick = event.tick,
  }
end)

-- There is no API to cancel a path request, so an answer whose task was
-- cancelled, timed out or died has nobody left to collect it. Waypoint lists are
-- kilobytes each, and `storage` is not only saved but also shipped to every
-- player who joins, so an uncollected answer leaks into join times.
script.on_nth_tick(600, function()
  for id, entry in pairs(storage.paths) do
    if game.tick - entry.tick > PATH_ANSWER_TTL then
      storage.paths[id] = nil
    end
  end
end)

-- Chat is the command channel: the human types, the agents read it on their next
-- poll and answer with `say`. Kept as a small ring so the log never grows.
script.on_event(defines.events.on_console_chat, function(event)
  if not event.player_index then return end
  local player = game.get_player(event.player_index)
  if not player then return end
  table.insert(storage.chat, { tick = event.tick, player = player.name, message = event.message })
  while #storage.chat > CHAT_HISTORY do
    table.remove(storage.chat, 1)
  end
  -- 사람이 쓴 줄도 대화창에 남긴다. 대답만 모여 있으면 무엇에 대한
  -- 대답인지 알 수가 없다. 한쪽 말만 적힌 대화는 대화가 아니다.
  pcall(remember_line, player.name, event.message)
end)

remote.add_interface("ai", {
  -- Add an agent. Same force as the humans by default, so everyone shares
  -- research, map and buildings.
  spawn = function(name, force_name)
    name = tostring(name or "agent")
    force_name = force_name or "player"
    if not game.forces[force_name] then
      return { error = "no such force: " .. force_name }
    end
    if not storage.agents[name] and #storage.order >= MAX_AGENTS then
      return { error = "too many agents (max " .. MAX_AGENTS .. ")" }
    end

    -- Start new agents next to whoever is around, so they appear where the
    -- action is rather than at the origin.
    local anchor = { 0, 0 }
    for _, p in pairs(game.connected_players) do
      anchor = p.position
      break
    end
    for _, other in ipairs(storage.order) do
      local ob = body(storage.agents[other])
      if ob then
        anchor = ob.position
        break
      end
    end
    return spawn_at(name, force_name, anchor, nil)
  end,

  -- 죽은 요원은 누가 되살려주는가.
  --
  -- 사용자 지시: "캐릭터가 사망한 에이전트가 계속 작업을 시도함"
  --
  -- 맞다. 죽으면 `drive_agent` 가 태스크를 실패시키고 대기줄을 비운다.
  -- 거기까지다. 몸이 없는 요원에게 무리는 계속 일을 준다. 일은 계속
  -- 실패하고, 실패했으니 다시 주고 - 그렇게 영원히 돈다.
  --
  -- 태스크를 실패시키는 것과 요원을 되살리는 것은 다른 일이다. 앞의 것만
  -- 해놓고 뒤의 것이 없으면 「조용히 아무것도 안 되는」 상태가 된다.
  --
  -- 살아 있으면 아무것도 안 한다. 죽었으면 기지에서 다시 세운다 - 죽은
  -- 자리에서 세우면 죽인 것 옆에서 다시 시작하는 셈이다.
  alive = function(name)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    local b = body(a)
    if b then
      return { alive = true, x = b.position.x, y = b.position.y }
    end
    return { alive = false }
  end,

  revive = function(name)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    if body(a) then return { alive = true, revived = false } end

    local home = (base() or {}).home
    local anchor = home and { home.x, home.y } or { 0, 0 }
    -- 기지를 모르면 살아 있는 동료 옆에서. 그것도 없으면 원점이다.
    if not home then
      for _, other in ipairs(storage.order) do
        local ob = body(storage.agents[other])
        if ob then anchor = ob.position break end
      end
    end

    local out = spawn_at(name, "player", anchor, nil)
    if out and out.error then return out end
    local b = body(agent(name))
    return { alive = b ~= nil, revived = true,
             x = b and b.position.x, y = b and b.position.y }
  end,

  remove = function(name)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    drop_marker(a)
    local b = body(a)
    if b then b.destroy() end
    drop_queue(a, "agent removed")
    storage.agents[name] = nil
    for index, other in ipairs(storage.order) do
      if other == name then
        table.remove(storage.order, index)
        break
      end
    end
    return { removed = name, remaining = #storage.order }
  end,

  list = function()
    local out = {}
    for _, name in ipairs(storage.order) do
      out[#out + 1] = agent_status(name)
    end
    return { agents = out, tick = game.tick, count = #out }
  end,

  status = agent_status,
  observe = observe,
  inventory = inventory,

  submit = function(name, task_type, params)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    if not handler_for(task_type) then
      return { error = "unknown task type: " .. tostring(task_type) }
    end
    if #a.queue >= MAX_QUEUE then
      return { error = "queue is full (" .. MAX_QUEUE .. "); cancel or wait" }
    end
    local task = make_task(task_type, params)
    table.insert(a.queue, task)
    return { id = task.id, agent = name, queued = #a.queue }
  end,

  -- Queue a whole plan in one round trip. All or nothing: a plan that is
  -- rejected must not leave the character already walking its first two steps.
  submit_many = function(name, list)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    list = list or {}
    if #a.queue + #list > MAX_QUEUE then
      return { error = "queue would overflow (" .. MAX_QUEUE .. " max)" }
    end
    for index, item in ipairs(list) do
      if not handler_for(item.type) then
        return { error = string.format("step %d: unknown task type: %s", index, tostring(item.type)) }
      end
    end
    local ids = {}
    for _, item in ipairs(list) do
      local task = make_task(item.type, item.params)
      table.insert(a.queue, task)
      ids[#ids + 1] = task.id
    end
    return { ids = ids, agent = name }
  end,

  poll = function(id)
    if storage.results[id] then return storage.results[id] end
    for _, name in ipairs(storage.order) do
      local a = storage.agents[name]
      if a.current and a.current.id == id then
        return { id = id, agent = name, status = "running", type = a.current.type,
                 elapsed = game.tick - a.current.started_tick }
      end
      for _, t in ipairs(a.queue) do
        if t.id == id then return { id = id, agent = name, status = "queued", type = t.type } end
      end
    end
    return { id = id, status = "unknown" }
  end,

  cancel = function(name)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    local dropped = #a.queue
    drop_queue(a, "cancelled")
    if a.current then
      a.current.error = "cancelled"
      finish(a, a.current, "failed")
      dropped = dropped + 1
    else
      local b = body(a)
      if b then
        Tasks.halt(b)
        b.mining_state = { mining = false }
      end
    end
    return { agent = name, cancelled = dropped }
  end,

  cancel_all = function()
    local total = 0
    for _, name in ipairs(storage.order) do
      total = total + (remote.call("ai", "cancel", name).cancelled or 0)
    end
    return { cancelled = total, agents = #storage.order }
  end,

  give = function(name, items)
    local a = agent(name)
    local b = body(a)
    if not b then return { error = "no such agent: " .. tostring(name) } end
    for item, count in pairs(items or {}) do b.insert { name = item, count = count } end
    return inventory(name)
  end,

  -- Look at what is actually standing on a spot. Automation needs this: a
  -- mining drill decides for itself which tile it drops ore onto, so the chest
  -- has to go where the drill says, not where we guessed.
  inspect = function(x, y, radius)
    local out = {}
    for _, e in pairs(game.surfaces[1].find_entities_filtered {
      position = { x, y }, radius = radius or 2, limit = 8,
    }) do
      if e.type ~= "character" and e.type ~= "resource" then
        local info = {
          name = e.name, type = e.type, direction = e.direction,
          x = e.position.x, y = e.position.y,
        }
        local ok, drop = pcall(function() return e.drop_position end)
        if ok and drop then
          info.drop_x, info.drop_y = drop.x, drop.y
        end
        -- Enough to answer "is this thing actually running?" without guessing
        -- from the outside.
        pcall(function() info.energy = e.energy end)
        pcall(function() info.network = e.electric_network_id end)
        pcall(function() info.status = e.status end)
        out[#out + 1] = info
      end
    end
    return { entities = out }
  end,

  -- The recipe and technology graphs, read straight from the game.
  --
  -- A planner aiming at a rocket cannot carry a hand-written ladder: the chain
  -- from ore to silo is hundreds of steps long, and any step transcribed by
  -- hand is a step that can be wrong. The game already holds the whole graph,
  -- including what research has unlocked, so the planner walks that instead.
  recipe = function(name)
    local proto = prototypes.recipe[name]
    if not proto then return { error = "no such recipe: " .. tostring(name) } end

    local ingredients, products = {}, {}
    for _, item in pairs(proto.ingredients) do
      ingredients[#ingredients + 1] = { name = item.name, amount = item.amount, type = item.type }
    end
    for _, item in pairs(proto.products) do
      products[#products + 1] = {
        name = item.name, amount = item.amount or item.amount_max, type = item.type,
      }
    end

    local force = game.forces["player"]
    return {
      name = proto.name,
      category = proto.category,
      energy = proto.energy,
      ingredients = ingredients,
      products = products,
      -- `enabled` is per force: a recipe exists from the start but may be
      -- locked behind research.
      enabled = force.recipes[name] and force.recipes[name].enabled or false,
      hand_craftable = proto.category == "crafting",
    }
  end,

  technology = function(name)
    local force = game.forces["player"]
    local tech = force.technologies[name]
    if not tech then return { error = "no such technology: " .. tostring(name) } end

    local prerequisites, packs = {}, {}
    for key in pairs(tech.prerequisites) do prerequisites[#prerequisites + 1] = key end
    for _, unit in pairs(tech.research_unit_ingredients) do
      packs[#packs + 1] = { name = unit.name, amount = unit.amount }
    end
    table.sort(prerequisites)

    local unlocks = {}
    for _, effect in pairs(tech.prototype.effects or {}) do
      if effect.type == "unlock-recipe" then unlocks[#unlocks + 1] = effect.recipe end
    end

    -- 2.0 gates the earliest technologies behind an action rather than science
    -- packs: electronics wants ten copper plates crafted, steam power fifty
    -- iron ones. An agent that only knows about labs can never start.
    local trigger = tech.prototype.research_trigger
    local trigger_info = nil
    if trigger then
      trigger_info = { type = trigger.type, count = trigger.count or 1 }
      if trigger.item then
        trigger_info.item = type(trigger.item) == "string" and trigger.item or trigger.item.name
      end
      if trigger.entity then trigger_info.entity = trigger.entity end
      if trigger.fluid then trigger_info.fluid = trigger.fluid end
    end

    return {
      name = tech.name,
      researched = tech.researched,
      enabled = tech.enabled,
      prerequisites = prerequisites,
      packs = packs,
      count = tech.research_unit_count,
      unlocks = unlocks,
      trigger = trigger_info,
    }
  end,

  -- Everything that could be started right now: prerequisites met, not yet
  -- researched. The planner picks from here instead of guessing tech names.
  available_research = function()
    local force = game.forces["player"]
    local out = {}
    for name, tech in pairs(force.technologies) do
      if tech.enabled and not tech.researched then
        local ready = true
        for _, prereq in pairs(tech.prerequisites) do
          if not prereq.researched then ready = false break end
        end
        if ready then
          local packs = {}
          for _, unit in pairs(tech.research_unit_ingredients) do
            packs[#packs + 1] = { name = unit.name, amount = unit.amount }
          end
          local trigger = tech.prototype.research_trigger
          out[#out + 1] = {
            name = name,
            count = tech.research_unit_count,
            packs = packs,
            trigger_type = trigger and trigger.type or nil,
            trigger_item = trigger and trigger.item
              and (type(trigger.item) == "string" and trigger.item or trigger.item.name) or nil,
            trigger_count = trigger and (trigger.count or 1) or nil,
          }
        end
      end
    end
    table.sort(out, function(a, b) return a.name < b.name end)
    return { available = out }
  end,

  -- Which technology unlocks a recipe, so the planner can ask "why can I not
  -- build this yet?" without a lookup table of its own.
  unlocked_by = function(recipe_name)
    local force = game.forces["player"]
    for _, tech in pairs(force.technologies) do
      for _, effect in pairs(tech.prototype.effects or {}) do
        if effect.type == "unlock-recipe" and effect.recipe == recipe_name then
          return { technology = tech.name, researched = tech.researched }
        end
      end
    end
    return { technology = nil }
  end,

  research = function(name)
    local force = game.forces["player"]
    local tech = force.technologies[name]
    if not tech then return { error = "no such technology: " .. tostring(name) } end
    if tech.researched then return { already = true, name = name } end
    local ok, err = pcall(function() force.add_research(name) end)
    if not ok then return { error = tostring(err) } end
    return { queued = name, queue_length = #force.research_queue }
  end,

  -- Where an offshore pump could go. There is no API for "a spot on the shore",
  -- so this brute-forces it: find water, then try the four directions on the
  -- tiles around it and let the game say which placement it accepts.
  water_sites = function(x, y, radius, wanted)
    local sites = water_sites_near(game.surfaces[1], game.forces["player"],
                                   x, y, radius, wanted)
    return { sites = sites, water_found = #sites > 0 }
  end,

  -- 펌프-보일러-기관이 통째로 들어가는 자리. 눈 감고 좌표를 재는 대신
  -- 임시로 세워 보고 확인된 좌표만 돌려준다.
  power_plan = power_plan,

  -- 전기가 실제로 흐르는가. 서 있는 기관 수가 아니라.
  power_status = power_status,

  -- 발전소가 어디서 끊겼는지 조목조목.
  -- 전기가 있는 곳에서 필요한 곳까지, 그리고 그 사이 전봇대 자리.
  power_reach = power_reach,
  pole_route = pole_route,

  power_faults = power_faults,

  -- 세운 수가 아니라 도는 수.
  health = health,

  -- 얇은 자리에 선 채굴기. 마르기를 기다릴 이유가 없다.
  poor_drills = poor_drills,

  -- 출구가 없어 멈춘 채굴기와, 그 앞에 화로를 놓을 자리.
  blind_drills = blind_drills,

  -- 캐는 구역에서 제련 구역까지의 광석 길 - 아직 없는 것만.
  ore_line = ore_line,

  -- 사슬이 실제로 흐르는가. 상태 문자열이 아니라 누적 생산량으로.
  audit = audit,

  -- 방어 - 공해가 어디까지 갔고, 방어선은 어디에 서는가.
  defence = defence,
  smoking_idle = smoking_idle,

  -- 물류 - 무엇이 어디서 어디로 흐르는가, 그리고 아직 없는 것.
  flows = flows,
  flow_plan = flow_plan,

  -- 설계는 한 번, 건설은 여럿이. 남이 집어간 칸은 안 준다.
  claim_work = claim_work,
  loose_belts = loose_belts,

  -- 무엇을 어디서 하는가. 채굴 / 제련 / 조립.
  zones = zones,

  -- 반장이 지도를 «먼저» 보고 네 구역을 한꺼번에 정한다.
  -- 짓는 순서가 자리를 정하면, 자리는 짓는 순서만큼 우연해진다.
  lay_out = lay_out,
  read_map = function(name)
    local a = agent(name)
    local b = body(a)
    local home = (base() or {}).home
      or (b and { x = math.floor(b.position.x), y = math.floor(b.position.y) })
    if not home then return { error = "no home yet" } end
    return read_map(b and b.surface or game.surfaces[1], home, 250)
  end,

  -- 제자리가 아닌 건물들, 그리고 제자리에 이미 선 수.
  misplaced = misplaced,

  -- 그 구역에서 다음에 놓을 빈 자리.
  next_seat = next_seat,
  -- 한 밭의 채굴기 자리표. 「어느 밭」은 부르는 쪽이 고른다 - 밭 목록은
  -- 이미 `zones` 가 준다.
  -- `rich` 는 «세우는 문턱»이다. 걷어내는 문턱(poor_drills)보다 높아야
  -- 한다 - 같으면 세우자마자 걷는다. 두 수는 부르는 쪽 한 곳에서 나온다.
  -- `ore` 는 «이 밭이 무슨 밭인가»다. 안 주면 가운데 칸에 물어 짐작하는데,
  -- 남의 광맥이 박힌 밭에서는 그 짐작이 틀린다(plots.ore_under 주석 참고).
  mine_seats = function(name, left, top, right, bottom, wanted, rich, ore)
    local a = Core.agent(name)
    local b = a and Core.body(a)
    if not b then return { error = "no such agent: " .. tostring(name) } end
    return mine_seats(b.surface, b.force,
      { left = left, top = top, right = right, bottom = bottom }, wanted, rich, ore)
  end,
  draw_zones = draw_zones,

  -- 기지의 무게중심, 그리고 거기서 너무 멀리 떨어진 우리 건물.
  base = base,
  -- 제련 블록의 모서리. 인자를 주면 정하고, 안 주면 알려준다.
  smelter = smelter,
  strays = strays,

  -- 이 채굴기가 무엇에게 넣고 있는가 (세운 뒤 확인용).
  feeds = feeds,

  -- 두 점을 잇는 벨트 길.
  belt_route = belt_route,

  -- 기계 한 대를 영구히 먹이는 «상자-인서터» 자리.
  fuel_rig = fuel_rig,

  -- 세워는 놨는데 상자가 빈 급유 장치들.
  hungry_rigs = hungry_rigs,

  -- 걸어서 못 나오는 곳에 갇힌 사람을 꺼낸다.
  unstick = unstick,

  -- 조립기: 무엇을 만들지 정하고, 랩 옆 자리를 찾는다.
  set_recipe = set_recipe,
  assembler_site = assembler_site,

  -- 전봇대가 이 기계에 실제로 «닿는» 자리.
  wire_spot = wire_spot,

  -- 둥지가 얼마나 가까운지, 대비 수단이 열려 있는지.
  threat = threat,

  -- 길 위에 서 있는 우리 건물들.
  blocking = blocking,

  research_status = function()
    local force = game.forces["player"]
    local queue = {}
    for _, tech in pairs(force.research_queue or {}) do queue[#queue + 1] = tech.name end
    local labs = #game.surfaces[1].find_entities_filtered { name = "lab", force = force }
    return {
      current = force.current_research and force.current_research.name or nil,
      progress = force.research_progress,
      queue = queue,
      labs = labs,
    }
  end,

  -- Force a save right now, over the file the server is running.
  -- Show or hide the crew panel for one player.
  panel = function(player_name, show)
    local player = game.get_player(player_name)
    if not player then return { error = "no such player: " .. tostring(player_name) } end
    local existing = player.gui.left[PANEL_NAME]
    if show == false or (show == nil and existing) then
      if existing then existing.destroy() end
      return { player = player_name, open = false }
    end
    build_panel(player)
    return { player = player_name, open = true }
  end,

  -- The daemon decides which resource an agent looks after; the panel just
  -- displays it.
  -- 이 아이템을 만들려면 지금 무엇부터 해야 하는가.
  plan_item = compute_plan,

  -- 채굴기가 들어가고 출구도 비는 자리, 그리고 이미 막힌 것 돌려세우기.
  drill_site = drill_site,
  aim_drill = aim_drill,

  -- 벨트가 옆에 있으면 상자 말고 벨트를 보게 돌린다.
  feed_belts = feed_belts,

  -- 석탄 위에서 서로를 먹이는 채굴기 두 대의 자리.
  coal_pair_site = coal_pair_site,

  -- 지금 멈춰 서 있는 기계들과 «왜».
  broken = broken,

  -- 화로 안에 다 녹은 채 남아 있는 것들.
  furnace_stock = furnace_stock,

  -- 이 아이템이 든 상자들, 가까운 순.
  chest_stock = chest_stock,

  -- 상자들 안을 통째로. 반장이 «없다»고 말하기 전에 보는 곳.
  stores = stores,

  -- 공용 창고. 각자 가방에 광석을 안고 다니면 필요한 사람에게 가지 않는다.
  -- 한 자리를 정해두고 모두가 거기에 넣고 거기서 꺼낸다. 데몬이 재시작해도
  -- 잊지 않도록 게임 쪽에 적어둔다.
  set_depot = function(x, y)
    storage.depot = { x = x, y = y }
    return storage.depot
  end,

  depot = function()
    if not storage.depot then return { depot = nil } end
    -- 반경을 넉넉히 잡으면 옆 상자를 잡는다. 실제로 같은 자리에 상자가
    -- 둘이었고, 넣는 쪽과 세는 쪽이 서로 다른 상자를 보고 있었다.
    local here = game.surfaces[1].find_entities_filtered {
      position = { storage.depot.x, storage.depot.y }, radius = 0.3,
      type = "container",
    }[1]
    if not here then
      storage.depot = nil
      return { depot = nil, lost = true }
    end
    local inv = here.get_inventory(defines.inventory.chest)
    local items = {}
    if inv then
      for _, stack in pairs(inv.get_contents()) do
        items[stack.name] = (items[stack.name] or 0) + stack.count
      end
    end
    return { depot = storage.depot, items = items,
             free = inv and inv.count_empty_stacks() or 0 }
  end,

  set_focus = function(name, focus)
    local a = agent(name)
    if not a then return { error = "no such agent: " .. tostring(name) } end
    a.focus = focus
    return { name = name, focus = focus }
  end,

  -- 목표와 요청 게시판은 파이썬 쪽이 안다. 모드는 받아 적어뒀다가 그린다.
  set_board = function(goal, lines)
    storage.goal = goal
    storage.board = {}
    if type(lines) == "table" then
      for _, line in ipairs(lines) do
        storage.board[#storage.board + 1] = tostring(line)
      end
    end
    return { goal = storage.goal, requests = #storage.board }
  end,

  save = function()
    local ok, err = pcall(function() game.server_save() end)
    if not ok then return { error = tostring(err) } end
    storage.last_save_tick = game.tick
    return { saved = true, tick = game.tick }
  end,

  save_status = function()
    return {
      tick = game.tick,
      last_save_tick = storage.last_save_tick,
      ticks_since_save = storage.last_save_tick and (game.tick - storage.last_save_tick) or nil,
      interval = AUTOSAVE_INTERVAL,
    }
  end,

  -- 사람이 «게임 밖»에서 내리는 지시.
  --
  -- 명령 채널은 게임 채팅이다(on_console_chat). 그런데 사람이 접속하지
  -- 않고 다리 너머에서 지시할 때는 그 사건이 안 일어나므로, 무리는 그
  -- 말을 영영 못 듣는다.
  --
  -- 같은 고리에 같은 모양으로 넣어준다. 그래야 해석하는 쪽도 배차하는
  -- 쪽도 «사람이 채팅으로 말한 것»과 똑같이 다룬다 - 지시를 받는 길이
  -- 둘이면 둘 중 하나는 반드시 뒤처진다.
  tell = function(speaker, message)
    if not message or message == "" then
      return { error = "nothing to say" }
    end
    local who = speaker or "사람"
    table.insert(storage.chat,
      { tick = game.tick, player = who, message = message })
    while #storage.chat > CHAT_HISTORY do
      table.remove(storage.chat, 1)
    end
    pcall(remember_line, who, message)
    return { told = message, tick = game.tick }
  end,

  chat = function(since_tick)
    local out = {}
    for _, line in ipairs(storage.chat) do
      if not since_tick or line.tick > since_tick then out[#out + 1] = line end
    end
    return { tick = game.tick, messages = out }
  end,

  -- 에이전트 말은 게임 채팅으로 내보내지 않는다. 여섯이 동시에 떠들면
  -- 사람이 쓴 줄이 그 사이에 묻히고, 채팅창이 AI 혼잣말로 가득 찬다.
  -- 전용 창(crew_log / AI 대화)에만 쌓는다.
  say = function(text, who)
    pcall(remember_line, who, text)
    return { said = text, tick = game.tick }
  end,

  -- 모아둔 대화. 창을 못 열 때(접속자 없음)도 확인할 수 있어야 한다.
  crew_log = function(limit)
    local log = storage.crew_log or {}
    local want = math.min(limit or 20, #log)
    local out = {}
    for i = #log - want + 1, #log do
      out[#out + 1] = log[i]
    end
    return { lines = out, total = #log }
  end,

  -- 대화 창을 열고 닫는다. show 가 nil 이면 토글.
  chat_window = function(player_name, show)
    local player = game.get_player(player_name)
    if not player then return { error = "no such player: " .. tostring(player_name) } end
    local open = player.gui.screen[CHAT_NAME] ~= nil
    if show == nil then show = not open end
    if show then
      build_chat(player)
    elseif open then
      player.gui.screen[CHAT_NAME].destroy()
    end
    return { player = player_name, open = show }
  end,

  -- Put a human into the observer seat. Their character does not have to be
  -- thrown away: handing it to a new agent keeps the inventory and gives the
  -- watcher one more worker instead of a corpse standing in the field.
  spectate = function(player_name, adopt_as)
    local p = game.get_player(player_name)
    if not p then return { error = "no such player: " .. tostring(player_name) } end

    local vacated = p.character
    local ok = pcall(function()
      p.set_controller { type = defines.controllers.spectator }
    end)
    if not ok then
      -- Older or restricted setups: god mode still detaches the body and lets
      -- the camera move freely.
      local fallback = pcall(function()
        p.set_controller { type = defines.controllers.god }
      end)
      if not fallback then return { error = "could not switch controller" } end
    end

    local adopted = nil
    if vacated and vacated.valid then
      if adopt_as then
        local result = spawn_at(tostring(adopt_as), vacated.force.name, vacated.position, vacated)
        if result.error then return result end
        adopted = result.name
      else
        vacated.destroy()
      end
    end
    return { player = player_name, spectating = true, adopted = adopted }
  end,

  unspectate = function(player_name)
    local p = game.get_player(player_name)
    if not p then return { error = "no such player: " .. tostring(player_name) } end
    if p.character then return { player = player_name, spectating = false } end

    local surface = game.surfaces[1]
    local pos = surface.find_non_colliding_position("character", p.position, 60, 1)
    if not pos then return { error = "no free space to place a character" } end
    local ok, character = pcall(function()
      return surface.create_entity { name = "character", position = pos, force = p.force }
    end)
    if not ok or not character then
      return { error = "could not create character: " .. tostring(character) }
    end
    p.set_controller { type = defines.controllers.character, character = character }
    return { player = player_name, spectating = false, x = pos.x, y = pos.y }
  end,
})

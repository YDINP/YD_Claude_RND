-- ai-bridge: lets external agents (Claude, Codex, ...) play Factorio as
-- characters in an ordinary multiplayer game, while a human watches and gives
-- orders.
--
-- Why a mod at all, when RCON can already run Lua? Because a console command
-- lives for exactly one tick. Walking, mining and crafting happen *over* ticks,
-- and only a mod can hold an on_tick handler across a save/load. So:
--
--   agent -> RCON -> remote.call("ai", "submit", name, ...)   intent, once
--   mod   -> on_tick state machine, one per agent             execution, per tick
--   agent -> RCON -> remote.call("ai", "poll", id)            result, when ready
--
-- Nothing but plain data and entity references goes into `storage`, which is
-- what keeps the world saveable while agents are attached.

local Tasks = require("tasks")

local RESULT_HISTORY = 128     -- completed tasks kept for polling, all agents
-- Long enough for a walk that has to re-route around terrain a few times.
local DEFAULT_TIMEOUT = 7200   -- ticks (2 minutes) before a task is abandoned
local MAX_QUEUE = 64           -- per agent; refuse work rather than grow forever
local MAX_AGENTS = 8
-- 건물 하나당 돌려주는 좌표 개수. 한 종류에 수백 개가 되는 벨트까지 전부
-- 실어보내면 한 번의 observe가 RCON 한 프레임을 통째로 먹는다.
local MAX_SPOTS = 8
local MAX_OBSERVE_RADIUS = 200 -- one observe runs inside a single tick
local PATH_ANSWER_TTL = 1800   -- ticks an uncollected path answer may linger
local CHAT_HISTORY = 50

-- Recipes the self-directed ladder reasons about. Reported with every
-- inventory so an agent can ask "can I build this yet?" instead of trying and
-- failing in a loop.
local PLANNING_RECIPES = {
  "burner-mining-drill", "iron-chest", "stone-furnace", "wooden-chest",
  "iron-gear-wheel", "transport-belt", "copper-cable", "electronic-circuit",
  "lab", "automation-science-pack", "assembling-machine-1", "inserter",
  "pipe", "boiler", "steam-engine", "offshore-pump", "small-electric-pole",
}

-- A headless server only writes back to the save it was started from when it
-- shuts down cleanly. Closing the window or killing the process loses
-- everything, and the autosaves the server settings produce go to separate
-- `_autosave` files that the next start never loads. So the world saves itself
-- over the file it came from, on a timer.
-- 헤드리스 서버는 깨끗하게 종료할 때만 세이브를 되쓴다. 그 사이에 죽으면
-- 마지막 저장 이후는 전부 사라지므로, 간격이 곧 «잃을 수 있는 시간»이다.
-- 작은 맵에서 server_save는 수백 밀리초라 1분마다 해도 눈에 띄지 않는다.
local AUTOSAVE_INTERVAL = 60 * 60       -- ticks (1 minute)

local MARKER_INTERVAL = 30   -- ticks between nametag/map-tag refreshes
local TAG_MOVE_EPSILON = 6   -- tiles an agent may drift before its map tag moves

-- Distinct enough to tell apart at a glance on a dark map.
local COLORS = {
  { r = 0.35, g = 0.80, b = 1.00 },
  { r = 1.00, g = 0.75, b = 0.25 },
  { r = 0.55, g = 1.00, b = 0.45 },
  { r = 1.00, g = 0.50, b = 0.80 },
  { r = 0.70, g = 0.60, b = 1.00 },
  { r = 1.00, g = 0.40, b = 0.35 },
  { r = 0.45, g = 0.95, b = 0.90 },
  { r = 0.90, g = 0.90, b = 0.55 },
}

--------------------------------------------------------------------- storage

local function init()
  storage.agents = storage.agents or {}
  -- Iteration order of a hash table is not something to bet a multiplayer
  -- checksum on, so the agents are driven through an explicit list.
  storage.order = storage.order or {}
  storage.results = storage.results or {}
  storage.result_order = storage.result_order or {}
  storage.paths = storage.paths or {}
  storage.chat = storage.chat or {}
  storage.next_id = storage.next_id or 1
  storage.next_index = storage.next_index or 0
end

script.on_init(init)
script.on_configuration_changed(init)

local function agent(name)
  return storage.agents[name]
end

local function body(a)
  if a and a.char and a.char.valid then return a.char end
  return nil
end

--------------------------------------------------------------- visibility

-- An agent's character is not a player, so the game gives it neither a nametag
-- nor a dot on the minimap. Both have to be drawn by hand, and they are two
-- different mechanisms: a render object follows the entity in the world, while
-- only a map tag shows up on the map and minimap.

local function drop_marker(a)
  if a.label and a.label.valid then a.label.destroy() end
  if a.tag and a.tag.valid then a.tag.destroy() end
  a.label, a.tag = nil, nil
end

local function marker_text(a)
  if a.current then
    return a.name .. " · " .. a.current.type
  end
  if #a.queue > 0 then
    return a.name .. " · " .. #a.queue .. " queued"
  end
  return a.name
end

local function refresh_marker(a)
  local b = body(a)
  if not b then
    drop_marker(a)
    return
  end

  local color = COLORS[(((a.index or 1) - 1) % #COLORS) + 1]

  if not (a.label and a.label.valid) then
    a.label = rendering.draw_text {
      text = marker_text(a),
      surface = b.surface,
      target = { entity = b, offset = { 0, -2.2 } },
      color = color,
      scale = 0.9,
      alignment = "center",
      scale_with_zoom = false,
      only_in_alt_mode = false,
    }
  else
    a.label.text = marker_text(a)
  end

  -- Chart tags cannot be moved, only replaced, so only redraw when the agent
  -- has actually walked somewhere. Otherwise every agent churns a tag twice a
  -- second for no visible difference.
  local moved = not (a.tag and a.tag.valid)
    or Tasks.dist(a.tag.position, b.position) > TAG_MOVE_EPSILON
  if moved then
    if a.tag and a.tag.valid then a.tag.destroy() end
    local ok, tag = pcall(function()
      return b.force.add_chart_tag(b.surface, {
        position = b.position,
        text = a.name,
      })
    end)
    -- add_chart_tag returns nil on an uncharted chunk; try again next time.
    a.tag = (ok and tag) or nil
  end
end

script.on_nth_tick(AUTOSAVE_INTERVAL, function()
  -- server_save with no name writes over the save the server is running, which
  -- is the one the next start will load. pcall because this is meaningless
  -- (and an error) outside a headless server.
  local ok = pcall(function() game.server_save() end)
  if ok then
    storage.last_save_tick = game.tick
  end
end)

--------------------------------------------------------------------- panel

-- A watcher with no body needs somewhere to look. This is that: who is out
-- there, what each one is doing, how deep its queue is, and whether research is
-- moving. Rebuilt in place every refresh so it never goes stale.

local PANEL_NAME = "ai_crew_panel"
local CHAT_NAME = "ai_crew_chat"
local CHAT_TOGGLE = "ai_crew_chat_toggle"
local CHAT_CLOSE = "ai_crew_chat_close"

-- 에이전트 여섯이 동시에 말하면 게임 채팅은 흘러가 버리고, 사람이 쓴 줄은
-- 그 사이에 묻힌다. 그래서 따로 모아둔다. 링버퍼라 세션이 길어져도 메모리는
-- 평평하다.
local CREW_LOG = 200

local function remember_line(who, text)
  storage.crew_log = storage.crew_log or {}
  storage.crew_log[#storage.crew_log + 1] = {
    who = tostring(who or "AI"), text = tostring(text), tick = game.tick,
  }
  while #storage.crew_log > CREW_LOG do table.remove(storage.crew_log, 1) end
end

local function panel_rows(frame)
  if frame.goal then
    frame.goal.caption = storage.goal or "목표: 아직 정해지지 않음"
  end

  local grid = frame.grid
  grid.clear()

  for _, heading in ipairs({ "이름", "담당", "지금 하는 일", "대기", "위치" }) do
    local label = grid.add { type = "label", caption = heading }
    label.style.font = "default-bold"
  end

  for index, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a then
      local b = body(a)
      local color = COLORS[(((a.index or index) - 1) % #COLORS) + 1]

      local tag = grid.add { type = "label", caption = name }
      tag.style.font_color = color

      grid.add { type = "label", caption = a.focus or "-" }

      local doing = "유휴"
      if a.current then
        doing = a.current.type
        local elapsed = math.floor((game.tick - a.current.started_tick) / 60)
        if elapsed > 0 then doing = doing .. " (" .. elapsed .. "초)" end
      elseif not b then
        doing = "캐릭터 없음"
      end
      grid.add { type = "label", caption = doing }

      grid.add { type = "label", caption = tostring(#a.queue) }
      grid.add {
        type = "label",
        caption = b and string.format("%.0f, %.0f", b.position.x, b.position.y) or "-",
      }
    end
  end

  local force = game.forces["player"]
  local research = force.current_research
  frame.footer.caption = string.format(
    "연구: %s%s   |   저장: %s전   |   틱 %d",
    research and research.name or "없음",
    research and string.format(" (%d%%)", math.floor(force.research_progress * 100)) or "",
    storage.last_save_tick
      and (math.floor((game.tick - storage.last_save_tick) / 60) .. "초")
      or "아직 없음",
    game.tick)

  -- 요청 게시판. 누가 무엇을 기다리는지가 여기 없으면, 멈춰 서 있는
  -- 에이전트를 보고도 왜 멈췄는지 알 방법이 없다.
  if frame.board then
    local lines = storage.board or {}
    if #lines == 0 then
      frame.board.caption = "대기 중인 요청 없음"
    else
      frame.board.caption = "요청 " .. #lines .. "건\n  " .. table.concat(lines, "\n  ")
    end
  end
end

-- 에이전트 대화만 모아 보는 창. 크루 패널이 «누가 무엇을 하는가»라면
-- 이쪽은 «누가 무슨 말을 했는가»다. 둘을 한 칸에 욱여넣으면 둘 다 읽기
-- 힘들어진다.
local function chat_rows(frame)
  local list = frame.body
  if not list then return end
  list.clear()

  local log = storage.crew_log or {}
  local seat = {}
  for index, name in ipairs(storage.order or {}) do seat[name] = index end

  for _, line in ipairs(log) do
    local label = list.add {
      type = "label",
      caption = string.format("[%d:%02d] %s: %s",
        math.floor(line.tick / 3600), math.floor(line.tick / 60) % 60,
        line.who, line.text),
    }
    label.style.single_line = false
    label.style.maximal_width = 460
    local index = seat[line.who]
    if index then
      label.style.font_color = COLORS[((index - 1) % #COLORS) + 1]
    end
  end
  -- 새 줄은 아래에 쌓이므로 아래를 보여준다.
  pcall(function() list.scroll_to_bottom() end)
end

local function build_chat(player)
  if player.gui.screen[CHAT_NAME] then player.gui.screen[CHAT_NAME].destroy() end
  local frame = player.gui.screen.add {
    type = "frame", name = CHAT_NAME, direction = "vertical",
  }

  -- 제목줄 겸 손잡이. 화면 정중앙에 고정해두면 게임 화면을 가리므로,
  -- 옆으로 밀어두고 필요할 때 끌어다 쓸 수 있어야 한다.
  local bar = frame.add { type = "flow", name = "bar", direction = "horizontal" }
  bar.drag_target = frame
  -- 스타일과 스프라이트 이름은 틀리면 GUI 생성 자체가 죽는다. 실제로
  -- «default-frame-title» 이라는 폰트는 없어서 창이 안 떴다. 확실한 것만
  -- 쓰고, 없으면 조용히 기본값으로 둔다.
  local title = bar.add { type = "label", caption = "AI 대화" }
  pcall(function() title.style = "frame_title" end)
  local grip = bar.add { type = "empty-widget" }
  pcall(function() grip.style = "draggable_space_header" end)
  grip.style.height = 24
  grip.style.horizontally_stretchable = true
  grip.drag_target = frame
  bar.add { type = "button", name = CHAT_CLOSE, caption = "닫기" }

  local pane = frame.add { type = "scroll-pane", name = "body", direction = "vertical" }
  pane.style.maximal_height = 300
  pane.style.minimal_width = 460

  -- 오른쪽 위. 왼쪽은 크루 패널이 쓰고 있고, 가운데는 게임이다.
  local screen = player.display_resolution
  local scale = player.display_scale
  frame.location = { x = math.max(0, screen.width - 520 * scale), y = 60 * scale }

  chat_rows(frame)
  return frame
end

local function build_panel(player)
  if player.gui.left[PANEL_NAME] then player.gui.left[PANEL_NAME].destroy() end
  local frame = player.gui.left.add {
    type = "frame", name = PANEL_NAME, direction = "vertical", caption = "AI 크루",
  }
  frame.add { type = "label", name = "goal", caption = "" }
  frame.add { type = "table", name = "grid", column_count = 5 }
  frame.add { type = "label", name = "footer", caption = "" }
  local board = frame.add { type = "label", name = "board", caption = "" }
  board.style.single_line = false
  frame.add { type = "button", name = CHAT_TOGGLE, caption = "AI 대화 보기" }
  panel_rows(frame)
  return frame
end

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
  end
end)

script.on_nth_tick(MARKER_INTERVAL, function()
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a then pcall(refresh_marker, a) end
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
end)

--------------------------------------------------------------- observation

-- Aggregated, not enumerated. An LLM does not need 4,000 ore tiles; it needs
-- "iron ore: 812 tiles, 96k units, nearest at (34,-12)".
local function observe(name, opts)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  opts = opts or {}
  -- An observe runs entirely inside one tick, and a console command is
  -- replicated to every peer, so an unbounded scan freezes the humans too.
  local radius = math.min(opts.radius or 64, MAX_OBSERVE_RADIUS)
  local surface, origin = b.surface, b.position

  local resources = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = origin, radius = radius, type = "resource",
  }) do
    local r = resources[e.name]
    if not r then
      r = { tiles = 0, amount = 0, nearest = nil, nearest_dist = math.huge }
      resources[e.name] = r
    end
    r.tiles = r.tiles + 1
    r.amount = r.amount + e.amount
    local d = Tasks.dist(origin, e.position)
    if d < r.nearest_dist then
      r.nearest_dist = d
      r.nearest = { x = e.position.x, y = e.position.y }
    end
  end
  for _, r in pairs(resources) do
    r.nearest_dist = math.floor(r.nearest_dist * 10) / 10
  end

  -- Filter by force in the engine rather than walking every tree, rock and
  -- dropped item in the radius and asking each one what it is.
  local buildings = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = origin, radius = radius, force = b.force,
  }) do
    if e.type ~= "character" and e.type ~= "resource" then
      local entry = buildings[e.name]
      if not entry then
        entry = { count = 0, nearest = nil, nearest_dist = math.huge, spots = {} }
        buildings[e.name] = entry
      end
      entry.count = entry.count + 1
      local d = Tasks.dist(origin, e.position)
      if d < entry.nearest_dist then
        entry.nearest_dist = d
        entry.nearest = { x = e.position.x, y = e.position.y }
      end
      if #entry.spots < MAX_SPOTS then
        entry.spots[#entry.spots + 1] = {
          x = e.position.x, y = e.position.y,
          distance = math.floor(d * 10) / 10,
        }
      end
    end
  end
  for _, entry in pairs(buildings) do
    entry.nearest_dist = math.floor(entry.nearest_dist * 10) / 10
    -- 가까운 순으로. 그래야 «내 몫의 화로»를 거리순 자리로 고를 수 있다.
    table.sort(entry.spots, function(p, q) return p.distance < q.distance end)
  end

  local hostiles = #surface.find_entities_filtered {
    position = origin, radius = radius, force = "enemy",
  }

  -- Who else is nearby: the humans watching, and the other agents working.
  local humans, mates = {}, {}
  for _, p in pairs(game.connected_players) do
    humans[#humans + 1] = {
      name = p.name,
      spectating = p.character == nil,
      x = p.position.x, y = p.position.y,
      distance = math.floor(Tasks.dist(origin, p.position) * 10) / 10,
    }
  end
  for _, other in ipairs(storage.order) do
    local o = storage.agents[other]
    local ob = body(o)
    if ob and other ~= name then
      mates[#mates + 1] = {
        name = other, x = ob.position.x, y = ob.position.y,
        distance = math.floor(Tasks.dist(origin, ob.position) * 10) / 10,
        busy = o.current ~= nil,
      }
    end
  end

  return {
    tick = game.tick,
    agent = name,
    position = { x = origin.x, y = origin.y },
    radius = radius,
    resources = resources,
    buildings = buildings,
    hostiles = hostiles,
    humans = humans,
    agents = mates,
  }
end

local function inventory(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local inv = b.get_main_inventory()
  local out = {}
  if inv then
    -- 2.0 returns an array of {name, count, quality}; normalise to name -> count.
    for _, stack in pairs(inv.get_contents()) do
      out[stack.name] = (out[stack.name] or 0) + stack.count
    end
  end
  -- What could be hand-crafted right now, counting intermediates. Guessing this
  -- from the raw item list means re-deriving every recipe tree in the agent;
  -- the game already knows, and it knows about research too.
  local craftable = {}
  for _, recipe in ipairs(PLANNING_RECIPES) do
    if prototypes.recipe[recipe] then
      local ok, count = pcall(function() return b.get_craftable_count(recipe) end)
      craftable[recipe] = (ok and count) or 0
    end
  end

  return {
    agent = name, items = out, craftable = craftable,
    health = b.health, x = b.position.x, y = b.position.y,
  }
end

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

  local out = { steps = {}, mine = {}, locked = {}, blocked = {} }
  local ok, done = pcall(expand, b.force, pool, item, count or 1, out, 0)
  if not ok then return { error = "plan failed: " .. tostring(done) } end

  -- 제련은 화로가 있어야 한다. 없으면 «지금 할 수 있는 일»이 아니다.
  local furnace = b.surface.find_entities_filtered {
    position = b.position, radius = MAX_OBSERVE_RADIUS,
    name = "stone-furnace", force = b.force, limit = 1,
  }[1]

  return {
    item = item, count = count or 1, ready = done,
    steps = out.steps, mine = out.mine, locked = out.locked, blocked = out.blocked,
    furnace = furnace and { x = furnace.position.x, y = furnace.position.y } or nil,
  }
end

---------------------------------------------------------- 화로에 남은 것

-- 제련을 시켜놓고 못 돌아오는 일은 계속 생긴다 - 작업이 시간을 넘기거나,
-- 사람이 캐릭터를 넘겨받거나, 그냥 다른 급한 일이 끼어든다. 그때 판금은
-- 화로 안에 그대로 남고, 아무도 그걸 세지 않는다. 광석을 새로 캐는 것보다
-- 이미 녹은 걸 꺼내오는 편이 언제나 싸다.

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
      for _, stack in pairs(result.get_contents()) do
        out[#out + 1] = {
          name = stack.name, count = stack.count,
          x = e.position.x, y = e.position.y,
          distance = math.floor(Tasks.dist(b.position, e.position) * 10) / 10,
        }
      end
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  return { agent = name, stock = out }
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

-- 출구 칸이 쓸 만한가: 이미 우리 상자가 있거나, 상자를 놓을 수 있거나.
local function outlet_ok(surface, force, spot)
  local here = surface.find_entities_filtered { position = { spot.x, spot.y }, radius = 0.4 }
  for _, e in pairs(here) do
    if e.type == "container" then return true, "chest" end
    if e.type ~= "character" and e.type ~= "item-entity" then return false end
  end
  if surface.can_place_entity { name = "iron-chest", position = spot, force = force } then
    return true, "free"
  end
  return false
end

-- 광맥 위에서 «채굴기가 들어가고 출구도 비는» 자리와 방향을 찾는다.
local function drill_site(name, x, y, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local reach = math.min(radius or 12, 40)
  local ore = surface.find_entities_filtered {
    position = { x, y }, radius = reach, type = "resource", limit = 200,
  }

  local sites = {}
  for _, patch in pairs(ore) do
    local spot = patch.position
    for _, dir in pairs(DIRECTIONS) do
      if surface.can_place_entity {
        name = "burner-mining-drill", position = spot, direction = dir, force = force,
      } then
        local ok, how = outlet_ok(surface, force, drop_tile(spot, dir))
        if ok then
          sites[#sites + 1] = {
            x = spot.x, y = spot.y, direction = dir, outlet = how,
            resource = patch.name,
            distance = math.floor(Tasks.dist(b.position, spot) * 10) / 10,
          }
          break
        end
      end
    end
    if #sites >= 8 then break end
  end

  table.sort(sites, function(p, q) return p.distance < q.distance end)
  return { agent = name, sites = sites }
end

-- 이미 놓인 채굴기를 출구가 비는 방향으로 돌린다.
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
    local surface = game.surfaces[1]
    local force = game.forces["player"]
    local tiles = surface.find_tiles_filtered {
      position = { x, y }, radius = math.min(radius or 120, 200),
      name = { "water", "deepwater" }, limit = 400,
    }
    if #tiles == 0 then return { sites = {}, water_found = false } end

    local sites, seen = {}, {}
    local directions = { defines.direction.north, defines.direction.east,
                         defines.direction.south, defines.direction.west }
    for _, tile in pairs(tiles) do
      for dx = -1, 1 do
        for dy = -1, 1 do
          local spot = { x = tile.position.x + dx + 0.5, y = tile.position.y + dy + 0.5 }
          local key = spot.x .. ":" .. spot.y
          if not seen[key] then
            seen[key] = true
            for _, direction in ipairs(directions) do
              if surface.can_place_entity {
                name = "offshore-pump", position = spot, direction = direction,
                force = force, build_check_type = defines.build_check_type.manual,
              } then
                sites[#sites + 1] = { x = spot.x, y = spot.y, direction = direction }
                break
              end
            end
          end
          if #sites >= (wanted or 3) then
            return { sites = sites, water_found = true }
          end
        end
      end
    end
    return { sites = sites, water_found = true, water_tiles = #tiles }
  end,

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

  -- 지금 멈춰 서 있는 기계들과 «왜».
  broken = broken,

  -- 화로 안에 다 녹은 채 남아 있는 것들.
  furnace_stock = furnace_stock,

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

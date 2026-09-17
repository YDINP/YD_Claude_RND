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
local CHAT_FOLLOW = "ai_crew_chat_follow"

-- 에이전트 여섯이 동시에 말하면 게임 채팅은 흘러가 버리고, 사람이 쓴 줄은
-- 그 사이에 묻힌다. 그래서 따로 모아둔다. 링버퍼라 세션이 길어져도 메모리는
-- 평평하다.
local CREW_LOG = 200

local function remember_line(who, text)
  storage.crew_log = storage.crew_log or {}
  -- 줄마다 번호를 붙인다. 링버퍼라 앞이 잘려나가므로 «목록의 몇 번째»는
  -- 다음 새로고침에 다른 줄을 가리킨다. 번호는 늘기만 하니 안 흔들린다.
  storage.crew_seq = (storage.crew_seq or 0) + 1
  storage.crew_log[#storage.crew_log + 1] = {
    seq = storage.crew_seq,
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

  -- 예전에는 새로고침마다 목록을 통째로 비우고 다시 그렸다. 그러면 사람이
  -- 위로 올려 읽던 자리가 매번 사라지고 맨 아래로 끌려 내려간다. 지나간
  -- 말을 다시 읽을 수가 없었다.
  --
  -- 그래서 «새로 생긴 줄만» 아래에 붙인다. 손대지 않은 줄은 그대로 있으니
  -- 스크롤 위치도 그대로다. 맨 아래로 따라갈지는 사람이 정한다.
  local seen = tonumber(list.tags and list.tags.seen) or 0
  local log = storage.crew_log or {}
  local seat = {}
  for index, name in ipairs(storage.order or {}) do seat[name] = index end

  local added = 0
  local newest = seen
  for _, line in ipairs(log) do
    local seq = line.seq or 0
    if seq > seen then
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
      added = added + 1
      if seq > newest then newest = seq end
    end
  end

  if added == 0 then return end
  list.tags = { seen = newest }

  -- 창은 링버퍼보다 길어질 이유가 없다. 넘치면 위에서 덜어낸다.
  local kids = list.children
  for i = 1, #kids - CREW_LOG do
    if kids[i].valid then kids[i].destroy() end
  end

  -- 따라가기가 켜져 있을 때만 아래로 민다. 꺼두면 읽던 자리에 머문다.
  local follow = frame.bar and frame.bar[CHAT_FOLLOW]
  if follow and follow.valid and not follow.state then return end
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
  -- 체크박스는 상태를 스스로 들고 있어서, 새로고침 때 읽기만 하면 된다.
  -- 이벤트를 하나 더 등록할 이유가 없다.
  local follow = bar.add {
    type = "checkbox", name = CHAT_FOLLOW, state = true, caption = "따라가기",
  }
  follow.tooltip = "끄면 스크롤이 그 자리에 머뭅니다. 지나간 말을 읽을 때 끄세요."
  bar.add { type = "button", name = CHAT_CLOSE, caption = "닫기" }

  local pane = frame.add { type = "scroll-pane", name = "body", direction = "vertical" }
  pane.tags = { seen = 0 }
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
  -- 사람이 쓴 줄도 대화창에 남긴다. 대답만 모여 있으면 무엇에 대한
  -- 대답인지 알 수가 없다. 한쪽 말만 적힌 대화는 대화가 아니다.
  pcall(remember_line, player.name, event.message)
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
  local furnace = b.surface.find_entities_filtered {
    position = b.position, radius = MAX_OBSERVE_RADIUS,
    name = "stone-furnace", force = b.force, limit = 1,
  }[1]

  return {
    item = item, count = count or 1, ready = done,
    steps = out.steps, mine = out.mine, locked = out.locked, blocked = out.blocked,
    -- 창고에서 꺼내오면 되는 것들. 캐기 전에 이것부터.
    fetch = out.fetch,
    furnace = furnace and { x = furnace.position.x, y = furnace.position.y } or nil,
  }
end

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

-- 펌프를 세울 수 있는 물가. 「해안의 한 칸」을 주는 API 가 없어서,
-- 물 타일 둘레의 칸마다 네 방향을 시도하고 게임이 받아주는 것만 남긴다.
local function water_sites_near(surface, force, x, y, radius, wanted)
  local tiles = surface.find_tiles_filtered {
    position = { x, y }, radius = math.min(radius or 120, 200),
    name = { "water", "deepwater" }, limit = 400,
  }
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
        if #sites >= (wanted or 3) then return sites end
      end
    end
  end
  return sites
end

---------------------------------------------------------------- 발전소 자리

-- 눈 감고 좌표를 재다가 이렇게 됐다: 펌프 둘, 보일러 하나, 기관 둘이
-- 흩어져 놓이고 파이프는 한 개도 없어서 기관이 no_input_fluid 로 서 있었다.
-- «펌프에서 축을 따라 2~7칸» 같은 어림은 맞을 때만 맞는다.
--
-- 게임은 정확히 안다. fluidbox 가 «내 관이 어느 칸으로 나가는지»를 들고
-- 있으므로, 임시로 세워 물어보고 지운 다음, 확인된 좌표만 에이전트에게
-- 넘긴다. 실제 설치는 에이전트가 자기 인벤토리로 한다 - 여기서 다 지어
-- 버리면 그건 플레이가 아니라 치트다.

local function outward(pump)
  -- 펌프의 물이 나가는 칸. 없으면 nil.
  local ok, connections = pcall(function()
    return pump.fluidbox.get_pipe_connections(1)
  end)
  if not ok or not connections then return nil end
  for _, conn in pairs(connections) do
    if conn.target_position then return conn.target_position end
  end
  return nil
end

local function unit_step(from, to)
  local dx, dy = to.x - from.x, to.y - from.y
  if math.abs(dx) >= math.abs(dy) then
    return { x = (dx >= 0) and 1 or -1, y = 0 }
  end
  return { x = 0, y = (dy >= 0) and 1 or -1 }
end

local function step_direction(step)
  if step.y < 0 then return defines.direction.north end
  if step.y > 0 then return defines.direction.south end
  if step.x > 0 then return defines.direction.east end
  return defines.direction.west
end

-- 물가 한 곳에 펌프-보일러-기관이 통째로 들어가는지 확인하고, 들어가면
-- 정확한 좌표를 돌려준다. 하나라도 안 들어가면 통째로 버린다 - 반쯤 지어진
-- 발전소는 안 지은 것보다 나쁘다.
--
-- 좌표는 실측에서 나왔다. 게임에 임시로 세워 fluidbox 의 연결구를 읽어보니:
--   펌프  : 자기 칸에서 바라보는 반대쪽 한 칸으로 물을 내보낸다.
--   보일러: 물 연결구가 중심에서 «옆구리» 양쪽 한 칸씩(축은 바라보는 방향에
--           수직), 증기 출구는 «바라보는 쪽» 두 칸 앞.
--   기관  : 증기 연결구가 중심에서 긴 축 양끝 두 칸.
-- 그래서 보일러는 펌프 출구 칸에서 한 칸 더, 기관은 보일러에서 네 칸,
-- 다음 기관은 그 앞에서 다섯 칸(기관이 5칸 길이)이다.

-- 연결구가 맞물리는지는 짐작하지 않는다. 엔티티마다 «내 관이 있는 칸»과
-- «그 관이 닿는 칸»을 게임이 들고 있으므로, 세워보고 물어본 다음 어긋나면
-- 지우고 옆 칸을 시도한다.
--
-- 이 확인이 필요한 이유: 2x3 짜리 보일러는 중심 좌표가 축마다 .0 이거나
-- .5 여야 해서, 내가 계산한 자리를 게임이 반 칸 밀어 놓는다. 그런데 나는
-- 요청한 좌표를 계획에 적고 있었다. 그래서 펌프 여섯과 보일러 넷이 서 있는
-- 채로 0와트였다.

local function ports(entity)
  local out = {}
  for box = 1, 6 do
    local ok, conns = pcall(function()
      return entity.fluidbox.get_pipe_connections(box)
    end)
    if not ok or not conns then break end
    for _, c in pairs(conns) do
      if c.position and c.target_position then
        out[#out + 1] = {
          at = { x = c.position.x, y = c.position.y },
          to = { x = c.target_position.x, y = c.target_position.y },
          flow = c.flow_direction,
        }
      end
    end
  end
  return out
end

local function same_tile(a, b)
  return math.abs(a.x - b.x) < 0.1 and math.abs(a.y - b.y) < 0.1
end

-- 두 엔티티의 연결구가 서로를 향하고 있는가.
local function meets(one, two)
  for _, p in pairs(one) do
    for _, q in pairs(two) do
      if same_tile(p.to, q.at) and same_tile(q.to, p.at) then return true end
    end
  end
  return false
end

-- 증기가 나가는 연결구가 닿는 칸. 기관은 그 칸에 관을 대야 한다.
local function steam_target(boiler_ports)
  for _, p in pairs(boiler_ports) do
    if p.flow == "output" then return p.to end
  end
  return nil
end

local DIRS = { defines.direction.north, defines.direction.east,
               defines.direction.south, defines.direction.west }

-- 어떤 칸 둘레에서 이 엔티티가 들어가고 연결구도 맞물리는 자리를 찾는다.
local function fit_against(surface, force, name, near, anchor_ports, spread)
  spread = spread or 3
  for dx = -spread, spread do
    for dy = -spread, spread do
      for _, dir in pairs(DIRS) do
        local at = { x = near.x + dx, y = near.y + dy }
        if surface.can_place_entity {
          name = name, position = at, direction = dir, force = force,
        } then
          local made = surface.create_entity {
            name = name, position = at, direction = dir, force = force,
            raise_built = false,
          }
          if made then
            local mine = ports(made)
            if meets(anchor_ports, mine) then
              return made, mine
            end
            made.destroy()
          end
        end
      end
    end
  end
  return nil
end

local function try_power_site(surface, force, site, engines)
  local temporary = {}
  local function keep(e) temporary[#temporary + 1] = e return e end
  local function sweep()
    for i = #temporary, 1, -1 do
      if temporary[i].valid then temporary[i].destroy() end
    end
    temporary = {}
  end

  local pump = surface.create_entity {
    name = "offshore-pump", position = { site.x, site.y },
    direction = site.direction, force = force, raise_built = false,
  }
  if not pump then return nil end
  keep(pump)

  local pump_ports = ports(pump)
  local water = nil
  for _, p in pairs(pump_ports) do water = p.to break end
  if not water then sweep() return nil end

  local boiler, boiler_ports = fit_against(surface, force, "boiler",
                                           water, pump_ports, 2)
  if not boiler then sweep() return nil end
  keep(boiler)

  local steam = steam_target(boiler_ports)
  if not steam then sweep() return nil end

  local plan = {
    pump = { x = pump.position.x, y = pump.position.y, direction = pump.direction },
    boiler = { x = boiler.position.x, y = boiler.position.y,
               direction = boiler.direction },
    pipes = {}, engines = {},
  }

  -- 기관은 증기가 닿는 칸에 관을 대고, 그 다음 기관은 앞 기관의 반대편
  -- 관에 잇는다. 기관끼리도 증기를 넘긴다.
  local anchor_ports, anchor_tile = boiler_ports, steam
  for _ = 1, (engines or 2) do
    local engine, engine_ports = fit_against(surface, force, "steam-engine",
                                             anchor_tile, anchor_ports, 3)
    if not engine then break end
    keep(engine)
    plan.engines[#plan.engines + 1] = {
      x = engine.position.x, y = engine.position.y, direction = engine.direction,
    }
    -- 다음 기관을 위해, 방금 세운 기관의 «반대쪽» 관이 닿는 칸으로 옮긴다.
    local next_tile = nil
    for _, p in pairs(engine_ports) do
      if not same_tile(p.at, anchor_tile) then next_tile = p.to end
    end
    if not next_tile then break end
    anchor_ports, anchor_tile = engine_ports, next_tile
  end

  sweep()
  if #plan.engines == 0 then return nil end
  return plan
end

-- 공해는 바람처럼 퍼져서 둥지에 닿고, 닿으면 그쪽이 찾아온다. 그때 가서
-- 놀라지 않으려면 «얼마나 가까운지»와 «무엇이 잠겨 있는지»를 보고 있어야
-- 한다. 아직 둥지가 안 보인다는 것과 안전하다는 것은 다르다.
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

-- 전봇대가 기계에 «닿는» 자리를 찾는다.
--
-- 실측(2026-09-18): 기관에서 일곱 칸 떨어진 곳에 전봇대를 넷 세워두고도
-- 전기가 0W 였다. 전선이 7.5칸까지 늘어나는 것은 «전봇대끼리»의 이야기고,
-- 기계가 전기를 받으려면 기계가 전봇대의 «공급 범위» 안에 들어와야 한다.
-- 작은 전봇대의 공급 범위는 5x5, 그러니까 중심에서 두 칸 반이다. 기관은
-- 3x5 라 중심에서 두 칸 반이 더 있다 - 한 걸음이면 이미 늦는다.
--
-- 계산으로 맞히는 대신 세워보고 물어본다. 붙었는지 아닌지는 게임이 안다.
local function wire_spot(name, x, y, pole)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  pole = pole or "small-electric-pole"

  local surface, force = b.surface, b.force
  local machine = surface.find_entities_filtered {
    position = { x, y }, radius = 3, force = force, limit = 8,
  }
  local target = nil
  for _, e in pairs(machine) do
    if e.type ~= "character" and e.type ~= "item-entity"
        and e.type ~= "electric-pole" then
      target = e
      break
    end
  end
  if not target then
    return { error = string.format("nothing at %.0f,%.0f", x, y) }
  end

  -- 이미 붙어 있으면 세울 이유가 없다.
  if target.electric_network_id ~= nil then
    return { already = true, x = target.position.x, y = target.position.y }
  end

  -- 가까운 자리부터 본다. 첫 번째로 붙는 곳이 가장 좋은 곳이고, 그러면
  -- 임시 전봇대를 백 번 세웠다 지우지 않아도 된다.
  local order = {}
  local REACH = 6
  for dx = -REACH, REACH do
    for dy = -REACH, REACH do
      order[#order + 1] = { dx = dx, dy = dy, d = dx * dx + dy * dy }
    end
  end
  table.sort(order, function(p, q) return p.d < q.d end)

  local best, best_d = nil, nil
  for _, off in ipairs(order) do
    local at = { x = target.position.x + off.dx, y = target.position.y + off.dy }
    if surface.can_place_entity { name = pole, position = at, force = force } then
      local probe = surface.create_entity {
        name = pole, position = at, force = force, raise_built = false,
      }
      if probe then
        local live = target.electric_network_id ~= nil
        probe.destroy()
        if live then
          best, best_d = at, math.sqrt(off.d)
          break
        end
      end
    end
  end

  if not best then
    return { error = "no spot reaches " .. target.name }
  end
  return { x = best.x, y = best.y, machine = target.name,
           distance = math.floor(best_d * 10) / 10 }
end

-- 발전소가 어디서 끊겼는지 조목조목 돌려준다.
--
-- 실측(2026-09-18, 259분째): 보일러 5 + 기관 7 + 펌프 7 을 지어놓고 0W 였다.
-- 뜯어보니 고칠 것은 네 가지뿐이었다.
--   기관 3대: 증기는 가득한데 전봇대가 없다        -> 전봇대 하나씩
--   기관 3대: 보일러와 «한 칸» 떨어져 있다         -> 파이프 하나씩
--   보일러 2대: 연료 없음                          -> 석탄
--   보일러 1대: 물 없음                            -> 펌프까지 파이프
--
-- 파이프 자리를 찾는 방법이 이 함수의 핵심이다. 안 이어진 연결구 둘이
-- «같은 칸»을 바라보고 있으면, 그 칸에 파이프 하나를 놓는 것으로 둘이
-- 이어진다. 기하를 다시 계산할 필요가 없다 - 게임이 이미 서로를 가리키고
-- 있다고 말해주고 있다.
local function power_faults(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local out = { poles = {}, pipes = {}, fuel = {}, water = {}, bridges = {} }
  local open = {}   -- 안 이어진 연결구들. 키는 바라보는 칸.

  for _, e in pairs(surface.find_entities_filtered {
    force = force, name = { "boiler", "steam-engine", "offshore-pump" },
  }) do
    if e.status == defines.entity_status.not_plugged_in_electric_network then
      out.poles[#out.poles + 1] = {
        x = e.position.x, y = e.position.y, name = e.name,
        distance = math.floor(Tasks.dist(b.position, e.position)),
      }
    end
    if e.name == "boiler" then
      if e.status == defines.entity_status.no_fuel then
        out.fuel[#out.fuel + 1] = { x = e.position.x, y = e.position.y }
      elseif e.status == defines.entity_status.no_input_fluid then
        out.water[#out.water + 1] = { x = e.position.x, y = e.position.y }
      end
    end

    for box = 1, 4 do
      local ok, conns = pcall(function()
        return e.fluidbox.get_pipe_connections(box)
      end)
      if not ok or not conns then break end
      for _, c in pairs(conns) do
        if c.target == nil and c.target_position then
          local key = string.format("%.1f,%.1f", c.target_position.x,
                                    c.target_position.y)
          open[key] = open[key] or { x = c.target_position.x,
                                     y = c.target_position.y, who = {} }
          open[key].who[#open[key].who + 1] = e.name
        end
      end
    end
  end

  -- 전기망이 갈라져 있는가.
  --
  -- 실측(275분째): 기관 셋이 «working» 인데 전력은 0W 였다. 전기망이 넷으로
  -- 갈라져 있었다 - net16 에 기관 둘(1.8MW, 소비자 0), net8 에 기관 하나
  -- (0.9MW, 소비자 0), net1 과 net2 에는 랩만 있고 발전기가 없었다. 부하가
  -- 없는 기관은 0W 를 낸다. 만들지 않는 게 아니라 쓸 사람이 그 망에 없다.
  --
  -- net8 의 전봇대와 net1 의 전봇대는 10칸 떨어져 있었다. 전선은 7.5칸까지
  -- 늘어나므로 2.5칸이 모자랐고, 그래서 사이에 전봇대 하나면 이어진다.
  -- 파이프와 같은 모양의 문제다 - 닿을 뻔한 것을 닿게 만드는 일.
  local WIRE = 7.5
  local nets = {}
  for _, pole in pairs(surface.find_entities_filtered {
    force = force, type = "electric-pole",
  }) do
    local id = pole.electric_network_id
    if id then
      nets[id] = nets[id] or { poles = {}, supply = false, demand = false }
      nets[id].poles[#nets[id].poles + 1] = pole
    end
  end
  for _, e in pairs(surface.find_entities_filtered { force = force }) do
    local id = e.electric_network_id
    if id and nets[id] then
      if e.type == "generator" or e.type == "solar-panel"
          or e.type == "electric-energy-interface" then
        nets[id].supply = true
      elseif e.type ~= "electric-pole" then
        nets[id].demand = true
      end
    end
  end

  -- 전기를 만드는 망과 쓰는 망을 짝지어, 가장 가까운 전봇대 둘 사이에
  -- 한 대가 들어갈 자리가 있는지 본다.
  for from_id, from in pairs(nets) do
    if from.supply and not from.demand then
      for to_id, to in pairs(nets) do
        if to_id ~= from_id and to.demand and not to.supply then
          local best, best_d = nil, math.huge
          for _, a in pairs(from.poles) do
            for _, b in pairs(to.poles) do
              local d = Tasks.dist(a.position, b.position)
              if d < best_d then best, best_d = { a, b }, d end
            end
          end
          if best and best_d <= WIRE * 2 then
            local a, b = best[1].position, best[2].position
            local spot = nil
            for step = -2, 2 do
              for side = -2, 2 do
                local at = { x = math.floor((a.x + b.x) / 2) + step + 0.5,
                             y = math.floor((a.y + b.y) / 2) + side + 0.5 }
                if Tasks.dist(at, a) <= WIRE and Tasks.dist(at, b) <= WIRE
                    and surface.can_place_entity {
                      name = "small-electric-pole", position = at, force = force,
                    } then
                  spot = at
                  break
                end
              end
              if spot then break end
            end
            if spot then
              out.bridges[#out.bridges + 1] = {
                x = spot.x, y = spot.y,
                gap = math.floor(best_d * 10) / 10,
                distance = math.floor(Tasks.dist(b, spot)),
              }
            end
          end
        end
      end
    end
  end

  -- 둘 이상이 같은 칸을 바라보면 그 칸이 파이프 자리다.
  for _, spot in pairs(open) do
    if #spot.who >= 2 and surface.can_place_entity {
      name = "pipe", position = { spot.x, spot.y }, force = force,
    } then
      out.pipes[#out.pipes + 1] = {
        x = spot.x, y = spot.y,
        joins = table.concat(spot.who, "+"),
        distance = math.floor(Tasks.dist(b.position, spot)),
      }
    end
  end

  local function nearest(list)
    table.sort(list, function(p, q)
      return (p.distance or 0) < (q.distance or 0)
    end)
  end
  nearest(out.poles)
  nearest(out.pipes)
  nearest(out.bridges)
  return out
end

local function power_status(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local made, engines, running = 0, 0, 0
  for _, e in pairs(b.surface.find_entities_filtered {
    type = "generator", force = b.force,
  }) do
    engines = engines + 1
    local output = e.energy_generated_last_tick or 0
    made = made + output
    if output > 0 then running = running + 1 end
  end

  local labs, working_labs = 0, 0
  for _, lab in pairs(b.surface.find_entities_filtered {
    name = "lab", force = b.force,
  }) do
    labs = labs + 1
    if lab.status == defines.entity_status.working then
      working_labs = working_labs + 1
    end
  end

  -- 배관이 다 맞았는데 전봇대가 없어서 노는 기관. 이걸 못 보고 있어서
  -- 무리가 발전소를 계속 새로 지었다 - 완성된 발전소가 두 벌 서 있는데도.
  local unplugged = nil
  for _, e in pairs(b.surface.find_entities_filtered {
    type = "generator", force = b.force,
  }) do
    if e.status == defines.entity_status.not_plugged_in_electric_network then
      unplugged = { x = e.position.x, y = e.position.y }
      break
    end
  end

  return {
    agent = name,
    generators = engines, running = running,
    watts = math.floor(made * 60),
    labs = labs, working_labs = working_labs,
    powered = running > 0,
    unplugged = unplugged,
  }
end

local function power_plan(name, x, y, radius, engines)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local sites = water_sites_near(surface, force, x, y, radius or 150, 60)
  if #sites == 0 then return { error = "no water within " .. tostring(radius) .. " tiles" } end

  -- 지난 시도가 남긴 외톨이 펌프들. 보일러도 기관도 없이 해안만 차지하고
  -- 있어서 다음 시도의 자리를 막는다. 치우면 그 자리가 다시 후보가 된다.
  for _, pump in pairs(surface.find_entities_filtered {
    position = { x, y }, radius = math.min(radius or 150, 200),
    name = "offshore-pump", force = force,
  }) do
    local near = surface.find_entities_filtered {
      position = pump.position, radius = 8, name = { "boiler", "steam-engine" },
      force = force, limit = 1,
    }[1]
    if not near then pump.destroy() end
  end

  for _, site in pairs(sites) do
    local ok, plan = pcall(try_power_site, surface, force, site, engines or 2)
    if ok and plan then
      plan.distance = math.floor(Tasks.dist(b.position, { x = plan.pump.x, y = plan.pump.y }))
      return plan
    end
  end
  return { error = "no shore with room for a whole power block" }
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

local function drill_site(name, x, y, radius, receiver)
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
    -- 길 위에는 짓지 않는다.
    if not blocks_lane(spot, 1) then
    for _, dir in pairs(DIRECTIONS) do
      if surface.can_place_entity {
        name = "burner-mining-drill", position = spot, direction = dir, force = force,
      } and not blocks_lane(drop_tile(spot, dir), 1) then
        local ok, how = outlet_ok(surface, force, drop_tile(spot, dir), receiver)
        if ok then
          local drop = drop_tile(spot, dir)
          sites[#sites + 1] = {
            x = spot.x, y = spot.y, direction = dir, outlet = how,
            drop_x = drop.x, drop_y = drop.y,
            resource = patch.name,
            distance = math.floor(Tasks.dist(b.position, spot) * 10) / 10,
          }
          break
        end
      end
    end
    end
    if #sites >= 40 then break end
  end

  -- 가까운 곳이 아니라 오래 갈 곳부터. 걸어가는 데 드는 십 초와 채굴기가
  -- 사는 이십 분을 맞바꾸는 것은 언제나 남는 장사다. 다만 수명이 비슷하면
  -- 가까운 쪽을 고른다.
  for _, site in pairs(sites) do
    site.richness = richness(surface, { x = site.x, y = site.y })
    site.seconds = math.floor(site.richness / 0.25)
  end
  table.sort(sites, function(p, q)
    if math.abs(p.richness - q.richness) > 200 then
      return p.richness > q.richness
    end
    return p.distance < q.distance
  end)

  local out = {}
  for i = 1, math.min(#sites, 8) do out[i] = sites[i] end
  return { agent = name, sites = out }
end

-- 석탄 광맥 위에서 서로 마주보는 채굴기 두 대. 각자 캔 석탄이 상대의
-- 연료함으로 직행해서 둘이 서로를 영원히 먹인다. 연료함 스택이 50개씩이라
-- 실질 버퍼가 100개고, 가득 차면 잠시 멈췄다 다시 돈다.
--
-- 이게 없으면 사람이 드릴 열여덟 대에 석탄을 손으로 날라야 하고, 실제로
-- 여덟 중 넷이 그 일만 하고 있었다.
local function coal_pair_site(name, x, y, radius)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local reach = math.min(radius or 16, 40)
  local coal = surface.find_entities_filtered {
    position = { x, y }, radius = reach, name = "coal", limit = 200,
  }

  -- 마주보는 축 두 가지. 두 대가 2타일 간격으로 서로를 본다.
  local axes = {
    { step = { x = 2, y = 0 },
      first = defines.direction.east, second = defines.direction.west },
    { step = { x = 0, y = 2 },
      first = defines.direction.south, second = defines.direction.north },
  }

  for _, patch in pairs(coal) do
    local one = patch.position
    for _, axis in pairs(axes) do
      local two = { x = one.x + axis.step.x, y = one.y + axis.step.y }
      if surface.can_place_entity {
            name = "burner-mining-drill", position = one,
            direction = axis.first, force = force }
          and surface.can_place_entity {
            name = "burner-mining-drill", position = two,
            direction = axis.second, force = force } then
        return {
          agent = name,
          first = { x = one.x, y = one.y, direction = axis.first },
          second = { x = two.x, y = two.y, direction = axis.second },
          distance = math.floor(Tasks.dist(b.position, one)),
        }
      end
    end
  end
  return { error = "no room for a facing pair on coal" }
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

-- 공장이 실제로 «돌고 있는가». 세운 수가 아니라 도는 수를 센다.
--
-- 실측(259분째): 버너 채굴기 194대 중 도는 것은 24대(12%)였다. 101대는
-- 상자가 꽉 차서, 57대는 연료가 없어서, 12대는 밑의 광석이 다 떨어져서
-- 서 있었다. 그런데 무리는 계속 채굴기를 더 세우고 있었다 - 「세운 수」만
-- 셌기 때문이다. 스물넷이 도는데 백칠십이 서 있으면, 문제는 부족이 아니라
-- 막힘이다. 한 대 더 세우는 것은 낭비를 한 대 더 세우는 것이다.
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
  power_faults = power_faults,

  -- 세운 수가 아니라 도는 수.
  health = health,

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

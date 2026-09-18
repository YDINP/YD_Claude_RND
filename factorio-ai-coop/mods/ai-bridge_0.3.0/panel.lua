-- 화면에 보이는 것 - 머리 위 이름표, 지도 표시, 패널, 대화창.

local Tasks = require("tasks")
local Core = require("core")
local COLORS           = Core.COLORS
local TAG_MOVE_EPSILON = Core.TAG_MOVE_EPSILON
local body             = Core.body

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

return {
  CHAT_CLOSE = CHAT_CLOSE,
  CHAT_FOLLOW = CHAT_FOLLOW,
  CHAT_NAME = CHAT_NAME,
  CHAT_TOGGLE = CHAT_TOGGLE,
  CREW_LOG = CREW_LOG,
  PANEL_NAME = PANEL_NAME,
  build_chat = build_chat,
  build_panel = build_panel,
  chat_rows = chat_rows,
  drop_marker = drop_marker,
  marker_text = marker_text,
  panel_rows = panel_rows,
  refresh_marker = refresh_marker,
  remember_line = remember_line,
}

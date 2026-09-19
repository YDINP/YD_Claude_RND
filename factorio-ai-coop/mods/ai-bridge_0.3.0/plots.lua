-- 구획 - 구역 안의 «자리표».
--
-- 구역이 「어디서 하는가」라면 구획은 「그 안 어디에 놓는가」다.
--
-- 이 파일이 있는 이유가 둘이다.
--
-- 1) 치수가 두 군데 있었다. layout.py 에 FURNACE_PITCH 가 있고 belts.lua 에도
--    「layout.py 와 같은 값이어야 한다」는 주석과 함께 같은 숫자가 있었다.
--    같아야 하는 숫자가 두 군데 있으면 언젠가 달라진다. 여기가 한 군데다.
--
-- 2) 자리를 «세어서» 정하고 있었다. "이미 선 화로가 열두 대니 다음은 열세
--    번째 자리" - 그런데 그 열두 대 중 하나가 자리표에서 벗어나 있으면
--    번호가 밀리고, 이미 찬 자리에 또 놓으려 든다. 세지 말고 물어야 한다:
--    «비어 있는 첫 자리가 어디인가».
--
-- 자리표의 모양은 고수들 사진에서 잰 것이다(docs/reference/smelting-column.jpg).

local Core = require("core")
local agent = Core.agent
local body = Core.body

-- 제련 블록. 화로 두 줄이 마주보고 가운데로 판금을 뽑는다.
--
--   pitch 3   돌화로는 2x2. 3으로 두면 나중에 3x3 전기로로 그 자리에서 바꾼다.
--   row 12    한 줄에 열두 대, 두 줄이 한 블록.
--   aisle 5   마주보는 두 줄 사이 - 인서터, 벨트, 인서터가 들어간다.
--   gap 9     블록과 블록 사이 통로.
local FURNACE = { pitch = 3, row = 12, aisle = 5, gap = 9 }

-- 조립 구역. 조립기도 랩도 3x3 이라 4칸 간격이면 한 칸이 남는다.
local CRAFT = { pitch = 4, row = 6, aisle = 5 }

local function furnace_seat(origin, nth)
  local block = math.floor(nth / (FURNACE.row * 2))
  local within = nth % (FURNACE.row * 2)
  local row = math.floor(within / FURNACE.row)
  local col = within % FURNACE.row
  return { x = origin.x + FURNACE.pitch * col,
           y = origin.y + row * FURNACE.aisle
               + block * (FURNACE.aisle + FURNACE.gap) }
end

-- 채굴밭. 벨트 한 줄을 사이에 두고 채굴기 두 줄이 마주본다.
--
-- 사용자: "채굴기를 만들어서 매립지들에 채굴기를 심시티하는것부터 해보자"
--
-- 지금까지 채굴기에는 «자리표가 없었다». 화로에는 있는데 채굴기에는 없어서,
-- 한 대씩 「근처에서 제일 두꺼운 칸」을 탐욕스럽게 골랐다. 그러면 네 대가
-- 네 방향을 보고 서고, 나중에 줄을 깔 자리가 안 남는다. 실측으로 채굴기
-- 넷이 상자 넷에 따로 떨구고 있었다.
--
-- 순서가 거꾸로였다. 벨트 줄은 채굴기를 따라가는 것이 아니라 «채굴기가
-- 벨트 줄을 따라야» 한다. 사람이 까는 밭이 그렇다 - 줄을 먼저 긋고 그
-- 옆에 붙인다.
--
--   lane      줄 간격 5. 채굴기 2 + 벨트 1 + 채굴기 2.
--   pitch 2   버너 채굴기는 2x2. 줄을 따라 두 칸씩.
--   row 8     한 줄에 여덟 쌍(열여섯 대)이면 노란 벨트가 찬다.
--
-- 버너 채굴기 한 대가 초당 0.25개를 캔다. 노란 벨트는 초당 15개이므로
-- 예순 대가 한 줄을 채우지만, 한 밭에 그만큼 있을 일이 드물다.
local MINE = { lane = 5, pitch = 2, row = 8 }

-- 자리 번호 -> 줄 위의 어디에, 어느 쪽에서, 어디를 보고.
--
-- 짝수는 줄 위쪽(아래를 본다), 홀수는 줄 아래쪽(위를 본다). 마주보게
-- 두면 둘 다 가운데 벨트에 떨군다 - 그것이 이 배치의 전부다.
local function mine_seat(origin, nth, wide)
  local pair = math.floor(nth / 2)
  local side = nth % 2
  local band = math.floor(pair / MINE.row)
  local step = (pair % MINE.row) * MINE.pitch
  local off = origin.lane + band * MINE.lane
  if wide then
    -- 줄이 가로. 채굴기는 줄의 위/아래에 선다.
    return { x = origin.x + step,
             y = (side == 0) and (off - 2) or (off + 1),
             direction = (side == 0) and "south" or "north" }
  end
  -- 줄이 세로. 채굴기는 줄의 왼/오른쪽에 선다.
  return { x = (side == 0) and (off - 2) or (off + 1),
           y = origin.y + step,
           direction = (side == 0) and "east" or "west" }
end

local function craft_seat(origin, nth)
  local band = math.floor(nth / CRAFT.row)
  local within = nth % CRAFT.row
  return { x = origin.x + CRAFT.pitch * within,
           y = origin.y + band * CRAFT.aisle }
end

local PLAN = {
  smelt = { seat = furnace_seat, what = "stone-furnace", count = 48 },
  craft = { seat = craft_seat, what = "assembling-machine-1", count = 18 },
  -- 채굴밭은 원점이 «줄»이라 seat 이 인자를 하나 더 받는다. 자리표를
  -- 훑는 쪽(plot_seats)은 안 쓰고, 밭 전용 함수가 따로 쓴다 - 밭은
  -- 구역과 달리 광석 위에 있어야 하는지를 같이 봐야 하기 때문이다.
  mine = { seat = mine_seat, what = "burner-mining-drill",
           count = MINE.row * 2 * 3 },
}

-- 그 자리에 무엇이 서 있는가.
--
--   free     비어 있고 놓을 수 있다
--   ours     우리 것이 이미 제대로 서 있다
--   taken    남의 것이거나 우리 것이라도 종류가 다르다
--   blocked  나무·바위·물 - 치우면 되거나 영영 안 되거나
local function what_sits(surface, force, at, want)
  local here = surface.find_entities_filtered {
    position = { at.x, at.y }, radius = 0.6, force = force,
  }
  for _, e in pairs(here) do
    if e.type ~= "character" and e.type ~= "item-entity" then
      -- 같은 종류가 «자리에 맞게» 서 있으면 그것이 이 자리의 주인이다.
      local dx = math.abs(e.position.x - at.x)
      local dy = math.abs(e.position.y - at.y)
      if e.name == want and dx < 0.6 and dy < 0.6 then return "ours", e end
      return "taken", e
    end
  end
  if surface.can_place_entity { name = want, position = at, force = force } then
    return "free"
  end
  return "blocked"
end

-- 한 구역의 자리표 전체.
local function plot_seats(name, which, origin)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local plan = PLAN[which]
  if not plan then return { error = "no such plot: " .. tostring(which) } end
  if not origin then return { error = "no origin for " .. which } end

  local out = { free = {}, ours = 0, taken = 0, blocked = 0 }
  for nth = 0, plan.count - 1 do
    local at = plan.seat(origin, nth)
    local state, who = what_sits(b.surface, b.force, at, plan.what)
    if state == "free" then
      if #out.free < 12 then
        out.free[#out.free + 1] = { x = at.x, y = at.y, nth = nth }
      end
    else
      out[state] = out[state] + 1
      if state == "taken" and not out.first_taken then
        out.first_taken = { x = at.x, y = at.y, name = who and who.name or "?" }
      end
    end
  end
  out.plot = which
  out.origin = origin
  out.want = plan.count
  return out
end

-- 치수를 밖에서도 볼 수 있게. 파이썬 쪽 숫자와 같은지 시험이 대조한다.
local function plot_shape()
  return { furnace = FURNACE, craft = CRAFT }
end

-- 한 밭의 채굴기 자리표. «광석 위에 있고 놓을 수 있는» 것만 돌려준다.
--
-- 구역 자리표(plot_seats)와 다른 점이 하나다. 화로 자리는 광석이 «없어야»
-- 하고 채굴기 자리는 광석이 «있어야» 한다. 그래서 같은 함수를 못 쓴다.
--
-- 줄은 밭의 긴 쪽을 따라 긋는다. 짧은 쪽으로 다섯 칸마다 한 줄이다.
local function mine_seats(surface, force, field, wanted)
  -- 밭의 테두리를 «광석»에서 다시 잰다.
  --
  -- 부르는 쪽이 주는 것은 「이미 선 채굴기들의 테두리」다(zones 의 fields).
  -- 채굴기가 셋이면 그 상자는 3x1 이고, 그 위에 줄을 그으면 광맥의 한쪽
  -- 끄트머리에 긋는 셈이 된다. 실측:
  --
  --     구리 밭 (28,-4)~(30,-4)      <- 3x1. 광맥이 아니라 채굴기 셋이다.
  --
  -- 자리표는 «광맥»을 따라야 한다. 채굴기가 한 대도 없을 때도 자리를
  -- 내놓을 수 있어야 하고, 그것이 자리표를 만든 이유이기도 하다 -
  -- 먼저 긋고 나중에 붙인다.
  local cx = (field.left + field.right) / 2
  local cy = (field.top + field.bottom) / 2
  local ore = surface.find_entities_filtered {
    position = { cx, cy }, radius = 48, type = "resource", limit = 2000,
  }
  if #ore > 0 then
    -- 가운데 칸과 «같은 광석»만 본다. 광맥이 겹쳐 있으면 남의 광맥까지
    -- 삼켜 테두리가 두 배가 된다.
    local want_name = nil
    local best = math.huge
    for _, e in pairs(ore) do
      local d = (e.position.x - cx) ^ 2 + (e.position.y - cy) ^ 2
      if d < best then best, want_name = d, e.name end
    end
    local lo = { x = math.huge, y = math.huge }
    local hi = { x = -math.huge, y = -math.huge }
    local n = 0
    for _, e in pairs(ore) do
      if e.name == want_name then
        n = n + 1
        lo.x = math.min(lo.x, e.position.x); hi.x = math.max(hi.x, e.position.x)
        lo.y = math.min(lo.y, e.position.y); hi.y = math.max(hi.y, e.position.y)
      end
    end
    if n > 0 then
      field = { left = math.floor(lo.x), top = math.floor(lo.y),
                right = math.floor(hi.x), bottom = math.floor(hi.y) }
    end
  end

  local wide = (field.right - field.left) >= (field.bottom - field.top)
  local origin = {
    x = math.floor(field.left), y = math.floor(field.top),
    -- 첫 줄은 밭 안쪽으로 두 칸 들어와 긋는다. 테두리에 그으면 한쪽
    -- 줄이 통째로 광석 밖이 된다.
    lane = wide and (math.floor(field.top) + 2) or (math.floor(field.left) + 2),
  }

  local function on_ore(x, y)
    -- 2x2 가 덮는 네 칸 중 «하나라도» 광석이면 캔다. 전부를 요구하면
    -- 광맥 가장자리가 통째로 버려진다.
    for dx = 0, 1 do
      for dy = 0, 1 do
        if surface.count_entities_filtered {
          position = { x + dx + 0.5, y + dy + 0.5 }, radius = 0.4,
          type = "resource", limit = 1,
        } > 0 then return true end
      end
    end
    return false
  end

  local free, ours, blocked = {}, 0, 0
  local top = PLAN.mine.count
  for nth = 0, top - 1 do
    local seat = mine_seat(origin, nth, wide)
    local here = { x = seat.x + 1, y = seat.y + 1 }   -- 2x2 의 가운데
    local standing = surface.find_entities_filtered {
      position = here, radius = 0.6, type = "mining-drill", limit = 1,
    }[1]
    if standing then
      ours = ours + 1
    elseif not on_ore(seat.x, seat.y) then
      blocked = blocked + 1
    elseif surface.can_place_entity {
      name = PLAN.mine.what, position = here,
      direction = defines.direction[seat.direction], force = force,
    } then
      -- 방향은 «숫자»로 내보낸다. 부르는 쪽(place)이 숫자를 받는다.
      -- 이름으로 내보냈다가 조용히 0(북쪽)으로 읽히면, 열여섯 대가
      -- 전부 엉뚱한 데로 떨군다 - 자리표를 만든 보람이 통째로 사라진다.
      free[#free + 1] = { x = here.x, y = here.y, nth = nth,
                          direction = defines.direction[seat.direction],
                          facing = seat.direction }
      if #free >= (wanted or 12) then break end
    else
      blocked = blocked + 1
    end
  end
  return { free = free, ours = ours, blocked = blocked, wide = wide,
           lane = origin.lane, want = top, patch = field }
end

return {
  mine_seats = mine_seats,
  furnace_seat = furnace_seat,
  craft_seat = craft_seat,
  mine_seat = mine_seat,
  MINE = MINE,
  plot_seats = plot_seats,
  plot_shape = plot_shape,
  FURNACE = FURNACE,
  CRAFT = CRAFT,
}

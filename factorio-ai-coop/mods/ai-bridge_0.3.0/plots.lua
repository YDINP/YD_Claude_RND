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

local function craft_seat(origin, nth)
  local band = math.floor(nth / CRAFT.row)
  local within = nth % CRAFT.row
  return { x = origin.x + CRAFT.pitch * within,
           y = origin.y + band * CRAFT.aisle }
end

local PLAN = {
  smelt = { seat = furnace_seat, what = "stone-furnace", count = 48 },
  craft = { seat = craft_seat, what = "assembling-machine-1", count = 18 },
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

return {
  furnace_seat = furnace_seat,
  craft_seat = craft_seat,
  plot_seats = plot_seats,
  plot_shape = plot_shape,
  FURNACE = FURNACE,
  CRAFT = CRAFT,
}

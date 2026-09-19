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
local function mine_seats(surface, force, field, wanted, rich, ore_name)
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
  rich = tonumber(rich) or 0
  local cx = (field.left + field.right) / 2
  local cy = (field.top + field.bottom) / 2
  local ore = surface.find_entities_filtered {
    position = { cx, cy }, radius = 48, type = "resource", limit = 2000,
  }
  -- 이 밭이 «무슨» 광석의 밭인가. 테두리를 다시 재는 데만 쓰고 말았더니
  -- 두께를 셀 때 남의 광석까지 세었다(아래 ore_under 참고). 밖으로 낸다.
  -- 부르는 쪽이 이름을 주면 그것을 쓴다. 짐작은 마지막 수단이다.
  local want_name = ore_name
  if type(want_name) ~= "string" or want_name == "" then want_name = nil end
  if #ore > 0 then
    -- 가운데 칸과 «같은 광석»만 본다. 광맥이 겹쳐 있으면 남의 광맥까지
    -- 삼켜 테두리가 두 배가 된다.
    if not want_name then
      local best = math.huge
      for _, e in pairs(ore) do
        local d = (e.position.x - cx) ^ 2 + (e.position.y - cy) ^ 2
        if d < best then best, want_name = d, e.name end
      end
    end
    -- «붙어 있는» 덩어리만 한 밭이다.
    --
    -- 같은 이름이면 다 한 밭으로 세고 있었다. 반경 48 안에 같은 광석이
    -- 두 덩어리 있으면 둘을 합쳐 테두리를 잡는다. 실측(구리밭):
    --
    --     실제 광맥      (-96,30)~(-71,52)
    --     재측정한 것    (-109,30)~(-71,85)
    --     그래서 줄이    x=-107  <- 광맥에서 11칸 떨어진 허공
    --     나온 자리      3칸 (칸 412개짜리 밭에서)
    --
    -- zones 에서 「같은 광석끼리만」을 고쳤는데 여기는 「붙어 있는 것끼리만」이
    -- 빠져 있었다. 같은 실패의 다른 얼굴이다.
    --
    -- 가운데 칸에서 이웃을 따라간다. 광석 칸은 격자에 놓이므로 이웃은
    -- 상하좌우 한 칸이다.
    local grid, start = {}, nil
    local function key(x, y) return math.floor(x) .. ":" .. math.floor(y) end
    for _, e in pairs(ore) do
      if e.name == want_name then
        grid[key(e.position.x, e.position.y)] = e.position
        local d = (e.position.x - cx) ^ 2 + (e.position.y - cy) ^ 2
        if not start or d < start.d then
          start = { x = e.position.x, y = e.position.y, d = d }
        end
      end
    end

    local lo = { x = math.huge, y = math.huge }
    local hi = { x = -math.huge, y = -math.huge }
    local n = 0
    if start then
      local queue, seen = { { x = start.x, y = start.y } }, {}
      seen[key(start.x, start.y)] = true
      local head = 1
      while head <= #queue do
        local here = queue[head]
        head = head + 1
        n = n + 1
        lo.x = math.min(lo.x, here.x); hi.x = math.max(hi.x, here.x)
        lo.y = math.min(lo.y, here.y); hi.y = math.max(hi.y, here.y)
        for _, step in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
          local nx, ny = here.x + step[1], here.y + step[2]
          local k = key(nx, ny)
          if grid[k] and not seen[k] then
            seen[k] = true
            queue[#queue + 1] = { x = nx, y = ny }
          end
        end
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

  -- 「못 놓는다」와 «치우면 놓는다»는 다른 말이다.
  --
  -- 벨트에서 이미 한 번 갈랐던 것(belts.lua 의 sweep/lift)을 여기서는
  -- 안 갈랐다. 큰바위 한 덩이가 2x2 자리 네 칸을 영영 먹는다 - 자리표는
  -- 「막힘」이라 세고 지나가고, 아무도 그 바위를 치우지 않는다. 바위는
  -- 우리 힘의 것이 아니므로 blocking 도 못 본다.
  --
  -- 실측(16회차): big-rock (-48,14) 하나가 철 줄 한가운데에 있었다.
  --
  -- 치울 수 있는 것만 고른다 - 바위와 나무처럼 캐면 없어지고 자재까지
  -- 돌려주는 것들. 우리 건물은 여기서 다루지 않는다(자리를 옮기는 일은
  -- 사람이 정한다).
  local CLEARABLE = { ["simple-entity"] = true, ["tree"] = true }
  local function clearable(here)
    local found = nil
    for _, e in pairs(surface.find_entities_filtered {
      position = here, radius = 1.6,
    }) do
      if e.type == "character" or e.type == "item-entity" then
        -- 지나간다. 사람과 바닥에 흘린 것은 막는 것이 아니다.
      elseif CLEARABLE[e.type] and e.minable then
        found = found or { name = e.name, x = e.position.x, y = e.position.y }
      else
        -- 치울 수 없는 것이 하나라도 있으면 이 자리는 그냥 막힌 자리다.
        return nil
      end
    end
    return found
  end

  -- 2x2 밑에 «몇 개»가 있는가. 닿았는지가 아니라 얼마나 있는지를 센다.
  --
  -- 「하나라도 닿으면 캔다」였던 시절의 값(14회차 실측): 열 자리 중 일곱이
  -- 걷어내는 문턱(400) 밑이었고, 두 자리는 광석 26개 - 채굴기가 104초 살고
  -- 죽는 자리였다. 세우면 다음 순찰이 걷어내고, 그 옆에 깔던 벨트까지 같이
  -- 뜯겨 나갔다. 세우는 기준과 걷는 기준이 다르면 무리가 저 자신과 싸운다.
  --
  -- 그리고 «이 밭의» 광석만 센다. type="resource" 로 아무거나 세다가
  -- 16회차에서 돌밭에 철 채굴기 열한 대를 세웠다. 실측:
  --
  --     철 광맥(붙어 있는 덩어리)   x[-56..-22] y[ -4..27]
  --     돌 광맥                     x[-61..-44] y[-14.. 3]
  --     겹치는 상자                 x[-56..-44] y[ -4.. 3]  <- 여기는 다 돌
  --
  --     자리 (-55,-4) 두께 4657     <- 돌 4469 + 옆칸 돌
  --     실제 그 자리의 철           0
  --
  -- 홍수채움은 철만 골라 테두리를 잡았는데 그 테두리는 «상자»다. 상자
  -- 안에 남의 광맥이 박혀 있으면 상자만 보고는 알 수 없다. 칸마다 이름을
  -- 물어야 한다.
  local function ore_under(x, y)
    local total = 0
    for dx = 0, 1 do
      for dy = 0, 1 do
        for _, e in pairs(surface.find_entities_filtered {
          position = { x + dx + 0.5, y + dy + 0.5 }, radius = 0.4,
          name = want_name, type = want_name and nil or "resource", limit = 1,
        }) do total = total + e.amount end
      end
    end
    return total
  end

  local free, ours, blocked, thin = {}, 0, 0, 0
  local top = PLAN.mine.count
  for nth = 0, top - 1 do
    local seat = mine_seat(origin, nth, wide)
    local here = { x = seat.x + 1, y = seat.y + 1 }   -- 2x2 의 가운데
    local standing = surface.find_entities_filtered {
      position = here, radius = 0.6, type = "mining-drill", limit = 1,
    }[1]
    if standing then
      ours = ours + 1
    else
      local under = ore_under(seat.x, seat.y)
      local seat_clear = under < rich and nil or clearable(here)
      if under < rich then
        -- 얇다. 여기서 멈추지 «않고» 다음 줄로 간다 - 광맥 가장자리가
        -- 얇은 것은 정상이고, 몸통은 두세 줄 안쪽에 있다. 철밭 실측:
        -- 폭 27칸에 첫 줄은 x=51(가장자리), 몸통은 x=55~70 이었다.
        thin = thin + 1
      elseif surface.can_place_entity {
        name = PLAN.mine.what, position = here,
        direction = defines.direction[seat.direction], force = force,
      } or seat_clear then
        -- 방향은 «숫자»로 내보낸다. 부르는 쪽(place)이 숫자를 받는다.
        -- 이름으로 내보냈다가 조용히 0(북쪽)으로 읽히면, 열여섯 대가
        -- 전부 엉뚱한 데로 떨군다 - 자리표를 만든 보람이 통째로 사라진다.
        free[#free + 1] = { x = here.x, y = here.y, nth = nth,
                            ore = under, clear = seat_clear,
                            direction = defines.direction[seat.direction],
                            facing = seat.direction }
      else
        blocked = blocked + 1
      end
    end
  end

  -- «줄»을 고르고, 고른 줄은 «순서대로» 채운다.
  --
  -- 한 번 두꺼운 자리부터 내놓게 했다가 되돌렸다. 밭 전체에서 두꺼운
  -- 순으로 고르면 자리가 흩어진다. 실측(석탄밭):
  --
  --     줄 y=76 북쪽   84, 86, ..., 92      <- 88, 90 이 빈다
  --     줄 y=76 남쪽   ..., 88, 90, 92      <- 84, 86 이 빈다
  --
  -- 이 배치의 전부는 「마주보는 둘이 가운데 벨트에 떨군다」인데, 자리가
  -- 흩어지면 벨트 한 줄로 받으려고 줄을 그은 보람이 없어진다. 띄엄띄엄
  -- 선 열 대를 이으려면 빈 칸에도 벨트를 깔아야 하고, 그 벨트는 아무도
  -- 안 먹인다.
  --
  -- 그래서 두 단계로 고른다.
  --
  --   1  줄(band)마다 그 줄에서 쓸 수 있는 자리의 광석을 합해 점수를 낸다
  --   2  점수 높은 줄부터, 그 줄 «안에서는 nth 순서대로» 내놓는다
  --
  -- nth 순서가 곧 줄을 따라가는 순서다(pair 가 한 칸씩 나아가고 side 가
  -- 양옆을 번갈아 본다). 그러니 이 순서로 채우면 어깨를 맞대고 선다.
  local bands, order = {}, {}
  for _, seat in ipairs(free) do
    local band = math.floor(math.floor(seat.nth / 2) / MINE.row)
    if not bands[band] then
      bands[band] = { band = band, ore = 0, seats = {} }
      order[#order + 1] = bands[band]
    end
    bands[band].ore = bands[band].ore + seat.ore
    bands[band].seats[#bands[band].seats + 1] = seat
  end
  table.sort(order, function(a, b)
    if a.ore ~= b.ore then return a.ore > b.ore end
    return a.band < b.band
  end)

  local keep = {}
  local cap = wanted or 12
  for _, row in ipairs(order) do
    -- 줄 안에서는 자리 번호 순서. 그래야 빈 칸 없이 이어 선다.
    table.sort(row.seats, function(a, b) return a.nth < b.nth end)
    for _, seat in ipairs(row.seats) do
      if #keep >= cap then break end
      keep[#keep + 1] = seat
    end
    if #keep >= cap then break end
  end

  return { free = keep, ours = ours, blocked = blocked, thin = thin,
           found = #free, rich = rich, wide = wide, ore = want_name,
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

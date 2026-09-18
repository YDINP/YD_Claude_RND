-- 벨트 - 캐는 구역에서 제련 구역까지 광석을 나르는 길.
--
-- 구역을 나누면 그 사이를 잇는 일이 생긴다. 사람이 나르면 걸음마다 시간이
-- 들고 가방 크기만큼만 나른다. 벨트는 한 번 깔면 자지도 않고 쉬지도 않는다.
-- 노란 벨트 한 줄이 초당 15개를 나르는데, 그것은 버너 채굴기 예순 대의
-- 산출과 같다.
--
-- 버너 시대에 벨트를 쓰려면 세 토막이 필요하다:
--
--   1) 올라타는 곳   채굴기가 벨트 칸에 «직접 떨군다». 인서터가 필요 없다.
--                    상자에서 옮길 때는 사람이 벨트에 얹는다.
--   2) 길            벨트 줄. 전기가 필요 없다.
--   3) 내리는 곳     벨트 옆에 버너 인서터를 세워 화로에 넣는다.
--                    벨트는 스스로 화로에 넣지 못한다 - 이것을 빠뜨리면
--                    광석이 줄 끝에 쌓이기만 한다.
--
-- 세 토막을 한 번에 다 세울 필요는 없다. 이 파일은 «아직 없는 것»만 돌려주고,
-- 부르는 쪽이 한 번에 나를 수 있는 만큼씩 세운다. 이미 선 벨트는 장애물이
-- 아니라 이미 해둔 일이다 - 전봇대에서 그것을 몰라 스물두 쌍을 겹쳐 놓았다.

local Core = require("core")
local agent = Core.agent
local body = Core.body

local Tasks = require("tasks")

local Zones = require("zones")
local zones = Zones.zones

local BELT = "transport-belt"
local ARM = "burner-inserter"

-- 화로 블록의 치수. layout.py 의 FURNACE_* 와 같은 값이어야 한다.
local FURNACE_PITCH = 3
local FURNACE_ROW = 12

local function dir_of(from, to)
  if to.x > from.x then return defines.direction.east end
  if to.x < from.x then return defines.direction.west end
  if to.y > from.y then return defines.direction.south end
  return defines.direction.north
end

-- 길 찾기.
--
-- 처음에는 ㄱ자로 걸었다 - 한 축을 맞추고 다른 축을 맞춘다. 그런데 첫 칸부터
-- 막혔다. 시작점이 채굴기 밭 한복판이고, 캐는 구역의 테두리 상자가 제련
-- 구역을 통째로 감싸고 있어서 직선으로는 빠져나갈 데가 없었다.
--
-- 그러니 돌아가야 한다. 칸 수가 뻔하므로(수십 칸) 너비 우선으로 찾는다.
-- 이미 벨트가 선 칸은 «지나갈 수 있는 칸»으로 친다 - 그것이 바로 우리가
-- 깔아둔 길이기 때문이다.
-- 길 찾는 법이 바뀔 때마다 올린다. 옛 길을 버리는 표시다.
local PLAN = 4

local MAX_VISIT = 20000
local STEPS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }

local function passable(surface, force, x, y)
  local here = surface.find_entities_filtered {
    position = { x, y }, radius = 0.4, name = BELT, limit = 1,
  }[1]
  if here then return true end
  return surface.can_place_entity {
    name = BELT, position = { x, y }, direction = defines.direction.east,
    force = force,
  }
end

-- 트인 쪽에서 파고 들어간다. 그리고 되도록 곧게.
--
-- 두 번 고쳤다.
--
-- 처음에는 ㄱ자로 걸었다 - 첫 칸부터 막혔다. 시작점 주변 169칸 중 60칸만
-- 열려 있었고 그나마 서로 끊겨 있었다. 채굴기 밭 한복판은 원래 그렇다.
--
-- 다음에는 너비 우선으로 바꿨다. 돌아갈 줄은 알게 되었는데, 대각선을 한 칸씩
-- 번갈아 가는 «계단»이 나왔다. 칸 수로는 최단이지만 사람이 까는 모양이 아니고,
-- 나중에 옆에 무엇을 붙이기도 어렵다.
--
-- 사람이 까는 벨트는 길게 곧고 드물게 꺾인다. 그러니 재는 것을 바꾼다 -
-- 칸 수가 아니라 «꺾이는 횟수»를 줄인다. 곧게 가는 것은 공짜(0), 꺾는 것은
-- 1. 0/1 뿐이니 우선순위 큐 없이 덱 하나로 된다(0-1 BFS).
--
-- 이미 벨트가 선 칸은 지나갈 수 있는 칸으로 친다 - 그것이 바로 우리가 깔아둔
-- 길이기 때문이다.
local function walk(surface, force, from, goal)
  local function key(x, y, d) return x .. ":" .. y .. ":" .. d end

  -- 덱. 앞뒤로 넣고 앞에서 뺀다.
  local deque, head, tail = {}, 0, -1
  local function push_front(v) deque[head - 1] = v; head = head - 1 end
  local function push_back(v) tail = tail + 1; deque[tail] = v end

  -- 꺾임만 세면 길이가 제멋대로 늘어난다.
  --
  -- 실측: 유통 구역에서 제련 구역까지 곧은 거리가 49칸인데 길은 154칸이
  -- 나왔다. 세 배다. 그 사이에 나무는 일곱 그루뿐이었으니 막혀서 돈 것이
  -- 아니다.
  --
  -- 꺾임 값만 재면 「곧게 백 칸 가서 한 번 꺾기」와 「곧게 다섯 칸 가서
  -- 한 번 꺾기」가 «같은 점수»다. 알고리즘은 둘을 구별할 이유가 없다.
  --
  -- 그래서 꺾임이 같으면 «칸 수»로 가른다. 먼저 꺾임, 그다음 길이.
  local turns, steps, came = {}, {}, {}
  for _, step in pairs(STEPS) do
    local d = dir_of({ x = 0, y = 0 }, { x = step[1], y = step[2] })
    turns[key(goal.x, goal.y, d)] = 0
    steps[key(goal.x, goal.y, d)] = 0
    push_back({ x = goal.x, y = goal.y, d = d })
  end
  head = 0

  local best, best_gap, best_turn = nil, math.huge, math.huge
  local visits = 0

  while head <= tail and visits < MAX_VISIT do
    local at = deque[head]
    deque[head] = nil
    head = head + 1
    visits = visits + 1
    local here = key(at.x, at.y, at.d)
    local cost = turns[here]
    local walked = steps[here] or 0

    local gap = math.abs(at.x - from.x) + math.abs(at.y - from.y)
    if gap < best_gap or (gap == best_gap and cost < best_turn) then
      best, best_gap, best_turn = at, gap, cost
    end

    for _, step in pairs(STEPS) do
      local nd = dir_of({ x = 0, y = 0 }, { x = step[1], y = step[2] })
      local nx, ny = at.x + step[1], at.y + step[2]
      local add = (nd == at.d) and 0 or 1
      local k = key(nx, ny, nd)
      -- 꺾임이 적으면 무조건 낫고, 꺾임이 같으면 칸 수가 적은 쪽이 낫다.
      local better = turns[k] == nil
        or turns[k] > cost + add
        or (turns[k] == cost + add and (steps[k] or math.huge) > walked + 1)
      if better and turns[k] ~= -1 then
        local open = (nx == from.x and ny == from.y)
                     or passable(surface, force, nx, ny)
        if open then
          turns[k] = cost + add
          steps[k] = walked + 1
          came[k] = at
          if add == 0 then
            push_front({ x = nx, y = ny, d = nd })
          else
            push_back({ x = nx, y = ny, d = nd })
          end
        else
          turns[k] = -1   -- 막힌 칸. 다시 보지 않는다.
        end
      end
    end
  end

  if not best then return nil end

  -- best 에서 제련 구역까지 거슬러 올라가면 «캐는 쪽 -> 제련 쪽» 순서가 된다.
  -- 광석이 흐르는 방향과 같다.
  local tiles, at = {}, best
  while at do
    local back = came[key(at.x, at.y, at.d)]
    tiles[#tiles + 1] = { x = at.x, y = at.y,
                          dir = back and dir_of(at, back)
                                or defines.direction.east }
    at = back
    if #tiles > 400 then break end
  end
  -- 마지막 칸(제련 구역 줄머리)은 내리는 줄이 맡는다. 두 번 세지 않는다.
  tiles[#tiles] = nil
  return tiles, best_gap, best_turn
end

-- 시작점이 막혀 있으면 가장 가까운 빈 칸으로 옮긴다. 채굴기 밭 한복판에서
-- 줄을 시작할 수는 없다.
local function open_spot(surface, force, at)
  for r = 0, 12 do
    for dx = -r, r do
      for dy = -r, r do
        if math.abs(dx) == r or math.abs(dy) == r then
          if passable(surface, force, at.x + dx, at.y + dy) then
            return { x = at.x + dx, y = at.y + dy }
          end
        end
      end
    end
  end
  return at
end

-- 제련 블록의 벨트 두 줄.
--
-- 화로 줄 0 은 smelt.y-1 과 smelt.y 를, 줄 1 은 smelt.y+4 와 smelt.y+5 를
-- 차지한다(layout.py 의 FURNACE_AISLE = 5). 그 사이와 바깥으로:
--
--     smelt.y - 3   들어오는 벨트  (광석 + 석탄)
--     smelt.y - 2   버너 인서터 ↑  벨트에서 집어 화로에 넣는다
--     smelt.y - 1   화로 줄 0
--     smelt.y + 1   버너 인서터 ↑  화로에서 집어 벨트에 얹는다
--     smelt.y + 2   나가는 벨트    (판금)
--     smelt.y + 3   버너 인서터 ↓  화로 줄 1 에서 집어 벨트에 얹는다
--     smelt.y + 4   화로 줄 1
--
-- 두 줄이 가운데 벨트 하나를 같이 쓴다. 이것이 사람이 짓는 제련 블록의 모양이고
-- (reference/smelting-column.jpg), 그래서 화로를 줄로 세운 것이다.
--
-- 들어오는 벨트에 광석과 석탄을 «같이» 얹는다. 벨트 한 줄에는 두 차선이 있고,
-- 인서터는 집히는 대로 집어 화로에 넣는다. 화로는 석탄을 연료칸에, 광석을
-- 재료칸에 알아서 나눠 담는다. 덤으로 버너 인서터가 제가 나르는 석탄으로
-- 스스로를 먹인다 - 줄 하나가 광석과 연료와 인서터 밥을 한꺼번에 해결한다.
local function feed_line(smelt)
  local into, arms = {}, {}
  local out_lane, out_arms = {}, {}
  local y = smelt.y - 3
  local wide = FURNACE_PITCH * (FURNACE_ROW - 1)

  for i = 0, wide do
    into[#into + 1] = { x = smelt.x - 1 + i, y = y,
                        dir = defines.direction.east }
    out_lane[#out_lane + 1] = { x = smelt.x - 1 + i, y = smelt.y + 2,
                                dir = defines.direction.east }
  end
  for n = 0, FURNACE_ROW - 1 do
    local x = smelt.x + FURNACE_PITCH * n
    -- 집는 쪽이 direction 이다. 벨트가 위에 있으므로 north.
    arms[#arms + 1] = { x = x, y = y + 1, dir = defines.direction.north }
    -- 화로 줄 0 에서 집어 아래 벨트에 얹는다. 집는 쪽은 화로 = north.
    out_arms[#out_arms + 1] = { x = x, y = smelt.y + 1,
                                dir = defines.direction.north }
    -- 화로 줄 1 에서 집어 위 벨트에 얹는다. 집는 쪽은 화로 = south.
    out_arms[#out_arms + 1] = { x = x, y = smelt.y + 3,
                                dir = defines.direction.south }
  end
  return into, arms, { x = smelt.x - 1, y = y }, out_lane, out_arms
end

-- 아직 없는 것만. 이미 선 벨트는 «이미 해둔 일»이다.
local function missing(surface, force, tiles, what)
  local out, standing = {}, 0
  for _, tile in pairs(tiles) do
    local here = surface.find_entities_filtered {
      position = { tile.x, tile.y }, radius = 0.4, name = what, limit = 1,
    }[1]
    if here then
      standing = standing + 1
      if what == BELT and here.direction ~= tile.dir then
        out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir, turn = true }
      end
    elseif surface.can_place_entity {
      name = what, position = { tile.x, tile.y },
      direction = tile.dir, force = force,
    } then
      out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir }
    else
      -- 못 놓는다고 다 같은 「못 놓음」이 아니다.
      --
      -- can_place_entity 는 «사람이 서 있어도» «광석이 떨어져 있어도» 거짓을
      -- 준다. 그런데 사람은 걸어가고 광석은 주우면 그만이다. 그것을 바위와
      -- 같이 「막혔다」로 적었더니, 줄 맨 앞 칸에 누가 서 있는 동안 길
      -- 전체가 멈췄다 - cut 이 첫 blocked 에서 끊기 때문이다.
      --
      -- 실측: todo 0 / left 150. 백오십 칸이 필요한데 할 일이 없다고 했다.
      --
      -- 같은 함정을 화로 자리에서 이미 한 번 겪었다. 그때도 범인은 채굴기가
      -- 흘린 광석이었다. 「못 놓는다」와 「치우면 놓는다」는 다른 말이다.
      local why, sweepable = nil, true
      for _, e in pairs(surface.find_entities_filtered {
        position = { tile.x, tile.y }, radius = 0.4,
      }) do
        if e.type ~= "character" and e.type ~= "item-entity" then
          why, sweepable = e.name, false
          break
        end
      end
      if sweepable then
        out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir, sweep = true }
      else
        out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir,
                          blocked = true, why = why or "terrain" }
      end
    end
  end
  return out, standing
end

-- 물류 - «무엇이 어디서 어디로 흐르는가».
--
-- 처음에는 광석 길 하나만 있었다. 그런데 판금도 석탄도 똑같이 «어디서 나와
-- 어디로 간다». 하나만 특별 취급하면 둘째가 생길 때 그 코드를 통째로 다시
-- 쓴다. 그래서 흐름을 «목록»으로 둔다.
--
--   ore     캐는 구역 상자      -> 제련 구역 들어오는 벨트
--   plate   제련 구역 나가는 줄 -> 조립 구역 (끝에 상자)
--
-- 흐름마다 제 길을 따로 기억한다(storage.lines). 길은 한 번 정하면 남는다 -
-- 부를 때마다 다시 찾으면 깐 벨트가 늘 «새 길 위에 없는» 벨트가 되고,
-- 영원히 깔면서 영원히 못 끝낸다. 실제로 마흔 칸을 그렇게 버렸다.
local function route_for(key, surface, force, from, goal)
  storage.lines = storage.lines or {}
  local kept = storage.lines[key]
  if kept and kept.plan == PLAN and kept.goal
     and kept.goal.x == goal.x and kept.goal.y == goal.y
     and kept.tiles and #kept.tiles > 0 then
    return kept.tiles, kept.short, kept.bends
  end
  local start = open_spot(surface, force, from)
  local tiles, short, bends = walk(surface, force, start, goal)
  if not tiles then return nil end
  storage.lines[key] = { goal = goal, tiles = tiles, short = short,
                         bends = bends, plan = PLAN }
  return tiles, short, bends
end

-- 얼려둔 길 위에 무언가 새로 섰으면, 그 «자리만» 고친다.
--
-- 처음에는 막히면 길을 통째로 다시 찾게 했다. 그것이 벨트 미로를 만들었다 -
-- 막힐 때마다 새 길이 나오고, 무리가 거기에 스무 칸을 깔고, 그 위에 또
-- 채굴기가 서면 또 새 길. 평행선이 열댓 줄 생겼다. 사진으로 보면 빗자루
-- 같았다.
--
-- 길을 통째로 버리는 것은 이미 깐 것을 통째로 버리는 것이다. 막힌 칸이
-- 셋이면 셋만 돌아가면 된다. 앞뒤의 성한 칸을 잡아 그 사이만 다시 잇는다.
local function repair(surface, force, tiles)
  local fixed, patched = {}, 0
  local i = 1
  while i <= #tiles do
    local blocked = false
    local here = surface.find_entities_filtered {
      position = { tiles[i].x, tiles[i].y }, radius = 0.4, force = force,
    }
    for _, e in pairs(here) do
      if e.name ~= BELT and e.type ~= "character" and e.type ~= "item-entity" then
        blocked = true
      end
    end
    if not blocked and not passable(surface, force, tiles[i].x, tiles[i].y) then
      blocked = true
    end

    if not blocked then
      fixed[#fixed + 1] = tiles[i]
      i = i + 1
    else
      -- 막힌 구간의 끝을 찾는다.
      local j = i
      while j <= #tiles do
        if passable(surface, force, tiles[j].x, tiles[j].y) then break end
        j = j + 1
      end
      local before = fixed[#fixed]
      local after = tiles[j]
      if not before or not after then
        -- 처음이나 끝이 막혔으면 잘라낸다. 줄이 조금 짧아질 뿐이다.
        i = j + 1
      else
        local detour = walk(surface, force, before, after)
        if not detour or #detour == 0 then return nil end
        -- detour 는 before -> after 순서다. 첫 칸(before)은 이미 넣었다.
        for n = 2, #detour do fixed[#fixed + 1] = detour[n] end
        patched = patched + 1
        i = j + 1
      end
    end
  end
  if #fixed == 0 then return nil end
  return fixed, patched
end

local function gather(surface, force, parts)
  local todo, standing, want = {}, {}, {}
  for _, part in ipairs(parts) do
    local need, up = missing(surface, force, part.tiles, part.what)
    standing[part.tag] = up
    want[part.tag] = #part.tiles
    for _, one in pairs(need) do
      one.what = part.what
      todo[#todo + 1] = one
    end
  end
  return todo, standing, want
end

local function cut(todo, limit)
  local out, stuck = {}, nil
  for i = 1, math.min(#todo, limit or 20) do
    -- 막힌 칸에서 멈춘다. 건너뛰면 길이 끊기고, 끊긴 길은 아무것도 안 나른다.
    --
    -- 다만 «치우면 놓을 수 있는» 칸은 막힌 것이 아니다. 사람이 서 있거나
    -- 광석이 떨어져 있을 뿐이다. 그런 칸에서 멈추면 길은 영영 안 이어진다.
    if todo[i].blocked then
      stuck = { x = todo[i].x, y = todo[i].y, why = todo[i].why }
      break
    end
    out[#out + 1] = todo[i]
  end
  return out, stuck
end

-- 유통 구역 - 캐는 곳과 녹이는 곳 사이.
--
-- 사용자 지시: "채굴지에서 채굴해서 자원을수집해서 관리하는 유통구역 ->
-- 제련/조립 구역으로 순차적으로 물류가 유통순환이 되도록"
--
-- 지금까지는 밭에서 제련으로 «직결»이었다. 밭이 넷이면 길도 넷이고, 넷이
-- 각자 제련 구역 줄머리로 들어오려 든다. 한 줄머리에 넷이 붙을 수는 없다.
--
-- 그래서 가운데에 모으는 곳을 둔다. 밭에서 온 것이 여기로 들어와 상자에
-- 쌓이고, 상자에서 한 줄로 나가 제련으로 간다. 모이는 곳이 하나면 나가는
-- 길도 하나다.
--
-- 그리고 상자가 있어야 «버틴다». 벨트만으로 이으면 제련이 잠깐 막힐 때
-- 그 막힘이 밭까지 거슬러 올라가 채굴기를 세운다. 상자는 그 사이를
-- 메우는 완충이다.
--
--     depot.y      들어오는 벨트   (밭에서 옴, 동쪽으로)
--     depot.y + 1  인서터 ↑        벨트에서 집어 상자에      집는 쪽 = 북
--     depot.y + 2  상자 줄
--     depot.y + 3  인서터 ↑        상자에서 집어 벨트에      집는 쪽 = 북
--     depot.y + 4  나가는 벨트     (제련으로, 동쪽으로)
--
-- 인서터의 direction 은 «집는 쪽»이다. 위 둘 다 북쪽에서 집어 남쪽에 놓는다.
local DEPOT_WIDE = 12
local DEPOT_CHEST = "wooden-chest"

local function depot_rows(depot)
  local into, fill, bank, draw, out = {}, {}, {}, {}, {}
  for i = 0, DEPOT_WIDE - 1 do
    into[#into + 1] = { x = depot.x + i, y = depot.y,
                        dir = defines.direction.east }
    out[#out + 1] = { x = depot.x + i, y = depot.y + 4,
                      dir = defines.direction.east }
  end
  -- 상자와 인서터는 한 칸 걸러 하나씩. 벨트 한 줄을 다 비우는 데
  -- 인서터 여섯이면 넉넉하고, 사이를 띄우면 나중에 손이 지나갈 길이 된다.
  for i = 0, DEPOT_WIDE - 1, 2 do
    fill[#fill + 1] = { x = depot.x + i, y = depot.y + 1,
                        dir = defines.direction.north }
    bank[#bank + 1] = { x = depot.x + i, y = depot.y + 2 }
    draw[#draw + 1] = { x = depot.x + i, y = depot.y + 3,
                        dir = defines.direction.north }
  end
  return into, fill, bank, draw, out
end

-- 유통 구역의 «들어오는 줄머리»와 «나가는 줄꼬리».
local function depot_ends(depot)
  return { x = depot.x, y = depot.y },                      -- 밭에서 오는 끝
         { x = depot.x + DEPOT_WIDE - 1, y = depot.y + 4 }  -- 제련으로 가는 끝
end

local function depot_line(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local here = zones(name)
  if not here.depot then return { error = "no depot zone yet" } end

  local into, fill, bank, draw, out = depot_rows(here.depot)
  local todo, standing, want = gather(b.surface, b.force, {
    { tag = "bank", what = DEPOT_CHEST, tiles = bank },
    { tag = "into", what = BELT, tiles = into },
    { tag = "fill", what = ARM, tiles = fill },
    { tag = "out", what = BELT, tiles = out },
    { tag = "draw", what = ARM, tiles = draw },
  })
  local mine, stuck = cut(todo, limit)
  local head, tail = depot_ends(here.depot)
  return {
    todo = mine, left = #todo, stuck = stuck,
    standing = standing, want = want,
    head = head, from = tail,
  }
end

-- 캐는 구역 -> 제련 구역. 광석과 석탄이 같은 줄로 들어오고, 판금이 가운데
-- 줄로 나간다.
local function ore_line(name, fx, fy, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  local smelt, mine = here.smelt, here.mine
  if not smelt then return { error = "no smelting zone yet" } end
  if not mine and not fx then return { error = "no mining zone yet" } end

  local lane, arms, head, out_lane, out_arms = feed_line(smelt)

  -- 출발점은 «유통 구역»이지 밭이 아니다.
  --
  -- 밭이 넷이면 길도 넷이고, 넷이 각자 제련 줄머리로 들어오려 든다.
  -- 한 줄머리에 넷이 붙을 수는 없다. 그래서 밭에서 온 것은 먼저 유통
  -- 구역에 모이고, 거기서 «한 줄»로 제련에 간다.
  --
  -- 유통 구역이 아직 없으면 예전처럼 밭에서 바로 간다. 초반에는 모을
  -- 것이 한 밭뿐이라 그것으로 충분하고, 모으는 곳을 짓느라 사슬이 멈추면
  -- 안 된다.
  local start
  if fx and fy then
    start = { x = math.floor(fx), y = math.floor(fy) }
  elseif here.depot then
    local _, tail = depot_ends(here.depot)
    start = tail
  else
    start = { x = math.floor(mine.x), y = math.floor(mine.y) }
  end
  local trunk, short, bends = route_for("ore", surface, force, start, head)
  if not trunk then
    return { error = "no route from the mine to the smelter" }
  end
  -- 길 위에 무언가 새로 섰으면 그 자리만 고쳐서 다시 적어둔다.
  local mended, patches = repair(surface, force, trunk)
  if mended and patches and patches > 0 then
    trunk = mended
    storage.lines["ore"].tiles = trunk
  end

  -- 순서가 있다. 길이 없으면 내리는 곳을 세워도 아무것도 안 온다. 그리고
  -- 나가는 줄을 빠뜨리면 화로가 판금으로 제 출력칸을 막고 다시 선다.
  local todo, standing, want = gather(surface, force, {
    { tag = "trunk", what = BELT, tiles = trunk },
    { tag = "lane", what = BELT, tiles = lane },
    { tag = "arms", what = ARM, tiles = arms },
    { tag = "out", what = BELT, tiles = out_lane },
    { tag = "pick", what = ARM, tiles = out_arms },
  })

  local mine, stuck = cut(todo, limit)
  return {
    todo = mine, left = #todo, stuck = stuck,
    standing = standing, want = want,
    head = head, from = trunk[1] or head,
    short = short, bends = bends,
  }
end

-- 제련 구역 -> 조립 구역. 판금이 흐른다.
--
-- 나가는 줄의 동쪽 끝에서 출발해 조립 구역까지 간다. 줄 끝에는 상자를 두고
-- 인서터로 부린다 - 벨트는 스스로 상자에 못 넣는다. 들어오는 쪽에서 이미
-- 한 번 겪은 함정이다.
local SINK = "wooden-chest"

local function plate_line(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force

  local here = zones(name)
  if not here.smelt or not here.craft then
    return { error = "no smelting or crafting zone yet" }
  end

  local _, _, _, out_lane = feed_line(here.smelt)
  local tail = out_lane[#out_lane]
  local goal = { x = here.craft.x, y = here.craft.y - 2 }

  local aim = { x = tail.x, y = tail.y }
  local trunk, short, bends = route_for("plate", surface, force,
    { x = goal.x, y = goal.y }, aim)
  if not trunk then return { error = "no route from the smelter to the shop" } end
  local mended, patches = repair(surface, force, trunk)
  if mended and patches and patches > 0 then
    trunk = mended
    storage.lines["plate"].tiles = trunk
  end

  -- walk 는 «goal 쪽으로 흐르는» 순서를 준다. 여기서는 제련 구역이 goal 이므로
  -- 뒤집어야 판금이 조립 구역 쪽으로 흐른다.
  local flow = {}
  for i = #trunk, 1, -1 do
    local one = trunk[i]
    local nxt = trunk[i - 1]
    flow[#flow + 1] = { x = one.x, y = one.y,
                        dir = nxt and dir_of(one, nxt)
                              or defines.direction.east }
  end

  local last = flow[#flow] or goal
  local sink = { { x = last.x, y = last.y + 2 } }
  local hand = { { x = last.x, y = last.y + 1,
                   dir = defines.direction.north } }

  local todo, standing, want = gather(surface, force, {
    { tag = "trunk", what = BELT, tiles = flow },
    { tag = "hand", what = ARM, tiles = hand },
    { tag = "sink", what = SINK, tiles = sink },
  })

  local mine, stuck = cut(todo, limit)
  return {
    todo = mine, left = #todo, stuck = stuck,
    standing = standing, want = want,
    head = { x = last.x, y = last.y }, from = flow[1] or goal,
    short = short, bends = bends,
  }
end

-- 흐름 전체를 한눈에. 부르는 쪽은 «아직 안 끝난 첫 흐름»을 집으면 된다.
-- 밭에서 유통 구역까지. 밭마다 한 줄씩.
--
-- 사용자가 사진과 함께 짚었다: "이러면 벨트를 깐 이유가 없는데".
-- 채굴기가 상자에 떨구고 그 옆에서 벨트가 비어 흘러가고 있었다. 실측:
--
--     채굴기 71,6   가장 가까운 벨트 73,5  (3타일)
--     채굴기 75,5   가장 가까운 벨트 73,4  (2타일)
--     채굴기 77,4   가장 가까운 벨트 73,3  (4타일)
--
-- 길이 밭을 «지나가지» 않고 밭 «옆에서 출발»했기 때문이다. 밭 오른쪽
-- 두 칸 밖에서 유통 구역으로 곧장 갔다. 그러면 채굴기는 그 길에 못 닿는다.
--
-- 버너 채굴기는 인서터 없이 벨트에 직접 떨구는데, 떨구는 칸은 제 몸
-- 바로 옆 한 칸이다. 그러니 벨트가 «그 칸을 지나야» 한다. 채굴기를
-- 벨트 쪽으로 옮길 수는 없다 - 채굴기는 광석 위에 서야 하니까.
--
-- 그래서 길이 채굴기를 찾아간다. 채굴기마다 떨구는 칸을 하나씩 정하고,
-- 그 칸들을 차례로 잇고, 마지막을 유통 구역에 붙인다.
-- 떨구는 칸은 «게임에 묻는다».
--
-- 짐작으로 계산했다가 반칸 어긋났다. 실측:
--
--     드릴 71.0,6.0  dir=남   ->  drop_position 71.5,7.3
--     벨트                        71.5,-8.5 처럼 반칸 좌표
--
-- 나는 드릴 위치에서 ±2 하고 floor 했다. 그러면 (71,8) 이 나오는데 벨트
-- 칸의 중심은 (71.5,7.5) 다. 반칸 어긋난 자리에 깔면 채굴기는 그 벨트를
-- 못 본다 - 벨트 153칸을 깔고도 여섯 대가 전부 상자를 보고 있었다.
--
-- 엔진에는 방향마다 떨구는 자리가 이미 정해져 있다(drop_position). 그러니
-- 돌려보고 «어디에 떨구는지 물어보면» 된다. 물어본 뒤 원래대로 돌려놓는다.
--
-- 이 저장소가 여러 번 배운 것이다: 계산할 수 있는 것도 게임이 알고 있으면
-- 게임에 묻는 편이 맞다. 레시피도, 놓을 수 있는가도, 길도 그랬다.
local FOUR = { defines.direction.north, defines.direction.south,
               defines.direction.east, defines.direction.west }

local function tile_of(p)
  return { x = math.floor(p.x) + 0.5, y = math.floor(p.y) + 0.5 }
end

-- 이 채굴기가 떨굴 수 있는 칸들. 목적지에 가까운 쪽부터.
local function drop_seats(surface, force, drill, toward)
  local was = drill.direction
  local seats = {}
  for _, dir in pairs(FOUR) do
    drill.direction = dir
    local tile = tile_of(drill.drop_position)
    if passable(surface, force, tile.x, tile.y) then
      tile.dir = dir
      tile.gap = math.abs(tile.x - toward.x) + math.abs(tile.y - toward.y)
      seats[#seats + 1] = tile
    end
  end
  drill.direction = was
  table.sort(seats, function(p, q) return p.gap < q.gap end)
  return seats
end

-- 한 밭의 «등뼈». 곧은 줄 하나.
--
-- 처음에는 채굴기마다 하나씩 들르게 했다. 그랬더니 뱀이 됐다 - 실측으로
-- 한 밭의 수집 길이 424칸이었다. 채굴기 열 대를 잇자고 벨트 사백 칸을
-- 까는 것은 물류가 아니라 낭비다.
--
-- 사람이 까는 수집 줄은 곧다. 채굴기를 줄 옆에 세우지, 줄이 채굴기를
-- 찾아 헤매지 않는다. 그러니 «가장 많은 채굴기가 닿는 곧은 줄»을 고른다.
--
-- 닿지 않는 채굴기는 상자를 그대로 쓴다. 전부를 벨트에 태우는 것보다
-- 절반을 짧은 줄에 태우는 편이 낫다 - 나머지 절반은 다음 줄을 깔 때
-- 닿거나, 안 닿으면 사람이 그 상자만 비우면 된다.
local function spine_of(surface, force, field, drills, toward)
  local wide = (field.right - field.left) >= (field.bottom - field.top)
  local best, best_hits = nil, -1

  -- 줄이 놓일 만한 줄/칸을 훑는다. 채굴기 떨구는 자리가 그 위에 몇 개
  -- 걸리는지로 고른다.
  local lo = wide and (field.top - 3) or (field.left - 3)
  local hi = wide and (field.bottom + 3) or (field.right + 3)
  for at = lo, hi do
    local hits = 0
    for _, drill in pairs(drills) do
      for _, seat in pairs(drop_seats(surface, force, drill, toward)) do
        local on = wide and math.floor(seat.y) or math.floor(seat.x)
        if on == at then hits = hits + 1 break end
      end
    end
    if hits > best_hits then best, best_hits = at, hits end
  end
  if not best or best_hits <= 0 then return nil end

  -- 그 줄 위에서 «닿는 채굴기들»이 걸친 구간만 깐다. 밭 끝에서 끝까지
  -- 깔 이유가 없다 - 채굴기가 없는 구간은 빈 벨트다.
  local from, to = math.huge, -math.huge
  for _, drill in pairs(drills) do
    for _, seat in pairs(drop_seats(surface, force, drill, toward)) do
      local on = wide and math.floor(seat.y) or math.floor(seat.x)
      if on == best then
        local along = wide and seat.x or seat.y
        from, to = math.min(from, along), math.max(to, along)
        break
      end
    end
  end
  if from > to then return nil end

  local tiles = {}
  for along = from, to do
    tiles[#tiles + 1] = wide and { x = along, y = best + 0.5 }
                             or { x = best + 0.5, y = along }
  end
  return tiles, best_hits
end

local function field_lines(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local surface, force = b.surface, b.force
  local here = zones(name)
  if not here.depot then return { error = "no depot zone yet" } end
  local fields = here.fields or {}
  if #fields == 0 then return { error = "no mining field yet" } end

  local head = depot_ends(here.depot)
  local parts, first_from = {}, nil

  for n = 1, math.min(#fields, 3) do
    local field = fields[n]
    local drills = surface.find_entities_filtered {
      area = { { field.left - 3, field.top - 3 },
               { field.right + 3, field.bottom + 3 } },
      type = "mining-drill", force = force,
    }
    if #drills > 0 then
      local key = "field:" .. math.floor(field.x) .. "," .. math.floor(field.y)
      storage.lines = storage.lines or {}
      local kept = storage.lines[key]
      local tiles
      -- 채굴기가 한 대 늘었다고 길을 버리지 않는다.
      --
      -- 열쇠에 채굴기 수를 넣었더니, 한 대 설 때마다 길이 통째로 새로
      -- 났다. 그러면 이미 깔아둔 벨트가 죄다 「길 밖」이 되고, 무리는
      -- 그것을 걷어 다시 깐다. 실측으로 수집 길이 116칸까지 줄었다가
      -- 170칸으로 되돌아갔고 f1 이 0/50 으로 초기화됐다.
      --
      -- 벨트 미로를 만드는 방식이 이번으로 «세 번째»다. 매번 모양이
      -- 조금씩 달랐을 뿐 뿌리는 하나다 - 길을 다시 계산할 이유를 하나
      -- 더 만들어놓는 것.
      --
      -- 길은 한 번 정하면 남는다. 새로 선 채굴기가 그 줄에 안 닿으면
      -- 상자를 쓰면 된다. 그 한 대 때문에 쉰 칸을 다시 까는 것보다 싸다.
      if kept and kept.plan == PLAN
         and kept.tiles and #kept.tiles > 0 then
        tiles = kept.tiles
        local mended, patches = repair(surface, force, tiles)
        if mended and patches and patches > 0 then
          tiles = mended
          storage.lines[key].tiles = tiles
        end
      else
        local spine = spine_of(surface, force, field, drills, head)
        if spine then
          -- 등뼈 끝에서 유통 구역까지. 유통 구역에 가까운 끝에서 나간다.
          local one, other = spine[1], spine[#spine]
          local gap_one = math.abs(one.x - head.x) + math.abs(one.y - head.y)
          local gap_other = math.abs(other.x - head.x) + math.abs(other.y - head.y)
          local exit_at = (gap_one < gap_other) and one or other
          local stem = walk(surface, force, exit_at, head)

          -- 등뼈는 «나가는 끝 쪽»으로 흐른다. 방향이 없는 벨트는 아무
          -- 데로도 안 흐르고, 반대로 선 벨트는 캔 것을 밭 안쪽으로 밀어
          -- 넣는다. 나가는 끝이 첫 칸이면 거꾸로 세워 흐름을 뒤집는다.
          tiles = {}
          if exit_at == one then
            for i = #spine, 1, -1 do tiles[#tiles + 1] = spine[i] end
          else
            for i = 1, #spine do tiles[#tiles + 1] = spine[i] end
          end
          for i = 1, #tiles do
            local nxt = tiles[i + 1] or (stem and stem[1])
            tiles[i].dir = nxt and dir_of(tiles[i], nxt)
                           or defines.direction.east
          end
          if stem then
            for _, t in ipairs(stem) do tiles[#tiles + 1] = t end
          end
          storage.lines[key] = { tiles = tiles, plan = PLAN }
        end
      end
      if tiles and #tiles > 0 then
        first_from = first_from or tiles[1]
        parts[#parts + 1] = { tag = "f" .. n, what = BELT, tiles = tiles }
      end
    end
  end
  if #parts == 0 then return { error = "no drill to collect from yet" } end

  local todo, standing, want = gather(surface, force, parts)
  local mine, stuck = cut(todo, limit)
  return {
    todo = mine, left = #todo, stuck = stuck,
    standing = standing, want = want,
    head = head, from = first_from or head,
  }
end

-- 물류의 순서. 앞의 것이 덜 됐으면 그것부터 한다.
--
--     field   밭 -> 유통 구역      캔 것을 모으는 길
--     depot   유통 구역 자체        상자와 인서터, 들어오고 나가는 줄
--     ore     유통 구역 -> 제련     모은 것을 녹이러 보내는 길
--     plate   제련 -> 조립          녹인 것을 쓰러 보내는 길
--
-- 순서가 거꾸로면 지은 것이 논다. 유통 구역 없이 제련까지 길을 깔아봐야
-- 그 길에 실릴 것이 없고, 모으는 곳을 지어봐야 밭에서 오는 길이 없으면
-- 빈 상자만 서 있다.
local FLOWS = {
  { flow = "field", plan = function(name, limit) return field_lines(name, limit) end },
  { flow = "depot", plan = function(name, limit) return depot_line(name, limit) end },
  { flow = "ore", plan = function(name, limit) return ore_line(name, nil, nil, limit) end },
  { flow = "plate", plan = function(name, limit) return plate_line(name, limit) end },
}

local function flows(name, limit)
  local out = {}
  for _, one in ipairs(FLOWS) do
    local answer = one.plan(name, limit)
    out[#out + 1] = {
      flow = one.flow, error = answer.error,
      left = answer.left, standing = answer.standing, want = answer.want,
      from = answer.from, head = answer.head,
    }
  end
  return { flows = out }
end

-- 한 흐름의 다음 할 일. 이름으로 고른다.
local function flow_plan(name, which, limit)
  for _, one in ipairs(FLOWS) do
    if one.flow == which then return one.plan(name, limit) end
  end
  return { error = "no such flow: " .. tostring(which) }
end

-- 길 위에 없는 벨트들.
--
-- 길을 부를 때마다 새로 찾던 시절에 깔린 것들이다. 실측하니 마흔 칸이
-- 그렇게 버려져 있었다 - 철판 예순 개어치다. 걷어내면 손에 돌아오고,
-- 그 손으로 진짜 길을 이어 깔면 된다.
--
-- 「길 위에 있는가」는 정해진 길이 있어야 물을 수 있다. 그러니 길을 한 번
-- 정해두는 것은 낭비를 막는 일이기도 하다.
-- 설계는 한 번, 건설은 여럿이.
--
-- 사용자 지시: "심시티 자체는 반장이 설계해서 각 에이전트들한테 건설을
-- 위임하는게 좋을듯."
--
-- 맞다. 그리고 그것이 벨트 미로의 답이기도 하다. 미로가 생긴 까닭은 여덟이
-- 각자 「길이 어디냐」를 묻고 각자 다른 답을 받았기 때문이다. 설계가 하나면
-- 답도 하나다.
--
-- 그래서 일감을 «나눠준다». 이미 남이 집어간 칸은 안 준다. 삼 분이 지나면
-- 놓은 것으로 치고 다시 내준다 - 가다 죽은 사람의 몫을 영원히 비워둘 수는 없다.
-- 몫을 얼마나 붙들고 있을 것인가.
--
-- 삼 분으로 뒀다가 무리가 스스로 발을 걸었다. 실측:
--
--     손에 든 벨트   alpha 20, bravo 53, charlie 5, delta 91  (합 169)
--     한 번에 깐 칸  3
--     남은 칸        131
--
-- 넷이 각자 스무 칸씩 집어가면 여든 칸이 묶인다. 그러고는 재료가 없거나
-- 걸어가다 다른 일이 끼어들어 못 깐다. 그 몫은 «삼 분 동안» 아무도 못
-- 건드린다. 그래서 다음 순찰에 받을 수 있는 칸이 서너 개뿐이었다.
--
-- 붙들기는 «같은 칸에 둘이 서지 않게» 하려는 것이지 자리를 쟁여두려는
-- 것이 아니다. 한 번 갔다 오는 시간이면 충분하다.
local CLAIM_TICKS = 60 * 45

local function claim_work(name, which, count)
  local plan = flow_plan(name, which, 200)
  if plan.error then return plan end
  local todo = plan.todo or {}

  storage.build_claims = storage.build_claims or {}
  local now = game.tick
  local mine = {}
  for i = 1, #todo do
    local one = todo[i]
    local key = which .. ":" .. one.x .. ":" .. one.y
    local held = storage.build_claims[key]
    if held == nil or held.who == name or now - held.tick > CLAIM_TICKS then
      storage.build_claims[key] = { who = name, tick = now }
      mine[#mine + 1] = one
      if #mine >= (count or 20) then break end
    end
  end

  -- 오래된 표시는 치운다. 안 그러면 표가 끝없이 자란다.
  for key, held in pairs(storage.build_claims) do
    if now - held.tick > CLAIM_TICKS * 4 then
      storage.build_claims[key] = nil
    end
  end

  return { todo = mine, left = plan.left, standing = plan.standing,
           want = plan.want, from = plan.from, flow = which }
end

local function loose_belts(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local here = zones(name)
  if not here.smelt then return { loose = {} } end
  local lane, _, _, out_lane = feed_line(here.smelt)

  local mine_route = {}
  -- 길 찾는 법이 바뀌면 옛 길은 버린다. 계단으로 깔린 것을
  -- 그대로 들고 가면 고친 보람이 없다.
  local kept = storage.ore_line
  if kept and kept.plan ~= PLAN then kept = nil end
  for _, tile in pairs((kept and kept.tiles) or {}) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end
  for _, tile in pairs(lane) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end
  for _, tile in pairs(out_lane) do
    mine_route[tile.x .. ":" .. tile.y] = true
  end

  local out = {}
  for _, e in pairs(b.surface.find_entities_filtered {
    name = BELT, force = b.force,
  }) do
    local k = math.floor(e.position.x) .. ":" .. math.floor(e.position.y)
    if not mine_route[k] and e.minable then
      out[#out + 1] = { x = e.position.x, y = e.position.y,
                        distance = math.floor(Tasks.dist(b.position, e.position)) }
    end
  end
  table.sort(out, function(p, q) return p.distance < q.distance end)
  local near = {}
  for i = 1, math.min(#out, limit or 12) do near[i] = out[i] end
  return { loose = near, total = #out }
end

return {
  ore_line = ore_line,
  claim_work = claim_work,
  flows = flows,
  flow_plan = flow_plan,
  loose_belts = loose_belts,
}

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
--
-- 5 로 올린다: 등뼈의 좌표 규약이 반칸에서 칸 번호로 바뀌었고, repair 가
-- 내던 한 칸 구멍이 이미 굳어 있는 길들에 남아 있다. 올리지 않으면
-- `field_lines` 가 plan 이 같다고 옛 길을 그대로 다시 쓴다.
local PLAN = 5

-- 이만큼 안에 있으면 «같은 밭»이다. 밭을 나누는 간격(zones.lua 의
-- FIELD_GAP)과 같은 값이라야 한다 - 그보다 크면 두 밭이 한 길을 쓰고,
-- 작으면 같은 밭이 채굴기 몇 대에 두 길을 갖는다.
local SAME_FIELD = 24

local MAX_VISIT = 20000
local STEPS = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }

-- 칸 번호와 «엔티티가 앉는 자리»는 다르다.
--
-- 길은 칸 번호로 적는다 - 정수다. 그런데 1x1 엔티티는 그 칸의 «가운데»에
-- 앉는다(x+0.5, y+0.5). 두 좌표의 거리는 0.707 이라, 칸 번호에서 반경
-- 0.4 로 찾으면 그 칸에 서 있는 것을 «영원히 못 찾는다».
--
-- 이것 하나가 벨트 이야기의 절반이었다. 실측(206분째):
--
--     길이 남았다고 한 칸   130
--     그 칸에 실제로 선 벨트 (61,86) -> 엔티티는 61.5,86.5 에 있었다
--     모서리에서 찾기        못찾음
--     가운데에서 찾기        찾음
--
-- 그래서 이미 다 깔린 길을 영원히 「안 깔렸다」고 읽었다. 무리는 매번
-- 거기까지 걸어가 쓸고, 놓으려 하고, "cannot place transport-belt" 로
-- 실패하고, 다음 순찰에 또 갔다. `passable` 도 같은 잘못이라 제가 깐
-- 간선을 «못 지나가는 칸»으로 읽고 돌아가는 길을 냈다 - 사용자가 사진으로
-- 짚은 그 미로다.
--
-- can_place_entity 는 이 잘못이 없다. 그쪽은 좌표를 격자에 맞춰 주므로
-- 모서리로 물어도 같은 답이 온다. 그래서 「놓을 수 있나」만 맞고 「이미
-- 있나」만 틀린, 가장 찾기 어려운 모양이 됐다.
local function centre(x, y) return { x + 0.5, y + 0.5 } end

-- guard 는 «이 칸이 남의 줄인가»를 묻는 함수다(제련 기둥 예약, smelt_guard
-- 참고). 예약된 칸은 이미 서 있는 벨트가 있어도 지나갈 수 없는 칸으로
-- 친다 - 남의 방향(동쪽)을 빌려 쓰면 그 자리는 두 흐름이 서로 다른
-- 방향을 요구하게 된다.
local function passable(surface, force, x, y, guard)
  if guard and guard(x, y) then return false end
  local here = surface.find_entities_filtered {
    position = centre(x, y), radius = 0.4, name = BELT, limit = 1,
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
-- 대각선 이음매를 메운다.
--
-- 사용자가 사진과 함께 짚었다: "컨베이어 벨트는 왜 설치하다가 중간중간
-- 끊어먹는거임?" 빨간 원 둘이 «둘 다 꺾이는 자리»였다.
--
-- 계획을 재보니 길 자체에 대각선 걸음이 들어 있었다:
--
--   (83,56) -> (84,55)   거리 2   x+1, y-1
--   (84,52) -> (85,51)   거리 2
--   (85,46) -> (84,45)   거리 2
--
-- 벨트는 대각선으로 못 놓는다. 그러니 그 코너 칸은 계획에 없고, 아무도
-- 그 자리를 안 맡고, 길이 거기서 끊긴다.
--
-- 대각선은 길 찾기가 목적지에 «못 닿았을 때» 생긴다. `walk` 은 닿지
-- 못하면 가장 가까운 칸에서 멈추는데, 그 칸이 대각선이면 이음매가
-- 대각선이 된다. 등뼈와 줄기를 이어붙이는 자리도 마찬가지다.
--
-- 한 칸만 끼우면 이어진다. 두 모서리 중 놓을 수 있는 쪽을 고른다.
local function stitch(surface, force, tiles, guard)
  if not tiles or #tiles < 2 then return tiles end
  local out = {}
  for i = 1, #tiles do
    out[#out + 1] = tiles[i]
    local nxt = tiles[i + 1]
    if nxt then
      local dx, dy = nxt.x - tiles[i].x, nxt.y - tiles[i].y
      -- 「대각선으로 꼭 한 칸」이 아니라 「축 둘 다 어긋났다」로 본다.
      -- 앞의 것은 좌표 규약이 하나일 때만 맞는 말이었고, 실제로는
      -- 규약이 둘이라 한 번도 성립하지 않았다.
      if dx ~= 0 and dy ~= 0 then
        local a = { x = nxt.x, y = tiles[i].y }
        local b = { x = tiles[i].x, y = nxt.y }
        local pick = a
        if not passable(surface, force, a.x, a.y, guard)
           and passable(surface, force, b.x, b.y, guard) then
          pick = b
        end
        out[#out + 1] = { x = pick.x, y = pick.y }
      end
    end
  end
  -- 방향을 다시 매긴다. 끼워 넣은 칸은 방향이 없고, 그 «앞» 칸의 방향도
  -- 바뀐다 - 이제 다음 칸이 달라졌기 때문이다. 마지막 칸은 그대로 둔다.
  for i = 1, #out - 1 do
    out[i].dir = dir_of(out[i], out[i + 1])
  end
  return out
end

local function walk(surface, force, from, goal, guard)
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
                     or passable(surface, force, nx, ny, guard)
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
  return stitch(surface, force, tiles, guard), best_gap, best_turn
end

-- 시작점이 막혀 있으면 가장 가까운 빈 칸으로 옮긴다. 채굴기 밭 한복판에서
-- 줄을 시작할 수는 없다.
local function open_spot(surface, force, at, guard)
  for r = 0, 12 do
    for dx = -r, r do
      for dy = -r, r do
        if math.abs(dx) == r or math.abs(dy) == r then
          if passable(surface, force, at.x + dx, at.y + dy, guard) then
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

-- 제련 기둥이 «자기 것»으로 이미 잡아 둔 자리. smelt.y 기준 상대 줄이고,
-- scripts/rows.py 의 LANES/ARMS 와 같은 숫자를 쓴다 - 숫자가 두 곳에서
-- 갈라지면 이번 사고가 그대로 되풀이된다.
--
-- 실측(게임): smelt={x=25,y=14,w=38,h=16}, depot={x=50,y=15,w=12,h=5}.
-- 창고 구역이 제련 구역 «안에» 있었다. depot_line 은 이것을 모르고 제
-- 격자(depot.y..depot.y+4)를 그대로 깔았고, 그 격자가 제련 기둥의 벨트
-- 줄·팔 줄과 같은 칸에 앉았다. 사용자가 사진을 보고 물었다: "이렇게두면
-- 인서터설치는 어떻게하게?" - 화로 바로 옆 칸이 남의 벨트면 팔이 설
-- 자리가 없다.
--
-- 창고 구역은 옮기지 않는다(옮기면 이미 깐 길이 전부 헛것이 된다). 대신
-- 제련 기둥이 쓰는 줄을 다른 흐름이 «계획에 넣지 못하게» 막는다.
local SMELT_LANES = { -3, 2 }        -- 벨트 두 줄. feed_line 이 전체 폭에
                                      -- 틈 없이 깐다 - 예외 없이 막는다.
local SMELT_ARMS  = { -2, 1, 3 }     -- 팔 세 줄. 화로 기둥마다 한 칸뿐이다.
local SMELT_BODY  = { -1, 0, 4, 5 }  -- 화로 몸통 두 줄. 279행 주석대로
                                      -- 화로 줄 0 은 y-1,y 를, 줄 1 은
                                      -- y+4,y+5 를 차지한다(2x2 라 기둥
                                      -- x 와 그 옆 칸(x-1)을 먹는다).

-- 이 x 가 화로 기둥 자리(= smelt.x + FURNACE_PITCH*n, 밭 폭 안)인가.
-- 기둥 «사이» 칸은 smelt 가 쓸 일이 없는 자리다 - 실측: x=59 에 선 세로
-- 벨트가 그런 자리였고, 지나가도 아무 팔도 안 막았다. 그러니 그런
-- 칸만은 남의 흐름이 지나가도 된다.
local function on_furnace_column(smelt, x)
  local wide = FURNACE_PITCH * (FURNACE_ROW - 1)
  local off = x - smelt.x
  return off >= 0 and off <= wide and off % FURNACE_PITCH == 0
end

-- smelt 구역이 아직 없으면(nil) 아무것도 막지 않는다 - 화로를 세우기
-- 전까지는 막을 줄도 없다.
local function smelt_guard(smelt)
  if not smelt then return nil end
  local wide = FURNACE_PITCH * (FURNACE_ROW - 1)
  local lane_x0, lane_x1 = smelt.x - 1, smelt.x - 1 + wide
  return function(x, y)
    local dy = y - smelt.y
    for _, d in pairs(SMELT_LANES) do
      if dy == d then return x >= lane_x0 and x <= lane_x1 end
    end
    for _, d in pairs(SMELT_ARMS) do
      if dy == d then return on_furnace_column(smelt, x) end
    end
    for _, d in pairs(SMELT_BODY) do
      if dy == d then
        return on_furnace_column(smelt, x) or on_furnace_column(smelt, x + 1)
      end
    end
    return false
  end
end

-- 계획에서 그 칸만 뺀다. 이미 거기 선 것은 안 건드린다 - 걷어내는 일은
-- 이 함수가 할 일이 아니다(그건 따로 시킨다).
local function drop_guarded(tiles, guard)
  if not guard then return tiles end
  local out = {}
  for _, t in pairs(tiles) do
    if not guard(t.x, t.y) then out[#out + 1] = t end
  end
  return out
end

-- 아직 없는 것만. 이미 선 벨트는 «이미 해둔 일»이다.
-- 벨트 자리에 앉아 있을 때 «걷어내도 되는» 것.
--
-- 상자뿐이다. 채굴기가 떨구는 자리에 놓는 상자는 「벨트가 아직 없을 때의
-- 임시 출구」고, 벨트가 오면 그 자리는 벨트 것이다. 걷으면 상자도 안에
-- 든 것도 가방으로 돌아온다.
--
-- 좁게 두는 이유: 화로도 채굴기도 전봇대도 터렛도 «진짜 건물»이다. 길을
-- 깐다고 그것들을 걷어내기 시작하면 무리가 제 공장을 허문다. 이 저장소는
-- 그 모양을 이미 한 번 봤다 - 세우면 걷고 걷으면 세우기.
local LIFTABLE = {
  ["wooden-chest"] = true, ["iron-chest"] = true, ["steel-chest"] = true,
}

local function missing(surface, force, tiles, what)
  local out, standing = {}, 0
  for _, tile in pairs(tiles) do
    local here = surface.find_entities_filtered {
      position = centre(tile.x, tile.y), radius = 0.4, name = what, limit = 1,
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
      --
      -- 실측: (74,-12) 가 막혔다고 나왔는데 why 에 적힌 것은 "iron-ore"
      -- 였다. 그런데 진짜 막은 것은 그 위에 선 burner-mining-drill 이었다
      -- (2x2 라 자기 몸 옆칸까지 먹는다). 광맥은 벨트를 막지 않는다 - 벨트는
      -- 광맥 «위에» 깔린다. 그 칸이 막힌 이유는 항상 광맥이 아닌 다른
      -- 무엇이다. `pairs()` 순서가 정해져 있지 않아 광맥이 먼저 걸리면
      -- 엉뚱한 이름이 적혔다. resource 타입은 애초에 후보에서 뺀다.
      local why, sweepable, lift = nil, true, nil
      for _, e in pairs(surface.find_entities_filtered {
        position = centre(tile.x, tile.y), radius = 0.4,
      }) do
        if e.type ~= "character" and e.type ~= "item-entity"
           and e.type ~= "resource" then
          why, sweepable = e.name, false
          -- 「못 놓는다」와 「치우면 놓는다」를 가른 것과 같은 이유로,
          -- 「걷어내면 놓는다」도 갈라야 한다. 우리 상자가 한 칸 앉아
          -- 있다고 간선 전체가 영원히 안 깔리는 일이 실제로 있었다 -
          -- 석탄줄 y=76 위에 상자가 여섯 개였고 벨트는 0칸이었다.
          if LIFTABLE[e.name] and e.minable and e.force == force then
            lift = e.name
          elseif e.minable and (e.type == "tree" or e.type == "simple-entity") then
            -- 사용자: "나무가 진로방해 / 건설방해 가 된다면 벌목도
            --          어느정도 하도록"
            --
            -- 나무와 바위는 우리 것이 아니라 force 가 neutral 이다. 그래서
            -- 위의 「우리 상자면 걷는다」에 안 걸리고 바위처럼 «영영 막힌
            -- 칸»으로 남았다. 그런데 둘 다 도끼 몇 번이면 사라진다.
            --
            --     치우면 되는 것을 「못 놓는다」로 적으면 길이 영영 안 난다.
            --
            -- 걷는 일은 demolish 가 이미 할 줄 안다 - 그쪽은 force 를
            -- 안 따지도록 일부러 그렇게 두었다(control 주석 참고).
            lift = e.name
          end
          break
        end
      end
      if sweepable then
        out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir, sweep = true }
      elseif lift then
        out[#out + 1] = { x = tile.x, y = tile.y, dir = tile.dir, lift = lift }
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
local function route_for(key, surface, force, from, goal, guard)
  storage.lines = storage.lines or {}
  local kept = storage.lines[key]
  if kept and kept.plan == PLAN and kept.goal
     and kept.goal.x == goal.x and kept.goal.y == goal.y
     and kept.tiles and #kept.tiles > 0 then
    return kept.tiles, kept.short, kept.bends
  end
  local start = open_spot(surface, force, from, guard)
  local tiles, short, bends = walk(surface, force, start, goal, guard)
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
local function repair(surface, force, tiles, guard)
  local fixed, patched = {}, 0
  local i = 1
  while i <= #tiles do
    local blocked = false
    local here = surface.find_entities_filtered {
      position = centre(tiles[i].x, tiles[i].y), radius = 0.4, force = force,
    }
    for _, e in pairs(here) do
      if e.name ~= BELT and e.type ~= "character" and e.type ~= "item-entity" then
        blocked = true
      end
    end
    -- guard 는 아직 아무것도 안 섰어도 막는다 - 제련 기둥의 줄은 «비어
    -- 있어도» 남의 것이 아니다.
    if not blocked and not passable(surface, force, tiles[i].x, tiles[i].y, guard) then
      blocked = true
    end

    if not blocked then
      fixed[#fixed + 1] = tiles[i]
      i = i + 1
    else
      -- 막힌 구간의 끝을 찾는다.
      local j = i
      while j <= #tiles do
        if passable(surface, force, tiles[j].x, tiles[j].y, guard) then break end
        j = j + 1
      end
      local before = fixed[#fixed]
      local after = tiles[j]
      if not before or not after then
        -- 처음이나 끝이 막혔으면 잘라낸다. 줄이 조금 짧아질 뿐이다.
        i = j + 1
      else
        local detour = walk(surface, force, before, after, guard)
        if not detour or #detour == 0 then return nil end
        -- detour 는 before -> after 순서다. 첫 칸(before)은 이미 넣었다.
        for n = 2, #detour do fixed[#fixed + 1] = detour[n] end
        -- 돌아온 «그 칸»(tiles[j] = after)도 넣는다.
        --
        -- `walk` 은 마지막 칸을 반드시 지운다 - 「그 칸은 내리는 줄이
        -- 맡는다」가 그 자리의 규칙이기 때문이다. 그런데 여기서는 내리는
        -- 줄이 없다. 그냥 길 한가운데다.
        --
        -- 그래서 우회로를 붙일 때마다 이은 자리에 정확히 한 칸 구멍이
        -- 났고, 그 구멍이 `storage.lines` 에 덮어쓰여 «계획의 일부»가
        -- 됐다. 다음 repair 에서는 목록에 없으니 막힌 칸으로도 안 잡히고,
        -- 남은 칸 수는 0 으로 보고된다 - 끊긴 벨트가 「완성」으로 집계됐다.
        if not (fixed[#fixed] and fixed[#fixed].x == after.x
                and fixed[#fixed].y == after.y) then
          fixed[#fixed + 1] = { x = after.x, y = after.y, dir = after.dir }
        end
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

  -- 창고 구역은 제련 구역과 겹칠 수 있다(실측: smelt={x=25,y=14,w=38,h=16},
  -- depot={x=50,y=15,w=12,h=5} - 창고가 제련 구역 «안»이었다). depot_rows 는
  -- 이것을 모르고 제 격자를 그대로 깐다. 겹친 칸은 제련 기둥이 이미 쓰는
  -- 자리이니 여기서는 계획에서 뺀다 - 걷어내지는 않는다, 그건 따로 시킨다.
  local guard = smelt_guard(here.smelt)
  into = drop_guarded(into, guard)
  fill = drop_guarded(fill, guard)
  bank = drop_guarded(bank, guard)
  draw = drop_guarded(draw, guard)
  out = drop_guarded(out, guard)

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
  -- 제련 기둥의 벨트 줄·팔 줄은 이 길이 밟고 지나가도 되는 땅이 아니다 -
  -- 그 줄은 feed_line 자신의 것이다. smelt_guard 참고.
  local guard = smelt_guard(smelt)
  local trunk, short, bends = route_for("ore", surface, force, start, head, guard)
  if not trunk then
    return { error = "no route from the mine to the smelter" }
  end
  -- 길 위에 무언가 새로 섰으면 그 자리만 고쳐서 다시 적어둔다.
  local mended, patches = repair(surface, force, trunk, guard)
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
  -- 여기도 마찬가지로 제련 기둥의 줄을 밟고 지나가면 안 된다.
  local guard = smelt_guard(here.smelt)
  local trunk, short, bends = route_for("plate", surface, force,
    { x = goal.x, y = goal.y }, aim, guard)
  if not trunk then return { error = "no route from the smelter to the shop" } end
  local mended, patches = repair(surface, force, trunk, guard)
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

  -- 좌표 규약을 «줄기와 같게» 맞춘다.
  --
  -- 여기 있던 것은 (along, best+0.5) 처럼 반칸 좌표였다. 그것은 벨트
  -- «엔티티의 자리»고, 길 찾기가 쓰는 것은 «칸 번호»다. 둘은 같은 칸을
  -- 가리키지만 적는 법이 다르다.
  --
  -- 그래서 등뼈 끝과 줄기 첫 칸이 «영원히 이웃이 아니었다». 두 좌표의
  -- 차가 늘 ±0.5 나 ±1.5 라, 대각선을 메우는 `stitch` 의 |dx|==1 이
  -- 성립할 수 없다. 부르기는 하는데 아무 일도 안 하고 있었다.
  --
  -- 파생이 더 나빴다. `dir_of` 는 x 를 먼저 보는데 dx 가 0 이 될 수
  -- 없으므로 north/south 를 돌려줄 수 없다 - 줄기 첫 칸이 위나 아래면
  -- 광석이 밭 «안쪽»으로 거꾸로 밀린다.
  --
  -- 칸 번호로 내린다. floor 면 된다 - 반칸 좌표가 가리키던 그 칸이다.
  local tiles = {}
  for along = from, to do
    local n = math.floor(along)
    tiles[#tiles + 1] = wide and { x = n, y = best } or { x = best, y = n }
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
  -- 밭에서 오는 줄도 제련 기둥의 줄을 밟고 지나가면 안 된다.
  local guard = smelt_guard(here.smelt)
  local parts, first_from = {}, nil

  for n = 1, math.min(#fields, 3) do
    local field = fields[n]
    local drills = surface.find_entities_filtered {
      area = { { field.left - 3, field.top - 3 },
               { field.right + 3, field.bottom + 3 } },
      type = "mining-drill", force = force,
    }
    if #drills > 0 then
      storage.lines = storage.lines or {}
      -- 밭은 조금씩 움직인다. 그래도 «같은 밭»이다.
      --
      -- 벨트 미로가 이번으로 «네 번째»다. 지난번에 열쇠에서 「채굴기 수」를
      -- 뺐는데, 열쇠에 쓰는 «무게중심»이 채굴기가 늘고 줄 때마다 같이
      -- 움직인다는 것을 못 봤다. 규칙을 넣어놓고 같은 일이 다른 문으로
      -- 들어왔다.
      --
      -- 실측(69분째). 채굴기가 아홉에서 여섯으로 줄자 이랬다:
      --
      --     f1  5/48   ->   f1  0/53
      --
      -- 길이가 달라지고, 이미 깔아둔 다섯 칸이 「길 밖」이 됐다. 그러면
      -- 무리는 그것을 걷어 다시 깐다.
      --
      -- 자리로 찾지 말고 «가까움»으로 찾는다. 스물네 타일 안에 저장된
      -- 밭이 있으면 그것이 이 밭이다 - 밭을 나누는 간격이 그만큼이므로,
      -- 그 안에 두 밭이 따로 있을 수 없다.
      local key, kept = nil, nil
      for k, entry in pairs(storage.lines) do
        local kx, ky = string.match(k, "^field:(-?%d+),(-?%d+)$")
        if kx then
          local dx, dy = tonumber(kx) - field.x, tonumber(ky) - field.y
          if dx * dx + dy * dy <= SAME_FIELD * SAME_FIELD then
            key, kept = k, entry
            break
          end
        end
      end
      key = key or ("field:" .. math.floor(field.x) .. "," .. math.floor(field.y))
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
        local mended, patches = repair(surface, force, tiles, guard)
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
          local stem = walk(surface, force, exit_at, head, guard)

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
          -- 등뼈 끝과 줄기 첫 칸이 대각선으로 만날 수 있다. 줄기는 밭
          -- «근처»까지만 오지 밭 끝 칸에 딱 붙어 오지는 않기 때문이다.
          tiles = stitch(surface, force, tiles, guard)

          -- 등뼈는 채굴기 «떨구는 자리»만 보고 긋는다 - 그 사이 칸까지
          -- 지나가도 되는지는 안 본다. 그런데 채굴기는 2x2 라 떨구는 자리
          -- 옆칸까지 제 몸으로 먹는다. 그 옆칸이 등뼈 줄 위에 있으면
          -- 등뼈가 «갓 놓일 때부터» 막혀 있다.
          --
          -- ore/plate 흐름은 route_for 뒤에 늘 repair 를 한 번 돌린다.
          -- 여기는 kept 가 있을 때만 돌렸다 - 그래서 «처음 긋는» 등뼈는
          -- repair 를 한 번도 안 거치고 그대로 storage.lines 에 박혔다.
          -- 실측: (74,-12) 가 stuck 이었는데 그 칸을 먹은 것은
          -- burner-mining-drill 이었다. repair 는 그 칸만 우회할 수
          -- 있으니, 처음 긋는 길에도 똑같이 돌린다. guard 를 같이 넘겨
          -- 제련 기둥의 줄도 같은 김에 피해 간다.
          local mended, patches = repair(surface, force, tiles, guard)
          if mended and patches and patches > 0 then
            tiles = mended
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

-- 흐름 넷을 한 번에 훑는 것은 «무거운» 일이다.
--
-- 사용자: "게임이 중간중간 멈추듯 끊기는 느낌은 뭐지"
--
-- 우리가 멈추고 있었다. 실측:
--
--     flows      1,374 ms
--     그 밖 대부분   30~36 ms
--
-- `/silent-command` 는 게임 틱 «위에서» 동기로 돈다. 1.4초짜리 조회 하나는
-- 게임을 1.4초 멈춘다는 뜻이다. 그리고 `line_job` 이 순찰마다 요원 수만큼
-- 부르므로, 다섯이면 한 순찰에 칠 초가 얼어붙는다.
--
-- 무거운 까닭은 흐름마다 길을 다시 재기 때문이다. 길이 얼어 있어도 「아직
-- 없는 것」을 세려면 칸마다 게임에 물어야 하고, 그것이 사백 칸이면 사백 번이다.
--
-- 그런데 이 답은 «몇 초 사이에 달라지지 않는다». 요원 다섯이 같은 순찰에
-- 묻는 답은 같은 답이다. 그러니 한 번 재고 잠깐 기억한다.
local FLOWS_TTL = 60 * 3   -- 3초

local function flows(name, limit)
  storage.flow_memo = storage.flow_memo or {}
  local memo = storage.flow_memo[limit or 0]
  if memo and game.tick - memo.tick < FLOWS_TTL then
    return memo.answer
  end
  local out = {}
  for _, one in ipairs(FLOWS) do
    local answer = one.plan(name, limit)
    out[#out + 1] = {
      flow = one.flow, error = answer.error,
      left = answer.left, standing = answer.standing, want = answer.want,
      from = answer.from, head = answer.head,
    }
  end
  local answer = { flows = out }
  storage.flow_memo[limit or 0] = { tick = game.tick, answer = answer }
  return answer
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
  -- 얼려둔 길을 «전부» 센다.
  --
  -- 여기는 `storage.ore_line` 을 읽고 있었다. 그런데 길을 저장하는 자리가
  -- `storage.lines[key]` 로 옮겨간 뒤로 그 이름에 쓰는 곳은 하나도 없다.
  -- 읽기 한 곳, 쓰기 영. 그러니 kept 는 «언제나» nil 이었다.
  --
  -- 그 값이 컸다. 간선도 밭 줄도 유통 줄도 전부 「길 밖」으로 분류되어,
  -- 무리가 방금 깐 벨트를 다음 순찰에 스스로 뜯었다. 로그의 「길 위에
  -- 없는 벨트 N칸이 버려져 있습니다」가 그것이다.
  for _, kept in pairs(storage.lines or {}) do
    if kept.plan == PLAN then
      for _, tile in pairs(kept.tiles or {}) do
        mine_route[math.floor(tile.x) .. ":" .. math.floor(tile.y)] = true
      end
    end
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

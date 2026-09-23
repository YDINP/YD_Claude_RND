-- Reflex: a character that gets hit drops everything and runs from the hitter.
--
--     사용자: "항상 적을 발견하면 도망가는걸 최우선으로 체크해야함."
--
-- 지금까지 «도망»은 파이썬 고리(danger.py, scout/fogwalk 의 walk_watch)가
-- 6~10초마다 물어서 시켰다. 고리가 꺼져 있으면(작전 중 껐다), 고리가 죽었으면
-- (배포 뒤 소켓), 고리가 그 사람을 안 보고 있으면(hotel 귀환) 아무도 안 부른다.
-- alpha 와 hotel 이 그렇게 죽었다.
--
-- 반사는 게임 틱 안에 있다. 맞는 순간 큐를 버리고 공격자 반대쪽으로 FLEE 칸
-- 걷는 일을 «맨 앞»에 넣는다. 고리는 그 다음이다 - 두 번째 벨트.
--
--   * 적 세력의 피해만. 자기 수류탄·화재 같은 것은 반사가 아니다.
--   * 방향은 «가장 가까운 우리 포탑». 추격하는 바이터는 사람보다 빨라서
--     «반대쪽으로»는 못 따돌린다 - alpha 는 그렇게 여덟 번 튀며 적진 깊숙이
--     밀려 들어가 (263,153) 에서 죽었다. 포탑 곁이 유일한 안전이다: 쫓아온
--     것을 포탑이 쏜다. 포탑이 GUNS 안에 없을 때만 공격자 반대쪽.
--   * COOLDOWN 동안은 다시 안 튄다 - 맞을 때마다 목적지를 바꾸면 제자리다.
--   * 무엇을 하다 튀었는지는 태스크 결과("fled: hit by ...")와 status.fled 에 남는다.

local Runner = require("runner")
local Tasks = require("tasks")

local Reflex = {}

local FLEE = 45                 -- 이만큼 물러난다 (대형 웜 사거리 38 보다 길게)
local COOLDOWN = 60 * 6         -- 한 번 튀면 이 동안은 다시 안 튄다 (틱). 이 동안 총이 있으면 쏜다
local LOOK = 60                 -- cause 가 없을 때 적을 찾는 반지름
local GUNS = 220                -- 이 안의 우리 포탑으로 달린다

local function nearest_gun(e)
  local best, bd = nil, GUNS * GUNS
  local guns = e.surface.find_entities_filtered{ name = "gun-turret", force = e.force,
                                                 position = e.position, radius = GUNS }
  for _, t in pairs(guns) do
    local dx, dy = t.position.x - e.position.x, t.position.y - e.position.y
    local d = dx * dx + dy * dy
    if d < bd and d > 4 then
      best, bd = t.position, d
    end
  end
  return best
end

local function agent_of(entity)
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    if a and a.char and a.char.valid and a.char == entity then return name, a end
  end
  return nil, nil
end

function Reflex.on_damaged(event)
  local e = event.entity
  if not (e and e.valid and e.type == "character") then return end
  if event.force and event.force.name ~= "enemy" then return end
  local name, a = agent_of(e)
  if not a then return end

  local tick = game.tick
  a.flee = a.flee or { until_tick = 0, count = 0 }
  if a.flee.until_tick > tick then return end

  local cause = event.cause
  local from, by = nil, "enemy"
  if cause and cause.valid then
    from, by = cause.position, cause.name
  else
    local foe = e.surface.find_nearest_enemy{ position = e.position, max_distance = LOOK, force = e.force }
    if foe then from, by = foe.position, foe.name end
  end

  Runner.drop_queue(a, "fled: hit by " .. by)
  if a.current then
    a.current.error = "fled: hit by " .. by
    Runner.finish(a, a.current, "failed")
  end

  local goal = nil
  local gun = nearest_gun(e)
  if gun then
    -- 포탑 «곁» (2칸 앞) 에 선다. 포탑 위에 서려 하면 길찾기가 막힌다.
    local dx, dy = e.position.x - gun.x, e.position.y - gun.y
    local span = math.max(1, math.sqrt(dx * dx + dy * dy))
    goal = { x = gun.x + dx / span * 2.5, y = gun.y + dy / span * 2.5 }
    by = by .. " -> gun " .. string.format("%.0f,%.0f", gun.x, gun.y)
  elseif from then
    local dx, dy = e.position.x - from.x, e.position.y - from.y
    local span = math.max(1, math.sqrt(dx * dx + dy * dy))
    goal = { x = e.position.x + dx / span * FLEE, y = e.position.y + dy / span * FLEE }
  end
  if goal then
    table.insert(a.queue, 1, Runner.make_task("walk_to", { x = goal.x, y = goal.y }))
  end

  a.flee.until_tick = tick + COOLDOWN
  a.flee.count = a.flee.count + 1
  a.flee.last = { tick = tick, x = e.position.x, y = e.position.y, by = by,
                  to_x = goal and goal.x or nil, to_y = goal and goal.y or nil }
  log(string.format("ai-bridge: %s hit by %s at %.0f,%.0f - flees%s", name, by,
      e.position.x, e.position.y, goal and string.format(" to %.0f,%.0f", goal.x, goal.y) or ""))
end

-- 튀는 동안 총이 있으면 쫓아오는 것을 쏜다. 걸으면서도 쏜다.
local SHOOT_RANGE = 17

function Reflex.tick()
  local tick = game.tick
  for _, name in ipairs(storage.order) do
    local a = storage.agents[name]
    local b = a and a.char
    if b and b.valid and a.flee and a.flee.until_tick > tick and Tasks.armed(b) then
      local foe = b.surface.find_nearest_enemy{ position = b.position, max_distance = SHOOT_RANGE, force = b.force }
      if foe then
        b.shooting_state = { state = defines.shooting.shooting_selected, position = foe.position }
      else
        Tasks.cease(b)
      end
    elseif b and b.valid and a.flee and a.flee.until_tick == tick then
      Tasks.cease(b)
    end
  end
end

return Reflex

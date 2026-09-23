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
--   * 방향은 공격자(cause) 반대. cause 가 없으면(산성 웅덩이 등) 가장 가까운
--     적 반대. 그것도 없으면 큐만 버리고 선다.
--   * COOLDOWN 동안은 다시 안 튄다 - 맞을 때마다 목적지를 바꾸면 제자리다.
--   * 무엇을 하다 튀었는지는 태스크 결과("fled: hit by ...")와 status.fled 에 남는다.

local Runner = require("runner")

local Reflex = {}

local FLEE = 45                 -- 이만큼 물러난다 (대형 웜 사거리 38 보다 길게)
local COOLDOWN = 60 * 6         -- 한 번 튀면 이 동안은 다시 안 튄다 (틱)
local LOOK = 60                 -- cause 가 없을 때 적을 찾는 반지름

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
  if from then
    local dx, dy = e.position.x - from.x, e.position.y - from.y
    local span = math.max(1, math.sqrt(dx * dx + dy * dy))
    goal = { x = e.position.x + dx / span * FLEE, y = e.position.y + dy / span * FLEE }
    table.insert(a.queue, 1, Runner.make_task("walk_to", { x = goal.x, y = goal.y }))
  end

  a.flee.until_tick = tick + COOLDOWN
  a.flee.count = a.flee.count + 1
  a.flee.last = { tick = tick, x = e.position.x, y = e.position.y, by = by,
                  to_x = goal and goal.x or nil, to_y = goal and goal.y or nil }
  log(string.format("ai-bridge: %s hit by %s at %.0f,%.0f - flees%s", name, by,
      e.position.x, e.position.y, goal and string.format(" to %.0f,%.0f", goal.x, goal.y) or ""))
end

return Reflex

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

-- 웜 곁의 포탑은 피난처가 아니다.
--
-- 실측(21회차 동쪽 밀기): hotel 이 중형 웜(132,77)에 맞자 반사가 «가장 가까운
-- 포탑» (110,80) 으로 보냈다 - 방금 세운 밀기 열이라 웜에서 22칸, 사거리 30 안.
-- 도망친 자리에서 죽었다. 밀기 열은 애초에 웜 곁에 세우는 것이다.
-- 그래서 적 구조물(웜·둥지)에서 SAFE 칸 안의 포탑은 고르지 않는다.
local SAFE = 45                 -- 대형 웜 38 + 여유

local function near_foe(surface, pos, r)
  return surface.count_entities_filtered{ type = { "turret", "unit-spawner" }, force = "enemy",
                                          position = pos, radius = r, limit = 1 } > 0
end

-- «가장 가까운 안전한 포탑»만으로는 모자랐다.
--
-- 실측(21회차 회랑 무리): bravo 가 (183,133) 에서 소형 웜에 맞자 반사가 (248,101)
-- 포탑을 골랐다 - 적 구조물 45칸 밖이니 «안전»했다. 그러나 그것은 둥지 «건너편»
-- 이었고 탄약도 없는 옛 사슬 포탑이었다. bravo 는 둥지 한복판을 가로질러 뛰다 죽었다.
--
--     피난처는 자리만이 아니라 «가는 길»이다.
--
-- 그래서 넷을 다 본다: 탄약이 있나 · 적 구조물 SAFE 밖인가 · 공격자의 «반대쪽»인가 ·
-- 가는 길(처음 LEAVE 칸 뒤)이 적 구조물 PATH 안을 안 지나나.
local PATH = 30                 -- 중형 웜 사거리
local LEAVE = 16                -- 맞은 자리 곁은 어차피 사거리 안이다 - 거기부터 잰다

local function has_ammo(t)
  local inv = t.get_inventory(defines.inventory.turret_ammo)
  return inv and not inv.is_empty()
end

local function clear_path(surface, a, b)
  local dx, dy = b.x - a.x, b.y - a.y
  local len = math.sqrt(dx * dx + dy * dy)
  local d = LEAVE
  while d < len do
    if near_foe(surface, { x = a.x + dx / len * d, y = a.y + dy / len * d }, PATH) then return false end
    d = d + 8
  end
  return true
end

local function nearest_gun(e, from)
  local cands = {}
  local here = e.position
  local guns = e.surface.find_entities_filtered{ name = "gun-turret", force = e.force,
                                                 position = here, radius = GUNS }
  for _, t in pairs(guns) do
    local dx, dy = t.position.x - here.x, t.position.y - here.y
    local d = dx * dx + dy * dy
    -- 공격자 쪽(내적 < 0)은 뺀다: 포탑으로 가는 길이 공격자를 지난다
    local away = (not from) or (dx * (here.x - from.x) + dy * (here.y - from.y) >= 0)
    if d > 4 and away and has_ammo(t) then cands[#cands + 1] = { pos = t.position, d = d } end
  end
  table.sort(cands, function(p, q) return p.d < q.d end)
  for i = 1, math.min(#cands, 40) do
    local pos = cands[i].pos
    if not near_foe(e.surface, pos, SAFE) and clear_path(e.surface, here, pos) then return pos end
  end
  return nil
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
  local gun = nearest_gun(e, from)
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

"""작은 전봇대 공급 + 레이저용 전자회로 - 상주 60초 (resource-expansion-plan 8절 «작은 전봇대 조립기 신설 필요»).

2026-09-28 01:20 실측: 망 2 작은 전봇대 1, 만드는 조립기 0. 나무 182 · 구리판 1,382 · 구리선 0.
  구리선 조립기 (-14.5,-70.5) 출력 200 (옆 회로 조립기 (-18.5,-70.5)가 먹고도 남음).
  전자회로: 망 0. 회로는 벨트 (-9.5,-17.5) -> y=-16.5/-11.5 동향 -> x=37.5 남향 -> 처리장치 (33.5,1.5) 줄에 약 300개 꽉 차 있고
  (칸당 4), 원천 조립기 (-10.5,-21.5) · (9.5,-8.5) 가 full_output. 상자에 쌓인 회로는 0.

하는 일
  POLE : (한 번) 구리선 조립기 옆 빈 전기·망 2 자리에 조립기 1 유령 (레시피 small-electric-pole). 로봇이 망 재고 AM1 로 짓는다.
         나무는 망 저장에서 Lua 로 10씩, 구리선은 Lua 로 (-14.5,-70.5) 출력에서 옮김 (50 남김).
         완성품은 망 2 저장 상자로. 망 재고 + 출력이 TARGET(100) 이면 먹이를 끊고 쉰다.
         전봇대 목표를 채운 뒤 copperroute23 지하 유령이 망 재고보다 많으면 같은 조립기로 지하 벨트를 만든다
         (철 10 · 벨트 5 는 망 저장에서 Lua 로), 끝나면 전봇대 레시피로 돌아간다.
         중형 전봇대는 쇠막대 4 · 강철 2 · 구리 2 로 사슬이 길어 쓰지 않는다 (작은 것 2개 = 나무 1 + 구리 1).
  EC   : 원천 조립기가 full_output 일 때만 (= 벨트가 꽉 참) 회로 벨트에서 50 남기고 한 번 40 까지 망 2 저장으로. 망 회로 상한 100.
Guiltyring 소유 엔티티에서는 꺼내지 않는다. force.chart 없음.

    nohup python -u scripts/polefeed23.py > state/polefeed23.log 2>&1 &
    python -u scripts/polefeed23.py --once --dry
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

ANCHOR = (-14.5, -70.5)          # 구리선 조립기 (출처)
CABLE_SRC = [((-14.5, -70.5), 50)]
TARGET = 100
EC_BELT = ((-11, -19), (41, 6))   # 회로 벨트 (처리장치 줄까지)
EC_GATE = [(-10.5, -21.5), (9.5, -8.5)]
EC_KEEP, EC_MAX, EC_CAP = 50, 40, 100

LUA = r"""(function()
local s = game.surfaces[1]
local GR = 'Guiltyring'
local DRY = %(dry)s
local A = {x = %(ax)s, y = %(ay)s}
local o = {}
local function mine(e) return not (e.last_user and e.last_user.name == GR) end
local net for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
if not net then o.state = 'nonet' return o end
local stores = {}
for _, c in pairs(net.storages) do if c.position.y > -110 then
  local f = c.get_filter and c.get_filter(1) stores[#stores + 1] = {c = c, f = f and f.name} end end
local function store(item, n)
  local left = n
  for _, sc in pairs(stores) do
    if left <= 0 then break end
    if not sc.f or sc.f == item then left = left - sc.c.insert{name = item, count = left} end
  end
  return n - left
end
local function pnet(p)
  local m = s.find_logistic_network_by_position(p, 'player') return m and m.network_id == 2
end
local function cov(p)
  for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', position = p, radius = 12}) do
    local r = e.prototype.get_supply_area_distance()
    if math.abs(e.position.x - p.x) < r + 1.5 and math.abs(e.position.y - p.y) < r + 1.5 then return true end
  end
  return false
end

-- 1. 전봇대 조립기 찾기 / 유령
local asm, ghost
for _, a in pairs(s.find_entities_filtered{type = 'assembling-machine', position = A, radius = 20}) do
  local r = a.get_recipe() if r and (r.name == 'small-electric-pole' or r.name == 'underground-belt') and mine(a) then asm = a break end
end
if not asm then
  for _, g in pairs(s.find_entities_filtered{ghost_type = 'assembling-machine', position = A, radius = 20}) do
    local ok, r = pcall(function() return g.get_recipe() end)
    if ok and r and r.name == 'small-electric-pole' then ghost = g break end
  end
end
local poles = net.get_item_count('small-electric-pole')
o.pole_net = poles
if not asm and not ghost and poles < %(target)d then
  local best
  for R = 3, 14 do
    for dx = -R, R do for dy = -R, R do
      if not best and (math.abs(dx) == R or math.abs(dy) == R) then
        local p = {x = A.x + dx, y = A.y + dy}
        local clear = s.count_entities_filtered{area = {{p.x - 1.5, p.y - 1.5}, {p.x + 1.5, p.y + 1.5}}, type = {'resource'}, invert = true} == 0
        if clear and s.can_place_entity{name = 'assembling-machine-1', position = p, force = 'player'} and cov(p) and pnet(p) then best = p end
      end
    end end
    if best then break end
  end
  if not best then o.state = 'nospot'
  elseif DRY then o.state = 'dry' o.spot = {best.x, best.y}
  else
    local g = s.create_entity{name = 'entity-ghost', inner_name = 'assembling-machine-1', position = best, force = 'player'}
    local ok = pcall(function() g.set_recipe('small-electric-pole') end)
    o.state = ok and 'ghost+recipe' or 'ghost' o.spot = {g.position.x, g.position.y}
  end
elseif ghost then o.state = 'ghost' o.spot = {ghost.position.x, ghost.position.y}
elseif asm then
  o.spot = {asm.position.x, asm.position.y}
  local out = asm.get_output_inventory()
  for _, it in pairs({'small-electric-pole', 'underground-belt'}) do
    local made = out.get_item_count(it)
    if made > 0 and not DRY then local k = store(it, made) if k > 0 then out.remove{name = it, count = k} o.moved = (o.moved or 0) + k end end
  end
  poles = net.get_item_count('small-electric-pole') + out.get_item_count('small-electric-pole')
  o.pole_net = poles
  -- 전봇대 목표를 채웠고 구리 경로 지하 유령이 재고보다 많으면 지하 벨트를 잠깐 만든다
  local ugneed = s.count_entities_filtered{ghost_name = 'underground-belt', area = %(ugarea)s} - net.get_item_count('underground-belt')
  local want = (poles >= %(target)d and ugneed > 0) and 'underground-belt' or 'small-electric-pole'
  o.ugneed = ugneed
  if asm.get_recipe().name ~= want and not DRY then
    local back = asm.set_recipe(want)
    for name, cnt in pairs(back or {}) do
      local nm = type(cnt) == 'table' and cnt.name or name local c = type(cnt) == 'table' and cnt.count or cnt
      if type(nm) == 'string' and c > 0 then store(nm, c) end
    end
    o.recipe = want
  end
  local inv = asm.get_inventory(defines.inventory.assembling_machine_input)
  if asm.get_recipe().name == 'underground-belt' then
    o.state = 'ug'
    if not DRY then
      for _, w in pairs({{'iron-plate', 10}, {'transport-belt', 5}}) do
        local k = w[2] - inv.get_item_count(w[1])
        if k > 0 and net.get_item_count(w[1]) >= k then
          local got = net.remove_item{name = w[1], count = k}
          if got > 0 then local put = inv.insert{name = w[1], count = got} if put < got then store(w[1], got - put) end end
        end
      end
    end
  elseif poles >= %(target)d then o.state = 'idle'
  elseif not DRY then
    o.state = 'feed'
    -- 구리선: 출처 출력에서 직접 (남길 양 지킴)
    if inv.get_item_count('copper-cable') < 20 then
      for _, t in pairs({%(cable)s}) do
        local src = s.find_entities_filtered{type = 'assembling-machine', position = t[1], radius = 0.5}[1]
        if src and mine(src) then
          local so = src.get_output_inventory()
          local k = math.min(40, so.get_item_count('copper-cable') - t[2])
          if k > 0 then k = inv.insert{name = 'copper-cable', count = k} if k > 0 then so.remove{name = 'copper-cable', count = k} o.cable = (o.cable or 0) + k end end
        end
      end
    end
    -- 나무: 망 저장에서 Lua 로 (로봇 배달은 건설 로봇이 바빠 느리다)
    if inv.get_item_count('wood') < 5 and net.get_item_count('wood') >= 10 then
      local got = net.remove_item{name = 'wood', count = 10}
      if got > 0 then local put = inv.insert{name = 'wood', count = got} if put < got then store('wood', got - put) end o.wood_req = put end
    end
  end
  for k, v in pairs(defines.entity_status) do if v == asm.status then o.st = k end end
  o.inv = {wood = inv.get_item_count('wood'), cable = inv.get_item_count('copper-cable'), iron = inv.get_item_count('iron-plate'), belt = inv.get_item_count('transport-belt')}
end

-- 2. 전자회로: 원천이 full_output 일 때만 벨트에서
local gate = false
for _, p in pairs({%(gate)s}) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1]
  if a and a.status == defines.entity_status.full_output then gate = true end
end
local lines, tot = {}, 0
for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, area = %(ecarea)s}) do
  if mine(b) then for li = 1, b.get_max_transport_line_index() do
    local l = b.get_transport_line(li) local n = l.get_item_count('electronic-circuit')
    if n > 0 then lines[#lines + 1] = l tot = tot + n end end end
end
o.ec_belt = tot o.ec_gate = gate
local ecn = net.get_item_count('electronic-circuit')
if gate and not DRY and ecn < %(eccap)d then
  local want = math.min(%(ecmax)d, tot - %(eckeep)d, %(eccap)d - ecn)
  for _, l in pairs(lines) do
    if want <= 0 then break end
    local k = math.min(want, l.get_item_count('electronic-circuit'))
    k = store('electronic-circuit', k)
    if k > 0 then l.remove_item{name = 'electronic-circuit', count = k} want = want - k o.ec_moved = (o.ec_moved or 0) + k end
  end
end
o.ec_net = net.get_item_count('electronic-circuit')
o.wood_net = net.get_item_count('wood') o.cable_net = net.get_item_count('copper-cable')
return o end)()"""


def build(dry: bool) -> str:
    return LUA % {
        "dry": "true" if dry else "false", "ax": ANCHOR[0], "ay": ANCHOR[1], "target": TARGET,
        "cable": ", ".join("{{%s, %s}, %d}" % (p[0], p[1], k) for p, k in CABLE_SRC),
        "gate": ", ".join("{%s, %s}" % p for p in EC_GATE),
        "ecarea": "{{%s, %s}, {%s, %s}}" % (EC_BELT[0] + EC_BELT[1]),
        "ugarea": "{{-44, -114}, {-43, -104}}",
        "eckeep": EC_KEEP, "ecmax": EC_MAX, "eccap": EC_CAP}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry", action="store_true", help="유령·옮김 없이 상태만")
    ap.add_argument("--every", type=float, default=60)
    a = ap.parse_args()
    ai = AIBridge()
    lua = build(a.dry)
    while True:
        try:
            r = ai.lua(lua)
            print(time.strftime("%H:%M:%S"), "전봇대", r.get("state"), r.get("spot"), r.get("st", ""),
                  f"망={r.get('pole_net')} 옮김={r.get('moved', 0)} 선+={r.get('cable', 0)} 나무+={r.get('wood_req', 0)} 입력={r.get('inv')}",
                  f"| 회로 벨트={r.get('ec_belt')} 막힘={r.get('ec_gate')} 옮김={r.get('ec_moved', 0)} 망={r.get('ec_net')}",
                  f"| 나무={r.get('wood_net')} 지하부족={r.get('ugneed')} 레시피변경={r.get('recipe', '-')}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"polefeed: {type(e).__name__}: {e}"[:300], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

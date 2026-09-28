"""대포 포탄 증설 3 단계 (09-28) - 포탄 10분 19 개, 쏘는 대로 소진 -> 목표 10분 60 이상.

실측 (레시피): 포탄 = 폭약 8 + 폭발 포탄 4 + 레이더 1 (15s), 폭발 포탄 = 강철 2 + 플라스틱 2 + 폭약 2 (8s),
폭약 = 석탄 1 + 황 1 + 물 10 -> 2 (4s). 포탄 1 개 = 폭약 16. 폭약 공장이 (-24.5,-70.5) 하나뿐 (10분 최대 300 ->
포탄 18.75) = 지금 19 개와 딱 맞는 병목. 포탄 60 = 폭약 960 · 폭발 포탄 240 · 레이더 60.
재고: 황 상자 (-16.5,-33.5) 1,538 · 망 석탄 ~1,950 · 강철 ~3,400 · 플라스틱 공장 (-21.5,-34.5) 출력 가득 · 레이더 조립기 출력 43.

증설 (기지 동쪽 빈 터 x -14..3, y -67..-58, 망 2 로봇 유령):
  * 물: waterfix23 황 가지 노출 관 (-15.5,-58.5) 에서 동쪽으로 관 10 (y=-58.5, x -14.5..-5.5).
  * 폭약 공장 3 (화학 공장, 남향 = 입력이 남쪽 면) (-12.5/-9.5/-6.5, -60.5) - 입력 칸이 그 관 줄에 붙는다.
  * 제작기 조립기 1 (-10.5,-65.5): 망 조립기 1 로 짓고 Lua 로 망 재고·레이더 줄 회로·톱니 출력만 넣어
    화학 공장 3 · 조립기 1 2 · 조립기 2 3 을 만든다 (아이템을 새로 만들어 내지 않음). 다 만들면 포탄 3 호로 레시피 바꿈.
  * 폭발 포탄 조립기 2 3 대 (-6.5/-2.5/1.5, -65.5). 작은 전봇대 4.
상주 (run, 30 초): 새 폭약 공장 석탄 (망, 300 남김) · 황 (황 상자 -> 망) / 폭발 포탄 (-21.5,-71.5) + 새 3 대 강철 (망) ·
  플라스틱 (플라스틱 공장 출력 20 남김 -> 상자 (4.5,-44.5) -> 망) · 폭약 / 포탄 조립기 3 대 폭약 · 폭발 포탄 · 레이더 /
  포탄 3 호 출력 -> 망 저장 (-60.5,-33.5) (artyaim GUARD 가 대포로). Guiltyring 폭발 포탄 1 호 (-26.5,-66.5) 는 건드리지 않음.

    python -u scripts/shell3_23.py place   # 유령 (멱등)
    python -u scripts/shell3_23.py         # 상주: 제작 -> 급식
"""
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

MAKER = (-10.5, -65.5)
PLANTS = [(-12.5, -60.5), (-9.5, -60.5), (-6.5, -60.5)]
ECS_NEW = [(-6.5, -65.5), (-2.5, -65.5), (1.5, -65.5)]
ECS_ALL = [(-21.5, -71.5)] + ECS_NEW                 # (-26.5,-66.5) 은 Guiltyring 소유 - 제외
SHELLS = [(-22.5, -66.5), (-30.5, -66.5), MAKER]
PLAN = ([("small-electric-pole", x, -63.5, 0, None) for x in (-14.5, -9.5, -4.5, 0.5)]
        + [("pipe", x + 0.5, -58.5, 0, None) for x in range(-15, -5)]
        + [("assembling-machine-1", MAKER[0], MAKER[1], 0, "chemical-plant")]
        + [("chemical-plant", x, y, 8, "explosives") for x, y in PLANTS]
        + [("assembling-machine-2", x, y, 0, "explosive-cannon-shell") for x, y in ECS_NEW])
TARGET = [("chemical-plant", len(PLANTS)), ("assembling-machine-2", len(ECS_NEW))]


def L(v):
    return "{" + ", ".join("{%s, %s}" % p for p in v) + "}"


PLACE = """(function() local s = game.surfaces[1] local o = {placed = 0, have = 0, fail = {}}
  for _, q in pairs({%s}) do local pos = {q[2], q[3]}
    local e = s.find_entities_filtered{name = q[1], position = pos, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = q[1], position = pos, radius = 0.3}[1]
    if e then o.have = o.have + 1
    else e = s.create_entity{name = 'entity-ghost', inner_name = q[1], position = pos, direction = q[4], force = 'player'}
      if e then o.placed = o.placed + 1 else o.fail[#o.fail + 1] = q[1] .. '@' .. q[2] .. ',' .. q[3] end end
    if e and q[5] then pcall(function() if not e.get_recipe() then e.set_recipe(q[5]) end end) end
  end
  return o end)()"""

HEAD = """local s = game.surfaces[1] local net = nil
  for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local function asm(p) return s.find_entities_filtered{type = {'assembling-machine', 'furnace'}, position = p, radius = 0.6}[1] end
  local function inp(a) return a.get_inventory(defines.inventory.assembling_machine_input) end
  local function outp(a) return a.get_inventory(defines.inventory.assembling_machine_output) end
  local function chest(p) local c = s.find_entities_filtered{type = {'container', 'logistic-container'}, position = p, radius = 0.6}[1] return c and c.get_inventory(defines.inventory.chest) end
  -- 출처 목록 (inv, 남길 수) 에서 dst 로 최대 n 옮김, 모자라면 망 (floor 남김)
  local function feed(dst, item, n, srcs, floor)
    local got = 0
    for _, sr in pairs(srcs or {}) do if sr[1] and got < n then
      local k = math.min(n - got, sr[1].get_item_count(item) - (sr[2] or 0))
      if k > 0 then k = dst.insert{name = item, count = k} if k > 0 then sr[1].remove{name = item, count = k} got = got + k end end end end
    if floor and got < n and net then local k = math.min(n - got, net.get_item_count(item) - floor)
      if k > 0 then k = net.remove_item{name = item, count = k} local p = dst.insert{name = item, count = k}
        if p < k then net.insert{name = item, count = k - p} end got = got + p end end
    return got end
"""

MAKE = """(function() """ + HEAD + """
  local o = {}
  local M = asm({%(mx)s, %(my)s}) if not M then return {err = 'no maker'} end
  -- 만든 것 -> 망 저장
  for _, it in pairs(outp(M).get_contents()) do local k = net.insert{name = it.name, count = it.count} if k > 0 then outp(M).remove{name = it.name, count = k} end end
  local cargo = {}
  for _, r in pairs(net.construction_robots) do local ci = r.get_inventory(defines.inventory.robot_cargo)
    if ci then for _, it in pairs(ci.get_contents()) do cargo[it.name] = (cargo[it.name] or 0) + it.count end end end
  local function built(name, spots) local n = 0 for _, p in pairs(spots) do if s.find_entities_filtered{name = name, position = p, radius = 0.3}[1] then n = n + 1 end end return n end
  local dcp = %(ncp)d - built('chemical-plant', %(plants)s) - net.get_item_count('chemical-plant') - (cargo['chemical-plant'] or 0)
  local dam2 = %(nam2)d - built('assembling-machine-2', %(ecs)s) - net.get_item_count('assembling-machine-2') - (cargo['assembling-machine-2'] or 0)
  local am1 = net.get_item_count('assembling-machine-1')
  local pick = nil
  if dcp > 0 then pick = 'chemical-plant' elseif dam2 > 0 and am1 > 0 then pick = 'assembling-machine-2' elseif dam2 > 0 then pick = 'assembling-machine-1' end
  o.dcp, o.dam2, o.am1 = dcp, dam2, am1
  local cur = M.get_recipe() and M.get_recipe().name
  if not pick then
    if cur ~= 'artillery-shell' then local back = M.set_recipe('artillery-shell')
      for _, it in pairs(back or {}) do if it.count and it.count > 0 then net.insert{name = it.name, count = it.count} end end end
    o.done = 1 return o end
  if M.is_crafting() and cur and cur ~= pick then pick = cur end
  if pick ~= cur then local back = M.set_recipe(pick)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then net.insert{name = it.name, count = it.count} end end end
  local I = inp(M)
  local circ = {}
  for _, p in pairs({{-18.5, -70.5}, {-51.5, 3.5}}) do local a = asm(p) if a then circ[#circ + 1] = {outp(a), 0} end end
  local gear = {}
  for _, p in pairs({{-14.5, -66.5}, {-55.5, 7.5}, {-41.5, 7.5}}) do local a = asm(p) if a then gear[#gear + 1] = {outp(a), 0} end end
  -- 톱니 조립기 (-14.5,-66.5) 철 (망 3000 남김) - 레이더 43 개 쌓여 톱니가 남는다
  local G = asm({-14.5, -66.5}) if G then local k = 40 - inp(G).get_item_count('iron-plate') if k > 0 then feed(inp(G), 'iron-plate', k, {}, 3000) end end
  for _, ing in pairs(game.forces.player.recipes[pick].ingredients) do
    local want = ing.amount - I.get_item_count(ing.name)
    if want > 0 then
      local src = (ing.name == 'electronic-circuit' and circ) or (ing.name == 'iron-gear-wheel' and gear) or {}
      local fl = ing.name == 'iron-plate' and 3000 or (ing.name == 'steel-plate' and 500 or 0)
      o[ing.name] = feed(I, ing.name, want, src, fl)
    end
  end
  o.pick = pick o.st = M.status o.prog = math.floor(M.crafting_progress * 100)
  return o end)()"""

RUN = """(function() """ + HEAD + """
  local o = {}
  local sulf = chest({-16.5, -33.5})
  local plast = {}
  do local P = asm({-21.5, -34.5}) if P then plast[#plast + 1] = {outp(P), 20} end end
  do local c = chest({4.5, -44.5}) if c then plast[#plast + 1] = {c, 0} end end
  local xo = {}  -- 새 폭약 공장 출력
  for _, p in pairs(%(plants)s) do local a = asm(p)
    if a then if not a.get_recipe() then a.set_recipe('explosives') end
      local i = inp(a)
      local k = 20 - i.get_item_count('coal') if k > 0 then o.coal = (o.coal or 0) + feed(i, 'coal', k, {}, 300) end
      k = 20 - i.get_item_count('sulfur') if k > 0 then o.sulf = (o.sulf or 0) + feed(i, 'sulfur', k, {{sulf, 0}}, 0) end
      xo[#xo + 1] = {outp(a), 0}
      o.xp = (o.xp or '') .. a.status .. ' '
    end end
  local eo = {}
  for _, p in pairs(%(ecs)s) do local a = asm(p)
    if a then if not a.get_recipe() then a.set_recipe('explosive-cannon-shell') end
      local i = inp(a)
      local k = 10 - i.get_item_count('steel-plate') if k > 0 then o.steel = (o.steel or 0) + feed(i, 'steel-plate', k, {}, 500) end
      k = 10 - i.get_item_count('plastic-bar') if k > 0 then o.plast = (o.plast or 0) + feed(i, 'plastic-bar', k, plast, 50) end
      k = 8 - i.get_item_count('explosives') if k > 0 then o.xe = (o.xe or 0) + feed(i, 'explosives', k, xo) end
      eo[#eo + 1] = {outp(a), 0}
    end end
  local R = asm({-18.5, -66.5}) local ro = R and {{outp(R), 0}} or {}
  for _, p in pairs(%(shells)s) do local a = asm(p)
    if a and a.get_recipe() and a.get_recipe().name == 'artillery-shell' then
      local i = inp(a)
      local k = 16 - i.get_item_count('explosives') if k > 0 then o.xs = (o.xs or 0) + feed(i, 'explosives', k, xo) end
      k = 8 - i.get_item_count('explosive-cannon-shell') if k > 0 then o.ecs = (o.ecs or 0) + feed(i, 'explosive-cannon-shell', k, eo) end
      k = 2 - i.get_item_count('radar') if k > 0 then o.radar = (o.radar or 0) + feed(i, 'radar', k, ro) end
      o.sh = (o.sh or '') .. a.status .. ' '
    end end
  -- 포탄 3 호 출력 -> 망 저장 (-60.5,-33.5)
  local M = asm({%(mx)s, %(my)s})
  if M then local n = outp(M).get_item_count('artillery-shell')
    local c = s.find_entities_filtered{type = 'logistic-container', position = {-60.5, -33.5}, radius = 0.6}[1]
    if n > 0 and c then local put = c.insert{name = 'artillery-shell', count = n} if put > 0 then outp(M).remove{name = 'artillery-shell', count = put} o.out = put end end end
  return o end)()"""


def main() -> int:
    ai = AIBridge()
    items = ", ".join("{'%s', %s, %s, %d, %s}" % (n, x, y, d, ("'%s'" % r) if r else "nil") for n, x, y, d, r in PLAN)
    print(time.strftime("%H:%M:%S"), "유령", ai.lua(PLACE % items), flush=True)
    if sys.argv[1:] == ["place"]:
        return 0
    kw = dict(mx=MAKER[0], my=MAKER[1], plants=L(PLANTS), ecs=L(ECS_NEW), ncp=len(PLANTS), nam2=len(ECS_NEW))
    done, last, n = False, "", 0
    while True:
        try:
            if not done:
                r = ai.lua(MAKE % kw)
                if r.get("done"):
                    done = True
                    print(time.strftime("%H:%M:%S"), "제작 끝 - 제작기를 포탄 3 호로", flush=True)
                elif str(r) != last:
                    print(time.strftime("%H:%M:%S"), "제작", r, flush=True)
                    last = str(r)
            if n % 6 == 0:
                if n % 60 == 0:
                    ai.lua(PLACE % items)  # 부서진 것 / 빠진 유령 다시
                r = ai.lua(RUN % dict(kw, ecs=L(ECS_ALL), shells=L(SHELLS)))
                if r:
                    print(time.strftime("%H:%M:%S"), "급식", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"shell3: {type(e).__name__}: {e}"[:200], flush=True)
        n += 1
        time.sleep(5)


if __name__ == "__main__":
    raise SystemExit(main())

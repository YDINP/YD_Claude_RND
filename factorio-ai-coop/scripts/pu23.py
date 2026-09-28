"""처리장치 +3 · 저밀도 +1 먹이 / 황 -> 황산 / 고급회로 과잉 조절 (로켓 계획 P5 잔여, 09-28 20:xx).

조사 (tick ~21.30M):
  * 노랑 10 분 63 = 처리장치 40 (설비 2 대, 상한 90) 에 묶임. 처리장치 (33.5,1.5) 는 녹색회로 0 (벨트 먹이 모자람).
  * 황산 공장 (30.5,6.5) 황 0 -> 황산 10 분 1,350 -> 배터리 59 -> 프레임 29. 남쪽 황 공장 (26.5,6.5) 은 가스 2:
    남쪽 가스 덩어리 = 남쪽 정유 가스 (~11/s) + 경유 분해 (16.5,6.5) 를 플라스틱 (16.5,10.5, 20/s) 과 황 (30/s) 이 나눠 먹음 -> 수요 50 > 공급 17.
    북쪽은 반대로 남는다 (북쪽 황 공장 full_output, 황 상자 (-16.5,-33.5) 1,600 가득, 북 정유 full_output 이면 basic 으로 떨어짐).
    -> 관을 잇는 대신 북쪽 황 (공장 출력 먼저 -> 공장 재가동 = 북쪽 남는 가스 사용) 을 황산 공장으로 옮긴다.
  * 고급회로 10 분 827 · 소비 441, 망 1,317 쌓임 -> 녹색회로 (처리장치 20 개) · 플라스틱 (저밀도) · 구리를 먹는다. 구리는 10 분 5,844 < 소비 7,558.

설계 (purple23.py PU_DESIGN, 로봇 유령): 처리장치 조립기2 PU-A (29.5,-0.5) · PU-B (36.5,8.5) · PU-C (36.5,12.5) 동향,
  황산 관 y=-0.5 동쪽 끝 -> x=38.5 세로 -> 지하 (벨트 밑) -> x=38.5 세로. 저밀도 칸 (31.5,-86.5) 요청 -> AM2 -> 공급.

30 초마다 (기존 아이템만):
  PU   처리장치 5 대: 녹색회로 30 밑이면 60 까지 (가득 찬 회로 조립기 3 대 출력 -> 망 (60 남김)), 고급회로 4 밑이면 10 까지 (망 50 남김)
  OUT  새 처리장치 3 대 출력 -> 노랑 둘 (6 밑이면 12 까지) -> 남으면 망 (망 처리장치 < 300 · 빈 칸 > 150)
  LDS  망 저밀도 -> 노랑 둘 (6 밑이면 12 까지)
  SU   황산 공장 황 15 밑이면 40 까지: 북쪽 황 공장 출력 -> 황 상자 (-16.5,-33.5, 300 남김 = 폭약 몫)
  PL   북쪽 동 플라스틱 (1.5,-44.5) 출력 20 남기고 -> 망 (망 < 800 · 빈 칸 > 150) - 북쪽 남는 가스를 저밀도 플라스틱으로
  GOV  망 고급회로 >= 1000 이면 P5 고급회로 조립기 7 대 투입 팔 active=false, <= 500 이면 다시 켬 (필터 · 팔 삭제 없음)

    python -u scripts/pu23.py --once
    python -u scripts/pu23.py >> state/pu23.log 2>&1     # 상주
    python -u scripts/pu23.py stat
"""
import argparse
import json
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

PUS = [(33.5, 1.5), (36.5, 1.5), (29.5, -0.5), (36.5, 8.5), (36.5, 12.5)]
NEW_PU = PUS[2:]
YEL = [(29.5, -8.5), (12.5, 3.5)]
ACID = (30.5, 6.5)
SULF_PLANT, SULF_BOX, SULF_KEEP = (-14.5, -43.5), (-16.5, -33.5), 300
# 가득 찬 (full_output) 회로 조립기 출력 - 제 손님이 안 가져가는 몫 (20 남김). 망 녹색회로는 60 남김
GC_SRC = [(-28.5, -13.5), (-51.5, 3.5), (-18.5, -70.5)]
AC_INS = [(1.5, -96.5), (9.5, -96.5), (12.5, -96.5), (20.5, -96.5), (23.5, -96.5), (31.5, -96.5), (23.5, -88.5)]
AC_HI, AC_LO = 1000, 500
E_PLASTIC = (1.5, -44.5)


def P(ps):
    return "{" + ", ".join("{%s, %s}" % p for p in ps) + "}"


FEED = """(function() local s = game.surfaces[1] local o = {}
local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
local function add(k, v) if v > 0 then o[k] = (o[k] or 0) + v end end
local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] end
local function inp(a) return a.get_inventory(defines.inventory.assembling_machine_input) end
local function fromnet(inv, item, want, keep, tag)
  local k = math.min(want, net.get_item_count(item) - keep) if k <= 0 then return 0 end
  k = net.remove_item{name = item, count = k} if k <= 0 then return 0 end
  local q = inv.insert{name = item, count = k} if q < k then net.insert{name = item, count = k - q} end add(tag, q) return q end
local function fromout(srcs, inv, item, want, keep, tag)
  for _, p in pairs(srcs) do if want > 0 then local a = asm(p)
    if a then local out = a.get_output_inventory() local k = math.min(want, out.get_item_count(item) - keep)
      if k > 0 then k = inv.insert{name = item, count = k} if k > 0 then out.remove{name = item, count = k} want = want - k add(tag, k) end end end end end
  return want end
-- PU 먹이
for _, p in pairs($pus) do local a = asm(p)
  if a then local i = inp(a)
    local h = i.get_item_count('electronic-circuit')
    if h < 30 then local w = fromout($gcsrc, i, 'electronic-circuit', 60 - h, 20, 'gc_src') if w > 0 then fromnet(i, 'electronic-circuit', w, 60, 'gc_net') end end
    h = i.get_item_count('advanced-circuit')
    if h < 4 then fromnet(i, 'advanced-circuit', 10 - h, 50, 'ac') end
  end end
-- 새 PU 출력 -> 노랑 -> 망
local ys = {} for _, p in pairs($yel) do local y = asm(p) if y then ys[#ys + 1] = inp(y) end end
for _, yi in pairs(ys) do local h = yi.get_item_count('processing-unit')
  if h < 6 then fromout($newpu, yi, 'processing-unit', 12 - h, 0, 'pu_y') end end
local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
if free > 150 and net.get_item_count('processing-unit') < 300 then
  -- 23:58 노랑 멈춤 (사일로 첫 발사) 뒤 옛 2 대 (33.5,1.5)(36.5,1.5) 는 가져갈 곳 없어 full_output, 2 남김도 멈춤 -> 5 대 전부 · 다 뺀다
  for _, p in pairs($pus) do local a = asm(p) if a then local out = a.get_output_inventory() local n = out.get_item_count('processing-unit')
    if n > 0 then local k = net.insert{name = 'processing-unit', count = n} if k > 0 then out.remove{name = 'processing-unit', count = k} add('pu_net', k) end end end end
end
-- 망 저밀도 -> 노랑
for _, yi in pairs(ys) do local h = yi.get_item_count('low-density-structure')
  if h < 6 then fromnet(yi, 'low-density-structure', 12 - h, 0, 'lds_y') end end
-- 황 -> 황산 공장
local A = asm($acid)
if A then local i = inp(A) local h = i.get_item_count('sulfur')
  if h < 15 then local w = fromout({$splant}, i, 'sulfur', 40 - h, 0, 'su_plant')
    if w > 0 then local c = s.find_entities_filtered{type = 'container', position = $sbox, radius = 0.5}[1]
      if c then local ci = c.get_inventory(defines.inventory.chest) local k = math.min(w, ci.get_item_count('sulfur') - $skeep)
        if k > 0 then k = i.insert{name = 'sulfur', count = k} if k > 0 then ci.remove{name = 'sulfur', count = k} add('su_box', k) end end end end end
end
-- 북쪽 동 플라스틱 (1.5,-44.5) full_output (북쪽 가스는 남는다 - 정유가 basic 으로 떨어짐) -> 출력 20 남기고 망 (망 < 800 · 빈 칸 > 150)
do local a = asm($eplastic) if a and free > 150 then local out = a.get_output_inventory()
  local k = math.min(out.get_item_count('plastic-bar') - 20, 800 - net.get_item_count('plastic-bar'))
  if k > 0 then k = net.insert{name = 'plastic-bar', count = k} if k > 0 then out.remove{name = 'plastic-bar', count = k} add('pl_net', k) end end end end
o.ac_net = net.get_item_count('advanced-circuit') o.gc_net = net.get_item_count('electronic-circuit') o.free = free
return o end)()"""

GOV = """(function() local s = game.surfaces[1] local o = {on = 0, off = 0, set = 0}
for _, p in pairs($ins) do local e = s.find_entities_filtered{type = 'inserter', position = p, radius = 0.1}[1]
  if e then if $want ~= nil and e.active ~= $want then e.active = $want o.set = o.set + 1 end
    if e.active then o.on = o.on + 1 else o.off = o.off + 1 end end end
return o end)()"""

STAT = """(function() local s = game.surfaces[1] local o = {}
local st = game.forces.player.get_item_production_statistics(s) local fs = game.forces.player.get_fluid_production_statistics(s)
local function f(S, n, c) return math.floor(S.get_flow_count{name = n, category = c, precision_index = defines.flow_precision_index.ten_minutes, count = true}) end
for _, n in pairs({'processing-unit', 'low-density-structure', 'utility-science-pack', 'sulfur', 'battery', 'flying-robot-frame', 'advanced-circuit', 'electronic-circuit', 'plastic-bar', 'copper-plate'}) do o[n] = f(st, n, 'input') .. '/' .. f(st, n, 'output') end
for _, n in pairs({'sulfuric-acid', 'petroleum-gas'}) do o[n] = f(fs, n, 'input') .. '/' .. f(fs, n, 'output') end
local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
o.m = {} for _, p in pairs($pus) do local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  o.m[#o.m + 1] = p[1] .. ',' .. p[2] .. ' ' .. (a and names[a.status] or 'none') end
for _, p in pairs({{30.5, 6.5}, {26.5, 6.5}, {-14.5, -43.5}, {25.5, -4.5}, {31.5, -86.5}}) do local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  o.m[#o.m + 1] = p[1] .. ',' .. p[2] .. ' ' .. (a and ((a.get_recipe() and a.get_recipe().name or '-') .. ' ' .. names[a.status]) or 'none') end
return o end)()"""


def T(v):
    if isinstance(v, dict) and v and all(str(k).isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v


def feed(ai):
    return ai.lua(FEED.replace("$pus", P(PUS)).replace("$newpu", P(NEW_PU)).replace("$yel", P(YEL)).replace("$gcsrc", P(GC_SRC))
                  .replace("$acid", "{%s, %s}" % ACID).replace("$splant", "{%s, %s}" % SULF_PLANT)
                  .replace("$sbox", "{%s, %s}" % SULF_BOX).replace("$eplastic", "{%s, %s}" % E_PLASTIC).replace("$skeep", str(SULF_KEEP)))


def gov(ai, want):
    w = "nil" if want is None else ("true" if want else "false")
    return ai.lua(GOV.replace("$ins", P(AC_INS)).replace("$want", w))


def stat(ai):
    r = ai.lua(STAT.replace("$pus", P(PUS)))
    r["m"] = T(r.get("m"))
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", nargs="?", default="run", choices=["run", "stat"])
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=int, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "stat":
        print(json.dumps(stat(ai), ensure_ascii=False))
        return 0
    last_stat = 0.0
    while True:
        try:
            r = feed(ai)
            acn = int(r.get("ac_net", 0))
            g = gov(ai, None)
            want = None
            if acn >= AC_HI and g.get("on", 0) > 0:
                want = False
            elif acn <= AC_LO and g.get("off", 0) > 0:
                want = True
            if want is not None:
                g = gov(ai, want)
                r["gov"] = "P5 고급회로 팔 %s (망 %d)" % ("켬" if want else "끔", acn)
            moved = {k: v for k, v in r.items() if k not in ("ac_net", "gc_net", "free")}
            if moved or a.once:
                print(time.strftime("%H:%M:%S"), "pu23", r, "팔 on/off %s/%s" % (g.get("on"), g.get("off")), flush=True)
            if time.time() - last_stat >= 300 or a.once:
                print(time.strftime("%H:%M:%S"), "stat", json.dumps(stat(ai), ensure_ascii=False), flush=True)
                last_stat = time.time()
        except Exception as e:  # noqa: BLE001
            print(f"pu23: {type(e).__name__}: {e}"[:300], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

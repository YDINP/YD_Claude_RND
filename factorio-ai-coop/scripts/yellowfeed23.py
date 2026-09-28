"""노란팩 사슬 먹이 중계 (09-28 10:50) - 구리가 망 창고에 갇혀 사슬 전체가 굶는다.

조사 (tick 19.40M, 연구 laser-weapons-damage-5 2.6 %):
  · 10 분 생산 노랑 0 · 처리장치 0 · 고급회로 0 · 파랑 0 · 프레임 0 · 저밀도 0. 구리판 생산 0 / 1 시간.
  · 뿌리 = 구리. 북쪽 전초 구리판은 smeltcol23 이 줄 끝 (-4.5,-100.5) 에서 망 2 창고로 옮기는데 (상한 5000),
    망 2 엔 물류 로봇이 0 대라 창고 구리 5,504 가 소비처로 나가지 않는다. 기지 버스 구리 레인은 옛 제련 줄 철거 뒤
    벽돌 · 철만 흐른다 -> 구리선 조립기 전부 no_ingredients -> 녹색/고급회로 -> 처리장치 · 파랑팩 정지.
    창고가 5000 을 넘어 smeltcol 은 판을 화로에 두고 (화로 16 full_output) 구리 제련도 멈췄다.
  · 부차: 저밀도 (4.5,-47.5) 강철 0, (7.5,-45.5) 구리 6 · 프레임 F2 (25.5,-8.5) 강철 0 · F1 (8.5,3.5) 전기엔진 0
    (yellowlab23 CHAIN 은 전기엔진을 F2 에만) · 처리장치 둘 고급회로 0 (팔 줄 없음, 옛 손 먹이).

60 초마다 (기존 아이템만 옮김, 품목별 상한 · 망 바닥 남김):
  CU   망 2 구리 -> 사슬 구리선 조립기 입력 (40 미만이면 100 까지), 망 구리 FLOOR 남김
  ST   망 2 강철 -> 저밀도 둘 · F2 (8 미만이면 30 까지) · 구리 -> 저밀도 (40 미만이면 100 까지)
  EE   전기엔진 조립기 (21.5,-8.5) 출력 -> F1 (2 미만이면 4 까지; F2 몫은 yellowlab23)
  AC   고급회로 벨트 (x=37.5 남행 y -35..-21, 파랑팩 줄로 가는 길) -> 처리장치 둘 (4 미만이면 10 까지)
  LDS  덧 저밀도 조립기 (망 안, --lds 로 유령) 에 구리 · 강철 (망) · 플라스틱 (플라스틱 공장 출력 · 상자) -> 결과는 노랑 둘로

    python -u scripts/yellowfeed23.py --once
    python -u scripts/yellowfeed23.py            # 상주
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

CABLE = [(2.5, -32.5), (10.5, -32.5), (17.5, -32.5), (29.5, -32.5),   # 고급회로 줄 (y=-32.5)
         (-21.5, -26.5), (-21.5, -42.5),                               # 고급회로 AM1 둘 옆
         (-10.5, -25.5),                                               # 회로 (-10.5,-21.5)
         (5.5, -8.5)]                                                  # 로봇 줄 회로 (9.5,-8.5) -> 프레임 · 처리장치
LDS = [(4.5, -47.5), (7.5, -45.5)]
F1, F2, EE = (8.5, 3.5), (25.5, -8.5), (21.5, -8.5)
PU = [(33.5, 1.5), (36.5, 1.5)]
YEL = [(29.5, -8.5), (12.5, 3.5)]
AC_BELT = ((37, -35.5), (38, -20.5))
PLASTIC_SRC = [(16.5, 10.5), (11.5, 10.5)]   # 남쪽 플라스틱 공장 둘 (출력 full) - 저밀도 둘 · 고급회로 몫 (1.5,-44.5)(-21.5,-34.5) 는 안 건드림
PLASTIC_BOX = [(16.5, 13.5), (11.5, 13.5)]
EXTRA_LDS = (6.5, 6.5)           # 덧 저밀도 AM1 자리 (망 2 안) - --lds 로 유령
FLOOR = {"copper-plate": 800, "steel-plate": 300}

LUA = """(function() local s = game.surfaces[1] local o = {}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  if not net then return {err = 'no net 2'} end
  local FLOOR = {['copper-plate'] = %d, ['steel-plate'] = %d}
  local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] end
  local function inp(e) return e.get_inventory(defines.inventory.assembling_machine_input) end
  local function add(k, v) o[k] = (o[k] or 0) + v end
  local function fromnet(e, item, lo, hi, tag)
    if not e then return end local inv = inp(e) local have = inv.get_item_count(item)
    if have >= lo then return end
    local k = math.min(hi - have, net.get_item_count(item) - (FLOOR[item] or 0))
    if k <= 0 then o.short = item return end
    k = net.remove_item{name = item, count = k} if k <= 0 then return end
    local put = inv.insert{name = item, count = k} if put < k then net.insert{name = item, count = k - put} end
    add(tag, put)
  end
  for _, p in pairs({%s}) do local a = asm(p) if a and a.get_recipe() and a.get_recipe().name == 'copper-cable' then fromnet(a, 'copper-plate', 40, 100, 'cu') end end
  for _, p in pairs({%s}) do local a = asm(p) if a then fromnet(a, 'steel-plate', 8, 30, 'st') fromnet(a, 'copper-plate', 40, 100, 'ldscu') end end
  fromnet(asm({%s, %s}), 'steel-plate', 8, 30, 'st')
  -- 전기엔진 -> F1
  local ee, f1 = asm({%s, %s}), asm({%s, %s})
  if ee and f1 then local need = 4 - inp(f1).get_item_count('electric-engine-unit')
    if inp(f1).get_item_count('electric-engine-unit') < 2 and need > 0 then
      local got = ee.get_output_inventory().remove{name = 'electric-engine-unit', count = need}
      if got > 0 then inp(f1).insert{name = 'electric-engine-unit', count = got} add('ee', got) end end end
  -- 고급회로 벨트 -> 처리장치
  local belts = s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{%s, %s}, {%s, %s}}}
  for _, p in pairs({%s}) do local a = asm(p)
    if a then local have = inp(a).get_item_count('advanced-circuit')
      if have < 4 then local need = 10 - have
        for _, b in pairs(belts) do for i = 1, 2 do if need > 0 then
          local l = b.get_transport_line(i) local k = math.min(need, l.get_item_count('advanced-circuit'))
          if k > 0 then k = l.remove_item{name = 'advanced-circuit', count = k} local put = inp(a).insert{name = 'advanced-circuit', count = k}
            need = need - put add('ac', put) end end end end
      end
    end end
  -- 덧 저밀도: 구리 · 강철 (망) · 플라스틱 (공장 출력 · 상자), 결과 -> 노랑
  local X = asm({%s, %s})
  if X then
    if not X.get_recipe() then X.set_recipe('low-density-structure') end
    fromnet(X, 'steel-plate', 4, 20, 'xst') fromnet(X, 'copper-plate', 40, 100, 'xcu')
    local have = inp(X).get_item_count('plastic-bar')
    if have < 10 then local need = 30 - have
      for _, p in pairs({%s}) do if need > 0 then local e = s.find_entities_filtered{type = 'chemical-plant', position = p, radius = 0.6}[1]
        if e then local k = e.get_output_inventory().remove{name = 'plastic-bar', count = need} if k > 0 then inp(X).insert{name = 'plastic-bar', count = k} need = need - k add('xpl', k) end end end end
      for _, p in pairs({%s}) do if need > 0 then local c = s.find_entities_filtered{type = 'container', position = p, radius = 0.6}[1]
        if c then local k = c.get_inventory(defines.inventory.chest).remove{name = 'plastic-bar', count = need} if k > 0 then inp(X).insert{name = 'plastic-bar', count = k} need = need - k add('xpl', k) end end end end
    end
    local out = X.get_output_inventory()
    for _, p in pairs({%s}) do local y = asm(p) if y then local n = out.get_item_count('low-density-structure')
      local need = 30 - inp(y).get_item_count('low-density-structure')
      if n > 0 and need > 0 then local k = math.min(n, need) k = inp(y).insert{name = 'low-density-structure', count = k} out.remove{name = 'low-density-structure', count = k} add('xlds', k) end end end
    o.xstatus = X.status
  end
  o.netcu = net.get_item_count('copper-plate')
  return o end)()"""

PLACE = """(function() local s = game.surfaces[1] local p = {%s, %s}
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  if a then return {state = 'built'} end
  if s.find_entities_filtered{ghost_name = 'assembling-machine-1', position = p, radius = 0.6}[1] then return {state = 'ghost'} end
  if not s.can_place_entity{name = 'assembling-machine-1', position = p, force = 'player'} then return {state = 'blocked'} end
  local n = s.find_logistic_network_by_position(p, 'player') if not n or n.network_id ~= 2 then return {state = 'no net'} end
  local g = s.create_entity{name = 'entity-ghost', inner_name = 'assembling-machine-1', position = p, force = 'player'}
  pcall(function() g.set_recipe('low-density-structure') end)
  return {state = 'placed', at = {g.position.x, g.position.y}} end)()"""


def pts(ps):
    return ", ".join("{%s, %s}" % p for p in ps)


def build_lua():
    return LUA % (FLOOR["copper-plate"], FLOOR["steel-plate"], pts(CABLE), pts(LDS), F2[0], F2[1],
                  EE[0], EE[1], F1[0], F1[1], AC_BELT[0][0], AC_BELT[0][1], AC_BELT[1][0], AC_BELT[1][1], pts(PU),
                  EXTRA_LDS[0], EXTRA_LDS[1], pts(PLASTIC_SRC), pts(PLASTIC_BOX), pts(YEL))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--lds", action="store_true", help="덧 저밀도 AM1 유령")
    ap.add_argument("--every", type=int, default=60)
    a = ap.parse_args()
    ai = AIBridge()
    if a.lds:
        print(time.strftime("%H:%M:%S"), "덧 저밀도", ai.lua(PLACE % EXTRA_LDS), flush=True)
    src = build_lua()
    while True:
        try:
            print(time.strftime("%H:%M:%S"), "노랑 먹이", ai.lua(src), flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"yellowfeed: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

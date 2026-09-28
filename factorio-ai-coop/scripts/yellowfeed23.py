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
  FE   망 2 철 -> 녹색회로 넷 (20 미만이면 60 까지, 망 철 3000 남김) · EC 로봇 줄 회로 출력 -> 고급회로 줄 넷
  EE   전기엔진 조립기 (21.5,-8.5) 출력 -> F1 (2 미만이면 4 까지; F2 몫은 yellowlab23)
  AC   고급회로 벨트 (y=-35.5 동행 x 12..38 + x=37.5 남행 y -35..-21, 파랑팩 줄로 가는 길) -> 처리장치 둘 (4 미만이면 10 까지)
  ACPL 플라스틱 상자 (16.5,13.5)(11.5,13.5) -> 고급회로 줄 넷 (6 미만이면 24 까지) (09-29 노랑 0: 줄 넷 플라스틱 0)
  COAL 석탄 상자 (-1.5,-30.5) (150 남김) -> 플라스틱 공장 석탄 상자 둘 (10 미만이면 30 까지). 석탄 줄 x=-1.5 은 비어 있음
  PLN  망 석탄 (300 남김) -> 북쪽 플라스틱 공장 둘 (-21.5,-34.5)(1.5,-44.5) 입력 (20 미만이면 50 까지, 공장 한 대 최대 60/분). 석탄 줄 둘 다 비어 있음 (09-28 석탄 0)
  ROBO 로보포트 (상자 (34.5,-41.5) + 망) >= 40 이면 로보포트 조립기 고급회로 팔 (34.5,-36.5) active=false (파랑 몫)
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
         (5.5, -8.5),                                                  # 로봇 줄 회로 (9.5,-8.5) -> 프레임 · 처리장치
         (-28.5, -17.5)]                                               # 회로 (-28.5,-13.5) -> 서쪽 고급회로 AM1 벨트
# 11:02 구리가 풀리자 구리선은 전부 full_output, 다음 병목은 녹색회로: (6.5,-32.5) 철 0 (버스 철 레인 모자람)
EC_IRON = [(6.5, -32.5), (-10.5, -21.5), (-28.5, -13.5), (9.5, -8.5)]
EC_SPARE = (9.5, -8.5)           # 로봇 줄 회로 (출력 full, F1 에 140) -> 고급회로 줄 y=-32.5 넷
AC_ROW = [(13.5, -32.5), (21.5, -32.5), (25.5, -32.5), (33.5, -32.5)]
LDS = [(4.5, -47.5), (7.5, -45.5)]
F1, F2, EE = (8.5, 3.5), (25.5, -8.5), (21.5, -8.5)
PU = [(33.5, 1.5), (36.5, 1.5)]
YEL = [(29.5, -8.5), (12.5, 3.5)]
AC_BELT = ((12, -36), (38, -21))   # y=-35.5 동행 줄 + x=37.5 남행 (11:01 x=37.5 만으론 0 - 지나가는 순간만 잡힘)
PLASTIC_SRC = [(16.5, 10.5), (11.5, 10.5)]   # 남쪽 플라스틱 공장 둘 (출력 full) - 저밀도 둘 · 고급회로 몫 (1.5,-44.5)(-21.5,-34.5) 는 안 건드림
PLASTIC_BOX = [(16.5, 13.5), (11.5, 13.5)]
# 09-29 노랑 10분 0: 고급회로 줄 넷 플라스틱 0 인데 남쪽 상자 둘에 플라스틱 ~4,950 (공장 둘은 석탄 0 으로 정지) - 상자 -> 고급회로 줄
AC_PL = (6, 24)                  # 이 밑이면, 이만큼까지
PL_COAL = [((10.5, 13.5), (11.5, 10.5)), ((15.5, 13.5), (16.5, 10.5))]   # 플라스틱 공장 석탄 상자 (상자, 공장)
COAL_BOX, COAL_KEEP = (-1.5, -30.5), 150   # 석탄 상자 (폭약 몫 150 남김) -> 플라스틱 석탄 상자 (10 밑이면 30 까지)
# 09-29 고급회로 10분 300 인데 파랑 0: 고급회로 벨트 첫 손님이 로보포트 조립기 (34.5,-38.5) (한 대에 45, 10분 284 소비).
# 로보포트는 상자 (34.5,-41.5) 30 + 망 50 - 넉넉하면 그 입력 팔 (34.5,-36.5) 을 멈춘다 (필터·팔 삭제 없음, active 만)
ROBO_INS, ROBO_BOX, ROBO_CAP = (34.5, -36.5), (34.5, -41.5), 40
EXTRA_LDS = (6.5, 6.5)           # 덧 저밀도 AM1 자리 (망 2 안) - --lds 로 유령
FLOOR = {"copper-plate": 800, "steel-plate": 300, "iron-plate": 3000, "coal": 300}
# 09-28 플라스틱 10분 432 < 소비 ~700: 북쪽 공장 둘 석탄 0 (벨트 (-25.5,-34.5) · x=-1.5 줄 모두 빈 줄), 망 석탄 2,000 (상한) 은 놀고 있음
PL_NORTH = [(-21.5, -34.5), (1.5, -44.5)]

LUA = """(function() local s = game.surfaces[1] local o = {}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  if not net then return {err = 'no net 2'} end
  local FLOOR = {['copper-plate'] = %d, ['steel-plate'] = %d, ['iron-plate'] = %d, ['coal'] = %d}
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
  for _, p in pairs({%s}) do fromnet(asm(p), 'iron-plate', 20, 60, 'fe') end
  for _, p in pairs({%s}) do fromnet(asm(p), 'coal', 20, 50, 'plnc') end
  -- 남는 녹색회로 -> 고급회로 줄 (2 미만이면 8 까지)
  local sp = asm({%s, %s})
  if sp then local out = sp.get_output_inventory()
    for _, p in pairs({%s}) do local a = asm(p) if a then local have = inp(a).get_item_count('electronic-circuit')
      local n = out.get_item_count('electronic-circuit')
      if have < 2 and n > 0 then local k = inp(a).insert{name = 'electronic-circuit', count = math.min(n, 8 - have)}
        if k > 0 then out.remove{name = 'electronic-circuit', count = k} add('ec', k) end end end end
  end
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
      for _, p in pairs({%s}) do if need > 0 then local e = s.find_entities_filtered{name = 'chemical-plant', position = p, radius = 0.6}[1]
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
  -- 플라스틱 상자 -> 고급회로 줄
  for _, p in pairs({%s}) do local a = asm(p)
    if a then local have = inp(a).get_item_count('plastic-bar')
      if have < %d then local need = %d - have
        for _, q in pairs({%s}) do if need > 0 then local c = s.find_entities_filtered{type = 'container', position = q, radius = 0.6}[1]
          if c then local k = c.get_inventory(defines.inventory.chest).remove{name = 'plastic-bar', count = need}
            if k > 0 then local put = inp(a).insert{name = 'plastic-bar', count = k} if put < k then c.insert{name = 'plastic-bar', count = k - put} end
              need = need - put add('acpl', put) end end end end
      end
    end end
  -- 석탄 상자 -> 플라스틱 공장 석탄 상자 (공장 석탄 + 상자 < 10 이면 30 까지)
  local cb = s.find_entities_filtered{type = 'container', position = {%s, %s}, radius = 0.6}[1]
  if cb then local ci = cb.get_inventory(defines.inventory.chest)
    for _, t in pairs({%s}) do
      local box = s.find_entities_filtered{type = 'container', position = t[1], radius = 0.6}[1]
      local pl = s.find_entities_filtered{name = 'chemical-plant', position = t[2], radius = 0.6}[1]
      if box and pl then local bi = box.get_inventory(defines.inventory.chest)
        local have = bi.get_item_count('coal') + inp(pl).get_item_count('coal')
        local k = math.min(30 - have, ci.get_item_count('coal') - %d)
        if have < 10 and k > 0 then k = bi.insert{name = 'coal', count = k} if k > 0 then ci.remove{name = 'coal', count = k} add('plcoal', k) end end
      end end
    o.coalbox = ci.get_item_count('coal')
  end
  -- 로보포트 조립기 고급회로 팔: 로보포트 (상자 + 망) 가 상한 이상이면 멈춤
  local ri = s.find_entities_filtered{type = 'inserter', position = {%s, %s}, radius = 0.3}[1]
  local rb = s.find_entities_filtered{type = 'container', position = {%s, %s}, radius = 0.6}[1]
  if ri and rb then local n = rb.get_inventory(defines.inventory.chest).get_item_count('roboport')
    for _, nw in pairs(game.forces.player.logistic_networks[s.name]) do n = n + nw.get_item_count('roboport') end
    local on = n < %d if ri.active ~= on then ri.active = on add(on and 'robo_on' or 'robo_off', 1) end o.robo = n
  end
  local pb = 0 for _, q in pairs({%s}) do local c = s.find_entities_filtered{type = 'container', position = q, radius = 0.6}[1] if c then pb = pb + c.get_inventory(defines.inventory.chest).get_item_count('plastic-bar') end end
  o.plbox = pb
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
    return LUA % (FLOOR["copper-plate"], FLOOR["steel-plate"], FLOOR["iron-plate"], FLOOR["coal"], pts(CABLE), pts(LDS), F2[0], F2[1],
                  pts(EC_IRON), pts(PL_NORTH), EC_SPARE[0], EC_SPARE[1], pts(AC_ROW),
                  EE[0], EE[1], F1[0], F1[1], AC_BELT[0][0], AC_BELT[0][1], AC_BELT[1][0], AC_BELT[1][1], pts(PU),
                  EXTRA_LDS[0], EXTRA_LDS[1], pts(PLASTIC_SRC), pts(PLASTIC_BOX), pts(YEL),
                  pts(AC_ROW), AC_PL[0], AC_PL[1], pts(PLASTIC_BOX), COAL_BOX[0], COAL_BOX[1],
                  ", ".join("{{%s, %s}, {%s, %s}}" % (b[0], b[1], c[0], c[1]) for b, c in PL_COAL), COAL_KEEP,
                  ROBO_INS[0], ROBO_INS[1], ROBO_BOX[0], ROBO_BOX[1], ROBO_CAP, pts(PLASTIC_BOX))


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

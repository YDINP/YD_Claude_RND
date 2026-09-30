"""run24 로켓 사일로 준비 (2026-09-30 13:4x) - 연구 rocket-silo 진행 중. 사일로는 연구가 끝나기 전엔 짓지 않는다.

조리법 (prototypes 실측):
  rocket-silo = 강철 1000 · 처리장치 (PU) 200 · 전기 엔진 200 · 관 100 · 콘크리트 1000 (30 s), 9 × 9.
  rocket-part = PU 10 · LDS 10 · 로켓 연료 10 (3 s), 로켓 하나 = 부품 100 → PU 1000 · LDS 1000 · 로켓 연료 1000.
  concrete = 벽돌 5 · 철광석 1 · 물 100 → 10 (10 s, 액체 조립 - 조립기 2 이상).
  rocket-fuel = 고체 연료 10 · 경유 10 (15 s).
실측 13:4x 망: 강철 4.9k · 전기 엔진 304 · 관 50 · 벽돌 2.3k · 철광석 244 · PU 0 · LDS 0 · 콘크리트 0 · 고체 연료 505.
  10분: PU 66 (노랑이 다 씀) · LDS 4 · 로켓 연료 0 (조립기 없음) · 콘크리트 0 (조립기 없음) · 경유 522.

지금 하는 것 (싼 것): 콘크리트 조립기 2 하나 - 물 줄 (y 31.5, x -36.5..-6.5, 물 전용) 에 입력 (조립기 북쪽 가운데 (0,-1) → 관 (x, 31.5)).
  (-15.5,33.5) · 결과 팔 (-15.5,35.5) → 공급 상자 (-15.5,36.5) 칸 10 (= 1000) · 중형 전봇대 (-13.5,34.5) ← 소형 (-15.5,40.5).
  robofeed24 요청: 벽돌 · 철광석. 0.75 → 13.3 s 에 10 → 10분 450 → 콘크리트 1000 은 ~22 분.
사일로 자리: (-85.5,-35.5) - 기지 망 안, 13 × 13 빈 땅 (can_place manual, 돌 0). 전봇대 (-77.5,-3x) 가 가까움.

    python scripts/silo24.py check|ghosts|kit|config|site|status
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
import purple24  # noqa: E402

N, S = 0, 8
CONC = (-15.5, 33.5)
BOX = (-15.5, 36.5, 10)
G = [("assembling-machine-2", CONC[0], CONC[1], N), ("inserter", -15.5, 35.5, N), ("passive-provider-chest", BOX[0], BOX[1], N),
     ("medium-electric-pole", -13.5, 34.5, N)]
SILO = (-85.5, -35.5)


def place(ai, make):
    return ai.lua(purple24.LUA_PLACE % ("true" if make else "false", json.dumps([list(g) for g in G])))


def config(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      local b = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = {%s, %s}, radius = 0.3}[1]
      if b then b.get_inventory(defines.inventory.chest).set_bar(%d + 1) out.bar = true end
      local a = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = {%s, %s}, radius = 0.3}[1]
      if a then
        local r = a.get_recipe()
        if not r and a.get_inventory(defines.inventory.assembling_machine_output).is_empty() then a.set_recipe('concrete') out.recipe = 'set'
        else out.recipe = r and r.name end
        out.fluid = a.fluidbox[1] and (a.fluidbox[1].name .. ':' .. math.floor(a.fluidbox[1].amount)) or 'none'
      end
      return out end)()""" % (BOX[0], BOX[1], BOX[2], CONC[0], CONC[1]))


def site(ai):
    """사일로 자리 다시 재기 (지을 때 한 번 더 - 그 사이 누가 지었을 수 있다)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local p = {%s, %s}
      local base = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local busy = s.count_entities_filtered{area = {{p[1] - 6.5, p[2] - 6.5}, {p[1] + 6.5, p[2] + 6.5}},
        type = {'construction-robot', 'logistic-robot', 'character', 'item-request-proxy', 'item-entity', 'corpse', 'fish', 'tree', 'simple-entity', 'cliff', 'resource'}, invert = true}
      return {can = s.can_place_entity{name = 'rocket-silo', position = p, force = f, build_check_type = defines.build_check_type.manual},
              same_net = s.find_logistic_network_by_position(p, f) == base, busy13 = busy,
              poles14 = s.count_entities_filtered{type = 'electric-pole', position = p, radius = 14},
              researched = f.technologies['rocket-silo'].researched, progress = f.current_research and f.current_research.name == 'rocket-silo' and f.research_progress or nil}
    end)()""" % SILO)


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local st = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index.ten_minutes
      local o = {net = {}, p10 = {}}
      for _, k in pairs({'steel-plate', 'processing-unit', 'electric-engine-unit', 'pipe', 'concrete', 'low-density-structure', 'rocket-fuel', 'stone-brick', 'iron-ore', 'solid-fuel'}) do
        o.net[k] = n.get_item_count(k)
        o.p10[k] = math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}) end
      local a = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = {%s, %s}, radius = 0.3}[1]
      if a then local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end o.conc = stn[a.status] end
      return o end)()""" % CONC)


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    ai = AIBridge()
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True),
          "kit": lambda ai: purple24.kit(ai, a2=1, ins=0, pp=0), "config": config, "site": site, "status": status}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

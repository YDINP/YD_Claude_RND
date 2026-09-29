"""Short run report: tick, researched techs, 10-minute plate output, nearest known enemy structure, who is alive.

적 구조물 거리는 «걸어서 본» 것만 (seen.py 장부 + 밝혀진 청크). 모르는 것은 모른다고 찍는다.
23회차 복기: 생존 수를 계기판에 늘 찍는다 (foxtrot 사망을 한참 뒤에 알았다).

    python scripts/report.py --run run24
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                # noqa: E402
from client import AIBridge   # noqa: E402

CREW = ("alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel")


def main() -> int:
    ai = AIBridge()
    cx, cy = runsite.center()
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local out = {tick = game.tick, evo = f.get_evolution_factor(s), done = {}}
      for n, t in pairs(f.technologies) do
        if t.researched and t.research_unit_count_formula == nil and #t.research_unit_ingredients > 0 then out.done[#out.done+1] = n end
        if t.researched and t.prototype.research_trigger then out.done[#out.done+1] = n .. "*" end
      end
      out.cur = f.current_research and f.current_research.name or "-"
      out.prog = f.research_progress
      local P = defines.flow_precision_index.ten_minutes
      for _, n in pairs({"iron-plate", "copper-plate", "automation-science-pack", "logistic-science-pack", "chemical-science-pack",
                          "steel-plate", "plastic-bar", "advanced-circuit", "engine-unit", "sulfur", "gun-turret", "firearm-magazine"}) do
        out[n] = st.get_flow_count{name = n, category = "input", precision_index = P, count = true}
      end
      out.turrets = s.count_entities_filtered{name = "gun-turret", force = f}
      out.walls = s.count_entities_filtered{name = "stone-wall", force = f}
      local cap, use = 0, 0
      for _, e in pairs(s.find_entities_filtered{name = "steam-engine", force = f}) do
        cap = cap + 0.9; use = use + (e.energy_generated_last_tick or 0) * 60 / 1e6
      end
      out.pcap, out.puse = cap, use
      out.units_near = s.count_entities_filtered{type = "unit", force = "enemy", position = {%f, %f}, radius = 200}
      return out
    end)()""" % (cx, cy))
    seen = {}
    try:
        seen = json.load(open(runsite.path("seen"), encoding="utf-8")).get("enemies", {})
    except (OSError, ValueError):
        pass
    near = sorted((math.hypot(e["x"] - cx, e["y"] - cy), e["name"], e["x"], e["y"]) for e in seen.values())
    live = {w["name"]: w for w in ai.list()}
    alive = [n for n in CREW if n in live and live[n].get("alive", True)]
    done = sorted(v for v in (r.get("done") or {}).values()) if isinstance(r.get("done"), dict) else sorted(r.get("done") or [])
    print(f"tick {r['tick']:,} ({r['tick'] / 216000:.2f} h) · 진화 {r['evo']:.4f} · 연구 중 {r['cur']} {r['prog'] * 100:.0f}%")
    print(f"연구 완료 ({len(done)}): {', '.join(done)}   (* = 트리거)")
    print(f"10분 생산: 철판 {r['iron-plate']:.0f} · 구리판 {r['copper-plate']:.0f} · 빨강 {r['automation-science-pack']:.0f}"
          f" · 초록 {r['logistic-science-pack']:.0f} · 파랑 {r['chemical-science-pack']:.0f} · 강철 {r['steel-plate']:.0f}"
          f" · 플라스틱 {r['plastic-bar']:.0f} · 고급회로 {r['advanced-circuit']:.0f} · 엔진 {r['engine-unit']:.0f} · 황 {r['sulfur']:.0f}"
          f" · 포탑 {r['gun-turret']:.0f} · 탄창 {r['firearm-magazine']:.0f}")
    print(f"서 있는 포탑 {r['turrets']} · 벽 {r['walls']} · 발전 {r['pcap']:.1f} MW 에 {r['puse']:.2f} MW ({r['pcap'] / max(r['puse'], 0.01):.2f} 배)")
    if near:
        d, name, x, y = near[0]
        print(f"가장 가까운 적 구조물 (걸어서 본 것): {name} ({x:.0f},{y:.0f}) 기지 중심에서 {d:.0f}칸 · 본 것 {len(near)}")
    else:
        print("가장 가까운 적 구조물: 걸어서 본 곳 안 0 (그 너머는 모름)")
    print(f"기지 200칸 안 적 유닛 {r['units_near']} · 생존 {len(alive)}/8" + ("" if len(alive) == 8 else f" - 없음: {set(CREW) - set(alive)}"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

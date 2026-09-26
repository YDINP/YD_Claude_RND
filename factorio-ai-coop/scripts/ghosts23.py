"""유령 → 손 재건 (로봇망 밖에서 부서진 것).

23회차 (tick ~12.2M): 기지 안 스피터 침입이 과학 블록 (초록 조립기 2 · 빨강 3 · 벨트 · 팔 · 전봇대) 과 서쪽 줄 포탑 6 을 부쉈다.
건설 연구가 있어 부서진 자리에 유령이 남는다 - 그러나 북동 로봇망 밖이라 로봇이 못 온다. 유령 목록을 그대로 build 단계로 바꿔
사람이 다시 세우고, 조립기는 유령이 들고 있던 레시피를 되돌려 넣는다 (build 는 레시피를 모른다 - p30 교훈).

    python scripts/ghosts23.py                              # 유령 목록 (구역별)
    python scripts/ghosts23.py --area=-60,10,-40,30 --who alpha,bravo
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge  # noqa: E402

p1.COST.setdefault("assembling-machine-1", {"iron-plate": 22, "copper-plate": 4.5})
p1.COST.setdefault("gun-turret", {"iron-plate": 40, "copper-plate": 10})


def ghosts(ai, area):
    r = ai.lua("""(function() local o = {}
      for _, g in pairs(game.surfaces[1].find_entities_filtered{type = 'entity-ghost', force = 'player', area = {{%f, %f}, {%f, %f}}}) do
        local rec = nil
        if g.ghost_type == 'assembling-machine' then local ok, r = pcall(function() return g.get_recipe() end) if ok and r then rec = r.name end end
        o[#o + 1] = {name = g.ghost_name, x = g.position.x, y = g.position.y, d = g.direction, recipe = rec}
      end return o end)()""" % area)
    return list(r.values()) if isinstance(r, dict) else list(r or [])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", default="-200,-200,100,100")
    ap.add_argument("--who", default="")
    a = ap.parse_args()
    area = tuple(float(v) for v in a.area.split(","))
    ai = AIBridge()
    gs = ghosts(ai, area)
    print(f"  유령 {len(gs)}: " + ", ".join(sorted({g['name'] for g in gs})))
    crew = [w for w in a.who.split(",") if w]
    if not crew or not gs:
        return 0
    # 전봇대 먼저 (전력), 그다음 조립기 · 포탑, 마지막에 벨트 · 팔
    order = {"small-electric-pole": 0, "assembling-machine-1": 1, "assembling-machine-2": 1, "gun-turret": 1}
    gs.sort(key=lambda g: order.get(g["name"], 2))
    steps = [p1.b(g["name"], g["x"], g["y"], g["d"] or None) for g in gs]
    os.environ[detached.ENV] = "ghosts23"
    detached.mark(crew, "ghosts23", minutes=40)
    try:
        p1.build_stage(ai, crew, steps, "ghosts")
    finally:
        detached.release(crew)
    for g in gs:
        if g.get("recipe"):
            print("  레시피", g["name"], g["x"], g["y"], g["recipe"], ai.set_recipe(crew[0], g["x"], g["y"], g["recipe"]))
    print(f"  남은 유령 {len(ghosts(ai, area))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

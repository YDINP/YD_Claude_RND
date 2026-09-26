"""구역 포탑 탄을 관통탄으로 바꾼다 (노란 탄은 먼저 빼낸다).

포탑 탄 칸은 한 칸이라 노란 탄이 든 채로는 관통탄이 «0 개» 들어간다 (23회차 남쪽 동쪽 끝 - insert 실패).
그래서 포탑마다 take firearm-magazine → insert piercing. 관통탄은 손제작 (일반 탄창 1 + 강철 1 + 구리 5).

    python scripts/pierce23.py --area=-130,-90,-105,-20                 # 포탑 · 탄
    python scripts/pierce23.py --area=-130,-90,-105,-20 --who charlie --each 10
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge  # noqa: E402

PR, FM = "piercing-rounds-magazine", "firearm-magazine"


def turrets(ai, area):
    r = ai.lua("""(function() local o = {}
      for _, t in pairs(game.surfaces[1].find_entities_filtered{name = 'gun-turret', force = 'player', area = {{%f, %f}, {%f, %f}}}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        o[#o + 1] = {x = t.position.x, y = t.position.y, pr = inv.get_item_count('%s'), fm = inv.get_item_count('%s')} end
      return o end)()""" % (*area, PR, FM))
    return list(r.values()) if isinstance(r, dict) else list(r or [])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", required=True)
    ap.add_argument("--who", default="")
    ap.add_argument("--each", type=int, default=10)
    a = ap.parse_args()
    area = tuple(float(v) for v in a.area.split(","))
    ai = AIBridge()
    ts = turrets(ai, area)
    print("  " + " ".join(f"({t['x']:.0f},{t['y']:.0f}) pr{t['pr']} fm{t['fm']}" for t in ts))
    need = [t for t in ts if t["pr"] < a.each]
    crew = [w for w in a.who.split(",") if w]
    if not crew or not need:
        return 0
    per = (len(need) + len(crew) - 1) // len(crew)
    hub = p1.hub(ai)
    ids = {}
    os.environ[detached.ENV] = "pierce23"
    detached.mark(crew, "pierce23", minutes=40)
    try:
        for i, who in enumerate(crew):
            part = need[i * per:(i + 1) * per]
            if not part:
                continue
            n = sum(a.each - t["pr"] for t in part)
            plan = []
            for item, k in (("iron-plate", 4), ("copper-plate", 5), ("steel-plate", 1)):
                hx, hy, have = hub[item]
                if have < n * k:
                    print(f"  {who}: 허브 {item} {have} < {n * k} - 줄인다")
                    n = have // k
                plan += [("walk_to", {"x": hx, "y": hy + 1.5}), ("take", {"name": item, "x": hx, "y": hy, "count": n * k})]
            plan.append(("craft", {"recipe": PR, "count": n, "wait": True}))
            for t in part:
                plan.append(("walk_to", {"x": t["x"] + 2, "y": t["y"]}))
                if t["fm"]:
                    plan.append(("take", {"name": FM, "x": t["x"], "y": t["y"], "count": t["fm"]}))
                plan.append(("insert", {"name": PR, "x": t["x"], "y": t["y"], "count": a.each - t["pr"]}))
            ai.agent(who).cancel()
            ids[who] = ai.agent(who).submit_plan(plan)
        t0 = time.time()
        while time.time() - t0 < 1800:
            time.sleep(10)
            if all(ai.poll(t)["status"] in ("done", "failed") for v in ids.values() for t in v):
                break
        for who, v in ids.items():
            print(who, "실패", [(p.get("type"), p.get("error")) for p in (ai.poll(t) for t in v) if p["status"] == "failed"])
    finally:
        detached.release(crew)
    print("  " + " ".join(f"({t['x']:.0f},{t['y']:.0f}) pr{t['pr']} fm{t['fm']}" for t in turrets(ai, area)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

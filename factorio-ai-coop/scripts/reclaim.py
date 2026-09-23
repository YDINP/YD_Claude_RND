"""Turrets left at a cleared nest are the stock for the next one. Pick them up.

실측(21회차): 동쪽·북쪽 무리를 밀고 나니 창고의 포탑이 0 이었다. 파마다 열두 대씩
세우고 둥지가 사라진 뒤에도 그 자리에 그대로 서 있었다 - 지킬 것이 없는 자리에.
걷으면 포탑과 그 안의 탄약이 가방으로 돌아온다 (새로 만드는 것은 대당 10초·철 20).

«치운 자리»만 걷는다: 적 구조물(웜·둥지)이 KEEP 칸 안에 하나라도 있으면 그 포탑은
아직 일하는 중이다. 방어선(frontline.py)과 석유 사슬도 건드리지 않는다 - 상자
안쪽(BOXES)에 있는 것만.

    python scripts/reclaim.py                          # 몇 대를 걷을 수 있나
    python scripts/reclaim.py --who hotel,bravo,alpha  # 걷어 창고로
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

DEPOT = (-55, 10)
TURRET = "gun-turret"
KEEP = 50
# 밀기 열이 선 네모 (x1, y1, x2, y2) - 동쪽 무리, 북쪽 무리(남쪽 반)
BOXES = ((95, 65, 135, 100), (140, -40, 172, -12))
PER = 18                 # 한 사람이 한 번에 걷는 수 (걸음 + 걷기 + 귀환 = 60 안)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def spare(ai) -> list:
    """걷어도 되는 포탑 자리. [(x, y)]"""
    packed = ";".join(",".join(str(v) for v in b) for b in BOXES)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x1, y1, x2, y2 = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)")
        for _, t in pairs(s.find_entities_filtered{name = "%s", force = f,
                area = {{tonumber(x1), tonumber(y1)}, {tonumber(x2), tonumber(y2)}}}) do
          if s.count_entities_filtered{type = {"turret", "unit-spawner"}, force = "enemy",
               position = t.position, radius = %d, limit = 1} == 0 then
            out[#out+1] = string.format("%%.1f,%%.1f", t.position.x, t.position.y)
          end
        end
      end
      return out
    end)()""" % (packed, TURRET, KEEP))
    return [tuple(float(v) for v in str(r).split(",")) for r in _rows(reply)]


def plan_for(spots, drop) -> list:
    plan = []
    last = None
    for x, y in spots:
        if last is None or math.hypot(x - last[0], y - last[1]) > 6:
            plan.append(("walk_to", {"x": x - 2.5, "y": y}))
            last = (x, y)
        plan.append(("demolish", {"x": x, "y": y, "name": TURRET, "search_radius": 1.2}))
    if drop:
        plan.append(("walk_to", {"x": drop[0], "y": drop[1] + 1.5}))
    return plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    spots = spare(ai)
    print(f"  걷을 수 있는 포탑 {len(spots)}대")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and spots):
        return 0
    # 가까운 것끼리 묶는다: x 로 정렬해 사람마다 이어진 한 토막
    spots.sort(key=lambda p: (p[0] > 137, p[0], p[1]))
    per = min(PER, (len(spots) + len(crew) - 1) // len(crew))
    for i, who in enumerate(crew):
        part = spots[i * per:(i + 1) * per]
        if not part:
            continue
        try:
            ai.agent(who).cancel()
        except RconError:
            pass
        submit(ai, who, plan_for(part, DEPOT), strict=False)
        print(f"{who}: 포탑 {len(part)}대를 걷는다")
    for _ in range(120):
        time.sleep(5)
        live = {w["name"]: w for w in ai.list()}
        if all(not (live[w].get("current") or live[w].get("queued")) for w in crew if w in live):
            break
    # 가방의 포탑을 창고 상자에 내려놓는다 (탄약은 들고 있는다 - 다음 밀기에 쓴다)
    for who in crew:
        try:
            n = int(ai.agent(who).items().get(TURRET, 0))
        except RconError:
            n = 0
        at = shelf_mod.shelves(ai, DEPOT, span=36).get(TURRET) or shelf_mod.spare(ai, DEPOT, 36)
        if n and at:
            submit(ai, who, [("walk_to", {"x": at[0], "y": at[1] + 1.5}),
                             ("insert", {"name": TURRET, "x": at[0], "y": at[1], "count": n})], strict=False)
            print(f"  {who}: 포탑 {n}대를 창고 ({at[0]:.0f},{at[1]:.0f}) 에")
    print(f"  남은 것 {len(spare(ai))}대")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

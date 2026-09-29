"""Hand-mining round (P0 automation debt): mine ore at the site edge, drop it into the hungriest furnaces.

버너 채굴기가 아직 모자란 P0 동안, 직결 채굴기가 없는 화로는 사람이 먹인다. 한 바퀴:
    광석 칸 (회차 설정 edge) 에서 --count 개 손채굴 -> 반경 안 같은 광석 화로 중 입력칸이 가장 빈 곳부터 고르게 넣기
    (석탄 연료 칸이 2 미만이면 가방 석탄도 2 개씩).
버너 채굴기가 화로를 다 덮으면 끈다 (부채 갚음).

    python scripts/handore.py --run run24 --who echo --ore iron-ore
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import detached                         # noqa: E402

OWNER = "handore"
PLATE = {"iron-ore": "iron-plate", "copper-ore": "copper-plate"}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def hungry(ai, ore, at, radius) -> list:
    """[(x, y, 입력칸 광석 수, 연료 수)] - 반경 안 돌 화로, 광석 적은 것부터."""
    reply = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for _, f in pairs(s.find_entities_filtered{name = "stone-furnace", force = "player", position = {%f, %f}, radius = %d}) do
        local src = f.get_inventory(defines.inventory.furnace_source)
        local other = 0
        for _, it in pairs(src.get_contents()) do if it.name ~= "%s" then other = other + it.count end end
        local res = f.get_inventory(defines.inventory.furnace_result)
        local wrong = 0
        for _, it in pairs(res.get_contents()) do if it.name ~= "%s" then wrong = wrong + it.count end end
        if other == 0 and wrong == 0 then
          out[#out+1] = string.format("%%.1f,%%.1f,%%d,%%d", f.position.x, f.position.y,
            src.get_item_count("%s"), f.get_fuel_inventory().get_item_count("coal"))
        end
      end
      return out
    end)()""" % (at[0], at[1], radius, ore, PLATE.get(ore, ""), ore))
    rows = [tuple(float(v) for v in str(r).split(",")) for r in _rows(reply)]
    return sorted(rows, key=lambda r: r[2])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", required=True)
    ap.add_argument("--ore", default="iron-ore")
    ap.add_argument("--count", type=int, default=40)
    ap.add_argument("--radius", type=int, default=40)
    ap.add_argument("--every", type=float, default=10)
    a = ap.parse_args()
    site = runsite.load()
    ex, ey = site["edge"][a.ore]
    os.environ[detached.ENV] = OWNER
    ai = AIBridge()
    detached.mark([a.who], OWNER, minutes=600)
    try:
        while True:
            try:
                me = {w["name"]: w for w in ai.list()}.get(a.who, {})
                if not (me.get("current") or me.get("queued")):
                    bag = ai.agent(a.who).items()
                    have = int(bag.get(a.ore, 0))
                    coal = int(bag.get("coal", 0))
                    furn = [f for f in hungry(ai, a.ore, (ex, ey), a.radius) if f[2] < 10][:8]
                    plan = []
                    if have < 10 or not furn:
                        plan += [("walk_to", {"x": ex + 1.5, "y": ey + 1.5}),
                                 ("mine", {"x": ex, "y": ey, "name": a.ore, "count": a.count, "search_radius": 10})]
                        print(time.strftime("%X"), a.who, a.ore, a.count, "캔다", flush=True)
                    else:
                        each = max(1, min(20, have // len(furn)))
                        for x, y, n, fuel in furn:
                            plan += [("walk_to", {"x": x + 0.5, "y": y + 2.0}),
                                     ("insert", {"name": a.ore, "x": x, "y": y, "count": each})]
                            if fuel < 2 and coal >= 2:
                                plan.append(("insert", {"name": "coal", "x": x, "y": y, "count": 2}))
                                coal -= 2
                        print(time.strftime("%X"), a.who, f"화로 {len(furn)} 에 {each} 씩", flush=True)
                    submit(ai, a.who, plan, strict=False)
            except RconError as exc:
                print("  ", exc, flush=True)
            time.sleep(a.every)
    finally:
        detached.release([a.who])


if __name__ == "__main__":
    raise SystemExit(main())

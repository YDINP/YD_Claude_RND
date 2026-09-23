"""Walk a line of turrets and top each one up. A turret without ammo is a statue.

    사용자: "동쪽 포탑들은 탄약이 다 안채워져있음"

실측(21회차): 석유 사슬 45대 중 29대가 탄 0, 동쪽 73대 중 23대가 20발 미만. guard.py 는
기지 둘레만 돌고, 사슬은 «세울 때 넣은 것»이 전부였다. 회랑 곁을 도는 바이터 무리
스물이 echo 를 쫓아 죽였다 - 그 길의 포탑이 비어 있었다.

구역(--box) 안에서 탄이 FILL 발 미만인 포탑을 찾아, 가까운 순서로 한 바퀴 돈다.
탄약은 창고에서 집고, 모자라면 만든다 (탄창: 철 4 · 1초). 관통탄은 만들지 않는다
(강철이 든다) - 있는 만큼만.

    python scripts/ammo_run.py --box 200,-20,300,260               # 몇 대가 비었나
    python scripts/ammo_run.py --box 40,-120,200,200 --who charlie,delta --item firearm-magazine
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
import detached                          # noqa: E402
import shelf as shelf_mod                # noqa: E402
import creep                             # noqa: E402  (stock_at)

DEPOT = (-55, 10)
FILL = 20                # 이보다 적으면 채운다
TOP = 30                 # 채울 때 이만큼까지
PER = 24                 # 한 바퀴에 도는 포탑 수 (걸음+넣기 = 48 + 집기)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def hungry(ai, box) -> list:
    """[(x, y, 든 탄)]"""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f,
              area = {{%f, %f}, {%f, %f}}}) do
        local n = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
        if n < %d then out[#out+1] = string.format("%%.1f,%%.1f,%%d", t.position.x, t.position.y, n) end
      end
      return out
    end)()""" % (*box, FILL))
    out = []
    for r in _rows(reply):
        x, y, n = str(r).split(",")
        out.append((float(x), float(y), int(n)))
    return out


def tour(spots, start):
    """가장 가까운 것부터 잇는 길 (욕심쟁이)."""
    left, out, at = list(spots), [], start
    while left:
        nxt = min(left, key=lambda p: math.hypot(p[0] - at[0], p[1] - at[1]))
        left.remove(nxt)
        out.append(nxt)
        at = nxt[:2]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--box", required=True, help="x1,y1,x2,y2")
    ap.add_argument("--who", default="")
    ap.add_argument("--item", default="piercing-rounds-magazine")
    ap.add_argument("--rounds", type=int, default=4)
    args = ap.parse_args()
    box = tuple(float(v) for v in args.box.split(","))
    ai = AIBridge()
    need = hungry(ai, box)
    print(f"  탄 {FILL}발 미만 포탑 {len(need)}대 (빈 것 {sum(1 for _x, _y, n in need if n == 0)})")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and need):
        return 0
    os.environ[detached.ENV] = "ammo"
    detached.mark(crew, owner="ammo", minutes=25 * args.rounds)
    try:
        for n_round in range(args.rounds):
            need = hungry(ai, box)
            if not need:
                print("  다 찼다")
                break
            path = tour(need, DEPOT)
            per = min(PER, (len(path) + len(crew) - 1) // len(crew))
            for i, who in enumerate(crew):
                part = path[i * per:(i + 1) * per]
                if not part:
                    continue
                want = sum(TOP - n for _x, _y, n in part)
                try:
                    bag = int(ai.agent(who).items().get(args.item, 0))
                except RconError:
                    bag = 0
                plan = []
                lack = want - bag
                if lack > 0:
                    at = shelf_mod.shelves(ai, DEPOT, span=36).get(args.item) or creep.stock_at(ai, args.item, 1)
                    if at:
                        plan += [("walk_to", {"x": at[0], "y": at[1] + 1.5}),
                                 ("take", {"name": args.item, "x": at[0], "y": at[1], "count": lack})]
                    elif args.item == "firearm-magazine":
                        iron = shelf_mod.shelves(ai, DEPOT, span=36).get("iron-plate")
                        plan += [("walk_to", {"x": iron[0], "y": iron[1] + 1.5}),
                                 ("take", {"name": "iron-plate", "x": iron[0], "y": iron[1], "count": lack * 4}),
                                 ("craft", {"recipe": args.item, "count": lack, "wait": True})]
                for x, y, n in part:
                    plan += [("walk_to", {"x": x - 2, "y": y + 1.5}),
                             ("insert", {"name": args.item, "x": x, "y": y, "count": TOP - n})]
                try:
                    ai.agent(who).cancel()
                except RconError:
                    pass
                submit(ai, who, plan[:60], strict=False)
                print(f"{who}: {n_round + 1}바퀴 포탑 {len(part)}대 ({want}발)")
            for _ in range(180):
                time.sleep(5)
                live = {w["name"]: w for w in ai.list()}
                if all(not (live[w].get("current") or live[w].get("queued")) for w in crew
                       if live.get(w, {}).get("alive")):
                    break
            if not any(w["alive"] for w in ai.list() if w["name"] in crew):
                break
    finally:
        detached.release(crew)
    left = hungry(ai, box)
    print(f"  남은 것 {len(left)}대 (빈 것 {sum(1 for _x, _y, n in left if n == 0)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

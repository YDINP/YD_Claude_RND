"""Hand-fed red science: automation debt #3 of run 23 (off when a red assembler line exists).

전기가 막 들어왔고 연구가 방어 관문 D (gun-turret, military) 를 연다. 조립기(automation)가 연구되기
전이라 빨강 팩은 손으로 만든다. 사람마다 연구소 하나 - 허브 판으로 10개씩 만들어 넣는다.

    python scripts/redsci.py --pairs echo:-53.5,-55.5 foxtrot:-47.5,-55.5
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import detached                          # noqa: E402
import p1                                # noqa: E402

OWNER = "redsci"
PACK = "automation-science-pack"
BATCH = 10
POLE = (-50.5, -58.5)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", nargs="+", required=True, help="이름:x,y (연구소 자리)")
    ap.add_argument("--every", type=float, default=20)
    args = ap.parse_args()
    pairs = []
    for s in args.pairs:
        who, xy = s.split(":")
        x, y = (float(v) for v in xy.split(","))
        pairs.append((who, x, y))
    os.environ[detached.ENV] = OWNER
    ai = AIBridge()
    crew = [w for w, _x, _y in pairs]
    detached.mark(crew, OWNER, minutes=600)
    first = True
    try:
        while True:
            try:
                live = {w["name"]: w for w in ai.list()}
                h = p1.hub(ai)
                for who, x, y in pairs:
                    me = live.get(who, {})
                    if me.get("current") or me.get("queued"):
                        continue
                    have = ai.lua("""(function() local l = game.surfaces[1].find_entity("lab", {%f, %f})
                      return {lab = l ~= nil, n = l and l.get_inventory(defines.inventory.lab_input).get_item_count("%s") or 0} end)()"""
                                  % (x, y, PACK))
                    if have.get("lab") and int(have.get("n", 0)) >= BATCH:
                        continue
                    hx, hy, _ = h["iron-plate"]
                    cx, cy, _ = h["copper-plate"]
                    plan = [("walk_to", {"x": hx, "y": hy + 1.5}),
                            ("take", {"name": "iron-plate", "x": hx, "y": hy, "count": 2 * BATCH + (40 if not have.get("lab") else 0)}),
                            ("take", {"name": "copper-plate", "x": cx, "y": cy, "count": BATCH + (20 if not have.get("lab") else 0)})]
                    if not have.get("lab"):
                        plan += [("craft", {"recipe": "lab", "count": 1, "wait": True}),
                                 ("walk_to", {"x": x, "y": y + 3.0}),
                                 ("build", {"name": "lab", "x": x, "y": y})]
                        if first:
                            plan += [("craft", {"recipe": "small-electric-pole", "count": 1, "wait": True}),
                                     ("build", {"name": "small-electric-pole", "x": POLE[0], "y": POLE[1]})]
                            first = False
                    plan += [("craft", {"recipe": PACK, "count": BATCH, "wait": True}),
                             ("walk_to", {"x": x, "y": y + 3.0}),
                             ("insert", {"name": PACK, "x": x, "y": y, "count": BATCH})]
                    submit(ai, who, plan, strict=False)
                    print(time.strftime("%X"), who, "빨강", BATCH, "->", (x, y), flush=True)
            except (RconError, KeyError) as exc:
                print("  ", exc, flush=True)
            time.sleep(args.every)
    finally:
        detached.release(crew)


if __name__ == "__main__":
    raise SystemExit(main())

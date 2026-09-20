"""The trunk line: carry the electricity to where the work is.

20회차의 발전소는 물가에 있고 기지는 83칸 떨어져 있다. 그 판단은 옳았다 -
전봇대 스무 대를 깔면서 연구를 기다리느니 초소 하나를 보내는 편이 빨랐고,
실제로 연구소가 37분에 섰다(18회차 62분, 19회차 미완).

그런데 «다음 단계»는 그 선택의 값을 치른다. 조립기도 전기 채굴기도
전기가 있어야 돌고, 그것들은 기지에 서야 한다. 초소에 지을 수는 없다.

    기지에 전기가 없으면 조립은 시작조차 못 한다.

그래서 이제는 선을 깐다. 83칸에 전봇대 열두 대, 나무 열둘과 구리판
스물넷이면 된다 - 연구소를 기다리던 때와 달리, 지금은 그만한 것이 있다.
순서가 바뀐 것이 아니라 «때가 된» 것이다.

    python scripts/mains.py --who alpha --from=-52,-9 --to=30,0
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

POLE = "small-electric-pole"
REACH = 7                 # 전선이 닿는 거리. 7.5 지만 반 칸은 남겨 둔다
PER_TRIP = 10             # 한 걸음에 세우는 전봇대
WOOD_PER_POLE = 1         # 전봇대 둘에 나무 하나지만, 넉넉히 센다
COPPER_PER_POLE = 2       # 전봇대 하나에 구리선 둘 = 구리판 하나

# 전봇대는 나무 «와» 구리를 먹는다.
#
# 나무만 챙겨 보냈더니 bravo 가 「전봇대 10대」를 네 번 찍는 동안 세상의
# 전봇대는 한 대 그대로였다. 구리선을 못 만들어 craft 가 조용히 실패한
# 것이다 - 로그는 «시킨 것»을 찍지 «된 것»을 찍지 않는다.
#
# 재료가 둘이면 둘 다 챙겨야 한다. 하나만 챙기는 것은 안 챙긴 것과 같다.


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def line(start, end, step=REACH):
    """두 점 사이에 «전선이 닿는 간격»으로 자리를 찍는다."""
    span = math.hypot(end[0] - start[0], end[1] - start[1])
    n = max(1, int(span // step))
    return [(round(start[0] + (end[0] - start[0]) * i / n),
             round(start[1] + (end[1] - start[1]) * i / n))
            for i in range(1, n + 1)]


def missing(ai, spots):
    """아직 전봇대가 없고, 놓을 수 있는 자리만."""
    if not spots:
        return []
    body = ", ".join(f"{{{x},{y}}}" for x, y in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      local spots = { %s }
      for i, p in ipairs(spots) do
        local here = s.count_entities_filtered{position = {p[1], p[2]},
                     radius = 3, type = "electric-pole", force = f}
        if here > 0 then
          out[i] = 0
        else
          out[i] = s.can_place_entity{name = "small-electric-pole",
                   position = {p[1], p[2]}, force = f} and 1 or 2
        end
      end
      return out
    end)()""" % body)
    ok = _rows(reply)
    out = []
    for i, at in enumerate(spots):
        if i >= len(ok):
            break
        if int(ok[i]) == 1:
            out.append(at)
        elif int(ok[i]) == 2:
            # 못 놓는 칸이면 옆으로 한 칸 비켜 본다. 물가와 절벽에서 흔하다.
            out.append((at[0] + 2, at[1] + 2))
    return out


def joined(ai, a, b):
    """두 자리가 «같은 전력망»에 있나. 「세웠다」와 «흐른다»는 다르다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local function net(x, y)
        local p = s.find_entities_filtered{position = {x, y}, radius = 6,
                  type = "electric-pole", force = f, limit = 1}[1]
        return p and p.electric_network_id or 0
      end
      local one, two = net(%d, %d), net(%d, %d)
      return { one = one, two = two, same = (one ~= 0 and one == two) and 1 or 0 }
    end)()""" % (a[0], a[1], b[0], b[1]))
    return int(reply["same"]) == 1


def woods(ai, near):
    """가장 가까운 나무. «있는 데»로 가서 베어야 한다.

    전봇대 열한 대에 드는 나무는 여섯이다. 그런데 이 판의 간선 경로에는
    나무가 한 그루도 없어서, 짓는 자리에서 베라고 시키면 「반경 안에
    나무가 없다」로 계획 전체가 멈춘다.

    적은 재료라도 «어디 있는지»는 알아야 한다.
    """
    x, y = near
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local best, bd = nil, 1e18
      for _, t in pairs(s.find_entities_filtered{type = "tree",
                position = {%d, %d}, radius = 220}) do
        local d = (t.position.x - %d)^2 + (t.position.y - %d)^2
        if d < bd then bd, best = d, t end
      end
      if not best then return { none = 1 } end
      return { x = best.position.x, y = best.position.y,
               gap = math.floor(math.sqrt(bd)) }
    end)()""" % (x, y, x, y))
    if reply.get("none"):
        return None
    return (float(reply["x"]), float(reply["y"]), int(reply["gap"]))


def busy(ai, who):
    row = next((w for w in ai.list() if w["name"] == who), None)
    if not row or not row.get("alive"):
        return None
    return bool(row.get("current") or row.get("queued"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--from", dest="src", required=True,
                    help="발전소 쪽. 음수는 --from=-52,-9")
    ap.add_argument("--to", dest="dst", required=True, help="기지 쪽")
    ap.add_argument("--depot", default=None,
                    help="구리판을 집어 올 창고. 음수는 --depot=-5,-90")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=200)
    args = ap.parse_args()

    crew = args.who or ["alpha"]
    src = tuple(int(v) for v in args.src.split(","))
    dst = tuple(int(v) for v in args.dst.split(","))
    depot = tuple(int(v) for v in args.depot.split(",")) if args.depot else None
    ai = AIBridge()

    spots = line(src, dst)
    print(f"{src} -> {dst} : {math.hypot(dst[0]-src[0], dst[1]-src[1]):.0f}칸, "
          f"전봇대 {len(spots)}대")

    for _ in range(args.rounds):
        try:
            if joined(ai, src, dst):
                print("전기가 기지까지 흐른다. 조립을 시작할 수 있다.")
                return 0
            who = next((n for n in crew if busy(ai, n) is False), None)
            if not who:
                time.sleep(args.every)
                continue

            todo = missing(ai, spots)
            if not todo:
                print("  자리는 다 찼는데 망이 안 이어졌다 - 간격을 의심할 것")
                time.sleep(args.every)
                continue

            batch = todo[:PER_TRIP]
            held = ai.agent(who).items()
            need = len(batch) * WOOD_PER_POLE + 4
            copper = len(batch) * COPPER_PER_POLE + 4
            plan = []
            if depot and int(held.get("copper-plate", 0)) < copper:
                plan += [("walk_to", {"x": depot[0] - 2, "y": depot[1] + 1}),
                         ("take", {"name": "copper-plate", "x": depot[0] + 0.5,
                                   "y": depot[1] + 0.5, "count": copper})]
            if int(held.get("wood", 0)) < need:
                grove = woods(ai, batch[0])
                if not grove:
                    print("  둘레에 나무가 없다 - 전봇대를 못 만든다")
                    time.sleep(args.every)
                    continue
                plan += [("walk_to", {"x": grove[0], "y": grove[1]}),
                         ("chop", {"x": grove[0], "y": grove[1], "count": need})]
            plan.append(("craft", {"recipe": POLE, "count": len(batch)}))
            for at in batch:
                plan.append(("build", {"name": POLE, "x": at[0], "y": at[1],
                                       "snap": True}))
            submit(ai, who, plan, strict=False)
            print(f"{who}: 전봇대 {len(batch)}대 "
                  f"({batch[0][0]},{batch[0][1]}) 부터 - 남은 {len(todo)}자리")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    print("간선이 시간 안에 안 이어졌다.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

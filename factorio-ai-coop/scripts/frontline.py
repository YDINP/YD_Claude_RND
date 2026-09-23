"""A forward line of turrets outside the perimeter, facing a nest cluster.

    사용자: "남서쪽 적기지하나 더 생겻다. 기지방어선 외부쪽으로 1차방어선
             남서쪽에 구축하자"

둘레(포탑 고리)는 기지를 두르지만, 무리는 둥지에서 «한 방향»으로 온다.
그 방향에 둘레보다 앞선 줄을 하나 더 두면 무리가 둘레에 닿기 전에 먼저
맞는다 - 그리고 둘레는 손상 없이 남는다.

    줄: 둘레에서 그 방향으로 OUT 칸 나간 점을 중심으로, 방향에 «직각»인
        선분. 포탑은 STEP 칸마다 (사거리 18 안에 이웃 셋 이상 = guard 규칙).
        탄약은 관통탄 AMMO 발씩. 벽 고리는 wall.py 가 뒤따라 두른다.

    python scripts/frontline.py --from=-157,113 --to=-97,173            # 자리만
    python scripts/frontline.py --from=-157,113 --to=-97,173 --who charlie,hotel,golf --go
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge  # noqa: E402
from orders import submit    # noqa: E402
import creep                 # noqa: E402  (outfit / placeable / stock_at / crew_pos)

TURRET = "gun-turret"
STEP = 6
AMMO = 20
PIERCING = "piercing-rounds-magazine"


def seats(a, b, step=STEP) -> list:
    """a 에서 b 까지 step 칸마다. 2x2 라 중심은 정수."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    span = math.hypot(dx, dy)
    n = int(span // step) + 1
    out = []
    for i in range(n):
        t = i / max(1, n - 1)
        out.append((int(round(a[0] + dx * t)), int(round(a[1] + dy * t))))
    return out


def fit(ai, spots) -> list:
    """놓을 수 없는 자리는 선분을 따라 한두 칸 밀어 본다 (나무·바위)."""
    ok = set(creep.placeable(ai, spots))
    out = []
    for i, (x, y) in enumerate(spots):
        if (x, y) in ok:
            out.append((x, y))
            continue
        nxt = spots[min(i + 1, len(spots) - 1)]
        ux, uy = nxt[0] - x, nxt[1] - y
        span = max(1.0, math.hypot(ux, uy))
        tries = [(int(round(x + ux / span * k)), int(round(y + uy / span * k))) for k in (2, -2, 3, -3)]
        got = creep.placeable(ai, tries)
        if got:
            out.append(got[0])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="a", required=True, help="선분 시작. 음수는 --from=-157,113")
    ap.add_argument("--to", dest="b", required=True)
    ap.add_argument("--who", default="")
    ap.add_argument("--go", action="store_true")
    args = ap.parse_args()
    a = tuple(float(v) for v in args.a.split(","))
    b = tuple(float(v) for v in args.b.split(","))
    ai = AIBridge()

    spots = fit(ai, seats(a, b))
    print(f"  자리 {len(spots)}곳: " + " ".join(f"({x},{y})" for x, y in spots))
    if not (args.go and args.who):
        return 0
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    k = len(crew)
    per = (len(spots) + k - 1) // k
    for i, who in enumerate(crew):
        part = spots[i * per:(i + 1) * per]
        if not part:
            continue
        plan = creep.outfit(ai, who, len(part) + 1, PIERCING, AMMO * len(part) + 10)
        for x, y in part:
            plan.append(("walk_to", {"x": x + 3, "y": y - 3}))
            plan.append(("build", {"name": TURRET, "x": x, "y": y}))
            plan.append(("insert", {"name": PIERCING, "x": x, "y": y, "count": AMMO}))
        plan.append(("walk_to", {"x": -60, "y": 40}))
        submit(ai, who, plan[:60], strict=False)
        print(f"{who}: 포탑 {len(part)}대 ({part[0]} .. {part[-1]})")
    for _ in range(120):
        time.sleep(5)
        pos = creep.crew_pos(ai)
        if all(not pos[w][4] for w in crew):
            break
    st = creep.turret_state(ai, spots)
    print(f"  섰다 {len(st)}/{len(spots)} · 탄약 {[n for _h, n in st]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

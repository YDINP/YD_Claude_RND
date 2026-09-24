"""P6 for run 22: the trunk iron drills are running dry - a second iron column to the west.

측정 (tick 2.7M): 간선 서쪽 철 채굴기 12 중 둘은 광석 0, 넷은 6천 이하. 철 화로 24 중 9 가
no_ingredients. 남은 철은 서쪽 x -20..-10, y -80..-60 (약 66만).

새 기둥: 벨트 x=-12.5 남향, 양쪽 채굴기 (서 x=-14.5 동향 · 동 x=-10.5 서향 - 둘 다 벨트에 떨군다)
6줄 = 12대 = 6/s. 허브 줄 (y -54.5, x -10.5..-3) 위에서 끝낸다. 벨트는 y=-47.5 에서 동쪽으로
꺾어 간선 (0.5,-47.5) 에 서쪽에서 옆치기 -> 가까운 레인 = 서쪽 L2 (철 레인, 실측 규칙).
석탄 L1 은 건드리지 않는다. 옆치기 자리에 선 다 캔 채굴기 (-1.5,-47.5) 는 걷는다.

    python scripts/p6.py
    python scripts/p6.py --stage iron3 --who alpha,golf,echo
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge  # noqa: E402
import detached               # noqa: E402
import p1                     # noqa: E402

b = p1.b
N, E, S, W = 0, 4, 8, 12
BELT, EMD, POLE = p1.BELT, p1.EMD, p1.POLE
COL_X = -12.5
ROWS = [-77.5 + 3 * k for k in range(6)]          # 채굴기 중심 y (-79 .. -61)
JOIN_Y = -47.5


def iron3poles_steps():
    """전봇대를 먼저 (따로 단계): 새 줄이 (-4.5,-68.5) 와 서쪽 구리 줄 (-16.5,-66.5) 을 다시 잇고 나서야
    동쪽 채굴기 자리의 중계 전봇대 (-10.5,-66.5) 를 걷는다 - 구리 전기가 끊기지 않게.
    한 단계에 섞으면 여럿이 나눠 짓다가 철거가 먼저 끝날 수 있다."""
    out = [b(POLE, -16.5, y) for y in (-76.5, -70.5, -64.5)]
    out += [b(POLE, -8.5, y) for y in (-76.5, -70.5, -64.5, -59.5)]
    out.append(b(POLE, -14.5, -59.5))
    return out


def iron3_steps():
    out = iron3poles_steps()
    out += [("demolish", {"x": -10.5, "y": -66.5, "name": POLE, "search_radius": 0.3}),
            ("demolish", {"x": -1.5, "y": JOIN_Y, "name": EMD, "search_radius": 0.5})]
    out += [b(BELT, COL_X, y + 0.5, S) for y in range(-80, int(JOIN_Y - 0.5))]      # -79.5 .. -48.5
    out += [b(BELT, x + 0.5, JOIN_Y, E) for x in range(int(COL_X - 0.5), 0)]       # -12.5 .. -0.5
    for y in ROWS:
        out += [b(EMD, COL_X - 2, y, E), b(EMD, COL_X + 2, y, W)]
    return out


STAGES = {"iron3poles": iron3poles_steps, "iron3": iron3_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    for name, fn in STAGES.items():
        steps = fn()
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {p1.blocked(ai, steps)}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p6"
    detached.mark(crew, "p6", minutes=120)
    try:
        ok = p1.build_stage(ai, crew, STAGES[args.stage](), args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

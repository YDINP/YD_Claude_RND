"""P5 builder for run 22: crude oil from field A (165..185, -359..-346) to a refinery site at base.

정찰(fogwalk, 2026-09-24)로 원유 두 곳을 찾았다: A (165..185, -359..-346) 6곳 - 기지에서 약 360칸,
B (347..359, -217..-202) 7곳. 알려진 둥지 셋은 다 570칸 밖이다. A 부터.

연구 경로 (전부 빨강·초록): engine -> fluid-handling -> oil-gathering(펌프잭) -> oil-processing
(원유를 캐면 열린다) -> plastics · sulfur-processing -> advanced-circuit -> chemical-science-pack.
관로는 연구와 따로 지금 깐다.

관로: 지하 파이프 쌍 (게임 실측: 방향 d 면 지상 연결이 d 쪽, 지하는 반대쪽 최대 10칸).
    남향 구간: 입구 N · 출구 S / 서향 구간: 입구 E · 출구 W
유전 집결점 (170.5,-340.5) -> 남쪽 x=170.5 -> y=-40.5 -> 서쪽 -> 정유소 부지 (60.5,-40.5).
전력: 관 옆 x=172.5 / y=-38.5 에 소형 전봇대 7칸 간격, 기지 망 (9.5,-36.5) 까지.

    python scripts/p5.py
    python scripts/p5.py --stage probe --who bravo      # 첫 쌍만 - 이어지는지 잰다
    python scripts/p5.py --stage pipeline --who bravo,hotel
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
UGP, PIPE, POLE = "pipe-to-ground", "pipe", p1.POLE
SPAN = 10
TOP = (170.5, -340.5)         # 유전 집결점
CORNER = (170.5, -40.5)
END = (60.5, -40.5)           # 정유소 부지 입구

p1.COST.update({UGP: {"iron-plate": 7.5}})
p1.PAIRED.add(UGP)


def run(x0, y0, x1, y1):
    """직선 한 구간을 지하 파이프 쌍으로. 남는 칸은 보통 파이프."""
    out = []
    if x0 == x1:                                  # 남향
        y = y0
        while y + SPAN <= y1:
            out += [b(UGP, x0, y, N), b(UGP, x0, y + SPAN, S)]
            y += SPAN + 1
        while y <= y1:
            out.append(b(PIPE, x0, y))
            y += 1
    else:                                         # 서향
        x = x0
        while x - SPAN >= x1:
            out += [b(UGP, x, y0, E), b(UGP, x - SPAN, y0, W)]
            x -= SPAN + 1
        while x >= x1:
            out.append(b(PIPE, x, y0))
            x -= 1
    return out


def pipeline_steps():
    out = run(TOP[0], TOP[1], CORNER[0], CORNER[1] - 1)
    out.append(b(PIPE, CORNER[0], CORNER[1]))                 # 꺾이는 칸
    out += run(CORNER[0] - 1, CORNER[1], END[0], END[1])
    return out


def poles_steps():
    out = []
    y = TOP[1]
    while y <= CORNER[1]:
        out.append(b(POLE, TOP[0] + 2, y))
        y += 7
    x = CORNER[0] + 2
    while x >= 9.5:
        out.append(b(POLE, x, CORNER[1] + 2))
        x -= 7
    return out


def probe_steps():
    return pipeline_steps()[:2] + [b(PIPE, TOP[0], TOP[1] - 1)]


STAGES = {"probe": probe_steps, "pipeline": pipeline_steps, "poles": poles_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    for name, fn in STAGES.items():
        steps = fn()
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p5"
    detached.mark(crew, "p5", minutes=180)
    try:
        ok = p1.build_stage(ai, crew, STAGES[args.stage](), args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

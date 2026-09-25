"""P1 power for run 23: steam next to the coal, water piped in from the lake.

물은 기지 중심 (-60,-50) 에서 128칸 (남동 (37,34)). 석탄 벨트 130칸 (철 ~195) 대신 물을 지하 파이프로
끌어온다 (쌍당 11칸, 철 ~90). 보일러는 석탄 광맥 동쪽 끝 옆 - 급탄이 짧다. 구간 크기 91x63 (< 320).

    펌프 (38.5,33.5) S (남쪽이 물 - 22회차 실측: 방향 S 면 출구가 북쪽 칸)
      -> 북 x=37.5 -> y=-58.5 -> 서 -> 보일러 B1 남쪽 물 칸 (-35.5,-58.5)
    보일러 x=-36 서향, 세로로 맞붙임 (B1 y=-60.5, B2 -63.5, 나중 B3·B4), 증기 출구 (-27.5,y) 에 관 1칸,
    엔진 -40.5 · -45.5 (동향). 관 열 x=-37.5 의 빈칸이 전봇대 자리.
    석탄: 전기 채굴기 x=-35.5 동향 -> 벨트 x=-33.5 남향 -> 보일러 팔 (-34.5,y) 동쪽에서 집는다.

    python scripts/p23.py
    python scripts/p23.py --stage water --who alpha,bravo
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
UGP, PIPE, POLE, BELT, INS, EMD = "pipe-to-ground", "pipe", p1.POLE, p1.BELT, p1.INS, p1.EMD
SPAN = 10
PUMP = (38.5, 33.5)                    # manual can_place 로 호숫가를 다 훑어 가장 가까운 칸 (37.5 는 막혔다)
TURN = (38.5, -58.5)
INLET = (-35.5, -58.5)                 # B1 남쪽 물 연결 칸
BOILER_X = -36                         # 석탄 동쪽 끝 실측 (y -80..-92 에서 x -32..-37) 에 맞춰
BOILER_YS = (-60.5, -63.5)             # P1 첫 두 대 (3.6MW). 넷이면 -66.5, -69.5 를 더한다
COAL_BELT_X = -33.5
COAL_DRILL_YS = (-81.5, -84.5, -87.5)

p1.COST.update({UGP: {"iron-plate": 7.5}, "offshore-pump": {"iron-plate": 5, "copper-plate": 3}})   # 회로 2 - 구리를 안 챙겨 제작이 조용히 실패했다
p1.PAIRED.add(UGP)


def run(x0, y0, x1, y1):
    """직선 한 구간을 지하 파이프 쌍으로 (p5.run 과 같은 규칙, 방향 일반화). 남는 칸은 보통 관."""
    out = []
    if x0 == x1:
        step = -1 if y1 < y0 else 1
        enter, leave = (S, N) if step < 0 else (N, S)        # 지상 연결이 d 쪽, 지하는 반대쪽 (실측)
        y = y0
        while (y + step * SPAN - y1) * step <= 0:
            out += [b(UGP, x0, y, enter), b(UGP, x0, y + step * SPAN, leave)]
            y += step * (SPAN + 1)
        while (y - y1) * step <= 0:
            out.append(b(PIPE, x0, y))
            y += step
    else:
        step = -1 if x1 < x0 else 1
        enter, leave = (E, W) if step < 0 else (W, E)
        x = x0
        while (x + step * SPAN - x1) * step <= 0:
            out += [b(UGP, x, y0, enter), b(UGP, x + step * SPAN, y0, leave)]
            x += step * (SPAN + 1)
        while (x - x1) * step <= 0:
            out.append(b(PIPE, x, y0))
            x += step
    return out


def water_steps():
    out = [b("offshore-pump", PUMP[0], PUMP[1], S)]
    out += run(PUMP[0], PUMP[1] - 1, TURN[0], TURN[1] + 1)
    out.append(b(PIPE, TURN[0], TURN[1]))
    out += run(TURN[0] - 1, TURN[1], INLET[0], INLET[1])
    return out


def boiler_steps():
    out = []
    for y in BOILER_YS:
        out += [b("boiler", BOILER_X, y, W), b(PIPE, BOILER_X - 1.5, y),
                b("steam-engine", BOILER_X - 4.5, y, E), b("steam-engine", BOILER_X - 9.5, y, E),
                b(INS, BOILER_X + 1.5, y, E)]
    # 전봇대: 관 열 (x=-27.5) 의 빈칸 + 엔진 서쪽 끝 (22회차: 관 열 덮개는 서쪽 엔진에 안 닿았다)
    out += [b(POLE, BOILER_X - 1.5, -62.0), b(POLE, BOILER_X - 13.5, -62.0), b(POLE, BOILER_X + 1.5, -65.5)]
    return out


def coal_steps():
    out = [b(EMD, COAL_BELT_X - 2, y, E) for y in COAL_DRILL_YS]
    y = COAL_DRILL_YS[-1] - 1
    while y <= BOILER_YS[0] + 1:
        out.append(b(BELT, COAL_BELT_X, y, S))
        y += 1
    out += [b(POLE, COAL_BELT_X - 4.5, -76.0), b(POLE, COAL_BELT_X + 1.5, -70.0)]
    return out


STAGES = {"water": water_steps, "boilers": boiler_steps, "coal": coal_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    for name, fn in STAGES.items():
        steps = fn()
        bad = p1.blocked(ai, steps)
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(bad)} {bad[:6]}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p23"
    detached.mark(crew, "p23", minutes=120)
    try:
        ok = p1.build_stage(ai, crew, STAGES[args.stage](), args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

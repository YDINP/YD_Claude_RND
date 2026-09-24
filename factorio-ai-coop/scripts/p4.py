"""P4 builder for run 22: labs to match production, and a steel line into a construction store.

P2 측정 (docs/run22-site.md): 빨강 0.78/s 인데 초록 조립기가 full_output - 연구소 10대가 팩을
다 못 먹는다. 상한이 «연구소 수»다. 그래서 생산이 상한이 될 때까지 연구소를 늘리고(labs2),
그다음에 조립기 2형으로 생산을 올린다 - 둘을 번갈아 맞추는 것이 «병목 없이».

강철: 철 척추 x=5 는 끝이 꽉 차 있다 (벨트당 7~8) - 남는 철 약 2/s. 강철 화로 2대
(속도 2: 강철 8초에 하나, 철 5) = 강철 0.25/s, 철 1.25/s. 석탄은 보일러 가지 x=25.5 에서
분배기로 뺀다. 강철은 «짓는 재료» 상자로 - 조립기 2형·펌프잭·관통탄에 쓴다 (창고는 짓는
재료만 둔다는 교리 그대로).

    python scripts/p4.py
    python scripts/p4.py --stage labs2 --who charlie,delta
    python scripts/p4.py --stage steel --who echo,foxtrot
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
BELT, INS, POLE, SPLIT = p1.BELT, p1.INS, p1.POLE, p1.SPLIT
LAB, SFURN, CHEST = "lab", "steel-furnace", "iron-chest"

p1.COST.update({
    LAB: {"iron-plate": 36, "copper-plate": 15},
    SFURN: {"steel-plate": 6, "stone": 10},          # 벽돌 10 - 손제작은 돌을 벽돌로 못 굽는다: 아래 fetch 가 벽돌을 먼저 본다
})


def labs2_steps():
    """팩 벨트 x=-37.5 를 y 45 까지 늘리고 양쪽에 연구소 3줄 (y 38·41·44). y 37 은 전봇대 (-34.5,36.5) 와 겹친다."""
    out = [b(BELT, -37.5, y + 0.5, S) for y in range(36, 46)]
    for y in (38, 41, 44):
        out += [b(LAB, -40.5, y + 0.5), b(INS, -38.5, y + 0.5, E),
                b(LAB, -34.5, y + 0.5), b(INS, -36.5, y + 0.5, W)]
    out += [b(POLE, -38.5, 39.5), b(POLE, -38.5, 42.5), b(POLE, -38.5, 45.5)]
    return out


def steel_steps():
    """강철 화로 2 (척추 x=5 와 석탄 줄 x=10.5 사이), 출력은 위·아래 상자."""
    out = [("demolish", {"x": p1.BRANCH_X, "y": -10.5, "name": BELT, "search_radius": 0.4}),
           b(SPLIT, 25.0, -10.5, S)]                         # 오른쪽(서쪽) 출구 -> 석탄 줄
    out += [b(BELT, x + 0.5, -9.5, W) for x in range(24, 10, -1)]
    out += [b(BELT, 10.5, y + 0.5, N) for y in range(-10, -16, -1)]    # (10.5,-15.5) 는 전력선 전봇대
    # 강철 화로는 강철 6 + 벽돌 10 - 강철이 아직 0 이다. 첫 두 대는 돌 화로(강철 0.0625/s 씩),
    # 나온 강철로 강철 화로로 바꾼다.
    out += [b(p1.FURN, 8.0, -14.0), b(p1.FURN, 8.0, -12.0),
            b(INS, 6.5, -14.5, W), b(INS, 6.5, -12.5, W),     # 척추에서 철
            b(INS, 9.5, -14.5, E), b(INS, 9.5, -12.5, E),     # 석탄 줄에서 석탄
            b(INS, 7.5, -15.5, S), b(CHEST, 7.5, -16.5),      # 위 화로 -> 위 상자
            b(INS, 7.5, -10.5, N), b(CHEST, 7.5, -9.5),       # 아래 화로 -> 아래 상자
            b(POLE, 9.5, -13.5), b(POLE, 6.5, -11.5)]
    return out


STAGES = {"labs2": labs2_steps, "steel": steel_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    for name, fn in STAGES.items():
        steps = fn()
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(p1.blocked(ai, steps))}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p4"
    detached.mark(crew, "p4", minutes=120)
    try:
        ok = p1.build_stage(ai, crew, STAGES[args.stage](), args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

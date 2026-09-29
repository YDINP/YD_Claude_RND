"""P0-4 / P1 power for run 24: first steam at the lake, first labs beside the engines.

물은 기지 중심 (70,-15) 에서 서쪽 ~115칸. 23회차 복기 «발전은 처음부터 물가에» 대로 발전소를 물가에 세우고,
첫 연구소 둘은 기관 곁에 둔다 (전봇대 두 개로 끝 - 관문 D 연구 gun-turret · military 를 가장 빨리 연다).
기지로 가는 전봇대 줄은 electric-mining-drill 연구 뒤 (P1) 에 따로.

자리는 모드의 power_plan (확인된 좌표) 에서: 펌프 (-41.5,15.5) S · 보일러 (-42,13.5) W · 기관 (-45.5,13.5) · (-50.5,13.5) E.

    python scripts/power24.py --run run24                       # 단계별로 몇 개 섰나 · 막힘
    python scripts/power24.py --run run24 --stage plant --who alpha,bravo
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                # noqa: E402,F401  (--run)
from client import AIBridge   # noqa: E402
import detached               # noqa: E402
import p1                     # noqa: E402

b = p1.b
N, E, S, W = 0, 4, 8, 12
POLE = p1.POLE
PUMP = (-41.5, 15.5)
BOILER = (-42, 13.5)
ENGINES = ((-45.5, 13.5), (-50.5, 13.5))
LABS = ((-45.5, 8.5), (-39.5, 8.5))
POLES = ((-45.5, 11.5), (-42.5, 10.5))

p1.COST.update({"offshore-pump": {"iron-plate": 5, "copper-plate": 3},
                "lab": {"iron-plate": 36, "copper-plate": 15}})


def plant_steps():
    out = [b("offshore-pump", PUMP[0], PUMP[1], S), b("boiler", BOILER[0], BOILER[1], W)]
    out += [b("steam-engine", x, y, E) for x, y in ENGINES]
    out += [b(POLE, x, y) for x, y in POLES]
    return out


def labs_steps():
    return [b("lab", x, y) for x, y in LABS]


STAGES = {"plant": plant_steps, "labs": labs_steps}


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
    os.environ[detached.ENV] = "power24"
    detached.mark(crew, "power24", minutes=120)
    try:
        ok = p1.build_stage(ai, crew, STAGES[args.stage](), args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""P3 builder for run 24: south-west defence face, then blue / red / steel expansion.

짓는 엔진은 p1.build_stage (허브 판 · 벽돌로 만들고, 막힌 자리는 벌목 · 바위, 선 것은 건너뜀).

P3-1 남서 면 (21:15 raidwatch24: SW 구름 306 · 둥지 658 ×4 · 틈 352 - 1 순위, 정유가 서쪽에 서자 구름이 249 → 306).
    둥지 무리 (중심 기준 SW 658, 방위만 적는다) 에서 가장 가까운 우리 것 (실측 21:20):
        유전 포탑 · 펌프잭 462~480  →  정유 · 해안 펌프 · 발전 (물가 남쪽) 521~545  →  물가 서쪽 포탑 534~547
    - 유전 남서 호 포탑 4 (이웃 셋 이상) + 벽 L (x -216.5 · y 53.5)
    - 정유 · 발전 남서: 포탑 10 (x -124 줄 · y 32~44 줄) + 벽 L (x -128.5 · y 48.5)
유전은 기지에서 ~270 칸 - 공사 직전에 출정 조건 (물가 → 유전 선분 반경 80 · 유전 반경 250 적 0) 을 다시 잰다.

    python scripts/p3_24.py --run run24                          # 단계별로 몇 개 섰나 · 막힌 자리
    python scripts/p3_24.py --run run24 --stage oilsw --who hotel,delta
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401  (--run 을 먼저 뽑는다)
import p1                                 # noqa: E402
import detached                           # noqa: E402
from client import AIBridge               # noqa: E402
from walkscout import route_foes          # noqa: E402

N, E, S, W = 0, 4, 8, 12
POLE, TUR, WALL = "small-electric-pole", "gun-turret", "stone-wall"
p1.COST.update({WALL: {"stone-brick": 5}})
p1.SIZE.update({TUR: 2, WALL: 1})
b = p1.b

# 유전 남서 호 - 기존 유전 포탑 5 ((-204,24) (-204,34) (-188,24) (-188,34) (-196,40)) 바깥
OILSW_T = [(-212, 32), (-210, 42), (-202, 48), (-190, 46)]


def oilsw_steps():
    return [b(TUR, x, y) for x, y in OILSW_T]


def oilsw_wall_steps():
    out = [b(WALL, -216.5, y + 0.5) for y in range(16, 54)]
    out += [b(WALL, x + 0.5, 53.5) for x in range(-216, -180)]
    return out


# 정유 (-112.5,18.5) · 화학 · 해안 펌프 · 넷째 발전 단위 (-83..-92, 28.5) 의 서 · 남.
# x -124 줄은 원유 본관 (y 21.5) 을 피해 23..25 칸, (-116,8) 은 물가 서쪽 포탑 (-100,4/12) 과 잇는 받침.
REFSW_T = [(-124, 6), (-124, 14), (-116, 8), (-124, 24), (-120, 32), (-112, 36), (-104, 38), (-96, 40), (-102, 44), (-90, 42)]


def refsw_steps():
    return [b(TUR, x, y) for x, y in REFSW_T]


def refsw_wall_steps():
    out = [b(WALL, -128.5, y + 0.5) for y in range(0, 49)]
    out += [b(WALL, x + 0.5, 48.5) for x in range(-128, -84)]
    return out


def oil_ok(ai) -> bool:
    """출정 조건 (23회차 복기 §3-7): 떠나기 직전 물가 → 유전 선분 반경 80 · 유전 반경 250 에 적 유닛 · 구조물 0. 문턱은 올리지 않는다."""
    a = route_foes(ai, (-90, 20), (-196, 32), 80) or {}
    c = route_foes(ai, (-196, 32), (-196, 32), 250) or {}
    ok = not (a.get("units") or a.get("structs") or c.get("units") or c.get("structs"))
    print(f"  출정 조건 물가→유전 {a} · 유전 250 {c} → {'간다' if ok else '접는다'}", flush=True)
    return ok


# P3-2 · P3-3 파랑 ≥ 100 · 빨강 ≥ 초록 (조립기 1 형 0.5 배, relay24 ASMS 와 같은 표 - 팔 · 벨트 없이 relay).
#   파랑 2 → 4 (24 s / 2 팩 → 대당 10분 25) · 엔진 2 → 4 (10 s → 대당 10분 30) · 고급회로 2 → 3 (6 s → 대당 10분 50, 팩 하나에 1.5) ·
#   전선 셋째 (회로 둘 + 고급회로 전선 4) · 빨강 3 → 5 (대당 10분 60 → 300 > 초록 250).
#   자리: 파랑 블록 동쪽 (x -9.5 · -5.5 · -1.5) 과 그 남쪽 줄 y 8.5 (x -29.5..-13.5) - 21:25 can_place 확인.
ASM = "assembling-machine-1"
p1.COST.update({ASM: {"iron-plate": 22, "copper-plate": 4.5}})
BLUE2 = {"eng3": (-9.5, -4.5), "eng4": (-5.5, -4.5), "adv3": (-1.5, -4.5),
         "blue3": (-9.5, 3.5), "blue4": (-5.5, 3.5), "cable3": (-1.5, 3.5),
         "red4": (-29.5, 8.5), "red5": (-25.5, 8.5), "gear3": (-21.5, 8.5)}


def blue2_steps():
    out = [b(ASM, x, y) for x, y in BLUE2.values()]
    out += [b(POLE, x, -0.5) for x in (-9.5, -5.5, -1.5)] + [b(POLE, x, 5.5) for x in (-27.5, -19.5)]
    return out


# 강철 화로 4 더 (허브 동쪽 y -12, 벽돌 · 강철 줄 (y -9) 북쪽) - 엔진 하나에 강철 1, 파랑 10분 100 = 강철 100.
# 강철 16 s (돌 화로 1 배) → 대당 10분 37. 4 → 8 대 ≈ 300 (철판 1,500 을 먹는다).
STEEL2_XS = [74, 76, 78, 80]


def steel2_steps():
    return [b("stone-furnace", x, -12) for x in STEEL2_XS]


# P3-5 전력: 다섯째 · 여섯째 단위 (호수 동쪽 기슭, 21:25 water_sites + can_place 확인). 21:15 7.2 MW 에 4.7 MW (1.53 배 - 문턱 1.5 넘음)
#   조립기 9 (+0.7 MW) 전에 10.8 MW. 해안 펌프 서향 (-31.5,46.5) → 출구 (x+1) = 보일러 1 (-29.5,46) 북향의 서쪽 물 칸 (bx-2, by+0.5).
#   보일러 2 (-25.5,46) 은 보일러 1 동쪽 물 칸 (-27.5,46.5) 의 관 하나로 이어 물을 넘겨받는다 (펌프 하나 1200/s 로 보일러 20).
#   기관은 증기 쪽 (북) 으로 (bx, by-3.5) · (bx, by-8.5). 전봇대 x -27.5 (두 기관 기둥 사이 한 칸) 로 조립 줄 (-27.5,5.5) 에 잇는다.
def power5_steps():
    out = [b("offshore-pump", -31.5, 46.5, W), b("boiler", -29.5, 46, N), b("pipe", -27.5, 46.5), b("boiler", -25.5, 46, N)]
    out += [b("steam-engine", x, y, N) for x in (-29.5, -25.5) for y in (42.5, 37.5)]
    out += [b(POLE, -27.5, y) for y in (5.5, 12.5, 19.5, 26.5, 33.5, 40.5)]     # 40.5: 21:33 실측 - 33.5 하나로는 북쪽 기관 (y 42.5) 이 not_plugged
    return out


STAGES = {"oilsw": oilsw_steps, "oilsw_wall": oilsw_wall_steps, "refsw": refsw_steps, "refsw_wall": refsw_wall_steps,
          "power5": power5_steps, "blue2": blue2_steps, "steel2": steel2_steps}
FAR = {"oilsw", "oilsw_wall"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--who", default="")
    ap.add_argument("--rounds", type=int, default=10)
    a = ap.parse_args()
    ai = AIBridge()
    for name, fn in STAGES.items():
        steps = fn()
        bad = p1.blocked(ai, steps)
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(bad)} {[x for x in bad if not x.endswith('|tree')][:4]}", flush=True)
    crew = [n.strip() for n in a.who.split(",") if n.strip()]
    if not (crew and a.stage):
        return 0
    if a.stage in FAR and not oil_ok(ai):
        return 2
    owner = "p3_24_" + a.stage
    os.environ[detached.ENV] = owner
    detached.mark(crew, owner, minutes=90)
    try:
        ok = p1.build_stage(ai, crew, STAGES[a.stage](), a.stage, rounds=a.rounds)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

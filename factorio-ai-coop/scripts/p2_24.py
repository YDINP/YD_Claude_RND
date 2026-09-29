"""P2 builder for run 24: defence faces (turrets + stone walls), brick furnaces, burner retirement, fourth steam unit.

짓는 엔진은 p1.build_stage (허브 판 · 벽돌로 만들고, 막힌 자리는 벌목 · 바위, 선 것은 건너뜀).
방위는 raidwatch24 로 정했다 (20:41, 기지 중심 (70,-15) 기준 «둥지 거리 - 공해 구름 반경» 이 작은 순):
    E  틈 379 (둥지 613 ×2) → 동쪽 면 (석탄 · 돌 밭) 이 1 순위 - 포탑 0 이었다
    SW 틈 409 (둥지 658 ×4) → 구리 밭 남서 + 물가 블록 서쪽
    NW 틈 589 · N 900 안 둥지 없음 → 이미 선 북쪽 두 줄 (철 · 물가) 앞에 벽만
포탑은 사거리 18 안 이웃 셋 (playbook «포탑은 사거리 안에 셋»). 탄창은 relay24 가 포탑마다 ≤ 20.
벽은 포탑 줄 바깥 3~4 칸 - 벽돌은 bricks 단계의 돌 화로 6 (relay24 가 허브 돌 → 화로, 벽돌 → 허브).

    python scripts/p2_24.py --run run24                          # 단계별로 몇 개 섰나 · 막힌 자리
    python scripts/p2_24.py --run run24 --stage east --who hotel,delta
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

N, E, S, W = 0, 4, 8, 12
EMD, FURN, POLE, TUR, WALL = "electric-mining-drill", "stone-furnace", "small-electric-pole", "gun-turret", "stone-wall"
p1.COST.update({WALL: {"stone-brick": 5}, "offshore-pump": {"iron-plate": 5, "copper-plate": 3}})
p1.SIZE.update({TUR: 2, WALL: 1})
b = p1.b

# 벽돌 화로 - relay24 BRICK_BOX 와 같은 자리
BRICK_XS = [74, 76, 78, 80, 82, 84]
BRICK_Y = -9


def bricks_steps():
    return [b(FURN, x, BRICK_Y) for x in BRICK_XS]


# 강철 화로 4 (벽돌 줄 동쪽) - relay24 SMELT 가 허브 철판 → 화로 (≤ 25), 강철 → 허브 (≤ 400).
# 펌프잭 5 · 정유 15 · 화학 5 강철, 파랑의 엔진 (강철 1) 도.
STEEL_XS = [86, 88, 90, 92]


def steel_steps():
    return [b(FURN, x, BRICK_Y) for x in STEEL_XS]


# 동쪽 면: 포탑 x 130 (y -38..2, 8 칸) + 양 끝 받침 (125) - 끝 포탑도 이웃 셋
EAST_T = [(130, y) for y in (-38, -30, -22, -14, -6, 2)] + [(125, -34), (125, -2)]
EAST_WALL_X = 134.5
EAST_WALL_Y = (-44, 8)


def east_steps():
    return [b(TUR, x, y) for x, y in EAST_T]


def east_wall_steps():
    return [b(WALL, EAST_WALL_X, y + 0.5) for y in range(EAST_WALL_Y[0], EAST_WALL_Y[1])]


# 남서 면 1: 구리 전기 쌍 (60..92, 78..90) 의 서 · 남
SW_T = [(56, 76), (56, 84), (56, 92), (64, 96), (72, 96), (80, 96)]


def sw_steps():
    return [b(TUR, x, y) for x, y in SW_T]


def sw_wall_steps():
    out = [b(WALL, 51.5, y + 0.5) for y in range(70, 101)]
    out += [b(WALL, x + 0.5, 100.5) for x in range(52, 86)]
    return out


# 남서 면 2: 물가 블록 (발전 · 연구소 · 조립 줄, x -95..-33) 서쪽
LAKEW_T = [(-100, -4), (-100, 4), (-100, 12), (-95, 0)]


def lakew_steps():
    return [b(TUR, x, y) for x, y in LAKEW_T]


# 북쪽 두 줄 앞 벽 (포탑은 이미 있다: 철 (80..92, -61/-66) · 물가 (-58..-34, -8))
def north_wall_steps():
    out = [b(WALL, x + 0.5, -70.5) for x in range(74, 99)]
    out += [b(WALL, x + 0.5, -12.5) for x in range(-63, -28)]
    return out


# 철 버너 줄 은퇴 (채굴기 (x, -56) · 화로 (x, -54), x = 72, 76..96) → 전기 쌍 C 9 (72.5+3i, -56.5) 남향 → 화로 (x+0.5, -54)
BURN_XS = [72] + list(range(76, 97, 2))
ROW_C = [(72.5 + 3 * i, -56.5) for i in range(9)]


def ironretire_steps():
    """버너 은퇴만 (20:50 끝남 - 버너 0). ironc 와 나눴다: 실측 - 옛 화로 자리 (76 · 82 · 88 · 94, -54) 가 새 화로 자리와 같아
    build_stage 가 순번마다 «아직 뭔가 있다» 로 demolish 를 남겨 새로 세운 화로를 다시 걷었다 (10 순번 20/23)."""
    out = []
    for x in BURN_XS:
        out += [("take", {"name": "iron-plate", "x": x, "y": -54, "count": 100}),
                ("demolish", {"x": x, "y": -54, "name": FURN, "search_radius": 0.6}),
                ("demolish", {"x": x, "y": -56, "name": "burner-mining-drill", "search_radius": 0.6})]
    return out


def ironc_steps():
    out = []
    for (x, y) in ROW_C:
        out += [b(EMD, x, y, S), b(FURN, x + 0.5, y + 2.5)]
    out += [b(POLE, 74.5 + 6 * k, -54.5) for k in range(5)]      # 98.5: 끝 채굴기 (96.5) 는 92.5 전봇대 공급 밖 (실측 no_power)
    return out


def coalretire_steps():
    """석탄 버너 3 (106..110, -26) - 석탄 전기 6 이 대신. 상자 (x+0.5, -24.5) 는 relay 연료 중계가 집으니 남긴다."""
    out = []
    for x in (106, 108, 110):
        out += [("take", {"name": "coal", "x": x, "y": -26, "count": 50}),
                ("demolish", {"x": x, "y": -26, "name": "burner-mining-drill", "search_radius": 0.6})]
    return out


def power4_steps():
    """넷째 발전 단위 (모드 power_plan (-100,15) 확인): 펌프 (-82.5,30.5) S · 보일러 (-83,28.5) W · 기관 (-86.5,28.5) (-91.5,28.5) E.
    20:40 실측 5.4 MW 에 3.3 MW - 버너 은퇴 (전기 쌍 C 9 = +0.8 MW) 뒤 1.5 배 여유를 위해 7.2 MW."""
    return [b("offshore-pump", -82.5, 30.5, S), b("boiler", -83, 28.5, W),
            b("steam-engine", -86.5, 28.5, E), b("steam-engine", -91.5, 28.5, E),
            b(POLE, -84.5, 20.5), b(POLE, -86.5, 26.5), b(POLE, -90.5, 26.5)]


# 연구소 6 더 (조립 줄 북쪽 y -4.5, 포탑 줄 y -8 앞) + 초록 4 · 5 (-33.5, 3.5 / -4.5 - -0.5 는 전봇대 줄 (-33.5,-1.5) 자리). 20:44 실측: 연구소 4 · 초록 3 (10분 116).
# 빨강·초록 기름 사슬 (steel → automation-2 → engine → fluid-handling → oil-gathering → plastics · sulfur → advanced-circuit → 파랑) ~1,000 단위.
LABS3 = [(-57.5 + 4 * i, -4.5) for i in range(6)]
ASM = "assembling-machine-1"
p1.COST.update({"lab": {"iron-plate": 36, "copper-plate": 15}, ASM: {"iron-plate": 22, "copper-plate": 4.5}})


def labs3_steps():
    out = [b("lab", x, y) for x, y in LABS3]
    out += [b(POLE, x, -2.5) for x in (-55.5, -49.5, -43.5, -37.5)]
    out += [b(ASM, -33.5, 3.5), b(ASM, -33.5, -4.5), b(POLE, -35.5, 1.5)]
    return out


# 기름 (파랑 준비). 걸어서 본 유전 (-196,32): 우물 2 - (-196.5,27.5) 496k · (-195.5,32.5) 398k (수율 ~165% · 133% → 원유 ~30/s).
# 20:47 출정 조건: 물가 (-90,20) → 유전 선분 반경 80 적 0 · 유전 반경 250 적 0 (둥지는 SW 658 / 중심).
# 계획: 펌프잭 2 (oil-gathering 뒤) → 원유 관 동쪽으로 → 물가 블록 서쪽에 정유 1 · 화학 2 (플라스틱 · 황). 물 · 전기 · 중계 · 방어가 물가에 있다.
# 지금 (연구 전): 전봇대 줄 (power4 → 유전) + 유전 포탑 5 (이웃 셋).
OIL_WELLS = [(-196.5, 27.5), (-195.5, 32.5)]
OIL_T = [(-204, 24), (-204, 34), (-188, 24), (-188, 34), (-196, 40)]


def oilprep_steps(ai=None, who=None):
    out = []
    if ai is not None:
        r = ai.pole_route(who, -90.5, 26.5, -191.5, 30.5, 40) or {}
        out += [b(POLE, p["x"], p["y"]) for p in (r.get("poles") or []) if isinstance(p, dict)]
    out += [b(TUR, x, y) for x, y in OIL_T]
    return out


def pumpjack_steps():
    p1.COST["pumpjack"] = {"iron-plate": 29, "copper-plate": 7.5, "steel-plate": 5}
    return [b("pumpjack", x, y, E) for x, y in OIL_WELLS]


STAGES = {"steel": steel_steps, "oilprep": oilprep_steps, "pumpjack": pumpjack_steps, "labs3": labs3_steps, "bricks": bricks_steps, "east": east_steps, "east_wall": east_wall_steps, "sw": sw_steps, "sw_wall": sw_wall_steps,
          "lakew": lakew_steps, "north_wall": north_wall_steps, "ironc": ironc_steps, "ironretire": ironretire_steps, "coalretire": coalretire_steps,
          "power4": power4_steps}


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
    owner = "p2_24_" + a.stage
    os.environ[detached.ENV] = owner
    detached.mark(crew, owner, minutes=90)
    try:
        steps = oilprep_steps(ai, crew[0]) if a.stage == "oilprep" else STAGES[a.stage]()
        ok = p1.build_stage(ai, crew, steps, a.stage, rounds=a.rounds)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

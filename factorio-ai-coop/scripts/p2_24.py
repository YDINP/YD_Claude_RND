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


# 원유 관 (유전 → 물가 블록 서쪽 정유). 펌프잭 동향 (4): 출구 바깥 칸 = (X+2, Y-1) - 게임 get_pipe_connections 실측.
#   (처음엔 prototype 의 (1,-1) 북향을 손으로 돌려 (X+2, Y+1) 로 잡아 원유가 안 나왔다 - 돌린 값은 게임에 묻는다.)
#   펌프잭 1 (-196.5,27.5) → (-194.5,26.5) · 펌프잭 2 (-195.5,32.5) → (-193.5,31.5). 모으는 관 x -192.5 (y 21.5..33.5).
#   본관 y 21.5 지하관 짝 (입구 서향 12 · 출구 동향 4, 최대 10 칸) → 정유 (-112.5,18.5) 북향의 입력 바깥 칸 (-113.5 / -111.5, 21.5).
#   전봇대 줄 (y 26.5~30.5) 을 피해 정유는 그 북쪽.
PTG = "pipe-to-ground"
p1.COST.update({"pipe": {"iron-plate": 1}, PTG: {"iron-plate": 7.5}})
p1.PAIRED.add(PTG)
REFINERY = (-112.5, 18.5)
MAIN_Y = 21.5


def oilpipe_steps():
    out = [b("pipe", x, 28.5) for x in (-194.5, -193.5)] + [b("pipe", -194.5, 26.5), b("pipe", -194.5, 27.5), b("pipe", -193.5, 31.5)]
    out += [b("pipe", -192.5, y + 0.5) for y in range(21, 34)]
    out.append(b("pipe", -193.5, 33.5))
    x = -191.5
    while x < -121.5:
        out += [b(PTG, x, MAIN_Y, W), b(PTG, x + 9, MAIN_Y, E)]
        x += 10
    out += [b(PTG, x, MAIN_Y, W), b(PTG, -114.5, MAIN_Y, E)]
    out += [b("pipe", xx, MAIN_Y) for xx in (-113.5, -112.5, -111.5)]
    return out


# 정유 · 플라스틱 (oil-processing 트리거 = 펌프잭이 원유를 캐면 열림).
# 정유 북향 (-112.5,18.5): 입력 바깥 칸 (-113.5 / -111.5, 21.5) = 본관 끝 · 출력 바깥 칸 (-114.5 / -112.5 / -110.5, 15.5) → 석유 줄 y 15.5 (x -114.5..-104.5).
# 플라스틱 화학 남향 (-106.5,13.5): 입력 바깥 칸 (-107.5 / -105.5, 15.5) 이 석유 줄 위. 석탄 · 플라스틱은 relay (품목 상한).
# 전봇대 (-109.5,22.5) ← 줄 (-111.5,26.5) · (-108.5,17.5) · (-104.5,13.5).
PETRO_Y = 15.5
PLASTIC = (-106.5, 13.5)


def refinery_steps():
    p1.COST.update({"oil-refinery": {"iron-plate": 45, "copper-plate": 15, "steel-plate": 15, "stone-brick": 10},
                    "chemical-plant": {"iron-plate": 20, "copper-plate": 7.5, "steel-plate": 5}})
    p1.SIZE.update({"oil-refinery": 5, "chemical-plant": 3})
    out = [b("oil-refinery", REFINERY[0], REFINERY[1], N)]
    out += [b("pipe", x + 0.5, PETRO_Y) for x in range(-115, -104)]
    out += [b("chemical-plant", PLASTIC[0], PLASTIC[1], S)]
    out += [b(POLE, -109.5, 22.5), b(POLE, -108.5, 17.5), b(POLE, -104.5, 13.5)]
    return out


# 황 화학 (남향 (-102.5,13.5)): 입력 바깥 칸 (-103.5,15.5) = 석유 줄 끝 옆 · (-101.5,15.5) = 물 (사이 -102.5 는 비워 두 관이 안 섞인다).
# 물: 해안 펌프 (-85.5,35.5) (water_sites) → 출구 칸 (게임에 물어 wpipe 단계에서) → x -100.5 로 북쪽 → (-101.5,15.5).
SULFUR = (-102.5, 13.5)
WPUMP = (-85.5, 35.5)


def sulfur_steps():
    p1.COST.update({"chemical-plant": {"iron-plate": 20, "copper-plate": 7.5, "steel-plate": 5}})
    p1.SIZE.update({"chemical-plant": 3})
    return [b("chemical-plant", SULFUR[0], SULFUR[1], S), b("pipe", -103.5, PETRO_Y), b("offshore-pump", WPUMP[0], WPUMP[1], E),
            b(POLE, -102.5, 10.5)]      # (-100.5,11.5) 은 물가 서쪽 포탑 (-100,12) 자리


def wpipe_steps(ai=None):
    """펌프 출구 칸 (게임 get_pipe_connections) 에서 서쪽 y 그 줄로 x -100.5 까지, 북쪽으로 y 15.5, 서쪽 한 칸 (-101.5,15.5)."""
    out = []
    if ai is None:
        return out
    r = ai.lua("""(function() local e = game.surfaces[1].find_entities_filtered{name = "offshore-pump", force = "player", position = {%f, %f}, radius = 0.6}[1]
      if not e then return {} end
      local c = e.fluidbox.get_pipe_connections(1)[1]
      return {x = c.target_position.x, y = c.target_position.y} end)()""" % WPUMP) or {}
    if "x" not in r:
        return out
    x, y = float(r["x"]), float(r["y"])
    step = -1 if x > -100.5 else 1
    while abs(x - -100.5) > 0.1:
        out.append(b("pipe", x, y))
        x += step
    while y > 15.5 + 0.1:
        out.append(b("pipe", -100.5, y))
        y -= 1
    out += [b("pipe", -100.5, 15.5), b("pipe", -101.5, 15.5)]
    return out


# 파랑 블록 (물가 조립 줄 동쪽, 전봇대 줄 (-27.5,-4.5) 곁): relay24 ASMS 와 같은 표. 팔 · 벨트 없이 relay (품목 상한).
#   y -4.5: 고급회로 1 · 2 · 엔진 1 · 2 · 관      y 3.5: 파랑 1 · 2 · 전선 2 · 회로 2 · 톱니 2      전봇대 y -0.5
BLUE = {"adv1": (-29.5, -4.5), "adv2": (-25.5, -4.5), "eng1": (-21.5, -4.5), "eng2": (-17.5, -4.5), "pipe": (-13.5, -4.5),
        "blue1": (-29.5, 3.5), "blue2": (-25.5, 3.5), "cable2": (-21.5, 3.5), "circuit2": (-17.5, 3.5), "gear2": (-13.5, 3.5)}


def blue_steps():
    out = [b(ASM, x, y) for x, y in BLUE.values()]
    return out + [b(POLE, x, -0.5) for x in (-27.5, -21.5, -15.5)]


def pumpjack_steps():
    p1.COST["pumpjack"] = {"iron-plate": 35, "copper-plate": 7.5, "steel-plate": 5}     # 톱니 10 (20) + 관 10 + 회로 5 (철 5 · 구리 7.5)
    # 전봇대 (-194.5,30.5): 줄 끝 (-188.5,30.5) 의 공급 (±2.5) 은 펌프잭 (x -198..-194) 에 안 닿는다 (실측 no_power)
    return [b("pumpjack", x, y, E) for x, y in OIL_WELLS] + [b(POLE, -194.5, 30.5)]


STAGES = {"steel": steel_steps, "oilpipe": oilpipe_steps, "refinery": refinery_steps, "sulfur": sulfur_steps, "blue": blue_steps, "wpipe": wpipe_steps, "oilprep": oilprep_steps, "pumpjack": pumpjack_steps, "labs3": labs3_steps, "bricks": bricks_steps, "east": east_steps, "east_wall": east_wall_steps, "sw": sw_steps, "sw_wall": sw_wall_steps,
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
        steps = (oilprep_steps(ai, crew[0]) if a.stage == "oilprep" else wpipe_steps(ai) if a.stage == "wpipe"
                 else STAGES[a.stage]())
        ok = p1.build_stage(ai, crew, steps, a.stage, rounds=a.rounds)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

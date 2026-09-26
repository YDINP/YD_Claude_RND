"""P4-4 for run 23: crude oil -> chemical science pack 0.1/s. Design + offline check only (p25 structure).

목표율 0.1/s (6/분) - 근거 (게임 실측 2026-09-26, tick 8.75M):
    · 철판 생산 7.0/s. 1시간 평균 소비 5.4/s (잉여 1.5/s, 판 모으기가 허브로) - 10분 평균은 포탑 손제작으로 7.35/s.
      화학팩 0.1/s 는 철 1.2/s -> 1시간 잉여 안. 0.2/s (철 2.4) 는 철 증설이 먼저다.
    · 구리판 생산 2.5/s · 소비 0.75/s - 잉여 1.75/s (허브 상자 1.5만). 화학팩 0.1 은 구리 0.75/s.
    · 전력: 망 1 (보일러 줄 동쪽 엔진 4) 1.6MW / 망 2 (서쪽 엔진 4) 3.25MW - 망 둘이 안 이어져 있다 (전봇대 -49.5 / -37.5 가 12칸).
      망 2 는 90%. 이 블록 +2.3MW -> 합쳐도 7.2MW 의 98% -> 보일러 2 · 엔진 4 증설 (10.8MW) + 망 잇기.
    · 조립기 2형은 강철이 허브에 없어 못 만든다 -> 1형. 엔진 2대가 0.1/s 상한 (2 x 0.5 / 10초).

레시피 (게임): 원유 100 -> 석유가스 45 (정유 5초) · 플라스틱 2 = 가스 20 + 석탄 1 (화학 1초) · 황 2 = 가스 30 + 물 30 (1초)
    고급회로 = 플라스틱 2 + 구리선 4 + 회로 2 (6초) · 엔진 = 강철 1 + 톱니 1 + 관 2 (10초) · 화학팩 2 = 엔진 2 + 고급회로 3 + 황 1 (24초)

| 기계 (조립기 1형 0.5 · 화학 1 · 돌 화로 1) | 필요 | 짓는 수 |
|---|---|---|
| 화학팩 CP | 2.4 | 3 |
| 고급회로 AC · 엔진 EN | 1.8 · 2.0 | 2 · 2 |
| 구리선 CB · 회로 EC · 톱니 GR · 관 PP | 0.75 · 0.3 · 0.2 · 0.4 | 3 · 1 · 2 · 1 (직삽 때문에 CB·GR 이 남는다) |
| 강철 화로 ST | 1.6 | 2 |
| 플라스틱 PL · 황 SU (화학 공장) | 0.15 · 0.025 | 1 · 1 |
| 정유 RF (기본 정제) | 0.42 (원유 8.3/s) | 1 |
| 펌프잭 (수율 255% = 25.5/s) | 0.33 | 1 (부트스트랩 겸용) |
원료: 원유 8.3/s · 물 0.75/s · 석탄 0.2/s · 철판 1.2/s · 구리판 0.75/s.

배치 - 정유는 기지 쪽 (관 ~430칸 + 펌프 1 vs 유전 옆: 전력선은 어차피 필요하고, 석탄·물·철·구리가 다 기지에 있어 벨트 셋이 더 든다):
    유전 (-73,373) 펌프잭 -> 탱크 -> 관 y=370 동쪽 -> 회랑 x=-13 북쪽 (중간 펌프 y=180 - 구간 연장 320) -> x=-10 -> 정유 (-14,-51)
    회랑: 관 x=-13 · 전봇대 x=-12 · 철판 벨트 x=-14 (유전 탄창 조립기용, 한 레인) - 모두 기지 동쪽 끝 (x=-34 철 줄 동쪽) 에서 출발.
    블록 E (x -34..-10, y -58..-4, 철 기둥 동쪽 빈 땅), 벨트는 모두 세로:
      x=-34 기존 철판 줄 (긴팔로 집음) | A x=-33 남향 (석탄 E | 강철 W, 기존 전봇대 4 는 지하로 넘음) | 1열 x -30..-28
      | C x=-26 남향 (석탄 W | 엔진 E) | D x=-25 북향 (구리 W | 회로 E) | 2열 x -23..-21 | E x=-19 남향 (황 W | 고급회로 E)
      | F x=-18 남향 (화학팩) | 3열 SU · 정유
      1열: ST1 ST2 GR1 EN1 PP EN2 GR2 CB1 EC (톱니·관은 엔진에, 구리선은 회로에 직삽)
      2열: CB2 AC1 PL AC2 CB3 (플라스틱·구리선 직삽) · CP1 CP2 CP3
    석탄: 보일러 석탄 벨트 끝 (-34,-60) 을 지하로 물 관 밑 -> 분배기 -> A (동쪽 옆치기) · C (서쪽 옆치기)
    구리: 구리판 줄 x=-68 에 분배기 (-68,-11) -> y=-9 동쪽 -> D 머리 (-25,-9)
    물: 보일러 물 관 (-29,-59) 에서 가지 -> y=-57 -> x=-22 -> y=-46 -> SU
    화학팩: F -> y=-6 서쪽 -> x=-76 북쪽 -> P 벨트 (-75,-22) 북쪽 레인 (군사팩은 남쪽 레인) -> 연구소 바깥 팔 15
    방어: 유전 서쪽 x=-91 포탑 6 · 남쪽 y=399 포탑 5, 탄창 조립기 (-66,362) 가 회랑 철판으로 만든 탄창을 고리 벨트로.

    python scripts/p26.py --check                    # 오프라인 확인 (SNAP)
    python scripts/p26.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만)
    python scripts/p26.py --snapshot                 # 설계 둘레 기존 엔티티 -> SNAP (게임 읽기만)
    python scripts/p26.py --power --ores --threat    # 망별 전력 · 새 채굴기 자원 · 적 구조물 (게임 읽기만)
    python scripts/p26.py --recipes --who golf       # 조립기·화학 공장·정유 레시피 (연구 뒤)
    python scripts/p26.py --stage boot_line --who alpha,charlie   # 부트스트랩부터
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import p1   # noqa: E402
import p2   # noqa: E402

N, E, S, W = 0, 4, 8, 12
VEC = p2.VEC
BELT, UG, INS, FAST, LONG = p2.BELT, p2.UG, p2.INS, p2.FAST, p2.LONG
AM, POLE = p2.AM, p2.POLE
EMD, FURN = p1.EMD, p1.FURN
SPLIT, PIPE, UGP, PUMP = "splitter", "pipe", "pipe-to-ground", "pump"
JACK, TANK, REF, CHEM = "pumpjack", "storage-tank", "oil-refinery", "chemical-plant"
BOILER, ENGINE, TURRET = "boiler", "steam-engine", "gun-turret"
ARMS = {INS: 1, FAST: 1, LONG: 2}
BELTS = {BELT, UG, SPLIT}
FLUIDS = {PIPE, UGP, PUMP, JACK, TANK, REF, CHEM}
POWERED = {AM, INS, FAST, LONG, EMD, JACK, REF, CHEM, PUMP}
KW = {EMD: 90, AM: 77.5, INS: 14.7, FAST: 58.8, LONG: 21, JACK: 90, REF: 420, CHEM: 210, PUMP: 29}
LAB = "lab"

RATE = 0.1
RECIPE = {   # 레시피: (재료, 결과)
    "copper-cable": ({"copper-plate"}, "copper-cable"),
    "electronic-circuit": ({"iron-plate", "copper-cable"}, "electronic-circuit"),
    "iron-gear-wheel": ({"iron-plate"}, "iron-gear-wheel"),
    "pipe": ({"iron-plate"}, "pipe"),
    "engine-unit": ({"steel-plate", "iron-gear-wheel", "pipe"}, "engine-unit"),
    "advanced-circuit": ({"plastic-bar", "copper-cable", "electronic-circuit"}, "advanced-circuit"),
    "chemical-science-pack": ({"engine-unit", "advanced-circuit", "sulfur"}, "chemical-science-pack"),
    "plastic-bar": ({"coal"}, "plastic-bar"),          # + 석유가스 (관)
    "sulfur": (set(), "sulfur"),                        # 물 + 석유가스 (관)
    "steel-plate": ({"iron-plate", "coal"}, "steel-plate"),
    "firearm-magazine": ({"iron-plate"}, "firearm-magazine"),
    TURRET: ({"firearm-magazine"}, None),
}
FLUID_IN = {"plastic-bar": {"petroleum-gas"}, "sulfur": {"water", "petroleum-gas"}}
SMELTABLE = {"stone", "iron-ore", "copper-ore", "iron-plate"}

# ---- 배치 상수 (타일. 홀수 크기는 가운데 타일, 짝수는 왼쪽 위) -----------------------------
IRON_X = -34                           # 기존 철판 줄 (남향, L1 철 실측)
A_X, C_X, D_X, E_X, F_X = -33, -26, -25, -19, -18
R1, R2, R3 = -29, -22, -15             # 열 가운데 x
OLD_POLES_X, OLD_POLE_YS = -33, (-43, -37, -31, -25)      # 철 기둥 동쪽 팔 전봇대 - A 는 지하로 넘는다
PIPE_X, CPOLE_X, PLATE_X = -13, -12, -15                   # 회랑
FIELD_Y = 370                          # 유전 관 가로줄
PUMP_Y = 180
JACK_C, TANK_C = (-73, 373), (-73, 369)
REF_C, SU_C = (-14, -51), (-15, -44)
WATER_TAP = (-29, -59)                 # 보일러 물 관 (지상 관 x -36..-29)
MA_C = (-66, 362)                      # 유전 탄창 조립기
RING_X, RING_TOP, RING_BOT = -89, 359, 397
WEST_TURRETS = [361, 367, 373, 379, 385, 391]
SOUTH_TURRETS = [-86, -80, -74, -68, -62]
PARK = (-20.5, 5.5)
START_POLE = (-48, -4)                 # 기존 망 2 전봇대 (-47.5,-3.5) - 부트스트랩 전력선이 여기서 나간다


def ent(name, x, y, d=None, **kw):
    e = {"name": name, "x": x, "y": y}
    if d is not None:
        e["d"] = d
    e.update(kw)
    return e


def dims(e):
    n, d = e["name"], e.get("d", N)
    if n in (AM, EMD, JACK, TANK, CHEM, LAB):
        return 3, 3
    if n == REF:
        return 5, 5
    if n in (FURN, TURRET):
        return 2, 2
    if n == PUMP:
        return (1, 2) if d in (N, S) else (2, 1)
    if n == SPLIT:
        return (2, 1) if d in (N, S) else (1, 2)
    if n == BOILER:
        return (3, 2) if d in (N, S) else (2, 3)
    if n == ENGINE:
        return (3, 5) if d in (N, S) else (5, 3)
    return 1, 1


def _span(v, s):
    return list(range(v - s // 2, v + s // 2 + 1)) if s % 2 else list(range(v, v + s))


def tiles(e):
    w, h = dims(e)
    return [(x, y) for x in _span(e["x"], w) for y in _span(e["y"], h)]


def pos(e):
    w, h = dims(e)
    return (e["x"] + (0.5 if w % 2 else w / 2), e["y"] + (0.5 if h % 2 else h / 2))


def run(x1, y1, x2, y2, d):
    return p2.run(x1, y1, x2, y2, d)


def ug(x1, y1, x2, y2, d):
    return p2.ug_pair(x1, y1, x2, y2, d)


def prun(x0, y0, x1, y1):
    """관 한 직선 (끝 포함): 지하관 쌍 (11칸) + 남는 칸은 보통 관. 지하관 방향 = 지상 연결 쪽 (입구는 상류를 본다)."""
    out = []
    if x0 == x1:
        step = -1 if y1 < y0 else 1
        enter, leave = (S, N) if step < 0 else (N, S)
        y = y0
        while (y + step * 10 - y1) * step <= 0:
            out += [ent(UGP, x0, y, enter), ent(UGP, x0, y + step * 10, leave)]
            y += step * 11
        while (y - y1) * step <= 0:
            out.append(ent(PIPE, x0, y))
            y += step
    else:
        step = -1 if x1 < x0 else 1
        enter, leave = (E, W) if step < 0 else (W, E)
        x = x0
        while (x + step * 10 - x1) * step <= 0:
            out += [ent(UGP, x, y0, enter), ent(UGP, x + step * 10, y0, leave)]
            x += step * 11
        while (x - x1) * step <= 0:
            out.append(ent(PIPE, x, y0))
            x += step
    return out


def pline(pts):
    """꺾은선 관: 꼭짓점마다 보통 관 한 칸, 그 사이는 prun."""
    out = [ent(PIPE, *pts[0])]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        sx, sy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
        if abs(bx - ax) + abs(by - ay) > 1:
            out += prun(ax + sx, ay + sy, bx - sx, by - sy)
        out.append(ent(PIPE, bx, by))
    return out


def poles_line(pts, step=7):
    """꼭짓점을 잇는 소형 전봇대 줄 (간격 step ≤ 7.5)."""
    out = [pts[0]]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dist = abs(bx - ax) + abs(by - ay)
        sx, sy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
        k = step
        while k < dist:
            out.append((ax + sx * k, ay + sy * k))
            k += step
        out.append((bx, by))
    seen, res = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            res.append(p)
    return res


# ------------------------------------------------------------------ 배치 (순수)

def boot_line():
    """부트스트랩 전력선 (소형, 강철 0): 기존 망 2 전봇대 (-48,-4) -> y=-2 동쪽 -> 회랑 x=-12 남쪽 -> y=367 서쪽 -> 펌프잭."""
    pts = [(-41, -2), (-35, -2), (-29, -2), (-22, -2), (-16, -2)]
    pts += poles_line([(-12, 2), (CPOLE_X, 367), (-68, 367)])
    pts.append((-70, 371))
    return [ent(POLE, x, y) for x, y in pts]


def boot():
    """펌프잭 1 (가장 좋은 우물 255%) + 탱크 (원유를 받아 둔다) + 둘을 잇는 관 한 칸. 원유 한 번 = oil-processing 해금."""
    return [ent(JACK, *JACK_C, N), ent(TANK, *TANK_C, N), ent(PIPE, JACK_C[0] + 1, JACK_C[1] - 2)]


def power_poles():
    """먼저 (따로 단계): 망 1·2 잇기 + B5·B6 줄 전봇대. 옛 전봇대 (-38,-76) 를 걷기 전에 넘겨받는다 (p6 power5poles 와 같은 이유)."""
    return [ent(POLE, -44, -59),                                  # 망 2 (-49.5,-61.5) · 망 1 (-37.5,-61.5) 둘 다 6.7칸
            ent(POLE, -38, -75), ent(POLE, -50, -75), ent(POLE, -35, -75)]


def power():
    """보일러 B5·B6 (p23 줄 북쪽에 맞붙임, 물 이어받음) + 엔진 4 + 급탄 팔 + 석탄 채굴기 2."""
    out = []
    for y in (-73, -76):
        out += [ent(BOILER, -37, y, W), ent(PIPE, -38, y), ent(ENGINE, -41, y, E), ent(ENGINE, -46, y, E),
                ent(INS, -35, y, E)]
    out += [ent(EMD, -36, -79, E, ore="coal"), ent(EMD, -36, -91, E, ore="coal"),
            ent(BELT, -34, -91, S), ent(BELT, -34, -90, S)]
    return out


def pipeline():
    """탱크 동쪽 연결 (-71,370) -> y=370 동쪽 -> x=-13 북쪽 -> 펌프 (y 180..181) -> x=-13 -> x=-10 -> 정유 원유 입구 (-15,-54)."""
    out = pline([(-71, FIELD_Y), (PIPE_X, FIELD_Y), (PIPE_X, PUMP_Y + 2)])
    out.append(ent(PUMP, PIPE_X, PUMP_Y, N))
    out += pline([(PIPE_X, PUMP_Y - 1), (PIPE_X, 0), (PIPE_X, -40), (-10, -40), (-10, -55), (-15, -55), (-15, -54)])
    return out


def feeds():
    """석탄 (보일러 벨트 끝 -> 분배기 -> A 동쪽 · C 서쪽 옆치기), 구리 (x=-68 분배기 -> D 머리), 물 가지."""
    out = [ent(UG, -34, -60, S, kind="input"), ent(UG, -34, -58, S, kind="output")]
    out += run(-34, -57, -34, -55, S) + [ent(SPLIT, -34, -54, S)]
    out += [ent(BELT, -34, -53, S), ent(BELT, -34, -52, S), ent(BELT, -34, -51, E), ent(BELT, -33, -51, E)]
    out += run(-32, -51, -32, -49, S) + [ent(BELT, -32, -48, W)]
    out += [ent(BELT, -33, -53, E)] + run(-32, -53, -28, -53, E) + run(-27, -53, -27, -49, S) + [ent(BELT, -27, -48, E)]
    out += [ent(SPLIT, -68, -11, S), ent(BELT, -67, -10, S), ent(BELT, -67, -9, E)]
    out += run(-66, -9, -36, -9, E) + ug(-35, -9, -33, -9, E) + run(-32, -9, -27, -9, E)
    out += [ent(BELT, -26, -9, N), ent(BELT, -26, -10, E)]
    out += pline([(WATER_TAP[0], WATER_TAP[1] + 1), (-29, -57), (-22, -57), (-22, -46), (-16, -46)])
    return out


def fluid():
    """정유 (남향: 원유 입구 북쪽 (-15,-54), 가스 출구 셋 y=-48) · 황 SU · 플라스틱 PL 가스관."""
    out = [ent(REF, *REF_C, S, recipe="basic-oil-processing"), ent(CHEM, *SU_C, N, recipe="sulfur")]
    out += [ent(PIPE, x, -48) for x in range(-20, -11)] + [ent(PIPE, -14, -47), ent(PIPE, -14, -46)]
    out += [ent(UGP, -20, -47, N), ent(UGP, -20, -37, S)] + [ent(PIPE, -20, y) for y in (-36, -35, -34)]
    out.append(ent(LONG, -17, -44, E))                                    # 황 -> E 서쪽 레인
    return out


def belts():
    """A (석탄|강철, 전봇대 넷 중 셋은 지하로), C (석탄|엔진), D (구리|회로, 북향), E (황|고급회로)."""
    out = run(A_X, -49, A_X, -45, S) + ug(A_X, -44, A_X, -42, S) + run(A_X, -41, A_X, -39, S)
    out += ug(A_X, -38, A_X, -36, S) + run(A_X, -35, A_X, -33, S) + ug(A_X, -32, A_X, -30, S) + run(A_X, -29, A_X, -27, S)
    out += run(C_X, -49, C_X, -12, S) + run(D_X, -9, D_X, -44, N) + run(E_X, -45, E_X, -17, S)
    return out


def row1():
    out = []
    for fy in (-46, -41):                                  # 강철 화로 (왼쪽 위 타일, 두 줄: fy 출력 · fy+1 입력)
        out += [ent(FURN, -30, fy, recipe="steel-plate"), ent(LONG, -32, fy + 1, W),
                ent(LONG, -31, fy + 1, W), ent(LONG, -31, fy, E)]
    out += [ent(AM, R1, -38, recipe="iron-gear-wheel"), ent(LONG, -32, -38, W), ent(INS, R1, -36, N),
            ent(AM, R1, -34, recipe="engine-unit"), ent(LONG, -31, -34, W), ent(INS, -27, -34, W),
            ent(INS, R1, -32, S),
            ent(AM, R1, -30, recipe="pipe"), ent(LONG, -32, -30, W), ent(INS, R1, -28, N),
            ent(AM, R1, -26, recipe="engine-unit"), ent(LONG, -31, -27, W), ent(INS, -27, -26, W),
            ent(INS, R1, -24, S),
            ent(AM, R1, -22, recipe="iron-gear-wheel"), ent(LONG, -32, -22, W),
            ent(AM, R1, -18, recipe="copper-cable"), ent(LONG, -27, -18, E), ent(INS, R1, -16, N),
            ent(AM, R1, -14, recipe="electronic-circuit"), ent(LONG, -32, -14, W), ent(LONG, -27, -14, W)]
    return out


def row2():
    out = [ent(AM, R2, -43, recipe="copper-cable"), ent(INS, -24, -43, W), ent(INS, R2, -41, N),
           ent(AM, R2, -39, recipe="advanced-circuit"), ent(INS, -24, -39, W), ent(INS, -20, -39, W),
           ent(INS, R2, -37, S),
           ent(CHEM, R2, -35, E, recipe="plastic-bar"), ent(LONG, -24, -35, W),
           ent(INS, R2, -33, N),
           ent(AM, R2, -31, recipe="advanced-circuit"), ent(INS, -24, -31, W), ent(INS, -20, -31, W),
           ent(INS, R2, -29, S),
           ent(AM, R2, -27, recipe="copper-cable"), ent(INS, -24, -27, W)]
    for c in (-23, -20, -17):
        out += [ent(AM, R2, c, recipe="chemical-science-pack"), ent(LONG, -24, c, W),
                ent(INS, -20, c - 1, E), ent(LONG, -20, c + 1, W)]
    return out


def packs():
    """F (화학팩) -> y=-6 서쪽 -> x=-76 북쪽 -> P (-75,-22) 에 북쪽에서 옆치기 = 북쪽 레인."""
    out = run(F_X, -23, F_X, -7, S) + [ent(BELT, F_X, -6, W)] + run(-19, -6, -32, -6, W) + ug(-33, -6, -35, -6, W)
    out += run(-36, -6, -66, -6, W) + ug(-67, -6, -69, -6, W) + run(-70, -6, -75, -6, W) + [ent(BELT, -76, -6, N)]
    out += run(-76, -7, -76, -20, N) + ug(-76, -21, -76, -23, N)
    out += [ent(BELT, -76, -24, E), ent(BELT, -75, -24, S), ent(BELT, -75, -23, S)]
    return out


def field():
    """회랑 철판 벨트 (x=-34 에서 고속 팔 하나) -> 유전 탄창 조립기 -> 고리 벨트 -> 포탑 11."""
    out = [ent(FAST, -33, -5, W), ent(BELT, -32, -5, S), ent(BELT, -32, -4, E)] + run(-31, -4, PLATE_X - 1, -4, E)
    out += [ent(BELT, PLATE_X, -4, S)] + run(PLATE_X, -3, PLATE_X, 364, S) + [ent(BELT, PLATE_X, 365, W)]
    out += run(PLATE_X - 1, 365, MA_C[0], 365, W)
    mx, my = MA_C
    out += [ent(AM, mx, my, recipe="firearm-magazine"), ent(INS, mx, my + 2, S), ent(INS, mx, my - 2, S)]
    out += run(mx, RING_TOP, RING_X + 1, RING_TOP, W) + [ent(BELT, RING_X, RING_TOP, S)]
    out += run(RING_X, RING_TOP + 1, RING_X, RING_BOT - 1, S) + [ent(BELT, RING_X, RING_BOT, E)]
    out += run(RING_X + 1, RING_BOT, -60, RING_BOT, E)
    for y in WEST_TURRETS:
        out += [ent(TURRET, RING_X - 3, y), ent(INS, RING_X - 1, y, E)]
    for x in SOUTH_TURRETS:
        out += [ent(TURRET, x, RING_BOT + 2), ent(INS, x, RING_BOT + 1, N)]
    return out


PIECES = (("boot_line", boot_line), ("boot", boot), ("power_poles", power_poles), ("power", power), ("pipeline", pipeline), ("feeds", feeds),
          ("fluid", fluid), ("belts", belts), ("row1", row1), ("row2", row2), ("packs", packs), ("field", field))
POLED = {"fluid": "b_poles", "row1": "b_poles", "row2": "b_poles", "feeds": "b_poles", "pipeline": "l_poles",
         "field": "f_poles", "packs": "b_poles"}


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p26.py --snapshot 이 찍는다 (2026-09-26, tick 8.75M). 설계 칸 ±4 만 (전봇대는 ±12).
# 형식: 종류:x1,y1,x2,y2[:d][:i/o 또는 망] - b 벨트 u 지하 s 분배기 i 팔 f 고속 l 긴팔 p 전봇대 P 관 F 화로 A 조립기
# L 연구소 D 채굴기 G 포탑 C 상자 E 보일러·엔진 R 바위 X 잔해 K 절벽 ? 그 밖
SNAP = """
    A:-38,2,-36,4 D:-37,-83,-35,-81 D:-37,-86,-35,-84 D:-37,-89,-35,-87 D:-43,-86,-41,-84 D:-43,-89,-41,-87
    D:-43,-92,-41,-90 D:-43,-95,-41,-93 D:-45,-81,-43,-79 D:-48,-81,-46,-79 E:-37,-62,-36,-60 E:-37,-65,-36,-63
    E:-37,-68,-36,-66 E:-37,-71,-36,-69 E:-43,-62,-39,-60 E:-43,-65,-39,-63 E:-43,-68,-39,-66 E:-43,-71,-39,-69
    E:-48,-62,-44,-60 E:-48,-65,-44,-63 E:-48,-68,-44,-66 E:-48,-71,-44,-69 F:-37,-23,-36,-22 F:-37,-25,-36,-24
    F:-37,-27,-36,-26 F:-37,-29,-36,-28 F:-37,-31,-36,-30 F:-37,-33,-36,-32 F:-37,-35,-36,-34 F:-37,-37,-36,-36
    F:-37,-39,-36,-38 F:-37,-41,-36,-40 F:-37,-43,-36,-42 F:-37,-45,-36,-44 P:-17,-59,-17,-59 P:-18,-59,-18,-59
    P:-28,-59,-28,-59 P:-29,-59,-29,-59 P:-30,-59,-30,-59 P:-31,-59,-31,-59 P:-32,-59,-32,-59 P:-33,-59,-33,-59
    P:-34,-59,-34,-59 P:-35,-59,-35,-59 P:-36,-59,-36,-59 P:-38,-61,-38,-61 P:-38,-64,-38,-64 P:-38,-70,-38,-70
    P:-6,-59,-6,-59 P:-7,-59,-7,-59 R:-11,61,-10,63 R:-12,64,-10,65 R:-14,63,-12,65 R:-16,-44,-14,-42 R:-37,-13,-35,-11
    R:-38,-16,-36,-15 R:-8,-45,-6,-43 R:-96,363,-95,364 R:-98,364,-96,366 X:-14,-10,1,-2 X:-19,-3,-17,-3 X:-21,1,-20,2
    X:-24,0,-23,2 X:-27,0,-25,1 b:-34,-1,-34,-1:8 b:-34,-10,-34,-10:8 b:-34,-11,-34,-11:8 b:-34,-12,-34,-12:8
    b:-34,-13,-34,-13:8 b:-34,-14,-34,-14:8 b:-34,-15,-34,-15:8 b:-34,-16,-34,-16:8 b:-34,-17,-34,-17:8
    b:-34,-18,-34,-18:8 b:-34,-19,-34,-19:8 b:-34,-2,-34,-2:8 b:-34,-20,-34,-20:8 b:-34,-21,-34,-21:8
    b:-34,-22,-34,-22:8 b:-34,-23,-34,-23:8 b:-34,-24,-34,-24:8 b:-34,-25,-34,-25:8 b:-34,-26,-34,-26:8
    b:-34,-27,-34,-27:8 b:-34,-28,-34,-28:8 b:-34,-29,-34,-29:8 b:-34,-3,-34,-3:8 b:-34,-30,-34,-30:8
    b:-34,-31,-34,-31:8 b:-34,-32,-34,-32:8 b:-34,-33,-34,-33:8 b:-34,-34,-34,-34:8 b:-34,-35,-34,-35:8
    b:-34,-36,-34,-36:8 b:-34,-37,-34,-37:8 b:-34,-38,-34,-38:8 b:-34,-39,-34,-39:8 b:-34,-4,-34,-4:8
    b:-34,-40,-34,-40:8 b:-34,-41,-34,-41:8 b:-34,-42,-34,-42:8 b:-34,-43,-34,-43:8 b:-34,-44,-34,-44:8
    b:-34,-45,-34,-45:8 b:-34,-5,-34,-5:8 b:-34,-6,-34,-6:8 b:-34,-60,-34,-60:8 b:-34,-61,-34,-61:8 b:-34,-62,-34,-62:8
    b:-34,-63,-34,-63:8 b:-34,-64,-34,-64:8 b:-34,-68,-34,-68:8 b:-34,-69,-34,-69:8 b:-34,-7,-34,-7:8
    b:-34,-70,-34,-70:8 b:-34,-71,-34,-71:8 b:-34,-72,-34,-72:8 b:-34,-73,-34,-73:8 b:-34,-74,-34,-74:8
    b:-34,-75,-34,-75:8 b:-34,-76,-34,-76:8 b:-34,-77,-34,-77:8 b:-34,-78,-34,-78:8 b:-34,-79,-34,-79:8
    b:-34,-8,-34,-8:8 b:-34,-80,-34,-80:8 b:-34,-81,-34,-81:8 b:-34,-82,-34,-82:8 b:-34,-83,-34,-83:8
    b:-34,-84,-34,-84:8 b:-34,-86,-34,-86:8 b:-34,-87,-34,-87:8 b:-34,-88,-34,-88:8 b:-34,-89,-34,-89:8
    b:-34,-9,-34,-9:8 b:-34,0,-34,0:8 b:-34,1,-34,1:8 b:-34,2,-34,2:8 b:-35,-19,-35,-19:4 b:-36,-19,-36,-19:4
    b:-38,-1,-38,-1:8 b:-38,0,-38,0:12 b:-39,0,-39,0:12 b:-40,-1,-40,-1:8 b:-40,0,-40,0:8 b:-40,1,-40,1:8
    b:-40,2,-40,2:8 b:-42,-1,-42,-1:4 b:-43,-1,-43,-1:4 b:-44,-1,-44,-1:4 b:-45,-1,-45,-1:4 b:-52,-68,-52,-68:8
    b:-52,-69,-52,-69:8 b:-52,-70,-52,-70:8 b:-52,-71,-52,-71:8 b:-52,-72,-52,-72:8 b:-52,-73,-52,-73:8
    b:-52,-74,-52,-74:8 b:-52,-75,-52,-75:8 b:-52,-76,-52,-76:8 b:-52,-77,-52,-77:8 b:-52,-78,-52,-78:8
    b:-52,-79,-52,-79:8 b:-52,-80,-52,-80:8 b:-52,-81,-52,-81:8 b:-68,-10,-68,-10:8 b:-68,-11,-68,-11:8
    b:-68,-12,-68,-12:8 b:-68,-13,-68,-13:8 b:-68,-14,-68,-14:8 b:-68,-15,-68,-15:8 b:-68,-2,-68,-2:8 b:-68,-3,-68,-3:8
    b:-68,-4,-68,-4:8 b:-68,-5,-68,-5:8 b:-68,-6,-68,-6:8 b:-68,-7,-68,-7:8 b:-68,-8,-68,-8:8 b:-68,-9,-68,-9:8
    b:-71,-22,-71,-22:12 b:-72,-22,-72,-22:12 b:-73,-22,-73,-22:12 b:-74,-22,-74,-22:12 b:-75,-22,-75,-22:12
    b:-76,-22,-76,-22:12 b:-77,-22,-77,-22:12 b:-78,-22,-78,-22:12 b:-79,-22,-79,-22:12 b:-80,-22,-80,-22:12
    i:-35,-23,-35,-23:12 i:-35,-25,-35,-25:12 i:-35,-27,-35,-27:12 i:-35,-29,-35,-29:12 i:-35,-31,-35,-31:12
    i:-35,-33,-35,-33:12 i:-35,-35,-35,-35:12 i:-35,-37,-35,-37:12 i:-35,-39,-35,-39:12 i:-35,-41,-35,-41:12
    i:-35,-43,-35,-43:12 i:-35,-45,-35,-45:12 i:-35,-61,-35,-61:4 i:-35,-64,-35,-64:4 i:-35,-70,-35,-70:4
    p:-32,-70,-32,-70:1 p:-33,-25,-33,-25:2 p:-33,-31,-33,-31:2 p:-33,-37,-33,-37:2 p:-33,-43,-33,-43:2
    p:-33,-71,-33,-71:1 p:-33,-77,-33,-77:1 p:-33,-83,-33,-83:1 p:-33,-89,-33,-89:1 p:-35,-62,-35,-62:1
    p:-35,-66,-35,-66:1 p:-35,-68,-35,-68:1 p:-37,5,-37,5:2 p:-38,-24,-38,-24:2 p:-38,-28,-38,-28:2 p:-38,-30,-38,-30:2
    p:-38,-34,-38,-34:2 p:-38,-36,-38,-36:2 p:-38,-40,-38,-40:2 p:-38,-44,-38,-44:2 p:-38,-62,-38,-62:1
    p:-38,-68,-38,-68:1 p:-38,-76,-38,-76:1 p:-40,-88,-40,-88:1 p:-40,-94,-40,-94:1 p:-43,-30,-43,-30:2
    p:-43,-44,-43,-44:2 p:-44,-78,-44,-78:1 p:-45,-20,-45,-20:2 p:-45,-25,-45,-25:2 p:-45,-35,-45,-35:2
    p:-45,-41,-45,-41:2 p:-46,-84,-46,-84:1 p:-47,-18,-47,-18:2 p:-48,-11,-48,-11:2 p:-48,-4,-48,-4:2
    p:-48,-47,-48,-47:2 p:-50,-62,-50,-62:2 p:-50,-68,-50,-68:2 p:-50,2,-50,2:2 p:-52,-88,-52,-88:1 p:-55,1,-55,1:2
    p:-66,-34,-66,-34:2 p:-83,-35,-83,-35:2 p:-87,-29,-87,-29:2 u:-39,-1,-39,-1:4:o u:-41,-1,-41,-1:4:i
"""
DEBRIS = [
    ('big-rock', -36.563, -15.0, -38, -16, -36, -15),
    ('big-rock', -35.563, -11.813, -37, -13, -35, -11),
    ('big-rock', -14.875, -42.938, -16, -44, -14, -42),
    ('big-rock', -12.688, 64.75, -14, 63, -12, 65),
    ('big-rock', -10.563, 65.0, -12, 64, -10, 65),
    ('big-rock', -10.0, 62.563, -11, 61, -10, 63),
    ('big-sand-rock', -96.563, 365.5, -98, 364, -96, 366),
    ('big-sand-rock', -94.938, 363.813, -96, 363, -95, 364),
    ('crash-site-spaceship', -5.0, -6.0, -14, -10, 1, -2),
    ('crash-site-spaceship-wreck-small-1', -22.93, 1.406, -24, 0, -23, 2),
    ('crash-site-spaceship-wreck-small-2', -19.953, 1.57, -21, 1, -20, 2),
    ('crash-site-spaceship-wreck-small-5', -17.313, -2.34, -19, -3, -17, -3),
    ('crash-site-spaceship-wreck-small-6', -25.711, 0.348, -27, 0, -25, 1),
    ('huge-rock', -6.5, -43.75, -8, -45, -6, -43),
]
REPLACE = {(-34, -60): "transport-belt", (-68, -11): "transport-belt",
           (-38, -76): "small-electric-pole"}      # B6 증기 관 자리 - 새 전봇대 (-38,-75) 가 (-44,-78)·(-33,-77) 을 넘겨받은 뒤 걷는다   # 걷고 그 자리에 짓는다 (지하 입구 · 분배기)
SOURCES = {(-34, -60): {"L": {"coal"}, "R": {"coal"}},                  # 기존 보일러 석탄 벨트 (-34,-61) 에서
           (-68, -11): {"L": {"copper-plate"}, "R": {"copper-plate"}}}  # 기존 구리판 줄 (-68,-12) 에서 (실측 L1 구리)
OK_FLOWS = {((-68, -11), (-68, -10)), ((-75, -23), (-75, -22)),          # 분배기 본선 · P 벨트 합류
            ((-34, -61), (-34, -60)), ((-68, -12), (-68, -11)),
            ((-34, -90), (-34, -89))}                                    # 새 석탄 채굴기 -> 기존 보일러 석탄 벨트          # 기존 -> 새것 (걷은 자리)
SINKS = {(-75, -23): {"chemical-science-pack"}, (-34, -90): {"coal"}}                          # P -> 연구소 바깥 팔 15 (p25)
TAPS = {**{(IRON_X, y): "iron-plate" for y in range(-45, 0)},             # x=-34 철판 (L1 실측)
        **{(-34, y): "coal" for y in range(-89, -60)}}                    # p23 보일러 석탄 벨트 (x=-33.5)

_SNAP = None


def snap():
    global _SNAP
    if _SNAP is not None:
        return _SNAP
    out = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}, "labs": set()}
    for bit in SNAP.split():
        parts = bit.split(":")
        k = parts[0]
        x1, y1, x2, y2 = (int(v) for v in parts[1].split(","))
        extra = parts[2:]
        for x in range(x1, x2 + 1):
            for y in range(y1, y2 + 1):
                out["tiles"][(x, y)] = k
                if k in ("b", "u", "s"):
                    out["belts"][(x, y)] = (int(extra[0]), extra[1] if len(extra) > 1 else None, k)
                elif k in ("i", "f", "l"):
                    out["arms"][(x, y)] = (k, int(extra[0]))
                elif k == "p":
                    out["poles"][(x, y)] = int(extra[0]) if extra and extra[0].isdigit() else 0
    for t in REPLACE:
        out["tiles"].pop(t, None)
        out["belts"].pop(t, None)
    _SNAP = out
    return out


def debris_tiles():
    out = {}
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        for tx in range(x1, x2 + 1):
            for ty in range(y1, y2 + 1):
                out[(tx, ty)] = (name, x, y)
    return out


def arm_ends(a):
    r = ARMS[a["name"]]
    px, py = VEC[a["d"]]
    return (a["x"] + px * r, a["y"] + py * r), (a["x"] - px * r, a["y"] - py * r)


def occupancy(ents):
    occ, clash = {}, []
    for e in ents:
        for t in tiles(e):
            if t in occ:
                clash.append((t, occ[t]["name"], e["name"]))
            occ[t] = e
    return occ, clash


def place_poles(group, occ, net, reach=7.5):
    """소형 전봇대 욕심 배치 (p25 와 같은 규칙): 덮개 ±2 타일, 전선 7.5."""
    need = [e for e in group if e["name"] in POWERED]
    if not need:
        return []
    sn = snap()
    arm_spots = {t for e in occ.values() if e["name"] in ARMS for t in arm_ends(e)}
    blocked_ = set(sn["tiles"]) | set(occ) | set(debris_tiles()) | arm_spots
    where = {}
    for i, e in enumerate(need):
        for t in tiles(e):
            where.setdefault(t, set()).add(i)
    band = {(x + dx, y + dy) for (x, y) in where for dx in range(-3, 4) for dy in range(-3, 4)}
    cand = [c for c in band if c not in blocked_]
    covers = {c: set().union(*[where.get((c[0] + dx, c[1] + dy), set()) for dx in range(-2, 3) for dy in range(-2, 3)])
              for c in cand}
    todo = {i for i in range(len(need))
            if not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(need[i]) for p in net)}
    chosen = []
    reach_set = {c for c in cand if any(math.dist(c, p) <= reach for p in net)}
    while todo:
        pool = [c for c in reach_set if c not in chosen]
        if not pool:
            # 망에서 떨어진 무리: 가장 가까운 망 전봇대 쪽으로 다리 전봇대 (띠 밖이라도 빈칸)
            tgt = min(((need[i]["x"], need[i]["y"]) for i in todo), key=lambda q: min(math.dist(q, p) for p in net))
            src = min(net + chosen, key=lambda p: math.dist(p, tgt))
            if math.dist(src, tgt) <= 4:
                raise RuntimeError(f"전봇대 자리가 없다 ({len(todo)} 남음, {tgt})")
            k = max(1, math.ceil(math.dist(src, tgt) / 7))
            step = (src[0] + (tgt[0] - src[0]) * 1 / k, src[1] + (tgt[1] - src[1]) * 1 / k)
            c0 = (round(step[0]), round(step[1]))
            ring = sorted(((c0[0] + dx, c0[1] + dy) for dx in range(-2, 3) for dy in range(-2, 3)),
                          key=lambda c: math.dist(c, c0))
            c = next((c for c in ring if c not in blocked_ and c not in chosen and math.dist(c, src) <= reach), None)
            if c is None:
                raise RuntimeError(f"전봇대 자리가 없다 ({len(todo)} 남음, {tgt})")
            chosen.append(c)
            covers.setdefault(c, set())
            reach_set |= {q for q in cand if math.dist(q, c) <= reach}
            continue
        best = max(pool, key=lambda c: (len(covers[c] & todo),
                                        -min(math.dist(c, (need[i]["x"], need[i]["y"])) for i in todo), c))
        if not covers[best] & todo:
            pool = []                               # 닿는 후보가 아무것도 못 덮는다 -> 다리 전봇대로
            reach_set = set(chosen)
            continue
        chosen.append(best)
        todo -= covers.get(best, set())
        reach_set |= {c for c in cand if math.dist(c, best) <= reach}
    return chosen


def layout() -> dict:
    """단계 순서대로 {이름: 엔티티}. 전봇대는 지역마다 앞 단계 + 기존 망에서 이어 욕심 배치."""
    st = {k: f() for k, f in PIECES}
    everything = [e for v in st.values() for e in v]
    occ, _ = occupancy(everything)
    net = list(snap()["poles"]) + [(e["x"], e["y"]) for k in ("boot_line", "power_poles") for e in st[k] if e["name"] == POLE]
    order = {}
    for k, v in st.items():
        pname = POLED.get(k)
        if pname:
            ps = place_poles(v, occ, net)
            net += ps
            for x, y in ps:
                occ[(x, y)] = ent(POLE, x, y)
            order.setdefault(pname, []).extend(ent(POLE, x, y) for x, y in ps)
        order[k] = v
    # 전봇대는 그것이 먹이는 단계 앞에 선다
    out = {}
    for k in ("boot_line", "boot", "power_poles", "power", "l_poles", "pipeline", "feeds", "b_poles", "fluid", "belts", "row1", "row2",
              "packs", "f_poles", "field"):
        if order.get(k):
            out[k] = order[k]
    return out


# ------------------------------------------------------------------ 레인 추적 (p25 규칙 + 분배기 + 기존 줄에서 오는 것)

def left_of(d):
    return {N: W, E: N, S: E, W: S}[d]


def lane_of(belt_d, side):
    if side == VEC[left_of(belt_d)]:
        return "L"
    if side == tuple(-v for v in VEC[left_of(belt_d)]):
        return "R"
    return None


def made(e):
    if e is None or e["name"] not in (AM, FURN, CHEM):
        return None
    return RECIPE[e["recipe"]][1]


def want_of(m):
    return set(RECIPE[m["recipe"] if m["name"] != TURRET else TURRET][0])


def belt_map(ents):
    """칸 -> 벨트 조각 (분배기는 두 칸 모두)."""
    out = {}
    for e in ents:
        if e["name"] in BELTS:
            for t in tiles(e):
                out[t] = e
    return out


def trace(st):
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    belt = belt_map(ents)
    lanes = {k: {"L": set(), "R": set()} for k in belt}
    problems = []
    for k, v in SOURCES.items():
        for ln in "LR":
            lanes[k][ln] |= v[ln]
    for e in ents:                                  # 채굴기 -> 벨트 (앞 두 칸, 채굴기 쪽 레인)
        if e["name"] == EMD:
            vx, vy = VEC[e["d"]]
            k = (e["x"] + 2 * vx, e["y"] + 2 * vy)
            if k in belt:
                ln = lane_of(belt[k]["d"], (-vx, -vy))
                if ln:
                    lanes[k][ln].add(e["ore"])
    feeders = {}
    for k in belt:
        out = []
        for dx, dy in VEC.values():
            q = (k[0] - dx, k[1] - dy)
            e = belt.get(q)
            if e is None or e is belt[k] or (e["name"] == UG and e.get("kind") == "input"):
                continue
            fx, fy = VEC[e["d"]]
            if (q[0] + fx, q[1] + fy) == k:
                out.append((q, "back" if e["d"] == belt[k]["d"] else "side"))
        feeders[k] = out

    def ug_exit(k):
        e = belt[k]
        fx, fy = VEC[e["d"]]
        for i in range(1, 6):
            q = (k[0] + fx * i, k[1] + fy * i)
            if q in belt and belt[q]["name"] == UG and belt[q].get("kind") == "output" and belt[q]["d"] == e["d"]:
                return q
        return None

    arms = [e for e in ents if e["name"] in ARMS]
    for _ in range(400):
        changed = False
        for a in arms:
            src, dst = arm_ends(a)
            if dst not in belt:
                continue
            item = made(occ.get(src)) if src in occ else TAPS.get(src)
            if item is None:
                continue
            sx, sy = a["x"] - dst[0], a["y"] - dst[1]
            side = ((sx > 0) - (sx < 0), (sy > 0) - (sy < 0))
            ln = {"L": "R", "R": "L"}.get(lane_of(belt[dst]["d"], side))
            if ln is None:
                problems.append(f"팔 {a['x'], a['y']} 이 벨트 {dst} 의 앞/뒤에서 놓는다")
                continue
            if item not in lanes[dst][ln]:
                lanes[dst][ln].add(item)
                changed = True
        for k, e in belt.items():
            ins = feeders[k]
            curve = len(ins) == 1 and ins[0][1] == "side" and e["name"] == BELT
            for q, how in ins:
                src_l = lanes[q]
                if how == "back" or curve:
                    for ln in "LR":
                        if not src_l[ln] <= lanes[k][ln]:
                            lanes[k][ln] |= src_l[ln]
                            changed = True
                else:
                    ln = lane_of(e["d"], (q[0] - k[0], q[1] - k[1]))
                    allc = src_l["L"] | src_l["R"]
                    if not allc <= lanes[k][ln]:
                        lanes[k][ln] |= allc
                        changed = True
            if e["name"] == SPLIT:                 # 두 칸이 서로 나눠 받는다
                for t in tiles(e):
                    for ln in "LR":
                        if not lanes[k][ln] <= lanes[t][ln]:
                            lanes[t][ln] |= lanes[k][ln]
                            changed = True
            if e["name"] == UG and e.get("kind") == "input":
                ex = ug_exit(k)
                if ex:
                    for ln in "LR":
                        if not lanes[k][ln] <= lanes[ex][ln]:
                            lanes[ex][ln] |= lanes[k][ln]
                            changed = True
        if not changed:
            break
    for k, e in belt.items():
        if e["name"] == UG and e.get("kind") == "input":
            if ug_exit(k) is None:
                problems.append(f"지하 입구 {k} 에 짝 출구가 없다 (5칸 안)")
            if any(how == "side" for _, how in feeders[k]):
                problems.append(f"지하 입구 {k} 가 옆에서 받는다 - 한 레인만 넘어간다")
        if e["name"] == UG and e.get("kind") == "output" and feeders[k]:
            problems.append(f"지하 출구 {k} 로 다른 벨트가 들어온다")
    for k, v in lanes.items():
        for ln in "LR":
            if len(v[ln]) > 1:
                problems.append(f"레인 섞임 {k} {ln}: {sorted(v[ln])}")
    return lanes, problems


def nxt_belt(belt, k):
    e = belt[k]
    vx, vy = VEC[e["d"]]
    if e["name"] == UG and e.get("kind") == "input":
        for i in range(1, 6):
            q = (k[0] + vx * i, k[1] + vy * i)
            if q in belt and belt[q]["name"] == UG and belt[q].get("kind") == "output":
                return [q]
        return []
    if e["name"] == SPLIT:
        return [q for q in ((t[0] + vx, t[1] + vy) for t in tiles(e)) if q in belt]
    q = (k[0] + vx, k[1] + vy)
    return [q] if q in belt else []


def dead_ends(ents, occ, lanes) -> list:
    """소비자 없는 생산은 없다: 레인에 처음 실린 품목마다 하류 어딘가에 집어 쓰는 팔 (또는 SINKS) 이 있어야 한다."""
    belt = belt_map(ents)
    takes = {k: set(v) for k, v in SINKS.items()}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        dst = occ.get(dk)
        if sk in belt and dst is not None and dst["name"] in (AM, FURN, CHEM, TURRET):
            takes.setdefault(sk, set()).update(want_of(dst))
    memo = {}

    def down(k, seen=()):
        if k in memo:
            return memo[k]
        got, stack, vis = set(), [k], set()
        while stack:
            q = stack.pop()
            if q in vis:
                continue
            vis.add(q)
            got |= takes.get(q, set())
            for s in tiles(belt[q]) if belt[q]["name"] == SPLIT else [q]:
                stack += nxt_belt(belt, s)
        memo[k] = got
        return got

    up = {}
    for k in belt:
        for q in nxt_belt(belt, k):
            up.setdefault(q, []).append(k)
    bad, told = [], set()
    for k in belt:
        items = lanes[k]["L"] | lanes[k]["R"]
        came = set().union(*[lanes[q]["L"] | lanes[q]["R"] for q in up.get(k, [])]) if up.get(k) else set()
        if belt[k]["name"] == SPLIT:
            came |= set().union(*[lanes[t]["L"] | lanes[t]["R"] for t in tiles(belt[k])])
        for it in (items - came) - down(k):
            if it not in told:
                told.add(it)
                bad.append(f"소비자 없음: {it} 이 {k} 에서 하류 끝까지 가도 집어 쓰는 팔이 없다")
    return bad


# ------------------------------------------------------------------ 유체 (관 연결 · 섞임 · 소비자 · 구간 연장 320)
# 게임 프로토타입 (2026-09-26 조회): 북향 기준 (가운데에서 상대 위치, 연결 방향, 종류)
FB = {
    JACK: [((1, -1), N, "out", 1)],
    TANK: [((-1, -1), N, "io", 1), ((1, 1), E, "io", 1), ((1, 1), S, "io", 1), ((-1, -1), W, "io", 1)],
    REF: [((-1, 2), S, "in", 1), ((1, 2), S, "in", 2), ((-2, -2), N, "out", 3), ((0, -2), N, "out", 4), ((2, -2), N, "out", 5)],
    CHEM: [((-1, -1), N, "in", 1), ((1, -1), N, "in", 2), ((-1, 1), S, "out", 3), ((1, 1), S, "out", 4)],
    PUMP: [((0, -0.5), N, "out", 2), ((0, 0.5), S, "in", 1)],
}
EXTENT = 320


def rot(v, d):
    x, y = v
    return {N: (x, y), E: (-y, x), S: (-x, -y), W: (y, -x)}[d]


def conns(e):
    """[(칸, 방향, 역할, 상자 번호, 종류)] - 칸은 연결이 붙은 엔티티 쪽 칸."""
    d = e.get("d", N)
    if e["name"] == PIPE:
        return [((e["x"], e["y"]), k, "io", 1, "n") for k in (N, E, S, W)]
    if e["name"] == UGP:
        return [((e["x"], e["y"]), d, "io", 1, "n"), ((e["x"], e["y"]), (d + 8) % 16, "io", 1, "u")]
    px, py = pos(e)
    out = []
    for rel, cd, role, box in FB.get(e["name"], []):
        rx, ry = rot(rel, d)
        out.append(((math.floor(px + rx), math.floor(py + ry)), (cd + d) % 16, role, box, "n"))
    return out


def fluid_check(ents) -> tuple:
    fl = [e for e in ents if e["name"] in FLUIDS]
    at = {}                                         # (칸, 방향) -> (엔티티 번호, 상자)
    for i, e in enumerate(fl):
        for t, cd, role, box, kind in conns(e):
            if kind == "n":
                at[(t, cd)] = (i, box, role)
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        parent[find(a)] = find(b)

    bad = []
    sn = snap()
    water_nodes = []
    for i, e in enumerate(fl):
        for t, cd, role, box, kind in conns(e):
            node = (i, box)
            find(node)
            vx, vy = VEC[cd]
            nb = (t[0] + vx, t[1] + vy)
            if kind == "u":
                for k in range(1, 11):
                    q = (t[0] + vx * k, t[1] + vy * k)
                    hit = [j for j, f in enumerate(fl) if f["name"] == UGP and (f["x"], f["y"]) == q]
                    if hit:
                        f = fl[hit[0]]
                        if f["d"] == cd:           # 짝은 반대쪽을 본다 (지하 연결이 이쪽)
                            union(node, (hit[0], 1))
                        break
                else:
                    bad.append(f"지하관 {t} 에 10칸 안 짝이 없다")
                continue
            other = at.get((nb, (cd + 8) % 16))
            if other is not None:
                union(node, (other[0], other[1]))
            elif e["name"] in (PIPE, UGP) and sn["tiles"].get(nb) in ("P", "E"):
                if nb == WATER_TAP:
                    water_nodes.append(node)
                else:
                    bad.append(f"관 {t} 이 기존 {sn['tiles'][nb]} {nb} 에 닿는다")
    fluid = {}

    def add(node, what):
        fluid.setdefault(find(node), set()).add(what)

    for n in water_nodes:
        add(n, "water")
    for i, e in enumerate(fl):
        if e["name"] == JACK:
            add((i, 1), "crude-oil")
        if e["name"] == REF:
            for b in (3, 4, 5):
                add((i, b), "petroleum-gas")
    for _ in range(5):                              # 펌프: 들어오는 쪽 -> 나가는 쪽
        for i, e in enumerate(fl):
            if e["name"] == PUMP:
                for w in fluid.get(find((i, 1)), set()):
                    add((i, 2), w)
    for root, fs in fluid.items():
        if len(fs) > 1:
            bad.append(f"유체 섞임: {sorted(fs)} ({root})")

    def fl_at(i, b):
        return fluid.get(find((i, b)), set())

    for i, e in enumerate(fl):
        if e["name"] == REF:
            if fl_at(i, 2) != {"crude-oil"}:
                bad.append(f"정유 원유 입구 (상자 2): {sorted(fl_at(i, 2)) or '안 이어짐'}")
            if fl_at(i, 1):
                bad.append(f"정유 물 입구 (상자 1, 기본 정제는 안 씀) 에 {sorted(fl_at(i, 1))}")
        if e["name"] == CHEM:
            need = FLUID_IN[e["recipe"]]
            got = fl_at(i, 1) | fl_at(i, 2)
            if not need <= got:
                bad.append(f"{e['recipe']} ({e['x']},{e['y']}): 유체 모자람 {sorted(need - got)}")
            if e["recipe"] == "sulfur" and (fl_at(i, 1) != {"water"} or fl_at(i, 2) != {"petroleum-gas"}):
                bad.append(f"황: 상자 1 = 물 · 상자 2 = 가스 여야 한다 ({sorted(fl_at(i, 1))} / {sorted(fl_at(i, 2))})")
    # 구간 연장 (펌프가 끊는다): 관·지하관·탱크·펌프잭 칸의 상자 모양
    groups = {}
    for i, e in enumerate(fl):
        if e["name"] in (PIPE, UGP, TANK, JACK):
            groups.setdefault(find((i, 1)), []).extend(tiles(e))
    ext = []
    for root, ts in groups.items():
        xs, ys = [t[0] for t in ts], [t[1] for t in ts]
        span = max(max(xs) - min(xs), max(ys) - min(ys)) + 1
        ext.append((span, sorted(fluid.get(root, {"-"}))[0], len(ts)))
        if span > EXTENT:
            bad.append(f"유체 구간 연장 {span} > {EXTENT} ({sorted(fluid.get(root, set()))}) - 펌프로 끊어야 한다")
    return bad, sorted(ext, reverse=True)


# ------------------------------------------------------------------ 오프라인 확인

def pole_nets(st):
    old = list(snap()["poles"].items())
    new = [(e["x"], e["y"]) for v in st.values() for e in v if e["name"] == POLE]
    label = {p: {n} for p, n in old}
    for p in new:
        label.setdefault(p, set())
    changed = True
    while changed:
        changed = False
        for p in new:
            for q, ns in label.items():
                if q != p and math.dist(p, q) <= 7.5 and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    return {p: label[p] for p in new}


def check(st) -> list:
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, clash = occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    deb = debris_tiles()
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']} / {sn['tiles'][t]}" for t in occ
            if t in sn["tiles"] and sn["tiles"][t] not in ("R", "X")]
    bad += [f"바위·잔해 {t} 가 DEBRIS 에 없다" for t in occ if sn["tiles"].get(t) in ("R", "X") and t not in deb]
    lanes, probs = trace(st)
    bad += probs
    belt = belt_map(ents)
    lab_tiles = set()
    got = {}
    for e in ents:                                  # 채굴기가 앞 칸 화로·벨트에
        if e["name"] == EMD:
            vx, vy = VEC[e["d"]]
            if (e["x"] + 2 * vx, e["y"] + 2 * vy) not in belt and (e["x"] + 2 * vx, e["y"] + 2 * vy) not in TAPS:
                bad.append(f"채굴기 {e['x'], e['y']} 앞에 벨트가 없다")
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        at = (a["x"], a["y"])
        for t in (sk, dk):
            if sn["tiles"].get(t) in ("R", "X") and t not in deb:
                bad.append(f"팔 {at}: {t} 에 바위·잔해 - DEBRIS 에 없다")
        src = occ.get(sk)
        if src is not None:
            have = (lanes[sk]["L"] | lanes[sk]["R"]) if src["name"] in BELTS else {made(src)} - {None}
        elif sk in TAPS:
            have = {TAPS[sk]}
        else:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 {sn['tiles'].get(sk, '아무것도 없음')}")
            continue
        if not have:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 아무것도 안 온다")
        dst = occ.get(dk)
        if dst is None:
            bad.append(f"팔 {at}: 놓는 칸 {dk} 에 {sn['tiles'].get(dk, '아무것도 없음')}")
            continue
        if dst["name"] in (AM, CHEM, TURRET):
            use = want_of(dst) & have
            if not use:
                bad.append(f"팔 {at}: {dst.get('recipe', dst['name'])} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(use)
        elif dst["name"] == FURN:
            want = want_of(dst)
            dirty = (have & SMELTABLE) - want
            if dirty:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 녹일 수 있는 딴 것 {sorted(dirty)}")
            if not have & want:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(have & want)
        elif dst["name"] == BOILER:
            if "coal" not in have:
                bad.append(f"팔 {at}: 보일러에 석탄이 없다 (거기 {sorted(have)})")
        elif dst["name"] not in BELTS:
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for m in (e for e in ents if e["name"] in (AM, FURN, CHEM, TURRET)):
        lack = want_of(m) - got.get(id(m), set())
        if lack:
            bad.append(f"{m.get('recipe', m['name'])} ({m['x']},{m['y']}): 모자람 {sorted(lack)}")
    bad += dead_ends(ents, occ, lanes)
    # 기존 줄과 엉킴
    for k, e in belt.items():
        if e["name"] == UG and e.get("kind") == "input":
            continue
        vx, vy = VEC[e["d"]]
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ not in belt and nx_ in sn["belts"] and (k, nx_) not in OK_FLOWS:
            bad.append(f"벨트 {k} 가 기존 벨트 {nx_} 로 흘러든다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ in belt and (k, nx_) not in OK_FLOWS:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {nx_} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    # 전력
    ps = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + list(sn["poles"])
    for e in ents:
        if e["name"] in POWERED and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    for p, ns in pole_nets(st).items():
        if not ns:
            bad.append(f"전봇대 {p}: 기존 망에 안 닿는다 (7.5)")
    fb, _ext = fluid_check([e for k, v in st.items() if not k.startswith("power") for e in v])
    bad += fb
    return bad


# ------------------------------------------------------------------ 단계 (게임 step)

DEMOLISH = {"power": [("demolish", {"x": -37.5, "y": -75.5, "name": POLE, "search_radius": 0.3})],
            "feeds": [("demolish", {"x": -33.5, "y": -59.5, "name": BELT, "search_radius": 0.3}),
                      ("demolish", {"x": -67.5, "y": -10.5, "name": BELT, "search_radius": 0.3})]}


def steps_of(ents):
    out = []
    for e in ents:
        x, y = pos(e)
        p = {"name": e["name"], "x": x, "y": y}
        if "d" in e:
            p["direction"] = e["d"]
        if "kind" in e:
            p["type"] = e["kind"]
        out.append(("build", p))
    return out


def clear_steps(st):
    ents = [e for v in st.values() for e in v]
    spots = {t for e in ents for t in tiles(e)} | {t for e in ents if e["name"] in ARMS for t in arm_ends(e)}
    out = []
    for name, x, y, x1, y1, x2, y2 in DEBRIS:       # 바위끼리 겹친 칸이 있어 타일 사전이 아니라 목록으로
        if any((tx, ty) in spots for tx in range(x1, x2 + 1) for ty in range(y1, y2 + 1)):
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 1.0}))
    return out


def stages():
    st = layout()
    out = {}
    for k, v in st.items():
        if k == "pipeline":
            out["clear"] = clear_steps(st)
        steps = steps_of(v)
        if k in DEMOLISH:                           # 분배기·지하 입구는 벨트를 걷은 바로 뒤 (ammo23 실측)
            special = [s for s in steps if (s[1]["name"] in (SPLIT, UG) and (s[1]["name"] == SPLIT or s[1].get("type") == "input"))
                       or (k == "power" and s[1]["name"] == PIPE and (s[1]["x"], s[1]["y"]) == (-37.5, -75.5))]
            rest = [s for s in steps if s not in special]
            steps = rest + DEMOLISH[k] + special
        out[k] = steps
    return out


def counts(st):
    n = {}
    for v in st.values():
        for e in v:
            key = e["name"] if e["name"] not in (AM, FURN, EMD, CHEM) else f"{e['name']}:{e.get('recipe', e.get('ore'))}"
            n[key] = n.get(key, 0) + 1
    return n


def power_kw(n):
    return sum(KW.get(k.split(":")[0], 0) * v for k, v in n.items())


# ------------------------------------------------------------------ 게임 (읽기만)

CODE = {"transport-belt": "b", "underground-belt": "u", "splitter": "s", "inserter": "i", "fast-inserter": "f",
        "long-handed-inserter": "l", "small-electric-pole": "p", "medium-electric-pole": "p", "stone-furnace": "F",
        "steel-furnace": "F", "assembling-machine-1": "A", "assembling-machine-2": "A", "lab": "L",
        "electric-mining-drill": "D", "burner-mining-drill": "D", "gun-turret": "G", "iron-chest": "C",
        "wooden-chest": "C", "steam-engine": "E", "boiler": "E", "pipe": "P", "pipe-to-ground": "P",
        "offshore-pump": "E", "pump": "P", "storage-tank": "P", "pumpjack": "P"}

SNAP_LUA = """(function()
  local s, out = game.surfaces[1], {}
  for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}}) do
    if e.type ~= "resource" and e.type ~= "tree" and e.type ~= "character" and e.type ~= "item-entity"
       and e.type ~= "corpse" and e.type ~= "fish" and e.type ~= "entity-ghost" and e.type ~= "unit" then
      local b = e.bounding_box
      local d, kind, net = 0, "", ""
      pcall(function() d = e.direction end)
      if e.type == "underground-belt" then kind = e.belt_to_ground_type end
      if e.type == "electric-pole" then net = tostring(e.electric_network_id) end
      out[#out+1] = string.format("%%s|%%s|%%.3f|%%.3f|%%.3f|%%.3f|%%.3f|%%.3f|%%d|%%s|%%s",
        e.name, e.type, e.position.x, e.position.y, b.left_top.x, b.left_top.y, b.right_bottom.x, b.right_bottom.y,
        d, kind, net)
    end
  end
  return out
end)()"""


def snapshot(ai):
    """설계 칸 ±4 (전봇대는 ±12) 의 기존 엔티티를 SNAP · DEBRIS 형식으로 찍는다."""
    global _SNAP
    _SNAP = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}, "labs": set()}
    st = {k: f() for k, f in PIECES}
    ts = {t for v in st.values() for e in v for t in tiles(e)}
    near = {(x + dx, y + dy) for x, y in ts for dx in range(-4, 5) for dy in range(-4, 5)}
    far = {(x + dx, y + dy) for x, y in ts for dx in range(-12, 13, 2) for dy in range(-12, 13, 2)}
    rows = []
    for v in st.values():
        xs = [t[0] for e in v for t in tiles(e)]
        ys = [t[1] for e in v for t in tiles(e)]
        y = min(ys) - 13
        while y <= max(ys) + 13:                    # 긴 회랑은 60칸씩 끊어 묻는다
            reply = ai.lua(SNAP_LUA % (min(xs) - 13, y, max(xs) + 14, min(y + 60, max(ys) + 14)))
            rows += [str(r) for r in p1._rows(reply)]
            y += 60
    seen, toks, debris = set(), [], []
    for r in rows:
        name, typ, x, y, lx, ly, rx, ry, d, kind, net = r.split("|")
        if (name, x, y) in seen:
            continue
        seen.add((name, x, y))
        tx1, ty1 = math.floor(float(lx) + 0.01), math.floor(float(ly) + 0.01)
        tx2, ty2 = math.ceil(float(rx) - 0.01) - 1, math.ceil(float(ry) - 0.01) - 1
        cells = {(a, b) for a in range(tx1, tx2 + 1) for b in range(ty1, ty2 + 1)}
        if not cells & (far if typ == "electric-pole" else near):
            continue
        if typ == "simple-entity" or name.startswith("crash-site"):
            debris.append((name, float(x), float(y), tx1, ty1, tx2, ty2))
            toks.append(f"{'R' if typ == 'simple-entity' else 'X'}:{tx1},{ty1},{tx2},{ty2}")
            continue
        k = "K" if typ == "cliff" else ("!" if typ in ("unit-spawner", "turret") else CODE.get(name, "?"))
        tok = f"{k}:{tx1},{ty1},{tx2},{ty2}"
        if k in ("b", "s", "i", "f", "l"):
            tok += f":{d}"
        elif k == "u":
            tok += f":{d}:{'i' if kind == 'input' else 'o'}"
        elif k == "p":
            tok += f":{net}"
        toks.append(tok)
    lines, line = [], "   "
    for t in sorted(set(toks)):
        if len(line) + len(t) > 118:
            lines.append(line)
            line = "   "
        line += " " + t
    lines.append(line)
    print('SNAP = """')
    print("\n".join(lines))
    print('"""')
    print("DEBRIS = [")
    for dd in sorted(set(debris)):
        print(f"    ({dd[0]!r}, {dd[1]}, {dd[2]}, {dd[3]}, {dd[4]}, {dd[5]}, {dd[6]}),")
    print("]")


POWER_LUA = """(function()
  local s, f, out, seen = game.surfaces[1], game.forces.player, {}, {}
  for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f}) do
    local n = p.electric_network_id
    if n and not seen[n] then
      seen[n] = true
      local st, sum = p.electric_network_statistics, 0
      for name, _ in pairs(st.input_counts) do
        sum = sum + st.get_flow_count{name = name, category = "input", precision_index = defines.flow_precision_index.one_minute, count = false}
      end
      local gen = 0
      for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
        if g.electric_network_id == n then gen = gen + 900 end
      end
      if gen > 0 or sum > 0 then out[#out+1] = string.format("net %d: use(1min) %.0f kW / cap %.0f kW", n, sum * 60 / 1000, gen) end
    end
  end
  return out
end)()"""

THREAT_LUA = """(function() local o = {}
  local s, f = game.surfaces[1], game.forces.player
  for _, e in pairs(s.find_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"}, position = {-73, 373}, radius = 200}) do
    o[#o+1] = string.format("%s (%.0f,%.0f) %.0f", e.name, e.position.x, e.position.y,
                            math.sqrt((e.position.x + 73)^2 + (e.position.y - 373)^2)) end
  for _, n in pairs({"oil-processing", "plastics", "sulfur-processing", "advanced-circuit", "chemical-science-pack"}) do
    o[#o+1] = n .. " researched=" .. tostring(f.technologies[n].researched) end
  return o end)()"""

ORE_LUA = """(function() local n, a = {}, 0
  for _, r in pairs(game.surfaces[1].find_entities_filtered{type = "resource", area = {{%f, %f}, {%f, %f}}}) do
    n[r.name] = (n[r.name] or 0) + 1 a = a + r.amount end
  local t = {} for k, v in pairs(n) do t[#t+1] = k .. ":" .. v end
  return {table.concat(t, "/"), a} end)()"""


def set_recipes(ai, who):
    for e in (e for v in layout().values() for e in v if e["name"] in (AM, CHEM, REF)):
        x, y = pos(e)
        r = ai.set_recipe(who, x, y, e["recipe"])
        if isinstance(r, dict) and r.get("error"):
            print(f"  레시피 {e['recipe']} ({x},{y}): {r['error']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    for f in ("check", "snapshot", "recipes", "ores", "power", "threat"):
        ap.add_argument("--" + f, action="store_true")
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    if args.snapshot:
        from client import AIBridge
        snapshot(AIBridge())
        return 0
    st = layout()
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 · 팔 집는/놓는 칸 · 레인 한 품목 · 하류 소비자 · "
                                         "기존 줄과 안 엉킴 · 전력 덮개 · 전선 7.5 · 유체 (섞임·소비자·연장 320) 모두 통과")
        n = counts(st)
        print("  수량:", n)
        print("  유체 구간 (연장, 유체, 칸 수):", fluid_check([e for k, v in st.items() if not k.startswith("power") for e in v])[1])
        nets = sorted(set().union(*pole_nets(st).values()))
        print(f"  새 전봇대 {sum(1 for v in st.values() for e in v if e['name'] == POLE)} · 이어지는 기존 망 {nets}")
        print(f"  최대 전력 {power_kw(n) / 1000:.2f} MW (새것만, 팔이 다 움직일 때)")
        for k, v in stages().items():
            print(f"  {k:10s} {len(v)}")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update({AM: {"iron-plate": 22, "copper-plate": 4.5}, FAST: {"iron-plate": 8, "copper-plate": 4.5},
                    LONG: {"iron-plate": 7, "copper-plate": 1.5}, UG: {"iron-plate": 8.75}, UGP: {"iron-plate": 7.5},
                    JACK: {"steel-plate": 5, "iron-plate": 40, "copper-plate": 7.5}, TANK: {"iron-plate": 20, "steel-plate": 5},
                    REF: {"steel-plate": 15, "iron-plate": 45, "copper-plate": 15, "stone-brick": 10},
                    CHEM: {"steel-plate": 5, "iron-plate": 20, "copper-plate": 7.5},
                    PUMP: {"steel-plate": 2, "iron-plate": 6}, TURRET: {"iron-plate": 40, "copper-plate": 10},
                    BOILER: {"iron-plate": 4, "stone": 5}, ENGINE: {"iron-plate": 31}, SPLIT: {"iron-plate": 11.5, "copper-plate": 7.5}})
    p1.PAIRED.update({UG, UGP})
    p1.PARK = PARK
    ai = AIBridge()
    sts = stages()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        if nb:
            bad = p1.blocked(ai, steps)
            print(f"  {name:10s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
        else:
            spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
            print(f"  {name:10s} 치움 {len(p1.vanished(ai, steps) & spots)}/{len(spots)}")
    if args.ores:
        for e in (e for v in st.values() for e in v if e["name"] == EMD):
            x, y = pos(e)
            print(f"   {e['ore']} ({e['x']},{e['y']})", ai.lua(ORE_LUA % (x - 2.5, y - 2.5, x + 2.5, y + 2.5)))
    if args.power:
        for r in p1._rows(ai.lua(POWER_LUA)):
            print("  ", r)
    if args.threat:
        for r in p1._rows(ai.lua(THREAT_LUA)):
            print("  ", r)
    if args.recipes:
        set_recipes(ai, (args.who or "golf").split(",")[0])
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p26"
    detached.mark(crew, "p26", minutes=180)
    try:
        ok = p1.build_stage(ai, crew, sts[args.stage], args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""P4-6 for run 23: chemical science pack 0.1 -> 0.4/s (new block G, +0.3/s). Design + offline check only (p25/p26/p27 structure).

목표율 +0.3/s (합 0.4/s = 4배) - 근거 (게임 실측 2026-09-26, tick 9.93M):
    · 화학팩 0.107/s, p26 조립기 3 모두 working = 설계율이 병목. 연구 laser (빨강·초록·화학 30초 단위), 연구소 15 x 1.5
      -> 0.75/s 까지 먹는다. 빨강 조립기 8 (0.8/s) · 초록 9 (0.75/s) 는 full_output - 0.4 까지는 팩 공급 쪽 여유가 있다.
    · 철: x=-34 줄 (p24 기둥 화로 24 = 7.5/s 상한) 이 압축된 채 서 있고 화로 결과칸에 60~74 씩 쌓였다 (golf 가 손으로 모음).
      잉여 ~4/s. 이 블록 +0.3/s 는 철 3.6/s -> 탭 하나 (고속 팔, 손 크기 +1 = 2개씩).
    · 구리: 화로 8 = 2.5/s, 소비 1.2/s. 이 블록 +0.3 은 구리 2.25/s -> **0.2 (이 블록 +0.1, 구리 0.75) 까지만 지금 구리로 된다.**
      0.4 는 빨강·초록 0.4 (구리 1.0) 까지 합쳐 구리 4.0/s -> 구리 +1.5/s 증설 (화로 5 · 채굴기 3) 이 먼저 (p28 밖).
    · 석탄: 보일러 줄 x=-34 채굴기 5 중 둘이 2.5천 · 4.5천 남음 -> 보일러 석탄이 먼저 모자란다. coal 단계가 채굴기 3 (+1.5/s, 매장 ~3.3만 - 얇다, ~6시간) 를 보일러 줄 머리에 붙인다.
      이 블록 석탄 (플라스틱 0.45 + 강철 화로 연료 0.07) 은 p26 분배기 **뒤** (보일러가 먼저 먹은 나머지) 에서 팔로 뽑는다.
    · 전력: 10.8MW 에 지금 4.7~4.8MW. 새것 최대 4.8MW (팔이 다 움직일 때, 평균 ~3.3) + 빨강·초록·연구소가 0.4 로 돌면 +~1.9MW
      -> 0.4 에서 ~9.9MW (92%, 최대치면 넘는다) -> 0.4 전에 보일러 2 · 엔진 4 증설 (p28 밖 - 보일러 줄 남북이 채굴기·관으로 막혀
      새 자리가 필요). 0.2 에서는 ~6.5MW (60%).
    · 강철: 허브 412 (p26 때는 0). 이 블록이 먹는 강철 51 (정유 15 · 화학 5 · 펌프잭 5 · 조립기2형 4x2 · 강철 화로 3x6) - 부트스트랩 부족 없음.

레시피 (게임): 화학팩 2 = 엔진 2 + 고급회로 3 + 황 1 (24초) · 엔진 = 강철 1 + 톱니 1 + 관 2 (10초) · 고급회로 = 플라스틱 2 + 구리선 4 + 회로 2 (6초)
    강철 = 철 5 (16초, 강철 화로 속도 2 -> 0.125/s) · 플라스틱 2 = 가스 20 + 석탄 1 (1초) · 황 2 = 가스 30 + 물 30 · 기본 정제 원유 100 -> 가스 45 (5초)

| 기계 (+0.3/s) | 필요 (ratio.py) | 짓는 수 | 상한 |
|---|---|---|---|
| 화학팩 CP (1형) | 7.2 | 8 | 0.333/s |
| 엔진 EN (1형) | 6.0 | 6 | 0.30 |
| 고급회로 AC (**2형**) | 5.4 (1형) / 3.6 (2형) | 4 | 0.50 |
| 구리선 CB · 회로 EC · 톱니 GR · 관 PP (1형) | 2.2 · 0.9 · 0.3 · 0.6 | 4 · 1 · 3 · 1 (직삽 배치라 CB·GR 이 남는다) | |
| 강철 화로 (steel-furnace) | 2.4 | 3 | 0.375 |
| 플라스틱 PL2 (화학 공장, 속도 1) | 0.45 | 1 | 2.0/s |
| 황 | 0.075 | 0 - p26 황 공장 SU1 (상한 2/s, 쓰는 것 0.05) 에 둘째 출력 팔 | |
| 정유 RF2 (기본) | 가스 합 15/s = 정유 1.67 | +1 (합 2 = 18/s) | |
| 펌프잭 | 원유 33/s | +1 (우물 (-69.5,381.5) 256% = 25.6/s, 합 50/s) | |
조립기 2형 비교: AC 를 1형 6 으로 두면 북쪽 줄 폭 44 > 자리 34 - 2형 4 (강철 8) 로 줄였다. EN·CP 는 1형 (강철 0, 전력 1형 0.5/75kW 가 2형 0.75/150kW 보다 효율).
관로 용량: 원유 33/s 는 펌프 1,200/s · 한 구간 유량에 비해 작다. 구간 연장은 탱크~펌프 203 · 펌프~정유 235 (< 320).

배치 - 블록 G 는 원유 관 회랑 (x=-13 관 · x=-10 관) 동쪽 빈 땅 (x -12..37, y -56..-15). 흐름은 모두 벨트 (허브 상자 0):
    탭 (기존 벨트 옆에 팔만 - 기존 벨트를 걷는 칸 0):
      철  고속 팔 (-33,-8) <- x=-34 (압축, 두 레인 철)       구리 고속 팔 (-31,-8) <- y=-9 (p26 구리 가지)
      석탄 팔 (-29,-54) <- p26 분배기 뒤 석탄 (-29,-53)       황 팔 (-13,-44) <- SU1 동쪽 면
    M (철|구리): y=-7 동향 -> F (x=-18) 지하 -> x=-16 북향 -> y=-42 동향 -> x=-1 남향 -> 버스 X2
    K (석탄): y=-56 동향 (물 관 x=-22 지하) -> x=-2 남향 (가스 줄 y=-48 · QS/M 줄 지하) -> PL2 · 강철 화로 3
    강철 셀 (x -8..-1, y -37..-32): ST x=-8 (남향) | 출력 팔 -7 | 강철 화로 -6..-5 | 긴팔 -4 (K) | 긴팔 -3 (M) | K -2 | M -1
      PP (-11,-30) 는 M (x=-16) 에서 긴팔로 철, ST 동쪽 레인에 관 -> ST = 관 | 강철 -> 버스 X3
    북쪽: RF2 (-6,-51) 남향 (원유 = 기존 (-10,-54) 에서 y=-54 가지, 가스 = y=-48 줄을 동쪽으로 x=2 까지 이어 RF1 과 한 망)
          PL2 (1,-45) -> QP (x=0 남향) -> 버스 X1 · 황 QS: y=-43 동향 -> x=36 남향 -> C2 에 북쪽 옆치기
    버스 (동향, x -8..34): X1 y=-30 (회로 S | 플라스틱 N) · X2 y=-29 (M: 철 | 구리) · X3 y=-28 (강철 S | 관 N)
      북쪽 줄 (y -34..-32): CB EC CB | AC CB AC | AC CB AC (구리선 직삽, AC 2형) -> OA y=-36 -> x=37 남향 -> C2 머리
      남쪽 줄 (y -26..-24): EN GR EN | EN GR EN | EN GR EN (톱니 직삽, 강철·관은 X3) -> OE y=-22 (동향, 막다른 끝)
    CP 줄 (y -19..-17, x 5..28): OE (엔진, 긴팔) · C2 y=-21 서향 (AC S | 황 N) -> OC y=-15 서향 -> M 밑 지하 -> F (-18,-15) 동쪽 옆치기
      = p26 화학팩 레인 (F 동쪽 레인) -> y=-6 -> P 벨트 북쪽 레인 -> 연구소 15. 기존 출구 합류, 새 줄 0.
    coal (전력용, 먼저): 채굴기 3 (y=-98 남향 x -42 -39 · (-38,-94) 북향) -> y=-96 동향 -> x=-34 남향 -> 보일러 줄 머리 (-34,-91) 뒤에서.
    pump2: 펌프잭 (-69.5,381.5) -> x=-69 북향 -> (-71,371) 에서 기존 원유 관 (펌프잭1 관 · 탱크) 에 붙는다.

    python scripts/p28.py --check                    # 오프라인 확인 (SNAP · p25/p26/p27 예약 영역)
    python scripts/p28.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만)
    python scripts/p28.py --snapshot                 # 설계 둘레 기존 엔티티·바위·나무 -> SNAP/DEBRIS/TREES (게임 읽기만)
    python scripts/p28.py --ores --power             # 새 채굴기 자원 · 전력 (게임 읽기만)
    python scripts/p28.py --recipes --who golf       # 레시피 지정 (설계자는 돌리지 않았다)
    python scripts/p28.py --stage coal --who alpha,golf   # 짓기 (설계자는 돌리지 않았다)
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
AM2, SFURN = "assembling-machine-2", "steel-furnace"
SPLIT, PIPE, UGP, PUMP = "splitter", "pipe", "pipe-to-ground", "pump"
JACK, TANK, REF, CHEM = "pumpjack", "storage-tank", "oil-refinery", "chemical-plant"
ARMS = {INS: 1, FAST: 1, LONG: 2}
BELTS = {BELT, UG, SPLIT}
FLUIDS = {PIPE, UGP, PUMP, JACK, TANK, REF, CHEM}
MACH = {AM, AM2, FURN, SFURN, CHEM}
POWERED = {AM, AM2, INS, FAST, LONG, EMD, JACK, REF, CHEM, PUMP}
KW = {EMD: 90, AM: 77.5, AM2: 155, INS: 14.7, FAST: 58.8, LONG: 21, JACK: 90, REF: 420, CHEM: 210, PUMP: 29}   # 드레인 포함

RATE = 0.3
RECIPE = {   # 레시피: (재료, 결과) - 화로는 넣는 것 + 연료
    "copper-cable": ({"copper-plate"}, "copper-cable"),
    "electronic-circuit": ({"iron-plate", "copper-cable"}, "electronic-circuit"),
    "iron-gear-wheel": ({"iron-plate"}, "iron-gear-wheel"),
    "pipe": ({"iron-plate"}, "pipe"),
    "engine-unit": ({"steel-plate", "iron-gear-wheel", "pipe"}, "engine-unit"),
    "advanced-circuit": ({"plastic-bar", "copper-cable", "electronic-circuit"}, "advanced-circuit"),
    "chemical-science-pack": ({"engine-unit", "advanced-circuit", "sulfur"}, "chemical-science-pack"),
    "plastic-bar": ({"coal"}, "plastic-bar"),          # + 석유가스 (관)
    "steel-plate": ({"iron-plate", "coal"}, "steel-plate"),
}
FLUID_IN = {"plastic-bar": {"petroleum-gas"}, "sulfur": {"water", "petroleum-gas"}}
SMELTABLE = {"stone", "iron-ore", "copper-ore", "iron-plate"}
# 판으로 따진 값 (게임 레시피 2026-09-26) - 단계별 철·강철 소모를 오프라인으로 찍는다
COST = {**p1.COST,
        UG: {"iron-plate": 8.75}, LONG: {"iron-plate": 7, "copper-plate": 1.5}, FAST: {"iron-plate": 8, "copper-plate": 4.5},
        AM: {"iron-plate": 22, "copper-plate": 4.5},
        AM2: {"iron-plate": 35, "copper-plate": 9, "steel-plate": 2},
        SFURN: {"steel-plate": 6, "stone-brick": 10},
        JACK: {"steel-plate": 5, "iron-plate": 35, "copper-plate": 7.5},
        REF: {"steel-plate": 15, "iron-plate": 40, "copper-plate": 15, "stone-brick": 10},
        CHEM: {"steel-plate": 5, "iron-plate": 20, "copper-plate": 7.5},
        UGP: {"iron-plate": 7.5}, PIPE: {"iron-plate": 1}}

# ---- 배치 상수 (타일. 홀수 크기는 가운데 타일, 짝수는 왼쪽 위) -----------------------------
IRON_TAP, CU_TAP = (-33, -8), (-31, -8)            # x=-34 철 · y=-9 구리 (p26 구리 가지) 옆 고속 팔
COAL_TAP, SU_TAP = (-29, -54), (-13, -44)          # p26 분배기 뒤 석탄 (-29,-53) · SU1 (-14,-44)
MV_X, M_Y = -16, -42                               # M 북향 기둥 · 동향 줄
Y_QS, Y_K = -43, -56
ST_X, OUT_X, SF_X, L1_X, L2_X, K_X, M_X, QP_X = -8, -7, -6, -4, -3, -2, -1, 0
SF_YS = (-37, -35, -33)                            # 강철 화로 왼쪽 위 y
PP_C = (-11, -30)
REF_C, PL_C = (-6, -51), (1, -45)
Y_OA, Y_X1, Y_X2, Y_X3 = -36, -30, -29, -28
NR_Y, SR_Y, CP_Y = -33, -25, -18                   # 북쪽 줄 · 남쪽 줄 · CP 줄 가운데 y
Y_OE, Y_C2, Y_OC = -22, -21, -15
BUS_END, QS_X, OA_X = 34, 36, 37
CP_XS = [6, 9, 12, 15, 18, 21, 24, 27]
F_JOIN = (-18, -15)                                # p26 F (남향, 화학팩 = 동쪽 레인)
COAL_Y = -96                                       # 새 석탄 벨트 (동향) -> x=-34 남향 -> 보일러 줄 머리 (-34,-91)
JACK2_C = (-70, 381)                               # 우물 (-69.5,381.5)
PARK = (10.5, -12.5)                               # 공사 뒤 비켜 서는 곳 (빈 땅)


def ent(name, x, y, d=None, **kw):
    e = {"name": name, "x": x, "y": y}
    if d is not None:
        e["d"] = d
    e.update(kw)
    return e


def dims(e):
    n, d = e["name"], e.get("d", N)
    if n in (AM, AM2, EMD, JACK, TANK, CHEM, "lab"):
        return 3, 3
    if n == REF:
        return 5, 5
    if n in (FURN, SFURN, "gun-turret"):
        return 2, 2
    if n == PUMP:
        return (1, 2) if d in (N, S) else (2, 1)
    if n == SPLIT:
        return (2, 1) if d in (N, S) else (1, 2)
    if n == "boiler":
        return (3, 2) if d in (N, S) else (2, 3)
    if n == "steam-engine":
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
    """관 한 직선 (끝 포함): 지하관 쌍 (11칸) + 남는 칸은 보통 관 (p26 과 같다)."""
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
    out = [ent(PIPE, *pts[0])]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        sx, sy = (bx > ax) - (bx < ax), (by > ay) - (by < ay)
        if abs(bx - ax) + abs(by - ay) > 1:
            out += prun(ax + sx, ay + sy, bx - sx, by - sy)
        out.append(ent(PIPE, bx, by))
    return out


# ------------------------------------------------------------------ 배치 (순수)

def coal():
    """전력용 석탄 (먼저): 채굴기 3 -> y=-96 동향 -> x=-34 남향 -> 기존 보일러 줄 머리 (-34,-91) 에 뒤에서 잇는다.
    x=-45 · -43 자리는 채굴 범위에 돌 ((-45,-99) 122 · (-46,-99) · (-47,-97)) - 보일러 줄에 돌이 섞이면 p26 A 레인 끝이 막힌다 -> x=-42 부터."""
    out = [ent(EMD, x, COAL_Y - 2, S, ore="coal") for x in (-42, -39)]
    out.append(ent(EMD, -38, COAL_Y + 2, N, ore="coal"))
    out += run(-42, COAL_Y, -35, COAL_Y, E) + [ent(BELT, -34, COAL_Y, S)] + run(-34, COAL_Y + 1, -34, -92, S)
    return out


def pump2():
    """펌프잭 2 (우물 256%) -> 출구 (-69,379) -> x=-69 북향 -> y=372 서향 -> (-71,371) = 기존 펌프잭1 관 (-72,371) · 원유 줄 머리 (-71,370)."""
    return [ent(JACK, *JACK2_C, N)] + pline([(-69, 379), (-69, 372), (-71, 372), (-71, 371)])


def m_line():
    """탭 둘 (고속 팔) -> M (철|구리) y=-7 -> F 지하 -> x=-16 북향 -> y=-42 동향 -> x=-1 남향 (y=-30 까지, 버스 X2 는 bus)."""
    out = [ent(FAST, *IRON_TAP, W), ent(FAST, *CU_TAP, N)]
    out += [ent(BELT, -32, -8, S), ent(BELT, -32, -7, E)] + run(-31, -7, -20, -7, E) + ug(-19, -7, -17, -7, E)
    out += [ent(BELT, MV_X, -7, N)] + run(MV_X, -8, MV_X, M_Y + 1, N) + [ent(BELT, MV_X, M_Y, E)]
    out += run(MV_X + 1, M_Y, M_X - 1, M_Y, E) + [ent(BELT, M_X, M_Y, S)] + run(M_X, M_Y + 1, M_X, Y_X1, S)
    return out


def k_line():
    """석탄 탭 (p26 분배기 뒤) -> y=-56 동향 -> x=-2 남향 (가스 줄 · QS/M 줄은 지하) -> 강철 화로 셋째 긴팔 (y=-33) 에서 끝."""
    out = [ent(INS, *COAL_TAP, S), ent(BELT, -29, -55, E), ent(BELT, -28, -55, N), ent(BELT, -28, Y_K, E)]
    out += run(-27, Y_K, -24, Y_K, E) + ug(-23, Y_K, -21, Y_K, E) + run(-20, Y_K, K_X - 1, Y_K, E)
    out += [ent(BELT, K_X, Y_K, S)] + run(K_X, Y_K + 1, K_X, -50, S) + ug(K_X, -49, K_X, -47, S)
    out += run(K_X, -46, K_X, -45, S) + ug(K_X, -44, K_X, -41, S) + run(K_X, -40, K_X, SF_YS[-1], S)
    return out


def steel():
    """강철 화로 3 (M 철 · K 석탄 긴팔) -> 출력 팔 -> ST (x=-8 남향, 서쪽 레인) · PP (M 에서 긴팔) -> ST 동쪽 레인 = 관.
    ST 는 y=-29 에서 끝나고 버스 X3 가 (-8,-28) 에서 받는다."""
    out = []
    for fy in SF_YS:
        out += [ent(SFURN, SF_X, fy, recipe="steel-plate"), ent(LONG, L1_X, fy, E), ent(LONG, L2_X, fy, E),
                ent(INS, OUT_X, fy, E)]
    out += run(ST_X, SF_YS[0], ST_X, Y_X3 - 1, S)
    px, py = PP_C
    out += [ent(AM, px, py, recipe="pipe"), ent(LONG, px - 3, py, W), ent(INS, px + 2, py, W)]
    return out


def fluid():
    """RF2 (남향, 원유 = 기존 (-10,-54) 에서 y=-54) · 가스 줄 y=-48 (기존 (-12,-48) 에서 동쪽 x=2) · PL2 (북향) + 석탄 팔 · 출력 -> QP."""
    out = [ent(REF, *REF_C, S, recipe="basic-oil-processing")] + [ent(PIPE, x, -54) for x in (-9, -8, -7)]
    out += [ent(PIPE, x, -48) for x in range(-11, 3)]                      # (-2,-48) 은 K 지하 벨트 위 (층이 다르다)
    out += [ent(CHEM, *PL_C, N, recipe="plastic-bar"), ent(PIPE, 0, -47), ent(PIPE, 2, -47)]
    out += [ent(INS, -1, -45, W), ent(INS, 2, -43, N)]
    out += [ent(BELT, 2, -42, W), ent(BELT, 1, -42, W), ent(BELT, QP_X, -42, S)] + run(QP_X, -41, QP_X, Y_X1 - 1, S)
    return out


def sulfur():
    """SU1 동쪽 면 팔 -> QS: y=-43 동향 (PL2 출력 팔 밑 지하) -> x=36 남향 (OA 밑 지하) -> (36,-22) 에서 C2 북쪽 옆치기."""
    out = [ent(INS, *SU_TAP, W), ent(BELT, -12, -44, S), ent(BELT, -12, Y_QS, E)]
    out += run(-11, Y_QS, 0, Y_QS, E) + ug(1, Y_QS, 3, Y_QS, E) + run(4, Y_QS, QS_X - 1, Y_QS, E)
    out += [ent(BELT, QS_X, Y_QS, S)] + run(QS_X, Y_QS + 1, QS_X, Y_OA - 2, S) + ug(QS_X, Y_OA - 1, QS_X, Y_OA + 1, S)
    out += run(QS_X, Y_OA + 2, QS_X, Y_C2 - 1, S)
    return out


def bus():
    """X1 (QP 가 북쪽에서 꺾여 들어옴) · X2 (M) · X3 (ST). 셋 다 x=34 에서 끝 (x=35 빈칸, x=36 은 QS)."""
    return (run(QP_X, Y_X1, BUS_END, Y_X1, E) + run(M_X, Y_X2, BUS_END, Y_X2, E)
            + run(ST_X, Y_X3, BUS_END, Y_X3, E))


def north():
    """북쪽 줄: CB EC CB | AC CB AC | AC CB AC. 구리선은 가운데 팔로 직삽, 회로는 EC -> X1 남쪽 레인, 플라스틱은 X1 북쪽 레인.
    AC (2형) 출력 -> OA (y=-36) -> x=37 남향 -> C2 머리."""
    y = NR_Y
    out = []

    def cb(cx):
        return [ent(AM, cx, y, recipe="copper-cable"), ent(LONG, cx, y + 2, S)]      # X2 구리 (긴팔)

    def ac(cx):
        return [ent(AM2, cx, y, recipe="advanced-circuit"), ent(INS, cx, y + 2, S),  # X1 회로·플라스틱
                ent(INS, cx, y - 2, S)]                                              # -> OA
    out += cb(2) + [ent(INS, 4, y, W)]
    out += [ent(AM, 6, y, recipe="electronic-circuit"), ent(LONG, 5, y + 2, S), ent(INS, 6, y + 2, N)]
    out += [ent(INS, 8, y, E)] + cb(10)
    for a, c, b in ((13, 17, 21), (25, 29, 33)):
        out += ac(a) + [ent(INS, a + 2, y, E)] + cb(c) + [ent(INS, c + 2, y, W)] + ac(b)
    out += run(12, Y_OA, OA_X - 1, Y_OA, E) + [ent(BELT, OA_X, Y_OA, S)] + run(OA_X, Y_OA + 1, OA_X, Y_C2 - 1, S)
    return out


def south():
    """남쪽 줄: EN GR EN x3. 강철·관은 X3 (팔), 톱니는 GR 에서 직삽, GR 철은 X2 (긴팔). 엔진 -> OE (y=-22 동향, x=34 에서 막힘)."""
    y = SR_Y
    out = []
    for e1, g, e2 in ((-2, 2, 6), (10, 14, 18), (22, 26, 30)):
        out += [ent(AM, g, y, recipe="iron-gear-wheel"), ent(LONG, g, y - 2, N),
                ent(INS, g - 2, y, E), ent(INS, g + 2, y, W)]
        for ex in (e1, e2):
            out += [ent(AM, ex, y, recipe="engine-unit"), ent(INS, ex, y - 2, N), ent(INS, ex, y + 2, N)]
    out += run(-3, Y_OE, BUS_END, Y_OE, E)
    return out


def cp():
    """C2 (y=-21 서향: OA 가 x=37 에서 꺾여 머리, QS 가 (36,-22) 에서 옆치기) · CP 8 · OC (y=-15 서향) -> F (-18,-15) 동쪽 옆치기."""
    out = [ent(BELT, OA_X, Y_C2, W)] + run(QS_X, Y_C2, CP_XS[0] - 1, Y_C2, W)
    for cx in CP_XS:
        out += [ent(AM, cx, CP_Y, recipe="chemical-science-pack"), ent(LONG, cx - 1, CP_Y - 2, N),
                ent(INS, cx, CP_Y - 2, N), ent(INS, cx, CP_Y + 2, N)]
    out += run(CP_XS[-1] + 1, Y_OC, MV_X + 2, Y_OC, W) + ug(MV_X + 1, Y_OC, MV_X - 1, Y_OC, W)
    return out


PIECES = (("coal", coal), ("pump2", pump2), ("m_line", m_line), ("k_line", k_line), ("steel", steel), ("fluid", fluid),
          ("sulfur", sulfur), ("bus", bus), ("north", north), ("south", south), ("cp", cp))
POLED = {"coal": "c_poles", "pump2": "j_poles", "m_line": "t_poles", "k_line": "t_poles", "steel": "s_poles",
         "fluid": "n_poles", "sulfur": "n_poles", "north": "r_poles", "south": "r_poles", "cp": "r_poles"}
ORDER = ("clear", "c_poles", "coal", "j_poles", "pump2", "t_poles", "m_line", "k_line", "s_poles", "steel",
         "n_poles", "fluid", "sulfur", "bus", "r_poles", "north", "south", "cp")


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p28.py --snapshot 이 찍는다 (2026-09-26, tick 9.94M). 설계 칸 ±4 (전봇대는 ±12). 형식은 p26 과 같다 (Q = 유체 설비).
SNAP = """
    A:-23,-18,-21,-16 A:-23,-21,-21,-19 A:-30,-15,-28,-13 D:-37,-89,-35,-87 D:-37,-92,-35,-90 D:-43,-89,-41,-87
    D:-43,-92,-41,-90 D:-43,-95,-41,-93 D:-49,-101,-47,-99 D:-52,-101,-50,-99 F:-49,-98,-48,-97 P:-10,-40,-10,-40
    P:-10,-41,-10,-41 P:-10,-51,-10,-51 P:-10,-52,-10,-52 P:-10,-53,-10,-53 P:-10,-54,-10,-54 P:-10,-55,-10,-55
    P:-11,-40,-11,-40 P:-11,-55,-11,-55 P:-12,-40,-12,-40 P:-12,-48,-12,-48 P:-12,-55,-12,-55 P:-13,-11,-13,-11
    P:-13,-12,-13,-12 P:-13,-22,-13,-22 P:-13,-23,-13,-23 P:-13,-33,-13,-33 P:-13,-34,-13,-34 P:-13,-35,-13,-35
    P:-13,-36,-13,-36 P:-13,-37,-13,-37 P:-13,-38,-13,-38 P:-13,-39,-13,-39 P:-13,-40,-13,-40 P:-13,-48,-13,-48
    P:-13,-55,-13,-55 P:-14,-46,-14,-46 P:-14,-47,-14,-47 P:-14,-48,-14,-48 P:-14,-55,-14,-55 P:-15,-48,-15,-48
    P:-15,-54,-15,-54 P:-15,-55,-15,-55 P:-16,-46,-16,-46 P:-16,-48,-16,-48 P:-17,-46,-17,-46 P:-17,-48,-17,-48
    P:-17,-59,-17,-59 P:-18,-46,-18,-46 P:-18,-48,-18,-48 P:-18,-59,-18,-59 P:-19,-46,-19,-46 P:-20,-34,-20,-34
    P:-20,-35,-20,-35 P:-20,-36,-20,-36 P:-20,-37,-20,-37 P:-20,-46,-20,-46 P:-22,-52,-22,-52 P:-22,-53,-22,-53
    P:-22,-54,-22,-54 P:-22,-55,-22,-55 P:-22,-56,-22,-56 P:-22,-57,-22,-57 P:-23,-57,-23,-57 P:-24,-57,-24,-57
    P:-25,-57,-25,-57 P:-26,-57,-26,-57 P:-27,-57,-27,-57 P:-28,-57,-28,-57 P:-28,-59,-28,-59 P:-29,-57,-29,-57
    P:-29,-58,-29,-58 P:-29,-59,-29,-59 P:-30,-59,-30,-59 P:-31,-59,-31,-59 P:-32,-59,-32,-59 P:-33,-59,-33,-59
    P:-6,-59,-6,-59 P:-7,-59,-7,-59 P:-70,370,-70,370 P:-71,370,-71,370 P:-72,371,-72,371 P:38,-22,38,-22
    P:38,-23,38,-23 P:38,-33,38,-33 P:38,-34,38,-34 P:38,-44,38,-44 P:38,-45,38,-45 Q:-16,-45,-14,-43 Q:-16,-53,-12,-49
    Q:-74,368,-72,370 Q:-74,372,-72,374 R:-19,-3,-17,-3 R:-37,-13,-35,-11 R:-5,-44,-3,-42 R:-8,-45,-6,-43
    X:-14,-10,1,-2 b:-15,-3,-15,-3:8 b:-15,-4,-15,-4:8 b:-16,-4,-16,-4:4 b:-17,-4,-17,-4:4 b:-18,-10,-18,-10:8
    b:-18,-11,-18,-11:8 b:-18,-12,-18,-12:8 b:-18,-13,-18,-13:8 b:-18,-14,-18,-14:8 b:-18,-15,-18,-15:8
    b:-18,-16,-18,-16:8 b:-18,-17,-18,-17:8 b:-18,-18,-18,-18:8 b:-18,-19,-18,-19:8 b:-18,-20,-18,-20:8
    b:-18,-21,-18,-21:8 b:-18,-22,-18,-22:8 b:-18,-23,-18,-23:8 b:-18,-4,-18,-4:4 b:-18,-6,-18,-6:12 b:-18,-7,-18,-7:8
    b:-18,-8,-18,-8:8 b:-18,-9,-18,-9:8 b:-19,-17,-19,-17:8 b:-19,-18,-19,-18:8 b:-19,-19,-19,-19:8 b:-19,-20,-19,-20:8
    b:-19,-21,-19,-21:8 b:-19,-22,-19,-22:8 b:-19,-23,-19,-23:8 b:-19,-24,-19,-24:8 b:-19,-25,-19,-25:8
    b:-19,-26,-19,-26:8 b:-19,-27,-19,-27:8 b:-19,-28,-19,-28:8 b:-19,-29,-19,-29:8 b:-19,-30,-19,-30:8
    b:-19,-31,-19,-31:8 b:-19,-32,-19,-32:8 b:-19,-33,-19,-33:8 b:-19,-34,-19,-34:8 b:-19,-35,-19,-35:8
    b:-19,-36,-19,-36:8 b:-19,-37,-19,-37:8 b:-19,-38,-19,-38:8 b:-19,-39,-19,-39:8 b:-19,-4,-19,-4:4
    b:-19,-40,-19,-40:8 b:-19,-41,-19,-41:8 b:-19,-42,-19,-42:8 b:-19,-43,-19,-43:8 b:-19,-44,-19,-44:8
    b:-19,-45,-19,-45:8 b:-19,-6,-19,-6:12 b:-20,-4,-20,-4:4 b:-20,-6,-20,-6:12 b:-21,-4,-21,-4:4 b:-21,-6,-21,-6:12
    b:-22,-4,-22,-4:4 b:-22,-6,-22,-6:12 b:-23,-4,-23,-4:4 b:-23,-6,-23,-6:12 b:-24,-4,-24,-4:4 b:-24,-6,-24,-6:12
    b:-25,-10,-25,-10:0 b:-25,-11,-25,-11:0 b:-25,-4,-25,-4:4 b:-25,-6,-25,-6:12 b:-25,-9,-25,-9:0 b:-26,-10,-26,-10:4
    b:-26,-4,-26,-4:4 b:-26,-49,-26,-49:8 b:-26,-6,-26,-6:12 b:-26,-9,-26,-9:0 b:-27,-4,-27,-4:4 b:-27,-49,-27,-49:8
    b:-27,-50,-27,-50:8 b:-27,-51,-27,-51:8 b:-27,-52,-27,-52:8 b:-27,-53,-27,-53:8 b:-27,-6,-27,-6:12
    b:-27,-9,-27,-9:4 b:-28,-4,-28,-4:4 b:-28,-53,-28,-53:4 b:-28,-6,-28,-6:12 b:-28,-9,-28,-9:4 b:-29,-4,-29,-4:4
    b:-29,-53,-29,-53:4 b:-29,-6,-29,-6:12 b:-29,-9,-29,-9:4 b:-30,-4,-30,-4:4 b:-30,-53,-30,-53:4 b:-30,-6,-30,-6:12
    b:-30,-9,-30,-9:4 b:-31,-4,-31,-4:4 b:-31,-53,-31,-53:4 b:-31,-6,-31,-6:12 b:-31,-9,-31,-9:4 b:-32,-4,-32,-4:4
    b:-32,-49,-32,-49:8 b:-32,-5,-32,-5:8 b:-32,-50,-32,-50:8 b:-32,-51,-32,-51:8 b:-32,-53,-32,-53:4
    b:-32,-6,-32,-6:12 b:-32,-9,-32,-9:4 b:-33,-49,-33,-49:8 b:-33,-51,-33,-51:4 b:-33,-53,-33,-53:4
    b:-34,-10,-34,-10:8 b:-34,-11,-34,-11:8 b:-34,-12,-34,-12:8 b:-34,-13,-34,-13:8 b:-34,-3,-34,-3:8 b:-34,-4,-34,-4:8
    b:-34,-5,-34,-5:8 b:-34,-6,-34,-6:8 b:-34,-7,-34,-7:8 b:-34,-8,-34,-8:8 b:-34,-88,-34,-88:8 b:-34,-89,-34,-89:8
    b:-34,-9,-34,-9:8 b:-34,-90,-34,-90:8 b:-34,-91,-34,-91:8 b:-36,-6,-36,-6:12 b:-36,-9,-36,-9:4 b:-37,-6,-37,-6:12
    b:-37,-9,-37,-9:4 b:-38,-6,-38,-6:12 b:-38,-9,-38,-9:4 b:-44,-92,-44,-92:0 b:-44,-93,-44,-93:0 b:-44,-94,-44,-94:0
    b:-44,-95,-44,-95:12 b:-45,-95,-45,-95:12 b:-46,-95,-46,-95:12 b:-47,-95,-47,-95:12 b:-48,-95,-48,-95:12
    b:-49,-95,-49,-95:12 b:-50,-95,-50,-95:12 f:-33,-5,-33,-5:12 i:-20,-18,-20,-18:4 i:-20,-21,-20,-21:4
    i:-20,-24,-20,-24:4 i:-20,-31,-20,-31:12 i:-20,-39,-20,-39:12 i:-48,-96,-48,-96:8 i:-49,-96,-49,-96:0
    l:-17,-44,-17,-44:4 l:-20,-16,-20,-16:12 l:-20,-19,-20,-19:12 l:-20,-22,-20,-22:12 p:-12,2,-12,2:2
    p:-16,-2,-16,-2:2 p:-17,-43,-17,-43:2 p:-17,-50,-17,-50:2 p:-19,-16,-19,-16:2 p:-20,-20,-20,-20:2
    p:-20,-32,-20,-32:2 p:-20,-40,-20,-40:2 p:-22,-2,-22,-2:2 p:-22,-25,-22,-25:2 p:-22,-45,-22,-45:2
    p:-23,-29,-23,-29:2 p:-23,-37,-23,-37:2 p:-24,-18,-24,-18:2 p:-27,-15,-27,-15:2 p:-27,-19,-27,-19:2
    p:-27,-25,-27,-25:2 p:-28,-28,-28,-28:2 p:-28,-43,-28,-43:2 p:-29,-2,-29,-2:2 p:-31,-14,-31,-14:2
    p:-31,-47,-31,-47:2 p:-33,-4,-33,-4:2 p:-33,-43,-33,-43:2 p:-33,-83,-33,-83:2 p:-33,-89,-33,-89:2 p:-35,-2,-35,-2:2
    p:-35,-62,-35,-62:2 p:-35,-66,-35,-66:2 p:-35,-68,-35,-68:2 p:-37,5,-37,5:2 p:-38,-44,-38,-44:2 p:-38,-62,-38,-62:2
    p:-38,-68,-38,-68:2 p:-40,-88,-40,-88:2 p:-40,-94,-40,-94:2 p:-41,-2,-41,-2:2 p:-45,-20,-45,-20:2
    p:-46,-84,-46,-84:2 p:-50,-97,-50,-97:2 p:-52,-88,-52,-88:2 p:-56,-97,-56,-97:2 p:-58,-90,-58,-90:2
    p:-61,367,-61,367:2 p:-64,362,-64,362:2 p:-70,371,-70,371:2 p:-77,372,-77,372:2 s:-34,-54,-33,-54:8
    u:-33,-6,-33,-6:12:i u:-33,-9,-33,-9:4:o u:-35,-6,-35,-6:12:o u:-35,-9,-35,-9:4:i
"""
DEBRIS = [
    ('big-rock', -35.563, -11.813, -37, -13, -35, -11),
    ('big-rock', -3.313, -42.438, -5, -44, -3, -42),
    ('crash-site-spaceship', -5.0, -6.0, -14, -10, 1, -2),
    ('crash-site-spaceship-wreck-small-5', -17.313, -2.34, -19, -3, -17, -3),
    ('huge-rock', -6.5, -43.75, -8, -45, -6, -43),
]
TREES = [
    ('tree-07', -20.688, -55.875),
    ('tree-07', -25.125, -55.25),
    ('tree-07', -27.438, -54.438),
]
# 기존 관에 일부러 붙이는 칸: 새 관 칸 -> {닿는 기존 칸: 유체}
FLUID_JOIN = {(-9, -54): {(-10, -54): "crude-oil"}, (-11, -48): {(-12, -48): "petroleum-gas"},
              (-71, 371): {(-72, 371): "crude-oil", (-71, 370): "crude-oil"}}
SINKS = {(-17, -15): {"chemical-science-pack"}, (-34, -92): {"coal"}}        # F (p26 화학팩 레인) · 보일러 줄
OK_FLOWS = {((-17, -15), F_JOIN), ((-34, -92), (-34, -91))}
TAPS = {(-34, -8): "iron-plate", (-31, -9): "copper-plate", (-29, -53): "coal", (-14, -44): "sulfur"}

_SNAP = None


def snap():
    global _SNAP
    if _SNAP is not None:
        return _SNAP
    out = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}}
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


def reserved() -> dict:
    """p25 · p26 · p27 stages() 의 build 전부: 칸 -> 이름 (가운데 좌표 + 크기에서 타일을 되살린다)."""
    import p25
    import p26
    import p27
    out = {}
    for tag, mod in (("p25", p25), ("p26", p26), ("p27", p27)):
        for name, steps in mod.stages().items():
            for k, p in steps:
                if k != "build":
                    continue
                w, h = dims({"name": p["name"], "d": p.get("direction", N)})
                x0, y0 = math.floor(p["x"] - w / 2 + 0.01), math.floor(p["y"] - h / 2 + 0.01)
                for x in range(x0, x0 + w):
                    for y in range(y0, y0 + h):
                        out[(x, y)] = f"{tag} {name} {p['name']}"
    return out


_RES = None


def _reserved():
    global _RES
    if _RES is None:
        _RES = reserved()
    return _RES


def place_poles(group, occ, net, reach=7.5):
    """소형 전봇대 욕심 배치 (p27 과 같은 규칙): 덮개 ±2 타일, 전선 7.5, 망에서 먼 무리는 다리 전봇대."""
    need = [e for e in group if e["name"] in POWERED]
    if not need:
        return []
    sn = snap()
    arm_spots = {t for e in occ.values() if e["name"] in ARMS for t in arm_ends(e)}
    blocked_ = set(sn["tiles"]) | set(occ) | set(debris_tiles()) | arm_spots | set(_reserved())
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
        if pool:
            best = max(pool, key=lambda c: (len(covers[c] & todo),
                                            -min(math.dist(c, (need[i]["x"], need[i]["y"])) for i in todo), c))
            if covers[best] & todo:
                chosen.append(best)
                todo -= covers[best]
                reach_set |= {c for c in cand if math.dist(c, best) <= reach}
                continue
        tgt = min(((need[i]["x"], need[i]["y"]) for i in todo), key=lambda q: min(math.dist(q, p) for p in net + chosen))
        src = min(net + chosen, key=lambda p: math.dist(p, tgt))
        k = max(1, math.ceil(math.dist(src, tgt) / 7))
        c0 = (round(src[0] + (tgt[0] - src[0]) / k), round(src[1] + (tgt[1] - src[1]) / k))
        ring = sorted(((c0[0] + dx, c0[1] + dy) for dx in range(-2, 3) for dy in range(-2, 3)), key=lambda c: math.dist(c, c0))
        c = next((c for c in ring if c not in blocked_ and c not in chosen and math.dist(c, src) <= reach
                  and math.dist(c, tgt) < math.dist(src, tgt)), None)
        if c is None:
            raise RuntimeError(f"전봇대 자리가 없다 ({len(todo)} 남음, {tgt})")
        chosen.append(c)
        covers.setdefault(c, set().union(*[where.get((c[0] + dx, c[1] + dy), set())
                                           for dx in range(-2, 3) for dy in range(-2, 3)]))
        todo -= covers[c]
        reach_set |= {q for q in cand if math.dist(q, c) <= reach}
    return chosen


def layout() -> dict:
    """단계 순서대로 {이름: 엔티티}. 전봇대는 지역마다 앞 단계 + 기존 망에서 이어 욕심 배치 (구리·나무만)."""
    st = {k: f() for k, f in PIECES}
    occ, _ = occupancy([e for v in st.values() for e in v])
    net = list(snap()["poles"])
    groups = {}
    for k, _f in PIECES:
        if k in POLED:
            groups.setdefault(POLED[k], []).extend(st[k])
    order = {}
    for pname in ("c_poles", "j_poles", "t_poles", "s_poles", "n_poles", "r_poles"):
        ps = place_poles(groups.get(pname, []), occ, net)
        net += ps
        for x, y in ps:
            occ[(x, y)] = ent(POLE, x, y)
        order[pname] = [ent(POLE, x, y) for x, y in ps]
    order.update(st)
    return {k: order[k] for k in ORDER if order.get(k)}


# ------------------------------------------------------------------ 레인 추적 (p25/p26 규칙)

def left_of(d):
    return {N: W, E: N, S: E, W: S}[d]


def lane_of(belt_d, side):
    if side == VEC[left_of(belt_d)]:
        return "L"
    if side == tuple(-v for v in VEC[left_of(belt_d)]):
        return "R"
    return None


def made(e):
    if e is None or e["name"] not in MACH:
        return None
    return RECIPE[e["recipe"]][1]


def want_of(m):
    return set(RECIPE[m["recipe"]][0])


def belt_map(ents):
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
    for _ in range(600):
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
    q = (k[0] + vx, k[1] + vy)
    return [q] if q in belt else []


def dead_ends(ents, occ, lanes) -> list:
    """소비자 없는 생산은 없다: 레인에 처음 실린 품목마다 하류 어딘가에 집어 쓰는 팔 (또는 SINKS) 이 있어야 한다."""
    belt = belt_map(ents)
    takes = {k: set(v) for k, v in SINKS.items()}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        dst = occ.get(dk)
        if sk in belt and dst is not None and dst["name"] in MACH:
            takes.setdefault(sk, set()).update(want_of(dst))

    def down(k):
        got, stack, vis = set(), [k], set()
        while stack:
            q = stack.pop()
            if q in vis:
                continue
            vis.add(q)
            got |= takes.get(q, set())
            stack += nxt_belt(belt, q)
        return got

    up = {}
    for k in belt:
        for q in nxt_belt(belt, k):
            up.setdefault(q, []).append(k)
    bad, told = [], set()
    for k in belt:
        items = lanes[k]["L"] | lanes[k]["R"]
        came = set().union(*[lanes[q]["L"] | lanes[q]["R"] for q in up.get(k, [])]) if up.get(k) else set()
        for it in (items - came) - down(k):
            if it not in told:
                told.add(it)
                bad.append(f"소비자 없음: {it} 이 {k} 에서 하류 끝까지 가도 집어 쓰는 팔이 없다")
    return bad


# ------------------------------------------------------------------ 유체 (p26 과 같은 프로토타입 표)
FB = {
    JACK: [((1, -1), N, "out", 1)],
    REF: [((-1, 2), S, "in", 1), ((1, 2), S, "in", 2), ((-2, -2), N, "out", 3), ((0, -2), N, "out", 4), ((2, -2), N, "out", 5)],
    CHEM: [((-1, -1), N, "in", 1), ((1, -1), N, "in", 2), ((-1, 1), S, "out", 3), ((1, 1), S, "out", 4)],
}
EXTENT = 320


def rot(v, d):
    x, y = v
    return {N: (x, y), E: (-y, x), S: (-x, -y), W: (y, -x)}[d]


def conns(e):
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
    """새 관끼리 이음 · 기존 관은 FLUID_JOIN 칸에서만 · 섞임 · 정유 원유 상자 2 · 화학 공장 가스."""
    fl = [e for e in ents if e["name"] in FLUIDS]
    at = {}
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

    bad, joins = [], []
    sn = snap()
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
                        if fl[hit[0]]["d"] == cd:
                            union(node, (hit[0], 1))
                        break
                else:
                    bad.append(f"지하관 {t} 에 10칸 안 짝이 없다")
                continue
            other = at.get((nb, (cd + 8) % 16))
            if other is not None:
                union(node, (other[0], other[1]))
            elif e["name"] in (PIPE, UGP) and sn["tiles"].get(nb) in ("P", "E"):
                if nb in FLUID_JOIN.get(t, {}):
                    joins.append((node, FLUID_JOIN[t][nb]))
                else:
                    bad.append(f"관 {t} 이 기존 {sn['tiles'][nb]} {nb} 에 닿는다 (FLUID_JOIN 에 없다)")
    for t, nbs in FLUID_JOIN.items():
        if not any(e["name"] == PIPE and (e["x"], e["y"]) == t for e in fl):
            bad.append(f"FLUID_JOIN {t}: 새 관이 없다")
        for nb in nbs:
            if sn["tiles"].get(nb) != "P":
                bad.append(f"FLUID_JOIN {t} -> {nb}: 스냅숏에 기존 관이 없다 ({sn['tiles'].get(nb)})")
    fluid = {}

    def add(node, what):
        fluid.setdefault(find(node), set()).add(what)

    for node, what in joins:
        add(node, what)
    for i, e in enumerate(fl):
        if e["name"] == JACK:
            add((i, 1), "crude-oil")
        if e["name"] == REF:
            for b in (3, 4, 5):
                add((i, b), "petroleum-gas")
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
            pipes = {find((j, 1)) for j, f in enumerate(fl) if f["name"] in (PIPE, UGP)}
            if not any(find((i, b)) in pipes for b in (3, 4, 5)):
                bad.append("정유 가스 출구가 어느 관에도 안 이어졌다")
        if e["name"] == CHEM:
            need = FLUID_IN[e["recipe"]]
            got = fl_at(i, 1) | fl_at(i, 2)
            if not need <= got:
                bad.append(f"{e['recipe']} ({e['x']},{e['y']}): 유체 모자람 {sorted(need - got)}")
            for b in (3, 4):
                if fl_at(i, b):
                    bad.append(f"{e['recipe']} ({e['x']},{e['y']}): 출구 {b} 에 관 {sorted(fl_at(i, b))}")
    return bad


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
    res = _reserved()
    bad += [f"예약 칸과 겹침 {t}: {occ[t]['name']} / {res[t]}" for t in occ if t in res]
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        if dk in res:
            bad.append(f"팔 {a['x'], a['y']} 이 예약 칸 {dk} ({res[dk]}) 에 놓는다")
        if sk in res and sk not in TAPS:
            bad.append(f"팔 {a['x'], a['y']} 이 예약 칸 {sk} ({res[sk]}) 에서 집는다 (TAPS 에 없다)")
    lanes, probs = trace(st)
    bad += probs
    belt = belt_map(ents)
    got = {}
    for e in ents:
        if e["name"] == EMD:
            vx, vy = VEC[e["d"]]
            if (e["x"] + 2 * vx, e["y"] + 2 * vy) not in belt:
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
            if sn["tiles"].get(sk) is None:
                bad.append(f"팔 {at}: 탭 {sk} 에 스냅숏상 기존 것이 없다 ({sn['tiles'].get(sk)})")
        else:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 {sn['tiles'].get(sk, '아무것도 없음')}")
            continue
        if not have:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 아무것도 안 온다")
        dst = occ.get(dk)
        if dst is None:
            bad.append(f"팔 {at}: 놓는 칸 {dk} 에 {sn['tiles'].get(dk, '아무것도 없음')}")
            continue
        if dst["name"] in (AM, AM2, CHEM):
            use = want_of(dst) & have
            if not use:
                bad.append(f"팔 {at}: {dst.get('recipe', dst['name'])} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(use)
        elif dst["name"] in (FURN, SFURN):
            want = want_of(dst)
            dirty = (have & SMELTABLE) - want
            if dirty:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 녹일 수 있는 딴 것 {sorted(dirty)}")
            if not have & want:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(have & want)
        elif dst["name"] not in BELTS:
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for m in (e for e in ents if e["name"] in MACH):
        lack = want_of(m) - got.get(id(m), set())
        if lack:
            bad.append(f"{m.get('recipe', m['name'])} ({m['x']},{m['y']}): 모자람 {sorted(lack)}")
    bad += dead_ends(ents, occ, lanes)
    for k, e in belt.items():                      # 기존 줄과 엉킴
        if e["name"] == UG and e.get("kind") == "input":
            continue
        vx, vy = VEC[e["d"]]
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ not in belt and nx_ in sn["belts"] and (k, nx_) not in OK_FLOWS:
            bad.append(f"벨트 {k} 가 기존 벨트 {nx_} 로 흘러든다")
        if nx_ not in belt and (k, nx_) in OK_FLOWS and nx_ not in sn["belts"]:
            bad.append(f"벨트 {k} -> {nx_}: 합류할 기존 벨트가 스냅숏에 없다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ in belt:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {nx_} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    ps = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + list(sn["poles"])
    for e in ents:
        if e["name"] in POWERED and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    for p, ns in pole_nets(st).items():
        if not ns:
            bad.append(f"전봇대 {p}: 기존 망에 안 닿는다 (7.5)")
    bad += walkways(st)
    bad += fluid_check(ents)
    return bad


def walkways(st) -> list:
    """큰 설비 (정유 5x5 · 화학 공장 · 펌프잭) 둘레에 걸어 닿는 빈칸이 적어도 한 변 전체로 있어야 한다 (엔진 자리 교훈)."""
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    full = set(occ) | {t for t, k in sn["tiles"].items() if k not in ("R", "X")} | set(_reserved())
    bad = []
    for e in ents:
        if e["name"] not in (REF, CHEM, JACK):
            continue
        ts = tiles(e)
        xs, ys = [t[0] for t in ts], [t[1] for t in ts]
        sides = {"W": [(min(xs) - 1, y) for y in set(ys)], "E": [(max(xs) + 1, y) for y in set(ys)],
                 "N": [(x, min(ys) - 1) for x in set(xs)], "S": [(x, max(ys) + 1) for x in set(xs)]}
        free = [k for k, v in sides.items() if not any(t in full for t in v)]
        if not free:
            bad.append(f"통로 없음: {e['name']} {e['x'], e['y']} 네 변 모두 막힘")
    return bad


# ------------------------------------------------------------------ 단계 (게임 step)

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
    """설계 칸 전체 + 팔이 집는/놓는 칸의 바위·잔해·나무를 하나씩 캔다 (정유 5x5 도 칸 전체, 벌목 한 번은 한 그루만)."""
    ents = [e for v in st.values() for e in v]
    spots = {t for e in ents for t in tiles(e)} | {t for e in ents if e["name"] in ARMS for t in arm_ends(e)}
    out, seen = [], set()
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        if (name, x, y) not in seen and any((tx, ty) in spots for tx in range(x1, x2 + 1) for ty in range(y1, y2 + 1)):
            seen.add((name, x, y))
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 1.0}))
    for name, x, y in TREES:
        if (math.floor(x), math.floor(y)) in spots:
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 0.5}))
    return out


def stages():
    st = layout()
    out = {"clear": clear_steps(st)}
    rank = {POLE: 0, EMD: 0, JACK: 0, REF: 0, CHEM: 0, SFURN: 1, AM2: 1, AM: 1, PIPE: 2, UGP: 2,
            INS: 3, LONG: 3, FAST: 3, UG: 4, BELT: 5}
    for k, v in st.items():
        # 설비가 먼저, 벨트는 뒤 - 순번이 잘려도 비싼 것 (강철) 이 먼저 선다
        out[k] = steps_of(sorted(v, key=lambda e: rank.get(e["name"], 6)))
    return {k: out[k] for k in ORDER if out.get(k)}


def counts(st):
    n = {}
    for v in st.values():
        for e in v:
            key = e["name"] if e["name"] not in (MACH | {EMD}) else f"{e['name']}:{e.get('recipe', e.get('ore'))}"
            n[key] = n.get(key, 0) + 1
    return n


def plates(ents):
    t = {}
    for e in ents:
        for m, k in COST.get(e["name"], {}).items():
            t[m] = t.get(m, 0) + k
    return t


def power_kw(n):
    return sum(KW.get(k.split(":")[0], 0) * v for k, v in n.items())


def draw(st, box):
    """설계 + 스냅숏 글자 그림 (확인용)."""
    x1, y1, x2, y2 = box
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    sn = snap()
    ch = {BELT: None, UG: "u", INS: "i", FAST: "f", LONG: "l", POLE: "+", AM: "A", AM2: "B", SFURN: "S", EMD: "D",
          PIPE: "p", UGP: "q", REF: "R", CHEM: "H", JACK: "J"}
    arrow = {N: "^", E: ">", S: "v", W: "<"}
    for y in range(y1, y2 + 1):
        row = ""
        for x in range(x1, x2 + 1):
            e = occ.get((x, y))
            if e is not None:
                c = ch.get(e["name"], "?")
                row += arrow[e["d"]] if c is None else c
            elif (x, y) in sn["tiles"]:
                row += sn["tiles"][(x, y)].lower() if sn["tiles"][(x, y)] not in ("R", "X") else "#"
            else:
                row += "."
        print(f"{y:5d} {row}")


# ------------------------------------------------------------------ 게임 (읽기만)

CODE = {"transport-belt": "b", "underground-belt": "u", "splitter": "s", "inserter": "i", "fast-inserter": "f",
        "long-handed-inserter": "l", "small-electric-pole": "p", "medium-electric-pole": "p", "stone-furnace": "F",
        "steel-furnace": "F", "assembling-machine-1": "A", "assembling-machine-2": "A", "lab": "L",
        "electric-mining-drill": "D", "burner-mining-drill": "D", "gun-turret": "G", "iron-chest": "C",
        "wooden-chest": "C", "steam-engine": "E", "boiler": "E", "pipe": "P", "pipe-to-ground": "P",
        "offshore-pump": "E", "pump": "P", "storage-tank": "Q", "pumpjack": "Q", "oil-refinery": "Q",
        "chemical-plant": "Q"}          # Q = 유체 설비 (정해진 입출구에서만 잇는다 - 옆에 관이 닿아도 안 섞인다)

SNAP_LUA = """(function()
  local s, out = game.surfaces[1], {}
  for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}}) do
    if e.type ~= "resource" and e.type ~= "character" and e.type ~= "item-entity"
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
    """설계 칸 ±4 (전봇대는 ±12) 의 기존 엔티티를 SNAP · DEBRIS, 설계·팔 칸의 나무를 TREES 형식으로 찍는다. 조각별로 묻는다."""
    global _SNAP
    _SNAP = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}}
    st = {k: f() for k, f in PIECES}
    allts = set()
    rows = []
    for v in st.values():
        ts = {t for e in v for t in tiles(e)} | {t for e in v if e["name"] in ARMS for t in arm_ends(e)}
        allts |= ts
        xs, ys = [t[0] for t in ts], [t[1] for t in ts]
        y = min(ys) - 13
        while y <= max(ys) + 13:
            reply = ai.lua(SNAP_LUA % (min(xs) - 13, y, max(xs) + 14, min(y + 40, max(ys) + 14)))
            rows += [str(r) for r in p1._rows(reply)]
            y += 40
    near = {(x + dx, y + dy) for x, y in allts for dx in range(-4, 5) for dy in range(-4, 5)}
    far = {(x + dx, y + dy) for x, y in allts for dx in range(-12, 13, 2) for dy in range(-12, 13, 2)}
    seen, toks, debris, trees = set(), [], [], []
    for r in rows:
        name, typ, x, y, lx, ly, rx, ry, d, kind, net = r.split("|")
        if (name, x, y) in seen:
            continue
        seen.add((name, x, y))
        if typ == "tree":
            if (math.floor(float(x)), math.floor(float(y))) in allts:
                trees.append((name, float(x), float(y)))
            continue
        tx1, ty1 = math.floor(float(lx) + 0.01), math.floor(float(ly) + 0.01)
        tx2, ty2 = math.ceil(float(rx) - 0.01) - 1, math.ceil(float(ry) - 0.01) - 1
        cells = {(a, b) for a in range(tx1, tx2 + 1) for b in range(ty1, ty2 + 1)}
        if not cells & (far if typ == "electric-pole" else near):
            continue
        if typ in ("simple-entity", "simple-entity-with-owner") or name.startswith("crash-site"):
            debris.append((name, float(x), float(y), tx1, ty1, tx2, ty2))
            toks.append(f"{'R' if typ.startswith('simple') else 'X'}:{tx1},{ty1},{tx2},{ty2}")
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
    print("TREES = [")
    for tr in sorted(set(trees), key=lambda t: (t[2], t[1])):
        print(f"    ({tr[0]!r}, {tr[1]}, {tr[2]}),")
    print("]")


ORE_LUA = """(function() local s, out = game.surfaces[1], {}
  for bit in string.gmatch("%s", "[^;]+") do
    local x, y = string.match(bit, "([^,]+),([^,]+)")
    x, y = tonumber(x), tonumber(y)
    local names, amt = {}, 0
    for _, r in pairs(s.find_entities_filtered{type = "resource", area = {{x - 2.4, y - 2.4}, {x + 2.4, y + 2.4}}}) do   -- 채굴 범위 5x5 (가장자리 이웃 칸이 안 끼게)
      names[r.name] = (names[r.name] or 0) + 1 amt = amt + r.amount end
    local t = {} for n, c in pairs(names) do t[#t+1] = n .. ":" .. c end
    out[#out+1] = bit .. "|" .. table.concat(t, "/") .. "|" .. amt
  end
  local w = s.find_entities_filtered{name = "crude-oil", position = {%f, %f}, radius = 0.6}[1]
  out[#out+1] = "well|" .. (w and (w.amount .. " = " .. string.format("%%.0f%%%%", w.amount / 3000)) or "none") .. "|0"
  return out end)()"""

POWER_LUA = """(function()
  local s, f, out, gen = game.surfaces[1], game.forces.player, {}, 0
  for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
    local ok, v = pcall(function() return g.energy_generated_last_tick end)
    if ok and v then gen = gen + v end
  end
  out[#out+1] = string.format("엔진 출력 (지난 틱) %.0f kW / 상한 %d kW", gen * 60 / 1000, 900 * #s.find_entities_filtered{type = "generator", force = f})
  return out end)()"""


def ore_purity(ai, st):
    ds = [e for v in st.values() for e in v if e["name"] == EMD]
    jx, jy = pos(ent(JACK, *JACK2_C, N))
    reply = ai.lua(ORE_LUA % (";".join(f"{pos(e)[0]},{pos(e)[1]}" for e in ds), jx, jy))
    rows = p1._rows(reply)
    for e, r in zip(ds, rows):
        _p, kinds, amt = str(r).split("|")
        names = {k.split(":")[0] for k in kinds.split("/") if k}
        print(f"   {e['ore']:8s} ({e['x']},{e['y']}) {kinds} 합 {int(float(amt)):,}{'' if names == {e['ore']} else '  <- 섞임/없음'}")
    print("   펌프잭2 우물", str(rows[-1]).split("|")[1])


def set_recipes(ai, who):
    for e in (e for v in layout().values() for e in v if e["name"] in (AM, AM2, CHEM, REF)):
        x, y = pos(e)
        r = ai.set_recipe(who, x, y, e["recipe"])
        if isinstance(r, dict) and r.get("error"):
            print(f"  레시피 {e['recipe']} ({x},{y}): {r['error']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    for f in ("check", "snapshot", "recipes", "ores", "power", "draw"):
        ap.add_argument("--" + f, action="store_true")
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    if args.snapshot:
        from client import AIBridge
        snapshot(AIBridge())
        return 0
    st = layout()
    sts = stages()
    if args.draw:
        draw(st, (-36, -58, 38, -13))
        return 0
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 · p25/p26/p27 예약 칸 0 · 팔 집는/놓는 칸 · 레인 한 품목 · 하류 소비자 · "
                                         "기존 줄과 안 엉킴 · 전력 덮개 · 전선 7.5 · 유체 (이음·섞임·정유 상자) · 큰 설비 통로 모두 통과")
        n = counts(st)
        print("  수량:", n)
        nets = sorted(set().union(*pole_nets(st).values()))
        print(f"  새 전봇대 {sum(1 for v in st.values() for e in v if e['name'] == POLE)} · 이어지는 기존 망 {nets}")
        print(f"  최대 전력 {power_kw(n) / 1000:.2f} MW (새것만, 팔이 다 움직일 때)")
        tot, tst = 0.0, 0.0
        for k, v in sts.items():
            c = plates(st.get(k, []))
            tot += c.get("iron-plate", 0)
            tst += c.get("steel-plate", 0)
            print(f"  {k:8s} {len(v):3d}  철 {c.get('iron-plate', 0):6.1f}  강철 {c.get('steel-plate', 0):4.0f}  구리 {c.get('copper-plate', 0):5.1f}"
                  f"  벽돌 {c.get('stone-brick', 0):3.0f}  (누계 철 {tot:.0f} · 강철 {tst:.0f})")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update(COST)
    p1.PAIRED.update({UG, UGP})
    p1.PARK = PARK
    ai = AIBridge()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        if nb:
            bad = p1.blocked(ai, steps)
            print(f"  {name:8s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
        else:
            spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
            print(f"  {name:8s} 치움 {len(p1.vanished(ai, steps) & spots)}/{len(spots)}")
    if args.ores:
        ore_purity(ai, st)
    if args.power:
        for r in p1._rows(ai.lua(POWER_LUA)):
            print("  ", r)
    if args.recipes:
        set_recipes(ai, (args.who or "golf").split(",")[0])
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    import p25
    os.environ[detached.ENV] = "p28"
    detached.mark(crew, "p28", minutes=180)
    try:
        p25.prep(ai, crew, sts[args.stage])          # 허브에 돌·나무 0 - 전봇대 나무를 먼저
        ok = p1.build_stage(ai, crew, sts[args.stage], args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

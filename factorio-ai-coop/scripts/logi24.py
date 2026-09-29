"""Run 24: replace the Lua relay (relay24.py) with real logistics - belts, inserters, robots, hands.

사용자 결정 (2026-09-30): **Lua 중계 (아이템 순간이동) 금지.** 그리고 **놓을 수 없는 자리에 짓기 금지** -
짓기는 캐릭터 build 또는 유령 (로봇) 으로만, Lua 로 유령을 놓을 때도 `can_place_entity{build_check_type = manual}` 을 통과해야 한다.
여기 Lua 는 조회와 «건설 조작» (유령 놓기 · 철거 표시 · 레시피 · 필터) 뿐이다. 아이템을 remove → insert 하지 않는다.

단계 (STAGES) 는 유령 목록이다. 재료는 사람이 허브 판으로 손제작해 R_H 저장 상자에 넣고 (`--kit`), 건설 로봇이 짓는다.

    python scripts/logi24.py --run run24 --check ironout         # 선 것 / 유령 / 놓을 수 있나 / 막는 것
    python scripts/logi24.py --run run24 --decon ironout         # 이 단계가 먼저 치울 것 (철거 표시 - 로봇)
    python scripts/logi24.py --run run24 --ghost ironout         # 유령 놓기 (manual 검사 통과한 것만)
    python scripts/logi24.py --run run24 --kit ironout --who alpha   # 모자란 재료를 손제작해 저장 상자에
    python scripts/logi24.py --run run24 --status                # 허브 · 벨트 · 팔 상태
"""
import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                              # noqa: E402,F401  (--run 을 먼저 뽑는다)
from client import AIBridge                 # noqa: E402

N, E, S, W = 0, 4, 8, 12
BELT, FBELT, UG, INS, FINS, LINS, POLE = ("transport-belt", "fast-transport-belt", "underground-belt", "inserter",
                                          "fast-inserter", "long-handed-inserter", "small-electric-pole")
STORE = (59.5, -14.5)          # R_H (56,-15) 옆 저장 상자 - 허브 옆
PARK = (66.5, -20.5)


def g(name, x, y, d=N, **kw):
    """유령 하나. 팔 direction = 집는 쪽 (게임 실측: dir W → pickup x-1). 벨트 direction = 흐르는 쪽."""
    return dict(name=name, x=x, y=y, d=d, **kw)


def line(name, x0, y0, x1, y1, d):
    """(x0,y0) 부터 (x1,y1) 까지 (양끝 포함) 한 줄."""
    n = int(round(max(abs(x1 - x0), abs(y1 - y0))))
    sx = 0 if x1 == x0 else (1 if x1 > x0 else -1)
    sy = 0 if y1 == y0 else (1 if y1 > y0 else -1)
    return [g(name, x0 + sx * i, y0 + sy * i, d) for i in range(n + 1)]


# ---------------------------------------------------------------------------------------------------------------
# ironout: 철 전기 쌍 (채굴기 → 화로) 의 화로 결과를 팔 → 벨트 → 줄기 (x 69.5, 빠른 벨트) → 허브 상자.
#   relay 의 PLATES (화로 결과칸 → 허브) 철 두 줄을 대신한다.
#   줄 A 화로 (75..93, -66) · B (73..97, -54) · D (82..100, -43). 줄 C (82..94, -48) 는 결과를 뺄 칸이 없다
#   (위 B 화로 · 아래 D 채굴기 사이) → C 채굴기 5 · 화로 5 를 걷어 B 의 벨트 자리를 낸다 (철 -2.5/s, 나중에 다시 놓는다).
#   화로 결과 팔은 북쪽 (화로) 에서 집어 남쪽 벨트에 → 먼 레인 (남쪽). 모든 줄이 줄기의 동쪽 레인으로 모인다 (11/s > 노란 레인 7.5 → 줄기는 빠른 벨트).
IRON_A = [75, 78, 81, 84, 87, 93]
IRON_B = [73, 76, 79, 82, 85, 88, 91, 94, 97]
IRON_D = [82, 85, 88, 91, 94, 97, 100]
IRON_C_DRILLS = [81.5, 84.5, 87.5, 90.5, 93.5]
IRON_C_FURN = [82, 85, 88, 91, 94]
TRUNK_X = 69.5
HUB_IN = [67.5, 68.5, 69.5, 70.5]          # 허브 철 상자 (y -15.5) 위 빠른 팔 - 71.5..73.5 는 다른 품목 자리로 남긴다


def ironout():
    out = []
    out += [g(INS, c - 0.5, -64.5, N) for c in IRON_A]
    out += line(BELT, 93.5, -63.5, 70.5, -63.5, W)
    out += [g(INS, c - 0.5, -52.5, N) for c in IRON_B]
    out += line(BELT, 96.5, -51.5, 70.5, -51.5, W)
    out += [g(INS, c - 0.5, -41.5, N) for c in IRON_D]
    out += line(BELT, 99.5, -40.5, 70.5, -40.5, W)
    out += [g(POLE, x, -41.5) for x in (83.5, 89.5, 95.5, 101.5)]
    # 줄기: A 가 (69.5,-63.5) 에서 꺾여 들어오고 B · D 는 옆에서 싣는다 (동쪽 레인)
    out += line(FBELT, TRUNK_X, -63.5, TRUNK_X, -20.5, S)
    out += line(FBELT, TRUNK_X, -19.5, 73.5, -19.5, E)
    out += line(FBELT, 74.5, -19.5, 74.5, -18.5, S)
    out += line(FBELT, 74.5, -17.5, 66.5, -17.5, W)
    out += [g(FINS, x, -16.5, N) for x in HUB_IN]
    out += [g(POLE, 66.5, -16.5), g(POLE, 71.5, -16.5)]
    out += [g(POLE, 62.5, -15.5), g(POLE, 58.5, -16.5)]      # 허브 팔 전봇대를 망 1 (53.5,-15.5) 에 잇는다 (처음엔 섬 net24 였다)
    return out


def ironout_clear():
    return [("electric-mining-drill", x, -50.5) for x in IRON_C_DRILLS] + [("steel-furnace", x, -48) for x in IRON_C_FURN]


# ---------------------------------------------------------------------------------------------------------------
# copperout: 구리 전기 쌍 13 (윗줄 6: 채굴기 y 79.5 → 화로 y 82 · 아랫줄 7: 채굴기 84.5 → 화로 87) → 벨트 → 줄기 (x 63.5 북쪽) → 허브.
#   윗줄 화로 결과는 아랫줄 채굴기에 막혀 뺄 칸이 없다 → 윗줄 채굴기를 북향으로 돌리고 화로를 (c, 77) 로 옮긴다 (철거 → 유령, 같은 돌 화로).
#   윗줄 팔 (c+0.5, 75.5) 남쪽 화로에서 집어 벨트 y 74.5 → 줄기 동쪽 레인 (옆 싣기). 아랫줄 팔 (c-0.5, 88.5) → 벨트 y 89.5 → 줄기로 꺾여 서쪽 레인.
#   허브: 줄기가 y -13.5 에서 동쪽으로 → 허브 상자 71.5..73.5 남쪽 팔 (철 상자 67.5..70.5 와 나눔).
CU_UP = [66, 69, 72, 75, 78, 81]
CU_LOW = [66, 69, 72, 75, 78, 81, 84]
CU_X = 61.5


def copperout():
    out = []
    out += [g("steel-furnace", c, 77) for c in CU_UP]           # 00:5x 로봇 교체로 강철로
    out += [g(INS, c + 0.5, 75.5, S) for c in CU_UP]
    out += line(BELT, 81.5, 74.5, CU_X + 1, 74.5, W)
    out += [g(POLE, x, 75.5) for x in (70.5, 76.5, 82.5)]
    out += [g(INS, c - 0.5, 88.5, N) for c in CU_LOW]
    out += line(BELT, 83.5, 89.5, CU_X + 1, 89.5, W)
    out += [g(POLE, x, 88.5) for x in (67.5, 73.5, 79.5, 85.5)]
    # (61.5,40.5) 전봇대는 지하 벨트로 넘는다
    out += line(BELT, CU_X, 89.5, CU_X, 42.5, N)
    out += [g(UG, CU_X, 41.5, N, ug="input"), g(UG, CU_X, 39.5, N, ug="output")]
    out += line(BELT, CU_X, 38.5, CU_X, -12.5, N)
    out += line(BELT, CU_X, -13.5, 73.5, -13.5, E)
    out += [g(FINS, x, -14.5, S) for x in (71.5, 72.5, 73.5)]   # 00:4x 빠른 팔로 교체
    return out


def copperout_clear():
    return [("stone-furnace", c, 82) for c in CU_UP]


def copperout_rotate():
    return [("electric-mining-drill", c - 0.5, 79.5, N) for c in CU_UP]


# ---------------------------------------------------------------------------------------------------------------
# rg: 새 빨강 · 초록 블록 (NF, 허브 남서 빈 땅 x 19..58, y 2..16) - 판은 벨트로, 중간재는 벨트 · 팔 직결, 팩은 벨트 → 연구소 8 (labs5).
#   세로 (북 → 남):  y 2.5 초록 팩 벨트 P_G (서향) · 3.5 결과 팔 · 4..6 북쪽 줄 조립기 · 7.5 팔 · 8.5 벨트1 (철 남 | 구리 북) ·
#                    9.5 벨트2 (회로 북 | 톱니 남) · 10.5 팔 · 11..13 남쪽 줄 조립기 · 14.5 결과 팔 · 15.5 빨강 팩 벨트 P_R (서향)
#   북쪽 줄 (동 → 서): 톱니 · 팔조립 I1 · 초록 G1 · 벨트조립 B1 · G2 · I2 · G3 · B2 · G4 · I3 - 초록은 양옆 I · B 에서 팔 직결.
#   남쪽 줄: 전선 → 회로 (직결) · 빨강 4. 톱니 · 회로는 벨트2 로 (긴 팔: 톱니 → 남 레인, 회로 팔 → 북 레인).
#   철: 허브 줄 (y -17.5) 을 서쪽으로 이어 x 60.5 남향 → (60.5,8.5) 에서 꺾여 벨트1 남 레인.
#   구리: 구리 줄기 (x 61.5 북향) 의 분배기 (62,8.5) 오른쪽 → 지하로 철 줄기 밑 → (58.5,7.5) 에서 벨트1 북 레인에 옆 싣기.
#   팩: P_G 는 (19.5,2.5) 에서 북으로 꺾여 연구소 동쪽 (x 19.5) · P_R 은 x 17.5 로 올라와 (19.5,1.5) 에 옆 싣기 → 빨강 서 | 초록 동.
#   연구소 8 (4.5..16.5 × -4.5/-0.5): 동쪽 팔 (18.5) 이 벨트에서, 사이 팔 (14.5 · 10.5 · 6.5) 이 연구소 → 연구소로 넘긴다.
AM1 = "assembling-machine-1"
RG_N = [("gear", 56.5, "iron-gear-wheel"), ("i1", 52.5, "inserter"), ("g1", 48.5, "logistic-science-pack"),
        ("b1", 44.5, "transport-belt"), ("g2", 40.5, "logistic-science-pack"), ("i2", 36.5, "inserter"),
        ("g3", 32.5, "logistic-science-pack"), ("b2", 28.5, "transport-belt")]
RG_S = [("cable", 56.5, "copper-cable"), ("circuit", 52.5, "electronic-circuit"), ("r1", 48.5, "automation-science-pack"),
        ("r2", 44.5, "automation-science-pack"), ("r3", 40.5, "automation-science-pack"), ("r4", 36.5, "automation-science-pack")]
YN, YS = 5.5, 12.5
# 00:3x 조정: P7 (p7_24.py, 보라 · 노랑) 이 x -26..20 × y 10..32 와 labs5 사이 팔 (6.5 · 10.5 · 14.5, 동쪽으로 넘김) 을 쓴다 →
#   북쪽 줄 서쪽 끝 G4 · I3 을 빼고 (초록 3 = 0.25/s, 나중에 조립기 2 형), 팩은 labs5 북서 연구소 (4.5,-4.5) 북쪽으로만 넣는다:
#   초록 벨트 x 19.5 북 → y -7.5 서 → 팔 (4.5,-6.5) · 빨강 벨트 x 21.5 북 (P_G 밑 지하) → y -8.5 서 (R_M 밑 지하) → 긴팔 (5.5,-6.5).
#   (3.5,-2.5) 팔이 북서 → 남서 연구소로 (P7 의 (4.5,-2.5) 는 반대 방향). 그 뒤는 P7 사이 팔이 동쪽으로 넘긴다.


def rg():
    out = []
    # 판 들어오기
    out += line(BELT, 65.5, -17.5, 61.5, -17.5, W)          # 허브 뒤 NF 몫 ~2.7/s x 1.3 = 3.5 < 노란 레인 7.5 (빠른 벨트는 톱니 5 개 - 비싸다)
    out += line(BELT, 60.5, -17.5, 60.5, 7.5, S)
    out += [g("splitter", 62.0, 8.5, N), g(BELT, 62.5, 7.5, N), g(UG, 62.5, 6.5, W, ug="input"), g(UG, 59.5, 6.5, W, ug="output"),
            g(BELT, 58.5, 6.5, S), g(BELT, 58.5, 7.5, S)]
    out += line(BELT, 60.5, 8.5, 27.5, 8.5, W)          # 벨트1
    out += line(BELT, 57.5, 9.5, 28.5, 9.5, W)          # 벨트2
    # 북쪽 줄
    for name, x, rec in RG_N:
        out.append(g(AM1, x, YN, recipe=rec))
        if name == "gear":
            out += [g(FINS, x - 1, YN + 2, S), g(LINS, x, YN + 2, N)]      # 00:5x 노랑 팔이 톱니를 0.42/s 로 묶어 빠른 팔로
        elif name[0] in "ib":
            out += [g(INS, x - 1, YN + 2, S), g(LINS, x, YN + 2, S)]
        else:
            out.append(g(INS, x, YN - 2, S))                 # 초록 → P_G
    for gx, d in ((50.5, E), (46.5, W), (42.5, E), (38.5, W), (34.5, E), (30.5, W)):
        out.append(g(INS, gx, YN, d))
    for gx in (54.5, 50.5, 46.5, 42.5, 38.5, 34.5, 30.5, 26.5):
        out += [g(POLE, gx, YN - 1), g(POLE, gx, YN + 1)]
    out += line(BELT, 48.5, 2.5, 20.5, 2.5, W)
    out += line(BELT, 19.5, 2.5, 19.5, -6.5, N)
    out += line(BELT, 19.5, -7.5, 4.5, -7.5, W)
    # 남쪽 줄
    for name, x, rec in RG_S:
        out.append(g(AM1, x, YS, recipe=rec))
        if name == "cable":
            out.append(g(LINS, x, YS - 2, N))
        elif name == "circuit":
            out += [g(LINS, x - 1, YS - 2, N), g(INS, x, YS - 2, S)]
        else:
            out += [g(LINS, x - 1, YS - 2, N), g(INS, x, YS - 2, N), g(INS, x, YS + 2, N)]
    out.append(g(FINS, 54.5, YS, E))                         # 전선 → 회로 (빠른 팔 - 회로 하나에 전선 3)
    for gx in (54.5, 50.5, 46.5, 42.5, 38.5):
        out += [g(POLE, gx, YS - 1), g(POLE, gx, YS + 1)]
    out += line(BELT, 48.5, 15.5, 22.5, 15.5, W)
    out += line(BELT, 21.5, 15.5, 21.5, 4.5, N)
    out += [g(UG, 21.5, 3.5, N, ug="input"), g(UG, 21.5, 1.5, N, ug="output")]
    out += line(BELT, 21.5, 0.5, 21.5, -7.5, N)
    out += line(BELT, 21.5, -8.5, 11.5, -8.5, W)
    out += [g(UG, 10.5, -8.5, W, ug="input"), g(UG, 5.5, -8.5, W, ug="output")]
    # 연구소 (labs5 북서 한 대로 넣고, 사이 팔은 P7 것)
    out += [g(INS, 4.5, -6.5, N), g(LINS, 5.5, -6.5, N), g(INS, 3.5, -2.5, N), g(POLE, 6.5, -6.5)]
    return out


def rgfeed():
    """01:40 실측: 허브 빠른 팔 4 가 줄기 철을 다 먹어 (relay 가 허브를 늘 비운다) rg 벨트1 에 철 0 → 빨강 · 초록 10분 0.
    줄기 (x 69.5) 에 빠른 분배기 (69,-27.5) → 서쪽 가지 y -26.5 → x 60.5 남 → (60.5,-17.5) 에 곧게 (허브 넘침은 옆 싣기).
    rg 가 다 먹지 못하면 가지가 막혀 분배기가 모두 허브로 보낸다."""
    out = [g("fast-splitter", 69.0, -27.5, S)]
    out += line(BELT, 68.5, -26.5, 61.5, -26.5, W)
    out += line(BELT, 60.5, -26.5, 60.5, -18.5, S)
    # 01:55 실측: trunk2 로 줄기가 두 레인이 되자 가지도 두 레인 철 → 벨트1 구리 레인이 철로 막혀 빨강 · 초록 굶음.
    #   (60.5,-27.5) 받침 벨트로 (60.5,-26.5) 를 곧게 → 가지는 옆 싣기 = 동쪽 한 레인.
    out.append(g(BELT, 60.5, -27.5, S))
    out += [g(FINS, x, -16.5, N) for x in (72.5, 73.5, 74.5)]      # 허브 철 팔 4 → 7 (P8 둘째 광맥 대비, ~16/s)
    return out


def trunk2():
    """P8 둘째 철 광맥 (15/s) 이 줄기 머리 (69.5,-63.5) 로 들어온다 - 쌍 A · B · D 가 모두 동쪽 레인 (11/s) 이라 넘친다.
    D 를 지하로 줄기 밑을 지나 서쪽에서 옆 싣기 → 서쪽 레인 (동 A+B 7.5 + P8 7.5 · 서 D 3.5 + P8 7.5)."""
    return [g(UG, 70.5, -40.5, W, ug="input"), g(UG, 68.5, -40.5, W, ug="output"), g(BELT, 67.5, -40.5, S),
            g(BELT, 67.5, -39.5, E), g(BELT, 68.5, -39.5, E)]


def trunk2_clear():
    return [(BELT, 70.5, -40.5)]


def rg_clear():
    return [(BELT, 61.5, 8.5)]


# ---------------------------------------------------------------------------------------------------------------
# smelt: 허브 동남 강철로 줄 (y -9, 10 대 x 73..92) 을 벨트 줄로. relay M2 (돌 상자 → 허브 · 허브 돌/철 → 화로 · 벽돌/강철 → 허브) 를 대신한다.
#   입력 벨트 y -6.5 (서향): 돌 채굴기 4 (y -4.5 북향) 가 상자 대신 이 벨트에 바로 붓는다 (먼 레인 = 북 레인). 전봇대 (100.5 · 106.5, -6.5) 는 지하로.
#   철: 줄기 (x 69.5) 의 빠른 분배기 (70,-22.5) 동쪽 → y -21.5 동 → x 96.5 남 → 입력 벨트 밑 지하 → (95.5,-5.5) 에서 남쪽에서 옆 싣기 (남 레인).
#   화로 입력 팔 (c-0.5,-7.5) 은 필터 (벽돌 2 대 = 돌, 강철 8 대 = 철) · 결과 팔 (c-0.5,-10.5) → 결과 벨트 y -11.5 서향 → (72.5,-12.5) 북 →
#   구리 허브 벨트 (72.5,-13.5) 에 옆 싣기 → 허브 팔 (71.5..73.5) 이 벽돌 · 강철도 허브로. 윗줄 강철로 4 (y -12) 는 결과 벨트 자리 - 걷는다.
#   필요: 벽돌 150/5분 = 0.5/s (강철로 한 대 0.625) · 강철 300/5분 = 1/s (강철로 0.125 × 8) · 철 5/s (남 레인 7.5) · 돌 2/s (북 레인).
SM_X = [74, 76, 78, 80, 82, 84, 86, 88, 90, 92]
SM_BRICK = {74}                  # 01:05 벽돌 한 대 (0.625/s > 쓰는 양 0.5) - 둘이면 허브 상자가 벽돌로 찬다


def smelt():
    out = []
    # 입력 벨트 (돌 채굴기 줄 → 서)
    out += [g(BELT, 109.5, -6.5, W), g(BELT, 108.5, -6.5, W), g(UG, 107.5, -6.5, W, ug="input"), g(UG, 105.5, -6.5, W, ug="output"),
            g(BELT, 104.5, -6.5, W), g(BELT, 103.5, -6.5, W), g(BELT, 102.5, -6.5, W), g(UG, 101.5, -6.5, W, ug="input"),
            g(UG, 99.5, -6.5, W, ug="output")]
    out += line(BELT, 98.5, -6.5, 73.5, -6.5, W)
    # 철 가지
    out += [g("fast-splitter", 70.0, -22.5, S)]
    out += line(BELT, 70.5, -21.5, 95.5, -21.5, E)
    # 01:15 실측: 돌이 남 레인을 꽉 채워 (벽돌로 한 대만 먹는다) 남쪽 옆 싣기 철이 못 들어갔다 → 북쪽에서 옆 싣기 (북 레인)
    out += line(BELT, 96.5, -21.5, 96.5, -7.5, S)
    # 화로 팔
    for c in SM_X:
        out.append(g(INS, c - 0.5, -7.5, S, filter="stone" if c in SM_BRICK else "iron-plate"))
        out.append(g(INS, c - 0.5, -10.5, S))
    out += [g(POLE, x, -7.5) for x in (72.5, 76.5, 80.5, 82.5, 84.5, 88.5, 93.5)]
    out += [g(POLE, x, -10.5) for x in (72.5, 76.5, 80.5, 82.5, 84.5, 88.5, 93.5)]
    out.append(g(POLE, 76.5, -14.5))                         # 허브 동쪽 끝 빠른 팔 둘
    # 결과 벨트 → 허브 동쪽 끝 새 상자 2 (74.5 · 75.5, -15.5) - 01:05 처음엔 구리 허브 벨트에 옆 싣기였는데 구리가 두 레인을 꽉 채워 못 들어갔다 (강철로 full_output)
    out += line(BELT, 92.5, -11.5, 76.5, -11.5, W)
    out += [g(BELT, 75.5, -11.5, N), g(BELT, 75.5, -12.5, N), g(BELT, 75.5, -13.5, W), g(BELT, 74.5, -13.5, W)]
    out += [g(BELT, 73.5, -11.5, E), g(BELT, 74.5, -11.5, E)]      # 벽돌로 (74) 결과 - (75.5,-11.5) 에 서쪽에서 옆 싣기 (강철은 동쪽 레인)
    out += [g(FINS, 75.5, -14.5, S), g(FINS, 74.5, -14.5, S), g("iron-chest", 75.5, -15.5), g("iron-chest", 74.5, -15.5)]
    return out


def smelt_clear():
    return ([("steel-furnace", x, -12) for x in (74, 76, 78, 80)] + [("iron-chest", x, -6.5) for x in (99.5, 102.5, 105.5, 108.5)]
            + [(BELT, 72.5, -11.5), (BELT, 72.5, -12.5)]
            + [(UG, 96.5, -7.5), (UG, 96.5, -5.5), (BELT, 96.5, -4.5), (BELT, 95.5, -4.5), (BELT, 95.5, -5.5)])


# ---------------------------------------------------------------------------------------------------------------
# mall: 로봇 줄 둘째 줄 (y -10.5) 벽 · 포탑 · 수리팩 조립기 결과 → 북쪽 팔 → 공급 상자 (망에 보인다 - 건설 로봇이 유령 재건에 바로 쓴다).
#   relay M4 의 OUTS (벽 · 포탑 · 수리팩 → 허브) · NET_STOCK (허브 → 저장 상자) · PORT_STOCK (허브 → 로보포트) 를 대신한다.
#   상자는 칸 제한 (bar) - 넘치면 조립기가 멈춘다 (23회차 §3-10: 망에 넣는 것은 품목 상한).
MALL = [("wall", -88.5, 2), ("turret", -84.5, 1), ("repair", -80.5, 2)]


def mall():
    out = []
    for name, x, bar in MALL:
        out += [g(INS, x, -12.5, S), g("passive-provider-chest", x, -13.5, N, bar=bar)]
    out += [g(POLE, -86.5, -12.5), g(POLE, -82.5, -12.5)]
    return out


# ---------------------------------------------------------------------------------------------------------------
# coal: 석탄 → 보일러 벨트 (relay S4 보일러 연료를 대신). 먼저 새 채굴기 줄 (y -22.5 북향, 안 캔 띠 y -24..-19) 이 벨트 y -24.5 에 붓고,
#   벨트는 서쪽 → x 24.5 남쪽 (rg 팩 벨트 둘은 지하로) → y 48.5 서쪽 → 보일러 줄 (y 46 북향, x -29.5..-9.5 + 새 넷) 남쪽 팔.
#   옛 상자 줄 (y -29.5) 은 이 벨트가 10 분 넘게 돈 뒤 벨트로 바꿔 옆 싣기 (relay 연료원이라 먼저 걷으면 정전 - 23회차 §3-14).
#   필요: 보일러 10 × 1.8 MW / 4 MJ = 4.5/s (지금 ~2.7) → 새 채굴기 5 (2.5/s) + 옛 줄 12 (6/s) = 두 레인.
COAL_NEW = [109.5, 112.5, 115.5, 118.5, 121.5]
BOIL_X = [-29.5, -25.5, -21.5, -17.5, -13.5, -9.5, -5.5, -1.5, 2.5, 6.5]
COAL_X = 63.5


def coal():
    """02:1x 경로 바꿈: x 24.5 는 파랑 블록 (bl) 서쪽 조립기 (23.5) 자리와 겹쳤다 → 구리 줄기 동쪽 x 63.5 로 내려간다.
    y -24.5 서 → (63.5) 남: 허브 철 벨트 (y -17.5) · 구리 허브 벨트 (y -13.5) · R_S 로보포트 (y 32..35) 밑은 지하 → y 48.5 서 (구리 줄기 · 동쪽 벽 밑 지하) → 보일러."""
    out = [g("electric-mining-drill", x, -22.5, N) for x in COAL_NEW]
    under = {70.5: 68.5}                                  # 줄기 (69.5) 밑
    x = 122.5
    while x >= COAL_X + 1:
        if x in under:
            out += [g(UG, x, -24.5, W, ug="input"), g(UG, under[x], -24.5, W, ug="output")]
            x = under[x] - 1
            continue
        out.append(g(BELT, x, -24.5, W))
        x -= 1
    out += line(BELT, COAL_X, -24.5, COAL_X, -19.5, S)
    out += [g(UG, COAL_X, -18.5, S, ug="input"), g(UG, COAL_X, -16.5, S, ug="output"), g(BELT, COAL_X, -15.5, S),
            g(UG, COAL_X, -14.5, S, ug="input"), g(UG, COAL_X, -12.5, S, ug="output")]
    out += line(BELT, COAL_X, -11.5, COAL_X, 30.5, S)
    out += [g(UG, COAL_X, 31.5, S, ug="input"), g(UG, COAL_X, 36.5, S, ug="output")]
    out += line(BELT, COAL_X, 37.5, COAL_X, 56.5, S)
    out += [g(BELT, COAL_X, 57.5, W), g(UG, 62.5, 57.5, W, ug="input"), g(UG, 60.5, 57.5, W, ug="output")]   # 구리 줄기 (61.5) 밑
    out += line(BELT, 59.5, 57.5, 11.5, 57.5, W)                     # 02:3x y 48.5 → 57.5 (파랑 모듈 둘째 자리를 비운다)
    out += line(BELT, 10.5, 57.5, 10.5, 49.5, N)
    out.append(g(BELT, 10.5, 48.5, W))
    out += [g(UG, 9.5, 48.5, W, ug="input"), g(UG, 7.5, 48.5, W, ug="output")]   # 발전 동쪽 벽 (x 8.5) 밑
    out += line(BELT, 6.5, 48.5, -30.5, 48.5, W)
    out += [g(INS, x, 47.5, S) for x in BOIL_X]
    out += [g(POLE, x, 47.5) for x in (-27.5, -23.5, -19.5, -15.5, -11.5, -7.5, -3.5, 0.5, 4.5)]   # 보일러 팔 전기 (02:4x no_power · 03:2x 새 셋 팔 no_power → 03:17 정전)
    out += [g(POLE, 114.5, -20.5), g(POLE, 120.5, -20.5)]                        # 새 석탄 채굴기 전기
    return out


COAL_OLD = [107.5, 110.5, 113.5, 116.5, 119.5, 122.5]     # relay 석탄 밭 상자 (y -29.5) 로 붓던 남쪽 줄 채굴기 (y -27.5)


def coal2():
    """03:0x BOIL = 0 뒤 보일러 줄 10 이 ~2.6/s 를 먹는데 새 채굴기 5 는 2.5/s → 옛 상자 채굴기 남쪽 줄 6 을 남으로 돌려 (+3/s)
    벨트 y -25.5 서 → (105.5,-25.5) 남 → 석탄 벨트 (y -24.5) 북 레인에 옆 싣기. 상자 (-29.5) 는 북쪽 줄 (-31.5) 6 이 계속 채운다 (relay 화로 연료 · 화학)."""
    return line(BELT, 123.5, -25.5, 106.5, -25.5, W) + [g(BELT, 105.5, -25.5, S)]


def coal2_rotate():
    return [("electric-mining-drill", x, -27.5, S) for x in COAL_OLD]


def westnet():
    """03:1x 탄 줄 전환: 로봇 줄 (y -12..-6, x -94..-63) 이 로봇망 밖 → 로보포트 하나 (-86,-17) 로 (-82,20) 망과 이음 (물류 25).
    피어싱 조립기 둘 · 탄창 조립기 · 군수 상자가 망 안에 들어와 건설 로봇 요청 (proxy) 으로 먹이고 공급 상자로 뺀다."""
    return [g("roboport", -86, -17), g(POLE, -86.5, -14.5)]      # 04:0x 전봇대 - (-86.5,-12.5) 가 덮지 못해 로보포트 전기 없음 (no_power)


def ammo():
    """탄 조립기 결과 → 팔 → 공급 상자 (망에 보임). 피어싱 1 (-92.5,-6.5) 남 · 피어싱 2 (-68.5,-10.5) 북 · 노랑 탄창 (-53.5,3.5) 남.
    먹이 (철 · 강철 · 구리 · 노랑 탄창) 와 포탑 채우기는 ammo24.py (건설 로봇 요청). 칸 제한 1 = 피어싱 100 · 노랑 200."""
    return [g(INS, -92.5, -4.5, N), g("passive-provider-chest", -92.5, -3.5, N, bar=1),
            g(INS, -68.5, -12.5, S), g("passive-provider-chest", -68.5, -13.5, N, bar=1), g(POLE, -69.5, -13.5),
            g(INS, -53.5, 5.5, N), g("passive-provider-chest", -53.5, 6.5, N, bar=1), g(POLE, -54.5, 5.5)]   # 04:2x 노랑 결과 팔 no_power


def southnet():
    """발전 남쪽 호숫가 포탑 10 (y 36..52) 이 로봇망 밖 - 로보포트 (0,32) 로 망을 늘려 탄 요청 (ammo24) · 피어싱 바꿈이 닿게."""
    return [g("roboport", 0, 32), g(POLE, 2.5, 34.5)]


def robo():
    """로봇 줄 relay FEEDS 걷기 (03:4x): 결과 팔 → 공급 상자 (칸 제한 1) 로 중간재를 망에 - 먹이는 robofeed24 (건설 로봇 요청).
    회로 3 · 전기 엔진 · 배터리 · 틀 2 · 톱니 4 · 엔진 (eng6). 틀 1 은 P8 의 팔 → 철 상자 (-81.5,-3.5) 그대로 (P9 hauler).
    팔 직결: 전선 4 → 회로 3 (-86.5,-6.5) · eng5 (관으로 바꿈) → eng6 (8.5,8.5) · adv6 (톱니로 바꿈) → eng6 (12.5,8.5)."""
    PP = "passive-provider-chest"
    ST = "storage-chest"          # 03:5x 플라스틱 0 → 공급 상자 (고급회로) 대신 저장 상자 + 품목 필터 (robo_filters) - 로봇이 다른 것을 버리지 않게
    return [g(INS, -86.5, -6.5, E),
            g(INS, -88.5, -4.5, N), g(PP, -88.5, -3.5, N, bar=1),
            g(INS, -82.5, -1.5, W), g(ST, -81.5, -1.5, N),
            g(INS, -89.5, 1.5, W), g(ST, -88.5, 1.5, N),
            g(INS, -76.5, -4.5, N), g(ST, -76.5, -3.5, N),
            g(INS, -76.5, -12.5, S), g(ST, -76.5, -13.5, N),
            g(INS, 8.5, 8.5, W), g(INS, 12.5, 8.5, E),
            g(INS, 10.5, 6.5, S), g(PP, 10.5, 5.5, N, bar=1), g(POLE, 9.5, 5.5),
            g(INS, -71.5, -4.5, N), g("roboport", -71, -2),
            g(POLE, -80.5, -2.5), g(POLE, -77.5, -4.5), g(POLE, -78.5, -13.5)]   # 04:2x 결과 팔 셋 no_power (전기 엔진 · 틀 2 · 톱니 4)      # 04:1x 건설 로봇 (robot1) 결과 → 로보포트에 바로 (망 로봇 ≤ 404, robofeed 문)


def chemout():
    """relay M3 (화학 결과 → 허브) 걷기 (04:0x): 플라스틱 (-106.5,13.5) · 황 (-102.5,13.5) · 황 (-75.5,4.5) 결과 → 팔 → 공급 상자 (망에).
    플라스틱 (-71.5,11.5) 은 P7 노랑 (LDS) 벨트 팔 그대로. blhaul24 는 이 상자에서 꺼낸다."""
    PP = "passive-provider-chest"
    return [g(INS, -106.5, 11.5, S), g(PP, -106.5, 10.5, N),
            g(INS, -101.5, 11.5, S), g(PP, -101.5, 10.5, N),
            g(INS, -75.5, 2.5, S), g(PP, -75.5, 1.5, N)]


def cuin():
    """04:2x P10 북쪽 구리 전초 줄기 (끝 (23.5,0.5) 남향, 12/s) 잇기 (코디네이터 · P10 제안):
    빠른 분배기 (24,-1.5) - 서쪽 (23.5) 은 지하 (23.5,1.5 → 3.5) 로 초록 팩 벨트 밑 → x 23.5 남 → y 11.5 동 → bl 판 벨트 (26.5,11.5) 서쪽 레인 (구리) 옆 싣기 (≤ 7.5/s).
    동쪽 (24.5) 넘침 → y -0.5 동 → 지하 (59.5 → 64.5, rgfeed 60.5 · 구리 줄기 61.5 · 석탄 63.5 밑) → 65.5 북 → 허브 구리 벨트 (65.5,-13.5) 남 레인 옆 싣기.
    분배기 출력 우선 = 서쪽 (bl) - splitter_priority."""
    out = [g("fast-splitter", 24.0, -1.5, S)]
    out += [g(UG, 23.5, 1.5, S, ug="input"), g(UG, 23.5, 3.5, S, ug="output")]
    out += line(BELT, 23.5, 4.5, 23.5, 10.5, S)
    out += line(BELT, 23.5, 11.5, 25.5, 11.5, E)
    out += line(BELT, 24.5, -0.5, 58.5, -0.5, E)
    out += [g(UG, 59.5, -0.5, E, ug="input"), g(UG, 64.5, -0.5, E, ug="output")]
    out += line(BELT, 65.5, -0.5, 65.5, -12.5, N)
    # 허브 구리 받기: 빠른 팔 3 (71.5~73.5, 6.9/s) 로는 구리 줄기 ~6 + 넘침 ~6 을 못 받는다 → 빠른 팔 5 더 (66.5~70.5) = 18/s (ceil(12 × 1.3 / 2.3) = 7)
    out += [g(FINS, x, -14.5, S) for x in (66.5, 67.5, 68.5, 69.5, 70.5)]
    return out


def westlabs():
    """05:0x 코디네이터: rg 빨강 · 초록 넘침 → 서쪽 연구소 (윗줄 6, y -4.5) 벨트. 한 레인씩 (빨강 남 · 초록 북).
    빨강: 분배기 (22,-3.5) 북향 (서쪽 21.5 = labs5 우선) → x 22.5 북 → y -12.5 서 (지하 19.5→17.5 로 초록 줄 비킴).
    초록: 분배기 (19,-3.5) 북향 (동쪽 19.5 = labs5 우선) → x 18.5 북 (지하 -6.5→-11.5 로 초록 · 빨강 · 파랑 벨트 밑) → y -13.5 서 → (0.5,-13.5) 남 → 빨강 벨트 북 레인 옆 싣기.
    합친 벨트 y -12.5 서 → x -32.5 남 (포탑 (-34,-8) 비킴) → y -4.5 서 → 팔 (-35.5,-4.5) → 연구소 (-37.5,-4.5) → 연구소 사이 팔 (서쪽으로 넘김)."""
    out = [g("splitter", 22.0, -3.5, N), g("splitter", 19.0, -4.5, N)]      # 분배기 둘은 손으로 (유령이 벨트 위 바꿔 놓기를 못 함 - 사라짐)
    out += line(BELT, 22.5, -4.5, 22.5, -11.5, N)
    out += line(BELT, 22.5, -12.5, 20.5, -12.5, W)
    out += [g(UG, 19.5, -12.5, W, ug="input"), g(UG, 17.5, -12.5, W, ug="output")]
    # y -12.5: 전봇대 (5.5) · (-10.5) 는 지하로, 벽 (x ≤ -28.5, y -12.5) 앞 x -27.5 에서 남 → y -6.5 서 → x -34.5 남 → (-34.5,-4.5) 끝
    out += line(BELT, 16.5, -12.5, 7.5, -12.5, W) + [g(UG, 6.5, -12.5, W, ug="input"), g(UG, 4.5, -12.5, W, ug="output")]
    out += line(BELT, 3.5, -12.5, -8.5, -12.5, W) + [g(UG, -9.5, -12.5, W, ug="input"), g(UG, -11.5, -12.5, W, ug="output")]
    out += line(BELT, -12.5, -12.5, -26.5, -12.5, W)
    out += [g(BELT, -27.5, -12.5, S)] + line(BELT, -27.5, -11.5, -27.5, -7.5, S) + [g(BELT, -27.5, -6.5, W)]
    out += line(BELT, -28.5, -6.5, -33.5, -6.5, W) + line(BELT, -34.5, -6.5, -34.5, -2.5, S)
    # 아랫줄 연구소 넷 (y 8.5): x -34.5 로 더 남 ((-34.5,-0.5) 잔해는 지하) → 끝 (-34.5,5.5) → 팔 (-34.5,6.5) → 연구소 (-35.5,8.5) → 사이 팔 · 긴팔 (서쪽)
    out += [g(UG, -34.5, -1.5, S, ug="input"), g(UG, -34.5, 0.5, S, ug="output")] + line(BELT, -34.5, 1.5, -34.5, 5.5, S)
    out += [g(INS, -34.5, 6.5, N), g(INS, -37.5, 8.5, E), g(LINS, -42.5, 8.5, E), g(LINS, -48.5, 8.5, E), g(POLE, -33.5, 5.5), g(POLE, -48.5, 6.5)]
    out += [g(BELT, 18.5, -5.5, N), g(UG, 18.5, -6.5, N, ug="input"), g(UG, 18.5, -11.5, N, ug="output"),
            g(BELT, 18.5, -12.5, N), g(BELT, 18.5, -13.5, W)]
    out += line(BELT, 17.5, -13.5, 1.5, -13.5, W) + [g(BELT, 0.5, -13.5, S)]
    out += [g(INS, -35.5, -4.5, E)] + [g(INS, x, -4.5, E) for x in (-39.5, -43.5, -47.5, -51.5, -55.5)]
    return out


ROBO_FILTERS = [(-81.5, -1.5, "electric-engine-unit"), (-88.5, 1.5, "battery"), (-76.5, -3.5, "flying-robot-frame"), (-76.5, -13.5, "iron-gear-wheel")]


def coal_clear():
    return [("iron-chest", -5.5, 48.5)]                    # P7 이 손으로 채우던 보일러 (-5.5) 석탄 상자 - 벨트가 대신


def eastwall():
    """코디네이터 01:5x: 발전 남쪽 호숫가 동쪽 벽 (x 8.5) 이 y 44.5 에서 끝나 북쪽이 열렸다 - y 34.5 까지 잇는다 (재료 = mall 벽 상자)."""
    return [g("stone-wall", 8.5, y + 0.5) for y in range(34, 44)]


def boilers():
    out = []
    for bx in (-5.5, -1.5, 2.5, 6.5):
        if bx == -1.5:   # (0,42) 포탑 자리 - 아래 기관 대신 관 우회 (보일러 → 위 기관 하나)
            out += [g("pipe", bx - 2, 46.5), g("boiler", bx, 46, N), g("steam-engine", bx, 37.5, N), g(POLE, bx - 2, 40.5)]
            out += [g("pipe", x, y) for x, y in ((-1.5, 44.5), (-2.5, 44.5), (-2.5, 43.5), (-2.5, 42.5), (-2.5, 41.5), (-2.5, 40.5), (-1.5, 40.5))]
            continue
        out += [g("pipe", bx - 2, 46.5), g("boiler", bx, 46, N), g("steam-engine", bx, 42.5, N), g("steam-engine", bx, 37.5, N), g(POLE, bx - 2, 40.5)]
    return out


# ---------------------------------------------------------------------------------------------------------------
# bl: 새 파랑 블록 (rg 남쪽 x 22..58, y 17..33). 판은 rg 벨트1 을 이어 (x 26.5 남 → A y 18.5 동 → x 58.5 남 → A2 y 31.5 서).
#   R1 (y 21.5): 파랑 B · B · [관 P → 엔진 E ← 톱니 G → E ← P → E ← G] - 엔진은 옆 조립기 팔 직결, 강철은 긴팔로 북쪽 상자 (y 17.5).
#   벨트 X (y 24.5): 엔진 (남 레인, R1 이 북에서) | 고급회로 (북 레인, R2 가 남에서 긴팔). 벨트 Y (y 25.5): 파랑 (두 레인).
#   R2 (y 28.5): B · B · [전선 → 회로 → 고급 ← 전선 → 고급 ← 회로 ← 전선] - 판은 A2 (남), 플라스틱은 긴팔로 남쪽 상자 (y 32.5).
#   파랑 B 는 X 에서 엔진 · 고급회로, 황은 상자 (긴팔), 결과 → Y. 강철 · 황 · 플라스틱 상자는 사람 손 (허브 → 상자, 허용된 방식) - 나중에 벨트로.
#   Y 는 x 20.5 북 → (20.5,-7.5 ↔ -9.5 지하로 빨강 줄 밑) → y -10.5 서 → (14.5,-9.5) 남 → 빨강 벨트 (y -8.5) 북 레인에 옆 싣기 → 긴팔 (5.5,-6.5) 이 labs5 로.
#   속도 (조립기 2 형 0.75): 엔진 3 × 0.075 = 0.225/s · 고급회로 2 × 0.125 = 0.25/s → 파랑 0.167/s (10분 100). 옛 파랑 (~0.33) 과 겹쳐 돌리다 모듈 둘째로 맞춘다.
AM2 = "assembling-machine-2"
BL_X = [23.5 + 4 * k for k in range(9)]
BL_R1 = ["B", "B", "P", "E", "G", "E", "P", "E", "G"]
BL_R2 = ["B", "B", "C", "I", "A", "C", "A", "I", "C"]
BL_REC = {"B": ("chemical-science-pack", AM2), "P": ("pipe", AM1), "E": ("engine-unit", AM2), "G": ("iron-gear-wheel", AM1),
          "C": ("copper-cable", AM1), "I": ("electronic-circuit", AM1), "A": ("advanced-circuit", AM2)}
BL_Y1, BL_Y2 = 21.5, 28.5


def bl_module(dy):
    """파랑 모듈 하나 (R1 · X · Y · R2 · 상자) - dy 만큼 남쪽으로. 판 벨트 A (y 18.5+dy, 동향) → x 58.5 남 → A2 (y 31.5+dy, 서향)."""
    out = []
    y1, y2 = BL_Y1 + dy, BL_Y2 + dy
    out += line(BELT, 58.5, 18.5 + dy, 58.5, 30.5 + dy, S)
    out += line(BELT, 58.5, 31.5 + dy, 30.5, 31.5 + dy, W)
    out += line(BELT, 57.5, 24.5 + dy, 22.5, 24.5 + dy, W)          # X
    out += line(BELT, 57.5, 25.5 + dy, 21.5, 25.5 + dy, W)          # Y
    for k, x in enumerate(BL_X):
        for row, yy, kinds in ((1, y1, BL_R1), (2, y2, BL_R2)):
            kind = kinds[k]
            rec, mach = BL_REC[kind]
            out.append(g(mach, x, yy, recipe=rec))
            if row == 1:
                if kind in "PG":
                    out.append(g(INS, x, yy - 2, N))                       # A (철) → 조립기
                elif kind == "E":
                    out += [g(LINS, x, yy - 2, N), g("iron-chest", x, yy - 4)]    # 강철 상자 → 엔진
                    out.append(g(INS, x, yy + 2, N))                       # 엔진 → X 남 레인
                else:  # B
                    out += [g(LINS, x, yy - 2, N), g("iron-chest", x, yy - 4)]    # 황 상자
                    out += [g(INS, x - 1, yy + 2, S), g(LINS, x + 1, yy + 2, N)]  # X → B · B → Y
            else:
                if kind in "CI":
                    out.append(g(INS, x, yy + 2, S))                       # A2 → 조립기
                elif kind == "A":
                    out += [g(LINS, x, yy + 2, S), g("iron-chest", x, yy + 4)]    # 플라스틱 상자
                    out.append(g(LINS, x, yy - 2, S))                      # 고급 → X 북 레인
                else:  # B
                    out += [g(LINS, x - 1, yy - 2, N), g(INS, x + 1, yy - 2, S)]  # X → B · B → Y
                    out += [g(LINS, x, yy + 2, S), g("iron-chest", x, yy + 4)]    # 황 상자
    for gx, d in ((33.5, W), (37.5, E), (41.5, W), (45.5, E), (49.5, W), (53.5, E)):
        out.append(g(INS, gx, y1, d))
    for gx, d in ((33.5, W), (37.5, W), (41.5, E), (45.5, W), (49.5, E), (53.5, E)):
        out.append(g(INS, gx, y2, d))
    for gx in [25.5 + 4 * k for k in range(9)]:
        out += [g(POLE, gx, y1 - 1), g(POLE, gx, y1 + 1), g(POLE, gx, y2 - 1), g(POLE, gx, y2 + 1)]
    return out


def bl():
    out = []
    # 판: rg 벨트1 끝 (27.5,8.5) 에서 잇는다
    out += [g(BELT, 26.5, 8.5, S)] + line(BELT, 26.5, 9.5, 26.5, 13.5, S)
    out += [g(UG, 26.5, 14.5, S, ug="input"), g(UG, 26.5, 16.5, S, ug="output"), g(BELT, 26.5, 17.5, S)]
    out += line(BELT, 26.5, 18.5, 57.5, 18.5, E)
    out += bl_module(0)
    # 파랑 → labs5
    out += [g(BELT, 20.5, 25.5, N)] + line(BELT, 20.5, 24.5, 20.5, 4.5, N)
    out += [g(UG, 20.5, 3.5, N, ug="input"), g(UG, 20.5, 1.5, N, ug="output")]
    out += line(BELT, 20.5, 0.5, 20.5, -6.5, N)
    out += [g(UG, 20.5, -7.5, N, ug="input"), g(UG, 20.5, -9.5, N, ug="output"), g(BELT, 20.5, -10.5, W)]
    out += line(BELT, 19.5, -10.5, 15.5, -10.5, W)
    out += [g(BELT, 14.5, -10.5, S), g(BELT, 14.5, -9.5, S)]
    return out


BL2_DY = 16


def bl2():
    """파랑 모듈 둘째 (y 33..49): 판은 모듈 1 의 A2 끝 (30.5,31.5) 을 이어 x 21.5 남 → y 34.5 동. 파랑 Y' (41.5) 는 x 20.5 북으로 모듈 1 Y 기둥 뒤에 곧게.
    석탄 벨트는 이 자리 (y 48.5, x 10..59) 를 비우고 y 57.5 로 돈다 (coal)."""
    out = line(BELT, 29.5, 31.5, 22.5, 31.5, W) + line(BELT, 21.5, 31.5, 21.5, 33.5, S)
    out += line(BELT, 21.5, 34.5, 57.5, 34.5, E)
    out += bl_module(BL2_DY)
    out += line(BELT, 20.5, 41.5, 20.5, 26.5, N)
    return out


STAGES = {"ironout": (ironout, ironout_clear), "copperout": (copperout, copperout_clear), "rg": (rg, rg_clear), "smelt": (smelt, smelt_clear),
          "mall": (mall, None), "coal": (coal, coal_clear), "eastwall": (eastwall, None), "boilers": (boilers, None), "bl": (bl, None), "bl2": (bl2, None), "rgfeed": (rgfeed, None), "trunk2": (trunk2, trunk2_clear), "coal2": (coal2, None), "westnet": (westnet, None), "ammo": (ammo, None), "southnet": (southnet, None), "robo": (robo, None), "chemout": (chemout, None), "cuin": (cuin, None), "westlabs": (westlabs, None)}
ROTATE = {"copperout": copperout_rotate, "coal2": coal2_rotate}

# ---------------------------------------------------------------------------------------------------------------
LUA_CHECK = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local G = helpers.json_to_table('%s')
  local out = {built = 0, ghost = 0, can = 0, blocked = {}, nonet = 0, wrong = {}}
  for i, q in pairs(G) do
    local p = {q.x, q.y}
    local e = s.find_entities_filtered{name = q.name, force = f, position = p, radius = 0.3}[1]
    if e then
      out.built = out.built + 1
      if q.name ~= "small-electric-pole" and e.direction ~= q.d then out.wrong[#out.wrong+1] = q.name .. "@" .. q.x .. "," .. q.y .. " d" .. e.direction end
      -- 04:2x 지은 팔 · 조립기가 전기 없음 (no_power) 인 채로 «됨» 으로 보이던 일 네 번 (보일러 팔 · 로봇 줄 결과 팔 · 노랑 팔 · 로보포트)
      if e.status == defines.entity_status.no_power then out.nopower = out.nopower or {}; out.nopower[#out.nopower+1] = q.name .. "@" .. q.x .. "," .. q.y end
    elseif s.count_entities_filtered{ghost_name = q.name, force = f, position = p, radius = 0.3} > 0 then out.ghost = out.ghost + 1
    else
      if #s.find_logistic_networks_by_construction_area(p, f) == 0 then out.nonet = out.nonet + 1 end
      local ok = s.can_place_entity{name = q.name, position = p, direction = q.d, force = f, build_check_type = defines.build_check_type.manual}
      if ok then out.can = out.can + 1
      else
        local who = {}
        for _, b in pairs(s.find_entities_filtered{area = {{q.x - 0.45, q.y - 0.45}, {q.x + 0.45, q.y + 0.45}}}) do
          if b.type ~= "resource" then who[#who+1] = b.name end
        end
        if #out.blocked < 40 then out.blocked[#out.blocked+1] = q.name .. "@" .. q.x .. "," .. q.y .. ":" .. table.concat(who, "/") end
      end
    end
  end
  return out
end)()"""

LUA_GHOST = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local G = helpers.json_to_table('%s')
  local out = {placed = 0, have = 0, wait = 0, blocked = {}, nonet = 0}
  for _, q in pairs(G) do
    local p = {q.x, q.y}
    if s.count_entities_filtered{name = q.name, force = f, position = p, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = q.name, force = f, position = p, radius = 0.3} > 0 then out.have = out.have + 1
    elseif #s.find_logistic_networks_by_construction_area(p, f) == 0 then out.nonet = out.nonet + 1
    elseif s.count_entities_filtered{type = prototypes.entity[q.name].type, force = f, position = p, radius = 0.3} > 0 then
      out.have = out.have + 1                     -- 02:5x: 같은 종류 (강철로 위 돌 화로 · 빠른 팔 위 노랑 팔) 가 이미 서 있으면 유령을 놓지 않는다 (manual 은 바꿔 놓기를 허용해 등급이 내려갔다)
    elseif s.can_place_entity{name = q.name, position = p, direction = q.d, force = f, build_check_type = defines.build_check_type.manual} then
      local spec = {name = "entity-ghost", inner_name = q.name, position = p, direction = q.d, force = f}
      if q.ug then spec.type = q.ug end
      if q.recipe then spec.recipe = q.recipe end
      local gh = s.create_entity(spec)
      if gh and q.filter then pcall(function() gh.use_filters = true; gh.set_filter(1, q.filter) end) end
      out.placed = out.placed + 1
    else
      -- 나무 · 바위만 막으면 철거 표시 (로봇이 벤다) 하고 다음에 다시
      local other = false
      local marks = {}
      local r = (prototypes.entity[q.name].tile_width or 1) / 2 + 0.3
      for _, b in pairs(s.find_entities_filtered{area = {{q.x - r, q.y - r}, {q.x + r, q.y + r}}}) do
        if b.type == "tree" or (b.type == "simple-entity" and string.find(b.name, "rock")) then marks[#marks+1] = b
        elseif math.abs(b.position.x - q.x) > r - 0.3 or math.abs(b.position.y - q.y) > r - 0.3 then
        elseif b.type ~= "resource" and b.type ~= "character" and b.type ~= "corpse" then other = true end
      end
      if not other and #marks > 0 then
        for _, b in pairs(marks) do if not b.to_be_deconstructed() then b.order_deconstruction(f) end end
        out.wait = out.wait + 1
      elseif #out.blocked < 30 then out.blocked[#out.blocked+1] = q.name .. "@" .. q.x .. "," .. q.y end
    end
  end
  return out
end)()"""

LUA_DECON = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {ordered = 0, gone = 0, pending = 0}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.6}[1]
    if not e then out.gone = out.gone + 1
    elseif e.to_be_deconstructed() then out.pending = out.pending + 1
    else e.order_deconstruction(f); out.ordered = out.ordered + 1 end
  end
  return out
end)()"""

LUA_NEED = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local G = helpers.json_to_table('%s')
  local need = {}
  for _, q in pairs(G) do
    if s.count_entities_filtered{name = q.name, force = f, position = {q.x, q.y}, radius = 0.3} == 0 then
      local item = q.name
      need[item] = (need[item] or 0) + (q.ug and 0.5 or 1)
    end
  end
  local have = {}
  local net = s.find_logistic_networks_by_construction_area({%f, %f}, f)[1]
  for k, _ in pairs(need) do have[k] = net and net.get_item_count(k) or 0 end
  return {need = need, have = have}
end)()"""


ONLY = None          # --only 이름,이름 - 이 품목 유령만


def specs(stage):
    out = STAGES[stage][0]()
    return [q for q in out if not ONLY or q["name"] in ONLY]


def check(ai, stage):
    return ai.lua(LUA_CHECK % json.dumps(specs(stage)))


def ghost(ai, stage):
    return ai.lua(LUA_GHOST % json.dumps(specs(stage)))


def decon(ai, stage):
    clear = STAGES[stage][1]() if STAGES[stage][1] else []
    return ai.lua(LUA_DECON % json.dumps(clear))


LUA_ROTATE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {turned = 0, same = 0, miss = 0}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.6}[1]
    if not e then out.miss = out.miss + 1
    elseif e.direction == q[4] then out.same = out.same + 1
    else e.direction = q[4]; out.turned = out.turned + 1 end
  end
  return out
end)()"""


def rotate(ai, stage):
    """«건설 조작» 돌리기 (사용자 허용: place / rotate / set recipe). 아이템은 옮기지 않는다."""
    return ai.lua(LUA_ROTATE % json.dumps(ROTATE[stage]()))


def need(ai, stage) -> dict:
    r = ai.lua(LUA_NEED % (json.dumps(specs(stage)), STORE[0], STORE[1]))
    nd, hv = r.get("need") or {}, r.get("have") or {}
    return {k: max(0, math.ceil(v) - int(hv.get(k, 0))) for k, v in nd.items() if math.ceil(v) - int(hv.get(k, 0)) > 0}


# 손제작 재료 (판) - 한 개당. 빠진 것은 레시피가 판을 넘는 것 (그것은 따로).
PLATES = {BELT: {"iron-plate": 1.5}, FBELT: {"iron-plate": 10}, INS: {"iron-plate": 4, "copper-plate": 1.5},
          FINS: {"iron-plate": 4, "copper-plate": 3}, LINS: {"iron-plate": 3},
          UG: {"iron-plate": 5}, "splitter": {"iron-plate": 10, "copper-plate": 7.5},
          POLE: {"copper-plate": 0.5, "wood": 0.5}, "iron-chest": {"iron-plate": 8}, "pipe": {"iron-plate": 1},
          "pipe-to-ground": {"iron-plate": 7.5}, "assembling-machine-1": {"iron-plate": 22, "copper-plate": 4.5},
          "assembling-machine-2": {"iron-plate": 20, "copper-plate": 4.5, "steel-plate": 2}, "electric-furnace": {"steel-plate": 10, "stone-brick": 10},
          "steel-furnace": {"steel-plate": 6, "stone-brick": 10}, "fast-splitter": {"iron-plate": 45, "copper-plate": 15},
          "passive-provider-chest": {"steel-plate": 8, "iron-plate": 5, "copper-plate": 8, "plastic-bar": 2}}
CRAFT_UNIT = {BELT: 2, UG: 2, POLE: 2}      # 레시피 한 번에 나오는 수


def kit(ai, who, want: dict, store=STORE) -> dict:
    """want {품목: 수} 를 who 가 허브 판으로 만들어 저장 상자에. 허브에서 판을 꺼내는 것은 캐릭터 손 (게임 안 행동)."""
    import p1
    from orders import submit
    # 빠른 벨트는 벨트를, 빠른 팔은 팔을 먹는다 (09-30 실측: 벨트 82 를 만들었더니 빠른 벨트 60 이 60 을 먹어 22 만 남음)
    want = dict(want)
    crafts = dict(want)
    if want.get(FBELT):
        crafts[BELT] = crafts.get(BELT, 0) + want[FBELT]
    if want.get(FINS):
        crafts[INS] = crafts.get(INS, 0) + want[FINS]
    if want.get(LINS):
        crafts[INS] = crafts.get(INS, 0) + want[LINS]
    if want.get(UG):
        crafts[BELT] = crafts.get(BELT, 0) + 5 * math.ceil(want[UG] / 2)
    if want.get("splitter"):
        crafts[BELT] = crafts.get(BELT, 0) + 4 * want["splitter"]
    mats = {}
    for item, n in crafts.items():
        for m, k in PLATES[item].items():
            mats[m] = mats.get(m, 0) + k * n
    h = p1.hub(ai)
    plan = []
    for m, k in mats.items():
        k = int(math.ceil(k)) + 2
        if m == "wood":
            plan += [("walk_to", {"x": p1.WOOD[0], "y": p1.WOOD[1]}), ("chop", {"x": p1.WOOD[2], "y": p1.WOOD[3], "count": k // 4 + 1})]
            continue
        if m not in h or h[m][2] < k:
            return {"short": m, "want": k, "hub": h.get(m)}
        x, y, _ = h[m]
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": m, "x": x, "y": y, "count": k})]
    order = sorted(crafts, key=lambda k: 0 if k in (BELT, INS) else 1)
    for item in order:
        plan.append(("craft", {"recipe": item, "count": int(math.ceil(crafts[item] / CRAFT_UNIT.get(item, 1))), "wait": "block"}))
    plan.append(("walk_to", {"x": store[0], "y": store[1] + 1.5}))
    for item, n in want.items():
        plan.append(("insert", {"name": item, "x": store[0], "y": store[1], "count": n}))
    plan.append(("walk_to", {"x": PARK[0], "y": PARK[1]}))
    submit(ai, who, plan, strict=False)
    return {"mats": {k: int(v) for k, v in mats.items()}, "want": want}


LUA_STATUS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {hub = {}, ins = {}}
  for _, c in pairs(s.find_entities_filtered{force = f, area = {{62.5, -16.1}, {73.5, -14.9}}}) do
    local inv = c.get_inventory(defines.inventory.chest)
    if inv then for _, it in pairs(inv.get_contents()) do out.hub[it.name] = (out.hub[it.name] or 0) + it.count end end
  end
  local G = helpers.json_to_table('%s')
  for _, q in pairs(G) do
    if q.name == "inserter" or q.name == "fast-inserter" or q.name == "long-handed-inserter" then
      local e = s.find_entities_filtered{name = q.name, force = f, position = {q.x, q.y}, radius = 0.3}[1]
      local k = e and tostring(e.status) or "none"
      out.ins[k] = (out.ins[k] or 0) + 1
    end
  end
  return out
end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", default="")
    ap.add_argument("--ghost", default="")
    ap.add_argument("--decon", default="")
    ap.add_argument("--need", default="")
    ap.add_argument("--kit", default="")
    ap.add_argument("--who", default="")
    ap.add_argument("--status", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--rotate", default="")
    ap.add_argument("--items", default="", help="--kit 에 줄 품목=수,품목=수 (없으면 모자란 것 전부)")
    a = ap.parse_args()
    global ONLY
    ONLY = set(a.only.split(",")) if a.only else None
    ai = AIBridge()
    if a.check:
        print(json.dumps(check(ai, a.check), ensure_ascii=False))
    if a.decon:
        print(json.dumps(decon(ai, a.decon), ensure_ascii=False))
    if a.rotate:
        print(json.dumps(rotate(ai, a.rotate), ensure_ascii=False))
    if a.ghost:
        print(json.dumps(ghost(ai, a.ghost), ensure_ascii=False))
    if a.need:
        print(json.dumps(need(ai, a.need), ensure_ascii=False))
    if a.kit:
        want = {k: int(v) for k, v in (kv.split("=") for kv in a.items.split(","))} if a.items else need(ai, a.kit)
        print(json.dumps(kit(ai, a.who, want), ensure_ascii=False) if want else "재료 다 있음")
    if a.status:
        print(json.dumps(ai.lua(LUA_STATUS % json.dumps(specs(a.status))), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""P7 for run 24: production (purple) + utility (yellow) science by real logistics - belts, inserters, pipes, a hauler's hands.

사용자 결정 (2026-09-30) 둘을 처음부터 지킨다:
  (1) Lua relay (물건 순간이동) 금지 - 새 설비는 벨트 · 팔 · 관 · 로봇 · 사람 손으로만. 이 파일에는 inv.remove → insert 가 없다.
      Lua 는 조회와 «건설 조작» (유령 놓기 · 레시피 걸기 · 방향 돌리기) 만 한다.
  (2) 정상적으로 못 놓는 자리에 짓기 금지 - 유령은 can_place_entity{build_check_type = manual} (forced 없음) 이 참일 때만.
      나무 · 바위는 벌목 표시 후 다음 순번, 난파선 · 건물이면 «막힘» (p6_24.GHOST_LUA 와 같은 규칙).

자리: 연구소 8 (labs5, x 4.5..16.5 · y -4.5/-0.5) 남쪽 빈 땅 (x -26..20, y 10..32) - 기지 한가운데 (방어선은 서 · 북서 · 동 · 남 면),
  로봇망 건설 반경 안 (R_M (8,-10) · R_L (-38,14) · R_S (64,34)). 호수 동쪽 물가 (x ≈ -38, y 31) 에서 물.

    물   해안 펌프 (호수 동쪽) → 관 y 31.5 동쪽 → x -6.5 북쪽 → 지하관 (버스 밑) → 황산 화학 CH (W 향, 입력 서쪽)
    판   사람 (hauler) 이 허브 판을 들고 와 공급 상자에 (상자마다 품목 상한) - «사람 손 운반» 은 허용된 방식
    플라스틱 벨트 Pb: 플라스틱 둘째 (-71.5,11.5) 동쪽 팔 → y 10.5 동쪽 (지하 벨트로 관 · 전봇대 건넘) → x -31.5 남쪽 → y 16.5 동쪽 → LDS
    회로 버스 B (y 23.5, 동쪽으로 흐름): 남쪽 줄 [전선 C1 → 녹색 G1 ← 전선 C2] 이 북쪽 레인에 녹색,
                                          북쪽 줄 [고급 A1 ← 전선 C3 → 고급 A2] 가 버스 녹색을 먹고 남쪽 레인에 고급회로 (레인이 갈려 섞여 막히지 않는다)
         → PU 입력 → x 10.5 에서 북쪽으로 꺾어 보라 블록 (생산 모듈 M · 전기로 EF) 끝에서 멈춤 (역압이 알아서 조절)
    노랑 Y ← PU (황산 관) · LDS (플라스틱 벨트) · 로봇 틀 (사람 손: 로봇 줄 틀 조립기 결과칸에서)
    보라 P ← 레일 R (← 막대 S) · 전기로 EF · 생산 모듈 M
    모음 벨트 K (x 4.5, 북쪽으로): Y · P 결과 → 끝 (4.5,2.5) → 팔 → 연구소 (4.5,-0.5) → 연구소 사이 팔 7 개로 labs5 8 대 전부

    python scripts/p7_24.py --run run24 --check                  # 배치 검사 (겹침 · 전봇대 자동 배치 · 게임 자리)
    python scripts/p7_24.py --run run24 --kit charlie,echo,foxtrot  # 필요한 건물을 손제작해 망 저장 상자에
    python scripts/p7_24.py --run run24 --ghosts all               # 유령 (manual 검사)
    python scripts/p7_24.py --run run24 --recipes                  # 선 조립기에 레시피
    python scripts/p7_24.py --run run24 --haul charlie --minutes 60
    python scripts/p7_24.py --run run24 --status
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401  (--run 을 먼저 뽑는다)
import detached                          # noqa: E402
from client import AIBridge              # noqa: E402

N, E, S, W = 0, 4, 8, 12
ASM1, ASM2, CHEM = "assembling-machine-1", "assembling-machine-2", "chemical-plant"
INS, LONG, BELT, UG = "inserter", "long-handed-inserter", "transport-belt", "underground-belt"
PIPE, PTG, CHEST, POLE = "pipe", "pipe-to-ground", "iron-chest", "small-electric-pole"
SIZE = {ASM1: 3, ASM2: 3, CHEM: 3, "electric-mining-drill": 3}
FOOT = {"boiler": (3, 2), "steam-engine": (3, 5)}
POWERED = {ASM1, ASM2, CHEM, INS, LONG, "electric-mining-drill"}
NET_OK = {ASM1, "electric-mining-drill"}
STORE = (11.5, -9.5)                     # R_M 옆 저장 상자 (p6_24.ASM2_STORE) - 로봇이 유령 재료를 여기서 가져간다

# (단계, 이름, x, y, 방향, 덧붙임) - 팔 방향 = 집는 쪽 (playbook 실측), 벨트 방향 = 흐르는 쪽.
PLAN = []                               # 과학 블록 (sci)
IRON = []                               # 철 옮기기 (iron) - 00:21 sitewatch 경보
GROUPS = {"sci": PLAN, "iron": IRON}
_CUR = [PLAN]


def add(stage, name, x, y, d=N, extra=None):
    _CUR[0].append((stage, name, float(x), float(y), d, extra))


# --- 연구소 사슬: K 끝 → 연구소 (4.5,-0.5) → 남줄 동쪽 · 북줄 (4.5,-4.5) → 동쪽 --------------------------------------
add("labs", INS, 4.5, 1.5, S)
for _x in (6.5, 10.5, 14.5):
    add("labs", INS, _x, -0.5, W)
    add("labs", INS, _x, -4.5, W)
add("labs", INS, 4.5, -2.5, S)

# --- 모음 벨트 K (x 4.5, y 16.5 → 2.5, 북쪽) ---------------------------------------------------------------------
for _y in range(16, 1, -1):
    add("collector", BELT, 4.5, _y + 0.5, N)

# --- 보라 블록 (K 동쪽) -----------------------------------------------------------------------------------------
add("purple", ASM2, 7.5, 15.5, N, "production-science-pack")
add("purple", INS, 5.5, 15.5, E)                         # P → K
add("purple", ASM1, 7.5, 11.5, N, "productivity-module")
add("purple", INS, 7.5, 13.5, N)                         # M → P
add("purple", ASM1, 7.5, 19.5, N, "electric-furnace")
add("purple", INS, 7.5, 17.5, S)                         # EF → P
add("purple", LONG, 9.5, 15.5, E)                        # R (11.5) → P (7.5), 버스 x 10.5 를 건너 집는다
add("purple", ASM1, 12.5, 15.5, N, "rail")
add("purple", INS, 14.5, 15.5, E)                        # S → R
add("purple", ASM1, 16.5, 15.5, N, "iron-stick")
add("purple", INS, 18.5, 15.5, E)                        # 상자 → S
add("purple", CHEST, 19.5, 15.5, N, "cS")
add("purple", INS, 12.5, 13.5, N)                        # 상자 → R
add("purple", CHEST, 12.5, 12.5, N, "cR")
add("purple", INS, 9.5, 11.5, E)                         # 버스 → M
add("purple", INS, 9.5, 19.5, E)                         # 버스 → EF
add("purple", INS, 7.5, 21.5, S)                         # 상자 → EF
add("purple", CHEST, 7.5, 22.5, N, "cE")

# --- 회로 버스 B (y 23.5 동쪽 → x 10.5 북쪽, (10.5,11.5) 에서 끝) ---------------------------------------------------
for _x in range(-22, 10):
    add("bus", BELT, _x + 0.5, 23.5, E)
for _y in range(23, 10, -1):
    add("bus", BELT, 10.5, _y + 0.5, N)

# 남쪽 줄 (y 26.5): 전선 C1 → 녹색 G1 ← 전선 C2, G1 → 버스 (남쪽에서 넣으니 북쪽 레인)
add("circuit", ASM1, -24.5, 26.5, N, "copper-cable")
add("circuit", INS, -22.5, 26.5, W)
add("circuit", ASM1, -20.5, 26.5, N, "electronic-circuit")
add("circuit", INS, -18.5, 26.5, E)
add("circuit", ASM1, -16.5, 26.5, N, "copper-cable")
add("circuit", INS, -20.5, 24.5, S)                      # G1 → 버스
for _x, _k in ((-24.5, "cC1"), (-20.5, "cG1"), (-16.5, "cC2")):
    add("circuit", INS, _x, 28.5, S)
    add("circuit", CHEST, _x, 29.5, N, _k)
# 북쪽 줄 (y 20.5): 고급 A1 ← 전선 C3 → 고급 A2, 버스 녹색 → A, A → 버스 (북쪽에서 넣으니 남쪽 레인), 플라스틱은 긴팔로 Pb 에서
add("circuit", ASM2, -16.5, 20.5, N, "advanced-circuit")
add("circuit", ASM1, -12.5, 20.5, N, "copper-cable")
add("circuit", ASM2, -8.5, 20.5, N, "advanced-circuit")
add("circuit", INS, -14.5, 20.5, E)                      # C3 → A1
add("circuit", INS, -10.5, 20.5, W)                      # C3 → A2
for _x in (-16.5, -8.5):
    add("circuit", INS, _x, 22.5, S)                     # 버스 → A
    add("circuit", INS, _x - 1, 22.5, N)                 # A → 버스
    add("circuit", LONG, _x, 18.5, N)                    # Pb (y 16.5) → A
add("circuit", INS, -12.5, 18.5, N)                      # 상자 → C3
add("circuit", CHEST, -12.5, 17.5, N, "cC3")

# --- 노랑 블록 (K 서쪽, 버스 북쪽) --------------------------------------------------------------------------------
add("yellow", ASM2, 1.5, 16.5, N, "utility-science-pack")
add("yellow", INS, 3.5, 16.5, W)                         # Y → K
add("yellow", ASM2, 1.5, 20.5, W, "processing-unit")     # 황산 입력 서쪽 (-0.5,20.5) - 지은 뒤 게임에 묻는다
add("yellow", INS, 1.5, 18.5, S)                         # PU → Y
add("yellow", INS, 1.5, 22.5, S)                         # 버스 → PU
add("yellow", ASM1, -2.5, 15.5, N, "low-density-structure")
add("yellow", INS, -0.5, 15.5, W)                        # LDS → Y
add("yellow", INS, -4.5, 16.5, W)                        # Pb 끝 → LDS
add("yellow", INS, -2.5, 13.5, N)                        # 상자 → LDS
add("yellow", CHEST, -2.5, 12.5, N, "cL")
add("yellow", INS, 1.5, 14.5, N)                         # 상자 (로봇 틀) → Y
add("yellow", CHEST, 1.5, 13.5, N, "cF")
add("yellow", CHEM, -2.5, 20.5, W, "sulfuric-acid")      # 출력 동쪽 (-0.5,19.5/21.5) · 입력 서쪽 (-4.5,19.5/21.5)
add("yellow", INS, -2.5, 18.5, N)                        # 상자 (황 · 철) → CH
add("yellow", CHEST, -2.5, 17.5, N, "cA")
add("yellow", PIPE, -0.5, 19.5)
add("yellow", PIPE, -0.5, 20.5)

# --- 물 (해안 펌프는 --pump 가 물가에서 자리를 찾는다) → y 31.5 → x -6.5 북쪽 → 버스 밑 지하관 → CH 서쪽 입력 --------
WATER_Y, WATER_X = 31.5, -6.5
add("water", PIPE, -36.5, 30.5)                          # 펌프 (-37.5,30.5) W 의 출구 (게임에 물음: output (-36.5,30.5))
for _x in range(-37, -6):
    add("water", PIPE, _x + 0.5, WATER_Y)
for _y in (30.5, 29.5, 28.5, 27.5, 26.5, 25.5):
    add("water", PIPE, WATER_X, _y)
add("water", PTG, WATER_X, 24.5, S)                      # 지상 쪽 남쪽
add("water", PTG, WATER_X, 22.5, N)                      # 지상 쪽 북쪽
for _y in (21.5, 20.5, 19.5):
    add("water", PIPE, WATER_X, _y)
add("water", PIPE, -5.5, 19.5)
add("water", PIPE, -4.5, 19.5)

# --- 플라스틱 벨트 Pb ---------------------------------------------------------------------------------------------
add("plastic", INS, -69.5, 11.5, W)                      # 플라스틱 둘째 (-71.5,11.5) → 벨트
add("plastic", BELT, -68.5, 11.5, E)
add("plastic", BELT, -67.5, 11.5, E)                    # (-67.5,10.5) 는 탱크 (-68.5,9.5) 자리
add("plastic", UG, -66.5, 11.5, E, "input")              # 물 관 (-65.5, y 6..12) 밑
add("plastic", UG, -64.5, 11.5, E, "output")
add("plastic", BELT, -63.5, 11.5, N)
for _x in range(-64, -44):
    add("plastic", BELT, _x + 0.5, 10.5, E)
add("plastic", UG, -43.5, 10.5, E, "input")              # 전봇대 (-42.5,10.5) 밑
add("plastic", UG, -41.5, 10.5, E, "output")
for _x in range(-41, -32):
    add("plastic", BELT, _x + 0.5, 10.5, E)
add("plastic", BELT, -31.5, 10.5, S)
for _y in range(11, 16):
    add("plastic", BELT, -31.5, _y + 0.5, S)
for _x in range(-32, -5):
    add("plastic", BELT, _x + 0.5, 16.5, E)
PLAN[:] = [p for p in PLAN if not (p[0] == "plastic" and p[1] == BELT and p[2] == -31.5 and p[3] == 16.5 and p[4] == E)]
add("plastic", BELT, -31.5, 16.5, E)

# --- 철 옮기기 (00:21 sitewatch «철전기 설비 -2 · 생산 1,050 → 300»): 줄 C (채굴기 y -45.5) 광석이 바닥 (7 대 중 5 대 no_minable_resources,
#   둘은 754 · 1,416) → 화로 7 (y -43) 이 no_ingredients. 같은 광맥의 캐지 않은 띠 y -64..-59 (줄 E 화로 y -67..-66 과 줄 B 채굴기 y -58..-56 사이,
#   4x4 칸마다 14k~22k) 에 새 채굴기 6 (y -60.5, 남향) → 광석 벨트 y -58.5 동쪽 → x 101.5 남쪽 → y -45.5 서쪽 (줄 C 채굴기를 걷은 자리) →
#   팔 7 이 줄 C 화로 7 에 광석을 넣는다. 화로 결과는 전환 담당이 짓는 줄 C 출력 팔 · 벨트 y -41 (유령 'g' 이미 있음) 그대로. 포탑 (80,-61) (86,-61) (92,-61) 은 비켜 간다.
_CUR[0] = IRON
IRON_DRILLS_OLD = [(81.5, -45.5), (84.5, -45.5), (87.5, -45.5), (90.5, -45.5), (93.5, -45.5), (96.5, -45.5), (99.5, -45.5)]
for _x in (73.5, 82.5, 88.5, 94.5, 97.5):             # 76.5 는 전봇대 (76.5,-60.5) 자리 - 뺌
    add("iron", "electric-mining-drill", _x, -60.5, S)
IRON_X = 102.5                                          # 내려가는 줄 (x 101.5 는 전봇대 (101.5,-48.5))
for _x in range(72, int(IRON_X)):
    add("iron", BELT, _x + 0.5, -58.5, E)
for _y in range(-59, -46):
    add("iron", BELT, IRON_X, _y + 0.5, S)
for _x in range(80, int(IRON_X) + 1):
    add("iron", BELT, _x + 0.5, -45.5, W)
for _fx in (82, 85, 88, 91, 94, 97, 100):
    add("iron", INS, _fx - 0.5, -44.5, N)                # 벨트 (y -45.5) → 화로 (y -44..-43)
_CUR[0] = PLAN

# --- 발전 열한째 (00:44 12.9 MW / 18.0 MW = 1.40 배 - 문턱 1.5 밑): power9 줄 (x -17.5 · -13.5 · -9.5, 보일러 y 46) 동쪽 다음 칸 x -5.5.
#   물은 옆 보일러를 거쳐 온다 (관 (-7.5,46.5)). 석탄은 상자 (-5.5,48.5) → 팔 → 보일러, 상자는 사람 손 (haul 의 cB).
POWER = []
GROUPS["power"] = POWER
_CUR[0] = POWER
add("power", PIPE, -7.5, 46.5)
add("power", "boiler", -5.5, 46.0, N)
add("power", "steam-engine", -5.5, 42.5, N)
add("power", "steam-engine", -5.5, 37.5, N)
add("power", POLE, -7.5, 40.5)
add("power", INS, -5.5, 47.5, S)
add("power", CHEST, -5.5, 48.5, N, "cB")
_CUR[0] = PLAN

# --- P9 (03:0x): 보라 · 노랑 0 의 원인 = 허브 강철이 새 상자 (75.5,-15.5) 에 있어 hauler 가 못 봄 (hub_rows 고침) → 강철이 오면 다음 상한:
#   노랑 = LDS (조립기 1, 15 s / 0.5 = 30 s 에 1 개, 한 판에 3 개 → 10분 20). 보라 = 생산 모듈 M (조립기 1, 30 s = P 28 s 보다 느림).
#   녹색 = G1 하나 (조립기 1 = 1/s 상한) 인데 노랑 60 은 PU 에만 20 × 0.067 = 1.33/s, 보라 · 고급까지 ~2.4/s.
#   셈 (10분 60 = 0.1/s 팩 = 0.033 판/s): LDS 3 × 0.033 = 0.1/s → 조립기 2 (20 s) 둘 = 0.1 ✓ · M 0.033/s → 조립기 2 (20 s) ✓ ·
#   G2 (조립기 1) 1/s ← 전선 C4 · C5 각 2/s (G 는 3/s 먹음, 팔 두 개 × 1.7/s = 3.4 ✓) · 철 1/s (팔 1.7 ✓) → 버스 북 레인 (7.5/s 에 녹 ≤ 2 ✓).
P9 = []
GROUPS["p9"] = P9
_CUR[0] = P9
add("lds2", ASM2, 1.5, 10.5, N, "low-density-structure")   # LDS2 → 팔 → cF (노랑 Y 가 cF 에서 LDS · 틀을 함께 먹는다)
add("lds2", INS, 1.5, 12.5, N)
add("lds2", INS, 1.5, 8.5, N)                             # 상자 cL2 (구리 · 강철 · 플라스틱) → LDS2
add("lds2", CHEST, 1.5, 7.5, N, "cL2")
add("g2", ASM1, -2.5, 26.5, N, "copper-cable")            # C4
add("g2", INS, -0.5, 26.5, W)                             # C4 → G2
add("g2", ASM1, 1.5, 26.5, N, "electronic-circuit")       # G2
add("g2", INS, 3.5, 26.5, E)                              # C5 → G2
add("g2", ASM1, 5.5, 26.5, N, "copper-cable")             # C5
add("g2", INS, 1.5, 24.5, S)                              # G2 → 버스 (남쪽에서 넣으니 북쪽 레인 = 녹색 레인)
for _x, _k in ((-2.5, "cC4"), (1.5, "cG2"), (5.5, "cC5")):
    add("g2", INS, _x, 28.5, S)
    add("g2", CHEST, _x, 29.5, N, _k)
# 고급 A3 (버스 x 10.5 북행 동쪽): 고급 A1 · A2 = 0.125 × 2 = 0.25/s < 필요 0.47/s (보라 60: EF 5 + M 5 = 10 × 0.033 = 0.33 · 노랑 60: PU 2 × 2 × 0.033 = 0.13).
#   A3 (조립기 2, 0.125/s) ← 버스 녹 (팔, 0.25/s) · 전선 C7 (4 × 0.125 = 0.5/s, C7 2/s) · 상자 cA3 플라스틱 (0.25/s, 사람 손) → 버스 서쪽 레인 (EF · M 이 두 레인에서 집는다)
add("a3", ASM2, 13.5, 20.5, N, "advanced-circuit")
add("a3", INS, 11.5, 20.5, W)                             # 버스 → A3 (녹)
add("a3", INS, 11.5, 19.5, E)                             # A3 → 버스
add("a3", ASM1, 17.5, 20.5, N, "copper-cable")            # C7
add("a3", INS, 15.5, 20.5, E)                             # C7 → A3
add("a3", INS, 13.5, 22.5, S)                             # 상자 cA3 (플라스틱) → A3
add("a3", CHEST, 13.5, 23.5, N, "cA3")
add("a3", INS, 17.5, 22.5, S)                             # 상자 cC7 (구리) → C7
add("a3", CHEST, 17.5, 23.5, N, "cC7")
# 연구소 먹이 (labs5 북서): rg 빨강 · 파랑 벨트 (y -8.5) 가 로보포트 밑 지하로 (10.5 → 5.5) 와서 «지하 출구 칸» 에서 긴팔 하나가 집는다 -
#   팔은 지하 출구에서 잘 못 집는다 (belt-research §1-2) → 빨강 레인이 x 11..18 까지 꽉 차 서 있는데 labs5 3 대는 빨강 0 (missing).
#   출구 뒤로 벨트 2 칸 (4.5 · 3.5, 서향) + 긴팔 (3.5,-6.5) 이 보통 벨트 칸 (3.5,-8.5) 에서 집어 연구소 (4.5,-4.5) 로. 긴팔 손 2 = ~2.2/s ≥ 필요 0.27 × 2.
LABFEED = []
GROUPS["labfeed"] = LABFEED
_CUR[0] = LABFEED
add("labfeed", BELT, 4.5, -8.5, W)
add("labfeed", BELT, 3.5, -8.5, W)
add("labfeed", LONG, 3.5, -6.5, N)
# PU 입력 팔 (03:13 실측): PU 하나 = 녹 20 + 고급 2 = 22 개 / 13.3 s = 1.65/s ≈ 기본 팔 손 2 한계 (~1.7/s) → PU 10분 24 (조립기 상한 45). 팔 둘 더 (버스 → PU).
_CUR[0] = P9
add("pu", INS, 0.5, 22.5, S)
add("pu", INS, 2.5, 22.5, S)
_CUR[0] = PLAN
UPGRADE = [(-2.5, 15.5, "low-density-structure"), (7.5, 11.5, "productivity-module")]   # 조립기 1 → 2 (로봇 교체, 레시피 유지)

STAGES = ("labs", "collector", "purple", "bus", "circuit", "yellow", "water", "plastic", "poles")

# 공급 상자 (사람 손): 이름 → {품목: 상한}. 허브에 «남길 몫» 이상일 때만 가져간다.
CHESTS = {"cS": {"iron-plate": 200}, "cR": {"stone": 150, "steel-plate": 150}, "cE": {"steel-plate": 150, "stone-brick": 150},
          "cC1": {"copper-plate": 300}, "cG1": {"iron-plate": 200}, "cC2": {"copper-plate": 300}, "cC3": {"copper-plate": 300},
          "cL": {"copper-plate": 300, "steel-plate": 60}, "cA": {"sulfur": 60, "iron-plate": 30}, "cF": {"flying-robot-frame": 20},
          "cB": {"coal": 200},
          "cL2": {"copper-plate": 300, "steel-plate": 60, "plastic-bar": 100}, "cC4": {"copper-plate": 400}, "cG2": {"iron-plate": 300},
          "cC5": {"copper-plate": 400}, "cA3": {"plastic-bar": 100}, "cC7": {"copper-plate": 200}}
# P8 (01:05): 철판 300 → 600 · 강철 120 → 250 - 허브 철판이 relay 예비 (500) 밑까지 내려가 강철로 (강철2) 가 굶던 때 hauler 가 300~500 띠 (짓는 재료 몫) 를 가져갔다.
#   철이 모자란 동안 hauler 는 허브에 600 넘게 있을 때만 철판을 가져간다 (P8 전초 공사 · 강철로가 먼저).
HUB_KEEP = {"coal": 0, "iron-plate": 600, "copper-plate": 300, "steel-plate": 250, "stone": 200, "stone-brick": 200, "sulfur": 150}
FRAME_ASMS = [(-81.5, -3.5)]                             # P8: 틀 조립기 (-80.5,-6.5) 결과 → 팔 → 철 상자 (로봇 유령). take 는 상자만 되어
#   조립기 결과칸에서 손으로 집던 계획은 한 번도 틀을 못 가져왔다 (cF 늘 20 모자람 → 노랑 10분 3)


def footprint(name, x, y):
    w, hgt = FOOT.get(name, (SIZE.get(name, 1), SIZE.get(name, 1)))
    return [(tx, ty) for tx in range(math.floor(x - w / 2 + 0.01), math.ceil(x + w / 2 - 0.01))
            for ty in range(math.floor(y - hgt / 2 + 0.01), math.ceil(y + hgt / 2 - 0.01))]


def game_blocked(ai, box) -> set:
    """이 네모 안 게임 엔티티가 덮는 타일 (나무 · 바위 제외 - 벌목 표시로 치운다)."""
    r = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, e in pairs(s.find_entities_filtered{area = {{%f, %f}, {%f, %f}}}) do
        if e.type ~= "character" and e.type ~= "tree" and not string.find(e.name, "rock") and e.type ~= "item-entity"
           and e.type ~= "corpse" and e.type ~= "construction-robot" and e.type ~= "logistic-robot" and e.type ~= "unit"
           and e.type ~= "entity-ghost" and e.type ~= "item-request-proxy" and e.type ~= "fish" and e.type ~= "resource"
           and not e.to_be_deconstructed() then
          local b = e.bounding_box
          out[#out+1] = string.format("%%s|%%.2f|%%.2f|%%.2f|%%.2f|%%.1f|%%.1f", e.name, b.left_top.x, b.left_top.y, b.right_bottom.x, b.right_bottom.y, e.position.x, e.position.y)
        end
      end
      local w = {}
      for _, t in pairs(s.find_tiles_filtered{area = {{%f, %f}, {%f, %f}}, collision_mask = "water_tile"}) do w[#w+1] = t.position.x .. "," .. t.position.y end
      out.water = w
      return out
    end)()""" % (*box, *box))
    occ, poles = {}, []
    items = [v for k, v in r.items() if k != "water"] if isinstance(r, dict) else r
    for it in items:
        n, a, b_, c, d, px, py = it.split("|")
        a, b_, c, d = float(a), float(b_), float(c), float(d)
        for tx in range(math.floor(a + 0.01), math.ceil(c - 0.01)):
            for ty in range(math.floor(b_ + 0.01), math.ceil(d - 0.01)):
                occ[(tx, ty)] = n
        if n in (POLE, "medium-electric-pole"):
            poles.append((float(px), float(py)))
    for w in (r.get("water") or []) if isinstance(r, dict) else []:
        x, y = (int(float(v)) for v in w.split(","))
        occ[(x, y)] = "water"
    return occ, poles


def check(ai, plan=None) -> dict:
    plan = PLAN if plan is None else plan
    """계획끼리 겹침 · 게임 엔티티와 겹침 · 전봇대 자동 배치 (덮기 5x5, 전선 7.5, 기존 전봇대에서 이어짐)."""
    mine = {}
    clash = []
    for st, n, x, y, d, ex in plan:
        for t in footprint(n, x, y):
            if t in mine:
                clash.append(f"계획 겹침 {n}({x},{y}) × {mine[t]}")
            mine[t] = f"{n}({x},{y})"
    xs = [p[2] for p in plan]
    ys = [p[3] for p in plan]
    box = (min(xs) - 10, min(ys) - 10, max(xs) + 10, max(ys) + 10)
    occ, poles = game_blocked(ai, box)
    for t, what in mine.items():
        if t in occ and not what.startswith(occ[t] + "("):       # 이미 선 계획 엔티티는 겹침이 아니다
            clash.append(f"게임 겹침 {what} × {occ[t]} @ {t}")
        elif False:
            clash.append(f"게임 겹침 {what} × {occ[t]} @ {t}")
    poles_new = place_poles(plan, mine, occ, poles)
    return {"entities": len(plan), "clash": clash, "poles": poles_new}


def place_poles(plan, mine, occ, existing):
    need = [(n, x, y) for st, n, x, y, d, ex in plan if n in POWERED]

    def covers(p, e):
        n, x, y = e
        h = SIZE.get(n, 1) / 2
        return abs(p[0] - x) < 2.5 + h and abs(p[1] - y) < 2.5 + h

    left = set(range(len(need)))
    for p in existing:
        left -= {i for i in left if covers(p, need[i])}
    lo_x = math.floor(min(x for _, x, _ in need)) - 3
    hi_x = math.ceil(max(x for _, x, _ in need)) + 3
    lo_y = math.floor(min(y for _, _, y in need)) - 3
    hi_y = math.ceil(max(y for _, _, y in need)) + 3
    cand = [(tx + 0.5, ty + 0.5) for tx in range(lo_x, hi_x) for ty in range(lo_y, hi_y)
            if (tx, ty) not in mine and (tx, ty) not in occ]
    net = list(existing)
    chosen = []

    def reach(p):
        return any(math.hypot(p[0] - q[0], p[1] - q[1]) <= 7.5 for q in net)

    while left:
        best, score = None, 0
        for p in cand:
            if p in chosen or not reach(p):
                continue
            s = sum(1 for i in left if covers(p, need[i]))
            if s > score:
                best, score = p, s
        if best is None:              # 닿는 자리에서 덮을 것이 없으면 남은 것 쪽으로 한 발 (징검다리)
            tgt = need[min(left)]
            steps = [p for p in cand if p not in chosen and reach(p)]
            if not steps:
                break
            best = min(steps, key=lambda p: math.hypot(p[0] - tgt[1], p[1] - tgt[2]))
        chosen.append(best)
        net.append(best)
        left -= {i for i in left if covers(best, need[i])}
    return chosen


def plan_with_poles(ai, plan=None):
    plan = PLAN if plan is None else plan
    c = check(ai, plan)
    return plan + [("poles", POLE, x, y, N, None) for x, y in c["poles"]], c


GHOST = """
  local s, f = game.surfaces[1], game.forces.player
  local function clear(p, r)
    local k = 0
    for _, t in pairs(s.find_entities_filtered{type = {"tree", "simple-entity"}, area = {{p[1] - r, p[2] - r}, {p[1] + r, p[2] + r}}}) do
      if t.type == "tree" or string.find(t.name, "rock") then
        k = k + 1
        if not t.to_be_deconstructed() then t.order_deconstruction(f) end
      end
    end
    return k
  end
  local out = {placed = 0, skip = 0, nonet = 0, blocked = 0, wait = 0, why = {}}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local n, pos, d, ex = q[1], {q[2], q[3]}, q[4], q[5]
    local r = (n == "assembling-machine-1" or n == "assembling-machine-2" or n == "chemical-plant") and 1.5 or 0.5
    if s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.3} > 0 then out.skip = out.skip + 1
    elseif #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
    elseif s.can_place_entity{name = n, position = pos, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
      local spec = {name = "entity-ghost", inner_name = n, position = pos, direction = d, force = f}
      if n == "underground-belt" then spec.type = ex end
      s.create_entity(spec)
      out.placed = out.placed + 1
    elseif clear(pos, r) > 0 then out.wait = out.wait + 1
    else
      out.blocked = out.blocked + 1
      if #out.why < 12 then
        local hit = s.find_entities_filtered{area = {{pos[1] - r, pos[2] - r}, {pos[1] + r, pos[2] + r}}}
        local names = {}
        for _, h in pairs(hit) do names[#names+1] = h.name end
        out.why[#out.why+1] = string.format("%%s(%%.1f,%%.1f): %%s", n, pos[1], pos[2], table.concat(names, "/"))
      end
    end
  end
  return out
"""


def ghosts(ai, stages, plan=None) -> dict:
    full, c = plan_with_poles(ai, plan)
    if c["clash"]:
        return {"clash": c["clash"][:10]}
    rows = [[n, x, y, d, ex] for st, n, x, y, d, ex in full if st in stages or "all" in stages]
    out = {}
    for i in range(0, len(rows), 60):
        r = ai.lua("(function()%s end)()" % (GHOST % json.dumps(rows[i:i + 60]).replace("'", "\\'")))
        for k, v in r.items():
            if isinstance(v, (int, float)):
                out[k] = out.get(k, 0) + v
            elif isinstance(v, list) and v:
                out.setdefault("why", []).extend(v)
    return out


def need_items(ai, plan=None) -> dict:
    full, _ = plan_with_poles(ai, plan)
    want = {}
    for st, n, x, y, d, ex in full:
        want[n] = want.get(n, 0) + 1
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local n, pos = q[1], {q[2], q[3]}
        if s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.3} > 0 then out[n] = (out[n] or 0) + 1 end
      end
      local net = s.find_logistic_network_by_position(%s, f)
      local inv = {}
      if net then for _, v in pairs(net.get_contents()) do inv[v.name] = (inv[v.name] or 0) + v.count end end
      local box = {}
      local c = s.find_entities_filtered{type = "logistic-container", force = f, position = %s, radius = 0.3}[1]
      if c then for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do box[v.name] = (box[v.name] or 0) + v.count end end
      local gh = {}
      for _, g in pairs(s.find_entities_filtered{type = "entity-ghost", force = f, area = {{-80, -70}, {110, 40}}}) do gh[g.ghost_name] = (gh[g.ghost_name] or 0) + 1 end
      return {built = out, net = inv, box = box}
    end)()""" % (json.dumps([[n, x, y] for st, n, x, y, d, ex in full]), "{%f, %f}" % STORE, "{%f, %f}" % STORE))
    built = have.get("built") or {}
    net = have.get("net") or {}
    box = have.get("box") or {}
    # 망 재고는 전환 담당 (relay 교체) 의 유령 몫이기도 하다 - 조립기 1 · 채굴기 (교체로 남은 것) 만 망에서 쓰고 나머지는 새로 만든다
    #   (내가 STORE 에 넣은 것은 STORE 상자 안에 있는 만큼 센다 - 다시 돌려도 두 번 만들지 않게)
    return {n: max(0, k - int(built.get(n, 0)) - (int(net.get(n, 0)) if n in NET_OK else int(box.get(n, 0)))) for n, k in want.items()}


# 판으로 따진 한 개 값 (2.0 레시피). 조립기 2 는 조립기 1 까지 판에서 (p6_24.asm2_craft 와 같은 셈).
COST = {BELT: {"iron-plate": 1.5}, UG: {"iron-plate": 8.75}, INS: {"iron-plate": 4, "copper-plate": 1.5},
        LONG: {"iron-plate": 7, "copper-plate": 1.5}, PIPE: {"iron-plate": 1}, PTG: {"iron-plate": 7.5}, CHEST: {"iron-plate": 8},
        POLE: {"copper-plate": 0.5, "wood": 0.5}, ASM1: {"iron-plate": 22, "copper-plate": 4.5},
        ASM2: {"iron-plate": 35, "copper-plate": 9, "steel-plate": 2}, CHEM: {"iron-plate": 20, "copper-plate": 7.5, "steel-plate": 5},
        "offshore-pump": {"iron-plate": 5, "copper-plate": 3}, "electric-mining-drill": {"iron-plate": 23, "copper-plate": 4.5},
        "boiler": {"iron-plate": 4, "stone": 5}, "steam-engine": {"iron-plate": 31}}
PAIRED = {BELT, UG, PTG, POLE}


def hub_rows(ai) -> list:
    import p1
    return p1._rows(ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      local cs = s.find_entities_filtered{type = {"container", "logistic-container"}, force = f, area = {{62, -16.1}, {76.2, -14.9}}}   -- P9: 74.5 · 75.5 (smelt 강철 · 벽돌) 도 허브
      -- 석탄은 석탄 밭 상자 (채굴기가 붓는 곳, relay24.COAL_BOX) 에서 손으로
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f, area = {{100, -34}, {126, -22}}}) do cs[#cs+1] = c end
      for _, c in pairs(cs) do
        for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
          out[#out+1] = string.format("%s,%.1f,%.1f,%d", v.name, c.position.x, c.position.y, v.count)
        end
      end
      return out
    end)()"""))


def take_plan(ai, mats: dict, keep: dict) -> list:
    """허브 상자들에서 mats 만큼 (상자마다 나눠서, 허브에 keep 은 남긴다)."""
    rows = [str(r).split(",") for r in hub_rows(ai)]
    total = {}
    for n, x, y, c in rows:
        total[n] = total.get(n, 0) + int(c)
    plan = []
    for m, want in mats.items():
        room = max(0, total.get(m, 0) - keep.get(m, 0))
        want = min(int(math.ceil(want)), room)
        for n, x, y, c in sorted(rows, key=lambda r: -int(r[3])):
            if want <= 0:
                break
            if n != m:
                continue
            k = min(want, int(c))
            plan += [("walk_to", {"x": float(x), "y": float(y) + 1.5}), ("take", {"name": m, "x": float(x), "y": float(y), "count": k})]
            want -= k
    return plan


def kit(ai, crew: list, only=None, plan=None) -> dict:
    """모자란 건물을 사람들이 손제작해 망 저장 상자 (STORE) 에. 나무는 저장 상자에서 (망 나무 68)."""
    from orders import submit
    need = need_items(ai, plan)
    if only:
        need = {k: v for k, v in need.items() if k in only}
    if plan is None or plan is PLAN:
        if not ai.lua("""(function() return {n = game.surfaces[1].count_entities_filtered{name = "offshore-pump", area = {{-42, 27}, {-33, 36}}}
          + game.surfaces[1].count_entities_filtered{ghost_name = "offshore-pump", area = {{-42, 27}, {-33, 36}}}} end)()""").get("n"):
            need["offshore-pump"] = 1
    need = {k: v for k, v in need.items() if v > 0}
    jobs = sorted(need.items(), key=lambda kv: -sum(COST.get(kv[0], {}).values()) * kv[1])
    share = {w: {} for w in crew}
    load = {w: 0.0 for w in crew}
    for n, k in jobs:                                  # 판 무게로 나눠 준다 (한 사람이 다 들지 않게)
        per = sum(COST.get(n, {"iron-plate": 1}).values())
        parts = max(1, min(len(crew), int(per * k // 150) + 1))
        for i in range(parts):
            w = min(crew, key=lambda c: load[c])
            q = k // parts + (1 if i < k % parts else 0)
            if q:
                share[w][n] = share[w].get(n, 0) + q
                load[w] += per * q
    os.environ[detached.ENV] = "p7_kit"
    detached.mark(crew, "p7_kit", minutes=25)
    for w, items in share.items():
        if not items:
            continue
        mats = {}
        for n, q in items.items():
            for m, c in COST.get(n, {}).items():
                mats[m] = mats.get(m, 0) + c * q
        plan = []
        if mats.pop("wood", 0):
            wood = int(math.ceil(sum(q for n, q in items.items() if n == POLE) / 2)) + 1
            plan += [("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}), ("take", {"name": "wood", "x": STORE[0], "y": STORE[1], "count": wood})]
        plan += take_plan(ai, {m: c + 4 for m, c in mats.items()}, {"iron-plate": 150, "copper-plate": 100, "steel-plate": 60})
        for n, q in items.items():
            plan.append(("craft", {"recipe": n, "count": (q + 1) // 2 if n in PAIRED else q, "wait": "block"}))
        plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
        for n, q in items.items():
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
        submit(ai, w, plan, strict=False)
        print(w, items, {m: round(c) for m, c in mats.items()}, flush=True)
    return {"need": need}


def recipes(ai) -> dict:
    rows = [[n, x, y, ex, d] for plan in GROUPS.values() for st, n, x, y, d, ex in plan if n in (ASM1, ASM2, CHEM) and ex]
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {set = 0, ok = 0, missing = 0, err = {}}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
        if not e then out.missing = out.missing + 1
        else
          local r = e.get_recipe()
          if r and r.name == q[4] then out.ok = out.ok + 1
          else
            local ok, m = pcall(function() e.set_recipe(q[4]) end)
            if ok then out.set = out.set + 1 else out.err[#out.err+1] = q[4] .. ": " .. tostring(m) end
          end
          if e.direction ~= q[5] then pcall(function() e.direction = q[5] end) end
        end
      end
      return out
    end)()""" % json.dumps(rows))


def fluids(ai) -> dict:
    """PU · CH · 펌프의 유체 연결을 게임에 묻는다 (방향이 틀렸으면 여기서 보인다)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, q in pairs({{"assembling-machine-2", 1.5, 20.5}, {"chemical-plant", -2.5, 20.5}}) do
        local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
        if e then
          local c = {}
          for i = 1, #e.fluidbox do
            local con = e.fluidbox.get_pipe_connections(i)
            for _, pc in pairs(con) do c[#c+1] = string.format("%d:%s(%.1f,%.1f)%s", i, pc.flow_direction, pc.target_position.x, pc.target_position.y, pc.target and "+" or "-") end
            local fl = e.fluidbox[i]
            if fl then c[#c+1] = string.format("%d=%s %.0f", i, fl.name, fl.amount) end
          end
          out[q[1]] = {dir = e.direction, con = c, status = e.status}
        end
      end
      return out
    end)()""")


def pump(ai) -> dict:
    """물가 (호수 동쪽 x -40..-34, y 29..34) 에서 해안 펌프 자리를 찾아 유령 - 출구가 관 머리 (-36.5,31.5) 쪽이면 좋다. manual 검사."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      if s.count_entities_filtered{name = "offshore-pump", force = f, area = {{-42, 27}, {-33, 36}}} > 0
         or s.count_entities_filtered{ghost_name = "offshore-pump", force = f, area = {{-42, 27}, {-33, 36}}} > 0 then return {have = true} end
      local best = nil
      for x = -41, -34 do for y = 29, 34 do for _, d in pairs({0, 4, 8, 12}) do
        local p = {x + 0.5, y + 0.5}
        if s.can_place_entity{name = "offshore-pump", position = p, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
          local dd = math.abs(p[1] + 37.5) + math.abs(p[2] - 31.5)
          if not best or dd < best[4] then best = {p[1], p[2], d, dd} end
        end
      end end end
      if not best then return {none = true} end
      local g = s.create_entity{name = "entity-ghost", inner_name = "offshore-pump", position = {best[1], best[2]}, direction = best[3], force = f}
      local c = {}
      pcall(function() for _, pc in pairs(g.ghost_prototype.fluidbox_prototypes[1].pipe_connections) do c[#c+1] = "x" end end)
      return {x = best[1], y = best[2], d = best[3]}
    end)()""")


def status(ai) -> dict:
    rows = [[n, x, y] for st, n, x, y, d, ex in PLAN if n in (ASM1, ASM2, CHEM, "lab")]
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
        local g = s.count_entities_filtered{ghost_name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}
        local r = e and e.get_recipe() and e.get_recipe().name or "-"
        out[#out+1] = string.format("%%s (%%.1f,%%.1f) %%s %%s %%s", q[1], q[2], q[3], r, e and (st[e.status] or "?") or (g > 0 and "ghost" or "MISSING"),
          e and e.products_finished or 0)
      end
      local p = {}
      for _, n in pairs({"production-science-pack", "utility-science-pack", "processing-unit", "low-density-structure", "rail", "electric-furnace", "productivity-module", "advanced-circuit", "electronic-circuit"}) do
        local st2 = f.get_item_production_statistics(s)
        p[n] = st2.get_flow_count{name = n, category = "input", precision_index = defines.flow_precision_index.ten_minutes, count = true}
      end
      out.ten = p
      return out
    end)()""" % json.dumps(rows))


def chest_pos():
    return {ex: (x, y) for plan in GROUPS.values() for st, n, x, y, d, ex in plan if n == CHEST}


P9_CHESTS = {"cL2", "cC4", "cG2", "cC5", "cA3", "cC7"}


def haul(ai, who, minutes, only=None) -> None:
    """공급 상자 채우기 - 허브 판 (허브에 HUB_KEEP 은 남김) · 로봇 줄 틀 조립기 결과칸의 로봇 틀을 사람이 들고 온다.
    only: 이 사람이 맡을 상자 (P9: charlie = P7 상자, alpha = P9 상자 - 둘이 같은 상자를 두 번 채우지 않게)."""
    from orders import submit
    end = time.time() + minutes * 60
    pos = {k: v for k, v in chest_pos().items() if only is None or k in only}
    import walkscout
    os.environ[detached.ENV] = "p7_haul"
    while time.time() < end:
        detached.mark([who], "p7_haul", minutes=10)
        r = walkscout.body(ai, who)
        if not r or r.get("current") or r.get("queued"):
            time.sleep(15)
            continue
        have = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local out = {}
          for k, p in pairs(helpers.json_to_table('%s')) do
            local c = s.find_entities_filtered{name = "iron-chest", force = f, position = p, radius = 0.3}[1]
            if c then local t = {}; for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do t[v.name] = (t[v.name] or 0) + v.count end; out[k] = t end
          end
          local fr = 0
          for _, p in pairs(helpers.json_to_table('%s')) do
            local a = s.find_entities_filtered{type = "container", force = f, position = p, radius = 0.3}[1]
            if a then fr = fr + a.get_item_count("flying-robot-frame") end
          end
          out.frames = fr
          return out
        end)()""" % (json.dumps({k: list(v) for k, v in pos.items()}), json.dumps(FRAME_ASMS)))
        short, mats = {}, {}
        for k, caps in CHESTS.items():
            if k not in have or k not in pos:
                continue
            for m, cap in caps.items():
                got = int((have.get(k) or {}).get(m, 0))
                if got < cap * 0.5:
                    short.setdefault(k, {})[m] = cap - got
                    if m != "flying-robot-frame":
                        mats[m] = mats.get(m, 0) + cap - got
        if not short:
            time.sleep(30)
            continue
        # 한 번에 상자 4 개까지 (계획 59 걸음에 잘려 뒤 상자가 영영 못 받던 것 - 00:40 cC3 · cL 구리 0), 가장 빈 상자부터. 가방에 든 것은 먼저 쓴다.
        order = sorted(short, key=lambda k: -sum(short[k].values()) / max(1, sum(CHESTS[k].values())))[:4]
        short = {k: short[k] for k in order}
        mats = {}
        for k in order:
            for m, q in short[k].items():
                if m != "flying-robot-frame":
                    mats[m] = mats.get(m, 0) + q
        try:
            bag = ai.agent(who).items()
        except Exception:
            bag = {}
        mats = {m: q - int(bag.get(m, 0)) for m, q in mats.items() if q - int(bag.get(m, 0)) > 0}
        plan = take_plan(ai, mats, HUB_KEEP)
        fr = short.get("cF", {}).get("flying-robot-frame", 0)
        if fr and int(have.get("frames", 0)) > 0:
            for x, y in FRAME_ASMS:
                plan += [("walk_to", {"x": x, "y": y + 2.5}), ("take", {"name": "flying-robot-frame", "x": x, "y": y, "count": min(fr, int(have.get("frames", 0)))})]
        taken = {m: int(c) for m, c in bag.items()}
        for k2, p in plan:
            if k2 == "take":
                taken[p["name"]] = taken.get(p["name"], 0) + p["count"]
        if not taken:
            time.sleep(30)
            continue
        for k, items in short.items():
            x, y = pos[k]
            put = {m: min(q, taken.get(m, 0)) for m, q in items.items()}
            put = {m: q for m, q in put.items() if q > 0}
            if not put:
                continue
            plan.append(("walk_to", {"x": x + 1.5, "y": y + 0.5}))
            for m, q in put.items():
                plan.append(("insert", {"name": m, "x": x, "y": y, "count": q}))
                taken[m] -= q
        plan.append(("walk_to", {"x": 14.5, "y": 30.5}))
        submit(ai, who, plan[:59], strict=False)
        print(time.strftime("%X"), who, "나름", {k: v for k, v in short.items()}, flush=True)
        time.sleep(20)


def retire_iron(ai) -> dict:
    """줄 C 옛 채굴기 해체 표시 (building work - 로봇이 들고 망 저장으로). 광석 벨트가 그 자리를 지나간다."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {ordered = 0, already = 0}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = "electric-mining-drill", force = f, position = p, radius = 0.3}[1]
        if e then if e.to_be_deconstructed() then out.already = out.already + 1 else e.order_deconstruction(f); out.ordered = out.ordered + 1 end end
      end
      return out
    end)()""" % json.dumps(IRON_DRILLS_OLD))


def upgrade(ai) -> dict:
    """P9: 조립기 1 → 2 교체 표시 (order_upgrade - 로봇이 망의 조립기 2 로 바꾼다, 레시피 · 든 것 유지). 건설 조작만."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {ordered = 0, already = 0, done = 0}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = "assembling-machine", force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if e and e.name == "assembling-machine-2" then out.done = out.done + 1
        elseif e and e.to_be_upgraded() then out.already = out.already + 1
        elseif e then e.order_upgrade{force = f, target = "assembling-machine-2"}; out.ordered = out.ordered + 1 end
      end
      return out
    end)()""" % json.dumps(UPGRADE))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", default="sci", choices=tuple(GROUPS))
    ap.add_argument("--retire-iron", action="store_true", help="줄 C 옛 채굴기 7 해체 표시 (로봇이 걷는다)")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--ghosts", default="")
    ap.add_argument("--kit", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--need", action="store_true")
    ap.add_argument("--recipes", action="store_true")
    ap.add_argument("--fluids", action="store_true")
    ap.add_argument("--pump", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--upgrade", action="store_true", help="P9: LDS · M 조립기 1 → 2 교체 표시")
    ap.add_argument("--haul", default="")
    ap.add_argument("--minutes", type=float, default=60)
    ap.add_argument("--chests", default="", help="p7 | p9 | 상자 이름 쉼표 (haul 이 맡을 상자)")
    a = ap.parse_args()
    ai = AIBridge()
    plan = GROUPS[a.group]
    if a.retire_iron:
        print("retire", retire_iron(ai))
    if a.check:
        c = check(ai, plan)
        print(json.dumps(c, ensure_ascii=False))
    if a.need:
        print(need_items(ai, plan))
    if a.kit:
        print(kit(ai, a.kit.split(","), set(a.only.split(",")) if a.only else None, plan))
    if a.pump:
        print("pump", pump(ai))
    if a.ghosts:
        print("ghosts", ghosts(ai, a.ghosts.split(","), plan))
    if a.recipes:
        print("recipes", recipes(ai))
    if a.fluids:
        print(json.dumps(fluids(ai), ensure_ascii=False, indent=1))
    if a.upgrade:
        print("upgrade", upgrade(ai))
    if a.status:
        r = status(ai)
        for k, v in (r.items() if isinstance(r, dict) else enumerate(r)):
            print(k, v)
    if a.haul:
        only = None
        if a.chests == "p9":
            only = P9_CHESTS
        elif a.chests == "p7":
            only = set(CHESTS) - P9_CHESTS
        elif a.chests:
            only = set(a.chests.split(","))
        haul(ai, a.haul, a.minutes, only)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

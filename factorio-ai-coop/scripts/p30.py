"""P5-1 for run 23: robot block R (construction robots · repair packs · roboports) + NE roboport net. Design + offline check only (p28 tools).

사용자: "연구는 로봇쪽으로 돌려서 진짜 자동화를 목표로 진행하자. 수리라던가 생산이 좀 더 수월하게"
      + "북동쪽 방어선 내부에 로봇포트를 건설해서 로봇이 수리를 자동으로 하도록"
첫 목표: 건설 로봇 50 · 로보포트 4 · 수리팩 200 을 1시간 안에, 가장 적은 공사로. 로보포트 4 는 전부 북동 망 (ne_ports) 에 쓴다.

근거 (게임 실측 2026-09-26, tick 11.42M):
    · 레시피: 고급 정제 원유 100 + 물 50 -> 중유 25 · 경유 45 · 가스 55 (5초) · 윤활유 10 = 중유 10 (1초) · 황 2 = 물 30 + 가스 30 (1초)
      황산 50 = 철 1 + 황 5 + 물 100 (1초) · 배터리 = 철 1 + 구리 1 + 황산 20 (4초) · 전기 엔진 = 회로 2 + 엔진 1 + 윤활유 15 (10초, 조립기 2형만)
      프레임 = 강철 1 + 배터리 2 + 회로 3 + 전기 엔진 1 (20초) · 건설 로봇 = 회로 2 + 프레임 1 (0.5초) · 수리팩 = 톱니 2 + 회로 2 (0.5초)
      로보포트 = 강철 45 + 톱니 45 + 고급회로 45 (5초). 유체 상자 순서: 레시피 fluidbox_index 없음 = 재료 순서 (고급 정제 1 물 · 2 원유 / 3 중유 · 4 경유 · 5 가스).
    · 전력: 엔진 12 = 10.8MW 에 지금 7.17MW (66%). 해안 펌프는 전기 안 씀 (2.0).
    · 허브: 철 14,071 · 구리 16,744 · 강철 421 · 벽돌 2,569. 강철은 이 설계가 337 (제품 280 + 설비 57) - 여유 84.
    · 원유: 펌프잭 2 = ~51/s, 쓰는 것 기본 정제 2 대 40/s. 새 정유 R 은 돌 때 20/s -> 셋이 다 돌면 60/s > 51 (잠깐). 평균은 1.5/s (5,500/시간).
    · 로보포트 (게임 프로토타입): 물류 반경 25 · 건설 반경 55 · 4x4 · 소비 최대 2.05MW (충전 4칸) · 대기 50kW · 버퍼 100MJ, 입력 한도 5MW.
      create_ghost_on_entity_death = true - 부서진 벽·포탑은 유령으로 남고 건설 로봇이 망 안 상자의 예비로 다시 세운다.
    · 로보포트용 고급회로: p28 OA 벨트 (y=-36 동향) 끝쪽 (34,-36) 에서 탭 - AC 2형 4 대 (x 13·21·25·33) 가 모두 지난 칸.

목표량 (로봇 50 · 수리팩 200 · 로보포트 4) 이 먹는 것:
    회로 750 (로봇 350 + 수리팩 400) = 철 750 · 구리선 2,250 (구리 1,125) | 톱니 450 (엔진 50 + 수리팩 400) = 철 900 | 관 100 | 강철 100 (엔진 50 · 프레임 50)
    배터리 100 = 철 100 · 구리 100 · 황산 2,000 (= 철 40 · 황 200 = 가스 3,000) | 윤활유 750 (= 중유 750)
    -> 정유 사이클: 가스 3,000 / 55 = 55 회 (275초), 중유는 30 회면 되니 가스가 병목. 원유 5,500 · 물 ~9,750.
    로보포트 4: 강철 180 · 톱니 180 (손제작, 철 360) · 고급회로 180 (탭).
    손 보급 합계: 철 1,890 (+ 로보포트 톱니 360) · 구리 1,225 · 강철 280 -> 입력 상자 SUPPLY (아래 표). 출력 상자에 한도 (bar) 가 없어서
    «손으로 넣은 만큼만 만든다» 가 한도다 (입력이 끝나면 선다) - 더 만들려면 더 넣는다. 벨트 공급은 다음 단계.

정유를 따로 두는 이유 · 배치형 (batch) 을 택한 이유:
    p26 RF1 · p28 RF2 는 기본 정제 (가스만). 고급 정제로 바꾸면 중유·경유 출구가 막혀 서고 화학팩 가스가 끊긴다 -> 로봇용 정유 R 한 대를 따로.
    R 의 출력: 중유 -> 윤활유 L -> 전기 엔진 (+ 윤활유 탱크 TU 가 넘치는 중유를 받는다) · 가스 -> 황 S2 (자기 가스, 기존 가스망과 안 섞음)
    · 경유 -> 탱크 TL (25,000) 에 쌓기만. 로봇 한 대에 가스 60 (1.09 사이클) · 윤활유 15 (0.6 사이클) -> 사이클마다 윤활유가 남고 (탱크로)
    경유 49/대. 경유 탱크가 차면 (로봇 ~510 대) R 이 선다 = 목표 50 의 10 배라 분해 공장 (light-oil-cracking) 은 다음 설계로 미룬다.
    교착 없음: 윤활유가 늘 가스보다 앞서 쌓이므로 «가스가 찼는데 윤활유가 비어 프레임이 선다» 는 시작 순간 뿐.

| 기계 | 레시피 | 속도 | 목표 50 대 걸리는 시간 |
|---|---|---|---|
| FR (2형) | 프레임 | 26.7초/개 | 22분 (병목) |
| EE (2형, 유체) | 전기 엔진 | 13.3초 | 11분 |
| EN (1형) · PA (1형) | 엔진 · 관 | 20초 · 1초/관 | 17분 |
| B (화학) · A · S2 · L | 배터리 · 황산 · 황 · 윤활유 | 4초 · 1 · 1 · 1 | 7분 · - |
| R (정유) | 고급 정제 | 5초 | 55 회 = 4.6분 |
| CB · C (1형) | 구리선 · 회로 | 회로 0.67/s | 750 개 19분 |
| G1 · G2 · R1 (1형) | 톱니 · 톱니 · 수리팩 | 톱니 1/s | 수리팩 200 ~17분 (회로를 로봇 줄 뒤에서 받는다) |
| RPA (1형) | 로보포트 | 10초 | 고급회로 180 이 오는 시간 = 6~24분 (AC 0.125~0.5/s) |

배치 - 블록 R 은 p28 블록 남쪽 빈 땅 (x 3..37, y -14..17, 나무·바위·자원 0) + 물은 호수 서쪽 끝 해안 펌프 (32,40):
    로봇 줄 (벨트 A y=-12 동향 x 9..33: 회로 N 레인 | 강철 S 레인):
      CB (5) -> C (9) -> [A 머리: 회로 팔 (9,-11) · 강철 상자 (10,-14) 팔 (10,-13)]
      G1 (13) -> EN (17) -> EE (21, 2형 남향: 윤활유 (21,-7)) -> FR (25, 2형) -> RB (29) -> R1 (33, 벨트 끝 = 회로 우선권 꼴찌)
      남쪽: PA (17,-5) -> EN · 배터리 B (25,-5 화학 남향, 황산 (26,-3)) -> FR · G2 (33,-5) -> R1
      출력 상자: 건설 로봇 (29,-6) · 수리팩 (36,-9)
    화학 줄 (y 5..7, 모두 남향 - 입구가 아래 = 정유 R 의 위쪽 출구와 한 칸 관으로 만난다):
      L 윤활유 (20,6) · S2 황 (26,6) -> 팔 (28,6) -> A 황산 (30,6)
      R 정유 (23,11) 북향: 중유 (21,8) -> L · 경유 (23,8) -> x=23 북향 -> 탱크 TL (26,1) · 가스 (25,8) -> S2
      윤활유 L (21,4) -> x=21 북향 -> EE (21,-7), 가지에 탱크 TU (19,0) · 황산 A (31,4) -> x=31 북향 -> y=-3 서향 -> B (26,-3)
    원유: 기존 원유 관 (x=-13 의 보통 관 (-13,1)) 에서 (-12,1) 가지 -> y=1 동향 -> x=3 남향 -> y=17 동향 -> (24,14) R 원유 입구
    물: 해안 펌프 (32,40) 남향 -> x=32 북향 -> y=9 서향 -> S2 · A, (32,15) 에서 y=15 서향 -> 지하관 (25->23, 원유 관 x=24 밑) -> (22,14) R 물 입구
    로보포트 조립기 RPA (34,-39): p28 OA 탭 (34,-36) 고급회로 + 상자 (31,-39) 강철·톱니 -> 출력 상자 (34,-42)
    북동 망 (ne_ports): 로보포트 4 - 가운데 좌표 RA (-24,-88) · RM (10,-80) · RB (36,-84) · RC (20,-40) · 저장 상자 (12,-80)
      포탑 줄 (y=-103 2열) 에서 남쪽 15~23 칸 (포탑이 막는 쪽). 이웃 체비셰프 거리 34 · 26 · 44 (< 50 = 물류 ±25 가 겹침) -> 한 망.
      건설 범위 (±55): 벽 y=-112.5 x -37.5..47.5 · 동쪽 모서리 x=47.5 · 북쪽 줄 두 열 x -46..38 · 동쪽 줄 x=44 y -102..12 를 덮는다
      (동쪽 줄 끝 18 · 24 두 대만 밖). 손으로: RM 에 건설 로봇 50 · 수리팩 200, 저장 상자에 포탑 10 · 돌벽 200 (예비).
    전력: 전봇대는 기존 망 (p28 y=-16 줄 · x=-12 회랑 · x=42 동쪽 줄 · p29 북쪽 줄 (x+0.5,-106.5)) 에서 욕심 배치 (p28 규칙, 전선 7.5) - 22 개.
      새 소비 최대 2.69MW (정유 420 · 화학 4 x 210 · 2형 2 x 155 · 1형 9 x 77.5 · 팔 28) -> 7.17 + 2.69 = 9.86MW (91%).
      로보포트 4 는 대기 4 x 50kW 지만 버퍼 100MJ 를 채울 때 대당 5MW (입력 한도) - 여유 ~1MW 로는 넷을 한꺼번에 못 채운다:
      한 대씩 (다음 대는 앞 대 버퍼가 찬 뒤) 세우거나 보일러·엔진 증설이 먼저.
    설비 재료 (--check 합, 로보포트 4 제외): 철 ~860 · 강철 57 · 구리 161 · 벽돌 10 · 고급회로 1 (저장 상자). 손제작 큰 부품: 정유 1 · 화학 공장 4
      · 조립기 2형 2 · 1형 9 · 저장 탱크 2 · 해안 펌프 1 · 저장 상자 1 (고급회로 1 = RPA 출력에서).

단계 (스텝): rp_poles 1 · rport 6 · r_poles 10 · row_a 20 · row_b 23 · belt 25 · c_poles 3 · chem 45 · oil 30 · water 31 · ne_poles 8 · ne_ports 5
    (clear 0 - 설계 칸에 나무·바위 없음, 막힘 0 = 게임 can_place 전부 통과 2026-09-26).
    ne_ports 는 로보포트를 허브가 아니라 RPA 출력 상자 (34,-42) 에서 가져가야 한다 (p1.fetch 는 허브만 본다 - 짓는 사람 가방에 먼저).

    python scripts/p30.py --check                    # 오프라인 확인 (SNAP · p25..p29 · ore23 · green23 예약 칸 · 유체 · 로보포트 망)
    python scripts/p30.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만: can_place)
    python scripts/p30.py --snapshot                 # 설계 둘레 기존 엔티티·바위·나무 -> SNAP/DEBRIS/TREES (게임 읽기만)
    python scripts/p30.py --draw                     # 글자 그림
    python scripts/p30.py --recipes --who golf       # 레시피 지정 (설계자는 돌리지 않았다)
    python scripts/p30.py --stage rport --who alpha,golf   # 짓기 (설계자는 돌리지 않았다)
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import p1    # noqa: E402
import p28   # noqa: E402  (도구: run · ug · prun · pline · arm_ends · lane_of · belt_map · trace · dead_ends · rot · SNAP_LUA · CODE)

N, E, S, W = 0, 4, 8, 12
VEC = p28.VEC
BELT, UG, INS, FAST, LONG, POLE, AM = p28.BELT, p28.UG, p28.INS, p28.FAST, p28.LONG, p28.POLE, p28.AM
AM2, CHEM, REF, TANK, PIPE, UGP = p28.AM2, p28.CHEM, p28.REF, p28.TANK, p28.PIPE, p28.UGP
CHEST, OPUMP, PORT, STORE = "iron-chest", "offshore-pump", "roboport", "storage-chest"
ARMS = p28.ARMS
BELTS = p28.BELTS
FLUIDS = {PIPE, UGP, REF, CHEM, AM2, TANK, OPUMP}
POWERED = {AM, AM2, INS, FAST, LONG, REF, CHEM, PORT}
KW = {**p28.KW, PORT: 2050}         # 로보포트: 충전 4칸 최대 (게임 34,167 J/틱). 버퍼 채울 때는 입력 한도 5MW 까지
POLE_WIRE = 7.5
LOGI, CONS = 25, 55                  # 로보포트 물류 · 건설 반경

# 레시피 (p28.made · want_of 가 이 설계 기계를 알게 - p29 와 같은 방식). 결과가 유체면 None (팔이 집을 것 없음)
for _k, _v in {
    "electric-engine-unit": ({"electronic-circuit", "engine-unit"}, "electric-engine-unit"),
    "flying-robot-frame": ({"steel-plate", "battery", "electronic-circuit", "electric-engine-unit"}, "flying-robot-frame"),
    "construction-robot": ({"electronic-circuit", "flying-robot-frame"}, "construction-robot"),
    "repair-pack": ({"iron-gear-wheel", "electronic-circuit"}, "repair-pack"),
    "roboport": ({"steel-plate", "iron-gear-wheel", "advanced-circuit"}, "roboport"),
    "battery": ({"iron-plate", "copper-plate"}, "battery"),
    "sulfuric-acid": ({"iron-plate", "sulfur"}, None),
    "sulfur": (set(), "sulfur"),
    "lubricant": (set(), None),
}.items():
    p28.RECIPE.setdefault(_k, _v)

# 유체 상자: 레시피마다 {상자 번호: 유체} (게임 fluidbox_prototypes 순서, 레시피에 fluidbox_index 없음 = 재료·결과 순서)
BOXES = {
    "advanced-oil-processing": {1: "water", 2: "crude-oil", 3: "heavy-oil", 4: "light-oil", 5: "petroleum-gas"},
    "lubricant": {1: "heavy-oil", 3: "lubricant"},
    "sulfur": {1: "water", 2: "petroleum-gas"},
    "sulfuric-acid": {1: "water", 3: "sulfuric-acid"},
    "battery": {1: "sulfuric-acid"},
    "electric-engine-unit": {1: "lubricant"},
}
FB = {**p28.FB,
      AM2: [((0, -1), N, "in", 1), ((0, 1), S, "out", 2)],
      TANK: [((-1, -1), N, "io", 1), ((-1, -1), W, "io", 1), ((1, 1), E, "io", 1), ((1, 1), S, "io", 1)],
      OPUMP: [((0, 0), S, "out", 1)]}

# 판으로 따진 값 (한 개당) - p28.COST 에 없는 것
COST = {**p28.COST,
        TANK: {"iron-plate": 20, "steel-plate": 5},
        PORT: {"steel-plate": 45, "iron-plate": 90, "advanced-circuit": 45},
        STORE: {"steel-plate": 8, "iron-plate": 3, "copper-plate": 4.5, "advanced-circuit": 1}}

# ---- 배치 상수 (타일. 홀수 크기는 가운데 타일, 짝수는 왼쪽 위 - 로보포트만 가운데로 적고 port() 가 바꾼다) ----
Y_A = -12                              # 벨트 A (동향)
ROW = -9                               # 로봇 줄 기계 가운데 y
CB_X, C_X, G1_X, EN_X, EE_X, FR_X, RB_X, R1_X = 5, 9, 13, 17, 21, 25, 29, 33
A_END = 33
Y_C = 6                                # 화학 줄 가운데 y
L_C, S2_C, A_C = (20, Y_C), (26, Y_C), (30, Y_C)
R_C = (23, 11)                         # 정유 (북향)
TL_C, TU_C = (26, 1), (19, 0)          # 경유 탱크 · 윤활유 탱크
CRUDE_TAP = (-12, 1)                   # 기존 원유 관 보통 관 (-13,1) 의 동쪽 칸
PUMP_AT = (32, 40)                     # 해안 펌프 (남향 = 남쪽 물에서 퍼 북쪽 (32,39) 로)
RPA = (34, -39)                        # 로보포트 조립기
PORTS = {"RA": (-24, -88), "RM": (10, -80), "RB": (36, -84), "RC": (20, -40)}   # 로보포트 가운데
STORE_AT = (12, -80)
PARK = (10.5, 3.5)                     # 공사 뒤 비켜 서는 곳 (블록 안 빈 땅)
TAPS = {(34, -36): "advanced-circuit"}           # p28 OA (고급회로만, AC 2형 4 대가 다 지난 칸)
# 입력 상자 손 보급 (목표 50 · 200 · 4) - --check 가 합계를 찍는다
SUPPLY = {(5, -6): {"copper-plate": 1125}, (9, -6): {"iron-plate": 750}, (10, -14): {"steel-plate": 100},
          (13, -13): {"iron-plate": 100}, (17, -2): {"iron-plate": 100}, (22, -5): {"iron-plate": 100, "copper-plate": 100},
          (30, -5): {"iron-plate": 800}, (30, 3): {"iron-plate": 40},
          (31, -39): {"steel-plate": 180, "iron-gear-wheel": 180}}


def ent(name, x, y, d=None, **kw):
    e = {"name": name, "x": x, "y": y}
    if d is not None:
        e["d"] = d
    e.update(kw)
    return e


def port(cx, cy):
    return ent(PORT, cx - 2, cy - 2, c=(cx, cy))


def dims(e):
    return (4, 4) if e["name"] == PORT else p28.dims(e)


def _span(v, s):
    return list(range(v - s // 2, v + s // 2 + 1)) if s % 2 else list(range(v, v + s))


def tiles(e):
    w, h = dims(e)
    return [(x, y) for x in _span(e["x"], w) for y in _span(e["y"], h)]


def pos(e):
    w, h = dims(e)
    return (e["x"] + (0.5 if w % 2 else w / 2), e["y"] + (0.5 if h % 2 else h / 2))


run, ug, pline = p28.run, p28.ug, p28.pline
arm_ends = p28.arm_ends


def inbox(x, y, *items):
    return ent(CHEST, x, y, items=tuple(items))


def outbox(x, y, item):
    return ent(CHEST, x, y, out=item)


def pipes(pts):
    return pline(pts)


# ------------------------------------------------------------------ 배치 (순수)

def rport():
    """로보포트 조립기 RPA: 고급회로는 p28 OA (34,-36) 탭 (조립기가 제 몫 ~2 회분만 당겨 화학팩 줄 손실은 로보포트 수만큼),
    강철·톱니는 상자 (31,-39) 손 보급 -> 출력 상자 (34,-42) (QS y=-43 바로 위, 짓는 사람이 집어 간다)."""
    x, y = RPA
    return [ent(AM, x, y, recipe="roboport"), ent(INS, x, y + 2, S),
            inbox(x - 3, y, "steel-plate", "iron-gear-wheel"), ent(INS, x - 2, y, W),
            ent(INS, x, y - 2, S), outbox(x, y - 3, "roboport")]


def row_a():
    """CB -> C (회로 -> 벨트 A 북 레인) · 강철 상자 -> A 남 레인 · G1 -> EN <- PA."""
    y = ROW
    out = [ent(AM, CB_X, y, recipe="copper-cable"), ent(INS, CB_X + 2, y, W),
           ent(INS, CB_X, y + 2, S), inbox(CB_X, y + 3, "copper-plate")]
    out += [ent(AM, C_X, y, recipe="electronic-circuit"), ent(INS, C_X, y + 2, S), inbox(C_X, y + 3, "iron-plate"),
            ent(INS, C_X, y - 2, S)]                                         # 회로 -> A (남쪽에서 놓음 = 북 레인)
    out += [ent(INS, C_X + 1, Y_A - 1, N), inbox(C_X + 1, Y_A - 2, "steel-plate")]   # 강철 -> A (북쪽에서 = 남 레인)
    out += [ent(AM, G1_X, y, recipe="iron-gear-wheel"), ent(LONG, G1_X, y - 2, N), inbox(G1_X, Y_A - 1, "iron-plate"),
            ent(INS, G1_X + 2, y, W)]                                        # 톱니 -> EN
    out += [ent(AM, EN_X, y, recipe="engine-unit"), ent(INS, EN_X, y - 2, N),  # A 에서 강철
            ent(INS, EN_X, y + 2, S), ent(AM, EN_X, y + 4, recipe="pipe"),     # PA 관 -> EN
            ent(INS, EN_X, y + 6, S), inbox(EN_X, y + 7, "iron-plate")]
    return out


def row_b():
    """EE (2형 남향, 윤활유는 아래 (21,-7)) -> FR (2형) -> RB -> 출력 상자 · B (배터리, 남향 - 황산 (26,-3)) -> FR · G2 -> R1 -> 출력 상자.
    B 의 동쪽 면 (x=27) 은 비워 둔다 (걸어 닿는 통로)."""
    y = ROW
    out = [ent(INS, EN_X + 2, y, W), ent(AM2, EE_X, y, S, recipe="electric-engine-unit"), ent(INS, EE_X, y - 2, N)]
    out += [ent(INS, EE_X + 2, y, W), ent(AM2, FR_X, y, recipe="flying-robot-frame"), ent(INS, FR_X, y - 2, N),
            ent(INS, FR_X, y + 2, S), ent(CHEM, FR_X, y + 4, S, recipe="battery"),
            ent(INS, FR_X - 2, y + 4, W), inbox(FR_X - 3, y + 4, "iron-plate", "copper-plate")]
    out += [ent(INS, FR_X + 2, y, W), ent(AM, RB_X, y, recipe="construction-robot"), ent(INS, RB_X, y - 2, N),
            ent(INS, RB_X, y + 2, N), outbox(RB_X, y + 3, "construction-robot")]
    out += [ent(AM, R1_X, y, recipe="repair-pack"), ent(INS, R1_X, y - 2, N), ent(INS, R1_X, y + 2, S),
            ent(AM, R1_X, y + 4, recipe="iron-gear-wheel"), ent(INS, R1_X - 2, y + 4, W), inbox(R1_X - 3, y + 4, "iron-plate"),
            ent(INS, R1_X + 2, y, W), outbox(R1_X + 3, y, "repair-pack")]
    return out


def belt():
    """벨트 A: (9,-12) 부터 (33,-12) 까지 동향, 막다른 끝 (강철 레인은 끝에서 선다)."""
    return run(C_X, Y_A, A_END, Y_A, E)


def chem():
    """L · S2 · A (남향) + 탱크 둘 + 관: 중유 · 가스 (R 과 한 칸) · 경유 x=23 · 윤활유 x=21 · 황산 x=31 -> y=-3."""
    out = [ent(CHEM, *L_C, S, recipe="lubricant"), ent(CHEM, *S2_C, S, recipe="sulfur"),
           ent(CHEM, *A_C, S, recipe="sulfuric-acid"),
           ent(INS, A_C[0] - 2, Y_C, W),                                     # S2 황 -> A
           ent(INS, A_C[0], Y_C - 2, N), inbox(A_C[0], Y_C - 3, "iron-plate"),
           ent(TANK, *TL_C, N, fluid="light-oil"), ent(TANK, *TU_C, N, fluid="lubricant")]
    out += [ent(PIPE, 21, 8), ent(PIPE, 25, 8)]                              # 중유 R->L · 가스 R->S2
    out += pipes([(23, 8), (23, 0), (24, 0)])                                # 경유 -> TL 서쪽 입구
    out += pipes([(21, 4), (21, -7)])                                        # 윤활유 -> EE (가지 (21,1) = TU 동쪽 입구)
    out += pipes([(31, 4), (31, -3), (26, -3)])                              # 황산 -> B
    return out


def oil():
    """정유 R (고급 정제, 북향) + 원유 가지 (기존 (-13,1) -> R (24,14))."""
    return [ent(REF, *R_C, N, recipe="advanced-oil-processing")] + pipes([CRUDE_TAP, (3, 1), (3, 17), (24, 17), (24, 14)])


def water():
    """해안 펌프 -> x=32 북향 -> y=9 서향 (S2 (27,8) · A (31,8)) · (32,15) -> y=15 서향 -> 지하관 (원유 x=24 밑) -> R (22,14)."""
    out = [ent(OPUMP, *PUMP_AT, S)] + pipes([(32, 39), (32, 15), (32, 9), (27, 9), (27, 8)]) + [ent(PIPE, 31, 8)]
    out += pipes([(31, 15), (26, 15)]) + [ent(UGP, 25, 15, E), ent(UGP, 23, 15, W), ent(PIPE, 22, 15), ent(PIPE, 22, 14)]
    return out


def ne_ports():
    """북동 망: 로보포트 4 + 저장 상자 (RM 동쪽). 전봇대는 ne_poles."""
    return [port(*c) for c in PORTS.values()] + [ent(STORE, *STORE_AT)]


PIECES = (("rport", rport), ("row_a", row_a), ("row_b", row_b), ("belt", belt), ("chem", chem), ("oil", oil),
          ("water", water), ("ne_ports", ne_ports))
POLED = {"rport": "rp_poles", "row_a": "r_poles", "row_b": "r_poles", "belt": "r_poles",
         "chem": "c_poles", "oil": "c_poles", "water": "c_poles", "ne_ports": "ne_poles"}
POLE_GROUPS = ("rp_poles", "r_poles", "c_poles", "ne_poles")
# 로보포트 조립기가 먼저 (고급회로 탭이 오래 걸린다) -> 로봇 줄 -> 화학·정유·물 -> 북동 망 (로보포트 4 가 나오면)
ORDER = ("clear", "rp_poles", "rport", "r_poles", "row_a", "row_b", "belt", "c_poles", "chem", "oil", "water",
         "ne_poles", "ne_ports")


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p30.py --snapshot 이 찍는다 (2026-09-26, tick 11.42M). 설계 칸 ±4 (전봇대는 ±12). 형식은 p28 과 같다.
SNAP = """
    A:11,-19,13,-17 A:14,-19,16,-17 A:17,-19,19,-17 A:28,-34,30,-32 A:32,-34,34,-32 A:5,-19,7,-17 A:8,-19,10,-17
    P:-13,-1,-13,-1 P:-13,0,-13,0 P:-13,1,-13,1 P:-13,2,-13,2 P:-13,3,-13,3 P:38,-1,38,-1 P:38,-11,38,-11
    P:38,-12,38,-12 P:38,-33,38,-33 P:38,-34,38,-34 P:38,-44,38,-44 P:38,-45,38,-45 P:38,0,38,0 R:13,-88,16,-86
    X:-14,-10,1,-2 b:-15,-1,-15,-1:8 b:-15,-2,-15,-2:8 b:-15,-3,-15,-3:8 b:-15,0,-15,0:8 b:-15,1,-15,1:8
    b:-15,2,-15,2:8 b:-15,3,-15,3:8 b:-15,4,-15,4:8 b:-15,5,-15,5:8 b:10,-15,10,-15:12 b:11,-15,11,-15:12
    b:12,-15,12,-15:12 b:13,-15,13,-15:12 b:14,-15,14,-15:12 b:14,-36,14,-36:4 b:14,-43,14,-43:4 b:15,-15,15,-15:12
    b:15,-36,15,-36:4 b:15,-43,15,-43:4 b:16,-15,16,-15:12 b:16,-36,16,-36:4 b:16,-43,16,-43:4 b:17,-15,17,-15:12
    b:17,-36,17,-36:4 b:17,-43,17,-43:4 b:18,-15,18,-15:12 b:18,-36,18,-36:4 b:18,-43,18,-43:4 b:19,-15,19,-15:12
    b:19,-36,19,-36:4 b:19,-43,19,-43:4 b:20,-15,20,-15:12 b:20,-36,20,-36:4 b:20,-43,20,-43:4 b:21,-15,21,-15:12
    b:21,-36,21,-36:4 b:21,-43,21,-43:4 b:22,-15,22,-15:12 b:22,-36,22,-36:4 b:22,-43,22,-43:4 b:23,-15,23,-15:12
    b:23,-36,23,-36:4 b:23,-43,23,-43:4 b:24,-15,24,-15:12 b:24,-36,24,-36:4 b:24,-43,24,-43:4 b:25,-15,25,-15:12
    b:25,-36,25,-36:4 b:25,-43,25,-43:4 b:26,-15,26,-15:12 b:27,-15,27,-15:12 b:27,-36,27,-36:4 b:27,-43,27,-43:4
    b:28,-15,28,-15:12 b:28,-36,28,-36:4 b:28,-43,28,-43:4 b:29,-36,29,-36:4 b:29,-43,29,-43:4 b:30,-36,30,-36:4
    b:30,-43,30,-43:4 b:31,-36,31,-36:4 b:31,-43,31,-43:4 b:32,-36,32,-36:4 b:32,-43,32,-43:4 b:33,-36,33,-36:4
    b:33,-43,33,-43:4 b:34,-36,34,-36:4 b:34,-43,34,-43:4 b:35,-36,35,-36:4 b:35,-43,35,-43:4 b:36,-32,36,-32:8
    b:36,-33,36,-33:8 b:36,-34,36,-34:8 b:36,-36,36,-36:4 b:36,-38,36,-38:8 b:36,-39,36,-39:8 b:36,-40,36,-40:8
    b:36,-41,36,-41:8 b:36,-42,36,-42:8 b:36,-43,36,-43:8 b:37,-32,37,-32:8 b:37,-33,37,-33:8 b:37,-34,37,-34:8
    b:37,-35,37,-35:8 b:37,-36,37,-36:8 b:41,-79,41,-79:8 b:41,-80,41,-80:8 b:41,-81,41,-81:8 b:41,-82,41,-82:8
    b:41,-83,41,-83:8 b:41,-84,41,-84:8 b:41,-85,41,-85:8 b:41,-86,41,-86:8 b:41,-87,41,-87:8 b:41,-88,41,-88:8
    b:41,-89,41,-89:8 b:41,-90,41,-90:8 b:5,-15,5,-15:12 b:6,-15,6,-15:12 b:7,-15,7,-15:12 b:8,-15,8,-15:12
    b:9,-15,9,-15:12 i:12,-16,12,-16:0 i:15,-16,15,-16:0 i:18,-16,18,-16:0 i:21,-16,21,-16:0 i:21,-35,21,-35:8
    i:24,-16,24,-16:0 i:25,-35,25,-35:8 i:27,-16,27,-16:0 i:31,-33,31,-33:12 i:33,-35,33,-35:8 i:6,-16,6,-16:0
    i:9,-16,9,-16:0 p:-12,9,-12,9:2 p:-22,-9,-22,-9:2 p:-33,-77,-33,-77:2 p:-33,-83,-33,-83:2 p:-33,-89,-33,-89:2
    p:-35,-75,-35,-75:2 p:-38,-75,-38,-75:2 p:0,-24,0,-24:2 p:12,-26,12,-26:2 p:12,-31,12,-31:2 p:13,-20,13,-20:2
    p:14,-16,14,-16:2 p:15,-34,15,-34:2 p:16,-24,16,-24:2 p:19,-20,19,-20:2 p:19,-32,19,-32:2 p:20,-16,20,-16:2
    p:20,-25,20,-25:2 p:23,-33,23,-33:2 p:24,-24,24,-24:2 p:25,-20,25,-20:2 p:26,-16,26,-16:2 p:27,-32,27,-32:2
    p:28,-26,28,-26:2 p:31,-23,31,-23:2 p:31,-32,31,-32:2 p:34,-35,34,-35:2 p:4,-26,4,-26:2 p:42,-11,42,-11:2
    p:42,-17,42,-17:2 p:42,-29,42,-29:2 p:42,-35,42,-35:2 p:42,-41,42,-41:2 p:42,-47,42,-47:2 p:42,-5,42,-5:2
    p:42,-53,42,-53:2 p:42,-71,42,-71:2 p:42,-77,42,-77:2 p:42,-83,42,-83:2 p:42,-89,42,-89:2 p:42,-95,42,-95:2
    p:42,1,42,1:2 p:42,13,42,13:2 p:42,19,42,19:2 p:42,25,42,25:2 p:42,7,42,7:2 p:7,-20,7,-20:2 p:8,-16,8,-16:2
    p:8,-23,8,-23:2 p:8,-32,8,-32:2 u:36,-35,36,-35:8:o u:36,-37,36,-37:8:i
"""
DEBRIS = [
    ('crash-site-spaceship', -5.0, -6.0, -14, -10, 1, -2),
    ('huge-rock', 14.563, -86.188, 13, -88, 16, -86),
]
TREES = [
]
# 기존 관에 일부러 붙이는 칸: 새 관 칸 -> {닿는 기존 칸: 유체}
FLUID_JOIN = {CRUDE_TAP: {(-13, 1): "crude-oil"}}

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


_RES = None


def reserved() -> dict:
    """p25 · p26 · p27 (p28.reserved) + p28 · p29 · ore23 stages() + green23 steps() 의 build 칸 -> 이름."""
    global _RES
    if _RES is not None:
        return _RES
    import p29
    import ore23
    import green23
    out = dict(p28.reserved())
    for tag, sts in (("p28", p28.stages()), ("p29", p29.stages()), ("ore23", ore23.stages()),
                     ("green23", {"green": green23.steps()})):
        for name, steps in sts.items():
            for k, p in steps:
                if k != "build":
                    continue
                w, h = dims({"name": p["name"], "d": p.get("direction", N)})
                x0, y0 = math.floor(p["x"] - w / 2 + 0.01), math.floor(p["y"] - h / 2 + 0.01)
                for x in range(x0, x0 + w):
                    for y in range(y0, y0 + h):
                        out[(x, y)] = f"{tag} {name} {p['name']}"
    _RES = out
    return out


def occupancy(ents):
    occ, clash = {}, []
    for e in ents:
        for t in tiles(e):
            if t in occ:
                clash.append((t, occ[t]["name"], e["name"]))
            occ[t] = e
    return occ, clash


def walk_sides(ents, full) -> dict:
    """큰 설비 (정유 · 화학 공장) 마다 네 변 중 비어 있는 변 (전봇대가 막지 않게 먼저 잡는다)."""
    out = {}
    for e in ents:
        if e["name"] not in (REF, CHEM):
            continue
        ts = tiles(e)
        xs, ys = [t[0] for t in ts], [t[1] for t in ts]
        sides = {"W": [(min(xs) - 1, y) for y in set(ys)], "E": [(max(xs) + 1, y) for y in set(ys)],
                 "N": [(x, min(ys) - 1) for x in set(xs)], "S": [(x, max(ys) + 1) for x in set(xs)]}
        out[id(e)] = (e, {k: v for k, v in sides.items() if not any(t in full for t in v)})
    return out


def place_poles(group, occ, net, keep, reach=POLE_WIRE):
    """소형 전봇대 욕심 배치 (p28.place_poles 와 같은 규칙, 이 설계의 SNAP · 예약 칸 · 통로를 피한다)."""
    need = [e for e in group if e["name"] in POWERED]
    if not need:
        return []
    sn = snap()
    arm_spots = {t for e in occ.values() if e["name"] in ARMS for t in arm_ends(e)}
    blocked_ = set(sn["tiles"]) | set(occ) | set(debris_tiles()) | arm_spots | set(reserved()) | keep
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
                                            -min(math.dist(c, pos(need[i])) for i in todo), c))
            if covers[best] & todo:
                chosen.append(best)
                todo -= covers[best]
                reach_set |= {c for c in cand if math.dist(c, best) <= reach}
                continue
        tgt = min((pos(need[i]) for i in todo), key=lambda q: min(math.dist(q, p) for p in net + chosen))
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
    """단계 순서대로 {이름: 엔티티}. 전봇대는 무리마다 앞 무리 + 기존 망에서 이어 욕심 배치."""
    st = {k: f() for k, f in PIECES}
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    full = set(occ) | set(snap()["tiles"]) | set(reserved())
    keep = {t for _e, sides in walk_sides(ents, full).values() for t in (next(iter(sides.values()), []))}
    net = list(snap()["poles"])
    groups = {}
    for k, _f in PIECES:
        groups.setdefault(POLED[k], []).extend(st[k])
    order = {}
    for pname in POLE_GROUPS:
        ps = place_poles(groups.get(pname, []), occ, net, keep)
        net += ps
        for x, y in ps:
            occ[(x, y)] = ent(POLE, x, y)
        order[pname] = [ent(POLE, x, y) for x, y in ps]
    order.update(st)
    return {k: order[k] for k in ORDER if order.get(k)}


# ------------------------------------------------------------------ 유체 (레시피별 상자)

def conns(e):
    """(칸, 방향, 역할, 상자, 'n'|'u'). 관은 네 방향, 지하관은 위 한 방향 + 땅속, 기계는 FB (레시피가 유체를 안 쓰는 2형은 없음)."""
    d = e.get("d", N)
    if e["name"] == PIPE:
        return [((e["x"], e["y"]), k, "io", 1, "n") for k in (N, E, S, W)]
    if e["name"] == UGP:
        return [((e["x"], e["y"]), d, "io", 1, "n"), ((e["x"], e["y"]), (d + 8) % 16, "io", 1, "u")]
    if e["name"] == AM2 and e.get("recipe") not in BOXES:
        return []
    px, py = pos(e)
    out = []
    for rel, cd, role, box in FB.get(e["name"], []):
        rx, ry = p28.rot(rel, d)
        out.append(((math.floor(px + rx), math.floor(py + ry)), (cd + d) % 16, role, box, "n"))
    return out


def box_fluid(e, box):
    """상자에 드는 유체 (None = 안 쓰는 상자)."""
    if e["name"] in (REF, CHEM, AM2):
        return BOXES.get(e.get("recipe"), {}).get(box)
    if e["name"] == TANK:
        return e.get("fluid")
    if e["name"] == OPUMP:
        return "water"
    return None


def fluid_check(ents) -> list:
    """이음 (새 관끼리 · 기존 관은 FLUID_JOIN 만) · 안 쓰는 상자에 관 0 · 망마다 유체 하나 · 입구마다 그 유체를 만드는 쪽 · 출구마다 받는 쪽."""
    fl = [e for e in ents if e["name"] in FLUIDS and conns(e)]
    at = {}
    for i, e in enumerate(fl):
        for t, cd, role, box, kind in conns(e):
            if kind == "n":
                at[(t, cd)] = (i, box)
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        parent[find(a)] = find(b)

    bad, joins, linked = [], [], set()
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
                union(node, other)
                linked |= {node, other}
            elif sn["tiles"].get(nb) in ("P", "Q", "E"):
                if nb in FLUID_JOIN.get(t, {}):
                    joins.append((node, FLUID_JOIN[t][nb]))
                    linked.add(node)
                else:
                    bad.append(f"{e['name']} {t} 이 기존 {sn['tiles'][nb]} {nb} 에 닿는다 (FLUID_JOIN 에 없다)")
    for t, nbs in FLUID_JOIN.items():
        if not any(e["name"] == PIPE and (e["x"], e["y"]) == t for e in fl):
            bad.append(f"FLUID_JOIN {t}: 새 관이 없다")
        for nb in nbs:
            if sn["tiles"].get(nb) != "P":
                bad.append(f"FLUID_JOIN {t} -> {nb}: 스냅숏에 기존 관이 없다 ({sn['tiles'].get(nb)})")
    fluid, made_, size = {}, {}, {}
    for node, what in joins:
        fluid.setdefault(find(node), set()).add(what)
        made_.setdefault(find(node), set()).add(what)
    for i, e in enumerate(fl):
        for _t, _cd, role, box, _k in conns(e):
            size[find((i, box))] = size.get(find((i, box)), 0) + 1
            f = box_fluid(e, box)
            if e["name"] in (REF, CHEM, AM2) and f is None:
                if (i, box) in linked:
                    bad.append(f"{e.get('recipe')} ({e['x']},{e['y']}): 안 쓰는 상자 {box} 에 관이 닿는다")
                continue
            if f is None:
                continue
            fluid.setdefault(find((i, box)), set()).add(f)
            if role == "out" or e["name"] == OPUMP:
                made_.setdefault(find((i, box)), set()).add(f)
    for root, fs in fluid.items():
        if len(fs) > 1:
            bad.append(f"유체 섞임: {sorted(fs)}")
    for i, e in enumerate(fl):
        if e["name"] in (PIPE, UGP):
            if not fluid.get(find((i, 1))):
                bad.append(f"빈 관 {e['x'], e['y']} (어느 유체에도 안 이어짐)")
            continue
        for _t, _cd, role, box, _k in conns(e):
            f = box_fluid(e, box)
            if f is None or e["name"] == TANK:
                continue
            root = find((i, box))
            if role == "in" and f not in made_.get(root, set()):
                bad.append(f"{e.get('recipe', e['name'])} ({e['x']},{e['y']}): 입구 {box} ({f}) 에 만드는 쪽이 없다")
            if role == "out" and (i, box) not in linked:
                bad.append(f"{e.get('recipe', e['name'])} ({e['x']},{e['y']}): 출구 {box} ({f}) 가 안 이어졌다")
    for i, e in enumerate(fl):
        if e["name"] == TANK:
            root = find((i, 1))
            if e.get("fluid") not in made_.get(root, set()):
                bad.append(f"탱크 {e['x'], e['y']} ({e.get('fluid')}) 에 들어오는 쪽이 없다")
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
                if q != p and math.dist(p, q) <= POLE_WIRE and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    return {p: label[p] for p in new}


def in_chests(ents):
    return {(e["x"], e["y"]): set(e["items"]) for e in ents if e["name"] == CHEST and e.get("items")}


def _trace(st):
    """p28.trace 를 이 설계로: 상자·로보포트·펌프를 빼고, 입력 상자는 TAPS 로 (p29 와 같은 방식으로 잠깐 바꿨다 되돌린다)."""
    ents = [e for v in st.values() for e in v]
    chests = in_chests(ents)
    tst = {k: [e for e in v if e["name"] not in (CHEST, STORE, PORT, OPUMP, REF)] for k, v in st.items()}
    saved_t, saved_s = dict(p28.TAPS), dict(p28.SINKS)
    p28.TAPS.clear()
    p28.TAPS.update(TAPS)
    p28.TAPS.update({t: next(iter(v)) for t, v in chests.items() if len(v) == 1})
    p28.SINKS.clear()
    try:
        lanes, probs = p28.trace(tst)
        tents = [e for v in tst.values() for e in v]
        probs = probs + p28.dead_ends(tents, p28.occupancy(tents)[0], lanes)
        return lanes, probs
    finally:
        p28.TAPS.clear()
        p28.TAPS.update(saved_t)
        p28.SINKS.clear()
        p28.SINKS.update(saved_s)


def check(st) -> list:
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, clash = occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    deb = debris_tiles()
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']} / {sn['tiles'][t]}" for t in occ
            if t in sn["tiles"] and sn["tiles"][t] not in ("R", "X")]
    bad += [f"바위·잔해 {t} 가 DEBRIS 에 없다" for t in occ if sn["tiles"].get(t) in ("R", "X") and t not in deb]
    res = reserved()
    bad += [f"예약 칸과 겹침 {t}: {occ[t]['name']} / {res[t]}" for t in occ if t in res]
    lanes, probs = _trace(st)
    bad += probs
    belt_ = p28.belt_map(ents)
    got = {}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        at = (a["x"], a["y"])
        if dk in res:
            bad.append(f"팔 {at} 이 예약 칸 {dk} ({res[dk]}) 에 놓는다")
        if sk in res and sk not in TAPS:
            bad.append(f"팔 {at} 이 예약 칸 {sk} ({res[sk]}) 에서 집는다 (TAPS 에 없다)")
        for t in (sk, dk):
            if sn["tiles"].get(t) in ("R", "X") and t not in deb:
                bad.append(f"팔 {at}: {t} 에 바위·잔해 - DEBRIS 에 없다")
        src = occ.get(sk)
        if src is not None and src["name"] == CHEST:
            if not src.get("items"):
                bad.append(f"팔 {at}: 출력 상자 {sk} 에서 집는다")
                continue
            have = set(src["items"])
        elif src is not None:
            have = (lanes[sk]["L"] | lanes[sk]["R"]) if src["name"] in BELTS else {p28.made(src)} - {None}
        elif sk in TAPS:
            have = {TAPS[sk]}
            if sn["belts"].get(sk) is None and res.get(sk) is None:
                bad.append(f"팔 {at}: 탭 {sk} 에 기존 벨트가 없다 ({sn['tiles'].get(sk)})")
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
            use = p28.want_of(dst) & have
            if not use:
                bad.append(f"팔 {at}: {dst.get('recipe')} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(use)
        elif dst["name"] == CHEST:
            if not dst.get("out"):
                bad.append(f"팔 {at}: 입력 상자 {dk} 에 놓는다")
            elif dst["out"] not in have:
                bad.append(f"팔 {at}: 출력 상자 {dk} ({dst['out']}) 에 오는 것은 {sorted(have)}")
        elif dst["name"] not in BELTS:
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for m in (e for e in ents if e["name"] in (AM, AM2, CHEM)):
        lack = p28.want_of(m) - got.get(id(m), set())
        if lack:
            bad.append(f"{m['recipe']} ({m['x']},{m['y']}): 모자람 {sorted(lack)}")
    for k, e in belt_.items():                     # 기존 줄과 엉킴
        if e["name"] == UG and e.get("kind") == "input":
            continue
        vx, vy = VEC[e["d"]]
        if (k[0] + vx, k[1] + vy) not in belt_ and (k[0] + vx, k[1] + vy) in sn["belts"]:
            bad.append(f"벨트 {k} 가 기존 벨트 {(k[0] + vx, k[1] + vy)} 로 흘러든다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        if (k[0] + vx, k[1] + vy) in belt_:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {(k[0] + vx, k[1] + vy)} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    ps = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + list(sn["poles"])
    for e in ents:                                 # 작은 전봇대 공급 5x5 (가운데 ±2 칸) 가 기계 칸과 «겹쳐야» 한다
        if e["name"] in POWERED and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    for p, ns in pole_nets(st).items():
        if not ns:
            bad.append(f"전봇대 {p}: 기존 망에 안 닿는다 ({POLE_WIRE})")
    full = set(occ) | {t for t, k in sn["tiles"].items() if k not in ("R", "X")} | set(res)
    for e, sides in walk_sides(ents, full).values():
        if not sides:
            bad.append(f"통로 없음: {e.get('recipe', e['name'])} {e['x'], e['y']} 네 변 모두 막힘")
    bad += fluid_check(ents)
    bad += port_check(st)[0]
    for k, v in stages().items():
        if len(v) > 64:
            bad.append(f"단계 {k}: {len(v)} 스텝 > 64")
    return bad


# ------------------------------------------------------------------ 북동 망 (순수)

WALL_N = [(x + 0.5, -112.5) for x in range(-38, 48, 5)] + [(47.5, -112.5)]      # 돌벽 (게임: 112 개 x -37.5..47.5, y -112.5..-86.5)
WALL_E = [(47.5, y + 0.5) for y in range(-113, -86, 5)]
TUR_N1 = [(x, -108) for x in range(-46, 39, 6)]                                   # 북쪽 줄 (p29 N_XS 동쪽 절반)
TUR_N2 = [(x, -103) for x in range(-40, 39, 6)]                                   # 2열
TUR_E = [(44, y) for y in range(-102, 25, 6)]                                     # 동쪽 줄 (p29)


def port_check(st) -> tuple:
    """로보포트 물류 사각 (±25) 이 이웃과 겹쳐 한 망 · 저장 상자가 물류 안 · 벽·포탑이 건설 사각 (±55) 안. (문제, 요약)."""
    ports = [e["c"] for v in st.values() for e in v if e["name"] == PORT]
    bad, info = [], []
    if not ports:
        return bad, info
    comp = {0}
    changed = True
    while changed:
        changed = False
        for i, p in enumerate(ports):
            if i not in comp and any(max(abs(p[0] - ports[j][0]), abs(p[1] - ports[j][1])) < 2 * LOGI for j in comp):
                comp.add(i)
                changed = True
    if len(comp) != len(ports):
        bad.append(f"로보포트 망이 끊겼다: {[ports[i] for i in range(len(ports)) if i not in comp]}")
    for e in (e for v in st.values() for e in v if e["name"] == STORE):
        if not any(max(abs(e["x"] + 0.5 - p[0]), abs(e["y"] + 0.5 - p[1])) <= LOGI for p in ports):
            bad.append(f"저장 상자 {e['x'], e['y']} 이 물류 범위 밖")

    def covered(q):
        return any(max(abs(q[0] - p[0]), abs(q[1] - p[1])) <= CONS for p in ports)

    for name, pts, must in (("벽 북", WALL_N, True), ("벽 동", WALL_E, True), ("북쪽 줄", TUR_N1, True),
                            ("2열", TUR_N2, True), ("동쪽 줄", TUR_E, False)):
        miss = [q for q in pts if not covered(q)]
        if must and miss:
            bad.append(f"건설 범위 밖 {name}: {miss[:4]}")
        info.append(f"{name} {len(pts) - len(miss)}/{len(pts)}" + (f" (밖 {miss})" if miss else ""))
    for p in ports:
        if p[1] < -103 + 10 and p[0] < 40:
            bad.append(f"로보포트 {p} 가 포탑 2열 (y=-103) 에서 10칸 안")
    xs = [p[0] for p in ports]
    ys = [p[1] for p in ports]
    info.append(f"건설 사각 합 x {min(xs) - CONS}..{max(xs) + CONS} · y {min(ys) - CONS}..{max(ys) + CONS}")
    return bad, info


# ------------------------------------------------------------------ 단계 (게임 step)

def steps_of(ents):
    out = []
    for e in ents:
        x, y = pos(e)
        p = {"name": e["name"], "x": x, "y": y}
        if "d" in e:
            p["direction"] = e["d"]
        if "kind" in e:
            p["type"] = e["kind"]          # 지하벨트 출구는 "output" (안 넣으면 입구로 선다 - 실측)
        out.append(("build", p))
    return out


def clear_steps(st):
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


_STAGES = None


def stages():
    global _STAGES
    if _STAGES is not None:
        return _STAGES
    st = layout()
    out = {"clear": clear_steps(st)}
    rank = {POLE: 0, PORT: 0, REF: 0, CHEM: 0, TANK: 0, OPUMP: 0, AM2: 1, AM: 1, STORE: 1, PIPE: 2, UGP: 2,
            INS: 3, LONG: 3, FAST: 3, CHEST: 3, UG: 4, BELT: 5}
    for k, v in st.items():
        out[k] = steps_of(sorted(v, key=lambda e: rank.get(e["name"], 6)))    # 비싼 설비 먼저
    _STAGES = {k: out[k] for k in ORDER if out.get(k)}
    return _STAGES


def counts(st):
    n = {}
    for v in st.values():
        for e in v:
            key = e["name"] if e["name"] not in (AM, AM2, CHEM, REF) else f"{e['name']}:{e.get('recipe')}"
            n[key] = n.get(key, 0) + 1
    return n


def plates(ents):
    t = {}
    for e in ents:
        for m, k in COST.get(e["name"], {}).items():
            t[m] = t.get(m, 0) + k
    return t


def power_kw(ents):
    return sum(KW.get(e["name"], 0) for e in ents if e["name"] != PORT)


def draw(st, box):
    x1, y1, x2, y2 = box
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    sn = snap()
    ch = {BELT: None, UG: "u", INS: "i", FAST: "f", LONG: "l", POLE: "+", AM: "A", AM2: "B", CHEM: "H", REF: "R",
          TANK: "T", PIPE: "p", UGP: "q", CHEST: "c", OPUMP: "O", PORT: "P", STORE: "s"}
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

def snapshot(ai):
    """설계 칸 ±4 (전봇대 ±12) 의 기존 엔티티 -> SNAP · DEBRIS, 설계·팔 칸의 나무 -> TREES (p28.snapshot 과 같은 형식, 이 설계의 칸으로)."""
    global _SNAP
    _SNAP = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}}
    st = {k: f() for k, f in PIECES}
    allts, rows = set(), []
    for v in st.values():
        ts = {t for e in v for t in tiles(e)} | {t for e in v if e["name"] in ARMS for t in arm_ends(e)}
        allts |= ts
        xs, ys = [t[0] for t in ts], [t[1] for t in ts]
        y = min(ys) - 13
        while y <= max(ys) + 13:
            reply = ai.lua(p28.SNAP_LUA % (min(xs) - 13, y, max(xs) + 14, min(y + 40, max(ys) + 14)))
            rows += [str(r) for r in p1._rows(reply)]
            y += 40
    near = {(x + dx, y + dy) for x, y in allts for dx in range(-4, 5) for dy in range(-4, 5)}
    far = {(x + dx, y + dy) for x, y in allts for dx in range(-12, 13, 2) for dy in range(-12, 13, 2)}
    code = {**p28.CODE, "roboport": "Q", "storage-chest": "C", "steel-chest": "C", "stone-wall": "W", "gate": "W"}
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
        k = "K" if typ == "cliff" else ("!" if typ in ("unit-spawner", "turret") else code.get(name, "?"))
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


def set_recipes(ai, who):
    for e in (e for v in layout().values() for e in v if e["name"] in (AM, AM2, CHEM, REF)):
        x, y = pos(e)
        r = ai.set_recipe(who, x, y, e["recipe"])
        if isinstance(r, dict) and r.get("error"):
            print(f"  레시피 {e['recipe']} ({x},{y}): {r['error']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    for f in ("check", "snapshot", "recipes", "draw"):
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
        draw(st, (-14, -16, 38, 41))
        print()
        draw(st, (15, -44, 38, -34))
        return 0
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 · p25..p29 · ore23 · green23 예약 칸 0 · 팔 집는/놓는 칸 · 레인 한 품목 · "
                                         "하류 소비자 · 기존 줄과 안 엉킴 · 전력 덮개 · 전선 7.5 · 유체 (이음·섞임·안 쓰는 상자·입출구) · "
                                         "큰 설비 통로 · 로보포트 한 망·건설 범위 · 단계 64 스텝 이하 모두 통과")
        ents = [e for v in st.values() for e in v]
        print("  수량:", counts(st))
        nets = sorted(set().union(*pole_nets(st).values()))
        print(f"  새 전봇대 {sum(1 for e in ents if e['name'] == POLE)} · 이어지는 기존 망 {nets}")
        nport = sum(1 for e in ents if e["name"] == PORT)
        print(f"  최대 전력 {power_kw(ents) / 1000:.2f} MW (로봇 블록, 팔이 다 움직일 때) + 로보포트 {nport} x (대기 50kW · 충전 최대 2.05MW"
              f" · 버퍼 100MJ 채울 때 5MW)")
        _b, info = port_check(st)
        print("  북동 망:", " · ".join(info))
        for name, c in PORTS.items():
            print(f"    {name} 가운데 {c} · 물류 x {c[0] - LOGI}..{c[0] + LOGI} y {c[1] - LOGI}..{c[1] + LOGI}"
                  f" · 건설 x {c[0] - CONS}..{c[0] + CONS} y {c[1] - CONS}..{c[1] + CONS}")
        sup = {}
        for v in SUPPLY.values():
            for k, n in v.items():
                sup[k] = sup.get(k, 0) + n
        print("  손 보급 (목표 로봇 50 · 수리팩 200 · 로보포트 4):", sup)
        tot = {}
        for k, v in sts.items():
            c = plates(st.get(k, []))
            for m, n in c.items():
                tot[m] = tot.get(m, 0) + n
            print(f"  {k:9s} {len(v):3d}  철 {c.get('iron-plate', 0):6.1f}  강철 {c.get('steel-plate', 0):4.0f}  구리 {c.get('copper-plate', 0):5.1f}"
                  f"  벽돌 {c.get('stone-brick', 0):3.0f}  고급회로 {c.get('advanced-circuit', 0):3.0f}")
        print(f"  설비 합: 철 {tot.get('iron-plate', 0):.0f} · 강철 {tot.get('steel-plate', 0):.0f} · 구리 {tot.get('copper-plate', 0):.0f}"
              f" · 벽돌 {tot.get('stone-brick', 0):.0f} · 고급회로 {tot.get('advanced-circuit', 0):.0f}")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update(COST)
    p1.PAIRED.update({UG, UGP})
    p1.SIZE.update({PORT: 4, TANK: 3})
    p1.PARK = PARK
    ai = AIBridge()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        if nb:
            bad = p1.blocked(ai, steps)
            print(f"  {name:9s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
        else:
            spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
            print(f"  {name:9s} 치움 {len(p1.vanished(ai, steps) & spots)}/{len(spots)}")
    if args.recipes:
        set_recipes(ai, (args.who or "golf").split(",")[0])
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    import p25
    os.environ[detached.ENV] = "p30"
    detached.mark(crew, "p30", minutes=180)
    try:
        p25.prep(ai, crew, sts[args.stage])          # 허브에 돌·나무 0 - 전봇대 나무를 먼저
        ok = p1.build_stage(ai, crew, sts[args.stage], "p30-" + args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

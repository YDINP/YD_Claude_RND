"""DEPRECATED (2026-09-30 05:3x) - 쓰지 말 것. Lua 중계 금지 (2026-09-30 사용자 결정, docs/playbook.md).
relay24 는 05:3x 에 멈추고 state/run24_loops.json 에서 뺐다. 모든 줄은 벨트 · 팔 · 로봇 · 사람 손으로 바뀌었다 -
대신하는 것은 docs/run24-site.md «P7 Lua 중계 걷기 · 3. 전환 기록» 표 (logi24 · ammo24 · robofeed24 · fuelhaul24 · blhaul24).
마지막 설정: FEEDS · OUTS · PLATES · CHESTS · SMELT · NET_STOCK · PORT_STOCK 0 줄, SAFE_OFF 온 세상, CHEST_CAP 0, FURN · BURN · BOIL 0.
HUB_BOX 를 x 75.6 까지 넓힌 것 (임시) 은 relay 와 함께 끝남. 다시 띄우지 말 것 - 되살림이 필요하면 코디네이터 · 사용자 결정.

"""
"""Lua relay for the run 24 lake assembler row: plates in, products out - every move has a per-item cap.

조립 줄 (p1_24.ASMS) 에는 팔 · 상자 · 벨트가 없다. 이 고리가 «있는 물건만» 옮긴다 (만들지 않는다):

    허브 철판   -> 탄창 · 톱니 · 회로 · 팔 · 벨트 조립기     (조립기 안 철판 ≤ CAP)
    허브 구리판 -> 빨강 1·2 · 전선 조립기
    톱니        -> 빨강 1·2 > 팔 > 벨트 (앞 것부터)
    전선 -> 회로 -> 팔 -> 초록 <- 벨트
    빨강 · 초록 -> 연구소 (연구소마다 팩 ≤ 20)
    전기 쌍 화로 판 -> 허브 (허브 철판 ≤ 2500 · 구리판 ≤ 1500) · 돌 전기 상자 -> 허브 (≤ 400)
    석탄 밭 상자 -> 보일러 (≤ 20) > 석탄 버너 채굴기 > 돌 화로 > 다른 버너 채굴기 (≤ 5)  - fuel_run (golf) 의 걸음을 대신
    탄창        -> 포탑 (모든 포탑, 탄 적은 순, 포탑마다 ≤ 20) -> 남는 것은 허브 탄창 상자 (≤ 200) - 사람 무장용
                   조립기가 비면 허브 탄창 상자에서도 포탑으로 (P2)

허브 판은 RESERVE 만큼 남긴다 (짓는 재료). 23회차 복기 §3-10: 망 · 상자에 넣는 중계는 품목 상한 필수.
23회차 §3-21: 자리가 nil 이면 반경 조회가 지도 전체가 된다 - 자리는 표에서만, 없으면 건너뛴다.
조립기에 레시피가 없고 그 레시피가 열려 있으면 정해 준다 (GUI 에서 고르는 일).

    python scripts/relay24.py --run run24 --once
    python scripts/relay24.py --run run24 --every 10
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402

site = runsite.load()
HX, HY = site["hub"]
HUB_BOX = [HX - 4, HY - 0.6, HX + 9.1, HY + 0.6]      # P7: 74.5 · 75.5 상자 (강철 · 벽돌 벨트) 도 허브
AMMO_CHEST = [HX, HY]                     # 허브 줄 맨 서쪽 나무 상자 (66.5,-15.5)
LAB_BOX = [-60, -7, -33, 12]            # P2: 조립 줄 북쪽 연구소 6 (y -4.5) 까지
LAB_BOX2 = [2, -7, 19, 2]               # P5: 파랑 블록 동쪽 연구소 8 (p5_24.LABS5)
# P5 (22:58): 허브 철판 354 - relay 가 300 위를 다 가져가 짓는 사람이 기다렸다 → 공사 동안 1000 · 23:17 톱니가 굶어 (빨강 1 · 팔 조립기 item 부족) 500
RESERVE = {"iron-plate": 500, "copper-plate": 100, "stone": 100}

# p1_24.ASMS 와 같은 표 (그 모듈을 import 하면 p1 이 따라와 무겁다 - 좌표만)
ASMS = {
    "ammo": [-53.5, 3.5, "firearm-magazine"],
    "gear": [-49.5, 3.5, "iron-gear-wheel"],
    "red1": [-45.5, 3.5, "automation-science-pack"],
    "red2": [-41.5, 3.5, "automation-science-pack"],
    "cable": [-37.5, 3.5, "copper-cable"],
    "circuit": [-53.5, -0.5, "electronic-circuit"],
    "inserter": [-49.5, -0.5, "inserter"],
    "belt": [-45.5, -0.5, "transport-belt"],
    "green": [-41.5, -0.5, "logistic-science-pack"],
    "red3": [-37.5, -0.5, "automation-science-pack"],
    "green2": [-57.5, -0.5, "logistic-science-pack"],
    "green3": [-57.5, 3.5, "logistic-science-pack"],
    "green4": [-33.5, 3.5, "logistic-science-pack"],       # P2 (p2_24 labs3)
    "green5": [-33.5, -4.5, "logistic-science-pack"],
    # 파랑 블록 (p2_24.BLUE) - 레시피는 열리면 자동 (advanced-circuit · chemical-science-pack 연구 뒤)
    "adv1": [-29.5, -4.5, "advanced-circuit"],
    "adv2": [-25.5, -4.5, "advanced-circuit"],
    "eng1": [-21.5, -4.5, "engine-unit"],
    "eng2": [-17.5, -4.5, "engine-unit"],
    "pipe": [-13.5, -4.5, "pipe"],
    "blue1": [-29.5, 3.5, "chemical-science-pack"],
    "blue2": [-25.5, 3.5, "chemical-science-pack"],
    "cable2": [-21.5, 3.5, "copper-cable"],
    "circuit2": [-17.5, 3.5, "electronic-circuit"],
    "gear2": [-13.5, 3.5, "iron-gear-wheel"],
    # P3 (p3_24.BLUE2): 파랑 ≥ 100 · 빨강 ≥ 초록
    "eng3": [-9.5, -4.5, "engine-unit"],
    "eng4": [-5.5, -4.5, "engine-unit"],
    "adv3": [-1.5, -4.5, "advanced-circuit"],
    "blue3": [-9.5, 3.5, "chemical-science-pack"],
    "blue4": [-5.5, 3.5, "chemical-science-pack"],
    "cable3": [-1.5, 3.5, "copper-cable"],
    "red4": [-29.5, 8.5, "automation-science-pack"],
    "red5": [-25.5, 8.5, "automation-science-pack"],
    "gear3": [-21.5, 8.5, "iron-gear-wheel"],
    "adv4": [-17.5, 8.5, "advanced-circuit"],
    "blue5": [-13.5, 8.5, "chemical-science-pack"],
    # P4 (p4_24): 정유 2 (advanced) · 윤활유 · 전기 엔진 (조립기 2) · 황산 · 배터리 · 로봇 줄 - 레시피는 연구가 열리면 자동
    "ref2": [-87.5, 8.5, "advanced-oil-processing"],
    "lube": [-85.5, 2.5, "lubricant"],
    "eeng": [-84.5, -1.5, "electric-engine-unit"],
    "acid": [-91.5, 5.5, "sulfuric-acid"],
    "batt": [-91.5, 1.5, "battery"],
    "pierce": [-92.5, -6.5, "piercing-rounds-magazine"],
    "circuit3": [-88.5, -6.5, "electronic-circuit"],
    "cable4": [-84.5, -6.5, "copper-cable"],
    "frame1": [-80.5, -6.5, "flying-robot-frame"],
    "frame2": [-76.5, -6.5, "flying-robot-frame"],
    "robot1": [-72.5, -6.5, "construction-robot"],
    "roboport1": [-68.5, -6.5, "roboport"],
    "adv5": [-64.5, -6.5, "advanced-circuit"],
    # P4 둘째 줄 (p4_24.ROBO2): 로봇망 «재건 세트» 재료
    "wallasm": [-88.5, -10.5, "stone-wall"],
    "turretasm": [-84.5, -10.5, "gun-turret"],
    "repair": [-80.5, -10.5, "repair-pack"],
    "gear4": [-76.5, -10.5, "iron-gear-wheel"],
    "lrobot": [-72.5, -10.5, "logistic-robot"],          # L0 (logistic-robotics)
    # P5 (p5_24.SCI5): 빨강 · 초록 · 엔진 · 고급회로 - 연구소 18 의 먹성에 맞춰
    "red6": [-9.5, 8.5, "automation-science-pack"],
    "red7": [-5.5, 8.5, "automation-science-pack"],
    "green6": [-1.5, 8.5, "logistic-science-pack"],
    "green7": [2.5, 8.5, "logistic-science-pack"],
    "eng5": [6.5, 8.5, "engine-unit"],
    "eng6": [10.5, 8.5, "engine-unit"],
    "adv6": [14.5, 8.5, "advanced-circuit"],
    "pierce2": [-68.5, -10.5, "piercing-rounds-magazine"],   # P5 피어싱 둘째 (p5_24.pierce2_steps)
}

# (출처, 품목, 받는 조립기, 상한) - 출처 "hub" 또는 조립기 이름 (그 조립기의 결과칸). 위에서부터 차례로.
FEEDS = [
    ["hub", "iron-plate", "ammo", 40, None, ["firearm-magazine", 400]],
    ["hub", "iron-plate", "gear", 40],
    ["hub", "copper-plate", "red1", 10],
    ["hub", "copper-plate", "red2", 10],
    ["gear", "iron-gear-wheel", "red1", 10],
    ["gear", "iron-gear-wheel", "red2", 10],
    ["hub", "copper-plate", "red3", 10],
    ["gear", "iron-gear-wheel", "red3", 10],
    ["hub", "copper-plate", "cable", 30],
    ["cable", "copper-cable", "circuit", 30],
    ["hub", "iron-plate", "circuit", 10],
    ["circuit", "electronic-circuit", "inserter", 10],
    ["gear", "iron-gear-wheel", "inserter", 10],
    ["hub", "iron-plate", "inserter", 10],
    ["gear", "iron-gear-wheel", "belt", 10],
    ["hub", "iron-plate", "belt", 10],
    ["inserter", "inserter", "green", 4],
    ["belt", "transport-belt", "green", 4],
    ["inserter", "inserter", "green2", 4],
    ["belt", "transport-belt", "green2", 4],
    ["inserter", "inserter", "green3", 4],
    ["belt", "transport-belt", "green3", 4],
    ["inserter", "inserter", "green4", 4],
    ["belt", "transport-belt", "green4", 4],
    ["inserter", "inserter", "green5", 4],
    ["belt", "transport-belt", "green5", 4],
    # 파랑 사슬
    ["hub", "copper-plate", "cable2", 30],
    ["hub", "iron-plate", "circuit2", 10],
    ["cable2", "copper-cable", "circuit2", 30],
    ["hub", "iron-plate", "gear2", 40],
    ["hub", "iron-plate", "pipe", 20],
    ["hub", "plastic-bar", "adv1", 10],
    ["hub", "plastic-bar", "adv2", 10],
    ["cable2", "copper-cable", "adv1", 20],
    ["cable2", "copper-cable", "adv2", 20],
    ["circuit2", "electronic-circuit", "adv1", 10],
    ["circuit2", "electronic-circuit", "adv2", 10],
    ["hub", "steel-plate", "eng1", 5],
    ["hub", "steel-plate", "eng2", 5],
    ["gear2", "iron-gear-wheel", "eng1", 5],
    ["gear2", "iron-gear-wheel", "eng2", 5],
    ["pipe", "pipe", "eng1", 10],
    ["pipe", "pipe", "eng2", 10],
    ["eng1", "engine-unit", "blue1", 4],
    ["eng2", "engine-unit", "blue2", 4],
    ["eng1", "engine-unit", "blue2", 4],
    ["eng2", "engine-unit", "blue1", 4],
    ["adv1", "advanced-circuit", "blue1", 6],
    ["adv2", "advanced-circuit", "blue2", 6],
    ["adv1", "advanced-circuit", "blue2", 6],
    ["adv2", "advanced-circuit", "blue1", 6],
    ["hub", "sulfur", "blue1", 4],
    ["hub", "sulfur", "blue2", 4],
]
# P3: 빨강 4 · 5 (톱니 셋째 gear3) · 파랑 3 · 4 · 엔진 3 · 4 · 고급회로 3 · 전선 셋째 - 같은 상한 규칙
FEEDS += [
    ["hub", "iron-plate", "gear3", 40],
    ["hub", "copper-plate", "red4", 10],
    ["hub", "copper-plate", "red5", 10],
    ["gear3", "iron-gear-wheel", "red4", 10],
    ["gear3", "iron-gear-wheel", "red5", 10],
    ["hub", "copper-plate", "cable3", 30],
    ["cable3", "copper-cable", "circuit2", 30],
    ["hub", "plastic-bar", "adv3", 10],
    ["cable3", "copper-cable", "adv3", 20],
    ["cable3", "copper-cable", "adv1", 20],
    ["cable3", "copper-cable", "adv2", 20],
    ["circuit2", "electronic-circuit", "adv3", 10],
    ["hub", "plastic-bar", "adv4", 10],
    ["cable3", "copper-cable", "adv4", 20],
    ["cable2", "copper-cable", "adv4", 20],
    ["circuit2", "electronic-circuit", "adv4", 10],
]
for _e in ("eng3", "eng4"):
    FEEDS += [["hub", "steel-plate", _e, 5], ["gear2", "iron-gear-wheel", _e, 5], ["gear3", "iron-gear-wheel", _e, 5], ["pipe", "pipe", _e, 10]]
for _b in ("blue1", "blue2", "blue3", "blue4", "blue5"):
    FEEDS += [[_e, "engine-unit", _b, 4] for _e in ("eng1", "eng2", "eng3", "eng4")]
    FEEDS += [[_a, "advanced-circuit", _b, 6] for _a in ("adv1", "adv2", "adv3", "adv4")]
    FEEDS.append(["hub", "sulfur", _b, 4])
# P4 로봇 사슬 - 받는 쪽마다 품목 상한 (23회차 §3-10)
FEEDS += [
    ["hub", "sulfur", "acid", 10, 150], ["hub", "iron-plate", "acid", 5],
    ["hub", "iron-plate", "batt", 5], ["hub", "copper-plate", "batt", 5],
    ["hub", "copper-plate", "cable4", 30], ["cable4", "copper-cable", "circuit3", 30], ["hub", "iron-plate", "circuit3", 10],
    ["circuit3", "electronic-circuit", "eeng", 6],
]
# 엔진은 파랑 FEEDS 가 먼저 다 가져가 전기 엔진이 0 이었다 (22:13 실측) → 맨 앞에 (상한 2 라 파랑 몫은 거의 그대로)
FEEDS = [[_e, "engine-unit", "eeng", 2] for _e in ("eng1", "eng2", "eng3", "eng4")] + FEEDS
for _f in ("frame1", "frame2"):
    FEEDS += [["eeng", "electric-engine-unit", _f, 2], ["batt", "battery", _f, 4], ["hub", "steel-plate", _f, 4],
              ["circuit3", "electronic-circuit", _f, 8]]
FEEDS += [["frame1", "flying-robot-frame", "robot1", 2], ["frame2", "flying-robot-frame", "robot1", 2],
          ["circuit3", "electronic-circuit", "robot1", 6],
          ["hub", "plastic-bar", "adv5", 10], ["cable4", "copper-cable", "adv5", 20], ["circuit3", "electronic-circuit", "adv5", 10],
          ["hub", "steel-plate", "roboport1", 50], ["gear", "iron-gear-wheel", "roboport1", 50], ["gear3", "iron-gear-wheel", "roboport1", 50],
          ["adv5", "advanced-circuit", "roboport1", 50],
          ["ammo", "firearm-magazine", "pierce", 10], ["hub", "steel-plate", "pierce", 5], ["hub", "copper-plate", "pierce", 10]]
FEEDS += [["hub", "stone-brick", "wallasm", 25], ["hub", "iron-plate", "gear4", 40],
          ["gear4", "iron-gear-wheel", "turretasm", 10], ["hub", "iron-plate", "turretasm", 20], ["hub", "copper-plate", "turretasm", 10],
          ["gear4", "iron-gear-wheel", "repair", 4], ["circuit3", "electronic-circuit", "repair", 4],
          ["gear4", "iron-gear-wheel", "roboport1", 50]]
FEEDS += [["frame1", "flying-robot-frame", "lrobot", 2], ["frame2", "flying-robot-frame", "lrobot", 2], ["adv5", "advanced-circuit", "lrobot", 4]]
# P5 (23:35): 피어싱 허브 400 → 200 - 포탑 50/63 이 바뀌었고 피어싱 10분 200 이 강철 200 을 먹어 엔진 (파랑) 이 강철에 굶는다
# P5-3 (23:25): 물류 로봇 10분 0 - 틀은 있고 고급회로 5 가 회로 3 (엔진 · 틀 · 로봇 · 수리팩과 나눔) 에 굶는다 → 파랑 블록 고급회로 3 · 6 과 회로 2 도 (상한 그대로)
FEEDS += [["adv3", "advanced-circuit", "lrobot", 4], ["adv6", "advanced-circuit", "lrobot", 4], ["circuit2", "electronic-circuit", "adv5", 10]]
# P5: 새 과학 조립기 7 - 같은 상한 규칙
for _r in ("red6", "red7"):
    FEEDS += [["hub", "copper-plate", _r, 10], ["gear2", "iron-gear-wheel", _r, 10], ["gear3", "iron-gear-wheel", _r, 10]]
for _g in ("green6", "green7"):
    FEEDS += [["inserter", "inserter", _g, 4], ["belt", "transport-belt", _g, 4]]
for _e in ("eng5", "eng6"):
    FEEDS += [["hub", "steel-plate", _e, 5], ["gear2", "iron-gear-wheel", _e, 5], ["gear3", "iron-gear-wheel", _e, 5], ["pipe", "pipe", _e, 10],
              [_e, "engine-unit", "eeng", 2]]
FEEDS += [["hub", "plastic-bar", "adv6", 10], ["cable3", "copper-cable", "adv6", 20], ["cable2", "copper-cable", "adv6", 20],
          ["circuit", "electronic-circuit", "adv6", 10], ["circuit2", "electronic-circuit", "adv6", 10]]
for _b in ("blue1", "blue2", "blue3", "blue4", "blue5"):
    FEEDS += [[_e, "engine-unit", _b, 4] for _e in ("eng5", "eng6")] + [["adv6", "advanced-circuit", _b, 6]]
# P5 피어싱 둘째 + 허브 노랑 탄창 (포탑에서 돌려받은 700) 을 피어싱 재료로
FEEDS += [["hub", "firearm-magazine", "pierce", 10], ["hub", "firearm-magazine", "pierce2", 10], ["ammo", "firearm-magazine", "pierce2", 10],
          ["hub", "steel-plate", "pierce2", 5], ["hub", "copper-plate", "pierce2", 10]]
# P5-3 L1 (p5_24.L1): 맞붙은 조립기 사이 팔 직결이 선 줄은 relay 에서 뺀다 - 팔이 «돌고» 받는 쪽이 굶지 않는 것을 확인한 뒤에만
#   (23:1x 확인: 팔 6 모두 pickup/drop 대상 맞음 · waiting_for_space = 받는 쪽이 이미 참). 되돌리려면 이 목록을 비운다.
L1_DROP = [["gear", "iron-gear-wheel", "red1"], ["gear", "iron-gear-wheel", "inserter"], ["cable2", "copper-cable", "circuit2"],
           ["gear3", "iron-gear-wheel", "red5"], ["pipe", "pipe", "eng2"], ["adv4", "advanced-circuit", "blue5"]]
FEEDS = [fd for fd in FEEDS if fd[:3] not in L1_DROP]
# P7 (logi24 rg 가 벨트로 빨강 · 초록을 labs5 에 넣는다): 옛 빨강 7 · 초록 7 · 팔 · 벨트 조립기로 가는 FEEDS 를 쉰다 - 철 ~2.9/s · 구리 ~1.4/s 를 짓는 데로
#   (코디네이터 01:1x: 둘째 철 광맥 전까지 겹친 수요를 줄인다). 서쪽 연구소 10 은 빨강 · 초록이 끊겨 쉰다 - 되돌리려면 목록을 비운다.
DROP_TARGETS = ["red1", "red2", "red3", "red4", "red5", "red6", "red7", "green", "green2", "green3", "green4", "green5", "green6", "green7",
                "inserter", "belt",
                # 03:1x 옛 파랑 사슬 쉼 - 파랑은 bl · bl2 (벨트) 가 labs5 로. 옛 파랑 결과는 서쪽 연구소 (빨강 · 초록 끊겨 쉼) 로만 갔다.
                #   엔진 5 · 6 (전기 엔진) · 고급회로 3 · 6 (물류 로봇) · 회로 2 (고급회로 5) 는 로봇 줄 몫이라 남긴다.
                "blue1", "blue2", "blue3", "blue4", "blue5", "adv1", "adv2", "adv3", "adv4", "eng1", "eng2", "eng3", "eng4",   # 03:3x 해체 (adv3 · eng3 · eng4 는 추락선 잔해와 겹침)
                # 03:5x 로봇 줄 · mall · 전기 엔진 · 틀 · 황산 · 배터리 → robofeed24 (건설 로봇 요청) + logi24 robo (결과 팔 → 공급/저장 상자).
                #   로봇 · 로보포트 · 물류 로봇 만들기는 쉼 (망 건설 로봇 354 · 물류 60) → 고급회로 5 · 6 · 전선 · 회로 · 톱니 옛 사슬도 쉼.
                "circuit3", "cable4", "eeng", "frame1", "frame2", "acid", "batt", "gear4", "turretasm", "repair", "wallasm",
                "eng5", "eng6", "adv6", "robot1", "roboport1", "lrobot", "adv5", "gear", "gear2", "gear3", "pipe", "cable", "cable2", "cable3",
                "circuit", "circuit2",
                # 04:3x 탄 조립기 먹이 → ammo24 FEED (건설 로봇 요청: 철 → 노랑 · 노랑 (망 > 200) · 강철 · 구리 → 피어싱 둘). 결과는 팔 → 공급 상자
                "ammo", "pierce", "pierce2"]
FEEDS = [fd for fd in FEEDS if fd[2] not in DROP_TARGETS]
# (조립기, 품목, 허브 상한) - 결과칸 → 허브. 로봇 · 로보포트는 허브에서 사람이 들고 가 놓는다 (또는 relay 가 로보포트에)
# P5: 포탑 조립기가 10분 철판 ~1,500 을 먹었다 (허브 · 저장 상자 채우기) - 허브 20 → 10, 저장 상자 10 → 5
# P5-3: 건설 로봇 허브 100 → 20 (포트 8 × 15 = 120 이 이미 섰다) - 틀이 물류 로봇 조립기로 가게
OUTS = [["robot1", "construction-robot", 20], ["roboport1", "roboport", 10], ["pierce", "piercing-rounds-magazine", 200], ["pierce2", "piercing-rounds-magazine", 200],
        ["turretasm", "gun-turret", 10], ["repair", "repair-pack", 100], ["wallasm", "stone-wall", 200], ["lrobot", "logistic-robot", 40]]
# 로봇망 (construction-robotics 뒤). 23회차 §3-10: 망 저장이 차면 건설 로봇이 선다 → 모두 «상자마다 · 포트마다» 상한.
#   (품목, 상자 하나 상한) 허브 → 망 저장 상자 (storage-chest) - 재건 · 수리 재료. 저장 상자는 48 칸, 여기서 쓰는 것은 칸 넷 남짓
NET_STOCK = [["stone-wall", 100], ["gun-turret", 5], ["repair-pack", 50]]      # 탄창은 로봇이 안 넣는다 - 상자에 두지 않는다
# 피어싱으로 바꾸는 순서 = raidwatch 틈이 작은 방위부터 (22:13: SW 337 · E 370 · NW 402). [x0, y0, x1, y1]
PIERCE_ZONES = [[-220, 14, -178, 56],        # 유전 (SW 둥지에서 가장 가까운 우리 것)
                [-130, 0, -84, 50],          # 정유 · 발전 남서 줄
                [115, -50, 140, 14],         # 동쪽 면
                [-104, -12, -30, 16],        # 물가 서 · 북쪽 줄 (NW)
                [70, -70, 100, -58],         # 철 북쪽 줄
                [48, 70, 90, 102]]           # 구리 남서
#   허브 → 로보포트 칸 (포트 하나 상한): 건설 로봇 (포트당 25~50 권고 - 처음엔 15) · 수리팩
PORT_STOCK = [["construction-robot", 15, "robot"], ["repair-pack", 50, "material"], ["logistic-robot", 5, "robot"]]
# P7 mall (logi24): 벽 · 포탑 · 수리팩 조립기 결과 → 팔 → 공급 상자 (칸 제한) - 망에 바로 보인다. 허브 → 로보포트 · 저장 상자 중계는 쉰다.
#   로봇을 포트에 더 넣을 때는 사람이 든다 (P6 chain-kit 처럼). 되돌리려면 아래 셋을 지운다.
OUTS = [o for o in OUTS if o[0] not in ("turretasm", "repair", "wallasm", "robot1", "roboport1", "lrobot", "pierce", "pierce2")]   # 04:3x 피어싱 → 공급 상자 (logi24 ammo)   # 03:5x 로봇 · 로보포트 · 물류 로봇 쉼
NET_STOCK = []
PORT_STOCK = []
LAB_CAP = 20
TURRET_CAP = 20
# P7 안전 걷기 (03:2x~): relay 가 포탑 탄 · 화로 연료를 안 넣는 구역 [x0, y0, x1, y1]. 넓혀 가다 모두 덮이면 S1 · S2 · S4 를 뺀다.
#   동쪽 전초 (P8, 화로 24 · 포탑 16) 10 분 시험 (코디네이터) · 발전 남쪽 호숫가 (ammo24 가 피어싱으로 바꿈 - relay 노랑이 끼면 못 바꾼다)
# 04:1x 로봇망 안 포탑 (건설 범위) 은 relay S1 · S2 가 쉰다 - ammo24 (탄 < 10 → 20 요청) 가 맡는다. 망 밖 포탑만 relay (손 고리 확인 뒤 뺌)
TURRET_NET_OFF = True      # 04:13 다시 (바꿈 --switch 없이, 채우기만) · 04:05 되살림 - 망 건설 로봇 354 모두 바빠 (available 0) 바꿈 중 포탑 3 이 탄 0
SAFE_OFF = [[-5000, -5000, 5000, 5000]]  # 04:4x S1 · S2 뺌 - 모든 포탑을 relay 가 안 만진다: 망 안 = ammo24 요청 · 망 밖 38 = ammo24 손 고리 (bravo, 탄 < 10) · 동쪽 전초는 피어싱 상자 → 벨트. 전: [[380, -190, 440, -120]]      # 03:37 동쪽 전초 10 분 시험 (석탄 · 피어싱 손 상자 → 벨트). 03:22 포탑 (2,50) 탄 0 - 되살림. 전: [[-40, 30, 12, 56]]          # + [380, -190, 440, -120] 동쪽 전초 (석탄 상자 채운 뒤)
CHEST_CAP = 0      # 04:4x S3 뺌 (전 200) - 노랑 조립기 결과 → 팔 → 공급 상자 (-53.5,6.5) (logi24 ammo), 허브 탄 상자는 bravo 가 손으로 망 상자에 옮김
COAL_BOX = [100, -34, 126, -22]
# (이름, x, y, 레시피, 넣을 품목 ("" = 없음), 상한, 꺼낼 품목, 허브 상한) - p2_24 REFINERY · PLASTIC
CHEM = [["oil-refinery", -112.5, 18.5, "basic-oil-processing", "", 0, "", 0],
        ["chemical-plant", -106.5, 13.5, "plastic-bar", "", 0, "", 0],   # 04:1x M3 뺌 → 팔 → 공급 상자 (-106.5,10.5) (logi24 chemout)   # 03:5x 석탄 (P4) → robofeed24 (망 석탄 = 석탄 밭 공급 상자 (122.5,-29.5))       # P5: 1000 → 700 - 정유 1 가스를 황 첫째가 먼저 (플라스틱은 둘째 몫)      # P4: 500 → 1000 (로보포트 · 고급회로 5)
        ["chemical-plant", -102.5, 13.5, "sulfur", "", 0, "", 0],   # 04:1x M3 뺌 → 공급 상자 (-101.5,10.5)
        ["chemical-plant", -71.5, 11.5, "plastic-bar", "", 0, "", 0],   # 04:1x M3 뺌 - 결과는 P7 노랑 (LDS) 벨트 팔만   # 03:5x 석탄 → robofeed24
        # P5 기름 블록 (p5_24.crack_steps): 중유 분해 · 경유 분해 · 황 둘째 - 레시피는 관보다 먼저 선 기계에 걸린다
        ["chemical-plant", -82.5, 4.5, "heavy-oil-cracking", "", 0, "", 0],
        ["chemical-plant", -79.5, 4.5, "light-oil-cracking", "", 0, "", 0],
        ["chemical-plant", -75.5, 4.5, "sulfur", "", 0, "", 0]]   # 04:1x M3 뺌 → 공급 상자 (-75.5,1.5)      # P4 플라스틱 둘째 (석유 탱크 P)                   # P4: 300 → 600 (황산)           # 석탄 밭 상자 (버너 줄 -24.5 · 전기 줄 -29.5)
BOIL, BURN = 20, 0      # 04:00 BURN 0 - 버너 채굴기 0 대 (모두 전기)
# P7 안전 (마지막): 석탄 벨트 → 보일러 팔 (logi24 coal) 이 10 분 넘게 돈 뒤 BOIL = 0 (relay 보일러 연료 쉼). 화로는 FURN = 0 (사람 손 연료 고리가 대신).
FURN = 0      # 04:00 뺌 - fuelhaul24 (golf 손 석탄 고리, 03:36~) 가 본진 강철로 45 를 20~50 으로 · 동쪽 전초는 석탄 상자 → 벨트 (03:37 SAFE_OFF 시험 통과)
BOIL = 0            # 05:3x 끝 (relay 은퇴 - 발전 담당 태양 74 · 축전 74 로 수요 12.2 / 용량 21.5 MW, 흩어진 보일러 넷은 쉼) · 04:2x 되살림 (전력 17.1/17.1 MW 포화 - 흩어진 보일러 4 (3.6 MW) 가 필요, 발전 늘리기 담당이 늘린 뒤 뺌) · 03:51 다시 뺌 (새 보일러 팔 전봇대 03:35 - 팔 10 모두 waiting_for_space). 03:17 정전 (보일러 7 석탄 0) 으로 되살림 - 03:01 뺌 - 보일러 줄 10 대 (석탄 벨트 y 48.5) 가 발전 전부. 흩어진 보일러 4 대 (-83/-75/-57/-42) 는 연료 떨어지면 쉼 (예비)
# (구역, 판, 허브 상한) - 전기 채굴기가 화로에 바로 붓는 쌍 (P2: 철 버너 줄 자리의 전기 쌍 C (y -54) 까지). 결과칸이 차면 채굴기가 선다 (collect_run 걸음으론 모자람)
PLATES = [[[68, -56, 103, -41], "iron-plate", 2500], [[60, 78, 92, 90], "copper-plate", 1500],
          [[72, -67.5, 96, -64.5], "iron-plate", 2500]]      # P3 철 전기 쌍 E 6 (p3_24.IRONE_XS, 화로 y -66)
# P7 (2026-09-30 사용자 결정: Lua 중계 금지) - scripts/logi24.py 가 벨트 · 팔로 대신한 줄은 여기서 쉰다. 되돌리려면 목록에서 뺀다.
#   전환 기록은 docs/run24-site.md «P7 3. 전환 기록».
DROP_PLATES = ["iron-plate", "copper-plate"]                  # 화로 결과 → 허브: "iron-plate" (ironout 벨트) · "copper-plate" (copperout 벨트)
PLATES = [p for p in PLATES if p[1] not in DROP_PLATES]
LAB2_PACKS = ["__none__"]  # 03:05 파랑도 bl 벨트가 labs5 로 - relay 는 labs5 에 아무것도 안 넣는다. 전:["chemical-science-pack"]                 # labs5 (LAB_BOX2) 에 relay 가 넣는 팩 - None = 모두, ["chemical-science-pack"] = 빨강 · 초록은 rg 벨트가
# (구역, 품목, 허브 상한) - 전기 채굴기가 붓는 상자 -> 허브 (짓는 재료)
CHESTS = [[[97, -8, 111, -5], "stone", 1500]]      # P2: 400 -> 1500 (벽돌 화로 6 이 허브 돌을 먹는다)
# (구역, 넣을 품목, 화로마다 상한, 꺼낼 품목, 허브 상한) - 벽돌 화로 (p2_24.BRICK_XS, y -9). 벽 (5 벽돌) 재료
SMELT = [[[72.5, -10.5, 85.5, -7.5], "stone", 20, "stone-brick", 1500],
         [[85.5, -10.5, 93.5, -7.5], "iron-plate", 25, "steel-plate", 400],      # 강철 화로 4 (p2_24.STEEL_XS)
         [[72.5, -13.5, 81.5, -10.6], "iron-plate", 25, "steel-plate", 400]]     # P3 강철 화로 4 더 (p3_24.STEEL2_XS, y -12)
# P7 smelt (logi24): 돌 채굴기가 벨트에 바로 붓고 벽돌 2 · 강철 8 강철로는 필터 팔 · 결과 벨트 → 허브. 되돌리려면 목록을 비운다.
DROP_CHESTS = ["stone"]                  # "stone"
DROP_SMELT = ["stone-brick", "steel-plate"]  # 01:12 되살렸다가 01:50 다시 뺌 (벨트 강철 10분 485 · 허브 759)                  # "stone-brick" · "steel-plate" (결과 품목)
CHESTS = [c for c in CHESTS if c[1] not in DROP_CHESTS]
SMELT = [m for m in SMELT if m[3] not in DROP_SMELT]

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local F = helpers.json_to_table('%s')
  local R = helpers.json_to_table('%s')
  local HB, LB, AC = %s, %s, {%f, %f}
  local out = {moved = {}, miss = {}}
  local function tally(k, n) out.moved[k] = (out.moved[k] or 0) + n end
  local M = {}
  for name, a in pairs(A) do
    -- P4: 조립기 2 · 화학 공장 · 정유도 같은 표로 (2.0 에선 셋 다 type assembling-machine)
    local e = s.find_entities_filtered{type = "assembling-machine", force = f, position = {a[1], a[2]}, radius = 0.6}[1]
    if e then
      M[name] = e
      if not e.get_recipe() and f.recipes[a[3]] and f.recipes[a[3]].enabled then e.set_recipe(a[3]) end
    else out.miss[#out.miss+1] = name end
  end
  -- L0: 허브 줄 끝 공급 상자 (passive-provider) 도 허브 - 거기 든 판이 로봇망에 보인다. 저장 · 요청 상자는 허브가 아니다
  local hubs = s.find_entities_filtered{type = "container", force = f, area = {{HB[1], HB[2]}, {HB[3], HB[4]}}}
  for _, c in pairs(s.find_entities_filtered{name = "passive-provider-chest", force = f, area = {{HB[1], HB[2]}, {HB[3], HB[4]}}}) do hubs[#hubs+1] = c end
  local function hub_take(item, want)
    local got = 0
    for _, c in pairs(hubs) do
      local inv = c.get_inventory(defines.inventory.chest)
      local total = 0
      for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(item) end
      local spare = total - (R[item] or 0)
      if spare <= 0 then break end
      local n = math.min(want - got, inv.get_item_count(item), spare)
      if n > 0 then got = got + inv.remove{name = item, count = n} end
      if got >= want then break end
    end
    return got
  end
  local function hub_give(item, n)
    for _, c in pairs(hubs) do
      local put = c.get_inventory(defines.inventory.chest).insert{name = item, count = n}
      n = n - put
      if n <= 0 then return end
    end
  end
  for _, fd in pairs(F) do
    local src, item, dst, cap = fd[1], fd[2], M[fd[3]], fd[4]
    if dst and dst.get_recipe() then
      local din = dst.get_inventory(defines.inventory.assembling_machine_input)
      local room = cap - din.get_item_count(item)
      if room > 0 then
        -- 5 번째 값 = 허브 하한 (그 밑이면 이 줄은 쉰다) - 황을 파랑이 먼저 쓰게 (22:35 허브 황 2 · 파랑 10분 76)
        local floor_ok = true
        if src == "hub" and fd[5] then
          local t = 0
          for _, h in pairs(hubs) do t = t + h.get_inventory(defines.inventory.chest).get_item_count(item) end
          floor_ok = t >= fd[5]
        end
        -- P5: 6 번째 값 = {품목, 허브 상한} - 허브에 그 품목이 상한 이상이면 이 줄은 쉰다 (23:17 허브 노랑 탄창 891 인데 탄창 조립기가 철판 40 씩 먹었다)
        if fd[6] then
          local t = 0
          for _, h in pairs(hubs) do t = t + h.get_inventory(defines.inventory.chest).get_item_count(fd[6][1]) end
          if t >= fd[6][2] then floor_ok = false end
        end
        if not floor_ok then
        elseif src == "hub" then
          local got = hub_take(item, room)
          if got > 0 then
            local put = din.insert{name = item, count = got}
            if put < got then hub_give(item, got - put) end
            tally(item .. ">" .. fd[3], put)
          end
        elseif M[src] then
          local sout = M[src].get_inventory(defines.inventory.assembling_machine_output)
          local n = math.min(room, sout.get_item_count(item))
          if n > 0 then
            local put = din.insert{name = item, count = n}
            if put > 0 then sout.remove{name = item, count = put}; tally(item .. ">" .. fd[3], put) end
          end
        end
      end
    end
  end
  -- P4: 결과칸 -> 허브 (허브 품목 상한)
  for _, o in pairs(helpers.json_to_table('%s')) do
    local m = M[o[1]]
    if m then
      local mo = m.get_inventory(defines.inventory.assembling_machine_output)
      local have = mo.get_item_count(o[2])
      if have > 0 then
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(o[2]) end
        local n = math.min(have, o[3] - total)
        if n > 0 then
          local put = 0
          for _, h in pairs(hubs) do
            put = put + h.get_inventory(defines.inventory.chest).insert{name = o[2], count = n - put}
            if put >= n then break end
          end
          if put > 0 then mo.remove{name = o[2], count = put}; tally(o[2] .. ">hub", put) end
        end
      end
    end
  end
  -- P4 로봇망: 허브 → 로보포트 (로봇 · 수리팩) · 허브 → 저장 상자 (재건 세트) - 모두 상한
  local function hub_have(item)
    local t = 0
    for _, h in pairs(hubs) do t = t + h.get_inventory(defines.inventory.chest).get_item_count(item) end
    return t
  end
  local function hub_pull(item, want)
    local got = 0
    for _, h in pairs(hubs) do
      local inv = h.get_inventory(defines.inventory.chest)
      local n = math.min(want - got, inv.get_item_count(item))
      if n > 0 then got = got + inv.remove{name = item, count = n} end
      if got >= want then break end
    end
    return got
  end
  for _, rp in pairs(s.find_entities_filtered{name = "roboport", force = f}) do
    for _, ps in pairs(helpers.json_to_table('%s')) do
      local inv = rp.get_inventory(ps[3] == "robot" and defines.inventory.roboport_robot or defines.inventory.roboport_material)
      local room = ps[2] - inv.get_item_count(ps[1])
      if room > 0 and hub_have(ps[1]) > 0 then
        local got = hub_pull(ps[1], room)
        if got > 0 then
          local put = inv.insert{name = ps[1], count = got}
          if put < got then hub_give(ps[1], got - put) end
          tally(ps[1] .. ">port", put)
        end
      end
    end
  end
  for _, sc in pairs(s.find_entities_filtered{name = "storage-chest", force = f}) do
    local inv = sc.get_inventory(defines.inventory.chest)
    for _, ns in pairs(helpers.json_to_table('%s')) do
      local room = ns[2] - inv.get_item_count(ns[1])
      if room > 0 and hub_have(ns[1]) > 0 then
        local got = hub_pull(ns[1], room)
        if got > 0 then
          local put = inv.insert{name = ns[1], count = got}
          if put < got then hub_give(ns[1], got - put) end
          tally(ns[1] .. ">store", put)
        end
      end
    end
  end
  -- 팩 -> 연구소
  local labs = s.find_entities_filtered{name = "lab", force = f, area = {{LB[1], LB[2]}, {LB[3], LB[4]}}}
  -- P5: 둘째 연구소 구역 (파랑 블록 동쪽 8) - 먼저 찬 쪽이 아니라 번갈아 (앞 구역만 채우면 뒤 구역이 굶는다)
  local LB2 = %s
  local L2ONLY = helpers.json_to_table('__L2__')
  local inL2 = {}
  for _, l in pairs(s.find_entities_filtered{name = "lab", force = f, area = {{LB2[1], LB2[2]}, {LB2[3], LB2[4]}}}) do labs[#labs+1] = l; inL2[l.unit_number] = true end
  table.sort(labs, function(a, b) return a.get_inventory(defines.inventory.lab_input).get_item_count() < b.get_inventory(defines.inventory.lab_input).get_item_count() end)
  for _, src in pairs({"red1", "red2", "red3", "red4", "red5", "red6", "red7", "green", "green2", "green3", "green4", "green5", "green6", "green7", "blue1", "blue2", "blue3", "blue4", "blue5"}) do
    local m = M[src]
    if m and m.get_recipe() then
      local sout = m.get_inventory(defines.inventory.assembling_machine_output)
      local item = m.get_recipe().name
      for _, l in pairs(labs) do
        if inL2[l.unit_number] and L2ONLY.on and not L2ONLY[item] then goto nextlab end
        do
        local lin = l.get_inventory(defines.inventory.lab_input)
        local n = math.min(%d - lin.get_item_count(item), sout.get_item_count(item))
        if n > 0 then
          local put = lin.insert{name = item, count = n}
          if put > 0 then sout.remove{name = item, count = put}; tally(item .. ">lab", put) end
        end
        end
        ::nextlab::
      end
    end
  end
  -- 탄창 -> 포탑 (모든 gun-turret, 좌표 목록 아님) -> 탄창 상자
  -- P2 (20:52 경보: 새 포탑 (72,96)·(80,96) 탄 0): 조립기 결과칸이 비면 허브 탄창 상자 (사람 무장용 ≤ CHEST_CAP) 에서도 포탑으로.
  -- 새 포탑 17 × 20 = 340 이 조립기 한 대 (0.5/s) 보다 빨리 필요했다. 빈 포탑부터 채운다 (탄 적은 순).
  -- P7 안전 걷기: OFF 구역 (포탑 · 화로 연료) 은 relay 가 손대지 않는다 - 대신하는 것 (ammo24 로봇 요청 · 손 고리 · 벨트) 이 맡는다
  local OFF = helpers.json_to_table('__OFF__')
  local NET_OFF = __NETOFF__
  -- 포탑이 로봇망 건설 범위 안 (로봇 있음) 이면 ammo24 (건설 로봇 요청) 가 맡는다 - relay S1 · S2 는 손대지 않는다
  local function net_turret(t)
    if not NET_OFF or t.type ~= "ammo-turret" then return false end
    for _, n in pairs(s.find_logistic_networks_by_construction_area(t.position, f) or {}) do
      if n.all_construction_robots > 0 then return true end
    end
    return false
  end
  local function off(e)
    if net_turret(e) then return true end
    for _, z in pairs(OFF) do
      if e.position.x >= z[1] and e.position.y >= z[2] and e.position.x <= z[3] and e.position.y <= z[4] then return true end
    end
    return false
  end
  local m = M["ammo"]
  local ch = s.find_entities_filtered{type = "container", force = f, position = AC, radius = 0.6}[1]
  local srcs = {}
  if m then srcs[#srcs+1] = m.get_inventory(defines.inventory.assembling_machine_output) end
  if ch then srcs[#srcs+1] = ch.get_inventory(defines.inventory.chest) end
  local turrets = {}
  for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f}) do if not off(t) then turrets[#turrets + 1] = t end end
  table.sort(turrets, function(a, b)
    return a.get_inventory(defines.inventory.turret_ammo).get_item_count() < b.get_inventory(defines.inventory.turret_ammo).get_item_count() end)
  -- P4 피어싱 (military-2): 포탑 탄 칸은 하나 - 노랑이 든 포탑은 노랑을 허브로 돌려보내고 피어싱 20 을 넣는다.
  --   틈이 작은 방위의 구역부터 (PIERCE_ZONES 순서), 허브 피어싱이 20 이상일 때만 바꾼다. 피어싱 포탑은 피어싱으로만 채운다 (떨어지면 아래 노랑 고리가 채움)
  local ptotal = hub_have("piercing-rounds-magazine")
  for _, z in pairs(helpers.json_to_table('__PZ__')) do
    for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, area = {{z[1], z[2]}, {z[3], z[4]}}}) do
      local tin = t.get_inventory(defines.inventory.turret_ammo)
      if off(t) then tin = nil end
      local pc = tin and tin.get_item_count("piercing-rounds-magazine") or 0
      local yc = tin and tin.get_item_count("firearm-magazine") or 0
      if not tin then
      elseif yc > 0 and ptotal >= %d then
        local got = hub_pull("piercing-rounds-magazine", %d)
        if got > 0 then
          tin.remove{name = "firearm-magazine", count = yc}
          hub_give("firearm-magazine", yc)
          local put = tin.insert{name = "piercing-rounds-magazine", count = got}
          if put < got then hub_give("piercing-rounds-magazine", got - put) end
          ptotal = ptotal - put
          tally("pierce>turret(swap)", put)
        end
      elseif pc > 0 and pc < %d and ptotal > 0 then
        local got = hub_pull("piercing-rounds-magazine", %d - pc)
        local put = got > 0 and tin.insert{name = "piercing-rounds-magazine", count = got} or 0
        if put < got then hub_give("piercing-rounds-magazine", got - put) end
        ptotal = ptotal - put
        if put > 0 then tally("pierce>turret", put) end
      end
    end
  end
  for _, t in pairs(turrets) do
    local tin = t.get_inventory(defines.inventory.turret_ammo)
    for _, src in pairs(srcs) do
      local n = math.min(%d - tin.get_item_count("firearm-magazine"), src.get_item_count("firearm-magazine"))
      if n > 0 then
        local put = tin.insert{name = "firearm-magazine", count = n}
        if put > 0 then src.remove{name = "firearm-magazine", count = put}; tally("mag>turret", put) end
      end
    end
  end
  if m and ch then
    local sout = m.get_inventory(defines.inventory.assembling_machine_output)
    local cin = ch.get_inventory(defines.inventory.chest)
    local n = math.min(%d - cin.get_item_count("firearm-magazine"), sout.get_item_count("firearm-magazine"))
    if n > 0 then
      local put = cin.insert{name = "firearm-magazine", count = n}
      if put > 0 then sout.remove{name = "firearm-magazine", count = put}; tally("mag>chest", put) end
    end
  end
  -- 판: 전기 제련 쌍의 화로 결과칸 -> 허브 (허브 품목 상한까지)
  for _, pb in pairs(helpers.json_to_table('%s')) do
    local box, item, cap = pb[1], pb[2], pb[3]
    for _, fu in pairs(s.find_entities_filtered{type = "furnace", force = f, area = {{box[1], box[2]}, {box[3], box[4]}}}) do
      local fo = fu.get_inventory(defines.inventory.furnace_result)
      local have = fo.get_item_count(item)
      if have > 0 then
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(item) end
        local n = math.min(have, cap - total)
        if n <= 0 then break end
        local put = 0
        for _, h in pairs(hubs) do
          put = put + h.get_inventory(defines.inventory.chest).insert{name = item, count = n - put}
          if put >= n then break end
        end
        if put > 0 then fo.remove{name = item, count = put}; tally(item .. ">hub", put) end
      end
    end
  end
  -- 상자 -> 허브 (돌)
  for _, cb in pairs(helpers.json_to_table('%s')) do
    local box, item, cap = cb[1], cb[2], cb[3]
    for _, c in pairs(s.find_entities_filtered{type = "container", force = f, area = {{box[1], box[2]}, {box[3], box[4]}}}) do
      local ci = c.get_inventory(defines.inventory.chest)
      local have = ci.get_item_count(item)
      local total = 0
      for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(item) end
      local n = math.min(have, cap - total)
      if n > 0 then
        local put = 0
        for _, h in pairs(hubs) do
          put = put + h.get_inventory(defines.inventory.chest).insert{name = item, count = n - put}
          if put >= n then break end
        end
        if put > 0 then ci.remove{name = item, count = put}; tally(item .. ">hub", put) end
      end
    end
  end
  -- 허브 -> 화로 (재료) · 화로 -> 허브 (결과) - 벽돌
  for _, sm in pairs(helpers.json_to_table('%s')) do
    local box, src, cap, prod, hcap = sm[1], sm[2], sm[3], sm[4], sm[5]
    for _, fu in pairs(s.find_entities_filtered{type = "furnace", force = f, area = {{box[1], box[2]}, {box[3], box[4]}}}) do
      local fin = fu.get_inventory(defines.inventory.furnace_source)
      local room = cap - fin.get_item_count(src)
      if room > 0 then
        local got = hub_take(src, room)
        if got > 0 then
          local put = fin.insert{name = src, count = got}
          if put < got then hub_give(src, got - put) end
          tally(src .. ">smelt", put)
        end
      end
      local fo = fu.get_inventory(defines.inventory.furnace_result)
      local have = fo.get_item_count(prod)
      if have > 0 then
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(prod) end
        local n = math.min(have, hcap - total)
        if n > 0 then
          local put = 0
          for _, h in pairs(hubs) do
            put = put + h.get_inventory(defines.inventory.chest).insert{name = prod, count = n - put}
            if put >= n then break end
          end
          if put > 0 then fo.remove{name = prod, count = put}; tally(prod .. ">hub", put) end
        end
      end
    end
  end
  -- 연료: 석탄 밭 상자 -> 보일러 (≤ BOIL) > 석탄 버너 채굴기 > 화로 > 다른 버너 채굴기 (≤ BURN)
  local CB = %s
  local coal = s.find_entities_filtered{type = "container", force = f, area = {{CB[1], CB[2]}, {CB[3], CB[4]}}}
  local function coal_take(want)
    local got = 0
    for _, c in pairs(coal) do
      local inv = c.get_inventory(defines.inventory.chest)
      local n = math.min(want - got, inv.get_item_count("coal"))
      if n > 0 then got = got + inv.remove{name = "coal", count = n} end
      if got >= want then break end
    end
    return got
  end
  local function coal_back(n)
    for _, c in pairs(coal) do
      n = n - c.get_inventory(defines.inventory.chest).insert{name = "coal", count = n}
      if n <= 0 then return end
    end
  end
  local function fuel(list, cap)
    for _, e in pairs(list) do
      local fi = (e.type == "boiler" or not off(e)) and e.get_fuel_inventory()   -- 04:4x SAFE_OFF 는 포탑 몫 - 보일러 (BOIL, 전력 포화로 되살림) 는 그대로
      if fi then
        local room = cap - fi.get_item_count("coal")
        if room > 0 then
          local got = coal_take(room)
          if got == 0 then return false end
          local put = fi.insert{name = "coal", count = got}
          if put < got then coal_back(got - put) end
          tally("coal>" .. e.name, put)
        end
      end
    end
    return true
  end
  local inbox = {}
  local others = {}
  for _, d in pairs(s.find_entities_filtered{name = "burner-mining-drill", force = f}) do
    local p = d.position
    if p.x >= CB[1] and p.x <= CB[3] and p.y >= CB[2] and p.y <= CB[4] then inbox[#inbox+1] = d else others[#others+1] = d end
  end
  -- 기름 (P2): 정유 · 화학 공장 레시피 (열려 있으면) · 석탄 → 플라스틱 공장 (≤ CHEM_COAL) · 결과 → 허브 (품목 상한)
  for _, c in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = c[1], force = f, position = {c[2], c[3]}, radius = 0.6}[1]
    if e then
      if not e.get_recipe() and f.recipes[c[4]] and f.recipes[c[4]].enabled then e.set_recipe(c[4]) end
      if e.get_recipe() and c[5] ~= "" then
        local ein = e.get_inventory(defines.inventory.assembling_machine_input)
        local room = c[6] - ein.get_item_count(c[5])
        if room > 0 and c[5] == "coal" then
          local got = coal_take(room)
          if got > 0 then
            local put = ein.insert{name = "coal", count = got}
            if put < got then coal_back(got - put) end
            tally("coal>" .. c[4], put)
          end
        end
      end
      if e.get_recipe() and c[7] ~= "" then
        local eo = e.get_inventory(defines.inventory.assembling_machine_output)
        local have = eo.get_item_count(c[7])
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(c[7]) end
        local n = math.min(have, c[8] - total)
        if n > 0 then
          local put = 0
          for _, h in pairs(hubs) do
            put = put + h.get_inventory(defines.inventory.chest).insert{name = c[7], count = n - put}
            if put >= n then break end
          end
          if put > 0 then eo.remove{name = c[7], count = put}; tally(c[7] .. ">hub", put) end
        end
      end
    end
  end
  local _ = fuel(s.find_entities_filtered{type = "boiler", force = f}, %d)
    and fuel(inbox, %d)
    and fuel(s.find_entities_filtered{name = {"stone-furnace", "steel-furnace"}, force = f}, %d)   -- P5: 강철로도 석탄 (23:23 강철로 25 no_fuel - 철판 6,760 → 4,030)
    and fuel(others, %d)
  return out
end)()"""


def blob(v) -> str:
    return json.dumps(v).replace("\\", "\\\\").replace("'", "\\'")


def lua_box(b) -> str:
    return "{%f, %f, %f, %f}" % tuple(b)


def once(ai) -> dict:
    l2 = dict({k: True for k in LAB2_PACKS}, on=True) if LAB2_PACKS else {"on": False}
    return ai.lua(LUA.replace("__PZ__", blob(PIERCE_ZONES)).replace("__OFF__", blob(SAFE_OFF)).replace("__NETOFF__", "true" if TURRET_NET_OFF else "false").replace("__L2__", blob(l2)) % (blob(ASMS), blob(FEEDS), blob(RESERVE), lua_box(HUB_BOX), lua_box(LAB_BOX),
                         AMMO_CHEST[0], AMMO_CHEST[1], blob(OUTS), blob(PORT_STOCK), blob(NET_STOCK), lua_box(LAB_BOX2), LAB_CAP,
                         TURRET_CAP, TURRET_CAP, TURRET_CAP, TURRET_CAP, TURRET_CAP, CHEST_CAP,
                         blob(PLATES), blob(CHESTS), blob(SMELT), lua_box(COAL_BOX), blob(CHEM), BOIL, BURN, FURN, BURN))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=10)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai, total, last = None, {}, time.time()
    while True:
        try:
            ai = ai or AIBridge()
            r = once(ai)
            for k, v in (r.get("moved") or {}).items():
                total[k] = total.get(k, 0) + int(v)
            if a.once:
                print(r)
                return 0
            if time.time() - last >= 300:
                miss = r.get("miss") or {}
                miss = list(miss.values()) if isinstance(miss, dict) else miss
                print(f"{time.strftime('%H:%M:%S')} 5분 옮김 {total}" + (f" · 없는 조립기 {miss}" if miss else ""), flush=True)
                total, last = {}, time.time()
        except (RconError, OSError) as e:
            print(f"{time.strftime('%H:%M:%S')} 오류 {e}", flush=True)
            ai = None
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

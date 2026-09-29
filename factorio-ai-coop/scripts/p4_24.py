"""P4 builder for run 24: advanced refinery → lubricant → electric engines, sulfuric acid → batteries, robot frames → construction robots, roboports.

짓는 엔진은 p1.build_stage (허브 판 · 벽돌로 만들고, 막힌 자리는 벌목 · 바위, 선 것은 건너뜀).
물건은 relay24 가 옮긴다 (있는 것만, 품목 상한) - 이 파일은 «놓는 것» 만.

자리 (21:58 실측 map): 물가 블록 동쪽 빈 땅 x -97..-63, y -9..12 (포탑 (-100,±4)(-95,0)(-100,12) 서쪽, 연구소 x -59 동쪽 끝).
유체 포트는 prototype 에 물어 정했다 (fluidbox_prototypes, 23회차 · 24회차 «돌린 값은 게임에 묻는다»):
    정유 N: 입력 1 (물) (-1,+3) · 입력 2 (원유) (+1,+3) · 출력 3 중유 (-2,-3) · 4 경유 (0,-3) · 5 석유 (+2,-3)  → E 로 돌리면 (x,y) → (-y,x)
    화학 N: 입력 1 (-1,-2) · 입력 2 (+1,-2) · 출력 3 (-1,+2) · 4 (+1,+2)                                         → S 는 부호 반대
    조립기 2 N: 입력 (0,-2) · 출력 (0,+2)
    저장 탱크 N: (-1,-1) 북 · 서 / (+1,+1) 동 · 남

    원유   기존 본관 끝 (-111.5,21.5) → (-110.5,21.5..23.5) → y 23.5 동쪽 → 지하관 (-102.5 W → -95.5 E, 물 본관 x -100.5 · 새 물 기둥 x -96.5 밑)
           → x -94.5 북쪽 → y 9.5 동쪽 → 정유 2 원유 입력 (-90.5,9.5)
    물     물 본관 y 35.5 (펌프 (-85.5,35.5)) → (-96.5,34.5) 북쪽 x -96.5 → y 7.5 동쪽 → 정유 2 물 입력 (-90.5,7.5)  (황산 공장이 그 줄 위에 앉는다)
    정유 2 E (-87.5,8.5) advanced: 중유 (-84.5,6.5) 북 → 윤활유 화학 S (-85.5,2.5) → (-84.5,0.5) → 전기 엔진 조립기 2 S (-84.5,-1.5)
                                   경유 (-84.5,8.5) 동 y 8.5 → 경유 탱크 (-68.5,9.5)   석유 (-84.5,10.5) 동 y 10.5 → 석유 탱크 (-74.5,11.5)
           (탱크 25k 는 싱크 - 정유 2 는 윤활유가 쓰이는 만큼만 돈다. 나중에 고체연료 · 크래킹을 탱크에 붙인다)
    황산 화학 S (-91.5,5.5) 물 줄 y 7.5 위 → 출력 (-90.5,3.5) → 배터리 화학 S (-91.5,1.5)
    로봇 줄 y -6.5: 철탄 (-92.5) · 회로 3 (-88.5) · 전선 4 (-84.5) · 틀 1 · 2 (조립기 2, -80.5 · -76.5) · 로봇 (-72.5) · 로보포트 (-68.5) · 고급회로 5 (-64.5)

    python scripts/p4_24.py --run run24                          # 단계별로 몇 개 섰나 · 막힌 자리
    python scripts/p4_24.py --run run24 --stage crude2 --who alpha,charlie
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
POLE, PTG, ASM1, ASM2 = "small-electric-pole", "pipe-to-ground", "assembling-machine-1", "assembling-machine-2"
CHEM, TANK = "chemical-plant", "storage-tank"
p1.COST.update({
    "pipe": {"iron-plate": 1}, PTG: {"iron-plate": 7.5},
    ASM1: {"iron-plate": 22, "copper-plate": 4.5},
    ASM2: {"iron-plate": 35, "copper-plate": 9, "steel-plate": 2},          # 조립기 1 + 강철 2 + 회로 3 + 톱니 5
    "oil-refinery": {"iron-plate": 45, "copper-plate": 15, "steel-plate": 15, "stone-brick": 10},
    CHEM: {"iron-plate": 20, "copper-plate": 7.5, "steel-plate": 5},
    TANK: {"iron-plate": 20, "steel-plate": 5},
    "gun-turret": {"iron-plate": 40, "copper-plate": 10},
    "stone-wall": {"stone-brick": 5},
    # 로보포트: 강철 45 · 톱니 45 (철 90) · 고급회로 45 (플라스틱 90 · 회로 90 (철 90 · 구리 135) · 전선 180 (구리 90))
    "roboport": {"steel-plate": 45, "iron-plate": 180, "copper-plate": 225, "plastic-bar": 90},
    # 저장 상자: 강철 상자 (강철 8) + 회로 3 + 고급회로 1
    "storage-chest": {"steel-plate": 8, "iron-plate": 5, "copper-plate": 10, "plastic-bar": 2},
    "passive-provider-chest": {"steel-plate": 8, "iron-plate": 5, "copper-plate": 10, "plastic-bar": 2},
})
p1.PAIRED.add(PTG)
p1.SIZE.update({TANK: 3, ASM2: 3, CHEM: 3, "oil-refinery": 5, "roboport": 4, "gun-turret": 2})
b = p1.b

REF2 = (-87.5, 8.5)            # E: 물 (-90.5,7.5) · 원유 (-90.5,9.5) · 중유 (-84.5,6.5) · 경유 (-84.5,8.5) · 석유 (-84.5,10.5)
LUBE = (-85.5, 2.5)            # S: 입력 1 (-84.5,4.5) · 출력 3 (-84.5,0.5)
EENG = (-84.5, -1.5)           # 조립기 2 S: 입력 (-84.5,0.5)
ACID = (-91.5, 5.5)            # S: 입력 1 (-90.5,7.5) · 2 (-92.5,7.5) 둘 다 물 줄 · 출력 3 (-90.5,3.5)
BATT = (-91.5, 1.5)            # S: 입력 1 (-90.5,3.5)
TANK_L = (-68.5, 9.5)          # 서쪽 포트 (-69.5,8.5) → (-70.5,8.5)
TANK_P = (-74.5, 11.5)         # 서쪽 포트 (-75.5,10.5) → (-76.5,10.5)
ROW_Y = -6.5
ROBO = {"pierce": (-92.5, ROW_Y, ASM1), "circuit3": (-88.5, ROW_Y, ASM1), "cable4": (-84.5, ROW_Y, ASM1),
        "frame1": (-80.5, ROW_Y, ASM2), "frame2": (-76.5, ROW_Y, ASM2), "robot1": (-72.5, ROW_Y, ASM1),
        "roboport1": (-68.5, ROW_Y, ASM1), "adv5": (-64.5, ROW_Y, ASM1)}


def crude2_steps():
    out = [b("pipe", -110.5, y) for y in (21.5, 22.5, 23.5)]
    out += [b("pipe", x + 0.5, 23.5) for x in range(-110, -103)]
    out += [b(PTG, -102.5, 23.5, W), b(PTG, -95.5, 23.5, E)]
    out += [b("pipe", -94.5, y + 0.5) for y in range(9, 24)]
    out += [b("pipe", x + 0.5, 9.5) for x in range(-94, -90)]
    return out


def water2_steps():
    out = [b("pipe", -96.5, y + 0.5) for y in range(7, 35)]
    out += [b("pipe", x + 0.5, 7.5) for x in range(-96, -90)]
    return out


def ref2_steps():
    out = [b("oil-refinery", REF2[0], REF2[1], E)]
    out += [b("pipe", -84.5, y) for y in (6.5, 5.5, 4.5)]                  # 중유 → 윤활유
    out += [b(CHEM, LUBE[0], LUBE[1], S), b("pipe", -84.5, 0.5), b(ASM2, EENG[0], EENG[1], S)]
    out += [b("pipe", x + 0.5, 8.5) for x in range(-85, -70)]              # 경유 → 탱크 L
    out += [b(TANK, TANK_L[0], TANK_L[1])]
    out += [b("pipe", x + 0.5, 10.5) for x in range(-85, -76)]             # 석유 → 탱크 P
    out += [b(TANK, TANK_P[0], TANK_P[1])]
    out += [b(POLE, -87.5, 12.5), b(POLE, -91.5, 8.5), b(POLE, -89.5, 3.5), b(POLE, -82.5, 1.5)]
    return out


def acid_steps():
    return [b(CHEM, ACID[0], ACID[1], S), b("pipe", -90.5, 3.5), b(CHEM, BATT[0], BATT[1], S)]


def robo_steps():
    out = [b(name, x, y) for x, y, name in ROBO.values()]
    out += [b(POLE, x, -4.5) for x in (-93.5, -86.5, -79.5, -72.5, -65.5)]
    return out


# 둘째 줄 y -10.5 (벽 y -12.5 안쪽): 벽 (벽돌 → 벽) · 포탑 · 수리팩 · 톱니 4 - 로봇망 저장 상자의 «재건 세트» 재료 (relay 가 상자로, 품목 상한)
ROW2_Y = -10.5
ROBO2 = {"wallasm": (-88.5, ROW2_Y, ASM1), "turretasm": (-84.5, ROW2_Y, ASM1), "repair": (-80.5, ROW2_Y, ASM1), "gear4": (-76.5, ROW2_Y, ASM1)}


def robo2_steps():
    out = [b(name, x, y) for x, y, name in ROBO2.values()]
    out += [b(POLE, x, -8.5) for x in (-86.5, -79.5)]
    return out


# 로보포트 망 (construction-robotics 뒤). 물류 주황 네모가 닿게 (중심 |dx|,|dy| ≤ 50) 한 망으로 잇는다 - 22:15 can_place 확인.
#   동 R_E (100,-15): 동쪽 줄 x 125~135 (25~35 안쪽) · 석탄 · 돌 · 철 남쪽        허브 R_H (56,-15)       가운데 R_M (8,-10)
#   물가 R_L (-38,14): 연구소 · 조립 줄 · 북쪽 물가 줄        서 R_W (-82,20): 정유 1 · 2 · 발전 · 서쪽 줄 x -100/-124 · 남서 정유 줄
#   남 R_S (64,34) → 구리 R_C (74,70): 구리 남서 면        (철 북쪽 R_N (78,-42) - 벽 y -70.5 가 R_E · R_H 건설 반경 55 밖이라 다음)
#   포트마다 옆에 저장 상자 하나 (x+3.5): relay NET_STOCK 이 벽 · 포탑 · 수리팩을 상자마다 상한까지 (망 저장이 차면 로봇이 선다 - 23회차 §3-10)
PORTS = {"R_E": (100, -15), "R_H": (56, -15), "R_W": (-82, 20), "R_C": (74, 70), "R_M": (8, -10), "R_L": (-38, 14), "R_S": (64, 34)}
PORTS2 = {"R_N": (78, -42)}


def ports_steps(ports=PORTS):
    out = []
    for x, y in ports.values():
        out += [b("roboport", x, y), b("storage-chest", x + 3.5, y + 0.5)]
    return out


# 플라스틱 둘째 (22:36: 로보포트 셋이 플라스틱 80 씩 기다림 - 10분 374 를 파랑의 고급회로가 거의 다 먹는다).
#   석유 탱크 P 의 동쪽 포트 (-73.5,12.5) → (-72.5,12.5) = 화학 W (-71.5,11.5) 입력 1 칸. 석탄 · 결과는 relay CHEM.
PLASTIC2 = (-71.5, 11.5)


def plastic2_steps():
    return [b(CHEM, PLASTIC2[0], PLASTIC2[1], W)]


# 22:40 실측: 로보포트 R_E · R_M · R_C 가 no_power (에너지 0) - 망 1 전봇대가 7.5~9.6 칸 떨어져 공급 5×5 가 포트 4×4 에 안 닿았다.
#   벽 유령 시험 (22:39 동쪽 벽 (134.5,-20.5) die → 유령) 이 30 초 넘게 안 지어져 알았다. 포트마다 공급이 겹치는 전봇대 하나 (망 1 전봇대와 7.5 칸 안).
PORT_POLES = [(103.5, -12.5), (5.5, -12.5), (70.5, 68.5), (-38.5, 11.5)]


def portpower_steps():
    return [b(POLE, x, y) for x, y in PORT_POLES]


# L0 (logistic-robotics): 물류 로봇 조립기 (-72.5,-10.5) + 허브 줄 끝 공급 상자 2 (72.5 · 73.5, -15.5) - relay 가 허브로 보고 판을 넣는다
#   → 허브 재고가 R_H 망에 보인다 (캐릭터 요청 · 건설 로봇 재료). relay 줄은 아직 안 지운다 (P4-3 표).
def lrobo_steps():
    return [b(ASM1, -72.5, -10.5), b(POLE, -72.5, -8.5),
            b("passive-provider-chest", 72.5, -15.5), b("passive-provider-chest", 73.5, -15.5)]


# 유전 R_O (-190,28): SW 둥지 (658 ×4) 에서 가장 가까운 우리 것 (유전 포탑 9 · 펌프잭). 남서 벽 모서리 (-216.5,53.5) 에서 ~35 칸 안쪽,
#   건설 반경 55 가 유전 포탑 · 벽 전부를 덮는다. 따로 도는 망 (기지 망과 안 이어짐) - 저장 상자 · 로봇은 relay 가 포트마다 상한으로.
#   전봇대 (-188.5,30.5) 의 공급이 포트에 닿는다 (can_place · 거리 확인). 떠나기 직전 출정 조건 (p3_24.oil_ok) 을 다시 잰다.
PORTS_OIL = {"R_O": (-190, 28)}


STAGES = {"portoil": lambda: ports_steps(PORTS_OIL), "lrobo": lrobo_steps, "portpower": portpower_steps, "plastic2": plastic2_steps, "ports": ports_steps, "ports2": lambda: ports_steps(PORTS2), "crude2": crude2_steps, "water2": water2_steps, "ref2": ref2_steps, "acid": acid_steps, "robo": robo_steps, "robo2": robo2_steps}


# 로봇이 짓는 것 (23회차 방식: 사람은 전초, 벽 안은 로봇 유령). 유령만 놓는다 (사람이 청사진을 놓는 일) - 재료는 망 저장 상자 (relay NET_STOCK),
#   탄은 relay 가 모든 포탑에 (로봇은 탄을 안 넣는다). 망 건설 반경 안인지 · 망 재고가 있는지 먼저 묻는다.
#   swghost: SW 틈 337 (가장 작음) - 정유 · 발전 남서 줄 (P3 refsw 10) 안쪽 둘째 겹 6, R_W 건설 반경 안 (22:45 can_place ghost_revive 확인)
GHOSTS = {"swghost": [("gun-turret", x, y) for x, y in ((-126, 40), (-118, 44), (-108, 44), (-96, 46), (-126, 32), (-86, 46))]}


def place_ghosts(ai, name) -> dict:
    packed = ";".join(f"{n},{x},{y}" for n, x, y in GHOSTS[name])
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {placed = 0, skip = 0, nonet = 0}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local pos = {tonumber(x), tonumber(y)}
        local nets = s.find_logistic_networks_by_construction_area(pos, f)
        if #nets == 0 then out.nonet = out.nonet + 1
        elseif s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.6} > 0
            or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.6} > 0 then out.skip = out.skip + 1
        elseif s.can_place_entity{name = n, position = pos, force = f, build_check_type = defines.build_check_type.ghost_revive} then
          s.create_entity{name = "entity-ghost", inner_name = n, position = pos, force = f}
          out.placed = out.placed + 1
        end
      end
      return out
    end)()""" % packed)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--ghosts", default="", choices=("", *GHOSTS))
    ap.add_argument("--who", default="")
    ap.add_argument("--rounds", type=int, default=10)
    a = ap.parse_args()
    ai = AIBridge()
    if a.ghosts:
        print(a.ghosts, place_ghosts(ai, a.ghosts))
        return 0
    for name, fn in STAGES.items():
        steps = fn()
        bad = p1.blocked(ai, steps)
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(bad)} {[x for x in bad if not x.endswith('|tree')][:6]}", flush=True)
    crew = [n.strip() for n in a.who.split(",") if n.strip()]
    if not (crew and a.stage):
        return 0
    # 22:30 실측: craft 가 비차단 (P0 함정) 이라 로보포트 (손제작 ~5 분) 를 다 만들기 전에 build 가 돌아 실패하고 순번만 넘어갔다
    #   (가방에 로보포트를 든 채 놀던 넷). 이 파일의 단계는 craft 를 wait="block" 으로.
    _fetch = p1.fetch
    p1.fetch = lambda ai_, who, need: [(k, dict(p, wait="block")) if k == "craft" else (k, p) for k, p in _fetch(ai_, who, need)]
    if a.stage == "portoil":
        from p3_24 import oil_ok
        if not oil_ok(ai):
            return 2
    owner = "p4_24_" + a.stage
    os.environ[detached.ENV] = owner
    detached.mark(crew, owner, minutes=90)
    try:
        ok = p1.build_stage(ai, crew, STAGES[a.stage](), a.stage, rounds=a.rounds)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

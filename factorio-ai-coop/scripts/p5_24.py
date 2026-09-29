"""P5 builder for run 24: labs + science assemblers (packs to the lab's appetite), oil cracking + second sulfur, L1 inserter links.

짓는 엔진은 p1.build_stage (허브 판으로 만들고, 막힌 자리는 벌목 · 바위, 선 것은 건너뜀). 물건은 relay24 가 옮긴다.

22:48 진단 (docs/run24-site.md P5): 빨강 · 초록 조립기 절반이 full_output - 연구소 10 이 먹는 만큼만 만든다 → 연구소를 먼저 늘린다.
파랑은 황 → 석유가스. 정유 2 (advanced) 가 중유 (윤활유만큼만 빠짐) 에 막혀 10 분에 132 초만 돈다 → 중유 · 경유 분해 + 둘째 황.

기름 블록 (물가 블록 동쪽, 로봇 줄 y -6.5 와 정유 2 · 탱크 줄 y 8.5 · 10.5 사이 빈 땅 x -84..-65, y 0..7).
유체 포트는 p4_24 머리말 표 그대로 (화학 S: 입력 1 (+1,+2) · 입력 2 (-1,+2) · 출력 3 (+1,-2) · 출력 4 (-1,-2)).
레시피 재료 순서 (게임에 물음): heavy-oil-cracking 물 30 · 중유 40 → 경유 30 / light-oil-cracking 물 30 · 경유 30 → 가스 20 / sulfur 물 30 · 가스 30 → 황 2.
서로 다른 유체의 관이 이웃하지 않게 - 건너야 하는 곳은 모두 지하관 (지하관은 한쪽 입구 · 지하로만 잇는다):

    물   새 해안 펌프 (-77.5,23.5) E (출구 서쪽 (-78.5,23.5)) → x -79.5 북쪽 → 지하 (y 18.5 ↔ 14.5, 증기 기관 밑) → (-79.5,12.5)
         → 물 줄 y 12.5 (x -81.5..-78.5) → 지하 (y 11.5 ↔ 6.5, 석유 줄 y 10.5 · 경유 줄 y 8.5 밑) → HC 입력 1 (-81.5,6.5) · LC 입력 1 (-78.5,6.5)
         → 지하 (-77.5 ↔ -69.5, 탱크 P · 플라스틱 둘째 밑) → x -65.5 북쪽 (탱크 L 동쪽 포트 (-66.5,10.5) 한 칸 띄움) → y 6.5 서쪽
         → 지하 (-70.5 ↔ -72.5, HC 경유 기둥 x -71.5 밑) → S2 입력 1 (-74.5,6.5)
    중유 정유 2 중유 기둥 (-84.5,6.5) → (-83.5,6.5) → HC S (-82.5,4.5) 입력 2
    경유 HC 출력 3 (-81.5,2.5) → y 0.5 동쪽 → x -71.5 남쪽 → 경유 줄 (-71.5,8.5)       LC 입력 2 (-80.5,6.5) ← (-80.5,7.5) ← 경유 줄 (-80.5,8.5)
    가스 LC S (-79.5,4.5) 출력 3 (-78.5,2.5) → (-77.5,2.5..6.5) → S2 입력 2 (-76.5,6.5)
                                                      └ 지하 (-77.5, 7.5 ↔ 9.5, 경유 줄 밑) → 석유 줄 (-77.5,10.5) → 탱크 P · 플라스틱 둘째
    S2 S (-75.5,4.5) sulfur - 황은 relay CHEM 이 허브로 (≤ 600)

    python scripts/p5_24.py --run run24                          # 단계별로 몇 개 섰나 · 막힌 자리
    python scripts/p5_24.py --run run24 --stage labs5 --who echo,foxtrot
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401  (--run 을 먼저 뽑는다)
import p1                                 # noqa: E402
import p4_24                              # noqa: E402  (COST · SIZE · PTG 짝 - 조립기 2 · 화학 · 지하관)
import detached                           # noqa: E402
from client import AIBridge               # noqa: E402

N, E, S, W = 0, 4, 8, 12
POLE, PTG, ASM1, CHEM, INS = "small-electric-pole", "pipe-to-ground", "assembling-machine-1", "chemical-plant", "inserter"
p1.COST.update({"lab": {"iron-plate": 36, "copper-plate": 15}})
b = p1.b

# 연구소 8 (파랑 블록 동쪽 빈 땅, 난파선 조각 x < 2 밖). 전봇대는 줄 사이 y -2.5, (-1.5,-0.5) 망에서 (2.5,-2.5) 로 잇는다.
LABS5 = [(x, y) for y in (-4.5, -0.5) for x in (4.5, 8.5, 12.5, 16.5)]
LAB5_POLES = [(2.5, -2.5), (6.5, -2.5), (10.5, -2.5), (14.5, -2.5)]
LAB5_BOX = [2, -7, 19, 2]


def labs5_steps():
    return [b(POLE, x, y) for x, y in LAB5_POLES] + [b("lab", x, y) for x, y in LABS5]


# 과학 조립기 7 (y 8.5 줄 동쪽으로): 빨강 6 · 7 (5 대 = 300 상한 → 420) · 초록 6 · 7 (250 → 350) · 엔진 5 · 6 (120 → 180, 파랑 150 몫) · 고급회로 6
SCI5 = {"red6": (-9.5, 8.5, "automation-science-pack"), "red7": (-5.5, 8.5, "automation-science-pack"),
        "green6": (-1.5, 8.5, "logistic-science-pack"), "green7": (2.5, 8.5, "logistic-science-pack"),
        "eng5": (6.5, 8.5, "engine-unit"), "eng6": (10.5, 8.5, "engine-unit"), "adv6": (14.5, 8.5, "advanced-circuit")}
SCI5_POLES = [(-11.5, 6.5), (-7.5, 6.5), (-0.5, 6.5), (6.5, 6.5), (13.5, 6.5)]


def sci5_steps():
    return [b(POLE, x, y) for x, y in SCI5_POLES] + [b(ASM1, x, y) for x, y, _ in SCI5.values()]


def crack_steps():
    out = [b(CHEM, -82.5, 4.5, S), b(CHEM, -79.5, 4.5, S), b(CHEM, -75.5, 4.5, S), b(POLE, -76.5, 1.5)]
    # 물
    out += [b("offshore-pump", -77.5, 23.5, E), b("pipe", -78.5, 23.5), b("pipe", -79.5, 23.5)]
    out += [b("pipe", -79.5, y) for y in (22.5, 21.5, 20.5, 19.5)]
    out += [b(PTG, -79.5, 18.5, S), b(PTG, -79.5, 14.5, N), b("pipe", -79.5, 13.5)]
    out += [b("pipe", x, 12.5) for x in (-81.5, -80.5, -79.5, -78.5)]
    out += [b(PTG, -81.5, 11.5, S), b(PTG, -81.5, 6.5, N), b(PTG, -78.5, 11.5, S), b(PTG, -78.5, 6.5, N)]
    out += [b(PTG, -77.5, 12.5, W), b(PTG, -69.5, 12.5, E)]
    out += [b("pipe", x, 12.5) for x in (-68.5, -67.5, -66.5, -65.5)]
    out += [b("pipe", -65.5, y) for y in (11.5, 10.5, 9.5, 8.5, 7.5, 6.5)]
    out += [b("pipe", x, 6.5) for x in (-66.5, -67.5, -68.5, -69.5)]
    out += [b(PTG, -70.5, 6.5, E), b(PTG, -72.5, 6.5, W), b("pipe", -73.5, 6.5), b("pipe", -74.5, 6.5)]
    # 중유 · 경유
    out += [b("pipe", -83.5, 6.5), b("pipe", -80.5, 6.5), b("pipe", -80.5, 7.5)]
    out += [b("pipe", -81.5, 2.5), b("pipe", -81.5, 1.5)]
    out += [b("pipe", x + 0.5, 0.5) for x in range(-82, -71)]
    out += [b("pipe", -71.5, y) for y in (1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5)]
    # 가스
    out += [b("pipe", -78.5, 2.5), b("pipe", -77.5, 2.5)]
    out += [b("pipe", -77.5, y) for y in (3.5, 4.5, 5.5, 6.5)]
    out += [b("pipe", -76.5, 6.5), b(PTG, -77.5, 7.5, N), b(PTG, -77.5, 9.5, S)]
    return out


# L1 (docs P4-3 표): 맞붙은 조립기 사이 팔 직결 - relay FEEDS 한 줄씩을 대신한다. 팔 direction = 집는 쪽 (playbook 실측).
#   이 줄이 돌고 받는 조립기가 굶지 않는 것을 확인한 뒤에야 relay 의 그 줄을 지운다 (L1_DROP).
L1 = {"gear>red1": (-47.5, 3.5, W), "gear>inserter": (-49.5, 1.5, S), "cable2>circuit2": (-19.5, 3.5, W),
      "gear3>red5": (-23.5, 8.5, E), "pipe>eng2": (-15.5, -4.5, E), "adv4>blue5": (-15.5, 8.5, W)}
L1_POLES = [(-23.5, 6.5), (-15.5, 6.5)]


def l1_steps():
    return [b(POLE, x, y) for x, y in L1_POLES] + [b(INS, x, y, d) for x, y, d in L1.values()]


# 여덟째 발전 단위 (P5 수요 선행: 연구소 8 · 조립기 7 · 화학 3 ≈ +1.7 MW → 12.6 MW 에 ~8.2 MW = 1.54 배): power6 의 보일러 3 동쪽 포트
#   (-19.5,46.5) 에 관 → 보일러 4 (-17.5,46) 북향 · 기관 (-17.5, 42.5 / 37.5) · 전봇대 (-19.5,40.5). 같은 펌프 (보일러 넷, 펌프 하나 = 보일러 20 몫).
def power8_steps():
    return [b("pipe", -19.5, 46.5), b("boiler", -17.5, 46, N), b("steam-engine", -17.5, 42.5, N), b("steam-engine", -17.5, 37.5, N),
            b(POLE, -19.5, 40.5)]


# 로봇이 짓는 방어 (P4 swghost 와 같은 방식 - 유령만 놓고, 재료는 망 저장 상자 (relay NET_STOCK), 탄은 relay).
#   oilnw (22:58 raidwatch: **W 틈 110 - 둥지(조회) 465 ×1, 새 확장** · NW 틈 218 (468)) - 서쪽에서 가장 가까운 우리 것은 유전 (R_O 망).
#   유전 W 벽 (x -216.5, y 16..53) 이 북쪽에서 끝난다 → 북벽 y 11.5 (x -216.5..-182.5) + 서벽 잇기 (y 12.5..15.5) + 안쪽 포탑 4.
#   나무는 발자리만 벌목 표시 (로봇이 벤다) - 유령은 blueprint_ghost 검사 (나무는 통과, 건물 · 물은 막힘).
GHOSTS = {"oilnw": [("gun-turret", x, y) for x, y in ((-212, 22), (-212, 14), (-202, 15), (-192, 15))]
          + [("stone-wall", x + 0.5, 11.5) for x in range(-217, -182)] + [("stone-wall", -216.5, y + 0.5) for y in range(12, 16)],
          # refnw (23:18 W 틈 89 · NW 190): 정유 · 발전 서쪽 줄 (x -124: y 6 · 14 · 24) 과 물가 서 (-100,-4) 사이 북서 모서리가 비었다 - R_W 망
          "refnw": [("gun-turret", x, y) for x, y in ((-124, -2), (-118, -9), (-110, -12))]}


def place_ghosts(ai, name) -> dict:
    packed = ";".join(f"{n},{x},{y}" for n, x, y in GHOSTS[name])
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {placed = 0, skip = 0, nonet = 0, blocked = 0, trees = 0}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local pos = {tonumber(x), tonumber(y)}
        local r = (n == "gun-turret") and 1 or 0.5
        if #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
        elseif s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.6} > 0
            or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.6} > 0 then out.skip = out.skip + 1
        else
          for _, t in pairs(s.find_entities_filtered{type = {"tree", "simple-entity"}, area = {{pos[1] - r, pos[2] - r}, {pos[1] + r, pos[2] + r}}}) do
            if not t.to_be_deconstructed() then t.order_deconstruction(f); out.trees = out.trees + 1 end
          end
          if s.can_place_entity{name = n, position = pos, force = f, build_check_type = defines.build_check_type.blueprint_ghost, forced = true} then
            s.create_entity{name = "entity-ghost", inner_name = n, position = pos, force = f}
            out.placed = out.placed + 1
          else out.blocked = out.blocked + 1 end
        end
      end
      return out
    end)()""" % packed)


# 피어싱 둘째 (P5-4): 포탑 56 중 18 만 피어싱 (22:44) - 조립기 1 = 10분 ~100 = 포탑 5. 로봇 둘째 줄 끝 (-68.5,-10.5), 전봇대 (-66.5,-8.5).
#   재료: 허브 노랑 탄창 700 (피어싱으로 바꾸며 돌려받은 것) · 강철 · 구리 (relay FEEDS).
def pierce2_steps():
    return [b(POLE, -66.5, -8.5), b(ASM1, -68.5, -10.5)]


# 강철로 교체 (advanced-material-processing 23:0x 완료): 철 전기 쌍 27 은 채굴기 0.5/s 를 돌 화로 0.3125/s 가 막는다 (10분 5,011 = 상한).
#   강철로 (속도 2) 면 채굴기 몫 0.5/s → 철판 +60%. 사람 하나가 허브 강철 · 벽돌로 강철로를 만들어 R_H 저장 상자에 넣고,
#   화로마다 order_upgrade → 로봇이 바꾼다 (돌 화로 · 든 판은 망 저장으로). 먼저 철 (PLATES 구역), 그다음 강철 화로 8.
SF_BOXES = {"iron": [[68, -68, 103, -41]], "steel": [[72.5, -13.5, 93.5, -7.5]]}
SF_STORE = (59.5, -14.5)          # R_H (56,-15) 옆 저장 상자


def sfurn(ai, who, which) -> dict:
    boxes = SF_BOXES[which]
    n = sum(int(ai.lua("""(function() return {n = game.surfaces[1].count_entities_filtered{name = "stone-furnace", force = "player", area = {{%f, %f}, {%f, %f}}}} end)()""" % tuple(bx)).get("n", 0)) for bx in boxes)
    if n == 0:
        return {"left": 0}
    from orders import submit
    h = p1.hub(ai)
    plan = []
    for m, k in (("steel-plate", 6), ("stone-brick", 10)):
        x, y, c = h[m]
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": m, "x": x, "y": y, "count": k * n})]
    plan += [("craft", {"recipe": "steel-furnace", "count": n, "wait": "block"}),
             ("walk_to", {"x": SF_STORE[0], "y": SF_STORE[1] + 1.5}),
             ("insert", {"name": "steel-furnace", "x": SF_STORE[0], "y": SF_STORE[1], "count": n}),
             ("walk_to", {"x": p1.PARK[0], "y": p1.PARK[1]})]
    submit(ai, who, plan, strict=False)
    return {"left": n}


def sfurn_order(ai, which) -> dict:
    out = {}
    for bx in SF_BOXES[which]:
        r = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local n = 0
          for _, fu in pairs(s.find_entities_filtered{name = "stone-furnace", force = f, area = {{%f, %f}, {%f, %f}}}) do
            if not fu.to_be_upgraded() then fu.order_upgrade{force = f, target = "steel-furnace"}; n = n + 1 end
          end
          return {ordered = n, steel = s.count_entities_filtered{name = "steel-furnace", force = f, area = {{%f, %f}, {%f, %f}}}}
        end)()""" % (tuple(bx) * 2))
        out[str(bx)] = r
    return out


# 석탄 (23:15 실측): 10분 캠 1,802 < 씀 2,452 (보일러 8 · 플라스틱) - 석탄 밭 상자 1,666 은 ~25 분 몫 → 전력 붕괴 전에 (23회차 §3-14).
#   옛 버너 줄 자리 (y -29..-20) 가 비었고 가장 진하다. 기존 전기 줄 (x, -32) 남향과 마주 보게 (x, -27.5) 북향 6 - 같은 상자 (x, -29.5) 에 붓는다.
def coal2_steps():
    return [b("electric-mining-drill", 107.5 + 3 * i, -27.5, N) for i in range(6)]


# 아홉째 · 열째 발전 단위 (23:15 실측 14.4 MW 에 10.70 MW = 1.35 배 - 문턱 1.5 밑): power8 동쪽으로 같은 모양 둘 더 (보일러 여섯, 펌프 하나).
def power9_steps():
    out = []
    for bx in (-13.5, -9.5):
        out += [b("pipe", bx - 2, 46.5), b("boiler", bx, 46, N), b("steam-engine", bx, 42.5, N), b("steam-engine", bx, 37.5, N), b(POLE, bx - 2, 40.5)]
    return out


STAGES = {"coal2": coal2_steps, "power9": power9_steps, "pierce2": pierce2_steps, "power8": power8_steps, "labs5": labs5_steps, "sci5": sci5_steps, "crack": crack_steps, "l1": l1_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--ghosts", default="", choices=("", *GHOSTS))
    ap.add_argument("--who", default="")
    ap.add_argument("--rounds", type=int, default=12)
    ap.add_argument("--sfurn", default="", choices=("", *SF_BOXES), help="강철로: --who 한 사람이 만들어 저장 상자에 (그다음 --sfurn-order)")
    ap.add_argument("--sfurn-order", default="", choices=("", *SF_BOXES))
    a = ap.parse_args()
    ai = AIBridge()
    if a.sfurn:
        print(a.sfurn, sfurn(ai, a.who, a.sfurn))
        return 0
    if a.sfurn_order:
        print(a.sfurn_order, sfurn_order(ai, a.sfurn_order))
        return 0
    if a.ghosts:
        print(a.ghosts, place_ghosts(ai, a.ghosts))
        return 0
    for name, fn in STAGES.items():
        steps = fn()
        bad = p1.blocked(ai, steps)
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(bad)} {[x for x in bad if not x.endswith('|tree')][:8]}", flush=True)
    crew = [n.strip() for n in a.who.split(",") if n.strip()]
    if not (crew and a.stage):
        return 0
    # craft 는 비차단이다 (P0 · P4 함정) - 다 만들기 전에 build 가 돌지 않게 block
    _fetch = p1.fetch
    p1.fetch = lambda ai_, who, need: [(k, dict(p, wait="block")) if k == "craft" else (k, p) for k, p in _fetch(ai_, who, need)]
    owner = "p5_24_" + a.stage
    os.environ[detached.ENV] = owner
    detached.mark(crew, owner, minutes=90)
    try:
        ok = p1.build_stage(ai, crew, STAGES[a.stage](), a.stage, rounds=a.rounds)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Run 24 철 교착 풀기 (14:0x) - 동쪽 전초 드릴 · 인서터 손제작 보급 (delta) + 기지 곁 광맥 (80,-66) 드릴 여섯 (foxtrot).

Lua 아이템 이동 0 - 사람이 걸어서 꺼내고 (take) · 손제작 · 손으로 넣고 (insert) · 짓고 (build, can_place manual) · 뜯는다 (demolish r 0.3).

동쪽 (`--east`, delta):
  망 철 0 · 녹색 0 이라 전초 유령 (드릴 42 · 인서터 84) 이 재료를 못 받는다. 망 밖 철을 사람이 모은다:
  허브 쇠 상자 셋 (67.5 · 68.5 · 70.5, -15.5) + 거름 상자 (71.5,-46.5, P13 거름 팔 - 필터는 석탄 · 광석, 철판은 옛 재고) ·
  톱니 (망 저장 상자 (-76.5,-13.5)) · 전선 (망 저장 상자 (67.5,34.5)) → 녹색 · 인서터 · 드릴 손제작 (비차단, 걸으며) →
  서쪽 문 저장 상자 (344.5,-104.5) 에 손으로 → 전초 로봇 25 가 유령을 짓는다. 허브 쇠 상자 (74.5,-15.5) 는 eastsup 몫이라 안 건드림.
기지 곁 (`--p80`, foxtrot):
  (80,-80) 청크 광맥은 벽 (y -71) 밖 북쪽 ~63 칸 + 벽 안 y -68..-64 (옛 버너 줄 자리, ~45k). 벽 안 줄에 옛 화로 결과 팔 6 (집을 곳 없음, 필터 없음) ·
  작은 전봇대 4 (y -66.5) 가 드릴 자리를 막는다 → 새 작은 전봇대 4 (y -67.5) 먼저 짓고 옛 넷 · 팔 여섯을 뜯음.
  드릴 6 (x 73.5 · 76.5 · 79.5 · 82.5 · 85.5 · 91.5, y -65.5, 남향) → 옛 판 벨트 (y -63.5, 서향, 끝이 판 줄기 x 69.5 에 옆싣기) -
  끝 (71.5,-63.5) 을 남향으로 다시 놓고 (71.5,-62.5..-59.5) 남 · (71.5,-58.5) 동 → 광석 벨트 y -58.5 (동 → 줄 C 강철로 7, 5 곳 no_ingredients).
  처리량: 드릴 6 × 0.5 × (1 + 채굴 생산성) ≈ 3.3/s + 기존 2 대 1.1/s ≈ 4.4/s = 노랑 벨트 15/s 의 30 % · 줄 C 7 × 0.625 = 4.4/s 에 맞음.

    python scripts/ironfix24.py --status
    python scripts/ironfix24.py --east   [--who delta]
    python scripts/ironfix24.py --p80    [--who foxtrot]
    python scripts/ironfix24.py --release delta foxtrot
"""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge  # noqa
from orders import submit  # noqa

OWNER = "ironfix24"
N, E, S, W = 0, 4, 8, 12
HOME = (70.5, -11.0)
WEST_GATE_STORE = (344.5, -104.5)
WEST_GATE_WALK = (343.0, -101.0)
GEARS = (-76.5, -13.5)
CABLE = (67.5, 34.5)
HUB_CU = (71.5, -15.5)
IRON_SRC = [(67.5, -15.5), (68.5, -15.5), (70.5, -15.5), (71.5, -46.5)]   # 망 밖 철 (허브 74.5 는 eastsup 몫)
DRILLS80 = [73.5, 76.5, 79.5, 82.5, 85.5, 91.5]
Y80 = -65.5
NEW_POLES = [75.5, 80.5, 86.5, 90.5]          # y -67.5
OLD_POLES = [76.5, 82.5, 85.5, 91.5]          # y -66.5
OLD_INS = [74.5, 77.5, 80.5, 83.5, 86.5, 92.5]  # y -64.5 (집을 곳 = 광석 칸, 필터 없음)
GROUND = [(77.5, -66.65), (80.5, -66.65), (83.5, -66.65)]

STATUS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local st = f.get_item_production_statistics(s)
  local function r(n, i) return math.floor(st.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index[i], count = true}) end
  local o = {tick = game.tick, ore10 = r('iron-ore', 'ten_minutes'), plate10 = r('iron-plate', 'ten_minutes'), ore1 = r('iron-ore', 'one_minute'), plate1 = r('iron-plate', 'one_minute')}
  local mn = s.find_logistic_network_by_position({66.5, -15.5}, f)
  o.net_iron = mn.get_item_count('iron-plate') o.net_circ = mn.get_item_count('electronic-circuit') o.net_pierce = mn.get_item_count('piercing-rounds-magazine')
  local A = {{330, -215}, {460, -60}}
  local sn = {} for k, v in pairs(defines.entity_status) do sn[v] = k end
  local function stat(area, name)
    local t = {} for _, e in pairs(s.find_entities_filtered{area = area, name = name, force = f}) do local k = sn[e.status] or '?' t[k] = (t[k] or 0) + 1 end return t
  end
  o.east_drill = stat(A, 'electric-mining-drill') o.east_furn = stat(A, 'steel-furnace')
  o.east_ghost = {drill = s.count_entities_filtered{area = A, ghost_name = 'electric-mining-drill'}, ins = s.count_entities_filtered{area = A, ghost_name = 'inserter'}, all = s.count_entities_filtered{area = A, type = 'entity-ghost'}}
  local en = s.find_logistic_network_by_position({347, -103}, f)
  if en then o.east_net = {drill = en.get_item_count('electric-mining-drill'), ins = en.get_item_count('inserter'), robots = en.all_construction_robots, avail = en.available_construction_robots} end
  o.p80 = stat({{70, -68}, {94, -63}}, 'electric-mining-drill')
  o.rowC = stat({{80, -45}, {102, -41}}, 'steel-furnace')
  o.foe_east = s.count_entities_filtered{area = {{300, -240}, {500, -40}}, force = 'enemy', type = 'unit'}
  return o
end)()"""


def east_plan(ai, who):
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    got = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for i, p in pairs(helpers.json_to_table('%s')) do local c = s.find_entities_filtered{position = p, radius = 0.3, type = 'container'}[1]
        o[i] = c and c.get_item_count('iron-plate') or 0 end
      return o end)()""" % json.dumps([list(p) for p in IRON_SRC]))
    got = list(got.values()) if isinstance(got, dict) else got
    iron = bag.get("iron-plate", 0) + sum(int(g) for g in got)
    circ_have = bag.get("electronic-circuit", 0)
    # 드릴 13 철 (녹색 3 포함) · 인서터 2 철 (녹색 1 포함) - 인서터 먼저 (강철로 46 이 팔 없이 멈춤 · 석탄 상자 팔도 유령)
    ins = min(80, iron // 2)
    drills = min(42, max(0, (iron - 2 * ins + circ_have) // 13))
    circ = max(0, 3 * drills + ins - circ_have)
    gears = max(0, 5 * drills + ins - bag.get("iron-gear-wheel", 0))
    cable = max(0, 2 * circ - bag.get("copper-cable", 0))
    plan = []
    for (x, y), n in zip(IRON_SRC, got):
        if int(n) > 0:
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "iron-plate", "x": x, "y": y, "count": int(n)})]
    if cable:
        plan += [("walk_to", {"x": CABLE[0], "y": CABLE[1] + 1.5}), ("take", {"name": "copper-cable", "x": CABLE[0], "y": CABLE[1], "count": cable})]
    if gears:
        plan += [("walk_to", {"x": GEARS[0], "y": GEARS[1] + 1.5}), ("take", {"name": "iron-gear-wheel", "x": GEARS[0], "y": GEARS[1], "count": gears})]
    if circ:
        plan.append(("craft", {"recipe": "electronic-circuit", "count": circ}))
    plan += [("craft", {"recipe": "inserter", "count": ins}), ("craft", {"recipe": "electric-mining-drill", "count": drills}),
             ("walk_to", {"x": WEST_GATE_WALK[0], "y": WEST_GATE_WALK[1]}),
             ("insert", {"name": "inserter", "x": WEST_GATE_STORE[0], "y": WEST_GATE_STORE[1], "count": ins}),
             ("insert", {"name": "electric-mining-drill", "x": WEST_GATE_STORE[0], "y": WEST_GATE_STORE[1], "count": drills}),
             ("walk_to", {"x": HOME[0], "y": HOME[1]})]
    return plan, {"iron": iron, "ins": ins, "drills": drills, "circ": circ, "gears": gears, "cable": cable}


def p80_plan(ai, who):
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    need_d = max(0, len(DRILLS80) - bag.get("electric-mining-drill", 0))
    circ = max(0, 3 * need_d - bag.get("electronic-circuit", 0))
    poles = max(0, len(NEW_POLES) - bag.get("small-electric-pole", 0))
    cable = 2 * circ + 2 * ((poles + 1) // 2) - bag.get("copper-cable", 0)
    plan = []
    if cable > 0:
        plan += [("walk_to", {"x": HUB_CU[0], "y": HUB_CU[1] + 1.5}), ("take", {"name": "copper-plate", "x": HUB_CU[0], "y": HUB_CU[1], "count": (cable + 1) // 2 + 2}),
                 ("craft", {"recipe": "copper-cable", "count": (cable + 1) // 2 + 1})]
    if poles:
        plan.append(("craft", {"recipe": "small-electric-pole", "count": (poles + 1) // 2}))
    if circ:
        plan.append(("craft", {"recipe": "electronic-circuit", "count": circ}))
    if need_d:
        plan += [("craft", {"recipe": "iron-gear-wheel", "count": 5 * need_d}), ("craft", {"recipe": "electric-mining-drill", "count": need_d})]
    # 새 전봇대 먼저 (망이 끊기지 않게), 옛 전봇대 · 팔 뜯기, 땅 광석 줍기
    for x in NEW_POLES:
        plan.append(("build", {"name": "small-electric-pole", "x": x, "y": -67.5, "direction": N}))
    for x in OLD_POLES:
        plan.append(("demolish", {"name": "small-electric-pole", "x": x, "y": -66.5, "search_radius": 0.3}))
    for x in OLD_INS:
        plan.append(("demolish", {"name": "inserter", "x": x, "y": -64.5, "search_radius": 0.3}))
    for x, y in GROUND:
        plan.append(("sweep", {"x": x, "y": y, "radius": 1}))
    # 벨트 끝 돌리기: 판 줄기 옆싣기 → 남쪽 광석 벨트
    plan.append(("demolish", {"name": "transport-belt", "x": 71.5, "y": -63.5, "search_radius": 0.3}))
    for y in (-63.5, -62.5, -61.5, -60.5, -59.5):
        plan.append(("build", {"name": "transport-belt", "x": 71.5, "y": y, "direction": S}))
    plan.append(("build", {"name": "transport-belt", "x": 71.5, "y": -58.5, "direction": E}))
    for x in DRILLS80:
        plan.append(("build", {"name": "electric-mining-drill", "x": x, "y": Y80, "direction": S}))
    plan.append(("walk_to", {"x": HOME[0], "y": HOME[1]}))
    return plan, {"drills_craft": need_d, "circ": circ, "poles": poles, "cable": cable}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--east", action="store_true")
    ap.add_argument("--p80", action="store_true")
    ap.add_argument("--who")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--release", nargs="*")
    a = ap.parse_args()
    ai = AIBridge()
    os.environ[detached.ENV] = OWNER
    if a.release:
        detached.release(a.release)
        print("released", a.release)
    if a.status:
        print(json.dumps(ai.lua(STATUS), ensure_ascii=False))
    for flag, fn, dflt in ((a.east, east_plan, "delta"), (a.p80, p80_plan, "foxtrot")):
        if not flag:
            continue
        who = a.who or dflt
        o = detached.owner(who)
        if o not in (None, OWNER):
            print(who, "owned by", o, "- skip")
            continue
        plan, info = fn(ai, who)
        print(who, info, len(plan), "steps")
        if a.dry:
            for s in plan:
                print("  ", s)
            continue
        detached.mark([who], OWNER, minutes=25)
        print(submit(ai, who, plan, strict=False))


if __name__ == "__main__":
    raise SystemExit(main())

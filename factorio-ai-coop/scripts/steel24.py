"""run24 강철 늘리기 - 새 강철로 기둥 12 (허브 동쪽, 로보포트 (100,-15) 동쪽). 목표 강철 10분 >= 1,500.

셈 (게임 값): 강철로 속도 2 · 강철 16 s → 로 1 대 0.125/s = 10분 75, 철 0.625/s · 석탄 90 kW / 4 MJ = 0.0225/s.
  옛 줄 9 대 = 10분 675 (08:2x 실측 676). 12 대 더 → 10분 1,575. 철 +7.5/s · 석탄 +0.27/s.

    철   smelt 가지 (줄기 빠른 분배기 (70,-22.5) → y -21.5 → x 96.5 남) 가 이미 가득 서 있다 (옛 줄이 다 먹고도 남음, 허브 16k 가득).
         가지 x 96.5 에 빠른 분배기 S_i (97,-12.5) → 동쪽 출구 (97.5,-11.5) → y -11.5 동 → x 102.5 북 → 입력 벨트 머리 (102.5,-13.5) 에 남쪽 옆 싣기 = 남 레인 철.
         가지 수요 5.6 (옛) + 7.5 (새) = 13.1/s → 노랑 15 는 1.15 배뿐 → 가지 y -21.5 · x 96.5 (분배기 위) 를 빠른 벨트로 (교체 표시, 30/s).
    석탄 보일러 석탄 벨트 y -24.5 (서향, 석탄 레인 가득) 에 분배기 S_c (103.5,-24) → x 102.5 남 → 입력 머리에 북쪽 옆 싣기 = 북 레인 석탄.
         가지가 차면 분배기가 전부 보일러 쪽으로 보낸다 (석탄 0.27/s 만 빠짐).
    입력 빠른 벨트 y -13.5 동향 x 102.5..118.5 (남 레인 철 15/s = 수요 7.5 의 2 배 · 북 레인 석탄) - 로보포트 (x 98..101, y -17..-14) · 저장 상자 (103.5,-14.5) 남쪽.
    화로 윗줄 A (x 109..119, y -16) · 아랫줄 B (y -11) 각 6. 팔: 입력 (y -14.5 · -12.5) · 결과 (y -17.5 · -9.5).
    결과 노랑 벨트: y -18.5 동 → x 120.5 남 → y -8.5 서 (전봇대 (106.5,-8.5) 는 지하) → x 98.5 북 → y -9.5 서 → 지하 (97.5 → 95.5, 가지 밑)
         → x 94.5 북 → y -11.5 서 → 옛 결과 벨트 머리 (92.5,-11.5) → 허브 강철 상자 (75.5,-15.5, 공급 상자 = 망)
         - 태양 (solarfeed, 로봇) · P12 (hauler) · 파랑 블록 (blhaul) 이 모두 여기서 가져간다.

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 건물이 선 칸 건너뜀) · 교체 표시 · 사람 손 (craft · take · insert · demolish · build).

    python scripts/steel24.py --run run24 check
    python scripts/steel24.py --run run24 kit        # foxtrot: 모자란 건물 손제작 → 저장 상자 (103.5,-14.5)
    python scripts/steel24.py --run run24 ghosts
    python scripts/steel24.py --run run24 upgrade    # 가지 노랑 → 빠른 (로봇)
    python scripts/steel24.py --run run24 splice     # foxtrot: 분배기 둘 (벨트 걷고 놓기)
    python scripts/steel24.py --run run24 status
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
import p7_24  # noqa: E402

N, E, S, W = 0, 4, 8, 12
INS, BELT, FBELT, FUG, UG, POLE = "inserter", "transport-belt", "fast-transport-belt", "fast-underground-belt", "underground-belt", "small-electric-pole"
FURN = "steel-furnace"
WHO = "foxtrot"
OWNER = "steel24"
STORE = (103.5, -14.5)                      # 로보포트 옆 저장 상자 - 로봇이 유령 재료를 여기서
p7_24.SIZE[FURN] = 2
p7_24.POWERED.add(INS)

PLAN = []


def add(name, x, y, d=N, ex=None):
    PLAN.append(("col", name, float(x), float(y), d, ex))


FX = [109, 111, 113, 115, 117, 119]           # 화로 칸 x 108..119
for _x in FX:
    add(FURN, _x, -16)                      # A (칸 y -17..-16)
    add(FURN, _x, -11)                      # B (칸 y -12..-11)
    add(INS, _x - 0.5, -17.5, S)            # A 결과 → y -18.5
    add(INS, _x - 0.5, -14.5, S)            # 입력 → A
    add(INS, _x - 0.5, -12.5, N)            # 입력 → B
    add(INS, _x - 0.5, -9.5, N)             # B 결과 → y -8.5
# 입력 벨트 (빠른, 동향, y -13.5) - 머리 (102.5,-13.5) 에 북 (석탄) · 남 (철) 옆 싣기
for _x in range(102, 119):
    add(FBELT, _x + 0.5, -13.5, E)
# 결과 벨트 (노랑): y -18.5 동 → x 120.5 남 → y -8.5 서 (전봇대 (106.5,-8.5) 는 지하로) → x 98.5 북 → y -9.5 서
#   → 지하 (97.5 → 95.5, 가지 밑) → x 94.5 북 → y -11.5 서 → 옛 결과 벨트 머리 (92.5,-11.5)
for _x in range(108, 120):
    add(BELT, _x + 0.5, -18.5, E)
for _y in range(-19, -9):
    add(BELT, 120.5, _y + 0.5, S)
add(BELT, 120.5, -8.5, W)
for _x in range(108, 120):
    add(BELT, _x + 0.5, -8.5, W)
add(UG, 107.5, -8.5, W, "input")
add(UG, 105.5, -8.5, W, "output")
for _x in range(99, 105):
    add(BELT, _x + 0.5, -8.5, W)
add(BELT, 98.5, -8.5, N)
add(BELT, 98.5, -9.5, W)
add(UG, 97.5, -9.5, W, "input")
add(UG, 95.5, -9.5, W, "output")
add(BELT, 94.5, -9.5, N)
add(BELT, 94.5, -10.5, N)
add(BELT, 94.5, -11.5, W)
add(BELT, 93.5, -11.5, W)
# 석탄 가지 (S_c 서쪽 출구 (102.5,-23.5) → 남 → (102.5,-14.5))
for _y in range(-24, -14):
    add(BELT, 102.5, _y + 0.5, S)
# 철 가지 (S_i 동쪽 출구 (97.5,-11.5) → 동 → (102.5,-11.5) 북 → (102.5,-12.5))
for _x in range(97, 102):
    add(BELT, _x + 0.5, -11.5, E)
add(BELT, 102.5, -11.5, N)
add(BELT, 102.5, -12.5, N)

# 사람 손 (유령은 벨트 위라 로봇이 못 짓는다 - 벨트 걷고 놓기)
SPLICE = [("splitter", 103.5, -24.0, W, (103.5, -24.5)),          # 석탄 벨트 y -24.5
          ("fast-splitter", 97.0, -12.5, S, (96.5, -12.5))]      # 가지 x 96.5
# 가지 노랑 → 빠른 (분배기 위만)
UPGRADE = [(x + 0.5, -21.5) for x in range(70, 97)] + [(96.5, y + 0.5) for y in range(-21, -13)]

COST = {INS: {"iron-plate": 4, "copper-plate": 1.5}, BELT: {"iron-plate": 1.5}, FBELT: {"iron-plate": 11.5},
        UG: {"iron-plate": 8.75}, FUG: {"iron-plate": 48.75}, POLE: {"wood": 0.5, "copper-plate": 0.5},
        "splitter": {"iron-plate": 13, "copper-plate": 7.5}, "fast-splitter": {"iron-plate": 43, "copper-plate": 22.5}}
PAIRED = {BELT, UG, FUG, POLE}

GHOST = """
  local s, f = game.surfaces[1], game.forces.player
  local out = {placed = 0, skip = 0, nonet = 0, blocked = 0, why = {}}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local n, pos, d, ex = q[1], {q[2], q[3]}, q[4], q[5]
    if s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.3} > 0 then out.skip = out.skip + 1
    elseif #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
    elseif s.can_place_entity{name = n, position = pos, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
      local spec = {name = "entity-ghost", inner_name = n, position = pos, direction = d, force = f}
      if ex then spec.type = ex end
      s.create_entity(spec)
      out.placed = out.placed + 1
    else
      out.blocked = out.blocked + 1
      if #out.why < 12 then
        local hit = s.find_entities_filtered{area = {{pos[1] - 0.9, pos[2] - 0.9}, {pos[1] + 0.9, pos[2] + 0.9}}}
        local names = {}
        for _, h in pairs(hit) do names[#names+1] = h.name end
        out.why[#out.why+1] = string.format("%%s(%%.1f,%%.1f): %%s", n, pos[1], pos[2], table.concat(names, "/"))
      end
    end
  end
  return out
"""


def full_plan(ai):
    full, c = p7_24.plan_with_poles(ai, PLAN)
    return full, c


def check(ai):
    full, c = full_plan(ai)
    return {"entities": len(PLAN), "clash": c["clash"][:20], "poles": c["poles"]}


def ghosts(ai):
    full, c = full_plan(ai)
    if c["clash"]:
        return {"clash": c["clash"][:10]}
    rows = [[n, x, y, d, ex] for st, n, x, y, d, ex in full]
    out = {}
    for i in range(0, len(rows), 60):
        r = ai.lua("(function()%s end)()" % (GHOST % json.dumps(rows[i:i + 60]).replace("'", "\\'")))
        for k, v in r.items():
            if isinstance(v, (int, float)):
                out[k] = out.get(k, 0) + v
            elif isinstance(v, list) and v:
                out.setdefault("why", []).extend(v)
    return out


def need(ai):
    """계획 + 분배기 + 교체 에 드는 건물 - 망에 있는 것 (유령 · 교체 표시가 이미 잡은 몫은 셈하지 않는다 - 넉넉히)."""
    full, _ = full_plan(ai)
    want = {}
    for st, n, x, y, d, ex in full:
        want[n] = want.get(n, 0) + 1
    for n, *_ in SPLICE:
        want[n] = want.get(n, 0) + 1
    want[FBELT] = want.get(FBELT, 0) + len(UPGRADE)
    have = ai.lua("""(function()
      local f, s = game.forces.player, game.surfaces[1]
      local n = s.find_logistic_network_by_position({101, -15}, f)
      local o = {}
      for _, k in pairs(helpers.json_to_table('%s')) do o[k] = n.get_item_count(k) end
      return o end)()""" % json.dumps(list(want)))
    bag = ai.agent(WHO).items()
    return {k: max(0, v - int(have.get(k, 0)) - int(bag.get(k, 0))) for k, v in want.items()}, want


def kit(ai):
    """foxtrot: 허브 판 → 손제작 → 저장 상자 (103.5,-14.5). 분배기 둘은 가방에 남긴다 (splice)."""
    from orders import submit
    miss, want = need(ai)
    miss = {k: v for k, v in miss.items() if v > 0 and k in COST and k != FURN}
    for n, *_ in SPLICE:                              # 분배기는 손으로 놓으니 가방에 있어야
        if ai.agent(WHO).items().get(n, 0) < 1:
            miss[n] = max(miss.get(n, 0), 1)
    mats = {}
    for n, q in miss.items():
        for m, c in COST[n].items():
            mats[m] = mats.get(m, 0) + c * q
    detached.mark([WHO], OWNER, minutes=30)
    plan = []
    wood = mats.pop("wood", 0)
    if wood:
        plan += [("walk_to", {"x": 11.5, "y": -8.0}), ("take", {"name": "wood", "x": 11.5, "y": -9.5, "count": int(math.ceil(wood)) + 1})]
    plan += p7_24.take_plan(ai, {m: c * 1.05 + 5 for m, c in mats.items()}, {"iron-plate": 1000, "copper-plate": 500})
    order = [INS, FBELT, FUG, "fast-splitter", "splitter", BELT, UG, POLE]   # 중간재를 먹는 것 먼저, 노랑 벨트 · 지하는 마지막
    for n in order:
        q = miss.get(n, 0)
        if q:
            plan.append(("craft", {"recipe": n, "count": (q + 1) // 2 if n in PAIRED else q, "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for n in order:
        q = miss.get(n, 0) - (1 if n in ("splitter", "fast-splitter") else 0)
        if q > 0:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    submit(ai, WHO, plan, strict=False)
    return {"miss": miss, "mats": {m: round(c) for m, c in mats.items()}, "steps": len(plan)}


def upgrade(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local o = {ordered = 0, fast = 0, missing = 0}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{position = p, radius = 0.3, type = 'transport-belt'}[1]
        if not e then o.missing = o.missing + 1
        elseif e.name == 'fast-transport-belt' then o.fast = o.fast + 1
        elseif not e.to_be_upgraded() then e.order_upgrade{force = f, target = 'fast-transport-belt'}; o.ordered = o.ordered + 1 end
      end
      return o end)()""" % json.dumps([list(p) for p in UPGRADE]))


def splice(ai):
    """foxtrot: 분배기 자리의 벨트 한 칸을 걷고 (그 칸 옆에 서서, 반경 0.3) 분배기를 놓는다."""
    from orders import submit
    detached.mark([WHO], OWNER, minutes=15)
    plan = []
    for n, x, y, d, (bx, by) in SPLICE:
        plan += [("walk_to", {"x": bx + 0.5, "y": by + 1.8}),
                 ("demolish", {"x": bx, "y": by, "search_radius": 0.3}),
                 ("build", {"name": n, "x": x, "y": y, "direction": d})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan)}


STATUS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
  local o = {new = {}, old = {}, ghosts = 0}
  for _, e in pairs(s.find_entities_filtered{name = 'steel-furnace', area = {{107, -18}, {121, -9}}}) do
    local k = st[e.status] or '?'; o.new[k] = (o.new[k] or 0) + 1 end
  for _, e in pairs(s.find_entities_filtered{name = 'steel-furnace', area = {{74, -10}, {94, -8}}}) do
    local k = st[e.status] or '?'; o.old[k] = (o.old[k] or 0) + 1 end
  o.ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{92, -25}, {119, -9}}}
  o.upg = s.count_entities_filtered{to_be_upgraded = true, area = {{69, -23}, {98, -13}}}
  local ps = f.get_item_production_statistics(s)
  local function c(n, cat) return math.floor(ps.get_flow_count{name = n, category = cat, precision_index = defines.flow_precision_index.ten_minutes, count = true}) end
  o.steel = {c('steel-plate', 'input'), c('steel-plate', 'output')}
  o.iron = {c('iron-plate', 'input'), c('iron-plate', 'output')}
  local hub = s.find_entities_filtered{name = 'passive-provider-chest', position = {75.5, -15.5}, radius = 0.3}[1]
  if hub then local inv = hub.get_inventory(defines.inventory.chest); o.hub = {inv.get_item_count('steel-plate'), inv.get_item_count('stone-brick'), inv.count_empty_stacks()} end
  return o end)()"""


def status(ai):
    return ai.lua(STATUS)


def main():
    step = [a for a in sys.argv[1:] if not a.startswith("--") and a != "run24"][0]
    ai = AIBridge()
    fn = {"check": check, "ghosts": ghosts, "kit": kit, "upgrade": upgrade, "splice": splice, "status": status,
          "need": lambda ai: need(ai)[0]}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

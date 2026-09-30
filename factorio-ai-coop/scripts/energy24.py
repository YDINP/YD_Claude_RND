"""run24 전력 연료 · 배터리 (15.7h, 2026-09-30 10:5x) - 밤 축전 0/395 MJ · 연구소 14 low_power.

실측 (전): 석탄 10분 캠 3,134 / 씀 3,552 · 망 석탄 55 · 흩어진 보일러 넷 (-83,28.5) (-75,16.5) (-57,14.5) (-42,13.5) no_fuel ·
  플라스틱 화학 둘 item_ingredient_shortage (석탄) → 석유가스가 차서 정유 넷 full_output · 배터리 10분 58 (화학 1 대, 철 · 구리 굶음) · 축전 0.

석탄 광맥 (survey --seen 반경 1500): 걸어서 본 곳에 석탄은 기지 광맥 (115,-26) 하나 - 남은 것 320k (채굴기 밑 230k · 북쪽 띠 y -39..-34 44k).
  → 새 광맥 없음. 셋으로 나눈다:

 A 석탄 북쪽 띠: 전기 채굴기 5 (y -36.5 북향, x 107.5 .. 119.5) → 바로 공급 상자 (x, -38.5) = 망.
      채굴기 0.5 × 1.2 (채굴 연구 +20 %) = 0.6/s × 5 = +3.0/s (10분 +1,800). 벨트 없음 - 채굴기가 상자에 붓는다 (상자 입구 한도 없음).
      44k / 3/s ≈ 4 시간. 바위 (109..112, -41..-37) 는 로봇 해체 표시.
 B 고체 연료: 화학 1 (-89.5,15.5) 동향 solid-fuel-from-petroleum-gas - 석유가스 줄 x -87.5 (정유 (-90.5,21.5) → 동쪽 망) 에 입력 둘.
      20 가스 → 1 연료 (12 MJ = 석탄 3) / 1 s. 보일러 1.8 MW ÷ 12 MJ = 0.15/s → 넷 0.6/s = 가스 12/s (화학 60 %).
      결과 팔 → 공급 상자 (-92.5,15.5, 칸 제한 2 = 100) → 로봇 요청 (item-request-proxy ≤ 50) 으로 흩어진 보일러 넷 (feed 루프).
      석탄이 나는 곳이 한 광맥뿐이라 예비 보일러는 석유로 돌린다 - 석탄은 보일러 줄 10 · 강철로 · 플라스틱 몫.
 C 배터리: 황산 화학 (-91.5,5.5) (full_output, 50/s) 의 출구 관 y 3.5 를 서쪽으로 (-97.5 .. -92.5) → 배터리 화학 둘
      P1 (-96.5,5.5) 북향 · P2 (-98.5,1.5) 남향. 배터리 1 = 철 1 · 구리 1 · 황산 20 / 4 s → 대당 0.25/s = 분 15.
      화학 셋 (옛 (-91.5,1.5) + 둘) = 분 45 - 목표 30 의 1.5 배. 황산 0.75 × 20 = 15/s → 황 1.5/s · 철 0.3/s.
      먹이 = 요청 상자 (물류 로봇) → 팔: P1 · P2 · 옛 배터리 (철 · 구리) · 황산 화학 (황 · 철). 팔 0.83/s > 필요 0.5/s.
      결과 팔 → 공급 상자 (칸 제한) = 망 → solarfeed 가 축전지 조립기에 로봇으로.

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 건물 선 칸 건너뜀) · 해체 표시 · 요청 상자 (물류 로봇) · item-request-proxy (≤ 50) ·
  foxtrot 손 (허브 판 → 손제작 → 저장 상자 (59.5,-14.5)).

    python scripts/energy24.py --run run24 check     # 자리 (can_place manual) 만
    python scripts/energy24.py --run run24 kit       # foxtrot: 화학 3 · 요청 상자 4 · 공급 상자 8 손제작 → 저장 상자
    python scripts/energy24.py --run run24 ghosts    # 유령 + 바위 해체 표시
    python scripts/energy24.py --run run24 config    # 지어진 뒤: 레시피 · 요청 · 칸 제한
    python scripts/energy24.py --run run24 feed --every 30   # 상주: 고체 연료 → 흩어진 보일러 넷
    python scripts/energy24.py --run run24 status
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge, RconError  # noqa: E402
import p7_24  # noqa: E402

N, E, S, W = 0, 4, 8, 12            # 팔 방향 = 집는 쪽
WHO, OWNER = "foxtrot", "energy24"
STORE = (59.5, -14.5)               # 망 저장 상자 (허브 곁)
ADV_BOX = (25.5, -9.5)              # 고급회로 공급 상자 (zone N)
CHEM, INS, MPOLE, PIPE = "chemical-plant", "inserter", "medium-electric-pole", "pipe"
PP, RQ, DRILL = "passive-provider-chest", "requester-chest", "electric-mining-drill"

G = []   # (name, x, y, d, tag)


def add(name, x, y, d=N, tag=""):
    G.append((name, float(x), float(y), d, tag))


# A 석탄 북쪽 띠
for _x in (107.5, 110.5, 113.5, 116.5, 119.5):
    add(DRILL, _x, -36.5, N, "coal")
    add(PP, _x, -38.5, N, "coal")
add(MPOLE, 109.5, -38.5, N, "coal")
add(MPOLE, 118.5, -38.5, N, "coal")
# B 고체 연료
add(CHEM, -89.5, 15.5, E, "sf")
add(INS, -91.5, 15.5, E, "sf")                 # 동쪽 화학에서 집어 서쪽 상자에
add(PP, -92.5, 15.5, N, "sf")
add(MPOLE, -91.5, 17.5, N, "sf")
# C 배터리
for _x in (-97.5, -96.5, -95.5, -94.5, -93.5, -92.5):
    add(PIPE, _x, 3.5, N, "bat")
add(CHEM, -96.5, 5.5, N, "bat")                # P1 입력 북쪽 (y 3.5)
add(CHEM, -98.5, 1.5, S, "bat")                # P2 입력 남쪽 (y 3.5)
add(INS, -94.5, 4.5, E, "bat")                 # R1 → P1
add(RQ, -93.5, 4.5, N, "bat")                  # R1 철 · 구리
add(INS, -94.5, 5.5, W, "bat")                 # P1 → 상자
add(PP, -93.5, 5.5, N, "bat")                  # P1 결과
add(RQ, -94.5, 6.5, N, "bat")                  # R2 황 · 철
add(INS, -93.5, 6.5, W, "bat")                 # R2 → 황산 화학
add(RQ, -94.5, 1.5, N, "bat")                  # R3 철 · 구리
add(INS, -93.5, 1.5, W, "bat")                 # R3 → 옛 배터리 (-91.5,1.5)
add(RQ, -101.5, 1.5, N, "bat")                 # R4 철 · 구리
add(INS, -100.5, 1.5, W, "bat")                # R4 → P2
add(INS, -100.5, 2.5, E, "bat")                # P2 → 상자
add(PP, -101.5, 2.5, N, "bat")                 # P2 결과
add(MPOLE, -98.5, 4.5, N, "bat")
add(MPOLE, -93.5, 2.5, N, "bat")
add(MPOLE, -94.5, 8.5, N, "bat")
# D 축전지 조립기 A (-42.5,-19.5, solar24) 철: solarfeed 는 망 철 KEEP 1,500 밑이면 요청 안 함 (11:1x 망 철 141) → 배터리 40 을 들고 서 있다.
#   축전지 1 = 철 2 · 배터리 5. 처음엔 요청 상자 + 팔 (-43.5,-16.5/-17.5) 을 놨으나 태양 줄은 로보포트 «건설» 범위뿐 (물류 밖,
#   out_of_logistic_network) → 걷고, feed 루프가 건설 로봇 요청 (철 10, 배터리 ≥ 5 일 때) 으로 넣는다.
ACC_ASM = (-42.5, -19.5)

ROCK_AREA = [[108, -42], [114, -36]]
RECIPES = [((-89.5, 15.5), "solid-fuel-from-petroleum-gas"), ((-96.5, 5.5), "battery"), ((-98.5, 1.5), "battery")]
REQUESTS = [((-93.5, 4.5), {"iron-plate": 40, "copper-plate": 40}), ((-94.5, 1.5), {"iron-plate": 40, "copper-plate": 40}),
            ((-101.5, 1.5), {"iron-plate": 40, "copper-plate": 40}), ((-94.5, 6.5), {"sulfur": 100, "iron-plate": 30}),
]
BARS = [((-92.5, 15.5), 2), ((-93.5, 5.5), 4), ((-101.5, 2.5), 4)]     # 칸 제한 (고체 연료 100 · 배터리 800)
BOILERS = [(-83.0, 28.5), (-75.0, 16.5), (-57.0, 14.5), (-42.0, 13.5)]
SF = "solid-fuel"

LUA_PLACE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {placed = {}, have = {}, blocked = {}, rocks = 0}
  local make = %s
  for _, q in pairs(helpers.json_to_table('%s')) do
    local n, p, d = q[1], {q[2], q[3]}, q[4]
    local tag = n .. '@' .. q[2] .. ',' .. q[3]
    if s.count_entities_filtered{name = n, force = f, position = p, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = n, force = f, position = p, radius = 0.3} > 0 then out.have[#out.have + 1] = tag
    elseif s.can_place_entity{name = n, position = p, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
      if make then s.create_entity{name = 'entity-ghost', inner_name = n, position = p, direction = d, force = f} end
      out.placed[#out.placed + 1] = tag
    else
      local why = {}
      for _, e in pairs(s.find_entities_filtered{position = p, radius = 1.6}) do
        if e.type ~= 'resource' and e.type ~= 'character' then why[#why + 1] = e.name .. '@' .. e.position.x .. ',' .. e.position.y end end
      out.blocked[#out.blocked + 1] = tag .. ' <' .. table.concat(why, ' ') .. '>'
    end
  end
  if make then
    for _, r in pairs(s.find_entities_filtered{type = 'simple-entity', area = helpers.json_to_table('%s')}) do
      if not r.to_be_deconstructed() then r.order_deconstruction(f); out.rocks = out.rocks + 1 end end
  end
  return out
end)()"""


def place(ai, make):
    rows = [[n, x, y, d] for n, x, y, d, _ in G]
    return ai.lua(LUA_PLACE % ("true" if make else "false", json.dumps(rows), json.dumps(ROCK_AREA)))


def need(ai):
    want = {}
    for n, *_ in G:
        want[n] = want.get(n, 0) + 1
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {}
      for _, k in pairs(helpers.json_to_table('%s')) do
        o[k] = n.get_item_count(k) + s.count_entities_filtered{name = k, force = f, position = {0, 0}, radius = 0}
      end
      return o end)()""" % json.dumps(list(want)))
    return {k: max(0, v - int(have.get(k, 0))) for k, v in want.items()}


def kit(ai):
    """foxtrot: 고급회로 상자 → 허브 (강철 · 철 · 회로) → 손제작 → 저장 상자."""
    from orders import submit
    miss = {k: v for k, v in need(ai).items() if k in (CHEM, PP, RQ) and v > 0}
    c, p, r = miss.get(CHEM, 0), miss.get(PP, 0), miss.get(RQ, 0)
    steel = 5 * c + 8 * (p + r) + 5
    circ = 5 * c + 3 * (p + r) + 3
    iron = 15 * c + 5
    detached.mark([WHO], OWNER, minutes=25)
    plan = []
    if r + p:                                        # 2.0: 공급 · 요청 상자 모두 고급회로 1 (강철 상자 + 회로 3 + 고급 1)
        plan += [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
                 ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": r + p})]
    plan += p7_24.take_plan(ai, {"steel-plate": steel, "electronic-circuit": circ, "iron-plate": iron},
                            {"steel-plate": 500, "electronic-circuit": 60, "iron-plate": 1000})
    for n, q in ((CHEM, c), (RQ, r), (PP, p)):
        if q:
            plan.append(("craft", {"recipe": n, "count": q, "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for n, q in ((CHEM, c), (RQ, r), (PP, p)):
        if q:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    submit(ai, WHO, plan, strict=False)
    return {"miss": miss, "take": {"steel": steel, "circ": circ, "iron": iron}, "steps": len(plan)}


LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {recipe = {}, req = {}, bar = {}}
  for _, q in pairs(A.recipes) do
    local e = s.find_entities_filtered{name = 'chemical-plant', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.recipe[#out.recipe + 1] = q[2] .. ' none'
    else
      local r = e.get_recipe()
      if r and r.name == q[2] then out.recipe[#out.recipe + 1] = q[2] .. ' ok'
      elseif e.get_inventory(defines.inventory.assembling_machine_output).is_empty() then
        e.set_recipe(q[2]); out.recipe[#out.recipe + 1] = q[2] .. ' set'
      else out.recipe[#out.recipe + 1] = q[2] .. ' output-not-empty' end
    end
  end
  for _, q in pairs(A.requests) do
    local e = s.find_entities_filtered{name = 'requester-chest', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.req[#out.req + 1] = 'none ' .. q[1][1] .. ',' .. q[1][2]
    else
      local lp = e.get_requester_point()
      local sec = lp.sections[1] or lp.add_section()
      local i = 1
      for name, cnt in pairs(q[2]) do sec.set_slot(i, {value = name, min = cnt}); i = i + 1 end
      out.req[#out.req + 1] = 'ok ' .. q[1][1] .. ',' .. q[1][2] .. ' ' .. sec.filters_count
    end
  end
  for _, q in pairs(A.bars) do
    local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = q[1], radius = 0.3}[1]
    if e then e.get_inventory(defines.inventory.chest).set_bar(q[2] + 1); out.bar[#out.bar + 1] = 'ok ' .. q[1][1] .. ',' .. q[1][2]
    else out.bar[#out.bar + 1] = 'none ' .. q[1][1] .. ',' .. q[1][2] end
  end
  return out
end)()"""


def config(ai):
    arg = {"recipes": [[list(p), r] for p, r in RECIPES], "requests": [[list(p), q] for p, q in REQUESTS],
           "bars": [[list(p), b] for p, b in BARS]}
    return ai.lua(LUA_CONFIG % json.dumps(arg))


LUA_FEED = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {req = {}, have = {}}
  for _, p in pairs(helpers.json_to_table('%s')) do
    local b = s.find_entities_filtered{name = 'boiler', force = f, position = p, radius = 0.6}[1]
    if b then
      local inv = b.get_fuel_inventory()
      local sf, coal = inv.get_item_count('%s'), inv.get_item_count('coal')
      out.have[#out.have + 1] = p[1] .. ':' .. sf .. 'sf/' .. coal .. 'c'
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = b.position, radius = 0.6} > 0
      local net = s.find_logistic_network_by_position(b.position, f)
      if coal == 0 and sf < 10 and not busy and net and net.get_item_count('%s') >= %d then
        s.create_entity{name = 'item-request-proxy', position = b.position, force = f, target = b,
          modules = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.fuel, stack = 0, count = %d}}}}}}
        out.req[#out.req + 1] = p[1] .. ',' .. p[2]
      end
    end
  end
  local a = s.find_entities_filtered{type = 'assembling-machine', force = f, position = {%f, %f}, radius = 0.6}[1]
  if a and a.get_recipe() and a.get_recipe().name == 'accumulator' then
    local inv = a.get_inventory(defines.inventory.assembling_machine_input)
    local busy = s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} > 0
    local net
    for _, n in pairs(s.find_logistic_networks_by_construction_area(a.position, f) or {}) do
      if not net or n.all_construction_robots > net.all_construction_robots then net = n end end
    out.acc = inv.get_item_count('iron-plate') .. 'fe/' .. inv.get_item_count('battery') .. 'bat'
    if inv.get_item_count('iron-plate') < 4 and inv.get_item_count('battery') >= 5 and not busy and net and net.get_item_count('iron-plate') >= 610 then   -- 11:4x 탄 우선: 망 철 600 밑이면 쉼 (ammo24)
      s.create_entity{name = 'item-request-proxy', position = a.position, force = f, target = a,
        modules = {{id = {name = 'iron-plate'}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = 0, count = 10}}}}}}
      out.req[#out.req + 1] = 'acc iron 10'
    end
  end
  return out
end)()"""


def feed(ai, every, once):
    lua = LUA_FEED % (json.dumps([list(b) for b in BOILERS]), SF, SF, 50, SF, 50, ACC_ASM[0], ACC_ASM[1])
    while True:
        try:
            ai = ai or AIBridge()
            print(time.strftime("%H:%M:%S"), json.dumps(ai.lua(lua), ensure_ascii=False), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if once:
            return {}
        time.sleep(every)


LUA_STATUS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
  local out = {ent = {}, boilers = {}, labs = {}}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
    local tag = q[1] .. '@' .. q[2] .. ',' .. q[3]
    if not e then out.ent[tag] = s.count_entities_filtered{ghost_name = q[1], position = {q[2], q[3]}, radius = 0.3} > 0 and 'ghost' or 'none'
    elseif e.type ~= 'pipe' and e.type ~= 'electric-pole' then
      local r = e.status and (st[e.status] or tostring(e.status)) or '-'
      if e.type == 'logistic-container' then
        local c = e.get_inventory(defines.inventory.chest).get_contents()
        for _, v in pairs(c) do r = r .. ' ' .. v.name .. ' ' .. v.count end
      end
      out.ent[tag] = r
    end
  end
  for _, b in pairs(s.find_entities_filtered{name = 'boiler', force = f}) do
    local k = st[b.status] or '?'; out.boilers[k] = (out.boilers[k] or 0) + 1 end
  for _, b in pairs(s.find_entities_filtered{type = 'lab', force = f}) do
    local k = st[b.status] or '?'; out.labs[k] = (out.labs[k] or 0) + 1 end
  local P = defines.flow_precision_index.ten_minutes
  local fs = f.get_item_production_statistics(s)
  local function fl(n) return {math.floor(fs.get_flow_count{name = n, category = 'input', precision_index = P, count = true}),
                               math.floor(fs.get_flow_count{name = n, category = 'output', precision_index = P, count = true})} end
  out.ten = {coal = fl('coal'), battery = fl('battery'), accumulator = fl('accumulator'), solid_fuel = fl('solid-fuel'), plastic = fl('plastic-bar'), sulfur = fl('sulfur')}
  out.bat_1min = math.floor(fs.get_flow_count{name = 'battery', category = 'input', precision_index = defines.flow_precision_index.one_minute, count = true})
  local net = s.find_logistic_network_by_position({66.5, -15.5}, f)
  out.net = {coal = net.get_item_count('coal'), battery = net.get_item_count('battery'), solid_fuel = net.get_item_count('solid-fuel'),
             accumulator = net.get_item_count('accumulator'), sulfur = net.get_item_count('sulfur')}
  local acc, cap = 0, 0
  for _, a in pairs(s.find_entities_filtered{name = 'accumulator', force = f}) do acc = acc + a.energy; cap = cap + a.electric_buffer_size end
  out.accu = {n = s.count_entities_filtered{name = 'accumulator', force = f}, mj = math.floor(acc / 1e6), cap = math.floor(cap / 1e6)}
  out.daytime = s.daytime
  out.ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{-103, -2}, {-86, 19}}} + s.count_entities_filtered{type = 'entity-ghost', area = {{105, -42}, {123, -34}}}
  return out
end)()"""


def status(ai):
    return ai.lua(LUA_STATUS % json.dumps([[n, x, y] for n, x, y, d, _ in G]))


def main():
    args = [a for a in sys.argv[1:]]
    step = args[0]
    ai = AIBridge()
    if step == "feed":
        every = int(args[args.index("--every") + 1]) if "--every" in args else 30
        feed(ai, every, "--once" in args)
        return
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "kit": kit, "config": config,
          "status": status, "need": need}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

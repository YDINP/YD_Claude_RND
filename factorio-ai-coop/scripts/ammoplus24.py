"""run24 탄 늘리기 (2026-09-30 12:2x) - 탄 쓰임 > 만듦.

실측 12:19 (10분): 피어싱 만듦 284 / 씀 312 · 노랑 537 / 895 · 망 피어싱 ~25 · 노랑 ~15 · 탄 < 5 포탑 16.
  옛 탄창 조립기 5: 피어싱 둘 (-92.5,-6.5) (-68.5,-10.5) 은 working (조립기 2 한 대 = 0.25/s = 10분 150 → 둘 300 이 상한).
  노랑 (-96.5,-6.5) 은 full_output - 결과가 피어싱 1 로만 가는 전용 조립기라 남는 노랑이 망에 못 나간다.
  → 피어싱은 조립기 수가, 포탑 노랑은 «망으로 나가는 노랑 조립기»가 모자란다.

블록 (허브 서쪽 빈 땅, zone N 남쪽 x 27..50 × y -8..-4, 망 R_M 안) × 2, 한 블록 = 가로 11 × 세로 5:

    y+0  .  P  .  .  .  P  .  .  .  P  .
    y+1  RQ fi [ 노랑 ] i  [피어싱] i  RQ        RQ(철 100) → 빠른 팔 → 노랑 → 팔 → 피어싱 ← 팔 ← RQ(강철 50 · 구리 100)
    y+3  .  .  .  i  .  .  .  i  .  .  .
    y+4  .  .  .  PP .  .  .  PP .  .  .        노랑 → 팔 → 공급 상자 (남는 노랑 = 망) · 피어싱 → 팔 → 공급 상자

  노랑 조립기 2 = 0.75/s (10분 450), 피어싱이 0.25/s 먹고 0.5/s (300) 는 망으로. 피어싱 조립기 2 = 0.25/s (150).
  두 블록: 피어싱 +300 (300 → 600) · 망 노랑 +600. 철 = 노랑 0.75 × 4 × 2 = 6/s (빠른 팔 2.31 × 손 2 = 4.6/s > 3).
  공급 상자 칸 제한 4 (800) - 망에 쌓아 두기만 하고 허브 안 막음. 먹이는 요청 상자 (물류 로봇) - ammo24 · robofeed24 는 안 건드림.

    python scripts/ammoplus24.py check|ghosts|need|kit|config|wire|status

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 건물 · 유령 선 칸 건너뜀) · 요청 · 칸 제한 설정 · 사람 손 (delta 손제작 → 저장 상자).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
import p7_24  # noqa: E402

N, E, S, W = 0, 4, 8, 12            # 팔 방향 = 집는 쪽
WHO, OWNER = "delta", "ammoplus24"
STORE = (59.5, -14.5)               # 망 저장 상자 (허브 곁)
ADV_BOX = (25.5, -9.5)              # 고급회로 공급 상자 (zone N)
AM2, INS, FI, MPOLE = "assembling-machine-2", "inserter", "fast-inserter", "medium-electric-pole"
PP, RQ = "passive-provider-chest", "requester-chest"
YEL, PRC = "firearm-magazine", "piercing-rounds-magazine"
BLOCKS = [(27, -8), (40, -8)]       # 블록 왼쪽 위 칸

G = []          # (name, x, y, d, recipe)
RECIPES, REQUESTS, BARS = [], [], []


def add(name, x, y, d=N, recipe=None):
    G.append((name, float(x), float(y), d, recipe))


for ox, oy in BLOCKS:
    add(RQ, ox + 0.5, oy + 1.5)
    add(FI, ox + 1.5, oy + 1.5, W)                  # 상자 → 노랑
    add(AM2, ox + 3.5, oy + 1.5, N, YEL)
    add(INS, ox + 5.5, oy + 1.5, W)                 # 노랑 → 피어싱
    add(AM2, ox + 7.5, oy + 1.5, N, PRC)
    add(INS, ox + 9.5, oy + 1.5, E)                 # 상자 → 피어싱
    add(RQ, ox + 10.5, oy + 1.5)
    add(INS, ox + 3.5, oy + 3.5, N)                 # 노랑 → 공급 상자
    add(PP, ox + 3.5, oy + 4.5)
    add(INS, ox + 7.5, oy + 3.5, N)                 # 피어싱 → 공급 상자
    add(PP, ox + 7.5, oy + 4.5)
    for dx in (1.5, 5.5, 9.5):
        add(MPOLE, ox + dx, oy + 0.5)
    RECIPES += [((ox + 3.5, oy + 1.5), YEL), ((ox + 7.5, oy + 1.5), PRC)]
    REQUESTS += [((ox + 0.5, oy + 1.5), {"iron-plate": 100}), ((ox + 10.5, oy + 1.5), {"steel-plate": 50, "copper-plate": 100})]
    BARS += [((ox + 3.5, oy + 4.5), 4), ((ox + 7.5, oy + 4.5), 4)]

LUA_PLACE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {placed = {}, have = {}, blocked = {}}
  local make = %s
  for _, q in pairs(helpers.json_to_table('%s')) do
    local n, p, d, rc = q[1], {q[2], q[3]}, q[4], q[5]
    local tag = n .. '@' .. q[2] .. ',' .. q[3]
    if s.count_entities_filtered{name = n, force = f, position = p, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = n, force = f, position = p, radius = 0.3} > 0 then out.have[#out.have + 1] = tag
    elseif s.can_place_entity{name = n, position = p, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
      if make then
        local g = s.create_entity{name = 'entity-ghost', inner_name = n, position = p, direction = d, force = f}
        if g and rc and rc ~= '' then pcall(function() g.set_recipe(rc) end) end
      end
      out.placed[#out.placed + 1] = tag
    else
      local why = {}
      for _, e in pairs(s.find_entities_filtered{position = p, radius = 1.6}) do
        if e.type ~= 'resource' and e.type ~= 'character' then why[#why + 1] = e.name .. '@' .. e.position.x .. ',' .. e.position.y end end
      out.blocked[#out.blocked + 1] = tag .. ' <' .. table.concat(why, ' ') .. '>'
    end
  end
  return out
end)()"""


def place(ai, make):
    rows = [[n, x, y, d, r or ""] for n, x, y, d, r in G]
    return ai.lua(LUA_PLACE % ("true" if make else "false", json.dumps(rows)))


def need(ai):
    want = {}
    for n, *_ in G:
        want[n] = want.get(n, 0) + 1
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {}
      for _, k in pairs(helpers.json_to_table('%s')) do o[k] = n.get_item_count(k) end
      for _, q in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3} > 0 then o[q[1]] = (o[q[1]] or 0) + 1 end
      end
      return o end)()""" % (json.dumps(list(want)), json.dumps([[n, x, y] for n, x, y, *_ in G])))
    return {k: max(0, v - int(have.get(k, 0))) for k, v in want.items()}


def kit(ai):
    """delta: 저장 상자 (조립기 1) · 고급회로 상자 · 허브 (강철 · 철 · 회로) → 손제작 → 저장 상자 → 로봇이 유령에."""
    from orders import submit
    miss = need(ai)
    a, p, fi = miss.get(AM2, 0), miss.get(PP, 0), miss.get(FI, 0)
    r = miss.get(RQ, 0)
    steel = 2 * a + 8 * (p + r) + 4
    circ = 3 * a + 3 * (p + r) + 3 * fi + 4
    iron = 10 * a + 3 * fi + 6               # 톱니 5 (철 10) 는 손제작
    detached.mark([WHO], OWNER, minutes=25)
    plan = []
    if a:
        plan += [("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
                 ("take", {"name": "assembling-machine-1", "x": STORE[0], "y": STORE[1], "count": a})]
    if r + p:
        plan += [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
                 ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": r + p})]
    plan += p7_24.take_plan(ai, {"steel-plate": steel, "electronic-circuit": circ, "iron-plate": iron},
                            {"steel-plate": 500, "electronic-circuit": 60, "iron-plate": 1000})
    for n, q in ((AM2, a), (RQ, r), (PP, p), (FI, fi)):
        if q:
            plan.append(("craft", {"recipe": n, "count": q, "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for n, q in ((AM2, a), (RQ, r), (PP, p), (FI, fi)):
        if q:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    submit(ai, WHO, plan, strict=False)
    return {"miss": miss, "take": {"steel": steel, "circ": circ, "iron": iron}, "steps": len(plan)}


LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {recipe = {}, req = {}, bar = {}}
  for _, q in pairs(A.recipes) do
    local e = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.recipe[#out.recipe + 1] = q[2] .. ' none'
    elseif e.get_recipe() and e.get_recipe().name == q[2] then out.recipe[#out.recipe + 1] = q[2] .. ' ok'
    else e.set_recipe(q[2]); out.recipe[#out.recipe + 1] = q[2] .. ' set' end
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


LUA_WIRE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local pam = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = q[1], radius = 0.3}[1]
    local ins = s.find_entities_filtered{name = 'inserter', force = f, position = q[2], radius = 0.3}[1]
    if pam and ins then
      local a = pam.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      local b = ins.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      a.connect_to(b, false)
      pam.get_or_create_control_behavior().circuit_read_contents = true
      local cb = ins.get_or_create_control_behavior()
      cb.circuit_enable_disable = true
      cb.circuit_condition = {first_signal = {type = 'item', name = '%s'}, comparator = '>', constant = 1}
      out[#out + 1] = 'ok ' .. q[2][1] .. ',' .. q[2][2]
    else out[#out + 1] = 'none ' .. q[2][1] .. ',' .. q[2][2] end
  end
  return out
end)()"""


def wire(ai):
    """12:3x 철이 모자라 노랑 → 공급 상자 팔이 노랑을 다 가져가 피어싱이 굶었다 (요청 상자 철 2).
    노랑 → 공급 상자 팔은 피어싱 조립기 안 노랑 > 1 일 때만 (빨간 선: 피어싱 조립기 내용 읽기 → 팔 조건) - 철 한 판당 피어싱이 노랑보다 1.6 배 셈."""
    rows = [[[ox + 7.5, oy + 1.5], [ox + 3.5, oy + 3.5]] for ox, oy in BLOCKS]
    return ai.lua(LUA_WIRE % (json.dumps(rows), YEL))


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index.ten_minutes
      local function c(k) return {math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'output', precision_index = P, count = true})} end
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {tick = game.tick, pierce = c('%s'), yellow = c('%s'), iron = c('iron-plate'),
                 net = {p = n.get_item_count('%s'), y = n.get_item_count('%s'), iron = n.get_item_count('iron-plate'),
                        steel = n.get_item_count('steel-plate'), cu = n.get_item_count('copper-plate')}, asm = {}, low = 0, lowlist = {}}
      for _, t in pairs(s.find_entities_filtered{type = 'ammo-turret', force = f}) do
        local k = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
        if k < 5 then o.low = o.low + 1; if #o.lowlist < 20 then o.lowlist[#o.lowlist + 1] = math.floor(t.position.x) .. ',' .. math.floor(t.position.y) .. ':' .. k end end
      end
      local stn = {}
      for k, v in pairs(defines.entity_status) do stn[v] = k end
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{force = f, position = q, radius = 0.3, type = 'assembling-machine'}[1]
        o.asm[#o.asm + 1] = q[1] .. ',' .. q[2] .. ' ' .. (e and ((e.get_recipe() and e.get_recipe().name or '-') .. ' ' .. (stn[e.status] or '?')) or 'none')
      end
      o.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = f, area = {{26, -9}, {52, -2}}}
      return o end)()""" % (PRC, YEL, PRC, YEL, json.dumps([list(p) for p, _ in RECIPES] + [[-92.5, -6.5], [-68.5, -10.5], [-96.5, -6.5], [-64.5, -10.5], [-53.5, 3.5]])))


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    ai = AIBridge()
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "need": need, "kit": kit,
          "config": config, "wire": wire, "status": status}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

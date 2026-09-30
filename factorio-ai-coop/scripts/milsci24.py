"""run24 군사 과학팩 줄 (2026-09-30 14:5x) - 물리 피해 3 · 사격 속도 3 (각 300 단위, 빨 · 초 · 군사).

13:4x 동쪽 전초 함락 (진화 0.54, 큰 이빨): 피해 2 · 속도 2 뿐이라 피어싱 한 발이 큰 이빨에 3.2. 피해 3 이면 6.9.
군사팩은 연구돼 있지만 만드는 곳이 0 이었다. 조리법 실측: 군사팩 = 피어싱 1 · 수류탄 1 · 벽 2 → 2 (10 s),
수류탄 = 석탄 10 · 철 5 (8 s), 벽 = 벽돌 5 (0.5 s). 망 벽돌 105 · 벽돌 10분 0 → 벽돌 화로도 같이.

자리: 허브 동쪽 빈 땅 (x 80..95, y -6..6, 기지 망 안, 철 화로 줄 결과 벨트 y -6.5 바로 아래).

    y -4.5   [피어싱] →팔→ [군사 1] ←팔← [수류탄] →팔→ [군사 2]   조립기 2 넷, 팔 방향 = 집는 쪽
    y -2.5    팔 N (피어싱 → 공급 상자 (77.5,-1.5) 칸 2 = 망 · 포탑)
             15:0x 더함: 망 피어싱이 포탑 소모로 5~180 (남김 200 에 늘 막힘) → 망 남는 노랑 (~680) 을 피어싱으로 (군사 1 직결 · 나머지는 망).
    y -2.5    팔 N    P    팔 S     P      팔 N          군사팩 → 공급 상자 (칸 1 = 200)
    y -1.5    PP          RQ                 PP          수류탄 ← 요청 상자 (철 50 · 석탄 100)
    y  0.5              [벽 조립기 1] →팔→ PP              벽 → 공급 상자 (칸 2)
    y  3.5   [화로 A] →팔→ PP ←팔← [화로 B]  [화로 C] →팔→ PP ←팔← [화로 D]   돌 → 벽돌 (돌 화로 4, 1.25/s)

먹이는 robofeed24 (건설 로봇 요청, 망 재고 문턱):
  군사 조립기: 피어싱 (망에 200 남김 - ammo24 · eastsup 먼저) · 벽 (50 남김) /
  수류탄: 요청 상자 (철 50 · 석탄 100) - 망 철은 늘 0 (요청 상자들이 들어오는 대로 가져감) 이라 망 재고 문턱 요청은 안 온다 /
  벽 조립기: 벽돌 / 돌 화로: 돌 (원료칸, 200 남김) · 석탄 (연료칸) / 연구소 18: 군사팩.
속도: 군사 조립기 2 (0.75) 는 둘이 0.3 팩/s 까지, 수류탄 1 대 0.094/s 가 상한 → 군사팩 ~0.19/s (10분 ~110).

    python scripts/milsci24.py check|ghosts|need|kit|config|status

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 건물 · 유령 선 칸 건너뜀) · 조리법 · 칸 제한 · 사람 손 (delta: 망 상자 → 손제작 → 저장 상자).
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
from ammoplus24 import LUA_PLACE  # noqa: E402

N, E, S, W = 0, 4, 8, 12
WHO, OWNER = "delta", "milsci24"
STORE = (59.5, -14.5)
AM2, AM1, INS, MPOLE = "assembling-machine-2", "assembling-machine-1", "inserter", "medium-electric-pole"
PP, SF, RQ = "passive-provider-chest", "stone-furnace", "requester-chest"
MSP, GREN, WALL, PRC = "military-science-pack", "grenade", "stone-wall", "piercing-rounds-magazine"
PRC_ASM = (77.5, -4.5)

MSP_ASM = [(81.5, -4.5), (89.5, -4.5)]
GREN_ASM = (85.5, -4.5)
WALL_ASM = (85.5, 0.5)
GREN_RQ = (85.5, -1.5)
FURNACES = [(81.0, 4.0), (86.0, 4.0), (89.0, 4.0), (94.0, 4.0)]

G = [
    (AM2, 81.5, -4.5, N, MSP), (INS, 83.5, -4.5, E, None), (AM2, 85.5, -4.5, N, GREN), (INS, 87.5, -4.5, W, None), (AM2, 89.5, -4.5, N, MSP),
    (INS, 81.5, -2.5, N, None), (PP, 81.5, -1.5, N, None), (INS, 89.5, -2.5, N, None), (PP, 89.5, -1.5, N, None),
    (RQ, 85.5, -1.5, N, None), (INS, 85.5, -2.5, S, None),
    (AM1, 85.5, 0.5, N, WALL), (INS, 87.5, 0.5, W, None), (PP, 88.5, 0.5, N, None),
    (MPOLE, 83.5, -2.5, N, None), (MPOLE, 87.5, -2.5, N, None), (MPOLE, 83.5, 1.5, N, None), (MPOLE, 91.5, 1.5, N, None),
    (AM2, 77.5, -4.5, N, PRC), (INS, 79.5, -4.5, W, None), (INS, 77.5, -2.5, N, None), (PP, 77.5, -1.5, N, None), (MPOLE, 79.5, -2.5, N, None),
    (SF, 81.0, 4.0, N, None), (INS, 82.5, 3.5, W, None), (PP, 83.5, 3.5, N, None), (INS, 84.5, 3.5, E, None), (SF, 86.0, 4.0, N, None),
    (SF, 89.0, 4.0, N, None), (INS, 90.5, 3.5, W, None), (PP, 91.5, 3.5, N, None), (INS, 92.5, 3.5, E, None), (SF, 94.0, 4.0, N, None),
]
REQUESTS = [(GREN_RQ, {"iron-plate": 50, "coal": 100})]   # 15:1x 20 · 50 → 50 · 100: 망 철이 늘 0 이라 조금씩만 와서 수류탄 10분 25
RECIPES = [(PRC_ASM, PRC), (MSP_ASM[0], MSP), (MSP_ASM[1], MSP), (GREN_ASM, GREN), (WALL_ASM, WALL)]
BARS = [((77.5, -1.5), 2), ((81.5, -1.5), 1), ((89.5, -1.5), 1), ((88.5, 0.5), 2), ((83.5, 3.5), 5), ((91.5, 3.5), 5)]


def place(ai, make):
    rows = [[n, x, y, d, r or ""] for n, x, y, d, r in G]
    return ai.lua(LUA_PLACE % ("true" if make else "false", json.dumps(rows)))


def need(ai):
    want = {}
    for n, *_ in G:
        want[n] = want.get(n, 0) + 1
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local o = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3} > 0 then o[q[1]] = (o[q[1]] or 0) + 1 end
      end
      return o end)()""" % json.dumps([[n, x, y] for n, x, y, *_ in G]))
    return {k: max(0, v - int(have.get(k, 0))) for k, v in want.items()}


def chest_take(ai, mats: dict) -> list:
    """망 저장 · 공급 상자에서 (요청 상자는 안 건드림). 많이 든 상자부터."""
    rows = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local mn = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local want = helpers.json_to_table('%s')
      local r = {}
      for _, c in pairs(s.find_entities_filtered{name = {'storage-chest', 'passive-provider-chest'}, force = f}) do
        local n = s.find_logistic_network_by_position(c.position, f)
        if n and n.network_id == mn.network_id then
          local inv = c.get_inventory(defines.inventory.chest)
          for k, _ in pairs(want) do local m = inv.get_item_count(k) if m > 0 then r[#r + 1] = {k, c.position.x, c.position.y, m} end end
        end
      end
      return r end)()""" % json.dumps(mats))
    rows = list(rows.values()) if isinstance(rows, dict) else (rows or [])
    plan = []
    for m, want in mats.items():
        for n, x, y, c in sorted([r for r in rows if r[0] == m], key=lambda r: -r[3]):
            if want <= 0:
                break
            k = min(want, int(c))
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": m, "x": x, "y": y, "count": k})]
            want -= k
    return plan


def kit(ai):
    """delta: 망 상자에서 재료 → 손제작 (조립기 1 → 2 · 팔 · 공급 상자 · 돌 화로) → 저장 상자 → 로봇이 유령에."""
    from orders import submit
    miss = need(ai)
    a2, a1, ins, pp, sf = miss.get(AM2, 0), miss.get(AM1, 0), miss.get(INS, 0), miss.get(PP, 0), miss.get(SF, 0)
    a1_all = a2 + a1                         # 조립기 2 는 조립기 1 을 먹는다
    net_a1 = int(ai.lua("""(function() local n = game.surfaces[1].find_logistic_network_by_position({66.5, -15.5}, game.forces.player)
      return {n = n.get_item_count('assembling-machine-1')} end)()""").get("n", 0))
    a1_take = min(a1_all, net_a1)
    a1_craft = a1_all - a1_take
    mats = {"assembling-machine-1": a1_take,
            "electronic-circuit": 3 * a1_craft + 3 * a2 + ins + 3 * pp + 2,
            "iron-gear-wheel": 5 * a1_craft + 5 * a2 + ins + 2,
            "iron-plate": 9 * a1_craft + ins + 2,
            "steel-plate": 2 * a2 + 8 * pp + 2,
            "advanced-circuit": pp,
            "stone": 5 * sf}
    mats = {k: v for k, v in mats.items() if v > 0}
    detached.mark([WHO], OWNER, minutes=25)
    plan = chest_take(ai, mats)
    for n, q in (("steel-chest", pp), (PP, pp), (AM1, a1_craft), (AM2, a2), (INS, ins), (SF, sf)):
        if q:
            plan.append(("craft", {"recipe": n, "count": q, "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for n, q in ((AM2, a2), (AM1, a1), (INS, ins), (PP, pp), (SF, sf)):
        if q:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    submit(ai, WHO, plan, strict=False)
    return {"miss": miss, "mats": mats, "steps": len(plan)}


LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {recipe = {}, bar = {}, req = {}}
  for _, q in pairs(A.requests) do
    local e = s.find_entities_filtered{name = 'requester-chest', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.req[#out.req + 1] = 'none'
    else
      local lp = e.get_requester_point()
      local sec = lp.sections[1] or lp.add_section()
      local i = 1
      for name, cnt in pairs(q[2]) do sec.set_slot(i, {value = name, min = cnt}); i = i + 1 end
      out.req[#out.req + 1] = 'ok ' .. sec.filters_count
    end
  end
  for _, q in pairs(A.recipes) do
    local e = s.find_entities_filtered{type = 'assembling-machine', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.recipe[#out.recipe + 1] = q[2] .. ' none'
    elseif e.get_recipe() and e.get_recipe().name == q[2] then out.recipe[#out.recipe + 1] = q[2] .. ' ok'
    elseif e.get_recipe() == nil then e.set_recipe(q[2]); out.recipe[#out.recipe + 1] = q[2] .. ' set'
    else out.recipe[#out.recipe + 1] = q[2] .. ' other ' .. e.get_recipe().name end
  end
  for _, q in pairs(A.bars) do
    local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = q[1], radius = 0.3}[1]
    if e then e.get_inventory(defines.inventory.chest).set_bar(q[2] + 1); out.bar[#out.bar + 1] = 'ok ' .. q[1][1] .. ',' .. q[1][2]
    else out.bar[#out.bar + 1] = 'none ' .. q[1][1] .. ',' .. q[1][2] end
  end
  return out
end)()"""


def config(ai):
    arg = {"recipes": [[list(p), r] for p, r in RECIPES], "bars": [[list(p), b] for p, b in BARS],
           "requests": [[list(p), q] for p, q in REQUESTS]}
    return ai.lua(LUA_CONFIG % json.dumps(arg))


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index.ten_minutes
      local P1 = defines.flow_precision_index.one_minute
      local function c(k) return {math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'output', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P1, count = true})} end
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {tick = game.tick, msp = c('military-science-pack'), grenade = c('grenade'), wall = c('stone-wall'), brick = c('stone-brick'),
                 pierce = c('piercing-rounds-magazine'), net = {}, ent = {}, labs_msp = 0}
      for _, k in pairs({'military-science-pack', 'grenade', 'stone-wall', 'stone-brick', 'stone', 'piercing-rounds-magazine', 'firearm-magazine', 'iron-plate', 'coal'}) do o.net[k] = n.get_item_count(k) end
      local stn = {}
      for k, v in pairs(defines.entity_status) do stn[v] = k end
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{force = f, position = q, radius = 0.3, type = {'assembling-machine', 'furnace'}}[1]
        o.ent[#o.ent + 1] = q[1] .. ',' .. q[2] .. ' ' .. (e and ((e.type == 'assembling-machine' and e.get_recipe() and e.get_recipe().name or e.name) .. ' ' .. (stn[e.status] or '?')) or 'none')
      end
      for _, l in pairs(s.find_entities_filtered{type = 'lab', force = f}) do o.labs_msp = o.labs_msp + l.get_item_count('military-science-pack') end
      o.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = f, area = {{79, -7}, {96, 6}}}
      local r = f.current_research
      o.research = r and (r.name .. ' ' .. math.floor(f.research_progress * 100) .. '%%') or '-'
      o.queue = {} for _, t in pairs(f.research_queue) do o.queue[#o.queue + 1] = t.name end
      return o end)()""" % json.dumps([list(p) for p in MSP_ASM + [GREN_ASM, WALL_ASM]] + [list(p) for p in FURNACES]))


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    ai = AIBridge()
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "need": need, "kit": kit,
          "config": config, "status": status}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

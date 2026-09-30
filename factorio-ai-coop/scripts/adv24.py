"""run24 고급회로 늘리기 (2026-09-30 12:5x) - 망 고급회로 968 → 7, 10분 만듦 208 / 씀 683.

실측 12:5x (tick 3.80M): 고급회로 조립기 2 가 14 대 (상한 14 × 0.125/s = 10분 1,050) 인데 working 3 - 조립기 수가 아니라 «입력»이 벽.
  zone N 4 (25.5..49.5,-15.5): 녹색 (벨트 y -18.5) · 전선 (옆 조립기) 은 있고 플라스틱 입력이 아예 없다 (팔 · 상자 0).
  남쪽 4 (39.5 · 47.5, 28.5 · 44.5): 플라스틱 · 전선은 있고 녹색 0 - 옆 녹색 조립기 1 넷이 철 0 (전선만).
  (-64.5,-6.5): 팔 0 인 고아 (플라스틱 10 · 녹색 10 · 전선 0) · 녹색 고아 둘 (-53.5,-0.5) (-17.5,3.5) full_output 200 씩 (결과 팔 없음).
  플라스틱 화학 (-71.5,11.5): full_output - 결과 벨트 끝 (-5.5,16.5) 이 참. 망 플라스틱 126 · 10분 919.
  망 전선 28k (넘침).

처방 (새 조립기 0): 결과 팔 → 공급 상자 넷 (칸 제한) + robofeed24 요청 (플라스틱 · 녹색 · 전선 · 철).

    python scripts/adv24.py check|ghosts|kit|config|status
Lua 아이템 이동 0 - 유령 (can_place manual) · 칸 제한 · 사람 손 (delta 손제작 → 저장 상자 → 로봇).
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
WHO, OWNER = "delta", "adv24"
STORE = (59.5, -14.5)
ADV_BOX = (25.5, -9.5)
INS, PP = "inserter", "passive-provider-chest"

# (팔 x, y, 방향, 상자 x, y, 칸 제한, 무엇)
OUT = [
    (-71.5, 13.5, N, -71.5, 14.5, 4, "플라스틱 화학 (-71.5,11.5) 남쪽"),
    (-51.5, -0.5, W, -50.5, -0.5, 2, "녹색 고아 (-53.5,-0.5) 동쪽"),
    (-17.5, 5.5, N, -17.5, 6.5, 2, "녹색 고아 (-17.5,3.5) 남쪽"),
    (-64.5, -4.5, N, -64.5, -3.5, 1, "고급 고아 (-64.5,-6.5) 남쪽"),
]
G = []
for ix, iy, d, cx, cy, _b, _w in OUT:
    G += [(INS, ix, iy, d), (PP, cx, cy, N)]

LUA_PLACE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {placed = {}, have = {}, blocked = {}}
  local make = %s
  for _, q in pairs(helpers.json_to_table('%s')) do
    local n, p, d = q[1], {q[2], q[3]}, q[4]
    local tag = n .. '@' .. q[2] .. ',' .. q[3]
    if s.count_entities_filtered{name = n, force = f, position = p, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = n, force = f, position = p, radius = 0.3} > 0 then out.have[#out.have + 1] = tag
    elseif s.can_place_entity{name = n, position = p, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
      if make then s.create_entity{name = 'entity-ghost', inner_name = n, position = p, direction = d, force = f} end
      out.placed[#out.placed + 1] = tag
    else out.blocked[#out.blocked + 1] = tag end
  end
  return out
end)()"""


def place(ai, make):
    return ai.lua(LUA_PLACE % ("true" if make else "false", json.dumps([list(g) for g in G])))


def kit(ai):
    """delta: 고급회로 상자 (고급 4) · 허브 (강철 · 회로 · 철) → 손제작 (팔 4 · 공급 상자 4) → 저장 상자 → 로봇이 유령에."""
    from orders import submit
    n = len(OUT)
    detached.mark([WHO], OWNER, minutes=20)
    plan = [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
            ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": n})]
    plan += p7_24.take_plan(ai, {"steel-plate": 8 * n + 4, "electronic-circuit": 4 * n + 4, "iron-plate": 3 * n + 4},
                            {"steel-plate": 500, "electronic-circuit": 20, "iron-plate": 300})
    plan += [("craft", {"recipe": INS, "count": n, "wait": "block"}),
             ("craft", {"recipe": PP, "count": n, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": INS, "x": STORE[0], "y": STORE[1], "count": n}),
             ("insert", {"name": PP, "x": STORE[0], "y": STORE[1], "count": n})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "plan": [p[0] for p in plan]}


def config(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if e then e.get_inventory(defines.inventory.chest).set_bar(q[3] + 1); out[#out + 1] = 'ok ' .. q[1] .. ',' .. q[2]
        else out[#out + 1] = 'none ' .. q[1] .. ',' .. q[2] end
      end
      return out end)()""" % json.dumps([[cx, cy, b] for _i, _j, _d, cx, cy, b, _w in OUT]))


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index.ten_minutes
      local function c(k) return {math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'output', precision_index = P, count = true})} end
      local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {tick = game.tick, p10 = {}, net = {}, adv = {}, labs = {}}
      for k, nm in pairs({adv = 'advanced-circuit', green = 'electronic-circuit', plastic = 'plastic-bar', blue = 'chemical-science-pack',
                          yellow = 'utility-science-pack', pu = 'processing-unit', iron = 'iron-plate'}) do o.p10[k] = c(nm) end
      for k, nm in pairs({adv = 'advanced-circuit', green = 'electronic-circuit', plastic = 'plastic-bar', iron = 'iron-plate', cable = 'copper-cable'}) do
        o.net[k] = n.get_item_count(nm) end
      for _, e in pairs(s.find_entities_filtered{type = 'assembling-machine', force = f}) do
        local r = e.get_recipe()
        if r and r.name == 'advanced-circuit' then local k = stn[e.status] or '?' o.adv[k] = (o.adv[k] or 0) + 1 end
      end
      for _, l in pairs(s.find_entities_filtered{type = 'lab', force = f}) do local k = stn[l.status] or '?' o.labs[k] = (o.labs[k] or 0) + 1 end
      local r = f.current_research
      o.research = r and {r.name, math.floor(f.research_progress * 1000) / 10} or nil
      o.ghosts = 0
      for _, q in pairs(helpers.json_to_table('%s')) do
        o.ghosts = o.ghosts + s.count_entities_filtered{type = 'entity-ghost', force = f, position = q, radius = 0.3} end
      return o end)()""" % json.dumps([[g[1], g[2]] for g in G]))


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    ai = AIBridge()
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "kit": kit,
          "config": config, "status": status}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

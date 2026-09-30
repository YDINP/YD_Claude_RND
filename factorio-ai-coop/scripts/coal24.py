"""Run 24 석탄 위기 (18:5x): 기지 석탄 광맥은 «바닥» 이 아니라 «길이 막힘».

실측 (tick 5.09M): 석탄 밭 상자 쪽 채굴기 9 (공급 상자 5 · 쇠 상자 4) 는 밑이 0 (no_minable_resources).
그러나 벨트 쪽 채굴기 9 (y -27.5 남향 · y -22.5 북향) 밑에는 석탄 ~196k 가 남아 있고, 이들은 보일러 벨트
(y -24.5 · -25.5 서향) 가 꽉 차 waiting_for_space. 석탄 10분 캠 410 뿐 - 낮에 태양이 증기를 내려 보일러가 안 먹어서.
망 석탄 0 → 플라스틱 0.

`tap`: 보일러 벨트 y -24.5 (두 레인 가득, x 100..102) 에서 팔 2 (남쪽 벨트 → 북쪽 상자) → 공급 상자 2 (칸 제한) = 망 9.
  - 공급 상자 · 채굴기는 망에서: 죽은 채굴기 11 · 죽은 공급 상자 5 · 빈 쇠 상자 4 를 로봇 해체 표시 → 공급 상자 유령 (can_place manual).
  - 팔은 망에 0 → 사람 (--who) 이 허브 판으로 손제작해 build (충돌 검사). 가방 팔 먼저.
  - 셈: 채굴기 9 × 0.5 × 1.2 = 5.4/s 가 벨트 둘로. 팔 (손 2) ~1.7/s × 2 = ~3.3/s 까지 망으로 (상자 칸 제한이 차면 멈춤),
    보일러에는 ≥ 2.1/s + 벨트 버퍼. 플라스틱 화학 둘 = 석탄 2/s.
`stat`: 석탄 · 플라스틱 10분, 망 석탄, 팔 · 상자 상태.

Lua 아이템 이동 없음 - 로봇 해체 · 유령 · 사람 손제작 · build · 칸 제한 (set_bar) 만.

    python scripts/coal24.py tap --who bravo
    python scripts/coal24.py stat
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import detached                          # noqa: E402
from client import AIBridge              # noqa: E402
from orders import submit                # noqa: E402

OWNER = "coal24"
BELT_Y = -24.5
TAPS = [(100.5, -25.5), (101.5, -25.5)]      # 팔 - 방향 남 (8) = 남쪽 (벨트) 에서 집어 북쪽 (상자) 에
CHESTS = [(100.5, -26.5), (101.5, -26.5)]    # 공급 상자
BAR = 8                                      # 상자마다 8 칸 (400) - 로봇이 비우면 다시 채움
DEAD_AREA = [[104, -40], [126, -26]]         # 죽은 채굴기 · 상자 (석탄 밭 상자 줄)

DECON = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {drill = 0, chest = 0, keep = 0}
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', force = f, area = %s}) do
    if d.status == defines.entity_status.no_minable_resources and not d.to_be_deconstructed() then
      d.order_deconstruction(f); out.drill = out.drill + 1 end
  end
  for _, c in pairs(s.find_entities_filtered{type = {'container', 'logistic-container'}, force = f, area = %s}) do
    local inv = c.get_inventory(defines.inventory.chest)
    local p = c.position
    local feeder = s.count_entities_filtered{name = 'electric-mining-drill', force = f, area = {{p.x - 3, p.y - 3}, {p.x + 3, p.y + 3}}}
    if inv.is_empty() and not c.to_be_deconstructed() then c.order_deconstruction(f); out.chest = out.chest + 1
    elseif not inv.is_empty() then out.keep = out.keep + 1 end
  end
  return out
end)()"""

GHOST = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {}
  for _, p in pairs(%s) do
    local have = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = p, radius = 0.3}[1]
    local gh = s.count_entities_filtered{ghost_name = 'passive-provider-chest', force = f, position = p, radius = 0.3}
    if have then have.get_inventory(defines.inventory.chest).set_bar(%d + 1); out[#out + 1] = 'have'
    elseif gh > 0 then out[#out + 1] = 'ghost'
    elseif s.can_place_entity{name = 'passive-provider-chest', position = p, force = f, build_check_type = defines.build_check_type.manual} then
      s.create_entity{name = 'entity-ghost', inner_name = 'passive-provider-chest', position = p, force = f}; out[#out + 1] = 'new ghost'
    else out[#out + 1] = 'blocked' end
  end
  return out
end)()"""

STAT = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local st = f.get_item_production_statistics(s)
  local function c(n, cat, pi) return math.floor(st.get_flow_count{name = n, category = cat, precision_index = pi, count = true}) end
  local T, O = defines.flow_precision_index.ten_minutes, defines.flow_precision_index.one_minute
  local n = s.find_logistic_network_by_position({100.5, -26.5}, 'player')
  local out = {tick = game.tick, day = s.daytime,
    coal10 = c('coal', 'input', T) .. ' / ' .. c('coal', 'output', T),
    coal1 = c('coal', 'input', O) .. ' / ' .. c('coal', 'output', O),
    plastic10 = c('plastic-bar', 'input', T), plastic1 = c('plastic-bar', 'input', O),
    adv10 = c('advanced-circuit', 'input', T),
    net_coal = n and n.get_item_count('coal') or -1, net_drill = n and n.get_item_count('electric-mining-drill') or -1,
    net_ppc = n and n.get_item_count('passive-provider-chest') or -1, taps = {}, chests = {}}
  for _, p in pairs(%s) do
    local i = s.find_entities_filtered{type = 'inserter', force = f, position = p, radius = 0.3}[1]
    out.taps[#out.taps + 1] = i and (i.name .. ' st' .. i.status .. ' drop ' .. i.drop_position.y) or 'none'
  end
  for _, p in pairs(%s) do
    local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = p, radius = 0.3}[1]
    out.chests[#out.chests + 1] = e and e.get_inventory(defines.inventory.chest).get_item_count('coal') or 'none'
  end
  local dr = {}
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', force = f, area = {{104, -30}, {126, -20}}}) do
    dr[d.status] = (dr[d.status] or 0) + 1
  end
  local names = {}
  for k, v in pairs(defines.entity_status) do names[v] = k end
  local ds = {}
  for k, v in pairs(dr) do ds[#ds + 1] = names[k] .. '=' .. v end
  out.belt_drills = table.concat(ds, ' ')
  local chem = {}
  for _, e in pairs(s.find_entities_filtered{type = 'assembling-machine', name = 'chemical-plant', force = f}) do
    local r = e.get_recipe()
    if r and r.name == 'plastic-bar' then chem[#chem + 1] = string.format('%%.0f,%%.0f %%s', e.position.x, e.position.y, names[e.status]) end
  end
  out.plastic_chem = table.concat(chem, ' | ')
  return out
end)()"""


def lt(v):
    return json.dumps(v).replace("[", "{").replace("]", "}")


def stat(ai):
    return ai.lua(STAT % (lt([list(p) for p in TAPS]), lt([list(p) for p in CHESTS])))


def tap(ai, who):
    r = {"decon": ai.lua(DECON % (lt(DEAD_AREA), lt(DEAD_AREA)))}
    r["ghost"] = ai.lua(GHOST % (lt([list(p) for p in CHESTS]), BAR))
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = 0
      for _, p in pairs(%s) do n = n + s.count_entities_filtered{type = 'inserter', force = f, position = p, radius = 0.3} end
      return {n = n}
    end)()""" % lt([list(p) for p in TAPS]))["n"]
    need = len(TAPS) - int(have)
    r["taps_have"] = have
    if need <= 0:
        return r
    import p7_24
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=15)
    bag = ai.agent(who).items()
    craft = max(0, need - int(bag.get("inserter", 0)))
    plan = []
    if craft:
        plan += p7_24.take_plan(ai, {"iron-plate": 4 * craft, "copper-plate": 2 * craft}, {"iron-plate": 100, "copper-plate": 100})
        plan.append(("craft", {"recipe": "inserter", "count": craft, "wait": "block"}))
    plan.append(("walk_to", {"x": 101.0, "y": -27.8}))
    for p in TAPS:
        plan.append(("build", {"name": "inserter", "x": p[0], "y": p[1], "direction": 8}))
    submit(ai, who, plan, strict=False)
    r["plan"] = len(plan)
    r["craft"] = craft
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["tap", "stat", "release"])
    ap.add_argument("--who", default="bravo")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "tap":
        print(json.dumps(tap(ai, a.who), ensure_ascii=False))
    elif a.cmd == "release":
        detached.release([a.who])
        print("released", a.who)
    else:
        print(json.dumps(stat(ai), ensure_ascii=False, indent=0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

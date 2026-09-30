"""run24 보라 (생산 과학) · 엔진 늘리기 (2026-09-30 13:3x) - 연구 rocket-silo 38 %, 연구소 14/18 이 보라만 없음.

실측 13:3x (tick 3.91M): 보라 10분 34 · 생산성 모듈 8 · 레일 240 · 전기로 8.
  보라 조립기 3 (7.5,15.5) = 1.25 → 21 s / 1.25 = 16.8 s 에 3 판 (10분 107 상한) 인데 모듈이 없어 거의 섬.
  모듈 조립기 3 (7.5,11.5) 은 녹색 0 (고급만 robofeed) - 모듈 15 s / 1.25 = 12 s (녹색 5 · 고급 5).
  레일 (12.5,15.5) · 전기로 (7.5,19.5) 는 보라에 팔 직결 - full_output, 망 레일 0 · 전기로 0.
  엔진 6 대 (35.5 · 43.5 · 51.5 × 21.5 · 37.5): 옆 관 · 톱니 조립기 1 이 철 벨트 (y 18.5 · 34.5) 가 비어 굶음.

처방:
  A 보라 둘째 줄 (빈 땅 x 8..19, y 25..30, 로보포트 (0,32) 안): 모듈 조립기 2 둘 + 보라 조립기 2 하나, 결과 팔 → 공급 상자 (칸 제한).
    레일 · 전기로 조립기에 결과 팔 → 공급 상자 하나씩 더 (넘치는 몫이 망으로). 먹이는 robofeed24 요청 (녹색 · 고급 · 레일 · 전기로 · 모듈),
    보라는 연구소 18 에 로봇 요청.
    속도: 보라 1 (1.25) 16.8 s + 보라 2 (0.75) 28 s → 10분 107 + 64 = 171 판. 모듈 수요 1/16.8 + 1/28 = 0.095/s
          < 모듈 3 (1/12) + 모듈 2 둘 (1/20 × 2) = 0.183/s. 레일 수요 30/16.8 + 30/28 = 2.9/s ≈ 레일 조립기 2 (2/0.667 = 3.0/s).
  B 엔진: robofeed24 로 엔진 6 에 톱니 (망 ~3k) · 관 조립기 넷에 철.

    python scripts/purple24.py check|ghosts|kit|config|status
Lua 아이템 이동 0 - 유령 (can_place manual) · 칸 제한 · 레시피 지정 · 사람 손 (delta 손제작 → 저장 상자 → 로봇).
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
WHO, OWNER = "delta", "purple24"
STORE = (59.5, -14.5)
ADV_BOX = (25.5, -9.5)
INS, PP, A2, POLE = "inserter", "passive-provider-chest", "assembling-machine-2", "medium-electric-pole"

# 조립기 (x, y, 레시피)
ASM = [(9.5, 26.5, "productivity-module"), (13.5, 26.5, "productivity-module"), (17.5, 26.5, "production-science-pack")]
# (팔 x, y, 방향, 상자 x, y, 칸 제한, 무엇)
OUT = [
    (9.5, 28.5, N, 9.5, 29.5, 1, "모듈 M2"),
    (13.5, 28.5, N, 13.5, 29.5, 1, "모듈 M3"),
    (17.5, 28.5, N, 17.5, 29.5, 1, "보라 P2"),
    (11.5, 13.5, S, 11.5, 12.5, 2, "레일 (12.5,15.5) 넘침"),
    (8.5, 21.5, N, 8.5, 22.5, 1, "전기로 (7.5,19.5) 넘침"),
]
POLES = [(7.5, 28.5), (11.5, 28.5), (15.5, 28.5), (9.5, 21.5)]   # (9.5,21.5): 전기로 넘침 팔 (8.5,21.5) no_power 였음
G = [(A2, x, y, N) for x, y, _r in ASM]
for ix, iy, d, cx, cy, _b, _w in OUT:
    G += [(INS, ix, iy, d), (PP, cx, cy, N)]
G += [(POLE, x, y, N) for x, y in POLES]

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


def need(ai):
    """유령이 망에서 못 가져가는 몫 (망 재고 - 이미 쓴 유령 수)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({0, 32}, f)
      local o = {}
      for _, k in pairs({'%s', '%s', '%s', '%s'}) do
        o[k] = {net = n.get_item_count(k), ghosts = s.count_entities_filtered{ghost_name = k, force = f}} end
      return o end)()""" % (A2, INS, PP, POLE))


def kit(ai, a2=3, ins=3, pp=2):
    """delta: 허브 (철 · 강철 · 전선) · 고급회로 상자 → 손제작 (녹색 → 톱니 → 조립기 1 → 2 · 팔 · 쇠 상자 → 공급 상자) → 저장 상자."""
    from orders import submit
    green = 6 * a2 + ins + 3 * pp + 2
    iron = 29 * a2 + 3 * ins + green + 4
    detached.mark([WHO], OWNER, minutes=25)
    plan = [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
            ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": pp})]
    plan += p7_24.take_plan(ai, {"steel-plate": 2 * a2 + 8 * pp + 4, "copper-cable": 3 * green + 6, "iron-plate": iron},
                            {"steel-plate": 500, "copper-cable": 500, "iron-plate": 300})
    plan += [("craft", {"recipe": "electronic-circuit", "count": green, "wait": "block"}),
             ("craft", {"recipe": "iron-gear-wheel", "count": 10 * a2 + ins, "wait": "block"}),
             ("craft", {"recipe": "assembling-machine-1", "count": a2, "wait": "block"}),
             ("craft", {"recipe": A2, "count": a2, "wait": "block"}),
             ("craft", {"recipe": INS, "count": ins, "wait": "block"}),
             ("craft", {"recipe": "steel-chest", "count": pp, "wait": "block"}),
             ("craft", {"recipe": PP, "count": pp, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": A2, "x": STORE[0], "y": STORE[1], "count": a2}),
             ("insert", {"name": INS, "x": STORE[0], "y": STORE[1], "count": ins}),
             ("insert", {"name": PP, "x": STORE[0], "y": STORE[1], "count": pp})]
    plan = [p for p in plan if p[1].get("count", 1) > 0]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "plan": [p[0] for p in plan]}


def config(ai):
    """칸 제한 · 새 조립기 레시피 (결과칸이 비어 있을 때만)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local A = helpers.json_to_table('%s')
      local out = {}
      for _, q in pairs(A.box) do
        local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if e then e.get_inventory(defines.inventory.chest).set_bar(q[3] + 1); out[#out + 1] = 'bar ' .. q[1] .. ',' .. q[2]
        else out[#out + 1] = 'none ' .. q[1] .. ',' .. q[2] end
      end
      for _, q in pairs(A.asm) do
        local e = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if not e then out[#out + 1] = 'no asm ' .. q[1]
        else
          local r = e.get_recipe()
          if r and r.name == q[3] then out[#out + 1] = 'ok ' .. q[3]
          elseif e.get_inventory(defines.inventory.assembling_machine_output).is_empty() and e.get_inventory(defines.inventory.assembling_machine_input).is_empty() then
            e.set_recipe(q[3]); out[#out + 1] = 'set ' .. q[3] .. ' @' .. q[1]
          else out[#out + 1] = 'busy ' .. q[1] end
        end
      end
      return out end)()""" % json.dumps({"box": [[cx, cy, b] for _i, _j, _d, cx, cy, b, _w in OUT], "asm": [list(a) for a in ASM]}))


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index.ten_minutes
      local P1 = defines.flow_precision_index.one_minute
      local function c(k) return {math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'output', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P1, count = true})} end
      local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {tick = game.tick, p10 = {}, net = {}, asm = {}, labs = {}}
      for k, nm in pairs({purple = 'production-science-pack', module = 'productivity-module', rail = 'rail', efurn = 'electric-furnace',
                          engine = 'engine-unit', pipe = 'pipe', blue = 'chemical-science-pack', adv = 'advanced-circuit', green = 'electronic-circuit'}) do
        o.p10[k] = c(nm) end
      for k, nm in pairs({module = 'productivity-module', rail = 'rail', efurn = 'electric-furnace', engine = 'engine-unit', pipe = 'pipe',
                          adv = 'advanced-circuit', green = 'electronic-circuit', purple = 'production-science-pack', gear = 'iron-gear-wheel', iron = 'iron-plate'}) do
        o.net[k] = n.get_item_count(nm) end
      for _, e in pairs(s.find_entities_filtered{type = 'assembling-machine', force = f}) do
        local r = e.get_recipe()
        if r and (r.name == 'production-science-pack' or r.name == 'productivity-module' or r.name == 'engine-unit' or r.name == 'rail' or r.name == 'electric-furnace') then
          local k = r.name .. ':' .. (stn[e.status] or '?') o.asm[k] = (o.asm[k] or 0) + 1 end
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
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "need": need, "kit": kit,
          "config": config, "status": status}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

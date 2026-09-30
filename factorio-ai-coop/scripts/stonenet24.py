"""Run 24 P14 (10:3x): 돌을 망에 넣는다 - 보라가 레일 조립기 (12.5,15.5) 돌 0/1 에 묶였다.

M2 돌 벨트 (y -6.5, 서쪽으로) 의 돌은 전부 벽돌 화로 (74,-9) 로 갔고, 벽돌은 망에 6,920 - 화로 full_output →
돌 채굴기 3 대 waiting_for_space. 망 돌 70 < robofeed KEEP 200 이라 레일 R 돌 요청이 «모자람» 으로 빠졌다.

    --ghost : 벽돌 화로 돌 팔 (73.5,-7.5) active=false (필터는 그대로) · 벨트 북쪽 팔 2 → 공급 상자 2 (칸 제한) ·
              서쪽 빈 돌 광맥에 채굴기 1 (96.5,-4.5) · 중형 전봇대 1 - 모두 로봇 유령, can_place_entity{manual} 통과 자리만
    --bar   : 지어진 공급 상자에 칸 제한 (BAR 칸 = 돌 50 × BAR)
    --status: 채굴기 · 팔 · 상자 · 레일 · 보라 상태

    python scripts/stonenet24.py --run run24 --ghost
    python scripts/stonenet24.py --run run24 --bar --status
"""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge  # noqa

N, S = 0, 8          # 팔 방향 = 집는 쪽 (S 면 남쪽 벨트에서 집어 북쪽 상자에)
BAR = 10             # 상자당 돌 ≤ 500
GHOSTS = [
    {"name": "electric-mining-drill", "x": 96.5, "y": -4.5, "d": N},       # 돌 광맥 서쪽 빈 칸 - 벨트 (96.5,-6.5) 남 레인에 떨굼
    {"name": "medium-electric-pole", "x": 94.5, "y": -4.5, "d": N},        # 채굴기 · 팔 (97.5,-7.5) 전기 (작은 기둥 93.5 · 100.5 사이 빈 곳)
    {"name": "inserter", "x": 97.5, "y": -7.5, "d": S, "filter": "stone"},  # 97.5 벨트는 돌만 (철판은 96.5 에서 옆 싣기)
    {"name": "passive-provider-chest", "x": 97.5, "y": -8.5, "d": N},
    {"name": "inserter", "x": 95.5, "y": -7.5, "d": S, "filter": "stone"},  # 95.5 는 북 레인 철판 - 필터 돌
    {"name": "passive-provider-chest", "x": 95.5, "y": -8.5, "d": N},
]
BRICK_INS = (73.5, -7.5)

LUA_GHOST = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {placed = {}, have = {}, blocked = {}}
  local b = s.find_entities_filtered{name = "inserter", force = f, position = {%f, %f}, radius = 0.3}[1]
  if b then b.active = false; out.brick_ins_active = b.active end
  for _, q in pairs(helpers.json_to_table('%s')) do
    local p, tag = {q.x, q.y}, q.name .. "@" .. q.x .. "," .. q.y
    if s.count_entities_filtered{name = q.name, force = f, position = p, radius = 0.3} > 0
       or s.count_entities_filtered{ghost_name = q.name, force = f, position = p, radius = 0.3} > 0 then out.have[#out.have+1] = tag
    elseif s.can_place_entity{name = q.name, position = p, direction = q.d, force = f, build_check_type = defines.build_check_type.manual} then
      local gh = s.create_entity{name = "entity-ghost", inner_name = q.name, position = p, direction = q.d, force = f}
      if gh and q.filter then pcall(function() gh.use_filters = true; gh.set_filter(1, q.filter) end) end
      out.placed[#out.placed+1] = tag
    else out.blocked[#out.blocked+1] = tag end
  end
  return out
end)()"""

LUA_STATUS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
  local out = {bar = {}, ent = {}}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = q.name, force = f, position = {q.x, q.y}, radius = 0.3}[1]
    local tag = q.name .. "@" .. q.x .. "," .. q.y
    if not e then out.ent[tag] = s.count_entities_filtered{ghost_name = q.name, position = {q.x, q.y}, radius = 0.3} > 0 and "ghost" or "none"
    else
      local r = st[e.status] or tostring(e.status)
      if e.type == "logistic-container" then
        local inv = e.get_inventory(defines.inventory.chest)
        if %s then inv.set_bar(%d + 1) end
        r = r .. " stone " .. inv.get_item_count("stone")
      elseif e.type == "inserter" then r = r .. " filter " .. tostring(e.get_filter(1) and e.get_filter(1).name)
      end
      out.ent[tag] = r
    end
  end
  for _, d in pairs(s.find_entities_filtered{area = {{94, -6}, {110, -3}}, type = "mining-drill"}) do
    out.drill = out.drill or {}; out.drill[#out.drill+1] = d.position.x .. ":" .. (st[d.status] or d.status) end
  local net = s.find_logistic_network_by_position({66.5, -15.5}, f)
  out.net = {stone = net.get_item_count("stone"), brick = net.get_item_count("stone-brick"), rail = net.get_item_count("rail")}
  local function am(x, y) local a = s.find_entities_filtered{position = {x, y}, type = "assembling-machine"}[1]
    return {st[a.status], a.get_inventory(defines.inventory.assembling_machine_input).get_contents(), a.products_finished} end
  out.rail_asm, out.purple = am(12.5, 15.5), am(7.5, 15.5)
  local fs = f.get_item_production_statistics(s)
  local P = defines.flow_precision_index.ten_minutes
  local function flow(n, cat) return math.floor(fs.get_flow_count{name = n, category = cat, precision_index = P, count = true}) end
  out.ten = {stone = {flow("stone", "input"), flow("stone", "output")}, rail = {flow("rail", "input"), flow("rail", "output")},
             purple = flow("production-science-pack", "input")}
  return out
end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ghost", action="store_true")
    ap.add_argument("--bar", action="store_true")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.ghost:
        print(json.dumps(ai.lua(LUA_GHOST % (BRICK_INS[0], BRICK_INS[1], json.dumps(GHOSTS))), ensure_ascii=False))
    if a.bar or a.status:
        print(json.dumps(ai.lua(LUA_STATUS % (json.dumps(GHOSTS), "true" if a.bar else "false", BAR)), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

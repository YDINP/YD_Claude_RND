"""run24 방어 올리기 (2026-09-30 15:2x) - 진화 0.56, 큰 이빨에 노랑 ~1 · 피어싱 3.2.

사용자 (코디네이터 전달): 화염 · 레이저 포탑을 들이고, 돌을 늘리고, 동쪽 전초 공격면 벽을 두 겹으로.

    python scripts/def24.py check|ghosts|need|kit|config|status   [--part stone,laser,kit]
    python scripts/def24.py lasers [--make]      (laser-turret 연구 뒤) 동쪽 전초 · NW 포탑 사이 레이저 자리 (can_place manual · 전기 닿는 곳)
    python scripts/def24.py walls [--make]       동쪽 전초 한 겹 벽 → 바깥 둘째 겹 유령
    python scripts/def24.py power                 전력 여유 (MW) · 축전

부분:
  stone  돌 광맥 (x 99..110, y 0..6, 23만, 드릴 0) - 드릴 8 (두 줄이 가운데 공급 상자 4 에 마주 봄) → 망 돌 → 벽돌 화로 (milsci24).
         북 줄 (x, 1.5) 남향 · 남 줄 (x, 5.5) 북향, 결과 칸 둘 다 (x, 3.5) = 공급 상자. 발 밑 나무 · 바위는 로봇 해체 표시.
  laser  레이저 포탑 조립기 2 (93.5,-0.5) ← 팔 ← 요청 상자 (96.5,-0.5, 강철 40 · 녹색 40 · 배터리 24) · 결과 팔 → 공급 상자 (93.5,2.5, 칸 1).
         조리법은 laser-turret 연구가 끝나면 config 가 넣는다 (빈 조립기만).

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 건물 · 유령 선 칸 건너뜀) · 해체 표시 · 조리법 · 요청 · 칸 제한 · 사람 손 (허브 상자 → 손제작 → 저장 상자).
"""
import argparse
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
import p7_24  # noqa: E402

N, E, S, W = 0, 4, 8, 12
WHO, OWNER = "foxtrot", "def24"
STORE = (-76.5, -13.5)       # 16:0x (59.5,-14.5) 가 가득 (전선 6,941) - foxtrot 넣기가 실패했다. 기지 망 저장 상자 중 빈 칸이 있는 곳은 서쪽뿐
DRILL, PP, RQ, MPOLE, AM2, INS = "electric-mining-drill", "passive-provider-chest", "requester-chest", "medium-electric-pole", "assembling-machine-2", "inserter"

PARTS = {"stone": [], "laser": [], "nwpower": []}
for _x in (100.5, 103.5, 106.5, 109.5):
    PARTS["stone"] += [(DRILL, _x, 1.5, S, None), (DRILL, _x, 5.5, N, None), (PP, _x, 3.5, N, None)]
PARTS["stone"] += [(MPOLE, 98.5, 3.5, N, None), (MPOLE, 104.5, 3.5, N, None), (MPOLE, 110.5, 3.5, N, None)]
STONE_CLEAR = [[97, -1], [112, 8]]          # 해체 표시 (나무 · 바위)
LASER_ASM, LASER_RQ = (93.5, -0.5), (96.5, -0.5)
PARTS["laser"] = [(AM2, 93.5, -0.5, N, None), (INS, 95.5, -0.5, E, None), (RQ, 96.5, -0.5, N, None),
                  (INS, 93.5, 1.5, N, None), (PP, 93.5, 2.5, N, None)]
# NW 무리에 전기 없음 (반경 60 전봇대 = 기지 북쪽 작은 전봇대 (-15.5,-100.5) 가 가장 가까움) - 레이저 포탑 자리에 중형 전봇대 줄
PARTS["nwpower"] = [(MPOLE, x, y, N, None) for x, y in ((-20.5, -105.5), (-21.5, -110.5), (-27.5, -116.5), (-32.5, -121.5))]
REQUESTS = [(LASER_RQ, {"steel-plate": 40, "electronic-circuit": 40, "battery": 24})]
BARS = [((93.5, 2.5), 1)] + [((x, 3.5), 24) for x in (100.5, 103.5, 106.5, 109.5)]   # 돌 상자 4 → 24 칸 (15:4x 드릴 6/8 waiting_for_space)


def rows(parts):
    g = []
    for p in parts:
        g += PARTS[p]
    return g


def place(ai, g, make):
    return ai.lua(LUA_PLACE % ("true" if make else "false", json.dumps([[n, x, y, d, r or ""] for n, x, y, d, r in g])))


def clear(ai):
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player local n = 0
      for _, e in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = %s}) do
        if not e.to_be_deconstructed() then e.order_deconstruction(f); n = n + 1 end end
      return {marked = n} end)()""" % json.dumps(STONE_CLEAR).replace("[", "{").replace("]", "}"))


def need(ai, g):
    want = {}
    for n, *_ in g:
        want[n] = want.get(n, 0) + 1
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local o = {}
      local mn = s.find_logistic_network_by_position({66.5, -15.5}, f)
      for _, q in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3} > 0 then o[q[1]] = (o[q[1]] or 0) + 1 end
      end
      o.net = {}
      for _, k in pairs(helpers.json_to_table('%s')) do o.net[k] = mn.get_item_count(k) end
      return o end)()""" % (json.dumps([[n, x, y] for n, x, y, *_ in g]), json.dumps(list(want))))
    net = have.pop("net", {}) or {}
    return {k: max(0, v - int(have.get(k, 0)) - int(net.get(k, 0))) for k, v in want.items()}


# 손제작 재료 (2.0): 드릴 = 회로 3 · 톱니 5 · 철 10 / 조립기 2 = 조립기 1 + 강철 2 · 회로 3 · 톱니 5 / 조립기 1 = 회로 3 · 톱니 5 · 철 9
#   물류 상자 = 강철 상자 + 회로 3 + 고급 1 / 팔 = 회로 1 · 톱니 1 · 철 1 / 중형 전봇대 = 강철 2 · 구리 2 · 철 막대 4 (철 2)
def kit(ai, g):
    from orders import submit
    miss = need(ai, g)
    d, a2, pp, rq, ins, mp = (miss.get(k, 0) for k in (DRILL, AM2, PP, RQ, INS, MPOLE))
    box = pp + rq
    circ = 3 * d + 6 * a2 + 3 * box + ins
    gear = 5 * d + 10 * a2 + ins
    iron = 10 * d + 9 * a2 + ins + 2 * mp + 2 * gear
    mats = {"iron-plate": iron + 4, "steel-plate": 2 * a2 + 8 * box + 2 * mp + 2, "copper-plate": 2 * mp + 2}
    detached.mark([WHO], OWNER, minutes=30)
    plan = p7_24.take_plan(ai, mats, {"iron-plate": 800, "steel-plate": 500, "copper-plate": 100})
    extra = {"electronic-circuit": circ + 2, "advanced-circuit": box}
    extra = {k: v for k, v in extra.items() if v > 0}
    if extra:
        import milsci24
        plan += milsci24.chest_take(ai, extra)
    for n, q in (("iron-gear-wheel", gear), ("steel-chest", box), (PP, pp), (RQ, rq), (DRILL, d),
                 ("assembling-machine-1", a2), (AM2, a2), (INS, ins), (MPOLE, mp)):
        if q:
            plan.append(("craft", {"recipe": n, "count": q, "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for n, q in ((DRILL, d), (AM2, a2), (PP, pp), (RQ, rq), (INS, ins), (MPOLE, mp)):
        if q:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    submit(ai, WHO, plan, strict=False)
    return {"miss": miss, "mats": mats, "extra": extra, "steps": len(plan)}


LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {req = {}, bar = {}}
  for _, q in pairs(A.requests) do
    local e = s.find_entities_filtered{name = 'requester-chest', force = f, position = q[1], radius = 0.3}[1]
    if e then
      local sec = e.get_requester_point().sections[1] or e.get_requester_point().add_section()
      local i = 1
      for name, cnt in pairs(q[2]) do sec.set_slot(i, {value = name, min = cnt}); i = i + 1 end
      out.req[#out.req + 1] = 'ok'
    else out.req[#out.req + 1] = 'none' end
  end
  for _, q in pairs(A.bars) do
    local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = q[1], radius = 0.3}[1]
    if e then e.get_inventory(defines.inventory.chest).set_bar(q[2] + 1); out.bar[#out.bar + 1] = 'ok' else out.bar[#out.bar + 1] = 'none' end
  end
  local a = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = A.laser, radius = 0.3}[1]
  if a and f.recipes['laser-turret'].enabled and a.get_recipe() == nil then a.set_recipe('laser-turret'); out.laser = 'set'
  else out.laser = a and (a.get_recipe() and a.get_recipe().name or (f.recipes['laser-turret'].enabled and 'none' or 'not researched')) or 'no asm' end
  return out
end)()"""


def config(ai):
    return ai.lua(LUA_CONFIG % json.dumps({"requests": [[list(p), q] for p, q in REQUESTS],
                                           "bars": [[list(p), b] for p, b in BARS], "laser": list(LASER_ASM)}))


def power(ai):
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local pole = s.find_entities_filtered{type = 'electric-pole', position = {83.5, -2.5}, radius = 0.5}[1]
      local st = pole.electric_network_statistics
      local o = {}
      for _, pi in pairs({{'m1', defines.flow_precision_index.one_minute}, {'m10', defines.flow_precision_index.ten_minutes}, {'h1', defines.flow_precision_index.one_hour}}) do
        local c, p = 0, 0
        for k, _ in pairs(st.input_counts) do c = c + st.get_flow_count{name = k, category = 'input', precision_index = pi[2], count = false} end
        for k, _ in pairs(st.output_counts) do p = p + st.get_flow_count{name = k, category = 'output', precision_index = pi[2], count = false} end
        o[pi[1]] = {use_MW = math.floor(c * 60 / 1e5) / 10, gen_MW = math.floor(p * 60 / 1e5) / 10}
      end
      local acc, e = s.find_entities_filtered{name = 'accumulator', force = f}, 0
      for _, a in pairs(acc) do e = e + a.energy end
      o.acc, o.acc_MJ, o.acc_max_MJ = #acc, math.floor(e / 1e6), #acc * 5
      o.solar, o.engines, o.boilers = s.count_entities_filtered{name = 'solar-panel', force = f}, s.count_entities_filtered{name = 'steam-engine', force = f}, s.count_entities_filtered{name = 'boiler', force = f}
      local work = 0
      for _, b in pairs(s.find_entities_filtered{name = 'boiler', force = f}) do if b.status == defines.entity_status.working then work = work + 1 end end
      o.boilers_working = work
      o.cap_steam_MW = math.min(o.engines * 0.9, o.boilers * 1.8)
      o.cap_solar_peak_MW = o.solar * 0.06
      o.daytime = s.daytime
      o.lasers = s.count_entities_filtered{name = 'laser-turret', force = f}
      return o end)()""")


LUA_LASER_SPOTS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {spots = {}, placed = 0, why = {}}
  local taken = {}
  for _, z in pairs(A.zones) do
    local n = 0
    local guns = s.find_entities_filtered{name = 'gun-turret', force = f, area = {{z[1], z[2]}, {z[3], z[4]}}}
    for _, g in pairs(guns) do
      if n >= z[5] then break end
      -- 포탑 옆 (2 칸 떨어진 4 방향 · 대각) 중 설치 가능하고 전기가 닿는 첫 칸
      for _, d in pairs({{2, 0}, {-2, 0}, {0, 2}, {0, -2}, {2, 2}, {-2, 2}, {2, -2}, {-2, -2}}) do
        local p = {g.position.x + d[1], g.position.y + d[2]}
        local key = math.floor(p[1]) .. ',' .. math.floor(p[2])
        if not taken[key] and s.can_place_entity{name = 'laser-turret', position = p, force = f, build_check_type = defines.build_check_type.manual}
           and s.count_entities_filtered{ghost_name = 'laser-turret', position = p, radius = 1.5} == 0 then
          local powered = false
          for _, pl in pairs(s.find_entities_filtered{type = 'electric-pole', force = f, position = p, radius = 8}) do
            local r = pl.prototype.get_supply_area_distance()
            if math.abs(pl.position.x - p[1]) <= r + 1 and math.abs(pl.position.y - p[2]) <= r + 1 then powered = true break end
          end
          if powered then
            taken[key] = true
            for dx = -1, 1 do for dy = -1, 1 do taken[math.floor(p[1]) + dx .. ',' .. math.floor(p[2]) + dy] = true end end
            out.spots[#out.spots + 1] = z[6] .. ' ' .. p[1] .. ',' .. p[2]
            if A.make then s.create_entity{name = 'entity-ghost', inner_name = 'laser-turret', position = p, force = f}; out.placed = out.placed + 1 end
            n = n + 1
            break
          end
        end
      end
    end
    out.why[#out.why + 1] = z[6] .. ' guns ' .. #guns .. ' spots ' .. n
  end
  return out
end)()"""
# (x0, y0, x1, y1, 최대, 이름) - 동쪽 전초 공격면 먼저 (남면 y -110 · 동면 x 415..422 · 북 무리 y -174..-150 · 서쪽 문), 그다음 NW 무리
LASER_ZONES = [[385, -115, 425, -105, 4, "east-S"], [410, -140, 425, -130, 3, "east-E"], [385, -180, 405, -148, 3, "east-N"],
               [364, -118, 374, -105, 2, "east-Wgate"], [-36, -127, -22, -107, 4, "NW"], [-14, -138, -8, -109, 2, "NW-E"]]


def lasers(ai, make):
    return ai.lua(LUA_LASER_SPOTS % json.dumps({"zones": LASER_ZONES, "make": bool(make)}))


# 동쪽 전초 벽 (15:4x 실측): 서 x 396 (y -193..-115) · 동 x 428 (y -201..-114) 한 겹, 북쪽은 벽 없음 (드릴 유령 y -190 위가 열림),
#   남 y -114 · -107 두 줄 (사이 포탑 줄). 포탑 잡은 수: 동면 (420,-138) 77 · (420,-134) 34 · (415,-138) 19 가 가장 많음, 큰 이빨 둘이 (428,-191) (428,-184) 동벽에.
#   둥지: 동남 (526,-99) (550,-94) (530,-92) · 북 (442,-342) (436,-337) (435,-323).
#   → 공격면 = 동면. 북쪽 y -196 위는 물 (can_place 막힘 · 물고기) = 막힌 면. 동벽은 x 427.5 한 겹 87 → 안쪽 둘째 겹 x 426.5.
WALLS = [("stone-wall", 426.5, y + 0.5, N, None) for y in range(-201, -114)]


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index.ten_minutes
      local function c(k) return {math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}),
                                  math.floor(st.get_flow_count{name = k, category = 'output', precision_index = P, count = true})} end
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end
      local o = {stone = c('stone'), brick = c('stone-brick'), laser = c('laser-turret'), net_stone = n.get_item_count('stone'), drills = {}}
      for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', force = f, area = {{98, -1}, {112, 8}}}) do
        local k = stn[d.status] or '?'; o.drills[k] = (o.drills[k] or 0) + 1 end
      local r = f.current_research
      o.research = r and (r.name .. ' ' .. math.floor(f.research_progress * 100)) or '-'
      o.queue = {} for _, t in pairs(f.research_queue) do o.queue[#o.queue + 1] = t.name end
      return o end)()""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step")
    ap.add_argument("--part", default="stone,laser")
    ap.add_argument("--make", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    g = rows([p for p in a.part.split(",") if p])
    if a.step == "check":
        r = place(ai, g, False)
    elif a.step == "ghosts":
        r = {"clear": clear(ai) if "stone" in a.part else None, "place": place(ai, g, True)}
    elif a.step == "need":
        r = need(ai, g)
    elif a.step == "kit":
        r = kit(ai, g)
    elif a.step == "config":
        r = config(ai)
    elif a.step == "power":
        r = power(ai)
    elif a.step == "lasers":
        r = lasers(ai, a.make)
    elif a.step == "walls":
        r = place(ai, WALLS, a.make)
        r = {"new": len(r.get("placed") or []), "have": len(r.get("have") or []), "blocked": r.get("blocked")}
    elif a.step == "status":
        r = status(ai)
    else:
        raise SystemExit("step?")
    print(json.dumps(r, ensure_ascii=False))


if __name__ == "__main__":
    main()

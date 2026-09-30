"""Run 24: P10 북쪽 구리 전초 되찾기 (17:4x ~) - 레이저 먼저 · 모으는 줄 · 포탑 기어가기 · 유령 되돌리기.

17:4x 함락: P10 북쪽 (드릴 밭 y -145..-130) 포탑 12 · 드릴 12 · 벨트 36 · 인서터 10 잃음, 건설 로봇 74 가 날아들다 죽음.
조정자가 유령 94 를 지우고 state/run24_p10_hold.json 에 (name, x, y, dir, ip) 로 둠.
남은 적은 대부분 불 (acid-splash-fire-*) 이고 유닛은 침 뱉개 몇 - 침 사거리 13~15 < 포탑 18 < 레이저 24.
→ 레이저를 적에서 17 넘게 떨어진 곳에 (전기 닿는 칸, 망 예비 10) 먼저 놓아 침을 치우고, 그다음 총 포탑 모으는 줄 · 벽.

  lasers  [--n 6] [--make]  : 구역 LZONE 안 can_place manual · 전봇대 공급 칸 안 (가장자리 아님) · 적 유닛/벌레에서 ≥ SAFE 인 자리
  stage   [--make]          : 모으는 줄 총 포탑 (insert_plan 피어싱 30) + 벽. 망 포탑 수만큼만.
  advance [--make]          : hold 목록을 되돌림 - 둘레 R_CLEAR 안 적 0 인 것만. 포탑 → 벽 → 전봇대 → 나머지. 포탑은 insert_plan 피어싱 30.
  craft   --who delta --n 12: 허브 쇠 상자 철 · 구리 → 손제작 포탑 → 망 저장 상자 (사람 손, Lua 아이템 이동 0)
  kit     --who delta       : hold 목록의 드릴 · 벨트 · 인서터 · 쇠 상자 · 중형 전봇대 손제작 → 망 저장 상자
  status

Lua 아이템 이동 0 · 적에 Lua 피해 0 · force.chart 0. 유령은 can_place manual 통과 · 같은 이름 선/유령 없는 칸만.
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
from orders import submit  # noqa: E402

OWNER = "p10retake"
HOLD = os.path.join(HERE, "..", "state", "run24_p10_hold.json")
AMMO = "piercing-rounds-magazine"
FILL = 30
SAFE = 17                         # 침 뱉개 큰 15 · 중형 14 + 여유
R_CLEAR = 26                      # 되돌릴 유령 둘레 적 0 (큰 침 15 + 포탑 사이)
AREA = [[-60, -250], [90, -80]]   # 적 세는 곳
LZONE = [-8, -126, 34, -108]      # 레이저 자리 (P10 판 · 화로 구역 남쪽 끝 ~ 북쪽 드릴 밭 앞)
HUB_IRON = (74.5, -15.5)          # 허브 쇠 상자 철 (eastsup · eastdrill KEEP 150)
HUB_CU = (67.5, -15.5)            # 구리 3,000
STORE = (61.5, -14.5)             # 망 9 저장 상자 (59.5,-14.5 는 구리 전선 7,400 으로 가득 - 17:5x 넣기 실패)
# 모으는 줄 (y -118..-122, 드릴 밭 남쪽 끝 y -130 과 P10 화로 줄 사이): 둘레 포탑 넷 (4/9,-114) (4/9,-118) 에 붙여
STAGE = [(-2, -118), (-2, -121), (1, -121), (12, -121), (15, -117), (-5, -121), (18, -123), (1, -124), (12, -124), (-5, -118)]

COMMON = """
  local s, f = game.surfaces[1], game.forces.player
  local function foes_near(p, r)
    return s.count_entities_filtered{position = p, radius = r, force = 'enemy', type = {'unit', 'turret', 'unit-spawner'}}
  end
  local function place(name, p, dir, ammo)
    if s.count_entities_filtered{position = p, radius = 0.4, name = name} + s.count_entities_filtered{position = p, radius = 0.4, ghost_name = name} > 0 then return 'skip' end
    if not s.can_place_entity{name = name, position = p, direction = dir, force = f, build_check_type = defines.build_check_type.manual} then return 'blocked' end
    local g = s.create_entity{name = 'entity-ghost', inner_name = name, position = p, direction = dir, force = f}
    if g and ammo and ammo > 0 then pcall(function() g.insert_plan = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = ammo}}}}} end) end
    return g and 'ghost' or 'fail'
  end
  local function powered(p, half)
    for _, pl in pairs(s.find_entities_filtered{type = 'electric-pole', force = f, position = p, radius = 9}) do
      local r = pl.prototype.get_supply_area_distance()
      if math.abs(pl.position.x - p[1]) < r + half and math.abs(pl.position.y - p[2]) < r + half and pl.electric_network_id ~= nil then return true end
    end
    return false
  end
  local function net() return s.find_logistic_network_by_position({-19, -102}, f) end
""" % AMMO


def lasers(ai, n, make):
    return ai.lua("""(function()%s
      local Z = helpers.json_to_table('%s')
      local N = net()
      local have = N and N.get_item_count('laser-turret') or 0
      local out = {net_lasers = have, spots = {}, placed = 0}
      local want = math.min(%d, have - s.count_entities_filtered{ghost_name = 'laser-turret', force = f})
      local taken = {}
      for y = Z[2], Z[4] do
        for x = Z[1], Z[3] do
          if #out.spots >= want then break end
          local p = {x, y}
          local ok = not taken[x .. ',' .. y]
          if ok then ok = s.can_place_entity{name = 'laser-turret', position = p, force = f, build_check_type = defines.build_check_type.manual} end
          if ok then ok = s.count_entities_filtered{area = {{x - 1.5, y - 1.5}, {x + 1.5, y + 1.5}}, type = 'entity-ghost'} == 0 end
          if ok then ok = powered(p, 1) end
          if ok then ok = foes_near(p, %d) == 0 end
          -- 레이저끼리 5 칸 넘게 (한 줄로 퍼지게)
          if ok then ok = s.count_entities_filtered{position = p, radius = 5, name = 'laser-turret'} + s.count_entities_filtered{position = p, radius = 5, ghost_name = 'laser-turret'} == 0 end
          if ok then
            for dx = -2, 2 do for dy = -2, 2 do taken[(x + dx) .. ',' .. (y + dy)] = true end end
            out.spots[#out.spots + 1] = x .. ',' .. y
            if %s then s.create_entity{name = 'entity-ghost', inner_name = 'laser-turret', position = p, force = f}; out.placed = out.placed + 1 end
          end
        end
      end
      return out
    end)()""" % (COMMON, json.dumps(LZONE), n, SAFE, "true" if make else "false"))


def stage(ai, make):
    return ai.lua("""(function()%s
      local N = net()
      local tur = N and N.get_item_count('gun-turret') or 0
      local amm = N and N.get_item_count('%s') or 0
      local pend = s.count_entities_filtered{area = {{-60, -160}, {60, -90}}, ghost_name = 'gun-turret', force = f}
      local out = {net_turrets = tur, net_ammo = amm, pending = pend, res = {}}
      local budget = math.min(tur - pend, math.floor(amm / %d))
      for _, p in pairs(helpers.json_to_table('%s')) do
        local r
        if budget <= 0 then r = 'no_stock'
        elseif foes_near(p, %d) > 0 then r = 'foes'
        elseif %s then r = place('gun-turret', p, defines.direction.north, %d) if r == 'ghost' then budget = budget - 1 end
        else r = s.can_place_entity{name = 'gun-turret', position = p, force = f, build_check_type = defines.build_check_type.manual} and 'ok' or 'blocked' end
        out.res[#out.res + 1] = p[1] .. ',' .. p[2] .. ' ' .. r
      end
      -- 이미 선 유령 (죽은 포탑이 남긴 것) 에 탄을 단다
      local fixed = 0
      for _, g in pairs(s.find_entities_filtered{area = {{-60, -160}, {60, -90}}, ghost_name = 'gun-turret', force = f}) do
        if #g.insert_plan == 0 then pcall(function() g.insert_plan = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}} end) fixed = fixed + 1 end
      end
      out.plan_fixed = fixed
      return out
    end)()""" % (COMMON, AMMO, FILL, json.dumps([list(p) for p in STAGE]), SAFE, "true" if make else "false", FILL, AMMO, FILL))


ORDER = {"gun-turret": 0, "laser-turret": 0, "stone-wall": 1, "small-electric-pole": 2, "medium-electric-pole": 2}


def advance(ai, make, kinds=None):
    hold = json.load(open(HOLD, encoding="utf-8"))
    hold.sort(key=lambda g: ORDER.get(g["name"], 3))
    todo = [g for g in hold if not kinds or g["name"] in kinds]
    r = ai.lua("""(function()%s
      local H = helpers.json_to_table('%s')
      local N = net()
      local out = {res = {}, foes = s.count_entities_filtered{area = {{-10, -160}, {50, -110}}, force = 'enemy', type = {'unit', 'turret', 'unit-spawner'}}}
      local stock = {}
      for i, g in pairs(H) do
        local p = {g.x, g.y}
        local r
        if s.count_entities_filtered{position = p, radius = 0.4, name = g.name} > 0 then r = 'built'
        elseif s.count_entities_filtered{position = p, radius = 0.4, ghost_name = g.name} > 0 then r = 'ghost_have'
        elseif foes_near(p, %d) > 0 then r = 'foes'
        elseif not %s then r = s.can_place_entity{name = g.name, position = p, direction = g.dir, force = f, build_check_type = defines.build_check_type.manual} and 'ok' or 'blocked'
        else
          local amm = 0
          if g.name == 'gun-turret' then amm = %d end
          r = place(g.name, p, g.dir, amm)
        end
        out.res[i] = r
      end
      return out
    end)()""" % (COMMON, json.dumps(todo), R_CLEAR, "true" if make else "false", FILL))
    res = r.get("res") or {}
    res = [res[k] for k in sorted(res, key=lambda k: int(k))] if isinstance(res, dict) else res
    summ = {}
    for g, x in zip(todo, res):
        summ.setdefault(g["name"], {}).setdefault(x, 0)
        summ[g["name"]][x] += 1
    return {"foes_p10": r.get("foes"), "by": summ}


def status(ai):
    return ai.lua("""(function()%s
      local o = {}
      local U = {}
      for _, e in pairs(s.find_entities_filtered{area = {{-10, -160}, {50, -105}}, force = 'enemy', type = {'unit', 'turret', 'unit-spawner'}}) do
        U[#U + 1] = e.name .. ' ' .. math.floor(e.position.x) .. ',' .. math.floor(e.position.y) end
      o.foes = U
      local T = {}
      for _, t in pairs(s.find_entities_filtered{area = {{-15, -150}, {50, -105}}, type = {'ammo-turret', 'electric-turret'}, force = f}) do
        local a = t.type == 'ammo-turret' and t.get_inventory(defines.inventory.turret_ammo).get_item_count() or -1
        T[#T + 1] = t.name:sub(1, 3) .. ' ' .. t.position.x .. ',' .. t.position.y .. ' a' .. a .. ' k' .. t.kills
      end
      o.turrets = T
      o.ghosts = {}
      for _, g in pairs(s.find_entities_filtered{area = {{-15, -150}, {50, -105}}, type = 'entity-ghost', force = f}) do o.ghosts[g.ghost_name] = (o.ghosts[g.ghost_name] or 0) + 1 end
      local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end
      o.drills = {}
      for _, d in pairs(s.find_entities_filtered{area = {{-5, -150}, {50, -80}}, name = 'electric-mining-drill', force = f}) do local k = stn[d.status] o.drills[k] = (o.drills[k] or 0) + 1 end
      local N = net()
      if N then o.net = {robots = N.all_construction_robots, avail = N.available_construction_robots, gun = N.get_item_count('gun-turret'), laser = N.get_item_count('laser-turret'),
                         ammo = N.get_item_count('%s'), wall = N.get_item_count('stone-wall'), drill = N.get_item_count('electric-mining-drill'),
                         belt = N.get_item_count('transport-belt'), ins = N.get_item_count('inserter')} end
      local st = f.get_kill_count_statistics(s)
      o.robots_lost = math.floor(st.get_output_count('construction-robot'))
      o.tick = game.tick
      return o
    end)()""" % (COMMON, AMMO))


def craft_plan(ai, who, n):
    """포탑 = 톱니 10 (철 20) + 구리 10 + 철 20 → 철 40 · 구리 10."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    iron = max(0, 40 * n - bag.get("iron-plate", 0))
    cu = max(0, 10 * n - bag.get("copper-plate", 0))
    plan = []
    if iron:
        plan += [("walk_to", {"x": HUB_IRON[0], "y": HUB_IRON[1] + 1.5}), ("take", {"name": "iron-plate", "x": HUB_IRON[0], "y": HUB_IRON[1], "count": iron})]
    if cu:
        plan += [("walk_to", {"x": HUB_CU[0], "y": HUB_CU[1] + 1.5}), ("take", {"name": "copper-plate", "x": HUB_CU[0], "y": HUB_CU[1], "count": cu})]
    plan += [("craft", {"recipe": "gun-turret", "count": n, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": "gun-turret", "x": STORE[0], "y": STORE[1], "count": n})]
    return plan


KIT = {  # 이름: (조리법, 철, 구리) 1 개 손제작 (중간재 포함, 녹색 회로 = 철 1 · 구리 1.5)
    "electric-mining-drill": (10 + 10 + 3, 5),      # 철 10 · 톱니 5 · 회로 3
    "transport-belt": (1.5, 0),                     # 2 개에 철 1 + 톱니 1
    "inserter": (1 + 2 + 1, 2),                     # 철 1 · 톱니 1 · 회로 1
    "iron-chest": (8, 0),
}


def kit_plan(ai, who):
    hold = json.load(open(HOLD, encoding="utf-8"))
    need = {}
    for g in hold:
        if g["name"] in KIT:
            need[g["name"]] = need.get(g["name"], 0) + 1
    # 함락 때 조정자 목록에 안 든 유령 (남쪽 드릴 12 · 벨트 32 ...) 도 같은 망이 짓는다
    got = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for _, g in pairs(s.find_entities_filtered{type = 'entity-ghost', area = {{-15, -150}, {50, -105}}}) do o[g.ghost_name] = (o[g.ghost_name] or 0) + 1 end
      local N = s.find_logistic_network_by_position({-19, -102}, game.forces.player)
      local st = {} for k, _ in pairs(helpers.json_to_table('%s')) do st[k] = N.get_item_count(k) end
      return {g = o, st = st} end)()""" % json.dumps(KIT))
    hold_now = {(g["name"], g["x"], g["y"]) for g in hold}
    for k, c in (got.get("g") or {}).items():
        if k in KIT:
            need[k] = need.get(k, 0) + int(c)
    for k, c in (got.get("st") or {}).items():
        if k in need:
            need[k] = max(0, need[k] - max(0, int(c)))
    del hold_now
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    put = dict(need)                      # 가방에 이미 든 것도 함께 넣는다
    iron = cu = 0
    for k, c in need.items():
        c = max(0, c - bag.get(k, 0))
        need[k] = c
        iron += KIT[k][0] * c
        cu += KIT[k][1] * c
    iron, cu = int(iron) + 10 - bag.get("iron-plate", 0), int(cu) + 10 - bag.get("copper-plate", 0)
    plan = []
    if iron > 0:
        plan += [("walk_to", {"x": HUB_IRON[0], "y": HUB_IRON[1] + 1.5}), ("take", {"name": "iron-plate", "x": HUB_IRON[0], "y": HUB_IRON[1], "count": iron})]
    if cu > 0:
        plan += [("walk_to", {"x": HUB_CU[0], "y": HUB_CU[1] + 1.5}), ("take", {"name": "copper-plate", "x": HUB_CU[0], "y": HUB_CU[1], "count": cu})]
    for k, c in need.items():
        if c:
            plan.append(("craft", {"recipe": k, "count": c + (c % 2 if k == "transport-belt" else 0), "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for k, c in put.items():
        if c:
            plan.append(("insert", {"name": k, "x": STORE[0], "y": STORE[1], "count": c}))
    return plan


ADV_SRC = (25.5, -9.5)            # 공급 상자 고급 회로 3,837
STEEL_SRC = (75.5, -15.5)         # 공급 상자 강철 3,681
PORT_ZONE = [13, -134, 13, -134]   # 17:5x 조회: 남쪽은 P10 화로 · 드릴 유령으로 빽빽, (13,-132) 는 hold 드릴 (13.5,-130.5) 과 겹침 → P10 북쪽 로보포트 (건설 55 가 x 43.5 벽 · 북쪽 포탑 (35/40,-134..-138) 까지, 물류 25 가 C (-19,-102) 와 겹침)


def port_plan(ai, who):
    """로보포트 = 강철 45 · 톱니 45 (철 90) · 고급 회로 45. 사람이 공급 상자에서 꺼내 손제작 → 망 저장 상자."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    plan = []
    if bag.get("advanced-circuit", 0) < 45:
        plan += [("walk_to", {"x": ADV_SRC[0], "y": ADV_SRC[1] + 1.5}), ("take", {"name": "advanced-circuit", "x": ADV_SRC[0], "y": ADV_SRC[1], "count": 45 - bag.get("advanced-circuit", 0)})]
    if bag.get("steel-plate", 0) < 45:
        plan += [("walk_to", {"x": STEEL_SRC[0], "y": STEEL_SRC[1] + 1.5}), ("take", {"name": "steel-plate", "x": STEEL_SRC[0], "y": STEEL_SRC[1], "count": 45 - bag.get("steel-plate", 0)})]
    if bag.get("iron-plate", 0) < 90:
        plan += [("walk_to", {"x": HUB_IRON[0], "y": HUB_IRON[1] + 1.5}), ("take", {"name": "iron-plate", "x": HUB_IRON[0], "y": HUB_IRON[1], "count": 90 - bag.get("iron-plate", 0)})]
    plan += [("craft", {"recipe": "roboport", "count": 1, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": "roboport", "x": STORE[0], "y": STORE[1], "count": 1})]
    return plan


def port_ghost(ai, make):
    """망 9 에 로보포트가 있을 때 PORT_ZONE 에서 can_place manual · 전기 닿는 첫 칸 (북쪽 먼저) 에 유령."""
    return ai.lua("""(function()%s
      local Z = helpers.json_to_table('%s')
      if s.count_entities_filtered{area = {{Z[1] - 4, Z[2] - 4}, {Z[3] + 4, Z[4] + 4}}, name = 'roboport'} + s.count_entities_filtered{area = {{Z[1] - 4, Z[2] - 4}, {Z[3] + 4, Z[4] + 4}}, ghost_name = 'roboport'} > 0 then return {r = 'have'} end
      for y = Z[4], Z[2], -1 do for x = Z[1], Z[3] do   -- 남쪽 (안쪽) 먼저
        local p = {x, y}
        if s.can_place_entity{name = 'roboport', position = p, force = f, build_check_type = defines.build_check_type.manual}
           and s.count_entities_filtered{area = {{x - 2.5, y - 2.5}, {x + 2.5, y + 2.5}}, type = 'entity-ghost'} == 0 and powered(p, 2) and foes_near(p, 30) == 0 then
          if %s then s.create_entity{name = 'entity-ghost', inner_name = 'roboport', position = p, force = f} end
          return {r = 'spot ' .. x .. ',' .. y}
        end
      end end
      return {r = 'none'}
    end)()""" % (COMMON, json.dumps(PORT_ZONE), "true" if make else "false"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step")
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--who", default="delta")
    ap.add_argument("--make", action="store_true")
    ap.add_argument("--kinds", default="")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    os.environ[detached.ENV] = OWNER
    if a.step == "lasers":
        r = lasers(ai, a.n, a.make)
    elif a.step == "stage":
        r = stage(ai, a.make)
    elif a.step == "advance":
        r = advance(ai, a.make, [k for k in a.kinds.split(",") if k])
    elif a.step == "status":
        r = status(ai)
    elif a.step == "portghost":
        r = port_ghost(ai, a.make)
    elif a.step in ("craft", "kit", "port"):
        o = detached.owner(a.who)
        if o not in (None, OWNER):
            print(a.who, "owned by", o, "- skip")
            return 1
        plan = {"craft": lambda: craft_plan(ai, a.who, a.n), "kit": lambda: kit_plan(ai, a.who), "port": lambda: port_plan(ai, a.who)}[a.step]()
        if a.dry:
            for s in plan:
                print("  ", s)
            return 0
        detached.mark([a.who], OWNER, minutes=30)
        r = submit(ai, a.who, plan, strict=False)
    elif a.step == "release":
        detached.release([a.who])
        r = "released " + a.who
    else:
        raise SystemExit("step?")
    print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

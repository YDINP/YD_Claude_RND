"""Run 24 전력 여유 (17:3x ~) - 레이저 포탑 예비 10 을 더 세울 전기.

17:36 실측: 태양 줄 공급 상자 셋 (-30.5,-22.5) (-37.5,-15.5) (-42.5,-16.5) 에 **태양광 2,209 · 축전지 490** 이 쌓여 있었다.
상자가 로보포트 건설 범위뿐 (물류 범위 밖, logistic_network = nil) 이라 로봇이 판 유령 88 에 못 가져갔고,
solarfeed 의 «다 만들었나» (지은 수 + 망 재고) 는 망 재고 0 으로 봐 판 · 축전지를 계속 만들었다.
→ 로보포트 하나 (-25,-8) 로 상자를 망에 넣는다 (bravo 손제작 → 저장 상자 → 로봇이 유령을 지음). Lua 아이템 이동 0.

    python scripts/sunnet24.py measure                    전기망 1분 · 10분 · 1시간 (소비자별 · 발전기별) · 축전 · 연료 · 판 재고
    python scripts/sunnet24.py roboport --who bravo       bravo: 피어싱 → 저장 상자, 철 90 · 고급회로 45 → 손제작 로보포트 → 저장 상자, 유령 (-25,-8)
    python scripts/sunnet24.py cells [--make] [--panels N] [--accs N]   새 판 · 축전지 칸 찾기 (can_place manual · 망 건설 범위 · 광석 0 · 전봇대 9 안 이음)
    python scripts/sunnet24.py night [--n 60] [--every 60]   밤 창 표본 (5 s 창) - 축전 최저
    python scripts/sunnet24.py --release bravo
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
from orders import submit  # noqa: E402

OWNER = "sunnet24"
RP_SPOT = (-25, -8)                 # 물류 25 → 상자 셋 · 망 로보포트 (-38,14) · (8,-10) 과 겹침
STORE = (61.5, -14.5)               # 망 저장 상자 (빈 칸 48)
ADV_SRC = (25.5, -9.5)              # 공급 상자 고급회로 3,654
IRON_SRC = (75.5, -38.5)            # 공급 상자 철 1,000
RP_STORE = (12.5, -9.5)             # 로보포트 넣을 저장 상자 (유령 곁)

MEASURE_LUA = r"""(function()
 local s, f = game.surfaces[1], game.forces.player
 local pole = s.find_entities_filtered{name = 'small-electric-pole', position = {-10.5, -12.5}, radius = 0.6}[1]
 local st = pole.electric_network_statistics
 local out = {tick = game.tick, daytime = s.daytime}
 for pn, P in pairs({s5 = defines.flow_precision_index.five_seconds, m1 = defines.flow_precision_index.one_minute, m10 = defines.flow_precision_index.ten_minutes, h1 = defines.flow_precision_index.one_hour}) do
  local i, o, ti, to = {}, {}, 0, 0
  for name, _ in pairs(st.input_counts) do local v = st.get_flow_count{name = name, category = 'input', precision_index = P, count = false} * 60 / 1e6; ti = ti + v; if v > 0.05 then i[name] = math.floor(v * 100) / 100 end end
  for name, _ in pairs(st.output_counts) do local v = st.get_flow_count{name = name, category = 'output', precision_index = P, count = false} * 60 / 1e6; to = to + v; o[name] = math.floor(v * 100) / 100 end
  out[pn] = {use = math.floor(ti * 100) / 100, gen = math.floor(to * 100) / 100, i = i, o = o}
 end
 local id = pole.electric_network_id
 local c = {}
 for _, n in pairs({'steam-engine', 'boiler', 'solar-panel', 'accumulator', 'laser-turret', 'roboport'}) do c[n] = s.count_entities_filtered{name = n, force = f} end
 out.count = c
 out.ghost = {panel = s.count_entities_filtered{ghost_name = 'solar-panel', force = f}, acc = s.count_entities_filtered{ghost_name = 'accumulator', force = f}, mp = s.count_entities_filtered{ghost_name = 'medium-electric-pole', force = f}}
 local e, m = 0, 0
 for _, a in pairs(s.find_entities_filtered{name = 'accumulator', force = f}) do if a.electric_network_id == id then e = e + a.energy; m = m + a.electric_buffer_size end end
 out.acc_mj = {math.floor(e / 1e6), math.floor(m / 1e6)}
 local bst = {}
 local sn = {} for k, v in pairs(defines.entity_status) do sn[v] = k end
 for _, b in pairs(s.find_entities_filtered{name = 'boiler', force = f}) do local k = sn[b.status] or '?'; bst[k] = (bst[k] or 0) + 1 end
 out.boilers = bst
 local ps = f.get_item_production_statistics(s)
 local T = defines.flow_precision_index.ten_minutes
 local function pr(n) return {math.floor(ps.get_flow_count{name = n, category = 'input', precision_index = T, count = true}), math.floor(ps.get_flow_count{name = n, category = 'output', precision_index = T, count = true})} end
 out.p10 = {coal = pr('coal'), sf = pr('solid-fuel'), panel = pr('solar-panel'), acc = pr('accumulator'), iron = pr('iron-plate'), cu = pr('copper-plate'), steel = pr('steel-plate'), green = pr('electronic-circuit'), pierce = pr('piercing-rounds-magazine')}
 local net = s.find_logistic_networks_by_construction_area({8, -10}, f)[1]
 out.net = {panel = net.get_item_count('solar-panel'), acc = net.get_item_count('accumulator'), mp = net.get_item_count('medium-electric-pole'), coal = net.get_item_count('coal'), sf = net.get_item_count('solid-fuel'), iron = net.get_item_count('iron-plate'), laser = net.get_item_count('laser-turret')}
 local ch = {}
 for _, p in pairs({{-30.5, -22.5}, {-37.5, -15.5}, {-42.5, -16.5}}) do
   local b = s.find_entities_filtered{name = 'passive-provider-chest', position = p, radius = 0.4}[1]
   ch[#ch + 1] = b and {b.get_item_count('solar-panel'), b.get_item_count('accumulator'), b.logistic_network and b.logistic_network.network_id or 0} or 'none'
 end
 out.sun_chests = ch
 return out
end)()"""

# 칸 찾기. 판 칸 = 중형 전봇대 (px+.5, py+.5) + 판 (px-1.5 | px+2.5, py-1.5 | py+1.5 | py+4.5) (solar24 와 같은 꼴, 7 × 9)
# 축전지 칸 = 전봇대 + 축전지 열 px-3,-1,+2,+4 · 줄 py-3,-1,+1,+3 (9 × 8). 모든 건물 can_place manual · 광석 0 · 유령 0 · 망 9 건설 범위.
CELLS_LUA = r"""(function()
 local s, f = game.surfaces[1], game.forces.player
 local A = helpers.json_to_table('%s')
 local M = defines.build_check_type.manual
 local function ok(n, x, y)
   if #s.find_logistic_networks_by_construction_area({x, y}, f) == 0 then return false end
   return s.can_place_entity{name = n, position = {x, y}, force = f, build_check_type = M}
 end
 local function clear(x0, y0, x1, y1)
   local a = {{x0, y0}, {x1, y1}}
   return s.count_entities_filtered{area = a, type = 'resource'} == 0 and s.count_entities_filtered{area = a, name = 'entity-ghost'} == 0
     and s.count_entities_filtered{area = {{x0 - 6, y0 - 6}, {x1 + 6, y1 + 6}}, force = 'enemy'} == 0
 end
 local out = {panel = {}, acc = {}}
 for px = A.x0, A.x1, 7 do for py = A.y0, A.y1, 9 do
   if clear(px - 3, py - 3, px + 4, py + 6) and ok('medium-electric-pole', px + 0.5, py + 0.5) then
     local good = true
     for _, cy in pairs({py - 1.5, py + 1.5, py + 4.5}) do
       if good and not (ok('solar-panel', px - 1.5, cy) and ok('solar-panel', px + 2.5, cy)) then good = false end
     end
     if good then out.panel[#out.panel + 1] = {px, py} end
   end
 end end
 for px = A.x0, A.x1, 9 do for py = A.y0, A.y1, A.sy do
   if clear(px - 4, py - A.h, px + 5, py + A.h) and ok('medium-electric-pole', px + 0.5, py + 0.5) then
     local good = true
     for _, dx in pairs({-3, -1, 2, 4}) do for _, dy in pairs(A.dys) do
       if good and not ok('accumulator', px + dx, py + dy) then good = false end
     end end
     if good then out.acc[#out.acc + 1] = {px, py} end
   end
 end end
 local id = s.find_entities_filtered{name = 'small-electric-pole', position = {-10.5, -12.5}, radius = 0.6}[1].electric_network_id
 local poles = {}
 for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', force = f, area = {{A.x0 - 10, A.y0 - 10}, {A.x1 + 10, A.y1 + 10}}}) do
   if p.electric_network_id == id then poles[#poles + 1] = {p.position.x, p.position.y, p.prototype.get_max_wire_distance()} end
 end
 for _, g in pairs(s.find_entities_filtered{ghost_type = 'electric-pole', force = f}) do poles[#poles + 1] = {g.position.x, g.position.y, g.ghost_prototype.get_max_wire_distance()} end
 out.poles = poles
 return out
end)()"""


# 안쪽만 (벽 · 포탑 둘레 밖 제외): 서 x -130 · 북 y -100 (x -40..60) · 동 x 130 · 남 y 50 (17:4x 포탑 지도). NE (x ≥ 75, y < -45) 는 철 (80,-80) 포탑 곁이라 뺌.
def inside(px, py):
    if not (-112 <= px <= 100 and -90 <= py <= 40):
        return False
    return not (px >= 75 and py < -45)


def connect(cells, poles, pos_of):
    """중형 전봇대 (선 9) 가 망 전봇대 (선 = 짧은 쪽) 에 BFS 로 닿는 칸만."""
    net = [(x, y, r) for x, y, r in poles]
    todo = {c: pos_of(c) for c in cells}
    ok = []
    grew = True
    while grew:
        grew = False
        for c, (x, y) in list(todo.items()):
            if any((x - a) ** 2 + (y - b) ** 2 <= min(9, r) ** 2 for a, b, r in net):
                ok.append(c)
                net.append((x, y, 9))
                del todo[c]
                grew = True
    return ok, list(todo)


def measure(ai):
    return ai.lua(MEASURE_LUA)


def roboport_plan(ai, who):
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    plan = [("walk_to", {"x": IRON_SRC[0], "y": IRON_SRC[1] + 1.5}),
            ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": max(0, 90 - bag.get("iron-plate", 0))})]
    if bag.get("piercing-rounds-magazine", 0):
        plan += [("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
                 ("insert", {"name": "piercing-rounds-magazine", "x": STORE[0], "y": STORE[1], "count": bag["piercing-rounds-magazine"]})]
    plan += [("walk_to", {"x": ADV_SRC[0], "y": ADV_SRC[1] + 1.5}),
             ("take", {"name": "advanced-circuit", "x": ADV_SRC[0], "y": ADV_SRC[1], "count": 45})]
    if bag.get("steel-plate", 0) < 45:
        plan += [("take", {"name": "steel-plate", "x": ADV_SRC[0], "y": ADV_SRC[1], "count": 45})]
    plan += [("craft", {"recipe": "iron-gear-wheel", "count": 45, "wait": "block"}),
             ("craft", {"recipe": "roboport", "count": 1, "wait": "block"}),
             ("walk_to", {"x": RP_STORE[0], "y": RP_STORE[1] + 1.5}),
             ("insert", {"name": "roboport", "x": RP_STORE[0], "y": RP_STORE[1], "count": 1})]
    return [p for p in plan if not (p[0] == "take" and p[1].get("count", 1) <= 0)]


def poles_plan(ai, who, n):
    """중형 전봇대 n = 강철 2n · 쇠막대 4n (철 2n) · 전선 2n (구리 n). solar24 S · S2 (쇠막대) 가 망 철 KEEP 1500 에 막혀 손으로."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    plan = []
    if bag.get("iron-plate", 0) < 2 * n:
        plan += [("walk_to", {"x": IRON_SRC[0], "y": IRON_SRC[1] + 1.5}),
                 ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": 2 * n - bag.get("iron-plate", 0)})]
    if bag.get("steel-plate", 0) < 2 * n:
        plan += [("walk_to", {"x": RP_STORE[0], "y": RP_STORE[1] + 1.5})]   # 강철은 bravo 가방 (115) - 모자라면 멈춤
    plan += [("craft", {"recipe": "iron-stick", "count": 2 * n, "wait": "block"}),
             ("craft", {"recipe": "copper-cable", "count": n, "wait": "block"}),
             ("craft", {"recipe": "medium-electric-pole", "count": n, "wait": "block"}),
             ("walk_to", {"x": RP_STORE[0], "y": RP_STORE[1] + 1.5}),
             ("insert", {"name": "medium-electric-pole", "x": RP_STORE[0], "y": RP_STORE[1], "count": n})]
    return plan


RP_GHOST_LUA = r"""(function() local s, f = game.surfaces[1], game.forces.player
 local pos = {%s, %s}
 if s.count_entities_filtered{name = 'roboport', position = pos, radius = 0.6} + s.count_entities_filtered{ghost_name = 'roboport', position = pos, radius = 0.6} > 0 then return {skip = true} end
 if not s.can_place_entity{name = 'roboport', position = pos, force = f, build_check_type = defines.build_check_type.manual} then return {blocked = true} end
 local g = s.create_entity{name = 'entity-ghost', inner_name = 'roboport', position = pos, force = f}
 return {placed = g ~= nil} end)()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", nargs="?")
    ap.add_argument("--who", default="bravo")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--release", nargs="*")
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--every", type=int, default=60)
    ap.add_argument("--area", default="-160,-140,160,80")
    ap.add_argument("--kind", default="panel")
    ap.add_argument("--max", type=int, default=40)
    ap.add_argument("--make", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    os.environ[detached.ENV] = OWNER
    if a.release:
        detached.release(a.release)
        print("released", a.release)
    if a.step == "measure":
        print(json.dumps(measure(ai), ensure_ascii=False))
    elif a.step == "roboport":
        o = detached.owner(a.who)
        if o not in (None, OWNER):
            print(a.who, "owned by", o)
            return 1
        plan = roboport_plan(ai, a.who)
        for p in plan:
            print("  ", p)
        if a.dry:
            return 0
        print("ghost", ai.lua(RP_GHOST_LUA % RP_SPOT))
        detached.mark([a.who], OWNER, minutes=30)
        print(submit(ai, a.who, plan, strict=False))
    elif a.step == "poles":
        o = detached.owner(a.who)
        if o not in (None, OWNER):
            print(a.who, "owned by", o)
            return 1
        plan = poles_plan(ai, a.who, a.n)
        for p in plan:
            print("  ", p)
        if not a.dry:
            detached.mark([a.who], OWNER, minutes=20)
            print(submit(ai, a.who, plan, strict=False))
    elif a.step == "plan":
        from solar24 import GHOSTS_LUA
        x0, y0, x1, y1 = map(int, a.area.split(","))
        dys = [-1, 1] if a.kind == "acc8" else [-3, -1, 1, 3]
        r = ai.lua(CELLS_LUA % json.dumps({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "dys": dys, "h": 2 if a.kind == "acc8" else 4, "sy": 4 if a.kind == "acc8" else 8}))
        poles = [tuple(p) for p in r["poles"]]
        if a.kind == "panel":
            cells = [tuple(c) for c in r["panel"] if inside(*c)][: a.max]
            ok, bad = connect(cells, poles, lambda c: (c[0] + 0.5, c[1] + 0.5))
        else:
            cells = [tuple(c) for c in r["acc"] if inside(*c)][: a.max]
            ok, bad = connect(cells, poles, lambda c: (c[0] + 0.5, c[1] + 0.5))
            ents = [("accumulator", px + dx, py + dy) for px, py in ok for dx in (-3, -1, 2, 4) for dy in (-3, -1, 1, 3)]
        # 끊긴 무리: 가장 가까운 망 전봇대 ≤ 17 이면 사이 전봇대 하나 (둘 다에 9 / 망 쪽 선 안, can_place manual)
        links = []
        if a.kind == "panel":
            foot = [(px + dx, py + k * 3 - 1.5, 2.0) for px, py in cells for dx in (-1.5, 2.5) for k in range(3)] + [(px + 0.5, py + 0.5, 1.0) for px, py in cells]
        else:
            foot = [(px + dx, py + dy, 1.5) for px, py in cells for dx in (-3, -1, 2, 4) for dy in dys] + [(px + 0.5, py + 0.5, 1.0) for px, py in cells]
        for _ in range(4):
            if not bad:
                break
            cand = []
            for c in bad:
                x, y = c[0] + 0.5, c[1] + 0.5
                for bx, by, br in poles:
                    d2 = (x - bx) ** 2 + (y - by) ** 2
                    if d2 <= (9 + min(9, br)) ** 2:
                        for t in (0.5, 0.4, 0.6, 0.3, 0.7):
                            mx, my = round(x + (bx - x) * t) + 0.5, round(y + (by - y) * t) + 0.5
                            for ox, oy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                                qx, qy = mx + ox, my + oy
                                if (qx - x) ** 2 + (qy - y) ** 2 <= 81 and (qx - bx) ** 2 + (qy - by) ** 2 <= min(9, br) ** 2                                         and not any(abs(qx - fx) < h and abs(qy - fy) < h for fx, fy, h in foot):
                                    cand.append((qx, qy))
            q = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
              for _, p in pairs(helpers.json_to_table('%s')) do
                if s.can_place_entity{name = 'medium-electric-pole', position = p, force = f, build_check_type = defines.build_check_type.manual}
                   and s.count_entities_filtered{ghost_name = 'medium-electric-pole', position = p, radius = 0.6} == 0 then return {p = p} end
              end return {} end)()""" % json.dumps(cand[:400]))
            if not q.get("p"):
                break
            lp = (float(q["p"][0]), float(q["p"][1]))
            links.append(lp)
            poles.append((lp[0], lp[1], 9))
            more, bad = connect(bad, poles, lambda c: (c[0] + 0.5, c[1] + 0.5))
            ok += more
            for c in more:
                poles.append((c[0] + 0.5, c[1] + 0.5, 9))
        if a.kind == "panel":
            ents = []
            for px, py in ok:
                for cy in (py - 1.5, py + 1.5, py + 4.5):
                    ents += [("solar-panel", px - 1.5, cy), ("solar-panel", px + 2.5, cy)]
        else:
            ents = [("accumulator", px + dx, py + dy) for px, py in ok for dx in (-3, -1, 2, 4) for dy in dys]
        mps = [("medium-electric-pole", px + 0.5, py + 0.5) for px, py in ok] + [("medium-electric-pole", x, y) for x, y in links]
        print("links", links)
        print(a.kind, "cells", len(ok), ok, "unlinked", bad)
        if a.make:
            print("poles", ai.lua(GHOSTS_LUA % (json.dumps(mps), 999)))
            print("ents", ai.lua(GHOSTS_LUA % (json.dumps(ents), 9999)))
    elif a.step == "cells":
        x0, y0, x1, y1 = map(int, a.area.split(","))
        r = ai.lua(CELLS_LUA % json.dumps({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "dys": [-3, -1, 1, 3], "h": 4, "sy": 8}))
        print(json.dumps({k: (v if k != "poles" else len(v)) for k, v in r.items()}))
    elif a.step == "night":
        low = None
        for k in range(a.n):
            m = measure(ai)
            e = m["acc_mj"][0]
            low = e if low is None else min(low, e)
            print(time.strftime("%H:%M:%S"), round(m["daytime"], 3), "use", m["s5"]["use"], "gen", m["s5"]["o"], "acc", m["acc_mj"], "low", low, flush=True)
            time.sleep(a.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

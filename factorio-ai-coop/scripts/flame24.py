"""run24 화염 포탑 - NW 무리 (-36..-28, -129..-117) 에 원유 관 (2026-09-30 15:3x).

사용자 (코디네이터): 화염 · 레이저 포탑을 들여라. 화염은 관으로 기름이 닿는 곳 먼저 - NW 무리.
실측: 화염 포탑 = 강철 30 · 톱니 15 · 관 10 · 엔진 5, 사거리 30 (최소 6), 연료 원유 1.0 · 경유 1.05 · 경유(light) 1.1.
  2x3, 북향이면 뒷줄 양옆 (x ∓ 1.5, y + 1) 이 관 입구. 지하관 = 최대 10 칸, 방향 = 여는 쪽.
원유는 정유 옆 관 x -94.5 (y 9.5..22.5) 가 가장 가깝다 (NW 까지 ~140 칸) - 가는 길은 이 스크립트가 찾는다 (BFS):
  동작 ① 지하관 한 쌍 (입구 → 1..10 칸 → 출구, 두 칸 다 빈 칸, 사이에 남의 지하관 없음) ② 관 한 칸 (돌기 - 옆에 남의 유체 건물 없음).

    python scripts/flame24.py route nw|south   길 찾기 (유령 안 놓음) → state/run24_flame_<자리>.json
    python scripts/flame24.py ghosts nw|south  길 + 포탑 유령
    python scripts/flame24.py kit | kit2      ① 관 · 지하관 · 엔진 조립기 먹이  ② 엔진 오면 포탑

Lua 아이템 이동 0 - 유령 (can_place manual) · 사람 손 (허브 상자 · 망 상자 → 손제작 → 저장 상자) · 엔진은 요청 상자 (조립기만 만듦).
"""
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402

N, E, S, W = 0, 4, 8, 12
VEC = {N: (0, -1), E: (1, 0), S: (0, 1), W: (-1, 0)}
OPP = {N: S, S: N, E: W, W: E}
# 자리 (코디네이터 15:4x: 남쪽 선 먼저 - 적 무리 남 (-150..-100, 150..200) ~70 · 큰 이빨 7, 북 (0,-300) 62).
#   box = 길 찾는 구역 (칸), turrets = (x, y) 중심, dir = 포탑 방향, tpipes = 포탑 사이 관, goal = 첫 포탑 서쪽 입구 칸.
#   포탑 간격 3 칸 (2 폭 + 관 1) - 앞 포탑 동쪽 입구와 뒤 포탑 서쪽 입구가 같은 칸.
SITES = {
    # NW 무리 - 총 포탑 (-34..-31, -126..-123) 뒤 (남쪽), 서쪽 벽 x -37 안, 북향 (뒷줄 y -120 → 입구 y -119.5)
    "nw": {"box": (-100, -126, -28, 24), "turrets": [(-34.0, -120.5), (-30.0, -120.5)], "dir": N,
           "tpipes": [(-32.5, -119.5), (-31.5, -119.5)], "goal": (-36, -120)},
    # 남쪽 선 - 벽 y 48 (x -128..-84) 안, 남향 (뒷줄 y 45 → 입구 y 45.5), 원유 줄 y 21.5 · 23.5 에서 남쪽으로
    "south": {"box": (-126, 14, -95, 47), "turrets": [(-116.0, 46.5), (-113.0, 46.5), (-110.0, 46.5)], "dir": S,
              "tpipes": [(-114.5, 45.5), (-111.5, 45.5)], "goal": (-118, 45)},
}
SITE = SITES["nw"]
WHO, OWNER = "foxtrot", "flame24"
STORE = (-76.5, -13.5)       # 16:0x (59.5,-14.5) 가 가득 (전선 6,941) - foxtrot 넣기가 실패했다. 기지 망 저장 상자 중 빈 칸이 있는 곳은 서쪽뿐

LUA_GRID = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local x0, y0, x1, y1 = %d, %d, %d, %d
  local free, fluid, ptg, crude = {}, {}, {}, {}
  for y = y0, y1 do
    local row = {}
    for x = x0, x1 do
      row[#row + 1] = s.can_place_entity{name = 'pipe', position = {x + 0.5, y + 0.5}, force = f, build_check_type = defines.build_check_type.manual} and '1' or '0'
    end
    free[#free + 1] = table.concat(row)
  end
  for _, e in pairs(s.find_entities_filtered{area = {{x0 - 1, y0 - 1}, {x1 + 2, y1 + 2}}, force = f}) do
    if e.fluidbox and #e.fluidbox > 0 then
      local b = e.bounding_box
      for y = math.floor(b.left_top.y + 0.01), math.ceil(b.right_bottom.y - 0.01) - 1 do
        for x = math.floor(b.left_top.x + 0.01), math.ceil(b.right_bottom.x - 0.01) - 1 do fluid[#fluid + 1] = x .. ',' .. y end end
      if e.type == 'pipe-to-ground' then ptg[#ptg + 1] = math.floor(e.position.x) .. ',' .. math.floor(e.position.y) end
      if e.type == 'pipe' and e.fluidbox[1] and e.fluidbox[1].name == 'crude-oil' then crude[#crude + 1] = math.floor(e.position.x) .. ',' .. math.floor(e.position.y) end
    end
  end
  for _, g in pairs(s.find_entities_filtered{area = {{x0 - 1, y0 - 1}, {x1 + 2, y1 + 2}}, type = 'entity-ghost', force = f}) do
    local b = g.bounding_box
    for y = math.floor(b.left_top.y + 0.01), math.ceil(b.right_bottom.y - 0.01) - 1 do
      for x = math.floor(b.left_top.x + 0.01), math.ceil(b.right_bottom.x - 0.01) - 1 do fluid[#fluid + 1] = x .. ',' .. y end end
  end
  return {free = free, fluid = fluid, ptg = ptg, crude = crude}
end)()"""


def _list(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def grid(ai):
    x0, y0, x1, y1 = SITE["box"]
    r = ai.lua(LUA_GRID % (x0, y0, x1, y1))
    free = set()
    for j, row in enumerate(_list(r["free"])):
        for i, c in enumerate(row):
            if c == "1":
                free.add((x0 + i, y0 + j))
    fluid = {tuple(int(v) for v in k.split(",")) for k in _list(r.get("fluid"))}
    ptg = {tuple(int(v) for v in k.split(",")) for k in _list(r.get("ptg"))}
    crude = {tuple(int(v) for v in k.split(",")) for k in _list(r.get("crude"))}
    # 포탑 · 포탑 사이 관 자리는 우리 것 - 길이 밟지 않게
    import math
    for tx, ty in SITE["turrets"]:
        for dx in (-1, 0):
            for dy in (-1, 0, 1):
                free.discard((int(tx) + dx, math.floor(ty) + dy))
    for px, py in SITE["tpipes"]:
        free.discard((math.floor(px), math.floor(py)))
    return free, fluid, ptg, crude


def route(ai):
    free, fluid, ptg, crude = grid(ai)
    GOAL = SITE["goal"]
    free.add(GOAL)

    def clean_pipe(t, came):
        # 관은 네 쪽 다 이음 - 들어온 쪽 말고는 남의 유체 건물이 붙으면 안 된다 (원유 줄 옆 첫 칸은 그 줄에 붙어야 하니 came 이 원유)
        for d, (dx, dy) in VEC.items():
            n = (t[0] + dx, t[1] + dy)
            if d == came:
                continue
            if n in fluid:
                return False
        return True

    start = []
    for cx, cy in crude:
        for d in (W, E, N, S):
            dx, dy = VEC[d]
            t = (cx + dx, cy + dy)
            if t in free:
                start.append((t, d))
    # 상태 = (다음 건물 놓을 칸, 진행 방향, 앞 건물이 관인가), 값 = 건물 목록
    q = collections.deque()
    seen = {}
    for t, d in start:
        q.append((t, d, []))
    best = None
    while q:
        t, d, path = q.popleft()
        key = (t, d)
        if key in seen and seen[key] <= len(path):
            continue
        seen[key] = len(path)
        if best and len(path) >= len(best):
            continue
        if t == GOAL:
            best = path + [("pipe", t, N)]
            continue
        dx, dy = VEC[d]
        # ① 지하관 한 쌍: 입구 t (여는 쪽 = 뒤), 출구 t + k (여는 쪽 = 앞)
        if t in free and t not in fluid:
            for k in range(10, 0, -1):
                u = (t[0] + dx * k, t[1] + dy * k)
                if u not in free:
                    continue
                if any((t[0] + dx * i, t[1] + dy * i) in ptg for i in range(1, k)):
                    continue
                nxt = (u[0] + dx, u[1] + dy)
                q.append((nxt, d, path + [("pipe-to-ground", t, OPP[d]), ("pipe-to-ground", u, d)]))
        # ② 관 한 칸 - 곧게 또는 꺾기
        if t in free and clean_pipe(t, OPP[d]):
            for nd in (d, {N: E, E: S, S: W, W: N}[d], {N: W, W: S, S: E, E: N}[d]):
                ndx, ndy = VEC[nd]
                q.append(((t[0] + ndx, t[1] + ndy), nd, path + [("pipe", t, N)]))
    return best


def to_ghost_rows(path):
    rows = [[n, t[0] + 0.5, t[1] + 0.5, d, ""] for n, t, d in path]
    rows += [["flamethrower-turret", x, y, SITE["dir"], ""] for x, y in SITE["turrets"]]
    rows += [["pipe", x, y, N, ""] for x, y in SITE["tpipes"]]
    return rows


def main():
    global SITE
    step = sys.argv[1] if len(sys.argv) > 1 else "route"
    site = sys.argv[2] if len(sys.argv) > 2 else "nw"
    SITE = SITES[site]
    ai = AIBridge()
    if step in ("route", "ghosts"):
        path = route(ai)
        if not path:
            print(json.dumps({"route": None}))
            return
        cnt = collections.Counter(n for n, *_ in path)
        rows = to_ghost_rows(path)
        out = {"entities": dict(cnt), "first": path[:3], "last": path[-3:]}
        state = os.path.join(HERE, "..", "state", f"run24_flame_{site}.json")
        json.dump(rows, open(state, "w", encoding="utf-8"))
        if step == "ghosts":
            from ammoplus24 import LUA_PLACE
            out["place"] = ai.lua(LUA_PLACE % ("true", json.dumps(rows)))
        print(json.dumps(out, ensure_ascii=False))
    elif step == "kit":
        print(json.dumps(kit(ai, engines=int(sys.argv[4]) if len(sys.argv) > 4 else 30, who=sys.argv[3] if len(sys.argv) > 3 else None), ensure_ascii=False))
    elif step == "kit2":
        print(json.dumps(kit2(ai, who=sys.argv[3] if len(sys.argv) > 3 else None), ensure_ascii=False))


ENGINE_ASM = (10.5, 8.5)      # 엔진 조립기 2 - 결과 팔 → 공급 상자 (10.5,5.5) = 망. 관이 없어 섰다 (10분 엔진 0)
ENGINE_RQ = (96.5, -0.5)      # 레이저 요청 상자에 엔진 칸 (화염 포탑 몫) - 망에 나온 엔진을 먼저 잡는다


def _miss(ai):
    rows = []
    for site in SITES:
        path = os.path.join(HERE, "..", "state", f"run24_flame_{site}.json")
        if os.path.exists(path):
            rows += json.load(open(path, encoding="utf-8"))
    have = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player local o = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3} > 0 then o[q[1]] = (o[q[1]] or 0) + 1 end end
      return o end)()""" % json.dumps([[n, x, y] for n, x, y, *_ in rows]))
    want = collections.Counter(n for n, *_ in rows)
    return {k: max(0, v - int(have.get(k, 0))) for k, v in want.items()}


def kit(ai, engines=30, who=None):
    """foxtrot ①: 허브 철 → 관 · 톱니 손제작 → 엔진 조립기 (10.5,8.5) 에 손으로 (관 2 · 톱니 1 · 강철 1 → 엔진) ·
    지하관 · 관 · 포탑 몫 톱니 · 관 손제작 → 지하관 · 관은 저장 상자 (포탑은 엔진이 오면 kit2)."""
    import p7_24
    from orders import submit
    miss = _miss(ai)
    ptg, pipe, ft = miss.get("pipe-to-ground", 0), miss.get("pipe", 0), miss.get("flamethrower-turret", 0)
    ptg_craft = (ptg + 1) // 2
    pipes = 2 * engines + pipe + 10 * ptg_craft + 10 * ft
    gears = engines + 15 * ft
    iron = pipes + 2 * gears + 5 * ptg_craft + 6
    who = who or WHO
    detached.mark([who], OWNER, minutes=40)
    plan = p7_24.take_plan(ai, {"iron-plate": iron, "steel-plate": engines + 30 * ft + 2}, {"iron-plate": 800, "steel-plate": 500})
    plan += [("craft", {"recipe": "pipe", "count": pipes, "wait": "block"}),
             ("craft", {"recipe": "iron-gear-wheel", "count": gears, "wait": "block"})]
    if engines:
        plan += [("walk_to", {"x": ENGINE_ASM[0] + 2.5, "y": ENGINE_ASM[1]}),
                 ("insert", {"name": "pipe", "x": ENGINE_ASM[0], "y": ENGINE_ASM[1], "count": 2 * engines}),
                 ("insert", {"name": "iron-gear-wheel", "x": ENGINE_ASM[0], "y": ENGINE_ASM[1], "count": engines}),
                 ("insert", {"name": "steel-plate", "x": ENGINE_ASM[0], "y": ENGINE_ASM[1], "count": engines})]
    if ptg_craft:
        plan.append(("craft", {"recipe": "pipe-to-ground", "count": ptg_craft, "wait": "block"}))
    plan.append(("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}))
    for n, q in (("pipe-to-ground", ptg), ("pipe", pipe)):
        if q:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    submit(ai, who, plan, strict=False)
    return {"who": who, "miss": miss, "iron": iron, "pipes": pipes, "gears": gears, "steps": len(plan)}


def kit2(ai, who=None):
    """② 요청 상자 (96.5,-0.5) 엔진 → 화염 포탑 손제작 (톱니 · 관 · 강철은 ① 에서 든 것, 모자라면 허브) → 저장 상자."""
    import p7_24
    from orders import submit
    who = who or WHO
    ft = _miss(ai).get("flamethrower-turret", 0)
    eng = int(ai.lua("""(function() local e = game.surfaces[1].find_entities_filtered{name = 'requester-chest', position = {%f, %f}, radius = 0.3}[1]
      return {n = e.get_inventory(defines.inventory.chest).get_item_count('engine-unit')} end)()""" % ENGINE_RQ).get("n", 0))
    k = min(ft, eng // 5)
    if not k:
        return {"ft": ft, "engines": eng}
    detached.mark([who], OWNER, minutes=20)
    me = [b for b in ai.list() if b["name"] == who][0]
    inv = ai.lua("""(function() local o = {} local b = game.surfaces[1].find_entities_filtered{type = 'character', position = {%f, %f}, radius = 1}[1]
        if b then local i = b.get_main_inventory() for _, k in pairs({'iron-gear-wheel', 'pipe', 'steel-plate'}) do o[k] = i.get_item_count(k) end end
        return o end)()""" % (me["x"], me["y"]))
    need = {"iron-plate": max(0, 15 * k - int(inv.get("iron-gear-wheel", 0))) * 2 + max(0, 10 * k - int(inv.get("pipe", 0))),
            "steel-plate": max(0, 30 * k - int(inv.get("steel-plate", 0)))}
    plan = p7_24.take_plan(ai, {m: v for m, v in need.items() if v > 0}, {"iron-plate": 800, "steel-plate": 500})
    plan += [("walk_to", {"x": ENGINE_RQ[0], "y": ENGINE_RQ[1] + 1.5}),
            ("take", {"name": "engine-unit", "x": ENGINE_RQ[0], "y": ENGINE_RQ[1], "count": 5 * k}),
            ("craft", {"recipe": "flamethrower-turret", "count": k, "wait": "block"}),
            ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
            ("insert", {"name": "flamethrower-turret", "x": STORE[0], "y": STORE[1], "count": k})]
    submit(ai, who, plan, strict=False)
    return {"who": who, "ft": ft, "engines": eng, "craft": k}




if __name__ == "__main__":
    main()

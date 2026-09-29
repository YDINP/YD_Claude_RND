"""Run 24: 서쪽 연구소 10 대에 보라 · 노랑을 벨트로 (06:1x 과학 멈춤 긴급).

까닭: research_guard 의 멈춤 감지는 «연구소 절반 이상 missing_science_packs · 그 팩 연구소 합 < 연구소 수» 면 그 팩을 15 분 끈다.
서쪽 연구소 10 대 (윗줄 6 · 아랫줄 4) 는 빨강 · 초록 (+ 빨강 레인에 섞인 파랑) 벨트만 받아 보라 · 노랑이 영영 0 →
보라 · 노랑 연구가 켜지면 10/18 이 missing → 2 분 뒤 다시 꺼짐 (06:08 부터 연구 없음). 보라 · 노랑을 서쪽에도 보내야 풀린다.

설계 (relay 없음 · 유령은 can_place manual):
  모음 벨트 K (x 4.5 북행, 보라 동 · 노랑 서에서 넣음) 에 분배기 N (4.0,3.5) → 왼쪽 출구 (3.5,2.5) 에서 새 벨트 W 가
  길찾기 (빈 칸 · 지하 벨트 ≤ 4 칸 건너기, 기존 팔의 집는 칸 · 놓는 칸과 기존 벨트가 흘러드는 칸은 피함) 로 (-34.5,-0.5) 까지 서쪽 →
  분배기 W (-35.5,-1.0): 위 출구 (-36.5,-1.5) 벨트 끝 → 팔 (-36.5,-2.5) → 윗줄 동쪽 연구소 (-37.5,-4.5)
                        아래 출구 (-36.5,-0.5) 남 → 지하 (-36.5,0.5 → 5.5, 조립기 (-37.5,3.5) 밑) → 팔 (-36.5,6.5) → 아랫줄 동쪽 연구소 (-35.5,8.5).
  연구소 사이 팔 (동 → 서) 이 줄 전체에 나른다. 처리량: 보라 + 노랑 ≤ 0.2/s · 노랑 벨트 15/s → 1 줄.

    python scripts/westfeed24.py --run run24 --plan      # 길 찾기만 (출력)
    python scripts/westfeed24.py --run run24 --ghosts    # 유령 (K 벨트 한 칸은 해체 표시 → 빠진 뒤 다시 실행하면 분배기)
    python scripts/westfeed24.py --run run24 --status
"""
import argparse, heapq, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge  # noqa

N, E, S, W = 0, 4, 8, 12
BOX = (-37, -4, 9, 26)                      # 길찾기 네모 (타일 x1, y1, x2, y2)
START = (3, 2)                              # 분배기 왼쪽 출구 칸 (3.5,2.5) - 북행으로 들어옴
GOAL = (-35, -1)                            # (-34.5,-0.5) 을 서쪽으로 지나 분배기 W 로
K_SPLIT = ("splitter", 4.0, 3.5, N)
K_BELT = (4.5, 3.5)                         # 분배기 자리의 K 벨트 (해체 표시)
FIXED = [("splitter", -35.5, -1.0, W),
         ("transport-belt", -36.5, -1.5, W), ("inserter", -36.5, -2.5, S),          # 팔: 남쪽 (벨트) 에서 집어 북쪽 (연구소) 에
         ("transport-belt", -36.5, -0.5, S),
         ("underground-belt", -36.5, 0.5, S, "input"), ("underground-belt", -36.5, 5.5, S, "output"),
         ("inserter", -36.5, 6.5, N)]                                                 # 북쪽 (지하 출구) 에서 집어 남쪽 (연구소) 에
RESERVED = {(3, 3), (4, 3), (-36, -2), (-37, -2), (-36, -3), (-37, -3), (-37, -1), (-37, 0), (-37, 5), (-37, 6)}   # FIXED 칸 (타일 = floor)

GRID_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local x1, y1, x2, y2 = %d, %d, %d, %d
  local out = {free = {}, bad = {}}
  for y = y1, y2 do
    local row = {}
    for x = x1, x2 do
      local p = {x + 0.5, y + 0.5}
      local ok = s.can_place_entity{name = 'transport-belt', position = p, direction = 0, force = f, build_check_type = defines.build_check_type.manual}
      local any = s.count_entities_filtered{area = {{x + 0.05, y + 0.05}, {x + 0.95, y + 0.95}}} > 0
      row[#row + 1] = (ok and not any) and '.' or '#'
    end
    out.free[#out.free + 1] = table.concat(row, '')
  end
  local function mark(p) out.bad[#out.bad + 1] = math.floor(p.x) .. ',' .. math.floor(p.y) end
  for _, e in pairs(s.find_entities_filtered{type = 'inserter', area = {{x1 - 3, y1 - 3}, {x2 + 3, y2 + 3}}}) do
    mark(e.pickup_position); mark(e.drop_position)
  end
  local d = {[0] = {0, -1}, [4] = {1, 0}, [8] = {0, 1}, [12] = {-1, 0}}
  for _, e in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, area = {{x1 - 2, y1 - 2}, {x2 + 2, y2 + 2}}}) do
    local v = d[e.direction]
    if v then
      if e.type == 'splitter' then
        local q = {x = v[2] ~= 0 and 0.5 or 0, y = v[1] ~= 0 and 0.5 or 0}
        mark({x = e.position.x + v[1] + q.x, y = e.position.y + v[2] + q.y}); mark({x = e.position.x + v[1] - q.x, y = e.position.y + v[2] - q.y})
      elseif e.type ~= 'underground-belt' or e.belt_to_ground_type == 'output' then
        mark({x = e.position.x + v[1], y = e.position.y + v[2]})
      end
    end
  end
  return out
end)()"""


def listify(v):
    return list(v.values()) if isinstance(v, dict) else (v or [])


def plan(ai):
    x1, y1, x2, y2 = BOX
    g = ai.lua(GRID_LUA % BOX)
    rows = listify(g.get("free"))
    free = {(x1 + i, y1 + j) for j, row in enumerate(rows) for i, ch in enumerate(row) if ch == "."}
    bad = {tuple(int(v) for v in b.split(",")) for b in listify(g.get("bad"))}
    ok = (free - bad) - RESERVED
    ok |= {START, GOAL}
    # 상태: (칸, 들어온 방향). 걸음: 옆 칸 belt (1) 또는 같은 방향 지하 쌍 (입구 · 출구 모두 ok, 사이 1..4 칸, 비용 4)
    dirs = {N: (0, -1), E: (1, 0), S: (0, 1), W: (-1, 0)}
    start = (START, N, False)                   # (칸, 방향, 지하 출구인가 - 출구 칸은 다시 입구가 될 수 없다)
    dist, prev = {start: 0}, {}
    pq = [(0, start)]
    end = None
    while pq:
        c, st = heapq.heappop(pq)
        if c > dist.get(st, 1e9):
            continue
        (x, y), d, uo = st
        if (x, y) == GOAL and d == W:
            end = st
            break
        for nd, (dx, dy) in dirs.items():
            if (nd - d) % 16 == 8:                  # 되돌아가기 없음
                continue
            nxt = ((x + dx, y + dy), nd, False)
            if nxt[0] in ok and not (uo and nd != d):
                nc = c + 1 + (0.3 if nd != d else 0)
                if nc < dist.get(nxt, 1e9):
                    dist[nxt], prev[nxt] = nc, (st, "belt")
                    heapq.heappush(pq, (nc, nxt))
            # 지하: 지금 칸을 입구로 (방향 nd = d 일 때만 - 입구는 뒤에서 받아야 한다)
            if nd == d and (x, y) != START and not uo:
                for gap in range(1, 5):
                    ex = (x + dx * (gap + 1), y + dy * (gap + 1))
                    if ex in ok:
                        nxt = (ex, nd, True)
                        nc = c + 4 + gap * 0.1
                        if nc < dist.get(nxt, 1e9):
                            dist[nxt], prev[nxt] = nc, (st, "ug")
                            heapq.heappush(pq, (nc, nxt))
    if not end:
        return None
    # 되짚기 → 칸마다 (종류, 방향)
    seq = []
    st = end
    while st != start:
        p, how = prev[st]
        seq.append((st, how))
        st = p
    seq.reverse()
    cells = [(START, N, "belt")]
    for (pos, d, _u), how in seq:
        if how == "ug":
            cells[-1] = (cells[-1][0], d, "ug_in")
            cells.append((pos, d, "ug_out"))
        else:
            # 앞 칸의 방향은 «나가는 방향» 이어야 한다
            if cells[-1][2] == "belt":
                cells[-1] = (cells[-1][0], d, "belt")
            elif cells[-1][2] == "ug_out" and cells[-1][1] != d:
                return {"error": "지하 출구 뒤 꺾임", "at": pos}
            cells.append((pos, d, "belt"))
    out = []
    for (x, y), d, k in cells:
        if k == "belt":
            out.append(("transport-belt", x + 0.5, y + 0.5, d))
        else:
            out.append(("underground-belt", x + 0.5, y + 0.5, d, "input" if k == "ug_in" else "output"))
    return {"cells": out, "len": len(out), "ug": sum(1 for c in out if c[0] == "underground-belt") // 2}


PLACE_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {placed = 0, have = 0, blocked = {}, nonet = 0}
  for _, q in pairs(helpers.json_to_table('%s')) do
    local p = {q[2], q[3]}
    if #s.find_logistic_networks_by_construction_area(p, f) == 0 then out.nonet = out.nonet + 1
    elseif s.count_entities_filtered{name = q[1], force = f, position = p, radius = 0.3} > 0
        or s.count_entities_filtered{ghost_name = q[1], force = f, position = p, radius = 0.3} > 0 then out.have = out.have + 1
    else
      local a = {name = q[1], position = p, direction = q[4], force = f, build_check_type = defines.build_check_type.manual}
      if q[5] then a.type = q[5] end
      if s.can_place_entity(a) then
        local g = {name = 'entity-ghost', inner_name = q[1], position = p, direction = q[4], force = f}
        if q[5] then g.type = q[5] end
        s.create_entity(g)
        out.placed = out.placed + 1
      else out.blocked[#out.blocked + 1] = q[1] .. ' ' .. q[2] .. ',' .. q[3] end
    end
  end
  return out
end)()"""


def ghosts(ai, cells):
    r = {}
    r["path"] = ai.lua(PLACE_LUA % json.dumps(cells + FIXED))
    # K 분배기: 자리의 K 벨트를 해체 표시 (로봇이 걷음) → 빈 뒤 유령
    r["k"] = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      if s.count_entities_filtered{name = 'splitter', force = f, position = {%f, %f}, radius = 0.3} > 0 then return {k = 'splitter'} end
      if s.count_entities_filtered{ghost_name = 'splitter', force = f, position = {%f, %f}, radius = 0.3} > 0 then return {k = 'ghost'} end
      local b = s.find_entities_filtered{name = 'transport-belt', force = f, position = {%f, %f}, radius = 0.3}[1]
      if b then if not b.to_be_deconstructed() then b.order_deconstruction(f) end return {k = 'decon'} end
      local a = {name = 'splitter', position = {%f, %f}, direction = %d, force = f, build_check_type = defines.build_check_type.manual}
      if s.can_place_entity(a) then
        s.create_entity{name = 'entity-ghost', inner_name = 'splitter', position = {%f, %f}, direction = %d, force = f}
        return {k = 'placed'}
      end
      return {k = 'blocked'}
    end)()""" % (K_SPLIT[1], K_SPLIT[2], K_SPLIT[1], K_SPLIT[2], K_BELT[0], K_BELT[1], K_SPLIT[1], K_SPLIT[2], K_SPLIT[3], K_SPLIT[1], K_SPLIT[2], K_SPLIT[3]))
    return r


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {labs = {}}
      for _, l in pairs(s.find_entities_filtered{type = 'lab', force = f, area = {{-60, -8}, {-30, 12}}}) do
        local c = {} for _, it in pairs(l.get_inventory(defines.inventory.lab_input).get_contents()) do c[#c + 1] = it.name:sub(1, 4) .. it.count end
        out.labs[#out.labs + 1] = string.format('%%.1f,%%.1f %%s %%s', l.position.x, l.position.y, st[l.status] or '', table.concat(c, ' '))
      end
      out.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = f, area = {{-38, -4}, {9, 26}}}
      return out
    end)()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--ghosts", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--kit", default="", help="손제작할 사람")
    a = ap.parse_args()
    ai = AIBridge()
    if a.kit:
        print(kit(ai, a.kit))
        return 0
    if a.status:
        print(json.dumps(status(ai), ensure_ascii=False, indent=1))
        return 0
    p = plan(ai)
    if (not p or "error" in p) and a.ghosts:                 # 길이 이미 지어졌으면 (빈 칸 없음) K 분배기만
        print("길 없음 (지어짐?) - K 분배기만", json.dumps(ghosts(ai, [])["k"], ensure_ascii=False))
        return 0
    if not p or "error" in p:
        print("길 없음", p)
        return 1
    print("길", p["len"], "칸 · 지하 쌍", p["ug"])
    for c in p["cells"]:
        print("  ", c)
    if a.ghosts:
        print(json.dumps(ghosts(ai, p["cells"]), ensure_ascii=False))
    return 0


def kit(ai, who):
    """건물 (벨트 · 지하 · 분배기 · 팔) 을 사람이 허브 판으로 손제작해 망 저장 상자 (p7 STORE) 에 - 로봇이 유령을 짓는다."""
    import detached, p7_24
    from orders import submit
    os.environ[detached.ENV] = "westfeed"
    detached.mark([who], "westfeed", minutes=15)
    plan = p7_24.take_plan(ai, {"iron-plate": 200, "copper-plate": 30}, {"iron-plate": 600, "copper-plate": 300})
    items = [("underground-belt", 6, 12), ("splitter", 2, 2), ("inserter", 2, 2), ("transport-belt", 10, 20)]   # (레시피, 번, 개)
    for r, n, _ in items:
        plan.append(("craft", {"recipe": r, "count": n, "wait": "block"}))
    sx, sy = p7_24.STORE
    plan.append(("walk_to", {"x": sx, "y": sy + 1.5}))
    for r, _, k in items:
        plan.append(("insert", {"name": r, "x": sx, "y": sy, "count": k}))
    submit(ai, who, plan, strict=False)
    return {"who": who, "steps": len(plan)}


if __name__ == "__main__":
    raise SystemExit(main())

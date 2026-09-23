"""Waypoints that keep a walk away from enemy structures.

    사용자: "왜 적기지를 가로질러왔지? 땅벌레는 원거리공격하는데"

게임 길찾기는 «걸을 수 있는가»만 본다. 적은 모른다. charlie 는 (250,103) 에서
창고로 돌아오는 직선이 동쪽 둥지 무리 (121..142, 74..92) 를 정통으로 지나
중형 웜(사거리 30)에 맞아 죽었다. 그 전에 hotel 도 귀환 길 위의 둥지에.

    긴 걸음은 «먼저 길을 짠다» - 이번에는 적을 피해서.

굵은 격자(CELL 칸)에서 A* 를 돈다. 적 구조물(둥지·웜)에서 KEEP 칸 안의 격자는
못 지난다. 출발·도착 자체가 그 안이면(사슬 포탑을 세우러 웜 곁에 갈 때) 그
두 칸 근처만 열어 준다. 답은 경유점 목록 - 경유점 사이는 게임 길찾기가 걷는다.

    orders.submit() 이 KEEP 보다 긴 걸음마다 부른다. 스크립트는 몰라도 된다.
"""
from __future__ import annotations

import heapq
import math

CELL = 8            # 격자 한 칸 (타일)
KEEP = 60           # 적 구조물에서 이만큼 안은 안 지난다 (베헤모스 웜 48 + 여유)
LEG = 48            # 경유점 사이 거리 (이보다 촘촘하면 걸음 수가 큐를 넘친다)
LONG = 60           # 이보다 긴 걸음만 길을 짠다
MARGIN = 160        # 출발·도착 상자 둘레로 이만큼 더 본다


def hazards(ai, around, radius=900) -> list:
    """적 구조물 자리. [(x, y)]"""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, e in pairs(s.find_entities_filtered{type = {"unit-spawner", "turret"},
              force = game.forces.enemy, position = {%f, %f}, radius = %d}) do
        out[#out+1] = string.format("%%.0f,%%.0f", e.position.x, e.position.y)
      end
      return out
    end)()""" % (around[0], around[1], radius))
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    return [tuple(float(v) for v in str(r).split(",")) for r in rows]


def _blocked_cells(foes, x0, y0, w, h, keep):
    """격자에서 적 곁인 칸들."""
    bad = set()
    r = int(math.ceil(keep / CELL))
    for fx, fy in foes:
        cx, cy = int((fx - x0) // CELL), int((fy - y0) // CELL)
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                gx, gy = cx + dx, cy + dy
                if 0 <= gx < w and 0 <= gy < h:
                    px, py = x0 + (gx + 0.5) * CELL, y0 + (gy + 0.5) * CELL
                    if math.hypot(px - fx, py - fy) < keep:
                        bad.add((gx, gy))
    return bad


def waypoints(ai, start, goal, foes=None, keep=KEEP) -> list:
    """start -> goal 경유점 (goal 은 뺀다). 길이 없으면 [] - 그러면 그냥 걷는다."""
    if foes is None:
        foes = hazards(ai, ((start[0] + goal[0]) / 2, (start[1] + goal[1]) / 2))
    if not foes:
        return []
    x0 = min(start[0], goal[0]) - MARGIN
    y0 = min(start[1], goal[1]) - MARGIN
    w = int((abs(goal[0] - start[0]) + 2 * MARGIN) // CELL) + 1
    h = int((abs(goal[1] - start[1]) + 2 * MARGIN) // CELL) + 1
    near = [f for f in foes if x0 - keep <= f[0] <= x0 + w * CELL + keep
            and y0 - keep <= f[1] <= y0 + h * CELL + keep]
    if not near:
        return []
    bad = _blocked_cells(near, x0, y0, w, h, keep)
    sc = (int((start[0] - x0) // CELL), int((start[1] - y0) // CELL))
    gc = (int((goal[0] - x0) // CELL), int((goal[1] - y0) // CELL))
    if not bad:
        return []
    # 적 곁은 «못 지나는» 것이 아니라 «비싼» 것이다. 출발·도착이 적 곁일 때
    # (사슬 포탑은 웜 곁에 세운다) 막아 버리면 길이 없고, 비싸게 두면 가장
    # 짧게 스치는 길이 나온다.
    PENALTY = 12

    def heur(c):
        return math.hypot(c[0] - gc[0], c[1] - gc[1])

    best = {sc: 0.0}
    came = {}
    heap = [(heur(sc), 0.0, sc)]
    found = False
    while heap:
        _f, g, c = heapq.heappop(heap)
        if c == gc:
            found = True
            break
        if g > best.get(c, 1e18):
            continue
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                n = (c[0] + dx, c[1] + dy)
                if not (0 <= n[0] < w and 0 <= n[1] < h):
                    continue
                ng = g + math.hypot(dx, dy) * (PENALTY if n in bad else 1)
                if ng < best.get(n, 1e18):
                    best[n] = ng
                    came[n] = c
                    heapq.heappush(heap, (ng + heur(n), ng, n))
    if not found:
        return []
    cells = [gc]
    while cells[-1] != sc:
        cells.append(came[cells[-1]])
    cells.reverse()
    pts = [(x0 + (c[0] + 0.5) * CELL, y0 + (c[1] + 0.5) * CELL) for c in cells]
    # 경유점은 LEG 마다 하나 (많아야 열 개) - 사이는 게임 길찾기가 걷는다.
    # 격자 길은 대각선 계단이라 «꺾임»으로 고르면 칸마다 하나가 나온다.
    total = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
    leg = max(LEG, total / 10)
    out = []
    last = start
    for pt in pts[1:-1]:
        if math.hypot(pt[0] - last[0], pt[1] - last[1]) >= leg:
            out.append(pt)
            last = pt
    return out


def detour(ai, who, steps) -> list:
    """계획의 긴 걸음마다 경유점을 끼운다. 걸음이 아닌 단계(take/build)도 멀면 마찬가지."""
    live = {w["name"]: w for w in ai.list()}
    me = live.get(who)
    if not (me and me.get("alive") and me.get("x") is not None):
        return steps
    cur = (float(me["x"]), float(me["y"]))
    foes = None
    out = []
    added = 0
    for kind, p in steps:
        x, y = p.get("x"), p.get("y")
        if x is None or y is None or kind in ("craft",):
            out.append((kind, p))
            continue
        goal = (float(x), float(y))
        if math.hypot(goal[0] - cur[0], goal[1] - cur[1]) > LONG:
            if foes is None:
                foes = hazards(ai, cur)
            for wx, wy in waypoints(ai, cur, goal, foes):
                out.append(("walk_to", {"x": round(wx, 1), "y": round(wy, 1)}))
                added += 1
        out.append((kind, p))
        cur = goal
    if added:
        print(f"  적을 피해 경유점 {added}개를 끼웠다")
    return out

"""P0-1: what is around the spawn - ore patches, water, trees, nests. Charted chunks only.

설계서(coldstart-plan.md) P0-1. 앵커를 고르기 전에 «무엇이 어디에 얼마나» 있는지 잰다.
지도를 여는 것이 아니다: 이미 밝혀진 청크(force.is_chunk_charted)만 본다 - 시작 구역과
사람이 걸어서 본 곳. 더 보려면 fogwalk.py 로 걷는다.

광맥은 8칸 격자로 묶는다 (이웃 칸이 붙어 있으면 한 광맥). 광맥마다: 중심 · 네모 · 매장량 ·
스폰 거리 · 전기 채굴기로 T2 몫을 몇 시간 캘 수 있나.

    python scripts/survey.py
    python scripts/survey.py --radius 300 --md docs/run22-site.md
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge  # noqa: E402

CELL = 8
ORES = ("iron-ore", "copper-ore", "coal", "stone", "crude-oil", "uranium-ore")
# T2 몫 (coldstart-plan.md): 초당
T2_RATE = {"iron-ore": 7.5, "copper-ore": 1.9, "coal": 2.5, "stone": 0.5}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def cells(ai, radius) -> list:
    """(광석, 격자 x, 격자 y, 매장량) - 밝혀진 청크만."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local sp = f.get_spawn_position(s)
      local acc = {}
      for _, r in pairs(s.find_entities_filtered{type = "resource", position = sp, radius = %d}) do
        local p = r.position
        if f.is_chunk_charted(s, {math.floor(p.x / 32), math.floor(p.y / 32)}) then
          local k = r.name .. "|" .. math.floor(p.x / %d) .. "|" .. math.floor(p.y / %d)
          acc[k] = (acc[k] or 0) + r.amount
        end
      end
      local out = {}
      for k, v in pairs(acc) do out[#out+1] = k .. "|" .. v end
      out[#out+1] = "spawn|" .. sp.x .. "|" .. sp.y .. "|0"
      return out
    end)()""" % (radius, CELL, CELL))
    return [str(r).split("|") for r in _rows(reply)]


def patches(rows) -> tuple:
    spawn = (0.0, 0.0)
    by = {}
    for name, gx, gy, amt in rows:
        if name == "spawn":
            spawn = (float(gx), float(gy))
            continue
        by.setdefault(name, {})[(int(gx), int(gy))] = int(float(amt))
    out = []
    for name, grid in by.items():
        seen = set()
        for start in grid:
            if start in seen:
                continue
            stack, comp = [start], []
            seen.add(start)
            while stack:
                c = stack.pop()
                comp.append(c)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (c[0] + dx, c[1] + dy)
                        if n in grid and n not in seen:
                            seen.add(n)
                            stack.append(n)
            amount = sum(grid[c] for c in comp)
            cx = sum((c[0] + 0.5) * CELL * grid[c] for c in comp) / amount
            cy = sum((c[1] + 0.5) * CELL * grid[c] for c in comp) / amount
            box = (min(c[0] for c in comp) * CELL, min(c[1] for c in comp) * CELL,
                   (max(c[0] for c in comp) + 1) * CELL, (max(c[1] for c in comp) + 1) * CELL)
            out.append({"ore": name, "cx": cx, "cy": cy, "box": box, "amount": amount,
                        "tiles": len(comp) * CELL * CELL, "dist": math.hypot(cx - spawn[0], cy - spawn[1])})
    return spawn, sorted(out, key=lambda p: (p["ore"], p["dist"]))


def extras(ai, radius) -> dict:
    """물 가장 가까운 칸, 나무 수, 적 구조물 (밝혀진 청크)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local sp = f.get_spawn_position(s)
      local out = {water = {}, enemies = {}, trees = 0, charted = 0}
      local best = nil
      for _, t in pairs(s.find_tiles_filtered{position = sp, radius = %d, collision_mask = "water_tile", limit = 4000}) do
        local p = t.position
        if f.is_chunk_charted(s, {math.floor(p.x / 32), math.floor(p.y / 32)}) then
          local d = (p.x - sp.x) ^ 2 + (p.y - sp.y) ^ 2
          if not best or d < best.d then best = {x = p.x, y = p.y, d = d} end
        end
      end
      if best then out.water = {x = best.x, y = best.y, d = math.sqrt(best.d)} end
      out.trees = s.count_entities_filtered{type = "tree", position = sp, radius = 120}
      for _, e in pairs(s.find_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"}, position = sp, radius = %d}) do
        local p = e.position
        if f.is_chunk_charted(s, {math.floor(p.x / 32), math.floor(p.y / 32)}) then
          out.enemies[#out.enemies+1] = string.format("%%s %%.0f,%%.0f", e.name, p.x, p.y)
        end
      end
      for c in s.get_chunks() do
        if f.is_chunk_charted(s, {c.x, c.y}) then out.charted = out.charted + 1 end
      end
      return out
    end)()""" % (radius, radius))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--radius", type=int, default=400)
    ap.add_argument("--md", default="")
    args = ap.parse_args()
    ai = AIBridge()
    spawn, ps = patches(cells(ai, args.radius))
    ex = extras(ai, args.radius)
    lines = [f"스폰 ({spawn[0]:.0f},{spawn[1]:.0f}) · 밝혀진 청크 {ex.get('charted')} · 반경 {args.radius}"]
    for p in ps:
        if p["amount"] < 20000 and p["ore"] != "crude-oil":
            continue
        hours = ""
        if p["ore"] in T2_RATE:
            hours = f" · T2 몫 {p['amount'] / T2_RATE[p['ore']] / 3600:.0f}시간"
        b = p["box"]
        lines.append(f"  {p['ore']:<11} 중심 ({p['cx']:.0f},{p['cy']:.0f}) 거리 {p['dist']:.0f} · "
                     f"네모 ({b[0]},{b[1]})~({b[2]},{b[3]}) · {p['amount']:,}{hours}")
    w = ex.get("water") or {}
    if w:
        lines.append(f"  물         가장 가까운 칸 ({w['x']:.0f},{w['y']:.0f}) 거리 {w['d']:.0f}")
    lines.append(f"  나무 (120칸 안) {ex.get('trees')}")
    en = _rows(ex.get("enemies"))
    lines.append(f"  적 구조물 {len(en)}" + ("".join(f"\n    {e}" for e in en[:20]) if en else ""))
    print("\n".join(lines))
    if args.md:
        with open(args.md, "a", encoding="utf-8") as fh:
            fh.write("\n```\n" + "\n".join(lines) + "\n```\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

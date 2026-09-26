"""남쪽 줄 틈 막기 - 23회차 기지 안 스피터 침입 (과학 블록 · 서쪽 줄 유령 45) 의 길.

실측 (2026-09-27): 남쪽 포탑 줄은 y=52 x -110..-68 에서 끊기고, 동쪽 줄은 x=44 y 6..24 에서 끊긴다.
그 사이 (y=52 x -65..44 · x=44 y 24..52) 가 열려 있고, 둥지 (81,109) (76,122) 가 바로 남동쪽이다.
포탑을 6 칸마다 세운다. 자리는 물 · 벨트 · 전봇대 (x=-15 광석 벨트) 를 피해 y 를 ±3 안에서 옮긴다
(나무 · 바위는 build_stage 가 벤다). 탄은 벨트가 없으니 사람이 넣는다 - 관통탄이 모자라면 노란 탄.

    python scripts/sgap23.py                         # 고른 자리 · 선 것
    python scripts/sgap23.py --who alpha,bravo,charlie
    python scripts/sgap23.py --ammo --who alpha,bravo # 선 포탑마다 탄 채우기
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge  # noqa: E402

GUN = "gun-turret"
p1.COST.setdefault(GUN, {"iron-plate": 40, "copper-plate": 10})
WANT = [(x, 52) for x in range(-62, 43, 6)] + [(44, y) for y in (30, 36, 42, 48)]
AMMO_EACH = 20


def spots(ai) -> list:
    """WANT 마다 물 · 우리 건물 없는 2x2 자리 (y 또는 x 를 ±3 안에서)."""
    packed = ";".join(f"{x},{y}" for x, y in WANT)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      local function ok(x, y)
        for dx = -1, 0 do for dy = -1, 0 do if s.get_tile(x + dx, y + dy).collides_with('player') then return false end end end
        for _, e in pairs(s.find_entities_filtered{area = {{x - 1.2, y - 1.2}, {x + 1.2, y + 1.2}}, force = 'player'}) do
          if e.name ~= '%s' and e.type ~= 'character' then return false end end
        return true end
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") x, y = tonumber(x), tonumber(y)
        local done = nil
        for _, d in pairs({0, 1, -1, 2, -2, 3, -3}) do
          local px, py = x, y
          if x == 44 then py = y + d else py = y + d end
          if d ~= 0 and x ~= 44 then px = x end
          if ok(px, py) then done = {x = px, y = py} break end
          if ok(x + d, y) then done = {x = x + d, y = y} break end
        end
        if done then o[#o + 1] = done end
      end return o end)()""" % (GUN, packed))
    rows = list(r.values()) if isinstance(r, dict) else list(r or [])
    return [(float(p["x"]), float(p["y"])) for p in rows]


def ammo_state(ai, pts) -> list:
    packed = ";".join(f"{x},{y}" for x, y in pts)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local t = s.find_entity('%s', {tonumber(x), tonumber(y)})
        o[#o + 1] = t and t.get_inventory(defines.inventory.turret_ammo).get_item_count() or -1 end
      return o end)()""" % (packed, GUN))
    return list(r.values()) if isinstance(r, dict) else list(r or [])


def load(ai, crew, pts) -> None:
    have = ammo_state(ai, pts)
    need = [(p, AMMO_EACH - int(n)) for p, n in zip(pts, have) if 0 <= int(n) < AMMO_EACH]
    if not need:
        print("  탄: 다 찼다")
        return
    hub = p1.hub(ai)
    kind = "piercing-rounds-magazine" if hub.get("piercing-rounds-magazine", (0, 0, 0))[2] >= sum(n for _, n in need) \
        else "firearm-magazine"
    per = (len(need) + len(crew) - 1) // len(crew)
    ids = {}
    for i, who in enumerate(crew):
        part = need[i * per:(i + 1) * per]
        if not part:
            continue
        total = sum(n for _, n in part)
        if kind in hub:
            hx, hy, _ = hub[kind]
            plan = [("walk_to", {"x": hx, "y": hy + 1.5}), ("take", {"name": kind, "x": hx, "y": hy, "count": total})]
        else:
            ix, iy, _ = hub["iron-plate"]
            plan = [("walk_to", {"x": ix, "y": iy + 1.5}), ("take", {"name": "iron-plate", "x": ix, "y": iy, "count": 4 * total}),
                    ("craft", {"recipe": kind, "count": total, "wait": True})]
        for (x, y), n in part:
            plan += [("walk_to", {"x": x, "y": y - 2}), ("insert", {"name": kind, "x": x, "y": y, "count": n})]
        ai.agent(who).cancel()
        ids[who] = ai.agent(who).submit_plan(plan)
    t0 = time.time()
    while time.time() - t0 < 1200:
        time.sleep(8)
        if all(ai.poll(t)["status"] in ("done", "failed") for v in ids.values() for t in v):
            break
    print(f"  탄 ({kind}): {ammo_state(ai, pts)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--ammo", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    pts = spots(ai)
    steps = [p1.b(GUN, x, y) for x, y in pts]
    print(f"  자리 {len(pts)}/{len(WANT)} · 선 것 {len(p1.standing(ai, steps))} · 탄 {ammo_state(ai, pts)}")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    os.environ[detached.ENV] = "sgap23"
    detached.mark(crew, "sgap23", minutes=40)
    try:
        if a.ammo:
            load(ai, crew, pts)
        else:
            p1.PARK = (-20.5, 40.5)
            p1.build_stage(ai, crew, steps, "sgap")
            load(ai, crew, pts)
    finally:
        detached.release(crew)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

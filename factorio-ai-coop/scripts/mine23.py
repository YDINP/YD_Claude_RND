"""서쪽 철 광맥 다시 캐기 - 23회차 철 광석 병목 (1.8/s).

실측 (2026-09-27): 서쪽 철 광맥 (x -150..-80, y -50..5) 의 전기 채굴기 33 중 30 이 no_minable_resources.
철 광석 입력 108/분. 화로: col41 (x -41·-36) 24 전부 광석 없음 · x73 6 중 4 · p27 22 중 15.
남은 광석 ~31만 중 11만은 탄 벨트 (x=-113.5, 서쪽 방어선 포탑 x -117..-115 에 탄을 먹임) «바깥» 이라
못 캔다 (방어선 밖에 짓지 않는다). 안쪽에서 캘 수 있는 두 덩어리:

  A  x -114..-105, y -32..-19  -> 새 벨트 x=-109.5 남향 -> (-109.5,-18.5) 에서 동쪽으로 꺾여 y=-18.5 줄의 새 머리
  B  x -97..-88,   y -37..-23  -> 새 벨트 x=-92.5 남향 -> (-92.5,-18.5) y=-18.5 줄에 옆치기
  y=-18.5 줄은 x=-85.5 북향 -> (-73.5,-45.5) x73 화로 -> col41 (-38.5,-21.5) 로 간다 (Lua 로 따라가 확인).

전력: A 서쪽 줄은 탄 벨트 곁 전봇대 (x=-114.5) 가, A 동쪽 줄은 (-104.5,-28.5) · 새 (-105.5,-22.5) 가,
B 는 (-96.5,*) · (-90.5,-22.5) · 새 (-88.5,-32.5) (-88.5,-27.5) 가 닿는다.
(-108.5,-22.5) 전봇대는 A 동쪽 (-107.5,-23.5) 자리라 뜯는다 (새 전봇대를 먼저 세운 뒤).
다 캔 채굴기 30 은 뜯어 가방에 넣고 (fetch 가 짓는 사람 가방부터 쓴다) 새 자리에 다시 쓴다.

    python scripts/mine23.py                    # 조사: 죽은 채굴기 · 후보 자리 · 광석 벨트 행선
    python scripts/mine23.py --who alpha,bravo  # 짓기 + 확인
    python scripts/mine23.py --verify           # 일하는 채굴기 · 철 광석/분
    python scripts/mine23.py --lanes --who alpha  # 레인 병목 걷기 (LANE_CUTS 주석)
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

N, E, S, W = 0, 4, 8, 12
EMD, BELT, POLE = p1.EMD, p1.BELT, p1.POLE
AREA = ((-150, -50), (-80, 5))
WEST_LIMIT = -118          # 방어선 - 이 서쪽엔 아무것도 두지 않는다
OLD_POLE = (-108.5, -22.5)

DRILLS_A = [(-111.5, y, E) for y in (-29.5, -26.5, -23.5, -20.5)] + [(-111.5, -16.5, N)] \
    + [(-107.5, y, W) for y in (-29.5, -26.5, -23.5)]
DRILLS_B = [(-94.5, y, E) for y in (-34.5, -31.5, -28.5, -25.5)] + [(-90.5, y, W) for y in (-34.5, -31.5, -28.5, -25.5)]
DRILLS = DRILLS_A + DRILLS_B
NEW_POLES = [(-105.5, -22.5), (-88.5, -32.5), (-88.5, -27.5)]


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def dead(ai) -> list:
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, name = '%s', force = 'player'}) do
        if e.status == defines.entity_status.no_minable_resources then
          o[#o+1] = string.format("%%.1f,%%.1f", e.position.x, e.position.y) end end
      return o end)()""" % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], EMD))
    return [tuple(float(v) for v in str(p).split(",")) for p in rows(r)]


def stages(dead_pts) -> dict:
    kill = [("demolish", {"x": x, "y": y, "name": EMD, "search_radius": 0.4}) for x, y in dead_pts]
    kill.append(("demolish", {"x": OLD_POLE[0], "y": OLD_POLE[1], "name": POLE, "search_radius": 0.3}))
    belt = [p1.b(BELT, -109.5, -29.5 + i, S) for i in range(11)]            # -29.5 .. -19.5
    belt += [p1.b(BELT, -109.5, -18.5, E)]                                   # 꺾임 - y=-18.5 줄의 새 머리
    belt += [p1.b(BELT, -92.5, -34.5 + i, S) for i in range(16)]            # -34.5 .. -19.5
    return {"poles": [p1.b(POLE, x, y) for x, y in NEW_POLES],
            "dead": kill,
            "belt": belt,
            "drills": [p1.b(EMD, x, y, d) for x, y, d in DRILLS]}


def check_plan(ai, st) -> list:
    """자리마다: 광석 합 · 놓을 수 있나 (죽은 채굴기 · 뜯을 전봇대 자리는 빈 것으로) · 전기 닿나 · 떨굼 자리."""
    packed = ";".join(f"{p['name']},{p['x']},{p['y']},{p.get('direction', 0)}"
                      for k in ("poles", "belt", "drills") for kk, p in st[k] if kk == "build")
    poles = ";".join(f"{x},{y}" for x, y in NEW_POLES)
    r = ai.lua("""(function() local s, f, o = game.surfaces[1], game.forces.player, {}
      local function gone(e) return (e.name == '%s' and e.status == defines.entity_status.no_minable_resources)
        or (e.name == '%s' and math.abs(e.position.x - (%f)) < 0.1 and math.abs(e.position.y - (%f)) < 0.1) end
      local newp = {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") newp[#newp+1] = {tonumber(x), tonumber(y)} end
      local function powered(x, y)
        for _, p in pairs(s.find_entities_filtered{area = {{x - 4.5, y - 4.5}, {x + 4.5, y + 4.5}}, type = 'electric-pole', force = f}) do
          if not gone(p) then local d = p.prototype.get_supply_area_distance()
            if math.abs(p.position.x - x) < 1.5 + d and math.abs(p.position.y - y) < 1.5 + d then return "p" .. p.electric_network_id end end end
        for _, q in pairs(newp) do if math.abs(q[1] - x) < 4 and math.abs(q[2] - y) < 4 then return "new" end end
        return "NO" end
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local h = n == '%s' and 1.5 or 0.5
        local what = "ok"
        if s.count_entities_filtered{name = n, force = f, area = {{x - 0.45, y - 0.45}, {x + 0.45, y + 0.45}}} > 0 then what = "standing"
        else
          for _, e in pairs(s.find_entities_filtered{area = {{x - h + 0.05, y - h + 0.05}, {x + h - 0.05, y + h - 0.05}}}) do
            if e.type ~= 'resource' and e.type ~= 'character' and not gone(e) then what = "X:" .. e.name break end end
          for dx = -h + 0.5, h - 0.5 do for dy = -h + 0.5, h - 0.5 do
            if s.get_tile(x + dx, y + dy).collides_with('player') then what = "X:water" end end end
        end
        if x - h < %d then what = "X:west-of-line" end
        local extra = ""
        if n == '%s' then
          local ore = 0
          for _, r in pairs(s.find_entities_filtered{area = {{x - 2.5, y - 2.5}, {x + 2.5, y + 2.5}}, name = 'iron-ore'}) do ore = ore + r.amount end
          local v = ({[0] = {0, -1.8}, [4] = {1.8, 0}, [8] = {0, 1.8}, [12] = {-1.8, 0}})[d]
          local b = s.find_entities_filtered{position = {x + v[1], y + v[2]}, radius = 0.3, type = 'transport-belt'}[1]
          extra = string.format(" ore=%%d power=%%s drop=%%s", ore, powered(x, y), b and "belt" or "(planned)")
        end
        o[#o+1] = bit .. " " .. what .. extra
      end
      return o end)()""" % (EMD, POLE, OLD_POLE[0], OLD_POLE[1], poles, packed, EMD, WEST_LIMIT, EMD))
    return [str(x) for x in rows(r)]


def ore_belts(ai) -> list:
    """구역 안 철 광석이 실린 벨트를 끝까지 따라가 행선별로 묶는다 (지하 벨트 건넘)."""
    r = ai.lua("""(function() local s, o, ends = game.surfaces[1], {}, {}
      local function stat(e) for k, v in pairs(defines.entity_status) do if v == e.status then return k end end return "?" end
      for _, e0 in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = 'transport-belt', force = 'player'}) do
        local n = 0 for l = 1, 2 do n = n + e0.get_transport_line(l).get_item_count('iron-ore') end
        if n > 0 then
          local e, last, k, seen = e0, e0, 0, {}
          while e and k < 700 and not seen[e.unit_number] do
            seen[e.unit_number] = true k = k + 1 last = e
            local nx = e.belt_neighbours.outputs[1]
            if not nx and e.type == 'underground-belt' and e.belt_to_ground_type == 'input' then nx = e.neighbours end
            e = nx end
          local key = string.format("%%.1f,%%.1f", last.position.x, last.position.y)
          local t = ends[key]
          if not t then
            local fur = {}
            for _, i in pairs(s.find_entities_filtered{position = last.position, radius = 1.6, type = 'inserter'}) do
              if i.drop_target and i.drop_target.type == 'furnace' then fur[#fur+1] = i.drop_target end end
            t = {n = 0, sx = 0, sy = 0, fur = #fur}
            if #fur > 0 then t.fs = stat(fur[1]) end
            ends[key] = t end
          t.n = t.n + 1
          if t.n == 1 then t.sx, t.sy = e0.position.x, e0.position.y end
        end end
      for key, t in pairs(ends) do
        o[#o+1] = string.format("끝 (%%s) <- 광석 벨트 %%d 칸 (예: %%.1f,%%.1f) · 끝 화로 팔 %%d %%s", key, t.n, t.sx, t.sy, t.fur, t.fs or "") end
      return o end)()""" % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1]))
    return [str(x) for x in rows(r)]


# 한 레인 병목 (첫 짓기 뒤 실측): 옆치기는 한 레인에만 싣는다. A 를 (-109.5,-18.5) 에 옆치기로 넣고
# B 도 옆치기라 y=-18.5 북쪽 레인이 가득 (4/tile) · B 4 대가 waiting_for_space. 게다가 모서리
# (-85.5,-18.5) 는 x=-85.5 (y=-10.5 줄) 가 뒤에서 들어와 y=-18.5 두 레인이 다 서쪽 레인으로 옆치기된다.
# 그래서: 머리 두 칸을 걷어 A 가 «꺾여» 두 레인을 그대로 싣고 (서쪽 채굴기 -> 남쪽 레인),
# 모서리 뒤 (-85.5,-17.5) 를 걷어 모서리도 «꺾임» 으로 - y=-18.5 두 레인이 x=-85.5 두 레인으로 간다.
# y=-10.5 줄 (채굴기 1 대, 잔량 ~5k) 은 끊긴다. (-111.5,-16.5) 채굴기는 떨굴 벨트가 없어져 걷는다.
LANE_CUTS = [(BELT, -111.5, -18.5), (BELT, -110.5, -18.5), (BELT, -85.5, -17.5), (EMD, -111.5, -16.5)]


def cut_lanes(ai, who) -> list:
    packed = ";".join(f"{n},{x},{y}" for n, x, y in LANE_CUTS)
    left = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        if s.find_entity(n, {tonumber(x), tonumber(y)}) then o[#o+1] = bit end end
      return o end)()""" % packed)
    todo = [str(b).split(",") for b in rows(left)]
    if not todo:
        return []
    plan = []
    for n, x, y in todo:
        x, y = float(x), float(y)
        plan += [("walk_to", {"x": x + 2.5, "y": y + 2.5}), ("demolish", {"x": x, "y": y, "name": n, "search_radius": 0.3})]
    plan.append(("walk_to", {"x": p1.PARK[0], "y": p1.PARK[1]}))
    ai.agent(who).cancel()
    ids = ai.agent(who).submit_plan(plan)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(6)
        if all(ai.poll(t)["status"] in ("done", "failed") for t in ids):
            break
    left = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        if s.find_entity(n, {tonumber(x), tonumber(y)}) then o[#o+1] = bit end end
      return o end)()""" % packed)
    return [str(b) for b in rows(left)]


def verify(ai) -> dict:
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local c = {}
      for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, name = '%s', force = f}) do
        local k = "?" for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end
        c[k] = (c[k] or 0) + 1 end
      c.ore_per_min = f.get_item_production_statistics(s).get_flow_count{name = 'iron-ore', category = 'input',
        precision_index = defines.flow_precision_index.one_minute, count = true}
      return c end)()""" % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], EMD))
    return dict(r or {})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--lanes", action="store_true", help="레인 병목 걷기만 (--who 첫 사람)")
    a = ap.parse_args()
    ai = AIBridge()
    print("  확인:", verify(ai))
    if a.verify:
        return 0
    dp = dead(ai)
    st = stages(dp)
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        print(f"  죽은 채굴기 {len(dp)}: {dp}")
        print("  광석 벨트 행선:")
        for line in ore_belts(ai):
            print("   ", line)
        print("  계획 자리 (이름,x,y,방향 상태):")
        for line in check_plan(ai, st):
            print("   ", line)
        for k, v in st.items():
            nb = sum(1 for kk, _ in v if kk == "build")
            print(f"  {k:7s} {len(p1.standing(ai, v))}/{nb} · 막힘 {p1.blocked(ai, v)[:4]}")
        return 0
    if a.lanes:
        p1.PARK = (-100.5, -14.5)
        os.environ[detached.ENV] = "mine23"
        detached.mark(crew[:1], "mine23", minutes=20)
        try:
            print("  레인 걷기 - 남은 것:", cut_lanes(ai, crew[0]))
        finally:
            detached.release(crew[:1])
        time.sleep(120)
        print("  확인 (120초 뒤):", verify(ai))
        return 0
    bad = [x for x in check_plan(ai, st) if " X:" in x or "power=NO" in x]
    if bad:
        print("  계획이 막혔다 - 짓지 않는다:", bad)
        return 1
    p1.PARK = (-100.5, -14.5)
    os.environ[detached.ENV] = "mine23"
    detached.mark(crew, "mine23", minutes=90)
    try:
        for k in ("poles", "dead", "belt", "drills"):
            nb = sum(1 for kk, _ in st[k] if kk == "build")
            if nb and len(p1.standing(ai, st[k])) >= nb:
                continue
            if k == "drills":
                print("  채굴기 가방:", {w: ai.agent(w).items().get(EMD, 0) for w in crew})
            p1.build_stage(ai, crew, st[k], "mine-" + k)
    finally:
        detached.release(crew)
    time.sleep(90)
    print("  확인 (90초 뒤):", verify(ai))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

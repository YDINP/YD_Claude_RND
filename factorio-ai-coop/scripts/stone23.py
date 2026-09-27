"""돌 채굴 되살리기 - 23회차 벽돌 0 (군사 팩 · 전기 화로 막힘).

실측 (2026-09-27): 벽돌 화로 6 (y=-97, x -63..-48, 석탄은 y=-94.5 석탄 벨트에서 팔이 넣고 벽돌도 그 벨트로 낸다)
에 돌을 «바로» 넣던 채굴기 5 (y=-99.5, x -62.5..-50.5 남향) 가 다 캤다 (no_minable_resources).
북쪽 채굴기 2 (-61.5,-102.5) (-58.5,-102.5) 는 북향 -> y=-104.5 -> x=-68.5 남향 -> y=-86.5 서향 ->
(-92.5,-86.5) 막다른 끝 - 돌이 화로에 안 가고 벨트에 쌓여 waiting_for_space.
남은 돌 ~17.8만은 두 덩어리:
  북  y -105..-103 (x -64..-48) ~3.5만 (타일당 500~1000) - 그 북쪽 y -108..-106 은 포탑 탄 벨트 밑
  남  y -97..-93 (x -64..-47) ~11만 - 그중 y -97..-96 은 화로 · 팔 밑, y -95 는 석탄 벨트 밑

새 길: 죽은 채굴기를 뜯은 자리 (y -101..-98) 에
  돌 벨트 y=-100.5 서향 (x -47.5..-63.5) -> 긴팔 6 (y=-98.5, 북에서 집어 남쪽 화로에) -> 기존 화로 6
  북 채굴기 5 (y=-102.5 남향: 기존 둘을 돌려 세우고 셋 더) 가 그 벨트에 바로 떨군다
  (남 덩어리는 짓지 않는다 - 아래 SOUTH 주석)
전력: 긴팔은 화로 사이 기존 전봇대 (y=-96.5), 북 채굴기는 (-63.5,-101.5) (-56.5,-101.5) + 새 (-49.5,-99.5).
화로 6 최대 벽돌 112/분 (돌 225/분) · 북 채굴기 5 = 돌 150/분 (첫 확인: 돌 177~187/분 · 벽돌 92~94/분).

    python scripts/stone23.py                   # 조사: 돌 덩어리 · 죽은 채굴기 · 화로 · 계획 자리
    python scripts/stone23.py --who bravo,echo  # 짓기 + 확인
    python scripts/stone23.py --verify          # 돌/분 · 벽돌/분 · 채굴기 · 화로 상태
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
UG, LONG = "underground-belt", "long-handed-inserter"
p1.COST.setdefault(UG, {"iron-plate": 8.75})
p1.COST.setdefault(LONG, {"iron-plate": 7, "copper-plate": 1.5})
p1.PAIRED.add(UG)
OWNER = "stone23"
AREA = ((-70, -110), (-44, -88))          # 벽돌 화로 둘레 (돌 채굴기만 본다)
FURN_XS = (-63, -60, -57, -54, -51, -48)  # 벽돌 화로 (y=-97)
LONG_XS = (-62.5, -59.5, -56.5, -53.5, -50.5, -48.5)   # -58.5 · -51.5 는 지하 출구 자리. -47.5 는 벨트 머리 (떨굼 -48.5 보다 위) 라 빈다
NORTH = [(x, -102.5, S) for x in (-61.5, -58.5, -54.5, -51.5, -48.5)]
# 남 덩어리 (y -95..-91) 는 구리 광맥과 섞였다: 채굴기 셋의 5x5 에 구리 1.7~4만 (돌 1.3~3.3만).
# 한 번 지었더니 구리 광석이 돌 벨트로 와 긴팔이 벽돌 화로에 넣을 참이었다 (구리판 -> 벽돌 줄 오염).
# 긴팔은 거름 틀이 없어 걸러 낼 수 없다 - 채굴기 · 모음 벨트 · 지하를 뜯고 돌 벨트를 다시 깔았다. 짓지 않는다.
# (지하 자리 y -93.5 -> -98.5 는 되고, 전봇대 (-58.5,-90.5) (-51.5,-90.5) 는 서 있다.)
SOUTH = []
DRILLS = NORTH + SOUTH
FEED_XS = ()
NEW_POLES = [(-49.5, -99.5), (-58.5, -90.5), (-51.5, -90.5)]
PARK = (-72.5, -97.5)
# 둘레가 막힌 자리는 설 곳을 정해 준다: (-56.5,-92.5) 는 북 석탄 벨트 · 남 채굴기 · 옆 채굴기에 갇혀
# build_stage 의 걸음이 «설 수 있는 칸» 으로 옮겨져 자기 발로 그 자리를 막았다 (5순번 내리 blocked).
STAND = {}


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def ug_out(x, y, d):
    k, p = p1.b(UG, x, y, d)
    p["type"] = "output"
    return (k, p)


def to_remove(ai) -> list:
    """다 캔 돌 채굴기 + 북쪽을 보는 (막다른 벨트로 떨구는) 북 채굴기 - 다시 돌려 세운다."""
    north = ";".join(f"{x},{y}" for x, y, _ in NORTH)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, name = '%s', force = 'player'}) do
        local mt = e.mining_target
        -- y < -95 만: 그 남쪽 (y=-87.5) 죽은 채굴기는 구리 줄 것이다
        if e.status == defines.entity_status.no_minable_resources and e.position.y < -95 and (not mt or mt.name == 'stone') then
          o[#o+1] = string.format("%%.1f,%%.1f", e.position.x, e.position.y) end end
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local e = s.find_entity('%s', {tonumber(x), tonumber(y)})
        if e and e.direction ~= defines.direction.south then o[#o+1] = bit end end
      return o end)()""" % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], EMD, north, EMD))
    return sorted({tuple(float(v) for v in str(p).split(",")) for p in rows(r)})


def stages(kill) -> dict:
    belt = [p1.b(BELT, -47.5 - i, -100.5, W) for i in range(17)]            # -47.5 .. -63.5
    for x in FEED_XS:
        belt += [p1.b(BELT, x, -92.5, N), p1.b(UG, x, -93.5, N), ug_out(x, -98.5, N), p1.b(BELT, x, -99.5, N)]
    return {"dead": [("demolish", {"x": x, "y": y, "name": EMD, "search_radius": 0.4}) for x, y in kill],
            "poles": [p1.b(POLE, x, y) for x, y in NEW_POLES],
            "belt": belt,
            "ins": [p1.b(LONG, x, -98.5, N) for x in LONG_XS],
            "drills": [p1.b(EMD, x, y, d) for x, y, d in DRILLS]}


def survey(ai) -> list:
    """돌 덩어리 (10x10) · 적 60 칸 · 벽돌 화로 · 돌 채굴기 떨굼."""
    r = ai.lua("""(function() local s, f, o = game.surfaces[1], game.forces.player, {}
      local g = {}
      for _, r in pairs(s.find_entities_filtered{area = {{-200, -200}, {200, 200}}, name = 'stone'}) do
        local k = math.floor(r.position.x / 10) * 10 .. "," .. math.floor(r.position.y / 10) * 10
        g[k] = (g[k] or 0) + r.amount end
      for k, v in pairs(g) do local x, y = string.match(k, "([^,]+),([^,]+)")
        o[#o+1] = string.format("돌 칸 (%%s) %%d · 적 60칸 %%d", k, v, s.count_entities_filtered{force = 'enemy',
          type = {'turret', 'unit-spawner'}, position = {tonumber(x) + 5, tonumber(y) + 5}, radius = 60}) end
      local function st(e) for k, v in pairs(defines.entity_status) do if v == e.status then return k end end return "?" end
      for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, name = '%s', force = f}) do
        local mt = e.mining_target
        if not mt or mt.name == 'stone' then local t = e.drop_target
          o[#o+1] = string.format("돌 채굴기 %%.1f,%%.1f d=%%d %%s -> %%s", e.position.x, e.position.y, e.direction, st(e),
            t and string.format("%%s@%%.1f,%%.1f", t.name, t.position.x, t.position.y) or "땅") end end
      for _, u in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = 'furnace', force = f}) do
        local function c(i) local x = "" for _, v in pairs(u.get_inventory(i).get_contents()) do x = x .. v.name .. ":" .. v.count .. " " end return x end
        o[#o+1] = string.format("화로 %%s %%.1f,%%.1f 연료=%%s 원료=%%s 산물=%%s %%s", u.name, u.position.x, u.position.y,
          c(defines.inventory.fuel), c(defines.inventory.furnace_source), c(defines.inventory.furnace_result), st(u)) end
      return o end)()""" % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], EMD, AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1]))
    return sorted(str(x) for x in rows(r))


def check_plan(ai, st) -> list:
    """자리마다: 놓을 수 있나 (뜯을 채굴기 자리는 빈 것으로) · 채굴기 돌 합 · 전기."""
    packed = ";".join(f"{p['name']},{p['x']},{p['y']},{p.get('direction', 0)}"
                      for k in ("poles", "belt", "ins", "drills") for kk, p in st[k] if kk == "build")
    kill = ";".join(f"{p['x']},{p['y']}" for _, p in st["dead"])
    poles = ";".join(f"{x},{y}" for x, y in NEW_POLES)
    r = ai.lua("""(function() local s, f, o = game.surfaces[1], game.forces.player, {}
      local killp = {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") killp[#killp+1] = {tonumber(x), tonumber(y)} end
      local function gone(e) if e.name ~= '%s' then return false end
        for _, q in pairs(killp) do if math.abs(e.position.x - q[1]) < 0.1 and math.abs(e.position.y - q[2]) < 0.1 then return true end end
        return false end
      local newp = {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") newp[#newp+1] = {tonumber(x), tonumber(y)} end
      local function powered(x, y, h)
        for _, p in pairs(s.find_entities_filtered{area = {{x - 4.5, y - 4.5}, {x + 4.5, y + 4.5}}, type = 'electric-pole', force = f}) do
          local d = p.prototype.get_supply_area_distance()
          if math.abs(p.position.x - x) < h + d and math.abs(p.position.y - y) < h + d then return "p" .. p.electric_network_id end end
        for _, q in pairs(newp) do if math.abs(q[1] - x) < h + 2.5 and math.abs(q[2] - y) < h + 2.5 then return "new" end end
        return "NO" end
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local h = n == '%s' and 1.5 or 0.5
        local what = "ok"
        if s.count_entities_filtered{name = n, force = f, area = {{x - 0.45, y - 0.45}, {x + 0.45, y + 0.45}}} > 0 then what = "standing"
        else
          for _, e in pairs(s.find_entities_filtered{area = {{x - h + 0.05, y - h + 0.05}, {x + h - 0.05, y + h - 0.05}}}) do
            if e.type ~= 'resource' and e.type ~= 'character' and e.type ~= 'corpse' and not gone(e) then what = "X:" .. e.name break end end
        end
        local extra = ""
        if n == '%s' then
          local ore = 0
          for _, r in pairs(s.find_entities_filtered{area = {{x - 2.5, y - 2.5}, {x + 2.5, y + 2.5}}, name = 'stone'}) do ore = ore + r.amount end
          extra = string.format(" stone=%%d power=%%s", ore, powered(x, y, 1.5))
        elseif n == '%s' then extra = " power=" .. powered(x, y, 0.5)
        elseif n == '%s' then
          local near = s.find_entities_filtered{position = {x, y}, radius = 7.5, type = 'electric-pole', force = f}
          local ok = "NO" for _, p in pairs(near) do if not gone(p) then ok = "p" .. p.electric_network_id break end end
          extra = " wire=" .. ok end
        o[#o+1] = bit .. " " .. what .. extra
      end
      return o end)()""" % (kill, EMD, poles, packed, EMD, EMD, LONG, POLE))
    return [str(x) for x in rows(r)]


def place_stuck(ai, who, steps) -> list:
    """build_stage 가 못 놓은 것을 정한 자리에 서서 놓는다."""
    up = p1.standing(ai, steps)
    plan = []
    for k, p in steps:
        if k == "build" and (p["name"], p["x"], p["y"]) not in up and (p["x"], p["y"]) in STAND:
            sx, sy = STAND[(p["x"], p["y"])]
            plan += [("walk_to", {"x": sx, "y": sy}), (k, p)]
    if not plan:
        return []
    ai.agent(who).cancel()
    ids = ai.agent(who).submit_plan(plan + [("walk_to", {"x": PARK[0], "y": PARK[1]})])
    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(5)
        if all(ai.poll(t)["status"] in ("done", "failed") for t in ids):
            break
    return [ai.poll(t).get("error") for t in ids if ai.poll(t)["status"] == "failed"]


def verify(ai) -> dict:
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local c, fu = {}, {}
      for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, name = '%s', force = f}) do
        local mt = e.mining_target
        if not mt or mt.name == 'stone' then
          local k = "?" for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end
          c[k] = (c[k] or 0) + 1 end end
      for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = 'furnace', force = f}) do
        local k = "?" for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end
        fu[k] = (fu[k] or 0) + 1 end
      local st = f.get_item_production_statistics(s)
      local function m(n) return st.get_flow_count{name = n, category = 'input',
        precision_index = defines.flow_precision_index.one_minute, count = true} end
      local function t10(n) return st.get_flow_count{name = n, category = 'input',
        precision_index = defines.flow_precision_index.ten_minutes, count = true} end
      return {drills = c, furnaces = fu, stone_per_min = m('stone'), brick_per_min = m('stone-brick'),
              stone_10min = t10('stone'), brick_10min = t10('stone-brick')} end)()"""
               % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], EMD, AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1]))
    return dict(r or {})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    print("  확인:", verify(ai), flush=True)
    if a.verify:
        return 0
    kill = to_remove(ai)
    st = stages(kill)
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        for line in survey(ai):
            print("   ", line)
        print(f"  뜯을 채굴기 {len(kill)}: {kill}")
        print("  계획 자리 (이름,x,y,방향 상태):")
        for line in check_plan(ai, st):
            print("   ", line)
        return 0
    bad = [x for x in check_plan(ai, st) if " X:" in x or "=NO" in x]
    if bad:
        print("  계획이 막혔다 - 짓지 않는다:", bad)
        return 1
    p1.PARK = PARK
    os.environ[detached.ENV] = OWNER
    detached.mark(crew, OWNER, minutes=90)
    try:
        for k in ("dead", "poles", "belt", "ins", "drills"):
            nb = sum(1 for kk, _ in st[k] if kk == "build")
            if nb and len(p1.standing(ai, st[k])) >= nb:
                continue
            who = crew
            if k == "drills":
                bags = {w: ai.agent(w).items().get(EMD, 0) for w in crew}
                print("  채굴기 가방:", bags, flush=True)
                # fetch 는 채굴기를 만들지 못한다 - 나눠 받을 몫만큼 가진 사람만 짓는다
                need = nb - len(p1.standing(ai, st[k]))
                who = [w for w in crew if bags[w] >= (need + len(crew) - 1) // len(crew)] or \
                      [max(crew, key=lambda w: bags[w])]
            if k == "drills" and STAND:
                print("  정한 자리에서 먼저:", place_stuck(ai, who[0], st[k]), flush=True)
            p1.build_stage(ai, who, st[k], "stone-" + k)
    finally:
        detached.release(crew)
    time.sleep(120)
    print("  확인 (120초 뒤):", verify(ai), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

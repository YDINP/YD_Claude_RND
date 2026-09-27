"""서쪽 확장 포탑 벨트 급탄 - 23회차 서벽 (새 포탑 x=-128) + 남서 틈 포탑.

실측 (2026-09-27 16:35, tick 15.48M):
    · 서쪽 탄 벨트: 조립기 (-78.5,-49.5) -> y=-46.5 서향 -> 분배기 (-111.5,-46) -> x=-113.5 남향 (y -45.5..53.5, 팔 x=-114.5 가
      x=-116 포탑을 먹임) -> y=54.5 동향 (남쪽 줄 y=52 포탑). 북쪽 조립기 여분은 분배기 (-105.5,-70) -> x=-106.5 가지로 합류.
    · 벨트 급탄 없는 포탑 (벽 안): 새 줄 (-128, -30/-26/-22/-18/-14/-10/-6) · 틈 (-116,-1) (-115,5) (-116,11) · 남서 (-116,35) (-116,47)
      (-112,52) (-107,52). (북서 전진 포트 (-172..-181, -99..-81) 7 대는 벽 밖 - 이 스크립트 밖.)

설계:
    A 서벽 가지: x=-113.5 에 분배기 (-114,-6.5) S -> 왼쪽 출력 (-114.5,-5.5) 서향 -> y=-5.5 (연결 벽 y -4.5 바로 안) ->
      지하 (-118.5 → -121.5, 옛 벽 x -120.5/-119.5 밑) -> (-125.5,-5.5) 북향 -> x=-125.5 북향 끝 y=-29.5.
      채굴기 (-121.5, x -123..-120) · 모음 벨트 x=-119.5 (y ≤ -8.5) · 전봇대 x=-123.5 와 안 겹친다.
      팔 (-126.5, y+0.5) E (포탑 x -129..-127 에 떨굼) · 전봇대 (-126.5, y-0.5).
    B 틈/남서: 팔 (-114.5, y) E (x=-113.5 벨트에서) · (-112.5,53.5) (-107.5,53.5) S (y=54.5 벨트에서).
    C (-115,5) 는 벨트에 딱 붙어 팔 자리가 없다 -> 해체 후 (-116,5) 에 다시 (로봇) + 팔 (-114.5,4.5) E. 근접 적 0 일 때만.

    python scripts/wbelt23.py                 # 조사 (재고 · 위협 · 놓을 수 있나)
    python scripts/wbelt23.py --ghosts        # 벨트 · 지하 · 팔 · 전봇대 유령 (로봇)
    python scripts/wbelt23.py --splitter      # delta: 분배기 손제작 -> 벨트 한 칸 걷고 분배기 (끊김 ~1초)
    python scripts/wbelt23.py --move5         # (-115,5) -> (-116,5) 옮기기 (로봇)
    python scripts/wbelt23.py --verify        # 포탑 탄 · 가지 벨트 탄
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
from orders import submit  # noqa: E402

N, E, S, W = 0, 4, 8, 12
LOG = os.path.join(HERE, "..", "state", "wbelt23.log")
MAG = "firearm-magazine"
NET_AT = (-88.5, -41.5)
WHO, WHO_OWNER = "delta", "rebuild23"         # delta 는 rebuild23 몫 - 대기열이 빌 때만 짧게 빌린다

W_GUNS = [(-128, y) for y in (-30, -26, -22, -18, -14, -10, -6)]
GAP_GUNS = {(-116, -1): (-114.5, -0.5, E), (-116, 11): (-114.5, 10.5, E), (-116, 35): (-114.5, 34.5, E),
            (-116, 47): (-114.5, 46.5, E), (-112, 52): (-112.5, 53.5, S), (-107, 52): (-107.5, 53.5, S)}
MOVE_FROM, MOVE_TO, MOVE_ARM = (-115, 5), (-116, 5), (-114.5, 4.5, E)
SPLIT_AT, SPLIT_BELT = (-114.0, -6.5), (-113.5, -6.5)
BRANCH_END_Y = -29.5


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def branch_items():
    out = [("transport-belt", x, -5.5, W) for x in (-114.5, -115.5, -116.5, -117.5)]
    out += [("underground-belt", -118.5, -5.5, W, "input"), ("underground-belt", -121.5, -5.5, W, "output")]
    out += [("transport-belt", x, -5.5, W) for x in (-122.5, -123.5, -124.5)]
    y = -5.5
    while y >= BRANCH_END_Y:
        out.append(("transport-belt", -125.5, y, N))
        y -= 1
    return out


def arm_items():
    out = []
    for x, y in W_GUNS:
        out += [("small-electric-pole", -126.5, y - 0.5, 0), ("inserter", -126.5, y + 0.5, E)]
    out += [("inserter", ax, ay, d) for ax, ay, d in GAP_GUNS.values()]
    return out


# ------------------------------------------------------------------ 게임 읽기

def ghosts(ai, items, dry=False):
    """items: [(name, x, y, dir[, ug_type])] -> 로봇 유령. 선 것 · 이미 유령은 건너뛴다."""
    blob = ";".join("%s,%s,%s,%s,%s" % (t[0], t[1], t[2], t[3] or 0, t[4] if len(t) > 4 else "-") for t in items)
    r = ai.lua("""(function() local s, f, o, dry = game.surfaces[1], game.forces.player, {}, %s
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d, t = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local e = s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1]
        if e then o[#o+1] = bit .. (e.direction == d and " standing" or " WRONGDIR")
        elseif s.find_entities_filtered{ghost_name = n, position = {x, y}, radius = 0.1, force = f}[1] then o[#o+1] = bit .. " ghost"
        elseif s.can_place_entity{name = n, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.manual_ghost} then
          if dry then o[#o+1] = bit .. " ok" else
            local a = {name = 'entity-ghost', inner_name = n, position = {x, y}, direction = d, force = f}
            if t ~= '-' then a.type = t end
            o[#o+1] = bit .. (s.create_entity(a) and " NEW" or " FAIL") end
        else o[#o+1] = bit .. " BLOCKED" end
      end return o end)()""" % ("true" if dry else "false", blob))
    return rows(r)


def tally(res):
    out = {}
    for r in res:
        k = r.rsplit(" ", 1)[1]
        out[k] = out.get(k, 0) + 1
    return out


def turrets(ai, spots):
    blob = ";".join("%s,%s" % xy for xy in spots)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local t = s.find_entities_filtered{name = 'gun-turret', position = {tonumber(x), tonumber(y)}, radius = 0.6, force = 'player'}[1]
        if t then local fed, pw = 0, ''
          for _, i in pairs(s.find_entities_filtered{type = 'inserter', force = 'player', area = {{t.position.x - 3, t.position.y - 3}, {t.position.x + 3, t.position.y + 3}}}) do
            if i.drop_target == t then fed = fed + 1 if i.energy <= 0 then pw = ' nopower' end end end
          o[#o+1] = bit .. ' ammo=' .. t.get_inventory(defines.inventory.turret_ammo).get_item_count() .. ' arm=' .. fed .. pw
        else o[#o+1] = bit .. (s.find_entities_filtered{ghost_name = 'gun-turret', position = {tonumber(x), tonumber(y)}, radius = 0.6}[1] and ' ghost' or ' none') end end
      return o end)()""" % blob)
    return rows(r)


def world(ai):
    return ai.lua("""(function() local s = game.surfaces[1] local net = s.find_logistic_network_by_position({%f, %f}, 'player')
      local o = {} for _, k in pairs({'transport-belt', 'underground-belt', 'splitter', 'inserter', 'small-electric-pole', 'gun-turret', 'firearm-magazine'}) do
        o[k] = net and net.get_item_count(k) or -1 end
      o.bots = net and (net.available_construction_robots .. '/' .. net.all_construction_robots) or '?'
      local near = 0 for _ in pairs(s.find_entities_filtered{force = 'enemy', type = 'unit', area = {{-165, -60}, {-100, 70}}}) do near = near + 1 end
      o.near = near return o end)()""" % NET_AT)


def branch_mags(ai):
    return ai.lua("""(function() local s, n, c = game.surfaces[1], 0, 0 local last = 0
      for _, e in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, area = {{-126, -30}, {-113.6, -5}}}) do
        if e.position.y > -6 or e.position.x < -125 then c = c + 1 local k = 0
          for l = 1, e.get_max_transport_line_index() do k = k + e.get_transport_line(l).get_item_count('%s') end
          n = n + k if e.position.x < -125 and e.position.y < -28 then last = last + k end end end
      return {tiles = c, mags = n, tail = last} end)()""" % MAG)


def report(ai):
    w = world(ai)
    print("  망2", w)
    for r in turrets(ai, W_GUNS + list(GAP_GUNS) + [MOVE_FROM, MOVE_TO]):
        print("   ", r)
    print("  가지 벨트", branch_mags(ai))


# ------------------------------------------------------------------ 짓기

def do_ghosts(ai):
    items = branch_items() + arm_items()
    res = ghosts(ai, items)
    say("서벽급탄 유령: %s %s" % (tally(res), [r for r in res if "BLOCKED" in r or "FAIL" in r or "WRONG" in r][:8]))


def delta_free(ai):
    st = ai.agent(WHO).status()
    return not st.get("current") and not st.get("queued")


def do_splitter(ai):
    w = world(ai)
    low = [r for r in turrets(ai, [(-116, y) for y in (-4, 2, 8, 14, 20, 26, 32, 38, 44, 50)]) if int(r.split("ammo=")[1].split()[0]) < 10]
    if w["near"] or low:
        say("서벽급탄 분배기 보류: 근접 적 %s · 탄<10 %s" % (w["near"], low))
        return
    if not delta_free(ai):
        say("서벽급탄 분배기 보류: delta 대기열 있음")
        return
    bag = ai.agent(WHO).items()
    plan = []
    if int(bag.get("splitter", 0)) < 1:
        circ, belt, iron = int(bag.get("electronic-circuit", 0)), int(bag.get("transport-belt", 0)), int(bag.get("iron-plate", 0))
        need_cu = max(0, 5 - circ) * 2 - int(bag.get("copper-plate", 0))
        if need_cu > 0:
            plan += [("walk_to", {"x": -74.5, "y": -51}), ("take", {"name": "copper-plate", "x": -74.5, "y": -52.5, "count": need_cu})]
        if iron < 10 + max(0, 4 - belt) * 2:
            plan += [("walk_to", {"x": -83.5, "y": -51}), ("take", {"name": "iron-plate", "x": -83.5, "y": -52.5, "count": 30})]
        plan.append(("craft", {"recipe": "splitter", "count": 1, "wait": True}))
    plan += [("walk_to", {"x": -111.5, "y": -7.5}),
             ("demolish", {"x": SPLIT_BELT[0], "y": SPLIT_BELT[1], "name": "transport-belt", "search_radius": 0.3}),
             ("build", {"name": "splitter", "x": SPLIT_AT[0], "y": SPLIT_AT[1], "direction": S}),
             ("walk_to", {"x": -58.5, "y": -78.5})]
    os.environ[detached.ENV] = WHO_OWNER
    ids = submit(ai, WHO, plan, strict=False)
    say("서벽급탄 분배기: delta %d 단계 보냄" % len(plan))
    t0 = time.time()
    while ids and time.time() - t0 < 600:
        time.sleep(3)
        sts = [ai.agent(WHO).poll(i) for i in ids]
        if all(s.get("status") in ("done", "failed", "cancelled", "unknown") for s in sts):
            bad = [(s.get("type"), s.get("error")) for s in sts if s.get("status") in ("failed", "cancelled")]
            say("서벽급탄 분배기 %s %s" % ("완료" if not bad else "실패", bad[:4]))
            break
    r = ai.lua("""(function() local s = game.surfaces[1]
      local sp = s.find_entities_filtered{name = 'splitter', position = {%f, %f}, radius = 0.3}[1]
      local b = s.find_entities_filtered{type = 'transport-belt', position = {%f, %f}, radius = 0.3}[1]
      return {splitter = sp and sp.direction or -1, belt = b and b.direction or -1} end)()""" % (SPLIT_AT + SPLIT_BELT))
    say("서벽급탄 분배기 상태 %s" % r)


def do_move5(ai):
    w = world(ai)
    if w["near"]:
        say("서벽급탄 (-115,5) 옮기기 보류: 근접 적 %s" % w["near"])
        return
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local t = s.find_entities_filtered{name = 'gun-turret', position = {%d, %d}, radius = 0.3, force = f}[1]
      if t and not t.to_be_deconstructed() then t.order_deconstruction(f) return {marked = 1} end
      return {marked = 0, there = t and 1 or 0} end)()""" % MOVE_FROM)
    say("서벽급탄 (-115,5) 해체 표시 %s" % r)
    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(5)
        if not ai.lua("""{n = game.surfaces[1].count_entities_filtered{name = 'gun-turret', position = {%d, %d}, radius = 0.3}}""" % MOVE_FROM)["n"]:
            break
    res = ghosts(ai, [("gun-turret", MOVE_TO[0], MOVE_TO[1], 0), ("inserter",) + MOVE_ARM])
    say("서벽급탄 (-116,5) 유령 %s" % res)


def do_hand(ai):
    """남서 팔 4 는 망 17 (로봇 기지 (-67,28)) 구역인데 그 망에 팔 재고가 없어 유령이 안 선다 -> delta 가 망 2 창고에서 집어 손으로."""
    spots = [v for k, v in GAP_GUNS.items() if k[1] > 30]
    if not delta_free(ai) or detached.owner(WHO):
        say("서벽급탄 손짓기 보류: delta 바쁨/딸림 %s" % detached.owner(WHO))
        return
    ai.lua("""(function() local s, n = game.surfaces[1], 0
      for _, p in pairs({%s}) do for _, g in pairs(s.find_entities_filtered{ghost_name = 'inserter', position = p, radius = 0.3}) do g.destroy() n = n + 1 end end
      return {n = n} end)()""" % ",".join("{%s,%s}" % (x, y) for x, y, _ in spots))
    plan = [("walk_to", {"x": -70.5, "y": -48.5}), ("take", {"name": "inserter", "x": -70.5, "y": -50.5, "count": len(spots)})]  # 망 2 팔 창고
    for x, y, d in spots:
        plan += [("walk_to", {"x": x + 2, "y": y - 1.5}), ("build", {"name": "inserter", "x": x, "y": y, "direction": d})]
    plan.append(("walk_to", {"x": -58.5, "y": -78.5}))
    detached.mark([WHO], "wbelt23", minutes=15)
    try:
        ids = submit(ai, WHO, plan, strict=False)
        t0 = time.time()
        while ids and time.time() - t0 < 600:
            time.sleep(3)
            sts = [ai.agent(WHO).poll(i) for i in ids]
            if all(s.get("status") in ("done", "failed", "cancelled", "unknown") for s in sts):
                bad = [(s.get("type"), s.get("error")) for s in sts if s.get("status") in ("failed", "cancelled")]
                say("서벽급탄 남서 팔 4 손짓기 %s %s" % ("완료" if not bad else "일부 실패", bad[:4]))
                break
    finally:
        detached.release([WHO])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ghosts", action="store_true")
    ap.add_argument("--splitter", action="store_true")
    ap.add_argument("--move5", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--hand", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.ghosts:
        do_ghosts(ai)
    elif a.splitter:
        do_splitter(ai)
    elif a.hand:
        do_hand(ai)
    elif a.move5:
        do_move5(ai)
    elif a.verify:
        report(ai)
    else:
        print("  망2 · 근접 적", world(ai))
        res = ghosts(ai, branch_items() + arm_items(), dry=True)
        print("  유령 점검", tally(res), [r for r in res if not r.endswith(" ok")][:12])
        print("  (-116,5) 자리", ghosts(ai, [("inserter",) + MOVE_ARM], dry=True))
        print("  분배기 자리 벨트", ai.lua("""(function() local b = game.surfaces[1].find_entities_filtered{type = 'transport-belt', position = {%f, %f}, radius = 0.3}[1]
          return {dir = b and b.direction or -1, left_free = game.surfaces[1].count_entities_filtered{position = {-114.5, -6.5}, radius = 0.4} == 0} end)()""" % SPLIT_BELT))
        report(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

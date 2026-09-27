"""철 전초 (-210,-244) 개설 - 23회차. delta 한 명이 원정해 채굴기 10 · 바깥 벨트 · 전봇대 줄 · 포탑 3을 깐다.

    사용자 승인 계획: 대포로 전초 둥지를 치운 뒤 전초를 연다. delta 원정 허가(이번 전초 포함).
    경로는 scripts/ironroute23.py · docs/rebuild-plan-run23.md '## 철 전초 (-210,-244) 경로'.

벨트: 망 재고 0, 철도 모자라 조립기 증설 대신 delta 손제작. 원료 = 기지 동쪽 끝 상자(넘친 철판)
      (9.5,-5.5)·(24.5,-1.5), 구리 (5.5,-5.5). 안쪽 유령 몫(벨트 38 · 지하 6)은 망 창고 (-60.5,-33.5)에 넣어
      로봇이 짓게 하고, 나머지를 들고 나간다.
전력: 기존 망 전봇대 (-105.5,-106.5)에서 작은 전봇대로 벨트 옆을 따라 잇는다 (벽 NW → y=-115.5 → x=-154.5 → y=-245.5).
순서: 전초까지 걸어가 포탑 → 채굴기 → 모음 벨트 · 전봇대 → 바깥 벨트를 전초 쪽부터 벽 쪽으로 (후퇴 방향으로 짓는다).
안전: 체력 < 150 · 30칸 안 적 유닛 · 구간 50칸 안 적 구조물 → 중단 · 귀환. 부활 없음.

    python -u scripts/ironoutpost23.py survey    # 놓을 수 있나 · 장애물 · 전초 둘레 적
    python -u scripts/ironoutpost23.py go        # 전체 (준비 → 원정 → 건설 → 귀환 → 10분 뒤 측정)
    python -u scripts/ironoutpost23.py check     # 현장 확인 + 측정
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import orders  # noqa: E402
import ironroute23 as route23  # noqa: E402

WHO, OWNER = "delta", "ironoutpost23"
LOG = os.path.join(HERE, "..", "state", "ironoutpost23.log")
N, E, S, W = 0, 4, 8, 12
BELT, POLE, DRILL, TUR = "transport-belt", "small-electric-pole", "electric-mining-drill", "gun-turret"
OUTPOST = (-210, -244)
HOME = (-80.5, -45.5)
WAREHOUSE = (-60.5, -33.5)

# 재료
TAKES = [("iron-plate", (9.5, -5.5), 359), ("copper-plate", (5.5, -5.5), 40), ("iron-plate", (24.5, -1.5), 190)]
CRAFTS = [("transport-belt", 145), ("underground-belt", 3), ("gun-turret", 1), ("small-electric-pole", 8)]
NET_TAKES = [(TUR, WAREHOUSE, 1), ("piercing-rounds-magazine", WAREHOUSE, 90),
             (POLE, (-70.5, -50.5), 23), (DRILL, (-88.5, -41.5), 10)]
INSIDE = [(BELT, 38), ("underground-belt", 6)]       # 안쪽 유령 몫 -> 망 창고

# 전초
DRILL_X = [-197.5, -200.5, -203.5, -206.5, -209.5]
DRILLS = [(x, -246.5, S) for x in DRILL_X] + [(x, -242.5, N) for x in DRILL_X]
FEED = [(BELT, x + 0.0, -244.5, E) for x in [-209.5 + i for i in range(15)]]   # -209.5 .. -195.5
TURRETS = [(-213, -246), (-203, -251)]     # 철이 모자라 손제작 1 + 망 1
AMMO_EACH = 40
OUT_POLES = [(-198.5, -248.5), (-204.5, -248.5), (-210.5, -248.5),
             (-198.5, -240.5), (-204.5, -240.5), (-210.5, -240.5)]
# 벨트 옆 전봇대 줄 (벽 -> 전초)
LINE_POLES = ([(-108.5, -110.5), (-110.5, -115.5)] + [(-110.5 - 7 * i, -115.5) for i in range(1, 7)] +
              [(-154.5, -121.5 - 7 * i) for i in range(18)] + [(-154.5, -245.5)] +
              [(-154.5 - 7 * i, -245.5) for i in range(1, 6)] + [(-194.5, -245.5)])

HP_ABORT, UNIT_NEAR, WORM_KEEP, PACK_RADIUS = 150, 30, 50, 40
# 전초까지 걷는 길 (바깥 벨트 줄 옆)
OUT_WALK = [(-112.5, -118.5), (-150.5, -117.5), (-152.5, -160.5), (-152.5, -200.5), (-152.5, -240.5),
            (-190.5, -247.5)]


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def outer_belts():
    """바깥 벨트를 «전초 쪽 -> 벽 쪽» 순서로 (후퇴하며 짓는다)."""
    return list(reversed(route23.outside()))


def build_order():
    """바깥 벨트 + 줄 전봇대를 경로 순서로 섞는다 (전초 -> 벽)."""
    belts = outer_belts()
    out = [("belt", b[1], b[2], b[3]) for b in belts]
    for px, py in LINE_POLES:
        k = min(range(len(out)), key=lambda i: (out[i][1] - px) ** 2 + (out[i][2] - py) ** 2)
        out.insert(k + 1, ("pole", px, py, N))
    return out


def all_spots():
    s = [(DRILL, x, y, d) for x, y, d in DRILLS] + [(BELT, b[1], b[2], b[3]) for b in FEED]
    s += [(TUR, x, y, N) for x, y in TURRETS] + [(POLE, x, y, N) for x, y in OUT_POLES]
    s += [(BELT if k == "belt" else POLE, x, y, d) for k, x, y, d in build_order()]
    return s


SURVEY = """(function() local s, f, o = game.surfaces[1], game.forces.player, {ok = 0, standing = 0, bad = {}, obst = {}}
  for bit in string.gmatch("%s", "[^;]+") do
    local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
    local e = s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1]
    if e then o.standing = o.standing + 1
    elseif s.can_place_entity{name = n, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.manual} then o.ok = o.ok + 1
    else
      local bb = prototypes.entity[n].collision_box
      local area = {{x + bb.left_top.x, y + bb.left_top.y}, {x + bb.right_bottom.x, y + bb.right_bottom.y}}
      local why = 'tile'
      for _, b in pairs(s.find_entities_filtered{area = area}) do
        if b.type ~= 'resource' and b.type ~= 'corpse' and b.type ~= 'item-entity' then
          if (b.type == 'tree' or b.type == 'simple-entity') and b.minable then
            o.obst[#o.obst + 1] = string.format('%%s,%%.2f,%%.2f', b.name, b.position.x, b.position.y) why = 'obst'
          else why = b.name .. '/' .. (b.last_user and b.last_user.name or b.force.name) end
        end end
      o.bad[#o.bad + 1] = bit .. ' ' .. why end
  end
  local c = {spawner = 0, worm = 0, units = 0}
  c.spawner = #s.find_entities_filtered{type = 'unit-spawner', force = 'enemy', position = {%s, %s}, radius = 60}
  c.worm = #s.find_entities_filtered{type = 'turret', force = 'enemy', position = {%s, %s}, radius = 60}
  c.units = #s.find_entities_filtered{type = 'unit', force = 'enemy', position = {%s, %s}, radius = 80}
  o.enemy = c
  return o end)()"""


def survey(ai):
    blob = ";".join("%s,%s,%s,%s" % t for t in all_spots())
    r = ai.lua(SURVEY % ((blob,) + OUTPOST * 3))
    r["bad"], r["obst"] = rows(r.get("bad")), sorted(set(rows(r.get("obst"))))
    return r


THREAT = """(function() local s = game.surfaces[1]
  local seen, n, big, nest = {}, 0, 0, 999
  for _, p in pairs({%s}) do
    for _, e in pairs(s.find_entities_filtered{type = 'unit', force = 'enemy', position = p, radius = %d}) do
      if not seen[e.unit_number] then seen[e.unit_number] = true n = n + 1
        if string.find(e.name, 'big') or string.find(e.name, 'behemoth') then big = big + 1 end end end
    for _, e in pairs(s.find_entities_filtered{type = {'turret', 'unit-spawner'}, force = 'enemy', position = p, radius = %d}) do
      local d = math.sqrt((e.position.x - p[1])^2 + (e.position.y - p[2])^2) if d < nest then nest = d end end
  end
  return {n = n, big = big, nest = nest} end)()"""


def threat(ai, a, b):
    d = math.hypot(b[0] - a[0], b[1] - a[1])
    k = max(1, int(d // 12))
    pts = [(a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k) for i in range(k + 1)]
    return ai.lua(THREAT % (", ".join("{%.1f, %.1f}" % p for p in pts), PACK_RADIUS, WORM_KEEP))


class Abort(RuntimeError):
    pass


def me(ai):
    return ai.agent(WHO).status()


def guard(ai):
    st = me(ai)
    if not st.get("alive", True):
        raise Abort("delta 사망")
    if float(st.get("health", 0)) < HP_ABORT:
        raise Abort(f"체력 {st.get('health')} < {HP_ABORT}")
    n = ai.lua("(function() return {n = #game.surfaces[1].find_entities_filtered{type = 'unit', force = 'enemy', "
               "position = {%.1f, %.1f}, radius = %d}} end)()" % (st["x"], st["y"], UNIT_NEAR))["n"]
    if n and int(n) > 0:
        raise Abort(f"적 유닛 {n} 이 {UNIT_NEAR}칸 안 ({st['x']:.0f},{st['y']:.0f})")
    return st


def idle(st):
    q = st.get("queued")
    return not st.get("current") and not rows(q)


def wait_plan(ai, what, timeout):
    t0 = time.time()
    fled0 = me(ai).get("fled", 0)
    while time.time() - t0 < timeout:
        time.sleep(1.0)
        st = guard(ai)
        if st.get("fled", 0) != fled0:
            raise Abort(f"{what}: jevloop 도망 ({st.get('flee_last', {}).get('by')})")
        if idle(st):
            return st
    log(f"  {what}: {timeout:.0f}s 안에 안 끝남")
    return me(ai)


def walk(ai, points, what, hold_max=600, check=True):
    i, tries = 0, 0
    while i < len(points):
        st = guard(ai) if check else me(ai)
        here, goal = (st["x"], st["y"]), points[i]
        if math.hypot(goal[0] - here[0], goal[1] - here[1]) < 7:
            i, tries = i + 1, 0
            continue
        t = threat(ai, here, goal)
        if t["nest"] < WORM_KEEP:
            raise Abort(f"구간 {here}->{goal} 적 구조물 {t['nest']:.0f}칸")
        if t["n"] >= 5 or t["big"] > 0:
            log(f"  {what}: 구간 {i} 앞 무리 n={t['n']} big={t['big']} - 대기")
            waited = 0
            while waited < hold_max:
                time.sleep(10)
                waited += 10
                t = threat(ai, here, goal)
                if t["n"] < 5 and t["big"] == 0:
                    break
            else:
                raise Abort(f"구간 {i} 무리가 안 비킴")
        tries += 1
        if tries > 4:
            raise Abort(f"구간 {i} {goal} 에 네 번 못 감")
        orders.submit(ai, WHO, [("walk_to", {"x": goal[0], "y": goal[1], "tolerance": 2})], strict=False)
        st = wait_plan(ai, f"{what} 구간 {i}", 240)
        log(f"  {what}: 구간 {i} -> ({st['x']:.0f},{st['y']:.0f}) hp {st.get('health')}")


def run(ai, steps, what, timeout):
    for k in range(0, len(steps), 60):
        orders.submit(ai, WHO, steps[k:k + 60], strict=False)
        st = wait_plan(ai, what, timeout)
    log(f"  {what}: 끝 ({st['x']:.0f},{st['y']:.0f}) hp {st.get('health')}")
    return st


def bstep(name, x, y, d):
    return ("build", {"name": name, "x": x, "y": y, "direction": d})


def clear_steps(obst, box):
    """box 안 장애물(나무·바위) 치우기."""
    (x0, y0), (x1, y1) = box
    out = []
    for o in obst:
        n, x, y = o.split(",")
        x, y = float(x), float(y)
        if x0 <= x <= x1 and y0 <= y <= y1:
            out.append(("demolish", {"name": n, "x": x, "y": y, "search_radius": 0.6}))
    return out


MEASURE = """(function() local s, f = game.surfaces[1], game.forces.player
  local P = f.get_item_production_statistics(s)
  local function c(n, cat) return P.get_flow_count{name = n, category = cat,
     precision_index = defines.flow_precision_index.ten_minutes, count = true} end
  local d = {}
  for _, e in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-212, -249}, {-195, -240}}}) do
    d[#d + 1] = e.status end
  local function ore_on(pts) local n = 0
    for _, p in pairs(pts) do for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, position = p, radius = 0.1}) do
      for i = 1, b.get_max_transport_line_index() do n = n + b.get_transport_line(i).get_item_count('iron-ore') end end end
    return n end
  return {made = c('iron-ore', 'input'), used = c('iron-ore', 'output'), drills = d, tick = game.tick,
          head = ore_on({{-194.5, -244.5}, {-160.5, -244.5}}), mid = ore_on({{-155.5, -180.5}, {-130.5, -114.5}}),
          wall = ore_on({{-112.5, -109.5}, {-112.5, -80.5}, {-112.5, -50.5}}),
          merge = ore_on({{-100.5, -43.5}, {-90.5, -43.5}, {-86.5, -43.5}, {-85.5, -43.5}})}
end)()"""


def measure(ai, tag):
    r = ai.lua(MEASURE)
    st = {}
    for v in rows(r.get("drills")):
        st[v] = st.get(v, 0) + 1
    log(f"측정[{tag}] tick {r['tick']}: 철광석 10분 생산 {r['made']:.0f} (={r['made'] / 600:.2f}/s) 소비 {r['used']:.0f}; "
        f"전초 채굴기 status {st}; 벨트 위 광석 머리 {r['head']} 중간 {r['mid']} 벽안 {r['wall']} 합류 {r['merge']}")
    return r


def outpost_ok(ai):
    return ai.lua(MEASURE)


def go(ai, settle, skip_raw=False):
    sv = survey(ai)
    en = sv["enemy"]
    log(f"사전: 전초 60칸 산란기 {en['spawner']} 땅벌레 {en['worm']}, 80칸 유닛 {en['units']}; 놓기 ok {sv['ok']} "
        f"서 있음 {sv['standing']} 막힘 {len(sv['bad'])} 장애물 {len(sv['obst'])}")
    if en["spawner"] or en["worm"]:
        log("전초 둘레 적 구조물 남음 - 출정 안 함")
        return 1
    hard = [b for b in sv["bad"] if not b.endswith(" obst")]
    if hard:
        log(f"막힌 자리 {hard[:10]} - 출정 안 함")
        return 1
    obst = sv["obst"]
    detached.mark([WHO], owner=OWNER, minutes=90)
    ai.agent(WHO).cancel()
    before = measure(ai, "전")
    try:
        # 1. 재료 · 제작 (걸으며 병렬 제작)
        prep = [] if skip_raw else [("take", {"name": n, "x": p[0], "y": p[1], "count": c}) for n, p, c in TAKES]
        prep += [] if skip_raw else [("craft", {"recipe": r, "count": c}) for r, c in CRAFTS]
        prep += [("take", {"name": n, "x": p[0], "y": p[1], "count": c}) for n, p, c in NET_TAKES]
        prep += [("insert", {"name": n, "x": WAREHOUSE[0], "y": WAREHOUSE[1], "count": c}) for n, c in INSIDE]
        run(ai, prep, "준비", 600)
        inv = ai.agent(WHO).items()
        log("  가방: " + str({k: inv.get(k, 0) for k in (BELT, "underground-belt", POLE, DRILL, TUR,
                                                          "piercing-rounds-magazine", "iron-plate", "copper-plate")}))
        need_belt = len(FEED) + len(route23.outside())
        if inv.get(BELT, 0) < need_belt or inv.get(DRILL, 0) < len(DRILLS) or inv.get(TUR, 0) < len(TURRETS):
            log(f"  재료 모자람 (벨트 {inv.get(BELT, 0)}/{need_belt}) - 가진 만큼 진행")

        # 2. 원정
        walk(ai, OUT_WALK, "출정")

        # 3. 전초: 포탑 -> 장애물 -> 채굴기 -> 모음 벨트 -> 전봇대
        steps = []
        for x, y in TURRETS:
            steps += [bstep(TUR, x, y, N),
                      ("insert", {"name": "piercing-rounds-magazine", "x": x, "y": y, "count": AMMO_EACH})]
        steps += clear_steps(obst, ((-216, -254), (-193, -238)))
        steps += [bstep(DRILL, x, y, d) for x, y, d in DRILLS]
        steps += [bstep(BELT, x, y, d) for _, x, y, d in FEED]
        steps += [bstep(POLE, x, y, N) for x, y in OUT_POLES]
        run(ai, steps, "전초", 600)

        # 4. 바깥 벨트 + 전봇대 줄: 전초 쪽부터 벽 쪽으로
        order = build_order()
        chunk = []
        for k, x, y, d in order:
            chunk += clear_steps(obst, ((x - 1.6, y - 1.6), (x + 1.6, y + 1.6)))
            chunk.append(bstep(BELT if k == "belt" else POLE, x, y, d))
            if len(chunk) >= 40:
                run(ai, chunk, f"바깥 ({x:.0f},{y:.0f})", 400)
                chunk = []
        if chunk:
            run(ai, chunk, "바깥 끝", 400)
        # 빠진 칸 한 번 더
        sv2 = survey(ai)
        missing = [b for b in all_spots()]
        if sv2["ok"]:
            log(f"  빠진 칸 {sv2['ok']} - 재시도")
            again = []
            left = ai.lua(SURVEY.replace("o.ok = o.ok + 1", "o.ok = o.ok + 1 o.bad[#o.bad + 1] = bit .. ' todo'") % (
                (";".join("%s,%s,%s,%s" % t for t in missing),) + OUTPOST * 3))
            for b in rows(left.get("bad")):
                if b.endswith(" todo"):
                    n, x, y, d = b.split(" ")[0].split(",")
                    again.append(bstep(n, float(x), float(y), int(float(d))))
            run(ai, again, "재시도", 600)
    except Abort as e:
        log(f"중단: {e}")
        if not me(ai).get("alive", True):
            log("delta 사망 - 부활하지 않음. 기록만.")
            detached.release([WHO])
            return 2
    except Exception as e:  # noqa: BLE001
        log(f"오류: {type(e).__name__}: {e}")

    # 5. 귀환
    try:
        st = me(ai)
        back = [(-112.5, -118.5), HOME] if st["y"] < -112 else [HOME]
        if st["x"] < -150 and st["y"] < -120:
            back = [(-152.5, st["y"]), (-150.5, -117.5)] + back
        walk(ai, back, "귀환", hold_max=900, check=False)
        log(f"귀환 완료 ({me(ai)['x']:.0f},{me(ai)['y']:.0f}) hp {me(ai).get('health')}")
    except Exception as e:  # noqa: BLE001
        log(f"귀환 문제: {type(e).__name__}: {e}")
    finally:
        detached.release([WHO])

    sv = survey(ai)
    log(f"현장: 서 있음 {sv['standing']}/{len(all_spots())}, 빈 칸 {sv['ok']}, 막힘 {sv['bad'][:8]}")
    measure(ai, "직후")
    if settle > 0:
        time.sleep(settle)
        after = measure(ai, f"{settle:.0f}s 뒤")
        log(f"전후 철광석 10분 생산 {before['made']:.0f} -> {after['made']:.0f}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["survey", "go", "check"])
    ap.add_argument("--settle", type=float, default=600)
    ap.add_argument("--skip-raw", action="store_true", help="철·구리 가져오기와 제작 주문은 이미 됨")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "survey":
        sv = survey(ai)
        log(f"survey: enemy {sv['enemy']} ok {sv['ok']} standing {sv['standing']} bad {len(sv['bad'])} "
            f"obst {len(sv['obst'])} poles {len(LINE_POLES) + len(OUT_POLES)} belts {len(FEED) + len(route23.outside())}")
        for b in sv["bad"]:
            log("  " + b)
        return 0
    if a.cmd == "check":
        sv = survey(ai)
        log(f"현장: 서 있음 {sv['standing']}/{len(all_spots())}, 빈 칸 {sv['ok']}, 막힘 {sv['bad'][:8]}")
        measure(ai, "check")
        return 0
    return go(ai, a.settle, a.skip_raw)


if __name__ == "__main__":
    raise SystemExit(main())

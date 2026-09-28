"""P2 구리 ×2 (09-28 21:5x, docs/rocket-plan-run23.md «P2 구리 조사» 재개) - 둘째 화로 기둥 + 동쪽 채굴기 18.

실측 (tick 21.76M): 전초 채굴기 16 · 강철로 16 = 10/s 상한 (10분 구리판 ~5,770). 판 벨트 x=47.5 노랑 한 줄 -> 노란 분배기 (47,-327.5)
(오른 입력만 씀) -> 기존 벨트 + 두 번째 반입 벨트 (platein23). 광석 기둥 x=42.5 는 막다른 끝.
설계 (빨강 없이):
    채굴기  동쪽 광맥 벨트 x=70.5 (남향) 양옆 9 + 9 (68.5 동향 · 72.5 서향, y -424.5..-400.5), 서쪽 줄은 기존 전봇대 x=66.5 (+2),
            동쪽 줄은 전봇대 x=74.5 (둘레 (73.5,-432.5) 에서) 6 (처음 5 였다 - -404.5 전봇대 공급 칸이 y=-402 에서 끝나 (72.5,-400.5) 채굴기 no_power). 18 x 0.6 = 10.8/s.
    광석    x=70.5 -> y=-391.5 서향 (기존 광석 벨트 x=47.5 는 노란 지하 한 쌍으로 건넘) -> x=36.5 남향 -> 둘째 기둥 광석 줄 (막다른 끝).
    둘째 기둥  첫 기둥과 같은 모양, 6 칸 서쪽: 광석 36.5 · 입력 팔 37.5 · 강철로 39.0 · 출력 팔 40.5 · 판 벨트 41.5, 화로 18 (y -366..-332).
    판      x=41.5 남향 -> y=-328.5 동향 (42.5..45.5) -> (46.5,-328.5) 남향 = 분배기 왼 입력. 분배기가 두 입력 (10 + 11.25/s) 을
            두 출력 (각 노랑 15/s) 으로 나눈다 -> 노란 분배기 15/s 상한이 풀린다.
            그 전에 첫 기둥 광석 줄 끝 (42.5,-329.5) 을 동향으로 돌린다 (운전 조작) - 안 돌리면 광석이 새 판 벨트에 옆치기로 섞인다.
짓기는 foxtrot · hotel 두 사람만 (outpostcrew23 방식 가방 옮김 + 계획), 재료는 망 2 저장. 체력 절반 밑이면 즉시 귀환.
연료는 smeltcol23 run (CU2_FURN 추가).

    python -u scripts/cu2x23.py watch [--minutes 30]   # 출정 조건 (현장 반경 150 · 통로) 1 분마다
    python -u scripts/cu2x23.py check                  # 칸 검사 (드라이런)
    python -u scripts/cu2x23.py build                  # 두 사람 출정 (돌림 포함)
    python -u scripts/cu2x23.py status                 # 채굴기 · 화로 · 10분 흐름
    python -u scripts/cu2x23.py lanefix                # 판 벨트 x=41.5 두 줄 쓰기 (위 10 화로 몫 -> 서쪽 줄 고리)
로그 state/cu2x23.log
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import orders  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "cu2x23.log")
OWNER = "cu2x23"
CREW = ["foxtrot", "hotel"]
HOME = (-81.0, -43.0)
SITE = (61, -407)
DIRS = {"north": 0, "east": 4, "south": 8, "west": 12}
MAX_STEPS = 50        # 경유점 (route.detour) 이 붙어도 64 안에 집 가는 걸음이 남게
PER_TRIP = 36

# ---------------------------------------------------------------- 배치
DRILL_Y = [-424.5 + 3 * k for k in range(9)]
DRILLS = [("electric-mining-drill", 68.5, y, "east") for y in DRILL_Y] + \
         [("electric-mining-drill", 72.5, y, "west") for y in DRILL_Y]
POLES_E = [("small-electric-pole", 66.5, -422.5, "north"), ("small-electric-pole", 66.5, -416.5, "north")] + \
          [("small-electric-pole", 74.5, y, "north") for y in (-428.5, -422.5, -416.5, -410.5, -404.5, -398.5)]  # -398.5: 마지막 채굴기 (72.5,-400.5) 전력 (09-28 fix)
ORE = [("transport-belt", 70.5, y + 0.5, "south") for y in range(-426, -392)] + \
      [("transport-belt", 70.5, -391.5, "west")] + \
      [("transport-belt", x + 0.5, -391.5, "west") for x in range(69, 48, -1)] + \
      [("underground-belt", 48.5, -391.5, "west", "input"), ("underground-belt", 46.5, -391.5, "west", "output")] + \
      [("transport-belt", x + 0.5, -391.5, "west") for x in range(45, 36, -1)] + \
      [("transport-belt", 36.5, -391.5, "south")] + \
      [("transport-belt", 36.5, y + 0.5, "south") for y in range(-391, -331)]
XR, Y0, N = 41.5, -367.5, 18
CU2_FURN = [(XR - 2.5, Y0 + 1.5 + 2 * i) for i in range(N)]
COL = []
for i in range(N):
    COL.append(("steel-furnace", XR - 2.5, Y0 + 1.5 + 2 * i, "north"))
    COL.append(("inserter", XR - 1, Y0 + 1 + 2 * i, "west"))
    COL.append(("inserter", XR - 4, Y0 + 1 + 2 * i, "west"))
    if i % 2 == 0:
        COL.append(("small-electric-pole", XR - 1, Y0 + 2 + 2 * i, "north"))
        COL.append(("small-electric-pole", XR - 4, Y0 + 2 + 2 * i, "north"))
PLATE = [("transport-belt", XR, y + 0.5, "south") for y in range(-367, -329)] + \
        [("transport-belt", XR, -328.5, "east")] + \
        [("transport-belt", x + 0.5, -328.5, "east") for x in range(42, 46)] + \
        [("transport-belt", 46.5, -328.5, "south")]
ROT = (42.5, -329.5)      # 첫 기둥 광석 줄 끝 - 남향 -> 동향
_UG = next(i for i, b in enumerate(ORE) if len(b) > 4 and b[4] == "output") + 1
EAST = DRILLS + POLES_E + ORE[:_UG]          # 동쪽: 채굴기 · 전봇대 · 광석 벨트 x=70.5 + 가로줄 (지하까지)
WEST = ORE[_UG:] + COL + PLATE               # 서쪽: 가로줄 나머지 · x=36.5 · 둘째 기둥 · 판 벨트
BACK = ("electric-mining-drill", "small-electric-pole", "transport-belt", "underground-belt", "fast-underground-belt", "steel-furnace", "inserter",
        "wood", "coal", "copper-ore", "copper-plate", "stone")


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def T(v):
    if isinstance(v, dict) and v and all(k.isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v if v else []


def half(name):
    return {"electric-mining-drill": 1.45, "steel-furnace": 0.95}.get(name, 0.45)


# ---------------------------------------------------------------- 출정 조건
CORRIDOR = [(10, -80), (56, -127), (56, -175), (56, -222), (58, -271), (56, -320), (56, -366)]
WATCH = """(function() local s = game.surfaces[1] local o = {}
  local function c(p, r) return {s.count_entities_filtered{position = p, radius = r, force = 'enemy', type = {'unit-spawner', 'turret'}},
                                 s.count_entities_filtered{position = p, radius = r, force = 'enemy', type = 'unit'}} end
  o.site = c({%d, %d}, 150)
  local st, un = 0, 0 for _, p in pairs({%s}) do local v = c(p, 60) st = st + v[1] un = un + v[2] end o.path = {st, un}
  local k = 0 for _, t in pairs(s.find_entities_filtered{area = {{30, -440}, {95, -320}}, type = {'ammo-turret', 'electric-turret'}, force = 'player'}) do k = k + (t.kills or 0) end
  o.kills = k o.tick = game.tick return o end)()"""


def watch_once(ai):
    r = ai.lua(WATCH % (SITE[0], SITE[1], ", ".join("{%d, %d}" % p for p in CORRIDOR)))
    return {"site": T(r.get("site")), "path": T(r.get("path")), "kills": r.get("kills"), "tick": r.get("tick")}


UNITS = """(function() local s = game.surfaces[1] local g = {}
  for _, u in pairs(s.find_entities_filtered{position = {%d, %d}, radius = 150, force = 'enemy', type = {'unit', 'unit-spawner', 'turret'}}) do
    local k = math.floor(u.position.x / 32) * 32 .. ',' .. math.floor(u.position.y / 32) * 32 .. (u.type == 'unit' and '' or ' ' .. u.name)
    g[k] = (g[k] or 0) + 1 end return g end)()"""


def watch(ai, minutes, need=None):
    """need (분) 이 주어지면 조건이 need 분 이어지는 순간 True 로 끝낸다. 불통과면 무리 위치 (32 칸 칸) 도 적는다."""
    t0 = time.time()
    ok_since = None
    k0 = None
    while time.time() - t0 < minutes * 60 + 5:
        w = watch_once(ai)
        k0 = w["kills"] if k0 is None else k0
        good = w["site"][0] == 0 and w["site"][1] <= 2 and w["path"][0] == 0 and w["path"][1] <= 2
        ok_since = (ok_since or time.time()) if good else None
        log("감시 현장 r150 구조물/유닛 %s · 통로 %s · 전초 포탑 처치 %s (+%d) · %s" % (
            w["site"], w["path"], w["kills"], w["kills"] - k0, "통과 %.0f 분" % ((time.time() - ok_since) / 60) if ok_since else "불통과"))
        if sum(w["site"]) > 0:
            log("  무리 (32칸 좌상단: 수) %s" % ai.lua(UNITS % SITE))
        if need and ok_since and time.time() - ok_since >= need * 60:
            log("조건 %d 분 유지 - 통과" % need)
            return True
        time.sleep(60)
    return ok_since is not None and not need


# ---------------------------------------------------------------- 검사
CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, tree = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then o.ok = o.ok + 1
    else local why, onlytree = '', true local h = t[5]
      for _, x in pairs(s.find_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}}) do
        if x.type ~= 'resource' then why = why .. x.name .. ' ' if not (x.type == 'tree' or x.type == 'simple-entity') then onlytree = false end end end
      if onlytree and why ~= '' then o.tree = o.tree + 1 else o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
    end
  end return o end)()"""


def rows(builds):
    return ", ".join("{'%s', %s, %s, %d, %s}" % (b[0], b[1], b[2], DIRS[b[3]], half(b[0])) for b in builds)


def check(ai):
    for label, part in (("동쪽", EAST), ("서쪽", WEST)):
        tot = {"ok": 0, "have": 0, "tree": 0, "bad": []}
        for k in range(0, len(part), 100):
            r = ai.lua(CHECK % rows(part[k:k + 100]))
            for f in ("ok", "have", "tree"):
                tot[f] += r.get(f, 0)
            tot["bad"] += T(r.get("bad"))
        cnt = {}
        for b in part:
            cnt[b[0]] = cnt.get(b[0], 0) + 1
        log("%s 칸 %d %s -> 있음 %d · 가능 %d · 나무만 %d · 막힘 %s" % (label, len(part), cnt, tot["have"], tot["ok"], tot["tree"], tot["bad"]))
    r = ai.lua("""(function() local s = game.surfaces[1]
      local b = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
      local nx = s.find_entities_filtered{position = {%s, %s}, radius = 0.4}
      local n = {} for _, e in pairs(nx) do if e.type ~= 'resource' then n[#n + 1] = e.name end end
      return {dir = b and b.direction or -1, east_tile = n} end)()""" % (ROT[0], ROT[1], ROT[0] + 1, ROT[1]))
    log("돌릴 칸 %s %s" % (ROT, r))


# ---------------------------------------------------------------- 짓기
TREES = """(function() local s = game.surfaces[1] local o = {}
  for i, t in pairs({%s}) do local h = t[5]
    for _, e in pairs(s.find_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}, type = {'tree', 'simple-entity'}}) do
      o[#o + 1] = {e.position.x, e.position.y} end end
  return o end)()"""


def chops(ai, builds):
    if not builds:
        return []
    seen, out = set(), []
    for k in range(0, len(builds), 100):
        for t in T(ai.lua(TREES % rows(builds[k:k + 100]))):
            key = (round(t[0], 1), round(t[1], 1))
            if key not in seen:
                seen.add(key)
                out.append(("chop", {"x": t[0], "y": t[1], "count": 1}))
    return out


PRESENT = """(function() local s = game.surfaces[1] local o = {}
  for i, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    o[i] = e and 1 or 0 end return o end)()"""


def missing(ai, builds):
    out = []
    for k in range(0, len(builds), 120):
        ch = builds[k:k + 120]
        r = ai.lua(PRESENT % rows(ch))
        v = [r.get(str(i + 1)) for i in range(len(ch))] if isinstance(r, dict) else list(r)
        out += [b for b, f in zip(ch, v) if not f]
    return out


def load_bag(ai, who, need):
    from proboport23 import BODY
    src = """(function() @BODY@
      local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
      local m = b.get_main_inventory() local o = {bag = {}}
      local net = s.find_logistic_network_by_position({-24, -88}, 'player')
      for n, k in pairs({%s}) do
        local have = m.get_item_count(n)
        if have < k then
          local can = math.min(k - have, net.get_item_count(n), m.get_insertable_count(n))
          if can > 0 then local got = net.remove_item{name = n, count = can}
            if got > 0 then local put = m.insert{name = n, count = got} if put < got then net.insert({name = n, count = got - put}, 'storage') end end end end
        o.bag[n] = m.get_item_count(n)
      end return o end)()""".replace("@BODY@", BODY) % (who, ", ".join("['%s'] = %d" % kv for kv in need.items()))
    return ai.lua(src)


def unload(ai, who):
    from proboport23 import BODY
    src = """(function() @BODY@
      local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
      local m = b.get_main_inventory() local o = {}
      local net = s.find_logistic_network_by_position({-24, -88}, 'player')
      for _, n in pairs({%s}) do local k = m.get_item_count(n)
        if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
      return o end)()""".replace("@BODY@", BODY) % (who, ", ".join("'%s'" % n for n in BACK))
    return ai.lua(src)


def order_path(builds, start):
    left, out = list(builds), []
    cx, cy = start
    while left:
        i = min(range(len(left)), key=lambda k: (left[k][1] - cx) ** 2 + (left[k][2] - cy) ** 2)
        b = left.pop(i)
        out.append(b)
        cx, cy = b[1], b[2]
    return out


def trip(ai, builds, entry):
    """한 사람 한 파 몫: (단계, 필요) - 나무 베기 먼저, 벨트는 흐름 방향 순서 유지 (가까운 것 순서는 채굴기 · 화로 · 팔 · 전봇대만)."""
    pre = chops(ai, builds)
    belts = [b for b in builds if b[0] in ("transport-belt", "underground-belt")]
    other = order_path([b for b in builds if b not in belts], entry)
    steps = [("walk_to", {"x": entry[0], "y": entry[1]})] + pre
    need = {}
    for b in other + belts:
        p = {"name": b[0], "x": b[1], "y": b[2], "direction": DIRS[b[3]]}
        if len(b) > 4:
            p["type"] = b[4]
        steps.append(("build", p))
        need[b[0]] = need.get(b[0], 0) + 1
    steps.append(("walk_to", {"x": HOME[0], "y": HOME[1]}))
    return steps, need


def chunks(builds, per):
    out, cur = [], []
    for b in builds:
        cur.append(b)
        if len(cur) >= per:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


LIVE_HP = 125


def hp_guard(ai, sent):
    """체력 절반 (125) 밑이면 하던 일 끊고 집으로. 반환: 아직 일하는 사람."""
    live = {c["name"]: c for c in ai.list()}
    still = []
    for w in sent:
        c = live.get(w)
        if not c or not c.get("alive"):
            log("%s 사망 - 부활 안 함 (위치 %s)" % (w, (c or {}).get("x")))
            continue
        if float(c.get("health") or 0) < LIVE_HP:
            log("%s 체력 %s < %d - 즉시 귀환" % (w, c.get("health"), LIVE_HP))
            try:
                ai.agent(w).cancel()
                orders.submit(ai, w, [("walk_to", {"x": HOME[0], "y": HOME[1]})], strict=False)
            except Exception as e:  # noqa: BLE001
                log("귀환 지시 실패 %s" % e)
            continue
        if c.get("current") or c.get("queued"):
            still.append(w)
    return still


def rotate(ai):
    r = ai.lua("""(function() local s = game.surfaces[1]
      local b = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
      if not b then return {err = 'no belt'} end
      for _, e in pairs(s.find_entities_filtered{position = {%s, %s}, radius = 0.4}) do
        if e.type ~= 'resource' then return {err = 'east tile busy ' .. e.name} end end
      if b.direction ~= defines.direction.east then b.direction = defines.direction.east return {rotated = true} end
      return {already = true} end)()""" % (ROT[0], ROT[1], ROT[0] + 1, ROT[1]))
    log("첫 기둥 광석 줄 끝 %s 동향 %s" % (ROT, r))
    return not r.get("err")


def build(ai, rounds=10):
    if not rotate(ai):
        return False
    w = watch_once(ai)
    if not (w["site"][0] == 0 and w["site"][1] <= 2 and w["path"][0] == 0 and w["path"][1] <= 2):
        log("출정 조건 불통과 %s - 보류" % w)
        return False
    os.environ[detached.ENV] = OWNER
    for rnd in range(rounds):
        todo_e, todo_w = missing(ai, EAST), missing(ai, WEST)
        if not todo_e and not todo_w:
            log("모두 섬 (동 %d · 서 %d)" % (len(EAST), len(WEST)))
            return True
        live = {c["name"]: c for c in ai.list()}
        crew = [c for c in CREW if live.get(c, {}).get("alive") and float(live[c].get("health") or 0) >= LIVE_HP]
        if len(crew) < 2:
            log("두 사람이 아니다 (%s) - 출정 안 함" % crew)
            return False
        w = watch_once(ai)
        if w["site"][0] or w["site"][1] > 2 or w["path"][0] or w["path"][1] > 2:
            log("%d 파 전 조건 불통과 %s - 멈춤" % (rnd + 1, w))
            return False
        # 파: 동쪽 몫 · 서쪽 몫을 한 사람씩 (둘이 같은 때 현장에 있게)
        jobs = []
        for part, entry in ((todo_e, (66.5, -392.5)), (todo_w, (38.5, -350.5))):
            if part:
                jobs.append((chunks(part, PER_TRIP)[0], entry))
        if len(jobs) == 1 and len(todo_e or todo_w) > PER_TRIP:
            part, entry = (todo_e, (66.5, -392.5)) if todo_e else (todo_w, (38.5, -350.5))
            ch = chunks(part, PER_TRIP)
            jobs = [(ch[0], entry), (ch[1], entry)]
        detached.mark(crew, OWNER, minutes=40)
        sent = []
        for who, (bs, entry) in zip(crew, jobs):
            steps, need = trip(ai, bs, entry)
            while len(steps) > MAX_STEPS and len(bs) > 5:
                bs = bs[:-5]
                steps, need = trip(ai, bs, entry)
            bag = load_bag(ai, who, need).get("bag") or {}
            if any(int(bag.get(k, 0)) < v for k, v in need.items()):
                log("%s 가방 부족 %s / 필요 %s" % (who, bag, need))
                continue
            orders.submit(ai, who, steps, strict=False)
            sent.append(who)
            log("%d 파 %s 출발: 짓기 %d · 단계 %d · 가방 %s" % (rnd + 1, who, len(bs), len(steps), need))
        t0 = time.time()
        while sent and time.time() - t0 < 1500:
            time.sleep(10)
            if not hp_guard(ai, sent):
                break
        for who in sent:
            log("%s 귀환 · 가방 -> 망 %s" % (who, unload(ai, who)))
        detached.release(crew)
    left = missing(ai, EAST + WEST)
    log("끝: 빠진 것 %d %s" % (len(left), left[:6]))
    return not left


# ---------------------------------------------------------------- 고침 (09-28 23:4x) 판 벨트 두 줄
# 판 벨트 x=41.5 는 출력 팔 18 이 모두 먼 줄 (동쪽) 에만 놓아 한 줄 7.5/s 에 묶였다 (18 x 0.625 = 11.25/s) -> 남쪽 화로 8 full_output.
# 팔 놓는 자리는 못 바꾼다 (allow_custom_vectors 꺼짐). 첫 기둥 (49.5,-345.5) 줄 바꿈처럼 윗 몫을 서쪽 줄로 옮긴다:
#   위 10 칸 (41.5, -366.5..-348.5) 북향 -> (41.5,-367.5) 서향 -> 빠른 지하 (37.5 -> 35.5) 로 광석 줄 x=36.5 건넘 ->
#   x=34.5 남향 -> (34.5,-347.5) 동향 -> 빠른 지하 (35.5 -> 40.5, 광석 줄 · 화로 밑) -> (41.5,-347.5) 서쪽 줄.
#   위 화로 10 (6.25/s) 서쪽 줄 + 아래 8 (5/s) 동쪽 줄. 재료는 망에 있는 것만 (빠른 지하 4 · 노랑 25).
SPLIT_Y = -348.5
LOOP = [("transport-belt", XR, -367.5, "west")] +        [("transport-belt", x + 0.5, -367.5, "west") for x in (40, 39, 38)] +        [("fast-underground-belt", 37.5, -367.5, "west", "input"), ("fast-underground-belt", 35.5, -367.5, "west", "output")] +        [("transport-belt", 34.5, -367.5, "south")] +        [("transport-belt", 34.5, y + 0.5, "south") for y in range(-367, -348)] +        [("transport-belt", 34.5, -347.5, "east")] +        [("fast-underground-belt", 35.5, -347.5, "east", "input"), ("fast-underground-belt", 40.5, -347.5, "east", "output")]
UP = [(XR, y + 0.5) for y in range(-367, -348)]       # 북향으로 돌릴 판 벨트 10 칸 (-366.5 .. -348.5)


def lanefix(ai):
    if not missing(ai, LOOP):
        log("줄 바꿈 고리 이미 있음")
    else:
        w = watch_once(ai)
        if w["site"][0] or w["site"][1] > 2 or w["path"][0] or w["path"][1] > 2:
            log("출정 조건 불통과 %s - 보류" % w)
            return False
        live = {c["name"]: c for c in ai.list()}
        who = next((c for c in CREW if live.get(c, {}).get("alive") and float(live[c].get("health") or 0) >= LIVE_HP), None)
        if not who:
            log("나갈 사람 없음")
            return False
        os.environ[detached.ENV] = OWNER
        detached.mark([who], OWNER, minutes=30)
        todo = missing(ai, LOOP)
        steps, need = trip(ai, todo, (35.0, -357.5))
        bag = load_bag(ai, who, need).get("bag") or {}
        if any(int(bag.get(k, 0)) < v for k, v in need.items()):
            log("%s 가방 부족 %s / 필요 %s" % (who, bag, need))
            log("%s 가방 -> 망 %s" % (who, unload(ai, who)))
            detached.release([who])
            return False
        orders.submit(ai, who, steps, strict=False)
        log("줄 바꿈 %s 출발: 짓기 %d · 단계 %d · 가방 %s" % (who, len(todo), len(steps), need))
        sent, t0 = [who], time.time()
        while sent and time.time() - t0 < 1500:
            time.sleep(10)
            if not hp_guard(ai, sent):
                break
        log("%s 귀환 · 가방 -> 망 %s" % (who, unload(ai, who)))
        detached.release([who])
        left = missing(ai, LOOP)
        if left:
            log("고리 빠짐 %d %s - 돌리지 않음" % (len(left), left[:4]))
            return False
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {n = 0, miss = 0}
      for _, p in pairs({%s}) do local b = s.find_entities_filtered{type = 'transport-belt', position = p, radius = 0.3}[1]
        if not b then o.miss = o.miss + 1 elseif b.direction ~= defines.direction.north then b.direction = defines.direction.north o.n = o.n + 1 end end
      return o end)()""" % ", ".join("{%s, %s}" % p for p in UP))
    log("판 벨트 위 10 칸 북향 %s" % r)
    return not r.get("miss")


# ---------------------------------------------------------------- 상태
STATUS = """(function() local s = game.surfaces[1] local o = {drill = {}, furn = {}}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, t in pairs({%s}) do local e = s.find_entities_filtered{name = 'electric-mining-drill', position = t, radius = 0.3}[1]
    local k = e and st[e.status] or 'none' o.drill[k] = (o.drill[k] or 0) + 1 end
  for _, t in pairs({%s}) do local e = s.find_entities_filtered{type = 'furnace', position = t, radius = 0.3}[1]
    local k = e and st[e.status] or 'none' o.furn[k] = (o.furn[k] or 0) + 1 end
  local c1 = {} for _, e in pairs(s.find_entities_filtered{type = 'furnace', area = {{43, -362}, {47, -328}}}) do local k = st[e.status] c1[k] = (c1[k] or 0) + 1 end
  o.col1 = c1
  local net = s.find_logistic_network_by_position({-24, -88}, 'player') o.net_cu = net.get_item_count('copper-plate')
  local stt = game.forces.player.get_item_production_statistics(s) local p = defines.flow_precision_index.ten_minutes
  local function f(n, c) return math.floor(stt.get_flow_count{name = n, category = c, precision_index = p, count = true}) end
  o.cu_ore = {f('copper-ore', 'input'), f('copper-ore', 'output')} o.cu_plate = {f('copper-plate', 'input'), f('copper-plate', 'output')}
  o.lds = {f('low-density-structure', 'input'), f('low-density-structure', 'output')}  -- input = 생산
  local l = {} for _, a in pairs(s.find_entities_filtered{type = 'assembling-machine'}) do local r = a.get_recipe()
    if r and r.name == 'low-density-structure' then local k = st[a.status] l[k] = (l[k] or 0) + 1 end end o.lds_asm = l
  o.tick = game.tick return o end)()"""


def status(ai):
    r = ai.lua(STATUS % (", ".join("{%s, %s}" % (b[1], b[2]) for b in DRILLS), ", ".join("{%s, %s}" % p for p in CU2_FURN)))
    log("상태 새 채굴기 %s · 둘째 기둥 %s · 첫 기둥 %s · 망 구리 %s · 10분 구리광 (생산 %s · 소비 %s) · 구리판 (생산 %s · 소비 %s) · 저밀도 (생산, 소비) %s 조립기 %s" % (
        r.get("drill"), r.get("furn"), r.get("col1"), r.get("net_cu"), T(r.get("cu_ore"))[0], T(r.get("cu_ore"))[1],
        T(r.get("cu_plate"))[0], T(r.get("cu_plate"))[1], T(r.get("lds")), r.get("lds_asm")))
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["watch", "check", "build", "status", "rotate", "lanefix"])
    ap.add_argument("--minutes", type=float, default=30)
    ap.add_argument("--need", type=float, default=None, help="watch: 이 분 수만큼 이어지면 끝 (종료 코드 0, 못 채우면 3)")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "watch":
        ok = watch(ai, a.minutes, a.need)
        if a.need:
            return 0 if ok else 3
    elif a.cmd == "check":
        check(ai)
    elif a.cmd == "build":
        build(ai)
    elif a.cmd == "rotate":
        rotate(ai)
    elif a.cmd == "lanefix":
        lanefix(ai)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

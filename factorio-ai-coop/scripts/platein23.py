"""전초 두 번째 판 반입 벨트 (09-28 15:0x, 사용자 «추가 채굴지에서 1 줄로만 반입 - 여러 줄로 늘려 병목 개선»).

실측 (14:37, tick ~19.9M):
  철  판 벨트 x=-155.5 (노랑) 한 줄. 화로 9/9 레인 바꿈 고리 (feupgrade23) 로 두 레인. 기지 끝은 벽 안 x=-112.5 -> y=-43.5
      (Guiltyring 분배기 2 로 p27 화로 가지) -> 트렁크 -> 조립 줄 끝 (-51.5,0.5) 막다른 끝. 판이 꽉 참 (망 철 16,043 > FILTER 상한 16,000).
  구리 판 벨트 x=47.5 (노랑) 한 줄, 출력 팔 16 이 전부 같은 쪽에서 놓아 **레인 1 하나** (L2 = 0) = 7.5/s 상한
      < 강철로 16 × 0.625 = 10/s. 기지 끝 y=-100.5 막다른 끝에서 smeltcol23 tail 이 망으로 (상한 5000).
고침:
  cu 고리  구리 기둥 가운데 (화로 7/8 사이, y=-345.5) 레인 바꿈 고리 (feupgrade23 철과 같은 모양) -> 위 8 화로 판이 다른 레인. 기둥 15/s.
  분배기   전초 판 벨트 끝 (철: 판 화로 끝 · 강철 화로 위 y=-201.5 / 구리: 기둥 끝 y=-327.5) 의 벨트 한 칸을 분배기로 바꿈.
           한쪽 = 기존 벨트, 다른 쪽 = 새 노란 벨트 (두 레인 그대로). 철은 강철 화로보다 위에서 나눠 새 벨트엔 강철이 없다.
  새 벨트  A* (타일 격자: 빈 칸 · 나무만, 기존 벨트 출력 칸 · 팔 집기/놓기 칸 금지, 지하 ≤5) 로
           철 -> fe-x33 머리 (-33.5,-44.5) 바로 위 (-33.5,-45.5) 남향, 구리 -> cu-x63 머리 (-63.5,-69.5) 바로 위 (-63.5,-70.5) 남향
           (state/platebus_heads.json connect_upstream). platebus23 는 빈 자리만 채우므로 벨트가 차면 저절로 덜 싣는다.
  짓기     벽 밖 (y < -112) = 캐릭터 (outpostcrew23, 나무 chop 선행), 벽 안 = 로봇 유령 (망 2). 분배기 · 고리는 마지막에 캐릭터.
  자재     망 벨트 · 지하 · 분배기가 모자라면 캐릭터가 집에서 망 철판 · 회로로 손제작 (옮김 + 제작) 후 망에 넣는다.
고속 벨트는 쓰지 않음: 노랑 두 줄 = 30/s 로 목표 (생산 ~10.5/s 의 1.5 배 = 15.8/s) 를 넘고, 고속은 칸당 톱니 5 (철 10) 더 듦.

    python -u scripts/platein23.py plan          # 경로 계산 -> state/platein23_plan.json
    python -u scripts/platein23.py check         # 칸마다 can_place (드라이런)
    python -u scripts/platein23.py make          # 모자란 자재 손제작 (집)
    python -u scripts/platein23.py ghosts        # 벽 안 로봇 유령
    python -u scripts/platein23.py build fe|cu   # 벽 밖 캐릭터
    python -u scripts/platein23.py finish fe|cu  # 분배기 (+ 구리 고리) - 새 벨트가 다 선 뒤
    python -u scripts/platein23.py flow [--minutes 3]   # 벨트별 통과량 (unique_id 표본) · 화로 full_output · 망 판
로그 state/platein23.log
"""
import argparse
import heapq
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "platein23.log")
PLAN = os.path.join(HERE, "..", "state", "platein23_plan.json")
OWNER = "platein23"
WALL_Y = -112          # 북벽 (타일 -113/-112) - 이보다 북쪽 (y < -112) 은 벽 밖
BASE = (-160, -121, 60, -38)

SITES = {
    # splitter: 중심, 바꿀 벨트 칸, 새 벨트 쪽 반칸 (가상 시작 타일)
    "fe": dict(label="철", split=(-155.0, -201.5), replace=(-155.5, -201.5), start=(-155, -202),
               goal=(-34, -46), corridor=(-160, -204, -146, -115), entry=(-150.5, -160.5)),
    "cu": dict(label="구리", split=(47.0, -327.5), replace=(47.5, -327.5), start=(46, -328),
               goal=(-64, -71), corridor=(40, -332, 58, -115), entry=(42.5, -230.5),
               # 레인 바꿈 고리 (화로 i=7/8 사이). ROT: 기존 (47.5,-345.5) 남향 -> 동향
               loop=[("transport-belt", 48.5, -345.5, "east"), ("transport-belt", 49.5, -346.5, "south"),
                     ("transport-belt", 49.5, -345.5, "south"), ("transport-belt", 49.5, -344.5, "west"),
                     ("transport-belt", 48.5, -344.5, "west")],
               rot=(47.5, -345.5)),
}
DIRS = {"north": 0, "east": 4, "south": 8, "west": 12}
DS = {0: "north", 4: "east", 8: "south", 12: "west"}
V = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def T(v):
    if isinstance(v, dict) and v and all(k.isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v if v else []


# ---------------------------------------------------------------- 격자 · 경로
GRID = """(function() local s = game.surfaces[1] local rows = {} local occ = {}
  local skip = {resource = 1, corpse = 1, character = 1, ['item-entity'] = 1, fire = 1, sticker = 1, projectile = 1, ['character-corpse'] = 1,
    ['entity-ghost'] = 1, ['tile-ghost'] = 1, ['highlight-box'] = 1, ['smoke-with-trigger'] = 1, ['deconstructible-tile-proxy'] = 1, particle = 1}
  for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}}) do local t = e.type
    if not skip[t] then local c = '#'
      if t == 'tree' or (t == 'simple-entity' and e.name:find('rock')) then c = 'T'
      elseif t == 'underground-belt' then c = 'u' end
      local bb = e.bounding_box
      for x = math.floor(bb.left_top.x + 0.01), math.ceil(bb.right_bottom.x - 0.01) - 1 do
        for y = math.floor(bb.left_top.y + 0.01), math.ceil(bb.right_bottom.y - 0.01) - 1 do
          local k = x .. ',' .. y if not occ[k] or occ[k] == 'T' then occ[k] = c end end end
    end end
  for y = %d, %d - 1 do local r = {}
    for x = %d, %d - 1 do local c = occ[x .. ',' .. y]
      if not c then local tl = s.get_tile(x, y) c = (tl.collides_with('player') or tl.name:find('water')) and '~' or '.' end
      r[#r + 1] = c end
    rows[#rows + 1] = table.concat(r) end
  return rows end)()"""

EXTRA = """(function() local s = game.surfaces[1] local o = {out = {}, ins = {}, span = {}}
  local A = {{%d, %d}, {%d, %d}}
  local function t(p) return math.floor(p.x) .. ',' .. math.floor(p.y) end
  local V = {[0] = {0, -1}, [4] = {1, 0}, [8] = {0, 1}, [12] = {-1, 0}}
  for _, e in pairs(s.find_entities_filtered{area = A, type = {'transport-belt', 'underground-belt', 'splitter', 'loader', 'loader-1x1'}}) do
    local v = V[e.direction] if v then
      if e.type == 'splitter' then local px, py = -v[2] * 0.5, v[1] * 0.5
        o.out[#o.out + 1] = t({x = e.position.x + px + v[1], y = e.position.y + py + v[2]})
        o.out[#o.out + 1] = t({x = e.position.x - px + v[1], y = e.position.y - py + v[2]})
      elseif e.type == 'underground-belt' and e.belt_to_ground_type == 'input' then local n = e.neighbours
        if n then local x0, y0, x1, y1 = e.position.x, e.position.y, n.position.x, n.position.y
          local dx = (x1 > x0) and 1 or ((x1 < x0) and -1 or 0) local dy = (y1 > y0) and 1 or ((y1 < y0) and -1 or 0)
          local x, y = x0 + dx, y0 + dy
          while math.abs(x - x1) + math.abs(y - y1) > 0.5 do o.span[#o.span + 1] = t({x = x, y = y}) x = x + dx y = y + dy end end
      else o.out[#o.out + 1] = t({x = e.position.x + v[1], y = e.position.y + v[2]}) end
    end end
  for _, e in pairs(s.find_entities_filtered{area = A, type = 'inserter'}) do
    o.ins[#o.ins + 1] = t(e.drop_position) o.ins[#o.ins + 1] = t(e.pickup_position) end
  return o end)()"""


def fetch(ai, x0, y0, x1, y1):
    g = {}
    for yy in range(y0, y1, 40):
        ye = min(y1, yy + 40)
        rows = T(ai.lua(GRID % (x0, yy, x1, ye, yy, ye, x0, x1)))
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                g[(x0 + i, yy + j)] = ch
    r = ai.lua(EXTRA % (x0 - 2, y0 - 2, x1 + 2, y1 + 2))
    conv = lambda v: set(tuple(int(a) for a in s.split(",")) for s in T(v))
    return g, conv(r.get("out")), conv(r.get("ins")), conv(r.get("span"))


def astar(g, forb, span, start, sdir, goal, gdir, block=(), ug_max=5):
    """타일 격자 A*. 노드 = (타일, 향). 벨트 1 (+회전 1, 나무 +2), 지하 8 + 길이. 목표: goal 타일에 gdir 로 놓임."""
    block = set(block)
    ok = lambda t: t not in block and t not in forb and g.get(t) in (".", "T")
    h = lambda t: abs(t[0] - goal[0]) + abs(t[1] - goal[1])
    s0 = (start, sdir)
    pq, best, prev = [(h(start), 0, s0)], {s0: 0}, {s0: None}
    while pq:
        _, c, node = heapq.heappop(pq)
        if best.get(node, 1e18) < c:
            continue
        t, d = node
        if t == goal and d == gdir:
            steps = []
            while prev[node]:
                node, st = prev[node]
                steps.append(st)
            return list(reversed(steps))
        dx, dy = V[d]
        q = (t[0] + dx, t[1] + dy)
        if not ok(q):
            continue
        for nd in V:
            if (nd - d) % 16 == 8:
                continue
            nc = c + 1 + (2 if g.get(q) == "T" else 0) + (1 if nd != d else 0)
            nn = (q, nd)
            if nc < best.get(nn, 1e18):
                best[nn], prev[nn] = nc, (node, ("belt", q, nd))
                heapq.heappush(pq, (nc + h(q), nc, nn))
        if q in span:
            continue
        for k in range(2, ug_max + 1):
            o = (q[0] + dx * k, q[1] + dy * k)
            if not ok(o) or o in span:
                continue
            if any(g.get((q[0] + dx * j, q[1] + dy * j)) == "u" for j in range(1, k)):
                continue
            nc = c + 8 + k
            nn = (o, d)
            if nc < best.get(nn, 1e18):
                best[nn], prev[nn] = nc, (node, ("ug", q, o, d))
                heapq.heappush(pq, (nc + h(o), nc, nn))
    return None


def to_builds(steps):
    out = []
    for st in steps:
        if st[0] == "belt":
            _, q, nd = st
            out.append(["transport-belt", q[0] + 0.5, q[1] + 0.5, DS[nd], None])
        else:
            _, q, o, d = st
            out.append(["underground-belt", q[0] + 0.5, q[1] + 0.5, DS[d], "input"])
            out.append(["underground-belt", o[0] + 0.5, o[1] + 0.5, DS[d], "output"])
    return out


def plan(ai):
    g, out, ins, span = fetch(ai, *BASE)
    res = {}
    block = set()
    for key in ("fe", "cu"):
        c = SITES[key]
        g2, o2, i2, s2 = fetch(ai, *c["corridor"])
        gg = dict(g)
        for k, v in g2.items():
            gg.setdefault(k, v)
        steps = astar(gg, out | o2 | ins | i2, span | s2, c["start"], 8, c["goal"], 8, block=block)
        if not steps:
            log("%s 경로 없음" % c["label"])
            return None
        b = to_builds(steps)
        # 다음 경로를 위해: 이 경로 칸 막음, 지하 끝은 'u', 지하 사이는 span
        ugs = []
        for n, x, y, d, t in b:
            tt = (math.floor(x), math.floor(y))
            block.add(tt)
            if n == "underground-belt":
                g[tt] = "u"
                ugs.append(tt)
        for a, z in zip(ugs[0::2], ugs[1::2]):
            dx, dy = (z[0] > a[0]) - (z[0] < a[0]), (z[1] > a[1]) - (z[1] < a[1])
            p = (a[0] + dx, a[1] + dy)
            while p != z:
                span.add(p)
                p = (p[0] + dx, p[1] + dy)
        outside = [x for x in b if x[2] < WALL_Y]
        inside = [x for x in b if x[2] >= WALL_Y]
        res[key] = {"outside": outside, "inside": inside}
        cnt = lambda L, n: sum(1 for x in L if x[0] == n)
        log("%s 경로: 벽 밖 벨트 %d · 지하 %d / 벽 안 벨트 %d · 지하 %d (나무 %d)" % (
            c["label"], cnt(outside, "transport-belt"), cnt(outside, "underground-belt"),
            cnt(inside, "transport-belt"), cnt(inside, "underground-belt"),
            sum(1 for x in b if gg.get((math.floor(x[1]), math.floor(x[2]))) == "T")))
    with open(PLAN, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=0)
    return res


def load_plan():
    with open(PLAN, encoding="utf-8") as f:
        return json.load(f)


def segs(builds):
    """로그용 구간 요약."""
    out, cur = [], None
    for n, x, y, d, t in builds:
        if n != "transport-belt":
            if cur:
                out.append(cur)
                cur = None
            out.append(["UG" + ("in" if t == "input" else "out"), (x, y), d])
            continue
        if cur and cur[0] == d and cur[0] != "UG":
            cur[2] = (x, y)
            cur[3] += 1
        else:
            if cur:
                out.append(cur)
            cur = [d, (x, y), (x, y), 1]
    if cur:
        out.append(cur)
    return out


# ---------------------------------------------------------------- 검사
CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, tree = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
      or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then o.ok = o.ok + 1
    else local why, onlytree = '', true
      for _, x in pairs(s.find_entities_filtered{area = {{t[2] - 0.45, t[3] - 0.45}, {t[2] + 0.45, t[3] + 0.45}}}) do
        if x.type ~= 'resource' then why = why .. x.name .. ' ' if not (x.type == 'tree' or x.type == 'simple-entity') then onlytree = false end end end
      if onlytree and why ~= '' then o.tree = o.tree + 1 else o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
    end
  end return o end)()"""


def rows(builds):
    return ", ".join("{'%s', %s, %s, %d}" % (b[0], b[1], b[2], DIRS[b[3]]) for b in builds)


def check(ai, builds):
    tot = {"ok": 0, "have": 0, "tree": 0, "bad": []}
    for k in range(0, len(builds), 120):
        r = ai.lua(CHECK % rows(builds[k:k + 120]))
        for f in ("ok", "have", "tree"):
            tot[f] += r.get(f, 0)
        tot["bad"] += T(r.get("bad"))
    return tot


def need_all(p):
    need = {"transport-belt": 0, "underground-belt": 0, "splitter": 2}
    for key in p:
        for part in ("outside", "inside"):
            for b in p[key][part]:
                need[b[0]] += 1
    need["transport-belt"] += len(SITES["cu"]["loop"]) + 1 + 2   # 고리 + 돌린 칸 + 분배기 자리 (걷어낸 벨트는 되돌아옴)
    return need


NET = """(function() local s = game.surfaces[1]
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local o = {} for _, n in pairs({%s}) do o[n] = net.get_item_count(n) end
  o.free = 0 for _, c in pairs(net.storages) do o.free = o.free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  o.bots = net.available_construction_robots o.bots_all = net.all_construction_robots
  return o end)()"""


def net_stock(ai, names=("transport-belt", "underground-belt", "splitter", "iron-plate", "iron-gear-wheel", "electronic-circuit",
                          "copper-plate", "steel-plate")):
    return ai.lua(NET % ", ".join("'%s'" % n for n in names))


# ---------------------------------------------------------------- 자재 손제작 (집)
def make(ai, need, margin=20):
    import outpostcrew23 as crew
    import orders
    import detached
    st = net_stock(ai)
    short_b = max(0, need["transport-belt"] + margin - int(st["transport-belt"]))
    short_u = max(0, need["underground-belt"] - int(st["underground-belt"]))
    short_s = max(0, need["splitter"] - int(st["splitter"]))
    ug_crafts = -(-short_u // 2)
    # 지하 1 회 = 철 10 + 벨트 5 / 분배기 = 회로 5 + 철 5 + 벨트 4 -> 그 벨트까지 만든다
    short_b += 5 * ug_crafts + 4 * short_s
    belt_crafts = -(-short_b // 2) if short_b > 0 else 0
    log("자재: 필요 %s · 망 %s -> 제작 벨트 %d 회 · 지하 %d 회 · 분배기 %d" % (need, st, belt_crafts, ug_crafts, short_s))
    if not (belt_crafts or ug_crafts or short_s):
        return True
    load = {"iron-plate": 3 * belt_crafts + 10 * ug_crafts + 5 * short_s}
    if short_s:
        load["electronic-circuit"] = 5 * short_s
    who = (crew.free_crew(ai, 1) or [None])[0]
    if not who:
        log("쉬는 사람 없음")
        return False
    detached.mark([who], OWNER, minutes=30)
    bag = crew.load_bag(ai, who, load)
    if any(int((bag.get("bag") or {}).get(k, 0)) < v for k, v in load.items()):
        log("%s 가방 부족 %s" % (who, bag))
        unload(ai, who)
        detached.release([who])
        return False
    steps = []
    if belt_crafts:
        steps += [("craft", {"recipe": "iron-gear-wheel", "count": belt_crafts, "wait": "block"}),
                  ("craft", {"recipe": "transport-belt", "count": belt_crafts, "wait": "block"})]
    if ug_crafts:
        steps.append(("craft", {"recipe": "underground-belt", "count": ug_crafts, "wait": "block"}))
    if short_s:
        steps.append(("craft", {"recipe": "splitter", "count": short_s, "wait": "block"}))
    orders.submit(ai, who, steps, strict=False)
    log("%s 손제작 출발 %s (가방 %s)" % (who, [s[1] for s in steps], bag.get("bag")))
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(10)
        if not crew.busy(ai, [who]):
            break
    log("%s 제작 끝 -> 망 %s · 망 %s" % (who, unload(ai, who), net_stock(ai)))
    detached.release([who])
    return True


BACK = ("transport-belt", "underground-belt", "splitter", "iron-plate", "copper-plate", "steel-plate", "iron-gear-wheel",
        "electronic-circuit", "wood", "stone", "iron-ore", "copper-ore", "coal")


def unload(ai, who):
    from proboport23 import BODY
    lua = """(function() @BODY@
      local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
      local m = b.get_main_inventory() local o = {}
      local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
      for _, n in pairs({%s}) do local k = m.get_item_count(n)
        if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
      return o end)()""".replace("@BODY@", BODY) % (who, ", ".join("'%s'" % n for n in BACK))
    return ai.lua(lua)


# ---------------------------------------------------------------- 벽 안 로봇 유령
GHOST = """(function() local s = game.surfaces[1] local o = {made = 0, have = 0, fail = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
      or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then
      local g = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
        type = (t[5] ~= '' and t[5] or nil), expires = false}
      if g then o.made = o.made + 1 else o.fail[#o.fail + 1] = t[2] .. ',' .. t[3] end
    else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
  end return o end)()"""


def ghosts(ai, p):
    for key in ("fe", "cu"):
        b = p[key]["inside"]
        src = ", ".join("{'%s', %s, %s, %d, '%s'}" % (x[0], x[1], x[2], DIRS[x[3]], x[4] or "") for x in b)
        log("%s 벽 안 유령 %s" % (SITES[key]["label"], ai.lua(GHOST % src)))


# ---------------------------------------------------------------- 벽 밖 캐릭터
def build(ai, p, key, crew_n):
    import outpostcrew23 as crew
    c = SITES[key]
    b = [tuple(x) for x in p[key]["outside"]]
    ok = crew.run_job(ai, b, lambda ch: [], c["entry"], OWNER, log, crew_n=crew_n, rounds=6,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s 벽 밖 캐릭터 건설 %s" % (c["label"], "완료" if ok else "미완"))
    return ok


# ---------------------------------------------------------------- 마무리: 분배기 (+ 구리 고리)
PRESENT = """(function() local s = game.surfaces[1] local o = {miss = 0, ghost = 0}
  for _, t in pairs({%s}) do
    if not s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] then o.miss = o.miss + 1
      if s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] then o.ghost = o.ghost + 1 end end
  end
  local sp = s.find_entities_filtered{name = 'splitter', position = {%s, %s}, radius = 0.3}[1]
  o.splitter = sp and 1 or 0
  return o end)()"""


def finish(ai, p, key):
    import outpostcrew23 as crew
    import orders
    import detached
    c = SITES[key]
    allb = p[key]["outside"] + p[key]["inside"]
    st = ai.lua(PRESENT % (rows(allb), c["split"][0], c["split"][1]))
    log("%s 마무리 전 %s" % (c["label"], st))
    if st.get("miss"):
        log("%s 새 벨트 %d 칸 아직 (유령 %d) - 분배기 보류" % (c["label"], st["miss"], st.get("ghost", 0)))
        return False
    steps = [("walk_to", {"x": c["replace"][0] - 3, "y": c["replace"][1]})]
    need = {}
    if c.get("loop"):
        lp = crew.missing(ai, [tuple(x) for x in c["loop"]])
        rot = ai.lua("""(function() local b = game.surfaces[1].find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
          return {d = b and b.direction or -1} end)()""" % c["rot"]).get("d")
        for b in lp:
            steps.append(("build", {"name": b[0], "x": b[1], "y": b[2], "direction": DIRS[b[3]]}))
        if rot == 8:
            steps.append(("demolish", {"x": c["rot"][0], "y": c["rot"][1], "name": "transport-belt", "search_radius": 0.3}))
            steps.append(("build", {"name": "transport-belt", "x": c["rot"][0], "y": c["rot"][1], "direction": 4}))
        need["transport-belt"] = len(lp) + (1 if rot == 8 else 0)
        log("구리 고리: 새 벨트 %d · 머리 돌림 %s" % (len(lp), rot == 8))
    if not st.get("splitter"):
        steps.append(("demolish", {"x": c["replace"][0], "y": c["replace"][1], "name": "transport-belt", "search_radius": 0.3}))
        steps.append(("build", {"name": "splitter", "x": c["split"][0], "y": c["split"][1], "direction": 8}))
        need["splitter"] = 1
    steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
    need = {k: v for k, v in need.items() if v > 0}
    if len(steps) <= 2:
        log("%s 마무리 할 것 없음" % c["label"])
        return True
    who = (crew.free_crew(ai, 1) or [None])[0]
    if not who:
        log("쉬는 사람 없음")
        return False
    detached.mark([who], OWNER, minutes=30)
    bag = crew.load_bag(ai, who, need)
    if any(int((bag.get("bag") or {}).get(k, 0)) < v for k, v in need.items()):
        log("%s 가방 부족 %s" % (who, bag))
        detached.release([who])
        return False
    orders.submit(ai, who, steps, strict=False)
    log("%s 마무리 출발 %d 단계 %s" % (who, len(steps), need))
    t0 = time.time()
    while time.time() - t0 < 900:
        time.sleep(15)
        if not crew.busy(ai, [who]):
            break
    log("%s 돌아옴 -> 망 %s · 뒤 %s" % (who, unload(ai, who), ai.lua(PRESENT % (rows(allb), c["split"][0], c["split"][1]))))
    detached.release([who])
    return True


# ---------------------------------------------------------------- 측정
# 벨트 구간 (8 칸 = 노랑 4.3 초) 을 2 초마다 표본 -> unique_id 로 지나간 개수. 구간은 기지 끝 (벽 안 / 벽 앞) 쪽.
GATES = {
    "fe-old": [(-112.5, -100.5 + k) for k in range(8)],          # 기존 철 x=-112.5 (벽 안)
    "fe-new": [(-41.5, -80.5 + k) for k in range(8)],            # 새 철 x=-41.5 (벽 안)
    "cu-old": [(-30.5 + k, -117.5) for k in range(8)],           # 기존 구리 y=-117.5 (벽 앞)
    "cu-new": [(-61.5, -83.5 + k) for k in range(8)],            # 새 구리 x=-61.5 (벽 안)
}
SAMPLE = """(function() local s = game.surfaces[1] local o = {}
  for g, ps in pairs({%s}) do local ids = {}
    for _, p in pairs(ps) do local b = s.find_entities_filtered{type = 'transport-belt', position = p, radius = 0.3}[1]
      if b then for li = 1, 2 do for _, it in pairs(b.get_transport_line(li).get_detailed_contents()) do
        ids[#ids + 1] = it.unique_id .. ':' .. li .. ':' .. it.stack.name end end end end
    o[g] = table.concat(ids, ' ') end
  return o end)()"""


def flow(ai, minutes):
    import smeltcol23 as sc
    src = SAMPLE % ", ".join("['%s'] = {%s}" % (g, ", ".join("{%s, %s}" % p for p in ps)) for g, ps in GATES.items())
    seen = {g: {} for g in GATES}
    n0 = net_stock(ai, ("iron-plate", "copper-plate", "steel-plate"))
    st0 = {k: sc.status(ai, k) for k in ("fe", "cu")}
    t0 = time.time()
    while time.time() - t0 < minutes * 60:
        r = ai.lua(src)
        for g in GATES:
            for tok in (r.get(g) or "").split():
                uid, li, name = tok.split(":", 2)
                seen[g][uid] = (li, name)
        time.sleep(2)
    k = 10.0 / minutes
    res = {}
    for g, d in seen.items():
        c = {}
        for li, name in d.values():
            key = "%s/L%s" % (name.replace("-plate", ""), li)
            c[key] = c.get(key, 0) + 1
        res[g] = {kk: int(v * k) for kk, v in sorted(c.items())}
    n1 = net_stock(ai, ("iron-plate", "copper-plate", "steel-plate"))
    FO = """(function() local s = game.surfaces[1] local o = {}
      for k, a in pairs({fe = {{-160, -245}, {-150, -170}}, cu = {{40, -365}, {50, -325}}}) do local c = {}
        for _, f in pairs(s.find_entities_filtered{type = 'furnace', area = a}) do
          local nm = '?' for n, v in pairs(defines.entity_status) do if v == f.status then nm = n end end c[nm] = (c[nm] or 0) + 1 end
        o[k] = c end return o end)()"""
    log("벨트 통과 (10분 환산, %g 분 표본) %s" % (minutes, res))
    log("전초 화로 상태 %s · 망 판 %s -> %s · 10분 흐름 %s" % (ai.lua(FO), {k: n0[k] for k in ("iron-plate", "copper-plate", "steel-plate")},
                                                     {k: n1[k] for k in ("iron-plate", "copper-plate", "steel-plate")}, ai.lua(sc.FLOW)))
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["plan", "check", "make", "ghosts", "build", "finish", "flow"])
    ap.add_argument("site", nargs="?")
    ap.add_argument("--crew", type=int, default=3)
    ap.add_argument("--minutes", type=float, default=3)
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "plan":
        p = plan(ai)
        if p:
            for key in p:
                for s in segs(p[key]["outside"] + p[key]["inside"]):
                    print(key, s)
        return 0
    if a.cmd == "flow":
        flow(ai, a.minutes)
        return 0
    p = load_plan()
    if a.cmd == "check":
        for key in p:
            for part in ("outside", "inside"):
                log("%s %s 칸 검사 %s" % (SITES[key]["label"], part, check(ai, p[key][part])))
        log("구리 고리 칸 검사 %s" % check(ai, [list(x) + [None] for x in SITES["cu"]["loop"]]))
        log("자재 필요 %s · 망 %s" % (need_all(p), net_stock(ai)))
    elif a.cmd == "make":
        make(ai, need_all(p))
    elif a.cmd == "ghosts":
        ghosts(ai, p)
    elif a.cmd == "build":
        build(ai, p, a.site, a.crew)
    elif a.cmd == "finish":
        finish(ai, p, a.site)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

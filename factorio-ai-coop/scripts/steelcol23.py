"""철 전초 강철 기둥 (09-28 15:4x) - 강철이 연구 병목, 철판은 남는다.

실측 (15:40): 망 강철 158~178 (platebus 강철 하한 300 아래), 10분 강철 생산 119. 망 철판 16,1xx (> smeltcol 상한 16,000),
전초 판 강철로 18 중 7 full_output (결과칸 100), 강철용 돌 화로 8 **전부 full_output (강철 100 씩 = 800 갇힘)**.
원인: 판 벨트 x=-155.5 가 판으로 꽉 차 (소비 병목) 강철 출력 팔이 강철을 못 놓는다 - 강철이 판과 같은 레인에 섞여 막힌다.

고침: 판 벨트 동쪽 (분배기 (-155,-201.5) 위) 에 **강철로 기둥** - 판 벨트에서 철판을 집어 강철을 **전용 강철 벨트** 로.
    판 벨트 x=-155.5 | 입력 팔 x=-154.5 | 강철로 x=-154..-152 (중심 -153) | 출력 팔 x=-151.5 | 강철 벨트 x=-150.5 (남향)
    강철로 18: 위 8 (중심 y -241..-227, 레인 고리 (-154.5/-153.5, -225.5..-223.5) 위) + 아래 10 (중심 -222..-204).
    팔 줄: 강철로 두 줄 중 기존 전봇대 x=-154.5 (y -240.5/-233.5/-226.5/-219.5/-212.5/-205.5) 가 없는 줄. 전봇대는 빈 줄에 (전력 닿지 않는 팔만).
    강철 벨트: x=-150.5 남향 -> (-150.5,-201.5) 동 -> (-148.5,-201.5) -> (-147.5,-201.5) 남 -> (-147.5,-200.5) 남 -> 두 번째 반입 벨트 (platein23) 머리 굽이 (-147.5,-199.5).
    레인: 출력 팔이 서쪽에서 놓아 강철은 동 레인 (= line 1, 왼쪽). (-147.5,-199.5) 에 뒤 입력이 생겨 곧은 벨트가 되고,
          판 줄 (y=-199.5 동향) 은 서쪽 옆치기 -> 서 레인 (line 2). => 두 번째 반입 벨트 = line 1 강철 전용 · line 2 판 전용.
    기지: 두 번째 반입 벨트의 벽 안 구간 (platein23 plan fe.inside) 에서 강철을 망 저장으로 (smeltcol23 run, 10 초마다) - fe-x33 머리 전에 뺀다.
    전환 때 line 1 에 있던 판은 한 번 망으로 옮긴다 (flush, 약 1,000 - 망 빈 칸 확인).
짓기는 캐릭터 (outpostcrew23 dispatch), 재료는 망 2 저장 -> 가방 (옮김). 강철로는 망에 없어 집에서 캐릭터가 손제작 (망 강철 6 · 벽돌 10 씩).
강철용 돌 화로 8 결과칸에 갇힌 강철 800 은 캐릭터가 꺼내 집 망에 넣는다 (take -> 가방 -> 망).

    python -u scripts/steelcol23.py check     # 칸 검사 (드라이런)
    python -u scripts/steelcol23.py craft     # 강철로 손제작 -> 망
    python -u scripts/steelcol23.py build     # 캐릭터가 짓는다
    python -u scripts/steelcol23.py take      # 돌 화로 8 에 갇힌 강철 -> 망
    python -u scripts/steelcol23.py flush     # 두 번째 반입 벨트 line 1 판 -> 망 (한 번)
    python -u scripts/steelcol23.py status
로그 state/steelcol23.log
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import orders  # noqa: E402
import outpostcrew23 as crew  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "steelcol23.log")
PLAN = os.path.join(HERE, "..", "state", "platein23_plan.json")
OWNER = "steelcol23"
X_IN, X_F, X_OUT, X_BELT = -154.5, -153.0, -151.5, -150.5
CENTERS = [-241.0 + 2 * k for k in range(8)] + [-222.0 + 2 * k for k in range(10)]
POLES_OLD = [(-154.5, y) for y in (-240.5, -233.5, -226.5, -219.5, -212.5, -205.5, -198.5)]
ENTRY = (-151.5, -222.5)
OLD_STEEL = [(-158.0, -191.0 + 2 * k) for k in range(8)]   # 강철용 돌 화로 (smeltcol23 fe steel r0=-191.5)
BACK = ("steel-furnace", "steel-plate", "stone-brick", "inserter", "small-electric-pole", "transport-belt", "iron-plate",
        "wood", "stone", "coal", "iron-ore")


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _covered(p, poles):
    return any(abs(p[0] - q[0]) < 2.65 and abs(p[1] - q[1]) < 2.65 for q in poles)


def layout():
    """-> builds [(name, x, y, dir)], 입력 팔 좌표 (강철 조절기용)"""
    b, ins_in, poles = [], [], list(POLES_OLD)
    rows = []
    for yc in CENTERS:
        top, bot = yc - 0.5, yc + 0.5
        row = bot if (X_IN, top) in POLES_OLD else top
        other = top if row == bot else bot
        rows.append((yc, row, other))
        b.append(("steel-furnace", X_F, yc, "north"))
        b.append(("inserter", X_IN, row, "west"))      # 판 벨트 (서) -> 강철로 (동)
        b.append(("inserter", X_OUT, row, "west"))     # 강철로 (서) -> 강철 벨트 (동)
        ins_in.append((X_IN, row))
    for yc, row, other in rows:
        for x in (X_IN, X_OUT):
            if not _covered((x, row), poles) and (x, other) not in POLES_OLD:
                poles.append((x, other))
                b.append(("small-electric-pole", x, other, "north"))
    y = -241.5
    while y <= -202.5:
        b.append(("transport-belt", X_BELT, y, "south"))
        y += 1
    b += [("transport-belt", -150.5, -201.5, "east"), ("transport-belt", -149.5, -201.5, "east"),
          ("transport-belt", -148.5, -201.5, "east"), ("transport-belt", -147.5, -201.5, "south"),
          ("transport-belt", -147.5, -200.5, "south")]
    return b, ins_in


def ins_in_points():
    return layout()[1]


def inside_points():
    """두 번째 반입 벨트 벽 안 구간 (강철 빼는 곳)"""
    with open(PLAN, encoding="utf-8") as f:
        p = json.load(f)["fe"]
    return [(e[1], e[2]) for e in p["inside"]]


def route_points():
    with open(PLAN, encoding="utf-8") as f:
        p = json.load(f)["fe"]
    return [(e[1], e[2]) for e in p["outside"] + p["inside"]]


CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then
      local h = (t[1] == 'steel-furnace') and 0.95 or 0.45
      if s.count_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}, type = 'resource'} > 0 then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':ore'
      else o.ok = o.ok + 1 end
    else
      local why = '' for _, x in pairs(s.find_entities_filtered{position = {t[2], t[3]}, radius = 1}) do why = why .. x.name .. ' ' end
      o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
  end return o end)()"""


def rows_lua(builds):
    return ", ".join("{'%s', %s, %s, %d}" % (n, x, y, crew.DIRS[d]) for n, x, y, d in builds)


def check(ai):
    b, _ = layout()
    r = ai.lua(CHECK % rows_lua(b))
    bad = r.get("bad") or []
    bad = list(bad.values()) if isinstance(bad, dict) else bad
    cnt = {}
    for n, *_ in b:
        cnt[n] = cnt.get(n, 0) + 1
    log("칸 검사: 전체 %d %s · 있음 %s · 가능 %s · 막힘 %s" % (len(b), cnt, r.get("have"), r.get("ok"), bad))
    return bad


UNLOAD = """(function() @BODY@
  local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
  local m = b.get_main_inventory() local o = {}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, n in pairs({%s}) do local k = m.get_item_count(n)
    if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
  return o end)()"""


def unload(ai, who):
    from proboport23 import BODY
    return ai.lua(UNLOAD.replace("@BODY@", BODY) % (who, ", ".join("'%s'" % n for n in BACK)))


def wait_back(ai, sent, limit=1200):
    t0 = time.time()
    while sent and time.time() - t0 < limit:
        time.sleep(15)
        if not crew.busy(ai, sent):
            break
    for who in sent:
        log("%s 돌아옴 · 가방 -> 망 %s" % (who, unload(ai, who)))
    detached.release(sent)


def send(ai, who, need, steps):
    detached.mark([who], OWNER, minutes=40)
    bag = crew.load_bag(ai, who, need) if need else {"bag": {}}
    have = bag.get("bag") or {}
    if bag.get("dead") or any(int(have.get(k, 0)) < v for k, v in need.items()):
        log("%s 가방 부족 %s - 건너뜀" % (who, bag))
        unload(ai, who)
        detached.release([who])
        return False
    orders.submit(ai, who, steps, strict=False)
    log("%s 출발 (%d 단계, 가방 %s)" % (who, len(steps), have))
    return True


def craft(ai):
    b, _ = layout()
    left = crew.missing(ai, [x for x in b if x[0] == "steel-furnace"])
    net = ai.lua("""(function() local net = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player')
      return {sf = net.get_item_count('steel-furnace'), steel = net.get_item_count('steel-plate'), brick = net.get_item_count('stone-brick')} end)()""")
    k = min(len(left) - int(net["sf"]), int(net["steel"]) // 6, int(net["brick"]) // 10)
    log("강철로 손제작: 남은 자리 %d · 망 %s -> %d 개" % (len(left), net, k))
    if k <= 0:
        return
    free = crew.free_crew(ai, 1)
    if not free:
        log("쉬는 사람 없음")
        return
    who = free[0]
    steps = [("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}),
             ("craft", {"recipe": "steel-furnace", "count": k, "wait": "block"}), ("wait", {"ticks": 120})]
    if send(ai, who, {"steel-plate": 6 * k, "stone-brick": 10 * k}, steps):
        wait_back(ai, [who], limit=600)


def chops(ai, builds):
    """발밑 나무 -> chop 단계 (강철로 2x2 는 1.1 칸까지)"""
    rows = ", ".join("{'%s', %s, %s, %s}" % (b[0], b[1], b[2], 1.1 if b[0] == "steel-furnace" else 0.6) for b in builds)
    r = ai.lua(crew.TREES % rows)
    v = list(r.values()) if isinstance(r, dict) else list(r or [])
    seen, out = set(), []
    for t in v:
        k = (round(t[0], 1), round(t[1], 1))
        if k not in seen:
            seen.add(k)
            out.append(("chop", {"x": t[0], "y": t[1], "count": 1}))
    return out


def build(ai, rounds=4):
    b, _ = layout()
    for rnd in range(rounds):
        todo = crew.missing(ai, b)
        if not todo:
            log("모두 섬 (%d)" % len(b))
            return True
        free = crew.free_crew(ai, 3)
        if not free:
            log("쉬는 사람 없음 - 60초 뒤")
            time.sleep(60)
            continue
        chunks = crew.split(todo, len(free))
        sent = []
        for who, ch in zip(free, chunks):
            if crew.dispatch(ai, who, ch, [], ENTRY, OWNER, log, pre=chops(ai, ch)):
                sent.append(who)
            else:
                unload(ai, who)
                detached.release([who])
        log("%d 파: 남은 %d · 보냄 %s" % (rnd + 1, len(todo), sent))
        wait_back(ai, sent, limit=900)
    left = crew.missing(ai, b)
    log("끝: 빠진 것 %d %s" % (len(left), left[:8]))
    return not left


def take(ai):
    # alpha 는 15:5x 석탄 광맥 (-84,-279) 에서 움직이지 못함 (걸음 · take 전부 제자리 시간초과) - 뺀다
    free = crew.free_crew(ai, 1, exclude=("alpha",))
    if not free:
        log("쉬는 사람 없음")
        return
    who = free[0]
    steps = [("walk_to", {"x": -153.5, "y": -184.0})]
    for x, y in OLD_STEEL:
        steps.append(("take", {"name": "steel-plate", "x": x, "y": y, "count": 100}))
    steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
    if send(ai, who, {}, steps):
        wait_back(ai, [who], limit=900)


FLUSH = """(function() local s = game.surfaces[1] local o = {moved = 0, steel = 0, left = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  o.free0 = free if free < %d then return o end
  for _, p in pairs({%s}) do
    local b = s.find_entities_filtered{type = 'transport-belt', position = p, radius = 0.3}[1]
    if b then local L = b.get_transport_line(1) local k = L.get_item_count('iron-plate')
      if k > 0 then local put = net.insert({name = 'iron-plate', count = k}, 'storage')
        if put > 0 then L.remove_item{name = 'iron-plate', count = put} o.moved = o.moved + put end
        o.left = o.left + k - put end end
  end
  o.iron = net.get_item_count('iron-plate') return o end)()"""


def flush(ai):
    pts = ", ".join("{%s, %s}" % p for p in route_points())
    r = ai.lua(FLUSH % (40, pts))
    log("두 번째 반입 벨트 line 1 판 -> 망 %s" % r)
    return r


STATUS = """(function() local s = game.surfaces[1] local o = {furn = 0, work = 0, full = 0, noing = 0, res = 0, belt_steel = 0}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.3}[1]
    if f then o.furn = o.furn + 1
      if f.status == defines.entity_status.working then o.work = o.work + 1
      elseif f.status == defines.entity_status.full_output then o.full = o.full + 1 else o.noing = o.noing + 1 end
      o.res = o.res + f.get_inventory(defines.inventory.furnace_result).get_item_count() end end
  local lanes = {0, 0, 0, 0}
  for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-148, -199}, {-147, -130}}}) do
    for li = 1, 2 do local L = b.get_transport_line(li) lanes[li] = lanes[li] + L.get_item_count('iron-plate') lanes[li + 2] = lanes[li + 2] + L.get_item_count('steel-plate') end end
  o.x147 = {fe1 = lanes[1], fe2 = lanes[2], st1 = lanes[3], st2 = lanes[4]}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  o.net = {steel = net.get_item_count('steel-plate'), iron = net.get_item_count('iron-plate'), free = free}
  local ps = game.forces.player.get_item_production_statistics(s) local p1 = defines.flow_precision_index.ten_minutes
  o.flow10 = {} for _, n in pairs({'steel-plate', 'iron-plate', 'iron-ore'}) do
    o.flow10[n] = {math.floor(ps.get_flow_count{name = n, category = 'input', precision_index = p1, count = true}),
                   math.floor(ps.get_flow_count{name = n, category = 'output', precision_index = p1, count = true})} end
  return o end)()"""


def status(ai):
    new = ", ".join("{%s, %s}" % (X_F, y) for y in CENTERS)
    plate = ", ".join("{-158, %s}" % (-241 + 2 * i) for i in range(18))
    old = ", ".join("{%s, %s}" % p for p in OLD_STEEL)
    r_new = ai.lua(STATUS % new)
    r_plate = ai.lua(STATUS % plate)
    r_old = ai.lua(STATUS % old)
    for k in ("x147", "net", "flow10"):
        r_plate.pop(k, None)
        r_old.pop(k, None)
    log("새 강철로 %s | 판 화로 %s | 강철 돌 화로 %s" % (r_new, r_plate, r_old))


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    {"check": check, "craft": craft, "build": build, "take": take, "flush": flush, "status": status}[cmd](ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

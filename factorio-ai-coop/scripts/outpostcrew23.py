"""전초 건설 일꾼 (사용자 08:04: «채굴지에서의 건설 요청은 캐릭터한테 시킬 것»).

전초 (구리 61,-407 · 철 -213,-248) 에 짓는 것은 로봇 유령이 아니라 캐릭터가 손으로 놓는다.
    1. 재료: 망 2 저장 상자 -> 캐릭터 가방 (Lua 로 «옮김», 있는 물건만. routefix23 PULL 과 같은 방식)
    2. 계획: walk_to (전초 입구) -> build ... (build 는 멀면 스스로 다가간다) -> insert (탄 · 연료) -> walk_to 집 (-81,-43)
       orders.submit 이 적을 피하는 경유점을 넣는다. 한 번에 60 단계 이하.
    3. 확인: 계획의 칸마다 엔티티가 섰나 게임에 묻는다. 빠진 것은 다음 파에 다시.
사람 규칙: 도망이 먼저 (브리지 내장), 부활 없음 (사망은 기록만), delta 함정 구역 x 18..34 · y -12..14 피함.
detached.mark 로 이 스크립트 소유를 표시한다 (다른 고리가 끌고 가지 않게).
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
import detached  # noqa: E402
import orders  # noqa: E402

HOME = (-81.0, -43.0)
CREW = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]
DIRS = {"north": 0, "east": 4, "south": 8, "west": 12}
MAX_STEPS = 58

def free_crew(ai, n=8, exclude=()):
    live = {c["name"]: c for c in ai.list()}
    out = []
    for w in CREW:
        c = live.get(w)
        if not c or not c.get("alive") or w in exclude:
            continue
        if c.get("current") or c.get("queued"):
            continue
        if not detached.mine(w) and detached.owner(w) is not None:
            continue
        out.append(w)
    return out[:n]


def load_bag(ai, who, need):
    """need: {item: count} -> 망 2 저장에서 가방으로 모자란 만큼 옮긴다. 결과: 가방 수량."""
    from proboport23 import BODY  # 캐릭터 몸 찾기 (기존 헬퍼)
    rows = ", ".join("['%s'] = %d" % kv for kv in need.items())
    lua = """(function() @BODY@
      local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
      local m = b.get_main_inventory() local o = {got = {}, bag = {}}
      local net = s.find_logistic_network_by_position({-24, -88}, 'player')
      for n, k in pairs({%s}) do
        local have = m.get_item_count(n)
        if have < k then
          local can = math.min(k - have, net.get_item_count(n), m.get_insertable_count(n))
          if can > 0 then local got = net.remove_item{name = n, count = can}
            if got > 0 then local put = m.insert{name = n, count = got}
              if put < got then net.insert({name = n, count = got - put}, 'storage') end o.got[n] = put end end end
        o.bag[n] = m.get_item_count(n)
      end return o end)()""".replace("@BODY@", BODY) % (who, rows)
    return ai.lua(lua)


def unload_bag(ai, who, keep=()):
    """집에 돌아온 뒤 남은 건설 재료를 망 2 저장으로 되돌린다 (옮김)."""
    from proboport23 import BODY
    names = ", ".join("'%s'" % n for n in ("gun-turret", "laser-turret", "small-electric-pole", "stone-furnace", "inserter",
                                             "transport-belt", "piercing-rounds-magazine", "firearm-magazine", "coal")
                      if n not in keep)
    lua = """(function() @BODY@
      local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
      local m = b.get_main_inventory() local o = {}
      local net = s.find_logistic_network_by_position({-24, -88}, 'player')
      for _, n in pairs({%s}) do local k = m.get_item_count(n)
        if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
      return o end)()""".replace("@BODY@", BODY) % (who, names)
    return ai.lua(lua)


def order_path(builds, start):
    """가까운 것부터 (탐욕) - 걸음을 줄인다."""
    left = list(builds)
    out = []
    cx, cy = start
    while left:
        i = min(range(len(left)), key=lambda k: (left[k][1] - cx) ** 2 + (left[k][2] - cy) ** 2)
        b = left.pop(i)
        out.append(b)
        cx, cy = b[1], b[2]
    return out


def make_plan(builds, inserts, entry, home=HOME, pre=()):
    """builds: [(name, x, y, dir_str)], inserts: [(item, x, y, count)] -> 단계 목록 (≤ MAX_STEPS). pre: 짓기 전 단계 (나무 베기)"""
    steps = [("walk_to", {"x": entry[0], "y": entry[1]})] + list(pre)
    for b in order_path(builds, entry):
        name, x, y, d = b[:4]
        p = {"name": name, "x": x, "y": y, "direction": DIRS.get(d, 0)}
        if len(b) > 4 and b[4]:
            p["type"] = b[4]              # 지하벨트 입구/출구 ("input" | "output")
        steps.append(("build", p))
    for item, x, y, n in inserts:
        steps.append(("insert", {"name": item, "x": x, "y": y, "count": n}))
    steps.append(("walk_to", {"x": home[0], "y": home[1]}))
    return steps


def need_of(builds, inserts):
    need = {}
    for b in builds:
        need[b[0]] = need.get(b[0], 0) + 1
    for it in inserts:
        need[it[0]] = need.get(it[0], 0) + it[3]
    return need


def dispatch(ai, who, builds, inserts, entry, owner, log, home=HOME, pre=()):
    """한 사람에게 한 파. 반환: 보낸 단계 수 (0 이면 못 보냄)."""
    detached.mark([who], owner, minutes=40)
    bag = load_bag(ai, who, need_of(builds, inserts))
    if bag.get("dead"):
        log("%s 없음 (사망?) - 건너뜀" % who)
        return 0
    have = bag.get("bag") or {}
    ok_b = []
    cnt = {}
    for b in builds:
        cnt[b[0]] = cnt.get(b[0], 0) + 1
        if cnt[b[0]] <= int(have.get(b[0], 0)):
            ok_b.append(b)
    ok_i = [it for it in inserts if int(have.get(it[0], 0)) >= it[3]]
    if not ok_b:
        log("%s 가방 재료 부족 %s - 건너뜀" % (who, have))
        return 0
    steps = make_plan(ok_b, ok_i, entry, home, pre)
    try:
        orders.submit(ai, who, steps, strict=False)
    except Exception as e:  # noqa: BLE001
        log("%s 계획 거절 %s" % (who, e))
        return 0
    log("%s 출발: 짓기 %d · 넣기 %d (가방 %s)" % (who, len(ok_b), len(ok_i), have))
    return len(steps)


TREES = """(function() local s = game.surfaces[1] local o = {}
  for i, t in pairs({%s}) do local h = t[4]
    for _, e in pairs(s.find_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}, type = {'tree', 'simple-entity'}}) do
      o[#o + 1] = {e.position.x, e.position.y, i} end end
  return o end)()"""


def chops(ai, builds):
    """덩어리 발밑 나무 · 바위 -> chop 단계 (가장 가까운 나무를 벤다, 나무 1 개면 멈춤)."""
    if not builds:
        return []
    rows = ", ".join("{'%s', %s, %s, %s}" % (b[0], b[1], b[2], 0.95 if b[0] in ("stone-furnace", "gun-turret", "laser-turret") else 0.45)
                     for b in builds)
    r = ai.lua(TREES % rows)
    v = list(r.values()) if isinstance(r, dict) else list(r or [])
    seen = set()
    out = []
    for t in v:
        k = (round(t[0], 1), round(t[1], 1))
        if k in seen:
            continue
        seen.add(k)
        out.append(("chop", {"x": t[0], "y": t[1], "count": 1}))
    return out


PRESENT = """(function() local s = game.surfaces[1] local o = {}
  for i, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.6}[1]
    o[i] = e and 1 or 0 end return o end)()"""


def missing(ai, builds):
    if not builds:
        return []
    out = []
    for k in range(0, len(builds), 150):
        chunk = builds[k:k + 150]
        rows = ", ".join("{'%s', %s, %s}" % (b[0], b[1], b[2]) for b in chunk)
        r = ai.lua(PRESENT % rows)
        v = [r.get(str(i + 1)) for i in range(len(chunk))] if isinstance(r, dict) else list(r)
        out += [b for b, f in zip(chunk, v) if not f]
    return out


def split(builds, n, per=MAX_STEPS - 6):
    """구역 단위로 나눈다 (좌표 정렬 후 연속 덩어리) - 한 사람이 한 구역."""
    bs = sorted(builds, key=lambda b: (b[2], b[1]))
    chunks = []
    size = min(per, max(1, -(-len(bs) // max(1, n))))
    for k in range(0, len(bs), size):
        chunks.append(bs[k:k + size])
    return chunks


def busy(ai, names):
    live = {c["name"]: c for c in ai.list()}
    return [w for w in names if w in live and live[w].get("alive") and (live[w].get("current") or live[w].get("queued"))]


def run_job(ai, builds, inserts_for, entry, owner, log, crew_n=3, rounds=4, wait_max=900, pre_for=None):
    """builds 를 여러 사람에게 나눠 짓고, 빠진 것을 다시 보낸다. inserts_for(chunk) -> 그 덩어리의 넣기 목록."""
    for rnd in range(rounds):
        todo = missing(ai, builds)
        if not todo:
            log("모두 섬 (%d)" % len(builds))
            return True
        crew = free_crew(ai, crew_n)
        if not crew:
            log("쉬는 사람 없음 - 60초 뒤")
            time.sleep(60)
            continue
        chunks = split(todo, len(crew))
        sent = []
        for who, ch in zip(crew, chunks):
            if dispatch(ai, who, ch, inserts_for(ch), entry, owner, log, pre=(pre_for(ch) if pre_for else ())):
                sent.append(who)
        log("%d 파: 남은 %d · 보냄 %s" % (rnd + 1, len(todo), sent))
        t0 = time.time()
        while sent and time.time() - t0 < wait_max:
            time.sleep(20)
            if not busy(ai, sent):
                break
        for who in sent:
            try:
                unload_bag(ai, who)
            except Exception:  # noqa: BLE001
                pass
        detached.release(sent)
    left = missing(ai, builds)
    log("끝: 빠진 것 %d %s" % (len(left), left[:8]))
    return not left

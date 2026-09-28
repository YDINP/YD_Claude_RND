"""외부 채굴 Phase 1 - 석탄 (docs/outpost-mining-plan-run23.md §2 · §6 C0~C4).

  S1  북 석탄 서쪽 열: 채굴기 E (-98.5,y) · W (-94.5,y) → 철 상자 (-96.5,y), y = -291.5/-288.5/-285.5/-282.5
      + 바위 자리 (-81.5,-284.5) 채굴기 1 (coalnet 상자 (-83.5,-284.5) 로). 전봇대 4 (x=-100.5 · x=-92.5, F2 벨트 칸 비움).
      상자 → 망 은 smeltcol23 COALNET (상자 목록에 이미 들어 있음).
  F2  북 석탄 x=-96.5 남향 → 기지 옛 석탄 모음 머리 (-96.5,-103.5). 벽 밖 = 캐릭터, 벽 안 (지하 3 조각) = 로봇 유령.
      S1 상자 4 는 마지막에 벨트로 바꾼다 (상자 석탄은 먼저 Lua 로 망으로).
  F1  남서 석탄 (-209,103) 채굴기 16 (E (-211.5,y) · W (-207.5,y), y 94.5..115.5 - 광석 실측으로 계획서 97.5..118.5 에서 한 줄 올림)
      → x=-209.5 북향 → y=62.5 동향 → x=-52.5 북향 → 지하 (남벽 · 탄 벨트) → (-52.5..-50.5, 49.5) 동향 = 막다른 끝.
      찬 뒤 뱅크 2 줄 (-49.5..-17.5, 49.5) 33 칸을 한 번에 동향으로 (turn).
  decon  기지 석탄 채굴기 11 해체 표시 (로봇). 화로 줄 (-101.5,-101.5) 은 남긴다 (결정 1: 이번 Phase 에선 보고만).

    python -u scripts/coalp1_23.py check s1|f2|f2in|f1def|f1|f1in
    python -u scripts/coalp1_23.py craft drill N | chest N | belt N
    python -u scripts/coalp1_23.py build s1|f2|f1def|f1
    python -u scripts/coalp1_23.py ghost f2in|f1in       # 벽 안 유령 (로봇)
    python -u scripts/coalp1_23.py swap                  # S1 상자 → 벨트 (F2 연결)
    python -u scripts/coalp1_23.py turn [--back]         # 뱅크 2 33 칸 동향 (되돌리기 --back)
    python -u scripts/coalp1_23.py decon                 # 기지 석탄 채굴기 11 해체 표시
    python -u scripts/coalp1_23.py status
로그 state/coalp1_23.log
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import coalline23 as cl  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "coalp1_23.log")
OWNER = "coalp1_23"
AMMO = "piercing-rounds-magazine"


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cl.log = log
cl.SIZE.update({"iron-chest": 0.45, "transport-belt": 0.45, "underground-belt": 0.45, "small-electric-pole": 0.45})

# ---------------------------------------------------------------- 좌표
S1_ROWS = (-291.5, -288.5, -285.5, -282.5)
S1_X = -96.5
ROCKS = [("huge-rock", -98.125, -291.0), ("big-rock", -97.0, -287.875), ("big-rock", -79.8125, -284.4375)]


def s1():
    b = [("small-electric-pole", -100.5, -285.5, "north"), ("small-electric-pole", -100.5, -291.5, "north"),
         ("small-electric-pole", -92.5, -283.5, "north"), ("small-electric-pole", -92.5, -289.5, "north")]
    for y in S1_ROWS:
        b.append(("iron-chest", S1_X, y, "north"))
        b.append(("electric-mining-drill", S1_X - 2, y, "east"))
        b.append(("electric-mining-drill", S1_X + 2, y, "west"))
    b.append(("electric-mining-drill", -81.5, -284.5, "west"))
    return b


def f2():
    """벽 밖 (캐릭터): 상자 칸 제외한 x=-96.5 남향 -292.5 .. -114.5 + 지하 입구 (-96.5,-113.5)."""
    b = []
    ug = {-251.5: "input", -249.5: "output", -121.5: "input", -119.5: "output", -113.5: "input"}
    skip = {-250.5, -120.5} | set(S1_ROWS)
    y = -292.5
    while y <= -113.5:
        if y in ug:
            b.append(("underground-belt", S1_X, y, "south", ug[y]))
        elif y not in skip:
            b.append(("transport-belt", S1_X, y, "south"))
        y += 1
    return b


def f2in():
    """벽 안 (로봇 유령)."""
    return [("underground-belt", S1_X, -110.5, "south", "output"),
            ("underground-belt", S1_X, -109.5, "south", "input"),
            ("underground-belt", S1_X, -104.5, "south", "output")]


F1_ROWS = (94.5, 97.5, 100.5, 103.5, 106.5, 109.5, 112.5, 115.5)
F1_X = -209.5


def f1def():
    """방어 · 전봇대 (채굴기 · 벨트보다 먼저). 포탑은 광석 밖 (check 가 확인)."""
    b = []
    for k in range(18):                                    # y=61.5 x -88.5 .. -207.5 (기존 (-83.5,58.5) 에서)
        b.append(("small-electric-pole", -88.5 - 7 * k, 61.5, "north"))
    for y in (67.5, 74.5, 81.5, 87.5, 92.5, 98.5, 104.5, 110.5, 116.5):   # 동 열 (W 채굴기)
        b.append(("small-electric-pole", -205.5, y, "north"))
    b.append(("small-electric-pole", F1_X, 117.5, "north"))              # 벨트 머리 남쪽 다리
    for y in (92.5, 98.5, 104.5, 110.5, 116.5, 121.5):                   # 서 열 (E 채굴기) + 남 레이저
        b.append(("small-electric-pole", -213.5, y, "north"))
    b += [("small-electric-pole", -219.5, 98.5, "north"), ("small-electric-pole", -224.5, 98.5, "north"),
          ("small-electric-pole", -200.5, 119.5, "north")]
    b += [("laser-turret", -214, 123, "north"), ("laser-turret", -198, 121, "north"),
          ("laser-turret", -226, 101, "north"), ("laser-turret", -206, 84, "north"),
          ("gun-turret", -208, 123, "north"), ("gun-turret", -226, 108, "north"),
          ("gun-turret", -213, 84, "north"), ("gun-turret", -192, 104, "north")]
    return b


def f1():
    b = []
    for y in F1_ROWS:
        b.append(("electric-mining-drill", F1_X - 2, y, "east"))
        b.append(("electric-mining-drill", F1_X + 2, y, "west"))
    y = 116.5
    while y >= 63.5:
        b.append(("transport-belt", F1_X, y, "north"))
        y -= 1
    x = F1_X
    while x <= -53.5:
        b.append(("transport-belt", x, 62.5, "east"))
        x += 1
    for y in (62.5, 61.5, 60.5, 59.5):
        b.append(("transport-belt", -52.5, y, "north"))
    b.append(("underground-belt", -52.5, 58.5, "north", "input"))
    return b


def f1in():
    b = [("underground-belt", -52.5, 53.5, "north", "output")]
    for y in (52.5, 51.5, 50.5):
        b.append(("transport-belt", -52.5, y, "north"))
    for x in (-52.5, -51.5, -50.5):
        b.append(("transport-belt", x, 49.5, "east"))
    return b


PARTS = {"s1": s1, "f2": f2, "f2in": f2in, "f1def": f1def, "f1": f1, "f1in": f1in}
cl.PARTS.update(PARTS)
ENTRY = {"s1": (-100.5, -272.5), "f2": (-100.5, -200.5), "f1def": (-120.5, 64.5), "f1": (-150.5, 64.5)}

# ---------------------------------------------------------------- 칸 검사 (지하벨트 type 포함)
CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, tree = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    local h = t[5]
    local ore = s.count_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}, type = 'resource'}
    if e then o.have = o.have + 1
    elseif t[1] == 'electric-mining-drill' and ore == 0 then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':no-ore'
    elseif (t[1] == 'gun-turret' or t[1] == 'laser-turret') and ore > 0 then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':ore'
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then
      o.ok = o.ok + 1
    else
      local why, soft = '', true
      for _, x in pairs(s.find_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}}) do
        if x.type ~= 'resource' then why = why .. x.name .. ' '
          if x.type ~= 'tree' and x.type ~= 'simple-entity' and x.type ~= 'character' and x.type ~= 'item-entity' and x.type ~= 'corpse' then soft = false end end end
      if soft and why ~= '' then o.tree = o.tree + 1 else o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
    end
  end return o end)()"""


def check(ai, part):
    b = PARTS[part]()
    out = {"ok": 0, "have": 0, "tree": 0, "bad": []}
    for k in range(0, len(b), 100):
        rows = ", ".join("{'%s', %s, %s, %d, %s}" % (x[0], x[1], x[2], cl.DIRN[x[3]], cl.SIZE.get(x[0], 0.45)) for x in b[k:k + 100])
        r = ai.lua(CHECK % rows)
        for f in ("ok", "have", "tree"):
            out[f] += r.get(f, 0)
        bad = r.get("bad") or []
        out["bad"] += list(bad.values()) if isinstance(bad, dict) else bad
    cnt = {}
    for x in b:
        cnt[x[0]] = cnt.get(x[0], 0) + 1
    log("%s 칸 검사: 전체 %d %s · 있음 %d · 가능 %d · 나무/바위 %d · 막힘 %s" % (part, len(b), cnt, out["have"], out["ok"], out["tree"], out["bad"]))
    return out


# ---------------------------------------------------------------- 나무 · 바위 (3x3 전체)
OBST = """(function() local s = game.surfaces[1] local o = {}
  for _, t in pairs({%s}) do local h = t[3]
    for _, e in pairs(s.find_entities_filtered{area = {{t[1] - h, t[2] - h}, {t[1] + h, t[2] + h}}, type = {'tree', 'simple-entity'}}) do
      o[#o + 1] = {e.position.x, e.position.y, e.type, e.name} end end
  return o end)()"""


def clears(ai, builds):
    if not builds:
        return []
    rows = ", ".join("{%s, %s, %s}" % (b[1], b[2], cl.SIZE.get(b[0], 0.45)) for b in builds)
    r = ai.lua(OBST % rows)
    v = list(r.values()) if isinstance(r, dict) else list(r or [])
    seen, out = set(), []
    for t in v:
        k = (round(t[0], 1), round(t[1], 1))
        if k in seen:
            continue
        seen.add(k)
        if t[2] == "tree":
            out.append(("chop", {"x": t[0], "y": t[1], "count": 1}))
        else:
            out.append(("demolish", {"x": t[0], "y": t[1], "name": t[3], "search_radius": 0.6}))
    return out[:14]


# ---------------------------------------------------------------- 캐릭터 건설
def build(ai, part):
    import outpostcrew23 as crew
    import detached
    b = PARTS[part]()

    def inserts_for(ch):
        return [(AMMO, x, y, 50) for n, x, y, *_ in ch if n == "gun-turret"]
    nb = {"s1": 2, "f2": 2, "f1def": 3, "f1": 3}[part]
    team = {"s1": ("alpha", "bravo", "charlie", "golf"), "f2": ("alpha", "bravo", "charlie", "golf"),
            "f1def": ("delta", "echo", "foxtrot"), "f1": ("delta", "echo", "foxtrot")}[part]
    orig = crew.CREW
    crew.CREW = list(team)
    try:
        ok = crew.run_job(ai, b, inserts_for, ENTRY[part], OWNER, log, crew_n=nb, rounds=8,
                          pre_for=lambda ch: clears(ai, ch))
    finally:
        crew.CREW = orig
    for w in team:
        if detached.owner(w) not in (None, OWNER) or crew.busy(ai, [w]):
            continue
        try:
            r = bag_to_net(ai, w, ["electric-mining-drill", "iron-chest", "small-electric-pole", "transport-belt",
                                   "underground-belt", "laser-turret", "gun-turret", AMMO, "coal", "stone", "wood"])
            if r and not r.get("dead"):
                log("%s 가방 남은 것 -> 망 %s" % (w, r))
        except Exception:  # noqa: BLE001
            pass
    log("%s 캐릭터 건설 %s" % (part, "완료" if ok else "미완"))
    return ok


BAG_TO_NET = """(function() @BODY@
  local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
  local m = b.get_main_inventory() local o = {}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, n in pairs({%s}) do local k = m.get_item_count(n)
    if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
  return o end)()"""


def bag_to_net(ai, who, names):
    from proboport23 import BODY
    return ai.lua(BAG_TO_NET.replace("@BODY@", BODY) % (who, ", ".join("'%s'" % n for n in names)))


# ---------------------------------------------------------------- 손 제작 (망 판 → 가방 → 제작 → 망)
RECIPE_PLATES = {"electric-mining-drill": {"iron-plate": 23, "copper-plate": 5},
                 "iron-chest": {"iron-plate": 8},
                 "transport-belt": {"iron-plate": 2}}          # 벨트 2 개 = 철 3 → 넉넉히 개당 2


def craft(ai, item, n, who=None):
    import orders
    import outpostcrew23 as crew
    import detached
    if who is None:
        free = crew.free_crew(ai, 8)
        pick = [w for w in ("hotel", "golf", "foxtrot", "bravo", "charlie", "delta", "echo") if w in free]
        if not pick:
            log("제작: 쉬는 사람 없음")
            return False
        who = pick[0]
    detached.mark([who], OWNER, minutes=20)
    need = {k: v * n for k, v in RECIPE_PLATES[item].items()}
    bag = crew.load_bag(ai, who, need)
    count = n if item != "transport-belt" else -(-n // 2)
    log("%s 판 가방 %s -> %s %d 손 제작" % (who, bag, item, n))
    orders.submit(ai, who, [("craft", {"recipe": item, "count": count, "wait": True})], strict=False)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(8)
        if not crew.busy(ai, [who]):
            break
    r = bag_to_net(ai, who, [item, "iron-plate", "copper-plate", "iron-gear-wheel", "electronic-circuit", "copper-cable"])
    detached.release([who])
    log("제작 뒤 가방 -> 망 %s" % r)
    return True


# ---------------------------------------------------------------- 벽 안 유령 (로봇)
GHOST = """(function() local s = game.surfaces[1] local o = {ghost = 0, have = 0, fail = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    local g = s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e or g then o.have = o.have + 1
    else
      for _, x in pairs(s.find_entities_filtered{area = {{t[2] - 0.45, t[3] - 0.45}, {t[2] + 0.45, t[3] + 0.45}}, type = {'tree', 'simple-entity'}}) do
        if not x.to_be_deconstructed() then x.order_deconstruction('player') o.tree = (o.tree or 0) + 1 end end
      local p ={name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player'}
      if t[5] ~= '' then p.type = t[5] end
      if s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.ghost_place} then
        local ok = s.create_entity(p) if ok then o.ghost = o.ghost + 1 else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
      else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':blocked' end
    end
  end return o end)()"""


def ghost(ai, part):
    b = PARTS[part]()
    rows = ", ".join("{'%s', %s, %s, %d, '%s'}" % (x[0], x[1], x[2], cl.DIRN[x[3]], x[4] if len(x) > 4 else "") for x in b)
    r = ai.lua(GHOST % rows)
    log("%s 유령 %s" % (part, r))
    return r


# ---------------------------------------------------------------- S1 상자 → 벨트 (F2 연결)
EMPTY = """(function() local s = game.surfaces[1] local o = {moved = 0, left = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, p in pairs({%s}) do
    local c = s.find_entities_filtered{name = 'iron-chest', position = p, radius = 0.3}[1]
    if c then local k = c.get_item_count('coal')
      if k > 0 then local put = net.insert({name = 'coal', count = k}, 'storage') if put > 0 then c.remove_item{name = 'coal', count = put} o.moved = o.moved + put end end
      o.left = o.left + c.get_item_count('coal') end end
  o.net = net.get_item_count('coal') return o end)()"""


def swap(ai):
    """상자 석탄을 망으로 비우고, 캐릭터가 상자를 캐고 그 칸에 남향 벨트."""
    import orders
    import outpostcrew23 as crew
    import detached
    pts = ", ".join("{%s, %s}" % (S1_X, y) for y in S1_ROWS)
    r = ai.lua(EMPTY % pts)
    log("S1 상자 비움 -> 망 %s" % r)
    free = [w for w in crew.free_crew(ai, 8) if w in ("alpha", "bravo", "charlie", "golf")]
    if not free:
        log("swap: 쉬는 사람 없음")
        return False
    who = free[0]
    detached.mark([who], OWNER, minutes=20)
    bag = crew.load_bag(ai, who, {"transport-belt": 4})
    steps = [("walk_to", {"x": -100.5, "y": -287.0})]
    for y in S1_ROWS:
        steps.append(("demolish", {"x": S1_X, "y": y, "name": "iron-chest", "search_radius": 0.5}))
        steps.append(("build", {"name": "transport-belt", "x": S1_X, "y": y, "direction": 8}))
    steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
    ai.lua(EMPTY % pts)
    orders.submit(ai, who, steps, strict=False)
    log("%s 상자 -> 벨트 출발 (가방 %s)" % (who, bag))
    t0 = time.time()
    while time.time() - t0 < 900:
        time.sleep(15)
        if not crew.busy(ai, [who]):
            break
    r = bag_to_net(ai, who, ["iron-chest", "coal", "transport-belt"])
    detached.release([who])
    log("swap 끝, 가방 -> 망 %s" % r)
    return True


# ---------------------------------------------------------------- 뱅크 2 회전
TURN = """(function() local s = game.surfaces[1] local o = {n = 0, coal = 0}
  for x = -49.5, -17.5 do
    local b = s.find_entities_filtered{type = 'transport-belt', position = {x, 49.5}, radius = 0.3}[1]
    if b then if b.direction ~= %d then b.direction = %d o.n = o.n + 1 end
      for i = 1, 2 do o.coal = o.coal + b.get_transport_line(i).get_item_count('coal') end end
  end return o end)()"""


def turn(ai, back=False):
    d = 12 if back else 4
    r = ai.lua(TURN % (d, d))
    log("뱅크 2 줄 %s: %s" % ("서향 (되돌림)" if back else "동향", r))
    return r


# ---------------------------------------------------------------- 기지 석탄 채굴기 해체
BASE_DRILLS = [(-98.5, -103.5), (-98.5, -100.5), (-98.5, -97.5), (-94.5, -103.5), (-94.5, -100.5),
               (-47.5, -90.5), (-47.5, -87.5), (-47.5, -83.5), (-46.5, -79.5), (-43.5, -79.5)]
DECON = """(function() local s = game.surfaces[1] local o = {n = 0, miss = 0}
  for _, p in pairs({%s}) do
    local d = s.find_entities_filtered{name = 'electric-mining-drill', position = p, radius = 0.3}[1]
    if d then if not d.to_be_deconstructed() then d.order_deconstruction('player') o.n = o.n + 1 end else o.miss = o.miss + 1 end end
  return o end)()"""


def decon(ai):
    r = ai.lua(DECON % ", ".join("{%s, %s}" % p for p in BASE_DRILLS))
    log("기지 석탄 채굴기 해체 표시 %s (화로 줄 (-101.5,-101.5) 은 남김)" % r)
    return r


# ---------------------------------------------------------------- 상태
STATUS = """(function() local s = game.surfaces[1] local o = {low = 0, zero = 0, sum = 0}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  local mn = 1e9
  for _, b in pairs(s.find_entities_filtered{name = 'boiler'}) do
    local c = b.get_inventory(defines.inventory.fuel).get_item_count('coal') o.sum = o.sum + c
    if c < 5 then o.low = o.low + 1 end if c == 0 then o.zero = o.zero + 1 end if c < mn then mn = c end end
  o.min = mn
  local p0 = s.find_entities_filtered{type = 'electric-pole', position = {2, 33}, radius = 6}[1]
  local es = p0.electric_network_statistics local P = defines.flow_precision_index
  o.mw1 = math.floor(es.get_flow_count{name = 'steam-engine', category = 'output', precision_index = P.one_minute, count = false} * 600 / 1e6) / 10
  o.mw10 = math.floor(es.get_flow_count{name = 'steam-engine', category = 'output', precision_index = P.ten_minutes, count = false} * 600 / 1e6) / 10
  local ps = game.forces.player.get_item_production_statistics(s)
  o.coal10 = {math.floor(ps.get_flow_count{name = 'coal', category = 'input', precision_index = P.ten_minutes, count = true}),
              math.floor(ps.get_flow_count{name = 'coal', category = 'output', precision_index = P.ten_minutes, count = true})}
  local function drills(a) local r = {} for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = a}) do
    local k = st[d.status] or d.status r[k] = (r[k] or 0) + 1 end return r end
  o.s1 = drills({{-100, -293}, {-79, -281}})
  o.f1 = drills({{-214, 92}, {-205, 118}})
  local function beltcoal(a) local n = 0 for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = a}) do
    for i = 1, 2 do n = n + b.get_transport_line(i).get_item_count('coal') end end return n end
  o.f2belt = beltcoal({{-97, -293}, {-96, -104}})
  o.f1belt = beltcoal({{-210, 62}, {-209, 117}}) + beltcoal({{-210, 62}, {-52, 63}}) + beltcoal({{-53, 49}, {-50, 62}})
  o.bank2 = beltcoal({{-50, 49}, {-17, 50}})
  local net = s.find_logistic_network_by_position({-24, -88}, 'player') o.net = net.get_item_count('coal')
  local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end o.free = free
  return o end)()"""


def status(ai):
    r = ai.lua(STATUS)
    log("상태 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "craft", "build", "ghost", "swap", "turn", "decon", "status"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("n", nargs="?", type=int, default=0)
    ap.add_argument("--who")
    ap.add_argument("--back", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        check(ai, a.arg)
    elif a.cmd == "craft":
        craft(ai, {"drill": "electric-mining-drill", "chest": "iron-chest", "belt": "transport-belt"}[a.arg], a.n, a.who)
    elif a.cmd == "build":
        build(ai, a.arg)
    elif a.cmd == "ghost":
        ghost(ai, a.arg)
    elif a.cmd == "swap":
        swap(ai)
    elif a.cmd == "turn":
        turn(ai, a.back)
    elif a.cmd == "decon":
        decon(ai)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

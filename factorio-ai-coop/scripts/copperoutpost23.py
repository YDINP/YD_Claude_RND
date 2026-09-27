"""구리 전초 (61,-407) 개설 - 고정 로보포트 사슬 R3~R6 + 채굴기 12 + 바깥 벨트 (resource-expansion-plan 4절 C5·C6·C7).

copperchain23 (R0·R1·R2, 상주) 는 건드리지 않는다. 그 모듈의 단계 로직 (check -> rp -> ring -> ammo) 을
이 프로세스 안에서만 SITES · 상태 파일 · 두 가지 조사를 바꿔 끼워 재사용한다.
    - 전봇대 줄 출발점에서 대포 키트 (arty_kit.json) 전봇대 · 로보포트 곁 전봇대는 뺀다 (키트가 떠나면 해체되므로).
    - "반경 22 안 탄 든 포탑 6 이상이면 링 생략" 을 끈다 (그 포탑이 키트 링이면 키트와 함께 사라진다).
    - 링 자리는 채굴기 · 모음 벨트 · 채굴기 전봇대 자리를 피한다.

    R3 (56,-270)  R2 (56,-222) 에서 48
    R4 (56,-318)
    R5 (56,-366)
    R6 (46,-404)  광맥 서쪽. 링은 북쪽 둥지 (y -520..-557) 쪽으로 선다.
사슬이 다 서고 링에 탄이 들어간 뒤에만 광맥을 연다 (방어선 먼저):
  drills  채굴기 12 (x 60.5 동향 / 64.5 서향, y -412.5..-397.5 6 쌍, 모음 벨트 x=62.5 남향) + 전봇대 7 + R6 전력 연결
  belt    (62.5,-395.5) -> (50.5,-118.5) 경로 탐색 (4방향 A*, 꺾임 벌점, 나무·바위는 로봇 해체, 지하 없음)
          마지막 칸은 남향 -> copperroute23 안쪽 구간 머리 (50.5,-117.5) 서향으로 들어간다.
  run     지어짐 · 채굴기 가동 · 합류 구리광 · 구리광 10분 생산을 기록. 채굴기 가동 >= 10 · 합류 구리광 > 0 이면 verified.
          (03:27) 합류는 석탄 줄 (-43.5,-94.5) 이 아니라 cusmelt23 제련 줄 (y=-100.5, x -43.5..-4.5) - 그 벨트 위 구리광을 센다.
끝난 뒤에도 상주: R3~R6 링 탄 보충 (copperchain23 과 같은 규칙), 레이저 재고 2 이상이면 링마다 레이저 2 섞기.

    python -u scripts/copperoutpost23.py --check     # 드라이런
    python -u scripts/copperoutpost23.py             # 상주 (20 초)
상태 state/copperoutpost23.json, 로그 state/copperoutpost23.log. 캐릭터는 쓰지 않는다 (로봇만). 철거 없음.
"""
import argparse
import heapq
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import artykit23  # noqa: E402
import copperchain23 as cc  # noqa: E402

STATE = os.path.join(HERE, "..", "state", "copperoutpost23.json")
LOG = os.path.join(HERE, "..", "state", "copperoutpost23.log")
SITES = [("R3", [56, -270]), ("R4", [56, -318]), ("R5", [56, -366]), ("R6", [46, -404])]

BX = 62.5                                   # 모음 벨트 열
ROWS = [-412.5, -409.5, -406.5, -403.5, -400.5, -397.5]
DRILLS = [(BX - 2, y, "east") for y in ROWS] + [(BX + 2, y, "west") for y in ROWS]
DPOLES = [(58.5, -410.5), (58.5, -404.5), (58.5, -398.5), (66.5, -410.5), (66.5, -404.5), (66.5, -398.5), (62.5, -414.5)]
COLLECT = [(BX, ROWS[0] + i) for i in range(int(ROWS[-1] - ROWS[0]) + 2)]   # -412.5 .. -396.5
START = (int(BX - 0.5), int(ROWS[-1] + 1.5))       # 타일 (62,-396) = (62.5,-395.5)
GOAL = (50, -119)                                  # (50.5,-118.5) 남향 -> (50.5,-117.5)
BOX = (30, -420, 82, -118)                         # 탐색 범위 (타일)
JOIN = (-43.5, -100.5)   # 03:27 석탄 줄 (-43.5,-94.5) 합류 폐기 -> cusmelt23 제련 줄 머리 (굽이), 줄 y=-100.5 x -42.5..-4.5


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ---- copperchain23 를 이 프로세스 안에서만 바꿔 끼운다 ----
def kit_points():
    kit = artykit23.load() or {}
    pts, rps = [], []

    def add_pts(v):
        for p in v or []:
            if isinstance(p, (list, tuple)) and len(p) == 2:
                pts.append(p)
    for part in (kit.get("members") or {}, (kit.get("move") or {}).get("old") or {}):
        add_pts(part.get("poles"))
        if part.get("roboport"):
            rps.append(part["roboport"])
    mv = kit.get("move") or {}
    add_pts(mv.get("poles"))
    if mv.get("rp"):
        rps.append(mv["rp"])
    return pts, rps


def patch_chain():
    cc.SITES = SITES
    cc.STATE = STATE
    cc.LOG = LOG
    if "o.guard = n" in cc.SURVEY:
        cc.SURVEY = cc.SURVEY.replace("o.guard = n", "o.guard = 0")
    orig = cc.place_ring

    def place_ring(ai, name, site, n, lasers, skip=()):
        return orig(ai, name, site, n, lasers, list(skip) + FIELD_SKIP)
    if not getattr(cc.place_ring, "_outpost", False):
        place_ring._outpost = True
        cc.place_ring = place_ring
    refresh_poles()


POLES0 = cc.POLES


def refresh_poles(st=None):
    """전봇대 줄은 앞 사슬 로보포트 (R3 은 R2) 곁 전봇대에서만 출발한다.
    키트 전봇대 · 키트 로보포트 곁 전봇대, 해체 예정 전봇대에 매달리면 키트가 떠날 때 전력이 끊긴다 (02:03 R3 첫 시도)."""
    prev = [56, -222]
    if st:
        for name, _ in SITES:
            site = st["sites"][name]
            if site["stage"] == "check":
                break
            if site.get("rp"):
                prev = site["rp"]
    pts, rps = kit_points()
    ex = "local EXP = {%s} local EXR = {%s} local PV = {%s, %s}" % (
        ", ".join("{%s, %s}" % (p[0], p[1]) for p in pts), ", ".join("{%s, %s}" % (p[0], p[1]) for p in rps), prev[0], prev[1])
    fn = (" local function kitpole(e) for _, q in pairs(EXP) do if math.abs(q[1] - e.position.x) < 0.1 and math.abs(q[2] - e.position.y) < 0.1 then return true end end"
          " for _, q in pairs(EXR) do if math.max(math.abs(q[1] - e.position.x), math.abs(q[2] - e.position.y)) < 3.6 then return true end end"
          " return math.max(math.abs(PV[1] - e.position.x), math.abs(PV[2] - e.position.y)) > 4 end")
    p = POLES0.replace("local EID = ", ex + fn + " local EID = ", 1)
    p = p.replace("if e.electric_network_id == EID and not e.to_be_deconstructed() then",
                  "if e.electric_network_id == EID and not e.to_be_deconstructed() and not kitpole(e) then", 1)
    cc.POLES = p


FIELD_SKIP = []
for _x, _y, _d in DRILLS:
    for _dx in (-1, 0, 1):
        for _dy in (-1, 1):
            FIELD_SKIP.append(["d", _x + _dx, _y + _dy])
FIELD_SKIP += [["p", x, y] for x, y in DPOLES] + [["b", x, y] for x, y in COLLECT[::2]]


# ---- 광맥 ----
PLACE = """(function() local s = game.surfaces[1] local o = {made = 0, have = 0, fail = {}, trees = 0}
  for _, t in pairs({%s}) do
    local pos = {t[2], t[3]} local d = defines.direction[t[4]] local h = t[5]
    local e = s.find_entities_filtered{name = t[1], position = pos, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = t[1], position = pos, radius = 0.3}[1]
    if e and e.direction == d then o.have = o.have + 1
    elseif e then o.fail[#o.fail + 1] = 'dir ' .. t[1] .. '@' .. t[2] .. ',' .. t[3]
    else
      for _, x in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{pos[1] - h, pos[2] - h}, {pos[1] + h, pos[2] + h}}}) do
        if not x.to_be_deconstructed() then x.order_deconstruction('player') o.trees = o.trees + 1 end end
      local g = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = pos, direction = d, force = 'player', expires = false}
      if g then o.made = o.made + 1 else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
    end
  end return o end)()"""

# 놓기 전 검사: 채굴기 · 전봇대 자리 (나무 · 바위 말고 막는 것)
FREE = """(function() local s = game.surfaces[1] local o = {bad = {}}
  for _, t in pairs({%s}) do local h = t[4]
    for _, x in pairs(s.find_entities_filtered{area = {{t[2] - h + 0.05, t[3] - h + 0.05}, {t[2] + h - 0.05, t[3] + h - 0.05}}}) do
      local ty = x.type
      if not (ty == 'tree' or ty == 'simple-entity' or ty == 'resource' or ty == 'corpse' or ty == 'unit' or ty == 'item-entity' or ty == 'construction-robot' or ty == 'logistic-robot'
        or (x.name == t[1]) or (ty == 'entity-ghost' and x.ghost_name == t[1])) then
        o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ' <- ' .. x.name end
    end
  end return o end)()"""

# 채굴기 전봇대 무리 -> 주 전력망 (키트 아닌 전봇대) 연결 줄
LINK = """(function() local s = game.surfaces[1] local T = {%s, %s} local o = {poles = {}}
  local EID = s.find_entities_filtered{name = 'roboport', position = {-24, -88}, radius = 1}[1].electric_network_id
  local function ok(p) return s.can_place_entity{name = 'small-electric-pole', position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost} end
  local src, sd = nil, 1e9
  for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', force = 'player', position = T, radius = 60}) do
    if e.electric_network_id == EID and not e.to_be_deconstructed() then
      local d = (e.position.x - T[1])^2 + (e.position.y - T[2])^2 if d < sd then src, sd = e, d end end end
  if not src then o.err = 'no powered pole in 60' return o end
  o.src = {src.position.x, src.position.y}
  local cur = {src.position.x, src.position.y}
  while math.sqrt((cur[1] - T[1])^2 + (cur[2] - T[2])^2) > 7 do
    if #o.poles >= 10 then o.err = 'link > 10' return o end
    local vx, vy = T[1] - cur[1], T[2] - cur[2] local L = math.sqrt(vx * vx + vy * vy) local st = math.min(7, L - 2) local got = nil
    for _, back in ipairs({0, 1, 2, 3}) do for _, dx in ipairs({0, 1, -1}) do for _, dy in ipairs({0, 1, -1}) do
      if not got then local q = {math.floor(cur[1] + vx / L * (st - back)) + 0.5 + dx, math.floor(cur[2] + vy / L * (st - back)) + 0.5 + dy}
        local dq = math.sqrt((q[1] - cur[1])^2 + (q[2] - cur[2])^2)
        if dq <= 7.4 and dq >= 1 and ok(q) then got = q end end
    end end end
    if not got then o.err = 'link blocked @' .. cur[1] .. ',' .. cur[2] return o end
    o.poles[#o.poles + 1] = got cur = got
  end return o end)()"""

# 벨트 경로용 막힌 칸 (나무 · 바위 · 광석 · 유닛 · 로봇 · 시체 말고 전부. 유령도 막힘)
GRID = """(function() local s = game.surfaces[1] local X0, Y0, X1, Y1 = %d, %d, %d, %d local o = {b = {}, t = {}}
  local SK = {tree = 1, ['simple-entity'] = 1, resource = 1, corpse = 1, ['character-corpse'] = 1, ['item-entity'] = 1, fish = 1, unit = 1, character = 1,
    ['construction-robot'] = 1, ['logistic-robot'] = 1, ['combat-robot'] = 1, ['item-request-proxy'] = 1, ['tile-ghost'] = 1, ['highlight-box'] = 1,
    ['deconstructible-tile-proxy'] = 1, projectile = 1, explosion = 1, sticker = 1, fire = 1, ['smoke-with-trigger'] = 1, ['artillery-projectile'] = 1,
    ['arrow'] = 1, ['speech-bubble'] = 1, ['particle-source'] = 1, stream = 1}
  local B = {}
  for _, e in pairs(s.find_entities_filtered{area = {{X0, Y0}, {X1 + 1, Y1 + 1}}}) do
    if not SK[e.type] then
      local bb = e.bounding_box
      for x = math.floor(bb.left_top.x + 0.02), math.ceil(bb.right_bottom.x - 0.02) - 1 do
        for y = math.floor(bb.left_top.y + 0.02), math.ceil(bb.right_bottom.y - 0.02) - 1 do
          if x >= X0 and x <= X1 and y >= Y0 and y <= Y1 then B[x .. ',' .. y] = 1 end end end
    elseif e.type == 'tree' or e.type == 'simple-entity' then
      local bb = e.bounding_box
      o.t[#o.t + 1] = math.floor((bb.left_top.x + bb.right_bottom.x) / 2) .. ',' .. math.floor((bb.left_top.y + bb.right_bottom.y) / 2)
    end
  end
  for x = X0, X1 do for y = Y0, Y1 do
    if not B[x .. ',' .. y] then local tl = s.get_tile(x, y) if tl.collides_with('water_tile') then B[x .. ',' .. y] = 1 end end end end
  for k in pairs(B) do o.b[#o.b + 1] = k end
  o.head = s.count_entities_filtered{area = {{50.05, -117.95}, {50.95, -117.05}}, name = 'transport-belt'}
  o.east = s.count_entities_filtered{area = {{51.05, -117.95}, {51.95, -117.05}}, type = {'transport-belt', 'underground-belt', 'splitter'}}
  o.enemy = s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, area = {{X0 - 60, Y0 - 60}, {X1 + 60, Y1 + 60}}}
  return o end)()"""

STATUS = """(function() local s = game.surfaces[1] local o = {drill = 0, dghost = 0, work = 0, belt = 0, bghost = 0, pole = 0, pghost = 0, st = {}}
  for _, t in pairs({%s}) do local e = s.find_entities_filtered{name = 'electric-mining-drill', position = t, radius = 0.3}[1]
    if e then o.drill = o.drill + 1 if e.status == defines.entity_status.working then o.work = o.work + 1 end
      local k = '' for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end o.st[k] = (o.st[k] or 0) + 1
    elseif s.find_entities_filtered{ghost_name = 'electric-mining-drill', position = t, radius = 0.3}[1] then o.dghost = o.dghost + 1 end end
  for _, t in pairs({%s}) do if s.find_entities_filtered{name = 'transport-belt', position = t, radius = 0.3}[1] then o.belt = o.belt + 1
    elseif s.find_entities_filtered{ghost_name = 'transport-belt', position = t, radius = 0.3}[1] then o.bghost = o.bghost + 1 end end
  for _, t in pairs({%s}) do if s.find_entities_filtered{name = 'small-electric-pole', position = t, radius = 0.3}[1] then o.pole = o.pole + 1
    elseif s.find_entities_filtered{ghost_name = 'small-electric-pole', position = t, radius = 0.3}[1] then o.pghost = o.pghost + 1 end end
  local ore = 0
  for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-44, -101}, {-4, -100}}}) do   -- cusmelt23 제련 줄 (y=-100.5)
    for i = 1, 2 do ore = ore + b.get_transport_line(i).get_item_count('copper-ore') end end
  o.join_ore = ore
  local mid = 0
  for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{40, -118}, {51, -117}}}) do
    for i = 1, 2 do mid = mid + b.get_transport_line(i).get_item_count('copper-ore') end end
  o.inner_ore = mid
  local st = game.forces.player.get_item_production_statistics(s)
  local p10 = defines.flow_precision_index.ten_minutes
  o.ore10_in = math.floor(st.get_flow_count{name = 'copper-ore', category = 'input', precision_index = p10, count = true})
  o.ore10_out = math.floor(st.get_flow_count{name = 'copper-ore', category = 'output', precision_index = p10, count = true})
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.stock = {belt = net.get_item_count('transport-belt'), drill = net.get_item_count('electric-mining-drill'), pole = net.get_item_count('small-electric-pole'),
    gun = net.get_item_count('gun-turret'), rp = net.get_item_count('roboport')}
  o.robots = {net.available_construction_robots, net.all_construction_robots}
  return o end)()"""


def astar(blocked, trees):
    x0, y0, x1, y1 = BOX
    D = {(0, -1): "north", (0, 1): "south", (1, 0): "east", (-1, 0): "west"}
    start, goal = START, GOAL
    h = lambda p: abs(p[0] - goal[0]) + abs(p[1] - goal[1])  # noqa: E731
    pq = [(h(start), 0, start, None)]
    best = {(start, None): 0}
    prev = {}
    while pq:
        f, g, p, d = heapq.heappop(pq)
        if p == goal:
            path = [(p, d)]
            k = (p, d)
            while k in prev:
                k = prev[k]
                path.append(k)
            path.reverse()
            return [q for q, _ in path]
        if best.get((p, d), 1e18) < g:
            continue
        for dv in D:
            q = (p[0] + dv[0], p[1] + dv[1])
            if not (x0 <= q[0] <= x1 and y0 <= q[1] <= y1) or q in blocked:
                continue
            c = 1 + (0 if d is None or d == dv else 3) + (2 if q in trees else 0)
            ng = g + c
            if ng < best.get((q, dv), 1e18):
                best[(q, dv)] = ng
                prev[(q, dv)] = (p, d)
                heapq.heappush(pq, (ng + h(q), ng, q, dv))
    return None


def route(ai):
    r = ai.lua(GRID % BOX)
    blocked = set(tuple(map(int, k.split(","))) for k in cc._l(r.get("b")))
    trees = set(tuple(map(int, k.split(","))) for k in cc._l(r.get("t")))
    # 모음 벨트 칸 · 채굴기는 막힘 처리 (경로는 START 에서 시작)
    for x, y in COLLECT:
        blocked.add((int(x - 0.5), int(y - 0.5)))
    blocked.discard(START)
    blocked.discard(GOAL)
    path = astar(blocked, trees)
    return path, r


def dirs(path):
    D = {(0, -1): "north", (0, 1): "south", (1, 0): "east", (-1, 0): "west"}
    out = []
    for i, p in enumerate(path):
        if i + 1 < len(path):
            q = path[i + 1]
            d = D[(q[0] - p[0], q[1] - p[1])]
        else:
            d = "south"          # 마지막 칸은 (50.5,-117.5) 서향 머리로
        out.append((p[0] + 0.5, p[1] + 0.5, d))
    return out


def rows_of(items):
    return ", ".join("{'%s', %s, %s, '%s', %s}" % it for it in items)


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sites": {k: {"at": p, "stage": "check"} for k, p in SITES}, "field": {"stage": "wait"}}


def save(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def status(ai, fd):
    belts = fd.get("belts") or []
    pts = lambda v: ", ".join("{%s, %s}" % (p[0], p[1]) for p in v)  # noqa: E731
    return ai.lua(STATUS % (pts([(x, y) for x, y, _ in DRILLS]), pts([(b[0], b[1]) for b in belts] or [(0, 0)]),
                            pts(DPOLES + [tuple(p) for p in fd.get("link") or []])))


def field_tick(ai, st, dry=False):
    fd = st.setdefault("field", {"stage": "wait"})
    stage = fd["stage"]
    if stage == "wait":
        fd["stage"] = stage = "drills"
    if stage == "drills":
        chk = [("electric-mining-drill", x, y, 1.5) for x, y, _ in DRILLS] + [("small-electric-pole", x, y, 0.5) for x, y in DPOLES]
        fr = ai.lua(FREE % ", ".join("{'%s', %s, %s, %s}" % c for c in chk))
        bad = cc._l(fr.get("bad"))
        if bad:
            return "채굴기 자리 막힘 %d: %s" % (len(bad), bad[:4])
        rs = st["sites"]["R6"]["rp"]
        link = ai.lua(LINK % (DPOLES[1][0], DPOLES[1][1])) if not dry else {"poles": []}
        if link.get("err"):
            return "채굴기 전력 연결 실패: %s (R6 %s)" % (link["err"], rs)
        lp = [cc._l(p) for p in cc._l(link.get("poles"))]
        if dry:
            return "드라이런: 채굴기 12 · 전봇대 %d 놓을 수 있음" % len(DPOLES)
        items = [("electric-mining-drill", x, y, d, 1.6) for x, y, d in DRILLS]
        items += [("small-electric-pole", x, y, "north", 0.6) for x, y in DPOLES + [tuple(p) for p in lp]]
        g = ai.lua(PLACE % rows_of(items))
        fd.update(stage="belt", link=lp, t=time.time())
        return "광맥 유령: 채굴기 12 · 전봇대 %d + 연결 %d (%s 에서) · 만듦 %s · 있음 %s · 나무 해체 %s · 실패 %s" % (
            len(DPOLES), len(lp), link.get("src"), g.get("made"), g.get("have"), g.get("trees"), cc._l(g.get("fail")))
    if stage == "belt":
        path, r = route(ai)
        if not path:
            return "벨트 경로 없음 (막힌 칸 %d)" % len(cc._l(r.get("b")))
        cells = [(x, y, "south") for x, y in COLLECT] + dirs(path)
        turns = sum(1 for i in range(1, len(cells)) if cells[i][2] != cells[i - 1][2])
        xs = [c[0] for c in cells]
        msg = "벨트 경로 %d 칸 (모음 %d + 간선 %d, 꺾임 %d, x %.1f..%.1f) · 머리 (50.5,-117.5) 벨트 %s · 동쪽 입력 %s · 경로 60 안 적 구조물 %s" % (
            len(cells), len(COLLECT), len(path), turns, min(xs), max(xs), r.get("head"), r.get("east"), r.get("enemy"))
        if dry:
            return "드라이런 " + msg
        if r.get("east"):
            return msg + " -> 머리 동쪽에 벨트가 있어 멈춤"
        g = ai.lua(PLACE % rows_of([("transport-belt", x, y, d, 0.6) for x, y, d in cells]))
        fd.update(stage="run", belts=[list(c) for c in cells], t=time.time(), enemy=r.get("enemy"))
        if r.get("enemy"):
            msg += " (경로 곁 적 구조물 있음 - 대포 · 링에 맡김)"
        return msg + " · 유령 %s · 있음 %s · 나무 해체 %s · 실패 %s" % (g.get("made"), g.get("have"), g.get("trees"), cc._l(g.get("fail"))[:4])
    if stage in ("run", "verified"):
        s = status(ai, fd)
        # 사라진 유령 (공습 등) 다시
        if s["drill"] + s["dghost"] < len(DRILLS) or s["belt"] + s["bghost"] < len(fd["belts"]):
            items = [("electric-mining-drill", x, y, d, 1.6) for x, y, d in DRILLS] + [("transport-belt", b[0], b[1], b[2], 0.6) for b in fd["belts"]]
            items += [("small-electric-pole", x, y, "north", 0.6) for x, y in DPOLES + [tuple(p) for p in fd.get("link") or []]]
            g = ai.lua(PLACE % rows_of(items))
            if g.get("made"):
                log("사라진 유령 다시 %s" % g.get("made"))
        key = (s["drill"], s["work"], s["belt"], s["pole"], s["join_ore"] > 0)
        line = "채굴기 %d/%d (가동 %d %s) · 벨트 %d/%d (유령 %d) · 전봇대 %d · 합류 구리광 %d · 안쪽 서행 %d · 구리광 10분 생산 %d 소비 %d · 재고 %s · 로봇 %s" % (
            s["drill"], len(DRILLS), s["work"], s.get("st"), s["belt"], len(fd["belts"]), s["bghost"], s["pole"], s["join_ore"], s["inner_ore"],
            s["ore10_in"], s["ore10_out"], s.get("stock"), cc._l(s.get("robots")))
        if stage == "run" and s["work"] >= 10 and s["join_ore"] > 0:
            fd["stage"] = "verified"
            fd["verified_at"] = time.strftime("%H:%M:%S")
            return "VERIFIED " + line
        if fd.get("last") != list(key) or time.time() - fd.get("tl", 0) > 300:
            fd["last"] = list(key)
            fd["tl"] = time.time()
            return line
        return None
    return None


# 다음 기지 자리 둘레 나무 · 바위 해체 (로보포트 · 링 자리가 나무로 막힘, 02:11 R4)
CLEAR = """(function() local s = game.surfaces[1] local n, w = 0, 0
  for _, e in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, position = {%s, %s}, radius = 15}) do
    if e.to_be_deconstructed() then w = w + 1 else e.order_deconstruction('player') n = n + 1 end end
  return {n = n, w = w} end)()"""


def clear_next(ai, st):
    for name, _ in SITES:
        site = st["sites"][name]
        if site["stage"] == "check":
            r = ai.lua(CLEAR % tuple(site["at"]))
            if r.get("n"):
                log("%s 자리 둘레 15 나무·바위 해체 %s (이미 표시 %s)" % (name, r["n"], r.get("w")))
            return
        if site["stage"] != "done":
            return


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--every", type=float, default=20)
    a = ap.parse_args()
    ai = AIBridge()
    patch_chain()
    st = load()
    refresh_poles(st)
    if a.check:
        dry = json.loads(json.dumps(st))
        print(cc.tick(ai, dry, dry=True))
        dry.setdefault("field", {"stage": "belt"})["stage"] = "belt"
        print(field_tick(ai, dry, dry=True))
        return 0
    log("copperoutpost23 시작 · " + " · ".join("%s %s" % (k, v["stage"]) for k, v in st["sites"].items()) + " · 광맥 " + st.get("field", {}).get("stage", "wait"))
    while True:
        try:
            refresh_poles(st)
            clear_next(ai, st)
            m = cc.tick(ai, st)
            if m == "ALL_DONE":
                m = field_tick(ai, st)
            save(st)
            if m:
                log(m)
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

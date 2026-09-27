"""방어선 고도화 (사용자: "방어선부터 고도화") - 서쪽 둥지 치기 전에.

적 진화 0.648 (대형 바이터 · 스피터). 서쪽 둥지 (-191,-28) (-203,-26) 는 서쪽 줄 (x -116..-124) 에서 ~75 칸,
물결 12~30 (대형 4~9). 남동 둥지 (81,109) (76,122) (84,122) 는 남쪽 줄 동쪽 끝 (4..21, 52) 에서 ~80 칸 -
대형 스피터가 줄 밖에서 쏘아 동쪽 끝이 자꾸 부서지고, 로봇망 밖이라 사람이 손으로 다시 세웠다.

실측 (2026-09-27):
    · (8,44) 곁엔 전봇대가 없다. 가장 가까운 전력은 x=-11.5 남북 줄 (-11.5,44.5) (망 2, 증기기관 18).
      -> 작은 전봇대 (-5.5/0.5/5.5, 44.5) 로 끌어 로보포트 (8,44) · 창고 (11.5,44.5).
    · 남쪽 탄 벨트는 x=-67.5 에서 끝난다 - 벨트 팔 달린 포탑은 x ≤ -68 까지. x -62..21 의 16 대는 사람이 넣은 탄뿐.
      y=54.5 를 가로막는 건 광석 벨트 (-14.5, 53.5..56.5 남향) 하나 -> 지하벨트 (-15.5 입구 · -13.5 출구).
    · 서쪽 줄: 탄 벨트 x=-113.5 남향 · 팔 x=-114.5 · 포탑 x=-116 (y -39,-34,-28,-22 ...) · 서북 가지 y=-46.5 서향 (x -124..-114).
      둘째 줄은 이 벨트에서 먹는 빈틈에 끼운다: x=-116 줄 사이 4 · 서북 가지 x=-121 위아래 2.
    · 성벽 x=-129.5/-128.5 은 비어 있다 (시체 · 광석뿐). 돌벽 재고 = NE 창고 (12.5,-79.5) 100 - 멀다.
      허브 벽돌 (-81.5,-52.5 900 등) 로 그 자리에서 만든다 (벽돌 버퍼 (-94.5,-78.5) 는 건드리지 않는다).

    python scripts/def23.py                                        # 조사
    python scripts/def23.py --stage se_robo --who bravo
    python scripts/def23.py --stage west_wall,west_row2,se_ammo --who alpha,bravo,charlie
    python scripts/def23.py --verify
"""
import argparse
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit  # noqa: E402

OWNER = "def23"
CREW_OK = ("alpha", "bravo", "charlie", "foxtrot")  # delta · golf · hotel 은 개인 로보포트 공사, echo 는 서쪽 예비 (foxtrot 은 조정자 허락)
N, E, S, W = 0, 4, 8, 12
GUN, WALL, PORT, SC, UG = "gun-turret", "stone-wall", "roboport", "storage-chest", "underground-belt"
BELT, INS, POLE = p1.BELT, p1.INS, p1.POLE
p1.COST.setdefault(WALL, {"stone-brick": 5})
p1.COST.setdefault(UG, {"iron-plate": 8.75})
p1.COST.setdefault(SC, {"steel-plate": 8, "iron-plate": 3, "copper-plate": 5})
p1.SIZE.setdefault(PORT, 4)


# 벽돌: 허브가 바닥나면 전기로 조립기 완충 상자 (-94.5,-78.5) 에서 - 합계 BUF_CAP 까지만 (조정자 지시).
# 가져간 양은 state/def23_buffer.json 에 적는다 (완충 상자 수는 조립기가 쓰면서도 줄어 «처음 - 지금» 으로 못 잰다).
BUF_AT, BUF_CAP = (-94.5, -78.5), 800
BRICK_EXTRA = (-49.5, 0.5)
BUF_FILE = os.path.join(os.path.dirname(__file__), "..", "state", "def23_buffer.json")
_hub, _fetch = p1.hub, p1.fetch


def _buf_used() -> int:
    try:
        import json
        return int(json.load(open(BUF_FILE, encoding="utf-8")).get("taken", 0))
    except (OSError, ValueError):
        return 0


def _hub_with_buffer(ai) -> dict:
    h = _hub(ai)
    if h.get("stone-brick", (0, 0, 0))[2] >= 200:
        return h
    # 허브 밖 벽돌 상자 (-49.5,0.5) (270, 23회차) - 상한 없이 먼저
    v = ai.lua("(function() local c = game.surfaces[1].find_entity('iron-chest', {%f, %f}) return {c and c.get_item_count('stone-brick') or 0} end)()" % BRICK_EXTRA)
    n = int(rows(v)[0]) if rows(v) else 0
    if n > max(20, h.get("stone-brick", (0, 0, 0))[2]):
        h["stone-brick"] = (BRICK_EXTRA[0], BRICK_EXTRA[1], n)
        return h
    left = BUF_CAP - _buf_used()
    v = ai.lua("(function() local c = game.surfaces[1].find_entity('iron-chest', {%f, %f}) return {c and c.get_item_count('stone-brick') or 0} end)()" % BUF_AT)
    n = min(left, int(rows(v)[0]) if rows(v) else 0)
    if n > h.get("stone-brick", (0, 0, 0))[2]:
        h["stone-brick"] = (BUF_AT[0], BUF_AT[1], n)
    return h


def _fetch_counting(ai, who, need):
    plan = _fetch(ai, who, need)
    took = sum(int(p.get("count", 0)) for k, p in plan
               if k == "take" and p.get("name") == "stone-brick" and (p.get("x"), p.get("y")) == BUF_AT)
    if took:
        import json
        os.makedirs(os.path.dirname(BUF_FILE), exist_ok=True)
        json.dump({"taken": _buf_used() + took}, open(BUF_FILE, "w", encoding="utf-8"))
        print(f"  {who}: 완충 상자 벽돌 {took} (합계 {_buf_used()}/{BUF_CAP})", flush=True)
    return plan


p1.hub, p1.fetch = _hub_with_buffer, _fetch_counting


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def wait_ids(ai, ids, limit=900):
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(6)
        try:
            if all(ai.poll(t)["status"] in ("done", "failed", "cancelled") for t in ids):
                break
        except RconError:
            pass
    out = []
    for t in ids:
        try:
            p = ai.poll(t)
        except RconError:
            continue
        if p["status"] == "failed":
            out.append((p.get("type"), p.get("error")))
    return out


def bag(ai, who) -> dict:
    try:
        return ai.agent(who).items()
    except RconError:
        return {}


def enemies_near(ai, x, y, r) -> int:
    v = ai.lua("""(function() return {game.surfaces[1].count_entities_filtered{force = 'enemy', type = 'unit',
      position = {%f, %f}, radius = %f}} end)()""" % (x, y, r))
    return int(rows(v)[0]) if rows(v) else 0


def nearest_store(ai, item, x, y, least) -> tuple | None:
    """(x, y, 수) item 이 least 이상 든 가장 가까운 상자 (허브만 보면 서쪽 끝까지 걸어간다)."""
    v = ai.lua("""(function() local best, bd = nil, 1e18
      for _, c in pairs(game.surfaces[1].find_entities_filtered{type = 'container', force = 'player', position = {%f, %f}, radius = 120}) do
        local n = c.get_item_count('%s')
        if n >= %d and c.name ~= 'storage-chest' then local d = (c.position.x - %f)^2 + (c.position.y - %f)^2
          if d < bd then best, bd = {x = c.position.x, y = c.position.y, n = n}, d end end end
      return best or {} end)()""" % (x, y, item, least, x, y))
    return (float(v["x"]), float(v["y"]), int(v["n"])) if v and v.get("x") is not None else None


def take(x, y, item, n, dy=1.5) -> list:
    return [("walk_to", {"x": x, "y": y + dy}), ("take", {"name": item, "x": x, "y": y, "count": int(n)})]


def gun_plan(ai, who, n) -> list:
    """포탑 n 개 손제작 (허브 판 -> 톱니 -> 포탑). 가방에 있는 만큼 뺀다."""
    short = n - int(bag(ai, who).get(GUN, 0))
    if short <= 0:
        return []
    h = p1.hub(ai)
    return (take(*h["iron-plate"][:2], "iron-plate", 40 * short) + take(*h["copper-plate"][:2], "copper-plate", 10 * short)
            + [("craft", {"recipe": "iron-gear-wheel", "count": 10 * short, "wait": True}),
               ("craft", {"recipe": GUN, "count": short, "wait": True})])


def run_rounds(ai, crew, steps, label, stand, park, rounds=8, safe=None, split=None) -> bool:
    """p1.build_stage 와 같되 «어디 서서 짓나» 를 고른다 (성벽은 늘 동쪽 - 안쪽 - 에서).

    stand(p) -> (x, y) · safe(part) -> 사유 문자열 또는 None · split(todo, crew) -> {who: part}.
    """
    nb = sum(1 for k, _ in steps if k == "build")
    for rnd in range(rounds):
        up = p1.standing(ai, steps)
        todo = [st for st in steps if st[0] == "build" and (st[1]["name"], st[1]["x"], st[1]["y"]) not in up]
        if not todo:
            print(f"  {label}: 다 섰다 ({len(up)}/{nb})", flush=True)
            return True
        bad = {s.split("|")[0]: s.split("|")[1] for s in p1.blocked(ai, todo)}
        if split:
            parts = split(todo, crew)
        else:
            per = (len(todo) + len(crew) - 1) // len(crew)
            parts = {who: todo[i * per:(i + 1) * per] for i, who in enumerate(crew)}
        sent = []
        for who, part in parts.items():
            part = part[:40]
            if not part:
                continue
            why = safe(part) if safe else None
            if why:
                print(f"{who}: {label} - 보류 ({why})", flush=True)
                continue
            need = {}
            for _, p in part:
                need[p["name"]] = need.get(p["name"], 0) + 1
            lack = p1.short_of(ai, who, {k: v for k, v in need.items() if k not in (GUN, PORT)})
            if lack:
                print(f"{who}: {label} - 재료 모자람 {lack}", flush=True)
                continue
            plan = p1.fetch(ai, who, {k: v for k, v in need.items() if k not in (GUN, PORT)})
            last = None
            for k, p in part:
                key = f"{p['name']},{p['x']},{p['y']},{p.get('direction', 0)}"
                sx, sy = stand(p)
                if last is None or abs(sx - last[0]) + abs(sy - last[1]) > 5:
                    plan.append(("walk_to", {"x": sx, "y": sy}))
                    last = (sx, sy)
                if bad.get(key) == "tree":
                    plan.append(("chop", {"x": p["x"], "y": p["y"], "count": 2}))
                elif str(bad.get(key, "")).startswith("rock:"):
                    _r, rn, rx, ry = bad[key].split(":")
                    plan.append(("demolish", {"x": float(rx), "y": float(ry), "name": rn, "search_radius": 0.8}))
                plan.append((k, p))
            plan = plan[:62] + [("walk_to", {"x": park[0], "y": park[1]})]
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            if submit(ai, who, plan, strict=False):
                sent.append(who)
            print(f"{who}: {label} {rnd + 1}순번 ({len(part)}개)" + (f" · 막힌 자리 {len(bad)}" if bad else ""), flush=True)
        t0 = time.time()
        time.sleep(20 if sent else 45)
        while sent and time.time() - t0 < 900 and not p1.idle(ai, sent):
            time.sleep(5)
    up = p1.standing(ai, steps)
    print(f"  {label}: {len(up)}/{nb}", flush=True)
    return len(up) == nb


# ================================================================== se_robo

# 로보포트 둘 -> 한 망: A (8,44) · B (-19,38) 사이 27.7 (물류 25+25) · B 와 과학 포트 (-47,17) 사이 35 -> 셋이 한 망.
# 건설 반경 55: A x -47..63 · B x -74..36 (과학 포트 x -102..8, y ≤ 72) -> 남쪽 줄 x -102..24 전체.
# (-116,50) 서남 모서리는 망 밖이다 (x -102 서쪽).
# relocate (포탑 줄에서 20 칸+ 안쪽) 뒤의 자리. 처음엔 A (8,44) · B (-19,38) 였다.
PORTS = [((2.0, 30.0), [(-5.5, 30.5), (-0.5, 30.5)]),                 # (-11.5,30.5) 망 2
         ((-19.0, 30.0), [(-16.5, 32.5)])]
SE_CHEST = (11.5, 44.5)
PORT_OUT = (34.5, -41.5)
NE_PORTS = [(10, -80), (-24, -88), (20, -40), (36, -84)]
NE_STORE = (12.5, -79.5)                                  # NE 로봇 창고 - 포탑 20 · 돌벽 100
ADV_AT = (34.5, -38.5)                                    # 로보포트 조립기 - 고급 회로 입력
SPARE, BOTS, PACKS, SPARE_WALLS = 6, 16, 60, 30           # 포트마다 로봇 8 · 수리팩 30


def se_robo_steps():
    out = []
    for at, poles in PORTS:
        out += [p1.b(POLE, x, y) for x, y in poles] + [p1.b(PORT, *at)]
    return out + [p1.b(SC, *SE_CHEST)]


def richest(ai, item):
    best = None
    for x, y in NE_PORTS:
        v = ai.lua("(function() local p = game.surfaces[1].find_entity('roboport', {%f, %f}) return {p and p.get_item_count('%s') or 0} end)()"
                   % (x, y, item))
        n = int(rows(v)[0]) if rows(v) else 0
        if not best or n > best[2]:
            best = (x, y, n)
    return best


def port_stock(ai, at) -> dict:
    v = ai.lua("""(function() local p = game.surfaces[1].find_entity('roboport', {%f, %f})
      if not p then return {port = 0} end
      local n = p.logistic_network
      return {port = 1, bots = p.get_item_count('construction-robot'), packs = p.get_item_count('repair-pack'),
              mj = math.floor(p.energy / 1e6), cells = n and #n.cells or 0, net_bots = n and n.all_construction_robots or 0} end)()""" % at)
    return v or {}


def chest_stock(ai) -> dict:
    v = ai.lua("""(function() local c = game.surfaces[1].find_entity('storage-chest', {%f, %f})
      if not c then return {chest = 0} end
      return {chest = 1, guns = c.get_item_count('gun-turret'), walls = c.get_item_count('stone-wall'),
              in_net = c.logistic_network and #c.logistic_network.cells or 0} end)()""" % SE_CHEST)
    return v or {}


def ne_count(ai, item) -> int:
    g = ai.lua("(function() local c = game.surfaces[1].find_entity('storage-chest', {%f, %f}) return {c and c.get_item_count('%s') or 0} end)()"
               % (*NE_STORE, item))
    return int(rows(g)[0]) if rows(g) else 0


def stage_se_robo(ai, crew) -> bool:
    who = "bravo" if "bravo" in crew else crew[0]
    ps = [port_stock(ai, at) for at, _ in PORTS]
    ch = chest_stock(ai)
    b = bag(ai, who)
    plan = []
    want_port = sum(1 for p in ps if not p.get("port")) - int(b.get(PORT, 0))
    if want_port > 0:
        plan += take(*PORT_OUT, PORT, want_port)
    for item, want in (("construction-robot", BOTS), ("repair-pack", PACKS)):
        key = "bots" if item == "construction-robot" else "packs"
        short = want - sum(int(p.get(key, 0)) for p in ps) - int(b.get(item, 0))
        if short > 0:
            x, y, n = richest(ai, item)
            got = min(short, n - (5 if key == "bots" else 20))
            if got > 0:
                plan += take(x, y, item, got, dy=3)
    want_g = SPARE - int(ch.get("guns", 0)) - int(b.get(GUN, 0))
    if want_g > 0:
        got = min(want_g, max(0, ne_count(ai, GUN) - 10))           # NE 창고엔 10 남긴다
        if got:
            plan += take(*NE_STORE, GUN, got)
        if got < want_g:
            plan += gun_plan(ai, who, int(b.get(GUN, 0)) + want_g)
    # NE 돌벽 100 은 다 가져온다: 30 은 창고 (로봇이 부서진 벽을 다시 세운다), 나머지는 south_wall 이 쓴다
    if int(b.get(WALL, 0)) < SPARE_WALLS and ne_count(ai, WALL):
        plan += take(*NE_STORE, WALL, ne_count(ai, WALL))
    if not ch.get("chest") and int(b.get(SC, 0)) < 1:
        # 저장 상자 = 강철 상자 1 + 전자 회로 3 + 고급 회로 1. 고급 회로는 로보포트 조립기 입력 (34.5,-38.5) 에서 하나
        need_st, need_fe, need_cu = 8 - int(b.get("steel-plate", 0)), 3 - int(b.get("iron-plate", 0)), 5 - int(b.get("copper-plate", 0))
        for item, n in (("steel-plate", need_st), ("iron-plate", need_fe), ("copper-plate", need_cu)):
            if n > 0:
                st_ = nearest_store(ai, item, 10, -60, 20)
                plan += take(st_[0], st_[1], item, n + 2)
        if int(b.get("advanced-circuit", 0)) < 1:
            plan += take(*ADV_AT, "advanced-circuit", 1)
        plan += [("craft", {"recipe": "steel-chest", "count": 1, "wait": True}),
                 ("craft", {"recipe": "electronic-circuit", "count": 3, "wait": True}),
                 ("craft", {"recipe": SC, "count": 1, "wait": True})]
    if plan:
        ai.agent(who).cancel()
        ids = submit(ai, who, plan, strict=False) or []
        print(f"  se_robo: {who} 모으기 {len(plan)} 단계 - 실패 {wait_ids(ai, ids, 1200)}", flush=True)
        print(f"  {who} 가방: " + str({k: v for k, v in bag(ai, who).items()
                                        if k in (PORT, SC, GUN, WALL, 'construction-robot', 'repair-pack', POLE)}), flush=True)
    ok = run_rounds(ai, [who], se_robo_steps(), "se_robo", stand=lambda p: (p["x"], p["y"] - 3.5), park=(12.5, 39.5), rounds=6)
    b = bag(ai, who)
    fin = []
    left = {"construction-robot": int(b.get("construction-robot", 0)), "repair-pack": int(b.get("repair-pack", 0))}
    for i, (at, _) in enumerate(PORTS):
        st = port_stock(ai, at)
        if not st.get("port"):
            continue
        fin.append(("walk_to", {"x": at[0] + 2.5, "y": at[1] - 3.5}))
        for item, key, want in (("construction-robot", "bots", BOTS // len(PORTS)), ("repair-pack", "packs", PACKS // len(PORTS))):
            n = min(left[item], want - int(st.get(key, 0))) if i < len(PORTS) - 1 else left[item]
            if n > 0:
                fin.append(("insert", {"name": item, "x": at[0], "y": at[1], "count": n}))
                left[item] -= n
    ch = chest_stock(ai)
    if ch.get("chest"):
        fin.append(("walk_to", {"x": SE_CHEST[0], "y": SE_CHEST[1] - 2}))
        for item, want, cur in ((GUN, SPARE, ch.get("guns", 0)), (WALL, SPARE_WALLS, ch.get("walls", 0))):
            n = min(int(b.get(item, 0)), want - int(cur))
            if n > 0:
                fin.append(("insert", {"name": item, "x": SE_CHEST[0], "y": SE_CHEST[1], "count": n}))
    if fin:
        ids = submit(ai, who, fin, strict=False) or []
        print(f"  se_robo: 채움 - 실패 {wait_ids(ai, ids, 400)}", flush=True)
    return ok


def verify_se_robo(ai) -> None:
    poles = [p1.b(POLE, x, y) for _, ps in PORTS for x, y in ps]
    print("  [se_robo] " + " · ".join(f"포트 {at} {port_stock(ai, at)}" for at, _ in PORTS)
          + f" · 창고 {chest_stock(ai)} · 전봇대 {len(p1.standing(ai, poles))}/{len(poles)}")


# ================================================================== south_wall

S_ROWS = (56.5, 57.5)
S_X0, S_X1 = -120.5, 23.5
S_HOT = [(-20, 24), (-62, -20)]                           # 사용자: "남쪽 중에서도 우측" - 동쪽 끝 먼저, 그다음 가운데, 서남 모서리는 마지막


def south_wall_steps(ai=None):
    xs = [S_X0 + i for i in range(int(S_X1 - S_X0) + 1)]

    def rank(x):
        for i, (a, b) in enumerate(S_HOT):
            if a <= x <= b:
                return (i, -x)
        return (len(S_HOT), -x)
    xs.sort(key=rank)
    out = [p1.b(WALL, x, y) for x in xs for y in S_ROWS]
    return drop_bad_tiles(ai, out, "south_wall") if ai else out


def drop_bad_tiles(ai, out, label):
    """물 · 우리 것 (벽이 아닌 벨트 · 지하관 등) 이 있는 칸은 뺀다."""
    packed = ";".join(f"{p['x']},{p['y']}" for _, p in out)
    v = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") x, y = tonumber(x), tonumber(y)
        local bad = s.get_tile(math.floor(x), math.floor(y)).collides_with('player')
        if not bad then for _, e in pairs(s.find_entities_filtered{area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}, force = 'player'}) do
          if e.name ~= 'stone-wall' and e.type ~= 'character' then bad = true end end end
        if bad then o[#o+1] = bit end end
      return o end)()""" % packed)
    skip = {tuple(float(q) for q in str(r).split(",")) for r in rows(v)}
    if skip:
        print(f"  {label}: 못 쓰는 칸 {sorted(skip)}", flush=True)
    return [st for st in out if (st[1]["x"], st[1]["y"]) not in skip]


def south_safe(ai):
    def f(part):
        xs = [p["x"] for _, p in part]
        for x in (min(xs), max(xs)):
            n = enemies_near(ai, x, 57.0, 40)
            if n:
                return f"적 {n} 이 40 칸 안 (x {x})"
        return None
    return f


def stage_south_wall(ai, crew) -> bool:
    steps = south_wall_steps(ai)
    return run_rounds(ai, crew, steps, "south_wall", stand=lambda p: (p["x"], 49.5), park=(-20.5, 40.5),
                      rounds=10, safe=south_safe(ai))


def verify_south_wall(ai) -> None:
    steps = south_wall_steps()
    up = p1.standing(ai, steps)
    miss = sorted({p["x"] for _, p in steps if (WALL, p["x"], p["y"]) not in up})
    east = [x for x in miss if x >= -20]
    print(f"  [south_wall] 돌벽 {len(up)}/{len(steps)} · 빈 x {len(miss)} (동쪽 끝 {len(east)}) {miss[:30]}")


# ================================================================== west_wall

# 벽은 «포탑 줄 바깥 가장자리에서 2~3 칸 앞», 줄 모양을 따라 (사용자: 멀면 스피터가 포탑 사거리 밖에서 벽만 부순다).
# 기관총 사거리 18 · 대형 스피터 ~15.
#   A 서북 무리 (-124,-49/-44) · 둘째 줄 (-121,-49/-44): 가장자리 x=-125 -> 벽 x -127.5/-128.5, y -54.5..-40.5
#   B 서쪽 줄 x=-116 (가장자리 -117): 벽 x -119.5/-120.5, y -40.5..55.5 -> 남쪽 벽 (-120.5, 56.5) 에 붙는다
#   위 이음 y -54.5/-53.5 (x -128.5..-113.5) -> 북서 서쪽 다리 벽 (x -114.5/-113.5, y ..-55.5) 에 붙는다
#   가운데 이음 y -41.5/-40.5 (x -128.5..-119.5) - 큰 바위 (-123.1,-40.9) 는 캔다
# 처음 지은 x -129.5/-128.5 (y -55.5..-4.5) 는 틀렸다: -129.5 전부와 A 밖의 -128.5 를 걷는다 (걷은 벽은 가방에 -> 다시 쓴다).
OLD_WALL_XS = (-129.5, -128.5)
OLD_Y0, OLD_Y1 = -55.5, -4.5
A_XS, A_Y0, A_Y1 = (-128.5, -127.5), -54.5, -40.5
B_XS, B_Y0, B_Y1 = (-120.5, -119.5), -40.5, 55.5
TOP_YS, TOP_X0, TOP_X1 = (-54.5, -53.5), -128.5, -113.5
MID_YS, MID_X0, MID_X1 = (-41.5, -40.5), -128.5, -119.5
HOT = (-52, -20)                                          # 가장 많이 맞는 구간 - 먼저


def _span(a, b):
    return [a + i for i in range(int(b - a) + 1)]


def wall_pts() -> set:
    pts = {(x, y) for x in A_XS for y in _span(A_Y0, A_Y1)}
    pts |= {(x, y) for x in B_XS for y in _span(B_Y0, B_Y1)}
    pts |= {(x, y) for y in TOP_YS for x in _span(TOP_X0, TOP_X1)}
    pts |= {(x, y) for y in MID_YS for x in _span(MID_X0, MID_X1)}
    return pts


def wall_steps(ai=None):
    order = sorted(wall_pts(), key=lambda p: (0 if HOT[0] <= p[1] <= HOT[1] else 1, abs(p[1] - (HOT[0] + HOT[1]) / 2), p))
    out = [p1.b(WALL, x, y) for x, y in order]
    return drop_bad_tiles(ai, out, "west_wall") if ai else out


def old_walls(ai) -> list:
    """틀린 자리 (새 배치에 없는) 에 선 돌벽."""
    keep = wall_pts()
    v = ai.lua("""(function() local o = {}
      for _, e in pairs(game.surfaces[1].find_entities_filtered{name = 'stone-wall', force = 'player', area = {{-130, -57}, {-128, -3}}}) do
        o[#o+1] = string.format('%.1f,%.1f', e.position.x, e.position.y) end return o end)()""")
    pts = [tuple(float(q) for q in str(r).split(",")) for r in rows(v)]
    return sorted((p for p in pts if p not in keep and p[0] in OLD_WALL_XS), key=lambda p: p[1])


def wall_safe(ai):
    def f(part):
        for _, p in part[:1] + part[-1:]:
            n = enemies_near(ai, p["x"], p["y"], 40)
            if n:
                return f"적 {n} 이 40 칸 안 ({p['x']},{p['y']})"
        return None
    return f


def pull_old(ai, crew) -> None:
    """틀린 벽 걷기 - 사람마다 한 토막, 늘 안쪽 (x -125.5) 에 서서."""
    for rnd in range(4):
        old = old_walls(ai)
        if not old:
            print("  west_wall: 틀린 벽 0", flush=True)
            return
        per = (len(old) + len(crew) - 1) // len(crew)
        sent = []
        for i, who in enumerate(crew):
            part = old[i * per:(i + 1) * per][:48]
            if not part:
                continue
            n = enemies_near(ai, -129.0, (part[0][1] + part[-1][1]) / 2, 40)
            if n:
                print(f"{who}: 벽 걷기 보류 (적 {n})", flush=True)
                continue
            plan, last = [], None
            for x, y in part:
                if last is None or abs(y - last) > 5:
                    plan.append(("walk_to", {"x": -125.5, "y": y}))
                    last = y
                plan.append(("demolish", {"x": x, "y": y, "name": WALL, "search_radius": 0.3}))
            plan = plan[:62] + [("walk_to", {"x": -100.5, "y": -30.5})]
            ai.agent(who).cancel()
            if submit(ai, who, plan, strict=False):
                sent.append(who)
            print(f"{who}: 틀린 벽 걷기 {rnd + 1}순번 ({len(part)}개)", flush=True)
        t0 = time.time()
        time.sleep(20 if sent else 45)
        while sent and time.time() - t0 < 900 and not p1.idle(ai, sent):
            time.sleep(5)
    print(f"  west_wall: 틀린 벽 남음 {len(old_walls(ai))}", flush=True)


def stage_west_wall(ai, crew) -> bool:
    pull_old(ai, crew)
    steps = wall_steps(ai)

    def stand(p):
        # 늘 벽 안쪽 (동쪽) 에 선다; 서쪽 줄 B 는 포탑 사이 x -118, A · 이음은 x -125.5 (둘 다 x -126 동쪽)
        return (-117.5 if p["x"] >= -121 else -125.5, p["y"] + (1.5 if p["y"] in MID_YS + TOP_YS else 0))
    ok = False
    for _ in range(2):
        ok = run_rounds(ai, crew, steps, "west_wall", stand=stand, park=(-100.5, -30.5), rounds=6, safe=wall_safe(ai))
        if ok:
            break
    return ok


def verify_west_wall(ai) -> None:
    steps = wall_steps()
    up = p1.standing(ai, steps)
    miss = sorted({(p["x"], p["y"]) for _, p in steps if (WALL, p["x"], p["y"]) not in up}, key=lambda p: p[1])
    hot = [p for p in miss if HOT[0] <= p[1] <= HOT[1]]
    print(f"  [west_wall] 돌벽 {len(up)}/{len(steps)} · 빈 칸 {len(miss)} (뜨거운 구간 {len(hot)}) {miss[:16]} · 틀린 벽 남음 {len(old_walls(ai))}")


# ================================================================== west_row2

# (포탑, 팔 (집는 쪽 방향), 전봇대 또는 None)
ROW2 = [((-121, -49), (-120.5, -47.5, S), (-121.5, -47.5)),        # 서북 가지 y=-46.5 북쪽
        ((-121, -44), (-120.5, -45.5, N), None),                    #            남쪽 (위 전봇대가 닿는다)
        ((-116, -42), (-114.5, -42.5, E), (-114.5, -43.5)),        # 탄 벨트 x=-113.5 곁 빈틈
        ((-116, -37), (-114.5, -36.5, E), None),                    # (-114.5,-37.5) 기존 전봇대
        ((-116, -31), (-114.5, -31.5, E), None),                    # (-114.5,-32.5)
        ((-116, -25), (-114.5, -25.5, E), None)]                    # (-114.5,-26.5)


def row2_steps():
    out = [p1.b(GUN, x, y) for (x, y), _, _ in ROW2]
    out += [p1.b(POLE, *p) for _, _, p in ROW2 if p]
    out += [p1.b(INS, ix, iy, d) for _, (ix, iy, d), _ in ROW2]
    return out


def row2_split(ai):
    def f(todo, crew):
        """포탑은 가방에 포탑 있는 사람에게, 나머지는 고르게."""
        guns = [st for st in todo if st[1]["name"] == GUN]
        rest = [st for st in todo if st[1]["name"] != GUN]
        stock = {w: int(bag(ai, w).get(GUN, 0)) for w in crew}
        parts = {w: [] for w in crew}
        for st in guns:
            w = max(crew, key=lambda k: stock[k])
            stock[w] -= 1
            parts[w].append(st)
        for i, st in enumerate(rest):
            parts[crew[i % len(crew)]].append(st)
        return parts
    return f


def row2_safe(ai):
    def f(part):
        n = enemies_near(ai, -121.0, -35.0, 40)
        return f"적 {n} 이 40 칸 안" if n else None
    return f


def stage_west_row2(ai, crew) -> bool:
    todo_guns = [st for st in row2_steps() if st[1]["name"] == GUN]
    up = p1.standing(ai, todo_guns)
    short = len(todo_guns) - len(up) - sum(int(bag(ai, w).get(GUN, 0)) for w in crew)
    if short > 0:
        who = crew[0]
        ids = submit(ai, who, gun_plan(ai, who, int(bag(ai, who).get(GUN, 0)) + short), strict=False) or []
        print(f"  west_row2: {who} 포탑 {short} 손제작 - 실패 {wait_ids(ai, ids, 600)}", flush=True)
    return run_rounds(ai, crew, row2_steps(), "west_row2", stand=lambda p: (p["x"] + 2.5, p["y"] + 1.5),
                      park=(-100.5, -30.5), rounds=6, safe=row2_safe(ai), split=row2_split(ai))


def turret_rows(ai, area) -> list:
    v = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player', area = {{%f, %f}, {%f, %f}}}) do
        local fed = 0
        for _, i in pairs(s.find_entities_filtered{type = 'inserter', force = 'player', area = {{t.position.x - 2, t.position.y - 2}, {t.position.x + 2, t.position.y + 2}}}) do
          if i.drop_target == t and i.energy > 0 then fed = fed + 1 end end
        o[#o+1] = {x = t.position.x, y = t.position.y, ammo = t.get_inventory(defines.inventory.turret_ammo).get_item_count(), fed = fed, hp = math.floor(t.health)} end
      return o end)()""" % area)
    return sorted(rows(v), key=lambda t: (t["x"], t["y"]))


def verify_west_row2(ai) -> None:
    want = {(x, y) for (x, y), _, _ in ROW2}
    ts = [t for t in turret_rows(ai, (-126, -52, -113, -20)) if (round(t["x"]), round(t["y"])) in want]
    print(f"  [west_row2] 둘째 줄 {len(ts)}/{len(ROW2)} · 팔 먹임 {sum(1 for t in ts if t['fed'])} · "
          + " ".join(f"({t['x']:.0f},{t['y']:.0f}) 탄{t['ammo']}" for t in ts))


# ================================================================== se_ammo

BELT_Y, INS_Y = 54.5, 53.5
SOUTH_END = -67.5                                         # 지금 벨트 끝 (동향)
EAST_END = 21.5
CROSS_X = -14.5                                           # 광석 벨트 (남향) - 지하로 넘는다


def south_guns(ai) -> list:
    return [t for t in turret_rows(ai, (SOUTH_END, 50, 23, 54)) if t["x"] > SOUTH_END]


def se_ammo_steps(ai=None) -> list:
    out = []
    x = SOUTH_END + 1
    while x <= EAST_END:
        if x == CROSS_X - 1:
            k, p = p1.b(UG, x, BELT_Y, E)
            p["type"] = "input"
            out.append((k, p))
        elif x == CROSS_X + 1:
            k, p = p1.b(UG, x, BELT_Y, E)
            p["type"] = "output"
            out.append((k, p))
        elif x != CROSS_X:
            out.append(p1.b(BELT, x, BELT_Y, E))
        x += 1
    guns = [(t["x"], t["y"]) for t in south_guns(ai)] if ai else \
        [(x, 52) for x in (-62, -56, -50, -44, -38, -32, -26, -20, -17, -8, -2, 4, 10, 16, 21)]
    poles = []
    for gx, gy in sorted(guns):
        out.append(p1.b(INS, gx - 0.5, INS_Y, S))
        poles.append(gx + 0.5)
    # 전봇대 사이가 7.5 를 넘는 곳엔 가운데에 하나 (-17 -> -8 : 9 칸)
    xs, prev = [], SOUTH_END
    for px in poles:
        if px - prev > 7.0:
            mid = math.floor((prev + px) / 2) + 0.5
            if mid == CROSS_X:
                mid += 2
            xs.append(mid)
        xs.append(px)
        prev = px
    out += [p1.b(POLE, px, INS_Y) for px in xs]
    # 동쪽부터 (부서지는 쪽) 가 아니라 서쪽부터 - 벨트는 이어져야 흐른다. 사람마다 한 토막씩.
    out.sort(key=lambda st: st[1]["x"])
    return out


def stage_se_ammo(ai, crew) -> bool:
    steps = se_ammo_steps(ai)
    return run_rounds(ai, crew, steps, "se_ammo", stand=lambda p: (p["x"] + 1.5, 49.5), park=(-20.5, 40.5), rounds=8)


def trace_end(ai, x, y):
    v = ai.lua("""(function() local s = game.surfaces[1]
      local e = s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, position = {%f, %f}, radius = 0.3}[1]
      local seen, n, last, mags = {}, 0, nil, 0
      while e and not seen[e.unit_number] and n < 400 do
        n = n + 1 seen[e.unit_number] = true last = e
        for l = 1, e.get_max_transport_line_index() do mags = mags + e.get_transport_line(l).get_item_count() end
        if e.type == 'underground-belt' and e.belt_to_ground_type == 'input' then e = e.neighbours else e = e.belt_neighbours.outputs[1] end
      end
      return last and {n = n, x = last.position.x, y = last.position.y, items = mags} or {} end)()""" % (x, y))
    return v or {}


def verify_se_ammo(ai) -> None:
    ts = south_guns(ai)
    east = [t for t in ts if t["x"] > -10]
    print(f"  [se_ammo] 벨트 (-71.5,54.5) 부터: {trace_end(ai, -71.5, BELT_Y)} · 남쪽 x>-68 포탑 {len(ts)} 팔 먹임 "
          f"{sum(1 for t in ts if t['fed'])} · 동쪽 끝 (x>-10) {sum(1 for t in east if t['fed'])}/{len(east)}")
    print("      " + " ".join(f"({t['x']:.0f}) 탄{t['ammo']}{'*' if t['fed'] else ''} hp{t['hp']}" for t in ts))


# ================================================================== nw

# 북서 모서리 (사용자: "북서쪽 방어선도 좀 더 보완할 것. 공격당한듯").
# 줄: 서쪽 다리 포탑 x=-110 (y -102..-60) · 탄 벨트 x=-107.5 북향 -> y=-105.5 동향 · 북쪽 포탑 y=-108 (x -106..-58) · 팔 y=-106.5.
# 로보포트 (-100,-89): 서쪽 포트 (-111,-41) 와 49.2 칸 (물류 25+25) -> 한 망 (서쪽 창고 · 수리팩도 같이 쓴다).
# 건설 반경 55 -> x -155..-45, y -144..-34: 모서리 (-106,-108) 와 두 벽 전부.
# 전력: 기존 (-104.5,-88.5) -> 새 작은 전봇대 (-102.5,-86.5) (2.8 칸).
# 로보포트 재고 0 (조립기 (34.5,-38.5) 는 강철 · 톱니가 없어 멈춤, 고급 회로 90 만 든다) -> 손제작:
#   강철 45 (허브) + 톱니 45 (철 90) + 고급 회로 45 (그 조립기 입력에서).
NW_PORT = ((-87.0, -76.0), [(-87.5, -78.5)])                            # relocate 뒤 (처음 (-100,-89) + 전봇대 (-102.5,-86.5))
NW_CHEST = (-97.5, -88.5)
NW_BOTS, NW_PACKS, NW_SPARE, NW_WALLS = 10, 40, 6, 20
NW_ROWS_N = (-112.5, -111.5)                              # 북쪽 줄 바깥
NW_XS_W = (-114.5, -113.5)                                # 서쪽 다리 바깥
NW_X0, NW_X1 = -114.5, -59.5
NW_Y0, NW_Y1 = -110.5, -55.5                              # 서쪽 벽 위 이음 (y -54.5) 에 붙는다
CORNER = (-114.0, -112.0)


def nw_robo_steps():
    (at, poles) = NW_PORT
    return [p1.b(POLE, x, y) for x, y in poles] + [p1.b(PORT, *at), p1.b(SC, *NW_CHEST)]


def nw_wall_steps(ai=None):
    pts = {(x, y) for x in [NW_X0 + i for i in range(int(NW_X1 - NW_X0) + 1)] for y in NW_ROWS_N}
    pts |= {(x, y) for x in NW_XS_W for y in [NW_Y0 + i for i in range(int(NW_Y1 - NW_Y0) + 1)]}
    order = sorted(pts, key=lambda p: (abs(p[0] - CORNER[0]) + abs(p[1] - CORNER[1]), p))
    out = [p1.b(WALL, x, y) for x, y in order]
    return drop_bad_tiles(ai, out, "nw_wall") if ai else out


def nw_steps(ai=None):
    return nw_robo_steps() + nw_wall_steps(ai)


def nw_chest_stock(ai) -> dict:
    v = ai.lua("""(function() local c = game.surfaces[1].find_entity('storage-chest', {%f, %f})
      if not c then return {chest = 0} end
      return {chest = 1, guns = c.get_item_count('gun-turret'), walls = c.get_item_count('stone-wall'),
              cells = c.logistic_network and #c.logistic_network.cells or 0} end)()""" % NW_CHEST)
    return v or {}


def nw_prep(ai, who) -> list:
    """로보포트 · 저장 상자 · 로봇 · 수리팩 · 예비 포탑 · 예비 벽을 가방에."""
    at = NW_PORT[0]
    ps, ch, b = port_stock(ai, at), nw_chest_stock(ai), bag(ai, who)
    plan, fe, cu, steel, adv, crafts = [], 0, 0, 0, 0, []
    if not ps.get("port") and int(b.get(PORT, 0)) < 1:
        fe, steel, adv = fe + 90, steel + 45, adv + 45
        crafts += [("iron-gear-wheel", 45), (PORT, 1)]
    if not ch.get("chest") and int(b.get(SC, 0)) < 1:
        fe, cu, steel, adv = fe + 3, cu + 5, steel + 8, adv + 1
        crafts += [("steel-chest", 1), ("electronic-circuit", 3), (SC, 1)]
    for item, key, want, keep in (("construction-robot", "bots", NW_BOTS, 5), ("repair-pack", "packs", NW_PACKS, 20)):
        short = want - int(ps.get(key, 0)) - int(b.get(item, 0))
        for x, y in NE_PORTS:
            if short <= 0:
                break
            v = ai.lua("(function() local p = game.surfaces[1].find_entity('roboport', {%f, %f}) return {p and p.get_item_count('%s') or 0} end)()"
                       % (x, y, item))
            got = min(short, (int(rows(v)[0]) if rows(v) else 0) - keep)
            if got > 0:
                plan += take(x, y, item, got, dy=3)
                short -= got
        if short > 0 and item == "repair-pack":
            fe, cu = fe + 3 * short, cu + 2 * short
            crafts += [("repair-pack", short)]
    want_g = NW_SPARE - int(ch.get("guns", 0)) - int(b.get(GUN, 0))
    if want_g > 0:
        g = min(want_g, max(0, ne_count(ai, GUN) - 10))
        if g:
            plan += take(*NE_STORE, GUN, g)
    want_w = NW_WALLS - int(ch.get("walls", 0)) - int(b.get(WALL, 0))
    if want_w > 0:
        h = p1.hub(ai)
        plan += take(*h["stone-brick"][:2], "stone-brick", 5 * want_w)
        crafts += [(WALL, want_w)]
    for item, n in (("iron-plate", fe - int(b.get("iron-plate", 0))), ("copper-plate", cu - int(b.get("copper-plate", 0))),
                    ("steel-plate", steel - int(b.get("steel-plate", 0)))):
        if n > 0:
            s_ = nearest_store(ai, item, -80, -60, n + 2)
            if not s_:
                print(f"  nw: {item} {n} 을 가진 상자가 없다", flush=True)
                continue
            plan += take(s_[0], s_[1], item, n + 2)
    short = adv - int(b.get("advanced-circuit", 0))
    if short > 0:
        # 고급 회로 생산 조립기 출력부터, 모자라면 로보포트 조립기 입력 (개인 로보포트 공사와 겹치니 마지막에)
        v = ai.lua("""(function() local o = {}
          for _, a in pairs(game.surfaces[1].find_entities_filtered{type = 'assembling-machine', force = 'player'}) do
            local r = a.get_recipe()
            if r and r.name == 'advanced-circuit' then local n = a.get_inventory(defines.inventory.assembling_machine_output).get_item_count('advanced-circuit')
              if n > 0 then o[#o+1] = {x = a.position.x, y = a.position.y, n = n} end end end
          return o end)()""")
        for r in sorted(rows(v), key=lambda r: -int(r["n"])) + [{"x": ADV_AT[0], "y": ADV_AT[1], "n": 999}]:
            if short <= 0:
                break
            g = min(short, int(r["n"]))
            plan += take(float(r["x"]), float(r["y"]), "advanced-circuit", g, dy=2)
            short -= g
    # 제작은 이제 비차단이다 - 재료를 서로 뺏지 않게 (수리팩이 로보포트 톱니를 먹었다) 순서가 중요한 것은 block
    plan += [("craft", {"recipe": r, "count": n, "wait": "block" if r in ("iron-gear-wheel", PORT, "steel-chest", "electronic-circuit") else True})
             for r, n in crafts]
    return plan


def nw_safe(ai):
    def f(part):
        for _, p in part[:1] + part[-1:]:
            n = enemies_near(ai, p["x"], p["y"], 40)
            if n:
                return f"적 {n} 이 40 칸 안 ({p['x']},{p['y']})"
        return None
    return f


def stage_nw(ai, crew) -> bool:
    who = "foxtrot" if "foxtrot" in crew else crew[0]
    plan = nw_prep(ai, who)
    if plan:
        ai.agent(who).cancel()
        ids = submit(ai, who, plan, strict=False) or []
        print(f"  nw: {who} 모으기 {len(plan)} 단계 - 실패 {wait_ids(ai, ids, 1500)}", flush=True)
        print(f"  {who} 가방: " + str({k: v for k, v in bag(ai, who).items()
                                        if k in (PORT, SC, GUN, WALL, 'construction-robot', 'repair-pack', POLE)}), flush=True)
    ok = run_rounds(ai, [who], nw_robo_steps(), "nw_robo", stand=lambda p: (p["x"] + 3.5, p["y"] + 1.5), park=(-92.5, -84.5), rounds=5)
    at = NW_PORT[0]
    ps, ch, b = port_stock(ai, at), nw_chest_stock(ai), bag(ai, who)
    fin = []
    if ps.get("port"):
        fin.append(("walk_to", {"x": at[0] + 3.5, "y": at[1] + 1.5}))
        for item, key, want in (("construction-robot", "bots", NW_BOTS), ("repair-pack", "packs", NW_PACKS)):
            n = min(int(b.get(item, 0)), want - int(ps.get(key, 0)))
            if n > 0:
                fin.append(("insert", {"name": item, "x": at[0], "y": at[1], "count": n}))
    if ch.get("chest"):
        for item, want, cur in ((GUN, NW_SPARE, ch.get("guns", 0)), (WALL, NW_WALLS, ch.get("walls", 0))):
            n = min(int(b.get(item, 0)), want - int(cur))
            if n > 0:
                fin.append(("insert", {"name": item, "x": NW_CHEST[0], "y": NW_CHEST[1], "count": n}))
    if fin:
        ids = submit(ai, who, fin, strict=False) or []
        print(f"  nw: 채움 - 실패 {wait_ids(ai, ids, 400)}", flush=True)
    walls = run_rounds(ai, crew, nw_wall_steps(ai), "nw_wall", stand=lambda p: (max(p["x"], -111.5) + 1.0, max(p["y"], -109.5) + 1.0),
                       park=(-92.5, -84.5), rounds=10, safe=nw_safe(ai))
    return ok and walls


NW_AMMO_LUA = """(function() local s, o = game.surfaces[1], {}
  for _, p in pairs({{-87.5, -67.5}, {-78.5, -49.5}}) do
    local a = s.find_entity('assembling-machine-1', p) or s.find_entity('assembling-machine-2', p)
    if a then local st = '?' for k, v in pairs(defines.entity_status) do if v == a.status then st = k end end
      o[#o+1] = string.format('조립기 (%.1f,%.1f) %s 누적 %d 철 %d 출력 %d', p[1], p[2], st, a.products_finished,
        a.get_inventory(defines.inventory.assembling_machine_input).get_item_count('iron-plate'),
        a.get_inventory(defines.inventory.assembling_machine_output).get_item_count()) end end
  local sp = s.find_entities_filtered{name = 'splitter', position = {-105.5, -70.0}, radius = 0.6}[1]
  o[#o+1] = '분배기 (-105.5,-70) ' .. (sp and sp.splitter_output_priority or 'none')
  for name, box in pairs({['서쪽 다리 x=-107.5'] = {{-108, -106}, {-107, -71}}, ['북쪽 줄 y=-105.5'] = {{-108, -106}, {-56, -105}},
                          ['가지 x=-106.5'] = {{-107, -70}, {-106, -47}}}) do
    local n, c = 0, 0
    for _, e in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, area = box}) do
      c = c + 1 for l = 1, e.get_max_transport_line_index() do n = n + e.get_transport_line(l).get_item_count() end end
    o[#o+1] = string.format('%s: %d 칸 탄 %d', name, c, n) end
  return o end)()"""


def verify_nw(ai) -> None:
    at = NW_PORT[0]
    up = p1.standing(ai, nw_wall_steps())
    ts = turret_rows(ai, (-112, -110, -56, -58))
    gh = rows(ai.lua("""(function() local o = {} for _, g in pairs(game.surfaces[1].find_entities_filtered{type = 'entity-ghost', area = {{-130, -125}, {-50, -55}}}) do
      o[#o+1] = string.format('%s(%.1f,%.1f)', g.ghost_name, g.position.x, g.position.y) end return o end)()"""))
    print(f"  [nw] 포트 {port_stock(ai, at)} · 창고 {nw_chest_stock(ai)} · 돌벽 {len(up)}/{len(nw_wall_steps())} · 유령 {gh}")
    print(f"      포탑 {len(ts)} · 탄 {[t['ammo'] for t in ts]} · hp<400 {[(t['x'], t['y'], t['hp']) for t in ts if t['hp'] < 400]}")
    for line in rows(ai.lua(NW_AMMO_LUA)):
        print(f"      {line}")


# ================================================================== relocate

# 로보포트를 포탑 줄에서 20 칸+ 안쪽으로 (docs/roboport-guide.md: 줄 가까운 포트는 스피터 사거리 안이고,
# 건설 로봇이 공습 중 수리하러 날아가 죽는다). 건설 반경 55 로 줄을 덮는다.
#   서쪽 (-111,-41) -> x ≈ -91 (x=-116 줄에서 25)
#   북서 (-100,-89) -> (-88,-86) 근처 (서쪽 다리 x=-110 · 북쪽 줄 y=-108 에서 22) - 서쪽 새 포트와 ≤ 50 (한 망)
#   남동 A (8,44) -> y ≤ 32 (y=52 줄에서 20+) · 남동 B (-19,38) -> y ≤ 32 - 둘 사이 27, B 와 과학 포트 (-47,17) 한 망
# 저장 상자는 새 포트 물류 반경 (±25) 안에 이미 든다 (서쪽 (-108.5,-38.5) 17.5 · 북서 (-97.5,-88.5) · 남동 (11.5,44.5) ≤ 15) -> 그대로.
# 망마다 필터 없는 빈 저장 상자 하나 더 (해체 · 재건 여유): 남쪽 망 · 서쪽+북서 망.
MOVES = [  # (옛 포트, 목표, 목표 상자 (x0, x1, y0, y1) 또는 고정 자리 dict)
    ((-111.0, -41.0), (-91.0, -41.0), (-95, -86, -48, -34)),
    # 북서: 모서리 대각 안쪽 (-85,-85) 는 공장 (조립기) 이라 빈 4x4 가 없다 -> (-87,-76): 포탑까지 23 · 모서리 벽 (-114,-112) 45 · 서쪽 새 포트 35
    ((-100.0, -89.0), (-87.0, -76.0), (-88, -84, -77, -73)),
    # 남동 A: (8,30) 곁엔 전봇대가 없다 -> (2,30) + 작은 전봇대 (-5.5/-0.5, 30.5) 로 x=-11.5 줄 (-11.5,30.5) 에서 끈다. 동쪽 끝 벽 (23.5,57.5) 까지 35
    ((8.0, 44.0), (2.0, 30.0), {"x": 2, "y": 30, "poles": [(-5.5, 30.5), (-0.5, 30.5)], "cx": 4.5, "cy": 32.5}),
    ((-19.0, 38.0), (-19.0, 30.0), (-26, -12, 22, 32)),
]
EMPTY_FOR = [0, 2]                                        # 빈 저장 상자를 둘 새 포트 (서쪽 망 · 남쪽 망)


SITE_LUA = """(function() local s = game.surfaces[1]
  for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") x, y = tonumber(x), tonumber(y)
    if s.can_place_entity{name = 'roboport', position = {x, y}, force = 'player'} then
      local best, bd = nil, 1e9
      for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', force = 'player', position = {x, y}, radius = 10}) do
        local d = (p.position.x - x)^2 + (p.position.y - y)^2 if d < bd then best, bd = p, d end end
      if best then
        -- 공급 칸이 포트 가장자리에 «닿기만» 하면 전기가 안 온다 (실측: (-91,-41) (-87,-76) 둘 다 에너지 0) -> 한 칸 겹쳐야
        local r = best.name == 'medium-electric-pole' and 5.0 or 4.0
        local near = math.abs(best.position.x - x) <= r and math.abs(best.position.y - y) <= r
        local px, py = nil, nil
        if not near then
          px = x + (best.position.x > x and 2.5 or -2.5) py = y + (best.position.y > y and 2.5 or -2.5)
          if not s.can_place_entity{name = 'small-electric-pole', position = {px, py}, force = 'player'}
             or (px - best.position.x)^2 + (py - best.position.y)^2 > 7.5^2 then px = nil end
        end
        if near or px then
          local cx, cy = nil, nil
          for _, o in pairs({{2.5, -0.5}, {-2.5, -0.5}, {-0.5, 2.5}, {-0.5, -2.5}, {2.5, 0.5}, {-2.5, 0.5}}) do
            local qx, qy = x + o[1], y + o[2]
            if not (px and qx == px and qy == py) and s.can_place_entity{name = 'storage-chest', position = {qx, qy}, force = 'player'} then cx, cy = qx, qy break end
          end
          return {x = x, y = y, px = px, py = py, cx = cx, cy = cy}
        end
      end
    end
  end
  return {} end)()"""


def reloc_site(ai, target, box):
    x0, x1, y0, y1 = box
    cands = sorted(((x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)),
                   key=lambda p: (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2)
    v = ai.lua(SITE_LUA % ";".join(f"{x},{y}" for x, y in cands))
    return v if v and v.get("x") is not None else None


def turret_dist(ai, x, y) -> float:
    v = ai.lua("""(function() local best = 1e9
      for _, t in pairs(game.surfaces[1].find_entities_filtered{name = 'gun-turret', force = 'player', position = {%f, %f}, radius = 40}) do
        local d = math.sqrt((t.position.x - %f)^2 + (t.position.y - %f)^2) if d < best then best = d end end
      return {best} end)()""" % (x, y, x, y))
    return float(rows(v)[0]) if rows(v) else -1


def reloc_state(ai):
    v = ai.lua("""(function() local o = {}
      for _, p in pairs(game.surfaces[1].find_entities_filtered{name = 'roboport', force = 'player'}) do
        o[#o+1] = {x = p.position.x, y = p.position.y, bots = p.get_item_count('construction-robot'),
                   packs = p.get_item_count('repair-pack'), net = p.logistic_network and p.logistic_network.network_id or -1,
                   cells = p.logistic_network and #p.logistic_network.cells or 0,
                   storage = p.logistic_network and #p.logistic_network.storages or 0,
                   net_bots = p.logistic_network and p.logistic_network.all_construction_robots or 0} end
      return o end)()""")
    return rows(v)


def adv_take(ai, short) -> list:
    plan = []
    v = ai.lua("""(function() local o = {}
      for _, a in pairs(game.surfaces[1].find_entities_filtered{type = 'assembling-machine', force = 'player'}) do
        local r = a.get_recipe()
        if r and r.name == 'advanced-circuit' then local n = a.get_inventory(defines.inventory.assembling_machine_output).get_item_count('advanced-circuit')
          if n > 0 then o[#o+1] = {x = a.position.x, y = a.position.y, n = n} end end end
      return o end)()""")
    for r in sorted(rows(v), key=lambda r: -int(r["n"])) + [{"x": ADV_AT[0], "y": ADV_AT[1], "n": 999}]:
        if short <= 0:
            break
        g = min(short, int(r["n"]))
        plan += take(float(r["x"]), float(r["y"]), "advanced-circuit", g, dy=2)
        short -= g
    return plan


def sc_plan(ai, who, n) -> list:
    """저장 상자 n 개 손제작 (강철 상자 + 전자 회로 3 + 고급 회로 1)."""
    b = bag(ai, who)
    n -= int(b.get(SC, 0))
    if n <= 0:
        return []
    plan = []
    for item, k in (("steel-plate", 8), ("iron-plate", 3), ("copper-plate", 5)):
        short = k * n - int(b.get(item, 0))
        if short > 0:
            s_ = nearest_store(ai, item, -40, -40, short + 2)
            if s_:
                plan += take(s_[0], s_[1], item, short + 2)
    plan += adv_take(ai, n - int(b.get("advanced-circuit", 0)))
    return plan + [("craft", {"recipe": "steel-chest", "count": n, "wait": "block"}),
                   ("craft", {"recipe": "electronic-circuit", "count": 3 * n, "wait": "block"}),
                   ("craft", {"recipe": SC, "count": n, "wait": True})]


def stage_relocate(ai, crew) -> bool:
    ports = {(p["x"], p["y"]): p for p in reloc_state(ai)}
    jobs = []
    for i, (old, target, box) in enumerate(MOVES):
        if old not in ports:
            print(f"  relocate: {old} 에 포트가 없다 (이미 옮겼나) - 건너뜀", flush=True)
            continue
        s_ = dict(box) if isinstance(box, dict) else reloc_site(ai, target, box)
        if not s_:
            print(f"  relocate: {old} -> {target} 자리 없음 (상자 {box})", flush=True)
            continue
        jobs.append((i, old, ports[old], s_))
        print(f"  relocate: {old} -> ({s_['x']},{s_['y']}) 전봇대 {s_.get('poles') or (s_.get('px'), s_.get('py'))} · 빈 상자 {s_.get('cx')},{s_.get('cy')}"
              f" · 포탑까지 {turret_dist(ai, float(s_['x']), float(s_['y'])):.1f}", flush=True)
    ids_all = []
    n_empty = sum(1 for i, *_ in jobs if i in EMPTY_FOR)
    crafter = crew[-1]
    for k, (i, old, st, s_) in enumerate(jobs):
        who = crew[k % len(crew)]
        x, y = float(s_["x"]), float(s_["y"])
        plan = []
        if who == crafter and n_empty:
            plan += sc_plan(ai, crafter, n_empty)
        poles = s_.get("poles") or ([(float(s_["px"]), float(s_["py"]))] if s_.get("px") is not None else [])
        s_["poles"] = poles
        if poles and int(bag(ai, who).get(POLE, 0)) < len(poles):
            plan += p1.fetch(ai, who, {POLE: len(poles)})
        plan += [("walk_to", {"x": old[0] + 3.5, "y": old[1] + 1.5})]
        if st["bots"]:
            plan.append(("take", {"name": "construction-robot", "x": old[0], "y": old[1], "count": int(st["bots"])}))
        if st["packs"]:
            plan.append(("take", {"name": "repair-pack", "x": old[0], "y": old[1], "count": int(st["packs"])}))
        plan += [("demolish", {"x": old[0], "y": old[1], "name": PORT, "search_radius": 1.0}),
                 ("walk_to", {"x": x + 3.5, "y": y + 1.5})]
        plan += [p1.b(POLE, px, py) for px, py in poles]
        plan.append(p1.b(PORT, x, y))
        if st["bots"]:
            plan.append(("insert", {"name": "construction-robot", "x": x, "y": y, "count": int(st["bots"])}))
        if st["packs"]:
            plan.append(("insert", {"name": "repair-pack", "x": x, "y": y, "count": int(st["packs"])}))
        if i in EMPTY_FOR and s_.get("cx") is not None:
            if who != crafter:
                plan += sc_plan(ai, who, 1)
            plan.append(p1.b(SC, float(s_["cx"]), float(s_["cy"])))
        ai.agent(who).cancel()
        ids = submit(ai, who, plan[:63], strict=False) or []
        ids_all += list(ids)
        print(f"{who}: 포트 옮기기 {old} -> ({x},{y}) {len(plan)} 단계", flush=True)
    fails = wait_ids(ai, ids_all, 1500)
    print(f"  relocate: 실패 {fails}", flush=True)
    # 뜯긴 포트가 가방에 남았으면 (build 실패) 한 번 더
    left = [(who, s_) for k, (i, old, st, s_) in enumerate(jobs) for who in [crew[k % len(crew)]]
            if not p1.standing(ai, [p1.b(PORT, float(s_["x"]), float(s_["y"]))])]
    for who, s_ in left:
        if int(bag(ai, who).get(PORT, 0)):
            ok = run_rounds(ai, [who], [p1.b(PORT, float(s_["x"]), float(s_["y"]))], "relocate-retry",
                            stand=lambda p: (p["x"] + 3.5, p["y"] + 1.5), park=(-40.5, -30.5), rounds=3)
            print(f"  {who}: 다시 짓기 {ok}", flush=True)
    return all(p1.standing(ai, [p1.b(PORT, float(s_["x"]), float(s_["y"]))]) for _, _, _, s_ in jobs)


def verify_relocate(ai) -> None:
    for p in sorted(reloc_state(ai), key=lambda p: (p["net"], p["x"])):
        print(f"  [relocate] 포트 ({p['x']:.0f},{p['y']:.0f}) 망 {p['net']} (셀 {p['cells']} · 저장 {p['storage']} · 로봇 {p['net_bots']})"
              f" 로봇 {p['bots']} 수리팩 {p['packs']} · 포탑까지 {turret_dist(ai, p['x'], p['y']):.1f}")


# ================================================================== 공통

STAGES = {"se_robo": (stage_se_robo, verify_se_robo, se_robo_steps),
          "south_wall": (stage_south_wall, verify_south_wall, south_wall_steps),
          "nw": (stage_nw, verify_nw, nw_steps),
          "west_wall": (stage_west_wall, verify_west_wall, wall_steps),
          "west_row2": (stage_west_row2, verify_west_row2, row2_steps),
          "se_ammo": (stage_se_ammo, verify_se_ammo, se_ammo_steps),
          "relocate": (stage_relocate, verify_relocate, lambda *a: [])}


def survey(ai) -> None:
    for name, (_, _, fn) in STAGES.items():
        steps = fn(ai) if name in ("west_wall", "se_ammo", "south_wall", "nw") else fn()
        bad = p1.blocked(ai, steps)
        print(f"  {name}: {len(p1.standing(ai, [s for s in steps if s[0] == 'build']))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(bad)} {bad[:8]}")
    print(f"  서쪽 성벽 40 칸 안 적 유닛 {enemies_near(ai, -129, -30, 40)} · 남동 끝 40 칸 안 {enemies_near(ai, 12, 60, 40)}")
    for w in CREW_OK:
        b = bag(ai, w)
        print(f"  {w}: " + str({k: b.get(k) for k in (GUN, WALL, 'stone-brick', PORT, BELT, UG, INS, POLE, 'iron-plate', 'copper-plate') if b.get(k)}))
    for name, (_, v, _) in STAGES.items():
        v(ai)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.verify:
        for _, (_, v, _) in STAGES.items():
            v(ai)
        return 0
    stages = [s for s in a.stage.split(",") if s]
    crew = [w for w in a.who.split(",") if w]
    if not (stages and crew):
        survey(ai)
        return 0
    bad = [w for w in crew if w not in CREW_OK] + [s for s in stages if s not in STAGES]
    if bad:
        print(f"  쓸 수 없다: {bad} (사람은 {CREW_OK}, 단계는 {list(STAGES)})")
        return 2
    os.environ[detached.ENV] = OWNER
    detached.mark(crew, OWNER, minutes=180)
    ok = True
    try:
        for s in stages:
            print(f"==== {s} {time.strftime('%H:%M:%S')}", flush=True)
            try:
                r = STAGES[s][0](ai, crew)
            except (RconError, KeyError, TypeError) as exc:
                print(f"  {s}: 오류 {exc!r}", flush=True)
                r = False
            ok = ok and bool(r)
            STAGES[s][1](ai)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

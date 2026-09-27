"""로봇 크립 - 서쪽 둥지를 «사람 없이» 친다 (사용자 결정 3: "사람 없이 치기").

사람은 벽 안에서만 걷는다 (x > -126). 포탑 · 탄 · 로보포트는 전부 건설 로봇이 놓고 나른다.

    1. stock  : alpha · bravo · charlie · foxtrot 가방의 포탑 · 관통탄 · 수리팩 · 벽 → 서쪽 망 빈 저장 상자 STORE.
                alpha · bravo 의 건설 로봇 20 → 서쪽 포트 (-91,-41).
    2. port   : 전진 로보포트 (-139,-41). 로보포트 아이템이 기지에 0 (강철 · 고급 회로 바닥) 이라
                건설 범위가 «다른 포트와 100% 겹치는» 북동 끝 (36,-84) 를 로봇 철거 → 전진 자리 유령으로 옮긴다.
                전봇대 2 · 호위 포탑 4 · 돌벽 한 줄도 유령. 서쪽 포트 (-91,-41) 건설 범위 (x ≥ -146) 안이라 로봇이 짓는다.
                물류 범위 |dx| = 48 ≤ 50 → 한 망. 전진 포트 건설 범위 x ≥ -194 → 둥지 거의 전부.
    3. 탄     : 2.0 은 item-request-proxy 로 건설 로봇이 포탑에 탄을 넣는다 (실측 확인 - REPORT 참조).
                LuaSurface.create_entity{name='item-request-proxy', target=turret, modules={BlueprintInsertPlan}}.
                유령에는 ghost.insert_plan = {...} 을 쓰면 지어지는 순간 프록시가 생긴다.
    4. waves  : 남은 구조물의 동쪽 끝에서 14칸 (포탑 사거리 18 안) 두 열에 포탑 유령 N, 각 관통탄 20.
                지켜보며 탄이 10 밑이면 다시 요청. 구조물 0 / 재료 바닥 / 로봇 급감이면 멈춘다.

    python scripts/rcreep23.py                       # 조사
    python scripts/rcreep23.py --stage stock
    python scripts/rcreep23.py --stage proxytest
    python scripts/rcreep23.py --stage port
    python scripts/rcreep23.py --stage waves --waves 4 --n 14
    python scripts/rcreep23.py --verify
"""
import argparse
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
os.environ.setdefault("AI_OWNER", "rcreep")
import detached  # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit  # noqa: E402

LOG = r"C:\Users\parkk\AppData\Local\Temp\claude\D--park-YD-Claude-RND\9b205ba9-e407-40e8-bb8a-4dff044957ad\scratchpad\loops\rcreep.log"
OWNER = "rcreep"
CREW = ("alpha", "bravo", "charlie", "foxtrot")
STORE = (-88.5, -41.5)                 # 서쪽 망 빈 저장 상자 - 크립 재료는 여기에만
WEST_PORT = (-91, -41)
OLD_PORT = (36, -84)                   # 북동 끝 잎 포트 - 건설 범위 전부 다른 포트와 겹침 (only 0). (-24,-88) 은 proboport23 NE_NET 기준점이라 둔다
FWD = (-139, -41)
FWD_POLES = [(-132.5, -46.5), (-136.5, -43.5)]   # (-126.5,-47.5) 벽 안 전봇대에서 6.1 · 4.5
GUARD = [(-144, -47), (-144, -43), (-144, -39), (-144, -35)]
GUARD_WALL_X = -147.5
GUARD_WALL_Y = (-50, -32)
NEST_AT, NEST_R = (-192, -26), 40            # --nest 로 바꾼다 (북서 -212,-106 · 25)
SWARM_R = 70
AMMO = "piercing-rounds-magazine"
AMMO_EACH, AMMO_LOW = 20, 10
RANGE = 18
NEAR = 14                               # 열 앞줄 = 동쪽 끝 구조물 + 14 (뒤 열 +2)
FWD_X = -130                           # 이보다 서쪽의 우리 포탑 = 크립 포탑 (탄 관리 대상)
TURRET_TURRET = "gun-turret"


def log(*a):
    msg = time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(msg, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(msg + "\n")
    except OSError:
        pass


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


# ---------------------------------------------------------------- 조사

SURVEY_LUA = r"""(function() local s, f = game.surfaces[1], game.forces.player local o = {}
  local wp = s.find_entity('roboport', {%(wx)d, %(wy)d}); local net = wp and wp.logistic_network
  if net then o.net = {bots = net.all_construction_robots, avail = net.available_construction_robots, cells = #net.cells,
      turrets = net.get_item_count('gun-turret'), ammo = net.get_item_count('%(ammo)s'), packs = net.get_item_count('repair-pack'),
      walls = net.get_item_count('stone-wall'), poles = net.get_item_count('small-electric-pole'), ports = net.get_item_count('roboport')} end
  local st = s.find_entities_filtered{name = 'storage-chest', position = {%(sx)f, %(sy)f}, radius = 0.6}[1]
  if st then o.store = {turrets = st.get_item_count('gun-turret'), ammo = st.get_item_count('%(ammo)s'), packs = st.get_item_count('repair-pack'),
      walls = st.get_item_count('stone-wall'), ports = st.get_item_count('roboport')} end
  -- 서쪽 예비 상자 (필터 gun-turret, 13:34 부터 - 철거된 포탑이 여기로 모인다)
  local sp = s.find_entities_filtered{name = 'storage-chest', position = {-108.5, -38.5}, radius = 0.6}[1]
  if o.store and sp then o.store.turrets = o.store.turrets + sp.get_item_count('gun-turret') end
  local fp = s.find_entity('roboport', {%(fx)d, %(fy)d})
  o.fwd = fp and {net = fp.logistic_network and fp.logistic_network.network_id or -1, e = math.floor(fp.energy / 1e6),
      same = (fp.logistic_network and net and fp.logistic_network.network_id == net.network_id) or false,
      bots = fp.get_item_count('construction-robot'), packs = fp.get_item_count('repair-pack')} or false
  o.fwd_ghost = s.count_entities_filtered{name = 'entity-ghost', ghost_name = 'roboport', position = {%(fx)d, %(fy)d}, radius = 1}
  o.old = s.find_entity('roboport', {%(ox)d, %(oy)d}) and (s.find_entity('roboport', {%(ox)d, %(oy)d}).to_be_deconstructed() and 'decon' or 'standing') or 'gone'
  o.foes = {}
  for _, e in pairs(s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = {%(nx)d, %(ny)d}, radius = %(nr)d}) do
    o.foes[#o.foes + 1] = string.format('%%s|%%.1f|%%.1f|%%d', e.name, e.position.x, e.position.y, e.health) end
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = {%(nx)d, %(ny)d}, radius = %(sr)d}
  o.big = s.count_entities_filtered{force = 'enemy', name = {'big-biter', 'big-spitter', 'behemoth-biter', 'behemoth-spitter'},
      position = {%(nx)d, %(ny)d}, radius = %(sr)d}
  o.guns = {}
  for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = f, area = {{-230, -130}, {%(fwdx)d, 10}}}) do
    local inv = t.get_inventory(defines.inventory.turret_ammo)
    local px = s.count_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.5}
    o.guns[#o.guns + 1] = string.format('%%.0f|%%.0f|%%d|%%d|%%d', t.position.x, t.position.y, t.health, inv.get_item_count(), px) end
  o.ghosts = s.count_entities_filtered{name = 'entity-ghost', force = f, area = {{-230, -130}, {%(fwdx)d, 10}}}
  o.proxies = s.count_entities_filtered{name = 'item-request-proxy', force = f, area = {{-230, -130}, {%(fwdx)d, 10}}}
  o.tick = game.tick
  return o end)()"""


def survey(ai) -> dict:
    r = ai.lua(SURVEY_LUA % dict(wx=WEST_PORT[0], wy=WEST_PORT[1], ammo=AMMO, sx=STORE[0], sy=STORE[1], fx=FWD[0], fy=FWD[1],
                                 ox=OLD_PORT[0], oy=OLD_PORT[1], nx=NEST_AT[0], ny=NEST_AT[1], nr=NEST_R, sr=SWARM_R, fwdx=FWD_X))
    r["foes"] = [(a, float(b), float(c), int(d)) for a, b, c, d in (str(x).split("|") for x in rows(r.get("foes")))]
    r["guns"] = [tuple(int(float(v)) for v in str(x).split("|")) for x in rows(r.get("guns"))]
    return r


def show(ai, label="조사") -> dict:
    s = survey(ai)
    sp = sum(1 for f in s["foes"] if "spawner" in f[0])
    log(f"[{label}] tick {s['tick']} · 둥지 구조물 {len(s['foes'])} (산란기 {sp}) · 수비대 {s['units']} (대형 {s['big']})")
    log(f"  망: {s.get('net')} · 상자 {STORE}: {s.get('store')}")
    log(f"  전진 포트: {s.get('fwd')} · 유령 {s['fwd_ghost']} · 옛 포트 {OLD_PORT}: {s['old']}")
    g = s["guns"]
    log(f"  크립 포탑 {len(g)} (탄 합 {sum(x[3] for x in g)}, 탄<{AMMO_LOW} {sum(1 for x in g if x[3] < AMMO_LOW)}) · 유령 {s['ghosts']} · 프록시 {s['proxies']}")
    for n, x, y, hp in sorted(s["foes"], key=lambda f: -f[1]):
        log(f"    {n:<22} ({x:.0f},{y:.0f}) hp {hp}")
    return s


# ---------------------------------------------------------------- 1. 재료 넣기

def wait_ids(ai, ids, limit=600):
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(6)
        try:
            if all(ai.poll(t)["status"] in ("done", "failed", "cancelled") for t in ids):
                break
        except RconError:
            pass
    bad = []
    for t in ids:
        try:
            p = ai.poll(t)
        except RconError:
            continue
        if p["status"] != "done":
            bad.append((p.get("type"), p["status"], p.get("error")))
    return bad


def stage_stock(ai) -> None:
    alive = {w["name"]: w for w in ai.list()}
    crew = [w for w in CREW if alive.get(w, {}).get("alive")]
    detached.mark(crew, OWNER, minutes=20)
    try:
        ids = {}
        for i, who in enumerate(crew):
            bag = ai.agent(who).items()
            plan = [("walk_to", {"x": STORE[0] + 2 - i, "y": STORE[1] + 2.5})]
            for item in ("gun-turret", AMMO, "repair-pack", "stone-wall"):
                if bag.get(item, 0) > 0:
                    plan.append(("insert", {"name": item, "x": STORE[0], "y": STORE[1], "count": int(bag[item])}))
            if who in ("alpha", "bravo") and bag.get("construction-robot", 0) > 0:
                plan.append(("walk_to", {"x": WEST_PORT[0], "y": WEST_PORT[1] + 3.5}))
                plan.append(("insert", {"name": "construction-robot", "x": WEST_PORT[0], "y": WEST_PORT[1],
                                        "count": int(bag["construction-robot"])}))
            submit(ai, who, plan, strict=False)
            log(f"{who}: 넣기 {[(k, p.get('name'), p.get('count')) for k, p in plan if k == 'insert']}")
        time.sleep(3)
        # submit 이 id 를 돌려주지 않으니 사람이 한가해질 때까지 본다
        for _ in range(60):
            time.sleep(5)
            busy = [w["name"] for w in ai.list() if w["name"] in crew and (w.get("current") or w.get("queued"))]
            if not busy:
                break
    finally:
        detached.release(crew)
    for who in crew:
        bag = ai.agent(who).items()
        log(f"  {who} 남은 것: " + str({k: bag.get(k, 0) for k in ("gun-turret", AMMO, "repair-pack", "stone-wall", "construction-robot")}))
    show(ai, "stock 뒤")


# ---------------------------------------------------------------- 탄 요청 (item-request-proxy)

PROXY_LUA = r"""(function() local s, f = game.surfaces[1], game.forces.player local o = {made = 0, skip = 0, err = nil}
  for bit in string.gmatch("%(spots)s", "[^;]+") do
    local x, y = string.match(bit, "([^,]+),([^,]+)")
    local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = {tonumber(x), tonumber(y)}, radius = 0.6}[1]
    if t then
      local have = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
      local pend = s.count_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.5}
      local st = t.get_inventory(defines.inventory.turret_ammo)[1]
      local item = (st.valid_for_read and st.name) or '%(ammo)s'   -- 슬롯에 든 탄과 같은 것만 들어간다
      if have < %(low)d and pend == 0 then
        local ok, r = pcall(function() return s.create_entity{name = 'item-request-proxy', position = t.position, force = f, target = t,
          modules = {{id = {name = item}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %(n)d - have}}}}}} end)
        if ok and r then o.made = o.made + 1 else o.err = tostring(r) end
      else o.skip = o.skip + 1 end
    end
  end
  return o end)()"""


def request_ammo(ai, spots, n=AMMO_EACH, low=AMMO_LOW, ammo=None) -> dict:
    if not spots:
        return {"made": 0}
    if ammo is None:
        # 관통탄이 바닥나면 빈 포탑엔 일반 탄창
        left = ai.lua("""(function() local p = game.surfaces[1].find_entity('roboport', {%d, %d})
          return {n = p.logistic_network.get_item_count('%s')} end)()""" % (WEST_PORT[0], WEST_PORT[1], AMMO))["n"]
        ammo = AMMO if int(left) >= n else "firearm-magazine"
    packed = ";".join(f"{x},{y}" for x, y in spots)
    return ai.lua(PROXY_LUA % dict(spots=packed, low=low, ammo=ammo, n=n))


GHOST_LUA = r"""(function() local s, f = game.surfaces[1], game.forces.player local o = {made = 0, bad = {}, plan_ok = 0}
  for bit in string.gmatch("%(spots)s", "[^;]+") do
    local name, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
    x, y = tonumber(x), tonumber(y)
    if s.find_entities_filtered{name = name, force = f, position = {x, y}, radius = 0.3}[1]
       or s.find_entities_filtered{name = 'entity-ghost', ghost_name = name, force = f, position = {x, y}, radius = 0.3}[1] then
      o.bad[#o.bad + 1] = bit .. ':there'
    elseif s.can_place_entity{name = name, position = {x, y}, force = f, build_check_type = defines.build_check_type.ghost_place} then
      local g = s.create_entity{name = 'entity-ghost', inner_name = name, position = {x, y}, force = f, expires = false}
      if g then o.made = o.made + 1
        if name == 'gun-turret' and %(ammo_n)d > 0 then
          local ok = pcall(function() g.insert_plan = {{id = {name = '%(ammo)s'},
            items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %(ammo_n)d}}}}} end)
          if ok and g.insert_plan and #g.insert_plan > 0 then o.plan_ok = o.plan_ok + 1 end
        end
      end
    else o.bad[#o.bad + 1] = bit .. ':blocked' end
  end
  return o end)()"""


def ghosts(ai, items, ammo_n=AMMO_EACH) -> dict:
    """items: [(name, x, y)] - 유령. 포탑 유령엔 탄 insert_plan (지어지면 로봇이 탄을 가져온다)."""
    packed = ";".join(f"{n},{x},{y}" for n, x, y in items)
    return ai.lua(GHOST_LUA % dict(spots=packed, ammo=AMMO, ammo_n=ammo_n))


def stage_proxytest(ai) -> None:
    """서쪽 줄 안쪽 포탑 (-116,-39) 에 관통탄 2 를 요청 → 로봇이 넣는지. 슬롯에 다른 탄 (일반 탄창) 이 있으면
    못 넣으므로, 관통탄이 든 포탑이나 빈 포탑을 고른다."""
    pick = ai.lua(r"""(function() local s = game.surfaces[1] local best
      for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player', area = {{-126, -60}, {-104, -15}}}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        if inv.get_item_count('firearm-magazine') == 0 and inv.get_item_count('%s') < 150 then best = t break end end
      for _, p in pairs(s.find_entities_filtered{name = 'item-request-proxy', area = {{-126, -60}, {-104, -15}}}) do p.destroy() end
      return best and {x = best.position.x, y = best.position.y, n = best.get_item_count('%s')} or {} end)()""" % (AMMO, AMMO))
    if pick.get("x") is None:
        log("  proxytest: 관통탄 포탑 없음")
        return
    x, y, n0 = float(pick["x"]), float(pick["y"]), int(pick["n"])
    r = request_ammo(ai, [(x, y)], n=n0 + 2, low=10 ** 6)
    log(f"  proxytest: 포탑 ({x:.0f},{y:.0f}) 관통탄 {n0} → +2 요청 {r}")
    for i in range(20):
        time.sleep(6)
        now = ai.lua("""(function() local t = game.surfaces[1].find_entities_filtered{name = 'gun-turret', position = {%f, %f}, radius = 0.6}[1]
          return {n = t.get_item_count('%s'), px = game.surfaces[1].count_entities_filtered{name = 'item-request-proxy', position = {%f, %f}, radius = 0.5}} end)()"""
                     % (x, y, AMMO, x, y))
        log(f"    {6 * (i + 1)}초: 관통탄 {now['n']} · 프록시 {now['px']}")
        if int(now["px"]) == 0:
            log(f"  proxytest: 로봇 배달 {'성공' if int(now['n']) > n0 else '실패 (프록시만 사라짐)'} ({n0} → {now['n']})")
            return
    log("  proxytest: 2분 안에 배달 안 됨")


# ---------------------------------------------------------------- 2. 전진 포트

def stage_port(ai) -> None:
    s = survey(ai)
    if not s.get("fwd") and not s["fwd_ghost"]:
        if s["old"] == "standing":
            r = ai.lua("""(function() local p = game.surfaces[1].find_entity('roboport', {%d, %d})
              return {ok = p.order_deconstruction('player')} end)()""" % OLD_PORT)
            log(f"  옛 포트 {OLD_PORT} 로봇 철거 주문 {r}")
        r = ghosts(ai, [("roboport", FWD[0], FWD[1])])
        log(f"  전진 포트 유령 {FWD}: {r}")
    items = [("small-electric-pole", x, y) for x, y in FWD_POLES]
    items += [("gun-turret", x, y) for x, y in GUARD]
    items += [("stone-wall", GUARD_WALL_X, y + 0.5) for y in range(GUARD_WALL_Y[0], GUARD_WALL_Y[1])]
    r = ghosts(ai, items)
    log(f"  전봇대 · 호위 포탑 · 벽 유령: {r}")
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(15)
        s = survey(ai)
        fwd = s.get("fwd")
        g = [x for x in s["guns"] if (x[0], x[1]) in GUARD]
        log(f"  {int(time.time() - t0)}초: 옛 포트 {s['old']} · 전진 {fwd} · 호위 {[(x[0], x[1], x[3]) for x in g]} · 유령 {s['ghosts']} · 프록시 {s['proxies']}")
        request_ammo(ai, [(x[0], x[1]) for x in g])
        if fwd and fwd.get("same") and len(g) == len(GUARD) and all(x[3] >= AMMO_LOW for x in g) and s["ghosts"] == 0:
            break
    # 수리팩 · 로봇은 망이 알아서 - 전진 포트엔 상자의 수리팩이 쓰인다
    show(ai, "port 뒤")


# ---------------------------------------------------------------- 2b. 북서 전진 포트 (사용자 순서 2: 북서 둥지 -214,-105)
# 서쪽 전진 포트 (-139,-41) 와 물류가 닿게 (|dx| 33 · |dy| 49), 중형 웜 (-211,-98) 에서 40칸 (사거리 30 밖).
# 건설 범위 x ≥ -227 → 북서 구조물 (x -205..-219) 전부. 로보포트는 건설 범위가 다른 포트와 100% 겹치는 (20,-40) 을 옮긴다.
NW_OLD = (20, -40)
NW_FWD = (-172, -90)
NW_POLES = [(-115.5, -92.5), (-122.5, -92.5), (-129.5, -92.5), (-136.5, -92.5), (-143.5, -92.5),
            (-150.5, -92.5), (-157.5, -92.5), (-164.5, -92.5), (-169.5, -92.5)]   # 북서 줄 전봇대 (-108.5,-94.5) 에서
NW_GUARD = [(-177, -93), (-177, -89), (-177, -85)]


def clear_spots(ai, items) -> int:
    """자리 위 나무 · 바위를 로봇 철거 표시 (유령은 나무 위에 스크립트로 못 놓는다)."""
    packed = ";".join(f"{n},{x},{y}" for n, x, y in items)
    r = ai.lua(r"""(function() local s = game.surfaces[1] local n = 0
      for bit in string.gmatch("%s", "[^;]+") do local name, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local h = (name == 'roboport') and 2.5 or ((name == 'gun-turret') and 1.5 or 1)
        for _, e in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{tonumber(x) - h, tonumber(y) - h}, {tonumber(x) + h, tonumber(y) + h}}}) do
          if e.order_deconstruction('player') then n = n + 1 end end end
      return {n = n} end)()""" % packed)
    return int(r.get("n", 0))


def stage_port_nw(ai) -> None:
    items = [("roboport", NW_FWD[0], NW_FWD[1])] + [("small-electric-pole", x, y) for x, y in NW_POLES] + [("gun-turret", x, y) for x, y in NW_GUARD]
    log(f"  나무 · 바위 철거 표시 {clear_spots(ai, items)}")
    have = ai.lua("""(function() return {n = game.surfaces[1].count_entities_filtered{name = 'roboport', position = {%d, %d}, radius = 1}} end)()""" % NW_FWD)["n"]
    if not int(have):
        old = ai.lua("""(function() local p = game.surfaces[1].find_entity('roboport', {%d, %d}) if not p then return {r = 'gone'} end
          return {r = p.to_be_deconstructed() and 'already' or tostring(p.order_deconstruction('player'))} end)()""" % NW_OLD)
        log(f"  옛 포트 {NW_OLD} 철거 {old}")
    t0 = time.time()
    while time.time() - t0 < 600:
        r = ghosts(ai, items)
        st = ai.lua("""(function() local s = game.surfaces[1] local p = s.find_entity('roboport', {%d, %d})
          local w = s.find_entity('roboport', {%d, %d})
          return {port = p and (p.logistic_network and p.logistic_network.network_id or -1) or 0, e = p and math.floor(p.energy / 1e6) or 0,
            net = w.logistic_network.network_id, ghosts = s.count_entities_filtered{name = 'entity-ghost', area = {{-180, -100}, {-110, -80}}},
            trees = s.count_entities_filtered{to_be_deconstructed = true, area = {{-180, -100}, {-110, -80}}}} end)()""" % (NW_FWD + WEST_PORT))
        g = [x for x in survey(ai)["guns"] if (x[0], x[1]) in NW_GUARD]
        log(f"  {int(time.time() - t0)}초: 유령 새로 {r.get('made')} (막힘 {len(rows(r.get('bad')))}) · 남은 유령 {st['ghosts']} · 철거 대기 {st['trees']} · "
            f"포트 망 {st['port']} (서쪽 망 {st['net']}) · 에너지 {st['e']}MJ · 호위 {[(x[0], x[1], x[3]) for x in g]}")
        request_ammo(ai, [(x[0], x[1]) for x in g])
        if st["port"] == st["net"] and st["e"] > 0 and not st["ghosts"] and len(g) == len(NW_GUARD) and all(x[3] >= AMMO_LOW for x in g):
            break
        time.sleep(15)
    show(ai, "북서 포트 뒤")


# ---------------------------------------------------------------- 4. 파도

def column(foes, n):
    edge = max(f[1] for f in foes)
    near = [f for f in foes if f[1] >= edge - 10]              # 동쪽 끝 덩어리 중심 y
    cy = sum(f[2] for f in near) / len(near)
    cx = int(round(edge + NEAR))
    cx = max(cx, FWD[0] - 55 + 3)                               # 전진 포트 건설 범위 안 (-194 + 여유)
    per = (n + 1) // 2
    y0 = int(round(cy)) - (per - 1)
    out = []
    for i in range(per):
        out.append((cx, y0 + 2 * i))
        if len(out) < n:
            out.append((cx + 2, y0 + 2 * i))
    return out


def placeable(ai, spots):
    packed = ";".join(f"{x},{y}" for x, y in spots)
    r = ai.lua(r"""(function() local s, f = game.surfaces[1], game.forces.player local out = {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        if s.can_place_entity{name = 'gun-turret', position = {x, y}, force = f, build_check_type = defines.build_check_type.ghost_place}
           and s.count_entities_filtered{name = 'entity-ghost', position = {x, y}, radius = 1.4} == 0 then out[#out + 1] = x .. ',' .. y end end
      return out end)()""" % packed)
    return [tuple(int(float(v)) for v in str(b).split(",")) for b in rows(r)]


def drop_ghosts(ai) -> int:
    r = ai.lua("""(function() local n = 0 for _, g in pairs(game.surfaces[1].find_entities_filtered{name = 'entity-ghost', ghost_name = 'gun-turret',
        area = {{-230, -130}, {%d, 10}}}) do g.destroy() n = n + 1 end return {n = n} end)()""" % FWD_X)
    return int(r.get("n", 0))


def stage_waves(ai, waves, n, watch) -> int:
    s = show(ai, "파도 전")
    fwd = s.get("fwd")
    if not (fwd and fwd.get("same")):
        log("  전진 포트가 망에 없다 - 파도 안 함")
        return 1
    bots0 = s["net"]["bots"]
    for k in range(1, waves + 1):
        s = survey(ai)
        foes = s["foes"]
        if not foes:
            log("  둥지 구조물 0 - 끝")
            return 0
        stock = (s.get("store") or {}).get("turrets", 0)
        ammo = (s.get("store") or {}).get("ammo", 0)
        want = min(n, stock, ammo // AMMO_EACH)
        if want < 6:
            log(f"  재료 바닥: 상자 포탑 {stock} · 관통탄 {ammo} - 멈춤")
            return 2
        spots = placeable(ai, column(foes, n + 6))[:want]
        in_range = sum(1 for f in foes if any(math.hypot(f[1] - x, f[2] - y) <= RANGE for x, y in spots))
        guns0 = len(s["guns"])
        log(f"-- {k}파: 구조물 {len(foes)} · 수비대 {s['units']} (대형 {s['big']}) · 포탑 유령 {len(spots)} {spots[:2]}.. · 사거리 안 {in_range} · 로봇 {s['net']['bots']}")
        r = ghosts(ai, [("gun-turret", x, y) for x, y in spots])
        log(f"   유령 {r}")
        t0 = time.time()
        prev_foes = len(foes)
        built = set()
        while time.time() - t0 < watch:
            time.sleep(10)
            try:
                s = survey(ai)
            except RconError as e:
                log(f"   rcon {e}")
                continue
            spot_set = set(spots)
            mine = [g for g in s["guns"] if (g[0], g[1]) in spot_set]
            built |= {(g[0], g[1]) for g in mine}
            lost = len(built) - len(mine)
            r = request_ammo(ai, [(g[0], g[1]) for g in s["guns"]])
            # 부서진 포탑은 유령이 되고 로봇이 «가장 가까운» 상자의 포탑으로 다시 세운다. STORE 가 비면 그다음은
            # 북서 (-97.5,-88.5) · 허브 상자 = 다른 방어선 예비 → 전진 포탑 유령을 지운다 (재료 경계).
            if (s.get("store") or {}).get("turrets", 0) == 0 and s["ghosts"]:
                cut = drop_ghosts(ai)
                log(f"   STORE 포탑 0 - 전진 포탑 유령 {cut} 지움 (다른 망 예비 보호)")
            bots = s["net"]["bots"]
            log(f"   {int(time.time() - t0):>3}초: 구조물 {len(s['foes'])} · 수비대 {s['units']} (대형 {s['big']}) · 이 파 포탑 {len(mine)}/{len(spots)} "
                f"(잃음 {lost}, 탄 {sum(g[3] for g in mine)}) · 유령 {s['ghosts']} · 프록시 {s['proxies']} (+{r.get('made', 0)}) · 로봇 {bots}")
            if not s["foes"]:
                break
            if bots0 - bots >= 10:
                log(f"  [!] 로봇 급감 {bots0} → {bots} - 멈춤")
                return 3
            if built and not mine and s["ghosts"] == 0:
                log("  [!] 이 파 포탑이 전부 죽었다")
                break
            cx = sum(x for x, _ in spots) / len(spots)
            cy = sum(y for _, y in spots) / len(spots)
            if len(mine) == len(spots) and all(math.hypot(f[1] - cx, f[2] - cy) > RANGE + 3 for f in s["foes"]):
                log("   사거리 안 구조물을 다 쳤다")
                break
            if len(s["foes"]) < prev_foes:
                prev_foes = len(s["foes"])
        # 남은 유령은 치운다 (다음 열에 재료를 쓴다)
        left = drop_ghosts(ai)
        s = show(ai, f"{k}파 뒤")
        log(f"   남은 유령 치움 {left} · 크립 포탑 {guns0} → {len(s['guns'])}")
        if not s["foes"]:
            log("  둥지 구조물 0 - 끝")
            return 0
    return 0


NW_STORE = (-97.5, -88.5)
# 포탑 손제작 (강철 0: 톱니 10 · 구리 10 · 철 20). 벽 안 허브에서만 걷는다.
# 2파 때 STORE 가 빈 사이 로봇이 북서 예비 6 을 가져다 썼다 → alpha 몫 6 은 북서 상자로 되돌린다.
CRAFT = {"alpha": (6, NW_STORE), "bravo": (5, STORE), "charlie": (5, STORE), "foxtrot": (5, STORE)}


def stage_craft(ai) -> None:
    import p1
    crew = [w for w in CRAFT if any(x["name"] == w and x.get("alive") for x in ai.list())]
    detached.mark(crew, OWNER, minutes=20)
    try:
        for who in crew:
            n, dest = CRAFT[who]
            h = p1.hub(ai)
            bag = ai.agent(who).items()
            iron = max(0, 40 * n - int(bag.get("iron-plate", 0)))
            cu = max(0, 10 * n - int(bag.get("copper-plate", 0)))
            ix, iy = h["iron-plate"][:2]
            plan = [("walk_to", {"x": ix, "y": iy + 1.5}), ("take", {"name": "iron-plate", "x": ix, "y": iy, "count": iron})]
            if cu:
                cx, cy = h["copper-plate"][:2]
                plan += [("walk_to", {"x": cx, "y": cy + 1.5}), ("take", {"name": "copper-plate", "x": cx, "y": cy, "count": cu})]
            plan += [("craft", {"recipe": "iron-gear-wheel", "count": 10 * n}),
                     ("craft", {"recipe": "gun-turret", "count": n}),
                     ("walk_to", {"x": dest[0] + 1.5, "y": dest[1] + 2}),
                     ("insert", {"name": "gun-turret", "x": dest[0], "y": dest[1], "count": n})]
            if dest == STORE and bag.get("firearm-magazine", 0) > 0:
                # 관통탄이 바닥나면 빈 포탑에 일반 탄창 (request_ammo 폴백)
                plan.append(("insert", {"name": "firearm-magazine", "x": STORE[0], "y": STORE[1], "count": int(bag["firearm-magazine"])}))
            submit(ai, who, plan, strict=False)
            log(f"{who}: 포탑 {n} 제작 → {dest} (철 {iron} · 구리 {cu})")
            time.sleep(2)
        t0 = time.time()
        while time.time() - t0 < 420:
            time.sleep(8)
            if not [w["name"] for w in ai.list() if w["name"] in crew and (w.get("current") or w.get("queued"))]:
                break
    finally:
        detached.release(crew)
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for _, p in pairs({{%f, %f}, {%f, %f}}) do local c = s.find_entities_filtered{name = 'storage-chest', position = p, radius = 0.6}[1]
        o[#o + 1] = p[1] .. ',' .. p[2] .. ' 포탑 ' .. c.get_item_count('gun-turret') .. ' 노란탄 ' .. c.get_item_count('firearm-magazine') end
      return o end)()""" % (STORE + NW_STORE))
    log(f"  craft 뒤: {rows(r)}")


def stage_reclaim(ai) -> None:
    """사거리 안 구조물이 없는 전진 포탑 (호위 4 제외) 을 로봇 철거 → 상자로 (탄도 같이) → 다음 파에 다시 쓴다."""
    r = ai.lua("""(function() local s = game.surfaces[1] local n = 0
      for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player', area = {{-230, -130}, {-150, 10}}}) do
        if s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = t.position, radius = 22} == 0 then
          t.order_deconstruction('player') n = n + 1 end end
      return {n = n} end)()""")
    log(f"  reclaim: 철거 주문 {r}")
    t0 = time.time()
    while time.time() - t0 < 180:
        time.sleep(10)
        left = ai.lua("""(function() return {n = game.surfaces[1].count_entities_filtered{name = 'gun-turret', force = 'player',
          area = {{-230, -130}, {-150, 10}}, to_be_deconstructed = true}} end)()""")["n"]
        if not left:
            break
    show(ai, "reclaim 뒤")


RESERVE = 0          # STORE 포탑이 이 이하면 (재건) 유령을 지운다


def stage_block(ai, spec, watch) -> int:
    """포탑 덩어리를 한 번에 (웜 사거리 안은 각개 격파 금지). spec = 'x0,x1,y0,y1' (2칸 격자, 포탑 가운데)."""
    x0, x1, y0, y1 = (int(v) for v in spec.split(","))
    spots = [(x, y) for x in range(x0, x1 + 1, 2) for y in range(y0, y1 + 1, 2)]
    s = show(ai, "덩어리 전")
    have = (s.get("store") or {}).get("turrets", 0)
    ok = placeable(ai, spots)
    ok.sort(key=lambda p: p[0])                       # 서쪽 (웜 쪽) 열부터 - 재료가 모자라면 동쪽 끝을 뺀다
    use = ok[:max(0, have - RESERVE)]
    foes = s["foes"]
    hit = {f[0] + f"({f[1]:.0f},{f[2]:.0f})": sum(1 for x, y in use if math.hypot(f[1] - x, f[2] - y) <= RANGE) for f in foes}
    log(f"  덩어리 {len(use)}/{len(spots)} (놓을 수 있음 {len(ok)}, STORE 포탑 {have}, 남김 {RESERVE}) · 구조물별 사거리 안 포탑 {hit}")
    if len(use) < 12:
        log("  포탑 12 미만 - 각개 격파가 된다. 놓지 않음")
        return 2
    log(f"   유령 {ghosts(ai, [('gun-turret', x, y) for x, y in use])}")
    return stage_watch(ai, watch)


def stage_watch(ai, watch) -> int:
    """새로 놓지 않고 지켜보기만: 탄 보충 · STORE 가 비면 전진 포탑 유령 지움 · 로봇 급감이면 멈춤."""
    s = survey(ai)
    bots0, t0 = s["net"]["bots"], time.time()
    while time.time() - t0 < watch:
        time.sleep(10)
        try:
            s = survey(ai)
        except RconError as e:
            log(f"   rcon {e}")
            continue
        r = request_ammo(ai, [(g[0], g[1]) for g in s["guns"]])
        # 처음 60초는 놓은 유령에 로봇이 포탑을 들고 가는 중 - 지우면 파가 통째로 사라진다
        cut = drop_ghosts(ai) if (time.time() - t0 > 60 and (s.get("store") or {}).get("turrets", 0) <= RESERVE
                                  and s["ghosts"]) else 0
        st = s.get("store") or {}
        log(f"   watch {int(time.time() - t0):>3}초: 구조물 {len(s['foes'])} · 수비대 {s['units']} (대형 {s['big']}) · 크립 포탑 {len(s['guns'])} "
            f"(탄 {sum(g[3] for g in s['guns'])}) · 유령 {s['ghosts']} (지움 {cut}) · 프록시 {s['proxies']} (+{r.get('made', 0)}) · "
            f"로봇 {s['net']['bots']} · STORE 포탑 {st.get('turrets')} 탄 {st.get('ammo')}")
        if not s["foes"]:
            break
        if bots0 - s["net"]["bots"] >= 10:
            log("  [!] 로봇 급감 - 멈춤")
            return 3
    show(ai, "watch 뒤")
    return 0


def verify(ai) -> None:
    s = show(ai, "verify")
    alive = {w["name"]: (w.get("alive"), w.get("x"), w.get("y"), w.get("health")) for w in ai.list()}
    log(f"  사람: {alive}")
    west = [n for n, (a, x, _y, _h) in alive.items() if a and x is not None and float(x) < -126]
    log(f"  x < -126 에 있는 사람: {west or '없음'}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--waves", type=int, default=4)
    ap.add_argument("--n", type=int, default=14)
    ap.add_argument("--watch", type=int, default=360, help="파마다 지켜보는 초")
    ap.add_argument("--nest", default="", help="둥지 중심 x,y,r - 북서는 --nest=-212,-106,25")
    ap.add_argument("--block", default="", help="x0,x1,y0,y1 - 음수는 --block=-190,-184,-31,-21")
    ap.add_argument("--reserve", type=int, default=0, help="STORE 에 남길 포탑 (이하면 재건 유령 지움)")
    a = ap.parse_args()
    global RESERVE, NEST_AT, NEST_R
    RESERVE = a.reserve
    if a.nest:
        x, y, r = (float(v) for v in a.nest.split(","))
        NEST_AT, NEST_R = (int(x), int(y)), int(r)
    ai = AIBridge()
    if a.verify:
        verify(ai)
        return 0
    rc = 0
    for st in [x for x in a.stage.split(",") if x]:
        log(f"=== stage {st}")
        if st == "stock":
            stage_stock(ai)
        elif st == "proxytest":
            stage_proxytest(ai)
        elif st == "port":
            stage_port(ai)
        elif st == "craft":
            stage_craft(ai)
        elif st == "reclaim":
            stage_reclaim(ai)
        elif st == "port_nw":
            stage_port_nw(ai)
        elif st == "block":
            rc = stage_block(ai, a.block, a.watch)
        elif st == "watch":
            rc = stage_watch(ai, a.watch)
        elif st == "waves":
            rc = stage_waves(ai, a.waves, a.n, a.watch)
        else:
            log(f"  모르는 단계 {st}")
    if not a.stage:
        show(ai)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())

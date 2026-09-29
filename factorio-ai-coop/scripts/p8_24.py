"""P8 for run 24: second iron field - east outpost (409,-171), smelted on site, plates to the base on one fast belt.

사용자 결정 (2026-09-30) 셋을 처음부터 지킨다:
  (1) Lua relay 금지 - 이 파일에는 inv.remove → insert 가 없다. 물건은 사람 손 (take · craft · insert · build) · 벨트 · 팔.
  (2) 못 놓는 자리에 짓기 금지 - 전초는 사람이 build (게임 충돌 검사), 막힌 자리는 p1.blocked (can_place manual) 로 먼저 보고
      나무 · 바위만 치운다. 건물 · 물이면 그 칸은 «막힘» 으로 남긴다.
  (3) 벨트 한 줄 병목 - 필요 처리량부터 셈 (아래 표), 두 레인 · 빠른 벨트.

광맥 (걸어서 본 청크, survey --seen): iron-ore 중심 (409,-171) · 5.44M · 네모 (391,-191)~(433,-152), 북쪽은 호수 (y <= -192).
  기지 중심 (70,-15) 에서 373. 적: 반경 250 안 0, 둥지 · 벌레는 방위 20~40 도 (동남동) 250~400 에만.
  (다른 후보 (-215,-347) 8.45M 은 둥지 124 칸 - 버림.)

셈 (belt-research §6-1, 여유 1.3):
    목표 철판 15/s.   화로 강철로 24 × 0.625 = 15.0/s.   채굴기 32 × 0.5 = 16/s (둘째 줄 16 대씩 = 8/s)
    채굴 줄 (노랑, 양쪽 채굴기 → 두 레인 4/s + 4/s, 레인 7.5)              8 / 15   ✓
    화로 입력 줄 W · E (빠른, 광석은 옆싣기로 한 레인 7.5/s, 레인 15)       7.5 / 15 ✓ (다른 레인 석탄 0.27/s)
    판 줄 P = 줄기 (빠른, 서쪽 화로 → 동쪽 레인 7.5 · 동쪽 화로 → 서쪽 레인 7.5, 레인 15)  15 / 30 ✓  ceil(15/30*1.3)=1 줄
    팔 (기본, 벨트 집기 ~0.83/s): 화로 입력 0.625+석탄 0.02 = 0.65 → 78% ✓ · 결과 0.625 → 75% ✓
    석탄: 강철로 90 kW × 24 = 2.16 MW = 0.54/s → 입력 줄마다 상자 1 (사람 손) + 팔 (0.86/s ≥ 0.27)
    전력: 채굴기 32 × 90 kW + 팔 ~70 × 13 kW ≈ 3.8 MW (기지망에서 전봇대 줄)

    python scripts/p8_24.py --run run24 --measure                 # 경로 · 부지 적 (출정 조건) - 떠나기 직전마다
    python scripts/p8_24.py --run run24 --scout hotel             # 걸어서 경로 · 부지 (다리마다 출정 조건)
    python scripts/p8_24.py --run run24 --check def,mine,smelt,trunk,power
    python scripts/p8_24.py --run run24 --build def --crew hotel,delta
    python scripts/p8_24.py --run run24 --status
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401
import detached                          # noqa: E402
from client import AIBridge, RconError   # noqa: E402

N, E, S, W = 0, 4, 8, 12
EMD, SF, INS, BELT, FBELT = "electric-mining-drill", "steel-furnace", "inserter", "transport-belt", "fast-transport-belt"
CHEST, POLE, TUR, WALL = "iron-chest", "small-electric-pole", "gun-turret", "stone-wall"
SIZE = {EMD: 3, SF: 2, TUR: 2}
OWNER = "p8"
SITE = (409.0, -160.0)
STATE = os.path.join(HERE, "..", "state", "run24_p8.json")

GROUPS = {"def": [], "mine": [], "smelt": [], "trunk": [], "power": []}
_CUR = ["def"]


def add(name, x, y, d=N):
    GROUPS[_CUR[0]].append((name, float(x), float(y), d))


# --- mine: 채굴 줄 둘 (x 405.5 · 413.5, 남쪽으로), 채굴기 양쪽 8 줄 = 32 --------------------------------------------
_CUR[0] = "mine"
DRILL_Y = [-185.5 + 3 * k for k in range(8)]                    # -185.5 .. -164.5
for _bx in (405.5, 413.5):
    for _y in DRILL_Y:
        add(EMD, _bx - 2, _y, E)                                 # 서쪽 채굴기 → 동쪽으로 붓는다 (x-2+2.3 = 줄)
        add(EMD, _bx + 2, _y, W)
    for _y in range(-187, -149):
        add(BELT, _bx, _y + 0.5, S)
# 꺾어 화로 입력 줄 옆구리로 (옆싣기 → 한 레인)
add(BELT, 405.5, -148.5, W)
for _x in (404.5, 403.5, 402.5):
    add(BELT, _x, -148.5, W)
add(BELT, 413.5, -148.5, W)
add(BELT, 412.5, -148.5, W)
for _px in (401.5, 409.5, 417.5):
    for _py in (-184.5, -178.5, -172.5, -166.5):
        add(POLE, _px, _py)
add(POLE, 409.5, -160.5)
add(POLE, 409.5, -154.5)
add(POLE, 407.5, -150.5)

# --- smelt: 입력 W (401.5) | 팔 | 강철로 (404) | 팔 | 판 P (406.5) | 팔 | 강철로 (409) | 팔 | 입력 E (411.5) ------------
_CUR[0] = "smelt"
FURN_Y = [-147.0 + 2 * k for k in range(12)]                     # -147 .. -125
for _x in (401.5, 411.5):
    for _y in range(-150, -124):
        add(FBELT, _x, _y + 0.5, S)
for _y in range(-148, -124):
    add(FBELT, 406.5, _y + 0.5, S)
for _fy in FURN_Y:
    add(SF, 404.0, _fy)
    add(SF, 409.0, _fy)
    add(INS, 402.5, _fy - 0.5, W)                                # 입력 W → 화로
    add(INS, 405.5, _fy - 0.5, W)                                # 화로 → P (동쪽 레인)
    add(INS, 407.5, _fy - 0.5, E)                                # 화로 → P (서쪽 레인)
    add(INS, 410.5, _fy - 0.5, E)                                # 입력 E → 화로
for _k in range(0, 12, 2):
    for _px in (402.5, 405.5, 410.5):
        add(POLE, _px, FURN_Y[_k] + 0.5)
# 석탄: 상자 → 팔 → 입력 줄의 광석 반대 레인 (W: 광석 동쪽 레인 → 석탄 서쪽 / E: 광석 동쪽 레인 → 석탄 서쪽)
add(CHEST, 403.5, -149.5)
add(INS, 402.5, -149.5, E)
add(CHEST, 413.5, -146.5)
add(INS, 412.5, -146.5, E)
add(POLE, 400.5, -149.5)
COAL_CHESTS = [(403.5, -149.5), (413.5, -146.5)]

# --- trunk: P 에서 남쪽 → y -100.5 서쪽 → x 69.5 남쪽 → 철 줄기 머리 (69.5,-63.5) 뒤에 곧게 --------------------------
_CUR[0] = "trunk"
TRUNK_Y, JOIN_X = -100.5, 69.5
for _y in range(-124, -101):
    add(FBELT, 406.5, _y + 0.5, S)
add(FBELT, 406.5, TRUNK_Y, W)
for _x in range(70, 406):
    add(FBELT, _x + 0.5, TRUNK_Y, W)
add(FBELT, JOIN_X, TRUNK_Y, S)
for _y in range(-100, -64):
    add(FBELT, JOIN_X, _y + 0.5, S)

# --- power: 기지 전봇대 (76.5,-66.5) → 줄기 옆 (x 70.5 · y -99.5 · x 407.5) → 제련 전봇대 ---------------------------
_CUR[0] = "power"
add(POLE, 72.5, -68.5)
for _y in (-74.5, -81.5, -88.5, -95.5):
    add(POLE, 70.5, _y)
for _x in range(71, 407, 7):
    add(POLE, _x + 0.5, -99.5)
add(POLE, 405.5, -102.5)
for _y in (-106.5, -113.5, -120.5):
    add(POLE, 407.5, _y)

# --- def: 벽 고리 (서 x 391.5 · 남 y -113.5 · 동 x 427.5, 북은 호수) + 포탑 무리 4 (탄: 상자 → 팔 → 벨트 → 팔 → 포탑) --------
_CUR[0] = "def"
CLUSTERS = [(396, -172), (421, -172), (396, -136), (417, -136)]
for _cx, _cy in CLUSTERS:
    add(CHEST, _cx + 0.5, _cy - 5.5)
    add(INS, _cx + 0.5, _cy - 4.5, N)                            # 상자 → 벨트 머리
    for _y in range(_cy - 4, _cy + 4):
        add(BELT, _cx + 0.5, _y + 0.5, S)
    for _ty in (_cy - 2, _cy + 2):
        add(TUR, _cx - 2, _ty)
        add(INS, _cx - 0.5, _ty - 0.5, E)                        # 벨트 → 서쪽 포탑
        add(TUR, _cx + 3, _ty)
        add(INS, _cx + 1.5, _ty - 0.5, W)                        # 벨트 → 동쪽 포탑
    add(POLE, _cx + 1.5, _cy - 0.5)
    add(POLE, _cx - 0.5, _cy - 4.5)
add(POLE, 413.5, -131.5)                                         # 남동 무리 → 제련 전봇대
AMMO_CHESTS = [(cx + 0.5, cy - 5.5) for cx, cy in CLUSTERS]
WALL_SKIP = {(406.5, -113.5), (407.5, -113.5)}                  # 줄기 · 전봇대가 지나는 틈
for _y in range(-193, -113):
    add(WALL, 391.5, _y + 0.5)
for _y in range(-201, -113):
    add(WALL, 427.5, _y + 0.5)
for _x in range(392, 427):
    if (_x + 0.5, -113.5) not in WALL_SKIP:
        add(WALL, _x + 0.5, -113.5)
# 전봇대 줄 (407.5, y) 가 벽줄 y -113.5 에 서므로 그 자리는 벽 대신 전봇대 - 위 WALL_SKIP

# 판으로 따진 한 개 값 (2.0 레시피). 손제작은 중간재를 스스로 만든다.
COST = {FBELT: {"iron-plate": 3.5}, BELT: {"iron-plate": 1.5}, EMD: {"iron-plate": 23, "copper-plate": 4.5},
        INS: {"iron-plate": 4, "copper-plate": 1.5}, SF: {"steel-plate": 6, "stone-brick": 10}, CHEST: {"iron-plate": 8},
        POLE: {"copper-plate": 0.5, "wood": 0.5}}
PAIRED = {BELT, POLE}                                             # 빠른 벨트는 1 개씩
# 완제품을 먼저 가져올 곳 (저장 상자 - 망 재건 몫은 상자마다 남긴다). (59.5,-14.5) · (11.5,-9.5) 는 전환 담당 · P7 몫이라 안 쓴다.
STORES = [(103.5, -14.5), (67.5, 34.5), (77.5, 70.5), (-34.5, 14.5)]
STORE_KEEP = {TUR: 4, WALL: 40, EMD: 0, CHEST: 0, "wood": 20}
HUB_BOX = (62, -16.1, 74, -14.9)
HUB_KEEP = {"iron-plate": 0, "copper-plate": 0, "steel-plate": 100, "stone-brick": 300, "piercing-rounds-magazine": 50,
            TUR: 0, WALL: 0}


def ai_rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


# ------------------------------------------------------------------------------------------------ 적 재기 (출정 조건)
SEGS = [((69.5, -64.5), (69.5, -100.5)), ((69.5, -100.5), (406.5, -100.5)), ((406.5, -100.5), (406.5, -150)),
        ((406.5, -150), (409, -188))]


def measure(ai, pad=80) -> dict:
    """경로 선분 반경 pad 안 적 유닛 · 구조물 + 부지 반경 150/250/350 + 둥지 방위 (조회만 - 지도는 안 연다)."""
    import walkscout
    out = {"t": time.strftime("%X"), "route": [], "site": {}}
    for a, b in SEGS:
        out["route"].append(walkscout.route_foes(ai, a, b, pad))
    r = ai.lua("""(function()
      local s = game.surfaces[1]
      local cx, cy = %f, %f
      local out = {evo = game.forces.enemy.get_evolution_factor(s), tick = game.tick}
      for _, R in pairs({150, 250, 350}) do
        out["u" .. R] = s.count_entities_filtered{force = "enemy", position = {cx, cy}, radius = R, type = "unit"}
        out["s" .. R] = s.count_entities_filtered{force = "enemy", position = {cx, cy}, radius = R, type = {"unit-spawner", "turret"}}
      end
      local best, bb = 1e9, 0
      for _, e in pairs(s.find_entities_filtered{force = "enemy", position = {cx, cy}, radius = 450, type = {"unit-spawner", "turret"}}) do
        local dx, dy = e.position.x - cx, e.position.y - cy
        local d = math.sqrt(dx * dx + dy * dy)
        if d < best then best, bb = d, math.deg(math.atan2(dy, dx)) end
      end
      out.nest_d, out.nest_bearing = math.floor(best), math.floor(bb)
      return out
    end)()""" % SITE)
    out["site"] = r
    out["ok"] = all(not (f.get("units") or f.get("structs")) for f in out["route"]) and not r.get("u150") and not r.get("s150")
    return out


def scout(ai, who) -> None:
    """경로를 다리 (<= 40 칸) 로 걷고, 다리마다 떠나기 직전 선분 반경 80 적 0 을 다시 잰다. 부지 둘레를 한 바퀴."""
    import walkscout
    pts = [(69.5, -72), (69.5, -100.5)]
    x = 69.5
    while x < 406:
        x = min(406.5, x + 40)
        pts.append((x, -102))
    pts += [(406.5, -125), (398, -150), (388, -170), (395, -190), (420, -195), (432, -170), (430, -140), (420, -118), (409, -150)]
    detached.mark([who], OWNER, minutes=40)
    home = (69.5, -72)
    for i, p in enumerate(pts):
        r = walkscout.body(ai, who)
        if not r or not r.get("alive", True):
            print(who, "사망/부재", flush=True)
            return
        at = (float(r.get("x") or 0), float(r.get("y") or 0))
        walkscout.gen_ahead(ai, p)
        f = walkscout.route_foes(ai, at, p)
        if f.get("units") or f.get("structs"):
            print(f"{who} 다리 {i} -> {p}: 반경 80 적 {f} - 접고 돌아온다", flush=True)
            walkscout.walk(ai, who, home, home, limit=180)
            return
        res = walkscout.walk(ai, who, p, home, limit=120)
        print(time.strftime("%X"), f"{who} 다리 {i} {p}: {res}", flush=True)
        if res in ("dead", "foe"):
            return
    print(who, "정찰 끝 - 부지에 선다", json.dumps(measure(ai), ensure_ascii=False), flush=True)


# ------------------------------------------------------------------------------------------------ 짓기 (사람)
def steps_of(group):
    return [("build", {"name": n, "x": x, "y": y, "direction": d}) for n, x, y, d in GROUPS[group]]


def sources(ai, items) -> list:
    """items 가 든 허브 상자 · 저장 상자 (이름, x, y, 수)."""
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local want = {}
      for _, n in pairs(helpers.json_to_table('%s')) do want[n] = true end
      local cs = s.find_entities_filtered{type = {"container", "logistic-container"}, force = f, area = {{%f, %f}, {%f, %f}}}
      for _, p in pairs(helpers.json_to_table('%s')) do
        for _, c in pairs(s.find_entities_filtered{name = "storage-chest", force = f, position = p, radius = 0.6}) do cs[#cs+1] = c end
      end
      local out = {}
      for _, c in pairs(cs) do
        if c.name ~= "requester-chest" and c.name ~= "buffer-chest" then
          for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
            if want[v.name] then out[#out+1] = string.format("%%s,%%.1f,%%.1f,%%d,%%s", v.name, c.position.x, c.position.y, v.count, c.name) end
          end
        end
      end
      return out
    end)()""" % (json.dumps(list(items)), *HUB_BOX, json.dumps([list(p) for p in STORES])))
    out = []
    for row in ai_rows(r):
        n, x, y, c, cname = str(row).split(",")
        out.append((n, float(x), float(y), int(c), cname))
    return out


def kit_plan(ai, who, need: dict) -> tuple:
    """need {건물: 수} 를 가방 + 저장 상자 완제품 + 허브 판 손제작으로. (plan, 모자란 판)."""
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    need = {k: v - int(bag.get(k, 0)) for k, v in need.items() if v - int(bag.get(k, 0)) > 0}
    if not need:
        return [], {}
    src = sources(ai, set(need) | {"iron-plate", "copper-plate", "steel-plate", "stone-brick", "wood"})
    plan, crafts, mats = [], {}, {}
    for item, k in need.items():
        for n, x, y, c, cname in sorted(src, key=lambda r: -r[3]):
            if n != item or k <= 0:
                continue
            keep = STORE_KEEP.get(n, 0) if cname == "storage-chest" else HUB_KEEP.get(n, 0)
            got = min(k, c - keep)
            if got > 0:
                plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": got})]
                k -= got
        if k > 0:
            crafts[item] = k
            for m, q in COST.get(item, {}).items():
                mats[m] = mats.get(m, 0) + q * k
    short = {}
    for m, q in mats.items():
        q = int(math.ceil(q)) + 2 - int(bag.get(m, 0))
        for n, x, y, c, cname in sorted(src, key=lambda r: -r[3]):
            if n != m or q <= 0:
                continue
            keep = STORE_KEEP.get(n, 0) if cname == "storage-chest" else HUB_KEEP.get(n, 0)
            got = min(q, c - keep)
            if got > 0:
                plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": got})]
                q -= got
        if q > 0:
            short[m] = q
    if short:
        return plan, short
    for item, k in crafts.items():
        plan.append(("craft", {"recipe": item, "count": (k + 1) // 2 if item in PAIRED else k, "wait": "block"}))
    return plan, {}


def idle(ai, who) -> bool:
    for r in ai.list():
        if r["name"] == who:
            return not (r.get("current") or r.get("queued"))
    return True


def wait_idle(ai, who, limit=900):
    t0 = time.time()
    time.sleep(5)
    while time.time() - t0 < limit and not idle(ai, who):
        time.sleep(5)


def build(ai, who, group, chunk=40, rounds=40) -> bool:
    """사람 하나가 group 을 앞에서부터 chunk 개씩. 가방에 없으면 기지에 와서 가져오고 · 만든다."""
    import p1
    from orders import submit
    os.environ[detached.ENV] = OWNER
    steps = steps_of(group)
    mine = GROUPS[group]
    for rnd in range(rounds):
        detached.mark([who], OWNER, minutes=30)
        up = p1.standing(ai, steps)
        todo = [st for st in steps if (st[1]["name"], st[1]["x"], st[1]["y"]) not in up]
        if not todo:
            print(time.strftime("%X"), f"{who} {group}: 다 섰다 ({len(up)})", flush=True)
            return True
        part = todo[:chunk]
        need = {}
        for k, p in part:
            need[p["name"]] = need.get(p["name"], 0) + 1
        # 철판이 모자라 한 번에 chunk 개가 다 안 모인다 - 가방에 든 만큼 (앞에서부터 이어진 것) 먼저 짓는다
        try:
            bag = ai.agent(who).items()
        except RconError:
            bag = {}
        have, ready = dict(bag), []
        for k, p in part:
            if int(have.get(p["name"], 0)) <= 0:
                break
            have[p["name"]] = int(have[p["name"]]) - 1
            ready.append((k, p))
        if len(ready) >= min(8, len(part)):
            part, plan, short = ready, [], {}
        else:
            plan, short = kit_plan(ai, who, need)
        if short:
            print(time.strftime("%X"), f"{who} {group}: 재료 모자람 {short} - 60 초 뒤 다시", flush=True)
            if plan:
                submit(ai, who, plan[:59], strict=False)
                wait_idle(ai, who, 600)
            time.sleep(60)
            continue
        if plan:
            submit(ai, who, plan[:59], strict=False)
            print(time.strftime("%X"), f"{who} {group}: 재료 {need}", flush=True)
            wait_idle(ai, who, 900)
            continue                                  # 가방을 다시 보고 짓기로
        bad = {s.split("|")[0]: s.split("|")[1] for s in p1.blocked(ai, part)}
        plan, last = [], None
        for k, p in part:
            key = f"{p['name']},{p['x']},{p['y']},{p.get('direction', 0)}"
            why = bad.get(key, "")
            if why and why != "tree" and not why.startswith("rock:"):
                continue                               # 건물 · 물 - 막힘 (짓지 않는다)
            if last is None or abs(p["x"] - last[0]) + abs(p["y"] - last[1]) > 6:
                off = SIZE.get(p["name"], 1) / 2 + 1.5
                sx, sy = ((1, 1), (-1, -1), (1, -1), (-1, 1))[rnd % 4]
                plan.append(("walk_to", {"x": p["x"] + sx * off, "y": p["y"] + sy * off}))
                last = (p["x"], p["y"])
            if why == "tree":
                plan.append(("chop", {"x": p["x"], "y": p["y"], "count": 2}))
            elif why.startswith("rock:"):
                _r, rname, rx, ry = why.split(":")
                plan.append(("demolish", {"x": float(rx), "y": float(ry), "name": rname, "search_radius": 0.8}))
            plan.append((k, p))
        if not any(k == "build" for k, _ in plan):
            print(time.strftime("%X"), f"{who} {group}: 남은 {len(todo)} 이 모두 막힘 - {list(bad.items())[:6]}", flush=True)
            return False
        plan = plan[:59]
        submit(ai, who, plan, strict=False)
        print(time.strftime("%X"), f"{who} {group}: {rnd + 1}순번 {sum(1 for k, _ in plan if k == 'build')}개 (남은 {len(todo)})"
              + (f" · 막힘 {len(bad)}" if bad else ""), flush=True)
        wait_idle(ai, who, 900)
    return False


def fill(ai, who, what) -> None:
    """손으로 채움: 석탄 상자 2 (석탄 밭 상자에서) · 탄 상자 4 (허브 피어싱)."""
    from orders import submit
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=20)
    if what == "coal":
        item, per, dst = "coal", 600, COAL_CHESTS
        src = [(n, x, y, c, cn) for n, x, y, c, cn in sources_coal(ai)]
    else:
        item, per, dst = "piercing-rounds-magazine", 30, AMMO_CHESTS
        src = sources(ai, {item})
    want = per * len(dst)
    plan = []
    for n, x, y, c, cn in sorted(src, key=lambda r: -r[3]):
        if want <= 0:
            break
        keep = HUB_KEEP.get(n, 0) if cn != "coalfield" else 100
        got = min(want, c - keep)
        if got > 0:
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": got})]
            want -= got
    for x, y in dst:
        plan += [("walk_to", {"x": x + 1.5, "y": y + 0.5}), ("insert", {"name": item, "x": x, "y": y, "count": per})]
    submit(ai, who, plan[:59], strict=False)
    print(time.strftime("%X"), who, "채움", what, len(plan), flush=True)


def sources_coal(ai):
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f, area = {{100, -34}, {126, -22}}}) do
        local n = c.get_inventory(defines.inventory.chest).get_item_count("coal")
        if n > 0 then out[#out+1] = string.format("coal,%.1f,%.1f,%d", c.position.x, c.position.y, n) end
      end
      return out
    end)()""")
    return [(a, float(b), float(c), int(d), "coalfield") for a, b, c, d in (str(x).split(",") for x in ai_rows(r))]


def check(ai, groups) -> dict:
    """계획끼리 겹침 + 게임 자리 (p1.blocked: can_place manual, 나무 · 바위 · 건물)."""
    import p1
    taken, clash = {}, []
    for g in GROUPS:
        for n, x, y, d in GROUPS[g]:
            s = SIZE.get(n, 1)
            for tx in range(math.floor(x - s / 2 + 0.01), math.ceil(x + s / 2 - 0.01)):
                for ty in range(math.floor(y - s / 2 + 0.01), math.ceil(y + s / 2 - 0.01)):
                    if (tx, ty) in taken:
                        clash.append(f"{g}:{n}({x},{y}) x {taken[(tx, ty)]}")
                    taken[(tx, ty)] = f"{g}:{n}({x},{y})"
    out = {"clash": clash[:20], "n_clash": len(clash)}
    for g in groups:
        steps = steps_of(g)
        bad = []
        for i in range(0, len(steps), 150):
            bad += p1.blocked(ai, steps[i:i + 150])
        kinds = {}
        for b in bad:
            w = b.split("|")[1].split(":")[0]
            kinds[w] = kinds.get(w, 0) + 1
        up = p1.standing(ai, steps) if len(steps) < 900 else set()
        out[g] = {"n": len(steps), "standing": len(up), "blocked": kinds,
                  "hard": [b for b in bad if b.split("|")[1] not in ("tree",) and not b.split("|")[1].startswith("rock")][:8]}
    return out


def need_total(groups) -> dict:
    items, mats = {}, {}
    for g in groups:
        for n, x, y, d in GROUPS[g]:
            items[n] = items.get(n, 0) + 1
    for n, k in items.items():
        for m, q in COST.get(n, {}).items():
            mats[m] = mats.get(m, 0) + q * k
    return {"items": items, "plates": {m: round(q) for m, q in mats.items()}}


def status(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      local A = {{390, -205}, {430, -95}}
      for _, n in pairs({"electric-mining-drill", "steel-furnace", "gun-turret", "stone-wall", "inserter", "transport-belt", "fast-transport-belt", "small-electric-pole"}) do
        local es = s.find_entities_filtered{name = n, force = f, area = A}
        local c = {}
        for _, e in pairs(es) do local k = e.status and st[e.status] or "-"; c[k] = (c[k] or 0) + 1 end
        local t = {}
        for k, v in pairs(c) do t[#t+1] = k .. "=" .. v end
        out[n] = #es .. " " .. table.concat(t, ",")
      end
      out.trunk = s.count_entities_filtered{name = "fast-transport-belt", force = f, area = {{60, -102}, {410, -60}}}
      local tl = s.find_entities_filtered{name = "fast-transport-belt", force = f, position = {69.5, -66.5}, radius = 0.3}[1]
      if tl then out.join_lanes = tl.get_transport_line(1).get_item_count() .. "/" .. tl.get_transport_line(2).get_item_count() end
      local p = s.find_entities_filtered{name = "fast-transport-belt", force = f, position = {406.5, -124.5}, radius = 0.3}[1]
      if p then out.p_lanes = p.get_transport_line(1).get_item_count() .. "/" .. p.get_transport_line(2).get_item_count() end
      return out
    end)()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--scout", default="")
    ap.add_argument("--check", default="")
    ap.add_argument("--need", default="")
    ap.add_argument("--build", default="")
    ap.add_argument("--crew", default="")
    ap.add_argument("--from", dest="frm", type=int, default=0, help="group 의 이 번호부터 (사람끼리 나눌 때)")
    ap.add_argument("--to", type=int, default=0)
    ap.add_argument("--fill", default="")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.measure:
        m = measure(ai)
        print(json.dumps(m, ensure_ascii=False))
        try:
            hist = json.load(open(STATE, encoding="utf-8"))
        except (OSError, ValueError):
            hist = {"measure": []}
        hist.setdefault("measure", []).append(m)
        json.dump(hist, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.scout:
        scout(ai, a.scout)
    if a.check:
        print(json.dumps(check(ai, a.check.split(",")), ensure_ascii=False, indent=1))
    if a.need:
        print(json.dumps(need_total(a.need.split(",")), ensure_ascii=False))
    if a.build:
        g = a.build
        if a.frm or a.to:
            GROUPS[g] = GROUPS[g][a.frm:a.to or None]
        build(ai, a.crew, g)
    if a.fill:
        fill(ai, a.crew, a.fill)
    if a.status:
        print(json.dumps(status(ai), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

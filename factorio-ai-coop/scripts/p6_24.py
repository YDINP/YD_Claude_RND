"""P6 for run 24: west nest (walked sight + robot-built west face), blue 150 (robot upgrades), second oil field.

P6 목표 (docs/run24-site.md P6):
  1. 서쪽 위협 먼저 - 둥지 자리 · 크기를 «걸어서 본 것» 으로 (seen.py 장부). force.chart 없음.
  2. 파랑 ≥ 150 - 엔진 · 고급회로 · 강철.
  3. 둘째 유전.
사용자가 Lua relay 처분을 정하는 동안 **새 relay 줄은 더하지 않는다** - 새 것은 팔 · 벨트 · 로봇으로.

정찰 (`--scout`): 걷는 사람은 보이는 네모 (seen.SIGHT 64, 체비셰프) 안에 둥지가 들어와야 장부에 적힌다.
  walkscout 출정 조건 (가는 선분 반경 80 안 적 유닛 · 구조물 0) 은 그대로 둔다 - 문턱을 낮추지 않는다.
  대각선으로 다가가면 거리 80~90 에서도 네모 (±64) 안에 든다 → 방향을 0 · ±25 · ±50 · ±75 · ±100 도 틀어 보며
  «조건을 지키는 다리» 중 목표에 가장 가까워지는 것을 고른다. 목표 방향은 raidwatch 안전 조회 (방위 · 거리) 의 것.
  다리마다 떠나기 직전 다시 잰다. 걷는 도중엔 walkscout.walk (시야 70 에 적이 보이면 돌아선다) + jevloop (1 초 도망).

    python scripts/p6_24.py --run run24 --scout hotel --bearing -157 --dist 470 --from -118,-9
    python scripts/p6_24.py --run run24 --ghosts wface
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

import runsite                           # noqa: E402,F401  (--run 을 먼저 뽑는다)
import walkscout                         # noqa: E402
import detached                          # noqa: E402
from client import AIBridge              # noqa: E402

CX, CY = runsite.center()
SEEN = runsite.path("seen")
PAD = walkscout.PAD                      # 80 - 올리지도 낮추지도 않는다
TURNS = (0, 25, -25, 50, -50, 75, -75, 100, -100)


def seen_enemies() -> dict:
    try:
        return json.load(open(SEEN, encoding="utf-8")).get("enemies") or {}
    except (OSError, ValueError):
        return {}


def scout(ai, who, bearing, dist, start, legs=40, step=20) -> dict:
    tx, ty = CX + dist * math.cos(math.radians(bearing)), CY + dist * math.sin(math.radians(bearing))
    detached.mark([who], "p6_scout", minutes=30)
    before = set(seen_enemies())
    log = []
    try:
        res = walkscout.walk(ai, who, start, (CX, CY), limit=120)
        log.append(f"출발점 {start}: {res}")
        if res != "ok":
            return {"log": log, "new": []}
        quiet, stall, last = 0, 0, -1
        for i in range(legs):
            r = walkscout.body(ai, who)
            if not r or not r.get("alive", True):
                log.append("사망?")
                break
            at = (float(r["x"]), float(r["y"]))
            head = math.degrees(math.atan2(ty - at[1], tx - at[0]))
            best = None
            for t in TURNS:
                h = math.radians(head + t)
                g = (at[0] + step * math.cos(h), at[1] + step * math.sin(h))
                walkscout.gen_ahead(ai, g, 1)
                f = walkscout.route_foes(ai, at, g, PAD)          # 출정 조건 - 떠나기 직전
                if f.get("units", 0) or f.get("structs", 0):
                    continue
                d = math.hypot(tx - g[0], ty - g[1])
                if best is None or d < best[0]:
                    best = (d, g, t)
            if best is None:
                log.append(f"다리 {i}: ({at[0]:.0f},{at[1]:.0f}) 에서 조건 맞는 다리 없음 - 멈춤")
                break
            stall = stall + 1 if best[0] >= math.hypot(tx - at[0], ty - at[1]) - 1 else 0
            if stall >= 4:
                log.append(f"다리 {i}: 4 다리째 더 가까워지지 않음 - 멈춤")
                break
            res = walkscout.walk(ai, who, best[1], (CX, CY), limit=60)
            time.sleep(3)                                          # seen.py 2 초 주기
            now = set(seen_enemies())
            new = now - before
            log.append(f"다리 {i}: 틀기 {best[2]:+d} -> ({best[1][0]:.0f},{best[1][1]:.0f}) {res} · 목표까지 {best[0]:.0f} · 새로 본 적 구조물 {len(new)}")
            if res in ("foe", "dead"):
                break
            quiet = quiet + 1 if new and len(new) == last else 0
            last = len(new)
            if new and quiet >= 4:
                log.append("본 것이 4 다리째 그대로 - 끝")
                break
    finally:
        walkscout.walk(ai, who, start, (CX, CY), limit=120)
        detached.release([who])
    got = seen_enemies()
    new = sorted(set(got) - before)
    return {"log": log, "new": [(got[k]["name"], got[k]["x"], got[k]["y"]) for k in new]}


# 서쪽 면 (P6-1) - 로봇이 짓는 유령 (place_list: 망 건설 반경 · 이미 선 것 건너뜀 · manual 검사 · 나무 · 바위는 벌목 표시).
#   23:18 W 틈 89. 둥지 무리 (안전 조회: 중심에서 방위 -157 · 464~480, 둥지 3 · 작은 벌레 · 작은 바이터 24 가 둥지 4 칸 안) 는
#   raidwatch 의 W (465) 와 NW (468) 가 **같은 무리** 다 (방위 경계 -157.5 에 걸쳐 있다). 가장 가까운 우리 것은 유전 북벽 (-217,12) 256.
#   빈 곳: 유전 북동 모서리 (-182,11) 와 정유 서쪽 줄 (-124,-2) 사이 58 칸 (유전 전봇대 줄 y 28 이 그 뒤) · 정유 북서 둘째 겹 · 로봇 줄 (y -6.5 / -10.5) 북쪽.
#   wline 은 R_O (x ≤ -135) 와 R_W (x ≥ -137) 건설 반경에 나눠 든다. 탄은 relay 의 기존 «모든 gun-turret» 줄이 채운다 (새 줄 아님).
WFACE = {"wline": [("gun-turret", x, y) for x, y in ((-176, 4), (-165, 2), (-154, 0), (-143, -2), (-133, -4))]
         + [("stone-wall", x + 0.5, -9.5) for x in range(-182, -128)],
         "rnw2": [("gun-turret", x, y) for x, y in ((-130, -12), (-122, -18), (-92, -17), (-80, -17), (-68, -17))]
         + [("stone-wall", x + 0.5, -22.5) for x in range(-136, -62)] + [("stone-wall", -136.5, y + 0.5) for y in range(-22, -9)]}


# 유령 놓기 (2026-09-30 사용자 결정: «정상적으로 놓을 수 없는 자리에 짓기 금지» - 난파선 (-5,-6) 위 조립기 · 전봇대 사진).
#   create_entity 로 유령을 만들기 전에 can_place_entity{build_check_type = manual} (forced 없음) 이 참이어야 한다.
#   발자리에 나무 · 바위만 있으면 벌목 표시 (로봇이 캔다) 하고 «기다림» - 다음 순번에 다시. 난파선 · 건물 · 물 · 절벽이면 «막힘» (자리를 옮긴다).
GHOST_LUA = """
  local function clear(p, r)
    local k = 0
    for _, t in pairs(s.find_entities_filtered{type = {"tree", "simple-entity"}, area = {{p[1] - r, p[2] - r}, {p[1] + r, p[2] + r}}}) do
      if t.type == "tree" or string.find(t.name, "rock") then
        k = k + 1
        if not t.to_be_deconstructed() then t.order_deconstruction(f) end
      end
    end
    return k
  end
  local function ghost(n, p, r)
    if s.can_place_entity{name = n, position = p, force = f, build_check_type = defines.build_check_type.manual} then
      return "ok", s.create_entity{name = "entity-ghost", inner_name = n, position = p, force = f}
    end
    if clear(p, r) > 0 then return "wait" end
    return "blocked"
  end
"""


def place_list(ai, name) -> dict:
    packed = ";".join(f"{n},{x},{y}" for n, x, y in WFACE[name])
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      %s
      local out = {placed = 0, skip = 0, nonet = 0, blocked = 0, wait = 0}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local pos = {tonumber(x), tonumber(y)}
        local r = (n == "gun-turret") and 1 or 0.5
        if #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
        elseif s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.6} > 0
            or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.6} > 0 then out.skip = out.skip + 1
        else
          local st = ghost(n, pos, r)
          if st == "ok" then out.placed = out.placed + 1 elseif st == "wait" then out.wait = out.wait + 1 else out.blocked = out.blocked + 1 end
        end
      end
      return out
    end)()""" % (GHOST_LUA, packed))


# 둘째 유전 (P6-3) - 걸어서 본 청크 (survey --seen, 반경 800) 의 원유: (-347,-218) 우물 8 · 수율 합 ~1040% (원유 ~104/s, 지금 24/s 의 4 배) 는
#   **무리 A 둥지에서 20 칸** (반경 120 안 적 구조물 10) · (-444,252) 우물 1 · 82% (8/s) 는 적 207 칸 밖이나 유전 (-196,32) 에서 관 ~330 칸.
#   → 둘째 유전 = 북서 (-347,-218). 무리 A 를 로봇 포탑 크립으로 치운 뒤 펌프잭. 크립은 로보포트 망 안에서만 (offense.md · 23회차 §3-5) →
#   R_W 망에서 북서로 로보포트 사슬 N1..N5 (물류 반경 25 → 간격 ≤ 50 이면 한 망) + 작은 전봇대 줄 (전선 7.5 → 6 칸 간격).
#   전봇대는 포트 남서 모서리 (x-2.5, y+2.5) 를 지나 포트에 전기가 닿는다. 유령은 건설 반경 안 것만 놓인다 - 망이 자라면 다시 돌린다.
#   N2 는 구리 광맥 (-176..-152, -96..-72) 위 - 셋째 구리 전초 자리도 겸한다. N5 는 무리 A 에서 ~64 (건설 반경 55 가 둥지 · 유전을 덮는다).
CHAIN_POLE0 = (-93.5, -4.5)          # 로봇 줄 서쪽 끝 전봇대 (망 1)
CHAIN_PORTS = [(-128, -28), (-170, -70), (-212, -112), (-254, -154), (-296, -190)]


def chain_ghosts(ai, upto) -> dict:
    pts, prev = [], CHAIN_POLE0
    for rx, ry in CHAIN_PORTS[:upto]:
        c = (rx - 2.5, ry + 2.5)          # 남서 모서리 - 들어오는 줄 (남동) · 나가는 줄 (북서) 이 포트를 비켜 간다
        n = max(1, math.ceil(math.hypot(c[0] - prev[0], c[1] - prev[1]) / 6))
        pts += [(round((prev[0] + (c[0] - prev[0]) * i / n) - 0.5) + 0.5, round((prev[1] + (c[1] - prev[1]) * i / n) - 0.5) + 0.5) for i in range(1, n + 1)]
        prev = c
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local P = helpers.json_to_table('%s')
      local R = helpers.json_to_table('%s')
      local out = {pole = 0, port = 0, have = 0, nonet = 0, blocked = 0, trees = 0}
      local function net(p) return #s.find_logistic_networks_by_construction_area(p, f) > 0 end
      %s
      local prev = {%f, %f}
      local OFF = {{0, 0}, {1, 0}, {0, 1}, {-1, 0}, {0, -1}, {1, 1}, {-1, -1}, {1, -1}, {-1, 1}}
      for _, p in pairs(P) do
        local done = nil
        for _, o in pairs(OFF) do
          local q = {p[1] + o[1], p[2] + o[2]}
          if math.sqrt((q[1] - prev[1])^2 + (q[2] - prev[2])^2) <= 7.5 then
            if s.count_entities_filtered{type = "electric-pole", force = f, position = q, radius = 0.6} > 0
               or s.count_entities_filtered{ghost_name = "small-electric-pole", force = f, position = q, radius = 0.6} > 0 then out.have = out.have + 1; done = q; break end
            if not net(q) then out.nonet = out.nonet + 1; done = "stop"; break end
            local st = ghost("small-electric-pole", q, 0.5)
            if st == "ok" then out.pole = out.pole + 1; done = q; break end
            if st == "wait" then out.trees = out.trees + 1; done = "stop"; break end
          end
        end
        if done == nil then out.blocked = out.blocked + 1; break end
        if done == "stop" then break end
        prev = done
      end
      for _, r in pairs(R) do
        if s.count_entities_filtered{name = "roboport", force = f, position = r, radius = 1} > 0
           or s.count_entities_filtered{ghost_name = "roboport", force = f, position = r, radius = 1} > 0 then out.have = out.have + 1
        elseif not net(r) then out.nonet = out.nonet + 1
        else
          local st = ghost("roboport", r, 2)
          if st == "ok" then out.port = out.port + 1 elseif st == "wait" then out.trees = out.trees + 1 else out.blocked = out.blocked + 1 end
        end
      end
      out.last = string.format("%%.1f,%%.1f", prev[1], prev[2])
      return out
    end)()""" % (json.dumps(pts), json.dumps(CHAIN_PORTS[:upto]), GHOST_LUA, CHAIN_POLE0[0], CHAIN_POLE0[1]))


def chain_kit(ai, who, poles, ports) -> dict:
    """전봇대 · 로보포트를 R_W 옆 저장 상자에 (새 relay 줄 없이 - 사람이 든다). 나무는 허브 옆 나무 무리에서 벤다."""
    import p1
    from orders import submit
    h = p1.hub(ai)
    plan = [("walk_to", {"x": p1.WOOD[0], "y": p1.WOOD[1]}), ("chop", {"x": p1.WOOD[2], "y": p1.WOOD[3], "count": poles // 8 + 2})]
    x, y, c = h["copper-plate"]
    plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "copper-plate", "x": x, "y": y, "count": poles + 4})]
    if ports and "roboport" in h:
        x, y, c = h["roboport"]
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "roboport", "x": x, "y": y, "count": min(ports, c)})]
    plan += [("craft", {"recipe": "small-electric-pole", "count": poles // 2, "wait": "block"}),
             ("walk_to", {"x": CHAIN_STORE[0], "y": CHAIN_STORE[1] + 1.5}),
             ("insert", {"name": "small-electric-pole", "x": CHAIN_STORE[0], "y": CHAIN_STORE[1], "count": poles})]
    if ports:
        plan.append(("insert", {"name": "roboport", "x": CHAIN_STORE[0], "y": CHAIN_STORE[1], "count": ports}))
    plan.append(("walk_to", {"x": p1.PARK[0], "y": p1.PARK[1]}))
    submit(ai, who, plan, strict=False)
    return {"poles": poles, "ports": ports}


# 포트마다 포탑 3 (북서 · 북동 · 남서 6 칸) - 23:5x 작은 바이터 무리 둘 (7 마리 group · 5 마리 wander) 이 N2 에서 ~70.
#   탄은 relay 의 기존 «모든 gun-turret» 줄. 포탑 사거리 18 안에 포트 · 서로.
for _i, (_x, _y) in enumerate(CHAIN_PORTS, 1):
    WFACE[f"guard{_i}"] = [("gun-turret", _x + dx, _y + dy) for dx, dy in ((-6, -6), (6, -6), (-6, 6))]
CHAIN_STORE = (-78.5, 20.5)          # R_W (-82,20) 옆 저장 상자


def chain_feed(ai, who, minutes) -> None:
    """로보포트가 허브에 나오면 (relay 의 기존 OUTS 줄) --who 가 들고 R_W 저장 상자에 넣고, 사슬 유령 · 포트 포탑을 다시 놓는다 (망이 자라면 다음 포트)."""
    import p1
    from orders import submit
    end = time.time() + minutes * 60
    while time.time() < end:
        h = p1.hub(ai)
        r = walkscout.body(ai, who)
        idle = r and not (r.get("current") or r.get("queued"))
        if idle and "roboport" in h and h["roboport"][2] > 0:
            x, y, c = h["roboport"]
            submit(ai, who, [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "roboport", "x": x, "y": y, "count": c}),
                             ("walk_to", {"x": CHAIN_STORE[0], "y": CHAIN_STORE[1] + 1.5}),
                             ("insert", {"name": "roboport", "x": CHAIN_STORE[0], "y": CHAIN_STORE[1], "count": c}),
                             ("walk_to", {"x": p1.PARK[0], "y": p1.PARK[1]})], strict=False)
            print(time.strftime("%X"), f"로보포트 {c} -> 저장 상자", flush=True)
        g = chain_ghosts(ai, len(CHAIN_PORTS))
        if g.get("pole") or g.get("port"):
            print(time.strftime("%X"), "사슬", g, flush=True)
        for i in range(1, len(CHAIN_PORTS) + 1):
            q = place_list(ai, f"guard{i}")
            if q.get("placed"):
                print(time.strftime("%X"), f"guard{i}", q, flush=True)
        q = ammo_requests(ai)
        if q.get("asked"):
            print(time.strftime("%X"), "탄 요청", q, flush=True)
        time.sleep(20)


# 탄 (23:58 코디네이터 경보 - 포트 포탑 6 탄 0): relay 노랑 줄은 탄창 조립기 결과칸 · 허브 탄창 상자 (66.5,-15.5) 만 보는데
#   탄창 조립기는 허브 노랑 ≥ 400 이면 쉬고 (P5 규칙) 그 상자는 비어 있었다 - 노랑 488 은 옆 허브 상자에. 새 relay 줄 대신 **로봇**:
#   사람이 망 저장 상자에 탄창을 넣고, 탄 적은 포탑마다 item-request-proxy (탄창 20, 대상마다 ≤ 100) → 건설 로봇이 날라 넣는다.
def ammo_requests(ai, below=5, count=20, item="firearm-magazine") -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {asked = 0, pending = 0, nonet = 0}
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        if inv.get_item_count() < %d then
          if t.item_request_proxy then out.pending = out.pending + 1
          elseif #s.find_logistic_networks_by_construction_area(t.position, f) == 0 then out.nonet = out.nonet + 1
          else
            s.create_entity{name = "item-request-proxy", position = t.position, force = f, target = t,
              modules = {{id = {name = "%s"}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}}}
            out.asked = out.asked + 1
          end
        end
      end
      return out
    end)()""" % (below, item, min(count, 100)))


# 로봇 포탑 크립 (offense.md 3-A · 23회차 §3-5 «그 둥지는 로봇으로»): 사람은 안 간다. 둥지 자리는 안전 조회의 방위 · 거리 (raidwatch 와 같은 것).
#   포탑 넷을 둥지에서 standoff 칸, «우리 포트 쪽» 에 2×2 떨어뜨려 유령으로 - 건설 반경 안이어야 놓인다. 유령에 탄 20 (insert_plan) 을 달아
#   로봇이 짓자마자 탄을 넣는다 (저장 상자의 피어싱 · 노랑). 벌레가 없는 둥지 (새 확장) 만 - 벌레 사거리 25 > 포탑 18 이면 벌레 먼저 계산할 것.
def creep_ghosts(ai, bearing, dist, toward, standoff=15, ammo="piercing-rounds-magazine", worms_ok=True) -> dict:
    sx, sy = CX + dist * math.cos(math.radians(bearing)), CY + dist * math.sin(math.radians(bearing))
    ux, uy = toward[0] - sx, toward[1] - sy
    L = math.hypot(ux, uy)
    ux, uy = ux / L, uy / L
    cx, cy = sx + ux * standoff, sy + uy * standoff
    px, py = -uy, ux                     # 옆 방향
    pos = [(round(cx + px * k * 2.5 + ux * j * 2.5), round(cy + py * k * 2.5 + uy * j * 2.5)) for k, j in ((-1, 0), (1, 0), (0, 1), (0, -1))]
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      %s
      local out = {placed = 0, nonet = 0, blocked = 0, have = 0, plan = 0, worms = 0}
      out.worms = s.count_entities_filtered{force = "enemy", type = "turret", position = {%f, %f}, radius = 40}
      if out.worms > 0 and not %s then return out end
      for _, p in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = "gun-turret", force = f, position = p, radius = 1} > 0
           or s.count_entities_filtered{ghost_name = "gun-turret", force = f, position = p, radius = 1} > 0 then out.have = out.have + 1
        elseif #s.find_logistic_networks_by_construction_area(p, f) == 0 then out.nonet = out.nonet + 1
        else
          local st, g = ghost("gun-turret", p, 1)
          if st == "ok" then
            out.placed = out.placed + 1
            local ok = pcall(function() g.insert_plan = {{id = {name = "%s"}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = 20}}}}} end)
            if ok then out.plan = out.plan + 1 end
          elseif st == "wait" then out.wait = (out.wait or 0) + 1
          else out.blocked = out.blocked + 1 end
        end
      end
      out.at = helpers.table_to_json(helpers.json_to_table('%s'))
      return out
    end)()""" % (GHOST_LUA, sx, sy, "true" if worms_ok else "false", json.dumps(pos), ammo, json.dumps(pos)))


def nest_left(ai, bearing, dist, r=12) -> dict:
    sx, sy = CX + dist * math.cos(math.radians(bearing)), CY + dist * math.sin(math.radians(bearing))
    return ai.lua("""(function() local s = game.surfaces[1]
      return {spawners = s.count_entities_filtered{force = "enemy", type = "unit-spawner", position = {%f, %f}, radius = %d},
              units = s.count_entities_filtered{force = "enemy", type = "unit", position = {%f, %f}, radius = 40}} end)()""" % (sx, sy, r, sx, sy))


# 무리 A 크립 고리 (P6-3): N5 가 working 이 된 뒤에만 돈다. 순번마다 «유전 반경 R 안 적 구조물 중 N5 에 가장 가까운 것» 에서 standoff 15 칸,
#   N5 쪽에 포탑 4 유령 (insert_plan 피어싱 20) - 그 앞에 이미 우리 포탑 (18 칸 안) 이 있으면 기다린다. 작은 벌레는 사거리 25 라 포탑이 맞지만 (수리팩 망 439)
#   4 대 피어싱이 먼저 이긴다 - 중형 이상 벌레가 보이면 멈춘다. 잃은 포탑이 8 을 넘거나 시간이 다 되면 멈춘다. 사람은 안 쓴다.
CREEP_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local P, C, R = {%f, %f}, {%f, %f}, %f
  local best, bd = nil, 1e9
  local big = 0
  for _, e in pairs(s.find_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"}, position = C, radius = R}) do
    if e.type == "turret" and not string.find(e.name, "small") then big = big + 1 end
    local d = math.sqrt((e.position.x - P[1])^2 + (e.position.y - P[2])^2)
    if d < bd then best, bd = e, d end
  end
  if not best then return {left = 0} end
  local ours = 0
  for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, position = best.position, radius = 18}) do
    if t.get_inventory(defines.inventory.turret_ammo).get_item_count() > 0 then ours = ours + 1 end
  end
  local left = s.count_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"}, position = C, radius = R}
  return {left = left, big = big, ours = ours, gx = best.position.x, gy = best.position.y, name = best.name,
          ghosts = s.count_entities_filtered{ghost_name = "gun-turret", position = best.position, radius = 30}}
end)()"""


def creep_loop(ai, port, field, radius, minutes) -> None:
    end = time.time() + minutes * 60
    lost0 = None
    while time.time() < end:
        st = ai.lua("""(function() local s = game.surfaces[1]
          local r = s.find_entities_filtered{name = "roboport", position = {%f, %f}, radius = 1}[1]
          local ks = game.forces.player.get_kill_count_statistics(s)
          return {ok = r and r.status == defines.entity_status.working or false, lost = ks.get_output_count("gun-turret")} end)()""" % port)
        if not st.get("ok"):
            print(time.strftime("%X"), "포트 아직", flush=True)
            time.sleep(30)
            continue
        lost0 = st["lost"] if lost0 is None else lost0
        if st["lost"] - lost0 > 8:
            print(time.strftime("%X"), f"포탑 {st['lost'] - lost0} 잃음 - 멈춤", flush=True)
            return
        r = ai.lua(CREEP_LUA % (port[0], port[1], field[0], field[1], radius))
        if not r.get("left"):
            print(time.strftime("%X"), "유전 반경 안 적 구조물 0 - 끝", flush=True)
            return
        if r.get("big"):
            print(time.strftime("%X"), f"중형 이상 벌레 {r['big']} - 멈춤", flush=True)
            return
        if not r.get("ours") and not r.get("ghosts"):
            gx, gy = float(r["gx"]), float(r["gy"])
            dx, dy = gx - CX, gy - CY
            q = creep_ghosts(ai, math.degrees(math.atan2(dy, dx)), math.hypot(dx, dy), port)
            print(time.strftime("%X"), f"목표 {r['name']} (남은 {r['left']}) -> 포탑 유령 {q}", flush=True)
        ammo_requests(ai)
        time.sleep(20)


# 파랑 150 (P6-2) - 23:4x 실측: 파랑 조립기 5 모두 working 에 입력이 다 찼다 (엔진 4 · 고급회로 6 · 황 4) → 파랑은 «조립기 수» 에 묶였다
#   (조립기 1 형 5 대 = 10분 125 상한). 엔진 조립기 6 도 모두 working 에 결과칸 0~3 (나오는 대로 파랑이 가져감) = 10분 180 상한 - 파랑 150 + 전기 엔진 몫에 모자람.
#   고급회로 3 · 4 · 6 은 결과칸 120~198 (남는다) · 강철 10분 604 (허브 323, 상한 400) - 강철 화로는 병목이 아니다.
#   → 새 조립기 (= 새 relay 줄) 대신 **같은 자리 조립기 2 형 (속도 0.75/0.5 = 1.5 배) 로 로봇 교체** (order_upgrade, 강철로와 같은 방식).
#   relay 는 type = assembling-machine 으로 자리에서 찾으니 줄 추가 0. 교체되며 나온 조립기 1 형은 망 저장으로.
#   조립기 2 = 강철 2 · 톱니 5 · 회로 3 · 조립기 1 (손제작은 판에서 사슬로) - 판 한 대 철 35 · 구리 9 · 강철 2.
ASM2_UP = {"blue": ["blue1", "blue2", "blue3", "blue4", "blue5"], "eng": ["eng1", "eng2", "eng3", "eng4", "eng5", "eng6"],
           "adv": ["adv1", "adv2", "adv3", "adv4", "adv6"], "adv5": ["adv5"]}      # adv5 = 로보포트 · 물류 로봇 몫 (P6-3 사슬 포트 9 분에 하나)
ASM2_STORE = (11.5, -9.5)           # R_M (8,-10) 옆 저장 상자


def _asm_pos(names):
    import relay24
    return [relay24.ASMS[n][:2] for n in names]


def asm2_craft(ai, who, n) -> dict:
    import p1
    from orders import submit
    h = p1.hub(ai)
    plan = []
    for m, k in (("iron-plate", 35), ("copper-plate", 9), ("steel-plate", 2)):
        x, y, c = h[m]
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": m, "x": x, "y": y, "count": k * n})]
    plan += [("craft", {"recipe": "assembling-machine-2", "count": n, "wait": "block"}),
             ("walk_to", {"x": ASM2_STORE[0], "y": ASM2_STORE[1] + 1.5}),
             ("insert", {"name": "assembling-machine-2", "x": ASM2_STORE[0], "y": ASM2_STORE[1], "count": n}),
             ("walk_to", {"x": p1.PARK[0], "y": p1.PARK[1]})]
    submit(ai, who, plan, strict=False)
    return {"ordered": n}


def asm2_order(ai, group) -> dict:
    pos = _asm_pos(ASM2_UP[group])
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {ordered = 0, already = 0, miss = 0}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = "assembling-machine", force = f, position = p, radius = 0.6}[1]
        if not e then out.miss = out.miss + 1
        elseif e.name == "assembling-machine-2" or e.to_be_upgraded() then out.already = out.already + 1
        else e.order_upgrade{force = f, target = "assembling-machine-2"}; out.ordered = out.ordered + 1 end
      end
      return out
    end)()""" % json.dumps(pos))


def reset_zones(names) -> dict:
    """sitewatch 기준 지우기 - 배치가 바뀐 구역은 M0 · done 을 지우고 다음 순번에 다시 잰다 (조립기 교체는 products_finished 가 0 부터)."""
    path = runsite.path("sitewatch")
    m = json.load(open(path, encoding="utf-8"))
    out = {}
    for n in names:
        if n in m:
            out[n] = m.pop(n)
    tmp = path + ".tmp"
    json.dump(m, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, path)
    return {"reset": sorted(out)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scout", default="")
    ap.add_argument("--bearing", type=float, default=-157)
    ap.add_argument("--dist", type=float, default=470)
    ap.add_argument("--from", dest="start", default="-118,-9")
    ap.add_argument("--ghosts", default="", choices=("", *WFACE))
    ap.add_argument("--chain", type=int, default=0, help="로보포트 사슬 N1..N<k> 유령")
    ap.add_argument("--creep", default="", help="방위,거리,포트x,포트y - 둥지 앞 포탑 4 유령 (탄 20)")
    ap.add_argument("--creep-loop", default="", help="포트x,포트y,유전x,유전y,반경,분")
    ap.add_argument("--ammo", action="store_true", help="탄 < 5 포탑에 item-request-proxy (탄창 20)")
    ap.add_argument("--chain-feed", type=float, default=0, help="분 - 로보포트를 허브에서 저장 상자로 나르고 사슬을 다시 놓는 고리")
    ap.add_argument("--chain-kit", default="", help="전봇대 수,로보포트 수 - --who 가 만들어 R_W 저장 상자에")
    ap.add_argument("--asm2-craft", type=int, default=0, help="--who 한 사람이 조립기 2 형 N 대를 만들어 저장 상자에")
    ap.add_argument("--who", default="")
    ap.add_argument("--asm2-order", default="", choices=("", *ASM2_UP))
    ap.add_argument("--reset", default="", help="sitewatch 구역 이름,이름 - 기준 지움")
    a = ap.parse_args()
    if a.reset:
        print(reset_zones([n for n in a.reset.split(",") if n]))
        return 0
    ai = AIBridge()
    if a.ghosts:
        print(a.ghosts, place_list(ai, a.ghosts))
        return 0
    if a.chain:
        print("chain", chain_ghosts(ai, a.chain))
        return 0
    if a.creep_loop:
        v = [float(x) for x in a.creep_loop.split(",")]
        creep_loop(ai, (v[0], v[1]), (v[2], v[3]), v[4], v[5])
        return 0
    if a.creep:
        b, d, tx, ty = (float(v) for v in a.creep.split(","))
        print("creep", creep_ghosts(ai, b, d, (tx, ty)))
        print("left", nest_left(ai, b, d))
        return 0
    if a.ammo:
        print("ammo", ammo_requests(ai))
        return 0
    if a.chain_feed:
        chain_feed(ai, a.who, a.chain_feed)
        return 0
    if a.chain_kit:
        n, k = (int(v) for v in a.chain_kit.split(","))
        print(chain_kit(ai, a.who, n, k))
        return 0
    if a.asm2_craft:
        print(asm2_craft(ai, a.who, a.asm2_craft))
        return 0
    if a.asm2_order:
        print(a.asm2_order, asm2_order(ai, a.asm2_order))
        return 0
    if a.scout:
        start = tuple(float(v) for v in a.start.split(","))
        r = scout(ai, a.scout, a.bearing, a.dist, start)
        for line in r["log"]:
            print(" ", line, flush=True)
        print("새로 본 적 구조물", len(r["new"]))
        for n in r["new"]:
            print("  ", n)
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

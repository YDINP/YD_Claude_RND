"""구리 전초 (61,-407) 로 가는 고정 로보포트 사슬 - docs/resource-expansion-plan.md 3절 · 7절 3번 (C2).

사용자: "대포 옮길 때 포탑+전선+로보포트 같이, 방어선을 미리 구축하고 대포로 공격" · "기관포탑+레이저포탑 섞어서 방어선".
대포 키트 (artykit23) 는 새 로보포트가 '키트 아닌' 망 로보포트에서 48 안이어야 한다 -> 북쪽으로 고정 로보포트를 깐다.

    R0 (56,-127)  망 2 로보포트 (10,-80) 에서 체비셰프 47. 북쪽 포탑 호 (43..77,-149..-131) 가 이미 지킨다.
    R1 (56,-175)  R0 에서 48
    R2 (56,-222)  R1 에서 47   -> 서면 artykit23 이 arty_goal.json 의 prefer H2 (58.5,-271.5) 로 대포를 옮길 수 있다

기지마다 단계 (앞 기지가 끝나야 다음):
  check  반경 50 적 구조물 0 · 반경 60 적 유닛 0, 로보포트 자리 can_place (안 되면 4 칸 안에서 옮김), 앞 망 로보포트와 체비셰프 <= 48
  build  전봇대 줄 (가까운 주 전력망 전봇대 -> 로보포트, 소형 7 칸) + 로보포트 네 모서리 전봇대 + 로보포트 유령
  rp     로보포트가 서고 전기 · 망 2 에 붙었는지
  ring   포탑 링 6 (가장 가까운 적 구조물 쪽부터). 망에 레이저 포탑이 2 이상이면 2 자리는 레이저 + 옆 전봇대.
         반경 22 안에 이미 탄 든 포탑 6 이상 (R0) 이면 새로 안 놓는다.
  ammo   선 기관포탑에 탄 20 (proxy <= 100). 6 대 이상 서고 기관포탑 전부 탄 > 0 이면 done.
끝난 뒤 (상주): 링 기관포탑 탄 < 10 이면 20 보충, 레이저 재고 2 이상이고 레이저 없는 링이면 레이저 2 추가.

    python -u scripts/copperchain23.py --check     # 드라이런 (각 기지 조사)
    python -u scripts/copperchain23.py             # 상주 (20 초)
상태 state/copperchain23.json, 로그 state/copperchain23.log. 캐릭터는 벽 밖에 나가지 않는다 (로봇만).
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import artykit23  # noqa: E402  유령 놓기 (나무 · 바위 해체 포함) 재사용

STATE = os.path.join(HERE, "..", "state", "copperchain23.json")
LOG = os.path.join(HERE, "..", "state", "copperchain23.log")
# only_prefer: 대포는 R0 곁 (56.5,-137.5) 에서 H2 만 기다린다 (중간 자리 (60.5,-179.5) 는 R1 과 겹치고 포탄이 모자람). H2 에 서면 푼다.
GOAL = {"x": 61, "y": -407, "prefer": [58.5, -271.5], "only_prefer": True}
SITES = [("R0", [56, -127]), ("R1", [56, -175]), ("R2", [56, -222])]
RING_N = 6
AMMO = 20

# 조사: 적 · 자리 보정 · 앞 망 로보포트 거리 · 이미 있는 포탑
SURVEY = """(function() local s = game.surfaces[1] local P = {%s, %s} local o = {}
  local ENEMY = {'unit-spawner', 'turret'}
  o.enemy = s.count_entities_filtered{force = 'enemy', type = ENEMY, position = P, radius = 50}
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = P, radius = 60}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player') o.net = net and net.network_id or 0
  local r = s.find_entities_filtered{name = 'roboport', force = 'player', position = P, radius = 5}[1]
  local g = s.find_entities_filtered{ghost_name = 'roboport', force = 'player', position = P, radius = 5}[1]
  if r then o.rp = {r.position.x, r.position.y} o.built = 1 o.power = r.energy > 0 and 1 or 0
    o.rnet = r.logistic_network and r.logistic_network.network_id or 0
  elseif g then o.rp = {g.position.x, g.position.y} o.built = 0
  else
    local function ok(p) return s.can_place_entity{name = 'roboport', position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost} end
    for d = 0, 4 do if not o.rp then for dx = -d, d do for dy = -d, d do
      if not o.rp and math.max(math.abs(dx), math.abs(dy)) == d and ok({P[1] + dx, P[2] + dy}) then o.rp = {P[1] + dx, P[2] + dy} end
    end end end end
    o.built = -1
  end
  if o.rp then
    local bd = 1e9
    for _, b in pairs(s.find_entities_filtered{name = 'roboport', force = 'player', position = o.rp, radius = 80}) do
      if b.logistic_network and net and b.logistic_network.network_id == net.network_id and not (math.abs(b.position.x - o.rp[1]) < 0.6 and math.abs(b.position.y - o.rp[2]) < 0.6) then
        local d = math.max(math.abs(b.position.x - o.rp[1]), math.abs(b.position.y - o.rp[2])) if d < bd then bd = d o.bridge = {b.position.x, b.position.y} end end
    end
    o.bd = bd
    local n = 0
    for _, t in pairs(s.find_entities_filtered{name = {'gun-turret', 'laser-turret'}, force = 'player', position = o.rp, radius = 22}) do
      if t.name == 'laser-turret' or not t.get_inventory(defines.inventory.turret_ammo).is_empty() then n = n + 1 end end
    o.guard = n
  end
  if net then o.stock = {gun = net.get_item_count('gun-turret'), laser = net.get_item_count('laser-turret'), rp = net.get_item_count('roboport'),
    pole = net.get_item_count('small-electric-pole'), fm = net.get_item_count('firearm-magazine'), pm = net.get_item_count('piercing-rounds-magazine')} end
  return o end)()"""

# 전봇대 줄: 주 전력망 (망 2 로보포트 (-24,-88) 와 같은 전력망) 의 가까운 전봇대 -> 로보포트 체비셰프 4 안. 네 모서리 전봇대 포함.
POLES = """(function() local s = game.surfaces[1] local R = {%s, %s} local o = {poles = {}, corners = {}}
  local EID = s.find_entities_filtered{name = 'roboport', position = {-24, -88}, radius = 1}[1].electric_network_id
  local function ok(n, p) return s.can_place_entity{name = n, position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost} end
  local function cheb(a, b) return math.max(math.abs(a[1] - b[1]), math.abs(a[2] - b[2])) end
  local rects = {{R[1], R[2], 2}}
  local function free(p, h) for _, q in pairs(rects) do if math.abs(q[1] - p[1]) < q[3] + h and math.abs(q[2] - p[2]) < q[3] + h then return false end end return true end
  for _, d in pairs({{2.5, 2.5}, {-2.5, 2.5}, {2.5, -2.5}, {-2.5, -2.5}}) do
    local q = {R[1] + d[1], R[2] + d[2]}
    if s.find_entities_filtered{type = 'electric-pole', position = q, radius = 0.4}[1] or ok('small-electric-pole', q) then o.corners[#o.corners + 1] = q rects[#rects + 1] = {q[1], q[2], 0.5} end
  end
  local src, sd = nil, 1e9
  for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', force = 'player', position = R, radius = 100}) do
    if e.electric_network_id == EID and not e.to_be_deconstructed() then
      local d = (e.position.x - R[1])^2 + (e.position.y - R[2])^2 if d < sd then src, sd = e, d end end
  end
  if not src then o.err = 'no power pole in 100' return o end
  o.src = {src.position.x, src.position.y}
  local cur = {src.position.x, src.position.y}
  while cheb(cur, R) > 4 do
    if #o.poles >= 16 then o.err = 'poles > 16' return o end
    local vx, vy = R[1] - cur[1], R[2] - cur[2] local L = math.sqrt(vx * vx + vy * vy)
    local st = math.min(7, L - 3) local got = nil
    for _, back in ipairs({0, 1, 2}) do for _, dx in ipairs({0, 1, -1}) do for _, dy in ipairs({0, 1, -1}) do
      if not got then
        local q = {math.floor(cur[1] + vx / L * (st - back)) + 0.5 + dx, math.floor(cur[2] + vy / L * (st - back)) + 0.5 + dy}
        local dq = math.sqrt((q[1] - cur[1])^2 + (q[2] - cur[2])^2)
        if dq <= 7.4 and dq >= 1 and free(q, 0.5) and ok('small-electric-pole', q) then got = q end
      end
    end end end
    if not got then o.err = 'pole blocked @' .. cur[1] .. ',' .. cur[2] return o end
    o.poles[#o.poles + 1] = got rects[#rects + 1] = {got[1], got[2], 0.5} cur = got
  end
  return o end)()"""

# 포탑 링: 가장 가까운 적 구조물 쪽부터 (0, +-30, +-60, +-95, +-130, 180 도, 반경 9~12). LASERS 번째 자리는 레이저 + 로보포트 쪽 전봇대.
RING = """(function() local s = game.surfaces[1] local R = {%s, %s} local N = %d local LASER = {%s} local SKIP = {%s} local o = {ring = {}}
  local function ok(n, p) return s.can_place_entity{name = n, position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost} end
  local rects = {{R[1], R[2], 2.6}}
  for _, q in pairs(SKIP) do rects[#rects + 1] = {q[1], q[2], 1.2} end
  local function free(p, h) for _, q in pairs(rects) do if math.abs(q[1] - p[1]) < q[3] + h and math.abs(q[2] - p[2]) < q[3] + h then return false end end return true end
  local e, ed = nil, 1e9
  for _, q in pairs(s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = R, radius = 500}) do
    local d = (q.position.x - R[1])^2 + (q.position.y - R[2])^2 if d < ed then e, ed = q, d end end
  local a0 = e and math.atan2(e.position.y - R[2], e.position.x - R[1]) or -math.pi / 2
  o.face = math.floor(math.deg(a0))
  local k = 0
  for _, deg in ipairs({0, 30, -30, 60, -60, 95, -95, 130, -130, 180}) do
    if #o.ring < N then
      k = k + 1
      local a = a0 + math.rad(deg) local laser = LASER[#o.ring + 1] == 1 local got = nil
      for _, rad in ipairs({10, 9, 11, 12}) do
        if not got then
          local q = {math.floor(R[1] + rad * math.cos(a) + 0.5), math.floor(R[2] + rad * math.sin(a) + 0.5)}
          if free(q, 1) and ok(laser and 'laser-turret' or 'gun-turret', q) then
            local pole = nil
            if laser then  -- 레이저: 로보포트 쪽 3.5 칸 안쪽 전봇대 (모서리 전봇대와 7.5 안)
              for _, back in ipairs({3.5, 4.5, 2.5}) do if not pole then
                local pq = {math.floor(q[1] - back * math.cos(a)) + 0.5, math.floor(q[2] - back * math.sin(a)) + 0.5}
                if free(pq, 0.5) and math.abs(pq[1] - q[1]) < 3.5 and math.abs(pq[2] - q[2]) < 3.5 and ok('small-electric-pole', pq) then pole = pq end
              end end
            end
            if not laser or pole then got = q o.ring[#o.ring + 1] = {laser and 'laser-turret' or 'gun-turret', q[1], q[2], pole and pole[1] or 0, pole and pole[2] or 0}
              rects[#rects + 1] = {q[1], q[2], 1} if pole then rects[#rects + 1] = {pole[1], pole[2], 0.5} end end
          end
        end
      end
    end
  end
  return o end)()"""

# 링 상태 + 탄 (기관포탑 탄 < LOW 이고 proxy 없으면 AMMO 까지, proxy <= 100)
STATUS = """(function() local s = game.surfaces[1] local o = {built = 0, ghost = 0, gun = 0, loaded = 0, laser = 0, lpow = 0, req = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local have = {['piercing-rounds-magazine'] = net.get_item_count('piercing-rounds-magazine'), ['firearm-magazine'] = net.get_item_count('firearm-magazine')}
  for _, t in pairs({%s}) do local p = {t[2], t[3]}
    local e = s.find_entities_filtered{name = t[1], position = p, radius = 0.6, force = 'player'}[1]
    if e then o.built = o.built + 1
      if e.name == 'laser-turret' then o.laser = o.laser + 1 if e.energy > 0 then o.lpow = o.lpow + 1 end
      else o.gun = o.gun + 1
        local inv = e.get_inventory(defines.inventory.turret_ammo) local c = inv.get_item_count()
        if c > 0 then o.loaded = o.loaded + 1 end
        if c < %d and s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} == 0 then
          local nm = nil
          if have['piercing-rounds-magazine'] >= 100 then nm = 'piercing-rounds-magazine' elseif have['firearm-magazine'] >= 30 then nm = 'firearm-magazine'
          elseif have['piercing-rounds-magazine'] >= 30 then nm = 'piercing-rounds-magazine' end
          if nm and not inv.is_empty() and inv[1].valid_for_read and inv[1].name ~= nm and have[inv[1].name] >= 30 then nm = inv[1].name end
          if nm then local n = math.min(100, %d - c)
            if pcall(function() s.create_entity{name = 'item-request-proxy', position = e.position, force = 'player', target = e,
                modules = {{id = {name = nm}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = n}}}}}} end) then
              o.req = o.req + 1 have[nm] = have[nm] - n end
          end
        end
      end
    elseif s.find_entities_filtered{ghost_name = t[1], position = p, radius = 0.6}[1] then o.ghost = o.ghost + 1 end
  end
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = {%s, %s}, radius = 60}
  return o end)()"""


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sites": {k: {"at": p, "stage": "check"} for k, p in SITES}}


def save(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def ensure_goal():
    """대포 키트의 목표 방향 (artykit23.load_goal) - 없을 때만 쓴다."""
    if artykit23.load_goal()[0] is None:
        with open(artykit23.GOAL_FILE, "w", encoding="utf-8") as f:
            json.dump(GOAL, f)
        log("arty_goal.json 작성 %s" % GOAL)


def _l(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def ring_rows(ring):
    return ", ".join("{'%s', %s, %s}" % (r[0], r[1], r[2]) for r in ring)


def ring_status(ai, site):
    rp = site["rp"]
    return ai.lua(STATUS % (ring_rows(site["ring"]) if site.get("ring") else "", 10 if site["stage"] == "done" else 1,
                            AMMO, rp[0], rp[1]))


def place_ring(ai, name, site, n, lasers, skip=()):
    rp = site["rp"]
    lz = ", ".join("1" if i in lasers else "0" for i in range(n))
    r = ai.lua(RING % (rp[0], rp[1], n, lz, ", ".join("{%s, %s}" % (q[1], q[2]) for q in skip)))
    ring = [_l(x) for x in _l(r.get("ring"))]
    rows = ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in ring]
    rows += ["{'small-electric-pole', %s, %s}" % (x[3], x[4]) for x in ring if x[0] == "laser-turret"]
    g = artykit23.ghosts(ai, rows)
    return ring, r.get("face"), g


def tick(ai, st, dry=False):
    """앞에서부터 끝나지 않은 첫 기지 한 단계. 끝난 기지는 탄 보충 · 레이저 추가."""
    for name, _ in SITES:
        site = st["sites"][name]
        stage = site["stage"]
        if stage == "done":
            if not site.get("ring"):
                continue
            s = ring_status(ai, site)
            if s.get("req"):
                log("%s 링 탄 보충 %s (기관 %s · 레이저 %s/%s 전력)" % (name, s["req"], s["gun"], s["laser"], s["lpow"]))
            sv = ai.lua(SURVEY % tuple(site["rp"]))
            if not dry and not any(x[0] == "laser-turret" for x in site["ring"]) and (sv.get("stock") or {}).get("laser", 0) >= 2:
                add, face, g = place_ring(ai, name, site, 2, {0, 1}, skip=site["ring"])
                add = [x for x in add if x[0] == "laser-turret"]
                if add:
                    site["ring"] += add
                    log("%s 레이저 포탑 섞기 +%d %s · 유령 %s" % (name, len(add), [x[1:3] for x in add], g.get("made")))
            continue
        sv = ai.lua(SURVEY % tuple(site["at"]))
        if stage == "check":
            why = []
            if sv.get("enemy"):
                why.append("반경 50 적 구조물 %s" % sv["enemy"])
            if sv.get("units"):
                why.append("반경 60 적 유닛 %s" % sv["units"])
            if not sv.get("rp"):
                why.append("로보포트 자리 없음")
            elif sv.get("bd", 1e9) > 48 and sv.get("built") != 1:
                why.append("앞 망 로보포트 체비셰프 %s > 48" % sv.get("bd"))
            if why:
                return "%s 대기: %s" % (name, " · ".join(why))
            site["rp"] = _l(sv["rp"])
            p = ai.lua(POLES % tuple(site["rp"]))
            if p.get("err"):
                return "%s 전봇대 줄 실패: %s" % (name, p["err"])
            poles = [_l(x) for x in _l(p.get("poles"))]
            corners = [_l(x) for x in _l(p.get("corners"))]
            if dry:
                return "%s 드라이런: 로보포트 %s (다리 %s, 체비셰프 %s) · 전봇대 %d (%s 에서) + 모서리 %d · 이미 지키는 포탑 %s · 재고 %s" % (
                    name, site["rp"], sv.get("bridge"), sv.get("bd"), len(poles), p.get("src"), len(corners), sv.get("guard"), sv.get("stock"))
            rows = ["{'small-electric-pole', %s, %s}" % (q[0], q[1]) for q in poles + corners]
            rows.append("{'roboport', %s, %s}" % tuple(site["rp"]))
            g = artykit23.ghosts(ai, rows)
            site.update(stage="rp", poles=poles, corners=corners, t=time.time())
            return "%s 유령: 로보포트 %s (다리 %s, 체비셰프 %s) · 전봇대 %d (%s 에서) + 모서리 %d · 만듦 %s · 실패 %s" % (
                name, site["rp"], sv.get("bridge"), sv.get("bd"), len(poles), p.get("src"), len(corners), g.get("made"), _l(g.get("fail")))
        if dry:
            return "%s 단계 %s" % (name, stage)
        if stage == "rp":
            if sv.get("built") == 1 and sv.get("power") and sv.get("rnet") == sv.get("net"):
                if sv.get("guard", 0) >= RING_N:
                    site.update(stage="done", ring=[])
                    return "%s 로보포트 섬 (망 %s, 전력) · 반경 22 안 탄 든 포탑 %s -> 새 링 없이 끝" % (name, sv["rnet"], sv["guard"])
                lasers = {1, 4} if (sv.get("stock") or {}).get("laser", 0) >= 2 else set()
                ring, face, g = place_ring(ai, name, site, RING_N, lasers)
                site.update(stage="ring", ring=ring, t=time.time())
                return "%s 로보포트 섬 (망 %s) -> 포탑 링 %d (적 방향 %s도, 레이저 %d) 유령 %s" % (
                    name, sv["rnet"], len(ring), face, sum(1 for x in ring if x[0] == "laser-turret"), g.get("made"))
            if sv.get("built") == -1:  # 유령이 사라짐 (공습 등) - 다시
                site["stage"] = "check"
                return "%s 로보포트 유령 없음 -> 다시 조사" % name
            if time.time() - site.get("t", 0) > 600 and int(time.time()) % 300 < 20:
                return "%s 로보포트 대기 %d분 (섬 %s · 전력 %s · 망 %s)" % (name, (time.time() - site["t"]) // 60, sv.get("built"), sv.get("power"), sv.get("rnet"))
            return None
        if stage == "ring":
            s = ring_status(ai, site)
            need = min(RING_N, len(site["ring"]))
            if s["built"] >= need and s["loaded"] >= s["gun"] and s["lpow"] >= s["laser"]:
                site["stage"] = "done"
                return "%s 링 완료: 포탑 %d (기관 %d 탄 든 %d · 레이저 %d 전력 %d) -> 다음 기지" % (
                    name, s["built"], s["gun"], s["loaded"], s["laser"], s["lpow"])
            if s["built"] + s["ghost"] < len(site["ring"]):
                artykit23.ghosts(ai, ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in site["ring"]]
                                 + ["{'small-electric-pole', %s, %s}" % (x[3], x[4]) for x in site["ring"] if x[0] == "laser-turret"])
            if s.get("req"):
                return "%s 링 %d/%d 섬 · 탄 요청 %d" % (name, s["built"], len(site["ring"]), s["req"])
            return None
    return "ALL_DONE"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--every", type=float, default=20)
    a = ap.parse_args()
    ai = AIBridge()
    st = load()
    if a.check:
        print(tick(ai, json.loads(json.dumps(st)), dry=True))
        print(json.dumps(st, ensure_ascii=False))
        return 0
    ensure_goal()
    log("copperchain23 시작 · " + " · ".join("%s %s" % (k, v["stage"]) for k, v in st["sites"].items()))
    announced = False
    while True:
        try:
            m = tick(ai, st)
            save(st)
            if m == "ALL_DONE":
                kit = artykit23.load() or {}
                goal, prefer, only = artykit23.load_goal()
                site = kit.get("site")
                if only and prefer and site and abs(site[0] - prefer[0]) < 3 and abs(site[1] - prefer[1]) < 3:
                    with open(artykit23.GOAL_FILE, "w", encoding="utf-8") as f:  # H2 도착 - 다음부터는 목표 통로 안 어디든
                        json.dump({"x": goal[0], "y": goal[1]}, f)
                    log("대포 H2 도착 -> arty_goal only_prefer · prefer 해제 (다음 이전은 구리 쪽 통로 안 표적 최다)")
                if not announced:
                    log("R0·R1·R2 전부 섬 - 대포 키트가 prefer H2 (58.5,-271.5) 로 옮길 수 있다. 상주: 링 탄 보충 · 레이저 섞기")
                    announced = True
            elif m:
                log(m)
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

"""이동 포대 키트 - 사용자 (00:44): "대포를 설치한 부분으로 방어선 및 로보포트를 옮겨야 함".

대포가 옮겨 갈 때 둘레 포탑 링 · 로보포트 (+전봇대 줄) · 저장 상자가 함께 옮겨 가는 '이동 포대 기지'.
artyaim23 가 사거리가 비면 start_move() 를 부르고, 5초 루프에서 step() 을 부른다.

키트 (state/arty_kit.json):
    {"site": [x, y],                       # 지금 대포 자리
     "members": {"roboport": [x, y] | null, "turrets": [[x, y], ..], "poles": [[x, y], ..], "chest": [x, y] | null},
     "adopt_user": false,                  # 사용자 (Guiltyring) 건물을 키트로 옮겨도 되나 - 사용자 확인 뒤에만 true
     "move": null | {...}}                 # 이전 중 상태 (단계 rp -> ring -> arty -> chest -> 끝)

새 자리 고르기 (plan): 로봇망 밖도 허용. 조건
  * 새 로보포트 r 이 키트 아닌 망 로보포트 B 와 체비셰프 48 안 (연결 거리 25+25) - 망이 이어 붙고 B 의 건설 범위 (55) 안이라 로봇이 짓는다.
  * 대포 p 는 r 에서 7 칸 (r 의 물류 범위 안 - 포탄 배달).
  * r 까지 전봇대 줄 (소형, 7 칸 간격) 을 가까운 전력망 전봇대에서 이을 수 있고, 그 수가 망 재고 + 옛 키트 전봇대 이하.
  * p 반경 50 · r 반경 50 안에 적 구조물 (산란기 · 땅벌레, 사거리 ~48) 없음. 이전 시작은 p 반경 80 · 옛 자리 반경 60 에 적 유닛 0 일 때만.
  * 포탑 링: 가장 가까운 적 구조물 방향 우선 (0, +-30, +-60, +-95, 180 도, 반경 9~12), 키트 포탑 + 망 재고만큼 (최대 8, 최소 4).
  * 사거리 224-4 안 적 구조물 최다, 같으면 기지 중심 (-40,-20) 에 가까운 쪽.
순서: 로보포트 · 전봇대 유령 -> (로보포트 섬) 포탑 링 유령 -> (링 6대 또는 전부 섬) 대포 유령 -> (대포 섬) 상자 -> 옛 키트 해체.
망 재고가 모자라면 옛 키트를 먼저 걷어 재료로 쓴다 (로봇이 창고로 -> 새 유령). 키트 아닌 벽 줄 포탑은 절대 건드리지 않는다.

    python -u scripts/artykit23.py --show                   # 키트 · 이전 상태
    python -u scripts/artykit23.py --designate              # 지금 대포 둘레로 키트 지정 (드라이런)
    python -u scripts/artykit23.py --designate --apply [--adopt-user]
    python -u scripts/artykit23.py --plan                   # 다음 이전 드라이런 (새 자리 · 링 · 전봇대 · 부족분)
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge")]
from client import AIBridge  # noqa: E402

KIT_FILE = os.path.join(HERE, "..", "state", "arty_kit.json")
SPOT_FILE = os.path.join(HERE, "..", "state", "arty_spot.json")
# 목표 방향 (01:30 구리 전초 계획): {"x": 61, "y": -407, "prefer": [58.5, -271.5]} 이 있으면 plan 은
# 옛 자리보다 목표에 가까운 후보만 고르고, prefer (H2) 가 조건을 채우면 (R2 가 서서 망 54 안) 그것을 먼저 쓴다.
GOAL_FILE = os.path.join(HERE, "..", "state", "arty_goal.json")
USER = "Guiltyring"
STAGE_ORDER = ("rp", "ring", "arty", "chest")


def load():
    try:
        with open(KIT_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def save(kit):
    tmp = KIT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(kit, f, ensure_ascii=False, indent=1)
    os.replace(tmp, KIT_FILE)


def moving_stage():
    """artyprep23.arty_spots 용: 이전 중이면 단계 이름, 아니면 None."""
    k = load()
    return (k.get("move") or {}).get("stage") if k else None


def _pts(rows):
    return ", ".join("{%s, %s}" % (p[0], p[1]) for p in rows)


def _pt(p):
    return "{%s, %s}" % (p[0], p[1]) if p else "nil"


def _lst(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


# ------------------------------------------------------------------ 지정

DESIGNATE = """(function() local s = game.surfaces[1] local o = {turrets = {}, poles = {}, skip = {}}
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  local P = t and t.position or %s  -- 대포가 창고에 가 있으면 키트 자리
  if not P then return {err = 'no artillery'} end
  o.site = {P.x, P.y}
  local ADOPT = %s
  local function mine(e) return ADOPT or not (e.last_user and e.last_user.name == '%s') end
  for _, g in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player', position = P, radius = 14}) do
    if mine(g) and not g.to_be_deconstructed() then o.turrets[#o.turrets + 1] = {g.position.x, g.position.y}
    else o.skip[#o.skip + 1] = 'gun-turret@' .. g.position.x .. ',' .. g.position.y .. (g.last_user and (' u=' .. g.last_user.name) or '') end
  end
  table.sort(o.turrets, function(a, b) return (a[1] - P.x)^2 + (a[2] - P.y)^2 < (b[1] - P.x)^2 + (b[2] - P.y)^2 end)
  while #o.turrets > 8 do table.remove(o.turrets) end
  -- 로보포트: 대포 25 칸 안에서 대포를 물류 범위로 덮는 것 중 '잎' (그것 없이도 망의 나머지가 이어지는 것) - 연결 상대가 1 개뿐인 것
  local rps = s.find_entities_filtered{name = 'roboport', force = 'player'}
  local best, bd = nil, 1e9
  for _, r in pairs(rps) do
    local d = math.max(math.abs(r.position.x - P.x), math.abs(r.position.y - P.y))
    if d <= 22 and mine(r) then
      local links = 0
      for _, q in pairs(rps) do if q ~= r and math.abs(q.position.x - r.position.x) < 50 and math.abs(q.position.y - r.position.y) < 50 then links = links + 1 end end
      if links == 1 and d < bd then best, bd = r, d end
    end
  end
  if best then
    o.roboport = {best.position.x, best.position.y}
    -- 그 로보포트에 전기를 주는 전봇대 (공급 범위가 로보포트에 닿는 것) 와, 그 전봇대에서 가지처럼 뻗은 것만
    -- 그 가지를 따라 줄 (연결 2 이하인 마디) 로 거슬러 올라간다 - 대포 14 칸 · 로보포트 6 칸 밖, 사용자 전봇대, 갈림길에서 멈춘다 (최대 8).
    -- (반경 제한 없이 따라가면 NW 포트 로보포트 (-172,-90) 에 전기를 대는 본선까지 키트로 잡혔다 - 드라이런 실측)
    local seen, queue = {}, {}
    for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', force = 'player', position = best.position, radius = 5}) do queue[#queue + 1] = p end
    while #queue > 0 and #o.poles < 8 do
      local p = table.remove(queue, 1) local key = p.position.x .. ',' .. p.position.y
      if not seen[key] then seen[key] = true
        local nb = {} pcall(function() for _, c in pairs(p.get_wire_connector(defines.wire_connector_id.pole_copper, false).connections) do nb[#nb + 1] = c.target.owner end end)
        local near = (p.position.x - P.x)^2 + (p.position.y - P.y)^2 <= 196 or math.max(math.abs(p.position.x - best.position.x), math.abs(p.position.y - best.position.y)) <= 6
        if near and mine(p) and #nb <= 2 then
          o.poles[#o.poles + 1] = {p.position.x, p.position.y}
          for _, q in pairs(nb) do queue[#queue + 1] = q end
        end
      end
    end
  else o.skip[#o.skip + 1] = 'roboport: 대포 22 칸 안 잎 로보포트 없음' end
  local c = s.find_entities_filtered{name = 'storage-chest', force = 'player', position = P, radius = 14}[1]
  if c and mine(c) then o.chest = {c.position.x, c.position.y} end
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.stock = {turret = net.get_item_count('gun-turret'), roboport = net.get_item_count('roboport'),
             pole = net.get_item_count('small-electric-pole'), chest = net.get_item_count('storage-chest')}
  return o end)()"""


def designate(ai, apply=False, adopt_user=False):
    kit0 = load() or {}
    site = kit0.get("site")
    fb = "{x = %s, y = %s}" % (site[0], site[1]) if site else "nil"
    r = ai.lua(DESIGNATE % (fb, "true" if adopt_user else "false", USER))
    if r.get("err"):
        return r
    members = {"roboport": r.get("roboport"), "turrets": _lst(r.get("turrets")),
               "poles": _lst(r.get("poles")), "chest": r.get("chest")}
    kit = load() or {}
    if kit.get("move"):
        return {"err": "이전 중에는 다시 지정하지 않는다", "move": kit["move"].get("stage")}
    out = {"site": _lst(r["site"]), "members": members, "adopt_user": adopt_user,
           "skip": _lst(r.get("skip")), "stock": r.get("stock")}
    if apply:
        save({"site": out["site"], "members": members, "adopt_user": adopt_user, "move": None,
              "since": time.strftime("%H:%M:%S")})
        out["saved"] = KIT_FILE
    return out


# ------------------------------------------------------------------ 새 자리

PLAN = """(function() local s = game.surfaces[1] local R = 224
  local KRP = %s  local KPOLES = {%s}  local NT = %d  local SITE = %s
  local GOAL = %s  local PREFER = %s  local ONLY = %s  -- 목표 방향 (arty_goal.json), 없으면 nil. ONLY: prefer 자리만 (포탄 아끼며 H2 대기)
  local function gd(x, y) return GOAL and math.sqrt((x - GOAL[1])^2 + (y - GOAL[2])^2) or 0 end
  local GD0 = (GOAL and SITE) and gd(SITE[1], SITE[2]) or 1e9
  -- 통로: 기지 중심 (-40,-20) -> 목표 직선에서 80 칸 안 (옛 자리가 남쪽이면 서쪽 (-215,-143) 도 '더 가까움' 이라 걸러야 함 - 01:31 드라이런)
  local function lane(x, y) if not GOAL then return true end
    local vx, vy = GOAL[1] + 40, GOAL[2] + 20 local L = math.sqrt(vx * vx + vy * vy)
    return math.abs((x + 40) * vy - (y + 20) * vx) / L <= 80 end
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local function stock(n) return net and net.get_item_count(n) or 0 end
  local ring_n = math.min(8, NT + stock('gun-turret'))
  local o = {ring_avail = NT + stock('gun-turret'), rp_avail = (KRP and 1 or 0) + stock('roboport'),
             pole_avail = #KPOLES + stock('small-electric-pole')}
  if ring_n < 4 then o.err = 'ring ' .. ring_n .. ' < 4 (키트 포탑 + 망 재고)' return o end
  if o.rp_avail < 1 then o.err = '로보포트 없음 (키트 · 재고)' return o end
  local function same(a, x, y) return a and math.abs(a[1] - x) < 0.6 and math.abs(a[2] - y) < 0.6 end
  local kpole = {} for _, q in pairs(KPOLES) do kpole[q[1] .. ',' .. q[2]] = true end
  local B = {}
  for _, r in pairs(s.find_entities_filtered{name = 'roboport', force = 'player'}) do
    if r.logistic_network and net and r.logistic_network.network_id == net.network_id and not same(KRP, r.position.x, r.position.y) then B[#B + 1] = r end
  end
  if #B == 0 then o.err = '다리 로보포트 없음' return o end
  local EID = B[1].electric_network_id
  local ENEMY = {'unit-spawner', 'turret'}
  local cands = {}
  for x = -330, 250, 6 do for y = -330, 250, 6 do
    local p = {x = x + 0.5, y = y + 0.5}
    local bb, bd = nil, 1e9
    for _, b in pairs(B) do local d = math.max(math.abs(b.position.x - p.x), math.abs(b.position.y - p.y)) if d < bd then bb, bd = b, d end end
    if bd <= 54 and not (SITE and (p.x - SITE[1])^2 + (p.y - SITE[2])^2 < 400) and gd(p.x, p.y) < GD0 and lane(p.x, p.y)  -- 목표: 옛 자리보다 가깝고 통로 안
       and s.count_entities_filtered{force = 'enemy', type = ENEMY, position = p, radius = 50} == 0 then
      local n = s.count_entities_filtered{force = 'enemy', type = ENEMY, position = p, radius = R - 4}
      if n > 0 then cands[#cands + 1] = {p = p, b = bb, n = n, d = (p.x + 40)^2 + (p.y + 20)^2} end
    end
  end end
  if GOAL then for _, c in pairs(cands) do c.d = gd(c.p.x, c.p.y) end end  -- 목표: 같은 표적 수면 목표에 가까운 쪽
  table.sort(cands, function(a, b) if a.n ~= b.n then return a.n > b.n end return a.d < b.d end)
  if ONLY and PREFER then cands = {} end  -- only_prefer: 중간 자리 (R1 과 겹치는 (60.5,-179.5) 등) 로 가지 않는다
  if PREFER then  -- prefer (H2) 는 망 54 안 · 적 구조물 50 밖 · 표적 1 이상이면 맨 앞
    local p = {x = PREFER[1], y = PREFER[2]} local bb, bd = nil, 1e9
    for _, b in pairs(B) do local d = math.max(math.abs(b.position.x - p.x), math.abs(b.position.y - p.y)) if d < bd then bb, bd = b, d end end
    local n = s.count_entities_filtered{force = 'enemy', type = ENEMY, position = p, radius = R - 4}
    if bd <= 54 and n > 0 and gd(p.x, p.y) < GD0 and lane(p.x, p.y) and s.count_entities_filtered{force = 'enemy', type = ENEMY, position = p, radius = 50} == 0 then
      table.insert(cands, 1, {p = p, b = bb, n = n, d = 0}) o.prefer = 1 end
  end
  o.cands = #cands
  local function ok(name, pos) return s.can_place_entity{name = name, position = pos, force = 'player', build_check_type = defines.build_check_type.manual_ghost} end
  local rects
  local function free(pos, h) for _, q in pairs(rects) do if math.abs(q[1] - pos[1]) < q[3] + h and math.abs(q[2] - pos[2]) < q[3] + h then return false end end return true end
  local function cheb(a, b) return math.max(math.abs(a[1] - b[1]), math.abs(a[2] - b[2])) end
  local why = {}
  for i, c in ipairs(cands) do if i > 30 then break end
    local p = {c.p.x, c.p.y} rects = {} local fail = nil
    if not ok('artillery-turret', p) then fail = 'arty' end
    rects[#rects + 1] = {p[1], p[2], 1.5}
    -- 로보포트: 대포에서 다리 로보포트 쪽으로 7~9 칸
    local r = nil
    if not fail then
      local vx, vy = c.b.position.x - p[1], c.b.position.y - p[2] local L = math.sqrt(vx * vx + vy * vy)
      for _, k in ipairs({7, 8, 9, 6}) do for _, side in ipairs({0, 2, -2, 3, -3}) do
        if not r then
          local q = {math.floor(p[1] + vx / L * k - vy / L * side + 0.5), math.floor(p[2] + vy / L * k + vx / L * side + 0.5)}
          if cheb(q, {c.b.position.x, c.b.position.y}) <= 48 and cheb(q, p) <= 20 and free(q, 2) and ok('roboport', q)
             and s.count_entities_filtered{force = 'enemy', type = ENEMY, position = q, radius = 50} == 0 then r = q end
        end
      end end
      if not r then fail = 'roboport' else rects[#rects + 1] = {r[1], r[2], 2} end
    end
    -- 전봇대 줄: 전력망 (다리 로보포트와 같은 망) 의 가까운 전봇대에서 r 까지
    local poles = {}
    if not fail then
      local src, sd = nil, 1e9
      for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', force = 'player', position = r, radius = 90}) do
        if e.electric_network_id == EID and not kpole[e.position.x .. ',' .. e.position.y] and not e.to_be_deconstructed() then
          local d = (e.position.x - r[1])^2 + (e.position.y - r[2])^2 if d < sd then src, sd = e, d end end
      end
      if not src then fail = 'no power pole in 90'
      else
        local cur = {src.position.x, src.position.y}
        while not fail and cheb(cur, r) > 4 do
          if #poles >= 14 then fail = 'poles > 14' break end
          local vx, vy = r[1] - cur[1], r[2] - cur[2] local L = math.sqrt(vx * vx + vy * vy)
          local st = math.min(7, L - 3)
          local got = nil
          for _, back in ipairs({0, 1, 2}) do for _, dx in ipairs({0, 1, -1}) do for _, dy in ipairs({0, 1, -1}) do
            if not got then
              local q = {math.floor(cur[1] + vx / L * (st - back)) + 0.5 + dx, math.floor(cur[2] + vy / L * (st - back)) + 0.5 + dy}
              local dq = math.sqrt((q[1] - cur[1])^2 + (q[2] - cur[2])^2)
              if dq <= 7.4 and dq >= 1 and free(q, 0.5) and ok('small-electric-pole', q) then got = q end
            end
          end end end
          if not got then fail = 'pole blocked @' .. cur[1] .. ',' .. cur[2] break end
          poles[#poles + 1] = got rects[#rects + 1] = {got[1], got[2], 0.5} cur = got
        end
        c.src = {src.position.x, src.position.y}
      end
      if not fail and #poles > o.pole_avail then fail = 'poles ' .. #poles .. ' > ' .. o.pole_avail end
    end
    -- 포탑 링: 가장 가까운 적 구조물 쪽부터
    local ring = {}
    if not fail then
      local es = s.find_entities_filtered{force = 'enemy', type = ENEMY, position = p, radius = R}
      local e, ed = nil, 1e9
      for _, q in pairs(es) do local d = (q.position.x - p[1])^2 + (q.position.y - p[2])^2 if d < ed then e, ed = q, d end end
      local a0 = math.atan2(e.position.y - p[2], e.position.x - p[1])
      for _, deg in ipairs({0, 30, -30, 60, -60, 95, -95, 180}) do
        if #ring < ring_n then
          local a = a0 + math.rad(deg) local got = nil
          for _, rad in ipairs({9, 10, 11, 8, 12}) do
            if not got then
              local q = {math.floor(p[1] + rad * math.cos(a) + 0.5), math.floor(p[2] + rad * math.sin(a) + 0.5)}
              if free(q, 1) and ok('gun-turret', q) then got = q end
            end
          end
          if got then ring[#ring + 1] = got rects[#rects + 1] = {got[1], got[2], 1} end
        end
      end
      if #ring < math.min(ring_n, 6) then fail = 'ring ' .. #ring end
      c.face = math.floor(math.deg(a0))
    end
    local chest = nil
    if not fail then
      for _, d in ipairs({{-2.5, 3.5}, {2.5, 3.5}, {-2.5, -3.5}, {2.5, -3.5}, {3.5, 2.5}, {-3.5, 2.5}, {3.5, -2.5}, {-3.5, -2.5}}) do
        local q = {r[1] + d[1], r[2] + d[2]}
        if not chest and free(q, 0.5) and ok('storage-chest', q) then chest = q end
      end
    end
    if fail then why[#why + 1] = p[1] .. ',' .. p[2] .. ':' .. fail
    else
      o.to = p o.rp = r o.poles = poles o.ring = ring o.chest = chest o.n = c.n o.face = c.face o.src = c.src
      o.bridge = {c.b.position.x, c.b.position.y}
      o.why = why return o
    end
  end
  o.why = why o.err = '가능한 자리 없음'
  return o end)()"""


def load_goal():
    """state/arty_goal.json -> (goal [x, y] | None, prefer [x, y] | None, only_prefer)."""
    try:
        with open(GOAL_FILE, encoding="utf-8") as f:
            g = json.load(f)
        return [g["x"], g["y"]], g.get("prefer"), bool(g.get("only_prefer"))
    except (OSError, ValueError, KeyError, TypeError):
        return None, None, False


def plan(ai, kit):
    m = kit["members"]
    goal, prefer, only = load_goal()
    r = ai.lua(PLAN % (_pt(m.get("roboport")), _pts(m.get("poles") or []), len(m.get("turrets") or []),
                       _pt(kit.get("site")), _pt(goal), _pt(prefer), "true" if only else "false"))
    for k in ("to", "rp", "src", "bridge", "chest"):
        if k in r and r[k] is not None:
            r[k] = _lst(r[k])
    for k in ("poles", "ring", "why"):
        r[k] = [(_lst(v) if isinstance(v, (dict, list)) else v) for v in _lst(r.get(k))]
    return r


# ------------------------------------------------------------------ 게임 조작

# 유령 놓기 (나무 · 바위는 해체 표시). rows = {{name, x, y}, ..}
GHOSTS = """(function() local s = game.surfaces[1] local o = {made = 0, have = 0, fail = {}}
  local P = {['roboport'] = 2, ['gun-turret'] = 1, ['artillery-turret'] = 1.5, ['small-electric-pole'] = 0.5, ['storage-chest'] = 0.5}
  for _, t in pairs({%s}) do
    local pos = {t[2], t[3]} local h = P[t[1]] or 1
    if s.find_entities_filtered{name = t[1], position = pos, radius = 0.4}[1] or s.find_entities_filtered{ghost_name = t[1], position = pos, radius = 0.4}[1] then
      o.have = o.have + 1
    else
      for _, e in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{pos[1] - h - 0.5, pos[2] - h - 0.5}, {pos[1] + h + 0.5, pos[2] + h + 0.5}}}) do
        if not e.to_be_deconstructed() then e.order_deconstruction('player') end end
      local g = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = pos, force = 'player', expires = false}
      if g then o.made = o.made + 1 else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
    end
  end return o end)()"""

# 옛 키트 해체. 사용자 건물은 ADOPT 일 때만. 전봇대는 키트 밖 전봇대와 두 곳 이상 이어졌으면 (남의 줄의 마디) 남긴다.
DECON = """(function() local s = game.surfaces[1] local o = {n = 0, skip = {}}
  local ADOPT = %s  local KP = {} for _, q in pairs({%s}) do KP[q[1] .. ',' .. q[2]] = true end
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.4, force = 'player'}[1]
    if e and not e.to_be_deconstructed() then
      local ok = ADOPT or not (e.last_user and e.last_user.name == '%s')
      if ok and e.type == 'electric-pole' then
        local outside = 0
        pcall(function() for _, c in pairs(e.get_wire_connector(defines.wire_connector_id.pole_copper, false).connections) do
          local q = c.target.owner if not KP[q.position.x .. ',' .. q.position.y] then outside = outside + 1 end end end)
        if outside > 1 then ok = false o.skip[#o.skip + 1] = 'pole 마디 ' .. t[2] .. ',' .. t[3] end
      end
      if ok then e.order_deconstruction('player') o.n = o.n + 1 elseif e.type ~= 'electric-pole' then o.skip[#o.skip + 1] = t[1] .. ' 사용자 ' .. t[2] .. ',' .. t[3] end
    end
  end return o end)()"""

STATUS = """(function() local s = game.surfaces[1] local o = {}
  local function real(n, p) return s.find_entities_filtered{name = n, position = p, radius = 0.4, force = 'player'}[1] end
  local function ghost(n, p) return s.find_entities_filtered{ghost_name = n, position = p, radius = 0.4}[1] end
  local rp = real('roboport', %s) o.rp = rp and 1 or 0 o.rp_ghost = (not rp and ghost('roboport', %s)) and 1 or 0
  o.rp_power = rp and (rp.energy > 0 and 1 or 0) or 0
  o.ring = 0 o.ring_ghost = 0 local empty = {}
  for _, p in pairs({%s}) do local g = real('gun-turret', p)
    if g then o.ring = o.ring + 1 if g.get_inventory(defines.inventory.turret_ammo).is_empty() then empty[#empty + 1] = g end
    elseif ghost('gun-turret', p) then o.ring_ghost = o.ring_ghost + 1 end end
  local a = real('artillery-turret', %s) o.arty = a and 1 or 0
  o.arty_any = s.count_entities_filtered{name = 'artillery-turret', force = 'player'} + s.count_entities_filtered{ghost_name = 'artillery-turret', force = 'player'}
  local ch = %s o.chest = ch and (real('storage-chest', ch) and 1 or 0) or -1
  o.poles = 0 for _, p in pairs({%s}) do if real('small-electric-pole', p) then o.poles = o.poles + 1 end end
  -- 링 포탑 첫 탄 (망 재고 100 이상인 종류, 대상당 30)
  local net = s.find_logistic_network_by_position({-24, -88}, 'player') o.ammo = 0
  for _, g in pairs(empty) do
    if s.count_entities_filtered{name = 'item-request-proxy', position = g.position, radius = 0.5} == 0 then
      for _, nm in pairs({'piercing-rounds-magazine', 'firearm-magazine'}) do
        if net and net.get_item_count(nm) >= 100 then
          if pcall(function() s.create_entity{name = 'item-request-proxy', position = g.position, force = 'player', target = g,
              modules = {{id = {name = nm}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = 30}}}}}} end) then o.ammo = o.ammo + 1 end
          break
        end
      end
    end
  end
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = %s, radius = 60}
  return o end)()"""

UNITS = """(function() local s = game.surfaces[1]
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  return {new = s.count_entities_filtered{force = 'enemy', type = 'unit', position = %s, radius = 80},
          old = t and s.count_entities_filtered{force = 'enemy', type = 'unit', position = t.position, radius = 60} or 0,
          stock_rp = s.find_logistic_network_by_position({-24, -88}, 'player').get_item_count('roboport'),
          stock_pole = s.find_logistic_network_by_position({-24, -88}, 'player').get_item_count('small-electric-pole'),
          stock_tur = s.find_logistic_network_by_position({-24, -88}, 'player').get_item_count('gun-turret'),
          stock_chest = s.find_logistic_network_by_position({-24, -88}, 'player').get_item_count('storage-chest')} end)()"""

MOVE_ARTY = """(function() local t = game.surfaces[1].find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  if not t then return {err = 'no turret'} end
  return {ok = t.order_deconstruction('player') and 1 or 0, x = t.position.x, y = t.position.y} end)()"""


def _rows(name, pts):
    return ["{'%s', %s, %s}" % (name, p[0], p[1]) for p in pts]


def ghosts(ai, rows):
    return ai.lua(GHOSTS % ", ".join(rows)) if rows else {"made": 0}


def decon(ai, kit, rows):
    if not rows:
        return {"n": 0}
    return ai.lua(DECON % ("true" if kit.get("adopt_user") else "false", _pts(kit["members"].get("poles") or []),
                           ", ".join(rows), USER))


def _old_rows(kit, what):
    m = kit["move"]["old"]
    if what == "roboport":
        return _rows("roboport", [m["roboport"]]) if m.get("roboport") else []
    if what == "turrets":
        return _rows("gun-turret", m.get("turrets") or [])
    if what == "poles":
        return _rows("small-electric-pole", m.get("poles") or []) + _rows("medium-electric-pole", m.get("poles") or [])
    if what == "chest":
        return _rows("storage-chest", [m["chest"]]) if m.get("chest") else []
    return []


def start_move(ai, dry=False):
    """사거리가 비었을 때 artyaim 이 부른다. 문자열 (로그 한 줄) 또는 None (키트로 못 옮김 -> 옛 방식)."""
    kit = load()
    if not kit or kit.get("move"):
        return None
    r = plan(ai, kit)
    if r.get("err"):
        return None if not dry else r
    u = ai.lua(UNITS % _pt(r["to"]))
    if dry:
        r["units"] = u
        return r
    if u.get("new") or u.get("old"):
        return "키트 이전 보류: 적 유닛 새 자리 %s · 옛 자리 %s" % (u.get("new"), u.get("old"))
    m = ai.lua(MOVE_ARTY)
    kit["move"] = {"to": r["to"], "rp": r["rp"], "poles": r["poles"], "ring": r["ring"], "chest": r.get("chest"),
                   "n": r["n"], "src": r.get("src"), "bridge": r.get("bridge"), "stage": "rp", "t0": time.time(),
                   "ts": time.time(), "old": kit["members"], "done_old": []}
    with open(SPOT_FILE, "w", encoding="utf-8") as f:
        json.dump(list(r["to"]), f)
    g = ghosts(ai, _rows("roboport", [r["rp"]]) + _rows("small-electric-pole", r["poles"]))
    notes = []
    # 망에 로보포트 · 전봇대가 모자라면 옛 키트 것을 먼저 걷는다 (로봇이 창고로 -> 새 유령)
    if u.get("stock_rp", 0) < 1:
        notes.append("옛 로보포트 먼저 해체 %s" % decon(ai, kit, _old_rows(kit, "roboport")).get("n"))
        kit["move"]["done_old"].append("roboport")
    if u.get("stock_pole", 0) < len(r["poles"]):
        notes.append("옛 전봇대 먼저 해체 %s" % decon(ai, kit, _old_rows(kit, "poles")).get("n"))
        kit["move"]["done_old"].append("poles")
    save(kit)
    return "키트 이전 시작 (%s,%s) -> (%s,%s) · 표적 %s · 로보포트 %s · 전봇대 %d (%s 에서) · 링 %d (적 방향 %s도) · 대포 해체 %s · 유령 %s %s" % (
        m.get("x"), m.get("y"), r["to"][0], r["to"][1], r["n"], r["rp"], len(r["poles"]), r.get("src"),
        len(r["ring"]), r.get("face"), m.get("ok"), g.get("made"), " · ".join(notes))


def step(ai):
    """이전 중이면 한 단계씩 진행. 로그 한 줄 또는 None."""
    kit = load()
    mv = kit and kit.get("move")
    if not mv:
        return None
    st = ai.lua(STATUS % (_pt(mv["rp"]), _pt(mv["rp"]), _pts(mv["ring"]), _pt(mv["to"]), _pt(mv.get("chest")),
                          _pts(mv["poles"]), _pt(mv["to"])))
    stage, msg = mv["stage"], None
    need_ring = min(len(mv["ring"]), 6)
    if stage == "rp":
        if st.get("rp"):
            g = ghosts(ai, _rows("gun-turret", mv["ring"]))
            u = ai.lua(UNITS % _pt(mv["to"]))
            extra = ""
            if u.get("stock_tur", 0) < len(mv["ring"]) and "turrets" not in mv["done_old"]:
                extra = " · 옛 링 해체 %s" % decon(ai, kit, _old_rows(kit, "turrets")).get("n")
                mv["done_old"].append("turrets")
            mv["stage"], msg = "ring", "키트: 로보포트 섬 (전력 %s, 전봇대 %d/%d) -> 포탑 링 유령 %s%s" % (
                st.get("rp_power"), st.get("poles"), len(mv["poles"]), g.get("made"), extra)
        elif not st.get("rp_ghost"):
            ghosts(ai, _rows("roboport", [mv["rp"]]) + _rows("small-electric-pole", mv["poles"]))
    elif stage == "ring":
        if st.get("ring", 0) >= need_ring:
            g = {"made": 0}
            if not st.get("arty_any"):
                g = ghosts(ai, _rows("artillery-turret", [mv["to"]]))
            mv["stage"], msg = "arty", "키트: 포탑 링 %d/%d 섬 (탄 요청 %s) -> 대포 유령 %s" % (
                st.get("ring"), len(mv["ring"]), st.get("ammo"), g.get("made"))
        elif not st.get("ring_ghost") and st.get("ring", 0) < len(mv["ring"]):
            ghosts(ai, _rows("gun-turret", mv["ring"]))
    elif stage == "arty":
        if st.get("arty"):
            g, extra = {"made": 0}, ""
            if mv.get("chest"):
                g = ghosts(ai, _rows("storage-chest", [mv["chest"]]))
                u = ai.lua(UNITS % _pt(mv["to"]))
                if u.get("stock_chest", 0) < 1 and "chest" not in mv["done_old"]:
                    extra = " · 옛 상자 해체 %s" % decon(ai, kit, _old_rows(kit, "chest")).get("n")
                    mv["done_old"].append("chest")
            mv["stage"], msg = "chest", "키트: 대포 섬 -> 상자 유령 %s%s" % (g.get("made"), extra)
        elif not st.get("arty_any"):
            ghosts(ai, _rows("artillery-turret", [mv["to"]]))
        elif not mv.get("arty_decon"):
            # 링이 서는 동안 다른 자리 (벽 안 대체 자리) 에서 쏘던 대포 - 이제 걷어서 새 자리로
            m = ai.lua(MOVE_ARTY)
            mv["arty_decon"] = 1
            msg = "키트: 옛 자리 대포 (%s,%s) 해체 %s -> 새 자리 유령 대기" % (m.get("x"), m.get("y"), m.get("ok"))
    elif stage == "chest":
        if st.get("chest") != 0 or time.time() - mv["ts"] > 300:
            left = {k: decon(ai, kit, _old_rows(kit, k)).get("n") for k in ("turrets", "roboport", "poles", "chest")
                    if k not in mv["done_old"]}
            kit["members"] = {"roboport": mv["rp"], "turrets": mv["ring"], "poles": mv["poles"], "chest": mv.get("chest")}
            kit["site"], kit["move"], kit["since"] = mv["to"], None, time.strftime("%H:%M:%S")
            save(kit)
            return "키트 이전 끝 -> (%s,%s) · 링 %s · 상자 %s · 옛 키트 나머지 해체 %s · %d분" % (
                mv["to"][0], mv["to"][1], st.get("ring"), st.get("chest"), left, (time.time() - mv["t0"]) // 60)
    if msg:
        mv["ts"] = time.time()
    elif time.time() - mv["ts"] > 900 and int(time.time() - mv["ts"]) % 300 < 10:
        msg = "키트: %s 단계 %d분째 멈춤 %s" % (stage, (time.time() - mv["ts"]) // 60, json.dumps(st, ensure_ascii=False))
    save(kit)
    return msg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--designate", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--adopt-user", action="store_true")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--step", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.show:
        print(json.dumps(load(), ensure_ascii=False, indent=1))
    if a.designate:
        print(json.dumps(designate(ai, a.apply, a.adopt_user), ensure_ascii=False))
    if a.plan:
        kit = load()
        if not kit:
            d = designate(ai, False, a.adopt_user)
            kit = {"site": d.get("site"), "members": d.get("members"), "adopt_user": a.adopt_user}
            print("(키트 미지정 - 지정 드라이런으로 계획)", json.dumps(d, ensure_ascii=False))
        print(json.dumps(start_move(ai, dry=True) if not kit.get("move") else {"err": "이전 중"}, ensure_ascii=False)
              if load() else json.dumps(plan(ai, kit), ensure_ascii=False))
    if a.step:
        print(step(ai))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

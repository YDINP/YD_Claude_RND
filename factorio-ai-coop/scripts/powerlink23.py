"""무전력 레이저 포탑에 전력 잇기 - 사용자 (07:45): "외부로 레이저포탑 방어선 구성된 곳들에 전력 연결 안 된 부분들 체크해서 전력 연결".

07:46 레이저 122 중 58 이 no_power - 대포 키트가 옮겨 가며 전봇대를 걷어 간 옛 키트 자리들에 남은 레이저 (lasermix23 이 섞은 것).
  1) 무전력 레이저를 20 칸 거리로 묶는다 (무리).
  2) 무리마다 주 전력망 (R0 (56,-127) 옆 전봇대의 electric_network_id) 전봇대 중 가장 가까운 것에서 무리 쪽으로
     소형 전봇대 사슬 (6.5 칸 간격, 전선 도달 7.5) 을 유령으로 놓고,
  3) 무리 안에서는 가까운 레이저부터 - 이미 공급 범위 (소형 2.5) 안이 아니면 레이저 옆 칸에 전봇대 (앞 전봇대 7.5 안) 를 놓는다.
로봇이 짓는다 (건설 범위 밖이면 건너뛰고 기록). 망 소형 전봇대 재고를 넘지 않는다.

    python -u scripts/powerlink23.py --dry
    python -u scripts/powerlink23.py            # 유령 놓기
    python -u scripts/powerlink23.py --check    # 무전력 레이저 수
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

LUA = """(function() local s = game.surfaces[1] local DRY, CREW = %s, %s local o = {clusters = 0, poles = 0, skip = {}, done = {}, crew = {}}
  local R0 = s.find_entities_filtered{name = 'roboport', position = {56, -127}, radius = 3}[1]
  local MAIN = nil
  for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', position = R0.position, radius = 8}) do MAIN = p.electric_network_id break end
  local net = s.find_logistic_network_by_position({-60, -33}, 'player')
  local stock = net.get_item_count('small-electric-pole') - 10
  local cx0, cy0 = 0, 0
  local ghosts = {}  -- 이번에 놓은 전봇대 자리 (공급/연결 계산용)
  local function covered(pos)
    for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', position = pos, radius = 4}) do
      local r = p.prototype.get_supply_area_distance() if p.electric_network_id == MAIN and math.abs(p.position.x - pos.x) <= r + 0.9 and math.abs(p.position.y - pos.y) <= r + 0.9 then return true end end
    for _, g in pairs(ghosts) do if math.abs(g[1] - pos.x) <= 3.4 and math.abs(g[2] - pos.y) <= 3.4 then return true end end
    for _, g in pairs(s.find_entities_filtered{ghost_name = 'small-electric-pole', position = pos, radius = 4}) do if math.abs(g.position.x - pos.x) <= 3.4 and math.abs(g.position.y - pos.y) <= 3.4 then return true end end
    return false end
  local function put(x, y)
    if stock <= 0 then return nil end
    for _, off in pairs({{0, 0}, {1, 0}, {0, 1}, {-1, 0}, {0, -1}, {1, 1}, {-1, -1}, {1, -1}, {-1, 1}, {2, 0}, {0, 2}, {-2, 0}, {0, -2}}) do
      local p = {math.floor(x + off[1]) + 0.5, math.floor(y + off[2]) + 0.5}
      local cn = #s.find_logistic_networks_by_construction_area(p, 'player') > 0
      if s.can_place_entity{name = 'small-electric-pole', position = p, force = 'player'} and (cn or CREW) then
        if CREW then o.crew[#o.crew + 1] = {p[1], p[2], cx0, cy0} elseif not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'small-electric-pole', position = p, force = 'player'} end
        ghosts[#ghosts + 1] = p stock = stock - 1 o.poles = o.poles + 1 return p end
    end
    return nil end
  -- 무전력 레이저
  local L = {}
  for _, l in pairs(s.find_entities_filtered{name = 'laser-turret', force = 'player'}) do
    if l.status == defines.entity_status.no_power and not covered(l.position) then L[#L + 1] = l end end
  o.unpowered = #L
  -- 무리
  local used = {}
  for i, l in pairs(L) do if not used[i] then
    local grp = {l} used[i] = true
    local changed = true
    while changed do changed = false
      for j, m in pairs(L) do if not used[j] then for _, g in pairs(grp) do
        if (g.position.x - m.position.x)^2 + (g.position.y - m.position.y)^2 <= 400 then grp[#grp + 1] = m used[j] = true changed = true break end end end end
    end
    o.clusters = o.clusters + 1
    local cx, cy = 0, 0 for _, g in pairs(grp) do cx = cx + g.position.x cy = cy + g.position.y end cx, cy = cx / #grp, cy / #grp
    cx0, cy0 = math.floor(cx), math.floor(cy)
    -- 주 전력망에서 가장 가까운 전봇대
    local best, bd = nil, 1e18
    local cand = s.find_entities_filtered{type = 'electric-pole', force = 'player', position = {cx, cy}, radius = 150}
    if CREW then for _, g in pairs(s.find_entities_filtered{ghost_name = 'small-electric-pole', force = 'player', position = {cx, cy}, radius = 150}) do cand[#cand + 1] = g end end
    for _, p in pairs(cand) do
      if (CREW and p.type == 'entity-ghost') or p.electric_network_id == MAIN then local d = (p.position.x - cx)^2 + (p.position.y - cy)^2 if d < bd then best, bd = p, d end end end
    if not best then o.skip[#o.skip + 1] = math.floor(cx) .. ',' .. math.floor(cy) .. ' 주 전력망 전봇대 없음'
    else
      local x, y = best.position.x, best.position.y local n = 0 local ok = true
      -- 무리 안 가장 가까운 레이저 쪽으로 사슬
      local function nearest_unc(px, py) local b, d = nil, 1e18 for _, g in pairs(grp) do if not covered(g.position) then local dd = (g.position.x - px)^2 + (g.position.y - py)^2 if dd < d then b, d = g, dd end end end return b, d end
      local tgt, td = nearest_unc(x, y)
      while tgt and n < 80 do
        local dx, dy = tgt.position.x - x, tgt.position.y - y local L2 = math.sqrt(dx * dx + dy * dy)
        local step = math.min(5, L2)  -- put() 가 자리를 2 칸까지 비켜 놓으므로 전선 7.5 에 여유 (6.5 였을 때 -243,-90 사슬 7.8 끊김)
        local p = put(x + dx / math.max(L2, 0.01) * step, y + dy / math.max(L2, 0.01) * step)
        if not p then ok = false break end
        x, y = p[1], p[2] n = n + 1
        tgt, td = nearest_unc(x, y)
      end
      o.done[#o.done + 1] = math.floor(cx) .. ',' .. math.floor(cy) .. ' 레이저 ' .. #grp .. ' 전봇대 ' .. n .. (ok and '' or ' (중단: 재고/자리/범위)')
    end
  end end
  o.stock_left = stock
  return o end)()"""

CHECK = """(function() local s = game.surfaces[1] local n, t = 0, 0
  for _, l in pairs(s.find_entities_filtered{name = 'laser-turret', force = 'player'}) do t = t + 1 if l.status == defines.entity_status.no_power then n = n + 1 end end
  return {no_power = n, total = t, pole_ghosts = s.count_entities_filtered{ghost_name = 'small-electric-pole'}} end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--crew", action="store_true", help="로봇 범위 밖 사슬 나머지를 캐릭터가 짓는다 (--dry 면 목록만)")
    a = ap.parse_args()
    ai = AIBridge()
    if a.check:
        print(ai.lua(CHECK))
        return 0
    if a.crew:
        return crew_run(ai, a.dry)
    print(ai.lua(LUA % ("true" if a.dry else "false", "false")))
    return 0


def crew_run(ai, dry):
    """로봇 범위 밖 (cn 0) 무리: 사슬 전봇대 자리를 계산만 하고 (유령 없음) 무리마다 캐릭터 하나가 짓는다."""
    import time
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import detached
    import outpostcrew23 as crew
    r = ai.lua(LUA % ("true", "true"))
    rows = r.get("crew") or []
    rows = list(rows.values()) if isinstance(rows, dict) else rows
    groups = {}
    for x, y, cx, cy in (list(v.values()) if isinstance(v, dict) else v for v in rows):
        groups.setdefault((cx, cy), []).append(("small-electric-pole", x, y, "north"))
    print({"done": r.get("done"), "groups": {"%s,%s" % k: len(v) for k, v in groups.items()}})
    if dry or not groups:
        return 0
    free = crew.free_crew(ai, len(groups))
    sent = []
    for who, (c, builds) in zip(free, groups.items()):
        entry = (builds[0][1], builds[0][2])
        if crew.dispatch(ai, who, builds, [], entry, "powerlink23", print):
            sent.append(who)
    t0 = time.time()
    while sent and time.time() - t0 < 1200:
        time.sleep(20)
        if not crew.busy(ai, sent):
            break
    for who in sent:
        print(who, "돌아옴", crew.unload_bag(ai, who))
    detached.release(sent)
    print(ai.lua(CHECK))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""대포 수동 조준 - 사용자 (00:27): "대포는 수동으로 조준해서 진행하고, 주변 적기지를 차례대로 제거할 것".

사용자가 포대 자동 조준을 껐다 (artillery_auto_targeting = false). 이 루프가 조준수를 맡는다:
  * 포대 사거리 (224) 안의 적 구조물 (산란기·땅벌레) 을 둥지 무리 (반경 20) 로 묶고, 포대에서 가까운 무리부터 차례로 친다.
  * 한 무리 안에서는 산란기 먼저 (공습 원천), 그다음 땅벌레.
  * 포대에 탄이 있고 떠 있는 조명탄이 없을 때만 조명탄 (artillery-flare) 을 목표 위에 하나 띄운다 - 한 발씩.
  * 무리가 비면 다음 무리. 사거리 안이 다 비면 한 줄 남기고 대기 (포대를 옮기면 새 사거리에서 다시 시작).
  * 09-28 10:01 서쪽 대포가 둥지 반격 (적 17) 에 파괴된 뒤:
    - 대포 60 칸 안 적 유닛 3 이상이면 사격 중지 (반격을 더 부르지 않는다) + 즉시 GUARD (둘레 포탑 탄) + "대포 반격 경보" 로그.
    - 서 있던 대포가 해체 표시 없이 사라지면 "대포 파괴" 로그 · GUARD · 그 자리 대포 유령 제거 (죽은 링으로 새 대포가 가지 않게) ·
      kit["lost"] 기록 (artykit23 가 2 시간 동안 그 둘레 80 칸을 새 자리에서 뺀다).
    - 대포가 게임에도 창고에도 없으면 키트 이전을 시작하지 않는다 (artykit23.start_move 가 보류).

    python -u scripts/artyaim23.py              # 상주 (5초마다)
    python -u scripts/artyaim23.py --once       # 다음 목표만 보기
"""
import argparse
import json
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(os.path.abspath(__file__))]
from client import AIBridge  # noqa: E402
import artykit23  # noqa: E402  이동 포대 키트 (사용자 00:44 "대포를 설치한 부분으로 방어선 및 로보포트를 옮겨야 함")

AIM = """(function() local s = game.surfaces[1] local o = {}
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  if not t then return {err = 'no turret'} end
  if t.to_be_deconstructed() then return {err = 'moving'} end  -- 이전 중 (해체 표시) 은 조준 중지
  o.tx, o.ty = t.position.x, t.position.y
  o.ammo = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
  o.auto = t.artillery_auto_targeting and 1 or 0
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = t.position, radius = 60}
  o.hp = math.floor(t.health)
  local nn = s.find_logistic_network_by_position(t.position, 'player')
  o.net_shell = nn and nn.get_item_count('artillery-shell') or 0
  local R = 224
  local es = s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = t.position, radius = R}
  o.left = #es
  if #es == 0 then return o end
  -- 가장 가까운 구조물이 속한 무리 (반경 20) 를 고른다
  local best, bd = nil, 1e9
  for _, e in pairs(es) do local d = (e.position.x - t.position.x)^2 + (e.position.y - t.position.y)^2 if d < bd then best, bd = e, d end end
  local grp = s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = best.position, radius = 20}
  local tgt = nil
  for _, e in pairs(grp) do if e.type == 'unit-spawner' then tgt = e break end end
  tgt = tgt or best
  o.gx, o.gy, o.gn = math.floor(best.position.x), math.floor(best.position.y), #grp
  o.target = tgt.name .. '@' .. math.floor(tgt.position.x) .. ',' .. math.floor(tgt.position.y)
  o.dist = math.floor(math.sqrt(bd))
  local flares = s.count_entities_filtered{name = 'artillery-flare', position = t.position, radius = R + 10}
  o.flares = flares
  if %s and o.ammo > 0 and flares == 0 and o.units < 3 then  -- 반격 중에는 쏘지 않는다
    local ok = pcall(function() s.create_entity{name = 'artillery-flare', position = tgt.position, force = 'player',
      movement = {0, 0}, height = 0, vertical_speed = 0, frame_speed = 1} end)
    o.fired = ok and 1 or 0
  end
  return o end)()"""


SPOT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state", "arty_spot.json")

# 사거리 안이 비면 (사용자 00:33 "조준 범위에 적 기지가 없다면 대포 자체를 이동") - 로봇망 안에서 사거리 224 안
# 적 구조물이 가장 많이 들어오는 자리를 찾는다 (포탄은 로봇이 망으로 대므로 망 안이어야 함). 같으면 기지 중심에 가까운 쪽.
FIND = """(function() local s = game.surfaces[1] local R = 224
  local best, bn, bd = nil, 0, 1e9
  for x = -240, 160, 6 do for y = -260, 160, 6 do
    local p = {x + 0.5, y + 0.5}
    local net = s.find_logistic_network_by_position(p, 'player')
    -- 벽 줄에 서도 되지만 지켜지는 자리만: 30 칸 안 포탑 8 대 이상 (00:32 남쪽 포대에 27 마리 반격 - 포탑 줄이 막음)
    local inner = net and net.network_id == 2
    if inner and s.count_entities_filtered{name = 'gun-turret', force = 'player', position = p, radius = 30} < 8 then inner = false end
    if inner and s.can_place_entity{name = 'artillery-turret', position = p, force = 'player'} then
      local n = s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = p, radius = R - 4}
      local d = (p[1] + 40)^2 + (p[2] + 20)^2
      if n > bn or (n == bn and n > 0 and d < bd) then best, bn, bd = p, n, d end
    end end end
  if not best then return {n = 0} end
  return {x = best[1], y = best[2], n = bn} end)()"""

MOVE = """(function() local s = game.surfaces[1]
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  if not t then return {err = 'no turret'} end
  return {ok = t.order_deconstruction('player') and 1 or 0, x = t.position.x, y = t.position.y} end)()"""


# 대포 둘레 40 칸 포탑 탄을 30 까지 (로봇 proxy, 30 칸 미만만, 종류는 슬롯 그대로) - 사용자 00:33 "대포 쪽 방어 보완"
GUARD = """(function() local s = game.surfaces[1] local o = {n = 0}
  local centers = {%s}  -- 키트 이전 중이면 새 자리도 · 고정 대포 자리 (artyfix23) (01:25 SE 링이 탄 0 으로 공습을 받음 - 대포가 서기 전부터 채운다)
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  if t then centers[#centers + 1] = t.position end
  local net = s.find_logistic_network_by_position({-60, -33}, 'player') if not net then return o end
  local have = {['firearm-magazine'] = net.get_item_count('firearm-magazine'), ['piercing-rounds-magazine'] = net.get_item_count('piercing-rounds-magazine')}
  -- 04:13 동쪽 자리에서 포탄 proxy 가 안 채워져 탄 0 (망 131) - 5 이하면 망 저장에서 10 까지 바로 옮긴다
  -- 14:25 망 포탄 5 (< 10) 라 한 발도 안 옮겨 대포 탄 0 으로 2 시간 침묵 - 있는 만큼 (1 이상) 옮긴다
  local ns = net.get_item_count('artillery-shell')
  if t and not t.to_be_deconstructed() and t.get_item_count('artillery-shell') <= 5 and ns >= 1 then
    local got = net.remove_item{name = 'artillery-shell', count = math.min(10, ns)} if got > 0 then t.insert{name = 'artillery-shell', count = got} o.shell = got end end
  local seen = {}
  for _, C in pairs(centers) do for _, g in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player', position = C, radius = 40}) do
   if not seen[g.unit_number] then seen[g.unit_number] = true
    local inv = g.get_inventory(defines.inventory.turret_ammo) local c = inv.get_item_count()
    if c < 30 and s.count_entities_filtered{name = 'item-request-proxy', position = g.position, radius = 0.5} == 0 then
      local nm = inv.is_empty() and 'firearm-magazine' or inv[1].name
      if (have[nm] or 0) < 40 then nm = (have['firearm-magazine'] or 0) >= (have['piercing-rounds-magazine'] or 0) and 'firearm-magazine' or 'piercing-rounds-magazine' end
      if (have[nm] or 0) >= 40 then
        if pcall(function() s.create_entity{name = 'item-request-proxy', position = g.position, force = 'player', target = g,
            modules = {{id = {name = nm}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = 30 - c}}}}}} end) then
          o.n = o.n + 1 have[nm] = have[nm] - (30 - c) end
      end
    end
   end
  end end
  return o end)()"""


# 대포가 해체 표시 없이 사라짐 -> 파괴. 그 자리 대포 유령 (파괴 유령) 을 지운다 - 링이 무너진 자리로 새 대포가 가지 않게.
LOST = """(function() local s = game.surfaces[1] local P = %s local o = {ghost = 0, remnants = 0}
  o.remnants = s.count_entities_filtered{name = 'artillery-turret-remnants', position = P, radius = 2}
  -- 10:28 키트 이전으로 로봇이 캐 간 대포를 파괴로 오인 (잔해 0, 창고 1) - 잔해가 없고 망/로봇에 대포 아이템이 있으면 이전
  local item = 0 for _, n in pairs(game.forces.player.logistic_networks[s.name]) do item = item + n.get_item_count('artillery-turret')
    for _, r in pairs(n.construction_robots) do item = item + r.get_inventory(defines.inventory.robot_cargo).get_item_count('artillery-turret') end end
  o.item = item
  if o.remnants == 0 and item > 0 then o.moved = true return o end
  for _, g in pairs(s.find_entities_filtered{ghost_name = 'artillery-turret', position = P, radius = 2, force = 'player'}) do g.destroy() o.ghost = o.ghost + 1 end
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = P, radius = 60}
  o.guns = s.count_entities_filtered{name = 'gun-turret', force = 'player', position = P, radius = 16}
  o.gun_ghosts = s.count_entities_filtered{ghost_name = 'gun-turret', force = 'player', position = P, radius = 16}
  return o end)()"""


def guard_extra():
    kit = artykit23.load() or {}
    mv = kit.get("move") or {}
    pts = ([tuple(mv["to"])] if mv.get("to") else []) + [tuple(q) for q in artykit23.fixed()]
    return ", ".join("{x = %s, y = %s}" % p for p in pts)


def guard_now(ai):
    return artykit23._lua(ai, GUARD % guard_extra())


def on_lost(ai, pos) -> str:
    r = artykit23._lua(ai, LOST % ("{%s, %s}" % (pos[0], pos[1])))
    if r.get("moved"):
        return "대포 해체됨 @(%s,%s) - 잔해 0 · 창고/로봇 %s (이전, 파괴 아님)" % (pos[0], pos[1], r.get("item"))
    g = {}
    try:
        g = guard_now(ai)
    except Exception as e:  # noqa: BLE001
        g = {"err": str(e)[:80]}
    kit = artykit23.load()
    if kit is not None:
        kit["lost"] = {"at": list(pos), "t": time.time(), "when": time.strftime("%H:%M:%S")}
        artykit23.save(kit)
    return "대포 파괴 @(%s,%s) - 잔해 %s · 둘레 적 유닛 %s · 남은 기관총 %s (파괴 유령 %s) · 대포 유령 제거 %s · GUARD 탄 %s" % (
        pos[0], pos[1], r.get("remnants"), r.get("units"), r.get("guns"), r.get("gun_ghosts"), r.get("ghost"), g.get("n"))


def relocate(ai) -> str:
    # 키트 (state/arty_kit.json) 가 있으면 대포 + 포탑 링 + 로보포트 + 전봇대 + 상자를 함께 옮긴다 (망 밖도 이어 붙여서).
    # 키트로 못 옮기면 (링 < 4, 자리 없음) 아래 옛 방식: 로봇망 안 포탑 8 대 이상 지키는 자리로 대포만.
    try:
        kit = artykit23.load()
        if kit and kit.get("move"):  # 키트 이전 중 - 옛 방식으로 대포만 따로 옮기지 않는다 (01:02 겹침)
            return "키트 이전 중 (%s) - 대기" % kit["move"].get("stage")
        k = artykit23.start_move(ai)
        if k:
            return k
    except Exception as e:  # noqa: BLE001
        print(f"artykit start: {type(e).__name__}: {e}"[:200], flush=True)
    if artykit23.load_goal()[0]:  # 목표 방향 (arty_goal.json) 이 있으면 옛 방식 (망 안 아무 데나) 으로 새지 않고 1 분마다 다시
        return "키트 이전 보류: 목표 방향 통로에 자리 없음 (copperchain23 고정 로보포트 대기)"
    r = artykit23._lua(ai, FIND)
    if not r.get("n"):
        return "옮길 자리 없음 (로봇망 안에서 사거리에 적 구조물이 들어오는 곳이 없음)"
    with open(SPOT_FILE, "w", encoding="utf-8") as f:
        json.dump([r["x"], r["y"]], f)
    m = artykit23._lua(ai, MOVE)
    return "대포 이전 (%s,%s) -> (%s,%s) · 새 사거리 안 적 구조물 %s · 해체 %s" % (m.get("x"), m.get("y"), r["x"], r["y"], r["n"], m)


HEARTBEAT = 600  # 10 분 무출력이면 한 줄 (12:10 · 13:57 두 번 - 탄 0 으로 조용히 돌던 것을 멈춤으로 오인)

# 사용자 (17:2x): "대포 설치하면 맵에 태그 찍어줘. 옮기면 태그도 같이 옮기고" - 서 있는 대포마다 지도 태그 '대포',
# 대포가 없는 자리의 '대포' 태그는 지운다 (이전 = 옛 태그 삭제 + 새 자리 태그). force.chart 는 쓰지 않는다 (태그만).
TAG_TEXT, TAG_FIXED = "대포", "대포 고정"
# 09-28 22:4x 고정 대포 (artyfix23, state/arty_fixed.json) 는 '대포 고정' 태그. 두 글자 태그 모두 자리 · 종류가 맞지 않으면 지운다.
TAG = """(function() local s = game.surfaces[1] local f = game.forces.player local o = {add = {}, del = 0}
  local FIX = {%s}
  local have = {}
  for _, a in pairs(s.find_entities_filtered{name = 'artillery-turret', force = 'player'}) do
    local fixed = false for _, q in pairs(FIX) do if math.abs(a.position.x - q[1]) < 1 and math.abs(a.position.y - q[2]) < 1 then fixed = true end end
    if fixed or not a.to_be_deconstructed() then have[#have + 1] = {x = a.position.x, y = a.position.y, text = fixed and '%s' or '%s'} end end
  for _, t in pairs(f.find_chart_tags(s)) do
    if t.text == '%s' or t.text == '%s' then
      local keep = false
      for _, p in pairs(have) do if not p.tagged and p.text == t.text and math.abs(t.position.x - p.x) < 1 and math.abs(t.position.y - p.y) < 1 then keep = true p.tagged = true end end
      if not keep then t.destroy() o.del = o.del + 1 end
    end
  end
  for _, p in pairs(have) do if not p.tagged then
    local t = f.add_chart_tag(s, {position = {p.x, p.y}, text = p.text, icon = {type = 'item', name = 'artillery-turret'}})
    if t then o.add[#o.add + 1] = p.text .. '@' .. p.x .. ',' .. p.y end end end
  return o end)()"""


def tag_lua():
    F = ", ".join("{%s, %s}" % (q[0], q[1]) for q in artykit23.fixed())
    return TAG % (F, TAG_FIXED, TAG_TEXT, TAG_TEXT, TAG_FIXED)


# 고정 대포 포탄 (1 분마다): 탄 <= 10 이고 배달 중 아니면 15 까지. 망 포탄 FIX_FLOOR 발은 이동 대포 (GUARD 직송) 몫으로 남긴다.
# 고정 대포 자리가 물류 범위 밖이면 (로보포트 전) Lua 로 망 저장에서 바로 옮긴다 (기존 아이템만).
FIX_FLOOR = 20
FIXFEED = """(function() local s = game.surfaces[1] local o = {fed = {}, lost = {}, ghost = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player') if not net then return o end
  local ns = net.get_item_count('artillery-shell') o.net = ns
  for _, P in pairs({%s}) do
    local t = s.find_entities_filtered{name = 'artillery-turret', position = P, radius = 1, force = 'player'}[1]
    if not t then
      if s.count_entities_filtered{ghost_name = 'artillery-turret', position = P, radius = 1} > 0 then o.ghost = o.ghost + 1
      else o.lost[#o.lost + 1] = P[1] .. ',' .. P[2] end
    else
      local inv = t.get_inventory(defines.inventory.artillery_turret_ammo) local have = inv.get_item_count('artillery-shell')
      o.ammo = (o.ammo or 0) + have
      local k = math.min(15 - have, ns - %d)
      if have <= 10 and k > 0 then
        local ln = s.find_logistic_network_by_position(t.position, 'player')
        if ln and ln.network_id == net.network_id then
          if s.count_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.6} == 0 then
            s.create_entity{name = 'item-request-proxy', position = t.position, force = 'player', target = t,
              modules = {{id = {name = 'artillery-shell'}, items = {in_inventory = {{inventory = defines.inventory.artillery_turret_ammo, stack = 0, count = k}}}}}}
            o.fed[#o.fed + 1] = 'proxy ' .. k ns = ns - k end
        else
          local got = net.remove_item{name = 'artillery-shell', count = k}
          if got > 0 then local p = t.insert{name = 'artillery-shell', count = got} if p < got then net.insert{name = 'artillery-shell', count = got - p} end
            o.fed[#o.fed + 1] = 'lua ' .. p ns = ns - p end
        end
      end
    end
  end
  return o end)()"""


def fix_feed(ai):
    fs = artykit23.fixed()
    if not fs:
        return None
    return artykit23._lua(ai, FIXFEED % (", ".join("{%s, %s}" % (q[0], q[1]) for q in fs), FIX_FLOOR))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=5)
    a = ap.parse_args()
    ai = AIBridge()
    last_group, last_left, idle = None, None, False
    last_pos = None      # 마지막으로 서 있던 (해체 표시 없는) 대포 자리 - 사라지면 파괴
    alarm = False        # 반격 경보 중
    last_msg = None
    reloc_retry = 0.0   # 키트 이전이 적 유닛 때문에 보류되면 1 분 뒤 다시
    k = 0
    last_out = [time.time()]
    no_ammo = False      # 탄 0 대기 중 (한 번만 알림)
    fix_state = [None]   # 고정 대포 상태 (바뀔 때만 알림)
    import builtins
    _print = builtins.print

    def print(*args, **kw):  # noqa: A001  마지막 출력 시각을 적어 heartbeat 판단
        last_out[0] = time.time()
        _print(*args, **kw)

    r = {}
    while True:
        k += 1
        if not a.once and time.time() - last_out[0] >= HEARTBEAT:
            print(time.strftime("%H:%M:%S"), "heartbeat: 살아 있음 · 무리 %s · 사거리 안 %s · 탄 %s (망 %s) · 적 유닛 %s · err %s" % (
                last_group, (r or {}).get("left"), (r or {}).get("ammo"), (r or {}).get("net_shell"), (r or {}).get("units"), (r or {}).get("err")), flush=True)
        if k % 2 == 0 and not a.once:  # 10 초마다 키트 이전 한 단계
            try:
                m = artykit23.step(ai)
                if m:
                    print(time.strftime("%H:%M:%S"), m, flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"artykit step: {type(e).__name__}: {e}"[:200], flush=True)
        if k % 6 == 1 and not a.once:  # 30 초마다 대포 지도 태그 맞추기
            try:
                t = artykit23._lua(ai, tag_lua())
                adds = t.get("add") or []
                adds = list(adds.values()) if isinstance(adds, dict) else adds
                if adds or t.get("del"):
                    print(time.strftime("%H:%M:%S"), "지도 태그 '대포'/'대포 고정' - 새로", adds, "· 지움", t.get("del"), flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"artyaim tag: {e}"[:200], flush=True)
        if k % 12 == 0 and not a.once:  # 1 분마다 대포 둘레 포탑 탄
            try:
                g = artykit23._lua(ai, GUARD % guard_extra())
                if g.get("n") or g.get("shell"):
                    print(time.strftime("%H:%M:%S"), "대포 둘레 포탑 탄 보충", g.get("n"), "· 포탄 직송", g.get("shell", 0), flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"artyaim guard: {e}"[:200], flush=True)
            try:
                ff = fix_feed(ai)
                if ff:
                    fed = artykit23._lst(ff.get("fed"))
                    lost = artykit23._lst(ff.get("lost"))
                    key = (tuple(lost), ff.get("ghost"))
                    if fed:
                        print(time.strftime("%H:%M:%S"), "고정 대포 포탄", fed, "· 고정 탄 합", ff.get("ammo"), "· 망", ff.get("net"), flush=True)
                    if key != fix_state[0]:
                        if lost:
                            print(time.strftime("%H:%M:%S"), "고정 대포 없음 (파괴?)", lost, "- 유령", ff.get("ghost"), flush=True)
                        fix_state[0] = key
            except Exception as e:  # noqa: BLE001
                print(f"artyaim fixfeed: {e}"[:200], flush=True)
        try:
            r = artykit23._lua(ai, AIM % ("false" if a.once else "true"))
            now = time.strftime("%H:%M:%S")
            if a.once:
                print(now, r)
                return 0
            if r.get("err") == "no turret" and last_pos:
                print(now, on_lost(ai, last_pos), flush=True)
                last_pos, last_group, last_left = None, None, None
            if r.get("err") == "moving":
                last_pos = None  # 해체 표시 (이전) - 사라져도 파괴 아님
            if r.get("tx") is not None:
                last_pos = (r["tx"], r["ty"])
                u = r.get("units") or 0
                if u >= 3 and not alarm:
                    g = guard_now(ai)
                    print(f"{now} 대포 반격 경보: 60 칸 안 적 {u} (대포 hp {r.get('hp')}) - 사격 중지 · GUARD 탄 {g.get('n')} · 포탄 {g.get('shell', 0)}", flush=True)
                    alarm = True
                elif u < 3 and alarm:
                    print(f"{now} 반격 끝 (적 {u}, 대포 hp {r.get('hp')}) - 사격 재개", flush=True)
                    alarm = False
            if r.get("err") == "no turret" and not (artykit23.load() or {}).get("move"):
                # 대포가 창고에 있고 이전 중도 아님 (01:28 서쪽 이전 취소 뒤) - 목표 방향 자리가 생기면 거기로
                if not idle or (reloc_retry and time.time() >= reloc_retry):
                    msg = relocate(ai)
                    if msg != last_msg:  # 대포 없음 보류는 1 분마다 다시 보지만 같은 줄은 한 번만
                        print(f"{now} 대포 창고 대기 - {msg}", flush=True)
                        last_msg = msg
                    reloc_retry = time.time() + 60 if msg.startswith(("키트 이전 보류", "키트 이전 중")) else (time.time() + 300 if msg.startswith("옮길 자리 없음") else 0.0)
                idle = True
            elif r.get("err"):
                if not idle:  # 이전 중 (포대가 창고로 가는 동안) 은 한 번만
                    print(now, "조준:", r["err"], flush=True)
                idle = True
            elif r.get("left", 0) == 0:
                if not idle or (reloc_retry and time.time() >= reloc_retry):
                    print(f"{now} 조준: 사거리 안 적 구조물 0 (포대 {r['tx']},{r['ty']}) - 대포 이전", flush=True)
                    msg = relocate(ai)
                    print(f"{now} {msg}", flush=True)
                    reloc_retry = time.time() + 60 if msg.startswith(("키트 이전 보류", "키트 이전 중")) else (time.time() + 300 if msg.startswith("옮길 자리 없음") else 0.0)
                idle = True
            else:
                idle = False
                g = (r.get("gx"), r.get("gy"))
                if g != last_group:
                    print(f"{now} 조준: 다음 무리 ({g[0]},{g[1]}) 구조물 {r['gn']} · 거리 {r['dist']} · 사거리 안 남은 {r['left']}", flush=True)
                    last_group = g
                if not r.get("ammo") and not no_ammo:
                    print(f"{now} 조준 대기: 대포 포탄 0 (망 {r.get('net_shell')}) - 1 분마다 GUARD 가 망에서 직송", flush=True)
                    no_ammo = True
                elif r.get("ammo") and no_ammo:
                    print(f"{now} 포탄 {r['ammo']} - 사격 재개", flush=True)
                    no_ammo = False
                if r.get("fired"):
                    print(f"{now} 발사 -> {r['target']} (탄 {r['ammo']})", flush=True)
                if last_left is not None and r["left"] < last_left:
                    print(f"{now} 파괴 {last_left - r['left']} · 남은 {r['left']}", flush=True)
                last_left = r["left"]
        except Exception as e:  # noqa: BLE001
            print(f"artyaim: {type(e).__name__}: {e}"[:200], flush=True)
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

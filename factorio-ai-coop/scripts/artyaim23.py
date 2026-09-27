"""대포 수동 조준 - 사용자 (00:27): "대포는 수동으로 조준해서 진행하고, 주변 적기지를 차례대로 제거할 것".

사용자가 포대 자동 조준을 껐다 (artillery_auto_targeting = false). 이 루프가 조준수를 맡는다:
  * 포대 사거리 (224) 안의 적 구조물 (산란기·땅벌레) 을 둥지 무리 (반경 20) 로 묶고, 포대에서 가까운 무리부터 차례로 친다.
  * 한 무리 안에서는 산란기 먼저 (공습 원천), 그다음 땅벌레.
  * 포대에 탄이 있고 떠 있는 조명탄이 없을 때만 조명탄 (artillery-flare) 을 목표 위에 하나 띄운다 - 한 발씩.
  * 무리가 비면 다음 무리. 사거리 안이 다 비면 한 줄 남기고 대기 (포대를 옮기면 새 사거리에서 다시 시작).

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
  if %s and o.ammo > 0 and flares == 0 then
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
  local centers = {%s}  -- 키트 이전 중이면 새 자리도 (01:25 SE 링이 탄 0 으로 공습을 받음 - 대포가 서기 전부터 채운다)
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  if t then centers[#centers + 1] = t.position end
  local net = s.find_logistic_network_by_position({-60, -33}, 'player') if not net then return o end
  local have = {['firearm-magazine'] = net.get_item_count('firearm-magazine'), ['piercing-rounds-magazine'] = net.get_item_count('piercing-rounds-magazine')}
  -- 04:13 동쪽 자리에서 포탄 proxy 가 안 채워져 탄 0 (망 131) - 5 이하면 망 저장에서 10 을 바로 옮긴다
  if t and not t.to_be_deconstructed() and t.get_item_count('artillery-shell') <= 5 and net.get_item_count('artillery-shell') >= 10 then
    local got = net.remove_item{name = 'artillery-shell', count = 10} if got > 0 then t.insert{name = 'artillery-shell', count = got} o.shell = got end end
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
    r = ai.lua(FIND)
    if not r.get("n"):
        return "옮길 자리 없음 (로봇망 안에서 사거리에 적 구조물이 들어오는 곳이 없음)"
    with open(SPOT_FILE, "w", encoding="utf-8") as f:
        json.dump([r["x"], r["y"]], f)
    m = ai.lua(MOVE)
    return "대포 이전 (%s,%s) -> (%s,%s) · 새 사거리 안 적 구조물 %s · 해체 %s" % (m.get("x"), m.get("y"), r["x"], r["y"], r["n"], m)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=5)
    a = ap.parse_args()
    ai = AIBridge()
    last_group, last_left, idle = None, None, False
    reloc_retry = 0.0   # 키트 이전이 적 유닛 때문에 보류되면 1 분 뒤 다시
    k = 0
    while True:
        k += 1
        if k % 2 == 0 and not a.once:  # 10 초마다 키트 이전 한 단계
            try:
                m = artykit23.step(ai)
                if m:
                    print(time.strftime("%H:%M:%S"), m, flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"artykit step: {type(e).__name__}: {e}"[:200], flush=True)
        if k % 12 == 0 and not a.once:  # 1 분마다 대포 둘레 포탑 탄
            try:
                kit = artykit23.load() or {}
                mv = kit.get("move") or {}
                extra = "{x = %s, y = %s}" % tuple(mv["to"]) if mv.get("to") else ""
                g = ai.lua(GUARD % extra)
                if g.get("n") or g.get("shell"):
                    print(time.strftime("%H:%M:%S"), "대포 둘레 포탑 탄 보충", g.get("n"), "· 포탄 직송", g.get("shell", 0), flush=True)
            except Exception as e:  # noqa: BLE001
                print(f"artyaim guard: {e}"[:200], flush=True)
        try:
            r = ai.lua(AIM % ("false" if a.once else "true"))
            now = time.strftime("%H:%M:%S")
            if a.once:
                print(now, r)
                return 0
            if r.get("err") == "no turret" and not (artykit23.load() or {}).get("move"):
                # 대포가 창고에 있고 이전 중도 아님 (01:28 서쪽 이전 취소 뒤) - 목표 방향 자리가 생기면 거기로
                if not idle or (reloc_retry and time.time() >= reloc_retry):
                    msg = relocate(ai)
                    print(f"{now} 대포 창고 대기 - {msg}", flush=True)
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

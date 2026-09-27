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
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

AIM = """(function() local s = game.surfaces[1] local o = {}
  local t = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}[1]
  if not t then return {err = 'no turret'} end
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=5)
    a = ap.parse_args()
    ai = AIBridge()
    last_group, last_left, idle = None, None, False
    while True:
        try:
            r = ai.lua(AIM % ("false" if a.once else "true"))
            now = time.strftime("%H:%M:%S")
            if a.once:
                print(now, r)
                return 0
            if r.get("err"):
                print(now, "조준:", r["err"], flush=True)
            elif r.get("left", 0) == 0:
                if not idle:
                    print(f"{now} 조준: 사거리 안 적 구조물 0 - 대기 (포대 {r['tx']},{r['ty']})", flush=True)
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

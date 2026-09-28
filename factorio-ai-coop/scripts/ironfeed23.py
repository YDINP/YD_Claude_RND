"""엔진 구역 철판 공급 (12:35).

기지 화로 정리 (현지 제련 전환) 뒤 엔진 구역 (x -30..36, y -40..0) 의 톱니 · 파이프 조립기 철판 0 ->
엔진 0 -> 전기엔진 0 -> 프레임 0 -> 노란팩 10 분 0. 옛 화로 벨트가 먹이던 곳이다. 망 철판은 ~1.1 만 (전초 현지 제련).
Lua 중계 (기존 아이템만 옮김): 구역 안에서 레시피에 철판이 들어가는 조립기마다 입력 철판을 FILL 까지 망에서 채운다.
망에 KEEP 은 남긴다. Guiltyring 이 last_user 인 조립기는 건드리지 않는다.

    python -u scripts/ironfeed23.py [--once]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

AREA = ((-32, -40), (36, 0))
FILL, KEEP = 20, 2000

LUA = """(function() local s = game.surfaces[1] local o = {n = 0, iron = 0}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  for _, a in pairs(s.find_entities_filtered{type = 'assembling-machine', force = 'player', area = {{%d, %d}, {%d, %d}}}) do
    local r = a.get_recipe()
    if r and not (a.last_user and a.last_user.name == 'Guiltyring') then
      for _, ing in pairs(r.ingredients) do if ing.name == 'iron-plate' then
        local inv = a.get_inventory(defines.inventory.assembling_machine_input)
        local k = math.min(%d - inv.get_item_count('iron-plate'), net.get_item_count('iron-plate') - %d)
        if k > 0 then k = net.remove_item{name = 'iron-plate', count = k} local put = inv.insert{name = 'iron-plate', count = k}
          if put < k then net.insert{name = 'iron-plate', count = k - put} end
          if put > 0 then o.n = o.n + 1 o.iron = o.iron + put end end
      end end
    end
  end
  o.net = net.get_item_count('iron-plate')
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=20)
    a = ap.parse_args()
    ai = AIBridge()
    lua = LUA % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], FILL, KEEP)
    while True:
        try:
            r = ai.lua(lua)
            if r.get("iron") or a.once:
                print(time.strftime("%H:%M:%S"), "엔진 구역 철판", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"ironfeed: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

"""망 밖 상자 -> 망 2 저장 중계 (23:5x).

로켓 첫 발사 (사일로 요청 상자는 망에서만 받는다): 옛 LDS 조립기 출력 철상자 (7.5,-48.5)(10.5,-46.5) 에 LDS 638 이
갇혀 있었다 (노랑 조립기로 가던 battfeed 중계가 노랑 정지로 끊김). 망 밖 상자의 품목을 망 저장으로 옮긴다 (기존 아이템만, 망 상한).

    python -u scripts/chest2net23.py [--once]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

# (상자 위치, 품목, 망 상한)
ROUTES = [((7.5, -48.5), "low-density-structure", 2000), ((10.5, -46.5), "low-density-structure", 2000)]

LUA = """(function() local s = game.surfaces[1] local o = {}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  for _, r in pairs({%s}) do
    local c = s.find_entities_filtered{type = {'container', 'logistic-container'}, position = r[1], radius = 0.6}[1]
    if c then local inv = c.get_inventory(defines.inventory.chest)
      local k = math.min(inv.get_item_count(r[2]), r[3] - net.get_item_count(r[2]))
      if k > 0 then local put = net.insert({name = r[2], count = k}, 'storage')
        if put > 0 then inv.remove{name = r[2], count = put} o[r[2]] = (o[r[2]] or 0) + put end end
    end
  end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    lua = LUA % ", ".join("{{%s, %s}, '%s', %d}" % (p[0], p[1], it, cap) for p, it, cap in ROUTES)
    while True:
        try:
            r = ai.lua(lua)
            if r or a.once:
                print(time.strftime("%H:%M:%S"), "망 밖 상자 -> 망", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"chest2net: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

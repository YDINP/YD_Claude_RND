"""발전소 보일러 석탄 안전망 (17:30).

17:26 보일러 20 중 17 석탄 0 (포탄 증산 에이전트 보고) - 부하가 늘어 (포탄 공장 · 펌프잭 등) 1 분 석탄 채굴 239 < 소비 412,
발전소 석탄 줄 버퍼가 바닥나면 정전. 망 석탄 (~2,000) 은 석탄 광맥 (-83,-278) 남는 몫이 smeltcol23 으로 들어온 것.
Lua 중계 (기존 아이템만): 보일러 연료칸 석탄이 LOW 밑이면 망 석탄을 FILL 까지 (망에 KEEP 남김).
근본 해결은 docs/outpost-mining-plan-run23.md 의 외부 석탄 → 발전소 벨트.

    python -u scripts/boilerguard23.py [--once]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

LOW, FILL, KEEP = 5, 20, 200

LUA = """(function() local s = game.surfaces[1] local o = {n = 0, coal = 0, empty = 0}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  for _, b in pairs(s.find_entities_filtered{name = 'boiler', force = 'player'}) do
    local inv = b.get_inventory(defines.inventory.fuel)
    local c = inv.get_item_count('coal')
    if c == 0 then o.empty = o.empty + 1 end
    if c < %d then
      local k = math.min(%d - c, net.get_item_count('coal') - %d)
      if k > 0 then k = net.remove_item{name = 'coal', count = k} local put = inv.insert{name = 'coal', count = k}
        if put < k then net.insert{name = 'coal', count = k - put} end
        if put > 0 then o.n = o.n + 1 o.coal = o.coal + put end end
    end
  end
  o.net = net.get_item_count('coal')
  return o end)()""" % (LOW, FILL, KEEP)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=15)
    a = ap.parse_args()
    ai = AIBridge()
    while True:
        try:
            r = ai.lua(LUA)
            if r.get("coal") or r.get("empty") or a.once:
                print(time.strftime("%H:%M:%S"), "보일러 석탄", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"boilerguard: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

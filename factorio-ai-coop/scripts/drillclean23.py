"""고갈 채굴기 자동 정리 - 광석 0 이 된 채굴기를 로봇 해체로 건다 (사용자: "채굴기에 자원 오링난거 정리해", 2026-09-27).

로봇이 해체한 채굴기는 저장 상자로 돌아가 다음 채굴 자리에 다시 쓴다. 5분마다 (기본) 한 번, 바뀐 것만 찍는다.

    python -u scripts/drillclean23.py              # 상주
    python -u scripts/drillclean23.py --once
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

LUA = """(function() local s = game.surfaces[1] local o = {marked = {}}
  for _, d in pairs(s.find_entities_filtered{type = 'mining-drill', force = 'player'}) do
    if d.name ~= 'pumpjack' and not d.to_be_deconstructed() then
      local amt = 0
      for _, r in pairs(s.find_entities_filtered{type = 'resource', area = {{d.position.x - 2.5, d.position.y - 2.5}, {d.position.x + 2.5, d.position.y + 2.5}}}) do
        if r.name ~= 'crude-oil' then amt = amt + r.amount end
      end
      if amt == 0 or d.status == defines.entity_status.no_minable_resources then
        d.order_deconstruction('player')
        o.marked[#o.marked + 1] = d.position.x .. ',' .. d.position.y
      end
    end
  end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=300)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    while True:
        try:
            r = ai.lua(LUA)
            m = r.get("marked") or []
            m = list(m.values()) if isinstance(m, dict) else m
            if m:
                print(time.strftime("%H:%M:%S"), "고갈 채굴기 해체", len(m), m, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"drillclean: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

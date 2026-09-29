"""로켓 준비되면 바로 발사 (09-29 사용자 결정 "준비되면 자동 발사").

첫 발사 (01:00) · 2 호 (09:5x) 는 사용자 확인 후 수동. 이후는 rocket_ready 면 launch_rocket() - 승리 화면은 꺼 둠 (silo_script no_victory).

    python -u scripts/rocketauto23.py [--once]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

LUA = """(function() local o = {launched = 0}
  for _, si in pairs(game.surfaces[1].find_entities_filtered{name = 'rocket-silo', force = 'player'}) do
    if si.rocket_silo_status == defines.rocket_silo_status.rocket_ready and si.launch_rocket() then o.launched = o.launched + 1 end
  end
  o.total = game.forces.player.rockets_launched
  if o.launched > 0 then game.print('[AI] 로켓 발사 - 누적 ' .. (o.total + o.launched)) end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    while True:
        try:
            r = ai.lua(LUA)
            if r.get("launched") or a.once:
                print(time.strftime("%H:%M:%S"), "로켓 발사", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"rocketauto: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

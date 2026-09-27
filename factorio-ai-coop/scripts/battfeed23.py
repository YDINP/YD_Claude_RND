"""남는 배터리 -> 프레임 조립기 (사용자 스크린샷 2026-09-27: 상자 (28.5,-3.5) 배터리 407 방치).

상자에서 꺼내는 팔이 없어 (옛 넘침 팔 철거 뒤) 배터리가 놀고, 프레임 (25.5,-8.5) 은 배터리 부족으로 섰다.
상자를 로봇 해체로 걸어 배터리를 망 창고로 보내고, 5분마다 프레임 조립기에 배터리가 10 미만이면 로봇 배달 40 을 건다
(대량 로봇 요청은 건설 로봇을 묶는다 - inner23 사고 - 그래서 소량·주기형).

    python -u scripts/battfeed23.py --release   # 상자 해체 (한 번)
    python -u scripts/battfeed23.py             # 상주
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

FRAMES = [(25.5, -8.5), (8.5, 3.5)]
# 손 먹이 상자 보충 (위치, 아이템, 이 밑이면, 요청 수) - 사용자 (19:14): "철판이 없어서 황산을 못 만듦"
CHESTS = [((30.5, 3.5), "iron-plate", 20, 60)]

RELEASE = """(function() local s = game.surfaces[1]
  local c = s.find_entities_filtered{name = 'iron-chest', position = {28.5, -3.5}, radius = 0.5}[1]
  if not c then return {ok = 0} end
  local n = c.get_inventory(defines.inventory.chest).get_item_count('battery')
  c.order_deconstruction('player') return {ok = 1, battery = n} end)()"""

FEED = """(function() local s = game.surfaces[1] local o = {req = {}}
  for _, p in pairs({%s}) do
    local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1]
    if a then
      local net = s.find_logistic_network_by_position(a.position, 'player')
      local have = a.get_inventory(defines.inventory.assembling_machine_input).get_item_count('battery')
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} > 0
      if have < 10 and not busy and net and net.get_item_count('battery') >= 20 then
        s.create_entity{name = 'item-request-proxy', position = a.position, force = 'player', target = a,
          modules = {{id = {name = 'battery'}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = 1, count = 40}}}}}}
        o.req[#o.req + 1] = a.position.x .. ',' .. a.position.y
      end
    end
  end
  return o end)()"""

CHEST_FEED = """(function() local s = game.surfaces[1] local o = {req = {}}
  for _, t in pairs({%s}) do
    local c = s.find_entities_filtered{type = {'container', 'logistic-container'}, position = {t[1], t[2]}, radius = 0.5}[1]
    if c then
      local net = s.find_logistic_network_by_position(c.position, 'player')
      local have = c.get_inventory(defines.inventory.chest).get_item_count(t[3])
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = c.position, radius = 0.6} > 0
      if have < t[4] and not busy and net and net.get_item_count(t[3]) >= t[5] then
        s.create_entity{name = 'item-request-proxy', position = c.position, force = 'player', target = c,
          modules = {{id = {name = t[3]}, items = {in_inventory = {{inventory = defines.inventory.chest, stack = 0, count = t[5]}}}}}}
        o.req[#o.req + 1] = t[3] .. '@' .. c.position.x .. ',' .. c.position.y
      end
    end
  end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", action="store_true")
    ap.add_argument("--every", type=float, default=120)
    a = ap.parse_args()
    ai = AIBridge()
    if a.release:
        print(ai.lua(RELEASE))
        return 0
    lua = FEED % ", ".join("{%s, %s}" % p for p in FRAMES)
    while True:
        try:
            r = ai.lua(lua)
            rc = ai.lua(CHEST_FEED % ", ".join("{%s, %s, '%s', %d, %d}" % (p[0], p[1], it, lo, n) for p, it, lo, n in CHESTS))
            rq = rc.get("req") or []
            rq = list(rq.values()) if isinstance(rq, dict) else rq
            if rq:
                print(time.strftime("%H:%M:%S"), "상자 보충 ->", rq, flush=True)
            req = r.get("req") or []
            req = list(req.values()) if isinstance(req, dict) else req
            if req:
                print(time.strftime("%H:%M:%S"), "배터리 배달 40 ->", req, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"battfeed: {type(e).__name__}: {e}"[:200], flush=True)
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

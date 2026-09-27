"""건설 로봇 증산 (02:45).

망이 기지 -> 북쪽 구리 (y -370) 까지 길어졌는데 건설 로봇이 38 대뿐 (여유 0 · 재고 0), 로봇 조립기 없음.
R5 포탑 링이 12 분째 1/6 - 로봇이 모자라 멈춘다.
  * 조립기 1 을 (-29.5,-83.5) 에 유령으로 놓고 레시피 construction-robot (프레임 1 + 회로 2).
  * 60 초마다 Lua 중계: 망 로봇 < TARGET 이면 프레임 조립기 두 곳 (8.5,3.5)(25.5,-8.5) 출력 프레임 -> 로봇 조립기 (4 까지),
    회로는 망에서 (10 까지), 완성 로봇은 기지 로보포트 (망 2 에 속한 가장 가까운 것) 로봇 칸에 넣는다.
  * TARGET 을 채우면 프레임은 다시 노란팩 쪽으로 (yellowlab23 은 프레임 조립기 입력만 건드려 겹치지 않음).

    python -u scripts/robots23.py [--target 100]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

SPOT = (-29.5, -83.5)
PLACE = """(function() local s = game.surfaces[1]
  local a = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 0.6}[1]
  if a then if not a.get_recipe() then a.set_recipe('construction-robot') end return {state = 'built'} end
  if s.find_entities_filtered{ghost_name = 'assembling-machine-1', position = {%s, %s}, radius = 0.6}[1] then return {state = 'ghost'} end
  local g = s.create_entity{name = 'entity-ghost', inner_name = 'assembling-machine-1', position = {%s, %s}, force = 'player'}
  pcall(function() g.set_recipe('construction-robot') end)
  return {state = 'placed'} end)()"""

FEED = """(function() local s = game.surfaces[1] local o = {}
  local A = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 0.6}[1]
  if not A then return {err = 'no asm'} end
  if not A.get_recipe() then A.set_recipe('construction-robot') end
  local net = s.find_logistic_network_by_position({-60, -33}, 'player')
  o.robots = net.all_construction_robots o.free = net.available_construction_robots
  local ain = A.get_inventory(defines.inventory.assembling_machine_input)
  if o.robots < %d then
    for _, p in pairs({{8.5, 3.5}, {25.5, -8.5}}) do
      local F = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 1}[1]
      local need = 4 - ain.get_item_count('flying-robot-frame')
      if F and need > 0 then local got = F.get_inventory(defines.inventory.assembling_machine_output).remove{name = 'flying-robot-frame', count = need}
        if got > 0 then ain.insert{name = 'flying-robot-frame', count = got} o.frame = (o.frame or 0) + got end end
    end
    local need = 10 - ain.get_item_count('electronic-circuit')
    if need > 0 and net.get_item_count('electronic-circuit') >= 30 then local got = net.remove_item{name = 'electronic-circuit', count = need} if got > 0 then ain.insert{name = 'electronic-circuit', count = got} o.ec = got end end
  end
  local out = A.get_inventory(defines.inventory.assembling_machine_output)
  local n = out.get_item_count('construction-robot')
  if n > 0 then
    for _, r in pairs(s.find_entities_filtered{name = 'roboport', force = 'player', position = {-60, -33}, radius = 80}) do
      if r.logistic_network and r.logistic_network.network_id == net.network_id then
        local put = r.get_inventory(defines.inventory.roboport_robot).insert{name = 'construction-robot', count = n}
        if put > 0 then out.remove{name = 'construction-robot', count = put} o.added = (o.added or 0) + put n = n - put end
        if n <= 0 then break end
      end
    end
  end
  o.status = A.status
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=100)
    a = ap.parse_args()
    ai = AIBridge()
    print(time.strftime("%H:%M:%S"), "로봇 조립기", ai.lua(PLACE % (SPOT * 3)), flush=True)
    while True:
        try:
            r = ai.lua(FEED % (SPOT[0], SPOT[1], a.target))
            print(time.strftime("%H:%M:%S"), "건설 로봇", r, flush=True)
            if r.get("err"):
                ai.lua(PLACE % (SPOT * 3))
        except Exception as e:  # noqa: BLE001
            print(f"robots23: {type(e).__name__}: {e}"[:200], flush=True)
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main())

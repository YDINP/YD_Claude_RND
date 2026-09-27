"""대포 포탄 2 호 조립기 (02:03) - 포탄 망 0 · 대포 탄 0.

1 호 조립기 (-22.5,-66.5) 는 가동 중인데 시간당 93 뿐. 그 사이 폭발 포탄 조립기 둘은 출력 가득 (4 · 18), 폭약 공장도
출력 가득 (50) - 재료가 남는다. 레이더 조립기 (-18.5,-66.5) 는 재료 부족 (톱니 · 회로).
  * 2 호 조립기 (조립기 1) 를 (-30.5,-66.5) 에 유령으로 놓고 레시피 artillery-shell.
  * 60 초마다 Lua 중계: 폭발 포탄 출력 -> 2 호 (8 까지), 폭약 출력 -> 2 호 (16 까지), 망 -> 레이더 조립기 (톱니 10 · 회로 10 · 철 20 까지),
    레이더 출력 -> 2 호 (2 까지), 2 호 포탄 출력 -> 망 저장 상자 (-60.5,-33.5) (artyprep23 가 대포로 배달).
1 호 입력은 건드리지 않는다 (1 호 먼저 가득이면 남는 것만 2 호로 가는 셈 - 출력 가득일 때만 옮긴다).

    python -u scripts/shell2_23.py
"""
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

SPOT = (-30.5, -66.5)
PLACE = """(function() local s = game.surfaces[1]
  local a = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 0.6}[1]
  if a then if not a.get_recipe() then a.set_recipe('artillery-shell') end return {state = 'built', recipe = a.get_recipe() and a.get_recipe().name or '-'} end
  local g = s.find_entities_filtered{ghost_name = 'assembling-machine-1', position = {%s, %s}, radius = 0.6}[1]
  if g then return {state = 'ghost'} end
  g = s.create_entity{name = 'entity-ghost', inner_name = 'assembling-machine-1', position = {%s, %s}, force = 'player'}
  pcall(function() g.set_recipe('artillery-shell') end)
  return {state = 'placed'} end)()"""

FEED = """(function() local s = game.surfaces[1] local o = {}
  local A = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 0.6}[1]
  if not A then return {err = 'no asm'} end
  if not A.get_recipe() then A.set_recipe('artillery-shell') end
  local ain = A.get_inventory(defines.inventory.assembling_machine_input)
  local net = s.find_logistic_network_by_position({-60, -33}, 'player')
  local function out(p) local e = s.find_entities_filtered{type = {'assembling-machine', 'furnace'}, position = p, radius = 1}[1]
    return e and e.get_inventory(defines.inventory.assembling_machine_output) end
  local function move(src, item, cap, key)
    if not src then return end local need = cap - ain.get_item_count(item) if need <= 0 then return end
    local got = src.remove{name = item, count = need} if got > 0 then ain.insert{name = item, count = got} o[key] = (o[key] or 0) + got end end
  move(out({-26.5, -66.5}), 'explosive-cannon-shell', 8, 'ecs')
  move(out({-21.5, -71.5}), 'explosive-cannon-shell', 8, 'ecs')
  move(out({-24.5, -70.5}), 'explosives', 16, 'expl')
  move(out({-18.5, -66.5}), 'radar', 2, 'radar')
  -- 레이더 조립기 재료 (망에서)
  local R = s.find_entities_filtered{type = 'assembling-machine', position = {-18.5, -66.5}, radius = 1}[1]
  if R and net then local rin = R.get_inventory(defines.inventory.assembling_machine_input)
    for item, cap in pairs({['iron-gear-wheel'] = 30, ['electronic-circuit'] = 30, ['iron-plate'] = 60}) do
      local need = cap - rin.get_item_count(item)
      if need > 0 and net.get_item_count(item) >= need + 20 then local got = net.remove_item{name = item, count = need} if got > 0 then rin.insert{name = item, count = got} o['r_' .. item:sub(1, 4)] = got end end
    end end
  -- 02:06 레이더 줄 톱니 조립기 (-14.5,-66.5) 가 철 부족 -> 망에서 철 40 까지, 그 톱니는 레이더 조립기로
  local G = s.find_entities_filtered{type = 'assembling-machine', position = {-14.5, -66.5}, radius = 1}[1]
  if G and net then local gin = G.get_inventory(defines.inventory.assembling_machine_input)
    local need = 40 - gin.get_item_count('iron-plate')
    if need > 0 and net.get_item_count('iron-plate') >= 300 then local got = net.remove_item{name = 'iron-plate', count = need} if got > 0 then gin.insert{name = 'iron-plate', count = got} o.g_iron = got end end
    if R then local gout = G.get_inventory(defines.inventory.assembling_machine_output) local rin = R.get_inventory(defines.inventory.assembling_machine_input)
      local k = math.min(gout.get_item_count('iron-gear-wheel'), 30 - rin.get_item_count('iron-gear-wheel'))
      if k > 0 then gout.remove{name = 'iron-gear-wheel', count = k} rin.insert{name = 'iron-gear-wheel', count = k} o.gear = k end end
  end
  -- 완성 포탄 -> 망 저장 상자
  local aout = A.get_inventory(defines.inventory.assembling_machine_output)
  local sh = aout.get_item_count('artillery-shell')
  if sh > 0 then local c = s.find_entities_filtered{type = 'logistic-container', position = {-60.5, -33.5}, radius = 0.6}[1]
    if c then local put = c.insert{name = 'artillery-shell', count = sh} if put > 0 then aout.remove{name = 'artillery-shell', count = put} o.shell = put end end end
  o.status = A.status o.prog = math.floor(A.crafting_progress * 100)
  return o end)()"""


def main() -> int:
    ai = AIBridge()
    print(time.strftime("%H:%M:%S"), "2 호", ai.lua(PLACE % (SPOT * 3)), flush=True)
    while True:
        try:
            r = ai.lua(FEED % SPOT)
            print(time.strftime("%H:%M:%S"), "포탄 2 호", r, flush=True)
            if r.get("err"):
                ai.lua(PLACE % (SPOT * 3))
        except Exception as e:  # noqa: BLE001
            print(f"shell2: {type(e).__name__}: {e}"[:200], flush=True)
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main())

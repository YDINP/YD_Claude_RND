"""북쪽 구리 전초 전용 제련 줄 (03:30) - 전초 구리광을 석탄 줄이 아닌 화로로.

문제: copperroute23 안쪽 구간 끝은 x=-43.5 남향 기둥 -> (-43.5,-94.5) 석탄 벨트 옆치기 (석탄 줄 오염).
지금은 (-42.5,-117.5) 한 칸이 비어 구리광이 (-41.5,-117.5) 에 멈춰 있다 (바깥 벨트 가득).

설계 (벽 · 포탑 줄을 지나는 지하 벨트는 copperroute23 기둥 것을 그대로 쓴다 - 망 지하 벨트 재고 0):
  cut    (-43.5,-100.5) 남향 벨트를 동향으로 돌린다 (북쪽 기둥에서 들어오면 굽이). 바로 아래 (-43.5,-99.5) 는 해체 표시
         -> 기둥 아래 (-99.5..-95.5) 는 끊긴 빈 벨트, 구리가 y=-94.5 석탄 줄에 닿을 길이 없다.
  line   y=-100.5 동향 벨트 x -42.5..-4.5. 남쪽에 돌 화로 16 (중심 x -35..-5 · y -98), 팔 16 (y -99.5, 북쪽에서 집어 남쪽 화로로),
         전봇대 (y -99.5, 화로 3 개마다) - (-38.5,-99.5) 주 전력망 전봇대에 이어진다.
  asm    조립기 1 (-30.5,-94.5): 먼저 stone-furnace (망 돌 -> 조립기), 화로 재고가 차면 inserter 로 바꿔 팔을 만든다
         (톱니는 레이더 줄 톱니 조립기 (-14.5,-66.5) 출력 넘침에서, 회로 · 철은 망에서).
  open   cut 이 끝나고 줄 첫 벨트가 지어진 뒤에만 (-42.5,-117.5) 서향 벨트 유령 -> 구리광이 기둥 -> 제련 줄로.
Lua 중계 (30 초): 화로 연료 석탄 (망, 모자라면 석탄 상자 (-1.5,-30.5) 300 초과분), 화로 구리판 -> 망 저장, 조립기 입출력.
만드는 것은 로봇 (유령) 뿐, 없는 물건을 만들지 않는다 (중계는 있는 물건만 옮김). 철거는 (-43.5,-99.5) 한 칸.

    python -u scripts/cusmelt23.py --check   # 드라이런 (칸 검사)
    python -u scripts/cusmelt23.py           # 상주 (30 초)
로그 state/cusmelt23.log
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge")]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "cusmelt23.log")
N = 16
FURN = [(-35 + 2 * i, -98) for i in range(N)]
INS = [(-35.5 + 2 * i, -99.5) for i in range(N)]
POLES = [(-34.5 + 2 * i, -99.5) for i in range(0, N, 3)] + [(-28.5, -96.5)]
BELT = [(x + 0.5, -100.5) for x in range(-43, -4)]          # -42.5 .. -4.5
ASM = (-30.5, -94.5)
TURN = (-43.5, -100.5)
CUTB = (-43.5, -99.5)
OPEN = (-42.5, -117.5)
FURN_TARGET = 4              # 08:20 전초 기둥 다 섬 - 돌 아끼려고 재고 4 면 팔로 (08:10 에는 30)
SMELT_STATE = os.path.join(HERE, "..", "state", "smeltcol23.json")   # 구리 전초 제련 전환 뒤 (switched) 기지 줄은 은퇴

ITEMS = ([("transport-belt", x, y, "east") for x, y in BELT] + [("small-electric-pole", x, y, "north") for x, y in POLES]
         + [("stone-furnace", x, y, "north") for x, y in FURN] + [("inserter", x, y, "north") for x, y in INS]
         + [("assembling-machine-1", ASM[0], ASM[1], "north")])


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def rows(items):
    return ", ".join("{'%s', %s, %s, '%s'}" % it for it in items)


CHECK = """(function() local s = game.surfaces[1] local o = {bad = {}, ok = 0}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.ok = o.ok + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = defines.direction[t[4]], force = 'player', build_check_type = defines.build_check_type.manual_ghost} then o.ok = o.ok + 1
    else o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
  end return o end)()"""

PLACE = """(function() local s = game.surfaces[1] local o = {made = 0, have = 0, fail = {}}
  for _, t in pairs({%s}) do local pos = {t[2], t[3]} local d = defines.direction[t[4]]
    local e = s.find_entities_filtered{name = t[1], position = pos, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = t[1], position = pos, radius = 0.3}[1]
    if e then o.have = o.have + 1 else
      local g = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = pos, direction = d, force = 'player', expires = false}
      if g then o.made = o.made + 1 if t[1] == 'assembling-machine-1' then pcall(function() g.set_recipe('stone-furnace') end) end
      else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
    end end
  return o end)()"""

# 기둥 끊기 + 입구 열기 (단계적으로, 매 틱 다시 확인)
CUT = """(function() local s = game.surfaces[1] local o = {}
  local T = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if not T then o.err = 'no turn belt' return o end
  if T.direction ~= defines.direction.east then T.direction = defines.direction.east o.rotated = true end
  o.turn = T.direction == defines.direction.east
  local C = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if C and not C.to_be_deconstructed() then C.order_deconstruction('player') o.cut_ordered = true end
  o.cut = C == nil
  local F = s.find_entities_filtered{name = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  o.first = F ~= nil and F.direction == defines.direction.east
  -- 기둥 아래 끊긴 칸 (-99.5..-95.5) 의 구리 (있으면 경보)
  local cu = 0 for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-44, -100}, {-43, -95}}}) do
    for i = 1, 2 do cu = cu + b.get_transport_line(i).get_item_count('copper-ore') end end
  o.below_cu = cu
  if o.turn and o.cut and o.first and cu == 0 then
    local e = s.find_entities_filtered{name = 'transport-belt', position = {%s, %s}, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
    if not e then s.create_entity{name = 'entity-ghost', inner_name = 'transport-belt', position = {%s, %s}, direction = defines.direction.west, force = 'player', expires = false} o.open = 'ghost' else o.open = e.type end
  end
  return o end)()"""

FEED = """(function() local s = game.surfaces[1] local o = {furn = 0, work = 0, fuel = 0, plate = 0, ins = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local coalbox = s.find_entities_filtered{type = 'container', position = {-1.5, -30.5}, radius = 0.6}[1]
  local function coal(n)
    local got = net.get_item_count('coal') > n and net.remove_item{name = 'coal', count = n} or 0
    if got == 0 and coalbox and coalbox.get_item_count('coal') > 300 + n then got = coalbox.remove_item{name = 'coal', count = n} end
    return got end
  for _, p in pairs({%s}) do
    local f = %s and s.find_entities_filtered{name = 'stone-furnace', position = p, radius = 0.3}[1]
    if f then o.furn = o.furn + 1
      if f.status == defines.entity_status.working then o.work = o.work + 1 end
      local fu = f.get_inventory(defines.inventory.fuel)
      local need = 10 - fu.get_item_count('coal')
      if need >= 5 then local got = coal(need) if got > 0 then fu.insert{name = 'coal', count = got} o.fuel = o.fuel + got end end
      local out = f.get_inventory(defines.inventory.furnace_result)
      local k = out.get_item_count('copper-plate')
      -- 06:50 망 저장 상자가 구리로 가득 차 건설 로봇 104 대가 구리를 든 채 멈춤 - 망 구리 5000 넘으면 화로에 둔다 (화로가 막히면 벨트가 쉰다)
      if k > 0 and net.get_item_count('copper-plate') < 5000 then local put = net.insert({name = 'copper-plate', count = k}, 'storage') if put > 0 then out.remove{name = 'copper-plate', count = put} o.plate = o.plate + put end end
    end
    local i = s.find_entities_filtered{name = 'inserter', position = {p[1] - 0.5, p[2] - 1.5}, radius = 0.3}[1]
    if i then o.ins = o.ins + 1 end
  end
  -- 조립기: 돌 화로 -> (재고 차면) 팔
  local A = s.find_entities_filtered{name = 'assembling-machine-1', position = {%s, %s}, radius = 0.3}[1]
  if A then
    local want = (net.get_item_count('stone-furnace') >= %d) and 'inserter' or 'stone-furnace'
    local r = A.get_recipe()
    if not r or r.name ~= want then
      local ain = A.get_inventory(defines.inventory.assembling_machine_input)
      for _, it in pairs(ain.get_contents()) do local put = net.insert({name = it.name, count = it.count}, 'storage') if put > 0 then ain.remove{name = it.name, count = put} end end
      local aout = A.get_inventory(defines.inventory.assembling_machine_output)
      for _, it in pairs(aout.get_contents()) do local put = net.insert({name = it.name, count = it.count}, 'storage') if put > 0 then aout.remove{name = it.name, count = put} end end
      if ain.is_empty() and aout.is_empty() then A.set_recipe(want) o.recipe_set = want end end
    want = A.get_recipe() and A.get_recipe().name or want
    local ain = A.get_inventory(defines.inventory.assembling_machine_input)
    local function give(item, cap, floor, src)
      local need = cap - ain.get_item_count(item) if need <= 0 then return end
      local got = 0
      if src then got = src.remove{name = item, count = need}
      elseif net.get_item_count(item) >= need + floor then got = net.remove_item{name = item, count = need} end
      if got > 0 then ain.insert{name = item, count = got} o['in_' .. item:sub(1, 5)] = got end end
    if want == 'stone-furnace' then give('stone', 25, 20)
    else
      local G = s.find_entities_filtered{type = 'assembling-machine', position = {-14.5, -66.5}, radius = 1}[1]
      local gout = G and G.get_inventory(defines.inventory.assembling_machine_output)
      if gout and gout.get_item_count('iron-gear-wheel') >= 40 then
        local need = 5 - ain.get_item_count('iron-gear-wheel')
        if need > 0 then local got = gout.remove{name = 'iron-gear-wheel', count = need} if got > 0 then ain.insert{name = 'iron-gear-wheel', count = got} o.in_gear = got end end end
      give('iron-plate', 10, 300)
      give('electronic-circuit', 5, 10)
    end
    local aout = A.get_inventory(defines.inventory.assembling_machine_output)
    for _, it in pairs(aout.get_contents()) do
      if net.get_item_count(it.name) < 40 then local put = net.insert({name = it.name, count = it.count}, 'storage') if put > 0 then aout.remove{name = it.name, count = put} o['out_' .. it.name] = put end end
    end
    o.asm = (A.get_recipe() and A.get_recipe().name or '-') local st = '' for n, v in pairs(defines.entity_status) do if v == A.status then st = n end end o.asm_st = st
  end
  local ore = 0 for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-43, -101}, {-4, -100}}}) do
    for i = 1, 2 do ore = ore + b.get_transport_line(i).get_item_count('copper-ore') end end
  o.line_ore = ore
  local st = game.forces.player.get_item_production_statistics(s)
  local p1 = defines.flow_precision_index.ten_minutes
  o.cu10 = math.floor(st.get_flow_count{name = 'copper-plate', category = 'input', precision_index = p1, count = true})
  o.stock = {sf = net.get_item_count('stone-furnace'), ins = net.get_item_count('inserter'), stone = net.get_item_count('stone'), coal = net.get_item_count('coal'),
    cu = net.get_item_count('copper-plate')}
  return o end)()"""


def retired():
    """구리 전초 현지 제련 전환 뒤: 기지 돌 화로 줄은 연료 · 유령 복구를 멈춘다 (구리판은 줄 끝에서 smeltcol23 이 망으로)."""
    try:
        with open(SMELT_STATE, encoding="utf-8") as f:
            return bool(json.load(f).get("cu", {}).get("switched"))
    except (OSError, ValueError):
        return False


BASE_ONLY = [it for it in ITEMS if it[0] in ("transport-belt", "small-electric-pole", "assembling-machine-1")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--every", type=float, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    r = ai.lua(CHECK % rows(ITEMS))
    print("칸 검사: 가능 %s / %d · 막힘 %s" % (r.get("ok"), len(ITEMS), r.get("bad")), flush=True)
    if a.check:
        return 0
    if r.get("bad"):
        log("막힌 칸 있어 멈춤: %s" % r.get("bad"))
        return 1
    log("cusmelt23 시작 · 은퇴 %s · 유령 %s" % (retired(), ai.lua(PLACE % rows(BASE_ONLY if retired() else ITEMS))))
    fpts = ", ".join("{%s, %s}" % p for p in FURN)
    last = None
    while True:
        try:
            ret = retired()
            g = ai.lua(PLACE % rows(BASE_ONLY if ret else ITEMS))
            if g.get("made"):
                log("사라진 유령 다시 %s" % g.get("made"))
            c = ai.lua(CUT % (TURN + CUTB + (BELT[0][0], BELT[0][1]) + OPEN * 3))
            f = ai.lua(FEED % (fpts, "false" if ret else "true", ASM[0], ASM[1], FURN_TARGET))
            key = (c.get("turn"), c.get("cut"), c.get("open"), f.get("furn"), f.get("ins"), f.get("asm"))
            line = ("끊기 %s/%s 입구 %s 아래구리 %s · 화로 %s (가동 %s) 팔 %s · 줄 구리광 %s · 판 -> 망 %s · 석탄 %s · 조립기 %s %s · 구리판 10분 %s · 재고 %s" % (
                c.get("turn"), c.get("cut"), c.get("open"), c.get("below_cu"), f.get("furn"), f.get("work"), f.get("ins"), f.get("line_ore"),
                f.get("plate"), f.get("fuel"), f.get("asm"), f.get("asm_st"), f.get("cu10"), f.get("stock")))
            if c.get("below_cu"):
                line = "경보: 끊긴 기둥에 구리광 " + line
            if key != last or f.get("plate") or c.get("rotated") or c.get("cut_ordered"):
                log(line)
                last = key
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

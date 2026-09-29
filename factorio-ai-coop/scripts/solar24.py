"""Run 24 발전 늘리기: 태양광 + 축전지 (2026-09-30 03:58 ~).

03:58 발전 13.5 / 17.1 MW (79 %). 증기 줄 (x -29.5..6.5, y ~46) 은 서쪽 물 · 동쪽 벽으로 못 늘린다.

선택 (셈):
  (a) 태양광 168 (피크 60 kW · 평균 ~42 kW) = +10.08 MW 피크 / ~7.1 MW 평균 + 축전지 141 (25:21) - 연료 0.
      재료: 강철 840 · 구리판 2,520 + 회로 2,520 (구리 3,780 · 철 2,520) + 축전지 (철 282 · 배터리 705)
      = 구리 ~6,300 · 철 ~2,800 · 강철 840. 10분 구리 생산 6,159 - 씀 2,551 = 남는 3,600 → 남는 몫으로 ~18 분.
  (b) 둘째 증기 (해안 펌프 1 · 보일러 6 · 기관 12 = 10.8 MW): 철 ~420 · 돌 30 뿐이지만
      석탄 2.7/s 새 공급 (지금 벨트 5.5 - 씀 3.4 = 남는 2.1 < 2.7) - 석탄 밭 (x 104..128) → 다른 물가 벨트 150+ 칸 + 채굴기 6 + 물가 방어 (01:38 공습 자리).
  → (a): 연료 물류가 없고, 망 안 빈터 (북쪽 가운데) 에 로봇만으로 짓는다.

만들기 (사람 손 없음 - 한가한 사람 0): 조립기 2 줄 10 대, 로봇이 넣고 (item-request-proxy, 대상마다 ≤ 100) 로봇이 뺀다 (removal_plan → 저장 상자).
  Lua 는 요청만 만든다 - 아이템은 건설 로봇이 망 상자에서 실제로 난다 (relay 아님). 유령은 can_place manual 통과 · 같은 건물이 없는 칸만.
  C1 · C2 전선 → (빠른 팔) → E 회로 → (팔) → P1 · P2 태양광 / S 쇠막대 → (팔) → MP 중형 전봇대 / A 축전지 / M 팔 · F 빠른 팔 (부트스트랩).
  망 재고가 KEEP 밑이면 요청 안 함 · 허브 판 철 600 / 구리 400 밑이면 요청 안 함.

밭: 칸 7 × 9 = 중형 전봇대 1 + 태양광 6 (전봇대 공급 7×7 에 판 가장자리가 걸침), 축전지 칸 9 × 8 = 전봇대 1 + 축전지 16.

    python scripts/solar24.py --run run24 --line        # 조립 줄 유령
    python scripts/solar24.py --run run24 --inserters   # 팔 유령 (M · F 가 만든 뒤)
    python scripts/solar24.py --run run24 --field       # 밭 유령
    python scripts/solar24.py --run run24 --feed --every 20
    python scripts/solar24.py --run run24 --status
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401
from client import AIBridge, RconError   # noqa: E402

A2, INS, FINS, SP, MP = "assembling-machine-2", "inserter", "fast-inserter", "small-electric-pole", "medium-electric-pole"
PANEL, ACC = "solar-panel", "accumulator"
IRON, CU, STEEL, CIRC, CABLE, GEAR, BATT, STICK = ("iron-plate", "copper-plate", "steel-plate", "electronic-circuit",
                                                   "copper-cable", "iron-gear-wheel", "battery", "iron-stick")

# ---------------------------------------------------------------------------------------------------- 조립 줄
# (이름, x, y, 레시피)
ASM = {
    "S":  (-50.5, -19.5, STICK),
    "MP": (-46.5, -19.5, MP),
    "A":  (-42.5, -19.5, ACC),
    "C1": (-38.5, -19.5, CABLE),
    "E":  (-34.5, -19.5, CIRC),
    "P1": (-30.5, -19.5, PANEL),
    "P2": (-34.5, -15.5, PANEL),
    "C2": (-34.5, -23.5, CABLE),
    "M":  (-38.5, -23.5, INS),
    "F":  (-42.5, -23.5, FINS),
    # 04:20 - 작은 전봇대 셋 (-40.5,-21.5) (-44.5,-17.5) (-48.5,-17.5) 이 망에 없어 S · MP · A · F 가 no_power.
    #         전기 닿는 동쪽 틈 (y -17..-14) 에 쇠막대 · 중형 전봇대 둘을 더 (로봇이 막대를 옮김) → 중형 전봇대로 위 셋을 바꿈
    "S2":  (-25.5, -15.5, STICK),
    "MP2": (-19.5, -15.5, MP),
    # 04:36 - 2.0 조립기는 결과 2 개면 full_output → 로봇 빼기 (20~40 s) 가 판 줄을 조인다 (25 분에 판 49).
    #         결과 팔 → 공급 상자 (망) 로 바꾼다: 강철 상자 → 공급 상자 조립기 둘 (전기 닿는 y -17..-14 틈)
    "SC": (-14.5, -15.5, "steel-chest"),
    "PC": (-11.5, -15.5, "passive-provider-chest"),
}
LINE_POLES = [(-16.5, -15.5), (-22.5, -16.5), (-28.5, -16.5), (-32.5, -17.5), (-36.5, -21.5), (-40.5, -21.5),
              (-44.5, -17.5), (-48.5, -17.5)]
# 팔: (이름, x, y, 집는 조립기, 넣는 조립기)
ARMS = [(FINS, -36.5, -19.5, "C1", "E"), (FINS, -34.5, -21.5, "C2", "E"),
        (INS, -32.5, -19.5, "E", "P1"), (INS, -34.5, -17.5, "E", "P2"), (INS, -48.5, -19.5, "S", "MP")]

# 넣기: 조립기 → [(품목, 이 밑이면, 한 번에)] (한 대상 한 요청 합 ≤ 100)
FEED = {
    "S":  [(IRON, 10, 40)],
    "MP": [(STEEL, 6, 20), (CABLE, 4, 20)],                  # 2.0 중형 전봇대 = 강철 2 · 쇠막대 4 · 전선 2
    "A":  [(IRON, 6, 16), (BATT, 10, 40)],
    "C1": [(CU, 20, 80)],
    "C2": [(CU, 20, 80)],
    "E":  [(IRON, 40, 100)],
    "P1": [(STEEL, 5, 15), (CU, 15, 45), (CIRC, 15, 30)],     # 회로는 E 팔이 주고, 망 회로 (KEEP 위) 로 앞당김
    "P2": [(STEEL, 5, 15), (CU, 15, 45), (CIRC, 15, 30)],
    "M":  [(CIRC, 3, 6), (GEAR, 3, 6), (IRON, 3, 6)],
    "F":  [(INS, 1, 2), (CIRC, 2, 4), (IRON, 2, 4)],
    "S2": [(IRON, 10, 40)],
    "MP2": [(STEEL, 6, 20), (STICK, 8, 40), (CABLE, 4, 20)],
    "SC": [(STEEL, 8, 24)],
    "PC": [("steel-chest", 1, 3), (CIRC, 3, 9)],
}
# 빼기: 조립기 → (품목, 이만큼 차면)
TAKE = {"P1": (PANEL, 2), "P2": (PANEL, 2), "A": (ACC, 2), "MP": (MP, 4), "M": (INS, 1), "F": (FINS, 1),
        "S2": (STICK, 20), "MP2": (MP, 2), "C1": (CABLE, 150), "SC": ("steel-chest", 1), "PC": ("passive-provider-chest", 1)}
# 결과 팔 → 공급 상자 (팔 이름, x, y, 집는 조립기) · 상자 (x, y)
OUTS = [((-30.5, -21.5), "P1", (-30.5, -22.5)), ((-36.5, -15.5), "P2", (-37.5, -15.5)), ((-42.5, -17.5), "A", (-42.5, -16.5))]     # C1 이 넘치면 (E 가 망 회로로 쉼) 전선을 망으로 → 전봇대
# 망에 남길 몫 (이 밑이면 그 품목 요청 안 함)
KEEP = {IRON: 1500, CU: 1200, STEEL: 500, CIRC: 100, BATT: 60, GEAR: 0, INS: 0, STICK: 0, CABLE: 0, "steel-chest": 0}
HUB_BOX = (62, -16.1, 76.2, -14.9)
HUB_KEEP = {IRON: 600, CU: 400}

# ---------------------------------------------------------------------------------------------------- 밭
PANEL_TARGET, ACC_TARGET = 168, 141
N, E_, S_, W = 0, 4, 8, 12


def panel_cells():
    """칸 (중형 전봇대 (px+.5, py+.5)): 판 왼 (px-1.5) · 오 (px+2.5), 줄 py-1.5 · py+1.5 · py+4.5 (공급 py-3..py+4 에 걸침).
    칸 폭 7 · 높이 6 (두 줄) / 9 (세 줄) - 전봇대 사이 7 · 6 · 9 ≤ 중형 전선 9. 앞 구역부터, 막힌 칸은 건너뜀."""
    cells = []
    for py in (-34, -28):                                   # Z1: x -69..-13, y -37..-25 (조립 줄 북쪽)
        for px in range(-66, -16, 7):
            cells.append((px, py, 2))
    for py in (-46, -37):                                   # Z2: x -9..19, y -49..-31 (서 벽 x -10 · 동 벨트 x 23 사이)
        for px in range(-6, 16, 7):
            cells.append((px, py, 3))
    for px in range(73, 95, 7):                             # Z3: x 70..98, y -40..-25 (벨트 y -41 · y -25 사이)
        cells.append((px, -37, 3))
        cells.append((px, -28, 2))
    for py in (-22, -16):                                   # Z4: 조립 줄 서쪽 x -62..-55, y -25..-13
        cells.append((-59, py, 2))
    for px in (79, 86, 93):                                 # Z5: x 76..97, y -21..-12 (벨트 y -22 · y -12 사이)
        cells.append((px, -18, 3))
    return cells


def acc_cells():
    """축전지 칸 (중형 전봇대 (px+.5, py+.5)): 열 px-3,-1,+2,+4 (가운데) · 줄 py-3,-1,+1,+3 → 칸 x px-4..px+5 · y py-4..py+4."""
    return [(-24, -21), (-15, -21), (-6, -26), (3, -26), (12, -26)]


LINK_POLES = [(-5.5, -30.5), (1.5, -30.5), (8.5, -30.5),   # Z2 ↔ 축전지 줄 (y -31..-30 틈)
              (-5.5, -42.5),                              # Z2 서북 칸 - 전봇대 (-5.5,-45.5) 가 포탑 (-7..-4,-47..-44) 에 막힘
              (98.5, -23.5)]                              # Z3 ↔ Z5


def field_plan():
    """(전봇대 목록, 판 목록, 축전지 목록) - 판 · 축전지는 칸 순서 (앞 칸부터 채움)."""
    poles, panels, accs = [(MP, x, y) for x, y in LINK_POLES], [], []
    for px, py, rows in panel_cells():
        poles.append((MP, px + 0.5, py + 0.5))
        for k in range(rows):
            cy = py - 1.5 + 3 * k
            panels.append((PANEL, px - 1.5, cy))
            panels.append((PANEL, px + 2.5, cy))
    for px, py in acc_cells():
        poles.append((MP, px + 0.5, py + 0.5))
        for dx in (-3, -1, 2, 4):
            for dy in (-3, -1, 1, 3):
                accs.append((ACC, px + dx, py + dy))
    return poles, panels, accs


# ---------------------------------------------------------------------------------------------------- Lua
GHOSTS_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local L = helpers.json_to_table('%s')
  local cap = %d
  local out = {placed = 0, skip = 0, blocked = 0, nonet = 0, bad = {}}
  for _, q in pairs(L) do
   if out.placed + out.skip < cap then
    local n, pos, d, r = q[1], {q[2], q[3]}, q[4] or 0, q[5]
    if #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
    elseif s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.6} > 0
        or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.6} > 0 then out.skip = out.skip + 1
    elseif s.can_place_entity{name = n, position = pos, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
      local g = s.create_entity{name = 'entity-ghost', inner_name = n, position = pos, direction = d, force = f, recipe = r}
      if g then out.placed = out.placed + 1 else out.blocked = out.blocked + 1 end
    else
      out.blocked = out.blocked + 1
      if #out.bad < 12 then out.bad[#out.bad + 1] = n .. '@' .. q[2] .. ',' .. q[3] end
    end
   end
  end
  return out
end)()"""

# 팔: 네 방향 중 집는 곳이 from 조립기 · 놓는 곳이 to 조립기인 방향 (유령 pickup/drop 로 확인)
ARMS_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local L = helpers.json_to_table('%s')
  local out = {placed = 0, skip = 0, blocked = 0, nodir = 0, dirs = {}}
  local function inside(p, c) return math.abs(p.x - c[1]) <= 1.5 and math.abs(p.y - c[2]) <= 1.5 end
  for _, q in pairs(L) do
    local n, pos, from, to = q[1], {q[2], q[3]}, q[4], q[5]
    if s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.4} > 0
        or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.4} > 0 then out.skip = out.skip + 1
    else
      local done = false
      for _, d in pairs({0, 4, 8, 12}) do
        if not done and s.can_place_entity{name = n, position = pos, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
          local g = s.create_entity{name = 'entity-ghost', inner_name = n, position = pos, direction = d, force = f}
          if g then
            local ok, pk, dp = pcall(function() return g.pickup_position, g.drop_position end)
            if ok and pk and dp and inside(pk, from) and inside(dp, to) then
              done = true; out.placed = out.placed + 1; out.dirs[#out.dirs + 1] = q[2] .. ',' .. q[3] .. '=' .. d
            else g.destroy() end
          end
        end
      end
      if not done then out.nodir = out.nodir + 1 end
    end
  end
  return out
end)()"""

FEED_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {req = {}, take = {}, short = {}, miss = {}, stop = {}}
  local net = nil
  for _, n in pairs(s.find_logistic_networks_by_construction_area({-34.5, -19.5}, f) or {}) do
    if not net or n.all_construction_robots > net.all_construction_robots then net = n end
  end
  if not net then out.err = 'no net'; return out end
  local hub = {}
  for _, c in pairs(s.find_entities_filtered{type = {'container', 'logistic-container'}, force = f, area = {{A.hub[1], A.hub[2]}, {A.hub[3], A.hub[4]}}}) do
    for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do hub[v.name] = (hub[v.name] or 0) + v.count end
  end
  out.hub = {iron = hub['iron-plate'] or 0, cu = hub['copper-plate'] or 0}
  local function built(n) return s.count_entities_filtered{name = n, force = f} end
  local have = {}
  for _, n in pairs({'solar-panel', 'accumulator', 'medium-electric-pole', 'inserter', 'fast-inserter'}) do have[n] = net.get_item_count(n) end
  out.have = have
  local done = {
    P = built('solar-panel') + have['solar-panel'] >= A.pt,
    A = built('accumulator') + have['accumulator'] >= A.at,
    MP = have['medium-electric-pole'] >= s.count_entities_filtered{ghost_name = 'medium-electric-pole', force = f},
    M = have['inserter'] >= A.mt,                -- 망에서 쓴 팔 (결과 팔 3) 은 다시 채워 둔다
    F = have['fast-inserter'] >= 2 or A.armsup,
    PC = net.get_item_count('passive-provider-chest') + A.pcbuilt >= 6,  -- 망에 있던 공급 상자 3 을 썼으니 3 을 돌려놓는다
  }
  done.SC = done.PC or net.get_item_count('steel-chest') >= 3
  for key, a0 in pairs(A.asm) do
    local a = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = {a0[1], a0[2]}, radius = 0.6}[1]
    if not a then out.miss[#out.miss + 1] = key
    elseif s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} == 0 then
      local grp = (key == 'P1' or key == 'P2') and 'P' or (key == 'MP2' and 'MP') or (key == 'S2' and 'S') or key
      local ins, rem, total = {}, {}, 0
      local r = a.get_recipe()
      local stop = done[grp] or (key == 'SC' and done.SC) or (grp == 'S' and done.MP) or ((key == 'C1' or key == 'C2' or key == 'E') and done.P)
      if stop then out.stop[#out.stop + 1] = key end
      if r and not stop then
        local inv = a.get_inventory(defines.inventory.assembling_machine_input)
        for _, q in pairs(A.feed[key] or {}) do
          local item, low, cnt = q[1], q[2], q[3]
          local k, stack = 0, nil
          for _, ing in pairs(r.ingredients) do
            if ing.type == 'item' then
              if ing.name == item then stack = k end
              k = k + 1
            end
          end
          local hubok = not A.hubkeep[item] or (hub[item] or 0) >= A.hubkeep[item] + 200
          if stack and inv.get_item_count(item) < low and total + cnt <= 100 then
            if hubok and net.get_item_count(item) >= cnt + (A.keep[item] or 0) then
              ins[#ins + 1] = {id = {name = item}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = stack, count = cnt}}}}
              total = total + cnt
              out.req[#out.req + 1] = key .. ':' .. item .. ' ' .. cnt
            else out.short[#out.short + 1] = key .. ':' .. item end
          end
        end
      end
      local t = A.take[key]
      if t then
        local oc = a.get_inventory(defines.inventory.assembling_machine_output).get_item_count(t[1])
        if oc >= t[2] then
          rem[1] = {id = {name = t[1]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_output, stack = 0, count = math.min(oc, 100 - total)}}}}
          out.take[#out.take + 1] = key .. ':' .. t[1] .. ' ' .. oc
        end
      end
      if #ins > 0 or #rem > 0 then
        s.create_entity{name = 'item-request-proxy', position = a.position, force = f, target = a, modules = ins, removal_plan = rem}
      end
    end
  end
  return out
end)()"""

STATUS_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local pole = s.find_entities_filtered{name = 'small-electric-pole', position = {-10.5, -12.5}, radius = 0.6}[1]
  local id = pole.electric_network_id
  local out = {tick = game.tick, daytime = s.daytime, darkness = s.darkness}
  local c, g = {}, {}
  for _, n in pairs({'solar-panel', 'accumulator', 'medium-electric-pole'}) do
    c[n] = s.count_entities_filtered{name = n, force = f}
    g[n] = s.count_entities_filtered{ghost_name = n, force = f}
  end
  out.count, out.ghosts = c, g
  local on = {}
  for _, n in pairs({'steam-engine', 'solar-panel', 'accumulator'}) do
    local k = 0
    for _, e in pairs(s.find_entities_filtered{name = n, force = f}) do if e.electric_network_id == id then k = k + 1 end end
    on[n] = k
  end
  out.on_grid = on
  local accE, accMax = 0, 0
  for _, e in pairs(s.find_entities_filtered{name = 'accumulator', force = f}) do
    if e.electric_network_id == id then accE = accE + e.energy; accMax = accMax + e.electric_buffer_size end
  end
  out.acc_mj = {accE / 1e6, accMax / 1e6}
  -- 5 초 창 (MW). 전기망 통계는 input = 쓰는 것 (소비자별) · output = 만드는 것 (발전기별)
  local st = pole.electric_network_statistics
  local P = defines.flow_precision_index.five_seconds
  local use, gen, top = 0, {}, {}
  for name, _ in pairs(st.input_counts) do
    local v = st.get_flow_count{name = name, category = 'input', precision_index = P, count = false} * 60 / 1e6
    use = use + v
    if v >= 1 then top[name] = v end
  end
  for name, _ in pairs(st.output_counts) do gen[name] = st.get_flow_count{name = name, category = 'output', precision_index = P, count = false} * 60 / 1e6 end
  out.use_mw, out.use_top, out.gen_mw = use, top, gen
  -- 용량: 기관 0.9 MW · 판 60 kW 피크 (지금 해 · solar_power_multiplier 무시)
  out.cap_mw = {steam = on['steam-engine'] * 0.9, solar_peak = on['solar-panel'] * 0.06, acc_out = on['accumulator'] * 0.3}
  return out
end)()"""


def asm_list():
    return [(A2, x, y, 0, r) for x, y, r in ASM.values()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--line", action="store_true")
    ap.add_argument("--inserters", action="store_true")
    ap.add_argument("--field", action="store_true")
    ap.add_argument("--outs", action="store_true", help="결과 팔 · 공급 상자 유령 (PC 가 상자를 만든 뒤)")
    ap.add_argument("--feed", action="store_true")
    ap.add_argument("--every", type=int, default=0)
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--panels", type=int, default=0, help="--field 판 유령 상한 (기본 PANEL_TARGET)")
    ap.add_argument("--accs", type=int, default=0, help="--field 축전지 유령 상한 (기본 ACC_TARGET)")
    a = ap.parse_args()
    ai = AIBridge()
    if a.line:
        print("줄 조립기", json.dumps(ai.lua(GHOSTS_LUA % (json.dumps(asm_list()), 999)), ensure_ascii=False))
        print("줄 전봇대", json.dumps(ai.lua(GHOSTS_LUA % (json.dumps([(SP, x, y) for x, y in LINE_POLES]), 999)), ensure_ascii=False))
    if a.inserters:
        arms = [(n, x, y, ASM[fr][:2], ASM[to][:2]) for n, x, y, fr, to in ARMS]
        print("팔", json.dumps(ai.lua(ARMS_LUA % json.dumps(arms)), ensure_ascii=False))
    if a.outs:
        arms = [(INS, ix, iy, ASM[fr][:2], list(c)) for (ix, iy), fr, c in OUTS]
        print("결과 팔", json.dumps(ai.lua(ARMS_LUA % json.dumps(arms)), ensure_ascii=False))
        print("공급 상자", json.dumps(ai.lua(GHOSTS_LUA % (json.dumps([("passive-provider-chest", cx, cy) for _, _, (cx, cy) in OUTS]), 999)), ensure_ascii=False))
    if a.field:
        poles, panels, accs = field_plan()
        print("밭 판", json.dumps(ai.lua(GHOSTS_LUA % (json.dumps(panels), a.panels or PANEL_TARGET)), ensure_ascii=False))
        print("밭 축전지", json.dumps(ai.lua(GHOSTS_LUA % (json.dumps(accs), a.accs or ACC_TARGET)), ensure_ascii=False))
        print("밭 전봇대", json.dumps(ai.lua(GHOSTS_LUA % (json.dumps(poles), 999)), ensure_ascii=False))
    if a.status:
        print(json.dumps(ai.lua(STATUS_LUA), ensure_ascii=False))
    if a.feed:
        while True:
            try:
                ai = ai or AIBridge()
                arms_up = ai.lua("""(function() local s = game.surfaces[1]
                  local k = 0
                  for _, p in pairs(helpers.json_to_table('%s')) do
                    k = k + s.count_entities_filtered{type = 'inserter', position = p, radius = 0.4}
                  end
                  return {k = k} end)()""" % json.dumps([[x, y] for _, x, y, _, _ in ARMS]))["k"] >= len(ARMS)
                pc_built = ai.lua("""(function() local s = game.surfaces[1]
                  local k = 0
                  for _, p in pairs(helpers.json_to_table('%s')) do
                    k = k + s.count_entities_filtered{name = 'passive-provider-chest', position = p, radius = 0.4}
                  end
                  return {k = k} end)()""" % json.dumps([list(c) for _, _, c in OUTS]))["k"]
                arg = {"asm": {k: [v[0], v[1]] for k, v in ASM.items()}, "feed": FEED, "take": TAKE, "keep": KEEP,
                       "hub": HUB_BOX, "hubkeep": HUB_KEEP, "pt": PANEL_TARGET, "at": ACC_TARGET,
                       "mt": 5, "armsup": arms_up, "pcbuilt": pc_built}
                r = ai.lua(FEED_LUA % json.dumps(arg))
                print(time.strftime("%H:%M:%S"), json.dumps({k: (list(v.values()) if isinstance(v, dict) and k not in ("hub", "have") else v)
                                                             for k, v in r.items()}, ensure_ascii=False), flush=True)
            except (RconError, OSError, KeyError, TypeError) as e:
                print(time.strftime("%H:%M:%S"), "오류", str(e)[:200], flush=True)
                ai = None
            if not a.every:
                break
            time.sleep(a.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

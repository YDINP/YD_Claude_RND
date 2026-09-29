"""Lua relay for the run 24 lake assembler row: plates in, products out - every move has a per-item cap.

조립 줄 (p1_24.ASMS) 에는 팔 · 상자 · 벨트가 없다. 이 고리가 «있는 물건만» 옮긴다 (만들지 않는다):

    허브 철판   -> 탄창 · 톱니 · 회로 · 팔 · 벨트 조립기     (조립기 안 철판 ≤ CAP)
    허브 구리판 -> 빨강 1·2 · 전선 조립기
    톱니        -> 빨강 1·2 > 팔 > 벨트 (앞 것부터)
    전선 -> 회로 -> 팔 -> 초록 <- 벨트
    빨강 · 초록 -> 연구소 (연구소마다 팩 ≤ 20)
    전기 쌍 화로 판 -> 허브 (허브 철판 ≤ 2500 · 구리판 ≤ 1500) · 돌 전기 상자 -> 허브 (≤ 400)
    석탄 밭 상자 -> 보일러 (≤ 20) > 석탄 버너 채굴기 > 돌 화로 > 다른 버너 채굴기 (≤ 5)  - fuel_run (golf) 의 걸음을 대신
    탄창        -> 포탑 (모든 포탑, 탄 적은 순, 포탑마다 ≤ 20) -> 남는 것은 허브 탄창 상자 (≤ 200) - 사람 무장용
                   조립기가 비면 허브 탄창 상자에서도 포탑으로 (P2)

허브 판은 RESERVE 만큼 남긴다 (짓는 재료). 23회차 복기 §3-10: 망 · 상자에 넣는 중계는 품목 상한 필수.
23회차 §3-21: 자리가 nil 이면 반경 조회가 지도 전체가 된다 - 자리는 표에서만, 없으면 건너뛴다.
조립기에 레시피가 없고 그 레시피가 열려 있으면 정해 준다 (GUI 에서 고르는 일).

    python scripts/relay24.py --run run24 --once
    python scripts/relay24.py --run run24 --every 10
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402

site = runsite.load()
HX, HY = site["hub"]
HUB_BOX = [HX - 4, HY - 0.6, HX + 7, HY + 0.6]
AMMO_CHEST = [HX, HY]                     # 허브 줄 맨 서쪽 나무 상자 (66.5,-15.5)
LAB_BOX = [-60, -7, -33, 12]            # P2: 조립 줄 북쪽 연구소 6 (y -4.5) 까지
RESERVE = {"iron-plate": 300, "copper-plate": 100, "stone": 100}

# p1_24.ASMS 와 같은 표 (그 모듈을 import 하면 p1 이 따라와 무겁다 - 좌표만)
ASMS = {
    "ammo": [-53.5, 3.5, "firearm-magazine"],
    "gear": [-49.5, 3.5, "iron-gear-wheel"],
    "red1": [-45.5, 3.5, "automation-science-pack"],
    "red2": [-41.5, 3.5, "automation-science-pack"],
    "cable": [-37.5, 3.5, "copper-cable"],
    "circuit": [-53.5, -0.5, "electronic-circuit"],
    "inserter": [-49.5, -0.5, "inserter"],
    "belt": [-45.5, -0.5, "transport-belt"],
    "green": [-41.5, -0.5, "logistic-science-pack"],
    "red3": [-37.5, -0.5, "automation-science-pack"],
    "green2": [-57.5, -0.5, "logistic-science-pack"],
    "green3": [-57.5, 3.5, "logistic-science-pack"],
    "green4": [-33.5, 3.5, "logistic-science-pack"],       # P2 (p2_24 labs3)
    "green5": [-33.5, -4.5, "logistic-science-pack"],
    # 파랑 블록 (p2_24.BLUE) - 레시피는 열리면 자동 (advanced-circuit · chemical-science-pack 연구 뒤)
    "adv1": [-29.5, -4.5, "advanced-circuit"],
    "adv2": [-25.5, -4.5, "advanced-circuit"],
    "eng1": [-21.5, -4.5, "engine-unit"],
    "eng2": [-17.5, -4.5, "engine-unit"],
    "pipe": [-13.5, -4.5, "pipe"],
    "blue1": [-29.5, 3.5, "chemical-science-pack"],
    "blue2": [-25.5, 3.5, "chemical-science-pack"],
    "cable2": [-21.5, 3.5, "copper-cable"],
    "circuit2": [-17.5, 3.5, "electronic-circuit"],
    "gear2": [-13.5, 3.5, "iron-gear-wheel"],
    # P3 (p3_24.BLUE2): 파랑 ≥ 100 · 빨강 ≥ 초록
    "eng3": [-9.5, -4.5, "engine-unit"],
    "eng4": [-5.5, -4.5, "engine-unit"],
    "adv3": [-1.5, -4.5, "advanced-circuit"],
    "blue3": [-9.5, 3.5, "chemical-science-pack"],
    "blue4": [-5.5, 3.5, "chemical-science-pack"],
    "cable3": [-1.5, 3.5, "copper-cable"],
    "red4": [-29.5, 8.5, "automation-science-pack"],
    "red5": [-25.5, 8.5, "automation-science-pack"],
    "gear3": [-21.5, 8.5, "iron-gear-wheel"],
    "adv4": [-17.5, 8.5, "advanced-circuit"],
    "blue5": [-13.5, 8.5, "chemical-science-pack"],
}

# (출처, 품목, 받는 조립기, 상한) - 출처 "hub" 또는 조립기 이름 (그 조립기의 결과칸). 위에서부터 차례로.
FEEDS = [
    ["hub", "iron-plate", "ammo", 40],
    ["hub", "iron-plate", "gear", 40],
    ["hub", "copper-plate", "red1", 10],
    ["hub", "copper-plate", "red2", 10],
    ["gear", "iron-gear-wheel", "red1", 10],
    ["gear", "iron-gear-wheel", "red2", 10],
    ["hub", "copper-plate", "red3", 10],
    ["gear", "iron-gear-wheel", "red3", 10],
    ["hub", "copper-plate", "cable", 30],
    ["cable", "copper-cable", "circuit", 30],
    ["hub", "iron-plate", "circuit", 10],
    ["circuit", "electronic-circuit", "inserter", 10],
    ["gear", "iron-gear-wheel", "inserter", 10],
    ["hub", "iron-plate", "inserter", 10],
    ["gear", "iron-gear-wheel", "belt", 10],
    ["hub", "iron-plate", "belt", 10],
    ["inserter", "inserter", "green", 4],
    ["belt", "transport-belt", "green", 4],
    ["inserter", "inserter", "green2", 4],
    ["belt", "transport-belt", "green2", 4],
    ["inserter", "inserter", "green3", 4],
    ["belt", "transport-belt", "green3", 4],
    ["inserter", "inserter", "green4", 4],
    ["belt", "transport-belt", "green4", 4],
    ["inserter", "inserter", "green5", 4],
    ["belt", "transport-belt", "green5", 4],
    # 파랑 사슬
    ["hub", "copper-plate", "cable2", 30],
    ["hub", "iron-plate", "circuit2", 10],
    ["cable2", "copper-cable", "circuit2", 30],
    ["hub", "iron-plate", "gear2", 40],
    ["hub", "iron-plate", "pipe", 20],
    ["hub", "plastic-bar", "adv1", 10],
    ["hub", "plastic-bar", "adv2", 10],
    ["cable2", "copper-cable", "adv1", 20],
    ["cable2", "copper-cable", "adv2", 20],
    ["circuit2", "electronic-circuit", "adv1", 10],
    ["circuit2", "electronic-circuit", "adv2", 10],
    ["hub", "steel-plate", "eng1", 5],
    ["hub", "steel-plate", "eng2", 5],
    ["gear2", "iron-gear-wheel", "eng1", 5],
    ["gear2", "iron-gear-wheel", "eng2", 5],
    ["pipe", "pipe", "eng1", 10],
    ["pipe", "pipe", "eng2", 10],
    ["eng1", "engine-unit", "blue1", 4],
    ["eng2", "engine-unit", "blue2", 4],
    ["eng1", "engine-unit", "blue2", 4],
    ["eng2", "engine-unit", "blue1", 4],
    ["adv1", "advanced-circuit", "blue1", 6],
    ["adv2", "advanced-circuit", "blue2", 6],
    ["adv1", "advanced-circuit", "blue2", 6],
    ["adv2", "advanced-circuit", "blue1", 6],
    ["hub", "sulfur", "blue1", 4],
    ["hub", "sulfur", "blue2", 4],
]
# P3: 빨강 4 · 5 (톱니 셋째 gear3) · 파랑 3 · 4 · 엔진 3 · 4 · 고급회로 3 · 전선 셋째 - 같은 상한 규칙
FEEDS += [
    ["hub", "iron-plate", "gear3", 40],
    ["hub", "copper-plate", "red4", 10],
    ["hub", "copper-plate", "red5", 10],
    ["gear3", "iron-gear-wheel", "red4", 10],
    ["gear3", "iron-gear-wheel", "red5", 10],
    ["hub", "copper-plate", "cable3", 30],
    ["cable3", "copper-cable", "circuit2", 30],
    ["hub", "plastic-bar", "adv3", 10],
    ["cable3", "copper-cable", "adv3", 20],
    ["cable3", "copper-cable", "adv1", 20],
    ["cable3", "copper-cable", "adv2", 20],
    ["circuit2", "electronic-circuit", "adv3", 10],
    ["hub", "plastic-bar", "adv4", 10],
    ["cable3", "copper-cable", "adv4", 20],
    ["cable2", "copper-cable", "adv4", 20],
    ["circuit2", "electronic-circuit", "adv4", 10],
]
for _e in ("eng3", "eng4"):
    FEEDS += [["hub", "steel-plate", _e, 5], ["gear2", "iron-gear-wheel", _e, 5], ["gear3", "iron-gear-wheel", _e, 5], ["pipe", "pipe", _e, 10]]
for _b in ("blue1", "blue2", "blue3", "blue4", "blue5"):
    FEEDS += [[_e, "engine-unit", _b, 4] for _e in ("eng1", "eng2", "eng3", "eng4")]
    FEEDS += [[_a, "advanced-circuit", _b, 6] for _a in ("adv1", "adv2", "adv3", "adv4")]
    FEEDS.append(["hub", "sulfur", _b, 4])
LAB_CAP = 20
TURRET_CAP = 20
CHEST_CAP = 200
COAL_BOX = [100, -34, 126, -22]
# (이름, x, y, 레시피, 넣을 품목 ("" = 없음), 상한, 꺼낼 품목, 허브 상한) - p2_24 REFINERY · PLASTIC
CHEM = [["oil-refinery", -112.5, 18.5, "basic-oil-processing", "", 0, "", 0],
        ["chemical-plant", -106.5, 13.5, "plastic-bar", "coal", 20, "plastic-bar", 500],
        ["chemical-plant", -102.5, 13.5, "sulfur", "", 0, "sulfur", 300]]           # 석탄 밭 상자 (버너 줄 -24.5 · 전기 줄 -29.5)
BOIL, BURN = 20, 5
# (구역, 판, 허브 상한) - 전기 채굴기가 화로에 바로 붓는 쌍 (P2: 철 버너 줄 자리의 전기 쌍 C (y -54) 까지). 결과칸이 차면 채굴기가 선다 (collect_run 걸음으론 모자람)
PLATES = [[[68, -56, 103, -41], "iron-plate", 2500], [[60, 78, 92, 90], "copper-plate", 1500],
          [[72, -67.5, 96, -64.5], "iron-plate", 2500]]      # P3 철 전기 쌍 E 6 (p3_24.IRONE_XS, 화로 y -66)
# (구역, 품목, 허브 상한) - 전기 채굴기가 붓는 상자 -> 허브 (짓는 재료)
CHESTS = [[[97, -8, 111, -5], "stone", 1500]]      # P2: 400 -> 1500 (벽돌 화로 6 이 허브 돌을 먹는다)
# (구역, 넣을 품목, 화로마다 상한, 꺼낼 품목, 허브 상한) - 벽돌 화로 (p2_24.BRICK_XS, y -9). 벽 (5 벽돌) 재료
SMELT = [[[72.5, -10.5, 85.5, -7.5], "stone", 20, "stone-brick", 1500],
         [[85.5, -10.5, 93.5, -7.5], "iron-plate", 25, "steel-plate", 400],      # 강철 화로 4 (p2_24.STEEL_XS)
         [[72.5, -13.5, 81.5, -10.6], "iron-plate", 25, "steel-plate", 400]]     # P3 강철 화로 4 더 (p3_24.STEEL2_XS, y -12)

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local F = helpers.json_to_table('%s')
  local R = helpers.json_to_table('%s')
  local HB, LB, AC = %s, %s, {%f, %f}
  local out = {moved = {}, miss = {}}
  local function tally(k, n) out.moved[k] = (out.moved[k] or 0) + n end
  local M = {}
  for name, a in pairs(A) do
    local e = s.find_entities_filtered{name = "assembling-machine-1", force = f, position = {a[1], a[2]}, radius = 0.6}[1]
    if e then
      M[name] = e
      if not e.get_recipe() and f.recipes[a[3]] and f.recipes[a[3]].enabled then e.set_recipe(a[3]) end
    else out.miss[#out.miss+1] = name end
  end
  local hubs = s.find_entities_filtered{type = "container", force = f, area = {{HB[1], HB[2]}, {HB[3], HB[4]}}}
  local function hub_take(item, want)
    local got = 0
    for _, c in pairs(hubs) do
      local inv = c.get_inventory(defines.inventory.chest)
      local total = 0
      for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(item) end
      local spare = total - (R[item] or 0)
      if spare <= 0 then break end
      local n = math.min(want - got, inv.get_item_count(item), spare)
      if n > 0 then got = got + inv.remove{name = item, count = n} end
      if got >= want then break end
    end
    return got
  end
  local function hub_give(item, n)
    for _, c in pairs(hubs) do
      local put = c.get_inventory(defines.inventory.chest).insert{name = item, count = n}
      n = n - put
      if n <= 0 then return end
    end
  end
  for _, fd in pairs(F) do
    local src, item, dst, cap = fd[1], fd[2], M[fd[3]], fd[4]
    if dst and dst.get_recipe() then
      local din = dst.get_inventory(defines.inventory.assembling_machine_input)
      local room = cap - din.get_item_count(item)
      if room > 0 then
        if src == "hub" then
          local got = hub_take(item, room)
          if got > 0 then
            local put = din.insert{name = item, count = got}
            if put < got then hub_give(item, got - put) end
            tally(item .. ">" .. fd[3], put)
          end
        elseif M[src] then
          local sout = M[src].get_inventory(defines.inventory.assembling_machine_output)
          local n = math.min(room, sout.get_item_count(item))
          if n > 0 then
            local put = din.insert{name = item, count = n}
            if put > 0 then sout.remove{name = item, count = put}; tally(item .. ">" .. fd[3], put) end
          end
        end
      end
    end
  end
  -- 팩 -> 연구소
  local labs = s.find_entities_filtered{name = "lab", force = f, area = {{LB[1], LB[2]}, {LB[3], LB[4]}}}
  for _, src in pairs({"red1", "red2", "red3", "red4", "red5", "green", "green2", "green3", "green4", "green5", "blue1", "blue2", "blue3", "blue4", "blue5"}) do
    local m = M[src]
    if m and m.get_recipe() then
      local sout = m.get_inventory(defines.inventory.assembling_machine_output)
      local item = m.get_recipe().name
      for _, l in pairs(labs) do
        local lin = l.get_inventory(defines.inventory.lab_input)
        local n = math.min(%d - lin.get_item_count(item), sout.get_item_count(item))
        if n > 0 then
          local put = lin.insert{name = item, count = n}
          if put > 0 then sout.remove{name = item, count = put}; tally(item .. ">lab", put) end
        end
      end
    end
  end
  -- 탄창 -> 포탑 (모든 gun-turret, 좌표 목록 아님) -> 탄창 상자
  -- P2 (20:52 경보: 새 포탑 (72,96)·(80,96) 탄 0): 조립기 결과칸이 비면 허브 탄창 상자 (사람 무장용 ≤ CHEST_CAP) 에서도 포탑으로.
  -- 새 포탑 17 × 20 = 340 이 조립기 한 대 (0.5/s) 보다 빨리 필요했다. 빈 포탑부터 채운다 (탄 적은 순).
  local m = M["ammo"]
  local ch = s.find_entities_filtered{type = "container", force = f, position = AC, radius = 0.6}[1]
  local srcs = {}
  if m then srcs[#srcs+1] = m.get_inventory(defines.inventory.assembling_machine_output) end
  if ch then srcs[#srcs+1] = ch.get_inventory(defines.inventory.chest) end
  local turrets = s.find_entities_filtered{name = "gun-turret", force = f}
  table.sort(turrets, function(a, b)
    return a.get_inventory(defines.inventory.turret_ammo).get_item_count() < b.get_inventory(defines.inventory.turret_ammo).get_item_count() end)
  for _, t in pairs(turrets) do
    local tin = t.get_inventory(defines.inventory.turret_ammo)
    for _, src in pairs(srcs) do
      local n = math.min(%d - tin.get_item_count("firearm-magazine"), src.get_item_count("firearm-magazine"))
      if n > 0 then
        local put = tin.insert{name = "firearm-magazine", count = n}
        if put > 0 then src.remove{name = "firearm-magazine", count = put}; tally("mag>turret", put) end
      end
    end
  end
  if m and ch then
    local sout = m.get_inventory(defines.inventory.assembling_machine_output)
    local cin = ch.get_inventory(defines.inventory.chest)
    local n = math.min(%d - cin.get_item_count("firearm-magazine"), sout.get_item_count("firearm-magazine"))
    if n > 0 then
      local put = cin.insert{name = "firearm-magazine", count = n}
      if put > 0 then sout.remove{name = "firearm-magazine", count = put}; tally("mag>chest", put) end
    end
  end
  -- 판: 전기 제련 쌍의 화로 결과칸 -> 허브 (허브 품목 상한까지)
  for _, pb in pairs(helpers.json_to_table('%s')) do
    local box, item, cap = pb[1], pb[2], pb[3]
    for _, fu in pairs(s.find_entities_filtered{type = "furnace", force = f, area = {{box[1], box[2]}, {box[3], box[4]}}}) do
      local fo = fu.get_inventory(defines.inventory.furnace_result)
      local have = fo.get_item_count(item)
      if have > 0 then
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(item) end
        local n = math.min(have, cap - total)
        if n <= 0 then break end
        local put = 0
        for _, h in pairs(hubs) do
          put = put + h.get_inventory(defines.inventory.chest).insert{name = item, count = n - put}
          if put >= n then break end
        end
        if put > 0 then fo.remove{name = item, count = put}; tally(item .. ">hub", put) end
      end
    end
  end
  -- 상자 -> 허브 (돌)
  for _, cb in pairs(helpers.json_to_table('%s')) do
    local box, item, cap = cb[1], cb[2], cb[3]
    for _, c in pairs(s.find_entities_filtered{type = "container", force = f, area = {{box[1], box[2]}, {box[3], box[4]}}}) do
      local ci = c.get_inventory(defines.inventory.chest)
      local have = ci.get_item_count(item)
      local total = 0
      for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(item) end
      local n = math.min(have, cap - total)
      if n > 0 then
        local put = 0
        for _, h in pairs(hubs) do
          put = put + h.get_inventory(defines.inventory.chest).insert{name = item, count = n - put}
          if put >= n then break end
        end
        if put > 0 then ci.remove{name = item, count = put}; tally(item .. ">hub", put) end
      end
    end
  end
  -- 허브 -> 화로 (재료) · 화로 -> 허브 (결과) - 벽돌
  for _, sm in pairs(helpers.json_to_table('%s')) do
    local box, src, cap, prod, hcap = sm[1], sm[2], sm[3], sm[4], sm[5]
    for _, fu in pairs(s.find_entities_filtered{type = "furnace", force = f, area = {{box[1], box[2]}, {box[3], box[4]}}}) do
      local fin = fu.get_inventory(defines.inventory.furnace_source)
      local room = cap - fin.get_item_count(src)
      if room > 0 then
        local got = hub_take(src, room)
        if got > 0 then
          local put = fin.insert{name = src, count = got}
          if put < got then hub_give(src, got - put) end
          tally(src .. ">smelt", put)
        end
      end
      local fo = fu.get_inventory(defines.inventory.furnace_result)
      local have = fo.get_item_count(prod)
      if have > 0 then
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(prod) end
        local n = math.min(have, hcap - total)
        if n > 0 then
          local put = 0
          for _, h in pairs(hubs) do
            put = put + h.get_inventory(defines.inventory.chest).insert{name = prod, count = n - put}
            if put >= n then break end
          end
          if put > 0 then fo.remove{name = prod, count = put}; tally(prod .. ">hub", put) end
        end
      end
    end
  end
  -- 연료: 석탄 밭 상자 -> 보일러 (≤ BOIL) > 석탄 버너 채굴기 > 화로 > 다른 버너 채굴기 (≤ BURN)
  local CB = %s
  local coal = s.find_entities_filtered{type = "container", force = f, area = {{CB[1], CB[2]}, {CB[3], CB[4]}}}
  local function coal_take(want)
    local got = 0
    for _, c in pairs(coal) do
      local inv = c.get_inventory(defines.inventory.chest)
      local n = math.min(want - got, inv.get_item_count("coal"))
      if n > 0 then got = got + inv.remove{name = "coal", count = n} end
      if got >= want then break end
    end
    return got
  end
  local function coal_back(n)
    for _, c in pairs(coal) do
      n = n - c.get_inventory(defines.inventory.chest).insert{name = "coal", count = n}
      if n <= 0 then return end
    end
  end
  local function fuel(list, cap)
    for _, e in pairs(list) do
      local fi = e.get_fuel_inventory()
      if fi then
        local room = cap - fi.get_item_count("coal")
        if room > 0 then
          local got = coal_take(room)
          if got == 0 then return false end
          local put = fi.insert{name = "coal", count = got}
          if put < got then coal_back(got - put) end
          tally("coal>" .. e.name, put)
        end
      end
    end
    return true
  end
  local inbox = {}
  local others = {}
  for _, d in pairs(s.find_entities_filtered{name = "burner-mining-drill", force = f}) do
    local p = d.position
    if p.x >= CB[1] and p.x <= CB[3] and p.y >= CB[2] and p.y <= CB[4] then inbox[#inbox+1] = d else others[#others+1] = d end
  end
  -- 기름 (P2): 정유 · 화학 공장 레시피 (열려 있으면) · 석탄 → 플라스틱 공장 (≤ CHEM_COAL) · 결과 → 허브 (품목 상한)
  for _, c in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = c[1], force = f, position = {c[2], c[3]}, radius = 0.6}[1]
    if e then
      if not e.get_recipe() and f.recipes[c[4]] and f.recipes[c[4]].enabled then e.set_recipe(c[4]) end
      if e.get_recipe() and c[5] ~= "" then
        local ein = e.get_inventory(defines.inventory.assembling_machine_input)
        local room = c[6] - ein.get_item_count(c[5])
        if room > 0 and c[5] == "coal" then
          local got = coal_take(room)
          if got > 0 then
            local put = ein.insert{name = "coal", count = got}
            if put < got then coal_back(got - put) end
            tally("coal>" .. c[4], put)
          end
        end
      end
      if e.get_recipe() and c[7] ~= "" then
        local eo = e.get_inventory(defines.inventory.assembling_machine_output)
        local have = eo.get_item_count(c[7])
        local total = 0
        for _, h in pairs(hubs) do total = total + h.get_inventory(defines.inventory.chest).get_item_count(c[7]) end
        local n = math.min(have, c[8] - total)
        if n > 0 then
          local put = 0
          for _, h in pairs(hubs) do
            put = put + h.get_inventory(defines.inventory.chest).insert{name = c[7], count = n - put}
            if put >= n then break end
          end
          if put > 0 then eo.remove{name = c[7], count = put}; tally(c[7] .. ">hub", put) end
        end
      end
    end
  end
  local _ = fuel(s.find_entities_filtered{type = "boiler", force = f}, %d)
    and fuel(inbox, %d)
    and fuel(s.find_entities_filtered{name = "stone-furnace", force = f}, %d)
    and fuel(others, %d)
  return out
end)()"""


def blob(v) -> str:
    return json.dumps(v).replace("\\", "\\\\").replace("'", "\\'")


def lua_box(b) -> str:
    return "{%f, %f, %f, %f}" % tuple(b)


def once(ai) -> dict:
    return ai.lua(LUA % (blob(ASMS), blob(FEEDS), blob(RESERVE), lua_box(HUB_BOX), lua_box(LAB_BOX),
                         AMMO_CHEST[0], AMMO_CHEST[1], LAB_CAP, TURRET_CAP, CHEST_CAP,
                         blob(PLATES), blob(CHESTS), blob(SMELT), lua_box(COAL_BOX), blob(CHEM), BOIL, BURN, BURN, BURN))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=10)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai, total, last = None, {}, time.time()
    while True:
        try:
            ai = ai or AIBridge()
            r = once(ai)
            for k, v in (r.get("moved") or {}).items():
                total[k] = total.get(k, 0) + int(v)
            if a.once:
                print(r)
                return 0
            if time.time() - last >= 300:
                miss = r.get("miss") or {}
                miss = list(miss.values()) if isinstance(miss, dict) else miss
                print(f"{time.strftime('%H:%M:%S')} 5분 옮김 {total}" + (f" · 없는 조립기 {miss}" if miss else ""), flush=True)
                total, last = {}, time.time()
        except (RconError, OSError) as e:
            print(f"{time.strftime('%H:%M:%S')} 오류 {e}", flush=True)
            ai = None
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

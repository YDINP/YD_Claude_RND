"""run24 로켓 재료 줄 · 사일로 먹이 · 자동 발사 (2026-09-30 19:0x). 사일로 (110.5,-47.5) 는 18:49 섬, 부품 0.

조리법 실측 (prototypes): 부품 = PU 10 · LDS 10 · 로켓 연료 10 (3 s), 사일로 부품 100 → 한 발 = 각 1000 (생산 모듈 4 = +16 % → ~862).
  PU = 녹색 20 · 고급 2 · 황산 5 (10 s) · LDS = 구리 20 · 강철 2 · 플라스틱 5 (15 s) · 로켓 연료 = 고체 연료 10 · 경유 10 (15 s)
  고체 연료 (경유) = 경유 10 (1 s) - 석유가스로는 20 이라 경유가 두 배 낫다.

줄 (유령 can_place manual → 로봇, 재료는 delta 손제작 → 저장 상자):
  RF  경유 기둥 (x -71.5, y 0.5..8.5) 옆 - RF1 (-69.5,2.5) 북향 (입력 = 관 y 0.5) · 관 y 0.5 (x -70.5..-63.5) →
      RF2 (-67.5,-1.5) 남향 · 고체 연료 화학 SF1 (-64.5,-1.5) 남향 (입력 (-65.5 · -63.5, 0.5)). 결과 팔 → 공급 상자 (칸 제한).
  PU  남쪽 물 줄 (y 31.5) 위 - 황산 화학 C (-29.5,29.5) 남향 (입력 = 물 줄 두 칸) → 관 기둥 x -28.5 (y 21.5..27.5) →
      PU1 (-30.5,25.5) 동향 · PU2 (-30.5,21.5) 동향 · PU3 (-26.5,21.5) 서향. 결과 팔 → 공급 상자.
  LDS 사일로 곁 셋 - (106.5 · 113.5, -40.5) 결과 팔이 사일로에 바로 · (117.5,-47.5) 서쪽 팔로 바로.
먹이 (로봇 요청 - robofeed24 LUA 재사용, 물건은 로봇이 망에서 날라 넣음): 황산 C 황 · 철 / PU 녹색 · 고급 / LDS 구리 · 강철 · 플라스틱 / RF 고체 연료.
  과학 먼저: 고급 남김 1500 · 녹색 남김 600 · 플라스틱 남김 100 (고급 조립기 남김 20 이 먼저).
사일로: 부품 재료 셋 요청 (한 요청에 PU 60 · LDS 40 · RF 20 까지) + 생산 모듈 4. 로켓 준비되면 발사 (run23 사용자 결정 «준비되면 자동»).
경유 분해 (-79.5,4.5): 석유가스 탱크 > 8000 이면 active=false (경유를 로켓 연료로), < 4000 이면 다시 켬.
고체 연료 화학 SF1: 망 고체 연료 > 3000 이면 쉼 (경유를 RF 가 쓰게).

    python scripts/rocketfab24.py check|ghosts|kit|config|status|release
    python -u scripts/rocketfab24.py loop --every 30        # 상주 (먹이 · 사일로 · 발사 · 분해 조절)
Lua 아이템 이동 0.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge, RconError  # noqa: E402
import p7_24  # noqa: E402
import purple24  # noqa: E402
import robofeed24  # noqa: E402

N, E, S, W = 0, 4, 8, 12            # 조립기 = 입력 관 쪽 / 팔 = 집는 쪽
WHO, OWNER = "delta", "rocketfab24"
STORE, ADV_BOX = purple24.STORE, purple24.ADV_BOX
A2, CP, INS, PP, POLE, PIPE = "assembling-machine-2", "chemical-plant", "inserter", "passive-provider-chest", "medium-electric-pole", "pipe"

# (이름, x, y, 방향, 조리법)
MACH = [
    # 20:5x RF 둘은 3 형으로 올림 (rocketpush24 upgrade) - 유령 · config 이름도 3 형
    ("assembling-machine-3", -69.5, 2.5, N, "rocket-fuel"), ("assembling-machine-3", -67.5, -1.5, S, "rocket-fuel"), (CP, -64.5, -1.5, S, "solid-fuel-from-light-oil"),
    (CP, -29.5, 29.5, S, "sulfuric-acid"),
    (A2, -30.5, 25.5, E, "processing-unit"), (A2, -30.5, 21.5, E, "processing-unit"), (A2, -26.5, 21.5, W, "processing-unit"),
    (A2, 106.5, -40.5, N, "low-density-structure"), (A2, 113.5, -40.5, N, "low-density-structure"), (A2, 117.5, -47.5, N, "low-density-structure"),
]
# (팔 x, y, 방향, 상자 x, y | None, 칸 제한)
OUT = [
    (-67.5, 2.5, W, -66.5, 2.5, 20),     # RF1 → 상자 (RF 20 × 5 = 100) - 20:5x 5 → 20 칸: 상자 100 이 차 RF1 full_output (RF 가 PU 를 기다리며 쉼)
    (-67.5, -3.5, S, -67.5, -4.5, 20),   # RF2
    (-63.5, -3.5, S, -63.5, -4.5, 20),   # SF1 (고체 연료 50 × 10) - 20:5x 10 → 20 칸 (상자 448/500 에 SF1 이 설 뻔)
    (-31.5, 27.5, N, -31.5, 28.5, 2),    # PU1 (PU 100 × 2)
    (-30.5, 19.5, S, -30.5, 18.5, 2),    # PU2
    (-26.5, 19.5, S, -26.5, 18.5, 2),    # PU3
    (106.5, -42.5, S, None, None, 0),    # LDS → 사일로
    (113.5, -42.5, S, None, None, 0),
    (115.5, -47.5, E, None, None, 0),
]
PIPES = [(x + 0.5, 0.5) for x in range(-71, -63)] + [(-28.5, y + 0.5) for y in range(21, 28)] + [(-30.5, 27.5), (-29.5, 27.5)]
POLES = [(-66.5, -4.5), (-66.5, 1.5), (-32.5, 27.5), (-31.5, 19.5), (116.5, -45.5)]

G = [(n, x, y, d) for n, x, y, d, _r in MACH]
for ix, iy, d, cx, cy, _b in OUT:
    G.append((INS, ix, iy, d))
    if cx is not None:
        G.append((PP, cx, cy, N))
G += [(PIPE, x, y, N) for x, y in PIPES] + [(POLE, x, y, N) for x, y in POLES]

# 로봇 요청 먹이 (robofeed24 형식: x, y, 품목, 이 밑이면, 요청 수, 망 남김)
ADV_KEEP_PU, GREEN_KEEP_PU, PLASTIC_KEEP, SF_KEEP = 800, 600, 100, 300   # 19:5x 고급 1500 → 800 (망 고급 976 이라 PU 굶음, 고급 10분 ~380)
# 20:5x 로켓 1 호 밀기 (코디네이터 «로켓 > 과학»): 발사 전 (force.rockets_launched == 0) 에는 PU 녹색 남김 600 → 100 · 고급 800 → 200.
#   새 PU 셋이 녹색 40 · 고급 0 으로 굶었다 (망 녹색 807 · 고급 700 이 남김 밑). 첫 발사 뒤 저절로 옛 값으로 돌아간다.
PUSH_GREEN_KEEP_PU, PUSH_ADV_KEEP_PU = 100, 200


def feed_list(push):
    g, a = (PUSH_GREEN_KEEP_PU, PUSH_ADV_KEEP_PU) if push else (GREEN_KEEP_PU, ADV_KEEP_PU)
    out = [(-29.5, 29.5, "sulfur", 10, 30, 100), (-29.5, 29.5, "iron-plate", 3, 6, robofeed24.SCI_IRON_KEEP)]
    for _n, _x, _y, _d, _r in MACH:
        if _r == "processing-unit":
            out += [(_x, _y, "electronic-circuit", 40, 100, g), (_x, _y, "advanced-circuit", 6, 12, a)]   # 20:5x 녹색 20 밑 60 → 40 밑 100 (PU 0.75 = 녹색 1.5/s = 30 s 고리에 45)
        elif _r == "low-density-structure":
            out += [(_x, _y, "copper-plate", 40, 100, 300), (_x, _y, "steel-plate", 6, 16, 1500), (_x, _y, "plastic-bar", 15, 40, PLASTIC_KEEP)]   # 19:5x 한 번에 5 번 몫
        elif _r == "rocket-fuel":
            out += [(_x, _y, "solid-fuel", 20, 50, SF_KEEP)]   # 19:5x 속도 모듈 2 → 4.2/분 = SF 42/분: 30 씩 30 s 고리로는 모자람
    return out


FEED = feed_list(False)
SILO = (110.5, -47.5)
SILO_REQ = {"processing-unit": (30, 60), "low-density-structure": (20, 40), "rocket-fuel": (30, 60)}   # 이 밑이면 · 요청 수
# 21:1x RF 10 밑 20 → 30 밑 60: RF 상자 (-66,2) → 사일로 ~185 칸 비행 + 요청은 한 번에 하나 (busy) 라 20 씩이면 ~17/분 상한 (RF 3 형 14/분과 붙음, 부품 1/분)
MODULE = "productivity-module"
CRACK, PG_TANK, PG_HI, PG_LO = (-79.5, 4.5), (-74.5, 11.5), 8000, 4000
SF1, SF_HI, SF_LO = (-64.5, -1.5), 3000, 1500

# 기름 몫 (19:3x oil24): 원유 40.6/s = 정유 두 대 몫인데 넷이 나눠 모두 반만 돌았다 (각 6~7 번/분, 최대 12).
#   기본 정유 R1 · R3 (서쪽 가스 줄 → 플라스틱 1 · 황 1) 을 쉬게 해 고급 R2 · R4 가 원유를 다 받게 한다.
#   R2 · R4 둘 다 원유가 넘치면 (입력 ≥ OIL_SURPLUS) R3 를 다시 켠다 (< OIL_LOW 면 끔). 사람 손 · 아이템 이동 없음 - active 만.
# 석유가스 먹는 것: 황 (망 황 > 1500 이면 쉼, < 700 이면 켬) · 고체 연료(가스) (가스 탱크 > 12000 이면 켬, < 6000 이면 쉼).
# 경유 분해: 경유 탱크 > 10000 (남는 경유) 이거나 가스 탱크 < 500 이면서 경유 탱크 > 4000 일 때만 켬 - 경유는 로켓 연료 몫.
# 19:4x oil24: R2 에 속도 모듈 3 (원유 32/s 받이) → 원유 40.6 으로는 R2 + R4 (20) 가 다 못 돈다.
#   R2 가 먼저: R2 원유 입력 (칸 200) < OIL_LOW 이면 켜진 둘째 정유 중 맨 뒤 하나를 끄고, R2 와 켜진 것 모두 ≥ OIL_SURPLUS 면 다음 하나를 켠다 (한 번에 하나).
REF_MAIN = [(-87.5, 8.5)]                                             # R2 (고급, 속도 3)
REF_BASIC = [(-90.5, 21.5), (-119.5, 18.5), (-112.5, 18.5)]           # R4 · R3 · R1 (켜는 순서)
OIL_SURPLUS, OIL_LOW = 190, 140     # 칸 200: 속도 3 인 R2 가 다 받으면 늘 190+ (19:5x 실측 60~170 사이에 머물러 R3 까지 켜진 채 R2 8 번/분)
LO_TANK, LO_HI, LO_KEEP, PG_CRIT = (-68.5, 9.5), 10000, 2000, 500
SULFUR = [(-75.5, 4.5), (-102.5, 13.5)]
S_HI, S_LO = 1000, 500          # 20:2x 1500 → 1000: 가스는 플라스틱 (LDS) 먼저
SF_GAS, SFG_ON, SFG_OFF = (-89.5, 15.5), 12000, 6000

LUA_OIL = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local o = {}
  local function one(name, p) return s.find_entities_filtered{name = name, force = f, position = p, radius = 0.5}[1] end
  local function tank(p) local t = one('storage-tank', p) local x = t and t.fluidbox[1] return x and x.amount or 0 end
  local function crude(e) local m = 0 for i = 1, #e.fluidbox do local x = e.fluidbox[i] if x and x.name == 'crude-oil' then m = x.amount end end return m end
  local pg, lo = tank(A.pg_tank), tank(A.lo_tank)
  o.pg, o.lo = math.floor(pg), math.floor(lo)
  local minc = 1e9
  o.main = {}
  for _, p in pairs(A.main) do local e = one('oil-refinery', p) if e then local c = crude(e) o.main[#o.main + 1] = math.floor(c) if c < minc then minc = c end end end
  local sec, lastOn, firstOff, allFull = {}, nil, nil, minc >= A.surplus
  for i, p in pairs(A.basic) do
    local e = one('oil-refinery', p)
    if e then
      sec[i] = e
      if e.active then lastOn = i if crude(e) < A.surplus then allFull = false end elseif not firstOff then firstOff = i end
    end
  end
  if minc < A.low and lastOn then sec[lastOn].active = false o.ref = 'off ' .. lastOn
  elseif allFull and firstOff then sec[firstOff].active = true o.ref = 'on ' .. firstOff end
  o.basic = {}
  for i = 1, #A.basic do o.basic[i] = sec[i] and sec[i].active or false end
  local ck = one('chemical-plant', A.crack)
  if ck then
    local want = ck.active
    if lo > A.lo_hi or (pg < A.pg_crit and lo > 2 * A.lo_keep) then want = true
    elseif lo < A.lo_keep or pg > A.pg_hi then want = false end
    ck.active = want o.crack = want
  end
  local net = s.find_logistic_network_by_position({66.5, -15.5}, f)
  local su = net and net.get_item_count('sulfur') or 0
  o.sulfur_net, o.sulfur = su, {}
  for _, p in pairs(A.sulfur) do local e = one('chemical-plant', p)
    if e then if su > A.s_hi then e.active = false elseif su < A.s_lo then e.active = true end o.sulfur[#o.sulfur + 1] = e.active end end
  local g = one('chemical-plant', A.sf_gas)
  if g then if pg > A.sfg_on then g.active = true elseif pg < A.sfg_off then g.active = false end o.sf_gas = g.active end
  return o end)()"""


# 20:5x 밀기: 경유 10분 생산 10.2k · 씀 5.5k (RF 조립기 둘이 상한) - 처음엔 남는 경유를 분해해 가스 → 플라스틱 (4000 켬 · 2500 끔).
#   20:55 노랑 LDS 상자 1,150 손 운반으로 LDS 는 한 발 몫이 찼고 RF 가 마지막 벽 (경유 탱크 7.3k → 2.8k) → 발사 전에는 분해를 거의 끔 (12000 켬 · 6000 끔).
PUSH_LO_HI, PUSH_LO_KEEP = 12000, 6000
# 20:5x 밀기: 황 둘이 가스를 먹는다 (망 황 826 에서 둘 다 켜짐, 가스 탱크 55) - 발사 전에는 황 400 넘으면 쉼 · 200 밑이면 켬 (PU 황산 몫은 PU 하나에 황 0.5)
PUSH_S_HI, PUSH_S_LO = 400, 200


def push_on(ai):
    return int(ai.lua("(function() return {n = game.forces.player.rockets_launched} end)()").get("n", 0)) == 0


def oil(ai, push=None):
    push = push_on(ai) if push is None else push
    return ai.lua(LUA_OIL % json.dumps({"pg_tank": list(PG_TANK), "lo_tank": list(LO_TANK), "main": REF_MAIN, "basic": REF_BASIC,
                                        "surplus": OIL_SURPLUS, "low": OIL_LOW, "crack": list(CRACK),
                                        "lo_hi": PUSH_LO_HI if push else LO_HI, "lo_keep": PUSH_LO_KEEP if push else LO_KEEP,
                                        "pg_crit": PG_CRIT, "pg_hi": PG_HI, "sulfur": SULFUR, "s_hi": PUSH_S_HI if push else S_HI, "s_lo": PUSH_S_LO if push else S_LO,
                                        "sf_gas": list(SF_GAS), "sfg_on": SFG_ON, "sfg_off": SFG_OFF}))

LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {}
  for _, q in pairs(A.box) do
    local e = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    if e then e.get_inventory(defines.inventory.chest).set_bar(q[3] + 1) out[#out + 1] = 'bar ' .. q[1] .. ',' .. q[2]
    else out[#out + 1] = 'nobox ' .. q[1] .. ',' .. q[2] end
  end
  for _, q in pairs(A.mach) do
    local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
    if not e then out[#out + 1] = 'none ' .. q[5] .. '@' .. q[2] .. ',' .. q[3]
    else
      local r = e.get_recipe()
      if r and r.name == q[5] then out[#out + 1] = 'ok ' .. q[5] .. '@' .. q[2]
      elseif e.get_output_inventory().is_empty() and e.get_inventory(defines.inventory.assembling_machine_input).is_empty() then
        e.set_recipe(q[5]) out[#out + 1] = 'set ' .. q[5] .. '@' .. q[2] .. ',' .. q[3]
      else out[#out + 1] = 'busy ' .. q[2] end
      -- 19:1x 실측: 조리법 없는 조립기 유령은 방향을 버린다 (d0 으로 섬) → 유체 조리법을 넣은 뒤 방향을 다시 (관 입력 쪽)
      if e.direction ~= q[4] and pcall(function() e.direction = q[4] end) then out[#out + 1] = 'dir ' .. q[4] .. '@' .. q[2] .. ',' .. q[3] end
    end
  end
  return out end)()"""

LUA_SILO = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local o = {}
  local si = s.find_entities_filtered{name = 'rocket-silo', force = f, position = A.silo, radius = 0.5}[1]
  if not si then return {silo = 'none'} end
  local net = s.find_logistic_networks_by_construction_area(si.position, f)[1]
  local inp = si.get_inventory(defines.inventory.rocket_silo_input)
  local mods = si.get_module_inventory()
  o.parts, o.status = si.rocket_parts, si.status
  o.have = {}
  local busy = s.count_entities_filtered{name = 'item-request-proxy', position = si.position, radius = 1} > 0
  if not busy and net then
    local req = {}
    local idx = {['processing-unit'] = 0, ['low-density-structure'] = 1, ['rocket-fuel'] = 2}
    for k, i in pairs(si.get_recipe().ingredients) do idx[i.name] = k - 1 end
    for name, q in pairs(A.req) do
      local h = inp.get_item_count(name) o.have[name] = h
      local n = math.min(q[2], net.get_item_count(name))
      if h < q[1] and n > 0 then req[#req + 1] = {id = {name = name}, items = {in_inventory = {{inventory = defines.inventory.rocket_silo_input, stack = idx[name], count = n}}}} end
    end
    local free = mods.count_empty_stacks()
    if free > 0 and net.get_item_count(A.module) >= free then
      local slots = {}
      for i = 1, #mods do if not mods[i].valid_for_read then slots[#slots + 1] = {inventory = defines.inventory.rocket_silo_modules, stack = i - 1, count = 1} end end
      req[#req + 1] = {id = {name = A.module}, items = {in_inventory = slots}}
    end
    if #req > 0 then
      s.create_entity{name = 'item-request-proxy', position = si.position, force = f, target = si, modules = req}
      o.req = #req
    end
  else
    for _, name in pairs({'processing-unit', 'low-density-structure', 'rocket-fuel'}) do o.have[name] = inp.get_item_count(name) end
    o.busy = busy
  end
  o.modules = mods.get_item_count(A.module)
  -- 준비되면 발사
  if si.rocket_silo_status == defines.rocket_silo_status.rocket_ready and si.launch_rocket() then
    o.launched = true
    game.print('[AI] 로켓 발사 - 누적 ' .. (f.rockets_launched + 1))
  end
  o.total = f.rockets_launched
  -- 경유 분해: 석유가스 탱크가 차 있으면 쉰다
  local tank = s.find_entities_filtered{name = 'storage-tank', force = f, position = A.pg_tank, radius = 0.5}[1]
  local pg = tank and tank.fluidbox[1] and tank.fluidbox[1].amount or 0
  local ck = s.find_entities_filtered{name = 'chemical-plant', force = f, position = A.crack, radius = 0.5}[1]
  if ck then o.crack_active = ck.active end   -- 켜고 끄기는 LUA_OIL (19:3x)
  o.pg = math.floor(pg)
  local sf = s.find_entities_filtered{name = 'chemical-plant', force = f, position = A.sf1, radius = 0.5}[1]
  local nsf = net and net.get_item_count('solid-fuel') or 0
  if sf then
    if nsf > A.sf_hi and sf.active then sf.active = false elseif nsf < A.sf_lo and not sf.active then sf.active = true end
    o.sf1_active = sf.active
  end
  o.net = {}
  for _, k in pairs({'processing-unit', 'low-density-structure', 'rocket-fuel', 'solid-fuel', 'plastic-bar', 'advanced-circuit', 'electronic-circuit'}) do
    o.net[k] = net and net.get_item_count(k) or -1 end
  return o end)()"""


def place(ai, make):
    return ai.lua(purple24.LUA_PLACE % ("true" if make else "false", json.dumps([list(g) for g in G])))


def config(ai):
    return ai.lua(LUA_CONFIG % json.dumps({"box": [[cx, cy, b] for _i, _j, _d, cx, cy, b in OUT if cx is not None],
                                           "mach": [list(m) for m in MACH]}))


def need(ai):
    """유령 수 vs 망 재고."""
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f) local o = {}
      for _, k in pairs({'%s', '%s', '%s', '%s', '%s', '%s'}) do
        o[k] = {net = n.get_item_count(k), ghosts = s.count_entities_filtered{ghost_name = k, force = f}} end
      return o end)()""" % (A2, CP, INS, PP, POLE, PIPE))


def kit(ai, a2=None, ins=None, pp=None, pipes=None):
    """delta: 허브 철 · 강철 · 전선 + 고급 → 녹색 · 톱니 · 조립기 1 → 2 · 팔 · 강철 상자 → 공급 상자 · 관 → 저장 상자."""
    from orders import submit
    a2 = sum(1 for m in MACH if m[0] == A2) if a2 is None else a2
    ins = len(OUT) if ins is None else ins
    pp = sum(1 for o in OUT if o[3] is not None) if pp is None else pp
    pipes = len(PIPES) if pipes is None else pipes
    green = 6 * a2 + ins + 3 * pp + 2
    iron = 29 * a2 + 3 * ins + green + pipes + 4
    detached.mark([WHO], OWNER, minutes=25)
    plan = [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
            ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": pp})]
    plan += p7_24.take_plan(ai, {"steel-plate": 2 * a2 + 8 * pp + 4, "copper-cable": 3 * green + 6, "iron-plate": iron},
                            {"steel-plate": 500, "copper-cable": 500, "iron-plate": 300})
    plan += [("craft", {"recipe": "electronic-circuit", "count": green, "wait": "block"}),
             ("craft", {"recipe": "iron-gear-wheel", "count": 10 * a2 + ins, "wait": "block"}),
             ("craft", {"recipe": "assembling-machine-1", "count": a2, "wait": "block"}),
             ("craft", {"recipe": A2, "count": a2, "wait": "block"}),
             ("craft", {"recipe": INS, "count": ins, "wait": "block"}),
             ("craft", {"recipe": "steel-chest", "count": pp, "wait": "block"}),
             ("craft", {"recipe": PP, "count": pp, "wait": "block"}),
             ("craft", {"recipe": PIPE, "count": pipes, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": A2, "x": STORE[0], "y": STORE[1], "count": a2}),
             ("insert", {"name": INS, "x": STORE[0], "y": STORE[1], "count": ins}),
             ("insert", {"name": PP, "x": STORE[0], "y": STORE[1], "count": pp}),
             ("insert", {"name": PIPE, "x": STORE[0], "y": STORE[1], "count": pipes})]
    plan = [p for p in plan if p[1].get("count", 1) > 0]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "a2": a2, "ins": ins, "pp": pp, "pipes": pipes, "green": green, "iron": iron}


def silo(ai):
    return ai.lua(LUA_SILO % json.dumps({"silo": list(SILO), "req": {k: list(v) for k, v in SILO_REQ.items()}, "module": MODULE,
                                         "crack": list(CRACK), "pg_tank": list(PG_TANK), "pg_hi": PG_HI, "pg_lo": PG_LO,
                                         "sf1": list(SF1), "sf_hi": SF_HI, "sf_lo": SF_LO}))


def feed(ai, push=None):
    push = push_on(ai) if push is None else push
    arg = json.dumps({"feed": feed_list(push), "max": 30, "robot_cap": 0, "yellow": [0, 0], "sci": [], "paused": False,
                      "bal_on": 10 ** 9, "bal_off": -1})
    return ai.lua(robofeed24.LUA % arg)


def status(ai):
    o = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end
      local A = helpers.json_to_table('%s') local o = {mach = {}}
      for _, q in pairs(A) do local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
        o.mach[#o.mach + 1] = q[5] .. '@' .. q[2] .. ',' .. q[3] .. ' ' .. (e and (stn[e.status] or '?') or 'none') end
      local st = f.get_item_production_statistics(s) local P = defines.flow_precision_index.ten_minutes
      o.p10 = {}
      for _, k in pairs({'processing-unit', 'low-density-structure', 'rocket-fuel', 'solid-fuel', 'plastic-bar', 'advanced-circuit', 'rocket-part'}) do
        o.p10[k] = math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}) end
      o.tick = game.tick
      return o end)()""" % json.dumps([list(m) for m in MACH]))
    o["silo"] = silo(ai)
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", nargs="?", default="check")
    ap.add_argument("--every", type=int, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    if a.step == "release":
        detached.release([WHO])
        print("released")
        return
    if a.step == "loop":
        while True:
            try:
                push = push_on(ai)
                r = {"silo": silo(ai), "feed": feed(ai, push), "oil": oil(ai, push)}
                f = r["feed"]
                print(time.strftime("%H:%M:%S"), json.dumps({"silo": r["silo"], "req": list((f.get("req") or {}).values()) if isinstance(f.get("req"), dict) else f.get("req"),
                                                             "short": len(f.get("short") or []), "miss": len(f.get("miss") or []), "oil": r["oil"]}, ensure_ascii=False), flush=True)
            except (RconError, OSError) as e:
                print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
                ai = AIBridge()
            time.sleep(a.every)
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "need": need, "kit": kit,
          "config": config, "status": status, "silo": silo, "feed": feed, "oil": oil}[a.step]
    print(json.dumps(fn(ai), ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

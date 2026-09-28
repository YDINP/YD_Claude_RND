"""보라팩 요청 상자 블록 + 물류 로봇 (로켓 계획 P4, 사용자 결정 09-29: 요청 상자 + 물류 로봇).

조사 (tick ~20.79M):
  * 물류 로봇 0 · 요청/공급 상자 레시피는 전부 열림 (logistic-system 완료). 망 2 에 조립기 · 고급회로 · 녹색회로 · 강철상자 0.
  * 옛 보라 블록 (-94..-80, -83) 은 rebuild23 0-5 가 투입 팔 13 개를 물류망 조건 (iron-plate > 2e9) 으로 꺼 둔 상태 -> 10 분 0.
    그 앞 고급회로 · 생산 모듈 벨트 (x=-68.5 북행 -> y=-79.5 서행, 1 번 레인 모듈 · 2 번 레인 고급회로) 에 고급회로 ~470 · 모듈 ~130 이 막혀 있다.
  * 돌 벨트 끝 (-92.5,-86.5) 도 막힘 (채굴기 waiting_for_space). 벽돌 화로 (-63,-97)(-60,-97) 연료 0.
  * 프레임 10 분 22 (전기엔진이 병목), 노랑이 25 를 원함 -> 로봇 몫은 프레임 생산의 절반까지 (장부).

하는 일
  maker  : 건설 로봇 조립기 (-29.5,-83.5, robots23 소유 -> 이 스크립트가 이어받음) 를 다목적 제작기로:
           건설 로봇 < 150 이면 건설 로봇 -> 블록 자재 (요청/공급 상자 · 조립기2, 중간재 강철상자 · 조립기1 · 톱니) -> 물류 로봇 100.
           재료는 망 2 재고만 (철 3000 · 강철 1500 남김). 프레임은 F1 (8.5,3.5) · F2 (25.5,-8.5) 출력에서 장부 몫만.
  relay  : 30 초마다 기존 아이템만 옮김 (품목 상한):
           EC  망 녹색회로 < 40 이면 꽉 찬 녹색회로 벨트에서 40 까지
           AC  망 고급회로 < 60 이면 보라 고급회로 벨트 (x=-68.5 · y=-79.5) 에서 60 까지 (탭 상자가 서면 거의 안 움직임)
           PSP 망 보라 -> 연구소 (4 미만이면 6 까지)
           BF  망 석탄 (300 남김) -> 벽돌 화로 연료 (5 미만이면 10 까지)
           ST  막힌 돌 레인 (+ 망 벽돌 넉넉할 때 화로 돌 벨트) -> 레일 요청 상자 40 · 옛 레일 조립기 12, 망 강철 -> 옛 레일 조립기
           (09-28 19:xx 추가) ST 레일 돌 · 강철, ACB 고급회로 블록 요청 상자 보충, 황산 공장 철 · F1 강철 · 전기엔진 녹색회로,
           노랑 Y 출력 20 초과분 -> 망 (< 1500) · 망 노랑 -> 연구소
  P5     : 고급회로 블록 (x -2..34, y -99..-82) - AC 조립기2 7 · 구리선 조립기1 8 · 녹색 조립기2 2 (AC_DESIGN, DESIGN 에 합침)
  PU     : (09-28 20:xx) 처리장치 조립기2 +3 (황산 관 연장, delta-trap 구역 로봇 유령) · 저밀도 칸 1 (PU_DESIGN) - 먹이는 pu23.py
  build  : 유령 (멱등) + 다 지어진 뒤 레시피 · 요청 · 상자 칸 제한 설정, 옛 보라 투입 팔 13 물류망 조건 해제 (필터 그대로).

블록 (망 2 로보포트 (-87,-76) 범위, 기지 벽 안)
  남쪽 세로 칸 4 (x -103..-91, y -78..-72): [요청 -> 팔 -> 조립기2 -> 팔 -> 공급]
     S1 (-101.5) 보라 · S2 (-98.5) 보라 · S3 (-95.5) 생산 모듈 · S4 (-92.5) 전기로
  북쪽 가로 칸 2 (x -102..-96): N1 (y -86.5) 레일 · N2 (y -83.5) 쇠막대
  옛 블록: R_F 요청 (-96.5,-81.5) -> 옛 전기로 조립기 / R_P 요청 (-90.5,-78.5) -> 긴팔 -> 옛 보라 (모듈)
  탭: 돌 벨트 끝 -> 공급 (-94.5,-86.5) / 고급회로 · 모듈 벨트 (-68.5,-75.5) -> 공급 (-70.5,-75.5)
  출력은 전부 공급 (passive) 상자 + 칸 제한 -> 저장 상자로 흘러가지 않는다 (망 가득 = 로봇 정지 방지).

    python -u scripts/purple23.py plan       # 유령 자리 점검만
    python -u scripts/purple23.py status
    nohup python -u scripts/purple23.py run >> state/purple23.log 2>&1 &
"""
import argparse
import json
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "..", "state", "purple23.json")

MAKER = (-29.5, -83.5)
FRAME_SRC = [(8.5, 3.5), (25.5, -8.5)]
CON_TARGET = 150
LOGI_TARGET = 100
FRAME_SHARE = 0.5          # 프레임 생산 중 로봇 몫 상한 (노랑 절반 이상)

N_, E_, S_, W_ = 0, 4, 8, 12
PSP, PM, EF = "production-science-pack", "productivity-module", "electric-furnace"
REQ = {
    PSP: {"rail": 60, EF: 2, PM: 2},
    PM: {"electronic-circuit": 10, "advanced-circuit": 10},
    EF: {"steel-plate": 20, "advanced-circuit": 10, "stone-brick": 20},
    "rail": {"steel-plate": 30, "stone": 30, "iron-stick": 30},
    "iron-stick": {"iron-plate": 20},
}
BAR = {PSP: 2, PM: 1, EF: 1, "rail": 3, "iron-stick": 2}

DESIGN = []  # [name, x, y, dir, recipe|None, requests|None, bar|None]
for cx, rc in [(-101.5, PSP), (-98.5, PSP), (-95.5, PM), (-92.5, EF)]:
    DESIGN += [["requester-chest", cx, -77.5, 0, None, REQ[rc], None],
               ["inserter", cx, -76.5, N_, None, None, None],
               ["assembling-machine-2", cx, -74.5, 0, rc, None, None],
               ["inserter", cx, -72.5, N_, None, None, None],
               ["passive-provider-chest", cx, -71.5, 0, None, None, BAR[rc]],
               ["small-electric-pole", cx - 1, -77.5, 0, None, None, None],
               ["small-electric-pole", cx - 1, -71.5, 0, None, None, None]]
for cy, rc in [(-86.5, "rail"), (-83.5, "iron-stick")]:
    ins = "fast-inserter" if rc == "rail" else "inserter"   # 레일 조립기2 = 재료 4.5/s · 레일 3/s -> 보통 팔 (1.7/s) 로는 모자람
    DESIGN += [["requester-chest", -101.5, cy, 0, None, REQ[rc], None],
               [ins, -100.5, cy, W_, None, None, None],
               ["assembling-machine-2", -98.5, cy, 0, rc, None, None],
               [ins, -96.5, cy, W_, None, None, None],
               ["passive-provider-chest", -95.5, cy, 0, None, None, BAR[rc]]]
DESIGN += [["small-electric-pole", -95.5, -85.5, 0, None, None, None],
           ["small-electric-pole", -101.5, -84.5, 0, None, None, None],
           # R_F 옛 전기로 조립기 (-93.5,-82.5)
           ["small-electric-pole", -97.5, -81.5, 0, None, None, None],
           ["requester-chest", -96.5, -81.5, 0, None, {"advanced-circuit": 10, "stone-brick": 20, "steel-plate": 20}, None],
           ["inserter", -95.5, -81.5, W_, None, None, None],
           # R_P 옛 보라 (-89.5,-82.5): 긴팔이 남쪽 2 칸 상자에서
           ["requester-chest", -90.5, -78.5, 0, None, {PM: 3}, None],
           ["long-handed-inserter", -90.5, -80.5, S_, None, None, None],
           # 탭: 돌 벨트 끝 -> 공급, 고급회로 · 모듈 벨트 -> 공급
           ["passive-provider-chest", -94.5, -86.5, 0, None, None, 10],
           ["inserter", -93.5, -86.5, E_, None, None, None],
           ["small-electric-pole", -70.5, -76.5, 0, None, None, None],
           ["passive-provider-chest", -70.5, -75.5, 0, None, None, 6],
           ["inserter", -69.5, -75.5, E_, None, None, None]]

# ---- P5 고급회로 블록 (09-28 19:xx, 빈 땅 x -2..34 · y -99..-82, 로보포트 (10,-80) · 저장 (12.5,-79.5) 옆, 벽 y=-112 안)
# 고급회로 10 분 ~400 (망 0) -> 조립기2 +7 (계획 P5). 구리선은 옆 조립기1 에서 직접 넣기 (로봇 짐 줄임), 녹색회로는 녹색 칸 2 (조립기2) 가 만들어 망으로.
#   1 줄 (y0=-94.5) 쌍 칸 3: [AC] <- 구리선(AM1) -> [AC], 위 요청 (AC: 녹색 · 플라스틱 / 구리선: 구리), 아래 공급 (AC, 칸 2)
#   2 줄 (y0=-86.5) 녹색 칸 2: 구리선(AM1) -> 녹색(AM2) <- 구리선(AM1), 위 요청 (구리 · 철 · 구리), 아래 공급 (녹색, 칸 1) + 홑 칸 1 [AC] <- 구리선
AC, CC, GC = "advanced-circuit", "copper-cable", "electronic-circuit"
REQ_AC = {GC: 20, "plastic-bar": 20}
AC_DESIGN = [["small-electric-pole", -1.5, -97.5, 0, None, None, None]]


def _poles(x0, y0, xs):
    return [["small-electric-pole", x0 + dx, y0 + dy, 0, None, None, None] for dx in xs for dy in (-2, 2)]


def _cell(x, y0, rc, req, am="assembling-machine-2", out_bar=None):
    d = [["requester-chest", x, y0 - 3, 0, None, req, None], ["inserter", x, y0 - 2, N_, None, None, None],
         [am, x, y0, 0, rc, None, None]]
    if out_bar:
        d += [["inserter", x, y0 + 2, N_, None, None, None], ["passive-provider-chest", x, y0 + 3, 0, None, None, out_bar]]
    return d


for x0 in (0, 11, 22):                      # 1 줄 쌍 칸
    y0 = -94.5
    AC_DESIGN += _cell(x0 + 1.5, y0, AC, REQ_AC, out_bar=2) + _cell(x0 + 5.5, y0, CC, {"copper-plate": 30}, am="assembling-machine-1")         + _cell(x0 + 9.5, y0, AC, REQ_AC, out_bar=2)         + [["inserter", x0 + 3.5, y0, E_, None, None, None], ["inserter", x0 + 7.5, y0, W_, None, None, None]] + _poles(x0, y0, (3.5, 7.5))
for x0 in (0, 11):                          # 2 줄 녹색 칸
    y0 = -86.5
    AC_DESIGN += _cell(x0 + 1.5, y0, CC, {"copper-plate": 40}, am="assembling-machine-1")         + _cell(x0 + 5.5, y0, GC, {"iron-plate": 40}, out_bar=1) + _cell(x0 + 9.5, y0, CC, {"copper-plate": 40}, am="assembling-machine-1")         + [["fast-inserter", x0 + 3.5, y0, W_, None, None, None], ["fast-inserter", x0 + 7.5, y0, E_, None, None, None]] + _poles(x0, y0, (3.5, 7.5))
AC_DESIGN += _cell(23.5, -86.5, AC, REQ_AC, out_bar=2) + _cell(27.5, -86.5, CC, {"copper-plate": 30}, am="assembling-machine-1")     + [["inserter", 25.5, -86.5, E_, None, None, None]] + _poles(22, -86.5, (3.5,))
DESIGN += AC_DESIGN
# ---- 처리장치 +3 · 저밀도 +1 (09-28 20:xx, scripts/pu23.py 가 먹이 · 출력 · 황 중계). delta-trap 구역은 사람만 금지 - 로봇 유령은 된다.
#   황산 관 (y=-0.5 동쪽 끝 36.5) -> (37.5 · 38.5,-0.5) -> x=38.5 세로 -> 지하 (38.5,3.5 <-> 6.5, 벨트 y 4.5 · 5.5 밑) -> x=38.5 세로 ~12.5
#   PU-B (36.5,8.5) · PU-C (36.5,12.5) 동향 (입구 = 동쪽 38.5), PU-A (29.5,-0.5) 동향 (입구 = 황산 세로 31.5). 오프라인 fluidnet 섞임 0.
PU_DESIGN = [["pipe", 37.5, -0.5, 0, None, None, None]] + [["pipe", 38.5, y + 0.5, 0, None, None, None] for y in (-1, 0, 1, 2)]
PU_DESIGN += [["pipe-to-ground", 38.5, 3.5, N_, None, None, None], ["pipe-to-ground", 38.5, 6.5, S_, None, None, None]]
PU_DESIGN += [["pipe", 38.5, y + 0.5, 0, None, None, None] for y in range(7, 13)]
PU_DESIGN += [["assembling-machine-2", 36.5, 8.5, E_, "processing-unit", None, None],
              ["assembling-machine-2", 36.5, 12.5, E_, "processing-unit", None, None],
              ["small-electric-pole", 34.5, 10.5, 0, None, None, None],
              ["assembling-machine-2", 29.5, -0.5, E_, "processing-unit", None, None],
              ["small-electric-pole", 27.5, -1.5, 0, None, None, None]]   # PU-A 전력 (28.5,-4.5 전봇대 공급 범위 밖이었음)
#   저밀도 칸 1 (P5 블록 동쪽 끝): 요청 (강철 · 구리 · 플라스틱) -> 조립기2 -> 공급 (칸 1) -> pu23 이 망 -> 노랑
PU_DESIGN += _cell(31.5, -86.5, "low-density-structure", {"steel-plate": 10, "copper-plate": 60, "plastic-bar": 20}, out_bar=1)
PU_DESIGN += [["small-electric-pole", 29.5, -88.5, 0, None, None, None]]
DESIGN += PU_DESIGN
AC_REQS = [(d[1], d[2], d[5]) for d in DESIGN if d[0] == "requester-chest" and (d[1], d[2]) != (-95.5, -77.5)]   # 19:3x 보라 블록 요청 상자도 (물류 로봇 69 전부 바쁨 -> 레일 조립기 막대 0)

OLD_PURPLE_INS = [(-93.5, -84.5), (-92.5, -84.5), (-94.5, -80.5), (-93.5, -80.5), (-91.5, -82.5), (-87.5, -82.5),
                  (-89.5, -80.5), (-85.5, -84.5), (-84.5, -84.5), (-83.5, -82.5), (-85.5, -80.5), (-81.5, -84.5),
                  (-81.5, -80.5)]
EC_AREAS = [((5, -36), (36, -27)), ((-35, -46), (-24, -14))]
AC_AREAS = [((-69, -79), (-68, -48)), ((-82, -80), (-68, -79))]
BLOCK_AREAS = [[[-104, -90], [-88, -70]], [[-72, -78], [-68, -74]], [[-3, -99], [34, -82]], [[27, -3], [40, 15]]]
STONE_AREAS = [[[-73, -81], [-72, -44]], [[-75, -86], [-74, -81]], [[-60, -91], [-54, -88]]]   # 막힌 돌 레인
BRICK_FURN = [(-63, -97), (-60, -97), (-51, -97), (-48, -97)]


def log(msg):
    print(time.strftime("%H:%M:%S ") + msg, flush=True)


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(d):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def L(v):
    """파이썬 값 -> Lua 리터럴"""
    if v is None:
        return "nil"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return "'%s'" % v
    if isinstance(v, dict):
        return "{" + ", ".join("['%s'] = %s" % (k, L(x)) for k, x in v.items()) + "}"
    return "{" + ", ".join(L(x) for x in v) + "}"


def T(v):
    if isinstance(v, dict) and v and all(str(k).isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v


NET = """local s = game.surfaces[1]
local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
"""

# ---------------------------------------------------------------- build
BUILD = "(function() " + NET + """
local D = $design local o = {ghost = 0, placed = 0, built = 0, cfg = 0, blocked = {}, err = {}}
local function cfg_req(e, req)
  local ok, err = pcall(function()
    local p = e.get_requester_point()
    local sec = p.sections_count > 0 and p.get_section(1) or p.add_section()
    local i = 0
    for name, n in pairs(req) do i = i + 1
      local cur = sec.get_slot(i)
      if not (cur and cur.value and cur.value.name == name and cur.min == n) then sec.set_slot(i, {value = {type = 'item', name = name, quality = 'normal'}, min = n}) end
    end
  end)
  if not ok then o.err[#o.err + 1] = 'req ' .. tostring(err) end
end
for _, d in pairs(D) do
  local name, x, y, dir, rc, req, bar = d[1], d[2], d[3], d[4], d[5], d[6], d[7]
  local e = s.find_entities_filtered{name = name, position = {x, y}, radius = 0.3, force = 'player'}[1]
  if e then
    o.built = o.built + 1
    if rc and (not e.get_recipe() or e.get_recipe().name ~= rc) then e.set_recipe(rc) o.cfg = o.cfg + 1 end
    if req and not (x == -95.5 and y == -77.5 and e.get_requester_point().get_section(1).filters_count > 0) then cfg_req(e, req) end
    if bar then local inv = e.get_inventory(defines.inventory.chest) if inv.get_bar() ~= bar + 1 then inv.set_bar(bar + 1) o.cfg = o.cfg + 1 end end
  else
    local g = s.find_entities_filtered{ghost_name = name, position = {x, y}, radius = 0.3}[1]
    if g then o.ghost = o.ghost + 1
      if rc then pcall(function() if not g.get_recipe() then g.set_recipe(rc) end end) end
    elseif $go then
      if s.can_place_entity{name = name, position = {x, y}, direction = dir, force = 'player', build_check_type = defines.build_check_type.manual_ghost} then
        local ng = s.create_entity{name = 'entity-ghost', inner_name = name, position = {x, y}, direction = dir, force = 'player'}
        if ng then o.placed = o.placed + 1 if rc then pcall(function() ng.set_recipe(rc) end) end end
      else o.blocked[#o.blocked + 1] = name .. '@' .. x .. ',' .. y end
    else
      if not s.can_place_entity{name = name, position = {x, y}, direction = dir, force = 'player', build_check_type = defines.build_check_type.manual_ghost} then
        o.blocked[#o.blocked + 1] = name .. '@' .. x .. ',' .. y end
    end
  end
end
-- 옛 보라 투입 팔: rebuild23 0-5 의 물류망 조건 해제 (필터는 그대로)
if $go then o.oldon = 0
  for _, p in pairs($oldins) do local e = s.find_entities_filtered{type = 'inserter', position = p, radius = 0.1}[1]
    if e then local cb = e.get_control_behavior() if cb and cb.connect_to_logistic_network then cb.connect_to_logistic_network = false o.oldon = o.oldon + 1 end end end
end
o.total = #D
return o end)()"""

# ---------------------------------------------------------------- maker
MAKER_LUA = "(function() " + NET + """
local A = s.find_entities_filtered{type = 'assembling-machine', position = {$mx, $my}, radius = 0.6}[1]
if not A then return {err = 'no maker'} end
local o = {ft = 0}
local FLOOR = {['iron-plate'] = 3000, ['steel-plate'] = 1500}
local out = A.get_output_inventory() local inp = A.get_inventory(defines.inventory.assembling_machine_input)
local function toport(name, n)
  for _, r in pairs(net.cells) do local rp = r.owner
    if n <= 0 then break end
    local k = rp.get_inventory(defines.inventory.roboport_robot).insert{name = name, count = n}
    if k > 0 then out.remove{name = name, count = k} n = n - k o[name] = (o[name] or 0) + k end
  end
end
for _, it in pairs(out.get_contents()) do
  if it.name == 'logistic-robot' or it.name == 'construction-robot' then toport(it.name, it.count)
  else local k = net.insert{name = it.name, count = it.count} if k > 0 then out.remove{name = it.name, count = k} o.made = (o.made or '') .. it.name:sub(1, 8) .. k .. ' ' end end
end
local function cnt(n) return net.get_item_count(n) end
local NEED = $need local FR = $frames
local R = {}
-- 남은 수 = 블록 유령 수 - 망 재고 - 로봇이 들고 가는 중 (60 초 묵은 표 대신 매번 셈)
local fly = {}
for _, r in pairs(net.construction_robots) do local c = r.get_inventory(defines.inventory.robot_cargo)
  if c then for _, it in pairs(c.get_contents()) do fly[it.name] = (fly[it.name] or 0) + it.count end end end
for _, k in pairs({'requester-chest', 'passive-provider-chest', 'assembling-machine-2'}) do
  local g = 0 for _, A in pairs($areas) do g = g + s.count_entities_filtered{ghost_name = k, area = A} end
  R[k] = math.max(0, math.min(NEED[k] or 0, g) - cnt(k) - (fly[k] or 0)) end
R['construction-robot'] = math.max(0, $contarget - net.all_construction_robots)
R['logistic-robot'] = math.max(0, $logitarget - net.all_logistic_robots)
R['steel-chest'] = math.max(0, R['requester-chest'] + R['passive-provider-chest'] - cnt('steel-chest'))
do local g1 = 0 for _, A in pairs($areas) do g1 = g1 + s.count_entities_filtered{ghost_name = 'assembling-machine-1', area = A} end
  g1 = math.min(NEED['assembling-machine-1'] or 0, g1) - (fly['assembling-machine-1'] or 0)
  R['assembling-machine-1'] = math.max(0, math.max(0, g1) + R['assembling-machine-2'] - cnt('assembling-machine-1')) end
R['iron-gear-wheel'] = math.max(0, 5 * (R['assembling-machine-1'] + R['assembling-machine-2']) - cnt('iron-gear-wheel'))
local frames_net = cnt('flying-robot-frame')
local function frame_src() local n = frames_net
  for _, p in pairs($fsrc) do local F = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
    if F then n = n + F.get_output_inventory().get_item_count('flying-robot-frame') end end
  return n end
local function have(name)
  local h = inp.get_item_count(name)
  if name == 'flying-robot-frame' then return h + math.min(FR, frame_src()) end
  return h + cnt(name) - (FLOOR[name] or 0)
end
local recs = game.forces.player.recipes
local function can(n) for _, ing in pairs(recs[n].ingredients) do if have(ing.name) < ing.amount then return false end end return true end
local order = {'construction-robot', 'requester-chest', 'passive-provider-chest', 'assembling-machine-2', 'steel-chest',
               'assembling-machine-1', 'iron-gear-wheel', 'logistic-robot'}
local cur = A.get_recipe() and A.get_recipe().name
local pick = nil
if cur and (R[cur] or 0) > 0 and (A.is_crafting() or can(cur)) then pick = cur end
if not pick then for _, n in pairs(order) do if not pick and R[n] > 0 and can(n) then pick = n end end end
if pick ~= cur then
  if A.is_crafting() and cur and (R[cur] or 0) > 0 then pick = cur else
    local back = A.set_recipe(pick)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then net.insert{name = it.name, count = it.count} end end
  end
end
if pick then
  local crafts = math.max(1, math.min(5, R[pick]))
  for _, ing in pairs(recs[pick].ingredients) do
    local want = ing.amount * crafts - inp.get_item_count(ing.name)
    if want > 0 and ing.name == 'flying-robot-frame' then
      want = math.min(want, FR)
      if frames_net > 0 then local k = net.remove_item{name = ing.name, count = math.min(want, frames_net)} if k > 0 then inp.insert{name = ing.name, count = k} want = want - k o.ft = o.ft + k end end
      for _, p in pairs($fsrc) do if want > 0 then local F = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
        if F then local k = F.get_output_inventory().remove{name = ing.name, count = want} if k > 0 then inp.insert{name = ing.name, count = k} want = want - k o.ft = o.ft + k end end end end
    elseif want > 0 then
      want = math.min(want, cnt(ing.name) - (FLOOR[ing.name] or 0))
      if want > 0 then local k = net.remove_item{name = ing.name, count = want}
        if k > 0 then local p = inp.insert{name = ing.name, count = k} if p < k then net.insert{name = ing.name, count = k - p} end end end
    end
  end
end
o.pick = pick or '-' o.st = A.status
o.R = {} for k, v in pairs(R) do if v > 0 then o.R[k] = v end end
return o end)()"""

# ---------------------------------------------------------------- relay
RELAY = "(function() " + NET + """
local o = {}
local function add(k, v) o[k] = (o[k] or 0) + v end
local function frombelts(areas, item, want, tag)
  if want <= 0 then return end
  for _, A in pairs(areas) do
    for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = A}) do
      for i = 1, 2 do if want > 0 then local l = b.get_transport_line(i) local n = l.get_item_count(item)
        if n >= 3 then local k = l.remove_item{name = item, count = math.min(want, n - 1)}
          if k > 0 then local p = net.insert{name = item, count = k} want = want - p add(tag, p) end end end end
    end
  end
end
frombelts($ecareas, 'electronic-circuit', 40 - net.get_item_count('electronic-circuit'), 'ec')
frombelts($acareas, 'advanced-circuit', 60 - net.get_item_count('advanced-circuit'), 'ac')
-- 파랑 줄 고급회로 벨트 끝 (x=40.5 y -33..-20, 밀려 있음) 에서 30 초 6 개까지 (10 분 120): 파랑 10 분 140 > 소비 94, 연구는 보라를 기다림
if net.get_item_count('advanced-circuit') < 20 then frombelts({{{40, -34}, {41, -20}}}, 'advanced-circuit', 6, 'acblue') end
-- F1 프레임 (8.5,3.5): 녹색회로 (망, 6 미만이면 12 까지) · 전기엔진 (엔진 조립기 (21.5,-8.5) 출력 full_output, 3 미만이면 4 까지)
local F1 = s.find_entities_filtered{type = 'assembling-machine', position = {8.5, 3.5}, radius = 0.6}[1]
local EE = s.find_entities_filtered{type = 'assembling-machine', position = {21.5, -8.5}, radius = 0.6}[1]
if F1 then local fi = F1.get_inventory(defines.inventory.assembling_machine_input)
  local h = fi.get_item_count('electronic-circuit')
  if h < 6 then local k = math.min(12 - h, net.get_item_count('electronic-circuit'))
    if k > 0 then k = net.remove_item{name = 'electronic-circuit', count = k} if k > 0 then local q = fi.insert{name = 'electronic-circuit', count = k} if q < k then net.insert{name = 'electronic-circuit', count = k - q} end add('f1ec', q) end end end
  h = fi.get_item_count('electric-engine-unit')
  if EE and h < 3 then local k = EE.get_output_inventory().remove{name = 'electric-engine-unit', count = 4 - h}
    if k > 0 then fi.insert{name = 'electric-engine-unit', count = k} add('f1ee', k) end end
end
-- 생산 모듈 재고가 넉넉하면 (망 > 150) S3 요청을 0 으로 -> 고급회로를 전기로 쪽으로 (< 100 이면 되살림)
local pm = net.get_item_count('productivity-module')
local R3 = s.find_entities_filtered{name = 'requester-chest', position = {-95.5, -77.5}, radius = 0.3}[1]
if R3 and (pm > 150 or pm < 100) then pcall(function()
  local sec = R3.get_requester_point().get_section(1) local want = pm > 150 and 0 or 10
  for i = 1, sec.filters_count do local f = sec.get_slot(i) if f and f.value and f.min ~= want then sec.set_slot(i, {value = f.value, min = want}) o.s3 = want end end end) end
-- 보라 -> 연구소
for _, l in pairs(s.find_entities_filtered{type = 'lab', force = 'player'}) do
  local inv = l.get_inventory(defines.inventory.lab_input) local h = inv.get_item_count('production-science-pack')
  if h < 4 then local k = math.min(6 - h, net.get_item_count('production-science-pack'))
    if k > 0 then k = net.remove_item{name = 'production-science-pack', count = k}
      if k > 0 then local p = inv.insert{name = 'production-science-pack', count = k} if p < k then net.insert{name = 'production-science-pack', count = k - p} end add('psp', p) end end end
end
-- 레일 돌 · 강철 (09-28 19:0x): 망 돌 0 (돌 전초 중단) -> 레일 조립기 둘이 돌 0 / 옛 레일 조립기 (-85.5,-82.5) 는 강철 벨트 레인이 철판에 막혀 강철 0.
--   돌 출처 1 = 막힌 돌 레인 (채굴기 (-54.5,-92.5) -> y=-88.5 서행 -> x=-74.5 -> x=-72.5 남행 2 레인, waiting_for_space = 남는 몫)
--   돌 출처 2 = 벽돌 화로 돌 벨트 y=-100.5 - 망 벽돌 >= 50 이고 망 전기로 >= 20 일 때만 (화로 몫과 나눔)
--   받는 곳: 레일 조립기2 요청 상자 (-101.5,-86.5) 40 까지 -> 옛 레일 조립기1 입력 12 까지. 강철은 망 -> 옛 레일 조립기1 (10 미만이면 30 까지).
do
  local RQ = s.find_entities_filtered{name = 'requester-chest', position = {-101.5, -86.5}, radius = 0.3}[1]
  local R1 = s.find_entities_filtered{type = 'assembling-machine', position = {-85.5, -82.5}, radius = 0.6}[1]
  local rin = R1 and R1.get_inventory(defines.inventory.assembling_machine_input)
  local rqi = RQ and RQ.get_inventory(defines.inventory.chest)
  local w1 = rqi and math.max(0, 40 - rqi.get_item_count('stone')) or 0
  local w2 = rin and math.max(0, 12 - rin.get_item_count('stone')) or 0
  local function take(areas, want)
    local got = 0
    for _, A in pairs(areas) do
      for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = A}) do
        for i = 1, 2 do if got < want then local l = b.get_transport_line(i) local n = l.get_item_count('stone')
          if n > 0 then got = got + l.remove_item{name = 'stone', count = math.min(want - got, n)} end end end
      end
    end
    return got
  end
  -- 채굴기 (-54.5,-92.5) 앞 짧은 돌 벨트에 구리광석이 끼어 (x=-72.5 줄은 돌 · 구리광석 섞인 줄) 채굴기가 waiting_for_space -> 그 몇 칸의 구리광석만 망으로 (30 초 20 까지)
  do local left = 20
    for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-57, -91}, {-54, -88}}}) do
      for i = 1, 2 do local l = b.get_transport_line(i) local n = l.get_item_count('copper-ore')
        if n > 0 and left > 0 then local k = l.remove_item{name = 'copper-ore', count = math.min(n, left)} if k > 0 then local q = net.insert{name = 'copper-ore', count = k} left = left - k add('cuore', q) end end end
    end
  end
  local want = w1 + w2
  local got = take($stoneareas, want)
  if got < want and net.get_item_count('stone-brick') >= 50 and net.get_item_count('electric-furnace') >= 20 then
    local g2 = take({{{-64, -101}, {-47, -100}}}, math.min(want - got, 20)) got = got + g2 add('stbf', g2) end
  if got > 0 then
    local a = rqi and math.min(got, w1) or 0
    if a > 0 then a = rqi.insert{name = 'stone', count = a} add('strq', a) end
    local b2 = got - a
    if b2 > 0 and rin then local q = rin.insert{name = 'stone', count = b2} add('str1', q) b2 = b2 - q end
    if b2 > 0 then net.insert{name = 'stone', count = b2} end
  end
  if rin then local h = rin.get_item_count('steel-plate')
    if h < 10 and net.get_item_count('steel-plate') > 1500 then local k = net.remove_item{name = 'steel-plate', count = 30 - h}
      if k > 0 then local q = rin.insert{name = 'steel-plate', count = k} if q < k then net.insert{name = 'steel-plate', count = k - q} end add('stl1', q) end end end
end
-- P5 고급회로 블록 요청 상자: 물류 로봇 (31 대, 망 끝 저장 (-97.5,-88.5) 까지 ~110 칸) 이 못 따라오면 1/3 밑일 때 망 -> 상자 (구리 800 · 철 3000 · 플라스틱 100 남김)
do local FL = {['copper-plate'] = 800, ['iron-plate'] = 3000, ['plastic-bar'] = 100, ['steel-plate'] = 1500, ['rail'] = 0, ['iron-stick'] = 0, ['electric-furnace'] = 0, ['productivity-module'] = 0, ['advanced-circuit'] = 0, ['stone-brick'] = 0}
  for _, r in pairs($acreqs) do local c = s.find_entities_filtered{name = 'requester-chest', position = {r[1], r[2]}, radius = 0.3}[1]
    if c then local inv = c.get_inventory(defines.inventory.chest)
      for name, n in pairs(r[3]) do if FL[name] then local h = inv.get_item_count(name)
        if h < n / 3 then local k = math.min(n - h, net.get_item_count(name) - FL[name])
          if k > 0 then k = net.remove_item{name = name, count = k} if k > 0 then local q = inv.insert{name = name, count = k} if q < k then net.insert{name = name, count = k - q} end add('acb', q) end end end end end
    end
  end
end
-- P5 노랑 사슬 (09-28 19:xx):
--   황산 공장 (30.5,6.5) 철 0 (ironfeed23 구역 y -40..0 밖, 옆 철 상자 (30.5,3.5) 빈 채) -> 황산 관 전부 0 -> 배터리 · 처리장치 굶음. 망 철 -> 입력 (5 미만이면 20 까지)
--   전기엔진 (21.5,-8.5) 녹색회로: 망 -> 입력 (4 미만이면 10 까지)
--   F1 프레임 (8.5,3.5) 강철 0 (역시 구역 밖) -> 망 강철 -> 입력 (3 미만이면 10 까지)
--   노랑 Y2 (12.5,3.5) full_output 78: 연구가 보라를 기다려 연구소가 노랑을 안 먹음 -> 출력 4 넘는 몫을 망으로 (출력 20 이면 full_output 으로 섬) (망 노랑 < 1500 · 저장 빈 칸 > 120).
--   망 노랑 -> 연구소 (3 미만이면 5 까지, yellowlab23 이 먼저 조립기 출력에서 채움) - 사일로 연구 비축분.
do
  local function feed(pos, item, lo, hi, keep, tag)
    local a = s.find_entities_filtered{type = 'assembling-machine', position = pos, radius = 0.6}[1]
    if not a then return end
    local inv = a.get_inventory(defines.inventory.assembling_machine_input) local h = inv.get_item_count(item)
    if h < lo then local k = math.min(hi - h, net.get_item_count(item) - keep)
      if k > 0 then k = net.remove_item{name = item, count = k} if k > 0 then local q = inv.insert{name = item, count = k} if q < k then net.insert{name = item, count = k - q} end add(tag, q) end end end
  end
  feed({30.5, 6.5}, 'iron-plate', 5, 20, 3000, 'acid')
  feed({8.5, 3.5}, 'steel-plate', 3, 10, 300, 'f1st')
  feed({21.5, -8.5}, 'electronic-circuit', 4, 10, 0, 'eeec')   -- 전기엔진 (한 대, 10 분 21 / 상한 45) 녹색회로 1 개로 자주 섬 -> 프레임 병목
  -- 처리장치 둘 (33.5,1.5)(36.5,1.5) full_output 인데 노랑 Y2 는 처리장치 1 -> 출력 -> 노랑 둘 입력 (4 미만이면 8 까지)
  for _, yp in pairs({{12.5, 3.5}, {29.5, -8.5}}) do local Y = s.find_entities_filtered{type = 'assembling-machine', position = yp, radius = 0.6}[1]
    if Y then local yi = Y.get_inventory(defines.inventory.assembling_machine_input) local h = yi.get_item_count('processing-unit')
      for _, pp in pairs({{33.5, 1.5}, {36.5, 1.5}}) do if h < 4 then local P = s.find_entities_filtered{type = 'assembling-machine', position = pp, radius = 0.6}[1]
        if P then local po = P.get_output_inventory() local k = math.min(8 - h, po.get_item_count('processing-unit'))
          if k > 0 then k = yi.insert{name = 'processing-unit', count = k} if k > 0 then po.remove{name = 'processing-unit', count = k} h = h + k add('pu', k) end end end end end
    end
  end
  local USP = 'utility-science-pack'
  local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  for _, p in pairs({{12.5, 3.5}, {29.5, -8.5}}) do local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
    if a and free > 120 and net.get_item_count(USP) < 1500 then local out = a.get_output_inventory() local n = out.get_item_count(USP) - 4
      if n > 0 then local k = net.insert{name = USP, count = n} if k > 0 then out.remove{name = USP, count = k} add('usp', k) end end end end
  if net.get_item_count(USP) > 0 then
    for _, l in pairs(s.find_entities_filtered{type = 'lab', force = 'player'}) do local inv = l.get_inventory(defines.inventory.lab_input) local h = inv.get_item_count(USP)
      if h < 3 then local k = math.min(5 - h, net.get_item_count(USP)) if k > 0 then k = net.remove_item{name = USP, count = k}
        if k > 0 then local q = inv.insert{name = USP, count = k} if q < k then net.insert{name = USP, count = k - q} end add('usplab', q) end end end end
  end
end
-- 벽돌 화로 연료
for _, p in pairs($bf) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 1}[1]
  if f then local fu = f.get_fuel_inventory() local h = fu.get_item_count('coal')
    if h < 5 and net.get_item_count('coal') > 300 then local k = net.remove_item{name = 'coal', count = 10 - h}
      if k > 0 then local q = fu.insert{name = 'coal', count = k} if q < k then net.insert{name = 'coal', count = k - q} end add('bf', q) end end end
end
local st = game.forces.player.get_item_production_statistics(s)
o.frames_made = st.get_input_count('flying-robot-frame')
o.lr = net.all_logistic_robots o.cr = net.all_construction_robots
local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end o.free = free
return o end)()"""

STATUS = "(function() " + NET + """
local o = {}
local st = game.forces.player.get_item_production_statistics(s)
local function f(n) return math.floor(st.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true}) end
o.made10 = {psp = f('production-science-pack'), rail = f('rail'), ef = f('electric-furnace'), pm = f('productivity-module'), lr = f('logistic-robot'), frame = f('flying-robot-frame'), util = f('utility-science-pack')}
o.lr = net.all_logistic_robots o.lr_free = net.available_logistic_robots o.cr = net.all_construction_robots
local free, tot = 0, 0 for _, c in pairs(net.storages) do local inv = c.get_inventory(defines.inventory.chest) free = free + inv.count_empty_stacks() tot = tot + #inv end
o.storage_free = free .. '/' .. tot
o.net = {} for _, n in pairs({'advanced-circuit', 'electronic-circuit', 'productivity-module', 'electric-furnace', 'rail', 'iron-stick', 'stone', 'stone-brick', 'steel-plate', 'production-science-pack'}) do o.net[n] = net.get_item_count(n) end
o.asm = {}
for _, a in pairs(s.find_entities_filtered{type = 'assembling-machine', area = {{-104, -90}, {-80, -70}}}) do
  local k = '?' for n, v in pairs(defines.entity_status) do if v == a.status then k = n end end
  o.asm[#o.asm + 1] = (a.get_recipe() and a.get_recipe().name or '-') .. '@' .. a.position.x .. ',' .. a.position.y .. ' ' .. k end
return o end)()"""


def build(ai, go):
    return ai.lua(BUILD.replace("$design", L(DESIGN)).replace("$oldins", L([list(p) for p in OLD_PURPLE_INS]))
                  .replace("$go", L(go)))


def need_table():
    """설계에서 아직 안 지어진 (유령 포함) 것 수 -> 제작 목표"""
    n = {}
    for d in DESIGN:
        n[d[0]] = n.get(d[0], 0) + 1
    return n


BUILT_COUNT = """(function() local s = game.surfaces[1] local D = $design local o = {}
for _, d in pairs(D) do if s.find_entities_filtered{name = d[1], position = {d[2], d[3]}, radius = 0.3, force = 'player'}[1] then o[d[1]] = (o[d[1]] or 0) + 1 end end
return o end)()"""


def remaining(ai):
    b = ai.lua(BUILT_COUNT.replace("\n", " ").replace("$design", L([[d[0], d[1], d[2]] for d in DESIGN])))
    b = b if isinstance(b, dict) else {}
    tot = need_table()
    return {k: max(0, v - int(b.get(k, 0))) for k, v in tot.items()}


def run(ai, every=6, relay_every=30):
    st = load()
    last_relay = 0.0
    last_build = 0.0
    last_status = 0.0
    need = {}
    while True:
        now = time.time()
        try:
            if now - last_build >= 60:
                r = build(ai, True)
                need = remaining(ai)
                log("build %s | 남은 %s" % ({k: r.get(k) for k in ("total", "built", "ghost", "placed", "cfg", "oldon")},
                                            {k: v for k, v in need.items() if v}))
                if T(r.get("blocked")) or T(r.get("err")):
                    log("  막힘 %s 오류 %s" % (T(r.get("blocked")), T(r.get("err"))))
                last_build = now
            if now - last_relay >= relay_every:
                r = ai.lua(RELAY.replace("$ecareas", L([[list(a), list(b)] for a, b in EC_AREAS]))
                           .replace("$acareas", L([[list(a), list(b)] for a, b in AC_AREAS]))
                           .replace("$bf", L([list(p) for p in BRICK_FURN]))
                           .replace("$stoneareas", L(STONE_AREAS))
                           .replace("$acreqs", L([[x, y, r] for x, y, r in AC_REQS])))
                made = int(r.get("frames_made", 0))
                if "frame_base" not in st:
                    st["frame_base"], st["frames_taken"] = made, 0
                allow = int(FRAME_SHARE * (made - st["frame_base"])) - st.get("frames_taken", 0)
                st["allow"] = max(0, allow)
                save(st)
                moved = {k: v for k, v in r.items() if k in ("ec", "ac", "psp", "bf", "f1ec", "f1ee", "s3", "acblue", "strq", "str1", "stbf", "stl1", "acb", "acid", "f1st", "usp", "usplab", "eeec", "cuore", "pu")}
                if moved:
                    log("relay %s · 물류 %s 건설 %s · 저장 빈칸 %s · 프레임 몫 %s" % (moved, r.get("lr"), r.get("cr"), r.get("free"), st["allow"]))
                last_relay = now
            mneed = {k: need.get(k, 0) for k in ("requester-chest", "passive-provider-chest", "assembling-machine-2", "assembling-machine-1")}
            m = ai.lua(MAKER_LUA.replace("$mx", str(MAKER[0])).replace("$my", str(MAKER[1])).replace("$need", L(mneed))
                       .replace("$frames", str(st.get("allow", 0))).replace("$fsrc", L([list(p) for p in FRAME_SRC]))
                       .replace("$contarget", str(CON_TARGET)).replace("$areas", L(BLOCK_AREAS)).replace("$logitarget", str(LOGI_TARGET)))
            ft = int(m.get("ft", 0))
            if ft:
                st["frames_taken"] = st.get("frames_taken", 0) + ft
                st["allow"] = max(0, st.get("allow", 0) - ft)
                save(st)
            if m.get("made") or m.get("logistic-robot") or m.get("construction-robot") or ft or m.get("err"):
                log("maker %s" % m)
            if now - last_status >= 300:
                log("status %s" % ai.lua(STATUS))
                last_status = now
        except Exception as e:  # noqa: BLE001
            log(f"purple23: {type(e).__name__}: {e}"[:300])
        time.sleep(every)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["plan", "status", "run", "build"])
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "plan":
        r = build(ai, False)
        print("설계 %s · 지어짐 %s · 유령 %s · 막힘 %s" % (r.get("total"), r.get("built"), r.get("ghost"), T(r.get("blocked"))))
        print("남은 자재", remaining(ai))
    elif a.cmd == "build":
        print(build(ai, True))
    elif a.cmd == "status":
        r = ai.lua(STATUS)
        for k, v in r.items():
            print(k, T(v))
    else:
        run(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

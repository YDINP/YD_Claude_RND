"""노랑팩 (utility-science-pack) 부트스트랩 - 23회차 (2026-09-27, 사용자: "최대한 대포 빨리 연구해서 장거리로 적 군체 제거").

조사 (tick ~15.06M):
  · 연구 military-4 (150 단위) -> artillery (2000 단위, 30초) 가 노랑 하나만 기다린다. 연구소 16 x 속도 2.4.
  · 노랑 3 = 처리장치 2 + 프레임 1 + 저밀도 3. 노랑 한 개에 플라스틱 ~7.7 · 철 ~33 · 회로 ~10.
  · 로봇 줄 (y=-8.5, x 5..34): 구리선 5.5 -> 회로 9.5 (-> 벨트 y=-12) · 톱니 13.5 · 엔진 17.5 · 전기엔진 21.5 · 프레임 25.5 · 로봇 29.5 · 수리팩 33.5.
    프레임이 선 까닭 = 회로 0 <- 구리선 조립기의 구리 상자 (5.5,-5.5) 가 비었다. 배터리 화학 공장 (25.5,-4.5) 은 철 입력 팔이 없다 (손으로).
    로봇 조립기 (29.5,-8.5) 는 프레임을 직삽으로 받아 로봇으로 먹는다 -> 노랑으로 바꾼다 (프레임 직삽 그대로, 결과는 팔 (29.5,-6.5) -> 상자 (29.5,-5.5)).
  · delta 끼임 구역 x 18..34, y -12..14 에는 사람을 넣지 않는다: 복도 y=-13.5 (x 8..36) 와 동쪽 띠 x 35..40 에서만 손을 뻗는다
    (프레임 25.5 · 노랑 29.5 는 복도에서 5칸, 노랑 상자 29.5,-5.5 는 8칸, 배터리 25.5,-4.5 는 9칸).
  · 황산 (30.5,6.5) 은 가득 - 관 (31.5, -2.5..4.5) 이 배터리로 간다. 여기서 동쪽으로 y=-0.5 관 다섯을 뽑아 처리장치 2형 둘.
  · 플라스틱 공장 (1.5,-44.5) 은 full_output (AC 수요가 막음, 가스 여유) -> 동쪽에 팔+상자로 잉여를 뽑는다.
  · 강철은 full_output 강철 화로 (보라 줄 제외) 출력에서 집는다. 회로 · 고급회로 · 저밀도는 사람 손제작 (구리/철은 창고).

    python scripts/yellow23.py                 # 상태 (기계 · 재고 · 연구)
    python scripts/yellow23.py --kick          # golf: 구리 상자 · 노랑 레시피 · 배터리 철
    python scripts/yellow23.py --stage pu --who echo
    python scripts/yellow23.py --stage tap --who hotel
    python scripts/yellow23.py --feed --who golf,echo,hotel,foxtrot,bravo   # 먹이 고리 (배경)
    python scripts/yellow23.py --measure       # 한 줄 측정 (state/yellow23.log 에 덧붙임)
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit  # noqa: E402

OWNER = "yellow23"
LOG = os.path.join(HERE, "..", "state", "yellow23.log")
N, E, S, W = 0, 4, 8, 12

# 로봇 줄
COPPER_CHEST = (5.5, -5.5)       # 구리선 조립기 입력 상자
IRON_CHEST = (9.5, -5.5)         # 회로 조립기 철 상자
STEEL_CHEST = (10.5, -13.5)      # 벨트 y=-12 머리 (강철 -> 엔진 · 프레임)
GEAR_CHEST = (13.5, -12.5)       # 톱니 조립기 철 상자 (긴팔)
PIPE_CHEST = (17.5, -1.5)        # 관 조립기 철 상자
FRAME = (25.5, -8.5)
BATTERY = (25.5, -4.5)
YELLOW = (29.5, -8.5)            # 옛 로봇 조립기 -> 노랑
YOUT = (29.5, -5.5)              # 노랑 결과 상자
EEU = (21.5, -8.5)
ACID_IRON = (30.5, 3.5)          # 황산 공장 철 상자 (동쪽 띠 (38.5,4.5) 에서 8칸)
BAT_CU = (22.5, -4.5)            # 배터리 구리 상자 (복도 (22.5,-13.5) 에서 9칸)
BAT_OUT = (28.5, -3.5)           # 배터리 넘침 상자 (프레임이 배부를 때) - 동쪽 띠 (35.5,-3.5) 에서 7칸
CORR_Y = -13.5                   # 복도
# 처리장치 (동쪽 띠)
PU_PIPES = [(32.5, -0.5), (33.5, -0.5), (34.5, -0.5), (35.5, -0.5), (36.5, -0.5)]
PU = [(33.5, 1.5), (36.5, 1.5)]  # 2형, 북향 = 유체 입력 (x, -0.5)
PU_POLE = (35.5, 3.5)
PU_STAND = (38.5, -4.5)
# 플라스틱 잉여
PLASTIC = (1.5, -44.5)
TAP_INS, TAP_CHEST = (3.5, -44.5), (4.5, -44.5)
# 강철: full_output 강철 화로 (보라 줄 x=-76 은 빼고)
STEEL_FURN = [(-5, -34), (-5, -32), (-5, -36), (-29, -40), (-47, -42), (-47, -40)]
# 고급회로 잉여: p26 AM1 둘 (-21.5,-30.5)(-21.5,-38.5) 은 full_output, 결과 벨트 x=-18.5 (고급회로 | 황) 는 파랑 조립기 앞에서 꽉 찬 채 선다
AC_AM1 = [(-21.5, -30.5), (-21.5, -38.5)]
ACTAP_INS, ACTAP_CHEST = (-17.5, -32.5), (-16.5, -32.5)    # 필터 [고급회로], 서쪽 벨트에서 집음
STAP_INS, STAP_CHEST = (-17.5, -33.5), (-16.5, -33.5)      # 필터 [황], 같은 벨트 - 황산 공장 손 투입용 (정유 가스를 플라스틱이 나눠 먹어 황이 모자람)
# 저밀도 2형 둘: 플라스틱 상자 (4.5,-44.5) 에서 팔로 (동 · 북), 구리 · 강철은 손으로
LDS = [(7.5, -45.5), (4.5, -47.5)]
LDS_INS = [((5.5, -44.5), W), ((4.5, -45.5), S)]           # 집는 쪽: 서 (상자) · 남 (상자)
LDS_POLE = (5.5, -45.5)
LDS_STAND = (10.5, -48.5)
# 고급 정유 (23.5,11.5) 해소: 경유 탱크 (26.5,1.5) 가득 -> 정유 정지 -> 가스 (황 공장만 먹음, 황 50 적체) 도 선다.
#   레시피를 basic-oil-processing 으로 (가스는 같은 오른쪽 출구 (25.5,8.5), 경유 · 중유 없음 - 윤활유 탱크 8.1k 로 전기엔진 ~540).
#   가스 관 (25.5,8.5) 서쪽 옆 (24.5,8.5) 에 지하관 -> (18.5,8.5) 로 나와 구역 밖 y=8.5 관 -> 플라스틱 화학 공장 둘 (북향, 입력 y=8.5).
#   (19.5,8.5) 는 윤활유 공장의 빈 입력 - 지상 관을 두지 않는다. 석탄은 상자+팔, 플라스틱은 팔+상자.
REFINERY = (23.5, 11.5)
OIL_PTG = [((24.5, 8.5), E), ((18.5, 8.5), W)]           # 방향 = 지상 연결 쪽
OIL_PIPES = [(x + 0.5, 8.5) for x in range(10, 18)]
PL = [(16.5, 10.5), (11.5, 10.5)]
PL_COAL = [((15.5, 12.5), (15.5, 13.5)), ((10.5, 12.5), (10.5, 13.5))]   # 팔 (남쪽 상자에서) · 상자
PL_OUT = [((16.5, 12.5), (16.5, 13.5)), ((11.5, 12.5), (11.5, 13.5))]    # 팔 (북쪽 공장에서) · 상자
PL_POLES = [(9.5, 11.5), (20.5, 8.5), (18.5, 10.5)]   # + 중형 (13.5,11.5) (나무가 없어 소형 대신) - (18.5,10.5) 가 (20.5,8.5) 와 잇는다
PL_STAND = (14.0, 6.0)
# 둘째 프레임 + 둘째 노랑 (구역 밖 x 7..13, y 2..5): 프레임이 노랑의 병목 (0.0375/s = 노랑 0.11/s)
ENGINE_SRC = [(10.5, -24.5), (18.5, -24.5), (22.5, -24.5), (30.5, -24.5), (6.5, -24.5), (-1.5, -24.5)]   # 엔진 1형 (대부분 full_output)
F2, Y2 = (8.5, 3.5), (12.5, 3.5)
F2_INS = (10.5, 3.5)             # 서 (F2) 에서 집어 Y2 로
HUB2_POLE = (10.5, 5.5)          # 중형 (나무 없음)
HUB2_STAND = (10.5, 0.0)
COPPER_SRC = (-23.5, -8.5)       # 구리 2k
IRON_SRC = (-49.5, 0.5)          # 철 1.5k


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def b(name, x, y, d=None):
    p = {"name": name, "x": x, "y": y}
    if d is not None:
        p["direction"] = d
    return ("build", p)


def walk(x, y):
    return ("walk_to", {"x": x, "y": y})


def corridor_to(x):
    """복도 y=-13.5 로 들어가 x 까지 (구역 x 18..34 · y -12..14 를 밟지 않는다)."""
    return [walk(8.5, CORR_Y), walk(x, CORR_Y)]


def east_strip(y):
    return corridor_to(38.5) + [walk(38.5, -8.0), walk(38.5, y)]


# ------------------------------------------------------------------ 상태

STATUS_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local function st(e) for k, v in pairs(defines.entity_status) do if v == e.status then return k end end return '?' end
  local o = {}
  local spots = { {'yellow', %f, %f}, {'frame', %f, %f}, {'eeu', %f, %f}, {'battery', %f, %f}, {'circ', 9.5, -8.5}, {'cable', 5.5, -8.5},
                  {'engine', 17.5, -8.5}, {'pu1', %f, %f}, {'pu2', %f, %f}, {'plastic', %f, %f}, {'acid', 30.5, 6.5} }
  for _, sp in pairs(spots) do
    local e = s.find_entities_filtered{type = 'assembling-machine', position = {sp[2], sp[3]}, radius = 0.6}[1]
    if e then
      local m = {}
      for _, inv in pairs({defines.inventory.assembling_machine_input, defines.inventory.assembling_machine_output}) do
        local i = e.get_inventory(inv) if i then for _, it in pairs(i.get_contents()) do m[#m+1] = it.name .. '=' .. it.count end end
      end
      o[sp[1]] = (e.get_recipe() and e.get_recipe().name or '-') .. ' ' .. st(e) .. ' ' .. table.concat(m, ' ')
    else o[sp[1]] = 'none' end
  end
  local c = {}
  for _, p in pairs({ {'ychest', %f, %f}, {'cu', %f, %f}, {'fe', %f, %f}, {'steel', %f, %f}, {'tap', %f, %f}, {'acidfe', %f, %f} }) do
    local e = s.find_entities_filtered{type = 'container', position = {p[2], p[3]}, radius = 0.4}[1]
    if e then local m = {} for _, it in pairs(e.get_inventory(defines.inventory.chest).get_contents()) do m[#m+1] = it.name .. '=' .. it.count end c[p[1]] = table.concat(m, ' ') else c[p[1]] = 'none' end
  end
  o.chests = c
  local st2 = f.get_item_production_statistics(s)
  local function flow(n, cat, pi) return st2.get_flow_count{name = n, category = cat, precision_index = pi, count = true} end
  local p10 = defines.flow_precision_index.ten_minutes
  local y = {}
  for _, n in pairs({'utility-science-pack', 'processing-unit', 'low-density-structure', 'flying-robot-frame', 'electronic-circuit', 'advanced-circuit', 'plastic-bar', 'battery', 'electric-engine-unit'}) do
    y[n] = flow(n, 'input', p10) .. '/' .. flow(n, 'output', p10)
  end
  o.prod10 = y
  o.research = f.current_research and f.current_research.name or 'none'
  o.progress = f.research_progress
  o.tick = game.tick
  return o
end)()""" % (YELLOW + FRAME + EEU + BATTERY + PU[0] + PU[1] + PLASTIC
             + YOUT + COPPER_CHEST + IRON_CHEST + STEEL_CHEST + TAP_CHEST + ACID_IRON)


def status(ai):
    return ai.lua(STATUS_LUA)


def lab_yellow(ai):
    return ai.lua("""(function() local n, k = 0, 0
      for _, l in pairs(game.surfaces[1].find_entities_filtered{name = 'lab', force = 'player'}) do
        local i = l.get_inventory(defines.inventory.lab_input)
        local c = i.get_item_count('utility-science-pack') n = n + c if c > 0 then k = k + 1 end end
      return {packs = n, labs = k} end)()""")


# ------------------------------------------------------------------ 짓기

def set_recipe_lua(ai, x, y, recipe, direction=None):
    """레시피 지정 (+ 유체 조립기는 레시피 뒤 회전). 빠진 재료는 근처 상자 대신 버리지 않게 돌려준 목록만 알린다."""
    return ai.lua("""(function()
      local e = game.surfaces[1].find_entities_filtered{type = 'assembling-machine', position = {%f, %f}, radius = 0.6}[1]
      if not e then return {err = 'none'} end
      local cur = e.get_recipe()
      if not (cur and cur.name == '%s') then e.set_recipe('%s') end
      %s
      return {recipe = e.get_recipe().name, d = e.direction} end)()""" % (
        x, y, recipe, recipe, ("e.direction = %d" % direction) if direction is not None else ""))


def run_plan(ai, who, plan, minutes=30, label=""):
    detached.mark([who], OWNER, minutes=minutes)
    try:
        ai.agent(who).cancel()
    except RconError:
        pass
    submit(ai, who, plan, strict=False)
    say(f"{who}: {label} {len(plan)} 단계")


def wait_idle(ai, crew, limit=900):
    t0 = time.time()
    time.sleep(3)
    while time.time() - t0 < limit:
        live = {w["name"]: w for w in ai.list()}
        if all(not (live[w].get("current") or live[w].get("queued")) for w in crew if w in live):
            return True
        time.sleep(4)
    return False


def kick(ai, who="golf"):
    # 노랑 레시피: 옛 로봇 조립기 (비어 있음 - 결과 0, 재료 0 확인 뒤)
    say("노랑 레시피: %s" % set_recipe_lua(ai, *YELLOW, "utility-science-pack"))
    plan = [walk(4.5, -3.5),
            ("insert", {"name": "copper-plate", "x": COPPER_CHEST[0], "y": COPPER_CHEST[1], "count": 350}),
            walk(-20.5, -10.5),
            ("take", {"name": "copper-plate", "x": COPPER_SRC[0], "y": COPPER_SRC[1], "count": 1000}),
            walk(4.5, -3.5),
            ("insert", {"name": "copper-plate", "x": COPPER_CHEST[0], "y": COPPER_CHEST[1], "count": 800}),
            ("take", {"name": "iron-plate", "x": IRON_CHEST[0], "y": IRON_CHEST[1], "count": 100}),
            ] + corridor_to(BATTERY[0]) + [
            ("insert", {"name": "iron-plate", "x": BATTERY[0], "y": BATTERY[1], "count": 100}),
            walk(12.5, CORR_Y)]
    run_plan(ai, who, plan, label="kick")


def stage_pu(ai, who):
    # 재료: 2형 둘 (강철 4 · 톱니 10 · 회로 6 · 1형 2) · 관 5 · 전봇대 1
    plan = [walk(-47.5, 2.5), ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": 200}),
            walk(-20.5, -10.5), ("take", {"name": "copper-plate", "x": COPPER_SRC[0], "y": COPPER_SRC[1], "count": 100}),
            walk(-7.5, -33.0), ("take", {"name": "steel-plate", "x": -5, "y": -32, "count": 60}),
            ("craft", {"recipe": "pipe", "count": 6}),
            ("craft", {"recipe": "assembling-machine-1", "count": 2}),
            ("craft", {"recipe": "assembling-machine-2", "count": 2}),
            ("craft", {"recipe": "small-electric-pole", "count": 2})]
    plan += east_strip(PU_STAND[1])
    plan += [b("pipe", x, y) for x, y in PU_PIPES]
    plan += [b("assembling-machine-2", x, y) for x, y in PU]
    plan += [b("small-electric-pole", *PU_POLE), walk(38.5, -8.0)]
    run_plan(ai, who, plan, label="pu")
    wait_idle(ai, [who])
    for x, y in PU:
        say("처리장치 레시피 %s: %s" % ((x, y), set_recipe_lua(ai, x, y, "processing-unit", N)))


def stage_tap(ai, who):
    """플라스틱 공장 (1.5,-44.5) 동쪽: 팔 (3.5,-44.5) 서쪽에서 집어 상자 (4.5,-44.5)."""
    plan = [walk(-47.5, 2.5), ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": 60}),
            ("craft", {"recipe": "iron-chest", "count": 1}), ("craft", {"recipe": "inserter", "count": 1}),
            walk(6.5, -41.5), b("iron-chest", *TAP_CHEST), b("inserter", TAP_INS[0], TAP_INS[1], W), walk(6.5, -40.5)]
    run_plan(ai, who, plan, label="tap")


# ------------------------------------------------------------------ 먹이 고리
#
# 사람이 물류다: 손제작 (회로 · 고급회로 · 저밀도) 을 기계에 직접 넣는다.
#   golf  = 지킴이: 로봇 줄 상자 (구리 · 철 · 강철) · 배터리 철 · 처리장치 걷기 -> 노랑 조립기 · 노랑 걷기 -> 연구소
#   나머지 = 제작꾼: 모자란 것부터 - 처리장치의 회로 · 고급회로, 노랑 조립기의 저밀도
HUB_Y, HUB_X = -52.5, [x + 0.5 for x in range(-86, -72)]
# 1-7 노랑 -> 연구소: 보라 고리 PB x=-83.5 (남행, 긴팔 16 이 집음) 의 서쪽 레인 (보라는 동쪽 레인 1) 에 옆치기.
#   상자 (-86.5,21.5) -> 팔 (-85.5,21.5) -> 벨트 (-84.5,21.5) 동향 -> (-83.5,21.5) 옆치기. 전봇대 (-85.5,22.5) -> (-81.5,23.5).
LABFEED_CHEST, LABFEED_INS, LABFEED_BELT, LABFEED_POLE = (-86.5, 21.5), (-85.5, 21.5), (-84.5, 21.5), (-85.5, 22.5)
LABFEED_STAND = (-87.5, 19.5)
# 1-5 배터리 철 자동: 상자 (24.5,-1.5) -> 팔 (24.5,-2.5) 북 (배터리 공장). 전봇대 (23.5,-2.5). 구역 안 - 유령 + 개인 로봇,
#   사람은 (16.5,-2.5) (구역 밖) 에서 상자에 철 (8칸) · 배터리 구리 상자 (22.5,-4.5) 에 구리 (6칸).
BATFE_CHEST, BATFE_INS, BATFE_POLE = (24.5, -1.5), (24.5, -2.5), (23.5, -2.5)
WEST_STAND = (16.5, -2.5)
REPAIR, REPAIR_FE = (33.5, -8.5), (30.5, -4.5)
TENDER = "golf"
LABS = [(-79.5, 22.5 + 3 * i) for i in range(8)] + [(-73.5, 22.5 + 3 * i) for i in range(8)]
PU_CIRC_CAP, PU_AC_CAP, Y_LDS_CAP = 200, 20, 30

SNAP_LUA = """(function()
  local s = game.surfaces[1]
  local function am(x, y) return s.find_entities_filtered{type = 'assembling-machine', position = {x, y}, radius = 0.6}[1] end
  local function ch(x, y) return s.find_entities_filtered{type = 'container', position = {x, y}, radius = 0.4}[1] end
  local function cnt(e, n) if not e then return 0 end
    if e.type == 'container' then return e.get_inventory(defines.inventory.chest).get_item_count(n) end
    return e.get_item_count(n) end
  local function inp(e, n) return e and e.get_inventory(defines.inventory.assembling_machine_input).get_item_count(n) or 0 end
  local function out(e, n) return e and e.get_inventory(defines.inventory.assembling_machine_output).get_item_count(n) or 0 end
  local o = {pu = {}}
  for i, p in pairs({ {%f, %f}, {%f, %f} }) do
    local e = am(p[1], p[2])
    o.pu[i] = {circ = inp(e, 'electronic-circuit'), ac = inp(e, 'advanced-circuit'), out = out(e, 'processing-unit')}
  end
  local y = am(%f, %f)
  o.y = {pu = inp(y, 'processing-unit'), lds = inp(y, 'low-density-structure'), frame = inp(y, 'flying-robot-frame'), out = out(y, 'utility-science-pack')}
  o.ychest = cnt(ch(%f, %f), 'utility-science-pack')
  o.tap = cnt(ch(%f, %f), 'plastic-bar')
  o.cu = cnt(ch(%f, %f), 'copper-plate')
  o.fe = cnt(ch(%f, %f), 'iron-plate')
  o.steelchest = cnt(ch(%f, %f), 'steel-plate')
  o.battery_fe = inp(am(%f, %f), 'iron-plate')
  o.batcu = cnt(ch(%f, %f), 'copper-plate')
  o.acidfe = cnt(ch(%f, %f), 'iron-plate')
  o.batout = cnt(ch(%f, %f), 'battery')
  o.ironsrc = cnt(ch(%f, %f), 'iron-plate')
  o.coppersrc = cnt(ch(%f, %f), 'copper-plate')
  local hub = {}
  for _, e in pairs(s.find_entities_filtered{type = {'container', 'logistic-container'}, area = {{-86, -53}, {-72, -52}}}) do
    hub[#hub + 1] = {x = e.position.x, y = e.position.y, fe = cnt(e, 'iron-plate'), cu = cnt(e, 'copper-plate')}
  end
  o.hub = hub
  local st = {}
  for _, p in pairs({%s}) do
    local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 1.2}[1]
    if f then st[#st + 1] = {x = f.position.x, y = f.position.y, n = f.get_output_inventory().get_item_count('steel-plate')} end
  end
  o.steel = st
  local bags = {}
  for _, c in pairs(s.find_entities_filtered{name = 'character', force = 'player'}) do
    local inv = c.get_main_inventory()
    if inv then
      local m = {x = c.position.x, y = c.position.y, q = c.crafting_queue_size, free = inv.count_empty_stacks()}
      for _, n in pairs({'electronic-circuit', 'advanced-circuit', 'low-density-structure', 'processing-unit', 'utility-science-pack',
                         'plastic-bar', 'steel-plate', 'iron-plate', 'copper-plate'}) do m[n] = inv.get_item_count(n) end
      bags[#bags + 1] = m
    end
  end
  o.bags = bags
  local ly = 0
  for _, l in pairs(s.find_entities_filtered{name = 'lab', force = 'player'}) do ly = ly + l.get_inventory(defines.inventory.lab_input).get_item_count('utility-science-pack') end
  o.labsy = ly
  local acs = {}
  for _, p in pairs({ {%f, %f}, {%f, %f} }) do acs[#acs + 1] = out(am(p[1], p[2]), 'advanced-circuit') end
  o.acam = acs
  o.actap = cnt(ch(%f, %f), 'advanced-circuit')
  local ld = {}
  for _, p in pairs({ {%f, %f}, {%f, %f} }) do
    local e = am(p[1], p[2])
    ld[#ld + 1] = {ok = e ~= nil, cu = inp(e, 'copper-plate'), steel = inp(e, 'steel-plate'), plastic = inp(e, 'plastic-bar'), out = out(e, 'low-density-structure')}
  end
  o.lds = ld
  local pc = {}
  for _, p in pairs({ {%f, %f}, {%f, %f} }) do pc[#pc + 1] = cnt(ch(p[1], p[2]), 'plastic-bar') end
  o.plch = pc
  local f2 = am(%f, %f)
  o.f2 = {ok = f2 ~= nil and f2.get_recipe() ~= nil, eeu = inp(f2, 'electric-engine-unit'), bat = inp(f2, 'battery'), circ = inp(f2, 'electronic-circuit'), steel = inp(f2, 'steel-plate')}
  local y2 = am(%f, %f)
  o.y2 = {ok = y2 ~= nil and y2.get_recipe() ~= nil, pu = inp(y2, 'processing-unit'), lds = inp(y2, 'low-density-structure'), frame = inp(y2, 'flying-robot-frame'), out = out(y2, 'utility-science-pack')}
  o.eeuout = out(am(%f, %f), 'electric-engine-unit')
  o.eeueng = inp(am(%f, %f), 'engine-unit')
  o.eeucirc = inp(am(%f, %f), 'electronic-circuit')
  o.repfe = cnt(ch(%f, %f), 'iron-plate')
  o.acid_s = inp(am(30.5, 6.5), 'sulfur')
  local fp = {}
  for _, f in pairs(s.find_entities_filtered{type = 'furnace', force = 'player'}) do
    local oi = f.get_output_inventory()
    if oi and f.status == defines.entity_status.full_output then
      local fe, cu = oi.get_item_count('iron-plate'), oi.get_item_count('copper-plate')
      if fe >= 40 or cu >= 40 then fp[#fp + 1] = {x = f.position.x, y = f.position.y, fe = fe, cu = cu} end
    end
  end
  o.furn = fp
  local lf = ch(%f, %f)
  o.labfeed = lf and cnt(lf, 'utility-science-pack') or nil
  o.stap = cnt(ch(%f, %f), 'sulfur')
  local es = {}
  for _, p in pairs({%s}) do es[#es + 1] = out(am(p[1], p[2]), 'engine-unit') end
  o.engsrc = es
  return o
end)()"""


def snap(ai, crew_pos=None):
    furn = ", ".join("{%s, %s}" % p for p in STEEL_FURN)
    r = ai.lua(SNAP_LUA % (PU[0] + PU[1] + YELLOW + YOUT + TAP_CHEST + COPPER_CHEST + IRON_CHEST + STEEL_CHEST
                           + BATTERY + BAT_CU + ACID_IRON + BAT_OUT + IRON_SRC + COPPER_SRC + (furn,) + AC_AM1[0] + AC_AM1[1] + ACTAP_CHEST + LDS[0] + LDS[1]
                           + PL_OUT[0][1] + PL_OUT[1][1] + F2 + Y2 + EEU + EEU + EEU + REPAIR_FE + LABFEED_CHEST + STAP_CHEST
                           + (", ".join("{%s, %s}" % p for p in ENGINE_SRC),)))
    r["engsrc"] = [int(v) for v in rows(r.get("engsrc"))]
    r["furn"] = rows(r.get("furn"))
    r["plch"] = [int(v) for v in rows(r.get("plch"))]
    r["acam"] = [int(v) for v in rows(r.get("acam"))]
    r["lds"] = rows(r.get("lds"))
    r["pu"] = rows(r.get("pu"))
    r["hub"] = rows(r.get("hub"))
    r["steel"] = rows(r.get("steel"))
    # 캐릭터 이름은 Lua 에서 모른다 (말 없는 몸) -> 위치로 이름을 붙인다
    bags = rows(r.get("bags"))
    named = {}
    if crew_pos:
        for name, (x, y) in crew_pos.items():
            best = min(bags, key=lambda m: (m["x"] - x) ** 2 + (m["y"] - y) ** 2, default=None)
            if best is not None and (best["x"] - x) ** 2 + (best["y"] - y) ** 2 < 1:
                named[name] = best
    r["bags"] = named
    return r


def d2(a, b_):
    return (a[0] - b_[0]) ** 2 + (a[1] - b_[1]) ** 2


def iron_from(sn, at, n):
    """철 n 을 집을 곳: 철 상자 (-49.5,0.5) 또는 허브 (가장 가까운 것)."""
    cands = []
    if sn["ironsrc"] >= n:
        cands.append((IRON_SRC, (IRON_SRC[0] + 2.0, IRON_SRC[1] + 2.0)))
    for h in sn["hub"]:
        if h["fe"] >= n:
            cands.append(((h["x"], h["y"]), (h["x"], HUB_Y + 2.0)))
    if not cands:
        return None
    return min(cands, key=lambda c: d2(c[0], at))


def copper_from(sn, at, n):
    cands = []
    if sn["coppersrc"] >= n + 500:
        cands.append((COPPER_SRC, (-20.5, -10.5)))
    for h in sn["hub"]:
        if h["cu"] >= n:
            cands.append(((h["x"], h["y"]), (h["x"], HUB_Y + 2.0)))
    if not cands:
        return None
    return min(cands, key=lambda c: d2(c[0], at))


def gather(sn, bag, at, item, n):
    """가방에 item 이 n 개 되게 집는 단계. 허브 · 철 상자 · 구리 상자 + full_output 화로 출력 (막혀 있던 판 - 집으면 화로가 다시 돈다).
    가까운 곳부터 여러 군데를 모아 n 을 채운다. 쓴 만큼 sn 에서 빼서 다음 사람이 같은 곳으로 헛걸음하지 않게 한다."""
    have = int(bag.get(item, 0))
    need = n - have
    if need <= 0:
        return [], True
    key = "fe" if item == "iron-plate" else "cu"
    cands = []
    for h in sn["hub"]:
        cands.append([h, (h["x"], h["y"]), (h["x"], HUB_Y + 2.0), key])
    if item == "iron-plate":
        cands.append([sn, IRON_SRC, (IRON_SRC[0] + 2.0, IRON_SRC[1] + 2.0), "ironsrc"])
    else:
        cands.append([sn, COPPER_SRC, (-20.5, -10.5), "coppersrc"])
    for f in sn.get("furn", []):
        cands.append([f, (f["x"], f["y"]), (f["x"] + 2.0, f["y"] + 0.5), key])
    cands = [c for c in cands if int(c[0].get(c[3], 0)) >= 20]
    total = sum(int(c[0].get(c[3], 0)) for c in cands)
    if total < need:
        return [], False
    steps, pos = [], at
    while need > 0 and cands:
        c = min(cands, key=lambda c: d2(c[1], pos))
        cands.remove(c)
        k = min(need, int(c[0][c[3]]) - (500 if c[3] == "coppersrc" else 0))
        if k < 20:
            continue
        c[0][c[3]] = int(c[0][c[3]]) - k
        steps += [walk(*c[2]), ("take", {"name": item, "x": c[1][0], "y": c[1][1], "count": k})]
        need -= k
        pos = c[1]
    return steps, need <= 0


def plastic_steps(sn, at, n):
    """플라스틱 n: 탭 상자 (4.5,-44.5) 또는 새 플라스틱 공장 결과 상자 (가장 가까운 것)."""
    cands = []
    if sn["tap"] >= n:
        cands.append((TAP_CHEST, (6.5, -41.5)))
    for (_, c), k in zip(PL_OUT, sn.get("plch", [])):
        if k >= n:
            cands.append((c, (c[0] + 0.5, c[1] + 1.5)))
    if not cands:
        return None
    (cx, cy), (sx, sy) = min(cands, key=lambda c: d2(c[0], at))
    return [walk(sx, sy), ("take", {"name": "plastic-bar", "x": cx, "y": cy, "count": n})]


def plastic_total(sn):
    return max([sn["tap"]] + list(sn.get("plch", [])))


def steel_from(sn, n):
    best = max(sn["steel"], key=lambda f: f["n"], default=None)
    if not best or best["n"] < n:
        return None
    return best


def job_circ(sn, who, bag, at, n=200):
    plan = []
    for item, k in (("iron-plate", n), ("copper-plate", int(n * 1.5))):
        need = k - int(bag.get("electronic-circuit", 0)) * (1 if item == "iron-plate" else 1.5)
        steps, ok = gather(sn, bag, at, item, int(max(0, need)))
        if not ok:
            return None
        plan += steps
    have = int(bag.get("electronic-circuit", 0))
    if n - have > 0:
        plan.append(("craft", {"recipe": "electronic-circuit", "count": n - have}))
    plan += east_strip(PU_STAND[1])
    for i, (x, y) in enumerate(PU):
        plan.append(("insert", {"name": "electronic-circuit", "x": x, "y": y, "count": n // 2}))
    plan.append(walk(38.5, -8.0))
    return plan


def job_ac(sn, who, bag, at, n=20):
    if plastic_total(sn) + int(bag.get("plastic-bar", 0)) < 2 * n:
        return None
    plan = []
    for item, k in (("iron-plate", 2 * n), ("copper-plate", 5 * n)):
        steps, ok = gather(sn, bag, at, item, k)
        if not ok:
            return None
        plan += steps
    if int(bag.get("plastic-bar", 0)) < 2 * n:
        ps = plastic_steps(sn, at, 2 * n)
        if not ps:
            return None
        plan += ps
    plan.append(("craft", {"recipe": "advanced-circuit", "count": n}))
    plan += east_strip(PU_STAND[1])
    for x, y in PU:
        plan.append(("insert", {"name": "advanced-circuit", "x": x, "y": y, "count": n // 2}))
    plan.append(walk(38.5, -8.0))
    return plan


def job_lds(sn, who, bag, at, n=10):
    if plastic_total(sn) + int(bag.get("plastic-bar", 0)) < 5 * n:
        return None
    plan = []
    if int(bag.get("steel-plate", 0)) < 2 * n:
        f = steel_from(sn, 2 * n)
        if not f:
            return None
        plan += [walk(f["x"] + 2.5, f["y"]), ("take", {"name": "steel-plate", "x": f["x"], "y": f["y"], "count": 2 * n})]
    steps, ok = gather(sn, bag, at, "copper-plate", 20 * n)
    if not ok:
        return None
    plan += steps
    if int(bag.get("plastic-bar", 0)) < 5 * n:
        ps = plastic_steps(sn, at, 5 * n)
        if not ps:
            return None
        plan += ps
    plan.append(("craft", {"recipe": "low-density-structure", "count": n}))
    y2 = sn.get("y2") or {}
    if y2.get("ok") and sn["y"]["lds"] >= 30 and y2.get("lds", 0) < 60:
        plan += [walk(8.5, -2.0), walk(*HUB2_STAND), ("insert", {"name": "low-density-structure", "x": Y2[0], "y": Y2[1], "count": n})]
    else:
        plan += corridor_to(YELLOW[0])
        plan += [("insert", {"name": "low-density-structure", "x": YELLOW[0], "y": YELLOW[1], "count": n}), walk(12.5, CORR_Y)]
    return plan


def job_acgrab(sn, who, bag, at):
    """고급회로 잉여 (탭 상자 + p26 AM1 결과) -> 처리장치."""
    have = sn["actap"] + sum(sn["acam"])
    if have < 6:
        return None
    plan = [walk(-15.0, -30.0)]
    if sn["actap"] > 0:
        plan.append(("take", {"name": "advanced-circuit", "x": ACTAP_CHEST[0], "y": ACTAP_CHEST[1], "count": sn["actap"]}))
    for (x, y), n in zip(AC_AM1, sn["acam"]):
        if n > 0:
            plan.append(("take", {"name": "advanced-circuit", "x": x, "y": y, "count": n}))
    total = have + int(bag.get("advanced-circuit", 0))
    plan += east_strip(PU_STAND[1])
    plan += [("insert", {"name": "advanced-circuit", "x": x, "y": y, "count": max(1, total // 2)}) for x, y in PU]
    plan.append(walk(38.5, -8.0))
    return plan


def job_ldsfeed(sn, who, bag, at):
    """저밀도 2형: 구리 · 강철 넣고 (플라스틱은 팔이) 결과를 노랑 조립기로."""
    ms = [m for m in sn["lds"] if m.get("ok")]
    if not ms:
        return None
    low = any(m["cu"] < 60 or m["steel"] < 6 for m in ms)
    outn = sum(m["out"] for m in ms)
    if not low and outn < 6:
        return None
    plan = []
    if low:
        steps, ok = gather(sn, bag, at, "copper-plate", 400)
        if not ok:
            return None
        plan += steps
        if int(bag.get("steel-plate", 0)) < 40:
            f = steel_from(sn, 40)
            if f:
                plan += [walk(f["x"] + 2.5, f["y"]), ("take", {"name": "steel-plate", "x": f["x"], "y": f["y"], "count": 40})]
    plan.append(walk(*LDS_STAND))
    for (x, y), m in zip(LDS, sn["lds"]):
        if not m.get("ok"):
            continue
        if low:
            plan += [("insert", {"name": "copper-plate", "x": x, "y": y, "count": 200}),
                     ("insert", {"name": "steel-plate", "x": x, "y": y, "count": 20})]
        if m["out"] > 0:
            plan.append(("take", {"name": "low-density-structure", "x": x, "y": y, "count": m["out"]}))
    if outn + int(bag.get("low-density-structure", 0)) > 0:
        n = outn + int(bag.get("low-density-structure", 0))
        y2 = sn.get("y2") or {}
        if y2.get("ok") and sn["y"]["lds"] >= 30 and y2.get("lds", 0) < 60:
            plan += [walk(8.5, -2.0), walk(*HUB2_STAND), ("insert", {"name": "low-density-structure", "x": Y2[0], "y": Y2[1], "count": n})]
        else:
            plan += corridor_to(YELLOW[0])
            plan += [("insert", {"name": "low-density-structure", "x": YELLOW[0], "y": YELLOW[1], "count": n}), walk(12.5, CORR_Y)]
    return plan


def job_sulfur(sn, who, bag, at):
    """황산 공장 (30.5,6.5) 에 황 (황 탭 상자에서) - 동쪽 띠 (38.5,6.5) 에서 8칸."""
    if sn.get("acid_s", 99) >= 10 or sn.get("stap", 0) + int(bag.get("sulfur", 0)) < 20:
        return None
    plan = []
    if int(bag.get("sulfur", 0)) < 20:
        plan += [walk(-15.0, -30.0), ("take", {"name": "sulfur", "x": STAP_CHEST[0], "y": STAP_CHEST[1], "count": min(200, sn["stap"])})]
    plan += east_strip(-4.5) + [walk(39.5, 6.5), ("insert", {"name": "sulfur", "x": 30.5, "y": 6.5, "count": 100}), walk(38.5, -8.0)]
    return plan


def job_f2(sn, who, bag, at):
    """둘째 프레임 조립기: 전기엔진 (전기엔진 조립기 결과, 복도) · 배터리 (넘침 상자, 동쪽 띠) · 회로 · 강철."""
    f = sn.get("f2") or {}
    if not f.get("ok"):
        return None
    eng_low = sn.get("eeueng", 99) < 4 and sum(sn.get("engsrc", [])) >= 4
    if f["eeu"] >= 2 and f["bat"] >= 4 and f["circ"] >= 6 and f["steel"] >= 2 and not eng_low:
        return None
    plan = []
    if eng_low:
        plan += [("take", {"name": "engine-unit", "x": x, "y": y, "count": n})
                 for (x, y), n in zip(ENGINE_SRC, sn["engsrc"]) if n > 0]
        plan += corridor_to(EEU[0]) + [("insert", {"name": "engine-unit", "x": EEU[0], "y": EEU[1], "count": 40})]
    circ_have = int(bag.get("electronic-circuit", 0))
    if f["circ"] < 6 and circ_have < 30:
        for item, k in (("iron-plate", 30), ("copper-plate", 45)):
            steps, ok = gather(sn, bag, at, item, k)
            if not ok:
                return None
            plan += steps
        plan.append(("craft", {"recipe": "electronic-circuit", "count": 30}))
    if f["steel"] < 2 and int(bag.get("steel-plate", 0)) < 10:
        fu = steel_from(sn, 20)
        if fu:
            plan += [walk(fu["x"] + 2.5, fu["y"]), ("take", {"name": "steel-plate", "x": fu["x"], "y": fu["y"], "count": 20})]
    if f["bat"] < 4 and sn.get("batout", 0) > 0:
        plan += east_strip(-3.5) + [walk(35.5, -3.5), ("take", {"name": "battery", "x": BAT_OUT[0], "y": BAT_OUT[1], "count": 60}),
                                    walk(38.5, -8.0)]
    if f["eeu"] < 2 and sn.get("eeuout", 0) > 0:
        plan += corridor_to(EEU[0]) + [("take", {"name": "electric-engine-unit", "x": EEU[0], "y": EEU[1], "count": sn["eeuout"]})]
    if not plan:
        return None      # 가져올 것이 없다 (전기엔진이 없으면 기다린다 - 10초마다 헛걸음하지 않게)
    plan += [walk(8.5, CORR_Y), walk(*HUB2_STAND)]
    for item, k in (("electric-engine-unit", 20), ("battery", 60), ("electronic-circuit", 30), ("steel-plate", 20)):
        plan.append(("insert", {"name": item, "x": F2[0], "y": F2[1], "count": k}))
    return plan


def job_tend(sn, bag, at):
    plan = []
    pu_have = int(bag.get("processing-unit", 0))
    # 처리장치 걷기
    if sum(p["out"] for p in sn["pu"]) >= 2:
        pu_have += sum(p["out"] for p in sn["pu"])
        plan += east_strip(PU_STAND[1])
        plan += [("take", {"name": "processing-unit", "x": x, "y": y, "count": p["out"]})
                 for (x, y), p in zip(PU, sn["pu"]) if p["out"] > 0]
        plan.append(walk(38.5, -8.0))
    # 구리 상자
    if sn["cu"] < 300:
        steps, ok = gather(sn, bag, at, "copper-plate", 800)
        if ok:
            plan += steps + [walk(4.5, -3.5), ("insert", {"name": "copper-plate", "x": COPPER_CHEST[0], "y": COPPER_CHEST[1], "count": 800})]
    # 엔진 · 프레임 강철 (벨트 머리 상자)
    if sn["steelchest"] < 20:
        f = steel_from(sn, 50)
        if f:
            plan += [walk(f["x"] + 2.5, f["y"]), ("take", {"name": "steel-plate", "x": f["x"], "y": f["y"], "count": 50}),
                     walk(10.5, -15.0), ("insert", {"name": "steel-plate", "x": STEEL_CHEST[0], "y": STEEL_CHEST[1], "count": 50})]
    # 회로 조립기 철 상자 (회로 -> 벨트 -> 전기엔진 · 프레임): 비면 전기엔진이 서고 프레임이 선다
    if sn["fe"] < 100:
        steps, ok = gather(sn, bag, at, "iron-plate", 300)
        if ok:
            plan += steps + [walk(10.5, -3.5), ("insert", {"name": "iron-plate", "x": IRON_CHEST[0], "y": IRON_CHEST[1], "count": 300})]
    # 전기엔진 조립기에 회로를 손으로 (벨트 회로가 모자랄 때)
    if sn.get("eeucirc", 99) < 6:
        if int(bag.get("electronic-circuit", 0)) < 40:
            for item, k in (("iron-plate", 40), ("copper-plate", 60)):
                steps, ok = gather(sn, bag, at, item, k)
                plan += steps
            plan.append(("craft", {"recipe": "electronic-circuit", "count": 40}))
        plan += corridor_to(EEU[0]) + [("insert", {"name": "electronic-circuit", "x": EEU[0], "y": EEU[1], "count": 40})]
    # 0-10 수리팩: 톱니 조립기 철 상자 (30.5,-4.5) - 동쪽 띠 (35.5,-4.5) 에서 5칸
    if sn.get("repfe", 999) < 50:
        steps, ok = gather(sn, bag, at, "iron-plate", 200)
        if ok:
            plan += steps + east_strip(-4.5) + [walk(35.5, -4.5), ("insert", {"name": "iron-plate", "x": REPAIR_FE[0], "y": REPAIR_FE[1], "count": 200}),
                                               walk(38.5, -8.0)]
    # 배터리 구리 · 황산 철
    if sn["batcu"] < 60:
        steps, ok = gather(sn, bag, at, "copper-plate", 300)
        if ok:
            plan += steps + corridor_to(BAT_CU[0]) + [("insert", {"name": "copper-plate", "x": BAT_CU[0], "y": BAT_CU[1], "count": 300})]
    if sn["acidfe"] < 20:
        steps, ok = gather(sn, bag, at, "iron-plate", 100)
        if ok:
            plan += steps + east_strip(4.5) + [("insert", {"name": "iron-plate", "x": ACID_IRON[0], "y": ACID_IRON[1], "count": 100}),
                                              walk(38.5, -8.0)]
    # 노랑 조립기: 처리장치 · 저밀도 넣고 노랑 걷기, 배터리 철
    plan += corridor_to(YELLOW[0])
    y2 = sn.get("y2") or {}
    to_y2 = y2.get("ok") and sn["y"]["pu"] >= 30
    if pu_have > 0 and not to_y2:
        plan.append(("insert", {"name": "processing-unit", "x": YELLOW[0], "y": YELLOW[1], "count": pu_have}))
    if int(bag.get("low-density-structure", 0)) > 0:
        plan.append(("insert", {"name": "low-density-structure", "x": YELLOW[0], "y": YELLOW[1], "count": 100}))
    if sn["ychest"] > 0:
        plan.append(("take", {"name": "utility-science-pack", "x": YOUT[0], "y": YOUT[1], "count": sn["ychest"]}))
    if sn["battery_fe"] < 30:
        if sn["fe"] >= 150:
            plan += [walk(8.5, CORR_Y), ("take", {"name": "iron-plate", "x": IRON_CHEST[0], "y": IRON_CHEST[1], "count": 100})]
        else:
            steps, ok = gather(sn, bag, at, "iron-plate", 100)
            plan += steps + corridor_to(BATTERY[0]) if ok else []
        plan += [walk(BATTERY[0], CORR_Y), ("insert", {"name": "iron-plate", "x": BATTERY[0], "y": BATTERY[1], "count": 100})]
    # 둘째 노랑: 처리장치 (첫째가 넉넉하면) 넣고 결과 걷기
    if y2.get("ok") and (to_y2 and pu_have > 0 or y2.get("out", 0) > 0):
        plan += [walk(8.5, CORR_Y), walk(*HUB2_STAND)]
        if to_y2 and pu_have > 0:
            plan.append(("insert", {"name": "processing-unit", "x": Y2[0], "y": Y2[1], "count": pu_have}))
        if y2.get("out", 0) > 0:
            plan.append(("take", {"name": "utility-science-pack", "x": Y2[0], "y": Y2[1], "count": y2["out"]}))
    # 노랑 -> 연구소 (보라 고리 옆치기 상자가 서 있으면 그 상자로, 없으면 연구소마다)
    ybag = int(bag.get("utility-science-pack", 0)) + sn["ychest"] + int(y2.get("out", 0) or 0)
    if sn.get("labfeed") is not None and ybag >= 3:
        plan += [walk(12.5, CORR_Y), walk(*LABFEED_STAND),
                 ("insert", {"name": "utility-science-pack", "x": LABFEED_CHEST[0], "y": LABFEED_CHEST[1], "count": ybag}),
                 walk(8.5, CORR_Y)]
    elif ybag >= 30 or (ybag >= 3 and sn.get("labsy", 0) < 16):
        per = max(1, ybag // len(LABS))
        plan += [walk(12.5, CORR_Y), walk(-76.5, 20.0)]
        plan += [("insert", {"name": "utility-science-pack", "x": x, "y": y, "count": per}) for x, y in LABS]
        plan += [walk(-76.5, 20.0), walk(8.5, CORR_Y)]
    plan.append(walk(YELLOW[0], CORR_Y))
    return plan


ORDERS = os.path.join(HERE, "..", "state", "yellow23_orders.json")


def take_order(who):
    """따로 줄 일 (state/yellow23_orders.json: {이름: [[단계, {..}], ..]}) - 손이 비면 먼저 준다."""
    try:
        with open(ORDERS, encoding="utf-8") as fh:
            o = json.load(fh)
    except (OSError, ValueError):
        return None
    plan = o.pop(who, None)
    if plan is None:
        return None
    with open(ORDERS, "w", encoding="utf-8") as fh:
        json.dump(o, fh, ensure_ascii=False)
    return [tuple(st) for st in plan]


def put_order(who, plan):
    try:
        with open(ORDERS, encoding="utf-8") as fh:
            o = json.load(fh)
    except (OSError, ValueError):
        o = {}
    o[who] = [list(st) for st in plan]
    with open(ORDERS, "w", encoding="utf-8") as fh:
        json.dump(o, fh, ensure_ascii=False)


def feed(ai, crew, minutes, measure_every=600):
    tender = TENDER if TENDER in crew else None
    makers = [w for w in crew if w != tender]
    jobs = {}                     # who -> (kind, t0)
    t_end = time.time() + minutes * 60
    t_meas = 0
    say(f"먹이 고리 시작: 지킴이 {tender} · 제작꾼 {makers} · {minutes}분")
    while time.time() < t_end:
        live = {w["name"]: w for w in ai.list()}
        pos = {w: (live[w]["x"], live[w]["y"]) for w in crew if w in live}
        try:
            sn = snap(ai, pos)
        except RconError as e:
            say(f"snap 실패 {e}")
            time.sleep(10)
            continue
        busy = {w for w in crew if w in live and (live[w].get("current") or live[w].get("queued"))}
        detached.mark(crew, OWNER, minutes=15)
        inflight = {}
        for w in busy:
            if w in jobs:
                inflight[jobs[w][0]] = inflight.get(jobs[w][0], 0) + 1
        for w in crew:
            if w in busy or w not in live or not live[w].get("alive", True):
                continue
            bag = sn["bags"].get(w, {})
            at = pos[w]
            plan, kind = None, None
            special = take_order(w)
            if special:
                plan, kind = special, "order"
            elif w == tender:
                plan, kind = job_tend(sn, bag, at), "tend"
            else:
                circ = sum(p["circ"] for p in sn["pu"]) + 200 * inflight.get("circ", 0)
                ac = sum(p["ac"] for p in sn["pu"]) + 20 * inflight.get("ac", 0)
                lds = min(sn["y"]["lds"], (sn.get("y2") or {}).get("lds", 999) if (sn.get("y2") or {}).get("ok") else 999)                     + 10 * inflight.get("lds", 0)
                order = []
                if inflight.get("sulfur", 0) == 0:
                    order.append("sulfur")
                if ac < PU_AC_CAP and inflight.get("acgrab", 0) == 0:
                    order.append("acgrab")
                if inflight.get("ldsfeed", 0) == 0:
                    order.append("ldsfeed")
                if inflight.get("f2", 0) == 0:
                    order.append("f2")
                if ac < PU_AC_CAP:
                    order.append("ac")
                if lds < Y_LDS_CAP:
                    order.append("lds")
                if circ < 2 * PU_CIRC_CAP:
                    order.append("circ")
                # 회로가 넉넉해도 고급회로 · 저밀도가 막히면 (플라스틱 없음) 회로를 쌓아 둔다
                for k in order + (["circ"] if circ < 3 * PU_CIRC_CAP and "circ" not in order else []):
                    plan = {"circ": job_circ, "ac": job_ac, "lds": job_lds, "acgrab": job_acgrab, "ldsfeed": job_ldsfeed, "f2": job_f2, "sulfur": job_sulfur}[k](sn, w, bag, at)
                    if plan:
                        kind = k
                        break
            if plan:
                try:
                    submit(ai, w, plan, strict=False)
                    jobs[w] = (kind, time.time())
                    inflight[kind] = inflight.get(kind, 0) + 1
                    say(f"{w}: {kind} ({len(plan)} 단계)")
                    nlab = sum(st[1].get("count", 0) for st in plan
                               if st[0] == "insert" and st[1].get("name") == "utility-science-pack")
                    if nlab:
                        say(f"연구소 노랑 투입 {nlab} (예정, {w} · 연구소 {sum(1 for st in plan if st[0] == 'insert' and st[1].get('name') == 'utility-science-pack')}대)")
                except RconError as e:
                    say(f"{w}: {kind} 제출 실패 {e}")
        if time.time() - t_meas >= measure_every:
            t_meas = time.time()
            r = status(ai)
            say("측정 " + json.dumps({"tick": r.get("tick"), "research": r.get("research"), "progress": round(r.get("progress", 0), 4),
                                     "prod10": r.get("prod10"), "labs": lab_yellow(ai), "tap": sn["tap"], "pu": sn["pu"], "y": sn["y"]},
                                    ensure_ascii=False))
        time.sleep(10)
    detached.release(crew)
    say("먹이 고리 끝")


def set_filter(ai, x, y, item):
    """필터 팔 (build 는 필터를 모른다 - science_block.py 와 같은 방식). 기존 필터가 있으면 건드리지 않는다."""
    return ai.lua("""(function()
      local i = game.surfaces[1].find_entities_filtered{type = 'inserter', position = {%f, %f}, radius = 0.3}[1]
      if not i then return {err = 'none'} end
      local cur = i.get_filter(1)
      if cur and (type(cur) == 'table' and cur.name or cur) ~= '%s' then return {err = 'has other filter', cur = serpent.line(cur)} end
      i.use_filters = true
      i.inserter_filter_mode = 'whitelist'
      i.set_filter(1, '%s')
      return {ok = true} end)()""" % (x, y, item, item))


def stage_actap(ai, who):
    plan = [walk(-47.5, 2.5), ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": 30}),
             ("craft", {"recipe": "iron-chest", "count": 1}), ("craft", {"recipe": "inserter", "count": 1}),
             walk(-15.0, -30.0), b("iron-chest", *ACTAP_CHEST), b("inserter", ACTAP_INS[0], ACTAP_INS[1], W), walk(-14.5, -29.0)]
    run_plan(ai, who, plan, label="actap")
    wait_idle(ai, [who], 300)
    say("고급회로 탭 필터: %s" % set_filter(ai, *ACTAP_INS, "advanced-circuit"))


def stage_stap(ai, who):
    plan = [walk(-47.5, 2.5), ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": 30}),
            ("craft", {"recipe": "iron-chest", "count": 1}), ("craft", {"recipe": "inserter", "count": 1}),
            walk(-15.0, -30.0), b("iron-chest", *STAP_CHEST), b("inserter", STAP_INS[0], STAP_INS[1], W), walk(-14.5, -29.0)]
    run_plan(ai, who, plan, label="stap")
    wait_idle(ai, [who], 300)
    say("황 탭 필터: %s" % set_filter(ai, *STAP_INS, "sulfur"))


def stage_lds(ai, who):
    plan = [walk(12.5, -15.0), ("take", {"name": "iron-plate", "x": GEAR_CHEST[0], "y": GEAR_CHEST[1], "count": 90}),
            ("craft", {"recipe": "assembling-machine-1", "count": 2}),
            ("craft", {"recipe": "assembling-machine-2", "count": 2}),
            ("craft", {"recipe": "inserter", "count": 2}),
            ("craft", {"recipe": "small-electric-pole", "count": 1}),
            walk(*LDS_STAND)]
    plan += [b("assembling-machine-2", x, y) for x, y in LDS]
    plan += [b("inserter", x, y, d) for (x, y), d in LDS_INS]
    plan += [b("small-electric-pole", *LDS_POLE), walk(*LDS_STAND)]
    run_plan(ai, who, plan, label="lds")
    wait_idle(ai, [who], 600)
    for x, y in LDS:
        say("저밀도 레시피 %s: %s" % ((x, y), set_recipe_lua(ai, x, y, "low-density-structure")))


def oil_ghosts():
    g = [("pipe-to-ground", x, y, d) for (x, y), d in OIL_PTG]
    g += [("pipe", x, y, N) for x, y in OIL_PIPES]
    g += [("chemical-plant", x, y, N) for x, y in PL]
    g += [("iron-chest", cx, cy, N) for (_, (cx, cy)) in PL_COAL + PL_OUT]
    g += [("inserter", ix, iy, S) for ((ix, iy), _) in PL_COAL]
    g += [("inserter", ix, iy, N) for ((ix, iy), _) in PL_OUT]
    g += [("small-electric-pole", x, y, N) for x, y in PL_POLES]
    g += [("medium-electric-pole", 13.5, 11.5, N)]
    return g


def place_ghosts(ai, ghosts, recipe_at=None):
    """로봇 유령 (개인 로보포트가 사람 가방의 재료로 짓는다). 이미 선 것 · 유령은 건너뛴다."""
    body = ", ".join("{'%s', %s, %s, %d}" % g for g in ghosts)
    rec = ", ".join("{%s, %s, '%s'}" % (x, y, r) for (x, y), r in (recipe_at or {}).items())
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local o = {placed = 0, stood = 0, blocked = {}}
      for _, g in pairs({%s}) do
        if s.count_entities_filtered{name = g[1], position = {g[2], g[3]}, radius = 0.3} > 0
           or s.count_entities_filtered{ghost_name = g[1], position = {g[2], g[3]}, radius = 0.3} > 0 then o.stood = o.stood + 1
        else
          local e = s.create_entity{name = 'entity-ghost', inner_name = g[1], position = {g[2], g[3]}, direction = g[4], force = f}
          if e then o.placed = o.placed + 1 else o.blocked[#o.blocked + 1] = g[1] .. '@' .. g[2] .. ',' .. g[3] end
        end
      end
      for _, r in pairs({%s}) do
        local e = s.find_entities_filtered{ghost_name = 'chemical-plant', position = {r[1], r[2]}, radius = 0.3}[1]
          or s.find_entities_filtered{name = 'chemical-plant', position = {r[1], r[2]}, radius = 0.3}[1]
        if e then pcall(function() e.set_recipe(r[3]) end) end
      end
      return o end)()""" % (body, rec))


def stage_oil(ai, who):
    rec = {p: "plastic-bar" for p in PL}
    say("정유 유령: %s" % place_ghosts(ai, oil_ghosts(), rec))
    plan = [walk(12.5, -15.0), ("take", {"name": "iron-plate", "x": GEAR_CHEST[0], "y": GEAR_CHEST[1], "count": 120}),
            ("take", {"name": "steel-plate", "x": STEEL_CHEST[0], "y": STEEL_CHEST[1], "count": 12}),
            ("craft", {"recipe": "pipe", "count": 38}),
            ("craft", {"recipe": "pipe-to-ground", "count": 2}),
            ("craft", {"recipe": "chemical-plant", "count": 2}),
            ("craft", {"recipe": "iron-chest", "count": 4}),
            ("craft", {"recipe": "inserter", "count": 4}),
            ("craft", {"recipe": "small-electric-pole", "count": 4}),
            walk(8.5, -2.0), walk(*PL_STAND), ("wait", {"ticks": 1800})]
    run_plan(ai, who, plan, minutes=20, label="oil")


def battery_gate(ai):
    """배터리 넘침 팔 (27.5,-3.5) 은 프레임 조립기 (25.5,-8.5) 에 배터리가 4 이상일 때만 (빨강 선, 조립기 내용 읽기).
    넘친 배터리 상자는 둘째 프레임 조립기 몫."""
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local ins = s.find_entities_filtered{type = 'inserter', position = {27.5, -3.5}, radius = 0.2}[1]
      local fr = s.find_entities_filtered{type = 'assembling-machine', position = {%f, %f}, radius = 0.3}[1]
      if not (ins and fr) then return {err = 'missing'} end
      local a = ins.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      local b = fr.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      local ok = a.connect_to(b, false)
      local fc = fr.get_or_create_control_behavior()
      fc.circuit_read_contents = true
      local cb = ins.get_or_create_control_behavior()
      cb.circuit_enable_disable = true
      cb.circuit_condition = {comparator = '>=', first_signal = {type = 'item', name = 'battery'}, constant = 4}
      return {connected = ok, status = ins.status} end)()""" % FRAME)


def stage_labfeed(ai, who):
    plan = [walk(-47.5, 2.5), ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": 30}),
            ("craft", {"recipe": "iron-chest", "count": 1}), ("craft", {"recipe": "inserter", "count": 1}),
            ("craft", {"recipe": "transport-belt", "count": 2}), ("craft", {"recipe": "small-electric-pole", "count": 1}),
            walk(*LABFEED_STAND), b("iron-chest", *LABFEED_CHEST), b("inserter", LABFEED_INS[0], LABFEED_INS[1], W),
            b("transport-belt", LABFEED_BELT[0], LABFEED_BELT[1], E), b("small-electric-pole", *LABFEED_POLE), walk(*LABFEED_STAND)]
    return plan


def stage_batfe(ai):
    """배터리 철 상자 유령 + 사람 (개인 로봇) 이 짓고 철 · 구리를 채우는 계획."""
    say("배터리 철 유령: %s" % place_ghosts(ai, [("iron-chest", BATFE_CHEST[0], BATFE_CHEST[1], N),
                                             ("inserter", BATFE_INS[0], BATFE_INS[1], S),
                                             ("small-electric-pole", BATFE_POLE[0], BATFE_POLE[1], N)]))
    return [("craft", {"recipe": "iron-chest", "count": 1}), ("craft", {"recipe": "inserter", "count": 1}),
            ("craft", {"recipe": "small-electric-pole", "count": 1}),
            walk(8.5, -2.0), walk(*WEST_STAND), ("wait", {"ticks": 600}),
            ("insert", {"name": "iron-plate", "x": BATFE_CHEST[0], "y": BATFE_CHEST[1], "count": 400}),
            ("insert", {"name": "copper-plate", "x": BAT_CU[0], "y": BAT_CU[1], "count": 400}), walk(8.5, -2.0)]


def stage_hub2(ai, who):
    plan = [walk(15.5, 0.5), ("take", {"name": "iron-plate", "x": PIPE_CHEST[0], "y": PIPE_CHEST[1], "count": 70}),
            ("craft", {"recipe": "assembling-machine-1", "count": 2}),
            ("craft", {"recipe": "assembling-machine-2", "count": 2}),
            ("craft", {"recipe": "inserter", "count": 1}),
            ("craft", {"recipe": "medium-electric-pole", "count": 1}),
            walk(*HUB2_STAND), b("assembling-machine-2", *F2), b("assembling-machine-2", *Y2),
            b("inserter", F2_INS[0], F2_INS[1], W), b("medium-electric-pole", *HUB2_POLE), walk(*HUB2_STAND)]
    run_plan(ai, who, plan, label="hub2")
    wait_idle(ai, [who], 600)
    say("둘째 프레임: %s" % set_recipe_lua(ai, *F2, "flying-robot-frame"))
    say("둘째 노랑: %s" % set_recipe_lua(ai, *Y2, "utility-science-pack"))


def oil_switch(ai):
    """정유 레시피 전환 (플라스틱 공장이 선 뒤)."""
    return set_recipe_lua(ai, *REFINERY, "basic-oil-processing")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kick", action="store_true")
    ap.add_argument("--feed", action="store_true")
    ap.add_argument("--minutes", type=float, default=120)
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    ap.add_argument("--measure", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    crew = [w for w in a.who.split(",") if w]
    if a.feed:
        feed(ai, crew, a.minutes)
        return 0
    if a.kick:
        kick(ai, crew[0] if crew else "golf")
    elif a.stage == "pu":
        stage_pu(ai, crew[0])
    elif a.stage == "tap":
        stage_tap(ai, crew[0])
    elif a.stage == "actap":
        stage_actap(ai, crew[0])
    elif a.stage == "oil":
        stage_oil(ai, crew[0])
    elif a.stage == "hub2":
        stage_hub2(ai, crew[0])
    elif a.stage == "batgate":
        say("배터리 넘침 팔 조건: %s" % battery_gate(ai))
    elif a.stage == "oilswitch":
        say("정유 레시피: %s" % oil_switch(ai))
    elif a.stage == "stap":
        stage_stap(ai, crew[0])
    elif a.stage == "lds":
        stage_lds(ai, crew[0])
    r = status(ai)
    if a.measure:
        say("측정 " + json.dumps({"tick": r.get("tick"), "research": r.get("research"), "progress": round(r.get("progress", 0), 4),
                                "prod10": r.get("prod10"), "labs": lab_yellow(ai)}, ensure_ascii=False))
    else:
        print(json.dumps(r, ensure_ascii=False, indent=1))
        print("연구소 노랑:", lab_yellow(ai))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

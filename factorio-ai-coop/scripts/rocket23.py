"""P6 로켓 연료 블록 + P8 사일로 자재 비축 (docs/rocket-plan-run23.md, 09-28 20:5x).

레시피 실측 (tick 21.54M, 2.0):
  rocket-fuel 15 s = 고체연료 10 + 경유 10 (crafting-with-fluid -> 조립기2)
  solid-fuel-from-light-oil 1 s = 경유 10 -> 1 (화학) · -from-heavy-oil 중유 20 · -from-petroleum-gas 가스 20
  rocket-part 3 s = 처리장치 10 · LDS 10 · 로켓 연료 10 (부품 100 = 1 발)
  rocket-silo 30 s = 강철 1,000 · 처리장치 200 · 전기엔진 200 · 관 100 · 콘크리트 1,000 (9×9, 모듈 4 칸, 3.99 MW)
  concrete 10 s = 철광석 1 · 벽돌 5 · 물 100 -> 10

P6 설계 (북쪽 분해 공장 동쪽 빈 땅, x 14..27 · y -54..-43, 로봇 유령 - delta-trap 구역 밖):
  경유 = 중유 분해 HC (11.5,-51.5) 출구 관 (9.5,-50.5) (정유 R1 · R2 경유와 한 덩어리 -> 경유 분해 LC1 · LC2 로 가던 것)
    -> 관 (9.5,-49.5) (9.5,-48.5) -> 지하 (10.5,-48.5)W ↔ (14.5,-48.5)E (중유 관 x=12.5..13.5 밑)
    -> 간선 y=-48.5 x 15.5..24.5
  북 줄 (남향 d8, 입구 = 간선):  조립기2 RF-A (16.5,-50.5) ← 팔 ← 화학 SF-N (20.5,-50.5) → 팔 → 조립기2 RF-B (24.5,-50.5)
  남 줄 (북향 d0, 입구 = 간선):  조립기2 RF-C (16.5,-46.5) ← 팔 ← 화학 SF-S (20.5,-46.5) → 팔 → 조립기2 RF-D (24.5,-46.5)
  RF 출력 팔 -> 공급 (passive) 상자 4 (y -53.5 · -43.5), 로보포트 (29,-47) 로 망 2 에 붙임 (지금 이 땅은 물류 범위 밖).
  모듈: 망 생산 모듈 1 -> 화학 3 · 조립기2 2 (연료 1 개당 경유 110 -> ~96).
  전력: 증기 1 분 평균 >= 최대 발전 - 2 MW 면 블록 6 대 · 콘크리트 active=false, <= 최대 - 5 MW 면 다시 (storage.rocket23_pause, 36 MW 때 34/31).
  경유: SF 1 대 8.5/s + RF 4 대 ~1.8/s. 연구 중 (rocket-silo 미완) 에는 SF-S 를 active=false (가스 몫 보존),
        RF-C · D 는 중유 고체연료 상자 (19.5,15.5, 1,277 개) 를 Lua 로 옮겨 먹인다.

P8 비축 (Lua, 기존 아이템만): 사일로 자재 상자 = 강철 상자 (5.5,19.5) (망 밖 - 로봇이 다른 데 못 씀)
  관: 관 조립기 3 대 출력 (full_output 100) / 강철: 망 1,500 (연구 뒤 800) 넘는 몫 / 처리장치: 망 (pu23 이 노랑 몫 뒤 망에 < 300 채움) + 망 노랑 >= 600 이면 처리장치 조립기 출력 /
  전기엔진: 조립기 (21.5,-8.5) 출력 (망 노랑 >= 400 이면 2 남기고, 아니면 10 남기고) /
  콘크리트: artyprep23 CONC 조립기2 (-26.5,-61.5) - 벽돌 망 (250 남김) · 철광석 철 전초 벨트에서 Lua, 출력 -> 상자.
            CONC -> 포탑 조립기 팔 (-24.5,-61.5) 은 비축 동안 active=false, 1,000 차면 되돌림 (필터 · 팔 삭제 없음).
  사일로 자리 (계획): 중심 (12.5,24.5) - 정유 남쪽 빈 땅 x 8..16 · y 20..28, 서쪽 x 4..7 에 요청 상자 · 팔.

    python -u scripts/rocket23.py survey     # 자리 · 재고
    python -u scripts/rocket23.py fluid      # 오프라인 유체 검사 (fluidnet)
    python -u scripts/rocket23.py make       # 조립기2 · 공급 상자 (전봇대 조립기 빌림)
    python -u scripts/rocket23.py place      # 나무 해체 + 유령
    python -u scripts/rocket23.py check
    python -u scripts/rocket23.py run >> state/rocket23.log 2>&1   # 상주 30 초
    python -u scripts/rocket23.py measure
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
from power2_23 import HEAD, BORROW_SET, BORROW_TAKE, lua, to_lua, T  # noqa: E402

N, E, S, W = 0, 4, 8, 12
RF, SFL = "rocket-fuel", "solid-fuel-from-light-oil"
A, B, C, D = (16.5, -50.5), (24.5, -50.5), (16.5, -46.5), (24.5, -46.5)
SFN, SFS = (20.5, -50.5), (20.5, -46.5)
FLUID = [  # (이름, x, y, 방향, 레시피) - 유체 검사 대상
    ("pipe", 9.5, -49.5, N, None), ("pipe", 9.5, -48.5, N, None),
    ("pipe-to-ground", 10.5, -48.5, W, None), ("pipe-to-ground", 14.5, -48.5, E, None),
] + [("pipe", x + 0.5, -48.5, N, None) for x in range(15, 25)] + [
    ("assembling-machine-2", A[0], A[1], S, RF), ("chemical-plant", SFN[0], SFN[1], S, SFL), ("assembling-machine-2", B[0], B[1], S, RF),
    ("assembling-machine-2", C[0], C[1], N, RF), ("chemical-plant", SFS[0], SFS[1], N, SFL), ("assembling-machine-2", D[0], D[1], N, RF),
]
OTHER = [
    ("inserter", 18.5, -50.5, E, None), ("inserter", 22.5, -50.5, W, None),      # d = 집는 쪽
    ("inserter", 18.5, -46.5, E, None), ("inserter", 22.5, -46.5, W, None),
    ("inserter", 16.5, -52.5, S, None), ("passive-provider-chest", 16.5, -53.5, N, None),
    ("inserter", 24.5, -52.5, S, None), ("passive-provider-chest", 24.5, -53.5, N, None),
    ("inserter", 16.5, -44.5, N, None), ("passive-provider-chest", 16.5, -43.5, N, None),
    ("inserter", 24.5, -44.5, N, None), ("passive-provider-chest", 24.5, -43.5, N, None),
    ("small-electric-pole", 14.5, -52.5, N, None), ("small-electric-pole", 18.5, -52.5, N, None),
    ("small-electric-pole", 22.5, -52.5, N, None), ("small-electric-pole", 26.5, -48.5, N, None),
    ("small-electric-pole", 18.5, -44.5, N, None), ("small-electric-pole", 22.5, -44.5, N, None),
    ("roboport", 29, -47, N, None),
    ("steel-chest", 5.5, 19.5, N, None),     # 사일로 자재 상자
]
CLEAR = [[13, -55], [32, -42]]
STASH = (5.5, 19.5)
SILO_NEED = {"steel-plate": 1000, "processing-unit": 200, "electric-engine-unit": 200, "pipe": 100, "concrete": 1000}
SF_CHEST = (19.5, 15.5)
CONC, CONC_INS = (-26.5, -61.5), (-24.5, -61.5)
PIPE_ASMS = [(-28.5, -29.5), (-10.5, -29.5), (17.5, -4.5)]
EE_ASM = (21.5, -8.5)
PUS = [(33.5, 1.5), (36.5, 1.5), (29.5, -0.5), (36.5, 8.5), (36.5, 12.5)]   # pu23 과 같은 5 대
IRON_OUTPOST = (-210, -269)
BORROW = (-21.5, -76.5)
LOG = os.path.join(HERE, "..", "state", "rocket23.log")


def log(msg):
    print(time.strftime("%H:%M:%S ") + msg, flush=True)


def ents_lua(ts):
    return "{" + ", ".join("{'%s', %s, %s, %d, %s}" % (n, x, y, d, "'%s'" % r if r else "nil") for n, x, y, d, r in ts) + "}"


def L(v):
    if isinstance(v, dict):
        if v and all(k.isdigit() for k in v):
            return [L(v[k]) for k in sorted(v, key=int)]
        return {k: L(x) for k, x in v.items()}
    if isinstance(v, list):
        return [L(x) for x in v]
    return v


# ---------------------------------------------------------------- survey
def survey(ai):
    r = lua(ai, """(function() local s = game.surfaces[1] local o = {bad = {}}
      for _, t in pairs($ts) do
        local ok = s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
                                      build_check_type = defines.build_check_type.manual_ghost}
        if not ok then
          local bl = {} for _, e in pairs(s.find_entities_filtered{position = {t[2], t[3]}, radius = (t[1] == 'roboport' and 2.2 or 1.6)}) do
            if e.type ~= 'logistic-robot' and e.type ~= 'construction-robot' then bl[#bl + 1] = e.name .. '@' .. e.position.x .. ',' .. e.position.y end end
          o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ' <- ' .. table.concat(bl, ' ')
        end
      end
      o.trees = s.count_entities_filtered{area = $clr, type = {'tree', 'simple-entity'}}
      local net = s.find_logistic_network_by_position({2, 30}, 'player') o.net = {}
      for _, k in pairs({'assembling-machine-2', 'assembling-machine-1', 'chemical-plant', 'passive-provider-chest', 'steel-chest', 'roboport',
                         'inserter', 'small-electric-pole', 'pipe', 'pipe-to-ground', 'productivity-module', 'electronic-circuit',
                         'advanced-circuit', 'iron-gear-wheel', 'steel-plate', 'iron-plate'}) do o.net[k] = net.get_item_count(k) end
      return o end)()""", ts=ents_lua(FLUID + OTHER), clr=to_lua(CLEAR))
    log("조사 " + json.dumps(L(r), ensure_ascii=False))
    return r


# ---------------------------------------------------------------- fluid (offline)
DUMP = """(function() local s = game.surfaces[1] local o = {}
for _, e in pairs(s.find_entities_filtered{area = {{-3, -60}, {34, -40}}}) do
  if e.type ~= 'logistic-robot' and e.type ~= 'construction-robot' and e.type ~= 'character' and e.type ~= 'tree' then
    local b = e.bounding_box
    local r = {n = e.name, t = e.type, x = e.position.x, y = e.position.y, d = e.direction, f = e.force.name,
               b = {math.floor(b.left_top.x + 0.01), math.floor(b.left_top.y + 0.01), math.ceil(b.right_bottom.x - 0.01) - 1, math.ceil(b.right_bottom.y - 0.01) - 1}}
    if e.type == 'assembling-machine' then local rc = e.get_recipe() r.rec = rc and rc.name or false end
    if e.fluidbox and #e.fluidbox > 0 then
      r.fb = {}
      for i = 1, #e.fluidbox do
        local c = {} for _, pc in pairs(e.fluidbox.get_pipe_connections(i)) do c[#c + 1] = {pc.target_position.x, pc.target_position.y, pc.connection_type} end
        local fi = e.fluidbox.get_filter(i)
        r.fb[#r.fb + 1] = {i = i, fl = e.fluidbox[i] and e.fluidbox[i].name or false, fi = fi and fi.name or false, c = c}
      end
    end
    o[#o + 1] = r
  end
end return o end)()"""


def fluid(ai, built=False):
    import fluidnet
    fluidnet.AMT.setdefault(RF, [(1, "light-oil", [(0, -2)])])
    dump = L(ai.lua(DUMP))
    for e in dump:
        for fb in e.get("fb") or []:
            fb["c"] = fb.get("c") or []
    net = fluidnet.Net({"e": dump})
    if not built:
        for n, x, y, d, r in FLUID:
            net.add(n, x, y, d, r)
    errs, bad = net.solve()
    lo = net.comp_at(9.5, -50.5)
    out = {"errs": errs, "mixed": [sorted(f) for _, f in bad]}
    if lo is not None:
        out["light_oil_comp"] = net.describe(lo)
    log("유체 검사 " + json.dumps(out, ensure_ascii=False))
    return out


# ---------------------------------------------------------------- make (전봇대 조립기 빌림)
def cnt(ai, name):
    return lua(ai, "(function() " + HEAD + " return {v = net.get_item_count('%s')} end)()" % name)["v"]


def borrow_make(ai, recipe, n, per):
    """per = [[재료, 개수], ...] 1 개당. 망 재고만."""
    before = cnt(ai, recipe)
    feed = [[k, v * n] for k, v in per]
    r = lua(ai, BORROW_SET, bx=str(BORROW[0]), by=str(BORROW[1]), recipe="'%s'" % recipe, feed=to_lua(feed))
    log("빌림 %s x%d: %s" % (recipe, n, json.dumps(L(r), ensure_ascii=False)))
    if r.get("err"):
        return False
    for _ in range(60):
        time.sleep(2)
        lua(ai, BORROW_TAKE, bx=str(BORROW[0]), by=str(BORROW[1]))
        if cnt(ai, recipe) >= before + n:
            return True
    return False


def make(ai):
    have = {k: cnt(ai, k) for k in ("assembling-machine-2", "assembling-machine-1", "passive-provider-chest", "iron-gear-wheel",
                                   "electronic-circuit", "advanced-circuit", "steel-chest")}
    log("make 전 %s" % have)
    n_am2 = max(0, 4 - have["assembling-machine-2"])
    n_am1 = max(0, n_am2 - have["assembling-machine-1"])
    n_pp = max(0, 4 - have["passive-provider-chest"])
    gears = max(0, 5 * n_am2 + 5 * n_am1 - have["iron-gear-wheel"])
    ok = True
    if gears:
        ok = borrow_make(ai, "iron-gear-wheel", gears, [["iron-plate", 2]])
    if ok and n_am1:
        ok = borrow_make(ai, "assembling-machine-1", n_am1, [["iron-plate", 9], ["iron-gear-wheel", 5], ["electronic-circuit", 3]])
    if ok and n_am2:
        ok = borrow_make(ai, "assembling-machine-2", n_am2, [["steel-plate", 2], ["iron-gear-wheel", 5], ["electronic-circuit", 3],
                                                              ["assembling-machine-1", 1]])
    if ok and n_pp:
        ok = borrow_make(ai, "passive-provider-chest", n_pp, [["electronic-circuit", 3], ["advanced-circuit", 1], ["steel-chest", 1]])
    r = lua(ai, BORROW_SET, bx=str(BORROW[0]), by=str(BORROW[1]), recipe="'small-electric-pole'", feed="{}")
    log("되돌림 small-electric-pole %s · ok=%s · 망 조립기2 %d · 공급 상자 %d" % (
        json.dumps(L(r), ensure_ascii=False), ok, cnt(ai, "assembling-machine-2"), cnt(ai, "passive-provider-chest")))


# ---------------------------------------------------------------- place
def place(ai):
    r = lua(ai, """(function() local s = game.surfaces[1] local o = {made = 0, trees = 0, skip = {}}
      for _, e in pairs(s.find_entities_filtered{area = $clr, type = {'tree', 'simple-entity'}}) do
        if not e.to_be_deconstructed() then e.order_deconstruction('player') o.trees = o.trees + 1 end end
      for _, t in pairs($ts) do
        local have = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
                  or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
        if have then o.skip[#o.skip + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3]
        else
          local gh = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', expires = false}
          if gh then
            o.made = o.made + 1
            if t[5] then local ok, err = pcall(function() gh.set_recipe(t[5]) end) if not ok then o.skip[#o.skip + 1] = 'RECIPE ' .. tostring(err) end end
          else o.skip[#o.skip + 1] = 'FAIL ' .. t[1] .. '@' .. t[2] .. ',' .. t[3] end
        end
      end return o end)()""", ts=ents_lua(FLUID + OTHER), clr=to_lua(CLEAR))
    log("유령 " + json.dumps(L(r), ensure_ascii=False))


def check(ai):
    r = lua(ai, """(function() local s = game.surfaces[1] local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
      local o = {ghosts = s.count_entities_filtered{type = 'entity-ghost', area = $clr}, trees = s.count_entities_filtered{area = $clr, type = 'tree'}, m = {}}
      for _, p in pairs($ms) do
        local e = s.find_entities_filtered{type = {'assembling-machine'}, position = p, radius = 0.5}[1]
        if e then
          local f = {} for i = 1, #e.fluidbox do local fl = e.fluidbox[i] f[#f + 1] = fl and (fl.name .. ':' .. math.floor(fl.amount)) or '-' end
          o.m[#o.m + 1] = p[1] .. ',' .. p[2] .. ' ' .. (e.get_recipe() and e.get_recipe().name or '-') .. ' ' .. names[e.status] .. ' act=' .. tostring(e.active)
                          .. ' ' .. table.concat(f, ' ') .. ' mod=' .. e.get_module_inventory().get_item_count() .. ' out=' .. e.get_output_inventory().get_item_count()
        end
      end
      local ch = s.find_entities_filtered{name = 'roboport', position = {29, -47}, radius = 0.5}[1]
      o.robo = ch and (ch.logistic_network and ch.logistic_network.network_id or 0) or -1
      local pp = s.find_entities_filtered{name = 'passive-provider-chest', position = {16.5, -53.5}, radius = 0.3}[1]
      o.pp_net = pp and (pp.logistic_network and pp.logistic_network.network_id or 0) or -1
      return o end)()""", clr=to_lua(CLEAR), ms=to_lua([list(p) for p in (A, SFN, B, C, SFS, D)]))
    log("점검 " + json.dumps(L(r), ensure_ascii=False))
    return r


# ---------------------------------------------------------------- run (상주)
TICK = """(function() """ + HEAD + """
local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
local o = {mv = {}}
local function add(k, v) if v and v > 0 then o.mv[k] = (o.mv[k] or 0) + v end end
local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1] end
local researched = game.forces.player.technologies['rocket-silo'].researched
o.res = researched
-- 1. 모듈 (망 생산 모듈 1, 100 남김)
for _, p in pairs($blk) do local a = asm(p)
  if a then local mi = a.get_module_inventory() local free = #mi - mi.get_item_count()
    if free > 0 and net.get_item_count('productivity-module') > 100 then
      local got = take('productivity-module', free) if got > 0 then local ins = mi.insert{name = 'productivity-module', count = got} if ins < got then store('productivity-module', got - ins) end add('mod', ins) end end end end
-- 2. 전력 조절: 증기 1 분 평균 >= 34 MW 면 블록 (RF 4 · SF 2) · 콘크리트 쉼, <= 31 MW 면 다시 (석탄 8.5/s 상한 - 36 MW 전부하면 보일러 연료가 준다)
local pole = s.find_entities_filtered{type = 'electric-pole', position = {18.5, -52.5}, radius = 0.3}[1]
local mw = pole and pole.electric_network_statistics.get_flow_count{name = 'steam-engine', category = 'output',
             precision_index = defines.flow_precision_index.one_minute, count = false} * 60 / 1e6 or 0
o.mw = math.floor(mw * 10) / 10
-- P3 (21:4x): 문턱을 최대 발전 기준으로 (bank3_23) - 주 망 증기기관 수 × 0.9 MW. 36 MW 면 34 / 31 그대로, 54 MW 면 52 / 49
local cap = 0 if pole then local nid = pole.electric_network_id
  for _, e in pairs(s.find_entities_filtered{name = 'steam-engine'}) do if e.electric_network_id == nid then cap = cap + 0.9 end end end
if cap < 1 then cap = 36 end o.cap = math.floor(cap * 10 + 0.5) / 10
local g = storage.rocket23_pause or false
if mw >= cap - 2 then g = true elseif mw <= cap - 5 then g = false end
storage.rocket23_pause = g o.pause = g
for _, p in pairs($blk) do local a = asm(p) if a then a.active = not g end end
-- 연구 중에는 SF-S 쉼
local sfs = asm($sfs) if sfs then sfs.active = researched and not g o.sfs = sfs.active end
-- 3. 중유 고체연료 상자 -> RF 조립기 (입력 10 밑이면 20 까지; C · D 먼저)
local ch = s.find_entities_filtered{name = 'iron-chest', position = $sfc, radius = 0.3}[1]
if ch then
  for _, p in pairs($rfs) do local a = asm(p)
    if a and a.get_recipe() then local inv = a.get_inventory(defines.inventory.assembling_machine_input) local h = inv.get_item_count('solid-fuel')
      if h < 10 then local k = math.min(20 - h, ch.get_item_count('solid-fuel'))
        if k > 0 then k = inv.insert{name = 'solid-fuel', count = k} if k > 0 then ch.remove_item{name = 'solid-fuel', count = k} add('sf', k) end end end end end
  o.sfchest = ch.get_item_count('solid-fuel')
end
-- 4. 사일로 자재 상자 (silo23 가 사일로를 만들면 storage.rocket23_silo_made = true -> 비축 끝, 콘크리트 팔 되돌림)
local st = s.find_entities_filtered{name = 'steel-chest', position = $stash, radius = 0.3}[1]
local NEED = $need
if storage.rocket23_silo_made then
  local cc = asm($conc) if cc then cc.active = true end
  local ci = s.find_entities_filtered{type = 'inserter', position = $cins, radius = 0.3}[1] if ci then ci.active = true end
  st = nil o.stash = 'done'
end
-- 사일로 (12.5,24.5): 전력 조절에 넣음 (블록과 같은 문턱), 자동 발사 끔 (발사는 사람 확인 뒤)
local silo = s.find_entities_filtered{name = 'rocket-silo', position = {12.5, 24.5}, radius = 1}[1]
if silo then silo.active = not g pcall(function() silo.send_to_orbit_automatically = false end)
  o.silo = {parts = silo.rocket_parts, st = names[silo.status], act = silo.active} end
if st then
  local function def(n) return math.max(0, NEED[n] - st.get_item_count(n)) end
  local function put(n, k, src) if k <= 0 then return 0 end local p = st.insert{name = n, count = k} add(n, p) return p end
  -- 관
  for _, p in pairs($pipes) do local a = asm(p) if a then local out = a.get_output_inventory() local k = math.min(def('pipe'), out.get_item_count('pipe'))
    if k > 0 then k = put('pipe', k) if k > 0 then out.remove{name = 'pipe', count = k} end end end end
  -- 강철 (연구 중 망 1500 남김 = purple23 요청 상자 보충 바닥, 연구 뒤 800; 한 번 200 까지)
  local k = math.min(def('steel-plate'), net.get_item_count('steel-plate') - (researched and 800 or 1500), 200)
  if k > 0 then local got = take('steel-plate', k) local p = put('steel-plate', got) if p < got then store('steel-plate', got - p) end end
  -- 처리장치 (망에서)
  k = math.min(def('processing-unit'), net.get_item_count('processing-unit'))
  if k > 0 then local got = take('processing-unit', k) local p = put('processing-unit', got) if p < got then store('processing-unit', got - p) end end
  -- 처리장치 조립기 출력에서도 (망 노랑 >= 600 = 남은 연구 몫보다 많을 때만)
  if net.get_item_count('utility-science-pack') >= 600 then
    for _, p in pairs($pus) do local a = asm(p) if a then local out = a.get_output_inventory() k = math.min(def('processing-unit'), out.get_item_count('processing-unit'))
      if k > 0 then k = put('processing-unit', k) if k > 0 then out.remove{name = 'processing-unit', count = k} end end end end
  end
  -- 전기엔진 (조립기 출력; 노랑 비축 넉넉하면 2 남김)
  local ee = asm($ee)
  if ee then local out = ee.get_output_inventory() local keep = (net.get_item_count('utility-science-pack') >= 400) and 2 or 10
    k = math.min(def('electric-engine-unit'), out.get_item_count('electric-engine-unit') - keep)
    if k > 0 then k = put('electric-engine-unit', k) if k > 0 then out.remove{name = 'electric-engine-unit', count = k} end end end
  -- 콘크리트
  local cc = asm($conc)
  local ci = s.find_entities_filtered{type = 'inserter', position = $cins, radius = 0.3}[1]
  if cc then
    local out = cc.get_output_inventory() k = math.min(def('concrete'), out.get_item_count('concrete'))
    if k > 0 then k = put('concrete', k) if k > 0 then out.remove{name = 'concrete', count = k} end end
    local want = def('concrete') > 0
    if ci then ci.active = not want end
    cc.active = not (g and want)
    o.conc_ins = ci and ci.active
    if want then
      local inv = cc.get_inventory(defines.inventory.assembling_machine_input)
      local b = inv.get_item_count('stone-brick')
      if b < 15 then local kk = math.min(30 - b, net.get_item_count('stone-brick') - 250)
        if kk > 0 then local got = take('stone-brick', kk) if got > 0 then local p = inv.insert{name = 'stone-brick', count = got} if p < got then store('stone-brick', got - p) end add('brick', p) end end end
      local ore = inv.get_item_count('iron-ore')
      if ore < 3 then local need = 6 - ore
        for _, bt in pairs(s.find_entities_filtered{type = 'transport-belt', position = $iop, radius = 60}) do
          if need <= 0 then break end
          for i = 1, 2 do if need > 0 then local l = bt.get_transport_line(i) local c = l.get_item_count('iron-ore')
            if c > 0 then local r = l.remove_item{name = 'iron-ore', count = math.min(c, need)} if r > 0 then local p = inv.insert{name = 'iron-ore', count = r} need = need - r add('ore', p) end end end end
        end
      end
      o.conc = names[cc.status]
    end
  end
  o.stash = {} for n, _ in pairs(NEED) do o.stash[n] = st.get_item_count(n) end
end
-- 5. 상태
local sts = {} for _, p in pairs($blk) do local a = asm(p) if a then sts[#sts + 1] = string.sub(names[a.status], 1, 12) end end o.st = table.concat(sts, ',')
o.rf_net = net.get_item_count('rocket-fuel')
local is = game.forces.player.get_item_production_statistics(s) local pi = defines.flow_precision_index.ten_minutes
o.rf10 = math.floor(is.get_flow_count{name = 'rocket-fuel', category = 'input', precision_index = pi, count = true})
o.sf10 = math.floor(is.get_flow_count{name = 'solid-fuel', category = 'input', precision_index = pi, count = true})
return o end)()"""


def run(every=30):
    ai = None
    last = 0
    while True:
        try:
            if ai is None:
                ai = AIBridge()
            r = L(lua(ai, TICK, blk=to_lua([list(p) for p in (A, SFN, B, C, SFS, D)]), sfs=to_lua(list(SFS)),
                      rfs=to_lua([list(p) for p in (C, D, A, B)]), sfc=to_lua(list(SF_CHEST)), stash=to_lua(list(STASH)),
                      need="{" + ", ".join("['%s'] = %d" % kv for kv in SILO_NEED.items()) + "}",
                      pipes=to_lua([list(p) for p in PIPE_ASMS]), pus=to_lua([list(p) for p in PUS]), ee=to_lua(list(EE_ASM)), conc=to_lua(list(CONC)),
                      cins=to_lua(list(CONC_INS)), iop=to_lua(list(IRON_OUTPOST))))
            if r.get("mv") or time.time() - last > 300:
                log("tick " + json.dumps(r, ensure_ascii=False))
                last = time.time()
        except Exception as e:  # noqa: BLE001
            log("오류 %s" % str(e)[:300])
            ai = None
        time.sleep(every)


def measure(ai):
    r = lua(ai, """(function() local s = game.surfaces[1] local f = game.forces.player
      local fs, is = f.get_fluid_production_statistics(s), f.get_item_production_statistics(s)
      local p = defines.flow_precision_index.ten_minutes
      local function g(st, n, c) return math.floor(st.get_flow_count{name = n, category = c, precision_index = p, count = true}) end
      local o = {tick = game.tick}
      for _, n in pairs({'solid-fuel', 'rocket-fuel', 'concrete', 'electric-engine-unit', 'processing-unit', 'low-density-structure', 'steel-plate', 'plastic-bar'}) do o[n] = g(is, n, 'input') .. '/' .. g(is, n, 'output') end
      for _, n in pairs({'light-oil', 'petroleum-gas', 'heavy-oil'}) do o[n] = g(fs, n, 'input') .. '/' .. g(fs, n, 'output') end
      return o end)()""")
    log("측정 10분 " + json.dumps(L(r), ensure_ascii=False))
    return r


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "survey"
    if cmd == "run":
        run()
        return
    ai = AIBridge()
    {"survey": survey, "fluid": fluid, "make": make, "place": place, "check": check, "measure": measure}[cmd](ai)


if __name__ == "__main__":
    main()

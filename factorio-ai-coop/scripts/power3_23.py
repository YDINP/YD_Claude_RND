"""발전소 물가 이전 2 단계 - 뱅크 2 (docs/power-relocation-plan.md §2.4 · §5 T7~T8 · §10).

옛 발전소 (보일러 9 · 증기기관 18, x -47..-36, y -76..-50) 를 한 쌍 (보일러 1 · 엔진 2) 씩 뜯어
뱅크 1 서쪽 (x -50..-21, y 35..49, 칸 l = -50 + 3i) 에 다시 짓는다. 정전 0 순서:
  - 모자란 보일러 1 · 엔진 2 (설계 10/20) 는 조립기로 먼저 만들어 칸 9 (물 들어오는 동쪽 끝) 를 옛 것 안 뜯고 먼저 세운다.
  - 칸 9 가 물 · 석탄으로 돌면 전봇대 11 -> 주 전력망. 그 뒤로는 «새 칸 k 유령 -> 옛 한 쌍 해체 -> 로봇이 해체분으로 새 칸».
    옛 쌍을 뜯기 전에 새 뱅크 가동 칸 수 ≥ 뜯은 쌍 + 1 이어야 함 -> 최대 출력이 34.2 MW 아래로 안 내려감.
  - 옛 보일러 물은 한 줄 (seg) 이라 가운데를 빼면 하류가 끊긴다 -> 하류 끝부터 (서향 줄 y -75.5 -> -60.5, 동향 줄 y -50.5 -> -56.5).

하위 명령
  make   : 조립기 1 3 대 (망 재고) 유령 -> Lua 로 망 재고만 옮겨 넣어 중형 전봇대 12 · 보일러 1 · 엔진 2 · 분배기 1 · 지하관 2 를 만들고 해체.
  build  : 단계별 (멱등)
           A  부지 나무 · 바위 해체 + 석탄 줄 y=49 서향 · 팔 10 · 지하관 (-11.5,47.5)->(-19.5,47.5) 유령
           B  석탄 하강 끝을 분배기로: (-15.5,47.5) 서향 · (-16.5,47.5) 남향 · 분배기 (-17,48.5) 남향 -> 동 출력 뱅크 1, 서 출력 뱅크 2
           C  칸 9 (만든 보일러 · 엔진) -> 물 차면 석탄 배달 -> 전봇대 11 (주 전력망)
           R  옛 쌍 j (0..8) 해체 · 새 칸 8-j 유령, 매 쌍 발전 확인
           W  옛 석탄 줄: 분배기 (-34,-55.5) 우선을 새 줄기 쪽으로 · x=-49.5 줄 끝 -> x=-51.5 줄에 옆 싣기
           P  죽은 물 관 (양수기 (32.5,40.5), 소비처 0) 해체 -> 그 양수기를 뱅크 1 옆 (27.5,45.5) 에 둘째 양수기로
           X  옛 긴 물 관 (양수기 (38.5,33.5) -> 옛 발전소) 해체
           V  확인
  status : 한 줄

    nohup python -u scripts/power3_23.py make  >> state/power3_23.log 2>&1 &
    nohup python -u scripts/power3_23.py build >> state/power3_23.log 2>&1 &
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import power2_23 as p2  # noqa: E402

STATE = os.path.join(HERE, "..", "state", "power3_23.json")
TARGET = [("splitter", 1), ("boiler", 1), ("medium-electric-pole", 12), ("pipe-to-ground", 2), ("steam-engine", 2)]
INTER = ["iron-gear-wheel", "pipe", "iron-stick", "copper-cable"]
IRON_FLOOR = 3000

SLOTS = [-50 + 3 * i for i in range(10)]  # 칸 왼쪽 x


def slot(i):
    l = SLOTS[i]
    return [["boiler", l + 1.5, 47.0, 0], ["steam-engine", l + 1.5, 43.5, 0], ["steam-engine", l + 1.5, 38.5, 0]]


INSERTERS = [["inserter", l + 1.5, 48.5, 8] for l in SLOTS]
ROW = [["transport-belt", x + 0.5, 49.5, 12] for x in range(-50, -17)]
UGP = [["pipe-to-ground", -11.5, 47.5, 4], ["pipe-to-ground", -19.5, 47.5, 12]]
POLES = [["medium-electric-pole", x + 0.5, y, 0] for x in (-47, -41, -35, -29, -23) for y in (48.5, 35.5)] \
    + [["medium-electric-pole", -18.5, 42.5, 0]]
# 옛 쌍: 하류 끝부터. (보일러, 증기 관, 엔진 2, 팔)
OLD = [[("boiler", -36, y), ("pipe", -37.5, y), ("steam-engine", -40.5, y), ("steam-engine", -45.5, y), ("inserter", -34.5, y)]
       for y in (-75.5, -72.5, -69.5, -66.5, -63.5, -60.5)] \
    + [[("boiler", -47, y), ("pipe", -45.5, y), ("steam-engine", -42.5, y), ("steam-engine", -37.5, y), ("inserter", -48.5, y)]
       for y in (-50.5, -53.5, -56.5)]
EXT49 = [["transport-belt", -49.5, -49.5, 12], ["transport-belt", -50.5, -49.5, 12]]
PUMP2 = [["offshore-pump", 27.5, 45.5, 4], ["pipe", 26.5, 45.5, 0], ["pipe", 25.5, 45.5, 0], ["pipe", 24.5, 45.5, 0],
         ["pipe", 24.5, 46.5, 0]]  # 첫 양수기 (25.5,47.5) 충돌 상자와 안 겹치게 한 줄 위, 물은 (24.5,47.5) 관으로
DEAD_PUMP = (32.5, 40.5)
OLD_PUMP = (38.5, 33.5)
BANK2 = [[-51, 34], [-19, 50]]
CLEAR_AREA = [[-51, 34], [-10, 51]]


def log(msg):
    print(time.strftime("%H:%M:%S ") + msg, flush=True)


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"phase": "A"}


def save(d):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


L = p2.to_lua
T = p2.T
HEAD = p2.HEAD


def lua(ai, src, **kw):
    return p2.lua(ai, src, **kw)


# ---------------------------------------------------------------- make
MAKE = """(function() """ + HEAD + """
local asms = $asms local TG = $tg local ORDER = $order local FLOOR = $floor
local INTER = {['iron-gear-wheel'] = true, ['pipe'] = true, ['iron-stick'] = true, ['copper-cable'] = true}
local rec = game.forces.player.recipes
local o = {a = {}}
local N = {} local function cnt(n) if N[n] == nil then N[n] = net.get_item_count(n) end return N[n] end
local list = {}
for _, p in pairs(asms) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  if a then
    local out = a.get_output_inventory()
    for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
    list[#list + 1] = a
  end
end
local R = {} for k, v in pairs(TG) do R[k] = math.max(0, v - cnt(k)) end
local need = {} for k in pairs(INTER) do need[k] = -cnt(k) end
for k, r in pairs(R) do if r > 0 then
  local rc = rec[k] local c = math.ceil(r / rc.products[1].amount)
  for _, ing in pairs(rc.ingredients) do if INTER[ing.name] then need[ing.name] = need[ing.name] + ing.amount * c end end
end end
local function deficit(n) if TG[n] then return R[n] end return math.max(0, need[n] or 0) end
local function can(r)
  for _, ing in pairs(r.ingredients) do
    local fl = (ing.name == 'iron-plate') and FLOOR or 0
    if cnt(ing.name) - fl < ing.amount then return false end
  end
  return true
end
local done = true for k in pairs(TG) do if R[k] > 0 then done = false end end
o.done = done o.R = R
local busy = {}
for _, a in pairs(list) do
  local cur = a.get_recipe() and a.get_recipe().name
  local keep = cur and deficit(cur) > 0 and not (TG[cur] and busy[cur]) and (a.is_crafting() or can(rec[cur]))
  local pick = keep and cur or nil
  if not pick then
    for _, n in pairs(ORDER) do
      if not pick and deficit(n) > 0 and not (TG[n] and busy[n]) and can(rec[n]) then pick = n end
    end
  end
  if pick ~= cur then
    local back = a.set_recipe(pick)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
  end
  if pick then
    busy[pick] = true
    local r = rec[pick]
    local crafts = math.max(1, math.min(5, math.ceil(deficit(pick) / r.products[1].amount)))
    local inv = a.get_inventory(defines.inventory.assembling_machine_input)
    for _, ing in pairs(r.ingredients) do
      local fl = (ing.name == 'iron-plate') and FLOOR or 0
      local want = math.min(ing.amount * crafts - inv.get_item_count(ing.name), cnt(ing.name) - fl)
      if want > 0 then
        local got = take(ing.name, want)
        if got > 0 then local p = inv.insert{name = ing.name, count = got} if p < got then store(ing.name, got - p) end N[ing.name] = N[ing.name] - got end
      end
    end
  end
  o.a[#o.a + 1] = (pick or '-') .. ' ' .. a.status
end
o.nasm = #list
return o end)()"""

ASM_DECON = """(function() """ + HEAD + """ local n = 0
for _, p in pairs($asms) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  if a and not a.to_be_deconstructed() then
    local out = a.get_output_inventory()
    for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
    local back = a.set_recipe(nil)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
    a.order_deconstruction('player') n = n + 1
  end
end return {n = n} end)()"""


def make(ai, every=6):
    st = load()
    if not st.get("asms"):
        g = lua(ai, p2.ASM_GHOSTS, ax=str(p2.ASM_ANCHOR[0]), ay=str(p2.ASM_ANCHOR[1]), n="3")
        st["asms"] = [T(p) for p in (T(g.get("spots")) or [])]
        save(st)
        log("make: 조립기 유령 %s (로봇이 지음)" % st["asms"])
    tg = "{" + ", ".join("['%s'] = %d" % kv for kv in TARGET) + "}"
    order = L([k for k, _ in TARGET] + INTER)
    last = ""
    for _ in range(600):
        r = lua(ai, MAKE, asms=L(st["asms"]), tg=tg, order=order, floor=str(IRON_FLOOR))
        msg = "make %s 대 %s | 남음 %s" % (r.get("nasm"), T(r.get("a")), r.get("R"))
        if msg != last:
            log(msg)
            last = msg
        if r.get("done"):
            n = lua(ai, ASM_DECON, asms=L(st["asms"])).get("n")
            log("make 끝 - 조립기 %s 대 해체 표시 (망으로)" % n)
            st = load()
            st["made"] = True
            save(st)
            return
        time.sleep(every)
    log("make 시간 초과")


# ---------------------------------------------------------------- build helpers
CLEAR = """(function() local s = game.surfaces[1] local o = {marked = 0, left = 0, skip = 0}
for _, e in pairs(s.find_entities_filtered{area = $area, type = {'tree', 'simple-entity'}}) do
  if e.to_be_deconstructed() then o.left = o.left + 1
  elseif e.order_deconstruction('player') then o.marked = o.marked + 1 o.left = o.left + 1 end
end return o end)()"""

DECON = """(function() local s = game.surfaces[1] local o = {left = 0, marked = 0, skip = 0}
for _, e in pairs($list) do
  local x = s.find_entities_filtered{name = e[1], position = {e[2], e[3]}, radius = 0.3}[1]
  if x then
    if x.last_user and x.last_user.name == 'Guiltyring' then o.skip = o.skip + 1
    else o.left = o.left + 1 if not x.to_be_deconstructed() then x.order_deconstruction('player') o.marked = o.marked + 1 end end
  end
end return o end)()"""

SPLIT = """(function() """ + HEAD + """
local o = {}
local sp = s.find_entities_filtered{name = 'splitter', position = {-17, 48.5}, radius = 0.3}[1]
if sp then o.state = 'already' return o end
local bS = s.find_entities_filtered{type = 'transport-belt', position = {-16.5, 48.5}, radius = 0.3}[1]
local bW = s.find_entities_filtered{type = 'transport-belt', position = {-15.5, 48.5}, radius = 0.3}[1]
local bT = s.find_entities_filtered{type = 'transport-belt', position = {-15.5, 47.5}, radius = 0.3}[1]
if not (bS and bW and bT) then o.state = 'nobelt' return o end
if bS.direction ~= defines.direction.south or bW.direction ~= defines.direction.west or bT.direction ~= defines.direction.south then o.state = 'dirs' return o end
if s.count_entities_filtered{area = {{-18, 47}, {-16, 48}}} > 0 or s.count_entities_filtered{area = {{-18, 48}, {-17, 49}}} > 0 then o.state = 'occupied' return o end
if net.get_item_count('splitter') < 1 or net.get_item_count('transport-belt') < 1 then o.state = 'noitems' return o end
local items = {}
for _, b in pairs({bS, bW}) do for i = 1, b.get_max_transport_line_index() do for _, c in pairs(b.get_transport_line(i).get_contents()) do items[c.name] = (items[c.name] or 0) + c.count end end end
take('splitter', 1) take('transport-belt', 1)
bS.destroy() bW.destroy() store('transport-belt', 2)
for n, c in pairs(items) do store(n, c) end
bT.direction = defines.direction.west
local nb = s.create_entity{name = 'transport-belt', position = {-16.5, 47.5}, direction = defines.direction.south, force = 'player'}
sp = s.create_entity{name = 'splitter', position = {-17, 48.5}, direction = defines.direction.south, force = 'player'}
o.state = (nb and sp) and 'swapped' or 'create-failed' o.items = items
return o end)()"""

SEED = """(function() """ + HEAD + """
local o = {req = 0}
if net.get_item_count('coal') < 30 then o.state = 'lowcoal' return o end
for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = $area}) do
  local f = b.get_inventory(defines.inventory.fuel)
  local busy = s.count_entities_filtered{name = 'item-request-proxy', position = b.position, radius = 0.6} > 0
  if f.get_item_count('coal') < 2 and not busy and b.fluidbox[1] and b.fluidbox[1].amount > 0 then
    s.create_entity{name = 'item-request-proxy', position = b.position, force = 'player', target = b,
      modules = {{id = {name = 'coal'}, items = {in_inventory = {{inventory = defines.inventory.fuel, stack = 0, count = 5}}}}}}
    o.req = o.req + 1
  end
end
return o end)()"""

POWER = """(function() local s = game.surfaces[1] local o = {old = 0, b1 = 0, b2 = 0, gen = 0, cap = 0, off = 0}
local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
local m = s.find_entities_filtered{type = 'electric-pole', position = {2, 33}, radius = 6}[1]
local main = m.electric_network_id
for _, e in pairs(s.find_entities_filtered{name = 'steam-engine'}) do
  local x, y = e.position.x, e.position.y
  local k = (y < -40) and 'old' or ((x > -13) and 'b1' or 'b2')
  if e.electric_network_id == main then o[k] = o[k] + 1 o.cap = o.cap + 0.9 else o.off = o.off + 1 end
  o.gen = o.gen + e.energy_generated_last_tick * 60 / 1e6
end
local function boil(area)
  local t = {} for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = area}) do
    local w = b.fluidbox[1] local f = b.get_inventory(defines.inventory.fuel).get_item_count('coal')
    t[#t + 1] = f .. '/' .. math.floor(w and w.amount or 0) .. '/' .. (b.burner.currently_burning and 1 or 0)
  end return t end
o.bb1 = boil({{-12, 45}, {20, 49}}) o.bb2 = boil($b2) o.bold = boil({{-50, -80}, {-30, -45}})
local st1 = m.electric_network_statistics local fi = defines.flow_precision_index.one_minute
o.prod1m = st1.get_flow_count{name = 'steam-engine', category = 'output', precision_index = fi, count = false} * 60 / 1e6
o.lasernp = 0 o.lasers = 0
for _, l in pairs(s.find_entities_filtered{name = 'laser-turret'}) do o.lasers = o.lasers + 1
  if l.status == defines.entity_status.no_power or not l.is_connected_to_electric_network() then o.lasernp = o.lasernp + 1 end end
local net = s.find_logistic_network_by_position({2, 30}, 'player')
local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
o.free = free o.coalnet = net.get_item_count('coal')
return o end)()"""


def ghosts(ai, lst, place=True):
    g = lua(ai, p2.GHOSTS, list=L([[n, x, y, d, ""] for n, x, y, d in lst]), place="true" if place else "false")
    return g


def ghosts_ug(ai, lst):
    """pipe-to-ground 은 type 없이 (belt 만 type 필요)"""
    return ghosts(ai, lst)


def power(ai):
    p = lua(ai, POWER, b2=L(BANK2))
    for k in ("bb1", "bb2", "bold"):
        p[k] = T(p.get(k)) or []
    return p


def pstr(p):
    return "발전 %.2f MW · 최대 %.1f MW (옛 %d · 뱅크1 %d · 뱅크2 %d 엔진, 망 밖 %d) · 1분 %.2f · 뱅크2 보일러 %s · 옛 %s · 레이저 무전력 %d/%d · 저장 빈칸 %d" % (
        p["gen"], p["cap"], p["old"], p["b1"], p["b2"], p["off"], p["prod1m"], p["bb2"], p["bold"], p["lasernp"], p["lasers"], p["free"])


def running(b):
    """'석탄/물/연소' 문자열 목록 -> 도는 보일러 수"""
    n = 0
    for x in b:
        c, w, burn = x.split("/")
        if int(w) > 0 and (int(c) > 0 or burn == "1"):
            n += 1
    return n


# ---------------------------------------------------------------- build
def build(ai, every=15):
    st = load()
    last = ""
    halt = 0
    while True:
        disk = load()
        st["made"] = st.get("made") or disk.get("made")
        ph = st.get("phase", "A")
        msg = ""
        if ph == "A":
            c = lua(ai, CLEAR, area=L(CLEAR_AREA))
            g = ghosts(ai, ROW + INSERTERS + UGP)
            msg = "A 나무 남음 %s · 줄/팔/지하관 %s/%s 유령 %s 막힘 %s" % (c["left"], g["built"], g["total"], g["ghost"], T(g.get("blocked")))
            if g["built"] == g["total"] and c["left"] == 0:
                st["phase"] = "B"
        elif ph == "B":
            if not st.get("made"):
                msg = "B 대기: make"
            else:
                r = lua(ai, SPLIT)
                msg = "B 분배기 %s" % r
                if r.get("state") in ("swapped", "already"):
                    st["phase"] = "C"
        elif ph == "C":
            g = ghosts(ai, slot(9))
            p = power(ai)
            sd = lua(ai, SEED, area=L(BANK2))
            msg = "C 칸9 %s/%s · 보일러 %s · 배달 %s" % (g["built"], g["total"], p["bb2"], sd.get("req"))
            if g["built"] == g["total"] and running(p["bb2"]) >= 1:
                pg = ghosts(ai, POLES)
                msg += " · 전봇대 %s/%s" % (pg["built"], pg["total"])
                if pg["built"] == pg["total"] and p["b2"] >= 2:
                    st["phase"] = "R"
                    st["j"] = 0
                    log("C 끝: " + pstr(p))
        elif ph == "R":
            j = st.get("j", 0)
            if j >= len(OLD):
                st["phase"] = "W"
            else:
                k = 8 - j
                p = power(ai)
                sd = lua(ai, SEED, area=L(BANK2))
                online = running(p["bb2"])
                g = ghosts(ai, slot(k))
                old = lua(ai, DECON, list=L([list(e) for e in OLD[j]])) if st.get("dec") == j else None
                if st.get("dec") != j:
                    # 옛 쌍 j 를 뜯기 전 조건: 새 뱅크 가동 칸 ≥ j + 1 · 뱅크 2 엔진 모두 주 망 · 망 밖 엔진 0
                    if online >= j + 1 and p["b2"] >= 2 * (j + 1) and p["off"] == 0:
                        old = lua(ai, DECON, list=L([list(e) for e in OLD[j]]))
                        st["dec"] = j
                        halt = 0
                        log("R 옛 쌍 %d 해체 표시 %s · 새 칸 %d 유령 · %s" % (j, old, k, pstr(p)))
                    else:
                        halt += 1
                        msg = "R 대기 (옛 쌍 %d 뜯기 전 새 뱅크 가동 %d < %d 또는 엔진 %d) · %s" % (j, online, j + 1, p["b2"], pstr(p))
                        if halt > 60:
                            log("R 멈춤: 새 칸이 안 돎 - 사람 확인 필요")
                            save(st)
                            return
                else:
                    msg = "R 쌍 %d: 옛 남음 %s · 새 칸 %d %s/%s · 배달 %s · %s" % (j, old.get("left"), k, g["built"], g["total"], sd.get("req"), pstr(p))
                    if old.get("left") == 0 and g["built"] == g["total"] and online >= j + 2 and p["b2"] >= 2 * (j + 2):
                        log("R 쌍 %d 끝 -> 새 칸 %d 가동 · %s" % (j, k, pstr(p)))
                        if p["cap"] < 34.2 - 0.01:
                            log("R 멈춤: 최대 출력 %.1f < 34.2" % p["cap"])
                            save(st)
                            return
                        st["j"] = j + 1
        elif ph == "W":
            r = lua(ai, """(function() local s = game.surfaces[1]
                local sp = s.find_entities_filtered{name = 'splitter', position = {-34, -55.5}, radius = 0.3}[1]
                if not sp then return {state = 'nosplit'} end
                sp.splitter_output_priority = 'right' return {state = 'ok', prio = sp.splitter_output_priority} end)()""")
            g = ghosts(ai, EXT49)
            msg = "W 분배기 (-34,-55.5) 우선 %s · x=-49.5 연장 %s/%s 막힘 %s" % (r, g["built"], g["total"], T(g.get("blocked")))
            if g["built"] == g["total"]:
                st["phase"] = "P"
        elif ph == "P":
            if not st.get("dead"):
                r = lua(ai, SEGLIST, px=str(DEAD_PUMP[0]), py=str(DEAD_PUMP[1]))
                st["dead"] = T(r.get("list")) or []
                log("P 죽은 관 (seg %s, 소비처 %s): %d 개 해체 목록" % (r.get("seg"), r.get("users"), len(st["dead"])))
                if r.get("users"):
                    log("P 멈춤: 소비처 있음")
                    save(st)
                    return
            d = lua(ai, DECON, list=L(st["dead"]))
            g = ghosts(ai, PUMP2)
            msg = "P 죽은 관 남음 %s (Guiltyring %s) · 둘째 양수기 %s/%s 유령 %s 막힘 %s" % (d["left"], d["skip"], g["built"], g["total"], g["ghost"], T(g.get("blocked")))
            if d["left"] == 0 and g["built"] == g["total"]:
                st["phase"] = "X"
        elif ph == "X":
            if not st.get("oldpipe"):
                r = lua(ai, SEGLIST, px=str(OLD_PUMP[0]), py=str(OLD_PUMP[1]))
                st["oldpipe"] = T(r.get("list")) or []
                log("X 옛 물 관 (seg %s, 소비처 %s): %d 개 해체 목록" % (r.get("seg"), r.get("users"), len(st["oldpipe"])))
                if r.get("users"):
                    log("X 멈춤: 소비처 있음")
                    save(st)
                    return
            d = lua(ai, DECON, list=L(st["oldpipe"]))
            p = power(ai)
            msg = "X 옛 물 관 남음 %s (Guiltyring %s) · %s" % (d["left"], d["skip"], pstr(p))
            if d["left"] == 0:
                st["phase"] = "V"
        elif ph == "V":
            p = power(ai)
            log("V " + pstr(p) + " · 뱅크1 보일러 %s" % p["bb1"])
            save(st)
            return
        save(st)
        if msg and msg != last:
            log(msg)
            last = msg
        time.sleep(every)


# 양수기 출력 관의 물 seg 에 붙은 것 전부 (관 · 지하관 + 양수기). 관 · 지하관 아닌 것이 있으면 users
SEGLIST = """(function() local s = game.surfaces[1] local o = {list = {}, users = {}}
local pump = s.find_entities_filtered{name = 'offshore-pump', position = {$px, $py}, radius = 0.3}[1]
if not pump then return o end
local c = pump.fluidbox.get_connections(1)[1]
if not c then o.list = {{'offshore-pump', pump.position.x, pump.position.y}} return o end
local seg = c.get_fluid_segment_id(1) o.seg = seg
o.list[1] = {'offshore-pump', pump.position.x, pump.position.y}
for _, e in pairs(s.find_entities_filtered{type = {'pipe', 'pipe-to-ground', 'storage-tank', 'boiler', 'assembling-machine', 'furnace', 'generator', 'fluid-turret', 'mining-drill', 'pump'}}) do
  local fb = e.fluidbox local hit = false
  if fb then for i = 1, #fb do if fb.get_fluid_segment_id(i) == seg then hit = true end end end
  if hit then
    if e.type == 'pipe' or e.type == 'pipe-to-ground' then o.list[#o.list + 1] = {e.name, e.position.x, e.position.y}
    else o.users[#o.users + 1] = e.name .. '@' .. e.position.x .. ',' .. e.position.y end
  end
end
if #o.users == 0 then o.users = nil end
return o end)()"""


def status(ai):
    p = power(ai)
    log("status %s · 단계 %s j=%s" % (pstr(p), load().get("phase"), load().get("j")))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    ai = AIBridge()
    if cmd == "make":
        make(ai)
    elif cmd == "build":
        build(ai)
    else:
        status(ai)


if __name__ == "__main__":
    main()

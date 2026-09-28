"""발전소 물가 이전 1 단계 - 뱅크 1 (docs/power-relocation-plan.md §2.2 · §5 T0~T6).

호수 서쪽 물가 (x -11..18, y 35..49) 에 해안 양수기 1 · 보일러 10 · 증기기관 20 (18 MW) 을 새로 짓고,
옛 석탄 줄 (x=-33.5 남향, 옛 보일러 9 대 하류) 에 분배기를 끼워 넘치는 석탄을 새 뱅크까지 벨트로 보낸다.
옛 발전소는 건드리지 않는다.

하위 명령
  boot   : 전봇대 조립기 (-21.5,-76.5, polefeed23 소유) 를 잠깐 빌려 톱니 10 -> 조립기 1 3 대를 만들고 되돌린다.
           (망 작은 전봇대 ≥ 100 이면 polefeed 는 조립기를 못 찾아도 새 유령을 안 세운다 - 실측 코드)
           만든 조립기 3 대는 망 저장으로, 빈 전기 자리에 유령 (레시피 없음) 을 세워 로봇이 짓게 한다.
  make   : 내 조립기 3 대에 Lua 로 망 재고만 옮겨 넣어 자재를 만든다 (아이템을 새로 만들어 내지 않음).
           목표 망 재고: 증기기관 20 · 보일러 10 · 해안 양수기 1 · 중형 전봇대 10 · 지하 벨트 18 · 분배기 1.
           중간재 (톱니 · 관 · 쇠막대 · 구리선) 는 남은 목표에서 계산. 다 차면 조립기를 해체 표시 (망 재고로 돌아감).
  build  : 단계별 (멱등, 다시 불러도 안전)
           L  새 레이저 2 (20,36) (20,38) 유령 -> 전기 들어오면 옛 레이저 (13,38) (18,37) · 전봇대 (12.5,36.5) 해체
           C  막다른 전봇대 3 · 저장 상자 (11.5,44.5) · 부지/경로 나무 · 바위 해체 표시
           G  뱅크 (보일러 · 엔진 · 팔 · 양수기 · 관 · 벨트 줄) + 석탄 경로 유령. 전봇대는 아직 안 세움 (주 전력망과 떨어뜨림)
           S  다 지어지고 보일러 물이 차면 분배기 교체 (옛 줄 쪽 출력 우선) + 보일러에 석탄 5 씩 로봇 배달
           P  새 벨트 줄에 석탄이 도착하면 중형 전봇대 10 유령 -> 로봇이 지으면 주 전력망에 이어짐
  line2  : 막다른 석탄 줄 (x=-51.5, 소비처 없음) 끝을 돌려 y=-48 로 새 줄기에 잇는다 (옛 x=-33.5 줄은 옛 보일러가 다 먹음)
  status : 발전 · 자재 · 건설 상태 한 줄

    python -u scripts/power2_23.py boot
    nohup python -u scripts/power2_23.py make  >> state/power2_23.log 2>&1 &
    nohup python -u scripts/power2_23.py build >> state/power2_23.log 2>&1 &
"""
import json
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "..", "state", "power2_23.json")
LOG = os.path.join(HERE, "..", "state", "power2_23.log")

BORROW = (-21.5, -76.5)          # polefeed23 전봇대 조립기
ASM_ANCHOR = (-21.5, -76.5)      # 내 조립기 자리 찾기 기준
TARGET = {"steam-engine": 20, "boiler": 10, "offshore-pump": 1, "medium-electric-pole": 10,
          "underground-belt": 18, "splitter": 1}
IRON_FLOOR = 3000

# 석탄 경로 (타일 좌표, 방향 0/4/8/12, 종류). 1칸 격자 탐색 (빈칸 · 팔 칸 · 옆에서 들어오는 벨트 · 같은 축 지하 벨트 회피) 결과
ROUTE = [[-35,-55,8,"ugin"],[-35,-51,8,"ugout"],[-35,-50,4,"belt"],[-34,-50,4,"ugin"],[-30,-50,4,"ugout"],[-29,-50,4,"ugin"],[-24,-50,4,"ugout"],[-23,-50,0,"belt"],[-23,-51,4,"belt"],[-22,-51,4,"belt"],[-21,-51,4,"belt"],[-20,-51,4,"belt"],[-19,-51,4,"belt"],[-18,-51,8,"belt"],[-18,-50,8,"ugin"],[-18,-45,8,"ugout"],[-18,-44,8,"belt"],[-18,-43,8,"belt"],[-18,-42,8,"belt"],[-18,-41,8,"belt"],[-18,-40,8,"belt"],[-18,-39,8,"belt"],[-18,-38,8,"belt"],[-18,-37,8,"ugin"],[-18,-32,8,"ugout"],[-18,-31,8,"belt"],[-18,-30,8,"belt"],[-18,-29,8,"belt"],[-18,-28,8,"belt"],[-18,-27,8,"belt"],[-18,-26,8,"belt"],[-18,-25,8,"belt"],[-18,-24,4,"belt"],[-17,-24,8,"belt"],[-17,-23,8,"belt"],[-17,-22,8,"belt"],[-17,-21,8,"belt"],[-17,-20,8,"belt"],[-17,-19,8,"ugin"],[-17,-14,8,"ugout"],[-17,-13,8,"belt"],[-17,-12,8,"belt"],[-17,-11,8,"ugin"],[-17,-6,8,"ugout"],[-17,-5,8,"ugin"],[-17,0,8,"ugout"]] \
    + [[-17, y, 8, "belt"] for y in range(1, 20)] + [[-17, 20, 4, "belt"]] \
    + [[-16, y, 8, "belt"] for y in range(20, 48)] \
    + [[-16,48,12,"belt"],[-17,48,8,"belt"],[-17,49,4,"belt"],[-16,49,4,"ugin"],[-12,49,4,"ugout"]] \
    + [[x, 49, 4, "belt"] for x in range(-11, 19)]
# 실측 (08:59): 옛 x=-33.5 줄은 옛 보일러 6 대가 다 먹어 분배기 위가 비어 있음 (석탄 0). 넘치는 석탄은
# 소비처 없는 막다른 줄 (x=-51.5 남향, 끝 (-51.5,-47.5), 채굴기 3~5 대가 «출력 칸 꽉 참») 에 있다.
# 그 끝 벨트를 동향으로 돌리고 y=-48 줄로 이어 새 줄기 (-35,-50) 에 남쪽에서 옆 싣기.
LINE2_END = (-51.5, -47.5)
LINE2 = [[x, -48, 4, "belt"] for x in range(-51, -35)] + [[-35, -48, 0, "belt"], [-35, -49, 0, "belt"]]
SPLIT = (-34.0, -55.5)           # 남향 분배기: 서쪽 칸 (-35,-56) 새 줄, 동쪽 칸 (-34,-56) = 지금 옛 줄 벨트 (-33.5,-55.5)

BANK = []
for i in range(10):
    l = -11 + 3 * i
    BANK += [["boiler", l + 1.5, 47.0, 0], ["steam-engine", l + 1.5, 43.5, 0],
             ["steam-engine", l + 1.5, 38.5, 0], ["inserter", l + 1.5, 48.5, 8]]
WATER = [["offshore-pump", 25.5, 47.5, 4], ["pipe", 24.5, 47.5, 0], ["pipe", 23.5, 47.5, 0],
         ["pipe-to-ground", 22.5, 47.5, 4], ["pipe-to-ground", 19.5, 47.5, 12]]
POLES = [["medium-electric-pole", x + 0.5, y, 0] for x in (-8, -2, 4, 10, 16) for y in (48.5, 35.5)]
NEW_LASERS = [(20, 36), (20, 38)]
OLD_LASERS = [(13, 38), (18, 37)]
OLD_POLES = [(12.5, 36.5), (5.5, 44.5), (0.5, 44.5), (-5.5, 44.5)]
OLD_CHEST = (11.5, 44.5)


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"asms": [], "phase": "L"}


def save(d):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def lua(ai, src, **kw):
    for k, v in kw.items():
        src = src.replace("$" + k, v if isinstance(v, str) else json.dumps(v))
    r = ai.lua(src)
    return r


def T(v):
    """Lua 표 -> 파이썬 리스트/그대로"""
    if isinstance(v, dict) and v and all(k.isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v


HEAD = """local s = game.surfaces[1]
local net = s.find_logistic_network_by_position({2, 30}, 'player')
local function store(name, n) if n <= 0 then return 0 end return net.insert({name = name, count = n}) end
local function take(name, n) if n <= 0 then return 0 end return net.remove_item({name = name, count = n}) end
"""

# ---------------------------------------------------------------- boot
BORROW_SET = """(function() """ + HEAD + """
local a = s.find_entities_filtered{type = 'assembling-machine', position = {$bx, $by}, radius = 0.6}[1]
if not a then return {err = 'noasm'} end
local o = {prev = a.get_recipe() and a.get_recipe().name or '', poles = net.get_item_count('small-electric-pole')}
if o.poles < 100 then o.err = 'poles<100' return o end
local out = a.get_output_inventory()
for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
local back = a.set_recipe($recipe)
o.back = {}
for _, it in pairs(back or {}) do if it.count and it.count > 0 then o.back[it.name] = it.count store(it.name, it.count) end end
local inv = a.get_inventory(defines.inventory.assembling_machine_input)
for _, w in pairs($feed) do local got = take(w[1], w[2]) if got > 0 then local p = inv.insert{name = w[1], count = got} if p < got then store(w[1], got - p) end end end
o.inv = inv.get_contents()
return o end)()"""

BORROW_TAKE = """(function() """ + HEAD + """
local a = s.find_entities_filtered{type = 'assembling-machine', position = {$bx, $by}, radius = 0.6}[1]
local out = a.get_output_inventory() local o = {}
for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} o[it.name] = k end end
o.status = a.status o.progress = a.crafting_progress
return o end)()"""

ASM_GHOSTS = """(function() """ + HEAD + """
local A = {x = $ax, y = $ay} local want = $n local o = {spots = {}}
local function cov(p)
  for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', position = p, radius = 12}) do
    local r = e.prototype.get_supply_area_distance()
    if math.abs(e.position.x - p.x) < r + 1.5 and math.abs(e.position.y - p.y) < r + 1.5 then return true end
  end
  return false
end
local have = {}
for R = 3, 16 do
  for dx = -R, R do for dy = -R, R do
    if #have < want and (math.abs(dx) == R or math.abs(dy) == R) then
      local p = {x = A.x + dx, y = A.y + dy}
      local clear = s.count_entities_filtered{area = {{p.x - 1.5, p.y - 1.5}, {p.x + 1.5, p.y + 1.5}}, type = {'resource'}, invert = true} == 0
      local far = true for _, q in pairs(have) do if math.abs(q.x - p.x) < 3.5 and math.abs(q.y - p.y) < 3.5 then far = false end end
      local nearins = s.count_entities_filtered{type = 'inserter', area = {{p.x - 2.6, p.y - 2.6}, {p.x + 2.6, p.y + 2.6}}} == 0
      if clear and far and nearins and s.can_place_entity{name = 'assembling-machine-1', position = p, force = 'player'} and cov(p)
         then local nn = s.find_logistic_network_by_position(p, 'player') if nn and nn.network_id == net.network_id then have[#have + 1] = p end end
    end
  end end
end
for _, p in pairs(have) do
  local g = s.create_entity{name = 'entity-ghost', inner_name = 'assembling-machine-1', position = p, force = 'player'}
  o.spots[#o.spots + 1] = {g.position.x, g.position.y}
end
return o end)()"""


def boot(ai):
    st = load()
    if st.get("asms"):
        log("boot: 이미 조립기 %s" % st["asms"])
        return
    bx, by = BORROW
    r = lua(ai, """(function() """ + HEAD + """ return {am = net.get_item_count('assembling-machine-1'), gear = net.get_item_count('iron-gear-wheel'),
        circ = net.get_item_count('electronic-circuit'), speed = game.speed} end)()""")
    log("boot 시작: 망 %s" % r)
    need_am = 3 - r["am"]
    if need_am > 0:
        gear_need = max(0, 5 * need_am - r["gear"])
        if gear_need > 0:
            s1 = lua(ai, BORROW_SET, bx=str(bx), by=str(by), recipe="'iron-gear-wheel'", feed=to_lua([["iron-plate", 2 * gear_need]]))
            log("빌림 톱니: %s" % s1)
            if s1.get("err"):
                return
            prev = s1["prev"]
            for _ in range(40):
                time.sleep(2)
                t = lua(ai, BORROW_TAKE, bx=str(bx), by=str(by))
                g = lua(ai, "(function() " + HEAD + " return {v = net.get_item_count('iron-gear-wheel')} end)()")["v"]
                if g >= 5 * need_am:
                    break
            log("톱니 망 %s" % g)
        else:
            prev = None
        feed = [["electronic-circuit", 3 * need_am], ["iron-gear-wheel", 5 * need_am], ["iron-plate", 9 * need_am]]
        s2 = lua(ai, BORROW_SET, bx=str(bx), by=str(by), recipe="'assembling-machine-1'", feed=to_lua(feed))
        log("빌림 조립기1: %s" % s2)
        if s2.get("err"):
            return
        prev = prev or s2["prev"]
        for _ in range(40):
            time.sleep(2)
            lua(ai, BORROW_TAKE, bx=str(bx), by=str(by))
            am = lua(ai, "(function() " + HEAD + " return {v = net.get_item_count('assembling-machine-1')} end)()")["v"]
            if am >= 3:
                break
        # 되돌림: 원래 레시피, 돌려받은 재료는 polefeed 가 다시 채움
        prev = "small-electric-pole"  # polefeed 조립기 본래 레시피 (실측)
        s3 = lua(ai, BORROW_SET, bx=str(bx), by=str(by), recipe="'%s'" % prev, feed="{}")
        log("되돌림 %s: %s · 망 조립기1 %s" % (prev, s3, am))
    g = lua(ai, ASM_GHOSTS, ax=str(ASM_ANCHOR[0]), ay=str(ASM_ANCHOR[1]), n="3")
    spots = T(g.get("spots")) or []
    st["asms"] = [T(p) for p in spots]
    save(st)
    log("내 조립기 유령 %s" % st["asms"])


# ---------------------------------------------------------------- make
MAKE = """(function() """ + HEAD + """
local asms = $asms local TG = $tg local FLOOR = $floor
local o = {a = {}}
local function cnt(n) return net.get_item_count(n) end
local list = {}
for _, p in pairs(asms) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  if a then
    local out = a.get_output_inventory()
    for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
    list[#list + 1] = a
  end
end
local N = {}
for _, n in pairs({'steam-engine', 'boiler', 'offshore-pump', 'medium-electric-pole', 'underground-belt', 'splitter',
                   'iron-gear-wheel', 'pipe', 'iron-stick', 'copper-cable', 'iron-plate', 'copper-plate', 'steel-plate',
                   'stone-furnace', 'transport-belt', 'electronic-circuit'}) do N[n] = cnt(n) end
local R = {} for k, v in pairs(TG) do R[k] = math.max(0, v - N[k]) end
local need = {
  ['iron-gear-wheel'] = 8 * R['steam-engine'] + 2 * R['offshore-pump'] - N['iron-gear-wheel'],
  ['pipe'] = 5 * R['steam-engine'] + 4 * R['boiler'] + 3 * R['offshore-pump'] - N['pipe'],
  ['iron-stick'] = 4 * R['medium-electric-pole'] - N['iron-stick'],
  ['copper-cable'] = 2 * R['medium-electric-pole'] - N['copper-cable']}
o.R = R o.need = need
local order = {'splitter', 'offshore-pump', 'boiler', 'medium-electric-pole', 'underground-belt', 'steam-engine',
               'iron-gear-wheel', 'pipe', 'iron-stick', 'copper-cable'}
local function deficit(n) if TG[n] then return R[n] end return need[n] or 0 end
local function can(r)
  for _, ing in pairs(r.ingredients) do
    local fl = (ing.name == 'iron-plate') and FLOOR or 0
    if N[ing.name] == nil then N[ing.name] = cnt(ing.name) end
    if N[ing.name] - fl < ing.amount then return false end
  end
  return true
end
local busy = {}
local done = true
for _, n in pairs(order) do if deficit(n) > 0 then done = false end end
o.done = done
for _, a in pairs(list) do
  local cur = a.get_recipe() and a.get_recipe().name
  local keep = cur and deficit(cur) > 0 and not (TG[cur] and busy[cur]) and can(game.forces.player.recipes[cur])
  if cur and a.is_crafting() and deficit(cur) > 0 then keep = true end
  local pick = keep and cur or nil
  if not pick then
    for _, n in pairs(order) do
      local r = game.forces.player.recipes[n]
      if not pick and deficit(n) > 0 and not (TG[n] and busy[n]) and can(r) then pick = n end
    end
  end
  if pick and pick ~= cur then
    local back = a.set_recipe(pick)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
  elseif not pick and cur then
    local back = a.set_recipe(nil)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
  end
  if pick then
    busy[pick] = true
    local r = game.forces.player.recipes[pick]
    local out = r.products[1].amount
    local crafts = math.max(1, math.min(5, math.ceil(deficit(pick) / out)))
    local inv = a.get_inventory(defines.inventory.assembling_machine_input)
    for _, ing in pairs(r.ingredients) do
      local want = ing.amount * crafts - inv.get_item_count(ing.name)
      local fl = (ing.name == 'iron-plate') and FLOOR or 0
      want = math.min(want, N[ing.name] - fl)
      if want > 0 then
        local got = take(ing.name, want)
        if got > 0 then local p = inv.insert{name = ing.name, count = got} if p < got then store(ing.name, got - p) end N[ing.name] = N[ing.name] - got end
      end
    end
  end
  o.a[#o.a + 1] = (pick or '-') .. ' ' .. a.status
end
o.N = {eng = N['steam-engine'], boil = N['boiler'], pump = N['offshore-pump'], mp = N['medium-electric-pole'], ug = N['underground-belt'],
       spl = N['splitter'], gear = N['iron-gear-wheel'], pipe = N['pipe'], stick = N['iron-stick'], cable = N['copper-cable'], iron = N['iron-plate']}
o.nasm = #list
return o end)()"""

ASM_DECON = """(function() local s = game.surfaces[1] local n = 0 local o = {}
for _, p in pairs($asms) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  if a and not a.to_be_deconstructed() then a.set_recipe(nil) a.order_deconstruction('player') n = n + 1 end
end o.n = n return o end)()"""


def to_lua(v):
    return json.dumps(v).replace("[", "{").replace("]", "}").replace(":", "=").replace('"', "'")


def tg_lua():
    return "{" + ", ".join("['%s'] = %d" % (k, v) for k, v in TARGET.items()) + "}"


def make(ai, every=6):
    st = load()
    asms = st.get("asms") or []
    if not asms:
        log("make: 조립기 없음 - boot 먼저")
        return
    last = ""
    while True:
        r = lua(ai, MAKE, asms=to_lua(asms), tg=tg_lua(), floor=str(IRON_FLOOR))
        msg = "make %s | %s" % (T(r.get("a")), r.get("N"))
        if msg != last:
            log(msg)
            last = msg
        if r.get("done"):
            n = lua(ai, ASM_DECON, asms=to_lua(asms)).get("n")
            log("make 끝: 자재 목표 다 참 %s - 내 조립기 %s 대 해체 표시 (망 재고로)" % (r.get("N"), n))
            st["made"] = True
            save(st)
            return
        time.sleep(every)


# ---------------------------------------------------------------- build
def ghost_list():
    g = []
    for x, y, d, k in ROUTE:
        if k == "belt":
            g.append(["transport-belt", x + 0.5, y + 0.5, d, ""])
        else:
            g.append(["underground-belt", x + 0.5, y + 0.5, d, "input" if k == "ugin" else "output"])
    for n, x, y, d in BANK + WATER:
        g.append([n, x, y, d, ""])
    return g


GHOSTS = """(function() local s = game.surfaces[1] local o = {placed = 0, built = 0, ghost = 0, blocked = {}}
local L = $list local PLACE = $place
local bct = defines.build_check_type
for _, e in pairs(L) do
  local p = {e[2], e[3]}
  local real = s.find_entities_filtered{name = e[1], position = p, radius = 0.3}[1]
  local gh = s.find_entities_filtered{ghost_name = e[1], position = p, radius = 0.3}[1]
  if real then o.built = o.built + 1
  elseif gh then o.ghost = o.ghost + 1
  elseif PLACE then
    if s.can_place_entity{name = e[1], position = p, direction = e[4], force = 'player', build_check_type = bct.manual_ghost, forced = true} then
      local arg = {name = 'entity-ghost', inner_name = e[1], position = p, direction = e[4], force = 'player'}
      if e[5] ~= '' then arg.type = e[5] end
      local g = s.create_entity(arg)
      if g then o.placed = o.placed + 1 o.ghost = o.ghost + 1 end
    else
      if #o.blocked < 6 then o.blocked[#o.blocked + 1] = e[1] .. '@' .. e[2] .. ',' .. e[3] end
    end
  else o.blocked[#o.blocked + 1] = e[1] .. '@' .. e[2] .. ',' .. e[3] end
end
o.total = #L
return o end)()"""

CLEAR = """(function() local s = game.surfaces[1] local o = {marked = 0, left = 0, skip = 0}
local function mark(e)
  if e.last_user and e.last_user.name == 'Guiltyring' then o.skip = o.skip + 1 return end
  if e.to_be_deconstructed() then o.left = o.left + 1 return end
  if e.order_deconstruction('player') then o.marked = o.marked + 1 o.left = o.left + 1 end
end
for _, p in pairs($poles) do local e = s.find_entities_filtered{type = 'electric-pole', position = p, radius = 0.3}[1] if e then mark(e) end end
local c = s.find_entities_filtered{name = 'storage-chest', position = {$cx, $cy}, radius = 0.3}[1] if c then mark(c) end
local areas = {{{-12, 34}, {20, 51}}, {{22, 45}, {27, 50}}}
for _, t in pairs($tiles) do areas[#areas + 1] = {{t[1] - 0.1, t[2] - 0.1}, {t[1] + 1.1, t[2] + 1.1}} end
for _, ar in pairs(areas) do
  for _, e in pairs(s.find_entities_filtered{area = ar, type = {'tree', 'simple-entity'}}) do mark(e) end
end
return o end)()"""

LASERS = """(function() local s = game.surfaces[1] local o = {new = {}, old = 0}
local net = s.find_logistic_network_by_position({2, 30}, 'player')
local ok = 0
for _, p in pairs($new) do
  local l = s.find_entities_filtered{name = 'laser-turret', position = p, radius = 0.3}[1]
  local g = s.find_entities_filtered{ghost_name = 'laser-turret', position = p, radius = 0.3}[1]
  if l then
    local pw = l.is_connected_to_electric_network() and l.energy > 0
    o.new[#o.new + 1] = pw and 'on' or 'nopower'
    if pw then ok = ok + 1 end
  elseif g then o.new[#o.new + 1] = 'ghost'
  else
    if net.get_item_count('laser-turret') > 0 and s.can_place_entity{name = 'laser-turret', position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost, forced = true} then
      s.create_entity{name = 'entity-ghost', inner_name = 'laser-turret', position = p, force = 'player'} o.new[#o.new + 1] = 'placed'
    else o.new[#o.new + 1] = 'blocked' end
  end
end
if ok == #$new then
  for _, p in pairs($old) do
    local l = s.find_entities_filtered{name = 'laser-turret', position = p, radius = 0.3}[1]
    if l then o.old = o.old + 1 if not l.to_be_deconstructed() and not (l.last_user and l.last_user.name == 'Guiltyring') then l.order_deconstruction('player') end end
  end
  local e = s.find_entities_filtered{type = 'electric-pole', position = {12.5, 36.5}, radius = 0.3}[1]
  if e and not e.to_be_deconstructed() then e.order_deconstruction('player') end
  if e then o.old = o.old + 1 end
else
  for _, p in pairs($old) do if s.find_entities_filtered{name = 'laser-turret', position = p, radius = 0.3}[1] then o.old = o.old + 1 end end
  o.old = o.old + 1
end
o.ok = ok
return o end)()"""

WATERCHK = """(function() local s = game.surfaces[1] local o = {b = {}}
for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-12, 45}, {20, 49}}}) do
  local w = b.fluidbox[1] local st = b.fluidbox[2]
  local f = b.get_inventory(defines.inventory.fuel)
  o.b[#o.b + 1] = math.floor(w and w.amount or 0) .. '/' .. math.floor(st and st.amount or 0) .. '/' .. f.get_item_count('coal')
end
return o end)()"""

SPLIT_LUA = """(function() """ + HEAD + """
local o = {}
local sp = s.find_entities_filtered{name = 'splitter', position = {$sx, $sy}, radius = 0.3}[1]
if sp then o.state = 'already' o.prio = sp.splitter_output_priority return o end
local b = s.find_entities_filtered{type = 'transport-belt', position = {$sx + 0.5, $sy}, radius = 0.3}[1]
if not b or b.direction ~= defines.direction.south then o.state = 'nobelt' return o end
if not s.can_place_entity{name = 'transport-belt', position = {$sx - 0.5, $sy}, force = 'player'} then o.state = 'westblocked' return o end
if net.get_item_count('splitter') < 1 then o.state = 'nosplitter' return o end
local items = {}
for i = 1, b.get_max_transport_line_index() do for _, c in pairs(b.get_transport_line(i).get_contents()) do items[c.name] = (items[c.name] or 0) + c.count end end
if take('splitter', 1) < 1 then o.state = 'take-failed' return o end
b.destroy()
store('transport-belt', 1)
for n, c in pairs(items) do store(n, c) end
sp = s.create_entity{name = 'splitter', position = {$sx, $sy}, direction = defines.direction.south, force = 'player'}
if not sp then o.state = 'create-failed' store('splitter', 1) return o end
sp.splitter_output_priority = 'left'
o.state = 'swapped' o.items = items o.prio = sp.splitter_output_priority
return o end)()"""

SEED = """(function() """ + HEAD + """
local o = {req = 0}
if net.get_item_count('coal') < 60 then o.state = 'lowcoal' return o end
for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-12, 45}, {20, 49}}}) do
  local f = b.get_inventory(defines.inventory.fuel)
  local busy = s.count_entities_filtered{name = 'item-request-proxy', position = b.position, radius = 0.6} > 0
  if f.get_item_count('coal') < 3 and not busy then
    s.create_entity{name = 'item-request-proxy', position = b.position, force = 'player', target = b,
      modules = {{id = {name = 'coal'}, items = {in_inventory = {{inventory = defines.inventory.fuel, stack = 0, count = 5}}}}}}
    o.req = o.req + 1
  end
end
return o end)()"""

ROWCOAL = """(function() local s = game.surfaces[1] local n = 0 local m = 0
for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{-12, 49}, {19, 50}}}) do
  for i = 1, 2 do n = n + b.get_transport_line(i).get_item_count('coal') end
end
for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{-18, -52}, {-15, 49}}}) do
  for i = 1, 2 do m = m + b.get_transport_line(i).get_item_count('coal') end
end
return {row = n, trunk = m} end)()"""

POWER = """(function() local s = game.surfaces[1] local o = {}
local g, gn, gmax = 0, 0, 0
local nid = nil
local p0 = s.find_entities_filtered{type = 'electric-pole', position = {2, 33}, radius = 6}[1]
o.main = p0.electric_network_id
for _, e in pairs(s.find_entities_filtered{type = 'generator'}) do
  local v = e.energy_generated_last_tick * 60
  g = g + v
  if e.position.y > 34 and e.position.y < 46 and e.position.x > -12 and e.position.x < 19 then
    gn = gn + v o.newnet = e.electric_network_id o.newcnt = (o.newcnt or 0) + 1
  end
end
o.gen = g / 1e6 o.gen_new = gn / 1e6
local st = p0.electric_network_statistics local fi = defines.flow_precision_index.one_minute
o.prod1m = st.get_flow_count{name = 'steam-engine', category = 'output', precision_index = fi, count = false} * 60 / 1e6
o.cap = 0
for _, e in pairs(s.find_entities_filtered{name = 'steam-engine'}) do if e.electric_network_id == o.main then o.cap = o.cap + 0.9 end end
local old = {}
for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-60, -80}, {-30, -45}}}) do old[#old + 1] = b.get_inventory(defines.inventory.fuel).get_item_count('coal') end
o.oldcoal = old
return o end)()"""


def build(ai, every=20, once=False):
    st = load()
    ghosts = ghost_list()
    tiles = [[x, y] for x, y, _, _ in ROUTE]
    last = ""
    while True:
        disk = load()
        st["made"] = st.get("made") or disk.get("made")
        ph = st.get("phase", "L")
        msg = ""
        if ph == "L":
            r = lua(ai, LASERS, new=to_lua([list(p) for p in NEW_LASERS]), old=to_lua([list(p) for p in OLD_LASERS]))
            msg = "L 새 레이저 %s · 옛 남음 %s" % (T(r.get("new")), r.get("old"))
            if r.get("ok") == len(NEW_LASERS) and r.get("old") == 0:
                st["phase"] = "C"
        elif ph == "C":
            r = lua(ai, CLEAR, poles=to_lua([list(p) for p in OLD_POLES[1:]]), cx=str(OLD_CHEST[0]), cy=str(OLD_CHEST[1]), tiles=to_lua(tiles))
            msg = "C 해체 표시 +%s · 남음 %s · 건너뜀(Guiltyring) %s" % (r.get("marked"), r.get("left"), r.get("skip"))
            st["phase"] = "G"
        elif ph == "G":
            if not st.get("made"):
                msg = "G 대기: 자재 (make) 안 끝남"
            else:
                r = lua(ai, CLEAR, poles="{}", cx="0", cy="0", tiles=to_lua(tiles))
                g = lua(ai, GHOSTS, list=to_lua(ghosts), place="true")
                msg = "G 유령 +%s · 지음 %s/%s · 유령 %s · 막힘 %s · 나무 남음 %s" % (g["placed"], g["built"], g["total"], g["ghost"], T(g.get("blocked")), r.get("left"))
                if g["built"] == g["total"]:
                    st["phase"] = "S"
        elif ph == "S":
            w = lua(ai, WATERCHK)
            b = T(w.get("b")) or []
            full = len(b) == 10 and all(int(x.split("/")[0]) > 0 for x in b)
            msg = "S 보일러 물/증기/석탄 %s" % b
            if full:
                sp = lua(ai, SPLIT_LUA, sx=str(SPLIT[0]), sy=str(SPLIT[1]))
                sd = lua(ai, SEED)
                msg += " · 분배기 %s · 석탄 배달 %s" % (sp, sd)
                if sp.get("state") in ("swapped", "already"):
                    st["phase"] = "P"
        elif ph == "P":
            c = lua(ai, ROWCOAL)
            w = lua(ai, WATERCHK)
            sd = lua(ai, SEED)
            msg = "P 석탄 줄기 %s · 뱅크 줄 %s · 보일러 %s · 배달 %s" % (c.get("trunk"), c.get("row"), T(w.get("b")), sd.get("req"))
            b = T(w.get("b")) or []
            fueled = sum(1 for x in b if int(x.split("/")[2]) > 0)
            if c.get("row", 0) > 0 and fueled >= 8:
                g = lua(ai, GHOSTS, list=to_lua([[n, x, y, d, ""] for n, x, y, d in POLES]), place="true")
                msg += " · 전봇대 %s/%s 유령 %s" % (g["built"], g["total"], g["ghost"])
                if g["built"] == g["total"]:
                    st["phase"] = "V"
        elif ph == "V":
            p = lua(ai, POWER)
            msg = "V 발전 %.2f MW (새 %.2f, %s 대) · 1분 %.2f MW · 최대 %.1f MW · 같은 망 %s · 옛 보일러 석탄 %s" % (
                p["gen"], p["gen_new"], p.get("newcnt"), p["prod1m"], p["cap"], p.get("newnet") == p["main"], T(p.get("oldcoal")))
        save(st)
        if msg != last:
            log(msg)
            last = msg
        if once or ph == "V":
            if ph == "V":
                return
        time.sleep(every)


ROTATE = """(function() local s = game.surfaces[1] local o = {}
local b = s.find_entities_filtered{type = 'transport-belt', position = {$x, $y}, radius = 0.3}[1]
if not b then o.state = 'nobelt' return o end
if b.direction == defines.direction.east then o.state = 'already' return o end
b.direction = defines.direction.east o.state = 'rotated' o.dir = b.direction
return o end)()"""


def line2(ai, every=15):
    g2 = [["transport-belt", x + 0.5, y + 0.5, d, ""] for x, y, d, _ in LINE2]
    last = ""
    while True:
        g = lua(ai, GHOSTS, list=to_lua(g2), place="true")
        msg = "선2 유령 +%s · 지음 %s/%s · 막힘 %s" % (g["placed"], g["built"], g["total"], T(g.get("blocked")))
        if g["built"] == g["total"]:
            r = lua(ai, ROTATE, x=str(LINE2_END[0]), y=str(LINE2_END[1]))
            log(msg + " · 끝 벨트 %s" % r)
            return
        if msg != last:
            log(msg)
            last = msg
        time.sleep(every)


def status(ai):
    p = lua(ai, POWER)
    c = lua(ai, ROWCOAL)
    log("status 발전 %.2f MW (새 %.2f) · 최대 %.1f MW · 석탄 줄기 %s 뱅크 줄 %s · 옛 보일러 석탄 %s · %s" % (
        p["gen"], p["gen_new"], p["cap"], c.get("trunk"), c.get("row"), T(p.get("oldcoal")), load().get("phase")))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    ai = AIBridge()
    if cmd == "boot":
        boot(ai)
    elif cmd == "make":
        make(ai)
    elif cmd == "line2":
        line2(ai)
    elif cmd == "build":
        build(ai, once="--once" in sys.argv)
    else:
        status(ai)


if __name__ == "__main__":
    main()

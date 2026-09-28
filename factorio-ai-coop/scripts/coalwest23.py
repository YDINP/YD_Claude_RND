"""벽 안 서쪽 석탄 광맥 (x -104..-93, y -105..-97, ~309k) 채굴기 6 -> x=-51.5 새 뱅크 석탄 줄 머리 (docs/power-relocation-plan.md §8 대안 1, §9).

실측 (09:4x): x=-51.5 줄 머리 (-51.5,-81.5) 남향 (동쪽 (-50.5,-81.5) 서향 벨트가 옆에서 들어옴), 아래는 석탄 가득.
광맥은 채굴기 1 (-101.5,-101.5) 이 화로 줄 (x=-103.5 남향) 로 쓰는 중 - 그 줄은 안 건드린다.

mine : 채굴기 6 - 서 (-98.5, y) 동향 · 동 (-94.5, y) 서향, y = -103.5 / -100.5 / -97.5
       가운데 모음 벨트 x=-96.5 남향 (y -103.5..-97.5), 작은 전봇대 3 (-100.5,-103.5) (-92.5,-102.5) (-92.5,-97.5)
       (서쪽 가운데 · 아래 채굴기는 기존 전봇대 (-101.5,-99.5) 가 덮음, 전부 주 전력망 net 2)
line : 모음 벨트 끝 -> (-96.5,-96.5) … y=-88.5/-87.5 동향 … 지하 2 쌍 (-75.5->-70.5, -69.5->-64.5)
       … (-51.5,-89.5) 남향 -> 지하 (-51.5,-88.5 -> -83.5, y=-85.5 서향 벨트 밑) -> (-51.5,-82.5) 남향 -> 머리에 곧게 들어감.
       경로는 1 칸 격자 탐색 (빈칸 · 기존 벨트/분배기/지하 출구가 가리키는 칸 · 팔/채굴기 집기·떨굼 칸 회피,
       같은 축 기존 지하 벨트 사이 금지, 지하 쌍 비용 14) 결과. 다른 물품 벨트와 안 만남.
make : 지하 벨트 10 (필요 6 + 여유 4) - 망 조립기 1 한 대를 전기 자리에 유령으로 세우고 (로봇), Lua 로 망 철판 · 벨트만
       옮겨 넣어 만든 뒤 해체 (망 재고로). 아이템을 새로 만들어 내지 않는다.
짓기는 캐릭터 (outpostcrew23.run_job), 재료는 망 2 저장 -> 가방 (옮김). 나무는 캐릭터가 벤다 (chops).

    python -u scripts/coalwest23.py check [part]
    python -u scripts/coalwest23.py make
    python -u scripts/coalwest23.py build mine|line
    python -u scripts/coalwest23.py poles      (새 전봇대가 Guiltyring 전봇대에 붙었으면 떼어냄 - 다른 연결이 있을 때만)
    python -u scripts/coalwest23.py status
로그 state/coalwest23.log
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import coalline23 as cl  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "coalwest23.log")
STATE = os.path.join(HERE, "..", "state", "coalwest23.json")
UG_TARGET = 10
ASM_ANCHOR = (-21.5, -76.5)


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cl.log = log

POLES = [(-100.5, -103.5), (-92.5, -102.5), (-92.5, -97.5)]


def mine():
    b = [("electric-mining-drill", -98.5, y, "east") for y in (-103.5, -100.5, -97.5)]
    b += [("electric-mining-drill", -94.5, y, "west") for y in (-103.5, -100.5, -97.5)]
    b += [("transport-belt", -96.5, y + 0.5, "south") for y in range(-104, -97)]
    b += [("small-electric-pole", x, y, "north") for x, y in POLES]
    return b


ROUTE = [('transport-belt', -96.5, -96.5, 'south'), ('transport-belt', -96.5, -95.5, 'east'), ('transport-belt', -95.5, -95.5, 'east'),
         ('transport-belt', -94.5, -95.5, 'east'), ('transport-belt', -93.5, -95.5, 'east'), ('transport-belt', -92.5, -95.5, 'south'),
         ('transport-belt', -92.5, -94.5, 'south'), ('transport-belt', -92.5, -93.5, 'south'), ('transport-belt', -92.5, -92.5, 'south'),
         ('transport-belt', -92.5, -91.5, 'east'), ('transport-belt', -91.5, -91.5, 'south'), ('transport-belt', -91.5, -90.5, 'south'),
         ('transport-belt', -91.5, -89.5, 'east'), ('transport-belt', -90.5, -89.5, 'south'), ('transport-belt', -90.5, -88.5, 'east'),
         ('transport-belt', -89.5, -88.5, 'east'), ('transport-belt', -88.5, -88.5, 'east'), ('transport-belt', -87.5, -88.5, 'east'),
         ('transport-belt', -86.5, -88.5, 'east'), ('transport-belt', -85.5, -88.5, 'east'), ('transport-belt', -84.5, -88.5, 'east'),
         ('transport-belt', -83.5, -88.5, 'east'), ('transport-belt', -82.5, -88.5, 'south'), ('transport-belt', -82.5, -87.5, 'east'),
         ('transport-belt', -81.5, -87.5, 'east'), ('transport-belt', -80.5, -87.5, 'east'), ('transport-belt', -79.5, -87.5, 'east'),
         ('transport-belt', -78.5, -87.5, 'east'), ('transport-belt', -77.5, -87.5, 'east'), ('transport-belt', -76.5, -87.5, 'east'),
         ('underground-belt', -75.5, -87.5, 'east', 'input'), ('underground-belt', -70.5, -87.5, 'east', 'output'),
         ('underground-belt', -69.5, -87.5, 'east', 'input'), ('underground-belt', -64.5, -87.5, 'east', 'output'),
         ('transport-belt', -63.5, -87.5, 'east'), ('transport-belt', -62.5, -87.5, 'east'), ('transport-belt', -61.5, -87.5, 'east'),
         ('transport-belt', -60.5, -87.5, 'east'), ('transport-belt', -59.5, -87.5, 'east'), ('transport-belt', -58.5, -87.5, 'east'),
         ('transport-belt', -57.5, -87.5, 'east'), ('transport-belt', -56.5, -87.5, 'east'), ('transport-belt', -55.5, -87.5, 'east'),
         ('transport-belt', -54.5, -87.5, 'north'), ('transport-belt', -54.5, -88.5, 'north'), ('transport-belt', -54.5, -89.5, 'east'),
         ('transport-belt', -53.5, -89.5, 'east'), ('transport-belt', -52.5, -89.5, 'east'), ('transport-belt', -51.5, -89.5, 'south'),
         ('underground-belt', -51.5, -88.5, 'south', 'input'), ('underground-belt', -51.5, -83.5, 'south', 'output'),
         ('transport-belt', -51.5, -82.5, 'south')]


def line():
    return list(ROUTE)


PARTS = {"mine": mine, "line": line}
cl.PARTS.update(PARTS)
ENTRY = {"mine": (-89.5, -97.5), "line": (-72.5, -85.5)}


def build(ai, part):
    import outpostcrew23 as crew
    ok = crew.run_job(ai, PARTS[part](), lambda ch: [], ENTRY[part], "coalwest23", log, crew_n=2, rounds=5,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s 캐릭터 건설 %s" % (part, "완료" if ok else "미완"))
    return ok


# ---------------------------------------------------------------- make (지하 벨트)
def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(d):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


HEAD = """local s = game.surfaces[1]
local net = s.find_logistic_network_by_position({-24, -88}, 'player')
local function store(name, n) if n <= 0 then return 0 end return net.insert({name = name, count = n}) end
local function take(name, n) if n <= 0 then return 0 end return net.remove_item({name = name, count = n}) end
"""

MAKE = """(function() """ + HEAD + """
local p = {x = %s, y = %s} local TG = %d local o = {}
local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
o.ug = net.get_item_count('underground-belt')
if not a then o.err = 'noasm' return o end
local out = a.get_output_inventory()
for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
o.ug = net.get_item_count('underground-belt')
if o.ug >= TG then
  local back = a.set_recipe(nil)
  for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
  if not a.to_be_deconstructed() then a.order_deconstruction('player') end
  o.done = 1 return o end
if not a.get_recipe() or a.get_recipe().name ~= 'underground-belt' then a.set_recipe('underground-belt') end
local crafts = math.ceil((TG - o.ug) / 2)
local inv = a.get_inventory(defines.inventory.assembling_machine_input)
for _, w in pairs({{'iron-plate', 10}, {'transport-belt', 5}}) do
  local want = w[2] * crafts - inv.get_item_count(w[1]) - (a.is_crafting() and w[2] or 0)
  if want > 0 then local got = take(w[1], want)
    if got > 0 then local put = inv.insert{name = w[1], count = got} if put < got then store(w[1], got - put) end end end
end
o.status = a.status o.inv = inv.get_contents()
return o end)()"""


def make(ai):
    import power2_23 as p2
    st = load()
    if not st.get("asm"):
        g = p2.lua(ai, p2.ASM_GHOSTS, ax=str(ASM_ANCHOR[0]), ay=str(ASM_ANCHOR[1]), n="1")
        spots = p2.T(g.get("spots")) or []
        if not spots:
            log("make: 조립기 자리 없음")
            return
        st["asm"] = p2.T(spots[0])
        save(st)
        log("make: 조립기 1 유령 %s (로봇이 지음)" % st["asm"])
    x, y = st["asm"]
    last = None
    for _ in range(200):
        r = ai.lua(MAKE % (x, y, UG_TARGET))
        msg = "make 지하 벨트 망 %s %s" % (r.get("ug"), r.get("err") or r.get("status") or "")
        if msg != last:
            log(msg)
            last = msg
        if r.get("done"):
            log("make 끝: 지하 벨트 %s - 조립기 해체 표시 (망으로)" % r.get("ug"))
            st["made"] = True
            save(st)
            return
        time.sleep(5)
    log("make: 시간 초과")


# ---------------------------------------------------------------- poles
POLEFIX = """(function() local s = game.surfaces[1] local o = {}
  local m = s.find_entities_filtered{type = 'electric-pole', position = {56, -127}, radius = 4}[1]
  o.main = m.electric_network_id
  for i, q in pairs({%s}) do
    local p = s.find_entities_filtered{name = 'small-electric-pole', position = q, radius = 0.3}[1]
    if p then
      local nb = p.get_wire_connector(defines.wire_connector_id.pole_copper, false)
      local g, other = {}, 0
      for _, c in pairs(nb.connections) do local t = c.target.owner
        if t.last_user and t.last_user.name == 'Guiltyring' then g[#g + 1] = c.target else other = other + 1 end end
      local cut = 0
      if other > 0 then for _, t in pairs(g) do nb.disconnect_from(t) cut = cut + 1 end end
      o[i] = {net = p.electric_network_id, g = #g, other = other, cut = cut}
    end end
  return o end)()"""


def poles(ai):
    rows = ", ".join("{%s, %s}" % p for p in POLES)
    r = ai.lua(POLEFIX % rows)
    log("전봇대 연결 %s" % r)
    return r


STATUS = """(function() local s = game.surfaces[1] local o = {work = 0, wait = 0, other = 0, nonet = 0, bank = {}, old = {}, west = {}}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  local p = s.find_entities_filtered{type = 'electric-pole', position = {56, -127}, radius = 4}[1]
  local main = p and p.electric_network_id
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-106, -100}, {-30, -70}}}) do
    if d.mining_target and d.mining_target.name == 'coal' then
      local k = st[d.status] or d.status
      if k == 'working' then o.work = o.work + 1 elseif k == 'waiting_for_space_in_destination' then o.wait = o.wait + 1 else o.other = o.other + 1 end
      if d.electric_network_id ~= main then o.nonet = o.nonet + 1 end end end
  for _, q in pairs({{-98.5, -103.5}, {-98.5, -100.5}, {-98.5, -97.5}, {-94.5, -103.5}, {-94.5, -100.5}, {-94.5, -97.5}}) do
    local d = s.find_entities_filtered{name = 'electric-mining-drill', position = q, radius = 0.3}[1]
    o.west[#o.west + 1] = d and ((st[d.status] or d.status) .. (d.electric_network_id == main and '' or '!net')) or 'none' end
  for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-12, 30}, {20, 52}}}) do
    o.bank[#o.bank + 1] = b.get_fuel_inventory().get_item_count('coal') end
  for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-60, -80}, {-20, -40}}}) do
    o.old[#o.old + 1] = b.get_fuel_inventory().get_item_count('coal') end
  local amt = 0 for _, r in pairs(s.find_entities_filtered{name = 'coal', area = {{-105, -106}, {-92, -96}}}) do amt = amt + r.amount end
  o.ore_west = amt
  local head = s.find_entities_filtered{type = 'transport-belt', position = {-51.5, -82.5}, radius = 0.3}[1]
  o.head_coal = head and head.get_item_count('coal') or -1
  local p1 = defines.flow_precision_index.ten_minutes
  local ps = game.forces.player.get_item_production_statistics(s)
  o.coal10 = {math.floor(ps.get_flow_count{name = 'coal', category = 'input', precision_index = p1, count = true}),
              math.floor(ps.get_flow_count{name = 'coal', category = 'output', precision_index = p1, count = true})}
  return o end)()"""


def status(ai):
    r = ai.lua(STATUS)
    for k in ("bank", "old", "west"):
        v = r.get(k) or {}
        r[k] = list(v.values()) if isinstance(v, dict) else v
    log("상태 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "make", "build", "poles", "status"])
    ap.add_argument("part", nargs="?")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        for p in ([a.part] if a.part else PARTS):
            cl.check(ai, p)
    elif a.cmd == "make":
        make(ai)
    elif a.cmd == "build":
        build(ai, a.part)
    elif a.cmd == "poles":
        poles(ai)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

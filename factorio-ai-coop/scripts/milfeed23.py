"""군사 재료 복구 (resource-expansion-plan 7절 첫 행동) - 상주 60초.

2026-09-28 실측: 망 2 구리판 0 인데 구리는 철 상자 (5.5,-5.5) 511 · (-23.5,-8.5) 402 에 쌓이고 (계속 증가),
강철은 화로 (-29,-45)(-29,-40)(-5,-34)(-5,-32) 출력에 100 씩 막혀 있다 (400). 벨트 조립기 (-45.5,7.5) 는 톱니 부족이 아니라
출력 막힘 (벨트 줄 끝 = 초록팩 조립기 (-74.5,16.5) 가 다 못 먹음). 포탑 조립기 (-87.5,-38.5) 는 톱니·구리·철 0,
관통탄 (-63.5,-33.5) 은 강철 0, 로보포트 조립기 (34.5,-38.5) 는 고급회로 24/45 (고급회로는 벨트 위 314 개).

하는 일 (Lua 직접 옮김 = battfeed23 RELAYS 방식, 로봇 요청은 철 하나만 - 건설 로봇이 바쁘다)
  STORE : 남는 것 -> 망 2 저장 상자 (구리판 상자마다 150 남김, 강철 화로마다 20 남김, 벨트 줄 합 30 남김, 로보포트 출력 상자 전부)
  FEED  : 조립기 입력 직접 (포탑 톱니·구리, 관통탄 구리·강철, 로보포트 고급회로)
  REQ   : 로봇 배달 (포탑 철) - 망 재고가 충분할 때만, 100 이하
Guiltyring 이 last_user 인 것에서는 꺼내지 않는다 (넣기만).

    python -u scripts/milfeed23.py --check          # 한 번 돌리고 망 재고 표
    python -u scripts/milfeed23.py                  # 상주 (60초)
    python -u scripts/milfeed23.py --pause-purple   # 보라 사슬 레일·전기로 조립기 정지 (강철 풀기, 기본 꺼짐)
    python -u scripts/milfeed23.py --resume-purple  # 다시 켜고 끝
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

CU_CHESTS = [(5.5, -5.5), (-23.5, -8.5)]
STEEL_FURN = [(-29, -45), (-29, -40), (-5, -34), (-5, -32)]
GEAR_ASM = [(-14.5, -66.5), (-28.5, -37.5), (-28.5, -21.5), (14.5, -24.5), (26.5, -24.5), (-36.5, 3.5), (33.5, -4.5)]
BELT_LINE = ((-76, 6), (-47, 15))            # 벨트 조립기 -> 초록팩 (-74.5,16.5) 줄 (막힘)
ADV_BELTS = ((30, -40), (48, 10))           # 고급회로 벨트 (로보포트 조립기 근처)

# 망 2 저장으로: (종류, 출처들/구역, 아이템, 출처에 남길 양, 한 번 최대, 망 재고 상한)
STORE = [("chest", CU_CHESTS, "copper-plate", 150, 200, 1500),
         ("out", STEEL_FURN, "steel-plate", 20, 200, 400),
         ("belt", BELT_LINE, "transport-belt", 30, 100, 400),
         ("chest", [(34.5, -41.5)], "roboport", 0, 10, 50)]

# 조립기 입력 직접: (대상, 아이템, 이 밑이면, 넣을 양, 출처 종류, 출처, 출처에 남길 양)
FEED = [((-87.5, -38.5), "iron-gear-wheel", 30, 60, "out", GEAR_ASM, 0),
        ((-87.5, -38.5), "copper-plate", 30, 60, "chest", CU_CHESTS, 100),
        ((-63.5, -33.5), "copper-plate", 20, 50, "chest", CU_CHESTS, 100),
        # 09-29 강철은 철 전초 현지 제련 -> 망 2 (기지 강철 화로 정리 대비)
        ((-63.5, -33.5), "steel-plate", 5, 20, "net", [], 100),
        ((34.5, -38.5), "advanced-circuit", 45, 25, "belt", ADV_BELTS, 0)]

# 로봇 배달: (대상, 아이템, 이 밑이면, 요청 수, 망 재고가 이만큼 넘을 때만)
REQ = [((-87.5, -38.5), "iron-plate", 60, 100, 300)]  # 포탑 16초에 1 = 분당 철 75 · 톱니·구리 37

PURPLE = [(-85.5, -82.5), (-93.5, -82.5)]   # 레일 · 전기로 조립기
WATCH = ["copper-plate", "steel-plate", "iron-gear-wheel", "gun-turret", "transport-belt", "small-electric-pole",
         "roboport", "piercing-rounds-magazine", "advanced-circuit"]
STATUS = [(-87.5, -38.5), (-63.5, -33.5), (-45.5, 7.5), (34.5, -38.5)]

LIB = r"""local s = game.surfaces[1]
local GR = 'Guiltyring'
local function n2() for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then return n end end end
local function mine(e) return not (e.last_user and e.last_user.name == GR) end
local function src_invs(kind, where)
  local r = {}
  if kind == 'belt' then
    for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, area = where}) do
      if mine(b) then for li = 1, b.get_max_transport_line_index() do r[#r + 1] = b.get_transport_line(li) end end
    end
    return r
  end
  for _, p in pairs(where) do
    local e = s.find_entities_filtered{position = p, radius = 0.5, type = {'container', 'assembling-machine', 'furnace'}}[1]
    if e and mine(e) then r[#r + 1] = e.type == 'container' and e.get_inventory(defines.inventory.chest) or e.get_output_inventory() end
  end
  return r
end
local function take(kind, where, item, keep, n, put)
  if kind == 'net' then  -- 망 2 에서 (keep = 망에 남길 양)
    local net = n2() local k = math.min(n, net.get_item_count(item) - keep)
    if k <= 0 then return 0 end
    k = net.remove_item{name = item, count = k} local g = put(k)
    if g < k then net.insert{name = item, count = k - g} end
    return g
  end
  local invs = src_invs(kind, where)
  local tot = 0 for _, v in pairs(invs) do tot = tot + v.get_item_count(item) end
  local want = kind == 'belt' and math.min(n, tot - keep) or n local got = 0
  for _, v in pairs(invs) do
    if want <= 0 then break end
    local k = math.min(want, v.get_item_count(item) - (kind == 'belt' and 0 or keep))
    if k > 0 then
      k = put(k)
      if k > 0 then
        if kind == 'belt' then v.remove_item{name = item, count = k} else v.remove{name = item, count = k} end
      end
      want, got = want - k, got + k
    end
  end
  return got
end
local function status(e) for k, v in pairs(defines.entity_status) do if v == e.status then return k end end return '?' end
"""

MAIN = LIB + r"""
local o = {store = {}, feed = {}, req = {}, net = {}, st = {}}
local net = n2()
local store_list = {}
for _, c in pairs(net.storages) do if c.position.y > -110 then  -- 북쪽 키트 상자 (53.5,-123.5) 는 뺀다
  local f = c.get_filter and c.get_filter(1)
  store_list[#store_list + 1] = {c = c, f = f and f.name}
end end
for _, t in pairs({%(store)s}) do
  if net.get_item_count(t[3]) < t[6] then
    local g = take(t[1], t[2], t[3], t[4], t[5], function(k)
      local left = k
      for _, sc in pairs(store_list) do
        if left <= 0 then break end
        if not sc.f or sc.f == t[3] then left = left - sc.c.insert{name = t[3], count = left} end
      end
      return k - left end)
    if g > 0 then o.store[#o.store + 1] = t[3] .. ' ' .. g end
  end
end
for _, t in pairs({%(feed)s}) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = t[1], radius = 0.5}[1]
  if a then
    local inv = a.get_inventory(defines.inventory.assembling_machine_input)
    if inv.get_item_count(t[2]) < t[3] then
      local g = take(t[5], t[6], t[2], t[7], t[4], function(k) return inv.insert{name = t[2], count = k} end)
      if g > 0 then o.feed[#o.feed + 1] = t[2] .. ' ' .. g .. ' -> ' .. t[1][1] .. ',' .. t[1][2] end
    end
  end
end
for _, t in pairs({%(req)s}) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = t[1], radius = 0.5}[1]
  if a then
    local have = a.get_inventory(defines.inventory.assembling_machine_input).get_item_count(t[2])
    local busy = s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} > 0
    if have < t[3] and not busy and net.get_item_count(t[2]) >= t[5] then
      local stack = 0 local r = a.get_recipe()
      if r then for i, ing in pairs(r.ingredients) do if ing.name == t[2] then stack = i - 1 end end end
      s.create_entity{name = 'item-request-proxy', position = a.position, force = 'player', target = a,
        modules = {{id = {name = t[2]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = stack, count = t[4]}}}}}}
      o.req[#o.req + 1] = t[2] .. ' ' .. t[4] .. ' @' .. t[1][1] .. ',' .. t[1][2]
    end
  end
end
for _, k in pairs({%(watch)s}) do o.net[k] = net.get_item_count(k) end
for _, p in pairs({%(status)s}) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1]
  if a then o.st[#o.st + 1] = (a.get_recipe() and a.get_recipe().name or '-') .. ' ' .. status(a) end
end
return o"""

PURPLE_LUA = LIB + r"""
local o = {}
for _, p in pairs({%s}) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1]
  if a and mine(a) then a.active = %s o[#o + 1] = (a.get_recipe() and a.get_recipe().name or '-') .. ' active=' .. tostring(a.active) end
end
return o"""


def pt(p):
    return "{%s, %s}" % p


def pts(ps):
    return "{%s}" % ", ".join(pt(p) for p in ps)


def area(a):
    return "{%s, %s}" % (pt(a[0]), pt(a[1]))


def where(kind, w):
    return area(w) if kind == "belt" else pts(w)


def build_main() -> str:
    store = ", ".join("{'%s', %s, '%s', %d, %d, %d}" % (k, where(k, w), it, keep, n, cap)
                      for k, w, it, keep, n, cap in STORE)
    feed = ", ".join("{%s, '%s', %d, %d, '%s', %s, %d}" % (pt(d), it, lo, n, k, where(k, w), keep)
                     for d, it, lo, n, k, w, keep in FEED)
    req = ", ".join("{%s, '%s', %d, %d, %d}" % (pt(d), it, lo, n, need) for d, it, lo, n, need in REQ)
    return "(function() " + MAIN % {
        "store": store, "feed": feed, "req": req,
        "watch": ", ".join("'%s'" % w for w in WATCH), "status": ", ".join(pt(p) for p in STATUS)} + " end)()"


def lst(v):
    return list(v.values()) if isinstance(v, dict) else (v or [])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="한 번만 돌리고 끝")
    ap.add_argument("--every", type=float, default=60)
    ap.add_argument("--pause-purple", action="store_true", help="레일·전기로 조립기 정지 (강철 풀기)")
    ap.add_argument("--resume-purple", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.pause_purple or a.resume_purple:
        r = ai.lua("(function() " + PURPLE_LUA % (", ".join(pt(p) for p in PURPLE),
                                                  "false" if a.pause_purple else "true") + " end)()")
        print(time.strftime("%H:%M:%S"), "보라 사슬", lst(r), flush=True)
        if a.resume_purple:
            return 0
    lua = build_main()
    while True:
        try:
            r = ai.lua(lua)
            net = r.get("net") or {}
            print(time.strftime("%H:%M:%S"),
                  "저장", lst(r.get("store")), "| 투입", lst(r.get("feed")), "| 요청", lst(r.get("req")),
                  "| 망2", " ".join(f"{k.replace('-plate', '').replace('-magazine', '')}={net.get(k, 0)}" for k in WATCH),
                  "|", ", ".join(lst(r.get("st"))), flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"milfeed: {type(e).__name__}: {e}"[:300], flush=True)
        if a.check:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

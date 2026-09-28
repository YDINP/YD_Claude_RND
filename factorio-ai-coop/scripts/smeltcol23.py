"""전초 현지 제련 기둥 - 구리 (47.5,-361.5) · 철 (-155.5,-242.5) + 철 전초 강철. 사용자 07:45 / 07:55 / 08:04.

기존 긴 벨트를 판 벨트로 쓴다. 머리 (Xr,y0) 를 서향으로 돌려 광석을 옆 기둥 (Xr-5) 으로 빼고, 그 사이에 돌 화로.
    판 벨트 Xr (남향)  출력 팔 Xr-1  화로 Xr-2..Xr-3  입력 팔 Xr-4  광석 기둥 Xr-5 (남향, 막다른 끝)
    화로 i 중심 (Xr-2.5, y0+1.5+2i), 두 팔 (y0+1+2i) 모두 서쪽에서 집음. 전봇대 두 줄마다 두 팔 기둥 빈 칸 (y0+2+2i).
철 강철 (판 벨트 서쪽, 광석 기둥 아래): 화로 하나에 팔 둘 - 윗칸 벨트 -> 화로 (철판), 아랫칸 화로 -> 벨트 (강철).
    강철은 제련 재료가 아니라 아래 강철 화로가 다시 집지 않는다. 전력은 벨트 동쪽 x=Xr+1 전봇대 4칸 간격.

짓기는 캐릭터 (outpostcrew23), 재료는 망 2 저장에서 가방으로 옮김.
전환 (switch): 화로 ≥ MIN_ON 가동 준비 (연료 · 팔 전력) 뒤 머리 벨트만 Lua 로 돌린다 (운전 조작, 건설 아님).
상주 (run): 화로 연료 (망 석탄 > 100 -> 석탄 상자 (-1.5,-30.5) 300 초과분, 임시 중계), 기지 끝 판 벨트에서 판 · 강철을 망 저장으로 (상한).
    철 기지 끝: 안쪽 구간 끝 지하 (-88.5,-43.5)(-86.5,-43.5) 해체 (로봇, 기지 망 안) -> 판이 col41 돌 화로로 가 강철이 되는 것을 막는다.

    python -u scripts/smeltcol23.py check cu|fe      # 칸 검사 (드라이런)
    python -u scripts/smeltcol23.py build cu|fe      # 캐릭터가 짓는다
    python -u scripts/smeltcol23.py switch cu|fe     # 머리 돌림 (조건 확인)
    python -u scripts/smeltcol23.py run              # 상주 60 초 (연료 · 기지 끝 · 기록)
로그 state/smeltcol23.log
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "smeltcol23.log")
STATE = os.path.join(HERE, "..", "state", "smeltcol23.json")
COALBOX = (-1.5, -30.5)
MIN_ON = 10

SITES = {
    "cu": dict(Xr=47.5, y0=-361.5, N=16, ore="copper-ore", plate="copper-plate", steel=None,
               bridge=[(50.5, -339.5)], entry=(40.5, -365.5), label="구리",
               # 기지 끝: cusmelt 줄 y=-100.5 끝 (막다른 끝)
               tail=((-43, -101), (-4, -100)), caps={"copper-plate": 5000, "copper-ore": 4000}),
    "fe": dict(Xr=-155.5, y0=-242.5, N=18, ore="iron-ore", plate="iron-plate",
               steel=dict(r0=-191.5, n=8), bridge=[], entry=(-162.5, -238.5), label="철",
               # 기지 끝: 안쪽 가로 줄 y=-43.5 (x -112.5..-89.5), 지하 해체 뒤 끝 (-89.5)
               tail=((-100, -44), (-89, -43)), caps={"iron-plate": 16000, "steel-plate": 2000, "iron-ore": 2000},
               cut=[(-88.5, -43.5), (-86.5, -43.5)],
               # 판이 벽 안 세로 줄 (x=-112.5) 에 보이면 그때 지하를 끊는다 (그 전 광석은 col41 로 그대로)
               cut_when=((-113, -112), (-112, -44)),
               # basecleanup23 fe 뒤: 판은 벨트로 조립 줄 -> 끝 상자. 상자의 강철 · 석탄 · 광석을 망으로 (판은 둔다 - 상자가 차면 벨트가 쉰다)
               end_chest=(-49.5, 0.5), chest_caps={"steel-plate": 2000, "coal": 400, "iron-ore": 2000}),
}


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(st):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)


def layout(key):
    """(builds, furnaces, turn). builds = [(name, x, y, dir)]"""
    c = SITES[key]
    X, y0, N = c["Xr"], c["y0"], c["N"]
    b = []
    for k in range(1, 5):
        b.append(("transport-belt", X - k, y0, "west"))
    b.append(("transport-belt", X - 5, y0, "south"))
    for j in range(1, 2 * N + 1):
        b.append(("transport-belt", X - 5, y0 + j, "south"))
    furn = []
    for i in range(N):
        yc = y0 + 1.5 + 2 * i
        furn.append((X - 2.5, yc))
        b.append(("stone-furnace", X - 2.5, yc, "north"))
        b.append(("inserter", X - 1, y0 + 1 + 2 * i, "west"))
        b.append(("inserter", X - 4, y0 + 1 + 2 * i, "west"))
        if i % 2 == 0:
            b.append(("small-electric-pole", X - 1, y0 + 2 + 2 * i, "north"))
            b.append(("small-electric-pole", X - 4, y0 + 2 + 2 * i, "north"))
    for p in c["bridge"]:
        b.append(("small-electric-pole", p[0], p[1], "north"))
    sfurn = []
    if c.get("steel"):
        r0, n = c["steel"]["r0"], c["steel"]["n"]
        for k in range(n):
            r = r0 + 2 * k
            sfurn.append((X - 2.5, r + 0.5))
            b.append(("stone-furnace", X - 2.5, r + 0.5, "north"))
            b.append(("inserter", X - 1, r, "east"))       # 벨트 -> 화로 (철판)
            b.append(("inserter", X - 1, r + 1, "west"))   # 화로 -> 벨트 (강철)
        for yp in range(0, 2 * n + 1, 4):
            b.append(("small-electric-pole", X + 1, r0 + 1 + yp, "north"))
    return b, furn + sfurn, (X, y0)


DIRN = {"north": 0, "east": 4, "south": 8, "west": 12}

CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then
      local h = (t[1] == 'stone-furnace') and 0.95 or 0.45
      if s.count_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}, type = 'resource'} > 0 then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':ore'
      else o.ok = o.ok + 1 end
    else
      local why = '' for _, x in pairs(s.find_entities_filtered{position = {t[2], t[3]}, radius = 1}) do why = why .. x.name .. ' ' end
      o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
  end return o end)()"""


def rows(builds):
    return ", ".join("{'%s', %s, %s, %d}" % (n, x, y, DIRN[d]) for n, x, y, d in builds)


def check(ai, key):
    b, _, _ = layout(key)
    out = {"ok": 0, "have": 0, "bad": []}
    for k in range(0, len(b), 120):
        r = ai.lua(CHECK % rows(b[k:k + 120]))
        out["ok"] += r.get("ok", 0)
        out["have"] += r.get("have", 0)
        bad = r.get("bad") or []
        out["bad"] += list(bad.values()) if isinstance(bad, dict) else bad
    cnt = {}
    for n, *_ in b:
        cnt[n] = cnt.get(n, 0) + 1
    log("%s 칸 검사: 전체 %d %s · 있음 %d · 가능 %d · 막힘 %s" % (SITES[key]["label"], len(b), cnt, out["have"], out["ok"], out["bad"]))
    return out


def build(ai, key):
    import outpostcrew23 as crew
    c = SITES[key]
    b, furn, _ = layout(key)
    # 돌 화로 · 팔 · 전봇대 먼저 두고 벨트는 마지막 (머리 벨트는 전환 전까지 광석 흐름과 무관 - 옆 칸)
    ok = crew.run_job(ai, b, lambda ch: [], c["entry"], "smeltcol23", log, crew_n=3, rounds=6,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s 제련 기둥 캐릭터 건설 %s" % (c["label"], "완료" if ok else "미완"))
    return ok


STATUS = """(function() local s = game.surfaces[1] local o = {furn = 0, fueled = 0, ins = 0, ins_pow = 0, work = 0, plate_out = 0}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, p in pairs({%s}) do
    local f = s.find_entities_filtered{name = 'stone-furnace', position = p, radius = 0.3}[1]
    if f then o.furn = o.furn + 1
      if f.get_inventory(defines.inventory.fuel).get_item_count() > 0 then o.fueled = o.fueled + 1 end
      if f.status == defines.entity_status.working then o.work = o.work + 1 end
      o.plate_out = o.plate_out + f.get_inventory(defines.inventory.furnace_result).get_item_count()
    end
  end
  for _, i in pairs(s.find_entities_filtered{name = 'inserter', area = %s}) do o.ins = o.ins + 1
    if i.is_connected_to_electric_network() and i.energy > 0 then o.ins_pow = o.ins_pow + 1 end end
  local T = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  o.turn = T and T.direction or -1
  return o end)()"""


def area_of(key):
    c = SITES[key]
    X, y0, N = c["Xr"], c["y0"], c["N"]
    y1 = y0 + 2 * N + 1
    if c.get("steel"):
        y1 = c["steel"]["r0"] + 2 * c["steel"]["n"] + 1
    return "{{%s, %s}, {%s, %s}}" % (X - 5, y0, X, y1)


def status(ai, key):
    _, furn, turn = layout(key)
    pts = ", ".join("{%s, %s}" % p for p in furn)
    return ai.lua(STATUS % (pts, area_of(key), turn[0], turn[1]))


FUEL = """(function() local s = game.surfaces[1] local o = {put = 0, src_net = 0, src_box = 0, short = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local box = s.find_entities_filtered{type = 'container', position = {%s, %s}, radius = 0.6}[1]
  -- 08:32 col41 연료였던 석탄 줄 x=-51.5 (옆치기 해체 뒤 막힘) 이 첫 공급원 - 그 줄이 태우던 몫이 그대로 전초로 간다
  local line = s.find_entities_filtered{type = 'transport-belt', area = {{-52, -66}, {-51, -47}}}
  o.src_line = 0
  local function from_line(n)
    local got = 0
    for _, b in pairs(line) do
      for li = 1, 2 do if got < n then local L = b.get_transport_line(li)
        local k = math.min(n - got, L.get_item_count('coal')) if k > 0 then got = got + L.remove_item{name = 'coal', count = k} end end end
      if got >= n then break end
    end
    o.src_line = o.src_line + got return got end
  -- 09:10 x=-51.5 줄은 새 호숫가 발전소 보일러 석탄 줄 (ca88c88) - 거기서 빼지 않는다. 망 석탄 / 석탄 상자만.
  local function coal(n)
    local got = 0
    if net and net.get_item_count('coal') > 100 + n then got = net.remove_item{name = 'coal', count = n} o.src_net = o.src_net + got end
    if got == 0 and box and box.get_item_count('coal') > 300 + n then got = box.remove_item{name = 'coal', count = n} o.src_box = o.src_box + got end
    return got end
  for _, p in pairs({%s}) do
    local f = s.find_entities_filtered{name = 'stone-furnace', position = p, radius = 0.3}[1]
    if f then local fu = f.get_inventory(defines.inventory.fuel)
      local have = fu.get_item_count('coal') local need = %d - have
      if have <= %d and need > 0 then local got = coal(need) if got > 0 then fu.insert{name = 'coal', count = got} o.put = o.put + got else o.short = o.short + 1 end end
    end
  end
  o.box = box and box.get_item_count('coal') or -1
  o.net = net and net.get_item_count('coal') or -1
  return o end)()"""


# 철 전초는 석탄 벨트 (coalline23) 가 들어온 뒤로 비상 보충만 한다: 연료칸 1 이하 -> 4 까지.
# state/smeltcol23.json 의 fe.belt_coal 이 켜져 있으면 비상 모드. 끄면 예전처럼 6 이하 -> 12.
BELT_COAL_LOW, BELT_COAL_FILL = 1, 4


def fuel(ai, key):
    _, furn, _ = layout(key)
    pts = ", ".join("{%s, %s}" % p for p in furn)
    low, fill = 6, 12
    if load().get(key, {}).get("belt_coal"):
        low, fill = BELT_COAL_LOW, BELT_COAL_FILL
    return ai.lua(FUEL % (COALBOX[0], COALBOX[1], pts, fill, low))


SWITCH = """(function() local s = game.surfaces[1] local o = {}
  local T = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if not T then return {err = 'no head belt'} end
  local W = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if not W then return {err = 'no side belt'} end
  if T.direction ~= defines.direction.west then T.direction = defines.direction.west o.rotated = true end
  o.dir = T.direction return o end)()"""


def switch(ai, key, force=False):
    c = SITES[key]
    st = status(ai, key)
    b, _, turn = layout(key)
    miss = [x for x in b if x[0] == "transport-belt"]
    import outpostcrew23 as crew
    belts_missing = crew.missing(ai, miss)
    log("%s 전환 조건: %s · 빠진 벨트 %d" % (c["label"], st, len(belts_missing)))
    if belts_missing or (not force and (st.get("fueled", 0) < MIN_ON or st.get("ins_pow", 0) < 2 * MIN_ON)):
        log("%s 전환 보류" % c["label"])
        return False
    r = ai.lua(SWITCH % (turn[0], turn[1], turn[0] - 1, turn[1]))
    log("%s 머리 벨트 서향 %s" % (c["label"], r))
    s = load()
    s.setdefault(key, {})["switched"] = time.strftime("%H:%M:%S")
    save(s)
    return not r.get("err")


TAIL = """(function() local s = game.surfaces[1] local o = {moved = {}, left = {}}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local caps = {%s}
  for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = %s}) do
    for li = 1, 2 do local L = b.get_transport_line(li)
      for name, cap in pairs(caps) do
        local k = L.get_item_count(name)
        if k > 0 then
          if net.get_item_count(name) < cap then
            local put = net.insert({name = name, count = k}, 'storage')
            if put > 0 then L.remove_item{name = name, count = put} o.moved[name] = (o.moved[name] or 0) + put end
          else o.left[name] = (o.left[name] or 0) + k end
        end
      end
    end
  end
  o.stock = {} for name, _ in pairs(caps) do o.stock[name] = net.get_item_count(name) end
  return o end)()"""


def tail(ai, key):
    c = SITES[key]
    (ax, ay), (bx, by) = c["tail"]
    caps = ", ".join("['%s'] = %d" % kv for kv in c["caps"].items())
    return ai.lua(TAIL % (caps, "{{%s, %s}, {%s, %s}}" % (ax, ay, bx, by)))


CUT = """(function() local s = game.surfaces[1] local o = {}
  for i, p in pairs({%s}) do
    local e = s.find_entities_filtered{type = 'underground-belt', position = p, radius = 0.3}[1]
    if e then if not e.to_be_deconstructed() then e.order_deconstruction('player') o['ordered' .. i] = true end o['u' .. i] = 'marked'
    else o['u' .. i] = 'gone' end
  end return o end)()"""


PLATES_AT = """(function() local s = game.surfaces[1] local n = 0
  for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = %s}) do
    for li = 1, 2 do n = n + b.get_transport_line(li).get_item_count('%s') end end
  return {n = n} end)()"""


def cut(ai, key):
    c = SITES[key]
    pts = c.get("cut") or []
    if not pts:
        return {}
    st = load()
    if not st.get(key, {}).get("cut"):
        (ax, ay), (bx, by) = c["cut_when"]
        n = ai.lua(PLATES_AT % ("{{%s, %s}, {%s, %s}}" % (ax, ay, bx, by), c["plate"])).get("n", 0)
        if n == 0:
            return {"wait_plates": True}
        st.setdefault(key, {})["cut"] = time.strftime("%H:%M:%S")
        save(st)
        log("%s 판이 벽 안에 도착 (%d) - 지하 해체 표시" % (c["label"], n))
    return ai.lua(CUT % ", ".join("{%s, %s}" % p for p in pts))


ORE_BACK = """(function() local s = game.surfaces[1] local o = {back = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local have = net.get_item_count('%s') if have <= 0 then return o end
  for _, p in pairs({%s}) do
    if have <= 0 then break end
    local f = s.find_entities_filtered{name = 'stone-furnace', position = p, radius = 0.3}[1]
    if f then local src = f.get_inventory(defines.inventory.furnace_source)
      if src.is_empty() or src.get_item_count('%s') > 0 then
        local want = math.min(20 - src.get_item_count('%s'), have)
        if want >= 5 then local got = net.remove_item{name = '%s', count = want}
          if got > 0 then local put = src.insert{name = '%s', count = got}
            if put < got then net.insert({name = '%s', count = got - put}, 'storage') end
            o.back = o.back + put have = have - put end end end end
  end o.left = net.get_item_count('%s') return o end)()"""


def ore_back(ai, key):
    """기지 끝에서 망으로 옮겨 둔 광석 (전환 때 벨트에 남은 것) 을 전초 화로 원료칸으로 되돌려 녹인다 (옮김)."""
    c = SITES[key]
    _, furn, _ = layout(key)
    pts = ", ".join("{%s, %s}" % p for p in furn[:c["N"]])
    o = c["ore"]
    return ai.lua(ORE_BACK % (o, pts, o, o, o, o, o, o))


CHEST_OUT = """(function() local s = game.surfaces[1] local o = {moved = {}}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local c = s.find_entities_filtered{type = {'container', 'logistic-container'}, position = {%s, %s}, radius = 0.8}[1]
  if not c then return {err = 'no end chest'} end
  local inv = c.get_inventory(defines.inventory.chest)
  for name, cap in pairs({%s}) do
    local k = inv.get_item_count(name)
    if k > 0 and net.get_item_count(name) < cap then local put = net.insert({name = name, count = k}, 'storage')
      if put > 0 then inv.remove{name = name, count = put} o.moved[name] = put end end
  end
  o.plates = inv.get_item_count('iron-plate') o.free = inv.count_empty_stacks()
  o.stock = {steel = net.get_item_count('steel-plate'), iron = net.get_item_count('iron-plate')}
  return o end)()"""


def chest_out(ai, key):
    c = SITES[key]
    caps = ", ".join("['%s'] = %d" % kv for kv in c["chest_caps"].items())
    return ai.lua(CHEST_OUT % (c["end_chest"][0], c["end_chest"][1], caps))


FILTER = """(function() local s = game.surfaces[1] local o = {moved = {}}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  -- 안쪽 구간 (전초 판만 다니는 곳): 세로 x=-112.5 + 가로 y=-43.5
  local belts = s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{-113, -110}, {-112, -44}}}
  for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{-113, -44}, {-89, -43}}}) do belts[#belts + 1] = b end
  local row = 0
  for _, b in pairs(belts) do if b.position.y > -44 then for li = 1, 2 do row = row + b.get_transport_line(li).get_item_count() end end end
  o.row = row
  local caps = {%s}
  for _, b in pairs(belts) do
    for li = 1, 2 do local L = b.get_transport_line(li)
      for name, cap in pairs(caps) do
        local k = L.get_item_count(name)
        if k > 0 and net.get_item_count(name) < cap then local put = net.insert({name = name, count = k}, 'storage')
          if put > 0 then L.remove_item{name = name, count = put} o.moved[name] = (o.moved[name] or 0) + put end end
      end
    end
  end
  -- 판 넘침: 가로 줄이 꽉 차 있으면 (조립 줄이 다 먹고 남음) 세로 줄 판 일부를 망으로
  if row >= %d and net.get_item_count('iron-plate') < %d then
    local left = %d
    for _, b in pairs(belts) do if left <= 0 then break end
      if b.position.y < -50 then for li = 1, 2 do local L = b.get_transport_line(li) local k = math.min(left, L.get_item_count('iron-plate'))
        if k > 0 then local put = net.insert({name = 'iron-plate', count = k}, 'storage') if put > 0 then L.remove_item{name = 'iron-plate', count = put} left = left - put
          o.moved['iron-plate'] = (o.moved['iron-plate'] or 0) + put end end end end end
  end
  return o end)()"""

STEEL_CAP = 3000
STEEL_REG = """(function() local s = game.surfaces[1] local o = {on = 0, off = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local k = net.get_item_count('steel-plate') o.steel = k
  local want = nil if k >= %d then want = false elseif k <= %d then want = true end
  for _, p in pairs({%s}) do
    local i = s.find_entities_filtered{name = 'inserter', position = p, radius = 0.3}[1]
    if i then if want ~= nil and i.active ~= want then i.active = want end if i.active then o.on = o.on + 1 else o.off = o.off + 1 end end
  end return o end)()"""


def fe_filter(ai):
    caps = "['steel-plate'] = %d, ['coal'] = 600, ['stone'] = 400, ['iron-ore'] = 2000" % STEEL_CAP
    return ai.lua(FILTER % (caps, 70, SITES["fe"]["caps"]["iron-plate"], 200))


def steel_reg(ai):
    c = SITES["fe"]
    X, r0, n = c["Xr"], c["steel"]["r0"], c["steel"]["n"]
    pts = ", ".join("{%s, %s}" % (X - 1, r0 + 2 * k) for k in range(n))
    return ai.lua(STEEL_REG % (STEEL_CAP, STEEL_CAP - 500, pts))


FLOW = """(function() local s = game.surfaces[1]
  local st = game.forces.player.get_item_production_statistics(s) local p1 = defines.flow_precision_index.ten_minutes
  local o = {} for _, n in pairs({'copper-plate', 'iron-plate', 'steel-plate', 'copper-ore', 'iron-ore', 'coal'}) do
    o[n] = {math.floor(st.get_flow_count{name = n, category = 'input', precision_index = p1, count = true}),
            math.floor(st.get_flow_count{name = n, category = 'output', precision_index = p1, count = true})} end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "build", "switch", "status", "run"])
    ap.add_argument("site", nargs="?")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--every", type=float, default=60)
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        check(ai, a.site)
    elif a.cmd == "build":
        build(ai, a.site)
    elif a.cmd == "switch":
        switch(ai, a.site, a.force)
    elif a.cmd == "status":
        for k in ([a.site] if a.site else SITES):
            log("%s 상태 %s · 기지 끝 %s" % (SITES[k]["label"], status(ai, k), tail(ai, k) if load().get(k, {}).get("switched") else "-"))
        log("10분 흐름 %s" % ai.lua(FLOW))
    else:
        log("smeltcol23 상주 시작")
        n = 0
        while True:
            try:
                st = load()
                for k in SITES:
                    f = fuel(ai, k)
                    sw = st.get(k, {}).get("switched")
                    off = st.get(k, {}).get("tail_off")
                    t = tail(ai, k) if sw and not off else None
                    cu = cut(ai, k) if sw and not off else None
                    if off and SITES[k].get("end_chest"):
                        t = chest_out(ai, k)
                        t["filter"] = fe_filter(ai)
                        t["steel_reg"] = steel_reg(ai)
                    if sw:
                        ob = ore_back(ai, k)
                        if ob.get("back"):
                            log("%s 남은 광석 전초 화로로 %s" % (SITES[k]["label"], ob))
                    if n % 5 == 0 or (f.get("short")) or (t and t.get("moved")):
                        log("%s 연료 %s · 기지 끝 %s · 지하 %s · 상태 %s" % (SITES[k]["label"], f, t, cu, status(ai, k)))
                if n % 10 == 0:
                    log("10분 흐름 %s" % ai.lua(FLOW))
            except Exception as e:  # noqa: BLE001
                log(f"오류 {type(e).__name__}: {e}"[:300])
            n += 1
            # 기지 끝 옮김만 10 초마다 (전환 직후 벨트에 남은 광석 수천 개를 빨리 비운다)
            t_end = time.time() + a.every
            while time.time() < t_end - 10:
                time.sleep(10)
                try:
                    st = load()
                    for k in SITES:
                        if st.get(k, {}).get("switched") and not st.get(k, {}).get("tail_off"):
                            tail(ai, k)
                        elif st.get(k, {}).get("tail_off") and k == "fe":
                            fe_filter(ai)
                except Exception:  # noqa: BLE001
                    pass
            time.sleep(max(0, t_end - time.time()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

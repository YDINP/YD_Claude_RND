"""run23 기지 개편 - docs/rebuild-plan-run23.md §5 «끊지 않는 이행 순서» 를 단계별로.

담당: Phase 0 (0-1 0-2 0-3 0-5 0-7 0-9 0-11) · Phase 2 (2-1..2-7) · Phase 3 (3-1..3-4) · 4-1 · 4-2.
0-4 · 0-6 · 0-10 · Phase 1 은 yellow23 담당 - 여기서 건드리지 않는다.
사람은 delta (detached owner=rebuild23) 와 로봇 유령. 로그는 state/rebuild23.log.

    python scripts/rebuild23.py metrics            # 철판 · 강철 · 구리 · 군사팩 · 탄창 /분
    python scripts/rebuild23.py <stage> [--go]     # 단계 조회 / --go 로 실행
"""
import argparse
import json
import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
from orders import submit  # noqa: E402

OWNER = "rebuild23"
WHO = "delta"
LOG = os.path.join(HERE, "..", "state", "rebuild23.log")
N, E, S, W = 0, 4, 8, 12


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def walk(x, y):
    return ("walk_to", {"x": x, "y": y})


def b(name, x, y, d=None, **kw):
    p = {"name": name, "x": x, "y": y}
    if d is not None:
        p["direction"] = d
    p.update(kw)
    return ("build", p)


def take(item, x, y, n):
    return ("take", {"name": item, "x": x, "y": y, "count": n})


def put(item, x, y, n):
    return ("insert", {"name": item, "x": x, "y": y, "count": n})


def dig(x, y, name=None):
    p = {"x": x, "y": y, "search_radius": 0.6}
    if name:
        p["name"] = name
    return ("demolish", p)


def craft(recipe, n):
    return ("craft", {"recipe": recipe, "count": n})


# ------------------------------------------------------------------ 수치

METRIC_ITEMS = ("iron-plate", "steel-plate", "copper-plate", "military-science-pack",
                "firearm-magazine", "piercing-rounds-magazine", "stone", "stone-wall",
                "iron-ore", "copper-ore", "utility-science-pack")


def metrics(ai):
    names = ",".join("'%s'" % n for n in METRIC_ITEMS)
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local P, o = f.get_item_production_statistics(s), {tick = game.tick}
      for _, n in pairs({%s}) do
        local a = P.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true}
        local c = P.get_flow_count{name = n, category = 'output', precision_index = defines.flow_precision_index.ten_minutes, count = true}
        o[n] = string.format("%%.0f/%%.0f", a / 10, c / 10)
      end
      local r = f.current_research o.research = r and r.name or '-' o.progress = f.research_progress
      return o end)()""" % names)
    return r


def log_metrics(ai, tag):
    m = metrics(ai)
    say("수치[%s] (10분 평균 생산/소비 per 분) %s" % (tag, json.dumps(m, ensure_ascii=False)))
    return m


# ------------------------------------------------------------------ delta

def own():
    detached.mark([WHO], OWNER, minutes=60)


def run_plan(ai, plan, label, timeout=900):
    """delta 에게 계획을 주고 끝날 때까지 기다린다. 실패 단계는 돌려준다."""
    own()
    ids = submit(ai, WHO, plan, strict=False)
    if not ids:
        say("%s: 보내지 못함" % label)
        return False
    ag = ai.agent(WHO)
    t0, bad = time.time(), []
    pending = list(ids)
    while pending and time.time() - t0 < timeout:
        time.sleep(2)
        still = []
        for i in pending:
            st = ag.poll(i)
            s = st.get("status")
            if s in ("done", "unknown"):
                continue
            if s in ("failed", "cancelled"):
                bad.append((st.get("type"), st.get("error")))
                continue
            still.append(i)
        pending = still
    if pending:
        say("%s: 시간 초과 (남은 %d)" % (label, len(pending)))
        ag.cancel()
        return False
    if bad:
        say("%s: 실패 단계 %s" % (label, bad[:6]))
        return False
    return True


def inv(ai, who=WHO):
    return ai.agent(who).items()


def dump(ai, x0, y0, x1, y1, skip=("resource", "item-entity", "tree", "simple-entity", "corpse", "character")):
    """영역 안 엔티티: 이름 · 자리 · 방향 · 레시피 · 필터 · 팔 집/놓 · 내용물."""
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      local skip = {} for _, t in pairs({%s}) do skip[t] = true end
      for _, e in pairs(s.find_entities_filtered{area = {{%f, %f}, {%f, %f}}}) do
        if not skip[e.type] then
          local d = {n = e.name, x = e.position.x, y = e.position.y, d = e.direction}
          if e.type == 'entity-ghost' then d.g = e.ghost_name end
          if e.type == 'assembling-machine' or e.type == 'furnace' then
            local rc = e.get_recipe() or (e.type == 'furnace' and e.previous_recipe)
            d.r = rc and (type(rc.name) == 'string' and rc.name or rc.name.name) or nil
            local k = "?" for nn, v in pairs(defines.entity_status) do if v == e.status then k = nn end end d.st = k
          end
          if e.type == 'inserter' then
            d.pu = {e.pickup_position.x, e.pickup_position.y} d.dr = {e.drop_position.x, e.drop_position.y}
            if e.filter_slot_count > 0 and e.use_filters then local fl = {}
              for i = 1, e.filter_slot_count do local f = e.get_filter(i) if f then fl[#fl+1] = (type(f) == 'table' and (f.name or '?')) or f end end
              d.f = table.concat(fl, '|') d.fm = e.inserter_filter_mode end
            local k = "?" for nn, v in pairs(defines.entity_status) do if v == e.status then k = nn end end d.st = k
          end
          if e.type == 'transport-belt' or e.type == 'underground-belt' or e.type == 'splitter' then
            local l = {} for i = 1, 2 do local c = e.get_transport_line(i).get_contents() local t = {}
              for _, it in pairs(c) do t[#t+1] = it.name .. ':' .. it.count end l[i] = table.concat(t, ',') end
            d.l = l if e.type == 'underground-belt' then d.bt = e.belt_to_ground_type end
          end
          if e.type == 'container' or e.type == 'logistic-container' or e.type == 'assembling-machine' or e.type == 'furnace' or e.type == 'lab' or e.type == 'ammo-turret' or e.type == 'roboport' then
            local t = {}
            for _, idx in pairs({1, 2, 3, 4}) do local ok, iv = pcall(function() return e.get_inventory(idx) end)
              if ok and iv then for _, it in pairs(iv.get_contents()) do t[#t+1] = it.name .. ':' .. it.count end end end
            d.i = table.concat(t, ',')
          end
          if e.type == 'mining-drill' then local k = "?" for nn, v in pairs(defines.entity_status) do if v == e.status then k = nn end end d.st = k
            local t = e.mining_target d.ore = t and t.name or nil d.amt = t and t.amount or nil end
          o[#o+1] = d
        end end
      return o end)()""" % (",".join("'%s'" % t for t in skip), x0, y0, x1, y1))
    return rows(r)


def show(ai, x0, y0, x1, y1):
    for d in sorted(dump(ai, x0, y0, x1, y1), key=lambda d: (d["y"], d["x"])):
        print("  ", json.dumps(d, ensure_ascii=False))


def can_place(ai, items):
    """items: [(name, x, y, dir)] -> [(name, x, y, bool)]"""
    blob = ";".join("%s,%s,%s,%s" % (n, x, y, d or 0) for n, x, y, d in items)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)")
        o[#o+1] = bit .. " " .. tostring(s.can_place_entity{name = n, position = {tonumber(x), tonumber(y)}, direction = tonumber(d), force = 'player'}) end
      return o end)()""" % blob)
    return rows(r)


def ghosts(ai, items):
    """items: [(name, x, y, dir[, ug_type])] -> 로봇 유령. 선 것 · 이미 유령은 건너뛴다."""
    blob = ";".join("%s,%s,%s,%s,%s" % (t[0], t[1], t[2], t[3] or 0, t[4] if len(t) > 4 and t[4] else "-") for t in items)
    r = ai.lua("""(function() local s, f, o = game.surfaces[1], game.forces.player, {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d, t = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        if s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1] then o[#o+1] = bit .. " standing"
        elseif s.find_entities_filtered{ghost_name = n, position = {x, y}, radius = 0.1, force = f}[1] then o[#o+1] = bit .. " ghost"
        elseif s.can_place_entity{name = n, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.manual_ghost} then
          local a = {name = 'entity-ghost', inner_name = n, position = {x, y}, direction = d, force = f}
          if t ~= '-' then a.type = t end
          o[#o+1] = bit .. (s.create_entity(a) and " NEW" or " FAIL")
        else o[#o+1] = bit .. " BLOCKED" end
      end return o end)()""" % blob)
    return rows(r)


def ghost_count(ai, x0, y0, x1, y1):
    return ai.lua("""{n = game.surfaces[1].count_entities_filtered{type = 'entity-ghost', force = 'player', area = {{%f, %f}, {%f, %f}}}}""" % (x0, y0, x1, y1))["n"]


STAGES = {}


def stage(name):
    def deco(fn):
        STAGES[name] = fn
        return fn
    return deco


@stage("metrics")
def st_metrics(ai, go):
    log_metrics(ai, "조회")


@stage("show")
def st_show(ai, go):
    x0, y0, x1, y1 = map(float, os.environ["AREA"].split(","))
    show(ai, x0, y0, x1, y1)


@stage("lua")
def st_lua(ai, go):
    print(json.dumps(ai.lua(open(os.environ["LUA"], encoding="utf-8").read()), ensure_ascii=False))


def wire_gate(ai, ins_xy, belt_xys, item="iron-plate"):
    """팔 ins_xy 를 벨트 칸들 (hold 읽기) 에 빨강 선으로 잇고 «item < 1 일 때만» 켠다. (2.0 에선 회로선이 아이템이 아니다.)"""
    belts = ",".join("{%s,%s}" % xy for xy in belt_xys)
    return ai.lua("""(function() local s = game.surfaces[1]
      local ins = s.find_entities_filtered{type = 'inserter', position = {%s, %s}, radius = 0.1}[1]
      if not ins then return {err = 'no inserter'} end
      local ic = ins.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      local n = 0
      for _, p in pairs({%s}) do
        local bt = s.find_entities_filtered{type = 'transport-belt', position = p, radius = 0.1}[1]
        if bt then
          local cb = bt.get_or_create_control_behavior()
          cb.read_contents = true cb.read_contents_mode = defines.control_behavior.transport_belt.content_read_mode.hold
          if bt.get_wire_connector(defines.wire_connector_id.circuit_red, true).connect_to(ic, false, defines.wire_origin.player) then n = n + 1 end
        end end
      local cb = ins.get_or_create_control_behavior()
      cb.circuit_enable_disable = true
      cb.circuit_condition = {first_signal = {type = 'item', name = '%s'}, comparator = '<', constant = 1}
      return {wired = n, ok = true} end)()""" % (ins_xy[0], ins_xy[1], belts, item))


@stage("0-1")
def st_01(ai, go):
    """탄약 조립기 2대 앞 철판 완충 상자 + 팔 (벨트 입력과 다른 면). 벨트가 비었을 때만 켜지게 빨강 선."""
    P29 = [("iron-chest", -90.5, -67.5, 0), ("inserter", -89.5, -67.5, W)]
    HUB = [("iron-chest", -82.5, -49.5, 0), ("long-handed-inserter", -80.5, -49.5, W)]
    print(can_place(ai, P29 + HUB))
    if not go:
        return
    say("0-1 시작: 탄약 조립기 p29 (-87.5,-67.5) · 허브 (-78.5,-49.5) 철판 완충")
    have = inv(ai)
    plan = [walk(-84.5, -56.5), take("iron-plate", -82.5, -52.5, 1300 - have.get("iron-plate", 0)),
            craft("iron-chest", 2), craft("electronic-circuit", 6), craft("inserter", 2),
            craft("long-handed-inserter", 1),
            walk(-83.5, -48.5)]
    plan += [b(n, x, y, d) for n, x, y, d in HUB] + [put("iron-plate", -82.5, -49.5, 400)]
    plan += [walk(-91.5, -68.5)] + [b(n, x, y, d) for n, x, y, d in P29] + [put("iron-plate", -90.5, -67.5, 800)]
    ok = run_plan(ai, plan, "0-1")
    r1 = wire_gate(ai, (-89.5, -67.5), [(-87.5, -64.5)])
    r2 = wire_gate(ai, (-80.5, -49.5), [(-79.5, -53.5), (-78.5, -53.5)])
    show(ai, -91, -68, -89, -67)
    show(ai, -83, -50, -80, -49)
    say("0-1 %s: 선 p29 %s · 허브 %s" % ("완료" if ok else "부분", r1, r2))


@stage("0-2")
def st_02(ai, go):
    """남쪽 망 17 창고 (4.5,32.5) 에 새 탄. 망 2 상자 (-88.5,-41.5) 에서는 빼지 않는다 (오히려 50 보탬 - 18 뿐)."""
    have = inv(ai)
    print(have)
    if not go:
        return
    say("0-2 시작: 허브 철로 탄창 손제작 → 남쪽 망 17 창고 (4.5,32.5)")
    need = 300 - have.get("firearm-magazine", 0)
    iron = max(0, need * 4 - have.get("iron-plate", 0))
    plan = [walk(-85.5, -56.5), take("iron-plate", -83.5, -52.5, iron), craft("firearm-magazine", need),
            walk(-86.5, -39.5), put("firearm-magazine", -88.5, -41.5, 50),
            walk(6.5, 30.5), put("firearm-magazine", 4.5, 32.5, 250)]
    if have.get("piercing-rounds-magazine", 0):
        plan.append(put("piercing-rounds-magazine", 4.5, 32.5, have["piercing-rounds-magazine"]))
    ok = run_plan(ai, plan, "0-2", timeout=1200)
    show(ai, 4, 32, 5, 33)
    show(ai, -89, -42, -88, -41)
    say("0-2 %s" % ("완료: 남쪽 창고 (4.5,32.5) 탄창 250 + 관통 %d, 망 2 창고에 탄창 +50" % have.get("piercing-rounds-magazine", 0) if ok else "부분"))


@stage("0-3")
def st_03(ai, go):
    """북쪽 벽 구멍 y=-112.5/-111.5, x -58.5..-38.5 - 망 2 돌벽으로 로봇 유령."""
    items = [("stone-wall", x + 0.5, y, 0) for x in range(-59, -38) for y in (-112.5, -111.5)]
    if not go:
        print(can_place(ai, items[:4]), len(items))
        return
    say("0-3 시작: 북쪽 벽 유령 %d" % len(items))
    res = ghosts(ai, items)
    say("0-3 유령: %s" % {k: sum(1 for r in res if r.endswith(k)) for k in ("NEW", "ghost", "standing", "BLOCKED", "FAIL")})
    t0 = time.time()
    while time.time() - t0 < 900:
        left = ghost_count(ai, -60, -114, -37, -110)
        if not left:
            break
        time.sleep(15)
    say("0-3 %s: 남은 유령 %d" % ("완료" if not left else "진행 중", left))


def gate_off(ai, spots, on=False):
    """팔을 «물류망 조건» 으로 끈다 (필터 · 팔 그대로 - 되돌리기 쉬움). on=True 면 조건을 떼어 다시 켠다."""
    blob = ";".join("%s,%s" % xy for xy in spots)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local e = s.find_entities_filtered{type = 'inserter', position = {tonumber(x), tonumber(y)}, radius = 0.1}[1]
        if not e then o[#o+1] = bit .. " none" else
          local cb = e.get_or_create_control_behavior()
          if %s then cb.connect_to_logistic_network = false
          else cb.connect_to_logistic_network = true
            cb.logistic_condition = {first_signal = {type = 'item', name = 'iron-plate'}, comparator = '>', constant = 2000000000} end
          local k = "?" for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end
          o[#o+1] = bit .. " " .. e.name .. " " .. k .. (e.logistic_network and "" or " NO-NET") end end
      return o end)()""" % (blob, "true" if on else "false"))
    return rows(r)


PURPLE_INS = [(-93.5, -84.5), (-92.5, -84.5), (-94.5, -80.5), (-93.5, -80.5),   # 전기로 조립기 투입 (강철 · 벽돌 · 벽돌상자 · 고급회로)
              (-91.5, -82.5), (-87.5, -82.5), (-89.5, -80.5),                  # 보라 조립기 투입 (전기로 · 레일 · 모듈)
              (-85.5, -84.5), (-84.5, -84.5), (-83.5, -82.5), (-85.5, -80.5),  # 레일 조립기 투입 (강철 · 돌 · 막대 · 상자)
              (-81.5, -84.5), (-81.5, -80.5)]                                  # 막대 조립기 투입 (철 · 철상자)


@stage("0-5")
def st_05(ai, go):
    """보라 사슬 정지 (G2 b): 보라 · 전기로 · 레일 · 막대 조립기 투입 팔을 물류망 조건으로 끈다 (필터 보존)."""
    if not go:
        show(ai, -95, -86, -80, -78)
        return
    say("0-5 시작: 보라 사슬 투입 팔 %d 개 물류망 조건 정지" % len(PURPLE_INS))
    res = gate_off(ai, PURPLE_INS)
    for r in res:
        print("  ", r)
    off = sum(1 for r in res if "disabled" in r)
    say("0-5 완료: 정지 %d/%d %s" % (off, len(PURPLE_INS), [r for r in res if "disabled" not in r]))


@stage("0-2w")
def st_02w(ai, go):
    """(조정자 긴급) 망 2 창고 (-88.5,-41.5) 에 탄창 먼저 - 서쪽 공습 뒤 24발 · 관통 0."""
    have = inv(ai)
    print(have)
    if not go:
        return
    say("0-2w 시작: 망 2 창고 (-88.5,-41.5) 탄창 손제작 투입 (조정자 긴급)")
    plan = [walk(-85.5, -56.5), take("iron-plate", -83.5, -52.5, 900), craft("firearm-magazine", 225),
            walk(-86.5, -39.5), put("piercing-rounds-magazine", -88.5, -41.5, have.get("piercing-rounds-magazine", 0) or 1),
            put("firearm-magazine", -88.5, -41.5, 100), put("firearm-magazine", -88.5, -41.5, 100),
            put("firearm-magazine", -88.5, -41.5, 100),
            walk(-80.5, -76.5), take("iron-plate", -81.5, -78.5, 1000), craft("firearm-magazine", 250),
            walk(-86.5, -39.5), put("firearm-magazine", -88.5, -41.5, 100), put("firearm-magazine", -88.5, -41.5, 100)]
    ok = run_plan(ai, plan, "0-2w", timeout=1500)
    show(ai, -89, -42, -88, -41)
    say("0-2w %s: 망 2 창고 탄창 +500 · 관통 +%d" % ("완료" if ok else "부분", have.get("piercing-rounds-magazine", 0)))


# ------------------------------------------------------------------ 서벽 (조정자 지시: 방어벽을 서쪽으로, 철광 채굴)
# 광석 x -127..-114, y -28..-7 (방어선 서쪽 띠 12만). 옛 벽 x -120.5/-119.5 · 옛 포탑 x=-116 이 그 위에 있다.
# 새 포탑 x=-128 (광석 x ≥ -127 밖) · 새 벽 x -131.5/-130.5 (y -33.5..-3.5) · 연결 벽 y -33.5/-32.5 · -4.5/-3.5 (x -129.5..-121.5 → 옛 벽 x -120.5 에 붙음).
W_TURRETS = [(-128, y) for y in (-30, -26, -22, -18, -14, -10, -6)]
W_WALLS = ([(x, y + 0.5) for x in (-131.5, -130.5) for y in range(-34, -3)]
           + [(x + 0.5, y) for x in range(-130, -121) for y in (-33.5, -32.5, -4.5, -3.5)])
OLD_TURRETS = [(-116, y) for y in (-28, -25, -22, -16, -10, -7)]
OLD_WALL = [(x, y + 0.5) for x in (-120.5, -119.5) for y in range(-30, -7)]


def turret_ammo(ai, spots):
    blob = ";".join("%s,%s" % xy for xy in spots)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local t = s.find_entities_filtered{name = 'gun-turret', position = {tonumber(x), tonumber(y)}, radius = 0.6}[1]
        local g = s.find_entities_filtered{ghost_name = 'gun-turret', position = {tonumber(x), tonumber(y)}, radius = 0.6}[1]
        if t then o[#o+1] = bit .. " ammo=" .. t.get_inventory(defines.inventory.turret_ammo).get_item_count()
          .. (s.find_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.6}[1] and " req" or "")
        else o[#o+1] = bit .. (g and " ghost" or " none") end end
      return o end)()""" % blob)
    return rows(r)


def request_ammo(ai, spots, n=20, item="firearm-magazine"):
    """포탑에 로봇 탄 배달 요청 (탄 n 미만이고 요청 없을 때)."""
    blob = ";".join("%s,%s" % xy for xy in spots)
    return ai.lua("""(function() local s, k = game.surfaces[1], 0
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local t = s.find_entities_filtered{name = 'gun-turret', position = {tonumber(x), tonumber(y)}, radius = 0.6}[1]
        if t and t.get_inventory(defines.inventory.turret_ammo).get_item_count() < %d
           and not s.find_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.6}[1] then
          local ok = pcall(function() s.create_entity{name = 'item-request-proxy', position = t.position, force = 'player', target = t,
            modules = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}}} end)
          if ok then k = k + 1 end end end
      return {req = k} end)()""" % (blob, n, item, n))


@stage("w1")
def st_w1(ai, go):
    """서벽 1: 새 포탑 7 · 새 벽 · 연결 벽 유령 (더하기만 - 옛 것은 그대로)."""
    items = [("gun-turret", x, y, 0) for x, y in W_TURRETS] + [("stone-wall", x, y, 0) for x, y in W_WALLS]
    if not go:
        res = can_place(ai, items)
        print([r for r in res if r.endswith("false")], len(items))
        return
    say("서벽 w1 시작: 새 포탑 %d (x=-128) · 새 벽 %d 유령" % (len(W_TURRETS), len(W_WALLS)))
    res = ghosts(ai, items)
    say("서벽 w1 유령: %s %s" % ({k: sum(1 for r in res if r.endswith(k)) for k in ("NEW", "ghost", "standing", "BLOCKED", "FAIL")},
                                [r for r in res if "BLOCKED" in r or "FAIL" in r][:8]))


@stage("w1ammo")
def st_w1ammo(ai, go):
    print(turret_ammo(ai, W_TURRETS))
    if go:
        say("서벽 새 포탑 탄 요청: %s" % request_ammo(ai, W_TURRETS, 20))


@stage("w1walls")
def st_w1walls(ai, go):
    """delta: 벽돌 → 돌벽 손제작 → 망 2 창고. 벽돌은 보라 정지로 놀게 된 (-94.5,-78.5) · 허브 · (-49.5,0.5)."""
    if not go:
        return
    say("서벽 w1walls 시작: 벽돌로 돌벽 손제작 → 망 2 창고 (-88.5,-41.5)")
    plan = [walk(-96.5, -77.5), take("stone-brick", -94.5, -78.5, 135),
            walk(-78.5, -56.5), take("stone-brick", -77.5, -52.5, 60), take("stone-brick", -76.5, -52.5, 45),
            craft("stone-wall", 48),
            walk(-86.5, -39.5), put("firearm-magazine", -88.5, -41.5, 150), put("stone-wall", -88.5, -41.5, 48),
            walk(-47.5, 2.5), take("stone-brick", -49.5, 0.5, 130), craft("stone-wall", 26),
            walk(-86.5, -39.5), put("firearm-magazine", -88.5, -41.5, 100), put("stone-wall", -88.5, -41.5, 26)]
    ok = run_plan(ai, plan, "w1walls", timeout=1200)
    say("서벽 w1walls %s: 돌벽 +74" % ("완료" if ok else "부분"))


def threat_west(ai):
    """서쪽 (x < -100, y -80..60) 우리 포탑 50칸 안 적 유닛 수 · 대형 수."""
    return ai.lua("""(function() local s, n, big = game.surfaces[1], 0, 0
      for _, e in pairs(s.find_entities_filtered{force = 'enemy', type = 'unit', area = {{-190, -80}, {-100, 60}}}) do
        n = n + 1 if string.find(e.name, 'big') or string.find(e.name, 'behemoth') then big = big + 1 end end
      local near = 0
      for _, e in pairs(s.find_entities_filtered{force = 'enemy', type = 'unit', area = {{-160, -60}, {-100, 30}}}) do near = near + 1 end
      local net = s.find_logistic_network_by_position({-88.5, -41.5}, 'player')
      return {units = n, big = big, near = near, mags = net and net.get_item_count('firearm-magazine') or -1,
              pierce = net and net.get_item_count('piercing-rounds-magazine') or -1} end)()""")


@stage("threat")
def st_threat(ai, go):
    print(threat_west(ai))


def decon(ai, spots):
    """spots: [(이름, x, y)] 해체 표시. 포탑이면 그 포탑에 넣는 팔도."""
    blob = ";".join("%s,%s,%s" % t for t in spots)
    return ai.lua("""(function() local s, f, n, o = game.surfaces[1], game.forces.player, 0, {}
      for bit in string.gmatch("%s", "[^;]+") do local nm, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local e = s.find_entities_filtered{name = nm, position = {tonumber(x), tonumber(y)}, radius = 0.6, force = f}[1]
        if e and not e.to_be_deconstructed() then e.order_deconstruction(f) n = n + 1
          if nm == 'gun-turret' then
            for _, i in pairs(s.find_entities_filtered{type = 'inserter', area = {{e.position.x - 3, e.position.y - 3}, {e.position.x + 3, e.position.y + 3}}, force = f}) do
              if i.drop_target == e then i.order_deconstruction(f) n = n + 1 o[#o+1] = string.format('ins(%%.1f,%%.1f)', i.position.x, i.position.y) end end
          end
        elseif not e then o[#o+1] = 'none:' .. bit end end
      return {n = n, extra = o} end)()""" % blob)


def decon_left(ai, x0, y0, x1, y1):
    return ai.lua("""{n = game.surfaces[1].count_entities_filtered{to_be_deconstructed = true, force = 'player', area = {{%f, %f}, {%f, %f}}}}""" % (x0, y0, x1, y1))["n"]


def w_ready(ai):
    """해체 조건: 새 포탑 7 모두 탄 ≥ 10 · 서쪽 가까이 적 0 · 망 탄창 ≥ 300."""
    am = turret_ammo(ai, W_TURRETS)
    low = [a for a in am if "ammo=" not in a or int(a.split("ammo=")[1].split()[0]) < 10]
    th = threat_west(ai)
    return (not low and th["near"] == 0 and th["mags"] >= 300), {"low": low, "threat": th}


W_GROUPS = {
    "a": {"turrets": [(-116, -28), (-116, -25), (-116, -22)], "wall_y": (-29.5, -19.5)},
    "b": {"turrets": [(-116, -16), (-116, -10), (-116, -7)], "wall_y": (-18.5, -7.5)},
}
# 새 채굴: 모음 벨트 x=-119.5 북향 (y -8.5 → -28.5) → (-119.5,-29.5) 동향 → 지하로 탄 벨트 x=-113.5 건넘 → (-109.5,-29.5) 남향 광석 줄 옆치기
W_BUILD = {
    "a": ([("electric-mining-drill", -121.5, y, E) for y in (-26.5, -23.5, -20.5)]
          + [("electric-mining-drill", -117.5, y, W) for y in (-27.5, -24.5, -21.5)]
          + [("transport-belt", -119.5, y + 0.5, N) for y in range(-29, -19)]
          + [("transport-belt", x + 0.5, -29.5, E) for x in range(-120, -115)]
          + [("underground-belt", -114.5, -29.5, E, "input"), ("underground-belt", -112.5, -29.5, E, "output"),
             ("transport-belt", -111.5, -29.5, E), ("transport-belt", -110.5, -29.5, E)]
          + [("small-electric-pole", -120.5, -29.5, 0), ("small-electric-pole", -123.5, -24.5, 0), ("small-electric-pole", -123.5, -18.5, 0)]),
    "b": ([("electric-mining-drill", -121.5, y, E) for y in (-17.5, -14.5, -11.5, -8.5)]
          + [("electric-mining-drill", -117.5, y, W) for y in (-15.5, -9.5)]
          + [("transport-belt", -119.5, y + 0.5, N) for y in range(-19, -8)]
          + [("small-electric-pole", -123.5, -12.5, 0), ("small-electric-pole", -123.5, -6.5, 0)]),
}


def _wg(g):
    y0, y1 = W_GROUPS[g]["wall_y"]
    walls = [(x, y) for x, y in OLD_WALL if y0 <= y <= y1]
    return walls


@stage("w2")
def st_w2(ai, go):
    """서벽 2: 옛 포탑 · 급탄 팔 · 옛 벽 해체 (구간 a 북 / b 남). 조건 안 맞으면 보류. GRP=a|b"""
    g = os.environ.get("GRP", "a")
    ok, why = w_ready(ai)
    print(ok, why)
    if not go:
        return
    if not ok and not os.environ.get("FORCE"):
        say("서벽 w2%s 보류: %s" % (g, json.dumps(why, ensure_ascii=False)))
        return
    grp = W_GROUPS[g]
    spots = [("gun-turret", x, y) for x, y in grp["turrets"]] + [("stone-wall", x, y) for x, y in _wg(g)]
    say("서벽 w2%s 해체 시작: 옛 포탑 %d · 옛 벽 %d (조건 %s)" % (g, len(grp["turrets"]), len(_wg(g)), json.dumps(why, ensure_ascii=False)))
    r = decon(ai, spots)
    say("서벽 w2%s 해체 표시: %s" % (g, r))
    t0 = time.time()
    y0, y1 = grp["wall_y"]
    while time.time() - t0 < 900:
        left = decon_left(ai, -122, y0 - 3, -113.9, y1 + 3)
        if not left:
            break
        time.sleep(10)
    say("서벽 w2%s %s: 해체 남음 %d" % (g, "완료" if not left else "진행 중", left))


@stage("w3")
def st_w3(ai, go):
    """서벽 3: 비운 광석 칸에 채굴기 · 모음 벨트 · 전봇대 유령. GRP=a|b"""
    g = os.environ.get("GRP", "a")
    items = W_BUILD[g]
    if not go:
        res = can_place(ai, [t[:4] for t in items])
        print([r for r in res if r.endswith("false")], len(items))
        return
    say("서벽 w3%s 시작: 채굴기 %d · 벨트/전봇대 유령" % (g, sum(1 for t in items if t[0] == "electric-mining-drill")))
    res = ghosts(ai, items)
    say("서벽 w3%s 유령: %s %s" % (g, {k: sum(1 for r in res if r.endswith(k)) for k in ("NEW", "ghost", "standing", "BLOCKED", "FAIL")},
                                  [r for r in res if "BLOCKED" in r or "FAIL" in r][:8]))


def net_gate(ai, xy, item, below):
    """팔을 물류망 조건 «망의 item < below 일 때만» 으로."""
    return ai.lua("""(function() local s = game.surfaces[1]
      local e = s.find_entities_filtered{type = 'inserter', position = {%s, %s}, radius = 0.1}[1]
      if not e then return {err = 'none'} end
      local cb = e.get_or_create_control_behavior()
      cb.connect_to_logistic_network = true
      cb.logistic_condition = {first_signal = {type = 'item', name = '%s'}, comparator = '<', constant = %d}
      return {ok = true, net = e.logistic_network and e.logistic_network.network_id or -1} end)()""" % (xy[0], xy[1], item, below))


@stage("ammo-auto")
def st_ammo_auto(ai, go):
    """(조정자 긴급) p29 탄창 조립기 (-87.5,-67.5) 동쪽에 둘째 출력 팔 → 저장 상자 (망 2). 벨트 급탄은 그대로, 남는 몫만.
    팔은 «망 탄창 < 400» 일 때만 켜진다 (철을 상자에 무한정 쌓지 않게)."""
    items = [("storage-chest", -84.5, -68.5, 0), ("inserter", -85.5, -68.5, W)]
    if not go:
        print(can_place(ai, items))
        return
    say("탄 자동 공급 시작: p29 (-87.5,-67.5) 둘째 출력 팔 (-85.5,-68.5) → 저장 상자 (-84.5,-68.5), 망 탄창 < 400 조건")
    say("  유령: %s" % ghosts(ai, items))
    t0 = time.time()
    while time.time() - t0 < 300 and ghost_count(ai, -86, -69, -84, -68):
        time.sleep(5)
    say("  조건: %s" % net_gate(ai, (-85.5, -68.5), "firearm-magazine", 400))
    time.sleep(20)
    show(ai, -89, -69, -84, -66)
    say("탄 자동 공급 %s" % ("완료" if not ghost_count(ai, -86, -69, -84, -68) else "유령 남음"))


@stage("0-7")
def st_07(ai, go):
    """연구소 (-79.5,34.5) 에 군사·화학 짧은 팔 (-81.5,34.5) 서→동 (x=-82.5 벨트에서), 전봇대 (-81.5,35.5) (34~36 전력 빈칸).
    가는 길에 탄창 넣기 · 돌벽 8 더 (서벽 유령 몫)."""
    items = [("inserter", -81.5, 34.5, W), ("small-electric-pole", -81.5, 35.5, 0)]
    print(can_place(ai, items))
    if not go:
        return
    have = inv(ai)
    say("0-7 시작 (+ 탄창 %d · 돌벽 8 서벽용)" % have.get("firearm-magazine", 0))
    plan = []
    if have.get("firearm-magazine"):
        plan += [walk(-86.5, -39.5), put("firearm-magazine", -88.5, -41.5, have["firearm-magazine"])]
    plan += [walk(-47.5, 2.5), take("stone-brick", -49.5, 0.5, 40), craft("stone-wall", 8),
             walk(-86.5, -39.5), put("stone-wall", -88.5, -41.5, 8),
             walk(-84.5, 36.5)] + [b(n, x, y, d) for n, x, y, d in items]
    ok = run_plan(ai, plan, "0-7", timeout=900)
    time.sleep(3)
    show(ai, -82, 34, -81, 36)
    say("0-7 %s" % ("완료: 연구소 (-79.5,34.5) 짧은 팔 (-81.5,34.5) + 전봇대 (-81.5,35.5)" if ok else "부분"))


# 2-1: 빈 철 자리 (계획서 5곳 중 (-116.5,-7.5) 은 서벽 설계 (x=-117.5 채굴기) 와 겹쳐 뺌) → y=-10.5 동향 광석 줄
P21 = ([("electric-mining-drill", -111.5, -8.5, N), ("electric-mining-drill", -89.5, -8.5, N),
        ("electric-mining-drill", -96.5, -3.5, N), ("electric-mining-drill", -99.5, -3.5, N)]
       + [("transport-belt", x, y + 0.5, N) for x in (-96.5, -99.5) for y in range(-10, -5)])


@stage("2-1")
def st_21(ai, go):
    """빈 철 자리 4곳 채굴기 (로봇 유령, 망 2 창고 채굴기)."""
    res = can_place(ai, [t[:4] for t in P21])
    print([r for r in res if r.endswith("false")])
    if not go:
        return
    say("2-1 시작: 철 채굴기 4 (-111.5,-8.5) (-89.5,-8.5) (-96.5,-3.5) (-99.5,-3.5) + 벨트 10 → y=-10.5 줄")
    say("2-1 유령: %s" % ghosts(ai, P21))
    t0 = time.time()
    while time.time() - t0 < 600 and ghost_count(ai, -113, -11, -87, -1):
        time.sleep(10)
    time.sleep(5)
    st = [(d["x"], d["y"], d.get("st"), d.get("amt")) for d in dump(ai, -113, -11, -87, -1) if d["n"] == "electric-mining-drill"]
    say("2-1 %s: %s" % ("완료" if not ghost_count(ai, -113, -11, -87, -1) else "유령 남음", st))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage")
    ap.add_argument("--go", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    for s in a.stage.split(","):
        STAGES[s](ai, a.go)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

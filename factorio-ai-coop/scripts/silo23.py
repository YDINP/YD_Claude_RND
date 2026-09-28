"""P8 사일로 조립 · 설치 · 입력 (docs/rocket-plan-run23.md P8, 09-28 23:1x).

실측 (tick 22.07M): rocket-silo 30 s (crafting - 조립기1/2 됨) = 강철 1,000 · 처리장치 200 · 전기엔진 200 · 관 100 · 콘크리트 1,000.
rocket-part 3 s (rocket-building, 사일로 전용) = 처리장치 10 · LDS 10 · 로켓 연료 10, rocket_parts_required 100.
자재 상자 (5.5,19.5) 비축 (rocket23): 강철만 306/1000 모자람.

  steel   강철 모으기 (기존 아이템만): 막힌 강철 돌 화로 3 (-102,-62)(-100,-62)(-100,-57) 출력 + 멈춘 옛 강철 벨트 (x -130..-75, y -80..-50) -> 자재 상자
  craft   전봇대 조립기 (-21.5,-76.5) 를 빌려 rocket-silo 제작 (자재는 상자에서만) -> 망 -> small-electric-pole 로 되돌림
  place   사일로 유령 (12.5,24.5) + 요청 상자 (6.5,24.5) + 빠른 팔 (7.5,24.5) 동향 + 중형 전봇대 (7.5,20.5)(7.5,28.5)
  setup   완공 뒤: 생산 모듈 4 · 자동 발사 끔 · 요청 (처리장치 · LDS · 로켓 연료) · rocket23 상자 비축 끝 표시
  status  부품 · 재료 · 전력 · 10 분 속도
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
from power2_23 import HEAD, lua, to_lua  # noqa: E402

STASH = (5.5, 19.5)
SILO = (12.5, 24.5)
REQ, INS = (6.5, 24.5), (7.5, 24.5)
POLES = [(7.5, 20.5), (7.5, 28.5)]
POLE_INS = (7.5, 25.5)   # 중형 둘 공급 범위가 y 24|25 경계에서 끊겨 팔이 no_power - 소형 1 추가
BORROW = (-21.5, -76.5)
NEED = {"steel-plate": 1000, "processing-unit": 200, "electric-engine-unit": 200, "pipe": 100, "concrete": 1000}
REQUEST = {"processing-unit": 100, "low-density-structure": 100, "rocket-fuel": 100}


def log(m):
    print(time.strftime("%H:%M:%S ") + m, flush=True)


def J(r):
    return json.dumps(r, ensure_ascii=False)


def steel(ai):
    r = lua(ai, """(function() local s = game.surfaces[1] local o = {furn = 0, belt = 0}
      local st = s.find_entities_filtered{name = 'steel-chest', position = $stash, radius = 0.3}[1]
      local need = 1000 - st.get_item_count('steel-plate')
      for _, p in pairs({{-102, -62}, {-100, -62}, {-100, -57}}) do
        local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.6}[1]
        if f and need > 0 then local out = f.get_output_inventory() local k = math.min(need, out.get_item_count('steel-plate'))
          if k > 0 then k = st.insert{name = 'steel-plate', count = k} out.remove{name = 'steel-plate', count = k} need = need - k o.furn = o.furn + k end end
      end
      for _, b in pairs(s.find_entities_filtered{type = {'transport-belt'}, area = {{-130, -80}, {-75, -50}}}) do
        for i = 1, 2 do if need > 0 then local l = b.get_transport_line(i) local c = math.min(need, l.get_item_count('steel-plate'))
          if c > 0 then local rm = l.remove_item{name = 'steel-plate', count = c} if rm > 0 then local p = st.insert{name = 'steel-plate', count = rm} need = need - p o.belt = o.belt + p end end end end
      end
      o.stash = st.get_item_count('steel-plate') o.need = need return o end)()""", stash=to_lua(list(STASH)))
    log("강철 " + J(r))
    return r


CRAFT_SET = """(function() """ + HEAD + """
local a = s.find_entities_filtered{type = 'assembling-machine', position = {$bx, $by}, radius = 0.6}[1]
local st = s.find_entities_filtered{name = 'steel-chest', position = $stash, radius = 0.3}[1]
local NEED = $need
for n, k in pairs(NEED) do if st.get_item_count(n) < k then return {err = 'short ' .. n .. ' ' .. st.get_item_count(n)} end end
local o = {prev = a.get_recipe() and a.get_recipe().name or '', name = a.name}
storage.rocket23_silo_made = true   -- rocket23 가 상자를 다시 채우지 않게
local out = a.get_output_inventory()
for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
local back = a.set_recipe('rocket-silo')
for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
local inv = a.get_inventory(defines.inventory.assembling_machine_input) o.put = {}
for n, k in pairs(NEED) do local p = inv.insert{name = n, count = k} if p > 0 then st.remove_item{name = n, count = p} end o.put[n] = p end
return o end)()"""

CRAFT_TAKE = """(function() """ + HEAD + """
local a = s.find_entities_filtered{type = 'assembling-machine', position = {$bx, $by}, radius = 0.6}[1]
local out = a.get_output_inventory() local o = {n = out.get_item_count('rocket-silo'), progress = a.crafting_progress, status = a.status}
if o.n > 0 then local k = store('rocket-silo', o.n) if k > 0 then out.remove{name = 'rocket-silo', count = k} end o.stored = k end
o.net = net.get_item_count('rocket-silo')
return o end)()"""

CRAFT_BACK = """(function() """ + HEAD + """
local a = s.find_entities_filtered{type = 'assembling-machine', position = {$bx, $by}, radius = 0.6}[1]
local st = s.find_entities_filtered{name = 'steel-chest', position = $stash, radius = 0.3}[1]
local inv = a.get_inventory(defines.inventory.assembling_machine_input) local o = {left = {}}
for _, it in pairs(inv.get_contents()) do local p = st.insert{name = it.name, count = it.count} if p > 0 then inv.remove{name = it.name, count = p} o.left[it.name] = p end end
local back = a.set_recipe('small-electric-pole')
for _, it in pairs(back or {}) do if it.count and it.count > 0 then st.insert{name = it.name, count = it.count} end end
o.recipe = a.get_recipe() and a.get_recipe().name return o end)()"""


def craft(ai):
    kw = dict(bx=str(BORROW[0]), by=str(BORROW[1]), stash=to_lua(list(STASH)))
    need = "{" + ", ".join("['%s'] = %d" % kv for kv in NEED.items()) + "}"
    r = lua(ai, CRAFT_SET, need=need, **kw)
    log("사일로 제작 시작 " + J(r))
    if r.get("err"):
        return
    try:
        for _ in range(60):
            time.sleep(5)
            t = lua(ai, CRAFT_TAKE, **kw)
            if t.get("net", 0) >= 1:
                log("사일로 제작 끝 " + J(t))
                break
        else:
            log("사일로 제작 시간 초과 " + J(t))
    finally:
        log("되돌림 " + J(lua(ai, CRAFT_BACK, **kw)))


def place(ai):
    ents = [("rocket-silo", SILO, 0), ("requester-chest", REQ, 0), ("fast-inserter", INS, 12)] + [("medium-electric-pole", p, 0) for p in POLES] + [("small-electric-pole", POLE_INS, 0)]
    ts = "{" + ", ".join("{'%s', %s, %s, %d}" % (n, p[0], p[1], d) for n, p, d in ents) + "}"
    r = lua(ai, """(function() local s = game.surfaces[1] local o = {made = {}, skip = {}}
      for _, t in pairs($ts) do
        local have = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
        if have then o.skip[#o.skip + 1] = t[1]
        elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual_ghost} then
          local g = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', expires = false}
          o.made[#o.made + 1] = t[1] .. (g and '' or ' FAIL')
        else o.skip[#o.skip + 1] = 'CANT ' .. t[1] end
      end return o end)()""", ts=ts)
    log("유령 " + J(r))


def setup(ai):
    reqs = to_lua([[k, v] for k, v in REQUEST.items()])
    r = lua(ai, """(function() """ + HEAD + """ local o = {}
      local silo = s.find_entities_filtered{name = 'rocket-silo', position = $silo, radius = 1}[1]
      if not silo then return {err = 'no silo'} end
      local mi = silo.get_module_inventory() local free = #mi - mi.get_item_count()
      if free > 0 then local got = take('productivity-module', free) if got > 0 then mi.insert{name = 'productivity-module', count = got} end end
      o.mod = mi.get_item_count()
      pcall(function() silo.send_to_orbit_automatically = false end)
      local ok, v = pcall(function() return silo.send_to_orbit_automatically end) o.auto = ok and v or ('?' .. tostring(v))
      o.recipe = silo.get_recipe() and silo.get_recipe().name
      local rq = s.find_entities_filtered{name = 'requester-chest', position = $req, radius = 0.3}[1]
      if rq then local lp = rq.get_requester_point() local sec = lp.get_section(1) or lp.add_section()
        for i, w in pairs($wants) do sec.set_slot(i, {value = {name = w[1], quality = 'normal'}, min = w[2]}) end o.req = sec.filters_count end
      local ins = s.find_entities_filtered{name = 'fast-inserter', position = $ins, radius = 0.3}[1] o.ins = ins and ins.drop_target and ins.drop_target.name
      storage.rocket23_silo_made = true
      local st = s.find_entities_filtered{name = 'steel-chest', position = $stash, radius = 0.3}[1] o.stash_left = st and st.get_inventory(defines.inventory.chest).get_contents()
      return o end)()""", silo=to_lua(list(SILO)), req=to_lua(list(REQ)), ins=to_lua(list(INS)), stash=to_lua(list(STASH)), wants=reqs)
    log("설정 " + J(r))


def status(ai):
    r = lua(ai, """(function() """ + HEAD + """ local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end local o = {tick = game.tick}
      local silo = s.find_entities_filtered{name = 'rocket-silo', position = $silo, radius = 1}[1]
      o.ghost = s.count_entities_filtered{ghost_name = 'rocket-silo'}
      if silo then o.parts = silo.rocket_parts o.status = names[silo.status] o.active = silo.active o.silo_status = silo.rocket_silo_status
        o.inv = silo.get_inventory(defines.inventory.assembling_machine_input).get_contents() o.mod = silo.get_module_inventory().get_item_count()
        o.power = math.floor((silo.energy or 0)) local ok, v = pcall(function() return silo.send_to_orbit_automatically end) o.auto = ok and v or '?' end
      local rq = s.find_entities_filtered{name = 'requester-chest', position = $req, radius = 0.3}[1] o.req = rq and rq.get_inventory(defines.inventory.chest).get_contents()
      o.net = {pu = net.get_item_count('processing-unit'), lds = net.get_item_count('low-density-structure'), rf = net.get_item_count('rocket-fuel')}
      local is = game.forces.player.get_item_production_statistics(s) local p = defines.flow_precision_index.ten_minutes
      o.p10 = {} for _, n in pairs({'processing-unit', 'low-density-structure', 'rocket-fuel', 'rocket-part', 'copper-plate'}) do
        o.p10[n] = math.floor(is.get_flow_count{name = n, category = 'input', precision_index = p, count = true}) .. '/' .. math.floor(is.get_flow_count{name = n, category = 'output', precision_index = p, count = true}) end
      o.rockets = game.forces.player.rockets_launched
      return o end)()""", silo=to_lua(list(SILO)), req=to_lua(list(REQ)))
    log("상태 " + J(r))
    return r


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    ai = AIBridge()
    {"steel": steel, "craft": craft, "place": place, "setup": setup, "status": status}[cmd](ai)


if __name__ == "__main__":
    main()

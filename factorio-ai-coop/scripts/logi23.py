"""L1 물류 로봇화 (23회차, 사용자: "물류네트워크의 상자들을 용도에 맞게 설치 · 건설도 로봇이 상자 재료로").

docs/run23-site.md «물류 로봇화 계획» L1:
  - 로보포트 2 대로 허브 · 보라 줄 · 제련 구역을 북동 망 (-24,-88) 에 잇는다.
      A (-31,-56): 물류 x -56..-6 · y -81..-31  ← (-24,-88) 물류 x -49..1 · y -113..-63 과 겹친다
      B (-75,-48): 물류 x -100..-50 · y -73..-23 ← A 와 겹치고, 서쪽 홀로 선 포트 (-111,-41) 와도 겹친다
      건설 반경 55 → B 가 허브 · 보라 줄 · 제련 구역 전부를 덮는다.
  - 로보포트 조립기 (34.5,-38.5) 는 고급 회로 90 을 이미 들고 강철 · 톱니가 없어 섰다 → 입력 상자에 90 씩.
  - 허브 쇠 상자 → 공급 상자 (내용 유지). 허브 옆 저장 상자에 건설 재료.

    python scripts/logi23.py                         # 조사 (망 · 덮는 구역 · 전력 · 재료)
    python scripts/logi23.py --stage feed --who echo  # 로보포트 조립기에 강철 · 톱니
    python scripts/logi23.py --stage ports --who echo # 로보포트 A · B (한 대씩, 전력 확인)
    python scripts/logi23.py --stage store --who echo # 저장 상자 + 건설 재료
    python scripts/logi23.py --stage convert --who echo  # 허브 쇠 상자 → 공급 상자
    python scripts/logi23.py --verify
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge, RconError  # noqa: E402

OWNER = "logi23"
PORT, PP, STORE = "roboport", "passive-provider-chest", "storage-chest"
NEW_PORTS = [(-31, -56), (-75, -48)]            # A 먼저 (북동 망에 붙는 쪽), 그다음 B
RPA_IN, RPA_OUT = (31.5, -38.5), (34.5, -41.5)  # 로보포트 조립기 입력 · 출력 상자
STEEL_FLOOR = 300                               # 강철은 다른 일도 쓴다 - 전체가 이 밑으로 가지 않게
BRICK_BUF = (-94.5, -78.5)                      # 전기로 벽돌 완충 상자 - 벽 재료로 300 까지만
AREAS = {"hub": (-88, -54, -72, -51), "purple": (-95, -88, -78, -76), "smelting": (-110, -90, -60, -40),
         "science": (-85, 10, -40, 45), "west": (-120, -60, -100, -25), "south": (-30, 30, 20, 60)}
HUB_AREA = ((-85.2, -53.2), (-72.8, -51.8))     # 허브 상자 줄 (y -52.5)
STOCK = {"transport-belt": 200, "underground-belt": 20, "inserter": 50, "small-electric-pole": 50,
         "stone-wall": 60, "gun-turret": 4}
p1.SIZE.setdefault(PORT, 4)
LOG = os.environ.get("LOGI_LOG", "")


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    if LOG:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


# ------------------------------------------------------------------ 조사

def networks(ai):
    return _rows(ai.lua("""(function() local out = {}
      for _, p in pairs(game.surfaces[1].find_entities_filtered{name = 'roboport', force = 'player'}) do
        local n = p.logistic_network
        out[#out+1] = string.format('(%.0f,%.0f) 망 %s · 칸 %d · 건설로봇 %d · 물류로봇 %d · 저장 %d · 공급 %d · 충전 %.0fMJ',
          p.position.x, p.position.y, n and n.network_id or '-', n and #n.cells or 0,
          n and n.all_construction_robots or 0, n and n.all_logistic_robots or 0,
          n and #n.storages or 0, n and #n.passive_provider_points or 0, p.energy / 1e6)
      end return out end)()"""))


def coverage(ai):
    """구역마다 격자 (4칸) 중 물류 · 건설 범위 안 비율과 망 번호."""
    out = {}
    for k, (x0, y0, x1, y1) in AREAS.items():
        r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
          local n, lg, cs, ids = 0, 0, 0, {}
          for x = %d, %d, 4 do for y = %d, %d, 4 do n = n + 1
            local l = s.find_logistic_network_by_position({x, y}, f)
            if l then lg = lg + 1 ids[tostring(l.network_id)] = true end
            local c = s.find_logistic_networks_by_construction_area({x, y}, f)
            if c and #c > 0 then cs = cs + 1 for _, q in pairs(c) do ids['c' .. q.network_id] = true end end
          end end
          local t = {} for i, _ in pairs(ids) do t[#t+1] = i end table.sort(t)
          return {n = n, lg = lg, cs = cs, ids = table.concat(t, ' ')} end)()""" % (x0, x1, y0, y1))
        out[k] = r
    return out


def power(ai):
    return ai.lua("""(function() local s = game.surfaces[1]
      local p = s.find_entities_filtered{type = 'electric-pole', position = {-81.5, -51.5}, radius = 2}[1]
      local st = p.electric_network_statistics local o, i = 0, 0
      for n, _ in pairs(st.output_counts) do o = o + st.get_flow_count{name = n, category = 'output', precision_index = defines.flow_precision_index.five_seconds, count = false} end
      for n, _ in pairs(st.input_counts) do i = i + st.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.five_seconds, count = false} end
      local eng = s.count_entities_filtered{name = 'steam-engine'}
      return {prod = math.floor(o * 60 / 1e4) / 100, cons = math.floor(i * 60 / 1e4) / 100, cap = eng * 0.9} end)()""")


def totals(ai, items):
    packed = ",".join(items)
    return ai.lua("""(function() local s, out = game.surfaces[1], {}
      for it in string.gmatch("%s", "[^,]+") do local n = 0
        for _, c in pairs(s.find_entities_filtered{type = {'container', 'logistic-container', 'assembling-machine'}, force = 'player'}) do
          n = n + c.get_item_count(it) end
        out[it] = n end
      return out end)()""" % packed)


def hub_chests(ai):
    """허브 줄 상자 [{name, x, y, items{}}] (쇠 · 나무 · 공급 상자)."""
    (x0, y0), (x1, y1) = HUB_AREA
    r = ai.lua("""(function() local out = {}
      for _, c in pairs(game.surfaces[1].find_entities_filtered{type = {'container', 'logistic-container'}, force = 'player',
                                                              area = {{%f, %f}, {%f, %f}}}) do
        local t = {} for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do t[v.name] = (t[v.name] or 0) + v.count end
        out[#out+1] = {name = c.name, x = c.position.x, y = c.position.y, items = t}
      end return out end)()""" % (x0, y0, x1, y1))
    return [dict(c, items=dict(c.get("items") or {})) for c in _rows(r)]


def stock_at(ai, x, y):
    return ai.lua("""(function() local c = game.surfaces[1].find_entities_filtered{position = {%f, %f}, radius = 0.6,
        type = {'container', 'logistic-container', 'assembling-machine', 'roboport'}}[1]
      if not c then return {} end local t = {}
      for _, inv in pairs({defines.inventory.chest, defines.inventory.assembling_machine_input, defines.inventory.assembling_machine_output}) do
        local q = c.get_inventory(inv) if q then for _, v in pairs(q.get_contents()) do t[v.name] = (t[v.name] or 0) + v.count end end end
      t._status = c.status and tostring(c.status) or nil
      return t end)()""" % (x, y)) or {}


def survey(ai):
    for line in networks(ai):
        say("  포트 " + line)
    for k, r in coverage(ai).items():
        say(f"  {k}: 물류 {r['lg']}/{r['n']} · 건설 {r['cs']}/{r['n']} · 망 {r.get('ids') or '-'}")
    say(f"  전력 {power(ai)}")
    say(f"  로보포트 조립기 {stock_at(ai, 34.5, -38.5)} · 입력 {stock_at(ai, *RPA_IN)} · 출력 {stock_at(ai, *RPA_OUT)}")
    say(f"  총량 {totals(ai, ['roboport', 'steel-plate', 'advanced-circuit', 'iron-gear-wheel', PP, STORE])}")
    for c in hub_chests(ai):
        say(f"  허브 {c['name']} ({c['x']},{c['y']}) {c['items']}")


# ------------------------------------------------------------------ 손

def bag(ai, who):
    try:
        return ai.agent(who).items()
    except RconError:
        return {}


def run(ai, who, plan, limit=1500):
    """계획을 내고 끝까지 기다린다. jevloop 후퇴가 끊으면 한 번 다시 낸다. 실패 목록."""
    for attempt in range(2):
        ids = ai.agent(who).submit_plan(plan)
        t0, idle_n = time.time(), 0
        while time.time() - t0 < limit:
            time.sleep(6)
            st = [ai.poll(t)["status"] for t in ids]
            if all(s in ("done", "failed", "cancelled") for s in st):
                break
            # 손이 비었는데 끝나지 않은 일 (다른 고리가 가로챘거나 큐가 비었다) - 두 번 보면 그만
            w = next((x for x in ai.list() if x["name"] == who), {})
            idle_n = idle_n + 1 if not (w.get("current") or w.get("queued")) else 0
            if idle_n >= 3:
                say(f"  {who}: 손이 비었는데 끝나지 않은 일 {st}")
                break
            if detached.owner(who) not in (None, OWNER):
                say(f"  {who}: {detached.owner(who)} 가 데려갔다 - 멈춤")
                break
        polls = [ai.poll(t) for t in ids]
        bad = [(p.get("type"), p.get("error")) for p in polls if p["status"] != "done"]
        cancelled = [p for p in polls if p["status"] == "cancelled"]
        if not cancelled or attempt:
            return bad
        say(f"  {who}: 계획이 끊겼다 ({len(cancelled)}) - 다시 낸다")
    return bad


def take_from_hub(ai, item, n, keep_total=0):
    """허브에서 item n 개를 집는 걸음 (많이 든 상자부터). keep_total: 허브 전체에 남길 수."""
    chests = sorted(((c["items"].get(item, 0), c["x"], c["y"]) for c in hub_chests(ai)), reverse=True)
    room = sum(k for k, _, _ in chests) - keep_total
    n = min(n, max(0, room))
    plan = []
    for k, x, y in chests:
        if n <= 0 or k <= 0:
            break
        got = min(n, k)
        plan += [("walk_to", {"x": x, "y": y + 2.5}), ("take", {"name": item, "x": x, "y": y, "count": got})]
        n -= got
    return plan


def need_plates(ai, who, want):
    """want {plate: n} 중 가방에 모자란 만큼 허브에서."""
    b = bag(ai, who)
    plan = []
    for m, n in want.items():
        short = n - int(b.get(m, 0))
        if short > 0:
            plan += take_from_hub(ai, m, short)
    return plan


# ------------------------------------------------------------------ 단계

def stage_feed(ai, who):
    """로보포트 조립기 입력 상자에 강철 90 · 톱니 90 (포트 2 대 몫)."""
    steel_all = int(totals(ai, ["steel-plate"])["steel-plate"])
    b = bag(ai, who)
    want_steel = 90
    if steel_all - want_steel < STEEL_FLOOR:
        say(f"  강철 {steel_all} - 바닥 {STEEL_FLOOR} 때문에 못 쓴다")
        return False
    plan = need_plates(ai, who, {"steel-plate": want_steel, "iron-plate": 180 + 10})
    gears = max(0, 90 - int(b.get("iron-gear-wheel", 0)))
    if gears:
        plan.append(("craft", {"recipe": "iron-gear-wheel", "count": gears, "wait": True}))
    plan += [("walk_to", {"x": RPA_IN[0] - 1.5, "y": RPA_IN[1] - 1.5}),
             ("insert", {"name": "steel-plate", "x": RPA_IN[0], "y": RPA_IN[1], "count": want_steel}),
             ("insert", {"name": "iron-gear-wheel", "x": RPA_IN[0], "y": RPA_IN[1], "count": 90})]
    say(f"  feed: {who} {len(plan)}걸음")
    bad = run(ai, who, plan)
    say(f"  feed 실패 {bad} · 입력 {stock_at(ai, *RPA_IN)} · 조립기 {stock_at(ai, 34.5, -38.5)} · 가방 톱니 {bag(ai, who).get('iron-gear-wheel', 0)}")
    return not bad


def port_up(ai, x, y):
    return bool((ai.lua("{v = game.surfaces[1].find_entity('roboport', {%f, %f}) ~= nil}" % (x, y)) or {}).get("v"))


def stage_ports(ai, who):
    todo = [(x, y) for x, y in NEW_PORTS if not port_up(ai, x, y)]
    if not todo:
        say("  ports: 다 섰다")
        return True
    have = int(bag(ai, who).get(PORT, 0))
    if have < len(todo):
        out = stock_at(ai, *RPA_OUT).get(PORT, 0)
        if out:
            bad = run(ai, who, [("walk_to", {"x": RPA_OUT[0] - 1.5, "y": RPA_OUT[1] - 1}),
                                ("take", {"name": PORT, "x": RPA_OUT[0], "y": RPA_OUT[1], "count": min(out, len(todo) - have)})])
            say(f"  ports: 출력 상자에서 {out} 중 집기 - 실패 {bad}")
        have = int(bag(ai, who).get(PORT, 0))
    if not have:
        say(f"  ports: 로보포트 없음 (조립기 {stock_at(ai, 34.5, -38.5)})")
        return False
    for x, y in todo[:have]:
        pw = power(ai)
        if pw and pw["cap"] - pw["cons"] < 6:
            say(f"  ports: 전력 여유 부족 {pw} - ({x},{y}) 미룸")
            return False
        p1.PARK = (x + 4.5, y + 4.5)
        ok = p1.build_stage(ai, [who], [p1.b(PORT, float(x), float(y))], f"port({x},{y})", rounds=4)
        time.sleep(15)
        say(f"  ports: ({x},{y}) {'섰다' if ok else '못 섰다'} · 전력 {power(ai)}")
        if not ok:
            return False
    return len(todo) <= have


def store_site(ai):
    """B 물류 범위 안, 허브 가까운 저장 상자 자리 (이미 있으면 그것)."""
    r = ai.lua("""(function() local s = game.surfaces[1]
      local e = s.find_entities_filtered{name = 'storage-chest', area = {{-92, -60}, {-66, -44}}}[1]
      if e then return {x = e.position.x, y = e.position.y, have = true} end
      for rr = 0, 6 do for dx = -rr, rr do for dy = -rr, rr do
        if math.max(math.abs(dx), math.abs(dy)) == rr then
          local x, y = -70.5 + dx, -50.5 + dy
          if s.can_place_entity{name = 'storage-chest', position = {x, y}, force = 'player'}
             and s.count_entities_filtered{type = {'transport-belt', 'inserter', 'underground-belt'}, area = {{x - 1.5, y - 1.5}, {x + 1.5, y + 1.5}}} == 0
             and s.find_logistic_network_by_position({x, y}, 'player') then
            return {x = x, y = y} end end end end end
      return {} end)()""")
    return r if r and r.get("x") is not None else None


def stage_store(ai, who):
    s = store_site(ai)
    if not s:
        say("  store: 자리 없음 (B 가 아직 없나?)")
        return False
    x, y = float(s["x"]), float(s["y"])
    if not s.get("have"):
        b = bag(ai, who)
        plan = []
        if not b.get(STORE):
            # 한 단계씩, 앞 단계는 제자리에서 기다린다 (비차단 연쇄로 시키면 저장 상자 주문이 강철 상자보다 먼저 검사돼
            # «missing ingredients» - 23회차 실측 두 번)
            if not b.get("steel-chest"):
                plan += need_plates(ai, who, {"steel-plate": 8})
                plan.append(("craft", {"recipe": "steel-chest", "count": 1, "wait": "block"}))
            if int(b.get("electronic-circuit", 0)) < 3:
                plan += need_plates(ai, who, {"iron-plate": 3 + 10, "copper-plate": 5})
                plan += [("craft", {"recipe": "copper-cable", "count": 5, "wait": "block"}),
                         ("craft", {"recipe": "electronic-circuit", "count": 3, "wait": "block"})]
            if not b.get("advanced-circuit"):
                got, steps = adv_plan(ai, 1)
                plan += steps
                if not got:
                    say("  store: 고급 회로 1 (저장 상자 재료) 을 회로 조립기에서 못 찾았다")
            plan.append(("craft", {"recipe": STORE, "count": 1, "wait": "block"}))
        plan += [("walk_to", {"x": x + 2, "y": y + 2}), p1.b(STORE, x, y)]
        say(f"  store: 상자 ({x},{y}) 실패 {run(ai, who, plan)}")
    have = stock_at(ai, x, y)
    want = {k: v - int(have.get(k, 0)) for k, v in STOCK.items() if v - int(have.get(k, 0)) > 0}
    if not want:
        say(f"  store: 다 찼다 {have}")
        return True
    b = bag(ai, who)
    iron = copper = wood = 0
    rem = {k: max(0, n - int(b.get(k, 0))) for k, n in want.items()}   # 가방에 이미 있는 건 안 만든다
    belts = rem.get("transport-belt", 0) + 5 * ((rem.get("underground-belt", 0) + 1) // 2)
    iron += 1.5 * belts + 10 * ((rem.get("underground-belt", 0) + 1) // 2)
    iron += 4 * rem.get("inserter", 0)
    copper += 1.5 * rem.get("inserter", 0) + 0.5 * rem.get("small-electric-pole", 0)
    wood = (rem.get("small-electric-pole", 0) + 1) // 2
    plan = need_plates(ai, who, {"iron-plate": int(iron) + 10, "copper-plate": int(copper) + 10})
    if rem.get("stone-wall"):
        bricks = 5 * rem["stone-wall"] - int(b.get("stone-brick", 0))
        if bricks > 0:
            plan += [("walk_to", {"x": BRICK_BUF[0] + 1.5, "y": BRICK_BUF[1] + 1.5}),
                     ("take", {"name": "stone-brick", "x": BRICK_BUF[0], "y": BRICK_BUF[1], "count": min(300, bricks)})]
    if wood > int(b.get("wood", 0)):
        say(f"  store: 나무 {b.get('wood', 0)}/{wood} - 전봇대 줄인다")
        want["small-electric-pole"] = int(b.get("small-electric-pole", 0)) + 2 * int(b.get("wood", 0))
    turrets = want.pop("gun-turret", 0)
    for item in ("transport-belt", "underground-belt", "inserter", "small-electric-pole", "stone-wall"):
        n = want.get(item, 0) - int(b.get(item, 0))
        if n > 0:
            per = 2 if item in ("transport-belt", "underground-belt", "small-electric-pole") else 1
            plan.append(("craft", {"recipe": item, "count": (n + per - 1) // per, "wait": True}))
    if turrets:
        t = int(b.get("gun-turret", 0))
        if t < turrets:
            plan += need_plates(ai, who, {"iron-plate": 40 * (turrets - t) + int(iron) + 10, "copper-plate": 10 * (turrets - t) + int(copper) + 10})
            plan.append(("craft", {"recipe": "gun-turret", "count": turrets - t, "wait": True}))
        want["gun-turret"] = turrets
    plan.append(("walk_to", {"x": x + 1.5, "y": y + 1.5}))
    for item, n in want.items():
        plan.append(("insert", {"name": item, "x": x, "y": y, "count": n}))
    say(f"  store: 채우기 {want} · {len(plan)}걸음")
    bad = run(ai, who, plan, limit=2400)
    # 만들기가 «timeout» 이어도 계속 만들어진다 - 가방을 한 번 더 비운다
    time.sleep(20)
    b = bag(ai, who)
    left = [("insert", {"name": k, "x": x, "y": y, "count": min(int(b.get(k, 0)), n)})
            for k, n in STOCK.items() if int(b.get(k, 0)) > 0]
    if left:
        run(ai, who, [("walk_to", {"x": x + 1.5, "y": y + 1.5})] + left, limit=300)
    say(f"  store: 실패 {bad} · 상자 {stock_at(ai, x, y)}")
    return not bad


def in_network(ai, x, y):
    return bool((ai.lua("{v = game.surfaces[1].find_logistic_network_by_position({%f, %f}, 'player') ~= nil}" % (x, y)) or {}).get("v"))


def adv_plan(ai, n):
    """고급 회로 n 개를 회로 조립기 출력 칸에서 집는 걸음 (로보포트 조립기 몫은 건드리지 않는다). (얻는 수, 걸음)."""
    src = ai.lua("""(function() local out = {}
      for _, a in pairs(game.surfaces[1].find_entities_filtered{type = 'assembling-machine', force = 'player'}) do
        local r = a.get_recipe()
        if r and r.name == 'advanced-circuit' then local k = a.get_inventory(defines.inventory.assembling_machine_output).get_item_count('advanced-circuit')
          if k > 0 then out[#out+1] = {x = a.position.x, y = a.position.y, n = k} end end end
      return out end)()""")
    got, plan = 0, []
    for q in sorted(_rows(src), key=lambda q: -q["n"]):
        if got >= n:
            break
        g = min(n - got, int(q["n"]))
        plan += [("walk_to", {"x": q["x"], "y": q["y"] + 2.5}),
                 ("take", {"name": "advanced-circuit", "x": q["x"], "y": q["y"], "count": g})]
        got += g
    return got, plan


def stage_convert(ai, who, limit=99, prep=False):
    """허브 쇠 상자 → 공급 상자. 상자마다 내용 기록 → 다 꺼냄 → 걷고 → 공급 상자 → 다시 넣음."""
    chests = {}
    for c in hub_chests(ai):
        key = (c["x"], c["y"])
        chests.setdefault(key, []).append(c)
    todo = [(k, v) for k, v in sorted(chests.items())
            if not any(c["name"] == PP for c in v) and in_network(ai, *k)]
    say(f"  convert: {len(todo)} 자리 (망 안, 공급 상자 아님)")
    todo = todo[:limit]
    b = bag(ai, who)
    short = len(todo) - int(b.get(PP, 0))
    if short > 0:
        adv = int(b.get("advanced-circuit", 0))
        plan = need_plates(ai, who, {"steel-plate": 8 * short, "iron-plate": 3 * short + 10, "copper-plate": 5 * short + 10})
        if adv < short:
            got, steps = adv_plan(ai, short - adv)
            plan += steps
            need = short - adv - got
            if need > 0:
                say(f"  convert: 고급 회로 {need} 모자람 - 그만큼 줄인다")
                short -= need
        if short > 0:
            plan += [("craft", {"recipe": "steel-chest", "count": short, "wait": "block"}),
                     ("craft", {"recipe": "copper-cable", "count": 5 * short, "wait": "block"}),
                     ("craft", {"recipe": "electronic-circuit", "count": 3 * short, "wait": "block"}),
                     ("craft", {"recipe": PP, "count": short, "wait": "block"})]
            say(f"  convert: 공급 상자 {short} 만들기 · {len(plan)}걸음")
            bad = run(ai, who, plan, limit=1800)
            time.sleep(15)
            say(f"  convert: 만들기 실패 {bad} · 가방 공급 상자 {bag(ai, who).get(PP, 0)}")
    if prep:
        return 0
    done = 0
    for (x, y), cs in todo:
        if int(bag(ai, who).get(PP, 0)) < 1:
            say("  convert: 공급 상자가 떨어졌다")
            break
        before = bag(ai, who)
        items = {}
        for c in cs:
            for k, n in c["items"].items():
                items[k] = items.get(k, 0) + n
        plan = [("walk_to", {"x": x, "y": y + 2.5})]
        for c in cs:
            for k, n in c["items"].items():
                plan.append(("take", {"name": k, "x": x, "y": y, "count": n}))
        for c in cs:
            plan.append(("demolish", {"x": x, "y": y, "name": c["name"], "search_radius": 0.4}))
        plan.append(p1.b(PP, x, y))
        for k, n in items.items():
            plan.append(("insert", {"name": k, "x": x, "y": y, "count": n}))
        bad = run(ai, who, plan, limit=600)
        # 팔이 사이에 넣은 것 · 넣다 남은 것 - 가방에 늘어난 만큼 되돌린다
        after = bag(ai, who)
        back = [("insert", {"name": k, "x": x, "y": y, "count": int(after.get(k, 0)) - int(before.get(k, 0))})
                for k in set(items) if int(after.get(k, 0)) - int(before.get(k, 0)) > 0]
        if back and (ai.lua("{v = game.surfaces[1].find_entity('%s', {%f, %f}) ~= nil}" % (PP, x, y)) or {}).get("v"):
            run(ai, who, back, limit=200)
        now = stock_at(ai, x, y)
        ok = (ai.lua("{v = game.surfaces[1].find_entity('%s', {%f, %f}) ~= nil}" % (PP, x, y)) or {}).get("v")
        say(f"  convert ({x},{y}) {'공급 상자' if ok else '실패'} · 전 {items} · 후 {now} · 실패 {bad}")
        done += 1 if ok else 0
        if not ok:
            break
    return done


def verify(ai):
    survey(ai)
    r = ai.lua("""(function() local s, out = game.surfaces[1], {}
      local l = s.find_logistic_network_by_position({-80, -52}, 'player')
      if not l then return {net = '-'} end
      out.net = l.network_id
      out.cells = #l.cells
      out.pp = #l.passive_provider_points
      out.storages = #l.storages
      for _, it in pairs({'transport-belt', 'underground-belt', 'inserter', 'small-electric-pole', 'stone-wall', 'gun-turret', 'iron-plate', 'steel-plate'}) do
        out[it] = l.get_item_count(it) end
      return out end)()""")
    say(f"  허브 망: {r}")


def main() -> int:
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", "feed", "ports", "store", "prep", "convert", "all"))
    ap.add_argument("--who", default="")
    ap.add_argument("--limit", type=int, default=99)
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--log", default="")
    a = ap.parse_args()
    LOG = a.log or LOG
    ai = AIBridge()
    if a.verify or not a.stage:
        (verify if a.verify else survey)(ai)
        return 0
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        say("--who 가 없다")
        return 2
    who = crew[0]
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=120)
    try:
        stages = ["feed", "ports", "store", "prep"] if a.stage == "all" else [a.stage]
        for st in stages:
            say(f"== {st} ({who})")
            if st == "feed":
                stage_feed(ai, who)
            elif st == "ports":
                stage_ports(ai, who)
            elif st == "store":
                stage_store(ai, who)
            elif st in ("convert", "prep"):
                # prep: 공급 상자만 만들어 가방에 (허브 상자는 그대로) - 모드 · 스크립트가 허브를
                # type='container' 로만 찾는 동안에는 바꾸면 허브가 안 보인다 (보고 참조)
                stage_convert(ai, who, a.limit, prep=(st == "prep"))
    finally:
        detached.release([who])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

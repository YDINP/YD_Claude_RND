"""캐릭터마다 개인 로보포트 (사용자: "캐릭터별로 개인로보포트 보유하도록 진행해").

모듈 갑옷 (5x5) 에 개인 로보포트 (2x2) + 배터리 (1x2) + 태양광 SOLAR 장 (1x1) + 가방에 건설 로봇 BOTS 대.
로봇은 가방에서 나간다 (개인 로보포트는 캐릭터 인벤토리의 로봇을 쓴다).

재료가 모자라는 곳 (23회차 실측):
  배터리 - 화학 공장 (25.5,-4.5) 한 대. 출력이 2 개 쌓이면 서고 (full_output) 소비처 (로봇 프레임) 도 멈춰 있어
           10 분 생산 0. 출력에 인서터+상자 (BAT_BOX) 를 달아 멈추지 않게 한다 (--battery-box).
  고급 회로 - 로보포트 조립기 (34.5,-38.5) 입력에 90 이 묶여 있고, 그걸 채우는 조립기 셋이 full_output.
              입력에서 덜면 (PORT_KEEP 남김) 셋이 다시 돈다 - 분당 ~22.
  건설 로봇 - 북동 망 41 + 상자 6. 북동 망엔 NE_KEEP 은 남긴다. 로봇 조립 줄은 전자 회로 부족으로 멈춤.
  강철은 넉넉 (2600) - 전체 STEEL_FLOOR 아래로는 안 덜어간다 (포탑 · 탄 몫).

갑옷 입히기는 브리지에 태스크가 없어 Lua 로 «캐릭터가 가방에서 꺼내 입는» 일만 한다 (가방에 없으면 안 한다).

    python scripts/proboport23.py                     # 재료 · 누가 입었나
    python scripts/proboport23.py --battery-box delta # 배터리 공장 출력 상자 달기
    python scripts/proboport23.py --kit delta         # delta 가 모으고 만들어 입는다
    python scripts/proboport23.py --kit alpha --by golf   # golf 가 만들어 alpha 에게 건넨 뒤 입힌다
    python scripts/proboport23.py --equip delta       # 가방에 든 것만 입힌다
    python scripts/proboport23.py --verify
"""
import argparse
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
from client import AIBridge, RconError  # noqa: E402

OWNER = "proboport23"
CREW = ["alpha", "bravo", "charlie", "delta", "echo", "golf", "hotel"]
SOLAR, BOTS = 6, 10
ARM, RP, BE, SPE, SP = ("modular-armor", "personal-roboport-equipment", "battery-equipment",
                        "solar-panel-equipment", "solar-panel")
AC, STEEL, BAT, GEAR, EC, CABLE, BOT = ("advanced-circuit", "steel-plate", "battery", "iron-gear-wheel",
                                        "electronic-circuit", "copper-cable", "construction-robot")
BAT_PLANT = (25.5, -4.5)
BAT_BOX = (28.5, -3.5)
BAT_INS = (27.5, -3.5)
BAT_POLE = (28.5, -4.5)
PORT_ASM = (34.5, -38.5)            # 로보포트 조립기 - 입력에 고급 회로가 묶여 있다
PORT_KEEP = 10                      # 로보포트 조립기는 다른 재료 부족으로 서 있다 (8 대 만듦) - 개인 로보포트가 먼저
AC_ASMS = [(21.5, -32.5), (25.5, -32.5), (33.5, -32.5)]
NE_NET = (-24, -88)                 # 북동 망 (포트 넷)
NE_KEEP = 30
STEEL_FLOOR = 300
IRON_BOXES = [(30.5, -4.5)]
# p30 구역 (화학 · 정유 · 파이프 사이 폭 1 틈) - 들어가면 못 나온다 (charlie · delta 가 세 번 갇힘, (26,7.9)).
# 안의 것은 북쪽 줄 y=EDGE_Y 에 서서 손 닿는 (reach 10 - 0.5) 것만 집는다. 나머지는 공급원에서 뺀다.
ZONE = (18, -12, 34, 14)
EDGE_Y = -12.5
REACH = 9.3
COPPER_BOXES = []                   # 배터리 공장 재료 상자에서 덜었더니 배터리가 섰다 - 구리는 가방 것만 (다들 수백~수천)
LOG = print

# ai.lua 는 /silent-command 라 storage 가 안 보인다 - 원격 호출 alive 가 같은 틱의 정확한 자리를 준다.
BODY = """local function body(n)
  local r = remote.call('ai', 'alive', n)
  if not (r and r.alive) then return nil end
  local best, bd = nil, 1e9
  for _, c in pairs(game.surfaces[1].find_entities_filtered{type = 'character', position = {r.x, r.y}, radius = 0.5}) do
    local d = (c.position.x - r.x)^2 + (c.position.y - r.y)^2
    if d < bd then best, bd = c, d end
  end
  return best
end"""


def lua(ai, src, **kw):
    for k, v in kw.items():
        src = src.replace("@" + k + "@", str(v))
    return ai.lua(src)


def rows(r):
    return r if isinstance(r, list) else list((r or {}).values())


# ---------------------------------------------------------------- 보기

def gear(ai, name) -> dict:
    """{armor, grid:[..], energy, cap, solar_kw, bots, bag:{kit 품목}}"""
    r = lua(ai, """(function() @BODY@
      local b = body('@N@') if not b then return {dead = 1} end
      local m = b.get_main_inventory()
      local o = {armor = '-', grid = {}, energy = 0, cap = 0, solar_kw = 0, bots = m.get_item_count('construction-robot'),
                 free = m.count_empty_stacks(), x = b.position.x, y = b.position.y, bag = {}}
      for _, n in pairs({'modular-armor','personal-roboport-equipment','battery-equipment','solar-panel-equipment','solar-panel',
                         'advanced-circuit','steel-plate','battery','iron-gear-wheel','electronic-circuit','copper-cable',
                         'iron-plate','copper-plate'}) do
        local c = m.get_item_count(n) if c > 0 then o.bag[n] = c end end
      local a = b.get_inventory(defines.inventory.character_armor)
      if a and a[1].valid_for_read then
        o.armor = a[1].name
        local g = a[1].grid
        if g then
          for _, e in pairs(g.equipment) do o.grid[#o.grid + 1] = e.name end
          o.energy = math.floor(g.available_in_batteries / 1e3); o.cap = math.floor(g.battery_capacity / 1e3)
          o.solar_kw = math.floor(g.max_solar_energy * 60 / 1e3)
        end
      end
      return o end)()""", BODY=BODY, N=name)
    if r and "grid" in r:
        r["grid"] = rows(r["grid"])
    return r or {"dead": 1}


def stock(ai) -> dict:
    """캐릭터 밖 수량 + 뽑아 쓸 수 있는 몫."""
    r = lua(ai, """(function() local s = game.surfaces[1] local o = {}
      local W = {'steel-plate','advanced-circuit','battery','electronic-circuit','plastic-bar','construction-robot','iron-gear-wheel'}
      for _, w in pairs(W) do o[w] = 0 end
      for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'container','furnace','assembling-machine','roboport','logistic-container'}}) do
        for _, w in pairs(W) do o[w] = o[w] + e.get_item_count(w) end end
      local pa = s.find_entity('assembling-machine-1', {@PX@, @PY@}) or s.find_entities_filtered{position = {@PX@, @PY@}, radius = 1, type = 'assembling-machine'}[1]
      o.port_ac = pa and pa.get_item_count('advanced-circuit') or 0
      local ac_out = 0
      for _, p in pairs({@ACS@}) do local a = s.find_entities_filtered{position = p, radius = 1, type = 'assembling-machine'}[1]
        if a then ac_out = ac_out + a.get_inventory(defines.inventory.crafter_output).get_item_count('advanced-circuit') end end
      o.ac_out = ac_out
      local bp = s.find_entities_filtered{position = {@BX@, @BY@}, radius = 1, name = 'chemical-plant'}[1]
      o.bat_plant = bp and bp.get_inventory(defines.inventory.crafter_output).get_item_count('battery') or -1
      local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
      o.bat_status = bp and (st[bp.status] or '?') or '-'
      local bx = s.find_entities_filtered{position = {@XX@, @XY@}, radius = 0.6, type = 'container'}[1]
      o.bat_box = bx and bx.get_item_count('battery') or -1
      local net = s.find_logistic_network_by_position({@NX@, @NY@}, 'player')
      o.ne_bots = net and net.all_construction_robots or 0
      o.ne_idle = net and net.available_construction_robots or 0
      return o end)()""", PX=PORT_ASM[0], PY=PORT_ASM[1], BX=BAT_PLANT[0], BY=BAT_PLANT[1], XX=BAT_BOX[0], XY=BAT_BOX[1],
            NX=NE_NET[0], NY=NE_NET[1], ACS=",".join("{%s,%s}" % p for p in AC_ASMS))
    return r or {}


def sources(ai, item, exclude=()) -> list:
    """[(x, y, 덜 수 있는 수)] 많은 순. 품목마다 «건드려도 되는» 곳만."""
    r = lua(ai, """(function() local s = game.surfaces[1] local o = {}
      local item = '@I@'
      -- 꺼낼 곳: 공급 · 저장 상자 (logistic-container) 포함, 요청 · 버퍼 상자는 제외 (로봇이 채우는 자리).
      local function add(e, n) if n > 0 and e.name ~= 'requester-chest' and e.name ~= 'buffer-chest' then o[#o + 1] = string.format('%.1f,%.1f,%d', e.position.x, e.position.y, n) end end
      if item == 'steel-plate' then
        for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'container', 'logistic-container'}}) do add(e, e.get_item_count(item)) end
        for _, e in pairs(s.find_entities_filtered{force = 'player', type = 'furnace'}) do
          add(e, e.get_inventory(defines.inventory.furnace_result).get_item_count(item)) end
      elseif item == 'advanced-circuit' then
        local pa = s.find_entities_filtered{position = {@PX@, @PY@}, radius = 1, type = 'assembling-machine'}[1]
        if pa then add(pa, pa.get_item_count(item) - @KEEP@) end
        for _, p in pairs({@ACS@}) do local a = s.find_entities_filtered{position = p, radius = 1, type = 'assembling-machine'}[1]
          if a then add(a, a.get_inventory(defines.inventory.crafter_output).get_item_count(item)) end end
        for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'container', 'logistic-container'}}) do add(e, e.get_item_count(item)) end
      elseif item == 'battery' then
        for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'container', 'logistic-container'}}) do add(e, e.get_item_count(item)) end
        local bp = s.find_entities_filtered{position = {@BX@, @BY@}, radius = 1, name = 'chemical-plant'}[1]
        if bp then add(bp, bp.get_inventory(defines.inventory.crafter_output).get_item_count(item)) end
      elseif item == 'construction-robot' then
        for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'container', 'logistic-container'}}) do add(e, e.get_item_count(item)) end
        local net = s.find_logistic_network_by_position({@NX@, @NY@}, 'player')
        if net then
          local spare = net.all_construction_robots - @NEKEEP@
          for _, c in pairs(net.cells) do local p = c.owner
            if spare > 0 and p.type == 'roboport' then
              local n = math.min(spare, p.get_inventory(defines.inventory.roboport_robot).get_item_count(item))
              add(p, n) spare = spare - n end end
        end
      else
        for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'container', 'logistic-container'}}) do add(e, e.get_item_count(item)) end
      end
      return o end)()""", I=item, PX=PORT_ASM[0], PY=PORT_ASM[1], KEEP=PORT_KEEP, BX=BAT_PLANT[0], BY=BAT_PLANT[1],
            NX=NE_NET[0], NY=NE_NET[1], NEKEEP=NE_KEEP, ACS=",".join("{%s,%s}" % p for p in AC_ASMS))
    out = []
    for row in rows(r):
        x, y, n = str(row).split(",")
        if (float(x), float(y)) in exclude:
            continue
        out.append((float(x), float(y), int(n)))
    return sorted(out, key=lambda t: -t[2])


def survey(ai):
    s = stock(ai)
    LOG("재료 (캐릭터 밖): " + " ".join(f"{k}={v}" for k, v in s.items()))
    for n in CREW:
        g = gear(ai, n)
        if g.get("dead"):
            LOG(f"  {n}: 없음/죽음")
            continue
        grid = {}
        for e in g["grid"]:
            grid[e] = grid.get(e, 0) + 1
        LOG(f"  {n}: 갑옷 {g['armor']} · 격자 {grid or '-'} · 전지 {g['energy']}/{g['cap']}kJ · 태양 {g['solar_kw']}kW"
            f" · 로봇 {g['bots']} · 빈칸 {g['free']} · 가방 {g['bag']}")


# ---------------------------------------------------------------- 일 시키기

def run(ai, who, plan, limit=900):
    """계획을 넣고 끝날 때까지. [(type, error)] 실패만."""
    if not plan:
        return []
    ids = ai.agent(who).submit_plan(plan)
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(5)
        st = [ai.poll(t)["status"] for t in ids]
        if all(s in ("done", "failed", "unknown") for s in st):
            break
    fails = []
    for t in ids:
        p = ai.poll(t)
        if p["status"] == "failed":
            fails.append((p.get("type"), (p.get("error") or "")[:80]))
        elif p["status"] not in ("done", "unknown"):   # unknown = 결과 기록에서 밀려남 (끝난 것)
            fails.append((p.get("type"), "still " + str(p["status"])))
    if any("still" in e for _, e in fails):
        ai.agent(who).cancel()
    return fails


def in_zone(x, y):
    return ZONE[0] <= x <= ZONE[2] and ZONE[1] <= y <= ZONE[3]


def take_plan(srcs, item, n):
    plan, got = [], 0
    for x, y, have in srcs:
        if got >= n:
            break
        k = min(have, n - got)
        if in_zone(x, y):
            if y - EDGE_Y > REACH:
                continue                     # 북쪽 줄에서 손이 안 닿는다 - 들어가지 않는다
            plan.append(("walk_to", {"x": x, "y": EDGE_Y}))
        plan.append(("take", {"name": item, "x": x, "y": y, "count": k}))  # 밖이면 take 가 알아서 다가간다
        got += k
    return plan, got


def battery_box(ai, who):
    """배터리 공장 동쪽에 인서터 (서쪽에서 집는다) + 상자 + 작은 전봇대."""
    have = lua(ai, """(function() local s = game.surfaces[1]
      return {box = #s.find_entities_filtered{position = {@X@, @Y@}, radius = 0.6, type = 'container'},
              ins = #s.find_entities_filtered{position = {@IX@, @IY@}, radius = 0.6, type = 'inserter'}} end)()""",
               X=BAT_BOX[0], Y=BAT_BOX[1], IX=BAT_INS[0], IY=BAT_INS[1])
    if have.get("box") and have.get("ins"):
        LOG("  배터리 상자 이미 있음")
        return
    g = gear(ai, who)
    bag = ai.agent(who).items()
    plan = []
    for item, n in (("iron-chest", 1), ("inserter", 1), ("small-electric-pole", 1)):
        if int(bag.get(item, 0)) < n:
            plan.append(("craft", {"recipe": item, "count": n, "wait": True}))
    plan += [("walk_to", {"x": BAT_BOX[0], "y": EDGE_Y}),   # 구역 밖 북쪽 줄에서 (손 닿음 9)
             ("build", {"name": "iron-chest", "x": BAT_BOX[0], "y": BAT_BOX[1]}),
             ("build", {"name": "inserter", "x": BAT_INS[0], "y": BAT_INS[1], "direction": 12}),
             ("build", {"name": "small-electric-pole", "x": BAT_POLE[0], "y": BAT_POLE[1]}),
             ("walk_to", {"x": BAT_BOX[0], "y": EDGE_Y})]
    LOG(f"  배터리 상자 짓기 ({who} @ {g.get('x', 0):.0f},{g.get('y', 0):.0f}) 실패 {run(ai, who, plan, 600)}")
    LOG("  " + str(lua(ai, """(function() local s = game.surfaces[1]
      local i = s.find_entities_filtered{position = {@IX@, @IY@}, radius = 0.6, type = 'inserter'}[1]
      return i and {pick = i.pickup_target and i.pickup_target.name or '-', drop = i.drop_target and i.drop_target.name or '-',
                    power = i.is_connected_to_electric_network()} or {none = 1} end)()""", IX=BAT_INS[0], IY=BAT_INS[1])))


def need_for(g, solar):
    """완제품 기준 필요량 (이미 입은 것 · 가방에 든 것 빼고)."""
    grid = {}
    for e in g.get("grid", []):
        grid[e] = grid.get(e, 0) + 1
    bag = g.get("bag", {})
    want = {ARM: 0 if g.get("armor") == ARM else 1, RP: 1 - grid.get(RP, 0), BE: 1 - grid.get(BE, 0),
            SPE: solar - grid.get(SPE, 0)}
    return {k: max(0, v - int(bag.get(k, 0))) for k, v in want.items()}


def raw_for(fin, bag):
    """완제품 → 판 · 중간재 «총량» (가방에 든 완제품 · 태양광 판은 뺀다). gather 가 가방과 비교한다."""
    sp = max(0, fin[SPE] - int(bag.get(SP, 0)))
    raw = {AC: 30 * fin[ARM] + 10 * fin[RP] + 2 * fin[SPE],
           STEEL: 50 * fin[ARM] + 20 * fin[RP] + 10 * fin[BE] + 5 * fin[SPE] + 5 * sp,
           BAT: 45 * fin[RP] + 5 * fin[BE],
           GEAR: 40 * fin[RP], EC: 15 * sp}
    return raw, sp


def gather(ai, crafter, raw, minutes):
    """강철 · 고급 회로 · 배터리 · 판을 crafter 가방으로. 모자라면 기다렸다 다시 (배터리 · 회로는 흐름)."""
    t0 = time.time()
    rnd = 0
    while True:
        bag = ai.agent(crafter).items()
        short = {k: raw[k] - int(bag.get(k, 0)) for k in (STEEL, AC, BAT) if raw[k] - int(bag.get(k, 0)) > 0}
        # 판: 기어 2 철 · 회로 1 철 + 1.5 구리 · 태양 5 구리 (여유 10%)
        gear_n = max(0, raw[GEAR] - int(bag.get(GEAR, 0)))
        ec_n = max(0, raw[EC] - int(bag.get(EC, 0)))
        iron = int((gear_n * 2 + ec_n) * 1.1) + 5
        copper = math.ceil(ec_n * 1.5 + raw.get("_sp", 0) * 5)   # 구리는 가방 것만 쓰므로 여유를 안 붙인다
        if int(bag.get("iron-plate", 0)) < iron:
            short["iron-plate"] = iron - int(bag.get("iron-plate", 0))
        if int(bag.get("copper-plate", 0)) < copper:
            short["copper-plate"] = copper - int(bag.get("copper-plate", 0))
        if not short:
            return True
        if time.time() - t0 > minutes * 60:
            LOG(f"  모으기 시간 끝 - 모자람 {short}")
            return False
        plan = []
        for item, n in short.items():
            if item == STEEL:
                total = stock(ai).get(STEEL, 0)
                n = min(n, max(0, total - STEEL_FLOOR))
                p, _ = take_plan(sources(ai, STEEL), STEEL, n)
            elif item == "iron-plate":
                p, _ = take_plan([(x, y, 300) for x, y in IRON_BOXES], item, n)
            elif item == "copper-plate":
                p, _ = take_plan([(x, y, 150) for x, y in COPPER_BOXES], item, n)
            elif item == BAT:
                p, _ = take_plan(sources(ai, BAT), BAT, n)
            else:
                p, _ = take_plan(sources(ai, item), item, n)
            plan += p
        if BAT in short or AC in short:
            # 흐름을 기다린다 - 배터리 상자 앞에서
            plan += [("walk_to", {"x": BAT_BOX[0], "y": EDGE_Y}), ("wait", {"ticks": 1800})]
        rnd += 1
        fails = run(ai, crafter, plan, 900)
        LOG(f"  모으기 {rnd}: 모자람 {short} · 실패 {fails[:4]}")


CRAFT_ORDER = [GEAR, CABLE, EC, SP, SPE, BE, RP, ARM]


def held(ai, who) -> dict:
    """가방 + 갑옷 칸. 갑옷 칸이 비어 있으면 손으로 만든 갑옷은 «바로 입혀진다» (23회차 golf - 가방에서 사라져
    «modular-armor 재료 없음» 을 세 번 냈다)."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    arm = gear(ai, who).get("armor", "-")
    if arm and arm != "-":
        bag[arm] = bag.get(arm, 0) + 1
    return bag


def wait_queue(ai, who, limit=900):
    t0 = time.time()
    while time.time() - t0 < limit:
        q = lua(ai, "(function() @BODY@ local b = body('@N@') return {q = b and b.crafting_queue_size or 0} end)()",
                BODY=BODY, N=who)
        if not q or not q.get("q"):
            return
        time.sleep(4)


def craft_all(ai, crafter, fin):
    """가방에 완제품 fin 만큼 «더» 생기도록. 중간재는 매번 가방을 보고 모자란 만큼만."""
    bag0 = held(ai, crafter)
    target = {k: fin[k] + int(bag0.get(k, 0)) for k in (ARM, RP, BE, SPE)}
    for attempt in range(4):
        bag = held(ai, crafter)
        miss = {k: max(0, target[k] - bag.get(k, 0)) for k in target}
        if not any(miss.values()):
            return True
        sp = max(0, miss[SPE] - bag.get(SP, 0))
        ec = max(0, 15 * sp - bag.get(EC, 0))
        n = {GEAR: max(0, 40 * miss[RP] - bag.get(GEAR, 0)), CABLE: (max(0, 3 * ec - bag.get(CABLE, 0)) + 1) // 2,
             EC: ec, SP: sp, SPE: miss[SPE], BE: miss[BE], RP: miss[RP], ARM: miss[ARM]}
        todo = [(r, n[r]) for r in CRAFT_ORDER if n[r] > 0]
        LOG(f"  만들기 {attempt + 1}: {todo}")
        # 한 가지씩: 주문 → 제작 큐가 빌 때까지 (craft 는 비차단이 됐고, 중간재가 아직 없으면 다음 주문이 실패한다)
        for r, k in todo:
            fails = run(ai, crafter, [("craft", {"recipe": r, "count": k})], 300)
            if fails:
                LOG(f"    {r} x{k} 실패 {fails[:2]}")
            wait_queue(ai, crafter)
    bag = held(ai, crafter)
    return all(bag.get(k, 0) >= v for k, v in target.items())


def equip(ai, who) -> dict:
    """가방에 든 갑옷 · 장비를 입는다. 격자에 못 들어간 것은 가방으로 되돌린다."""
    return lua(ai, """(function() @BODY@
      local b = body('@N@') if not b then return {error = 'no body'} end
      local m = b.get_main_inventory()
      local a = b.get_inventory(defines.inventory.character_armor)
      local log = {}
      if m.get_item_count('modular-armor') > 0 and not (a[1].valid_for_read and a[1].grid) then
        local st = m.find_item_stack('modular-armor')
        if a[1].valid_for_read then
          -- 격자 없는 갑옷 (heavy-armor 등) 을 입고 있으면 맞바꾼다 - 벗은 것은 가방의 그 칸으로 (23회차 charlie)
          if st and a[1].swap_stack(st) then log[#log + 1] = 'armor(swap)' end
        elseif st and a[1].transfer_stack(st) then log[#log + 1] = 'armor' end
      end
      if not (a[1].valid_for_read and a[1].grid) then return {error = 'no armor with grid', log = log} end
      local g = a[1].grid
      local function put(name, pos)
        while m.get_item_count(name) > 0 do
          local e = pos and g.put{name = name, position = pos} or nil
          if not e then e = g.put{name = name} end
          if not e then log[#log + 1] = name .. ':no-room' return end
          m.remove{name = name, count = 1}
          log[#log + 1] = name
          pos = nil
        end
      end
      put('personal-roboport-equipment', {0, 0})
      put('battery-equipment', {2, 0})
      put('solar-panel-equipment', nil)
      local eq = {} for _, e in pairs(g.equipment) do eq[#eq + 1] = e.name end
      return {log = log, grid = eq, bots = m.get_item_count('construction-robot')} end)()""", BODY=BODY, N=who)


def kit(ai, who, crafter, solar, bots, minutes):
    g = gear(ai, who)
    if g.get("dead"):
        LOG(f"{who}: 몸 없음")
        return
    fin = need_for(g, solar)
    if crafter != who:
        cb = gear(ai, crafter).get("bag", {})
        fin = {k: max(0, v - int(cb.get(k, 0))) for k, v in fin.items()}
    cbag = gear(ai, crafter).get("bag", {})
    raw, sp = raw_for(fin, cbag)
    raw["_sp"] = sp
    LOG(f"{who} (만드는 이 {crafter}): 완제품 {fin} · 재료 {raw}")
    if any(fin.values()):
        if not gather(ai, crafter, raw, minutes):
            LOG(f"{who}: 재료 모자라 멈춤")
            return
        if not craft_all(ai, crafter, fin):
            LOG(f"{who}: 만들기 끝나지 않음 - 가방 {gear(ai, crafter).get('bag')}")
            return
    # 로봇 - 만드는 이가 자기 로보포트용으로 가진 로봇은 건네지 않는다 (23회차: delta · golf 가 제 로봇까지 넘겼다)
    own = gear(ai, crafter).get("bots", 0) if crafter != who else 0
    have_bots = gear(ai, who).get("bots", 0)
    if have_bots < bots:
        p, got = take_plan(sources(ai, BOT), BOT, bots - have_bots)
        LOG(f"  로봇 {got} 가져오기 - 실패 {run(ai, crafter, p, 600)}")
    if crafter != who:
        cb = ai.agent(crafter).items()
        plan = [("give", {"to": who, "name": n, "count": int(cb.get(n, 0))})
                for n in (ARM, RP, BE, SPE, BOT) if int(cb.get(n, 0)) > 0]
        plan = [s for s in plan if s[1]["name"] != BOT]
        n_b = int(cb.get(BOT, 0)) - own
        if n_b > 0:
            plan.append(("give", {"to": who, "name": BOT, "count": min(n_b, bots - have_bots)}))
        LOG(f"  {crafter} → {who} 건네기 실패 {run(ai, crafter, plan, 900)}")
    LOG(f"  입기 {equip(ai, who)}")
    verify(ai, [who])


def verify(ai, names):
    for n in names:
        g = gear(ai, n)
        if g.get("dead"):
            LOG(f"  {n}: 몸 없음")
            continue
        grid = {}
        for e in g["grid"]:
            grid[e] = grid.get(e, 0) + 1
        ok = g["armor"] == ARM and grid.get(RP) and g["bots"] >= 1
        LOG(f"  {n}: {'OK' if ok else '--'} 갑옷 {g['armor']} · 격자 {grid} · 전지 {g['energy']}/{g['cap']}kJ"
            f" · 태양 {g['solar_kw']}kW · 로봇 {g['bots']}")


EEU_ASM, FRAME_ASM, BOT_ASM = (21.5, -8.5), (25.5, -8.5), (29.5, -8.5)
BOT_BOX = (29.5, -5.5)


def engine_sources(ai):
    r = lua(ai, """(function() local o = {}
      for _, e in pairs(game.surfaces[1].find_entities_filtered{force = 'player', type = 'assembling-machine'}) do
        local r = e.get_recipe()
        if r and r.name == 'engine-unit' then
          local n = e.get_inventory(defines.inventory.crafter_output).get_item_count('engine-unit')
          if n > 0 then o[#o + 1] = string.format('%.1f,%.1f,%d', e.position.x, e.position.y, n) end
        end end
      return o end)()""")
    out = [tuple(float(v) for v in str(row).split(",")) for row in rows(r)]
    return sorted([(x, y, int(n)) for x, y, n in out], key=lambda t: -t[2])


def feed_robots(ai, who, n):
    """로봇 줄 (엔진 → 전기 엔진 → 프레임 → 로봇) 은 전자 회로를 손으로 넣게 지어져 있다 (회로 벨트 없음).
    로봇 n 대 몫: 전기 엔진 조립기 회로 2n + 엔진 n, 프레임 3n, 로봇 2n. 로봇은 BOT_BOX 로 나온다."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    ec = 7 * n
    plan = []
    short = ec - bag.get(EC, 0)
    if short > 0:
        cab = max(0, 3 * short - bag.get(CABLE, 0))
        for r, k in ((CABLE, (cab + 1) // 2), (EC, short)):   # 한 가지씩 - 큐가 빈 뒤 다음
            if k > 0:
                f = run(ai, who, [("craft", {"recipe": r, "count": k})], 300)
                if f:
                    LOG(f"    {r} x{k} 실패 {f[:2]}")
                wait_queue(ai, who)
    have_eng = bag.get("engine-unit", 0)
    p, got = take_plan([s for s in engine_sources(ai) if not in_zone(s[0], s[1]) or s[1] - EDGE_Y <= REACH],
                       "engine-unit", max(0, n - have_eng))
    plan += p
    LOG(f"  로봇 줄 먹이기 {who}: 회로 {ec} (만들 {max(0, short)}) · 엔진 {have_eng}+{got}")
    fails = run(ai, who, plan, 1500)
    if fails:
        LOG(f"    준비 실패 {fails[:4]}")
    wait_queue(ai, who)
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    k = min(n, bag.get(EC, 0) // 7)
    eng = bag.get("engine-unit", 0)
    plan = [("walk_to", {"x": EEU_ASM[0], "y": EDGE_Y})]
    if eng:
        plan.append(("insert", {"name": "engine-unit", "x": EEU_ASM[0], "y": EEU_ASM[1], "count": eng}))
    plan += [("insert", {"name": EC, "x": EEU_ASM[0], "y": EEU_ASM[1], "count": 2 * k}),
             ("walk_to", {"x": FRAME_ASM[0], "y": EDGE_Y}),
             ("insert", {"name": EC, "x": FRAME_ASM[0], "y": FRAME_ASM[1], "count": 3 * k}),
             ("walk_to", {"x": BOT_ASM[0], "y": EDGE_Y}),
             ("insert", {"name": EC, "x": BOT_ASM[0], "y": BOT_ASM[1], "count": 2 * k})]
    LOG(f"  넣기 (로봇 {k} 몫, 엔진 {eng}) 실패 {run(ai, who, plan, 600)}")
    LOG("  " + str(lua(ai, """(function() local s = game.surfaces[1] local o = {}
      for _, p in pairs({{@A@}, {@B@}, {@C@}}) do local a = s.find_entities_filtered{position = p, radius = 1, type = 'assembling-machine'}[1]
        local t = {} for _, v in pairs(a.get_inventory(defines.inventory.crafter_input).get_contents()) do t[#t + 1] = v.name .. ':' .. v.count end
        o[#o + 1] = a.get_recipe().name .. ' ' .. table.concat(t, ' ') end
      return o end)()""", A="%s,%s" % EEU_ASM, B="%s,%s" % FRAME_ASM, C="%s,%s" % BOT_ASM)))


def feed_ac(ai, who, n):
    """고급 회로 조립기 (플라스틱 · 구리선은 있고 전자 회로가 모자라 섬) 에 손으로 만든 전자 회로 2n 을 나눠 넣는다.
    나온 회로는 로보포트 조립기 입력으로 가고, 거기서 kit 이 가져간다."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    ec = 2 * n
    short = ec - bag.get(EC, 0)
    if short > 0:
        cab = max(0, 3 * short - bag.get(CABLE, 0))
        for r, k in ((CABLE, (cab + 1) // 2), (EC, short)):
            if k > 0:
                f = run(ai, who, [("craft", {"recipe": r, "count": k})], 300)
                if f:
                    LOG(f"    {r} x{k} 실패 {f[:2]}")
                wait_queue(ai, who)
    have = int(ai.agent(who).items().get(EC, 0))
    per = min(ec, have) // len(AC_ASMS)
    plan = [("insert", {"name": EC, "x": x, "y": y, "count": per}) for x, y in AC_ASMS if per > 0]
    LOG(f"  고급 회로 조립기 먹이기 {who}: 회로 {per} x {len(AC_ASMS)} - 실패 {run(ai, who, plan, 600)}")


def main() -> int:
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit", default="")
    ap.add_argument("--by", default="")
    ap.add_argument("--equip", default="")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--battery-box", default="")
    ap.add_argument("--solar", type=int, default=SOLAR)
    ap.add_argument("--bots", type=int, default=BOTS)
    ap.add_argument("--minutes", type=float, default=25)
    ap.add_argument("--feed-ac", default="", help="WHO:N - 고급 회로 N 개 몫 전자 회로를 조립기에")
    ap.add_argument("--feed-robots", default="", help="WHO:N - 로봇 줄에 회로 · 엔진을 넣는다")
    a = ap.parse_args()

    def log(*x):
        print(time.strftime("%H:%M:%S"), *x, flush=True)
    LOG = log
    ai = AIBridge()
    if a.verify:
        verify(ai, CREW)
        return 0
    if a.equip:
        for w in a.equip.split(","):
            LOG(w, equip(ai, w))
        verify(ai, a.equip.split(","))
        return 0
    if a.feed_ac:
        who, n = a.feed_ac.split(":")
        os.environ[detached.ENV] = OWNER
        detached.mark([who], OWNER, minutes=30)
        try:
            feed_ac(ai, who, int(n))
        finally:
            detached.release([who])
        return 0
    if a.feed_robots:
        who, n = a.feed_robots.split(":")
        os.environ[detached.ENV] = OWNER
        detached.mark([who], OWNER, minutes=40)
        try:
            feed_robots(ai, who, int(n))
        finally:
            detached.release([who])
        return 0
    if a.battery_box:
        os.environ[detached.ENV] = OWNER
        detached.mark([a.battery_box], OWNER, minutes=20)
        try:
            battery_box(ai, a.battery_box)
        finally:
            detached.release([a.battery_box])
        return 0
    if a.kit:
        for who in a.kit.split(","):
            crafter = a.by or who
            mine = [crafter]
            os.environ[detached.ENV] = OWNER
            detached.mark(mine, OWNER, minutes=a.minutes + 30)
            try:
                kit(ai, who, crafter, a.solar, a.bots, a.minutes)
            except RconError as e:
                LOG(f"{who}: RCON 오류 {e}")
            finally:
                detached.release(mine)
        return 0
    survey(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

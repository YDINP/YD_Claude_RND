"""Run 24: 동쪽 철 전초 (로보포트 (398,-150), 망 id 24 - 기지 망 9 와 떨어짐) 보급 고리 - 탄 · 수리팩을 사람이 걸어서.

전초 망은 건설 범위 (x 343..453, y -205..-95) 가 포탑 25 · 벽 · 화로를 다 덮는다 (find_logistic_networks_by_construction_area).
  → 로봇 20 이 ammo24 요청 (item-request-proxy, 포탑 하나 ≤ 20) 과 수리를 한다. 모자란 것은 «망 안의 탄 · 수리팩» 뿐.
  (find_logistic_network_by_position = 물류 범위 25 는 저장 상자 둘레만 - 포탑 · 수리에는 건설 범위면 된다)

한 바퀴 (전초 망 탄 < AMMO_LOW 또는 수리팩 < REP_LOW 이고 echo 가 한가할 때):
  허브 쇠 상자 (74.5,-15.5, 망 밖 철 완충) 철 → 노랑 탄창 손제작 (철 4 = 1, 걸으며 만든다) ·
  기지 망 수리팩 (가장 많이 든 상자, 기지 망에 REP_MAIN_KEEP 남김) ·
  전초 유령 (부서진 포탑 · 벽 ...) 재료 중 전초 망에 없는 것 (KIT, 기지 망 상자에서) → 걸어서 전초 저장 상자 (395.5,-150.5) 에 손으로.
  유령은 전초 로봇이 짓는다 (유령을 새로 놓지 않는다 - 부서진 자리에 게임이 남긴 것만).
  echo 는 넣은 뒤 허브 (HOME) 로 돌아와 기다린다 (전초에 서 있지 않는다).
  12:01 golf 가 전초 남서 (387,-133) 에서 중형 이빨에 죽음 (fuelhaul 길) → 적 문: 전초 둘레 (DANGER_R) 에 적 유닛이 있으면
  바퀴를 시작하지 않고, 가는 중이면 취소하고 허브로 물린다 (포탑 · 로봇이 치운 뒤 다음 바퀴).
Lua 아이템 이동 0 - 사람 손 (take · craft · insert) 과 로봇 (ammo24 요청 · 수리) 만.

    python scripts/eastsup24.py --once
    python scripts/eastsup24.py --who echo --every 20
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge, RconError  # noqa
from orders import submit  # noqa

OWNER = "eastsup"
PORT = (398.0, -150.0)
STORE = (395.5, -150.5)
HOME = (70.5, -11.0)              # 기다리는 곳 (허브 남쪽)
DANGER_R = 60                     # 전초 상자 · 포탑 둘레 이 반경에 적 유닛이 있으면 안 감
HUB_IRON = (74.5, -15.5)          # 망 밖 쇠 상자 (허브 철 벨트 → 빠른 팔)
HUB_KEEP = 300                    # 허브 쇠 상자에 남길 철 (다른 손 고리 몫)
AMMO_LOW = 150                    # 전초 망 탄 (노랑 + 피어싱) 이 밑이면 한 바퀴
AMMO_TRIP = 200                   # 한 바퀴 노랑 (철 800, 손제작 200 s - 걷는 ~80 s 동안 대부분)
# 13:4x 큰 이빨 (evo 0.54, 물리 저항 8/10%) - 노랑 (5 x 1.44 = 7.2 < 8) 은 거의 안 들어간다 → 전초는 피어싱만.
#   노랑 손제작은 기지 망 피어싱이 PIERCE_MAIN_KEEP 밑일 때만 (대체).
REP_LOW = 100                     # 전초 망 수리팩이 밑이면 챙김 (13:4x 40 → 100)
REP_TRIP = 200
# 늘 채워 둘 것 (전초 망 목표 밑이면, 기지 망에서 가장 많이 든 상자 하나에서 · 기지에 keep 남김): (밑이면, 한 바퀴, 기지 남김)
STOCK = {"piercing-rounds-magazine": (400, 200, 100), "gun-turret": (8, 12, 10), "stone-wall": (150, 200, 40)}
PIERCE_MAIN_KEEP = 250
# 15:5x 동쪽 몫 피어싱 상자 (ammoplus2_24 둘째 블록 피어싱 B → 망 밖 쇠 상자) - 기지 망 피어싱과 상관없이 여기서 먼저 챙김
EAST_RESERVE = (34.5, -50.5)
RESERVE_MIN = 20
# 전초 망 건설 로봇이 이 밑이면 사람이 손제작해 서쪽 문 포트에 넣는다 (틀 (-76.5,-3.5) 1 + 초록 회로 2 → 1, 0.5 s)
ROBOT_MIN = 20
ROBOT_TRIP = 20
FRAMES = (-76.5, -3.5)
CIRCUITS = (31.5, -16.5)
# 13:4x 서쪽 문 로보포트 (347,-103): 줄기 전봇대 (344.5,-99.5) 옆 · 남쪽 포트 (394,-120) 와 물류 사각 겹침 (dx 47) = 같은 망.
#   공습 무리 (x 390..440) 에서 60 넘게 떨어져 전초가 싸우는 중에도 넣을 수 있다 → 넣을 곳 첫째.
PORT3 = (347.0, -103.0)
STORE3_TRY = [(344.5, -104.5), (350.5, -106.5), (344.5, -106.5), (352.5, -102.5), (341.5, -103.5)]
REP_MAIN_KEEP = 300               # 기지 망 수리팩은 이만큼 남김
# 전초 유령 (공습에 부서진 것) 을 지을 재료 - 전초 망에 없는 만큼 기지 망 상자에서 (기지에 KEEP 남김, 한 바퀴 상한 CAP)
KIT = {"steel-furnace": (20, 0), "gun-turret": (20, 10), "stone-wall": (100, 100), "transport-belt": (50, 50), "fast-transport-belt": (50, 50),
       "inserter": (20, 30), "small-electric-pole": (20, 30), "medium-electric-pole": (5, 10),
       "electric-mining-drill": (15, 0), "iron-chest": (4, 0)}
# 12:1x 북쪽 끝 공습: 기지 망에 없는 것 (벨트 0 · 작은 전봇대 1 · 쇠 상자 0) 은 사람이 손제작 - (철, 구리, 한 번에 나오는 수)
CRAFT = {"transport-belt": (3, 0, 2), "small-electric-pole": (0, 1, 2), "iron-chest": (8, 0, 1)}
# 13:5x 전초 드릴 47 · 강철로 38 · 인서터 84 · 빠른 벨트 74 가 유령인데 기지 망에 0 (조립기 없음) → 사람이 손제작.
#   재료 (기지 망 가장 많이 든 상자, 철판은 허브 쇠 상자) · 한 바퀴 상한. 중간재 (톱니 · 노랑 벨트) 는 손제작 대기열이 알아서 만든다.
HAND = {"steel-furnace": ({"steel-plate": 6, "stone-brick": 10}, 20),  # 순서 = 우선 (dict 순)
        "fast-transport-belt": ({"iron-gear-wheel": 6, "iron-plate": 1}, 40),
        # 14:0x 기지 망 녹색 회로 0 → 회로도 손제작 (철 1 + 구리 1.5): 드릴 = 톱니 5 + 철 13 + 구리 5 · 인서터 = 톱니 1 + 철 2 + 구리 2
        "electric-mining-drill": ({"iron-gear-wheel": 5, "iron-plate": 13, "copper-plate": 5}, 24),
        "inserter": ({"iron-gear-wheel": 1, "iron-plate": 2, "copper-plate": 2}, 30)}
HAND_HUB_KEEP = 100               # 14:0x 철 굶음 - 전초 드릴이 철을 되살리는 길이라 허브 쇠 상자를 100 까지 쓴다
SRC_KEEP = {"steel-plate": 1000, "stone-brick": 300, "iron-gear-wheel": 300, "electronic-circuit": 50, "copper-plate": 2000}
HUB_CU = (71.5, -15.5)            # 허브 구리 쇠 상자 (전봇대 전선용)
# 북쪽 끝 포탑 둘 더 (12:0x 침 무리가 동벽 x 428, y -185 쪽으로 옴 - 남은 포탑 394 · 399 사거리 (x ≤ 417) 밖)
NORTH_DEF = [(424.0, -182.0), (424.0, -190.0)]
# 남쪽 둘째 로보포트 (394,-120) + 저장 상자: 남쪽 포탑 10 뒤 (벽 안) - 부림 자리가 북동 공습 자리 (420,-180) 에서 60 넘게 떨어져
#   북쪽이 싸우는 중에도 적 문 (DANGER_R) 을 지나 넣을 수 있다. 첫 포트와 32 칸 = 망 24 에 붙음, 건설 범위도 y -65 까지 (줄기 끝 덮음).
#   로보포트는 기지 망 재고 (저장 상자 (59.5,-14.5) 2 개) 에서 1, 저장 상자는 손제작 (강철 상자 + 회로 3 + 고급 1).
PORT2 = (394.0, -120.0)
STORE2_TRY = [(391.5, -117.5), (391.5, -122.5), (397.5, -116.5), (397.5, -123.5), (390.5, -120.5)]
# 12:2x 셋째 넣을 곳 - 첫 포트 물류 범위 동쪽 (줄기 끝 (382,-98) 에 침 하나가 남아 첫 상자 (395.5,-150.5) 는 54 칸 = 적 문에 걸림)
NE_TRY = [(418.5, -160.5), (418.5, -158.5), (416.5, -160.5), (420.5, -156.5)]

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {}
  -- 13:4x 북쪽 포트 (398,-150) 가 부서짐 → 전초 망은 서쪽 문 · 남쪽 · 북쪽 포트 중 살아 있는 것으로 찾는다
  local en = s.find_logistic_network_by_position({347, -103}, f) or s.find_logistic_network_by_position({394, -120}, f)
    or s.find_logistic_network_by_position({%f, %f}, f)
  if en then
    out.east = {id = en.network_id, yellow = en.get_item_count('firearm-magazine'), pierce = en.get_item_count('piercing-rounds-magazine'),
                repair = en.get_item_count('repair-pack'), robots = en.all_construction_robots}
  end
  local low, empty, tot, dmg = 0, 0, 0, 0
  for _, t in pairs(s.find_entities_filtered{area = {{340, -215}, {460, -95}}, name = 'gun-turret', force = f}) do
    local n = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
    tot = tot + 1 if n < 10 then low = low + 1 end if n == 0 then empty = empty + 1 end
  end
  for _, e in pairs(s.find_entities_filtered{area = {{340, -215}, {460, -95}}, force = f}) do
    if e.health and e.max_health and e.max_health > 0 and e.health < e.max_health then dmg = dmg + 1 end
  end
  out.turrets = {tot = tot, low = low, empty = empty}
  local foe = 0
  for _, p in pairs({{%f, %f}, {395, -110}, {388, -124}, {420, -172}, {420, -136}}) do
    foe = math.max(foe, s.count_entities_filtered{position = p, radius = %d, force = 'enemy', type = 'unit'})
  end
  out.foe = foe
  local p2 = s.find_entities_filtered{name = 'roboport', position = {%f, %f}, radius = 1, force = f}[1]
  local st2 = p2 and s.find_entities_filtered{name = 'storage-chest', position = {%f, %f}, radius = 7, force = f}[1]
  out.port2 = p2 and true or false
  if st2 then out.store2 = {st2.position.x, st2.position.y} end
  out.foe2 = s.count_entities_filtered{position = {%f, %f}, radius = %d, force = 'enemy', type = 'unit'}
    + s.count_entities_filtered{position = {394, -100}, radius = %d, force = 'enemy', type = 'unit'}
  local spot
  if not st2 then
    for _, c in pairs(helpers.json_to_table('%s')) do
      if not spot and s.can_place_entity{name = 'storage-chest', position = c, force = f, build_check_type = defines.build_check_type.manual} then spot = c end
    end
  end
  out.store2_spot = spot
  local function foe_at(x, y) return s.count_entities_filtered{position = {x, y}, radius = %d, force = 'enemy', type = 'unit'} end
  out.foe_store = foe_at(%f, %f)
  local NE = helpers.json_to_table('%s')
  local ne = s.find_entities_filtered{name = 'storage-chest', position = NE[1], radius = 4, force = f}[1]
  if ne then out.ne = {ne.position.x, ne.position.y} out.foe_ne = foe_at(ne.position.x, ne.position.y)
  else
    for _, c in pairs(NE) do
      if not out.ne_spot and s.find_logistic_network_by_position(c, f) == en and s.can_place_entity{name = 'storage-chest', position = c, force = f, build_check_type = defines.build_check_type.manual} then
        out.ne_spot = c out.foe_ne = foe_at(c[1], c[2])
      end
    end
  end
  out.port2_ok = (not p2) and s.can_place_entity{name = 'roboport', position = {%f, %f}, force = f, build_check_type = defines.build_check_type.manual}
  out.damaged = dmg
  local p3 = s.find_entities_filtered{name = 'roboport', position = {%f, %f}, radius = 1, force = f}[1]
  out.port3 = p3 and true or false
  out.port3_ok = (not p3) and s.can_place_entity{name = 'roboport', position = {%f, %f}, force = f, build_check_type = defines.build_check_type.manual}
  local st3 = s.find_entities_filtered{name = 'storage-chest', position = {%f, %f}, radius = 7, force = f}[1]
  if st3 then out.store3 = {st3.position.x, st3.position.y} else
    for _, c in pairs(helpers.json_to_table('%s')) do
      if not out.store3_spot and s.can_place_entity{name = 'storage-chest', position = c, force = f, build_check_type = defines.build_check_type.manual} then out.store3_spot = c end
    end
  end
  out.foe3 = foe_at(%f, %f)
  local hub = s.find_entities_filtered{position = {%f, %f}, radius = 0.3, type = 'container'}[1]
  out.hub_iron = hub and hub.get_item_count('iron-plate') or 0
  local mn = s.find_logistic_network_by_position({66.5, -15.5}, f)
  out.main_repair = mn and mn.get_item_count('repair-pack') or 0
  local best
  if mn then
    for _, c in pairs(mn.providers) do
      if c.type == 'logistic-container' then
        local k = c.get_item_count('repair-pack')
        if k > 0 and (not best or k > best[3]) then best = {c.position.x, c.position.y, k} end
      end
    end
  end
  out.rep_src = best
  out.stock = {}
  for name, v in pairs(helpers.json_to_table('%s')) do
    local src
    if mn then
      for _, c in pairs(mn.providers) do
        if c.type == 'logistic-container' then
          local h = c.get_item_count(name)
          if h > 0 and (not src or h > src[3]) then src = {c.position.x, c.position.y, h} end
        end
      end
      for _, c in pairs(mn.storages) do
        local h = c.get_item_count(name)
        if h > 0 and (not src or h > src[3]) then src = {c.position.x, c.position.y, h} end
      end
    end
    out.stock[name] = {east = en and en.get_item_count(name) or 0, main = mn and mn.get_item_count(name) or 0, src = src}
  end
  do  -- 15:5x ammoplus2_24 둘째 블록 피어싱 B 결과 = 동쪽 몫 쇠 상자 (망 밖)
    local rc = s.find_entities_filtered{name = 'steel-chest', position = {34.5, -50.5}, radius = 0.3}[1]
    out.reserve = rc and rc.get_item_count('piercing-rounds-magazine') or 0
  end
  out.srcs = {}
  for _, name in pairs({'steel-plate', 'stone-brick', 'iron-gear-wheel', 'electronic-circuit', 'copper-plate'}) do
    local src
    if mn then
      for _, c in pairs(mn.providers) do
        if c.type == 'logistic-container' then
          local h = c.get_item_count(name)
          if h > 0 and (not src or h > src[3]) then src = {c.position.x, c.position.y, h} end
        end
      end
      for _, c in pairs(mn.storages) do
        local h = c.get_item_count(name)
        if h > 0 and (not src or h > src[3]) then src = {c.position.x, c.position.y, h} end
      end
    end
    if src then src[4] = mn.get_item_count(name) out.srcs[name] = src end
  end
  -- 전초 유령 재료: 유령 수 - 전초 망 재고, 기지 망에서 가장 많이 든 상자
  local A = helpers.json_to_table('%s')
  local need = {}
  for _, g in pairs(s.find_entities_filtered{area = {{340, -215}, {460, -95}}, type = 'entity-ghost', force = f}) do
    local it = g.ghost_prototype.items_to_place_this and g.ghost_prototype.items_to_place_this[1]
    if it and A[it.name] then need[it.name] = (need[it.name] or 0) + (it.count or 1) end
  end
  out.kit = {}
  out.short = {}
  for name, k in pairs(need) do
    local short = k - (en and en.get_item_count(name) or 0)
    if short > 0 then out.short[name] = short end
    if short > 0 and mn then
      local src
      for _, c in pairs(mn.providers) do
        if c.type == 'logistic-container' then
          local h = c.get_item_count(name)
          if h > 0 and (not src or h > src[3]) then src = {c.position.x, c.position.y, h} end
        end
      end
      for _, c in pairs(mn.storages) do
        local h = c.get_item_count(name)
        if h > 0 and (not src or h > src[3]) then src = {c.position.x, c.position.y, h} end
      end
      local n = src and math.min(short, A[name][1], src[3], mn.get_item_count(name) - A[name][2]) or 0
      if n > 0 then out.kit[#out.kit + 1] = {name, n, src[1], src[2]} end
    end
  end
  return out
end)()""" % (*PORT, *PORT, DANGER_R, *PORT2, *PORT2, *PORT2, DANGER_R, DANGER_R, json.dumps([list(c) for c in STORE2_TRY]),
              DANGER_R, *STORE, json.dumps([list(c) for c in NE_TRY]), *PORT2,
              *PORT3, *PORT3, *PORT3, json.dumps([list(c) for c in STORE3_TRY]), PORT3[0] - 4, PORT3[1] + 2,
              *HUB_IRON, json.dumps(STOCK), json.dumps(KIT))


def body(ai, who):
    for r in ai.list():
        if r["name"] == who:
            return r
    return None


def idle(ai, who):
    for r in ai.list():
        if r["name"] == who:
            return r.get("alive", True) and not (r.get("current") or r.get("queued"))
    return False


def trip(ai, who, st):
    """가방에 이미 든 것 (지난 바퀴에 적 때문에 물린 것) 은 빼고 모자란 만큼만 챙긴다. 탄창은 허브에서 다 만든 뒤 (wait block) 떠난다."""
    east = st.get("east") or {}
    ammo = int(east.get("yellow", 0)) + int(east.get("pierce", 0))
    rep = int(east.get("repair", 0))
    try:
        bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    except RconError:
        bag = {}
    plan, give = [], {}
    stock = st.get("stock") or {}
    # 늘 채워 둘 것 (피어싱 · 포탑 · 벽) - 기지 망 가장 많이 든 상자에서
    for name, (low, per, keep) in STOCK.items():
        v = stock.get(name) or {}
        src = v.get("src")
        src = list(src.values()) if isinstance(src, dict) else src
        if int(v.get("east", 0)) >= low:
            continue
        have = bag.get(name, 0)
        k = min(max(0, per - have), int(v.get("main", 0)) - keep, int(src[2]) if src else 0)
        if name == "piercing-rounds-magazine" and int(st.get("reserve", 0)) >= RESERVE_MIN:
            src = [EAST_RESERVE[0], EAST_RESERVE[1], int(st["reserve"])]
            k = min(max(0, per - have), src[2])
        if k >= 5:
            plan += [("walk_to", {"x": src[0], "y": src[1] + 1.5}), ("take", {"name": name, "x": src[0], "y": src[1], "count": k})]
        else:
            k = 0
        if have + k > 0:
            give[name] = have + k
    robots_east = int(east.get("robots", 0)) if east else 0
    craft_rob = 0
    if robots_east + bag.get("construction-robot", 0) < ROBOT_MIN:
        craft_rob = ROBOT_TRIP
        plan += [("walk_to", {"x": FRAMES[0], "y": FRAMES[1] + 1.5}), ("take", {"name": "flying-robot-frame", "x": FRAMES[0], "y": FRAMES[1], "count": craft_rob}),
                 ("walk_to", {"x": CIRCUITS[0], "y": CIRCUITS[1] + 1.5}), ("take", {"name": "electronic-circuit", "x": CIRCUITS[0], "y": CIRCUITS[1], "count": 2 * craft_rob}),
                 ("craft", {"recipe": "construction-robot", "count": craft_rob, "wait": "block"})]
    pmain = int((stock.get("piercing-rounds-magazine") or {}).get("main", 0))
    if ammo < AMMO_LOW and pmain < PIERCE_MAIN_KEEP:
        have = bag.get("firearm-magazine", 0)
        n = min(max(0, AMMO_TRIP - have), max(0, int(st.get("hub_iron", 0)) - HUB_KEEP) // 4)
        if n >= 20:
            plan += [("walk_to", {"x": HUB_IRON[0], "y": HUB_IRON[1] + 1.5}),
                     ("take", {"name": "iron-plate", "x": HUB_IRON[0], "y": HUB_IRON[1], "count": n * 4}),
                     ("craft", {"recipe": "firearm-magazine", "count": n, "wait": "block"})]
        else:
            n = 0
        if have + n >= 20:
            give["firearm-magazine"] = have + n
    src = st.get("rep_src")
    src = list(src.values()) if isinstance(src, dict) else src
    if rep < REP_LOW:
        have = bag.get("repair-pack", 0)
        k = min(REP_TRIP - have, int(st.get("main_repair", 0)) - REP_MAIN_KEEP, int(src[2]) if src else 0)
        if k >= 10:
            plan += [("walk_to", {"x": src[0], "y": src[1] + 1.5}),
                     ("take", {"name": "repair-pack", "x": src[0], "y": src[1], "count": k})]
        else:
            k = 0
        if have + k > 0:
            give["repair-pack"] = have + k
    kit = st.get("kit") or []
    kit = list(kit.values()) if isinstance(kit, dict) else kit
    taken = {}
    for q in kit:
        q = list(q.values()) if isinstance(q, dict) else q
        name, n, x, y = q[0], int(q[1]), q[2], q[3]
        if name in give:              # STOCK 이 이미 챙김 - 유령 몫만큼 더
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": name, "x": x, "y": y, "count": n})]
            give[name] += n
            taken[name] = give[name]
            continue
        have = bag.get(name, 0)
        more = max(0, n - have)
        if more > 0:
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": name, "x": x, "y": y, "count": more})]
        taken[name] = have + more
        give[name] = give.get(name, 0) + have + more
    # 기지 망에 모자라 못 챙긴 것은 손제작 (허브 철 · 구리, 가방 나무)
    short = st.get("short") or {}
    fe = cu = 0
    crafts = []
    for name, k in short.items():
        if name not in CRAFT:
            continue
        rest = int(k) - taken.get(name, bag.get(name, 0))
        if rest <= 0:
            continue
        i, c, per = CRAFT[name]
        runs = -(-rest // per)
        if name == "small-electric-pole" and bag.get("wood", 0) < runs:
            continue
        fe += i * runs
        cu += c * runs
        crafts.append((name, runs, runs * per))
    if crafts and fe <= max(0, int(st.get("hub_iron", 0)) - HUB_KEEP - (give.get("firearm-magazine", 0) - bag.get("firearm-magazine", 0)) * 4):
        if fe:
            plan += [("walk_to", {"x": HUB_IRON[0], "y": HUB_IRON[1] + 1.5}), ("take", {"name": "iron-plate", "x": HUB_IRON[0], "y": HUB_IRON[1], "count": fe})]
        if cu:
            plan += [("walk_to", {"x": HUB_CU[0], "y": HUB_CU[1] + 1.5}), ("take", {"name": "copper-plate", "x": HUB_CU[0], "y": HUB_CU[1], "count": cu})]
        for name, runs, made in crafts:
            plan.append(("craft", {"recipe": name, "count": runs, "wait": "block"}))
            give[name] = give.get(name, 0) + made
    # 드릴 · 강철로 · 인서터 · 빠른 벨트 손제작 (재료 상자에서, 기지 망에 SRC_KEEP 남김)
    srcs = {k: (list(v.values()) if isinstance(v, dict) else v) for k, v in (st.get("srcs") or {}).items()}
    hub_left = max(0, int(st.get("hub_iron", 0)) - HAND_HUB_KEEP - fe - (give.get("firearm-magazine", 0) - bag.get("firearm-magazine", 0)) * 4)
    want_ing = {}
    hand = []
    for name, (ing, cap) in HAND.items():
        rest = min(cap, int(short.get(name, 0)) - taken.get(name, 0) - bag.get(name, 0))
        if rest <= 0:
            continue
        for k, per in ing.items():               # 재료가 모자라면 만들 수 있는 만큼만
            if k == "iron-plate":
                room = hub_left - want_ing.get(k, 0)
            else:
                v = srcs.get(k)
                room = min(int(v[2]), int(v[3]) - SRC_KEEP.get(k, 0)) - want_ing.get(k, 0) if v else 0
            rest = min(rest, room // per)
        if rest <= 0:
            continue
        for k, per in ing.items():
            want_ing[k] = want_ing.get(k, 0) + per * rest
        hand.append((name, rest))
    for k, n in want_ing.items():
        n -= bag.get(k, 0) if k != "iron-plate" else 0
        if n <= 0:
            continue
        x, y = HUB_IRON if k == "iron-plate" else (srcs[k][0], srcs[k][1])
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": k, "x": x, "y": y, "count": n})]
    for name, n in hand:
        plan.append(("craft", {"recipe": name, "count": n, "wait": "block"}))
        give[name] = give.get(name, 0) + n
    # 지난 바퀴에 만들어 두고 못 넣은 것 (가방) 도 넣는다
    for name, k in short.items():
        if name not in give and bag.get(name, 0) > 0:
            give[name] = min(int(k), bag[name])
    if not give:
        return None
    # 넣을 곳 (그 자리 반경 DANGER_R 에 적 0 인 첫 곳): 남쪽 상자 → 첫 상자 → 북동 상자 (없으면 짓기) → 남쪽 포트 · 상자 짓기
    def pl(v):
        return list(v.values()) if isinstance(v, dict) else v
    s2, ne = pl(st.get("store2")), pl(st.get("ne"))
    foe2, foe_s, foe_ne = int(st.get("foe2") or 0), int(st.get("foe_store") or 0), int(99 if st.get("foe_ne") is None else st["foe_ne"])
    drop, key = None, None

    def chest_kit():
        if bag.get("storage-chest", 0) >= 1:
            return []
        return [("walk_to", {"x": 59.5, "y": -13.0}), ("take", {"name": "steel-chest", "x": 59.5, "y": -14.5, "count": 1}),
                ("walk_to", {"x": 31.5, "y": -15.0}), ("take", {"name": "electronic-circuit", "x": 31.5, "y": -16.5, "count": 3}),
                ("walk_to", {"x": 25.5, "y": -8.0}), ("take", {"name": "advanced-circuit", "x": 25.5, "y": -9.5, "count": 1}),
                ("craft", {"recipe": "storage-chest", "count": 1, "wait": "block"})]
    s3 = pl(st.get("store3"))
    foe3 = int(st.get("foe3") or 0)
    # 적이 서쪽 문 60 안에 있어도 «챙기기» (기지 안, 몇 분) 는 시작한다 - 전초로 걷는 동안 적 문 (x > 250 이면 물림) 이 지킨다.
    #   이미 가방에 다 챙겼으면 (피어싱 100+) 적이 빠질 때까지 허브에서 기다린다.
    if (foe3 == 0 or bag.get("piercing-rounds-magazine", 0) < 100) and (s3 or (st.get("store3_spot") and (st.get("port3") or st.get("port3_ok")))):
        if s3:
            drop = (s3[0], s3[1])
            plan.append(("walk_to", {"x": PORT3[0] - 4.0, "y": PORT3[1] + 2.0}))
        else:
            sp = pl(st["store3_spot"])
            pre = []
            if not st.get("port3") and bag.get("roboport", 0) < 1:
                pre += [("walk_to", {"x": 59.5, "y": -13.0}), ("take", {"name": "roboport", "x": 59.5, "y": -14.5, "count": 1})]
            plan = pre + chest_kit() + plan
            plan.append(("walk_to", {"x": PORT3[0] - 4.0, "y": PORT3[1] + 2.0}))
            if not st.get("port3"):
                plan.append(("build", {"name": "roboport", "x": PORT3[0], "y": PORT3[1], "direction": 0}))
            plan.append(("build", {"name": "storage-chest", "x": sp[0], "y": sp[1], "direction": 0}))
            drop = (sp[0], sp[1])
        key = "west"
    elif s2 and foe2 == 0:
        drop, key = (s2[0], s2[1]), "south"
        plan.append(("walk_to", {"x": drop[0] + 1.5, "y": drop[1] + 1.5}))
    elif foe_s == 0:
        drop, key = STORE, "north"
        plan.append(("walk_to", {"x": PORT[0] - 3.5, "y": PORT[1] + 3.5}))
    elif (ne or st.get("ne_spot")) and foe_ne == 0:
        if ne:
            drop = (ne[0], ne[1])
            plan.append(("walk_to", {"x": drop[0] + 1.5, "y": drop[1] + 1.5}))
        else:
            sp = pl(st["ne_spot"])
            plan = chest_kit() + plan
            plan += [("walk_to", {"x": sp[0] + 1.5, "y": sp[1] + 1.5}), ("build", {"name": "storage-chest", "x": sp[0], "y": sp[1], "direction": 0})]
            drop = (sp[0], sp[1])
        key = "ne"
    elif not s2 and foe2 == 0 and st.get("store2_spot") and (st.get("port2") or st.get("port2_ok")):
        sp = pl(st["store2_spot"])
        pre = []
        if not st.get("port2") and bag.get("roboport", 0) < 1:
            pre += [("walk_to", {"x": 59.5, "y": -13.0}), ("take", {"name": "roboport", "x": 59.5, "y": -14.5, "count": 1})]
        plan = pre + chest_kit() + plan
        plan.append(("walk_to", {"x": PORT2[0] - 3.0, "y": PORT2[1] + 3.5}))
        if not st.get("port2"):
            plan.append(("build", {"name": "roboport", "x": PORT2[0], "y": PORT2[1], "direction": 0}))
        plan.append(("build", {"name": "storage-chest", "x": sp[0], "y": sp[1], "direction": 0}))
        drop, key = (sp[0], sp[1]), "south"
    if not drop:
        return None
    # 로봇 먼저 (서쪽 문 포트 로봇 칸에) - 포트가 서야 넣을 수 있다
    nrob = craft_rob + bag.get("construction-robot", 0)
    if nrob and key == "west":
        plan.append(("insert", {"name": "construction-robot", "x": PORT3[0], "y": PORT3[1], "count": nrob}))
    # 포탑 · 수리팩 먼저 (로봇이 유령 · 수리를 바로 시작), 탄창은 끝에
    for name in sorted(give, key=lambda n: n == "firearm-magazine"):
        plan.append(("insert", {"name": name, "x": drop[0], "y": drop[1], "count": give[name]}))
    plan.append(("walk_to", {"x": HOME[0], "y": HOME[1]}))
    detached.mark([who], OWNER, minutes=15)
    submit(ai, who, plan, strict=False)
    return give, key


def north_def(ai):
    """북쪽 끝 포탑 유령 (can_place manual 통과 · 같은 이름 선 칸 · 유령 건너뜀). 전초 로봇이 저장 상자 포탑으로 짓는다."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local same = s.count_entities_filtered{position = p, radius = 0.9, name = 'gun-turret'} + s.count_entities_filtered{position = p, radius = 0.9, ghost_name = 'gun-turret'}
        if same > 0 then out[#out+1] = p[1] .. ',' .. p[2] .. ' skip'
        elseif s.can_place_entity{name = 'gun-turret', position = p, force = f, build_check_type = defines.build_check_type.manual} then
          s.create_entity{name = 'entity-ghost', inner_name = 'gun-turret', position = p, force = f}
          out[#out+1] = p[1] .. ',' .. p[2] .. ' ghost'
        else out[#out+1] = p[1] .. ',' .. p[2] .. ' blocked' end
      end
      return out
    end)()""" % json.dumps([list(p) for p in NORTH_DEF]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--who", default="echo")
    ap.add_argument("--every", type=int, default=20)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--north-def", action="store_true", help="북쪽 끝 포탑 유령 둘 놓고 끝")
    a = ap.parse_args()
    os.environ[detached.ENV] = OWNER
    ai = None
    state = {}
    if a.north_def:
        print(north_def(AIBridge()))
        return 0
    while True:
        try:
            ai = ai or AIBridge()
            st = ai.lua(LUA)
            line = {k: st.get(k) for k in ("east", "turrets", "foe", "foe2", "foe3", "port3", "store3", "stock", "foe_store", "foe_ne", "port2", "store2", "ne", "damaged", "hub_iron", "main_repair", "kit", "short")}
            b = body(ai, a.who) or {}
            busy = bool(b.get("current") or b.get("queued"))
            ours = busy and detached.owner(a.who) == OWNER
            # 가는 곳의 적: 남쪽으로 가는 바퀴는 foe2 만, 첫 상자로 가는 바퀴는 foe 도 본다
            dk = {"south": "foe2", "north": "foe_store", "ne": "foe_ne", "west": "foe3"}.get(state.get("drop", "north"), "foe_store")
            danger = int(st.get(dk) or 0) > 0
            if ours and danger and float(b.get("x", 0)) > 250:
                if not a.dry:
                    ai.agent(a.who).cancel()
                    submit(ai, a.who, [("walk_to", {"x": HOME[0], "y": HOME[1]})], strict=False)
                line["retreat"] = [b.get("x"), b.get("y")]
            elif not a.dry and not busy and b.get("alive", True) and detached.mine(a.who):
                r = trip(ai, a.who, st)
                if r:
                    line["trip"] = r[0]
                    state["drop"] = r[1]
                elif float(b.get("x", 0)) > 250:
                    submit(ai, a.who, [("walk_to", {"x": HOME[0], "y": HOME[1]})], strict=False)
            print(time.strftime("%H:%M:%S"), json.dumps(line, ensure_ascii=False), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

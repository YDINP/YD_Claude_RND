"""석탄 광맥 (-83,-278) 방어 보강 - 사용자 17:3x «석탄 쪽 추가 채굴지 방어선은 좀 더 보완해야 할 듯».

이 광맥은 곧 발전소 석탄의 주 공급원 (docs/outpost-mining-plan-run23.md). 17:4x 현황: 기관총 3 · 레이저 3 · 벽 0,
북쪽 변 (광석 y -295 까지) 은 포탑 0. 둥지는 북 · 북서 (-150,-410 무리 d 140~160, -53,-447 d 170), 적 유닛 24 가
그 둥지 둘레, 시체 N 17 · NW 3 · W 3 -> 공격은 북에서 온다. 진화 0.79.
    북 줄 y=-298: 포탑 8 (x -106..-71, 5 칸 간격, 레이저 · 기관총 번갈아), 사이 작은 전봇대 y=-297.5 (공급 칸이 양쪽 포탑과 겹침)
        중계 전봇대 (-83.5,-291.5) -> 기존 coalnet 전봇대 (-83.5,-285.5)
    서 x=-107: 레이저 (-107,-292) · 기관총 (-107,-285), 전봇대 (-104.5,-290.5)
    동 x=-69 : 레이저 (-69,-290) · 기관총 (-69,-282), 전봇대 (-71.5,-292.5)
    -> 새 12 (레이저 6 · 기관총 6) + 기존 6 = 18. 포탑은 모두 광석 밖.
    돌 벽 한 겹: 북 y=-302.5 (x -110.5..-66.5) · 서 x=-110.5 (y -301.5..-283.5). 망 벽 5 뿐 -> 캐릭터가 망 벽돌로 손 제작.
    로보포트 섬 (-74,-277) + 전봇대 (-77.5,-279.5) + 저장 상자 (-71.5,-277.5): 가장 가까운 망 2 로보포트 (55,-271) 가 145 칸이라
        망 2 와 안 이어진다 -> 떨어진 섬. 건설 로봇 10 (망 2 로보포트에서 옮김) · 수리팩 (캐릭터 손 제작) · 상자에 예비 탄 · 포탑 · 벽.
        섬이 생기면 ammofeed23 의 «건설 범위 밖» 조건에서 빠지므로 ammofeed23 을 «탄 있는 망 범위 밖» 으로 고쳤다.
짓기는 캐릭터 (outpostcrew23.run_job, 쉬는 사람만), 재료는 망 2 저장 -> 가방 (옮김).

    python -u scripts/coalguard23.py check [tur|wall|port]
    python -u scripts/coalguard23.py craft          # 벽 · 수리팩 손 제작 -> 망 2
    python -u scripts/coalguard23.py build tur|wall|port
    python -u scripts/coalguard23.py stock          # 섬 로보포트에 로봇 · 수리팩, 상자에 예비품 (옮김)
    python -u scripts/coalguard23.py status
로그 state/coalguard23.log
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import coalline23 as cl  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "coalguard23.log")
FM = "firearm-magazine"
C = (-88, -284)                       # 현장 중심
ROBO, POLE_R, CHEST = (-74, -277), (-77.5, -279.5), (-71.5, -277.5)
ENTRY = (-88.5, -270.5)
N_WALL = 0                            # wall() 로 센다
ROBOTS, PACKS = 10, 30


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cl.log = log


def tur():
    b = []
    for k, x in enumerate(range(-106, -70, 5)):           # -106 .. -71
        b.append(("laser-turret" if k % 2 == 0 else "gun-turret", x, -298, "north"))
    for x in (-103.5, -98.5, -93.5, -88.5, -83.5, -78.5, -73.5):
        b.append(("small-electric-pole", x, -297.5, "north"))
    b.append(("small-electric-pole", -83.5, -291.5, "north"))
    b += [("laser-turret", -107, -292, "north"), ("gun-turret", -107, -285, "north"), ("small-electric-pole", -104.5, -290.5, "north"),
          ("laser-turret", -69, -290, "north"), ("gun-turret", -69, -282, "north"), ("small-electric-pole", -71.5, -292.5, "north")]
    return b


def wall():
    b = [("stone-wall", x + 0.5, -302.5, "north") for x in range(-111, -66)]      # -110.5 .. -66.5
    b += [("stone-wall", -110.5, y + 0.5, "north") for y in range(-302, -283)]    # -301.5 .. -283.5
    return b


def port():
    return [("small-electric-pole", POLE_R[0], POLE_R[1], "north"), ("roboport", ROBO[0], ROBO[1], "north"),
            ("storage-chest", CHEST[0], CHEST[1], "north")]


cl.PARTS.update({"tur": tur, "wall": wall, "port": port})
cl.SIZE.update({"stone-wall": 0.45, "roboport": 1.95, "storage-chest": 0.45})


def chops(ai, builds):
    """발밑 + 이웃 칸 나무 (벽은 줄이라 옆 나무도 걸린다)."""
    if not builds:
        return []
    size = {"roboport": 2.2, "laser-turret": 1.2, "gun-turret": 1.2}
    rows = ", ".join("{'%s', %s, %s, %s}" % (b[0], b[1], b[2], size.get(b[0], 0.9)) for b in builds)
    import outpostcrew23 as crew
    r = ai.lua(crew.TREES % rows)
    v = list(r.values()) if isinstance(r, dict) else list(r or [])
    seen, out = set(), []
    for t in v:
        k = (round(t[0], 1), round(t[1], 1))
        if k not in seen:
            seen.add(k)
            out.append(("chop", {"x": t[0], "y": t[1], "count": 1}))
    return out


NET = """(function() local n = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player')
  local r = game.surfaces[1].find_entities_filtered{name = 'roboport', position = {-74, -277}, radius = 1}[1]
  local p = r and r.get_inventory(defines.inventory.roboport_material).get_item_count('repair-pack') or 0
  return {wall = n.get_item_count('stone-wall'), pack = n.get_item_count('repair-pack') + p, brick = n.get_item_count('stone-brick')} end)()"""

TO_PORT = """(function() @BODY@ local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
  local r = s.find_entities_filtered{name = 'roboport', position = {%d, %d}, radius = 1}[1] if not r then return {err = 'no port'} end
  local m = b.get_main_inventory() local k = m.get_item_count('repair-pack') if k == 0 then return {put = 0} end
  local put = r.get_inventory(defines.inventory.roboport_material).insert{name = 'repair-pack', count = k}
  if put > 0 then m.remove{name = 'repair-pack', count = put} end return {put = put} end)()"""


def craft(ai):
    import orders
    import outpostcrew23 as crew
    import detached
    import coalnet23 as cn
    have = ai.lua(NET)
    walls = max(0, len(crew.missing(ai, wall())) - int(have.get("wall", 0)))
    packs = max(0, PACKS - int(have.get("pack", 0)))
    if not walls and not packs:
        log("벽 · 수리팩 망에 있음 %s" % have)
        return True
    who = crew.free_crew(ai, 1)
    if not who:
        log("쉬는 사람 없음")
        return False
    who = who[0]
    detached.mark([who], "coalguard23", minutes=10)
    bag = crew.load_bag(ai, who, {"stone-brick": 5 * walls, "iron-plate": 3 * packs + 10, "copper-plate": 2 * packs})
    log("%s 가방 %s -> 벽 %d · 수리팩 %d 손 제작" % (who, bag.get("bag"), walls, packs))
    steps = []
    if walls:
        steps.append(("craft", {"recipe": "stone-wall", "count": walls, "wait": True}))
    if packs:
        steps.append(("craft", {"recipe": "repair-pack", "count": packs, "wait": True}))
    orders.submit(ai, who, steps, strict=False)
    # busy() 는 손 제작 대기열을 안 본다 (17:38 8 초 만에 «끝» -> 재료를 되돌리려 함) -> 대기열 크기를 직접 본다
    from proboport23 import BODY
    q = "(function() @BODY@ local b = body('%s') return {q = b and b.crafting_queue_size or -1} end)()".replace("@BODY@", BODY) % who
    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(8)
        if int(ai.lua(q).get("q", 0)) <= 0 and not crew.busy(ai, [who]):
            break
    # 수리팩은 망 2 에 넣으면 기지 로봇이 바로 써 버린다 (17:47 16 개 -> 0) -> 섬 로보포트로 바로
    ai.lua(TO_PORT.replace("@BODY@", BODY) % (who, ROBO[0], ROBO[1]))
    r = cn.bag_to_net(ai, who, ["stone-wall", "repair-pack", "stone-brick", "iron-plate", "copper-plate",
                                "electronic-circuit", "copper-cable", "iron-gear-wheel"])
    detached.release([who])
    log("제작 뒤 가방 -> 망 %s · 망 %s" % (r, ai.lua(NET)))
    return True


def build(ai, part):
    import outpostcrew23 as crew
    import coalnet23 as cn
    import detached
    b = cl.PARTS[part]()

    def inserts_for(ch):
        return [(FM, x, y, 30) for n, x, y, *_ in ch if n == "gun-turret"]
    n = {"tur": 3, "wall": 4, "port": 1}[part]
    ok = crew.run_job(ai, b, inserts_for, ENTRY, "coalguard23", log, crew_n=n, rounds=5,
                      pre_for=lambda ch: chops(ai, ch))
    # unload_bag 목록에 벽 · 로보포트 · 저장 상자가 없다 -> 남은 것 망으로
    for w in crew.CREW:
        if detached.owner(w) not in (None, "coalguard23") or crew.busy(ai, [w]):
            continue
        try:
            r = cn.bag_to_net(ai, w, ["stone-wall", "roboport", "storage-chest", "laser-turret"])
            if r and not r.get("dead"):
                log("%s 가방 남은 것 -> 망 %s" % (w, r))
        except Exception:  # noqa: BLE001
            pass
    log("%s 캐릭터 건설 %s" % (part, "완료" if ok else "미완"))
    return ok


# 섬 채우기: 로봇은 망 2 로보포트 창고에서 (Guiltyring 것 제외), 나머지는 망 2 저장에서 «옮김»
STOCK = """(function() local s = game.surfaces[1] local o = {}
  local r = s.find_entities_filtered{name = 'roboport', position = {%d, %d}, radius = 1}[1]
  local ch = s.find_entities_filtered{name = 'storage-chest', position = {%s, %s}, radius = 0.6}[1]
  if not (r and ch) then return {err = 'no port/chest'} end
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local rb = r.get_inventory(defines.inventory.roboport_robot)
  local need = %d - rb.get_item_count('construction-robot')
  o.robots = 0
  if need > 0 then
    for _, p in pairs(net.cells) do local e = p.owner
      if need <= 0 then break end
      if e.name == 'roboport' and not (e.last_user and e.last_user.name == 'Guiltyring') then
        local inv = e.get_inventory(defines.inventory.roboport_robot)
        local k = math.min(need, inv.get_item_count('construction-robot'))
        if k > 0 then local put = rb.insert{name = 'construction-robot', count = k}
          if put > 0 then inv.remove{name = 'construction-robot', count = put} need = need - put o.robots = o.robots + put end end
      end
    end
  end
  local function mv(name, inv, want, keep)
    local k = math.min(want - inv.get_item_count(name), net.get_item_count(name) - keep)
    if k <= 0 then return 0 end
    k = net.remove_item{name = name, count = k}
    local put = inv.insert{name = name, count = k}
    if put < k then net.insert({name = name, count = k - put}, 'storage') end
    o[name] = (o[name] or 0) + put return put
  end
  mv('repair-pack', r.get_inventory(defines.inventory.roboport_material), %d, 0)
  local ci = ch.get_inventory(defines.inventory.chest)
  mv('firearm-magazine', ci, 100, 300)
  mv('gun-turret', ci, 2, 10) mv('laser-turret', ci, 2, 10) mv('stone-wall', ci, 20, 0)
  o.net_id = r.logistic_network and r.logistic_network.network_id or -1
  return o end)()"""


def stock(ai):
    r = ai.lua(STOCK % (ROBO[0], ROBO[1], CHEST[0], CHEST[1], ROBOTS, PACKS))
    log("섬 채움 %s" % r)
    return r


STATUS = """(function() local s = game.surfaces[1] local o = {gun = 0, laser = 0, laser_ok = 0, wall = 0, ammo = {}, hurt = {}}
  local C = {%d, %d}
  for _, e in pairs(s.find_entities_filtered{type = {'ammo-turret', 'electric-turret', 'wall'}, force = 'player', position = C, radius = 35}) do
    if e.name == 'gun-turret' then o.gun = o.gun + 1 o.ammo[#o.ammo + 1] = e.get_inventory(defines.inventory.turret_ammo).get_item_count()
    elseif e.name == 'laser-turret' then o.laser = o.laser + 1
      if e.is_connected_to_electric_network() and e.energy > 0 then o.laser_ok = o.laser_ok + 1 end
    elseif e.name == 'stone-wall' then o.wall = o.wall + 1 end
    if e.health < e.max_health then o.hurt[#o.hurt + 1] = e.name .. '@' .. e.position.x .. ',' .. e.position.y .. ':' .. math.floor(e.health) end
  end
  o.drills = s.count_entities_filtered{name = 'electric-mining-drill', position = C, radius = 35}
  local cn = s.find_logistic_networks_by_construction_area(C, 'player') o.cn = #cn
  local r = s.find_entities_filtered{name = 'roboport', position = {%d, %d}, radius = 1}[1]
  if r then local n = r.logistic_network
    o.port = {energy = math.floor(r.energy), robots = n and n.all_construction_robots or 0, packs = n and n.get_item_count('repair-pack') or 0,
              net = n and n.network_id or -1, ammo = n and n.get_item_count('firearm-magazine') or 0} end
  o.units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = C, radius = 60}
  return o end)()"""


def status(ai):
    r = ai.lua(STATUS % (C[0], C[1], ROBO[0], ROBO[1]))
    for k in ("ammo", "hurt"):
        v = r.get(k) or {}
        r[k] = list(v.values()) if isinstance(v, dict) else v
    log("상태 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "craft", "build", "stock", "status"])
    ap.add_argument("part", nargs="?")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        for p in ([a.part] if a.part else ("tur", "wall", "port")):
            cl.check(ai, p)
    elif a.cmd == "craft":
        craft(ai)
    elif a.cmd == "build":
        build(ai, a.part)
    elif a.cmd == "stock":
        stock(ai)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

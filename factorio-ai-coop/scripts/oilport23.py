"""남쪽 유전 로보포트 + 수리팩 + 탄 상자 - delta 가 oilexp23 와 같은 회랑으로 걸어가 설치한다.

    사용자 (2026-09-27): "남쪽에 원유채굴지에도 로보포트 + 수리킷 + 탄약박스 추가해둬야할듯."

유전은 기지 로봇망에서 멀다. 망/허브에 roboport·storage-chest 완제품이 없어 delta 가 손제작한다.
  roboport  = 강철 45 + 톱니 45 + 고급회로 45  (고급회로는 로보포트 조립기 (34.5,-38.5) 입력칸 90 에서 47)
  storage-chest = 강철 상자 + 회로 3 + 고급회로 1
  repair-pack 100, firearm-magazine 40 도 손제작. 건설 로봇 10 은 delta 가방에 이미 있다.
배치: 로보포트 (-64,383) (포탑 x=-60 뒤, 관 x=-67.5 동쪽), 전봇대 (-66.5,381.5) → 기존 (-72.5,383.5) 6.3칸,
      저장 상자 (-66.5,384.5). 물류 반경 25 에 포탑 3대·상자, 건설 반경 55 에 펌프잭 4대 전부.

안전·이동·도주는 oilexp23 의 walk/guard/run 을 그대로 쓴다 (부활 안 함, 체력 150 미만 중단·귀환).

    python -u scripts/oilport23.py check
    python -u scripts/oilport23.py go
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(__file__)
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import oilexp23 as ox  # noqa: E402

WHO = ox.WHO
OWNER = "oilport23"
ox.LOG = os.path.join(HERE, "..", "state", "oilport23.log")
log = ox.log

ROBO = (-64, 383)
POLE = (-66.5, 381.5)
CHEST = (-66.5, 384.5)
TURRETS = ox.TURRETS
TURRET_TOPUP = 30            # 20 → 50
ROBOTS = 10
PACKS_IN_PORT = 20

TAKES_WEST = [("iron-plate", (-81.5, -52.5), 500),
              ("steel-plate", (-73.5, -52.5), 12),
              ("firearm-magazine", (-84.5, -68.5), 120),
              ("piercing-rounds-magazine", (-60.5, -33.5), 20)]
ADV = ("advanced-circuit", (34.5, -38.5), 47)   # 로보포트 조립기 입력칸
COPPER = ("copper-plate", (-22.5, -8.5), 130)
CRAFTS = [("roboport", 1), ("storage-chest", 1), ("repair-pack", 100), ("firearm-magazine", 40)]

QUEUE = """(function() local s = game.surfaces[1]
  local c = s.find_entities_filtered{name = 'character', position = {%f, %f}, radius = 3}[1]
  return {q = c and c.crafting_queue_size or -1} end)()"""


def craft_wait(ai, timeout=420) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = ox.guard(ai)
        q = ai.lua(QUEUE % (st["x"], st["y"]))["q"]
        if q == 0:
            log(f"  제작 끝 ({time.time() - t0:.0f}s)")
            return
        time.sleep(5)
    log("  제작 대기 시간 초과")


SITE = """(function() local s = game.surfaces[1] local o = {}
  local r = s.find_entities_filtered{name = 'roboport', position = {%d, %d}, radius = 1}[1]
  if r then
    local n = r.logistic_network
    o.robo = {energy = math.floor(r.energy), buffer = math.floor(r.electric_buffer_size or 0),
      robots = r.get_inventory(defines.inventory.roboport_robot).get_item_count(),
      packs = r.get_inventory(defines.inventory.roboport_material).get_item_count(),
      net_robots = n and n.all_construction_robots or 0, net_id = n and n.network_id or -1,
      power_net = r.electric_network_id}
  end
  local c = s.find_entities_filtered{name = 'storage-chest', position = {%f, %f}, radius = 0.6}[1]
  if c then local m = {} for _, it in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do m[it.name] = it.count end o.chest = m end
  local t = {}
  for _, p in pairs({%s}) do
    local e = s.find_entities_filtered{name = 'gun-turret', position = p, radius = 0.8}[1]
    if e then
      local inv = e.get_inventory(defines.inventory.turret_ammo)
      t[#t+1] = string.format('%%.0f,%%.0f ammo=%%d in_net=%%s', e.position.x, e.position.y, inv.get_item_count(),
        tostring(r ~= nil and r.logistic_network ~= nil and r.logistic_network.find_cell_closest_to(e.position) ~= nil
          and r.logistic_cell.is_in_logistic_range(e.position)))
    end
  end
  o.turrets = t
  local j = {}
  for _, e in pairs(s.find_entities_filtered{name = 'pumpjack', position = {-71, 381}, radius = 14}) do
    j[#j+1] = string.format('%%.1f,%%.1f in_cons=%%s', e.position.x, e.position.y,
      tostring(r ~= nil and r.logistic_cell.is_in_construction_range(e.position)))
  end
  o.jacks = j
  return o end)()"""


def site(ai) -> dict:
    r = ai.lua(SITE % (ROBO[0], ROBO[1], CHEST[0], CHEST[1], ", ".join("{%s, %s}" % p for p in TURRETS)))
    for k in ("turrets", "jacks"):
        v = r.get(k) or []
        r[k] = list(v.values()) if isinstance(v, dict) else v
    return r


def go(ai) -> int:
    detached.mark([WHO], owner=OWNER, minutes=60)
    ai.agent(WHO).cancel()
    log("출정 시작 - 재료 준비")
    try:
        prep = [("take", {"name": n, "x": x, "y": y, "count": c}) for n, (x, y), c in TAKES_WEST]
        prep += [("take", {"name": ADV[0], "x": ADV[1][0], "y": ADV[1][1], "count": ADV[2]})]
        prep += [("walk_to", {"x": -24.5, "y": -6.5, "tolerance": 3}),
                 ("take", {"name": COPPER[0], "x": COPPER[1][0], "y": COPPER[1][1], "count": COPPER[2]})]
        prep += [("craft", {"recipe": r, "count": n}) for r, n in CRAFTS]
        ox.run(ai, prep, "준비", 420)
        craft_wait(ai)
        inv = ai.agent(WHO).items()
        keys = ("roboport", "storage-chest", "construction-robot", "repair-pack", "firearm-magazine",
                "piercing-rounds-magazine", "small-electric-pole")
        log(f"  가방: { {k: inv.get(k, 0) for k in keys} }")
        if inv.get("roboport", 0) < 1 or inv.get("storage-chest", 0) < 1:
            raise ox.Abort("로보포트/저장 상자 제작 실패")

        ox.walk(ai, ox.CORRIDOR, "남하")

        mags = inv.get("firearm-magazine", 0)
        packs = inv.get("repair-pack", 0)
        build = [("build", {"name": "small-electric-pole", "x": POLE[0], "y": POLE[1]}),
                 ("build", {"name": "roboport", "x": ROBO[0], "y": ROBO[1], "direction": ox.N}),
                 ("insert", {"name": "construction-robot", "x": ROBO[0], "y": ROBO[1], "count": ROBOTS}),
                 ("insert", {"name": "repair-pack", "x": ROBO[0], "y": ROBO[1], "count": PACKS_IN_PORT}),
                 ("build", {"name": "storage-chest", "x": CHEST[0], "y": CHEST[1]})]
        for x, y in TURRETS:
            build += [("insert", {"name": "firearm-magazine", "x": x, "y": y, "count": TURRET_TOPUP})]
        build += [("insert", {"name": "repair-pack", "x": CHEST[0], "y": CHEST[1], "count": packs - PACKS_IN_PORT}),
                  ("insert", {"name": "firearm-magazine", "x": CHEST[0], "y": CHEST[1],
                              "count": mags - TURRET_TOPUP * len(TURRETS)}),
                  ("insert", {"name": "piercing-rounds-magazine", "x": CHEST[0], "y": CHEST[1],
                              "count": inv.get("piercing-rounds-magazine", 0)})]
        ox.guard(ai)
        ox.run(ai, build, "설치", 300)
        time.sleep(5)
        log(f"  현장: {site(ai)}")
    except ox.Abort as e:
        log(f"중단: {e}")
        if not ox.me(ai).get("alive", True):
            log("delta 사망 - 부활하지 않음. 기록만.")
            detached.release([WHO])
            return 2
    except Exception as e:  # noqa: BLE001
        log(f"오류: {type(e).__name__}: {e}")

    try:
        st = ox.me(ai)
        back = [p for p in reversed(ox.CORRIDOR[:-1]) if p[1] < st["y"] + 5] + [ox.HOME]
        ox.walk(ai, back, "귀환", hold_max=900)
        log(f"귀환 완료 ({ox.me(ai)['x']:.0f},{ox.me(ai)['y']:.0f})")
    except Exception as e:  # noqa: BLE001
        log(f"귀환 문제: {type(e).__name__}: {e}")
    finally:
        detached.release([WHO])
    time.sleep(30)
    log(f"30초 뒤 현장: {site(ai)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["go", "check"])
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        log(f"현장: {site(ai)}")
        return 0
    return go(ai)


if __name__ == "__main__":
    raise SystemExit(main())

"""24회차 긴급 방어 E24 (03:53, 진화 0.31): 북서 새 둥지 무리 (-65..-45, -152..-140) - 침 뱉개 1 · 바이터 2 · 벌레 3 (중형 1).

raidwatch24 03:53:58 «NW 틈 -79 · 흡수 둥지 2 · 기지 200 안 적 34». 가장 가까운 우리 것 = P10 북쪽 구리 전초 서쪽 벽 (x 1.5) ~47 칸.
둥지는 망 9 건설 반경 밖 (가장 가까운 포트 (-128,-28) · (8,-10) 135 · 148) → 포트 사슬 둘:
  B (20,-56)  - (8,-10) 과 체비셰프 46 (물류 반경 25 → ≤ 50 이면 한 망). 전기 = P10 중형 전봇대 (24.5,-60.5)·(24.5,-51.5) 공급 칸 (±3.5) 안.
  C (-19,-102) - B 와 39·46. 전기 = P10 작은 전봇대 (5.5,-100.5) 에서 서쪽 작은 전봇대 셋. 건설 ±55 가 둥지 · 벌레를 다 덮는다
               (중형 벌레 (-67,-148) 까지 67 > 사거리 30 - 포트는 벌레 밖).
로보포트 5 는 허브 쇠 상자 (67.5,-15.5) (망 밖) 에만 있다 → 한가한 사람 한 명이 들어 망 저장 상자 (59.5,-14.5) 에 (relay 아님).
포탑 · 벽 · 탄은 모두 유령 (can_place manual) + insert_plan / item-request-proxy (대상마다 ≤ 100) → 건설 로봇. 사람은 둥지에 안 간다.

    python scripts/e24_defense.py --run run24 --carry bravo
    python scripts/e24_defense.py --run run24 --chain
    python scripts/e24_defense.py --run run24 --guards face,b,c
    python scripts/e24_defense.py --run run24 --creep 30
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401
import detached                          # noqa: E402
from client import AIBridge              # noqa: E402
from p6_24 import GHOST_LUA              # noqa: E402

PORT_B, PORT_C = (20, -56), (-19, -102)
POLES_C = [(-1.5, -100.5), (-8.5, -100.5), (-15.5, -100.5)]
NEST = (-56, -146)                       # 둥지 무리 가운데
STORE = (59.5, -14.5)                    # 망 9 저장 상자
ROBO_CHEST = (67.5, -15.5)               # 허브 쇠 상자 (로보포트 5)
PIERCE = "piercing-rounds-magazine"


def cluster(cx, cy):
    """포탑 넷 (2x2 붙여) + 둥지 쪽 (북 · 서) 벽 ㄱ 자."""
    out = [("gun-turret", cx + dx, cy + dy) for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1))]
    out += [("stone-wall", cx + x + 0.5, cy - 4.5) for x in range(-5, 5)]
    out += [("stone-wall", cx - 4.5, cy + y + 0.5) for y in range(-4, 5)]
    return out


# 포트 C 곁 (포탑 사거리 18 안) · 기지 북면 빈 곳 (x -30..60 y -40 줄은 포탑 0 - 북면 포탑은 x -92..-34 y -17/-8 뿐).
GUARDS = {"c": cluster(-25, -110) + cluster(-10, -112),
          "b": cluster(12, -62),
          # 04:05 둥지 곁 유닛 79 (모이는 중) - 둥지와 P10 전초 서벽 (x 1.5) 사이 · C 앞
          "w": cluster(-12, -135) + cluster(-32, -124),
          "face": cluster(-30, -42) + cluster(-5, -45)}

PLACE_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  %s
  local out = {placed = 0, skip = 0, nonet = 0, blocked = 0, wait = 0, plan = 0}
  for _, v in pairs(helpers.json_to_table('%s')) do
    local n, pos = v[1], {v[2], v[3]}
    local r = (n == "gun-turret") and 1 or ((n == "roboport") and 2 or 0.5)
    if #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
    elseif s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.6} > 0
        or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.6} > 0 then out.skip = out.skip + 1
    else
      local st, g = ghost(n, pos, r)
      if st == "ok" then
        out.placed = out.placed + 1
        if n == "gun-turret" then
          local ok = pcall(function() g.insert_plan = {{id = {name = "%s"}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = 20}}}}} end)
          if ok then out.plan = out.plan + 1 end
        end
      elseif st == "wait" then out.wait = out.wait + 1 else out.blocked = out.blocked + 1 end
    end
  end
  return out
end)()"""


def place(ai, items) -> dict:
    return ai.lua(PLACE_LUA % (GHOST_LUA, json.dumps([list(i) for i in items]), PIERCE))


def carry(ai, who) -> None:
    from orders import submit
    r = [b for b in ai.list() if b["name"] == who][0]
    if r.get("current") or r.get("queued") or detached.owner(who):
        print(who, "한가하지 않음 - 안 씀", r.get("current"), detached.owner(who))
        return
    detached.mark([who], "e24", minutes=8)
    try:
        submit(ai, who, [("walk_to", {"x": ROBO_CHEST[0], "y": ROBO_CHEST[1] - 1.5}),
                         ("take", {"name": "roboport", "x": ROBO_CHEST[0], "y": ROBO_CHEST[1], "count": 5}),
                         ("walk_to", {"x": STORE[0], "y": STORE[1] - 1.5}),
                         ("insert", {"name": "roboport", "x": STORE[0], "y": STORE[1], "count": 5})], strict=False)
        t0 = time.time()
        while time.time() - t0 < 180:
            time.sleep(3)
            b = [x for x in ai.list() if x["name"] == who][0]
            if not (b.get("current") or b.get("queued")):
                break
        n = ai.lua("""(function() local c = game.surfaces[1].find_entities_filtered{name = "storage-chest", position = {%f, %f}, radius = 0.6}[1]
          return {robo = c.get_item_count("roboport")} end)()""" % STORE)
        print(time.strftime("%X"), who, "나름 끝 · 저장 상자", n, flush=True)
    finally:
        detached.release([who])


def chain(ai) -> dict:
    items = [("roboport", PORT_B[0], PORT_B[1]), ("roboport", PORT_C[0], PORT_C[1])] + [("small-electric-pole", x, y) for x, y in POLES_C]
    return place(ai, items)


def ammo(ai, area, below=15, count=40) -> dict:
    """망 안 포탑 중 탄이 적은 것에 item-request-proxy - 이미 든 탄 종류로 (노랑 든 포탑엔 피어싱 안 들어감)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {asked = 0, pending = 0, nonet = 0}
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, area = {{%f, %f}, {%f, %f}}}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        if inv.get_item_count() < %d then
          local kind = "%s"
          for _, it in pairs(inv.get_contents()) do kind = it.name end
          if t.item_request_proxy then out.pending = out.pending + 1
          elseif #s.find_logistic_networks_by_construction_area(t.position, f) == 0 then out.nonet = out.nonet + 1
          else
            s.create_entity{name = "item-request-proxy", position = t.position, force = f, target = t,
              modules = {{id = {name = kind}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}}}
            out.asked = out.asked + 1
          end
        end
      end
      return out
    end)()""" % (area[0][0], area[0][1], area[1][0], area[1][1], below, PIERCE, min(count, 100)))


STATE_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local C = {%f, %f}
  local sp = s.find_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"}, position = C, radius = 45}
  local best, bd = nil, 1e9
  for _, e in pairs(sp) do
    local d = math.sqrt((e.position.x - %f)^2 + (e.position.y - %f)^2)
    if d < bd then best, bd = e, d end
  end
  local ks = f.get_kill_count_statistics(s)
  local ours = 0
  if best then
    for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, position = best.position, radius = 17}) do
      if t.get_inventory(defines.inventory.turret_ammo).get_item_count() > 0 then ours = ours + 1 end
    end
  end
  return {left = #sp, units = s.count_entities_filtered{force = "enemy", type = "unit", position = C, radius = 60},
          lost_t = ks.get_output_count("gun-turret"), lost_w = ks.get_output_count("stone-wall"),
          ours = ours, gx = best and best.position.x, gy = best and best.position.y, name = best and best.name,
          ghosts = best and s.count_entities_filtered{ghost_name = "gun-turret", position = best.position, radius = 30} or 0}
end)()"""


def creep(ai, minutes, standoff=15, cap=10) -> None:
    """둥지 무리에서 C 에 가장 가까운 적 구조물 → C 쪽 standoff 칸에 포탑 6 유령 (피어싱 20). 이미 우리 포탑 (17 칸 안, 탄 있음) 이 있으면 탄만."""
    end = time.time() + minutes * 60
    lost0 = None
    while time.time() < end:
        r = ai.lua(STATE_LUA % (NEST[0], NEST[1], PORT_C[0], PORT_C[1]))
        lost0 = lost0 if lost0 is not None else r["lost_t"]
        if not r.get("left"):
            print(time.strftime("%X"), "둥지 무리 적 구조물 0 - 끝 · 유닛", r.get("units"), flush=True)
            return
        if r["lost_t"] - lost0 > cap:
            print(time.strftime("%X"), f"포탑 {r['lost_t'] - lost0} 잃음 - 멈춤", flush=True)
            return
        if not r.get("ours") and not r.get("ghosts"):
            gx, gy = float(r["gx"]), float(r["gy"])
            ux, uy = PORT_C[0] - gx, PORT_C[1] - gy
            L = math.hypot(ux, uy)
            ux, uy = ux / L, uy / L
            cx, cy = gx + ux * standoff, gy + uy * standoff
            px, py = -uy, ux
            pos = [("gun-turret", round(cx + px * k * 2.5 + ux * j * 2.5), round(cy + py * k * 2.5 + uy * j * 2.5))
                   for k, j in ((-1, 0), (1, 0), (0, 1), (0, -1), (-2, 0), (2, 0))]
            q = place(ai, pos)
            print(time.strftime("%X"), f"목표 {r['name']} ({gx:.0f},{gy:.0f}) 남은 {r['left']} · 유닛 {r['units']} -> 유령 {q}", flush=True)
        a = ammo(ai, [[NEST[0] - 70, NEST[1] - 30], [NEST[0] + 70, NEST[1] + 60]], below=25, count=80)
        if a.get("asked"):
            print(time.strftime("%X"), "탄", a, flush=True)
        time.sleep(15)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--carry", default="")
    ap.add_argument("--chain", action="store_true")
    ap.add_argument("--guards", default="", help="c,b,face")
    ap.add_argument("--ammo", action="store_true")
    ap.add_argument("--creep", type=float, default=0)
    a = ap.parse_args()
    ai = AIBridge()
    if a.carry:
        carry(ai, a.carry)
    if a.chain:
        print("chain", chain(ai))
    for g in [x for x in a.guards.split(",") if x]:
        print("guards", g, place(ai, GUARDS[g]))
    if a.ammo:
        print("ammo", ammo(ai, [[-160, -200], [80, -20]]))
    if a.creep:
        creep(ai, a.creep)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Run 24: 동쪽 철 전초 (409,-150) 공습 복구 + 남 · 남서 면 방어 + 전초 자체 로봇망 (다음 공습은 스스로 고친다).

11:09 공습 (작은 · 중형 침 42 + 9, 남서 둥지 (254..277,-29..-16) 쪽): 남쪽 강철로 블록 (y -127..-115) · 줄기 끝 (y -100.5, x 376..406) 이
포탑 사거리 밖 (남 포탑 y -134/-138 → 사거리 18 이 -116 까지) 이라 침이 벽 밖에서 녹였다. 유령 ~310 이 남았는데 어느 망에도 안 들어
로봇이 안 짓는다.

  1) 전초 로보포트 (398,-150) 하나 = 건설 범위 x 343..453 · y -205..-95 (전초 전부 + 줄기 끝), 물류 범위 안 저장 상자 하나.
     echo 가방의 로보포트 · 로봇 20 (허브 쇠 상자) · 재료는 사람이 걸어서 상자에 손으로 넣는다 (Lua 아이템 이동 0).
  2) 방어 유령: 남 포탑 줄 y -110 (x 395 · 399 · 403 · 410 · 414 · 418 · 422) · 남서 x 388 (y -118 · -124 · -130) +
     바깥 벽 y -106.5 (x 384.5..427.5, 줄기 406.5 비움) · x 384.5 (y -135.5..-107.5). can_place manual 통과 자리만 · 같은 이름 선 칸 건너뜀.
     나무에 막힌 칸은 해체 표시 (로봇이 벤 뒤 다시 --def).
  3) 탄: 저장 상자의 노랑 → ammo24 (망 안 포탑 요청) 이 알아서 채운다.

    python scripts/r24east.py --run run24 --need
    python scripts/r24east.py --run run24 --def
    python scripts/r24east.py --run run24 --port --who echo
    python scripts/r24east.py --run run24 --kit delta|echo
    python scripts/r24east.py --run run24 --status
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401
import detached                          # noqa: E402
from client import AIBridge, RconError   # noqa: E402
from orders import submit                # noqa: E402

OWNER = "r24east"
BOX = (340, -215, 440, -95)
PORT = (398.0, -150.0)
CHEST_TRY = [(395.5, -150.5), (395.5, -149.5), (400.5, -147.5), (396.5, -147.5), (400.5, -152.5), (395.5, -152.5)]

TUR, WALL = "gun-turret", "stone-wall"
DEF = [(TUR, x, -110.0) for x in (395, 399, 403, 410, 414, 418, 422)]
DEF += [(TUR, 388.0, y) for y in (-118, -124, -130)]
DEF += [(WALL, x + 0.5, -106.5) for x in range(384, 428) if x != 406]
DEF += [(WALL, 384.5, y + 0.5) for y in range(-136, -107)]

LUA_GHOSTS = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, g in pairs(s.find_entities_filtered{area = {{%f, %f}, {%f, %f}}, type = "entity-ghost", force = "player"}) do
    out[g.ghost_name] = (out[g.ghost_name] or 0) + 1
  end
  return out
end)()""" % BOX


def ghosts(ai):
    r = ai.lua(LUA_GHOSTS)
    return dict(r) if isinstance(r, dict) else {}


def place_def(ai):
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local placed, skip, trees = 0, 0, 0
      for _, d in pairs(helpers.json_to_table('%s')) do
        local n, p = d[1], {d[2], d[3]}
        local same = s.count_entities_filtered{position = p, radius = 0.3, name = n}
                   + s.count_entities_filtered{position = p, radius = 0.3, ghost_name = n}
        if same > 0 then skip = skip + 1
        elseif s.can_place_entity{name = n, position = p, force = f, build_check_type = defines.build_check_type.manual} then
          s.create_entity{name = "entity-ghost", inner_name = n, position = p, force = f}
          placed = placed + 1
        else
          local h = n == "gun-turret" and 1.0 or 0.5
          for _, t in pairs(s.find_entities_filtered{area = {{p[1]-h, p[2]-h}, {p[1]+h, p[2]+h}}, type = "tree"}) do
            if not t.to_be_deconstructed() then t.order_deconstruction(f); trees = trees + 1 end
          end
        end
      end
      return {placed = placed, skip = skip, trees = trees}
    end)()""" % json.dumps([[n, x, y] for n, x, y in DEF]))
    print("def:", r)


def chest_spot(ai):
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      for _, c in pairs(helpers.json_to_table('%s')) do
        if s.can_place_entity{name = "storage-chest", position = c, force = f, build_check_type = defines.build_check_type.manual} then
          return c
        end
      end
      return {}
    end)()""" % json.dumps([list(c) for c in CHEST_TRY]))
    if not r:
        return None
    v = r if isinstance(r, list) else list(r.values())
    return float(v[0]), float(v[1])


def port(ai, who):
    """echo: 로보포트 · 저장 상자 짓기 (가방에 있는 것)."""
    ok = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      for _, c in pairs(helpers.json_to_table('%s')) do
        if s.can_place_entity{name = "storage-chest", position = c, force = f, build_check_type = defines.build_check_type.manual} then
          return c
        end
      end
      return {}
    end)()""" % json.dumps([list(c) for c in CHEST_TRY]))
    print("chest spot", ok)
    plan = [("walk_to", {"x": PORT[0] - 3.5, "y": PORT[1] + 3.5}),
            ("build", {"name": "roboport", "x": PORT[0], "y": PORT[1], "direction": 0})]
    if ok:
        cx, cy = (ok if isinstance(ok, list) else list(ok.values()))[:2]
        plan.append(("build", {"name": "storage-chest", "x": cx, "y": cy, "direction": 0}))
    detached.mark([who], OWNER, minutes=40)
    submit(ai, who, plan, strict=False)


def store_pos(ai):
    r = ai.lua("""(function()
      local c = game.surfaces[1].find_entities_filtered{name = "storage-chest", force = "player", position = {%f, %f}, radius = 8}[1]
      return c and {c.position.x, c.position.y} or {}
    end)()""" % PORT)
    if not r:
        return None
    v = r if isinstance(r, list) else list(r.values())
    return float(v[0]), float(v[1])


def deliver(ai, who, items):
    """가방에 든 items 를 전초 저장 상자 · 로보포트 (로봇) 에 손으로."""
    sp = store_pos(ai)
    plan = [("walk_to", {"x": PORT[0] - 3.5, "y": PORT[1] + 3.5})]
    if not sp and "storage-chest" in items:
        spot = chest_spot(ai)
        if spot:
            plan.append(("build", {"name": "storage-chest", "x": spot[0], "y": spot[1], "direction": 0}))
            sp = spot
    elif not sp:
        sp = chest_spot(ai)                   # 먼저 가는 사람이 이 칸에 짓는다 - insert 는 걸어간 뒤에 본다
    items = {k: v for k, v in items.items() if k != "storage-chest"}
    for n, k in items.items():
        if n == "construction-robot":
            plan.append(("insert", {"name": n, "x": PORT[0], "y": PORT[1], "count": k}))
        elif sp:
            plan.append(("insert", {"name": n, "x": sp[0], "y": sp[1], "count": k}))
    submit(ai, who, plan, strict=False)


# 사람별 키트: (take 목록 [(품목, x, y, 수)], craft 목록 [(조리법, 수)], 넣을 것 {품목: 수})
KITS = {
    # delta: 가방 철 1,490. 서쪽 창고 (-84..-88) 포탑 · 벽 · 톱니, 허브 동쪽 회로 · 로봇 · 강철 → 빠른 벨트 · 벨트 · 팔 · 저장 상자 여분 · 노랑
    "delta": ([("gun-turret", -84.5, -13.5, 14), ("stone-wall", -88.5, -13.5, 120), ("iron-gear-wheel", -76.5, -13.5, 260),
               ("electronic-circuit", 31.5, -16.5, 80), ("construction-robot", 67.5, -15.5, 20)],
              [("transport-belt", 90), ("fast-transport-belt", 100), ("inserter", 66), ("storage-chest", 1), ("firearm-magazine", 150)],
              {"gun-turret": 14, "stone-wall": 120, "fast-transport-belt": 100, "transport-belt": 55, "inserter": 66,
               "firearm-magazine": 150, "construction-robot": 20}),
    # echo: 벽돌 · 강철 → 강철로 32 · 가방 나무 + 구리 → 작은 전봇대 32
    "echo": ([("stone-brick", 59.5, -14.5, 330), ("steel-plate", 75.5, -15.5, 190), ("copper-plate", 67.5, -15.5, 20)],
             [("steel-furnace", 32), ("small-electric-pole", 16)],
             {"storage-chest": 1, "steel-furnace": 32, "small-electric-pole": 32, "stone-wall": 37}),
}


def kit(ai, who, go=True):
    takes, crafts, give = KITS[who]
    detached.mark([who], OWNER, minutes=40)
    plan = []
    for n, x, y, k in takes:
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": k})]
    for r, k in crafts:
        plan.append(("craft", {"recipe": r, "count": k}))
    submit(ai, who, plan, strict=False)
    if not go:
        return
    wait_idle(ai, who, 1500)
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    items = {n: min(k, int(bag.get(n, 0))) for n, k in give.items() if int(bag.get(n, 0)) > 0}
    print(time.strftime("%X"), who, "넣을 것", items, flush=True)
    deliver(ai, who, items)
    wait_idle(ai, who, 900)
    print(time.strftime("%X"), who, "넣음", flush=True)


def ammo_run(ai, pairs_):
    """사람마다 허브 철 400 → 노랑 100 손제작 → 걸어가 빈 포탑에 20 씩 손으로 → 나머지는 전초 저장 상자 (ammo24 가 망 요청으로 나눔).
    pairs_: [(who, (허브 상자 x, y), [(포탑 x, y), ...]), ...]"""
    detached.mark([w for w, _, _ in pairs_], OWNER, minutes=30)
    for who, src, turrets in pairs_:
        p = [("walk_to", {"x": src[0], "y": src[1] + 1.5}), ("take", {"name": "iron-plate", "x": src[0], "y": src[1], "count": 400}),
             ("craft", {"recipe": "firearm-magazine", "count": 100})]
        for x, y in turrets:
            p += [("walk_to", {"x": x, "y": y - 2.5}), ("insert", {"name": "firearm-magazine", "x": x, "y": y, "count": 20})]
        p += [("walk_to", {"x": PORT[0] - 3.5, "y": PORT[1] + 4}),
              ("insert", {"name": "firearm-magazine", "x": 395.5, "y": -150.5, "count": 100 - 20 * len(turrets)})]
        submit(ai, who, p, strict=False)


def idle(ai, who):
    for r in ai.list():
        if r["name"] == who:
            return not (r.get("current") or r.get("queued"))
    return True


def wait_idle(ai, who, limit):
    t0 = time.time()
    time.sleep(5)
    while time.time() - t0 < limit and not idle(ai, who):
        time.sleep(5)


def status(ai):
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local a = {{%f, %f}, {%f, %f}}
      local out = {tick = game.tick}
      for _, n in pairs({"steel-furnace", "electric-mining-drill", "gun-turret", "stone-wall", "roboport", "storage-chest"}) do
        out[n] = s.count_entities_filtered{area = a, name = n, force = f}
      end
      local st = {}
      for _, e in pairs(s.find_entities_filtered{area = a, name = "steel-furnace", force = f}) do
        local k = tostring(e.status); st[k] = (st[k] or 0) + 1
      end
      out.furn_status = st
      local low = 0
      for _, t in pairs(s.find_entities_filtered{area = a, name = "gun-turret", force = f}) do
        if t.get_inventory(defines.inventory.turret_ammo).get_item_count() < 10 then low = low + 1 end
      end
      out.turret_low = low
      local n = s.find_logistic_network_by_position({%f, %f}, f)
      if n then out.net = {robots = n.all_construction_robots, avail = n.available_construction_robots,
                           yellow = n.get_item_count("firearm-magazine"), wall = n.get_item_count("stone-wall")} end
      local fs = f.get_item_production_statistics(s)
      out.iron10 = fs.get_flow_count{name = "iron-plate", category = "input", precision_index = defines.flow_precision_index.ten_minutes, count = true}
      out.steel10 = fs.get_flow_count{name = "steel-plate", category = "input", precision_index = defines.flow_precision_index.ten_minutes, count = true}
      out.enemy150 = s.count_entities_filtered{position = {409, -150}, radius = 150, force = "enemy", type = "unit"}
      return out
    end)()""" % (*BOX, *PORT))
    r["ghosts"] = ghosts(ai)
    print(json.dumps(r, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default=os.environ.get("AI_RUN", "run24"))
    ap.add_argument("--need", action="store_true")
    ap.add_argument("--def", dest="dfn", action="store_true")
    ap.add_argument("--port", action="store_true")
    ap.add_argument("--who", default="echo")
    ap.add_argument("--kit", default="")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--deliver", default="", help="가방에 든 KITS[who] 넣을 것을 바로 전초로 (만드는 중인 것은 insert 가 기다린다)")
    a = ap.parse_args()
    os.environ[detached.ENV] = OWNER
    ai = AIBridge()
    if a.need:
        print(ghosts(ai))
    if a.dfn:
        place_def(ai)
    if a.port:
        port(ai, a.who)
    if a.kit:
        kit(ai, a.kit)
    if a.deliver:
        detached.mark([a.deliver], OWNER, minutes=40)
        deliver(ai, a.deliver, dict(KITS[a.deliver][2]))
    if a.status:
        status(ai)


if __name__ == "__main__":
    main()

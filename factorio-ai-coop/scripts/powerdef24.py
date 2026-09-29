"""run24 01:38 south lakeshore power raid: turrets around power units, rebuild by hand, exposure scan.

사용자 결정 그대로:
  (1) Lua relay 금지 - 이 파일에 inv.remove → insert 없다. 포탑 · 벽은 로봇 유령 (망 재고), 탄은 item-request-proxy
      (≤ 100 / 대상, 로봇이 망에서 나름), 보일러 · 기관 · 해안 펌프는 사람이 손제작해 저장 상자에 insert → 로봇이 유령을 짓는다.
  (2) 못 놓는 자리 금지 - 유령마다 can_place_entity{build_check_type=manual} + 겹치는 유령 없음.
  (3) Guiltyring 건물은 안 건드림 - 노출 조사에서 last_user 가 Guiltyring 이면 뺀다.

    python scripts/powerdef24.py --run run24 --ghost          # 남쪽 호숫가 발전 포탑 8 + 벽 줄 유령
    python scripts/powerdef24.py --run run24 --ammo           # 선 포탑 탄 35 까지 요청 (proxy, 든 탄과 같은 종류)
    python scripts/powerdef24.py --run run24 --expose         # 포탑 30 칸 안 0 인 발전 · 석유 건물
    python scripts/powerdef24.py --run run24 --rebuild hotel  # 보일러 4 · 기관 2 · 해안 펌프 1 · 관 10 손제작 → 저장 상자
    python scripts/powerdef24.py --run run24 --status
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

OWNER = "powerdef"
TUR, WALL = "gun-turret", "stone-wall"
AMMO, AMMO_N = "piercing-rounds-magazine", 35   # 탄 칸은 1 개 - 이미 든 탄 (로봇이 넣은 보통탄) 과 같은 것으로 채운다

# 남쪽 호숫가 발전 (보일러 y 46 · 기관 y 37.5/42.5, x -31..-3). 호수는 x <= -34 (서쪽), 공습은 남서 해안길.
# 포탑 8 (사거리 18) - 이웃 3 이상: 서 (-32,36)(-32,42)(-32,50) · 남 (-24,52)(-14,52)(-4,52) · 동 (2,50)(0,42)
TURRETS = [(-32, 36), (-32, 42), (-32, 50), (-24, 52), (-14, 52), (-4, 52), (2, 50), (0, 42)]
# 01:48 조정자: 남 · 서쪽 두텁게 - 남서 모서리 (-28,52) · 남 가운데 (-18,50) · 서쪽 해안 펌프 옆 (-36,34)
TURRETS += [(-28, 52), (-18, 50), (-36, 34)]
# 벽: 포탑 앞 남쪽 한 줄 y 55.5 (x -33.5 ~ 8.5) + 동쪽 끝 x 8.5 북으로 (y 54.5 ~ 44.5)
WALLS = [(x + 0.5, 55.5) for x in range(-34, 9)] + [(8.5, y + 0.5) for y in range(44, 55)]

# 사람이 만들 것 (망에 0). 관 7 은 부서졌다고 보고 됐지만 유령이 없어 여유분.
NEED = {"boiler": 4, "steam-engine": 2, "offshore-pump": 1, "pipe": 10}
DROP = (-34.5, 14.5)                     # 발전소에 가장 가까운 저장 상자 (빈 칸 36)
POWER_TYPES = ["boiler", "generator", "offshore-pump", "mining-drill", "oil-refinery", "chemical-plant", "pump"]


def ghost(ai, name, pts) -> dict:
    lst = json.dumps([list(p) for p in pts])
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local o = {made = 0, have = 0, blocked = {}}
      local half = %s
      for _, p in pairs(helpers.json_to_table('%s')) do
        local x, y = p[1], p[2]
        local area = {{x - half + 0.05, y - half + 0.05}, {x + half - 0.05, y + half - 0.05}}
        if s.count_entities_filtered{area = area, name = '%s', force = f} > 0
           or s.count_entities_filtered{area = area, ghost_name = '%s', force = f} > 0 then o.have = o.have + 1
        elseif s.count_entities_filtered{area = area, type = 'entity-ghost', force = f} > 0 then o.blocked[#o.blocked + 1] = x .. ',' .. y .. ':ghost'
        elseif not s.can_place_entity{name = '%s', position = {x, y}, force = f, build_check_type = defines.build_check_type.manual} then
          o.blocked[#o.blocked + 1] = x .. ',' .. y
        else
          s.create_entity{name = 'entity-ghost', inner_name = '%s', position = {x, y}, force = f}
          o.made = o.made + 1
        end
      end
      return o end)()""" % (1 if name == TUR else 0.5, lst, name, name, name, name))


def ammo(ai, pts=TURRETS) -> dict:
    lst = json.dumps([list(p) for p in pts])
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local o = {req = 0, full = 0, missing = 0, counts = {}}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = p, radius = 0.6}[1]
        if not t then o.missing = o.missing + 1
        else
          local inv = t.get_inventory(defines.inventory.turret_ammo)
          local have, item = inv.get_item_count(), (inv[1].valid_for_read and inv[1].name or '%s')
          o.counts[#o.counts + 1] = have
          local busy = s.count_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.6} > 0
          if have >= %d then o.full = o.full + 1
          elseif not busy then
            s.create_entity{name = 'item-request-proxy', position = t.position, force = f, target = t,
              modules = {{id = {name = item}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d - have}}}}}}
            o.req = o.req + 1
          end
        end
      end
      return o end)()""" % (lst, AMMO, AMMO_N, AMMO_N))


def expose(ai, radius=30) -> list:
    """포탑 radius 칸 안 0 인 발전 · 석유 건물 (Guiltyring 것 빼고). 무리 (32 칸 격자) 로 묶어 셈."""
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local tur = s.find_entities_filtered{type = {'ammo-turret', 'electric-turret', 'fluid-turret'}, force = f}
      local tg = {}
      for _, t in pairs(tur) do local k = math.floor(t.position.x / 32) .. ',' .. math.floor(t.position.y / 32)
        tg[k] = tg[k] or {} table.insert(tg[k], t.position) end
      local out = {}
      for _, e in pairs(s.find_entities_filtered{type = %s, force = f}) do
        local lu = e.last_user and e.last_user.name or ''
        local ok = (e.type ~= 'mining-drill' or e.name == 'pumpjack')
        if ok and lu ~= 'Guiltyring' then
          local x, y, near = e.position.x, e.position.y, 0
          local cx, cy = math.floor(x / 32), math.floor(y / 32)
          for dx = -1, 1 do for dy = -1, 1 do
            for _, p in pairs(tg[(cx + dx) .. ',' .. (cy + dy)] or {}) do
              if (p.x - x) ^ 2 + (p.y - y) ^ 2 <= %d then near = near + 1 end end end end
          if near == 0 then
            local k = math.floor(x / 32) .. ',' .. math.floor(y / 32)
            out[k] = out[k] or {n = 0, names = {}, x = x, y = y}
            out[k].n = out[k].n + 1
            out[k].names[e.name] = (out[k].names[e.name] or 0) + 1
          end
        end
      end
      return out end)()""" % (json.dumps(POWER_TYPES).replace("[", "{").replace("]", "}"), radius * radius))
    return sorted((r or {}).values(), key=lambda v: -v["n"])


def status(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
      local o = {engines = {}, ghosts = 0, enemies = 0, turrets = {}}
      for _, e in pairs(s.find_entities_filtered{name = 'steam-engine', force = f}) do
        local k = st[e.status] or tostring(e.status) o.engines[k] = (o.engines[k] or 0) + 1 end
      o.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = f, position = {-18, 44}, radius = 20}
      o.enemies = s.count_entities_filtered{force = 'enemy', type = {'unit', 'unit-spawner', 'turret'}, position = {-18, 44}, radius = 120}
      for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = f, position = {-15, 45}, radius = 25}) do
        o.turrets[#o.turrets + 1] = t.get_inventory(defines.inventory.turret_ammo).get_item_count() end
      local n = s.find_logistic_networks_by_construction_area({-22, 40}, f)[1]
      if n then o.net = {} for _, w in pairs({'gun-turret', 'stone-wall', 'piercing-rounds-magazine', 'boiler', 'steam-engine', 'offshore-pump', 'pipe'}) do
        o.net[w] = n.get_item_count(w) end end
      o.tick = game.tick
      return o end)()""")


def rebuild(ai, who) -> None:
    """손제작 (막힘) → 저장 상자 insert. 판은 허브 (망) 에서 사람이 take - 최소만."""
    import p8_24
    from orders import submit
    if detached.owner(who) and detached.owner(who) != OWNER:
        print(f"{who} 는 {detached.owner(who)} 것 - 쓰지 않는다")
        return
    detached.mark([who], OWNER, minutes=30)
    os.environ[detached.ENV] = OWNER
    net = status(ai).get("net") or {}
    need = {k: v - int(net.get(k, 0)) for k, v in NEED.items() if v - int(net.get(k, 0)) > 0}
    # 판 셈 (중간재는 begin_crafting 이 스스로): 관 = 철 1 · 톱니 = 철 2 · 회로 = 철 1 + 구리 1.5 · 돌 화로 = 돌 5
    #   보일러 = 돌 화로 + 관 4 · 기관 = 톱니 8 + 관 5 + 철 10 · 해안 펌프 = 회로 2 + 관 1 + 톱니 1
    mats = {"iron-plate": 4 * need.get("boiler", 0) + 36 * need.get("steam-engine", 0)
            + 5 * need.get("offshore-pump", 0) + need.get("pipe", 0),
            "copper-plate": 3 * need.get("offshore-pump", 0), "stone": 5 * need.get("boiler", 0)}
    bag = ai.agent(who).items()
    src = p8_24.sources(ai, set(mats))
    plan = []
    for m, q in mats.items():
        q -= int(bag.get(m, 0))
        for n, x, y, c, cname in sorted(src, key=lambda r: -r[3]):
            if n != m or q <= 0 or cname == "storage-chest":
                continue
            got = min(q, c)
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": got})]
            q -= got
        if q > 0:
            print(time.strftime("%X"), who, "재료 모자람", m, q)
            return
    for k, n in need.items():
        plan.append(("craft", {"recipe": k, "count": n, "wait": "block"}))
    submit(ai, who, plan[:50], strict=False)
    print(time.strftime("%X"), who, "재료 · 제작", need, len(plan), flush=True)
    p8_24.wait_idle(ai, who, 900)
    bag = ai.agent(who).items()
    ins = [("walk_to", {"x": DROP[0] + 1.5, "y": DROP[1] + 0.5})]
    for k in NEED:
        n = int(bag.get(k, 0))
        if n > 0:
            ins.append(("insert", {"name": k, "x": DROP[0], "y": DROP[1], "count": n}))
    submit(ai, who, ins, strict=False)
    p8_24.wait_idle(ai, who, 300)
    print(time.strftime("%X"), who, "저장 상자에 넣음", {k: bag.get(k, 0) for k in NEED}, flush=True)
    detached.release([who])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--ghost", action="store_true")
    ap.add_argument("--ammo", action="store_true")
    ap.add_argument("--expose", action="store_true")
    ap.add_argument("--rebuild")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.ghost:
        print("포탑", ghost(ai, TUR, TURRETS))
        print("벽", ghost(ai, WALL, WALLS))
    if a.ammo:
        print("탄", ammo(ai))
    if a.expose:
        for v in expose(ai):
            print(json.dumps(v, ensure_ascii=False))
    if a.rebuild:
        rebuild(ai, a.rebuild)
    if a.status:
        print(json.dumps(status(ai), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

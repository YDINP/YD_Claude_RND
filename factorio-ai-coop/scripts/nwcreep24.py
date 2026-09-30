"""Run 24: 기지 곁 둥지 치기 - 포탑 한꺼번에 놓기 (turret burst creep), 사람 0 · 로봇만.

사용자 명령 (2026-09-30 15:4x): «기지 곁 적 기지를 쳐라». E24 (04:0x) 실패 교훈 = 로봇이 탄 없는 포탑을 하나씩 지으면 벌레에 차례로 먹힌다.
→ 포탑 12~16 유령을 «한 번에» (망에 포탑 · 피어싱이 다 있을 때만) 놓고 유령마다 insert_plan 피어싱 → 로봇 수백이 한 번에 날아 짓고 탄을 넣는다.
  앞줄은 둥지 · 벌레 모두에 닿는 자리 (포탑 18 + 대상 반경), 벽 한 줄을 둥지 쪽에.

  --harvest : 한가한 안쪽 포탑 (kills 0, 바깥에 포탑 있음) 을 해체 표시 → 로봇이 포탑 + 든 피어싱을 망 저장으로 (Lua 아이템 이동 0).
  --strike  : 망 재고 확인 후 포탑 유령 전부 + 벽 유령 한 번에 (can_place manual · 같은 이름 선 칸 건너뜀).
  --watch   : 구역 적 구조물 · 유닛 · 잃은 포탑 · 잡은 것 기록. 구역 포탑 탄 < LOW → item-request-proxy 피어싱 (로봇).
              죽은 포탑이 남긴 유령 (insert_plan 없음) 은 무장 포탑 2 개가 20 칸 안일 때만 탄 달아 두고, 아니면 지운다 (홀로 지어져 먹히는 것 막음).
              «잃은 포탑 > 잡은 적 구조물» 이 두 번이면 멈춤 + 구역 유령 지움.
  --pickup  : 구역 적 구조물 0 이면 구역 포탑 해체 표시 (로봇이 망으로).

    python scripts/nwcreep24.py --cluster nw --harvest
    python scripts/nwcreep24.py --cluster nw --strike
    python scripts/nwcreep24.py --cluster nw --watch --every 20 --minutes 30
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge, RconError  # noqa

AMMO = "piercing-rounds-magazine"
LOG = os.path.join(HERE, "..", "state", "run24_creep_log.json")

# 한가한 안쪽 포탑 (15:5x 조회: kills 0 · 피어싱 ≥ 20 · 같은 방위 바깥 15+ 에 포탑 있음)
HARVEST = [(11, -63), (11, -61), (13, -63), (13, -61), (-58, -8), (-50, -8),
           (-100, -4), (-100, 4), (-100, 12), (-95, 0), (-124, 14), (-124, 24), (-116, 8),
           (-6, -46), (-6, -44), (-4, -46), (-4, -44)]   # 15:4x 둘째: 북면 가운데 (P10 전초가 바깥) - 노랑

CLUSTERS = {
    # 북서 무리: 바이터 둥지 (-57.5,-143.5) (-65.5,-152.5) · 작은 벌레 (-60.5,-148.2) (-59.7,-155) · 중형 벌레 (-67,-148.1)
    # 로보포트 C (-19,-102) 건설 반경 55 안. 앞줄 (-53,*) 은 다섯 모두에 닿는다 (둥지 반경 2.4 · 벌레 1 더함).
    "nw": {"port": (-19, -102), "center": (-62, -149), "radius": 16,
           "turrets": [(x, y) for x in (-53, -50, -47, -44) for y in (-139, -136, -133)] + [(-56, -136), (-56, -133), (-50, -142), (-47, -142)],
           "walls": [(x + 0.5, -145.5) for x in range(-52, -41)] + [(-59.5, y + 0.5) for y in range(-138, -128)],
           # 모으는 자리: 중형 벌레 30 · 작은 벌레 25 밖 (최소 31.9 / 27.7). 여기서 포탑 · 탄을 채운 뒤 --leap 로 한꺼번에 옮긴다.
           "stage": [(x, y) for x in (-44, -41, -38) for y in (-126, -123, -120, -117)]},
}

COMMON = """
  local s, f = game.surfaces[1], game.forces.player
  local C, R = {%f, %f}, %f
  local net = s.find_logistic_network_by_position({%f, %f}, f)
  local function place(name, p, fill)
    if s.count_entities_filtered{position = p, radius = 0.9, name = name} + s.count_entities_filtered{position = p, radius = 0.9, ghost_name = name} > 0 then return 'skip' end
    if not s.can_place_entity{name = name, position = p, force = f, build_check_type = defines.build_check_type.manual} then return 'blocked' end
    local g = s.create_entity{name = 'entity-ghost', inner_name = name, position = p, force = f}
    if g and fill > 0 then pcall(function() g.insert_plan = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = fill}}}}} end) end
    return g and 'ghost' or 'fail'
  end
  local function foes() return s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = C, radius = R} end
  local function zone_turrets() return s.find_entities_filtered{name = 'gun-turret', force = f, position = C, radius = R + 16} end
"""


def common(cl):
    c = CLUSTERS[cl]
    return COMMON % (c["center"][0], c["center"][1], c["radius"], c["port"][0], c["port"][1], AMMO)


def harvest(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {marked = 0, busy = 0, none = 0, ammo = 0}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = p, radius = 0.3}[1]
        if not t then out.none = out.none + 1
        elseif t.kills > 0 then out.busy = out.busy + 1
        else
          out.ammo = out.ammo + t.get_inventory(defines.inventory.turret_ammo).get_item_count(); t.order_deconstruction(f); out.marked = out.marked + 1
        end
      end
      return out
    end)()""" % json.dumps([list(p) for p in HARVEST]))


def stock(ai, cl):
    return ai.lua("""(function()%s
      if not net then return {} end
      return {turrets = net.get_item_count('gun-turret'), ammo = net.get_item_count('%s'), walls = net.get_item_count('stone-wall'),
              repair = net.get_item_count('repair-pack'), robots = net.available_construction_robots,
              decon = s.count_entities_filtered{name = 'gun-turret', force = f, to_be_deconstructed = true}}
    end)()""" % (common(cl), AMMO))


def strike(ai, cl, fill, force_partial=False):
    c = CLUSTERS[cl]
    st = stock(ai, cl)
    n = len(c["turrets"])
    if not force_partial and (st.get("turrets", 0) < n or st.get("ammo", 0) < n * fill):
        return {"wait": st, "need": {"turrets": n, "ammo": n * fill}}
    return ai.lua("""(function()%s
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do local r = place('gun-turret', p, %d) out[r] = (out[r] or 0) + 1 end
      for _, p in pairs(helpers.json_to_table('%s')) do local r = place('stone-wall', p, 0) out['wall_' .. r] = (out['wall_' .. r] or 0) + 1 end
      return out
    end)()""" % (common(cl), json.dumps([list(p) for p in c["turrets"]]), fill, json.dumps([list(p) for p in c["walls"]])))


def stage(ai, cl, fill):
    c = CLUSTERS[cl]
    return ai.lua("""(function()%s
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do local r = place('gun-turret', p, %d) out[r] = (out[r] or 0) + 1 end
      local n, a = 0, 0
      for _, p in pairs(helpers.json_to_table('%s')) do
        local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = p, radius = 0.3}[1]
        if t then n = n + 1 a = a + t.get_inventory(defines.inventory.turret_ammo).get_item_count()
          if t.get_inventory(defines.inventory.turret_ammo).get_item_count() < %d and not t.item_request_proxy then
            s.create_entity{name = 'item-request-proxy', position = t.position, force = f, target = t,
              modules = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d - t.get_inventory(defines.inventory.turret_ammo).get_item_count()}}}}}}
          end
        end
      end
      out.built, out.ammo = n, a
      return out
    end)()""" % (common(cl), json.dumps([list(p) for p in c["stage"]]), fill, json.dumps([list(p) for p in c["stage"]]), fill, AMMO, fill))


# 옮기기: 모은 포탑을 해체 표시 (로봇이 포탑 + 탄을 망 저장으로) 하고 같은 순간 치는 자리 유령 (insert_plan) 을 놓는다.
#   유령이 먼저 줄을 서 있으니 돌아온 포탑 · 탄이 곧바로 그리로 간다.
def leap(ai, cl, fill):
    c = CLUSTERS[cl]
    r1 = ai.lua("""(function()%s
      local n, a = 0, 0
      for _, p in pairs(helpers.json_to_table('%s')) do
        local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = p, radius = 0.3}[1]
        if t then a = a + t.get_inventory(defines.inventory.turret_ammo).get_item_count() t.order_deconstruction(f) n = n + 1 end
        for _, g in pairs(s.find_entities_filtered{ghost_name = 'gun-turret', force = f, position = p, radius = 0.3}) do g.destroy() end
      end
      return {marked = n, ammo = a}
    end)()""" % (common(cl), json.dumps([list(p) for p in c["stage"]])))
    r2 = strike(ai, cl, fill, True)
    return {"stage": r1, "strike": r2}


def status(ai, cl):
    return ai.lua("""(function()%s
      local ks = f.get_kill_count_statistics(s)
      local out = {foes = {}, units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = C, radius = R + 25},
                   lost = ks.get_output_count('gun-turret'), lost_wall = ks.get_output_count('stone-wall'),
                   killed_sp = ks.get_input_count('biter-spawner') + ks.get_input_count('spitter-spawner'),
                   killed_worm = ks.get_input_count('small-worm-turret') + ks.get_input_count('medium-worm-turret') + ks.get_input_count('big-worm-turret'),
                   killed_units = 0, armed = 0, built = 0, ammo = 0, tghost = s.count_entities_filtered{ghost_name = 'gun-turret', position = C, radius = R + 16},
                   evo = game.forces.enemy.get_evolution_factor(s)}
      for _, k in pairs({'small-biter','medium-biter','big-biter','behemoth-biter','small-spitter','medium-spitter','big-spitter','behemoth-spitter'}) do out.killed_units = out.killed_units + ks.get_input_count(k) end
      for _, e in pairs(foes()) do out.foes[#out.foes + 1] = {e.name, math.floor(e.health)} end
      for _, t in pairs(zone_turrets()) do
        local a = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
        out.built = out.built + 1 out.ammo = out.ammo + a
        if a >= 5 then out.armed = out.armed + 1 end
      end
      if net then out.net_ammo = net.get_item_count('%s') out.net_turrets = net.get_item_count('gun-turret') end
      return out
    end)()""" % (common(cl), AMMO))


def tend(ai, cl, low, fill):
    return ai.lua("""(function()%s
      local out = {topup = 0, reghost = 0, dropped = 0}
      local armed = {}
      for _, t in pairs(zone_turrets()) do
        local a = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
        if a >= 5 then armed[#armed + 1] = t.position end
        if a < %d and not t.item_request_proxy and not t.to_be_deconstructed() then
          s.create_entity{name = 'item-request-proxy', position = t.position, force = f, target = t,
            modules = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}}}
          out.topup = out.topup + 1
        end
      end
      for _, g in pairs(s.find_entities_filtered{ghost_name = 'gun-turret', position = C, radius = R + 16}) do
        local plan = g.insert_plan
        if not plan or #plan == 0 then
          local near = 0
          for _, q in pairs(armed) do if (q.x - g.position.x) ^ 2 + (q.y - g.position.y) ^ 2 <= 400 then near = near + 1 end end
          if near >= 2 then
            pcall(function() g.insert_plan = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}} end)
            out.reghost = out.reghost + 1
          else g.destroy() out.dropped = out.dropped + 1 end
        end
      end
      return out
    end)()""" % (common(cl), low, AMMO, fill, AMMO, fill))


def clear_ghosts(ai, cl):
    return ai.lua("""(function()%s
      local n = 0
      for _, g in pairs(s.find_entities_filtered{ghost_name = {'gun-turret', 'stone-wall'}, position = C, radius = R + 16}) do g.destroy() n = n + 1 end
      return {cleared = n}
    end)()""" % common(cl))


def pickup(ai, cl):
    return ai.lua("""(function()%s
      if #foes() > 0 then return {foes = #foes()} end
      local n = 0
      for _, t in pairs(zone_turrets()) do t.order_deconstruction(f) n = n + 1 end
      return {marked = n}
    end)()""" % common(cl))


def log(entry):
    try:
        L = json.load(open(LOG, encoding="utf-8"))
    except (OSError, ValueError):
        L = []
    L.append(entry)
    json.dump(L, open(LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=0)


def watch(ai, cl, every, minutes, low, fill):
    end = time.time() + minutes * 60
    s0 = status(ai, cl)
    base = {k: s0[k] for k in ("lost", "killed_sp", "killed_worm", "killed_units")}
    prev, bad = dict(base), 0
    log({"t": time.strftime("%X"), "cluster": cl, "start": s0})
    while time.time() < end:
        try:
            ai = ai or AIBridge()
            t = tend(ai, cl, low, fill)
            s = status(ai, cl)
        except (RconError, OSError) as e:
            print(time.strftime("%X"), "오류", e, flush=True)
            ai = None
            time.sleep(every)
            continue
        foes = s.get("foes") or []
        foes = list(foes.values()) if isinstance(foes, dict) else foes
        d = {k: s[k] - base[k] for k in base}
        step = {k: s[k] - prev[k] for k in base}
        prev = {k: s[k] for k in base}
        print(time.strftime("%X"), f"적구조 {len(foes)} {foes} 유닛 {s['units']} | 포탑 {s['built']} 무장 {s['armed']} 탄 {s['ammo']} 유령 {s['tghost']} "
              f"망 피어싱 {s.get('net_ammo')} 포탑 {s.get('net_turrets')} | 누계 잃음 {d['lost']} 둥지 {d['killed_sp']} 벌레 {d['killed_worm']} 유닛 {d['killed_units']} | {t}", flush=True)
        if step["lost"] > step["killed_sp"] + step["killed_worm"] and step["lost"] >= 3:
            bad += 1
            print(time.strftime("%X"), f"손실 > 이득 ({step['lost']} > {step['killed_sp'] + step['killed_worm']}) - {bad} 번째", flush=True)
        if bad >= 2:
            print(time.strftime("%X"), "두 번 - 멈춤, 구역 유령 지움", clear_ghosts(ai, cl), flush=True)
            log({"t": time.strftime("%X"), "cluster": cl, "stop": "losses", "d": d})
            return
        if not foes:
            print(time.strftime("%X"), "구역 적 구조물 0 - 끝", flush=True)
            log({"t": time.strftime("%X"), "cluster": cl, "done": d, "evo": s["evo"]})
            return
        time.sleep(every)
    log({"t": time.strftime("%X"), "cluster": cl, "timeout": {k: prev[k] - base[k] for k in base}})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--cluster", default="nw", choices=tuple(CLUSTERS))
    ap.add_argument("--harvest", action="store_true")
    ap.add_argument("--stock", action="store_true")
    ap.add_argument("--strike", action="store_true")
    ap.add_argument("--partial", action="store_true", help="망 재고가 모자라도 놓기")
    ap.add_argument("--fill", type=int, default=20)
    ap.add_argument("--low", type=int, default=10)
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--stage", action="store_true")
    ap.add_argument("--leap", action="store_true")
    ap.add_argument("--watch", action="store_true")
    ap.add_argument("--pickup", action="store_true")
    ap.add_argument("--clear", action="store_true")
    ap.add_argument("--every", type=int, default=20)
    ap.add_argument("--minutes", type=float, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    if a.harvest:
        print("harvest", harvest(ai))
    if a.stock:
        print("stock", stock(ai, a.cluster))
    if a.strike:
        r = strike(ai, a.cluster, a.fill, a.partial)
        print("strike", r)
        log({"t": time.strftime("%X"), "cluster": a.cluster, "strike": r})
    if a.stage:
        print("stage", stage(ai, a.cluster, a.fill))
    if a.leap:
        r = leap(ai, a.cluster, a.fill)
        print("leap", r)
        log({"t": time.strftime("%X"), "cluster": a.cluster, "leap": r})
    if a.status:
        print(json.dumps(status(ai, a.cluster), ensure_ascii=False))
    if a.clear:
        print(clear_ghosts(ai, a.cluster))
    if a.pickup:
        print("pickup", pickup(ai, a.cluster))
    if a.watch:
        watch(ai, a.cluster, a.every, a.minutes, a.low, a.fill)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

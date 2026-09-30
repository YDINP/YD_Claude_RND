"""Run 24: 기지 곁 둥지 치기 - 레이저 먼저 한꺼번에 (laser burst creep), 사람 0 · 로봇만.

nwcreep24 (15:4x) 실패 = 총 포탑 (사거리 18) 을 하나씩 → 탄 없이 먹힘. p10retake24 (17:4x) 성공 = 레이저 (24, 탄 필요 없음, 체력 1,000) 먼저.
→ 무리마다 «레이저가 둥지 · 벌레 모두에 닿는 자리» (벌레 중심 ≤ 24 · 둥지 ≤ 25.5) 에 레이저 + 전봇대 + 뒤에 총 포탑 (피어싱 insert_plan) 을 한 번에 유령.
   망에 레이저 · 포탑 · 전봇대가 다 있을 때만. 벌레가 먼저 쏘기는 하지만 레이저 여럿이 한꺼번에 서면 작은 벌레 200 · 중형 500 은 몇 초.

  plan   --cluster nw           : 자리마다 can_place manual · 같은 이름 선/유령 · 전기 닿음 (계획 전봇대 포함) 검사, 망 재고
  burst  --cluster nw           : 망 재고가 되면 전봇대 · 레이저 · 총 포탑 · 벽 유령 한 번에
  status --cluster nw           : 구역 적 구조물 · 유닛 · 우리 것 (체력 · 탄 · 잡은 수) · 유령 · 로봇 잃음
  pickup --cluster nw           : 구역 적 구조물 0 이면 이번에 놓은 것 해체 표시 (로봇이 망으로, search_radius 0.3)
  unghost --cluster nw          : 이번 계획의 남은 유령 지움 (로봇 잃음 막기)

Lua 아이템 이동 0 · 적에 Lua 피해 0 · force.chart 0.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
from client import AIBridge  # noqa: E402

AMMO = "piercing-rounds-magazine"
FILL = 30
LOG = os.path.join(HERE, "..", "state", "run24_strike_log.json")

CLUSTERS = {
    # 북서 (18:1x 조회): 바이터 둥지 (-66,-153) · 중형 벌레 (-68,-149) · 작은 벌레 (-60,-156) (-61,-149). 둘레 큰 이빨 2 · 중형 4.
    # 아래 레이저 자리는 넷 모두에 닿음 (벌레 ≤ 24 · 둥지 ≤ 25.5, can_place manual). 전봇대는 (-32.5,-121.5) 망 1 끝에서 줄.
    "nw": {"port": (-19, -102), "area": [[-80, -170], [-35, -135]],
           "poles": [(-38.5, -127.5), (-44.5, -133.5), (-47.5, -139.5), (-45.5, -145.5), (-50.5, -136.5)],
           "lasers": [(-44, -145), (-45, -142), (-46, -139), (-48, -136), (-50, -134), (-47, -144), (-48, -141), (-50, -138), (-52, -136)],
           "guns": [(-41, -135), (-43, -130), (-40, -138)],
           "walls": []},
    # 북 (18:2x): 둥지 7 (18.5,-243.5) (25.5,-258.5) (32.5,-255.5) (29.5,-265.5) (21.5,-269.5) (9.5,-272.5) (22.5,-280.5) · 작은 벌레 4 (17.6,-249.6) (19,-259.5) (15.5,-260.8) (19.8,-264.6).
    # 전봇대 줄 (15.5,-134.5 → -211) + 로보포트 (15,-182). 1 단: 맨 앞 둥지 (18.5,-243.5) 에만 닿고 벌레 넷에서 26.5 넘게.
    "n1": {"port": (15, -182), "area": [[-5, -290], [45, -235]],
           "poles": [(15.5, -216.5), (22.5, -216.5), (8.5, -216.5), (28.5, -216.5)],
           "lasers": [(10, -220), (14, -219), (17, -219), (20, -219), (23, -219), (27, -220)],
           "guns": [], "walls": []},
    # 1 단 실패 (18:3x): 레이저 6 이 하나씩 서자 둥지 무리 ~50 (큰 침 8 · 중형 침 12 · 이빨) 이 몰려와 14 대 · 로봇 5 잃음.
    # 2 단 = 요새 먼저: 둥지에서 37 넘게 (y -199/-205) 레이저 16 + 총 포탑 8 (피어싱 30) + 벽 한 줄 → 다 선 뒤에 앞 무리 (n1) 를 다시.
    "n2": {"port": (15, -182), "area": [[-5, -290], [45, -235]],
           "poles": [(8.5, -202), (22.5, -202), (29.5, -202), (1.5, -202)],
           "lasers": [(x, -199) for x in (5, 8, 12, 19, 22, 26, 29, 32)] + [(9, -206), (12, -203)] + [(x, -205) for x in (19, 22, 26, 29, 32)],
           "guns": [(x, -209) for x in (4, 7, 11, 13, 19, 22, 25, 28)],
           "walls": [(x + 0.5, -212.5) for x in range(1, 33) if x not in (15, 16)]},
}


def lua_common(c):
    return """
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local N = s.find_logistic_network_by_position({%f, %f}, f)
  local function have(name, p) return s.count_entities_filtered{position = p, radius = 0.3, name = name} + s.count_entities_filtered{position = p, radius = 0.3, ghost_name = name} end
  local function place(name, p, fill, make)
    if have(name, p) > 0 then return 'skip' end
    if not s.can_place_entity{name = name, position = p, force = f, build_check_type = defines.build_check_type.manual} then return 'blocked' end
    if not make then return 'ok' end
    local g = s.create_entity{name = 'entity-ghost', inner_name = name, position = p, force = f}
    if g and fill > 0 then pcall(function() g.insert_plan = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = fill}}}}} end) end
    return g and 'ghost' or 'fail'
  end
  local function foes() return s.find_entities_filtered{area = A, force = 'enemy', type = {'unit-spawner', 'turret'}} end
""" % (json.dumps(c["area"]), c["port"][0], c["port"][1], AMMO)


def plan(ai, cl, make):
    c = CLUSTERS[cl]
    spec = {"poles": [list(p) for p in c["poles"]], "lasers": [list(p) for p in c["lasers"]],
            "guns": [list(p) for p in c["guns"]], "walls": [list(p) for p in c["walls"]]}
    return ai.lua("""(function()%s
      local P = helpers.json_to_table('%s')
      local out = {net = {laser = N.get_item_count('laser-turret'), gun = N.get_item_count('gun-turret'), pole = N.get_item_count('medium-electric-pole'),
                          wall = N.get_item_count('stone-wall'), ammo = N.get_item_count('%s'), avail = N.available_construction_robots}}
      local need = {laser = 0, gun = 0, pole = 0, wall = 0}
      for _, p in pairs(P.lasers) do if have('laser-turret', p) == 0 then need.laser = need.laser + 1 end end
      for _, p in pairs(P.guns) do if have('gun-turret', p) == 0 then need.gun = need.gun + 1 end end
      for _, p in pairs(P.poles) do if have('medium-electric-pole', p) == 0 then need.pole = need.pole + 1 end end
      for _, p in pairs(P.walls) do if have('stone-wall', p) == 0 then need.wall = need.wall + 1 end end
      out.need = need
      -- 전기: 레이저 칸 (2x2) 이 계획/선 중형 전봇대 공급 칸 (3.5) 과 겹치나
      local pw = {}
      for i, p in pairs(P.lasers) do
        local ok = false
        for _, q in pairs(P.poles) do if math.abs(q[1] - p[1]) < 4.5 and math.abs(q[2] - p[2]) < 4.5 then ok = true end end
        for _, pl in pairs(s.find_entities_filtered{type = 'electric-pole', force = f, position = p, radius = 9}) do
          local r = pl.prototype.get_supply_area_distance()
          if math.abs(pl.position.x - p[1]) < r + 1 and math.abs(pl.position.y - p[2]) < r + 1 then ok = true end
        end
        pw[#pw + 1] = ok and 1 or 0
      end
      out.powered = pw
      -- 전선: 계획 전봇대가 앞 전봇대 (또는 선 전봇대) 와 9 안
      local wire = {}
      for i, q in pairs(P.poles) do
        local ok = false
        for j = 1, i - 1 do local r = P.poles[j] if (q[1] - r[1])^2 + (q[2] - r[2])^2 <= 81 then ok = true end end
        for _, pl in pairs(s.find_entities_filtered{type = 'electric-pole', force = f, position = q, radius = 9}) do if pl.electric_network_id then ok = true end end
        wire[#wire + 1] = ok and 1 or 0
      end
      out.wired = wire
      local short = (N.get_item_count('laser-turret') < need.laser) or (N.get_item_count('gun-turret') < need.gun) or (N.get_item_count('medium-electric-pole') < need.pole)
                    or (N.get_item_count('stone-wall') < need.wall) or (N.get_item_count('%s') < need.gun * %d)
      out.short = short
      local mk = %s and not short
      local r = {}
      for _, p in pairs(P.poles) do r[#r + 1] = 'P' .. p[1] .. ',' .. p[2] .. ' ' .. place('medium-electric-pole', p, 0, mk) end
      for _, p in pairs(P.lasers) do r[#r + 1] = 'L' .. p[1] .. ',' .. p[2] .. ' ' .. place('laser-turret', p, 0, mk) end
      for _, p in pairs(P.guns) do r[#r + 1] = 'G' .. p[1] .. ',' .. p[2] .. ' ' .. place('gun-turret', p, %d, mk) end
      for _, p in pairs(P.walls) do r[#r + 1] = 'W' .. p[1] .. ',' .. p[2] .. ' ' .. place('stone-wall', p, 0, mk) end
      out.res = r
      out.tick = game.tick
      return out
    end)()""" % (lua_common(c), json.dumps(spec), AMMO, AMMO, FILL, "true" if make else "false", FILL))


def status(ai, cl):
    c = CLUSTERS[cl]
    mine = [list(p) for k in ("poles", "lasers", "guns", "walls") for p in c[k]]
    return ai.lua("""(function()%s
      local o = {tick = game.tick}
      local E = {}
      for _, e in pairs(foes()) do E[#E + 1] = e.name .. ' ' .. math.floor(e.position.x) .. ',' .. math.floor(e.position.y) .. ' hp' .. math.floor(e.health) end
      o.foes = E
      o.units = s.count_entities_filtered{area = A, force = 'enemy', type = 'unit'}
      local M = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{position = p, radius = 0.3, force = f}[1]
        if not e then M[#M + 1] = p[1] .. ',' .. p[2] .. ' none'
        elseif e.type == 'entity-ghost' then M[#M + 1] = p[1] .. ',' .. p[2] .. ' ghost:' .. e.ghost_name
        else
          local x = e.name:sub(1, 3) .. ' ' .. p[1] .. ',' .. p[2] .. ' hp' .. math.floor(e.health)
          if e.type == 'ammo-turret' then x = x .. ' a' .. e.get_inventory(defines.inventory.turret_ammo).get_item_count() .. ' k' .. e.kills end
          if e.type == 'electric-turret' then x = x .. ' k' .. e.kills .. ' e' .. math.floor(e.energy / 1000) end
          M[#M + 1] = x
        end
      end
      o.mine = M
      local st = f.get_kill_count_statistics(s)
      o.lost = {robot = st.get_output_count('construction-robot'), laser = st.get_output_count('laser-turret'), gun = st.get_output_count('gun-turret'), pole = st.get_output_count('medium-electric-pole')}
      local k = game.forces.enemy.get_kill_count_statistics(s)
      o.enemy_killed = {spawner = f.get_kill_count_statistics(s).get_input_count('biter-spawner') + f.get_kill_count_statistics(s).get_input_count('spitter-spawner'),
                        small_worm = f.get_kill_count_statistics(s).get_input_count('small-worm-turret'), medium_worm = f.get_kill_count_statistics(s).get_input_count('medium-worm-turret'),
                        big_worm = f.get_kill_count_statistics(s).get_input_count('big-worm-turret')}
      o.net_avail = N.available_construction_robots
      return o
    end)()""" % (lua_common(c), json.dumps(mine)))


def pickup(ai, cl, force_it):
    c = CLUSTERS[cl]
    mine = [[k, list(p)] for k, n in (("poles", "medium-electric-pole"), ("lasers", "laser-turret"), ("guns", "gun-turret"), ("walls", "stone-wall")) for p in c[k]]
    return ai.lua("""(function()%s
      local left = #foes()
      if left > 0 and not %s then return {left = left, marked = 0} end
      local names = {poles = 'medium-electric-pole', lasers = 'laser-turret', guns = 'gun-turret', walls = 'stone-wall'}
      local m = 0
      for _, kp in pairs(helpers.json_to_table('%s')) do
        for _, e in pairs(s.find_entities_filtered{position = kp[2], radius = 0.3, name = names[kp[1]], force = f}) do e.order_deconstruction(f) m = m + 1 end
      end
      return {left = left, marked = m}
    end)()""" % (lua_common(c), "true" if force_it else "false", json.dumps(mine)))


def unghost(ai, cl):
    c = CLUSTERS[cl]
    mine = [list(p) for k in ("poles", "lasers", "guns", "walls") for p in c[k]]
    return ai.lua("""(function() local s = game.surfaces[1] local n = 0
      for _, p in pairs(helpers.json_to_table('%s')) do
        for _, g in pairs(s.find_entities_filtered{position = p, radius = 0.3, type = 'entity-ghost', force = 'player'}) do g.destroy() n = n + 1 end
      end return {removed = n} end)()""" % json.dumps(mine))


def corridor(ai, start, x, y_end, make, step=8.5):
    """중형 전봇대 줄: start (선 전봇대) 에서 x 줄을 따라 y_end 까지 북쪽으로 - 칸마다 x ±0..3 · y 되물림 0..3 에서 can_place manual 첫 칸."""
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local prev = {%f, %f} local out = {} local X, YE, ST, MK = %f, %f, %f, %s
      local y = prev[2]
      while y - ST > YE - 0.01 do
        local done = false
        for back = 0, 3 do
          for _, dx in pairs({0, 1, -1, 2, -2, 3, -3}) do
            local p = {X + dx, y - ST + back}
            if not done and (p[1] - prev[1])^2 + (p[2] - prev[2])^2 <= 81 then
              local have = s.count_entities_filtered{position = p, radius = 0.3, name = 'medium-electric-pole'} + s.count_entities_filtered{position = p, radius = 0.3, ghost_name = 'medium-electric-pole'}
              if have > 0 then out[#out + 1] = p[1] .. ',' .. p[2] .. ' have' done = true prev = p
              elseif s.can_place_entity{name = 'medium-electric-pole', position = p, force = f, build_check_type = defines.build_check_type.manual}
                     and s.count_entities_filtered{area = {{p[1] - 0.5, p[2] - 0.5}, {p[1] + 0.5, p[2] + 0.5}}, type = 'entity-ghost'} == 0 then
                if MK then s.create_entity{name = 'entity-ghost', inner_name = 'medium-electric-pole', position = p, force = f} end
                out[#out + 1] = p[1] .. ',' .. p[2] .. (MK and ' ghost' or ' ok') done = true prev = p
              end
            end
          end
        end
        if not done then out[#out + 1] = 'stuck at ' .. y break end
        y = prev[2]
      end
      return out
    end)()""" % (start[0], start[1], x, y_end, step, "true" if make else "false"))


def ghost_one(ai, name, p, make):
    return ai.lua("""{r = (function() local s, f = game.surfaces[1], game.forces.player local p = {%f, %f}
      if s.count_entities_filtered{position = p, radius = 0.3, name = '%s'} + s.count_entities_filtered{position = p, radius = 0.3, ghost_name = '%s'} > 0 then return 'have' end
      if not s.can_place_entity{name = '%s', position = p, force = f, build_check_type = defines.build_check_type.manual} then return 'blocked' end
      if s.count_entities_filtered{area = {{p[1] - 2, p[2] - 2}, {p[1] + 2, p[2] + 2}}, type = 'entity-ghost'} > 0 then return 'ghost_overlap' end
      if %s then s.create_entity{name = 'entity-ghost', inner_name = '%s', position = p, force = f} return 'ghost' end
      return 'ok' end)()}""" % (p[0], p[1], name, name, name, "true" if make else "false", name))


def spots(ai, spec):
    """spec = {box: [x1,y1,x2,y2], reach: [[x,y,d]...] (중심 거리 ≤ d), avoid: [[x,y,d]...] (≥ d), n, gap}
    → can_place manual 레이저 자리 (서로 gap 넘게), avoid 여유가 큰 순."""
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player local S = helpers.json_to_table('%s')
      local c = {}
      for y = S.box[2], S.box[4] do for x = S.box[1], S.box[3] do
        local ok, m = true, 999
        for _, t in pairs(S.reach) do if (x - t[1])^2 + (y - t[2])^2 > t[3]^2 then ok = false end end
        for _, t in pairs(S.avoid) do local d = math.sqrt((x - t[1])^2 + (y - t[2])^2) - t[3] if d < 0 then ok = false end if d < m then m = d end end
        if ok and s.can_place_entity{name = 'laser-turret', position = {x, y}, force = f, build_check_type = defines.build_check_type.manual}
           and s.count_entities_filtered{area = {{x - 1, y - 1}, {x + 1, y + 1}}, type = 'entity-ghost'} == 0 then c[#c + 1] = {x, y, m} end
      end end
      table.sort(c, function(a, b) return a[3] > b[3] end)
      local out = {}
      for _, p in pairs(c) do
        if #out >= S.n then break end
        local ok = true
        for _, q in pairs(out) do if math.abs(p[1] - q[1]) < S.gap and math.abs(p[2] - q[2]) < S.gap then ok = false end end
        if ok then out[#out + 1] = p end
      end
      return {cand = #c, spots = out}
    end)()""" % json.dumps(spec))


def log(entry):
    try:
        L = json.load(open(LOG, encoding="utf-8"))
    except Exception:
        L = []
    L.append(entry)
    json.dump(L, open(LOG, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step")
    ap.add_argument("--cluster", default="nw")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--make", action="store_true")
    ap.add_argument("--start", default="15.5,-134.5")
    ap.add_argument("--x", type=float, default=15.5)
    ap.add_argument("--yend", type=float, default=-185)
    ap.add_argument("--name", default="roboport")
    ap.add_argument("--at", default="15,-182")
    ap.add_argument("--spec", default="{}")
    a = ap.parse_args()
    ai = AIBridge()
    if a.step == "plan":
        r = plan(ai, a.cluster, False)
    elif a.step == "burst":
        r = plan(ai, a.cluster, True)
        log({"t": time.strftime("%H:%M:%S"), "cluster": a.cluster, "step": "burst", "r": r})
    elif a.step == "status":
        r = status(ai, a.cluster)
        log({"t": time.strftime("%H:%M:%S"), "cluster": a.cluster, "step": "status", "r": r})
    elif a.step == "pickup":
        r = pickup(ai, a.cluster, a.force)
    elif a.step == "corridor":
        r = corridor(ai, [float(v) for v in a.start.split(",")], a.x, a.yend, a.make)
    elif a.step == "ghost":
        r = ghost_one(ai, a.name, [float(v) for v in a.at.split(",")], a.make)
    elif a.step == "spots":
        r = spots(ai, json.loads(a.spec))
    elif a.step == "unghost":
        r = unghost(ai, a.cluster)
    else:
        raise SystemExit("step?")
    print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""run24 탄 위기 (2026-09-30 15:4x) - 피어싱 전용 블록 둘 (노랑 1 → 피어싱 2).

실측 15:39 (10분): 피어싱 만듦 583 / 씀 231 (포탑이 비어 쓸 탄이 없음) · 노랑 707 / 1,441 · 망 피어싱 -8 · 노랑 21 · 망 철 -3 ·
  탄 < 5 포탑 25 (NW 15 대 0 발) · 철 광석 10분 9.1k (드릴 26 working) - 철판 9.1k / 씀 11.4k (강철 3.6k · 회로 1.7k · 노랑 2.8k).
  옛 탄창 조립기 5 대 item_ingredient_shortage (ammo24 로봇 요청은 망 철 ≥ 100 일 때만) · ammoplus 노랑 (43.5) 도 철 굶음.
  → 탄 상한은 조립기가 아니라 «망에 들어오는 철». 허브 분배기를 허브 우선으로 (ironsplit 문턱 2500/4000 → 1200/2000, 망 강철 3.2k)
    해 강철 기둥 몫 (철 10분 ~3.6k) 을 망 → 탄 요청 상자로 돌리고, 그 철을 피어싱으로만 쓰는 블록을 더한다 (철 한 판당 피어싱이 노랑보다 1.6 배).

블록 (가로 12 × 세로 7, 망 R_M 안 x 24..35 · y -60..-54 / -51..-45, 전봇대 (24.5, -61.5 · -52.5 · -43.5) 곁):

    y+0   PP  .  .  .  RQ철 .  .  .  PP/상자        결과 상자 (칸 제한 4 = 800)
    y+1   i↑  .  P  .  fi↓  .  P  .  i↑             P = 중형 전봇대
    y+2..4 [피어싱 A] i← [노랑] →i [피어싱 B]        조립기 2 셋 - 노랑 0.75/s 중 0.5/s 를 피어싱 둘이 먹음
    y+5   i↓  .  P  .  .   .  P  .  i↓
    y+6   RQ  .  .  .  .   .  .  .  RQ              강철 30 · 구리 60

  한 블록 = 피어싱 0.5/s (10분 300) · 철 2/s. 노랑은 망으로 안 나감 (모두 피어싱).
  둘째 블록 B 쪽 결과는 망 밖 쇠 상자 (EAST_RESERVE) - 동쪽 전초 몫. eastsup (echo) 가 망 피어싱과 상관없이 여기서 먼저 챙긴다.

    python scripts/ammoplus2_24.py check|ghosts|need|kit|config|status

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 건물 · 유령 선 칸 건너뜀) · 조리법 · 요청 · 칸 제한 설정 · 사람 손 (손제작 → 저장 상자 → 로봇).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
from ammoplus24 import LUA_PLACE  # noqa: E402

N, E, S, W = 0, 4, 8, 12            # 팔 방향 = 집는 쪽
OWNER = "ammoplus2"
STORE = (59.5, -14.5)               # 망 저장 상자 (허브 곁)
HUB_IRON = (74.5, -15.5)            # 망 밖 허브 쇠 상자 (철)
AM2, INS, FI, MPOLE = "assembling-machine-2", "inserter", "fast-inserter", "medium-electric-pole"
PP, RQ, SC = "passive-provider-chest", "requester-chest", "steel-chest"
YEL, PRC = "firearm-magazine", "piercing-rounds-magazine"
BLOCKS = [(24, -60), (24, -51)]
EAST_RESERVE = (BLOCKS[1][0] + 10.5, BLOCKS[1][1] + 0.5)    # (34.5, -50.5)

G = []          # (name, x, y, d, recipe)
RECIPES, REQUESTS, BARS = [], [], []


def add(name, x, y, d=N, recipe=None):
    G.append((name, float(x), float(y), d, recipe))


for i, (ox, oy) in enumerate(BLOCKS):
    add(PP, ox + 2.5, oy + 0.5)
    add(INS, ox + 2.5, oy + 1.5, S)                 # 피어싱 A → 결과 상자
    add(RQ, ox + 6.5, oy + 0.5)
    add(FI, ox + 6.5, oy + 1.5, N)                  # 철 요청 → 노랑
    outb = SC if i == 1 else PP
    add(outb, ox + 10.5, oy + 0.5)
    add(INS, ox + 10.5, oy + 1.5, S)                # 피어싱 B → 결과 상자 (둘째 블록 = 동쪽 몫)
    add(AM2, ox + 2.5, oy + 3.5, N, PRC)
    add(INS, ox + 4.5, oy + 3.5, E)                 # 노랑 → 피어싱 A
    add(AM2, ox + 6.5, oy + 3.5, N, YEL)
    add(INS, ox + 8.5, oy + 3.5, W)                 # 노랑 → 피어싱 B
    add(AM2, ox + 10.5, oy + 3.5, N, PRC)
    add(INS, ox + 2.5, oy + 5.5, S)                 # 강철 · 구리 → 피어싱 A
    add(RQ, ox + 2.5, oy + 6.5)
    add(INS, ox + 10.5, oy + 5.5, S)
    add(RQ, ox + 10.5, oy + 6.5)
    for px in (4.5, 8.5):
        for py in (1.5, 5.5):
            add(MPOLE, ox + px, oy + py)
    RECIPES += [((ox + 2.5, oy + 3.5), PRC), ((ox + 6.5, oy + 3.5), YEL), ((ox + 10.5, oy + 3.5), PRC)]
    REQUESTS += [((ox + 6.5, oy + 0.5), {"iron-plate": 100}),
                 ((ox + 2.5, oy + 6.5), {"steel-plate": 30, "copper-plate": 60, YEL: 20}),
                 ((ox + 10.5, oy + 6.5), {"steel-plate": 30, "copper-plate": 60, YEL: 20})]
    # 15:5x 코디네이터: delta 가 남서 유전 상자의 노랑 ~1,800 을 저장 상자로 → 망 노랑도 피어싱 재료로 (철 굶을 때도 피어싱 조립기가 돎)
    BARS += [((ox + 2.5, oy + 0.5), 4), ((ox + 10.5, oy + 0.5), 4)]


def place(ai, make):
    rows = [[n, x, y, d, r or ""] for n, x, y, d, r in G]
    return ai.lua(LUA_PLACE % ("true" if make else "false", json.dumps(rows)))


def need(ai):
    want = {}
    for n, *_ in G:
        want[n] = want.get(n, 0) + 1
    have = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {}
      for _, k in pairs(helpers.json_to_table('%s')) do o[k] = n.get_item_count(k) end
      for _, q in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3} > 0 then o[q[1]] = (o[q[1]] or 0) + 1 end
      end
      return o end)()""" % (json.dumps(list(want)), json.dumps([[n, x, y] for n, x, y, *_ in G])))
    return {k: max(0, v - int(have.get(k, 0))) for k, v in want.items()}


def srcs(ai, names):
    """망 (R_M) 에서 name 이 가장 많이 든 상자 {name: [x, y, count]}."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {}
      for _, name in pairs(helpers.json_to_table('%s')) do
        local best
        for _, kind in pairs({'storage', 'passive_provider'}) do
          for _, pt in pairs(n[kind .. '_points'] or {}) do
            local c = pt.owner
            if c and c.valid and c.type == 'logistic-container' then
              local h = c.get_item_count(name)
              if h > 0 and (not best or h > best[3]) then best = {c.position.x, c.position.y, h} end
            end
          end
        end
        o[name] = best
      end
      return o end)()""" % json.dumps(names))


def kit(ai, who):
    """who: 망 상자 (회로 · 고급회로 · 강철 · 쇠 상자) · 허브 철 → 손제작 → 저장 상자 → 로봇이 유령에."""
    from orders import submit
    o = detached.owner(who)
    if o and o not in (OWNER, "ammorun"):          # ammorun = 코디네이터의 탄 손 운반 (같은 탄 일) - 그 이름 그대로 이어 씀
        return {"skip": f"{who} owner {o}"}
    tag = o or OWNER
    os.environ[detached.ENV] = tag
    miss = need(ai)
    a, r, p, sc = miss.get(AM2, 0), miss.get(RQ, 0), miss.get(PP, 0), miss.get(SC, 0)
    fi, ins = miss.get(FI, 0), miss.get(INS, 0)
    ins_all = ins + fi                                    # 빠른 팔 = 팔 + 회로 2 + 철 2
    chests = r + p + sc                                   # 저장 상자 쇠 상자 8
    circ = 6 * a + ins_all + 2 * fi + 3 * (r + p) + 4
    adv = r + p
    steel = 2 * a + 4
    iron = 29 * a + 3 * ins_all + 2 * fi + 10             # 조립기 1 (철 9 · 톱니 5) + 톱니 5 · 팔 (톱니 · 철)
    src = srcs(ai, ["electronic-circuit", "advanced-circuit", "steel-plate"])
    detached.mark([who], tag, minutes=25)
    plan = []

    def take(name, k):
        s = src.get(name)
        if s and k > 0:
            plan.extend([("walk_to", {"x": s[0], "y": s[1] + 1.5}), ("take", {"name": name, "x": s[0], "y": s[1], "count": int(min(k, s[2]))})])

    take("electronic-circuit", circ)
    take("advanced-circuit", adv)
    take("steel-plate", steel)
    plan += [("walk_to", {"x": HUB_IRON[0], "y": HUB_IRON[1] + 1.5}), ("take", {"name": "iron-plate", "x": HUB_IRON[0], "y": HUB_IRON[1], "count": iron})]
    plan += [("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5})]
    if chests:
        plan.append(("take", {"name": SC, "x": STORE[0], "y": STORE[1], "count": chests}))
    for n, q in (("assembling-machine-1", a), (AM2, a), (INS, ins_all), (FI, fi), (RQ, r), (PP, p)):
        if q:
            plan.append(("craft", {"recipe": n, "count": q, "wait": "block"}))
    for n, q in ((AM2, a), (RQ, r), (PP, p), (SC, sc), (FI, fi), (INS, ins)):
        if q:
            plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": q}))
    res = submit(ai, who, plan, strict=False)
    return {"miss": miss, "take": {"circ": circ, "adv": adv, "steel": steel, "iron": iron, "chests": chests}, "src": src,
            "steps": len(plan), "sent": res is not None}


LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {recipe = {}, req = {}, bar = {}}
  for _, q in pairs(A.recipes) do
    local e = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.recipe[#out.recipe + 1] = q[2] .. ' none'
    elseif e.get_recipe() and e.get_recipe().name == q[2] then out.recipe[#out.recipe + 1] = q[2] .. ' ok'
    elseif e.get_recipe() then out.recipe[#out.recipe + 1] = q[2] .. ' other'
    else e.set_recipe(q[2]); out.recipe[#out.recipe + 1] = q[2] .. ' set' end
  end
  for _, q in pairs(A.requests) do
    local e = s.find_entities_filtered{name = 'requester-chest', force = f, position = q[1], radius = 0.3}[1]
    if not e then out.req[#out.req + 1] = 'none ' .. q[1][1] .. ',' .. q[1][2]
    else
      local lp = e.get_requester_point()
      local sec = lp.sections[1] or lp.add_section()
      local i = 1
      for name, cnt in pairs(q[2]) do sec.set_slot(i, {value = name, min = cnt}); i = i + 1 end
      out.req[#out.req + 1] = 'ok ' .. q[1][1] .. ',' .. q[1][2] .. ' ' .. sec.filters_count
    end
  end
  for _, q in pairs(A.bars) do
    local e = s.find_entities_filtered{type = 'container', force = f, position = q[1], radius = 0.3}[1]
           or s.find_entities_filtered{type = 'logistic-container', force = f, position = q[1], radius = 0.3}[1]
    if e then e.get_inventory(defines.inventory.chest).set_bar(q[2] + 1); out.bar[#out.bar + 1] = 'ok ' .. e.name .. ' ' .. q[1][1] .. ',' .. q[1][2]
    else out.bar[#out.bar + 1] = 'none ' .. q[1][1] .. ',' .. q[1][2] end
  end
  return out
end)()"""


def config(ai):
    arg = {"recipes": [[list(p), r] for p, r in RECIPES], "requests": [[list(p), q] for p, q in REQUESTS],
           "bars": [[list(p), b] for p, b in BARS]}
    return ai.lua(LUA_CONFIG % json.dumps(arg))


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local function c(k, P) return math.floor(st.get_flow_count{name = k, category = 'input', precision_index = P, count = true}) .. '/' ..
                                     math.floor(st.get_flow_count{name = k, category = 'output', precision_index = P, count = true}) end
      local M, T = defines.flow_precision_index.one_minute, defines.flow_precision_index.ten_minutes
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local o = {tick = game.tick, pierce = c('%s', T) .. ' (1m ' .. c('%s', M) .. ')', yellow = c('%s', T) .. ' (1m ' .. c('%s', M) .. ')',
                 iron = c('iron-plate', T), net = {p = n.get_item_count('%s'), y = n.get_item_count('%s'), iron = n.get_item_count('iron-plate'),
                 steel = n.get_item_count('steel-plate')}, asm = {}, low = 0}
      for _, t in pairs(s.find_entities_filtered{type = 'ammo-turret', force = f}) do
        if t.get_inventory(defines.inventory.turret_ammo).get_item_count() < 5 then o.low = o.low + 1 end
      end
      local stn = {}
      for k, v in pairs(defines.entity_status) do stn[v] = k end
      for _, e in pairs(s.find_entities_filtered{type = 'assembling-machine', force = f}) do
        local r = e.get_recipe()
        if r and (r.name == '%s' or r.name == '%s') then
          o.asm[#o.asm + 1] = e.position.x .. ',' .. e.position.y .. ' ' .. r.name:sub(1, 4) .. ' ' .. (stn[e.status] or '?')
        end
      end
      local rc = s.find_entities_filtered{name = 'steel-chest', position = {%f, %f}, radius = 0.3}[1]
      o.east_reserve = rc and rc.get_item_count('%s') or -1
      o.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = f, area = {{23, -61}, {37, -43}}}
      return o end)()""" % (PRC, PRC, YEL, YEL, PRC, YEL, PRC, YEL, EAST_RESERVE[0], EAST_RESERVE[1], PRC))


# 15:5x 코디네이터: NW 무리 포탑 8 대 (탄 0~3) 를 먼저 - ammo24 는 망 탄 short 로 건너뜀. 망에 탄이 들어오면 로봇 요청 (item-request-proxy) 을 먼저 건다.
NW_FIRST = [(-33, -125), (-33, -123), (-31, -125), (-31, -123), (-26, -111), (-26, -109), (-24, -111), (-24, -109)]
NW_FILL = 30

LUA_NW = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
  local left = {['%s'] = n.get_item_count('%s'), ['%s'] = n.get_item_count('%s')}
  local out = {req = {}, skip = {}}
  local TI = defines.inventory.turret_ammo
  for _, q in pairs(helpers.json_to_table('%s')) do
    local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = {q[1] + 0.5, q[2] + 0.5}, radius = 1}[1]
    if not t then out.skip[#out.skip + 1] = q[1] .. ',' .. q[2] .. ' none'
    elseif s.count_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.6} > 0 then out.skip[#out.skip + 1] = q[1] .. ',' .. q[2] .. ' busy'
    else
      local inv = t.get_inventory(TI)
      local have = inv.get_item_count()
      local cur = (inv[1].valid_for_read and inv[1].name.name) or nil
      local want
      for _, it in pairs({'%s', '%s'}) do
        if not want and left[it] >= %d and (cur == nil or cur == it) then want = it end
      end
      if have >= 10 then out.skip[#out.skip + 1] = q[1] .. ',' .. q[2] .. ' ok ' .. have
      elseif not want then out.skip[#out.skip + 1] = q[1] .. ',' .. q[2] .. ' short ' .. (cur or '-')
      else
        s.create_entity{name = 'item-request-proxy', position = t.position, force = f, target = t,
          modules = {{id = {name = want}, items = {in_inventory = {{inventory = TI, stack = 0, count = %d}}}}}}
        left[want] = left[want] - %d
        out.req[#out.req + 1] = want:sub(1, 4) .. ' @' .. q[1] .. ',' .. q[2] .. ' had ' .. have
      end
    end
  end
  out.net = left
  return out
end)()"""


def nwfill(ai):
    """로봇 요청만 (Lua 는 요청을 만들 뿐, 탄은 로봇이 망 상자에서 나른다). 든 탄과 같은 종류 · 피어싱 먼저."""
    return ai.lua(LUA_NW % (PRC, PRC, YEL, YEL, json.dumps(NW_FIRST), PRC, YEL, NW_FILL, NW_FILL, NW_FILL))


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    ai = AIBridge()
    if step == "kit":
        who = sys.argv[2] if len(sys.argv) > 2 else "foxtrot"
        print(json.dumps(kit(ai, who), ensure_ascii=False))
        return
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "need": need,
          "config": config, "status": status, "nwfill": nwfill}[step]
    print(json.dumps(fn(ai), ensure_ascii=False))


if __name__ == "__main__":
    main()

"""북쪽 정유 2 대 advanced 전환 (로켓 계획 P0 잔여, 09-28).

조사 (tick ~20.94M):
  * 북쪽 정유 R1 (-13.5,-50.5) · R2 (-5.5,-50.5) 는 남향 (d8). advanced 출구 = 가스 (x-2) · 경유 (x) · 중유 (x+2), 모두 y=-47.5 (A 줄).
    물 입구 (x+1, -53.5). 지금은 A 줄 관 하나 (x -19.5..2.5) 가 출구를 다 덮어 basic 에 묶여 있다 -> 가스 10분 21k.
  * 황 공장 (-14.5,-43.5) 가스 입구 (-13.5,-45.5) 가 R1 경유 출구 바로 밑 -> R1 경유는 A 줄 옆으로만 뺄 수 있다.
  * A 줄 밑 빈 주머니 (x -12.5..-2.5, y -46.5..-43.5), 정유 사이 틈 (x -10.5..-8.5), 북동 빈 터 (x 0..14, y -56..-49).
  * 망: 화학 공장 0 · 관 8 · 지하관 5, 관 조립기 3 대 출력 100 씩, 톱니 조립기 출력 100 씩, 회로 40.

설계 (오프라인 유체 연결 검사기 scripts/fluidnet.py 로 단계별 섞임 0 확인 - 영역 덤프 + 추가/해체 목록 -> 관 덩어리별 유체):
  가스  G1 -> 서쪽 관 (서쪽 플라스틱) + 새 가스 간선 y=-56.5 (x=-17.5 지하관 세로로 A 줄에서 올림)
        G2 -> 주머니 (-7.5,-46.5) -> 황 (지하 -8.5 <-> -12.5, y=-45.5) · 동쪽 플라스틱 (지하 -6.5 <-> -0.5, y=-46.5)
        경유 분해 2 대 출력 -> 간선 -> 지하 (2.5,-55.5) <-> (2.5,-46.5) -> 동쪽 플라스틱 두 번째 입구. 가스 한 덩어리.
  경유  L1 -> 지하 (-12.5 <-> -10.5, A) -> (-9.5,A) <- 지하 (-6.5 <-> -8.5, A) <- L2. (-9.5,-48.5) -> 지하 R2 밑 (-8.5 <-> -0.5, y=-48.5)
        -> (0.5,-48.5) 세로 -> 경유 분해 LC1 (1.5,-53.5) · LC2 (6.5,-53.5) (둘 다 남향, 출력이 간선으로). 중유 분해 출력도 이 줄로.
  중유  H1 -> 주머니 (-11.5 세로 -> y=-43.5 동쪽 -> -3.5 세로) -> H2 -> 지하 (-2.5 <-> 0.5, A) -> (1.5..2.5,A) -> (2.5,-49.5)
        -> 지하 (3.5 <-> 12.5, y=-49.5) -> 중유 분해 HC (11.5,-51.5) 동향.
  물    기존 물 줄 y=-58.5 을 x 13.5 까지 늘리고, 간선을 지하로 건너 (3.5/8.5/13.5) 분해 3 대. 정유 물 입구는 지하 세로 (-12.5 · -4.5).
  전력  작은 전봇대 (4.5,-53.5) (9.5,-52.5) <- (8.5,-48.5).

단계 (가스 공급을 끊지 않게 한 대씩):
  A   간선 · 물 · 분해 3 대 · 경유/중유 북동쪽 · 주머니 가스 우회 (오늘 가스와 같은 유체만 잇는다)
  B1  R2: A 줄 (-10.5 · -8.5 · -6.5 · -4.5 · -2.5 · -1.5 · -0.5 · 0.5) 해체 -> 남은 관 가스 비움 -> 지하관 · 주머니 중유 줄 -> advanced
  B2  R1: (-14.5 · -12.5, A) (-13.5,-46.5) 해체 -> 비움 -> 지하관 · 중유 세로 -> advanced
  L   가스 두 덩어리 잇기 (주머니 <-> 서쪽 A 줄, R2 · 원유관 밑 지하) - 18:25 실측 뒤 추가
전환 뒤 yellowlab23 가 세 정유 모두 advanced 고정 (full_output 때만 basic 6 분).

    python -u scripts/northadv23.py survey
    python -u scripts/northadv23.py make        # 관 조립기 둘을 빌려 지하관 · 화학 공장 (망 재고만), 끝나면 관으로 되돌림
    python -u scripts/northadv23.py restore     # 빌린 조립기 즉시 되돌림
    python -u scripts/northadv23.py stage A|B1|B2|L
    python -u scripts/northadv23.py check
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "northadv23.log")
N_, E_, S_, W_ = 0, 4, 8, 12
A, B, C, D, E = -47.5, -46.5, -45.5, -44.5, -43.5
N1, HW = -48.5, -56.5
P, U, CP, SP = "pipe", "pipe-to-ground", "chemical-plant", "small-electric-pole"
R1, R2 = (-13.5, -50.5), (-5.5, -50.5)
LC1, LC2, HC = (1.5, -53.5), (6.5, -53.5), (11.5, -51.5)

STAGES = {}
_a = [(P, x + 0.5, HW, 0) for x in range(-17, 8)]
_a += [(U, -17.5, N1, S_), (U, -17.5, HW, N_), (P, -17.5, -57.5, 0), (P, -16.5, -57.5, 0)]
_a += [(P, x + 0.5, -58.5, 0) for x in range(-5, 14)]
for _x in (3.5, 8.5, 13.5):
    _a += [(U, _x, -57.5, N_), (U, _x, -55.5, S_)]
_a += [(P, 2.5, -51.5, 0), (P, 3.5, -51.5, 0), (P, 3.5, -52.5, 0), (P, 3.5, -53.5, 0), (P, 3.5, -54.5, 0),
       (P, 7.5, -51.5, 0), (P, 8.5, -51.5, 0), (P, 8.5, -52.5, 0), (P, 8.5, -53.5, 0), (P, 8.5, -54.5, 0),
       (P, 13.5, -52.5, 0), (P, 13.5, -53.5, 0), (P, 13.5, -54.5, 0)]
_a += [(U, -12.5, -57.5, N_), (U, -12.5, -53.5, S_), (U, -4.5, -57.5, N_), (U, -4.5, -53.5, S_)]
_a += [(CP, LC1[0], LC1[1], S_, "light-oil-cracking"), (CP, LC2[0], LC2[1], S_, "light-oil-cracking"),
       (CP, HC[0], HC[1], E_, "heavy-oil-cracking")]
_a += [(P, 0.5, -55.5, 0), (P, 5.5, -55.5, 0), (P, 7.5, -55.5, 0), (U, 2.5, -55.5, N_), (U, 2.5, B, S_)]
_a += [(P, 0.5, -49.5, 0), (P, 0.5, -50.5, 0), (P, 0.5, -51.5, 0),
       (U, 1.5, -50.5, W_), (U, 3.5, -50.5, E_), (P, 4.5, -50.5, 0), (P, 5.5, -50.5, 0), (P, 5.5, -51.5, 0),
       (U, 6.5, -50.5, W_), (U, 8.5, -50.5, E_), (P, 9.5, -50.5, 0)]
_a += [(P, 2.5, -49.5, 0), (U, 3.5, -49.5, W_), (U, 12.5, -49.5, E_), (P, 13.5, -49.5, 0), (P, 13.5, -50.5, 0)]
_a += [(P, -7.5, B, 0), (P, -7.5, C, 0), (U, -8.5, C, E_), (U, -12.5, C, W_), (U, -6.5, B, W_), (U, -0.5, B, E_)]
_a += [(SP, 4.5, -53.5, 0), (SP, 9.5, -52.5, 0)]
STAGES["A"] = {"remove": [(P, 2.5, B)], "add": _a, "clear": [], "refinery": None}

_b1 = [(U, -8.5, A, W_), (U, -6.5, A, E_), (U, -2.5, A, W_), (U, 0.5, A, E_),
       (P, -9.5, N1, 0), (U, -8.5, N1, W_), (U, -0.5, N1, E_), (P, 0.5, N1, 0), (P, 2.5, N1, 0)]
_b1 += [(P, x + 0.5, E, 0) for x in range(-11, -3)]
_b1 += [(P, -10.5, D, 0), (P, -3.5, D, 0), (P, -3.5, C, 0), (P, -3.5, B, 0)]
STAGES["B1"] = {"remove": [(P, x, A) for x in (-10.5, -8.5, -6.5, -4.5, -2.5, -1.5, -0.5, 0.5)], "add": _b1,
                "clear": [(-9.5, A), (-5.5, A), (-3.5, A), (1.5, A), (2.5, A)], "refinery": R2}
STAGES["B2"] = {"remove": [(P, -14.5, A), (P, -12.5, A), (P, -13.5, B)],
                "add": [(U, -12.5, A, W_), (U, -10.5, A, E_), (P, -11.5, B, 0), (P, -11.5, C, 0), (P, -11.5, D, 0)],
                "clear": [(-13.5, A), (-11.5, A)], "refinery": R1}

# L (18:25 실측 뒤 추가): 가스가 두 관 덩어리로 갈려 있었다 - 주머니 (G2 · 황 · 동쪽 플라스틱 한쪽) / 간선 (G1 · 분해 · 서쪽 플라스틱).
#   동쪽 플라스틱 기계 속으로는 가스가 넘어가지 않아 황은 굶고 (petro 0~20), 서쪽 플라스틱이 출력 가득이라 간선 쪽은 넘쳐 R1 full_output.
#   주머니 (-7.5,-45.5) -> (-6.5,-5.5, -45.5) -> 지하 세로 R2 밑 (-5.5,-46.5 <-> -53.5) -> (-5.5,-54.5)
#   -> 지하 가로 원유관 밑 (-6.5 <-> -16.5, y=-54.5) -> (-17.5,-18.5, -54.5) -> 지하 세로 (-18.5,-53.5 <-> -49.5) -> (-18.5,-48.5) -> 서쪽 A 줄.
STAGES["L"] = {"remove": [], "clear": [], "refinery": None,
               "add": [(P, -6.5, C, 0), (P, -5.5, C, 0), (U, -5.5, B, S_), (U, -5.5, -53.5, N_), (P, -5.5, -54.5, 0),
                       (U, -6.5, -54.5, E_), (U, -16.5, -54.5, W_), (P, -17.5, -54.5, 0), (P, -18.5, -54.5, 0),
                       (U, -18.5, -53.5, N_), (U, -18.5, -49.5, S_), (P, -18.5, N1, 0)]}

# 유체별 검사 지점 (섞임 0 확인)
LIGHT = [(-13.5, A), (-9.5, A), (-5.5, A), (-9.5, N1), (0.5, N1), (0.5, -51.5), (5.5, -51.5), (9.5, -50.5)]
HEAVY = [(-11.5, A), (-11.5, D), (-6.5, E), (-3.5, B), (-3.5, A), (1.5, A), (2.5, -49.5), (13.5, -50.5)]
GAS = [(-16.5, A), (-7.5, B), (-13.5, C), (0.5, B), (-5.5, HW), (0.5, -55.5), (7.5, -55.5), (-5.5, C), (-17.5, -54.5)]
WATER = [(-4.5, -58.5), (13.5, -54.5), (8.5, -51.5), (3.5, -51.5)]
KIND = {"light-oil": LIGHT, "heavy-oil": HEAVY, "petroleum-gas": GAS, "water": WATER}

# make: 관 조립기 둘 빌림 (출력 100 가득 - 관 소비가 적다)
PIPE_ASM = [(-10.5, -29.5), (-28.5, -29.5), (17.5, -4.5)]
MAKER_PTG, MAKER_CP = (-10.5, -29.5), (-28.5, -29.5)
GEAR_ASM = [(-14.5, -66.5), (-28.5, -37.5), (-28.5, -21.5), (2.5, -24.5), (14.5, -24.5), (13.5, -8.5), (26.5, -24.5)]


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def items(stage_names):
    need = {}
    for s in stage_names:
        for t in STAGES[s]["add"]:
            need[t[0]] = need.get(t[0], 0) + 1
    return need


def lua_items(ts):
    out = []
    for t in ts:
        rec = ("'%s'" % t[4]) if len(t) > 4 and t[4] else "nil"
        out.append("{'%s', %s, %s, %d, %s}" % (t[0], t[1], t[2], t[3], rec))
    return "{" + ", ".join(out) + "}"


HEAD = """local s = game.surfaces[1] local net = nil
  for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local function at(name, x, y) return s.find_entities_filtered{name = name, position = {x, y}, radius = 0.3}[1] end
  local function ghost(name, x, y) return s.find_entities_filtered{ghost_name = name, position = {x, y}, radius = 0.3}[1] end
  local function anyfluid(x, y) return s.find_entities_filtered{type = {'pipe', 'pipe-to-ground'}, position = {x, y}, radius = 0.3}[1] end
"""


def survey(ai, stage):
    st = STAGES[stage]
    r = ai.lua("""(function() """ + HEAD + """
      local o = {blocked = {}, have = 0}
      for _, t in pairs(%s) do
        if at(t[1], t[2], t[3]) or ghost(t[1], t[2], t[3]) then o.have = o.have + 1
        else
          local ok = s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
                                        build_check_type = defines.build_check_type.manual_ghost}
          if not ok then local b = s.find_entities_filtered{position = {t[2], t[3]}, radius = 0.45}
            o.blocked[#o.blocked + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ' by ' .. (b[1] and b[1].name or '?') end
        end
      end
      o.net = {} for _, k in pairs({'pipe', 'pipe-to-ground', 'chemical-plant', 'small-electric-pole'}) do o.net[k] = net.get_item_count(k) end
      o.empty_stacks = 0 for _, c in pairs(net.storages) do o.empty_stacks = o.empty_stacks + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
      return o end)()""" % lua_items(st["add"]))
    return r


MAKE = """(function() """ + HEAD + """
  local o = {}
  local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] end
  local function outp(a) return a.get_inventory(defines.inventory.assembling_machine_output) end
  local function inp(a) return a.get_inventory(defines.inventory.assembling_machine_input) end
  local function tonet(inv, name, n) if n <= 0 then return 0 end local k = net.insert{name = name, count = n} if k > 0 then inv.remove{name = name, count = k} end return k end
  -- 필요 = 계획 중 아직 지어지지 않은 칸 수 (로봇이 가져가 망 재고가 줄어도 더 만들지 않게)
  local NEED = {['pipe'] = 0, ['pipe-to-ground'] = 0, ['chemical-plant'] = 0}
  for _, t in pairs(%(plan)s) do if NEED[t[1]] and not at(t[1], t[2], t[3]) then NEED[t[1]] = NEED[t[1]] + 1 end end
  o.need = NEED
  local have = {} for k in pairs(NEED) do have[k] = net.get_item_count(k) end
  -- 관: 관 조립기 출력 -> 망 (필요한 만큼 + 지하관 재료)
  local pipe_want = NEED['pipe'] + 10 * math.ceil(math.max(0, NEED['pipe-to-ground'] - have['pipe-to-ground']) / 2) + 5 * math.max(0, NEED['chemical-plant'] - have['chemical-plant'])
  o.pipe_want = pipe_want
  for _, p in pairs(%(pipe_asm)s) do local a = asm(p)
    if a and a.get_recipe() and a.get_recipe().name == 'pipe' then local k = math.min(outp(a).get_item_count('pipe'), pipe_want - net.get_item_count('pipe'))
      if k > 0 then o.pipe_moved = (o.pipe_moved or 0) + tonet(outp(a), 'pipe', k) end end end
  local function run(p, recipe, need, restore)
    local a = asm(p) if not a then return 'no asm' end
    local cur = a.get_recipe() and a.get_recipe().name
    local out = outp(a)
    local made = out.get_item_count(recipe) if made > 0 then tonet(out, recipe, made) end
    if net.get_item_count(recipe) >= need or %(stop)s then
      if cur ~= restore then local back = a.set_recipe(restore) for _, it in pairs(back or {}) do if it.count and it.count > 0 then net.insert{name = it.name, count = it.count} end end end
      return 'done'
    end
    if cur ~= recipe then
      for _, it in pairs(out.get_contents()) do tonet(out, it.name, it.count) end
      local back = a.set_recipe(recipe) for _, it in pairs(back or {}) do if it.count and it.count > 0 then net.insert{name = it.name, count = it.count} end end
    end
    local I = inp(a)
    for _, ing in pairs(prototypes.recipe[recipe].ingredients) do
      local want = ing.amount * 2 - I.get_item_count(ing.name)
      if want > 0 then
        local floor = (ing.name == 'iron-plate') and 3000 or ((ing.name == 'steel-plate') and 500 or 0)
        local got = 0
        if ing.name == 'iron-gear-wheel' then
          for _, gp in pairs(%(gear_asm)s) do local g = asm(gp) if g and got < want then
            local k = math.min(want - got, outp(g).get_item_count('iron-gear-wheel')) if k > 0 then k = I.insert{name = 'iron-gear-wheel', count = k} outp(g).remove{name = 'iron-gear-wheel', count = k} got = got + k end end end
        else
          local k = math.min(want, net.get_item_count(ing.name) - floor)
          if k > 0 then k = net.remove_item{name = ing.name, count = k} local put = I.insert{name = ing.name, count = k} if put < k then net.insert{name = ing.name, count = k - put} end got = put end
        end
        o[recipe .. ':' .. ing.name] = got
      end
    end
    return (a.status == defines.entity_status.working) and 'working' or ('st' .. a.status)
  end
  o.ptg = run(%(mptg)s, 'pipe-to-ground', NEED['pipe-to-ground'], 'pipe')
  o.cp = run(%(mcp)s, 'chemical-plant', NEED['chemical-plant'], 'pipe')
  for k in pairs(NEED) do o['net_' .. k] = net.get_item_count(k) end
  o.done = (o.ptg == 'done' and o.cp == 'done' and net.get_item_count('pipe') >= NEED['pipe']) and 1 or 0
  return o end)()"""


def pos_lua(ps):
    return "{" + ", ".join("{%s, %s}" % p for p in ps) + "}"


def make(ai, stages=("A", "B1", "B2", "L"), stop=False):
    plan = [t for s in stages for t in STAGES[s]["add"]]
    last = None
    for _ in range(240):
        r = ai.lua(MAKE % {"plan": lua_items(plan), "stop": "true" if stop else "false",
                           "pipe_asm": pos_lua(PIPE_ASM), "gear_asm": pos_lua(GEAR_ASM),
                           "mptg": "{%s, %s}" % MAKER_PTG, "mcp": "{%s, %s}" % MAKER_CP})
        msg = json.dumps(r, ensure_ascii=False, sort_keys=True)
        if msg != last:
            say("make " + msg)
            last = msg
        if r.get("done") or stop:
            return r
        time.sleep(5)
    return r


def mark_remove(ai, rem):
    return ai.lua("""(function() """ + HEAD + """
      local o = {marked = 0, gone = 0}
      for _, t in pairs(%s) do local e = at(t[1], t[2], t[3])
        if e then if not e.to_be_deconstructed() then e.order_deconstruction('player') end o.marked = o.marked + 1 else o.gone = o.gone + 1 end end
      return o end)()""" % ("{" + ", ".join("{'%s', %s, %s}" % t for t in rem) + "}"))


def clear(ai, ps):
    return ai.lua("""(function() """ + HEAD + """
      local o = {cleared = {}}
      for _, p in pairs(%s) do local e = anyfluid(p[1], p[2])
        if e then local f = e.fluidbox[1] if f then o.cleared[#o.cleared + 1] = p[1] .. ',' .. p[2] .. ':' .. f.name end e.clear_fluid_inside() end end
      return o end)()""" % pos_lua(ps))


def place(ai, add):
    return ai.lua("""(function() """ + HEAD + """
      local o = {made = 0, have = 0, fail = {}}
      for _, t in pairs(%s) do
        if at(t[1], t[2], t[3]) or ghost(t[1], t[2], t[3]) then o.have = o.have + 1
        else
          local gh = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', expires = false}
          if gh then o.made = o.made + 1 if t[5] then pcall(function() gh.set_recipe(t[5]) end) end
          else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
        end
      end return o end)()""" % lua_items(add))


def pending(ai, add):
    return ai.lua("""(function() """ + HEAD + """
      local o = {ghost = 0, built = 0, missing = {}}
      for _, t in pairs(%s) do
        if at(t[1], t[2], t[3]) then o.built = o.built + 1
        elseif ghost(t[1], t[2], t[3]) then o.ghost = o.ghost + 1
        else o.missing[#o.missing + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
      end return o end)()""" % lua_items(add))


def fluids(ai):
    """유체별 검사 지점 내용물 -> 다른 유체가 들어 있으면 섞임."""
    body = []
    for kind, ps in KIND.items():
        body.append("{'%s', %s}" % (kind, pos_lua(ps)))
    return ai.lua("""(function() """ + HEAD + """
      local o = {bad = {}, seen = {}}
      for _, kp in pairs({%s}) do local kind = kp[1]
        for _, p in pairs(kp[2]) do local e = anyfluid(p[1], p[2])
          local f = e and e.fluidbox[1]
          if f then o.seen[kind] = (o.seen[kind] or 0) + 1
            if f.name ~= kind then o.bad[#o.bad + 1] = kind .. '@' .. p[1] .. ',' .. p[2] .. '=' .. f.name end end
        end end
      return o end)()""" % ", ".join(body))


def set_ref(ai, pos, rec):
    return ai.lua("""(function() local R = game.surfaces[1].find_entities_filtered{name = 'oil-refinery', position = {%s, %s}, radius = 1}[1]
      if not R then return {err = 'no refinery'} end
      local cur = R.get_recipe() and R.get_recipe().name
      if cur ~= '%s' then R.set_recipe('%s') end return {was = cur, now = R.get_recipe().name} end)()""" % (pos[0], pos[1], rec, rec))


def stage(ai, name):
    st = STAGES[name]
    if st["remove"]:
        for _ in range(120):
            r = mark_remove(ai, st["remove"])
            if r.get("marked", 0) == 0:
                break
            time.sleep(3)
        say("%s 해체 %s" % (name, r))
        if r.get("marked", 0):
            say("%s 해체가 안 끝남 - 중단" % name)
            return 1
    if st["clear"]:
        say("%s 남은 관 비움 %s" % (name, clear(ai, st["clear"])))
    say("%s 유령 %s" % (name, place(ai, st["add"])))
    for i in range(200):
        r = pending(ai, st["add"])
        if not r.get("ghost") and not r.get("missing"):
            break
        if i % 10 == 0:
            say("%s 건설 대기 %s" % (name, r))
        time.sleep(6)
    say("%s 건설 %s" % (name, r))
    if r.get("ghost") or r.get("missing"):
        return 1
    if st["refinery"]:
        f = fluids(ai)
        if f.get("bad"):
            say("%s 섞임 -> 경유/중유 쪽 비움 %s" % (name, f))
            clear(ai, LIGHT + HEAVY)
            f = fluids(ai)
        say("%s 유체 %s" % (name, f))
        if f.get("bad"):
            return 1
        say("%s 정유 %s -> advanced %s" % (name, st["refinery"], set_ref(ai, st["refinery"], "advanced-oil-processing")))
    return 0


def check(ai):
    r = ai.lua("""(function() local s = game.surfaces[1] local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
      local o = {}
      for _, p in pairs({{%s, %s}, {%s, %s}, {23.5, 11.5}, {%s, %s}, {%s, %s}, {%s, %s}, {16.5, 6.5}, {-14.5, -43.5}, {1.5, -44.5}, {-21.5, -34.5}}) do
        local e = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
        if e then local f = {} for i = 1, #e.fluidbox do local fl = e.fluidbox[i] f[#f + 1] = fl and (fl.name:sub(1, 5) .. math.floor(fl.amount)) or '-' end
          o[#o + 1] = p[1] .. ',' .. p[2] .. ' ' .. (e.get_recipe() and e.get_recipe().name or '-') .. ' ' .. names[e.status] .. ' ' .. table.concat(f, '|') end
      end return {m = o} end)()""" % (R1 + R2 + LC1 + LC2 + HC))
    m = r.get("m")
    r["m"] = list(m.values()) if isinstance(m, dict) else m
    r["fluids"] = fluids(ai)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["survey", "make", "restore", "stage", "check", "measure"])
    ap.add_argument("name", nargs="?", default="A")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "survey":
        for n in STAGES:
            say("조사 %s %s" % (n, json.dumps(survey(ai, n), ensure_ascii=False)))
        say("필요 %s" % items(STAGES))
    elif a.cmd == "make":
        make(ai)
    elif a.cmd == "restore":           # 빌린 조립기 둘을 관 레시피로 되돌림
        make(ai, stop=True)
    elif a.cmd == "stage":
        return stage(ai, a.name)
    elif a.cmd == "check":
        say("점검 " + json.dumps(check(ai), ensure_ascii=False))
    else:
        from refadv23 import measure
        measure(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

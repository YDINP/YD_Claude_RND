"""대포 포탑 · 포탄 생산줄 미리 깔기 - 23회차 (2026-09-27, artillery 연구 75% 시점).

목표: 연구가 끝나는 즉시 대포 포탑 1대와 포탄을 만들어 (-210,-244) 철 전초 둘레 산란기 2 · 땅벌레 7, 북서 (-217,-129) 둥지를 포격한다.
철이 모자라니 최소 규모 - 포탑 1 + 포탄 1차 20발 (목표 50).

조사 (tick ~16.35M):
  · 연구됨: explosives · concrete · military-3/4 (explosive-cannon-shell 레시피 열림). 잠김: artillery-shell · artillery-turret.
  · 망은 로보포트 13 칸 한 덩어리. 망 재고에는 강철 10 · 벽돌 36 · 철광 33 · 철판 1,231 · 석탄 104 뿐 - 황(1,600 철상자 (-16.5,-33.5)) ·
    강철(468 허브 철상자 (-73.5,-52.5)) · 플라스틱(1,598 (4.5,-44.5)) 은 일반 상자라 로봇이 못 가져간다 -> 먹이 고리 주문으로 저장 상자에 옮긴다.
    톱니 · 전자회로 · 고급회로 · 콘크리트 · 폭약은 상자 재고 0 -> 손제작 주문.
  · 물: 지하 물 줄 y=-58.5 의 노출 관 (-28.5,-58.5) 북쪽에서 딴다.

배치 (빈 자리 x -29..-18, y -73..-59, 전봇대 x=-34.5 줄에 잇는다, delta 함정 구역 x18..34 y-12..14 와 무관):
    y -72.5  물관 -> 화학 공장 입력 (-25.5,-72.5)
    P  화학 공장 (-24.5,-70.5) N  explosives        -> 팔 (-25.5,-68.5) -> ECS · 팔 (-23.5,-68.5) -> SHELL
    ECS 조립기1 (-26.5,-66.5)  explosive-cannon-shell -> 팔 (-24.5,-66.5) -> SHELL
    SHELL 조립기1 (-22.5,-66.5) (연구 후 artillery-shell) -> 팔 (-21.5,-68.5) -> 철상자 (-21.5,-69.5)
    RADAR 조립기1 (-18.5,-66.5) radar                 -> 팔 (-20.5,-66.5) -> SHELL
    CONC 조립기2 (-26.5,-61.5) S concrete (물은 아래 (-26.5,-59.5)) -> 팔 (-24.5,-61.5) -> TUR
    TUR 조립기1 (-22.5,-61.5) (연구 후 artillery-turret) -> 팔 (-20.5,-61.5) -> 철상자 (-19.5,-61.5)
  원료는 로봇 proxy 로 기계 입력 칸에 직접 (대상당 100 이하), 중간재는 팔로 잇는다.
  완성품은 일반 철상자라 망 밖 -> --deliver 가 사람에게 저장 상자로 옮기게 주문하고, 포탑 유령 · 포탄 proxy 를 건다.

    python -u scripts/artyprep23.py --survey            # 자리 · 연구 · 재고 · 포탑 자리 후보
    python -u scripts/artyprep23.py --need [--shells 50]  # 재료 요구량 대 재고 (부족분)
    python -u scripts/artyprep23.py --order             # 자재 · 원료 주문 (yellow23_orders.json, 빈 사람만)
    python -u scripts/artyprep23.py --place             # 유령 배치 (열린 레시피만 설정)
    python -u scripts/artyprep23.py --check             # 건설 · 전력 · 유체 · 상태
    python -u scripts/artyprep23.py --after-research    # 연구 완료 뒤: SHELL/TUR 레시피 설정
    python -u scripts/artyprep23.py --feed [--shells 20] [--loop 60]  # 원료 proxy (분 단위 반복)
    python -u scripts/artyprep23.py --deliver           # 완성품 -> 저장 상자 주문 · 포탑 유령 · 포탄 proxy
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "artyprep23.log")
ORDERS = os.path.join(HERE, "..", "state", "yellow23_orders.json")
N, E, S, W = 0, 4, 8, 12

STORE = (-60.5, -33.5)              # 망 저장 상자 (석탄 104 · 돌 147 있음)
HUB_STEEL = (-73.5, -52.5)          # 강철 468 (철상자)
HUB_IRON = (-83.5, -52.5)           # 철판 754 (패시브)
HUB_IRON2 = (-82.5, -52.5)          # 철판 452 (패시브)
SULFUR = (-16.5, -33.5)             # 황 1,600
PLASTIC = (4.5, -44.5)              # 플라스틱 1,598
COAL = (-1.5, -30.5)                # 석탄 165
COPPER = (-23.5, -8.5)              # 구리 189
COPPER2 = (-22.5, -8.5)             # 구리 172

M = {  # 이름: (기계, x, y, 방향, 연구 전 레시피, 연구 후 레시피)
    "P": ("chemical-plant", -24.5, -70.5, N, "explosives", None),
    "ECS": ("assembling-machine-1", -26.5, -66.5, N, "explosive-cannon-shell", None),
    "SHELL": ("assembling-machine-1", -22.5, -66.5, N, None, "artillery-shell"),
    "RADAR": ("assembling-machine-1", -18.5, -66.5, N, "radar", None),
    "CONC": ("assembling-machine-2", -26.5, -61.5, S, "concrete", None),
    "TUR": ("assembling-machine-1", -22.5, -61.5, N, None, "artillery-turret"),
}
SHELL_BOX = (-21.5, -69.5)
TUR_BOX = (-19.5, -61.5)
GHOSTS = [(m[0], m[1], m[2], m[3]) for m in M.values()] + [
    # 팔: 방향 = 집는 쪽
    ("inserter", -25.5, -68.5, N), ("inserter", -23.5, -68.5, N), ("inserter", -21.5, -68.5, S),
    ("inserter", -24.5, -66.5, W), ("inserter", -20.5, -66.5, E),
    ("inserter", -24.5, -61.5, W), ("inserter", -20.5, -61.5, W),
    ("iron-chest", SHELL_BOX[0], SHELL_BOX[1], N), ("iron-chest", TUR_BOX[0], TUR_BOX[1], N),
    # 전기 (<- (-34.5,-65.5) · (-34.5,-61.5))
    ("small-electric-pole", -28.5, -63.5, N), ("small-electric-pole", -24.5, -63.5, N),
    ("small-electric-pole", -20.5, -63.5, N), ("small-electric-pole", -24.5, -68.5, N),
    ("small-electric-pole", -20.5, -68.5, N),
    # 물: 노출 관 (-28.5,-58.5) 북쪽 -> CONC 입력 (-26.5,-59.5), 지하관으로 x=-28.5 를 올라 P 입력 (-25.5,-72.5)
    ("pipe", -28.5, -59.5, N), ("pipe", -27.5, -59.5, N), ("pipe", -26.5, -59.5, N),
    ("pipe-to-ground", -28.5, -60.5, S), ("pipe-to-ground", -28.5, -70.5, N),
    ("pipe", -28.5, -71.5, N), ("pipe", -28.5, -72.5, N), ("pipe", -27.5, -72.5, N),
    ("pipe", -26.5, -72.5, N), ("pipe", -25.5, -72.5, N),
]
BUILD = {"chemical-plant": 1, "assembling-machine-1": 4, "assembling-machine-2": 1, "inserter": 7,
         "iron-chest": 2, "small-electric-pole": 5, "pipe": 8, "pipe-to-ground": 2}
# 벽 안 북서 - 두 표적 모두 사거리 224 안. 앞에서부터 놓을 수 있는 첫 자리.
# 22:32 사용자가 1호 (-119.5,-99.5, 로봇망 밖) 를 걷고 NW 전진 포트 (-170.5,-94.5) 에 유령을 놓음 - 그 자리 우선
# 23:40 사용자 "대포는 기존에 있는걸 옮겨서" - NW 둥지 정리 끝, 남서 둥지 4무리 사거리 안 (-85.5,30.5) 로 이전
# 09-28 남서 사거리 안 산란기 0 · 땅벌레 0 -> 북동 벽 안 (33.5,-100.5, 망 2) 로 이전 (scripts/copperprep23.py).
#   북 둥지 (55,-200) · (136,-120) · (140,-230) 와 (14,-312) 일부를 친다 - 구리 전초 (52,-401) 경로 청소 1단계
SPOT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state", "arty_spot.json")


def arty_spots():
    """artyaim23 가 사거리 안이 비면 포대를 옮길 자리를 state/arty_spot.json 에 적는다 - 그 자리를 맨 앞에.
    키트 이전 중 (artykit23) 에는 로보포트 · 포탑 링이 서기 전 (rp · ring) 엔 유령을 놓지 않고, 그 뒤엔 새 자리만."""
    try:
        import artykit23
        st = artykit23.moving_stage()
        if st in ("rp", "ring"):
            return []
        if st:
            return [tuple(artykit23.load()["move"]["to"])]
    except Exception:  # noqa: BLE001
        pass
    try:
        with open(SPOT_FILE, encoding="utf-8") as f:
            x, y = json.load(f)
        return [(x, y)] + ARTY_SPOTS
    except Exception:  # noqa: BLE001
        return ARTY_SPOTS


ARTY_SPOTS = [(33.5, -100.5), (31.5, -99.5), (-85.5, 30.5), (-170.5, -94.5), (-120, -100), (-124, -96), (-116, -96), (-128, -92), (-120, -90), (-110, -92)]
TARGETS = [(-210, -244), (-217, -129)]

# 원료 proxy 목표 (기계 입력 칸, 대상당 100 이하)
FEED = {
    "P": {"coal": 50, "sulfur": 50},
    "ECS": {"steel-plate": 40, "plastic-bar": 40},
    "RADAR": {"iron-plate": 50, "iron-gear-wheel": 25, "electronic-circuit": 25},
    "CONC": {"iron-ore": 6, "stone-brick": 30},
    "TUR": {"steel-plate": 60, "iron-gear-wheel": 40, "advanced-circuit": 20},
}


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def lua_list(rows):
    return ", ".join("{'%s', %s, %s, %d}" % t for t in rows)


def need(shells, turrets=1):
    """포탄 n 발 + 포탑 t 대의 원재료 (손제작 중간재 포함)."""
    expl = shells * 8 + shells * 4 * 2                     # 포탄 8 + 폭발 포탄 4발 x 2
    crafts = expl // 2                                     # explosives 1회 = 2개
    r = {"steel-plate": shells * 4 * 2 + 60 * turrets, "plastic-bar": shells * 4 * 2,
         "coal": crafts, "sulfur": crafts, "water": crafts * 10 + 600 * turrets,
         "iron-plate": shells * 10, "iron-gear-wheel": shells * 5 + 40 * turrets,
         "electronic-circuit": shells * 5, "advanced-circuit": 20 * turrets,
         "stone-brick": 30 * turrets, "iron-ore": 6 * turrets, "explosives": expl, "concrete": 60 * turrets}
    return r


STOCK_LUA = """(function() local s = game.surfaces[1] local f = game.forces.player local o = {chest = {}, net = {}}
  local want = {%s}
  for _, e in pairs(s.find_entities_filtered{type = {'container', 'logistic-container'}, force = 'player'}) do
    local inv = e.get_inventory(defines.inventory.chest)
    if inv then for _, k in pairs(want) do local v = inv.get_item_count(k) if v > 0 then o.chest[k] = (o.chest[k] or 0) + v end end end
  end
  local n = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, k in pairs(want) do local v = n and n.get_item_count(k) or 0 if v > 0 then o.net[k] = v end end
  return o end)()"""


def stock(ai, names):
    return ai.lua(STOCK_LUA % ", ".join("'%s'" % k for k in names))


def survey(ai):
    spots = ", ".join("{%s, %s}" % p for p in arty_spots())
    return ai.lua("""(function() local s = game.surfaces[1] local f = game.forces.player local o = {place = {}, spot = {}}
      for _, t in pairs({%s}) do
        local ok = s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
                                      build_check_type = defines.build_check_type.manual_ghost}
        if not ok then o.place[#o.place + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
      end
      o.research = f.current_research and f.current_research.name o.progress = math.floor(f.research_progress * 1000) / 10
      o.rec = {}
      for _, r in pairs({'explosives', 'explosive-cannon-shell', 'concrete', 'radar', 'artillery-shell', 'artillery-turret'}) do o.rec[r] = f.recipes[r].enabled end
      for _, p in pairs({%s}) do
        local ok = s.can_place_entity{name = 'artillery-turret', position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost}
        local rp = s.find_entities_filtered{name = 'roboport', position = p, radius = 50, limit = 1}[1]
        o.spot[#o.spot + 1] = p[1] .. ',' .. p[2] .. (ok and ' ok' or ' X') .. (rp and ' rp' or ' -')
      end
      local pipe = s.find_entities_filtered{name = 'pipe', position = {-28.5, -58.5}, radius = 0.3}[1]
      o.water = pipe and pipe.fluidbox[1] and (pipe.fluidbox[1].name .. ':' .. math.floor(pipe.fluidbox[1].amount)) or 'none'
      return o end)()""" % (lua_list(GHOSTS), spots))


def show_need(ai, shells):
    r = need(shells)
    st = stock(ai, [k for k in r if k != "water"])
    ch, net = st.get("chest") or {}, st.get("net") or {}
    short = {}
    for k, v in r.items():
        if k == "water":
            continue
        have = ch.get(k, 0)
        if have < v:
            short[k] = v - have
    say("요구량 포탄 %d + 포탑 1: %s" % (shells, json.dumps(r, ensure_ascii=False)))
    say("상자 재고 %s / 망 %s" % (json.dumps(ch, ensure_ascii=False), json.dumps(net, ensure_ascii=False)))
    say("부족 (상자 기준, 폭약 · 콘크리트는 이 줄이 만든다): " + json.dumps(short, ensure_ascii=False))
    return short


def _orders():
    try:
        with open(ORDERS, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def put(who, plan):
    from yellow23 import put_order
    if who in _orders():
        say("주문 건너뜀: %s 에게 아직 안 받은 주문이 있다" % who)
        return False
    put_order(who, plan)
    return True


def walk(x, y):
    return ("walk_to", {"x": x, "y": y})


def ins(name, at, n):
    return ("insert", {"name": name, "x": at[0], "y": at[1], "count": n})


def take(name, at, n):
    return ("take", {"name": name, "x": at[0], "y": at[1], "count": n})


def order(ai, shells):
    """1차분: 포탄 shells 발 + 포탑 1. 망에 있는 철판 · 철광 · 벽돌 · 석탄 104 는 그대로 쓴다."""
    r = need(shells)
    st_ = walk(STORE[0], STORE[1] + 2)
    gear = r["iron-gear-wheel"]
    # alpha: 강철 + 톱니
    put("alpha", [walk(HUB_STEEL[0], HUB_STEEL[1] + 2), take("steel-plate", HUB_STEEL, r["steel-plate"]),
                  walk(HUB_IRON[0], HUB_IRON[1] + 2), take("iron-plate", HUB_IRON, gear * 2),
                  ("craft", {"recipe": "iron-gear-wheel", "count": gear}),
                  st_, ins("steel-plate", STORE, r["steel-plate"]), ins("iron-gear-wheel", STORE, gear)])
    # bravo: 건물 (화학 공장 1, 조립기1 4 + 조립기2 1, 관 8) - 철 · 강철 · 구리 챙겨 손제작
    put("bravo", [walk(HUB_STEEL[0], HUB_STEEL[1] + 2), take("steel-plate", HUB_STEEL, 10),
                  walk(HUB_IRON2[0], HUB_IRON2[1] + 2), take("iron-plate", HUB_IRON2, 200),
                  walk(COPPER[0], COPPER[1] - 2), take("copper-plate", COPPER, 60),
                  ("craft", {"recipe": "pipe", "count": 13}),
                  ("craft", {"recipe": "chemical-plant", "count": 1}),
                  ("craft", {"recipe": "assembling-machine-1", "count": 5}),
                  ("craft", {"recipe": "assembling-machine-2", "count": 1}),
                  st_, ins("chemical-plant", STORE, 1), ins("assembling-machine-1", STORE, 4),
                  ins("assembling-machine-2", STORE, 1), ins("pipe", STORE, 8)])
    # charlie: 황 · 플라스틱 · 석탄
    coal = max(0, r["coal"] - 100)
    plan = [walk(SULFUR[0], SULFUR[1] + 2), take("sulfur", SULFUR, r["sulfur"]),
            walk(PLASTIC[0], PLASTIC[1] + 2), take("plastic-bar", PLASTIC, r["plastic-bar"])]
    if coal:
        plan += [walk(COAL[0], COAL[1] + 2), take("coal", COAL, coal)]
    plan += [st_, ins("sulfur", STORE, r["sulfur"]), ins("plastic-bar", STORE, r["plastic-bar"])]
    if coal:
        plan.append(ins("coal", STORE, coal))
    put("charlie", plan)
    # echo: 전자회로 (레이더분) + 고급회로 20
    ec, ac = r["electronic-circuit"], r["advanced-circuit"]
    fe = ec + ac * 2 + 10
    cu = (ec + ac * 2) * 3 // 2 + ac * 2 + 10
    put("echo", [walk(HUB_IRON[0], HUB_IRON[1] + 2), take("iron-plate", HUB_IRON, fe),
                 walk(COPPER2[0], COPPER2[1] - 2), take("copper-plate", COPPER2, min(cu, 170)),
                 take("copper-plate", COPPER, max(0, cu - 170)),
                 walk(PLASTIC[0], PLASTIC[1] + 2), take("plastic-bar", PLASTIC, ac * 2),
                 ("craft", {"recipe": "electronic-circuit", "count": ec}),
                 ("craft", {"recipe": "advanced-circuit", "count": ac}),
                 st_, ins("electronic-circuit", STORE, ec), ins("advanced-circuit", STORE, ac)])
    say("주문 (포탄 %d + 포탑 1) -> 저장 상자 %s: alpha 강철 %d · 톱니 %d / bravo 건물 / charlie 황 %d · 플라스틱 %d · 석탄 %d / echo 회로 %d · 고급 %d"
        % (shells, STORE, r["steel-plate"], gear, r["sulfur"], r["plastic-bar"], coal, ec, ac))


def place(ai):
    rec = {"%s,%s" % (m[1], m[2]): m[4] for m in M.values() if m[4]}
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {made = 0, skip = {}, rec = {}}
      local rec = {%s}
      for _, t in pairs({%s}) do
        local have = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
                  or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
        if have then o.skip[#o.skip + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3]
        else
          local gh = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4],
                                     force = 'player', expires = false}
          if gh then
            o.made = o.made + 1
            local r = rec[t[2] .. ',' .. t[3]]
            if r and t[1] ~= 'inserter' and t[1] ~= 'small-electric-pole' then
              local ok, e = pcall(function() gh.set_recipe(r) end) o.rec[#o.rec + 1] = r .. ':' .. (ok and 'ok' or tostring(e)) end
          else o.skip[#o.skip + 1] = 'FAIL ' .. t[1] .. '@' .. t[2] .. ',' .. t[3] end
        end
      end return o end)()""" % (", ".join("['%s'] = '%s'" % kv for kv in rec.items()), lua_list(GHOSTS)))
    say("유령 배치 " + json.dumps(r, ensure_ascii=False))
    return r


MACH_LUA = """local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
  local function mach(x, y) return s.find_entities_filtered{type = {'assembling-machine'}, position = {x, y}, radius = 0.5}[1] end"""


def check(ai):
    ms = ", ".join("{'%s', %s, %s}" % (k, m[1], m[2]) for k, m in M.items())
    return ai.lua("""(function() local s = game.surfaces[1] %s
      local o = {ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{-30, -74}, {-18, -58}}}, m = {}}
      for _, t in pairs({%s}) do
        local e = mach(t[2], t[3])
        if e then
          local f = {} for i = 1, #e.fluidbox do local fl = e.fluidbox[i] if fl then f[#f + 1] = fl.name .. ':' .. math.floor(fl.amount) end end
          local r = e.get_recipe()
          local inp = {} for _, it in pairs(e.get_inventory(defines.inventory.assembling_machine_input).get_contents()) do inp[#inp + 1] = it.name .. ':' .. it.count end
          o.m[t[1]] = {rec = r and r.name, st = names[e.status], fl = table.concat(f, ' '), inp = table.concat(inp, ' '),
                       out = e.get_output_inventory().get_item_count(), done = e.products_finished,
                       net = e.electric_network_id}
        else o.m[t[1]] = 'none' end
      end
      local function box(p) local c = s.find_entities_filtered{name = 'iron-chest', position = p, radius = 0.3}[1] return c and c.get_item_count() or -1 end
      o.shell_box = box({%s, %s}) o.tur_box = box({%s, %s})
      o.proxies = s.count_entities_filtered{name = 'item-request-proxy', area = {{-30, -74}, {-18, -58}}}
      return o end)()""" % (MACH_LUA, ms, SHELL_BOX[0], SHELL_BOX[1], TUR_BOX[0], TUR_BOX[1]))


def after_research(ai):
    rows = ", ".join("{%s, %s, '%s'}" % (m[1], m[2], m[5]) for m in M.values() if m[5])
    r = ai.lua("""(function() local s = game.surfaces[1] local f = game.forces.player local o = {set = {}}
      if not (f.recipes['artillery-shell'].enabled and f.recipes['artillery-turret'].enabled) then
        o.wait = 'artillery 미완료 ' .. math.floor(f.research_progress * 1000) / 10 .. '%%' return o end
      for _, t in pairs({%s}) do
        local e = s.find_entities_filtered{type = 'assembling-machine', position = {t[1], t[2]}, radius = 0.5}[1]
               or s.find_entities_filtered{ghost_type = 'assembling-machine', position = {t[1], t[2]}, radius = 0.5}[1]
        if not e then o.set[#o.set + 1] = 'none@' .. t[1] .. ',' .. t[2]
        else
          local r = e.get_recipe()
          if r and r.name == t[3] then o.set[#o.set + 1] = t[3] .. ' 이미'
          else local ok, err = pcall(function() e.set_recipe(t[3]) end) o.set[#o.set + 1] = t[3] .. ':' .. (ok and 'ok' or tostring(err)) .. (e.type == 'entity-ghost' and '(유령)' or '') end
        end
      end return o end)()""" % rows)
    say("연구 후 레시피 " + json.dumps(r, ensure_ascii=False))
    return r


def feed(ai, shells, turrets=1):
    """기계 입력 칸에 원료 proxy. 대상에 proxy 가 이미 있으면 건너뛴다. 목표 발수 · 대수를 넘으면 멈춘다."""
    rows = []
    for k, want in FEED.items():
        m = M[k]
        for item, n in want.items():
            rows.append("{'%s', %s, %s, '%s', %d}" % (k, m[1], m[2], item, n))
    cap = {"P": shells * 8, "ECS": shells * 4, "RADAR": shells, "CONC": 6 * turrets, "TUR": turrets}  # 제작 횟수 상한
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {req = {}, stop = {}}
      local cap = {%s}
      local net = s.find_logistic_network_by_position({-24, -88}, 'player')
      local by = {}
      for _, t in pairs({%s}) do by[t[1]] = by[t[1]] or {x = t[2], y = t[3], items = {}} table.insert(by[t[1]].items, {t[4], t[5]}) end
      local shell = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 0.5}[1]
      local shells_done = shell and shell.products_finished or 0
      for k, b in pairs(by) do
        local e = s.find_entities_filtered{type = 'assembling-machine', position = {b.x, b.y}, radius = 0.5}[1]
        local r = e and e.get_recipe()
        if not r then o.stop[#o.stop + 1] = k .. ' 없음/레시피없음'
        elseif e.products_finished >= cap[k] then o.stop[#o.stop + 1] = k .. ' 상한 ' .. e.products_finished
        elseif s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} > 0 then o.stop[#o.stop + 1] = k .. ' 배달 중'
        else
          local slot = {} local i = 0
          for _, ing in pairs(r.ingredients) do if ing.type == 'item' then slot[ing.name] = i i = i + 1 end end
          local inv = e.get_inventory(defines.inventory.assembling_machine_input)
          local mods = {}
          for _, it in pairs(b.items) do
            local have = inv.get_item_count(it[1])
            local want = math.min(it[2] - have, net and net.get_item_count(it[1]) or 0)
            if slot[it[1]] ~= nil and want >= math.min(10, it[2]) then
              mods[#mods + 1] = {id = {name = it[1]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = slot[it[1]], count = want}}}}
              o.req[#o.req + 1] = k .. ' ' .. it[1] .. ' ' .. want
            end
          end
          if #mods > 0 then s.create_entity{name = 'item-request-proxy', position = e.position, force = 'player', target = e, modules = mods} end
        end
      end
      o.shells_done = shells_done
      return o end)()""" % (", ".join("%s = %d" % kv for kv in cap.items()), ", ".join(rows),
                             M["SHELL"][1], M["SHELL"][2]))
    say("원료 proxy " + json.dumps(r, ensure_ascii=False))
    return r


def deliver(ai):
    """완성품 철상자 -> 사람이 저장 상자로. 망에 포탑이 들어오면 북서 자리에 유령, 포탑이 서면 포탄 proxy (15 까지)."""
    spots = ", ".join("{%s, %s}" % p for p in arty_spots())
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      local function box(p) local c = s.find_entities_filtered{name = 'iron-chest', position = p, radius = 0.3}[1]
        return c and c.get_item_count('artillery-shell') or 0, c and c.get_item_count('artillery-turret') or 0 end
      o.box_shell = box({%s, %s}) local _, t = box({%s, %s}) o.box_tur = t
      local net = s.find_logistic_network_by_position({-24, -88}, 'player')
      o.net_shell = net and net.get_item_count('artillery-shell') or 0 o.net_tur = net and net.get_item_count('artillery-turret') or 0
      local tur = s.find_entities_filtered{name = 'artillery-turret', force = 'player'}
      local gh = s.find_entities_filtered{ghost_name = 'artillery-turret', force = 'player'}
      o.turrets = #tur o.ghosts = #gh
      if #tur == 0 and #gh == 0 and o.net_tur > 0 then
        for _, p in pairs({%s}) do
          if s.can_place_entity{name = 'artillery-turret', position = p, force = 'player', build_check_type = defines.build_check_type.manual_ghost} then
            s.create_entity{name = 'entity-ghost', inner_name = 'artillery-turret', position = p, force = 'player', expires = false}
            o.ghost_at = p[1] .. ',' .. p[2] break end
        end
      end
      o.ammo = {}
      for _, e in pairs(tur) do
        local inv = e.get_inventory(defines.inventory.artillery_turret_ammo)
        local have = inv and inv.get_item_count('artillery-shell') or 0
        local busy = s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} > 0
        local n = math.min(15 - have, o.net_shell)
        if n > 0 and not busy then
          s.create_entity{name = 'item-request-proxy', position = e.position, force = 'player', target = e,
            modules = {{id = {name = 'artillery-shell'}, items = {in_inventory = {{inventory = defines.inventory.artillery_turret_ammo, stack = 0, count = n}}}}}}
        end
        o.ammo[#o.ammo + 1] = e.position.x .. ',' .. e.position.y .. ' 탄 ' .. have .. (n > 0 and not busy and (' +' .. n) or '')
      end
      return o end)()""" % (SHELL_BOX[0], SHELL_BOX[1], TUR_BOX[0], TUR_BOX[1], spots))
    say("배달 " + json.dumps(r, ensure_ascii=False))
    bs, bt = int(r.get("box_shell") or 0), int(r.get("box_tur") or 0)
    if bs >= 5 or bt >= 1:
        plan = []
        if bt:
            plan += [walk(TUR_BOX[0] + 1.5, TUR_BOX[1]), take("artillery-turret", TUR_BOX, bt)]
        if bs:
            plan += [walk(SHELL_BOX[0] + 1.5, SHELL_BOX[1] - 1), take("artillery-shell", SHELL_BOX, bs)]
        plan += [walk(STORE[0], STORE[1] + 2)]
        if bt:
            plan.append(ins("artillery-turret", STORE, bt))
        if bs:
            plan.append(ins("artillery-shell", STORE, bs))
        for who in ("hotel", "foxtrot", "alpha"):
            if put(who, plan):
                say("배달 주문 %s: 포탑 %d · 포탄 %d -> 저장 상자" % (who, bt, bs))
                break
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    for k in ("survey", "need", "order", "place", "check", "after-research", "feed", "deliver"):
        ap.add_argument("--" + k, action="store_true")
    ap.add_argument("--shells", type=int, default=None)
    ap.add_argument("--turrets", type=int, default=1)
    ap.add_argument("--loop", type=float, default=0, help="--feed/--deliver 를 이 분 동안 60초마다 반복")
    a = ap.parse_args()
    ai = AIBridge()
    if a.survey:
        say("조사 " + json.dumps(survey(ai), ensure_ascii=False))
    if a.need:
        show_need(ai, a.shells or 50)
    if a.order:
        order(ai, a.shells or 20)
    if a.place:
        place(ai)
    if a.check:
        say("점검 " + json.dumps(check(ai), ensure_ascii=False))
    if a.after_research and not (a.feed or a.deliver):
        after_research(ai)
    if a.feed or a.deliver:
        t_end = time.time() + a.loop * 60
        armed = False
        while True:
            if a.after_research and not armed:      # 함께 주면 연구 완료를 기다렸다가 레시피를 한 번 건다
                armed = "wait" not in after_research(ai)
            if a.feed:
                feed(ai, a.shells or 20, a.turrets)
            if a.deliver:
                deliver(ai)
            if time.time() >= t_end:
                break
            time.sleep(60)
    return 0


if __name__ == "__main__":
    sys.exit(main())

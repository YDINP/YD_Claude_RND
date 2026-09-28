"""철 전초 광석 증설 (09-28 16:3x) - 철광석 10분 5,757 = 채굴 상한 (채굴기 16 x 0.6/s) 이 판 · 강철을 막는다.

사용자 방침: 메인 기지에서는 제련 · 채굴 안 함 (기지 강철 화로 재가동 X) -> 전초에서 늘린다. 목표 광석 10분 >= 8,500 (14.2/s).
실측 (tick 20.59M): 광맥 (x -231..-196 · y -269..-229) 880 칸 5.40M 남음 -> 광맥은 넉넉, 칸이 문제.
용량 계산 (채굴기 0.6/s, 노란 레인 7.5/s, 고속 레인 15/s):
    광석 벨트 y=-244.5 (노랑, 동향): 북 레인 = 북쪽 남향 채굴기 7 (4.2/s) · 남 레인 = 남쪽 북향 9 (5.4/s). 남은 칸 북 3.3 · 남 2.1.
    기존 벨트 옆 빈 광석 칸은 옛 포탑 (-222,-246)(-213,-246) 과 광맥 끝이라 몇 대뿐 -> 새 줄.
    새 줄: 전봇대 줄 y=-248.5 북쪽, 채굴기 y=-251.5 남향 8 대 (옛 광석 위 포탑 (-216,-253)(-203,-251) · 나무 피함) -> 벨트 y=-249.5.
      한 레인에 몰면 기존 레인이 7.5 를 넘는다 -> 둘로 나눔:
      서 3 대 (-229.5/-226.5/-223.5): 벨트 서향 -> x=-231.5 남향 -> y=-244.5 동향으로 기존 벨트 머리 (-222.5) 에 정면 연결 = 남 레인 (+1.8 -> 7.2).
      동 5 대 (-220.5/-213.5/-210.5/-207.5/-200.5): 벨트 동향 -> x=-193.5 남향 -> 기존 벨트 (-193.5,-244.5) 북쪽 옆치기 = 북 레인 (+3.0 -> 7.2).
      전봇대 (-228.5,-248.5) 1 (서 2 대용). 합계 채굴기 24 = 14.4/s (10분 8,640).
    광석 기둥 x=-160.5: 광석은 동 레인 하나. 고속 머리 14 칸 (-242.5..-229.5) 뒤 노랑 7.5 -> 14.4 - 0.625 k <= 7.5 이려면 화로 12 개 지나서까지 고속
      -> 고속 12 칸 더 (-228.5..-217.5). 고속 벨트 = 망 철판 -> 톱니 -> 손제작.
    판 화로 강철로 18 = 11.25/s < 14.4 -> 강철로 5 더: 기둥 빈 칸 중심 (-158, -205/-203/-201/-199/-194).
      (-158,-204) 기관총 (last_user 없음, 광석 밖 내부 포탑) 이 자리를 막아 (-164,-204) 로 옮김 (탄 그대로 다시 넣음).
      팔 (-159.5 입력 / -156.5 출력, 둘 다 west = 기존과 같음), 전봇대 (-159.5/-156.5,-202.5) (-159.5,-198.5) (-159.5,-194.5).
      새 화로 5 는 강철 기둥 입력 팔 아래 -> 판은 분배기 (-155,-201.5) 로. 분배기 출력 우선 = 옛 벨트 (x=-155.5, 강철용 돌 화로 8 쪽)
      -> 강철 기둥 18 (11.25 판/s, 강철 2.25/s) + 돌 화로 8 (판 2.5/s, 강철 0.5/s) = 강철 최대 2.75/s (10분 1,650).
    강철로 5 = 망 강철 30 · 벽돌 50 -> 캐릭터 손제작 (망에 강철로 0).
짓기는 캐릭터 (outpostcrew23 dispatch), 재료는 망 2 저장 -> 가방 (옮김). 작업 뒤 집 (-81,-43) 으로 (채굴기 사이에 세워 두지 않음).

    python -u scripts/feore23.py check      # 칸 검사 (드라이런)
    python -u scripts/feore23.py craft      # 강철로 5 · 고속 벨트 12 손제작 -> 망
    python -u scripts/feore23.py drills     # 새 채굴 줄 (캐릭터 2)
    python -u scripts/feore23.py column     # 포탑 옮김 · 강철로 5 · 팔 · 전봇대 · 고속 12 (캐릭터 1)
    python -u scripts/feore23.py split      # 분배기 출력 우선 = 옛 벨트 (되돌리기: split none)
    python -u scripts/feore23.py status
로그 state/feore23.log
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import orders  # noqa: E402
import outpostcrew23 as crew  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "feore23.log")
OWNER = "feore23"
BACK = ("steel-furnace", "steel-plate", "stone-brick", "inserter", "small-electric-pole", "transport-belt", "fast-transport-belt",
        "iron-gear-wheel", "iron-plate", "electric-mining-drill", "gun-turret", "firearm-magazine", "piercing-rounds-magazine",
        "wood", "stone", "coal", "iron-ore")

W_DRILLS = (-229.5, -226.5, -223.5)
E_DRILLS = (-220.5, -213.5, -210.5, -207.5, -200.5)
DRILL_Y, NEW_BELT_Y = -251.5, -249.5


def drill_builds():
    b = [("electric-mining-drill", x, DRILL_Y, "south") for x in W_DRILLS + E_DRILLS]
    b.append(("small-electric-pole", -228.5, -248.5, "north"))
    # 서 무리: y=-249.5 서향 (-223.5..-230.5) -> (-231.5,-249.5) 남 -> x=-231.5 남 -> (-231.5,-244.5) 동 -> -230.5..-223.5 동
    x = -223.5
    while x >= -230.5:
        b.append(("transport-belt", x, NEW_BELT_Y, "west"))
        x -= 1
    for y in (-249.5, -248.5, -247.5, -246.5, -245.5):
        b.append(("transport-belt", -231.5, y, "south"))
    x = -231.5
    while x <= -223.5:
        b.append(("transport-belt", x, -244.5, "east"))
        x += 1
    # 동 무리: y=-249.5 동향 (-220.5..-194.5) -> (-193.5,-249.5) 남 -> x=-193.5 남 (-248.5..-245.5) -> 기존 벨트 옆치기
    x = -220.5
    while x <= -194.5:
        b.append(("transport-belt", x, NEW_BELT_Y, "east"))
        x += 1
    for y in (-249.5, -248.5, -247.5, -246.5, -245.5):
        b.append(("transport-belt", -193.5, y, "south"))
    return b


F_CENTERS = (-205.0, -203.0, -201.0, -199.0, -194.0)
ARM_ROW = {-205.0: -204.5, -203.0: -203.5, -201.0: -201.5, -199.0: -199.5, -194.0: -193.5}
TURRET_OLD, TURRET_NEW = (-158.0, -204.0), (-164.0, -204.0)
FAST_NEW = [(-160.5, -228.5 + k) for k in range(12)]


def column_builds():
    b = []
    for yc in F_CENTERS:
        b.append(("steel-furnace", -158.0, yc, "north"))
        b.append(("inserter", -159.5, ARM_ROW[yc], "west"))
        b.append(("inserter", -156.5, ARM_ROW[yc], "west"))
    b += [("small-electric-pole", -159.5, -202.5, "north"), ("small-electric-pole", -156.5, -202.5, "north"),
          ("small-electric-pole", -159.5, -198.5, "north"), ("small-electric-pole", -159.5, -194.5, "north")]
    return b


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def T(v):
    if isinstance(v, dict) and v and all(k.isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v if v else []


CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then
      o.ok = o.ok + 1
    else
      local why = '' for _, x in pairs(s.find_entities_filtered{position = {t[2], t[3]}, radius = 1.2}) do if x.type ~= 'resource' then why = why .. x.name .. ' ' end end
      o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
  end return o end)()"""


def rows_lua(builds):
    return ", ".join("{'%s', %s, %s, %d}" % (n, x, y, crew.DIRS[d]) for n, x, y, d in builds)


def check(ai, *_):
    for name, b in (("채굴", drill_builds()), ("기둥", column_builds())):
        r = ai.lua(CHECK % rows_lua(b))
        log("%s 칸 검사: 전체 %d · 있음 %s · 가능 %s · 막힘 %s" % (name, len(b), r.get("have"), r.get("ok"), T(r.get("bad"))))
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      local t = s.find_entities_filtered{name = 'gun-turret', position = {%s, %s}, radius = 0.6}[1]
      o.turret_old = t and 1 or 0
      o.turret_new_ok = s.can_place_entity{name = 'gun-turret', position = {%s, %s}, force = 'player', build_check_type = defines.build_check_type.manual}
      o.turret_new_ore = s.count_entities_filtered{area = {{%s - 1, %s - 1}, {%s + 1, %s + 1}}, type = 'resource'}
      o.fast = 0 for _, p in pairs({%s}) do if s.find_entities_filtered{name = 'fast-transport-belt', position = p, radius = 0.3}[1] then o.fast = o.fast + 1 end end
      return o end)()""" % (TURRET_OLD + TURRET_NEW + TURRET_NEW + TURRET_NEW + (", ".join("{%s, %s}" % p for p in FAST_NEW),)))
    log("포탑 · 고속: %s" % r)


UNLOAD = """(function() @BODY@
  local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
  local m = b.get_main_inventory() local o = {}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, n in pairs({%s}) do local k = m.get_item_count(n)
    if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
  return o end)()"""


def unload(ai, who):
    from proboport23 import BODY
    return ai.lua(UNLOAD.replace("@BODY@", BODY) % (who, ", ".join("'%s'" % n for n in BACK)))


def wait_back(ai, sent, limit=1200):
    t0 = time.time()
    while sent and time.time() - t0 < limit:
        time.sleep(15)
        if not crew.busy(ai, sent):
            break
    for who in sent:
        log("%s 돌아옴 · 가방 -> 망 %s" % (who, unload(ai, who)))
    detached.release(sent)


def send(ai, who, need, steps):
    detached.mark([who], OWNER, minutes=40)
    bag = crew.load_bag(ai, who, need) if need else {"bag": {}}
    have = bag.get("bag") or {}
    if bag.get("dead") or any(int(have.get(k, 0)) < v for k, v in need.items()):
        log("%s 가방 부족 %s - 건너뜀" % (who, bag))
        unload(ai, who)
        detached.release([who])
        return False
    orders.submit(ai, who, steps, strict=False)
    log("%s 출발 (%d 단계, 가방 %s)" % (who, len(steps), have))
    return True


def net_count(ai, names):
    return ai.lua("""(function() local net = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player') local o = {}
      for _, n in pairs({%s}) do o[n] = net.get_item_count(n) end return o end)()""" % ", ".join("'%s'" % n for n in names))


def craft(ai, *_):
    left_f = crew.missing(ai, [x for x in column_builds() if x[0] == "steel-furnace"])
    left_b = [p for p in FAST_NEW if not crew.missing(ai, [("transport-belt", p[0], p[1], "south")])]
    n = net_count(ai, ["steel-furnace", "fast-transport-belt", "steel-plate", "stone-brick", "iron-gear-wheel", "iron-plate"])
    kf = max(0, len(left_f) - int(n["steel-furnace"]))
    kb = max(0, len(left_b) - int(n["fast-transport-belt"]))
    log("손제작: 강철로 %d · 고속 %d (망 %s)" % (kf, kb, n))
    if not kf and not kb:
        return
    free = crew.free_crew(ai, 1, exclude=("alpha",))
    if not free:
        log("쉬는 사람 없음")
        return
    who = free[0]
    need, steps = {}, [("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]})]
    if kb:
        need.update({"iron-plate": 10 * kb, "transport-belt": kb})
        steps.append(("craft", {"recipe": "iron-gear-wheel", "count": 5 * kb, "wait": "block"}))
        steps.append(("craft", {"recipe": "fast-transport-belt", "count": kb, "wait": "block"}))
    if kf:
        need.update({"steel-plate": 6 * kf, "stone-brick": 10 * kf})
        steps.append(("craft", {"recipe": "steel-furnace", "count": kf, "wait": "block"}))
    steps.append(("wait", {"ticks": 120}))
    if send(ai, who, need, steps):
        wait_back(ai, [who], limit=600)
    log("망 뒤 %s" % net_count(ai, ["steel-furnace", "fast-transport-belt"]))


def drills(ai, *_):
    b = drill_builds()
    for rnd in range(3):
        todo = crew.missing(ai, b)
        if not todo:
            log("채굴 줄 모두 섬 (%d)" % len(b))
            return True
        free = crew.free_crew(ai, 2, exclude=("alpha",))
        if not free:
            log("쉬는 사람 없음 - 60초 뒤")
            time.sleep(60)
            continue
        west = [x for x in todo if x[1] <= -222.0 and not (x[0] == "transport-belt" and x[2] == NEW_BELT_Y and x[1] > -222.0)]
        east = [x for x in todo if x not in west]
        chunks = [c for c in (west, east) if c]
        if len(free) == 1:
            chunks = [west + east]
        sent = []
        for who, ch in zip(free, chunks):
            entry = (-226.5, -238.5) if ch is west else (-196.5, -238.5)
            if crew.dispatch(ai, who, ch, [], entry, OWNER, log, pre=crew.chops(ai, ch)):
                sent.append(who)
            else:
                unload(ai, who)
                detached.release([who])
        log("%d 파: 남은 %d · 보냄 %s" % (rnd + 1, len(todo), sent))
        wait_back(ai, sent, limit=900)
    left = crew.missing(ai, b)
    log("끝: 빠진 것 %d %s" % (len(left), left[:8]))
    return not left


def column(ai, *_):
    b = column_builds()
    free = crew.free_crew(ai, 1, exclude=("alpha",))
    if not free:
        log("쉬는 사람 없음")
        return
    who = free[0]
    t = ai.lua("""(function() local t = game.surfaces[1].find_entities_filtered{name = 'gun-turret', position = {%s, %s}, radius = 0.6}[1]
      if not t then return {have = 0} end local inv = t.get_inventory(defines.inventory.turret_ammo) local o = {have = 1, ammo = {}}
      for _, it in pairs(inv.get_contents()) do o.ammo[it.name] = it.count end return o end)()""" % TURRET_OLD)
    steps = [("walk_to", {"x": -162.5, "y": -206.5})]
    need = {}
    if int(t.get("have", 0)):
        steps.append(("demolish", {"x": TURRET_OLD[0], "y": TURRET_OLD[1], "name": "gun-turret", "search_radius": 0.6}))
        steps.append(("build", {"name": "gun-turret", "x": TURRET_NEW[0], "y": TURRET_NEW[1], "direction": 0}))
        for n, c in (t.get("ammo") or {}).items():
            steps.append(("insert", {"name": n, "x": TURRET_NEW[0], "y": TURRET_NEW[1], "count": int(c)}))
    todo = crew.missing(ai, b)
    for n, x, y, d in todo:
        steps.append(("build", {"name": n, "x": x, "y": y, "direction": crew.DIRS[d]}))
        need[n] = need.get(n, 0) + 1
    fast_todo = [p for p in FAST_NEW if not crew.missing(ai, [("transport-belt", p[0], p[1], "south")])]
    if fast_todo:
        steps.append(("walk_to", {"x": -162.5, "y": -223.5}))
        for x, y in fast_todo:
            steps.append(("demolish", {"x": x, "y": y, "name": "transport-belt", "search_radius": 0.3}))
            steps.append(("build", {"name": "fast-transport-belt", "x": x, "y": y, "direction": 8}))
        need["fast-transport-belt"] = len(fast_todo)
    steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
    log("기둥: 포탑 %s · 짓기 %d · 고속 %d -> %s (%d 단계)" % (t, len(todo), len(fast_todo), who, len(steps)))
    if send(ai, who, need, steps):
        wait_back(ai, [who], limit=1200)
    log("빠진 것 %s" % crew.missing(ai, b))


def split(ai, *args):
    pr = args[0] if args else "right"
    r = ai.lua("""(function() local sp = game.surfaces[1].find_entities_filtered{name = 'splitter', position = {-155, -201.5}, radius = 0.6}[1]
      if not sp then return {err = 'none'} end sp.splitter_output_priority = '%s'
      return {out = sp.splitter_output_priority, dir = sp.direction} end)()""" % pr)
    log("분배기 (-155,-201.5) 출력 우선 %s -> %s" % (pr, r))


STATUS = """(function() local s = game.surfaces[1] local o = {}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  local function cnt(list, typ) local c = {} for _, p in pairs(list) do
      local e = s.find_entities_filtered{type = typ, position = p, radius = 0.3}[1]
      local k = e and (st[e.status] or tostring(e.status)) or 'none' c[k] = (c[k] or 0) + 1 end return c end
  local dr = {} for _, e in pairs(s.find_entities_filtered{area = {{-240, -260}, {-190, -238}}, name = 'electric-mining-drill'}) do dr[#dr + 1] = e.position end
  o.drills = cnt(dr, 'mining-drill') o.ndrill = #dr
  local pf = {} for i = 0, 17 do pf[#pf + 1] = {-158, -241 + 2 * i} end
  o.plate18 = cnt(pf, 'furnace') o.plate5 = cnt({%s}, 'furnace')
  local sc = {} for k = 0, 7 do sc[#sc + 1] = {-153, -241 + 2 * k} end for k = 0, 9 do sc[#sc + 1] = {-153, -222 + 2 * k} end
  o.steelcol = cnt(sc, 'furnace')
  local ss = {} for k = 0, 7 do ss[#ss + 1] = {-158, -191 + 2 * k} end o.stone8 = cnt(ss, 'furnace')
  local L = {0, 0} for _, x in pairs({-205.5, -180.5, -160.5}) do local b = s.find_entities_filtered{type = 'transport-belt', position = {x, -244.5}, radius = 0.3}[1]
    if b then L[1] = L[1] + b.get_transport_line(1).get_item_count() L[2] = L[2] + b.get_transport_line(2).get_item_count() end end
  o.orebelt = L
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  o.net = {steel = net.get_item_count('steel-plate'), iron = net.get_item_count('iron-plate'), free = free}
  local ps = game.forces.player.get_item_production_statistics(s)
  o.f10 = {} o.f1 = {}
  for _, n in pairs({'iron-ore', 'iron-plate', 'steel-plate'}) do
    local cat = 'input'
    o.f10[n] = math.floor(ps.get_flow_count{name = n, category = cat, precision_index = defines.flow_precision_index.ten_minutes, count = true})
    o.f1[n] = math.floor(ps.get_flow_count{name = n, category = cat, precision_index = defines.flow_precision_index.one_minute, count = true}) end
  o.tick = game.tick
  return o end)()"""


def status(ai, *_):
    r = ai.lua(STATUS % ", ".join("{-158, %s}" % y for y in F_CENTERS))
    log("상태 %s" % r)
    return r


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    {"check": check, "craft": craft, "drills": drills, "column": column, "split": split, "status": status}[cmd](ai, *sys.argv[2:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

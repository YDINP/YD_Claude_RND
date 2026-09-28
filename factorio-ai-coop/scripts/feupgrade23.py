"""철 전초 제련 증설 (12:45, 철이 다음 병목) - 판 화로 돌 18 -> 강철로, 채굴기 +6, 광석 기둥 머리 고속 벨트, 판 벨트 레인 바꿈.

실측 (tick 19.78M): 전초 판 돌 화로 18 + 강철용 돌 8 전부 working, 10분 철판 3,562 (5.9/s) = 광석 3,562.
채굴기 10 (0.6/s, 6/s) 중 1 대 출구 막힘 -> 제련이 병목. 망 철판 11.0k -> 9.4k (ironfeed23 뒤 분당 ~600 감소).
강철로로만 바꾸면 막히는 곳 둘:
    ① 광석 기둥 (x=-160.5) 은 서 레인 = 석탄 (coalline23), 광석은 (-160.5,-242.5) 에 동쪽 옆치기 -> 동 레인 하나 = 노란 벨트 7.5/s 상한.
       -> 기둥 머리 14 칸 (y -242.5..-229.5) 을 고속 벨트 (레인 15/s) 로. 화로 7 개를 지나면 흐름이 7.5 아래.
    ② 판 벨트 (x=-155.5) 도 출력 팔이 전부 서쪽에서 놓아 동 레인 하나 = 7.5/s 상한 (강철로 17 = 10.9/s).
       -> 화로 i=8 과 9 사이 (y=-224.5) 에서 한 칸 동쪽으로 돌아 나오며 옆치기: 위 9 화로 판을 서 레인으로 옮김.
          (-155.5,-224.5) 동향 -> (-154.5,-224.5) 동향 -> (-153.5,-224.5) 남향 (뒤에 빈 (-153.5,-225.5) 남향 -> 직선이라 서쪽 옆치기 = 서 레인)
          -> (-153.5,-223.5) 서향 (곡선) -> (-154.5,-223.5) 서향 -> (-155.5,-223.5) 남향 (곡선, 레인 유지). 아래 9 화로는 다시 동 레인.
강철로 재료: 망 강철로 8 + 벽돌 (망 돌 -> 캐릭터가 임시 돌 화로 4 에 넣어 굽고 거둠) -> 캐릭터 손제작.
고속 벨트: 망 철판 -> 가방 -> 톱니 · 고속 벨트 손제작. 석탄은 더 안 든다 (화로는 이미 전부 working, 강철로도 90kW -> 총 연료 같음, 판당 절반).
채굴기: 광석 벨트 y=-244.5 를 서쪽 x=-222.5 까지 13 칸 늘리고 북향 4 (-212.5 ~ -221.5, y=-242.5) · 남향 2 (-215.5/-218.5, y=-246.5)
    (남향 -212.5 · -221.5 는 옛 포탑 (-213,-246)(-222,-246) 자리라 둔다) + 전봇대 4. 16 x 0.6 = 9.6/s.
짓기는 캐릭터 (outpostcrew23 방식), 재료는 망 2 저장 -> 가방 (옮김), 남은 것 · 걷어낸 것은 집에서 망으로.

    python -u scripts/feupgrade23.py check
    python -u scripts/feupgrade23.py go        # 강철로 (망에 있는 만큼) + 채굴기
    python -u scripts/feupgrade23.py bricks    # 벽돌 굽기 -> 강철로 · 고속 벨트 손제작 (집 근처)
    python -u scripts/feupgrade23.py belts     # 고속 벨트 기둥 머리 + 판 벨트 레인 바꿈 + 남은 강철로
로그 state/feupgrade23.log
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

LOG = os.path.join(HERE, "..", "state", "feupgrade23.log")
OWNER = "feupgrade23"
ENTRY = (-162.5, -238.5)
UPG = [(-158.0, -241.0 + 2 * i) for i in range(18)]
DRILLS = [("transport-belt", -210.5 - k, -244.5, "east") for k in range(13)] \
    + [("electric-mining-drill", x, -242.5, "north") for x in (-212.5, -215.5, -218.5, -221.5)] \
    + [("electric-mining-drill", x, -246.5, "south") for x in (-215.5, -218.5)] \
    + [("small-electric-pole", x, y, "north") for x in (-216.5, -222.5) for y in (-240.5, -248.5)]
FAST = [(-160.5, -242.5 + k) for k in range(14)]
SWAP_NEW = [("transport-belt", -154.5, -224.5, "east"), ("transport-belt", -153.5, -225.5, "south"),
            ("transport-belt", -153.5, -224.5, "south"), ("transport-belt", -153.5, -223.5, "west"),
            ("transport-belt", -154.5, -223.5, "west")]
SWAP_TURN = (-155.5, -224.5)
BACK = ("stone-furnace", "steel-furnace", "coal", "iron-ore", "iron-plate", "electric-mining-drill", "small-electric-pole",
        "transport-belt", "fast-transport-belt", "stone", "stone-brick", "iron-gear-wheel", "steel-plate")
BRICK_FURN = 4


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def T(v):
    if isinstance(v, dict) and v and all(k.isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v if v else []


STATE = """(function() local s = game.surfaces[1] local o = {steel = 0, stone = 0, drills = {}, fast = 0, swap = 0}
  for _, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.3}[1]
    if f and f.name == 'steel-furnace' then o.steel = o.steel + 1 elseif f then o.stone = o.stone + 1 end end
  for i, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.drills[i] = 'have'
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then o.drills[i] = 'ok'
    else local why = '' for _, x in pairs(s.find_entities_filtered{position = {t[2], t[3]}, radius = 1.5}) do why = why .. x.name .. ' ' end o.drills[i] = 'bad:' .. why end
  end
  for _, p in pairs({%s}) do if s.find_entities_filtered{name = 'fast-transport-belt', position = p, radius = 0.3}[1] then o.fast = o.fast + 1 end end
  local t = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  o.turn = t and t.direction or -1
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.net = {sf = net.get_item_count('steel-furnace'), drill = net.get_item_count('electric-mining-drill'), pole = net.get_item_count('small-electric-pole'),
           belt = net.get_item_count('transport-belt'), fast = net.get_item_count('fast-transport-belt'), stone = net.get_item_count('stone'),
           brick = net.get_item_count('stone-brick'), steel = net.get_item_count('steel-plate'), iron = net.get_item_count('iron-plate'),
           coal = net.get_item_count('coal'), stonef = net.get_item_count('stone-furnace')}
  return o end)()"""


def rows(builds):
    return ", ".join("{'%s', %s, %s, %d}" % (b[0], b[1], b[2], crew.DIRS[b[3]]) for b in builds)


def pts(ps):
    return ", ".join("{%s, %s}" % p for p in ps)


def state(ai):
    return ai.lua(STATE % (pts(UPG), rows(DRILLS), pts(FAST), SWAP_TURN[0], SWAP_TURN[1]))


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


def send(ai, who, need, steps):
    detached.mark([who], OWNER, minutes=40)
    bag = crew.load_bag(ai, who, need)
    have = bag.get("bag") or {}
    if bag.get("dead") or any(int(have.get(k, 0)) < v for k, v in need.items()):
        log("%s 가방 부족 %s - 건너뜀" % (who, bag))
        detached.release([who])
        return False
    orders.submit(ai, who, steps, strict=False)
    log("%s 출발 (%d 단계, 가방 %s)" % (who, len(steps), have))
    return True


def wait_back(ai, sent, limit=1200):
    t0 = time.time()
    while sent and time.time() - t0 < limit:
        time.sleep(20)
        if not crew.busy(ai, sent):
            break
    for who in sent:
        log("%s 돌아옴 · 가방 -> 망 %s" % (who, unload(ai, who)))
    detached.release(sent)


def furnace_names(ai):
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for i, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.3}[1]
        o[i] = f and f.name or 'none' end return o end)()""" % pts(UPG))
    return T(r)


def furnace_steps(todo):
    steps = []
    for x, y in todo:
        steps.append(("demolish", {"x": x, "y": y, "name": "stone-furnace", "search_radius": 0.5}))
        steps.append(("build", {"name": "steel-furnace", "x": x, "y": y, "direction": 0}))
    return steps


def go(ai):
    st = state(ai)
    log("시작 상태 %s" % st)
    names = furnace_names(ai)
    todo_f = [p for p, n in zip(UPG, names) if n == "stone-furnace"][:int(st["net"]["sf"])]
    dv = T(st.get("drills"))
    todo_d = [b for b, v in zip(DRILLS, dv) if v == "ok"]
    free = crew.free_crew(ai, 2)
    log("할 일: 강철로 %d · 채굴지 %d · 쉬는 사람 %s" % (len(todo_f), len(todo_d), free))
    sent = []
    if todo_f and free:
        who = free.pop(0)
        steps = [("walk_to", {"x": ENTRY[0], "y": ENTRY[1]})] + furnace_steps(todo_f) + [("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]})]
        if send(ai, who, {"steel-furnace": len(todo_f)}, steps):
            sent.append(who)
    if todo_d and free:
        who = free.pop(0)
        steps = crew.make_plan(todo_d, [], (-205.5, -238.5))
        if send(ai, who, crew.need_of(todo_d, []), steps):
            sent.append(who)
    wait_back(ai, sent)
    log("끝 상태 %s" % state(ai))


SPOTS = """(function() local s = game.surfaces[1] local o = {} local A = {x = %s, y = %s}
  for R = 2, 30 do for dx = -R, R do for dy = -R, R do
    if #o < %d and (math.abs(dx) == R or math.abs(dy) == R) then
      local p = {x = A.x + dx, y = A.y + dy}
      local far = true for _, q in pairs(o) do if math.abs(q[1] - p.x) < 2.5 and math.abs(q[2] - p.y) < 2.5 then far = false end end
      if far and s.count_entities_filtered{area = {{p.x - 2, p.y - 2}, {p.x + 2, p.y + 2}}} == 0
         and s.can_place_entity{name = 'stone-furnace', position = p, force = 'player', build_check_type = defines.build_check_type.manual} then
        o[#o + 1] = {p.x, p.y} end
    end end end end
  return o end)()"""


def bricks(ai):
    st = state(ai)
    n = st["net"]
    names = furnace_names(ai)
    left = sum(1 for x in names if x == "stone-furnace") - int(n["sf"])
    need_brick = max(0, 10 * left - int(n["brick"]))
    stone = min(int(n["stone"]), 2 * need_brick)
    per = stone // BRICK_FURN
    per = min(per, 50)
    log("벽돌: 남은 돌 화로 %d · 벽돌 필요 %d · 망 돌 %s -> 화로당 %d" % (left, need_brick, n["stone"], per))
    free = crew.free_crew(ai, 1)
    if not free:
        log("쉬는 사람 없음")
        return
    who = free[0]
    spots = T(ai.lua(SPOTS % (crew.HOME[0], crew.HOME[1] - 8, BRICK_FURN)))
    if len(spots) < BRICK_FURN or per == 0:
        log("자리 %s / 돌 %d - 중단" % (spots, per))
        return
    k_sf = min(left, (int(n["brick"]) + BRICK_FURN * (per // 2)) // 10)
    steps = [("walk_to", {"x": spots[0][0] + 2, "y": spots[0][1]})]
    for x, y in spots:
        steps.append(("build", {"name": "stone-furnace", "x": x, "y": y, "direction": 0}))
    for x, y in spots:
        steps.append(("insert", {"name": "coal", "x": x, "y": y, "count": 3}))
        steps.append(("insert", {"name": "stone", "x": x, "y": y, "count": per}))
    # 톱니 70 · 고속 벨트 14 는 굽는 동안 만든다
    steps.append(("craft", {"recipe": "iron-gear-wheel", "count": 5 * len(FAST)}))
    steps.append(("craft", {"recipe": "fast-transport-belt", "count": len(FAST)}))
    steps.append(("wait", {"ticks": int((per // 2) * 3.2 * 60) + 600}))
    for x, y in spots:
        steps.append(("demolish", {"x": x, "y": y, "name": "stone-furnace", "search_radius": 0.5}))
    if k_sf > 0:
        steps.append(("craft", {"recipe": "steel-furnace", "count": k_sf, "wait": "block"}))
    steps.append(("wait", {"ticks": 300}))
    need = {"stone-furnace": BRICK_FURN, "coal": 3 * BRICK_FURN, "stone": per * BRICK_FURN,
            "iron-plate": 10 * len(FAST), "transport-belt": len(FAST), "steel-plate": 6 * k_sf}
    if int(n["brick"]) > 0:
        need["stone-brick"] = int(n["brick"])
    log("%s: 자리 %s · 강철로 %d 만들 예정" % (who, spots, k_sf))
    if send(ai, who, need, steps):
        wait_back(ai, [who], limit=900)
    log("끝 상태 %s" % state(ai))


def belts(ai):
    st = state(ai)
    log("시작 상태 %s" % st)
    names = furnace_names(ai)
    stone_left = [p for p, n in zip(UPG, names) if n == "stone-furnace"]
    # 망 강철로가 모자라면 망 벽돌 (10) · 강철 (6) 로 손제작해 채운다
    extra = max(0, min(len(stone_left) - int(st["net"]["sf"]), int(st["net"]["brick"]) // 10, int(st["net"]["steel"]) // 6))
    todo_f = stone_left[:int(st["net"]["sf"]) + extra]
    todo_d = [b for b, v in zip(DRILLS, T(st.get("drills"))) if v == "ok"]
    fast_have = T(ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for i, p in pairs({%s}) do o[i] = s.find_entities_filtered{name = 'fast-transport-belt', position = p, radius = 0.3}[1] and 1 or 0 end
      return o end)()""" % pts(FAST)))
    todo_b = [p for p, h in zip(FAST, fast_have) if not h]
    # 고속 벨트가 모자라면 망 톱니 (5) · 벨트 (1) 로 손제작 (bricks 때 제작 큐가 1 개만 받은 경우)
    mk_fast = max(0, len(todo_b) - int(st["net"]["fast"]))
    gears = ai.lua("""(function() local net = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player')
      return {g = net.get_item_count('iron-gear-wheel')} end)()""").get("g", 0)
    mk_fast = min(mk_fast, int(gears) // 5)
    todo_b = todo_b[:int(st["net"]["fast"]) + mk_fast]
    swap_new = crew.missing(ai, SWAP_NEW)
    turn_todo = st.get("turn") == 8
    free = crew.free_crew(ai, 2)
    log("할 일: 강철로 %d (손제작 %d) · 채굴기지 %d · 고속 %d · 레인 새 벨트 %d · 머리 돌림 %s · 사람 %s" % (len(todo_f), extra, len(todo_d), len(todo_b), len(swap_new), turn_todo, free))
    sent = []
    if (todo_b or swap_new or turn_todo) and free:
        who = free.pop(0)
        steps = [("craft", {"recipe": "fast-transport-belt", "count": mk_fast, "wait": "block"})] if mk_fast else []
        steps.append(("walk_to", {"x": ENTRY[0], "y": ENTRY[1]}))
        for x, y in todo_b:
            steps.append(("demolish", {"x": x, "y": y, "name": "transport-belt", "search_radius": 0.3}))
            steps.append(("build", {"name": "fast-transport-belt", "x": x, "y": y, "direction": 8}))
        for b in todo_d:
            steps.append(("build", {"name": b[0], "x": b[1], "y": b[2], "direction": crew.DIRS[b[3]]}))
        for b in swap_new:
            steps.append(("build", {"name": b[0], "x": b[1], "y": b[2], "direction": crew.DIRS[b[3]]}))
        if turn_todo:
            steps.append(("demolish", {"x": SWAP_TURN[0], "y": SWAP_TURN[1], "name": "transport-belt", "search_radius": 0.3}))
            steps.append(("build", {"name": "transport-belt", "x": SWAP_TURN[0], "y": SWAP_TURN[1], "direction": 4}))
        steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
        need = {"transport-belt": len(swap_new) + (1 if turn_todo else 0)}
        if todo_b:
            need["fast-transport-belt"] = len(todo_b) - mk_fast
        if mk_fast:
            need["iron-gear-wheel"] = 5 * mk_fast
            need["transport-belt"] += mk_fast
        need = {k: v for k, v in need.items() if v > 0}
        for b in todo_d:
            need[b[0]] = need.get(b[0], 0) + 1
        if send(ai, who, need, steps):
            sent.append(who)
    if todo_f and free:
        who = free.pop(0)
        pre = [("craft", {"recipe": "steel-furnace", "count": extra, "wait": "block"})] if extra else []
        steps = pre + [("walk_to", {"x": ENTRY[0], "y": ENTRY[1]})] + furnace_steps(todo_f) + [("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]})]
        need = {"steel-furnace": len(todo_f) - extra}
        if extra:
            need.update({"stone-brick": 10 * extra, "steel-plate": 6 * extra})
        need = {k: v for k, v in need.items() if v > 0}
        if send(ai, who, need, steps):
            sent.append(who)
    wait_back(ai, sent)
    log("끝 상태 %s" % state(ai))


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        log("검사 %s" % state(ai))
    elif cmd == "go":
        go(ai)
    elif cmd == "bricks":
        bricks(ai)
    elif cmd == "belts":
        belts(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""구리 전초 제련 증설 (12:10, 구리가 노란팩 병목) - 돌 화로 8 -> 강철로 8, 채굴기 2 추가.

실측 (tick 19.68M): 전초 돌 화로 16 전부 working (5/s = 10분 3,000), 채굴기 12 (생산성 +20% -> 0.6/s, 7.2/s) 중
9 working · 3 waiting_for_space. 광석 기둥이 막다른 끝이라 화로가 먹는 만큼만 흐른다 -> 제련이 병목.
    furn   smeltcol23 cu 화로 i=0..7 (45, -360+2i) 를 캐릭터가 걷어내고 (demolish) 같은 자리에 steel-furnace.
           강철로는 속도 2 · 전력 90kW (돌 화로와 같음) -> 석탄 추가 없이 8 x 0.3125/s 증가 = 7.5/s (10분 4,500).
           연료는 smeltcol23 run 중계가 채운다 (type='furnace' 로 바꿈).
    drill  광석 벨트 y=-395.5 (서향) 남쪽 광맥에 북향 채굴기 2 (54.5 / 58.5, -393.5) + 사이 전봇대 (56.5,-393.5)
           -> (58.5,-398.5) 전봇대에 이어짐. 14 x 0.6 = 8.4/s >= 7.5.
짓기는 캐릭터 (outpostcrew23 방식), 재료는 망 2 저장에서 가방으로 (있는 것만 옮김). 걷어낸 돌 화로 · 석탄 · 광석 · 판은 집에서 망으로.

    python -u scripts/cuupgrade23.py check
    python -u scripts/cuupgrade23.py go
로그 state/cuupgrade23.log
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

LOG = os.path.join(HERE, "..", "state", "cuupgrade23.log")
OWNER = "cuupgrade23"
ENTRY = (40.5, -365.5)
UPG = [(45.0, -360.0 + 2 * i) for i in range(16)]   # 1차 0..7, 2차 8..15 (망 강철로 16 확인 뒤)
DRILLS = [("electric-mining-drill", 54.5, -393.5, "north"), ("electric-mining-drill", 58.5, -393.5, "north"),
          ("small-electric-pole", 56.5, -393.5, "north"),
          # 2차 (강철로 16 -> 10/s): 같은 줄에 북향 2 더 (62.5 · 50.5) + 사이 전봇대 (60.5 · 52.5) -> 16 x 0.6 = 9.6/s
          ("electric-mining-drill", 62.5, -393.5, "north"), ("small-electric-pole", 60.5, -393.5, "north"),
          ("electric-mining-drill", 50.5, -393.5, "north"), ("small-electric-pole", 52.5, -393.5, "north")]
BACK = ("stone-furnace", "steel-furnace", "coal", "copper-ore", "copper-plate", "electric-mining-drill", "small-electric-pole")


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


STATE = """(function() local s = game.surfaces[1] local o = {steel = 0, stone = 0, drills = {}}
  for _, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.3}[1]
    if f and f.name == 'steel-furnace' then o.steel = o.steel + 1 elseif f then o.stone = o.stone + 1 end end
  for i, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.drills[i] = 'have'
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then o.drills[i] = 'ok'
    else local why = '' for _, x in pairs(s.find_entities_filtered{position = {t[2], t[3]}, radius = 1.5}) do why = why .. x.name .. ' ' end o.drills[i] = 'bad:' .. why end
  end
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.net = {sf = net.get_item_count('steel-furnace'), drill = net.get_item_count('electric-mining-drill'), pole = net.get_item_count('small-electric-pole')}
  return o end)()"""


def state(ai):
    pts = ", ".join("{%s, %s}" % p for p in UPG)
    rows = ", ".join("{'%s', %s, %s, %d}" % (n, x, y, crew.DIRS[d]) for n, x, y, d in DRILLS)
    return ai.lua(STATE % (pts, rows))


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


def go(ai):
    st = state(ai)
    log("시작 상태 %s" % st)
    todo_f = []
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for i, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.3}[1]
        o[i] = f and f.name or 'none' end return o end)()""" % ", ".join("{%s, %s}" % p for p in UPG))
    names = [r.get(str(i + 1)) for i in range(len(UPG))] if isinstance(r, dict) else list(r)
    todo_f = [p for p, n in zip(UPG, names) if n != "steel-furnace"]
    dr = st.get("drills") or {}
    dv = [dr.get(str(i + 1)) for i in range(len(DRILLS))] if isinstance(dr, dict) else list(dr)
    todo_d = [b for b, v in zip(DRILLS, dv) if v == "ok"]
    free = crew.free_crew(ai, 2)
    log("할 일: 화로 %d · 채굴기지 %d · 쉬는 사람 %s" % (len(todo_f), len(todo_d), free))
    sent = []
    if todo_f and free:
        who = free.pop(0)
        steps = [("walk_to", {"x": ENTRY[0], "y": ENTRY[1]})]
        for x, y in todo_f:
            steps.append(("demolish", {"x": x, "y": y, "name": "stone-furnace", "search_radius": 0.5}))
            steps.append(("build", {"name": "steel-furnace", "x": x, "y": y, "direction": 0}))
        steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
        if send(ai, who, {"steel-furnace": len(todo_f)}, steps):
            sent.append(who)
    if todo_d and free:
        who = free.pop(0)
        need = {}
        for b in todo_d:
            need[b[0]] = need.get(b[0], 0) + 1
        steps = crew.make_plan(todo_d, [], (56.5, -389.5))
        if send(ai, who, need, steps):
            sent.append(who)
    t0 = time.time()
    while sent and time.time() - t0 < 900:
        time.sleep(20)
        if not crew.busy(ai, sent):
            break
    for who in sent:
        log("%s 돌아옴 · 가방 -> 망 %s" % (who, unload(ai, who)))
    detached.release(sent)
    log("끝 상태 %s" % state(ai))


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        log("검사 %s" % state(ai))
    else:
        go(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

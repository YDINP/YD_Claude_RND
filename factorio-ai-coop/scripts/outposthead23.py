"""철 전초 머리 (-168..-146, -252..-237) 파괴 복구 - 캐릭터가 파괴 유령 자리에 직접 짓는다 (로봇 범위 밖, cn 0).

실측 (tick 20.07M): 레이저 무전력 21 -> 40. 기지 -> 철 전초 전력선 소형 전봇대 7 + 벨트 43 · 고속 벨트 6 · 지하 2 · 팔 5 · 강철로 2
가 파괴 유령 (remnants 같은 수). 전봇대가 끊겨 석탄 줄 (망 478) · 서쪽 채굴지 (망 479) 가 주 전력망 (2) 에서 떨어졌다.
주변 적 유닛 0 (큰 무는 놈 2 은 150 칸 북쪽 y -394), 둥지 0. 방어는 남쪽 기관총 (-158,-204) · 서쪽 (-192,-246) 뿐이라
머리 구역이 비어 있었다 -> 레이저 2 (전봇대 공급 안, 광석 밖) · 기관총 1 보강.

유령을 그대로 둔 채 같은 자리에 build (manual can_place 가 유령을 막지 않음) -> 선 뒤 겹친 유령은 지운다.
망 재고에 없는 고속 벨트 · 강철로는 캐릭터가 손제작 (철판 · 벨트 / 강철 · 벽돌 을 가방으로 옮겨서).

    python -u scripts/outposthead23.py check
    python -u scripts/outposthead23.py go
로그 state/outposthead23.log
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

LOG = os.path.join(HERE, "..", "state", "outposthead23.log")
OWNER = "outposthead23"
AREA = ((-175, -260), (-135, -225))
ENTRY = (-150.5, -236.5)
AMMO = "piercing-rounds-magazine"
DEFENCE = [("laser-turret", -150, -253, 0), ("laser-turret", -164, -248, 0), ("gun-turret", -157, -253, 0)]
# 망에 없으면 손제작: 이름 -> (재료, 수량 한 개당)
CRAFT = {"fast-transport-belt": {"iron-plate": 10, "transport-belt": 1},
         "steel-furnace": {"steel-plate": 6, "stone-brick": 10}}


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def T(v):
    if isinstance(v, dict) and v and all(k.isdigit() for k in v):
        return [v[str(i + 1)] for i in range(len(v))]
    return v if v else []


GHOSTS = """(function() local s = game.surfaces[1] local o = {}
  for _, g in pairs(s.find_entities_filtered{type = 'entity-ghost', force = 'player', area = {{%s, %s}, {%s, %s}}}) do
    local t = '' if g.ghost_type == 'underground-belt' then t = g.belt_to_ground_type end
    o[#o + 1] = {g.ghost_name, g.position.x, g.position.y, g.direction, t} end
  return o end)()"""

STATE = """(function() local s = game.surfaces[1] local o = {}
  local R0 = s.find_entities_filtered{name = 'roboport', position = {56, -127}, radius = 3}[1]
  for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', position = R0.position, radius = 8}) do o.main = p.electric_network_id break end
  local n, t = 0, 0
  for _, l in pairs(s.find_entities_filtered{name = 'laser-turret', force = 'player'}) do t = t + 1 if l.status == defines.entity_status.no_power then n = n + 1 end end
  o.no_power, o.lasers = n, t
  local c = s.find_entities_filtered{name = 'small-electric-pole', position = {-92.5, -265.5}, radius = 0.5}[1]
  o.coal_net = c and c.electric_network_id or -1
  local d = s.find_entities_filtered{name = 'small-electric-pole', position = {-168.5, -245.5}, radius = 0.5}[1]
  o.west_net = d and d.electric_network_id or -1
  o.ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{%s, %s}, {%s, %s}}}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.net = {pole = net.get_item_count('small-electric-pole'), belt = net.get_item_count('transport-belt'), ug = net.get_item_count('underground-belt'),
           ins = net.get_item_count('inserter'), fast = net.get_item_count('fast-transport-belt'), sf = net.get_item_count('steel-furnace'),
           laser = net.get_item_count('laser-turret'), gun = net.get_item_count('gun-turret'), ammo = net.get_item_count('%s')}
  return o end)()"""

# 선 엔티티와 겹친 유령 지우기 (같은 이름이 같은 자리에 섰을 때만)
CLEAN = """(function() local s = game.surfaces[1] local n = 0
  for _, g in pairs(s.find_entities_filtered{type = 'entity-ghost', force = 'player', area = {{%s, %s}, {%s, %s}}}) do
    local e = s.find_entities_filtered{name = g.ghost_name, position = g.position, radius = 0.3}[1]
    if e and e.valid then g.destroy() n = n + 1 end end
  return {cleaned = n} end)()"""


def area_args():
    return (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1])


def state(ai):
    return ai.lua(STATE % (area_args() + (AMMO,)))


def targets(ai):
    g = [T(x) if isinstance(x, dict) else list(x) for x in T(ai.lua(GHOSTS % area_args()))]
    return [tuple((x + [""] * 5)[:5]) for x in g] + [(n, x, y, d, "") for n, x, y, d in DEFENCE]


def plan_for(ai, who, builds):
    """builds: [(name, x, y, dir, type)] -> (need, steps)"""
    need, craft = {}, {}
    for b in builds:
        if b[0] in CRAFT:
            craft[b[0]] = craft.get(b[0], 0) + 1
        else:
            need[b[0]] = need.get(b[0], 0) + 1
    guns = [b for b in builds if b[0] == "gun-turret"]
    if guns:
        need[AMMO] = 25 * len(guns)
    for item, k in craft.items():
        for ing, per in CRAFT[item].items():
            need[ing] = need.get(ing, 0) + per * k
    steps = [("craft", {"recipe": item, "count": k}) for item, k in craft.items()]
    steps.append(("walk_to", {"x": ENTRY[0], "y": ENTRY[1]}))
    steps += crew.chops(ai, [b for b in builds if b[0] in ("laser-turret", "gun-turret")])
    for b in crew.order_path(builds, ENTRY):
        p = {"name": b[0], "x": b[1], "y": b[2], "direction": int(b[3])}
        if b[4]:
            p["type"] = b[4]
        steps.append(("build", p))
    for b in guns:
        steps.append(("insert", {"name": AMMO, "x": b[1], "y": b[2], "count": 25}))
    steps.append(("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}))
    return need, steps


def split(builds):
    """전봇대 · 석탄 간선 쪽 (x > -155) 과 제련 머리 쪽 (나머지) 으로 둘."""
    a = [b for b in builds if b[0] == "small-electric-pole" or b[0] in ("laser-turret", "gun-turret") or (b[1] > -155 and b[2] < -244)]
    rest = [b for b in builds if b not in a]
    return [c for c in (a, rest) if c]


BACK = ("small-electric-pole", "transport-belt", "fast-transport-belt", "underground-belt", "inserter", "steel-furnace",
        "laser-turret", "gun-turret", AMMO, "iron-plate", "iron-gear-wheel", "steel-plate", "stone-brick", "wood")
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


def go(ai, rounds=3):
    for rnd in range(rounds):
        builds = crew.missing(ai, targets(ai))
        log("%d 파 시작 %s · 지을 것 %d" % (rnd + 1, state(ai), len(builds)))
        if not builds:
            break
        free = crew.free_crew(ai, 2)
        if not free:
            log("쉬는 사람 없음 - 60초 뒤")
            time.sleep(60)
            continue
        sent = []
        for who, ch in zip(free, split(builds) if len(free) > 1 else [builds]):
            need, steps = plan_for(ai, who, ch)
            detached.mark([who], OWNER, minutes=40)
            bag = crew.load_bag(ai, who, need)
            have = bag.get("bag") or {}
            short = {k: v for k, v in need.items() if int(have.get(k, 0)) < v}
            if bag.get("dead") or short:
                log("%s 가방 부족 %s (가방 %s) - 건너뜀" % (who, short, have))
                unload(ai, who)
                detached.release([who])
                continue
            try:
                orders.submit(ai, who, steps, strict=False)
            except Exception as e:  # noqa: BLE001
                log("%s 계획 거절 %s" % (who, e))
                unload(ai, who)
                detached.release([who])
                continue
            log("%s 출발: 짓기 %d (%d 단계, 가방 %s)" % (who, len(ch), len(steps), have))
            sent.append(who)
        t0 = time.time()
        while sent and time.time() - t0 < 1200:
            time.sleep(20)
            if not crew.busy(ai, sent):
                break
        for who in sent:
            log("%s 돌아옴 · 가방 -> 망 %s" % (who, unload(ai, who)))
        detached.release(sent)
        log("겹친 유령 정리 %s" % ai.lua(CLEAN % area_args()))
    log("끝 %s · 빠진 것 %s" % (state(ai), crew.missing(ai, targets(ai))[:10]))


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        b = targets(ai)
        cnt = {}
        for x in b:
            cnt[x[0]] = cnt.get(x[0], 0) + 1
        log("검사 %s · 대상 %s" % (state(ai), cnt))
    elif cmd == "go":
        go(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

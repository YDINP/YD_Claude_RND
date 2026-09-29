"""철 전초 서쪽 재건 (09-29 18:4x) - 08:00~12:30 서쪽 공습으로 전초 서반부 (x <= -209.5) 가 부서져 철이 병목.

실측 (tick 26.21M, 18:37):
    채굴기 8 만 working (24 -> 8: 부서짐 13 + 광맥 동쪽 끝 고갈 3 (drillclean)) -> 광석 10분 8,498 -> 2,880 (= 8 x 0.6/s).
    유령 (죽은 자리) 91: 채굴기 13 · 기관총 11 · 레이저 6 · 작은 전봇대 14 · 벨트 47. 방어 링 서쪽 x=-235 · 남쪽 y=-272 이 거의 전멸.
    공격원: 서쪽 둥지 무리 (-368..-336, -224..-192) · 북서 (-304..-240, -416..-336).
    사슬: 광석 1/3 -> 망 철판 < 4,000 -> smeltcol23 이 강철 기둥 입력 팔 18 끔 (6,000 위에서 켬, 그 뒤로 한 번도 못 넘음)
          -> 강철은 돌 화로 8 몫 10분 ~300 = 소비와 같음 -> 망 강철 < 300 (ironfeed23 하한) -> 엔진 9 강철 0 -> 파랑 0 -> 연구 멈춤.
고침: 유령 자리를 캐릭터가 손으로 짓는다 (부활 X, 로봇 X). 방어 (포탑 · 전봇대) 먼저 · 탄 넣기, 그다음 채굴기 · 벨트.
재료는 망 2 저장 -> 가방 (있는 물건만). 채굴기는 망 1 뿐 -> 망 철판 · 회로로 손제작.

    python -u scripts/ferebuild23.py plan       # 유령 목록 -> state/ferebuild23_plan.json
    python -u scripts/ferebuild23.py craft      # 채굴기 손제작 (망 재료)
    python -u scripts/ferebuild23.py defense    # 포탑 17 · 전봇대 14 + 기관총 탄
    python -u scripts/ferebuild23.py mine       # 채굴기 13 · 벨트 47
    python -u scripts/ferebuild23.py status
로그 state/ferebuild23.log
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import orders  # noqa: E402
import outpostcrew23 as crew  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "ferebuild23.log")
PLAN = os.path.join(HERE, "..", "state", "ferebuild23_plan.json")
OWNER = "ferebuild23"
AREA = ((-250, -290), (-140, -170))
DIR_NAME = {0: "north", 4: "east", 8: "south", 12: "west"}
AMMO = ("piercing-rounds-magazine", 20)
ENTRY_W = (-226.5, -238.5)   # feore23 서 무리 입구 (광석 북쪽, 방어 링 안)


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


GHOSTS = """(function() local s = game.surfaces[1] local o = {}
  for _, g in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = 'entity-ghost'}) do
    o[#o + 1] = {g.ghost_name, g.position.x, g.position.y, g.direction} end
  return o end)()"""


def plan(ai, *_):
    r = ai.lua(GHOSTS % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1]))
    rows = list(r.values()) if isinstance(r, dict) else list(r or [])
    b = [(n, float(x), float(y), DIR_NAME.get(int(d), "north")) for n, x, y, d in rows]
    b.sort(key=lambda t: (t[0], t[1], t[2]))
    if b or not os.path.exists(PLAN):
        with open(PLAN, "w", encoding="utf-8") as f:
            json.dump(b, f, ensure_ascii=False, indent=0)
    cnt = {}
    for t in b:
        cnt[t[0]] = cnt.get(t[0], 0) + 1
    log("유령 %d %s -> %s" % (len(b), cnt, os.path.basename(PLAN)))
    return b


def load_plan():
    with open(PLAN, encoding="utf-8") as f:
        return [tuple(t) for t in json.load(f)]


def net_count(ai, names):
    rows = ", ".join("'%s'" % n for n in names)
    return ai.lua("""(function() local net = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player') local o = {}
      for _, n in pairs({%s}) do o[n] = net.get_item_count(n) end return o end)()""" % rows)


def wait_back(ai, sent, limit=900):
    t0 = time.time()
    while sent and time.time() - t0 < limit:
        time.sleep(20)
        if not crew.busy(ai, sent):
            break
    for who in sent:
        try:
            crew.unload_bag(ai, who)
        except Exception:  # noqa: BLE001
            pass
    detached.release(sent)


def craft(ai, *_):
    b = load_plan()
    want = len(crew.missing(ai, [t for t in b if t[0] == "electric-mining-drill"]))
    n = net_count(ai, ["electric-mining-drill", "iron-plate", "electronic-circuit", "iron-gear-wheel"])
    k = max(0, want - int(n["electric-mining-drill"]))
    log("채굴기 손제작 %d (필요 %d, 망 %s)" % (k, want, n))
    if not k:
        return
    free = crew.free_crew(ai, 1)
    if not free:
        log("쉬는 사람 없음")
        return
    who = free[0]
    detached.mark([who], OWNER, minutes=30)
    need = {"iron-plate": 20 * k, "electronic-circuit": 3 * k}
    bag = crew.load_bag(ai, who, need)
    log("%s 가방 %s" % (who, bag))
    steps = [("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]}),
             ("craft", {"recipe": "iron-gear-wheel", "count": 5 * k, "wait": "block"}),
             ("craft", {"recipe": "electric-mining-drill", "count": k, "wait": "block"}),
             ("wait", {"ticks": 120})]
    orders.submit(ai, who, steps, strict=False)
    wait_back(ai, [who], limit=900)
    log("망 뒤 %s" % net_count(ai, ["electric-mining-drill"]))


def _run(ai, builds, inserts_for, label):
    ok = crew.run_job(ai, builds, inserts_for, ENTRY_W, OWNER, log, crew_n=3, rounds=4, wait_max=1200,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s %s" % (label, "완료" if ok else "미완"))
    return ok


def defense(ai, *_):
    b = [t for t in load_plan() if t[0] in ("gun-turret", "laser-turret", "small-electric-pole")]

    def ins(ch):
        return [(AMMO[0], t[1], t[2], AMMO[1]) for t in ch if t[0] == "gun-turret"]
    return _run(ai, b, ins, "방어")


def mine(ai, *_):
    b = [t for t in load_plan() if t[0] in ("electric-mining-drill", "transport-belt", "small-electric-pole")]
    return _run(ai, b, lambda ch: [], "채굴")


STATUS = """(function() local s = game.surfaces[1] local o = {drills = {}, ghosts = 0}
  local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
  for _, d in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = 'mining-drill'}) do
    local k = st[d.status] or '?' o.drills[k] = (o.drills[k] or 0) + 1 end
  o.ghosts = s.count_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = 'entity-ghost'}
  o.turrets = s.count_entities_filtered{area = {{%d, %d}, {%d, %d}}, type = {'ammo-turret', 'electric-turret'}}
  local ps = game.forces.player.get_item_production_statistics(s) o.f10 = {}
  for _, n in pairs({'iron-ore', 'iron-plate', 'steel-plate', 'engine-unit', 'chemical-science-pack'}) do
    o.f10[n] = math.floor(ps.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true}) end
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.net = {iron = net.get_item_count('iron-plate'), steel = net.get_item_count('steel-plate')}
  local r = game.forces.player.current_research o.research = r and r.name or 'none'
  o.prog = math.floor((game.forces.player.research_progress or 0) * 10000) / 100
  return o end)()"""


def status(ai, *_):
    a = (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1])
    r = ai.lua(STATUS % (a * 3))
    log("상태 %s" % r)
    return r


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    {"plan": plan, "craft": craft, "defense": defense, "mine": mine, "status": status}[cmd](ai, *sys.argv[2:])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""석탄 광맥 (-83,-278) 채굴기 8 -> 철 상자 4 -> (Lua) 망 2 저장. 사용자 15:1x «구리 전초 연료 바닥, 석탄 기지 전체가 빠듯».

coalline23 채굴기 4 (모음 x=-91.5, 철 전초 벨트) 동쪽에 상자 기둥 x=-83.5 를 두고 채굴기가 마주 보며 상자에 떨군다.
    채굴기 E (-85.5, y) 동향 · W (-81.5, y) 서향, 상자 (-83.5, y), y = -287.5 / -284.5 / -281.5 / -278.5
    작은 전봇대 (-83.5,-285.5) (-83.5,-279.5) -> 기존 (-87.5,-278.5) (coalline23 고리)
    방어: 기존 레이저 (-87,-272) (-103,-280) · 기관총 (-99,-273) (-83,-273) 안 (가장 먼 채굴기까지 ~17 칸). 광석 위 포탑 없음.
상자 -> 망 저장 옮김은 smeltcol23 run (COALNET, 망 석탄 상한 2000) 이 하고, 망 -> 플라스틱 석탄 상자 (-1.5,-30.5) 400 까지 (BOXFILL).
증설 규모: 구리 강철로 16 ~216/10분 + 플라스틱 ~350/10분 = ~570/10분 (0.95/s) 에 채굴기 8 = 최대 ~2400/10분 (4/s).
벨트가 아니라 상자라 석탄 벨트와 섞일 일 없음.
짓기는 캐릭터 (outpostcrew23.run_job), 재료는 망 2 저장 -> 가방 (옮김). 철 상자는 망에 1 뿐 -> 캐릭터가 망 철판으로 손 제작 (craft).

    python -u scripts/coalnet23.py check
    python -u scripts/coalnet23.py craft          # 철 상자 모자란 만큼 캐릭터 손 제작 -> 망으로
    python -u scripts/coalnet23.py build
    python -u scripts/coalnet23.py status
로그 state/coalnet23.log
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import coalline23 as cl  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "coalnet23.log")
ROWS = (-287.5, -284.5, -281.5, -278.5)
XC = -83.5
CHESTS = [(XC, y) for y in ROWS]
ENTRY = (-88.5, -270.5)


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cl.log = log


def mine():
    b = [("small-electric-pole", XC, -279.5, "north"), ("small-electric-pole", XC, -285.5, "north")]
    for y in ROWS:
        b.append(("iron-chest", XC, y, "north"))
        b.append(("electric-mining-drill", XC - 2, y, "east"))
        b.append(("electric-mining-drill", XC + 2, y, "west"))
    return b


cl.PARTS["net"] = mine
cl.SIZE["iron-chest"] = 0.45

TREES = """(function() local s = game.surfaces[1] local o = {}
  for _, t in pairs({%s}) do local h = t[3]
    for _, e in pairs(s.find_entities_filtered{area = {{t[1] - h, t[2] - h}, {t[1] + h, t[2] + h}}, type = {'tree', 'simple-entity'}}) do
      o[#o + 1] = {e.position.x, e.position.y} end end
  return o end)()"""


def chops(ai, builds):
    """채굴기는 3x3 전체 (crew.chops 는 가운데만 봄)."""
    if not builds:
        return []
    rows = ", ".join("{%s, %s, %s}" % (b[1], b[2], 1.45 if b[0] == "electric-mining-drill" else 0.45) for b in builds)
    r = ai.lua(TREES % rows)
    v = list(r.values()) if isinstance(r, dict) else list(r or [])
    seen, out = set(), []
    for t in v:
        k = (round(t[0], 1), round(t[1], 1))
        if k not in seen:
            seen.add(k)
            out.append(("chop", {"x": t[0], "y": t[1], "count": 1}))
    return out


NET = """(function() local net = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player')
  return {chest = net.get_item_count('iron-chest'), plate = net.get_item_count('iron-plate')} end)()"""

BAG_TO_NET = """(function() @BODY@
  local s = game.surfaces[1] local b = body('%s') if not b then return {dead = 1} end
  local m = b.get_main_inventory() local o = {}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, n in pairs({%s}) do local k = m.get_item_count(n)
    if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then m.remove{name = n, count = put} o[n] = put end end end
  return o end)()"""


def bag_to_net(ai, who, names):
    from proboport23 import BODY
    return ai.lua(BAG_TO_NET.replace("@BODY@", BODY) % (who, ", ".join("'%s'" % n for n in names)))


def craft(ai):
    import orders
    import outpostcrew23 as crew
    import detached
    have = ai.lua(NET).get("chest", 0)
    lack = len(CHESTS) - int(have)
    if lack <= 0:
        log("철 상자 망 %d - 제작 불필요" % have)
        return True
    who = crew.free_crew(ai, 1)
    if not who:
        log("쉬는 사람 없음")
        return False
    who = who[0]
    detached.mark([who], "coalnet23", minutes=10)
    bag = crew.load_bag(ai, who, {"iron-plate": 8 * lack})
    log("%s 철판 가방 %s -> 철 상자 %d 손 제작" % (who, bag, lack))
    orders.submit(ai, who, [("craft", {"recipe": "iron-chest", "count": lack, "wait": True})], strict=False)
    t0 = time.time()
    while time.time() - t0 < 120:
        time.sleep(5)
        if not crew.busy(ai, [who]):
            break
    r = bag_to_net(ai, who, ["iron-chest", "iron-plate"])
    detached.release([who])
    log("제작 뒤 가방 -> 망 %s · 망 철 상자 %s" % (r, ai.lua(NET)))
    return ai.lua(NET).get("chest", 0) >= len(CHESTS)


def build(ai):
    import outpostcrew23 as crew
    b = mine()
    ok = crew.run_job(ai, b, lambda ch: [], ENTRY, "coalnet23", log, crew_n=2, rounds=5,
                      pre_for=lambda ch: chops(ai, ch))
    # unload_bag 목록에 채굴기 · 철 상자가 없다 -> 남은 것 망으로
    import detached
    for w in crew.CREW:
        if detached.owner(w) not in (None, "coalnet23") or crew.busy(ai, [w]):
            continue
        try:
            r = bag_to_net(ai, w, ["electric-mining-drill", "iron-chest", "small-electric-pole"])
            if r and not r.get("dead") and r:
                log("%s 가방 남은 것 -> 망 %s" % (w, r))
        except Exception:  # noqa: BLE001
            pass
    log("net 캐릭터 건설 %s" % ("완료" if ok else "미완"))
    return ok


STATUS = """(function() local s = game.surfaces[1] local o = {drills = {}, chest = {}, nonet = 0}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-88, -290}, {-79, -276}}}) do
    o.drills[#o.drills + 1] = st[d.status] or d.status end
  for _, p in pairs({%s}) do local c = s.find_entities_filtered{name = 'iron-chest', position = p, radius = 0.3}[1]
    o.chest[#o.chest + 1] = c and c.get_item_count('coal') or -1 end
  local net = s.find_logistic_network_by_position({-24, -88}, 'player') o.net_coal = net.get_item_count('coal')
  local p1 = defines.flow_precision_index.ten_minutes
  local ps = game.forces.player.get_item_production_statistics(s)
  o.coal10 = {math.floor(ps.get_flow_count{name = 'coal', category = 'input', precision_index = p1, count = true}),
              math.floor(ps.get_flow_count{name = 'coal', category = 'output', precision_index = p1, count = true})}
  return o end)()"""


def status(ai):
    r = ai.lua(STATUS % ", ".join("{%s, %s}" % p for p in CHESTS))
    for k in ("drills", "chest"):
        v = r.get(k) or {}
        r[k] = list(v.values()) if isinstance(v, dict) else v
    log("상태 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "craft", "build", "status"])
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        cl.check(ai, "net")
    elif a.cmd == "craft":
        craft(ai)
    elif a.cmd == "build":
        build(ai)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

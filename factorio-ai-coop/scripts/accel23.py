"""노랑 가속 감시 - 23회차 (2026-09-27, 사용자: "빨리 노란팩 생산해서 대포 연구 빨리해줘").

yellow23 --feed (먹이 고리) 곁에서 도는 작은 고리. 사람을 직접 부리지 않고 state/yellow23_orders.json 으로만 일을 끼운다.
  · 저밀도 2형 둘의 결과 상자 (7.5,-48.5) · (10.5,-46.5) 에 저밀도가 쌓이면 빈 제작꾼에게 «상자 -> 노랑 조립기» 배달을 준다
    (노랑 둘 중 저밀도가 적은 쪽으로).
  · 구리선 조립기 (5.5,-8.5) 가 2형으로 바뀌어 레시피가 비었으면 copper-cable 로 맞춘다.
  · 10분마다 노랑/분 · artillery 진척 · 예상 남은 시간을 '가속' 접두어로 state/yellow23.log 에 적는다.

    python scripts/accel23.py --minutes 140
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge, RconError  # noqa: E402
import yellow23 as Y  # noqa: E402

LDS_OUT = [(7.5, -48.5), (10.5, -46.5)]
MAKERS = ["alpha", "bravo", "charlie", "echo", "foxtrot", "hotel"]

PROBE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local function am(x, y) return s.find_entities_filtered{type = 'assembling-machine', position = {x, y}, radius = 0.6}[1] end
  local function ch(x, y) return s.find_entities_filtered{type = 'container', position = {x, y}, radius = 0.4}[1] end
  local o = {lds = {}}
  for i, p in pairs({{7.5, -48.5}, {10.5, -46.5}}) do
    local c = ch(p[1], p[2]) o.lds[i] = c and c.get_inventory(defines.inventory.chest).get_item_count('low-density-structure') or -1
  end
  local function inp(e, n) return e and e.get_inventory(defines.inventory.assembling_machine_input).get_item_count(n) or -1 end
  local y1, y2 = am(29.5, -8.5), am(12.5, 3.5)
  o.y1 = inp(y1, 'low-density-structure') o.y2 = inp(y2, 'low-density-structure')
  o.y2out = y2 and y2.get_inventory(defines.inventory.assembling_machine_output).get_item_count('utility-science-pack') or 0
  o.ldscu = {inp(am(7.5, -45.5), 'copper-plate'), inp(am(4.5, -47.5), 'copper-plate')}
  local cc = ch(5.5, -5.5) o.cuchest = cc and cc.get_inventory(defines.inventory.chest).get_item_count('copper-plate') or 0
  local cab = am(5.5, -8.5)
  o.cab = cab and (cab.name .. ':' .. (cab.get_recipe() and cab.get_recipe().name or '-')) or 'none'
  if cab and cab.name == 'assembling-machine-2' and not cab.get_recipe() then cab.set_recipe('copper-cable') o.cabset = true end
  local st = f.get_item_production_statistics(s)
  local p10 = defines.flow_precision_index.ten_minutes
  local function fl(n, cat) return st.get_flow_count{name = n, category = cat, precision_index = p10, count = true} end
  o.p10 = {}
  for _, n in pairs({'utility-science-pack', 'processing-unit', 'low-density-structure', 'flying-robot-frame', 'electronic-circuit', 'copper-plate'}) do
    o.p10[n] = math.floor(fl(n, 'input')) .. '/' .. math.floor(fl(n, 'output'))
  end
  o.research = f.current_research and f.current_research.name or 'none'
  o.progress = f.research_progress
  o.tick = game.tick
  return o
end)()"""


def orders():
    try:
        with open(Y.ORDERS, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def lds_order(n, to_y2):
    plan = [Y.walk(*Y.LDS_STAND)]
    plan += [("take", {"name": "low-density-structure", "x": x, "y": y, "count": 50}) for x, y in LDS_OUT]
    if to_y2:
        plan += [Y.walk(8.5, -2.0), Y.walk(*Y.HUB2_STAND),
                 ("insert", {"name": "low-density-structure", "x": Y.Y2[0], "y": Y.Y2[1], "count": 100})]
    else:
        plan += Y.corridor_to(Y.YELLOW[0]) + [("insert", {"name": "low-density-structure", "x": Y.YELLOW[0], "y": Y.YELLOW[1], "count": 100}),
                                               Y.walk(12.5, Y.CORR_Y)]
    return plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=140)
    ap.add_argument("--measure", type=int, default=600)
    a = ap.parse_args()
    ai = AIBridge()
    t_end = time.time() + a.minutes * 60
    t_meas, last = 0, None
    Y.say("가속 감시 시작 (%d분)" % a.minutes)
    while time.time() < t_end:
        try:
            r = ai.lua(PROBE)
        except RconError as e:
            Y.say("가속 probe 실패 %s" % e)
            time.sleep(20)
            continue
        if r.get("cabset"):
            Y.say("가속 구리선 2형 레시피 copper-cable")
        n = sum(max(0, k) for k in r["lds"])
        pending = orders()
        if n >= 6 and not any(w in pending and any(st[1].get("name") == "low-density-structure" for st in pending[w]) for w in pending):
            live = {w["name"]: w for w in ai.list()}
            idle = [w for w in MAKERS if w in live and not (live[w].get("current") or live[w].get("queued")) and w not in pending]
            who = idle[0] if idle else next((w for w in MAKERS if w not in pending), None)
            if who:
                to_y2 = r["y2"] >= 0 and r["y2"] < r["y1"]
                Y.put_order(who, lds_order(n, to_y2))
                Y.say("가속 저밀도 배달 %d -> %s (%s)" % (n, "Y2" if to_y2 else "Y1", who))
        # 둘째 노랑 (12.5,3.5) 결과는 손으로만 나간다 - 6 넘게 쌓여 full_output 이면 빈 제작꾼이 걷어 연구소 옆치기 상자로
        pending = orders()
        busy_kinds = {st[1].get("name") for w in pending for st in pending[w] if st[0] in ("take", "insert")}
        live = {w["name"]: w for w in ai.list()}
        idle = [w for w in MAKERS if w in live and not (live[w].get("current") or live[w].get("queued")) and w not in pending]
        if r.get("y2out", 0) >= 6 and "utility-science-pack" not in busy_kinds and idle:
            who = idle.pop(0)
            Y.put_order(who, [Y.walk(8.5, -2.0), Y.walk(*Y.HUB2_STAND),
                              ("take", {"name": "utility-science-pack", "x": Y.Y2[0], "y": Y.Y2[1], "count": 100}),
                              Y.walk(8.5, Y.CORR_Y), Y.walk(*Y.LABFEED_STAND),
                              ("insert", {"name": "utility-science-pack", "x": Y.LABFEED_CHEST[0], "y": Y.LABFEED_CHEST[1], "count": 200}),
                              Y.walk(8.5, Y.CORR_Y)])
            Y.say("가속 Y2 노랑 %d 걷기 -> 연구소 (%s)" % (r["y2out"], who))
        # 저밀도 구리: 벨트가 채우는 구리선 상자 (5.5,-5.5) 가 넘치면 (> 900) 거기서 400 을 저밀도 둘에
        if min(r.get("ldscu", [999])) < 60 and r.get("cuchest", 0) > 900 and "copper-plate" not in busy_kinds and idle:
            who = idle.pop(0)
            Y.put_order(who, [Y.walk(4.5, -3.5), ("take", {"name": "copper-plate", "x": Y.COPPER_CHEST[0], "y": Y.COPPER_CHEST[1], "count": 400}),
                              Y.walk(*Y.LDS_STAND)] +
                        [("insert", {"name": "copper-plate", "x": x, "y": y, "count": 200}) for x, y in Y.LDS] + [Y.walk(10.5, -50.0)])
            Y.say("가속 저밀도 구리 %s <- 구리선 상자 %d (%s)" % (r["ldscu"], r["cuchest"], who))
        # 회로 조립기 철 상자 (구리선 2형 뒤 회로 ~60/분 = 철 60/분): 400 밑이면 빈 제작꾼이 1,000 을 한 번에
        pending = orders()
        if not any(w in pending and any(st[1].get("name") == "iron-plate" and st[0] == "insert" for st in pending[w]) for w in pending):
            try:
                live = {w["name"]: w for w in ai.list()}
                pos = {w: (live[w]["x"], live[w]["y"]) for w in MAKERS if w in live}
                sn = Y.snap(ai, pos)
            except RconError:
                sn = None
            if sn and sn["fe"] < 400:
                idle = [w for w in MAKERS if w in live and not (live[w].get("current") or live[w].get("queued")) and w not in pending]
                if idle:
                    who = idle[0]
                    steps, ok = Y.gather(sn, sn["bags"].get(who, {}), pos[who], "iron-plate", 1000)
                    if ok:
                        Y.put_order(who, steps + [Y.walk(10.5, -3.5), ("insert", {"name": "iron-plate", "x": Y.IRON_CHEST[0], "y": Y.IRON_CHEST[1], "count": 1000})])
                        Y.say("가속 회로 철 상자 %d -> +1000 (%s)" % (sn["fe"], who))
        if time.time() - t_meas >= a.measure:
            t_meas = time.time()
            line = {"tick": r["tick"], "prog": round(r["progress"], 4), "p10": r["p10"], "lds_chest": r["lds"], "y1lds": r["y1"], "y2lds": r["y2"], "cab": r["cab"]}
            if last and r["research"] == "artillery" and r["tick"] > last[0]:
                dmin = (r["tick"] - last[0]) / 3600
                rate = (r["progress"] - last[1]) / dmin       # 진척/분
                line["units_per_min"] = round(rate * 2000, 2)
                if rate > 0:
                    line["eta_h"] = round((1 - r["progress"]) / rate / 60, 2)
            last = (r["tick"], r["progress"])
            Y.say("가속 측정 " + json.dumps(line, ensure_ascii=False))
        time.sleep(60)
    Y.say("가속 감시 끝")


if __name__ == "__main__":
    main()

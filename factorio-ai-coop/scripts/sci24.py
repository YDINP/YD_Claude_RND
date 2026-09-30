"""Run 24: 연구 멈춤 (12:35 연구소 18 모두 missing_science_packs) 풀기 - 물류 로봇 늘리기 (사람 손제작).

12:35 실측: 물류 로봇 55 (한가 5) · 건설 404. 망에 틀 497 · 고급회로 ~930 이 있는데 로봇이 모자라 robofeed 요청이 늦다.
  → foxtrot: 고급회로 (25.5,-9.5) 300 + 틀 (-76.5,-3.5) 150 → 물류 로봇 150 손제작 (0.5 s × 150) → 로보포트 (-71,-2) 로봇 칸 (빈 6 칸) 에 손으로.
Lua 아이템 이동 0 - 사람 손 (take · craft · insert) 만.

    python scripts/sci24.py --robots --who foxtrot --n 150
    python scripts/sci24.py --status
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge  # noqa
from orders import submit  # noqa

OWNER = "sci24"
ADV = (25.5, -9.5)
FRAME = (-76.5, -3.5)
PORT = (-71.0, -2.0)


def robots(ai, who, n):
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=15)
    plan = [("walk_to", {"x": ADV[0], "y": ADV[1] + 1.5}), ("take", {"name": "advanced-circuit", "x": ADV[0], "y": ADV[1], "count": 2 * n}),
            ("walk_to", {"x": FRAME[0], "y": FRAME[1] + 1.5}), ("take", {"name": "flying-robot-frame", "x": FRAME[0], "y": FRAME[1], "count": n}),
            ("craft", {"recipe": "logistic-robot", "count": n, "wait": "block"}),
            ("walk_to", {"x": PORT[0] - 2.5, "y": PORT[1] + 3.0}),
            ("insert", {"name": "logistic-robot", "x": PORT[0], "y": PORT[1], "count": n}),
            ("walk_to", {"x": -60.5, "y": -3.5})]
    submit(ai, who, plan, strict=False)
    print(time.strftime("%X"), who, "물류 로봇", n)


def status(ai):
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local out = {tick = game.tick, logi = {n.all_logistic_robots, n.available_logistic_robots}, cons = {n.all_construction_robots, n.available_construction_robots}}
      local lab = {}
      for _, l in pairs(s.find_entities_filtered{type = 'lab', force = f}) do local k = st[l.status] or '?' lab[k] = (lab[k] or 0) + 1 end
      out.labs = lab
      local ps = f.get_item_production_statistics(s)
      local p = {}
      for k, nm in pairs({red = 'automation-science-pack', green = 'logistic-science-pack', blue = 'chemical-science-pack',
                          purple = 'production-science-pack', yellow = 'utility-science-pack', iron = 'iron-plate', steel = 'steel-plate'}) do
        p[k] = math.floor(ps.get_flow_count{name = nm, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true})
      end
      out.p10 = p
      local r = f.current_research
      out.research = r and {r.name, math.floor(f.research_progress * 1000) / 10} or nil
      out.net = {iron = n.get_item_count('iron-plate'), steel = n.get_item_count('steel-plate'), adv = n.get_item_count('advanced-circuit'),
                 engine = n.get_item_count('engine-unit'), frame = n.get_item_count('flying-robot-frame')}
      return out
    end)()""")
    print(json.dumps(r, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--who", default="foxtrot")
    ap.add_argument("--robots", action="store_true")
    ap.add_argument("--n", type=int, default=150)
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.robots:
        robots(ai, a.who, a.n)
    if a.status:
        status(ai)


if __name__ == "__main__":
    main()

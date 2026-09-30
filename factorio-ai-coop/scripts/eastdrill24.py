"""Run 24 동쪽 전초 드릴 되짓기 (16:1x) - 공습 뒤 드릴 유령 37 · 전초 망 드릴 0 · 기지 망 철 -6 · 톱니 4.

Lua 아이템 이동 0 - 사람이 걸어서 꺼냄 (take) · 손제작 (단계마다 wait block) · 서쪽 문 저장 상자에 손으로 넣음 → 전초 로봇이 지음.

철 출처 (망 밖, 조립기 입력 상자 (-20.5/1.5,29.5) (19.5,15.5) 는 건드리지 않음):
  거름 상자 (101.5,-9.5) (102.5,-9.5) (104.5,-11.5) · 허브 쇠 상자 (67.5 · 68.5 · 70.5, -15.5) · 허브 (74.5,-15.5, eastsup 몫 - 150 남김).
전선: 망 저장 상자 (59.5,-14.5) (전선 7k). 드릴 1 = 철 23 (회로 3 = 철 3 + 전선 9 · 톱니 5 = 철 10 · 철 10).

    python scripts/eastdrill24.py --status
    python scripts/eastdrill24.py --go [--who delta] [--max 37] [--dry]
    python scripts/eastdrill24.py --release delta
"""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge  # noqa
from orders import submit  # noqa
from ironfix24 import STATUS, WEST_GATE_STORE, WEST_GATE_WALK, HOME  # noqa

OWNER = "eastdrill24"
IRON_SRC = [(101.5, -9.5), (102.5, -9.5), (104.5, -11.5), (67.5, -15.5), (68.5, -15.5), (70.5, -15.5), (74.5, -15.5)]
KEEP = {(74.5, -15.5): 150}                # 허브 (74.5) 는 eastsup 몫 - 150 남김 (16:3x 부터 급해서 씀)
CABLE = (59.5, -14.5)
PER_DRILL = 23


def chest_iron(ai):
    got = ai.lua("""(function() local s = game.surfaces[1] local o = {}
      for i, p in pairs(helpers.json_to_table('%s')) do local c = s.find_entities_filtered{position = p, radius = 0.3, type = 'container'}[1]
        o[i] = c and c.get_item_count('iron-plate') or 0 end
      return o end)()""" % json.dumps([list(p) for p in IRON_SRC]))
    return [int(g) for g in (list(got.values()) if isinstance(got, dict) else got)]


def plan_for(ai, who, cap):
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    got = chest_iron(ai)
    iron = bag.get("iron-plate", 0)
    need = cap * PER_DRILL - iron
    plan = []
    for (x, y), n in zip(IRON_SRC, got):
        n -= KEEP.get((x, y), 0)
        if need <= 0 or n <= 0:
            continue
        k = min(n, need)
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "iron-plate", "x": x, "y": y, "count": k})]
        iron += k
        need -= k
    drills = min(cap, iron // PER_DRILL)
    circ = max(0, 3 * drills - bag.get("electronic-circuit", 0))
    cable = max(0, 3 * circ - bag.get("copper-cable", 0))
    gears = max(0, 5 * drills - bag.get("iron-gear-wheel", 0))
    if cable:
        plan += [("walk_to", {"x": CABLE[0], "y": CABLE[1] + 1.5}), ("take", {"name": "copper-cable", "x": CABLE[0], "y": CABLE[1], "count": cable})]
    if circ:
        plan.append(("craft", {"recipe": "electronic-circuit", "count": circ, "wait": "block"}))
    if gears:
        plan.append(("craft", {"recipe": "iron-gear-wheel", "count": gears, "wait": "block"}))
    plan += [("craft", {"recipe": "electric-mining-drill", "count": drills, "wait": "block"}),
             ("walk_to", {"x": WEST_GATE_WALK[0], "y": WEST_GATE_WALK[1]}),
             ("insert", {"name": "electric-mining-drill", "x": WEST_GATE_STORE[0], "y": WEST_GATE_STORE[1], "count": drills}),
             ("walk_to", {"x": HOME[0], "y": HOME[1]})]
    return plan, {"iron": iron, "drills": drills, "circ": circ, "gears": gears, "cable": cable, "src": got}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--go", action="store_true")
    ap.add_argument("--who", default="delta")
    ap.add_argument("--max", type=int, default=37)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--release", nargs="*")
    a = ap.parse_args()
    ai = AIBridge()
    os.environ[detached.ENV] = OWNER
    if a.release:
        detached.release(a.release)
        print("released", a.release)
    if a.status:
        print(json.dumps(ai.lua(STATUS), ensure_ascii=False))
    if a.go:
        o = detached.owner(a.who)
        if o not in (None, OWNER, "ammorun"):   # ammorun = 코디네이터가 넘겨 줌 (16:1x)
            print(a.who, "owned by", o, "- skip")
            return 1
        plan, info = plan_for(ai, a.who, a.max)
        print(a.who, info, len(plan), "steps")
        if a.dry:
            for s in plan:
                print("  ", s)
            return 0
        detached.mark([a.who], OWNER, minutes=30)
        print(submit(ai, a.who, plan, strict=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

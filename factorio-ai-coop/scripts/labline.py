"""Packs ride a belt to the labs. What the labs do not take lands in a box.

    사용자: "물류팩들(연구소에 투입되는 자원들)도 연구소로 벨트연결해서
             자동으로 투입되도록 만들어줘. 병목으로 남는건 상자에 저장했다가
             나중에 필요하면 쓰도록하고"

연구소는 호숫가 발전소 옆(x 50, y -47)에 있었다 - 물이 거기뿐이라 발전소가
거기 섰고, 연구소는 «전기가 거기 있어서» 옆에 섰다. 조립 모듈에서 110칸.
벨트 145칸을 까느니 연구소 세 대를 조립 모듈 옆으로 옮긴다: 전기는 이미
모듈까지 와 있다.

    팩 벨트 x=-13, 북쪽으로 흐른다.
      빨간 팩: 1호 모듈 출구 팔이 (-13,22)·(-13,14) 에 «떨군다» -> 먼 쪽(동) 레인
      녹색 팩: 2호 모듈 출구에서 y=27 로 동진, 간선은 지하로 건너 (-13,27) 에
               «옆으로 붙는다» -> 가까운 쪽(서) 레인.  줄머리 뒤 (-13,28) 은
               빈 벨트 - 그래야 옆으로 붙는 것이 한 레인만 쓴다 (fuel.py 참고)
    연구소 셋: 벨트 동쪽, 팔 하나씩.  (-9.5, 12.5) (-9.5, 8.5) (-9.5, 4.5)
    줄 끝 (-13,3): 팔이 남는 것을 상자 (-13,1) 에 넣는다.

연구소 팔은 벨트에서 «연구에 드는 것»을 집는다. 연구가 빨강만 들면 녹색은
지나쳐 상자로 간다 - 그것이 「병목으로 남는 것은 상자에」다.

    python scripts/labline.py                      # 어디까지 됐나
    python scripts/labline.py --who charlie --all  # 세 단계 차례로
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402
import fuel                              # noqa: E402  (belt/ug/gone/col/standing/place_ugs)

LAB = "lab"
ARM = "inserter"
BOX = "iron-chest"
POLE = "small-electric-pole"
DEPOT = (-55, 10)
N, E, S, W = 0, 4, 8, 12

XBELT = -13
LABS = ((-9.5, 12.5), (-9.5, 8.5), (-9.5, 4.5))
OLD_LABS = ((49.5, -46.5), (52.5, -46.5))
OVERFLOW = (-12.5, 1.5)

belt, ug, gone, col = fuel.belt, fuel.ug, fuel.gone, fuel.col

STAGES = {
    # 1. 팩 벨트. 1호 출구 상자 둘을 걷고 그 자리에 벨트를, 2호 출구 상자도
    #    벨트로. 간선(x=-19)은 지하로 건넌다.
    "belt": {
        "probe": ("transport-belt", -12.5, 3.5),
        "kit": {"transport-belt": 36, "underground-belt": 2},
        "steps": [
            ("walk_to", {"x": -11.0, "y": 18.5}),
            ("take", {"name": "automation-science-pack", "x": -12.5, "y": 14.5, "count": 400}),
            gone(-13, 14, BOX),
            ("take", {"name": "automation-science-pack", "x": -12.5, "y": 22.5, "count": 400}),
            gone(-13, 22, BOX),
            *col(XBELT, 28, 3, N),                     # 줄머리 빈 칸(28)부터 끝(3)까지
            ("walk_to", {"x": -20.0, "y": 26.0}),
            ("take", {"name": "logistic-science-pack", "x": -21.5, "y": 27.5, "count": 400}),
            gone(-22, 27, BOX),
            belt(-22, 27, E), belt(-21, 27, E),
            ug(-20, 27, E, "input"), ug(-18, 27, E, "output"),
            belt(-17, 27, E), belt(-16, 27, E), belt(-15, 27, E), belt(-14, 27, E),
        ],
    },
    # 2. 옛 연구소 둘을 걷어 온다 (든 팩도).
    "move": {
        "probe": ("lab", -9.5, 12.5),
        "kit": {},
        "steps": [
            ("walk_to", {"x": 51.0, "y": -44.0}),
            ("take", {"name": "automation-science-pack", "x": 49.5, "y": -46.5, "count": 200}),
            ("take", {"name": "automation-science-pack", "x": 52.5, "y": -46.5, "count": 200}),
            gone(49, -47, LAB), gone(52, -47, LAB),
            ("walk_to", {"x": -7.0, "y": 10.5}),
            ("build", {"name": LAB, "x": -9.5, "y": 12.5}),
        ],
    },
    # 3. 나머지 연구소, 팔, 전봇대, 넘침 상자.
    "labs": {
        "probe": (BOX, -12.5, 1.5),
        "kit": {LAB: 2, ARM: 4, BOX: 1, POLE: 3},
        "steps": [
            ("walk_to", {"x": -7.0, "y": 8.5}),
            ("build", {"name": LAB, "x": -9.5, "y": 8.5}),
            ("build", {"name": LAB, "x": -9.5, "y": 4.5}),
            ("build", {"name": ARM, "x": -11.5, "y": 12.5, "direction": W}),
            ("build", {"name": ARM, "x": -11.5, "y": 8.5, "direction": W}),
            ("build", {"name": ARM, "x": -11.5, "y": 4.5, "direction": W}),
            ("walk_to", {"x": -11.0, "y": 1.5}),
            ("build", {"name": ARM, "x": -12.5, "y": 2.5, "direction": S}),   # 줄 끝 -> 상자
            ("build", {"name": BOX, "x": OVERFLOW[0], "y": OVERFLOW[1]}),
            ("build", {"name": POLE, "x": -11.5, "y": 10.5}),
            ("build", {"name": POLE, "x": -11.5, "y": 6.5}),
            ("build", {"name": POLE, "x": -11.5, "y": 2.5}),
        ],
    },
}
ORDER = ("belt", "move", "labs")

# 옛 연구소에서 걷어 온 팩과 출구 상자의 팩은 넘침 상자에 넣어 둔다.
STOW = [("walk_to", {"x": -11.0, "y": 1.5}),
        ("insert", {"name": "automation-science-pack", "x": OVERFLOW[0], "y": OVERFLOW[1], "count": 2000}),
        ("insert", {"name": "logistic-science-pack", "x": OVERFLOW[0], "y": OVERFLOW[1], "count": 2000})]


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def done(ai, stage) -> bool:
    name, x, y = STAGES[stage]["probe"]
    return bool(ai.lua("""(function()
      return { n = game.surfaces[1].count_entities_filtered{name = "%s",
                 force = game.forces.player, area = {{%f, %f}, {%f, %f}}} }
    end)()""" % (name, x - 0.4, y - 0.4, x + 0.4, y + 0.4))["n"])


def run(ai, who, stage):
    spec = STAGES[stage]
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    plan = []
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    for item, n in (("iron-plate", 200), ("copper-plate", 60), ("wood", 4)):
        at = have.get(item)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    for item, n in spec["kit"].items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            count = (short + 1) // 2 if item in ("transport-belt", "underground-belt", POLE) else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    up = fuel.standing(ai, spec["steps"])
    plan.extend(st for st in spec["steps"]
                if st[0] != "_ug" and not (st[0] == "build" and (st[1]["x"], st[1]["y"]) in up))
    if stage == "labs":
        plan.extend(STOW)
    submit(ai, who, plan, strict=False)
    print(f"{who}: 연구소 줄 {stage} ({len(plan)}단계)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--stage", default="", choices=("",) + ORDER)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    ai = AIBridge()
    state = {st: done(ai, st) for st in ORDER}
    print("  " + " · ".join(f"{st} {'됨' if ok else '아직'}" for st, ok in state.items()))
    if not args.who:
        return 0
    todo = [args.stage] if args.stage else [st for st in ORDER if not state[st]]
    if not args.all and not args.stage:
        todo = todo[:1]
    for stage in todo:
        run(ai, args.who, stage)
        for _ in range(240):
            time.sleep(5)
            if idle(ai, args.who):
                break
        placed = fuel.place_ugs(ai, args.who, STAGES[stage]["steps"])
        print(f"  {stage}: {'됨' if done(ai, stage) else '아직'}"
              + (f" · 지하벨트 {placed}" if placed else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

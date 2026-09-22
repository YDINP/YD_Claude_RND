"""Plates that pile up are not wealth. Turn them into science.

21회차, 철판 14만 · 구리판 10만이 선반에 쌓였고 쓰는 데는 사람의 손뿐이었다.
연구소는 사람이 팩을 «만들어» 갖다 넣을 때만 돌았다 (science.py). 교리의
다음 단계는 조립이다 - 판을 팩으로 바꾸는 기계.

    빨간 과학 1 = 구리판 1 + 톱니 1 (철판 2).  조립기 1 은 5초에 한 개.
    톱니 조립기 하나가 과학 조립기 열 대를 먹인다.

자리는 판금 간선 옆이다. 간선(x=-19 기둥, 남→북)에는 철판과 구리판이
«섞여» 오른다 - 과학 조립기는 둘 다 필요하니 섞인 벨트가 오히려 맞다.
분배기 «앞»에 두어서 선반보다 먼저 먹는다: 선반 뒤에 두면 새 상자가
늘 때마다 조립기가 굶는다.

    벨트 x=-19          팔 x=-18      조립기 x -17..-15     팔 x=-14   상자 x=-13
                         ->  과학 1 (y 13..15)   ->  상자
                  톱니 <-  ^ 팔 (y=16)
                         ->  톱니   (y 17..19)
                  톱니 <-  v 팔 (y=20)
                         ->  과학 2 (y 21..23)   ->  상자

science.py 는 이 상자에서 팩을 «집어» 간다. 만드는 일이 빠지면 걸음이
절반이다.

    python scripts/assembly.py                 # 섰나
    python scripts/assembly.py --who charlie   # 세운다
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

AM = "assembling-machine-1"
ARM = "inserter"
BOX = "iron-chest"
POLE = "small-electric-pole"
DEPOT = (-55, 10)

# 팔의 direction 은 «집는 쪽». 12 = 서쪽(간선)에서 집어 동쪽(조립기)에 놓는다.
MODULE = {
    "name": "빨간 과학 1호",
    "probe": (AM, -15.5, 18.5),
    "stand": (-12.0, 18.0),
    "steps": (
        ("build", {"name": AM, "x": -15.5, "y": 14.5}),
        ("build", {"name": AM, "x": -15.5, "y": 18.5}),
        ("build", {"name": AM, "x": -15.5, "y": 22.5}),
        ("build", {"name": ARM, "x": -17.5, "y": 14.5, "direction": 12}),
        ("build", {"name": ARM, "x": -17.5, "y": 18.5, "direction": 12}),
        ("build", {"name": ARM, "x": -17.5, "y": 22.5, "direction": 12}),
        ("build", {"name": ARM, "x": -15.5, "y": 16.5, "direction": 8}),   # 톱니 -> 과학 1
        ("build", {"name": ARM, "x": -15.5, "y": 20.5, "direction": 0}),   # 톱니 -> 과학 2
        ("build", {"name": ARM, "x": -13.5, "y": 14.5, "direction": 12}),  # 과학 1 -> 상자
        ("build", {"name": ARM, "x": -13.5, "y": 22.5, "direction": 12}),  # 과학 2 -> 상자
        ("build", {"name": BOX, "x": -12.5, "y": 14.5}),
        ("build", {"name": BOX, "x": -12.5, "y": 22.5}),
        ("build", {"name": POLE, "x": -17.5, "y": 16.5}),
        ("build", {"name": POLE, "x": -17.5, "y": 20.5}),
        ("build", {"name": POLE, "x": -13.5, "y": 16.5}),
        ("build", {"name": POLE, "x": -13.5, "y": 20.5}),
    ),
    "kit": {AM: 3, ARM: 7, BOX: 2, POLE: 4},
    # 레시피는 세운 뒤 정한다. 모드의 build 는 레시피를 모른다.
    "recipes": (((-15.5, 14.5), "automation-science-pack"),
                ((-15.5, 18.5), "iron-gear-wheel"),
                ((-15.5, 22.5), "automation-science-pack")),
    "out": ((-12.5, 14.5), (-12.5, 22.5)),   # science.py 가 집어 갈 상자
}

# 재료. 조립기 1 = 회로 3 + 톱니 5 + 철판 9 = 철 22 + 구리 4.5.  팔 = 철 4 + 구리 1.5
FETCH = {"iron-plate": 200, "copper-plate": 60, "wood": 4}


def built(ai) -> bool:
    name, x, y = MODULE["probe"]
    return bool(ai.lua("""(function()
      return { n = game.surfaces[1].count_entities_filtered{name = "%s",
                 force = game.forces.player, area = {{%f, %f}, {%f, %f}}} }
    end)()""" % (name, x - 0.5, y - 0.5, x + 0.5, y + 0.5))["n"])


def recipes(ai) -> list:
    """세워진 조립기에 레시피를 준다. 돌려주는 것은 «정해진 것»의 목록."""
    packed = ";".join(f"{x},{y},{r}" for (x, y), r in MODULE["recipes"])
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y, r = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local m = s.find_entities_filtered{name = "%s", force = f,
                    area = {{tonumber(x) - 0.5, tonumber(y) - 0.5},
                            {tonumber(x) + 0.5, tonumber(y) + 0.5}}}[1]
        if m then
          if not m.get_recipe() or m.get_recipe().name ~= r then m.set_recipe(r) end
          out[#out+1] = r
        end
      end
      return out
    end)()""" % (packed, AM))
    return list(reply.values()) if isinstance(reply, dict) else list(reply or [])


def raise_module(ai, who) -> None:
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    plan = []
    for item, n in FETCH.items():
        at = have.get(item)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    for item, n in MODULE["kit"].items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            count = (short + 1) // 2 if item == POLE else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    sx, sy = MODULE["stand"]
    plan.append(("walk_to", {"x": sx, "y": sy}))
    plan.extend(MODULE["steps"])
    submit(ai, who, plan, strict=False)
    print(f"{who}: {MODULE['name']} 조립 모듈 (조립기 3 + 팔 7 + 상자 2 + 전봇대 4)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    args = ap.parse_args()

    ai = AIBridge()
    if built(ai):
        print(f"  {MODULE['name']}: 서 있다 - 레시피 {recipes(ai)}")
        return 0
    print(f"  {MODULE['name']}: 아직 없다")
    if args.who:
        raise_module(ai, args.who)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

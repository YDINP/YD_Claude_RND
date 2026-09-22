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


# 2호: 녹색 과학. 팩 1 = 팔 1 + 벨트 1.  팔 = 회로 + 톱니 + 철판, 벨트 = 톱니 + 철판,
# 회로 = 철판 + 구리선 3, 구리선 = 구리판.  조립기 여섯 대의 사슬이다.
#
# 판은 간선 «고리»로 받는다: 간선에 분배기를 물려 한 갈래를 서쪽으로 돌려
# 다시 간선에 옆으로 합류시킨다. 막다른 가지면 안 쓰는 판이 차서 막히지만,
# 고리는 안 쓴 것이 돌아 나간다.
#
#     y=14  ====================== 고리 위 (동쪽으로, 간선에 합류)
#          |  A1 구리선  C1  B1 회로   |
#     x=-31|  A2 톱니    C2  B2 팔     | x=-19 간선
#          |  A3 벨트    C3  B3 팩 -> OUT
#     y=28  ====================== 고리 아래 (분배기에서 서쪽으로)
#
# A 열은 고리에서, B 열은 간선에서 판을 받는다. A -> C(상자) -> B 로 건넨다.
R1, R2, R3 = 16.5, 20.5, 24.5
G12, G23 = 18.5, 22.5
XA, XC, XB = -27.5, -24.5, -21.5
XRING, XTRUNK = -31, -19


def _belt(x, y, d):
    return ("build", {"name": "transport-belt", "x": x + 0.5, "y": y + 0.5, "direction": d})


def _ring():
    out = [("demolish", {"x": -30.0, "y": 26.0, "name": "gun-turret", "search_radius": 0.4}),
           ("demolish", {"x": -18.5, "y": 29.5, "name": "transport-belt", "search_radius": 0.4}),
           ("build", {"name": "splitter", "x": -19.0, "y": 29.5, "direction": 0})]
    # 모서리 칸은 «다음 변의 방향»을 본다. 북향으로 둔 (-31,14) 는 막다른
    # 끝이었다 - 고리가 아니라 ㄷ자였고, 안 쓰는 판이 기둥에 차서 톱니
    # 조립기가 굶었다. 고리는 모서리 넷이 다 돌아야 고리다.
    out += [_belt(x, 28, 12) for x in range(-20, -31, -1)]      # 서쪽으로
    out += [_belt(-31, y, 0) for y in range(28, 14, -1)]        # 북쪽으로
    out += [_belt(x, 14, 4) for x in range(-31, -19)]           # 동쪽으로, (-20,14) 가 간선에 붙는다
    return out


def _machines():
    out = []
    for y in (R1, R2, R3):
        out.append(("build", {"name": AM, "x": XA, "y": y}))
        out.append(("build", {"name": BOX, "x": XC, "y": y}))
        out.append(("build", {"name": AM, "x": XB, "y": y}))
        out.append(("build", {"name": ARM, "x": XRING + 1.5, "y": y, "direction": 12}))   # 고리 -> A
        out.append(("build", {"name": ARM, "x": XC - 1, "y": y, "direction": 12}))       # A -> C
        out.append(("build", {"name": ARM, "x": XC + 1, "y": y, "direction": 12}))       # C -> B
    out += [("build", {"name": ARM, "x": XTRUNK - 0.5, "y": y, "direction": 4})          # 간선 -> B
            for y in (R1, R2)]
    out += [("build", {"name": ARM, "x": XB, "y": G12, "direction": 0}),                 # B1 회로 -> B2
            ("build", {"name": ARM, "x": XB, "y": G23, "direction": 0}),                 # B2 팔 -> B3
            ("build", {"name": ARM, "x": XA, "y": G23, "direction": 0}),                 # A2 톱니 -> A3
            ("build", {"name": ARM, "x": XB, "y": 26.5, "direction": 0}),                # B3 팩 -> 상자
            ("build", {"name": BOX, "x": XB, "y": 27.5})]
    out += [("build", {"name": POLE, "x": x, "y": y}) for x, y in
            ((-27.5, 18.5), (-29.5, 22.5), (-25.5, 22.5), (-23.5, 18.5),
             (-23.5, 22.5), (-19.5, 18.5), (-22.5, 26.5))]
    return out


GREEN = {
    "name": "녹색 과학 2호",
    "stand": (-25.0, 12.5),
    "stages": (
        ("ring", ("splitter", -19.0, 29.5), {"transport-belt": 42, "splitter": 1}, _ring()),
        ("machines", (AM, XB, R3), {AM: 6, ARM: 15, BOX: 4, POLE: 7}, _machines()),
    ),
    "recipes": (((XA, R1), "copper-cable"), ((XA, R2), "iron-gear-wheel"),
                ((XA, R3), "transport-belt"), ((XB, R1), "electronic-circuit"),
                ((XB, R2), "inserter"), ((XB, R3), "logistic-science-pack")),
    "out": ((XB, 27.5),),
}

# 4호: 녹색 과학 «서쪽 거울». 사용자: "물류과학팩 생산을 좀 더 확장시켜야할듯"
#
# 2호의 병목은 팩 조립기 하나(12초에 한 개)였고 앞의 다섯은 다 차 있었다.
# 사슬은 늘릴 자리가 없다 - 조립기 한 대의 네 변이 다 쓰였다. 그래서 같은
# 모듈을 하나 더, 2호 고리의 서쪽에 거울로 놓는다.
#
#     판: 2호 고리(x=-31 기둥)에 분배기 -> 둘째 고리(y=14 서쪽, x=-43 남쪽,
#         y=28 동쪽) -> (-31,28) 에 옆으로 합류.  B 열은 2호 고리에서,
#         A 열은 둘째 고리에서 판을 받는다.
#     팩: 출구 팔이 y=27 벨트에 떨구고, 그 벨트는 2호 기둥을 지하로 건너
#         2호의 녹색 벨트 (-22,27) 뒤에 붙는다 -> 연구소 줄.
XA4, XC4, XB4 = -39.5, -36.5, -33.5
XRING2 = -43


def _ring_w():
    out = [("demolish", {"x": -30.5, "y": 15.5, "name": "transport-belt", "search_radius": 0.4}),
           ("build", {"name": "splitter", "x": -31.5, "y": 15.5, "direction": 0})]
    out += [_belt(x, 14, 12) for x in range(-32, XRING2, -1)]       # 서쪽으로
    out += [_belt(XRING2, y, 8) for y in range(14, 28)]              # 남쪽으로 (모서리부터)
    out += [_belt(x, 28, 4) for x in range(XRING2, -31)]            # 동쪽으로, (-31,28) 에 붙는다
    return out


def _machines_w():
    out = []
    for y in (R1, R2, R3):
        out.append(("build", {"name": AM, "x": XA4, "y": y}))
        out.append(("build", {"name": BOX, "x": XC4, "y": y}))
        out.append(("build", {"name": AM, "x": XB4, "y": y}))
        out.append(("build", {"name": ARM, "x": XRING2 + 1.5, "y": y, "direction": 12}))  # 고리2 -> A
        out.append(("build", {"name": ARM, "x": XC4 - 1, "y": y, "direction": 12}))      # A -> C
        out.append(("build", {"name": ARM, "x": XC4 + 1, "y": y, "direction": 12}))      # C -> B
    out += [("build", {"name": ARM, "x": XRING - 0.5, "y": y, "direction": 4})           # 2호 고리 -> B
            for y in (R1, R2)]
    out += [("build", {"name": ARM, "x": XB4, "y": G12, "direction": 0}),
            ("build", {"name": ARM, "x": XB4, "y": G23, "direction": 0}),
            ("build", {"name": ARM, "x": XA4, "y": G23, "direction": 0}),
            ("build", {"name": ARM, "x": XB4, "y": 26.5, "direction": 0})]               # 팩 -> y=27 벨트
    out += [("build", {"name": POLE, "x": x, "y": y}) for x, y in
            ((-31.5, 18.5), (-31.5, 22.5), (-35.5, 18.5), (-35.5, 22.5),
             (-41.5, 18.5), (-41.5, 22.5), (-34.5, 26.5))]
    # 팩 벨트 y=27: (-34,27) 에서 동쪽으로, x=-31 기둥은 지하로, (-23,27) 까지
    out += [_belt(-34, 27, 4), _belt(-33, 27, 4),
            ("_ug", {"x": -31.5, "y": 27.5, "direction": 4, "type": "input"}),
            ("_ug", {"x": -29.5, "y": 27.5, "direction": 4, "type": "output"})]
    out += [_belt(x, 27, 4) for x in range(-29, -22)]
    return out


GREEN_W = {
    "name": "녹색 과학 4호 (서)",
    "stand": (-37.0, 12.5),
    "stages": (
        ("ring", ("splitter", -31.5, 15.5), {"transport-belt": 42, "splitter": 1}, _ring_w()),
        ("machines", (AM, XB4, R3), {AM: 6, ARM: 15, BOX: 3, POLE: 7,
                                     "transport-belt": 12, "underground-belt": 2}, _machines_w()),
    ),
    "recipes": (((XA4, R1), "copper-cable"), ((XA4, R2), "iron-gear-wheel"),
                ((XA4, R3), "transport-belt"), ((XB4, R1), "electronic-circuit"),
                ((XB4, R2), "inserter"), ((XB4, R3), "logistic-science-pack")),
    "out": (),
}

# 3호: 탄약. 탄창 1 = 철판 4.  간선 머리 옆, 1호 위. 출구 상자는 보급 순찰이
# «가까운 상자»로 스스로 찾는다(upkeep._STOCK 은 모든 상자를 본다).
AMMO = {
    "name": "탄약 3호",
    "stand": (-14.0, 9.0),
    "stages": (
        ("all", (AM, -15.5, 10.5), {AM: 1, ARM: 2, BOX: 1, POLE: 1}, (
            ("build", {"name": AM, "x": -15.5, "y": 10.5}),
            ("build", {"name": ARM, "x": -17.5, "y": 10.5, "direction": 12}),   # 간선 -> 조립기
            ("build", {"name": ARM, "x": -15.5, "y": 8.5, "direction": 8}),     # 조립기 -> 상자
            ("build", {"name": BOX, "x": -15.5, "y": 7.5}),
            ("build", {"name": POLE, "x": -17.5, "y": 8.5}),
        )),
    ),
    "recipes": (((-15.5, 10.5), "firearm-magazine"),),
    "out": ((-15.5, 7.5),),
}

# 재료. 조립기 1 = 회로 3 + 톱니 5 + 철판 9 = 철 22 + 구리 4.5.  팔 = 철 4 + 구리 1.5
FETCH = {"iron-plate": 300, "copper-plate": 80, "wood": 4}

MODULES = (MODULE, GREEN, AMMO, GREEN_W)


def built(ai, probe) -> bool:
    name, x, y = probe
    return bool(ai.lua("""(function()
      return { n = game.surfaces[1].count_entities_filtered{name = "%s",
                 force = game.forces.player, area = {{%f, %f}, {%f, %f}}} }
    end)()""" % (name, x - 0.5, y - 0.5, x + 0.5, y + 0.5))["n"])


def recipes(ai, module) -> list:
    """세워진 조립기에 레시피를 준다. 돌려주는 것은 «정해진 것»의 목록."""
    packed = ";".join(f"{x},{y},{r}" for (x, y), r in module["recipes"])
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


def raise_stage(ai, who, module, stage) -> None:
    name, _probe, kit, steps = stage
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
    for item, n in kit.items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            count = (short + 1) // 2 if item in (POLE, "transport-belt", "underground-belt") else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    sx, sy = module["stand"]
    plan.append(("walk_to", {"x": sx, "y": sy}))
    for n, step in enumerate(steps):
        if step[0] == "_ug":
            continue                      # fuel.place_ugs 가 계획 뒤에 놓는다
        if n and n % 10 == 0 and step[0] == "build":
            plan.append(("walk_to", {"x": step[1]["x"] + 1.5, "y": step[1]["y"] + 1.5}))
        plan.append(step)
    submit(ai, who, plan, strict=False)
    print(f"{who}: {module['name']} - {name} ({len(steps)}단계)")


def stages_of(module):
    """1호는 단계가 하나다. 같은 모양으로 맞춘다."""
    if "stages" in module:
        return module["stages"]
    return (("all", module["probe"], module["kit"], module["steps"]),)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--module", type=int, default=0, help="0 = 다 본다, 1 = 빨강, 2 = 초록, 3 = 탄약, 4 = 초록(서)")
    args = ap.parse_args()

    ai = AIBridge()
    for n, module in enumerate(MODULES, 1):
        if args.module and n != args.module:
            continue
        state = [(st[0], built(ai, st[1])) for st in stages_of(module)]
        if all(ok for _n, ok in state):
            print(f"  {module['name']}: 서 있다 - 레시피 {recipes(ai, module)}")
            continue
        print(f"  {module['name']}: "
              + " · ".join(f"{sn} {'됨' if ok else '아직'}" for sn, ok in state))
        if args.who:
            todo = next(st for st, (_n, ok) in zip(stages_of(module), state) if not ok)
            raise_stage(ai, args.who, module, todo)
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

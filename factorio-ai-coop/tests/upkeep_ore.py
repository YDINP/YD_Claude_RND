# -*- coding: utf-8 -*-
"""돌은 철의 대체재가 아니다.

19회차 26분의 실측:

    창고   철판 0 · 돌 150 · 석탄 76
    화로   여덟 대 «전부» stone 을 물고 있음
    밭상자 철광석 395  <- 있는데 안 옮겨졌을 뿐

보급 순찰이 「창고에 철광석이 없으니 있는 광석으로 바꿔 준다」는 규칙에
따라 돌을 화로 전부에 나눠 넣었다. 그 순간부터 철판이 한 장도 안 나왔고,
채굴기도 탄약도 발전 사슬도 같이 멈췄다.

채우는 것과 «그 기계의 일을 바꾸는 것»은 다르다. 빈 화로는 잘못 채운
화로보다 낫다.

    python tests/upkeep_ore.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from upkeep import ORES, plan_round  # noqa: E402

problems = []


def check(name, got, want):
    if got != want:
        problems.append(f"{name}: {got!r} != {want!r}")


# 1. 대체 차례에 돌이 들어 있으면 안 된다. 이것이 사고의 뿌리였다.
check("돌은 대체 광석이 아니다", "stone" in ORES, False)
check("금속만 대체한다", tuple(ORES), ("iron-ore", "copper-ore"))


def furnace(x, y, item="iron-ore", held=0):
    return {"type": "furnace-ore", "item": item, "x": x, "y": y,
            "held": held, "room": 50, "want": 50, "name": "stone-furnace"}


SHELF = {"stone": [{"x": 5.5, "y": -87.5, "count": 150}]}

# 2. 창고에 «돌뿐»이면 화로에는 아무것도 안 넣는다.
rounds, excuses = plan_round(["foxtrot"], [furnace(-20, -90), furnace(-17, -90)],
                             dict(SHELF), {"foxtrot": {}})
check("돌뿐이면 아무도 안 보낸다", rounds, [])
check("굶는 이유를 말한다", any("금속 광석" in w for w in excuses), True)

# 3. 구리는 대체가 된다. 둘 다 녹이면 판이 되고, 같은 일이다.
COPPER = {"copper-ore": [{"x": 5.5, "y": -89.5, "count": 200}]}
rounds, excuses = plan_round(["foxtrot"], [furnace(-20, -90)],
                             dict(COPPER), {"foxtrot": {}})
check("구리로는 바꿔 준다", bool(rounds), True)
if rounds:
    items = [p[1].get("name") for p in rounds[0][1] if isinstance(p, tuple)
             and len(p) > 1 and isinstance(p[1], dict)]
    check("넣는 것이 구리다", "stone" in items, False)

# 4. 원래 것이 있으면 바꾸지 않는다.
BOTH = {"iron-ore": [{"x": 5.5, "y": -89.5, "count": 200}],
        "stone": [{"x": 5.5, "y": -87.5, "count": 150}]}
rounds, _ = plan_round(["foxtrot"], [furnace(-20, -90)], dict(BOTH),
                       {"foxtrot": {}})
check("철이 있으면 철을 넣는다", bool(rounds), True)

print()
if problems:
    for line in problems:
        print("  " + line)
    print(f"{len(problems)} problems - 돌이 아직 대체재로 남아 있다")
    sys.exit(1)
print(f"0 problems - 돌은 철의 대체재가 아니다 ({6} rules checked)")

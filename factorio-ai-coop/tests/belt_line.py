"""벨트 길에 대각선 걸음이 남아 있지 않은지 지킨다.

사용자가 사진과 함께 짚었다: "컨베이어 벨트는 왜 설치하다가 중간중간
끊어먹는거임?" 빨간 원 둘이 «둘 다 꺾이는 자리»였다.

계획을 재보니 길 자체에 대각선 걸음이 들어 있었다:

    (83,56) -> (84,55)   거리 2
    (84,52) -> (85,51)   거리 2
    (85,46) -> (84,45)   거리 2

벨트는 대각선으로 못 놓는다. 그러니 그 코너 칸은 계획에 «없고», 아무도
그 자리를 안 맡고, 길이 거기서 끊긴다.

대각선은 두 군데서 생긴다.

    1  `walk` 이 목적지에 못 닿으면 가장 가까운 칸에서 멈춘다. 그 칸이
       대각선이면 이음매가 대각선이 된다.
    2  등뼈(밭 위의 곧은 줄)와 줄기(밭에서 유통 구역까지)를 이어붙이는
       자리. 줄기는 밭 «근처»까지만 오지 밭 끝 칸에 붙어 오지 않는다.

게임 없이는 길을 못 내므로 «코드의 모양»을 본다. 길을 만들어 내놓는
자리가 `stitch` 를 거치는가.

    python tests/belt_line.py
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BELTS = os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "belts.lua")

# 길을 내놓는 자리와, 그 자리가 반드시 거쳐야 하는 것.
GATES = (
    ("walk 의 반환",
     "return stitch(surface, force, tiles), best_gap, best_turn",
     "`walk` 이 길을 그대로 돌려주면 못 닿았을 때의 대각선이 그대로 남는다"),
    ("등뼈+줄기 이음매",
     "tiles = stitch(surface, force, tiles)",
     "등뼈 끝과 줄기 첫 칸이 대각선으로 만날 수 있다"),
)


def main() -> int:
    text = open(BELTS, encoding="utf-8").read()
    problems = []

    if "local function stitch(" not in text:
        problems.append("stitch 가 아예 없다")

    for what, needle, why in GATES:
        if needle not in text:
            problems.append(f"{what}: {why}\n      찾는 것: {needle}")

    # stitch 는 walk «앞»에 있어야 한다. 뒤에 있으면 walk 안에서 못 부른다 -
    # 루아의 local 은 선언된 다음 줄부터 보인다.
    if "local function stitch(" in text and "local function walk(" in text:
        if text.find("local function stitch(") > text.find("local function walk("):
            problems.append("stitch 가 walk 뒤에 있다. 루아는 그것을 못 본다")

    for line in problems:
        print("  [FAIL] " + line)
    print(f"{len(problems)} problems - belt lines have no diagonal steps")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

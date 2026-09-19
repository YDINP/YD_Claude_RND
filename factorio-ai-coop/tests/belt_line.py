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


# 루아를 파이썬으로 옮겨 «규칙 자체»를 시험한다. 문자열이 있는지만 보면
# 부르기는 하는데 아무 일도 안 하는 경우를 못 잡는다 - 실제로 그랬다.
def stitch(tiles, passable=lambda x, y: True):
    """belts.lua 의 stitch 와 같은 규칙."""
    if not tiles or len(tiles) < 2:
        return tiles
    out = []
    for i, here in enumerate(tiles):
        out.append(here)
        nxt = tiles[i + 1] if i + 1 < len(tiles) else None
        if not nxt:
            continue
        dx, dy = nxt[0] - here[0], nxt[1] - here[1]
        if dx != 0 and dy != 0:
            a, b = (nxt[0], here[1]), (here[0], nxt[1])
            out.append(a if passable(*a) or not passable(*b) else b)
    return out


def broken(tiles):
    """이웃이 아닌 이음매의 수."""
    return sum(1 for i in range(1, len(tiles))
               if abs(tiles[i][0] - tiles[i - 1][0])
               + abs(tiles[i][1] - tiles[i - 1][1]) != 1)


def main() -> int:
    text = open(BELTS, encoding="utf-8").read()
    problems = []

    # 이 저장소가 실제로 낸 대각선들. 둘 다 정수 좌표라야 메울 수 있다 -
    # 그래서 등뼈를 칸 번호로 내리는 것이 먼저다.
    for name, pair in (("정수 대각선", [(83, 56), (84, 55)]),
                       ("반대 방향", [(85, 46), (84, 45)])):
        if broken(stitch(pair)):
            problems.append(f"stitch 가 «{name}»을 못 메운다: {pair}")

    # 반칸과 정수를 섞으면 «한 칸으로는 못 잇는다». stitch 가 고칠 수
    # 있는 것은 코너뿐이고, 규약이 둘이면 코너가 아니라 «틈»이 된다.
    # 이것이 등뼈를 칸 번호로 내려야 하는 이유이자, 옛 규칙(|dx|==1)이
    # 한 번도 성립하지 못한 이유다. 시험은 그 한계를 못박아 둔다.
    if not broken(stitch([(37.5, 71.5), (39, 70)])):
        problems.append("반칸과 정수를 섞어도 이어진다고 나온다 - "
                        "그럴 리가 없다. 규약을 하나로 두는 이유가 사라진다")

    # 이미 이어져 있는 것은 건드리지 않는다.
    straight = [(0, 0), (1, 0), (2, 0)]
    if stitch(straight) != straight:
        problems.append("stitch 가 멀쩡한 줄에 칸을 끼워 넣는다")

    # 등뼈가 칸 번호로 내려오는가. 반칸이면 줄기와 영원히 이웃이 아니다.
    if "{ x = n, y = best } or { x = best, y = n }" not in text:
        problems.append("등뼈가 칸 번호가 아니다 - 줄기와 규약이 어긋난다")

    # repair 가 되돌아온 칸을 맡는가.
    if "fixed[#fixed + 1] = { x = after.x, y = after.y" not in text:
        problems.append("repair 가 되돌아오는 칸을 안 맡는다 - 이은 자리마다 구멍")

    # 아무도 안 쓰는 이름을 «읽고» 있지 않은가. 주석에 적힌 것은 괜찮다 -
    # 그것이 왜 사라졌는지를 남겨두는 일이다.
    for n, line in enumerate(text.splitlines(), 1):
        code = line.split("--", 1)[0]
        if "storage.ore_line" in code:
            problems.append(f"belts.lua:{n}: storage.ore_line 을 아직 읽는다 "
                            "- 쓰는 곳은 어디에도 없다")

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

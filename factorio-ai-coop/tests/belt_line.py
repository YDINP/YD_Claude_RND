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

import io
import os
import re
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



# -- 간선이 제 임시 상자를 걷어낼 수 있는가 --------------------------------
#
# 채굴기 떨구는 자리의 상자는 「벨트가 아직 없을 때의 임시 출구」다. 그런데
# 벨트가 놓일 자리도 바로 그 칸이다. 둘이 같은 칸을 두고 다투는데 아무도
# 양보하지 않으면 「벨트를 못 깔았습니다」가 영원히 반복된다 - 실제로
# 석탄줄(y=76) 위에 상자가 여섯 개였고 벨트는 0칸이었다.
#
# 그래서 «걷어내면 놓을 수 있다»를 갈라 둔다. 여기서 지키는 것은 그 목록이
# 좁게 남아 있는가다. 화로나 채굴기나 터렛이 들어가는 순간 무리가 제
# 공장을 허물기 시작한다.
def liftable() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "belts.lua"),
                  encoding="utf-8").read()
    hit = re.search(r"local LIFTABLE = \{(.*?)\}", lua, re.S)
    if not hit:
        return ["belts.lua 에 LIFTABLE 이 없다"]
    names = re.findall(r'\["([a-z-]+)"\]', hit.group(1))
    if not names:
        bad.append("LIFTABLE 이 비어 있다")
    for name in names:
        if not name.endswith("-chest"):
            bad.append(f"LIFTABLE 에 상자가 아닌 것이 있다: {name} - "
                       f"간선이 진짜 건물을 허문다")
    if "lift = e.name" not in lua:
        bad.append("막힌 칸을 «걷어내면 놓을 수 있다»로 가르지 않는다")
    if "elseif lift then" not in lua:
        bad.append("lift 가 blocked 와 갈라지지 않는다 - cut 이 거기서 끊는다")

    # 그리고 그 표시를 «받아서 실제로 걷는» 자리가 있어야 한다. 표시만
    # 하고 아무도 안 보는 것이 이 저장소의 가장 오래된 실패 부류다.
    py = io.open(os.path.join(ROOT, "bridge", "crew", "hauling.py"),
                 encoding="utf-8").read()
    if 'one.get("lift")' not in py:
        bad.append("벨트를 까는 쪽이 lift 를 안 본다 - 표시만 하고 끝난다")
    elif "demolish" not in py.split('one.get("lift")')[1][:400]:
        bad.append("lift 를 보기는 하는데 걷어내지 않는다")
    return bad



# -- 칸 번호로 «이미 선 것»을 찾을 때는 가운데를 본다 ----------------------
#
# 길은 칸 번호(정수)로 적고 1x1 엔티티는 그 칸의 가운데(+0.5)에 앉는다.
# 거리가 0.707 이라 칸 번호에서 반경 0.4 로 찾으면 영원히 못 찾는다.
#
# 이것이 「이미 다 깔린 길을 130칸 남았다」고 읽게 했다. can_place_entity
# 는 좌표를 격자에 맞춰 주므로 그쪽만 멀쩡했고, 그래서 「놓을 수 있나」만
# 맞고 「이미 있나」만 틀린 - 가장 찾기 어려운 모양이 됐다.
def tile_centre() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "belts.lua"),
                  encoding="utf-8").read()
    if "local function centre(" not in lua:
        bad.append("belts.lua 에 centre() 가 없다")
    # 좁은 반경으로 찾는 자리마다, 준 좌표가 가운데인지 본다.
    at = 0
    while True:
        at = lua.find("radius = 0.", at + 1)
        if at < 0:
            break
        window = lua[max(0, at - 220):at]
        cut = window.rfind("position = ")
        if cut < 0:
            continue
        gave = window[cut:].split("}")[0]
        if "centre(" in gave or "+ 0.5" in gave or "0.5," in gave:
            continue
        # 좌표를 직접 계산해 준 자리(b.position 처럼)는 칸 번호가 아니다.
        if ".position" in gave or "spot" in gave or "goal" in gave:
            continue
        line = lua.count(chr(10), 0, at) + 1
        bad.append("belts.lua:%d 칸 번호를 좁은 반경으로 찾는다: %s"
                   % (line, gave.strip()))
    return bad

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

    problems.extend(liftable())
    problems.extend(tile_centre())
    for line in problems:
        print("  [FAIL] " + line)
    print(f"{len(problems)} problems - belt lines have no diagonal steps")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

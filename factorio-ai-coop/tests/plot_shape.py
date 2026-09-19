"""파이썬과 Lua 의 자리표 치수가 같은지 대조한다.

같아야 하는 숫자가 두 군데 있으면 언젠가 달라진다. 실제로 그랬다 -
`belts.lua` 에 「layout.py 의 FURNACE_* 와 같은 값이어야 한다」는 주석과 함께
같은 숫자가 적혀 있었다. 주석은 지켜주지 않는다.

둘 다 있어야 하는 이유가 있다. 파이썬 쪽은 게임 없이 시험할 수 있는 «계획»이고
(tests/agent_test.py 가 그것을 시험한다), Lua 쪽은 놓을 수 있는지 게임에 물어야
하는 «검증»이다. 그러니 없앨 수는 없고, 대신 어긋나면 여기서 잡는다.

    python tests/plot_shape.py
"""

from __future__ import annotations

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "bridge"))

import settings  # noqa: E402

LUA = os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "plots.lua")

# Lua 쪽 표 이름 -> 파이썬 쪽 상수 이름
SAME = {
    ("FURNACE", "pitch"): "FURNACE_PITCH",
    ("FURNACE", "row"): "FURNACE_ROW",
    ("FURNACE", "aisle"): "FURNACE_AISLE",
    ("FURNACE", "gap"): "FURNACE_GAP",
    ("CRAFT", "pitch"): "CRAFT_PITCH",
    ("CRAFT", "row"): "CRAFT_ROW",
}


def lua_shape() -> dict[tuple[str, str], int]:
    text = open(LUA, encoding="utf-8").read()
    out: dict[tuple[str, str], int] = {}
    for table in ("FURNACE", "CRAFT"):
        hit = re.search(r"^local %s = \{([^}]*)\}" % table, text, re.M)
        if not hit:
            continue
        for field, value in re.findall(r"(\w+)\s*=\s*(\d+)", hit.group(1)):
            out[(table, field)] = int(value)
    return out


# -- 세우는 문턱 > 걷는 문턱 ------------------------------------------------
#
# 14회차에 무리가 세 시간 동안 저 자신과 싸웠다. 자리표는 「광석에 닿으면
# 세워라」 했고 점검은 「400 미만이면 걷어라」 했다. 두 문장 사이에 아무런
# 관계가 없었으므로 채굴기는 세워지고 걷히기를 되풀이했고, 그 줄에 깔던
# 벨트까지 같이 뜯겨 나갔다.
#
# 여기서 막는 것은 «같아지는 것»까지다. 문턱이 같으면 세운 채굴기가 첫
# 광석을 캐는 순간 걷어내는 선 아래로 내려간다.
def hysteresis() -> list:
    bad = []
    thin = getattr(settings, "THIN_DRILL", None)
    rich = getattr(settings, "RICH_DRILL", None)
    if thin is None or rich is None:
        return ["THIN_DRILL / RICH_DRILL 둘 다 있어야 한다"]
    if rich <= thin:
        bad.append(f"세우는 문턱 RICH_DRILL={rich} 이 걷는 문턱 "
                   f"THIN_DRILL={thin} 보다 높지 않다 - 세우자마자 걷는다")

    # 그리고 그 수가 «실제로 건너가야» 한다. 자리표를 부르는 자리에서
    # rich 를 빠뜨리면 모드 쪽 기본값 0 이 되어, 고치기 전과 똑같아진다.
    src = io.open(os.path.join(ROOT, "bridge", "crew", "mining.py"),
                  encoding="utf-8").read()
    if "rich=RICH_DRILL" not in src:
        bad.append("mining.py 가 mine_seats 에 rich 를 안 건넨다")
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "plots.lua"),
                  encoding="utf-8").read()
    if "ore_under" not in lua:
        bad.append("plots.lua 가 아직 광석을 «세지» 않는다 (ore_under 없음)")
    if "under < rich" not in lua:
        bad.append("plots.lua 가 문턱으로 거르지 않는다")
    return bad


def main() -> int:
    shape = lua_shape()
    bad = []
    for key, name in SAME.items():
        mine = getattr(settings, name, None)
        theirs = shape.get(key)
        if theirs is None:
            bad.append(f"plots.lua 에 {key[0]}.{key[1]} 이 없다")
        elif mine != theirs:
            bad.append(f"{name}={mine} 인데 plots.lua 의 "
                       f"{key[0]}.{key[1]}={theirs}")
    bad.extend(hysteresis())
    for line in bad:
        print("  [FAIL] " + line)
    print(f"\n{len(bad)} problems - plot shape agrees "
          f"({len(SAME)} numbers checked)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

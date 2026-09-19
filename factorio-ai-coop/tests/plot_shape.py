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



# -- 방어선은 «구역»에 선다 -------------------------------------------------
#
# 전멸(2026-09-19 18:59) 실측: 탄약 열 발씩 만재한 터렛 여덟 대가 x -20~-49
# 에 서 있었고, 공장(제련 38,87 / 조립 48,68 / 유통 62,82)은 60~130타일
# 떨어져 있었다. 잡은 적 0마리. 싸운 것이 아니라 물린 것이다.
#
# 테두리를 「모든 기계의 무게중심에서 45칸 안」으로 쟀는데, 그 무게중심이
# (23,33) - 발전소와 외곽 채굴기가 끌고 간 자리 - 였다. 45칸 밖인 제련
# 구역이 통째로 빠지고 발전소만 남아 상자가 서북쪽으로 갔다.
#
# 구역은 이미 적어 두었다. 적어둔 것이 있으면 그것을 본다.
def defence_anchor() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "defence.lua"),
                  encoding="utf-8").read()
    if "local function core_box(" not in lua:
        bad.append("defence.lua 에 core_box() 가 없다 - 구역을 안 본다")
    for z in ("here.smelt", "here.craft", "here.depot"):
        if z not in lua:
            bad.append(f"방어 테두리가 {z} 를 안 센다")
    if "local box = perimeter(surface, force, here)" not in lua:
        bad.append("defence 가 perimeter 에 구역을 안 건넨다 - "
                   "core_box 가 있어도 아무도 안 쓴다")
    # 그리고 «어느 쪽에서 오는가»도 구역 한가운데서 재야 한다. 테두리만
    # 고치고 방향을 무게중심에서 재면 면이 또 엇나간다.
    if "threat_side(surface, heart)" not in lua:
        bad.append("위협 방향을 아직 무게중심에서 잰다")
    return bad


# -- 자리는 «줄»로 모여야 한다 ----------------------------------------------
#
# 사용자: "채굴기도 제대로 효율적인 배치가 아닌거같은데"
#
# 맞다. 두꺼운 자리부터 내놓게 했더니 밭 전체에서 골라 와서 줄이 끊겼다:
#
#     줄 y=76 북쪽   84, 86, ..., 92      <- 88, 90 이 빈다
#     줄 y=76 남쪽   ..., 88, 90, 92      <- 84, 86 이 빈다
#
# 이 배치의 전부는 「마주보는 둘이 가운데 벨트에 떨군다」인데, 흩어지면
# 벨트 한 줄로 받으려고 줄을 그은 보람이 없어진다.
def seats_cluster() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "plots.lua"),
                  encoding="utf-8").read()
    if "local bands, order = {}, {}" not in lua:
        bad.append("자리표가 줄(band)별로 모으지 않는다")
    # 줄 안에서는 자리 번호 순서여야 한다. 광석 두께로 다시 섞으면 또 끊긴다.
    if "return a.nth < b.nth end)" not in lua:
        bad.append("줄 안에서 자리 번호 순서로 안 채운다 - 빈 칸이 생긴다")
    # 그리고 밭 전체를 두께로 정렬해서 잘라내는 옛 길이 남아 있으면 안 된다.
    if "for i = 1, math.min(#free, wanted or 12) do keep[i] = free[i] end" in lua:
        bad.append("아직 밭 전체를 두께로 정렬해 잘라낸다")
    return bad


# -- 일하고 있는 상자는 걷지 않는다 -----------------------------------------
#
# 실측(새 판 42분째). 요원 다섯이 한 칸에 묶여 있었다:
#
#     charlie  (3,2) 채굴기에 상자를 달았습니다.
#     bravo    길을 막은 iron-chest 1개를 걷어냅니다. (4, 2)
#     alpha    (3,2) 채굴기에 상자를 달았습니다.
#     echo     (3,2) 채굴기에 출구 상자가 없습니다. 달아주겠습니다.
#
# 달면 걷고 걷으면 단다. 그 사이 가방에는 채굴기가 열한 대 놀고 있었고,
# 스물다섯 분 동안 선 채굴기는 세 대에서 한 대도 안 늘었다.
#
# 채굴기가 떨구는 자리는 채굴기가 정한다. 우리가 고르는 것이 아니다.
def working_chest() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "sites.lua"),
                  encoding="utf-8").read()
    if "local function feeds_a_drill(" not in lua:
        bad.append("sites.lua 가 «채굴기를 받는 상자»를 가리지 않는다")
    elif "not feeds_a_drill(" not in lua:
        bad.append("가릴 줄은 아는데 blocking 이 그것을 안 본다 - "
                   "표시만 하고 아무도 안 쓴다")
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
    bad.extend(defence_anchor())
    bad.extend(seats_cluster())
    bad.extend(working_chest())
    for line in bad:
        print("  [FAIL] " + line)
    print(f"\n{len(bad)} problems - plot shape agrees "
          f"({len(SAME)} numbers checked)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

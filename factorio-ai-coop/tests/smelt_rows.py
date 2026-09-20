# -*- coding: utf-8 -*-
"""화로는 벨트 줄과 팔 줄 위에 서면 안 된다.

    사용자: "화로사이에 벨트가 왜있는거임?"

기준점이 둘이었다. 모드(belts.lua)는 제련 구역 안에서 화로 줄·벨트 줄·
팔 줄을 이미 계획하는데, `scripts/grow.py` 의 `smelt_row()` 는 그것을
모르고 `--smelt` 좌표에서 다섯 칸 간격으로 여섯 줄을 뿌렸다. 둘이 겹치는
자리에 화로가 서면 모드는 남은 빈칸으로 길을 이으려 하고, 아무 데도 안
닿는 벨트 토막이 남는다.

`scripts/rows.py` 가 이제 하나뿐인 기준점이다. 이 테스트는 두 가지를
지킨다:

    1) `rows.py` 의 상대 줄 숫자가 `belts.lua` 279행 주석과 «같은 숫자»인가.
       숫자가 갈라지면 이 테스트가 먼저 죽어야 한다 - 게임에서 죽기 전에.
    2) `grow.smelt_row()` 가 게임에 묻는 후보 칸이 그 금지 띠를 벗어나지
       않는가.

게임 접속 없이 돈다.

    python tests/smelt_rows.py
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "bridge"))

import rows                              # noqa: E402
import grow                              # noqa: E402

BELTS = os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "belts.lua")

problems = []


# 몇 가지를 봤는지는 «세어서» 말한다.
#
# 여기 있던 요약문은 검사 수를 리터럴 6 으로 박아 두었다. 검사를 하나 더
# 넣어도 6 이라고 찍혔다 - 세는 척하는 숫자였다. 이 저장소가 여러 번 배운
# 것과 같은 모양이다: 보고가 실제와 따로 놀면 고장을 못 본다.
checked = 0


def check(name, got, want):
    global checked
    checked += 1
    if got != want:
        problems.append(f"{name}: {got!r} != {want!r}")


# 1. rows.py 의 상대 줄이 belts.lua 279행 주석과 같은 숫자인가.
#
# 주석은 리터럴 텍스트로 "smelt.y - 3   들어오는 벨트" 처럼 적혀 있다.
# 그 오프셋과 이름표를 그대로 긁어서, LANES/ARMS/ROW_A/ROW_B 가 같은
# 것을 가리키는지 대조한다.
text = open(BELTS, encoding="utf-8").read()

# "화로 줄 0 은 smelt.y-1 과 smelt.y 를, 줄 1 은 smelt.y+4 와 smelt.y+5 를
# 차지한다" - 화로를 «세우는» 자리는 smelt.y 와 smelt.y+5 다(2x2 라 y-1,y
# 와 y+4,y+5 를 먹으므로).
check("화로 줄 0/1 이 smelt.y-1/smelt.y, smelt.y+4/smelt.y+5 를 차지한다고 적혀 있다",
      bool(re.search(r"smelt\.y-1\s*과\s*smelt\.y\s*를.*줄\s*1\s*은\s*"
                     r"smelt\.y\+4\s*와\s*smelt\.y\+5\s*를", text)),
      True)
check("ROW_A/ROW_B 가 그 세우는 자리(0, 5)다", (rows.ROW_A, rows.ROW_B), (0, 5))

# 이름표를 오프셋별로 뽑는다. -3/+2 는 벨트, -2/+1/+3 은 인서터(팔),
# -1/+4 는 화로 자신의 자리다(금지 띠에 없어야 한다).
#
# 주석 줄(「--」로 시작)만 본다 - 실제 코드에도 "smelt.y - 3" 이 나오는데
# (300행, `local y = smelt.y - 3`), 그것까지 주우면 다음 줄의 아무
# 단어나 이름표로 잘못 잡힌다.
found = {}
for line in text.splitlines():
    line = line.strip()
    if not line.startswith("--"):
        continue
    m = re.search(r"smelt\.y ([+-]\s*\d+)\s+(.+)$", line)
    if m:
        found[int(m.group(1).replace(" ", ""))] = m.group(2)

arm_offsets = {k for k, v in found.items() if "인서터" in v}
# 팔 줄 설명에도 "벨트"가 나온다("벨트에서 집어..."). 팔이 아니면서
# "벨트"가 있는 줄만 진짜 벨트 줄이다.
lane_offsets = {k for k, v in found.items() if "벨트" in v and k not in arm_offsets}

check("주석의 벨트 줄 오프셋", lane_offsets, set(rows.LANES))
check("주석의 팔 줄 오프셋", arm_offsets, set(rows.ARMS))
check("화로 자신의 자리(-1,+4)는 금지 띠가 아니다",
      ({-1, 4} & (lane_offsets | arm_offsets)), set())


# 2. clear_spots() 가 내주는 칸은 금지 띠와 절대 안 겹친다.
ZONE = {"x": 25, "y": 14, "w": 38, "h": 16}   # belts.lua 주석의 예시 구역
ZONES = {"smelt": ZONE}

bands = rows.reserved(ZONES)
spots = rows.clear_spots(ZONES)

check("clear_spots 가 자리를 준다", len(spots) > 0, True)
overlap = [(x, y) for x, y in spots
           if rows.inside(bands, x, y) or rows.inside(bands, x - 1, y)
           or rows.inside(bands, x, y - 1) or rows.inside(bands, x - 1, y - 1)]
check("clear_spots 의 자리는 벨트/팔 줄과 안 겹친다", overlap, [])

# 화로가 실제로 세워지는 두 y 값만 나와야 한다(smelt.y, smelt.y+5).
ys = {y for _, y in spots}
check("clear_spots 의 y 는 화로 두 줄뿐이다", ys, {ZONE["y"] + rows.ROW_A,
                                              ZONE["y"] + rows.ROW_B})


# 3. grow.smelt_row() - 구역도 대체 좌표도 없으면 게임에 묻지 않는다.
class Stub:
    """가짜 ai. .lua() 가 불리면 실패시킨다 - 물을 것이 없을 땐 안 불러야
    한다."""

    def __init__(self, zone=None):
        self.zone = zone
        self.lua_calls = []
        self.pinned = None

    def zones(self, _agent):
        return {"smelt": self.zone} if self.zone else {}

    def smelter(self, x=None, y=None):
        """대체 좌표를 쓰면 grow 가 그것을 «구역으로 못 박는다».

        기준점이 둘이면 줄이 흩어지므로, 그 못 박는 걸음이 빠지지 않았는지
        여기서도 본다.
        """
        if x is not None:
            self.pinned = (int(x), int(y))
        return {"smelter": self.pinned}

    def lua(self, expr):
        self.lua_calls.append(expr)
        return {"n": 0, "spots": [], "drills": 0}


ai = Stub(zone=None)
check("구역도 대체 좌표도 없으면 None", grow.smelt_row(ai, "alpha", 4), None)
check("그때는 게임에 묻지도 않는다", ai.lua_calls, [])

# 대체 좌표를 쓰는 순간 그것이 구역이 되어야 한다. 안 그러면 벨트를 까는
# 쪽이 모드 구역을 따라 «다른 곳»에 깔고, 화로 여덟 대가 팔도 벨트도 없이
# 선다 - 21회차에 실제로 그랬다.
pin = Stub(zone=None)
grow.smelt_row(pin, "alpha", 4, smelt_xy=(-45, 10))
check("대체 좌표를 쓰면 구역도 못 박는다", pin.pinned, (-45, 10))


def cand_of(lua_src):
    """만들어진 lua 문자열에서 `local cand, WANT = { ... }, N` 의 좌표만
    뽑는다. 좌표 사이의 "}, {" 는 다음 좌표를 여는 자리라 멈추지 않고,
    맨 끝의 "}, N" (숫자, 여는 중괄호 없음) 에서만 멈춘다."""
    m = re.search(r"local cand, WANT = \{ (.*?) \}, \d+", lua_src)
    assert m, "cand 리터럴을 못 찾았다"
    return [(int(x), int(y)) for x, y in
            re.findall(r"\{(-?\d+),(-?\d+)\}", m.group(1))]


# 4. grow.smelt_row() - 대체 좌표(smelt_xy)만 있을 때, 후보 두 줄이
#    rows.py 의 ROW_A/ROW_B 와 «같은 간격»이어야 한다. 좌표 원점이
#    달라도 간격은 rows.py 가 유일한 기준이다.
ai2 = Stub(zone=None)
grow.smelt_row(ai2, "alpha", 4, smelt_xy=(40, 0))
assert len(ai2.lua_calls) == 1, "대체 좌표가 있으면 게임에 물어야 한다"
fallback_ys = {y for _, y in cand_of(ai2.lua_calls[0])}
check("대체 좌표의 두 줄 간격이 rows.py 와 같다", fallback_ys, {0 + rows.ROW_A, 0 + rows.ROW_B})

# 5. grow.smelt_row() - 구역이 있으면 후보 칸이 clear_spots() 와 같고,
#    금지 띠 밖이다.
ai3 = Stub(zone=ZONE)
grow.smelt_row(ai3, "alpha", 4)
assert len(ai3.lua_calls) == 1
cand3 = cand_of(ai3.lua_calls[0])
check("구역이 있으면 후보가 clear_spots 와 같다", set(cand3), set(spots))

print()
if problems:
    for line in problems:
        print("  " + line)
    print(f"{len(problems)} problems - 화로가 아직 벨트 줄 위에 설 수 있다")
    sys.exit(1)
print(f"0 problems - 화로 줄과 벨트 줄의 기준점이 하나로 합쳐졌다 "
      f"({checked} rules checked)")

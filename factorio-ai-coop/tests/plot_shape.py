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


# -- 한 밭에는 한 광석 ------------------------------------------------------
#
# 거리만 보고 묶던 시절의 값(새 판 110분째):
#
#     밭이름 copper-ore (-86,-76)~(-69,-68) count=4
#     실제로는           copper-ore=1  iron-ore=3
#
# 구리 광맥과 철 광맥이 붙어 있었고 이름은 무리의 «첫 번째» 채굴기가
# 정했다. 그래서 무리는 「구리 4대, 철 0대」로 알고 판단했다.
#
# 이 표가 닿는 곳이 넓다 - 석탄 상한도 밭별 수로 정하고, 자리표도 밭
# 한가운데 칸의 광석으로 테두리를 다시 잰다. 한가운데가 남의 광맥이면
# 남의 밭에 줄을 긋는다.
def one_ore_per_field() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "zones.lua"),
                  encoding="utf-8").read()
    if "local function ore_of(" not in lua:
        bad.append("zones.lua 가 채굴기마다 «무엇을 캐는지»를 안 본다")
    if "kind[j] == ore" not in lua:
        bad.append("밭을 거리로만 묶는다 - 붙어 있는 두 광맥이 한 밭이 된다")
    # 주석이 아니라 «코드»를 본다. 앞서 한 번, 찾는 문자열이 주석에도
    # 걸려서 고쳤는데도 떨어진 적이 있다.
    if "local digs = group[1].mining_target" in lua:
        bad.append("밭 이름을 아직 «첫 번째» 채굴기가 정한다")
    return bad

# -- 두께는 «이 밭의» 광석으로 잰다 -----------------------------------------
#
# 16회차 실측: 「철밭」이라 부르던 줄의 채굴기 열한 대가 전부 돌을 캤다.
# 철은 한 톨도 없었다.
#
#     철 광맥(붙어 있는 덩어리)   x[-56..-22] y[ -4..27]
#     돌 광맥                     x[-61..-44] y[-14.. 3]
#     겹치는 상자                 x[-56..-44] y[ -4.. 3]  <- 여기는 다 돌
#
# 홍수채움으로 「붙어 있는 것만 한 밭」까지는 고쳤다. 그런데 그 결과는
# «상자»이고, 상자 안에 남의 광맥이 박혀 있으면 상자만으로는 알 수 없다.
# 두께를 세는 ore_under 가 type="resource" 로 아무거나 세었으므로, 돌
# 4469 를 「철 두께 4657」로 읽고 자리를 열한 칸 내놓았다.
#
# 「어느 광맥인가」를 한 번 알아낸 뒤 그것을 두께 세는 데 «안 쓰면», 알아낸
# 보람이 없다. 이 저장소가 여러 번 만든 모양이다 - 기능은 있는데 그것을
# 가리키는 것이 없다.
def thickness_is_this_ore() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "plots.lua"),
                  encoding="utf-8").read()
    body = lua[lua.find("local function ore_under"):]
    body = body[:body.find(chr(10) + "  end")]
    if "name = want_name" not in body:
        bad.append("ore_under 가 밭의 광석 이름으로 안 거른다 "
                   "- 남의 광맥을 두께로 센다")
    if 'type = "resource",' in body:
        bad.append("ore_under 가 아직 아무 광물이나 센다 "
                   '(type = "resource" 가 조건 없이 남아 있다)')

    # 그리고 그 이름이 «건너와야» 한다. 가운데 칸에 물어 짐작하면, 돌이
    # 박힌 철밭 한가운데에서 또 돌을 고를 수 있다.
    if "ore_name" not in lua:
        bad.append("plots.lua 의 mine_seats 가 밭 이름을 안 받는다")
    src = io.open(os.path.join(ROOT, "bridge", "client.py"),
                  encoding="utf-8").read()
    call = src[src.find("def mine_seats"):]
    call = call[:call.find(chr(10) + "    def ", 10)]
    if 'field.get("ore")' not in call:
        bad.append("client.mine_seats 가 밭 이름을 안 건넨다")
    return bad


# -- 치울 수 있는 것은 «막힌 것»이 아니다 -----------------------------------
#
# 사용자: "중간에 큰바위가 있는게 파괴할방법잇나?"
#
# 실측(16회차): big-rock (-48,14) 이 철 줄 한가운데에 있었다. 큰바위는
# 2x2 자리 네 칸을 덮는데, 자리표는 can_place_entity 가 거짓이면 그냥
# 「막힘」으로 세고 지나갔다. 바위는 우리 힘의 것이 아니라서 blocking 도
# 못 본다. 그래서 그 자리는 영영 빈다.
#
# 벨트에서는 이미 한 번 갈라 놓았다 - sweep(줍고 깐다) / lift(걷고 깐다)
# / blocked(못 깐다). 같은 말이 자리표에는 없었다. 한 곳에서 배운 것을
# 다른 곳에 안 옮기면 같은 사고를 두 번 겪는다.
def rocks_are_clearable() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "plots.lua"),
                  encoding="utf-8").read()
    if "clearable" not in lua:
        bad.append("자리표가 «치우면 놓을 수 있는» 자리를 안 가린다")
    if "seat_clear" not in lua:
        bad.append("자리표가 치울 것을 자리에 안 실어 보낸다 (clear)")

    # 그리고 무리가 «실제로» 치워야 한다. 가려만 놓고 안 쓰면 place 가
    # 실패하고 그 자리는 고치기 전과 똑같이 빈다.
    src = io.open(os.path.join(ROOT, "bridge", "crew", "mining.py"),
                  encoding="utf-8").read()
    build = src[src.find("            built = 0"):]
    if 'site.get("clear")' not in build:
        bad.append("mining.py 가 자리표의 clear 를 안 본다")
    if "demolish(" not in build:
        bad.append("mining.py 가 세우기 전에 안 치운다")
    return bad


# -- 「가지고 있다」가 아니라 «달라는 만큼 있다» ----------------------------
#
# 16회차 실측: 석탄 600개를 달라 했는데 1개를 받아 오고도 성공이었다.
#
#     부른 칸          (-70,15)
#     석탄 상자        가운데 (-69.5,15.5)  거리 0.707  석탄 1363
#     급유 인서터      가운데 (-70.5,14.5)  거리 0.707  석탄 1
#
# 거리가 «같다». 둘 다 「가지고 있다」 가산점 100 을 받아 동점이 되었고,
# 먼저 나온 쪽이 이겼다. 급유 장치는 상자와 인서터를 한 칸 간격으로 세우니
# 이 둘은 언제나 같이 잡히고, 언제나 동점이다.
#
# 이미 한 번 겪고 주석까지 달아 둔 자리였다(tasks.lua 505행). 그때는
# 「무엇을」까지만 알려주고 「몇 개」를 안 알려줬다.
def take_wants_enough() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "tasks.lua"),
                  encoding="utf-8").read()
    head = lua[lua.find("local function target_entity"):]
    head = head[:head.find(chr(10) + "end")]
    if "how_many" not in head:
        bad.append("target_entity 가 「몇 개」를 안 받는다 "
                   "- 한 개짜리가 천 개짜리와 동점이 된다")
    if "held >= (how_many or 1)" not in head:
        bad.append("target_entity 가 달라는 만큼 가진 쪽을 안 올린다")
    take = lua[lua.find("M.take = {"):]
    take = take[:take.find(chr(10) + "}")]
    if "target_entity(ctx, p, p.name, p.count)" not in take:
        bad.append("take 가 «몇 개»를 target_entity 에 안 건넨다")
    return bad


# -- 모양은 밭에서 나온다. 못박지 않는다 ------------------------------------
#
# 사용자: "채굴기를 모든채굴지에 똑같이 가로로 위아래1줄구성을 하기보단
#          세로로하던가 뭐 2중4열 이런식으로 효율적으로 배치할 수 있도록
#          추론해서 고도화 해야함."
#
# 고치기 전에는 「긴 쪽을 따라 여덟 쌍짜리 줄 셋」이 못박혀 있었다. 밭이
# 어떻게 생겼든 같은 모양을 찍었다는 뜻이다. 좁은 밭에서는 없는 자리를
# 세다 지치고, 넓은 밭에서는 절반을 놀렸다.
#
# 그리고 방향을 «테두리»로 골랐다. 실측(철 광맥) 가로 35 x 세로 32 -
# 한 칸 차이로 가로가 이긴다. 상자는 상자일 뿐이고 그 안의 광석은 다른
# 모양이다. 그러니 두 방향을 다 «재보고» 고른다 - 짐작 대신 재기.
def layout_comes_from_the_patch() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "plots.lua"),
                  encoding="utf-8").read()
    body = lua[lua.find("local function mine_seats"):]

    if "shape_of" not in body:
        bad.append("줄 수와 줄 길이가 밭 크기에서 안 나온다 (shape_of 없음)")
    if "sweep(true)" not in body or "sweep(false)" not in body:
        bad.append("한 방향만 재본다 - 두 방향을 다 재고 골라야 한다")
    # 「테두리의 긴 쪽」으로 방향을 정하던 줄이 남아 있으면 재보는 보람이 없다.
    if "local wide = (field.right - field.left) >=" in body:
        bad.append("아직 테두리 비교로 방향을 정한다")
    # 고른 결과가 실제로 쓰여야 한다.
    if "picked.shape" not in body:
        bad.append("고른 방향의 모양을 안 쓴다")
    if "MINE.row)" in body.replace("per_lane or MINE.row", ""):
        bad.append("띠를 나눌 때 아직 못박힌 줄 길이를 쓴다")

    # 반쯤 지어 놓은 줄을 버리고 반대로 새로 긋기 시작하면 두 배치가
    # 서로를 막는다. 이미 선 것도 점수에 들어가야 한다.
    scoring = body[body.find("local function score"):]
    scoring = scoring[:scoring.find(chr(10) + "  end")]
    if "try.ours" not in scoring:
        bad.append("이미 선 채굴기를 점수에 안 넣는다 - 방향이 뒤집히면 "
                   "지어 놓은 줄이 버려진다")

    # 그리고 밖에서 «무엇을 골랐는지» 보여야 한다. 안 보이면 왜 그렇게
    # 섰는지 물어볼 데가 없다.
    tail = body[body.find("  return { free = keep"):]
    for key in ("lanes", "per_lane", "tried"):
        if key not in tail:
            bad.append(f"자리표가 고른 모양을 안 알려준다 ({key})")
    return bad


# -- 출구가 하나면 채굴기를 늘려도 소용이 없다 ------------------------------
#
# 사용자: "연료랑탄약모자란곳이 있는데"
#
# 실측(16회차 석탄밭): 채굴기 10대에 출구(버너 인서터) 하나.
#
#     벨트      칸마다 8개로 포화
#     채굴기    10대 중 6대 waiting_for_space_in_destination
#     실제 산출 0.6개/초   <- 캘 수 있는 2.5개/초의 4분의 1
#
# 병목은 «문»이지 «광부»가 아니었다. 그런데 이 수를 아무도 적어두지
# 않아서, 밭을 넓힐 때마다 출구는 그대로 하나였다.
def one_arm_is_two_drills() -> list:
    bad = []
    arm = getattr(settings, "INSERTER_PER_SECOND", None)
    per = getattr(settings, "DRILLS_PER_ARM", None)
    drill = getattr(settings, "DRILL_PER_SECOND", None)
    if arm is None or per is None:
        return ["INSERTER_PER_SECOND / DRILLS_PER_ARM 둘 다 있어야 한다"]
    if drill and per > arm / drill:
        bad.append(f"출구 하나에 채굴기 {per}대는 과하다 "
                   f"({arm}/초 나가는데 {per * drill}/초 들어온다)")
    if per < 1:
        bad.append("출구 하나에 채굴기 한 대도 못 붙인다는 수가 나왔다")
    return bad


# -- 지킬 것은 «구역»이 아니라 «일하는 곳»이다 -------------------------------
#
# 16회차 전멸(198분). 캐릭터 둘이 죽었다.
#
#     포탑 12대   y=-53 줄 다섯, x=5 줄 넷, 철밭 셋
#     다친 것     (-77,41) 구리밭, (-63,15)(-64,17) 석탄밭, (-57,14) 철밭
#     시체        (-65,7) 석탄밭, (-56,-4) 돌밭
#
# 포탑은 제련.조립.유통 «구역»을 둘러 섰고, 죽은 것은 전부 밭이었다.
# core_box 가 zones 세 개만 보았기 때문이다. 공장의 값어치가 밭으로
# 옮겨간 뒤에도 방어선은 처음 그린 자리에 남아 있었다.
#
# 19회차에도 같은 모양이었다 - 그때는 무게중심이 틀렸고, 이번에는
# 무게중심을 고쳤는데 «무게중심이 볼 목록»이 좁았다.
def posts_guard_the_fields() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "defence.lua"),
                  encoding="utf-8").read()
    if "outposts" not in lua:
        bad.append("밭마다 초소를 안 낸다 (outposts 없음)")
    if "WORTH" not in lua:
        bad.append("지킬 값어치가 있는 것의 목록이 없다")
    # 채굴기가 목록에 없으면 밭은 여전히 안 보인다.
    worth = lua[lua.find("local WORTH"):]
    worth = worth[:worth.find("}")]
    if "mining-drill" not in worth:
        bad.append("지킬 목록에 채굴기가 없다 - 밭이 또 안 보인다")
    # 그리고 밖으로 «나가야» 한다. 계산만 하고 안 알려주면 없는 것과 같다.
    tail = lua[lua.find("    raid = raid("):]
    if "posts = posts" not in tail:
        bad.append("초소를 계산만 하고 안 알려준다")
    # 한 덩어리에 몰아주면 다른 밭이 빈다.
    if "#want_here < 3" not in lua:
        bad.append("한 초소에 세울 수를 안 막는다")
    return bad


# -- 한 겹만 두면 그 한 겹이 틀린 날 공장이 없어진다 ------------------------
#
# 사용자: "방어포탑은 기지 내부에도 군데군데 설치해서 만일의 사태에
#          대비해두는것이 조음."
#
# 19회차에는 만재한 여덟 대가 한 마리도 못 잡았고, 16회차에는 선 자체가
# 엉뚱한 곳에 있었다. 두 번 다 「테두리 한 겹」이었다.
#
# 안쪽 총은 테두리보다 성기게 둔다. 촘촘히 두면 테두리에서 총이 빠지고,
# 안쪽은 막는 것이 아니라 «뚫렸을 때 시간을 버는 것»이기 때문이다.
def defence_has_depth() -> list:
    bad = []
    lua = io.open(os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "defence.lua"),
                  encoding="utf-8").read()
    if "inner_seats" not in lua:
        bad.append("안쪽 자리를 안 낸다 (inner_seats 없음)")
    tail = lua[lua.find("    raid = raid("):]
    if "inner = inner" not in tail:
        bad.append("안쪽 자리를 계산만 하고 안 알려준다")
    # 안쪽이 테두리보다 촘촘하면 테두리에서 총이 빠진다.
    import re
    gap = re.search(r"local INNER_GAP = (\d+)", lua)
    edge = re.search(r"local TURRET_GAP = (\d+)", lua)
    if gap and edge and int(gap.group(1)) <= int(edge.group(1)):
        bad.append(f"안쪽 간격 {gap.group(1)} 이 테두리 간격 {edge.group(1)} "
                   "보다 촘촘하다 - 테두리에서 총이 빠진다")
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
    bad.extend(one_ore_per_field())
    bad.extend(thickness_is_this_ore())
    bad.extend(rocks_are_clearable())
    bad.extend(take_wants_enough())
    bad.extend(layout_comes_from_the_patch())
    bad.extend(one_arm_is_two_drills())
    bad.extend(posts_guard_the_fields())
    bad.extend(defence_has_depth())
    for line in bad:
        print("  [FAIL] " + line)
    print(f"\n{len(bad)} problems - plot shape agrees "
          f"({len(SAME)} numbers checked)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

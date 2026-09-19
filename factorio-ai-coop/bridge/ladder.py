"""무엇을 할 것인가 - 순수 계산.

스냅샷 하나를 받아 «지금 가장 값어치 있는 일»을 순서대로 내놓는다.
사다리(광석 -> 판금 -> 부품 -> 과학팩 -> 연구)를 아는 유일한 곳이다.
"""

from __future__ import annotations

import math

from typing import Any

from settings import (BURNER_DRILLS, CHEST, COAL_PER_SECOND, DRILL, FIRST_PACKS, DRILLS_PER_AGENT, COAL_RIGS, DRILLS_PER_FURNACE, DRILL_FUEL,
                      DRILL_BURN_PER_SECOND, FURNACE_BURN_PER_SECOND, GROW_STEP,
                      ENGINES_PER_BOILER, FOCUS_ORDER, FURNACES_PER_DRILL,
                      FURNACE_FUEL, MAX_FURNACES, ORE_BATCH, PLATES_FOR_TOOLS,
                      SMELT_BATCH, SMELT_FOR_TECH, SMELT_MARGIN, STOCKPILE,
                      TURRET_TECH, NOISE_ROOM)
from world import Snapshot
from jobs import Job
from layout import craft_seat, furnace_seat, orphan_drills


def worth_building(row: dict, floor: int = 6) -> tuple[bool, str]:
    """이 기계를 한 대 더 세울 때인가, 서 있는 것을 고칠 때인가.

    실측(259분째): 버너 채굴기 194대 중 도는 것은 24대였다. 101대는 상자가
    꽉 차서, 57대는 연료가 없어서 서 있었는데 무리는 계속 더 세우고 있었다.
    「세운 수」만 셌기 때문이다.

    스물넷이 도는데 백칠십이 서 있으면 문제는 부족이 아니라 막힘이다.
    한 대 더 세우는 것은 낭비를 한 대 더 세우는 것이다.

    floor 아래로는 이 판단을 하지 않는다. 세 대 중 한 대가 멈춘 것은
    막힘이 아니라 그냥 초반이다.
    """
    built = int(row.get("built") or 0)
    working = int(row.get("working") or 0)
    if built < floor:
        return True, ""
    if working >= built // 2:
        return True, ""
    why = row.get("why") or {}
    worst = max(why.items(), key=lambda kv: kv[1], default=("?", 0))
    return False, (f"{built}대 중 {working}대만 돕니다. "
                   f"가장 많은 이유는 {worst[0]} {worst[1]}대입니다")


def pollution_room(snap: Snapshot) -> float:
    """공해 여유가 짓는 상한을 얼마나 깎는가. 1.0 이면 안 깎는다.

    버너 기계는 하나하나가 굴뚝이다. 그러니 「몇 대까지 세울 것인가」는
    벨트가 먹일 수 있는 수만으로 정할 일이 아니다 - 둥지가 얼마나 가까운가도
    정한다. 같은 공장이라도 둥지가 260타일 밖이면 버티고 130타일이면 못 버틴다.

    실측으로 배운 값이다. 지난 판에서 둥지는 264타일이었고 공해는 224타일까지
    뻗었다. 마흔 타일 차이로 습격이 왔고 화로 8대와 요원 하나를 잃었다.
    이번 맵의 가장 가까운 둥지는 130타일이다.

    여유를 모르면 깎지 않는다. 모르는 것을 위험으로 치면 아무것도 못 짓는다.
    """
    room = snap.slack
    if room is None:
        return 1.0
    if room <= 0:
        return 0.0      # 이미 닿았다. 더 지을 때가 아니라 줄일 때다.
    if room < 40:
        return 0.5
    if room < 100:
        return 0.75
    return 1.0


def rigs_by_ore(snap: Snapshot) -> dict:
    """밭마다 채굴기가 몇 대 서 있는가. zones 가 이미 광맥별로 묶어 준다.

    빈 사전은 「없다」가 아니라 「아직 모른다」다. 부르는 쪽이 그 둘을
    갈라 봐야 한다.
    """
    out: dict = {}
    for one in _drill_fields(snap):
        ore = one.get("ore")
        if ore:
            out[ore] = out.get(ore, 0) + int(one.get("count") or 1)
    return out


def coal_rigs_needed(burners: int, furnaces: int) -> int:
    """석탄 채굴기가 몇 대 있어야 하는가. 태우는 입을 세어서 정한다.

    COAL_RIGS 는 넷이라는 «상수»였다. 그 넷이 나온 산수는 주석에 이렇게
    적혀 있었다 - 「채굴기 하나가 초당 0.25개를 캐고 0.0375개를 태우니
    제 몫의 일곱 배를 남긴다, 넷이면 스물여덟 대를 먹인다」.

    산수는 맞는데 «화로를 안 셌다». 화로도 석탄을 태운다(0.0225/s). 그리고
    스물여덟 대라는 것도 그때의 판일 뿐, 공장은 자란다. 산수가 이미 있는데
    그 결과만 상수로 박아두면, 판이 달라졌을 때 아무도 다시 세지 않는다.

    그래서 상수 대신 식을 쓴다. COAL_RIGS 는 «바닥»으로만 남는다 - 갓
    시작한 판에서 입이 둘뿐이라고 석탄 채굴기를 한 대만 두면, 연료가
    끊기는 순간 되돌아올 길이 없다.
    """
    eats = (max(0, burners) * DRILL_BURN_PER_SECOND
            + max(0, furnaces) * FURNACE_BURN_PER_SECOND)
    # 석탄 채굴기도 제가 태운다. 캔 것 전부가 남는 것이 아니다.
    spare = COAL_PER_SECOND - DRILL_BURN_PER_SECOND
    return max(COAL_RIGS, math.ceil(eats / spare))


def drill_target(snap: Snapshot, crew: int) -> int:
    """채굴기를 몇 대까지 세울 것인가.

    화로가 요구하는 만큼 세우되, 손으로 연료를 넣어줄 수 있는 만큼만.
    드릴 4대로 화로 23대를 채우려던 것이 지금까지의 상태였다.
    """
    furnaces = snap.buildings.get("stone-furnace", {}).get("count", 0)
    drills = snap.buildings.get(DRILL, {}).get("count", 0)
    # 석탄 채굴기는 이 비율 밖이다.
    #
    # 1:1 은 「캔 광석을 받을 화로가 있는가」의 규칙이다. 석탄 채굴기는
    # 화로에 넣어주는 것이 아니라 «태우는 입»을 먹인다 - 화로 수와 아무
    # 관계가 없다. 그런데 지금까지 한 무더기로 세고 있었다.
    #
    # 값이 두 번 어긋난다. 석탄 채굴기가 녹이는 쪽의 예산을 먹어서 철이
    # 안 늘고, 동시에 제 몫만큼 화로를 요구해서 돌이 헛되이 나간다. 석탄을
    # 열세 대까지 늘리면 쓰지도 않을 화로 열세 대를 더 지으라고 한다.
    fuelling = rigs_by_ore(snap).get("coal", 0)
    smelting = max(0, drills - fuelling)
    # 화로만 보면 자라지 못한다.
    #
    # 실측(37분째): 채굴기 5대, 화로 6대. 그리고 이랬다:
    #
    #     채굴기 목표 = 화로 x 1.0 = 6
    #     화로 목표   = 채굴기 x 1.0 = 5
    #
    # 서로가 서로의 상한이다. 둘 다 영원히 안 늘어난다. 비율은 맞는데
    # 「비율만」 있으면 공장이 그 비율을 유지한 채 얼어붙는다.
    #
    # 그래서 한 걸음씩 앞서갈 여지를 준다. 늘려도 되는지는 다른 셋이
    # 이미 지킨다 - 선 것이 도는가(worth_building), 공해가 여유 있는가
    # (pollution_room), 자리가 있는가(자리표). 비율은 «방향»이지 «상한»이
    # 아니어야 한다.
    wanted = math.ceil(furnaces * DRILLS_PER_FURNACE)
    # 비율이 «딱 맞아떨어진» 때에만 한 걸음 내딛는다.
    #
    # 그때가 바로 교착이다 - 서로가 서로의 상한이라 둘 다 못 움직인다.
    # 한쪽이 앞서 있으면(드릴 넷에 화로 하나) 그쪽은 안 키운다. 거기서
    # 드릴을 더 놓는 것은 교착을 푸는 게 아니라 낭비를 늘리는 것이다.
    # 방어 빚이 있으면 자라지 않는다.
    #
    # 사용자: "공해도가 올라가면 적이 공격오니까 우린 자원도 자원나름이지만
    # 방어가 최우선임."
    #
    # 맞다. 버너 채굴기는 하나하나가 굴뚝이고, 굴뚝을 더 세우는 것은 빚을
    # 더 지는 일이다. 갚기 전에는 늘리지 않는다 - 이미 선 것으로 버틴다.
    if smelting == wanted and snap.debt <= 0:
        wanted = smelting + GROW_STEP
    # 석탄 몫은 여기서 «더하지 않는다».
    #
    # 한 번 더해 봤다가 되돌렸다. 여기서 더하면 그 여유가 총량으로 풀려서
    # 구리가 가져간다 - 화로 하나에 채굴기 넷인 판에서 「화로를 더 지어라」
    # 대신 「구리 채굴기를 더 놓아라」가 나왔다. 광석은 이미 쌓여 있었다.
    #
    # 석탄 몫은 plan() 이 이미 «따로 떼어» 준다(room = want_coal - coal_rigs).
    # 그것이 옳은 자리다. 거기서는 석탄이 focus 라 그 여유가 석탄에만 간다.

    # 총이 없는 동안에는 화로 비율이 상한이 아니다.
    #
    # 사용자: "최대한 빨리 채굴기를 최대한으로 늘려서 포탑을 빠르게
    # 건설해야함."
    #
    # 비율은 «정상 운영»의 규칙이다. 화로 셋에 채굴기 셋이면 아무것도
    # 안 넘치고 아무것도 안 모자란다. 그런데 총이 한 대도 없는 판에서는
    # 균형이 목표가 아니다 - 살아남는 것이 목표고, 그러려면 연구가 끝나야
    # 하고, 연구가 끝나려면 광석이 있어야 한다.
    #
    # 이 판(60분째)이 그 값이다: 채굴기 9, 화로 3, 터렛 0, gun-turret
    # 연구 미완. 비율대로면 채굴기 상한이 «셋»이라 더 안 늘린다.
    #
    # 그래서 무장할 때까지는 버너 시대 상한까지 연다. 상한을 «없애지는»
    # 않는다 - 채굴기 161대에 과학팩 0개였던 판이 있었고, 너비는 사슬을
    # 대신하지 못한다. 그리고 공해 여유는 그대로 깎는다. 둥지를 깨우면서
    # 총을 만드는 것은 앞뒤가 바뀐 일이다.
    #
    # 다만 «광석이 이미 썩고 있으면» 열지 않는다. 캔 것이 안 녹고 쌓여
    # 있는데 더 캐는 것은 연구를 앞당기지 않는다 - 연구를 앞당기는 것은
    # 판금이지 광석이 아니다. 이 저장소가 그 값을 두 번 치렀다: 구리광석
    # 837개에 화로 한 대, 그리고 채굴기 161대에 과학팩 0개.
    #
    # 그래서 「총이 없다」와 「광석이 흐른다」가 «둘 다» 참일 때만 연다.
    piling = snap.have("iron-ore") + snap.have("copper-ore") >= STOCKPILE
    # 그리고 «시끄러워도 되는 지도»에서만 연다.
    #
    # 사용자: "이번맵은 적군기지가 너무가까이있음. 이점 유의해서 추론하고
    # 플레이하도록"
    #
    # 버너 채굴기는 하나하나가 굴뚝이다. 마흔 대면 분당 사백의 공해고,
    # 둥지가 50타일인 지도에서 그것은 총이 서기 전에 습격을 부른다.
    # 「무장 전에는 넓게 캔다」는 «캘 시간이 있을 때»의 규칙이다.
    #
    # 여유를 모르면 열지 않는다. 모르는 것을 안전으로 읽지 않는다 -
    # 이 저장소가 여러 번 한 실수다.
    room = snap.slack
    quiet_enough = isinstance(room, (int, float)) and room >= NOISE_ROOM
    unarmed = (not snap.knows(TURRET_TECH) and snap.debt <= 0
               and not piling and quiet_enough)
    if unarmed:
        wanted = max(wanted, BURNER_DRILLS)
    # 버너 시대에는 상한이 있다. 숙련자들의 권장치는 마흔 대 안팎인데 우리는
    # 161대를 세우고도 과학팩이 0개였다. 너비는 사슬을 대신하지 못한다.
    if not snap.knows("electric-mining-drill"):
        wanted = min(wanted, BURNER_DRILLS)
    # 공해가 둥지에 가까우면 상한을 깎는다. 버너 채굴기는 하나하나가 굴뚝이다.
    wanted = int(wanted * pollution_room(snap))
    # 광맥마다 한 대씩은 남긴다. 완전히 0으로 만들면 사슬이 통째로 멈추고,
    # 멈춘 공장은 스스로 방어를 세울 재료도 못 만든다.
    # 사람 수 상한도 무장 전에는 풀어준다. 위에서 상한을 열어놓고 여기서
    # 닫으면 연 적이 없는 것과 같다 - 다섯 명 x 여섯 대 = 서른이 실질
    # 상한이 되어버린다. 채굴기는 세워두면 사람 없이도 캔다.
    per_head = crew * DRILLS_PER_AGENT
    if unarmed:
        per_head = max(per_head, BURNER_DRILLS)
    return max(len(FOCUS_ORDER), min(per_head, wanted))


def furnace_target(snap: Snapshot, crew: int) -> int:
    """화로를 몇 대까지 세울 것인가.

    손으로 나르는 동안에는 사람 수가 공급량이고, 채굴기가 돌기 시작하면
    채굴기 수가 공급량이다. 둘 중 큰 쪽을 따라간다.
    """
    drills = snap.buildings.get(DRILL, {}).get("count", 0)
    furnaces = snap.buildings.get("stone-furnace", {}).get("count", 0)
    # 석탄 채굴기가 캔 것은 화로에 안 들어간다. 세면 쓰지도 않을 화로를
    # 짓느라 돌이 나가고, 돌은 지금 이 판에서 채굴기를 더 만들지 못하게
    # 막고 있는 바로 그것이다.
    smelting = max(0, drills - rigs_by_ore(snap).get("coal", 0))
    # 채굴기만 보면 자라지 못한다. drill_target 과 같은 이유다 - 둘이
    # 서로의 상한이면 공장은 그 비율을 유지한 채 멈춘다.
    from_drills = math.ceil(smelting * FURNACES_PER_DRILL)
    # 화로도 석탄을 태운다. 채굴기와 같은 이유로 빚 앞에서 멈춘다.
    if furnaces == from_drills and snap.debt <= 0:
        from_drills = furnaces + GROW_STEP
    # 돌 화로도 석탄을 태운다. 채굴기와 같은 이유로 같이 깎인다.
    ceiling = int(MAX_FURNACES * pollution_room(snap)) or 1
    return max(1, min(ceiling, max(crew, from_drills)))


def rebalance(health: dict) -> tuple[str, int, str] | None:
    """채굴기와 화로의 비율이 어긋났으면 무엇을 지어야 하는지 한 줄로.

    실측(259분째): 채굴기 194 : 화로 21 = 9.2 : 1. 바른 비율은 1 : 1 이다.
    이 상태에서 채굴기를 한 대 더 세우는 것은 아무 의미가 없다 - 캔 광석을
    받을 데가 없어서 서 있는 채굴기가 이미 101대다.

    싼 쪽을 늘린다. 화로는 돌 5개고 채굴기는 철판 3 + 기어 3 + 돌 1 이다.
    """
    drills = int((health.get(DRILL) or {}).get("built") or 0)
    furnaces = int((health.get("stone-furnace") or {}).get("built") or 0)
    if drills < 4 or furnaces >= drills:
        return None
    if drills < furnaces * 2:
        return None
    return ("stone-furnace", drills - furnaces,
            f"채굴기 {drills}대에 화로 {furnaces}대입니다. "
            f"바른 비율은 1:1이고, 지금은 캔 광석을 받을 데가 없습니다")


def _drill_fields(snap: Snapshot) -> list[dict]:
    """채굴 밭 목록. 밭마다 «무엇을 캐는가»가 적혀 있다.

    구역 쪽(zones.lua)이 밭을 광맥별로 묶어 돌려준다. 빈 목록은 「없다」가
    아니라 「아직 모른다」다. 부르는 쪽은 그 둘을 갈라 봐야 한다 - 모른다고
    상한을 넘기면 상한이 없는 것과 같아진다.
    """
    return [one for one in (getattr(snap, "fields", None) or [])
            if isinstance(one, dict)]


def digs_itself(snap: Snapshot) -> bool:
    """기계가 캘 수 있는 판인가. 그렇다면 손으로 캐지 않는다.

    사용자: "채굴기건설후 / 채굴기를 만들 수 있는조건이면 직접 광질하지
    않도록 해줘."

    맞다. 버너 채굴기 한 대는 초당 0.25개를 캔다. 사람이 곡괭이로 캐는
    속도와 비슷한데, 채굴기는 «자는 동안에도» 캔다. 사람이 한 시간
    캐는 것과 채굴기 한 대를 놓는 십 초가 같은 값이 아니다.

    실측(37분째)이 그 값을 보여줬다 - 다섯이 손으로 캐서 구리광석을
    837개 모으는 동안 땅에 선 채굴기는 두 대였고, 가방에 든 완성품도
    두 대였다.

    세 가지 중 하나면 기계가 할 수 있다:

      * 이미 서 있다      그 광맥은 기계가 캐고 있다
      * 손에 들고 있다    놓기만 하면 된다
      * 만들 수 있다      만들어 놓으면 된다

    셋 다 아닐 때만 손이 나선다. 개국 직후가 그렇다 - 돌도 철도 없으니
    채굴기를 만들 수 없고, 그때는 손이 유일한 시작점이다. 그 문은
    닫지 않는다.
    """
    if snap.buildings.get(DRILL, {}).get("count", 0) > 0:
        return True
    if snap.have(DRILL) >= 1:
        return True
    return bool(snap.can_make(DRILL) and snap.can_make(CHEST))


def plan(snap: Snapshot, focus: str = "iron-ore", crew: int = 1) -> list[Job]:
    """Everything worth doing right now, best first.

    Pure, and deliberately a *list*: the crew hands out different entries to
    different agents. A single "what should I do" answer is how three agents end
    up shoulder to shoulder on the same rock.
    """
    jobs: list[Job] = []
    furnaces = snap.spots("stone-furnace")
    furnace = furnaces[0] if furnaces else None
    drills = snap.buildings.get(DRILL, {}).get("count", 0)

    # 손으로 굽는 일을 «뒤로 미뤄둘» 자리.
    #
    # 사용자: "반장이 채굴기 심시티부터 한번 진행해봐"
    #
    # 맞다. 실측(새 판 9분째): 사람 다섯, 화로 다섯, 채굴기 «0대». 반장이
    # 고른 아홉 가지 중 앞의 다섯이 전부 smelt 였다.
    #
    # 손으로 캐서 손으로 굽는 것은 쳇바퀴다. 한 줌 넣으면 한 줌 나오고 그
    # 사이 아무것도 자라지 않는다. 채굴기는 한 번 세우면 자는 동안에도
    # 캔다 - 이 저장소가 이미 적어둔 값이다(digs_itself).
    #
    # 「땅에 선 채굴기가 하나라도 있는가」로 가른다. 한 대라도 서 있으면
    # 그 광맥은 기계가 캐고 있으니 손은 굽는 쪽을 도우면 된다. 한 대도
    # 없는데 세울 수 있으면 세우는 것이 먼저다.
    #
    # 버리지 않고 «미루기만» 한다. 채굴기를 못 세우는 판(돌도 철도 없는
    # 개국 직후)에서 굽는 일까지 없애면 사다리가 통째로 멈춘다.
    by_hand: list[Job] = []
    drill_first = drills == 0 and (
        snap.have(DRILL) >= 1 or (snap.can_make(DRILL) and snap.can_make(CHEST)))

    # --- infrastructure the whole crew shares ----------------------------
    # One furnace serves everybody, so only one agent should be building it.
    if not furnace:
        if snap.anywhere("stone-furnace") >= 1:
            # 첫 화로가 제련 구역의 첫 칸이 된다. 여기서 「내가 선 자리」에
            # 놓으면 그 뒤의 화로 예순 대가 전부 그 자리를 기준으로 선다.
            first = furnace_seat(snap.smelter, 0) if snap.smelter else {
                "x": snap.x + 3, "y": snap.y + 3}
            jobs.append(Job("제련 구역에 화로를 설치합니다.", key="furnace", steps=[
                ("build", {"name": "stone-furnace", **first, "snap": True})
            ]))
        elif snap.can_make("stone-furnace"):
            jobs.append(Job("화로를 제작합니다.", key="furnace",
                            steps=[("craft", {"recipe": "stone-furnace", "count": 1})]))
        else:
            spot = snap.ore("stone")
            if spot:
                jobs.append(Job("돌부터 캐서 화로를 만들겠습니다.", key="furnace",
                                steps=[("mine", {**spot, "count": 5})]))

    # 빨간 과학팩 열 개가 그다음 전부의 문이다.
    #
    # Automation 연구는 팩 열 개면 되고, 손으로 만들어도 된다(게임 공식값).
    # 그 하나가 로지스틱도 전기 채굴기도 터렛도 전부 연다. 그런데 우리는
    # 채굴기를 161대까지 늘리면서 이 열 개를 한 번도 안 만들었다.
    #
    # 조립기를 세우는 것보다 먼저다. 조립기는 팩을 «계속» 대기 위한 것이지
    # 첫 열 개를 위한 것이 아니다 - 첫 열 개는 손이 더 빠르다.
    # 전기가 들어온 랩이 있을 때만이다. 전기 없는 랩은 팩을 먹지 않는다 -
    # 숙련자들이 「전력이 안정되기 전에 과학을 확장하지 마라」고 하는 것도
    # 같은 말이다.
    # 묻는 것은 «팩을 가졌는가»가 아니라 «랩이 도는가»다.
    #
    # 실측(2026-09-18): alpha 가 빨간 과학팩 열 개를 손에 쥐고 있었고, 랩
    # 세 대가 전기망에 물려 있었고, 연구 진척은 0 이었다. working_labs 0.
    # 만들어놓고 «넣지를» 않은 것이다.
    #
    # 조건이 「anywhere(팩) < 10」이었기 때문이다. 열 개를 손에 넣는 순간
    # 이 일감이 사라진다. 목표가 「열 개를 갖는 것」이 되어버렸다.
    #
    # 손에 든 팩은 연구가 아니다. 랩 «안»에 있는 팩만 연구다.
    #
    # 「연구가 골라져 있는가」로도 안 된다 - 지금이 바로 그 상태다.
    # advanced-material-processing 이 골라져 있고 진척은 0 이다. 고른 것과
    # 도는 것은 다르다. 그래서 도는 랩의 «수»를 묻는다.
    lab = snap.building("lab") if snap.powered else None
    if lab and (snap.working_labs == 0
                or snap.anywhere("automation-science-pack") < FIRST_PACKS):
        # 「만들 수 있는가」를 손으로만 묻지 않는다. 재료가 창고에 있으면
        # 꺼내오면 된다 - 그것이 루틴인 이유다. 실측(2026-09-18): 창고에
        # 철판 3,979개를 쌓아두고 기어를 «한 개도» 만든 적이 없었다.
        jobs.append(Job(
            f"빨간 과학팩 {FIRST_PACKS}개를 만들어 랩에 넣겠습니다. "
            f"이 열 개가 automation 연구를 열고, 그 하나가 벨트도 전기 "
            f"채굴기도 터렛도 전부 엽니다.",
            key="first-packs", routine="packs", at=lab))

    # A lab is the gate to everything past the trigger technologies, and
    # crafting one is itself what unlocks the red science pack recipe.
    if snap.knows("electronics") and snap.knows("steam-power"):
        if snap.anywhere("lab") < 1 and not snap.building("lab"):
            if snap.can_make("lab"):
                jobs.append(Job("랩을 제작합니다.", key="craft:lab",
                                steps=[("craft", {"recipe": "lab", "count": 1})]))
            elif snap.can_make("electronic-circuit", 10):
                jobs.append(Job("랩에 쓸 전자회로를 만듭니다.", key="craft:circuit",
                                steps=[("craft", {"recipe": "electronic-circuit", "count": 10})]))
        elif snap.anywhere("lab") >= 1 and not snap.building("lab"):
            # 랩은 조립 구역에 선다. 「내가 선 자리 옆」에 놓으면 랩이
            # 사람을 따라다니고, 그러면 조립기도 과학팩도 따라 흩어진다.
            # 전기가 닿는 곳이어야 하는 것도 랩이 구역을 갖는 이유다.
            seat = craft_seat(snap.craft, 1) if snap.craft else {
                "x": snap.x + 4, "y": snap.y - 4}
            jobs.append(Job("조립 구역에 랩을 설치합니다.", key="build:lab", steps=[
                ("build", {"name": "lab", **seat, "snap": True})
            ]))
        elif snap.building("lab") and not snap.powered:
            # «기관이 서 있는가»가 아니라 «전기가 흐르는가». 죽은 발전소를
            # 발전소로 세는 바람에 새로 짓지 않고 그대로 멈춰 있었다.
            jobs.append(Job("랩을 돌리려면 전력이 필요합니다.", key="power", routine="power"))

    # --- feed the smelting loop ------------------------------------------
    if snap.have("coal") < FURNACE_FUEL:
        spot = snap.ore("coal")
        if spot:
            jobs.append(Job("연료가 없습니다. 석탄 캐러 갑니다.", key="gather:coal",
                            steps=[("mine", {**spot, "count": 10})]))

    if snap.have("iron-plate") < PLATES_FOR_TOOLS:
        if snap.have("iron-ore") < SMELT_BATCH:
            spot = snap.ore("iron-ore")
            if spot:
                jobs.append(Job("철광석 캐러 갑니다.", key="gather:iron-ore",
                                steps=[("mine", {**spot, "count": SMELT_BATCH})]))
        elif not snap.starving:
            # 굶고 있으면 제련을 «접는다».
            #
            # 실측(181분째): 채굴기 28대 중 도는 것 0, 화로 27대 중 0.
            # 연료 없이 선 채굴기가 열일곱인데 상자에 석탄이 324개 있었다.
            # 요원 다섯은 석탄을 손에 들고도 사다리가 시키는 제련만 반복했다.
            #
            # 화로에 한 줌씩 넣는 것은 그 화로 한 대를 잠깐 살릴 뿐이다.
            # 그 사이 채굴기 열일곱이 계속 서 있으면 다음 줌이 없다.
            # 되살리는 일이 새로 넣는 일보다 먼저다.
            #
            # Keyed by the furnace, not by the agent: two agents stuffing one
            # furnace and both waiting for its output is not teamwork. 화로가
            # 여럿이면 일도 여럿이라, 각자 빈 화로를 집어간다.
            for spot in furnaces:
                (by_hand if drill_first else jobs).append(
                    Job("화로에 석탄과 철광석을 넣고 제련합니다.",
                        key=f"smelt:{spot['x']:.0f},{spot['y']:.0f}",
                        needs={"coal": FURNACE_FUEL, "iron-ore": SMELT_BATCH},
                        steps=[
                            ("insert", {"name": "coal", "count": FURNACE_FUEL, **spot}),
                            ("insert", {"name": "iron-ore", "count": SMELT_BATCH, **spot}),
                            ("wait", {"ticks": 60 * 40}),
                            ("take", {"name": "iron-plate", "count": SMELT_BATCH, **spot}),
                        ]))

    # 세워놓고 잊은 채굴기부터 되살린다. 상자 하나면 다시 도는 기계를
    # 두고 새 채굴기를 놓는 것은 철판 낭비다.
    for drill in orphan_drills(snap):
        jobs.append(Job(
            f"({drill['x']:.0f},{drill['y']:.0f}) 채굴기에 출구 상자가 없습니다. 달아주겠습니다.",
            key=f"rescue:{drill['x']:.0f},{drill['y']:.0f}",
            routine="rescue", at=drill, needs={CHEST: 1}))

    # --- mechanise: a drill beats hands ----------------------------------
    # A drill costs iron *and* stone (through the furnace in its recipe). Asking
    # the game whether it is affordable is the difference between building one
    # and announcing it forever while the craft fails.
    if snap.have(DRILL) >= 1 or (snap.can_make(DRILL) and snap.can_make(CHEST)):
        # Own patch first, then whatever else still lacks a drill. 한 광맥에
        # 한 대씩만 놓으면 화로 스물셋을 드릴 넷이 먹여야 한다.
        # 상한은 «녹이는» 채굴기에 건다. 석탄은 제 몫을 따로 받는다.
        #
        # 앞서 비율에서 석탄을 뺐는데, 정작 여유를 재는 여기가 총량을
        # 쓰고 있었다. 규칙을 반만 옮긴 셈이다 - 옮기다 빠뜨린 것은
        # 없어진 것이고, 이 저장소가 여러 번 치른 값이다.
        #
        # 실측(새 판 45분째): 화로 5대, 선 채굴기 4대 «전부 석탄»,
        # 가방 속 채굴기 11대. 총량으로 재니 여유가 1이라, 화로 다섯이
        # 빈 채로 기다리는데 철 채굴기를 한 대밖에 못 놓았다.
        already = rigs_by_ore(snap).get("coal", 0)
        room = drill_target(snap, crew) - max(0, drills - already)

        # 석탄이 먼저다. 그리고 석탄에는 «자리를 따로 떼어둔다».
        #
        # 실측(41분째): 채굴기 여섯 대가 돌 2, 구리 3, 철 1 이었다.
        # 석탄은 한 대도 없었고 상자 속 석탄도 0 이었다. 그래서 넷이
        # 돌아가며 "연료가 없습니다. 석탄 캐러 갑니다"만 하고 있었다.
        #
        # 예산을 먼저 온 광맥이 다 써버렸기 때문이다. 그런데 석탄은
        # 광석 하나가 아니라 «모든 것의 연료»다. 석탄이 없으면 화로도
        # 채굴기도 인서터도 전부 선다. 사람이 손으로 캐서 열여덟 대를
        # 먹이는 것은 일이 아니라 형벌이다.
        #
        # 그래서 석탄 채굴기가 한 대도 없으면 상한을 한 대 넘겨서라도
        # 세운다. 다른 광맥은 없어도 느려질 뿐이지만 석탄은 없으면 멈춘다.
        known = _drill_fields(snap)
        # 모를 때는 밀어붙이지 않는다. 「없다」와 「아직 모른다」는 다르고,
        # 모른다고 상한을 넘기면 상한이 없는 것과 같아진다.
        coal_rigs = sum(int(one.get("count") or 1)
                        for one in known if one.get("ore") == "coal")
        # 모르면 「넉넉하다」로 친다. 모른다고 상한을 넘기면 상한이 없는
        # 것과 같아진다.
        # 몇 대면 되는지는 «태우는 입»이 정한다. 넷이라는 상수는 스물여덟
        # 대짜리 판에서 나온 수였고, 그 판에서도 화로를 안 세고 나온 수였다.
        #
        # 그리고 «지금» 선 입이 아니라 «세우려는» 입을 센다.
        #
        # 사용자: "석탄쪽에 채굴기를 최대한으로 효율적으로 배치해봐."
        #
        # 지금 선 것만 세면 연료는 언제나 한 걸음 늦는다 - 화로를 열 대
        # 더 세운 다음에야 석탄이 모자란 걸 알고, 그 사이 열 대가 굶는다.
        # 버너 시대의 죽음은 언제나 그 모양이었다: 연료가 끊기면 석탄
        # 채굴기도 멈추고, 멈추면 연료를 못 캐고, 못 캐면 되돌아올 수 없다.
        #
        # 상한이 없어지는 것은 아니다. drill_target 과 furnace_target 이
        # 이미 공해 여유로 깎인 수를 준다 - 둥지가 가까우면 목표가 작아지고
        # 석탄도 따라서 작아진다.
        want_coal = coal_rigs_needed(
            max(0, drill_target(snap, crew) - coal_rigs),
            furnace_target(snap, crew))
        digs_coal = (not known) or coal_rigs >= want_coal

        # 석탄은 «한 대로 충분하지 않다».
        #
        # 사용자: "석탄도 2개밖에 채굴기가 안굴러가네"
        #
        # 맞다. 실측(135분째)에 채굴기 스물여덟 대 중 열일곱이 연료 없이
        # 서 있었다. 석탄 채굴기는 둘뿐이었고, 그 둘이 캐는 양으로는
        # 스물여덟 대와 화로 스물일곱 대를 못 먹인다.
        #
        # 그리고 버너 시대의 죽음은 언제나 같은 모양이다 - 연료가 끊기면
        # 석탄 채굴기도 멈추고, 멈추면 연료를 못 캐고, 못 캐니 영영 안 산다.
        # 다른 광맥은 모자라면 느려지지만 석탄은 모자라면 «되돌아올 수 없다».
        #
        # 그러니 석탄은 세어서 채운다. 버너 채굴기 하나가 초당 0.25개를
        # 캐고 태우는 것은 0.0375개다. 제 몫의 일곱 배를 남기는 셈이라
        # 넷이면 스물여덟 대를 먹인다.
        if not digs_coal and snap.ore("coal"):
            focus = "coal"
            room = max(room, want_coal - coal_rigs)
        order = [o for o in FOCUS_ORDER if o != focus]
        seat = 0
        for ore in [focus] + order:
            # 석탄은 제 몫을 다 채우면 «그만» 판다.
            #
            # 석탄을 제련 예산에서 빼면서(77743a0) 석탄의 상한까지 같이
            # 없앴다. room 이 석탄을 안 세니 아무리 세워도 자리가 남고,
            # 석탄밭이 제일 가까우면 매번 석탄이 먼저 집힌다.
            #
            # 실측(새 판 74분째): 석탄 20대, 철 1대, 구리 1대. 화로는 다섯
            # 그대로고 랩은 0이었다. 필요한 석탄 채굴기는 «넷»이었다.
            #
            # 예산에서 빼는 것과 상한을 없애는 것은 다른 일이다. 빼면서
            # 제 상한을 같이 줘야 한다 - 안 그러면 그 항목만 무한이 된다.
            if ore == "coal" and coal_rigs >= want_coal:
                continue
            if snap.ore(ore) and seat < room:
                jobs.append(Job(f"{ore} 자동 채굴을 준비하겠습니다.",
                                key=f"automate:{ore}:{drills + seat}",
                                routine="automate", ore=ore,
                                needs={DRILL: 1, CHEST: 1, "coal": DRILL_FUEL}))
                seat += 1
    elif snap.have("iron-plate") >= PLATES_FOR_TOOLS and not snap.can_make("stone-furnace"):
        spot = snap.ore("stone")
        if spot:
            jobs.append(Job("채굴기를 만들려면 돌이 더 필요합니다.", key="gather:stone",
                            steps=[("mine", {**spot, "count": 10})]))

    # --- climb the tech tree ---------------------------------------------
    # This is what "there is nothing to do" used to mean: stockpiling ore
    # forever while every machine stayed locked behind research nobody started.
    for tech, ore, plate in SMELT_FOR_TECH:
        if snap.knows(tech):
            continue
        if snap.have(ore) < ORE_BATCH:
            spot = snap.ore(ore)
            if spot:
                jobs.append(Job(f"{tech} 연구를 열려면 {ore}가 필요합니다.",
                                key=f"gather:{ore}",
                                steps=[("mine", {**spot, "count": ORE_BATCH,
                                                 "search_radius": 10,
                                                 "timeout_ticks": 60 * 60 * 5})]))
        elif furnace and snap.have("coal") >= FURNACE_FUEL:
            jobs.append(Job(f"{plate}를 제련합니다. ({tech} 연구가 열립니다)",
                            key=f"smelt:{plate}",
                            needs={"coal": FURNACE_FUEL, ore: ORE_BATCH},
                            steps=[
                                ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
                                ("insert", {"name": ore, "count": ORE_BATCH, **furnace}),
                                ("wait", {"ticks": 60 * 45}),
                                ("take", {"name": plate, "count": ORE_BATCH, **furnace}),
                            ]))

    # 공급량만큼 화로를 세운다. 줄을 서는 시간도, 노는 화로도 둘 다 손해다.
    # spots 는 MAX_SPOTS 에서 잘리고, 오래된 모드는 아예 주지 않는다. 몇
    # 개가 서 있는지는 count 가 안다 - 이걸 안 보면 이미 세운 화로를 못 세고
    # 영원히 하나씩 더 만든다.
    standing = snap.buildings.get("stone-furnace", {}).get("count", len(furnaces))
    want = furnace_target(snap, crew)
    if furnace and standing < want:
        nth = standing
        if snap.anywhere("stone-furnace") >= 1:
            # 기준점은 게임 쪽에 적어둔 제련 블록의 모서리다. 누가 묻든
            # 같은 값이라야 화로가 줄을 선다.
            #
            # 예전에는 「내 주변 화로 여덟 대의 평균」이었다. spots 는 부르는
            # 사람 기준으로 가까운 것 여덟 개만 주므로, 사람이 움직일 때마다
            # 기준이 흔들렸고 화로가 대각선으로 흩뿌려졌다. 그 전에는 「나에게
            # 가장 가까운 화로」였고, 그때는 한 줄로 274타일까지 갔다.
            # 비어 있는 첫 자리를 «물어서» 받은 값이다. 세는 것과 비어
            # 있는가는 다른 질문이고, 어긋나게 선 한 채가 번호를 밀면
            # 이미 찬 자리에 또 놓으려 든다.
            corner = snap.smelter or {
                "x": min(f["x"] for f in furnaces),
                "y": min(f["y"] for f in furnaces)}
            # 빈 자리가 없으면 «안 놓는다».
            #
            # 예전에는 없으면 번호로 계산해서 그냥 놓았다. 자리표가 마흔여덟
            # 칸인데 화로가 백여섯 대가 된 경로가 바로 이 한 줄이다. 그리고
            # 남는 쉰여덟 대는 광석을 못 받아 서 있으면서 연료만 태웠다.
            #
            # 자리가 없다는 것은 자리를 새로 지어내라는 뜻이 아니라 이미
            # 충분하다는 뜻이다. 노란 벨트 한 줄이 먹일 수 있는 화로가
            # 마흔여덟 대다.
            # 모자란 만큼 «한꺼번에» 내놓는다. 한 대씩 내놓으면 여섯 명에
            # 일감이 하나다.
            #
            # 사용자: "인원들 대기가 너무 심해졌는데"
            #
            # 실측(새 판 4분째): 여섯 중 다섯이 「반장의 지시를 기다립니다」.
            # 화로는 두 대, 목표는 여섯. 네 대가 모자란데 일감은 하나였다.
            # `nth = standing` 으로 «다음 한 대»만 내놓았기 때문이다.
            #
            # 그리고 그 하나가 병목이기도 했다. 광석은 쌓여 있고(구리 110개)
            # 녹일 자리가 둘뿐이라 철판이 안 나오고, 철판이 안 나오니
            # 기어도 채굴기도 벨트도 못 만든다. 모두가 그 두 대를 기다렸다.
            #
            # 상한은 그대로다 - `want` 가 이미 자리표와 공해 여유로 깎여
            # 있다. 여기서 푸는 것은 「몇 대를 지을까」가 아니라 「몇 명이
            # 동시에 지을까」다.
            # 자리는 «물어서 받은 것»만 쓴다.
            #
            # 여기 있던 것은 i=0 만 물어보고 i>=1 은 번호로 세어 잡는
            # 반쪽이었다. 그래서 둘이 틀어졌다:
            #
            #   * 자리표의 1, 2번이 나무로 막혀 있으면 물어본 답은 3번인데
            #     번호로 센 답은 2번이다. 두 일감이 같은 타일을 가리킨다.
            #     열쇠가 달라 중복 제거에도 안 걸린다.
            #   * 「빈 자리가 없으면 안 놓는다」가 사라졌다. 자리표는 48칸인데
            #     `furnace_seat` 은 번호를 주면 «언제나» 좌표를 돌려주므로
            #     49번째가 구역 밖에 선다. 그러면 제자리가 아니라고 걷고,
            #     걷으면 또 세운다.
            #
            # 화로 백여섯 대가 자리표 마흔여덟 칸에 선 적이 있다. 그때
            # 고친 규칙이 이 루프를 만들면서 유실됐다.
            #
            # 자리표는 이미 빈 자리를 열두 칸까지 알고 있다(zones.lua 의
            # `next_seat`). 아는 것을 받아 쓰면 지어낼 이유가 없다.
            seats = list(snap.furnace_seats or [])
            if not seats and snap.next_furnace:
                seats = [snap.next_furnace]
            if not seats and not snap.smelter:
                # 제련 구역이 아직 없는 초반에만 번호로 자리를 잡는다.
                seats = [furnace_seat(corner, nth + i)
                         for i in range(min(want - standing, max(1, crew)))]
            hands = min(want - standing, max(1, crew), len(seats))
            for i in range(hands):
                seat = seats[i]
                if not seat:
                    break
                jobs.append(Job(f"화로를 하나 더 놓겠습니다 ({nth + i + 1}번째).",
                                key="furnace:%.0f,%.0f" % (seat["x"], seat["y"]),
                                steps=[("build", {"name": "stone-furnace",
                                                  "x": seat["x"], "y": seat["y"],
                                                  "snap": True})]))
        elif snap.can_make("stone-furnace"):
            jobs.append(Job("화로를 하나 더 만들겠습니다.", key=f"furnace:{nth}",
                            needs={"stone": 5},
                            steps=[("craft", {"recipe": "stone-furnace", "count": 1})]))

    # --- keep patches stocked, starting with this agent's own ------------
    # 공장은 끊임없이 돌아야 하고, 그러려면 광석이 끊임없이 들어와야 한다.
    # 예전에는 서른 개를 채우면 멈췄다 - 그래서 여섯 명 중 셋이 가방에
    # 광석을 안고 서 있었다. 화로가 놀고 있으면 더 캔다.
    hungry = snap.have("coal") < FURNACE_FUEL * 4
    hands_free = digs_itself(snap)
    for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
        spot = snap.ore(ore)
        if not spot:
            continue
        if snap.have(ore) >= STOCKPILE and not (ore == "coal" and hungry):
            continue
        # 채굴기가 할 수 있는 일을 손으로 하지 않는다.
        if hands_free:
            continue
        jobs.append(Job(f"{ore}를 더 캐 오겠습니다.", key=f"stock:{ore}", steps=[
            ("mine", {**spot, "count": STOCKPILE, "search_radius": 10,
                      "timeout_ticks": 60 * 60 * 5})
        ]))

    # Two jobs with the same key would be one job as far as the crew is
    # concerned: claiming the first silently hides the second. Keep the
    # higher-priority one.
    # 미뤄둔 손일은 «맨 뒤»로. 채굴기를 세우고 나서 해도 되는 일이다.
    jobs.extend(by_hand)

    unique, seen = [], set()
    for job in jobs:
        if job.key in seen:
            continue
        seen.add(job.key)
        unique.append(job)
    return in_hand_first(unique, snap)



def drills_first(pool: list, holding: int) -> list:
    """가방에 채굴기가 놀고 있으면 «세우는 일»을 앞으로 당긴다.

    사용자: "반장이 채굴기 심시티부터 한번 진행해봐"

    실측(새 판 51분째):

        땅에 선 채굴기    3대
        가방 속 채굴기   11대  (charlie 8, delta 2, bravo 1)
        반장이 연 자리    automate:coal / iron-ore / copper-ore / stone
        실제로 한 일      다섯 전원 벨트·유통 구역

    사다리 일감은 물류 일감 «뒤»에 붙는다. 그래서 벨트가 한 칸이라도
    모자라면 채굴기는 영영 차례가 안 온다. 그리고 물류는 언제나 한 칸쯤
    모자라다.

    가방 속 채굴기는 아무것도 안 캔다. 그리고 캘 것이 없으면 벨트도
    나를 것이 없다 - 순서가 거꾸로다.

    «당기기만» 한다. 빼지 않으므로 물류는 그 다음 차례에 그대로 있고,
    가방이 비면(다 세우면) 저절로 평소 순서로 돌아간다.
    """
    if holding <= 0:
        return pool
    # 파이썬 정렬은 안정적이다. 같은 무리 안의 순서는 그대로 남는다.
    return sorted(pool, key=lambda j: 0 if j.key.startswith("automate:") else 1)

# 놓기만 하면 되는 기계. 이것들은 만드는 값이 아니라 «걸어가는 값»만 든다.
PORTABLE = (DRILL, "stone-furnace", CHEST, "lab", "boiler", "steam-engine",
            "offshore-pump", "assembling-machine-1")


def _just_placing(job: Job, snap: Snapshot) -> bool:
    """이 일감이 「이미 손에 든 기계를 놓기만 하는 것」인가.

    캐거나 만드는 걸음이 하나라도 섞여 있으면 아니다 - 그건 값이 다른
    일이다.
    """
    # 루틴도 «놓는 일»이다.
    #
    # 여기 `if not job.steps: return False` 만 있었다. 그런데 채굴기를
    # 놓는 일은 걸음 목록이 아니라 루틴(`automate`)이라 걸음이 없다.
    # 그래서 앞으로 당겨지지 않았고, 실측이 그 값을 보여줬다(156분째):
    #
    #     땅에 선 채굴기  4대        가방에 든 채굴기  6대
    #     목표 9대                   자리표의 빈 자리 16칸
    #
    # 「손에 든 기계를 먼저 놓는다」를 넣으면서 걸음이 있는 것만 봤다.
    # 규칙을 넣을 때 그 규칙이 닿지 않는 자리를 같이 봐야 한다.
    #
    # 루틴은 무엇을 놓는지를 `needs` 로 말한다. 그것이 들고 있는
    # 기계뿐이면 이것도 「놓기만 하는 일」이다.
    if job.routine:
        wants = [k for k in (job.needs or {})]
        if not wants or any(k not in PORTABLE for k in wants):
            return False
        return all(snap.have(k) >= n for k, n in job.needs.items())

    if not job.steps:
        return False
    placed = None
    for verb, args in job.steps:
        if verb not in ("build", "place"):
            return False
        name = (args or {}).get("name")
        if name not in PORTABLE:
            return False
        placed = name
    return placed is not None and snap.have(placed) >= 1


def in_hand_first(jobs: list[Job], snap: Snapshot) -> list[Job]:
    """손에 든 기계를 놓는 일을 맨 앞으로 올린다.

    사용자: "얘네 아직도 손으로캐고있네"

    실측(37분째). 땅과 가방을 같이 재보니 이랬다:

        땅     채굴기 2   화로 1   벨트 0
        가방   채굴기 2   화로 3   벨트 38   상자 23
               구리광석 837   철광석 177   석탄 256

    **땅에 선 것보다 가방에 든 것이 많았다.** 완성된 채굴기 두 대를 주머니에
    넣고 다니면서 다섯이 손으로 광석을 캐고 있었다.

    일감 목록의 «순서» 때문이다. 공유 설비 -> 빨간 과학 -> 전력 -> 채굴기
    순으로 늘어서 있어서, 사다리가 「전력 공급」 칸에 오르자 다섯 명이
    전부 앞쪽 일감에 배차됐다. 채굴기 일감은 목록에 «있었지만» 차례가
    안 왔다.

    그런데 손에 든 기계를 놓는 일은 걸어가기만 하면 된다. 만드는 일보다
    언제나 싸고, 놓는 순간부터 그 기계가 사람 대신 캔다. 사람이 한 시간
    캐는 것보다 채굴기 한 대를 놓는 십 초가 낫다.

    순서만 바꾼다. 목록에서 빼거나 더하지 않는다 - 무엇을 할지는 여전히
    위쪽 규칙들이 정하고, 여기는 «같은 일들 중 무엇이 먼저인가»만 본다.
    """
    ready = [j for j in jobs if _just_placing(j, snap)]
    if not ready:
        return jobs
    rest = [j for j in jobs if not _just_placing(j, snap)]
    return ready + rest


def missing_item(kind: str, error: str, params: dict | None = None) -> str | None:
    """실패 메시지에서 «무엇이 없었는지»를 뽑아낸다.

    부탁은 여기서 시작한다. 짐작으로 «아마 석탄이 없겠지»라고 붙이는 부탁은
    틀릴 수 있지만, 방금 실제로 시도했다가 실패한 것은 틀릴 수가 없다.
    """
    text = (error or "").strip()
    params = params or {}

    # "no coal to insert" / "no iron-chest in inventory"
    for tail in (" to insert", " in inventory"):
        if text.startswith("no ") and text.endswith(tail):
            return text[3: -len(tail)].strip() or None

    # "nothing to give: no coal"
    if text.startswith("nothing to give: no "):
        return text[len("nothing to give: no "):].strip() or None

    # 광맥이 말라버린 경우. 어디에 있었는지는 params가 안다.
    if kind == "mine" and text.startswith("no resource near"):
        return params.get("name") or None

    return None


# 사다리의 단마다 «이걸 손에 넣으면 올라간다»는 물건이 있다. 그 물건 하나만
# 정해주면 나머지는 게임의 레시피 그래프가 알려준다.
STAGE_TARGET = {
    "furnace": ("stone-furnace", 1),
    "lab": ("lab", 1),
    "power": ("steam-engine", ENGINES_PER_BOILER),
    "red-science": ("automation-science-pack", 10),
    "assembler": ("assembling-machine-1", 1),
    "belts": ("transport-belt", 20),
}


def chain_job(answer: dict, target: str, furnace: dict | None) -> Job | None:
    """게임이 «지금 이것부터»라고 답한 것을 실제 작업으로 옮긴다.

    answer 는 mod 의 plan_item 이 돌려준 것이다. steps 는 깊은 것부터 쌓여
    있으므로 첫 번째가 지금 당장 할 수 있는 일이다. 아무것도 못 하면
    mine 에 적힌 것을 캐러 간다 - 사슬의 맨 밑이 땅이라는 뜻이다.
    """
    if not isinstance(answer, dict) or answer.get("error"):
        return None

    # 창고에 있는 것부터 꺼낸다. 이미 캔 것을 두고 다시 캐러 가는 것이
    # 가장 비싼 낭비다 - 상자에 철판 819장이 있는데 계획은 「철광석을 캐라」
    # 로 끝나고 있었다.
    errands = _as_rows(answer.get("fetch"))
    if errands:
        head = errands[0]
        listed = ", ".join(f"{e['name']} {int(e['count'])}개" for e in errands[:3])
        return Job(f"{target}에 필요한 {listed}은(는) 창고에 있습니다. 꺼내오겠습니다.",
                   key=f"fetch:{target}:{head['x']:.0f},{head['y']:.0f}",
                   steps=[("take", {"name": e["name"], "count": int(e["count"]),
                                    "x": e["x"], "y": e["y"]})
                          for e in errands[:3]],
                   at={"x": head["x"], "y": head["y"]})

    steps = _as_rows(answer.get("steps"))
    for step in steps:
        name = step.get("name")
        count = int(step.get("count") or 1)
        if step.get("action") == "smelt":
            if not furnace:
                continue
            # 넣고 바로 떠난다. 예전에는 여기에 wait 와 take 가 붙어 있어서,
            # 여섯 명 중 다섯이 각자 화로 앞에 서서 1분씩 아무것도 안 했다.
            # 사람은 광석을 넣고 딴 일을 하러 간다. 다 녹은 것은 나중에
            # 누구든 지나가는 사람이 거둬간다.
            return Job(f"{target}을(를) 만들려면 {name}이(가) 필요합니다. 화로에 넣겠습니다.",
                       key=f"chain:smelt:{name}@{furnace['x']:.0f},{furnace['y']:.0f}",
                       needs={"coal": FURNACE_FUEL},
                       steps=[
                           ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
                           ("insert", {"name": step.get("input") or _ore_for(name),
                                       "count": int(step.get("input_count") or count),
                                       **furnace}),
                       ])
        if step.get("hand"):
            return Job(f"{target}을(를) 만들려면 {name} {count}개가 필요합니다. 제작하겠습니다.",
                       key=f"chain:craft:{name}",
                       steps=[("craft", {"recipe": step.get("recipe") or name,
                                         "count": count})])

    return None


def _smelt_ticks(step: dict, count: int) -> int:
    seconds = float(step.get("seconds") or 0) or (count * 3.2)
    return int(60 * (seconds + SMELT_MARGIN))


def _ore_for(plate: str) -> str:
    """원료 이름이 안 왔을 때의 마지막 수단.

    보통은 게임이 step.input 으로 알려준다. 이 표는 옛 모드가 붙어 있을 때만
    쓰이고, 돌벽돌처럼 «돌 2개에 벽돌 1개»인 레시피에서는 개수를 못 맞춘다.
    """
    return {"iron-plate": "iron-ore", "copper-plate": "copper-ore",
            "stone-brick": "stone"}.get(plate, plate)


def _as_rows(value: Any) -> list[dict]:
    """Lua 의 빈 테이블은 {} 로 오고, 채워진 배열은 리스트로 온다."""
    if isinstance(value, dict):
        return list(value.values())
    return value or []


def next_goal(snap: Snapshot, focus: str = "iron-ore",
              blocked: frozenset[str] = frozenset(),
              taken: frozenset[str] = frozenset(),
              crew: int = 1) -> Job | None:
    """The best job this agent may take.

    `blocked` is what has just failed for it - re-proposing that is how one
    unreachable furnace fills the chat with the same line forever. `taken` is
    what the rest of the crew is already doing.
    """
    for job in plan(snap, focus, crew):
        if job.key in taken:
            continue
        # Failures are recorded by task type ("mine", "insert", ...) as well as
        # by job key, because that is what the game reports back.
        if job.key in blocked or (job.routine or "") in blocked:
            continue
        if job.steps and job.steps[0][0] in blocked:
            continue
        return job
    return None

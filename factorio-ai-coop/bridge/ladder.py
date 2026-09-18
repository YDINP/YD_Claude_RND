"""무엇을 할 것인가 - 순수 계산.

스냅샷 하나를 받아 «지금 가장 값어치 있는 일»을 순서대로 내놓는다.
사다리(광석 -> 판금 -> 부품 -> 과학팩 -> 연구)를 아는 유일한 곳이다.
"""

from __future__ import annotations

import math

from typing import Any

from settings import (BURNER_DRILLS, CHEST, DRILL, FIRST_PACKS, DRILLS_PER_AGENT, DRILLS_PER_FURNACE, DRILL_FUEL,
                      ENGINES_PER_BOILER, FOCUS_ORDER, FURNACES_PER_DRILL,
                      FURNACE_FUEL, MAX_FURNACES, ORE_BATCH, PLATES_FOR_TOOLS,
                      SMELT_BATCH, SMELT_FOR_TECH, SMELT_MARGIN, STOCKPILE)
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


def drill_target(snap: Snapshot, crew: int) -> int:
    """채굴기를 몇 대까지 세울 것인가.

    화로가 요구하는 만큼 세우되, 손으로 연료를 넣어줄 수 있는 만큼만.
    드릴 4대로 화로 23대를 채우려던 것이 지금까지의 상태였다.
    """
    furnaces = snap.buildings.get("stone-furnace", {}).get("count", 0)
    wanted = math.ceil(furnaces * DRILLS_PER_FURNACE)
    # 버너 시대에는 상한이 있다. 숙련자들의 권장치는 마흔 대 안팎인데 우리는
    # 161대를 세우고도 과학팩이 0개였다. 너비는 사슬을 대신하지 못한다.
    if not snap.knows("electric-mining-drill"):
        wanted = min(wanted, BURNER_DRILLS)
    return max(len(FOCUS_ORDER), min(crew * DRILLS_PER_AGENT, wanted))


def furnace_target(snap: Snapshot, crew: int) -> int:
    """화로를 몇 대까지 세울 것인가.

    손으로 나르는 동안에는 사람 수가 공급량이고, 채굴기가 돌기 시작하면
    채굴기 수가 공급량이다. 둘 중 큰 쪽을 따라간다.
    """
    drills = snap.buildings.get(DRILL, {}).get("count", 0)
    from_drills = math.ceil(drills * FURNACES_PER_DRILL)
    return max(1, min(MAX_FURNACES, max(crew, from_drills)))


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
        else:
            # Keyed by the furnace, not by the agent: two agents stuffing one
            # furnace and both waiting for its output is not teamwork. 화로가
            # 여럿이면 일도 여럿이라, 각자 빈 화로를 집어간다.
            for spot in furnaces:
                jobs.append(Job("화로에 석탄과 철광석을 넣고 제련합니다.",
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
        room = drill_target(snap, crew) - drills
        seat = 0
        for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
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
            seat = snap.next_furnace or furnace_seat(corner, nth)
            jobs.append(Job(f"화로를 하나 더 놓겠습니다 ({nth + 1}번째).",
                            key=f"furnace:{nth}", steps=[
                                ("build", {"name": "stone-furnace",
                                           **seat, "snap": True})]))
        elif snap.can_make("stone-furnace"):
            jobs.append(Job("화로를 하나 더 만들겠습니다.", key=f"furnace:{nth}",
                            needs={"stone": 5},
                            steps=[("craft", {"recipe": "stone-furnace", "count": 1})]))

    # --- keep patches stocked, starting with this agent's own ------------
    # 공장은 끊임없이 돌아야 하고, 그러려면 광석이 끊임없이 들어와야 한다.
    # 예전에는 서른 개를 채우면 멈췄다 - 그래서 여섯 명 중 셋이 가방에
    # 광석을 안고 서 있었다. 화로가 놀고 있으면 더 캔다.
    hungry = snap.have("coal") < FURNACE_FUEL * 4
    for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
        spot = snap.ore(ore)
        if not spot:
            continue
        if snap.have(ore) >= STOCKPILE and not (ore == "coal" and hungry):
            continue
        jobs.append(Job(f"{ore}를 더 캐 오겠습니다.", key=f"stock:{ore}", steps=[
            ("mine", {**spot, "count": STOCKPILE, "search_radius": 10,
                      "timeout_ticks": 60 * 60 * 5})
        ]))

    # Two jobs with the same key would be one job as far as the crew is
    # concerned: claiming the first silently hides the second. Keep the
    # higher-priority one.
    unique, seen = [], set()
    for job in jobs:
        if job.key in seen:
            continue
        seen.add(job.key)
        unique.append(job)
    return unique


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

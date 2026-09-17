"""The crew: several AI characters listening to one human's orders in chat.

Layers, deliberately separated:

  mission.py      pure: the goal ladder and the request board
  plan/next_goal  pure: a world snapshot -> what is worth doing, best first
  brain.delegate  the crew chief: reads what the human wrote and splits it
  Crew            the only part that touches the game

Nothing here reads the human's words by matching keywords any more. A table of
words could not tell "stop" from "the drills have stopped", and a report of a
problem would halt the whole crew. Sentences go to the part that can read them.

Keeping the pure parts pure means the interesting logic is testable without a
running Factorio server, which matters because it is exactly the logic that is
hard to debug through a game window.

    python bridge/agent.py                  # two agents, working on their own
    python bridge/agent.py --agents 4       # four of them, one per resource
    python bridge/agent.py --manual         # wait for orders instead
    python bridge/agent.py --observer NAME  # put that player in the observer seat
"""

from __future__ import annotations

import argparse
import math
import queue
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import brain
import mission
from client import Agent, AIBridge, RconError, TaskFailed

Step = tuple[str, dict]
Intent = tuple[str, dict]

# Call signs are ASCII so they survive Lua, JSON and chat without surprises.
# "1번" addressing exists for anyone who would rather not type them.
CALL_SIGNS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]

DRILL = "burner-mining-drill"
CHEST = "iron-chest"
DRILL_FUEL = 10


@dataclass
class Snapshot:
    tick: int = 0
    x: float = 0.0
    y: float = 0.0
    items: dict[str, int] = field(default_factory=dict)
    craftable: dict[str, int] = field(default_factory=dict)
    buildings: dict[str, dict] = field(default_factory=dict)
    resources: dict[str, dict] = field(default_factory=dict)
    humans: list[dict] = field(default_factory=list)
    mates: list[dict] = field(default_factory=list)
    researched: set[str] = field(default_factory=set)
    researching: str | None = None
    # 기관이 서 있는 것과 전기가 흐르는 것은 다르다. 물 없는 보일러에 물린
    # 기관은 밖에서 보면 멀쩡한 발전소와 똑같이 생겼다.
    powered: bool = False

    def have(self, item: str) -> int:
        return self.items.get(item, 0)

    def can_make(self, recipe: str, count: int = 1) -> bool:
        """Whether the game says this is hand-craftable right now.

        Asked rather than derived: the recipe tree, the intermediates and the
        research state all live in the game, and guessing at them is how an
        agent ends up announcing a build it cannot afford.
        """
        return self.craftable.get(recipe, 0) >= count

    def ore(self, name: str) -> dict | None:
        found = self.resources.get(name)
        return found.get("nearest") if found else None

    def building(self, name: str) -> dict | None:
        found = self.buildings.get(name)
        return found.get("nearest") if found else None

    def spots(self, name: str) -> list[dict]:
        """이 종류 건물이 서 있는 자리들, 가까운 순.

        가장 가까운 하나만 알면 화로가 셋이어도 넷이 같은 화로 앞에 줄을
        선다. 자리가 여럿이면 각자 자기 화로를 집을 수 있다.
        """
        found = self.buildings.get(name) or {}
        spots = found.get("spots")
        if isinstance(spots, dict):      # Lua 빈 테이블은 {} 로 온다
            spots = list(spots.values())
        if spots:
            return [{"x": p["x"], "y": p["y"]} for p in spots]
        near = found.get("nearest")
        return [near] if near else []

    def knows(self, technology: str) -> bool:
        return technology in self.researched


# ------------------------------------------------------------------ planning

FURNACE_FUEL = 5
SMELT_BATCH = 20
PLATES_FOR_TOOLS = 12   # enough to hand-craft a drill and a chest
STOCKPILE = 30
BACKOFF_SECONDS = 120   # how long a failed kind of work stays off the ladder

# Each agent takes one resource so a crew does not all stand on the same patch.
FOCUS_ORDER = ["iron-ore", "coal", "copper-ore", "stone"]

# 2.0 opens its first technologies with an action rather than science packs:
# ten copper plates smelted opens electronics (circuits, lab, inserters), fifty
# iron plates opens steam power (pipes, boiler, engine, pump). Nothing else can
# start until those two are in, because the lab itself is behind electronics.
SMELT_FOR_TECH = [
    ("electronics", "copper-ore", "copper-plate"),
    ("steam-power", "iron-ore", "iron-plate"),
]
ORE_BATCH = 25


@dataclass
class Job:
    """One piece of work: either a queue of tasks, or a named routine.

    Automation cannot be expressed as a fixed step list - where the chest goes
    depends on what the drill says after it is built - so it is named here and
    carried out by the crew.

    `key` is what makes a crew a crew rather than a crowd. Two agents may not
    hold the same key at once, so the second one moves down the list instead of
    walking to the same ore tile as the first.
    """
    narration: str
    steps: list[Step] = field(default_factory=list)
    routine: str | None = None
    ore: str | None = None
    key: str = ""
    # 이 일이 먹는 재료. 모자라면 동료에게 부탁할 근거가 된다.
    needs: dict[str, int] = field(default_factory=dict)
    # 루틴이 손봐야 할 자리. 어느 채굴기인지 같은 것.
    at: dict | None = None


# 상자가 이 거리 안에 있으면 그 채굴기는 돌보는 사람이 있다고 본다.
# 2x2 채굴기의 산출 타일은 중심에서 1.5타일 안쪽이라 넉넉하게 잡았다.
CHEST_REACH = 2.5


def orphan_drills(snap: Snapshot) -> list[dict]:
    """출구에 상자가 없는 채굴기들.

    상자 없는 채굴기는 광석을 땅바닥에 몇 개 떨구고 그대로 멈춘다. 멀쩡한
    기계가 서 있는 셈이라, 새 채굴기를 놓는 것보다 이쪽을 먼저 고쳐야 한다.
    """
    chests = snap.spots(CHEST)
    orphans = []
    for drill in snap.spots(DRILL):
        near = any((drill["x"] - c["x"]) ** 2 + (drill["y"] - c["y"]) ** 2
                   <= CHEST_REACH ** 2 for c in chests)
        if not near:
            orphans.append(drill)
    return orphans


# 한 사람당 화로 하나까지. 화로는 돌 5개라 싸고, 하나를 넷이 나눠 쓰면
# 셋은 줄을 서서 기다린다 - 초반 제련이 느린 진짜 이유가 이것이다.
MAX_FURNACES = 8

# 버너 채굴기는 0.25 광석/초를 내고 돌 화로는 0.3125 광석/초를 먹는다. 그래서
# 드릴 5대가 화로 4대를 채운다 - 화로를 드릴보다 많이 두면 남는 화로는 그냥
# 논다. 손으로 캐서 넣는 동안에는 사람이 곧 드릴이므로, 화로는 최소한
# 사람 수만큼은 있어야 줄을 안 선다.
FURNACES_PER_DRILL = 4 / 5

# 화로는 2x2지만 전기 화로는 3x3이다. 3타일 간격으로 붙여 놓으면 나중에
# 전기 화로로 못 바꾼다. 4타일이면 그 자리에서 교체된다.
FURNACE_PITCH = 4

# 보일러 60 증기/초 : 증기기관 30 증기/초. 기관을 하나만 붙이면 보일러가
# 만든 증기의 절반을 버리면서 석탄은 전부 태운다.
ENGINES_PER_BOILER = 2

# small-electric-pole 은 7.5타일까지 배선이 닿는다. 여유를 두고 7로 잡는다.
POLE_REACH = 7
# 이보다 멀면 전선을 잇는 것보다 랩을 옮기는 게 싸다.
MAX_POLE_RUN = 12


# 버너 드릴 5대가 돌 화로 4대를 채운다. 뒤집으면 화로 4대에 드릴 5대.
DRILLS_PER_FURNACE = 5 / 4

# 버너 드릴은 석탄을 손으로 넣어줘야 한다. 돌볼 수 있는 것보다 많이 지으면
# 멈춘 기계만 늘어난다 - 한 사람이 셋까지.
DRILLS_PER_AGENT = 3


def drill_target(snap: Snapshot, crew: int) -> int:
    """채굴기를 몇 대까지 세울 것인가.

    화로가 요구하는 만큼 세우되, 손으로 연료를 넣어줄 수 있는 만큼만.
    드릴 4대로 화로 23대를 채우려던 것이 지금까지의 상태였다.
    """
    furnaces = snap.buildings.get("stone-furnace", {}).get("count", 0)
    wanted = math.ceil(furnaces * DRILLS_PER_FURNACE)
    return max(len(FOCUS_ORDER), min(crew * DRILLS_PER_AGENT, wanted))


def furnace_target(snap: Snapshot, crew: int) -> int:
    """화로를 몇 대까지 세울 것인가.

    손으로 나르는 동안에는 사람 수가 공급량이고, 채굴기가 돌기 시작하면
    채굴기 수가 공급량이다. 둘 중 큰 쪽을 따라간다.
    """
    drills = snap.buildings.get(DRILL, {}).get("count", 0)
    from_drills = math.ceil(drills * FURNACES_PER_DRILL)
    return max(1, min(MAX_FURNACES, max(crew, from_drills)))


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
        if snap.have("stone-furnace") >= 1:
            jobs.append(Job("화로를 설치합니다.", key="furnace", steps=[
                ("build", {"name": "stone-furnace", "x": snap.x + 3, "y": snap.y + 3,
                           "snap": True})
            ]))
        elif snap.can_make("stone-furnace"):
            jobs.append(Job("화로를 제작합니다.", key="furnace",
                            steps=[("craft", {"recipe": "stone-furnace", "count": 1})]))
        else:
            spot = snap.ore("stone")
            if spot:
                jobs.append(Job("돌부터 캐서 화로를 만들겠습니다.", key="furnace",
                                steps=[("mine", {**spot, "count": 5})]))

    # A lab is the gate to everything past the trigger technologies, and
    # crafting one is itself what unlocks the red science pack recipe.
    if snap.knows("electronics") and snap.knows("steam-power"):
        if snap.have("lab") < 1 and not snap.building("lab"):
            if snap.can_make("lab"):
                jobs.append(Job("랩을 제작합니다.", key="craft:lab",
                                steps=[("craft", {"recipe": "lab", "count": 1})]))
            elif snap.can_make("electronic-circuit", 10):
                jobs.append(Job("랩에 쓸 전자회로를 만듭니다.", key="craft:circuit",
                                steps=[("craft", {"recipe": "electronic-circuit", "count": 10})]))
        elif snap.have("lab") >= 1 and not snap.building("lab"):
            jobs.append(Job("랩을 설치합니다.", key="build:lab", steps=[
                ("build", {"name": "lab", "x": snap.x + 4, "y": snap.y - 4, "snap": True})
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
        if snap.have("stone-furnace") >= 1:
            jobs.append(Job(f"화로를 하나 더 놓겠습니다 ({nth + 1}번째).",
                            key=f"furnace:{nth}", steps=[
                                ("build", {"name": "stone-furnace",
                                           "x": furnace["x"] + FURNACE_PITCH * (nth + 1),
                                           "y": furnace["y"], "snap": True})]))
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


# 화로가 다 녹이기 전에 꺼내러 가면 광석은 화로 안에 남고 손은 빈 채로
# 돌아온다. 게임이 알려준 시간에 여유를 더해서 기다린다.
SMELT_MARGIN = 8.0

# 화로 하나에 이만큼 쌓였으면 거두러 간다. 두세 개씩 집으러 왔다 갔다 하면
# 걷는 시간이 녹이는 시간보다 길어진다.
HARVEST_MIN = 10

# 화로가 받아주는 것들. 노는 화로에 무엇을 넣을지 고를 때 쓴다.
SMELTABLE = ("iron-ore", "copper-ore", "stone")

# 연구가 걸려 있는지 보는 주기. 매 틱 물어볼 일은 아니지만, 비어 있는 채로
# 오래 두면 랩이 그만큼 논다.
RESEARCH_CHECK = 20.0

# 같은 사람이 같은 말을 이 시간 안에 되풀이하면 삼킨다.
ECHO_QUIET = 60.0


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


# -------------------------------------------------------------------- worker

class Worker:
    """One agent, plus the bookkeeping that belongs to it alone."""

    def __init__(self, handle: Agent, focus: str = "iron-ore") -> None:
        self.handle = handle
        self.name = handle.name
        self.focus = focus
        self.autopilot = True
        self.watching: list[int] = []
        self.said_idle = False
        # One slow job (an LLM call, a build-out) at a time per agent.
        self.slot = threading.Semaphore(1)
        # What has just failed, and until when it stays off the table.
        self.blocked: dict[str, float] = {}
        # The job key this agent currently holds, so the crew can hand the rest
        # of the list to somebody else.
        self.job_key: str | None = None
        # 지금 대신 해주고 있는 부탁과, 그걸 실어나르는 태스크 번호.
        self.errand: tuple[int, object] | None = None

    def snapshot(self, radius: int = 200) -> Snapshot:
        world = self.handle.observe(radius=radius)
        inventory = self.handle.inventory()
        research = self.handle.bridge.research_state()
        try:
            power = self.handle.bridge.power_status(self.name)
        except RconError:
            power = {}
        humans = world.get("humans") or {}
        mates = world.get("agents") or {}
        return Snapshot(
            tick=world.get("tick", 0),
            x=world.get("position", {}).get("x", 0.0),
            y=world.get("position", {}).get("y", 0.0),
            items=inventory.get("items") or {},
            craftable=inventory.get("craftable") or {},
            buildings=world.get("buildings") or {},
            resources=world.get("resources") or {},
            humans=list(humans.values()) if isinstance(humans, dict) else humans,
            mates=list(mates.values()) if isinstance(mates, dict) else mates,
            researched=research["researched"],
            researching=research.get("current"),
            powered=bool(power.get("powered")),
        )

    def block(self, kind: str, seconds: float = BACKOFF_SECONDS) -> None:
        self.blocked[kind] = time.monotonic() + seconds

    def blocked_now(self) -> frozenset[str]:
        now = time.monotonic()
        self.blocked = {k: t for k, t in self.blocked.items() if t > now}
        return frozenset(self.blocked)


# ---------------------------------------------------------------------- crew

class Crew:
    def __init__(self, bridge: AIBridge, autopilot: bool = True,
                 use_llm: bool = True) -> None:
        self.bridge = bridge
        self.autopilot = autopilot
        self.use_llm = use_llm
        self.since_tick: int | None = None
        self.workers: dict[str, Worker] = {}
        self.thoughts: queue.Queue[tuple[str, str, list[Step]]] = queue.Queue()
        # 반장이 나눠준 결과가 여기로 온다. LLM 호출은 6초쯤 걸려서 채팅을
        # 읽는 루프를 멈춰 세울 수 없다.
        self.orders: queue.Queue[tuple[str, list, list, str]] = queue.Queue()
        # 반장은 한 번에 한 지시만 나눈다. 두 지시가 겹쳐 들어오면 뒤엣것이
        # 앞엣것의 배정을 지워버린다.
        self.chief = threading.Semaphore(1)
        # job key -> agent holding it. This is the whole of the orchestration:
        # nobody may start work someone else has already taken.
        self.claims: dict[str, str] = {}
        # 부탁이 오가는 곳, 그리고 누가 무엇을 쥐고 있는지에 대한 마지막 기억.
        # 남의 인벤토리는 스냅샷을 찍을 때만 알 수 있으니, 찍을 때마다 적어둔다.
        self.board = mission.Board()
        self.stock: dict[str, dict[str, int]] = {}
        self.stage: str | None = None
        self.goal_line = f"목표 {mission.GOAL}"
        self.research_checked = 0.0
        self.research_said: str | None = None
        # 방금 한 말들. 같은 줄을 되풀이하지 않기 위한 것.
        self.echoes: dict[tuple[str, str], float] = {}
        self.shown: tuple[str, tuple[str, ...]] | None = None

    # -- roster -----------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self.workers)

    def adopt(self, name: str) -> Worker:
        focus = FOCUS_ORDER[len(self.workers) % len(FOCUS_ORDER)]
        worker = Worker(self.bridge.agent(name), focus=focus)
        worker.autopilot = self.autopilot
        self.workers[name] = worker
        # The panel shows this, so the mod has to be told.
        try:
            self.bridge.set_focus(name, focus)
        except RconError:
            pass
        return worker

    def hire(self, name: str | None = None) -> Worker | None:
        if name is None:
            for sign in CALL_SIGNS:
                if sign not in self.workers:
                    name = sign
                    break
        if name is None:
            self.say("자리가 다 찼습니다.")
            return None
        try:
            self.bridge.spawn(name)
        except RconError as exc:
            self.say(f"에이전트를 못 만들겠습니다: {exc}")
            return None
        worker = self.adopt(name)
        self.say(f"{name} 합류했습니다.", who=name)
        return worker

    def fire(self, name: str) -> None:
        self.board.release(name)
        self.stock.pop(name, None)
        self.bridge.remove(name)
        worker = self.workers.pop(name, None)
        if worker:
            self.release(worker)
        self.say(f"{name} 내보냈습니다.")

    def sync_roster(self) -> None:
        """Take over whatever the server already has, so a restart keeps them."""
        for state in self.bridge.list():
            if state["name"] not in self.workers:
                self.adopt(state["name"])

    # -- speech -----------------------------------------------------------

    def say(self, text: str, who: str = "AI") -> None:
        # 같은 사람이 같은 말을 반복하면 대화창이 그 한 줄로 가득 찬다.
        # «연료가 떨어져 멈췄습니다»가 다섯 번 연속으로 찍혀 있었다.
        now = time.monotonic()
        said = self.echoes.get((who, text))
        if said and now - said < ECHO_QUIET:
            print(f"[{who}] {text}  (반복 생략)")
            return
        self.echoes = {k: t for k, t in self.echoes.items() if now - t < ECHO_QUIET}
        self.echoes[(who, text)] = now
        print(f"[{who}] {text}")
        self.bridge.say(text, who=who)

    # -- who is doing what -------------------------------------------------

    def taken(self) -> frozenset[str]:
        return frozenset(self.claims)

    def claim(self, worker: Worker, key: str) -> None:
        self.release(worker)
        if key:
            self.claims[key] = worker.name
            worker.job_key = key

    def release(self, worker: Worker) -> None:
        if worker.job_key:
            self.claims.pop(worker.job_key, None)
            worker.job_key = None

    def seat(self, worker: Worker) -> tuple[float, float]:
        """이 캐릭터가 지금 서 있는 곳. 못 물어보면 원점으로 친다."""
        try:
            pos = worker.handle.observe(radius=1).get("position") or {}
        except RconError:
            return (0.0, 0.0)
        return (pos.get("x", 0.0), pos.get("y", 0.0))

    def targets(self, target: str | None) -> list[Worker]:
        """Who carries out an order.

        An unaddressed order goes to the whole crew. Having hired several
        agents, watching one of them walk off alone is not what anybody meant;
        naming one is how you ask for that.
        """
        if target and target in self.workers:
            return [self.workers[target]]
        return list(self.workers.values())

    # -- the slow brain ---------------------------------------------------

    def ask_llm(self, worker: Worker, message: str, snap: Snapshot) -> None:
        if not worker.slot.acquire(blocking=False):
            self.say("아직 앞의 말을 생각하는 중입니다.", who=worker.name)
            return

        def think() -> None:
            try:
                answer = brain.think(message, snap, agent_name=worker.name)
                if answer is None:
                    self.thoughts.put((worker.name, "무슨 말인지 모르겠습니다.", []))
                else:
                    self.thoughts.put((worker.name, answer[0], answer[1]))
            except Exception as exc:  # noqa: BLE001 - a dead thread must still answer
                print(f"[warn] brain failed: {exc!r}", file=sys.stderr)
                self.thoughts.put((worker.name, "생각하다 문제가 생겼습니다.", []))
            finally:
                worker.slot.release()

        threading.Thread(target=think, daemon=True).start()

    def delegate(self, message: str, speaker: str) -> None:
        """지시 하나를 보고 캐릭터들에게 나눠준다.

        예전에는 알아듣지 못한 문장을 한 명에게만 물어봤다. 그 한 명이
        혼자 걸어가 일하고 나머지 셋은 서 있었다. 이제는 무리 전체를 한 장에
        적어 보내고, 겹치지 않게 쪼갠 배정을 받는다.
        """
        if not self.use_llm or not self.workers:
            return
        if not self.chief.acquire(blocking=False):
            self.say("앞의 지시를 아직 나누는 중입니다. 잠시만요.")
            return

        # 나누는 데 6초쯤 걸린다. 그동안 아무 말이 없으면 사람은 무시당한
        # 줄 안다. 받았다는 말이 먼저고, 어떻게 나눴는지는 정해지면 말한다.
        self.say(f"{speaker}님 말씀 받았습니다. 누가 뭘 할지 정해서 알려드리겠습니다.")

        fleet: list[dict] = []
        view: Snapshot | None = None
        for worker in self.workers.values():
            try:
                snap = worker.snapshot()
                busy = worker.handle.busy()
            except RconError:
                continue
            view = view or snap
            self.stock[worker.name] = dict(snap.items)
            fleet.append({
                "name": worker.name, "x": snap.x, "y": snap.y,
                "focus": worker.focus, "items": snap.items,
                "doing": (worker.job_key or "작업 중") if busy else "",
            })

        if not fleet or view is None:
            self.chief.release()
            return

        def think() -> None:
            try:
                answer = brain.delegate(message, view, fleet)
                if answer is None:
                    self.orders.put(("무슨 말인지 모르겠습니다.", [], [], speaker))
                else:
                    self.orders.put((*answer, speaker))
            except Exception as exc:  # noqa: BLE001 - a dead thread must still answer
                print(f"[warn] delegate failed: {exc!r}", file=sys.stderr)
                self.orders.put(("지시를 나누다 문제가 생겼습니다.", [], [], speaker))
            finally:
                self.chief.release()

        threading.Thread(target=think, daemon=True).start()

    # 반장이 내릴 수 있는 운영 명령. 앞의 것들은 무리 전체에 대한 것이고,
    # 뒤의 것들은 캐릭터 한 명에게 간다.
    CREW_COMMANDS = {"panel", "save", "add_agent", "remove_agent",
                     "list_agents", "observer", "unobserver"}

    def run_command(self, order: dict, speaker: str) -> None:
        """반장이 내린 운영 명령을 실행한다.

        steps 로 표현할 수 없는 것들 - 저장, 관찰자 전환, 인원 조절 - 만
        여기로 온다. 이미 있던 인텐트 처리기를 그대로 쓴다.
        """
        name = order.get("name")
        if not name:
            return
        params = {k: v for k, v in order.items() if k in ("count", "ore")}
        intent: Intent = (name, params)

        if name in self.CREW_COMMANDS:
            self.handle_crew(intent, speaker, order.get("agent"))
            return

        who = order.get("agent")
        crew = [self.workers[who]] if who in self.workers else list(self.workers.values())
        for worker in crew:
            self.handle(worker, intent, speaker)

    def collect_orders(self) -> None:
        """나눠진 배정을 실제로 꽂는다.

        취소가 먼저다. 하던 일을 남겨두고 새 일을 큐에 얹으면, 사람이 방금
        시킨 것이 앞의 일이 끝난 뒤에야 시작된다.
        """
        while True:
            try:
                plan, commands, assignments, speaker = self.orders.get_nowait()
            except queue.Empty:
                return
            if plan:
                self.say(plan)
            for order in commands:
                self.run_command(order, speaker)
            for name, say, steps in assignments:
                worker = self.workers.get(name)
                if not worker:
                    continue
                try:
                    worker.handle.cancel()
                except RconError:
                    pass
                worker.watching = []
                worker.errand = None
                self.board.release(name)
                self.release(worker)
                worker.said_idle = False
                if say:
                    self.say(say, who=name)
                if not steps:
                    continue
                try:
                    worker.watching = worker.handle.submit_plan(steps)
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)

    def collect_thoughts(self) -> None:
        while True:
            try:
                name, say, steps = self.thoughts.get_nowait()
            except queue.Empty:
                return
            worker = self.workers.get(name)
            if say:
                self.say(say, who=name)
            if steps and worker:
                try:
                    worker.watching = worker.handle.submit_plan(steps)
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)

    # -- automation --------------------------------------------------------

    def obtain(self, worker: Worker, item: str, count: int = 1,
               rounds: int = 6) -> bool:
        """이 아이템을 count 개 손에 넣는다. 없으면 만들고, 재료가 없으면 구해온다.

        ensure() 는 «만들 수 있으면 만든다»까지였다. 전봇대는 나무 1개를
        요구하는데 나무가 없으면 그대로 포기했고, 그래서 랩을 세워두고
        전력을 영영 못 만들었다. 무엇이 모자란지는 게임이 사슬로 답해주므로,
        그 사슬을 여기서 한 단씩 밟아 내려간다.

        rounds 는 안전장치다. 사슬이 끝나지 않는 경우(연구가 막혔다든가)
        영원히 도는 것보다 실패하는 편이 낫다.
        """
        name = worker.name
        for _ in range(rounds):
            if worker.handle.items().get(item, 0) >= count:
                return True
            try:
                answer = self.bridge.plan_item(name, item, count)
            except RconError:
                return False
            if answer.get("error"):
                return False

            steps = _as_rows(answer.get("steps"))
            step = next((st for st in steps if st.get("hand")), None)
            if step:
                try:
                    worker.handle.craft(step.get("recipe") or step["name"],
                                        count=int(step.get("count") or 1), timeout=240)
                    continue
                except TaskFailed as exc:
                    self.say(f"{step['name']}을(를) 못 만들겠습니다: "
                             f"{exc.task.get('error')}", who=name)
                    return False

            snap = worker.snapshot()
            wanted = answer.get("mine") or {}
            if "wood" in wanted:
                try:
                    worker.handle.chop(snap.x, snap.y,
                                       count=max(4, min(int(wanted["wood"]) * 2, 40)),
                                       timeout=300, timeout_ticks=60 * 60 * 3)
                    continue
                except TaskFailed:
                    return False

            smelt = next((st for st in steps if st.get("action") == "smelt"), None)
            if smelt and answer.get("furnace"):
                furnace = answer["furnace"]
                try:
                    worker.handle.insert("coal", furnace["x"], furnace["y"],
                                         count=FURNACE_FUEL, timeout=180)
                    worker.handle.insert(smelt.get("input") or smelt["name"],
                                         furnace["x"], furnace["y"],
                                         count=int(smelt.get("input_count") or 1),
                                         timeout=180)
                except TaskFailed:
                    return False
                # 녹는 동안 기다리는 대신, 다음 바퀴에서 다시 물어본다.
                time.sleep(float(smelt.get("seconds") or 10) + SMELT_MARGIN)
                try:
                    worker.handle.take(smelt["name"], furnace["x"], furnace["y"],
                                       count=int(smelt.get("count") or 1), timeout=180)
                except TaskFailed:
                    pass
                continue

            for ore, amount in sorted(wanted.items()):
                spot = snap.ore(ore)
                if not spot:
                    continue
                try:
                    worker.handle.mine(spot["x"], spot["y"],
                                       count=max(10, min(int(amount), 60)),
                                       timeout=420, timeout_ticks=60 * 60 * 5)
                except TaskFailed:
                    return False
                break
            else:
                return False

        return worker.handle.items().get(item, 0) >= count

    def ensure(self, worker: Worker, item: str, count: int = 1) -> bool:
        """Have `count` of an item, crafting it only if the game says we can."""
        stock = worker.handle.inventory()
        if (stock.get("items") or {}).get(item, 0) >= count:
            return True
        if (stock.get("craftable") or {}).get(item, 0) < count:
            self.say(f"{item} 재료가 모자랍니다.", who=worker.name)
            return False
        try:
            self.say(f"{item}이(가) 부족해서 제작합니다.", who=worker.name)
            worker.handle.craft(item, count=count)
            return True
        except TaskFailed as exc:
            self.say(f"{item}을(를) 못 만들겠습니다: {exc.task.get('error')}", who=worker.name)
            return False

    def start_routine(self, worker: Worker, routine: str, ore: str | None = None,
                      at: dict | None = None) -> bool:
        """Run a long build-out off the main loop; it walks, crafts and builds."""
        if not worker.slot.acquire(blocking=False):
            return False

        def run() -> None:
            try:
                if routine == "power":
                    self.build_power(worker)
                elif routine == "rescue":
                    self.rescue(worker, at or {})
                else:
                    self.automate(worker, ore)
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] {routine} failed: {exc!r}", file=sys.stderr)
                self.thoughts.put((worker.name, f"{routine} 중 문제가 생겼습니다.", []))
            finally:
                worker.slot.release()

        threading.Thread(target=run, daemon=True).start()
        return True

    def build_power(self, worker: Worker) -> None:
        """발전소를 세운다. 자리는 게임이 계산한 것을 그대로 쓴다.

        예전에는 «펌프에서 축을 따라 2~7칸» 같은 어림으로 놓았고, 그 결과
        펌프 둘·보일러 하나·기관 둘이 흩어진 채 기관이 no_input_fluid 로
        서 있었다. 어림은 맞을 때만 맞는다.

        이제 모드가 임시로 세워 보고 «여기에 이 방향으로 놓으면 붙는다»를
        확인한 좌표만 준다. 파이프 자리까지 함께 온다.
        """
        name = worker.name
        try:
            snap = worker.snapshot()
            # «기관이 서 있다»가 아니라 «전기가 흐른다». 계획 쪽만 고치고
            # 여기를 안 고쳐서, 보일러와 기관을 손에 쥔 채 «이미 발전기가
            # 있습니다»라며 돌아서고 있었다.
            if snap.powered:
                self.say("이미 전기가 들어오고 있습니다.", who=name)
                return

            # 랩 옆에 세운다. 발전소가 랩에서 141타일 떨어져 있으면 전봇대
            # 스물두 개를 세워야 하고, 그 전봇대에 또 나무가 든다.
            anchor = snap.building("lab") or snap.building("stone-furnace") \
                or {"x": snap.x, "y": snap.y}

            plan = self.bridge.power_plan(name, anchor["x"], anchor["y"],
                                          radius=150, engines=ENGINES_PER_BOILER)
            if plan.get("error"):
                self.say(f"발전소 자리를 못 찾았습니다: {plan['error']}", who=name)
                worker.block("power", 600)
                return

            pipes = _as_rows(plan.get("pipes"))
            engines = _as_rows(plan.get("engines"))
            needed = [("offshore-pump", 1), ("boiler", 1),
                      ("steam-engine", len(engines))]
            if pipes:
                needed.append(("pipe", len(pipes)))
            for part, count in needed:
                self.say(f"{part} {count}개를 준비합니다.", who=name)
                if not self.obtain(worker, part, count):
                    self.say(f"{part}를 못 구했습니다. 전력은 나중에.", who=name)
                    worker.block("power", 300)
                    return

            self.say(f"발전소를 세웁니다. ({plan['pump']['x']:.0f}, "
                     f"{plan['pump']['y']:.0f})", who=name)
            worker.handle.place("offshore-pump", plan["pump"]["x"], plan["pump"]["y"],
                                direction=plan["pump"]["direction"], timeout=420)
            for spot in pipes:
                worker.handle.place("pipe", spot["x"], spot["y"], timeout=180)
            worker.handle.place("boiler", plan["boiler"]["x"], plan["boiler"]["y"],
                                direction=plan["boiler"]["direction"], timeout=240)
            for spot in engines:
                worker.handle.place("steam-engine", spot["x"], spot["y"],
                                    direction=spot["direction"], timeout=240)

            if not self.obtain(worker, "coal", 20):
                self.say("보일러에 넣을 석탄이 없습니다.", who=name)
            else:
                worker.handle.insert("coal", plan["boiler"]["x"], plan["boiler"]["y"],
                                     count=20, timeout=180)

            # 정말 도는지 본다. 물 없는 보일러와 증기 없는 기관은 밖에서
            # 보면 멀쩡한 발전소와 똑같이 생겼다.
            last = engines[-1] if engines else plan["boiler"]
            running = [e for e in self.bridge.inspect(last["x"], last["y"], 3)
                       if e.get("name") == "steam-engine"]
            energy = running[0].get("energy", 0) if running else 0
            self.say(f"발전소를 세웠습니다. 기관 {len(engines)}대. "
                     + ("전력 생산 중입니다." if energy and energy > 0
                        else "아직 증기가 안 올라왔습니다."), who=name)

            self.connect_power(worker, last, snap)

        except TaskFailed as exc:
            worker.block("power")
            self.say(f"전력 구축 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("power")
            self.say(f"전력 구축 중 오류: {exc}", who=name)

    def connect_power(self, worker: Worker, source: dict, snap: Snapshot) -> None:
        """발전소에서 랩까지 전봇대를 잇는다.

        전봇대를 세우기 전까지 발전소는 아무것도 돌리지 않는다. 기관이
        돌아가는데 랩이 멈춰 있는 상태가 제일 헷갈린다 - 둘 다 멀쩡해
        보이기 때문이다.
        """
        name = worker.name
        target = snap.building("lab")
        if not target:
            return

        span = math.hypot(target["x"] - source["x"], target["y"] - source["y"])
        if span > POLE_REACH * MAX_POLE_RUN:
            # 물이 있는 곳과 랩이 있는 곳은 우리가 고른 게 아니다. 115타일을
            # 전봇대로 잇느니 전기가 있는 자리에 랩을 하나 더 세우는 게 싸다 -
            # 사람도 그렇게 한다.
            self.say(f"랩이 {span:.0f}타일 떨어져 있습니다. 발전소 옆에 랩을 "
                     f"하나 더 세우겠습니다.", who=name)
            if not self.obtain(worker, "lab", 1):
                self.say("랩을 못 만들었습니다.", who=name)
                return
            try:
                target = worker.handle.place("lab", source["x"] + 4, source["y"],
                                             snap=True, timeout=420)
            except TaskFailed as exc:
                self.say(f"랩을 못 세웠습니다: {exc.task.get('error')}", who=name)
                return
            span = math.hypot(target["x"] - source["x"], target["y"] - source["y"])

        poles = max(2, math.ceil(span / POLE_REACH) + 1)

        self.say(f"발전소에서 랩까지 {span:.0f}타일, 전봇대 {poles}개를 세웁니다.",
                 who=name)
        if not self.obtain(worker, "small-electric-pole", poles):
            self.say("전봇대를 못 구했습니다.", who=name)
            return

        placed = 0
        for i in range(1, poles + 1):
            share = i / poles
            x = source["x"] + (target["x"] - source["x"]) * share
            y = source["y"] + (target["y"] - source["y"]) * share
            try:
                worker.handle.place("small-electric-pole", x, y, snap=True, timeout=240)
                placed += 1
            except TaskFailed:
                # 한 자리가 막혔다고 전선 전체를 포기할 이유는 없다.
                continue
        self.say(f"전봇대 {placed}개를 세웠습니다.", who=name)

    def rescue(self, worker: Worker, at: dict) -> None:
        """멈춰 선 채굴기에 출구 상자를 달아주고 연료를 채운다.

        어디가 출구인지는 채굴기에게 묻는다. 방향을 짐작해서 놓으면 상자는
        서 있는데 광석은 여전히 땅에 쌓인다.
        """
        name = worker.name
        if not at:
            return
        try:
            # 출구가 막혔으면 상자를 놓을 자리가 아예 없다. 건물은 돌릴 수
            # 있으니, 상자를 만들기 전에 비는 쪽으로 돌려본다.
            aimed = self.bridge.aim_drill(worker.name, at["x"], at["y"])
            if aimed.get("error"):
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}", 300)
                self.say(f"채굴기를 어느 쪽으로 돌려도 출구가 막혔습니다. "
                         f"({at['x']:.0f}, {at['y']:.0f})", who=name)
                return
            if aimed.get("turned"):
                self.say("출구가 막혀 채굴기를 돌렸습니다.", who=name)
            drill = {"x": aimed["x"], "y": aimed["y"],
                     "drop_x": aimed["drop_x"], "drop_y": aimed["drop_y"]}

            # 그 사이에 누가 상자를 달아줬을 수도 있다.
            already = [e for e in self.bridge.inspect(drill["drop_x"], drill["drop_y"], 0.8)
                       if (e.get("name") or "").endswith("-chest")]
            if already:
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}")
                return

            if not self.ensure(worker, CHEST):
                worker.block("rescue")
                return

            worker.handle.place(CHEST, drill["drop_x"], drill["drop_y"], timeout=180)
            self.say(f"({drill['x']:.0f},{drill['y']:.0f}) 채굴기에 상자를 달았습니다.",
                     who=name)

            if worker.handle.items().get("coal", 0) >= DRILL_FUEL:
                worker.handle.insert("coal", drill["x"], drill["y"],
                                     count=DRILL_FUEL, timeout=180)
        except TaskFailed as exc:
            worker.block("rescue")
            self.say(f"상자를 못 달았습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("rescue")
            self.say(f"채굴기 수리 중 오류: {exc}", who=name)

    def automate(self, worker: Worker, ore: str | None) -> None:
        """Drill on the patch, chest where it drops, fuel in the drill."""
        ore = ore or "coal"
        name = worker.name
        try:
            snap = worker.snapshot()
            spot = snap.ore(ore)
            if not spot:
                self.say(f"{ore} 광맥이 주변 200타일 안에 안 보입니다.", who=name)
                return

            if not self.ensure(worker, DRILL) or not self.ensure(worker, CHEST):
                worker.block("automate")
                return

            # 건물은 돌릴 수 있다. 기본 방향으로 그냥 놓으면 두 대를 나란히
            # 세웠을 때 아래쪽이 위쪽 몸통에 대고 광석을 떨구다 멈춘다.
            # 그래서 «들어가고 출구도 비는» 자리와 방향을 먼저 고른다.
            sites = self.bridge.drill_site(name, spot["x"], spot["y"], radius=12)
            if not sites:
                self.say(f"{ore} 광맥에 출구가 비는 자리가 없습니다.", who=name)
                worker.block(f"automate:{ore}", 300)
                return
            site = sites[0]

            self.say(f"{ore} 광맥에 채굴기를 놓겠습니다. ({site['x']:.0f}, {site['y']:.0f})",
                     who=name)
            drill = worker.handle.place(DRILL, site["x"], site["y"],
                                        direction=site["direction"], timeout=300)

            # 놓고 나서 출구를 다시 확인한다. 그 사이 누가 무언가를 세웠을 수
            # 있고, 그러면 돌려서 고친다.
            aimed = self.bridge.aim_drill(name, drill["x"], drill["y"])
            if aimed.get("error"):
                self.say(f"채굴기 출구를 못 찾았습니다: {aimed['error']}", who=name)
                return
            if aimed.get("turned"):
                self.say("출구가 막혀 채굴기를 돌렸습니다.", who=name)
            drop = {"drop_x": aimed["drop_x"], "drop_y": aimed["drop_y"]}
            if site.get("outlet") != "chest":
                worker.handle.place(CHEST, drop["drop_x"], drop["drop_y"], timeout=180)

            if worker.handle.items().get("coal", 0) < DRILL_FUEL:
                coal = snap.ore("coal")
                if coal:
                    self.say("연료가 부족해 석탄을 조금 캐옵니다.", who=name)
                    worker.handle.mine(coal["x"], coal["y"], count=DRILL_FUEL,
                                       timeout=300, timeout_ticks=14400)
            worker.handle.insert("coal", drill["x"], drill["y"], count=DRILL_FUEL, timeout=180)

            self.say(f"{ore} 자동 채굴 완료. 채굴기 ({drill['x']:.0f}, {drill['y']:.0f}), "
                     f"상자 ({drop['drop_x']:.0f}, {drop['drop_y']:.0f}).", who=name)
        except TaskFailed as exc:
            worker.block("automate")
            self.say(f"자동화 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("automate")
            self.say(f"자동화 중 오류: {exc}", who=name)

    # -- reporting ---------------------------------------------------------

    def keep_busy(self, worker: Worker, snap: Snapshot) -> Job | None:
        """마지막 수단: 자기 담당 광석을 캐러 간다.

        열쇠에 이름을 넣어 여섯이 여섯 몫을 캔다. 같은 광맥이어도 상관없다 -
        652타일짜리 광맥에서 둘이 부딪힐 일은 없고, 서 있는 것보다는 캐는
        것이 언제나 낫다.
        """
        for ore in [worker.focus] + [o for o in FOCUS_ORDER if o != worker.focus]:
            spot = snap.ore(ore)
            if not spot:
                continue
            return Job(f"할 일이 비어 {ore}를 캐 두겠습니다.",
                       key=f"gather:{worker.name}",
                       steps=[("mine", {**spot, "count": STOCKPILE,
                                        "search_radius": 12,
                                        "timeout_ticks": 60 * 60 * 5})])
        return None

    def chain_toward(self, worker: Worker, snap: Snapshot) -> Job | None:
        """사다리의 다음 단이 요구하는 물건을 향해 한 걸음.

        예전에는 랩을 못 만들면 그냥 다른 일을 하러 갔다. 구리 광석과 화로를
        손에 쥐고도 «구리를 제련하면 회로를 만들 수 있다»는 걸 몰랐다.
        이제는 게임에게 묻는다 - 레시피 그래프도 인벤토리도 게임이 갖고 있다.
        """
        stage = mission.stage_of(snap)
        target = STAGE_TARGET.get(stage.key)
        if not target:
            return None
        item, count = target
        if snap.have(item) >= count or snap.building(item):
            return None

        try:
            answer = self.bridge.plan_item(worker.name, item, count)
        except RconError:
            return None
        if answer.get("error"):
            return None

        # 사람마다 다른 화로를 쓰게 한다. 23대가 서 있는데 한 대 앞에
        # 줄을 서는 일이 다시 생기면 안 된다.
        spots = snap.spots("stone-furnace")
        furnace = None
        if spots:
            seat = list(self.workers).index(worker.name) if worker.name in self.workers else 0
            furnace = spots[seat % len(spots)]
        elif answer.get("furnace"):
            furnace = answer["furnace"]

        job = chain_job(answer, item, furnace)
        if job:
            return job

        # 새로 캐기 전에 이미 녹아 있는 걸 먼저 꺼낸다. 사슬이 원하는
        # 것이면 한 개라도 가져온다.
        harvest = self.harvest_job(worker, self.chain_wants(answer))
        if harvest:
            return harvest

        # 사슬의 맨 밑이 땅이면 캐러 간다. 무엇을 얼마나 캐야 하는지도
        # 게임이 세어줬다.
        for ore, amount in sorted((answer.get("mine") or {}).items()):
            # 나무는 광맥이 아니다. 전봇대가 나무 1개를 요구하는데 벨 줄을
            # 몰라서 전력이 통째로 막혀 있었다.
            if ore == "wood":
                return Job(f"{item}을(를) 만들려면 나무가 {int(amount)}개 필요합니다. 베러 갑니다.",
                           key="chain:chop",
                           steps=[("chop", {"x": snap.x, "y": snap.y,
                                            "count": max(4, min(int(amount) * 2, 40)),
                                            "timeout_ticks": 60 * 60 * 3})])
            spot = snap.ore(ore)
            if not spot:
                continue
            wanted = max(10, min(int(amount), 100))
            return Job(f"{item}을(를) 만들려면 {ore}가 {int(amount)}개 필요합니다. 캐러 갑니다.",
                       key=f"chain:mine:{ore}",
                       steps=[("mine", {**spot, "count": wanted, "search_radius": 10,
                                        "timeout_ticks": 60 * 60 * 5})])

        # 잠긴 레시피가 막고 있으면 말이라도 해준다. 조용히 멈춰 있는 것이
        # 제일 나쁘다.
        locked = sorted((answer.get("locked") or {}))
        if locked:
            worker.block(f"chain:{item}", 300)
            self.say(f"{item}은(는) {locked[0]} 연구가 없어서 못 만듭니다.", who=worker.name)
        return None

    def tend_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """멈춰 선 기계를 고친다. 새로 짓는 것보다 먼저다.

        연료가 떨어진 채굴기, 출력이 꽉 찬 화로 - 지어놓고 아무도 돌아오지
        않아서 멈춘 것들이다. 멈춘 기계는 지어지지 않은 기계보다 나쁘다.
        재료는 이미 들어갔는데 아무것도 내놓지 않기 때문이다.

        무엇이 왜 멈췄는지는 짐작하지 않는다. 게임이 기계마다 status 로
        들고 있고, 거기에 답이 적혀 있다.
        """
        try:
            stopped = self.bridge.broken(worker.name)
        except RconError:
            return None

        # 정비는 끝이 없다. 버너 드릴 열여덟 대는 계속 연료가 떨어지고,
        # 여섯 명이 전부 거기 매달리면 발전소는 영영 안 선다. 손이 모자란
        # 것과 할 일이 없는 것은 다르다 - 절반만 돌본다.
        tending = sum(1 for key in self.claims if key.startswith("tend:"))
        if tending >= max(1, len(self.workers) // 2):
            return None

        # 진짜 고장이 먼저고, 노는 화로를 먹이는 일은 그 뒤다. 순서를
        # 거꾸로 하면 빈 화로 스무 대가 연료 떨어진 드릴을 가린다.
        rank = {"fuel": 0, "chest": 1, "empty": 2, "feed": 3}
        stopped.sort(key=lambda e: (rank.get(e.get("fix"), 9), e.get("distance", 0)))

        taken = self.taken()
        for entry in stopped:
            key = f"tend:{entry['x']:.0f},{entry['y']:.0f}"
            if key in taken or key in worker.blocked_now():
                continue
            at = {"x": entry["x"], "y": entry["y"]}
            what, fix = entry.get("name", "기계"), entry.get("fix")

            if fix == "fuel":
                if snap.have("coal") < DRILL_FUEL:
                    # 연료를 넣어주려면 연료가 있어야 한다. 부탁의 근거가 된다.
                    continue
                return Job(f"{what}이(가) 연료가 떨어져 멈췄습니다. 석탄을 넣겠습니다.",
                           key=key, needs={"coal": DRILL_FUEL},
                           steps=[("insert", {"name": "coal", "count": DRILL_FUEL, **at})])

            if fix == "empty":
                # 무엇이 찼는지는 화로 재고 쪽이 안다. 이름 없이 꺼낼 수는
                # 없으므로 거두기에 맡긴다.
                harvest = self.harvest_job(worker)
                if harvest:
                    return harvest
                continue

            if fix == "feed":
                # 공장은 끊임없이 돌아야 한다. 목표에 필요한 만큼만 녹이면
                # 화로 절반이 서 있고, 그동안 광석은 가방에서 잠잔다.
                ore = max(SMELTABLE, key=lambda o: snap.have(o), default=None)
                if not ore or snap.have(ore) < SMELT_BATCH                         or snap.have("coal") < FURNACE_FUEL:
                    continue
                return Job(f"화로가 비어 있습니다. {ore}를 넣어 계속 돌리겠습니다.",
                           key=key, needs={"coal": FURNACE_FUEL, ore: SMELT_BATCH},
                           steps=[
                               ("insert", {"name": "coal", "count": FURNACE_FUEL, **at}),
                               ("insert", {"name": ore, "count": SMELT_BATCH, **at}),
                           ])

            if fix == "chest":
                # 내놓을 데가 없어 멈췄다. 상자가 꽉 찼으면 비우면 되고,
                # 아예 없으면 달아줘야 한다 - 손보는 방법이 다르다.
                if entry.get("holding") and entry.get("outlet"):
                    return Job(
                        f"{what}의 상자가 꽉 차서 멈췄습니다. 비우겠습니다.",
                        key=key,
                        steps=[("take", {"name": entry["holding"],
                                         "count": int(entry.get("held") or 1),
                                         **entry["outlet"]})])
                return Job(f"{what}이(가) 내놓을 데가 없어 멈췄습니다. 상자를 달겠습니다.",
                           key=key, routine="rescue", at=at, needs={CHEST: 1})

        return None

    def harvest_job(self, worker: Worker, wanted: set[str] | None = None) -> Job | None:
        """화로에 다 녹아 있는 것을 거둬온다.

        이건 «여유 있으면 하는 일»이 아니다. 출력 슬롯이 찬 화로는 제련을
        멈춘다. 즉 거두지 않은 판금은 그 자체로 병목이고, 새 광석을 캐러
        가는 것보다 언제나 먼저다 - 실제로 화로 안에 철판 100개를 재워둔 채
        «철광석 25개를 캐야 한다»고 말하고 있었다.

        조금 녹은 걸 계속 집으러 다니면 그것대로 낭비라, 쌓인 것만 거둔다.
        사슬이 지금 당장 필요로 하는 것은 한 개라도 가져온다.
        """
        try:
            stock = self.bridge.furnace_stock(worker.name)
        except RconError:
            return None

        taken = self.taken()
        for entry in stock:
            name, count = entry.get("name"), int(entry.get("count") or 0)
            if count < HARVEST_MIN and not (wanted and name in wanted):
                continue
            key = f"harvest:{entry['x']:.0f},{entry['y']:.0f}"
            if key in taken:
                continue
            return Job(f"화로에 {name} {count}개가 다 녹아 있습니다. 거둬오겠습니다.",
                       key=key,
                       steps=[("take", {"name": name, "count": count,
                                        "x": entry["x"], "y": entry["y"]})])
        return None

    @staticmethod
    def chain_wants(answer: dict) -> set[str]:
        """사슬이 이름을 부른 모든 물건."""
        wanted = set(answer.get("mine") or {})
        for step in _as_rows(answer.get("steps")):
            if step.get("name"):
                wanted.add(step["name"])
            if step.get("input"):
                wanted.add(step["input"])
        return wanted

    def keep_research_going(self) -> None:
        """연구가 멈춰 있으면 다시 건다.

        숙련자들이 입을 모으는 첫 번째 경보가 «랩이 놀고 있다»다. 우리는
        랩을 세워놓고 연구를 하나도 걸지 않은 채 광석을 캐고 있었다.

        2.0 의 앞쪽 기술들은 과학팩이 아니라 «무엇을 만들었는가»로 열리는데,
        그 트리거도 현재 연구로 걸려 있어야 세어진다. 그래서 랩을 만들고도
        automation-science-pack 이 안 열렸다.
        """
        now = time.monotonic()
        if now < self.research_checked:
            return
        self.research_checked = now + RESEARCH_CHECK

        try:
            status = self.bridge.research_status()
            if status.get("current"):
                return
            options = self.bridge.available_research()
        except RconError:
            return
        if not options:
            return

        # 트리거 기술은 랩이 연구하는 것이 아니라 «무엇을 만들면» 열린다.
        # 큐에 넣으려 하면 엔진이 거부하므로, 걸 수 있는 것부터 건다.
        queueable = [t for t in options if not t.get("trigger_type")]
        queueable.sort(key=lambda t: t.get("name", ""))
        for pick in queueable:
            try:
                reply = self.bridge.research(pick["name"])
            except RconError:
                return
            if not reply.get("error") and reply.get("queued"):
                self.say(f"연구를 걸었습니다: {pick['name']}")
                return

        # 걸 수 있는 게 없으면 열쇠는 제작이다. 사다리가 그걸 목표로 삼고
        # 있으므로 여기서는 사람에게 알리기만 한다.
        for pick in options:
            if pick.get("trigger_type") == "craft-item":
                # 20초마다 같은 줄을 반복하면 채팅창이 가려진다.
                if self.research_said == pick["name"]:
                    return
                self.research_said = pick["name"]
                self.say(f"«{pick['name']}»은(는) {pick.get('trigger_item')} "
                         f"{pick.get('trigger_count', 1)}개를 손으로 만들면 열립니다.")
                return

    def announce_stage(self, snap: Snapshot) -> None:
        """사다리에서 한 단 오르면 알린다.

        무리가 지금 어디쯤인지 사람이 알 방법이 이것뿐이다. 매번 말하면
        소음이니, 바뀔 때만 말한다.
        """
        here = mission.stage_of(snap)
        self.goal_line = mission.briefing(snap)
        if here.key == self.stage:
            return
        self.stage = here.key
        self.say(self.goal_line)

    def show_board(self) -> None:
        """게임 안 패널에 목표와 대기 중인 부탁을 실어보낸다."""
        lines = tuple(self.board.summary())
        state = (self.goal_line, lines)
        if state == self.shown:
            return
        try:
            self.bridge.set_board(self.goal_line, list(lines))
        except RconError:
            return
        self.shown = state

    # -- 부탁 -------------------------------------------------------------

    def ask_for(self, worker: Worker, item: str, count: int, reason: str) -> None:
        """게시판에 부족분을 붙이고, 채팅으로도 말한다.

        채팅으로 말하는 게 중요하다. 사람이 보고 있는 화면은 게시판이 아니라
        채팅창이고, 누가 왜 멈춰 있는지는 거기에 나와야 한다.
        """
        req = self.board.post(worker.name, item, count, reason, time.monotonic())
        if req is None:
            return
        self.say(f"{reason} — {item} {count}개가 필요합니다. 여유 있는 분 부탁드립니다.",
                 who=worker.name)

    def serve_board(self, worker: Worker, snap: Snapshot, idle: bool) -> bool:
        """남이 붙여둔 부탁을 집는다. 집었으면 True.

        이미 손에 쥐고 있으면 하던 일을 잠깐 미루고 갖다준다 — 걸어가기만
        하면 되니 싸다. 없는 걸 캐다 주는 심부름은 달리 할 일이 없을 때만
        받는다. 그러지 않으면 온 무리가 심부름꾼이 된다.
        """
        if worker.errand:
            return True

        req = self.board.offer(worker.name, snap.items)
        fetch = False
        if req is None and idle:
            req = self.board.errand(worker.name)
            # 캐올 데가 안 보이는 부탁은 받아봐야 못 지킨다.
            if req is not None and not snap.ore(req.item):
                req = None
            fetch = req is not None
        if req is None:
            return False

        steps: list[Step] = []
        if fetch:
            spot = snap.ore(req.item)
            steps.append(("mine", {**spot, "count": req.count, "search_radius": 10,
                                   "timeout_ticks": 60 * 60 * 5}))
        steps.append(("give", {"to": req.asker, "name": req.item, "count": req.count}))

        try:
            ids = worker.handle.submit_plan(steps)
        except RconError as exc:
            self.say(f"심부름을 못 맡겠습니다: {exc}", who=worker.name)
            return False

        self.board.take(req, worker.name, time.monotonic())
        worker.watching = ids
        worker.errand = (ids[-1], req)
        worker.said_idle = False
        verb = "캐다 드리겠습니다" if fetch else "갖다 드리겠습니다"
        self.say(f"{req.asker}님, {req.item} {req.count}개 {verb}.", who=worker.name)
        return True

    def check_errand(self, worker: Worker) -> None:
        """실어나르던 부탁이 끝났는지 본다."""
        if not worker.errand:
            return
        task_id, req = worker.errand
        try:
            state = self.bridge.poll(task_id)
        except RconError:
            return
        status = state.get("status")
        if status in ("queued", "running"):
            return

        worker.errand = None
        if status == "done":
            self.board.fill(req)  # type: ignore[arg-type]
            self.say(f"{req.asker}님께 {req.item} {req.count}개 전달했습니다.",
                     who=worker.name)
            # 받은 쪽은 상황이 달라졌다. 아까 막혔던 일을 다시 해보게 한다.
            asker = self.workers.get(req.asker)
            if asker:
                asker.blocked.clear()
                asker.said_idle = False
        else:
            self.board.release(worker.name)
            self.say(f"{req.asker}님 부탁을 못 지켰습니다: {state.get('error')}",
                     who=worker.name)

    def report_finished(self) -> None:
        for worker in self.workers.values():
            still: list[int] = []
            for task_id in worker.watching:
                state = self.bridge.poll(task_id)
                status = state.get("status")
                if status in ("queued", "running"):
                    still.append(task_id)
                elif status == "failed":
                    kind = state.get("type") or "unknown"
                    # Remember what failed. Re-proposing it every second is how
                    # one unreachable furnace fills the chat with the same line.
                    worker.block(kind)
                    self.say(f"{kind} 실패: {state.get('error')}", who=worker.name)
                    # 방금 실제로 해보고 없다는 걸 알았다. 짐작이 아니므로
                    # 이걸 근거로 동료에게 부탁해도 된다.
                    want = missing_item(kind, state.get("error") or "",
                                        state.get("params"))
                    if want:
                        self.ask_for(worker, want, self.wanted(want),
                                     f"{kind} 작업이 막혔습니다")
            worker.watching = still

    @staticmethod
    def wanted(item: str) -> int:
        """부탁할 때 몇 개나 달라고 할지.

        광석은 한 번 제련할 만큼, 나머지는 하나면 된다. 스무 개짜리 부탁을
        한 개로 붙이면 받아도 또 막힌다."""
        if item in ("iron-ore", "copper-ore", "coal", "stone"):
            return ORE_BATCH
        return 1

    # -- dispatch ----------------------------------------------------------

    def handle(self, worker: Worker, intent: Intent, speaker: str) -> None:
        kind, params = intent
        name = worker.name
        handle = worker.handle

        if kind == "stop":
            worker.autopilot = False
            handle.cancel()
            worker.watching = []
            self.say("멈췄습니다.", who=name)

        elif kind == "autopilot_on":
            worker.autopilot = True
            worker.said_idle = False
            self.say("자율로 진행하겠습니다.", who=name)

        elif kind == "autopilot_off":
            worker.autopilot = False
            self.say("대기하겠습니다.", who=name)

        elif kind == "come":
            snap = worker.snapshot()
            here = next((h for h in snap.humans if h["name"] == speaker), None) \
                or (snap.humans[0] if snap.humans else None)
            if not here:
                self.say("어디로 갈지 모르겠습니다.", who=name)
                return
            self.say(f"{here['name']}님께 가겠습니다.", who=name)
            worker.watching = handle.submit_plan(
                [("walk_to", {"x": here["x"] + 2, "y": here["y"], "tolerance": 1.5})])

        elif kind == "mine":
            snap = worker.snapshot()
            spot = snap.ore(params["ore"])
            if not spot:
                self.say(f"{params['ore']} 광맥이 주변 200타일 안에 안 보입니다.", who=name)
                return
            # Stand a few tiles apart inside the patch; the task widens its own
            # search so the offset does not have to land on ore exactly.
            spread = params.get("spread", 0) * 3
            self.say(f"{params['ore']} {params['count']}개 캐러 갑니다. "
                     f"({spot['x']:.0f}, {spot['y']:.0f})", who=name)
            worker.watching = handle.submit_plan([("mine", {
                "x": spot["x"] + spread, "y": spot["y"],
                "count": params["count"], "search_radius": 10,
                "timeout_ticks": 60 * 60 * 5,
            })])

        elif kind == "place":
            entity, count = params["entity"], params["count"]
            snap = worker.snapshot()
            have = snap.have(entity)
            if have < 1:
                self.say(f"{entity}이(가) 없습니다.", who=name)
                return
            count = min(count, have)
            self.say(f"{entity} {count}개 설치하겠습니다.", who=name)
            worker.watching = handle.submit_plan([
                ("build", {"name": entity, "x": snap.x + 3 + i, "y": snap.y + 3, "snap": True})
                for i in range(count)
            ])

        elif kind == "craft":
            self.say(f"{params['recipe']} {params['count']}개 제작합니다.", who=name)
            worker.watching = handle.submit_plan(
                [("craft", {"recipe": params["recipe"], "count": params["count"]})])

        elif kind == "automate":
            if not self.start_routine(worker, "automate", params.get("ore")):
                self.say("앞의 작업을 아직 하는 중입니다.", who=name)

        elif kind == "report_inventory":
            items = worker.snapshot().items
            self.say(", ".join(f"{k} {v}" for k, v in sorted(items.items())) or "빈손입니다.",
                     who=name)

        elif kind == "report_scout":
            snap = worker.snapshot()
            lines = sorted(snap.resources.items(), key=lambda kv: kv[1]["nearest_dist"])[:4]
            self.say(" / ".join(
                f"{res} {info['nearest_dist']:.0f}타일 "
                f"({info['nearest']['x']:.0f},{info['nearest']['y']:.0f})"
                for res, info in lines) or "주변에 자원이 안 보입니다.", who=name)

        elif kind == "report_status":
            state = handle.status()
            doing = state.get("current")
            self.say(f"{'자율' if worker.autopilot else '대기'} 모드, "
                     f"({state.get('x', 0):.0f}, {state.get('y', 0):.0f}), "
                     f"{doing['type'] if doing else '유휴'}", who=name)

    def handle_crew(self, intent: Intent, speaker: str, target: str | None) -> bool:
        """Roster and observer commands, which belong to nobody in particular."""
        kind, params = intent

        if kind == "panel":
            try:
                state = self.bridge.panel(speaker)
                self.say("현황판을 " + ("띄웠습니다." if state.get("open") else "닫았습니다."))
            except RconError as exc:
                self.say(f"현황판 실패: {exc}")
            return True

        if kind == "save":
            try:
                self.bridge.save()
                self.say("저장했습니다.")
            except RconError as exc:
                self.say(f"저장 실패: {exc}")
            return True

        if kind == "add_agent":
            for _ in range(min(params.get("count", 1), len(CALL_SIGNS))):
                if not self.hire():
                    break
            return True

        if kind == "remove_agent":
            victim = target if target in self.workers else (self.names[-1] if self.names else None)
            if not victim:
                self.say("내보낼 에이전트가 없습니다.")
            else:
                self.fire(victim)
            return True

        if kind == "list_agents":
            if not self.workers:
                self.say("에이전트가 없습니다. '에이전트 추가'라고 하시면 만들겠습니다.")
                return True
            parts = []
            for index, state in enumerate(self.bridge.list(), start=1):
                doing = state.get("current")
                parts.append(f"{index}. {state['name']} "
                             f"({state.get('x', 0):.0f},{state.get('y', 0):.0f}) "
                             f"{doing['type'] if doing else '유휴'}")
            self.say(" | ".join(parts))
            return True

        if kind == "observer":
            try:
                # Their body becomes a worker rather than a corpse in a field.
                free = next((s for s in CALL_SIGNS if s not in self.workers), None)
                result = self.bridge.spectate(speaker, adopt_as=free)
            except RconError as exc:
                self.say(f"관찰자 전환 실패: {exc}")
                return True
            try:
                # A watcher with no body should not have to ask for the list,
                # nor for what the crew is saying to each other.
                self.bridge.panel(speaker, True)
                self.bridge.chat_window(speaker, True)
            except RconError:
                pass
            adopted = result.get("adopted")
            if adopted:
                self.adopt(adopted)
                self.say(f"{speaker}님은 관찰자입니다. 쓰시던 캐릭터는 {adopted}이(가) 이어받았습니다.")
            else:
                self.say(f"{speaker}님은 관찰자입니다.")
            return True

        if kind == "unobserver":
            try:
                self.bridge.unspectate(speaker)
                self.say(f"{speaker}님 몸으로 돌아왔습니다.")
            except RconError as exc:
                self.say(f"복귀 실패: {exc}")
            return True

        return False

    # -- loop -------------------------------------------------------------

    def tick(self) -> None:
        self.collect_thoughts()
        self.collect_orders()
        for worker in self.workers.values():
            self.check_errand(worker)
        self.report_finished()
        self.keep_research_going()
        self.board.expire(time.monotonic())
        self.show_board()

        log = self.bridge.chat(self.since_tick)
        self.since_tick = log.get("tick", self.since_tick)
        messages = log.get("messages") or []

        for line in messages:
            speaker = line.get("player", "")
            text = line.get("message", "")
            print(f"[chat] {speaker}: {text}")
            # 반장이 유일한 입구다. 예전에는 문장에서 낱말을 주워 인텐트를
            # 만들었는데, «작업이 멈춰있음»이라는 보고에서 «멈춰»를 집어
            # 전원이 정지하는 식으로 계속 틀렸다. 문장은 읽을 줄 아는 쪽이
            # 읽어야 한다.
            self.delegate(text, speaker)

        if messages:
            return

        for worker in self.workers.values():
            if not worker.autopilot:
                continue
            # A long routine holds the slot; do not start a second one on top.
            if not worker.slot.acquire(blocking=False):
                continue
            worker.slot.release()

            try:
                if worker.handle.busy():
                    continue
                snap = worker.snapshot()
            except RconError:
                continue

            # 남이 나에게 부탁하려면 내가 뭘 쥐고 있는지 알아야 한다.
            self.stock[worker.name] = dict(snap.items)
            self.announce_stage(snap)

            self.release(worker)
            # 멈춘 기계가 제일 먼저다. 그 다음이 찬 화로를 비우는 일이고,
            # 새로 캐고 짓는 일은 그 뒤다.
            job = self.tend_job(worker, snap)
            if job is None:
                job = self.harvest_job(worker)
            if job is None:
                job = next_goal(snap, worker.focus, worker.blocked_now(), self.taken(),
                                crew=len(self.workers))

            # «비축»밖에 안 남았다는 건 할 일이 없다는 뜻이지 광석을 더
            # 쌓으라는 뜻이 아니다. 그럴 때 사다리의 다음 단을 물어본다.
            if job is None or job.key.startswith("stock:"):
                chained = self.chain_toward(worker, snap)
                if chained and chained.key not in self.taken() \
                        and chained.key not in worker.blocked_now():
                    job = chained

            # 부탁이 내 일보다 먼저다. 이미 쥔 걸 건네주는 건 걸어가기만
            # 하면 되고, 기다리는 쪽은 그동안 아무것도 못 한다.
            if self.serve_board(worker, snap, idle=job is None):
                continue

            if job is None:
                # 일감 종류가 사람 수보다 적으면 나머지는 서 있게 된다.
                # 광맥은 무한하고 화로는 언제나 배가 고프므로, 정말로 할
                # 일이 없다는 것은 캘 곳이 없다는 뜻일 때뿐이다.
                job = self.keep_busy(worker, snap)
            if job is None:
                if not worker.said_idle:
                    self.say(f"당장 할 일이 없습니다. {mission.briefing(snap)}",
                             who=worker.name)
                    worker.said_idle = True
                continue

            # 재료가 모자란 일은 시작하기 전에 부탁을 붙이고 물러난다.
            # 시작해놓고 실패하는 것보다 낫고, 기다리는 동안 다른 일을 한다.
            # 스스로 만들 수 있는 것은 부탁하지 않는다. 상자가 없다고
            # 부탁을 걸고 일을 접으면, 만들 줄 알면서도 영영 안 만든다 -
            # 실제로 드릴 여덟 대에 상자 다섯 개인 채로 멈춰 있었다.
            short = mission.shortfall(job.needs, snap.items)
            if short and snap.can_make(short[0], short[1]):
                short = None
            if short and not snap.ore(short[0]):
                self.ask_for(worker, short[0], short[1], job.narration)
                worker.block(job.key)
                continue

            worker.said_idle = False
            self.claim(worker, job.key)
            self.say(job.narration, who=worker.name)
            if job.routine:
                self.start_routine(worker, job.routine, job.ore, job.at)
            else:
                worker.watching = worker.handle.submit_plan(job.steps)

    def prime(self) -> None:
        """Start from now.

        The mod keeps the last 50 chat lines, so a fresh crew that polled with no
        `since_tick` would read the whole backlog and start obeying orders given
        twenty minutes ago to a process that no longer exists.
        """
        self.since_tick = self.bridge.chat().get("tick")

    def run(self, interval: float = 1.0) -> None:
        print(f"listening to game chat - {len(self.workers)} agent(s)"
              + (", working on their own" if self.autopilot else ", waiting for orders")
              + " - ctrl-c to stop")
        while True:
            try:
                self.tick()
            except RconError as exc:
                print(f"[warn] {exc}", file=sys.stderr)
                time.sleep(3)
            time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agents", type=int, default=2, help="how many to start with")
    parser.add_argument("--manual", action="store_true",
                        help="wait for orders instead of working on their own")
    parser.add_argument("--no-llm", action="store_true",
                        help="rules only; do not ask the Claude CLI about unknown lines")
    parser.add_argument("--observer", metavar="PLAYER",
                        help="put this player in the observer seat on startup")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    bridge = AIBridge()
    crew = Crew(bridge, autopilot=not args.manual, use_llm=not args.no_llm)
    crew.prime()
    crew.sync_roster()

    if args.observer:
        try:
            free = next((s for s in CALL_SIGNS if s not in crew.workers), None)
            result = bridge.spectate(args.observer, adopt_as=free)
            if result.get("adopted"):
                crew.adopt(result["adopted"])
        except RconError as exc:
            print(f"[warn] could not switch {args.observer} to observer: {exc}", file=sys.stderr)

    while len(crew.workers) < max(1, args.agents):
        if not crew.hire():
            break

    roles = ", ".join(f"{w.name}={w.focus}" for w in crew.workers.values())
    crew.say(f"{len(crew.workers)}명 나왔습니다 ({roles}). "
             + ("지시 기다리겠습니다." if args.manual else "알아서 진행하겠습니다.")
             + f" '{'/'.join(crew.names)}' 또는 '1번', '모두'로 부르시면 됩니다.")
    try:
        crew.run(interval=args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        # Leaving without saving is how an hour of the crew's work disappears.
        try:
            bridge.save()
            print("saved the world before leaving")
        except RconError as exc:
            print(f"[warn] could not save on the way out: {exc}", file=sys.stderr)
        bridge.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

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
        elif snap.building("lab") and not snap.building("steam-engine"):
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
        # Own patch first, then whatever else still lacks a drill.
        for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
            if snap.ore(ore) and drills < len(FOCUS_ORDER):
                jobs.append(Job(f"{ore} 자동 채굴을 준비하겠습니다.",
                                key=f"automate:{ore}", routine="automate", ore=ore,
                                needs={DRILL: 1, CHEST: 1, "coal": DRILL_FUEL}))
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
    for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
        spot = snap.ore(ore)
        if spot and snap.have(ore) < STOCKPILE:
            jobs.append(Job(f"{ore} 비축분을 채우겠습니다.", key=f"stock:{ore}", steps=[
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
            return Job(f"{target}을(를) 만들려면 {name}이(가) 필요합니다. 제련하겠습니다.",
                       key=f"chain:smelt:{name}@{furnace['x']:.0f},{furnace['y']:.0f}",
                       needs={"coal": FURNACE_FUEL},
                       steps=[
                           ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
                           ("insert", {"name": step.get("input") or _ore_for(name),
                                       "count": int(step.get("input_count") or count),
                                       **furnace}),
                           ("wait", {"ticks": _smelt_ticks(step, count)}),
                           ("take", {"name": name, "count": count, **furnace}),
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
        """Pump on the shore, boiler behind it, engines behind that, coal in.

        The pieces have to line up or the pipes never meet, so instead of
        trusting an offset table this walks outward along the pump's axis and
        lets the game say where each piece fits.

        보일러 하나는 증기 60/초를 만들고 증기기관 하나는 30/초를 먹는다.
        기관을 하나만 세우면 보일러가 절반을 버리면서 석탄은 다 태운다.
        """
        name = worker.name
        AXIS = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}   # N, E, S, W

        try:
            snap = worker.snapshot()
            if snap.building("steam-engine"):
                self.say("이미 발전기가 있습니다.", who=name)
                return

            for part, count in (("offshore-pump", 1), ("boiler", 1),
                                ("steam-engine", ENGINES_PER_BOILER),
                                ("small-electric-pole", 1)):
                if not self.ensure(worker, part, count):
                    worker.block("power")
                    return

            sites = self.bridge.water_sites(snap.x, snap.y, radius=150, wanted=4)
            if not sites:
                self.say("주변 150타일 안에 물이 없습니다. 전력은 나중에.", who=name)
                worker.block("power", 600)
                return

            for site in sites:
                step = AXIS.get(site.get("direction", 0), (0, -1))
                try:
                    pump = worker.handle.place("offshore-pump", site["x"], site["y"],
                                               direction=site["direction"], timeout=300)
                except TaskFailed:
                    continue

                boiler = None
                for away in range(2, 7):
                    try:
                        boiler = worker.handle.place(
                            "boiler", pump["x"] + step[0] * away, pump["y"] + step[1] * away,
                            direction=site["direction"], timeout=180)
                        break
                    except TaskFailed:
                        continue
                if not boiler:
                    self.say("보일러를 붙일 자리가 없습니다. 다른 물가를 봅니다.", who=name)
                    continue

                # 기관은 앞의 것에 이어 붙인다. 증기기관은 3x5라 축 방향으로
                # 5타일을 먹으므로, 다음 자리는 앞 기관에서부터 다시 찾는다.
                engines = []
                anchor = boiler
                for _ in range(ENGINES_PER_BOILER):
                    placed = None
                    for away in range(3, 10):
                        try:
                            placed = worker.handle.place(
                                "steam-engine",
                                anchor["x"] + step[0] * away, anchor["y"] + step[1] * away,
                                direction=site["direction"], timeout=180)
                            break
                        except TaskFailed:
                            continue
                    if not placed:
                        break
                    engines.append(placed)
                    anchor = placed
                if not engines:
                    self.say("증기기관 자리가 없습니다.", who=name)
                    continue
                engine = engines[0]

                worker.handle.insert("coal", boiler["x"], boiler["y"], count=20, timeout=180)

                # Did it actually start? A boiler with no water and an engine
                # with no steam look exactly like a working pair from outside.
                running = [e for e in self.bridge.inspect(engine["x"], engine["y"], 3)
                           if e.get("name") == "steam-engine"]
                energy = running[0].get("energy", 0) if running else 0
                self.say(f"발전기를 세웠습니다. 기관 {len(engines)}대, "
                         f"({engine['x']:.0f}, {engine['y']:.0f}) "
                         + ("전력 생산 중입니다." if energy and energy > 0
                            else "아직 증기가 안 올라왔습니다.")
                         + ("" if len(engines) >= ENGINES_PER_BOILER
                            else " 자리가 좁아 기관을 다 못 놨습니다."), who=name)
                return

            self.say("쓸 만한 물가를 못 찾았습니다.", who=name)
            worker.block("power", 300)

        except TaskFailed as exc:
            worker.block("power")
            self.say(f"전력 구축 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("power")
            self.say(f"전력 구축 중 오류: {exc}", who=name)

    def rescue(self, worker: Worker, at: dict) -> None:
        """멈춰 선 채굴기에 출구 상자를 달아주고 연료를 채운다.

        어디가 출구인지는 채굴기에게 묻는다. 방향을 짐작해서 놓으면 상자는
        서 있는데 광석은 여전히 땅에 쌓인다.
        """
        name = worker.name
        if not at:
            return
        try:
            found = [e for e in self.bridge.inspect(at["x"], at["y"], 2.5)
                     if e.get("name") == DRILL and e.get("drop_x") is not None]
            if not found:
                # 누가 먼저 고쳤거나 치웠다. 실패가 아니다.
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}")
                return
            drill = found[0]

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

            self.say(f"{ore} 광맥에 채굴기를 놓겠습니다. ({spot['x']:.0f}, {spot['y']:.0f})", who=name)
            drill = worker.handle.place(DRILL, spot["x"], spot["y"], snap=True, timeout=300)

            # The drill picks its own output tile; ask it rather than guessing.
            found = [e for e in self.bridge.inspect(drill["x"], drill["y"], 2)
                     if e.get("name") == DRILL and e.get("drop_x") is not None]
            if not found:
                self.say("채굴기는 놨는데 산출 위치를 못 읽었습니다.", who=name)
                return
            drop = found[0]
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

        # 새로 캐기 전에 이미 녹아 있는 걸 먼저 꺼낸다. 제련을 시켜놓고
        # 못 돌아오는 일은 계속 생기고, 그때마다 판금은 화로에 남는다.
        harvest = self.harvest_job(worker, answer)
        if harvest:
            return harvest

        # 사슬의 맨 밑이 땅이면 캐러 간다. 무엇을 얼마나 캐야 하는지도
        # 게임이 세어줬다.
        for ore, amount in sorted((answer.get("mine") or {}).items()):
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

    def harvest_job(self, worker: Worker, answer: dict) -> Job | None:
        """사슬이 요구하는 것 중 화로 안에 이미 있는 것을 꺼내온다."""
        wanted = {name for name in (answer.get("mine") or {})}
        for step in _as_rows(answer.get("steps")):
            wanted.add(step.get("name"))
        for step in _as_rows(answer.get("steps")):
            if step.get("input"):
                wanted.add(step["input"])

        try:
            stock = self.bridge.furnace_stock(worker.name)
        except RconError:
            return None

        for entry in stock:
            if entry.get("name") not in wanted:
                continue
            return Job(f"화로에 {entry['name']} {entry['count']}개가 남아 있습니다. 꺼내오겠습니다.",
                       key=f"harvest:{entry['x']:.0f},{entry['y']:.0f}:{entry['name']}",
                       steps=[("take", {"name": entry["name"], "count": entry["count"],
                                        "x": entry["x"], "y": entry["y"]})])
        return None

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
                # A watcher with no body should not have to ask for the list.
                self.bridge.panel(speaker, True)
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
                if not worker.said_idle:
                    self.say(f"당장 할 일이 없습니다. {mission.briefing(snap)}",
                             who=worker.name)
                    worker.said_idle = True
                continue

            # 재료가 모자란 일은 시작하기 전에 부탁을 붙이고 물러난다.
            # 시작해놓고 실패하는 것보다 낫고, 기다리는 동안 다른 일을 한다.
            short = mission.shortfall(job.needs, snap.items)
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

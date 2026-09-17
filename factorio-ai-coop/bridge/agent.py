"""The crew: several AI characters listening to one human's orders in chat.

Three layers, deliberately separated:

  split_target()  pure: who is being addressed
  parse()         pure: what they are being told to do
  next_goal()     pure: a world snapshot -> (what to say, what to queue)
  Crew            the only part that touches the game

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
import queue
import re
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import brain
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


# ------------------------------------------------------------------- parsing

# No single ambiguous syllables here. "동" for copper also lives inside "자동화"
# and "수동", which is how "석탄 자동화" once turned into a request for copper.
ORES = {
    "철광석": "iron-ore", "철광": "iron-ore", "철": "iron-ore", "iron": "iron-ore",
    "구리": "copper-ore", "copper": "copper-ore",
    "석탄": "coal", "숯": "coal", "coal": "coal",
    "석재": "stone", "돌": "stone", "stone": "stone",
}

PLACEABLE = {
    "벨트": "transport-belt", "컨베이어": "transport-belt", "belt": "transport-belt",
    "화로": "stone-furnace", "용광로": "stone-furnace", "furnace": "stone-furnace",
    "상자": "iron-chest", "궤짝": "iron-chest", "chest": "iron-chest",
    "채굴기": DRILL, "드릴": DRILL, "drill": DRILL,
}

KOREAN_NUMERALS = {"하나": 1, "둘": 2, "셋": 3, "넷": 4, "다섯": 5, "열": 10, "스물": 20}

ALL = "*"


def _lookup(text: str, table: dict[str, str]) -> str | None:
    """Longest keyword wins, so "철광석" never resolves through "철"."""
    for word in sorted(table, key=len, reverse=True):
        if word in text:
            return table[word]
    return None


def _count(text: str, default: int) -> int:
    digits = re.search(r"(\d+)", text)
    if digits:
        return max(1, min(1000, int(digits.group(1))))
    for word, value in KOREAN_NUMERALS.items():
        if word in text:
            return value
    return default


def split_target(text: str, names: list[str]) -> tuple[str | None, str]:
    """Pull an addressee off the front of a line.

    "alpha 철 캐와", "2번 이리와", "모두 멈춰". Returns (target, rest), where
    target is an agent name, ALL, or None when nobody was named.
    """
    stripped = text.strip()
    lowered = stripped.lower()

    for word in ("모두", "전부", "다같이", "everyone", "all"):
        if lowered.startswith(word):
            return ALL, stripped[len(word):].strip(" ,:아야!")

    for name in sorted(names, key=len, reverse=True):
        if lowered.startswith(name.lower()):
            return name, stripped[len(name):].strip(" ,:아야!")

    ordinal = re.match(r"^(\d+)\s*번?\s*", stripped)
    if ordinal:
        index = int(ordinal.group(1)) - 1
        if 0 <= index < len(names):
            return names[index], stripped[ordinal.end():].strip(" ,:아야!")

    return None, stripped


def share(intent: Intent, crew_size: int, index: int) -> Intent:
    """One agent's share of an order given to several.

    "철 30개 캐와" to three agents means thirty ore in total, not ninety, so the
    count is divided and the remainder handed to the first few. Mining targets
    are also nudged apart, or all of them walk onto the same tile and shuffle.
    """
    kind, params = intent
    if crew_size <= 1 or "count" not in params:
        return intent

    base, extra = divmod(params["count"], crew_size)
    portion = base + (1 if index < extra else 0)
    if portion < 1:
        portion = 1

    shared = {**params, "count": portion}
    if kind == "mine":
        shared["spread"] = index
    return kind, shared


def parse(message: str) -> list[Intent]:
    """Turn one chat line into intents. Unknown lines produce nothing."""
    text = message.strip().lower()
    if not text:
        return []

    if any(w in text for w in ("멈춰", "멈춤", "그만", "스톱", "정지", "취소", "stop", "halt")):
        return [("stop", {})]

    # Roster management before anything else: these name no resource and would
    # otherwise fall through to the model.
    if any(w in text for w in ("추가", "한명 더", "한 명 더", "늘려", "add agent", "새 에이전트")):
        return [("add_agent", {"count": _count(text, 1)})]
    if any(w in text for w in ("빼", "제거", "내보내", "remove agent")):
        return [("remove_agent", {})]
    if any(w in text for w in ("누구", "목록", "몇명", "몇 명", "roster", "list")):
        return [("list_agents", {})]
    if any(w in text for w in ("관찰자", "구경", "observer", "spectate", "관전")):
        return [("observer", {})]
    if any(w in text for w in ("복귀", "몸 줘", "몸줘", "내려가", "unspectate")):
        return [("unobserver", {})]

    # "석탄 자동화" is a request for drills and chests, not a request to flip an
    # autopilot flag. It has to be tested before the bare mode keywords, or the
    # "자동" inside "자동화" swallows the sentence.
    if any(w in text for w in ("자동화", "automate", "자동으로")):
        return [("automate", {"ore": _lookup(text, ORES)})]

    # Mode switches are bare instructions. If the line also names a resource or
    # a building, the human is asking for work, not for a mode.
    mentions_work = _lookup(text, ORES) or _lookup(text, PLACEABLE)
    if not mentions_work:
        if any(w in text for w in ("알아서", "스스로", "자율", "자동", "auto")):
            return [("autopilot_on", {})]
        if any(w in text for w in ("수동", "대기", "기다려", "manual", "wait")):
            return [("autopilot_off", {})]

    if any(w in text for w in ("이리", "따라", "와봐", "이쪽", "come", "follow")):
        return [("come", {})]
    if any(w in text for w in ("가방", "인벤", "소지품", "inventory")):
        return [("report_inventory", {})]
    if any(w in text for w in ("뭐있", "정찰", "주변", "자원", "스캔", "scout", "scan")):
        return [("report_scout", {})]
    if any(w in text for w in ("상태", "뭐해", "status")):
        return [("report_status", {})]

    entity = _lookup(text, PLACEABLE)
    if entity and any(v in text for v in ("깔", "놔", "놓", "설치", "지어", "place", "build")):
        return [("place", {"entity": entity, "count": _count(text, 1)})]

    ore = _lookup(text, ORES)
    if ore and any(v in text for v in ("캐", "채굴", "mine", "가져")):
        return [("mine", {"ore": ore, "count": _count(text, 20)})]

    if entity and any(v in text for v in ("만들", "제작", "craft")):
        return [("craft", {"recipe": entity, "count": _count(text, 1)})]

    return []


# ------------------------------------------------------------------ planning

FURNACE_FUEL = 5
SMELT_BATCH = 20
PLATES_FOR_TOOLS = 12   # enough to hand-craft a drill and a chest
STOCKPILE = 30
BACKOFF_SECONDS = 120   # how long a failed kind of work stays off the ladder

# Each agent takes one resource so a crew does not all stand on the same patch.
FOCUS_ORDER = ["iron-ore", "coal", "copper-ore", "stone"]


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


def plan(snap: Snapshot, focus: str = "iron-ore") -> list[Job]:
    """Everything worth doing right now, best first.

    Pure, and deliberately a *list*: the crew hands out different entries to
    different agents. A single "what should I do" answer is how three agents end
    up shoulder to shoulder on the same rock.
    """
    jobs: list[Job] = []
    furnace = snap.building("stone-furnace")
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
        elif furnace:
            # Keyed by the furnace, not by the agent: two agents stuffing one
            # furnace and both waiting for its output is not teamwork.
            jobs.append(Job("화로에 석탄과 철광석을 넣고 제련합니다.",
                            key=f"smelt:{furnace['x']:.0f},{furnace['y']:.0f}", steps=[
                                ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
                                ("insert", {"name": "iron-ore", "count": SMELT_BATCH, **furnace}),
                                ("wait", {"ticks": 60 * 40}),
                                ("take", {"name": "iron-plate", "count": SMELT_BATCH, **furnace}),
                            ]))

    # --- mechanise: a drill beats hands ----------------------------------
    # A drill costs iron *and* stone (through the furnace in its recipe). Asking
    # the game whether it is affordable is the difference between building one
    # and announcing it forever while the craft fails.
    if snap.have(DRILL) >= 1 or (snap.can_make(DRILL) and snap.can_make(CHEST)):
        # Own patch first, then whatever else still lacks a drill.
        for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
            if snap.ore(ore) and drills < len(FOCUS_ORDER):
                jobs.append(Job(f"{ore} 자동 채굴을 준비하겠습니다.",
                                key=f"automate:{ore}", routine="automate", ore=ore))
    elif snap.have("iron-plate") >= PLATES_FOR_TOOLS and not snap.can_make("stone-furnace"):
        spot = snap.ore("stone")
        if spot:
            jobs.append(Job("채굴기를 만들려면 돌이 더 필요합니다.", key="gather:stone",
                            steps=[("mine", {**spot, "count": 10})]))

    # --- keep patches stocked, starting with this agent's own ------------
    for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
        spot = snap.ore(ore)
        if spot and snap.have(ore) < STOCKPILE:
            jobs.append(Job(f"{ore} 비축분을 채우겠습니다.", key=f"stock:{ore}", steps=[
                ("mine", {**spot, "count": STOCKPILE, "search_radius": 10,
                          "timeout_ticks": 60 * 60 * 5})
            ]))

    return jobs


def next_goal(snap: Snapshot, focus: str = "iron-ore",
              blocked: frozenset[str] = frozenset(),
              taken: frozenset[str] = frozenset()) -> Job | None:
    """The best job this agent may take.

    `blocked` is what has just failed for it - re-proposing that is how one
    unreachable furnace fills the chat with the same line forever. `taken` is
    what the rest of the crew is already doing.
    """
    for job in plan(snap, focus):
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

    def snapshot(self, radius: int = 200) -> Snapshot:
        world = self.handle.observe(radius=radius)
        inventory = self.handle.inventory()
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
        # job key -> agent holding it. This is the whole of the orchestration:
        # nobody may start work someone else has already taken.
        self.claims: dict[str, str] = {}

    # -- roster -----------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self.workers)

    def adopt(self, name: str) -> Worker:
        focus = FOCUS_ORDER[len(self.workers) % len(FOCUS_ORDER)]
        worker = Worker(self.bridge.agent(name), focus=focus)
        worker.autopilot = self.autopilot
        self.workers[name] = worker
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

    def targets(self, target: str | None) -> list[Worker]:
        """Who carries out an order.

        An unaddressed order goes to the whole crew. Having hired several
        agents, watching one of them walk off alone is not what anybody meant;
        naming one is how you ask for that.
        """
        if target and target != ALL and target in self.workers:
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

    def start_automation(self, worker: Worker, ore: str | None) -> bool:
        """Run the build-out off the main loop; it walks, crafts and builds."""
        if not worker.slot.acquire(blocking=False):
            return False

        def run() -> None:
            try:
                self.automate(worker, ore)
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] automate failed: {exc!r}", file=sys.stderr)
                self.thoughts.put((worker.name, "자동화 중 문제가 생겼습니다.", []))
            finally:
                worker.slot.release()

        threading.Thread(target=run, daemon=True).start()
        return True

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
            worker.watching = still

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
            if not self.start_automation(worker, params.get("ore")):
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

        if kind == "add_agent":
            for _ in range(min(params.get("count", 1), len(CALL_SIGNS))):
                if not self.hire():
                    break
            return True

        if kind == "remove_agent":
            victim = target if target and target != ALL else (self.names[-1] if self.names else None)
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
        self.report_finished()

        log = self.bridge.chat(self.since_tick)
        self.since_tick = log.get("tick", self.since_tick)
        messages = log.get("messages") or []

        for line in messages:
            speaker = line.get("player", "")
            text = line.get("message", "")
            print(f"[chat] {speaker}: {text}")

            target, rest = split_target(text, self.names)
            intents = parse(rest)

            if not intents:
                # Free-form text goes to one agent, not the whole crew: each
                # call costs a Claude round trip, and N of them would answer the
                # same sentence N times.
                if self.use_llm:
                    crew = self.targets(target)
                    if crew:
                        spokesman = crew[0]
                        self.ask_llm(spokesman, rest, spokesman.snapshot())
                continue

            for intent in intents:
                if self.handle_crew(intent, speaker, target):
                    continue
                crew = self.targets(target)
                # An explicit order always wins over what an agent chose to do.
                for index, worker in enumerate(crew):
                    worker.handle.cancel()
                    worker.watching = []
                    self.release(worker)
                    self.handle(worker, share(intent, len(crew), index), speaker)

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

            self.release(worker)
            job = next_goal(snap, worker.focus, worker.blocked_now(), self.taken())
            if job is None:
                if not worker.said_idle:
                    self.say("당장 할 일이 없습니다. 시키실 게 있으면 말씀해 주세요.", who=worker.name)
                    worker.said_idle = True
                continue

            worker.said_idle = False
            self.claim(worker, job.key)
            self.say(job.narration, who=worker.name)
            if job.routine == "automate":
                self.start_automation(worker, job.ore)
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
        bridge.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""The crew: several AI characters listening to one human's orders in chat.

Three layers, deliberately separated:

  split_target()  pure: who is being addressed
  parse()         pure: what they are being told to do
  next_goal()     pure: a world snapshot -> (what to say, what to queue)
  Crew            the only part that touches the game

Keeping the pure parts pure means the interesting logic is testable without a
running Factorio server, which matters because it is exactly the logic that is
hard to debug through a game window.

    python bridge/agent.py                  # one agent, obeys chat
    python bridge/agent.py --agents 3       # three of them
    python bridge/agent.py --auto           # they also work while idle
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
    buildings: dict[str, dict] = field(default_factory=dict)
    resources: dict[str, dict] = field(default_factory=dict)
    humans: list[dict] = field(default_factory=list)
    mates: list[dict] = field(default_factory=list)

    def have(self, item: str) -> int:
        return self.items.get(item, 0)

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
TARGET_PLATES = 50   # stop bootstrapping here instead of mining forever


def next_goal(snap: Snapshot) -> tuple[str, list[Step]] | None:
    """The self-directed ladder: bootstrap a working iron-plate loop.

    Pure: given the same snapshot it always proposes the same next move, which
    makes behaviour reproducible and the ladder unit-testable.
    """
    # The goal, checked first: without this the ladder below always finds
    # another reason to go mining and the agent never stands still.
    if snap.have("iron-plate") >= TARGET_PLATES:
        return None

    furnace = snap.building("stone-furnace")

    if snap.have("stone") < 5 and not furnace and snap.have("stone-furnace") < 1:
        spot = snap.ore("stone")
        if spot:
            return "돌부터 캐서 화로를 만들겠습니다.", [("mine", {**spot, "count": 5})]

    if snap.have("stone-furnace") < 1 and not furnace and snap.have("stone") >= 5:
        return "화로를 제작합니다.", [("craft", {"recipe": "stone-furnace", "count": 1})]

    if not furnace and snap.have("stone-furnace") >= 1:
        return "화로를 설치합니다.", [
            ("build", {"name": "stone-furnace", "x": snap.x + 3, "y": snap.y + 3, "snap": True})
        ]

    if snap.have("coal") < FURNACE_FUEL:
        spot = snap.ore("coal")
        if spot:
            return "연료가 없습니다. 석탄 캐러 갑니다.", [("mine", {**spot, "count": 10})]

    if furnace and snap.have("coal") >= FURNACE_FUEL and snap.have("iron-ore") < SMELT_BATCH:
        spot = snap.ore("iron-ore")
        if spot:
            return "철광석 캐러 갑니다.", [("mine", {**spot, "count": SMELT_BATCH})]

    if furnace and snap.have("iron-ore") >= SMELT_BATCH and snap.have("coal") >= FURNACE_FUEL:
        return "화로에 석탄과 철광석을 넣고 제련합니다.", [
            ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
            ("insert", {"name": "iron-ore", "count": SMELT_BATCH, **furnace}),
            ("wait", {"ticks": 60 * 40}),
            ("take", {"name": "iron-plate", "count": SMELT_BATCH, **furnace}),
        ]

    return None


# -------------------------------------------------------------------- worker

class Worker:
    """One agent, plus the bookkeeping that belongs to it alone."""

    def __init__(self, handle: Agent) -> None:
        self.handle = handle
        self.name = handle.name
        self.autopilot = False
        self.watching: list[int] = []
        self.said_idle = False
        # One slow job (an LLM call, a build-out) at a time per agent.
        self.slot = threading.Semaphore(1)

    def snapshot(self, radius: int = 200) -> Snapshot:
        world = self.handle.observe(radius=radius)
        humans = world.get("humans") or {}
        mates = world.get("agents") or {}
        return Snapshot(
            tick=world.get("tick", 0),
            x=world.get("position", {}).get("x", 0.0),
            y=world.get("position", {}).get("y", 0.0),
            items=self.handle.items(),
            buildings=world.get("buildings") or {},
            resources=world.get("resources") or {},
            humans=list(humans.values()) if isinstance(humans, dict) else humans,
            mates=list(mates.values()) if isinstance(mates, dict) else mates,
        )


# ---------------------------------------------------------------------- crew

class Crew:
    def __init__(self, bridge: AIBridge, autopilot: bool = False,
                 use_llm: bool = True) -> None:
        self.bridge = bridge
        self.autopilot = autopilot
        self.use_llm = use_llm
        self.since_tick: int | None = None
        self.workers: dict[str, Worker] = {}
        self.thoughts: queue.Queue[tuple[str, str, list[Step]]] = queue.Queue()

    # -- roster -----------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self.workers)

    def adopt(self, name: str) -> Worker:
        worker = Worker(self.bridge.agent(name))
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
        self.workers.pop(name, None)
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
        if worker.handle.items().get(item, 0) >= count:
            return True
        try:
            self.say(f"{item}이(가) 부족해서 제작합니다.", who=worker.name)
            worker.handle.craft(item, count=count)
            return True
        except TaskFailed as exc:
            self.say(f"{item}을(를) 못 만들겠습니다: {exc.task.get('error')}", who=worker.name)
            return False

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
            self.say(f"자동화 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
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
                    self.say(f"{state.get('type')} 실패: {state.get('error')}", who=worker.name)
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
            if not worker.slot.acquire(blocking=False):
                self.say("앞의 작업을 아직 하는 중입니다.", who=name)
                return
            worker.autopilot = False   # a build-out should not race the ladder

            def run_automation() -> None:
                try:
                    self.automate(worker, params.get("ore"))
                except Exception as exc:  # noqa: BLE001
                    print(f"[warn] automate failed: {exc!r}", file=sys.stderr)
                    self.thoughts.put((name, "자동화 중 문제가 생겼습니다.", []))
                finally:
                    worker.slot.release()

            threading.Thread(target=run_automation, daemon=True).start()

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
                    self.handle(worker, share(intent, len(crew), index), speaker)

        if messages:
            return

        for worker in self.workers.values():
            if not worker.autopilot:
                continue
            try:
                if worker.handle.busy():
                    continue
                snap = worker.snapshot()
            except RconError:
                continue
            goal = next_goal(snap)
            if goal is None:
                if not worker.said_idle:
                    self.say("당장 할 일이 없습니다. 시키실 게 있으면 말씀해 주세요.", who=worker.name)
                    worker.said_idle = True
                continue
            worker.said_idle = False
            narration, steps = goal
            self.say(narration, who=worker.name)
            worker.watching = worker.handle.submit_plan(steps)

    def prime(self) -> None:
        """Start from now.

        The mod keeps the last 50 chat lines, so a fresh crew that polled with no
        `since_tick` would read the whole backlog and start obeying orders given
        twenty minutes ago to a process that no longer exists.
        """
        self.since_tick = self.bridge.chat().get("tick")

    def run(self, interval: float = 1.0) -> None:
        print(f"listening to game chat - {len(self.workers)} agent(s)"
              + (", autopilot on" if self.autopilot else "")
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
    parser.add_argument("--agents", type=int, default=1, help="how many to start with")
    parser.add_argument("--auto", action="store_true", help="they work on their own when idle")
    parser.add_argument("--no-llm", action="store_true",
                        help="rules only; do not ask the Claude CLI about unknown lines")
    parser.add_argument("--observer", metavar="PLAYER",
                        help="put this player in the observer seat on startup")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    bridge = AIBridge()
    crew = Crew(bridge, autopilot=args.auto, use_llm=not args.no_llm)
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

    crew.say(f"{len(crew.workers)}명 대기 중입니다. "
             f"'{'/'.join(crew.names)}' 또는 '1번', '모두'로 부르시면 됩니다.")
    try:
        crew.run(interval=args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        bridge.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Autonomous coop agent: listens to game chat, obeys, and plays on its own.

Three layers, deliberately separated:

  parse()      pure: a chat line -> intents
  next_goal()  pure: a world snapshot -> (what to say, what to queue)
  Agent        the only part that touches the game

Keeping the first two pure means the interesting logic is testable without a
running Factorio server, which matters because the interesting logic is exactly
the part that is hard to debug through a game window.

    python bridge/agent.py            # obey chat, stay idle otherwise
    python bridge/agent.py --auto     # also play by itself when idle
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
from client import AIBridge, RconError, TaskFailed

DRILL = "burner-mining-drill"
CHEST = "iron-chest"
DRILL_FUEL = 10

# --------------------------------------------------------------------- types

Step = tuple[str, dict]
Intent = tuple[str, dict]


@dataclass
class Snapshot:
    tick: int = 0
    x: float = 0.0
    y: float = 0.0
    items: dict[str, int] = field(default_factory=dict)
    buildings: dict[str, dict] = field(default_factory=dict)
    resources: dict[str, dict] = field(default_factory=dict)
    humans: list[dict] = field(default_factory=list)

    def have(self, item: str) -> int:
        return self.items.get(item, 0)

    def ore(self, name: str) -> dict | None:
        found = self.resources.get(name)
        return found.get("nearest") if found else None

    def building(self, name: str) -> dict | None:
        found = self.buildings.get(name)
        return found.get("nearest") if found else None


# ------------------------------------------------------------------- parsing

# No single ambiguous syllables here. "동" for copper also lives inside
# "자동화" and "수동", which is how "석탄 자동화" once turned into a request to
# mine copper.
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
    "채굴기": "burner-mining-drill", "드릴": "burner-mining-drill", "drill": "burner-mining-drill",
}

KOREAN_NUMERALS = {"하나": 1, "둘": 2, "셋": 3, "넷": 4, "다섯": 5, "열": 10, "스물": 20}


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


def parse(message: str) -> list[Intent]:
    """Turn one chat line into intents. Unknown lines produce nothing."""
    text = message.strip().lower()
    if not text:
        return []

    if any(w in text for w in ("멈춰", "멈춤", "그만", "스톱", "정지", "취소", "stop", "halt")):
        return [("stop", {})]

    # "석탄 자동화" is a request for drills and chests, not a request to flip my
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
    makes the agent's behaviour reproducible and the ladder unit-testable.
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

    if snap.have("iron-plate") >= 10:
        return None  # the loop has closed; nothing urgent left to bootstrap
    return None


# --------------------------------------------------------------------- agent

class Agent:
    def __init__(self, ai: AIBridge, autopilot: bool = False, use_llm: bool = True) -> None:
        self.ai = ai
        self.autopilot = autopilot
        self.use_llm = use_llm
        self.since_tick: int | None = None
        self.pending: list[int] = []
        self.watching: list[int] = []
        self.said_idle = False

        # The model takes several seconds to answer. Doing that on the main
        # loop would stop the agent hearing "멈춰" for the whole call, which is
        # exactly when a human is most likely to type it.
        self.thoughts: queue.Queue[tuple[str, list[Step]]] = queue.Queue()
        self.asking = threading.Semaphore(1)

    # -- world ------------------------------------------------------------

    def snapshot(self, radius: int = 200) -> Snapshot:
        world = self.ai.observe(radius=radius)
        humans = world.get("humans") or {}
        if isinstance(humans, dict):
            humans = list(humans.values())
        return Snapshot(
            tick=world.get("tick", 0),
            x=world.get("position", {}).get("x", 0.0),
            y=world.get("position", {}).get("y", 0.0),
            items=self.ai.inventory().get("items", {}),
            buildings=world.get("buildings") or {},
            resources=world.get("resources") or {},
            humans=humans,
        )

    def busy(self) -> bool:
        status = self.ai.status()
        return bool(status.get("current")) or bool(status.get("queued"))

    def say(self, text: str) -> None:
        print(f"[say] {text}")
        self.ai.say(text)

    def queue(self, steps: list[Step]) -> None:
        self.pending = self.ai.submit_plan(steps)
        self.watching = list(self.pending)

    # -- the slow brain ---------------------------------------------------

    def ask_llm(self, message: str, snap: Snapshot) -> None:
        """Hand an unrecognised line to the model, off the main loop."""
        if not self.asking.acquire(blocking=False):
            self.say("아직 앞의 말을 생각하는 중입니다. 잠시만요.")
            return

        def worker() -> None:
            try:
                answer = brain.think(message, snap)
                if answer is None:
                    self.thoughts.put(("무슨 말인지 모르겠습니다. 다시 말씀해 주시겠어요?", []))
                else:
                    self.thoughts.put(answer)
            except Exception as exc:  # noqa: BLE001 - a dead thread must still answer
                print(f"[warn] brain failed: {exc!r}", file=sys.stderr)
                self.thoughts.put(("생각하다 문제가 생겼습니다. 다시 말씀해 주세요.", []))
            finally:
                self.asking.release()

        threading.Thread(target=worker, daemon=True).start()

    def collect_thoughts(self) -> None:
        while True:
            try:
                say, steps = self.thoughts.get_nowait()
            except queue.Empty:
                return
            if say:
                self.say(say)
            if steps:
                try:
                    self.queue(steps)
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}")

    # -- automation --------------------------------------------------------

    def ensure(self, item: str, count: int = 1) -> bool:
        """Have `count` of an item, crafting it if that is possible."""
        if self.ai.inventory()["items"].get(item, 0) >= count:
            return True
        try:
            self.say(f"{item}이(가) 부족해서 제작합니다.")
            self.ai.craft(item, count=count)
            return True
        except TaskFailed as exc:
            self.say(f"{item}을(를) 못 만들겠습니다: {exc.task.get('error')}")
            return False

    def automate(self, ore: str | None) -> None:
        """Put a drill on an ore patch, a chest where it drops, and fuel in it.

        Runs off the main loop: it walks, crafts and builds, which takes long
        enough that the agent would otherwise stop hearing the human.
        """
        ore = ore or "coal"
        try:
            snap = self.snapshot()
            spot = snap.ore(ore)
            if not spot:
                self.say(f"{ore} 광맥이 주변 200타일 안에 안 보입니다.")
                return

            if not self.ensure(DRILL) or not self.ensure(CHEST):
                return

            self.say(f"{ore} 광맥에 채굴기를 놓겠습니다. ({spot['x']:.0f}, {spot['y']:.0f})")
            drill = self.ai.place(DRILL, spot["x"], spot["y"], snap=True, timeout=300)

            # The drill picks its own output tile; ask it rather than guessing.
            found = [e for e in self.ai.inspect(drill["x"], drill["y"], 2)
                     if e.get("name") == DRILL and e.get("drop_x") is not None]
            if not found:
                self.say("채굴기는 놨는데 산출 위치를 못 읽었습니다. 상자는 직접 놔주세요.")
                return
            drop = found[0]

            self.ai.place(CHEST, drop["drop_x"], drop["drop_y"], timeout=180)

            if self.ai.inventory()["items"].get("coal", 0) < DRILL_FUEL:
                coal = snap.ore("coal")
                if coal:
                    self.say("연료가 부족해 석탄을 조금 캐옵니다.")
                    self.ai.mine(coal["x"], coal["y"], count=DRILL_FUEL,
                                 timeout=300, timeout_ticks=14400)
            self.ai.insert("coal", drill["x"], drill["y"], count=DRILL_FUEL, timeout=180)

            self.say(f"{ore} 자동 채굴 완료. 채굴기가 ({drill['x']:.0f}, {drill['y']:.0f}), "
                     f"상자가 ({drop['drop_x']:.0f}, {drop['drop_y']:.0f})에 있습니다.")
        except TaskFailed as exc:
            self.say(f"자동화 중 막혔습니다: {exc.task.get('error')}")
        except RconError as exc:
            self.say(f"자동화 중 오류: {exc}")

    # -- telling the human how it went -------------------------------------

    def report_finished(self) -> None:
        still: list[int] = []
        for task_id in self.watching:
            state = self.ai.poll(task_id)
            status = state.get("status")
            if status in ("queued", "running"):
                still.append(task_id)
            elif status == "failed":
                self.say(f"{state.get('type')} 실패: {state.get('error')}")
        self.watching = still

    # -- commands ---------------------------------------------------------

    def handle(self, intent: Intent, snap: Snapshot) -> None:
        kind, params = intent

        if kind == "stop":
            self.autopilot = False
            self.ai.cancel_all()
            self.say("멈췄습니다.")

        elif kind == "autopilot_on":
            self.autopilot = True
            self.said_idle = False
            self.say("자율 모드로 전환합니다. 알아서 진행하겠습니다.")

        elif kind == "autopilot_off":
            self.autopilot = False
            self.say("대기하겠습니다. 시키실 때까지 가만히 있겠습니다.")

        elif kind == "come":
            if not snap.humans:
                self.say("접속한 분이 안 보입니다.")
                return
            human = snap.humans[0]
            self.say(f"{human['name']}님께 가겠습니다.")
            self.queue([("walk_to", {"x": human["x"] + 2, "y": human["y"], "tolerance": 1.5})])

        elif kind == "mine":
            ore = params["ore"]
            spot = snap.ore(ore)
            if not spot:
                self.say(f"{ore} 광맥이 주변 200타일 안에 안 보입니다.")
                return
            self.say(f"{ore} {params['count']}개 캐러 갑니다. ({spot['x']:.0f}, {spot['y']:.0f})")
            self.queue([("mine", {**spot, "count": params["count"], "timeout_ticks": 60 * 60 * 5})])

        elif kind == "place":
            entity, count = params["entity"], params["count"]
            have = snap.have(entity)
            if have < 1:
                self.say(f"{entity}이(가) 없습니다. 제작이 필요합니다.")
                return
            count = min(count, have)
            self.say(f"{entity} {count}개 설치하겠습니다.")
            self.queue([
                ("build", {"name": entity, "x": snap.x + 3 + i, "y": snap.y + 3, "snap": True})
                for i in range(count)
            ])

        elif kind == "automate":
            if not self.asking.acquire(blocking=False):
                self.say("앞의 작업을 아직 하는 중입니다.")
                return
            self.autopilot = False   # a build-out should not race the ladder

            def run_automation() -> None:
                try:
                    self.automate(params.get("ore"))
                except Exception as exc:  # noqa: BLE001
                    print(f"[warn] automate failed: {exc!r}", file=sys.stderr)
                    self.thoughts.put(("자동화 중 문제가 생겼습니다.", []))
                finally:
                    self.asking.release()

            threading.Thread(target=run_automation, daemon=True).start()

        elif kind == "craft":
            self.say(f"{params['recipe']} {params['count']}개 제작합니다.")
            self.queue([("craft", {"recipe": params["recipe"], "count": params["count"]})])

        elif kind == "report_inventory":
            items = ", ".join(f"{k} {v}" for k, v in sorted(snap.items.items())) or "빈손입니다"
            self.say(items)

        elif kind == "report_scout":
            lines = sorted(snap.resources.items(), key=lambda kv: kv[1]["nearest_dist"])[:4]
            self.say(" / ".join(
                f"{name} {info['nearest_dist']:.0f}타일 ({info['nearest']['x']:.0f},{info['nearest']['y']:.0f})"
                for name, info in lines) or "주변에 자원이 안 보입니다.")

        elif kind == "report_status":
            mode = "자율" if self.autopilot else "대기"
            self.say(f"{mode} 모드, 위치 ({snap.x:.0f}, {snap.y:.0f}), "
                     f"{'작업 중' if self.busy() else '유휴'}")

    # -- loop -------------------------------------------------------------

    def tick(self) -> None:
        self.collect_thoughts()
        self.report_finished()

        log = self.ai.chat(self.since_tick)
        self.since_tick = log.get("tick", self.since_tick)
        messages = log.get("messages") or []

        if messages:
            snap = self.snapshot()
            for line in messages:
                text = line.get("message", "")
                print(f"[chat] {line.get('player')}: {text}")
                intents = parse(text)
                if not intents:
                    # Nothing the rules recognise. Rather than ignoring the
                    # human, let the model read it.
                    if self.use_llm:
                        self.ask_llm(text, snap)
                    continue
                # A human instruction always wins over whatever the agent
                # decided to do on its own.
                self.ai.cancel_all()
                self.watching = []
                for intent in intents:
                    self.handle(intent, snap)
            return

        if not self.autopilot or self.busy():
            return

        snap = self.snapshot()
        goal = next_goal(snap)
        if goal is None:
            if not self.said_idle:
                self.say("당장 할 일이 없습니다. 시키실 게 있으면 채팅으로 말씀해 주세요.")
                self.said_idle = True
            return
        self.said_idle = False
        narration, steps = goal
        self.say(narration)
        self.queue(steps)

    def prime(self) -> None:
        """Start from now.

        The mod keeps the last 50 chat lines, so a fresh agent that polls with
        no `since_tick` would read the whole backlog and start obeying orders
        given twenty minutes ago to a process that no longer exists.
        """
        self.since_tick = self.ai.chat().get("tick")

    def run(self, interval: float = 1.0) -> None:
        print("listening to game chat"
              + (" (autopilot on)" if self.autopilot else "")
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
    parser.add_argument("--auto", action="store_true", help="play on its own when idle")
    parser.add_argument("--no-llm", action="store_true",
                        help="rules only; do not ask the Claude CLI about unknown lines")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    ai = AIBridge()
    agent = Agent(ai, autopilot=args.auto, use_llm=not args.no_llm)
    agent.prime()
    agent.say("채팅 듣고 있습니다. 편하게 말씀하세요. '알아서 해' 라고 하시면 자율로 진행합니다.")
    try:
        agent.run(interval=args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        ai.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

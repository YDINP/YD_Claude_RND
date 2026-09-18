"""무리 - 게임을 만지는 유일한 곳.



한 반이 하던 일을 책임별로 갈라 놓고 여기서 다시 합친다. 갈래마다
파일 하나이므로, 새 기능을 넣을 자리가 파일 이름만 보고 정해진다.
"""

from __future__ import annotations

import queue
import sys
import threading
import time

import mission
from client import AIBridge, RconError

from settings import DISPATCH_INTERVAL, ORE_BATCH
from world import Snapshot
from jobs import Step
from ladder import next_goal
from worker import Worker


from .roster import RosterMixin
from .talk import TalkMixin
from .supply import SupplyMixin
from .power import PowerMixin
from .hauling import HaulingMixin
from .mining import MiningMixin
from .factory import FactoryMixin
from .survey import SurveyMixin
from .tending import TendingMixin
from .watch import WatchMixin
from .chief import ChiefMixin


class Crew(ChiefMixin, RosterMixin, TalkMixin, SupplyMixin,
           PowerMixin, MiningMixin, HaulingMixin, FactoryMixin,
           SurveyMixin, TendingMixin, WatchMixin):
    """사람 여럿을 데리고 게임 안에서 실제로 일하는 무리."""

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
        self.dispatched_at = 0.0
        # 이번 틱에 찍은 스냅샷들. 배차가 무리 전체를 볼 때 쓴다.
        self.snaps: dict[str, Snapshot] = {}
        # 연료가 떨어진 기계가 얼마나 되는지. 굶는 판에 광석 채굴기를 더
        # 놓으면 굶는 기계만 늘어난다.
        self.starving = False
        self.research_checked = 0.0
        self.threat_checked = 0.0
        self.danger: dict = {}
        self.danger_said: str | None = None
        self.research_said: str | None = None
        # 방금 한 말들. 같은 줄을 되풀이하지 않기 위한 것.
        self.echoes: dict[tuple[str, str], float] = {}
        self.shown: tuple[str, tuple[str, ...]] | None = None

    def prime(self) -> None:
        """Start from now.

        The mod keeps the last 50 chat lines, so a fresh crew that polled with no
        `since_tick` would read the whole backlog and start obeying orders given
        twenty minutes ago to a process that no longer exists.
        """
        self.since_tick = self.bridge.chat().get("tick")

    def tick(self) -> None:
        self.collect_thoughts()
        self.collect_orders()
        for worker in self.workers.values():
            self.check_errand(worker)
        self.report_finished()
        self.keep_research_going()
        self.watch_for_trouble()
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

        # 먼저 «누가 손이 비었는가»를 한 번에 본다. 각자 자기 스냅샷만 보고
        # 가장 급한 일 하나씩 고르면, 급한 일이 셋일 때 나머지는 서 있는다.
        free: list[tuple[Worker, Snapshot]] = []
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
                free.append((worker, worker.snapshot()))
            except RconError:
                continue

        if not free:
            return
        self.snaps = {w.name: snap for w, snap in free}

        # 반장이 판을 보고 나눠준다. 여기서 받은 사람은 각자 고르지 않는다.
        handed: set[str] = set()
        now = time.monotonic()
        # 굶고 있으면 제동을 푼다.
        #
        # 배차(멈춘 기계를 돌보고 길을 깔고 자리를 옮기는 쪽)는 주기적으로만
        # 돌고, 사다리(`next_goal`)는 매 순찰 돈다. 그래서 주기 사이에는
        # 모두가 사다리를 따라간다.
        #
        # 평소에는 그것이 맞다 - 배차는 게임에 열 몇 번을 묻는 무거운 일이라
        # 매 순찰 돌릴 수 없다. 그런데 공장이 꺼져 있을 때는 이야기가 다르다.
        #
        # 실측(181분째): 채굴기 28대 중 도는 것 0, 화로 27대 중 0. 연료
        # 없이 선 채굴기가 열일곱인데 상자에 석탄이 324개 있었다. 요원 다섯은
        # 석탄을 손에 들고도 사다리가 시키는 제련만 반복했다 - 연료를 넣는
        # 일감은 배차 쪽에 있고, 그 배차가 주기를 기다리고 있었기 때문이다.
        #
        # 꺼진 공장에서는 무거운 것이 맞는 것이다.
        if self.starving:
            self.dispatched_at = 0.0
        if now >= self.dispatched_at:
            self.dispatched_at = now + DISPATCH_INTERVAL
            try:
                handed = self.dispatch(free)
            except RconError:
                handed = set()

        for worker, snap in free:
            if worker.name in handed:
                continue

            # 남이 나에게 부탁하려면 내가 뭘 쥐고 있는지 알아야 한다.
            # 점호가 먼저다. 시체에게 일을 나눠줄 수는 없다.
            self.muster()
            # 그다음 반장이 사슬을 본다. 끊긴 데가 바뀌었으면 사람을 돌린다.
            self.steer()
            self.stock[worker.name] = dict(snap.items)
            self.announce_stage(snap)

            self.release(worker)

            # 가방을 부리는 것은 개인 용무지 공용 일감이 아니다. 공용
            # 배차에 섞어뒀더니 주인이 마침 손이 빈 그 순간에만 걸려서,
            # 광석 725개를 안고도 한참을 그냥 다녔다.
            job = self.depot_job(worker, snap)
            if job and job.key != "depot:build":
                self.claim(worker, job.key)
                self.say(job.narration, who=worker.name)
                worker.said_idle = False
                try:
                    worker.watching = worker.handle.submit_plan(job.steps)
                    continue
                except RconError:
                    self.release(worker)

            # 멈춘 기계와 찬 화로는 배차가 맡는다. 여기서 또 물어보면
            # 같은 것을 여덟 번 조회하게 되고, 그 사이 배차가 이미 누구에게
            # 준 일을 두 번 잡으려 든다.
            job = None
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
                # 규칙이 막혔다. 서 있느니 물어본다.
                if self.ask_when_stuck(worker, snap):
                    continue
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
            if short:
                spot = snap.ore(short[0])
                if not spot:
                    self.ask_for(worker, short[0], short[1], job.narration)
                    worker.block(job.key)
                    continue

                # 땅에서 나는 것이 모자란다. 지금까지는 「캘 수 있으니
                # 괜찮다」며 그냥 일을 시작했고, 도착해서 빈손으로 실패했다.
                #
                # 새 판 15분째의 증상이 이것이었다: 가방에 구리광석이
                # 949개인데 석탄은 0개. 제련에 석탄이 모자란 줄 알면서도
                # 화로로 가버리니 제련이 안 되고, 사슬이 안 올라가니 다음
                # 칸(구리판)을 위해 또 구리를 캤다. 넷이서 구리만 캤다.
                #
                # 모자란 것이 땅에 있으면, 그것부터 캔다.
                self.claim(worker, job.key)
                self.say(f"{job.narration.rstrip('.')} — 그 전에 "
                         f"{short[0]}이(가) {short[1]}개 모자라 캐 오겠습니다.",
                         who=worker.name)
                worker.said_idle = False
                worker.watching = worker.handle.submit_plan([
                    ("mine", {**spot, "count": max(short[1], ORE_BATCH),
                              "search_radius": 10})])
                continue

            worker.said_idle = False
            self.claim(worker, job.key)
            self.say(job.narration, who=worker.name)
            if job.routine:
                self.start_routine(worker, job.routine, job.ore, job.at)
            else:
                worker.watching = worker.handle.submit_plan(job.steps)

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


__all__ = ["Crew"]

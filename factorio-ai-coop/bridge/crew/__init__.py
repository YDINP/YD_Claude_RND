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
import pantry
from client import AIBridge, RconError

from settings import DISPATCH_IDLE, DISPATCH_INTERVAL, ORE_BATCH
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
from .thinking import ThinkingMixin


class Crew(ChiefMixin, ThinkingMixin, RosterMixin, TalkMixin, SupplyMixin,
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
        # 공용 창고에 무엇이 있는지. 넣고 꺼내는 일은 있었는데 «기억»이
        # 없었다 - 창고가 있어도 그 안이 안 보이면 없는 것과 같다.
        self.pantry = pantry.Pantry()
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

        # 손이 비어 있으면 «기다리지 않는다».
        #
        # 사용자: "명령을 한명한테만 내리나? 델타만 일하는거같은데"
        #
        # 배차는 십 초에 한 번 돌았다. 그런데 순찰은 일 초마다 돈다.
        # 그 아홉 초 동안 `handed` 는 비어 있고, 일을 마친 사람은 전부
        # 「반장의 지시를 기다립니다」를 말하며 서 있었다.
        #
        # 계측해보니 배차는 손이 빈 «모두에게» 주고 있었다. 건너뛰는 일도
        # 없었다. 그러니 문제는 나눠주는 방식이 아니라 «나눠주는 때»였다.
        #
        # 주기를 둔 까닭은 배차가 무거워서다. 그런데 무거운 조회 둘을
        # 삼 초 기억하게 고친 뒤로는 그만큼 무겁지 않다. 그리고 사람이
        # 놀고 있는 것보다 비싼 것은 없다.
        if now >= self.dispatched_at:
            try:
                handed = self.dispatch(free)
            except RconError:
                handed = set()
            # 아무도 못 받았으면 다음 순찰에 다시 본다. 다 받았으면
            # 그들이 일하는 동안은 쉬어도 된다.
            waiting = [w for w, _ in free if w.name not in handed]
            self.dispatched_at = now + (DISPATCH_IDLE if waiting
                                        else DISPATCH_INTERVAL)

        # 배차가 끝난 뒤에 «각자 생각»을 얹는다. 순서에 뜻이 있다 -
        # 반장이 이미 일을 준 사람은 건드리지 않고, 남은 사람만 스스로
        # 고른다. 그리고 생각은 다른 실에서 도므로 여기서 기다리지 않는다.
        try:
            handed |= self.let_them_think(free, handed)
        except RconError:
            pass

        for worker, snap in free:
            if worker.name in handed:
                continue

            # 남이 나에게 부탁하려면 내가 뭘 쥐고 있는지 알아야 한다.
            # 설계가 맨 먼저다. 어디에 지을지 모르고 짓기 시작하면
            # 그 자리는 짓는 순서만큼 우연해진다.
            self.lay_out()
            # 그다음 점호. 시체에게 일을 나눠줄 수는 없다.
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

            # 여기서부터는 «각자 고르지 않는다».
            #
            # 사용자 지시: "개인 에이전트들 위임 빼고 반장이 전체를 관리하는
            # 걸로", "주기적으로 게임흐름을 보고 판단해서 각 캐릭터들한테
            # 작업을 시키도록".
            #
            # 예전에는 배차를 못 받은 사람이 각자 사다리를 보고 제 일을
            # 골랐다. 그 길이 여러 번 값을 치렀다:
            #
            #   * 공장이 꺼져 있는데 다섯이 제련만 반복했다. 반장은 「굶고
            #     있으면 제련을 접어라」를 이미 알고 있었는데, 배차를 못
            #     받은 사람에게는 그 판단이 안 닿았다.
            #   * 같은 일을 두 사람이 다른 열쇠로 집었다.
            #   * 반장이 사슬을 고쳐 사람을 돌려도, 각자 고르는 쪽이
            #     그것을 덮었다.
            #
            # 사다리 일감은 이제 배차 풀에 들어간다(survey.dispatch).
            # 여기 남은 것은 «개인 용무»뿐이다 - 제 가방을 부리는 일과
            # 남의 부탁을 들어주는 일. 둘 다 그 사람만 할 수 있다.
            #
            # 부탁이 먼저다. 이미 쥔 걸 건네주는 건 걸어가기만 하면 되고,
            # 기다리는 쪽은 그동안 아무것도 못 한다.
            if self.serve_board(worker, snap, idle=True):
                continue

            # 반장이 줄 일이 없으면 «서 있는다». 예전에는 여기서 각자
            # 「할 일이 비어 채굴기를 하나 더」를 골랐고, 그 한 줄이
            # 채굴기를 157대까지 밀어올렸다.
            # 한 번만 말한다. 이 말이 로그를 채우면 «진짜 일»이 가려진다 -
            # 실제로 최근 마흔 줄 중 절반이 이 말이었고, 그 사이에 벌어진
            # 일을 못 봤다.
            if not worker.said_idle:
                self.say(f"반장의 지시를 기다립니다. {mission.briefing(snap)}",
                         who=worker.name)
                worker.said_idle = True
            continue


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

"""사람 말을 읽고 무리에게 옮기는 곳.

낱말 표로 뜻을 맞히지 않는다. 문장은 문장을 읽을 수 있는 곳(brain)으로 보낸다.
"""

from __future__ import annotations

import queue
import sys
import threading
import time

import brain
import mission
from client import RconError

from settings import CALL_SIGNS, IDLE_ASK_QUIET, IDLE_MODEL
from world import Snapshot
from jobs import Intent, errand_label
from ladder import _as_rows
from worker import Worker


class TalkMixin:
    """사람 말을 읽고 무리에게 옮기는 곳."""

    # 게임이 아니라 무리 자신을 만지는 명령. 「채굴」처럼 게임 안에서 벌어지는
    # 일과 달리, 이것들은 인원을 늘리거나 판을 저장하는 것처럼 밖의 일이다.
    CREW_COMMANDS = {"panel", "save", "add_agent", "remove_agent",
                     "list_agents", "observer", "unobserver", "depot"}

    def ask_when_stuck(self, worker: Worker, snap: Snapshot) -> bool:
        """규칙이 할 일을 못 찾았을 때만 모델에게 묻는다.

        봇마다 모델을 상시로 붙이는 것과는 다르다. 정비와 보급은 초 단위로
        판단해야 하는데 한 번 왕복이 6초라, 상시로 붙이면 느려지기만 한다.
        규칙이 막혔을 때는 사정이 반대다 - 어차피 서 있을 거라면 6초를
        들여서라도 물어보는 편이 낫다.
        """
        if not self.use_llm:
            return False
        now = time.monotonic()
        if now - worker.asked_at < IDLE_ASK_QUIET:
            return False
        if not worker.slot.acquire(blocking=False):
            return False
        worker.asked_at = now

        here = mission.stage_of(snap)
        question = (
            f"규칙으로는 지금 할 일을 못 찾았다. 목표는 «{here.title}»이고, "
            f"이 공장을 그쪽으로 한 걸음 옮기는 일을 하나만 정해서 해라. "
            f"할 만한 게 정말 없으면 steps 를 비우고 이유를 말해라."
        )

        def think() -> None:
            try:
                answer = brain.think(question, snap, agent_name=worker.name,
                                     model=IDLE_MODEL)
                if answer and (answer[0] or answer[1]):
                    self.thoughts.put((worker.name, answer[0], answer[1]))
            except Exception as exc:  # noqa: BLE001 - 죽은 스레드도 답은 해야 한다
                print(f"[warn] idle brain failed: {exc!r}", file=sys.stderr)
            finally:
                worker.slot.release()

        threading.Thread(target=think, daemon=True).start()
        return True

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

        # 반장이 «없습니다»라고 말하기 전에 창고 안을 보여준다. 사람이
        # «상자에 석탄 많이 남았잖아»라고 했는데 «석탄이 없습니다»로 답한
        # 적이 있다. 반장이 본 것은 각자의 가방뿐이었다.
        shelves: list[dict] = []
        try:
            answer = self.bridge.stores(next(iter(self.workers)))
            shelves = _as_rows(answer.get("chests"))
        except (RconError, StopIteration):
            pass

        def think() -> None:
            try:
                answer = brain.delegate(message, view, fleet, stores=shelves)
                if answer is None:
                    self.orders.put(("무슨 말인지 모르겠습니다.", [], [], speaker))
                else:
                    self.orders.put((*answer, speaker))
            except Exception as exc:  # noqa: BLE001 - a dead thread must still answer
                # 무엇이 터졌는지 사람에게도 보여준다. 이 자리에 「문제가
                # 생겼습니다」만 적혀 있던 동안, 반장은 NameError 로 열여덟
                # 회차를 죽어 있었고 아무도 그걸 몰랐다. 스레드 안의 예외는
                # stderr 로만 나가고, 사람이 보는 것은 대화창뿐이다.
                print(f"[warn] delegate failed: {exc!r}", file=sys.stderr)
                self.orders.put((f"지시를 나누다 문제가 생겼습니다: "
                                 f"{type(exc).__name__}: {exc}", [], [], speaker))
            finally:
                self.chief.release()

        threading.Thread(target=think, daemon=True).start()

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

            # 누구에게 무엇을 맡겼는지 한 줄로 되돌려준다. 사람이 시킨
            # 다음에 알 수 있는 것은 «받았다»뿐이었고, 그래서 여덟 명이
            # 흩어져도 무엇이 어디로 갔는지 볼 방법이 없었다. 반장이 하겠다고
            # «말한» 것이 아니라 실제로 «꽂은» 것을 적는다 - 둘은 다르다.
            handed: list[str] = []
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
                    handed.append(f"{name}: 하던 일 정리")
                    continue
                try:
                    worker.watching = worker.handle.submit_plan(steps)
                    handed.append(f"{name}: {errand_label(steps)}")
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)
                    handed.append(f"{name}: 못 받음")

            if handed:
                spare = [w for w in self.workers
                         if not any(row.startswith(w + ":") for row in handed)]
                line = "배정했습니다 — " + " / ".join(handed)
                if spare:
                    line += f" / 나머지({', '.join(spare)})는 하던 일 계속합니다."
                self.say(line)
            elif not commands:
                self.say("이번 지시로는 새로 맡길 일이 없었습니다. 하던 일을 계속합니다.")

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

        if kind == "depot":
            # 이미 서 있으면 자리만 알려준다. 두 개를 세우면 물자가 두 곳으로
            # 갈라져서, 하나였을 때보다 나쁘다.
            try:
                found = (self.bridge.depot() or {}).get("depot")
            except RconError:
                found = None
            if found:
                self.say(f"공용 창고는 이미 ({found['x']:.0f}, "
                         f"{found['y']:.0f})에 있습니다. 남는 물자는 거기로 "
                         f"모읍니다.")
                return True

            free = next((w for w in self.workers.values()
                         if not self.mid_job(w)), None)
            if not free:
                self.say("지금은 다들 손이 차 있습니다. 곧 세우겠습니다.")
                return True
            snap = self.snaps.get(free.name) or free.snapshot()
            self.say(f"{free.name}이(가) 공용 창고를 세우겠습니다.")
            self.start_routine(free, "depot", at={"x": snap.x, "y": snap.y})
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

    def mid_job(self, worker: Worker) -> bool:
        """긴 작업을 하는 중인가. 슬롯을 쥐고 있으면 그렇다."""
        if worker.slot.acquire(blocking=False):
            worker.slot.release()
            return False
        return True

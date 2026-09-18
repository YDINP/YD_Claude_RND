"""인원과 발언 - 누가 있고, 누가 무엇을 맡았고, 무엇을 말하는가."""

from __future__ import annotations

import time

from client import RconError

from settings import CALL_SIGNS, ECHO_QUIET, FOCUS_ORDER
from worker import Worker


class RosterMixin:
    """인원과 발언 - 누가 있고, 누가 무엇을 맡았고, 무엇을 말하는가."""

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

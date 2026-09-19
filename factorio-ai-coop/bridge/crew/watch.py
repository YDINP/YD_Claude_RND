"""지켜보는 일 - 적, 연구, 길 잃은 사람, 그리고 보고."""

from __future__ import annotations

import re
import time

import mission
from client import RconError

from settings import (NEST_ALARM, RESEARCH_CHECK, RESEARCH_ORDER, STUCK_STRIKES,
                      THREAT_CHECK)
from world import Snapshot
from worker import Worker


class WatchMixin:
    """지켜보는 일 - 적, 연구, 길 잃은 사람, 그리고 보고."""

    def watch_for_trouble(self) -> None:
        """둥지가 가까워지는지 지켜보고, 필요하면 방어를 목표에 올린다.

        공해는 퍼져서 둥지에 닿고, 닿으면 그쪽이 찾아온다. 첫 습격이 온
        다음에 터렛을 만들기 시작하면 이미 늦다. 그런데 터렛은 military
        연구 뒤에 있고 그 연구는 전력이 있어야 돌아가므로, 전력이 곧
        방어의 선행 조건이다 - 그 사실을 사람에게 말해두는 것도 대비다.
        """
        now = time.monotonic()
        if now < self.threat_checked or not self.workers:
            return
        self.threat_checked = now + THREAT_CHECK

        scout = next(iter(self.workers.values()))
        try:
            found = self.bridge.threat(scout.name)
        except RconError:
            return
        if found.get("error"):
            return

        self.danger = found
        attackers = int(found.get("attackers") or 0)
        nest = found.get("nearest_nest")
        armed = bool(found.get("can_build_turret"))

        if attackers:
            note = (f"적 {attackers}마리가 {found.get('nearest_attacker')}타일 앞에 "
                    f"있습니다.")
        elif nest is not None and nest < NEST_ALARM:
            note = f"둥지가 {nest}타일까지 왔습니다. 공해가 닿으면 찾아옵니다."
        else:
            return

        if not armed:
            # 적이 이미 와 있는데 터렛이 잠겨 있으면, 하던 연구를 끊고
            # 터렛부터 뚫는다. 다음 연구는 습격을 막아낸 뒤에 해도 된다.
            #
            # 다만 «걸고 나서» 말한다.
            #
            # 20분 동안 매 순찰 「gun-turret 연구를 먼저 돌리겠습니다」라고
            # 말했는데 연구는 내내 «없음»이었다. gun-turret 의 선행인
            # automation-science-pack 이 안 끝났고, 엔진은 걸 수 없는 연구를
            # 조용히 거절한다. 그 거절을 아무도 안 봤다.
            #
            # 그리고 이 줄은 위험을 알리는 줄이라 사람이 제일 믿는 줄이다.
            # 거기에 안 되는 일을 적어두면, 방어가 진행 중이라고 읽힌다.
            # 걸렸는지는 «되읽어서» 확인한다.
            #
            # 모드는 부탁을 받아 적고 「queued」라고 답한다. 그런데 엔진이
            # 선행 미완인 연구를 조용히 버리면 큐는 비어 있다. 실측:
            #
            #     research("gun-turret") -> {"queued": "gun-turret",
            #                                "queue_length": 0}
            #
            # 「받아 적었다」와 「걸렸다」는 다르다. 이 저장소가 오늘만
            # 세 번째로 만나는 모양이다 - 증거는 말이 아니라 흔적이어야 한다.
            queued = False
            try:
                self.bridge.research("gun-turret")
                now_on = (self.bridge.research_status() or {}).get("current")
                queued = (now_on == "gun-turret")
            except RconError:
                pass
            if queued:
                note += " 터렛이 아직 잠겨 있어 gun-turret 연구를 먼저 돌리겠습니다."
            else:
                # 왜 못 거는지를 말한다. 「못 했다」보다 「무엇이 먼저다」가
                # 쓸모 있다 - 그것이 지금 무리가 해야 할 일이다.
                note += (" 터렛이 잠겨 있는데 gun-turret 연구를 아직 못 겁니다. "
                         "선행 연구부터 뚫어야 합니다.")
        if note != self.danger_said:
            self.danger_said = note
            self.say(note)

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

        def rank(tech: dict) -> tuple:
            name = tech.get("name", "")
            order = (RESEARCH_ORDER.index(name) if name in RESEARCH_ORDER
                     else len(RESEARCH_ORDER))
            return (order, name)

        queueable.sort(key=rank)
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

    @staticmethod
    def where_lost(trouble: str) -> tuple[int, int] | None:
        """실패 메시지에서 «어디서» 못 갔는지 읽는다.

        「no path from 92.2,6.1 to -54,-66」에서 앞의 좌표. 뒤의 좌표는
        목적지라 매번 다르고, 갇힌 것은 앞자리다.
        """
        hit = re.search(r"from\s+(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", trouble)
        if not hit:
            hit = re.search(r"stuck at\s+(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",
                            trouble)
        if not hit:
            return None
        return (round(float(hit.group(1))), round(float(hit.group(2))))

    def count_lost(self, worker: Worker, trouble: str) -> None:
        """같은 자리에서 거듭 못 가면 꺼내준다.

        한 명이 호숫가에 한 시간 넘게 서서 같은 실패만 반복했다. 서로 다른
        실패 44종 중 25종이 그 한 좌표에서 나왔다. 죽은 인력이었을 뿐
        아니라, 동쪽 일감에 「가장 가까운 사람」이라 배차를 계속 빨아들였다.

        걸어서 못 나오는 곳에 있으면 걸어서 꺼낼 수 없다.
        """
        here = self.where_lost(trouble)
        if here is None:
            return
        if worker.lost_at != here:
            worker.lost_at, worker.lost_count = here, 1
            return

        worker.lost_count += 1
        if worker.lost_count < STUCK_STRIKES:
            return
        worker.lost_at, worker.lost_count = None, 0
        try:
            moved = self.bridge.unstick(worker.name)
        except RconError:
            return
        if moved.get("error"):
            self.say(f"({here[0]}, {here[1]})에서 못 나가는데 옮길 데도 "
                     f"없습니다: {moved['error']}", who=worker.name)
            return
        worker.blocked.clear()
        self.say(f"({here[0]}, {here[1]})에 갇혀서 {moved.get('moved', 0)}타일 "
                 f"떨어진 동료 옆으로 옮겼습니다.", who=worker.name)

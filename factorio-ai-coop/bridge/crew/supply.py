"""물건을 구하는 곳 - 손으로 만들고, 창고에서 꺼내고, 게시판에 부탁한다."""

from __future__ import annotations

import time

from client import RconError, TaskFailed

from settings import (FURNACE_FUEL, ORE_BATCH, SHORTAGE_VOICES, SMELTABLE,
                      SMELT_MARGIN, UNREACHABLE_QUIET)
from world import Snapshot
from jobs import Job, Step, blocked_by
from ladder import _as_rows, missing_item
from worker import Worker


class SupplyMixin:
    """물건을 구하는 곳 - 손으로 만들고, 창고에서 꺼내고, 게시판에 부탁한다."""

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
        replanned = False
        for _ in range(rounds):
            if worker.handle.items().get(item, 0) >= count:
                return True
            try:
                answer = self.bridge.plan_item(name, item, count)
            except RconError:
                return False
            if answer.get("error"):
                self.say(f"{item}을(를) 어떻게 만드는지 모르겠습니다: "
                         f"{answer['error']}", who=name)
                return False

            # 창고에 있는 것을 꺼내오는 것이 맨 먼저다. 캐야 할 것이 없는데
            # 캐러 가는 일이 없도록 - 상자에 철판 819장이 있는데 철광석을
            # 캐러 보내고 있었다.
            errands = _as_rows(answer.get("fetch"))
            if errands:
                got = False
                for shelf in errands[:3]:
                    try:
                        worker.handle.take(shelf["name"], shelf["x"], shelf["y"],
                                           count=int(shelf["count"]),
                                           timeout=300, timeout_ticks=60 * 60 * 3)
                        got = True
                    except TaskFailed:
                        continue
                if got:
                    continue

            steps = _as_rows(answer.get("steps"))
            step = next((st for st in steps if st.get("hand")), None)
            if step:
                try:
                    worker.handle.craft(step.get("recipe") or step["name"],
                                        count=int(step.get("count") or 1), timeout=240)
                    continue
                except TaskFailed as exc:
                    # 계획은 «된다»고 했는데 실제로는 안 됐다. 그 사이에
                    # 재료가 창고로 들어갔거나 동료가 가져갔다는 뜻이다.
                    # 포기하지 않고 지금 상태로 다시 물어본다 - 한 번만.
                    if replanned:
                        self.say(f"{step['name']} 제작이 두 번 막혔습니다: "
                                 f"{exc.task.get('error')}", who=name)
                        return False
                    replanned = True
                    continue

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

            # 캐러 가기 전에 창고를 먼저 본다. 남이 이미 캐다 넣어둔 것을
            # 두고 다시 캐는 것만큼 헛된 일이 없다.
            if self.fetch_from_store(worker, answer):
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
                # 캘 자리가 하나도 없다. 여기서 끝내되, 조용히 끝내지 않는다.
                self.explain_shortfall(worker, item, count, answer)
                return False

        got = worker.handle.items().get(item, 0) >= count
        if not got:
            self.explain_shortfall(worker, item, count, answer)
        return got

    def fetch_from_store(self, worker: Worker, answer: dict) -> bool:
        """계획이 모자라다고 한 것을 공용 상자에서 꺼내 온다.

        창고에 구리판이 쌓여 있는데 광맥까지 걸어가 다시 캐는 일이 있었다.
        가진 것을 세는 자리가 손 하나뿐이라서다.
        """
        name = worker.name
        for item, amount in sorted((answer.get("mine") or {}).items()):
            try:
                chests = self.bridge.chest_stock(name, item)
            except RconError:
                return False
            for chest in chests:
                if int(chest.get("count") or 0) <= 0:
                    continue
                try:
                    worker.handle.take(item, chest["x"], chest["y"],
                                       count=min(int(amount), int(chest["count"])),
                                       timeout=300, timeout_ticks=60 * 60 * 3)
                except TaskFailed:
                    continue
                self.say(f"{item}은(는) 창고에 있어서 꺼내 왔습니다. "
                         f"({chest['x']:.0f}, {chest['y']:.0f})", who=name)
                return True
        return False

    def explain_shortfall(self, worker: Worker, item: str, count: int,
                          answer: dict) -> None:
        """못 구한 이유를 말하고, 남이 도울 수 있게 게시판에 올린다.

        «전봇대를 못 구했습니다»로 끝나면 다음에 할 일이 없다. 무엇이 몇 개
        모자란지 말하면 그것이 곧 다음 할 일이고, 게시판에 올려두면 놀고 있는
        동료의 다음 할 일이 된다.
        """
        why, short = blocked_by(answer)
        if not short:
            self.say(f"{item}을(를) 못 구했고 이유도 모르겠습니다. 다른 일을 하겠습니다.",
                     who=worker.name)
            return
        listed = ", ".join(f"{k} {v}개" for k, v in short[:3])
        self.say(f"{item} {count}개를 못 구했습니다. {listed}이(가) 모자라고, "
                 f"{why}.", who=worker.name)

        # 연구나 유체로 막힌 것은 부탁해도 소용없다. 캘 수 있는 것만 올린다.
        if answer.get("mine"):
            now = time.monotonic()
            for missing, amount in short[:2]:
                if self.board.post(worker.name, missing, amount,
                                   f"{item} 만들기", now):
                    self.say(f"{missing} {amount}개, 손 비는 분 부탁드립니다.",
                             who=worker.name)

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

    @staticmethod
    def wanted(item: str) -> int:
        """부탁할 때 몇 개나 달라고 할지.

        광석은 한 번 제련할 만큼, 나머지는 하나면 된다. 스무 개짜리 부탁을
        한 개로 붙이면 받아도 또 막힌다."""
        if item in ("iron-ore", "copper-ore", "coal", "stone"):
            return ORE_BATCH
        return 1

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

                    # 그리고 «수첩에도» 돌려준다. 여기가 실제 결과를 아는
                    # 유일한 곳이다 - 지금까지는 채팅에만 말하고 수첩에는
                    # 한 줄도 안 남겼다. 그래서 수첩의 ○ 가 전부 「접수됨」
                    # 이었고, 그 거짓 위에서 규칙이 압축되고 있었다.
                    held = getattr(worker, "held_key", None)
                    if held:
                        self.note_outcome(
                            worker.name, held, False,
                            f"{kind} 실패: {state.get('error') or '까닭 모름'}"[:120])

                    # 「길이 없다」는 세상에 길이 없다는 뜻이 아니라 이 사람이
                    # 못 간다는 뜻이다. 실제로 한 명이 호수 건너에 서서 같은
                    # 실패를 다섯 번 반복했다 - 직선거리로는 73타일이었지만
                    # 걸어서는 물을 크게 돌아야 했다.
                    #
                    # 이 일감을 이 사람에게만 오래 막아두면, 배차가 다음
                    # 사람에게 넘긴다.
                    trouble = str(state.get("error") or "")
                    if worker.job_key and ("no path" in trouble
                                           or "stuck" in trouble):
                        worker.block(worker.job_key, UNREACHABLE_QUIET)
                        self.count_lost(worker, trouble)
                    self.say(f"{kind} 실패: {state.get('error')}", who=worker.name)
                    # 방금 실제로 해보고 없다는 걸 알았다. 짐작이 아니므로
                    # 이걸 근거로 동료에게 부탁해도 된다.
                    want = missing_item(kind, state.get("error") or "",
                                        state.get("params"))
                    if want:
                        self.ask_for(worker, want, self.wanted(want),
                                     f"{kind} 작업이 막혔습니다")
            worker.watching = still

    def shortage_jobs(self) -> list[Job]:
        """여럿이 같은 것을 부탁하면, 나르는 대신 늘린다.

        게시판에 «coal x25 (대기)»가 여섯 줄 걸린 채 굳어 있었다. 여섯 모두
        석탄이 없어서 부탁한 것이라, 서로 갖다줄 사람이 애초에 없었다.
        부탁을 돌리는 것으로는 풀 수 없는 종류의 문제다.

        이럴 때 할 일은 하나다 - 그 광석에 채굴기를 더 세우는 것. 그러면
        부탁 여섯 줄은 한 번에 사라진다.
        """
        # 창고에 얼마나 있는지부터 본다. 손에 없는 것과 없는 것은 다르다 -
        # 석탄이 상자에 9,958개 들어 있는데 「석탄이 없습니다」라며 석탄
        # 채굴기를 더 짓고 있었다. 그건 부족이 아니라 운반 문제다.
        try:
            shelved = (self.bridge.stores(next(iter(self.workers)))
                       .get("total") or {})
        except (RconError, StopIteration):
            shelved = {}

        out: list[Job] = []
        for item, (total, voices) in sorted(self.board.demand().items()):
            if voices < SHORTAGE_VOICES or item not in SMELTABLE + ("coal",):
                continue
            askers = self.board.drop_item(item)
            stocked = int(shelved.get(item) or 0)
            if stocked >= total:
                self.say(f"{len(askers)}명이 {item}을(를) 찾는데, 창고에 "
                         f"{stocked}개가 있습니다. 더 캘 일이 아니라 나를 일입니다. "
                         f"(부탁 {total}개는 내립니다)")
                continue
            self.say(f"{len(askers)}명이 {item}을(를) 찾고 있습니다. 창고에도 "
                     f"{stocked}개뿐입니다 — {item} 채굴기를 늘리겠습니다. "
                     f"(부탁 {total}개는 내립니다)")
            out.append(Job(f"{item}이 무리 전체에 모자랍니다. 채굴기를 늘립니다.",
                           key=f"shortage:{item}", routine="automate", ore=item))
        return out

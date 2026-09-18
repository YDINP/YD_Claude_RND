"""돌보는 일 - 쌓인 것을 옮기고, 사다리의 다음 칸을 채운다."""

from __future__ import annotations

import mission
from client import RconError

from settings import (CHEST, DEPOT_MIN, DRILL, DRILL_FUEL, FOCUS_ORDER, FURNACE_FUEL,
                      HARVEST_MIN, KEEP_IN_HAND, SMELTABLE, SMELTED_BY_FURNACE,
                      SMELT_BATCH, STARVING, STOCKPILE)
from world import Snapshot
from jobs import Job
from ladder import STAGE_TARGET, _as_rows, chain_job
from worker import Worker


class TendingMixin:
    """돌보는 일 - 쌓인 것을 옮기고, 사다리의 다음 칸을 채운다."""

    def depot_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """가방에 넘치는 것을 공용 창고에 넣는다.

        각자 안고 다니면 물자가 필요한 사람에게 가지 않는다. 옆 사람이
        철광석 150개를 든 채로 «철광석이 필요합니다»라고 말하는 일이
        실제로 벌어졌다. 한 자리에 모아두면 누구든 꺼내 쓸 수 있다.
        """
        try:
            found = self.bridge.depot()
        except RconError:
            return None

        where = found.get("depot")
        if not where:
            # 창고가 없으면 하나 세운다. 자리는 무리가 모이는 곳 - 화로 옆.
            # 상자를 손에 든 사람이 없어서 영영 안 섰으므로, 구하는 것까지
            # 루틴이 맡는다.
            base = snap.building("stone-furnace")
            if not base:
                return None
            return Job("공용 창고를 세우겠습니다.", key="depot:build",
                       routine="depot", at=base)

        surplus = [(name, count - KEEP_IN_HAND)
                   for name, count in snap.items.items()
                   if count - KEEP_IN_HAND >= DEPOT_MIN and name != "coal"]
        if not surplus:
            return None
        surplus.sort(key=lambda pair: -pair[1])
        name, amount = surplus[0]
        return Job(f"{name} {amount}개를 공용 창고에 넣겠습니다.",
                   key=f"depot:{worker.name}",
                   # 좁게 겨냥한다. 기본 반경으로는 옆 상자에 넣고, 세는
                   # 쪽은 창고를 보고 있어서 영원히 0으로 남는다.
                   steps=[("insert", {"name": name, "count": amount,
                                      "search_radius": 0.5, **where})],
                   at=where)

    def keep_busy(self, worker: Worker, snap: Snapshot) -> Job | None:
        """마지막 수단. 손으로 캐기 전에 먼저 채굴기를 늘린다.

        사람이 곡괭이를 드는 것은 0.5 광석/초고 버너 채굴기는 0.25지만,
        채굴기는 자지도 않고 걷지도 않는다. 한 번 세우면 계속 캐는 것과
        한 사람이 그 자리에 붙어 있는 것은 비교가 안 된다 - 손 채굴은
        부트스트랩 임시방편이지 일감이 아니다.
        """
        # 1. 채굴기를 하나 더. 만들 수 있으면 언제나 이쪽이 낫다.
        #    다만 연료가 모자란 판에 광석 채굴기를 더 놓으면 굶는 기계만
        #    늘어난다 - 그럴 때는 석탄 자급쌍이 먼저다.
        order = list(FOCUS_ORDER)
        if self.starving:
            order = ["coal"] + [o for o in FOCUS_ORDER if o != "coal"]
            worker_first = order
        else:
            worker_first = [worker.focus] + [o for o in order if o != worker.focus]

        if snap.can_make(DRILL) or snap.have(DRILL) >= 1:
            for ore in worker_first:
                if snap.ore(ore):
                    return Job(f"할 일이 비어 {ore} 채굴기를 하나 더 놓겠습니다.",
                               key=f"automate:{ore}:{worker.name}",
                               routine="automate", ore=ore,
                               needs={DRILL: 1})

        # 2. 정말 못 만들면 그때 손으로 캔다. 곡괭이질은 여기까지 밀린다.
        for ore in worker_first:
            spot = snap.ore(ore)
            if not spot:
                continue
            return Job(f"채굴기를 못 만들어 {ore}를 손으로 캐겠습니다.",
                       key=f"gather:{worker.name}",
                       steps=[("mine", {**spot, "count": STOCKPILE,
                                        "search_radius": 12,
                                        "timeout_ticks": 60 * 60 * 5})])
        return None

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

        # 새로 캐기 전에 이미 녹아 있는 걸 먼저 꺼낸다. 사슬이 원하는
        # 것이면 한 개라도 가져온다.
        harvest = self.harvest_job(worker, self.chain_wants(answer))
        if harvest:
            return harvest

        # 사슬의 맨 밑이 땅이면 캐러 간다. 무엇을 얼마나 캐야 하는지도
        # 게임이 세어줬다.
        for ore, amount in sorted((answer.get("mine") or {}).items()):
            # 나무는 광맥이 아니다. 전봇대가 나무 1개를 요구하는데 벨 줄을
            # 몰라서 전력이 통째로 막혀 있었다.
            if ore == "wood":
                return Job(f"{item}을(를) 만들려면 나무가 {int(amount)}개 필요합니다. 베러 갑니다.",
                           key="chain:chop",
                           steps=[("chop", {"x": snap.x, "y": snap.y,
                                            "count": max(4, min(int(amount) * 2, 40)),
                                            "timeout_ticks": 60 * 60 * 3})])
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

    def tend_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """멈춰 선 기계를 고친다. 새로 짓는 것보다 먼저다.

        연료가 떨어진 채굴기, 출력이 꽉 찬 화로 - 지어놓고 아무도 돌아오지
        않아서 멈춘 것들이다. 멈춘 기계는 지어지지 않은 기계보다 나쁘다.
        재료는 이미 들어갔는데 아무것도 내놓지 않기 때문이다.

        무엇이 왜 멈췄는지는 짐작하지 않는다. 게임이 기계마다 status 로
        들고 있고, 거기에 답이 적혀 있다.
        """
        try:
            stopped = self.bridge.broken(worker.name)
        except RconError:
            return None

        # 정비는 끝이 없다. 버너 드릴 열여덟 대는 계속 연료가 떨어지고,
        # 여섯 명이 전부 거기 매달리면 발전소는 영영 안 선다. 손이 모자란
        # 것과 할 일이 없는 것은 다르다 - 절반만 돌본다.
        tending = sum(1 for key in self.claims if key.startswith("tend:"))
        if tending >= max(1, len(self.workers) // 2):
            return None

        # 진짜 고장이 먼저고, 노는 화로를 먹이는 일은 그 뒤다. 순서를
        # 거꾸로 하면 빈 화로 스무 대가 연료 떨어진 드릴을 가린다.
        self.starving = sum(1 for e in stopped if e.get("fix") == "fuel") >= STARVING
        rank = {"fuel": 0, "chest": 1, "empty": 2, "feed": 3}
        stopped.sort(key=lambda e: (rank.get(e.get("fix"), 9), e.get("distance", 0)))

        taken = self.taken()
        for entry in stopped:
            key = f"tend:{entry['x']:.0f},{entry['y']:.0f}"
            if key in taken or key in worker.blocked_now():
                continue
            at = {"x": entry["x"], "y": entry["y"]}
            what, fix = entry.get("name", "기계"), entry.get("fix")

            if fix == "fuel":
                if snap.have("coal") < DRILL_FUEL:
                    # 연료를 넣어주려면 연료가 있어야 한다. 부탁의 근거가 된다.
                    continue
                return Job(f"{what}이(가) 연료가 떨어져 멈췄습니다. 석탄을 넣겠습니다.",
                           key=key, needs={"coal": DRILL_FUEL},
                           steps=[("insert", {"name": "coal", "count": DRILL_FUEL, **at})])

            if fix == "empty":
                # 무엇이 찼는지는 화로 재고 쪽이 안다. 이름 없이 꺼낼 수는
                # 없으므로 거두기에 맡긴다.
                harvest = self.harvest_job(worker)
                if harvest:
                    return harvest
                continue

            if fix == "feed":  # noqa: SIM102 - 묶음은 배차 쪽에서 다룬다
                # 공장은 끊임없이 돌아야 한다. 목표에 필요한 만큼만 녹이면
                # 화로 절반이 서 있고, 그동안 광석은 가방에서 잠잔다.
                ore = max(SMELTABLE, key=lambda o: snap.have(o), default=None)
                if not ore or snap.have(ore) < SMELT_BATCH                         or snap.have("coal") < FURNACE_FUEL:
                    continue
                return Job(f"화로가 비어 있습니다. {ore}를 넣어 계속 돌리겠습니다.",
                           key=key, needs={"coal": FURNACE_FUEL, ore: SMELT_BATCH},
                           steps=[
                               ("insert", {"name": "coal", "count": FURNACE_FUEL, **at}),
                               ("insert", {"name": ore, "count": SMELT_BATCH, **at}),
                           ])

            if fix == "chest":
                # 내놓을 데가 없어 멈췄다. 상자가 꽉 찼으면 비우면 되고,
                # 아예 없으면 달아줘야 한다 - 손보는 방법이 다르다.
                if entry.get("holding") and entry.get("outlet"):
                    # 녹일 수 있는 광석이 찬 상자라면, 비우는 대신 그 자리를
                    # 화로로 바꾼다. 비우기는 이 채굴기를 한 번 살리고 20분
                    # 뒤에 똑같이 막힌다. 화로는 영원히 받아준다 - 채굴기가
                    # 캔 광석이 바로 화로로 들어가니 나를 일 자체가 없어진다.
                    #
                    # 상자를 캐면 안에 든 것이 가방으로 따라온다. 그 광석을
                    # 그대로 새 화로에 넣으면 버리는 것도 없다.
                    if entry["holding"] in SMELTED_BY_FURNACE:
                        return Job(
                            f"{what}의 상자가 {entry['holding']}으로 꽉 찼습니다. "
                            f"상자를 화로로 바꾸면 다시 막히지 않습니다.",
                            key=f"convert:{entry['x']:.0f},{entry['y']:.0f}",
                            routine="convert", at=entry)
                    return Job(
                        f"{what}의 상자가 꽉 차서 멈췄습니다. 비우겠습니다.",
                        key=key,
                        steps=[("take", {"name": entry["holding"],
                                         "count": int(entry.get("held") or 1),
                                         **entry["outlet"]})])
                return Job(f"{what}이(가) 내놓을 데가 없어 멈췄습니다. 상자를 달겠습니다.",
                           key=key, routine="rescue", at=at, needs={CHEST: 1})

        return None

    def harvest_job(self, worker: Worker, wanted: set[str] | None = None) -> Job | None:
        """화로에 다 녹아 있는 것을 거둬온다.

        이건 «여유 있으면 하는 일»이 아니다. 출력 슬롯이 찬 화로는 제련을
        멈춘다. 즉 거두지 않은 판금은 그 자체로 병목이고, 새 광석을 캐러
        가는 것보다 언제나 먼저다 - 실제로 화로 안에 철판 100개를 재워둔 채
        «철광석 25개를 캐야 한다»고 말하고 있었다.

        조금 녹은 걸 계속 집으러 다니면 그것대로 낭비라, 쌓인 것만 거둔다.
        사슬이 지금 당장 필요로 하는 것은 한 개라도 가져온다.
        """
        try:
            stock = self.bridge.furnace_stock(worker.name)
        except RconError:
            return None

        taken = self.taken()
        for entry in stock:
            name, count = entry.get("name"), int(entry.get("count") or 0)
            if count < HARVEST_MIN and not (wanted and name in wanted):
                continue
            key = f"harvest:{entry['x']:.0f},{entry['y']:.0f}"
            if key in taken:
                continue
            return Job(f"화로에 {name} {count}개가 다 녹아 있습니다. 거둬오겠습니다.",
                       key=key,
                       steps=[("take", {"name": name, "count": count,
                                        "x": entry["x"], "y": entry["y"]})])
        return None

    @staticmethod
    def chain_wants(answer: dict) -> set[str]:
        """사슬이 이름을 부른 모든 물건."""
        wanted = set(answer.get("mine") or {})
        for step in _as_rows(answer.get("steps")):
            if step.get("name"):
                wanted.add(step["name"])
            if step.get("input"):
                wanted.add(step["input"])
        return wanted

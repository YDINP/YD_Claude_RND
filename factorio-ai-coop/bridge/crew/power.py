"""전기 - 보일러와 증기기관을 세우고, 끊긴 데를 잇는다."""

from __future__ import annotations

import math

from client import RconError, TaskFailed

from settings import (BOILER_FUEL, ENGINES_PER_BOILER, MAX_POLE_RUN,
                      POLE, POLE_REACH)
from world import Snapshot
from jobs import Job
from ladder import _as_rows
from worker import Worker


class PowerMixin:
    """전기 - 보일러와 증기기관을 세우고, 끊긴 데를 잇는다."""

    def build_power(self, worker: Worker) -> None:
        """발전소를 세운다. 자리는 게임이 계산한 것을 그대로 쓴다.

        예전에는 «펌프에서 축을 따라 2~7칸» 같은 어림으로 놓았고, 그 결과
        펌프 둘·보일러 하나·기관 둘이 흩어진 채 기관이 no_input_fluid 로
        서 있었다. 어림은 맞을 때만 맞는다.

        이제 모드가 임시로 세워 보고 «여기에 이 방향으로 놓으면 붙는다»를
        확인한 좌표만 준다. 파이프 자리까지 함께 온다.
        """
        name = worker.name
        try:
            snap = worker.snapshot()
            # «기관이 서 있다»가 아니라 «전기가 흐른다». 계획 쪽만 고치고
            # 여기를 안 고쳐서, 보일러와 기관을 손에 쥔 채 «이미 발전기가
            # 있습니다»라며 돌아서고 있었다.
            if snap.powered:
                self.say("이미 전기가 들어오고 있습니다.", who=name)
                return

            # 랩 옆에 세운다. 발전소가 랩에서 141타일 떨어져 있으면 전봇대
            # 스물두 개를 세워야 하고, 그 전봇대에 또 나무가 든다.
            anchor = snap.building("lab") or snap.building("stone-furnace") \
                or {"x": snap.x, "y": snap.y}

            # 배관이 다 맞았는데 전봇대가 없어 노는 기관이 있으면, 새로
            # 짓는 대신 거기에 전선을 잇는다. 이걸 못 보고 있어서 완성된
            # 발전소가 두 벌 서 있는데도 계속 새로 짓고 있었다.
            standing = self.bridge.power_status(name).get("unplugged")
            if standing:
                self.say(f"발전기가 이미 서 있는데 전선이 없습니다. "
                         f"({standing['x']:.0f}, {standing['y']:.0f})에 잇겠습니다.",
                         who=name)
                self.connect_power(worker, standing, snap)
                return

            # 랩 옆이 제일 좋지만, 앞선 시도가 남긴 펌프로 해안이 막혀
            # 있을 수 있다. 한 곳에서 못 찾았다고 포기하면 전력이 영영
            # 안 선다 - 실제로 펌프 열한 개가 서 있는 채로 0와트였다.
            plan = {}
            for spot, reach in ((anchor, 150), ({"x": snap.x, "y": snap.y}, 150),
                                (anchor, 400)):
                plan = self.bridge.power_plan(name, spot["x"], spot["y"],
                                              radius=reach,
                                              engines=ENGINES_PER_BOILER)
                if not plan.get("error"):
                    break
            if plan.get("error"):
                self.say(f"발전소 자리를 못 찾았습니다: {plan['error']}", who=name)
                worker.block("power", 600)
                return

            pipes = _as_rows(plan.get("pipes"))
            engines = _as_rows(plan.get("engines"))
            needed = [("offshore-pump", 1), ("boiler", 1),
                      ("steam-engine", len(engines))]
            if pipes:
                needed.append(("pipe", len(pipes)))
            for part, count in needed:
                self.say(f"{part} {count}개를 준비합니다.", who=name)
                if not self.obtain(worker, part, count):
                    self.say(f"{part}를 못 구했습니다. 전력은 나중에.", who=name)
                    worker.block("power", 300)
                    return

            self.say(f"발전소를 세웁니다. ({plan['pump']['x']:.0f}, "
                     f"{plan['pump']['y']:.0f})", who=name)
            worker.handle.place("offshore-pump", plan["pump"]["x"], plan["pump"]["y"],
                                direction=plan["pump"]["direction"], timeout=420)
            for spot in pipes:
                worker.handle.place("pipe", spot["x"], spot["y"], timeout=180)
            worker.handle.place("boiler", plan["boiler"]["x"], plan["boiler"]["y"],
                                direction=plan["boiler"]["direction"], timeout=240)
            for spot in engines:
                worker.handle.place("steam-engine", spot["x"], spot["y"],
                                    direction=spot["direction"], timeout=240)

            if not self.obtain(worker, "coal", 20):
                self.say("보일러에 넣을 석탄이 없습니다.", who=name)
            else:
                worker.handle.insert("coal", plan["boiler"]["x"], plan["boiler"]["y"],
                                     count=20, timeout=180)

            # 정말 도는지 본다. 물 없는 보일러와 증기 없는 기관은 밖에서
            # 보면 멀쩡한 발전소와 똑같이 생겼다.
            last = engines[-1] if engines else plan["boiler"]
            running = [e for e in self.bridge.inspect(last["x"], last["y"], 3)
                       if e.get("name") == "steam-engine"]
            energy = running[0].get("energy", 0) if running else 0
            self.say(f"발전소를 세웠습니다. 기관 {len(engines)}대. "
                     + ("전력 생산 중입니다." if energy and energy > 0
                        else "아직 증기가 안 올라왔습니다."), who=name)

            self.connect_power(worker, last, snap)

        except TaskFailed as exc:
            worker.block("power")
            self.say(f"전력 구축 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("power")
            self.say(f"전력 구축 중 오류: {exc}", who=name)

    def connect_power(self, worker: Worker, source: dict, snap: Snapshot) -> None:
        """발전소에서 랩까지 전봇대를 잇는다.

        전봇대를 세우기 전까지 발전소는 아무것도 돌리지 않는다. 기관이
        돌아가는데 랩이 멈춰 있는 상태가 제일 헷갈린다 - 둘 다 멀쩡해
        보이기 때문이다.
        """
        name = worker.name
        target = snap.building("lab")
        if not target:
            return

        span = math.hypot(target["x"] - source["x"], target["y"] - source["y"])
        if span > POLE_REACH * MAX_POLE_RUN:
            # 물이 있는 곳과 랩이 있는 곳은 우리가 고른 게 아니다. 115타일을
            # 전봇대로 잇느니 전기가 있는 자리에 랩을 하나 더 세우는 게 싸다 -
            # 사람도 그렇게 한다.
            self.say(f"랩이 {span:.0f}타일 떨어져 있습니다. 발전소 옆에 랩을 "
                     f"하나 더 세우겠습니다.", who=name)
            if not self.obtain(worker, "lab", 1):
                self.say("랩을 못 만들었습니다.", who=name)
                return
            try:
                target = worker.handle.place("lab", source["x"] + 4, source["y"],
                                             snap=True, timeout=420)
            except TaskFailed as exc:
                self.say(f"랩을 못 세웠습니다: {exc.task.get('error')}", who=name)
                return
            span = math.hypot(target["x"] - source["x"], target["y"] - source["y"])

        # 양 끝이 먼저다. 전선이 7.5칸까지 늘어나는 것은 «전봇대끼리»의
        # 이야기고, 기계가 전기를 받으려면 기계가 전봇대의 공급 범위(작은
        # 전봇대는 5x5) 안에 들어와야 한다. 한 걸음 떨어뜨려 세운 전봇대
        # 넷이 아무것도 못 켜고 서 있었던 이유가 이것이다.
        #
        # 어디까지 닿는지는 계산하지 않고 게임에 물어본다. 세워보고 기계가
        # 전기망에 들어갔는지 확인하는 쪽이 짧고 틀리지 않는다.
        try:
            head = self.bridge.wire_spot(name, source["x"], source["y"])
            foot = self.bridge.wire_spot(name, target["x"], target["y"])
        except RconError as exc:
            self.say(f"전봇대 자리를 못 물어봤습니다: {exc}", who=name)
            return
        if head.get("error") or foot.get("error"):
            self.say(f"전봇대가 닿는 자리가 없습니다: "
                     f"{head.get('error') or foot.get('error')}", who=name)
            return

        ends = [spot for spot in (head, foot) if not spot.get("already")]
        middle = max(0, math.ceil(span / POLE_REACH) - 1)
        poles = len(ends) + middle
        if poles == 0:
            self.say("이미 전기가 이어져 있습니다.", who=name)
            return

        self.say(f"발전소에서 랩까지 {span:.0f}타일, 전봇대 {poles}개를 세웁니다. "
                 f"양 끝은 기계에 닿는 자리에 붙입니다.", who=name)
        if not self.obtain(worker, "small-electric-pole", poles):
            return

        # 끝 -> 중간 -> 끝. 중간이 끊겨도 양쪽 기계는 이미 붙어 있어서,
        # 다음에 가운데만 이으면 된다.
        spots = list(ends)
        for i in range(1, middle + 1):
            share = i / (middle + 1)
            spots.append({"x": head["x"] + (foot["x"] - head["x"]) * share,
                          "y": head["y"] + (foot["y"] - head["y"]) * share})

        placed = 0
        for spot in spots:
            try:
                worker.handle.place("small-electric-pole", spot["x"], spot["y"],
                                    snap=True, timeout=240)
                placed += 1
            except TaskFailed:
                # 한 자리가 막혔다고 전선 전체를 포기할 이유는 없다.
                continue

        try:
            live = self.bridge.power_status(name)
        except RconError:
            live = {}
        watt = int(live.get("watts") or 0)
        if watt > 0:
            self.say(f"전봇대 {placed}개를 세웠고 전기가 들어왔습니다. {watt}W",
                     who=name)
        else:
            self.say(f"전봇대 {placed}개를 세웠는데 아직 0W입니다. "
                     f"가운데가 끊겼거나 보일러에 연료가 없습니다.", who=name)

    def run_wire(self, worker: Worker, at: dict) -> None:
        """전기가 있는 곳에서 필요한 곳까지 전봇대를 깐다.

        실측(2026-09-18): 발전소가 (-96,-70), 기지가 (77,24)였다. 196타일
        떨어져 있고, 기지에서 가장 가까운 물조차 141타일 밖이라 발전소를
        옮길 수도 없다. 그러면 답은 하나다 - 전봇대를 길게 깐다.

        소형 전봇대는 목재 하나와 구리선 둘이다. 196타일이면 스물일곱 개,
        목재 스물일곱 개 - 나무 몇 그루다. 이것 하나에 랩도, 조립기도,
        나중의 전기 채굴기도 전부 달려 있다.

        한 번에 여덟 개씩 깐다. 한 번에 스물일곱 개를 들고 가려면 그만큼을
        먼저 만들어야 하고, 그동안 아무도 아무것도 못 한다. 반쯤 깐 줄도
        다음 사람이 이어 깐다.
        """
        name = worker.name
        key = "wire"
        try:
            here = self.seat(worker)
            reach = self.bridge.power_reach(at.get("x", here[0]),
                                            at.get("y", here[1]))
            if not reach.get("powered"):
                self.say("전기가 붙어 있는 망이 아직 없습니다.", who=name)
                worker.block(key, 600)
                return

            live = reach["powered"]
            route = self.bridge.pole_route(name, live["x"], live["y"],
                                           at.get("x", here[0]),
                                           at.get("y", here[1]),
                                           limit=MAX_POLE_RUN)
            seats = _as_rows(route.get("poles"))
            if not seats:
                self.say(f"전봇대를 놓을 자리가 안 납니다 "
                         f"({reach.get('gap')}타일 떨어져 있습니다).", who=name)
                worker.block(key, 600)
                return

            if not self.obtain(worker, POLE, len(seats)):
                self.ask_for(worker, POLE, len(seats),
                             f"발전소까지 {reach.get('gap')}타일 전선 잇기")
                worker.block(key)
                return

            laid = 0
            for seat in seats:
                try:
                    worker.handle.place(POLE, seat["x"], seat["y"], timeout=420)
                    laid += 1
                except TaskFailed:
                    continue
            if not laid:
                worker.block(key)
                return

            after = self.bridge.power_reach(at.get("x", here[0]),
                                            at.get("y", here[1]))
            self.say(f"발전소 쪽에서 전봇대 {laid}개를 이어 깔았습니다. "
                     f"남은 거리 {reach.get('gap')} → {after.get('gap')}타일.",
                     who=name)
        except TaskFailed as exc:
            worker.block(key)
            self.say(f"전선을 잇다 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block(key)
            self.say(f"전선 작업 중 오류: {exc}", who=name)

    def lay_pipe(self, worker: Worker, at: dict) -> None:
        """끊긴 한 칸에 파이프를 놓는다."""
        name = worker.name
        if not self.obtain(worker, "pipe", 1):
            worker.block(f"pipe:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        try:
            worker.handle.place("pipe", at["x"], at["y"], timeout=420)
            self.say("파이프를 놓았습니다.", who=name)
        except TaskFailed as exc:
            worker.block(f"pipe:{at['x']:.0f},{at['y']:.0f}", 300)
            self.say(f"파이프를 못 놓았습니다: {exc.task.get('error')}", who=name)

    def plug_in(self, worker: Worker, at: dict) -> None:
        """전기가 안 통하는 기계에 닿는 자리를 물어보고 전봇대를 세운다."""
        name = worker.name
        try:
            spot = self.bridge.wire_spot(name, at["x"], at["y"])
        except RconError:
            return
        if spot.get("already"):
            return
        if spot.get("error"):
            self.say(f"전봇대가 닿는 자리가 없습니다: {spot['error']}", who=name)
            worker.block(f"plug:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        if not self.obtain(worker, "small-electric-pole", 1):
            worker.block(f"plug:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        try:
            worker.handle.place("small-electric-pole", spot["x"], spot["y"],
                                snap=True, timeout=420)
        except TaskFailed as exc:
            worker.block(f"plug:{at['x']:.0f},{at['y']:.0f}", 300)
            self.say(f"전봇대를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return
        try:
            watt = int((self.bridge.power_status(name) or {}).get("watts") or 0)
        except RconError:
            watt = 0
        self.say(f"전봇대를 세웠습니다. 전기 {watt}W" if watt
                 else "전봇대를 세웠는데 아직 0W입니다.", who=name)

    def bridge_networks(self, worker: Worker, at: dict) -> None:
        """갈라진 두 전기망 사이에 전봇대 하나를 놓는다.

        부하가 없는 기관은 0W 를 낸다. 만들지 않는 게 아니라 쓸 사람이 그
        망에 없다. 기관 셋이 «working» 인데 전력이 0W 였던 이유가 이것이다.
        """
        name = worker.name
        key = f"bridge:{at['x']:.0f},{at['y']:.0f}"
        if not self.obtain(worker, "small-electric-pole", 1):
            worker.block(key, 300)
            return
        try:
            worker.handle.place("small-electric-pole", at["x"], at["y"],
                                snap=True, timeout=420)
        except TaskFailed as exc:
            worker.block(key, 300)
            self.say(f"전봇대를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return
        try:
            watt = int((self.bridge.power_status(name) or {}).get("watts") or 0)
        except RconError:
            watt = 0
        self.say(f"전기망을 이었습니다. 전력 {watt}W" if watt
                 else "전봇대는 놓았는데 아직 0W입니다. 보일러 연료를 봐야겠습니다.",
                 who=name)

    def stoke(self, worker: Worker, at: dict) -> None:
        """보일러에 석탄을 넣는다. 보일러는 0.45/s 로 태우니 20개면 44초다."""
        name = worker.name
        if not self.obtain(worker, "coal", BOILER_FUEL):
            worker.block(f"stoke:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        try:
            worker.handle.insert("coal", at["x"], at["y"],
                                 count=BOILER_FUEL, timeout=300)
            self.say(f"보일러에 석탄 {BOILER_FUEL}개를 넣었습니다.", who=name)
        except TaskFailed as exc:
            worker.block(f"stoke:{at['x']:.0f},{at['y']:.0f}", 300)
            self.say(f"보일러에 못 넣었습니다: {exc.task.get('error')}", who=name)

    def power_repair_jobs(self, worker: Worker) -> list[Job]:
        """서 있는 발전소를 새로 짓는 대신 고친다.

        실측(259분째): 보일러 5 + 기관 7 + 펌프 7 을 지어놓고 0W 였다. 그런데
        기관 셋은 증기가 가득한 채 전봇대만 없었고, 셋은 보일러와 «한 칸»
        떨어져 있었다. 전봇대 둘과 파이프 둘이면 2.7MW 가 들어온다.

        그동안 무리는 «전력 없음»만 보고 발전소를 또 지었다. 고칠 줄 모르면
        고장난 것이 쌓이기만 한다.
        """
        try:
            faults = self.bridge.power_faults(worker.name)
        except RconError:
            return []
        if faults.get("error"):
            return []

        out: list[Job] = []
        # 전기를 만드는 망과 쓰는 망이 갈라져 있으면 그것부터. 전봇대 한 대에
        # 1.8MW 가 걸려 있고, 다른 무엇보다 싸다.
        for spot in _as_rows(faults.get("bridges"))[:2]:
            out.append(Job(
                f"전기는 만들어지는데 랩이 다른 전기망에 있습니다. "
                f"{spot.get('gap', 0)}타일 사이에 전봇대를 하나 놓아 잇겠습니다. "
                f"({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"bridge:{spot['x']:.0f},{spot['y']:.0f}",
                routine="bridge", at=spot))

        # 파이프가 먼저다. 이어지지 않은 기관은 전봇대를 꽂아도 0W 다.
        for spot in _as_rows(faults.get("pipes"))[:3]:
            out.append(Job(
                f"{spot.get('joins', '발전소')} 사이가 한 칸 떠 있습니다. "
                f"파이프로 잇겠습니다. ({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"pipe:{spot['x']:.0f},{spot['y']:.0f}",
                routine="pipe", at=spot))
        for spot in _as_rows(faults.get("poles"))[:3]:
            out.append(Job(
                f"{spot.get('name', '기관')}에 증기는 찼는데 전봇대가 없습니다. "
                f"({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"plug:{spot['x']:.0f},{spot['y']:.0f}",
                routine="plug", at=spot))
        for spot in _as_rows(faults.get("fuel"))[:2]:
            out.append(Job(
                f"보일러에 연료가 없습니다. ({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"stoke:{spot['x']:.0f},{spot['y']:.0f}",
                routine="stoke", at=spot))

        # 위의 넷은 «가까이 있는 것이 어긋난» 경우다. 그것으로 안 되면
        # 남은 이유는 하나다 - 발전소가 기지에서 너무 멀다.
        #
        # 실측: 발전소 (-96,-70), 기지 (77,24). 196타일. 물조차 141타일
        # 밖이라 발전소를 옮길 수도 없다. 전봇대를 길게 까는 수밖에 없고,
        # 소형 전봇대는 목재 하나와 구리선 둘이니 스물일곱 개래야 나무
        # 몇 그루다. 랩도 조립기도 나중의 전기 채굴기도 전부 여기 달렸다.
        if not out:
            try:
                home = (self.bridge.base() or {}).get("home")
                reach = self.bridge.power_reach(home["x"], home["y"]) if home else {}
            except (RconError, KeyError, TypeError):
                reach = {}
            gap = int(reach.get("gap") or 0)
            if reach.get("powered") and gap > POLE_REACH:
                out.append(Job(
                    f"발전소가 기지에서 {gap}타일 떨어져 있습니다. 전봇대를 "
                    f"이어 깔아 기지까지 전기를 끌어오겠습니다.",
                    key="wire", routine="wire", at=home,
                    needs={POLE: MAX_POLE_RUN}))
        return out

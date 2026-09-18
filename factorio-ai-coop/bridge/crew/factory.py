"""만드는 일 - 조립기와 과학, 벨트, 그리고 방어."""

from __future__ import annotations

import sys
import threading

from client import RconError, TaskFailed

from settings import (BACKOFF_SECONDS, BELT_REACH, BELT_SPARE, FIRST_PACKS,
                      SCIENCE_FEED,
                      TURRET_AMMO, TURRET_RING, TURRET_TARGET)
from world import Snapshot
from jobs import Job
from ladder import STAGE_TARGET, _as_rows
from worker import Worker


class FactoryMixin:
    """만드는 일 - 조립기와 과학, 벨트, 그리고 방어."""

    # 무엇을 시키면 무엇이 도는가. 사슬이 아니라 표인 이유는, 새 일거리를
    # 넣을 때 사슬을 처음부터 읽지 않아도 되게 하기 위해서다.
    ROUTINES = {
        "power":   lambda crew, worker, at: crew.build_power(worker),
        "rescue":  lambda crew, worker, at: crew.rescue(worker, at),
        "depot":   lambda crew, worker, at: crew.build_depot(worker, at),
        "defend":  lambda crew, worker, at: crew.build_defence(worker, at),
        "pipe":    lambda crew, worker, at: crew.lay_pipe(worker, at),
        "plug":    lambda crew, worker, at: crew.plug_in(worker, at),
        "bridge":  lambda crew, worker, at: crew.bridge_networks(worker, at),
        "rig":     lambda crew, worker, at: crew.build_rig(worker, at),
        "convert": lambda crew, worker, at: crew.convert_chest(worker, at),
        "belt":    lambda crew, worker, at: crew.lay_belt(worker, at),
        "science": lambda crew, worker, at: crew.build_science(worker, at),
        "packs":   lambda crew, worker, at: crew.first_packs(worker, at),
        "arm":     lambda crew, worker, at: crew.arm_turret(worker, at),
        "stoke":   lambda crew, worker, at: crew.stoke(worker, at),
        "wire":    lambda crew, worker, at: crew.run_wire(worker, at),
        "line":    lambda crew, worker, at: crew.lay_line(worker, at),
        "open":    lambda crew, worker, at: crew.open_drills(worker, at),
    }

    def start_routine(self, worker: Worker, routine: str, ore: str | None = None,
                      at: dict | None = None) -> bool:
        """Run a long build-out off the main loop; it walks, crafts and builds."""
        if not worker.slot.acquire(blocking=False):
            return False
        work = self.ROUTINES.get(routine)

        def run() -> None:
            try:
                if work:
                    work(self, worker, at or {})
                else:
                    self.automate(worker, ore)
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] {routine} failed: {exc!r}", file=sys.stderr)
                self.thoughts.put((worker.name, f"{routine} 중 문제가 생겼습니다.", []))
            finally:
                worker.slot.release()

        threading.Thread(target=run, daemon=True).start()
        return True

    def first_packs(self, worker: Worker, at: dict) -> None:
        """빨간 과학팩 열 개를 만들어 랩에 넣는다. 사슬의 첫 문이다.

        Automation 연구는 팩 열 개면 되고 손으로 만들어도 된다(게임 공식값).
        그 하나가 로지스틱도 전기 채굴기도 터렛도 전부 연다.

        그런데 우리는 창고에 철판 3,979개와 구리판 7,774개를 쌓아두고 기어를
        «한 개도» 만든 적이 없었다. 체인 감사가 그것을 말해줬다 - 기어와
        과학팩만 시간당 생산량이 0 이었다.

        손에 없으면 창고에서 꺼내온다. obtain 이 그 일을 안다. 「만들 수
        있는가」를 손으로만 묻지 않는 것이 이 루틴의 전부다.
        """
        name = worker.name
        key = "first-packs"
        pack = "automation-science-pack"
        try:
            if not self.obtain(worker, pack, FIRST_PACKS):
                self.explain_shortfall(worker, pack, FIRST_PACKS, {})
                worker.block(key, BACKOFF_SECONDS)
                return
            worker.handle.insert(pack, at["x"], at["y"],
                                 count=FIRST_PACKS, timeout=300)
            self.say(f"빨간 과학팩 {FIRST_PACKS}개를 랩에 넣었습니다. "
                     f"automation 연구가 이제 돕니다.", who=name)
        except TaskFailed as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"과학팩을 랩에 못 넣었습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"과학팩 작업 중 오류: {exc}", who=name)

    def build_science(self, worker: Worker, at: dict) -> None:
        """랩 옆에 조립기를 세워 과학팩을 스스로 만들게 한다.

            [조립기] → [인서터] → [랩]

        손으로 만든 과학팩 스무 개가 아홉 시간 막혀 있던 연구를 스무 분 만에
        세 칸 밀어올렸다. 그런데 그 스무 개는 누가 손으로 만든 것이라, 다
        쓰면 다시 멈춘다. 조립기 한 대가 랩 한 대를 영원히 채운다.
        """
        name = worker.name
        key = f"science-rig:{at['x']:.0f},{at['y']:.0f}"
        try:
            plan = self.bridge.assembler_site(name, at["x"], at["y"])
        except RconError:
            return
        if plan.get("error"):
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"랩 옆에 조립기 자리가 없습니다: {plan['error']}", who=name)
            return

        shop, hand = plan["assembler"], plan["inserter"]
        for part in ("assembling-machine-1", hand["name"]):
            if not self.obtain(worker, part, 1):
                self.say(f"{part}을(를) 못 구했습니다.", who=name)
                worker.block(key, BACKOFF_SECONDS)
                return

        pack = STAGE_TARGET["red-science"][0]
        try:
            built = worker.handle.place("assembling-machine-1", shop["x"], shop["y"],
                                        timeout=420)
            answer = self.bridge.set_recipe(name, built["x"], built["y"], pack)
            if answer.get("error"):
                self.say(f"조립기에 레시피를 못 넣었습니다: {answer['error']}",
                         who=name)
                worker.block(key, BACKOFF_SECONDS)
                return
            worker.handle.place(hand["name"], hand["x"], hand["y"],
                                direction=hand["direction"], timeout=300)
        except TaskFailed as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"조립기를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return

        # 전기. 조립기도 인서터도 전기를 먹는다 - 전봇대가 닿는 자리를
        # 게임에 물어 세운다.
        for spot in (built, hand):
            try:
                where = self.bridge.wire_spot(name, spot["x"], spot["y"])
            except RconError:
                continue
            if where.get("already") or where.get("error"):
                continue
            if self.obtain(worker, "small-electric-pole", 1):
                try:
                    worker.handle.place("small-electric-pole", where["x"],
                                        where["y"], snap=True, timeout=240)
                except TaskFailed:
                    pass

        # 첫 재료. 이 뒤로는 화로에서 나오는 판금을 나르는 일감이 채운다.
        for item, amount in (("copper-plate", SCIENCE_FEED),
                             ("iron-gear-wheel", SCIENCE_FEED)):
            if not self.obtain(worker, item, amount):
                continue
            try:
                worker.handle.insert(item, built["x"], built["y"],
                                     count=amount, timeout=240)
            except TaskFailed:
                pass

        self.say(f"랩 옆에 조립기를 세우고 {pack}을(를) 만들게 했습니다. "
                 f"이제 과학팩은 손으로 안 만들어도 됩니다. "
                 f"({built['x']:.0f}, {built['y']:.0f})", who=name)

    def lay_belt(self, worker: Worker, at: dict) -> None:
        """채굴기에서 화로까지 벨트를 깔고, 끝에 인서터를 단다.

            [채굴기] → [벨트][벨트][벨트] → [인서터] → [화로]

        채굴기는 벨트에 «직접» 떨군다. 인서터가 필요한 곳은 화로 쪽
        하나뿐이다. 이 한 줄이 지금까지 측정된 병목 둘을 동시에 없앤다 —
        꽉 찬 상자에 막힌 채굴기와, 그 옆에서 굶는 화로.
        """
        name = worker.name
        key = f"belt:{at['x']:.0f},{at['y']:.0f}"
        drill, oven = at.get("drill") or {}, at.get("furnace") or {}
        if not drill or not oven:
            worker.block(key, BACKOFF_SECONDS)
            return

        # 채굴기가 떨구는 칸에서 출발해, 화로 바로 앞에서 끝난다. 화로
        # 칸까지 가면 벨트를 화로 위에 놓으려 든다.
        try:
            route = self.bridge.belt_route(
                name, drill["drop_x"], drill["drop_y"], oven["x"], oven["y"])
        except RconError:
            return
        if route.get("error"):
            self.say(f"벨트 길이 안 납니다: {route['error']}", who=name)
            worker.block(key, BACKOFF_SECONDS)
            return

        tiles = _as_rows(route.get("tiles"))
        if not tiles or len(tiles) > BELT_REACH:
            worker.block(key, BACKOFF_SECONDS)
            return

        need = len(tiles) + BELT_SPARE
        if not self.obtain(worker, "transport-belt", need):
            self.say(f"벨트 {need}개를 못 구했습니다.", who=name)
            worker.block(key, BACKOFF_SECONDS)
            return

        self.say(f"채굴기에서 화로까지 벨트 {len(tiles)}칸을 깔겠습니다. "
                 f"깔고 나면 이 광석은 손으로 나를 일이 없습니다.", who=name)
        laid = 0
        for tile in tiles:
            try:
                worker.handle.place("transport-belt", tile["x"], tile["y"],
                                    direction=tile["dir"], timeout=240)
                laid += 1
            except TaskFailed:
                # 한 칸이 막혔다고 줄 전체를 버리지 않는다. 끊긴 자리는
                # 다음 점검에서 같은 길로 다시 시도한다.
                continue

        # 화로 쪽 끝. 벨트에서 집어 화로에 넣는다.
        tail = tiles[-1]
        try:
            rig = self.bridge.fuel_rig(name, oven["x"], oven["y"])
        except RconError:
            rig = {"error": "no answer"}
        if not rig.get("error") and self.obtain(worker, "burner-inserter", 1):
            arm = rig["inserter"]
            try:
                worker.handle.place("burner-inserter", arm["x"], arm["y"],
                                    direction=arm["direction"], timeout=240)
            except TaskFailed:
                pass

        self.say(f"벨트 {laid}칸을 깔았습니다. "
                 f"({tail['x']:.0f}, {tail['y']:.0f})", who=name)

    def build_defence(self, worker: Worker, spot: dict) -> None:
        """터렛 한 대를 세우고 총알을 채운다."""
        name = worker.name
        try:
            if not self.obtain(worker, "gun-turret", 1):
                self.say("터렛을 못 만들었습니다.", who=name)
                worker.block("defend", 300)
                return
            placed = worker.handle.place("gun-turret", spot["x"], spot["y"],
                                         snap=True, timeout=420)
            if self.obtain(worker, "firearm-magazine", TURRET_AMMO):
                worker.handle.insert("firearm-magazine", placed["x"], placed["y"],
                                     count=TURRET_AMMO, timeout=180)
                self.say(f"터렛을 세우고 총알 {TURRET_AMMO}발을 넣었습니다. "
                         f"({placed['x']:.0f}, {placed['y']:.0f})", who=name)
            else:
                self.say("터렛은 세웠는데 총알이 없습니다. 빈 터렛은 세우지 않은 것과 같습니다.",
                         who=name)
        except TaskFailed as exc:
            worker.block("defend", 300)
            self.say(f"터렛을 못 세웠습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("defend", 300)
            self.say(f"방어 구축 중 오류: {exc}", who=name)

    def defence_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """터렛을 방어선 위에 세운다.

        습격이 온 다음에 짓기 시작하면 이미 늦다. 터렛은 낭비가 아니라
        대비고, 총알을 안 넣은 터렛은 세우지 않은 것과 같다.

        자리는 «사람 둘레»가 아니라 «우리 건물 전체의 테두리»다. 사람은
        움직이고 공장은 안 움직인다 - 지킬 것은 사람이 아니라 공장이다.
        예전에는 화로 한 대를 기지로 치고 네 모서리에 하나씩 놓았는데,
        그 화로가 어디 있느냐에 따라 방어선이 통째로 옮겨 다녔다.

        그리고 적이 오는 쪽부터다. 둥지가 스물여덟 곳이면 사방에 있지만,
        공해가 먼저 닿는 쪽이 먼저 온다.
        """
        try:
            wall = self.bridge.defence(worker.name)
        except RconError:
            return None
        if wall.get("error") or not wall.get("can_turret"):
            return None

        # 굶은 총부터 먹인다. 총을 더 놓는 것보다 먼저다.
        #
        # 실측(습격 직후): 터렛 다섯 대 중 둘이 탄약 0, 탄약 누적 생산 0.
        # 세상에 있는 스물아홉 발은 전부 시작 재고였다. 한 번도 만든 적이
        # 없다. 그 습격에 화로 8대, 벨트 19칸, 그리고 요원 하나를 잃었다.
        #
        # 총알 없는 터렛은 세우지 않은 것과 같다. 여섯 번째 총을 세우는
        # 것보다 둘째와 다섯째 총을 먹이는 것이 싸고 빠르다.
        starved = _as_rows(wall.get("starved"))
        if starved:
            taken = self.taken()
            fill = int(wall.get("fill") or TURRET_AMMO)
            for spot in starved:
                key = "arm:%.0f,%.0f" % (spot["x"], spot["y"])
                if key in taken:
                    continue
                return Job(
                    f"터렛에 탄약이 {int(spot.get('ammo') or 0)}발뿐입니다. "
                    f"{fill}발을 채우겠습니다. "
                    f"({spot['x']:.0f}, {spot['y']:.0f})",
                    key=key, routine="arm",
                    needs={"firearm-magazine": fill},
                    at={"x": spot["x"], "y": spot["y"]})

        if int(wall.get("turrets") or 0) >= TURRET_TARGET:
            return None
        seats = _as_rows(wall.get("seats"))
        if not seats:
            return None

        taken = self.taken()
        for seat in seats:
            key = "defend:%.0f,%.0f" % (seat["x"], seat["y"])
            if key in taken:
                continue
            gap = wall.get("slack")
            urgency = ("공해가 둥지까지 %s타일 남았습니다. " % int(gap)
                       if isinstance(gap, (int, float)) else "")
            return Job(
                f"{urgency}{wall.get('side', '적')} 쪽 방어선에 터렛을 "
                f"세우겠습니다 ({int(wall.get('turrets') or 0) + 1}/{TURRET_TARGET}). "
                f"({seat['x']:.0f}, {seat['y']:.0f})",
                key=key, routine="defend", at=seat)
        return None

    def arm_turret(self, worker: Worker, at: dict) -> None:
        """터렛 하나에 탄약을 채운다. 없으면 만든다.

        탄창 하나가 철판 넉 장이다. 철판은 창고에 이만 장이 있는데 탄약은
        한 발도 만든 적이 없었다 - 재료가 없어서가 아니라 아무도 그 일을
        시키지 않아서다.
        """
        name = worker.name
        want = int(at.get("fill") or TURRET_AMMO)
        if not self.obtain(worker, "firearm-magazine", want):
            # 다 못 구했어도 있는 만큼은 넣는다. 스무 발을 못 구했다고
            # 다섯 발도 안 넣으면 그 총은 계속 빈 총이다.
            try:
                hand = (self.bridge.call("inventory", name).get("items") or {})
            except RconError:
                hand = {}
            want = int(hand.get("firearm-magazine") or 0)
        if want <= 0:
            self.say(f"탄약을 못 구했습니다. 철판 {TURRET_AMMO * 4}장이 필요합니다.",
                     who=name)
            worker.block("arm", BACKOFF_SECONDS)
            return
        try:
            worker.handle.insert("firearm-magazine", want, at["x"], at["y"], timeout=600)
        except TaskFailed as exc:
            self.say(f"탄약을 못 넣었습니다: {exc.task.get('error')}", who=name)
            return
        self.say(f"터렛에 탄약 {want}발을 채웠습니다.", who=name)

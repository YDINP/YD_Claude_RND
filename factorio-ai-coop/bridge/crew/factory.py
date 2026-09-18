"""만드는 일 - 조립기와 과학, 벨트, 그리고 방어."""

from __future__ import annotations

import sys
import threading

from client import RconError, TaskFailed

from settings import (BACKOFF_SECONDS, BELT_REACH, BELT_SPARE, SCIENCE_FEED,
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
        "stoke":   lambda crew, worker, at: crew.stoke(worker, at),
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
        """터렛을 미리 세운다.

        습격이 온 다음에 짓기 시작하면 이미 늦다. 터렛은 낭비가 아니라
        대비고, 총알을 넣어두지 않은 터렛은 세우지 않은 것과 같다.

        자리는 기지 둘레다 - 화로가 모인 곳을 기지로 보고, 네 방향으로
        조금 떨어뜨려 세운다.
        """
        if not self.danger.get("can_build_turret"):
            return None
        if int(self.danger.get("turrets") or 0) >= TURRET_TARGET:
            return None

        base = snap.building("stone-furnace") or {"x": snap.x, "y": snap.y}
        nth = int(self.danger.get("turrets") or 0)
        corner = ((1, 1), (-1, 1), (-1, -1), (1, -1))[nth % 4]
        spot = {"x": base["x"] + corner[0] * TURRET_RING,
                "y": base["y"] + corner[1] * TURRET_RING}
        return Job(f"터렛을 미리 세웁니다 ({nth + 1}/{TURRET_TARGET}).",
                   key=f"defend:{nth}", routine="defend", at=spot)

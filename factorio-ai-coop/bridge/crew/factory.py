"""만드는 일 - 조립기와 과학, 벨트, 그리고 방어."""

from __future__ import annotations

import math

import sys
import threading

from client import RconError, TaskFailed

from settings import (BACKOFF_SECONDS, BELT_REACH, BELT_SPARE, FIRST_PACKS,
                      SCIENCE_FEED,
                      DANGER_LOOK, DANGER_NEAR, DANGER_PER_HEAD, RETREAT_SPAN,
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

    def flee_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """적이 코앞이면 일을 놓고 물러난다.

        사용자: "또 기지 박살낫네". 전투 통계가 값을 말해준다:

            잃은 것   캐릭터 74, 채굴기 14, 화로 11, 상자 14
            잡은 것   바이터 0마리

        일흔네 번 죽었다. 그런데 한 마리도 못 잡았다 - 요원은 총이 없고,
        맨손으로 바이터를 이기지 못한다. 싸운 것이 아니라 그냥 서 있다가
        물린 것이다.

        그리고 죽으면 들고 있던 것을 «전부» 흘린다. 철판도 벨트도 탄약
        재료도 시체와 함께 땅에 떨어진다. 아무것도 안 쌓이는 진짜 이유가
        이것이었다 - 만들어도 죽을 때마다 사라진다.

        이길 수 없는 싸움에서는 물러나는 것이 유일한 수다. 터렛이 대신
        싸워줄 때까지는.
        """
        try:
            near = self.bridge.call("threat", worker.name, DANGER_LOOK)
        except RconError:
            return None
        if near.get("error"):
            return None
        gap = near.get("nearest_attacker")
        if not isinstance(gap, (int, float)):
            return None

        # 떼로 오면 더 일찍 물러난다.
        #
        # 스물넷으로 못 박아뒀더니 무리 다섯이 전멸했다. 로그의 마지막
        # 줄이 "적 27마리가 0타일 앞에 있습니다" 였다 - 0타일이면 이미
        # 붙은 뒤고, 붙은 다음에 걷기 시작하면 못 벗어난다.
        #
        # 작은 바이터가 사람보다 빠르다. 그러니 거리는 «싸울 수 있는가»가
        # 아니라 «달아날 수 있는가»로 정해야 하고, 둘이 쫓을 때와 스물일곱이
        # 쫓을 때는 달아날 수 있는 거리가 다르다.
        many = int(near.get("attackers") or 1)

        # 총이 없으면 «보이면» 도망이다.
        #
        # 사용자: "캐릭터가 적을보면 도망가게해야함"
        #
        # 그리고 그 전에 셈이 어긋나 있었다. 기준은 최대 백 타일까지
        # 벌어지는데 살피는 반경이 여든 타일로 못 박혀 있었다:
        #
        #     기준   40 + 34마리 x 3 = 100타일
        #     반경                     80타일
        #     로그   "적 34마리가 92타일 앞에 있습니다"
        #
        # 아흔두 타일은 기준 «안»인데 반경 «밖»이다. 자기 규칙을 켤 만큼
        # 멀리 못 봤다. 그래서 둘이 죽었다.
        #
        # 재는 거리와 판정하는 거리가 따로 놀면 판정은 재는 거리에 갇힌다.
        # 이제 반경이 기준을 덮고(DANGER_LOOK), 기준은 총이 있느냐가 정한다.
        #
        #   총 없음   보이는 족족 물러난다. 맨손으로는 한 마리도 못 잡는다 -
        #             이 저장소의 전투 기록은 「잡은 것 없음」뿐이다.
        #   총 있음   터렛 사거리 밖까지만. 터렛이 대신 싸우므로 일을 한다.
        armed = int(near.get("turrets") or 0) > 0
        if armed:
            edge = DANGER_NEAR + min(many, 20) * DANGER_PER_HEAD
        else:
            edge = DANGER_LOOK

        # 둥지가 코앞인 지도에서는 「보이면 도망」이 「영원히 도망」이 된다.
        #
        # 사용자: "이번맵은 적군기지가 너무가까이있음."
        #
        # 실측(1분째): 가장 가까운 둥지 50타일, 적 9마리가 40타일 앞.
        # 지금까지의 지도는 264 / 204 / 189 / 142 / 130 이었다. 절반이다.
        #
        # 백이십 타일을 기준으로 삼으면 둥지 «자체»가 기준 안에 든다.
        # 둥지 앞을 서성이는 지킴이와, 우리를 향해 오는 떼는 다른 것인데
        # 그 둘이 구별되지 않는다. 그러면 아무도 일을 못 하고, 일을 못
        # 하면 총을 못 만들고, 총이 없으면 영원히 도망이다.
        #
        # 그래서 기준은 둥지까지의 거리를 넘지 않는다. 둥지 절반쯤에서
        # 물러나면 「집 앞의 그들」이 아니라 「나온 그들」에게만 반응한다.
        nest = near.get("nearest_nest")
        if isinstance(nest, (int, float)) and nest > 0:
            edge = min(edge, max(DANGER_NEAR, nest * 0.6))

        if gap > edge:
            return None

        try:
            home = (self.bridge.base() or {}).get("home")
        except RconError:
            home = None

        here = self.seat(worker)
        at_home = bool(home) and math.dist(here, (home["x"], home["y"])) < 12

        # 기지가 이미 뚫렸으면 기지는 피난처가 아니다.
        #
        # 여기 「기지에 있으면 더 물러날 데가 없으니 차라리 일을 한다」가
        # 적혀 있었다. 적이 «밖에» 있을 때는 맞는 말이다. 그런데 514분째
        # 판에서 로그가 이랬다:
        #
        #   적 36마리가 28타일 앞에 있습니다. ... 연구를 먼저 돌리겠습니다.
        #   적 36마리가 18타일 앞에 있습니다. ...
        #   적 36마리가 13타일 앞에 있습니다. ...
        #   적 36마리가  0타일 앞에 있습니다. ...
        #   bravo이(가) 쓰러졌습니다. 남은 사람 0명.
        #
        # 서른여섯 마리가 기지 «안으로» 걸어 들어오는 동안 넷이 전부
        # 제자리에서 일을 했다. 이 한 줄이 그렇게 시켰다.
        #
        # 물러날 데가 없는 것이 아니라 «반대쪽»이 있다. 떼가 오는 쪽을
        # 알면 그 반대로 가면 된다. 그래서 위협에 무게중심을 붙였다.
        swarm = near.get("swarm")
        if at_home:
            if not isinstance(swarm, dict):
                return None
            dx, dy = here[0] - swarm["x"], here[1] - swarm["y"]
            span = math.hypot(dx, dy)
            if span < 1:
                return None
            spot = {"x": int(here[0] + dx / span * RETREAT_SPAN),
                    "y": int(here[1] + dy / span * RETREAT_SPAN)}
            told = (f"적 {many}마리가 기지 안까지 들어왔습니다. 여기는 "
                    f"더 이상 피난처가 아닙니다. 반대쪽으로 물러나겠습니다.")
        elif home:
            spot = {"x": home["x"], "y": home["y"]}
            told = (f"적 {many}마리가 {int(gap)}타일 앞에 있습니다. 맨손으로는 "
                    f"못 이깁니다. 기지로 물러나겠습니다.")
        else:
            return None

        return Job(told, key=f"flee:{worker.name}",
                   steps=[("walk", spot)], at=spot)

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

        # 몇 대가 있어야 하는가는 «게임 쪽이 안다».
        #
        # 여기 있던 것은 `settings.TURRET_TARGET`(10) 이었고, 세는 것도
        # 「세운 수」였다. 그런데 defence.lua 는 공해 여유로 필요한 수를
        # 재고(여유 20타일 이하면 12대), 빚을 「먹인 수」로 센다:
        #
        #     want = turrets_wanted(slack)        12
        #     debt = max(0, want - armed)
        #
        # 그 want 를 브릿지 어디에서도 안 읽고 있었다. 그래서 열 대를
        # 전부 먹여도 debt 가 2 로 남고, 그 빚이 `snap.debt <= 0` 을 통해
        # 채굴기·화로의 성장 한 걸음을 막고, `chain_toward` 가 놓을 수
        # 없는 터렛을 기다리며 기술 사다리를 통째로 세운다.
        #
        # 갚을 수 없는 빚은 빚이 아니라 벌이다 - 이 저장소가 이미 한 번
        # 적어둔 말인데, 그때는 「연구 미완」 경우만 막아두었다.
        #
        # 고치는 방향은 TURRET_TARGET 을 12 로 «올리는» 것이 아니다.
        # 그러면 같은 실수를 한 번 더 만든다 - 두 곳이 같은 것을 따로
        # 세는 한 언제든 다시 어긋난다. 세는 쪽을 하나로 만든다.
        want_turrets = int(wall.get("want") or TURRET_TARGET)
        armed = int(wall.get("armed") or 0)
        if armed >= want_turrets:
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
                f"세우겠습니다 (탄약 든 것 {armed}/{want_turrets}대). "
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
        # 개수는 «키워드»로 준다.
        #
        #     insert(name, x, y, count=1)          <- 서명
        #     insert("firearm-magazine", want, x, y)  <- 여기 있던 것
        #
        # 자리가 하나씩 밀려 x=want, y=at["x"], count=at["y"] 가 됐다.
        # 터렛이 (-60,-74) 이고 want 가 10 이면 탄약이 좌표 (10,-60) 으로
        # 간다. 게임은 「nothing with an inventory at 10,-60」 이라 답하고,
        # 터렛은 영원히 빈 총으로 남는다.
        #
        # 저장소의 다른 insert 열세 곳은 전부 키워드다. 이 한 줄만 달랐다.
        try:
            worker.handle.insert("firearm-magazine", at["x"], at["y"],
                                 count=want, timeout=600)
        except TaskFailed as exc:
            self.say(f"탄약을 못 넣었습니다: {exc.task.get('error')}", who=name)
            # 못 넣었으면 잠시 접는다. 접지 않으면 방어 일감이 매 순찰
            # 같은 터렛으로 돌아오고, 그 가지가 `return` 으로 끝나므로
            # 새 터렛을 세우는 데까지 영영 못 간다 - 못 먹이고 못 세운다.
            worker.block("arm", BACKOFF_SECONDS)
            return
        self.say(f"터렛에 탄약 {want}발을 채웠습니다.", who=name)

"""캐는 일 - 채굴기와 상자, 석탄 자급쌍, 그리고 급유."""

from __future__ import annotations

from client import RconError, TaskFailed

from settings import (BACKOFF_SECONDS, CHEST, COAL_PAIRS, DRILL, DRILLS_PER_TRIP,
                      DRILL_FUEL, FURNACE_FUEL, RIGS_PER_TRIP, RIG_COAL,
                      SMELTED_BY_FURNACE, SMELT_BATCH)
from jobs import Job, Step
from layout import carry_split, cluster, nearest_to, spread_sites
from ladder import _as_rows, worth_building
from worker import Worker


class MiningMixin:
    """캐는 일 - 채굴기와 상자, 석탄 자급쌍, 그리고 급유."""

    def automate(self, worker: Worker, ore: str | None) -> None:
        """광맥 하나를 사람 손에서 떼어낸다.

        무엇을 놓느냐가 «손으로 나르는가»를 가른다.

        - 석탄: 마주보는 채굴기 두 대. 각자 캔 석탄이 상대의 연료함으로
          직행해서 둘이 서로를 영원히 먹인다. 이게 없으면 사람이 드릴
          열여덟 대에 석탄을 손으로 날라야 하고, 실제로 여덟 중 넷이 그
          일만 하고 있었다.
        - 철/구리: 채굴기 출력면에 화로를 바로 붙인다. 채굴기는 캐자마자
          앞 칸에 떨구고, 그 칸이 화로면 인서터 없이 제련이 시작된다.
          광석을 상자에 쌓아두고 사람이 퍼 나를 이유가 없다.
        - 그 밖: 상자. 돌은 화로에 넣을 일이 드물다.
        """
        ore = ore or "coal"
        name = worker.name
        if ore == "coal":
            self.automate_coal(worker)
            return

        receiver = CHEST if ore not in SMELTED_BY_FURNACE else "stone-furnace"
        try:
            # 더 세우기 전에, 이미 선 것들이 도는지 본다.
            row = (self.bridge.health(name) or {}).get(DRILL) or {}
            ok, why = worth_building(row)
            if not ok:
                self.say(f"채굴기를 더 세우지 않겠습니다. {why}. "
                         f"막힌 것을 먼저 풀어야 합니다.", who=name)
                worker.block(f"automate:{ore}", BACKOFF_SECONDS)
                return
        except RconError:
            pass

        try:
            snap = worker.snapshot()
            spot = snap.ore(ore)
            if not spot:
                self.say(f"{ore} 광맥이 주변 200타일 안에 안 보입니다.", who=name)
                return

            for part in (DRILL, receiver):
                if not self.obtain(worker, part, 1):
                    self.say(f"{part}를 못 구했습니다.", who=name)
                    worker.block("automate")
                    return

            sites = self.bridge.drill_site(name, spot["x"], spot["y"],
                                           radius=12, receiver=receiver, ore=ore)
            if not sites:
                self.say(f"{ore} 광맥에 {receiver}를 붙일 자리가 없습니다.", who=name)
                worker.block(f"automate:{ore}", 300)
                return

            # 한 번 걸어가서 여러 대를 세운다. 자리는 이미 «오래 갈 순서»로
            # 와 있고, 겹치는 것만 걸러내면 그대로 한 줄이 된다.
            field = spread_sites(sites, DRILLS_PER_TRIP)
            what = "화로" if receiver == "stone-furnace" else "상자"
            head = field[0]
            life = int(head.get("seconds") or 0)
            self.say(f"{ore} 광맥에 채굴기 {len(field)}대와 {what}를 붙이겠습니다. "
                     f"가장 두꺼운 자리는 ({head['x']:.0f}, {head['y']:.0f}), "
                     f"{head.get('richness', 0)}개 묻혀 있어 {life // 60}분짜리입니다.",
                     who=name)

            built = 0
            for site in field:
                # 두 대째부터는 재료를 다시 구한다. 첫 대 값만 들고 가서
                # 나머지를 못 세우는 일이 없도록.
                if built and not (self.obtain(worker, DRILL, 1)
                                  and self.obtain(worker, receiver, 1)):
                    self.say(f"자재가 떨어져 {built}대까지만 세웠습니다.", who=name)
                    break
                try:
                    drill = worker.handle.place(DRILL, site["x"], site["y"],
                                                direction=site["direction"],
                                                timeout=420)
                except TaskFailed:
                    # 한 자리가 막혔다고 줄 전체를 포기할 이유는 없다.
                    continue

                aimed = self.bridge.aim_drill(name, drill["x"], drill["y"])
                if aimed.get("error"):
                    continue
                if aimed.get("turned"):
                    self.say("출구가 막혀 채굴기를 돌렸습니다.", who=name)

                if site.get("outlet") == "free":
                    try:
                        worker.handle.place(receiver, aimed["drop_x"],
                                            aimed["drop_y"], timeout=240)
                    except TaskFailed:
                        pass

                # 채굴기는 광석만 떨군다. 연료는 절대 넣어주지 않는다 -
                # 화로도 채굴기도 석탄은 따로 받아야 한다.
                for target in ((drill["x"], drill["y"]),
                               (aimed["drop_x"], aimed["drop_y"])):
                    if receiver != "stone-furnace" and target[0] == aimed["drop_x"]:
                        continue
                    if worker.handle.items().get("coal", 0) < DRILL_FUEL:
                        if not self.obtain(worker, "coal", DRILL_FUEL):
                            break
                    try:
                        worker.handle.insert("coal", target[0], target[1],
                                             count=DRILL_FUEL, timeout=180)
                    except TaskFailed:
                        pass
                built += 1

            if built:
                self.say(f"{ore} 채굴기 {built}대를 세웠습니다. "
                         f"손으로 캐는 것보다 {built * 4}배 빠릅니다.", who=name)
            else:
                self.say(f"{ore} 채굴기를 한 대도 못 세웠습니다.", who=name)
                worker.block(f"automate:{ore}", 300)

        except TaskFailed as exc:
            worker.block("automate")
            self.say(f"자동화 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("automate")
            self.say(f"자동화 중 오류: {exc}", who=name)

    def automate_coal(self, worker: Worker) -> None:
        """석탄 광맥 위에 서로를 먹이는 채굴기 두 대를 세운다."""
        name = worker.name
        try:
            snap = worker.snapshot()
            spot = snap.ore("coal")
            if not spot:
                self.say("석탄 광맥이 주변에 안 보입니다.", who=name)
                worker.block("automate:coal", 300)
                return

            plan = self.bridge.coal_pair_site(name, spot["x"], spot["y"],
                                              radius=16, pairs=COAL_PAIRS)
            if plan.get("error"):
                self.say(f"석탄 자급쌍 자리가 없습니다: {plan['error']}", who=name)
                worker.block("automate:coal", 300)
                return

            # 재료가 되는 만큼 세운다. 예전에는 두 대를 한꺼번에 못 구하면
            # 통째로 포기했고, 초반에는 철판이 늘 모자라 한 쌍도 못 섰다.
            # 그동안 다른 경로가 석탄 위에 상자 달린 채굴기를 하나씩
            # 세웠으니, 자급쌍은 영영 안 생겼다.
            built = 0
            for pair in _as_rows(plan.get("pairs")) or [plan]:
                if not self.obtain(worker, DRILL, 2):
                    break
                try:
                    for seat in ("first", "second"):
                        where = pair[seat]
                        worker.handle.place(DRILL, where["x"], where["y"],
                                            direction=where["direction"],
                                            timeout=420)
                except TaskFailed:
                    continue
                # 첫 삽만 사람이 떠준다. 그 뒤로는 둘이 서로 먹인다.
                if self.obtain(worker, "coal", DRILL_FUEL):
                    try:
                        worker.handle.insert("coal", pair["first"]["x"],
                                             pair["first"]["y"],
                                             count=DRILL_FUEL, timeout=180)
                    except TaskFailed:
                        pass
                built += 1

            if not built:
                self.say("채굴기를 못 구해 석탄 자급쌍을 못 세웠습니다.", who=name)
                worker.block("automate:coal")
                return
            self.say(f"석탄 광맥에 서로 먹이는 채굴기 {built * 2}대를 "
                     f"({built}쌍) 세웠습니다. 이제 손으로 넣어줄 필요가 "
                     f"없습니다.", who=name)

        except TaskFailed as exc:
            worker.block("automate:coal")
            self.say(f"석탄 자급쌍 구축 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("automate:coal")
            self.say(f"석탄 자급쌍 구축 중 오류: {exc}", who=name)

    def build_rig(self, worker: Worker, at: dict) -> None:
        """«석탄 상자 + 버너 인서터»를 한 벌 세우고 석탄을 부어둔다."""
        name = worker.name
        key = f"rig:{at['x']:.0f},{at['y']:.0f}"
        try:
            plan = self.bridge.fuel_rig(name, at["x"], at["y"])
        except RconError:
            return
        if plan.get("error"):
            worker.block(key, BACKOFF_SECONDS)
            return

        arm, shelf = plan["inserter"], plan["chest"]

        # 밥이 먼저다. 예전에는 상자와 인서터를 먼저 놓고 석탄은 나중에
        # 구했는데, 구하기가 실패해도 조용히 넘어갔다. 그래서 315분째에
        # 빈 찬장이 서른 개 서 있었고 인서터 29대가 «집을 게 없음»으로
        # 멈춰 있었다. 못 먹일 거면 짓지 않는 편이 낫다.
        if not self.obtain(worker, "coal", RIG_COAL):
            self.say("급유 장치에 넣을 석탄을 못 구해서 짓지 않았습니다.", who=name)
            worker.block(key, BACKOFF_SECONDS)
            return

        wanted = ["burner-inserter"] + ([] if shelf.get("standing") else [CHEST])
        for part in wanted:
            if not self.obtain(worker, part, 1):
                worker.block(key, BACKOFF_SECONDS)
                return

        try:
            if not shelf.get("standing"):
                worker.handle.place(CHEST, shelf["x"], shelf["y"], timeout=420)
            worker.handle.insert("coal", shelf["x"], shelf["y"],
                                 count=RIG_COAL, timeout=300)
            worker.handle.place("burner-inserter", arm["x"], arm["y"],
                                direction=arm["direction"], timeout=300)
        except TaskFailed as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"급유 장치를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return

        self.say(f"{plan.get('machine', '기계')}에 급유 장치를 세우고 석탄 "
                 f"{RIG_COAL}개를 채웠습니다. 이제 알아서 먹습니다.", who=name)

    def rig_job(self, worker: Worker, stopped: list[dict]) -> list[Job]:
        """연료가 없어 선 기계에 급유 장치를 세운다.

        손으로 195대를 먹이는 것은 불가능하다. 하지만 기계 한 대 옆에
        «석탄 상자 + 버너 인서터»를 한 번 세워두면 그 기계는 영구히 연료
        걱정이 없어진다 - 인서터가 나르는 것이 석탄이라 자기 연료를 그중에서
        떼어 쓰기 때문이다.

        인서터 한 대는 채굴기 스물한 대분 연료를 감당한다. 66대가 굶는 것은
        처리량 한계가 아니라 인서터가 안 박혀서다.
        """
        out: list[Job] = []
        for machine in stopped[:RIGS_PER_TRIP]:
            if machine.get("fix") != "fuel":
                continue
            key = f"rig:{machine['x']:.0f},{machine['y']:.0f}"
            if key in worker.blocked_now():
                continue
            out.append(Job(
                f"{machine['name']}에 급유 장치를 세우겠습니다. 한 번 세우면 "
                f"연료를 다시 넣어줄 일이 없습니다. "
                f"({machine['x']:.0f}, {machine['y']:.0f})",
                key=key, routine="rig", at=machine))
        return out

    def restock_jobs(self, worker: Worker,
                     coal_chests: list[dict]) -> list[Job]:
        """빈 급유 상자에 석탄을 붓는다.

        상자 하나에 50개를 부으면 그 기계는 한참을 혼자 돈다. 기계에 직접
        20개를 넣어주는 것보다 같은 걸음으로 훨씬 오래 간다 - 손이 닿는
        곳을 기계에서 상자로 옮긴 것이 이 장치의 전부다.
        """
        try:
            empty = self.bridge.hungry_rigs(worker.name)
        except RconError:
            return []
        if not empty:
            return []

        # 배차 경로는 needs 를 보지 않는다. 그러니 실을 곳을 여기서 직접
        # 첫 단계로 붙인다 - 빈손으로 보내면 insert 가 그냥 실패한다.
        # 급유 상자 자신은 비어 있으니 출처가 될 수 없고, 다른 급유 상자에서
        # 퍼오는 것도 곤란하다. 넉넉한 상자만 고른다.
        out: list[Job] = []
        for group in cluster(empty)[:2]:
            head = group[0]
            wanted = RIG_COAL * len(group)
            source = (nearest_to(coal_chests, head, wanted)
                      or nearest_to(coal_chests, head, RIG_COAL))
            if not source:
                continue

            # 실을 수 있는 만큼만 붓기로 한다. 예전에는 상자 여섯 개를
            # 채우겠다고 나서놓고 60개만 싣고 갔다 - 첫 상자에서 50을 쓰고
            # 나머지 다섯 번이 «no coal to insert» 로 끝났다. 아홉 번 그랬다.
            group, load = carry_split(group, min(int(source["count"]), wanted),
                                      RIG_COAL)

            steps: list[Step] = [
                ("take", {"name": "coal", "count": load,
                          "x": source["x"], "y": source["y"]})]
            steps += [("insert", {"name": "coal", "count": RIG_COAL,
                                  "x": spot["x"], "y": spot["y"]})
                      for spot in group]
            out.append(Job(
                f"급유 상자 {len(group)}개가 비었습니다. 석탄을 실어 붓겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
                key=f"restock:{head['x']:.0f},{head['y']:.0f}", steps=steps,
                at={"x": head["x"], "y": head["y"]}))
        return out

    def convert_chest(self, worker: Worker, entry: dict) -> None:
        """꽉 찬 상자를 걷어내고 그 자리에 화로를 세운다.

        비우기는 이 채굴기를 한 번 살리고 이십 분 뒤에 똑같이 막힌다. 화로는
        영원히 받아준다 - 채굴기가 캔 광석이 바로 화로로 들어가서, 나를 일
        자체가 없어진다. 401분째에 채굴기 112대가 꽉 찬 상자에 막혀 선 옆에서
        화로 54대가 굶고 있었다. 둘은 같은 문제의 두 얼굴이다.

        상자를 캐면 안에 든 것이 가방으로 따라온다. 그 광석을 그대로 새
        화로에 넣으면 버리는 것도 없다.
        """
        name = worker.name
        outlet = entry.get("outlet") or {}
        key = f"convert:{entry['x']:.0f},{entry['y']:.0f}"
        if not outlet:
            worker.block(key, BACKOFF_SECONDS)
            return
        if not self.obtain(worker, "stone-furnace", 1):
            worker.block(key, BACKOFF_SECONDS)
            return

        ore = entry.get("holding")
        try:
            worker.handle.demolish(outlet["x"], outlet["y"], timeout=420,
                                   timeout_ticks=60 * 60 * 3)
            spot = worker.handle.place("stone-furnace", outlet["x"], outlet["y"],
                                       timeout=300)
        except TaskFailed as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"상자를 화로로 못 바꿨습니다: {exc.task.get('error')}", who=name)
            return

        # 상자에서 딸려온 광석과 석탄을 새 화로에 넣어준다. 없으면 그냥 둔다 -
        # 채굴기가 곧 채워준다.
        for item, amount in (("coal", FURNACE_FUEL), (ore, SMELT_BATCH)):
            if not item:
                continue
            have = worker.handle.items().get(item, 0)
            if have <= 0:
                continue
            try:
                worker.handle.insert(item, spot["x"], spot["y"],
                                     count=min(have, amount), timeout=180)
            except TaskFailed:
                pass
        self.say(f"상자를 화로로 바꿨습니다. 이제 이 채굴기는 캐는 대로 "
                 f"바로 녹습니다. ({spot['x']:.0f}, {spot['y']:.0f})", who=name)

    def build_depot(self, worker: Worker, base: dict) -> None:
        """공용 창고를 세우고 그 자리를 무리에게 알린다."""
        name = worker.name
        try:
            if not self.obtain(worker, CHEST, 1):
                self.say("창고로 쓸 상자를 못 구했습니다.", who=name)
                worker.block("depot:build", 300)
                return
            spot = worker.handle.place(CHEST, base["x"] + 3, base["y"] + 3,
                                       snap=True, timeout=420)
            self.bridge.set_depot(spot["x"], spot["y"])
            self.say(f"공용 창고를 세웠습니다. ({spot['x']:.0f}, {spot['y']:.0f}) "
                     f"남는 물자는 여기에 모읍니다.", who=name)
        except TaskFailed as exc:
            worker.block("depot:build", 300)
            self.say(f"창고를 못 세웠습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("depot:build", 300)
            self.say(f"창고 구축 중 오류: {exc}", who=name)

    def rescue(self, worker: Worker, at: dict) -> None:
        """멈춰 선 채굴기에 출구 상자를 달아주고 연료를 채운다.

        어디가 출구인지는 채굴기에게 묻는다. 방향을 짐작해서 놓으면 상자는
        서 있는데 광석은 여전히 땅에 쌓인다.
        """
        name = worker.name
        if not at:
            return
        try:
            # 출구가 막혔으면 상자를 놓을 자리가 아예 없다. 건물은 돌릴 수
            # 있으니, 상자를 만들기 전에 비는 쪽으로 돌려본다.
            aimed = self.bridge.aim_drill(worker.name, at["x"], at["y"])
            if aimed.get("error"):
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}", 300)
                self.say(f"채굴기를 어느 쪽으로 돌려도 출구가 막혔습니다. "
                         f"({at['x']:.0f}, {at['y']:.0f})", who=name)
                return
            if aimed.get("turned"):
                self.say("출구가 막혀 채굴기를 돌렸습니다.", who=name)
            drill = {"x": aimed["x"], "y": aimed["y"],
                     "drop_x": aimed["drop_x"], "drop_y": aimed["drop_y"]}

            # 그 사이에 누가 상자를 달아줬을 수도 있다.
            already = [e for e in self.bridge.inspect(drill["drop_x"], drill["drop_y"], 0.8)
                       if (e.get("name") or "").endswith("-chest")]
            if already:
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}")
                return

            if not self.ensure(worker, CHEST):
                worker.block("rescue")
                return

            worker.handle.place(CHEST, drill["drop_x"], drill["drop_y"], timeout=180)
            self.say(f"({drill['x']:.0f},{drill['y']:.0f}) 채굴기에 상자를 달았습니다.",
                     who=name)

            if worker.handle.items().get("coal", 0) >= DRILL_FUEL:
                worker.handle.insert("coal", drill["x"], drill["y"],
                                     count=DRILL_FUEL, timeout=180)
        except TaskFailed as exc:
            worker.block("rescue")
            self.say(f"상자를 못 달았습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("rescue")
            self.say(f"채굴기 수리 중 오류: {exc}", who=name)

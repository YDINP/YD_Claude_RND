"""지금 무엇이 급한가를 훑고, 그것을 사람에게 나눠준다.

이 파일의 순서가 곧 무리의 우선순위다. 위에 있을수록 먼저 집어간다.
"""

from __future__ import annotations

import math

from client import RconError

from settings import (CHEST, DRILL, DRILL_FUEL, HARVEST_MIN, HAUL_BATCH, LOOSE_FLOOD, ORE_BATCH, STARVING, DEFEND_WHEN,
                      BAG_ROOM, HOME_REACH, SMELTED_BY_FURNACE, SMELT_BATCH,
                      STRAY_FAR,
                      SURPLUS, THIN_DRILL, WELL_FULL)
from world import Snapshot
from jobs import Job, Step
from layout import belt_pairs, carry_split, cluster, interleave, nearest_to
import mission
from ladder import STAGE_TARGET, _as_rows, plan
from worker import Worker


class SurveyMixin:
    """지금 무엇이 급한가를 훑고, 그것을 사람에게 나눠준다."""

    def survey(self, worker: Worker) -> list[Job]:
        """무리 전체가 나눠 가질 일감을 한 번에 만든다.

        예전에는 각자 자기 스냅샷을 보고 «가장 급한 일 하나»를 골랐다.
        열쇠는 한 명만 잡을 수 있으니, 급한 일이 셋이면 나머지 다섯은 서
        있었다. 실제로 여덟 중 넷이 그랬다.

        여기서는 한 번 훑어서 «할 수 있는 일 전부»를 목록으로 만든다.
        목록이 사람보다 길면 아무도 놀지 않는다.
        """
        refuel: list[Job] = []
        gather: list[Job] = []
        unblock: list[Job] = []
        jobs: list[Job] = []

        # -1. 적이 코앞이면 «무엇보다 먼저» 물러난다.
        #
        #     실측: 잃은 것 - 캐릭터 74, 채굴기 14, 화로 11, 상자 14.
        #           잡은 것 - 바이터 0마리.
        #
        #     일흔네 번 죽고 한 마리도 못 잡았다. 요원은 총이 없으니 싸운
        #     것이 아니라 서 있다가 물린 것이다. 그리고 죽으면 들고 있던
        #     것을 전부 흘린다 - 아무것도 안 쌓이던 진짜 이유다.
        #
        #     죽으면 다른 일감은 의미가 없다. 그러니 맨 앞이다.
        # 0. 기지에서 너무 멀리 나갔으면, 할 일을 찾기 전에 돌아온다.
        #
        #    에이전트 중심 조회는 전부 그 사람 반경 200 안만 본다. 그 밖에 서
        #    있으면 기지가 «안 보이고», 안 보이니 할 일이 없고, 할 일이 없으니
        #    돌아올 이유도 못 찾는다. 실측: 요원이 (322,13)에 서 있었고 기지는
        #    (90,27) 이었다 - 그동안 화로 63대와 눈먼 채굴기 22대가 그대로
        #    멈춰 있었다. 무리 전체가 자기 눈 밖의 기지를 못 본 것이다.
        #
        #    「여기가 기지다」를 말해주는 자리는 하나뿐이라(base), 반경에
        #    매이지 않는 그 눈으로 먼저 자기 위치를 확인한다.
        try:
            home = (self.bridge.base() or {}).get("home")
            # 제련 블록의 모서리는 게임 쪽이 기억한다. 한 번 받아두면 이
            # 사람이 계산하는 화로 자리가 다른 사람의 것과 어긋나지 않는다.
            if worker.smelter is None or worker.craft is None:
                spread = self.bridge.zones(worker.name) or {}
                worker.smelter = spread.get("smelt")
                worker.craft = spread.get("craft")
                worker.fields = _as_rows(spread.get("fields"))
                # 구역을 지도에 표시한다. 관전하는 사람이 「여기가 어디인지」
                # 보려면 코드만 아는 것으로는 부족하다.
                self.bridge.draw_zones(worker.name)
            # 다음 화로 자리는 매번 새로 묻는다. 걷어내고 세울 때마다
            # 달라지므로 한 번 받아둔 값은 곧 옛 답이 된다.
            try:
                # 밭은 채굴기를 세울 때마다 달라지므로 매번 다시 묻는다.
                worker.fields = _as_rows(
                    (self.bridge.zones(worker.name) or {}).get("fields"))
            except RconError:
                pass
            try:
                answer = self.bridge.next_seat(worker.name, "smelt")
                if answer.get("error"):
                    worker.next_furnace, worker.furnace_seats = None, []
                else:
                    worker.next_furnace = answer.get("seat")
                    worker.furnace_seats = _as_rows(answer.get("seats"))
            except RconError:
                worker.next_furnace, worker.furnace_seats = None, []
        except RconError:
            home = None
        if home:
            gap = math.dist(self.seat(worker), (home["x"], home["y"]))
            if gap > HOME_REACH:
                jobs.append(Job(
                    f"기지에서 {gap:.0f}타일이나 나와 있습니다. 여기서는 "
                    f"기지가 보이지 않아 할 일을 찾을 수 없습니다. "
                    f"돌아가겠습니다.",
                    key=f"home:{worker.name}", owner=worker.name,
                    steps=[("walk_to", {"x": home["x"], "y": home["y"],
                                        "tolerance": 8})],
                    at=home))
                return jobs

        # 0. 가방이 찼으면 그것부터. 찬 가방으로는 아무 일도 못 한다.
        #
        #    캐는 일도 걷어내는 일도 줍는 일도 전부 «조용히» 실패한다.
        #    실측: 여덟 캐릭터 중 여섯이 빈 칸 0 이었고 한 명은 demolish 를
        #    띄운 채 가만히 서 있었다. 이 줄이 없으면 그 여섯은 무슨 일감을
        #    받아도 그 자리에 선다.
        snap = self.snaps.get(worker.name)
        if snap and snap.free <= BAG_ROOM:
            # 아무 상자에나 붓는다. 공용 창고를 «짓는» 일은 여기서 하면 안 된다 -
            # 상자를 만들려면 가방에 칸이 있어야 하고, 지금 없는 것이 그 칸이다.
            # 실측(2026-09-18): 여덟 캐릭터 전부 빈 칸 0, 둘은 craft 에 걸린 채
            # 정지. 공용 창고는 아직 없었다. 창고를 지으라는 일감이 나왔지만
            # 그 일감도 가방을 필요로 했다 - 교착이다.
            #
            # 비우는 것 자체가 목적이지 어디에 붓느냐는 그다음이다.
            try:
                shelves = _as_rows(self.bridge.stores(worker.name,
                                                      200, 8).get("chests"))
            except RconError:
                shelves = []
            heavy = sorted(((n, c) for n, c in snap.items.items() if c >= 20),
                           key=lambda pair: -pair[1])
            if shelves and heavy:
                item, count = heavy[0]
                near = min(shelves, key=lambda c: c.get("distance", 0))
                return [Job(
                    f"가방이 꽉 차서 아무것도 못 하고 있습니다. {item} "
                    f"{count}개를 상자에 붓겠습니다.",
                    key=f"dump:{worker.name}", owner=worker.name,
                    steps=[("insert", {"name": item, "count": count,
                                       "x": near["x"], "y": near["y"]})],
                    at={"x": near["x"], "y": near["y"]})]
            # 상자가 하나도 없으면 그때는 지어야 한다.
            dump = self.depot_job(worker, snap)
            if dump:
                return [dump]

        # 0. 서 있는 발전소를 고치는 것이 새 발전소보다 언제나 싸다.
        #    전봇대 둘과 파이프 둘이 2.7MW 였던 적이 있다.
        jobs.extend(self.power_repair_jobs(worker))

        # 0. 모두가 같은 것을 부탁하고 있으면, 나르는 일이 아니라 만드는
        #    일이다. 이걸 먼저 걷어내지 않으면 게시판이 굳는다.
        jobs.extend(self.shortage_jobs())

        # 창고가 먼저다. 물자가 각자 가방에 갇혀 있는 한 나머지 일감은
        # 재료가 없어서 계속 막힌다.
        opening = self.depot_job(worker, self.snaps.get(worker.name)
                                 or worker.snapshot())
        if opening and opening.key == "depot:build":
            jobs.append(opening)

        try:
            stopped = self.bridge.broken(worker.name)
            stock = self.bridge.furnace_stock(worker.name)
            coal_chests = self.bridge.chest_stock(worker.name, "coal")
            # 창고에 무엇이 얼마나 있는지. 「그만 캐도 되는가」를 이걸로 정한다.
            shelved = (self.bridge.stores(worker.name).get("total") or {})
            # 사다리가 창고를 볼 수 있게 실어준다. 손에 없다고 없는 것이
            # 아니다 - 창고까지 걸어가는 것은 일이지 불가능이 아니다.
            worker.shelved = {k: int(v) for k, v in shelved.items()}
            # 굶주림은 «여기서» 정한다. 예전에는 기계를 돌보는 일감을
            # 만들 때 정했는데, 그것은 이 아래에서 벌어진다. 벨트를 앞에
            # 둘지 뒤에 둘지는 그 전에 알아야 한다 - 한 순찰 늦은 판단이
            # 그 순찰 동안 공장을 굶긴다.
            # `broken` 은 이미 목록을 돌려준다. 한 번 dict 로 착각해서
            # 무리가 통째로 죽었다 - 'list' object has no attribute 'get'.
            # 그 뒤로 여섯 순찰 동안 공장이 꺼진 채였는데, 나는 배차 순서를
            # 고치고 있었다. 죽은 것과 안 하는 것은 다르다.
            self.starving = sum(
                1 for e in _as_rows(stopped)
                if isinstance(e, dict) and e.get("fix") == "fuel") >= STARVING
            for one in self.workers.values():
                one.starving = self.starving
        except RconError:
            return jobs

        # 이미 선 장치를 살리는 것이 새 장치를 세우는 것보다 먼저다.
        # 빈 찬장을 서른 개 지어놓고 서른한 번째를 지으러 가면 안 된다.
        unblock.extend(self.restock_jobs(worker, coal_chests))

        # 1a. 석탄 자급쌍을 비운다.
        #
        #     마주보는 두 대는 캔 석탄을 서로의 연료칸에 넣는다. 출력 상자가
        #     없으니 갈 곳이 연료칸뿐이고, 그 한 칸(50개)이 차면 선다.
        #     필요할 때만 꺼내 쓰면 필요 없는 동안 계속 멈춰 있다 - 실측하니
        #     석탄 위 채굴기 48대가 전부 50/50 으로 서 있었다.
        #
        #     즉 이건 창고이면서 동시에 «주기적으로 비워줘야 도는» 장치다.
        #     비우는 것이 거두는 일이면서 되살리는 일이다.
        unblock.extend(self.drain_wells(worker, coal_chests))

        # 1b. 운반 - 캐는 구역에 쌓인 것을 제련 구역으로.
        #
        #     구역을 나누면 그 사이를 잇는 일이 생긴다. 언젠가는 벨트가
        #     이 일을 하고, 그때까지는 사람이 나른다. 어느 쪽이든 캐는 곳과
        #     녹이는 곳이 나뉘어 있어야 벨트를 깔 자리가 생긴다.
        gather.extend(self.haul_ore(worker))

        # 1c. 광석 길. 사람이 나르는 동안에도 벨트는 깔아둔다 - 다 깔리면
        #     사람 쪽 일감이 저절로 사라진다(상자가 안 쌓이므로).
        # 1d. 심시티 - 제자리가 아닌 건물을 제 구역으로 옮긴다.
        #
        #     구역을 나누는 일의 절반은 이미 있는 것을 옮기는 일이다. 새로
        #     짓는 것만 구역으로 보내면 흩어진 것은 영원히 흩어진 채 남는다.
        move = self.resettle_job(worker)
        if move:
            gather.append(move)

        #     캐지도 않으면서 공해만 내는 채굴기를 걷는다. 방어의 첫걸음은
        #     총이 아니라 둥지를 깨우는 것을 끄는 일이다.
        smoke = self.smoking_job(worker)
        if smoke:
            unblock.append(smoke)

        #     버려진 벨트를 먼저 걷어온다 - 새로 만드는 것보다 언제나 싸다.
        #
        #     그리고 널린 것이 많으면 «길 깔기보다도» 먼저다. 실측(48분째):
        #
        #         세상의 벨트    526칸
        #         그중 길 밖     400칸 이상
        #         길에 모자란 칸 409칸
        #
        #     이미 깔린 것을 걷기만 하면 길이 거의 다 이어진다. 그런데
        #     무리는 옆에서 새 벨트를 만들고 있었다. 철판 사백 장이 미로로
        #     누워 있는데 또 사백 장을 녹이는 꼴이다.
        #
        #     다만 «공장이 굶고 있으면» 벨트는 전부 뒤로 간다.
        #
        #     실측(135분째)이 그 값을 보여줬다:
        #
        #         채굴기 28대   연료없음 17, 출구막힘 10   도는 것 0
        #         화로 27대     재료없음 20, 출력꽉참 7    도는 것 0
        #         상자 속 석탄  324개
        #         무리 넷       벨트를 40~115칸씩 들고 벨트만 깔고 있었다
        #
        #     석탄은 있었다. 나를 사람이 없었을 뿐이다. 벨트 일감을 앞으로
        #     당긴 것이 이 저장소에 이미 적혀 있던 원칙을 덮어버렸다:
        #     «이미 선 장치를 살리는 것이 새 장치를 세우는 것보다 먼저다».
        #
        #     길은 내일 깔아도 되지만 꺼진 화로는 오늘 식는다.
        stray_belt = self.loose_belt_job(worker)
        flooded = False
        if stray_belt:
            flooded = (not self.starving
                       and self.belt_flood(worker) >= LOOSE_FLOOD)
            if flooded:
                jobs.insert(0, stray_belt)
            elif self.starving:
                jobs.append(stray_belt)
            else:
                unblock.append(stray_belt)
        # 광석 길은 «일감 하나»가 아니라 «백 대를 한 번에 푸는 일»이다.
        #     채굴기 161대 중 100대가 내놓을 데가 없어 서 있고
        #     화로 100대 중 94대가 재료가 없어 서 있다
        # 그 둘 사이가 끊긴 것이 전부이므로, 이 일은 나르는 일보다 앞이다.
        line = self.line_job(worker)
        if line:
            # 굶고 있으면 맨 뒤. 걷을 것이 널려 있으면 걷기 다음.
            # 아니면 맨 앞 - 길이 이어지는 것이 백 대를 한 번에 푸는 일이다.
            if self.starving or flooded:
                jobs.append(line)
            else:
                jobs.insert(0, line)

        # 1. 연료가 떨어진 기계. 세 가지를 이 순서로 한다.
        #
        #    ① 빈 급유 상자를 채운다  - 이미 선 장치를 살리는 게 가장 싸다
        #    ② 새 급유 장치를 세운다  - 한 번 세우면 영원히 산다
        #    ③ 손으로 석탄을 넣는다   - 그 기계를 한 번 살릴 뿐
        #
        #    195대를 손으로 먹이는 것은 불가능하고, 장치를 세우는 것은
        #    가능하다. 그런데 빈 찬장을 서른 개 지어놓고 서른한 번째를
        #    지으러 가면 그것도 소용없다 - 그래서 ①이 ②보다 앞이다.
        unblock.extend(self.rig_job(worker, [e for e in stopped
                                             if e.get("fix") == "fuel"]))

        # 한 구역에 모인 기계는 한 번 걸어가서 한꺼번에 채운다. 채굴기
        # 여섯 대가 한 광맥에 모여 있는데 여섯 번 따로 가는 것이 가장 흔한
        # 낭비다. 석탄도 그만큼 한 번에 실어간다.
        for group in cluster([e for e in stopped if e.get("fix") == "fuel"]):
            head = group[0]
            at = {"x": head["x"], "y": head["y"]}
            key = f"tend:{head['x']:.0f},{head['y']:.0f}"
            source = nearest_to(coal_chests, at, DRILL_FUEL)

            # 세상에 석탄이 없으면 「넣겠습니다」는 헛걸음이다. 배차 경로는
            # needs 를 보지 않으므로 빈손으로 출발하고, 도착해서 「no coal
            # to insert」로 끝난다. 새 판 10분째에 그 헛걸음이 열다섯 번
            # 나왔고, 그동안 사다리 작업(캐서 만들기)이 밀려났다.
            #
            # 넣을 것이 없으면 정비를 접고 캐러 가게 둔다. 정비는 가진 것이
            # 있을 때 하는 일이다.
            if not source and (self.snaps.get(worker.name)
                               or worker.snapshot()).have("coal") < DRILL_FUEL:
                continue

            steps: list[Step] = []
            if source:
                # 실을 수 있는 만큼으로 약속을 줄인다. 급유 상자에서 고친
                # 것과 같은 실수가 여기 남아 있었다 - 여섯 대에 넣겠다고
                # 나서놓고 40개만 싣고 가서, 두 대 넣고 「no coal to insert」
                # 로 끝났다. 여덟 번 그랬다.
                group, load = carry_split(
                    group, min(HAUL_BATCH, int(source["count"])), DRILL_FUEL)
                steps.append(("take", {"name": "coal", "count": load,
                                       "x": source["x"], "y": source["y"]}))
            wanted = DRILL_FUEL * len(group)
            for machine in group:
                steps.append(("insert", {"name": "coal", "count": DRILL_FUEL,
                                         "x": machine["x"], "y": machine["y"]}))
            where = (f"({head['x']:.0f}, {head['y']:.0f})" if len(group) == 1
                     else f"({head['x']:.0f}, {head['y']:.0f}) 일대 {len(group)}대")
            refuel.append(Job(f"{where}에 석탄을 넣겠습니다.",
                              key=key, steps=steps,
                              needs={} if source else {"coal": wanted},
                              at=at))

        # 2. 다 녹아서 화로를 막고 있는 것들. 화로마다 따로 걷는다.
        # 막힌 화로는 양과 상관없이 거둔다. 구리판 한 개가 철광석 쉰네
        # 개를 막고 있었는데, 「10개 이상」이라는 기준 때문에 그 한 개가
        # 영영 안 거둬졌다. 양이 적을수록 오래 막는 셈이다.
        worth = [e for e in stock
                 if e.get("jammed") or int(e.get("count") or 0) >= HARVEST_MIN]
        for group in cluster(worth):
            head = group[0]
            total = sum(int(e.get("count") or 0) for e in group)
            gather.append(Job(
                f"화로 {len(group)}대에서 {total}개를 거둬오겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
                key=f"harvest:{head['x']:.0f},{head['y']:.0f}",
                steps=[("take", {"name": e["name"], "count": e["count"],
                                 "x": e["x"], "y": e["y"]}) for e in group],
                at={"x": head["x"], "y": head["y"]}))

        # 3. 내놓을 데가 없어 선 채굴기. 지금 가장 큰 무더기(123대)인데,
        #    세어보니 한 가지 문제가 아니었다:
        #
        #      83대  받을 곳이 아예 없다 (땅에 떨구다 막힘)
        #      22대  상자가 돌로 꽉 참    — 창고에 이미 48,099개
        #       6대  상자가 석탄으로 꽉 참 — 창고에 이미 19,590개
        #      10대  석탄 드릴끼리 서로 먹임 (정상)
        #       2대  상자가 철광석으로 꽉 참
        #
        #    「상자가 있고 녹일 수 있는 광석」만 보던 앞의 판단은 2대에만
        #    해당했다. 셋을 갈라서 각각 맞는 손을 쓴다.
        surplus = {k for k, v in (shelved or {}).items() if int(v) >= SURPLUS}
        for entry in [e for e in stopped if e.get("fix") == "chest"][:4]:
            holding, outlet = entry.get("holding"), entry.get("outlet")
            at = {"x": entry["x"], "y": entry["y"]}

            # 이미 넘치게 쌓인 것을 계속 캐고 있다. 캐는 것도 일이고 막힌
            # 채로 서 있는 것도 자리다 — 걷어내서 두꺼운 광맥에 다시 쓴다.
            if holding in surplus:
                unblock.append(Job(
                    f"{holding}은(는) 창고에 {int(shelved[holding]):,}개나 "
                    f"있습니다. 이 채굴기는 걷어내겠습니다. "
                    f"({entry['x']:.0f}, {entry['y']:.0f})",
                    key=f"enough:{entry['x']:.0f},{entry['y']:.0f}",
                    steps=[("demolish", {"x": entry["x"], "y": entry["y"],
                                         "name": entry.get("name")})],
                    at=at))
                continue

            # 녹일 수 있는 광석이 찬 상자는 화로로 바꾼다. 비우면 이십 분
            # 뒤에 똑같이 막히지만, 화로는 영원히 받아준다.
            if outlet and holding in SMELTED_BY_FURNACE:
                unblock.append(Job(
                    f"{entry.get('name', '채굴기')}의 상자가 {holding}으로 "
                    f"꽉 찼습니다. 화로로 바꾸면 다시 막히지 않습니다. "
                    f"({entry['x']:.0f}, {entry['y']:.0f})",
                    key=f"convert:{entry['x']:.0f},{entry['y']:.0f}",
                    routine="convert", at=entry))
                continue

            # 받을 곳이 아예 없는 것은 바로 아래 3a1 이 화로로 연다.
            # 상자를 다는 것은 스무 분 뒤에 같은 자리에서 다시 막히고,
            # 그 상자 안의 광석은 누가 날라주기 전까지 사다리에 못 오른다.

        # 3a0. 기지에서 도망간 화로를 걷어온다.
        #
        #      화로가 한 줄로 동쪽으로 도망가던 시절의 잔해다. 실측 63대 중
        #      43대가 60타일 밖, 가장 먼 것이 242타일이었다. 그 자리에는 광석이
        #      닿지 않으니 영원히 놀고, 대신 사람을 그쪽으로 끌고 간다.
        #
        #      걷어내면 화로가 통째로 손에 돌아온다. 그 손으로 바로 다음 항목
        #      (눈먼 채굴기)에 세우면 두 문제가 한 번에 풀린다.
        try:
            away = _as_rows(self.bridge.strays("stone-furnace",
                                               STRAY_FAR).get("strays"))
        except RconError:
            away = []
        for group in cluster(away)[:1]:
            head = group[0]
            unblock.append(Job(
                f"화로 {len(group)}대가 기지에서 {head['distance']:.0f}타일 밖에 "
                f"홀로 서 있습니다. 광석이 닿지 않는 자리라 영원히 놉니다. "
                f"걷어와서 멈춘 채굴기 앞에 다시 세우겠습니다.",
                key=f"stray:{head['x']:.0f},{head['y']:.0f}",
                steps=[("demolish", {"x": e["x"], "y": e["y"],
                                     "name": e["name"]}) for e in group],
                at={"x": head["x"], "y": head["y"]}))

        # 3a1. 출구가 «아예» 없는 채굴기 - 떨구는 자리에 화로를 놓는다.
        #
        #      실측(2026-09-18): 채굴기 81대 중 57대가 drop_target = nil 이었고,
        #      그 옆에서 화로 63대 중 60대가 광석이 없어 놀고 있었다. 캐는 쪽과
        #      녹이는 쪽이 둘 다 멈춰 있었고 둘을 잇는 것이 하나도 없었다.
        #      벨트는 0개였다.
        #
        #      상자가 아니라 화로인 이유: 상자는 차면 다시 막히고 안에 든 것은
        #      누가 날라야 사다리에 오른다. 화로는 광석을 판금으로 바꿔 놓으니
        #      한 번 놓으면 그 채굴기가 사다리에 직접 연결된다. 인서터도 벨트도
        #      전기도 필요 없다 - 채굴기가 화로 안으로 직접 넣는다.
        try:
            blind = self.bridge.blind_drills(worker.name)
        except RconError:
            blind = []
        #      한 대에 한 번씩 걸어가면 일흔한 대에 일흔한 번을 걷는다.
        #      광맥 위의 채굴기는 서로 붙어 있으니 모아서 한 번에 간다.
        for group in cluster(blind)[:2]:
            head = group[0]
            unblock.append(Job(
                f"({head['x']:.0f}, {head['y']:.0f}) 부근 채굴기 {len(group)}대가 "
                f"캔 것을 둘 데가 없어 멈춰 있습니다. 떨구는 자리마다 화로를 "
                f"놓겠습니다.",
                key=f"open:{head['x']:.0f},{head['y']:.0f}",
                routine="open", at={**head, "group": group},
                needs={"stone-furnace": len(group)}))

        # 3a2. 얇은 자리에 선 채굴기. 마르기를 기다릴 이유가 없다 —
        #      걷어내면 채굴기가 통째로 돌아오고, 다음 automate 가 두꺼운
        #      자리에 다시 세운다. 한 번의 걸음으로 다섯 배가 된다.
        try:
            thin = self.bridge.poor_drills(worker.name, THIN_DRILL)
        except RconError:
            thin = []
        for spot in cluster(thin)[:1]:
            head = spot[0]
            unblock.append(Job(
                f"채굴기 {len(spot)}대가 얇은 자리에 서 있습니다 "
                f"(남은 광석 {int(head.get('left', 0))}개, "
                f"{int(head.get('seconds', 0)) // 60}분). 걷어내서 두꺼운 "
                f"자리에 다시 세우겠습니다.",
                key=f"thin:{head['x']:.0f},{head['y']:.0f}",
                steps=[("demolish", {"x": e["x"], "y": e["y"],
                                     "name": DRILL}) for e in spot],
                at={"x": head["x"], "y": head["y"]}))

        # 3b. 밑의 광석이 다 떨어진 채굴기. 「고장」이 아니라 「끝난 것」이라
        #     손볼 방법이 없다. 걷어내면 채굴기가 통째로 재고로 돌아와,
        #     다음 automate 가 두꺼운 자리에 다시 세운다. 5회차에 매장량으로
        #     자리를 고르게 만든 것이 여기서 쓸모가 있다.
        for spot in cluster([e for e in stopped if e.get("fix") == "spent"])[:2]:
            head = spot[0]
            unblock.append(Job(
                f"광맥이 말라 선 채굴기 {len(spot)}대를 걷어내겠습니다. "
                f"두꺼운 자리에 다시 세우겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
                key=f"spent:{head['x']:.0f},{head['y']:.0f}",
                steps=[("demolish", {"x": e["x"], "y": e["y"],
                                     "name": e.get("name")}) for e in spot],
                at={"x": head["x"], "y": head["y"]}))

        # 3a. 과학팩을 기다리는 랩. 이게 사다리 전체의 목이다 — 연구가
        #     돌면 automation 이 열리고, 조립기와 롱암 인서터가 열린다.
        #
        #     539분째에 랩이 「과학팩 없음」으로 서 있는 동안 에이전트 둘이
        #     빨간 과학팩을 열 개씩 주머니에 넣고 다니고 있었다. 만들어
        #     놓고 넣지를 않아서 아홉 시간 동안 연구가 멈춰 있었다.
        here = self.snaps.get(worker.name) or worker.snapshot()
        snap_all = here.buildings
        for lab in [e for e in stopped if e.get("fix") == "science"][:2]:
            at = {"x": lab["x"], "y": lab["y"]}
            pack = STAGE_TARGET["red-science"][0]
            # 가진 사람이 넣는다. 가장 가까운 사람을 보내면 빈손으로 간다.
            # 이번 틱에 찍은 스냅샷을 본다. self.stock 은 사람이 지시를
            # 내릴 때만 채워지므로, 자동으로 도는 동안에는 비어 있거나
            # 오래된 값이다.
            holder, carried = None, 0
            for mate, snap in self.snaps.items():
                have = int(snap.items.get(pack, 0))
                if have > carried:
                    holder, carried = mate, have

            # 조립기가 먼저다. 손으로 만든 팩이 떨어지는 순간 연구가 다시
            # 멈추고, 실제로 그렇게 멈췄다 - 스무 개로 세 칸 오르고 끝났다.
            #
            # 그리고 이건 팩이 하나도 없을 때 «특히» 해야 하는 일이다.
            # 앞서 여기서 팩을 못 찾으면 continue 로 빠져나갔는데, 그
            # continue 가 조립기 짓는 일감까지 같이 버렸다. 없을 때
            # 포기하면 영원히 없다.
            if not snap_all.get("assembling-machine-1"):
                jobs.append(Job(
                    f"랩 옆에 조립기를 세워 과학팩을 스스로 만들게 하겠습니다. "
                    f"({lab['x']:.0f}, {lab['y']:.0f})",
                    key=f"science-rig:{lab['x']:.0f},{lab['y']:.0f}",
                    routine="science", at=at))

            steps: list[Step] = []
            if not holder:
                try:
                    shelves = self.bridge.chest_stock(worker.name, pack)
                except RconError:
                    shelves = []
                source = nearest_to(shelves, at, 1)
                if not source:
                    continue
                carried = min(20, int(source["count"]))
                steps.append(("take", {"name": pack, "count": carried,
                                       "x": source["x"], "y": source["y"]}))

            steps.append(("insert", {"name": pack, "count": carried, **at}))
            jobs.append(Job(
                f"랩이 과학팩을 기다리고 있습니다. {pack} {carried}개를 "
                f"넣겠습니다. ({lab['x']:.0f}, {lab['y']:.0f})",
                key=f"science:{lab['x']:.0f},{lab['y']:.0f}",
                steps=steps, needs={pack: 1}, at=at, owner=holder))

        # 3b2. 재료를 기다리는 조립기. 이게 서면 랩도 곧 선다 — 조립기
        #      한 대가 랩 한 대를 정확히 채우는 사슬이라, 어느 한 칸이
        #      비면 그 뒤가 통째로 멈춘다.
        #
        #      무엇이 몇 개 모자란지는 게임이 레시피와 입력 칸을 견줘
        #      답해준다. 짐작할 이유가 없다.
        for shop in [e for e in stopped if e.get("fix") == "supply"][:2]:
            at = {"x": shop["x"], "y": shop["y"]}
            steps: list[Step] = []
            listed: list[str] = []
            for want in _as_rows(shop.get("wants"))[:3]:
                item, need = want.get("name"), int(want.get("count") or 0)
                if not item or need <= 0:
                    continue
                try:
                    shelves = self.bridge.chest_stock(worker.name, item)
                except RconError:
                    shelves = []
                source = nearest_to(shelves, at, min(need, 20))
                if source:
                    load = min(need, int(source["count"]))
                    steps.append(("take", {"name": item, "count": load,
                                           "x": source["x"], "y": source["y"]}))
                else:
                    # 창고에 없으면 만들어서 간다. 철기어는 아무도 상자에
                    # 넣어두지 않지만 철판으로 언제든 만들 수 있다.
                    steps.append(("craft", {"recipe": item, "count": need}))
                    load = need
                steps.append(("insert", {"name": item, "count": load, **at}))
                listed.append(f"{item} {load}개")

            if steps:
                jobs.append(Job(
                    f"조립기가 재료를 기다립니다. {', '.join(listed)}를 "
                    f"대겠습니다. ({shop['x']:.0f}, {shop['y']:.0f})",
                    key=f"supply:{shop['x']:.0f},{shop['y']:.0f}",
                    steps=steps, at=at))

        # 3b3. 벨트. 막힌 채굴기와 굶는 화로가 벨트로 이을 만큼 가까우면
        #      한 줄이 둘을 동시에 없앤다. 손으로 나르는 일감도 사라진다.
        #      채굴기는 벨트에 직접 떨구므로 인서터는 화로 쪽 하나면 된다.
        pairs = belt_pairs(
            [e for e in stopped if e.get("fix") == "chest" and e.get("outlet")],
            [e for e in stopped if e.get("fix") == "feed"])
        for drill, oven in pairs[:1]:
            outlet = drill["outlet"]
            unblock.append(Job(
                f"채굴기({drill['x']:.0f}, {drill['y']:.0f})가 막혀 있고 "
                f"화로({oven['x']:.0f}, {oven['y']:.0f})가 굶고 있습니다. "
                f"벨트로 잇겠습니다.",
                key=f"belt:{drill['x']:.0f},{drill['y']:.0f}",
                routine="belt",
                at={"x": drill["x"], "y": drill["y"],
                    "drill": {**drill, "drop_x": outlet["x"],
                              "drop_y": outlet["y"]},
                    "furnace": {"x": oven["x"], "y": oven["y"]}}))

        # 3c. 굶고 있는 화로. 다섯 회차째 54대가 그대로였고, 그 사이
        #     철광석은 창고에 10,264개까지 쌓였다. 캐는 능력이 모자란 적은
        #     없고, 캔 것이 화로까지 가지 않을 뿐이다.
        #
        #     한 구역의 화로를 한 번에 먹인다. 상자는 화로 옆에서 고른다 -
        #     내가 선 자리가 아니라.
        for group in cluster([e for e in stopped if e.get("fix") == "feed"])[:2]:
            head = group[0]
            at = {"x": head["x"], "y": head["y"]}
            key = f"feed:{head['x']:.0f},{head['y']:.0f}"
            for ore in SMELTED_BY_FURNACE:
                try:
                    shelves = self.bridge.chest_stock(worker.name, ore)
                except RconError:
                    break
                source = nearest_to(shelves, at, SMELT_BATCH)
                if not source:
                    continue
                fed, load = carry_split(
                    group, min(HAUL_BATCH, int(source["count"])), SMELT_BATCH)
                gather.append(Job(
                    f"화로 {len(fed)}대가 굶고 있습니다. {ore}을(를) "
                    f"{load}개 실어다 넣겠습니다. "
                    f"({head['x']:.0f}, {head['y']:.0f})",
                    key=key,
                    steps=[("take", {"name": ore, "count": load,
                                     "x": source["x"], "y": source["y"]})]
                          + [("insert", {"name": ore, "count": SMELT_BATCH,
                                         "x": e["x"], "y": e["y"]}) for e in fed],
                    at=at))
                break

        # 4. 미리 세우는 터렛. 급하지 않지만 미뤄두면 영영 안 하고,
        #    습격이 온 다음에 시작하면 늦는다.
        guard = self.defence_job(worker, self.snaps.get(worker.name)
                                 or worker.snapshot())
        if guard:
            # 공해가 둥지에 가까워지면 «급한» 일이 된다.
            #
            # 사용자: "슬슬 기지방어도 해야겟는걸". 실측이 그 말을 받친다:
            #
            #     터렛 0대, 탄약 8발, 공해 여유 43타일
            #     적 15마리, 둥지 2곳, 웜 3
            #
            # 지난 판이 딱 이 상태에서 당했다. 화로 11대, 채굴기 14대,
            # 그리고 캐릭터 74번. 그때 방어는 「급하지 않은 일」 칸에 있었다.
            #
            # 공해가 둥지에 닿기 전까지는 그 말이 맞다. 닿은 뒤에 세우는
            # 터렛은 이미 늦다 - 세우는 동안 습격이 온다.
            #     여유를 «모를» 때도 급한 것으로 친다. 둥지가 조회에 안
            #     잡히면 nil 이 나오는데, 그것은 「안전하다」가 아니라
            #     「모른다」다. 실측으로 그 값이 None 이 된 순간 방어가
            #     뒤로 밀렸다 - 가장 모를 때 가장 태평해진 셈이다.
            #     빚이 있으면 언제나 맨 앞이다. 빚은 이미 공해와 둥지
            #     거리를 본 값이라, 그 위에 다시 조건을 얹을 이유가 없다.
            snap = self.snaps.get(worker.name) or worker.snapshot()
            room = snap.slack
            near = (snap.debt > 0
                    or not isinstance(room, (int, float))
                    or room <= DEFEND_WHEN)
            if near:
                jobs.insert(0, guard)
            else:
                unblock.append(guard)

        # 5. 길을 막고 선 우리 건물. 여덟 칸마다 비워두기로 한 줄 위에
        #    이미 놓여버린 것들이다. 놓을 줄만 알고 치울 줄을 모르면 실수는
        #    영원히 남는다 - 자재는 캐면 가방으로 돌아온다.
        try:
            for spot in cluster(self.bridge.blocking(worker.name))[:2]:
                head = spot[0]
                unblock.append(Job(
                    f"길을 막은 {head['name']} {len(spot)}개를 걷어냅니다. "
                    f"({head['x']:.0f}, {head['y']:.0f})",
                    key=f"clear:{head['x']:.0f},{head['y']:.0f}",
                    steps=[("demolish", {"x": e["x"], "y": e["y"], "name": e["name"]})
                           for e in spot],
                    at={"x": head["x"], "y": head["y"]}))
        except RconError:
            pass

        # 6. 출구가 막혀 선 채굴기.
        for entry in stopped:
            if entry.get("fix") != "chest":
                continue
            at = {"x": entry["x"], "y": entry["y"]}
            unblock.append(Job(
                f"채굴기 출구가 막혔습니다. ({entry['x']:.0f}, {entry['y']:.0f})",
                key=f"tend:{entry['x']:.0f},{entry['y']:.0f}",
                routine="rescue", at=at))

        # 한 종류가 목록을 다 차지하면 나머지는 차례가 오지 않는다. 연료
        # 보급만 스물다섯 개 쌓여서 창고 입고와 거두기가 한 번도 배차되지
        # 않았다. 창고 짓기만 맨 앞에 두고, 나머지는 번갈아 나눠준다.
        return jobs + interleave([refuel, gather, unblock])

    def dispatch(self, free: list[tuple[Worker, Snapshot]]) -> set[str]:
        """만든 일감을 가까운 사람에게 나눠준다. 배차된 사람 이름을 돌려준다.

        가까운 순으로 주는 이유는 단순하다 - 지도 반대편 사람이 바로 옆
        사람을 지나쳐 같은 기계까지 걸어가는 것이 가장 흔한 낭비다.
        """
        if not free:
            return set()

        # 도망은 «사람마다» 본다.
        #
        # 여기 있던 판정이 survey 안에 있었는데, survey 는 첫 번째 사람
        # 하나만 받아 돈다. 그래서 나머지 넷은 적이 코앞이어도 아무도
        # 안 봤다. 게다가 그렇게 나온 도망 일감은 «가장 가까운 사람»에게
        # 갔다 - 쫓기는 사람이 아니라.
        #
        # 실측: 무리 다섯이 전멸했다. 로그의 마지막 줄이 "적 27마리가
        # 0타일 앞에 있습니다" 였다. 0타일이면 이미 붙은 뒤다.
        #
        # 위험은 공용 일감이 아니다. 제 몸의 일이라 제가 봐야 한다.
        handed: set[str] = set()
        for worker, snap in free:
            run = self.flee_job(worker, snap)
            if not run:
                continue
            try:
                worker.watching = worker.handle.submit_plan(run.steps)
            except RconError:
                continue
            self.release(worker)
            self.claim(worker, run.key)
            self.say(run.narration, who=worker.name)
            worker.said_idle = False
            handed.add(worker.name)
        free = [(w, snap) for w, snap in free if w.name not in handed]
        if not free:
            return handed

        pool = self.survey(free[0][0])

        # 사다리도 «반장이» 나눠준다.
        #
        # 사용자 지시: "그냥 개인 에이전트들 위임 빼고 반장이 전체를
        # 관리하는걸로", "주기적으로 게임흐름을 보고 판단해서 각 캐릭터들한테
        # 작업을 시키도록".
        #
        # 예전에는 반장이 나눠주고 «남은 사람은 각자» 사다리를 봤다. 그래서
        # 두 가지가 어긋났다:
        #
        #   * 반장이 아직 안 본 사이에 각자가 제 판단으로 움직였다. 공장이
        #     꺼져 있는데 다섯이 제련만 반복한 것이 그 모양이다.
        #   * 같은 일을 두 사람이 다른 이유로 집었다. 열쇠가 겹치지 않으면
        #     겹친 줄도 몰랐다.
        #
        # 이제 사다리 일감도 한 곳에 모아 놓고 반장이 고른다. 사람마다
        # 맡은 광맥이 다르므로 각자의 눈으로 한 번씩 훑되, 답은 한 자리에
        # 모은다.
        seen = {j.key for j in pool}
        for worker, snap in free:
            for job in plan(snap, worker.focus, crew=len(self.workers)):
                if job.key in seen:
                    continue
                seen.add(job.key)
                pool.append(job)
            # 사다리가 「비축」밖에 안 내놓으면 할 일이 없다는 뜻이다.
            # 그때 다음 단이 무엇을 요구하는지 물어본다.
            chained = self.chain_toward(worker, snap)
            if chained and chained.key not in seen:
                seen.add(chained.key)
                pool.append(chained)
            # 「손으로 캐느니 채굴기를 하나 더」도 반장이 쥔다.
            #
            # 중앙 배차로 옮기면서 이것을 빠뜨렸다. 그 값이 컸다 - 사십육
            # 분 동안 채굴기 0대, 화로 0대인 채로 손으로만 캤다. 구리만
            # 1,894개다. 채굴기는 사람보다 느리지만 자지도 걷지도 않는다.
            #
            # 규칙을 옮길 때 빠뜨리면 그 규칙은 없어진 것이다. 이번 옮김에서
            # 두 번째다 - 앞의 것은 「재료가 모자라면 먼저 캔다」였다.
            busy = self.keep_busy(worker, snap)
            if busy and busy.key not in seen:
                seen.add(busy.key)
                pool.append(busy)

        taken = self.taken()
        made = len(pool)
        pool = [j for j in pool if j.key not in taken]
        self.last_pool = (made, len(pool), len(free))
        skipped: dict[str, int] = {}
        if not pool:
            return handed

        seats = {w.name: (snap.x, snap.y) for w, snap in free}
        for job in pool:
            if len(handed) >= len(free):
                break
            spot = job.at or {}
            # 가방을 부리는 일은 그 가방의 주인만 할 수 있다. 나머지는
            # 가까운 사람에게.
            owner = job.owner or (job.key.split(":", 1)[1]
                                  if job.key.startswith("depot:") else None)
            if owner:
                order = [owner] if owner in seats and owner not in handed else []
            else:
                order = sorted(
                    (n for n in seats if n not in handed),
                    key=lambda n: ((seats[n][0] - spot.get("x", seats[n][0])) ** 2
                                   + (seats[n][1] - spot.get("y", seats[n][1])) ** 2, n))
            if not order:
                skipped["주인이 바쁨"] = skipped.get("주인이 바쁨", 0) + 1
                # 이 일감의 주인이 지금 손이 비어 있지 않을 뿐이다. 목록
                # 전체를 여기서 끊으면 뒤에 있는 일감이 통째로 사라진다 -
                # 창고 입고가 목록 중간에 있어서 그 뒤가 전부 날아갔다.
                continue
            # 가장 가까운 사람이 이 일을 막아뒀으면 다음 사람에게 준다.
            # 예전에는 order[0] 하나만 보고, 그 사람이 막아뒀으면 일감
            # 자체를 버렸다. 호수 건너에 갇힌 한 사람 때문에 급유 상자
            # 채우기가 통째로 사라지고 있었다 - 다른 셋은 갈 수 있는데도.
            name = next((n for n in order
                         if job.key not in self.workers[n].blocked_now()), None)
            if name is None:
                skipped["모두 막아둠"] = skipped.get("모두 막아둠", 0) + 1
                continue
            worker = self.workers[name]

            # 재료가 모자란 일은 시작하기 전에 «먼저 구한다».
            #
            # 개인 판단 경로에 있던 규칙인데, 그 경로를 걷어내면서 여기로
            # 옮겨왔다. 규칙을 옮길 때 빠뜨리면 그 규칙은 없어진 것이다 -
            # 이 저장소가 여러 번 한 실수라 이번에는 옮겨 적는다.
            #
            # 스스로 만들 수 있는 것은 부탁하지 않는다. 상자가 없다고
            # 부탁을 걸고 일을 접으면, 만들 줄 알면서도 영영 안 만든다.
            snap = self.snaps.get(name)
            if snap is not None and job.needs:
                short = mission.shortfall(job.needs, snap.items)
                if short and snap.can_make(short[0], short[1]):
                    short = None
                if short:
                    spot = snap.ore(short[0])
                    if not spot:
                        skipped["재료 없음"] = skipped.get("재료 없음", 0) + 1
                        self.ask_for(worker, short[0], short[1], job.narration)
                        worker.block(job.key)
                        continue
                    # 모자란 것이 땅에 있으면 그것부터 캔다.
                    #
                    # 예전에는 「캘 수 있으니 괜찮다」며 그냥 일을 시작했고,
                    # 도착해서 빈손으로 실패했다. 가방에 구리광석이 949개인데
                    # 석탄이 0개인 채로 화로에 가던 시절이다.
                    try:
                        worker.watching = worker.handle.submit_plan([
                            ("mine", {**spot, "count": max(short[1], ORE_BATCH),
                                      "search_radius": 10})])
                    except RconError:
                        continue
                    self.claim(worker, job.key)
                    self.say(f"{job.narration.rstrip('.')} — 그 전에 "
                             f"{short[0]}이(가) {short[1]}개 모자라 캐 오겠습니다.",
                             who=name)
                    worker.said_idle = False
                    handed.add(name)
                    continue

            # 먼저 «시작할 수 있는가»를 확인하고, 그 다음에 말한다.
            # 예전에는 start_routine 의 반환값을 버렸다. 앞의 작업이 아직
            # 슬롯을 쥐고 있으면 그 함수는 아무것도 안 하고 False 를
            # 돌려주는데, 배차는 그걸 성공으로 치고 「급유 장치를
            # 세우겠습니다」라고 말한 뒤 일감을 점유했다. 스물여덟 분 동안
            # 열두 번 말하고 한 대도 안 세운 이유가 이것이다.
            if job.routine:
                if not self.start_routine(worker, job.routine, job.ore, job.at):
                    skipped["루틴이 안 뜸"] = skipped.get("루틴이 안 뜸", 0) + 1
                    continue
            else:
                try:
                    # 이름을 `plan` 으로 두면 사다리의 `plan` 을 가린다.
                    # 파이썬은 함수 안 어디서든 대입이 있으면 그 이름을
                    # 통째로 지역 변수로 보므로, 위에서 부르는 사다리가
                    # "아직 값이 없다"며 터진다.
                    submitted = worker.handle.submit_plan(job.steps)
                except RconError as exc:
                    skipped["제출 실패"] = skipped.get("제출 실패", 0) + 1
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)
                    continue
                worker.watching = submitted

            self.claim(worker, job.key)
            self.say(job.narration, who=name)
            worker.said_idle = False
            handed.add(name)

        # 몇 개를 만들어 몇 명에게 줬는가. 사람이 남는데 일감이 없으면
        # 그것은 「할 일이 없다」가 아니라 «일감을 못 만들었다»이다.
        made, left, hands = getattr(self, "last_pool", (0, 0, 0))
        if len(handed) < hands:
            why = ", ".join(f"{k} {v}" for k, v in sorted(skipped.items())) or "없음"
            said = (made, left, hands, len(handed), why)
            if getattr(self, "_thin", None) != said:
                self._thin = said
                self.say(f"일감 {left}개 / 손 {hands}개 / 준 것 {len(handed)}개. "
                         f"건너뛴 까닭: {why}")
        return handed

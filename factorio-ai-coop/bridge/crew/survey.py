"""지금 무엇이 급한가를 훑고, 그것을 사람에게 나눠준다.

이 파일의 순서가 곧 무리의 우선순위다. 위에 있을수록 먼저 집어간다.
"""

from __future__ import annotations

from client import RconError

from settings import (CHEST, DRILL, DRILL_FUEL, HARVEST_MIN, HAUL_BATCH,
                      SMELTED_BY_FURNACE, SMELT_BATCH, SURPLUS, THIN_DRILL)
from world import Snapshot
from jobs import Job, Step
from layout import belt_pairs, carry_split, cluster, interleave, nearest_to
from ladder import STAGE_TARGET, _as_rows
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
        except RconError:
            return jobs

        # 이미 선 장치를 살리는 것이 새 장치를 세우는 것보다 먼저다.
        # 빈 찬장을 서른 개 지어놓고 서른한 번째를 지으러 가면 안 된다.
        unblock.extend(self.restock_jobs(worker, coal_chests))

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
        for spot in blind[:3]:
            unblock.append(Job(
                f"({spot['x']:.0f}, {spot['y']:.0f}) 채굴기가 캔 것을 둘 데가 "
                f"없어 멈춰 있습니다. 떨구는 자리에 화로를 놓겠습니다.",
                key=f"open:{spot['x']:.0f},{spot['y']:.0f}",
                routine="open", at=spot, needs={"stone-furnace": 1}))

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

        pool = self.survey(free[0][0])
        taken = self.taken()
        pool = [j for j in pool if j.key not in taken]
        if not pool:
            return set()

        seats = {w.name: (snap.x, snap.y) for w, snap in free}
        handed: set[str] = set()
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
                continue
            worker = self.workers[name]

            # 먼저 «시작할 수 있는가»를 확인하고, 그 다음에 말한다.
            # 예전에는 start_routine 의 반환값을 버렸다. 앞의 작업이 아직
            # 슬롯을 쥐고 있으면 그 함수는 아무것도 안 하고 False 를
            # 돌려주는데, 배차는 그걸 성공으로 치고 「급유 장치를
            # 세우겠습니다」라고 말한 뒤 일감을 점유했다. 스물여덟 분 동안
            # 열두 번 말하고 한 대도 안 세운 이유가 이것이다.
            if job.routine:
                if not self.start_routine(worker, job.routine, job.ore, job.at):
                    continue
            else:
                try:
                    plan = worker.handle.submit_plan(job.steps)
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)
                    continue
                worker.watching = plan

            self.claim(worker, job.key)
            self.say(job.narration, who=name)
            worker.said_idle = False
            handed.add(name)

        return handed

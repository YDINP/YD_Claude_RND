"""운반 - 캐는 곳에서 녹이는 곳까지 광석을 옮긴다.

구역을 나누면 그 사이를 잇는 일이 생긴다. 그것이 운반이고, 그래서 제 파일을
갖는다.

방법은 둘이다.

  사람   가방만큼 나르고, 걸음마다 시간이 든다. 대신 지금 당장 된다.
  벨트   한 번 깔면 자지도 쉬지도 않는다. 노란 벨트 한 줄이 초당 15개인데,
         그것은 버너 채굴기 예순 대의 산출과 같다.

벨트가 깔리는 동안에도 사람은 나른다. 둘은 경쟁하지 않는다 - 벨트가 다
깔리면 사람 쪽 일감이 저절로 사라진다(상자가 안 쌓이므로).
"""

from __future__ import annotations

from client import RconError, TaskFailed

from settings import (BACKOFF_SECONDS, HAUL_BATCH, HAUL_WHEN, LINE_CHUNK, LINE_CHUNK_MAX, LINE_HANDS, LOOSE_BATCH, LOOSE_LOOK,
                      SMELTED_BY_FURNACE)
from jobs import Job, Step
from ladder import _as_rows
from layout import cluster
from worker import Worker

BELT = "transport-belt"
ARM = "burner-inserter"


class HaulingMixin:
    """운반 - 캐는 곳에서 녹이는 곳까지."""

    def haul_ore(self, worker: Worker) -> list[Job]:
        """캐는 구역에 쌓인 광석을 제련 구역으로 옮긴다.

        벨트가 깔려 있으면 벨트에 얹는다. 줄 끝까지 걸어갈 이유가 없다 -
        거기까지는 벨트가 데려간다. 아직 없으면 제련 구역까지 들고 간다.
        """
        try:
            here = self.bridge.zones(worker.name)
        except RconError:
            return []
        smelt = here.get("smelt")
        if not smelt:
            return []

        # 벨트 길이 시작되는 곳. 거기 벨트가 실제로 서 있으면 거기 얹는다.
        drop, by_belt = None, False
        try:
            line = self.bridge.flow_plan(worker.name, "ore", limit=1)
            head = line.get("from")
            standing = (line.get("standing") or {}).get("trunk") or 0
            if head and standing > 0:
                drop, by_belt = head, True
        except RconError:
            pass
        if drop is None:
            try:
                drop = (self.bridge.depot() or {}).get("depot") or smelt
            except RconError:
                drop = smelt

        out: list[Job] = []
        taken = self.taken()
        for ore in SMELTED_BY_FURNACE:
            try:
                shelves = [c for c in self.bridge.chest_stock(worker.name, ore)
                           if not c.get("well")
                           and int(c.get("count") or 0) >= HAUL_WHEN]
            except RconError:
                continue
            for group in cluster(shelves)[:1]:
                head_chest = group[0]
                key = f"haul:{ore}:{head_chest['x']:.0f},{head_chest['y']:.0f}"
                if key in taken:
                    continue
                load = min(HAUL_BATCH * 4,
                           sum(int(c.get("count") or 0) for c in group))
                steps: list[Step] = [
                    ("take", {"name": ore, "count": int(c.get("count") or 0),
                              "x": c["x"], "y": c["y"]}) for c in group]
                steps.append(("insert", {"name": ore, "count": load,
                                         "x": drop["x"], "y": drop["y"]}))
                out.append(Job(
                    f"캐는 구역 상자 {len(group)}개에 {ore}가 {load}개 쌓였습니다. "
                    + ("벨트에 얹겠습니다." if by_belt else "제련 구역으로 옮기겠습니다."),
                    key=key, steps=steps,
                    at={"x": head_chest["x"], "y": head_chest["y"]}))
        return out

    # 물류의 흐름마다 사람이 읽을 이름.
    # 물류의 순서. 채굴 -> 유통 -> 제련 -> 조립.
    FLOW_NAMES = {"field": "수집 길 (채굴밭 → 유통)",
                  "depot": "유통 구역 (상자와 인서터)",
                  "ore": "광석 길 (유통 → 제련)",
                  "plate": "판금 길 (제련 → 조립)"}

    def line_job(self, worker: Worker) -> Job | None:
        """아직 안 이어진 흐름 하나를 집어 일감으로 낸다.

        흐름은 순서가 있다. 광석이 안 들어오면 판금이 안 나오므로, 앞의
        흐름이 덜 됐으면 그것부터 한다.
        """
        try:
            flows = self.bridge.flows(worker.name, limit=1)
        except RconError:
            return None
        taken = self.taken()
        for flow in flows:
            if flow.get("error") or int(flow.get("left") or 0) <= 0:
                continue
            up = flow.get("standing") or {}
            want = flow.get("want") or {}
            parts = ", ".join(f"{k} {up.get(k, 0)}/{want.get(k, 0)}"
                              for k in want)
            # 설계는 하나, 건설은 여럿이. 예전에는 열쇠가 흐름마다 하나여서
            # 한 번에 한 사람만 길을 깔았다 - 백오십 칸을 혼자 깔았다.
            #
            # 이제 저마다 제 몫을 «받아» 간다. 남이 집어간 칸은 안 오므로
            # 셋이 동시에 깔아도 같은 칸에 둘이 서지 않는다. 셋까지만 -
            # 넷째부터는 벨트 만들 철판이 모자라서 서로 굶긴다.
            busy = sum(1 for k in taken if k.startswith(f"line:{flow['flow']}:"))
            key = f"line:{flow['flow']}:{worker.name}"
            if key not in taken and busy >= LINE_HANDS:
                continue
            return Job(
                f"{self.FLOW_NAMES.get(flow['flow'], flow['flow'])}이(가) "
                f"{flow['left']}칸 모자랍니다 ({parts}). 제 몫을 받아 "
                f"이어 깔겠습니다.",
                key=key, routine="line",
                at={**(flow.get("from") or {}), "flow": flow["flow"]})
        return None

    def loose_belt_job(self, worker: Worker) -> Job | None:
        """정해진 길 위에 없는 벨트를 걷어온다.

        길을 부를 때마다 새로 찾던 시절에 깔린 것들이다. 걷어내면 벨트가
        손에 돌아오고, 그 손으로 진짜 길을 이어 깔면 된다 - 새로 만들 필요가
        없으니 철판을 그만큼 아끼는 셈이다.

        실측(48분째)이 왜 이 일이 급한지 보여준다:

            세상의 벨트     526칸
            그중 길 밖      400칸 이상
            길에 모자란 칸  409칸

        **이미 깔린 것을 걷기만 하면 길이 거의 다 이어진다.** 그런데 무리는
        새 벨트를 만들고 있었다. 철판 사백 장이 미로로 누워 있는데 옆에서
        또 사백 장을 녹이는 꼴이다.

        한 번에 걷는 양을 여섯에서 스물로 늘렸다. 한 무더기에 여섯씩
        걷어서는 사백 칸을 못 치운다 - 벨트 한 스택이 백 개이므로 스물은
        가방에 넉넉히 들어간다.
        """
        try:
            loose = self.bridge.loose_belts(worker.name, limit=LOOSE_LOOK)
        except RconError:
            return None
        # 몇 칸이 널려 있는지 여기서 기억해둔다. 순서를 정하는 쪽이 그
        # 숫자를 다시 물으면 같은 조회를 두 번 하는 셈이다.
        self._loose_seen = len(loose)
        if not loose:
            return None
        taken = self.taken()
        for group in cluster(loose)[:4]:
            head = group[0]
            key = f"loose:{head['x']:.0f},{head['y']:.0f}"
            if key in taken:
                continue
            group = group[:LOOSE_BATCH]
            return Job(
                f"길 위에 없는 벨트 {len(group)}칸이 버려져 있습니다. "
                f"걷어와서 진짜 길에 쓰겠습니다.",
                key=key,
                steps=[("demolish", {"x": one["x"], "y": one["y"],
                                     "name": BELT}) for one in group],
                at={"x": head["x"], "y": head["y"]})
        return None

    def belt_flood(self, worker: Worker) -> int:
        """길 밖에 널린 벨트가 몇 칸인가.

        이것이 길에 모자란 칸수와 비슷하면, 새로 만들 이유가 없다.
        걷어서 깔면 된다.
        """
        return int(getattr(self, "_loose_seen", 0))

    def resettle_job(self, worker: Worker) -> Job | None:
        """제자리가 아닌 건물을 제 구역으로 옮긴다.

        구역을 나누는 일의 절반은 «이미 있는 것을 옮기는 일»이다. 새로 짓는
        것만 구역으로 보내면 흩어진 것은 영원히 흩어진 채로 남는다.

        걷어내면 건물이 통째로 손에 돌아오므로 옮기는 값은 걸음뿐이다.
        한 번에 네 채씩 - 가까이 모인 것을 한 번의 걸음으로 옮긴다.
        """
        try:
            found = self.bridge.misplaced(worker.name)
        except RconError:
            return None
        rows = _as_rows(found.get("misplaced"))
        if not rows:
            return None
        # 빈 자리를 «묻는다». 예전에는 「이미 선 것이 열둘이니 다음은 열셋」로
        # 셌는데, 그중 하나가 자리표에서 벗어나 있으면 번호가 밀려 이미 찬
        # 자리에 또 놓으려 든다. 세는 것과 비어 있는가는 다른 질문이다.
        free: dict[str, list[dict]] = {}
        for zone in ("smelt", "craft"):
            try:
                answer = self.bridge.next_seat(worker.name, zone)
            except RconError:
                continue
            if answer.get("error"):
                continue
            spots = _as_rows((answer.get("seat") and [answer["seat"]]) or [])
            free[zone] = spots

        taken = self.taken()

        # 자리가 없으면 «걷는다».
        #
        # 실측: 화로 106대, 자리표의 자리 48개. 쉰여덟 대는 갈 곳이 없다.
        # 지금까지는 그 쉰여덟이 영원히 그 자리에 남았다 - 옮길 자리가 없으면
        # resettle 이 통째로 아무것도 안 했기 때문이다.
        #
        # 자리표가 마흔여덟인 것은 모자라서가 아니다. 노란 벨트 한 줄이
        # 먹일 수 있는 화로가 마흔여덟 대다. 쉰아홉 번째부터는 광석이 안
        # 와서 서 있기만 하고, 서 있기만 하는 화로도 연료는 태우고 공해는
        # 낸다. 실측에서 96대가 no_ingredients 였던 것이 그 뜻이다.
        #
        # 걷으면 돌로 돌아온다. 자리에 없는 건물은 자재다.
        if not any(free.values()):
            for group in cluster(rows)[:2]:
                head = group[0]
                key = f"spare:{head['x']:.0f},{head['y']:.0f}"
                if key in taken:
                    continue
                group = group[:6]
                return Job(
                    f"{head['name']} {len(group)}대가 자리표 밖에 서 있는데 "
                    f"빈 자리가 없습니다. 걷어서 자재로 돌리겠습니다. "
                    f"({head['x']:.0f}, {head['y']:.0f})",
                    key=key,
                    steps=[("demolish", {"x": one["x"], "y": one["y"],
                                         "name": one["name"]})
                           for one in group],
                    at={"x": head["x"], "y": head["y"]})
            return None

        for group in cluster(rows)[:1]:
            group = [one for one in group if free.get(one["zone"])]
            if not group:
                continue
            head = group[0]
            key = f"move:{head['x']:.0f},{head['y']:.0f}"
            if key in taken:
                continue

            steps: list[Step] = []
            moved = []
            for one in group[:4]:
                spot = (free.get(one["zone"]) or [None])[0]
                if not spot:
                    continue
                # 한 번에 한 채씩 옮긴다. 자리표는 걷어내고 세울 때마다
                # 달라지므로, 한 번의 답으로 네 채를 배치하면 두 번째부터는
                # 옛 답이다. 게임에 다시 묻는 것이 싸다.
                steps.append(("demolish", {"x": one["x"], "y": one["y"],
                                           "name": one["name"]}))
                steps.append(("build", {"name": one["name"],
                                        "x": spot["x"], "y": spot["y"],
                                        "snap": True}))
                moved.append(one["name"])
                break
            if not steps:
                continue
            where = "제련" if head["zone"] == "smelt" else "조립"
            why = "자리표에서 벗어나" if head.get("askew") else f"{where} 구역 밖에"
            return Job(
                f"{moved[0]}이(가) {why} 서 있습니다. 걷어내서 제자리에 다시 "
                f"세우겠습니다. ({head['x']:.0f}, {head['y']:.0f})",
                key=key, steps=steps,
                at={"x": head["x"], "y": head["y"]})
        return None

    def lay_line(self, worker: Worker, at: dict) -> None:
        """한 흐름의 길을 이어 깐다. 한 번에 나를 수 있는 만큼씩.

        스무 칸씩 깐다. 백 칸을 한 번에 깔려면 백 칸어치를 먼저 만들어야 하고,
        그동안 아무도 아무것도 못 한다. 반쯤 깐 길도 다음 사람이 이어 깐다 -
        벨트 쪽이 「아직 없는 것만」 돌려주는 이유가 그것이다.
        """
        name = worker.name
        which = at.get("flow", "ore")
        key = f"line:{which}:{name}"
        label = self.FLOW_NAMES.get(which, which)
        # 손에 든 만큼 청구한다.
        #
        # 스무 칸으로 못 박아뒀더니, 벨트를 아흔한 칸 들고 다니는 사람이
        # 스무 칸만 받아 갔다. 나머지 일흔한 칸은 가방에서 자고, 길은
        # 그만큼 늦게 이어진다.
        #
        # 들고 있는 것을 쓰는 것이 만드는 것보다 언제나 싸다.
        try:
            hand = (self.bridge.call("inventory", name).get("items") or {})
        except RconError:
            hand = {}
        want = max(LINE_CHUNK, min(int(hand.get(BELT) or 0), LINE_CHUNK_MAX))
        try:
            # 설계에 «내 몫»을 달라고 한다. 남이 집어간 칸은 안 온다.
            line = self.bridge.claim_work(name, which, want)
        except RconError:
            return
        todo = _as_rows(line.get("todo"))
        if not todo:
            return

        # 무엇이 몇 개 필요한지 세고 구해본다. 다 못 구해도 «구한 만큼»은
        # 깐다 - 스무 칸을 못 구했다고 한 칸도 안 깔면 길은 영영 안 이어진다.
        #
        # 예전에는 하나라도 모자라면 통째로 포기했다. 벨트 스무 개를 만들
        # 철판이 없으면 열두 개도 안 깔았다.
        need: dict[str, int] = {}
        for one in todo:
            need[one["what"]] = need.get(one["what"], 0) + 1
        for part, count in need.items():
            if not self.obtain(worker, part, count):
                self.ask_for(worker, part, count, label)

        # 손에 있는 만큼으로 할 일을 줄인다. 게임에 직접 묻는다 - 「구했다고
        # 생각한 것」과 「손에 있는 것」은 다르다.
        try:
            hand = (self.bridge.call("inventory", name).get("items") or {})
        except RconError:
            hand = {}
        left = {part: int(hand.get(part) or 0) for part in need}
        doable: list[dict] = []
        for one in todo:
            if left.get(one["what"], 0) <= 0:
                break        # 길은 순서다. 건너뛰면 끊긴다.
            left[one["what"]] -= 1
            doable.append(one)
        if not doable:
            worker.block(key, BACKOFF_SECONDS)
            return
        todo = doable

        laid, stuck = 0, None
        for one in todo:
            # 「치우면 놓을 수 있는」 칸이라고 표시된 것은 먼저 쓸어낸다.
            # 채굴기가 흘린 광석이 대부분이고, 줍고 나면 자리가 난다.
            # 이것을 몰라서 줄 맨 앞 칸 하나 때문에 길 전체가 멈춰 있었다.
            if one.get("sweep"):
                try:
                    worker.handle.sweep(one["x"], one["y"], radius=1,
                                        timeout=300)
                except TaskFailed:
                    pass
            try:
                worker.handle.place(one["what"], one["x"], one["y"],
                                    direction=one.get("dir", 0), timeout=420)
                laid += 1
            except TaskFailed as exc:
                stuck = exc.task.get("error")
                break
        if not laid:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"{label}을(를) 못 깔았습니다: {stuck}", who=name)
            return

        # 깔았으면 «싣는다».
        #
        # 사용자가 사진과 함께 짚었다: "이러면 벨트를 깐 이유가 없는데".
        # 채굴기가 상자에 떨구고 그 옆에서 벨트가 비어 있었다.
        #
        # 버너 채굴기는 인서터 없이 벨트에 «직접» 떨군다. 그런데 벨트를
        # 깐다고 채굴기가 저절로 그쪽을 보지는 않는다 - 상자가 안 찼으면
        # 막힌 것이 아니므로 예전 방향 그대로다. 깔고 나서 돌려줘야 한다.
        #
        # 길을 깐 일과 그 길에 싣는 일은 다른 일이다. 앞의 것만 하고 뒤의
        # 것을 빠뜨리면 벨트는 장식이 된다.
        try:
            fed = self.bridge.feed_belts(name)
            if fed.get("turned"):
                self.say(f"채굴기 {len(fed['turned'])}대를 벨트 쪽으로 "
                         f"돌렸습니다. 이제 상자가 아니라 벨트에 떨굽니다.",
                         who=name)
        except RconError:
            pass

        after = 0
        try:
            after = int((self.bridge.flow_plan(name, which, limit=1)
                         or {}).get("left") or 0)
        except RconError:
            pass
        self.say(f"{label}을(를) {laid}칸 깔았습니다. 남은 것 {after}칸.", who=name)

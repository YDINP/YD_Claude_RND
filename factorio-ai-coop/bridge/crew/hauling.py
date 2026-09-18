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

from settings import (BACKOFF_SECONDS, HAUL_BATCH, HAUL_WHEN,
                      SMELTED_BY_FURNACE)
from jobs import Job, Step
from ladder import _as_rows
from layout import cluster, craft_seat, furnace_seat
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
    FLOW_NAMES = {"ore": "광석 길 (채굴 → 제련)",
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
        for flow in flows:
            if flow.get("error") or int(flow.get("left") or 0) <= 0:
                continue
            up = flow.get("standing") or {}
            want = flow.get("want") or {}
            parts = ", ".join(f"{k} {up.get(k, 0)}/{want.get(k, 0)}"
                              for k in want)
            return Job(
                f"{self.FLOW_NAMES.get(flow['flow'], flow['flow'])}이(가) "
                f"{flow['left']}칸 모자랍니다 ({parts}). 이어 깔겠습니다.",
                key=f"line:{flow['flow']}", routine="line",
                at={**(flow.get("from") or {}), "flow": flow["flow"]})
        return None

    def loose_belt_job(self, worker: Worker) -> Job | None:
        """정해진 길 위에 없는 벨트를 걷어온다.

        길을 부를 때마다 새로 찾던 시절에 깔린 것들이다. 걷어내면 벨트가
        손에 돌아오고, 그 손으로 진짜 길을 이어 깔면 된다 - 새로 만들 필요가
        없으니 철판 예순 개를 아끼는 셈이다.
        """
        try:
            loose = self.bridge.loose_belts(worker.name)
        except RconError:
            return None
        if not loose:
            return None
        taken = self.taken()
        for group in cluster(loose)[:1]:
            head = group[0]
            key = f"loose:{head['x']:.0f},{head['y']:.0f}"
            if key in taken:
                continue
            return Job(
                f"길 위에 없는 벨트 {len(group)}칸이 버려져 있습니다. "
                f"걷어와서 진짜 길에 쓰겠습니다.",
                key=key,
                steps=[("demolish", {"x": one["x"], "y": one["y"],
                                     "name": BELT}) for one in group],
                at={"x": head["x"], "y": head["y"]})
        return None

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
        settled = found.get("settled") or {}
        seat_of = {"smelt": (found.get("smelt"), furnace_seat),
                   "craft": (found.get("craft"), craft_seat)}

        taken = self.taken()
        for group in cluster(rows)[:1]:
            group = [one for one in group if seat_of.get(one["zone"], (None,))[0]]
            if not group:
                continue
            head = group[0]
            key = f"move:{head['x']:.0f},{head['y']:.0f}"
            if key in taken:
                continue

            steps: list[Step] = []
            nth = dict(settled)
            moved = []
            for one in group[:4]:
                origin, seat_fn = seat_of[one["zone"]]
                seat = seat_fn(origin, nth[one["zone"]])
                nth[one["zone"]] += 1
                steps.append(("demolish", {"x": one["x"], "y": one["y"],
                                           "name": one["name"]}))
                steps.append(("build", {"name": one["name"], **seat,
                                        "snap": True}))
                moved.append(one["name"])
            where = "제련" if head["zone"] == "smelt" else "조립"
            return Job(
                f"{moved[0]} 등 {len(moved)}채가 {where} 구역 밖에 서 있습니다. "
                f"걷어내서 제자리에 다시 세우겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
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
        key = f"line:{which}"
        label = self.FLOW_NAMES.get(which, which)
        try:
            line = self.bridge.flow_plan(name, which, limit=20)
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

        after = 0
        try:
            after = int((self.bridge.flow_plan(name, which, limit=1)
                         or {}).get("left") or 0)
        except RconError:
            pass
        self.say(f"{label}을(를) {laid}칸 깔았습니다. 남은 것 {after}칸.", who=name)

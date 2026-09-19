"""공용 창고에 무엇이 있는지 기억한다.

사용자: "공동작업이니, 공용물류상자에 남는 잉여물들을 넣고(광석등)
전체게시판같은거에 알림을 띄워서 서로 필요한게 생기면 공용물류에서 꺼내
쓰도록, 공용물류에 뭐가있는지 기억할 수 있도록."

넣는 일(`depot_job`)과 꺼내는 일(`supply`)은 이미 있었다. 없던 것은
«기억»이다. 그래서 매번 다시 묻거나, 안 묻고 없는 셈 쳤다.

실제로 이런 일이 있었다 - 옆 사람이 철광석 150개를 든 채로 「철광석이
필요합니다」라고 말했다. 창고가 있어도 그 안이 안 보이면 없는 것과 같다.

기억은 세 가지를 위해 있다.

    알림    게시판에 한 줄. 사람도 보고 요원도 본다.
    판단    「부탁하기 전에 창고를 본다」의 근거.
    생각    머리(mind.py)의 프롬프트에 들어간다. 스스로 꺼내 쓰라고.

그리고 «바뀐 것»을 안다. 들어오고 나간 것을 알면 알림이 목록이 아니라
소식이 된다 - 목록은 읽히지 않고 소식은 읽힌다.
"""

from __future__ import annotations

import time

# 이 아래로는 알림에 안 적는다. 한두 개까지 적으면 줄이 길어져 정작 많은
# 것이 밀려난다.
WORTH_SAYING = 10
# 게시판 한 줄에 몇 품목까지.
ON_BOARD = 6
# 다시 묻는 주기(초). 창고는 분 단위로 움직인다.
REFRESH = 20.0


class Pantry:
    """공용 창고의 기억."""

    def __init__(self) -> None:
        self.have: dict[str, int] = {}
        # 상자마다 «무엇이 들었는지». 합계만 기억하면 「어딘가에 있다」까지는
        # 알지만 「어디에 있다」는 모른다. 그 둘을 짝지어 쓰면 엉뚱한 상자로
        # 꺼내러 간다 - 돌만 든 상자 앞에서 철광석을 꺼내려 한 적이 있다.
        self.shelves: list[dict] = []
        self.chests = 0
        self.read_at = 0.0
        self.last_told: dict[str, int] = {}

    # -- 읽기 -------------------------------------------------------------

    @property
    def stale(self) -> bool:
        return time.monotonic() - self.read_at > REFRESH

    def remember(self, reply: dict | None) -> None:
        """`bridge.stores()` 가 준 것을 받아 적는다."""
        self.read_at = time.monotonic()
        if not isinstance(reply, dict):
            return
        total = reply.get("total")
        self.have = {k: int(v) for k, v in (total or {}).items() if v}
        self.chests = int(reply.get("chest_count") or 0)
        rows = reply.get("chests")
        if isinstance(rows, dict):
            rows = list(rows.values())
        self.shelves = [r for r in (rows or [])
                        if isinstance(r, dict) and "x" in r]

    # -- 묻기 -------------------------------------------------------------

    def count(self, item: str) -> int:
        return self.have.get(item, 0)

    def shelf(self, item: str, count: int = 1):
        """이 물건이 «실제로 든» 상자 중 가장 많이 든 것과, 꺼낼 수 있는 수.

        합계로 「있다」를 판단하고 가장 가까운 상자로 «가면» 안 된다.
        합계는 반경 200 안 모든 상자를 더한 값이고, 가장 가까운 상자는
        그것과 아무 상관이 없다. 둘을 짝지으면 돌만 든 상자로 철광석을
        꺼내러 가고, take 의 검색 반경은 한 칸 반이라 그냥 실패한다.
        """
        best, most = None, 0
        for row in self.shelves:
            n = int((row.get("items") or {}).get(item) or 0)
            if n > most:
                best, most = row, n
        if not best or most <= 0:
            return None
        return {"x": int(best["x"]), "y": int(best["y"])}, min(most, count)

    def has(self, item: str, count: int = 1) -> bool:
        """한 상자에서 이만큼 꺼낼 수 있는가.

        「세상에 이만큼 있는가」가 아니다. 나눠 담긴 것은 한 번에 못 꺼낸다.
        """
        got = self.shelf(item, count)
        return bool(got) and got[1] >= count

    # -- 말하기 -----------------------------------------------------------

    def board_line(self) -> str | None:
        """게시판 한 줄. 많은 것부터."""
        if not self.have:
            return None
        rows = sorted(self.have.items(), key=lambda kv: -kv[1])[:ON_BOARD]
        return "공용 창고: " + ", ".join(f"{k} {v}" for k, v in rows)

    def news(self) -> str | None:
        """지난번에 말한 뒤로 «바뀐 것». 없으면 None.

        목록이 아니라 소식으로 말한다. 같은 목록을 되풀이하면 아무도
        안 읽는다 - 이 저장소가 채팅으로 여러 번 겪은 일이다.
        """
        came, went = [], []
        for item, now in self.have.items():
            before = self.last_told.get(item, 0)
            if now - before >= WORTH_SAYING:
                came.append(f"{item} +{now - before}")
        for item, before in self.last_told.items():
            now = self.have.get(item, 0)
            if before - now >= WORTH_SAYING:
                went.append(f"{item} -{before - now}")
        if not came and not went:
            return None
        self.last_told = dict(self.have)
        bits = []
        if came:
            bits.append("들어온 것 " + ", ".join(sorted(came)[:4]))
        if went:
            bits.append("나간 것 " + ", ".join(sorted(went)[:4]))
        return "공용 창고 — " + " / ".join(bits)

    def brief(self) -> str:
        """머리에게 보여줄 한 토막."""
        if not self.have:
            return "공용 창고: 비어 있음 (또는 아직 안 세움)"
        rows = sorted(self.have.items(), key=lambda kv: -kv[1])[:ON_BOARD]
        # 좌표를 안 붙인다. 합계는 여러 상자를 더한 값인데 좌표를 하나만
        # 붙이면 「저기 다 있다」로 읽힌다. 어느 상자에 있는지는 꺼낼 때
        # shelf() 가 답한다.
        head = "공용 창고 (상자 %d개): " % self.chests
        body = ", ".join("%s %d" % (k, v) for k, v in rows)
        tail = chr(10) + "  - 필요한 것이 여기 있으면 캐거나 만들지 말고 꺼내 써라."
        return head + body + tail

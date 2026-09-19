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
        self.where: dict | None = None
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
        if rows:
            first = rows[0]
            if isinstance(first, dict) and "x" in first:
                self.where = {"x": int(first["x"]), "y": int(first["y"])}

    # -- 묻기 -------------------------------------------------------------

    def count(self, item: str) -> int:
        return self.have.get(item, 0)

    def has(self, item: str, count: int = 1) -> bool:
        return self.count(item) >= count

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
        seat = (f" @({self.where['x']},{self.where['y']})"
                if self.where else "")
        return (f"공용 창고{seat}, 상자 {self.chests}개: "
                + ", ".join(f"{k} {v}" for k, v in rows)
                + "\n  — 필요한 것이 여기 있으면 캐거나 만들지 말고 꺼내 써라.")

"""한 사람 - 게임 속 캐릭터 하나에 붙은 상태.

무엇을 보고 있는지, 무엇에 막혔는지를 기억한다. 무엇을 할지는 정하지 않는다.
"""

from __future__ import annotations

import threading
import time

from client import Agent, RconError

from settings import BACKOFF_SECONDS
from world import Snapshot


class Worker:
    """One agent, plus the bookkeeping that belongs to it alone."""

    def __init__(self, handle: Agent, focus: str = "iron-ore") -> None:
        self.handle = handle
        self.name = handle.name
        self.focus = focus
        self.autopilot = True
        self.watching: list[int] = []
        self.said_idle = False
        # One slow job (an LLM call, a build-out) at a time per agent.
        self.slot = threading.Semaphore(1)
        # 제련 블록의 모서리. 무리가 한 번 정해 알려주면 그대로 들고 다닌다 -
        # 사람마다 다른 기준을 쓰면 화로가 줄을 서지 못한다.
        self.smelter: dict | None = None
        self.craft: dict | None = None
        # 무리가 알려주는 공용 창고 재고. 사다리가 이것을 본다.
        self.shelved: dict[str, int] = {}
        self.next_furnace: dict | None = None
        # 반장이 재어 알려주는 누적 생산량. 사다리가 이것을 본다.
        self.made: dict[str, int] = {}
        # What has just failed, and until when it stays off the table.
        self.blocked: dict[str, float] = {}
        # The job key this agent currently holds, so the crew can hand the rest
        # of the list to somebody else.
        self.job_key: str | None = None
        # 갇혔는지 세는 자리. 「어디서」 실패했는지까지 기억해야 한다 -
        # 움직이면서 한 번씩 실패하는 것과 한자리에 못 박힌 것은 다르다.
        self.lost_at: tuple[int, int] | None = None
        self.lost_count = 0
        # 지금 대신 해주고 있는 부탁과, 그걸 실어나르는 태스크 번호.
        self.errand: tuple[int, object] | None = None
        # 막혀서 모델에게 물어본 마지막 시각.
        self.asked_at = 0.0

    def snapshot(self, radius: int = 200) -> Snapshot:
        world = self.handle.observe(radius=radius)
        inventory = self.handle.inventory()
        research = self.handle.bridge.research_state()
        try:
            power = self.handle.bridge.power_status(self.name)
        except RconError:
            power = {}
        humans = world.get("humans") or {}
        mates = world.get("agents") or {}
        return Snapshot(
            tick=world.get("tick", 0),
            x=world.get("position", {}).get("x", 0.0),
            y=world.get("position", {}).get("y", 0.0),
            items=inventory.get("items") or {},
            craftable=inventory.get("craftable") or {},
            free=int(inventory.get("free", 99)),
            shelved=dict(self.shelved),
            buildings=world.get("buildings") or {},
            resources=world.get("resources") or {},
            humans=list(humans.values()) if isinstance(humans, dict) else humans,
            mates=list(mates.values()) if isinstance(mates, dict) else mates,
            researched=research["researched"],
            researching=research.get("current"),
            powered=bool(power.get("powered")),
            smelter=self.smelter,
            craft=self.craft,
            next_furnace=self.next_furnace,
            made=dict(self.made),
        )

    def block(self, kind: str, seconds: float = BACKOFF_SECONDS) -> None:
        self.blocked[kind] = time.monotonic() + seconds

    def blocked_now(self) -> frozenset[str]:
        now = time.monotonic()
        self.blocked = {k: t for k, t in self.blocked.items() if t > now}
        return frozenset(self.blocked)

"""게임이 지금 어떻게 보이는가 - 한 번 읽어 얼려둔 값 객체.

스냅샷은 게임을 다시 묻지 않는다. 한 번의 판단이 도중에 바뀐 세계를 보고
앞뒤가 안 맞는 결론을 내리는 일을 막기 위해서다.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Snapshot:
    tick: int = 0
    x: float = 0.0
    y: float = 0.0
    items: dict[str, int] = field(default_factory=dict)
    craftable: dict[str, int] = field(default_factory=dict)
    buildings: dict[str, dict] = field(default_factory=dict)
    resources: dict[str, dict] = field(default_factory=dict)
    humans: list[dict] = field(default_factory=list)
    mates: list[dict] = field(default_factory=list)
    researched: set[str] = field(default_factory=set)
    researching: str | None = None
    # 기관이 서 있는 것과 전기가 흐르는 것은 다르다. 물 없는 보일러에 물린
    # 기관은 밖에서 보면 멀쩡한 발전소와 똑같이 생겼다.
    powered: bool = False
    # 가방의 빈 칸. 이것이 0 이면 캐는 일도 걷어내는 일도 전부 실패한다.
    free: int = 99
    # 제련 블록의 모서리. 누가 묻든 같은 값이어야 화로가 줄을 선다.
    smelter: dict | None = None
    # 조립 구역의 모서리. 랩과 조립기는 전부 여기 선다.
    craft: dict | None = None

    def have(self, item: str) -> int:
        return self.items.get(item, 0)

    def can_make(self, recipe: str, count: int = 1) -> bool:
        """Whether the game says this is hand-craftable right now.

        Asked rather than derived: the recipe tree, the intermediates and the
        research state all live in the game, and guessing at them is how an
        agent ends up announcing a build it cannot afford.
        """
        return self.craftable.get(recipe, 0) >= count

    def ore(self, name: str) -> dict | None:
        """이 광석의 가장 가까운 자리. **이름을 함께 돌려준다.**

        실측(새 판 20분째): (78,46)에서 석탄 30개를 캐라고 시켰더니
        copper-ore 30개를 캐 왔다. 구리 광맥 432타일이 석탄 위에 겹쳐 있고,
        mine 태스크가 이름 없이 「그 자리의 자원」을 집었기 때문이다.
        그래서 「석탄 캐러 갑니다」가 전부 구리 채굴이 되었고, 넷이 구리만
        천 개 넘게 캤다.

        호출부가 열한 군데다. 거기마다 이름을 붙이는 것은 언젠가 하나를
        빠뜨린다. 자리를 돌려주는 이 자리에서 붙이면 `{**spot}` 을 쓰는
        모든 곳이 자동으로 따라온다.
        """
        found = self.resources.get(name)
        if not found:
            return None
        near = found.get("nearest")
        return {**near, "name": name} if near else None

    def building(self, name: str) -> dict | None:
        found = self.buildings.get(name)
        return found.get("nearest") if found else None

    def spots(self, name: str) -> list[dict]:
        """이 종류 건물이 서 있는 자리들, 가까운 순.

        가장 가까운 하나만 알면 화로가 셋이어도 넷이 같은 화로 앞에 줄을
        선다. 자리가 여럿이면 각자 자기 화로를 집을 수 있다.
        """
        found = self.buildings.get(name) or {}
        spots = found.get("spots")
        if isinstance(spots, dict):      # Lua 빈 테이블은 {} 로 온다
            spots = list(spots.values())
        if spots:
            return [{"x": p["x"], "y": p["y"]} for p in spots]
        near = found.get("nearest")
        return [near] if near else []

    def knows(self, technology: str) -> bool:
        return technology in self.researched

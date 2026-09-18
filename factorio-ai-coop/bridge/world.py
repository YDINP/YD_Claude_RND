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
    # 전기가 흐르는 것과 랩이 «도는» 것은 또 다르다. 전기가 와도 팩이
    # 안 들어 있으면 랩은 서 있다. 이미 재고 있던 값인데 싣지를 않았다.
    working_labs: int = 0
    # 우리 공해가 가장 가까운 둥지에 닿기까지 남은 타일. 반장이 재서
    # 나눠준다. 이것이 줄면 「지을 수 있는가」가 아니라 「지어도 되는가」가
    # 달라진다.
    slack: float | None = None
    # 가방의 빈 칸. 이것이 0 이면 캐는 일도 걷어내는 일도 전부 실패한다.
    free: int = 99
    # 공용 창고에 무엇이 얼마나 있는가. 손에 없다고 없는 것이 아니다.
    shelved: dict[str, int] = field(default_factory=dict)
    # 제련 블록의 모서리. 누가 묻든 같은 값이어야 화로가 줄을 선다.
    smelter: dict | None = None
    # 조립 구역의 모서리. 랩과 조립기는 전부 여기 선다.
    craft: dict | None = None
    # 제련 구역에서 다음에 비어 있는 자리. 세지 않고 물어서 받은 값이다.
    next_furnace: dict | None = None
    # 여태 만든 누적 개수. «쓴 것은 없어져도 만든 것은 없어지지 않는다».
    made: dict[str, int] = field(default_factory=dict)

    def anywhere(self, item: str) -> int:
        """손에 든 것 + 창고에 있는 것.

        「가질 수 있는가」와 「지금 손에 있는가」는 다른 질문이다. 사다리는
        앞의 것을 물어야 한다 - 창고까지 걸어가는 것은 일이지 불가능이 아니다.

        이 구분을 놓쳐서 창고에 철판 3,979개를 쌓아두고 「철판이 없어 조립기를
        못 만든다」고 판단한 적이 있다.
        """
        return self.have(item) + int(self.shelved.get(item, 0))

    def ever(self, item: str, count: int = 1) -> bool:
        """여태 이것을 이만큼 만든 적이 있는가.

        소모품을 «가지고 있는가»로 물으면 안 된다. 과학팩은 랩이 먹고,
        연료는 화로가 태운다. 열 개를 만들어 쓰고 나면 가방이 비는데,
        그것을 「아직 못 했다」로 읽으면 사다리가 한 단 아래로 굴러떨어지고
        무리는 이미 끝낸 일을 영원히 다시 한다.

        실측: automation 연구가 끝났는데(빨간 과학팩 열 개를 써야 끝난다)
        조립기가 0대였다. 사다리가 「빨간 과학팩 생산」 단에서 못 올라오고
        있었고, 조립기 단은 그 위에 있었다.
        """
        return int(self.made.get(item, 0)) >= count

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

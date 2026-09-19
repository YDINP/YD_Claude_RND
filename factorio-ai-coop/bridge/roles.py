"""누가 무엇을 맡는가.

사용자: "에이전트별로 생산담당, 물류담당, 조립담당등등으로 나눠서 업무분담을
좀 해야할듯? 다같이 기준없이 행동하니까 망가지는듯."

맞다. 그 증상이 실측에 그대로 있었다(20분째):

    echo    | lab을 만들려면 iron-gear-wheel 3개가 필요합니다. 제작하겠습니다.
    echo    | craft 실패: cannot craft iron-gear-wheel (missing ingredients)

그때 alpha 6개, bravo 6개, charlie 9개 - 스물한 개가 남의 가방에 있었다.
«달라고» 하면 될 일을 «만들려고» 했다. 다섯이 같은 목록을 보고 각자 가장
급해 보이는 것을 고르면, 아무도 한 가지를 끝까지 책임지지 않는다.

그래서 축을 하나 더 둔다. 지금까지 있던 것은 «어느 광석»(focus)이었고,
여기 넣는 것은 «어떤 종류의 일»(role)이다. 둘은 다른 축이다 - 철을 맡은
사람이 나르는 일을 할 수도 있고 짓는 일을 할 수도 있다.

    생산   캐고 녹인다. 채굴기를 세우고 화로를 먹인다.
    물류   나른다. 벨트·상자·인서터, 그리고 공용 창고를 채우고 나눈다.
    조립   만든다. 중간재·랩·조립기, 그리고 전력.
    방어   지킨다. 터렛과 탄약. 평소에는 아무도 안 맡는다.

**역할은 편향이지 울타리가 아니다.** 제 역할에 일이 없으면 남의 일을 돕는다.
울타리로 만들면 「내 일이 아니라서 서 있었습니다」가 되고, 그건 이 저장소가
이미 치른 값이다 - 여섯 명에 일감 하나였던 판이 있었다.
"""

from __future__ import annotations

# 역할 이름. 게임 안 채팅에 그대로 나간다.
MINE = "생산"
HAUL = "물류"
MAKE = "조립"
GUARD = "방어"

ALL = (MINE, HAUL, MAKE, GUARD)

# 일감 열쇠의 «앞머리» -> 역할.
#
# 열쇠로 가른다. 일감을 만드는 자리가 여러 파일에 흩어져 있어서, 만드는
# 쪽마다 역할을 적게 하면 새 일감이 생길 때마다 빠뜨린다. 열쇠는 이미
# 모든 일감이 가지고 있다.
BY_KEY = {
    # 캐고 녹이기
    "automate": MINE, "stock": MINE, "smelt": MINE, "stoke": MINE,
    "gather": MINE, "harvest": MINE, "rescue": MINE, "spent": MINE,
    "mind-mine": MINE, "mind-smelt": MINE, "mind-take": MINE,

    # 나르기
    "belt": HAUL, "depot": HAUL, "convert": HAUL, "stray": HAUL,
    "restock": HAUL, "supply": HAUL, "fetch": HAUL, "dump": HAUL,
    "clear": HAUL, "mind-fetch": HAUL,

    # 만들기
    "craft": MAKE, "furnace": MAKE, "science": MAKE, "science-rig": MAKE,
    "first-packs": MAKE, "chain": MAKE, "power": MAKE, "pipe": MAKE,
    "plug": MAKE, "wire": MAKE, "bridge": MAKE, "open": MAKE,
    "build": MAKE, "mind-craft": MAKE, "mind-build": MAKE,

    # 지키기
    "defend": GUARD, "arm": GUARD, "flee": GUARD,
}


def role_of(key: str) -> str | None:
    """이 일감은 누구 몫인가. 모르면 None - 아무나 해도 되는 일이다."""
    if not key:
        return None
    return BY_KEY.get(key.split(":", 1)[0])


def share(crew: int, guarded: bool = False) -> list[str]:
    """사람 수만큼 역할을 늘어놓는다. 순서가 곧 배정 순서다.

    비율에 뜻이 있다. 초반 공장은 «만드는 일»이 병목이고(랩 하나에 기술
    트리 전체가 걸린다), 나르는 일은 벨트가 깔리기 전까지는 사람이 곧
    벨트다. 캐는 일은 채굴기가 서면 사람 손을 덜 탄다.

    셋 이하면 나누지 않는다. 나눌 만큼 사람이 없을 때 역할을 주면
    「내 일이 아니다」만 늘어난다.
    """
    if crew <= 3:
        return [MINE] * crew
    order = [MINE, MAKE, HAUL, MAKE, MINE, HAUL, MAKE, MINE]
    if guarded:
        # 방어가 급하면 한 사람을 떼어준다. 둘은 안 뗀다 - 총 두 대를
        # 세우자고 공장을 세우는 것이 지난 판들의 실패였다.
        order = [GUARD] + order
    return [order[i % len(order)] for i in range(crew)]


def sort_key(role: str | None):
    """제 역할 일을 앞으로 당기는 정렬 열쇠.

    빼지 않고 «당기기만» 한다. 역할에 맞는 일이 없으면 그 사람은 여전히
    남의 일을 받는다 - 울타리가 아니라 편향이다.
    """
    def rank(job) -> tuple:
        mine = role_of(job.key)
        if role is None or mine is None:
            return (1, 0)
        return (0, 0) if mine == role else (1, 0)
    return rank

"""목표와 요청 — 에이전트 한 명을 넘어서는 것들.

이 모듈에 있는 두 가지가 무리를 무리로 만든다.

`LADDER`는 로켓까지 가는 사다리다. 지금까지 에이전트들은 "당장 뭘 할까"만
매 틱 다시 계산했고, 그래서 광석을 영원히 쌓으면서도 아무 데도 가지 않았다.
사다리가 있으면 "지금 몇 단인지"와 "다음 단이 무엇인지"를 말할 수 있다.

`Board`는 부탁이다. 인벤토리가 각자 것이라, 석탄이 없는 에이전트에게
석탄을 쥔 동료가 있다는 사실은 저절로 전달되지 않는다. 필요한 것을 게시하면
여유 있는 쪽이 집어서 갖다준다.

전부 순수 함수와 자료구조다. 게임도 RCON도 모른다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

# ------------------------------------------------------------------ 사다리


@dataclass(frozen=True)
class Stage:
    """목표 한 단.

    `reached`는 스냅샷 하나만 보고 판단한다. 진행 상황을 따로 저장하지 않는
    이유는, 저장된 진행도와 실제 게임이 어긋나는 순간부터 계획이 거짓말을
    하기 시작하기 때문이다. 게임에 물어보면 틀릴 수가 없다.

    `automated`가 False인 단은 아직 무리가 스스로 못 하는 단이다. 사다리에
    적어두는 건 목표를 감추지 않기 위해서고, 거짓으로 세지 않기 위해서다.
    """
    key: str
    title: str
    reached: Callable[[Any], bool]
    automated: bool = True


def _has(item: str, count: int = 1) -> Callable[[Any], bool]:
    return lambda snap: snap.have(item) >= count


def _built(name: str) -> Callable[[Any], bool]:
    return lambda snap: snap.building(name) is not None


def _knows(tech: str) -> Callable[[Any], bool]:
    return lambda snap: snap.knows(tech)


# 2.0 프리플레이는 217개 레시피 중 23개만 열어준 채로 시작한다. 앞의 세 단은
# 과학팩이 아니라 «무엇을 만들었는가»로 열리는 트리거 기술이라, 순서를 건너뛸
# 수 없다. 랩 자체가 electronics 뒤에 있다.
LADDER: tuple[Stage, ...] = (
    Stage("furnace", "화로 확보", _built("stone-furnace")),
    Stage("electronics", "전자공학 개통 (구리판 10)", _knows("electronics")),
    Stage("steam-power", "증기력 개통 (철판 50)", _knows("steam-power")),
    Stage("lab", "랩 설치", _built("lab")),
    Stage("power", "전력 공급", _built("steam-engine")),
    Stage("red-science", "빨간 과학팩 생산", _has("automation-science-pack", 10)),
    Stage("automation", "자동화 연구", _knows("automation")),
    Stage("assembler", "조립기 가동", _built("assembling-machine-1")),
    # 여기서부터는 아직 무리가 스스로 못 간다. 적어두는 건 목표가 로켓이라는
    # 걸 잊지 않기 위해서다.
    Stage("belts", "벨트 물류", _built("transport-belt"), automated=False),
    Stage("green-science", "초록 과학팩", _has("logistic-science-pack", 10), automated=False),
    Stage("oil", "석유 처리", _built("oil-refinery"), automated=False),
    Stage("rocket", "로켓 발사", _built("rocket-silo"), automated=False),
)

GOAL = "로켓 발사"


def stage_of(snap: Any) -> Stage:
    """지금 서 있는 단. 못 오른 것 중 가장 아래."""
    for stage in LADDER:
        if not stage.reached(snap):
            return stage
    return LADDER[-1]


def progress(snap: Any) -> tuple[int, int]:
    """(오른 단 수, 전체 단 수)."""
    done = sum(1 for stage in LADDER if stage.reached(snap))
    return done, len(LADDER)


def briefing(snap: Any) -> str:
    """무리가 채팅에 거는 한 줄. 지금 어디고 다음이 뭔지."""
    here = stage_of(snap)
    done, total = progress(snap)
    tail = "" if here.automated else " (아직 수동)"
    return f"목표 {GOAL} — {done}/{total}단계. 지금은 «{here.title}»{tail}"


# --------------------------------------------------------------- 요청 게시판


@dataclass
class Request:
    """혼자서는 못 채우는 부족분. 게시판에 붙여두면 누가 가져간다."""
    asker: str
    item: str
    count: int
    reason: str
    posted: float
    helper: str | None = None
    filled: bool = False

    @property
    def open(self) -> bool:
        return self.helper is None and not self.filled


REQUEST_TTL = 300.0     # 아무도 안 집으면 5분 뒤 내린다
CLAIM_TTL = 240.0       # 집어놓고 안 가져오면 4분 뒤 놓아준다


class Board:
    """부탁이 오가는 곳.

    중복 게시를 막는 게 이 클래스의 절반이다. 매 틱 «석탄이 없다»를 다시
    깨닫는 에이전트는 매 틱 같은 부탁을 붙이고, 그러면 채팅이 같은 줄로
    가득 차서 사람이 게임을 못 본다.
    """

    def __init__(self) -> None:
        self.requests: list[Request] = []

    # -- 붙이고 떼고 ------------------------------------------------------

    def find(self, asker: str, item: str) -> Request | None:
        for req in self.requests:
            if req.asker == asker and req.item == item and not req.filled:
                return req
        return None

    def post(self, asker: str, item: str, count: int, reason: str,
             now: float) -> Request | None:
        """새 부탁. 같은 사람이 같은 물건을 이미 부탁했으면 None."""
        if self.find(asker, item):
            return None
        req = Request(asker, item, count, reason, now)
        self.requests.append(req)
        return req

    def waiting_for(self, asker: str) -> list[Request]:
        return [r for r in self.requests if r.asker == asker and not r.filled]

    def expire(self, now: float) -> list[Request]:
        """시효가 지난 것들을 정리하고, 내려간 부탁을 돌려준다."""
        dropped: list[Request] = []
        kept: list[Request] = []
        for req in self.requests:
            if req.filled:
                continue
            if req.helper is not None:
                # 집어간 사람이 소식이 없으면 다시 열어둔다. 도중에 죽었거나
                # 다른 명령을 받았을 수 있고, 그동안 부탁한 쪽은 굶는다.
                if now - req.posted > CLAIM_TTL:
                    req.helper = None
                    req.posted = now
                kept.append(req)
            elif now - req.posted > REQUEST_TTL:
                dropped.append(req)
            else:
                kept.append(req)
        self.requests = kept
        return dropped

    # -- 집기 -------------------------------------------------------------

    def offer(self, helper: str, stock: dict[str, int]) -> Request | None:
        """이 에이전트가 지금 당장 채워줄 수 있는 부탁 중 가장 오래된 것.

        이미 손에 쥔 것부터 찾는다. 창고도 벨트도 없는 단계에서 협력이
        성립하는 유일한 방법은 «가진 사람이 갖다주는 것»이라서다.
        """
        best: Request | None = None
        for req in self.requests:
            if not req.open or req.asker == helper:
                continue
            if stock.get(req.item, 0) < req.count:
                continue
            if best is None or req.posted < best.posted:
                best = req
        return best

    def errand(self, helper: str) -> Request | None:
        """가진 사람이 없을 때, 캐다 줄 수 있는 부탁."""
        best: Request | None = None
        for req in self.requests:
            if not req.open or req.asker == helper:
                continue
            if best is None or req.posted < best.posted:
                best = req
        return best

    def take(self, req: Request, helper: str, now: float) -> None:
        req.helper = helper
        req.posted = now

    def fill(self, req: Request) -> None:
        req.filled = True
        if req in self.requests:
            self.requests.remove(req)

    def release(self, helper: str) -> None:
        """이 에이전트가 집었던 것들을 도로 열어둔다."""
        for req in self.requests:
            if req.helper == helper:
                req.helper = None

    # -- 보여주기 ---------------------------------------------------------

    def summary(self) -> list[str]:
        lines = []
        for req in self.requests:
            who = f"→ {req.helper}" if req.helper else "대기"
            lines.append(f"{req.asker}: {req.item} x{req.count} ({who})")
        return lines


# ----------------------------------------------------------------- 부족분


def shortfall(needs: dict[str, int], stock: dict[str, int]) -> tuple[str, int] | None:
    """가장 모자란 재료 하나. 없으면 None.

    한 번에 하나만 돌려주는 건, 부탁 하나에 심부름 하나가 대응해야 누가
    무엇을 가져오는 중인지 셀 수 있기 때문이다.
    """
    worst: tuple[str, int] | None = None
    for item, want in needs.items():
        missing = want - stock.get(item, 0)
        if missing <= 0:
            continue
        if worst is None or missing > worst[1]:
            worst = (item, missing)
    return worst

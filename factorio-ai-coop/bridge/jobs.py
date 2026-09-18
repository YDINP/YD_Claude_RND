"""일감 한 건의 생김새, 그리고 일감을 사람 말로 옮기는 법."""

from __future__ import annotations


from dataclasses import dataclass, field


Step = tuple[str, dict]


Intent = tuple[str, dict]


@dataclass
class Job:
    """One piece of work: either a queue of tasks, or a named routine.

    Automation cannot be expressed as a fixed step list - where the chest goes
    depends on what the drill says after it is built - so it is named here and
    carried out by the crew.

    `key` is what makes a crew a crew rather than a crowd. Two agents may not
    hold the same key at once, so the second one moves down the list instead of
    walking to the same ore tile as the first.
    """
    narration: str
    steps: list[Step] = field(default_factory=list)
    routine: str | None = None
    ore: str | None = None
    key: str = ""
    # 이 일이 먹는 재료. 모자라면 동료에게 부탁할 근거가 된다.
    needs: dict[str, int] = field(default_factory=dict)
    # 루틴이 손봐야 할 자리. 어느 채굴기인지 같은 것.
    at: dict | None = None
    # 이 일을 할 수 있는 사람이 정해져 있을 때. 가방을 부리는 일과, 주머니에
    # 든 것을 넣는 일이 그렇다 - 가장 가까운 사람이 아니라 «가진 사람»이
    # 해야 한다. 그 사람이 지금 바쁘면 이 일감은 다음 배차를 기다린다.
    owner: str | None = None


# 태스크 이름은 사람이 쓰는 말이 아니다. 배정표에 «mine x8»이라고 적으면
# 읽는 쪽에서 다시 번역해야 한다.
STEP_WORDS = {
    "mine": "채굴", "place": "건설", "insert": "넣기", "take": "꺼내기",
    "craft": "제작", "walk": "이동", "chop": "벌목", "demolish": "철거",
    "give": "전달", "rotate": "방향 전환", "drop": "내려놓기",
}


def errand_label(steps: list) -> str:
    """맡긴 일을 사람이 읽을 수 있는 한 줄로 줄인다."""
    parts: list[str] = []
    for kind, params in steps:
        word = STEP_WORDS.get(kind, kind)
        what = params.get("name") or params.get("item") or params.get("ore")
        parts.append(f"{what} {word}" if what else word)
    squashed: list[str] = []
    for part in parts:
        if squashed and squashed[-1].startswith(part):
            count = squashed[-1][len(part):].strip("x ") or "1"
            squashed[-1] = f"{part} x{int(count) + 1}"
        else:
            squashed.append(part)
    return ", ".join(squashed[:4]) + (" …" if len(squashed) > 4 else "")


def blocked_by(answer: dict) -> tuple[str, list[tuple[str, int]]]:
    """계획이 어디서 막혔는지 «이유 한 마디»와 «모자란 목록»으로 나눈다.

    "못 구했습니다"는 보고가 아니다. 게임은 이미 무엇이 왜 모자란지 세 갈래로
    나눠서 답해준다 - 땅에서 캐야 하는 것(mine), 연구가 먼저인 것(locked),
    손으로는 못 만드는 것(blocked). 그 셋을 구분하지 않으면 다음에 무엇을
    할지도 정할 수 없다. 캘 수 있는 것이면 캐면 되고, 잠긴 것이면 캐봐야
    소용없다.
    """
    for key, why in (("locked", "연구가 먼저입니다"),
                     ("blocked", "손으로는 못 만듭니다"),
                     ("mine", "땅에서 캐와야 합니다")):
        short = {k: int(v) for k, v in (answer.get(key) or {}).items() if v}
        if short:
            return why, sorted(short.items())
    return "이유를 모르겠습니다", []

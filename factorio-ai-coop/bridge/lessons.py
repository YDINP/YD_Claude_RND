"""요원의 수첩. 해본 것과 그 결과를 적고, 다음 생각에 넣는다.

사용자: "각자 끊임없이 추론고도화를 진행해서 행동을 스스로학습하고
고도화하도록"

학습이라고 부를 만한 것이 되려면 세 가지가 있어야 한다.

    적는다    무엇을 하려 했고 어떻게 됐는가. 안 적으면 다음에 또 한다.
    읽는다    다음 생각의 프롬프트에 들어간다. 안 읽으면 적은 적 없는 것과 같다.
    줄인다    스무 줄이 넘으면 스스로 규칙으로 압축한다. 안 줄이면 프롬프트가
              일지가 되고, 일지는 읽히지 않는다.

셋째가 「고도화」다. 겪은 것을 그대로 쌓는 것은 기억이지 배움이 아니다.
겪은 것에서 «다음에 쓸 수 있는 한 줄»을 뽑아낼 때 배움이 된다.

수첩은 파일로 남는다. 판이 끝나도 규칙은 남아야 한다 - 매 판 같은 것을
다시 배우면 그것은 배운 것이 아니다.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESK = os.path.join(ROOT, ".omc", "minds")

# 프롬프트에 넣을 최근 기록 수. 너무 많으면 규칙이 묻힌다.
RECENT = 8
# 이만큼 쌓이면 스스로 줄인다.
DISTIL_AT = 20
# 규칙은 이만큼까지만. 넘으면 다음 압축 때 더 줄이라고 시킨다.
MAX_RULES = 12


@dataclass
class Entry:
    do: str
    args: dict
    ok: bool
    why: str = ""
    at: float = 0.0

    def line(self) -> str:
        mark = "○" if self.ok else "×"
        what = ", ".join(f"{k}={v}" for k, v in sorted(self.args.items()))
        tail = f" — {self.why}" if self.why else ""
        return f"{mark} {self.do}({what}){tail}"


class Journal:
    """한 사람의 수첩. 파일 두 장으로 산다.

        {name}.jsonl        겪은 것. 줄 단위로 덧붙인다.
        {name}-rules.md     줄여낸 것. 통째로 다시 쓴다.
    """

    def __init__(self, name: str) -> None:
        self.name = name
        self.entries: list[Entry] = []
        self.rules: str = ""
        self._since_distil = 0
        os.makedirs(DESK, exist_ok=True)
        self._load()

    # -- 자리 ------------------------------------------------------------

    @property
    def log_path(self) -> str:
        return os.path.join(DESK, f"{self.name}.jsonl")

    @property
    def rules_path(self) -> str:
        return os.path.join(DESK, f"{self.name}-rules.md")

    def _load(self) -> None:
        try:
            with open(self.rules_path, encoding="utf-8") as fh:
                self.rules = fh.read().strip()
        except OSError:
            self.rules = ""
        try:
            with open(self.log_path, encoding="utf-8") as fh:
                rows = [json.loads(line) for line in fh if line.strip()]
        except (OSError, json.JSONDecodeError):
            rows = []
        # 지난 판의 일지를 통째로 읽을 이유는 없다. 규칙이 그 자리를 대신한다.
        for row in rows[-RECENT:]:
            try:
                self.entries.append(Entry(**row))
            except TypeError:
                continue

    # -- 적기 ------------------------------------------------------------

    def note(self, do: str, args: dict, ok: bool, why: str = "") -> None:
        entry = Entry(do=do, args=dict(args or {}), ok=bool(ok),
                      why=(why or "")[:120], at=time.time())
        self.entries.append(entry)
        self._since_distil += 1
        try:
            with open(self.log_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry.__dict__, ensure_ascii=False) + "\n")
        except OSError:
            pass

    # -- 읽기 ------------------------------------------------------------

    def brief(self) -> str:
        """다음 생각에 넣을 것. 규칙이 먼저, 최근 기록이 그다음."""
        out = []
        if self.rules:
            out.append("[내가 배운 것]\n" + self.rules)
        if self.entries:
            out.append("[최근에 해본 것]\n" + "\n".join(
                "  " + e.line() for e in self.entries[-RECENT:]))
        return "\n\n".join(out)

    # -- 줄이기 ----------------------------------------------------------

    @property
    def ripe(self) -> bool:
        """줄일 때가 됐는가."""
        return self._since_distil >= DISTIL_AT

    def distil_prompt(self) -> str:
        return (
            f"너는 Factorio 를 플레이하는 AI 캐릭터 «{self.name}» 이다.\n"
            "아래는 네가 여태 해본 것과 그 결과다(○ 성공, × 실패).\n"
            "여기서 «다음에 쓸 수 있는 규칙»만 뽑아내라.\n\n"
            "규칙은 이런 모양이어야 한다:\n"
            "  - 무엇을 언제 하면 되는지, 또는 무엇을 언제 하면 안 되는지\n"
            "  - 한 줄에 하나, 열두 줄 이내\n"
            "  - 「그때 그랬다」가 아니라 「이럴 때는 이렇게」로\n\n"
            "한 번뿐인 우연은 규칙이 아니다. 두 번 이상 같은 모양으로 나타난 것만 적어라.\n"
            "출력은 규칙 목록만. 머리말도 맺음말도 붙이지 마라.\n\n"
            + ("[이미 배운 것 — 아직 맞으면 남기고, 틀렸으면 고쳐라]\n"
               + self.rules + "\n\n" if self.rules else "")
            + "[해본 것]\n"
            + "\n".join("  " + e.line() for e in self.entries[-DISTIL_AT * 2:])
        )

    def learn(self, text: str) -> bool:
        """압축된 규칙을 받아 적는다. 받아들였으면 True."""
        text = (text or "").strip()
        if not text:
            return False
        kept = [ln.rstrip() for ln in text.splitlines()
                if ln.strip().startswith(("-", "*", "•"))][:MAX_RULES]
        if not kept:
            # 못 받아들였어도 «세는 것은 되돌린다».
            #
            # 되돌리지 않으면 `ripe` 가 영영 참이고, 그 사람은 매 순찰
            # 압축만 다시 띄우며 «다시는 생각하지 못한다». 모델이 형식을
            # 한 번 어기거나 CLI 가 한 번 죽는 것으로 요원 하나가 영구히
            # 벙어리가 된다.
            #
            # 다만 0 으로 되돌리지는 않는다. 그러면 다음 스무 번 뒤에
            # 같은 실패를 또 한다. 절반만 되돌려 다음 시도를 미룬다.
            self._since_distil = DISTIL_AT // 2
            return False
        self.rules = "\n".join(kept)
        self._since_distil = 0
        try:
            with open(self.rules_path, "w", encoding="utf-8") as fh:
                fh.write(self.rules + "\n")
        except OSError:
            pass
        return True

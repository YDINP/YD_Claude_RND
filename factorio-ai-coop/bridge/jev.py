"""Jev (TypeSafe AI "System 1") - 실시간 결정 층.

    사용자: "캐릭터가 실시간으로 체크하고 행동해야하는 로직은 jev로 구현해둘 것."

Jev 는 문장을 쓰지 않는다. 상태(state) 와 질문(questions) 을 받아 선택지마다 확률 · 신뢰도를 돌려준다
(2026-09-15 공개, 반초 안팎). 게임 루프 안의 작은 결정 - 도망칠까 · 계속할까 · 들어가도 되나 - 에 맞다.

    POST https://api.typesafe.ai/v1/systemone
    {"model": "jev-latest", "state": "...", "questions": {"k": {"type": "choice", "instructions": "...", "options": [...]}}}
    질문 종류: choice (선택지별 확률 + confidence) · score (순서 등급) · noul (예/아니오 확률)

키: 환경변수 TYPESAFE_API_KEY (없으면 ~/.typesafe_key 첫 줄). 코드·저장소에 두지 않는다.
키가 없거나 호출이 실패하면 «같은 모양» 으로 답하는 로컬 규칙 (fallback) 이 대신한다 - 부르는 쪽은 차이를 모른다.
응답의 source 가 "jev" 인지 "rules" 인지로만 구분한다.

    from jev import Jev, Choice, Noul
    jev = Jev()
    out = jev.decide("hp 120/250, 적 6 (중형 바이터 4) 12칸", {"act": Choice("무엇을 할까", ["continue", "retreat", "fight"])},
                     fallback=lambda: {"act": {"retreat": 0.9, "continue": 0.1, "fight": 0.0}})
    out["act"].best, out["act"].p, out["act"].confidence, out.source
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-latest"
TIMEOUT = 2.0          # 실시간 루프 - 이보다 늦으면 규칙으로 답한다
COOLDOWN = 30.0        # 실패 뒤 이 동안은 부르지 않는다 (가입 중지 · 망 끊김에 초마다 두드리지 않게)


def _key() -> str | None:
    k = os.environ.get("TYPESAFE_API_KEY")
    if k:
        return k.strip()
    try:
        with open(os.path.expanduser("~/.typesafe_key"), encoding="utf-8") as f:
            return f.readline().strip() or None
    except OSError:
        return None


@dataclass
class Choice:
    instructions: str
    options: list[str]

    def body(self) -> dict:
        return {"type": "choice", "instructions": self.instructions, "options": list(self.options)}


@dataclass
class Noul:
    instructions: str

    def body(self) -> dict:
        return {"type": "noul", "instructions": self.instructions}


@dataclass
class Answer:
    probs: dict[str, float]            # choice: 선택지별 · noul: {"yes": p, "no": 1-p}
    confidence: float = 1.0

    @property
    def best(self) -> str:
        return max(self.probs, key=self.probs.get)

    @property
    def p(self) -> float:
        return self.probs[self.best]

    def of(self, option: str) -> float:
        return self.probs.get(option, 0.0)


@dataclass
class Result:
    answers: dict[str, Answer] = field(default_factory=dict)
    source: str = "rules"
    ms: float = 0.0

    def __getitem__(self, k: str) -> Answer:
        return self.answers[k]


def _parse(q, raw) -> Answer:
    """Jev 응답 한 항목 -> Answer. 형식이 조금 달라도 (probabilities / distribution / noul) 읽는다."""
    if isinstance(q, Noul):
        p = raw.get("noul", raw.get("probability", raw.get("p")))
        p = float(p)
        return Answer({"yes": p, "no": 1 - p}, float(raw.get("confidence", abs(p - 0.5) * 2)))
    probs = raw.get("probabilities") or raw.get("distribution") or raw.get("choices") or {}
    if isinstance(probs, list):
        probs = {d.get("option") or d.get("label"): d.get("probability", d.get("p")) for d in probs}
    probs = {str(k): float(v) for k, v in probs.items() if k in q.options}
    if not probs and raw.get("choice") in q.options:
        probs = {raw["choice"]: 1.0}
    return Answer(probs, float(raw.get("confidence", max(probs.values()) if probs else 0.0)))


class Jev:
    def __init__(self, key: str | None = None):
        self.key = key or _key()
        self.down_until = 0.0
        self.calls = self.fails = 0
        self.last_error = ""

    @property
    def live(self) -> bool:
        return bool(self.key) and time.time() >= self.down_until

    def decide(self, state: str, questions: dict, fallback) -> Result:
        """questions: {키: Choice | Noul}. fallback(): {키: {선택지: 확률}} - Jev 가 없거나 늦으면 이것."""
        t0 = time.time()
        if self.live:
            try:
                raw = self._post(state, questions)
                out = Result({k: _parse(q, raw[k]) for k, q in questions.items()}, "jev", (time.time() - t0) * 1000)
                self.calls += 1
                return out
            except (urllib.error.URLError, TimeoutError, KeyError, ValueError, TypeError, OSError) as e:
                self.fails += 1
                self.last_error = f"{type(e).__name__}: {e}"[:200]
                self.down_until = time.time() + COOLDOWN
        fb = fallback()
        answers = {}
        for k, q in questions.items():
            probs = fb[k]
            if isinstance(q, Noul) and not isinstance(probs, dict):
                probs = {"yes": float(probs), "no": 1 - float(probs)}
            answers[k] = Answer(dict(probs), max(probs.values()))
        return Result(answers, "rules", (time.time() - t0) * 1000)

    def _post(self, state: str, questions: dict) -> dict:
        body = json.dumps({"model": MODEL, "state": state,
                           "questions": {k: q.body() for k, q in questions.items()}}).encode("utf-8")
        req = urllib.request.Request(URL, data=body, method="POST", headers={
            "Content-Type": "application/json", "Authorization": f"Bearer {self.key}"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.loads(r.read().decode("utf-8"))
        return data.get("answers", data) if isinstance(data, dict) else {}

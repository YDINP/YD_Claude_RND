"""요원 한 사람의 머리.

사용자: "각 캐릭터들을 1개씩 sonnet5모델의 CLI를 달아서 직접 생각하고
행동하도록 다시 바꿔주는데, 심시티건설은 메인반장에게 물어보고 진행할 것.
현재 큰 작업을 토대로 어떻게 작업을 진행해야하는지 생각하며 하도록"

두 가지가 같이 있어야 한다. 각자 생각하되, 도시는 한 사람이 그린다.

이 저장소는 그 둘을 번갈아 틀렸다. 각자 고르게 두었더니 여덟이 각자
사다리를 보고 같은 칸을 골라 한 바위에 몰렸고, 반장이 전부 쥐게 했더니
배차 주기 사이에 다섯이 서 있었다. 둘 다 «권한의 종류»를 안 나눈 탓이다.

    무엇을 할 것인가   머리가 정한다. 상황을 보고 스스로.
    어디에 지을 것인가 반장이 정한다. 도시는 한 장의 그림이라야 한다.

그래서 머리는 «좌표를 말하지 못한다». 짓겠다는 뜻(intent)만 내놓고,
자리는 반장이 준다. 규칙으로 부탁하는 것이 아니라 구조로 막는 것이다 -
모델에게 「좌표를 지어내지 마라」고 적어두는 것만으로는 여러 번 샜다.

생각은 느리다(`claude -p` 한 번에 몇 초). 순찰은 1초마다 돌므로 여기서
기다리면 게임이 멈춘다. 그래서 «다른 실»에서 생각하고, 끝난 것만 집어간다.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
from dataclasses import dataclass, field
from typing import Any

# 머리가 낼 수 있는 뜻. 이 밖의 것은 버린다.
#
# 「좌표」가 없는 것에 주의. 자리는 반장이 준다.
DOINGS = {
    "build":  {"what"},              # 무엇을 세울지. 자리는 반장이 준다.
    "mine":   {"ore", "count"},      # 어느 광석을 얼마나. 자리는 제 눈으로.
    "craft":  {"recipe", "count"},
    "smelt":  {"ore", "count"},      # 가장 가까운 화로에 넣는다.
    "collect": {"item"},             # 가장 가까운 화로에서 꺼낸다.
    "follow": set(),                 # 반장의 판단을 따른다. 모르겠을 때.
}

MAX_COUNT = 200


@dataclass
class Thought:
    """머리가 내놓은 것. 말 한 줄과 뜻 하나.

    `rules` 가 차 있으면 그것은 «줄여낸 규칙»이고 뜻이 아니다. 같은 머리가
    두 가지 일을 하므로 답이 두 가지다 - 무엇을 할지 정하는 일과, 여태
    해본 것을 규칙으로 줄이는 일.
    """
    say: str = ""
    do: str = "follow"
    args: dict = field(default_factory=dict)
    rules: str = ""


BRIEF = """\
너는 Factorio 2.0 멀티플레이 서버에서 일하는 AI 캐릭터 «{name}» 이다.
동료 여러 명과 함께 로켓 발사를 목표로 공장을 짓고 있다.

지금 무엇을 할지 «스스로» 정해라. 아래 [큰 그림]과 [내 상황]을 함께 보고,
지금 이 공장에서 가장 병목인 곳을 풀어라.

출력은 JSON 하나만. 설명도 코드펜스도 붙이지 마라.

{{"say": "동료에게 할 말 (한국어 한 문장)", "do": "...", "args": {{...}}}}

고를 수 있는 것은 이것뿐이다:

  {{"do":"build",   "args":{{"what":"stone-furnace"}}}}
      세운다. **자리는 적지 마라** - 반장이 도시 설계에 맞춰 정해준다.
      what 은 stone-furnace / burner-mining-drill / wooden-chest /
      burner-inserter / lab / gun-turret 중 하나.

  {{"do":"mine",    "args":{{"ore":"coal","count":30}}}}
      손으로 캔다. 채굴기가 있거나 만들 수 있으면 이것 말고 build 를 골라라.
      사람이 한 시간 캐는 것보다 채굴기 한 대가 낫다.

  {{"do":"craft",   "args":{{"recipe":"iron-gear-wheel","count":5}}}}
  {{"do":"smelt",   "args":{{"ore":"iron-ore","count":20}}}}
      가장 가까운 화로에 광석과 석탄을 넣는다.
  {{"do":"collect", "args":{{"item":"iron-plate"}}}}
      가장 가까운 화로에서 판금을 꺼낸다.
  {{"do":"follow",  "args":{{}}}}
      판단이 안 서면 이것. 반장의 규칙이 대신 고른다. 부끄러운 선택이 아니다.

판단의 기준, 위에서부터:

  1. 살아 있기. 적이 가까우면 무엇도 의미가 없다.
  2. 멈춘 것 살리기. 이미 선 기계가 연료나 재료가 없어 서 있으면 그것부터.
     새 기계를 세우는 것보다 언제나 싸다.
  3. 끊긴 칸 뚫기. [큰 그림]의 「사슬이 끊긴 곳」이 지금 공장의 병목이다.
     그 칸의 «바로 위»를 채워라. 아래를 더 캐봐야 안 흐른다.
  4. 이미 넘치는 것은 더 만들지 않기. 광석이 쌓여 있는데 판금이 안 나오면
     모자란 것은 광석이 아니라 화로다.
  5. 동료와 겹치지 않기. [동료]가 하는 일과 다른 것을 골라라.

{extra}
"""


def _clip(n: Any, top: int = MAX_COUNT) -> int:
    try:
        return max(1, min(top, int(n)))
    except (TypeError, ValueError):
        return 1


def _extract_json(text: str) -> dict | None:
    """모델이 말을 덧붙여도 JSON만 건진다."""
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(),
                  flags=re.MULTILINE).strip()
    try:
        got = json.loads(text)
        return got if isinstance(got, dict) else None
    except json.JSONDecodeError:
        pass
    depth, start = 0, None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    got = json.loads(text[start:i + 1])
                    if isinstance(got, dict):
                        return got
                except json.JSONDecodeError:
                    pass
                start = None
    return None


def read(payload: dict | None) -> Thought:
    """모델이 내놓은 것을 «믿지 않고» 읽는다.

    모르는 뜻, 모르는 열쇠, 범위 밖의 수는 조용히 버린다. 버린 자리는
    `follow` 가 메운다 - 아무것도 안 하는 것보다 규칙을 따르는 편이 낫다.
    """
    if not payload:
        return Thought()
    say = payload.get("say")
    say = say.strip()[:200] if isinstance(say, str) else ""

    do = payload.get("do")
    if not isinstance(do, str) or do not in DOINGS:
        return Thought(say=say)

    raw = payload.get("args")
    raw = raw if isinstance(raw, dict) else {}
    args: dict = {}
    for k in DOINGS[do]:
        if k not in raw:
            continue
        v = raw[k]
        if k == "count":
            args[k] = _clip(v)
        elif isinstance(v, str) and v.strip():
            args[k] = v.strip()[:60]

    # 이름이 있어야 뜻이 되는 것들.
    need = {"build": "what", "mine": "ore", "craft": "recipe",
            "smelt": "ore", "collect": "item"}.get(do)
    if need and need not in args:
        return Thought(say=say)
    return Thought(say=say, do=do, args=args)


class _Done:
    """`subprocess.run` 의 결과처럼 생긴 것. 아래 코드를 안 바꾸려는 것뿐이다."""

    def __init__(self, out: str) -> None:
        self.stdout = out or ""
        self.returncode = 0


def _kill_tree(pid: int) -> None:
    """이 프로세스와 그 아래를 전부 죽인다.

    윈도에서는 `taskkill /T` 가 자식까지 맡는다. 없거나 실패하면 최소한
    당사자는 죽인다 - 아무것도 안 하는 것보다 낫다.
    """
    try:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                       capture_output=True, timeout=10)
        return
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        pass
    try:
        os.kill(pid, 9)
    except OSError:
        pass


class Mind:
    """한 사람 몫의 머리. 다른 실에서 생각하고, 끝난 것만 내준다."""

    def __init__(self, name: str, model: str, cli: str = "claude",
                 timeout: float = 60.0) -> None:
        self.name = name
        self.model = model
        self.cli = cli
        self.timeout = timeout
        self._thread: threading.Thread | None = None
        self._answer: Thought | None = None
        self._lock = threading.Lock()

    # -- 생각하고 있는가 --------------------------------------------------

    @property
    def thinking(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start_distil(self, prompt: str) -> bool:
        """겪은 것을 규칙으로 줄이라고 시킨다.

        생각과 같은 머리, 같은 실을 쓴다. 한 사람이 동시에 두 가지를
        생각하지는 않는다 - 그리고 줄이는 동안 그 사람은 규칙이 고른
        일을 한다.
        """
        if self.thinking:
            return False
        with self._lock:
            self._answer = None
        self._thread = threading.Thread(
            target=self._run, args=(prompt, True), daemon=True)
        self._thread.start()
        return True

    def start(self, big_picture: str, mine: str, extra: str = "") -> bool:
        """생각을 시작한다. 이미 생각 중이면 False."""
        if self.thinking:
            return False
        with self._lock:
            self._answer = None
        prompt = (BRIEF.format(name=self.name, extra=extra)
                  + "\n[큰 그림]\n" + big_picture
                  + "\n\n[내 상황]\n" + mine + "\n")
        self._thread = threading.Thread(
            target=self._run, args=(prompt, False), daemon=True)
        self._thread.start()
        return True

    def take(self) -> Thought | None:
        """생각이 끝났으면 가져간다. 한 번만 준다."""
        if self.thinking:
            return None
        with self._lock:
            got, self._answer = self._answer, None
        return got

    # -- 실제로 부르는 곳 -------------------------------------------------

    def _run(self, prompt: str, distilling: bool = False) -> None:
        argv = [self.cli, "-p", prompt, "--output-format", "text",
                "--model", self.model]
        # 시간이 다 되면 «자식의 자식까지» 죽인다.
        #
        # `subprocess.run(timeout=)` 은 바로 아래 자식만 죽인다. 그런데
        # claude 는 node 를 띄우고 그 node 가 기가바이트를 쥔다. 위만
        # 죽이면 아래는 부모 없는 채로 살아남는다.
        #
        # 실측으로는 아직 그렇게 샌 적이 없지만(고아 0개), 샐 수 있는
        # 구조를 두고 「아직 안 샜다」에 기대지 않는다 - 한 번 새면
        # 기가바이트 단위다.
        try:
            proc = subprocess.Popen(argv, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, text=True,
                                    encoding="utf-8", errors="replace")
        except (FileNotFoundError, OSError):
            return
        try:
            out, _ = proc.communicate(timeout=self.timeout)
        except subprocess.TimeoutExpired:
            _kill_tree(proc.pid)
            try:
                proc.communicate(timeout=5)
            except Exception:
                pass
            return
        except (OSError, ValueError):
            _kill_tree(proc.pid)
            return
        if proc.returncode != 0:
            return
        done = _Done(out)
        if done.returncode != 0:
            return
        out = done.stdout or ""
        with self._lock:
            self._answer = (Thought(rules=out.strip()[:2000]) if distilling
                            else read(_extract_json(out)))

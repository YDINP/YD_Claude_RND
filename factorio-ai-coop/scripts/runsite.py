"""회차 설정 파일 (state/{run}_site.json) 을 읽는 한 곳.

회차 이름은 이 순서로 정한다 (앞에 있는 것이 이긴다):
    1. 명령줄 `--run run24` (또는 `--run=run24`) - 스크립트의 argparse 와 따로, 여기서 먼저 뽑는다
    2. 환경 변수 AI_RUN
    3. 기본값 run23 (23회차 스크립트가 그대로 돌게 - 하위 호환)

`--run` 은 sys.argv 에서 지워 두므로 각 스크립트의 argparse 가 모르는 인자로 죽지 않는다.
뽑은 이름은 AI_RUN 에도 넣는다 - 자식 모듈 (p1 · coldstart) 이 같은 회차를 본다.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = "run23"


def _pop_run_arg() -> str:
    argv = sys.argv
    for i, a in enumerate(list(argv)):
        if a == "--run" and i + 1 < len(argv):
            val = argv[i + 1]
            del argv[i:i + 2]
            return val
        if a.startswith("--run="):
            del argv[i]
            return a.split("=", 1)[1]
    return ""


RUN = _pop_run_arg() or os.environ.get("AI_RUN") or DEFAULT
os.environ["AI_RUN"] = RUN


def path(kind: str = "site") -> str:
    return os.path.join(HERE, "..", "state", f"{RUN}_{kind}.json")


def load() -> dict:
    return json.load(open(path("site"), encoding="utf-8"))


def center(default=(0.0, 0.0)) -> tuple:
    """기지 중심. 파일에 center 가 없으면 hub, 그것도 없으면 default."""
    try:
        s = load()
    except (OSError, ValueError):
        return tuple(default)
    return tuple(s.get("center") or s.get("hub") or default)

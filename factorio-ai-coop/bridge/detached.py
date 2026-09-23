"""People on a sortie belong to the sortie. Nobody else gives them orders.

실측(21회차, 동쪽 밀기): hotel·bravo·alpha 가 포탑 열 (106,82) 에 서려는 순간마다
danger 루프가 「무리에 적 0/13 - 하던 일을 끊고 부른다」로 셋을 집으로 돌렸다.
네 파 내리 포탑 0/12. 둥지 둘레엔 «늘» 열 마리가 서 있다 - 그것을 세면 밀기는
영영 못 한다. 서쪽 둥지가 됐던 건 지키는 놈이 적었을 뿐이다.

루프는 열네 개고 저마다 «손이 비었나»만 본다. 파와 파 사이에 손이 비면 drain 이
hotel 을, guard 가 bravo 를 데려간다. 그러니 «비었나»가 아니라 «누구 것인가»를 묻는다.

    detached.mark(["hotel", "bravo"], owner="creep", minutes=40)
    ... orders.submit 은 AI_OWNER 환경변수가 owner 와 같을 때만 보낸다 ...
    detached.release(["hotel", "bravo"])

파일 하나 (state/detached.json). 기한이 있어 밀기 스크립트가 죽어도 풀린다.
"""
from __future__ import annotations

import json
import os
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, "..", "state", "detached.json")
ENV = "AI_OWNER"


def _load() -> dict:
    try:
        with open(PATH, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    now = time.time()
    return {k: v for k, v in data.items() if float(v.get("until", 0)) > now}


def _save(data: dict) -> None:
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    tmp = PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh)
    os.replace(tmp, PATH)


def mark(names, owner: str, minutes: float = 40) -> None:
    data = _load()
    for n in names:
        data[n] = {"owner": owner, "until": time.time() + minutes * 60}
    _save(data)
    os.environ[ENV] = owner


def release(names) -> None:
    data = _load()
    for n in names:
        data.pop(n, None)
    _save(data)


def owner(name: str) -> str | None:
    v = _load().get(name)
    return v["owner"] if v else None


def mine(name: str) -> bool:
    """이 프로세스가 name 에게 지시해도 되나."""
    o = owner(name)
    return o is None or o == os.environ.get(ENV)


def active() -> dict:
    return {k: v["owner"] for k, v in _load().items()}

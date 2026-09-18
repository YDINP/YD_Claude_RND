"""Lua 파일에서 «선언보다 먼저 쓰인 지역 이름»을 찾는다.

Lua 의 `local` 은 그 줄 아래에서만 보인다. 위에서 같은 이름을 쓰면 오류가
아니라 조용히 nil 전역이 되고, 그 함수를 실제로 부르는 순간에야 터진다.
아무도 안 부르는 원격이면 영영 안 터지고, 그동안 «있는 줄 알았던 기능»이
없는 채로 돈다.

이 저장소에서만 세 번 겪었다:

  - TENDED / init_status_names   power_faults 와 health 가 400줄 위에서 썼다
  - blocks_lane                  blocking 원격이 417줄 위에서 썼다 - 그 원격은
                                 쓰인 적이 없어 한 번도 안 터졌다

문법 검사기(luac)가 없는 환경이라 여기서 대신 본다. 완벽한 파서는 아니지만,
주석과 문자열을 지운 뒤 «파일 전체 범위의 local 선언»만 보므로 이 실수는 전부
잡는다.

    python tests/lua_order.py
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "mods", "ai-bridge_0.3.0")
FILES = ("control.lua", "tasks.lua")

DECLARE = re.compile(r"^local\s+function\s+([A-Za-z_][\w]*)|^local\s+([A-Za-z_][\w]*)\s*=")
WORD = re.compile(r"[A-Za-z_][\w]*")

# 이 이름들은 뒤에서 선언되어도 괜찮다. 함수 «안»에서만 쓰이므로, 그 함수가
# 불릴 때는 이미 선언이 지나간 뒤다. 하지만 그 판단은 사람이 해야 하므로
# 여기 적어 두고, 적지 않은 것은 전부 잡는다.
ALLOWED: set[str] = set()


def strip_noise(text: str) -> list[str]:
    """주석과 문자열을 지운다 - 그 안의 낱말은 코드가 아니다."""
    text = re.sub(r"--\[\[.*?\]\]", "", text, flags=re.S)
    out = []
    for line in text.split("\n"):
        line = re.sub(r'"(?:\\.|[^"\\])*"', '""', line)
        line = re.sub(r"'(?:\\.|[^'\\])*'", "''", line)
        line = re.sub(r"--.*$", "", line)
        out.append(line)
    return out


def declarations(lines: list[str]) -> dict[str, int]:
    """파일 전체 범위(들여쓰기 없음)의 local 선언만. 함수 안 지역은 관계없다."""
    found: dict[str, int] = {}
    for n, line in enumerate(lines, 1):
        hit = DECLARE.match(line)
        if hit:
            name = hit.group(1) or hit.group(2)
            found.setdefault(name, n)
    return found


def check(path: str) -> list[str]:
    lines = strip_noise(open(path, encoding="utf-8").read())
    declared = declarations(lines)
    bad = []
    for n, line in enumerate(lines, 1):
        if DECLARE.match(line):
            continue
        for hit in WORD.finditer(line):
            word = hit.group(0)
            born = declared.get(word)
            if born is None or n >= born or word in ALLOWED:
                continue
            before = line[:hit.start()].rstrip()
            after = line[hit.end():].lstrip()
            if before.endswith(".") or before.endswith(":"):
                continue                      # b.health 는 필드지 지역이 아니다
            if after.startswith("=") and not after.startswith("=="):
                continue                      # health = ... 는 표 열쇠나 대입이다
            bad.append(f"{os.path.basename(path)}:{n}: "
                       f"'{word}' 를 {born}줄의 선언보다 먼저 쓴다")
    return bad


def main() -> int:
    trouble = []
    for name in FILES:
        path = os.path.join(ROOT, name)
        if os.path.exists(path):
            trouble += check(path)
    seen, unique = set(), []
    for line in trouble:                       # 같은 이름은 첫 줄만 말한다
        key = line.split("'")[1]
        if key not in seen:
            seen.add(key)
            unique.append(line)
    for line in unique:
        print("  [FAIL] " + line)
    print(f"\n{'0 problems' if not unique else str(len(unique)) + ' problems'}"
          f" - lua declaration order")
    return 1 if unique else 0


if __name__ == "__main__":
    sys.exit(main())

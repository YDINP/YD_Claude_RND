"""Lua 모듈들이 «이름을 찾을 수 있는가»를 본다. 두 가지를 검사한다.

Lua 에는 이름을 못 찾았다고 말해주는 것이 없다. 없는 이름은 오류가 아니라
조용히 nil 전역이 되고, 그 줄을 실제로 지나가는 순간에야 터진다. 아무도 안
부르는 원격이면 영영 안 터지고, 그동안 «있는 줄 알았던 기능»이 없는 채로 돈다.

  1. 선언보다 먼저 쓰는가
     `local` 은 그 줄 아래에서만 보인다. 위에서 쓰면 nil 이다.
     실제로 세 번 겪었다:
       TENDED / init_status_names   power_faults 와 health 가 400줄 위에서 썼다
       blocks_lane                  blocking 이 417줄 위에서 썼다 - 그 원격은
                                    쓰인 적이 없어 한 번도 안 터졌다

  2. 남의 모듈 이름을 가져오지 않고 쓰는가
     control.lua 를 아홉 모듈로 가른 뒤로는 이쪽이 더 잦은 실수다.
     require 해서 local 로 받아두지 않으면 역시 조용히 nil 이다.

문법 검사기(luac)가 없는 환경이라 여기서 대신 본다. 완벽한 파서는 아니지만,
주석과 문자열을 지운 뒤 «파일 범위의 선언»만 보므로 이 두 실수는 전부 잡는다.

    python tests/lua_order.py
"""

from __future__ import annotations

import glob
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..", "mods", "ai-bridge_0.3.0")

DECLARE = re.compile(r"^local\s+function\s+([A-Za-z_]\w*)"
                     r"|^local\s+([A-Za-z_][\w,\s]*?)\s*=")
WORD = re.compile(r"[A-Za-z_]\w*")
EXPORT = re.compile(r"^\s{2}([A-Za-z_]\w*)\s*=", re.M)

# 뒤에서 선언되어도 괜찮은 것이 있으면 여기 적는다. 적지 않은 것은 전부 잡는다.
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


def declared_names(lines: list[str]) -> dict[str, int]:
    """파일 전체 범위(들여쓰기 없음)의 local 선언. 한 줄에 여럿도 받는다."""
    found: dict[str, int] = {}
    for n, line in enumerate(lines, 1):
        hit = DECLARE.match(line)
        if not hit:
            continue
        for word in WORD.findall(hit.group(1) or hit.group(2) or ""):
            found.setdefault(word, n)
    return found


def field_access(line: str, at: int) -> bool:
    before = line[:at].rstrip()
    return before.endswith(".") or before.endswith(":")


def check_order(name: str, lines: list[str]) -> list[str]:
    born = declared_names(lines)
    bad = []
    for n, line in enumerate(lines, 1):
        if DECLARE.match(line):
            continue
        for hit in WORD.finditer(line):
            word = hit.group(0)
            where = born.get(word)
            if where is None or n >= where or word in ALLOWED:
                continue
            if field_access(line, hit.start()):
                continue
            after = line[hit.end():].lstrip()
            if after.startswith("=") and not after.startswith("=="):
                continue                   # 표 열쇠이거나 대입이다
            bad.append(f"{name}:{n}: '{word}' 를 {where}줄의 선언보다 먼저 쓴다")
    return bad


def exports_of(text: str) -> set[str]:
    """모듈 끝의 return 표에서 내보내는 이름들."""
    tail = text.rsplit("\nreturn {", 1)
    return set(EXPORT.findall(tail[1])) if len(tail) == 2 else set()


def main() -> int:
    paths = sorted(glob.glob(os.path.join(ROOT, "*.lua")))
    text = {os.path.basename(p): open(p, encoding="utf-8").read() for p in paths}
    clean = {name: strip_noise(body) for name, body in text.items()}

    trouble: list[str] = []
    for name, lines in clean.items():
        trouble += check_order(name, lines)

    # 어느 이름이 어느 모듈의 것인가.
    owner: dict[str, str] = {}
    for name, body in text.items():
        for word in exports_of(body):
            owner.setdefault(word, name)

    for name, lines in clean.items():
        mine = set(declared_names(lines))
        for n, line in enumerate(lines, 1):
            for hit in WORD.finditer(line):
                word = hit.group(0)
                home = owner.get(word)
                if home is None or home == name or word in mine:
                    continue
                if field_access(line, hit.start()):
                    continue
                trouble.append(f"{name}:{n}: '{word}' 는 {home} 것인데 "
                               f"require 해서 받아두지 않았다")

    seen, unique = set(), []
    for line in trouble:                       # 같은 파일의 같은 이름은 한 번만
        key = (line.split(":")[0], line.split("'")[1])
        if key not in seen:
            seen.add(key)
            unique.append(line)
    for line in unique:
        print("  [FAIL] " + line)
    print(f"\n{len(unique)} problems - lua name resolution ({len(paths)} files)")
    return 1 if unique else 0


if __name__ == "__main__":
    sys.exit(main())

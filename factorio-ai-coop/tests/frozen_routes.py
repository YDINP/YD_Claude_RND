"""길을 다시 계산할 이유가 새로 생기지 않았는지 지킨다.

이 저장소는 벨트 미로를 «세 번» 만들었다. 매번 모양이 조금씩 달랐을 뿐
뿌리는 하나다 - 길을 다시 계산할 이유를 하나 더 만들어놓는 것.

    1회  ore_line 이 막힐 때마다 길을 통째로 다시 찾았다.
         여덟이 각자 매 순찰 불렀으므로 순찰마다 새 길이 여덟 개.
         벨트 604칸 중 200칸이 길 밖이었다.

    2회  field_lines 가 `route_for` 를 안 쓰고 `walk` 을 직접 불렀다.
         얼려두는 자리가 없으니 부를 때마다 다른 답. want 가 42에서 31로
         왔다 갔다 했다.

    3회  field_lines 의 열쇠에 «채굴기 수»를 넣었다. 한 대 설 때마다 길이
         통째로 새로 났다. 116칸까지 줄었던 것이 170칸으로 되돌아갔다.

셋 다 시험으로는 안 잡혔다. 게임 없이는 길을 못 내기 때문이다. 그래서
«코드의 모양»을 본다. 길을 저장하는 자리(storage.lines)에 쓰는 열쇠가
«자리»말고 다른 것에 매여 있으면 그것이 다시 계산할 이유다.

    python tests/frozen_routes.py
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BELTS = os.path.join(ROOT, "mods", "ai-bridge_0.3.0", "belts.lua")

# storage.lines[key] = { ... } 에 넣어도 되는 것들.
#
#   tiles  길 그 자체
#   plan   길 찾는 «법»이 바뀌면 옛 길을 버린다. 이것만이 정당한 이유다.
#   goal   목적지가 옮겨갔으면 다른 길이다.
#   short/bends  잰 값. 판단에 안 쓴다.
ALLOWED = {"tiles", "plan", "goal", "short", "bends"}


def stored_fields() -> list[tuple[str, str]]:
    """storage.lines[...] = { ... } 에 담기는 항목 이름들."""
    text = open(BELTS, encoding="utf-8").read()
    out = []
    for hit in re.finditer(r"storage\.lines\[[^\]]+\]\s*=\s*\{([^}]*)\}", text):
        line = text[:hit.start()].count("\n") + 1
        for name in re.findall(r"(\w+)\s*=", hit.group(1)):
            out.append((f"belts.lua:{line}", name))
    return out


def rechecks() -> list[str]:
    """얼려둔 길을 쓸지 말지 고르는 조건에 쓰이는 이름들."""
    text = open(BELTS, encoding="utf-8").read()
    out = []
    for hit in re.finditer(r"if kept and([^\n]*(?:\n[^\n]*?)??)then", text):
        line = text[:hit.start()].count("\n") + 1
        for name in re.findall(r"kept\.(\w+)", hit.group(1)):
            out.append(f"belts.lua:{line} kept.{name}")
    return out


def main() -> int:
    bad = []
    for where, name in stored_fields():
        if name not in ALLOWED:
            bad.append(f"{where}: 길에 '{name}' 을(를) 같이 저장한다. "
                       f"저장한 것은 언젠가 비교에 쓰이고, 비교에 쓰이면 "
                       f"길을 버리는 이유가 된다")
    for one in rechecks():
        name = one.split("kept.")[-1]
        if name not in ALLOWED:
            bad.append(f"{one} 로 얼려둔 길을 버린다. 길은 자리와 "
                       f"길 찾는 법이 바뀔 때만 버려야 한다")

    for line in bad:
        print("  [FAIL] " + line)
    print(f"\n{len(bad)} problems - frozen routes stay frozen "
          f"({len(stored_fields())} stored fields checked)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

"""stonep2_23 진행 엿보기 (캐릭터 위치 · 현재 일 · golf 제작 대기열)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
from proboport23 import BODY  # noqa: E402

ai = AIBridge()
q = ai.lua("(function() " + BODY + " local b = body('golf') return {q = b and b.crafting_queue_size or -1} end)()")
print("golf 제작 대기", q)
for c in ai.list():
    cur = c.get("current")
    print(c["name"], "alive" if c.get("alive") else "DEAD", round(c.get("x", 0)), round(c.get("y", 0)), c.get("health"),
          (cur.get("type") if isinstance(cur, dict) else cur), "q%d" % len(c.get("queued") or {}))

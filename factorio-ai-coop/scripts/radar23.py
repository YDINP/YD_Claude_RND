"""레이더 2대 - 기지 중앙 (-44.5,-14.5) · 서쪽 방어선 뒤 (-99.5,-50.5). 사용자 요청 (2026-09-27).

지도는 옛 스냅샷이었다 (레이더 0, 산란기 304 중 보이는 것 2). 레이더는 주변 7x7 청크를 실시간으로,
반경 14 청크를 한 칸씩 다시 찍는다. 자리는 전봇대 공급 범위 안 · 벨트/팔 3칸 밖을 Lua 로 찾은 것.
"""
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402
from orders import submit    # noqa: E402

SPOTS = [(-99.5, -50.5), (-44.5, -14.5)]


def main() -> int:
    ai = AIBridge()
    plan = [("craft", {"recipe": "radar", "count": len(SPOTS)})]
    for x, y in SPOTS:
        plan += [("walk_to", {"x": x + 3, "y": y + 3}), ("build", {"name": "radar", "x": x, "y": y})]
    plan.append(("walk_to", {"x": -80, "y": -45}))
    submit(ai, sys.argv[1] if len(sys.argv) > 1 else "bravo", plan, strict=False)
    print("radar23: 제출", SPOTS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""23회차 발전소 동쪽 통로 (사용자: "여기 길 막혀있는데 지하파이프로 길좀 뚫어줘").

보일러 급수관이 땅 위로 이어져 벽이 됐다 - 발전소 동쪽을 가려면 북쪽 (-40,-94) 으로 돌아야 했다.
세 토막을 지하 파이프 쌍으로 바꿔 발밑을 연다 (2.0 지하 파이프는 10칸까지).

  A. y=-58.5  x -34.5 (서쪽 입구 d12) .. -29.5 (동쪽 출구 d4) - -33.5..-30.5 네 칸이 열린다.
              -35.5 는 보일러 급수 꼭지라 땅 위 관으로 남긴다.
  B. y=-56.5  x -27.5 (d12) .. -22.5 (d4)                    - -26.5..-23.5 네 칸.
  C. x=-21.5  y -55.5 (북 d0) .. -49.5 (남 d8)                - -54.5..-50.5 다섯 칸.

    python scripts/pass23.py --who hotel,foxtrot
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge  # noqa: E402

N, E, S, W = 0, 4, 8, 12
UG = "pipe-to-ground"
p1.COST.setdefault(UG, {"iron-plate": 7.5})


def dem(x, y):
    return ("demolish", {"x": x, "y": y, "name": "pipe", "search_radius": 0.3})


def steps() -> list:
    out = []
    # A
    out += [dem(x + 0.5, -58.5) for x in range(-35, -29)]
    out += [p1.b(UG, -34.5, -58.5, W), p1.b(UG, -29.5, -58.5, E)]
    # B
    out += [dem(x + 0.5, -56.5) for x in range(-28, -22)]
    out += [p1.b(UG, -27.5, -56.5, W), p1.b(UG, -22.5, -56.5, E)]
    # C
    out += [dem(-21.5, y + 0.5) for y in range(-56, -49)]
    out += [p1.b(UG, -21.5, -55.5, N), p1.b(UG, -21.5, -49.5, S)]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    a = ap.parse_args()
    ai = AIBridge()
    st = steps()
    print(f"  pass {len(p1.standing(ai, st))}/6")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    os.environ[detached.ENV] = "pass23"
    detached.mark(crew, "pass23", minutes=30)
    try:
        p1.build_stage(ai, crew, st, "pass")
    finally:
        detached.release(crew)
    print(f"  pass {len(p1.standing(ai, st))}/6")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""23회차 초록 팩 병목 (사용자: "연구소도 병목생긴다").

실측 (2026-09-26): 연구소 16 중 11 이 초록 팩이 없어 섰다 (10분 소비 초록 26 · 빨강 102 · 군사 173).
초록 줄 (-51..-74, y 16.5) 은 조립기 9 가 다 «재료 모자람» - 팔 조립기 (-51.5,7.5) 가 톱니·철판 없음.
거꾸로 따라가면 철판 줄 x=-33.5 가 비었고, 그 화로 기둥 (x -41 · -36, y -44..-22) 24 개 중 절반이 광석 없음.
광석 원천 = 채굴 줄 y=-18.5 (x -108..-90) - 채굴기 14 중 5 가 다 캤고 (status 21) 나머지도 잔량 수십~수백.

    광맥이 마르고 있었다. 화로도 조립기도 멀쩡하다 - 맨 위 한 칸이 비면 아래가 다 선다.

남은 철은 바로 남쪽 (x -114..-90, y -15..-7) 에 ~17.6만. 새 채굴 줄:
    벨트 y=-10.5 동향 (x -112.5..-86.5) -> x=-85.5 북향 (y -10.5..-17.5) -> 기존 모서리 (-85.5,-18.5) 에 뒤에서 합류
    채굴기 북쪽 줄 y=-12.5 남향 · 남쪽 줄 y=-8.5 북향, x = -110.5 .. -92.5 (3칸) - 14 대 = 7.7/s
    전력: 북쪽 줄은 기존 전봇대 (y=-14.5) + 새 (-111.5,-14.5) · 남쪽 줄은 새 전봇대 y=-5.5
    다 캔 채굴기 5 는 뜯어 새 줄에 다시 쓴다 (fetch 가 짓는 사람 가방부터 쓴다).

    python scripts/ore23.py                     # 막힌 자리
    python scripts/ore23.py --who alpha,bravo,charlie
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
EMD, BELT, POLE = p1.EMD, p1.BELT, p1.POLE
DEAD = [(-96.5, -20.5), (-93.5, -20.5), (-90.5, -20.5), (-93.5, -16.5), (-90.5, -16.5)]
XS = [-110.5 + 3 * i for i in range(7)]


def stages() -> dict:
    dead = [("demolish", {"x": x, "y": y, "name": EMD, "search_radius": 0.4}) for x, y in DEAD]
    belt = [p1.b(BELT, x + 0.5, -10.5, E) for x in range(-113, -86)]
    belt += [p1.b(BELT, -85.5, y + 0.5, N) for y in range(-18, -10)]
    poles = [p1.b(POLE, -111.5, -14.5)] + [p1.b(POLE, x, -5.5) for x in (-109.5, -103.5, -97.5, -91.5)]
    drills = [p1.b(EMD, x, -12.5, S) for x in XS] + [p1.b(EMD, x, -8.5, N) for x in XS]
    return {"dead": dead, "belt": belt, "poles": poles, "drills": drills}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    a = ap.parse_args()
    ai = AIBridge()
    st = stages()
    for k, v in st.items():
        nb = sum(1 for kk, _ in v if kk == "build")
        print(f"  {k:7s} {len(p1.standing(ai, v))}/{nb} · 막힘 {p1.blocked(ai, v)[:4]}")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    p1.PARK = (-80.5, -12.5)
    os.environ[detached.ENV] = "ore23"
    detached.mark(crew, "ore23", minutes=90)
    try:
        for k in ("dead", "belt", "poles", "drills"):
            nb = sum(1 for kk, _ in st[k] if kk == "build")
            if nb and len(p1.standing(ai, st[k])) >= nb:
                continue
            p1.build_stage(ai, crew, st[k], "ore-" + k)
    finally:
        detached.release(crew)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

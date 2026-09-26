"""23회차 초록 팩 병목 2 (사용자: "연구소도 병목생긴다" / "연구소 병목현상도 진행해줘").

ore23 로 화로 기둥 24 가 다 돌아도 초록은 10분 74 (연구소 16 중 12 가 초록 없음). 철판 줄 x=-33.5 를
따라가 보니 초록 줄에 닿기 전에 여섯이 먼저 먹는다 - 임시 강철 화로 2 · 조립기 4 (p28 톱니·관) · 다른 벨트로 옮기는 팔 2.
초록 줄 머리에 닿는 철판은 벨트 전체에 4 장.

한편 p27 (철 5/s) 은 허브 상자가 2000 씩 차서 서 있다. 그 철을 초록 줄로 직접 끈다:

    허브 철 상자 (-83.5,-52.5) · (-82.5,-52.5) → 고속 팔 (y=-51.5, 북쪽에서 집음) → 벨트 y=-50.5 서향 →
    x=-84.5 남향 (y -50.5 .. 5.5, 탄 줄 y=-47 · 광석 줄 y=-46 은 지하 -48.5 → -44.5) →
    y=5.5 동향 (x -84.5 .. -58.5, 벨트 품목 줄 x=-82.5 는 지하 -83.5 → -81.5) →
    초록 철 기둥 x=-57.5 (북향) 에 서쪽 옆치기.

    python scripts/green23.py                 # 막힌 자리
    python scripts/green23.py --who alpha,bravo,charlie
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
BELT, UG, FI = p1.BELT, "underground-belt", "fast-inserter"
p1.COST.setdefault(UG, {"iron-plate": 8.75})
p1.COST.setdefault(FI, {"iron-plate": 8.5, "copper-plate": 4.5})


def ug_out(x, y, d):
    """지하벨트 출구. type 이 없으면 입구로 선다 (23회차 첫 공사: 두 출구가 다 input · UNLINKED 로 섰다)."""
    k, p = p1.b(UG, x, y, d)
    p["type"] = "output"
    return (k, p)


def fix_steps() -> list:
    """입구로 잘못 선 출구를 뜯고 출구로 다시."""
    out = []
    for x, y, d in ((-84.5, -44.5, S), (-81.5, 5.5, E)):
        out += [("demolish", {"x": x, "y": y, "name": UG, "search_radius": 0.3}), ug_out(x, y, d)]
    return out


def steps() -> list:
    out = [p1.b(FI, -83.5, -51.5, N), p1.b(FI, -82.5, -51.5, N)]
    out += [p1.b(BELT, -82.5, -50.5, W), p1.b(BELT, -83.5, -50.5, W)]
    out += [p1.b(BELT, -84.5, y + 0.5, S) for y in (-51, -50)]                  # -50.5 · -49.5
    out += [p1.b(UG, -84.5, -48.5, S), ug_out(-84.5, -44.5, S)]
    out += [p1.b(BELT, -84.5, y + 0.5, S) for y in range(-44, 5)]              # -43.5 .. 4.5
    out += [p1.b(BELT, -84.5, 5.5, E), p1.b(UG, -83.5, 5.5, E), ug_out(-81.5, 5.5, E)]
    out += [p1.b(BELT, x + 0.5, 5.5, E) for x in range(-81, -58)]               # -80.5 .. -58.5
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--fix", action="store_true", help="잘못 선 지하벨트 출구만 다시")
    a = ap.parse_args()
    ai = AIBridge()
    st = steps()
    nb = sum(1 for k, _ in st if k == "build")
    print(f"  green {len(p1.standing(ai, st))}/{nb} · 막힘 {p1.blocked(ai, st)[:6]}")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    p1.PARK = (-70.5, 8.5)
    os.environ[detached.ENV] = "green23"
    detached.mark(crew, "green23", minutes=60)
    try:
        p1.build_stage(ai, crew, fix_steps() if a.fix else st, "green-fix" if a.fix else "green")
    finally:
        detached.release(crew)
    print(f"  green {len(p1.standing(ai, st))}/{nb}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

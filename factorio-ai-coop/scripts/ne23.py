"""23회차 북동 보강 (사용자: "우상단 좀 부셔졌는데 복구수리좀하고 좀 더 보완하자").

북쪽 줄 동쪽 절반 (x -28..38, y=-108) 이 세 번 무너졌다. 북동 둥지 (58,-199: 둥지 5 · 대형 웜) 의 무리는
중형·대형 바이터 - 일반 탄창 포탑 한 줄로는 모자란다.

  1. repair : p29 북쪽 줄 · 전봇대 · 팔 빠진 것 (p29 stages 그대로)
  2. row2   : 탄 벨트 (y=-105.5 동향) «남쪽» 에 둘째 줄 - 포탑 (x,-103) · 팔 (x-0.5,-104.5) N (벨트에서 집어 남쪽 포탑으로).
              기존 전봇대 (x+0.5,-106.5) 의 공급 칸 (y -109..-104) 이 팔 칸과 겹친다 - 새 전봇대 없음.
  3. walls  : 북쪽 줄 앞 돌벽 y=-112.5 (x -40..47) + 동쪽 모서리 x=47.5 (y -112..-87). 벽이 맞는 동안 포탑이 쏜다.

    python scripts/ne23.py                    # 막힌 자리만
    python scripts/ne23.py --who hotel,delta,echo,foxtrot
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
import p29  # noqa: E402
from client import AIBridge  # noqa: E402

N, E, S, W = 0, 4, 8, 12
ROW2_Y = -103
ROW2_XS = [x for x in p29.N_XS if x >= -46]          # 동쪽 절반 (무너진 곳) + 여유
WALL_Y = -112.5
WALL_XS = [x + 0.5 for x in range(-40, 48)]         # 벽돌 639 - 동쪽 절반부터
WALL_E_X = 47.5
WALL_E_YS = [y + 0.5 for y in range(-112, -86)]
p1.COST.setdefault("stone-wall", {"stone-brick": 5})


def stages() -> dict:
    st = p29.stages()
    repair = st["turrets_n"] + st["poles"] + st["ins"]
    row2 = [p1.b("gun-turret", x, ROW2_Y) for x in ROW2_XS] + [p1.b("inserter", x - 0.5, ROW2_Y - 1.5, N) for x in ROW2_XS]
    walls = [p1.b("stone-wall", x, WALL_Y) for x in WALL_XS] + [p1.b("stone-wall", WALL_E_X, y) for y in WALL_E_YS if y != WALL_Y]
    return {"repair": repair, "row2": row2, "walls": walls, "turrets": st["turrets_n"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--stage", default="")
    a = ap.parse_args()
    ai = AIBridge()
    st = stages()
    for k, v in st.items():
        if k == "turrets":
            continue
        nb = sum(1 for kk, _ in v if kk == "build")
        print(f"  {k:7s} {len(p1.standing(ai, v))}/{nb} · 막힘 {p1.blocked(ai, v)[:4]}")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    p1.PARK = (-20.5, -90.5)
    os.environ[detached.ENV] = "ne23"
    detached.mark(crew, "ne23", minutes=120)
    try:
        for k in ([a.stage] if a.stage else ("repair", "row2", "walls")):
            nb = sum(1 for kk, _ in st[k] if kk == "build")
            if len(p1.standing(ai, st[k])) >= nb:
                continue
            p1.build_stage(ai, crew, st[k], "ne-" + k)
    finally:
        detached.release(crew)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

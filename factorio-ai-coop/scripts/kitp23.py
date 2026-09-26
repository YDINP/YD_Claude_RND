"""23회차 북동 둥지 준비 (docs/run23-site.md «북동 둥지 제거 계획» 0단계).

    python scripts/kitp23.py turrets alpha,bravo,charlie 16      # 포탑 N 씩 만들어 창고 (-86.5,-55.5) 에 넣는다
    python scripts/kitp23.py ammo hotel,delta,echo,foxtrot 80    # 관통탄 N 씩 손제작 (강철 상자에서 나눠 집음)
    python scripts/kitp23.py load hotel,delta,echo,foxtrot 12    # 창고에서 포탑 N 씩 든다

관통탄 = 일반 탄창 1 (철 4) + 강철 1 + 구리 5. 손제작은 중간재 (일반 탄창) 를 스스로 만든다.
"""
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
from client import AIBridge  # noqa: E402

DEPOT = (-86.5, -55.5)
IRON = [(-81.5, -52.5), (-83.5, -52.5), (-82.5, -52.5), (-84.5, -52.5)]     # 철 2000 · 2000 · 1900 · 1800
COPPER = [(-79.5, -52.5), (-76.5, -52.5), (-73.5, -52.5), (-75.5, -52.5)]   # 구리 2300 안팎
STEEL = [(-84.5, -52.5), (-84.5, -52.5), (-82.5, -52.5), (-83.5, -52.5)]    # 강철 200 · 134 · 100


def plan_for(mode, i, n):
    ix, iy = IRON[i % 4]
    cx, cy = COPPER[i % 4]
    if mode == "turrets":
        return [("walk_to", {"x": ix, "y": iy + 1.5}),
                ("take", {"name": "iron-plate", "x": ix, "y": iy, "count": 40 * n}),
                ("take", {"name": "copper-plate", "x": cx, "y": cy, "count": 10 * n}),
                ("craft", {"recipe": "gun-turret", "count": n, "wait": True}),
                ("walk_to", {"x": DEPOT[0], "y": DEPOT[1] + 1.5}),
                ("insert", {"name": "gun-turret", "x": DEPOT[0], "y": DEPOT[1], "count": n})]
    if mode == "ammo":
        sx, sy = STEEL[i % 4]
        return [("walk_to", {"x": ix, "y": iy + 1.5}),
                ("take", {"name": "iron-plate", "x": ix, "y": iy, "count": 4 * n}),
                ("take", {"name": "copper-plate", "x": cx, "y": cy, "count": 5 * n}),
                ("take", {"name": "steel-plate", "x": sx, "y": sy, "count": n}),
                ("craft", {"recipe": "piercing-rounds-magazine", "count": n, "wait": True})]
    return [("walk_to", {"x": DEPOT[0], "y": DEPOT[1] + 1.5}),
            ("take", {"name": "gun-turret", "x": DEPOT[0], "y": DEPOT[1], "count": n})]


def main() -> int:
    mode, crew, n = sys.argv[1], sys.argv[2].split(","), int(sys.argv[3])
    ai = AIBridge()
    os.environ[detached.ENV] = "creep"
    detached.mark(crew, "creep", minutes=120)
    ids = {w: ai.agent(w).submit_plan(plan_for(mode, i, n)) for i, w in enumerate(crew)}
    t0 = time.time()
    while time.time() - t0 < 1500:
        time.sleep(8)
        st = {w: [ai.poll(t) for t in v] for w, v in ids.items()}
        if all(p["status"] in ("done", "failed") for v in st.values() for p in v):
            break
    for w, v in ids.items():
        bad = [(p.get("type"), p.get("error")) for p in (ai.poll(t) for t in v) if p["status"] == "failed"]
        it = ai.agent(w).items()
        print(w, "포탑", it.get("gun-turret"), "관통탄", it.get("piercing-rounds-magazine"), "실패", bad, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""23회차 방어 관문 D-2: 서쪽 줄 (x=-116, 15대) · 남쪽 줄 (y=52, 7대) 포탑을 탄약 벨트로.

기존 탄약 벨트 (y=-46.5, 서향, 탄약 조립기 (-78.5,-49.5) -> 서쪽 포탑 4) 에 분배기를 달아
  분기: (-112.5,-45.5) 서 -> x=-113.5 남향 (y -45.5..54.5) -> y=54.5 동향 (x -112.5..-67.5).
서쪽 포탑 (-116,y) 은 팔 (-114.5,y-0.5) 이 동쪽 벨트에서 집고, 남쪽 포탑 (x,52) 은 팔 (x-0.5,53.5) 이 남쪽 벨트에서 집는다.
팔 방향 = 집는 쪽 (N=0, E=4, S=8, W=12).

  python scripts/ammo23.py            # 막힌 자리만 본다
  python scripts/ammo23.py --who hotel,charlie
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge  # noqa: E402

N, E, S, W = 0, 4, 8, 12
BELT, INS, POLE, SPLIT = "transport-belt", "inserter", "small-electric-pole", "splitter"
WEST_X, WEST_YS = -116, list(range(-34, 53, 6))
SOUTH_Y, SOUTH_XS = 52, [-86, -83, -80, -77, -74, -71, -68]
COL_X, ROW_Y = -113.5, 54.5
SPLIT_AT = (-111.5, -46)
b = p1.b


def steps() -> dict:
    split = [("demolish", {"x": -111.5, "y": -46.5, "name": BELT, "search_radius": 0.3}),
             b(SPLIT, *SPLIT_AT, W), b(BELT, -112.5, -45.5, W)]
    belts = [b(BELT, COL_X, y + 0.5, S) for y in range(-46, 54)]
    belts += [b(BELT, x + 0.5, ROW_Y, E) for x in range(-114, -67)]
    ins = [b(INS, WEST_X + 1.5, y - 0.5, E) for y in WEST_YS]
    ins += [b(INS, x - 0.5, SOUTH_Y + 1.5, S) for x in SOUTH_XS]
    poles = [b(POLE, WEST_X + 1.5, y + 1.5) for y in WEST_YS]      # 팔 (y-0.5) 과 2칸 - 3칸이면 공급 칸에 모서리만 닿는다
    poles += [b(POLE, x, 55.5) for x in (-108.5, -102.5, -96.5, -90.5)]
    poles += [b(POLE, x + 0.5, SOUTH_Y + 1.5) for x in (-86, -80, -74, -68)]
    return {"split": split, "belts": belts, "ins": ins, "poles": poles}


def fill(ai) -> list:
    return ai.lua("""(function() local o = {}
      for _, t in pairs(game.surfaces[1].find_entities_filtered{name = "gun-turret", area = {{-120, -40}, {-60, 56}}}) do
        o[#o+1] = t.position.x .. "," .. t.position.y .. ":" .. t.get_inventory(defines.inventory.turret_ammo).get_item_count()
      end
      return o end)()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    st = steps()
    for k, v in st.items():
        nb = sum(1 for kk, _ in v if kk == "build")
        print(f"  {k:6s} {len(p1.standing(ai, v))}/{nb} · 막힘 {p1.blocked(ai, v)[:4]}")
    crew = [w for w in args.who.split(",") if w]
    if not crew:
        return 0
    p1.PARK = (-100.5, 10.5)
    os.environ[detached.ENV] = "ammo"
    detached.mark(crew, "ammo", minutes=60)
    try:
        for k in ("belts", "ins", "poles", "split"):     # 분배기는 맨 끝 - 줄이 다 서야 탄이 흘러간다
            p1.build_stage(ai, crew, st[k], "ammo-" + k)
    finally:
        detached.release(crew)
    time.sleep(60)
    print(fill(ai))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

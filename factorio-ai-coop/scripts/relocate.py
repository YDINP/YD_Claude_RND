"""Move what stands in the wrong place into the zone it belongs to.

21회차 실측 - 사용자가 짚었다: "벨트좀 체크해봐 뭔가 이상한데"

    화로 8대  y=10      (--smelt 대체 좌표를 따라 섰다)
    벨트 155칸 y=30..38 (모드 제련 구역 (-53,36) 을 따라 깔렸다)
    검수: 화로 8대 전부 「넣어 줄 팔도 꺼내 줄 팔도 없다」

양쪽 다 제 기준에는 맞게 지었으므로 아무도 틀렸다고 말하지 않았다.
한 줄도 쓸모가 없었을 뿐이다.

둘 중 하나를 옮겨야 한다면 «적은 쪽»을 옮긴다. 기둥은 155칸이고 화로는
여덟 대다. 그리고 모드가 고른 자리는 광맥을 피하고 밭에 가깝다 - 그쪽이
옳은 자리이기도 하다.

    자리를 정하는 것은 「먼저 지은 쪽」이 아니라 «옳은 쪽»이다.

자리는 `rows.py` 에게만 묻는다. 여기서 따로 계산하면 그것이 셋째
기준점이 되고, 기준점이 셋이면 줄은 두 번 흩어진다.

    python scripts/relocate.py --who delta --depot=-55,10
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

sys.path.insert(0, HERE)
import rows as rows_mod                  # noqa: E402

# 한 걸음에 옮기는 채수. 계획이 64단계를 넘으면 모드가 «통째로» 거절한다.
# 한 대에 여섯 단계(걷기.꺼내기 셋.걷어내기.세우기)가 드니 넉넉히 잡는다.
PER_TRIP = 4

FUEL = 20
TIGHT = 0.4


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def strays(ai, who, kind="stone-furnace"):
    """제자리가 아닌 것들. 무엇이 제자리인지는 «모드»가 안다."""
    reply = ai.misplaced(who, 32)
    out = []
    for row in _rows(reply.get("misplaced")):
        if row.get("name") == kind:
            out.append((float(row["x"]), float(row["y"])))
    return out


def taken(ai):
    """이미 화로가 선 자리. 두 번 세우지 않으려고 «게임에» 묻는다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, e in pairs(s.find_entities_filtered{type="furnace",
            force=game.forces.player}) do
        out[#out+1] = string.format("%.1f|%.1f", e.position.x, e.position.y)
      end
      return { at = out }
    end)()""")
    return {(round(float(r.split("|")[0])), round(float(r.split("|")[1])))
            for r in _rows(reply.get("at"))}


def seats(ai, who):
    """제련 구역에서 «화로를 세워도 되는» 빈 자리. rows.py 가 유일한 기준."""
    zones = ai.zones(who)
    if not zones.get("smelt"):
        return []
    here = taken(ai)
    return [(x, y) for x, y in rows_mod.clear_spots(zones)
            if (x, y) not in here]


def move(ai, who, pairs, shelf):
    """비우고, 걷고, 제자리에 다시 세운다. 순서가 곧 안전이다.

    안엣것을 먼저 꺼내지 않으면 녹던 광석과 만든 판이 같이 사라진다.
    """
    plan = []
    for (ox, oy), (nx, ny) in pairs:
        plan.append(("walk_to", {"x": ox, "y": oy + 2}))
        # 무엇이 들었는지는 모르므로 셋 다 꺼내 본다. 없으면 그냥 넘어간다.
        for item in ("iron-plate", "copper-plate", "stone-brick",
                     "iron-ore", "copper-ore", "stone", "coal"):
            plan.append(("take", {"name": item, "x": ox, "y": oy,
                                  "count": 100}))
        # 한 칸만 집는다. 타일 «가운데»를 가리켜야 그 칸이 잡힌다.
        plan.append(("demolish", {"x": ox + 0.5, "y": oy + 0.5,
                                  "search_radius": TIGHT}))
        plan.append(("walk_to", {"x": nx + 2, "y": ny + 2}))
        plan.append(("build", {"name": "stone-furnace", "x": nx, "y": ny}))
        plan.append(("insert", {"name": "coal", "x": nx, "y": ny,
                                "count": FUEL}))
    plan.append(("walk_to", {"x": shelf[0] - 2, "y": shelf[1] + 1}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 화로 {len(pairs)}대를 제자리로 - "
          + ", ".join(f"({a:.0f},{b:.0f})->({c:.0f},{d:.0f})"
                      for (a, b), (c, d) in pairs))
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--depot", required=True, help="음수는 --depot=-5,-90")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=200)
    ap.add_argument("--dry", action="store_true", help="무엇을 옮길지만 본다")
    args = ap.parse_args()

    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = (dx + 0.5, dy + 0.5)
    crew = args.who or ["delta"]

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            who = (idle(ai, crew) or [None])[0]
            if not who:
                if args.dry:
                    who = crew[0]
                else:
                    time.sleep(args.every)
                    continue
            wrong = strays(ai, who)
            if not wrong:
                print("  다 제자리에 섰다")
                return 0
            free = seats(ai, who)
            if not free:
                print(f"  옮길 것은 {len(wrong)}대인데 «빈 자리»가 없다 "
                      f"- 구역이 좁거나 남의 줄이 물고 있다")
                if args.dry:
                    return 1
                time.sleep(args.every)
                continue
            pairs = list(zip(wrong[:PER_TRIP], free[:PER_TRIP]))
            if args.dry:
                print(f"  제자리 아님 {len(wrong)}대 · 빈 자리 {len(free)}곳")
                for (a, b), (c, d) in pairs:
                    print(f"    ({a:.0f},{b:.0f}) -> ({c:.0f},{d:.0f})")
                return 0
            move(ai, who, pairs, shelf)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:                   # 고리는 «안 죽는다»
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

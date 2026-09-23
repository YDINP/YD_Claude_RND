"""A drill with nothing under it is a drill in the wrong place. Move it.

    사용자: "채굴가능한 자원이 없는 채굴기 발생함. 어케처리할거임?"

실측(21회차): 전기 채굴기 22대가 no_minable_resources - 석탄밭 북쪽 줄, 철밭
남쪽 줄, 구리밭 남쪽 줄의 «가장자리»부터 마른다. 서 있으면 전기만 먹는다
(대기 전력) 그리고 그 자리는 영영 안 돌아온다.

    1. 마른 채굴기를 걷는다 (그 사람 가방으로 돌아온다 - 새로 만들지 않는다).
    2. 같은 밭에서 «아직 광석이 있고 벨트 옆인» 자리를 edrill.py 의 자로 잰다.
    3. 거기 다시 앉힌다. 자리가 없으면 창고에 두고 «다음 밭»을 말한다
       (reserves.py 가 지도에서 본 광맥).

edrill 의 규칙 그대로 - 광석이 많은 칸이 아니라 «캔 것이 벨트에 떨어지는» 칸.

    python scripts/reseat.py                      # 마른 것 몇 대, 어느 밭
    python scripts/reseat.py --who foxtrot        # 한 번
    python scripts/reseat.py --who foxtrot --every 600
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import edrill                            # noqa: E402
import reserves                          # noqa: E402
import shelf as shelf_mod                # noqa: E402

DEPOT = (-55, 10)
DRILL = "electric-mining-drill"
PER_ROUND = 8            # 한 순번에 걷는 수 (걷기 8 + 앉히기 = 60단계 안)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def dry(ai) -> list:
    """마른 전기 채굴기. [(x, y)]"""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, d in pairs(s.find_entities_filtered{name = "%s", force = f}) do
        if d.status == defines.entity_status.no_minable_resources then
          out[#out+1] = string.format("%%.1f,%%.1f", d.position.x, d.position.y)
        end
      end
      return out
    end)()""" % DRILL)
    return [tuple(float(v) for v in str(r).split(",")) for r in _rows(reply)]


def field_of(x, y):
    for name, (ore, (x1, y1, x2, y2)) in reserves.FIELDS.items():
        if x1 <= x <= x2 and y1 <= y <= y2:
            return name, ore, (x1, y1, x2, y2)
    return None, None, None


def seats_in(ai, ore, box, limit):
    lane = edrill.belts(ai, (box[0], box[1], box[2] + 1, box[3] + 1))
    alive = edrill.going_somewhere(ai)
    lane = {k: v for k, v in lane.items() if k in alive}
    seats = edrill.measure(ai, edrill.candidates(lane), ore)
    return edrill.choose(seats, limit, edrill.MIN_ORE)


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def round_once(ai, who) -> bool:
    gone = dry(ai)
    if not gone:
        return False
    # 밭별로 묶어 «한 밭»씩 - 걷는 자리와 앉힐 자리가 같은 밭이라 걸음이 짧다
    by_field = {}
    for x, y in gone:
        name, ore, box = field_of(x, y)
        by_field.setdefault((name, ore, box), []).append((x, y))
    (name, ore, box), spots = max(by_field.items(), key=lambda kv: len(kv[1]))
    spots = spots[:PER_ROUND]
    plan = []
    for x, y in spots:
        plan.append(("walk_to", {"x": x + 3, "y": y}))
        plan.append(("demolish", {"x": x, "y": y, "name": DRILL, "search_radius": 0.6}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: {name or '밭 밖'} 마른 채굴기 {len(spots)}대를 걷는다 (전체 {len(gone)})")
    for _ in range(60):
        time.sleep(5)
        if idle(ai, who):
            break
    if not box:
        return True
    seats = seats_in(ai, ore, box, len(spots))
    if not seats:
        try:
            held = int(ai.agent(who).items().get(DRILL, 0))
        except RconError:
            held = 0
        at = shelf_mod.spare(ai, DEPOT, 36)
        if at and held:
            submit(ai, who, [("walk_to", {"x": at[0], "y": at[1] + 1.5}),
                             ("insert", {"name": DRILL, "x": at[0], "y": at[1], "count": held})], strict=False)
        nxt = [p for p in reserves.patches(ai) if p[0] == ore][:2]
        print(f"  {name}밭에 앉힐 자리가 없다 - 채굴기 {held}대는 창고에. 다음 {ore} 밭: "
              + ", ".join(f"({x:.0f},{y:.0f}) {a:,} {d:.0f}칸" for _n, x, y, a, d in nxt))
        return True
    edrill.build(ai, who, seats)
    for _ in range(60):
        time.sleep(5)
        if idle(ai, who):
            break
    print(f"  {name}밭: {len(seats)}곳에 다시 앉혔다")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            gone = dry(ai)
            tally = {}
            for x, y in gone:
                tally[field_of(x, y)[0] or "밭 밖"] = tally.get(field_of(x, y)[0] or "밭 밖", 0) + 1
            print(f"  마른 채굴기 {len(gone)}대: " + ", ".join(f"{k} {v}" for k, v in tally.items()))
            if args.who and gone and idle(ai, args.who):
                round_once(ai, args.who)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

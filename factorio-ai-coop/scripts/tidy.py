"""Sim-city: take back the tiles we sat on.

    사용자: "벨트깔면서 심시티해야하니까 상자나 위치이상한 채굴기/건물들
             철거하고 다시배치해도됨"

실측(20회차): 우리 건물 «163채»가 광맥 위에 앉아 있었고 그 중 162채가
채굴기 출구 상자였다. 상자 하나가 광맥 한 칸을 덮고, 덮인 칸에는 다시
채굴기를 못 세운다.

    상자 한 칸이 나중에 못 세울 채굴기 한 대다.

상자는 «벨트가 아직 없을 때의 임시 출구»였다. 벨트가 오면 그 자리는
벨트 것이고, 상자는 광맥을 돌려줘야 한다.

걷는 순서가 중요하다. 안엣것을 먼저 꺼내지 않으면 광석도 같이 사라지고,
채굴기가 아직 그 상자를 보고 있으면 걷는 순간 갈 곳을 잃는다. 그래서:

    1. 벨트가 곁에 있는가        - 없으면 아직 걷을 때가 아니다
    2. 채굴기를 벨트 쪽으로 돌린다 (feed_belts)
    3. 상자를 비우고 걷는다

    python scripts/tidy.py --who echo --depot=30,0
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

PER_TRIP = 8              # 한 걸음에 걷는 상자 수
NEAR_BELT = 2.0           # 이만큼 안에 벨트가 있으면 «벨트가 왔다»


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def squatters(ai):
    """광맥을 깔고 앉은 «우리» 상자들. 벨트가 곁에 온 것부터.

    벨트가 없는 상자는 아직 유일한 출구다. 그것을 걷으면 그 채굴기는
    땅에 떨구다 멈춘다 - 고치려다 망가뜨리는 일이 된다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f}) do
        local b = c.bounding_box
        local ore = s.count_entities_filtered{
          area = {{b.left_top.x + 0.1, b.left_top.y + 0.1},
                  {b.right_bottom.x - 0.1, b.right_bottom.y - 0.1}},
          type = "resource"}
        if ore > 0 then
          local belt = s.count_entities_filtered{position = c.position,
                       radius = %s, type = "transport-belt", force = f}
          local held = 0
          for _, i in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
            held = held + i.count
          end
          local drills = s.count_entities_filtered{position = c.position,
                         radius = 2.5, type = "mining-drill", force = f}
          out[#out+1] = string.format("%%.0f|%%.0f|%%d|%%d|%%d|%%s",
            c.position.x, c.position.y, belt, held, drills, c.name)
        end
      end
      return out
    end)()""" % NEAR_BELT)
    out = []
    for row in _rows(reply):
        x, y, belt, held, drills, name = row.split("|")
        out.append({"x": float(x), "y": float(y), "belt": int(belt),
                    "held": int(held), "drills": int(drills), "name": name})
    # 벨트가 온 것 먼저, 그 중에서도 «비어 있는» 것부터 - 나를 것이 없다
    return sorted(out, key=lambda c: (-c["belt"], c["held"]))


def pull(ai, who, take, shelf):
    """비우고 걷는다. 안엣것을 먼저 꺼내지 않으면 같이 사라진다."""
    plan = [("walk_to", {"x": take[0]["x"] + 2, "y": take[0]["y"] + 2})]
    for one in take:
        for item in ("iron-ore", "copper-ore", "coal", "stone"):
            plan.append(("take", {"name": item, "x": one["x"], "y": one["y"],
                                  "count": 400}))
        plan.append(("demolish", {"x": one["x"], "y": one["y"],
                                  "name": one["name"]}))
    plan.append(("walk_to", {"x": shelf["stone"][0] - 2, "y": shelf["stone"][1] + 1}))
    submit(ai, who, plan, strict=False)
    got = sum(c["held"] for c in take)
    print(f"{who}: 광맥을 깔고 앉은 상자 {len(take)}개 회수 (안엣것 {got})")


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--depot", required=True, help="음수는 --depot=-5,-90")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    crew = args.who or ["echo"]
    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            sitting = squatters(ai)
            ready = [c for c in sitting if c["belt"]]
            if not sitting:
                print("광맥 위에 앉은 상자가 없다.")
                return 0
            if not ready:
                print(f"  광맥 위 상자 {len(sitting)}개 - 아직 벨트가 안 왔다. "
                      f"지금 걷으면 그 채굴기가 멈춘다")
                time.sleep(args.every)
                continue

            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue
            # 걷기 «전에» 채굴기를 벨트 쪽으로 돌린다. 순서가 바뀌면
            # 채굴기가 갈 곳을 잃은 채로 남는다.
            try:
                fed = ai.feed_belts(free[0])
                turned = _rows(fed.get("turned"))
                if turned:
                    print(f"  채굴기 {len(turned)}대를 벨트 쪽으로 돌렸다")
            except RconError:
                pass
            pull(ai, free[0], ready[:PER_TRIP], shelf)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

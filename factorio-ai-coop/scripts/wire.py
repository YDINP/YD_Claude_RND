"""A pole that stands is not a pole that is connected. Count networks.

21회차에 전봇대 서른두 자리를 다 세웠다. 빠진 자리는 0 이었다. 그런데
전기가 닿은 것은 발전소 쪽 스물두 개뿐이었다.

    net 1 = 22   net 3 = 2   net 4 = 9   net 5 = 2

자리를 고를 때 나무와 채굴기를 피해 한두 칸씩 밀었고, 밀린 자리끼리는
전선 길이(7.5칸)를 넘었다. 「다 세웠나」를 세면 통과하고 「이어졌나」를
세면 떨어진다.

    세운 것을 세지 말고 «전력망의 수»를 센다. 1 이 아니면 끊긴 것이다.

이 스크립트는 발전기가 붙은 망을 «본망»으로 보고, 나머지 섬마다 본망과
가장 가까운 전봇대 한 쌍을 찾아 그 사이에 놓을 자리를 고른다. 한 개로
안 닿는 틈은 닿는 데까지 한 개를 놓는다 - 다음 순번에 또 잰다.

    python scripts/wire.py                # 끊긴 데만 본다
    python scripts/wire.py --who golf     # 잇는다
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

POLE = "small-electric-pole"
WIRE = 7.3                # 전선은 7.5칸. 재는 오차만큼 덜 잡는다


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def networks(ai) -> tuple:
    """(본망 id, {망 id: [(x, y), ...]})"""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local main = -1
      for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
        if g.electric_network_id then main = g.electric_network_id break end
      end
      local out = {}
      for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f}) do
        out[#out+1] = (p.electric_network_id or -1) .. "|" .. p.position.x
                   .. "|" .. p.position.y
      end
      return { main = main, poles = out }
    end)()""")
    nets = {}
    for row in _rows(reply.get("poles")):
        net, x, y = str(row).split("|")
        nets.setdefault(int(net), []).append((float(x), float(y)))
    return int(reply["main"]), nets


def gaps(main, nets) -> list:
    """섬마다 본망과 가장 가까운 한 쌍. [(거리, 본망 쪽, 섬 쪽), ...]"""
    out = []
    for net, poles in nets.items():
        if net == main:
            continue
        best = min(((((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5, a, b)
                    for a in nets.get(main, []) for b in poles),
                   default=None)
        if best:
            out.append(best)
    return sorted(out)


def seat(ai, a, b):
    """a 에서 전선이 닿고 b 쪽으로 가장 많이 다가가는 빈 칸."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local ax, ay, bx, by = %f, %f, %f, %f
      local best, bd = nil, 1e9
      for x = math.floor(ax) - 8, math.floor(ax) + 8 do
        for y = math.floor(ay) - 8, math.floor(ay) + 8 do
          local px, py = x + 0.5, y + 0.5
          local da = ((px - ax) ^ 2 + (py - ay) ^ 2) ^ 0.5
          local db = ((px - bx) ^ 2 + (py - by) ^ 2) ^ 0.5
          if da <= %f and db < bd
             and s.can_place_entity{name = "%s", position = {px, py}, force = f} then
            bd = db
            best = { x = px, y = py }
          end
        end
      end
      return best or {}
    end)()""" % (a[0], a[1], b[0], b[1], WIRE, POLE))
    if not reply or "x" not in reply:
        return None
    return float(reply["x"]), float(reply["y"])


def join(ai, who, spots) -> None:
    try:
        held = int(ai.agent(who).items().get(POLE, 0))
    except RconError:
        held = 0
    plan = []
    if held < len(spots):
        # 조합 한 번에 두 개가 나온다
        plan.append(("craft", {"recipe": POLE, "wait": True,
                               "count": (len(spots) - held + 1) // 2}))
    for x, y in spots:
        plan.append(("walk_to", {"x": x + 1.0, "y": y + 1.0}))
        plan.append(("build", {"name": POLE, "x": x, "y": y}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 전봇대 {len(spots)}개로 끊긴 망을 잇는다")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    names = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            main_net, nets = networks(ai)
            holes = gaps(main_net, nets)
            if main_net < 0:
                print("  [!] 발전기가 붙은 전력망이 없다")
            elif not holes:
                print(f"  전력망 하나 - 전봇대 {len(nets.get(main_net, []))}개가"
                      f" 다 이어져 있다")
            else:
                spots = []
                for dist, a, b in holes:
                    spot = seat(ai, a, b)
                    print(f"  끊김: ({a[0]:.0f},{a[1]:.0f}) ~ ({b[0]:.0f},{b[1]:.0f})"
                          f" {dist:.1f}칸 -> "
                          + (f"({spot[0]},{spot[1]})" if spot else "놓을 자리 없음"))
                    if spot:
                        spots.append(spot)
                hands = idle(ai, names)
                if spots and hands:
                    join(ai, hands[0], spots)
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

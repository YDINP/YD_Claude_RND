"""Scouting: walk outward until the nests show themselves.

20회차는 처음으로 「기지 300칸 안에 둥지 0곳」으로 시작했다. 좋은 소식
이지만, 그것은 «둥지가 없다»는 뜻이 아니라 **아직 안 보인다**는 뜻이다.
팩토리오는 누가 가 본 곳만 생성한다 - 안 가 보면 영원히 0으로 보인다.

    사용자: "몇명은 적기지가 관찰될때까지 어느정도 정찰보내봐"

방어선을 어디에 긋느냐는 「적이 어느 쪽에서 오는가」로 정해진다. 16회차는
포탑 열두 대로 빈 땅을 지켰고, 19회차는 51타일까지 들어온 뒤에야 알았다.
둘 다 «모르고» 지었기 때문이다.

한 사람이 한 방향을 맡아 한 다리씩 나아가고, 다리마다 게임에 묻는다.
둥지를 보면 거기서 멈춘다 - 더 가면 그냥 위험만 는다.

    python scripts/scout.py --who charlie --who hotel --home=40,0
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

LEG = 70                  # 한 다리. 이보다 짧으면 왕복 지시가 잦고 길면 둔하다
MAX_REACH = 420           # 이보다 멀리 간 둥지는 당장 우리 일이 아니다
LOOK = 90                 # 발밑에서 이만큼 둘러본다

# 여덟 방위. 사람이 적으면 «서로 반대쪽»부터 간다 - 같은 쪽을 둘이 보는
# 것은 정찰이 아니라 동행이다.
COMPASS = [("동", 1, 0), ("서", -1, 0), ("남", 0, 1), ("북", 0, -1),
           ("남동", 0.7, 0.7), ("북서", -0.7, -0.7),
           ("북동", 0.7, -0.7), ("남서", -0.7, 0.7)]


def sightings(ai, home, reach):
    """지금까지 «보인» 둥지들. 기지에서 가까운 것부터."""
    hx, hy = home
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, n in pairs(s.find_entities_filtered{type = "unit-spawner",
                position = {%d, %d}, radius = %d}) do
        out[#out+1] = string.format("%%.0f|%%.0f|%%s", n.position.x, n.position.y, n.name)
      end
      return out
    end)()""" % (hx, hy, reach))
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for row in rows:
        x, y, name = row.split("|")
        x, y = float(x), float(y)
        out.append({"x": x, "y": y, "name": name,
                    "gap": round(math.hypot(x - hx, y - hy))})
    return sorted(out, key=lambda n: n["gap"])


def near(ai, at, radius=LOOK):
    """이 자리에서 둘러본 것. 정찰병이 실제로 «본» 것만 센다."""
    x, y = at
    return ai.lua("""(function()
      local s = game.surfaces[1]
      return {
        nests = s.count_entities_filtered{type = "unit-spawner",
                position = {%d, %d}, radius = %d},
        worms = s.count_entities_filtered{type = "turret",
                force = game.forces.enemy, position = {%d, %d}, radius = %d},
        units = s.count_entities_filtered{type = "unit",
                force = game.forces.enemy, position = {%d, %d}, radius = %d},
      }
    end)()""" % (x, y, radius, x, y, radius, x, y, radius))




def busy(ai, who):
    row = next((w for w in ai.list() if w["name"] == who), None)
    if not row or not row.get("alive"):
        return None
    return bool(row.get("current") or row.get("queued"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--home", required=True, help="기지. 음수는 --home=-20,-90")
    ap.add_argument("--legs", type=int, default=6, help="한 사람이 나아갈 다리 수")
    ap.add_argument("--dirs", default=None,
                    help="갈 방위. 예: 남,북,남동. 안 주면 동.서부터")
    ap.add_argument("--every", type=float, default=15)
    args = ap.parse_args()

    crew = args.who or ["charlie"]
    hx, hy = (int(v) for v in args.home.split(","))
    ai = AIBridge()

    # 이미 보이는 둥지가 있으면 그쪽은 굳이 안 간다.
    known = sightings(ai, (hx, hy), MAX_REACH)
    if known:
        print("이미 보이는 둥지:")
        for n in known[:5]:
            print(f"  ({n['x']:.0f},{n['y']:.0f}) {n['gap']}칸 {n['name']}")

    wheel = COMPASS
    if args.dirs:
        want = [d.strip() for d in args.dirs.split(",") if d.strip()]
        wheel = [c for name in want for c in COMPASS if c[0] == name]
        if not wheel:
            print("모르는 방위다. 쓸 수 있는 것:",
                  ", ".join(c[0] for c in COMPASS))
            return 1

    ways = {}
    for i, who in enumerate(crew):
        name, dx, dy = wheel[i % len(wheel)]
        ways[who] = {"name": name, "dx": dx, "dy": dy, "leg": 0, "found": None}
        print(f"{who}: {name}쪽 정찰")

    while any(w["found"] is None and w["leg"] < args.legs for w in ways.values()):
        try:
            for who, way in ways.items():
                if way["found"] is not None or way["leg"] >= args.legs:
                    continue
                state = busy(ai, who)
                if state is None:
                    print(f"  {who} 가 돌아오지 못했다 ({way['name']}쪽)")
                    way["found"] = "죽음"
                    continue
                if state:
                    continue

                way["leg"] += 1
                reach = LEG * way["leg"]
                at = (int(hx + way["dx"] * reach), int(hy + way["dy"] * reach))
                seen = near(ai, at)
                if int(seen["nests"]) or int(seen["worms"]):
                    way["found"] = at
                    print(f"{who}: {way['name']}쪽 {reach}칸 - 둥지 {seen['nests']} "
                          f"웜 {seen['worms']} 적 {seen['units']}. 여기서 멈춘다")
                    continue
                submit(ai, who, [("walk_to", {"x": at[0], "y": at[1]})], strict=False)
                print(f"{who}: {way['name']}쪽 {reach}칸까지 ({at[0]},{at[1]})")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)

    print()
    found = sightings(ai, (hx, hy), MAX_REACH)
    if not found:
        print(f"{MAX_REACH}칸 안에 둥지가 안 보인다. 당분간은 확장만 경계하면 된다.")
    else:
        print(f"둥지 {len(found)}곳:")
        for n in found[:8]:
            side = "동" if n["x"] > hx else "서"
            side += "남" if n["y"] > hy else "북"
            print(f"  ({n['x']:.0f},{n['y']:.0f}) {n['gap']}칸 {side}쪽")
        print(f"\n가장 가까운 것이 {found[0]['gap']}칸. "
              f"방어선은 그쪽부터 긋는다.")
    for who, way in ways.items():
        submit(ai, who, [("walk_to", {"x": hx, "y": hy})], strict=False)
    print("정찰병 귀환 지시")
    return 0


if __name__ == "__main__":
    sys.exit(main())

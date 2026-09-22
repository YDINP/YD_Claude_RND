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

# 한 다리를 짧게 잡는다. 420칸을 한 번에 시키면 길찾기가 포기하고,
# 포기한 것을 이쪽에서 못 보면 «간 줄 알고» 다음 다리로 넘어간다 -
# 20회차에 정확히 그랬다. 여섯 다리를 찍고 아무도 안 움직였다.
LEG = 40
MAX_REACH = 900           # 이보다 멀리 간 둥지는 당장 우리 일이 아니다 (시작 안전지대 400% 맵이라 넓게)
LOOK = 90                 # 발밑에서 이만큼 둘러본다
FLEE_AT = 70              # 걷는 «도중» 이 안에 적이 보이면 돌아선다
FLEE_BACK = 120           # 집 쪽으로 이만큼 물러난다

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




def unstick(ai, who) -> bool:
    """절벽 모서리에 몸이 낀 정찰병을 한 칸 옆으로 뺀다.

    21회차에 두 번 있었다: (-400,-9) 우라늄밭 절벽, (32,692) 절벽 주머니.
    몸의 충돌 상자가 절벽에 겹치면 길찾기는 출발점부터 막혀 «길 없음»만
    내고, 정찰은 거기서 접힌다. 옆 빈 칸으로 한 칸 옮기는 것뿐 - 걸어서 갈
    수 있는 자리로 «걸어서 갈 수 있게» 되돌리는 것이다. 멀리 옮기지 않는다.
    """
    live = crew_state(ai).get(who)
    if not live:
        return False
    got = ai.lua("""(function()
      local s = game.surfaces[1]
      local c = s.find_entities_filtered{type = "character", force = game.forces.player,
                  area = {{%f, %f}, {%f, %f}}}[1]
      if not c then return { ok = 0 } end
      local spot = s.find_non_colliding_position("character", c.position, 4, 0.5)
      if not spot then return { ok = 0 } end
      return { ok = c.teleport(spot) and 1 or 0, x = spot.x, y = spot.y }
    end)()""" % (live["x"] - 1, live["y"] - 1, live["x"] + 1, live["y"] + 1))
    if int(got.get("ok", 0)):
        print(f"  {who}: 절벽에 낀 몸을 ({got['x']:.1f},{got['y']:.1f}) 로 뺐다")
        return True
    return False


def crew_state(ai):
    """이름 -> (살아있나, 바쁜가, 어디). 위치까지 «같은 답»에서 받는다."""
    out = {}
    for row in ai.list():
        out[row["name"]] = {
            "alive": bool(row.get("alive")),
            "busy": bool(row.get("current") or row.get("queued")),
            "x": float(row.get("x") or 0), "y": float(row.get("y") or 0),
        }
    return out


# 지도는 «직접 열지 않는다».
#
#     사용자: "맵을 직접 열기보단, 캐릭터가 이동해서 안개가 걷히는
#              부분만 체크가되어야함. 다음부턴 그러지마셈"
#
# force.chart 를 부르면 안개가 걷히고 청크가 생성된다. 빠르고 편하지만,
# 그렇게 얻은 지도는 «아무도 가 보지 않은» 지도다. 정찰이라는 일 자체가
# 없어지고, 「여기까지는 안전하다」는 말의 근거도 같이 사라진다.
#
# 이 고리가 아는 것은 정찰병이 실제로 «발로 밟은» 만큼이다.


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--home", required=True, help="기지. 음수는 --home=-20,-90")
    ap.add_argument("--legs", type=int, default=6, help="한 사람이 나아갈 다리 수")
    ap.add_argument("--dirs", default=None,
                    help="갈 방위. 예: 남,북,남동. 안 주면 동.서부터")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--skip", type=int, default=0,
                    help="이미 간 다리 수. 밖에 나가 있는 정찰병을 집까지 되돌리지 않는다")
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
        ways[who] = {"name": name, "dx": dx, "dy": dy, "leg": args.skip, "found": None}
        print(f"{who}: {name}쪽 정찰")

    while any(w["found"] is None and w["leg"] < args.legs for w in ways.values()):
        try:
            crew_now = crew_state(ai)
            for who, way in ways.items():
                if way["found"] is not None or way["leg"] >= args.legs:
                    continue
                me = crew_now.get(who)
                if not me or not me["alive"]:
                    print(f"  {who} 가 돌아오지 못했다 ({way['name']}쪽)")
                    way["found"] = "죽음"
                    continue

                # 걷는 «도중»에도 본다. 다리 끝에서만 보다가 hotel 이 둥지를
                # 지나쳐 걸어 들어가 죽었다 (-40,-746 둥지, 시체 -40,-847).
                # 캐릭터는 스스로 싸우지도 도망치지도 않는다 - 이 고리가
                # 대신 돌아서게 해야 한다.
                seen = near(ai, (me["x"], me["y"]), FLEE_AT)
                if int(seen["nests"]) or int(seen["worms"]) or int(seen["units"]):
                    try:
                        ai.agent(who).cancel()
                    except RconError:
                        pass
                    dx, dy = hx - me["x"], hy - me["y"]
                    span = max(1.0, math.hypot(dx, dy))
                    back = (me["x"] + dx / span * FLEE_BACK, me["y"] + dy / span * FLEE_BACK)
                    submit(ai, who, [("walk_to", {"x": back[0], "y": back[1]})], strict=False)
                    way["found"] = (int(me["x"]), int(me["y"]))
                    print(f"{who}: {way['name']}쪽 ({me['x']:.0f},{me['y']:.0f}) 에서 적을 봤다 - "
                          f"둥지 {seen['nests']} 웜 {seen['worms']} 적 {seen['units']}. "
                          f"집 쪽으로 {FLEE_BACK}칸 물러난다")
                    continue
                if me["busy"]:
                    continue

                # 「한가해졌다」는 «도착했다»가 아니다. 길찾기가 포기해도
                # 한가해진다. 다음 다리로 넘어가기 전에 «발이 어디 있나»를
                # 본다 - 이 한 줄이 없어서 여섯 다리를 헛찍었다.
                goal = way.get("goal")
                if goal:
                    gap = math.hypot(me["x"] - goal[0], me["y"] - goal[1])
                    if gap > 12:
                        way["stalls"] = way.get("stalls", 0) + 1
                        if way["stalls"] == 2:
                            unstick(ai, who)
                        if way["stalls"] > 3:
                            print(f"  {who}: {way['name']}쪽 {gap:.0f}칸을 못 좁힌다 "
                                  f"- 여기서 접는다 ({me['x']:.0f},{me['y']:.0f})")
                            way["found"] = "막힘"
                            continue
                        print(f"  {who}: 아직 {gap:.0f}칸 남았다 - 다시 보낸다")
                        submit(ai, who, [("walk_to", {"x": goal[0], "y": goal[1]})],
                               strict=False)
                        continue
                    # 여기까지 «실제로» 왔다. 보고 그린다.
                    way["stalls"] = 0
                    seen = near(ai, goal)
                    if int(seen["nests"]) or int(seen["worms"]):
                        way["found"] = goal
                        print(f"{who}: {way['name']}쪽 {LEG * way['leg']}칸 - "
                              f"둥지 {seen['nests']} 웜 {seen['worms']} "
                              f"적 {seen['units']}. 여기서 멈춘다")
                        continue

                way["leg"] += 1
                reach = LEG * way["leg"]
                at = (int(hx + way["dx"] * reach), int(hy + way["dy"] * reach))
                way["goal"] = at
                submit(ai, who, [("walk_to", {"x": at[0], "y": at[1]})], strict=False)
                print(f"{who}: {way['name']}쪽 {reach}칸까지 ({at[0]},{at[1]})")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(min(args.every, 6))     # 도중 살피기는 자주

    print()
    found = sightings(ai, (hx, hy), MAX_REACH)
    walked = crew_state(ai)
    for who, way in ways.items():
        me = walked.get(who)
        if me:
            print(f"  {who} 는 {way['name']}쪽 "
                  f"({me['x']:.0f},{me['y']:.0f}) 까지 갔다 "
                  f"- 기지에서 {math.hypot(me['x']-hx, me['y']-hy):.0f}칸")
    if not found:
        print(f"«실제로 가 본» 데까지는 둥지가 안 보인다. "
              f"안 가 본 곳은 모르는 것이지 없는 것이 아니다.")
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

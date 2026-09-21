"""Where do belts fight each other. Ask the world, not the plan.

21회차. flow.py 가 "ore 14칸 (-55,44) 부터 - {'transport-belt': 11}" 을
찍는 것을 보고 「벨트 꼬임이 풀렸다」고 말했다. 사용자가 답했다.

    "벨트꼬임 아직인디"

찍힌 것은 «깔라고 시켰다»였다. 깔린 것이 아니었다. 그리고 깔린 것을
재는 것은 그때까지 아무것도 없었다 - 521칸 중 정면으로 마주 선 것이
네 쌍이었는데 어느 출력에도 안 적혔다.

    벨트가 꼬였는지는 계획이 아니라 «세상»이 안다.

세 가지를 가른다. 셋은 고치는 법이 서로 다르다.

  역주행    곧은 줄 한가운데 한 칸만 거꾸로. 양옆이 같은 방향이면
            답이 하나뿐이다 - 그 칸을 양옆에 맞춘다.
  홀로      뒤가 빈 한 칸이 남의 줄에 정면으로 박혀 있다. 예전 계획이
            남긴 부스러기다. 걷어낸다.
  이음매    긴 줄 둘이 마주 달려와 만난다. 여기는 답이 하나가 아니다 -
            어느 쪽이 양보할지는 «무엇을 어디로 보내려던 것인가»를
            알아야 정한다. 그래서 고치지 않고 «적는다».

옆으로 얹히는 것(side-load)은 꼬임이 아니다. 직각으로 들어오는 것은
팩토리오가 받아 준다. 마주 선 것만이 멈춘다.

    python scripts/knots.py                 # 보기만
    python scripts/knots.py --fix           # 고칠 수 있는 것만 고친다
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402

# 팩토리오의 방향 값. 2.0 에서 벨트는 넷만 쓴다.
STEP = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}
FACE = {0: "북", 4: "동", 8: "남", 12: "서"}
BACK = {0: 8, 4: 12, 8: 0, 12: 4}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def belts(ai) -> dict:
    """{(x, y): direction} - 칸 번호로. 벨트는 1x1 이라 중심이 +0.5 다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, b in pairs(s.find_entities_filtered{
            type = "transport-belt", force = f}) do
        out[#out+1] = math.floor(b.position.x) .. "|"
                   .. math.floor(b.position.y) .. "|" .. b.direction
      end
      return out
    end)()""")
    out = {}
    for row in _rows(reply):
        parts = str(row).split("|")
        if len(parts) == 3:
            out[(int(parts[0]), int(parts[1]))] = int(parts[2])
    return out


def ahead(spot, dir_):
    dx, dy = STEP.get(dir_, (0, 0))
    return (spot[0] + dx, spot[1] + dy)


def behind(spot, dir_):
    return ahead(spot, BACK.get(dir_, dir_))


def head_on(world) -> list:
    """서로를 마주 보는 쌍. 여기서 물건은 영원히 멈춘다."""
    out = []
    for spot, dir_ in world.items():
        other = ahead(spot, dir_)
        if world.get(other) == BACK.get(dir_):
            pair = tuple(sorted((spot, other)))
            if pair not in out:
                out.append(pair)
    return out


def sort_knots(world, pairs) -> dict:
    """쌍마다 «어떤 꼬임인가». 고치는 법이 다르므로 갈라 둔다."""
    kinds = {"역주행": [], "홀로": [], "이음매": []}
    for one, two in pairs:
        for me, you in ((one, two), (two, one)):
            mine = world[me]
            # 역주행: 내 뒤와 상대가 같은 방향이면 나 하나만 거꾸로다.
            back = behind(me, mine)
            if world.get(back) == world[you]:
                kinds["역주행"].append((me, world[you], you))
                break
            # 홀로: 뒤가 비었고 앞은 남의 줄이다. 아무것도 안 나른다.
            if back not in world:
                kinds["홀로"].append((me, world[you], you))
                break
        else:
            kinds["이음매"].append((one, two))
    return kinds


def run_length(world, spot) -> int:
    """이 칸이 속한 곧은 줄의 길이. 이음매에서 «누가 긴가»를 묻는 데 쓴다."""
    dir_ = world[spot]
    n, at = 1, spot
    while world.get(ahead(at, dir_)) == dir_:
        at = ahead(at, dir_)
        n += 1
    at = spot
    while world.get(behind(at, dir_)) == dir_:
        at = behind(at, dir_)
        n += 1
    return n


def turn(ai, spots) -> int:
    """벨트를 돌린다. 한 번에 여러 칸.

    칸 번호로 찾는다 - 반경으로 물으면 옆 칸을 집는다. 실제로 집었다.
    """
    if not spots:
        return 0
    bits = ";".join("%d,%d,%d" % (x, y, d) for (x, y), d in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local done = 0
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y, d = string.match(bit, "(-?%%d+),(-?%%d+),(%%d+)")
        x, y, d = tonumber(x), tonumber(y), tonumber(d)
        for _, b in pairs(s.find_entities_filtered{type = "transport-belt",
              force = f, area = {{x, y}, {x + 1, y + 1}}}) do
          if math.floor(b.position.x) == x and math.floor(b.position.y) == y then
            b.direction = d
            done = done + 1
          end
        end
      end
      return { done = done }
    end)()""" % bits)
    return int(reply["done"])


def lift(ai, spots) -> int:
    """걷어낸다. 걷어낸 것은 땅에 떨어뜨리지 않는다 - 주울 사람이 없다."""
    if not spots:
        return 0
    bits = ";".join("%d,%d" % (x, y) for x, y in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local done = 0
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "(-?%%d+),(-?%%d+)")
        x, y = tonumber(x), tonumber(y)
        for _, b in pairs(s.find_entities_filtered{type = "transport-belt",
              force = f, area = {{x, y}, {x + 1, y + 1}}}) do
          if math.floor(b.position.x) == x and math.floor(b.position.y) == y then
            b.destroy()
            done = done + 1
          end
        end
      end
      return { done = done }
    end)()""" % bits)
    return int(reply["done"])


def report(world, kinds, dangling) -> None:
    total = len(world)
    hurt = sum(len(v) for v in kinds.values())
    print(f"  벨트 {total}칸 · 마주 선 자리 {hurt}곳 · 막다른 끝 {len(dangling)}곳")
    for spot, want, other in kinds["역주행"]:
        print(f"    역주행 {spot} {FACE.get(world[spot])}"
              f" -> {FACE.get(want)} (양옆이 {FACE.get(want)})")
    for spot, want, other in kinds["홀로"]:
        print(f"    홀로   {spot} {FACE.get(world[spot])}"
              f" - 뒤가 비었다, {other} 에 정면으로 박힌다")
    for one, two in kinds["이음매"]:
        a, b = run_length(world, one), run_length(world, two)
        print(f"    이음매 {one} {FACE.get(world[one])}({a}칸)"
              f" <-> {two} {FACE.get(world[two])}({b}칸)"
              f" - 어느 쪽이 양보할지는 사람이 정한다")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true",
                    help="고칠 수 있는 것만 고친다 (이음매는 건드리지 않는다)")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            world = belts(ai)
            kinds = sort_knots(world, head_on(world))
            dangling = [s for s, d in world.items()
                        if ahead(s, d) not in world
                        and behind(s, d) in world]
            report(world, kinds, dangling)
            if args.fix:
                spun = turn(ai, [(s, want) for s, want, _ in kinds["역주행"]])
                gone = lift(ai, [s for s, _, _ in kinds["홀로"]])
                if spun or gone:
                    print(f"    -> 돌린 것 {spun}칸, 걷어낸 것 {gone}칸")
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Belt the smelter row: one lane, two rows of furnaces, no hands.

20회차 실측이 손으로 나르는 것의 끝을 보여 줬다.

    화로 24대  «전부» 결과칸이 가득 차 막힘 (물고 있는 판 2368)
    밭 상자    철광석 16289 · 구리광 9213
    창고       철판 0

운반 당번을 셋으로 늘리고 한 번에 드는 양을 다섯 배로 올려도 되돌아온다.
채굴기는 서른셋이고 화로는 스물넷인데 손은 여덟 개뿐이기 때문이다.

    벨트는 «자는 동안에도» 나른다.

이 줄의 모양은 화로가 정한다. 화로는 2x2 라 (x,0) 에 세우면 y=-1 과
y=0 두 줄을 차지한다. 그래서 «줄과 줄 사이»가 비고, 그 사이에 벨트를
한 줄 깔면 위아래 화로를 한꺼번에 받는다 - 두 줄을 따로 까는 것보다
벨트도 절반, 걸음도 절반이다.

    y=0  화로   . . 인서터 (x,1) 는 북쪽(화로)에서 집어 남쪽 벨트에
    y=2  벨트   <---- 창고 쪽으로
    y=3  인서터 (x,3) 는 남쪽(화로)에서 집어 북쪽 벨트에
    y=5  화로

    python scripts/outfeed.py --who delta --row=0 --lane=2 --depot=30,0
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

BELT = "transport-belt"
ARM = "inserter"          # 전기 인서터. 간선이 이어진 뒤에 쓴다
BURNER = "burner-inserter"

WEST, EAST, NORTH, SOUTH = 12, 4, 0, 8
PER_TRIP = 18             # 한 걸음에 놓는 칸 수

# 한 칸에 드는 재료. craft 가 중간재를 알아서 만들어 주므로 «원재료»로 센다.
COST = {BELT: {"iron-plate": 2},
        ARM: {"iron-plate": 3, "copper-plate": 2},
        BURNER: {"iron-plate": 3}}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def furnace_xs(ai, y):
    """이 줄에 화로가 «실제로» 선 x 들. 계획이 아니라 세상에 묻는다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, f in pairs(s.find_entities_filtered{type = "furnace",
                force = game.forces.player}) do
        if math.floor(f.position.y + 0.5) == %d then
          out[#out+1] = string.format("%%.0f", f.position.x)
        end
      end
      return out
    end)()""" % y)
    return sorted(int(x) for x in _rows(reply))


def plan(ai, rows, lane, depot, arm):
    """깔 것 전부. 벨트 한 줄 + 위아래 인서터 + 창고로 넣는 팔 하나."""
    seats = []
    xs = set()
    for y in rows:
        for x in furnace_xs(ai, y):
            xs.add(x)
            if y < lane:
                # 화로가 위에 있다 -> 팔은 화로 «바로 아래», 북쪽에서 집는다
                seats.append({"x": x, "y": lane - 1, "what": arm, "dir": NORTH,
                              "why": f"화로 y={y}"})
            else:
                seats.append({"x": x, "y": lane + 1, "what": arm, "dir": SOUTH,
                              "why": f"화로 y={y}"})
    if not xs:
        return []

    far, near = max(xs), min(xs)
    # 벨트는 «창고 쪽»으로 흐른다. 창고가 서쪽이면 서쪽으로.
    dx, dy = depot
    head = dx + 2                      # 내려가는 자리
    belts = [{"x": x, "y": lane, "what": BELT, "dir": WEST, "why": "간선"}
             for x in range(far, head - 1, -1)]
    # 내려가서 창고 높이로.
    for y in range(lane - 1, dy - 1, -1) if lane > dy else range(lane + 1, dy + 1):
        belts.append({"x": head, "y": y, "what": BELT,
                      "dir": NORTH if lane > dy else SOUTH, "why": "내려가는 길"})
    belts.append({"x": head, "y": dy, "what": BELT, "dir": WEST, "why": "창고 앞"})
    arm_at = {"x": head - 1, "y": dy, "what": arm, "dir": EAST, "why": "창고에 넣는 팔"}
    return belts + seats + [arm_at]


def standing(ai, seats):
    """이미 제대로 서 있는 칸은 빼고, 막힌 칸은 «무엇이 막았는지» 알려 준다."""
    if not seats:
        return [], []
    body = ", ".join('{%d,%d,"%s"}' % (s["x"], s["y"], s["what"]) for s in seats)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local want = { %s }
      local out = {}
      for i, w in ipairs(want) do
        local here = s.find_entities_filtered{
          area = {{w[1], w[2]}, {w[1] + 1, w[2] + 1}}, force = f}
        local mine, other = nil, nil
        for _, e in pairs(here) do
          if e.name == w[3] then mine = e
          elseif e.type ~= "item-entity" and e.type ~= "character" then
            other = e.name
          end
        end
        if mine then out[i] = "ok"
        elseif other then out[i] = "블록:" .. other
        else out[i] = "빈칸" end
      end
      return out
    end)()""" % body)
    state = _rows(reply)
    todo, blocked = [], []
    for i, seat in enumerate(seats):
        if i >= len(state):
            break
        cell = str(state[i])
        if cell == "빈칸":
            todo.append(seat)
        elif cell.startswith("블록:"):
            blocked.append((seat, cell[3:]))
    return todo, blocked


def build(ai, who, todo, shelf, arm):
    want: dict = {}
    for one in todo:
        want[one["what"]] = want.get(one["what"], 0) + 1
    need: dict = {}
    for part, count in want.items():
        for item, each in COST.get(part, {}).items():
            need[item] = need.get(item, 0) + each * count

    steps = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                          "y": shelf["iron-plate"][1] + 1})]
    for item, count in need.items():
        at = shelf.get(item)
        if at:
            steps.append(("take", {"name": item, "x": at[0], "y": at[1],
                                   "count": count}))
    for part, count in want.items():
        steps.append(("craft", {"recipe": part, "count": count, "wait": False}))
    steps.append(("walk_to", {"x": todo[0]["x"] + 2, "y": todo[0]["y"] + 2}))
    for one in todo:
        steps.append(("build", {"name": one["what"], "x": one["x"],
                                "y": one["y"], "direction": one["dir"]}))
    submit(ai, who, steps, strict=False)
    print(f"{who}: {dict(want)} - ({todo[0]['x']},{todo[0]['y']}) 부터")


def powered(ai):
    """기지에 전기가 «흐르나». 전기 인서터는 그 뒤에 쓴다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local n = 0
      for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f}) do
        if p.electric_network_statistics and
           p.energy_source and true then n = n end
      end
      local nets = {}
      for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f}) do
        nets[p.electric_network_id] = (nets[p.electric_network_id] or 0) + 1
      end
      local count = 0
      for _ in pairs(nets) do count = count + 1 end
      return { nets = count }
    end)()""")
    return int(reply["nets"]) == 1


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--rows", default="0,5", help="받을 화로 줄. 예: 0,5")
    ap.add_argument("--lane", type=int, default=2, help="벨트가 지나는 줄")
    ap.add_argument("--depot", required=True, help="음수는 --depot=-5,-90")
    ap.add_argument("--burner", action="store_true",
                    help="전기가 아직이면 버너 인서터로 깐다")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=2000)
    args = ap.parse_args()

    crew = args.who or ["delta"]
    rows = [int(v) for v in args.rows.split(",")]
    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5),
             "copper-plate": (dx + 0.5, dy + 6.5)}

    ai = AIBridge()
    arm = BURNER if args.burner else ARM
    if not args.burner and not powered(ai):
        print("전력망이 아직 하나가 아니다 - 전기 인서터는 서도 안 돈다.")
        print("  간선을 먼저 잇거나 --burner 로 깔 것.")
        return 1

    for _ in range(args.rounds):
        try:
            seats = plan(ai, rows, args.lane, (dx, dy), arm)
            todo, blocked = standing(ai, seats)
            if not todo:
                print(f"줄이 다 섰다 - {len(seats)}칸")
                if blocked:
                    print(f"  (막힌 칸 {len(blocked)}개: "
                          f"{', '.join(f'{b[1]}' for b in blocked[:4])})")
                return 0
            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue
            if blocked:
                print(f"  막힌 칸 {len(blocked)}개 - "
                      f"{blocked[0][0]['x']},{blocked[0][0]['y']} 에 "
                      f"{blocked[0][1]}")
            build(ai, free[0], todo[:PER_TRIP], shelf, arm)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

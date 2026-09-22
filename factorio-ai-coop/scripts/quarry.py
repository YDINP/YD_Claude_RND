"""Stone goes into a box, not onto a belt.

돌은 다른 광석과 다르다. 화로에 넣으면 벽돌이 되고, 벽돌은 벨트를 타고
철판 선반에 섞인다. 그런데 돌 그 자체가 필요한 데가 있다 - 화로(5), 가마,
그리고 돌벽(벽돌 5 = 돌 10) 한 바퀴에 돌 200.

    돌밭은 철밭 서쪽에 «붙어» 있다 (x -99..-81, y 40..56).
    벨트로 잇지 않는다. 채굴기가 상자에 바로 떨군다.

전기 채굴기 3x3 은 몸 바로 바깥 한 칸에 떨군다. 그 칸에 철상자(32칸 =
돌 1,600) 를 둔다. 상자가 차면 채굴기는 선다 - 그것이 맞다. 돌은
«쓰는 만큼» 캐면 되고, 나르는 것은 haul.py 가 «밭 상자의 돌»로 이미 한다.

    python scripts/quarry.py                 # 돌 재고와 채굴기
    python scripts/quarry.py --who golf      # 모자라면 한 대 더
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

DRILL = "electric-mining-drill"
BOX = "iron-chest"
POLE = "small-electric-pole"
DEPOT = (-55, 10)
FIELD = (-100, 39, -80, 58)             # 돌밭 네모
MAX_DRILLS = 3
FLOOR = 400                             # 창고 돌이 이보다 적으면 한 대 더


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def survey(ai) -> dict:
    """돌밭의 채굴기 수, 상자 속 돌, 다음 자리(5x5 돌만 있고 남쪽에 상자 놓을 곳)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local box = {{%d, %d}, {%d, %d}}
      local drills = s.count_entities_filtered{name = "%s", force = f, area = box}
      local piled = 0
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f, area = box}) do
        piled = piled + c.get_item_count("stone")
      end
      local main = -1
      for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
        if g.electric_network_id then main = g.electric_network_id break end
      end
      local best, bx, by, lit = 0, nil, nil, false
      for x = %d + 2, %d - 2, 3 do
        for y = %d + 2, %d - 3, 3 do
          local cx, cy = x + 0.5, y + 0.5
          local amount, foreign = 0, 0
          for _, r in pairs(s.find_entities_filtered{type = "resource",
                area = {{cx - 2.5, cy - 2.5}, {cx + 2.5, cy + 2.5}}}) do
            if r.name == "stone" then amount = amount + r.amount else foreign = foreign + 1 end
          end
          local ok = foreign == 0 and amount > best
            and s.can_place_entity{name = "%s", position = {cx, cy}, direction = 8, force = f,
                                   build_check_type = defines.build_check_type.manual}
            and s.can_place_entity{name = "%s", position = {cx, cy + 2}, force = f,
                                   build_check_type = defines.build_check_type.manual}
          if ok then
            best, bx, by = amount, cx, cy
            lit = false
            for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f,
                  area = {{cx - 3.5, cy - 3.5}, {cx + 3.5, cy + 3.5}}}) do
              if p.electric_network_id == main then lit = true end
            end
          end
        end
      end
      return { drills = drills, piled = piled, ore = best, x = bx, y = by, lit = lit }
    end)()""" % (FIELD[0], FIELD[1], FIELD[2], FIELD[3], DRILL,
                 FIELD[0], FIELD[2], FIELD[1], FIELD[3], DRILL, BOX))


def add(ai, who, seat) -> None:
    x, y = float(seat["x"]), float(seat["y"])
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    plan = []
    for item, n in ((DRILL, 1), (BOX, 1), (POLE, 0 if seat.get("lit") else 1)):
        if n and int(bag.get(item, 0)) < n:
            plan.append(("craft", {"recipe": item, "count": n, "wait": True}))
    plan.append(("walk_to", {"x": x + 3, "y": y + 2}))
    plan.append(("build", {"name": DRILL, "x": x, "y": y, "direction": 8}))
    plan.append(("build", {"name": BOX, "x": x, "y": y + 2}))
    if not seat.get("lit"):
        plan.append(("build", {"name": POLE, "x": x + 2, "y": y + 2}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 돌 채굴기 ({x},{y}) 남향, 상자 ({x},{y + 2})"
          + ("" if seat.get("lit") else " + 전봇대 (wire.py 로 잇는다)"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    ai = AIBridge()
    got = survey(ai)
    stock = sum(c["held"].get("stone", 0) for c in shelf_mod.stock(ai, DEPOT, span=36))
    print(f"  돌밭 채굴기 {got['drills']}대 · 밭 상자 돌 {got['piled']} · 창고 돌 {stock}")
    if int(got["drills"]) >= MAX_DRILLS:
        return 0
    if stock >= FLOOR and not args.force:
        print("  돌은 넉넉하다")
        return 0
    if not got.get("x"):
        print("  [!] 돌만 있는 자리가 없다")
        return 0
    print(f"  다음 자리 ({got['x']},{got['y']}) 돌 {int(got['ore'])}"
          + (" 전기 닿음" if got.get("lit") else " 전봇대 필요"))
    if args.who and idle(ai, [args.who]):
        add(ai, args.who, got)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

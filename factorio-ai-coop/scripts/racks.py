"""Grow the storage racks before they fill. Capacity, not caps.

사용자가 말했다 - "아니 상자가 부족하면 더 늘리고 물류구조를 계속
개선해나가면 되잔아"

그 말이 나온 까닭: 나는 선반이 한쪽부터 차는 것을 상자의 «칸 제한»으로
눌러서 고르게 만들려 했다(level.py). 제한에 닿은 상자의 팔은 서 버리므로
받는 팔 수가 줄었고, 판금 간선이 막히는 데 한몫했다. 그리고 석탄이
바닥인데 석탄 선반에도 걸려 있었다.

    모자란 것을 «나눠 쓰게» 만드는 것과 «모자라지 않게» 만드는 것은 다르다.
    앞의 것은 부족을 고르게 퍼뜨릴 뿐이다.

한쪽부터 차는 것은 벨트 앞에 상자를 늘어놓은 구조의 본래 모습이다.
그것이 문제가 되는 때는 «다 찼을 때»뿐이고, 그 답은 상자다.

선반 한 줄은 벨트 하나, 그 옆의 팔 줄, 그 옆의 상자 줄이다. 벨트는 이미
간선 길이만큼 깔려 있으므로 늘리는 일은 (상자 + 팔 + 팔 연료) 한 벌이다.

    python scripts/racks.py                 # 여유만 본다
    python scripts/racks.py --who hotel     # 모자라면 늘린다
    python scripts/racks.py --who hotel --every 60
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
import shelf as shelf_mod                # noqa: E402

DEPOT = (-55, 10)

BOX = "iron-chest"
ARM = "burner-inserter"
ARM_FUEL = 4

ENOUGH = 100_000          # 이만큼 쌓였으면 선반을 더 안 늘린다 - 남는 것이지 병목이 아니다


def rack_item(rack) -> str:
    return {"철판": "iron-plate", "구리판": "copper-plate"}[rack[0]]


# 선반 줄. 팔의 direction 은 «집는 쪽»이다.
#   name, 벨트 y, 팔 y, 상자 y, 팔 방향, 놓을 수 있는 x 범위(동 -> 서 순으로 찬다)
RACKS = (
    ("철판", 8, 9, 10, 0, -23, -61),
    ("구리판", 7, 6, 5, 8, -23, -61),
)

# 둘째 줄. 첫 줄 상자가 차면 그 «뒤»에 팔 하나와 상자 하나를 더 둔다.
#   상자(첫 줄) -> 팔 -> 상자(둘째 줄).  팔의 direction 은 집는 쪽 = 첫 줄.
# 실측: 첫 줄 39+39 상자가 전부 찼다 (판금 25만). 자리도 다 썼다. 벨트 앞
# 자리는 늘릴 수 없지만 뒤로는 늘릴 수 있다 - 앞 상자가 비는 만큼 팔이 받는다.
#   name, 앞 상자 y, 팔 y, 뒤 상자 y, 팔 방향, x 범위 (동 -> 서)
BACK = (
    ("철판", 10, 11, 12, 0, -23, -48),     # x -49 서쪽은 돌 줄이다
    ("구리판", 5, 4, 3, 8, -23, -61),
)

FLOOR = 250               # 빈 칸이 이보다 적으면 늘린다 (한 칸 = 판금 100장)
# 빈 칸 수만 보면 틀린다. 벨트 앞의 팔은 «제 상자»에만 넣으므로 받는 속도는
# 「빈 상자가 몇 개냐」에 달렸다. 실측: 빈 칸 468 인데 팔 37 중 28 이
# 「놓을 데 없음」 - 아홉 상자만 받고 있었고 간선은 그 뒤로 꽉 찼다.
OPEN_FLOOR = 8            # 빈 칸 있는 상자가 이보다 적으면 늘린다
PER_TRIP = 6              # 한 걸음에 늘리는 자리 수 (한 자리 = 5단계)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def survey(ai, rack):
    """이 줄의 빈 칸 수와, 아직 비어 있는 자리들."""
    _name, belt_y, arm_y, box_y, _face, x_east, x_west = rack
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local free, boxes, open_, seats = 0, 0, 0, {}
      for x = %d, %d, -1 do
        local box = s.find_entities_filtered{type = "container", force = f,
                      area = {{x, %d}, {x + 1, %d}}}[1]
        if box then
          boxes = boxes + 1
          local inv = box.get_inventory(defines.inventory.chest)
          local room = 0
          for i = 1, #inv do
            if not inv[i].valid_for_read then room = room + 1 end
          end
          free = free + room
          if room > 0 then open_ = open_ + 1 end
        else
          local belt = s.count_entities_filtered{type = "transport-belt",
                         force = f, area = {{x, %d}, {x + 1, %d}}} > 0
          local ok = belt
            and s.can_place_entity{name = "%s", position = {x + 0.5, %d + 0.5}, force = f}
            and s.can_place_entity{name = "%s", position = {x + 0.5, %d + 0.5}, force = f}
          if ok then seats[#seats+1] = x end
        end
      end
      return { free = free, boxes = boxes, open = open_, seats = seats }
    end)()""" % (x_east, x_west, box_y, box_y + 1, belt_y, belt_y + 1,
                 BOX, box_y, ARM, arm_y))
    return (int(reply["free"]), int(reply["boxes"]), int(reply["open"]),
            [int(x) for x in _rows(reply.get("seats"))])


def survey_back(ai, tier):
    """뒤 줄이 필요한 자리: 앞 상자가 찼고 뒤 상자가 없는 x."""
    _name, front_y, arm_y, back_y, _face, x_east, x_west = tier
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local seats, backs = {}, 0
      for x = %d, %d, -1 do
        local front = s.find_entities_filtered{type = "container", force = f,
                        area = {{x, %d}, {x + 1, %d}}}[1]
        local back = s.find_entities_filtered{type = "container", force = f,
                        area = {{x, %d}, {x + 1, %d}}}[1]
        if back then backs = backs + 1 end
        if front and not back then
          local inv = front.get_inventory(defines.inventory.chest)
          if inv.count_empty_stacks() == 0
             and s.can_place_entity{name = "%s", position = {x + 0.5, %d + 0.5}, force = f}
             and s.can_place_entity{name = "%s", position = {x + 0.5, %d + 0.5}, force = f} then
            seats[#seats+1] = x
          end
        end
      end
      return { seats = seats, backs = backs }
    end)()""" % (x_east, x_west, front_y, front_y + 1, back_y, back_y + 1,
                 BOX, back_y, ARM, arm_y))
    return int(reply["backs"]), [int(x) for x in _rows(reply.get("seats"))]


def grow(ai, who, rack, seats):
    name, _belt_y, arm_y, box_y, face, _e, _w = rack
    seats = seats[:PER_TRIP]
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    plan = []
    for item in (BOX, ARM):
        short = len(seats) - int(bag.get(item, 0))
        if short > 0:
            plan.append(("craft", {"recipe": item, "count": short,
                                   "wait": item == ARM}))
    fuel = int(bag.get("coal", 0)) >= ARM_FUEL * len(seats)
    if not fuel:
        # 「팔 연료는 보급 당번 몫」이라고 미뤘더니 아무 당번도 선반 팔은
        # 안 봤다. 새 여섯 자리가 연료 없이 서 있는 동안 철판 줄이 찼다.
        # 짓는 사람이 석탄 선반에서 챙겨 간다.
        coal_at = shelf_mod.shelves(ai, DEPOT, span=36).get("coal")
        if coal_at:
            plan.append(("walk_to", {"x": coal_at[0], "y": coal_at[1] + 1.5}))
            plan.append(("take", {"name": "coal", "x": coal_at[0], "y": coal_at[1],
                                  "count": ARM_FUEL * len(seats)}))
            fuel = True
    away = 2 if box_y > arm_y else -2       # 상자 «바깥쪽»에 서서 짓는다
    for x in seats:
        plan.append(("walk_to", {"x": x + 0.5, "y": box_y + 0.5 + away}))
        plan.append(("build", {"name": BOX, "x": x + 0.5, "y": box_y + 0.5}))
        plan.append(("build", {"name": ARM, "x": x + 0.5, "y": arm_y + 0.5,
                               "direction": face}))
        if fuel:
            plan.append(("insert", {"name": "coal", "x": x + 0.5,
                                    "y": arm_y + 0.5, "count": ARM_FUEL}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: {name} 선반 {len(seats)}자리 더 (y {box_y}, x {seats[0]}~{seats[-1]})"
          + ("" if fuel else " - 석탄 선반이 비어 팔 연료를 못 챙겼다"))
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--floor", type=int, default=FLOOR)
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    names = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            hands = idle(ai, names) if names else []
            for rack in RACKS:
                free, boxes, open_, seats = survey(ai, rack)
                if free >= args.floor and open_ >= OPEN_FLOOR:
                    print(f"  {rack[0]} 선반: 상자 {boxes}개 · 빈 상자 {open_}"
                          f" · 빈 칸 {free} - 넉넉하다")
                    continue
                if not seats:
                    # 실측(21회차): 철판 21만 장이 선반에 쌓인 채 「줄을 더 내야 한다」
                    # 가 순번마다 찍혔다. 선반이 찬 것은 판이 «남는» 것이지 병목이
                    # 아니다 - 벨트가 차면 분배기가 간선으로 다 보낸다. 쌓인 것이
                    # 넉넉하면 조용히 넘어간다.
                    stock = shelf_mod.stock(ai, DEPOT, 36)
                    piled = sum(c["held"].get(rack_item(rack), 0) for c in stock)
                    if piled >= ENOUGH:
                        continue
                    print(f"  {rack[0]} 선반: 빈 상자 {open_} · 빈 칸 {free}"
                          f" - 놓을 자리가 없다. 줄을 더 내야 한다")
                    continue
                if not hands:
                    print(f"  {rack[0]} 선반: 빈 칸 {free} · 자리 {len(seats)}곳"
                          + (" - 손이 비지 않는다" if names else ""))
                    continue
                grow(ai, hands.pop(0), rack, seats)
            for tier in BACK:
                backs, seats = survey_back(ai, tier)
                if not seats:
                    continue
                if not hands:
                    print(f"  {tier[0]} 뒤 줄: 찬 앞 상자 {len(seats)}곳 - 손이 비지 않는다")
                    continue
                grow(ai, hands.pop(0), tier, seats)
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

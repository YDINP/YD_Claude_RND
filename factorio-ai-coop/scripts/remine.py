"""Burners out, chests out, electric drills in rows along the belt.

    사용자: "전기채굴기가 되니까 이제 화력채광드릴+채굴지상자들은 정리해도
             되겠다. 정리하면서 전기채굴기 심시티좀 효율좋게 진행해봐"

버너 채굴기는 콜드스타트의 도구였다 - 전기가 없을 때 손으로 석탄을 먹여
돌리는 것. 전기가 오면 세 가지가 짐이 된다: 석탄을 먹고(150 kW, 전기
채굴기 90 kW 보다 많이), 팔 없이는 상자에만 떨구고, 2x2 라 밭에 듬성듬성
앉는다. 그 곁의 «출구 상자»는 벨트가 없던 때의 임시 출구다.

정리는 두 걸음이다.

  1. 걷기 - 버너 채굴기와 그 출구 상자를 걷고, 든 것(석탄·광석)은 창고로.
  2. 심기 - 밭마다 «벨트 줄»을 미리 잰 대로 깔고(LINES), 그 줄 양옆에
     전기 채굴기를 3칸 간격으로 앉힌다 (edrill.py). 줄 하나에 양옆으로
     채굴기가 붙는 것이 전기 채굴기의 가장 촘촘한 배치다.

         D D D D        D = 3x3 채굴기, 줄을 본다
         =========      = 벨트
         D D D D

줄은 7칸 간격이면 밭을 빈틈없이 덮는다 (3 + 1 + 3).

    python scripts/remine.py                         # 남은 버너와 줄 상태
    python scripts/remine.py --who golf --strip      # 버너 걷기 한 걸음
    python scripts/remine.py --who golf --lay iron-2 # 줄 하나 깔기
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

OLD = "burner-mining-drill"
BELT = "transport-belt"
DEPOT = (-55, 10)
PER_TRIP = 5              # 한 걸음에 걷는 채굴기 수

# 밭마다 깔 줄. 이름 -> (광석, 시작 타일, 끝 타일, 벨트 방향, 흘러드는 곳)
#   줄은 «끝 타일»에서 다음 벨트로 이어져야 한다. 그 다음 벨트가 없으면
#   토막이고, 토막 옆의 채굴기는 토막을 채우고 선다.
#
#   coal-2 : x=-67 기둥을 y=-16 까지 올리고, y=-16 에 두 번째 수집 줄.
#            첫 줄(y=-9)의 북쪽 채굴기가 y -12..-10 을 쓰므로 -13 은 비고,
#            새 줄의 남쪽 채굴기는 y -16..-14 를 쓴다.
#   iron-2 : x=-79 기둥, y=68 -> 56, y=55 줄에 옆으로 들어간다.
#   iron-3 : x=-86 기둥, 같은 식. 밭의 서쪽 끝(x -88..-84)을 덮는다.
LINES = {
    "coal-2": ("coal", [((-67, -16), (-67, -10), 8), ((-78, -16), (-68, -16), 4)]),
    "iron-2": ("iron-ore", [((-79, 68), (-79, 56), 0)]),
    "iron-3": ("iron-ore", [((-86, 68), (-86, 56), 0)]),
    # copper-1: x=-41 기둥이 y=58 에서 옛 창고 정거장의 닫힌 고리로 꺾여
    #           들어가 있었다 - 채굴기 일곱 대의 광석이 영원히 돌았다.
    #           북쪽으로 곧장 y=44 까지 올려 구리 화로 줄(y=43) 남쪽 레인에
    #           옆으로 붙인다.
    # copper-2: y=96 줄 (부자 줄 y 93..95 의 남쪽), 서쪽으로 흘러 x=-41
    #           기둥에 옆으로 붙는다.
    "copper-1": ("copper-ore", [((-41, 58), (-41, 44), 0)]),
    #           줄은 기둥 «앞 칸»(x=-40)에서 끝난다 - 기둥 칸까지 깔면 기둥을
    #           서향으로 갈아엎어 끊는다 (한 번 그랬다).
    "copper-2": ("copper-ore", [((-29, 96), (-40, 96), 12)]),
}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def burners(ai) -> list:
    """[{x, y, ore, coal, chest: (x, y, {item: n}) | None}]"""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, d in pairs(s.find_entities_filtered{name = "%s", force = f}) do
        local dp = d.drop_position
        local tx, ty = math.floor(dp.x), math.floor(dp.y)
        local c = s.find_entities_filtered{type = "container", force = f,
                    area = {{tx, ty}, {tx + 1, ty + 1}}}[1]
        local chest = ""
        if c then
          local bits = {}
          for _, it in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
            bits[#bits+1] = it.name .. "=" .. it.count
          end
          chest = c.position.x .. "," .. c.position.y .. "," .. table.concat(bits, ",")
        end
        out[#out+1] = d.position.x .. "|" .. d.position.y .. "|"
          .. (d.mining_target and d.mining_target.name or "") .. "|"
          .. d.get_fuel_inventory().get_item_count("coal") .. "|" .. chest
      end
      return out
    end)()""" % OLD)
    out = []
    for row in _rows(reply):
        x, y, ore, coal, chest = (str(row).split("|") + [""])[:5]
        box = None
        if chest:
            cx, cy, *bits = chest.split(",")
            held = {}
            for bit in bits:
                if "=" in bit:
                    k, v = bit.split("=", 1)
                    held[k] = int(v)
            box = (float(cx), float(cy), held)
        out.append({"x": float(x), "y": float(y), "ore": ore, "coal": int(coal),
                    "chest": box})
    out.sort(key=lambda d: (d["y"], d["x"]))
    return out


def strip(ai, who, drills) -> bool:
    """버너 몇 대를 걷고 든 것을 창고로. 계획은 64단계 - 다섯 대면 넉넉하다."""
    take = drills[:PER_TRIP]
    if not take:
        return False
    plan, carry = [], {}
    for d in take:
        plan.append(("walk_to", {"x": d["x"] + 2, "y": d["y"] + 2}))
        if d["coal"]:
            plan.append(("take", {"name": "coal", "x": d["x"], "y": d["y"],
                                  "count": d["coal"]}))
            carry["coal"] = carry.get("coal", 0) + d["coal"]
        plan.append(("demolish", {"x": d["x"], "y": d["y"], "name": OLD,
                                  "search_radius": 0.4}))
        if d["chest"]:
            cx, cy, held = d["chest"]
            for item, n in held.items():
                plan.append(("take", {"name": item, "x": cx, "y": cy, "count": n}))
                carry[item] = carry.get(item, 0) + n
            plan.append(("demolish", {"x": cx, "y": cy, "name": "wooden-chest",
                                      "search_radius": 0.4}))
            plan.append(("demolish", {"x": cx, "y": cy, "name": "iron-chest",
                                      "search_radius": 0.4}))
    # 든 것은 창고로. 석탄은 석탄 줄에, 광석은 벨트 줄이 아닌 데에.
    slots = shelf_mod.slots(ai, DEPOT)
    for item, n in carry.items():
        at = slots.get(item) or shelf_mod.spare(ai, DEPOT, span=36, item=item)
        if at:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("insert", {"name": item, "x": at[0], "y": at[1], "count": n}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 버너 {len(take)}대 걷기 "
          f"(x {min(d['x'] for d in take):.0f}~{max(d['x'] for d in take):.0f}"
          f" y {min(d['y'] for d in take):.0f}~{max(d['y'] for d in take):.0f})"
          + (f" - 든 것 {carry}" if carry else ""))
    return True


def tiles_of(start, end) -> list:
    (x0, y0), (x1, y1) = start, end
    if x0 == x1:
        step = 1 if y1 >= y0 else -1
        return [(x0, y) for y in range(y0, y1 + step, step)]
    step = 1 if x1 >= x0 else -1
    return [(x, y0) for x in range(x0, x1 + step, step)]


def laid(ai, tiles, face=None) -> set:
    """이미 벨트가 깔린 타일. face 를 주면 그 방향으로 깔린 것만 센다 -
    모서리를 다시 꺾는 줄은 «있는 벨트»가 아니라 «그 방향의 벨트»가 있어야 한다."""
    if not tiles:
        return set()
    packed = ";".join(f"{x},{y}" for x, y in tiles)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "(-?%%d+),(-?%%d+)")
        x, y = tonumber(x), tonumber(y)
        local b = s.find_entities_filtered{type = "transport-belt", force = f,
              area = {{x, y}, {x + 1, y + 1}}}[1]
        if b and (%s < 0 or b.direction == %s) then
          out[#out+1] = x .. "|" .. y
        end
      end
      return out
    end)()""" % (packed, -1 if face is None else face, -1 if face is None else face))
    return {tuple(int(v) for v in str(r).split("|")) for r in _rows(reply)}


def lay(ai, who, name) -> bool:
    _ore, runs = LINES[name]
    todo = []
    for start, end, face in runs:
        tiles = tiles_of(start, end)
        have = laid(ai, tiles, face)
        todo.extend((x, y, face) for x, y in tiles if (x, y) not in have)
    if not todo:
        print(f"  {name}: 다 깔려 있다")
        return False
    todo = todo[:44]                      # 걷기 몇 번 + 벨트 = 64 단계 안
    try:
        bag = int(ai.agent(who).items().get(BELT, 0))
    except RconError:
        bag = 0
    plan = []
    short = len(todo) - bag
    if short > 0:
        fe = shelf_mod.slots(ai, DEPOT).get("iron-plate") \
            or shelf_mod.shelves(ai, DEPOT, span=36).get("iron-plate")
        if fe:
            plan.append(("walk_to", {"x": fe[0], "y": fe[1] + 1.5}))
            plan.append(("take", {"name": "iron-plate", "x": fe[0], "y": fe[1],
                                  "count": short * 2}))
        plan.append(("craft", {"recipe": BELT, "count": (short + 1) // 2, "wait": True}))
    wrong = laid(ai, [(x, y) for x, y, _f in todo])       # 있는데 방향이 다른 것
    for n, (x, y, face) in enumerate(todo):
        if n % 8 == 0:
            plan.append(("walk_to", {"x": x + 2.5, "y": y + 0.5}))
        if (x, y) in wrong:
            plan.append(("demolish", {"x": x + 0.5, "y": y + 0.5, "name": BELT,
                                      "search_radius": 0.4}))
        plan.append(("build", {"name": BELT, "x": x + 0.5, "y": y + 0.5,
                               "direction": face}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: {name} 줄 벨트 {len(todo)}칸")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--strip", action="store_true", help="버너 채굴기 걷기")
    ap.add_argument("--lay", default="", help="깔 줄 이름 (LINES)")
    args = ap.parse_args()

    ai = AIBridge()
    old = burners(ai)
    boxed = sum(1 for d in old if d["chest"])
    print(f"  버너 채굴기 {len(old)}대 (출구 상자 {boxed}개)")
    for name, (ore, runs) in LINES.items():
        tiles = [t for s, e, _f in runs for t in tiles_of(s, e)]
        print(f"  {name} ({ore}): 벨트 {len(laid(ai, tiles))}/{len(tiles)}칸")
    if not args.who:
        return 0
    hands = idle(ai, [args.who])
    if not hands:
        print(f"  {args.who} 는 손이 비지 않았다")
        return 0
    if args.strip:
        strip(ai, args.who, old)
    elif args.lay:
        lay(ai, args.who, args.lay)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

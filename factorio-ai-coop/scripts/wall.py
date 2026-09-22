"""Ring each outward gun with stone.

    사용자: "외곽쪽 포탑은 돌벽으로 둘러쌓는게 방어력을 올리는거같은데
             추후에 진행해줘"
    사용자(사진을 보고): "벽은 이렇게가아니라 포탑1개를 벽이 둘러쌓는식으로
             방어해야함"

처음엔 바깥 변에 한 줄만 놓았다 - 스무 장 대신 일곱 장이고 길도 안 막힌다고
생각해서다. 사용자가 사진을 보고 바로 잡았다. 바이터는 정면으로만 오지
않는다: 벽 한 줄은 옆으로 돌아 들어오는 것을 막지 못하고, 그러면 포탑이
먼저 맞는다.

    포탑 하나 = 벽 고리 하나.  포탑 몸(2x2) - 빈 칸 한 바퀴 - 벽 한 바퀴.
    6x6 둘레 = 20장 = 벽돌 100 = 돌 200.

빈 칸 한 바퀴는 큰 바이터(사거리 2)가 벽 너머로 포탑을 무는 것을 막는
간격이다 (docs/defence.md). 고리에 «문»은 없다 - 탄약은 팔이 아니라 사람이
넣는데, 사람은 벽을 못 넘는다. 그래서 고리 한 장은 비워 둔다: 포탑의
«안쪽»(무리 중심 쪽) 변 가운데 한 칸. 적은 바깥에서 오고, 그 한 칸은
바깥에서 가장 먼 칸이다.

어느 포탑이 «외곽»인가: 포탑 무리의 한가운데에서 그 포탑 쪽으로 나가는
방향에, 그 포탑보다 더 바깥에 선 포탑이 없으면 외곽이다.

벽돌은 손으로 못 만든다(화로 일이다). 벽돌이 모자라면 창고 옆 가마에
돌과 석탄을 넣고, 구운 것을 꺼내 창고 돌 줄에 둔다. 같은 사람이 같은
순번에 한다 - 벽돌 «만드는 당번»을 따로 두면 그 당번이 잊힌다.

    python scripts/wall.py                  # 어느 포탑이 맨몸인가
    python scripts/wall.py --who golf --every 60
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

WALL = "stone-wall"
BRICK = "stone-brick"
DEPOT = (-55, 10)

GAP = 1                   # 포탑 몸과 벽 사이 빈 칸
RING = 20                 # 6x6 둘레 한 바퀴의 장 수
BRICKS_PER_WALL = 5
CORRIDOR = 6              # 바깥쪽으로 이 폭 안에 더 먼 포탑이 있으면 외곽이 아니다
PER_TRIP = 1              # 한 걸음에 두르는 포탑 수 (계획 64단계 - 벌목 걸음까지)

KILNS = ((-66.0, 20.0), (-66.0, 23.0))   # 벽돌 가마 자리 (2x2 중심)
KILN_STONE = 50
KILN_COAL = 10

# 밖을 보는 방향 -> 벽 줄의 (법선, 접선)
SIDES = {"n": ((0, -1), (1, 0)), "s": ((0, 1), (1, 0)),
         "w": ((-1, 0), (0, 1)), "e": ((1, 0), (0, 1))}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def turrets(ai) -> list:
    reply = ai.lua("""(function()
      local out = {}
      for _, t in pairs(game.surfaces[1].find_entities_filtered{
            name = "gun-turret", force = game.forces.player}) do
        out[#out+1] = t.position.x .. "|" .. t.position.y
      end
      return out
    end)()""")
    return [tuple(float(v) for v in str(r).split("|")) for r in _rows(reply)]


def facing(t, centre, others) -> str | None:
    """이 포탑이 외곽이면 밖을 보는 변, 아니면 None."""
    dx, dy = t[0] - centre[0], t[1] - centre[1]
    dist = math.hypot(dx, dy)
    if dist < 1:
        return None
    ux, uy = dx / dist, dy / dist
    for o in others:
        if o == t:
            continue
        ox, oy = o[0] - t[0], o[1] - t[1]
        along = ox * ux + oy * uy
        aside = abs(-ox * uy + oy * ux)
        if along > 1 and aside <= CORRIDOR:
            return None                   # 더 바깥에 누가 있다
    if abs(ux) >= abs(uy):
        return "e" if ux > 0 else "w"
    return "s" if uy > 0 else "n"


def ring_for(t, side) -> list:
    """벽 한 바퀴의 «타일» 좌표. side 는 밖을 보는 변 - 그 반대 변 가운데를 문으로 비운다."""
    r = 1 + GAP + 1                       # 몸 반 + 빈 칸 + 벽 = 중심에서 벽까지
    x0, y0 = math.floor(t[0]) - r, math.floor(t[1]) - r      # 왼위 모서리 타일
    x1, y1 = x0 + 2 * r - 1, y0 + 2 * r - 1
    (nx, ny), _ = SIDES[side]
    # 문은 «안쪽 변»(밖을 보는 변의 반대)의 가운데 칸 하나.
    if nx:
        door = (math.floor(t[0]) - nx * r, math.floor(t[1]) - 1)
    else:
        door = (math.floor(t[0]) - 1, math.floor(t[1]) - ny * r)
    out = []
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            if (x in (x0, x1) or y in (y0, y1)) and (x, y) != door:
                out.append((x, y))
    return out


def open_tiles(ai, tiles) -> tuple:
    """(놓을 수 있는 타일, 나무가 선 타일). 나무는 베면 놓을 수 있다.

        사용자: "돌벽세우는데 나무가 가로막고있으면 벌목해"
    """
    if not tiles:
        return [], []
    packed = ";".join(f"{x},{y}" for x, y in tiles)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "(-?%%d+),(-?%%d+)")
        x, y = tonumber(x), tonumber(y)
        if s.count_entities_filtered{name = "%s", area = {{x, y}, {x + 1, y + 1}}} == 0 then
          if s.can_place_entity{name = "%s", position = {x + 0.5, y + 0.5}, force = f,
                                build_check_type = defines.build_check_type.manual} then
            out[#out+1] = x .. "|" .. y .. "|free"
          elseif s.count_entities_filtered{type = "tree",
                   area = {{x, y}, {x + 1, y + 1}}} > 0 then
            out[#out+1] = x .. "|" .. y .. "|tree"
          end
        end
      end
      return out
    end)()""" % (packed, WALL, WALL))
    free, trees = [], []
    for r in _rows(reply):
        x, y, what = str(r).split("|")
        (free if what == "free" else trees).append((int(x), int(y)))
    return free, trees


def bare(ai) -> list:
    """벽이 필요한 외곽 포탑. [(포탑, 변, 빈 타일들)] - 빈 타일이 없으면 이미 둘렀다."""
    ts = turrets(ai)
    if not ts:
        return []
    cx = sum(t[0] for t in ts) / len(ts)
    cy = sum(t[1] for t in ts) / len(ts)
    out = []
    for t in ts:
        side = facing(t, (cx, cy), ts)
        if not side:
            continue
        need, trees = open_tiles(ai, ring_for(t, side))
        if len(need) + len(trees) >= 3:  # 한두 장은 바위 자리다
            out.append((t, side, need + trees))
    out.sort(key=lambda r: -math.hypot(r[0][0] - cx, r[0][1] - cy))
    return out


def kilns(ai) -> dict:
    """가마에 든 것. {(x, y): {"stone": n, "brick": n, "coal": n}}"""
    packed = ";".join(f"{x},{y}" for x, y in KILNS)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local k = s.find_entities_filtered{name = "stone-furnace", force = f,
                    area = {{x - 0.5, y - 0.5}, {x + 0.5, y + 0.5}}}[1]
        if k then
          out[#out+1] = x .. "|" .. y .. "|"
            .. k.get_inventory(defines.inventory.furnace_source).get_item_count("stone") .. "|"
            .. k.get_inventory(defines.inventory.furnace_result).get_item_count("%s") .. "|"
            .. k.get_inventory(defines.inventory.fuel).get_item_count("coal")
        end
      end
      return out
    end)()""" % (packed, BRICK))
    out = {}
    for row in _rows(reply):
        x, y, stone, brick, coal = str(row).split("|")
        out[(float(x), float(y))] = {"stone": int(stone), "brick": int(brick),
                                     "coal": int(coal)}
    return out


def bake(ai, who, have, need_bricks) -> list:
    """가마를 돌보는 걸음. 없는 가마는 세우고, 빈 가마는 채우고, 구운 것은 걷는다."""
    got = kilns(ai)
    plan = []
    missing = [k for k in KILNS if k not in got]
    if missing:
        plan.append(("craft", {"recipe": "stone-furnace", "count": len(missing),
                               "wait": True}))
    stone_at, coal_at = have.get("stone"), have.get("coal")
    if stone_at:
        plan.append(("walk_to", {"x": stone_at[0], "y": stone_at[1] + 1.5}))
        plan.append(("take", {"name": "stone", "x": stone_at[0], "y": stone_at[1],
                              "count": KILN_STONE * len(KILNS) + 5 * len(missing)}))
    if coal_at:
        plan.append(("walk_to", {"x": coal_at[0], "y": coal_at[1] + 1.5}))
        plan.append(("take", {"name": "coal", "x": coal_at[0], "y": coal_at[1],
                              "count": KILN_COAL * len(KILNS)}))
    for kx, ky in KILNS:
        plan.append(("walk_to", {"x": kx + 2, "y": ky}))
        if (kx, ky) in missing:
            plan.append(("build", {"name": "stone-furnace", "x": kx, "y": ky}))
        state = got.get((kx, ky), {"stone": 0, "brick": 0, "coal": 0})
        if state["brick"]:
            plan.append(("take", {"name": BRICK, "x": kx, "y": ky, "count": state["brick"]}))
        if state["stone"] < KILN_STONE // 2:
            plan.append(("insert", {"name": "stone", "x": kx, "y": ky,
                                    "count": KILN_STONE - state["stone"]}))
        if state["coal"] < KILN_COAL // 2:
            plan.append(("insert", {"name": "coal", "x": kx, "y": ky, "count": KILN_COAL}))
    return plan


def build(ai, who, jobs, have) -> None:
    jobs = jobs[:PER_TRIP]
    walls = sum(len(need) for _t, _s, need in jobs)
    bricks = walls * BRICKS_PER_WALL
    plan = []
    brick_at = have.get(BRICK)
    if brick_at:
        plan.append(("walk_to", {"x": brick_at[0], "y": brick_at[1] + 1.5}))
        plan.append(("take", {"name": BRICK, "x": brick_at[0], "y": brick_at[1],
                              "count": bricks}))
    plan.append(("craft", {"recipe": WALL, "count": walls, "wait": True}))
    for t, side, need in jobs:
        (nx, ny), _ = SIDES[side]
        # 고리 «밖», 문이 나는 안쪽 변 앞에 선다. 안에 섰다가 갇히지 않게.
        plan.append(("walk_to", {"x": t[0] - nx * 5, "y": t[1] - ny * 5}))
        _free, trees = open_tiles(ai, need)
        for x, y in trees:                # 나무가 선 칸은 먼저 벤다
            plan.append(("walk_to", {"x": x + 1.5, "y": y + 0.5}))
            plan.append(("chop", {"x": x + 0.5, "y": y + 0.5, "count": 1}))
        if trees:
            plan.append(("walk_to", {"x": t[0] - nx * 5, "y": t[1] - ny * 5}))
        for x, y in need:
            plan.append(("build", {"name": WALL, "x": x + 0.5, "y": y + 0.5}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 외곽 포탑 {len(jobs)}대를 돌벽 {walls}장으로 두른다 "
          + " ".join(f"({t[0]:.0f},{t[1]:.0f}){s}" for t, s, _n in jobs))


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
            jobs = bare(ai)
            have = shelf_mod.shelves(ai, DEPOT, span=36)
            stock = shelf_mod.stock(ai, DEPOT, span=36)
            bricks = sum(c["held"].get(BRICK, 0) for c in stock)
            stone = sum(c["held"].get("stone", 0) for c in stock)
            print(f"  맨몸 외곽 포탑 {len(jobs)}대 · 벽돌 {bricks} · 돌 {stone}")
            if not jobs:
                if args.every:
                    break
            elif names:
                hands = idle(ai, names)
                if not hands:
                    pass
                elif bricks >= len(jobs[0][2]) * BRICKS_PER_WALL:
                    build(ai, hands[0], jobs, have)
                elif stone >= 20:
                    plan = bake(ai, hands[0], have, 0)
                    stone_at = have.get("stone")
                    if stone_at:
                        plan.append(("walk_to", {"x": stone_at[0], "y": stone_at[1] + 1.5}))
                        plan.append(("insert", {"name": BRICK, "x": stone_at[0],
                                                "y": stone_at[1], "count": 500}))
                    submit(ai, hands[0], plan, strict=False)
                    print(f"{hands[0]}: 가마 돌보기 (돌 넣고 벽돌 걷기)")
                else:
                    print("  돌이 없다 - 벽은 돌 채굴기 몫이다")
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

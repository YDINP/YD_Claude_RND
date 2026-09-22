"""Steel furnaces double the smelter without moving a single belt.

    사용자: "연구소는 한 12개정도로 늘리고 그에 맞게 병목이 되지 않도록
             생산시설들도 추가배치할 것."

과학 블록을 세우고 재 보니 병목은 조립기가 아니라 «판»이었다. 구리 광석
기둥은 포화(52벨트에 416개)하고 채굴기 여덟 대가 「자리 없음」으로 서 있는데,
화로 열둘이 초당 3.75개밖에 못 굽는다. 광석은 남고 화로가 모자란다.

화로 줄은 x -53..-17 로 꽉 찼고 양옆은 급식 기둥이다 - 열을 «늘릴» 자리가
없다. 그래서 늘리지 않고 «바꾼다»: 강철 화로는 돌 화로와 같은 2x2 에 두 배
속도다(advanced-material-processing 은 이미 끝났다). 팔도 벨트도 그대로 두고
화로만 걷고 다시 놓으면 판 흐름이 3.75 -> 7.5/s 가 된다.

    강철 화로 하나 = 강철 6 + 벽돌 10.  강철 하나 = 철판 5, 돌 화로에서 16초.

강철은 가마 남쪽 «강철 자리»의 돌 화로 여섯이 굽는다. 철판은 창고에 21만
장이 쌓여 있으니 손으로 넣어도 된다 - 이 화로들은 팔이 없어 upkeep 이
«자동화 안 된 기계»로 보고 채워 주기도 한다(직전 레시피가 강철이면 철판을
넣는다).

    순번마다: 자리 화로가 없으면 세운다(나무는 벤다) -> 구운 강철을 걷는다
              -> 철판·석탄을 채운다 -> 강철 6·벽돌 10 마다 강철 화로를 만들어
              화로 줄의 돌 화로 하나와 바꾼다 (철 줄부터, 번갈아)

    python scripts/steelworks.py                    # 어디까지 됐나
    python scripts/steelworks.py --who golf --every 45
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

DEPOT = (-55, 10)
STONE, STEEL = "stone-furnace", "steel-furnace"
SITE = ((-66.0, 27.0), (-69.0, 27.0), (-66.0, 30.0), (-69.0, 30.0),
        (-66.0, 33.0), (-69.0, 33.0))           # 강철 굽는 돌 화로 (2x2 중심)
ROWS = ((-54, 34, -15, 37), (-54, 39, -15, 42))  # 철 줄 y=36, 구리 줄 y=41
PLATES_EACH = 50       # 자리 화로 하나에 넣는 철판 (원료칸 한 스택 100)
COAL_EACH = 10
PER_ROUND = 4          # 한 순번에 바꾸는 화로 수


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def site(ai) -> dict:
    """{(x, y): {"plate": n, "steel": n, "coal": n, "other": n}} 선 자리 화로만."""
    packed = ";".join(f"{x},{y}" for x, y in SITE)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local k = s.find_entities_filtered{name = "%s", force = f,
                    area = {{x - 0.5, y - 0.5}, {x + 0.5, y + 0.5}}}[1]
        if k then
          local res = k.get_inventory(defines.inventory.furnace_result)
          out[#out+1] = x .. "|" .. y .. "|"
            .. k.get_inventory(defines.inventory.furnace_source).get_item_count("iron-plate") .. "|"
            .. res.get_item_count("steel-plate") .. "|"
            .. k.get_inventory(defines.inventory.fuel).get_item_count("coal") .. "|"
            .. (res.get_item_count() - res.get_item_count("steel-plate"))
        end
      end
      return out
    end)()""" % (packed, STONE))
    out = {}
    for row in _rows(reply):
        x, y, plate, steel, coal, other = str(row).split("|")
        out[(float(x), float(y))] = {"plate": int(plate), "steel": int(steel),
                                     "coal": int(coal), "other": int(other)}
    return out


def rows(ai) -> tuple:
    """화로 줄의 (돌 화로 자리들, 강철 화로 수). 철 줄이 먼저, 서쪽부터."""
    stone, steel = [], 0
    for x1, y1, x2, y2 in ROWS:
        reply = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local out = {}
          for _, e in pairs(s.find_entities_filtered{type = "furnace", force = f,
                  area = {{%d, %d}, {%d, %d}}}) do
            out[#out+1] = e.name .. "|" .. e.position.x .. "|" .. e.position.y
          end
          return out
        end)()""" % (x1, y1, x2, y2))
        here = []
        for row in _rows(reply):
            name, x, y = str(row).split("|")
            if name == STONE:
                here.append((float(x), float(y)))
            elif name == STEEL:
                steel += 1
        stone.append(sorted(here))
    # 번갈아: 철, 구리, 철, 구리 ...
    order = []
    for pair in zip(*stone):
        order.extend(pair)
    for lst in stone:
        order.extend(p for p in lst if p not in order)
    return order, steel


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def plan_round(ai, who) -> list:
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    got = site(ai)
    missing = [k for k in SITE if k not in got]
    plan = []

    # 1. 자재: 철판·석탄·벽돌은 창고에서.
    plates_need = PLATES_EACH * len(SITE)
    coal_need = COAL_EACH * len(SITE)
    for item, n in (("iron-plate", plates_need), ("coal", coal_need),
                    ("stone-brick", 10 * PER_ROUND), ("stone", 5 * len(missing))):
        at = have.get(item)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    if missing:
        plan.append(("craft", {"recipe": STONE, "count": len(missing), "wait": True}))

    # 2. 자리 화로: 세우고, 걷고, 채운다.
    plan.append(("walk_to", {"x": -67.5, "y": 28.5}))
    for kx, ky in SITE:
        if (kx, ky) in missing:
            plan.append(("chop", {"x": kx, "y": ky, "count": 3}))   # 그 자리의 나무만
            plan.append(("build", {"name": STONE, "x": kx, "y": ky}))
            plan.append(("insert", {"name": "coal", "x": kx, "y": ky, "count": COAL_EACH}))
            plan.append(("insert", {"name": "iron-plate", "x": kx, "y": ky, "count": PLATES_EACH}))
            continue
        st = got[(kx, ky)]
        if st["steel"]:
            plan.append(("take", {"name": "steel-plate", "x": kx, "y": ky, "count": st["steel"]}))
        if st["other"]:                      # upkeep 이 광석을 넣어 판이 됐으면 그것도 걷는다
            plan.append(("take", {"name": "iron-plate", "x": kx, "y": ky, "count": st["other"]}))
        if st["coal"] < COAL_EACH // 2:
            plan.append(("insert", {"name": "coal", "x": kx, "y": ky, "count": COAL_EACH}))
        if st["plate"] < PLATES_EACH // 2:
            plan.append(("insert", {"name": "iron-plate", "x": kx, "y": ky,
                                    "count": PLATES_EACH - st["plate"]}))

    # 3. 바꾸기: 가방의 강철(지난 순번에 걷은 것)로 만든다. 이번에 걷는 것은 다음 순번.
    steel = int(bag.get("steel-plate", 0))
    bricks = int(bag.get("stone-brick", 0)) + (10 * PER_ROUND if have.get("stone-brick") else 0)
    n = min(steel // 6, bricks // 10, PER_ROUND)
    order, _done = rows(ai)
    swaps = order[:n]
    if swaps:
        plan.append(("craft", {"recipe": STEEL, "count": n, "wait": True}))
        for x, y in swaps:
            # 줄 사이(y 37..39)는 팔·출구 벨트다. 철 줄은 북쪽 y=32, 구리 줄은 남쪽 y=44 에 선다.
            plan.append(("walk_to", {"x": x, "y": 32.5 if y < 39 else 44.5}))
            plan.append(("demolish", {"name": STONE, "x": x, "y": y, "search_radius": 0.6}))
            plan.append(("build", {"name": STEEL, "x": x, "y": y}))
    return plan, len(swaps)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=45)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()
    ai = AIBridge()

    got = site(ai)
    order, done = rows(ai)
    print(f"  강철 자리 화로 {len(got)}/{len(SITE)} · 줄의 돌 화로 {len(order)} · 강철 화로 {done}")
    if not args.who:
        return 0
    for _ in range(args.rounds):
        try:
            if idle(ai, args.who):
                order, done = rows(ai)
                if not order and len(site(ai)) == len(SITE):
                    print(f"{args.who}: 화로 줄 {done}대가 전부 강철 화로다 - 끝")
                    return 0
                plan, swaps = plan_round(ai, args.who)
                submit(ai, args.who, plan[:60], strict=False)
                print(f"{args.who}: 강철 순번 ({len(plan)}단계, 바꾸기 {swaps}, 남은 돌 화로 {len(order)})")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

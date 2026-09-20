"""Defence: be ready before the research lands, and build the moment it does.

18회차는 62분에 `gun-turret` 연구를 끝냈다. 세 판 만에 처음이다. 그리고
포탑을 **한 대도** 못 세우고 전원 사망했다.

    연구 gun-turret  완료          포탑  0대
    창고 철판 1354 · 구리판 38     적 유닛 51마리 / 웜 4기 (150칸)
    시체 8구, 전부 «기지 안»       (41,-114) (47,-114) (58,-113) ...

재료가 모자란 게 아니었다. 포탑 수십 대 분량이 창고에 있었다. 증식.유통.
발전 세 고리가 쉬지 않고 돌았고 여덟 명이 모두 바빴는데, 그 중 어느
고리에도 「포탑을 세운다」가 없었다.

> **모두가 바쁜 것과 «필요한 모든 일이 되고 있는 것»은 다르다.**

그리고 방어를 「연구가 끝나면 시작할 일」로 두면 늘 늦는다. 연구가 끝난
순간에 필요한 것은 결정이 아니라 **이미 만들어 둔 포탑과 탄약**이다.
그래서 이 고리는 연구를 기다리는 동안 논다는 선택지가 없다.

    python scripts/guard.py --who golf --who hotel --depot 60,-115
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

TURRET = "gun-turret"
AMMO = "firearm-magazine"
WALL = "stone-wall"

TURRET_COST = {"iron-plate": 40, "copper-plate": 10}   # 기어까지 친 넉넉한 값
AMMO_EACH = 20            # 포탑 한 대에 채워 두는 탄약
AMMO_STOCK = 200          # 연구를 기다리는 동안 쌓아 둘 탄약
PER_TRIP = 3              # 한 걸음에 세우는 포탑
# 성장 몫은 남기되, «남기느라 한 발도 못 만드는» 것은 지난 판의 재현이다.
# 채굴기+상자 여섯 대 분량(6 x 17)이면 증식은 안 끊긴다.
KEEP_PLATE = 120


def watch(ai, who):
    """방어의 형편. 연구.포탑.탄약.적을 한 번에 본다."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local e = game.forces.enemy
      local mid = { x = 0, y = 0 }
      local n = 0
      for _, m in pairs(s.find_entities_filtered{type={"furnace","mining-drill","lab"},
                force=f}) do
        mid.x = mid.x + m.position.x; mid.y = mid.y + m.position.y; n = n + 1
      end
      if n > 0 then mid.x = mid.x / n; mid.y = mid.y / n end
      local rounds, starved = 0, 0
      for _, t in pairs(s.find_entities_filtered{name="gun-turret", force=f}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        local have = inv and inv.get_item_count("firearm-magazine") or 0
        rounds = rounds + have
        if have < 5 then starved = starved + 1 end
      end
      return {
        gun = f.technologies["gun-turret"].researched and 1 or 0,
        wall = f.technologies["stone-wall"].researched and 1 or 0,
        turrets = s.count_entities_filtered{name="gun-turret", force=f},
        rounds = rounds, starved = starved,
        mid_x = mid.x, mid_y = mid.y,
        units = s.count_entities_filtered{type="unit", force=e,
                position=mid, radius=150},
        worms = s.count_entities_filtered{type="turret", force=e,
                position=mid, radius=150},
        nests = s.count_entities_filtered{type="unit-spawner", position=mid, radius=200},
      }
    end)()""")


def depot_has(ai, depot):
    x, y = depot
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, c in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="container", force=game.forces.player}) do
        for _, item in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
          out[item.name] = (out[item.name] or 0) + item.count
        end
      end
      return out
    end)()""" % (x - 3, y - 4, x + 3, y + 6))


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def seats(ai, who):
    """어디에 세우나. 테두리 -> 밭 초소 -> 안쪽 순.

    16회차는 포탑 열두 대로 «빈 땅»을 지키다 밭에서 둘을 잃었고,
    17회차는 한 대도 못 세우고 전멸했다. 자리는 구역이 아니라 «지킬
    것이 있는 곳»을 따라간다.
    """
    d = ai.defence(who)
    if d.get("error"):
        return []
    out = []
    for key in ("seats", "posts", "inner"):
        rows = d.get(key) or []
        rows = list(rows.values()) if isinstance(rows, dict) else list(rows)
        for row in rows:
            for seat in ((row.get("seats") or []) if key == "posts" else [row]):
                if isinstance(seat, dict) and seat.get("x") is not None:
                    out.append({"x": float(seat["x"]), "y": float(seat["y"]),
                                "why": key})
    return out


def stockpile(ai, who, shelf, have):
    """연구를 기다리는 동안 «탄약»을 만들어 쌓는다.

    빈 총은 없는 총이다. 그리고 탄약은 연구가 필요 없다 - 지금 만들 수
    있는 것을 지금 만들어 두지 않으면, 연구가 끝난 순간에 또 기다린다.
    """
    short = AMMO_STOCK - int(have.get(AMMO, 0))
    plates = int(have.get("iron-plate", 0)) - KEEP_PLATE
    n = min(short, max(0, plates) // 4)
    if n < 20:
        return False
    submit(ai, who, [
        ("walk_to", {"x": shelf["iron-plate"][0] - 2, "y": shelf["iron-plate"][1] + 1}),
        ("take", {"name": "iron-plate", "x": shelf["iron-plate"][0],
                  "y": shelf["iron-plate"][1], "count": n * 4}),
        ("craft", {"recipe": AMMO, "count": n}),
        ("insert", {"name": AMMO, "x": shelf["iron-plate"][0],
                    "y": shelf["iron-plate"][1], "count": n}),
    ], strict=False)
    print(f"{who}: 탄약 {n}발 만들어 쌓기 (비축 {have.get(AMMO, 0)}/{AMMO_STOCK})")
    return True


def raise_turrets(ai, who, shelf, have, spots):
    """포탑을 세우고 «그 자리에서» 탄약을 넣는다.

    세우고 잊으면 빈 총이 선다. 채굴기에서 겪은 그것이다.
    """
    n = min(PER_TRIP, len(spots))
    need_plate = n * TURRET_COST["iron-plate"] + n * AMMO_EACH * 4
    if int(have.get("iron-plate", 0)) < need_plate:
        n = max(0, (int(have.get("iron-plate", 0)) - 40)
                // (TURRET_COST["iron-plate"] + AMMO_EACH * 4))
    if int(have.get("copper-plate", 0)) < n * TURRET_COST["copper-plate"]:
        n = int(have.get("copper-plate", 0)) // TURRET_COST["copper-plate"]
    spots = spots[:n]
    if not spots:
        return False

    ammo_ready = int(have.get(AMMO, 0))
    make_ammo = max(0, n * AMMO_EACH - ammo_ready)
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1}),
            ("take", {"name": "iron-plate", "x": shelf["iron-plate"][0],
                      "y": shelf["iron-plate"][1],
                      "count": n * TURRET_COST["iron-plate"] + make_ammo * 4}),
            ("take", {"name": "copper-plate", "x": shelf["iron-plate"][0],
                      "y": shelf["iron-plate"][1],
                      "count": n * TURRET_COST["copper-plate"]})]
    if ammo_ready:
        plan.append(("take", {"name": AMMO, "x": shelf["iron-plate"][0],
                              "y": shelf["iron-plate"][1],
                              "count": min(ammo_ready, n * AMMO_EACH)}))
    plan.append(("craft", {"recipe": TURRET, "count": n}))
    if make_ammo:
        plan.append(("craft", {"recipe": AMMO, "count": make_ammo}))
    for spot in spots:
        plan.append(("walk_to", {"x": spot["x"] + 2, "y": spot["y"] + 2}))
        plan.append(("build", {"name": TURRET, "x": spot["x"], "y": spot["y"],
                               "snap": True}))
        plan.append(("insert", {"name": AMMO, "x": spot["x"], "y": spot["y"],
                                "count": AMMO_EACH}))
    submit(ai, who, plan, strict=False)
    why = ",".join(sorted({s["why"] for s in spots}))
    print(f"{who}: 포탑 {n}대 ({why}) + 탄약 {AMMO_EACH}발씩")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None,
                    help="방어 당번. 여러 번 줄 수 있다 (.bat 이 쉼표를 자른다)")
    ap.add_argument("--depot", default="60,-115")
    ap.add_argument("--want", type=int, default=16, help="목표 포탑 수")
    ap.add_argument("--every", type=float, default=20)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    crew = args.who or ["golf", "hotel"]
    dx, dy = (int(float(v)) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue
            st = watch(ai, free[0])
            have = depot_has(ai, (dx, dy))

            if not int(st["gun"]):
                # 연구는 남의 일이다. 이 고리는 그 사이에 «탄약»을 쌓는다.
                if not stockpile(ai, free[0], shelf, have):
                    print(f"  연구를 기다린다 - 탄약 {have.get(AMMO, 0)} "
                          f"적 {st['units']}마리 웜 {st['worms']}기")
                time.sleep(args.every)
                continue

            if int(st["turrets"]) < args.want:
                spots = seats(ai, free[0])
                if spots and raise_turrets(ai, free[0], shelf, have, spots):
                    free = free[1:]
                elif not spots:
                    print("  세울 자리가 안 나온다 - 지킬 것이 아직 없다")

            if free and int(st["turrets"]):
                stockpile(ai, free[0], shelf, have)

            if int(st["starved"]):
                print(f"  빈 총 {st['starved']}대 - 보급 순찰이 채워야 한다")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Cold start: keep turning plates into drills, and keep those drills running.

    사용자: "시작했을때 제일 우선으로 할거는 채굴기를 만들어서 광석마다
             배치해서 생산효율을 올리는게 콜드스타트의 지점이야."

This is the only exponential stretch in the game. A burner drill costs nine
iron plates and five stone and then mines 0.25/s forever - several hands'
worth, and unlike a hand it never has to be somewhere else. So: plates
become drills, and those drills make the plates for the next batch.

**Two duties, not one.** Run 18 had seven drills standing and production
zero:

    drill(-5,-111)  waiting_for_space_in_destination
    drill(49,-97)   no_fuel

A drill with nowhere to put what it digs is the same as no drill, and every
character went on mining by hand beside it. Sowing without tending is not
half the job, it is none of it - so `tend` runs **first** every round, and
it looks at what the game reports rather than at what this loop remembers,
which means it also fixes drills someone else left standing.

    python scripts/grow.py --depot 60,-115
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
from settle import near_patch           # noqa: E402

DRILL = "burner-mining-drill"
CHEST = "iron-chest"
DRILL_COST = {"iron-plate": 9, "stone": 5}
CHEST_COST = {"iron-plate": 8}
PER_TRIP = 4
FUEL_EACH = 25
TEND_PER_TRIP = 3

# 한 대라도 멈춰 있으면 그것부터. 세우는 것보다 «세워 둔 것을 돌리는» 편이
# 언제나 싸다 - 재료가 안 들고, 이미 광맥 위에 서 있다.
STUCK = ("waiting_for_space_in_destination", "no_fuel")

# 사방이 다 막힌 채굴기는 다음 순번에 또 봐도 막혀 있다. 매번 손보기
# 차례를 거기에 쓰면 고칠 수 있는 것들이 영영 차례를 못 받는다.
HOPELESS: set = set()

# 매듭은 한 번만 끊으면 된다. 순번마다 다른 사람을 또 보내면 세 명이
# 같은 돌밭에서 손으로 캐고, 정작 채굴기를 세울 사람이 없어진다.
PRIMING: dict = {}


def stock(ai, depot):
    x, y = depot
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local out = { plate = 0, stone = 0, coal = 0 }
      for _, c in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="container", force=game.forces.player}) do
        local inv = c.get_inventory(defines.inventory.chest)
        out.plate = out.plate + inv.get_item_count("iron-plate")
        out.stone = out.stone + inv.get_item_count("stone")
        out.coal = out.coal + inv.get_item_count("coal")
      end
      return out
    end)()""" % (x - 3, y - 4, x + 3, y + 6))


def stalled(ai):
    """멈춰 선 채굴기. 「무엇이 없나」까지 게임이 말해 준다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, d in pairs(s.find_entities_filtered{type="mining-drill",
                force=game.forces.player}) do
        local why = nil
        if d.status == defines.entity_status.waiting_for_space_in_destination then
          why = "no_outlet"
        elseif d.status == defines.entity_status.no_fuel then
          why = "no_fuel"
        end
        if why then
          out[#out+1] = string.format("%.1f|%.1f|%s", d.position.x, d.position.y, why)
        end
      end
      return out
    end)()""")
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for row in rows:
        x, y, why = row.split("|")
        out.append({"x": float(x), "y": float(y), "why": why})
    return out


def fields(ai, anchor):
    """밭은 게임에 묻는다. 적어 두면 판이 바뀔 때마다 틀린다.

    그리고 «밭 전체»가 아니라 기지에서 가까운 덩어리를 묻는다. 19회차
    돌밭은 전체 경계가 (33,-76)..(57,128) 로 200칸짜리 허수 상자였는데,
    실제로 캘 수 있는 덩어리는 그 중 (42,-76)..(57,-60) 뿐이었다.
    """
    out = {}
    for ore in ("iron-ore", "coal", "stone", "copper-ore"):
        patch = near_patch(ai, ore, anchor)
        if patch:
            out[ore] = patch
    return out


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def shopping(shelf, need):
    """창고에서 집어 올 것들. 없는 것을 달라고 하면 계획 전체가 멈춘다."""
    return [("take", {"name": item, "x": shelf[item][0], "y": shelf[item][1],
                      "count": count})
            for item, count in need.items() if count > 0]


KEEP = 20          # 손에 남겨 두는 몫. 다 비우면 다음 걸음에 또 창고에 들른다
WORTH_A_TRIP = 25  # 이만큼도 안 되면 창고까지 다녀올 값을 못 한다


def unload(ai, who, shelf):
    """들고만 있는 것을 창고에 내려놓는다.

    창고가 비었는데 고리가 「제련이 따라오길 기다린다」만 되풀이한 적이
    있다. 그때 창고의 석탄은 0이었고, 한 사람이 석탄 200을 들고 서 있었다.
    가진 것과 «쓸 수 있는 것»은 다르다 - 창고에 있어야 쓸 수 있다.
    """
    held = ai.agent(who).items()
    drop = {k: v - KEEP for k, v in held.items()
            if k in shelf and v - KEEP >= WORTH_A_TRIP}
    if not drop:
        return False
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1})]
    plan += [("insert", {"name": k, "x": shelf[k][0], "y": shelf[k][1], "count": v})
             for k, v in drop.items()]
    submit(ai, who, plan, strict=False)
    print(f"{who}: 창고에 내려놓기 {drop}")
    return True


def has_box(ai, at):
    """이 칸에 «받아 줄 것»이 서 있나. 상자든 벨트든 받으면 된다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      return { n = s.count_entities_filtered{ position = {%.2f, %.2f}, radius = 0.7,
        type = {"container", "logistic-container", "transport-belt"},
        force = game.forces.player } }
    end)()""" % (at[0], at[1]))
    return int(reply["n"]) > 0


def tend(ai, who, shelf, sick):
    """멈춘 채굴기에 출구와 연료를 준다.

    어디가 출구인지는 «채굴기에게 묻는다». 방향을 짐작해 상자를 놓으면
    상자는 서 있는데 광석은 여전히 땅에 쌓인다. 막혀 있으면 aim_drill 이
    비는 쪽으로 돌려 주므로, 돌린 뒤의 답을 쓴다.
    """
    jobs, full = [], []
    sick = [d for d in sick if (round(d["x"]), round(d["y"])) not in HOPELESS]
    # 몫을 «자르고 나서» 거르면, 앞의 셋이 전부 「상자가 찬」 것일 때
    # 손볼 수 있는 뒤엣것들이 영영 차례를 못 받는다. 거르고 나서 센다.
    for one in sick:
        if len(jobs) >= TEND_PER_TRIP:
            break
        if one["why"] == "no_fuel":
            jobs.append({"drill": one, "drop": None})
            continue
        aimed = ai.aim_drill(who, one["x"], one["y"])
        if aimed.get("error"):
            print(f"  ({one['x']:.0f},{one['y']:.0f}) 사방이 막혔다 - 이 대는 접는다")
            HOPELESS.add((round(one["x"]), round(one["y"])))
            continue
        drop = (aimed["drop_x"], aimed["drop_y"])
        # 상자가 «이미» 있는데도 멈춰 있으면 그 상자가 찬 것이다. 그것은
        # 정비가 아니라 «운반»의 일이다 - 여기서 또 손보러 가면 순번마다
        # 「상자 0」만 찍고 돌아온다(18.19회차에 계속 그랬다).
        if has_box(ai, drop):
            full.append(one)
            continue
        jobs.append({"drill": one, "drop": drop})
    if not jobs:
        if full:
            print(f"  상자가 찬 채굴기 {len(full)}대 - 정비가 아니라 «운반»이 밀렸다")
        return False

    boxes = [j for j in jobs if j["drop"]]

    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2, "y": shelf["iron-plate"][1] + 1})]
    plan += shopping(shelf, {"iron-plate": len(boxes) * CHEST_COST["iron-plate"] + 2,
                             "coal": len(jobs) * FUEL_EACH})
    if boxes:
        plan.append(("craft", {"recipe": CHEST, "count": len(boxes)}))
    for job in jobs:
        d = job["drill"]
        if job in boxes:
            plan.append(("build", {"name": CHEST, "x": job["drop"][0], "y": job["drop"][1]}))
        plan.append(("insert", {"name": "coal", "x": d["x"], "y": d["y"],
                                "count": FUEL_EACH}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 멈춘 채굴기 {len(jobs)}대 손보기 (상자 {len(boxes)})")
    return True


# 자기 꼬리를 문 것은 돌만이 아니다. 석탄 채굴기도 석탄을 먹는다 -
# 창고 석탄이 0이면 석탄밭 채굴기를 못 켜고, 못 켜면 석탄이 안 들어온다.
KNOTS = ("stone", "coal")


def prime(ai, who, shelf, field):
    """손으로 한 번만 캔다. 매듭을 끊는 데만 쓴다.

    채굴기 한 대에 돌 5가 든다. 창고에 돌이 0이면 돌밭 채굴기도 못
    만들고, 돌밭 채굴기가 없으면 돌도 안 들어온다 - 자기 꼬리를 문
    매듭이라 사람이 한 번 끊어 줘야 열린다.

    사용자의 순서는 「채굴기로 시작한다」이지 「손으로 캔다」가 아니므로,
    이 걸음은 «그 밭에 채굴기가 설 때까지»만 산다.
    """
    x = (field["left"] + field["right"]) // 2
    y = (field["top"] + field["bottom"]) // 2
    submit(ai, who, [
        ("walk_to", {"x": x, "y": y}),
        ("mine", {"name": field["ore"], "x": x, "y": y, "count": 150,
                  "search_radius": 14, "timeout_ticks": 60 * 60 * 5}),
        ("walk_to", {"x": shelf[field["ore"]][0] - 2,
                     "y": shelf[field["ore"]][1] + 1}),
        ("insert", {"name": field["ore"], "x": shelf[field["ore"]][0],
                    "y": shelf[field["ore"]][1], "count": 150}),
    ], strict=False)
    PRIMING[field["ore"]] = who
    print(f"{who}: 매듭 끊기 - {field['ore']} 150을 손으로 (채굴기가 설 때까지만)")
    return True


def priming(ai, ore, names):
    """이 밭의 매듭을 «이미 누가» 끊고 있나."""
    who = PRIMING.get(ore)
    if not who:
        return False
    row = next((w for w in ai.list() if w["name"] == who), None)
    if row and row.get("alive") and (row.get("current") or row.get("queued")):
        return True
    PRIMING.pop(ore, None)
    return False


def drills_on(ai, field):
    """이 밭에 우리 채굴기가 몇 대 서 있나."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      return { n = s.count_entities_filtered{ area = {{%d,%d},{%d,%d}},
        type = "mining-drill", force = game.forces.player } }
    end)()""" % (field["left"] - 2, field["top"] - 2,
                 field["right"] + 2, field["bottom"] + 2))
    return int(reply["n"])


def sow(ai, who, shelf, field, st):
    """새 채굴기를 세우고 «그 자리에서» 출구와 연료까지 준다.

    출구는 다음 순번에 달아 주면 된다고 미루면, 그 사이 채굴기는 한 톨도
    안 캐면서 연료만 태우고 공해를 낸다. 세우는 손이 상자도 놓는다.
    """
    laid = ai.mine_seats(who, field, wanted=PER_TRIP, rich=850, ore=field["ore"])
    seats = laid.get("free") or []
    if not seats:
        return False
    n = len(seats)
    if int(st["plate"]) < n * 17 or int(st["stone"]) < n * 5:
        n = min(n, int(st["plate"]) // 17, int(st["stone"]) // 5)
        seats = seats[:n]
    if not seats:
        return False

    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2, "y": shelf["iron-plate"][1] + 1})]
    plan += shopping(shelf, {
        "iron-plate": n * (DRILL_COST["iron-plate"] + CHEST_COST["iron-plate"]) + 4,
        "stone": n * DRILL_COST["stone"] + 4,
        "coal": n * FUEL_EACH,
    })
    plan += [("craft", {"recipe": DRILL, "count": n}),
             ("craft", {"recipe": CHEST, "count": n}),
             ("walk_to", {"x": seats[0]["x"] + 3, "y": seats[0]["y"]})]
    for seat in seats:
        plan.append(("build", {"name": DRILL, "x": seat["x"], "y": seat["y"],
                               "direction": seat.get("direction")}))
        plan.append(("insert", {"name": "coal", "x": seat["x"], "y": seat["y"],
                                "count": FUEL_EACH}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: {field['ore']} 채굴기 {n}대 "
          f"(창고 판 {st['plate']} 돌 {st['stone']} 석탄 {st['coal']})")
    # 출구는 다음 순번의 tend 가 «게임에 물어» 달아 준다. 여기서 미리
    # 자리를 짐작하면, 자리표가 돌려준 방향과 실제로 선 방향이 어긋난다.
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="60,-115",
                    help="창고 줄의 첫 칸. 판/돌/석탄 상자가 두 칸 간격으로 선다")
    ap.add_argument("--builders", default="alpha,bravo,charlie,delta,golf")
    ap.add_argument("--rounds", type=int, default=2000)
    ap.add_argument("--every", type=float, default=15)
    args = ap.parse_args()

    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}
    builders = [n.strip() for n in args.builders.split(",") if n.strip()]

    ai = AIBridge()
    FIELD = fields(ai, (dx, dy))
    # 구리도 밭이다. 구리가 없으면 회로도 과학팩도 없고, 발전 사슬이
    # 「짐이 모자란다」에서 영영 안 떠난다 - 18.19회차가 그랬다.
    order = [o for o in ("iron-ore", "coal", "stone", "copper-ore") if o in FIELD]
    print("밭:", ", ".join(f"{k} {v['n']}칸 {v['gap']}칸거리"
                           for k, v in FIELD.items()))
    if not order:
        print("밭이 하나도 없다. 좌표 범위를 의심할 것.")
        return 1

    turn = 0
    for _ in range(args.rounds):
        try:
            free = idle(ai, builders)
            if not free:
                time.sleep(args.every)
                continue

            # 0. 들고만 있는 것을 창고에 푼다. 손에 있는 석탄은 연료가 아니다.
            st = stock(ai, (dx, dy))
            if int(st["coal"]) < FUEL_EACH or int(st["stone"]) < 10:
                for who in list(free):
                    if unload(ai, who, shelf):
                        free.remove(who)
                        break

            # 1. 세워 둔 것부터 돌린다.
            sick = stalled(ai)
            if sick and tend(ai, free[0], shelf, sick):
                free = free[1:]
                if len(sick) > TEND_PER_TRIP and free:
                    tend(ai, free[0], shelf, sick[TEND_PER_TRIP:])
                    free = free[1:]

            # 2. 그 다음에 새로 세운다.
            if free:
                st = stock(ai, (dx, dy))
                # 돌이 0이면 돌 채굴기를, 석탄이 0이면 석탄 채굴기를 못
                # 켠다. 매듭은 밭마다 «손으로 한 번»만 끊는다.
                floor = {"stone": DRILL_COST["stone"], "coal": FUEL_EACH}
                for ore in KNOTS:
                    if (free and ore in FIELD
                            and int(st[{"stone": "stone", "coal": "coal"}[ore]])
                                < floor[ore]
                            and not priming(ai, ore, builders)
                            and not drills_on(ai, FIELD[ore])):
                        prime(ai, free[0], shelf, FIELD[ore])
                        free = free[1:]
                if free and int(st["plate"]) >= 17 and int(st["coal"]) >= FUEL_EACH:
                    # 돌이 마르면 전부 마른다. 돌밭을 먼저 연다.
                    short = int(st["stone"]) < PER_TRIP * DRILL_COST["stone"]
                    ore = "stone" if (short and "stone" in FIELD) else order[turn % len(order)]
                    turn += 1
                    sow(ai, free[0], shelf, FIELD[ore], st)
                elif not sick:
                    print(f"  창고가 비었다 (판 {st['plate']} 돌 {st['stone']} "
                          f"석탄 {st['coal']}) - 제련이 따라오길 기다린다")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:                       # 고리는 «안 죽는다»
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

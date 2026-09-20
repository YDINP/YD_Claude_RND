"""Distribution: carry what the drills dug to where it gets used.

    사용자: "생산자동화가 된다면 나오는 광석들로 재련 및 유통, 조립과정을
             거쳐서 ..."

Drills fill the chests beside them and stop. Furnaces run dry and stop. The
depot reads empty, so the growth loop concludes there is nothing to build
with - while several hundred ore sit in chests two screens away.

    채굴기 11대 가동          <- 고쳤다
    창고 판 0 / 돌 46 / 석탄 0 <- 그런데 쓸 것이 없다

That gap is not a shortage, it is a **haulage** problem, and it is its own
duty: nobody who is busy building is also carrying.

Two duties, and `feed` comes first - an idle furnace costs plates, and
plates are what everything else is made of.

    python scripts/haul.py --depot 60,-115 --smelt 35,-115
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

ORE_TO_PLATE = {"iron-ore": "iron-plate", "copper-ore": "copper-plate",
                "stone": "stone-brick"}


def mismatched(f):
    """지금 물고 있는 광석과 결과칸의 물건이 «다른 일»인가.

    구리 화로 둘이 원료칸에 구리광 49를 물고도 멈춰 있었다. 결과칸에
    이전 철판 다섯 장이 남아 구리판을 뱉을 칸이 없었기 때문이다.
    status 로도 잡히지만, 상태값 하나에만 기대면 판이 바뀔 때 또 놓친다 -
    「무엇을 물었나」와 「무엇을 뱉었나」가 어긋나면 그것으로 충분하다.
    """
    want = ORE_TO_PLATE.get(f["what"])
    return bool(f["what"] and f["made"] and want and f["made"] != want)
FURNACE_ORE = 50          # 화로 하나가 한 번에 받아 두는 광석
FURNACE_COAL = 20
# 한 번 걸음에 나르는 최대치.
#
# 400으로 잡아 뒀더니 화로 스물두 대 시대에 못 따라갔다. 실측(20회차):
# 화로 «스물두 대 전부» 결과칸이 철판 100으로 가득 차 막혀 있었고,
# 밭 상자에는 철광석 3748이 쌓여 있었으며, 창고 철판은 0이었다.
# 그동안 방어선은 「철이 없어서」 동쪽이 비어 있었다.
#
# 사람 가방은 이보다 훨씬 크다. 아끼던 것은 걸음 수가 아니라 숫자였다.
CARRY = 2000
PILE_FLOOR = 25           # 이만큼도 안 쌓인 상자는 다녀올 값을 못 한다

# 화로 한 대는 한 가지만 녹인다. 여덟 대에 전부 철을 넣으면 구리는
# 녹일 데가 없어지고, 구리가 없으면 회로도 과학팩도 못 만든다 - 발전
# 사슬 전체가 「화로가 꽉 찼다」 한 줄에 멈춘다.
#
# 그래서 줄의 «끝 두 대»는 구리 몫으로 비워 둔다. 밭마다 줄이 있듯
# 광석마다 화로가 있어야 한다.
COPPER_TAIL = 2

# 창고 칸은 셋인데 나르는 것은 그보다 많다. 어느 칸에 넣을지는 «여기»에
# 한 번만 적는다 - 들고 와서 넣을 데가 없으면 그대로 들고 서 있게 된다.
SHELF_OF = {
    "iron-plate": "iron-plate", "copper-plate": "iron-plate",
    "stone": "stone", "stone-brick": "stone", "wood": "stone",
    "coal": "coal",
}


def where(item, shelf, room=None):
    """이 물건이 갈 칸. 그 칸이 «찼으면» 갈 데가 없는 것이다.

    실측(20회차 108분): 돌 칸이 1600(32칸 x 50)으로 꽉 찼는데, 운반
    당번이 돌 2071을 들고 「창고에 내려놓기」를 순번마다 되풀이했다.
    그동안 화로 스물두 대는 철판을 물고 막혀 있었고 창고 철판은 0이었다.
    들어가지도 않는 것을 나르느라 정작 나를 것을 못 날랐다.
    """
    key = SHELF_OF.get(item)
    if not key:
        return None
    if room is not None and room.get(key, 1) <= 0:
        return None
    return shelf.get(key)


def headroom(reply, shelf):
    """창고 칸마다 빈 자리가 얼마나 남았나."""
    out = {}
    for c in chests(reply, "depot"):
        for key, at in shelf.items():
            if abs(c["x"] - at[0]) < 1 and abs(c["y"] - at[1]) < 1:
                out[key] = c["free"]
    return out


def look(ai, depot, smelt):
    """어디에 무엇이 쌓였고 어디가 비었나. 한 번에 묻는다."""
    dx, dy = depot
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local F, P, D = {}, {}, {}
      local function inside(p)
        return p.x >= %d and p.x <= %d and p.y >= %d and p.y <= %d
      end
      for _, f in pairs(s.find_entities_filtered{type="furnace",
                force=game.forces.player}) do
        local src = f.get_inventory(defines.inventory.furnace_source)
        local res = f.get_inventory(defines.inventory.furnace_result)
        local fuel = f.get_inventory(defines.inventory.fuel)
        local ore, plate = 0, 0
        local what = ""
        for _, item in pairs(src.get_contents()) do
          ore = ore + item.count; what = item.name
        end
        local made = ""
        for _, item in pairs(res.get_contents()) do
          plate = plate + item.count; made = item.name
        end
        local burn = 0
        for _, item in pairs(fuel.get_contents()) do burn = burn + item.count end
        -- status 27 = full_output. 뱉을 데가 없어 선 것이다.
        local jam = (f.status == defines.entity_status.full_output) and 1 or 0
        F[#F+1] = string.format("%%.1f|%%.1f|%%d|%%s|%%d|%%s|%%d|%%d",
          f.position.x, f.position.y, ore, what, plate, made, burn, jam)
      end
      for _, c in pairs(s.find_entities_filtered{type="container",
                force=game.forces.player}) do
        local inv = c.get_inventory(defines.inventory.chest)
        local rows = {}
        for _, item in pairs(inv.get_contents()) do
          rows[#rows+1] = item.name .. "=" .. item.count
        end
        -- 빈 칸이 몇인가. 「넣을 수 있나」는 내용물이 아니라 «자리»가 답한다.
        local free = 0
        for i = 1, #inv do
          if not inv[i].valid_for_read then free = free + 1 end
        end
        local line = string.format("%%.1f|%%.1f|%%d|%%s", c.position.x, c.position.y,
                                   free, table.concat(rows, ","))
        if inside(c.position) then D[#D+1] = line else P[#P+1] = line end
      end
      return { furnaces = F, piles = P, depot = D }
    end)()""" % (dx - 3, dx + 3, dy - 4, dy + 6))


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def furnaces(reply):
    out = []
    for row in _rows(reply.get("furnaces")):
        x, y, ore, what, plate, made, burn, jam = row.split("|")
        out.append({"x": float(x), "y": float(y), "ore": int(ore), "what": what,
                    "plate": int(plate), "made": made, "burn": int(burn),
                    "jammed": jam == "1"})
    return sorted(out, key=lambda f: (f["x"], f["y"]))


def chests(reply, key):
    out = []
    for row in _rows(reply.get(key)):
        x, y, free, body = row.split("|")
        held = {}
        for cell in body.split(","):
            if "=" in cell:
                name, n = cell.rsplit("=", 1)
                held[name] = int(n)
        out.append({"x": float(x), "y": float(y), "held": held,
                    "free": int(free)})
    return out


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def lanes(hot, tail=COPPER_TAIL):
    """어느 화로가 무엇을 녹이나. 줄의 끝 두 대가 구리다."""
    tail = min(tail, max(0, len(hot) - 1))
    return ([(f, "iron-ore") for f in hot[:len(hot) - tail]]
            + [(f, "copper-ore") for f in hot[len(hot) - tail:]])


KEEP = 20          # 손에 남겨 두는 몫


def unload(ai, who, shelf, room=None):
    """손에 든 것을 창고에 내려놓는다.

    나르는 사람이 «들고만» 있으면 그것은 나른 것이 아니다. 20회차에서
    둘이 돌 150씩을 든 채 한가하게 서 있었고, 그 사이 증식 고리는
    「창고에 돌이 없다」며 사람을 또 캐러 보냈다.
    """
    held = ai.agent(who).items()
    drop = {k: v - KEEP for k, v in held.items()
            if where(k, shelf, room) and v - KEEP >= PILE_FLOOR}
    if not drop:
        return False
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1})]
    for item, n in drop.items():
        at = where(item, shelf, room)
        plan.append(("insert", {"name": item, "x": at[0], "y": at[1], "count": n}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 창고에 내려놓기 {drop}")
    return True


def feed(ai, who, reply, shelf):
    """화로에 광석과 연료를 댄다.

    화로가 비어 서 있는 동안은 판이 안 나오고, 판이 없으면 채굴기도
    상자도 못 만든다. 그래서 이 걸음이 «가장 먼저»다.
    """
    hot = furnaces(reply)
    # 남의 광석이 든 화로는 비울 때까지 그냥 둔다. 한 대는 한 가지만 녹는다.
    hungry = [(f, ore) for f, ore in lanes(hot)
              if (f["ore"] < 10 and f["what"] in ("", ore)) or f["burn"] < 5]
    if not hungry:
        return False

    # 광석은 밭 상자에, 석탄은 석탄밭 상자에 쌓여 있다.
    piles = chests(reply, "piles") + chests(reply, "depot")
    want = {}
    for f, ore in hungry:
        if f["ore"] < 10 and f["what"] in ("", ore):
            want[ore] = want.get(ore, 0) + FURNACE_ORE
        if f["burn"] < 5:
            want["coal"] = want.get("coal", 0) + FURNACE_COAL

    legs, got = [], {}
    for item, want_n in want.items():
        if want_n <= 0:
            continue
        for pile in sorted(piles, key=lambda p: -p["held"].get(item, 0)):
            have = pile["held"].get(item, 0)
            if have < PILE_FLOOR or got.get(item, 0) >= want_n:
                break
            take = min(have, want_n - got.get(item, 0), CARRY)
            legs.append((pile, item, take))
            got[item] = got.get(item, 0) + take
    if not legs:
        return False

    plan = []
    for pile, item, n in legs:
        plan.append(("walk_to", {"x": pile["x"] - 1, "y": pile["y"] + 1}))
        plan.append(("take", {"name": item, "x": pile["x"], "y": pile["y"],
                              "count": n}))
    plan.append(("walk_to", {"x": hungry[0][0]["x"], "y": hungry[0][0]["y"] + 2}))
    for f, ore in hungry:
        if got.get(ore) and f["ore"] < 10 and f["what"] in ("", ore):
            plan.append(("insert", {"name": ore, "x": f["x"], "y": f["y"],
                                    "count": FURNACE_ORE}))
        if got.get("coal") and f["burn"] < 5:
            plan.append(("insert", {"name": "coal", "x": f["x"], "y": f["y"],
                                    "count": FURNACE_COAL}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 화로 {len(hungry)}대에 장입 - {got}")
    return True


def drain(ai, who, reply, shelf):
    """화로가 만든 판과 밭 상자의 돌·석탄을 창고로 옮긴다.

    창고에 있어야 쓸 수 있다. 화로 안에 든 판은 아직 아무것도 아니다.
    """
    hot = [f for f in furnaces(reply)
           if f["plate"] >= 10 and where(f["made"], shelf)]
    # 가장 많이 쌓인 상자부터. 찬 상자는 그 뒤의 채굴기를 세우고 있으므로,
    # 아무 순서로 넷을 고르면 정작 막힌 곳이 계속 밀린다.
    piles = sorted(
        (p for p in chests(reply, "piles")
         if any(n >= PILE_FLOOR and where(k, shelf, room)
                for k, n in p["held"].items())),
        key=lambda p: -sum(n for k, n in p["held"].items()
                           if where(k, shelf, room)))
    if not hot and not piles:
        return False

    plan, got = [], {}
    # 여덟 대만 보던 것도 같은 이유로 늘린다. 막힌 화로를 «남겨 두고»
    # 오면 그 화로는 다음 순번까지 한 장도 안 만든다.
    for f in hot[:24]:
        plan.append(("walk_to", {"x": f["x"], "y": f["y"] + 2}))
        plan.append(("take", {"name": f["made"], "x": f["x"], "y": f["y"],
                              "count": f["plate"]}))
        got[f["made"]] = got.get(f["made"], 0) + f["plate"]
        # 막힌 화로는 «원료칸»도 비운다. 결과칸만 비우면 다음 순번에
        # 또 같은 것을 굽다가 또 막힌다.
        if (f["jammed"] or mismatched(f)) and f["what"] and where(f["what"], shelf, room):
            plan.append(("take", {"name": f["what"], "x": f["x"], "y": f["y"],
                                  "count": f["ore"]}))
            got[f["what"]] = got.get(f["what"], 0) + f["ore"]
    for p in piles[:8]:
        for item, n in p["held"].items():
            if (n < PILE_FLOOR or not where(item, shelf, room)
                    or got.get(item, 0) >= CARRY):
                continue
            plan.append(("walk_to", {"x": p["x"] - 1, "y": p["y"] + 1}))
            plan.append(("take", {"name": item, "x": p["x"], "y": p["y"],
                                  "count": min(n, CARRY)}))
            got[item] = got.get(item, 0) + min(n, CARRY)
    if not got:
        return False

    plan.append(("walk_to", {"x": shelf["iron-plate"][0] - 2,
                             "y": shelf["iron-plate"][1] + 1}))
    for item, n in got.items():
        at = where(item, shelf, room)
        if at:
            plan.append(("insert", {"name": item, "x": at[0], "y": at[1],
                                    "count": n}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 창고로 - {got}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="60,-115")
    ap.add_argument("--smelt", default="35,-115")
    ap.add_argument("--carriers", default="delta,golf,hotel")
    ap.add_argument("--rounds", type=int, default=4000)
    ap.add_argument("--every", type=float, default=20)
    args = ap.parse_args()

    dx, dy = (int(v) for v in args.depot.split(","))
    sx, sy = (int(v) for v in args.smelt.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}
    carriers = [n.strip() for n in args.carriers.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            free = idle(ai, carriers)
            if not free:
                time.sleep(args.every)
                continue
            reply = look(ai, (dx, dy), (sx, sy))
            room = headroom(reply, shelf)
            if any(v <= 0 for v in room.values()):
                full = [k for k, v in room.items() if v <= 0]
                print(f"  창고 {','.join(full)} 칸이 찼다 - 그것은 안 나른다")
            # 0. 손에 든 것부터 푼다. 들고 있는 것은 아직 나른 것이 아니다.
            for who in list(free):
                if unload(ai, who, shelf, room):
                    free.remove(who)
            if free:
                # 화로가 먼저. 선 화로는 판을 안 내고, 판이 없으면 전부 멈춘다.
                if feed(ai, free[0], reply, shelf):
                    free = free[1:]
                if free:
                    drain(ai, free[0], reply, shelf)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

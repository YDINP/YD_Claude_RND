"""Opening: turn eight empty hands into a smelter row and a depot.

판이 열리면 여덟 명 모두 «빈손»이다. 채굴기 한 대에 철판 9와 돌 5가
드는데, 철판을 만들려면 화로가 있어야 하고 화로에는 돌 5가 든다. 그래서
첫 몇 분만은 손으로 캐는 것 말고 방법이 없다.

    사용자: "시작했을때 제일 우선으로 할거는 채굴기를 만들어서 광석마다
             배치해서 생산효율을 올리는게 콜드스타트의 지점이야."

그 채굴기를 세우기 위한 «최소한의 발판»이 이 스크립트다. 여기서 만드는
것은 딱 둘이다.

    화로 여덟 대   - 광석을 판으로 바꾸는 유일한 문
    창고 상자 셋   - 판.돌.석탄이 「가진 것」에서 «쓸 수 있는 것»이 되는 곳

이 둘이 서면 손은 뗀다. 그 뒤로는 grow / haul / guard / spark 가 받는다.
매번 사람이 손으로 세우던 것이라 판마다 자리가 달라졌고, 달라진 자리를
다른 고리들이 몰라서 「창고가 비었다」로 읽혔다.

    python scripts/settle.py --smelt=-20,-90 --depot=5,-90

음수 좌표는 `--smelt=-20,-90` 처럼 «등호»로 준다. 띄어 쓰면 argparse 가
`-20,-90` 을 옵션 이름으로 읽고 죽는다.
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

FURNACE = "stone-furnace"
CHEST = "iron-chest"
PITCH = 3                  # 화로 사이 간격. 나중에 인서터와 벨트가 들어갈 자리
WANT_FURNACE = 8

# 밭마다 «얼마나 필요한가». 사람 수가 아니라 이 값이 일을 정한다.
#
# 사용자가 짚었다: "같은일을 여러캐릭터가 동시에하는거아냐? 돌캐는거랑
# 철광석캐기처럼 같은개수를 똑같이하는거지?"
#
# 그랬다. 돌 150이 필요한데 셋에게 각각 150을 시켜 450을 캤고, 셋 다
# 같은 칸으로 보냈다. 그것은 병렬이 아니라 «같은 일을 세 번» 하는 것이다.
# 병렬은 할 일을 나누는 것이지 베끼는 것이 아니다.
NEED = {
    "stone": WANT_FURNACE * 5 + 60,   # 화로 여덟 대 + 첫 채굴기 몇 대
    "iron-ore": 320,                  # 첫 판 -> 창고 상자 셋 + 채굴기
    "coal": 360,                      # 화로 연료 + 채굴기 점화
}
MIN_TRIP = 60              # 이보다 적게 시키면 왕복이 아깝다
SPREAD = 8                 # 사람 사이를 이만큼 띄운다. 같은 칸에서 겹치지 않게


def standing(ai, smelt, depot):
    sx, sy = smelt
    dx, dy = depot
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local plate, stone, coal = 0, 0, 0
      for _, c in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="container", force=f}) do
        local inv = c.get_inventory(defines.inventory.chest)
        plate = plate + inv.get_item_count("iron-plate")
        stone = stone + inv.get_item_count("stone")
        coal = coal + inv.get_item_count("coal")
      end
      local ready, in_ore, in_coal = 0, 0, 0
      for _, fu in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="furnace", force=f}) do
        ready = ready + fu.get_inventory(defines.inventory.furnace_result)
                          .get_item_count("iron-plate")
        for _, i in pairs(fu.get_inventory(defines.inventory.furnace_source)
                            .get_contents()) do
          in_ore = in_ore + i.count
        end
        for _, i in pairs(fu.get_inventory(defines.inventory.fuel)
                            .get_contents()) do
          in_coal = in_coal + i.count
        end
      end
      return {
        furnaces = s.count_entities_filtered{area={{%d,%d},{%d,%d}},
                   type="furnace", force=f},
        chests = s.count_entities_filtered{area={{%d,%d},{%d,%d}},
                 type="container", force=f},
        plate = plate, stone = stone, coal = coal, in_furnace = ready,
        in_ore = in_ore, in_coal = in_coal,
      }
    end)()""" % (dx - 3, dy - 4, dx + 3, dy + 6,
                 sx - 3, sy - 3, sx + PITCH * WANT_FURNACE + 3, sy + 3,
                 sx - 3, sy - 3, sx + PITCH * WANT_FURNACE + 3, sy + 3,
                 dx - 3, dy - 4, dx + 3, dy + 6))


def alive(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names if rows.get(n) and rows[n].get("alive")]


def free(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def mid(field):
    return ((field["left"] + field["right"]) // 2,
            (field["top"] + field["bottom"]) // 2)


def near_patch(ai, ore, anchor, span=60):
    """흩어진 광맥 중 «기지에서 가까운 덩어리»의 경계.

    밭 전체의 경계를 쓰면 돌밭이 (33,-76)..(57,128) 같은 200칸짜리 상자가
    된다. 그 안 대부분은 빈 땅이고, 자리표는 거기를 훑다가 아무것도 못
    찾는다. 가까운 한 덩어리만 본다.
    """
    ax, ay = anchor
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local best, bd = nil, 1e18
      for _, e in pairs(s.find_entities_filtered{name="%s"}) do
        local d = (e.position.x - %d)^2 + (e.position.y - %d)^2
        if d < bd then bd, best = d, e end
      end
      if not best then return { n = 0 } end
      local L, T, R, B, n = 1e9, 1e9, -1e9, -1e9, 0
      for _, e in pairs(s.find_entities_filtered{name="%s", position=best.position,
                radius=%d}) do
        n = n + 1
        if e.position.x < L then L = e.position.x end
        if e.position.x > R then R = e.position.x end
        if e.position.y < T then T = e.position.y end
        if e.position.y > B then B = e.position.y end
      end
      return { n = n, left = L, top = T, right = R, bottom = B,
               gap = math.floor(math.sqrt(bd)) }
    end)()""" % (ore, ax, ay, ore, span))
    if not int(reply.get("n", 0)):
        return None
    return {"ore": ore, "left": int(reply["left"]), "top": int(reply["top"]),
            "right": int(reply["right"]), "bottom": int(reply["bottom"]),
            "n": int(reply["n"]), "gap": int(reply["gap"])}


def share(need, movers, gap):
    """할 일을 «나눈다». 몇 명이 갈지와 한 사람 몫을 함께 정한다.

    먼 밭일수록 한 사람이 많이 든다 - 88칸을 두 번 걷느니 한 번에 지고
    오는 편이 싸다. 가까운 밭은 조금씩 자주가 낫다.
    """
    if need <= 0 or movers <= 0:
        return 0, 0
    trip = max(MIN_TRIP, min(200, 40 + gap * 2))
    hands = max(1, min(movers, -(-need // trip)))     # 올림 나눗셈
    return hands, -(-need // hands)


def spot_for(field, i, hands):
    """i번째 사람이 설 자리. 한 밭이라도 «같은 칸»에 모으지 않는다."""
    cx, cy = mid(field)
    if hands <= 1:
        return cx, cy
    wide = (field["right"] - field["left"]) >= (field["bottom"] - field["top"])
    step = (i - (hands - 1) / 2) * SPREAD
    if wide:
        lo, hi = field["left"] + 3, field["right"] - 3
        return int(min(max(cx + step, lo), hi)), cy
    lo, hi = field["top"] + 3, field["bottom"] - 3
    return cx, int(min(max(cy + step, lo), hi))


def fetch(ai, who, field, count, drop, at=None):
    """손으로 캐서 정해진 자리에 내려놓는다. 이 판에서 딱 한 번."""
    x, y = at or mid(field)
    submit(ai, who, [
        ("walk_to", {"x": x, "y": y}),
        ("mine", {"name": field["ore"], "x": x, "y": y, "count": count,
                  "search_radius": 16, "timeout_ticks": 60 * 60 * 8}),
        ("walk_to", {"x": drop[0], "y": drop[1]}),
    ], strict=False)
    print(f"{who}: {field['ore']} {count} 캐러 ({x},{y}) - {field['gap']}칸")
    return count


def build_row(ai, who, smelt):
    """화로 여덟 대를 한 줄로. 간격 3은 나중에 벨트와 인서터가 들어갈 자리."""
    sx, sy = smelt
    plan = [("craft", {"recipe": FURNACE, "count": WANT_FURNACE}),
            ("walk_to", {"x": sx, "y": sy + 2})]
    for i in range(WANT_FURNACE):
        plan.append(("build", {"name": FURNACE, "x": sx + i * PITCH, "y": sy}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 화로 {WANT_FURNACE}대 ({sx},{sy}) 부터 간격 {PITCH}")


def build_depot(ai, who, depot):
    """판.돌.석탄 세 칸. 다른 고리들이 «여기»를 보고 산다."""
    dx, dy = depot
    plan = [("craft", {"recipe": CHEST, "count": 3}),
            ("walk_to", {"x": dx - 2, "y": dy + 2})]
    for i in range(3):
        plan.append(("build", {"name": CHEST, "x": dx, "y": dy + i * 2}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 창고 세 칸 ({dx},{dy}) 판 / ({dx},{dy+2}) 돌 / ({dx},{dy+4}) 석탄")


def charge(ai, who, smelt, ore, coal_n, ore_n):
    """화로에 광석과 연료를 넣는다."""
    sx, sy = smelt
    plan = [("walk_to", {"x": sx, "y": sy + 2})]
    for i in range(WANT_FURNACE):
        at = {"x": sx + i * PITCH, "y": sy}
        if coal_n:
            plan.append(("insert", dict(at, name="coal", count=coal_n)))
        if ore_n:
            plan.append(("insert", dict(at, name=ore, count=ore_n)))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 화로에 {ore} {ore_n}씩 + 석탄 {coal_n}씩")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smelt", required=True, help="화로 줄의 «첫» 칸")
    ap.add_argument("--depot", required=True, help="창고 줄의 «첫» 칸")
    ap.add_argument("--crew", default="alpha,bravo,charlie,delta,echo,golf,hotel")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=400)
    args = ap.parse_args()

    sx, sy = (int(v) for v in args.smelt.split(","))
    dx, dy = (int(v) for v in args.depot.split(","))
    crew = [n.strip() for n in args.crew.split(",") if n.strip()]
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}

    ai = AIBridge()
    patches = {}
    for ore in ("stone", "iron-ore", "coal"):
        p = near_patch(ai, ore, (sx, sy))
        if p:
            patches[ore] = p
            print(f"가까운 {ore}: {p['n']}칸 {p['gap']}칸 거리 "
                  f"({p['left']},{p['top']})..({p['right']},{p['bottom']})")
    if "stone" not in patches:
        print("돌밭이 안 보인다. 화로를 못 만든다.")
        return 1

    # 심부름 나간 사람과 그 몫. 돌아오면(=한가해지면) 지운다 - 그때부터는
    # 손에 든 것으로 세면 되기 때문이다. 이것을 안 세면 순번마다 또 보내고,
    # 지우지 않으면 영영 «충분하다»고 착각한다.
    errand: dict = {}
    for _ in range(args.rounds):
        try:
            st = standing(ai, (sx, sy), (dx, dy))
            if int(st["furnaces"]) >= WANT_FURNACE and int(st["chests"]) >= 3:
                # 「여기가 기지다」를 게임에도 알린다. 방어 자리표는 집이
                # 어디인지를 알아야 «지킬 것이 있는 쪽»을 고를 수 있다.
                try:
                    ai.set_depot(dx + 0.5, dy + 0.5)
                except RconError:
                    pass
                print(f"발판 완성 - 화로 {st['furnaces']} 창고 {st['chests']} "
                      f"판 {st['plate']}. 손을 뗀다.")
                return 0

            idle = [n for n in free(ai, crew)]
            if not idle:
                time.sleep(args.every)
                continue

            bags = {n: ai.agent(n).items() for n in idle}
            for name in list(errand):
                if name in idle:
                    errand.pop(name)
            ordered: dict = {}
            for ore, n in errand.values():
                ordered[ore] = ordered.get(ore, 0) + n

            # 1. 돌이 모이면 화로부터. 돌이 없으면 아무것도 시작이 안 된다.
            if int(st["furnaces"]) < WANT_FURNACE:
                ready = next((n for n in idle
                              if int(bags[n].get("stone", 0)) >= WANT_FURNACE * 5),
                             None)
                if ready:
                    build_row(ai, ready, (sx, sy))
                    idle.remove(ready)

            # 2. 화로가 섰으면 들고 온 것을 넣는다.
            if int(st["furnaces"]):
                for who in list(idle):
                    for ore in ("coal", "iron-ore"):
                        if int(bags[who].get(ore, 0)) >= 60:
                            charge(ai, who, (sx, sy), ore,
                                   25 if ore == "coal" else 0,
                                   0 if ore == "coal" else 25)
                            idle.remove(who)
                            break

            # 3. 남은 사람을 «모자란 만큼»으로 나눠 보낸다.
            #    사람 수대로 베끼지 않는다 - 필요한 양을 나눈다.
            for ore in ("stone", "coal", "iron-ore"):
                if not idle or ore not in patches:
                    break
                got = ordered.get(ore, 0)
                got += sum(int(b.get(ore, 0)) for b in bags.values())
                if ore == "stone":
                    got += int(st["stone"])
                elif ore == "coal":
                    got += int(st["coal"]) + int(st["in_coal"])
                else:
                    got += int(st["in_ore"]) + int(st["in_furnace"])
                short = NEED[ore] - got
                hands, each = share(short, len(idle), patches[ore]["gap"])
                if not hands:
                    continue
                print(f"  {ore}: {short} 모자람 -> {hands}명이 {each}씩")
                for i in range(hands):
                    who = idle.pop(0)
                    at = spot_for(patches[ore], i, hands)
                    fetch(ai, who, patches[ore], each, (sx, sy + 2), at)
                    errand[who] = (ore, each)
                    if not idle:
                        break

            # 3. 판이 나오면 창고를 세운다.
            if idle and int(st["chests"]) < 3:
                who = idle[0]
                held = ai.agent(who).items()
                if int(held.get("iron-plate", 0)) >= 24:
                    build_depot(ai, who, (dx, dy))
                elif int(st["in_furnace"]) >= 24:
                    submit(ai, who, [
                        ("walk_to", {"x": sx, "y": sy + 2}),
                        *[("take", {"name": "iron-plate", "x": sx + i * PITCH,
                                    "y": sy, "count": 20})
                          for i in range(WANT_FURNACE)],
                    ], strict=False)
                    print(f"{who}: 화로에서 판 거두기 ({st['in_furnace']})")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    print("발판이 시간 안에 안 섰다.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

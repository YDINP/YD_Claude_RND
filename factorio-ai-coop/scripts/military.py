"""Military science: a star of three machines south of the science block.

빨강·녹색만으로 되는 기술은 스물아홉이고, 포탑 위력 3 부터는 군용 팩이
든다. 진화 0.51 에 공해 416/h - 방어 고도화의 직행 경로다.

    군용 팩 2 = 관통탄 1 + 수류탄 1 + 돌벽 2   (10초)
    관통탄 = 탄창 1 + 강철 1 + 구리판 5 / 수류탄 = 철판 5 + 석탄 10 / 돌벽 = 벽돌 5

세 재료가 한 조립기로 들어가야 하는데 조립기 한 변에 팔 하나다. 벨트에
섞어 보내면 막다른 끝이 «필요 없는 것»으로 차서 교착한다(스시 고리의
싱크 상자가 그래서 있다). 그래서 «별»이다: 가운데 군용 조립기, 서쪽에
관통탄 조립기, 남쪽에 수류탄 조립기, 사이마다 «그 품목만 드는 상자» 하나.
상자가 차면 그 생산자만 서고 다른 것은 안 막힌다. 북쪽 상자의 돌벽은
루프가 벽돌로 손수 만들어 넣는다 - 조립기 한 대 값도 안 되는 일이다.

              [M2 공급: 탄창·강철·구리]        [돌벽]
                     M2 관통탄  -> [P] ->   M5 군용  -> 팩 기둥 (x=-12) -> 연구소
                                            [G]
                                            M3 수류탄 <- [M3 공급: 철판·석탄]

판·석탄·강철·탄창은 창고에 넘친다(철판 21만). 벨트로 끌어올 것이 아니라
루프가 채운다 - «자동화 안 된 입력만 손으로» 라는 규칙 그대로.

    python scripts/military.py                     # 어디까지 됐나
    python scripts/military.py --who golf --build  # 세운다
    python scripts/military.py --who golf --every 60   # 채운다 (상시)
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
import steelworks                        # noqa: E402  (강철 자리 화로)

AM, ARM, BOX, POLE, BELT = ("assembling-machine-1", "inserter", "iron-chest",
                            "small-electric-pole", "transport-belt")
N, E, S, W = 0, 4, 8, 12
DEPOT = (-55, 10)

M5, M2, M3 = (-14.5, 68.5), (-20.5, 68.5), (-14.5, 74.5)
RECIPES = {M5: "military-science-pack", M2: "piercing-rounds-magazine", M3: "grenade"}
WALLS = (-14.5, 65.5)          # 돌벽 상자 (손으로)
SUP2 = (-20.5, 65.5)           # M2 공급: 탄창·강철·구리판
SUP3 = (-17.5, 74.5)           # M3 공급: 철판·석탄
CHEST_P, CHEST_G = (-17.5, 68.5), (-14.5, 71.5)
XCOL = -11.5                   # 팩 기둥. y 63 이 머리 - 뒤(남쪽)에서 이어 붙인다

WANT = {                       # 상자: {품목: 채워 둘 양}
    # 수류탄이 석탄을 초당 하나 먹는다 - 2형 셋이면 60초 순번 사이에 200 은 바닥난다.
    SUP2: {"firearm-magazine": 150, "steel-plate": 80, "copper-plate": 400},
    SUP3: {"iron-plate": 300, "coal": 500},
    WALLS: {"stone-wall": 150},
}


def _b(name, x, y, d=None):
    p = {"name": name, "x": x, "y": y}
    if d is not None:
        p["direction"] = d
    return ("build", p)


STEPS = [
    ("walk_to", {"x": -9.5, "y": 70.5}),
    *[_b(BELT, XCOL, y + 0.5, N) for y in range(68, 63, -1)],       # 68.5 .. 64.5 북쪽으로
    _b(AM, *M5), _b(ARM, -12.5, 68.5, W),                             # M5 -> 기둥
    _b(BOX, *WALLS), _b(ARM, -14.5, 66.5, N),                         # 돌벽 상자 -> M5
    _b(ARM, -16.5, 68.5, W), _b(BOX, *CHEST_P), _b(ARM, -18.5, 68.5, W),   # M2 -> [P] -> M5
    ("walk_to", {"x": -23.5, "y": 66.5}),
    _b(AM, *M2), _b(BOX, *SUP2), _b(ARM, -20.5, 66.5, N),             # 공급 -> M2
    ("walk_to", {"x": -18.5, "y": 77.5}),
    _b(ARM, -14.5, 70.5, S), _b(BOX, *CHEST_G), _b(ARM, -14.5, 72.5, S),   # M3 -> [G] -> M5
    _b(AM, *M3), _b(BOX, *SUP3), _b(ARM, -16.5, 74.5, W),             # 공급 -> M3
    _b(POLE, -12.5, 66.5), _b(POLE, -18.5, 66.5), _b(POLE, -12.5, 72.5),
    _b(POLE, -16.5, 72.5),          # M3 공급 팔(-16.5,74.5)은 -12.5 전봇대 구역(x>=-15) 밖이다
]
KIT = {AM: 3, BOX: 5, ARM: 8, POLE: 4, BELT: 5}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def standing(ai) -> set:
    """이미 선 것의 (이름, x, y)."""
    packed = ";".join(f"{p['name']},{p['x']},{p['y']}" for k, p in STEPS if k == "build")
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        if s.count_entities_filtered{name = n, force = f,
             area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}} > 0 then out[#out+1] = bit end
      end
      return out
    end)()""" % packed)
    out = set()
    for row in _rows(reply):
        n, x, y = str(row).split(",")
        out.add((n, float(x), float(y)))
    return out


def settle(ai) -> list:
    packed = ";".join(f"{x},{y},{r}" for (x, y), r in RECIPES.items())
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y, r = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local m = s.find_entities_filtered{type = "assembling-machine", force = f,
                    area = {{tonumber(x) - 0.5, tonumber(y) - 0.5}, {tonumber(x) + 0.5, tonumber(y) + 0.5}}}[1]
        if m then
          if not m.get_recipe() or m.get_recipe().name ~= r then m.set_recipe(r) end
          out[#out+1] = r
        end
      end
      return out
    end)()""" % packed)
    return _rows(reply)


def chests(ai) -> dict:
    """{(x, y): {품목: 수}} 공급 상자 셋."""
    packed = ";".join(f"{x},{y}" for x, y in WANT)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local c = s.find_entities_filtered{name = "%s", force = f,
                    area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}}[1]
        if c then
          local t = {}
          for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
            t[#t+1] = v.name .. "=" .. v.count
          end
          out[#out+1] = x .. "|" .. y .. "|" .. table.concat(t, ",")
        end
      end
      return out
    end)()""" % (packed, BOX))
    out = {}
    for row in _rows(reply):
        x, y, held = str(row).split("|")
        d = {}
        for bit in held.split(","):
            if bit:
                n, c = bit.split("=")
                d[n] = int(c)
        out[(float(x), float(y))] = d
    return out


def made(ai) -> int:
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local m = s.find_entities_filtered{type = "assembling-machine", force = f,
                  area = {{%f, %f}, {%f, %f}}}[1]
      return { n = m and m.products_finished or -1 }
    end)()""" % (M5[0] - 0.5, M5[1] - 0.5, M5[0] + 0.5, M5[1] + 0.5))
    return int(reply["n"])


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def build(ai, who):
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    plan = []
    for item, n in (("iron-plate", 250), ("copper-plate", 80), ("wood", 4)):
        at = have.get(item)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    up = standing(ai)
    need = {}
    for k, p in STEPS:
        if k == "build" and (p["name"], p["x"], p["y"]) not in up:
            need[p["name"]] = need.get(p["name"], 0) + 1
    for item, n in need.items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            count = (short + 1) // 2 if item in (BELT, POLE) else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    plan.extend(st for k, st in ((k, st) for k, st in ((s[0], s) for s in STEPS))
                if k != "build" or (st[1]["name"], st[1]["x"], st[1]["y"]) not in up)
    submit(ai, who, plan[:60], strict=False)
    print(f"{who}: 군용 모듈 세우기 ({len(plan)}단계, 선 것 {len(up)} 뺌)")


def feed(ai, who) -> list:
    """모자란 상자를 채우는 걸음. 돌벽은 벽돌로 만든다, 강철은 강철 자리에서."""
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    got = chests(ai)
    short = {}                              # 품목 -> [(상자, 양)]
    for at, want in WANT.items():
        held = got.get(at)
        if held is None:
            continue
        for item, n in want.items():
            gap = n - held.get(item, 0)
            if gap >= n // 2:
                short.setdefault(item, []).append((at, gap))
    if not short:
        return []
    plan = []
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    # 재료 모으기
    for item, drops in short.items():
        total = sum(g for _at, g in drops)
        if item == "stone-wall":
            bricks = total * 5 - int(bag.get("stone-brick", 0))
            at = have.get("stone-brick")
            if at and bricks > 0:
                plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
                plan.append(("take", {"name": "stone-brick", "x": at[0], "y": at[1], "count": bricks}))
            plan.append(("craft", {"recipe": "stone-wall", "count": total, "wait": True}))
        elif item == "steel-plate":
            site = steelworks.site(ai)
            plan.append(("walk_to", {"x": -67.5, "y": 28.5}))
            for (kx, ky), st in site.items():
                if st["steel"]:
                    plan.append(("take", {"name": "steel-plate", "x": kx, "y": ky, "count": st["steel"]}))
        else:
            at = have.get(item)
            lack = total - int(bag.get(item, 0))
            if at and lack > 0:
                plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
                plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": lack}))
            elif not at and item == "firearm-magazine":
                plan.append(("craft", {"recipe": "firearm-magazine", "count": min(lack, 50), "wait": True}))
    # 넣기
    plan.append(("walk_to", {"x": -18.5, "y": 71.5}))
    for item, drops in short.items():
        for (x, y), gap in drops:
            plan.append(("insert", {"name": item, "x": x, "y": y, "count": gap}))
    return plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    ai = AIBridge()

    up = standing(ai)
    total = sum(1 for k, _p in STEPS if k == "build")
    print(f"  군용 모듈 {len(up)}/{total} 섰다 · 팩 {max(made(ai), 0)}개 만들었다")
    if not args.who:
        for at, held in chests(ai).items():
            print(f"    상자 {at}: {held}")
        return 0
    if args.build:
        for _round in range(4):
            build(ai, args.who)
            for _ in range(120):
                time.sleep(5)
                if idle(ai, args.who):
                    break
            if len(standing(ai)) >= total:
                break
        print("  " + ", ".join(settle(ai)))
        print(f"  {len(standing(ai))}/{total}")
        if not args.every:
            return 0
    last = made(ai)
    for _ in range(args.rounds):
        try:
            if idle(ai, args.who):
                settle(ai)
                plan = feed(ai, args.who)
                if plan:
                    submit(ai, args.who, plan[:60], strict=False)
                    print(f"{args.who}: 군용 상자 채우기 ({len(plan)}단계)")
                now = made(ai)
                if now != last:
                    print(f"  군용 팩 +{now - last} (누적 {now})")
                    last = now
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""run25 opening (P0) - empty hands to burner town, steam power and the first lab. Character orders only.

run25 규칙 (docs/run25-api-rules.md): 게임을 바꾸는 Lua 0. 세계를 바꾸는 일은 모두 캐릭터 일감
(walk_to · mine · build · craft · insert · take) 으로 보내고, 게임에는 읽기만 묻는다.
coldstart.py 의 도우미 (광맥 자리 · 가방 · 화로 결과칸 읽기) 를 그대로 쓴다.

단계 (한 번씩 부르고, 끝났는지는 status 로 게임에 묻는다):

    furnaces  돌 조가 만든 화로를 철 직결 자리 12 · 구리 직결 자리 6 에 세우고, 광석 · 석탄을 넣는다 (손 제련)
    plates    화로 결과칸의 판을 거둬 허브 상자로 (허브 상자가 없으면 나무 → 상자)
    drills    판 -> 버너 채굴기: 철 12 · 구리 6 은 화로 위 (직결), 석탄 4 는 상자로
    fuel      채굴기 · 화로에 석탄 (석탄 상자에서 꺼내 넣기)
    status    가방 · 화로 · 채굴기 · 판 합 · 트리거 기술

    python scripts/open25.py --run run25 status
    python scripts/open25.py --run run25 furnaces
"""
import argparse
import os
import sys
import time

os.environ["AI_OWNER"] = "open25"
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401  (--run 을 먼저 뽑는다)
import coldstart as cs                   # noqa: E402
import detached                          # noqa: E402
from client import AIBridge, RconError   # noqa: E402

OWNER = "open25"
SITE = runsite.load()
HUB = tuple(SITE["hub"])
STONE, IRON, COAL = cs.ROLES["stone"], cs.ROLES["iron-ore"], cs.COALMAN
CREW = STONE + IRON + [COAL]
DRILL = "burner-mining-drill"


def give(ai, who, plan) -> None:
    cs.give(ai, who, plan)


def at(x, y, dy=2.0):
    return ("walk_to", {"x": x + 0.5, "y": y + dy})


def seats(ai):
    iron = cs.burner_row(ai, "iron-ore", cs.EDGE["iron-ore"], 12)
    copper = cs.burner_row(ai, "copper-ore", cs.EDGE["copper-ore"], 6)
    return iron, copper


def placed(ai, name, spots) -> set:
    """spots 중 name 이 이미 선 자리 (읽기만)."""
    packed = ";".join(f"{x},{y}" for x, y in spots)
    got = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        if s.count_entities_filtered{name = "%s", position = {tonumber(x), tonumber(y)}, radius = 0.9} > 0 then
          out[#out+1] = bit end
      end
      return out
    end)()""" % (packed, name))
    return {tuple(float(v) for v in str(r).split(",")) for r in cs._rows(got)}


def furnaces(ai) -> None:
    iron, copper = seats(ai)
    want = [(fx, fy) for _x, _y, fx, fy in iron] + [(fx, fy) for _x, _y, fx, fy in copper]
    have = placed(ai, "stone-furnace", want)
    todo = [p for p in want if (float(p[0]), float(p[1])) not in have]
    # 1) 돌 조: 가방의 화로를 자리 순서대로
    i = 0
    for who in STONE:
        bag = cs.bag(ai, who)
        n = int(bag.get("stone-furnace", 0))
        extra = int(bag.get("stone", 0)) // 5
        mine_ = todo[i:i + n + extra]
        i += len(mine_)
        if not mine_:
            continue
        plan = []
        if len(mine_) > n:
            plan.append(("craft", {"recipe": "stone-furnace", "count": len(mine_) - n, "wait": True}))
        for fx, fy in mine_:
            plan += [at(fx, fy), ("build", {"name": "stone-furnace", "x": fx, "y": fy})]
        sx, sy = cs.EDGE["stone"]
        plan += [("walk_to", {"x": sx + 1.5, "y": sy + 1.5}),
                 ("mine", {"x": sx, "y": sy, "name": "stone", "count": 50, "search_radius": 8})]
        give(ai, who, plan)
        print(f"{who}: 화로 {len(mine_)} 세움 (가방 {n}) -> 다시 돌")
    cs.wait_idle(ai, STONE, 150)
    built = placed(ai, "stone-furnace", want)
    ifur = [(fx, fy) for _x, _y, fx, fy in iron if (float(fx), float(fy)) in built]
    cfur = [(fx, fy) for _x, _y, fx, fy in copper if (float(fx), float(fy)) in built]
    # 2) 철 조: 광석을 철 화로마다 고르게. 끝나면 다시 캔다
    per = max(1, -(-len(ifur) // len(IRON)))
    for k, who in enumerate(IRON):
        mine_ = ifur[k * per:(k + 1) * per]
        ore = int(cs.bag(ai, who).get("iron-ore", 0))
        if not (mine_ and ore):
            continue
        each = max(1, ore // len(mine_))
        plan = []
        for fx, fy in mine_:
            plan += [at(fx, fy), ("insert", {"name": "iron-ore", "x": fx, "y": fy, "count": each})]
        ex, ey = cs.EDGE["iron-ore"]
        plan += [("walk_to", {"x": ex + 1.5, "y": ey + 1.5}),
                 ("mine", {"x": ex, "y": ey, "name": "iron-ore", "count": 60, "search_radius": 8})]
        give(ai, who, plan)
        print(f"{who}: 철광석 {each}개씩 화로 {len(mine_)}대 -> 다시 철")
    # 3) golf: 석탄을 화로마다 (구리 먼저 - electronics 는 구리판 10)
    coal = int(cs.bag(ai, COAL).get("coal", 0))
    fur = cfur + ifur
    if coal and fur:
        each = max(1, min(6, coal // len(fur)))
        plan = []
        for fx, fy in fur:
            plan += [at(fx, fy), ("insert", {"name": "coal", "x": fx, "y": fy, "count": each})]
        kx, ky = cs.EDGE["coal"]
        plan += [("walk_to", {"x": kx + 1.5, "y": ky + 1.5}),
                 ("mine", {"x": kx, "y": ky, "name": "coal", "count": 80, "search_radius": 8})]
        give(ai, COAL, plan)
        print(f"{COAL}: 석탄 {each}개씩 화로 {len(fur)}대")
    # 4) charlie 는 구리: 캐서 구리 화로에
    if cfur:
        cx, cy = cs.EDGE["copper-ore"]
        who = STONE[-1]
        plan = [("walk_to", {"x": cx + 1.5, "y": cy + 1.5}),
                ("mine", {"x": cx, "y": cy, "name": "copper-ore", "count": 6 * len(cfur), "search_radius": 8})]
        for fx, fy in cfur:
            plan += [at(fx, fy), ("insert", {"name": "copper-ore", "x": fx, "y": fy, "count": 6})]
        plan += [("walk_to", {"x": cx + 1.5, "y": cy + 1.5}),
                 ("mine", {"x": cx, "y": cy, "name": "copper-ore", "count": 50, "search_radius": 8})]
        give(ai, who, plan)
        print(f"{who}: 구리 {6 * len(cfur)} 캐서 구리 화로 {len(cfur)}대에 -> 다시 구리")


def plates(ai, who_list=None) -> None:
    """화로 결과칸의 판을 거둔다. 거둔 사람이 허브 상자에 넣는다 (상자가 없으면 먼저 짓는다)."""
    iron, copper = seats(ai)
    spots = [(fx, fy) for _x, _y, fx, fy in iron + copper]
    got = cs.plates_in(ai, spots)
    who_list = who_list or IRON
    full = [(p, n) for p, n in got.items() if n]
    per = max(1, -(-len(full) // len(who_list)))
    hub_there = placed(ai, "wooden-chest", [HUB]) or placed(ai, "iron-chest", [HUB])
    for k, who in enumerate(who_list):
        mine_ = full[k * per:(k + 1) * per]
        if not mine_:
            continue
        plan = []
        for (fx, fy), n in mine_:
            item = "copper-plate" if (fx, fy) in {(float(c[2]), float(c[3])) for c in copper} else "iron-plate"
            plan += [at(fx, fy), ("take", {"name": item, "x": fx, "y": fy, "count": n})]
        if hub_there:
            plan += [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5})]
        give(ai, who, plan)
        print(f"{who}: 화로 {len(mine_)}대에서 판 {sum(n for _, n in mine_)}")


def chest_count(ai, x, y, item) -> int:
    got = ai.lua("""(function()
      local c = game.surfaces[1].find_entities_filtered{type = "container", position = {%f, %f}, radius = 0.9}[1]
      return {n = c and c.get_item_count("%s") or -1}
    end)()""" % (x, y, item))
    return int((got or {}).get("n", -1))


def wait_for(fn, limit=240, every=5) -> bool:
    t0 = time.time()
    while time.time() - t0 < limit:
        if fn():
            return True
        time.sleep(every)
    return False


def hub(ai) -> None:
    """bravo: 나무 -> 나무 상자 3 -> 허브 상자, 가진 돌로 화로를 더 만들어 허브에 전부."""
    bag = cs.bag(ai, "bravo")
    extra = int(bag.get("stone", 0)) // 5
    fur = int(bag.get("stone-furnace", 0)) + extra
    tx, ty = SITE["trees"]
    plan = [("walk_to", {"x": tx - 2, "y": ty}),
            ("chop", {"x": tx, "y": ty, "count": 4}),
            ("craft", {"recipe": "wooden-chest", "count": 3, "wait": True})]
    if extra:
        plan.append(("craft", {"recipe": "stone-furnace", "count": extra, "wait": True}))
    plan += [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5}),
             ("build", {"name": "wooden-chest", "x": HUB[0], "y": HUB[1]}),
             ("insert", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": fur})]
    give(ai, "bravo", plan)
    print(f"bravo: 나무 -> 상자 3 · 허브 {HUB} · 화로 {fur} 허브로")


def drill_crew(ai, who, rows, item, ore_seat=True) -> None:
    """화로 결과칸의 판을 거두고, 허브에서 화로를 받아 버너 채굴기를 만들어 화로 위 (직결) 에 세운다."""
    got = cs.plates_in(ai, [(fx, fy) for _x, _y, fx, fy in rows])
    have = int(cs.bag(ai, who).get("iron-plate", 0)) + (sum(got.values()) if item == "iron-plate" else 0)
    n = min(len(rows), have // 9) if item == "iron-plate" else len(rows)
    plan = []
    for (fx, fy), k in got.items():
        if k:
            plan += [at(fx, fy), ("take", {"name": item, "x": fx, "y": fy, "count": k})]
    plan += [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5})]
    if item != "iron-plate":
        plan += [("insert", {"name": item, "x": HUB[0], "y": HUB[1], "count": sum(got.values())}),
                 ("take", {"name": "iron-plate", "x": HUB[0], "y": HUB[1], "count": 9 * n})]
    plan += [("take", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": n}),
             ("craft", {"recipe": DRILL, "count": n, "wait": True})]
    for dx, dy, _fx, _fy in rows[:n]:
        plan += [("walk_to", {"x": dx + 0.5, "y": dy - 2.0}),
                 ("build", {"name": DRILL, "x": dx, "y": dy, "direction": 8})]
    give(ai, who, plan)
    print(f"{who}: 판 {sum(got.values())} 거둠 · 채굴기 {n} ({item})")


def drills(ai) -> None:
    iron, copper = seats(ai)
    if chest_count(ai, HUB[0], HUB[1], "stone-furnace") < 0:
        hub(ai)
    ok = wait_for(lambda: chest_count(ai, HUB[0], HUB[1], "stone-furnace") >= 12, 240)
    print("허브 화로", chest_count(ai, HUB[0], HUB[1], "stone-furnace"), "" if ok else "(기다림 끝 - 모자람)")
    half = len(iron) // 2
    drill_crew(ai, IRON[0], iron[:half], "iron-plate")
    drill_crew(ai, IRON[1], iron[half:], "iron-plate")


def copper_drills(ai, who=None) -> None:
    """charlie (또는 --who): 구리판을 허브에, 허브의 철판 · 화로로 구리 채굴기 6."""
    _iron, copper = seats(ai)
    drill_crew(ai, who or STONE[-1], copper, "copper-plate")


def fuel(ai, who=None) -> None:
    """석탄 가진 사람이 모든 버너 채굴기 · 화로에 석탄 (연료칸이 적은 것부터)."""
    who = who or COAL
    have = int(cs.bag(ai, who).get("coal", 0))
    rows = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for _, e in pairs(s.find_entities_filtered{name = {"burner-mining-drill", "stone-furnace"}, force = "player"}) do
        local inv = e.get_fuel_inventory()
        local n = inv and inv.get_item_count("coal") or 0
        if n < 5 then out[#out+1] = string.format("%.1f,%.1f,%d", e.position.x, e.position.y, n) end
      end
      return out end)()""")
    need = [tuple(float(v) for v in str(r).split(",")) for r in cs._rows(rows)]
    need.sort(key=lambda r: r[2])
    if not need or have < 2:
        print(f"{who}: 석탄 {have} · 모자란 곳 {len(need)}")
        return
    each = max(2, min(8, have // len(need)))
    plan = []
    for x, y, _n in need[: have // each]:
        plan += [("walk_to", {"x": x, "y": y - 1.5}), ("insert", {"name": "coal", "x": x, "y": y, "count": each})]
    kx, ky = cs.EDGE["coal"]
    plan += [("walk_to", {"x": kx + 1.5, "y": ky + 1.5}),
             ("mine", {"x": kx, "y": ky, "name": "coal", "count": 80, "search_radius": 8})]
    give(ai, who, plan[:62])
    print(f"{who}: 석탄 {each}개씩 {min(len(need), have // each)} 곳")


# ---- 발전소 (호수 동쪽 기슭) ---------------------------------------------------------------
# 모드 power_plan 이 북쪽 기슭 (-71.5,-42.5) 에 준 «확인된 모양» (펌프 동향 · 보일러 (-2,-0.5) 북향 ·
# 기관 (-2,-4) (-2,-9) 북향) 을 좌우로 뒤집어 동쪽 기슭에 놓았다. can_place{manual} 로 확인 (나무 둘은 먼저 벤다).
PUMP = (-45.5, -27.5, 12)
BOILER = (-43.5, -28, 0)
ENGINES = ((-43.5, -31.5, 0), (-43.5, -36.5, 0))
TREES_AT_PLANT = ((-45, -32.3), (-45.25, -39.1), (-43.5, -39.25))
STAND = (-40.5, -31.5)
POLES = ()
LABS = ()
# run25b: 회차 설정 파일의 "power" 가 있으면 그것 (모드 power_plan 이 준 확인된 자리 + can_place{manual} 로 다시 본 전봇대 줄)
if "power" in SITE:
    _pw = SITE["power"]
    PUMP, BOILER = tuple(_pw["pump"]), tuple(_pw["boiler"])
    ENGINES = tuple(tuple(e) for e in _pw["engines"])
    TREES_AT_PLANT = tuple(tuple(t) for t in _pw.get("trees", ()))
    STAND = tuple(_pw["stand"])
    POLES = tuple(tuple(p) for p in _pw.get("poles", ()))
    LABS = tuple(tuple(p) for p in _pw.get("labs", ()))


def power(ai, who) -> None:
    need = 9 + 31 * len(ENGINES) - int(cs.bag(ai, who).get("iron-plate", 0))
    plan = [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5})]
    if need > 0:
        plan.append(("take", {"name": "iron-plate", "x": HUB[0], "y": HUB[1], "count": need}))
    plan += [("take", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": 1}),
            ("craft", {"recipe": "offshore-pump", "count": 1, "wait": True}),
            ("craft", {"recipe": "boiler", "count": 1, "wait": True}),
            ("craft", {"recipe": "steam-engine", "count": len(ENGINES), "wait": True}),
            ("walk_to", {"x": STAND[0], "y": STAND[1]})]
    for tx, ty in TREES_AT_PLANT:
        plan.append(("chop", {"x": tx, "y": ty, "count": 1}))
    plan += [("build", {"name": "offshore-pump", "x": PUMP[0], "y": PUMP[1], "direction": PUMP[2]}),
             ("build", {"name": "boiler", "x": BOILER[0], "y": BOILER[1], "direction": BOILER[2]})]
    for x, y, d in ENGINES:
        plan.append(("build", {"name": "steam-engine", "x": x, "y": y, "direction": d}))
    give(ai, who, plan)
    print(f"{who}: 펌프 · 보일러 · 기관 {len(ENGINES)} 을 만들어 {PUMP[:2]}")


def poles(ai, who) -> None:
    """기관 곁에서 연구소까지 작은 전봇대 줄 (나무 1 + 구리선 2 -> 2 개). 지으면 저절로 이어진다."""
    n = len(POLES) - int(cs.bag(ai, who).get("small-electric-pole", 0))
    plan = []
    if n > 0:
        plan.append(("craft", {"recipe": "small-electric-pole", "count": (n + 1) // 2, "wait": True}))
    for x, y in POLES:
        plan += [("walk_to", {"x": x + 1.5, "y": y + 1.5}), ("build", {"name": "small-electric-pole", "x": x, "y": y})]
    give(ai, who, plan)
    print(f"{who}: 전봇대 {len(POLES)} -> {POLES[0]} .. {POLES[-1]}")


# ---- 연구소 꾸러미 (사람 몫) ------------------------------------------------------------------
# automation-science-pack 트리거 = «lab 손제작 1». 플레이어가 없는 우리 캐릭터의 손제작은 엔진이 세지 않는다
# (엄격 모드는 스크립트가 대신 열지 않는다). 그래서 사람 (Guiltyring) 이 lab 하나를 손으로 만들어야 한다.
# 재료를 중간재로 상자에 둔다: 회로 10 · 톱니 10 · 벨트 4 -> 사람은 lab 한 번 (2 초).
KIT = (38.5, 64.5)


def kit(ai, who) -> None:
    plan = [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5}),
            ("take", {"name": "iron-plate", "x": HUB[0], "y": HUB[1], "count": 36}),
            ("take", {"name": "copper-plate", "x": HUB[0], "y": HUB[1], "count": 15}),
            ("craft", {"recipe": "electronic-circuit", "count": 10, "wait": True}),
            ("craft", {"recipe": "iron-gear-wheel", "count": 10, "wait": True}),
            ("craft", {"recipe": "transport-belt", "count": 2, "wait": True}),
            ("build", {"name": "wooden-chest", "x": KIT[0], "y": KIT[1]}),
            ("insert", {"name": "electronic-circuit", "x": KIT[0], "y": KIT[1], "count": 10}),
            ("insert", {"name": "iron-gear-wheel", "x": KIT[0], "y": KIT[1], "count": 10}),
            ("insert", {"name": "transport-belt", "x": KIT[0], "y": KIT[1], "count": 4})]
    give(ai, who, plan)
    print(f"{who}: 연구소 꾸러미 (회로 10 · 톱니 10 · 벨트 4) -> 상자 {KIT}")


def status(ai) -> None:
    cs.status(ai)
    iron, copper = seats(ai)
    got = cs.plates_in(ai, [(fx, fy) for _x, _y, fx, fy in iron + copper])
    print("   화로 결과칸 판 합:", sum(got.values()))
    print("   ", ai.lua("""(function()
      local f, out = game.forces.player, {}
      for _, n in pairs({"steam-power", "electronics", "automation-science-pack"}) do
        out[n] = f.technologies[n].researched end
      out.trigger_met = storage.trigger_met
      out.current = f.current_research and f.current_research.name
      return out end)()"""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=("status", "furnaces", "plates", "drills", "copper", "fuel", "hub", "power", "poles", "kit"))
    ap.add_argument("--who", default="")
    a = ap.parse_args()
    ai = AIBridge()
    if a.step == "status":
        status(ai)
        return 0
    detached.mark(CREW, OWNER, minutes=90)
    if a.step == "furnaces":
        furnaces(ai)
    elif a.step == "plates":
        plates(ai)
    elif a.step == "drills":
        drills(ai)
    elif a.step == "copper":
        copper_drills(ai, a.who or None)
    elif a.step == "power":
        power(ai, a.who or STONE[0])
    elif a.step == "poles":
        poles(ai, a.who or STONE[1])
    elif a.step == "kit":
        kit(ai, a.who or "bravo")
    elif a.step == "hub":
        hub(ai)
    elif a.step == "fuel":
        fuel(ai, a.who or None)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RconError as exc:
        print("게임이 대답하지 않는다:", exc)
        raise SystemExit(2)

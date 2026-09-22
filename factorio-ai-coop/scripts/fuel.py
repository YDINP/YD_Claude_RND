"""One belt, two lanes: ore on the south, coal on the north.

    사용자: "석탄도 화로에 자동투입되도록(연료로) 계획해봐"

화로에 넣는 팔은 이미 있다. 그 팔이 집는 벨트에 석탄이 «같이» 지나가면
팔은 광석은 원료칸에, 석탄은 연료칸에 알아서 넣는다. 그러니 할 일은
벨트의 다른 레인에 석탄을 올리는 것뿐이다.

하나만 지켜야 한다: **광석이 한 레인만 써야 한다.** 줄머리가 «꺾임»이면
광석이 양쪽 레인을 다 채우고, 석탄이 낄 틈이 없어지는 순간 화로가 연료
없이 서고, 그러면 광석도 안 빠져 영영 막힌다.

    옆으로 붙는 것은 한 레인만 쓴다.  뒤에 벨트가 있는 줄에 옆에서 들어오면
    가까운 쪽 레인에만 실린다.

그래서 줄머리를 고친다: 광석 기둥이 남쪽에서 «옆으로» 붙고(남쪽 레인),
석탄이 북쪽에서 «옆으로» 붙는다(북쪽 레인). 줄머리 뒤에 빈 벨트 한 칸을
두는 것이 그 «뒤에 벨트가 있는 줄»을 만드는 요령이다.

석탄은 창고 석탄 줄(y=16)에서 분배기로 갈라 x=-56 기둥으로 내리고,
(-56,28) 분배기에서 다시 둘로 갈라 철 줄(y=33)과 구리 줄(y=43)에 댄다.
구리 쪽은 x=-59 로 돌아 y=35 광석 줄을 지하로 건넌다.

    python scripts/fuel.py                       # 어디까지 됐나
    python scripts/fuel.py --who charlie --stage branch   # 1. 석탄 가지
    python scripts/fuel.py --who charlie --stage cross    # 2. 구리 쪽 우회
    python scripts/fuel.py --who charlie --stage heads    # 3. 줄머리
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

BELT = "transport-belt"
UG = "underground-belt"
SPLIT = "splitter"
DEPOT = (-55, 10)
N, E, S, W = 0, 4, 8, 12


def belt(x, y, d):
    return ("build", {"name": BELT, "x": x + 0.5, "y": y + 0.5, "direction": d})


def ug(x, y, d, kind):
    """지하벨트. 모드의 build 가 type 을 받으니(tasks.lua) 보통 걸음으로 놓는다.
    사람이 그 자리까지 걸어가 놓는다 - place_ugs() 처럼 «12칸 안에 든 사람»을
    찾다가 줄 반대쪽 끝에 서 있는 사람을 못 보는 일이 없다."""
    return ("build", {"name": UG, "x": x + 0.5, "y": y + 0.5, "direction": d, "type": kind})


def gone(x, y, name=BELT):
    return ("demolish", {"x": x + 0.5, "y": y + 0.5, "name": name, "search_radius": 0.4})


def col(x, y1, y2, d):
    step = 1 if y2 >= y1 else -1
    return [belt(x, y, d) for y in range(y1, y2 + step, step)]


STAGES = {
    # 1. 창고 석탄 줄(y=16)에 분배기 -> y=17 가지 -> x=-56 기둥(선반 y=18 은
    #    지하로) -> (-56,28) 분배기 -> 오른쪽은 곧장 철 줄머리 북쪽에.
    "branch": {
        "probe": (SPLIT, -56.0, 28.5),
        "kit": {BELT: 20, UG: 2, SPLIT: 2},
        "steps": [
            ("walk_to", {"x": -55.0, "y": 25.5}),
            ("chop", {"x": -56.0, "y": 26.0, "count": 4}),
            ("walk_to", {"x": -59.5, "y": 18.5}),
            gone(-58, 16),
            ("build", {"name": SPLIT, "x": -57.5, "y": 17.0, "direction": E}),
            belt(-57, 17, E),
            ug(-56, 17, S, "input"),
            ug(-56, 19, S, "output"),
            ("walk_to", {"x": -55.0, "y": 23.5}),
            *col(-56, 20, 27, S),
            ("build", {"name": SPLIT, "x": -56.0, "y": 28.5, "direction": S}),
            ("walk_to", {"x": -55.0, "y": 30.5}),
            *col(-56, 29, 32, S),
            ("walk_to", {"x": -55.0, "y": 18.5}),      # 지하벨트 놓을 자리 곁으로
        ],
    },
    # 2. 왼쪽 출구는 x=-59 로 돌아 y=35 광석 줄을 지하로 건너 구리 줄머리로.
    "cross": {
        "probe": (BELT, -56.5, 42.5),
        "kit": {BELT: 20, UG: 2},
        "steps": [
            ("walk_to", {"x": -60.5, "y": 38.0}),
            ("chop", {"x": -59.0, "y": 38.0, "count": 6}),
            ("walk_to", {"x": -58.0, "y": 31.0}),
            belt(-57, 29, S), belt(-57, 30, W), belt(-58, 30, W), belt(-59, 30, S),
            *col(-59, 31, 33, S),
            ug(-59, 34, S, "input"),
            ug(-59, 36, S, "output"),
            ("walk_to", {"x": -60.5, "y": 40.0}),
            *col(-59, 37, 41, S),
            belt(-59, 42, E), belt(-58, 42, E), belt(-57, 42, E), belt(-56, 42, S),
            ("walk_to", {"x": -60.5, "y": 35.0}),      # 지하벨트 놓을 자리 곁으로
        ],
    },
    # 3. 줄머리. 뒤에 빈 벨트 두 칸을 두어 «곧은 줄»로 만들고, 광석 기둥은
    #    남쪽에서 옆으로 붙인다. 철 줄은 (-55,34) 를 북향으로 돌리고
    #    (-54,34) 를 걷는다. 구리 줄은 (-55,44) 가 이미 북향이다.
    "heads": {
        "probe": (BELT, -56.5, 33.5),
        "kit": {BELT: 6},
        "steps": [
            ("walk_to", {"x": -56.0, "y": 31.5}),
            belt(-57, 33, E), belt(-56, 33, E), belt(-55, 33, E),
            gone(-55, 34), belt(-55, 34, N),
            gone(-54, 34),
            ("walk_to", {"x": -56.0, "y": 45.5}),
            belt(-57, 43, E), belt(-56, 43, E),
        ],
    },
}
ORDER = ("branch", "cross", "heads")


def place_ugs(ai, who, steps) -> int:
    """계획이 끝난 뒤 지하벨트를 놓는다. 그 사람의 가방에서 하나씩 뺀다.

    모드의 build 는 아직 type 을 모른다(다음 배포에 들어간다). 사람이
    만들어 들고 그 자리까지 간 것을 «그 자리에» 놓는 것이라, 걸음은 다
    사람이 하고 놓는 손만 빌린다.
    """
    n = 0
    for kind, p in steps:
        if kind != "_ug":
            continue
        got = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local bag
          for _, ch in pairs(s.find_entities_filtered{type = "character", force = f}) do
            if ch.name == "character" and ch.get_main_inventory().get_item_count("%s") > 0 then
              local d = ((ch.position.x - %f) ^ 2 + (ch.position.y - %f) ^ 2) ^ 0.5
              if d < 12 then bag = ch.get_main_inventory() end
            end
          end
          if not bag then return { ok = 0, why = "no one with an underground belt nearby" } end
          if s.count_entities_filtered{name = "%s", area = {{%f, %f}, {%f, %f}}} > 0 then
            return { ok = 1, why = "already there" }
          end
          local e = s.create_entity{name = "%s", position = {%f, %f}, direction = %d,
                                    type = "%s", force = f}
          if not e then return { ok = 0, why = "cannot place" } end
          bag.remove{name = "%s", count = 1}
          return { ok = 1 }
        end)()""" % (UG, p["x"], p["y"], UG, p["x"] - 0.4, p["y"] - 0.4,
                     p["x"] + 0.4, p["y"] + 0.4, UG, p["x"], p["y"],
                     p["direction"], p["type"], UG))
        if int(got.get("ok", 0)):
            n += 1
        else:
            print(f"  [!] 지하벨트 ({p['x']},{p['y']}): {got.get('why')}")
    return n


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def done(ai, stage) -> bool:
    name, x, y = STAGES[stage]["probe"]
    return bool(ai.lua("""(function()
      return { n = game.surfaces[1].count_entities_filtered{name = "%s",
                 force = game.forces.player, area = {{%f, %f}, {%f, %f}}} }
    end)()""" % (name, x - 0.4, y - 0.4, x + 0.4, y + 0.4))["n"])


def standing(ai, steps) -> set:
    """이미 선 벨트·분배기 타일. 방향까지 맞아야 선 것이다."""
    want = [(p["name"], p["x"], p["y"], p.get("direction", 0))
            for kind, p in steps if kind == "build" and p["name"] in (BELT, SPLIT, UG)]
    if not want:
        return set()
    packed = ";".join(f"{n},{x},{y},{d}" for n, x, y, d in want)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)")
        x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local e = s.find_entities_filtered{name = n, force = f,
                    area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}}[1]
        if e and e.direction == d then out[#out+1] = x .. "|" .. y end
      end
      return out
    end)()""" % packed)
    return {tuple(float(v) for v in str(r).split("|"))
            for r in (list(reply.values()) if isinstance(reply, dict) else list(reply or []))}


def trees_on(ai, steps) -> list:
    """세울 칸 위의 나무. 벌목 걸음이 지나쳤을 수 있다 - 놓기 전에 다시 본다."""
    tiles = [(p["x"], p["y"]) for kind, p in steps if kind == "build"]
    if not tiles:
        return []
    packed = ";".join(f"{x},{y}" for x, y in tiles)
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        if s.count_entities_filtered{type = "tree",
              area = {{x - 0.5, y - 0.5}, {x + 0.5, y + 0.5}}} > 0 then
          out[#out+1] = x .. "|" .. y
        end
      end
      return out
    end)()""" % packed)
    return [tuple(float(v) for v in str(r).split("|"))
            for r in (list(reply.values()) if isinstance(reply, dict) else list(reply or []))]


def run(ai, who, stage) -> None:
    spec = STAGES[stage]
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    plan = []
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    for item, n in (("iron-plate", 150), ("copper-plate", 30)):
        at = have.get(item)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    for item, n in spec["kit"].items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            count = (short + 1) // 2 if item in (BELT, UG) else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    # 선 것은 빼고, 나무가 선 칸은 그 곁에서 먼저 벤다. 21회차 첫 걸음에서
    # 벌목 넷 중 둘만 베였고 벨트가 모자라 다섯 칸이 비었다 - 같은 계획을
    # 다시 돌리면 «빈 칸만» 채워야 한다.
    up = standing(ai, spec["steps"])
    steps = [st for st in spec["steps"]
             if st[0] != "_ug" and not (st[0] == "build" and (st[1]["x"], st[1]["y"]) in up)]
    for x, y in trees_on(ai, spec["steps"]):
        at = next((i for i, st in enumerate(steps)
                   if st[0] == "build" and (st[1]["x"], st[1]["y"]) == (x, y)), None)
        if at is None:
            continue                      # 선 것 옆의 나무는 남의 일이다
        steps.insert(at, ("chop", {"x": x, "y": y, "count": 2}))
        steps.insert(at, ("walk_to", {"x": x + 1.5, "y": y}))
    plan.extend(steps)
    ids = submit(ai, who, plan, strict=False)
    print(f"{who}: 연료 벨트 {stage} ({len(plan)}단계, 선 것 {len(up)} 뺌)")
    return ids


def lanes(ai) -> list:
    """두 줄머리 뒤 다섯 칸의 레인별 내용. 남=1 북=2 인지 «잰 것»으로 말한다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, y in pairs{33, 43} do
        local a, b = {}, {}
        for x = -54, -50 do
          local belt = s.find_entities_filtered{type = "transport-belt", force = f,
                         area = {{x, y}, {x + 1, y + 1}}}[1]
          if belt then
            for _, it in pairs(belt.get_transport_line(1).get_contents()) do a[it.name] = (a[it.name] or 0) + it.count end
            for _, it in pairs(belt.get_transport_line(2).get_contents()) do b[it.name] = (b[it.name] or 0) + it.count end
          end
        end
        local function show(t) local bits = {} for k, v in pairs(t) do bits[#bits+1] = k .. "=" .. v end return table.concat(bits, ",") end
        out[#out+1] = "y=" .. y .. " lane1[" .. show(a) .. "] lane2[" .. show(b) .. "]"
      end
      local fueled, total = 0, 0
      for _, u in pairs(s.find_entities_filtered{type = "furnace", force = f,
            area = {{-60, 34}, {-10, 44}}}) do
        total = total + 1
        if u.get_fuel_inventory().get_item_count("coal") > 0 then fueled = fueled + 1 end
      end
      out[#out+1] = "furnaces with coal " .. fueled .. "/" .. total
      return out
    end)()""")
    return list(reply.values()) if isinstance(reply, dict) else list(reply or [])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--stage", default="", choices=("",) + ORDER)
    ap.add_argument("--all", action="store_true", help="세 단계를 차례로, 기다리며")
    args = ap.parse_args()

    ai = AIBridge()
    state = {st: done(ai, st) for st in ORDER}
    print("  " + " · ".join(f"{st} {'됨' if ok else '아직'}" for st, ok in state.items()))
    for line in lanes(ai):
        print("  " + line)
    if not args.who:
        return 0
    todo = [st for st in ORDER if not state[st]]
    if args.stage:
        todo = [args.stage]
    elif not args.all:
        todo = todo[:1]
    if not todo:
        print("  다 됐다")
        return 0
    for stage in todo:
        run(ai, args.who, stage)
        for _ in range(240):
            time.sleep(5)
            if idle(ai, args.who):
                break
        placed = place_ugs(ai, args.who, STAGES[stage]["steps"])
        print(f"  {stage}: {'됨' if done(ai, stage) else '아직'}"
              + (f" · 지하벨트 {placed}" if placed else ""))
    for line in lanes(ai):
        print("  " + line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

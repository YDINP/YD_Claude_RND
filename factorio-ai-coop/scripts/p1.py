"""P1 builder for run 22: one trunk x=0.5 from the coal field through the iron field to the iron column.

배치는 docs/run22-site.md «P1 배치 (확정)». 단계마다 선 것은 빼고 남은 것만 짓는다.
재료는 허브 상자(collect_run.py 가 채움)의 판을 집어 사람이 만든다.

    python scripts/p1.py                          # 단계별로 몇 개 섰나
    python scripts/p1.py --stage trunk --who bravo,delta
    python scripts/p1.py --lanes                  # 간선 레인에 무엇이 실렸나

단계: powerline · trunk · coal · iron · column
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
import detached                          # noqa: E402

OWNER = "p1"
N, E, S, W = 0, 4, 8, 12
BELT, EMD, INS, POLE, FURN = ("transport-belt", "electric-mining-drill", "inserter",
                              "small-electric-pole", "stone-furnace")
TRUNK_X = 0.5
TRUNK_TOP, TRUNK_END = -123.5, -20.5
# 줄 동쪽, 서향. -104.5 는 버너 석탄 줄(y -103..-101)과 겹쳐 한 칸 위로 올렸다 (실측)
COAL_YS = [-122.5 + 3 * i for i in range(6)]
IRON_YS = [-80.5 + 3 * i for i in range(6)]           # 줄 서쪽, 동향
COL_TOP = -45                                          # 철 기둥 화로 첫 줄 (타일 y)
COL_ROWS = 12
HUB_Y = -54.5
LAB_POLE = (17.5, 41.5)

# 판으로 따진 값 (한 개당). 창고가 없으니 허브의 판에서 만든다.
COST = {
    BELT: {"iron-plate": 1.5},
    EMD: {"iron-plate": 23, "copper-plate": 4.5},
    INS: {"iron-plate": 4, "copper-plate": 1.5},
    POLE: {"copper-plate": 0.5, "wood": 0.5},
    "splitter": {"iron-plate": 11.5, "copper-plate": 7.5},
    FURN: {"stone": 5},
}
PAIRED = {BELT, POLE}


def b(name, x, y, d=None):
    p = {"name": name, "x": x, "y": y}
    if d is not None:
        p["direction"] = d
    return ("build", p)


def trunk_steps():
    out = [("demolish", {"x": 0, "y": -60, "name": "burner-mining-drill", "search_radius": 0.6}),
           ("demolish", {"x": 0, "y": -58, "name": FURN, "search_radius": 0.6})]
    y = TRUNK_TOP
    while y <= COL_TOP - 0.5:
        out.append(b(BELT, TRUNK_X, y, S))
        y += 1
    return out


def coal_steps():
    return [b(EMD, 2.5, y, W) for y in COAL_YS]


def iron_steps():
    return [b(EMD, -1.5, y, E) for y in IRON_YS]


SPLIT = "splitter"
BRANCH_Y, BRANCH_X = -90.5, 25.5          # 석탄만 흐르는 구간에서 가지를 뺀다
BOILER1_INS = (24.5, 44.5)                # 보일러 1 (23,44.5) 동쪽 빈 칸


def boilerfeed_steps():
    """간선(석탄만 흐르는 구간) -> 분배기 -> 가지 -> 보일러 1.

    분배기 우선권은 보일러 쪽(남향에서 왼쪽 = 동쪽). 보일러가 차서 가지가 막히면 석탄은
    전부 간선으로 간다. 철 합류 «뒤»에서 필터로 빼면 가지가 막히는 순간 간선의 석탄
    레인까지 서서 화로가 굶는다 - 그래서 석탄만 흐르는 여기서, 필터 없이.
    """
    out = [("demolish", {"x": TRUNK_X, "y": BRANCH_Y - 1, "name": BELT, "search_radius": 0.4}),
           b(SPLIT, 1.0, BRANCH_Y - 1, S)]
    x = 1.5
    while x < BRANCH_X:
        out.append(b(BELT, x, BRANCH_Y, E))
        x += 1
    y = BRANCH_Y
    while y < BOILER1_INS[1]:
        out.append(b(BELT, BRANCH_X, y, S))
        y += 1
    out += [b(BELT, BRANCH_X, BOILER1_INS[1], S),
            b(INS, BOILER1_INS[0], BOILER1_INS[1], E),
            b(POLE, 26.5, 44.5)]
    return out


def column_steps():
    """철 기둥: 판 x=-5 · 팔 -4 · 화로 중심 -2 · 팔 -1 · 간선 0 · 팔 1 · 화로 중심 3 · 팔 4 · 판 x=5."""
    out = []
    y0 = COL_TOP
    for r in range(COL_ROWS):
        fy = y0 + 2 * r + 1.0            # 화로 중심 (두 칸 중 아래 경계)
        iy = y0 + 2 * r + 0.5            # 팔은 화로 윗칸 줄
        out += [b(FURN, -2.0, fy), b(FURN, 3.0, fy),
                b(INS, -0.5, iy, E), b(INS, 1.5, iy, W),       # 간선에서 집어 화로로 (집는 쪽을 본다)
                b(INS, -3.5, iy, E), b(INS, 4.5, iy, W)]       # 화로에서 집어 판 줄로
    y = y0 + 0.5
    while y <= y0 + 2 * COL_ROWS - 0.5:
        out += [b(BELT, TRUNK_X, y, S), b(BELT, -4.5, y, S), b(BELT, 5.5, y, S)]
        y += 1
    for r in range(0, COL_ROWS, 2):
        py = y0 + 2 * r + 1.5            # 팔 없는 아랫칸
        out += [b(POLE, -0.5, py), b(POLE, 4.5, py), b(POLE, -3.5, py)]
    return out


def powerline_steps(ai, who):
    """발전소 -> 간선 동쪽 (x=4.5) 북쪽 끝까지, 그리고 철 채굴기 쪽 (x=-4.5)."""
    pts = []
    # 기둥의 동쪽 판 줄(x=5.5, y -45..-21)을 비켜 x=8.5 로 올라간다
    for (fx, fy), (tx, ty) in (((LAB_POLE[0], LAB_POLE[1]), (8.5, COL_TOP - 2)),
                               ((8.5, COL_TOP - 2), (4.5, COL_TOP - 8)),
                               ((4.5, COL_TOP - 8), (4.5, TRUNK_TOP + 2)),
                               ((4.5, -82.5), (-4.5, -82.5)),
                               ((-4.5, -82.5), (-4.5, -63.5))):
        r = ai.pole_route(who, fx, fy, tx, ty, 40) or {}
        for p in (r.get("poles") or r.get("spots") or r.get("route") or []):
            if isinstance(p, dict):
                pts.append((p["x"], p["y"]))
    # 채굴기마다 닿도록: 석탄 x=4.5 는 경로가 지나고, 철 x=-4.5 도
    return [b(POLE, x, y) for x, y in pts]


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def standing(ai, steps) -> set:
    builds = [p for k, p in steps if k == "build"]
    if not builds:
        return set()
    packed = ";".join(f"{p['name']},{p['x']},{p['y']}" for p in builds)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        if s.count_entities_filtered{name = n, force = f, area = {{x - 0.45, y - 0.45}, {x + 0.45, y + 0.45}}} > 0 then out[#out+1] = bit end
      end
      return out
    end)()""" % packed)
    out = set()
    for r in _rows(reply):
        n, x, y = str(r).split(",")
        out.add((n, float(x), float(y)))
    return out


def blocked(ai, steps) -> list:
    """놓을 수 없는 자리와 이유 (나무면 앞에 벌목)."""
    builds = [p for k, p in steps if k == "build"]
    if not builds:
        return []
    packed = ";".join(f"{p['name']},{p['x']},{p['y']},{p.get('direction', 0)}" for p in builds)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)")
        x, y, d = tonumber(x), tonumber(y), tonumber(d)
        if s.count_entities_filtered{name = n, force = f, area = {{x - 0.45, y - 0.45}, {x + 0.45, y + 0.45}}} == 0
           and not s.can_place_entity{name = n, position = {x, y}, direction = d, force = f,
                                      build_check_type = defines.build_check_type.manual} then
          local why = "blocked"
          local e = s.find_entities_filtered{area = {{x - 1.5, y - 1.5}, {x + 1.5, y + 1.5}}}
          for _, q in pairs(e) do
            if q.type == "tree" or q.type == "simple-entity" then why = "tree" break
            elseif q.type ~= "resource" and q.type ~= "character" then why = q.name end
          end
          out[#out+1] = bit .. "|" .. why
        end
      end
      return out
    end)()""" % packed)
    return [str(r) for r in _rows(reply)]


def hub(ai) -> dict:
    """{품목: (x, y, 수)} 허브에서 가장 많이 든 상자."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f,
              area = {{-10.5, %f}, {-3, %f}}}) do
        for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
          out[#out+1] = string.format("%%s,%%.1f,%%.1f,%%d", v.name, c.position.x, c.position.y, v.count)
        end
      end
      return out
    end)()""" % (HUB_Y - 0.6, HUB_Y + 0.6))
    best = {}
    for r in _rows(reply):
        n, x, y, c = str(r).split(",")
        if n not in best or int(c) > best[n][2]:
            best[n] = (float(x), float(y), int(c))
    return best


def fetch(ai, who, need: dict) -> list:
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    mats = {}
    crafts = {}
    for item, n in need.items():
        short = n - int(bag.get(item, 0))
        if short <= 0:
            continue
        crafts[item] = short
        for m, k in COST.get(item, {}).items():
            mats[m] = mats.get(m, 0) + k * short
    plan = []
    h = hub(ai)
    for m, n in mats.items():
        lack = int(math.ceil(n)) + 2 - int(bag.get(m, 0))
        if lack <= 0:
            continue
        if m == "wood":
            plan += [("walk_to", {"x": 7.0, "y": -76.0}), ("chop", {"x": 9, "y": -74, "count": max(2, lack // 4 + 1)})]
        elif m in h:
            x, y, c = h[m]
            plan += [("walk_to", {"x": x, "y": y + 1.5}),
                     ("take", {"name": m, "x": x, "y": y, "count": min(lack, c)})]
    for item, short in crafts.items():
        plan.append(("craft", {"recipe": item, "count": (short + 1) // 2 if item in PAIRED else short, "wait": True}))
    return plan


def idle(ai, crew) -> bool:
    live = {w["name"]: w for w in ai.list()}
    return all(not (live[w].get("current") or live[w].get("queued")) for w in crew if w in live)


def build_stage(ai, crew, steps, label, rounds=10) -> bool:
    for n_round in range(rounds):
        up = standing(ai, steps)
        todo = [st for st in steps if st[0] != "build" or (st[1]["name"], st[1]["x"], st[1]["y"]) not in up]
        if not any(k == "build" for k, _ in todo):
            print(f"  {label}: 다 섰다 ({len(up)})")
            return True
        bad = {s.split("|")[0]: s.split("|")[1] for s in blocked(ai, todo)}
        per = (len(todo) + len(crew) - 1) // len(crew)
        for i, who in enumerate(crew):
            part = todo[i * per:(i + 1) * per][:36]
            if not part:
                continue
            need = {}
            for k, p in part:
                if k == "build":
                    need[p["name"]] = need.get(p["name"], 0) + 1
            plan = fetch(ai, who, need)
            last = None
            for k, p in part:
                key = f"{p.get('name')},{p.get('x')},{p.get('y')},{p.get('direction', 0)}"
                if k == "build" and bad.get(key) == "tree":
                    plan.append(("chop", {"x": p["x"], "y": p["y"], "count": 2}))
                if last is None or abs(p["x"] - last[0]) + abs(p["y"] - last[1]) > 7:
                    # 3x3 채굴기 자리 밖에 선다 - 1.5칸 옆은 자기 발이 그 자리를 막았다 (실측)
                    off = 3.0 if p.get("name") == EMD else 1.5
                    plan.append(("walk_to", {"x": p["x"] + off, "y": p["y"] + off}))
                    last = (p["x"], p["y"])
                plan.append((k, p))
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            submit(ai, who, plan[:60], strict=False)
            print(f"{who}: {label} {n_round + 1}순번 ({sum(1 for k, _ in part if k == 'build')}개)"
                  + (f" · 막힌 자리 {len(bad)}" if bad else ""))
        t0 = time.time()
        while time.time() - t0 < 900 and not idle(ai, crew):
            time.sleep(5)
    up = standing(ai, steps)
    print(f"  {label}: {len(up)}/{sum(1 for k, _ in steps if k == 'build')}")
    return False


def lanes(ai) -> None:
    """간선 몇 칸의 레인별 내용."""
    print(ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for _, y in pairs({-110.5, -90.5, -70.5, -50.5}) do
        local e = s.find_entities_filtered{name = "transport-belt", position = {%f, y}, radius = 0.5}[1]
        if e then
          local t = {}
          for l = 1, 2 do
            local c = {}
            for _, v in pairs(e.get_transport_line(l).get_contents()) do c[#c+1] = v.name .. v.count end
            t[#t+1] = "L" .. l .. ":" .. table.concat(c, "/")
          end
          out[#out+1] = y .. " " .. table.concat(t, " ")
        end
      end
      return out end)()""" % TRUNK_X))


STAGES = {"trunk": trunk_steps, "coal": coal_steps, "boilerfeed": boilerfeed_steps,
          "iron": iron_steps, "column": column_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", "powerline", *STAGES))
    ap.add_argument("--who", default="")
    ap.add_argument("--lanes", action="store_true")
    args = ap.parse_args()
    ai = AIBridge()
    if args.lanes:
        lanes(ai)
        return 0
    for name, fn in STAGES.items():
        steps = fn()
        print(f"  {name}: {len(standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              + (f" · 막힘 {len(blocked(ai, steps))}" if name != "column" else ""))
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = OWNER
    detached.mark(crew, OWNER, minutes=120)
    try:
        steps = powerline_steps(ai, crew[0]) if args.stage == "powerline" else STAGES[args.stage]()
        ok = build_stage(ai, crew, steps, args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""P13 뒤처리: 09:41~09:48 입력 줄 끝이 판 줄에 옆싣기되어 석탄 · 철광석이 P8 줄기로 샜다 → 거름 팔.

빠른 팔 (2.0 은 필터 5 칸) 에 석탄 · 철광석 화이트리스트 → 쇠 상자. 사람 (delta) 손제작 · 손으로 놓음 (can_place manual 로 먼저 잼),
필터는 Lua 로 거는 «건설 조작» (아이템 이동 없음). 걸러진 것은 상자에 남는다 (석탄은 연료 고리가 쓸 수 있다).

    python scripts/p13_sieve.py --crew delta --build
    python scripts/p13_sieve.py --filters
    python scripts/p13_sieve.py --status
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge  # noqa
from orders import submit  # noqa

N, E, S, W = 0, 4, 8, 12
# (팔 x, y, 방향 = 집는 쪽, 상자 x, y) - 기지 철 줄기 x 69.5 (분배기 셋 앞) 여섯 + 가지 끝 셋 (zone N FE · bl · smelt 입력)
SIEVES = [(70.5, -46.5, W, 71.5, -46.5), (70.5, -45.5, W, 71.5, -45.5), (70.5, -43.5, W, 71.5, -43.5),
          (68.5, -46.5, E, 67.5, -46.5), (68.5, -45.5, E, 67.5, -45.5), (68.5, -44.5, E, 67.5, -44.5),
          (26.5, -26.5, S, 26.5, -27.5), (29.5, 47.5, E, 28.5, 47.5), (73.5, -5.5, N, 73.5, -4.5)]
# 09:5x 강철 기둥 입력 (y -13.5) 철 레인이 석탄 · 광석으로 x 108.5 부터 끝까지 막힘 → 머리 앞 넷 (가지 x 102.5 · y -11.5)
SIEVES2 = [(101.5, -10.5, N, 101.5, -9.5), (102.5, -10.5, N, 102.5, -9.5), (101.5, -12.5, E, 100.5, -12.5), (103.5, -11.5, W, 104.5, -11.5)]
if os.environ.get("P13_SIEVE2"):
    SIEVES = SIEVES2
ALL = SIEVES + SIEVES2 if not os.environ.get("P13_SIEVE2") else SIEVES2
BAD = ["coal", "iron-ore"]


def build(ai, who):
    os.environ[detached.ENV] = "p13"
    detached.mark([who], "p13", minutes=25)
    n = len(SIEVES)
    plan = [("walk_to", {"x": 103.5, "y": -13.0}), ("take", {"name": "electronic-circuit", "x": 103.5, "y": -14.5, "count": 3 * n + 3}),
            ("walk_to", {"x": 68.5, "y": -14.0}), ("take", {"name": "iron-plate", "x": 68.5, "y": -15.5, "count": 13 * n + 10}),
            ("craft", {"recipe": "fast-inserter", "count": n, "wait": "block"}),
            ("craft", {"recipe": "iron-chest", "count": n, "wait": "block"})]
    last = None
    for ix, iy, d, cx, cy in SIEVES:
        if last is None or abs(ix - last[0]) + abs(iy - last[1]) > 8:
            plan.append(("walk_to", {"x": ix + 1.5, "y": iy + 1.5}))
            last = (ix, iy)
        plan.append(("build", {"name": "iron-chest", "x": cx, "y": cy, "direction": 0}))
        plan.append(("build", {"name": "fast-inserter", "x": ix, "y": iy, "direction": d}))
    submit(ai, who, plan, strict=False)
    print(time.strftime("%X"), who, "거름 팔", n, "단계", len(plan), flush=True)


def filters(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = "fast-inserter", force = f, position = {p[1], p[2]}, radius = 0.3}[1]
        if e then
          e.use_filters = true
          e.inserter_filter_mode = "whitelist"
          for i, n in pairs(helpers.json_to_table('%s')) do e.set_filter(i, {name = n, quality = "normal"}) end
          out[#out+1] = p[1] .. "," .. p[2] .. " ok"
        else out[#out+1] = p[1] .. "," .. p[2] .. " none" end
      end
      return out
    end)()""" % (json.dumps([[s[0], s[1]] for s in SIEVES]), json.dumps(BAD)))


def status(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = "fast-inserter", force = f, position = {p[1], p[2]}, radius = 0.3}[1]
        local c = s.find_entities_filtered{name = "iron-chest", force = f, position = {p[3], p[4]}, radius = 0.3}[1]
        local inv = c and c.get_inventory(defines.inventory.chest)
        out[#out+1] = string.format("%%.1f,%%.1f %%s coal %%d ore %%d", p[1], p[2], e and (st[e.status] or "-") or "none",
          inv and inv.get_item_count("coal") or -1, inv and inv.get_item_count("iron-ore") or -1)
      end
      return out
    end)()""" % json.dumps([[s[0], s[1], s[3], s[4]] for s in SIEVES]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--crew", default="delta")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--filters", action="store_true")
    ap.add_argument("--status", action="store_true")
    a, _ = ap.parse_known_args()
    ai = AIBridge()
    if a.build:
        build(ai, a.crew)
    if a.filters:
        print(filters(ai))
    if a.status:
        print("\n".join(str(x) for x in (status(ai) or [])))


if __name__ == "__main__":
    main()

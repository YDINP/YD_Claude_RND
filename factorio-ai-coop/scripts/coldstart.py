"""P0 bootstrap for run 22 - empty hands to a burner town, step by step.

설계서 coldstart-plan.md 의 P0. 시작 가방은 비어 있다 (모드가 만든 캐릭터 - 자유 플레이
지급품이 없다). 그래서 첫 자원은 전부 손이다: 손채굴 0.5/s x 8명 = 4/s. 버너 채굴기
16대(0.25/s)와 맞먹는다 - 초반에는 손이 가장 큰 광산이다.

단계 (각각 한 번 부르고, 끝났는지는 게임에 묻는다):

    gather   역할대로 손채굴 - 돌 3 · 철 4 · 석탄 1
    smelt    돌 -> 돌 화로, 철광 가장자리에 화로 줄, 광석·석탄을 넣는다 (손 제련)
    drills   판 -> 버너 채굴기, 철->화로 직결 · 석탄 마주보기 · 구리->화로 직결 · 돌->상자
    status   무엇이 얼마나 있나 (가방·화로·채굴기·해금)

좌표는 run22-site.md 의 앵커. 광석 칸은 게임에 «가장 가까운 그 광석»을 물어 고른다.

    python scripts/coldstart.py status
    python scripts/coldstart.py gather
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
import detached                          # noqa: E402

OWNER = "coldstart"
os.environ.setdefault("AI_OWNER", OWNER)   # 이 모듈을 쓰는 스크립트는 이 사람들의 주인이다
# 앵커 (run22-site.md): 광맥의 «남쪽 가장자리» - 기지(남쪽)에 가까운 쪽부터 쓴다
EDGE = {
    "iron-ore": (-4, -50),
    "copper-ore": (-28, -50),
    "coal": (14, -100),
    "stone": (-46, -93),
}
ROLES = {
    "stone": ["alpha", "bravo", "charlie"],
    "iron-ore": ["delta", "echo", "foxtrot", "golf"],
    "coal": ["hotel"],
}
CREW = [n for names in ROLES.values() for n in names]


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def ore_spots(ai, ore, near, n) -> list:
    """near 에서 가장 가까운 ore 칸 n 개 (서로 2칸 이상 떨어진)."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local rs = s.find_entities_filtered{name = "%s", position = {%f, %f}, radius = 40}
      table.sort(rs, function(a, b)
        local da = (a.position.x - %f) ^ 2 + (a.position.y - %f) ^ 2
        local db = (b.position.x - %f) ^ 2 + (b.position.y - %f) ^ 2
        return da < db end)
      local out, taken = {}, {}
      for _, r in pairs(rs) do
        local ok = true
        for _, t in pairs(taken) do
          if math.abs(t.x - r.position.x) < 2 and math.abs(t.y - r.position.y) < 2 then ok = false break end
        end
        if ok then
          taken[#taken+1] = r.position
          out[#out+1] = string.format("%%.1f,%%.1f", r.position.x, r.position.y)
          if #out >= %d then break end
        end
      end
      return out
    end)()""" % (ore, near[0], near[1], near[0], near[1], near[0], near[1], n))
    return [tuple(float(v) for v in str(r).split(",")) for r in _rows(reply)]


def give(ai, who, plan) -> None:
    try:
        ai.agent(who).cancel()
    except RconError:
        pass
    submit(ai, who, plan, strict=False)


def wait_idle(ai, crew, limit=900) -> None:
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(5)
        live = {w["name"]: w for w in ai.list()}
        if all(not (live[w].get("current") or live[w].get("queued")) for w in crew if w in live):
            return


def gather(ai, count=50) -> None:
    for ore, names in ROLES.items():
        spots = ore_spots(ai, ore, EDGE[ore], len(names))
        for who, (x, y) in zip(names, spots):
            give(ai, who, [("walk_to", {"x": x + 1.5, "y": y + 1.5}),
                           ("mine", {"x": x, "y": y, "name": ore, "count": count, "search_radius": 6})])
            print(f"{who}: {ore} {count}개 손채굴 ({x:.0f},{y:.0f})")


RUN = os.environ.get("AI_RUN", "run23")                    # 회차마다 줄 좌표 파일이 따로 (22회차 좌표가 23회차에 박히지 않게)
LAYOUT = os.path.join(HERE, "..", "state", f"{RUN}_layout.json")
KEY = {"iron-ore": "iron", "copper-ore": "copper"}


def burner_row(ai, ore, near, n) -> list:
    """정해진 줄. 처음 한 번만 계산하고 state/run22_layout.json 에 박는다.

    실측: 화로를 세운 뒤 다시 계산하니 «화로를 놓을 수 있는 칸»이 사라져 18칸 북쪽의
    다른 줄을 골랐다 - 철 조가 빈 자리에서 판을 찾았다. 자리는 한 번 정하면 바꾸지 않는다.
    """
    import json
    try:
        lay = json.load(open(LAYOUT, encoding="utf-8"))
    except (OSError, ValueError):
        lay = {}
    k = KEY.get(ore, ore)
    if k in lay:
        return [tuple(r) for r in lay[k]][:n]
    rows = _fresh_row(ai, ore, near, n)
    lay[k] = [list(r) for r in rows]
    json.dump(lay, open(LAYOUT, "w", encoding="utf-8"))
    return rows


def _fresh_row(ai, ore, near, n) -> list:
    """버너 채굴기(남향) + 바로 아래 화로 자리 n 쌍. [(드릴 x, y, 화로 x, y)]

    드릴은 2x2 - 네 칸이 다 그 광석이어야 끝까지 캔다. 화로는 드릴의 (0,+2) (playbook
    «채굴기 -> 화로 직결»). 둘 다 can_place 로 확인한다. 광맥의 «남쪽 가장자리»에서 한 줄.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local function full(x, y)
        return s.count_entities_filtered{name = "%s", area = {{x - 1, y - 1}, {x + 1, y + 1}}} >= 4
      end
      local out = {}
      for dy = 0, 30 do
        local y = %d - dy
        out = {}
        for dx = -30, 30, 2 do
          local x = %d + dx
          if full(x, y)
             and s.can_place_entity{name = "burner-mining-drill", position = {x, y}, direction = defines.direction.south, force = f}
             and s.can_place_entity{name = "stone-furnace", position = {x, y + 2}, force = f} then
            out[#out+1] = string.format("%%d,%%d", x, y)
          end
        end
        if #out >= %d then break end
      end
      return out
    end)()""" % (ore, int(near[1]) + 4, int(near[0]), n))
    rows = [tuple(int(v) for v in str(r).split(",")) for r in _rows(reply)]
    rows.sort(key=lambda p: abs(p[0] - near[0]))
    return [(x, y, x, y + 2) for x, y in rows[:n]]


def bag(ai, who) -> dict:
    try:
        return ai.agent(who).items()
    except RconError:
        return {}


def smelt(ai) -> None:
    """돌 -> 화로를 직결 자리에 세우고, 광석·석탄을 넣는다. 끝나면 다들 다시 캔다."""
    iron = burner_row(ai, "iron-ore", EDGE["iron-ore"], 12)
    copper = burner_row(ai, "copper-ore", EDGE["copper-ore"], 6)
    seats = [(fx, fy) for _x, _y, fx, fy in iron]      # 먼저 철 - 판 50 이 steam-power 를 연다
    # 1) 돌 조: 가진 돌만큼 화로를 만들어 자리 순서대로 세운다
    i = 0
    for who in ROLES["stone"]:
        n = int(bag(ai, who).get("stone", 0)) // 5
        mine_ = seats[i:i + n]
        i += len(mine_)
        if not n:
            continue
        plan = [("craft", {"recipe": "stone-furnace", "count": n, "wait": True})]
        for fx, fy in mine_:
            plan += [("walk_to", {"x": fx + 0.5, "y": fy + 2.0}),
                     ("build", {"name": "stone-furnace", "x": fx, "y": fy})]
        give(ai, who, plan)
        print(f"{who}: 화로 {n}대 제작 · {len(mine_)}대를 철 직결 자리에")
    wait_idle(ai, ROLES["stone"], 300)
    built = seats[:i]
    # 2) 철 조: 광석을 화로마다 고르게. hotel: 석탄을 화로마다
    per = max(1, (len(built) + len(ROLES["iron-ore"]) - 1) // len(ROLES["iron-ore"]))
    for k, who in enumerate(ROLES["iron-ore"]):
        mine_ = built[k * per:(k + 1) * per]
        ore = int(bag(ai, who).get("iron-ore", 0))
        if not (mine_ and ore):
            continue
        each = ore // len(mine_)
        plan = []
        for fx, fy in mine_:
            plan += [("walk_to", {"x": fx + 0.5, "y": fy + 2.0}),
                     ("insert", {"name": "iron-ore", "x": fx, "y": fy, "count": each})]
        give(ai, who, plan)
        print(f"{who}: 철광석 {each}개씩 화로 {len(mine_)}대에")
    coal = int(bag(ai, "hotel").get("coal", 0))
    if coal and built:
        each = max(1, coal // len(built))
        plan = []
        for fx, fy in built:
            plan += [("walk_to", {"x": fx + 0.5, "y": fy + 2.0}),
                     ("insert", {"name": "coal", "x": fx, "y": fy, "count": each})]
        give(ai, "hotel", plan)
        print(f"hotel: 석탄 {each}개씩 화로 {len(built)}대에")
    wait_idle(ai, CREW, 300)


HUB = (-6.5, -54.5)          # 철 직결 줄 남쪽 교환 상자 - 사람끼리는 물건을 못 건넨다
TREES = (9, -74)
COAL_ROW_Y = -102
COAL_XS = (4, 6, 8, 10)       # 남향 버너 채굴기 -> 상자 (x+0.5, y+1.5)
DRILL = "burner-mining-drill"
PER_DRILL = 9                 # 판 3 + 톱니 3 (판 6)


def plates_in(ai, spots) -> dict:
    """{(x,y): 판 수} - 화로 결과칸."""
    packed = ";".join(f"{x},{y}" for x, y in spots)
    reply = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        local u = s.find_entities_filtered{type = "furnace", position = {tonumber(x), tonumber(y)}, radius = 0.6}[1]
        out[#out+1] = bit .. "|" .. (u and u.get_inventory(defines.inventory.furnace_result).get_item_count() or 0)
      end
      return out
    end)()""" % packed)
    out = {}
    for r in _rows(reply):
        k, v = str(r).split("|")
        x, y = k.split(",")
        out[(float(x), float(y))] = int(v)
    return out


def drills(ai) -> None:
    iron = burner_row(ai, "iron-ore", EDGE["iron-ore"], 12)
    copper = burner_row(ai, "copper-ore", EDGE["copper-ore"], 6)
    # 1) bravo: 나무 -> 상자, 허브 상자 + 석탄 줄 상자, 여분 화로는 허브로
    fur_b = int(bag(ai, "bravo").get("stone-furnace", 0))
    plan = [("walk_to", {"x": TREES[0] - 2, "y": TREES[1]}),
            ("chop", {"x": TREES[0], "y": TREES[1], "count": 6}),
            ("craft", {"recipe": "wooden-chest", "count": 5, "wait": True}),
            ("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5}),
            ("build", {"name": "wooden-chest", "x": HUB[0], "y": HUB[1]})]
    if fur_b:
        plan.append(("insert", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": fur_b}))
    for x in COAL_XS:
        plan += [("walk_to", {"x": x + 0.5, "y": COAL_ROW_Y + 3.5}),
                 ("build", {"name": "wooden-chest", "x": x + 0.5, "y": COAL_ROW_Y + 1.5})]
    give(ai, "bravo", plan)
    print(f"bravo: 나무 -> 상자 5 · 허브 {HUB} · 화로 {fur_b} 허브로 · 석탄 줄 상자 4")
    # 2) charlie: 구리 캐서 구리 직결 자리에 화로 6 (electronics 는 구리판 10)
    cx, cy = EDGE["copper-ore"]
    plan = [("walk_to", {"x": cx + 1.5, "y": cy + 1.5}),
            ("mine", {"x": cx, "y": cy, "name": "copper-ore", "count": 36, "search_radius": 6})]
    for _x, _y, fx, fy in copper:
        plan += [("walk_to", {"x": fx + 0.5, "y": fy + 2.0}),
                 ("build", {"name": "stone-furnace", "x": fx, "y": fy}),
                 ("insert", {"name": "copper-ore", "x": fx, "y": fy, "count": 6})]
    plan += [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5}),
             ("insert", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": 4})]
    give(ai, "charlie", plan)
    print("charlie: 구리 36 캐서 구리 화로 6대 · 남은 화로 4 허브로")
    # 3) hotel: 석탄은 구리 화로 먼저 (연료 없으면 electronics 가 안 열린다), 그다음 캔다
    plan = []
    for _x, _y, fx, fy in copper:
        plan += [("walk_to", {"x": fx + 0.5, "y": fy + 2.0}),
                 ("insert", {"name": "coal", "x": fx, "y": fy, "count": 2})]
    plan += [("walk_to", {"x": 15.5, "y": -98.5}),
             ("mine", {"x": 14, "y": -100, "name": "coal", "count": 60, "search_radius": 6})]
    give(ai, "hotel", plan)
    # 4) 철 조: 자기 화로 셋에서 판을 꺼낸다 (허브는 bravo 가 세운 뒤)
    seats = [(fx, fy) for _x, _y, fx, fy in iron]
    for k, who in enumerate(ROLES["iron-ore"]):
        mine_ = seats[k * 3:(k + 1) * 3]
        got = plates_in(ai, mine_)
        plan = []
        for (fx, fy), n in got.items():
            if n:
                plan += [("walk_to", {"x": fx + 0.5, "y": fy + 2.0}),
                         ("take", {"name": "iron-plate", "x": fx, "y": fy, "count": n})]
        give(ai, who, plan)
    wait_idle(ai, ["bravo", "delta", "echo", "foxtrot", "golf"], 400)
    # 5) 철 조: 판 18 만 남기고 허브에, 화로 2 받아 채굴기 2 -> 자기 화로 위에
    for k, who in enumerate(ROLES["iron-ore"]):
        mine_ = iron[k * 3:k * 3 + 2]
        have = int(bag(ai, who).get("iron-plate", 0))
        keep = PER_DRILL * len(mine_)
        plan = [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5})]
        if have > keep:
            plan.append(("insert", {"name": "iron-plate", "x": HUB[0], "y": HUB[1], "count": have - keep}))
        plan += [("take", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": len(mine_)}),
                 ("craft", {"recipe": DRILL, "count": len(mine_), "wait": True})]
        for dx, dy, _fx, _fy in mine_:
            plan += [("walk_to", {"x": dx + 0.5, "y": dy + 3.5}),
                     ("build", {"name": DRILL, "x": dx, "y": dy, "direction": 8})]
        give(ai, who, plan)
        print(f"{who}: 판 {have} 중 {keep} 남기고 허브로 · 채굴기 {len(mine_)}대")
    wait_idle(ai, ROLES["iron-ore"], 300)
    # 6) alpha: 허브에서 판 36 · 화로 4 -> 석탄 채굴기 4 (-> 상자)
    plan = [("walk_to", {"x": HUB[0], "y": HUB[1] + 1.5}),
            ("take", {"name": "iron-plate", "x": HUB[0], "y": HUB[1], "count": PER_DRILL * len(COAL_XS)}),
            ("take", {"name": "stone-furnace", "x": HUB[0], "y": HUB[1], "count": len(COAL_XS)}),
            ("craft", {"recipe": DRILL, "count": len(COAL_XS), "wait": True}),
            ("walk_to", {"x": 8.5, "y": -97.5}),
            ("mine", {"x": 8, "y": -101, "name": "coal", "count": 12, "search_radius": 6})]
    for x in COAL_XS:
        plan += [("walk_to", {"x": x + 0.5, "y": COAL_ROW_Y + 3.5}),
                 ("build", {"name": DRILL, "x": x, "y": COAL_ROW_Y, "direction": 8}),
                 ("insert", {"name": "coal", "x": x, "y": COAL_ROW_Y, "count": 3})]
    give(ai, "alpha", plan)
    print("alpha: 석탄 채굴기 4 (-> 상자)")
    wait_idle(ai, ["alpha", "hotel"], 400)
    # 7) hotel: 철 채굴기마다 석탄
    fed = [(iron[i][0], iron[i][1]) for k in range(len(ROLES["iron-ore"])) for i in (k * 3, k * 3 + 1) if i < len(iron)]
    have = int(bag(ai, "hotel").get("coal", 0))
    plan = []
    each = max(1, have // max(1, len(fed)))
    for dx, dy in fed:
        plan += [("walk_to", {"x": dx + 0.5, "y": dy + 3.5}),
                 ("insert", {"name": "coal", "x": dx, "y": dy, "count": each})]
    give(ai, "hotel", plan)
    print(f"hotel: 철 채굴기에 석탄 {each}개씩")


def status(ai) -> None:
    for w in ai.list():
        try:
            bag = ai.agent(w["name"]).items()
        except RconError:
            bag = {}
        cur = (w.get("current") or {}).get("type", "-")
        print(f"  {w['name']:<8} ({float(w.get('x') or 0):.0f},{float(w.get('y') or 0):.0f}) {cur:<8} "
              + " ".join(f"{k}:{v}" for k, v in sorted(bag.items())))
    print("  ", ai.lua("""(function()
      local f, s = game.forces.player, game.surfaces[1]
      local t = {}
      for _, n in pairs({"electronics", "steam-power", "automation-science-pack"}) do
        t[n] = f.technologies[n].researched end
      t.furnaces = s.count_entities_filtered{type = "furnace", force = f}
      t.drills = s.count_entities_filtered{type = "mining-drill", force = f}
      t.tick = game.tick
      return t end)()"""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=("status", "gather", "smelt", "drills"))
    ap.add_argument("--count", type=int, default=50)
    ap.add_argument("--wait", action="store_true")
    args = ap.parse_args()
    ai = AIBridge()
    if args.step == "status":
        status(ai)
        return 0
    detached.mark(CREW, OWNER, minutes=60)
    if args.step == "gather":
        gather(ai, args.count)
    if args.step == "drills":
        drills(ai)
    if args.step == "smelt":
        smelt(ai)
        gather(ai, args.count)
    if args.wait:
        wait_idle(ai, CREW)
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

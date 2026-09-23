"""Oil: pumpjacks on the south-east field, one underground pipeline home.

    사용자: "빌드올려"

빨강·녹색·군용 다음은 화학 팩이고, 그것은 석유다. 원유는 (250..266, 240..261)
네 공 - 기지에서 남동 365칸. 사방이 둥지라 «길»이 설계의 전부다:

    정유 자리 R = 호수 옆 발전소 남쪽 (x 25..45, y -15..5). 물(황)과 전기가 있다.
    관로: R -> 동쪽 y=10 (x 46..245) -> 남쪽 x=245 (y 10..240) -> 유전 매니폴드.
          둥지 (168..180,-35..-22) 아래 32칸, (271..286,-11..3) 서쪽 26칸을 지난다 -
          중형 웜 사거리 30 밖이다. 남쪽 직행은 (121..142,75..93)·(199..225,125..141)
          ·(143..169,256..270) 세 무리를 다 스친다.
    관은 «지하관 쌍»으로 깐다 - 11칸에 둘. 물을 건너고, 사람이 밟고 지나가고,
          공격받을 몸이 425개가 아니라 80개다.
    전기: 같은 길에 중형 전봇대 8칸마다 (강철 2·구리 2, 닿는 거리 9).
    유전: 펌프잭 4 + 포탑 8 (반지름 14, 관통탄 20). 동쪽 (319,248) 대형 웜 사거리
          38 밖에만 선다 (x <= 276).

oil-processing 은 연구가 아니라 «펌프잭이 원유를 뽑으면» 풀리는 트리거다.
정유소·화학공장은 그 뒤에 (refinery 단계).

    python scripts/oil.py                              # 어디까지 됐나
    python scripts/oil.py --who hotel --stage scout    # 회랑을 보면서 걷는다
    python scripts/oil.py --who charlie,alpha --stage line
    python scripts/oil.py --who charlie,alpha,golf --stage wells
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
import shelf as shelf_mod                # noqa: E402
import creep                             # noqa: E402  (outfit/stock_at/placeable/turret_state)
import fogwalk                           # noqa: E402  (walk_watch)

DEPOT = (-55, 10)
PIPE, UG, POLE, JACK, TURRET = ("pipe", "pipe-to-ground", "medium-electric-pole",
                                "pumpjack", "gun-turret")
PIERCING = "piercing-rounds-magazine"
N, E, S, W = 0, 4, 8, 12

R_IN = (46, 10)                      # 관로가 정유 자리에 닿는 곳 (동쪽 포탑선 x=50 의 포탑 사이)
CORNER = (245, 10)
FIELD_IN = (245, 240)
MANIFOLD_X = 248                     # 유전 매니폴드 (세로), 펌프잭 서쪽
WELLS = ((251.5, 240.5), (256.5, 249.5), (252.5, 260.5), (265.5, 245.5))
FIELD = (257, 250)
OUTPOST = ((243, 236), (257, 232), (271, 236), (276, 250),
           (271, 264), (257, 268), (243, 264), (239, 250))
SPAN = 10                            # 지하관 쌍의 거리
POLE_STEP = 8
AMMO = 20


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


# ----------------------------------------------------------------- geometry

def run(a, b):
    """a 에서 b 까지 직선 칸들 (직교)."""
    (x0, y0), (x1, y1) = a, b
    if x0 == x1:
        step = 1 if y1 > y0 else -1
        return [(x0, y) for y in range(y0, y1 + step, step)]
    step = 1 if x1 > x0 else -1
    return [(x, y0) for x in range(x0, x1 + step, step)]


def ug_pairs(tiles):
    """직선 칸 목록을 지하관 쌍으로. [(입구, 출구, 방향)] - 방향은 «지상 쪽»."""
    out = []
    i = 0
    n = len(tiles)
    dx, dy = (tiles[1][0] - tiles[0][0], tiles[1][1] - tiles[0][1]) if n > 1 else (1, 0)
    back = {(1, 0): W, (-1, 0): E, (0, 1): N, (0, -1): S}[(dx, dy)]
    fwd = {W: E, E: W, N: S, S: N}[back]
    while i < n:
        j = min(i + SPAN, n - 1)
        if j == i:
            break
        out.append((tiles[i], tiles[j], (back, fwd)))
        i = j + 1
    return out


def line_steps():
    """관로 + 전봇대 걸음 전체 (정유 자리 -> 유전)."""
    steps = []
    legs = ((R_IN, CORNER), ((CORNER[0], CORNER[1] + 1), FIELD_IN),
            ((FIELD_IN[0] + 1, FIELD_IN[1]), (MANIFOLD_X - 1, FIELD_IN[1])))
    for a, b in legs:
        tiles = run(a, b)
        for ent, ext, (d_in, d_out) in ug_pairs(tiles):
            steps.append(("build", {"name": UG, "x": ent[0] + 0.5, "y": ent[1] + 0.5,
                                    "direction": d_in, "type": "input"}))
            steps.append(("build", {"name": UG, "x": ext[0] + 0.5, "y": ext[1] + 0.5,
                                    "direction": d_out, "type": "output"}))
        # 모퉁이·끝은 보통 관 (사방으로 잇는다)
        steps.append(("build", {"name": PIPE, "x": b[0] + 0.5, "y": b[1] + 0.5}))
    steps.append(("build", {"name": PIPE, "x": CORNER[0] + 0.5, "y": CORNER[1] + 0.5}))
    # 전봇대: 관 옆 한 칸 (가로는 y-1, 세로는 x+1), 8칸마다
    for i, (x, y) in enumerate(run(R_IN, CORNER)):
        if i % POLE_STEP == 0:
            steps.append(("build", {"name": POLE, "x": x + 0.5, "y": y - 0.5}))
    for i, (x, y) in enumerate(run((CORNER[0], CORNER[1] + 1), FIELD_IN)):
        if i % POLE_STEP == 0:
            steps.append(("build", {"name": POLE, "x": x + 1.5, "y": y + 0.5}))
    return steps


HOP = 30                             # 포탑 사슬 간격 (사거리 18 이 겹치게)


def corridor_steps():
    """회랑을 따라 HOP 마다 포탑 넷 (2x2 넷이 붙은 4x4). 관 옆에.

    alpha 가 회랑에서 순찰 무리에 쫓겨 죽었다. 사람은 «포탑 사거리 안에서만»
    일한다 - 사슬을 먼저 잇고, 관과 전봇대는 그 뒤를 따른다. 반사(reflex.lua)도
    가장 가까운 포탑으로 튀므로 사슬이 곧 도망 길이다.
    """
    steps = []
    legs = ((R_IN, CORNER, (0, 3)), ((CORNER[0], CORNER[1] + 1), FIELD_IN, (3, 0)))
    for a, b, (ox, oy) in legs:
        tiles = run(a, b)
        for i in range(HOP, len(tiles), HOP):
            x, y = tiles[i]
            for dx, dy in ((0, 0), (2, 0), (0, 2), (2, 2)):
                tx, ty = x + ox + dx, y + oy + dy
                steps.append(("build", {"name": TURRET, "x": tx, "y": ty}))
                steps.append(("insert", {"name": PIERCING, "x": tx, "y": ty, "count": AMMO}))
    return steps


def field_steps():
    """유전: 포탑 고리 -> 매니폴드 -> 펌프잭 -> 지선 (지선은 세운 뒤 정한다)."""
    steps = []
    for x, y in OUTPOST:
        steps.append(("build", {"name": TURRET, "x": x, "y": y}))
        steps.append(("insert", {"name": PIERCING, "x": x, "y": y, "count": AMMO}))
    for y in range(238, 263):
        steps.append(("build", {"name": PIPE, "x": MANIFOLD_X + 0.5, "y": y + 0.5}))
    for x, y in WELLS:
        steps.append(("build", {"name": JACK, "x": x, "y": y, "direction": W}))
    return steps


# ----------------------------------------------------------------- queries

def standing(ai, steps) -> set:
    packed = ";".join(f"{p['name']},{p['x']},{p['y']}" for k, p in steps if k == "build")
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


def spurs(ai) -> list:
    """펌프잭 출구에서 매니폴드까지 보통 관. 출구 자리는 게임에 묻는다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, j in pairs(s.find_entities_filtered{name = "%s", force = f}) do
        for _, c in pairs(j.fluidbox.get_pipe_connections(1)) do
          if c.target_position then
            out[#out+1] = string.format("%%.1f,%%.1f", c.target_position.x, c.target_position.y)
          end
        end
      end
      return out
    end)()""" % JACK)
    steps = []
    for row in _rows(reply):
        tx, ty = (float(v) for v in str(row).split(","))
        x, y = int(math.floor(tx)), int(math.floor(ty))
        # 출구 칸에서 서쪽으로 매니폴드까지
        for px in range(x, MANIFOLD_X, -1):
            steps.append(("build", {"name": PIPE, "x": px + 0.5, "y": y + 0.5}))
    return steps


def crude_flow(ai) -> float:
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local total = 0
      for _, j in pairs(s.find_entities_filtered{name = "%s", force = f}) do
        total = total + (j.fluidbox[1] and j.fluidbox[1].amount or 0)
      end
      return { n = total, jacks = s.count_entities_filtered{name = "%s", force = f},
               tech = f.technologies["oil-processing"].researched and 1 or 0 }
    end)()""" % (JACK, JACK))
    return reply


# ----------------------------------------------------------------- stages

def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def wait_idle(ai, crew, limit=600):
    for _ in range(limit // 5):
        time.sleep(5)
        if all(idle(ai, w) for w in crew):
            return True
    return False


def scout(ai, who):
    """회랑을 보면서 걷는다. 적이 보이면 물러나고 거기서 접는다."""
    marks = run(R_IN, CORNER)[::40] + run(CORNER, FIELD_IN)[::40] + [FIELD]
    fled = 0
    for i, (x, y) in enumerate(marks):
        for _try in range(2):
            got = fogwalk.walk_watch(ai, who, (x, y), (-40, 30), label=" (회랑)")
            print(f"  {who}: 회랑 {i + 1}/{len(marks)} ({x},{y}) -> {got}")
            if got != "fled":
                break
            fled += 1
            time.sleep(30)                       # 무리가 지나가길 기다린다
        if got == "dead" or fled >= 4:
            return False
    home = list(reversed(marks))
    fogwalk.go_home(ai, who, home, (-40, 30))
    return True


def fetch(ai, who, need: dict) -> list:
    """가방에 모자란 것을 창고에서 챙기거나 만든다."""
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    plan = []
    for item, n in (("iron-plate", 400), ("copper-plate", 150), ("steel-plate", 120), ("stone", 20)):
        at = have.get(item) or creep.stock_at(ai, item, n)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    for item, n in need.items():
        short = n - int(bag.get(item, 0))
        if short <= 0:
            continue
        at = have.get(item) or creep.stock_at(ai, item, short)
        if at and item in (TURRET, PIERCING):
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": short}))
        else:
            count = (short + 1) // 2 if item in (UG,) else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    return plan


def fit(ai, part) -> list:
    """놓을 수 없는 자리: 나무·바위는 앞에 벌목을, 물 위 전봇대는 반대쪽으로 옮긴다."""
    builds = [(k, p) for k, p in part if k == "build"]
    if not builds:
        return part
    packed = ";".join(f"{p['name']},{p['x']},{p['y']}" for _k, p in builds)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        if not s.can_place_entity{name = n, position = {x, y}, force = f,
             build_check_type = defines.build_check_type.manual} then
          local why = "blocked"
          if s.get_tile(math.floor(x), math.floor(y)).collides_with("water_tile") then why = "water"
          else
            local e = s.find_entities_filtered{type = {"tree", "simple-entity"},
                        area = {{x - 0.6, y - 0.6}, {x + 0.6, y + 0.6}}}[1]
            if e then why = "tree" end
          end
          out[#out+1] = bit .. "|" .. why
        end
      end
      return out
    end)()""" % packed)
    bad = {}
    for row in _rows(reply):
        bit, why = str(row).split("|")
        n, x, y = bit.split(",")
        bad[(n, float(x), float(y))] = why
    out = []
    for k, p in part:
        if k == "build":
            why = bad.get((p["name"], p["x"], p["y"]))
            if why == "tree":
                out.append(("chop", {"x": p["x"], "y": p["y"], "count": 2}))
            elif why == "water" and p["name"] == POLE:
                q = dict(p)
                q["y"] = p["y"] + 2 if p["y"] < 12 else p["y"]
                q["x"] = p["x"] if p["y"] < 12 else p["x"] - 2
                p = q
        out.append((k, p))
    return out


def build_stage(ai, crew, steps, label, rounds=8):
    """걸음을 사람 수로 나눠 60단계씩 여러 순번에 세운다. 선 것은 뺀다."""
    for n_round in range(rounds):
        up = standing(ai, steps)
        todo = [st for st in steps
                if st[0] != "build" or (st[1]["name"], st[1]["x"], st[1]["y"]) not in up]
        builds = [st for st in todo if st[0] == "build"]
        if not builds:
            print(f"  {label}: 다 섰다 ({len(up)})")
            return True
        per = (len(todo) + len(crew) - 1) // len(crew)
        for i, who in enumerate(crew):
            part = todo[i * per:(i + 1) * per][:44]
            if not part:
                continue
            need = {}
            for k, p in part:
                if k == "build":
                    need[p["name"]] = need.get(p["name"], 0) + 1
                elif k == "insert":
                    need[p["name"]] = need.get(p["name"], 0) + p["count"]
            plan = fetch(ai, who, need)
            last = None
            for k, p in fit(ai, part):
                if k == "build" and (last is None or abs(p["x"] - last[0]) + abs(p["y"] - last[1]) > 7):
                    plan.append(("walk_to", {"x": p["x"] + 1, "y": p["y"] + 2}))
                    last = (p["x"], p["y"])
                plan.append((k, p))
            submit(ai, who, plan[:60], strict=False)
            print(f"{who}: {label} {n_round + 1}순번 ({len(part)}걸음)")
        wait_idle(ai, crew, 900)
    up = standing(ai, steps)
    print(f"  {label}: {len(up)}/{sum(1 for k, _ in steps if k == 'build')}")
    return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--stage", default="", choices=("", "scout", "corridor", "line", "wells", "spurs"))
    args = ap.parse_args()
    ai = AIBridge()
    crew = [n.strip() for n in args.who.split(",") if n.strip()]

    line = line_steps()
    field = field_steps()
    chain = corridor_steps()
    up_chain = standing(ai, chain)
    up_line = standing(ai, line)
    up_field = standing(ai, field)
    flow = crude_flow(ai)
    print(f"  포탑 사슬 {len(up_chain)}/{sum(1 for k, _ in chain if k == 'build')} · "
          f"관로·전봇대 {len(up_line)}/{sum(1 for k, _ in line if k == 'build')} · "
          f"유전 {len(up_field)}/{sum(1 for k, _ in field if k == 'build')} · "
          f"펌프잭 {flow['jacks']} 원유 {float(flow['n']):.0f} · oil-processing {'됨' if int(flow['tech']) else '아직'}")
    if not (crew and args.stage):
        return 0
    if args.stage == "scout":
        return 0 if scout(ai, crew[0]) else 1
    if args.stage == "corridor":
        build_stage(ai, crew[:1], chain, "포탑 사슬", rounds=6)   # 한 사람이 차례로 - 앞 사슬의 사거리 안에서 다음을
    elif args.stage == "line":
        build_stage(ai, crew, line, "관로")
    elif args.stage == "wells":
        build_stage(ai, crew, field, "유전")
        build_stage(ai, crew, spurs(ai), "지선", rounds=2)
    elif args.stage == "spurs":
        build_stage(ai, crew, spurs(ai), "지선", rounds=2)
    flow = crude_flow(ai)
    print(f"  펌프잭 {flow['jacks']} 원유 {float(flow['n']):.0f} · oil-processing {'됨' if int(flow['tech']) else '아직'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

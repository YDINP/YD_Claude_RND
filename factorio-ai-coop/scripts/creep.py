"""Turret creep: kill a nest with turrets, not with bodies.

    사용자: "기지서쪽에 매우 가깝게 적기지가 생성되엇음. 유의하고 공격준비"

캐릭터는 총이 없고, 있어도 웜(대형 사거리 38)이 먼저 때린다. 창고에는 포탑
277대가 있다. 포탑 사거리는 18, 중형 웜 30, 대형 38 - 포탑은 웜에 «맞으면서»
쏜다. 그래서 «한 번에 많이, 그리고 바로 물러난다»:

    1. 둥지 동쪽 STAND 칸에서 사거리 18 안에 «가장 가까운 웜들»이 드는 열에
       포탑 여섯씩 둘이 동시에 세우고 탄약을 넣는다 (한 사람 6대, 10초).
    2. 곧장 동쪽으로 40칸 물러난다. 세우는 동안만 스피터 사정권이다.
    3. 웜·둥지가 죽는지 본다. 포탑 열이 남으면 다음 열(더 서쪽)로 한 번 더.

포탑 열의 x 는 «둥지 동쪽 끝 웜에서 16칸» - 그 웜과 그 뒤 몇은 사거리에 들고,
서쪽 끝 웜은 안 든다(= 그 웜도 포탑을 못 때린다). 웜은 안 움직인다.

세운 포탑은 걷지 않는다 - 서쪽 전초가 된다 (guard.py 가 이웃을 받쳐 준다).

    python scripts/creep.py --at=-198,35                   # 둥지 주변 실측만
    python scripts/creep.py --at=-198,35 --who charlie,hotel --go
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
import detached                          # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

DEPOT = (-55, 10)
TURRET = "gun-turret"
AMMO = ("piercing-rounds-magazine", "firearm-magazine")
RANGE = 18
EACH = 4                 # 한 사람이 세우는 포탑 수 (셋이면 12)
AMMO_EACH = 10
STAND_BACK = 9           # 앞 열에서 이만큼 뒤에 서서 놓는다 (팔 닿는 거리 10, 뒤 열은 7)
RETREAT = 45


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def nest(ai, at, radius=60) -> list:
    """둥지 주변 적 구조물. [(이름, x, y, hp)]"""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, e in pairs(s.find_entities_filtered{type = {"unit-spawner", "turret"},
              force = game.forces.enemy, position = {%f, %f}, radius = %d}) do
        out[#out+1] = string.format("%%s|%%.1f|%%.1f|%%d", e.name, e.position.x, e.position.y, e.health)
      end
      return out
    end)()""" % (at[0], at[1], radius))
    out = []
    for row in _rows(reply):
        n, x, y, hp = str(row).split("|")
        out.append((n, float(x), float(y), int(float(hp))))
    return out


NEAR = RANGE - 4         # 앞 열은 끝 웜에서 이만큼 (뒤 열은 +2). 둘 다 사거리 안


def column_for(foes, side=1):
    """포탑 열: 동쪽 끝(side=1) 웜·둥지에서 NEAR 칸 동쪽, y 는 무리의 중심."""
    xs = [f[1] for f in foes]
    edge = max(xs) if side > 0 else min(xs)
    cx = edge + side * NEAR
    cy = sum(f[2] for f in foes) / len(foes)
    return cx, cy


def seats(cx, cy, n, side=1) -> list:
    """두 열(앞 cx, 뒤 cx+2) 에 n 개, 세로로 붙여서 (2x2 라 2칸 간격). 중심은 정수."""
    per = (n + 1) // 2
    y0 = int(round(cy)) - (per - 1)
    out = []
    for i in range(per):
        out.append((int(round(cx)), y0 + 2 * i))
        if len(out) < n:
            out.append((int(round(cx)) + 2 * side, y0 + 2 * i))
    return out


def placeable(ai, spots) -> list:
    packed = ";".join(f"{x},{y}" for x, y in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        if s.can_place_entity{name = "%s", position = {x, y}, force = f,
             build_check_type = defines.build_check_type.manual} then out[#out+1] = x .. "," .. y end
      end
      return out
    end)()""" % (packed, TURRET))
    return [tuple(int(float(v)) for v in str(r).split(",")) for r in _rows(reply)]


def crew_pos(ai) -> dict:
    return {w["name"]: (w.get("alive"), float(w.get("x") or 0), float(w.get("y") or 0),
                        int(w.get("health") or 0), bool(w.get("current") or w.get("queued")))
            for w in ai.list()}


def stock_at(ai, item, n):
    """그 물건이 n 개 이상 든 상자 아무거나. 창고 밖(군용 모듈의 관통탄 상자)도 본다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local best, most = nil, 0
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f}) do
        local k = c.get_inventory(defines.inventory.chest).get_item_count("%s")
        if k > most then best, most = c.position, k end
      end
      if best and most >= %d then return { x = best.x, y = best.y, n = most } end
      return { n = most }
    end)()""" % (item, n))
    if reply.get("x") is not None:
        return (float(reply["x"]), float(reply["y"]))
    return None


def outfit(ai, who, n_turrets, ammo_name, n_ammo) -> list:
    """창고에서 포탑·탄약을 챙기는 걸음."""
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    plan = []
    for item, n in ((TURRET, n_turrets), (ammo_name, n_ammo)):
        at = have.get(item) or stock_at(ai, item, n)
        if not at:
            continue
        plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
        plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    return plan


def assault(ai, who, spots, stand, ammo_name, retreat) -> None:
    plan = [("walk_to", {"x": stand[0], "y": stand[1]})]
    # 세우자마자 탄약. 1파에서 «다 세운 뒤 탄약»으로 했더니 빈 포탑이 차례로 맞았다.
    for x, y in spots:
        plan.append(("build", {"name": TURRET, "x": x, "y": y}))
        plan.append(("insert", {"name": ammo_name, "x": x, "y": y, "count": AMMO_EACH}))
    plan.append(("walk_to", {"x": retreat[0], "y": retreat[1]}))
    submit(ai, who, plan, strict=False)


def pick_side(ai, foes, n=16) -> int:
    """동·서 열 가운데 세울 수 있는 자리가 많은 쪽.
    실측 (23회차 남쪽 둥지): 동쪽 열은 나무 85 그루에 16 자리 중 3 만 났고, 포탑이 한 대씩 서서 차례로 부서졌다.
    서쪽은 16/16."""
    got = {sd: len(placeable(ai, seats(*column_for(foes, sd), n, sd))) for sd in (1, -1)}
    print(f"  놓을 자리 동 {got[1]}/{n} · 서 {got[-1]}/{n}")
    return 1 if got[1] >= got[-1] else -1


HOME = (-40, 30)                 # 귀환 목적지 (기지 안쪽, 포탑 줄 안)
UNIT_CHECK = 40                  # 경유점 둘레 이 안에 적 유닛이 있으면 멈춘다


def march(ai, crew, path) -> bool:
    """경유점마다 «모두» 도착할 때까지 기다리고, 둘레에 적 유닛이 있으면 멈춘다.
    실측 (23회차): 자동 우회는 구조물만 피해 delta · bravo 가 떠돌이 유닛 무리 속으로 걸어 들어갔다."""
    for x, y in path:
        for i, who in enumerate(crew):
            submit(ai, who, [("walk_to", {"x": x, "y": y + 2 * i})], strict=False)
        for _ in range(120):
            time.sleep(4)
            pos = crew_pos(ai)
            if any(not pos[w][0] for w in crew) or all(not pos[w][4] for w in crew):
                break
        n = ai.lua("""(function() return {n = game.surfaces[1].count_entities_filtered{force = "enemy", type = "unit",
          position = {%d, %d}, radius = %d}} end)()""" % (x, y, UNIT_CHECK))["n"]
        print(f"  경유점 ({x},{y}) 유닛 {n}", flush=True)
        if n:
            return False
    return True


# 둥지 둘레에 모인 무리를 센다.
#
#     사용자: "적이 모여있는걸 왜 체크안함"
#
# 실측 (23회차 북동 둥지 1파): march 는 경유점 (44,-112) 반경 40 만 보고 «유닛 0» 이라 갔다. 둥지 둘레엔
# 53~94 마리가 모여 있었고 (채팅 경고가 계속 떴다), 포탑 13 대가 서자마자 무리가 덮쳐 다 부서졌고
# hotel · delta · echo · foxtrot 넷이 후퇴 길 (y -128..-144) 에서 죽었다.
# 파마다 둥지 중심 SWARM_R 안의 유닛을 세어 SWARM_MAX 보다 많으면 줄 때까지 기다리고, 안 줄면 접는다.
SWARM_R = 70
SWARM_MAX = 15
SWARM_WAIT = 300          # 초


def swarm(ai, foes) -> int:
    cx = sum(f[1] for f in foes) / len(foes)
    cy = sum(f[2] for f in foes) / len(foes)
    return ai.lua("""(function() return {n = game.surfaces[1].count_entities_filtered{force = "enemy", type = "unit",
      position = {%f, %f}, radius = %d}} end)()""" % (cx, cy, SWARM_R))["n"]


def swarm_ok(ai, foes) -> bool:
    t0 = time.time()
    while True:
        n = swarm(ai, foes)
        print(f"  둥지 둘레 {SWARM_R}칸 유닛 {n} (허용 {SWARM_MAX})", flush=True)
        if n <= SWARM_MAX:
            return True
        if time.time() - t0 > SWARM_WAIT:
            return False
        time.sleep(20)


# 후퇴는 «우리 포탑 뒤» 로.
#
# 실측 (같은 1파): 후퇴점 = 열 뒤 RETREAT 45 칸 (y -121) 은 북쪽 줄 (y -108, 사거리 18 → -126) 바로 밖이었다.
# 쫓는 바이터는 사람보다 빠르다 - 넷 다 그 몇 칸 앞에서 잡혔다. 가장 가까운 «탄 있는» 우리 포탑 (적 구조물
# 45 칸 밖) 을 찾아 그 포탑에서 둥지 반대쪽으로 4 칸 뒤에 선다. 못 찾으면 옛 방식.
def safe_spot(ai, near, away_from):
    got = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local best, bd = nil, 1e18
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, position = {%f, %f}, radius = 150}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        if inv and inv.get_item_count() >= 5 and s.count_entities_filtered{force = "enemy", type = {"turret", "unit-spawner"},
             position = t.position, radius = 45, limit = 1} == 0 then
          local dx, dy = t.position.x - %f, t.position.y - %f
          local d = dx * dx + dy * dy
          if d < bd then best, bd = t.position, d end
        end
      end
      if best then return {x = best.x, y = best.y} end
      return {}
    end)()""" % (near[0], near[1], near[0], near[1]))
    if got.get("x") is None:
        return None
    gx, gy = float(got["x"]), float(got["y"])
    dx, dy = gx - away_from[0], gy - away_from[1]
    span = max(1.0, math.hypot(dx, dy))
    return (gx + dx / span * 4, gy + dy / span * 4)


def go_home(ai, crew, via) -> None:
    """어떻게 끝나든 온 길을 거꾸로 걸어 집으로. 실측: 파가 접힌 뒤 전장에 남겨진 charlie 가 반사에 밀려 죽었다."""
    alive = [w for w in crew if crew_pos(ai)[w][0]]
    path = list(reversed(via or [])) + [HOME]
    for i, who in enumerate(alive):
        submit(ai, who, [("walk_to", {"x": x, "y": y + 2 * i}) for x, y in path], strict=False)


def rally(ai, crew, foes, side) -> None:
    """열 뒤 RETREAT 칸에 모두 모인 다음에 세운다.
    실측: 따로 출발하면 먼저 온 사람의 포탑이 혼자 서서 혼자 맞았다 (hotel 이 bravo 보다 60 칸 먼저 도착)."""
    tf, sd, real = _axis(foes, side)
    cx, cy = column_for(tf, sd)
    for i, who in enumerate(crew):
        x, y = real(cx + sd * RETREAT, cy - 3 + 2 * i)
        submit(ai, who, [("walk_to", {"x": x, "y": y})], strict=False)
    for _ in range(90):
        time.sleep(5)
        if all(not crew_pos(ai)[w][4] for w in crew):
            break


def _axis(foes, side):
    """side ±1 = 동·서 세로 열, ±2 = 남·북 가로 열 (x·y 를 바꿔 같은 계산을 쓴다).
    돌려주는 것: (바꾼 foes, ±1, 실좌표로 되돌리는 함수)."""
    if abs(side) == 2:
        return [(f[0], f[2], f[1], f[3]) for f in foes], side // 2, (lambda a, b: (b, a))
    return foes, side, (lambda a, b: (a, b))


def wave(ai, crew, foes, ammo_name, side=1) -> list:
    """한 열을 사람 수만큼 나눠 세운다. 놓은 자리 (실좌표) 를 돌려준다."""
    tf, sd, real = _axis(foes, side)
    cx, cy = column_for(tf, sd)
    spots = placeable(ai, [real(a, b) for a, b in seats(cx, cy, EACH * len(crew), sd)])
    if not spots:
        print("  놓을 자리가 없다")
        return []
    k = len(crew)
    per = (len(spots) + k - 1) // k
    parts = [spots[i * per:(i + 1) * per] for i in range(k)]      # 사람 수만큼 나눈다 - 빨리 놓을수록 덜 맞는다
    for who, part in zip(crew, parts):
        if not part:
            continue
        my = sum(real(*p)[1] for p in part) / len(part)            # 열을 따라가는 좌표
        stand = real(cx + sd * STAND_BACK, my)
        ncx = sum(f[1] for f in foes) / len(foes)
        ncy = sum(f[2] for f in foes) / len(foes)
        retreat = safe_spot(ai, stand, (ncx, ncy)) or real(cx + sd * RETREAT, my)
        # 사람마다 «가방에 실제로 든» 탄을 넣는다. 23회차 북동 1파: 관통탄을 들었는데 ammo_name 이 일반 탄창으로
        # 떨어져, 가방에 없는 탄을 넣으려다 포탑이 빈 채 섰다 (일반 탄창은 기관단총 칸에만 있었다) - 13 대가 쏘지도 못하고 부서졌다.
        bag = ai.agent(who).items()
        mine = next((n for n in AMMO if bag.get(n, 0) >= AMMO_EACH * len(part)), None)
        if not mine:
            print(f"  [!] {who}: 포탑 {len(part)}대에 넣을 탄이 없다 {({n: bag.get(n, 0) for n in AMMO})} - 이 사람은 세우지 않는다", flush=True)
            continue
        assault(ai, who, part, stand, mine, retreat)
        print(f"{who}: 포탑 {len(part)}대를 {part[0]} 부터 · {mine} (서는 곳 {stand[0]:.0f},{stand[1]:.0f} · 후퇴 {retreat[0]:.0f},{retreat[1]:.0f})")
    return spots


def turret_state(ai, spots) -> list:
    packed = ";".join(f"{x},{y}" for x, y in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local t = s.find_entities_filtered{name = "%s", force = f, area = {{x - 0.5, y - 0.5}, {x + 0.5, y + 0.5}}}[1]
        if t then out[#out+1] = string.format("%%d|%%d", t.health, t.get_inventory(defines.inventory.turret_ammo).get_item_count()) end
      end
      return out
    end)()""" % (packed, TURRET))
    return [tuple(int(v) for v in str(r).split("|")) for r in _rows(reply)]


def main() -> int:
    global EACH, SWARM_MAX, AMMO_EACH
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", required=True, help="둥지 근처 좌표. 음수는 --at=-198,35")
    ap.add_argument("--who", default="")
    ap.add_argument("--go", action="store_true")
    ap.add_argument("--waves", type=int, default=3)
    # 중형 웜 둘에 14 대 열이 다 부서졌다 (23회차 남쪽 새 둥지) - 한 파를 두껍게
    ap.add_argument("--each", type=int, default=EACH, help="한 사람이 한 파에 세우는 포탑 수")
    ap.add_argument("--side", type=int, default=0,
                    help="1 = 동쪽에서 접근, -1 = 서쪽, 2 = 남쪽, -2 = 북쪽, 0 = 동·서 중 놓을 자리가 많은 쪽")
    # 두 무리가 60칸 안에 겹치면 열이 «그 사이 허공»에 선다 (북쪽: y -28 과 -76 무리 -> y -57).
    ap.add_argument("--radius", type=float, default=60, help="--at 둘레 이만큼만 친다")
    ap.add_argument("--via", default="", help="가는 길 경유점 'x,y;x,y' - 모두 모여 유닛을 확인하며 간다. 귀환은 거꾸로")
    ap.add_argument("--swarm-max", type=int, default=SWARM_MAX, help="둥지 둘레 이보다 많으면 접는다 (탄 든 포탑 수에 맞춰)")
    ap.add_argument("--ammo-each", type=int, default=AMMO_EACH, help="포탑마다 넣는 탄")
    args = ap.parse_args()
    EACH = args.each
    SWARM_MAX = args.swarm_max
    AMMO_EACH = args.ammo_each
    ax, ay = (float(v) for v in args.at.split(","))
    ai = AIBridge()

    foes = nest(ai, (ax, ay), args.radius)
    if not foes:
        print("  둥지가 안 보인다")
        return 0
    print(f"  적 구조물 {len(foes)}:")
    for n, x, y, hp in sorted(foes, key=lambda f: -f[1]):
        print(f"    {n:<22} ({x:.0f},{y:.0f}) hp {hp}")
    if not args.side:
        args.side = pick_side(ai, foes)
    tf, sd, real = _axis(foes, args.side)
    cx, cy = real(*column_for(tf, sd))
    print(f"  포탑 열 x={cx:.0f} y~{cy:.0f} · 사거리 안 구조물 "
          f"{sum(1 for f in foes if math.hypot(f[1] - cx, f[2] - cy) <= RANGE + 4)}")
    if not (args.go and args.who):
        return 0

    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    # 이 사람들은 끝날 때까지 «밀기의 것»이다 - danger 도 drain 도 guard 도 못 데려간다.
    detached.mark(crew, owner="creep", minutes=15 * args.waves + 10)
    try:
        return run(ai, args, crew, ax, ay)
    finally:
        detached.release(crew)


def run(ai, args, crew, ax, ay) -> int:
    via = [tuple(float(v) for v in p.split(",")) for p in args.via.split(";") if p.strip()]
    try:
        return _run(ai, args, crew, ax, ay, via)
    finally:
        go_home(ai, crew, via)


def _run(ai, args, crew, ax, ay, via) -> int:
    # 탄약: 관통탄이 있으면 그것, 없으면 보통 탄창
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    # 23회차 북동: 관통탄을 가방에 손제작해 들고 왔다 - 상자만 보면 일반 탄창으로 떨어진다
    carried = min(ai.agent(w).items().get(AMMO[0], 0) for w in crew)
    ammo_name = AMMO[0] if (carried >= AMMO_EACH * EACH or have.get(AMMO[0]) or stock_at(ai, AMMO[0], 60)) else AMMO[1]
    for who in crew:
        n_ammo = 0 if (ammo_name == AMMO[0] and carried >= AMMO_EACH * EACH) else AMMO_EACH * EACH + 20
        submit(ai, who, outfit(ai, who, EACH + 2, ammo_name, n_ammo), strict=False)
        print(f"{who}: 포탑 {EACH + 2}대 · {ammo_name} {AMMO_EACH * EACH + 20}발 챙긴다")
    for _ in range(60):
        time.sleep(5)
        if all(not crew_pos(ai)[w][4] for w in crew):
            break
    first = nest(ai, (ax, ay), args.radius)
    if first and not swarm_ok(ai, first):
        print("  둥지 둘레에 무리가 모여 있다 - 출발하지 않는다", flush=True)
        return 1
    if via and not march(ai, crew, via):
        print("  가는 길에 적 유닛 - 접고 돌아온다")
        return 1

    for n_wave in range(1, args.waves + 1):
        foes = nest(ai, (ax, ay), args.radius)
        if not foes:
            print("  둥지가 사라졌다")
            break
        print(f"-- {n_wave}파: 남은 구조물 {len(foes)}")
        if not swarm_ok(ai, foes):
            print("  둥지 둘레에 무리가 모여 있다 - 접는다", flush=True)
            return 1
        rally(ai, crew, foes, args.side)
        spots = wave(ai, crew, foes, ammo_name, args.side)
        if not spots:
            break
        t0 = time.time()
        seen_any = False
        while time.time() - t0 < 300:
            time.sleep(10)
            pos = crew_pos(ai)
            dead = [w for w in crew if not pos[w][0]]
            if dead:
                print(f"  [!] {dead} 가 쓰러졌다 - 여기서 접는다")
                return 1
            st = turret_state(ai, spots)
            left = nest(ai, (ax, ay), args.radius)
            print(f"  포탑 {len(st)}/{len(spots)} 서 있음 (hp {[h for h, _a in st]}) · "
                  f"적 구조물 {len(left)} · "
                  + " ".join(f"{w}({pos[w][1]:.0f},{pos[w][2]:.0f}) hp{pos[w][3]}" for w in crew))
            mx, my = sum(p[0] for p in spots) / len(spots), sum(p[1] for p in spots) / len(spots)
            if not left or all(math.hypot(f[1] - mx, f[2] - my) > RANGE + 2
                               for f in left):
                break                        # 사거리 안의 것은 다 죽었다
            seen_any = seen_any or bool(st)
            if seen_any and not st:            # 섰다가 «없어진» 것이 다 죽은 것이다
                print("  포탑 열이 다 죽었다")
                return 1
        left = nest(ai, (ax, ay), args.radius)
        if not left:
            break
        # 다음 열을 위해 다시 챙긴다
        for who in crew:
            submit(ai, who, outfit(ai, who, EACH + 2, ammo_name, AMMO_EACH * EACH + 20), strict=False)
        for _ in range(60):
            time.sleep(5)
            if all(not crew_pos(ai)[w][4] for w in crew):
                break
    left = nest(ai, (ax, ay), args.radius)
    print(f"끝: 남은 적 구조물 {len(left)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

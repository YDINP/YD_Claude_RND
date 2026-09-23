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


def wave(ai, crew, foes, ammo_name, side=1) -> list:
    """한 열을 둘이 나눠 세운다. 놓은 자리를 돌려준다."""
    cx, cy = column_for(foes, side)
    spots = placeable(ai, seats(cx, cy, EACH * len(crew), side))
    if not spots:
        print("  놓을 자리가 없다")
        return []
    k = len(crew)
    per = (len(spots) + k - 1) // k
    parts = [spots[i * per:(i + 1) * per] for i in range(k)]      # 사람 수만큼 나눈다 - 빨리 놓을수록 덜 맞는다
    for who, part in zip(crew, parts):
        if not part:
            continue
        my = sum(p[1] for p in part) / len(part)
        stand = (cx + side * STAND_BACK, my)
        retreat = (cx + side * RETREAT, my)
        assault(ai, who, part, stand, ammo_name, retreat)
        print(f"{who}: 포탑 {len(part)}대를 x={part[0][0]} 열에 (서는 곳 {stand[0]:.0f},{stand[1]:.0f})")
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", required=True, help="둥지 근처 좌표. 음수는 --at=-198,35")
    ap.add_argument("--who", default="")
    ap.add_argument("--go", action="store_true")
    ap.add_argument("--waves", type=int, default=3)
    ap.add_argument("--side", type=int, default=1, help="1 = 동쪽에서 접근, -1 = 서쪽")
    args = ap.parse_args()
    ax, ay = (float(v) for v in args.at.split(","))
    ai = AIBridge()

    foes = nest(ai, (ax, ay))
    if not foes:
        print("  둥지가 안 보인다")
        return 0
    print(f"  적 구조물 {len(foes)}:")
    for n, x, y, hp in sorted(foes, key=lambda f: -f[1]):
        print(f"    {n:<22} ({x:.0f},{y:.0f}) hp {hp}")
    cx, cy = column_for(foes, args.side)
    print(f"  포탑 열 x={cx:.0f} y~{cy:.0f} · 사거리 안 구조물 "
          f"{sum(1 for f in foes if math.hypot(f[1] - cx, f[2] - cy) <= RANGE + 4)}")
    if not (args.go and args.who):
        return 0

    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    # 탄약: 관통탄이 있으면 그것, 없으면 보통 탄창
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    ammo_name = AMMO[0] if (have.get(AMMO[0]) or stock_at(ai, AMMO[0], 60)) else AMMO[1]
    for who in crew:
        submit(ai, who, outfit(ai, who, EACH + 2, ammo_name, AMMO_EACH * EACH + 20), strict=False)
        print(f"{who}: 포탑 {EACH + 2}대 · {ammo_name} {AMMO_EACH * EACH + 20}발 챙긴다")
    for _ in range(60):
        time.sleep(5)
        if all(not crew_pos(ai)[w][4] for w in crew):
            break

    for n_wave in range(1, args.waves + 1):
        foes = nest(ai, (ax, ay))
        if not foes:
            print("  둥지가 사라졌다")
            break
        print(f"-- {n_wave}파: 남은 구조물 {len(foes)}")
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
            left = nest(ai, (ax, ay))
            print(f"  포탑 {len(st)}/{len(spots)} 서 있음 (hp {[h for h, _a in st]}) · "
                  f"적 구조물 {len(left)} · "
                  + " ".join(f"{w}({pos[w][1]:.0f},{pos[w][2]:.0f}) hp{pos[w][3]}" for w in crew))
            if not left or all(math.hypot(f[1] - spots[0][0], f[2] - sum(s[1] for s in spots) / len(spots)) > RANGE + 2
                               for f in left):
                break                        # 사거리 안의 것은 다 죽었다
            seen_any = seen_any or bool(st)
            if seen_any and not st:            # 섰다가 «없어진» 것이 다 죽은 것이다
                print("  포탑 열이 다 죽었다")
                return 1
        left = nest(ai, (ax, ay))
        if not left:
            break
        # 다음 열을 위해 다시 챙긴다
        for who in crew:
            submit(ai, who, outfit(ai, who, EACH + 2, ammo_name, AMMO_EACH * EACH + 20), strict=False)
        for _ in range(60):
            time.sleep(5)
            if all(not crew_pos(ai)[w][4] for w in crew):
                break
    left = nest(ai, (ax, ay))
    print(f"끝: 남은 적 구조물 {len(left)}")
    for who in crew:
        submit(ai, who, [("walk_to", {"x": -40, "y": 30})], strict=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

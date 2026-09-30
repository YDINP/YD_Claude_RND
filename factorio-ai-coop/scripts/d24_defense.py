"""24회차 방어 보강 D24 (08:34~, 진화 0.42): 공습이 들어오는 면을 재고 약한 면에 포탑 · 두 겹 벽을 로봇 유령으로.

08:34 실측 (raidwatch24 + 적 조회, 기지 중심 (70,-15)):
  - SE: 흡수 둥지 (181,88) · (181,99) + 작은 벌레 (187,101) - 중심 151. 적 유닛 50 이 (125..150, 125..150) 에 모임.
        우리 것은 동쪽 벽 x 134.5 (y -43.5..7.5, 한 겹) 끝과 구리 남쪽 밭 남벽 (y 100.5, x 51.5..85.5) 사이가 **통째로 비었다** -
        포탑 1 ((130,10)), 벽 0. 그 안쪽은 몰 · 조립 줄 (x 20..60, y 0..60) 과 구리 밭 (x 56..90, y 60..100) - 공해원.
  - NW: 포탑 44 (탄 1,989, 대부분 노랑) - 06:34 부터 20 분마다 잡은 것 70~250 · 잃은 것 0. 버틴다.
  - P10 북쪽 구리 전초 + E24 포탑 무리: 포탑 36 · 탄 1,946 · 서벽 x 1.5 한 겹 (벌레 무리 (-58..-68,-144..-156) 에서 ~60).
  → SE 호 (포탑 무리 6 × 4 = 24 + 두 겹 벽) · 동쪽 벽 둘째 겹 · P10 서벽 둘째 겹.
  레이저 포탑: laser-turret 연구 안 됨 (research_guard --skip laser) → 안 놓음.
  탄: 망 피어싱 18 뿐 → 새 포탑 insert_plan 은 노랑 12 (망 노랑 485). 이후 채움은 ammo24 (탄 < 10 → 20, 든 종류).

규칙: 유령은 p6_24.GHOST_LUA (can_place_entity manual) · 같은 이름 건물/유령이 선 칸은 건너뜀 · 망 건설 범위 밖은 안 놓음. Lua 아이템 이동 0.
벌레 사거리 안 (둥지 쪽 포탑 크립) 은 하지 않는다 - SE 호는 둥지 (181,88) 에서 57+ 칸.

    python scripts/d24_defense.py --run run24 --faces
    python scripts/d24_defense.py --run run24 --place se,east2,p10w
    python scripts/d24_defense.py --run run24 --watch 20
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402
from client import AIBridge              # noqa: E402
from p6_24 import GHOST_LUA              # noqa: E402

CX, CY = runsite.center()
YELLOW = "firearm-magazine"


def line(a, b):
    """두 칸 중심 사이 4 연결 칸 줄 (벽이 대각선 틈 없이 이어지게)."""
    (x0, y0), (x1, y1) = (math.floor(a[0]), math.floor(a[1])), (math.floor(b[0]), math.floor(b[1]))
    n = max(abs(x1 - x0), abs(y1 - y0))
    out, prev = [], None
    for i in range(n + 1):
        c = (round(x0 + (x1 - x0) * i / max(n, 1)), round(y0 + (y1 - y0) * i / max(n, 1)))
        if prev and c[0] != prev[0] and c[1] != prev[1]:
            out.append((c[0], prev[1]))          # 대각 한 걸음 → 모서리 칸 하나 더
        out.append(c)
        prev = c
    return out


def walls(tiles, dx=0, dy=0):
    return [("stone-wall", x + dx + 0.5, y + dy + 0.5) for x, y in tiles]


def quad(cx, cy):
    return [("gun-turret", cx + dx, cy + dy) for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1))]


def se_arc():
    """동쪽 벽 끝 (134.5,7.5) → 남으로 (134.5,24.5) → 대각선 → (96.5,100.5) → 서로 구리 남벽 끝 (85.5,100.5). 바깥 (동 · 남) 에 둘째 겹."""
    s1 = line((134.5, 8.5), (134.5, 24.5))
    s2 = line((134.5, 24.5), (96.5, 100.5))
    s3 = line((96.5, 100.5), (86.5, 100.5))
    items = walls(s1) + walls(s1, dx=1) + walls(s2) + walls(s2, dx=1) + walls(s3) + walls(s3, dy=1) + [("stone-wall", 97.5 + 0.0, 101.5)]
    # 포탑 무리: 대각선 위 f 자리에서 안쪽 (북서) 8 칸
    ux, uy = -0.894, -0.447
    cs = [(128, 16)]
    for f in (0.08, 0.28, 0.48, 0.68, 0.88):
        px, py = 134.5 - 38 * f, 24.5 + 76 * f
        cs.append((round(px + 8 * ux), round(py + 8 * uy)))
    t = []
    for c in cs:
        t += quad(*c)
    return t + items, cs


FACES = {
    "se": lambda: se_arc()[0],
    # 동쪽 벽 x 134.5 (y -43.5..7.5) 둘째 겹
    "east2": lambda: walls(line((135.5, -43.5), (135.5, 7.5))),
    # P10 북쪽 구리 전초 서벽 x 1.5 (y -144.5..-82.5) 바깥 둘째 겹 - 북서 둥지 쪽
    "p10w": lambda: walls(line((0.5, -145.5), (0.5, -82.5))) + walls(line((0.5, -145.5), (20.5, -145.5))),
}

PLACE_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  %s
  local out = {placed = 0, skip = 0, nonet = 0, blocked = 0, wait = 0, plan = 0, bl = {}}
  for _, v in pairs(helpers.json_to_table('%s')) do
    local n, pos = v[1], {v[2], v[3]}
    local r = (n == "gun-turret") and 1 or 0.5
    if #s.find_logistic_networks_by_construction_area(pos, f) == 0 then out.nonet = out.nonet + 1
    elseif s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.6} > 0
        or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.6} > 0 then out.skip = out.skip + 1
    else
      local st, g = ghost(n, pos, r)
      if st == "ok" then
        out.placed = out.placed + 1
        if n == "gun-turret" then
          local ok = pcall(function() g.insert_plan = {{id = {name = "%s"}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}} end)
          if ok then out.plan = out.plan + 1 end
        end
      elseif st == "wait" then out.wait = out.wait + 1
      else
        out.blocked = out.blocked + 1
        if #out.bl < 8 then out.bl[#out.bl + 1] = n .. " " .. pos[1] .. "," .. pos[2] end
      end
    end
  end
  return out
end)()"""


def place(ai, items, ammo=YELLOW, count=12) -> dict:
    return ai.lua(PLACE_LUA % (GHOST_LUA, json.dumps([list(i) for i in items]), ammo, min(count, 100)))


# 08:5x 피어싱 10분 200 목표: 피어싱 조립기 둘을 조립기 2 로 (교체 표시) 올리니 강철은 풀리고 (망 700+) **노랑이 모자람** (노랑 조립기 하나가 포탑 채움과 나눔).
#   → 노랑 전용 조립기 2 (-96.5,-6.5) 를 피어싱 1 (-92.5,-6.5) 서쪽에 붙이고 팔 (-94.5,-6.5, 서쪽에서 집어 동쪽에 놓음) 로 바로 먹인다.
#   철은 ammo24 FEED (건설 로봇 요청). 전기 = 작은 전봇대 (-98.5,-7.5) · (-93.5,-4.5) · (-66.5,-8.5).
YEL2_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local M = defines.build_check_type.manual
  local out = {}
  local function g(n, p, d, rc)
    if s.count_entities_filtered{name = n, position = p, radius = 0.4} > 0 or s.count_entities_filtered{ghost_name = n, position = p, radius = 0.4} > 0 then return "skip" end
    if not s.can_place_entity{name = n, position = p, direction = d, force = f, build_check_type = M} then return "blocked" end
    s.create_entity{name = "entity-ghost", inner_name = n, position = p, direction = d, force = f, recipe = rc}
    return "ok"
  end
  out.asm = g("assembling-machine-2", {-96.5, -6.5}, defines.direction.north, "firearm-magazine")
  out.ins = g("inserter", {-94.5, -6.5}, defines.direction.west)
  -- 08:57 둘째: 망 노랑이 포탑 채움으로 0 근처 → 피어싱 2 (-68.5,-10.5) 에도 전용 노랑 (조립기 1 - 망에 조립기 2 가 더 없음) · 팔 (-66.5,-10.5) 동에서 집어 서에 놓음
  out.asm3 = g("assembling-machine-1", {-64.5, -10.5}, defines.direction.north, "firearm-magazine")
  out.ins3 = g("inserter", {-66.5, -10.5}, defines.direction.east)
  return out
end)()"""


# 면 재기: 방위 부채꼴 (기지 중심) 마다 포탑 수 · 탄 합 · 피어싱 포탑 · 탄 < 10 · 벽 수 · 200 안 적 유닛
FACES_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local C = {%f, %f}
  local B = {"E","SE","S","SW","W","NW","N","NE"}
  local function sect(p)
    local a = math.deg(math.atan2(p.y - C[2], p.x - C[1])) %% 360
    return B[math.floor(((a + 22.5) %% 360) / 45) + 1]
  end
  local o = {}
  for _, b in pairs(B) do o[b] = {t = 0, ammo = 0, p = 0, low = 0, w = 0, u = 0, g = 0} end
  for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f}) do
    local r, inv = o[sect(t.position)], t.get_inventory(defines.inventory.turret_ammo)
    local n = inv.get_item_count()
    r.t = r.t + 1; r.ammo = r.ammo + n
    if inv.get_item_count("piercing-rounds-magazine") > 0 then r.p = r.p + 1 end
    if n < 10 then r.low = r.low + 1 end
  end
  for _, w in pairs(s.find_entities_filtered{name = "stone-wall", force = f}) do local r = o[sect(w.position)]; r.w = r.w + 1 end
  for _, g in pairs(s.find_entities_filtered{type = "entity-ghost", force = f}) do local r = o[sect(g.position)]; r.g = r.g + 1 end
  for _, u in pairs(s.find_entities_filtered{force = "enemy", type = "unit", position = C, radius = 200}) do local r = o[sect(u.position)]; r.u = r.u + 1 end
  local ks = f.get_kill_count_statistics(s)
  local lost, killed = 0, 0
  for _, v in pairs(ks.output_counts) do lost = lost + v end
  for _, v in pairs(ks.input_counts) do killed = killed + v end
  local ps = f.get_item_production_statistics(s)
  local P = defines.flow_precision_index.ten_minutes
  return {o = o, lost = lost, killed = killed, lost_t = ks.get_output_count("gun-turret"), lost_w = ks.get_output_count("stone-wall"),
          evo = game.forces.enemy.get_evolution_factor(s), tick = game.tick,
          pierce10 = ps.get_flow_count{name = "piercing-rounds-magazine", category = "input", precision_index = P, count = true},
          yellow10 = ps.get_flow_count{name = "firearm-magazine", category = "input", precision_index = P, count = true}}
end)()"""


def faces(ai) -> dict:
    r = ai.lua(FACES_LUA % (CX, CY))
    for b in ("E", "SE", "S", "SW", "W", "NW", "N", "NE"):
        v = r["o"][b]
        print(f"  {b:2} 포탑 {v['t']:3} · 탄 {v['ammo']:5} · 피어싱 포탑 {v['p']:3} · 탄<10 {v['low']:2} · 벽 {v['w']:4} · 유령 {v['g']:3} · 200 안 적 {v['u']}")
    print(f"  진화 {r['evo']:.3f} · 잡은 것 누계 {r['killed']} · 잃은 것 누계 {r['lost']} (포탑 {r['lost_t']} · 벽 {r['lost_w']}) · "
          f"10분 피어싱 {r['pierce10']:.0f} · 노랑 {r['yellow10']:.0f}", flush=True)
    return r


def watch(ai, minutes, every=300) -> None:
    r0 = faces(ai)
    end = time.time() + minutes * 60
    while time.time() < end:
        time.sleep(min(every, max(1, end - time.time())))
        r = ai.lua(FACES_LUA % (CX, CY))
        u = {b: v["u"] for b, v in r["o"].items() if v["u"]}
        print(time.strftime("%X"), f"잡은 것 +{r['killed'] - r0['killed']} · 잃은 것 +{r['lost'] - r0['lost']} "
              f"(포탑 +{r['lost_t'] - r0['lost_t']} · 벽 +{r['lost_w'] - r0['lost_w']}) · 200 안 적 {u} · 진화 {r['evo']:.3f}", flush=True)
    faces(ai)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--faces", action="store_true")
    ap.add_argument("--place", default="")
    ap.add_argument("--count", type=int, default=12)
    ap.add_argument("--watch", type=float, default=0)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--yel2", action="store_true", help="노랑 전용 조립기 → 피어싱 1")
    a = ap.parse_args()
    ai = AIBridge()
    if a.faces:
        faces(ai)
    for k in [x for x in a.place.split(",") if x]:
        items = FACES[k]()
        n_t = sum(1 for i in items if i[0] == "gun-turret")
        if a.dry:
            print(k, "포탑", n_t, "벽", len(items) - n_t, se_arc()[1] if k == "se" else "")
            continue
        print(time.strftime("%X"), k, "포탑", n_t, "벽", len(items) - n_t, place(ai, items, count=a.count), flush=True)
    if a.yel2:
        print("yel2", ai.lua(YEL2_LUA))
    if a.watch:
        watch(ai, a.watch)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""서쪽 방어선 탄 - 23회차 서쪽 새 둥지 (x -181..-206, y -16..-34 · 둥지 5 · 대형 웜) 의 20~27 마리 물결.

실측 (2026-09-27, tick 13.96M) - 지시와 다른 것:
    · 서쪽 줄은 이미 «벨트 급탄» 이다. y=-46.5 서향 -> 분배기 (-111.5,-46) -> ① x=-113.5 남향 (포탑 x=-116 y -34..50 ·
      팔 x=-114.5 동쪽에서 집음) -> y=54.5 동향 (남쪽 줄) ② y=-46.5 서향 (서북 4 대 (-118/-124, -49/-44) · 팔 y -47.5/-45.5).
      서북 다리 x=-110 y -102..-72 는 p29 북쪽 탄 벨트 x=-107.5 (북향) 에서 팔 x=-108.5 가 먹인다.
    · 포탑이 마른 진짜 이유: 서쪽 탄약 조립기 (-78.5,-49.5) 가 철 0 (item_ingredient_shortage). 긴팔 (-78.5,-51.5) 이 집는
      (-78.5,-53.5) 는 IB 기둥 x=-78.5 (북향, 조립기 «반대쪽» 으로 흐른다) 의 꼬리 칸이라 아무것도 안 온다 - 철판 줄 y=-54.5 (동향)
      은 한 칸 아래 (-78.5,-54.5) 에 옆치기로 들어가 꼬리를 지나지 않는다. 그래서 탄 벨트 머리 ~65 칸이 비고, 남쪽 끝에만 옛 탄이 남았다.
    · 북쪽 탄약 조립기 (-87.5,-67.5) 는 full_output - 북쪽 벨트가 끝까지 차 남는다.
    · 부서진 채 유령만: 포탑 (-124,-49) (-124,-44) (-110,-102) · 팔 (-118.5,-45.5) · 벨트 (-118.5/-119.5,-46.5) -> 로봇 창고가 비어 못 짓는다.

고치기:
    A IB 고리: (-79.5,-54.5) 를 남향으로 돌리고 (-79.5,-53.5) 동향 -> 철판 줄이 (-79.5,-53.5)·(-78.5,-53.5) 로 돌아 긴팔 앞을 지난다.
      긴팔 하나 더 (-79.5,-51.5) (2.4 철/s ≥ 조립기 1형 2 철/s).
    B 북쪽 여분을 서쪽으로: 북쪽 탄 벨트 (-105.5,-70.5) 를 분배기 (-105.5,-70.0) 로 - 출력 우선 = 오른쪽 (북, 기존 북쪽 줄).
      왼쪽 (남) -> x=-106.5 남향 가지 (y -69.5..-47.5) -> (-106.5,-46.5) 서쪽 탄 벨트에 북쪽 옆치기. 북쪽이 차 있을 때만 흐른다.
    C 가지 곁 새 포탑 3 (-109, -66/-60/-54) - 서북 다리 (-110,-72) 와 서북 줄 (-118,-49) 사이 23 칸 구멍. 팔 (-107.5, y-0.5) E · 전봇대 (-107.5, y+0.5).
      새 포탑 (-116,-39) - (-118,-44) 과 (-116,-34) 사이. 팔 (-114.5,-39.5) E · 전봇대 (-114.5,-37.5).
    D 로봇 창고 (-108.5,-38.5) 에 포탑 3 · 팔 1 · 벨트 2 -> 유령 6 을 로봇이 다시 짓는다 (사람은 x -120 서쪽에 안 간다).

    python scripts/wammo23.py                     # 조사: 벨트 따라가기 · 계획 · 막힌 자리
    python scripts/wammo23.py --who bravo,alpha   # 짓기 (bravo = 포탑 가방 · IB · 로봇 창고, alpha = 분배기)
    python scripts/wammo23.py --verify            # 서쪽 포탑 탄 · 벨트 탄 수
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit  # noqa: E402

N, E, S, W = 0, 4, 8, 12
GUN, BELT, INS, LONG, POLE, SPLIT = "gun-turret", p1.BELT, p1.INS, "long-handed-inserter", p1.POLE, "splitter"
MAG = "firearm-magazine"
p1.COST.setdefault(LONG, {"iron-plate": 7, "copper-plate": 1.5})
PARK = (-58.5, -78.5)
STORE = (-108.5, -38.5)
BOX = ((-127, -110), (-104, 56))              # 서쪽 줄 (포탑 · 벨트) 보는 칸

NEW_GUNS = [(-109, -66), (-109, -60), (-109, -54), (-116, -39)]
BRANCH_X, BRANCH_Y0, BRANCH_Y1 = -106.5, -69.5, -47.5
SPLIT_AT = (-105.5, -70.0)
IB_TURN, IB_NEW, IB_ARM = (-79.5, -54.5), (-79.5, -53.5), (-79.5, -51.5)
STOCK = {GUN: 3, INS: 1, BELT: 2}             # 유령 6 (포탑 3 · 팔 1 · 벨트 2)


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def build_steps() -> list:
    """포탑 먼저 (alpha 몫 - 가방에 미리 만든다) -> 전봇대 -> 팔 -> 가지 벨트."""
    out = [p1.b(GUN, x, y) for x, y in NEW_GUNS + [(-110, -102)]]   # (-110,-102) 유령은 로봇 범위 (y>-68) 밖
    out += [p1.b(POLE, -107.5, y + 0.5) for x, y in NEW_GUNS[:3]] + [p1.b(POLE, -114.5, -37.5)]
    out += [p1.b(INS, -107.5, y - 0.5, E) for x, y in NEW_GUNS[:3]] + [p1.b(INS, -114.5, -39.5, E)]
    y = BRANCH_Y0
    while y <= BRANCH_Y1:
        out.append(p1.b(BELT, BRANCH_X, y, S))
        y += 1
    return out


# ------------------------------------------------------------------ 게임 읽기

TRACE_LUA = """(function() local s, o = game.surfaces[1], {}
  local e = s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, position = {%f, %f}, radius = 0.3}[1]
  local seen, n = {}, 0
  while e and not seen[e.unit_number] and n < 600 do
    n = n + 1 seen[e.unit_number] = true
    local c = 0
    for l = 1, e.get_max_transport_line_index() do c = c + e.get_transport_line(l).get_item_count('%s') end
    o[#o+1] = string.format('%%s|%%.1f|%%.1f|%%d|%%d', e.name, e.position.x, e.position.y, e.direction, c)
    if e.type == 'underground-belt' and e.belt_to_ground_type == 'input' then e = e.neighbours
    else e = e.belt_neighbours.outputs[1] end
  end
  return o end)()"""


def trace(ai, x, y) -> list:
    out = []
    for r in rows(ai.lua(TRACE_LUA % (x, y, MAG))):
        n, bx, by, d, c = str(r).split("|")
        out.append((n, float(bx), float(by), int(d), int(c)))
    return out


def show_trace(ai, x, y, label) -> None:
    t = trace(ai, x, y)
    segs, cur = [], None
    for n, bx, by, d, c in t:
        k = (n if n != BELT else "", d)
        if cur is None or cur[0] != k:
            cur = [k, (bx, by), (bx, by), 0, 0]
            segs.append(cur)
        cur[2] = (bx, by)
        cur[3] += c
        cur[4] += 1
    arrow = {N: "N", E: "E", S: "S", W: "W"}
    print(f"  [{label}] {len(t)} 칸 · 탄 {sum(c for *_, c in t)}")
    for (n, d), a, b, mags, cnt in segs:
        print(f"      {n or 'belt':16s} {arrow.get(d, d)} {a} -> {b}  ({cnt} 칸, 탄 {mags})")


STATE_LUA = """(function() local s, o = game.surfaces[1], {}
  for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player', area = {{%d, %d}, {%d, %d}}}) do
    local fed = 0
    for _, i in pairs(s.find_entities_filtered{type = 'inserter', force = 'player', area = {{t.position.x - 2, t.position.y - 2}, {t.position.x + 2, t.position.y + 2}}}) do
      if i.drop_target == t then fed = fed + 1 end end
    o[#o+1] = string.format('G|%%.0f|%%.0f|%%d|%%d|%%d', t.position.x, t.position.y, t.get_inventory(defines.inventory.turret_ammo).get_item_count(), fed, t.health) end
  for _, g in pairs(s.find_entities_filtered{type = 'entity-ghost', force = 'player', area = {{%d, %d}, {%d, %d}}}) do
    o[#o+1] = string.format('H|%%.1f|%%.1f|%%s', g.position.x, g.position.y, g.ghost_name) end
  for _, p in pairs({{-78.5, -49.5}, {-87.5, -67.5}}) do
    local a = s.find_entity('assembling-machine-1', p)
    if a then local st = '?' for k, v in pairs(defines.entity_status) do if v == a.status then st = k end end
      o[#o+1] = string.format('A|%%.1f|%%.1f|%%s|%%d|%%d', p[1], p[2], st, a.products_finished, a.get_inventory(defines.inventory.assembling_machine_input).get_item_count('iron-plate')) end end
  local b = s.find_entities_filtered{type = 'transport-belt', position = {%f, %f}, radius = 0.3}[1]
  o[#o+1] = 'T|' .. (b and b.direction or -1)
  local sp = s.find_entities_filtered{name = 'splitter', position = {%f, %f}, radius = 0.3}[1]
  o[#o+1] = 'S|' .. (sp and sp.splitter_output_priority or 'none')
  local c = s.find_entity('storage-chest', {%f, %f})
  if c then for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do o[#o+1] = 'C|' .. v.name .. '|' .. v.count end end
  return o end)()"""


def state(ai) -> dict:
    (x1, y1), (x2, y2) = BOX
    r = ai.lua(STATE_LUA % (x1, y1, x2, y2, x1, y1, x2, y2, IB_TURN[0], IB_TURN[1], SPLIT_AT[0], SPLIT_AT[1], STORE[0], STORE[1]))
    out = {"guns": [], "ghosts": [], "am": [], "ib_dir": -1, "split": "none", "store": {}}
    for line in rows(r):
        k, *v = str(line).split("|")
        if k == "G":
            out["guns"].append((int(v[0]), int(v[1]), int(v[2]), int(v[3]), int(v[4])))
        elif k == "H":
            out["ghosts"].append((float(v[0]), float(v[1]), v[2]))
        elif k == "A":
            out["am"].append((float(v[0]), float(v[1]), v[2], int(v[3]), int(v[4])))
        elif k == "T":
            out["ib_dir"] = int(v[0])
        elif k == "S":
            out["split"] = v[0]
        elif k == "C":
            out["store"][v[0]] = int(v[1])
    out["guns"].sort(key=lambda g: (g[0], g[1]))
    return out


def belt_mags(ai) -> dict:
    """구간별 탄 (벨트 위)."""
    segs = {"서쪽 머리 y=-46.5 (x -106..-79)": (-106.5, -78.5, -46.5, -46.5), "서북 줄 y=-46.5 (x -126..-113)": (-126, -113, -46.5, -46.5),
            "서쪽 줄 x=-113.5": (-113.5, -113.5, -45.5, 54.5), "가지 x=-106.5": (-106.5, -106.5, -69.5, -47.5),
            "북쪽 먹임 x=-107.5": (-107.5, -107.5, -105.5, -70.5)}
    out = {}
    for k, (x1, x2, y1, y2) in segs.items():
        out[k] = ai.lua("""(function() local s, n, c = game.surfaces[1], 0, 0
          for _, e in pairs(s.find_entities_filtered{type = {'transport-belt', 'splitter', 'underground-belt'}, area = {{%f, %f}, {%f, %f}}}) do
            c = c + 1 for l = 1, e.get_max_transport_line_index() do n = n + e.get_transport_line(l).get_item_count('%s') end end
          return {c .. '칸 탄 ' .. n} end)()""" % (x1 - 0.4, y1 - 0.4, x2 + 0.4, y2 + 0.4, MAG))
        out[k] = rows(out[k])[0] if rows(out[k]) else "?"
    return out


def report(ai, st=None) -> None:
    st = st or state(ai)
    guns = st["guns"]
    fed = [g for g in guns if g[3] > 0]
    print(f"  서쪽 포탑 {len(guns)} (벨트 팔 달린 것 {len(fed)}) · 탄 합 {sum(g[2] for g in guns)}")
    for g in guns:
        print(f"      ({g[0]:4d},{g[1]:4d}) 탄 {g[2]:3d}  팔 {g[3]}  hp {g[4]}")
    for a in st["am"]:
        print(f"  탄약 조립기 {a[:2]} {a[2]} · 누적 {a[3]} · 철 {a[4]}")
    print(f"  IB 모서리 방향 {st['ib_dir']} (고침 = {S}) · 분배기 {st['split']} · 로봇 창고 {st['store']} · 유령 {st['ghosts']}")
    for k, v in belt_mags(ai).items():
        print(f"  {k}: {v}")


# ------------------------------------------------------------------ 짓기

def poll_all(ai, ids, limit=900) -> None:
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(6)
        try:
            if all(ai.poll(t)["status"] in ("done", "failed", "cancelled") for t in ids):
                return
        except RconError:
            pass


def hub_take(hub, item, n) -> list:
    x, y, c = hub[item]
    return [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": item, "x": x, "y": y, "count": min(n, c)})]


def prep_alpha(ai, st, bag) -> list:
    """분배기 교체 (포탑은 bravo 가방에 이미 있다 - build_stage 에서 앞 절반을 bravo 가 맡는다)."""
    if st["split"] != "none":
        return []
    hub = p1.hub(ai)
    plan = []
    if int(bag.get(SPLIT, 0)) < 1:
        plan += hub_take(hub, "iron-plate", 30) + hub_take(hub, "copper-plate", 15)
        plan.append(("craft", {"recipe": SPLIT, "count": 1, "wait": True}))
    plan += [("walk_to", {"x": -102.5, "y": -72.5}),
             ("demolish", {"x": -105.5, "y": -70.5, "name": BELT, "search_radius": 0.3}),
             p1.b(SPLIT, SPLIT_AT[0], SPLIT_AT[1], W)]
    return plan


def prep_bravo(ai, st, bag) -> list:
    """IB 고리 (벨트 돌리기 · 새 벨트 · 긴팔) + 로봇 창고 채우기."""
    hub = p1.hub(ai)
    ghost = {}
    for _x, _y, n in st["ghosts"]:
        ghost[n] = ghost.get(n, 0) + 1
    stock = {k: max(0, ghost.get(k, 0) - st["store"].get(k, 0)) for k in STOCK}
    ib = st["ib_dir"] != S
    arm = ai.lua("(function() return game.surfaces[1].find_entity('%s', {%f, %f}) and {1} or {0} end)()" % (LONG, IB_ARM[0], IB_ARM[1]))
    arm = rows(arm)[:1] == [1]
    need = {GUN: stock[GUN], INS: stock[INS], BELT: stock[BELT] + (2 if ib else 0), LONG: 0 if arm else 1}
    need = {k: max(0, v - int(bag.get(k, 0))) for k, v in need.items()}
    iron = 40 * need[GUN] + 4 * need[INS] + 2 * need[BELT] + 7 * need[LONG]
    cu = 10 * need[GUN] + 2 * need[INS] + 2 * need[LONG]
    plan = []
    if iron:
        plan += hub_take(hub, "iron-plate", iron + 10) + hub_take(hub, "copper-plate", cu + 5)
    for k in (GUN, INS, LONG):
        if need[k]:
            plan.append(("craft", {"recipe": k, "count": need[k], "wait": True}))
    if need[BELT]:
        plan.append(("craft", {"recipe": BELT, "count": (need[BELT] + 1) // 2, "wait": True}))
    if ib:
        plan += [("walk_to", {"x": -80.5, "y": -56.5}),
                 ("demolish", {"x": IB_TURN[0], "y": IB_TURN[1], "name": BELT, "search_radius": 0.3}),
                 p1.b(BELT, IB_TURN[0], IB_TURN[1], S), p1.b(BELT, IB_NEW[0], IB_NEW[1], E)]
    if not arm:
        plan += [p1.b(LONG, IB_ARM[0], IB_ARM[1], N)]
    items = [(k, n) for k, n in stock.items() if n]
    if items:
        plan.append(("walk_to", {"x": STORE[0] + 2, "y": STORE[1] + 1.5}))
        plan += [("insert", {"name": k, "x": STORE[0], "y": STORE[1], "count": n}) for k, n in items]
    return plan


def fixes(ai, crew) -> None:
    for n_round in range(4):
        st = state(ai)
        ids = []
        for who in crew:
            fn = prep_alpha if who == "alpha" else prep_bravo
            try:
                bag = ai.agent(who).items()
            except RconError:
                bag = {}
            plan = fn(ai, st, bag)
            if not plan:
                continue
            plan.append(("walk_to", {"x": PARK[0], "y": PARK[1]}))
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            got = submit(ai, who, plan, strict=False)
            print(f"{who}: 고치기 {n_round + 1}순번 {len(plan)} 단계")
            ids += list(got or [])
        if not ids:
            break
        poll_all(ai, ids)
        set_priority(ai)
    set_priority(ai)


def set_priority(ai) -> None:
    """분배기 출력 우선 = 오른쪽 (서향이면 북쪽 = 기존 북쪽 탄 줄). 가지는 북쪽이 찼을 때 넘치는 것만."""
    r = ai.lua("""(function() local sp = game.surfaces[1].find_entities_filtered{name = 'splitter', position = {%f, %f}, radius = 0.3}[1]
      if not sp then return {'none'} end sp.splitter_output_priority = 'right' return {sp.splitter_output_priority} end)()""" % SPLIT_AT)
    print(f"  분배기 우선 {rows(r)}")


def survey(ai) -> None:
    show_trace(ai, -78.5, -46.5, "서쪽 탄 벨트 (조립기 (-78.5,-49.5) 출력)")
    show_trace(ai, -112.5, -46.5, "분배기 서북 출력")
    show_trace(ai, -87.5, -70.5, "북쪽 탄 벨트 (조립기 (-87.5,-67.5) 출력)")
    show_trace(ai, -79.5, -54.5, "IB 철판 줄 끝")
    report(ai)
    steps = build_steps()
    nb = sum(1 for k, _ in steps if k == "build")
    print(f"  짓기 {len(p1.standing(ai, steps))}/{nb} · 막힘 {p1.blocked(ai, steps)}")
    print(f"  고치기: IB {IB_TURN}->S · {IB_NEW} E · 긴팔 {IB_ARM} N · 분배기 {SPLIT_AT} W (우선 right) · 로봇 창고 {STOCK}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.verify:
        report(ai)
        return 0
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        survey(ai)
        return 0
    os.environ[detached.ENV] = "wammo23"
    detached.mark(crew, "wammo23", minutes=90)
    p1.PARK = PARK
    try:
        fixes(ai, crew)
        p1.build_stage(ai, crew, build_steps(), "wammo", rounds=12)
    finally:
        detached.release(crew)
    report(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

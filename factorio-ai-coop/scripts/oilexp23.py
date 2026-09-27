"""남쪽 유전 펌프잭 증설 - delta 한 명이 운송 회랑을 따라 걸어가 짓는다.

    사용자 (2026-09-27): "남쪽 유전 펌프잭 증설 — 내가 하지 않고 캐릭터 1명을 운송 라인을 따라
                         이동시켜 증설하도록 시켜"  (이번에 한해 벽 밖 이동 허가)

유전 (-71,378) 은 로봇망 밖이다. 기존 펌프잭 2대 (-72.5,373.5)(-69.5,381.5), 원유 27/s.
빈 원유 자리 (-75.5,385.5)(-69.5,388.5) 에 2대를 더 세우고 기존 관 (-68.5,379.5) 에 잇는다.
유전 서·남은 벨트 급탄 포탑 11대가 있고 동쪽이 비어 x=-60 에 포탑 3대를 보탠다.

회랑: 기지 → x≈-13 (벨트 x=-15, 지하관 x=-13, 전봇대 x=-12) 를 따라 y≈360 까지 남하 → 서쪽 유전.
회랑에서 적 구조물은 모두 80칸 이상 떨어져 있다 (2026-09-27 19:50 실측).

안전: 체력 < 150 이면 중단·귀환. 다음 구간 40칸 안에 무리(5+ 또는 big/behemoth) 가 있으면 대기.
      적 구조물 50칸 안의 경유점은 쓰지 않는다. 부활하지 않는다. jevloop 도망은 막지 않는다.

    python -u scripts/oilexp23.py measure       # 원유·가스 10분 생산 (로그에 남김)
    python -u scripts/oilexp23.py go            # 출정 전체 (준비 → 이동 → 건설 → 귀환 → 10분 뒤 측정)
"""
import argparse
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import orders  # noqa: E402

WHO = "delta"
OWNER = "oilexp23"
LOG = os.path.join(os.path.dirname(__file__), "..", "state", "oilexp23.log")

HOME = (-80.5, -45.5)
# 회랑 경유점 (기지 → 유전). 벨트 x=-15 동쪽 한 칸 떨어져 걷는다.
CORRIDOR = [(-40.5, -20.5), (-9.5, 10.5), (-9.5, 60.5), (-9.5, 110.5), (-9.5, 160.5),
            (-9.5, 210.5), (-9.5, 260.5), (-9.5, 310.5), (-9.5, 355.5), (-40.5, 362.5),
            (-62.5, 380.5)]

# 재료 (기지 안)
TAKES = [("iron-plate", (-81.5, -52.5), 320),        # 수동 공급 상자 3,547
         ("firearm-magazine", (-84.5, -68.5), 70),   # 저장 상자 256
         ("copper-plate", (-23.5, -8.5), 90)]        # 철 상자 2,745 (회랑 가는 길)
CRAFTS = [("pumpjack", 2), ("pipe", 30), ("gun-turret", 3), ("repair-pack", 6),
          ("small-electric-pole", 2)]                # 전봇대 레시피 1회 = 2개

N = 0  # defines.direction.north
JACKS = [(-75.5, 385.5), (-69.5, 388.5)]
PIPES = [(-74.5, 383.5), (-74.5, 382.5), (-74.5, 381.5), (-74.5, 380.5), (-74.5, 379.5),
         (-73.5, 379.5), (-72.5, 379.5), (-71.5, 379.5), (-70.5, 379.5), (-69.5, 379.5),
         (-68.5, 386.5), (-67.5, 386.5), (-67.5, 385.5), (-67.5, 384.5), (-67.5, 383.5),
         (-67.5, 382.5), (-67.5, 381.5), (-67.5, 380.5), (-67.5, 379.5)]
POLES = [(-72.5, 383.5), (-71.5, 387.5)]
TURRETS = [(-60, 376), (-60, 383), (-60, 390)]
AMMO_EACH = 20

HP_ABORT = 150
PACK_RADIUS = 40
WORM_KEEP = 50


def log(msg: str) -> None:
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


FLOW = """(function() local s = game.surfaces[1]
  local P = game.forces.player.get_fluid_production_statistics(s)
  local function c(n, cat) return P.get_flow_count{name = n, category = cat,
     precision_index = defines.flow_precision_index.ten_minutes, count = true} end
  local j = {}
  for _, e in pairs(s.find_entities_filtered{name = 'pumpjack', position = {-71, 380}, radius = 30}) do
    j[#j+1] = string.format('%.1f,%.1f st=%d', e.position.x, e.position.y, e.status) end
  return {crude = c('crude-oil', 'input'), gas = c('petroleum-gas', 'input'), jacks = j, tick = game.tick}
end)()"""


def measure(ai) -> dict:
    r = ai.lua(FLOW)
    jacks = r.get("jacks") or []
    jacks = list(jacks.values()) if isinstance(jacks, dict) else jacks
    crude, gas = r["crude"] / 600.0, r["gas"] / 600.0
    log(f"측정 tick {r['tick']}: 원유 {crude:.1f}/s, 석유가스 {gas:.1f}/s (10분 평균), 펌프잭 {len(jacks)}: {jacks}")
    return {"crude": crude, "gas": gas, "jacks": jacks}


# 구간 위험: 점들 둘레 PACK_RADIUS 안의 적 유닛(중복 없이) 과 WORM_KEEP 안의 적 구조물
THREAT = """(function() local s = game.surfaces[1]
  local seen, n, big, w = {}, 0, 0, 0
  local nest = 999
  for _, p in pairs({%s}) do
    for _, e in pairs(s.find_entities_filtered{type = 'unit', force = 'enemy', position = p, radius = %d}) do
      if not seen[e.unit_number] then
        seen[e.unit_number] = true
        n = n + 1
        if string.find(e.name, 'big') or string.find(e.name, 'behemoth') then big = big + 1 end
      end
    end
    for _, e in pairs(s.find_entities_filtered{type = {'turret', 'unit-spawner'}, force = 'enemy', position = p, radius = %d}) do
      local d = math.sqrt((e.position.x - p[1])^2 + (e.position.y - p[2])^2)
      if d < nest then nest = d end
    end
  end
  return {n = n, big = big, nest = nest}
end)()"""


def threat(ai, a, b) -> dict:
    d = math.hypot(b[0] - a[0], b[1] - a[1])
    k = max(1, int(d // 12))
    pts = [(a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k) for i in range(k + 1)]
    body = ", ".join("{%.1f, %.1f}" % p for p in pts)
    return ai.lua(THREAT % (body, PACK_RADIUS, WORM_KEEP))


def me(ai) -> dict:
    return ai.agent(WHO).status()


def idle(st) -> bool:
    q = st.get("queued")
    return not st.get("current") and not (q if not isinstance(q, dict) else list(q.values()))


class Abort(RuntimeError):
    pass


def guard(ai) -> dict:
    st = me(ai)
    if not st.get("alive", True):
        raise Abort("delta 사망")
    if float(st.get("health", 0)) < HP_ABORT:
        raise Abort(f"체력 {st.get('health')} < {HP_ABORT}")
    return st


def wait_plan(ai, what: str, timeout: float) -> dict:
    """큐가 빌 때까지 매초 본다. 체력 문턱이면 Abort."""
    t0 = time.time()
    fled0 = me(ai).get("fled", 0)
    while time.time() - t0 < timeout:
        time.sleep(1.0)
        st = guard(ai)
        if st.get("fled", 0) != fled0:
            log(f"  {what}: jevloop 도망 ({st.get('flee_last', {}).get('by')}) - 끊김")
            return st
        if idle(st):
            return st
    log(f"  {what}: {timeout:.0f}s 안에 안 끝남")
    return me(ai)


def walk(ai, points, what: str, hold_max: float = 600) -> None:
    """경유점마다 위험을 보고 한 구간씩 보낸다. 도망·대기 뒤에는 같은 구간을 다시."""
    i = 0
    tries = 0
    while i < len(points):
        st = guard(ai)
        here = (st["x"], st["y"])
        goal = points[i]
        if math.hypot(goal[0] - here[0], goal[1] - here[1]) < 7:   # footing 이 목적지를 몇 칸 옮길 수 있다
            i += 1
            tries = 0
            continue
        t = threat(ai, here, goal)
        if t["nest"] < WORM_KEEP:
            raise Abort(f"구간 {here}->{goal} 적 구조물 {t['nest']:.0f}칸")
        if t["n"] >= 5 or t["big"] > 0:
            log(f"  {what}: 구간 {i} 앞 무리 n={t['n']} big={t['big']} - 대기")
            waited = 0
            while waited < hold_max:
                time.sleep(10)
                waited += 10
                guard(ai)
                t = threat(ai, here, goal)
                if t["n"] < 5 and t["big"] == 0:
                    break
            else:
                raise Abort(f"구간 {i} 무리가 {hold_max:.0f}s 동안 안 비킴")
            log(f"  {what}: 구간 {i} 비었음 ({waited}s 대기)")
        tries += 1
        if tries > 4:
            raise Abort(f"구간 {i} {goal} 에 네 번 못 감")
        orders.submit(ai, WHO, [("walk_to", {"x": goal[0], "y": goal[1], "tolerance": 2})], strict=False)
        st = wait_plan(ai, f"{what} 구간 {i}", 240)
        log(f"  {what}: 구간 {i} -> ({st['x']:.0f},{st['y']:.0f}) hp {st.get('health')}")


def run(ai, steps, what: str, timeout: float) -> dict:
    orders.submit(ai, WHO, steps, strict=False)
    st = wait_plan(ai, what, timeout)
    log(f"  {what}: 끝 ({st['x']:.0f},{st['y']:.0f}) hp {st.get('health')}")
    return st


CHECK = """(function() local s = game.surfaces[1] local o = {jacks = {}, turrets = {}}
  local base = s.find_entities_filtered{name = 'pumpjack', position = {-69.5, 381.5}, radius = 0.6}[1]
  local seg0 = base and base.fluidbox.get_fluid_segment_id(1)
  for _, p in pairs({%s}) do
    local e = s.find_entities_filtered{name = 'pumpjack', position = p, radius = 0.6}[1]
    if e then
      local fb = e.fluidbox[1]
      o.jacks[#o.jacks+1] = string.format('%%.1f,%%.1f st=%%d same_net=%%s oil=%%s', e.position.x, e.position.y, e.status,
        tostring(seg0 ~= nil and e.fluidbox.get_fluid_segment_id(1) == seg0), fb and math.floor(fb.amount) or 0)
    else o.jacks[#o.jacks+1] = string.format('%%.1f,%%.1f 없음', p[1], p[2]) end
  end
  for _, p in pairs({%s}) do
    local t = s.find_entities_filtered{name = 'gun-turret', position = p, radius = 0.8}[1]
    o.turrets[#o.turrets+1] = t and string.format('%%.0f,%%.0f ammo=%%d', t.position.x, t.position.y,
      t.get_inventory(defines.inventory.turret_ammo).get_item_count()) or string.format('%%.0f,%%.0f 없음', p[1], p[2])
  end
  return o end)()"""


def check_site(ai) -> dict:
    r = ai.lua(CHECK % (", ".join("{%s, %s}" % p for p in JACKS), ", ".join("{%s, %s}" % p for p in TURRETS)))
    for k in ("jacks", "turrets"):
        v = r.get(k) or []
        r[k] = list(v.values()) if isinstance(v, dict) else v
    return r


def go(ai, settle: float) -> int:
    detached.mark([WHO], owner=OWNER, minutes=60)
    ai.agent(WHO).cancel()
    before = measure(ai)
    log("출정 시작 - delta 재료 준비")
    try:
        # 1. 재료: 철·탄은 기지 서쪽, 구리는 회랑 가는 길. 제작은 걸으면서 돈다.
        prep = []
        for item, (x, y), n in TAKES[:2]:
            prep += [("take", {"name": item, "x": x, "y": y, "count": n})]
        prep += [("walk_to", {"x": -24.5, "y": -6.5, "tolerance": 3}),
                 ("take", {"name": TAKES[2][0], "x": TAKES[2][1][0], "y": TAKES[2][1][1], "count": TAKES[2][2]})]
        prep += [("craft", {"recipe": r, "count": n}) for r, n in CRAFTS]
        run(ai, prep, "준비", 300)
        inv = ai.agent(WHO).items()
        log(f"  가방: { {k: inv.get(k, 0) for k in ('iron-plate', 'copper-plate', 'steel-plate', 'firearm-magazine', 'pumpjack', 'pipe', 'gun-turret', 'repair-pack', 'small-electric-pole')} }")

        # 2. 이동
        walk(ai, CORRIDOR, "남하")

        # 3. 건설: 포탑 먼저 (동쪽 빈 면), 그다음 펌프잭·관·전봇대
        build = []
        for x, y in TURRETS:
            build += [("build", {"name": "gun-turret", "x": x, "y": y, "direction": N}),
                      ("insert", {"name": "firearm-magazine", "x": x, "y": y, "count": AMMO_EACH})]
        build += [("build", {"name": "pumpjack", "x": x, "y": y, "direction": N}) for x, y in JACKS]
        build += [("build", {"name": "pipe", "x": x, "y": y}) for x, y in PIPES]
        build += [("build", {"name": "small-electric-pole", "x": x, "y": y}) for x, y in POLES]
        guard(ai)
        run(ai, build, "건설", 400)
        time.sleep(5)
        site = check_site(ai)
        log(f"  현장: 펌프잭 {site['jacks']} / 포탑 {site['turrets']}")
        missing = [s for s in site["jacks"] + site["turrets"] if "없음" in s]
        if missing:
            log(f"  빠진 것 {missing} - 한 번 더")
            run(ai, build, "건설 재시도", 400)
            site = check_site(ai)
            log(f"  현장(재): 펌프잭 {site['jacks']} / 포탑 {site['turrets']}")
    except Abort as e:
        log(f"중단: {e}")
        st = me(ai)
        if not st.get("alive", True):
            log("delta 사망 - 부활하지 않음. 기록만.")
            detached.release([WHO])
            return 2
    except Exception as e:  # noqa: BLE001
        log(f"오류: {type(e).__name__}: {e}")

    # 4. 귀환 (중단이든 완료든)
    try:
        st = me(ai)
        back = [p for p in reversed(CORRIDOR[:-1]) if p[1] < st["y"] + 5] + [HOME]
        walk(ai, back, "귀환", hold_max=900)
        log(f"귀환 완료 ({me(ai)['x']:.0f},{me(ai)['y']:.0f})")
    except Exception as e:  # noqa: BLE001
        log(f"귀환 문제: {type(e).__name__}: {e}")
    finally:
        detached.release([WHO])

    # 5. 10분 뒤 재측정
    if settle > 0:
        log(f"{settle:.0f}s 뒤 재측정")
        time.sleep(settle)
        after = measure(ai)
        log(f"전후: 원유 {before['crude']:.1f} -> {after['crude']:.1f}/s, "
            f"가스 {before['gas']:.1f} -> {after['gas']:.1f}/s")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["measure", "go", "check"])
    ap.add_argument("--settle", type=float, default=600)
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "measure":
        measure(ai)
        return 0
    if a.cmd == "check":
        log(f"현장: {check_site(ai)}")
        return 0
    return go(ai, a.settle)


if __name__ == "__main__":
    raise SystemExit(main())

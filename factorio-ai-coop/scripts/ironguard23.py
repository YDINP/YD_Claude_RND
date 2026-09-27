"""철 전초 (-210,-244) 수비 보완 - 23회차. delta 가 로보포트 · 저장 상자 · 포탑을 들고 나가 깐다.

    사용자 (2026-09-27): "북서쪽 철광석 식민지 수비 보완 더 해야 할 듯?"

전초는 기지 로봇망 밖이라 포탑 2대(관통탄 40)가 급탄 · 수리 없이 서 있었다. 남쪽 유전(oilport23)과 같은 방식:
  로보포트 (-202,-237) - 기존 전봇대 (-204.5,-240.5) 공급 범위 안이라 새 전봇대가 필요 없다.
  저장 상자 (-199.5,-236.5) - 수리팩 · 탄. raidwatch23 이 탄<5 포탑에 이 망 기준 proxy 를 건다.
  건설 로봇 10 - 기지 로보포트 (2,30) 대기 23 에서.
  물류 사각(반경 25)에 전초 포탑 7대 전부, 건설 사각(반경 55)에 채굴기 · 벨트 머리 ~ y=-182.
포탑: 전초 5대 추가(북서 · 서 · 북 · 북동 · 남서), 벨트 중간 2대 (-158,-196),(-158,-204) - 건설 사각 안이라 수리는 된다(급탄은 안 됨).
재료는 망 밖 넘친 상자 · 막힌 출력칸 위주: 고급회로 45 = 로보포트 조립기 (34.5,-38.5) 입력칸 90 중,
  강철 55 = 강철 화로 (-76,-59) 출력(100 막힘), 톱니 100 = (-14.5,-66.5) 출력(100 막힘), 철 = 넘친 상자 (9.5,-5.5) + 망 480.
탄: 망 탄을 다 빼면 기지 포탑 급탄이 끊기므로 망 일반탄 150 · 관통탄 110 만 가져가고 나머지는 철로 손제작.

안전 · 이동 · 도주는 ironoutpost23 의 walk/guard/run 을 쓴다 (체력 150 미만 · 30칸 안 적 유닛 → 중단 · 귀환, 부활 안 함).

    python -u scripts/ironguard23.py survey
    python -u scripts/ironguard23.py go
    python -u scripts/ironguard23.py check
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import ironoutpost23 as io  # noqa: E402

WHO, OWNER = io.WHO, "ironguard23"
io.LOG = os.path.join(HERE, "..", "state", "ironguard23.log")
log, rows, N = io.log, io.rows, io.N
TUR = "gun-turret"
PR, FM = "piercing-rounds-magazine", "firearm-magazine"

ROBO = (-202, -237)
CHEST = (-199.5, -236.5)
ROBOTS, PACKS_IN_PORT = 10, 20
OLD_TURRETS = [(-213, -246), (-203, -251)]
# (x, y, 탄 종류, 개수) - 둥지가 있던 북서 · 서쪽에 관통탄
NEW_TURRETS = [(-216, -253, PR, 50), (-218, -240, PR, 40), (-209, -255, FM, 50),
               (-196, -253, FM, 40), (-212, -234, FM, 40)]
BELT_TURRETS = [(-158, -196, FM, 50), (-158, -204, FM, 50)]
OLD_TOPUP = 10               # 관통탄 40 → 50

TAKES = [(PR, (-60.5, -33.5), 110),
         (FM, (-84.5, -68.5), 150),
         ("iron-plate", (-83.5, -52.5), 480),
         ("steel-plate", (-76, -59), 55),
         ("iron-gear-wheel", (-14.5, -66.5), 100),
         ("advanced-circuit", (34.5, -38.5), 45),
         ("repair-pack", (36.5, -8.5), 60),
         ("iron-plate", (9.5, -5.5), 441),
         ("electronic-circuit", (8.5, 3.5), 5),
         ("copper-plate", (22.5, -4.5), 26),
         ("copper-plate", (4.5, 32.5), 29),
         ("construction-robot", (2, 30), ROBOTS)]
N_TUR = len(NEW_TURRETS) + len(BELT_TURRETS)
CRAFTS = [("roboport", 1), ("storage-chest", 1), (TUR, N_TUR), (FM, 185)]
KEYS = ("roboport", "storage-chest", TUR, "construction-robot", "repair-pack", FM, PR, "iron-plate", "copper-plate")

# 전초까지: ironoutpost23 의 바깥 벨트 옆 길, 벨트 중간에서 한 번 선다.
WALK_TO_MID = [(-112.5, -118.5), (-150.5, -117.5), (-152.5, -160.5), (-152.5, -200.5)]
WALK_TO_OUT = [(-152.5, -240.5), (-190.5, -247.5), (-200.5, -243.5)]


def spots():
    s = [("roboport", ROBO[0], ROBO[1], N), ("storage-chest", CHEST[0], CHEST[1], N)]
    s += [(TUR, x, y, N) for x, y, _, _ in NEW_TURRETS + BELT_TURRETS]
    return s


def survey(ai):
    blob = ";".join("%s,%s,%s,%s" % t for t in spots())
    r = ai.lua(io.SURVEY % ((blob,) + io.OUTPOST * 3))
    r["bad"], r["obst"] = rows(r.get("bad")), sorted(set(rows(r.get("obst"))))
    return r


SITE = """(function() local s = game.surfaces[1] local o = {}
  local r = s.find_entities_filtered{name = 'roboport', position = {%d, %d}, radius = 1}[1]
  if r then local n = r.logistic_network
    o.robo = {energy = math.floor(r.energy), robots = r.get_inventory(defines.inventory.roboport_robot).get_item_count(),
      packs = r.get_inventory(defines.inventory.roboport_material).get_item_count(),
      net_robots = n and n.all_construction_robots or 0, net_id = n and n.network_id or -1} end
  local c = s.find_entities_filtered{name = 'storage-chest', position = {%f, %f}, radius = 0.6}[1]
  if c then local m = {} for _, it in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do m[it.name] = it.count end o.chest = m end
  local t = {}
  for _, p in pairs({%s}) do
    local e = s.find_entities_filtered{name = 'gun-turret', position = p, radius = 0.8}[1]
    if e then local inv = e.get_inventory(defines.inventory.turret_ammo)
      local net = s.find_logistic_network_by_position(e.position, 'player')
      t[#t + 1] = string.format('%%.0f,%%.0f %%s=%%d hp%%d net=%%s', e.position.x, e.position.y,
        inv.is_empty() and '-' or inv[1].name:sub(1, 4), inv.get_item_count(), e.health, net and net.network_id or 'x')
    else t[#t + 1] = string.format('%%.0f,%%.0f 없음', p[1], p[2]) end
  end
  o.turrets = t
  o.spawner = #s.find_entities_filtered{type = 'unit-spawner', force = 'enemy', position = {-210, -244}, radius = 100}
  o.units = #s.find_entities_filtered{type = 'unit', force = 'enemy', position = {-210, -244}, radius = 80}
  return o end)()"""


def site(ai):
    pts = OLD_TURRETS + [(x, y) for x, y, _, _ in NEW_TURRETS + BELT_TURRETS]
    r = ai.lua(SITE % (ROBO[0], ROBO[1], CHEST[0], CHEST[1], ", ".join("{%s, %s}" % p for p in pts)))
    r["turrets"] = rows(r.get("turrets"))
    return r


def wait_crafted(ai, need, timeout=420):
    """로보포트 · 상자 · 포탑이 나올 때까지 (탄 제작은 걸으며 계속)."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        io.guard(ai)
        inv = ai.agent(WHO).items()
        if all(inv.get(k, 0) >= n for k, n in need.items()):
            log(f"  핵심 제작 끝 ({time.time() - t0:.0f}s)")
            return inv
        time.sleep(5)
    log("  핵심 제작 대기 시간 초과")
    return ai.agent(WHO).items()


def turret_steps(group, inv):
    """가진 만큼만: 포탑 수 · 탄 수가 모자라면 뒤쪽을 줄인다."""
    steps, have = [], {PR: inv.get(PR, 0) - 10, FM: inv.get(FM, 0), TUR: inv.get(TUR, 0)}
    for x, y, kind, n in group:
        if have[TUR] < 1:
            log(f"  포탑 모자람 - ({x},{y}) 건너뜀")
            continue
        if have[kind] < n:
            kind = FM if kind == PR else kind
        n = min(n, have[kind])
        have[TUR] -= 1
        steps.append(("build", {"name": TUR, "x": x, "y": y, "direction": N}))
        if n > 0:
            have[kind] -= n
            steps.append(("insert", {"name": kind, "x": x, "y": y, "count": n}))
    return steps, have


def go(ai):
    sv = survey(ai)
    hard = [b for b in sv["bad"] if not b.endswith(" obst")]
    log(f"사전: 적 {sv['enemy']} 놓기 ok {sv['ok']} 서 있음 {sv['standing']} 막힘 {hard} 장애물 {len(sv['obst'])}")
    if sv["enemy"]["spawner"] or sv["enemy"]["worm"] or hard:
        log("출정 안 함")
        return 1
    detached.mark([WHO], owner=OWNER, minutes=90)
    ai.agent(WHO).cancel()
    try:
        prep = [("take", {"name": n, "x": p[0], "y": p[1], "count": c}) for n, p, c in TAKES]
        prep += [("craft", {"recipe": r, "count": c}) for r, c in CRAFTS]
        io.run(ai, prep, "준비", 900)
        inv = wait_crafted(ai, {"roboport": 1, "storage-chest": 1, TUR: N_TUR})
        log(f"  가방: { {k: inv.get(k, 0) for k in KEYS} }")
        if inv.get("roboport", 0) < 1 or inv.get("storage-chest", 0) < 1:
            raise io.Abort("로보포트/저장 상자 제작 실패")

        io.walk(ai, WALK_TO_MID, "출정")
        inv = ai.agent(WHO).items()
        steps, _ = turret_steps(BELT_TURRETS, inv)
        steps = io.clear_steps(sv["obst"], ((-161, -207), (-155, -193))) + steps
        io.run(ai, steps, "벨트 포탑", 240)

        io.walk(ai, WALK_TO_OUT, "전초로")
        inv = ai.agent(WHO).items()
        build = io.clear_steps(sv["obst"], ((-221, -258), (-193, -231)))
        build += [("build", {"name": "roboport", "x": ROBO[0], "y": ROBO[1], "direction": N}),
                  ("insert", {"name": "construction-robot", "x": ROBO[0], "y": ROBO[1],
                              "count": inv.get("construction-robot", 0)}),
                  ("insert", {"name": "repair-pack", "x": ROBO[0], "y": ROBO[1], "count": PACKS_IN_PORT}),
                  ("build", {"name": "storage-chest", "x": CHEST[0], "y": CHEST[1]})]
        tsteps, have = turret_steps(NEW_TURRETS, inv)
        build += tsteps
        top = min(OLD_TOPUP, have[PR] // len(OLD_TURRETS))
        if top > 0:
            build += [("insert", {"name": PR, "x": x, "y": y, "count": top}) for x, y in OLD_TURRETS]
            have[PR] -= top * len(OLD_TURRETS)
        build += [("insert", {"name": "repair-pack", "x": CHEST[0], "y": CHEST[1],
                              "count": inv.get("repair-pack", 0) - PACKS_IN_PORT})]
        if have[FM] - 10 > 0:
            build += [("insert", {"name": FM, "x": CHEST[0], "y": CHEST[1], "count": have[FM] - 10})]
        if have[PR] > 0:
            build += [("insert", {"name": PR, "x": CHEST[0], "y": CHEST[1], "count": have[PR]})]
        io.guard(ai)
        io.run(ai, build, "전초 설치", 400)
        # 걸으며 끝난 탄 제작분까지 상자로
        inv = ai.agent(WHO).items()
        extra = inv.get(FM, 0) - 10
        if extra > 0:
            io.run(ai, [("insert", {"name": FM, "x": CHEST[0], "y": CHEST[1], "count": extra})], "남은 탄", 120)
        time.sleep(5)
        log(f"  현장: {site(ai)}")
    except io.Abort as e:
        log(f"중단: {e}")
        if not io.me(ai).get("alive", True):
            log("delta 사망 - 부활하지 않음. 기록만.")
            detached.release([WHO])
            return 2
    except Exception as e:  # noqa: BLE001
        log(f"오류: {type(e).__name__}: {e}")

    try:
        st = io.me(ai)
        back = [(-112.5, -118.5), io.HOME] if st["y"] < -112 else [io.HOME]
        if st["x"] < -150 and st["y"] < -120:
            back = [(-152.5, st["y"]), (-150.5, -117.5)] + back
        io.walk(ai, back, "귀환", hold_max=900, check=False)
        log(f"귀환 완료 ({io.me(ai)['x']:.0f},{io.me(ai)['y']:.0f}) hp {io.me(ai).get('health')}")
    except Exception as e:  # noqa: BLE001
        log(f"귀환 문제: {type(e).__name__}: {e}")
    finally:
        detached.release([WHO])
    time.sleep(30)
    log(f"30초 뒤 현장: {site(ai)}")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["survey", "go", "check"])
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "survey":
        sv = survey(ai)
        log(f"survey: enemy {sv['enemy']} ok {sv['ok']} standing {sv['standing']} bad {sv['bad']} obst {sv['obst']}")
        return 0
    if a.cmd == "check":
        log(f"현장: {site(ai)}")
        return 0
    return go(ai)


if __name__ == "__main__":
    raise SystemExit(main())

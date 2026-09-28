"""돌 통로 고정 로보포트 사슬 - 돌 Phase 2 재개 (docs/outpost-mining-plan-run23.md §10).

copperchain23 방식: 망 끝 로보포트 건설 범위 안에 다음 로보포트 유령 -> 로봇이 짓고 망이 늘어난다. 캐릭터 0.
돌 본선 전봇대 x=-93.5 (67.5..319.5, 망 2 전력) 옆 x=-99.

    S0 (-100,75)  망 2 로보포트 (-67,28) 에서 체비셰프 47 (키트 로보포트 (-114,74) 가 옮겨 가도 이어짐)
    S1 (-99,120) · S2 (-99,165) · S3 (-99,210) · S4 (-99,255) · S5 (-99,300)  (45 간격 - 자리 보정 4 칸 여유)
    S6 (-132,306) 돌 전초 (레이저 8 · 기관총 6) 북쪽 - 건설 범위 55 가 전초 전체를 덮는다 (수리)
각 기지: check -> build (전봇대 · 로보포트 유령) -> rp -> ring (레이저 4 + 기관총 2, 광석 위 X,
         빈 벨트 칸 y=318.5 x -117.5..-92.5 자리 비움) -> ammo -> done.  (copperchain23 의 SURVEY · POLES · STATUS 재사용)
state/arty_goal.json = {"x": -229, "y": 363} (서쪽 무리). 사슬 로보포트가 '키트 아닌 망 로보포트' 다리가 되어
    artyaim23 -> artykit23.start_move 가 키트 (방어선 먼저 -> 대포) 를 통로 따라 뛰어 옮긴다 (19:18 (-131.5,126.5) -> (-89.5,216.5)).
벨트 감시 (belt): 빈 칸 중심 (-105,318.5) 반경 150 적 구조물 0 · 유닛 0 이 30 분 이어지면 벨트 유령 26 (로봇).

    python -u scripts/stonechain23.py --check     # 드라이런
    python -u scripts/stonechain23.py             # 상주 (20 초)
상태 state/stonechain23.json, 로그 state/stonechain23.log.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import artykit23  # noqa: E402
import copperchain23 as cc  # noqa: E402  SURVEY · POLES · STATUS

STATE = os.path.join(HERE, "..", "state", "stonechain23.json")
LOG = os.path.join(HERE, "..", "state", "stonechain23.log")
SITES = [("S0", [-100, 75]), ("S1", [-99, 120]), ("S2", [-99, 165]), ("S3", [-99, 210]),
         ("S4", [-99, 255]), ("S5", [-99, 300]), ("S6", [-132, 306])]
GAP = [(-117.5 + i, 318.5) for i in range(26)]  # 빈 벨트 칸 (동향, 마지막 (-92.5,318.5) 은 모퉁이 북향 - 20:57 동향으로 놓아 손으로 돌림)
GAP_C = (-105, 318.5)
CLEAR_S = 1800
RING_N = 6
LASERS = {0, 1, 2, 3}

# copperchain23.RING + 광석 위 X
RING = cc.RING.replace(
    "if free(q, 1) and ok(laser and 'laser-turret' or 'gun-turret', q) then",
    "if free(q, 1) and ok(laser and 'laser-turret' or 'gun-turret', q) and s.count_entities_filtered{type = 'resource', area = {{q[1] - 1, q[2] - 1}, {q[1] + 1, q[2] + 1}}} == 0"
    " and s.count_entities_filtered{type = 'entity-ghost', area = {{q[1] - 2.5, q[2] - 2.5}, {q[1] + 2.5, q[2] + 2.5}}} == 0 then")  # 19:35 S3 기관총이 키트 대포 유령 위에 서서 대포가 못 섬
assert RING != cc.RING

TREES = """(function() local s = game.surfaces[1] local P = {%s, %s} local o = {n = 0, left = 0}
  for _, e in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{P[1] - 7, P[2] - 7}, {P[1] + 7, P[2] + 7}}}) do
    o.left = o.left + 1 if not e.to_be_deconstructed() then e.order_deconstruction('player') o.n = o.n + 1 end end
  return o end)()"""

CLEAR = """(function() local s = game.surfaces[1] local P = {%s, %s}
  return {st = s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = P, radius = 150},
          un = s.count_entities_filtered{force = 'enemy', type = 'unit', position = P, radius = 150}} end)()"""

BELT = """(function() local s = game.surfaces[1] local o = {real = 0, ghost = 0, made = 0}
  for _, q in pairs({%s}) do
    if s.find_entities_filtered{name = 'transport-belt', position = q, radius = 0.4}[1] then o.real = o.real + 1
    elseif s.find_entities_filtered{ghost_name = 'transport-belt', position = q, radius = 0.4}[1] then o.ghost = o.ghost + 1
    elseif %s then
      for _, e in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{q[1] - 0.6, q[2] - 0.6}, {q[1] + 0.6, q[2] + 0.6}}}) do
        if not e.to_be_deconstructed() then e.order_deconstruction('player') end end
      if s.create_entity{name = 'entity-ghost', inner_name = 'transport-belt', position = q, direction = (q[1] > -93 and defines.direction.north or defines.direction.east), force = 'player', expires = false} then o.made = o.made + 1 end
    end
  end return o end)()"""


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"sites": {k: {"at": p, "stage": "check"} for k, p in SITES}, "goal": 0, "clear_since": None, "belt": "wait"}


def save(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


_l = cc._l
GAP_SKIP = [["gap", x, y] for x, y in GAP]


def place_ring(ai, site, n, lasers):
    rp = site["rp"]
    lz = ", ".join("1" if i in lasers else "0" for i in range(n))
    r = ai.lua(RING % (rp[0], rp[1], n, lz, ", ".join("{%s, %s}" % (q[1], q[2]) for q in GAP_SKIP)))
    ring = [_l(x) for x in _l(r.get("ring"))]
    rows = ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in ring]
    rows += ["{'small-electric-pole', %s, %s}" % (x[3], x[4]) for x in ring if x[0] == "laser-turret"]
    return ring, r.get("face"), artykit23.ghosts(ai, rows)


def tick(ai, st, dry=False):
    for name, _ in SITES:
        site = st["sites"][name]
        stage = site["stage"]
        if stage == "done":
            if site.get("ring"):
                s = cc.ring_status(ai, site)
                if s.get("req"):
                    log("%s 링 탄 보충 %s" % (name, s["req"]))
                if s["built"] + s["ghost"] < len(site["ring"]) and not dry:  # 부서진 포탑 다시
                    artykit23.ghosts(ai, ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in site["ring"]])
            continue
        sv = ai.lua(cc.SURVEY % tuple(site["at"]))
        if stage == "check":
            why = []
            if sv.get("enemy"):
                why.append("반경 50 적 구조물 %s" % sv["enemy"])
            if (sv.get("units") or 0) > 2:
                why.append("반경 60 적 유닛 %s" % sv["units"])
            if not sv.get("rp"):  # 19:26 S4 (-99,255) 숲 - manual_ghost 검사는 나무에 막힌다 -> 둘레 나무 · 바위 해체 표시 (로봇)
                t = ai.lua(TREES % tuple(site["at"])) if not dry else {}
                why.append("로보포트 자리 없음 (나무 해체 표시 %s · 남은 %s)" % (t.get("n"), t.get("left")))
            elif sv.get("bd", 1e9) > 48 and sv.get("built") != 1:
                why.append("앞 망 로보포트 체비셰프 %s > 48" % sv.get("bd"))
            if why:
                return "%s 대기: %s" % (name, " · ".join(why))
            site["rp"] = _l(sv["rp"])
            p = ai.lua(cc.POLES % tuple(site["rp"]))
            if p.get("err"):
                return "%s 전봇대 줄 실패: %s" % (name, p["err"])
            poles = [_l(x) for x in _l(p.get("poles"))]
            corners = [_l(x) for x in _l(p.get("corners"))]
            if dry:
                return "%s 드라이런: 로보포트 %s (다리 %s, 체비셰프 %s) · 전봇대 %d (%s 에서) + 모서리 %d · 재고 %s" % (
                    name, site["rp"], sv.get("bridge"), sv.get("bd"), len(poles), p.get("src"), len(corners), sv.get("stock"))
            rows = ["{'small-electric-pole', %s, %s}" % (q[0], q[1]) for q in poles + corners]
            rows.append("{'roboport', %s, %s}" % tuple(site["rp"]))
            g = artykit23.ghosts(ai, rows)
            site.update(stage="rp", poles=poles, corners=corners, t=time.time())
            return "%s 유령: 로보포트 %s (다리 %s, 체비셰프 %s) · 전봇대 %d + 모서리 %d · 만듦 %s · 실패 %s" % (
                name, site["rp"], sv.get("bridge"), sv.get("bd"), len(poles), len(corners), g.get("made"), _l(g.get("fail")))
        if dry:
            return "%s 단계 %s" % (name, stage)
        if stage == "rp":
            if sv.get("built") == 1 and sv.get("power") and sv.get("rnet") == sv.get("net"):
                lasers = LASERS if (sv.get("stock") or {}).get("laser", 0) >= 10 else {1, 4}
                ring, face, g = place_ring(ai, site, RING_N, lasers)
                site.update(stage="ring", ring=ring, t=time.time())
                return "%s 로보포트 섬 (망 %s) -> 포탑 링 %d (적 방향 %s도, 레이저 %d) 유령 %s" % (
                    name, sv["rnet"], len(ring), face, sum(1 for x in ring if x[0] == "laser-turret"), g.get("made"))
            if sv.get("built") == -1:
                site["stage"] = "check"
                return "%s 로보포트 유령 없음 -> 다시 조사" % name
            if time.time() - site.get("t", 0) > 600 and int(time.time()) % 300 < 20:
                return "%s 로보포트 대기 %d분 (섬 %s · 전력 %s · 망 %s)" % (name, (time.time() - site["t"]) // 60, sv.get("built"), sv.get("power"), sv.get("rnet"))
            return None
        if stage == "ring":
            s = cc.ring_status(ai, site)
            need = min(RING_N, len(site["ring"]))
            if s["built"] >= need and s["loaded"] >= s["gun"] and s["lpow"] >= s["laser"]:
                site["stage"] = "done"
                return "%s 링 완료: 포탑 %d (기관 %d 탄 든 %d · 레이저 %d 전력 %d) -> 다음 기지" % (
                    name, s["built"], s["gun"], s["loaded"], s["laser"], s["lpow"])
            if s["built"] + s["ghost"] < len(site["ring"]):
                artykit23.ghosts(ai, ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in site["ring"]]
                                 + ["{'small-electric-pole', %s, %s}" % (x[3], x[4]) for x in site["ring"] if x[0] == "laser-turret"])
            return "%s 링 %d/%d · 탄 요청 %d" % (name, s["built"], len(site["ring"]), s["req"]) if s.get("req") else None
    return "ALL_DONE"


def belt_watch(ai, st):
    if st.get("belt") == "done":
        return None
    c = ai.lua(CLEAR % GAP_C)
    now = time.time()
    if c.get("st") or c.get("un"):
        if st.get("clear_since"):
            st["clear_since"] = None
            return "벨트 감시: 빈 칸 반경 150 적 구조물 %s · 유닛 %s -> 30 분 시계 다시" % (c.get("st"), c.get("un"))
        return None
    if not st.get("clear_since"):
        st["clear_since"] = now
        return "벨트 감시: 빈 칸 반경 150 적 0 - 30 분 시계 시작"
    if now - st["clear_since"] < CLEAR_S:
        return None
    rows = ", ".join("{%s, %s}" % q for q in GAP)
    b = ai.lua(BELT % (rows, "true"))
    if b.get("real", 0) >= len(GAP):
        st["belt"] = "done"
        return "벨트 26 칸 이어짐 (로봇) - 적 0 %d분 유지 뒤" % ((now - st["clear_since"]) // 60)
    if st.get("belt") != "ghost":
        st["belt"] = "ghost"
        return "벨트 유령 26: 만듦 %s · 이미 %s · 유령 %s (적 0 %d분)" % (b.get("made"), b.get("real"), b.get("ghost"), (now - st["clear_since"]) // 60)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--every", type=float, default=20)
    a = ap.parse_args()
    ai = AIBridge()
    st = load()
    if a.check:
        print(tick(ai, json.loads(json.dumps(st)), dry=True))
        print(ai.lua(CLEAR % GAP_C))
        return 0
    log("stonechain23 시작 · " + " · ".join("%s %s" % (k, v["stage"]) for k, v in st["sites"].items()))
    while True:
        try:
            m = tick(ai, st)
            if m == "ALL_DONE":
                if not st.get("goal"):  # arty_goal.json 은 19:21 손으로 {-229,363} (키트가 사슬을 다리로 이미 뛰어 감 - prefer 안 씀)
                    st["goal"] = 1
                    log("S0~S6 전부 섬 - 상주: 링 탄 보충 · 부서진 포탑 다시 · 벨트 감시")
            elif m:
                log(m)
            m = belt_watch(ai, st)
            if m:
                log(m)
            save(st)
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

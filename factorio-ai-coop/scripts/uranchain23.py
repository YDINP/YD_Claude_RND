"""우라늄 통로 고정 로보포트 사슬 - docs/outpost-mining-plan-run23.md §11 (우라늄 Phase 3).

stonechain23 방식: 망 끝 로보포트 건설 범위 안에 다음 로보포트 유령 -> 로봇이 짓고 망이 늘어난다 (통로만, 캐릭터 0).
전초 (채굴기 · 방어 · 원심분리기) 는 캐릭터 (uranout23.py).

    U1 (-145,80)  망 2 S0 (-100,75) 에서 체비셰프 44, 전력 F1 줄 y=61.5
    U2 (-190,80)  F1 석탄 채굴지 북동
    U3 (-235,92)  F1 서쪽 - 대포 키트가 이 다리로 (-240,100) 부근에 서면 우라늄 둥지가 사거리 안
    U4 (-280,98) · U5 (-325,100) · U6 (-368,90)  대포가 치운 뒤 (반경 50 적 구조물 0 · 60 유닛 <= 2)
각 기지: check -> rp -> ring (레이저 4 + 기관총 2) -> done. state/arty_goal.json = {"x": -391, "y": 106}.

    python -u scripts/uranchain23.py --check     # 드라이런
    python -u scripts/uranchain23.py             # 상주 (20 초)
상태 state/uranchain23.json, 로그 state/uranchain23.log.
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
import copperchain23 as cc  # noqa: E402  SURVEY · POLES · ring_status
import stonechain23 as sc  # noqa: E402  RING (광석 위 X · 유령 위 X) · TREES

STATE = os.path.join(HERE, "..", "state", "uranchain23.json")
LOG = os.path.join(HERE, "..", "state", "uranchain23.log")
SITES = [("U1", [-145, 80]), ("U2", [-190, 80]), ("U3", [-235, 92]),
         ("U4", [-280, 98]), ("U5", [-325, 100]), ("U6", [-368, 90])]
RING_N = 6
LASERS = {0, 1, 2, 3}
_l = cc._l


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
        return {"sites": {k: {"at": p, "stage": "check"} for k, p in SITES}, "goal": 0}


def save(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def place_ring(ai, site, n, lasers):
    rp = site["rp"]
    lz = ", ".join("1" if i in lasers else "0" for i in range(n))
    r = ai.lua(sc.RING % (rp[0], rp[1], n, lz, ""))
    ring = [_l(x) for x in _l(r.get("ring"))]
    rows = ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in ring]
    rows += ["{'small-electric-pole', %s, %s}" % (x[3], x[4]) for x in ring if x[0] == "laser-turret"]
    return ring, r.get("face"), artykit23.ghosts(ai, rows)


def tick(ai, st, dry=False):
    for name, _ in SITES:
        site = st["sites"][name]
        stage = site["stage"]
        if stage == "done":
            if site.get("ring") and not dry:
                s = cc.ring_status(ai, site)
                if s["built"] + s["ghost"] < len(site["ring"]):  # 부서진 포탑 다시
                    artykit23.ghosts(ai, ["{'%s', %s, %s}" % (x[0], x[1], x[2]) for x in site["ring"]])
            continue
        sv = ai.lua(cc.SURVEY % tuple(site["at"]))
        if stage == "check":
            why = []
            if sv.get("enemy"):
                why.append("반경 50 적 구조물 %s" % sv["enemy"])
            if (sv.get("units") or 0) > 2:
                why.append("반경 60 적 유닛 %s" % sv["units"])
            if not sv.get("rp"):
                t = ai.lua(sc.TREES % tuple(site["at"])) if not dry else {}
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--every", type=float, default=20)
    a = ap.parse_args()
    ai = AIBridge()
    st = load()
    if a.check:
        print(tick(ai, json.loads(json.dumps(st)), dry=True))
        return 0
    log("uranchain23 시작 · " + " · ".join("%s %s" % (k, v["stage"]) for k, v in st["sites"].items()))
    last = None
    while True:
        try:
            m = tick(ai, st)
            if m == "ALL_DONE":
                if not st.get("goal"):
                    st["goal"] = 1
                    log("U1~U6 전부 섬 - 상주: 부서진 포탑 다시")
            elif m and m != last:
                log(m)
            last = m
            save(st)
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

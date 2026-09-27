"""run23 병렬 A - 철 흐름 (계획서 2-3 · 2-4 · 2-7) + 서벽 나머지 조사.

    python scripts/par_a23.py metrics
    python scripts/par_a23.py build [--go]   # 2-4 강철 긴팔 → 허브 상자 · 모듈 벨트 탭 → 쇠 상자(1칸 제한)
    python scripts/par_a23.py mods  [--go]   # 2-7 모듈 상자 → 철 채굴기 (잔량 큰 순) 생산성 모듈 1 × 3

사람은 delta 만 (대기열 빈 때). 로그 state/par_a.log.
"""
import argparse
import json
import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import rebuild23 as R  # noqa: E402
from client import AIBridge  # noqa: E402
from orders import submit  # noqa: E402

OWNER = "par_a"
WHO = "delta"
LOG = os.path.join(HERE, "..", "state", "par_a.log")
N, E, S, W = 0, 4, 8, 12

STEEL_LHI = (-73.5, -54.5)          # 강철 벨트 x=-73.5 머리 (-73.5,-56.5) → 허브 상자 (-73.5,-52.5)
MOD_INS = (-67.5, -53.5)            # 모듈 벨트 x=-68.5 → 동쪽 상자
MOD_BOX = (-66.5, -53.5)
# 잔량 큰 철 채굴기 (2026-09-27 조사, 5x5 영역 잔량)
MOD_DRILLS = [(-116.5, -12.5), (-116.5, -18.5), (-117.5, -15.5), (-117.5, -21.5),
              (-111.5, -16.5), (-117.5, -9.5), (-121.5, -11.5)]


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def run_plan(ai, plan, label, timeout=900):
    detached.mark([WHO], OWNER, minutes=30)
    try:
        ag = ai.agent(WHO)
        if ag.busy():
            say("%s: delta 대기열이 비지 않음 - 보류" % label)
            return False
        ids = submit(ai, WHO, plan, strict=False)
        if not ids:
            say("%s: 보내지 못함" % label)
            return False
        t0, bad, pending = time.time(), [], list(ids)
        while pending and time.time() - t0 < timeout:
            time.sleep(2)
            still = []
            for i in pending:
                st = ag.poll(i)
                s = st.get("status")
                if s in ("done", "unknown"):
                    continue
                if s in ("failed", "cancelled"):
                    bad.append((st.get("type"), st.get("error")))
                    continue
                still.append(i)
            pending = still
        if pending:
            say("%s: 시간 초과 (남은 %d)" % (label, len(pending)))
            ag.cancel()
            return False
        if bad:
            say("%s: 실패 단계 %s" % (label, bad[:6]))
            return False
        return True
    finally:
        detached.release([WHO])


def st_metrics(ai, go):
    m = R.metrics(ai)
    say("수치 (10분 평균 생산/소비 per 분) %s" % json.dumps(m, ensure_ascii=False))


def box_bar(ai, xy, slots):
    return ai.lua("""(function() local e = game.surfaces[1].find_entities_filtered{name = 'iron-chest', position = {%s, %s}, radius = 0.1}[1]
      if not e then return {err = 'none'} end
      local iv = e.get_inventory(defines.inventory.chest) iv.set_bar(%d)
      return {bar = iv.get_bar(), n = iv.get_item_count('productivity-module')} end)()""" % (xy[0], xy[1], slots + 1))


def st_build(ai, go):
    items = [("long-handed-inserter",) + STEEL_LHI + (N,), ("inserter",) + MOD_INS + (W,), ("iron-chest",) + MOD_BOX + (0,)]
    print(R.can_place(ai, items))
    if not go:
        return
    say("build 시작: 2-4 강철 긴팔 %s (x=-73.5 머리 → 허브 상자 (-73.5,-52.5)) · 모듈 탭 %s → 쇠 상자 %s (1칸=50)" % (STEEL_LHI, MOD_INS, MOD_BOX))
    plan = [R.craft("long-handed-inserter", 1), R.craft("inserter", 1), R.craft("iron-chest", 1),
            R.walk(-70.5, -55.5),
            R.b("long-handed-inserter", STEEL_LHI[0], STEEL_LHI[1], N),
            R.b("iron-chest", MOD_BOX[0], MOD_BOX[1]),
            R.b("inserter", MOD_INS[0], MOD_INS[1], W)]
    ok = run_plan(ai, plan, "build", timeout=600)
    say("  상자 제한: %s" % box_bar(ai, MOD_BOX, 1))
    time.sleep(20)
    R.show(ai, -74, -55, -73, -52)
    R.show(ai, -68, -54, -66, -53)
    say("build %s" % ("완료" if ok else "부분"))


def drill_mods(ai):
    blob = ";".join("%s,%s" % xy for xy in MOD_DRILLS)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local d = s.find_entities_filtered{type = 'mining-drill', position = {tonumber(x), tonumber(y)}, radius = 0.1}[1]
        o[#o+1] = bit .. " " .. (d and tostring(d.get_module_inventory().get_item_count()) or "none") end
      return o end)()""" % blob)
    return R.rows(r)


def st_mods(ai, go):
    have = drill_mods(ai)
    print(have)
    need = sum(3 - int(h.split()[1]) for h in have if h.split()[1] != "none")
    box = box_bar(ai, MOD_BOX, 1)
    print("need", need, "box", box)
    if not go or need <= 0:
        return
    th = R.threat_west(ai)
    if th["near"] > 0:
        say("mods 보류: 서쪽 근접 적 %s" % th)
        return
    n = min(need, box.get("n", 0))
    if n <= 0:
        say("mods 보류: 상자 모듈 0")
        return
    say("mods 시작: 생산성 모듈 %d → 철 채굴기 %d대 (위협 %s)" % (n, len(MOD_DRILLS), th))
    plan = [R.walk(-65.5, -55.5), R.take("productivity-module", MOD_BOX[0], MOD_BOX[1], n)]
    left = n
    for xy, h in zip(MOD_DRILLS, have):
        c = h.split()[1]
        if c == "none" or left <= 0:
            continue
        k = min(3 - int(c), left)
        if k > 0:
            plan.append(R.put("productivity-module", xy[0], xy[1], k))
            left -= k
    plan.append(R.walk(-86.5, -39.5))
    ok = run_plan(ai, plan, "mods", timeout=900)
    say("mods %s: %s" % ("완료" if ok else "부분", drill_mods(ai)))


STAGES = {"metrics": st_metrics, "build": st_build, "mods": st_mods}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage")
    ap.add_argument("--go", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    for s in a.stage.split(","):
        STAGES[s](ai, a.go)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

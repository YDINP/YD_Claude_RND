"""노랑 자급 감시 - 23회차 (2026-09-27, 사용자: "대포 연구 최대한 빨리" -> 노랑 ~12/분을 재고 소모 없이).

yellow23 --feed (먹이 고리) · accel23 곁에서 도는 작은 고리. 사람은 state/yellow23_orders.json 으로만 부린다.
  · 석탄: 석탄 벨트 끝 (-1.5,-32.5) 에 화력 팔 (-1.5,-31.5) -> 상자 (-1.5,-30.5) (자급 1차에 지음).
    플라스틱 공장 둘 (11.5,10.5)(16.5,10.5) 의 석탄 상자 (10.5,13.5)(15.5,13.5) 가 비면 빈 제작꾼이 옮긴다.
    (정유 (23.5,11.5) 가스가 full_output 이던 까닭 = 이 둘이 석탄 0 이었다.)
  · 플라스틱: 두 공장 결과 상자 (11.5,13.5)(16.5,13.5) 가 쌓이면 동쪽 고급회로 2형 (y=-32.5) 중 플라스틱이 모자란 곳에 손으로.
  · 10분마다 '자급 측정' (처리장치 · 저밀도 · 노랑 · 고급회로 · 플라스틱 · 구리 10분 생산/소비, artillery 진척, 단위/분).
  · 먹이 고리 · accel23 이 끝나면 (로그 '먹이 고리 끝' / '가속 감시 끝') 같은 옵션으로 다시 띄운다.

    python scripts/self23.py --minutes 240
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path[:0] = [os.path.join(ROOT, "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge, RconError  # noqa: E402
import yellow23 as Y  # noqa: E402

MAKERS = ["hotel", "foxtrot", "charlie", "echo", "bravo", "alpha"]
COAL_CHEST = (-1.5, -30.5)
PL_COAL = [(10.5, 13.5), (15.5, 13.5)]
PL_OUT = [(11.5, 13.5), (16.5, 13.5)]
AC_EAST = [(13.5, -32.5), (21.5, -32.5), (25.5, -32.5), (33.5, -32.5)]
TO_PL = [Y.walk(1.5, -16.0), Y.walk(8.5, -13.5), Y.walk(8.5, -2.0), Y.walk(10.5, 0.0), Y.walk(14.0, 6.0)]
FROM_PL = [Y.walk(10.5, 0.0), Y.walk(8.5, -2.0), Y.walk(8.5, -13.5)]
FEED_CMD = ["scripts/yellow23.py", "--feed", "--who", "golf,alpha,bravo,charlie,echo,foxtrot,hotel", "--minutes", "180"]
ACCEL_CMD = ["scripts/accel23.py", "--minutes", "125"]

PROBE = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local function ch(x, y) return s.find_entities_filtered{type = 'container', position = {x, y}, radius = 0.4}[1] end
  local function am(x, y) return s.find_entities_filtered{type = 'assembling-machine', position = {x, y}, radius = 0.6}[1] end
  local function cnt(e, n) return e and e.get_inventory(defines.inventory.chest).get_item_count(n) or -1 end
  local function inp(e, n) return e and e.get_inventory(defines.inventory.assembling_machine_input).get_item_count(n) or -1 end
  local o = {plcoal = {}, plout = {}, acpl = {}, ldscu = {}}
  o.coal = cnt(ch(%f, %f), 'coal')
  for _, p in pairs({%s}) do o.plcoal[#o.plcoal + 1] = cnt(ch(p[1], p[2]), 'coal') end
  for _, p in pairs({%s}) do o.plout[#o.plout + 1] = cnt(ch(p[1], p[2]), 'plastic-bar') end
  for _, p in pairs({%s}) do o.acpl[#o.acpl + 1] = inp(am(p[1], p[2]), 'plastic-bar') end
  for _, p in pairs({{7.5, -45.5}, {4.5, -47.5}}) do o.ldscu[#o.ldscu + 1] = inp(am(p[1], p[2]), 'copper-plate') end
  local st = f.get_item_production_statistics(s)
  local p10 = defines.flow_precision_index.ten_minutes
  o.p10 = {}
  for _, n in pairs({'utility-science-pack', 'processing-unit', 'low-density-structure', 'advanced-circuit', 'electronic-circuit',
                     'plastic-bar', 'copper-plate', 'chemical-science-pack'}) do
    o.p10[n] = math.floor(st.get_flow_count{name = n, category = 'input', precision_index = p10, count = true}) .. '/' ..
               math.floor(st.get_flow_count{name = n, category = 'output', precision_index = p10, count = true})
  end
  o.research = f.current_research and f.current_research.name or 'none'
  o.progress = f.research_progress
  o.tick = game.tick
  return o
end)()"""


def lua_pts(pts):
    return ", ".join("{%s, %s}" % p for p in pts)


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def orders():
    try:
        with open(Y.ORDERS, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def pending_has(pending, item):
    return any(st[1].get("name") == item and st[0] in ("take", "insert") for w in pending for st in pending[w])


def idle_maker(ai, pending):
    live = {w["name"]: w for w in ai.list()}
    for w in MAKERS:
        if w in live and live[w].get("alive", True) and not (live[w].get("current") or live[w].get("queued")) and w not in pending:
            return w
    return next((w for w in MAKERS if w in live and w not in pending), None)


def log_ended(marker, since):
    """state/yellow23.log 에서 since 이후 marker 줄이 있나 (고리가 스스로 끝남)."""
    try:
        with open(Y.LOG, encoding="utf-8") as fh:
            lines = fh.readlines()[-400:]
    except OSError:
        return False
    today = time.strftime("%H:%M:%S", time.localtime(since))
    return any(marker in ln and ln[:8] >= today for ln in lines)


def relaunch(cmd, out):
    fh = open(os.path.join(ROOT, "state", out), "a", encoding="utf-8")
    flags = 0x00000008 | 0x00000200 if os.name == "nt" else 0   # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    env = dict(os.environ, AI_OWNER="yellow23", PYTHONIOENCODING="utf-8")
    subprocess.Popen([sys.executable, "-u"] + cmd, cwd=ROOT, stdout=fh, stderr=subprocess.STDOUT, creationflags=flags, env=env)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=240)
    ap.add_argument("--measure", type=int, default=600)
    ap.add_argument("--no-relaunch", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    t0 = time.time()
    t_end = t0 + a.minutes * 60
    t_meas, last = 0, None
    relaunched = {"feed": False, "accel": False}
    Y.say("자급 감시 시작 (%d분)" % a.minutes)
    while time.time() < t_end:
        try:
            r = ai.lua(PROBE % (COAL_CHEST + (lua_pts(PL_COAL), lua_pts(PL_OUT), lua_pts(AC_EAST))))
        except RconError as e:
            Y.say("자급 probe 실패 %s" % e)
            time.sleep(30)
            continue
        plcoal, plout, acpl = [int(v) for v in rows(r["plcoal"])], [int(v) for v in rows(r["plout"])], [int(v) for v in rows(r["acpl"])]
        pending = orders()
        # 석탄 -> 플라스틱 공장 둘
        if min(plcoal) < 80 and r["coal"] >= 200 and not pending_has(pending, "coal"):
            who = idle_maker(ai, pending)
            if who:
                n = min(r["coal"], 800)
                Y.put_order(who, [Y.walk(8.5, -13.5), Y.walk(1.5, -16.0), Y.walk(-3.0, -29.0),
                                  ("take", {"name": "coal", "x": COAL_CHEST[0], "y": COAL_CHEST[1], "count": n})] + TO_PL +
                            [("insert", {"name": "coal", "x": x, "y": y, "count": n // 2}) for x, y in PL_COAL] + FROM_PL)
                Y.say("자급 석탄 %d -> 플라스틱 공장 %s (%s)" % (n, plcoal, who))
                pending = orders()
        # 플라스틱 -> 동쪽 고급회로 2형
        need = [p for p, k in zip(AC_EAST, acpl) if 0 <= k < 20]
        if sum(plout) >= 200 and need and not pending_has(pending, "plastic-bar"):
            who = idle_maker(ai, pending)
            if who:
                n = min(sum(plout), 100 * len(need))
                steps = [Y.walk(10.5, 0.0), Y.walk(14.0, 6.0)]
                left = n
                for (x, y), k in zip(PL_OUT, plout):
                    t = min(k, left)
                    if t > 0:
                        steps.append(("take", {"name": "plastic-bar", "x": x, "y": y, "count": t}))
                        left -= t
                steps += FROM_PL + [Y.walk(8.5, -26.0)]
                for x, y in sorted(need):
                    steps += [Y.walk(x + 2.5, -26.0), ("insert", {"name": "plastic-bar", "x": x, "y": y, "count": n // len(need)})]
                steps += [Y.walk(8.5, -26.0), Y.walk(8.5, -13.5)]
                Y.put_order(who, steps)
                Y.say("자급 플라스틱 %d -> 고급회로 %s (%s)" % (n, [p[0] for p in need], who))
        # 먹이 고리 · 가속 재기동
        if not a.no_relaunch:
            if not relaunched["feed"] and log_ended("먹이 고리 끝", t0):
                relaunch(FEED_CMD, "yellow23_feed.out")
                relaunched["feed"] = True
                Y.say("자급 먹이 고리 재기동 " + " ".join(FEED_CMD[1:]))
            if not relaunched["accel"] and log_ended("가속 감시 끝", t0):
                relaunch(ACCEL_CMD, "accel23.out")
                relaunched["accel"] = True
                Y.say("자급 가속 재기동 " + " ".join(ACCEL_CMD[1:]))
        if time.time() - t_meas >= a.measure:
            t_meas = time.time()
            line = {"tick": r["tick"], "prog": round(r["progress"], 4), "p10": r["p10"], "coal": r["coal"], "plcoal": plcoal,
                    "plout": plout, "acpl": acpl, "ldscu": rows(r["ldscu"])}
            if last and r["research"] == "artillery" and r["tick"] > last[0]:
                rate = (r["progress"] - last[1]) / ((r["tick"] - last[0]) / 3600)
                line["units_per_min"] = round(rate * 2000, 2)
                if rate > 0:
                    line["eta_h"] = round((1 - r["progress"]) / rate / 60, 2)
            last = (r["tick"], r["progress"])
            Y.say("자급 측정 " + json.dumps(line, ensure_ascii=False))
        time.sleep(60)
    Y.say("자급 감시 끝")


if __name__ == "__main__":
    main()

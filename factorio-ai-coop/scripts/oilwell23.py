"""원유 광맥 1 빈 우물 4 에 펌프잭 (로켓 계획 P1, 09-28) - 벽 밖 채굴지라 캐릭터 (delta) 가 짓는다 (사용자 규칙).

실측 (tick ~20.79M): 원유 10 분 22,812 (펌프잭 4: 153k · 154k · 462k · 214k). 빈 우물:
  A (-63.5,367.5) 270k · B (-81.5,391.5) 231k · C (-68.5,391.5) 301k · D (-72.5,395.5) 233k -> +~34/s (광산 생산성 전).
둘레 방어: 서 x=-91 기관총 6 · 남 y=400 기관총 5 (둘 다 벨트 급탄) · 동 x=-60 기관총 3 (oilexp23) + 로보포트 (-64,383).
가장 가까운 적 구조물 (-39,472) 산란기 (100 칸). 새 우물 네 곳 모두 이미 있는 포탑 고리 안이라 포탑은 더 세우지 않는다.

펌프잭 출구 (프로토타입 실측): 북향 = (x+1, y-2), 동향 = (x+2, y-1), 서향 = (x-2, y+1).
  A 서향 -> (-65.5,368.5) -> 관 7 -> 기존 관 (-68.5,372.5)
  C 북향 -> (-67.5,389.5) -> 관 3 -> 기존 관 (-67.5,386.5)
  D 북향 -> (-71.5,393.5) -> 관 줄 y=393.5 동쪽 · x=-66.5 북쪽 -> C 출구 관 (-67.5,389.5)
  B 동향 -> (-79.5,390.5) -> x=-79.5 남쪽 · y=393.5 동쪽 -> D 출구 관 (-71.5,393.5)
전봇대: C 용 (-65.5,390.5) (<- (-71.5,387.5)), B 용 (-80.5,393.5) (<- (-80.5,398.5)). A <- (-60.5,367.5), D <- (-74.5,398.5).

oilexp23 의 회랑 · 위험 판단 · 귀환 · 측정 함수를 그대로 쓴다 (체력 < 150 중단, 무리 대기, 부활 없음).

    python -u scripts/oilwell23.py dry       # 자리 확인 (can_place)
    python -u scripts/oilwell23.py go        # 준비 -> 남하 -> 건설 -> 귀환 -> 10 분 뒤 측정
    python -u scripts/oilwell23.py check
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import detached  # noqa: E402
import oilexp23 as ox  # noqa: E402

N, E, S, W = 0, 4, 8, 12
ox.WHO = "delta"
ox.OWNER = "oilwell23"
ox.LOG = os.path.join(HERE, "..", "state", "oilwell23.log")
JACKS = [(-63.5, 367.5, W), (-68.5, 391.5, N), (-72.5, 395.5, N), (-81.5, 391.5, E)]
ox.JACKS = [(x, y) for x, y, _ in JACKS]
ox.TURRETS = [(-60, 376), (-60, 383), (-60, 390)]
PIPES = ([(-65.5, 368.5), (-66.5, 368.5), (-67.5, 368.5), (-67.5, 369.5), (-67.5, 370.5), (-67.5, 371.5), (-67.5, 372.5)]
         + [(-67.5, 389.5), (-67.5, 388.5), (-67.5, 387.5)]
         + [(-71.5, 393.5), (-70.5, 393.5), (-69.5, 393.5), (-68.5, 393.5), (-67.5, 393.5), (-66.5, 393.5),
            (-66.5, 392.5), (-66.5, 391.5), (-66.5, 390.5), (-66.5, 389.5)]
         + [(-79.5, 390.5), (-79.5, 391.5), (-79.5, 392.5), (-79.5, 393.5), (-78.5, 393.5), (-77.5, 393.5),
            (-76.5, 393.5), (-75.5, 393.5), (-74.5, 393.5), (-73.5, 393.5), (-72.5, 393.5)])
POLES = [(-65.5, 390.5), (-80.5, 393.5)]
TAKES = [("iron-plate", (-81.5, -52.5), 200), ("steel-plate", (-84.5, -68.5), 24), ("copper-plate", (-82.5, -49.5), 40)]
PIPE_HAVE = 11


def dry(ai):
    body = ", ".join("{'pumpjack', %s, %s, %d}" % j for j in JACKS)
    body += ", " + ", ".join("{'pipe', %s, %s, 0}" % p for p in PIPES)
    body += ", " + ", ".join("{'small-electric-pole', %s, %s, 0}" % p for p in POLES)
    return ai.lua("""(function() local s = game.surfaces[1] local o = {bad = {}, n = 0}
      for _, t in pairs({%s}) do o.n = o.n + 1
        if not s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player'} then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end end
      return o end)()""" % body)


GIVE_POLES = """(function() local s = game.surfaces[1] local n = s.find_logistic_network_by_position({-60.5, -33.5}, 'player')
  local ch = nil
  for _, c in pairs(s.find_entities_filtered{name = 'character', position = {%s, %s}, radius = 3}) do ch = c end
  if not (n and ch) then return {err = 'no net/char'} end
  local have = ch.get_main_inventory().get_item_count('small-electric-pole')
  if have >= %d then return {have = have} end
  local got = n.remove_item{name = 'small-electric-pole', count = %d - have}
  local put = ch.get_main_inventory().insert{name = 'small-electric-pole', count = got}
  if put < got then n.insert{name = 'small-electric-pole', count = got - put} end
  return {moved = put} end)()"""


def go(ai, settle):
    detached.mark([ox.WHO], owner=ox.OWNER, minutes=60)
    ai.agent(ox.WHO).cancel()
    before = ox.measure(ai)
    ox.log("P1 출정 시작 - delta 재료 준비")
    try:
        prep = [("take", {"name": item, "x": x, "y": y, "count": n}) for item, (x, y), n in TAKES]
        prep += [("craft", {"recipe": "pumpjack", "count": len(JACKS)}),
                 ("craft", {"recipe": "pipe", "count": max(0, len(PIPES) + 2 - PIPE_HAVE)})]
        ox.run(ai, prep, "준비", 300)
        st = ox.me(ai)
        g = ai.lua(GIVE_POLES % (st["x"], st["y"], len(POLES), len(POLES)))   # 망에 있는 전봇대 (기존 아이템) 2 개만 가방으로
        inv = ai.agent(ox.WHO).items()
        ox.log(f"  가방: { {k: inv.get(k, 0) for k in ('iron-plate', 'copper-plate', 'steel-plate', 'pumpjack', 'pipe', 'small-electric-pole')} } 전봇대 {g}")
        # 제작이 걷는 동안 끝나므로 남하 시작
        ox.walk(ai, ox.CORRIDOR, "남하")
        build = [("build", {"name": "pumpjack", "x": x, "y": y, "direction": d}) for x, y, d in JACKS]
        build += [("build", {"name": "pipe", "x": x, "y": y}) for x, y in PIPES]
        build += [("build", {"name": "small-electric-pole", "x": x, "y": y}) for x, y in POLES]
        ox.guard(ai)
        inv = ai.agent(ox.WHO).items()
        ox.log(f"  도착 가방: pumpjack {inv.get('pumpjack', 0)} · pipe {inv.get('pipe', 0)} · 전봇대 {inv.get('small-electric-pole', 0)}")
        ox.run(ai, build, "건설", 400)
        time.sleep(5)
        site = ox.check_site(ai)
        ox.log(f"  현장: 펌프잭 {site['jacks']} / 동쪽 포탑 {site['turrets']}")
        miss = [s for s in site["jacks"] if "없음" in s]
        left = dry(ai)   # 아직 놓을 수 있는 칸 = 안 지어진 칸
        if miss or left.get("n", 0) - len(left.get("bad", []) or []) > 0:
            ox.log(f"  빠진 것 펌프잭 {miss} · 아직 놓을 수 있는 칸 {left.get('n', 0) - len(left.get('bad', []) or [])} - 한 번 더")
            ox.run(ai, build, "건설 재시도", 400)
            site = ox.check_site(ai)
            ox.log(f"  현장(재): 펌프잭 {site['jacks']}")
    except ox.Abort as e:
        ox.log(f"중단: {e}")
        st = ox.me(ai)
        if not st.get("alive", True):
            ox.log("delta 사망 - 부활하지 않음. 기록만.")
            detached.release([ox.WHO])
            return 2
    except Exception as e:  # noqa: BLE001
        ox.log(f"오류: {type(e).__name__}: {e}")
    try:
        st = ox.me(ai)
        back = [p for p in reversed(ox.CORRIDOR[:-1]) if p[1] < st["y"] + 5] + [ox.HOME]
        ox.walk(ai, back, "귀환", hold_max=900)
        ox.log(f"귀환 완료 ({ox.me(ai)['x']:.0f},{ox.me(ai)['y']:.0f})")
    except Exception as e:  # noqa: BLE001
        ox.log(f"귀환 문제: {type(e).__name__}: {e}")
    finally:
        detached.release([ox.WHO])
    if settle > 0:
        ox.log(f"{settle:.0f}s 뒤 재측정")
        time.sleep(settle)
        after = ox.measure(ai)
        ox.log(f"전후: 원유 {before['crude']:.1f} -> {after['crude']:.1f}/s, 가스 {before['gas']:.1f} -> {after['gas']:.1f}/s")
    return 0


def finish(ai, settle):
    """17:23 첫 출정: 관이 22 개뿐 (펌프잭 제작이 관 40 을 먹음) -> B 줄 9 칸 못 지음. delta 가방 철 49 로 관을 만들어 다시 간다."""
    detached.mark([ox.WHO], owner=ox.OWNER, minutes=40)
    ai.agent(ox.WHO).cancel()
    before = ox.measure(ai)
    try:
        left = dry(ai)
        todo = len(PIPES) + len(POLES) + len(JACKS) - len(left.get("bad", []) or [])
        ox.log(f"마무리 출정: 남은 칸 {todo}")
        ox.run(ai, [("craft", {"recipe": "pipe", "count": todo + 1})], "관 제작", 60)
        st = ox.me(ai)
        pts = [p for p in ox.CORRIDOR if p[1] > st["y"] - 5]
        ox.walk(ai, pts, "남하")
        inv = ai.agent(ox.WHO).items()
        ox.log(f"  도착 가방: pipe {inv.get('pipe', 0)}")
        build = [("build", {"name": "pipe", "x": x, "y": y}) for x, y in PIPES]
        build += [("build", {"name": "small-electric-pole", "x": x, "y": y}) for x, y in POLES]
        ox.guard(ai)
        ox.run(ai, build, "건설", 300)
        time.sleep(3)
        left = dry(ai)
        ox.log(f"  남은 칸 {len(PIPES) + len(POLES) + len(JACKS) - len(left.get('bad', []) or [])} · 현장 {ox.check_site(ai)['jacks']}")
    except ox.Abort as e:
        ox.log(f"중단: {e}")
        if not ox.me(ai).get("alive", True):
            ox.log("delta 사망 - 부활하지 않음.")
            detached.release([ox.WHO])
            return 2
    except Exception as e:  # noqa: BLE001
        ox.log(f"오류: {type(e).__name__}: {e}")
    try:
        st = ox.me(ai)
        back = [p for p in reversed(ox.CORRIDOR[:-1]) if p[1] < st["y"] + 5] + [ox.HOME]
        ox.walk(ai, back, "귀환", hold_max=900)
        ox.log(f"귀환 완료 ({ox.me(ai)['x']:.0f},{ox.me(ai)['y']:.0f})")
    except Exception as e:  # noqa: BLE001
        ox.log(f"귀환 문제: {type(e).__name__}: {e}")
    finally:
        detached.release([ox.WHO])
    if settle > 0:
        ox.log(f"{settle:.0f}s 뒤 재측정")
        time.sleep(settle)
        after = ox.measure(ai)
        ox.log(f"전후: 원유 {before['crude']:.1f} -> {after['crude']:.1f}/s, 가스 {before['gas']:.1f} -> {after['gas']:.1f}/s")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["dry", "go", "check", "finish"])
    ap.add_argument("--settle", type=float, default=600)
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "dry":
        ox.log(f"자리 확인 {dry(ai)}")
    elif a.cmd == "check":
        ox.log(f"현장: {ox.check_site(ai)}")
    elif a.cmd == "finish":
        return finish(ai, a.settle)
    else:
        return go(ai, a.settle)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

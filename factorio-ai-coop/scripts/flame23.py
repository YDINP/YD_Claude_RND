"""남쪽 벽 화염방사 포탑 - 사용자: "대포 쪽 방어선에 유류 중에 남는 걸로 화염방사 포탑 하나 만들어 두는 것도 좋을 듯."

남는 기름: 정유 3대 (basic) 가 모두 full_output 이라 원유가 밀려 있다 (관 99/100, 남쪽 원유 탱크 25k).
석유가스·윤활유는 화염 포탑이 못 쓰고 (연료값 0 - 원유·중유·경유만), 중유·경유는 basic 이라 안 나온다 -> 원유.
원유 가지: 동쪽 정유 (23.5,11.5) 로 가는 원유 줄 y=17.5 (x 15.5..24.5) 의 (21.5,17.5) 관 밑에서 남으로 분기.
  지하관 3쌍 (21.5, 18.5 북 / 28.5 남) (29.5 북 / 39.5 남) (40.5 북 / 47.5 남) -> 관 (21.5,48.5) -> 포탑 동쪽 접속.
포탑 (20.0,49.5) 남향: 포탑 줄 (y 51..52) 바로 뒤, 동쪽은 호수 (x>=22, y>=48). 남동 공습 (22..33,73..82) 이 사거리 30 안.
주 로봇망은 대포 이전으로 0/44 여유라 alpha 가 재료를 모아 손제작하고 손으로 세운다 (delta-trap x18..34,y-12..14 는 x<=12 로 우회).
  재료: 강철 30 = 철상자 (10.5,-13.5) / 톱니 alpha 10 + 조립기 (14.5,-24.5)(26.5,-24.5) 출력 / 엔진 조립기 (18.5,-24.5)(22.5,-24.5) 출력
        / 관 24·지하관 6 은 alpha 가방.

    python -u scripts/flame23.py            # 제출 + 완공·기름 확인
    python -u scripts/flame23.py --check    # 확인만
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402
import orders  # noqa: E402

WHO = "alpha"
N, S = 0, 8
X = 21.5
TURRET = (20.0, 49.5)
PTG = [(18.5, N), (28.5, S), (29.5, N), (39.5, S), (40.5, N), (47.5, S)]

CHECK = """(function() local s = game.surfaces[1] local o = {}
  local t = s.find_entities_filtered{name = 'flamethrower-turret', position = {%s, %s}, radius = 1}[1]
  if not t then o.turret = 0 else
    local f = t.fluidbox[1] o.turret = 1 o.fluid = f and (f.name .. ':' .. math.floor(f.amount)) or '-' end
  o.ptg = s.count_entities_filtered{name = 'pipe-to-ground', area = {{21, 18}, {22, 48}}}
  local p = s.find_entities_filtered{name = 'pipe', position = {21.5, 48.5}, radius = 0.3}[1]
  o.pipe = p and (p.fluidbox[1] and p.fluidbox[1].name .. ':' .. math.floor(p.fluidbox[1].amount) or 'empty') or 'none'
  return o end)()""" % TURRET


def say(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def plan():
    st = [("walk_to", {"x": 10.5, "y": -12}),
          ("take", {"name": "steel-plate", "x": 10.5, "y": -13.5, "count": 30}),
          ("walk_to", {"x": 14.5, "y": -21.5}),
          ("take", {"name": "iron-gear-wheel", "x": 14.5, "y": -24.5, "count": 4}),
          ("walk_to", {"x": 20.5, "y": -21.5}),
          ("take", {"name": "engine-unit", "x": 18.5, "y": -24.5, "count": 4}),
          ("take", {"name": "engine-unit", "x": 22.5, "y": -24.5, "count": 4}),
          ("walk_to", {"x": 26.5, "y": -21.5}),
          ("take", {"name": "iron-gear-wheel", "x": 26.5, "y": -24.5, "count": 4}),
          ("craft", {"recipe": "flamethrower-turret", "count": 1}),
          # delta-trap (x18..34, y-12..14) 을 피해 서쪽으로 내려간다
          ("walk_to", {"x": 12, "y": -18}),
          ("walk_to", {"x": 12, "y": 16}),
          ("walk_to", {"x": 19.5, "y": 20})]
    for y, d in PTG:
        if y >= 28:
            st.append(("walk_to", {"x": 19.5, "y": y}))
        st.append(("build", {"name": "pipe-to-ground", "x": X, "y": y, "direction": d}))
    st += [("build", {"name": "pipe", "x": X, "y": 48.5, "direction": 0}),
           ("build", {"name": "flamethrower-turret", "x": TURRET[0], "y": TURRET[1], "direction": S}),
           ("walk_to", {"x": 12, "y": 40})]
    return st


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if not a.check:
        say("%s 계획 제출 %s" % (WHO, orders.submit(ai, WHO, plan())))
    for _ in range(80):
        r = ai.lua(CHECK)
        say("확인 %s" % r)
        if a.check:
            return 0
        if r.get("turret") and str(r.get("fluid", "-")).startswith("crude-oil"):
            say("화염 포탑 완공 - 원유 %s" % r["fluid"])
            return 0
        time.sleep(15)
    say("시간 초과 - alpha 상태 %s" % ai.agent(WHO).status())
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Spoke scouting for a fresh map with no charted chunks - walk out, look, come back.

24회차: 헤드리스에 플레이어가 없어 밝혀진 청크가 0 이면 fogwalk.py (가장자리 = 밝혀진 청크 옆)
가 고를 곳이 없다. 그래서 방위마다 LEG 칸씩 걸어 나간다. 본 것은 seen.py 장부가 적는다.

23회차 복기 (docs/run23-postmortem.md §3-7): 사망 14 중 13 이 «안 센 떠도는 무리» 또는 «도망길».
그래서 다리마다 **출정 조건** 을 떠나기 직전에 다시 잰다:
    가는 선분 반경 PAD 안에 적 유닛 0 · 둥지/웜 0.  하나라도 있으면 그 방위는 접고 돌아온다.
문턱은 올리지 않는다. 걷는 도중에도 1초마다 시야 FLEE_AT 안을 보고, 보이면 집 쪽으로 돌아선다.
(적 구조물·유닛 조회는 안전 판정일 뿐 지도를 열지 않는다 - force.chart 는 쓰지 않는다.)

    python scripts/walkscout.py --run run24 --who hotel --dirs E,SE,S,SW --reach 300
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import detached                         # noqa: E402

DIRS = {"E": (1, 0), "W": (-1, 0), "S": (0, 1), "N": (0, -1),
        "NE": (0.707, -0.707), "NW": (-0.707, -0.707), "SE": (0.707, 0.707), "SW": (-0.707, 0.707)}
PAD = 80          # 출정 조건: 다리 선분에서 이 반경 안 적 0
FLEE_AT = 70      # 걷는 도중 이 안에 적이 보이면 돌아선다


def route_foes(ai, a, b, pad=PAD) -> dict:
    """선분 a->b 반경 pad 안의 적 유닛 · 구조물 수."""
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local ax, ay, bx, by, pad = %f, %f, %f, %f, %f
      local cx, cy = (ax + bx) / 2, (ay + by) / 2
      local half = math.sqrt((bx - ax)^2 + (by - ay)^2) / 2 + pad
      local function dseg(px, py)
        local vx, vy = bx - ax, by - ay
        local L = vx * vx + vy * vy
        local t = 0
        if L > 0 then t = math.max(0, math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) end
        return math.sqrt((ax + t * vx - px)^2 + (ay + t * vy - py)^2)
      end
      local out = {units = 0, structs = 0}
      for _, e in pairs(s.find_entities_filtered{force = "enemy", position = {cx, cy}, radius = half,
                                                 type = {"unit", "unit-spawner", "turret"}}) do
        if dseg(e.position.x, e.position.y) <= pad then
          if e.type == "unit" then out.units = out.units + 1 else out.structs = out.structs + 1 end
        end
      end
      return out
    end)()""" % (a[0], a[1], b[0], b[1], pad))


def gen_ahead(ai, goal, chunks=2) -> None:
    """가는 곳의 땅을 만든다 (지형 생성만 - 지도는 안 연다). 24회차: 플레이어가 없는 헤드리스는 캐릭터 곁 청크를
    만들지 않아 ~250칸 밖은 «아직 없는 땅» 이고, 길찾기가 거기서 stuck 이 됐다 (북 280 · 서 360).
    플레이어 몸이 걸으면 저절로 생기는 반경 (청크 둘) 만큼만 요청한다. force.chart 는 여전히 안 쓴다."""
    ai.lua("""(function()
      local s = game.surfaces[1]
      s.request_to_generate_chunks({%f, %f}, %d)
      s.force_generate_chunk_requests()
      return {ok = 1}
    end)()""" % (goal[0], goal[1], chunks))


def body(ai, who):
    for r in ai.list():
        if r["name"] == who:
            return r
    return None


def walk(ai, who, goal, home, limit=90) -> str:
    """goal 까지 걷는다. 'ok' · 'foe' (보여서 돌아섬) · 'stuck' · 'dead'."""
    submit(ai, who, [("walk_to", {"x": goal[0], "y": goal[1]})], strict=False)
    t0, last, still = time.time(), None, 0
    while time.time() - t0 < limit:
        time.sleep(1)
        r = body(ai, who)
        if not r or not r.get("alive", True):
            return "dead"
        x, y = float(r.get("x") or 0), float(r.get("y") or 0)
        f = route_foes(ai, (x, y), (x, y), FLEE_AT)
        if f.get("units", 0) or f.get("structs", 0):
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            back = (x + (home[0] - x) * 0.5, y + (home[1] - y) * 0.5)
            submit(ai, who, [("walk_to", {"x": back[0], "y": back[1]})], strict=False)
            print(f"  {who}: ({x:.0f},{y:.0f}) 에서 적 {f} - 돌아선다 -> ({back[0]:.0f},{back[1]:.0f})", flush=True)
            return "foe"
        if math.hypot(goal[0] - x, goal[1] - y) < 6:
            return "ok"
        if last and math.hypot(x - last[0], y - last[1]) < 0.5:
            still += 1
            if still >= 8 and not (r.get("current") or r.get("queued")):
                return "stuck"
        else:
            still = 0
        last = (x, y)
    return "stuck"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", required=True)
    ap.add_argument("--dirs", default="E,SE,S,SW,W,NW,N,NE")
    ap.add_argument("--reach", type=float, default=300)
    ap.add_argument("--leg", type=float, default=40)
    ap.add_argument("--home", default="", help="x,y (없으면 회차 설정의 center)")
    ap.add_argument("--end", default="", help="끝나면 갈 곳 x,y (없으면 home)")
    ap.add_argument("--start", type=float, default=0, help="첫 다리 거리 (이미 걸은 안쪽은 건너뛴다)")
    a = ap.parse_args()
    home = tuple(float(v) for v in a.home.split(",")) if a.home else runsite.center()
    end = tuple(float(v) for v in a.end.split(",")) if a.end else home
    ai = AIBridge()
    detached.mark([a.who], "walkscout", minutes=60)
    for d in a.dirs.split(","):
        ux, uy = DIRS[d.strip().upper()]
        dist = max(a.leg, a.start)
        while dist <= a.reach + 0.1:
            r = body(ai, a.who)
            if not r:
                print(f"{a.who}: 없다 (사망?)", flush=True)
                return 1
            at = (float(r.get("x") or 0), float(r.get("y") or 0))
            goal = (home[0] + ux * dist, home[1] + uy * dist)
            gen_ahead(ai, goal)
            f = route_foes(ai, at, goal)          # 출정 조건 - 떠나기 직전에 다시 잰다
            if f.get("units", 0) or f.get("structs", 0):
                print(f"{a.who} {d} {dist:.0f}: 가는 길 반경 {PAD} 에 적 {f} - 이 방위 접음", flush=True)
                break
            res = walk(ai, a.who, goal, home)
            print(f"{a.who} {d} {dist:.0f} ({goal[0]:.0f},{goal[1]:.0f}): {res}", flush=True)
            if res == "dead":
                return 1
            if res == "foe":
                break
            if res == "stuck":
                dist += a.leg / 2          # 물·절벽 - 조금 더 멀리 잡아 돌아가게
                continue
            dist += a.leg
    walk(ai, a.who, end, home, limit=120)
    detached.release([a.who])
    print(f"{a.who}: 끝 -> {end}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

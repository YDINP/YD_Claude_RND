"""Scouting by walking the fog: go where the map ends, never back over it.

    사용자: "정찰은 왔던길을 다시 가기보단, 안개를 걷는 느낌으로 정찰하도록해줘"

scout.py 는 방위를 정해 집에서 직선으로 나간다. 다리마다 «집에서 몇 칸»을
찍으니, 한 방위를 다 걷고 다음 방위로 넘어갈 때 걸어 온 길을 되밟는다.
그 길은 이미 밝혀진 땅이다 - 거기서 새로 보이는 것은 없다.

안개를 걷는 정찰은 목적지를 «집에서» 재지 않고 «지도 가장자리에서» 잰다.

    1. 밝혀진 청크 가운데 옆에 안개 청크를 둔 것이 가장자리다.
    2. 그 가장자리 중 «지금 선 자리에서» 가장 가까운 곳으로 간다.
       집 쪽으로 되돌아가는 가장자리에는 벌점을 준다 - 그래야 되밟지 않는다.
    3. 몸이 64칸을 밝히니, 가장자리에 서면 안개 쪽으로 두 청크가 더 열린다.
    4. 열린 만큼 가장자리가 밀려나고, 다시 1로.

둥지·웜은 피한다: 이미 보인 것에서 AVOID 칸 안의 가장자리는 고르지 않는다.
걷는 도중에 새로 보이면 scout.py 와 같이 돌아선다 - 그 둥지는 다음 고를
때 저절로 «피할 것»에 든다. 이것이 「둥지를 발견하면 더 다가가지 말 것」의
안개 버전이다.

지도는 여전히 «직접 열지 않는다». 이 고리가 보는 청크는 정찰병이 밟아서
밝힌 청크뿐이다.

    python scripts/fogwalk.py --who hotel --home=-40,30 --reach 900
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
from scout import (crew_state, near, sightings, unstick,   # noqa: E402
                   COMPASS, FLEE_AT, FLEE_BACK, MAX_REACH)
import danger                                              # noqa: E402  (away_from_foes)

AVOID = 150        # 보인 둥지·웜에서 이만큼 안의 가장자리는 안 간다
BACKTRACK = 0.5    # 집 쪽으로 되돌아가는 칸수마다 이만큼 벌점
PICK = 8           # 한 번에 받아 두는 후보 수 (막힌 곳은 다음 후보로)
STALL_GAP = 12     # 목적지에서 이만큼 못 좁히면 «못 갔다»


def frontier(ai, at, home, reach, skip=(), toward=(0, 0)) -> list:
    """안개 가장자리 후보. [(청크키, x, y, 점수)] 좋은 것부터.

    점수 = 지금 자리에서의 거리 + BACKTRACK * (집 쪽으로 되돌아가는 만큼).
    목적지는 «밝혀진 청크의 안개 쪽 가장자리»다 - 안개 청크 자체는 아직
    생성되지 않았을 수 있어 설 자리를 고를 수 없다.
    """
    ax, ay = at
    hx, hy = home
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local ax, ay, hx, hy, reach, avoid = %f, %f, %f, %f, %f, %f
      local tx, ty = %f, %f          -- 가고 싶은 방위 (0,0 이면 없음)
      local foes = {}
      for _, e in pairs(s.find_entities_filtered{type = {"unit-spawner", "turret"},
              force = game.forces.enemy, position = {hx, hy}, radius = reach + avoid}) do
        foes[#foes+1] = e.position
      end
      local skip = {}
      for bit in string.gmatch("%s", "[^;]+") do skip[bit] = true end
      local seen, out = {}, {}
      local dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
      local dha = math.sqrt((ax - hx) ^ 2 + (ay - hy) ^ 2)
      for c in s.get_chunks() do
        if f.is_chunk_charted(s, {x = c.x, y = c.y}) then
          for _, d in pairs(dirs) do
            local nx, ny = c.x + d[1], c.y + d[2]
            local key = nx .. "," .. ny
            if not seen[key] and not skip[key]
               and not f.is_chunk_charted(s, {x = nx, y = ny}) then
              seen[key] = true
              local gx = c.x * 32 + 16 + d[1] * 14
              local gy = c.y * 32 + 16 + d[2] * 14
              local dh = math.sqrt((gx - hx) ^ 2 + (gy - hy) ^ 2)
              if dh <= reach then
                local ok = true
                for _, p in pairs(foes) do
                  if (p.x - gx) ^ 2 + (p.y - gy) ^ 2 < avoid * avoid then ok = false; break end
                end
                if ok then
                  local da = math.sqrt((gx - ax) ^ 2 + (gy - ay) ^ 2)
                  -- 방위 벌점: 그 방위로 나아간 만큼(내적)을 빼고 남은 거리
                  local side = 0
                  if tx ~= 0 or ty ~= 0 then
                    side = dh - ((gx - hx) * tx + (gy - hy) * ty)
                  end
                  out[#out+1] = {da + %f * math.max(0, dha - dh) + 0.5 * side, key, gx, gy}
                end
              end
            end
          end
        end
      end
      table.sort(out, function(a, b) return a[1] < b[1] end)
      local top = {}
      for _, o in ipairs(out) do
        local spot = s.find_non_colliding_position("character", {o[3], o[4]}, 12, 1, true)
        if spot then
          top[#top+1] = string.format("%%s|%%.1f|%%.1f|%%.0f", o[2], spot.x, spot.y, o[1])
          if #top >= %d then break end
        end
      end
      return top
    end)()""" % (ax, ay, hx, hy, reach, AVOID, toward[0], toward[1], ";".join(skip), BACKTRACK, PICK))
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for row in rows:
        key, x, y, score = str(row).split("|")
        out.append((key, float(x), float(y), float(score)))
    return out


def charted(ai) -> int:
    return int(ai.lua("""(function()
      local s, f, n = game.surfaces[1], game.forces.player, 0
      for c in s.get_chunks() do
        if f.is_chunk_charted(s, {x = c.x, y = c.y}) then n = n + 1 end
      end
      return { n = n }
    end)()""")["n"])


def foes_near(ai, at, radius) -> int:
    seen = near(ai, at, radius)
    return int(seen["nests"]) + int(seen["worms"]) + int(seen["units"])


def walk_watch(ai, who, goal, home, label=""):
    """한 다리를 «보면서» 걷는다. 돌아오는 값: arrived / fled / stalled / dead.

    걷는 도중 FLEE_AT 안에 적이 보이면 끊고 «적의 반대쪽»으로 물러난다 -
    집 쪽이 아니다. hotel 은 집 쪽으로 물러나다 집으로 가는 길 위의
    둥지에 죽었다 (-208,-512).
    """
    submit(ai, who, [("walk_to", {"x": goal[0], "y": goal[1]})], strict=False)
    stalls = 0
    while True:
        me = crew_state(ai).get(who)
        if not me or not me["alive"]:
            return "dead"
        at = (me["x"], me["y"])
        if foes_near(ai, at, FLEE_AT):
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            back = danger.away_from_foes(ai, at, FLEE_BACK)
            if not back:
                dx, dy = home[0] - at[0], home[1] - at[1]
                span = max(1.0, math.hypot(dx, dy))
                back = (at[0] + dx / span * FLEE_BACK, at[1] + dy / span * FLEE_BACK)
            submit(ai, who, [("walk_to", {"x": back[0], "y": back[1]})], strict=False)
            print(f"{who}: ({at[0]:.0f},{at[1]:.0f}) 에서 적을 봤다{label} - "
                  f"({back[0]:.0f},{back[1]:.0f}) 로 {FLEE_BACK}칸 물러난다")
            time.sleep(20)
            return "fled"
        if me["busy"]:
            time.sleep(6)
            continue
        gap = math.hypot(at[0] - goal[0], at[1] - goal[1])
        if gap <= STALL_GAP:
            return "arrived"
        stalls += 1
        if stalls == 2:
            unstick(ai, who)
        if stalls > 3:
            return "stalled"
        submit(ai, who, [("walk_to", {"x": goal[0], "y": goal[1]})], strict=False)
        time.sleep(6)


def safe_spot(ai, at) -> bool:
    return foes_near(ai, at, AVOID) == 0


def go_home(ai, who, trail, home) -> str:
    """밟았던 가장자리를 거꾸로 되짚어 돌아온다. 위험해진 지점은 건너뛴다.

    한 번에 집으로 걷지 않는다: 길찾기는 밝혀진 회랑을 따라가고, 회랑은
    나중에 생성된 둥지 옆을 지날 수 있다. 밟았던 지점은 «그때» 안전했던
    자리다 - 지금도 안전한지 AVOID 로 다시 보고 간다.
    """
    for wp in list(reversed(trail)) + [home]:
        if not safe_spot(ai, wp):
            print(f"  ({wp[0]:.0f},{wp[1]:.0f}) 는 이제 적 곁이다 - 건너뛴다")
            continue
        for _try in range(3):
            got = walk_watch(ai, who, wp, home, label=" (귀환 중)")
            if got in ("arrived", "stalled"):
                break
            if got == "dead":
                return "dead"
    return "home"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", required=True)
    ap.add_argument("--home", required=True, help="기지. 음수는 --home=-40,30")
    ap.add_argument("--reach", type=int, default=MAX_REACH, help="집에서 이보다 멀리는 안 간다")
    ap.add_argument("--goals", type=int, default=60, help="가장자리를 이만큼 밟으면 돌아온다")
    ap.add_argument("--minutes", type=float, default=90)
    ap.add_argument("--toward", default="", help="치우칠 방위: 남, 서, 남서 ... (scout.COMPASS)")
    args = ap.parse_args()
    toward = (0, 0)
    if args.toward:
        hit = [c for c in COMPASS if c[0] == args.toward]
        if not hit:
            print("모르는 방위다. 쓸 수 있는 것:", ", ".join(c[0] for c in COMPASS))
            return 1
        toward = (hit[0][1], hit[0][2])

    who = args.who
    hx, hy = (int(v) for v in args.home.split(","))
    home = (hx, hy)
    ai = AIBridge()
    t0 = time.time()
    was = charted(ai)
    print(f"{who}: 안개 걷기 시작 - 밝혀진 청크 {was}, 집 ({hx},{hy}) 에서 {args.reach}칸까지")

    skip, trail, fled = [], [], 0
    while len(trail) < args.goals and time.time() - t0 < args.minutes * 60:
        try:
            me = crew_state(ai).get(who)
            if not me or not me["alive"]:
                print(f"  {who} 가 돌아오지 못했다")
                return 1
            at = (me["x"], me["y"])
            picks = frontier(ai, at, home, args.reach, skip, toward)
            if not picks:
                print(f"  {args.reach}칸 안에 갈 수 있는 안개 가장자리가 없다")
                break
            goal = picks[0]
            print(f"{who}: 가장자리 {len(trail) + 1} -> ({goal[1]:.0f},{goal[2]:.0f}) "
                  f"[{math.hypot(goal[1] - at[0], goal[2] - at[1]):.0f}칸 앞, "
                  f"집에서 {math.hypot(goal[1] - hx, goal[2] - hy):.0f}칸]")
            got = walk_watch(ai, who, (goal[1], goal[2]), home)
            if got == "dead":
                print(f"  {who} 가 돌아오지 못했다")
                return 1
            if got == "arrived":
                trail.append((goal[1], goal[2]))
                fled = 0
            elif got == "stalled":
                print(f"  {goal[0]} 가장자리는 못 좁힌다 - 건너뛴다")
                skip.append(goal[0])
            else:                                   # fled
                skip.append(goal[0])
                fled += 1
                if fled >= 3:
                    print("  세 번 물러났다 - 여기서 접는다")
                    break
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
            time.sleep(6)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
            time.sleep(6)

    now = charted(ai)
    print(f"\n{who}: 가장자리 {len(trail)}곳을 밟아 청크 {was} -> {now} (+{now - was})")
    found = sightings(ai, home, args.reach)
    if found:
        print(f"보이는 둥지 {len(found)}곳, 가장 가까운 것 {found[0]['gap']}칸 "
              f"({found[0]['x']:.0f},{found[0]['y']:.0f})")
    else:
        print("밟은 데까지는 둥지가 안 보인다. 안 가 본 곳은 모르는 것이지 없는 것이 아니다.")
    print(f"{who}: 밟았던 {len(trail)}곳을 거꾸로 되짚어 돌아온다")
    got = go_home(ai, who, trail, home)
    print(f"{who}: {'집에 왔다' if got == 'home' else '돌아오지 못했다'}")
    return 0 if got == "home" else 1


if __name__ == "__main__":
    sys.exit(main())

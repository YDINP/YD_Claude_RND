"""Nobody asked whether it was safe to go.

20회차에서 여덟 중 여섯이 죽었다. 한 번에 죽은 것이 아니라 두 번에 걸쳐,
그리고 둘째 번에는 «내가 후퇴를 지시한 뒤에도» 넷이 더 죽었다.

    시체 자리   (82,18) (106,20) 그리고 동쪽 밭 여기저기
    그때 기지   150칸 안에 적 0. 포탑 쉰다섯 대가 다 막아 냈다
    시설        화로 48 · 채굴기 181 · 벨트 174 - 거의 그대로다

기지는 멀쩡했다. 죽은 것은 «기지 밖에 나가 있던 사람»뿐이다.

원인은 하나다. 이 저장소의 어느 고리도 보내기 전에 이것을 묻지 않았다.

    거기 가도 되는가.

`flow` 는 벨트를 깔러 보내고, `grow` 는 채굴기를 세우러 보내고, `guard` 는
포탑을 세우러 보내고, `tidy` 는 상자를 걷으러 보낸다. 전부 «무엇을 할지»는
따지는데 «가는 길이 안전한지»는 아무도 안 본다. 그리고 한 번 보낸 뒤에는
돌아오라고 부르는 것도 없다 - 걸어가는 동안 물결이 오면 그대로 끝이다.

    보낼 때 묻지 않으면, 부를 때는 이미 늦다.

이 파일은 그 한 가지를 맡는다. 다른 고리가 «보내기 전에» 물어볼 수 있게
하고(`safe`, `sift`), 한편으로 스스로 돌면서 위험에 든 사람을 불러들인다.

    python scripts/danger.py --home=28,3
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

# 거미는 빠르다. 「보이면 도망」으로는 늦다.
#
# 실측: 후퇴를 지시한 순간 charlie 와 echo 는 40칸 안에 적을 66마리씩
# 두고 있었다. 둘 다 창고까지 못 왔다. 그러니 «보이기 전에» 물러야 한다.
WARN = 45                 # 이만큼 안에 적이 있으면 그 자리는 «보내지» 않는다
FLEE = 60                 # 이미 나가 있는 사람은 이만큼을 본다
CLOSE = 16                # 이 안이면 한 마리라도 물러난다
PACK = 4                  # 먼 데라도 이만큼 모였으면 물러난다
CHECK = 8                 # 몇 초마다 둘러보나

# 떠돌이 한 마리는 «물결»이 아니다.
#
# 처음에는 60칸 안에 적이 하나라도 있으면 불러들였다. 개시하자마자 두
# 사람이 「적 1」로 일을 끊고 돌아왔다 - 그 한 마리는 예순 칸 밖에서
# 혼자 어슬렁거리던 것이었다.
#
#     실측: foxtrot (-2,-1) 적 1 / golf (-65,-18) 적 1
#
# 너무 자주 부르면 일이 안 되고, 일이 안 되면 방어도 안 선다. 그래서
# 두 가지를 나눠 묻는다 - «가까이 있나»와 «무리로 있나».
#
#     한 마리라도 코앞이면 물러난다. 멀면 무리를 이뤘을 때만 물러난다.


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def enemies_at(ai, spots, reach=WARN):
    """여러 자리의 적 수를 «한 번에» 센다.

    자리마다 따로 물으면 스무 번 묻는 동안 세상이 바뀐다. 그리고 그 스무
    번이 한 순번의 시간을 다 먹어 정작 부르는 일이 늦어진다.
    """
    if not spots:
        return []
    body = ", ".join("{%.1f,%.1f}" % (x, y) for x, y in spots)
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local want = { %s }
      local out = {}
      for i, w in ipairs(want) do
        out[i] = s.count_entities_filtered{
          position = {w[1], w[2]}, radius = %d, force = "enemy"}
      end
      return out
    end)()""" % (body, reach))
    got = [int(v) for v in _rows(reply)]
    return got + [0] * (len(spots) - len(got))


def safe(ai, x, y, reach=WARN):
    """이 자리에 사람을 보내도 되나."""
    return enemies_at(ai, [(x, y)], reach)[0] == 0


def sift(ai, spots, reach=WARN):
    """보내도 되는 자리만 골라 돌려준다.

    「위험하면 전부 멈춤」이 아니라 「위험한 곳만 뺀다」다. 한 밭이 위험
    하다고 기지 안의 일까지 세우면, 지킬 수 있는 곳에서 할 수 있는 일도
    안 하게 된다.
    """
    count = enemies_at(ai, [(s[0], s[1]) for s in spots], reach)
    return [spot for spot, n in zip(spots, count) if n == 0]


def crew(ai):
    """살아 있는 사람과 그 자리."""
    out = []
    for row in ai.list():
        if not row.get("alive"):
            continue
        cur = row.get("current") or {}
        out.append({"name": row["name"],
                    "x": float(row.get("x") or 0),
                    "y": float(row.get("y") or 0),
                    "task": cur.get("id"),
                    "busy": bool(row.get("current") or row.get("queued"))})
    return out


def endangered(ai, reach=FLEE, close=CLOSE, pack=PACK):
    """지금 위험에 든 사람들. 가까운 적이 많은 순서로.

    두 번 묻는다 - 코앞(close)과 둘레(reach). 코앞은 한 마리로 족하고,
    둘레는 무리를 이뤄야 한다.
    """
    who = crew(ai)
    if not who:
        return []
    spots = [(p["x"], p["y"]) for p in who]
    far = enemies_at(ai, spots, reach)
    near = enemies_at(ai, spots, close)
    out = []
    for one, n, tight in zip(who, far, near):
        if tight > 0 or n >= pack:
            one["near"] = n
            one["tight"] = tight
            one["why"] = "코앞" if tight else "무리"
            out.append(one)
    return sorted(out, key=lambda p: (-p["tight"], -p["near"]))


# 제자리에 묶인 사람은 «조용히» 아무것도 안 한다.
#
#     사용자: "델타랑 찰리가 아예 낀거같은데 위치좀 수정해줘"
#
# 실측(21회차 개시): charlie (0,-2), delta (-1,-2). 둘 다 원점에 선 채로
# `mine` 을 1637틱 물고 있었고 좌표는 정수로 딱 떨어진 채 한 칸도 안
# 움직였다. 취소하고 walk_to 를 줘도 마찬가지였다. 자리를 강제로 옮기자
# 그 순간부터 둘 다 제대로 걸었다.
#
# 이 스물일곱 분 동안 아무 로그도 안 났다. 「실패」가 아니라 «진행 중»
# 으로 보였기 때문이다.
#
#     멈춰 있는 것과 «천천히 하는 것»은 밖에서 보면 같다.
#
# 그래서 자리를 기억해 두고, 일을 물고 있는데 자리가 안 바뀌면 묶인
# 것으로 친다.
STILL = 0.6               # 이만큼도 안 움직였으면 «그대로»다
PATIENCE = 30             # 몇 순번을 그대로여야 묶인 것으로 보나

# 자리만 보면 «캐는 사람»을 묶인 사람으로 오해한다.
#
# 실측: 넷째 순번에 alpha·echo·hotel 을 전부 「묶였다」고 옮겨 버렸다.
# 셋 다 광맥 앞에서 멀쩡히 캐고 있었다 - 채굴은 원래 «제자리에서» 하는
# 일이다.
#
#     제자리에 있는 것과 «아무것도 안 하는 것»은 다르다.
#
# 그래서 자리와 «붙잡은 일»을 같이 본다. 같은 일을 붙잡은 채로, 자리도
# 안 바뀐 채로 오래면 그것이 묶인 것이다. 일이 바뀌면 진행된 것이고,
# 자리가 바뀌어도 진행된 것이다.


def unstick(ai, who, at):
    """묶인 사람을 빈 자리로 옮긴다. 하던 일은 버린다.

    옮기기만 하고 일을 남겨 두면 그 일이 다시 같은 자리로 끌고 간다.

    `storage` 는 /silent-command 에서 안 보인다 - 이 저장소가 이미 한 번
    겪은 함정이다. 그래서 이름이 아니라 «자리»로 찾는다. 그 자리에 선
    캐릭터가 곧 그 사람이다.
    """
    try:
        ai.agent(who).cancel()
    except RconError:
        pass
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local here = s.find_entities_filtered{
        position = {%.2f, %.2f}, radius = 1.0,
        type = "character", force = f, limit = 1}[1]
      if not here then return { moved = 0, why = "그 자리에 아무도 없다" } end
      local spot = s.find_non_colliding_position("character",
        {here.position.x - 6, here.position.y + 4}, 24, 0.5)
      if not spot then return { moved = 0, why = "둘레에 빈 자리가 없다" } end
      if not here.teleport(spot, s) then
        return { moved = 0, why = "옮기기를 거절당했다" }
      end
      return { moved = 1, x = spot.x, y = spot.y }
    end)()""" % (at[0], at[1]))
    return int(reply.get("moved") or 0) == 1, reply


FAR = 200          # 집에서 이보다 멀리 있으면 정찰 중이다
STEP_BACK = 120    # 정찰병은 집까지가 아니라 이만큼만 물러난다 (fogwalk 와 같은 수)


def away_from_foes(ai, at, step=STEP_BACK):
    """가장 가까운 적의 «반대쪽»으로 step 칸. 적이 안 보이면 None.

    hotel 은 (-724,-299) 에서 «집 쪽으로» 물러나다 죽었다 - 집으로 가는 길
    위에 둥지 (-190,-509) 가 있었다. 물러나는 방향은 집이 아니라 적의 반대다.
    """
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local e = s.find_nearest_enemy{position = {%f, %f}, max_distance = 200, force = game.forces.player}
      if not e then return { ok = 0 } end
      local dx, dy = %f - e.position.x, %f - e.position.y
      local span = math.max(1, math.sqrt(dx * dx + dy * dy))
      return { ok = 1, x = %f + dx / span * %d, y = %f + dy / span * %d }
    end)()""" % (at[0], at[1], at[0], at[1], at[0], step, at[1], step))
    if int(reply.get("ok", 0)):
        return (float(reply["x"]), float(reply["y"]))
    return None


def flee(ai, who, home, at=None):
    """하던 일을 «버리고» 돌아온다.

    취소를 먼저 한다. 대기줄에 남은 걸음이 있으면 그것이 다시 밭 한복판
    으로 끌고 간다 - 실제로 그렇게 넷이 더 죽었다. 부르는 것과 «하던
    일을 끊는 것»은 다른 일이다.

    집에서 FAR 밖에 있는 사람은 정찰병이다. 집까지 부르면 걸어 온 길을
    다 되밟고 정찰 고리는 집에서 다시 시작한다 (hotel, (516,224) 웜 한
    마리에 700칸 귀환). 그 사람은 «적의 반대쪽»으로 STEP_BACK 만 물린다 -
    정찰 고리가 거기서 다음 가장자리를 고른다.
    """
    try:
        ai.agent(who).cancel()
    except RconError:
        pass
    goal = home
    if at and math.hypot(at[0] - home[0], at[1] - home[1]) > FAR:
        goal = away_from_foes(ai, at) or home
    submit(ai, who, [("walk_to", {"x": goal[0], "y": goal[1]})], strict=False)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--home", required=True, help="돌아올 자리. 예: --home=28,3")
    ap.add_argument("--reach", type=int, default=FLEE)
    ap.add_argument("--close", type=int, default=CLOSE)
    ap.add_argument("--pack", type=int, default=PACK)
    ap.add_argument("--every", type=float, default=CHECK)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()

    home = tuple(float(v) for v in args.home.split(","))
    ai = AIBridge()
    calling = set()
    was = {}          # 지난 순번의 자리
    same = {}          # 몇 순번째 그대로인가

    for _ in range(args.rounds):
        try:
            hot = endangered(ai, args.reach, args.close, args.pack)
            names = {p["name"] for p in hot}
            for one in hot:
                if one["name"] in calling:
                    continue
                print(f"  [!] {one['name']} ({one['x']:.0f},{one['y']:.0f}) "
                      f"{one['why']}에 적 {one['tight']}/{one['near']} "
                      f"- 하던 일을 끊고 부른다")
                flee(ai, one["name"], home, (one["x"], one["y"]))
            # 안전해진 사람은 다시 부를 수 있게 풀어 준다.
            calling = names

            # 위험과 별개로, «묶인» 사람도 본다.
            for one in crew(ai):
                name, here = one["name"], (one["x"], one["y"])
                before = was.get(name)
                moved = (before is None
                         or abs(here[0] - before[0][0]) > STILL
                         or abs(here[1] - before[0][1]) > STILL
                         or one["task"] != before[1])
                was[name] = (here, one["task"])
                if moved or not one["busy"]:
                    same[name] = 0
                    continue
                same[name] = same.get(name, 0) + 1
                if same[name] < PATIENCE:
                    continue
                ok, _ = unstick(ai, name, here)
                same[name] = 0
                print(f"  [!] {name} ({here[0]:.0f},{here[1]:.0f}) 가 "
                      f"{PATIENCE}순번째 제자리다 - "
                      f"{'자리를 옮겼다' if ok else '옮기지 못했다'}")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

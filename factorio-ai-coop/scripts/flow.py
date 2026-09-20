"""Logistics: stop carrying by hand, lay the line.

20회차 108분 실측 - 손으로 나르는 것의 한계가 정확히 보였다.

    화로 22대  결과칸 철판 100으로 «전부» 막힘
    밭 상자    철광석 3748 적체
    창고       철판 0
    동쪽 방어선  철이 없어서 비어 있음

운반 당번을 둘에서 셋으로 늘리고 한 번에 드는 양을 400에서 2000으로
올려도 이 모양은 되돌아온다. 채굴기는 스물일곱 대고 화로는 스물두
대인데 손은 여덟 개뿐이기 때문이다. **사람을 늘려 푸는 문제가 아니다.**

    벨트는 «자는 동안에도» 나른다.

길은 이미 설계돼 있다(`belts.lua` 의 field / ore / plate / depot).
이 고리가 하는 일은 그 설계를 «깔고», 깐 뒤에 채굴기를 벨트 쪽으로
돌려 주는 것이다 - 길을 깐 일과 그 길에 싣는 일은 다른 일이고, 앞의
것만 하면 벨트는 장식이 된다.

    python scripts/flow.py --who delta --who golf --depot=30,0
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

# 어느 길부터 까나.
#
# plate 가 먼저다. 마흔일곱 칸이면 화로 줄이 스스로 비워지고, 그 순간
# 막혀 있던 스물두 대가 한꺼번에 살아난다. 가장 짧은 길이 가장 큰 매듭을
# 푸는 경우다.
#
# 그 다음이 ore(밭 -> 화로), field(채굴기 -> 밭 머리), depot(창고 입출).
ORDER = ("plate", "ore", "field", "depot")

PER_TRIP = 14             # 한 걸음에 까는 칸 수

# 걷어낼 때는 «그 칸만» 집는다.
#
# demolish 는 기본 반경이 1.5 다. 사람이 「저거 치워」라고 가리킬 때는 그
# 너그러움이 맞다 - 반 칸 어긋나게 찍어도 알아들어야 한다.
#
# 그런데 벨트 한 줄을 돌릴 때는 정반대다. 옆 칸에도 벨트가 있으므로 반경
# 1.5 는 «이웃»을 집는다. 이웃을 걷고 제자리에 세우면, 세우려던 칸은 여전히
# 차 있어 build 가 실패하고 걷어낸 이웃 자리에 구멍이 남는다.
#
#     실측: 차선 y=11 의 x=38..51 열네 칸이 통째로 사라졌다.
#           걷기는 열네 번 됐고 세우기는 한 번도 안 됐다.
#
# 줄 안에서 한 칸을 고를 때는 너그러움이 곧 오작동이다.
#
# 다만 좁히기만 해서는 안 된다. 좌표계가 어긋나 있기 때문이다.
#
#   계획이 말하는 (28,-2)  = 타일 «모서리»
#   벨트가 실제로 선 자리   = (28.5, -1.5) = 타일 «중심»
#
# 둘은 0.707 떨어져 있다. 반경 0.4 로 모서리를 찍으면 «아무것도» 안 잡힌다.
# 그렇다고 0.75 로 넓히면 서쪽 이웃(27.5,-1.5)도 정확히 0.707 이라 둘 중
# 무엇이 잡힐지 모른다 - 모서리는 네 타일이 만나는 자리라 애초에 한 칸을
# 가리킬 수 없다.
#
#   한 칸을 가리키려면 그 칸의 «가운데»를 가리켜야 한다.
#
# 중심에서 재면 제 것은 0, 이웃은 1.0 이다. 그제야 0.4 가 뜻을 가진다.
TIGHT = 0.4


def middle(x, y):
    """타일 번호를 그 칸의 «가운데»로. 한 칸만 집으려면 여기를 찍는다."""
    return x + 0.5, y + 0.5
PARTS = {                 # 한 칸에 드는 재료 (넉넉히)
    "transport-belt": {"iron-plate": 2},
    "inserter": {"iron-plate": 3, "copper-plate": 2},
    "burner-inserter": {"iron-plate": 3},
    "iron-chest": {"iron-plate": 8},
    "wooden-chest": {"wood": 2},
}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def left_on(ai, who, which):
    try:
        return int((ai.flow_plan(who, which, limit=1) or {}).get("left") or 0)
    except RconError:
        return 0


def shopping(shelf, need):
    out = []
    for item, count in need.items():
        at = shelf.get(item)
        if at and count > 0:
            out.append(("take", {"name": item, "x": at[0], "y": at[1],
                                 "count": count}))
    return out


def lay(ai, who, which, shelf):
    """내 몫을 받아 깐다. 다 못 구해도 «구한 만큼»은 깐다.

    예전 크루가 남긴 교훈이다: 벨트 스무 개를 만들 철판이 없으면 열두
    개도 안 깔았고, 그러면 길은 영영 안 이어졌다.
    """
    try:
        todo = _rows(ai.claim_work(who, which, PER_TRIP).get("todo"))
    except RconError:
        return False
    if not todo:
        return False

    want: dict = {}
    for one in todo:
        # 돌리는 칸은 걷어낸 것이 손에 돌아오므로 새로 만들 필요가 없다.
        if one.get("turn"):
            continue
        part = one.get("what")
        want[part] = want.get(part, 0) + 1
    need: dict = {}
    for part, count in want.items():
        for item, each in PARTS.get(part, {}).items():
            need[item] = need.get(item, 0) + each * count

    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1})]
    plan += shopping(shelf, need)
    for part, count in want.items():
        plan.append(("craft", {"recipe": part, "count": count, "wait": False}))

    first = todo[0]
    plan.append(("walk_to", {"x": first["x"] + 2, "y": first["y"] + 2}))
    for one in todo:
        # 우리 상자가 앉아 있는 칸은 걷어내고 깐다. 채굴기 떨구는 자리의
        # 상자는 «벨트가 아직 없을 때의 임시 출구»이고, 벨트가 오면 그
        # 자리는 벨트 것이다.
        if one.get("lift"):
            mx, my = middle(one["x"], one["y"])
            plan.append(("demolish", {"x": mx, "y": my,
                                      "name": one["lift"],
                                      "search_radius": TIGHT}))
        # 모드는 «돌려라»(turn)와 «세워라»를 구분해서 준다. 그런데 이쪽은
        # 둘 다 build 로 처리했다. 이미 벨트가 선 칸에 build 는 못 하므로
        # 그 칸은 «영원히 할 일»로 남고, 순번마다 같은 여섯 칸이 다시
        # 배당된다.
        #
        #     실측: golf 과 alpha 가 (25,11) 과 (39,11) 을 수십 번 받았다.
        #           그 칸의 벨트는 전부 d12(서쪽), 계획은 d4(동쪽)였다.
        #
        # 돌리는 일은 세우는 일이 아니다. 걷고 다시 세워야 방향이 바뀐다.
        if one.get("turn"):
            mx, my = middle(one["x"], one["y"])
            plan.append(("demolish", {"x": mx, "y": my,
                                      "name": one["what"],
                                      "search_radius": TIGHT}))
        plan.append(("build", {"name": one["what"], "x": one["x"],
                               "y": one["y"], "direction": one.get("dir", 0)}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: {which} {len(todo)}칸 "
          f"({first['x']},{first['y']}) 부터 - {dict(want)}")
    return True


def load_belts(ai, who):
    """깔았으면 «싣는다».

    버너 채굴기는 인서터 없이 벨트에 직접 떨군다. 그런데 벨트를 깐다고
    저절로 그쪽을 보지는 않는다 - 상자가 안 찼으면 막힌 것이 아니므로
    예전 방향 그대로다.

    길을 깐 일과 그 길에 싣는 일은 다른 일이다. 앞의 것만 하고 뒤의 것을
    빠뜨리면 벨트는 장식이 된다.
    """
    try:
        fed = ai.feed_belts(who)
    except RconError:
        return
    turned = _rows(fed.get("turned"))
    if turned:
        print(f"  채굴기 {len(turned)}대를 벨트 쪽으로 돌렸다 "
              f"- 이제 상자가 아니라 벨트에 떨군다")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--depot", required=True, help="음수는 --depot=-5,-90")
    ap.add_argument("--only", default=None, help="이 흐름만. 예: plate")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    crew = args.who or ["delta"]
    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5),
             "copper-plate": (dx + 0.5, dy + 6.5),
             "wood": (dx + 0.5, dy + 2.5)}
    order = (args.only,) if args.only else ORDER

    ai = AIBridge()
    quiet = 0
    for _ in range(args.rounds):
        try:
            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue

            rest = {w: left_on(ai, free[0], w) for w in order}
            if not any(rest.values()):
                print(f"  길이 다 이어졌다 - {rest}")
                return 0

            # 사용자: "벨트깔아서 물류를 구성하는게 최우선으로 진행해줘"
            #
            # 한 순번에 한 사람만 보내고 있었다. claim_work 가 «남이 집어간
            # 칸은 안 준다»고 이미 보장하므로, 여럿이 같은 길에 붙어도
            # 서로 밟지 않는다 - 한 명씩 보낼 이유가 없었다.
            #
            # 길은 남은 칸이 많은 쪽부터 나눠 맡는다.
            did = False
            live = [w for w in order if rest.get(w)]
            live.sort(key=lambda w: -rest[w])
            for i, who in enumerate(list(free)):
                which = live[i % len(live)] if live else None
                if not which:
                    break
                if lay(ai, who, which, shelf):
                    did = True
                    load_belts(ai, who)

            quiet = 0 if did else quiet + 1
            if quiet and quiet % 8 == 0:
                print(f"  {quiet}번째 빈 순번 - 남은 칸 {rest}")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

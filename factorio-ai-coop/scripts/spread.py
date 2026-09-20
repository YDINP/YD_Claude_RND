"""Standing posts: when there is nothing to do, do not stand together.

사용자: "애들 대기시킬때 한곳에 뭉쳐있게하지 말것."

일이 끝나면 모두가 창고 앞으로 돌아온다. 계획의 마지막 걸음이 거기고,
다음 일도 거기서 시작하기 때문이다. 그래서 한가한 사람은 전부 한 칸에
겹쳐 선다.

18회차의 시체 여덟 구는 (41,-114) 부터 (59,-113) 사이, 제련구역과 창고
사이 좁은 곳에 몰려 있었다. 한 무리가 그 자리를 지나가면 여덟이 한꺼번에
죽는다 - 뭉쳐 있다는 것은 «한 번에 전부 잃을 수 있다»는 뜻이다.

그리고 뭉쳐 있으면 서로의 길을 막는다. 창고 앞 한 칸에 넷이 서 있으면
다섯 번째는 그 칸에 못 들어가 돌아서 온다.

    쉴 때는 흩어져서, «총 옆에서» 쉰다.

자리는 포탑에서 고른다. 포탑 옆은 이미 지켜지는 자리이고, 포탑은 지킬
것이 있는 곳에 서 있으므로 다음 일에서도 멀지 않다.

    python scripts/spread.py --depot=30,0
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError   # noqa: E402
from orders import submit                # noqa: E402
from guard import holdings, standing_turrets  # noqa: E402

TOO_CLOSE = 7             # 한가한 둘이 이만큼 가까우면 «뭉친» 것이다
AT_POST = 8               # 제 자리에서 이만큼 안이면 온 것으로 친다
STEP_OFF = 3              # 포탑 바로 위에 서면 포탑을 가린다. 옆에 선다


def roster(ai):
    out = {}
    for row in ai.list():
        if not row.get("alive"):
            continue
        out[row["name"]] = {
            "busy": bool(row.get("current") or row.get("queued")),
            "x": float(row.get("x") or 0), "y": float(row.get("y") or 0),
        }
    return out


def spread_out(spots, want):
    """멀리 떨어진 것부터 고른다.

    포탑이 마흔 대 있어도 앞에서부터 여덟을 집으면 여덟이 다시 한 구석에
    모인다. 「흩어지게」가 목적이므로 고르는 방법도 흩어지는 쪽이어야 한다.
    """
    if not spots:
        return []
    picked = [max(spots, key=lambda p: p[0] * p[0] + p[1] * p[1])]
    while len(picked) < want and len(picked) < len(spots):
        far = max(spots,
                  key=lambda p: min(math.hypot(p[0] - q[0], p[1] - q[1])
                                    for q in picked))
        if far in picked:
            break
        picked.append(far)
    return picked


def posts(ai, names):
    """사람마다 «자기 자리». 포탑 옆이 첫째 선택이다."""
    turrets = [(t[0], t[1]) for t in standing_turrets(ai)]
    spots = spread_out(turrets, len(names))
    if len(spots) < len(names):
        # 포탑이 모자라면 건물들 테두리에서 채운다.
        ours = [(p[0], p[1]) for p in holdings(ai)]
        spots += spread_out([p for p in ours if p not in spots],
                            len(names) - len(spots))
    out = {}
    for i, name in enumerate(sorted(names)):
        if i < len(spots):
            # 포탑 칸 자체가 아니라 그 옆. 번호마다 다른 쪽으로 비킨다.
            side = ((i % 4) * 90) * math.pi / 180
            out[name] = (spots[i][0] + math.cos(side) * STEP_OFF,
                         spots[i][1] + math.sin(side) * STEP_OFF)
    return out


def huddled(crew):
    """한가한데 서로 가까이 선 사람들."""
    free = [(n, c) for n, c in crew.items() if not c["busy"]]
    out = set()
    for i, (n, a) in enumerate(free):
        for m, b in free[i + 1:]:
            if math.hypot(a["x"] - b["x"], a["y"] - b["y"]) < TOO_CLOSE:
                out.add(n)
                out.add(m)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default=None, help="음수는 --depot=-5,-90")
    ap.add_argument("--every", type=float, default=20)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            crew = roster(ai)
            if not crew:
                time.sleep(args.every)
                continue
            where = posts(ai, list(crew))
            packed = huddled(crew)

            sent = []
            for name, me in crew.items():
                if me["busy"] or name not in where:
                    continue
                post = where[name]
                gap = math.hypot(me["x"] - post[0], me["y"] - post[1])
                # 뭉쳐 있으면 무조건 보낸다. 아니면 «제 자리에서 멀 때»만.
                if name not in packed and gap <= AT_POST:
                    continue
                submit(ai, name, [("walk_to", {"x": post[0], "y": post[1]})],
                       strict=False)
                sent.append(f"{name}->({post[0]:.0f},{post[1]:.0f})")
            if sent:
                why = f"뭉쳐 있던 {len(packed)}명 포함 " if packed else ""
                print(f"  {why}제 자리로: {' '.join(sent)}")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

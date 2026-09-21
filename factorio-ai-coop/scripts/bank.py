"""A belt that fills and never empties needs a door, not more belt.

사용자가 짚었다 - "철판/구리판 등 화로에서 나오는애들이 지금 상자로
안들어가는듯"

`lines.py` 가 그것을 이미 세고 있었다.

    칸수  실림  채굴기  넣는팔  빼는팔   무엇이 모자란가
      79    74      0      12       0   나가는 데가 없다 - 꽉 찬다
      60    54      1       6       0   나가는 데가 없다 - 꽉 찬다

화로 스물넷이 판금을 내고, 팔 열둘이 그것을 벨트에 얹고, 벨트는 꽉 찬
채로 선다. 뒤로 밀려 화로 결과칸이 차면 화로도 선다. 그 줄에는 상자가
«한 개도» 없었다.

    깐 길과 「그 길에서 내리는 일」은 다른 일이다 - sink.py 가 이미
    배운 교훈인데, sink.py 는 «있는 상자»를 벨트에 잇는 도구다.
    상자가 아예 없는 줄에는 쓸 것이 없다.

그래서 이 스크립트는 상자부터 세운다. 벨트 옆에 팔, 그 옆에 상자.
줄 끝에 문 하나를 내지 않고 «줄을 따라 집집마다» 낸다 - 상자 하나가
차면 그 팔은 멈추고 뒤엣것은 그대로 밀리기 때문이다.

    벨트 ■■■■■■■■■■■■
    팔   i i i i i i
    상자 C C C C C C

팔의 direction 은 «집는 쪽»이다. 벨트가 위에 있으면 north.

    python scripts/bank.py                       # 어디가 필요한지만
    python scripts/bank.py --who delta           # 세운다
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

sys.path.insert(0, HERE)
import lines as lines_mod                # noqa: E402

ARM = "burner-inserter"
BOX = "wooden-chest"
ARM_FUEL = 8              # 버너 팔은 굶으면 선다. 세우면서 같이 먹인다

# 문 사이 간격. 1 이면 집집마다지만 벨트 한 줄에 팔이 다닥다닥 붙어
# 연료 넣어 줄 길이 없어진다. 2 로 두면 그 사이 칸이 지나는 길이 된다.
PITCH = 2
DOORS = 6                 # 한 걸음에 내는 문 수 (계획 64단계 제한)

LOADED = 0.6              # 이만큼 넘게 실려 있으면 «꽉 찬 줄»이다

# 벨트 옆을 볼 방향. 팔이 설 칸과 상자가 설 칸은 같은 쪽으로 한 칸씩.
ASIDE = ((0, 1), (0, -1), (1, 0), (-1, 0))
# 팔은 «집는 쪽»을 가리킨다. 벨트가 팔의 어느 쪽에 있나로 정해진다.
FACE_OF = {(0, 1): 0, (0, -1): 8, (1, 0): 12, (-1, 0): 4}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def choked(belt, drill, pick, put, segs) -> list:
    """채우기만 하고 뺄 데가 없는 줄. 그런 줄만 문이 필요하다."""
    out = []
    for seg in segs:
        here = set(seg)
        ins = len(here & drill) + len(here & put)
        outs = len(here & pick)
        if ins == 0:
            continue                      # 들어오는 것도 없다 - 다른 문제다
        # 「문이 하나라도 있으면 됐다」로 봤더니 79칸 줄이 팔 둘로
        # 해결된 것이 됐다. 그 줄은 여전히 86%가 차 있었고 화로에서
        # 빼는 팔 스물둘이 「놓을 데가 없다」로 서 있었다.
        #
        #     싣는 손이 열둘이면 내리는 문도 그만큼 있어야 한다.
        if outs >= ins:
            continue
        load = sum(1 for p in seg if belt[p][1] > 0)
        if load < len(seg) * LOADED:
            continue                      # 아직 안 찼다
        out.append((ins - outs, sorted(seg, key=lambda p: (p[0], p[1]))))
    out.sort(key=lambda r: (-r[0], -len(r[1])))
    return [seg for _short, seg in out]


def doors(ai, seg) -> list:
    """문을 낼 자리. [(팔칸, 팔방향, 상자칸), ...]

    벨트 «옆»으로 두 칸이 비어야 한다. 한 칸만 비면 팔은 서는데 놓을
    데가 없고, 놓을 데 없는 팔은 세운 적 없는 팔과 같다.
    """
    want = []
    for n, spot in enumerate(seg):
        if n % PITCH:
            continue
        for dx, dy in ASIDE:
            arm = (spot[0] + dx, spot[1] + dy)
            box = (spot[0] + dx * 2, spot[1] + dy * 2)
            want.append((arm, FACE_OF[(dx, dy)], box))
    if not want:
        return []
    spots = []
    for arm, _face, box in want:
        spots.append(arm)
        spots.append(box)
    open_ = lines_mod.free(ai, spots)
    out, taken = [], set()
    for arm, face, box in want:
        if arm in open_ and box in open_ and arm not in taken and box not in taken:
            out.append((arm, face, box))
            taken.add(arm)
            taken.add(box)
    return out


def build(ai, who, jobs, coal) -> bool:
    jobs = jobs[:DOORS]
    if not jobs:
        return False
    plan = [("craft", {"recipe": BOX, "count": len(jobs), "wait": False}),
            ("craft", {"recipe": ARM, "count": len(jobs), "wait": True})]
    for arm, face, box in jobs:
        plan.append(("walk_to", {"x": box[0] + 1.5, "y": box[1] + 1.5}))
        plan.append(("build", {"name": BOX, "x": box[0] + 0.5,
                               "y": box[1] + 0.5}))
        plan.append(("build", {"name": ARM, "x": arm[0] + 0.5,
                               "y": arm[1] + 0.5, "direction": face}))
        if coal:
            plan.append(("insert", {"name": "coal", "x": arm[0] + 0.5,
                                    "y": arm[1] + 0.5, "count": ARM_FUEL}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 내리는 문 {len(jobs)}개 (상자+팔"
          f"{' + 연료' if coal else ''})")
    return True


def has_coal(ai, who) -> bool:
    try:
        return int(ai.agent(who).items().get("coal", 0)) >= ARM_FUEL
    except RconError:
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()
    who = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            belt, drill, pick, put = lines_mod.look(ai)
            segs = lines_mod.segments(belt)
            sick = choked(belt, drill, pick, put, segs)
            if not sick:
                print("  꽉 찬 채 뺄 데 없는 줄 없음")
            else:
                for seg in sick[:3]:
                    load = sum(1 for p in seg if belt[p][1] > 0)
                    print(f"  {len(seg)}칸 줄에 실린 칸 {load}"
                          f" - 뺄 데가 없다"
                          f" (x {min(p[0] for p in seg)}~{max(p[0] for p in seg)}"
                          f" y {min(p[1] for p in seg)}~{max(p[1] for p in seg)})")
                if who:
                    hands = idle(ai, who)
                    if not hands:
                        print("    손이 비지 않는다")
                    else:
                        jobs = doors(ai, sick[0])
                        if not jobs:
                            print("    벨트 옆 두 칸이 나는 자리가 없다")
                        else:
                            build(ai, hands[0], jobs, has_coal(ai, hands[0]))
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

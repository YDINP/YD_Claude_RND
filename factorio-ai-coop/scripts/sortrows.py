"""Give the belt rows back to the belts.

규칙을 고치면 «앞으로» 잘못 들어가는 것이 멎는다. 이미 들어간 것은 그대로
있다 (evict.py 가 배운 것과 같은 교훈이다). 석탄 선반 여덟 상자는 규칙을
고친 뒤에도 철판으로 가득했고, 석탄 간선은 그대로 막혀 있었다.

이 스크립트는 벨트가 채우는 줄(shelf.BELT_ROWS)에서 «제 물건이 아닌 것»을
꺼내 제 줄로 옮긴다. 철판은 철판 줄로, 구리판은 구리판 줄로, 나머지는
벨트 줄이 아닌 선반으로.

급한 줄부터 한다 - 막힌 줄은 빈 칸이 0 인 줄이다.

    python scripts/sortrows.py --depot=-55,10                 # 얼마나 섞였나
    python scripts/sortrows.py --depot=-55,10 --who alpha,echo --every 40
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402

DEPOT = (-55, 10)         # 이 판의 창고 한가운데. --depot 의 기본값이다
SPAN = 36                 # 선반 줄은 동쪽으로 길게 늘었다. 그 끝까지 본다
ROWS = (-5, 0, 2, 4, 8)   # 창고 한가운데에서 본 선반 줄. 그 밖의 상자는 남의 것
# 줄마다 사람이 설 데. 상자 줄 사이의 «빈 줄»이다 - 팔과 벨트가 있는 쪽의
# 반대편. 상자 위나 벨트 위를 가리키면 길찾기가 헤맨다.
STAND = {-5: -0.5, 0: 1.5, 2: 1.5, 4: -0.5, 8: -0.5}
STACKS_PER_TRIP = 30      # 한 걸음에 옮기는 묶음 수. 가방은 여든 칸이다
MAX_STEPS = 56
STACK = {"iron-plate": 100, "copper-plate": 100, "coal": 50, "stone": 50,
         "firearm-magazine": 100, "transport-belt": 100, "wood": 100}


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def survey(ai, depot) -> list:
    """선반 줄의 상자들만."""
    return [c for c in shelf_mod.stock(ai, depot, SPAN)
            if c["y"] - depot[1] in ROWS]


def strangers(boxes, depot) -> list:
    """[(상자, 물건, 개수)] - 벨트 줄에 든 남의 물건. 꽉 막힌 줄이 먼저."""
    out = []
    for box in boxes:
        for item, count in box["held"].items():
            if not shelf_mod.fits(item, box["y"], depot):
                out.append((box, item, count))
    room_of_row = {}
    for box in boxes:
        room_of_row[box["y"]] = room_of_row.get(box["y"], 0) + box["room"]
    out.sort(key=lambda r: (room_of_row[r[0]["y"]], -r[2]))
    return out


def home(item, boxes, depot, near):
    """이 물건이 가도 되는, 빈 칸 있는 가장 가까운 상자."""
    ok = [b for b in boxes
          if b["room"] > 0 and shelf_mod.fits(item, b["y"], depot)]
    own = [b for b in ok if shelf_mod.BELT_ROWS.get(b["y"] - depot[1]) == item]
    pool = own or ok
    if not pool:
        return None
    return min(pool, key=lambda b: (b["x"] - near["x"]) ** 2 + (b["y"] - near["y"]) ** 2)


def move(ai, who, boxes, depot) -> bool:
    todo = strangers(boxes, depot)
    if not todo:
        return False
    takes, puts, stacks, moved = [], [], 0, {}
    for box, item, count in todo:
        if stacks >= STACKS_PER_TRIP or len(takes) + len(puts) >= MAX_STEPS - 4:
            break
        per = STACK.get(item, 50)
        count = min(count, (STACKS_PER_TRIP - stacks) * per)
        dest = home(item, boxes, depot, box)
        if not dest:
            continue
        need = -(-count // per)
        need = min(need, dest["room"])
        count = min(count, need * per)
        if count <= 0:
            continue
        takes.append(("walk_to", {"x": box["x"] + 0.5, "y": box["y"] + STAND[box["y"] - depot[1]]}))
        takes.append(("take", {"name": item, "x": box["x"] + 0.5,
                               "y": box["y"] + 0.5, "count": count}))
        puts.append(("walk_to", {"x": dest["x"] + 0.5, "y": dest["y"] + STAND[dest["y"] - depot[1]]}))
        puts.append(("insert", {"name": item, "x": dest["x"] + 0.5,
                                "y": dest["y"] + 0.5, "count": count}))
        dest["room"] -= need
        box["held"][item] -= count
        stacks += need
        moved[item] = moved.get(item, 0) + count
    if not takes:
        print("  옮길 데가 없다 - 제 줄이 찼다. racks.py 가 늘릴 차례")
        return False
    submit(ai, who, takes + puts, strict=False)
    print(f"{who}: 벨트 줄 비우기 - "
          + ", ".join(f"{k} {v}" for k, v in moved.items()))
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="%d,%d" % DEPOT)
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    depot = tuple(int(v) for v in args.depot.split(","))
    names = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            boxes = survey(ai, depot)
            mixed = {}
            for _box, item, count in strangers(boxes, depot):
                mixed[item] = mixed.get(item, 0) + count
            if not mixed:
                print("  벨트 줄에 남의 물건 없음")
                if args.every:
                    break                 # 다 했다. 고리로 남을 일이 아니다
            else:
                print("  벨트 줄에 섞인 것: "
                      + ", ".join(f"{k} {v}" for k, v in
                                  sorted(mixed.items(), key=lambda kv: -kv[1])[:6]))
                for who in idle(ai, names):
                    if not move(ai, who, boxes, depot):
                        break
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

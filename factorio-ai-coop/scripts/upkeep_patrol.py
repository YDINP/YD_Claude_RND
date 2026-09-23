"""Two agents whose only job is keeping fuel and ammunition topped up.

    사용자: "2명한테 주기적으로 전체적으로 연료채우게 시켜"
    사용자: "항상 연료랑 탄약같이 소비성재료들은 넉넉하게 넣어둘 것."

The crew normally does this as part of its own patrol, but when the chief
is driving by hand that patrol is off -- and a burner that stops is not
loud. It just stands there. Measured on run16: the iron and copper
end-of-lane inserters both hit `no_fuel`, and 26 of 30 drills sat at
`waiting_for_space_in_destination` with full belts. Nothing had failed;
nothing was being reported either.

So this walks two agents on a fixed beat and tops things up **before** they
run out -- see bridge/upkeep.py for the two thresholds.

    python scripts/upkeep_patrol.py --agents foxtrot,echo --every 120
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from upkeep import plan_round, running_low, stock  # noqa: E402
import detached                                     # noqa: E402


def one_round(ai: AIBridge, names: list[str]) -> None:
    # 출정·시공에 딸린 사람은 건드리지 않는다 (detached.py). 이 루프만 submit_plan 을
    # 바로 불러 그 표를 안 봤다 - milbelt 시공 중 delta 의 계획이 급유 순번으로 덮였다.
    names = [n for n in names if detached.mine(n)]
    if not names:
        return
    low = running_low(ai)
    shelves = stock(ai)
    if not low:
        print(f"   다 넉넉하다 (창고 {sum(len(v) for v in shelves.values())}곳)")
        return

    bags = {}
    for who in names:
        try:
            bags[who] = ai.agent(who).items()
        except RconError:
            bags[who] = {}

    rounds, excuses = plan_round(names, low, shelves, bags)
    for who, plan in rounds:
        try:
            ai.agent(who).submit_plan(plan)
        except RconError as exc:
            print(f"   {who} 에게 못 시켰다: {exc}")
            continue
        fed = [step for kind, step in plan if kind == "insert"]
        print(f"   {who}: {len(low)}대 모자란 것 중 {len(fed)}대 "
              f"({fed[0]['name']} {sum(s['count'] for s in fed)}개)")
    # 아무 일도 못 하고 조용히 끝나면 그 침묵이 「이상 없음」으로 읽힌다.
    for line in excuses:
        print(f"   {line}")
    if not rounds and not excuses:
        print(f"   모자란 {len(low)}대를 아무도 못 맡았다")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agents", default="foxtrot,echo",
                    help="쉼표로 나눈 이름. 이 둘만 소비성 재료를 나른다.")
    ap.add_argument("--every", type=int, default=120, help="한 바퀴 사이 초")
    ap.add_argument("--once", action="store_true", help="한 바퀴만 돌고 끝낸다")
    args = ap.parse_args()

    names = [n.strip() for n in args.agents.split(",") if n.strip()]
    if not names:
        print("담당을 한 명은 지정해야 한다")
        return 2

    ai = AIBridge()
    while True:
        try:
            one_round(ai, names)
        except RconError as exc:
            print(f"   게임이 대답하지 않는다: {exc}")
        if args.once:
            return 0
        time.sleep(args.every)


if __name__ == "__main__":
    sys.exit(main())

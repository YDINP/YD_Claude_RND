"""Two agents whose only job is keeping every burner fed.

The crew normally refuels as part of its own patrol, but when the chief is
driving by hand that patrol is off, and a burner that stops is not loud --
it just stands there. One starved arm at the end of a lane stalls every
drill behind it, so the whole field goes quiet without a single error.

Measured on run16: the iron and copper end-of-lane inserters both hit
`no_fuel`, and 26 of 30 drills sat at `waiting_for_space_in_destination`
with full belts. Nothing had failed; nothing was being reported either.

This walks two agents around the map on a fixed beat: ask the game which
burners are starved, take coal from the nearest chest that actually holds
enough, and pour it in. The arm at the end of a lane is fed first -- it is
the one that unblocks the others.

    python scripts/fuel_patrol.py --agents foxtrot,echo --every 120
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from fuel import coal_sources, plan_round, starved  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agents", default="foxtrot,echo",
                    help="쉼표로 나눈 이름. 이 둘만 연료를 나른다.")
    ap.add_argument("--every", type=int, default=120, help="한 바퀴 사이 초")
    ap.add_argument("--once", action="store_true", help="한 바퀴만 돌고 끝낸다")
    args = ap.parse_args()

    names = [n.strip() for n in args.agents.split(",") if n.strip()]
    if len(names) < 1:
        print("연료 담당을 한 명은 지정해야 한다")
        return 2

    ai = AIBridge()
    while True:
        try:
            hungry = starved(ai)
            sources = coal_sources(ai)
        except RconError as exc:
            print(f"   게임이 대답하지 않는다: {exc}")
            time.sleep(args.every)
            continue

        if not hungry:
            print(f"   굶은 기계 없음 (석탄 상자 {len(sources)}곳)")
        elif not sources:
            print(f"   굶은 기계 {len(hungry)}대인데 «퍼올 석탄 상자가 없다»")
        else:
            bags = {}
            for who in names:
                try:
                    bags[who] = ai.agent(who).items().get("coal", 0)
                except RconError:
                    bags[who] = 0
            rounds, excuses = plan_round(names, hungry, sources, bags)
            for who, plan in rounds:
                try:
                    ai.agent(who).submit_plan(plan)
                except RconError as exc:
                    print(f"   {who} 에게 못 시켰다: {exc}")
                    continue
                fed = sum(1 for kind, _ in plan if kind == "insert")
                print(f"   {who}: 굶은 {len(hungry)}대 중 {fed}대 급유")
            # 아무 일도 못 하고 조용히 끝나면 그 침묵이 「이상 없음」으로
            # 읽힌다. 못 한 것은 못 했다고 말해야 사람이 손을 쓴다.
            for line in excuses:
                print(f"   {line}")
            if not rounds and not excuses:
                print(f"   굶은 {len(hungry)}대를 아무도 못 맡았다")

        if args.once:
            return 0
        time.sleep(args.every)


if __name__ == "__main__":
    sys.exit(main())

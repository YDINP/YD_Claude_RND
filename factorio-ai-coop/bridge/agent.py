"""The crew: several AI characters listening to one human's orders in chat.

This file is only the front door. The work lives in modules named after what
they are responsible for, so that adding a feature means opening one file:

    settings.py     the numbers you may want to turn
    world.py        Snapshot - what the game looks like right now
    jobs.py         Job - one piece of work, and how to say it in Korean
    layout.py       pure: where to put things
    ladder.py       pure: what is worth doing, best first
    worker.py       Worker - one character's state
    crew/           the only part that touches the game, split by trade:
                    roster, talk, supply, power, mining, factory,
                    survey, tending, watch

    mission.py      pure: the goal ladder and the request board
    brain.py        the crew chief: reads what the human wrote and splits it

Nothing here reads the human's words by matching keywords. A table of words
could not tell "stop" from "the drills have stopped", and a report of a problem
would halt the whole crew. Sentences go to the part that can read them.

Keeping the pure parts pure means the interesting logic is testable without a
running Factorio server, which matters because it is exactly the logic that is
hard to debug through a game window.

    python bridge/agent.py                  # two agents, working on their own
    python bridge/agent.py --agents 4       # four of them, one per resource
    python bridge/agent.py --manual         # wait for orders instead
    python bridge/agent.py --observer NAME  # put that player in the observer seat
"""

from __future__ import annotations

import argparse
import sys

from client import AIBridge, RconError

from crew import Crew
from settings import CALL_SIGNS

# 밖에서 부르던 이름은 그대로 여기서도 불린다. 파일을 가른 것은 안쪽 사정이지
# 부르는 쪽이 고쳐야 할 일이 아니다.
from jobs import Job, Step, Intent, errand_label, blocked_by  # noqa: F401
from world import Snapshot  # noqa: F401
from worker import Worker  # noqa: F401
from layout import (belt_pairs, carry_split, cluster, furnace_seat,  # noqa: F401
                    interleave, nearest_to, orphan_drills, spread_sites)
from ladder import (STAGE_TARGET, chain_job, drill_target,  # noqa: F401
                    furnace_target, missing_item, next_goal, plan, rebalance,
                    worth_building)
from settings import FOCUS_ORDER, STUCK_STRIKES  # noqa: F401


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agents", type=int, default=2, help="how many to start with")
    parser.add_argument("--manual", action="store_true",
                        help="wait for orders instead of working on their own")
    parser.add_argument("--no-llm", action="store_true",
                        help="rules only; do not ask the Claude CLI about unknown lines")
    parser.add_argument("--observer", metavar="PLAYER",
                        help="put this player in the observer seat on startup")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    bridge = AIBridge()
    crew = Crew(bridge, autopilot=not args.manual, use_llm=not args.no_llm)
    crew.prime()
    crew.sync_roster()

    if args.observer:
        try:
            free = next((s for s in CALL_SIGNS if s not in crew.workers), None)
            result = bridge.spectate(args.observer, adopt_as=free)
            if result.get("adopted"):
                crew.adopt(result["adopted"])
        except RconError as exc:
            print(f"[warn] could not switch {args.observer} to observer: {exc}", file=sys.stderr)

    while len(crew.workers) < max(1, args.agents):
        if not crew.hire():
            break

    roles = ", ".join(f"{w.name}={w.focus}" for w in crew.workers.values())
    crew.say(f"{len(crew.workers)}명 나왔습니다 ({roles}). "
             + ("지시 기다리겠습니다." if args.manual else "알아서 진행하겠습니다.")
             + f" '{'/'.join(crew.names)}' 또는 '1번', '모두'로 부르시면 됩니다.")
    try:
        crew.run(interval=args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        # Leaving without saving is how an hour of the crew's work disappears.
        try:
            bridge.save()
            print("saved the world before leaving")
        except RconError as exc:
            print(f"[warn] could not save on the way out: {exc}", file=sys.stderr)
        bridge.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

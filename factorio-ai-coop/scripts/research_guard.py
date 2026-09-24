"""Keep the research queue filled with techs we can actually feed.

대기열이 비면 게임이 아무 연구나 고른다. 22회차에 세 번 그랬다 (defender 두 번, advanced-combinators
한 번 - 화학팩). 연구소 22대가 모두 서고, 역압이 조립기 -> 화로 -> 채굴기까지 올라가 막힘이 56% 가
됐다. 사람이 아니라 루프가 지킨다.

    python scripts/research_guard.py --every 60
    python scripts/research_guard.py --packs automation-science-pack,logistic-science-pack,chemical-science-pack
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
import p4                                # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=60)
    ap.add_argument("--packs", default="automation-science-pack,logistic-science-pack")
    args = ap.parse_args()
    packs = tuple(p.strip() for p in args.packs.split(",") if p.strip())
    ai = AIBridge()
    last = None
    while True:
        try:
            q = p4.queue_fill(ai, packs)
            if q != last:
                print(time.strftime("%X"), "대기열", q, flush=True)
                last = q
            if not q:
                print(time.strftime("%X"), "먹일 수 있는 연구가 없다 - 연구소가 선다 (다음 팩이 필요하다)", flush=True)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc, flush=True)
        time.sleep(args.every)


if __name__ == "__main__":
    raise SystemExit(main())

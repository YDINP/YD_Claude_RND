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
    ap.add_argument("--skip", default="", help="이 접두사로 시작하는 연구는 고르지 않는다 (쉼표)")
    ap.add_argument("--prefer", default="", help="이 접두사 순서로 먼저 (쉼표, 없으면 p4.PREFER)")
    ap.add_argument("--gate", default="", help="팩:켜는수:끄는수 - 연구소 · 조립기 결과칸에 든 그 팩이 켜는수 이상이면 쓰고 끄는수 미만이면 뺀다 "
                                              "(24회차 20:30: 초록 0 인데 logistics-2 를 골라 연구소 4 중 3 이 missing_science_packs)")
    args = ap.parse_args()
    packs = tuple(p.strip() for p in args.packs.split(",") if p.strip())
    skip = tuple(p.strip() for p in args.skip.split(",") if p.strip())
    prefer = tuple(p.strip() for p in args.prefer.split(",") if p.strip()) or p4.PREFER
    ai = AIBridge()
    last = None
    gates = {}
    for g in (x for x in args.gate.split(",") if x.strip()):
        name, on, off = g.split(":")
        gates[name] = [int(on), int(off), False]
    while True:
        try:
            use = list(packs)
            for name, gate in gates.items():
                have = ai.lua("""(function() local s, n = game.surfaces[1], 0
                  for _, l in pairs(s.find_entities_filtered{type = "lab", force = "player"}) do n = n + l.get_item_count("%s") end
                  for _, m in pairs(s.find_entities_filtered{type = "assembling-machine", force = "player"}) do
                    n = n + m.get_inventory(defines.inventory.assembling_machine_output).get_item_count("%s") end
                  return {n = n} end)()""" % (name, name)).get("n", 0)
                if not gate[2] and have >= gate[0]:
                    gate[2] = True
                    print(time.strftime("%X"), f"{name} {have} - 켠다", flush=True)
                elif gate[2] and have < gate[1]:
                    gate[2] = False
                    print(time.strftime("%X"), f"{name} {have} - 끈다 (그 팩 연구는 대기열에서 뺀다)", flush=True)
                if not gate[2] and name in use:
                    use.remove(name)
            q = p4.queue_fill(ai, tuple(use), prefer=prefer, skip=skip)
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

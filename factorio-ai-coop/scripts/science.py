"""Labs do not queue up. Somebody has to keep walking to them.

연구소는 창고에서 110칸 떨어진 호숫가에 있다(물이 거기뿐이라 발전소가
거기 섰고, 연구소는 발전소 옆에 섰다). 21회차에 연구는 «내가 생각날 때»
한 번씩 갔다 - 그 사이는 2% 에서 며칠을 멈춰 있었다.

    연구 진행: 0.02 -> (한 번 넣음) 0.42 -> (빈 채로) -> (한 번 넣음) 0.70

이 고리는 연구소가 비면 사람 하나를 보낸다. 재료는 창고에서 챙긴다 -
가방에 든 것을 믿지 않는다(stow.py 가 비운다).

    빨간 과학 1 = 구리판 1 + 톱니 1(철판 2).  60개 = 철판 120 + 구리판 60

    python scripts/science.py                       # 연구소만 본다
    python scripts/science.py --who hotel --every 90
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

SCIENCE = "automation-science-pack"
LOW = 10                  # 연구소 하나에 이보다 적으면 보낸다
BATCH = 60                # 연구소 하나당 한 번에 넣는 수
DEPOT = (-55, 10)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def labs(ai) -> list:
    """[{x, y, packs}] 와 지금 연구."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, l in pairs(s.find_entities_filtered{name = "lab", force = f}) do
        out[#out+1] = l.position.x .. "|" .. l.position.y .. "|"
                   .. l.get_item_count("%s")
      end
      local r = f.current_research
      return { labs = out, research = r and r.name or "",
               progress = f.research_progress }
    end)()""" % SCIENCE)
    rows = []
    for row in _rows(reply.get("labs")):
        x, y, n = str(row).split("|")
        rows.append({"x": float(x), "y": float(y), "packs": int(n)})
    return rows, str(reply.get("research") or ""), float(reply.get("progress") or 0)


def send(ai, who, hungry) -> bool:
    need = BATCH * len(hungry)
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    if "iron-plate" not in have or "copper-plate" not in have:
        print("  창고에 판이 없다")
        return False
    fe, cu = have["iron-plate"], have["copper-plate"]
    plan = [("walk_to", {"x": fe[0], "y": fe[1] + 1.5}),
            ("take", {"name": "iron-plate", "x": fe[0], "y": fe[1], "count": need * 2}),
            ("walk_to", {"x": cu[0], "y": cu[1] + 1.5}),
            ("take", {"name": "copper-plate", "x": cu[0], "y": cu[1], "count": need}),
            ("craft", {"recipe": SCIENCE, "count": need, "wait": True})]
    for lab in hungry:
        plan.append(("walk_to", {"x": lab["x"], "y": lab["y"] + 2}))
        plan.append(("insert", {"name": SCIENCE, "x": lab["x"], "y": lab["y"],
                                "count": BATCH}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 빨간 과학 {need}개 -> 연구소 {len(hungry)}곳")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    names = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    last = None
    for _ in range(args.rounds if args.every else 1):
        try:
            rows, research, progress = labs(ai)
            hungry = [l for l in rows if l["packs"] < LOW]
            key = (research, round(progress, 2), len(hungry))
            if key != last:
                last = key
                print(f"  연구 {research or '없음'} {progress:.0%} · 연구소 {len(rows)}곳"
                      f" · 빈 곳 {len(hungry)}")
            if not research:
                print("  [!] 연구 목표가 없다 - 다음 기술을 골라야 한다")
            elif hungry and names:
                hands = idle(ai, names)
                if hands:
                    send(ai, hands[0], hungry)
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

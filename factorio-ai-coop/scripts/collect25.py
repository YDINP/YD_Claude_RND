"""run25 P0 plate round: furnace result slots -> hub chest, by hand. Character orders only.

버너 채굴기 -> 화로 직결 줄은 판을 화로 결과칸에 쌓는다 (100 이 차면 화로가 선다).
한 사람이 «많이 찬 화로부터» 판을 꺼내 허브 상자에 넣는다. 자동화 부채 - 전기 채굴기 · 벨트 줄이
서면 끈다. 세계를 바꾸는 것은 walk_to · take · insert 일감뿐, 게임에는 읽기만 묻는다.

    python scripts/collect25.py --run run25 --who echo --every 45
    python scripts/collect25.py --run run25 --who echo --once
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import detached                         # noqa: E402

OWNER = "collect25"
MIN = 12            # 이보다 적게 든 화로는 들르지 않는다
PER_ROUND = 14      # 한 바퀴에 들르는 화로


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def survey(ai, near, radius) -> list:
    """[(x, y, 판 이름, 개수)] - 화로 결과칸 (읽기만)."""
    reply = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for _, e in pairs(s.find_entities_filtered{type = "furnace", force = "player", position = {%f, %f}, radius = %d}) do
        local inv = e.get_inventory(defines.inventory.furnace_result)
        if inv then
          for _, it in pairs(inv.get_contents()) do
            if it.count >= %d then out[#out+1] = string.format("%%.1f,%%.1f,%%s,%%d", e.position.x, e.position.y, it.name, it.count) end
          end
        end
      end
      return out
    end)()""" % (near[0], near[1], radius, MIN))
    got = []
    for r in _rows(reply):
        x, y, name, n = str(r).split(",")
        got.append((float(x), float(y), name, int(n)))
    got.sort(key=lambda t: -t[3])
    return got


def plan_round(full, hub) -> list:
    plan, carry = [], {}
    for x, y, name, n in full[:PER_ROUND]:
        plan += [("walk_to", {"x": x + 0.5, "y": y + 2.0}),
                 ("take", {"name": name, "x": x, "y": y, "count": n})]
        carry[name] = carry.get(name, 0) + n
    plan.append(("walk_to", {"x": hub[0], "y": hub[1] + 1.5}))
    for name, n in carry.items():
        plan.append(("insert", {"name": name, "x": hub[0], "y": hub[1], "count": n}))
    return plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="echo")
    ap.add_argument("--every", type=float, default=45)
    ap.add_argument("--radius", type=int, default=60)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    site = runsite.load()
    hub = tuple(site["hub"])
    near = tuple(site.get("center") or hub)
    os.environ[detached.ENV] = OWNER
    ai = AIBridge()
    detached.mark([a.who], OWNER, minutes=600)
    try:
        while True:
            try:
                full = survey(ai, near, a.radius)
                live = {w["name"]: w for w in ai.list()}
                me = live.get(a.who, {})
                busy = me.get("current") or me.get("queued")
                print(time.strftime("%X"), f"찬 화로 {len(full)} · 판 {sum(t[3] for t in full)}"
                      + (" - 순회 중" if busy else ""), flush=True)
                if full and not busy:
                    submit(ai, a.who, plan_round(full, hub), strict=False)
            except RconError as exc:
                print("  게임이 대답하지 않는다:", exc, flush=True)
            if a.once:
                return 0
            detached.mark([a.who], OWNER, minutes=600)
            time.sleep(a.every)
    finally:
        if a.once:
            pass


if __name__ == "__main__":
    raise SystemExit(main())

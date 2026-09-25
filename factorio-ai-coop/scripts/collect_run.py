"""P0/P1 plate round: furnace outputs -> hub chests. Automation debt #2.

교리 v2 규칙 6. 버너 직결 화로는 판을 결과칸(100)에 쌓는다 - 차면 화로가 서고, 그 뒤
채굴기가 선다. 건설하는 사람이 판을 찾아 화로 스무 곳을 도는 대신, 한 사람이 모아
허브 상자에 둔다. P2 에서 판이 벨트(버스)로 흐르면 끈다.

허브 상자가 다 차면 쇠 상자를 하나 더 만든다 (철판 8) - 허브 줄 HUB_ROW 에.

    python scripts/collect_run.py --who alpha --every 60
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
import detached                          # noqa: E402

OWNER = "collect"
import p1 as _p1                                       # 허브 줄은 회차 설정 파일에서 (p1 이 읽는다)
HUB_ROW_Y = _p1.HUB_Y
_H0 = _p1.HUB_X0 + 4                                   # 첫 칸은 P0 의 나무 상자
HUB_XS = tuple(_H0 + d for d in (0, 1, 2, 3, 4, 5, 6))
TAKE_AT = 15          # 이보다 많이 든 화로만 들른다
PER_ROUND = 25


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def survey(ai) -> tuple:
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local full, hub = {}, {}
      for _, u in pairs(s.find_entities_filtered{type = "furnace", force = f}) do
        local r = u.get_inventory(defines.inventory.furnace_result)
        for _, v in pairs(r.get_contents()) do
          if v.count >= %d then full[#full+1] = string.format("%%.1f,%%.1f,%%s,%%d", u.position.x, u.position.y, v.name, v.count) end
        end
      end
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f,
              area = {{%f, %f}, {%f, %f}}}) do
        hub[#hub+1] = string.format("%%.1f,%%.1f,%%d", c.position.x, c.position.y,
                                    c.get_inventory(defines.inventory.chest).count_empty_stacks())
      end
      return {full = full, hub = hub}
    end)()""" % (TAKE_AT, _p1.HUB_X0, HUB_ROW_Y - 0.6, _p1.HUB_X1, HUB_ROW_Y + 0.6))
    full = []
    for r in _rows(reply.get("full")):
        x, y, n, c = str(r).split(",")
        full.append((float(x), float(y), n, int(c)))
    hub = [tuple(float(v) for v in str(r).split(",")) for r in _rows(reply.get("hub"))]
    return full, hub


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="alpha")
    ap.add_argument("--every", type=float, default=60)
    args = ap.parse_args()
    os.environ[detached.ENV] = OWNER
    ai = AIBridge()
    detached.mark([args.who], OWNER, minutes=600)
    try:
        while True:
            try:
                full, hub = survey(ai)
                me = {w["name"]: w for w in ai.list()}.get(args.who, {})
                busy = me.get("current") or me.get("queued")
                total = sum(c for *_x, c in full)
                print(f"  찬 화로 {len(full)} (판 {total}) · 허브 상자 {len(hub)} 빈칸 {sum(h[2] for h in hub):.0f}"
                      + (" - 도는 중" if busy else ""))
                if full and not busy:
                    full.sort(key=lambda t: -t[3])
                    plan = []
                    for x, y, n, c in full[:PER_ROUND]:
                        plan += [("walk_to", {"x": x + 0.5, "y": y + 2.0}),
                                 ("take", {"name": n, "x": x, "y": y, "count": c})]
                    room = sum(h[2] for h in hub)
                    if room < 6:
                        free = [x for x in HUB_XS if all(abs(x - h[0]) > 0.4 for h in hub)]
                        if free:
                            plan += [("craft", {"recipe": "iron-chest", "count": 1, "wait": True}),
                                     ("walk_to", {"x": free[0], "y": HUB_ROW_Y + 1.5}),
                                     ("build", {"name": "iron-chest", "x": free[0], "y": HUB_ROW_Y})]
                            hub.append((free[0], HUB_ROW_Y, 32))
                    names = sorted({n for _x, _y, n, _c in full[:PER_ROUND]})
                    target = max(hub, key=lambda h: h[2])
                    plan.append(("walk_to", {"x": target[0], "y": HUB_ROW_Y + 1.5}))
                    for n in names:
                        got = sum(c for _x, _y, nn, c in full[:PER_ROUND] if nn == n)
                        plan.append(("insert", {"name": n, "x": target[0], "y": HUB_ROW_Y, "count": got}))
                    submit(ai, args.who, plan[:60], strict=False)
            except RconError as exc:
                print("  게임이 대답하지 않는다:", exc)
            time.sleep(args.every)
    finally:
        detached.release([args.who])


if __name__ == "__main__":
    raise SystemExit(main())

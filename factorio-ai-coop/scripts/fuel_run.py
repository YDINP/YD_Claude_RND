"""P0 fuel round: coal chests -> burner drills, furnaces, boiler. Automation debt.

교리 v2 규칙 6: 손으로 채우는 입력은 임시로만. 이것은 «자동화 부채» 1호다 - P1 에서
석탄 벨트(광석|석탄 레인, 보일러 줄)가 서면 끈다.

버너 채굴기 150kW = 석탄 0.0375/s (8개가 3분 반), 돌 화로 0.0225/s, 보일러 0.45/s(전부하).
석탄 채굴기 넷이 상자에 쌓는 것을 한 사람이 걷어 «가장 모자란 것부터» 채운다.

    python scripts/fuel_run.py --who hotel --every 60
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

OWNER = "fuel"
LOW = 5            # 이보다 적으면 채운다
TOP = 10           # 채울 때 이만큼까지 (보일러는 BOILER_TOP)
BOILER_TOP = 50
PER_ROUND = 22     # 한 바퀴에 들르는 곳 (걸음+넣기 = 44 + 걷기)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def survey(ai) -> tuple:
    """(석탄 상자 [(x,y,n)], 굶는 곳 [(x,y,이름,n)])"""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local chests, low = {}, {}
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f}) do
        local n = c.get_inventory(defines.inventory.chest).get_item_count("coal")
        if n > 0 then chests[#chests+1] = string.format("%%.1f,%%.1f,%%d", c.position.x, c.position.y, n) end
      end
      for _, e in pairs(s.find_entities_filtered{type = {"mining-drill", "furnace", "boiler"}, force = f}) do
        local inv = e.get_fuel_inventory and e.get_fuel_inventory()
        if inv then
          local n = inv.get_item_count("coal")
          -- 석탄 캐는 채굴기는 kind=coal-drill (연료를 만드는 쪽이 먼저), 물 없는 보일러는 건너뛴다
          local kind = e.type
          if e.type == "mining-drill" and e.mining_target and e.mining_target.name == "coal" then kind = "coal-drill" end
          local dry = e.type == "boiler" and e.status == defines.entity_status.no_input_fluid
          if n < %d and not dry then low[#low+1] = string.format("%%.1f,%%.1f,%%s,%%d", e.position.x, e.position.y, kind, n) end
        end
      end
      return {chests = chests, low = low}
    end)()""" % LOW)
    chests = [tuple(float(v) for v in str(r).split(",")) for r in _rows(reply.get("chests"))]
    low = []
    for r in _rows(reply.get("low")):
        x, y, kind, n = str(r).split(",")
        low.append((float(x), float(y), kind, int(n)))
    # 연료를 만드는 석탄 채굴기 먼저 -> 다른 채굴기 -> 화로 -> 보일러 (23회차: 보일러 먼저였더니 물도 없는
    # 보일러 둘이 석탄 100 을 먹고 석탄 채굴기가 전부 섰다)
    rank = {"coal-drill": 0, "mining-drill": 1, "furnace": 2, "boiler": 3}
    low.sort(key=lambda t: (rank.get(t[2], 4), t[3]))
    return chests, low


def plan_round(ai, who, chests, low) -> list:
    want = sum((BOILER_TOP if k == "boiler" else TOP) - n for _x, _y, k, n in low[:PER_ROUND])
    try:
        have = int(ai.agent(who).items().get("coal", 0))
    except RconError:
        have = 0
    plan = []
    for x, y, n in sorted(chests, key=lambda c: -c[2]):
        if have >= want:
            break
        plan += [("walk_to", {"x": x, "y": y + 1.5}),
                 ("take", {"name": "coal", "x": x, "y": y, "count": int(n)})]
        have += int(n)
    for x, y, kind, n in low[:PER_ROUND]:
        top = BOILER_TOP if kind == "boiler" else TOP
        plan += [("walk_to", {"x": x + 0.5, "y": y + 2.0}),
                 ("insert", {"name": "coal", "x": x, "y": y, "count": top - n})]
    return plan[:60]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="hotel")
    ap.add_argument("--every", type=float, default=60)
    args = ap.parse_args()
    os.environ[detached.ENV] = OWNER
    ai = AIBridge()
    detached.mark([args.who], OWNER, minutes=600)
    try:
        while True:
            try:
                chests, low = survey(ai)
                live = {w["name"]: w for w in ai.list()}
                me = live.get(args.who, {})
                busy = me.get("current") or me.get("queued")
                print(f"  석탄 상자 {sum(c[2] for c in chests):.0f} · 굶는 곳 {len(low)}"
                      + (" - 순회 중" if busy else ""))
                if low and not busy:
                    submit(ai, args.who, plan_round(ai, args.who, chests, low), strict=False)
            except RconError as exc:
                print("  게임이 대답하지 않는다:", exc)
            time.sleep(args.every)
    finally:
        detached.release([args.who])


if __name__ == "__main__":
    raise SystemExit(main())

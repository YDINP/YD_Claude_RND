"""Empty the overflow chests before they fill. A full sink is a jammed ring.

실측(21회차): 과학 블록 스시 고리의 싱크 상자가 벨트 1,100·팔 950 으로 꽉 차자
고리가 팔 205개로 막혔고, A 줄 -> 판 버스 -> 간선 -> 화로 28대 -> 채굴기 35대가
차례로 «출력 막힘»이 됐다. 전력 사용 1.1 MW. 기지가 통째로 섰다.

    싱크는 «느린 배수구»다. 배수구 아래 통이 차면 배수구가 없는 것과 같다.

    사용자: "병목으로 남는건 상자에 저장했다가 나중에 필요하면 쓰도록하고"

그래서 통을 비운다: 싱크 상자가 FULL_AT 칸 이상 차면 사람이 가서 다 걷어
창고의 빈 상자에 내려놓는다. 팔·벨트·회로는 다 «세울 때 쓰는 것»이다.

    python scripts/drain.py                      # 얼마나 찼나
    python scripts/drain.py --who hotel --every 120
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

DEPOT = (-55, 10)
CHESTS = ((-14.5, 57.5),)      # science_block.SINK
FULL_AT = 10                   # 32칸 중 이만큼 찼으면 비운다
ROOM = 20                      # 내려놓을 상자는 빈 칸이 이만큼은 있어야


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def held(ai) -> dict:
    """{(x, y): (찬 칸, {품목: 수})}"""
    packed = ";".join(f"{x},{y}" for x, y in CHESTS)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local c = s.find_entities_filtered{type = "container", force = f,
                    area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}}[1]
        if c then
          local inv = c.get_inventory(defines.inventory.chest)
          local t = {}
          for _, v in pairs(inv.get_contents()) do t[#t+1] = v.name .. "=" .. v.count end
          out[#out+1] = x .. "|" .. y .. "|" .. (#inv - inv.count_empty_stacks()) .. "|" .. table.concat(t, ",")
        end
      end
      return out
    end)()""" % packed)
    out = {}
    for row in _rows(reply):
        x, y, used, items = str(row).split("|")
        d = {}
        for bit in items.split(","):
            if bit:
                n, c = bit.split("=")
                d[n] = int(c)
        out[(float(x), float(y))] = (int(used), d)
    return out


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def plan_drain(ai, at, items) -> list:
    plan = [("walk_to", {"x": at[0] - 2, "y": at[1] - 0.5})]
    for item, n in items.items():
        plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    roomy = [c for c in shelf_mod.stock(ai, DEPOT, 36)
             if c["room"] >= ROOM and shelf_mod.fits(None, c["y"], DEPOT)]
    roomy.sort(key=lambda c: -c["room"])
    if not roomy:
        return []
    for i, (item, n) in enumerate(items.items()):
        c = roomy[i % len(roomy)]
        plan.append(("walk_to", {"x": c["x"] + 0.5, "y": c["y"] + 2.0}))
        plan.append(("insert", {"name": item, "x": c["x"] + 0.5, "y": c["y"] + 0.5, "count": n}))
    return plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            for at, (used, items) in held(ai).items():
                line = f"  싱크 {at}: {used}/32칸 " + " ".join(f"{k[:6]}:{v}" for k, v in items.items())
                if used < FULL_AT or not args.who:
                    print(line)
                    continue
                if not idle(ai, args.who):
                    print(line + " - 손이 비지 않는다")
                    continue
                plan = plan_drain(ai, at, items)
                if not plan:
                    print(line + " - 창고에 빈 상자가 없다")
                    continue
                submit(ai, args.who, plan[:60], strict=False)
                print(f"{args.who}: 싱크 비우기 " + " ".join(f"{k[:6]}:{v}" for k, v in items.items()))
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

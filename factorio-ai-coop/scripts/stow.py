"""What is in a bag is not in the warehouse. Put it back.

사용자가 시켰다 - "캐릭터가 가지고있는 자원은 바로 제작할게 아니라면
상자에 저장해야함."

21회차에 가방을 열어 보니 이랬다.

    철상자 683 · 포탑 244 · 채굴기 20 · 벨트 175 · 팔 31
    석탄 1,193   <- 그동안 창고 석탄은 64 였고 채굴기 23대가 연료 없음

가방에 든 것은 세 가지로 나쁘다.

  1. 아무도 못 쓴다. 석탄이 천 개 넘게 «있는데» 채굴기는 굶었다. 재고를
     세는 검사는 상자만 보므로, 가방 속 물건은 없는 것으로 친다.
  2. 가방이 차면 만들기가 조용히 실패한다.
         'bag is full - nowhere to put what I make'
     알파는 그 상태로 여덟 순번 동안 과학팩을 「만들었다」고 찍었다.
  3. 죽으면 같이 사라진다.

그래서 한가한 사람은 가방을 비운다. 남기는 것은 «지금 하는 일의 연장»
뿐이다 - 곡괭이질에 쓸 최소한의 연료 같은 것. 세우려고 만든 것도 다
넣는다: 세울 사람이 그때 꺼내 가면 된다. 들고 다닌다고 세워지지 않는다.

넣는 자리는 shelf.py 가 정한다 - 그 물건이 «이미 들어 있는» 상자가
먼저고, 없으면 빈 칸이 남은 가장 가까운 상자다.

    python scripts/stow.py --depot=-55,10 --who alpha,bravo
    python scripts/stow.py --depot=-55,10 --who alpha,bravo --every 40
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

sys.path.insert(0, HERE)
import shelf as shelf_mod                # noqa: E402

# 들고 있어도 되는 것. 이보다 많으면 넘치는 만큼만 넣는다.
KEEP = {"coal": 10, "wood": 0}

# 이만큼은 들어야 걸음 값을 한다. 자잘한 것 때문에 창고까지 걷지 않는다.
WORTH = 40

MAX_STEPS = 40            # 계획은 64단계 제한. 넉넉히 남긴다
SPAN = 9                  # 창고 한가운데에서 이만큼 안을 창고로 본다


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def chests(ai, depot):
    """창고 상자들. [{x, y, room, held: {item: n}, bar}]"""
    dx, dy = depot
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f,
            area = {{%d, %d}, {%d, %d}}}) do
        local inv = c.get_inventory(defines.inventory.chest)
        local limit = #inv
        if inv.supports_bar() then limit = math.min(limit, inv.get_bar() - 1) end
        local used, bits = 0, {}
        for i = 1, #inv do
          if inv[i].valid_for_read then used = used + 1 end
        end
        for _, it in pairs(inv.get_contents()) do
          bits[#bits+1] = it.name .. "=" .. it.count
        end
        out[#out+1] = math.floor(c.position.x) .. "|" .. math.floor(c.position.y)
                   .. "|" .. math.max(0, limit - used) .. "|" .. table.concat(bits, ",")
      end
      return out
    end)()""" % (dx - SPAN, dy - SPAN, dx + SPAN, dy + SPAN))
    out = []
    for row in _rows(reply):
        x, y, room, bits = (str(row).split("|") + [""])[:4]
        held = {}
        for bit in bits.split(","):
            if "=" in bit:
                k, v = bit.split("=", 1)
                held[k] = int(v)
        out.append({"x": int(x), "y": int(y), "room": int(room), "held": held})
    return out


def home_for(item, boxes, depot):
    """이 물건이 갈 상자. 이미 든 상자 먼저, 아니면 빈 칸 있는 가까운 상자.

    칸 제한(level.py 의 수위)에 닿은 상자는 빈 칸 0 으로 본다 - 거기
    넣으러 가면 조용히 실패하고 물건은 가방에 그대로 남는다.

    벨트가 채우는 줄에는 제 물건만 넣는다 (shelf.BELT_ROWS). 「이미 든
    상자 먼저」가 석탄 선반을 철판으로 채운 장본인이었다 - 한 번 잘못
    들어간 철판이 다음 철판을 불렀다.
    """
    dx, dy = depot
    open_ = [b for b in boxes
             if b["room"] > 0 and shelf_mod.fits(item, b["y"], depot)]
    same = [b for b in open_ if item in b["held"]]
    pool = same or open_
    if not pool:
        return None
    return min(pool, key=lambda b: (b["x"] - dx) ** 2 + (b["y"] - dy) ** 2)


def stow(ai, who, depot):
    try:
        bag = ai.agent(who).items()
    except RconError:
        return False
    spare = {k: int(v) - KEEP.get(k, 0) for k, v in bag.items()
             if int(v) > KEEP.get(k, 0)}
    if sum(spare.values()) < WORTH:
        return False
    boxes = chests(ai, depot)
    plan, moved, nowhere = [], {}, []
    for item, count in sorted(spare.items(), key=lambda kv: -kv[1]):
        if len(plan) >= MAX_STEPS:
            break
        box = home_for(item, boxes, depot)
        if not box:
            nowhere.append(item)
            continue
        plan.append(("walk_to", {"x": box["x"] + 1.5, "y": box["y"] + 1.5}))
        plan.append(("insert", {"name": item, "x": box["x"] + 0.5,
                                "y": box["y"] + 0.5, "count": count}))
        box["room"] -= 1                   # 같은 상자에 몰아 넣지 않게
        box["held"][item] = box["held"].get(item, 0) + count
        moved[item] = count
    if not plan:
        if nowhere:
            print(f"  {who}: 넣을 상자가 없다 - 창고를 넓혀야 한다"
                  f" ({', '.join(nowhere[:4])})")
        return False
    submit(ai, who, plan, strict=False)
    top = ", ".join(f"{k} {v}" for k, v in list(moved.items())[:4])
    print(f"{who}: 가방 비우기 - {top}"
          + (f" 외 {len(moved) - 4}종" if len(moved) > 4 else ""))
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="-55,10")
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    dx, dy = (int(v) for v in args.depot.split(","))
    who = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            for one in idle(ai, who):
                stow(ai, one, (dx, dy))
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

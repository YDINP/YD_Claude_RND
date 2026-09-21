"""Widen the storehouse when it fills. Nothing else.

21회차 실측 - 기지 전체가 «상자 세 개»에 걸려 멎었다.

    창고 상자 3개 · 빈 칸 0 · 석탄 48
    창고 바깥 48개 · 빈 칸 708 · 석탄 10,847
    가방 안   철상자 38개

haul 은 내려놓을 데가 없어 "빈 상자가 하나도 없다" 를 되풀이했고,
grow 는 창고 상자 안만 세어 석탄 48 로 읽고 「연료가 없다」며 멈춘
채굴기 스물여덟 대를 손보지 않았다. 석탄은 만 개가 넘게 있었다.

창고를 넓힐 상자 서른여덟 개는 그동안 «가방 안에» 있었다.

    스스로 넓히지 못하는 창고는 언젠가 반드시 기지를 멈춘다.

그래서 이 한 가지만 한다. 선반 줄(판.돌.석탄)을 옆으로 늘린다. 줄
사이 한 칸은 비워 둔다 - 거기가 사람이 지나는 길이다.

    python scripts/depot.py --depot=-55,10 --who delta
    python scripts/depot.py --depot=-55,10 --who delta --every 30
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

CHEST = "iron-chest"

# 선반 줄은 창고 기준점에서 0.2.4 칸 아래. haul 이 쓰는 자리와 같다.
ROWS = (0, 2, 4)

# 줄을 기준점 좌우로 이만큼까지 늘린다. grow.stock() 이 세는 상자와
# «같은 넓이»라야 한다 - 밖에 세우면 창고로 안 쳐 준다. 둘을 따로 적으면
# 언젠가 한쪽만 늘어나고, 늘어난 쪽은 아무도 안 세는 상자가 된다.
REACH = 6

# 빈 칸이 이보다 적으면 넓힌다.
#
# 40 이었다. 상자 아홉에 빈 칸 192 로 시작했는데 판금이 하루 만에
# 26,000 을 넘으면서 다시 빠듯해졌다 - 「모자라기 전에」 넓히려면 마르는
# 것을 보고 넓히면 늦다. 한 번 나르는 양(스택 50 x 여러 칸)보다 넉넉히.
ROOM_FLOOR = 160
PER_TRIP = 6              # 한 걸음에 세우는 상자 수 (계획 64단계 제한)
REST = 8                  # 창고 한가운데에서 이만큼 안을 창고로 본다


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def room(ai, depot):
    """창고 상자 수와 남은 빈 칸. 「몇 개」가 아니라 «몇 칸»이 답이다."""
    dx, dy = depot
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = { chests = 0, free = 0 }
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f,
            area = {{%d, %d}, {%d, %d}}}) do
        local inv = c.get_inventory(defines.inventory.chest)
        out.chests = out.chests + 1
        for i = 1, #inv do
          if not inv[i].valid_for_read then out.free = out.free + 1 end
        end
      end
      return out
    end)()""" % (dx - REST, dy - REST, dx + REST, dy + REST))


def seats(ai, depot):
    """상자를 더 놓을 수 있는 자리.

    빈 칸인지는 «타일 넓이»로 묻는다. 한 점과 반경으로 물으면 그 칸에
    걸친 것의 «크기를 안다»는 가정이 들어가고, 그 가정은 지금까지 네
    번 틀렸다.
    """
    dx, dy = depot
    want = []
    for row in ROWS:
        for step in range(-REACH, REACH + 1):
            want.append((dx + step, dy + row))
    spots = ";".join("%d,%d" % (x, y) for x, y in want)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "(-?%%d+),(-?%%d+)")
        x, y = tonumber(x), tonumber(y)
        local taken = s.count_entities_filtered{
          area = {{x, y}, {x + 1, y + 1}}, force = f} > 0
        if not taken and s.can_place_entity{name = "%s",
              position = {x + 0.5, y + 0.5}} then
          out[#out+1] = x .. "|" .. y
        end
      end
      return out
    end)()""" % (spots, CHEST))
    out = []
    for line in _rows(reply):
        parts = str(line).split("|")
        if len(parts) == 2:
            out.append((int(parts[0]), int(parts[1])))
    # 창고 한가운데에서 가까운 자리부터. 걸음이 짧은 쪽이 먼저 선다.
    out.sort(key=lambda p: (p[0] - dx) ** 2 + (p[1] - dy) ** 2)
    return out


def carrying(ai, who):
    try:
        return int(ai.agent(who).items().get(CHEST, 0))
    except RconError:
        return 0


def widen(ai, who, depot, spots):
    """가방의 상자를 자리에 세운다. 없으면 만들어서 세운다.

    「만들라」와 「세워라」 사이에는 기다림이 있어야 한다. 주문만 넣고
    세우러 가면 손에 없는 것을 세우게 되고, 그 실패는 조용하다.
    """
    have = carrying(ai, who)
    spots = spots[:PER_TRIP]
    if not spots:
        return False
    plan = []
    if have < len(spots):
        plan.append(("craft", {"recipe": CHEST,
                               "count": len(spots) - have, "wait": True}))
    for x, y in spots:
        plan.append(("walk_to", {"x": x + 1.5, "y": y + 1.5}))
        plan.append(("build", {"name": CHEST, "x": x + 0.5, "y": y + 0.5}))
    submit(ai, who, plan, strict=False)
    made = "" if have >= len(spots) else f" ({len(spots) - have}개는 만들어서)"
    print(f"{who}: 창고 상자 {len(spots)}개 더{made}"
          f" - {', '.join('%d,%d' % s for s in spots)}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="-55,10")
    ap.add_argument("--who", default="delta")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    dx, dy = (int(v) for v in args.depot.split(","))
    who = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            st = room(ai, (dx, dy))
            free, chests = int(st["free"]), int(st["chests"])
            if free >= ROOM_FLOOR:
                print(f"  창고 상자 {chests}개 · 빈 칸 {free} - 아직 넉넉하다")
            else:
                spots = seats(ai, (dx, dy))
                if not spots:
                    print(f"  창고 상자 {chests}개 · 빈 칸 {free}"
                          f" - 더 놓을 «자리»가 없다 (줄을 늘려야 한다)")
                else:
                    hands = idle(ai, who)
                    if not hands:
                        print(f"  창고 빈 칸 {free} · 자리 {len(spots)}곳"
                              f" - 손이 비지 않는다")
                    else:
                        widen(ai, hands[0], (dx, dy), spots)
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

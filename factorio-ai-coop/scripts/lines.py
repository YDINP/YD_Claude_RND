"""Does the belt network actually carry anything. And where is it torn.

사용자가 시켰다 - "벨트물류부터 우선 검수좀해봐"

재 보니 629칸이 스무 덩어리로 끊겨 있었고, 큰 두 덩어리가 물건을 한 개도
안 나르고 있었다.

    칸수  실림  채굴기  넣는팔  빼는팔
     257    0      0       1       6   <- 들어오는 것이 없다
     116    0      0       0      14   <- 팔 열넷이 빈 벨트를 본다
      79   74      0      12       0   <- 채우기만 하고 뺄 데가 없다
      10   10      7       0       0   <- 채굴기 일곱이 채우는데 출구 0

«채우는 줄»과 «비우는 줄»이 서로 안 이어져 있었다. 어느 쪽도 고장 난
데가 없는데 둘 다 아무 일도 못 한다.

그리고 끊긴 틈은 전부 한 칸에서 다섯 칸이었다.

    (-77,55) 남  채굴기 7대가 채우는 10칸 -> 3칸 건너 (-77,58)
    (-40,56) 서  꽉 찬 79칸            -> 2칸 건너 (-40,58)

    벨트를 「몇 칸 깔았나」로 재면 늘 잘하고 있는 것처럼 보인다.
    나르는가로 재야 한다.

옆에서 얹히는 것(side-load)은 이어진 것으로 센다 - 팩토리오가 받아 주는
이음이다. 마주 선 것만 끊긴 것이다(그건 knots.py 가 본다).

    python scripts/lines.py                        # 검수만
    python scripts/lines.py --stitch --who delta   # 가까운 틈을 잇는다
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

BELT = "transport-belt"
STEP = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}
FACE = {0: "북", 4: "동", 8: "남", 12: "서"}
SIDES = ((0, -1), (1, 0), (0, 1), (-1, 0))

MAX_GAP = 8               # 이보다 먼 틈은 「잇는 일」이 아니라 「길 내는 일」
PER_TRIP = 12             # 한 걸음에 까는 칸 수 (계획 64단계 제한)

BLOCKERS = ('"transport-belt", "mining-drill", "furnace", "container", '
            '"inserter", "burner-inserter", "ammo-turret", "lab", '
            '"electric-pole", "boiler", "generator", "wall"')


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


LOOK = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {}
  for _, b in pairs(s.find_entities_filtered{type = "transport-belt",
        force = f}) do
    local n = 0
    for i = 1, 2 do n = n + #b.get_transport_line(i).get_contents() end
    out[#out+1] = "B|" .. math.floor(b.position.x) .. "|"
               .. math.floor(b.position.y) .. "|" .. b.direction .. "|" .. n
  end
  for _, d in pairs(s.find_entities_filtered{type = "mining-drill",
        force = f}) do
    out[#out+1] = "D|" .. math.floor(d.drop_position.x) .. "|"
               .. math.floor(d.drop_position.y) .. "|0|0"
  end
  for _, i in pairs(s.find_entities_filtered{
        type = {"inserter", "burner-inserter"}, force = f}) do
    out[#out+1] = "P|" .. math.floor(i.pickup_position.x) .. "|"
               .. math.floor(i.pickup_position.y) .. "|0|0"
    out[#out+1] = "T|" .. math.floor(i.drop_position.x) .. "|"
               .. math.floor(i.drop_position.y) .. "|0|0"
  end
  return out
end)()"""


def look(ai):
    """벨트와 «그 벨트를 먹이고 비우는 것»을 한 번에 묻는다."""
    belt, drill, pick, put = {}, set(), set(), set()
    for row in _rows(ai.lua(LOOK)):
        bits = str(row).split("|")
        if len(bits) != 5:
            continue
        kind, x, y = bits[0], int(bits[1]), int(bits[2])
        if kind == "B":
            belt[(x, y)] = (int(bits[3]), int(bits[4]))
        elif kind == "D":
            drill.add((x, y))
        elif kind == "P":
            pick.add((x, y))
        else:
            put.add((x, y))
    return belt, drill, pick, put


def ahead(spot, dir_):
    dx, dy = STEP.get(dir_, (0, 0))
    return (spot[0] + dx, spot[1] + dy)


def segments(belt):
    """이어진 덩어리들. 옆에서 얹히는 것도 이어진 것으로 센다."""
    parent = {p: p for p in belt}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def join(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for spot, (dir_, _n) in belt.items():
        nxt = ahead(spot, dir_)
        if nxt in belt:
            join(spot, nxt)
        for dx, dy in SIDES:
            side = (spot[0] + dx, spot[1] + dy)
            if side in belt and ahead(side, belt[side][0]) == spot:
                join(side, spot)
    groups = {}
    for spot in belt:
        groups.setdefault(find(spot), []).append(spot)
    return sorted(groups.values(), key=len, reverse=True)


def tears(belt, segs):
    """끊긴 자리. 막다른 끝과 «다른 덩어리»까지의 틈.

    막다른 끝이란 제가 가리키는 칸에 벨트가 없는 칸이다. 거기서 흐름이
    선다 - 그 앞이 가까우면 잇는 일이고, 멀면 길 내는 일이다.
    """
    where = {}
    for n, seg in enumerate(segs):
        for spot in seg:
            where[spot] = n
    out = []
    for spot, (dir_, _n) in belt.items():
        if ahead(spot, dir_) in belt:
            continue
        mine = where[spot]
        best = None
        for other in belt:
            if where[other] == mine:
                continue
            gap = abs(other[0] - spot[0]) + abs(other[1] - spot[1])
            if best is None or gap < best[0]:
                best = (gap, other)
        if best and best[0] <= MAX_GAP:
            out.append({"from": spot, "dir": dir_, "to": best[1],
                        "gap": best[0], "seg": len(segs[mine])})
    out.sort(key=lambda t: (t["gap"], -t["seg"]))
    return out


def _walk(a, b):
    """a 에서 b 까지 한 축씩. 끝점은 넣지 않는다."""
    out = []
    x, y = a
    while x != b[0]:
        x += 1 if b[0] > x else -1
        out.append((x, y))
    while y != b[1]:
        y += 1 if b[1] > y else -1
        out.append((x, y))
    return out


def bridge(tear):
    """틈을 메울 칸들. 흐르는 쪽 축을 «먼저» 간다.

    막다른 끝은 이미 한쪽을 가리키고 있다. 그 방향으로 먼저 가면 그 칸은
    돌릴 필요가 없고, 돌리지 않은 칸은 남의 줄과 싸우지 않는다.
    """
    start, goal = tear["from"], tear["to"]
    dx, dy = STEP.get(tear["dir"], (0, 0))
    step = (start[0] + dx, start[1] + dy)
    path = [step] + _walk(step, goal) if step != goal else []
    path = [p for p in path if p != goal and p != start]
    if not path:
        return []
    out = []
    for i, spot in enumerate(path):
        nxt = path[i + 1] if i + 1 < len(path) else goal
        move = (nxt[0] - spot[0], nxt[1] - spot[1])
        face = next((d for d, s in STEP.items() if s == move), None)
        if face is None:
            return []                       # 대각선이 되면 이 틈은 못 잇는다
        out.append((spot, face))
    return out


def free(ai, spots):
    """이 칸들에 벨트를 놓을 수 있나. «칸 넓이»로 묻는다."""
    if not spots:
        return set()
    bits = ";".join("%d,%d" % s for s in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "(-?%%d+),(-?%%d+)")
        x, y = tonumber(x), tonumber(y)
        local taken = s.count_entities_filtered{
          area = {{x, y}, {x + 1, y + 1}}, force = f,
          type = {%s}} > 0
        if not taken and s.can_place_entity{name = "transport-belt",
              position = {x + 0.5, y + 0.5}, force = f} then
          out[#out+1] = x .. "|" .. y
        end
      end
      return out
    end)()""" % (bits, BLOCKERS))
    done = set()
    for row in _rows(reply):
        bit = str(row).split("|")
        if len(bit) == 2:
            done.add((int(bit[0]), int(bit[1])))
    return done


def stitch(ai, who, jobs):
    plan = []
    for spot, face in jobs[:PER_TRIP]:
        plan.append(("walk_to", {"x": spot[0] + 1.5, "y": spot[1] + 1.5}))
        plan.append(("build", {"name": BELT, "x": spot[0] + 0.5,
                               "y": spot[1] + 0.5, "direction": face}))
    if not plan:
        return False
    submit(ai, who, plan, strict=False)
    print(f"{who}: 끊긴 자리 {len(jobs[:PER_TRIP])}칸 잇기")
    return True


def audit(belt, drill, pick, put, segs):
    carry = sum(1 for v in belt.values() if v[1] > 0)
    print(f"  벨트 {len(belt)}칸 · 물건 실린 칸 {carry}"
          f" · 덩어리 {len(segs)}개")
    print("     칸수   실림  채굴기  넣는팔  빼는팔   무엇이 모자란가")
    for seg in segs[:8]:
        here = set(seg)
        ins = len(here & drill) + len(here & put)
        outs = len(here & pick)
        load = sum(1 for p in seg if belt[p][1] > 0)
        if ins == 0 and outs == 0:
            why = "아무것도 안 붙었다"
        elif ins == 0:
            why = f"들어오는 것이 없다 - 팔 {outs}개가 굶는다"
        elif outs == 0:
            why = "나가는 데가 없다 - 꽉 찬다"
        else:
            why = "이어져 있다"
        print("    %5d %6d %7d %7d %7d   %s"
              % (len(seg), load, len(here & drill), len(here & put),
                 outs, why))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stitch", action="store_true")
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()
    who = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            belt, drill, pick, put = look(ai)
            segs = segments(belt)
            audit(belt, drill, pick, put, segs)
            torn = tears(belt, segs)
            if not torn:
                print("  끊긴 자리 없음")
            else:
                print(f"  끊긴 자리 {len(torn)}곳 (가까운 것부터)")
                for t in torn[:6]:
                    print(f"    {t['from']} {FACE.get(t['dir'])}"
                          f" 덩어리 {t['seg']}칸 -> {t['gap']}칸 건너 {t['to']}")
            if args.stitch and torn and who:
                jobs = []
                for t in torn:
                    span = bridge(t)
                    if not span:
                        continue
                    ok = free(ai, [s for s, _d in span])
                    if len(ok) != len(span):
                        continue           # 한 칸이라도 막히면 그 틈은 건너뛴다
                    jobs.extend(span)
                    if len(jobs) >= PER_TRIP:
                        break
                hands = idle(ai, who)
                if not jobs:
                    print("    이을 수 있는 틈이 없다 - 전부 막혔거나 대각선이다")
                elif not hands:
                    print(f"    이을 자리 {len(jobs)}칸 - 손이 비지 않는다")
                else:
                    stitch(ai, hands[0], jobs)
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

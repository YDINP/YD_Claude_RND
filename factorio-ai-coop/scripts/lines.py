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
  -- 지하벨트도 벨트다. 입구는 «짝 출구»로 건너뛴다.
  for _, u in pairs(s.find_entities_filtered{type = "underground-belt",
        force = f}) do
    local mate = u.neighbours
    local jx, jy = "", ""
    if u.belt_to_ground_type == "input" and mate then
      jx, jy = math.floor(mate.position.x), math.floor(mate.position.y)
    end
    out[#out+1] = "U|" .. math.floor(u.position.x) .. "|"
               .. math.floor(u.position.y) .. "|" .. u.direction .. "|"
               .. jx .. "," .. jy
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
    JUMP.clear()
    for row in _rows(ai.lua(LOOK)):
        bits = str(row).split("|")
        if len(bits) != 5:
            continue
        kind, x, y = bits[0], int(bits[1]), int(bits[2])
        if kind == "B":
            belt[(x, y)] = (int(bits[3]), int(bits[4]))
        elif kind == "U":
            # 21회차: 지하벨트를 몰라서 입구 앞 칸을 「막다른 끝」으로 읽고
            # 잇기 고리가 그 칸을 돌리려 했다. 막힌 길이라 실패했을 뿐,
            # 길이 열려 있었으면 구리 간선을 제 손으로 끊을 뻔했다.
            belt[(x, y)] = (int(bits[3]), 0)
            jump = bits[4].split(",")
            if len(jump) == 2 and jump[0] not in ("", "nil"):
                JUMP[(x, y)] = (int(jump[0]), int(jump[1]))
        elif kind == "D":
            drill.add((x, y))
        elif kind == "P":
            pick.add((x, y))
        else:
            put.add((x, y))
    return belt, drill, pick, put


JUMP = {}                 # 지하벨트 입구 -> 짝 출구


def ahead(spot, dir_):
    if spot in JUMP:
        return JUMP[spot]
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


def _walk(a, b, x_first=True):
    """a 에서 b 까지 한 축씩. 시작점은 빼고 끝점은 넣는다."""
    out = []
    x, y = a
    order = (0, 1) if x_first else (1, 0)
    for axis in order:
        if axis == 0:
            while x != b[0]:
                x += 1 if b[0] > x else -1
                out.append((x, y))
        else:
            while y != b[1]:
                y += 1 if b[1] > y else -1
                out.append((x, y))
    return out


def bridge(tear):
    """틈을 메울 길. (막다른 끝의 새 방향, [(새 칸, 방향), ...])

    처음에는 막다른 끝이 «이미 가리키는 축»으로 먼저 가게 했다. 돌릴
    필요가 없으니 남의 줄과 안 싸운다는 생각이었는데, 가리키는 쪽이
    목적지 «반대»인 경우가 태반이었다.

        (-40,56) 서쪽을 봄 -> 목적지는 두 칸 «남쪽»
        (-56,103) 북쪽을 봄 -> 목적지는 한 칸 «동쪽»

    그래서 아홉 자리가 전부 "이을 수 있는 틈이 없다" 로 나왔다. 둘러
    가는 길이 대각선이 되거나 남의 건물에 막혔기 때문이다.

        막다른 끝은 «뒤가 없는 칸»이다. 뒤가 없으면 돌려도 아무도 안
        다친다 - 그 방향을 지키려고 길을 두 배로 돌 이유가 없다.

    그래서 끝 칸부터 목적지를 향해 꺾는다. 먼 축을 먼저 가고, 남은 축은
    나중에 간다 - 꺾는 자리가 한 번뿐이라 길이 가장 짧다.
    """
    start, goal = tear["from"], tear["to"]
    far_x = abs(goal[0] - start[0]) >= abs(goal[1] - start[1])
    path = _walk(start, goal, x_first=far_x)
    path = [p for p in path if p != goal]
    seats = [start] + path
    out = []
    for i, spot in enumerate(seats):
        nxt = seats[i + 1] if i + 1 < len(seats) else goal
        move = (nxt[0] - spot[0], nxt[1] - spot[1])
        face = next((d for d, s in STEP.items() if s == move), None)
        if face is None:
            return None, []                 # 대각선이 되면 이 틈은 못 잇는다
        out.append((spot, face))
    if not out:
        return None, []
    return out[0][1], out[1:]               # 첫 칸은 «돌릴» 자리다


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


def turn(ai, spots):
    """막다른 끝을 돌린다. 뒤가 없는 칸이라 돌려도 아무도 안 다친다."""
    if not spots:
        return 0
    bits = ";".join("%d,%d,%d" % (x, y, d) for (x, y), d in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local done = 0
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y, d = string.match(bit, "(-?%%d+),(-?%%d+),(%%d+)")
        x, y, d = tonumber(x), tonumber(y), tonumber(d)
        for _, b in pairs(s.find_entities_filtered{type = "transport-belt",
              force = f, area = {{x, y}, {x + 1, y + 1}}}) do
          if math.floor(b.position.x) == x
             and math.floor(b.position.y) == y then
            b.direction = d
            done = done + 1
          end
        end
      end
      return { done = done }
    end)()""" % bits)
    return int(reply["done"])


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


def follows(belt, spot, cap=500):
    """이 칸에 떨어진 것이 «어디서 멈추나». 흐름을 그대로 따라간다."""
    at, seen = spot, set()
    while at in belt and at not in seen and len(seen) < cap:
        seen.add(at)
        nxt = ahead(at, belt[at][0])
        if nxt not in belt:
            return at
        at = nxt
    return at


def where_ore_goes(belt, drill, pick):
    """채굴기마다 광석이 «어디서 끝나나».

    사용자가 짚었다 - "아직 광석들이 상자로들어감. 화로로직행연결해야함"

    벨트가 이어져 있는 것과 «그 벨트가 옳은 데로 간다»는 다른 말이다.
    스무 덩어리를 여덟으로 줄여 놓고도 광석은 창고를 빙빙 돌기만 했다.
    끊긴 데가 없으니 lines.py 도 knots.py 도 아무 말이 없었다.

        이어졌나만 물으면 «어디로 이어졌나»를 영영 안 묻게 된다.
    """
    out = {}
    for spot in drill:
        if spot not in belt:
            out.setdefault("벨트가 아니다 (상자/땅)", []).append(spot)
            continue
        out.setdefault(follows(belt, spot), []).append(spot)
    return out


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
            goes = where_ore_goes(belt, drill, pick)
            if goes:
                print("  캔 것이 어디서 끝나나")
                for end, who in sorted(goes.items(),
                                       key=lambda kv: -len(kv[1]))[:5]:
                    print(f"    {str(end):<22} 채굴기 {len(who)}대")
            torn = tears(belt, segs)
            if not torn:
                print("  끊긴 자리 없음")
            else:
                print(f"  끊긴 자리 {len(torn)}곳 (가까운 것부터)")
                for t in torn[:6]:
                    print(f"    {t['from']} {FACE.get(t['dir'])}"
                          f" 덩어리 {t['seg']}칸 -> {t['gap']}칸 건너 {t['to']}")
            if args.stitch and torn and who:
                jobs, spins = [], []
                for t in torn:
                    face, span = bridge(t)
                    if face is None:
                        continue
                    if span:
                        ok = free(ai, [s for s, _d in span])
                        if len(ok) != len(span):
                            continue       # 한 칸이라도 막히면 그 틈은 건너뛴다
                    spins.append((t["from"], face))
                    jobs.extend(span)
                    if len(jobs) >= PER_TRIP:
                        break
                spun = turn(ai, spins)
                hands = idle(ai, who)
                if not jobs and not spun:
                    print("    이을 수 있는 틈이 없다 - 전부 막혔거나 대각선이다")
                elif not jobs:
                    print(f"    막다른 끝 {spun}칸을 돌려 이었다")
                elif not hands:
                    print(f"    끝 {spun}칸 돌림 · 이을 자리 {len(jobs)}칸"
                          f" - 손이 비지 않는다")
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

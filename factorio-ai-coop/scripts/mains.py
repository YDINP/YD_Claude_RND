"""The trunk line: carry the electricity to where the work is.

20회차의 발전소는 물가에 있고 기지는 83칸 떨어져 있다. 그 판단은 옳았다 -
전봇대 스무 대를 깔면서 연구를 기다리느니 초소 하나를 보내는 편이 빨랐고,
실제로 연구소가 37분에 섰다(18회차 62분, 19회차 미완).

그런데 «다음 단계»는 그 선택의 값을 치른다. 조립기도 전기 채굴기도
전기가 있어야 돌고, 그것들은 기지에 서야 한다. 초소에 지을 수는 없다.

    기지에 전기가 없으면 조립은 시작조차 못 한다.

그래서 이제는 선을 깐다. 83칸에 전봇대 열두 대, 나무 열둘과 구리판
스물넷이면 된다 - 연구소를 기다리던 때와 달리, 지금은 그만한 것이 있다.
순서가 바뀐 것이 아니라 «때가 된» 것이다.

    python scripts/mains.py --who alpha --from=-52,-9 --to=30,0
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

POLE = "small-electric-pole"
# 전선이 닿는 거리는 7.5다. 그런데 «계획한 간격»과 «실제로 선 간격»은
# 다르다 - snap 이 자리를 한두 칸 밀면 7칸 계획이 8~9칸이 되고, 그 반 칸
# 차이로 전력망이 쪼개진다.
#
# 실측(20회차): 전봇대 열두 대가 섰는데 전력망이 «일곱 개»였다.
#   (-45,-8) -> (-37,-7)  8.1칸
#   (-15,-5) -> (-6,-1)   9.8칸
#   (24,-1)  -> (33,3)    9.8칸
#
# 닿는 거리에 맞춰 계획하지 말고, «밀려도 닿을» 거리로 계획한다.
REACH = 6
PER_TRIP = 10             # 한 걸음에 세우는 전봇대
WOOD_PER_POLE = 1         # 전봇대 둘에 나무 하나지만, 넉넉히 센다
COPPER_PER_POLE = 2       # 전봇대 하나에 구리선 둘 = 구리판 하나

# 전봇대는 나무 «와» 구리를 먹는다.
#
# 나무만 챙겨 보냈더니 bravo 가 「전봇대 10대」를 네 번 찍는 동안 세상의
# 전봇대는 한 대 그대로였다. 구리선을 못 만들어 craft 가 조용히 실패한
# 것이다 - 로그는 «시킨 것»을 찍지 «된 것»을 찍지 않는다.
#
# 재료가 둘이면 둘 다 챙겨야 한다. 하나만 챙기는 것은 안 챙긴 것과 같다.


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def line(start, end, step=REACH):
    """두 점 사이에 «전선이 닿는 간격»으로 자리를 찍는다."""
    span = math.hypot(end[0] - start[0], end[1] - start[1])
    n = max(1, int(span // step))
    return [(round(start[0] + (end[0] - start[0]) * i / n),
             round(start[1] + (end[1] - start[1]) * i / n))
            for i in range(1, n + 1)]


def missing(ai, spots):
    """아직 전봇대가 없고, 놓을 수 있는 «실제» 자리.

    처음에는 막힌 칸을 +2,+2 한 군데로만 비켜 봤다. 그 한 군데도 막혀
    있으면 다음 순번에 또 같은 자리를 내놓고, 같은 실패를 되풀이한다 -
    20회차에서 세 자리가 그렇게 순번마다 「전봇대 3대」를 찍었다.
    그 중 하나는 창고 그 자체가 앉아 있는 칸이었다.

    비켜 보는 것은 한 번이 아니라 «여러 군데»여야 하고, 어디로도 못
    비키면 그 자리는 빼야 한다. 못 놓는 자리를 계획에 남겨 두면 그
    계획은 영영 안 끝난다.
    """
    if not spots:
        return []
    body = ", ".join(f"{{{x},{y}}}" for x, y in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      local spots = { %s }
      -- 비켜 볼 곳들. 전선이 닿는 범위 안에서만 움직인다.
      local away = {{0,0},{2,0},{-2,0},{0,2},{0,-2},{2,2},{-2,-2},{3,-1},{-3,1}}
      for i, p in ipairs(spots) do
        local here = s.count_entities_filtered{position = {p[1], p[2]},
                     radius = 3, type = "electric-pole", force = f}
        if here > 0 then
          out[i] = "0|0"
        else
          out[i] = "x"
          for _, d in ipairs(away) do
            local x, y = p[1] + d[1], p[2] + d[2]
            if s.can_place_entity{name = "small-electric-pole",
                 position = {x, y}, force = f} then
              out[i] = x .. "|" .. y
              break
            end
          end
        end
      end
      return out
    end)()""" % body)
    ok = _rows(reply)
    out, lost = [], 0
    for i, at in enumerate(spots):
        if i >= len(ok):
            break
        cell = str(ok[i])
        if cell == "0|0":
            continue
        if cell == "x":
            lost += 1
            continue
        x, y = cell.split("|")
        out.append((int(x), int(y)))
    if lost:
        print(f"  어디로도 못 비키는 자리 {lost}개 - 계획에서 뺀다")
    return out


def joined(ai, a, b):
    """두 자리가 «같은 전력망»에 있나. 「세웠다」와 «흐른다»는 다르다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local function net(x, y)
        local p = s.find_entities_filtered{position = {x, y}, radius = 6,
                  type = "electric-pole", force = f, limit = 1}[1]
        return p and p.electric_network_id or 0
      end
      local one, two = net(%d, %d), net(%d, %d)
      return { one = one, two = two, same = (one ~= 0 and one == two) and 1 or 0 }
    end)()""" % (a[0], a[1], b[0], b[1]))
    return int(reply["same"]) == 1


def starved(ai):
    """전기를 먹어야 하는데 «못 받고 있는» 것들.

        사용자: "화로쪽 인서터 하나 전력연결안되어있음"

    전봇대가 전부 한 망에 들어 있으면 「전기가 기지까지 흐른다」고 적고
    끝냈다. 그런데 흐르는 것과 «닿는 것»은 또 다르다. 소형 전봇대가 덮는
    넓이는 5x5 다 - 전선은 7.5 를 가므로, 전선만 보고 여섯 칸씩 띄우면
    가운데에 덮이지 않는 띠가 남는다.

        실측: 전봇대 51,1 은 x 49..53 을 덮고 60,1 은 58..62 를 덮는다
              인서터 55,1 은 그 사이에서 혼자 멈춰 있었다

    선이 이어졌나를 묻지 말고 «먹는 쪽이 받고 있나»를 물어야 한다. 그래야
    조립기를 세울 때 같은 일을 또 안 겪는다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, e in pairs(s.find_entities_filtered{force = f}) do
        if e.prototype.electric_energy_source_prototype
           and not e.is_connected_to_electric_network() then
          out[#out+1] = string.format("%d|%d|%s",
            math.floor(e.position.x), math.floor(e.position.y), e.name)
        end
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        x, y, name = str(row).split("|")
        out.append((int(x), int(y), name))
    return out


SUPPLY = 2                # 소형 전봇대가 덮는 반경. 5x5 의 절반


def shaded(ai):
    """이미 선 전봇대들의 «중심». 덮인 곳을 다시 덮지 않으려고 본다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, p in pairs(s.find_entities_filtered{
            type = "electric-pole", force = f}) do
        out[#out+1] = string.format("%.2f|%.2f", p.position.x, p.position.y)
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        x, y = str(row).split("|")
        out.append((float(x), float(y)))
    return out


def cover(ai, hungry):
    """굶는 것들을 덮을 전봇대 자리.

    한 대가 여럿을 덮을 수 있으면 한 대만 세운다. 굶는 것 하나마다 한
    대씩 세우면 전봇대가 밭을 이룬다 - 덮이기만 하면 되는 일에 자리를
    낭비할 이유가 없다.

    자리는 굶는 것 «바로 옆»에서 고른다. 그래야 기존 선에서도 멀지 않다.

    그리고 «이미 덮여 있는데 굶는 것»에는 한 대도 더 세우지 않는다.

        사용자: "전선이 불필요하게 과도하게 깔린 부분 발생함"

        실측: 전봇대 39 대, 전기를 먹는 것 17 개.
              그중 열넷이 없어도 되는 것이었다.

    전력망이 둘로 갈라져 있던 동안 제련줄 쪽이 계속 「굶는다」고 나왔고,
    고리는 그때마다 덮개를 한 겹씩 더 씌웠다. 선이 안 이어진 것이 원인인데
    엉뚱한 약을 쓴 것이다.

        덮이지 않아서 굶는 것과, 전기가 안 와서 굶는 것은 다른 말이다.
    """
    already = shaded(ai)
    skip = [one for one in hungry
            if any(abs(one[0] + 0.5 - px) <= SUPPLY + 0.5
                   and abs(one[1] + 0.5 - py) <= SUPPLY + 0.5
                   for px, py in already)]
    if skip:
        print(f"  {len(skip)}개는 «이미 덮여 있는데» 굶는다 "
              f"- 전봇대를 더 세울 일이 아니다")
    left = [one for one in hungry if one not in skip]
    spots = []
    while left:
        x, y, _name = left[0]
        # 후보를 «하나만» 내고 그것이 막히면 끝나는 구조였다. 실제로 첫
        # 후보가 화로 안이었고, 굶는 인서터는 그대로 굶었다.
        #
        # 덮는 것이 많은 자리부터, 같으면 가까운 자리부터 - 그렇게 줄을
        # 세워 두고 «놓을 수 있는 첫 자리»를 쓴다. 한 자리가 막히는 것과
        # 덮을 방법이 없는 것은 다른 말이다.
        seats = []
        for dx in range(-SUPPLY, SUPPLY + 1):
            for dy in range(-SUPPLY, SUPPLY + 1):
                spot = (x + dx, y + dy)
                mine = [one for one in left
                        if abs(one[0] - spot[0]) <= SUPPLY
                        and abs(one[1] - spot[1]) <= SUPPLY]
                seats.append((-len(mine), abs(dx) + abs(dy), spot, mine))
        seats.sort(key=lambda s: (s[0], s[1]))
        here = missing(ai, [s[2] for s in seats])
        if not here:
            print(f"  ({x},{y}) 를 덮을 자리가 하나도 없다 - 둘레가 꽉 찼다")
            left = [one for one in left if one != left[0]]
            continue
        spots.append(here[0])
        took = next((s[3] for s in seats if s[2] == here[0]), [left[0]])
        left = [one for one in left if one not in took]
    return spots


def gaps(ai):
    """«실제로» 끊긴 곳. 계획이 아니라 전력망이 답한다.

    자리를 다 채웠는데도 전기가 안 흐르는 일이 되풀이됐다. 계획한 간격과
    선 간격이 다르고, 전봇대가 열일곱 대 서 있어도 전력망은 여섯 개일
    수 있다.

    그러니 「어디가 비었나」를 계획에 묻지 말고 «망»에 묻는다. 이웃한 두
    전봇대의 망이 다르면 그 사이가 구멍이고, 메울 자리는 그 한가운데다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local ps = {}
      for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f}) do
        ps[#ps+1] = p
      end
      table.sort(ps, function(a, b)
        if a.position.x ~= b.position.x then return a.position.x < b.position.x end
        return a.position.y < b.position.y
      end)
      local out = {}
      for i = 2, #ps do
        local a, b = ps[i-1], ps[i]
        if a.electric_network_id ~= b.electric_network_id then
          local dx, dy = b.position.x - a.position.x, b.position.y - a.position.y
          local span = math.sqrt(dx*dx + dy*dy)
          if span < 24 then
            out[#out+1] = string.format("%.0f|%.0f|%.0f",
              (a.position.x + b.position.x) / 2,
              (a.position.y + b.position.y) / 2, span)
          end
        end
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        x, y, span = row.split("|")
        out.append((int(x), int(y), int(span)))
    return out


def woods(ai, near):
    """가장 가까운 나무. «있는 데»로 가서 베어야 한다.

    전봇대 열한 대에 드는 나무는 여섯이다. 그런데 이 판의 간선 경로에는
    나무가 한 그루도 없어서, 짓는 자리에서 베라고 시키면 「반경 안에
    나무가 없다」로 계획 전체가 멈춘다.

    적은 재료라도 «어디 있는지»는 알아야 한다.
    """
    x, y = near
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local best, bd = nil, 1e18
      for _, t in pairs(s.find_entities_filtered{type = "tree",
                position = {%d, %d}, radius = 220}) do
        local d = (t.position.x - %d)^2 + (t.position.y - %d)^2
        if d < bd then bd, best = d, t end
      end
      if not best then return { none = 1 } end
      return { x = best.position.x, y = best.position.y,
               gap = math.floor(math.sqrt(bd)) }
    end)()""" % (x, y, x, y))
    if reply.get("none"):
        return None
    return (float(reply["x"]), float(reply["y"]), int(reply["gap"]))


def busy(ai, who):
    row = next((w for w in ai.list() if w["name"] == who), None)
    if not row or not row.get("alive"):
        return None
    return bool(row.get("current") or row.get("queued"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--from", dest="src", required=True,
                    help="발전소 쪽. 음수는 --from=-52,-9")
    ap.add_argument("--to", dest="dst", required=True, help="기지 쪽")
    ap.add_argument("--depot", default=None,
                    help="구리판을 집어 올 창고. 음수는 --depot=-5,-90")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=200)
    args = ap.parse_args()

    crew = args.who or ["alpha"]
    src = tuple(int(v) for v in args.src.split(","))
    dst = tuple(int(v) for v in args.dst.split(","))
    depot = tuple(int(v) for v in args.depot.split(",")) if args.depot else None
    ai = AIBridge()

    spots = line(src, dst)
    print(f"{src} -> {dst} : {math.hypot(dst[0]-src[0], dst[1]-src[1]):.0f}칸, "
          f"전봇대 {len(spots)}대")

    for _ in range(args.rounds):
        try:
            hungry = starved(ai)
            if joined(ai, src, dst) and not hungry:
                print("전기가 기지까지 흐르고, 먹는 것들이 전부 받고 있다.")
                return 0
            who = next((n for n in crew if busy(ai, n) is False), None)
            if not who:
                time.sleep(args.every)
                continue

            # 끊긴 곳이 «먼저»다.
            #
            # 처음에는 굶는 것을 덮는 일을 앞에 두었다. 그런데 망이 갈라져
            # 있을 때 굶는 쪽에 전봇대를 더 세우면, 그 전봇대는 발전기가
            # 없는 쪽 망에 붙는다 - 세울수록 굶는 것이 늘어난다.
            #
            #   실측: 전력망 2개(n5=21, n16=7), 굶는 인서터 12.
            #         n16 쪽에 아홉 대를 더 세우라는 계획이 나왔다.
            #
            # 덮는 것은 «전기가 오는 곳»에서만 뜻이 있다. 선이 먼저다.
            todo = []

            # 끊긴 곳이 있으면 «그곳부터». 새 자리를 채우는 것보다
            # 이미 선 것들을 잇는 쪽이 언제나 싸다.
            # 끊긴 곳의 «한가운데»가 늘 빈 땅인 것은 아니다. 20회차에서는
            # 남은 두 자리가 추락한 우주선 잔해 위였고, 그 자리를 고집하는
            # 동안 bravo 는 전봇대를 269개 만들어 들고만 있었다.
            #
            # 메울 자리도 「놓을 수 있나」를 거쳐야 한다 - missing() 이
            # 이미 아홉 방향으로 비켜 보고, 어디로도 못 비키면 뺀다.
            holes = [] if todo else gaps(ai)
            if holes:
                todo = missing(ai, [(x, y) for x, y, _span in holes])
            if holes and not todo:
                print(f"  끊긴 곳 {len(holes)}군데인데 메울 자리가 없다 "
                      f"- 사이를 «둘로» 나눠 본다")
                halves = []
                for x, y, _span in holes:
                    halves += [(x - 3, y), (x + 3, y), (x, y - 3), (x, y + 3)]
                todo = missing(ai, halves)
            if not todo:
                todo = missing(ai, spots)
            # 선이 다 이어진 뒤에야 «덮이지 않은 띠»를 본다.
            if not todo and not holes and hungry:
                todo = cover(ai, hungry)
                names = sorted({one[2] for one in hungry})
                print(f"  선은 이어졌는데 {len(hungry)}개가 굶는다 "
                      f"({', '.join(names[:3])}) - 덮을 자리 {len(todo)}")
            if holes:
                print(f"  끊긴 곳 {len(holes)}군데 - 메울 자리 {len(todo)}개")
            if not todo:
                print("  자리는 다 찼는데 망이 안 이어졌다 - 간격을 의심할 것")
                time.sleep(args.every)
                continue

            batch = todo[:PER_TRIP]
            held = ai.agent(who).items()
            need = len(batch) * WOOD_PER_POLE + 4
            copper = len(batch) * COPPER_PER_POLE + 4
            plan = []
            if depot and int(held.get("copper-plate", 0)) < copper:
                plan += [("walk_to", {"x": depot[0] - 2, "y": depot[1] + 1}),
                         ("take", {"name": "copper-plate", "x": depot[0] + 0.5,
                                   "y": depot[1] + 0.5, "count": copper})]
            if int(held.get("wood", 0)) < need:
                grove = woods(ai, batch[0])
                if not grove:
                    print("  둘레에 나무가 없다 - 전봇대를 못 만든다")
                    time.sleep(args.every)
                    continue
                plan += [("walk_to", {"x": grove[0], "y": grove[1]}),
                         ("chop", {"x": grove[0], "y": grove[1], "count": need})]
            plan.append(("craft", {"recipe": POLE, "count": len(batch), "wait": False}))
            for at in batch:
                # snap 은 안 쓴다. 자리가 밀리면 간격이 무너지고, 무너진
                # 간격은 「세웠다」로 보이면서 전기는 안 흐른다.
                plan.append(("build", {"name": POLE, "x": at[0], "y": at[1]}))
            submit(ai, who, plan, strict=False)
            print(f"{who}: 전봇대 {len(batch)}대 "
                  f"({batch[0][0]},{batch[0][1]}) 부터 - 남은 {len(todo)}자리")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    print("간선이 시간 안에 안 이어졌다.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

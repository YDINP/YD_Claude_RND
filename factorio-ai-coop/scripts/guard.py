"""Defence: be ready before the research lands, and build the moment it does.

18회차는 62분에 `gun-turret` 연구를 끝냈다. 세 판 만에 처음이다. 그리고
포탑을 **한 대도** 못 세우고 전원 사망했다.

    연구 gun-turret  완료          포탑  0대
    창고 철판 1354 · 구리판 38     적 유닛 51마리 / 웜 4기 (150칸)
    시체 8구, 전부 «기지 안»       (41,-114) (47,-114) (58,-113) ...

재료가 모자란 게 아니었다. 포탑 수십 대 분량이 창고에 있었다. 증식.유통.
발전 세 고리가 쉬지 않고 돌았고 여덟 명이 모두 바빴는데, 그 중 어느
고리에도 「포탑을 세운다」가 없었다.

> **모두가 바쁜 것과 «필요한 모든 일이 되고 있는 것»은 다르다.**

그리고 방어를 「연구가 끝나면 시작할 일」로 두면 늘 늦는다. 연구가 끝난
순간에 필요한 것은 결정이 아니라 **이미 만들어 둔 포탑과 탄약**이다.
그래서 이 고리는 연구를 기다리는 동안 논다는 선택지가 없다.

    python scripts/guard.py --who golf --who hotel --depot 60,-115
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

TURRET = "gun-turret"
AMMO = "firearm-magazine"
WALL = "stone-wall"

TURRET_COST = {"iron-plate": 40, "copper-plate": 10}   # 기어까지 친 넉넉한 값
# 탄약 한 발이 철판 넷이고, 포탑 한 대가 철판 마흔이다. 그래서 「한
# 대에 몇 발을 채우나」는 «탄약 이야기»가 아니라 «포탑 몇 대를 세우나»
# 하는 이야기다.
#
#     실측(21회차): 포탑 9대 x 20발 + 창고 297발 = 477발 = 철판 1,908장
#                   그 사이 덮인 건물은 12/101 = 11% 였다.
#
# 둘레의 89%가 열려 있는데 철판 1,900장이 탄창으로 누워 있었던 셈이다.
# 위키(Enemies)가 말하듯 벌레는 «열린 길»로 걸어간다 - 포탑이 없는 곳에
# 탄약을 쌓아 두는 것은 그 길을 막지 못한다.
#
#     20회차가 진 것은 밀도가 모자라서가 아니라 사슬이 짧아서였다.
#
# 그래서 깊이를 줄이고 길이를 산다. 열 발이면 지속 사격 10초고, 보급
# 순찰이 그 사이에 채운다 - 비어 있는 것과는 전혀 다르다.
AMMO_EACH = 10            # 포탑 한 대에 «세울 때» 채워 두는 탄약
AMMO_STOCK = 100          # 창고에 쌓아 둘 탄약 (나머지는 포탑으로 나간다)
PER_TRIP = 3              # 한 걸음에 세우는 포탑

# 방어선은 «우리 건물이 있는 곳»을 따라간다.
#
#     사용자: "기관포탑이 아래쪽만 깔렸고, 구리,돌채광지가 방어받지
#              못할듯. 방어는 사방으로 해야하고, 내부에도 간간히 섞어야함.
#              우리건물이 있는곳을 기지 내부라고 판단하고 기관포탑
#              방어선을 구축해야함."
#
# 그전까지는 「적이 오는 쪽」 한 면만 골랐다. 실측(20회차): 건물이
# (-53,-26)~(87,90) 에 퍼져 있는데 포탑 열두 대가 전부 남쪽 세 줄에
# 몰려 있었고, 동쪽과 북쪽은 비어 있었으며, 돌.구리 초소는 선 밖이었다.
#
# 한 면만 지키는 것은 「어디서 오는지 안다」는 전제 위에 선다. 확장은
# 그 전제를 지키지 않는다 - 17회차가 사방에서 뚫렸다.
# 묶는 거리. 실측(20회차 건물 65채):
#   45 -> 구역 1개, 160x136 을 두르는 데 41자리. 대부분이 빈 땅이다
#   30 -> 구역 5개, 같은 39자리로 59x51 / 22x24 / 29x28 ... 을 두른다
# 자리 수는 같은데 «지킬 것 옆»에 선다. 16회차가 포탑 열두 대로 빈 땅을
# 지키다 밭에서 둘을 잃은 것이 큰 상자의 값이다.
LINK = 30                 # 이보다 가까운 건물끼리는 «한 구역»
STANDOFF = 10             # 건물에서 이만큼 밖에 선다
# 포탑 사이 간격.
#
#     사용자: "포탑방어선은 왠만하면 서로의 공격영역이 겹치면 좋음."
#
# 사거리와 «같은» 간격으로 두면 원 둘이 한 점에서 스칠 뿐이다. 그 점을
# 지나는 적은 한 대에게만 맞고, 대각선 쪽에는 아예 구멍이 남는다. 그리고
# 한 대가 탄약이 떨어지면 그 구간은 통째로 빈다.
#
# 사거리 18에 간격 12면 테두리 어느 점이든 최소 두 대가 닿는다. 값은
# 포탑 수가 1.5배 - 빈 총 한 대에 구간 하나가 열리는 것보다 싸다.
RING_GAP = 12
INNER_GAP = 34            # 안쪽은 성기게. 테두리가 뚫린 날 시간을 번다
INNER_NEAR = 26           # 지킬 것이 이만큼 안에 없으면 빈 땅이다
# 이미 선 포탑과 이만큼 가까우면 안 세운다. 간격보다 작아야 한다 -
# 간격과 같으면 «겹치라고 좁힌 자리»를 스스로 걷어낸다.
CLOSE = 8
# 성장 몫은 남기되, «남기느라 한 발도 못 만드는» 것은 지난 판의 재현이다.
# 채굴기+상자 여섯 대 분량(6 x 17)이면 증식은 안 끊긴다.
KEEP_PLATE = 120


def watch(ai, who):
    """방어의 형편. 연구.포탑.탄약.적을 한 번에 본다."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local e = game.forces.enemy
      local mid = { x = 0, y = 0 }
      local n = 0
      for _, m in pairs(s.find_entities_filtered{type={"furnace","mining-drill","lab"},
                force=f}) do
        mid.x = mid.x + m.position.x; mid.y = mid.y + m.position.y; n = n + 1
      end
      if n > 0 then mid.x = mid.x / n; mid.y = mid.y / n end
      local rounds, starved = 0, 0
      for _, t in pairs(s.find_entities_filtered{name="gun-turret", force=f}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        local have = inv and inv.get_item_count("firearm-magazine") or 0
        rounds = rounds + have
        if have < 5 then starved = starved + 1 end
      end
      return {
        gun = f.technologies["gun-turret"].researched and 1 or 0,
        wall = f.technologies["stone-wall"].researched and 1 or 0,
        turrets = s.count_entities_filtered{name="gun-turret", force=f},
        rounds = rounds, starved = starved,
        mid_x = mid.x, mid_y = mid.y,
        units = s.count_entities_filtered{type="unit", force=e,
                position=mid, radius=150},
        worms = s.count_entities_filtered{type="turret", force=e,
                position=mid, radius=150},
        nests = s.count_entities_filtered{type="unit-spawner", position=mid, radius=200},
      }
    end)()""")


def depot_has(ai, depot):
    x, y = depot
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, c in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="container", force=game.forces.player}) do
        for _, item in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
          out[item.name] = (out[item.name] or 0) + item.count
        end
      end
      return out
    end)()""" % (x - 3, y - 4, x + 3, y + 6))


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


GUARDED = ("mining-drill", "furnace", "container", "lab", "boiler",
           "generator", "offshore-pump", "assembling-machine", "electric-pole")


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def holdings(ai):
    """지켜야 할 것들이 어디 있나. 포탑 자리는 여기서 나온다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, e in pairs(s.find_entities_filtered{
            type = {"mining-drill", "furnace", "container", "lab", "boiler",
                    "generator", "offshore-pump", "assembling-machine"},
            force = game.forces.player}) do
        out[#out+1] = string.format("%.0f|%.0f|%s", e.position.x, e.position.y,
                                    e.name)
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        x, y, name = row.split("|")
        out.append((float(x), float(y), name))
    return out


# 무엇을 먼저 지키나. 값은 «다시 세우는 데 드는 것»이다.
#
# 채굴기는 철판 아홉 장이면 다시 선다. 연구소는 전기가 있어야 하고,
# 전기는 물가에 발전소가 있어야 하고, 그 사슬은 이 저장소에서 세 판
# 동안 한 번도 안 끝났다. 둘이 같은 값일 수 없다.
# 이름으로 «조각»을 맞춘다. 같은 일을 하는 것이 여러 이름으로 오기
# 때문이다 - burner-mining-drill 과 electric-mining-drill 은 둘 다
# 채굴기이고, stone-furnace 와 steel-furnace 는 둘 다 화로다.
WORTH = (("lab", 100), ("steam-engine", 80), ("boiler", 80),
         ("offshore-pump", 80), ("assembling-machine", 40),
         ("furnace", 10), ("mining-drill", 5), ("chest", 3))


def worth(group):
    best = 1
    for _x, _y, name in group:
        for key, value in WORTH:
            if key in name and value > best:
                best = value
    return best


def standing_turrets(ai):
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret",
                force = game.forces.player}) do
        out[#out+1] = string.format("%.0f|%.0f", t.position.x, t.position.y)
      end
      return out
    end)()""")
    return [tuple(float(v) for v in r.split("|")) for r in _rows(reply)]


def clusters(points, link=LINK):
    """가까운 건물끼리 묶는다. 떨어져 있는 초소는 «자기 울타리»를 받는다.

    돌밭이 기지에서 90칸이면 그것은 기지의 남쪽 변이 아니라 «다른 구역»
    이다. 하나로 묶어 버리면 그 사이 빈 땅까지 포탑으로 두르게 된다.
    """
    groups: list[list] = []
    for p in points:
        hit = [g for g in groups
               if any(abs(p[0] - q[0]) <= link and abs(p[1] - q[1]) <= link
                      for q in g)]
        if not hit:
            groups.append([p])
            continue
        first = hit[0]
        first.append(p)
        for other in hit[1:]:
            first.extend(other)
            groups.remove(other)
    return groups


def ring(box, gap=RING_GAP):
    """네 변을 «전부» 돈다. 한 면만 지키는 것은 어디서 오는지 안다는 뜻이다."""
    left, top, right, bottom = box
    out = []
    x = left
    while x <= right:
        out += [(x, top), (x, bottom)]
        x += gap
    if out and out[-2][0] < right - gap / 2:
        out += [(right, top), (right, bottom)]
    y = top + gap
    while y < bottom:
        out += [(left, y), (right, y)]
        y += gap
    return out


def inside(box, points, gap=INNER_GAP, near=INNER_NEAR):
    """안쪽에도 «간간히». 다만 지킬 것이 곁에 있는 자리만."""
    left, top, right, bottom = box
    out = []
    y = top + gap
    while y < bottom:
        x = left + gap
        while x < right:
            if any(abs(x - p[0]) <= near and abs(y - p[1]) <= near
                   for p in points):
                out.append((x, y))
            x += gap
        y += gap
    return out


RANGE = 18                # 기관포탑 사거리. 「지킨다」의 유일한 기준


def covers(group, have, reach=RANGE):
    """이 구역을 «실제로 덮는» 포탑 수.

    처음에는 구역 상자를 여유 있게 넓혀 그 안의 포탑을 셌다. 그랬더니
    연구소 구역이 「포탑 1대」로 나왔는데, 실측하니 가장 가까운 포탑이
    44칸 - 사거리의 두 배가 넘었다. 넓은 상자가 «남의 포탑»을 자기
    것으로 세어 준 것이다.

    지킨다는 말의 기준은 상자가 아니라 «사거리»다.
    """
    return sum(1 for t in have
               if any(abs(t[0] - p[0]) <= reach and abs(t[1] - p[1]) <= reach
                      for p in group))


def nudged(seat, mid, steps=(0, 4, 8, 12)):
    """이 자리가 막혔으면 «바깥으로» 비켜 본다.

    동쪽 구멍 네 곳이 전부 광맥 위였다. 광맥에 건물을 안 세우는 규칙은
    옳지만, 그 규칙이 「그러면 안 지킨다」로 끝나면 초소는 영영 맨몸이다.
    광맥을 피하는 방향은 정해져 있다 - 구역 «바깥»이다.
    """
    dx, dy = seat["x"] - mid[0], seat["y"] - mid[1]
    span = max(1.0, (dx * dx + dy * dy) ** 0.5)
    dx, dy = dx / span, dy / span
    return [dict(seat, x=seat["x"] + dx * k, y=seat["y"] + dy * k) for k in steps]


def plan_seats(ai):
    """사방 테두리 + 안쪽. 구역마다 따로 두른다.

    순서는 «큰 구역부터»가 아니라 «맨몸인 구역부터»다.

    사용자: "연구소도 방어받지 못함."

    실측(20회차): 본진 57채에 포탑 열다섯 대가 섰는데, 발전소+연구소
    다섯 채와 돌.구리 초소는 포탑이 0대였다. 큰 구역부터 채우니 작은
    초소가 영영 차례를 못 받은 것이다.

    포탑 열여섯 번째가 본진에 서는 값보다, 첫 번째가 연구소에 서는 값이
    크다. 연구소는 우리가 가진 가장 비싼 건물이고, 그것이 죽으면 다음
    연구가 없다.
    """
    ours = holdings(ai)
    if not ours:
        return []
    have = standing_turrets(ai)
    groups = clusters(ours)
    # 맨몸인 구역이 먼저. 그 다음은 «한 채당 포탑이 적은» 구역.
    # 맨몸인 구역이 먼저. 맨몸끼리는 «대체 불가능한 것»이 있는 쪽부터.
    groups.sort(key=lambda g: (covers(g, have) > 0, -worth(g),
                               covers(g, have) / max(1, len(g))))
    wanted = []
    for group in groups:
        box = (min(p[0] for p in group) - STANDOFF,
               min(p[1] for p in group) - STANDOFF,
               max(p[0] for p in group) + STANDOFF,
               max(p[1] for p in group) + STANDOFF)
        mid = (sum(p[0] for p in group) / len(group),
               sum(p[1] for p in group) / len(group))
        for at in ring(box):
            wanted.append({"x": at[0], "y": at[1], "why": "테두리",
                           "mid": mid})
        for at in inside(box, group):
            wanted.append({"x": at[0], "y": at[1], "why": "안쪽"})

    # 이미 선 것과 겹치거나, 자기들끼리 겹치는 자리는 뺀다.
    out = []
    taken = list(have)
    for seat in wanted:
        at = (seat["x"], seat["y"])
        if any(abs(at[0] - t[0]) < CLOSE and abs(at[1] - t[1]) < CLOSE
               for t in taken):
            continue
        taken.append(at)
        out.append(seat)
    return out


def covered(ai, reach=RANGE):
    """우리 건물 중 «포탑 사거리 안»에 있는 비율.

        사용자: "이게 너무 포탑을 띄워놓으면 안되는이유야."

    20회차에서 여덟 중 여섯이 죽었다. 그때 실측:

        우리 건물     443 채
        사거리 안     169 채  =  38%
        포탑           55 대

    포탑끼리의 간격은 오히려 촘촘했다 - 쉰다섯 중 쉰셋이 서로의 사거리
    안에 있었다. 문제는 그 촘촘한 사슬이 x=-63 에서 106 까지 펼쳐진
    공장을 감싸기엔 «너무 짧다»는 것이었다. 사슬이 62%를 바깥에 두었고,
    무리는 매 순번 그 바깥으로 걸어갔다. 기지는 멀쩡했고 죽은 것은
    밖에 나가 있던 사람뿐이다.

    그래서 목표를 「포탑 몇 대」에서 «덮인 비율»로 바꾼다. 대수는 판이
    커질수록 뜻을 잃는다 - 이 저장소가 구리 화로에서 이미 배운 것과
    같은 말이다.

    돌려주는 것: (덮인 수, 전체 수)
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local seats = {}
      for _, t in pairs(s.find_entities_filtered{
            type = "ammo-turret", force = f}) do
        seats[#seats+1] = t.position
      end
      local all, safe = 0, 0
      for _, e in pairs(s.find_entities_filtered{force = f}) do
        local ty = e.type
        if ty == "mining-drill" or ty == "furnace" or ty == "container"
           or ty == "lab" or ty == "assembling-machine" then
          all = all + 1
          for _, p in pairs(seats) do
            local dx, dy = e.position.x - p.x, e.position.y - p.y
            if dx * dx + dy * dy <= %d then safe = safe + 1 break end
          end
        end
      end
      return { all = all, safe = safe }
    end)()""" % (reach * reach))
    return int(reply["safe"]), int(reply["all"])


def unguarded(ai, reach=18):
    """포탑 사거리 밖에 있는 우리 건물들. 먼 것부터."""
    have = standing_turrets(ai)
    out = []
    for p in holdings(ai):
        gap = min((max(abs(p[0] - t[0]), abs(p[1] - t[1])) for t in have),
                  default=9999)
        if gap > reach:
            out.append((p[0], p[1], gap))
    return sorted(out, key=lambda z: -z[2])


def buildable(ai, spots):
    """놓을 수 있는 자리만. 물·절벽·광맥 위는 뺀다.

    나무와 바위는 «뺄 것»이 아니라 «벨 것»이다.

        사용자: "나무가 진로방해 / 건설방해 가 된다면 벌목도 어느정도 하도록"

    나무에 막힌 자리를 그냥 빼면 그만큼 고리가 벌어진다. 그리고 벌어진
    고리 사이로 들어온 무리가 밭에서 일하던 사람을 잡는다 - 20회차에
    여섯을 그렇게 잃었다. 도끼 몇 번이면 될 일에 목숨값을 치를 이유가 없다.
    """
    if not spots:
        return []
    body = ", ".join(f"{{{s['x']},{s['y']}}}" for s in spots[:60])
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      local spots = { %s }
      for i, p in ipairs(spots) do
        local ore = s.count_entities_filtered{
          area = {{p[1] - 1, p[2] - 1}, {p[1] + 1, p[2] + 1}}, type = "resource"}
        local free = s.can_place_entity{name = "gun-turret",
                      position = {p[1], p[2]}, force = f}
        if ore > 0 then
          out[i] = 0
        elseif free then
          out[i] = 1
        else
          -- 막혔다면 «무엇이» 막았는지 본다. 나무와 바위뿐이면 베고 세운다.
          local hard = 0
          for _, e in pairs(s.find_entities_filtered{
                area = {{p[1] - 1, p[2] - 1}, {p[1] + 1, p[2] + 1}}}) do
            local t = e.type
            if t ~= "character" and t ~= "item-entity" and t ~= "resource"
               and not (e.minable and (t == "tree" or t == "simple-entity")) then
              hard = hard + 1
            end
          end
          out[i] = (hard == 0) and 2 or 0
        end
      end
      return out
    end)()""" % body)
    ok = _rows(reply)
    out = []
    for i, spot in enumerate(spots[:60]):
        if i >= len(ok):
            break
        state = int(ok[i])
        if state == 0:
            continue
        # 2 는 「나무만 막고 있다」는 뜻이다. 세우기 전에 베라고 적어 둔다.
        if state == 2:
            spot = dict(spot, chop=True)
        out.append(spot)
    return out


def seats(ai, who):
    """놓을 수 있는 자리. 막힌 테두리는 바깥으로 한 번 비켜 본다."""
    wanted = plan_seats(ai)
    ok = buildable(ai, wanted)
    if len(ok) >= PER_TRIP:
        return ok
    blocked = [s for s in wanted if s not in ok and s.get("mid")]
    tries = [alt for s in blocked[:12] for alt in nudged(s, s["mid"])[1:]]
    return ok + buildable(ai, tries)


def stockpile(ai, who, shelf, have):
    """연구를 기다리는 동안 «탄약»을 만들어 쌓는다.

    빈 총은 없는 총이다. 그리고 탄약은 연구가 필요 없다 - 지금 만들 수
    있는 것을 지금 만들어 두지 않으면, 연구가 끝난 순간에 또 기다린다.
    """
    short = AMMO_STOCK - int(have.get(AMMO, 0))
    plates = int(have.get("iron-plate", 0)) - KEEP_PLATE
    n = min(short, max(0, plates) // 4)
    if n < 20:
        return False
    submit(ai, who, [
        ("walk_to", {"x": shelf["iron-plate"][0] - 2, "y": shelf["iron-plate"][1] + 1}),
        ("take", {"name": "iron-plate", "x": shelf["iron-plate"][0],
                  "y": shelf["iron-plate"][1], "count": n * 4}),
        ("craft", {"recipe": AMMO, "count": n, "wait": True}),
        ("insert", {"name": AMMO, "x": shelf["iron-plate"][0],
                    "y": shelf["iron-plate"][1], "count": n}),
    ], strict=False)
    print(f"{who}: 탄약 {n}발 만들어 쌓기 (비축 {have.get(AMMO, 0)}/{AMMO_STOCK})")
    return True


def raise_turrets(ai, who, shelf, have, spots):
    """포탑을 세우고 «그 자리에서» 탄약을 넣는다.

    세우고 잊으면 빈 총이 선다. 채굴기에서 겪은 그것이다.
    """
    n = min(PER_TRIP, len(spots))
    need_plate = n * TURRET_COST["iron-plate"] + n * AMMO_EACH * 4
    if int(have.get("iron-plate", 0)) < need_plate:
        n = max(0, (int(have.get("iron-plate", 0)) - 40)
                // (TURRET_COST["iron-plate"] + AMMO_EACH * 4))
    if int(have.get("copper-plate", 0)) < n * TURRET_COST["copper-plate"]:
        n = int(have.get("copper-plate", 0)) // TURRET_COST["copper-plate"]
    spots = spots[:n]
    if not spots:
        return False

    ammo_ready = int(have.get(AMMO, 0))
    make_ammo = max(0, n * AMMO_EACH - ammo_ready)
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1}),
            ("take", {"name": "iron-plate", "x": shelf["iron-plate"][0],
                      "y": shelf["iron-plate"][1],
                      "count": n * TURRET_COST["iron-plate"] + make_ammo * 4}),
            ("take", {"name": "copper-plate", "x": shelf["iron-plate"][0],
                      "y": shelf["iron-plate"][1],
                      "count": n * TURRET_COST["copper-plate"]})]
    if ammo_ready:
        plan.append(("take", {"name": AMMO, "x": shelf["iron-plate"][0],
                              "y": shelf["iron-plate"][1],
                              "count": min(ammo_ready, n * AMMO_EACH)}))
    # 포탑도 «기다린다». 탄약만 고치고 여기는 안 고쳤다가 다시 걸렸다.
    #
    #     guard: "포탑 1대 (테두리) + 탄약 20발씩"   <- 매 순번 이렇게 찍히고
    #     서 있는 포탑 7대                           <- 수는 안 늘고
    #     alpha 가방 {gun-turret: 1}, bravo 가방 {gun-turret: 1}
    #
    # 포탑은 8초가 걸리는데 자리가 가까우면 걸어가는 데 그만큼 안 걸린다.
    # 그러면 세울 차례에 아직 손에 없고, 만들어진 포탑은 가방에 남는다.
    # 가방에 쌓이는 동안 화면에는 계속 「세웠다」고 찍힌다.
    #
    # 한 군데를 고치면 같은 모양을 «전부» 찾아야 한다. 하나만 고치면
    # 고쳤다는 기억만 남고 고장은 그대로 남는다.
    plan.append(("craft", {"recipe": TURRET, "count": n, "wait": True}))
    if make_ammo:
        # 탄약만은 «기다린다».
        #
        # 이 함수의 첫 줄에 「세우고 잊으면 빈 총이 선다」고 적어 두고도
        # 그 일이 났다. 포탑 두 대가 섰고, 탄약은 0이었다.
        #
        #     wait: False 는 「만들라고 시켰다」지 «만들어졌다»가 아니다.
        #
        # 포탑은 만들라고 시킨 뒤 자리까지 걸어가는 동안 완성돼서 우연히
        # 맞았다. 탄약은 그 뒤에 줄을 서므로 넣을 차례에 아직 손에 없다.
        # 우연히 맞는 것에 기대면 급할 때 틀린다.
        plan.append(("craft", {"recipe": AMMO, "count": make_ammo, "wait": True}))
    for spot in spots:
        # snap 을 쓰면 자리가 열여섯 칸까지 밀리는데, 탄약은 «부른 칸»에
        # 넣는다. 넣을 것을 반경 1.5로 찾으므로 밀린 포탑은 빈 총이 된다 -
        # 지난 판에 진 그 모양이다. 자리표가 이미 빈 칸만 내놓으므로
        # 그대로 세우고, 모서리 대 가운데 어긋남만큼만 넓게 찾는다.
        plan.append(("walk_to", {"x": spot["x"] + 2, "y": spot["y"] + 2}))
        if spot.get("chop"):
            # 나무만 막고 있는 자리다. 포탑은 2x2 라 네 칸을 먹으므로 네
            # 칸을 다 본다. 한 칸을 가리키려면 그 칸의 «가운데»를 가리킨다.
            for dx in (-1, 0):
                for dy in (-1, 0):
                    plan.append(("demolish",
                                 {"x": spot["x"] + dx + 0.5,
                                  "y": spot["y"] + dy + 0.5,
                                  "search_radius": 0.6}))
        plan.append(("build", {"name": TURRET, "x": spot["x"], "y": spot["y"]}))
        plan.append(("insert", {"name": AMMO, "x": spot["x"], "y": spot["y"],
                                "count": AMMO_EACH, "search_radius": 2.5}))
    submit(ai, who, plan, strict=False)
    why = ",".join(sorted({s["why"] for s in spots}))
    print(f"{who}: 포탑 {n}대 ({why}) + 탄약 {AMMO_EACH}발씩")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None,
                    help="방어 당번. 여러 번 줄 수 있다 (.bat 이 쉼표를 자른다)")
    ap.add_argument("--depot", default="60,-115")
    ap.add_argument("--want", type=int, default=16, help="포탑 수 상한(보조)")
    ap.add_argument("--cover", type=int, default=95,
                    help="목표는 대수가 아니라 «덮인 비율»이다 (기본 95%%)")
    ap.add_argument("--every", type=float, default=20)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    crew = args.who or ["golf", "hotel"]
    dx, dy = (int(float(v)) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue
            have = depot_has(ai, (dx, dy))
            if not have:
                print("  창고가 아직 안 섰다 - 발판을 기다린다")
                time.sleep(args.every)
                continue
            st = watch(ai, free[0])

            if not int(st["gun"]):
                # 연구는 남의 일이다. 이 고리는 그 사이에 «탄약»을 쌓는다.
                if not stockpile(ai, free[0], shelf, have):
                    print(f"  연구를 기다린다 - 탄약 {have.get(AMMO, 0)} "
                          f"적 {st['units']}마리 웜 {st['worms']}기")
                time.sleep(args.every)
                continue

            safe_n, all_n = covered(ai)
            pct = safe_n * 100 // max(1, all_n)
            if pct >= args.cover:
                # 「지킬 만큼은 지켜졌다」라고 적었던 자리다. 틀린 말이었다.
                #
                # 위키(Enemies)는 벌레가 목표까지 최단 경로로 가며, 우회할
                # 길이 있으면 «장애물을 거들떠보지 않고» 돌아간다고 적는다.
                # 그러니 사거리 밖에 남은 건물은 「아직 못 덮은 몫」이 아니라
                # 그 건물로 곧장 이어지는 «열린 문»이다.
                #
                #     20회차: 38%를 「38% 지켜짐」으로 읽었다.
                #             실제 뜻은 「62%로 가는 뒷문이 늘 열려 있다」였다.
                #
                # 비율은 안심을 주고, 남은 수는 일을 준다. 남은 수를 적는다.
                left = all_n - safe_n
                if left:
                    print(f"건물 {safe_n}/{all_n} = {pct}% - 아직 {left}채가 "
                          f"사거리 밖이다 (그만큼 문이 열려 있다)")
                else:
                    print(f"건물 {all_n}채가 «전부» 사거리 안이다 - 둘레가 닫혔다")
                if free:
                    stockpile(ai, free[0], shelf, have)
                time.sleep(args.every)
                continue

            # 목표는 «덮인 비율»이지 대수가 아니다. 대수는 판이 커질수록
            # 뜻을 잃는다 - 쉰다섯 대가 443채 중 169채만 덮고 있었다.
            if pct < args.cover:
                spots = seats(ai, free[0])
                if spots and raise_turrets(ai, free[0], shelf, have, spots):
                    free = free[1:]
                elif not spots:
                    print("  세울 자리가 안 나온다 - 지킬 것이 아직 없다")

            if free and int(st["turrets"]):
                stockpile(ai, free[0], shelf, have)

            if int(st["starved"]):
                print(f"  빈 총 {st['starved']}대 - 보급 순찰이 채워야 한다")

            # 조용히 도는 것과 «다 지켜지는 것»은 다르다. 안 지켜지는
            # 건물이 몇 채인지 매 순번 말한다.
            bare = unguarded(ai)
            if bare:
                spot = bare[0]
                print(f"  덮인 건물 {safe_n}/{all_n} = {pct}% "
                      f"(포탑 {st['turrets']}대) · 가장 먼 무방비 "
                      f"({spot[0]:.0f},{spot[1]:.0f}) 포탑까지 {spot[2]:.0f}칸")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

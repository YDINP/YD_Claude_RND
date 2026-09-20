"""Inspect every belt and every arm: is it actually doing something?

    사용자: "벨트랑 인서터 잘 배치되었는지, 방향은 맞는지 체크하고 검수할것"

지금까지 잘못된 배치는 «사진»으로 한 건씩 잡혔다. 화로 사이에 낀 벨트
토막, 상자 하나만 받던 팔, 벨트에서 집어 벨트에 놓던 팔, 허공을 보고
끝나던 본선. 전부 사람이 화면을 보고 찾아 준 것이다.

    눈으로 찾은 것은 다음에도 눈으로 찾아야 한다.

그래서 «묻는 법»을 코드로 옮긴다. 한 칸 한 칸이 스스로 대답할 수 있는
질문은 셋뿐이다.

    벨트  : 나에게 «들어오는 것»이 있나 / 나에게서 «나가는 곳»이 있나
    팔    : 집을 것이 있나 / 놓을 데가 있나 / 그 둘이 «뜻이 있는 쌍»인가
    화로  : 나를 채워 주는 팔이 있나 / 나를 비워 주는 팔이 있나

이 셋이 다 예면 그 칸은 «돌고 있다». 하나라도 아니면 그 칸은 세워 둔
것이지 도는 것이 아니다 - 이 저장소가 스무 회차에 걸쳐 배운 그 말이다.

    python scripts/proof.py
    python scripts/proof.py --where 24,-4,66,22     # 이 네모만
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402

# 벨트 방향 -> 앞 칸
STEP = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}
FACE = {0: "북", 4: "동", 8: "남", 12: "서"}

# 팔이 집고 놓는 «뜻이 있는» 쌍. 무엇에서 무엇으로 가야 일이 되나.
HOLDS = {"container", "logistic-container", "furnace", "assembling-machine",
         "lab", "ammo-turret", "boiler", "mining-drill"}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def scan(ai, box=None):
    """벨트·팔·화로·채굴기를 한 번에 묻는다.

    세 번 나눠 물으면 그 사이에 세상이 바뀐다. 「A 는 있는데 B 가 없다」는
    진단이 사실은 «물어본 시각이 달라서»인 경우가 생긴다.
    """
    area = ("area = {{%d, %d}, {%d, %d}}," % box) if box else ""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local belts, arms, pots, drills = {}, {}, {}, {}
      for _, b in pairs(s.find_entities_filtered{%s
            type = "transport-belt", force = f}) do
        belts[#belts+1] = string.format("%%d|%%d|%%d|%%d",
          math.floor(b.position.x), math.floor(b.position.y),
          b.direction, b.get_item_count())
      end
      for _, e in pairs(s.find_entities_filtered{%s
            type = "inserter", force = f}) do
        local from, to = e.pickup_target, e.drop_target
        arms[#arms+1] = string.format("%%d|%%d|%%d|%%s|%%s|%%s|%%s|%%s",
          math.floor(e.position.x), math.floor(e.position.y), e.direction,
          from and from.type or "", to and to.type or "",
          from and from.name or "", to and to.name or "",
          e.is_connected_to_electric_network() and "1" or "0")
      end
      for _, c in pairs(s.find_entities_filtered{%s
            type = {"furnace", "container", "logistic-container",
                    "assembling-machine", "lab"}, force = f}) do
        pots[#pots+1] = string.format("%%d|%%d|%%s|%%s",
          math.floor(c.position.x), math.floor(c.position.y), c.name, c.type)
      end
      for _, d in pairs(s.find_entities_filtered{%s
            type = "mining-drill", force = f}) do
        local at = d.drop_position
        drills[#drills+1] = string.format("%%d|%%d",
          math.floor(at.x), math.floor(at.y))
      end
      return { belts = belts, arms = arms, pots = pots, drills = drills }
    end)()""" % (area, area, area, area))

    belts = {}
    for row in _rows(reply.get("belts")):
        x, y, d, load = (int(v) for v in str(row).split("|"))
        belts[(x, y)] = {"x": x, "y": y, "dir": d, "load": load}

    arms = []
    for row in _rows(reply.get("arms")):
        bits = str(row).split("|")
        while len(bits) < 8:
            bits.append("")
        arms.append({"x": int(bits[0]), "y": int(bits[1]), "dir": int(bits[2]),
                     "from": bits[3], "to": bits[4],
                     "from_name": bits[5], "to_name": bits[6],
                     "hot": bits[7] == "1"})

    pots = {}
    for row in _rows(reply.get("pots")):
        x, y, name, kind = str(row).split("|")
        pots[(int(x), int(y))] = {"name": name, "type": kind}

    drops = set()
    for row in _rows(reply.get("drills")):
        x, y = (int(v) for v in str(row).split("|"))
        drops.add((x, y))

    return belts, arms, pots, drops


def judge_arm(arm):
    """이 팔이 «일을 하고 있나». 아니면 왜 아닌가."""
    if not arm["hot"]:
        return "전기가 안 온다"
    if not arm["from"]:
        return "집을 것이 없다"
    if not arm["to"]:
        return "놓을 데가 없다"
    if arm["from"] == "transport-belt" and arm["to"] == "transport-belt":
        # 벨트에서 집어 벨트에 놓는 것은 «옮기는» 일이 아니다. 같은 길
        # 위에서 물건을 한 칸 밀어 줄 뿐이고, 그 일은 벨트가 이미 한다.
        return "벨트에서 집어 벨트에 놓는다 (헛일)"
    if arm["from"] not in HOLDS and arm["from"] != "transport-belt":
        return f"이상한 데서 집는다 ({arm['from_name']})"
    if arm["to"] not in HOLDS and arm["to"] != "transport-belt":
        return f"이상한 데 놓는다 ({arm['to_name']})"
    return None


def feeders(belts, arms, drops):
    """각 벨트 칸에 «들어오는 것»이 있나. 들어오는 쪽을 모아 둔다."""
    fed = set()
    for (x, y), belt in belts.items():
        step = STEP.get(belt["dir"])
        if not step:
            continue
        ahead = (x + step[0], y + step[1])
        if ahead in belts:
            fed.add(ahead)          # 앞 칸은 이 칸이 먹여 준다
    for arm in arms:
        step = STEP.get(arm["dir"])
        if not step:
            continue
        # 팔은 direction 쪽에서 «집고» 반대쪽에 «놓는다».
        fed.add((arm["x"] - step[0], arm["y"] - step[1]))
    fed |= drops                    # 버너 채굴기는 벨트에 바로 떨군다
    return fed


def drains(belts, arms, pots):
    """각 벨트 칸에서 «나가는 곳»이 있나."""
    out = set()
    for (x, y), belt in belts.items():
        step = STEP.get(belt["dir"])
        if not step:
            continue
        ahead = (x + step[0], y + step[1])
        if ahead in belts or ahead in pots:
            out.add((x, y))
    for arm in arms:
        step = STEP.get(arm["dir"])
        if not step:
            continue
        out.add((arm["x"] + step[0], arm["y"] + step[1]))   # 집어 가는 칸
    return out


def report(belts, arms, pots, drops, limit=6):
    lines = []

    bad = [(a, why) for a in arms for why in [judge_arm(a)] if why]
    lines.append(f"팔 {len(arms)}대 · 일 안 하는 것 {len(bad)}대")
    seen = {}
    for arm, why in bad:
        seen.setdefault(why, []).append(arm)
    for why, group in sorted(seen.items(), key=lambda kv: -len(kv[1])):
        spots = " ".join(f"({a['x']},{a['y']})" for a in group[:limit])
        rest = f" 외 {len(group) - limit}" if len(group) > limit else ""
        lines.append(f"  [{len(group)}] {why}: {spots}{rest}")

    fed = feeders(belts, arms, drops)
    out = drains(belts, arms, pots)
    hungry = [b for k, b in belts.items() if k not in fed]
    dead = [b for k, b in belts.items() if k not in out]
    lines.append(f"벨트 {len(belts)}칸 · 들어오는 것 없음 {len(hungry)} · "
                 f"나가는 곳 없음 {len(dead)}")
    for label, group in (("아무것도 안 들어온다", hungry),
                         ("앞이 막혔다", dead)):
        if not group:
            continue
        spots = " ".join(f"({b['x']},{b['y']}){FACE.get(b['dir'], '?')}"
                         for b in sorted(group, key=lambda b: (b["y"], b["x"]))[:limit])
        rest = f" 외 {len(group) - limit}" if len(group) > limit else ""
        lines.append(f"  [{len(group)}] {label}: {spots}{rest}")

    # 아무도 안 채우고 아무도 안 비우는 화로는 손으로 먹이는 화로다.
    filled, emptied = set(), set()
    for arm in arms:
        step = STEP.get(arm["dir"])
        if not step:
            continue
        filled.add((arm["x"] - step[0], arm["y"] - step[1]))
        emptied.add((arm["x"] + step[0], arm["y"] + step[1]))
    ovens = [(k, v) for k, v in pots.items() if v["type"] == "furnace"]
    starving, clogged = [], []
    for (x, y), _ in ovens:
        # 2x2 라 네 칸 어디에 팔이 붙어도 그 화로를 맡은 것이다.
        mine = {(x, y), (x - 1, y), (x, y - 1), (x - 1, y - 1)}
        if not (mine & filled):
            starving.append((x, y))
        if not (mine & emptied):
            clogged.append((x, y))

    # 「팔이 없다」 한 마디로 묶으면 무엇을 지어야 할지 알 수 없다.
    # 채워 줄 팔이 없는 화로와 비워 줄 팔이 없는 화로는 다른 공사다.
    lines.append(f"화로 {len(ovens)}대 · 채우는 팔 없음 {len(starving)} · "
                 f"비우는 팔 없음 {len(clogged)}")
    for label, group in (("넣어 줄 팔이 없다", starving),
                         ("꺼내 줄 팔이 없다", clogged)):
        if not group:
            continue
        spots = " ".join(f"({x},{y})" for x, y in sorted(group)[:limit])
        rest = f" 외 {len(group) - limit}" if len(group) > limit else ""
        lines.append(f"  [{len(group)}] {label}: {spots}{rest}")
    return lines


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--where", default=None,
                    help="네모만 본다. 예: --where=24,-4,66,22")
    ap.add_argument("--limit", type=int, default=6)
    args = ap.parse_args()

    box = None
    if args.where:
        box = tuple(int(v) for v in args.where.split(","))

    ai = AIBridge()
    belts, arms, pots, drops = scan(ai, box)
    for line in report(belts, arms, pots, drops, args.limit):
        print(line)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RconError as exc:
        print("게임이 대답하지 않는다:", exc)
        sys.exit(1)

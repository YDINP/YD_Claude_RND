"""Where a belt ends, something must take it off.

    사용자: "벨트에 철판 쌓이니까 물류 상자쪽에도 인서터와 벨트 연결해서
             상자에 자동으로 들어가도록 로직 추가해줘"

실측이 그대로다. 제련줄이 창고 앞까지 왔는데 마지막 한 칸이 비어 있었다.

    벨트 끝 [30,-2] 서쪽 -> (29,-2)   실린 것 4
    창고 상자 [30,0]                  받아 줄 팔 없음

벨트는 «자는 동안에도» 나르지만, 내려 주는 것까지 하지는 않는다. 길 끝에
팔이 없으면 실린 것은 거기까지 가서 멈추고, 뒤엣것이 밀려 줄 전체가 선다.
화로 결과칸이 가득 차 막히던 것과 똑같은 모양이 벨트 위에서 재현된다.

    깐 길과 «그 길에서 내리는 일»은 다른 일이다.

이 저장소는 이 교훈을 실을 때(`feed_belts`) 이미 한 번 배웠다. 내릴 때도
같다 - 앞의 것만 하면 벨트는 장식이 된다.

처음에는 «끝에 팔 하나»로 끝냈다. 그러자 사용자가 사진을 보내 왔다.

    사용자: "이러면 상단1개박스에만 들어가니까 이것도 채굴기 벨트들처럼
             쭉 이어서 상자마다 들어갈 수 있도록 배치해"

맞다. 상자 하나를 채우면 팔은 멈추고 뒤엣것은 그대로 밀린다. 상자가 셋인데
받는 곳이 하나면 창고는 삼분의 일만 창고다.

    끝에 문을 내지 말고, 줄을 따라 «집집마다» 문을 낸다.

그래서 이 고리는 상자를 «줄»로 본다. 나란히 선 상자들을 한 무리로 묶고,
그 줄과 나란히 두 칸 떨어진 자리에 벨트를 깔고, 상자마다 팔을 하나씩
세운다. 채굴기 줄에 벨트를 대는 것과 같은 모양이다.

    python scripts/sink.py --who bravo --depot=30,0
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
import shelf                            # noqa: E402
import blocked                          # noqa: E402

BELT = "transport-belt"
ARM = "inserter"
CHEST = "wooden-chest"

# 인서터의 direction 은 «집는 쪽»이다. 놓는 쪽은 그 반대 칸.
COMPASS = {(0, -1): 0, (1, 0): 4, (0, 1): 8, (-1, 0): 12}
STEP = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}

REACH = 6                 # 이만큼 안에 상자가 있으면 «그 상자로 보낸다»
GROUP_GAP = 4             # 이만큼 안에 나란히 서면 «한 줄»이다
SPINE_NEAR = 8            # 벨트 끝이 이만큼 안에 와 있는 줄만 먹인다
SIDE = 2                  # 벨트는 상자 줄에서 두 칸 떨어져 나란히 간다
PER_TRIP = 12
COST = {ARM: {"iron-plate": 3, "copper-plate": 2},
        BELT: {"iron-plate": 2},
        CHEST: {"wood": 2}}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def ends(ai):
    """벨트가 «끝나는» 칸. 앞 칸에 벨트가 없는 벨트다.

    끝이라고 다 고칠 곳은 아니다. 상자에 이미 붙은 끝도 있고, 아직 깔리는
    중이라 잠깐 끝인 곳도 있다. 여기서는 «찾기»만 하고 가르는 것은 뒤에서
    한다 - 「끝이다」와 「막혔다」는 다른 말이다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local belt, out = {}, {}
      local DX = {[0]=0, [4]=1, [8]=0, [12]=-1}
      local DY = {[0]=-1, [4]=0, [8]=1, [12]=0}
      for _, b in pairs(s.find_entities_filtered{
            type = "transport-belt", force = f}) do
        belt[math.floor(b.position.x) .. "," .. math.floor(b.position.y)] = b
      end
      for _, b in pairs(belt) do
        local x, y = math.floor(b.position.x), math.floor(b.position.y)
        local nx, ny = x + DX[b.direction], y + DY[b.direction]
        if not belt[nx .. "," .. ny] then
          out[#out+1] = string.format("%d|%d|%d|%d",
            x, y, b.direction, b.get_item_count())
        end
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        x, y, d, load = (int(v) for v in str(row).split("|"))
        out.append({"x": x, "y": y, "dir": d, "load": load})
    # 많이 실린 끝부터. 그곳이 지금 «막고 있는» 곳이다.
    return sorted(out, key=lambda e: -e["load"])


def sinks(ai):
    """받아 줄 수 있는 것들 - 우리 상자와 화로. 좌표와 이름."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{
            type = {"container", "logistic-container"}, force = f}) do
        out[#out+1] = string.format("%d|%d|%s",
          math.floor(c.position.x), math.floor(c.position.y), c.name)
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        x, y, name = str(row).split("|")
        out.append({"x": int(x), "y": int(y), "name": name})
    return out


def served(ai):
    """이미 «벨트에서 집어 상자에 넣고 있는» 팔들이 집는 칸.

    세운 것을 또 세우려 들면 계획이 매번 가득 차고, 정작 못 선 자리는
    영영 차례가 안 온다. 그래서 「무엇을 집고 있나」를 게임에 묻는다 -
    자리가 아니라 «하는 일»로 센다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, e in pairs(s.find_entities_filtered{type = "inserter", force = f}) do
        local from, to = e.pickup_target, e.drop_target
        if from and to and from.type == "transport-belt"
           and (to.type == "container" or to.type == "logistic-container") then
          out[#out+1] = math.floor(from.position.x) .. "," ..
                        math.floor(from.position.y)
        end
      end
      return out
    end)()""")
    return {str(v) for v in _rows(reply)}


def bridge(end, chest):
    """벨트 끝과 상자 «사이 한 칸». 못 이으면 None.

    팔은 한 칸 건너를 집어 반대쪽 한 칸에 놓는다. 그러니 둘이 같은 줄에
    정확히 두 칸 떨어져 있어야 한 대로 이어진다. 비스듬하면 못 잇는다 -
    그때는 벨트를 늘려 «줄을 맞추는» 것이 먼저다.
    """
    dx, dy = chest["x"] - end["x"], chest["y"] - end["y"]
    if dx == 0 and abs(dy) == 2:
        mid = (end["x"], end["y"] + (1 if dy > 0 else -1))
    elif dy == 0 and abs(dx) == 2:
        mid = (end["x"] + (1 if dx > 0 else -1), end["y"])
    else:
        return None
    look = (end["x"] - mid[0], end["y"] - mid[1])
    return {"x": mid[0], "y": mid[1], "what": ARM, "dir": COMPASS[look],
            "why": f"({end['x']},{end['y']}) 벨트 -> ({chest['x']},{chest['y']}) 상자"}


def toward(end, chest):
    """상자 쪽으로 벨트 한 칸. 줄을 맞추려고 뻗는다.

    먼 축부터 줄인다. 그래야 «같은 줄»에 먼저 들어서고, 들어선 뒤에는
    남은 축이 곧 두 칸이 되어 팔 하나로 닿는다.
    """
    dx, dy = chest["x"] - end["x"], chest["y"] - end["y"]
    if abs(dx) >= abs(dy) and dx != 0:
        step = (1 if dx > 0 else -1, 0)
    elif dy != 0:
        step = (0, 1 if dy > 0 else -1)
    else:
        return None
    return {"x": end["x"] + step[0], "y": end["y"] + step[1], "what": BELT,
            "dir": COMPASS[step], "why": "상자 쪽으로"}


def outlets(ai):
    """채굴기가 «직접 떨구는» 상자들. 이 자리는 남의 것이다.

    밭에도 상자가 줄지어 서 있다. 모양만 보면 창고 줄과 똑같아서, 거기에도
    벨트를 들이대려 들었다 - 그런데 그 상자는 채굴기의 출구고, 밀어내면
    채굴기가 갈 곳을 잃는다. 밭의 길은 모드의 field 흐름이 따로 맡는다.

    생긴 것이 같다고 하는 일이 같은 것은 아니다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{
            type = {"container", "logistic-container"}, force = f}) do
        if s.count_entities_filtered{position = c.position, radius = 2.5,
             type = "mining-drill", force = f} > 0 then
          out[#out+1] = math.floor(c.position.x) .. "," .. math.floor(c.position.y)
        end
      end
      return out
    end)()""")
    return {str(v) for v in _rows(reply)}


def rows_of(chests, gap=GROUP_GAP):
    """나란히 선 상자들을 «한 줄»로 묶는다.

    상자 하나하나를 따로 보면 벨트도 하나하나 따로 뻗는다. 그러면 창고
    앞이 갈래길투성이가 되고, 어느 갈래도 다음 상자까지 안 간다.

    줄로 보면 벨트는 «하나»다. 그 하나가 줄 전체를 지나가고, 문은 상자마다
    하나씩 낸다.
    """
    out = []
    for axis, other in (("x", "y"), ("y", "x")):
        seen = {}
        for chest in chests:
            seen.setdefault(chest[axis], []).append(chest)
        for at, mates in seen.items():
            if len(mates) < 2:
                continue
            mates = sorted(mates, key=lambda c: c[other])
            run = [mates[0]]
            for chest in mates[1:]:
                if chest[other] - run[-1][other] <= gap:
                    run.append(chest)
                else:
                    if len(run) >= 2:
                        out.append({"axis": axis, "at": at, "mates": run})
                    run = [chest]
            if len(run) >= 2:
                out.append({"axis": axis, "at": at, "mates": run})
    # 긴 줄부터. 한 번에 여는 문이 많은 쪽이 남는 장사다.
    return sorted(out, key=lambda g: -len(g["mates"]))


def flank(group, side):
    """줄 옆 «벨트가 갈 자리»와 «팔이 설 자리». side 는 -1 이거나 +1.

    벨트 - 팔 - 상자. 이 셋이 한 줄에 나란해야 팔 하나가 벨트에서 집어
    상자에 넣는다. 그래서 벨트는 상자에서 두 칸이다.
    """
    axis, at = group["axis"], group["at"]
    other = "y" if axis == "x" else "x"
    lo = min(c[other] for c in group["mates"])
    hi = max(c[other] for c in group["mates"])
    lane, arm = at + SIDE * side, at + side
    # 팔의 direction 은 «집는 쪽»이다. 집는 쪽은 벨트고, 벨트는 side 쪽에
    # 있다. 여기서 부호를 뒤집었더니 팔이 상자에서 꺼내 벨트에 얹었다 -
    # 창고를 채우려던 것이 창고를 비우는 기계가 됐다.
    look = (side, 0) if axis == "x" else (0, side)

    belts, arms = [], []
    for n in range(lo, hi + 1):
        spot = (lane, n) if axis == "x" else (n, lane)
        step = (0, 1) if axis == "x" else (1, 0)
        belts.append({"x": spot[0], "y": spot[1], "what": BELT,
                      "dir": COMPASS[step], "why": "상자 줄 급전"})
    for chest in group["mates"]:
        n = chest[other]
        spot = (arm, n) if axis == "x" else (n, arm)
        arms.append({"x": spot[0], "y": spot[1], "what": ARM,
                     "dir": COMPASS[look],
                     "why": f"({chest['x']},{chest['y']}) 상자에 넣는 팔"})
    return belts, arms


def connect(tip, head):
    """본선 끝에서 «기둥 머리»까지 잇는 ㄱ 자 길.

    상자 줄 옆에 기둥을 세워 놓고 거기까지 오는 길을 안 냈다. 기둥은
    다 깔렸는데 아무것도 안 실렸다 - 길을 깐 일과 «그 길을 본선에 붙이는
    일»은 또 다른 일이다.

    먼저 가로로 붙이고 그 다음 세로로 내린다. 두 번 꺾는 것보다 한 번
    꺾는 쪽이 칸도 적고 막힐 자리도 적다.
    """
    out = []
    x, y = tip
    hx, hy = head
    while x != hx:
        step = (1 if hx > x else -1, 0)
        x += step[0]
        out.append({"x": x, "y": y, "what": BELT, "dir": COMPASS[step],
                    "why": "본선에서 기둥으로"})
    while y != hy:
        step = (0, 1 if hy > y else -1)
        y += step[1]
        out.append({"x": x, "y": y, "what": BELT, "dir": COMPASS[step],
                    "why": "본선에서 기둥으로"})
    # 마지막 칸은 기둥 머리 «그 자체»다. 기둥이 이미 맡았으므로 뺀다.
    return [one for one in out if not (one["x"] == hx and one["y"] == hy)]


def head_of(group, belts):
    """기둥이 «시작하는» 칸. 실린 것이 여기로 들어와야 한다."""
    if not belts:
        return None
    axis = group["axis"]
    key = "y" if axis == "x" else "x"
    return min(belts, key=lambda b: b[key])


def clear(ai, tiles):
    """이 칸들이 «비었거나 우리 벨트»인가. 막혔으면 무엇이 막았는지.

    두 쪽 중 어디로 갈지 고르려면 먼저 양쪽을 봐야 한다. 한쪽만 보고
    시작하면 전봇대 한 대에 걸려 줄 전체가 안 선다 - 실제로 창고 양옆이
    둘 다 전봇대였다.
    """
    if not tiles:
        return []
    body = ", ".join("{%d,%d}" % (t["x"], t["y"]) for t in tiles)
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local want = { %s }
      local out = {}
      for i, w in ipairs(want) do
        local who = "-"
        for _, e in pairs(s.find_entities_filtered{
              area = {{w[1] + 0.1, w[2] + 0.1}, {w[1] + 0.9, w[2] + 0.9}}}) do
          local t = e.type
          if t ~= "character" and t ~= "item-entity" and t ~= "transport-belt"
             and t ~= "inserter" then
            who = e.name
            break
          end
        end
        out[i] = who
      end
      return out
    end)()""" % body)
    state = _rows(reply)
    return [str(state[i]) if i < len(state) else "-" for i in range(len(tiles))]


def blockers(ai, tiles):
    return [who for who in clear(ai, tiles) if who != "-"]


def poles_at(ai, tiles):
    """이 칸에 선 «우리» 전봇대와, 그것이 지금 전선으로 닿아 있는 이웃들."""
    if not tiles:
        return []
    body = ", ".join("{%d,%d}" % (t["x"], t["y"]) for t in tiles)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local want = { %s }
      local seen, out = {}, {}
      for _, w in ipairs(want) do
        for _, p in pairs(s.find_entities_filtered{
              area = {{w[1] + 0.1, w[2] + 0.1}, {w[1] + 0.9, w[2] + 0.9}},
              type = "electric-pole", force = f}) do
          if not seen[p.unit_number] then
            seen[p.unit_number] = true
            -- 2.0 에서 전선 API 가 바뀌어 neighbours 가 막혔다. 그런데
            -- 여기서 알고 싶은 것은 «누구와 선이 이어졌나»가 아니라
            -- «비켜서도 닿나»다. 그러면 닿는 거리 안의 전봇대를 전부
            -- 이웃으로 치는 편이 낫다 - 실제 이웃보다 넓게 잡으므로
            -- 틀려도 «더 조심스러운» 쪽으로 틀린다.
            local links = {}
            for _, n in pairs(s.find_entities_filtered{
                  position = p.position, radius = 7.0,
                  type = "electric-pole", force = f}) do
              if n ~= p then
                links[#links+1] = string.format("%%.1f:%%.1f", n.position.x, n.position.y)
              end
            end
            out[#out+1] = string.format("%%d|%%d|%%s|%%s",
              math.floor(p.position.x), math.floor(p.position.y), p.name,
              table.concat(links, ";"))
          end
        end
      end
      return out
    end)()""" % body)
    out = []
    for row in _rows(reply):
        x, y, name, links = str(row).split("|")
        spots = []
        for bit in links.split(";"):
            if ":" in bit:
                a, b = bit.split(":")
                spots.append((float(a), float(b)))
        out.append({"x": int(x), "y": int(y), "name": name, "links": spots})
    return out


# 전봇대의 «자리»는 뜻이 아니다.
#
# 터렛은 자리가 곧 뜻이다 - 한 칸 밀리면 사거리 밖이 생긴다. 인서터도
# 그렇다 - 한 칸 밀리면 엉뚱한 것을 집는다. 그래서 그 둘은 snap 을 뺐다.
#
# 전봇대는 다르다. 전봇대가 하는 일은 «닿는 것»이고, 닿기만 하면 어느
# 칸이든 같은 일을 한다. 그러니 전봇대가 길을 막고 섰을 때 길을 포기할
# 이유가 없다 - 비켜 주면 된다. 단, 비킨 자리에서도 예전 이웃 전부에
# 닿아야 한다. 닿지 않으면 전력망이 둘로 갈라지고, 그것은 길 하나를
# 못 까는 것보다 훨씬 비싸다.
NUDGE = ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1),
         (-2, 0), (2, 0), (0, -2), (0, 2))
WIRE = 6.5                # 닿는 거리는 7.5. 반 칸 밀려도 닿도록 낮춰 잡는다


def aside(ai, pole, taken):
    """전선이 그대로 닿는 옆칸. 없으면 None - 그러면 그 줄은 포기한다."""
    for dx, dy in NUDGE:
        spot = (pole["x"] + dx, pole["y"] + dy)
        if spot in taken:
            continue
        cx, cy = spot[0] + 0.5, spot[1] + 0.5
        if any((cx - lx) ** 2 + (cy - ly) ** 2 > WIRE * WIRE
               for lx, ly in pole["links"]):
            continue
        if blockers(ai, [{"x": spot[0], "y": spot[1]}]):
            continue
        return spot
    return None


def spine(ai, group):
    """이 상자 줄을 먹일 벨트와 팔. 막힌 쪽은 «무엇이 막았나»를 보고 정한다.

        사용자: "배치해야하는데 다른건물이 막고있다면 해당 건물이 무엇인지
                 왜거기설치되어있는지 체크해서 해당건물을 재설치할것인지,
                 배치를 새롭게 다시 구성할것인지 시도해"

    그래서 한쪽이 막히면 바로 포기하지 않는다. 막은 것을 blocked 에 물어
    결론을 받고, 비켜 세울 수 있는 것이면 비켜 세우고, 걷어도 되는 것이면
    걷고, 제 일을 하는 건물이면 «반대쪽»을 본다.

    돌려주는 것: (벨트, 팔, 못 푼 것들, 치울 것들)
    """
    trouble = []
    for side in (-1, 1):
        belts, arms = flank(group, side)
        call, found = blocked.verdict(ai, belts + arms)

        if call == blocked.FREE:
            return belts, arms, [], []

        if call == blocked.SHOVE:
            taken = {(t["x"], t["y"]) for t in belts + arms}
            taken |= {(c["x"], c["y"]) for c in group["mates"]}
            moves, ok = [], True
            for pole in poles_at(ai, belts + arms):
                spot = aside(ai, pole, taken)
                if not spot:
                    ok = False
                    break
                taken.add(spot)
                moves.append({"kind": "move", "from": (pole["x"], pole["y"]),
                              "to": spot, "what": pole["name"]})
            if ok:
                return belts, arms, [], moves

        elif call == blocked.LIFT:
            # 우리가 임시로 둔 상자다. 비우고 걷으면 그 자리는 길 것이다.
            # 다만 채굴기가 아직 그 상자를 보고 있으면 걷는 순간 갈 곳을
            # 잃는다 - 「출구」라고 적힌 것은 건드리지 않는다.
            lifts = [{"kind": "lift", "from": (one["x"], one["y"]),
                      "what": one["name"]}
                     for one in found
                     if one["verdict"] == blocked.LIFT and "출구" not in one["role"]]
            if len(lifts) == len([o for o in found
                                  if o["verdict"] != blocked.FREE]):
                return belts, arms, [], lifts

        trouble.append((side, call, found))

    # 양쪽 다 못 풀었다. «왜»를 남긴다 - 다음에 사람이 볼 것이고,
    # 「막혔다」 한 마디로는 아무것도 못 고친다.
    why = [f"{'왼' if side < 0 else '오른'}쪽 {call}: {blocked.tell(found)}"
           for side, call, found in trouble]
    return [], [], why, []


def plan(ai, keep_loaded=1):
    """세울 것 전부.

    1. 상자가 «줄»로 서 있으면 줄 옆에 벨트를 깔고 상자마다 팔을 낸다
    2. 그러고도 남는 벨트 끝은 가까운 상자에 팔 하나로 잇는다
    3. 줄이 안 맞는 끝은 벨트를 한 칸 늘려 줄을 맞춘다
    """
    done = served(ai)
    pots = sinks(ai)
    if not pots:
        return [], [], [], []
    seats, stretch, stuck, shoves = [], [], [], []

    # 창고처럼 «줄로 선» 상자는 줄째로 먹인다.
    #
    # 다만 «모든» 상자 줄이 대상은 아니다. 밭의 채굴기 출구 상자도 나란히
    # 서 있지만 그쪽은 채굴기가 직접 떨구는 자리고, 거기에 벨트를 들이대면
    # 채굴기를 밀어내야 한다. 이 고리가 맡을 곳은 «벨트가 이미 와 있는»
    # 줄이다 - 온 길을 끝까지 쓰는 일이지, 없는 길을 내는 일이 아니다.
    tips = ends(ai)
    theirs = outlets(ai)
    fed = set()
    for group in rows_of(pots):
        if any(f"{c['x']},{c['y']}" in theirs for c in group["mates"]):
            continue
        if not any(abs(t["x"] - c["x"]) + abs(t["y"] - c["y"]) <= SPINE_NEAR
                   for t in tips for c in group["mates"]):
            continue
        if any(f"{c['x']},{c['y']}" in fed for c in group["mates"]):
            continue
        belts, arms, bad, moves = spine(ai, group)
        if moves:
            shoves.extend(moves)
        if bad:
            stuck.append({"at": (group["axis"], group["at"]), "why": bad})
            continue
        if not arms:
            continue
        for chest in group["mates"]:
            fed.add(f"{chest['x']},{chest['y']}")
        seats += belts + arms
        # 기둥을 세웠으면 «본선에 붙인다». 안 붙이면 빈 기둥이다.
        head = head_of(group, belts)
        near = [t for t in tips
                if abs(t["x"] - head["x"]) + abs(t["y"] - head["y"]) <= SPINE_NEAR]
        if head and near:
            tip = min(near, key=lambda t: abs(t["x"] - head["x"])
                      + abs(t["y"] - head["y"]))
            link = connect((tip["x"], tip["y"]), (head["x"], head["y"]))
            if link and not blockers(ai, link):
                seats += link

    for end in ends(ai):
        if f"{end['x']},{end['y']}" in done:
            continue
        if end["load"] < keep_loaded:
            # 아무것도 안 실린 끝은 아직 «깔리는 중»일 수 있다. 실린 것이
            # 있는 끝이 진짜로 막고 있는 곳이다.
            continue
        near = min(pots, key=lambda c: (c["x"] - end["x"]) ** 2
                   + (c["y"] - end["y"]) ** 2)
        gap = abs(near["x"] - end["x"]) + abs(near["y"] - end["y"])
        if gap > REACH:
            continue
        seat = bridge(end, near)
        if seat:
            seats.append(seat)
        else:
            step = toward(end, near)
            if step:
                stretch.append(step)
    return seats, stretch, stuck, shoves


def standing(ai, seats):
    """빈 칸만 돌려준다. 막힌 칸은 무엇이 막았는지 함께."""
    if not seats:
        return [], []
    body = ", ".join('{%d,%d,"%s"}' % (s["x"], s["y"], s["what"]) for s in seats)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local want = { %s }
      local out = {}
      for i, w in ipairs(want) do
        local mine, other = nil, nil
        for _, e in pairs(s.find_entities_filtered{
              area = {{w[1], w[2]}, {w[1] + 1, w[2] + 1}}, force = f}) do
          if e.name == w[3] then mine = e
          elseif e.type ~= "item-entity" and e.type ~= "character" then
            other = e.name
          end
        end
        out[i] = mine and "ok" or (other and ("x" .. other) or "-")
      end
      return out
    end)()""" % body)
    state = _rows(reply)
    todo, blocked = [], []
    for i, seat in enumerate(seats):
        cell = str(state[i]) if i < len(state) else "-"
        if cell == "-":
            todo.append(seat)
        elif cell.startswith("x"):
            blocked.append((seat, cell[1:]))
    return todo, blocked


def build(ai, who, todo, depot):
    """재료를 «있는 상자에서» 집어 와 세운다.

    선반 자리를 계산으로 박아 두었다가 없는 상자를 가리킨 적이 있다.
    그때 전기 인서터는 한 대도 안 섰고 로그만 네 번 찍혔다. 그래서
    여기서는 shelf 에 «어디 있나»를 묻는다.
    """
    want: dict = {}
    for one in todo:
        want[one["what"]] = want.get(one["what"], 0) + 1
    need: dict = {}
    for part, count in want.items():
        for item, each in COST.get(part, {}).items():
            need[item] = need.get(item, 0) + each * count

    at = shelf.where(ai, depot, list(need))
    missing = [item for item in need if item not in at]
    if missing:
        print(f"  창고에 {missing} 이 없다 - 그것 없이 되는 만큼만 한다")
        for item in missing:
            need.pop(item, None)

    first = sorted(at.values())[0] if at else (depot[0] + 0.5, depot[1] + 0.5)
    steps = [("walk_to", {"x": first[0] - 2, "y": first[1] + 1})]
    for item, count in need.items():
        steps.append(("take", {"name": item, "x": at[item][0],
                               "y": at[item][1], "count": count}))
    for part, count in want.items():
        steps.append(("craft", {"recipe": part, "count": count, "wait": False}))
    steps.append(("walk_to", {"x": todo[0]["x"] + 2, "y": todo[0]["y"] + 2}))
    for one in todo:
        steps.append(("build", {"name": one["what"], "x": one["x"],
                                "y": one["y"], "direction": one["dir"]}))
    submit(ai, who, steps, strict=False)
    print(f"{who}: {dict(want)} - {todo[0]['why']}")


def move(ai, who, shoves):
    """길을 막은 전봇대를 옆으로 옮긴다. 걷고 «바로» 다시 세운다.

    걷은 채로 두면 그 사이에 전력망이 갈라지고, 갈라진 동안 인서터가
    멈춘다. 그래서 한 사람의 «한 계획 안에서» 걷고 세운다 - 둘을 다른
    걸음으로 나누면 그 틈이 곧 정전이다.
    """
    plan = [("walk_to", {"x": shoves[0]["from"][0] + 2,
                         "y": shoves[0]["from"][1] + 2})]
    for one in shoves:
        if one["kind"] == "lift":
            # 안엣것을 먼저 꺼내지 않으면 같이 사라진다.
            for item in ("iron-plate", "copper-plate", "iron-ore",
                         "copper-ore", "coal", "stone"):
                plan.append(("take", {"name": item, "x": one["from"][0],
                                      "y": one["from"][1], "count": 400}))
        plan.append(("demolish", {"x": one["from"][0], "y": one["from"][1],
                                  "name": one["what"]}))
        if one["kind"] == "move":
            plan.append(("build", {"name": one["what"],
                                   "x": one["to"][0], "y": one["to"][1]}))
    submit(ai, who, plan, strict=False)
    for one in shoves:
        if one["kind"] == "move":
            print(f"{who}: {one['what']} {one['from']} -> {one['to']} (길을 비킨다)")
        else:
            print(f"{who}: {one['what']} {one['from']} 걷는다 (벨트가 왔다)")


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--depot", required=True, help="음수는 --depot=-5,-90")
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    crew = args.who or ["bravo"]
    depot = tuple(int(v) for v in args.depot.split(","))
    ai = AIBridge()
    quiet = 0

    for _ in range(args.rounds):
        try:
            seats, stretch, stuck, shoves = plan(ai)
            for one in stuck[:3]:
                print(f"  상자 줄 {one['at']} 양옆이 막혔다")
                for line in one["why"]:
                    print(f"      {line}")
            if len(stuck) > 3:
                print(f"  (그 밖에 막힌 줄 {len(stuck) - 3})")
            if shoves:
                free = idle(ai, crew)
                if free:
                    move(ai, free[0], shoves)
                    time.sleep(args.every)
                    continue
            todo, blocked = standing(ai, seats + stretch)
            if not todo:
                quiet += 1
                if quiet % 10 == 1:
                    print(f"  받아 줄 팔이 다 섰다 "
                          f"(막힌 칸 {len(blocked)})")
                time.sleep(args.every)
                continue
            quiet = 0
            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue
            build(ai, free[0], todo[:PER_TRIP], depot)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Who is starved, where the coal is, and who walks which round.

Kept apart from the script that runs the loop so the decisions can be
tested without a server. Nothing here talks to the game twice for the same
fact -- one question, one answer, then plain arithmetic.
"""
from __future__ import annotations

import math

from settings import RIG_COAL

# 한 사람이 한 바퀴에 맡는 기계 수. 가방은 스택으로 차므로 석탄
# RIG_COAL x 이 수만큼을 한 번에 싣고 간다.
PER_ROUND = 10

# 한 대에 이만큼도 못 부을 거면 걸어갈 값어치가 없다.
MIN_POUR = 10

# 줄 끝의 «팔»이 굶으면 그 뒤의 채굴기가 전부 선다. 팔 하나가 채굴기
# 열넷보다 급하다. 순서를 정하는 것은 이 표 하나다.
URGENCY = {"inserter": 0, "boiler": 1, "furnace": 2, "mining-drill": 3}

_STARVED = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, e in pairs(s.find_entities_filtered {
    type = { "inserter", "mining-drill", "furnace", "boiler" },
    force = game.forces.player,
  }) do
    local tank = e.get_fuel_inventory()
    if tank and e.status == defines.entity_status.no_fuel then
      out[#out + 1] = string.format("%s|%s|%.1f|%.1f|%d",
        e.type, e.name, e.position.x, e.position.y,
        tank.get_item_count("coal"))
    end
  end
  return out
end)()"""

_COAL = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, c in pairs(s.find_entities_filtered {
    type = "container", force = game.forces.player,
  }) do
    local held = c.get_inventory(defines.inventory.chest).get_item_count("coal")
    if held > 0 then
      out[#out + 1] = string.format("%.1f|%.1f|%d", c.position.x, c.position.y, held)
    end
  end
  return out
end)()"""


def _rows(reply) -> list[str]:
    if isinstance(reply, dict):
        return list(reply.values())
    return list(reply or [])


def starved(ai) -> list[dict]:
    """버너인데 연료가 없어 선 기계들. 급한 것부터."""
    out = []
    for row in _rows(ai.lua(_STARVED)):
        kind, name, x, y, coal = row.split("|")
        out.append({"type": kind, "name": name,
                    "x": float(x), "y": float(y), "coal": int(coal)})
    out.sort(key=lambda e: URGENCY.get(e["type"], 9))
    return out


def coal_sources(ai) -> list[dict]:
    """석탄이 든 우리 상자들."""
    out = []
    for row in _rows(ai.lua(_COAL)):
        x, y, held = row.split("|")
        out.append({"x": float(x), "y": float(y), "count": int(held)})
    return out


def best_source(sources: list[dict], spot: dict, wanted: int) -> dict | None:
    """퍼올 상자. 달라는 만큼 든 것 중 가장 가까운 것을 먼저 본다.

    「가지고 있는가」로 고르면 한 개 든 상자까지 뽑힌다 - 걸어간 보람이
    없어진다. 그렇다고 넉넉한 상자가 없다고 «아무 데도 안 가면», 조금씩
    있는 석탄으로 급한 팔 하나를 살릴 기회까지 버린다.

    그래서 두 단계다. 넉넉한 것이 있으면 가까운 것, 없으면 가장 많은 것.
    """
    fit = [c for c in sources if c["count"] >= wanted]
    if fit:
        return min(fit, key=lambda c: math.hypot(c["x"] - spot["x"],
                                                 c["y"] - spot["y"]))
    fit = [c for c in sources if c["count"] > 0]
    if not fit:
        return None
    return max(fit, key=lambda c: c["count"])


def plan_round(names: list[str], hungry: list[dict], sources: list[dict],
               carrying: dict[str, int] | None = None
               ) -> tuple[list[tuple[str, list]], list[str]]:
    """급한 것부터 사람 수만큼 나눠 «걸어갈 차례»로 묶는다.

    한 사람이 한 덩어리를 맡는다. 두 사람이 같은 기계를 먹이면 둘째가
    「넣었는데 0개」로 실패하므로, 나누는 것이 곧 겹치지 않게 하는 것이다.

    돌려주는 둘째 값은 «못 한 이유»다. 아무 일도 못 하고 조용히 끝나면
    그 침묵이 「이상 없음」으로 읽힌다 - 실제로 한 번 그랬다.
    """
    rounds: list[tuple[str, list]] = []
    excuses: list[str] = []
    # 급한 순서는 여기서도 한 번 세운다. 부르는 쪽이 이미 세워 주지만,
    # 「앞사람이 해 줬겠지」로 두면 그 앞사람이 바뀌는 날 조용히 틀린다.
    hungry = sorted(hungry, key=lambda e: URGENCY.get(e["type"], 9))
    share = [hungry[i::len(names)] for i in range(len(names))]
    for who, mine in zip(names, share):
        mine = mine[:PER_ROUND]
        if not mine:
            continue
        want = RIG_COAL * len(mine)

        # 손에 있는 것부터 쓴다. 상자를 보러 가는 것은 손이 빌 때의 일이다.
        # 실측: 둘이 천 개를 들고 서서, 석탄 26개짜리 상자를 보고 「퍼올
        # 것이 없다」고 했다.
        held = int((carrying or {}).get(who, 0))
        if held >= MIN_POUR:
            source = {"x": mine[0]["x"], "y": mine[0]["y"], "count": held}
            fetch = []
        else:
            source = best_source(sources, mine[0], want)
            if not source:
                excuses.append(f"{who}: 손에도 상자에도 석탄이 없다")
                continue
            fetch = [("take", {"name": "coal",
                               "count": min(int(source["count"]), want),
                               "x": source["x"], "y": source["y"]})]

        # 있는 만큼만 나선다. 여섯 대를 먹이겠다고 나서놓고 첫 대에서
        # 다 쓰면 나머지 다섯 번이 「no coal to insert」로 끝난다.
        load = min(int(source["count"]), want)
        each = max(MIN_POUR, load // len(mine))
        mine = mine[:max(1, load // each)]
        plan: list = list(fetch)
        if fetch:
            plan[0][1]["count"] = each * len(mine)
        # 가까운 것부터 들르면 한 바퀴가 짧아진다. 급한 종류는 이미
        # 앞쪽에 와 있으므로, 여기서는 걸어가는 순서만 본다.
        here = source
        left = list(mine)
        while left:
            nxt = min(left, key=lambda e: math.hypot(e["x"] - here["x"],
                                                     e["y"] - here["y"]))
            left.remove(nxt)
            plan.append(("insert", {"name": "coal", "count": each,
                                    "x": nxt["x"], "y": nxt["y"]}))
            here = nxt
        rounds.append((who, plan))
    return rounds, excuses

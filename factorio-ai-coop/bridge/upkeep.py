"""Consumables: who is running low, where the supply is, who walks which round.

Fuel and ammunition are the two things that run out while nothing reports a
failure. A burner that stops just stands there; a turret with an empty slot
is a decoration. One starved arm at the end of a lane stalls every drill
behind it, so a whole field goes quiet without a single error line.

    사용자: "항상 연료랑 탄약같이 소비성재료들은 넉넉하게 넣어둘 것."

So the rule here is «top up before it runs out, and top up generously».
Two thresholds, never one: LOW decides when to walk, FULL decides how much
to pour. With a single number you either refill the moment you leave, or
only after everything has already stopped.

Kept apart from the loop that runs it (scripts/upkeep_patrol.py) so the
decisions can be tested without a server.
"""
from __future__ import annotations

import math

from settings import AMMO_FULL, AMMO_LOW, COAL_FULL, COAL_LOW

AMMO = "firearm-magazine"
COAL = "coal"

# 한 사람이 한 바퀴에 맡는 기계 수. 더 늘리면 가방이 먼저 찬다.
PER_ROUND = 10

# 한 대에 이만큼도 못 부을 거면 걸어갈 값어치가 없다.
MIN_POUR = 10

# 줄 끝의 «팔»이 굶으면 그 뒤의 채굴기가 전부 선다. 포탑은 비어 있으면
# 장식이고, 장식인 것을 모르고 지나가면 그날 전멸한다. 순서를 정하는 것은
# 이 표 하나다.
URGENCY = {"ammo-turret": 0, "inserter": 1, "boiler": 2,
           "furnace": 3, "mining-drill": 4}

_LOW = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, e in pairs(s.find_entities_filtered {
    type = { "inserter", "mining-drill", "furnace", "boiler" },
    force = game.forces.player,
  }) do
    local tank = e.get_fuel_inventory()
    if tank then
      local held = tank.get_item_count("%s")
      if held < %d then
        out[#out + 1] = string.format("%%s|%%s|%%.1f|%%.1f|%%d|%%d",
          e.type, e.name, e.position.x, e.position.y, held, %d - held)
      end
    end
  end
  for _, t in pairs(s.find_entities_filtered {
    type = "ammo-turret", force = game.forces.player,
  }) do
    local box = t.get_inventory(defines.inventory.turret_ammo)
    local held = box and box.get_item_count("%s") or 0
    if held < %d then
      out[#out + 1] = string.format("%%s|%%s|%%.1f|%%.1f|%%d|%%d",
        t.type, t.name, t.position.x, t.position.y, held, %d - held)
    end
  end
  return out
end)()""" % (COAL, COAL_LOW, COAL_FULL, AMMO, AMMO_LOW, AMMO_FULL)

_STOCK = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, c in pairs(s.find_entities_filtered {
    type = "container", force = game.forces.player,
  }) do
    local inv = c.get_inventory(defines.inventory.chest)
    for _, what in ipairs({ "%s", "%s" }) do
      local held = inv.get_item_count(what)
      if held > 0 then
        out[#out + 1] = string.format("%%s|%%.1f|%%.1f|%%d",
          what, c.position.x, c.position.y, held)
      end
    end
  end
  return out
end)()""" % (COAL, AMMO)


def _rows(reply) -> list[str]:
    if isinstance(reply, dict):
        return list(reply.values())
    return list(reply or [])


def wants(kind: str) -> str:
    """이 기계가 먹는 것. 포탑은 탄약, 나머지는 석탄."""
    return AMMO if kind == "ammo-turret" else COAL


def running_low(ai) -> list[dict]:
    """떨어졌거나 «떨어져 가는» 것들. 급한 것부터, 같으면 빈 것부터."""
    out = []
    for row in _rows(ai.lua(_LOW)):
        kind, name, x, y, held, room = row.split("|")
        out.append({"type": kind, "name": name, "x": float(x), "y": float(y),
                    "held": int(held), "room": int(room), "item": wants(kind)})
    out.sort(key=lambda e: (URGENCY.get(e["type"], 9), e["held"]))
    return out


def stock(ai) -> dict[str, list[dict]]:
    """품목별로, 그것이 든 우리 상자들."""
    out: dict[str, list[dict]] = {}
    for row in _rows(ai.lua(_STOCK)):
        item, x, y, held = row.split("|")
        out.setdefault(item, []).append(
            {"x": float(x), "y": float(y), "count": int(held)})
    return out


def best_source(shelves: list[dict], spot: dict, wanted: int) -> dict | None:
    """퍼올 상자. 달라는 만큼 든 것 중 가장 가까운 것을 먼저 본다.

    「가지고 있는가」로 고르면 한 개 든 상자까지 뽑힌다 - 걸어간 보람이
    없어진다. 그렇다고 넉넉한 상자가 없다고 «아무 데도 안 가면», 조금씩
    있는 것으로 급한 팔 하나를 살릴 기회까지 버린다.

    그래서 두 단계다. 넉넉한 것이 있으면 가까운 것, 없으면 가장 많은 것.
    """
    fit = [c for c in shelves if c["count"] >= wanted]
    if fit:
        return min(fit, key=lambda c: math.hypot(c["x"] - spot["x"],
                                                 c["y"] - spot["y"]))
    fit = [c for c in shelves if c["count"] > 0]
    if not fit:
        return None
    return max(fit, key=lambda c: c["count"])


def _leg(who: str, mine: list[dict], shelves: list[dict],
         held_in_bag: int) -> tuple[list, str, list]:
    """한 품목짜리 한 바퀴. 계획과, 못 했으면 그 이유와, 실제로 맡은 것들."""
    item = mine[0]["item"]
    want = sum(e["room"] for e in mine)

    # 손에 있는 것부터 쓴다. 상자를 보러 가는 것은 손이 빌 때의 일이다.
    # 실측: 둘이 석탄 천 개를 들고 서서, 26개짜리 상자를 보고 「퍼올 것이
    # 없다」고 했다.
    if held_in_bag >= MIN_POUR:
        source = {"x": mine[0]["x"], "y": mine[0]["y"], "count": held_in_bag}
        fetch: list = []
    else:
        source = best_source(shelves, mine[0], want)
        if not source:
            return [], f"{who}: 손에도 상자에도 {item} 이 없다", []
        fetch = [("take", {"name": item, "count": min(int(source["count"]), want),
                           "x": source["x"], "y": source["y"]})]

    # 있는 만큼만 나선다. 여섯 대를 채우겠다고 나서놓고 첫 대에서 다 쓰면
    # 나머지 다섯 번이 「no coal to insert」로 끝난다.
    #
    # 그리고 «누구에게 얼마나»와 «어느 순서로 걷나»는 다른 결정이다. 둘을
    # 한 고리에서 정했더니, 물자가 모자란 날 가까운 채굴기가 스무 개를 다
    # 먹고 급한 팔이 빈손으로 남았다. 나눌 때는 급한 순서, 걸을 때는 가까운
    # 순서다.
    load = min(int(source["count"]), want)
    chosen, spent = [], 0
    for e in mine:                       # 이미 급한 순서로 와 있다
        pour = min(e["room"], load - spent)
        if pour < MIN_POUR:
            continue
        spent += pour
        chosen.append((e, pour))
        if spent >= load:
            break
    if not chosen:
        return [], f"{who}: {item} 이 한 대 채울 만큼도 안 된다", []

    plan: list = list(fetch)
    if fetch:
        plan[0][1]["count"] = spent
    here, left = source, list(chosen)
    while left:
        nxt = min(left, key=lambda c: math.hypot(c[0]["x"] - here["x"],
                                                 c[0]["y"] - here["y"]))
        left.remove(nxt)
        plan.append(("insert", {"name": item, "count": nxt[1],
                                "x": nxt[0]["x"], "y": nxt[0]["y"]}))
        here = nxt[0]
    return plan, "", [e for e, _p in chosen]


def plan_round(names: list[str], low: list[dict],
               shelves: dict[str, list[dict]],
               carrying: dict[str, dict[str, int]] | None = None
               ) -> tuple[list[tuple[str, list]], list[str]]:
    """급한 것부터 «아직 아무도 안 맡은 것»을 한 사람씩 집어 간다.

    예전에는 목록을 번갈아 쪼갰다(low[i::n]). 그러면 «가장 급한 한 대»가
    누구에게 가는지가 목록 길이에 달린다. 실측: 포탑 아홉 대가 앞을
    채우는 바람에, 석탄밭 자기 인서터(연료 1개, 이것이 굶으면 온 맵의
    석탄이 끊긴다)가 열 번째로 밀려 아무도 안 맡았다.

    한 바퀴에 한 품목만 든다. 석탄과 탄창을 같이 실으면 가방이 두 배로
    필요하고 어느 쪽도 넉넉히 못 싣는다. 그 품목이 없으면 «다음» 품목으로
    넘어간다 - 못 하는 일 하나가 할 수 있는 일 전부를 막으면 안 된다.

    돌려주는 둘째 값은 «못 한 이유»다. 아무 일도 못 하고 조용히 끝나면
    그 침묵이 「이상 없음」으로 읽힌다 - 실제로 한 번 그랬다.
    """
    rounds: list[tuple[str, list]] = []
    excuses: list[str] = []
    if not names:
        return rounds, ["보급 담당이 한 명도 없다"]

    left = sorted(low, key=lambda e: (URGENCY.get(e["type"], 9), e["held"]))
    for who in names:
        if not left:
            break
        # 아직 남은 것 중 가장 급한 것의 품목부터 시도한다.
        order: list[str] = []
        for e in left:
            if e["item"] not in order:
                order.append(e["item"])
        tried: list[str] = []
        for item in order:
            group = [e for e in left if e["item"] == item][:PER_ROUND]
            bag = int((carrying or {}).get(who, {}).get(item, 0))
            plan, why, took = _leg(who, group, shelves.get(item, []), bag)
            if plan:
                rounds.append((who, plan))
                left = [e for e in left if e not in took]
                break
            tried.append(why)
        else:
            excuses.extend(w for w in tried if w)
    return rounds, excuses

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

from settings import (AMMO_FULL, AMMO_LOW, COAL_FULL, COAL_LOW,
                      ORE_FULL, ORE_LOW)

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
           "furnace": 3, "mining-drill": 4, "furnace-ore": 5}

_LOW = """(function()
  local s = game.surfaces[1]
  local out = {}
  -- 팔이 넣어 주는 기계는 사람이 안 채운다.
  --
  --   사용자: "석탄이랑 자원들 전부 자동화됬으니까 직접 채우러가는 로직은
  --            에이전트에서 비활성화 시켜두면 되겠다. 이건 직접 비활성화가
  --            아니라 해당 조건이 충족되는(자원 투입 자동화) 경우에만"
  --
  -- «자동화됐다»의 잣대는 기계 하나하나다: 그 기계 안으로 떨구는 팔이 있으면
  -- 그 기계는 벨트 몫이고, 없으면 여전히 사람 몫이다. 화로 줄의 원료 팔은
  -- 광석과 석탄을 같은 벨트에서 집으므로 팔 하나가 둘 다 자동이다.
  local function fed(e)
    local bb = e.bounding_box
    for _, i in pairs(s.find_entities_filtered {
      type = "inserter", force = e.force, position = e.position, radius = 3,
    }) do
      local d = i.drop_position
      if d.x >= bb.left_top.x and d.x <= bb.right_bottom.x
         and d.y >= bb.left_top.y and d.y <= bb.right_bottom.y then
        return true
      end
    end
    return false
  end
  for _, e in pairs(s.find_entities_filtered {
    type = { "inserter", "mining-drill", "furnace", "boiler" },
    force = game.forces.player,
  }) do
    if fed(e) then goto continue end
    local tank = e.get_fuel_inventory()
    if tank then
      local held = tank.get_item_count("%s")
      if held < %d then
        out[#out + 1] = string.format("%%s|%%s|%%.1f|%%.1f|%%d|%%d|%%s",
          e.type, e.name, e.position.x, e.position.y, held, %d - held, "%s")
      end
    end
    -- 그리고 화로는 «원료»도 떨어진다. 연료만 보면 불은 붙어 있는데
    -- 아무것도 안 구워지는 화로가 줄줄이 선다.
    --
    -- 사용자: "연료 / 재료 / 탄약 등등은 주기적으로 채우도록"
    if e.type == "furnace" then
      local src = e.get_inventory(defines.inventory.furnace_source)
      local has = src and src.get_item_count() or 0
      if has < %d then
        -- 무엇을 굽던 화로인가. 물어볼 수 있으면 짐작하지 않는다.
        local want = nil
        local ok, prev = pcall(function() return e.previous_recipe end)
        if ok and prev and prev.name then
          local recipe = prev.name.name or prev.name
          local proto = prototypes.recipe[recipe]
          if proto and proto.ingredients and proto.ingredients[1] then
            want = proto.ingredients[1].name
          end
        end
        out[#out + 1] = string.format("%%s|%%s|%%.1f|%%.1f|%%d|%%d|%%s",
          "furnace-ore", e.name, e.position.x, e.position.y, has, %d - has,
          want or "")
      end
    end
    ::continue::
  end
  for _, t in pairs(s.find_entities_filtered {
    type = "ammo-turret", force = game.forces.player,
  }) do
    local box = t.get_inventory(defines.inventory.turret_ammo)
    local held = box and box.get_item_count("%s") or 0
    if held < %d then
      out[#out + 1] = string.format("%%s|%%s|%%.1f|%%.1f|%%d|%%d|%%s",
        t.type, t.name, t.position.x, t.position.y, held, %d - held, "%s")
    end
  end
  return out
end)()""" % (COAL, COAL_LOW, COAL_FULL, COAL, ORE_LOW, ORE_FULL,
             AMMO, AMMO_LOW, AMMO_FULL, AMMO)

_STOCK = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, c in pairs(s.find_entities_filtered {
    type = "container", force = game.forces.player,
  }) do
    local inv = c.get_inventory(defines.inventory.chest)
    for _, it in pairs(inv.get_contents()) do
      out[#out + 1] = string.format("%s|%.1f|%.1f|%d",
        it.name, c.position.x, c.position.y, it.count)
    end
  end
  return out
end)()"""


def _rows(reply) -> list[str]:
    if isinstance(reply, dict):
        return list(reply.values())
    return list(reply or [])


# 화로에 넣을 것이 뭔지 못 알아냈을 때의 차례. 앞엣것부터 창고에 있는
# 것을 쓴다.
#
# **돌은 여기 없다.** 돌은 철의 «대체재»가 아니라 다른 일이다 - 넣는
# 순간 그 화로는 벽돌을 굽기 시작하고, 그동안 철은 한 장도 안 나온다.
#
# 실측(19회차 26분): 창고에 철광석이 없고 돌 150이 있었다. 순찰이 그
# 돌을 화로 «일곱 대 전부»에 나눠 넣었고, 창고 철판은 0이 되었으며,
# 채굴기도 탄약도 발전 사슬도 거기서 같이 멈췄다. 그 사이 밭 상자에는
# 철광석 395가 쌓여 있었다 - 없어서가 아니라 «안 옮겨서» 없었던 것이다.
#
# 없으면 넣지 않는다. 빈 화로는 잘못 채운 화로보다 낫다.
ORES = ("iron-ore", "copper-ore")


def wants(kind: str) -> str:
    """이 기계가 먹는 것. 포탑은 탄약, 화로의 원료칸은 광석, 나머지는 석탄."""
    if kind == "ammo-turret":
        return AMMO
    if kind == "furnace-ore":
        return ORES[0]
    return COAL


def running_low(ai) -> list[dict]:
    """떨어졌거나 «떨어져 가는» 것들. 급한 것부터, 같으면 빈 것부터."""
    out = []
    for row in _rows(ai.lua(_LOW)):
        kind, name, x, y, held, room, item = row.split("|")
        out.append({"type": kind, "name": name, "x": float(x), "y": float(y),
                    "held": int(held), "room": int(room),
                    "item": item or wants(kind)})
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

    # 화로가 무엇을 굽던 놈인지 못 알아냈으면, 창고에 «있는» 광석으로
    # 바꿔 준다. 없는 것을 달라고 하면 그 화로는 영영 빈 채로 남는다.
    #
    # 다만 바꾸는 범위는 «금속 광석끼리»다(ORES). 돌을 넣는 것은 채우는
    # 것이 아니라 그 화로의 일을 바꾸는 것이다.
    skipped = 0
    for e in list(low):
        if e["type"] == "furnace-ore" and not shelves.get(e["item"]):
            swap = next((o for o in ORES if shelves.get(o)), None)
            if swap:
                e["item"] = swap
            else:
                # 넣을 금속 광석이 없다. 조용히 넘기면 「이상 없음」으로
                # 읽히므로, 한 줄로 말하고 뺀다.
                low.remove(e)
                skipped += 1
    if skipped:
        excuses.append(f"화로 {skipped}대가 굶는다 - 창고에 금속 광석이 없다")

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

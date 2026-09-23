"""Give every character a gun, ammo and armour - and put them in the right slots.

    사용자: "직접 무기랑 공격수단을 동원해서 기지를 파괴할 계획도 세워줘."

지금까지 사람은 비무장이었다. 총이 있어도 «스스로» 쏘지 않는다(플레이어가
없는 캐릭터는 shooting_state 를 아무도 안 준다) - 그것은 모드의 attack 태스크와
반사(reflex.lua)가 준다. 여기서는 장비만 갖춘다:

    기관단총 (톱니 10 · 구리 5 · 철 10)  +  관통탄 AMMO 발  +  중갑옷 (구리 100 · 강철 50)

만드는 것은 사람이 하고(craft), 가방에서 총·탄·갑옷 칸으로 옮기는 것만 Lua 다 -
플레이어가 드래그하는 그 동작이다.

    python scripts/arm.py                    # 누가 무장했나
    python scripts/arm.py --who charlie,hotel,golf
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
import shelf as shelf_mod                # noqa: E402
import creep                             # noqa: E402  (stock_at)

DEPOT = (-55, 10)
GUN, AMMO_ITEM, ARMOR = "submachine-gun", "piercing-rounds-magazine", "heavy-armor"
AMMO = 100


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


# storage 는 /silent-command 에서 안 보인다. 사람은 이름이 아니라 «자리»로 찾는다:
# status 가 주는 x,y 에서 반지름 1.5 안의 캐릭터.
BODY = """local function body(x, y)
        return game.surfaces[1].find_entities_filtered{type = "character", force = game.forces.player,
                 position = {x, y}, radius = 1.5}[1]
      end"""


def crew_xy(ai) -> dict:
    return {w["name"]: (float(w["x"]), float(w["y"])) for w in ai.list()
            if w.get("alive") and w.get("x") is not None}


def kit(ai) -> dict:
    """{이름: (총, 탄 수, 갑옷)} 실제 슬롯 기준."""
    xy = crew_xy(ai)
    packed = ";".join(f"{n},{x},{y}" for n, (x, y) in xy.items())
    reply = ai.lua("""(function()
      %s
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local name, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local b = body(tonumber(x), tonumber(y))
        if b then
          local g = b.get_inventory(defines.inventory.character_guns)
          local m = b.get_inventory(defines.inventory.character_ammo)
          local r = b.get_inventory(defines.inventory.character_armor)
          local gun = (g and not g.is_empty()) and g[1].name or "-"
          local ammo = m and m.get_item_count() or 0
          local armor = (r and not r.is_empty()) and r[1].name or "-"
          out[#out+1] = name .. "|" .. gun .. "|" .. ammo .. "|" .. armor
        end
      end
      return out
    end)()""" % (BODY, packed))
    out = {}
    for row in _rows(reply):
        name, gun, ammo, armor = str(row).split("|")
        out[name] = (gun, int(ammo), armor)
    return out


def equip(ai, who) -> dict:
    """가방의 총·탄·갑옷을 슬롯으로. 플레이어의 드래그와 같은 일."""
    x, y = crew_xy(ai).get(who, (None, None))
    if x is None:
        return {"ok": 0}
    return ai.lua("""(function()
      %s
      local b = body(%f, %f)
      if not (b and b.valid) then return { ok = 0 } end
      local main = b.get_main_inventory()
      local moved = {}
      local function move(item, inv, count)
        local have = main.get_item_count(item)
        if have == 0 then return end
        local n = math.min(have, count or have)
        local put = inv.insert{ name = item, count = n }
        if put > 0 then main.remove{ name = item, count = put } end
        moved[#moved+1] = item .. ":" .. put
      end
      local guns = b.get_inventory(defines.inventory.character_guns)
      if guns.is_empty() then move("%s", guns, 1) end
      move("%s", b.get_inventory(defines.inventory.character_ammo), %d)
      local armor = b.get_inventory(defines.inventory.character_armor)
      if armor.is_empty() then move("%s", armor, 1) end
      return { ok = 1, moved = table.concat(moved, " ") }
    end)()""" % (BODY, x, y, GUN, AMMO_ITEM, AMMO, ARMOR))


def outfit(ai, who) -> list:
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    got = kit(ai).get(who, ("-", 0, "-"))
    plan = []
    need_gun = got[0] == "-" and not bag.get(GUN)
    need_armor = got[2] == "-" and not bag.get(ARMOR)
    need_ammo = max(0, AMMO - got[1] - int(bag.get(AMMO_ITEM, 0)))
    for item, n in (("iron-plate", 60 if need_gun else 0), ("copper-plate", 120 if need_armor else 20),
                    ("steel-plate", 50 if need_armor else 0)):
        at = have.get(item) or creep.stock_at(ai, item, n)
        if n and at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    if need_ammo:
        at = have.get(AMMO_ITEM) or creep.stock_at(ai, AMMO_ITEM, need_ammo)
        if at:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": AMMO_ITEM, "x": at[0], "y": at[1], "count": need_ammo}))
    if need_gun:
        plan.append(("craft", {"recipe": GUN, "count": 1, "wait": True}))
    if need_armor:
        plan.append(("craft", {"recipe": ARMOR, "count": 1, "wait": True}))
    return plan


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    for name, (gun, ammo, armor) in kit(ai).items():
        print(f"  {name:<8} {gun:<15} {ammo:>4}발  {armor}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not crew:
        return 0
    for who in crew:
        plan = outfit(ai, who)
        if plan:
            submit(ai, who, plan, strict=False)
            print(f"{who}: 무장 갖추기 ({len(plan)}단계)")
    for _ in range(80):
        time.sleep(5)
        live = {w["name"]: w for w in ai.list()}
        if all(not (live[w].get("current") or live[w].get("queued")) for w in crew if w in live):
            break
    for who in crew:
        print(f"  {who}: {equip(ai, who).get('moved', '')}")
    for name, (gun, ammo, armor) in kit(ai).items():
        if name in crew:
            print(f"  {name:<8} {gun:<15} {ammo:>4}발  {armor}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

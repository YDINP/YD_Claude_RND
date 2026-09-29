"""run24 기지 점검 수리 (08:1x, 코디네이터 감사) - 사람 foxtrot 만 (다른 사람은 p12 · hauler · 고리 몫).

Lua 아이템 이동 0 - 사람 손 (craft · take · insert · build) 과 로봇 (유령 · 해체 표시) 만.

    python scripts/fix24.py --run run24 poles      # 작은 전봇대 손제작 → 망 저장 상자 (로봇이 유령 6 을 짓는다)
    python scripts/fix24.py --run run24 decon      # 다 캔 채굴기 + 그것만 붓던 화로 해체 표시 (로봇)
    python scripts/fix24.py --run run24 east1      # 동쪽 전초 돌 화로 → 강철로 (앞 9 + 빈 자리), 가방 석탄 → 전초 석탄 상자
    python scripts/fix24.py --run run24 east2      # 나머지 돌 화로
    python scripts/fix24.py --run run24 hub        # 가방 판 · 광석 · 돌 화로 → 허브 · 저장 상자
"""
import argparse, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge  # noqa
from orders import submit  # noqa

OWNER = "fix24"
WHO = "foxtrot"
STORE = (11.5, -9.5)          # R_M 옆 저장 상자 (p7_24.STORE)


def grab(ai, minutes=30):
    os.environ[detached.ENV] = OWNER
    detached.mark([WHO], OWNER, minutes=minutes)


def poles(ai):
    """작은 전봇대: 나무 1 + 전선 2 → 2 개. foxtrot 가방 나무 171 · 구리판 10."""
    grab(ai, 15)
    bag = ai.agent(WHO).items()
    cu = int(bag.get("copper-plate", 0))
    n = min(cu, 10)
    plan = [("craft", {"recipe": "copper-cable", "count": n, "wait": "block"}),
            ("craft", {"recipe": "small-electric-pole", "count": n, "wait": "block"}),
            ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
            ("insert", {"name": "small-electric-pole", "x": STORE[0], "y": STORE[1], "count": int(bag.get("small-electric-pole", 0)) + 2 * n})]
    submit(ai, WHO, plan, strict=False)
    return {"poles": int(bag.get("small-electric-pole", 0)) + 2 * n}


DECON_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local live, dead, out = {}, {}, {drills = 0, furnaces = 0}
  for _, e in pairs(s.find_entities_filtered{type = 'mining-drill', area = %s, force = f}) do
    if e.status == defines.entity_status.no_minable_resources then dead[#dead + 1] = e else live[#live + 1] = e end
  end
  local function inbox(p, e) local b = e.bounding_box
    return p.x >= b.left_top.x and p.x <= b.right_bottom.x and p.y >= b.left_top.y and p.y <= b.right_bottom.y end
  for _, fu in pairs(s.find_entities_filtered{type = 'furnace', area = %s, force = f}) do
    local d, l = false, false
    for _, e in pairs(dead) do if inbox(e.drop_position, fu) then d = true end end
    for _, e in pairs(live) do if inbox(e.drop_position, fu) then l = true end end
    if d and not l and fu.order_deconstruction(f) then out.furnaces = out.furnaces + 1 end
  end
  for _, e in pairs(dead) do if e.order_deconstruction(f) then out.drills = out.drills + 1 end end
  return out
end)()"""


AREAS = {"iron": [[40, -110], [130, -20]], "copper_s": [[40, 60], [110, 110]]}


def decon(ai):
    """광석 다 캔 채굴기 (no_minable_resources) + 그 채굴기만 붓던 화로에 해체 표시 - 로봇이 걷어 저장 상자로 (로보포트 (56,-15) 건설 범위)."""
    out = {}
    for k, a in AREAS.items():
        box = str(a).replace("[", "{").replace("]", "}")
        out[k] = ai.lua(DECON_LUA % (box, box))
    return out


EAST_Q = """(function()
  local s = game.surfaces[1]; local o = {stone = {}}
  for _, e in pairs(s.find_entities_filtered{name = 'stone-furnace', area = {{380, -200}, {440, -100}}, force = 'player'}) do
    o.stone[#o.stone + 1] = {e.position.x, e.position.y} end
  o.gap = s.can_place_entity{name = 'steel-furnace', position = {404, -143}, force = 'player', build_check_type = defines.build_check_type.manual}
  o.store = s.find_entities_filtered{name = 'storage-chest', position = {11.5, -9.5}, radius = 0.3}[1].get_inventory(defines.inventory.chest).get_item_count('steel-furnace')
  return o end)()"""
COAL_CHESTS = [(403.5, -149.5), (413.5, -146.5)]      # P8 전초 석탄 상자 (광석 벨트 석탄 레인)


def east(ai, part):
    """동쪽 전초 (409,-171) 돌 화로 19 → 강철로 (7.5 → 15/s 설계). 망 밖이라 사람 손: 캐고 (가방으로) → 같은 자리에 build (충돌 검사).
    part 1: 저장 상자에서 강철로 20 + 가방 석탄을 전초 석탄 상자에 + 빈 자리 (404,-143) + 앞 9 개 / part 2: 나머지 10 + 판 · 돌 화로를 허브로."""
    grab(ai, 40)
    r = ai.lua(EAST_Q)
    stone = sorted(map(tuple, r["stone"]), key=lambda p: (p[0], p[1]))
    plan = []
    if part == 1:
        n = min(20, int(r["store"]))
        plan += [("walk_to", {"x": 11.5, "y": -8.0}), ("take", {"name": "steel-furnace", "x": 11.5, "y": -9.5, "count": n})]
        coal = int(ai.agent(WHO).items().get("coal", 0)) - 100
        for (x, y) in COAL_CHESTS:
            k = min(1100, coal)
            if k > 0:
                plan += [("walk_to", {"x": x, "y": y - 1.5}), ("insert", {"name": "coal", "x": x, "y": y, "count": k})]
                coal -= k
        if r.get("gap"):
            plan.append(("build", {"name": "steel-furnace", "x": 404, "y": -143}))
        todo = stone[:9]
    else:
        todo = stone
    for (x, y) in todo:
        plan += [("demolish", {"x": x, "y": y, "name": "stone-furnace", "search_radius": 0.3}),
                 ("build", {"name": "steel-furnace", "x": x, "y": y})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "stone_left": len(stone)}


def hub(ai):
    """가방의 철판 · 철광석 · 돌 화로를 허브 · 저장 상자로 (손)."""
    grab(ai, 15)
    bag = ai.agent(WHO).items()
    plan = [("walk_to", {"x": 74.5, "y": -14.0})]
    if int(bag.get("iron-plate", 0)):
        plan.append(("insert", {"name": "iron-plate", "x": 74.5, "y": -15.5, "count": int(bag["iron-plate"])}))
    for n in ("stone-furnace", "iron-ore", "coal"):
        k = int(bag.get(n, 0))
        if k:
            plan += [("walk_to", {"x": 59.5, "y": -13.0}), ("insert", {"name": n, "x": 59.5, "y": -14.5, "count": k})]
    submit(ai, WHO, plan, strict=False)
    return {"bag": bag}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step")
    a, _ = ap.parse_known_args()
    ai = AIBridge()
    print({"poles": poles, "decon": decon, "east1": lambda ai: east(ai, 1), "east2": lambda ai: east(ai, 2), "hub": hub}[a.step](ai))


if __name__ == "__main__":
    main()

"""Run 24: 동쪽 전초 북쪽 드릴 밭 (x 390..430, y -200..-145) 지키기 - 포탑 줄 · NE 모서리 · 동벽 두 겹 빈 칸.

16:2x 중형 침 · 16:4x 큰 이빨 · 큰 침에 드릴 밭이 두 번 먹힘. 북쪽은 물 (y -195 위, 물고기 · can_place 막힘) 이라 막힌 면,
열린 면은 동쪽 (벽 x 426.5 · 427.5).
Lua 아이템 이동 0 - 유령 (can_place manual · 같은 이름 선 칸 / 유령 건너뜀) · insert_plan 피어싱 만. 로봇이 전초 망에서 날라 짓고 넣는다.

    python scripts/eastnorth24.py              # 상태 (포탑 · 탄 · 벽 빈 칸 · 적)
    python scripts/eastnorth24.py --go         # 포탑 유령 (피어싱 30) + 벽 빈 칸 유령 + hold 목록 풀기
"""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
from client import AIBridge  # noqa

HOLD_FILE = os.path.join(HERE, "..", "state", "run24_east_hold.json")
AMMO, FILL = "piercing-rounds-magazine", 30
# 줄 포탑 (방어 담당 요청) + NE 모서리 (419..424, -190..-170) 채움
TURRETS = [(394, -174), (399, -174), (419, -174), (424, -174), (394, -170), (399, -170), (419, -170), (424, -170), (395, -157),
           (424, -190), (424, -182), (421, -193), (421, -186), (421, -181)]   # 419,-190 · 424,-186 은 나무 · 419,-182 는 나무 + 광석 → 빈 자리로
WALL_X = (426.5, 427.5)
WALL_Y = (-201, -114)          # 동벽 두 겹 구간 (y -201 위는 물)

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local o = {tur = {}, placed = {}, blocked = {}, wall_gap = 0, wall_placed = 0, wall_blocked = 0}
  local function place(name, p, ammo)
    if s.count_entities_filtered{position = p, radius = 0.9, name = name} + s.count_entities_filtered{position = p, radius = 0.9, ghost_name = name} > 0 then return 'skip' end
    if not s.can_place_entity{name = name, position = p, force = f, build_check_type = defines.build_check_type.manual} then return 'blocked' end
    if not A.go then return 'can' end
    local g = s.create_entity{name = 'entity-ghost', inner_name = name, position = p, force = f}
    if g and ammo then pcall(function() g.insert_plan = {{id = {name = A.ammo}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = A.fill}}}}} end) end
    return g and 'ghost' or 'fail'
  end
  for _, p in pairs(A.tur) do
    local t = s.find_entities_filtered{name = 'gun-turret', force = f, position = p, radius = 0.9}[1]
    if t then o.tur[#o.tur + 1] = p[1] .. ',' .. p[2] .. ':' .. t.get_inventory(defines.inventory.turret_ammo).get_item_count()
    else
      local r = place('gun-turret', p, true)
      if r == 'ghost' or r == 'can' or r == 'skip' then o.placed[#o.placed + 1] = r .. ' ' .. p[1] .. ',' .. p[2]
      else o.blocked[#o.blocked + 1] = p[1] .. ',' .. p[2] end
    end
  end
  for _, x in pairs(A.wx) do
    for y = A.wy[1], A.wy[2] do
      local p = {x, y + 0.5}
      if s.count_entities_filtered{position = p, radius = 0.3, name = 'stone-wall'} == 0 then
        o.wall_gap = o.wall_gap + 1
        local r = place('stone-wall', p, false)
        if r == 'ghost' or r == 'can' or r == 'skip' then o.wall_placed = o.wall_placed + 1 else o.wall_blocked = o.wall_blocked + 1 end
      end
    end
  end
  local n = s.find_logistic_network_by_position({394, -120}, f)
  o.net = n and {pierce = n.get_item_count(A.ammo), turrets = n.get_item_count('gun-turret'), walls = n.get_item_count('stone-wall'), robots = n.available_construction_robots} or 'none'
  o.foes = s.count_entities_filtered{area = {{360, -240}, {480, -130}}, force = 'enemy', type = 'unit'}
  local ts = s.find_entities_filtered{area = {{385, -200}, {430, -145}}, name = 'gun-turret', force = f}
  local lo, mn = 0, 999
  for _, t in pairs(ts) do local c = t.get_inventory(defines.inventory.turret_ammo).get_item_count() if c < 25 then lo = lo + 1 end if c < mn then mn = c end end
  o.field = {turrets = #ts, under25 = lo, min = mn}
  return o
end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", action="store_true")
    a = ap.parse_args()
    tur = list(TURRETS)
    held = json.load(open(HOLD_FILE, encoding="utf-8")) if os.path.exists(HOLD_FILE) else []
    tur += [tuple(p[:2]) for p in held]
    arg = json.dumps({"go": a.go, "tur": [list(p) for p in tur], "ammo": AMMO, "fill": FILL, "wx": list(WALL_X), "wy": list(WALL_Y)})
    r = AIBridge().lua(LUA % arg)
    print(json.dumps(r, ensure_ascii=False))
    if a.go and held:
        blocked = r.get("blocked") or []
        blocked = list(blocked.values()) if isinstance(blocked, dict) else blocked
        left = [p for p in held if f"{p[0]},{p[1]}" in blocked]
        json.dump(left, open(HOLD_FILE, "w", encoding="utf-8"))
        print("hold", len(held), "->", len(left))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

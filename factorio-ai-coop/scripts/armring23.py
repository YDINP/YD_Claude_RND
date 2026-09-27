"""대포 둘레 2 차 포탑 링 - 사용자 (01:09): "대포쪽 방어선 포탑 더 많이 추가해서 보완".

망 포탑 재고 0 · 구리 0 이라 새로 못 만든다. 250 칸 안에 적 구조물이 없는 빽빽한 줄 (서쪽 뭉치 -124..-116 · 기지 안 x=-38 줄
· 북서 벽 하나 건너 하나) 에서 로봇으로 걷어, 대포 둘레 반경 16~19 에 적 쪽 (북 · 동) 을 먼저 채워 유령으로 세운다.
같은 망 2 라 로봇이 창고 -> 새 유령으로 바로 나른다. 탄은 artyaim23 GUARD 가 1 분마다 30 까지 채운다.

    python -u scripts/armring23.py            # 걷기 + 유령
    python -u scripts/armring23.py --dry
    python -u scripts/armring23.py --laser 2   # 망 레이저 재고가 있으면 자리 중 2 곳은 레이저 유령 (전봇대가 덮는 자리만;
                                               # 전봇대 사슬이 필요하면 lasermix23 가 한다 - 그쪽 laser_ring.json 과 별개)
"""
import argparse
import json
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

KIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state", "arty_kit.json")
TAKE = [(-121, -44), (-118, -49), (-116, -39), (-124, -49), (-116, -42),
        (-38, 16), (-38, 20), (-110, -96), (-110, -84), (-110, -72)]

LUA = """(function() local s = game.surfaces[1] local o = {taken = 0, spots = {}, lasers = {}}
  local A = {x = %s, y = %s} local DRY = %s local N = %d local LZ = %d
  local net = s.find_logistic_network_by_position(A, 'player')
  LZ = math.min(LZ, net and (net.get_item_count('laser-turret') - s.count_entities_filtered{ghost_name = 'laser-turret', position = A, radius = 26}) or 0)
  local function cov(p) for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', position = p, radius = 12}) do
      local r = e.prototype.get_supply_area_distance() if math.abs(e.position.x - p.x) < r + 1 and math.abs(e.position.y - p.y) < r + 1 then return true end end
    return false end
  local e = s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = A, radius = 400}
  local face = -math.pi / 2  -- 기본 북쪽
  local bd = 1e18 for _, x in pairs(e) do local d = (x.position.x - A.x)^2 + (x.position.y - A.y)^2 if d < bd then bd = d face = math.atan2(x.position.y - A.y, x.position.x - A.x) end end
  o.face = math.floor(face * 180 / math.pi)
  for _, R in pairs({17, 20}) do
    for _, da in pairs({0, 20, -20, 40, -40, 60, -60, 80, -80, 105, -105, 130, -130, 160, -160, 180}) do
      if #o.spots + #o.lasers >= N then break end
      local a = face + da * math.pi / 180
      local p = {x = math.floor(A.x + R * math.cos(a)), y = math.floor(A.y + R * math.sin(a))}
      local close = s.count_entities_filtered{name = {'gun-turret', 'laser-turret'}, position = p, radius = 5} + s.count_entities_filtered{ghost_name = {'gun-turret', 'laser-turret'}, position = p, radius = 5}
      if close == 0 and s.can_place_entity{name = 'gun-turret', position = p, force = 'player'} and s.find_logistic_network_by_position(p, 'player') then
        if #o.lasers < LZ and cov(p) then
          if not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'laser-turret', position = p, force = 'player'} end
          o.lasers[#o.lasers + 1] = p.x .. ',' .. p.y
        else
          if not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'gun-turret', position = p, force = 'player'} end
          o.spots[#o.spots + 1] = p.x .. ',' .. p.y
        end
      end
    end
  end
  for _, q in pairs({%s}) do
    if o.taken >= #o.spots then break end
    local t = s.find_entities_filtered{name = 'gun-turret', force = 'player', position = q, radius = 1.2}[1]
    if t and not t.to_be_deconstructed() and not (t.last_user and t.last_user.name == 'Guiltyring') then
      if not DRY then t.order_deconstruction('player') end o.taken = o.taken + 1 end
  end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--laser", type=int, default=0, help="자리 중 N 곳은 레이저 유령 (망 재고·전봇대 덮임이 될 때)")
    a = ap.parse_args()
    with open(KIT, encoding="utf-8") as f:
        site = json.load(f)["site"]
    ai = AIBridge()
    r = ai.lua(LUA % (site[0], site[1], "true" if a.dry else "false", len(TAKE), a.laser,
                      ", ".join("{%s, %s}" % p for p in TAKE)))
    print(r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

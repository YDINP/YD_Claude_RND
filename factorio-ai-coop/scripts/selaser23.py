"""남동 공습 진입로 레이저 섞기 - 13:14 적 3, 13:22 적 15 (대형 9) 가 (63,27) 로 반복 공습.

둥지는 남동 (100,62)·(103,78)… - 적은 남동에서 벽 (x 47.5, y -20..29.5) 동쪽 끝 모서리로 온다.
벽 안 기관포탑 줄 (x 44, y -6..30, 8 대) 뒤 x 40 에 레이저 7 대 유령 + 남쪽 끝에 소형 전봇대 1 (주 전력망 42.5,25.5 에서 이음).
전봇대 (42.5, y 7.5..25.5) 공급 범위 안 자리만. 로봇이 짓는다 (roboport (14,-2) 건설 범위, 벽 안).

    python -u scripts/selaser23.py --dry
    python -u scripts/selaser23.py
    python -u scripts/selaser23.py --check
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

LASERS = [(40, 9), (40, 13), (40, 17), (40, 21), (40, 25), (40, 29), (40, 32)]
POLES = [(42.5, 31.5)]

LUA = """(function() local s = game.surfaces[1] local DRY = %s local o = {lasers = {}, poles = {}, skip = {}}
  local function cov(p, half)
    for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', position = p, radius = 10}) do
      local r = e.prototype.get_supply_area_distance()
      if math.abs(e.position.x - p[1]) < r + half and math.abs(e.position.y - p[2]) < r + half then return true end end
    for _, e in pairs(s.find_entities_filtered{ghost_type = 'electric-pole', position = p, radius = 10}) do
      local r = e.ghost_prototype.get_supply_area_distance()
      if math.abs(e.position.x - p[1]) < r + half and math.abs(e.position.y - p[2]) < r + half then return true end end
    return false end
  local function ok(name, p)
    return s.can_place_entity{name = name, position = p, force = 'player'}
      and s.count_entities_filtered{type = 'resource', area = {{p[1] - 1, p[2] - 1}, {p[1] + 1, p[2] + 1}}} == 0
      and #s.find_logistic_networks_by_construction_area(p, 'player') > 0 end
  for _, p in pairs({%s}) do
    if ok('small-electric-pole', p) then
      if not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'small-electric-pole', position = p, force = 'player'} end
      o.poles[#o.poles + 1] = p[1] .. ',' .. p[2]
    else o.skip[#o.skip + 1] = 'pole ' .. p[1] .. ',' .. p[2] end end
  for _, p in pairs({%s}) do
    if not ok('laser-turret', p) then o.skip[#o.skip + 1] = 'laser ' .. p[1] .. ',' .. p[2] .. ' 자리'
    elseif not (DRY or cov(p, 1)) then o.skip[#o.skip + 1] = 'laser ' .. p[1] .. ',' .. p[2] .. ' 전력'
    else
      if not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'laser-turret', position = p, force = 'player'} end
      o.lasers[#o.lasers + 1] = p[1] .. ',' .. p[2] end end
  return o end)()"""

CHECK = """(function() local s = game.surfaces[1] local o = {st = {}}
  local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
  for _, p in pairs({%s}) do
    local l = s.find_entities_filtered{name = 'laser-turret', position = p, radius = 0.6}[1]
    local g = s.count_entities_filtered{ghost_name = 'laser-turret', position = p, radius = 0.6}
    o.st[#o.st + 1] = p[1] .. ',' .. p[2] .. ' ' .. (l and (names[l.status] or l.status) or (g > 0 and 'ghost' or 'none'))
      .. (l and (' net' .. tostring(l.electric_network_id)) or '') end
  local R0 = s.find_entities_filtered{name = 'roboport', position = {56, -127}, radius = 3}[1]
  for _, p in pairs(s.find_entities_filtered{type = 'electric-pole', position = R0.position, radius = 8}) do o.main = p.electric_network_id break end
  o.gun30 = s.count_entities_filtered{name = 'gun-turret', position = {63, 27}, radius = 30}
  o.laser30 = s.count_entities_filtered{name = 'laser-turret', position = {63, 27}, radius = 30}
  o.gun30b = s.count_entities_filtered{name = 'gun-turret', position = {52, 20}, radius = 30}
  o.laser30b = s.count_entities_filtered{name = 'laser-turret', position = {52, 20}, radius = 30}
  return o end)()"""


def pts(ps):
    return ", ".join("{%s, %s}" % p for p in ps)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.check:
        print(ai.lua(CHECK % pts(LASERS)))
        return 0
    print(ai.lua(LUA % ("true" if a.dry else "false", pts(POLES), pts(LASERS))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

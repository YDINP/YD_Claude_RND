"""철광석 고갈 대응: 방어선 안 (-128..-105, -40..-5) 남은 철광석에 전기 채굴기 로봇 유령 추가 (run23, 대포 연구 버티기).

기존 채굴기 5~6대가 덮지 못하는 칸 = x=-114.5 줄 (탄약 벨트 x=-113.5 바로 서쪽) + (-111,-33) 조각.
  N: (-111.5,-33.5) 동향 -> 남행 철광석 벨트 x=-109.5 에 직접 (벨트 불필요)   ~635
  A: (-116.5,-24.5) 서향 -> 새 벨트 (-118.5,-24.5) 서향 -> 북행 철광석 벨트 x=-119.5 옆 합류   ~4300
  D: (-116.5,-8.5)  서향 -> 새 벨트 (-118.5,-8.5) 서향 -> x=-119.5 벨트 시작 칸 옆 합류   ~1700
탄약 벨트 x=-113.5 / x=-125.5, 벽 x=-131.5/-130.5, 포탑 x=-128/-116 은 건드리지 않는다.
망에 벨트가 0 이라 벨트 조립기 (-45.5,7.5) 출력에서 필요한 만큼만 망 창고로 옮긴다 (Lua, 사람 투입 없음).

    python -u scripts/ironsqueeze23.py --plan     # 배치 가능 여부만
    python -u scripts/ironsqueeze23.py --build    # 유령 배치
    python -u scripts/ironsqueeze23.py            # 상태 + 철광석 10분 통계
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

# (이름, 위치, 방향) - 방향 0 북 4 동 8 남 12 서
PLAN = [("electric-mining-drill", (-111.5, -33.5), 4),
        ("electric-mining-drill", (-116.5, -24.5), 12),
        ("transport-belt", (-118.5, -24.5), 12),
        ("electric-mining-drill", (-116.5, -8.5), 12),
        ("transport-belt", (-118.5, -8.5), 12)]
BELT_SRC = (-45.5, 7.5)
NET_AT = (-116.5, -24.5)

LUA = """(function() local s = game.surfaces[1] local f = game.forces.player local o = {}
  local plan = {%s} local build = %s
  local n = f.find_logistic_network_by_position({%s}, s)
  if build and n then
    local need = 0 for _, p in pairs(plan) do if p[1] == 'transport-belt' then need = need + 1 end end
    need = need - n.get_item_count('transport-belt')
    if need > 0 then
      local a = s.find_entities_filtered{type = 'assembling-machine', position = {%s}, radius = 0.5}[1]
      local inv = a and a.get_inventory(defines.inventory.assembling_machine_output)
      local k = inv and math.min(need, inv.get_item_count('transport-belt')) or 0
      if k > 0 then k = n.insert({name = 'transport-belt', count = k}) if k > 0 then inv.remove{name = 'transport-belt', count = k} end end
      o[#o + 1] = 'belts moved ' .. k .. '/' .. need
    end
  end
  for _, p in pairs(plan) do
    local pos = {p[2], p[3]} local tag = p[1] .. ' ' .. p[2] .. ',' .. p[3]
    local real = s.find_entities_filtered{name = p[1], position = pos, radius = 0.1}[1]
    local ghost = s.find_entities_filtered{ghost_name = p[1], position = pos, radius = 0.1}[1]
    if real then
      local st = ''
      if real.type == 'mining-drill' then
        local st_name = '?' for k2, v in pairs(defines.entity_status) do if v == real.status then st_name = k2 end end
        st = ' ' .. st_name .. ' ore_left ' .. (real.mining_target and 0 or 0)
        local left = 0 for _, r in pairs(s.find_entities_filtered{name = 'iron-ore', area = {{p[2] - 2.5, p[3] - 2.5}, {p[2] + 2.5, p[3] + 2.5}}}) do left = left + r.amount end
        st = ' ' .. st_name .. ' area_ore ' .. left
      end
      o[#o + 1] = 'BUILT ' .. tag .. st
    elseif ghost then o[#o + 1] = 'GHOST ' .. tag
    else
      local ok = s.can_place_entity{name = p[1], position = pos, direction = p[4], force = f, build_check_type = defines.build_check_type.manual_ghost}
      if ok and build then
        local g = s.create_entity{name = 'entity-ghost', inner_name = p[1], position = pos, direction = p[4], force = f}
        o[#o + 1] = (g and 'PLACED ' or 'FAIL ') .. tag
      else o[#o + 1] = (ok and 'CAN ' or 'BLOCKED ') .. tag end
    end
  end
  if n then o[#o + 1] = 'net drill ' .. n.get_item_count('electric-mining-drill') .. ' belt ' .. n.get_item_count('transport-belt') .. ' bots ' .. n.available_construction_robots .. '/' .. n.all_construction_robots end
  local stt = f.get_item_production_statistics(s)
  o[#o + 1] = 'iron-ore 10min ' .. math.floor(stt.get_flow_count{name = 'iron-ore', category = 'output', precision_index = defines.flow_precision_index.ten_minutes, count = true})
  o[#o + 1] = 'tick ' .. game.tick
  return o end)()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--build", action="store_true")
    a = ap.parse_args()
    plan = ",".join("{'%s', %s, %s, %d}" % (nm, x, y, d) for nm, (x, y), d in PLAN)
    lua = LUA % (plan, "true" if a.build else "false", "%s, %s" % NET_AT, "%s, %s" % BELT_SRC)
    for line in AIBridge().lua(lua):
        print(line)


if __name__ == "__main__":
    main()

"""구리광석 고갈 대응: 본진 구리 매장 (-60,-85) 에서 기존 채굴기가 안 덮는 칸에 전기 채굴기 로봇 유령 추가 (run23).

사용자 00:56 "슬슬 구리도 고갈되는거같은데". 매장 전체 155k 중 채굴기 밖 99칸 65.6k.
구리 벨트 (조사 결과):
  - x=-58.5 남행 (y -83.5 → -51.5) = 구리 강철 화로 (x=-61) 입력줄
  - y=-88.5 서행 (x -55.5 → -66.5) → x=-74.5 → x=-72.5 남행 → 구리 돌 화로 (-75/-70, y -44..-38)
  - y=-94.5 서행 / x=-64.5 남행 은 돌벽돌 줄이라 쓰지 않는다
자리 (5x5 채굴 범위 안 미채굴 광석 많은 순, 기존 전주 전력권 안, 망 2 건설권 안):
  A: (-62.5,-80.5) 동향 -> 새 벨트 (-60.5,-80.5)(-59.5,-80.5) 동향 -> x=-58.5 옆 합류   ~12k (x -64.5/-63.5 줄)
  B: (-54.5,-92.5) 남향 -> 새 벨트 (-54.5,-90.5)(-55.5,-90.5) 서향, (-56.5,-90.5)(-56.5,-89.5) 남향 -> y=-88.5 옆 합류   ~13.7k (y -91.5 부자 줄)
  (C 후보 (-66.5,-91.5) ~8k 는 돌 줄 긴팔 투입기 (-66.5,-90.5/-91.5) 가 막아 제외 - 투입기 안 건드림)
고갈 채굴기 해체는 drillclean23.py 가 이미 하므로 여기선 안 한다. Guiltyring 소유물 · 전주 · 기존 벨트는 건드리지 않는다.
망에 벨트가 0 이면 벨트 조립기 (-45.5,7.5) 출력에서 필요한 만큼만 망 창고로 옮긴다 (Lua, 사람 투입 없음).

    python -u scripts/coppersqueeze23.py --plan     # 배치 가능 여부 · 자리별 범위 광석
    python -u scripts/coppersqueeze23.py --build    # 유령 배치
    python -u scripts/coppersqueeze23.py            # 상태 + 구리광석 10분 통계
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

# (이름, 위치, 방향) - 방향 0 북 4 동 8 남 12 서
PLAN = [("electric-mining-drill", (-62.5, -80.5), 4),
        ("transport-belt", (-60.5, -80.5), 4),
        ("transport-belt", (-59.5, -80.5), 4),
        ("electric-mining-drill", (-54.5, -92.5), 8),
        ("transport-belt", (-54.5, -90.5), 12),
        ("transport-belt", (-55.5, -90.5), 12),
        ("transport-belt", (-56.5, -90.5), 8),
        ("transport-belt", (-56.5, -89.5), 8)]
BELT_SRC = (-45.5, 7.5)
NET_ID = 2

LUA = """(function() local s = game.surfaces[1] local f = game.forces.player local o = {}
  local plan = {%s} local build = %s
  local n for _, x in pairs(f.logistic_networks[s.name] or {}) do if x.network_id == %d then n = x end end
  local function inC(x, y) if not n then return false end for _, c in pairs(n.cells) do if c.is_in_construction_range({x, y}) then return true end end return false end
  if build and n then
    local need = 0 for _, p in pairs(plan) do if p[1] == 'transport-belt' and not s.find_entities_filtered{name = p[1], position = {p[2], p[3]}, radius = 0.1}[1] then need = need + 1 end end
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
    local ore = ''
    if p[1] == 'electric-mining-drill' then
      local left = 0 for _, r in pairs(s.find_entities_filtered{name = 'copper-ore', area = {{p[2] - 2.5, p[3] - 2.5}, {p[2] + 2.5, p[3] + 2.5}}}) do left = left + r.amount end
      ore = ' area_ore ' .. left
    end
    if real then
      local st = ''
      if real.type == 'mining-drill' then
        local st_name = '?' for k2, v in pairs(defines.entity_status) do if v == real.status then st_name = k2 end end
        st = ' ' .. st_name
      end
      o[#o + 1] = 'BUILT ' .. tag .. st .. ore
    elseif ghost then o[#o + 1] = 'GHOST ' .. tag .. ore
    else
      local ok = s.can_place_entity{name = p[1], position = pos, direction = p[4], force = f, build_check_type = defines.build_check_type.manual_ghost}
      local c = inC(p[2], p[3])
      if ok and c and build then
        local g = s.create_entity{name = 'entity-ghost', inner_name = p[1], position = pos, direction = p[4], force = f}
        o[#o + 1] = (g and 'PLACED ' or 'FAIL ') .. tag .. ore
      else o[#o + 1] = (ok and 'CAN ' or 'BLOCKED ') .. tag .. (c and '' or ' OUT_OF_NET') .. ore end
    end
  end
  if n then o[#o + 1] = 'net ' .. n.network_id .. ' drill ' .. n.get_item_count('electric-mining-drill') .. ' belt ' .. n.get_item_count('transport-belt') .. ' bots ' .. n.available_construction_robots .. '/' .. n.all_construction_robots end
  local stt = f.get_item_production_statistics(s)
  o[#o + 1] = 'copper-ore 10min ' .. math.floor(stt.get_flow_count{name = 'copper-ore', category = 'output', precision_index = defines.flow_precision_index.ten_minutes, count = true})
  o[#o + 1] = 'tick ' .. game.tick
  return o end)()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--build", action="store_true")
    a = ap.parse_args()
    plan = ",".join("{'%s', %s, %s, %d}" % (nm, x, y, d) for nm, (x, y), d in PLAN)
    lua = LUA % (plan, "true" if a.build else "false", NET_ID, "%s, %s" % BELT_SRC)
    for line in AIBridge().lua(lua):
        print(line)


if __name__ == "__main__":
    main()

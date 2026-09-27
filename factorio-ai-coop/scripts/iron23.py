"""철 광석 증설 - 23회차 방어선 안 남은 철 (2026-09-27 14:00).

실측: 철광 채굴기 9 (8 가동) · 287/분. 서쪽 광맥 광석은 전부 x=-85.5 북향 벨트의 고속 팔 둘 (-86.5,-42.5/-43.5) 이
p27 화로 16 으로 빼 가고, 넘치는 몫만 col41 (x -41·-36 화로 24, y=-45.5 → x=-38.5) 으로 간다 - 그래서 col41 이 논다.
광석을 늘리면 p27 이 찬 뒤 넘치는 몫이 저절로 col41 로 간다 (새 벨트 줄 불필요).

방어선 안 남은 철 (채굴기가 안 덮는 곳):
  W  서쪽 벽 (x -121..-120) 과 탄 벨트 (x=-113.5) 사이 띠, x -119..-115, y -27..-8 : ~7만 (가장 큼)
     포탑 (x=-116, 2x2) 사이 빈 줄 y -21..-18 · -15..-12 에만 채굴기가 들어간다. 동향으로 떨궈 지하 벨트로 탄 벨트를 건넌다.
  N  x -110..-104, y -38..-30 : ~1.1만 -> 기존 벨트 x=-109.5 (남향) 를 북쪽으로 늘림
  E  x=-85.5 벨트 서쪽 (-90..-86, y -24..-11) : ~1.2만 -> x=-85.5 에 바로 떨굼
  y=-10.5 줄 (채굴기 (-110.5,-12.5) 하나) 은 mine23 LANE_CUTS 로 (-85.5,-17.5) 가 끊겨 막다른 줄 -> 다시 잇는다.
  (채굴기 9 대 → 16 대. 합류 레인: y=-18.5 줄은 모서리에서 옆치기로 한 레인이 되지만 채굴기 ~9 대 = 4.5/s < 7.5)

모두 로봇망 2 (건설 범위) 안 - 사람은 안 간다. 유령 + 해체 표시로 로봇이 짓는다 (망 2 창고: 채굴기 18 · 벨트 200 · 지하 20 · 전봇대 40).

    python scripts/iron23.py            # 점검 (자리 · 전력 · 광석)
    python scripts/iron23.py --build    # 해체 표시 → 유령
    python scripts/iron23.py --verify   # 채굴기 상태 · 10분 철 광석/철판/톱니/빨강
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

N, E, S, W = 0, 4, 8, 12
EMD, BELT, UG, POLE = "electric-mining-drill", "transport-belt", "underground-belt", "small-electric-pole"

# (이름, x, y, 방향, 지하벨트 종류)
DECON = [(EMD, -110.5, -12.5)]           # 막다른 줄 채굴기 - 한 칸 동쪽으로 옮긴다 (D2 벨트 자리)
PLAN = [
    # y=-10.5 줄 다시 잇기. 처음엔 (-85.5,-17.5) 북향으로 곧게 이었더니 y=-18.5 줄이 모서리에서 옆치기로 서쪽 레인에만
    # 실려 x=-85.5 가 한 레인 (7.5/s) 에 꽉 찼다 (채굴기 3 출구 막힘). 그래서 y=-10.5 줄을 서향으로 꺾어 (-86.5,-18.5) 에
    # 남쪽에서 옆치기 (= y=-18.5 의 남쪽 레인) 하고, 모서리 (-85.5,-18.5) 는 다시 «꺾임» -> x=-85.5 두 레인을 다 쓴다.
    (BELT, -85.5, -17.5, W, None), (BELT, -86.5, -17.5, N, None),
    # W1: 포탑 (-116,-22)·(-116,-16) 사이
    (EMD, -116.5, -18.5, E, None),
    (UG, -114.5, -18.5, E, "input"), (UG, -112.5, -18.5, E, "output"),
    (BELT, -111.5, -18.5, E, None), (BELT, -110.5, -18.5, E, None),
    (EMD, -111.5, -16.5, N, None),                       # 탄 벨트 동쪽 - W1 벨트에 떨굼
    # W2: 포탑 (-116,-16)·(-116,-10) 사이 -> y=-10.5 줄
    (EMD, -116.5, -12.5, E, None),
    (UG, -114.5, -12.5, E, "input"), (UG, -112.5, -12.5, E, "output"),
    (BELT, -111.5, -12.5, S, None), (BELT, -111.5, -11.5, S, None),
    (EMD, -109.5, -12.5, S, None),                       # 옮긴 채굴기
    # N: x=-109.5 줄 북쪽 연장
    (EMD, -107.5, -34.5, W, None), (EMD, -107.5, -31.5, W, None),
] + [(BELT, -109.5, y, S, None) for y in (-34.5, -33.5, -32.5, -31.5, -30.5)] + [
    # E: x=-85.5 곁
    (EMD, -87.5, -21.5, E, None), (POLE, -88.5, -14.5, None, None), (EMD, -87.5, -12.5, E, None),
]


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def packed():
    return ";".join(f"{n},{x},{y},{d or 0},{t or '-'}" for n, x, y, d, t in PLAN)


def check(ai):
    r = ai.lua("""(function() local s, f, o = game.surfaces[1], game.forces.player, {}
      local dec = {}
      for bit in string.gmatch("%s", "[^;]+") do local n, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local e = s.find_entities_filtered{name = n, position = {tonumber(x), tonumber(y)}, radius = 0.1}[1] if e then dec[e.unit_number] = true end end
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d, t = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local h = n == '%s' and 1.5 or 0.5
        local what = "ok"
        local have = s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1]
        if have and have.direction ~= d and n == 'transport-belt' then what = "rotate"
        elseif have then what = "standing"
        elseif s.find_entities_filtered{ghost_name = n, position = {x, y}, radius = 0.1, force = f}[1] then what = "ghost"
        else
          for _, e in pairs(s.find_entities_filtered{area = {{x - h + 0.05, y - h + 0.05}, {x + h - 0.05, y + h - 0.05}}}) do
            if e.type ~= 'resource' and e.type ~= 'character' and not dec[e.unit_number] then what = "X:" .. e.name break end end
        end
        local extra = ""
        if n == '%s' then
          local ore = 0
          for _, r in pairs(s.find_entities_filtered{area = {{x - 2.5, y - 2.5}, {x + 2.5, y + 2.5}}, name = 'iron-ore'}) do ore = ore + r.amount end
          local pw = "NO"
          for _, p in pairs(s.find_entities_filtered{area = {{x - 12, y - 12}, {x + 12, y + 12}}, type = 'electric-pole', force = f}) do
            local a = p.prototype.get_supply_area_distance()
            if math.abs(p.position.x - x) < 1.5 + a and math.abs(p.position.y - y) < 1.5 + a then pw = string.format("%%.1f,%%.1f", p.position.x, p.position.y) break end end
          extra = string.format(" ore=%%d pole=%%s", ore, pw)
        end
        o[#o+1] = bit .. " " .. what .. extra
      end
      return o end)()""" % (dec_packed(), packed(), EMD, EMD))
    return [str(x) for x in rows(r)]


def dec_packed():
    return ";".join(f"{n},{x},{y}" for n, x, y in DECON)


def order_decon(ai):
    return ai.lua("""(function() local s, f, n = game.surfaces[1], game.forces.player, 0
      for bit in string.gmatch("%s", "[^;]+") do local nm, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local e = s.find_entities_filtered{name = nm, position = {tonumber(x), tonumber(y)}, radius = 0.1}[1]  -- find_entity 는 곁의 새 채굴기 (bbox) 도 잡는다
        if e and not e.to_be_deconstructed() then e.order_deconstruction(f) n = n + 1 end end
      for bit in string.gmatch("%s", "[^;]+") do local nm, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local h = nm == 'electric-mining-drill' and 1.5 or 0.5 x, y = tonumber(x), tonumber(y)
        for _, it in pairs(s.find_entities_filtered{area = {{x - h, y - h}, {x + h, y + h}}, type = 'item-entity'}) do
          if not it.to_be_deconstructed() then it.order_deconstruction(f) n = n + 1 end end end
      return {n = n} end)()""" % (dec_packed(), packed()))


def decon_left(ai):
    r = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do local nm, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        if s.find_entities_filtered{name = nm, position = {tonumber(x), tonumber(y)}, radius = 0.1}[1] then o[#o+1] = bit end end
      for bit in string.gmatch("%s", "[^;]+") do local nm, x, y = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local h = nm == 'electric-mining-drill' and 1.5 or 0.5 x, y = tonumber(x), tonumber(y)
        if s.count_entities_filtered{area = {{x - h, y - h}, {x + h, y + h}}, type = 'item-entity'} > 0 then o[#o+1] = 'items@' .. bit end end
      return o end)()""" % (dec_packed(), packed()))
    return rows(r)


def place_ghosts(ai):
    r = ai.lua("""(function() local s, f, o = game.surfaces[1], game.forces.player, {}
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d, t = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local have = s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1]
        if have and n == 'transport-belt' and have.direction ~= d then have.direction = d o[#o+1] = bit .. " rotated" end
        if not have
           and not s.find_entities_filtered{ghost_name = n, position = {x, y}, radius = 0.1, force = f}[1] then
          local args = {name = 'entity-ghost', inner_name = n, position = {x, y}, direction = d, force = f}
          if t ~= '-' then args.type = t end
          if s.can_place_entity{name = n, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.manual_ghost} then
            local g = s.create_entity(args) o[#o+1] = bit .. (g and " ghost" or " FAIL")
          else o[#o+1] = bit .. " BLOCKED" end
        end end
      return o end)()""" % packed())
    return [str(x) for x in rows(r)]


def verify(ai):
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player local o = {}
      local c = {}
      for _, e in pairs(s.find_entities_filtered{type = 'mining-drill', force = f}) do
        local t = e.mining_target
        if t and t.name == 'iron-ore' then
          local k = "?" for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end
          c[k] = (c[k] or 0) + 1 end end
      o.drills = c
      local P = f.get_item_production_statistics(s)
      for _, n in pairs({'iron-ore', 'iron-plate', 'iron-gear-wheel', 'automation-science-pack'}) do
        o[n] = P.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true}
        o[n .. '_1m'] = P.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.one_minute, count = true}
      end
      local fs = {}
      for _, e in pairs(s.find_entities_filtered{type = 'furnace', force = f}) do
        local rc = e.get_recipe() or e.previous_recipe
        local rn = rc and (type(rc.name) == 'string' and rc.name or rc.name.name) or '-'
        if rn == 'iron-plate' then
          local k = "?" for n, v in pairs(defines.entity_status) do if v == e.status then k = n end end
          fs[k] = (fs[k] or 0) + 1 end end
      o.iron_furnaces = fs
      o.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = f, area = {{-120, -40}, {-84, -8}}}
      return o end)()""")
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.verify:
        print(verify(ai))
        return 0
    for line in check(ai):
        print("  ", line)
    if not a.build:
        return 0
    print("  해체 표시:", order_decon(ai))
    t0 = time.time()
    while decon_left(ai) and time.time() - t0 < 300:
        time.sleep(5)
    print("  해체 남음:", decon_left(ai))
    for line in place_ghosts(ai):
        print("  ", line)
    t0 = time.time()
    while time.time() - t0 < 420:
        time.sleep(15)
        v = verify(ai)
        if not v.get("ghosts"):
            break
    print("  ", verify(ai))
    for line in check(ai):
        print("  ", line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

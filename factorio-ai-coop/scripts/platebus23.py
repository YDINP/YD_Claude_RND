"""기지 판 버스 머리 되살리기 (09-28 14:40) - 사용자 «받은 구리/철판들로 기지에선 조립만».

기지 화로 정리 (basecleanup23) 뒤 옛 화로 줄이 판을 내던 벨트 머리가 비어 조립 줄이 굶었다
(빨강 · 초록 · 파랑 10 분 0, laser-weapons-damage-5 88.65 % 정지). 전초 판은 망 2 저장에 쌓여 있다.
머리를 찾은 방법: 굶는 조립기의 팔 -> 집는 벨트 -> belt_neighbours.inputs 로 거슬러 올라가 입력 없는 벨트.

  cu-x63  (-63.5,-69.5) 남향 레인 2   옛 x=-61 강철로 (구리) 8 출력 줄. 지하 -> y=-41.5 서향 -> x=-67.5 동 레인 옆치기
  cu-x67  (-67.5,-44.5) 남향 레인 1   옛 x=-70 구리 돌 화로 출력 줄 (같은 x=-67.5 동 레인)
          -> 구리 버스 (벨트 253): 구리선 (-47.5,3.5)(-55.5,3.5)(-21.5,-26.5)(-21.5,-42.5)(-28.5,-17.5) · 빨강 8 · 관통탄 ·
             동쪽 버스로 넘기는 팔 (-30.5,-6.5). x=-77.5 머리도 같은 x=-67.5 동 레인으로 모이므로 따로 싣지 않는다.
  fe-x33  (-33.5,-44.5) 남향 레인 1   옛 col41 동쪽 출력 줄. 강철 돌 화로 (-29,-45)(-29,-40) · 톱니 · 파이프 · 회로 · 팔 · 벨트,
             y=-18.5 에서 전초 철 (서 레인 옆치기) 과 합쳐 과학 블록 · 동쪽 버스 팔 (-31.5,-7.5)(-31.5,-4.5) 로. 끝 (-51.5,0.5) 은 막다른 끝.
  st-x32  (-32.5,-48.5) 남향 레인 2   석탄 (레인 1) 옆 강철 레인 = 강철 돌 화로 (-29,-45/-40) 출력 레인. 엔진 (-28.5,-33.5)(-28.5,-25.5).

주기 EVERY 초마다 머리부터 TILES 칸의 해당 레인 빈 자리 (칸당 4) 만큼만 망에서 꺼내 싣는다 (기존 아이템 옮김, 못 실은 건 망 저장으로 되돌림).
벨트가 차 있으면 빈 자리가 없어 안 싣는다 (자연 역압). 망에 FLOOR 는 남긴다 (다른 중계 몫).
머리 목록은 state/platebus_heads.json. 전초 반입 벨트를 머리에 이으면 (머리 벨트에 입력이 생기고 그 입력 벨트에 같은 품목이 있으면)
그 머리는 싣지 않는다 ('belt') - 벨트가 굶을 때만 Lua 가 메운다. 벨트가 머리를 막지 않게 빈 자리 채우기도 안 한다.
구리 버스에 섞여 든 벽돌 (x=-70/-75 벽돌 화로 출력이 구리 버스에 떨어짐) 은 30 초마다 망 저장으로 옮긴다 (막다른 끝을 막지 않게, 상한 BRICK_CAP).

    python -u scripts/platebus23.py --once
    python -u scripts/platebus23.py [--every 5] [--log PATH]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

HEADS = [  # 이름, 머리, 품목, 레인, 칸 수
    ("cu-x63", (-63.5, -69.5), "copper-plate", 2, 10),
    ("cu-x67", (-67.5, -44.5), "copper-plate", 1, 3),
    ("fe-x33", (-33.5, -44.5), "iron-plate", 1, 10),
    ("st-x32", (-32.5, -48.5), "steel-plate", 2, 4),
]
FLOOR = {"iron-plate": 1500, "copper-plate": 800, "steel-plate": 300}
BRICK_CAP = 3000
CU_BUS_ROOT = (-63.5, -69.5)

LUA = """(function() local s = game.surfaces[1] local o = {put = {}, short = {}}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  if not net then return {err = 'no net 2'} end
  local FLOOR = {%s}
  for _, h in pairs({%s}) do
    local name, item, lane, tiles = h[1], h[3], h[4], h[5]
    local b = s.find_entities_filtered{type = 'transport-belt', position = h[2], radius = 0.3}[1]
    local fed = false
    if b then for _, u in pairs(b.belt_neighbours.inputs) do if u.get_transport_line(1).get_item_count(item) + u.get_transport_line(2).get_item_count(item) > 0 then fed = true end end end
    if not b then o.short[name] = 'no belt' elseif fed then o.short[name] = 'belt' else
      -- 머리부터 tiles 칸 (벨트만, 지하 · 분배기에서 멈춤) 의 빈 자리
      local slots = {} local n = 0
      while b and b.valid and b.type == 'transport-belt' and n < tiles do n = n + 1
        local L = b.get_transport_line(lane)
        for p = 0.125, L.line_length, 0.25 do if L.can_insert_at(p) then slots[#slots + 1] = {L, p} end end
        b = b.belt_neighbours.outputs[1]
      end
      local want = math.min(#slots, net.get_item_count(item) - (FLOOR[item] or 0))
      if #slots > 0 and want <= 0 then o.short[name] = 'floor' end
      if want > 0 then
        local got = net.remove_item{name = item, count = want} local put = 0
        for i = 1, #slots do if put >= got then break end
          if slots[i][1].insert_at(slots[i][2], {name = item, count = 1}) then put = put + 1 end end
        if got > put then net.insert({name = item, count = got - put}, 'storage') end
        if put > 0 then o.put[name] = put end
      end
    end
  end
  o.net = {fe = net.get_item_count('iron-plate'), cu = net.get_item_count('copper-plate'), st = net.get_item_count('steel-plate')}
  return o end)()"""

BRICK = """(function() local s = game.surfaces[1] local o = {moved = 0, belts = 0}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local b0 = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if not (net and b0) then return {err = 'no net/belt'} end
  local seen, q = {}, {b0}
  while #q > 0 and o.belts < 1500 do local b = table.remove(q)
    if b and b.valid and not seen[b.unit_number] then seen[b.unit_number] = true o.belts = o.belts + 1
      for li = 1, 2 do local L = b.get_transport_line(li) local k = L.get_item_count('stone-brick')
        if k > 0 and net.get_item_count('stone-brick') < %d then
          local put = net.insert({name = 'stone-brick', count = k}, 'storage')
          if put > 0 then L.remove_item{name = 'stone-brick', count = put} o.moved = o.moved + put end end end
      for _, c in pairs(b.belt_neighbours.outputs) do q[#q + 1] = c end
      if b.type == 'underground-belt' and b.belt_to_ground_type == 'input' and b.neighbours then q[#q + 1] = b.neighbours end
    end end
  return o end)()"""

FLOW = """(function() local s = game.surfaces[1]
  local st = game.forces.player.get_item_production_statistics(s) local p1 = defines.flow_precision_index.ten_minutes
  local o = {} for _, n in pairs({'automation-science-pack', 'logistic-science-pack', 'chemical-science-pack', 'utility-science-pack',
      'military-science-pack', 'iron-plate', 'copper-plate', 'steel-plate'}) do
    o[(n:gsub('%-science%-pack', ''):gsub('%-plate', ''))] = {math.floor(st.get_flow_count{name = n, category = 'input', precision_index = p1, count = true}),
      math.floor(st.get_flow_count{name = n, category = 'output', precision_index = p1, count = true})} end
  local f = game.forces.player o.research = f.current_research and f.current_research.name o.prog = math.floor(f.research_progress * 10000) / 100
  local net = nil for _, n in pairs(f.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  o.free = 0 for _, c in pairs(net.storages) do o.free = o.free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  return o end)()"""


def build_lua():
    fl = ", ".join("['%s'] = %d" % kv for kv in FLOOR.items())
    hs = ", ".join("{'%s', {%s, %s}, '%s', %d, %d}" % (n, p[0], p[1], it, ln, t) for n, p, it, ln, t in HEADS)
    return LUA % (fl, hs)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=5)
    ap.add_argument("--log", default=None)
    a = ap.parse_args()
    ai = AIBridge()
    src = build_lua()
    brick = BRICK % (CU_BUS_ROOT[0], CU_BUS_ROOT[1], BRICK_CAP)
    logf = open(a.log, "a", encoding="utf-8") if a.log else None

    def log(msg):
        line = time.strftime("%H:%M:%S") + " " + msg
        print(line, flush=True)
        if logf:
            logf.write(line + "\n")
            logf.flush()

    log("platebus23 시작 %s floor %s" % ([h[0] for h in HEADS], FLOOR))
    n, acc = 0, {}
    while True:
        try:
            r = ai.lua(src)
            for k, v in (r.get("put") or {}).items():
                acc[k] = acc.get(k, 0) + v
            if n % 6 == 0:
                bm = ai.lua(brick)
                if bm.get("moved"):
                    acc["brick"] = acc.get("brick", 0) + bm["moved"]
            if a.once or n % 12 == 0:
                log("판 버스 1분 실음 %s · 망 %s · 부족 %s" % (acc, r.get("net"), r.get("short") or r.get("err")))
                acc = {}
            if a.once or n % 60 == 0:
                log("10분 (생산, 소비) %s" % ai.lua(FLOW))
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        if a.once:
            return 0
        n += 1
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

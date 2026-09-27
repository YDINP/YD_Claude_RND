"""노란팩 -> 연구소 중계 (01:47).

logistic-system 연구가 98.4 % 에서 멈춤: 연구소 16 대 전부 missing_science_packs, 노란팩 (utility) 이 연구소에 0.
노란팩 조립기 출력은 철상자 (29.5,-5.5) 에 30 개 쌓여 있고 연구소로 가는 줄이 없다. 그 자리는 delta-trap 구역 (사람 금지)
이라 손으로 못 옮기므로 Lua 로 옮긴다 (가상 컨베이어): 연구소마다 노란팩 5 개 미만이면 5 까지.

    python -u scripts/yellowlab23.py            # 상주 (60 초)
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

SRC = [(29.5, -5.5)]
LUA = """(function() local s = game.surfaces[1] local o = {moved = 0, labs = 0}
  local srcs = {}
  for _, p in pairs({%s}) do local c = s.find_entities_filtered{type = 'container', position = p, radius = 0.6}[1] if c then srcs[#srcs + 1] = c end end
  for _, l in pairs(s.find_entities_filtered{type = 'lab', force = 'player'}) do
    local inv = l.get_inventory(defines.inventory.lab_input)
    local need = 5 - inv.get_item_count('utility-science-pack')
    for _, c in pairs(srcs) do
      if need <= 0 then break end
      local got = c.get_inventory(defines.inventory.chest).remove{name = 'utility-science-pack', count = need}
      if got > 0 then
        local put = inv.insert{name = 'utility-science-pack', count = got}
        if put < got then c.insert{name = 'utility-science-pack', count = got - put} end
        need = need - put o.moved = o.moved + put
      end
    end
    o.labs = o.labs + 1
  end
  local left = 0 for _, c in pairs(srcs) do left = left + c.get_item_count('utility-science-pack') end o.left = left
  return o end)()"""


# 02:22 노란팩 조립기 둘이 비행로봇 프레임을 기다리는데 프레임 10분 생산 0:
#   * 엔진 조립기 7 대가 출력 가득 (4 씩) 인데 전기엔진 조립기 (21.5,-8.5) 엔 엔진이 안 감 -> 엔진 출력을 전기엔진으로 (10 까지)
#   * 프레임 조립기 (8.5,3.5) 는 강철 · 회로 · 전기엔진은 넘치는데 배터리 0 -> 배터리 공장 (25.5,-4.5) 출력을 프레임으로 (10 까지)
#   * 전기엔진 조립기 출력 -> 프레임 조립기 (25.5,-8.5) 가 전기엔진 없으면 거기로
CHAIN = """(function() local s = game.surfaces[1] local o = {}
  local function ent(p) return s.find_entities_filtered{type = {'assembling-machine', 'furnace'}, position = p, radius = 1}[1] end
  local function inp(e) return e.get_inventory(defines.inventory.assembling_machine_input) end
  local function outp(e) return e.get_inventory(defines.inventory.assembling_machine_output) end
  local EE = ent({21.5, -8.5})
  if EE then
    for _, a in pairs(s.find_entities_filtered{type = 'assembling-machine', force = 'player'}) do
      local r = a.get_recipe()
      if r and r.name == 'engine-unit' then
        local need = 10 - inp(EE).get_item_count('engine-unit') if need <= 0 then break end
        local got = outp(a).remove{name = 'engine-unit', count = need}
        if got > 0 then inp(EE).insert{name = 'engine-unit', count = got} o.engine = (o.engine or 0) + got end
      end
    end
  end
  local B, F1, F2 = ent({25.5, -4.5}), ent({8.5, 3.5}), ent({25.5, -8.5})
  for _, F in pairs({F1, F2}) do
    if B and F then local need = 10 - inp(F).get_item_count('battery')
      if need > 0 then local got = outp(B).remove{name = 'battery', count = need} if got > 0 then inp(F).insert{name = 'battery', count = got} o.batt = (o.batt or 0) + got end end end
  end
  if EE and F2 then local need = 4 - inp(F2).get_item_count('electric-engine-unit')
    if need > 0 then local got = outp(EE).remove{name = 'electric-engine-unit', count = need} if got > 0 then inp(F2).insert{name = 'electric-engine-unit', count = got} o.ee = got end end end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    while True:
        try:
            c = ai.lua(CHAIN)
            if c:
                print(time.strftime("%H:%M:%S"), "프레임 사슬", c, flush=True)
            r = ai.lua(LUA % ", ".join("{%s, %s}" % p for p in SRC))
            if r.get("moved") or a.once:
                print(time.strftime("%H:%M:%S"), "노란팩 -> 연구소", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"yellowlab: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main())

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
  for _, p in pairs({%s}) do local c = s.find_entities_filtered{type = 'container', position = p, radius = 0.6}[1] if c then srcs[#srcs + 1] = c.get_inventory(defines.inventory.chest) end end
  -- 03:42 노란팩 조립기 (12.5,3.5) 출력에 9 개가 갇혀 있었다 (상자로 가는 줄 없음) - 조립기 출력도 원천으로
  for _, p in pairs({{12.5, 3.5}, {29.5, -8.5}}) do local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] if a then srcs[#srcs + 1] = a.get_inventory(defines.inventory.assembling_machine_output) end end
  for _, l in pairs(s.find_entities_filtered{type = 'lab', force = 'player'}) do
    local inv = l.get_inventory(defines.inventory.lab_input)
    local need = 5 - inv.get_item_count('utility-science-pack')
    for _, c in pairs(srcs) do
      if need <= 0 then break end
      local got = c.remove{name = 'utility-science-pack', count = need}
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
  -- 03:43 윤활유 0 -> 전기엔진 정지 -> 프레임 정지. 정유 (23.5,11.5) 가 basic 으로 바뀌어 중유가 안 나온다 (관은 advanced 그대로 남아 있음).
  -- 윤활유 < 30 이면 advanced 4 분 (그동안 중유 -> 윤활유), 그 뒤 basic 6 분 (가스 우선) 을 반복.
  local R = s.find_entities_filtered{name = 'oil-refinery', position = {23.5, 11.5}, radius = 1}[1]
  if R and EE then
    local lub = 0 for i = 1, #EE.fluidbox do local f = EE.fluidbox[i] if f and f.name == 'lubricant' then lub = lub + f.amount end end
    local rec = R.get_recipe() and R.get_recipe().name or '-'
    o.lub = math.floor(lub)
    o.rec = rec  -- 전환은 파이썬 쪽 (시간 창: advanced 4 분 -> basic 6 분, 경유 적체로 advanced 가 바로 full_output 이 되므로)
  end
  return o end)()"""


SET_REF = """(function() local R = game.surfaces[1].find_entities_filtered{name = 'oil-refinery', position = {23.5, 11.5}, radius = 1}[1]
  if R then R.set_recipe('%s') end return {ok = R and 1 or 0} end)()"""
ADV_SEC, BASIC_SEC = 240, 360


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    since = 0.0  # 정유 레시피를 마지막으로 바꾼 시각
    while True:
        try:
            c = ai.lua(CHAIN)
            now = time.time()
            if c.get("rec") == "advanced-oil-processing" and now - since >= ADV_SEC:
                ai.lua(SET_REF % "basic-oil-processing"); c["refinery"] = "basic"; since = now
            elif c.get("rec") == "basic-oil-processing" and c.get("lub", 999) < 30 and now - since >= BASIC_SEC:
                ai.lua(SET_REF % "advanced-oil-processing"); c["refinery"] = "advanced"; since = now
            c.pop("rec", None)
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

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
  -- 09-29 09:35 연구소 16 대 전부 missing: x=-80 열은 노랑만 (파랑 0), x=-74 열은 파랑만 (노랑 0) -> 노랑을 파랑 있는 연구소로 모은다
  local labs = s.find_entities_filtered{type = 'lab', force = 'player'}
  local has, lacks = {}, {}
  for _, l in pairs(labs) do local inv = l.get_inventory(defines.inventory.lab_input)
    if inv.get_item_count('chemical-science-pack') > 0 then has[#has + 1] = inv elseif inv.get_item_count('utility-science-pack') > 0 then lacks[#lacks + 1] = inv end end
  if #has > 0 then
    for _, a in pairs(lacks) do for _, b in pairs(has) do
      local k = math.min(a.get_item_count('utility-science-pack'), 5 - b.get_item_count('utility-science-pack'))
      if k > 0 then k = b.insert{name = 'utility-science-pack', count = k} a.remove{name = 'utility-science-pack', count = k} o.regroup = (o.regroup or 0) + k end
    end end
    labs = {} for _, l in pairs(s.find_entities_filtered{type = 'lab', force = 'player'}) do
      if l.get_inventory(defines.inventory.lab_input).get_item_count('chemical-science-pack') > 0 then labs[#labs + 1] = l end end
  end
  for _, l in pairs(labs) do
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
  -- 04:05 노란팩 조립기 둘이 서로 다른 것 부족 (29.5: 처리장치 1, 12.5: 프레임 0) - 프레임 출력을 둘로 나누고 처리장치를 맞춘다
  local Y1, Y2 = ent({29.5, -8.5}), ent({12.5, 3.5})
  for _, Y in pairs({Y1, Y2}) do if Y then
    for _, F in pairs({F1, F2}) do if F then local need = 4 - inp(Y).get_item_count('flying-robot-frame')
      if need > 0 then local got = outp(F).remove{name = 'flying-robot-frame', count = need} if got > 0 then inp(Y).insert{name = 'flying-robot-frame', count = got} o.yframe = (o.yframe or 0) + got end end end end
  end end
  if Y1 and Y2 then
    for _, pair in pairs({{Y2, Y1}, {Y1, Y2}}) do local a, b = pair[1], pair[2]
      local ha, hb = inp(a).get_item_count('processing-unit'), inp(b).get_item_count('processing-unit')
      if ha >= 6 and hb < 4 then local k = math.floor((ha - hb) / 2) local got = inp(a).remove{name = 'processing-unit', count = k} if got > 0 then inp(b).insert{name = 'processing-unit', count = got} o.pu = got end end
    end
  end
  -- 03:43 윤활유 0 -> 전기엔진 정지 -> 프레임 정지. 정유 (23.5,11.5) 가 basic 으로 바뀌어 중유가 안 나온다 (관은 advanced 그대로 남아 있음).
  -- 윤활유 < 30 이면 advanced 4 분 (그동안 중유 -> 윤활유), 그 뒤 basic 6 분 (가스 우선) 을 반복.
  local R = s.find_entities_filtered{name = 'oil-refinery', position = {23.5, 11.5}, radius = 1}[1]
  if R and EE then
    local lub = 0 for i = 1, #EE.fluidbox do local f = EE.fluidbox[i] if f and f.name == 'lubricant' then lub = lub + f.amount end end
    local rec = R.get_recipe() and R.get_recipe().name or '-'
    o.lub = math.floor(lub)
    o.rec = rec  -- 전환은 파이썬 쪽 (09-28 refadv23: advanced 고정, 중유가 막혀 full_output 일 때만 basic 6 분)
    o.full = (R.status == defines.entity_status.full_output) and 1 or 0
  end
  return o end)()"""


SET_REF = """(function() local R = game.surfaces[1].find_entities_filtered{name = 'oil-refinery', position = {%s, %s}, radius = 1}[1]
  if R then R.set_recipe('%s') end return {ok = R and 1 or 0} end)()"""
# 09-28 northadv23: 북쪽 정유 둘도 advanced (관 재배치 + 분해 3 대). 같은 규칙 - full_output 이면 basic 6 분 뒤 다시 advanced.
# 북쪽은 이 스크립트가 basic 으로 내린 것만 되올린다 (since 에 없으면 손대지 않음 - 전환 전 basic 을 건드리지 않게).
REFS = [(23.5, 11.5), (-5.5, -50.5), (-13.5, -50.5)]
REFSTAT = """(function() local s = game.surfaces[1] local o = {}
  for i, p in pairs({%s}) do local R = s.find_entities_filtered{name = 'oil-refinery', position = p, radius = 1}[1]
    if R then o[i] = {rec = R.get_recipe() and R.get_recipe().name or '-', full = (R.status == defines.entity_status.full_output) and 1 or 0, gf = 0}
      for j = 1, #R.fluidbox do local fi = R.fluidbox.get_filter(j) local fl = R.fluidbox[j]
        if fi and fi.name == 'petroleum-gas' and fl and fl.amount + 55 > R.fluidbox.get_capacity(j) then o[i].gf = 1 end end end end
  return {r = o} end)()""" % ", ".join("{%s, %s}" % p for p in REFS)
# 09-28 로켓 계획 P0 (refadv23): 중유 -> 고체연료 공장 (19.5,12.5) 이 서서 advanced 를 고정한다 (윤활유도 advanced 에서만 나옴).
# 옛 교대 (advanced 4 분 / basic 6 분) 는 없앴다. 중유 · 경유가 막혀 정유가 full_output 이면 그때만 basic 6 분 뒤 다시 advanced.
BASIC_SEC = 360
# 09-28 18:4x northadv23: 가스가 늘자 서쪽 플라스틱 (-21.5,-34.5) 이 출력 100 가득으로 서 있다 (폭발 포탄 조립기 둘만 먹음),
# 망 플라스틱 0 (보라 · 저밀도 요청이 비어 있음). 출력 20 을 남기고 망으로 - 망 플라스틱 < 800 · 빈 칸 > 100 일 때만 (망 가득 방지).
PLDRAIN = """(function() local s = game.surfaces[1] local net = nil
  for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local P = s.find_entities_filtered{name = 'chemical-plant', position = {-21.5, -34.5}, radius = 0.5}[1]
  if not (P and net) then return {} end
  local out = P.get_output_inventory() local k = out.get_item_count('plastic-bar') - 20
  local free = 0 for _, c in pairs(net.storages) do free = free + c.get_inventory(defines.inventory.chest).count_empty_stacks() end
  k = math.min(k, 800 - net.get_item_count('plastic-bar'))
  if k <= 0 or free <= 100 then return {} end
  k = net.insert{name = 'plastic-bar', count = k} if k > 0 then out.remove{name = 'plastic-bar', count = k} end
  return {plastic_w = k} end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    since = {REFS[0]: 0.0}  # 정유별 레시피를 basic 으로 내린 시각 (남쪽은 처음부터 관리)
    while True:
        try:
            c = ai.lua(CHAIN)
            now = time.time()
            rs = ai.lua(REFSTAT).get("r") or {}
            rs = rs if isinstance(rs, dict) else {str(i + 1): v for i, v in enumerate(rs)}
            for i, pos in enumerate(REFS):
                st = rs.get(str(i + 1)) or rs.get(i + 1)
                if not st:
                    continue
                # 09-28 rocket23: 가스 출력 칸에 한 번 몫 (55) 이 안 들어가면 (가스 소비처가 참) basic 으로 내려도 똑같이 막힌다 - 경유가 안 나올 뿐.
                # 그때는 advanced 유지 (경유 -> 고체연료 · 로켓 연료 블록). 중유 · 경유가 막힌 때만 basic 6 분.
                if st.get("rec") == "advanced-oil-processing" and st.get("full") and not st.get("gf"):
                    ai.lua(SET_REF % (pos[0], pos[1], "basic-oil-processing")); c["refinery %s,%s" % pos] = "basic (full_output)"; since[pos] = now
                elif st.get("rec") != "advanced-oil-processing" and pos in since and now - since[pos] >= BASIC_SEC:
                    ai.lua(SET_REF % (pos[0], pos[1], "advanced-oil-processing")); c["refinery %s,%s" % pos] = "advanced"
                    if pos != REFS[0]:
                        del since[pos]
                    else:
                        since[pos] = now
            c.update(ai.lua(PLDRAIN) or {})
            c.pop("rec", None)
            c.pop("full", None)
            if c:
                print(time.strftime("%H:%M:%S"), "프레임 사슬", c, flush=True)
            r = ai.lua(LUA % ", ".join("{%s, %s}" % p for p in SRC))
            if r.get("moved") or r.get("regroup") or a.once:
                print(time.strftime("%H:%M:%S"), "노란팩 -> 연구소", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"yellowlab: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(60)


if __name__ == "__main__":
    raise SystemExit(main())

"""대포 2 호 - 구리 전초 고정 대포 (09-28 22:4x, 조정자: 이동 대포 1 대가 전선을 오가는 동안 구리 서쪽 (-67,-480) 둥지가 다시 퍼짐).

이동 대포 (artyaim23 · artykit23) 와 따로, 구리 통로 끝 옛 키트 링 (6.5,-329.5) 에 한 대를 고정한다.
대포 포탑은 자동 조준 (artillery_auto_targeting) 으로 사거리 224 안 산란기 · 땅벌레를 스스로 쏜다.
    (6.5,-329.5) -> 구리 서쪽 무리 (-67,-480) 167 · (-80,-500) 191 · 동쪽 재확장 자리 (152,-408) 165 · 전초 (61,-407) 95.
    둘레: 옛 키트 링 기관총 7 · 레이저 12 (전기 망 2) 가 남아 있다 -> 방어 먼저 조건은 이미 참.
    로봇망: 물류 범위 밖 (건설 범위만) -> 로보포트 (12,-322) + 전봇대 (10.5,-324.5) 로 망 2 에 붙인다 (R (56,-318) 과 체비셰프 44).

만들기 (make, 대포 조립기 TUR (-22.5,-61.5) = 강철 60 · 콘크리트 60 · 톱니 40 · 고급회로 20, 40 초):
  * 콘크리트: TUR 에 40 이 있다. 모자란 20 은 CONC 조립기2 (-26.5,-61.5) 에 벽돌 10 (망) + 철광석 2 (철 전초 벨트) -> 팔이 TUR 로.
    사일로 비축 콘크리트 (1,000) 는 건드리지 않는다.
  * 톱니: 망 톱니 20 뿐 (생산 = 소비) -> CONC 를 잠깐 톱니 레시피로 (철판 80, 망 5,000) -> 팔이 TUR 로 -> 콘크리트로 되돌림.
  * 강철: 망 0 (10 분 생산 300 < 소비 555) -> 사일로 자재 상자 (5.5,19.5) 366 에서 60 (사일로는 연구 뒤에만 짓는다).
  * 고급회로: 망 20.
  완성 포탑 -> 출력 팔 -> 철상자 (-19.5,-61.5) -> Lua 로 망 저장으로 (캐릭터 안 씀).
놓기 (place): state/arty_fixed.json 에 먼저 적고 (이동 키트가 유령 · 포탑을 잡아가지 않게) 대포 유령. 로봇이 짓는다.
포탄: artyaim23 가 1 분마다 고정 대포 탄 <= 10 이면 proxy (15 까지), 망 포탄 FLOOR (이동 대포 몫) 는 남긴다.

    python -u scripts/artyfix23.py status
    python -u scripts/artyfix23.py make [--loop]
    python -u scripts/artyfix23.py site         # 로보포트 · 전봇대 유령
    python -u scripts/artyfix23.py place        # 고정 등록 + 대포 유령
    python -u scripts/artyfix23.py check        # 자동 조준 · 탄 · 사거리 안 표적 · 전초 반경 150 적
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import artykit23  # noqa: E402

SPOT = [6.5, -329.5]
RP, RP_POLE = [12, -322], [10.5, -324.5]
TUR, CONC, TUR_BOX, STASH = (-22.5, -61.5), (-26.5, -61.5), (-19.5, -61.5), (5.5, 19.5)
IRON_OUTPOST = (-210, -269)
OUTPOST, WEST = (61, -407), (-67, -480)
LOG = os.path.join(HERE, "..", "state", "artyfix23.log")


def say(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


STATUS = """(function() local s = game.surfaces[1] local o = {}
  local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] end
  local t, c = asm({%s, %s}), asm({%s, %s})
  local ti = t.get_inventory(defines.inventory.assembling_machine_input)
  o.tur = {recipe = t.get_recipe() and t.get_recipe().name, done = t.products_finished, prog = t.crafting_progress, status = t.status,
           steel = ti.get_item_count('steel-plate'), concrete = ti.get_item_count('concrete'), gear = ti.get_item_count('iron-gear-wheel'),
           ac = ti.get_item_count('advanced-circuit'), out = t.get_inventory(defines.inventory.assembling_machine_output).get_item_count('artillery-turret')}
  o.conc = {recipe = c.get_recipe() and c.get_recipe().name, status = c.status, out = c.get_inventory(defines.inventory.assembling_machine_output).get_contents(),
            inp = c.get_inventory(defines.inventory.assembling_machine_input).get_contents()}
  local b = s.find_entities_filtered{name = 'iron-chest', position = {%s, %s}, radius = 0.4}[1] o.box = b and b.get_item_count('artillery-turret') or -1
  local n = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.net = {turret = n.get_item_count('artillery-turret'), shell = n.get_item_count('artillery-shell'), steel = n.get_item_count('steel-plate'),
           gear = n.get_item_count('iron-gear-wheel'), ac = n.get_item_count('advanced-circuit'), brick = n.get_item_count('stone-brick')}
  local st = s.find_entities_filtered{name = 'steel-chest', position = {%s, %s}, radius = 0.4}[1]
  o.stash = st and {steel = st.get_item_count('steel-plate'), concrete = st.get_item_count('concrete')} or {}
  return o end)()"""


def status(ai):
    return ai.lua(STATUS % (TUR + CONC + TUR_BOX + STASH))


# 한 단계씩 (idempotent). 반환 {step = ..}
MAKE = """(function() local s = game.surfaces[1] local o = {}
  local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] end
  local t, c = asm({%s, %s}), asm({%s, %s})
  local n = s.find_logistic_network_by_position({-24, -88}, 'player')
  local ti = t.get_inventory(defines.inventory.assembling_machine_input)
  local ci = c.get_inventory(defines.inventory.assembling_machine_input)
  local co = c.get_inventory(defines.inventory.assembling_machine_output)
  local DONE0 = %d
  local function flush(inv) for _, it in pairs(inv.get_contents()) do local k = n.insert{name = it.name, count = it.count} if k > 0 then inv.remove{name = it.name, count = k} end end end
  if t.products_finished > DONE0 or t.get_inventory(defines.inventory.assembling_machine_output).get_item_count('artillery-turret') > 0 then o.step = 'turret made'
  elseif t.crafting_progress > 0 then o.step = 'crafting' end  -- 22:45 제작 시작 뒤 재료를 또 넣어 둘째 몫 (강철 60) 을 채운 사고 - 제작 중엔 안 넣는다
  local have = {conc = ti.get_item_count('concrete') + (c.get_recipe() and c.get_recipe().name == 'concrete' and co.get_item_count('concrete') or 0),
                gear = ti.get_item_count('iron-gear-wheel') + co.get_item_count('iron-gear-wheel')}
  o.have = have
  -- 강철 (사일로 비축 상자에서) · 고급회로 (망) - TUR 입력 칸에 직접
  if not o.step then
    local st = s.find_entities_filtered{name = 'steel-chest', position = {%s, %s}, radius = 0.4}[1]
    local need = 60 - ti.get_item_count('steel-plate')
    if need > 0 and st then local got = st.remove_item{name = 'steel-plate', count = need} if got > 0 then local p = ti.insert{name = 'steel-plate', count = got} if p < got then st.insert{name = 'steel-plate', count = got - p} end o.steel = p end end
    need = 20 - ti.get_item_count('advanced-circuit')
    if need > 0 and n.get_item_count('advanced-circuit') >= need then local got = n.remove_item{name = 'advanced-circuit', count = need} if got > 0 then o.ac = ti.insert{name = 'advanced-circuit', count = got} end end
  end
  local r = c.get_recipe() and c.get_recipe().name
  if o.step then
    if r ~= 'concrete' and c.crafting_progress == 0 then flush(co) flush(ci) if co.is_empty() and ci.is_empty() then c.set_recipe('concrete') o.restore = 1 end end
  elseif have.conc < 60 then
    if r ~= 'concrete' then if co.is_empty() then c.set_recipe('concrete') o.set = 'concrete' end
    else
      local runs = math.ceil((60 - have.conc) / 10)
      local b = ci.get_item_count('stone-brick') local want_b = runs * 5 - b
      if want_b > 0 and n.get_item_count('stone-brick') > 300 then local got = n.remove_item{name = 'stone-brick', count = want_b} if got > 0 then o.brick = ci.insert{name = 'stone-brick', count = got} end end
      local ore = ci.get_item_count('iron-ore') local need = runs - ore
      for _, bt in pairs(s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 60}) do
        if need <= 0 then break end
        for i = 1, 2 do if need > 0 then local l = bt.get_transport_line(i) local k = l.get_item_count('iron-ore')
          if k > 0 then local got = l.remove_item{name = 'iron-ore', count = math.min(k, need)} if got > 0 then ci.insert{name = 'iron-ore', count = got} need = need - got o.ore = (o.ore or 0) + got end end end end
      end
    end
    o.step = 'concrete'
  elseif have.gear < 40 then
    if r ~= 'iron-gear-wheel' then
      if c.crafting_progress == 0 then flush(co) flush(ci) end  -- 남은 콘크리트 · 벽돌 · 철광석은 망으로
      if co.is_empty() and ci.is_empty() then c.set_recipe('iron-gear-wheel') o.set = 'gear' end
    else
      local want = (40 - have.gear) * 2 - ci.get_item_count('iron-plate')
      if want > 0 and n.get_item_count('iron-plate') > 1000 then local got = n.remove_item{name = 'iron-plate', count = want} if got > 0 then o.iron = ci.insert{name = 'iron-plate', count = got} end end
    end
    o.step = 'gear'
  else
    if r ~= 'concrete' and c.crafting_progress == 0 then flush(co) flush(ci) if co.is_empty() and ci.is_empty() then c.set_recipe('concrete') o.restore = 1 end end
    o.step = 'crafting'
  end
  o.conc_recipe = c.get_recipe() and c.get_recipe().name
  o.tur = {steel = ti.get_item_count('steel-plate'), concrete = ti.get_item_count('concrete'), gear = ti.get_item_count('iron-gear-wheel'), ac = ti.get_item_count('advanced-circuit'), prog = t.crafting_progress}
  -- 완성품: 철상자 -> 망 저장
  local b = s.find_entities_filtered{name = 'iron-chest', position = {%s, %s}, radius = 0.4}[1]
  if b and b.get_item_count('artillery-turret') > 0 then
    local k = b.get_item_count('artillery-turret') local p = n.insert{name = 'artillery-turret', count = k}
    if p > 0 then b.remove_item{name = 'artillery-turret', count = p} o.to_net = p end
  end
  o.net_turret = n.get_item_count('artillery-turret')
  return o end)()"""


def make(ai, done0):
    return ai.lua(MAKE % (TUR + CONC + (done0,) + STASH + IRON_OUTPOST + TUR_BOX))


SITE = """(function() local s = game.surfaces[1] local o = {}
  local r = s.find_entities_filtered{name = 'roboport', position = {%s, %s}, radius = 0.5}[1]
  o.rp = r and (r.logistic_network and r.logistic_network.network_id or -1) or 0
  local P = {%s, %s}
  local ln = s.find_logistic_network_by_position(P, 'player') o.spot_net = ln and ln.network_id or 0
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "make", "site", "place", "check"])
    ap.add_argument("--loop", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "status":
        print(json.dumps(status(ai), ensure_ascii=False))
    elif a.cmd == "make":
        done0 = status(ai)["tur"]["done"]
        say("대포 2 호 만들기 시작 - TUR 완성 수 %s" % done0)
        last = None
        while True:
            r = make(ai, done0)
            key = (r.get("step"), r.get("conc_recipe"), json.dumps(r.get("tur"), sort_keys=True))
            if key != last:
                say("make " + json.dumps(r, ensure_ascii=False))
                last = key
            if r.get("net_turret") and r.get("step") == "turret made" and r.get("conc_recipe") == "concrete":
                say("대포 2 호 망 저장 도착 (망 대포 %s)" % r.get("net_turret"))
                break
            if not a.loop:
                break
            time.sleep(5)
    elif a.cmd == "site":
        g = artykit23.ghosts(ai, artykit23._rows("roboport", [RP]) + artykit23._rows("small-electric-pole", [RP_POLE]))
        say("고정 대포 자리 로보포트 %s · 전봇대 %s 유령 %s · 상태 %s" % (RP, RP_POLE, g, ai.lua(SITE % tuple(RP + SPOT))))
    elif a.cmd == "place":
        artykit23.add_fixed(SPOT)  # 먼저 등록 - 이동 키트가 이 유령/포탑을 잡지 않게
        g = artykit23.ghosts(ai, artykit23._rows("artillery-turret", [SPOT]))
        say("고정 대포 등록 %s · 유령 %s" % (SPOT, g))
    elif a.cmd == "check":
        r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
          local t = s.find_entities_filtered{name = 'artillery-turret', position = {%s, %s}, radius = 1}[1]
          o.ghost = s.count_entities_filtered{ghost_name = 'artillery-turret', position = {%s, %s}, radius = 1}
          if t then o.auto = t.artillery_auto_targeting o.ammo = t.get_item_count('artillery-shell') o.hp = t.health
            o.kills = t.kills o.in_range = s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = t.position, radius = 224}
            local ln = s.find_logistic_network_by_position(t.position, 'player') o.net = ln and ln.network_id or 0 end
          o.west = s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = {%s, %s}, radius = 40}
          o.outpost150 = s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = {%s, %s}, radius = 150}
          o.outpost150_units = s.count_entities_filtered{force = 'enemy', type = 'unit', position = {%s, %s}, radius = 150}
          return o end)()""" % tuple(SPOT + SPOT + list(WEST) + list(OUTPOST) + list(OUTPOST)))
        say("check " + json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""탄창 생산 복구 (10:52).

기지 화로 정리 (p27 · col41) 뒤 탄창 조립기가 철판을 못 받아 10 분 생산 0, 망 탄창 0 · 관통탄 16.
대포 키트 링이 탄 10 미만 포탑 때문에 "방어선 대기" 에 멈춤. 망 철판은 1.6 만 (전초 현지 제련).
Lua 중계 (기존 아이템만 옮김, 망 재고 상한):
  * 망 철판 -> 탄창 조립기 입력 (40 까지, 망에 500 은 남김)
  * 탄창 조립기 출력 -> 관통탄 조립기 (10 까지) -> 나머지는 망 저장 (망 탄창 < CAP)
  * 관통탄 조립기 출력 -> 망 저장 (망 관통탄 < CAP)

    python -u scripts/ammofeed23.py [--once]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

FIRE = [(-87.5, -67.5), (-78.5, -49.5), (-46.5, -34.5)]
PIERCE = [(-63.5, -33.5)]
CAP = {"firearm-magazine": 800, "piercing-rounds-magazine": 400}

LUA = """(function() local s = game.surfaces[1] local o = {iron = 0, toP = 0, store = {}}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local function asm(p) return s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] end
  local function store(name, inv, cap)
    local k = math.min(inv.get_item_count(name), cap - net.get_item_count(name))
    if k <= 0 then return end
    local put = net.insert({name = name, count = k}, 'storage')
    if put > 0 then inv.remove{name = name, count = put} o.store[name] = (o.store[name] or 0) + put end
  end
  local P = {} for _, p in pairs({%(pierce)s}) do local a = asm(p) if a then P[#P + 1] = a end end
  for _, p in pairs({%(fire)s}) do local a = asm(p)
    if a and a.get_recipe() and a.get_recipe().name == 'firearm-magazine' then
      local inv = a.get_inventory(defines.inventory.assembling_machine_input)
      local k = math.min(40 - inv.get_item_count('iron-plate'), net.get_item_count('iron-plate') - 500)
      if k > 0 then k = net.remove_item{name = 'iron-plate', count = k} local put = inv.insert{name = 'iron-plate', count = k}
        if put < k then net.insert{name = 'iron-plate', count = k - put} end o.iron = o.iron + put end
      local out = a.get_inventory(defines.inventory.assembling_machine_output)
      for _, b in pairs(P) do local bi = b.get_inventory(defines.inventory.assembling_machine_input)
        local n = math.min(out.get_item_count('firearm-magazine'), 10 - bi.get_item_count('firearm-magazine'))
        if n > 0 then n = bi.insert{name = 'firearm-magazine', count = n} out.remove{name = 'firearm-magazine', count = n} o.toP = o.toP + n end end
      store('firearm-magazine', out, %(capF)d)
    end
  end
  for _, b in pairs(P) do store('piercing-rounds-magazine', b.get_inventory(defines.inventory.assembling_machine_output), %(capP)d) end
  -- 13:30 로봇 건설 범위 밖 원격 전초 기관총 (SW -128,80 · W -250,-65 · E 121,-22 · NE 208,-130) 은 배달 요청이 안 닿는다
  -- -> 탄 10 미만이면 망 탄창을 20 까지 직접 (망에 300 남김)
  o.remote = 0
  for _, g in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player'}) do
    local inv = g.get_inventory(defines.inventory.turret_ammo)
    if inv.get_item_count() < 10 and #s.find_logistic_networks_by_construction_area(g.position, 'player') == 0 then
      for _, nm in pairs({'piercing-rounds-magazine', 'firearm-magazine'}) do
        local k = math.min(20 - inv.get_item_count(), net.get_item_count(nm) - 300)
        if k > 0 then k = net.remove_item{name = nm, count = k} local put = inv.insert{name = nm, count = k}
          if put < k then net.insert{name = nm, count = k - put} end o.remote = o.remote + put end
      end
    end
  end
  o.fm = net.get_item_count('firearm-magazine') o.pr = net.get_item_count('piercing-rounds-magazine')
  return o end)()"""


def pts(ps):
    return ", ".join("{%s, %s}" % p for p in ps)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=30)
    a = ap.parse_args()
    ai = AIBridge()
    lua = LUA % {"fire": pts(FIRE), "pierce": pts(PIERCE), "capF": CAP["firearm-magazine"], "capP": CAP["piercing-rounds-magazine"]}
    while True:
        try:
            r = ai.lua(lua)
            if r.get("iron") or r.get("toP") or r.get("store") or r.get("remote") or a.once:
                print(time.strftime("%H:%M:%S"), "탄창", r, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"ammofeed: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

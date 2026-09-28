"""엔진 구역 철판 공급 (12:35).

기지 화로 정리 (현지 제련 전환) 뒤 엔진 구역 (x -30..36, y -40..0) 의 톱니 · 파이프 조립기 철판 0 ->
엔진 0 -> 전기엔진 0 -> 프레임 0 -> 노란팩 10 분 0. 옛 화로 벨트가 먹이던 곳이다. 망 철판은 ~1.1 만 (전초 현지 제련).
Lua 중계 (기존 아이템만 옮김): 구역 안에서 레시피에 철판이 들어가는 조립기마다 입력 철판을 FILL 까지 망에서 채운다.
망에 KEEP 은 남긴다. Guiltyring 이 last_user 인 조립기는 건드리지 않는다.

    python -u scripts/ironfeed23.py [--once]
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

AREA = ((-32, -40), (36, 0))
# 21:2x 사용자 스크린샷 "여기 처리 좀 해라": 초록팩 재료 블록 (x -62..-30, y -2..12 - 인서터 · 벨트 · 톱니 · 구리선 · 녹색회로)
# 인서터 (-51.5,7.5) · 벨트 (-45.5,7.5) · 톱니 (-41.5,7.5)(-36.5,3.5) 조립기 철 0. 둘레 벨트 고리에 강철 112 · 석탄 30 이 섞여 막힘.
# -> 이 구역도 철판 채우기 + 고리 벨트의 강철·석탄을 망으로 (망 상한 넘으면 그대로 둠)
AREA2 = ((-64, -4), (-28, 14))
PURGE = """(function() local s = game.surfaces[1] local o = {}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  local cap = {['steel-plate'] = 4000, ['coal'] = 3000}
  for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{%d, %d}, {%d, %d}}}) do
    if not (b.last_user and b.last_user.name == 'Guiltyring') then
      for li = 1, b.get_max_transport_line_index() do local L = b.get_transport_line(li)
        for name, c in pairs(cap) do local k = L.get_item_count(name)
          if k > 0 and net.get_item_count(name) < c then local put = net.insert({name = name, count = k}, 'storage')
            if put > 0 then L.remove_item{name = name, count = put} o[name] = (o[name] or 0) + put end end
        end
      end
    end
  end
  return o end)()"""
FILL, KEEP = 20, 2000

LUA = """(function() local s = game.surfaces[1] local o = {n = 0, iron = 0}
  local net = nil for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
  for _, a in pairs(s.find_entities_filtered{type = 'assembling-machine', force = 'player', area = {{%d, %d}, {%d, %d}}}) do
    local r = a.get_recipe()
    if r and not (a.last_user and a.last_user.name == 'Guiltyring') then
      -- 16:15 강철도 (엔진 조립기 강철 0 -> 파랑팩 0; 강철은 철 전초 증산으로 망에 2k+)
      for _, ing in pairs(r.ingredients) do local keep = ({['iron-plate'] = %d, ['steel-plate'] = 300})[ing.name]
        if keep then
        local inv = a.get_inventory(defines.inventory.assembling_machine_input)
        local k = math.min(%d - inv.get_item_count(ing.name), net.get_item_count(ing.name) - keep)
        if k > 0 then k = net.remove_item{name = ing.name, count = k} local put = inv.insert{name = ing.name, count = k}
          if put < k then net.insert{name = ing.name, count = k - put} end
          if put > 0 then o.n = o.n + 1 if ing.name == 'iron-plate' then o.iron = o.iron + put else o.steel = (o.steel or 0) + put end end end
      end end
    end
  end
  o.net = net.get_item_count('iron-plate')
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--every", type=float, default=20)
    a = ap.parse_args()
    ai = AIBridge()
    lua = LUA % (AREA[0][0], AREA[0][1], AREA[1][0], AREA[1][1], KEEP, FILL)
    lua2 = LUA % (AREA2[0][0], AREA2[0][1], AREA2[1][0], AREA2[1][1], KEEP, FILL)
    purge = PURGE % (AREA2[0][0], AREA2[0][1], AREA2[1][0], AREA2[1][1])
    while True:
        try:
            r = ai.lua(lua)
            if r.get("iron") or r.get("steel") or a.once:
                print(time.strftime("%H:%M:%S"), "엔진 구역 철판", r, flush=True)
            r2 = ai.lua(lua2)
            p = ai.lua(purge)
            if r2.get("iron") or r2.get("steel") or p or a.once:
                print(time.strftime("%H:%M:%S"), "초록 재료 블록 철판", r2, "· 고리 벨트 뺌", p, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"ironfeed: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

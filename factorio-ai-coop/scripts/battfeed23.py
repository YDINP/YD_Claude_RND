"""남는 배터리 -> 프레임 조립기 (사용자 스크린샷 2026-09-27: 상자 (28.5,-3.5) 배터리 407 방치).

상자에서 꺼내는 팔이 없어 (옛 넘침 팔 철거 뒤) 배터리가 놀고, 프레임 (25.5,-8.5) 은 배터리 부족으로 섰다.
상자를 로봇 해체로 걸어 배터리를 망 창고로 보내고, 5분마다 프레임 조립기에 배터리가 10 미만이면 로봇 배달 40 을 건다
(대량 로봇 요청은 건설 로봇을 묶는다 - inner23 사고 - 그래서 소량·주기형).

    python -u scripts/battfeed23.py --release   # 상자 해체 (한 번)
    python -u scripts/battfeed23.py             # 상주
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

FRAMES = [(25.5, -8.5), (8.5, 3.5)]
# 손 먹이 상자 보충 (위치, 아이템, 이 밑이면, 요청 수) - 사용자 (19:14): "철판이 없어서 황산을 못 만듦"
CHESTS = [((30.5, 3.5), "iron-plate", 20, 60),
          # 북서 전진 포트 탄 상자 - 사용자가 포탑을 13대로 늘림 (19:38), 벨트 급탄 없음
          ((-168.5, -87.5), "firearm-magazine", 120, 100),
          # 노랑 병목 = 처리장치 녹색회로 <- 회로 (9.5,-8.5) 철 (21:05). 망 철을 이 상자에 먼저
          ((9.5, -5.5), "iron-plate", 50, 100)]

# 로봇망 밖 출력 -> 노랑 조립기 직접 옮김 (Lua). LDS 상자 (7.5,-48.5)(10.5,-46.5) 는 로봇망 틈 (y -55..-27),
# 노랑 1호 (29.5,-8.5) 는 사람 금지 구역, 로보포트·물류 상자 재고 0 (20:37). 로보포트가 생기면 로봇 배달로 바꿀 것.
# (출처 상자·조립기 출력들, 아이템, 대상 조립기, 이 밑이면, 한 번에)
RELAYS = [([(7.5, -48.5), (10.5, -46.5)], "low-density-structure", [(29.5, -8.5), (12.5, 3.5)], 6, 30),
          ([(33.5, 1.5), (36.5, 1.5)], "processing-unit", [(29.5, -8.5), (12.5, 3.5)], 4, 20),
          # 석탄은 망 재고 7 (22:20) - 석탄 상자 (-1.5,-30.5) 1,600 에서 폭약(포탄)·수류탄(검정팩) 으로
          ([(-1.5, -30.5)], "coal", [(-24.5, -70.5), (-46.5, -26.5), (-46.5, -23.5), (-46.5, -20.5)], 10, 40),
          # 대포 포탄 집중 (사용자 22:33 "대포탄 수급 집중"): 폭발 포탄 강철·플라스틱은 망 재고 8 - 상자에서 직접
          ([(-73.5, -52.5)], "steel-plate", [(-26.5, -66.5)], 8, 40),
          ([(4.5, -44.5)], "plastic-bar", [(-26.5, -66.5)], 8, 40),
          ([(-16.5, -33.5)], "sulfur", [(-24.5, -70.5)], 10, 40),  # 폭약 황 (황 상자)
          # 레이더: 톱니·회로 조립기 결과에서 직접 (망 재고 0)
          ([(-55.5, 7.5), (-41.5, 7.5), (13.5, -8.5), (33.5, -4.5)], "iron-gear-wheel", [(-18.5, -66.5)], 5, 10),
          ([(-51.5, 3.5)], "electronic-circuit", [(-18.5, -66.5)], 5, 10)]

RELAY = """(function() local s = game.surfaces[1] local o = {}
  for _, r in pairs({%s}) do
    for _, d in pairs(r.dst) do
      local a = s.find_entities_filtered{type = 'assembling-machine', position = d, radius = 0.5}[1]
      if a then
        local inv = a.get_inventory(defines.inventory.assembling_machine_input)
        if inv.get_item_count(r.item) < r.lo then
          local want, got = r.n, 0
          for _, sp in pairs(r.src) do
            local e = s.find_entities_filtered{position = sp, radius = 0.5, type = {'container', 'assembling-machine'}}[1]
            if e and want > 0 then
              local si = e.type == 'container' and e.get_inventory(defines.inventory.chest) or e.get_inventory(defines.inventory.assembling_machine_output)
              local k = math.min(want, si.get_item_count(r.item))
              if k > 0 then k = inv.insert{name = r.item, count = k} if k > 0 then si.remove{name = r.item, count = k} end end
              want, got = want - k, got + k
            end
          end
          if got > 0 then o[#o + 1] = r.item .. ' ' .. got .. ' -> ' .. d[1] .. ',' .. d[2] end
        end
      end
    end
  end
  return o end)()"""

# 조립기 입력 로봇 보충 (위치, 아이템, 이 밑이면, 요청 수). 수류탄 벨트 x=-43.5 는 철이 조립기를 지나쳐 새어 나간다
# (21:00 손 운반 185 -> 수류탄 6 개) - 로봇이 조립기에 바로 넣는다
ASM = [((-46.5, -26.5), "iron-plate", 10, 30), ((-46.5, -23.5), "iron-plate", 10, 30), ((-46.5, -20.5), "iron-plate", 10, 30),
       # 21:36 검정팩 3대가 관통탄·석탄 부족 (수류탄 석탄 2, 관통탄 조립기 구리 4)
       ((-46.5, -26.5), "coal", 10, 40), ((-46.5, -23.5), "coal", 10, 40), ((-46.5, -20.5), "coal", 10, 40),
       ((-63.5, -33.5), "copper-plate", 10, 50), ((-63.5, -33.5), "firearm-magazine", 4, 20),  # 관통탄 = 일반탄 2 + 강철 1 + 구리 2
       ((-61.5, -25.5), "piercing-rounds-magazine", 1, 5), ((-57.5, -25.5), "piercing-rounds-magazine", 1, 5),
       ((-53.5, -25.5), "piercing-rounds-magazine", 1, 5),
       # 대포 포탄 줄: 폭발 포탄 강철 (22:25 강철 0 으로 포탄 정지)
       ((-26.5, -66.5), "steel-plate", 6, 20), ((-18.5, -66.5), "iron-plate", 10, 30)]

ASM_FEED = """(function() local s = game.surfaces[1] local o = {req = {}}
  for _, t in pairs({%s}) do
    local a = s.find_entities_filtered{type = 'assembling-machine', position = {t[1], t[2]}, radius = 0.5}[1]
    if a then
      local net = s.find_logistic_network_by_position(a.position, 'player')
      local have = a.get_inventory(defines.inventory.assembling_machine_input).get_item_count(t[3])
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} > 0
      if have < t[4] and not busy and net and net.get_item_count(t[3]) >= t[5] then
        local stack = 0 local r = a.get_recipe()
        if r then for i, ing in pairs(r.ingredients) do if ing.name == t[3] then stack = i - 1 end end end
        s.create_entity{name = 'item-request-proxy', position = a.position, force = 'player', target = a,
          modules = {{id = {name = t[3]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = stack, count = t[5]}}}}}}
        o.req[#o.req + 1] = t[3] .. '@' .. a.position.x .. ',' .. a.position.y
      end
    end
  end
  return o end)()"""

RELEASE = """(function() local s = game.surfaces[1]
  local c = s.find_entities_filtered{name = 'iron-chest', position = {28.5, -3.5}, radius = 0.5}[1]
  if not c then return {ok = 0} end
  local n = c.get_inventory(defines.inventory.chest).get_item_count('battery')
  c.order_deconstruction('player') return {ok = 1, battery = n} end)()"""

FEED = """(function() local s = game.surfaces[1] local o = {req = {}}
  for _, p in pairs({%s}) do
    local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1]
    if a then
      local net = s.find_logistic_network_by_position(a.position, 'player')
      local have = a.get_inventory(defines.inventory.assembling_machine_input).get_item_count('battery')
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} > 0
      if have < 10 and not busy and net and net.get_item_count('battery') >= 20 then
        s.create_entity{name = 'item-request-proxy', position = a.position, force = 'player', target = a,
          modules = {{id = {name = 'battery'}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = 1, count = 40}}}}}}
        o.req[#o.req + 1] = a.position.x .. ',' .. a.position.y
      end
    end
  end
  return o end)()"""

CHEST_FEED = """(function() local s = game.surfaces[1] local o = {req = {}}
  for _, t in pairs({%s}) do
    local c = s.find_entities_filtered{type = {'container', 'logistic-container'}, position = {t[1], t[2]}, radius = 0.5}[1]
    if c then
      local net = s.find_logistic_network_by_position(c.position, 'player')
      local have = c.get_inventory(defines.inventory.chest).get_item_count(t[3])
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = c.position, radius = 0.6} > 0
      if have < t[4] and not busy and net and net.get_item_count(t[3]) >= t[5] then
        s.create_entity{name = 'item-request-proxy', position = c.position, force = 'player', target = c,
          modules = {{id = {name = t[3]}, items = {in_inventory = {{inventory = defines.inventory.chest, stack = 0, count = t[5]}}}}}}
        o.req[#o.req + 1] = t[3] .. '@' .. c.position.x .. ',' .. c.position.y
      end
    end
  end
  return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", action="store_true")
    ap.add_argument("--every", type=float, default=60)
    a = ap.parse_args()
    ai = AIBridge()
    if a.release:
        print(ai.lua(RELEASE))
        return 0
    lua = FEED % ", ".join("{%s, %s}" % p for p in FRAMES)
    while True:
        try:
            r = ai.lua(lua)
            rl = ai.lua(RELAY % ", ".join("{src = {%s}, item = '%s', dst = {%s}, lo = %d, n = %d}" % (
                ", ".join("{%s, %s}" % q for q in src), it, ", ".join("{%s, %s}" % q for q in dst), lo, n) for src, it, dst, lo, n in RELAYS))
            rl = list(rl.values()) if isinstance(rl, dict) else (rl or [])
            if rl:
                print(time.strftime("%H:%M:%S"), "직접 옮김 ->", rl, flush=True)
            ra = ai.lua(ASM_FEED % ", ".join("{%s, %s, '%s', %d, %d}" % (p[0], p[1], it, lo, n) for p, it, lo, n in ASM))
            ra = ra.get("req") or []
            ra = list(ra.values()) if isinstance(ra, dict) else ra
            if ra:
                print(time.strftime("%H:%M:%S"), "조립기 보충 ->", ra, flush=True)
            rc = ai.lua(CHEST_FEED % ", ".join("{%s, %s, '%s', %d, %d}" % (p[0], p[1], it, lo, n) for p, it, lo, n in CHESTS))
            rq = rc.get("req") or []
            rq = list(rq.values()) if isinstance(rq, dict) else rq
            if rq:
                print(time.strftime("%H:%M:%S"), "상자 보충 ->", rq, flush=True)
            req = r.get("req") or []
            req = list(req.values()) if isinstance(req, dict) else req
            if req:
                print(time.strftime("%H:%M:%S"), "배터리 배달 40 ->", req, flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"battfeed: {type(e).__name__}: {e}"[:200], flush=True)
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

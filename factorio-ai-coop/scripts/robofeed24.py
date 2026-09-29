"""Run 24 P7: 로봇 줄 · 군수 (mall) · 전기 엔진 · 틀 · 황산 · 배터리 · 플라스틱 석탄 먹이 (relay FEEDS · P4) 를 건설 로봇 요청으로 바꾼다.

로봇이 망 공급 · 저장 상자에서 실제로 날라 조립기 입력칸에 넣는다 (Lua 는 요청 (item-request-proxy) 만 만든다 - 하나 ≤ 100 개).
중간재는 logi24 robo 의 결과 팔 → 공급 상자 (칸 제한) 로 망에 들어가고, 맞붙은 것은 팔 직결 (전선 4 → 회로 3, 관 · 톱니 → 엔진).
결과 상자가 차면 조립기가 서고, 입력이 LOW 밑일 때만 요청하므로 망을 비우지 않는다 (KEEP 은 망에 남길 몫).

    python scripts/robofeed24.py --run run24 --once
    python scripts/robofeed24.py --run run24 --every 30
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge, RconError  # noqa

IRON, CU, STEEL, CIRC = "iron-plate", "copper-plate", "steel-plate", "electronic-circuit"
# (x, y, 품목, 이 밑이면, 요청 수, 망에 이만큼은 남김)
FEED = [
    (-88.5, -6.5, IRON, 10, 30, 300),                     # 회로 3 (전선은 전선 4 에서 팔 직결)
    (-84.5, -6.5, CU, 10, 30, 300),                       # 전선 4
    (-84.5, -1.5, "engine-unit", 2, 4, 0), (-84.5, -1.5, CIRC, 4, 10, 0),          # 전기 엔진 (윤활유는 관)
    (-91.5, 5.5, "sulfur", 10, 20, 50), (-91.5, 5.5, IRON, 5, 10, 300),            # 황산 (물은 관)
    (-91.5, 1.5, IRON, 5, 10, 300), (-91.5, 1.5, CU, 5, 10, 300),                  # 배터리 (황산은 관)
    (-76.5, -10.5, IRON, 20, 40, 300),                    # 톱니 4
    (-84.5, -10.5, "iron-gear-wheel", 10, 20, 0), (-84.5, -10.5, IRON, 20, 40, 300), (-84.5, -10.5, CU, 10, 20, 300),   # 포탑 (mall)
    (-80.5, -10.5, "iron-gear-wheel", 4, 10, 0), (-80.5, -10.5, CIRC, 4, 10, 0),   # 수리팩 (mall)
    (-88.5, -10.5, "stone-brick", 10, 25, 100),           # 벽 (mall)
    (10.5, 8.5, STEEL, 2, 5, 50),                         # 엔진 (eng6 - 관은 eng5, 톱니는 adv6 에서 팔 직결)
    (6.5, 8.5, IRON, 10, 20, 300),                        # 관 (eng5 레시피 바꿈)
    (14.5, 8.5, IRON, 20, 40, 300),                       # 톱니 (adv6 레시피 바꿈)
    (-106.5, 13.5, "coal", 10, 20, 0), (-71.5, 11.5, "coal", 10, 20, 0),          # 플라스틱 화학 (P4 석탄)
]
for _x in (-80.5, -76.5):                                 # 틀 1 · 2
    FEED += [(_x, -6.5, "electric-engine-unit", 1, 2, 0), (_x, -6.5, "battery", 2, 4, 0), (_x, -6.5, STEEL, 2, 5, 50), (_x, -6.5, CIRC, 3, 6, 0)]
MAX_REQ = 30

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {req = {}, short = {}, miss = {}}
  local nreq = 0
  local function busy(e) return s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} > 0 end
  local function cnet_of(p)
    local best
    for _, n in pairs(s.find_logistic_networks_by_construction_area(p, f) or {}) do
      if not best or n.all_construction_robots > best.all_construction_robots then best = n end
    end
    return best
  end
  for _, q in pairs(A.feed) do
    local a = s.find_entities_filtered{type = 'assembling-machine', force = f, position = {q[1], q[2]}, radius = 0.6}[1]
    local net = a and cnet_of(a.position)
    local r = a and a.get_recipe()
    if not (a and net and r) then out.miss[#out.miss + 1] = q[3] .. ' @' .. q[1] .. ',' .. q[2]
    elseif nreq < A.max then
      local stack, k = nil, 0
      for _, ing in pairs(r.ingredients) do
        if ing.type == 'item' then
          if ing.name == q[3] then stack = k end
          k = k + 1
        end
      end
      local have = a.get_inventory(defines.inventory.assembling_machine_input).get_item_count(q[3])
      if stack and have < q[4] and not busy(a) then
        if net.get_item_count(q[3]) >= q[5] + q[6] then
          s.create_entity{name = 'item-request-proxy', position = a.position, force = f, target = a,
            modules = {{id = {name = q[3]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = stack, count = q[5]}}}}}}
          nreq = nreq + 1
          out.req[#out.req + 1] = q[3] .. ' ' .. q[5] .. ' @' .. q[1] .. ',' .. q[2]
        else out.short[#out.short + 1] = q[3] .. ' @' .. q[1] .. ',' .. q[2] end
      end
    end
  end
  return out
end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=30)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = None
    arg = json.dumps({"feed": FEED, "max": MAX_REQ})
    while True:
        try:
            ai = ai or AIBridge()
            r = ai.lua(LUA % arg)
            print(time.strftime("%H:%M:%S"), json.dumps({k: (list(v.values()) if isinstance(v, dict) else v) for k, v in r.items()}, ensure_ascii=False), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

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
    (-37.5, -4.5, "chemical-science-pack", 5, 20, 0),     # 서쪽 윗줄 동쪽 끝 연구소 (06:3x: 윗줄 파랑 0 - 빨강 레인에 섞인 파랑이 빨강 뒤에 막힘).
                                                          #   06:5x 아랫줄 (-35.5,8.5) 은 뺌: 벨트 끝이라 로봇 파랑 20 을 쌓으면 레인 머리의 파랑을 안 집어 빨강이 막힘 (아랫줄 빨강 0)
                                                                                  #   파랑은 파랑 벨트 x 20.5 → 팔 (19.5,6.5) → 공급 상자 (18.5,6.5, 칸 제한 1) 로 망에. 연구소 사이 팔이 줄 전체로
    (-35.5, 8.5, "chemical-science-pack", 4, 20, 0),      # P12 (07:2x): 서쪽 아랫줄 4 대 파랑 0 - 빨강 · 초록 벨트가 이제 순수 (빨강 레인에 파랑 없음) 이라 막힐 일 없음
    (7.5, 11.5, "advanced-circuit", 8, 30, 30), (7.5, 19.5, "advanced-circuit", 8, 30, 30), (1.5, 20.5, "advanced-circuit", 6, 20, 30),
                                                                                  # P12 (07:3x): M · PU 속도 모듈 둘 (1.05) → 고급을 30 개씩 (10 개면 30 초도 못 간다).
                                                                                  #   고급 출처가 망에 늘었다: 회로 블록 zone N A 4 → 공급 상자 (25.5,-9.5)
    (1.5, 20.5, "electronic-circuit", 60, 100, 100),      # 08:1x PU 조립기 3 (1.75) → 녹색 3.5/s: 60 밑이면 100      # P12: PU 녹색 (1.05 → 2.1/s) - 버스 B 녹색 (G1 · G2 ~2/s, A1 · A2 가 먼저 먹음) 이 모자람 → zone N 녹색 공급 상자 (52.5,-16.5) 에서
                                                                                  # 보라 M · EF · 노랑 PU 고급회로 (06:4x: 버스 고급 레인이 거의 빔 - A3 결과 팔이 녹색 레인에만 놓여 막힘 →
                                                                                  #   A3 → 팔 (13.5,18.5) → 공급 상자 (13.5,17.5) 로 망에, 망 저장 상자의 고급 ~370 도 씀)
    (13.5, 20.5, "plastic-bar", 6, 20, 100),              # P12 (07:1x): A3 고급 - 상자 cA3 플라스틱 0 (허브에 플라스틱이 없어 hauler 가 못 채움) → A3 서 있음
    (12.5, 15.5, "stone", 40, 100, 200),                  # P12 (08:1x): 레일 조립기 2 = 1.5 craft/s → 돌 1.5/s. 30 개씩이면 ~0.8/s 라 레일 · 보라가 돌에 묶임 → 100 개씩
                                                          #   (cR 돌은 hauler 가 허브에서 못 가져옴 - 허브 돌 ≤ HUB_KEEP 200, 돌은 망 저장 상자 (67.5,34.5) · (103.5,-14.5) 에)                   # P7 레일 R (06:1x: 허브 돌 200 = hauler HUB_KEEP 이라 cR 돌 0 → 보라 0. 돌은 망 저장 상자에 ~4.9k)
    (1.5, 10.5, "plastic-bar", 10, 30, 100), (-2.5, 15.5, "plastic-bar", 10, 30, 100),   # P9 LDS2 · P7 LDS (플라스틱은 허브가 아니라 망 - cL2 플라스틱 0 → 노랑 LDS 묶임)
    (-106.5, 13.5, "coal", 40, 100, 0), (-71.5, 11.5, "coal", 40, 100, 0),        # 플라스틱 화학 (P4 석탄) - P11 (06:0x): 석유가스 10.6 → 46/s 로
                                                                                  #   석탄 20 개씩 (석탄 밭 상자에서 ~235 칸 비행) 이 플라스틱을 묶음 → 100 개씩
]
for _x in (-80.5, -76.5):                                 # 틀 1 · 2
    FEED += [(_x, -6.5, "electric-engine-unit", 1, 2, 0), (_x, -6.5, "battery", 2, 4, 0), (_x, -6.5, STEEL, 2, 5, 50), (_x, -6.5, CIRC, 3, 6, 0)]
# 04:1x 코디네이터: 건설 로봇 조립기 (robot1) 다시 - 망 건설 로봇 < ROBOT_CAP 이고 노랑 조립기 (1.5,16.5) 입력 틀 ≥ 2 일 때만 (노랑이 틀 먼저)
#   결과는 팔 (-71.5,-4.5) → 로보포트 (-71,-2) 로 바로 (logi24 robo).
ROBOT_CAP = 404
YELLOW_ASM = (1.5, 16.5)
FEED += [(-72.5, -6.5, "flying-robot-frame", 1, 2, 0, "robot"), (-72.5, -6.5, CIRC, 2, 4, 0, "robot")]
# P12 (08:1x): 흩어진 보일러 넷 (예비, 연료 손 고리 없음) - 회로 블록 · 조립기 3 뒤 소비 22 MW > 증기 17.1 + 태양 4.7 → 한낮에도 축전 0 (계속 전압 모자람).
#   보일러 줄 (석탄 벨트) 은 10 대 전부 돎. 이 넷은 망 안이라 석탄을 로봇 요청으로 (연료 칸, 50 개 = 한 칸). 모자란 만큼만 태운다 (기관 8 = 7.2 MW 까지).
#   진짜 처방은 새 발전 (태양 유령 89 · 새 증기 단위) - 발전 담당 몫. 그게 서면 이 네 줄은 뺀다.
for _x, _y in ((-83.0, 28.5), (-75.0, 16.5), (-57.0, 14.5), (-42.0, 13.5)):
    FEED.append((_x, _y, "coal", 10, 50, 300, None, "fuel"))
# P12-5 (08:3x): zone N 강철로 12 (x 29..51, y -28) - 벨트에 석탄 레인이 없다 (FE 는 철 두 레인) → 연료 칸에 석탄 50 (90 kW = 37 분에 50).
for _x in range(29, 52, 2):
    FEED.append((float(_x), -28.0, "coal", 10, 50, 300, None, "fuel"))
# 09:5x 코디네이터: 과학 조립기 입력 굶음 (rg · bl 벨트의 톱니 · 고급회로 · 엔진 쪽이 철 부족) - 망 재고 (톱니 4.4k · 엔진 440 · 고급회로 640) 를 로봇으로 보충
for _x in (36.5, 40.5, 44.5, 48.5):
    FEED.append((_x, 12.5, "iron-gear-wheel", 5, 20, 200))            # 빨강
for _x in (32.5, 40.5):
    FEED.append((_x, 5.5, "inserter", 2, 5, 10))                      # 초록
FEED.append((48.5, 5.5, "transport-belt", 2, 5, 10))                  # 초록
for _x in (23.5, 27.5):
    for _y in (21.5, 28.5):
        FEED.append((_x, _y, "advanced-circuit", 3, 10, 50))          # 파랑
    for _y in (37.5, 44.5):
        FEED.append((_x, _y, "engine-unit", 2, 6, 20))                # 파랑
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
  -- 문 (gate): robot = 망 건설 로봇 < 상한 · 노랑 조립기 틀 ≥ 2
  local gate = {}
  do
    local y = s.find_entities_filtered{type = 'assembling-machine', force = f, position = A.yellow, radius = 0.6}[1]
    local fr = y and y.get_inventory(defines.inventory.assembling_machine_input).get_item_count('flying-robot-frame') or 0
    local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
    local robots = n and n.all_construction_robots or 0
    gate.robot = (fr >= 2) and (robots < A.robot_cap)
    out.gate = {yellow_frames = fr, robots = robots, robot = gate.robot}
  end
  for _, q in pairs(A.feed) do
    local a = (q[7] == nil or gate[q[7]]) and s.find_entities_filtered{type = {'assembling-machine', 'lab', 'boiler', 'furnace'}, force = f, position = {q[1], q[2]}, radius = 0.6}[1]
    if q[7] ~= nil and not gate[q[7]] then goto next_feed end
    local net = a and cnet_of(a.position)
    local lab = a and a.type == 'lab'
    local fuel = a and q[8] == 'fuel'
    local r = a and ((lab or fuel) and {ingredients = {}} or a.get_recipe())
    if lab then for i, n in pairs(a.prototype.lab_inputs) do r.ingredients[#r.ingredients + 1] = {type = 'item', name = n} end end
    if fuel then r.ingredients[1] = {type = 'item', name = q[3]} end
    local INV = lab and defines.inventory.lab_input or (fuel and defines.inventory.fuel) or defines.inventory.assembling_machine_input
    if not (a and net and r) then out.miss[#out.miss + 1] = q[3] .. ' @' .. q[1] .. ',' .. q[2]
    elseif nreq < A.max then
      local stack, k = nil, 0
      for _, ing in pairs(r.ingredients) do
        if ing.type == 'item' then
          if ing.name == q[3] then stack = k end
          k = k + 1
        end
      end
      local have = a.get_inventory(INV).get_item_count(q[3])
      if stack and have < q[4] and not busy(a) then
        if net.get_item_count(q[3]) >= q[5] + q[6] then
          s.create_entity{name = 'item-request-proxy', position = a.position, force = f, target = a,
            modules = {{id = {name = q[3]}, items = {in_inventory = {{inventory = INV, stack = stack, count = q[5]}}}}}}
          nreq = nreq + 1
          out.req[#out.req + 1] = q[3] .. ' ' .. q[5] .. ' @' .. q[1] .. ',' .. q[2]
        else out.short[#out.short + 1] = q[3] .. ' @' .. q[1] .. ',' .. q[2] end
      end
    end
    ::next_feed::
  end
  return out
end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=30)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = None
    arg = json.dumps({"feed": FEED, "max": MAX_REQ, "robot_cap": ROBOT_CAP, "yellow": YELLOW_ASM})
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

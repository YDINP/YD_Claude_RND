"""경유 크래킹 화학 공장 1대 - 23회차 (2026-09-27, 사용자 승인: 경유 탱크 (26.5,1.5) 25,000 적체 해소).

조사 (tick ~16.17M):
  · 황 공장 (26.5,6.5) 은 가스 부족이 아니라 full_output (황 50) - 황산 공장 (30.5,6.5) 이 황산 가득 (full_output) 이라 황을 안 먹는다.
    가스가 모자라 선 것은 플라스틱 공장 둘 (11.5,10.5)(16.5,10.5) (fluid_ingredient_shortage). 정유는 basic (원유도 모자람).
  · 가스 줄은 한 덩어리: 정유 가스 (25.5,8.5) -> 황 공장 입력 + 지하관 (24.5,8.5)->(18.5,8.5) -> 관 y=8.5 (x 10..17) -> 플라스틱 입력.
    그래서 크래킹 가스를 플라스틱 머리 관 y=8.5 에 바로 물리면 황 공장까지 같은 덩어리다.
  · 화학 공장 유체 칸: 1 = 첫 재료 (물), 2 = 경유, 3 = 가스 (황 · 황산 공장 실측으로 확인).

설계 (구역 x 15..23, 기존 관과 섞이지 않게 - 지하관으로 윤활유 관 x=21.5 을 건넌다):
  · 공장 (16.5,6.5) 북향: 입력 물 (15.5,4.5) · 경유 (17.5,4.5), 출력 가스 (15.5,8.5) = 가스 관 그대로 (칸 4 는 (17.5,8.5) 가스 관, 같은 유체).
  · 경유: 경유 관 (23.5,3.5) <- 지하관 (22.5,3.5)E ~ (18.5,3.5)W -> 관 (17.5,3.5) (17.5,4.5).
  · 물: 정유 물 관 (22.5,15.5) -> 관 (21.5,15.5) -> 지하관 (20.5,15.5)E ~ (15.5,15.5)W -> 관 (14.5,15.5)
        -> 지하관 (14.5,14.5)S ~ (14.5,5.5)N (가스 관 y=8.5 밑을 지난다) -> 관 (14.5,4.5) (15.5,4.5).
  · 전기: 소형 전봇대 (18.5,5.5) (<- (20.5,4.5)).
  · 사람 금지 구역 - 로봇 유령 건설만. 자재는 먹이 고리 주문 (alpha 관 · 지하관, bravo 화학 공장) -> 망 저장 상자 (12.5,-79.5).

    python -u scripts/crack23.py --survey      # 자리 · 유체 · 망 재고
    python -u scripts/crack23.py --order       # 자재 주문 (yellow23_orders.json)
    python -u scripts/crack23.py --place       # 유령 배치 (레시피 포함)
    python -u scripts/crack23.py --check       # 건설 · 유체 칸 · 상태
    python -u scripts/crack23.py --measure     # 10분 가스 · 황 · 플라스틱 (log)
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "crack23.log")
N, E, S, W = 0, 4, 8, 12
PLANT = (16.5, 6.5)
STORE = (12.5, -79.5)
GHOSTS = [
    ("chemical-plant", 16.5, 6.5, N),
    ("small-electric-pole", 18.5, 5.5, N),
    # 경유
    ("pipe-to-ground", 22.5, 3.5, E), ("pipe-to-ground", 18.5, 3.5, W),
    ("pipe", 17.5, 3.5, N), ("pipe", 17.5, 4.5, N),
    # 물
    ("pipe", 21.5, 15.5, N),
    ("pipe-to-ground", 20.5, 15.5, E), ("pipe-to-ground", 15.5, 15.5, W),
    ("pipe", 14.5, 15.5, N),
    ("pipe-to-ground", 14.5, 14.5, S), ("pipe-to-ground", 14.5, 5.5, N),
    ("pipe", 14.5, 4.5, N), ("pipe", 15.5, 4.5, N),
]
WATCH = [(26.5, 6.5), (30.5, 6.5), (16.5, 10.5), (11.5, 10.5), (23.5, 11.5), PLANT]


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def survey(ai):
    g = ", ".join("{'%s', %s, %s, %d}" % t for t in GHOSTS)
    return ai.lua("""(function() local s = game.surfaces[1] local o = {place = {}}
      for _, t in pairs({%s}) do
        local ok = s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
                                      build_check_type = defines.build_check_type.manual_ghost}
        if not ok then o.place[#o.place + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
      end
      local n = s.find_logistic_network_by_position({%s, %s}, 'player')
      o.net = {}
      for _, k in pairs({'chemical-plant', 'pipe', 'pipe-to-ground', 'small-electric-pole'}) do o.net[k] = n.get_item_count(k) end
      local tank = s.find_entities_filtered{name = 'storage-tank', position = {26.5, 1.5}, radius = 0.5}[1]
      o.light_oil = tank and tank.fluidbox[1] and math.floor(tank.fluidbox[1].amount) or 0
      return o end)()""" % (g, PLANT[0], PLANT[1]))


def order(ai):
    sys.path.insert(0, HERE)
    from yellow23 import put_order
    stand = ("walk_to", {"x": STORE[0], "y": STORE[1] + 2})
    put_order("alpha", [stand, ("insert", {"name": "pipe", "x": STORE[0], "y": STORE[1], "count": 10}),
                        ("insert", {"name": "pipe-to-ground", "x": STORE[0], "y": STORE[1], "count": 8})])
    put_order("bravo", [stand, ("insert", {"name": "chemical-plant", "x": STORE[0], "y": STORE[1], "count": 1})])
    say("주문: alpha 관 10 · 지하관 8, bravo 화학 공장 1 -> 저장 상자 (%s,%s)" % STORE)


def place(ai):
    g = ", ".join("{'%s', %s, %s, %d}" % t for t in GHOSTS)
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {made = 0, skip = {}}
      for _, t in pairs({%s}) do
        local have = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
                  or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
        if have then o.skip[#o.skip + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3]
        else
          local gh = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4],
                                     force = 'player', expires = false}
          if gh then
            o.made = o.made + 1
            if t[1] == 'chemical-plant' then local ok, e = pcall(function() gh.set_recipe('light-oil-cracking') end) o.recipe = ok or tostring(e) end
          else o.skip[#o.skip + 1] = 'FAIL ' .. t[1] .. '@' .. t[2] .. ',' .. t[3] end
        end
      end return o end)()""" % g)
    say("유령 배치 " + json.dumps(r, ensure_ascii=False))
    return r


def check(ai):
    return ai.lua("""(function() local s = game.surfaces[1] local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
      local o = {ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{13, 2}, {24, 17}}}, m = {}}
      for _, p in pairs({%s}) do
        local e = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.5}[1]
        if e then
          local f = {} for i = 1, #e.fluidbox do local fl = e.fluidbox[i]
            f[#f + 1] = (e.fluidbox.get_filter(i) and e.fluidbox.get_filter(i).name or '?') .. '=' .. (fl and (fl.name .. ':' .. math.floor(fl.amount)) or '-') end
          local r = e.get_recipe()
          o.m[#o.m + 1] = {x = p[1], y = p[2], rec = r and r.name, st = names[e.status], f = table.concat(f, ' '),
                           out = e.get_output_inventory().get_item_count()}
        end
      end
      local tank = s.find_entities_filtered{name = 'storage-tank', position = {26.5, 1.5}, radius = 0.5}[1]
      o.light_oil = tank and tank.fluidbox[1] and math.floor(tank.fluidbox[1].amount) or 0
      return o end)()""" % ", ".join("{%s, %s}" % p for p in WATCH))


def measure(ai):
    return ai.lua("""(function() local s = game.surfaces[1] local f = game.forces.player
      local fs, is = f.get_fluid_production_statistics(s), f.get_item_production_statistics(s)
      local p = defines.flow_precision_index.ten_minutes
      local function g(st, n, c) return math.floor(st.get_flow_count{name = n, category = c, precision_index = p, count = true}) end
      return {tick = game.tick, gas = g(fs, 'petroleum-gas', 'input'), gas_use = g(fs, 'petroleum-gas', 'output'),
              lo_use = g(fs, 'light-oil', 'output'), sulfur = g(is, 'sulfur', 'input'), plastic = g(is, 'plastic-bar', 'input')} end)()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    for k in ("survey", "order", "place", "check", "measure"):
        ap.add_argument("--" + k, action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.survey:
        say("조사 " + json.dumps(survey(ai), ensure_ascii=False))
    if a.order:
        order(ai)
    if a.place:
        place(ai)
    if a.check:
        say("점검 " + json.dumps(check(ai), ensure_ascii=False))
    if a.measure:
        say("측정 10분 " + json.dumps(measure(ai), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

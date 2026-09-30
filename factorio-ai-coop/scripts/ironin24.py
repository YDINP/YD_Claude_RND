"""Run 24: 망 철 입구 둘째 - 줄기 옆싣기 앞에서 막혀 있던 철 화로 줄 (y -43, x 82..100) 결과를 공급 상자로.

11:5x 실측 (unique_id 로 벨트 흐름을 셈):
  줄기 x 69.5 (y -39.5..-31.5) 28.8/s = 빠른 벨트 상한 (30/s) - 위쪽 -100..-44 도 n6~8 로 가득.
  → 화로 줄 (y -43) 결과 벨트 y -40.5 는 줄기에 옆싣기 (67.5,-39.5 → 69.5) 하는데 줄기가 차서 7 대 중 5 대 full_output.
  줄기 → 서쪽 가지 6.4/s · 허브 분배기 (70,-22.5) → 허브 가지 11.4 · 동쪽 (강철 기둥) 11.4.
  허브 가지 11.4 = 쇠 상자 (74.5,-15.5, 망 밖) 3.6 + 망 입구 빠른 팔 둘 (65.5 · 66.5) 7.7 → rg · 파랑 벨트 (60.5 남쪽) 0.
  망 철 수요 (요청 문턱이 안 막을 때) ≈ robofeed 1.3 + solarfeed 1.0 + 배터리 0.8 + 탄 1~4 ≈ 5~7/s.

처방: 결과 벨트 y -40.5 (줄기에 닿기 전) 에 빠른 팔 2 (74.5 · 75.5, -39.5, 북쪽 집기) → 공급 상자 2 (y -38.5, 칸 제한 10).
  화로 7 × 0.625 = 4.4/s 가 줄기가 막아 버리던 몫이라 줄기 · 허브 가지 흐름은 그대로이고 망에만 +4.4/s.
  상자가 차면 팔이 쉬고 결과는 예전처럼 줄기로 (잃는 것 없음). 망 입구 합 = 허브 ~9 + 여기 4.4 > 수요 5~7 → 허브 상자가 차면 rg 로 흐른다.
  빠른 팔 (손 2, 인서터 용량 +1) 벨트 집기 ~4.6/s × 2 = 9.2 > 4.4 → 줄 결과를 다 받을 수 있다.
  중형 전봇대 (73.5,-36.5) 전력 칸 안 · 망 9 물류 범위 안 (y -39.5 부터, -41.5 는 밖).

    python scripts/ironin24.py --build --who golf     # 사람이 손제작 · 손으로 짓기 (can_place manual 먼저)
    python scripts/ironin24.py --bar                  # 칸 제한 (건설 조작 - 아이템 이동 없음)
    python scripts/ironin24.py --throttle --who foxtrot  # 허브 입구 빠른 팔 66.5 걷기 (rg 몫)
    python scripts/ironin24.py --gate                 # 입구 팔 «물류망 연결» 조건: 허브 망 철 < 1200 · 줄 < 3000 (벨트 먼저)
    python scripts/ironin24.py --watch --every 60     # 상주 ironsplit: 허브 분배기 우선 (망 강철 < 2500 이면 끔)
    python scripts/ironin24.py --status
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge  # noqa
from orders import submit  # noqa

OWNER = "ironin24"
N = 0
INS = [(74.5, -39.5), (75.5, -39.5)]          # 빠른 팔 - 방향 N (북쪽 벨트 y -40.5 에서 집어 남쪽 상자에)
CHESTS = [(74.5, -38.5), (75.5, -38.5)]       # 공급 상자
BAR = 10                                       # 칸 10 = 철 1,000 씩


def placeable(ai):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, d in pairs(helpers.json_to_table('%s')) do
        local same = s.count_entities_filtered{position = {d[2], d[3]}, radius = 0.3, name = d[1]}
        out[#out+1] = d[1] .. '@' .. d[2] .. ',' .. d[3] .. (same > 0 and ' built' or
          (s.can_place_entity{name = d[1], position = {d[2], d[3]}, force = f, build_check_type = defines.build_check_type.manual} and ' ok' or ' BLOCKED'))
      end
      return out
    end)()""" % json.dumps([["fast-inserter", x, y] for x, y in INS] + [["passive-provider-chest", x, y] for x, y in CHESTS]))


def build(ai, who):
    pl = placeable(ai)
    pl = list(pl.values()) if isinstance(pl, dict) else pl
    print("자리", pl)
    if any("BLOCKED" in p for p in pl):
        print("막힌 자리 있음 - 안 지음")
        return
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=25)
    plan = [("walk_to", {"x": 59.5, "y": -13.0}), ("take", {"name": "steel-chest", "x": 59.5, "y": -14.5, "count": 2}),
            ("walk_to", {"x": 31.5, "y": -15.0}), ("take", {"name": "electronic-circuit", "x": 31.5, "y": -16.5, "count": 14}),
            ("walk_to", {"x": 25.5, "y": -8.0}), ("take", {"name": "advanced-circuit", "x": 25.5, "y": -9.5, "count": 2}),
            ("walk_to", {"x": 74.5, "y": -14.0}), ("take", {"name": "iron-plate", "x": 74.5, "y": -15.5, "count": 20}),
            ("craft", {"recipe": "fast-inserter", "count": 2, "wait": "block"}),
            ("craft", {"recipe": "passive-provider-chest", "count": 2, "wait": "block"}),
            ("walk_to", {"x": 77.0, "y": -37.5})]
    for x, y in CHESTS:
        plan.append(("build", {"name": "passive-provider-chest", "x": x, "y": y, "direction": 0}))
    for x, y in INS:
        plan.append(("build", {"name": "fast-inserter", "x": x, "y": y, "direction": N}))
    submit(ai, who, plan, strict=False)
    print(time.strftime("%X"), who, "단계", len(plan), flush=True)


def throttle(ai, who):
    """12:0x 허브 입구 줄이기: 로봇은 가까운 공급 상자 (허브 65.5 · 66.5) 부터 비워 허브 팔이 가지 철 11.4/s 를 다 먹고 rg 는 0.
    빠른 팔 66.5 를 걷어 허브 입구를 ~4.6/s 로 (65.5 하나) - 망은 줄 입구 (2.5~4.4/s) 로 채우고 rg 는 11.4 - 4.6 ≥ 6.8/s (11:4x 전 수준)."""
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=10)
    submit(ai, who, [("walk_to", {"x": 66.5, "y": -20.8}),
                     ("demolish", {"x": 66.5, "y": -18.5, "name": "fast-inserter", "search_radius": 0.3}),
                     ("walk_to", {"x": 70.5, "y": -11.0})], strict=False)


# 12:1x 우선순위 문 (회로선 없이 «물류망에 연결» 조건 - 건설 조작, 아이템 이동 없음, 필터는 안 건드림):
#   로봇은 가까운 허브 상자부터 비워 허브 팔이 가지 철을 다 먹는다 (rg 0). 망 철이 넉넉하면 허브 입구를 닫아 벨트 (rg · 파랑) 가 먼저.
#   허브 입구 (빠른 팔 65.5,-18.5 + 구리 상자 북쪽 팔 69.5 · 72.5 · 73.5,-16.5): 망 철 < HUB_GATE 일 때만.
#   줄 입구 (74.5 · 75.5,-39.5): 망 철 < ROW_GATE 일 때만 - 넘으면 줄 결과는 줄기로 (허브 가지 · rg 몫).
HUB_GATE, ROW_GATE = 1200, 3000
# 12:4x 허브 가지 17.6/s 를 입구 팔 넷이 다 먹어 rg 벨트 0 → 72.5 · 73.5 는 비상 (망 철 < 600) 만. 허브 입구 평소 = 65.5 · 69.5 (~9/s).
HUB_LOW = 600
GATES = [((65.5, -18.5), HUB_GATE), ((69.5, -16.5), HUB_GATE), ((72.5, -16.5), HUB_LOW), ((73.5, -16.5), HUB_LOW),
         ((74.5, -39.5), ROW_GATE), ((75.5, -39.5), ROW_GATE)]


def gate(ai):
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, g in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'inserter', position = g[1], radius = 0.3}[1]
        if e then
          local cb = e.get_or_create_control_behavior()
          cb.connect_to_logistic_network = true
          cb.logistic_condition = {first_signal = {type = 'item', name = 'iron-plate'}, comparator = '<', constant = g[2]}
          out[#out+1] = e.name .. '@' .. g[1][1] .. ',' .. g[1][2] .. ' iron<' .. g[2] .. ' net ' .. tostring(e.logistic_network and e.logistic_network.network_id)
        else out[#out+1] = g[1][1] .. ',' .. g[1][2] .. ' none' end
      end
      return out
    end)()""" % json.dumps([[list(p), c] for p, c in GATES]))


# 12:4x 허브 분배기 (70,-22.5, 남향) 출구 우선 = right (서쪽 x 69.5 = 허브 가지). 동쪽 가지 (강철 기둥 y -13.5, 12 대) 는
#   허브 쪽이 막힐 때만 받는다. 강철은 망에 6.2k 쌓여 있고 (10분 씀 ~1.8k) rg · 파랑 · 망은 철 0 → 철을 과학 쪽으로.
#   상주 `ironsplit` (--watch): 망 강철 < STEEL_LOW 이면 우선 끔 (50:50), > STEEL_HIGH 이면 다시 허브 우선.
SPLIT = (70.0, -22.5)
# 15:4x 탄 위기 (피어싱 망 0, 철 광석 10분 9.1k 뿐): 강철 기둥 몫 (철 10분 ~3.6k) 을 허브 · 탄으로. 망 강철 3.2k 는 피어싱 (0.5 강철) 몫에 넉넉
STEEL_LOW, STEEL_HIGH = 1200, 2000


def split(ai, want=None):
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local sp = s.find_entities_filtered{position = {%f, %f}, radius = 0.6, type = 'splitter'}[1]
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      local steel = n.get_item_count('steel-plate')
      local old = sp.splitter_output_priority
      local want = '%s'
      if want == 'auto' then
        if steel < %d then want = 'none' elseif steel > %d then want = 'right' else want = old end
      end
      sp.splitter_output_priority = want
      return {steel = steel, iron = n.get_item_count('iron-plate'), old = old, now = want}
    end)()""" % (*SPLIT, want or "auto", STEEL_LOW, STEEL_HIGH))


def bar(ai):
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local c = s.find_entities_filtered{name = 'passive-provider-chest', position = p, radius = 0.3}[1]
        if c then c.get_inventory(defines.inventory.chest).set_bar(%d + 1) out[#out+1] = p[1] .. ' bar %d' else out[#out+1] = p[1] .. ' none' end
      end
      return out
    end)()""" % (json.dumps([list(c) for c in CHESTS]), BAR, BAR))


def status(ai):
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {} for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {tick = game.tick, chests = {}, row = {}, ins = {}}
      local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
      out.net_iron = n.get_item_count('iron-plate')
      for _, p in pairs(helpers.json_to_table('%s')) do
        local c = s.find_entities_filtered{name = 'passive-provider-chest', position = p, radius = 0.3}[1]
        out.chests[#out.chests+1] = c and (p[1] .. ',' .. p[2] .. ' ' .. c.get_item_count('iron-plate')) or 'none'
      end
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = 'fast-inserter', position = p, radius = 0.3}[1]
        out.ins[#out.ins+1] = e and (st[e.status] or '?') or 'none'
      end
      for _, e in pairs(s.find_entities_filtered{area = {{80, -44}, {101, -42}}, name = 'steel-furnace'}) do
        local k = st[e.status] or '?' out.row[k] = (out.row[k] or 0) + 1
      end
      local rg = {}
      for _, a in pairs(s.find_entities_filtered{area = {{22, 0}, {62, 50}}, type = 'assembling-machine'}) do
        local k = st[a.status] or '?' rg[k] = (rg[k] or 0) + 1
      end
      out.rg = rg
      local ps = f.get_item_production_statistics(s)
      local sci = {}
      for k, nm in pairs({red = 'automation-science-pack', green = 'logistic-science-pack', blue = 'chemical-science-pack',
                          purple = 'production-science-pack', yellow = 'utility-science-pack', iron = 'iron-plate', gear = 'iron-gear-wheel'}) do
        sci[k] = math.floor(ps.get_flow_count{name = nm, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true})
      end
      out.p10 = sci
      return out
    end)()""" % (json.dumps([list(c) for c in CHESTS]), json.dumps([list(c) for c in INS])))
    print(json.dumps(r, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--who", default="golf")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--bar", action="store_true")
    ap.add_argument("--throttle", action="store_true", help="허브 입구 빠른 팔 66.5 걷기")
    ap.add_argument("--gate", action="store_true", help="입구 팔에 망 철 조건 (허브 < 1200 · 줄 < 3000)")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--watch", action="store_true", help="분배기 우선 자동 (망 강철 기준) - 상주")
    ap.add_argument("--every", type=int, default=60)
    a = ap.parse_args()
    if a.watch:
        from client import RconError
        ai = None
        while True:
            try:
                ai = ai or AIBridge()
                print(time.strftime("%H:%M:%S"), json.dumps(split(ai), ensure_ascii=False), flush=True)
            except (RconError, OSError) as e:
                print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
                ai = None
            time.sleep(a.every)
    ai = AIBridge()
    if a.build:
        build(ai, a.who)
    if a.bar:
        print(bar(ai))
    if a.throttle:
        throttle(ai, a.who)
    if a.gate:
        print(gate(ai))
    if a.status:
        status(ai)


if __name__ == "__main__":
    main()

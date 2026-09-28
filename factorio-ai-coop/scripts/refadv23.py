"""정유 (23.5,11.5) advanced 고정 + 중유 배수 (로켓 계획 P0, 09-28).

조사 (tick ~20.75M):
  * 정유 3 대 모두 basic. 북쪽 두 대 (-13.5,-50.5)(-5.5,-50.5) (남향) 는 출구 줄 y=-47.5 관 하나가 x -19.5..2.5 를
    다 덮는다 - 중유 · 경유 · 가스 출구가 같은 관이라 advanced 로 바꾸면 섞이거나 full_output. 관을 다시 짜야 해서 이번엔 basic 유지.
  * 남쪽 정유 (23.5,11.5) 는 advanced 관이 남아 있다: 중유 (21.5,8.5) -> 윤활유 공장 (20.5,6.5), 경유 (23.5,8.5) -> 경유 관 x=23.5
    -> 탱크 (26.5,1.5) · 경유 분해 (16.5,6.5), 가스 (25.5,8.5). 물 (22.5,14.5) 있음.
    그래서 yellowlab23 이 advanced 4 분 / basic 6 분을 번갈아 돌렸다 - 중유를 윤활유만 먹어서 advanced 가 곧 막히기 때문.
  * 중유 관 (21.5,8.5) 은 사방이 막혀 있다 (윤활유 공장 · 정유 · 전봇대 (20.5,8.5) · 가스 지하관 위 칸). 중유 분해의 경유 출구를
    경유 줄로 되돌릴 길이 없다 -> 중유는 **고체연료** (solid-fuel-from-heavy-oil, 20 -> 1) 로 뺀다: 출력이 아이템이라 관이 필요 없고,
    고체연료는 P6 로켓 연료 재료 (로켓 연료 1 = 고체연료 10).

설계 (delta-trap 구역 - 로봇 유령만):
  * 전봇대 (20.5,8.5) (18.5,10.5) 해체 - 둘 다 다른 전봇대로 이어져 있어 끊기는 것 없음 (실측: 정유 <- (26.5,8.5), 윤활유 <- (20.5,4.5),
    플라스틱 <- 중형 (13.5,11.5)). 새 소형 전봇대 (18.5,14.5) (<- 중형 (13.5,11.5) 5.8 칸).
  * 중유 관 (20.5,8.5) (19.5,8.5) (19.5,9.5) (19.5,10.5) (18.5,10.5) -> 화학 공장 (19.5,12.5) 북향 (입력 1 = (18.5,10.5)).
  * 팔 (19.5,14.5) 남향 -> 철 상자 (19.5,15.5) (1,600 개 = 최대 속도 ~107 분).
  * 상자가 차면 공장이 서고 중유가 차서 정유가 full_output -> yellowlab23 이 그때만 basic 6 분으로 돌린다 (평소엔 advanced 고정).

    python -u scripts/refadv23.py survey     # 자리 · 망 재고
    python -u scripts/refadv23.py decon      # 전봇대 2 해체 표시 + 새 전봇대 유령
    python -u scripts/refadv23.py place      # 관 · 공장 · 팔 · 상자 유령 (전봇대가 빠진 뒤)
    python -u scripts/refadv23.py check      # 상태
    python -u scripts/refadv23.py measure    # 10 분 석유가스 · 경유 · 중유 · 플라스틱 · 황 · 고체연료 · 원유
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "refadv23.log")
N, E, S, W = 0, 4, 8, 12
REF = (23.5, 11.5)
PLANT = (19.5, 12.5)
RECIPE = "solid-fuel-from-heavy-oil"
DECON = [(20.5, 8.5), (18.5, 10.5)]
POLE = ("small-electric-pole", 18.5, 14.5, N)
GHOSTS = [
    ("pipe", 20.5, 8.5, N), ("pipe", 19.5, 8.5, N), ("pipe", 19.5, 9.5, N), ("pipe", 19.5, 10.5, N), ("pipe", 18.5, 10.5, N),
    ("chemical-plant", PLANT[0], PLANT[1], N),
    ("inserter", 19.5, 14.5, N),     # d0 = 북에서 집어 남에 놓음 (실측 (16.5,12.5))
    ("iron-chest", 19.5, 15.5, N),
]


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def lua_list(ts):
    return ", ".join("{'%s', %s, %s, %d}" % t for t in ts)


def survey(ai):
    return ai.lua("""(function() local s = game.surfaces[1] local o = {place = {}}
      for _, t in pairs({%s}) do
        local ok = s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
                                      build_check_type = defines.build_check_type.manual_ghost}
        if not ok then o.place[#o.place + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
      end
      local n = s.find_logistic_network_by_position({14, -2}, 'player')
      o.net = {} for _, k in pairs({'chemical-plant', 'pipe', 'inserter', 'iron-chest', 'small-electric-pole'}) do o.net[k] = n.get_item_count(k) end
      return o end)()""" % lua_list(GHOSTS + [POLE]))


def decon(ai):
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {marked = 0}
      for _, p in pairs({%s}) do
        local e = s.find_entities_filtered{name = 'small-electric-pole', position = p, radius = 0.3}[1]
        if e and not e.to_be_deconstructed() then e.order_deconstruction('player') o.marked = o.marked + 1 end
      end
      local t = {'%s', %s, %s}
      if not s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
         and not s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] then
        o.pole = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, force = 'player', expires = false} and 1 or 0
      end
      return o end)()""" % (", ".join("{%s, %s}" % p for p in DECON), POLE[0], POLE[1], POLE[2]))
    say("해체 표시 " + json.dumps(r, ensure_ascii=False))
    return r


def place(ai):
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {made = 0, skip = {}}
      for _, p in pairs({%s}) do
        if s.find_entities_filtered{name = 'small-electric-pole', position = p, radius = 0.3}[1] then return {wait = 'pole ' .. p[1] .. ',' .. p[2]} end
      end
      for _, t in pairs({%s}) do
        local have = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
                  or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
        if have then o.skip[#o.skip + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3]
        else
          local gh = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4],
                                     force = 'player', expires = false}
          if gh then
            o.made = o.made + 1
            if t[1] == 'chemical-plant' then local ok, e = pcall(function() gh.set_recipe('%s') end) o.recipe = ok or tostring(e) end
          else o.skip[#o.skip + 1] = 'FAIL ' .. t[1] .. '@' .. t[2] .. ',' .. t[3] end
        end
      end return o end)()""" % (", ".join("{%s, %s}" % p for p in DECON), lua_list(GHOSTS), RECIPE))
    say("유령 배치 " + json.dumps(r, ensure_ascii=False))
    return r


def check(ai):
    r = ai.lua("""(function() local s = game.surfaces[1] local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
      local o = {ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{17, 7}, {22, 17}}}, m = {}}
      for _, p in pairs({{%s, %s}, {%s, %s}, {20.5, 6.5}, {16.5, 6.5}}) do
        local e = s.find_entities_filtered{type = {'assembling-machine', 'furnace'}, position = p, radius = 0.5}[1]
        if e then
          local f = {} for i = 1, #e.fluidbox do local fl = e.fluidbox[i] f[#f + 1] = fl and (fl.name .. ':' .. math.floor(fl.amount)) or '-' end
          local r = e.get_recipe()
          o.m[#o.m + 1] = {x = p[1], y = p[2], rec = r and r.name, st = names[e.status], f = table.concat(f, ' '),
                           out = e.get_output_inventory() and e.get_output_inventory().get_item_count() or 0}
        end
      end
      local c = s.find_entities_filtered{name = 'iron-chest', position = {19.5, 15.5}, radius = 0.3}[1]
      o.chest = c and c.get_item_count('solid-fuel') or -1
      return o end)()""" % (REF[0], REF[1], PLANT[0], PLANT[1]))
    r["m"] = list(r["m"].values()) if isinstance(r.get("m"), dict) else r.get("m")
    return r


def measure(ai):
    r = ai.lua("""(function() local s = game.surfaces[1] local f = game.forces.player
      local fs, is = f.get_fluid_production_statistics(s), f.get_item_production_statistics(s)
      local p = defines.flow_precision_index.ten_minutes
      local function g(st, n, c) return math.floor(st.get_flow_count{name = n, category = c, precision_index = p, count = true}) end
      return {tick = game.tick, crude = g(fs, 'crude-oil', 'input'), gas = g(fs, 'petroleum-gas', 'input'), gas_use = g(fs, 'petroleum-gas', 'output'),
              light = g(fs, 'light-oil', 'input'), heavy = g(fs, 'heavy-oil', 'input'), lub = g(fs, 'lubricant', 'input'),
              plastic = g(is, 'plastic-bar', 'input'), sulfur = g(is, 'sulfur', 'input'), solid = g(is, 'solid-fuel', 'input'),
              shell = g(is, 'artillery-shell', 'input')} end)()""")
    say("측정 10분 " + json.dumps(r, ensure_ascii=False))
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["survey", "decon", "place", "check", "measure"])
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "survey":
        say("조사 " + json.dumps(survey(ai), ensure_ascii=False))
    elif a.cmd == "decon":
        decon(ai)
    elif a.cmd == "place":
        place(ai)
    elif a.cmd == "check":
        say("점검 " + json.dumps(check(ai), ensure_ascii=False))
    else:
        measure(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

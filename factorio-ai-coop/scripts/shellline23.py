"""대포 포탄 증산 - 23회차 (사용자 22:33 "대포탄 수급 집중").

포탄 1발 = 폭발 포탄 4 (조립기1 8초 x4 = 64초) + 폭약 8 + 레이더 1. 병목: 폭발 포탄 1대 · 레이더 회로(망 재고 0) · 황 (망 6, 화학 공장 정지).

추가 (로봇 유령, 기존 건물 무변경):
  ECS2  조립기1 (-21.5,-71.5) explosive-cannon-shell -> 긴 팔 (-22.5,-68.5) N (집기 -70.5 = ECS2, 놓기 -66.5 = SHELL)
        폭약은 화학 공장과 붙어 팔 자리가 없어 battfeed23 RELAY (화학 공장 출력 -> ECS2), 강철·플라스틱도 RELAY.
  CIRC  조립기1 (-18.5,-70.5) electronic-circuit -> 팔 (-18.5,-68.5) N -> RADAR (-18.5,-66.5)
  CABLE 조립기1 (-14.5,-70.5) copper-cable      -> 팔 (-16.5,-70.5) E -> CIRC
  GEAR  조립기1 (-14.5,-66.5) iron-gear-wheel   -> 팔 (-16.5,-66.5) E -> RADAR
  전기  작은 전봇대 (-16.5,-68.5) <- (-20.5,-68.5)
  원료 철·구리는 battfeed23 ASM 로봇 proxy.
망 조립기1 재고 2 뿐 (AM2/3 0) -> hotel 이 AM1 3 손제작 + 가진 1 = 4 를 저장 상자에 넣고, 회로·톱니는 레이더에 직접.

    python -u scripts/shellline23.py --place      # 유령
    python -u scripts/shellline23.py --order      # hotel 주문
    python -u scripts/shellline23.py --check      # 건설·상태·포탄 누계 (tick)
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

LOG = os.path.join(HERE, "..", "state", "shellline23.log")
N, E, S, W = 0, 4, 8, 12
STORE = (-60.5, -33.5)
RADAR = (-18.5, -66.5)
SHELL = (-22.5, -66.5)

M = {  # 이름: (기계, x, y, 레시피)
    "ECS2": ("assembling-machine-1", -21.5, -71.5, "explosive-cannon-shell"),
    "CIRC": ("assembling-machine-1", -18.5, -70.5, "electronic-circuit"),
    "CABLE": ("assembling-machine-1", -14.5, -70.5, "copper-cable"),
    "GEAR": ("assembling-machine-1", -14.5, -66.5, "iron-gear-wheel"),
}
# 팔: 방향 = 집는 쪽 (artyprep23 과 같은 규약)
GHOSTS = [(m[0], m[1], m[2], N) for m in M.values()] + [
    ("long-handed-inserter", -22.5, -68.5, N),
    ("inserter", -18.5, -68.5, N), ("inserter", -16.5, -70.5, E), ("inserter", -16.5, -66.5, E),
    ("small-electric-pole", -16.5, -68.5, N),
]


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def place(ai):
    rows = ", ".join("{'%s', %s, %s, %d, '%s'}" % (g[0], g[1], g[2], g[3], next(
        (m[3] for m in M.values() if (m[1], m[2]) == (g[1], g[2])), "")) for g in GHOSTS)
    r = ai.lua("""(function() local s = game.surfaces[1] local o = {made = 0, skip = {}, rec = {}}
      for _, t in pairs({%s}) do
        local have = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
                  or s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
        if have then o.skip[#o.skip + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3]
        elseif not s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player',
                                      build_check_type = defines.build_check_type.manual_ghost} then
          o.skip[#o.skip + 1] = 'BLOCKED ' .. t[1] .. '@' .. t[2] .. ',' .. t[3]
        else
          local gh = s.create_entity{name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4],
                                     force = 'player', expires = false}
          if gh then
            o.made = o.made + 1
            if t[5] ~= '' then local ok, e = pcall(function() gh.set_recipe(t[5]) end) o.rec[#o.rec + 1] = t[5] .. ':' .. (ok and 'ok' or tostring(e)) end
          else o.skip[#o.skip + 1] = 'FAIL ' .. t[1] .. '@' .. t[2] .. ',' .. t[3] end
        end
      end return o end)()""" % rows)
    say("유령 " + json.dumps(r, ensure_ascii=False))
    return r


def order(ai):
    from yellow23 import put_order
    try:
        with open(os.path.join(HERE, "..", "state", "yellow23_orders.json"), encoding="utf-8") as fh:
            if "hotel" in json.load(fh):
                say("hotel 주문 대기 중 - 건너뜀")
                return
    except (OSError, ValueError):
        pass
    put_order("hotel", [
        ("craft", {"recipe": "assembling-machine-1", "count": 3}),
        ("walk_to", {"x": STORE[0], "y": STORE[1] + 2}),
        ("insert", {"name": "assembling-machine-1", "x": STORE[0], "y": STORE[1], "count": 4}),
        ("walk_to", {"x": RADAR[0] + 3, "y": RADAR[1] + 3}),
        ("insert", {"name": "electronic-circuit", "x": RADAR[0], "y": RADAR[1], "count": 60}),
        ("insert", {"name": "iron-gear-wheel", "x": RADAR[0], "y": RADAR[1], "count": 30}),
    ])
    say("주문 hotel: AM1 3 손제작 -> 저장 상자 %s 4대, 레이더에 회로 60 · 톱니 30" % (STORE,))


def check(ai):
    ms = ", ".join("{'%s', %s, %s}" % (k, x, y) for k, (x, y) in
                   list({k: (m[1], m[2]) for k, m in M.items()}.items()) +
                   [("SHELL", SHELL), ("RADAR", RADAR), ("ECS", (-26.5, -66.5)), ("P", (-24.5, -70.5))])
    return ai.lua("""(function() local s = game.surfaces[1]
      local names = {} for k, v in pairs(defines.entity_status) do names[v] = k end
      local o = {tick = game.tick, ghosts = s.count_entities_filtered{type = 'entity-ghost', area = {{-24, -74}, {-12, -64}}}, m = {}}
      for _, t in pairs({%s}) do
        local e = s.find_entities_filtered{type = 'assembling-machine', position = {t[2], t[3]}, radius = 0.5}[1]
        if e then
          local inp = {} for _, it in pairs(e.get_inventory(defines.inventory.assembling_machine_input).get_contents()) do inp[#inp + 1] = it.name .. ':' .. it.count end
          o.m[t[1]] = (names[e.status] or '?') .. ' done ' .. e.products_finished .. ' [' .. table.concat(inp, ' ') .. ']'
        else o.m[t[1]] = 'none' end
      end
      local n = s.find_logistic_network_by_position({-24, -66}, 'player')
      o.net_am1 = n and n.get_item_count('assembling-machine-1')
      return o end)()""" % ms)


def main() -> int:
    ap = argparse.ArgumentParser()
    for k in ("place", "order", "check"):
        ap.add_argument("--" + k, action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.place:
        place(ai)
    if a.order:
        order(ai)
    if a.check:
        say("점검 " + json.dumps(check(ai), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

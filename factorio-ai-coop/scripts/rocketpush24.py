"""run24 로켓 1 호 밀기 (2026-09-30 20:5x) - 코디네이터 «로켓 > 과학».

실측 20:4x (tick 5.48M): 부품 35/100, 사일로 item_ingredient_shortage (LDS 1 · RF 2 · PU 50). 10분 부품 5 · PU 49 · LDS 60 · RF 42.
  - 새 PU 셋 (-30.5, 21.5 · 25.5) (-26.5,21.5): 녹색 40 은 있고 고급 0 - 망 고급 700 < 남김 800 (rocketfab24 에서 발사 전 200 으로).
  - 플라스틱 = 가스가 벽 (가스 10분 생산 11.9k · 씀 10.4k, 플라스틱 화학 둘 중 (-106.5,13.5) fluid shortage) → 고급 12 대 중 9 대 플라스틱 굶음.
    경유는 남는다 (10분 생산 10.2k · 씀 5.5k, 탱크 7.8k) → rocketfab24 발사 전 경유 분해 4000 켬 / 2500 끔.
  - **노랑 과학 LDS 상자 (1.5,13.5) 에 LDS 1,550** (옛 LDS 둘이 채운 망 밖 쇠 상자) - 로켓 한 발 LDS 몫 (~560 남음) 보다 많다.
    → delta 가 1,150 을 손으로 서쪽 저장 상자 (-76.5,-13.5) 로 (노랑 몫 ~400 남김, 동쪽 저장 상자는 가득). 사일로는 로봇 요청으로 가져감.

처방 (이 스크립트):
  hand   delta: LDS 상자 (1.5,13.5) → 서쪽 저장 상자 (손 운반)
  mods   생산 모듈 (망 100, 보라 재료) 을 입력이 모자란 곳에만 - PU 새 셋 2 씩 · 플라스틱 화학 둘 2 씩 · 고급 12 대 2 씩 (재료당 +8 %)
  ghosts 녹색 조립기 2 대 (PU3 동쪽 빈 땅) - 요청 상자 (철 · 전선 - 망 전선 35.9k) → 빠른 팔 → 녹색 2 형:
         G1 (-22.5,21.5) → 빠른 팔 (-24.5,21.5) → PU3 에 바로 (녹색 1.5/s = PU 0.75 몫 딱), G2 (-19.5,21.5) → 빠른 팔 → 공급 상자 (망 → PU1 · PU2 로봇)
  kit    delta 손제작: 조립기 2 형 2 · 요청 상자 2 · 공급 상자 1 · 빠른 팔 4 → 저장 상자
  config 조리법 · 요청 상자 칸 · 공급 상자 칸 제한 · 옛 PU (1.5,20.5) 공급 상자 (4.5,21.5) 칸 2 → 8

  kit3   delta 손제작: 조립기 3 형 2 (속도 모듈 8 · 2 형 4) → 저장 상자 / upgrade  RF 조립기 둘 로봇 올리기 (order_upgrade)

    python scripts/rocketpush24.py hand|mods|check|ghosts|kit|config|kit3|upgrade|status|release
Lua 아이템 이동 0 - 유령 (can_place manual) · 로봇 요청 · 요청 상자 설정 · 칸 제한 · 사람 손.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
import oil24  # noqa: E402
import p7_24  # noqa: E402
import purple24  # noqa: E402

N, E, S, W = 0, 4, 8, 12            # 팔 방향 = 집는 쪽
WHO, OWNER = "delta", "rocketpush24"
ADV_BOX = purple24.ADV_BOX
STORE = (-76.5, -13.5)              # 20:5x 저장 상자 (59.5,-14.5) 는 가득 (동쪽 저장 상자 모두 빈 칸 0) → 서쪽 저장 상자 (망 9, 빈 칸 48)
GREEN_BOX = (31.5, -16.5)           # zone N 녹색 공급 상자 (망 녹색 ~580)
LDS_BOX, LDS_TAKE = (1.5, 13.5), 1150
A2, RQ, PP, FI, POLE = "assembling-machine-2", "requester-chest", "passive-provider-chest", "fast-inserter", "medium-electric-pole"

GREEN = [(-22.5, 21.5), (-19.5, 21.5)]
G = [(A2, x, y, N) for x, y in GREEN] + [
    (RQ, -22.5, 18.5, N), (FI, -22.5, 19.5, N),          # G1 입력 (북쪽 요청 상자에서 집음)
    (FI, -24.5, 21.5, E),                                # G1 → PU3 (-26.5,21.5)
    (RQ, -18.5, 18.5, N), (FI, -18.5, 19.5, N),          # G2 입력
    (FI, -20.5, 19.5, S), (PP, -20.5, 18.5, N),          # G2 → 공급 상자
    (POLE, -21.5, 18.5, N),
]
REQ = [("copper-cable", 400), ("iron-plate", 150)]
BARS = [(-20.5, 18.5, 4), (4.5, 21.5, 8)]               # 공급 상자 칸 제한 (G2 녹색 200 · 옛 PU 800)

PROD = "productivity-module"
AM, CP = "assembling-machine-2", "chemical-plant"
MODS = ([(AM, -30.5, 25.5, 2), (AM, -30.5, 21.5, 2), (AM, -26.5, 21.5, 2), (CP, -106.5, 13.5, 2), (CP, -71.5, 11.5, 2)]
        + [(AM, x, y, 2) for x, y in ((25.5, -15.5), (33.5, -15.5), (41.5, -15.5), (49.5, -15.5), (13.5, 20.5), (-16.5, 20.5),
                                      (-8.5, 20.5), (39.5, 28.5), (47.5, 28.5), (39.5, 44.5), (47.5, 44.5), (-64.5, -6.5))])

LUA_CONFIG = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local o = {}
  for _, p in pairs(A.green) do
    local e = s.find_entities_filtered{name = 'assembling-machine-2', force = f, position = p, radius = 0.3}[1]
    if e and not e.get_recipe() then e.set_recipe('electronic-circuit') o[#o + 1] = 'recipe ' .. p[1] end
  end
  for _, p in pairs(A.req_at) do
    local c = s.find_entities_filtered{name = 'requester-chest', force = f, position = p, radius = 0.3}[1]
    if c then
      local rp = c.get_requester_point()
      if rp.sections_count == 0 then rp.add_section() end
      local sec = rp.get_section(1)
      for k, r in pairs(A.req) do sec.set_slot(k, {value = {name = r[1], quality = 'normal'}, min = r[2]}) end
      o[#o + 1] = 'req ' .. p[1]
    end
  end
  for _, q in pairs(A.bars) do
    local c = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    if c then c.get_inventory(defines.inventory.chest).set_bar(q[3] + 1) o[#o + 1] = 'bar ' .. q[1] .. ',' .. q[2] .. ' ' .. q[3] end
  end
  return o end)()"""


def place(ai, make):
    return ai.lua(purple24.LUA_PLACE % ("true" if make else "false", json.dumps([list(g) for g in G])))


def config(ai):
    return ai.lua(LUA_CONFIG % json.dumps({"green": GREEN, "req_at": [[g[1], g[2]] for g in G if g[0] == RQ], "req": REQ, "bars": BARS}))


def mods(ai, make=True):
    return ai.lua(oil24.LUA_MODS % json.dumps({"m": MODS, "item": PROD, "make": make}))


def hand(ai, n=LDS_TAKE):
    from orders import submit
    detached.mark([WHO], OWNER, minutes=20)
    sx, sy = STORE
    plan = [("walk_to", {"x": 4.5, "y": 13.5}), ("take", {"name": "low-density-structure", "x": LDS_BOX[0], "y": LDS_BOX[1], "count": n}),
            ("walk_to", {"x": sx, "y": sy + 1.5}), ("insert", {"name": "low-density-structure", "x": sx, "y": sy, "count": n})]
    return submit(ai, WHO, plan, strict=False)


def kit(ai, a2=2, rq=2, pp=1, fi=4):
    """delta: 녹색 (망 공급 상자) · 고급 · 허브 철 · 강철 → 조립기 1 → 2 · 요청 · 공급 상자 · 빠른 팔 → 저장 상자."""
    from orders import submit
    green = 6 * a2 + 3 * (rq + pp) + 3 * fi
    detached.mark([WHO], OWNER, minutes=25)
    plan = [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
            ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": rq + pp}),
            ("walk_to", {"x": GREEN_BOX[0], "y": GREEN_BOX[1] + 1.5}),
            ("take", {"name": "electronic-circuit", "x": GREEN_BOX[0], "y": GREEN_BOX[1], "count": green})]
    plan += p7_24.take_plan(ai, {"steel-plate": 2 * a2 + 8 * (rq + pp), "iron-plate": 29 * a2 + 5 * fi + 4},
                            {"steel-plate": 500, "iron-plate": 200})
    plan += [("craft", {"recipe": "iron-gear-wheel", "count": 10 * a2 + fi, "wait": "block"}),
             ("craft", {"recipe": "assembling-machine-1", "count": a2, "wait": "block"}),
             ("craft", {"recipe": A2, "count": a2, "wait": "block"}),
             ("craft", {"recipe": "inserter", "count": fi, "wait": "block"}),
             ("craft", {"recipe": FI, "count": fi, "wait": "block"}),
             ("craft", {"recipe": "steel-chest", "count": rq + pp, "wait": "block"}),
             ("craft", {"recipe": RQ, "count": rq, "wait": "block"}),
             ("craft", {"recipe": PP, "count": pp, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5})]
    for n, c in ((A2, a2), (RQ, rq), (PP, pp), (FI, fi)):
        plan.append(("insert", {"name": n, "x": STORE[0], "y": STORE[1], "count": c}))
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "green": green}


# 20:5x RF 가 마지막 벽: LDS (손 운반 1,150) · 고급 (망 640) 은 한 발 몫이 찼고 남은 RF ~300 을 RF 조립기 둘 (2 형 + 속도 2 = 1.05, 84/10분) 이 정한다.
#   SF1 (속도 3) 은 96/분 (RF 9.6/분 몫) 이라 RF 조립기가 먼저 막힘 → 3 형 (1.25, 칸 4) 으로 올림 (조리법 · 속도 모듈 2 그대로) = 1.75 → 140/10분.
#   3 형 = 2 형 2 + 속도 모듈 4. 올리기는 로봇 (order_upgrade - 같은 자리 바꿔 끼움, 옛 2 형은 망으로). 사람은 RF 줄에 안 감.
RF_ASM = [(-69.5, 2.5), (-67.5, -1.5)]
A3 = "assembling-machine-3"


def kit3(ai, n=2):
    from orders import submit
    a2, sm = 2 * n, 4 * n
    green = 5 * sm + 6 * a2
    detached.mark([WHO], OWNER, minutes=30)
    plan = [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
            ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": 5 * sm})]
    plan += p7_24.take_plan(ai, {"steel-plate": 2 * a2, "copper-cable": 3 * green, "iron-plate": green + 29 * a2 + 20},
                            {"steel-plate": 500, "copper-cable": 300, "iron-plate": 100})
    plan += [("craft", {"recipe": "electronic-circuit", "count": green, "wait": "block"}),
             ("craft", {"recipe": "speed-module", "count": sm, "wait": "block"}),
             ("craft", {"recipe": "iron-gear-wheel", "count": 10 * a2, "wait": "block"}),
             ("craft", {"recipe": "assembling-machine-1", "count": a2, "wait": "block"}),
             ("craft", {"recipe": A2, "count": a2, "wait": "block"}),
             ("craft", {"recipe": A3, "count": n, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": A3, "x": STORE[0], "y": STORE[1], "count": n})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "green": green}


def upgrade(ai):
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player local o = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = {'assembling-machine-2', 'assembling-machine-3'}, force = f, position = p, radius = 0.3}[1]
        if not e then o[#o + 1] = 'none ' .. p[1]
        elseif e.name == '%s' then o[#o + 1] = 'a3 ' .. p[1] .. ' speed ' .. e.crafting_speed
        elseif e.to_be_upgraded() then o[#o + 1] = 'ordered ' .. p[1]
        else o[#o + 1] = 'order ' .. p[1] .. ' ' .. tostring(e.order_upgrade{target = '%s', force = f}) end
      end
      return o end)()""" % (json.dumps(RF_ASM), A3, A3))


def status(ai):
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local stn = {} for k, v in pairs(defines.entity_status) do stn[v] = k end
      local o = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'assembling-machine', force = f, position = p, radius = 0.3}[1]
        o[#o + 1] = p[1] .. ',' .. p[2] .. ' ' .. (e and (stn[e.status] or '?') or 'none') end
      local c = s.find_entities_filtered{position = {%s, %s}, radius = 0.3, type = 'container'}[1]
      o.lds_box = c and c.get_item_count('low-density-structure')
      return o end)()""" % (json.dumps(GREEN + [[-30.5, 25.5], [-30.5, 21.5], [-26.5, 21.5]]), LDS_BOX[0], LDS_BOX[1]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", nargs="?", default="status")
    a = ap.parse_args()
    ai = AIBridge()
    if a.step == "release":
        detached.release([WHO])
        print("released")
        return
    fn = {"hand": hand, "mods": mods, "modcheck": lambda ai: mods(ai, False), "check": lambda ai: place(ai, False),
          "ghosts": lambda ai: place(ai, True), "kit": kit, "kit3": kit3, "upgrade": upgrade, "config": config, "status": status}[a.step]
    print(json.dumps(fn(ai), ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

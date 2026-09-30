"""run24 기름 몫 · 로켓 연료 빠르게 (2026-09-30 19:3x). rocketfab24 의 LUA_OIL (상주 rocketfab) 과 짝.

실측 (19:2x, 1분): 원유 40.6/s (펌프잭 5, 빈 우물 자리 0) 를 정유 넷 (고급 R2 1 · 기본 3) 이 나눠 모두 반만 돌았다 (각 6~7 번/분, 최대 12).
  → 기본 R1 · R3 을 쉬게 (active) 하니 R2 11.3 번/분 · 경유 360 → 772/분. 그다음 벽 = 로켓 연료 조립기 둘 (2 형 0.75, 15 s → 2.7/분 씩).
속도 모듈 (녹색 5 · 고급 5, 손제작) 10 개:
  R2 (고급) 3 → ×1.6 = 원유 32/s · 경유 14.4 + 중유 8 (분해 → 경유 6) / RF1 · RF2 2 씩 → ×1.4 / SF1 (경유 고체 연료) 3 → 96/분.
  넣기는 로봇 (item-request-proxy, 모듈 칸) - 사람 손 (delta 손제작 → 저장 상자 (59.5,-14.5)) 에서 로봇이 가져감. Lua 아이템 이동 0.

    python scripts/oil24.py kit       # delta: 고급 50 (ADV_BOX) · 허브 철 50 · 전선 150 → 녹색 50 → 속도 모듈 10 → 저장 상자
    python scripts/oil24.py mods      # 모듈 칸 로봇 요청
    python scripts/oil24.py status
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
import p7_24  # noqa: E402
import purple24  # noqa: E402

WHO, OWNER = "delta", "oil24"
SPEED = "speed-module"
# (이름, x, y, 모듈 수)
MODS = [("oil-refinery", -87.5, 8.5, 3), ("assembling-machine-2", -69.5, 2.5, 2), ("assembling-machine-2", -67.5, -1.5, 2),
        ("chemical-plant", -64.5, -1.5, 3),
        # 20:1x: 부품이 LDS 에 막힘 (사일로 LDS 0, 부품 17 에서 10 분 멈춤) - 사일로 곁 LDS 셋 2 씩
        ("assembling-machine-2", 106.5, -40.5, 2), ("assembling-machine-2", 113.5, -40.5, 2), ("assembling-machine-2", 117.5, -47.5, 2)]

LUA_MODS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local o = {}
  for _, q in pairs(A.m) do
    local e = s.find_entities_filtered{name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}[1]
    if not e then o[#o + 1] = 'none ' .. q[1]
    else
      local mi = e.get_module_inventory()
      local have = mi.get_item_count(A.item)
      local busy = s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.5} > 0
      local slots = {}
      for i = 1, #mi do if not mi[i].valid_for_read and #slots < q[4] - have then slots[#slots + 1] = {inventory = defines.inventory.assembling_machine_modules, stack = i - 1, count = 1} end end
      if A.make and not busy and #slots > 0 then
        s.create_entity{name = 'item-request-proxy', position = e.position, force = f, target = e, modules = {{id = {name = A.item}, items = {in_inventory = slots}}}}
      end
      o[#o + 1] = q[1] .. '@' .. q[2] .. ',' .. q[3] .. ' have ' .. have .. ' ask ' .. #slots .. (busy and ' busy' or '')
    end
  end
  local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
  o[#o + 1] = 'net ' .. (n and n.get_item_count(A.item) or -1)
  return o end)()"""


def mods(ai, make=True):
    return ai.lua(LUA_MODS % json.dumps({"m": MODS, "item": SPEED, "make": make}))


def kit(ai, n=10, ins=0):
    from orders import submit
    detached.mark([WHO], OWNER, minutes=20)
    ax, ay = purple24.ADV_BOX
    sx, sy = purple24.STORE
    green = 5 * n + ins
    plan = [("walk_to", {"x": ax, "y": ay + 1.5}), ("take", {"name": "advanced-circuit", "x": ax, "y": ay, "count": 5 * n})]
    plan += p7_24.take_plan(ai, {"iron-plate": green + 3 * ins, "copper-cable": 3 * green}, {"iron-plate": 100, "copper-cable": 500})
    plan += [("craft", {"recipe": "electronic-circuit", "count": green, "wait": "block"}),
             ("craft", {"recipe": SPEED, "count": n, "wait": "block"})]
    if ins:
        plan += [("craft", {"recipe": "iron-gear-wheel", "count": ins, "wait": "block"}), ("craft", {"recipe": "inserter", "count": ins, "wait": "block"})]
    plan += [("walk_to", {"x": sx, "y": sy + 1.5}),
             ("insert", {"name": SPEED, "x": sx, "y": sy, "count": n})]
    if ins:
        plan.append(("insert", {"name": "inserter", "x": sx, "y": sy, "count": ins}))
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan)}


# 20:2x: 사일로 곁 LDS 셋 은 로봇 요청 (robofeed - 조립기마다 요청 하나, 30 s 고리) 으로 먹어 구리 · 강철 · 플라스틱이 돌아가며 와
#   조립기당 ~3.3/분 상한 (실측 부품 0.6/분). → 요청 상자 + 빠른 팔 (구리 200 · 강철 20 · 플라스틱 50) 로 바꾼다.
LDS_IN = [(106.5, -37.5, 106.5, -38.5, 8), (113.5, -37.5, 113.5, -38.5, 8), (120.5, -47.5, 119.5, -47.5, 4)]   # 상자 x, y, 팔 x, y, 팔 방향 (집는 쪽)
LDS_REQ = [("copper-plate", 200), ("steel-plate", 20), ("plastic-bar", 50)]

LUA_LDS = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local o = {}
  for _, q in pairs(A.lds) do
    local c = s.find_entities_filtered{name = 'requester-chest', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    local i = s.find_entities_filtered{name = 'fast-inserter', force = f, position = {q[3], q[4]}, radius = 0.3}[1]
    if not c and A.make and s.count_entities_filtered{ghost_name = 'requester-chest', position = {q[1], q[2]}, radius = 0.3} == 0
       and s.can_place_entity{name = 'requester-chest', position = {q[1], q[2]}, force = f, build_check_type = defines.build_check_type.manual} then
      s.create_entity{name = 'entity-ghost', inner_name = 'requester-chest', position = {q[1], q[2]}, force = f} end
    if not i and A.make and s.count_entities_filtered{ghost_name = 'fast-inserter', position = {q[3], q[4]}, radius = 0.3} == 0
       and s.can_place_entity{name = 'fast-inserter', position = {q[3], q[4]}, direction = q[5], force = f, build_check_type = defines.build_check_type.manual} then
      s.create_entity{name = 'entity-ghost', inner_name = 'fast-inserter', position = {q[3], q[4]}, direction = q[5], force = f} end
    if c then
      local rp = c.get_requester_point()
      if rp.sections_count == 0 then rp.add_section() end
      local sec = rp.get_section(1)
      for k, r in pairs(A.req) do sec.set_slot(k, {value = {name = r[1], quality = 'normal'}, min = r[2]}) end
    end
    o[#o + 1] = q[1] .. ',' .. q[2] .. ' chest ' .. tostring(c ~= nil) .. ' ins ' .. tostring(i ~= nil)
  end
  return o end)()"""


def lds(ai, make=True):
    return ai.lua(LUA_LDS % json.dumps({"lds": LDS_IN, "req": LDS_REQ, "make": make}))


def kit_lds(ai, n=3):
    from orders import submit
    detached.mark([WHO], OWNER, minutes=20)
    ax, ay = purple24.ADV_BOX
    green = 3 * n + 2 * n + n
    plan = [("walk_to", {"x": ax, "y": ay + 1.5}), ("take", {"name": "advanced-circuit", "x": ax, "y": ay, "count": n})]
    plan += p7_24.take_plan(ai, {"iron-plate": green + 5 * n, "copper-cable": 3 * green, "steel-plate": 8 * n},
                            {"iron-plate": 100, "copper-cable": 500, "steel-plate": 300})
    plan += [("craft", {"recipe": "electronic-circuit", "count": green, "wait": "block"}),
             ("craft", {"recipe": "steel-chest", "count": n, "wait": "block"}),
             ("craft", {"recipe": "requester-chest", "count": n, "wait": "block"}),
             ("craft", {"recipe": "iron-gear-wheel", "count": n, "wait": "block"}),
             ("craft", {"recipe": "inserter", "count": n, "wait": "block"}),
             ("craft", {"recipe": "fast-inserter", "count": n, "wait": "block"}),
             ("walk_to", {"x": 75.5, "y": -14.0}),
             ("insert", {"name": "requester-chest", "x": 75.5, "y": -15.5, "count": n}),
             ("insert", {"name": "fast-inserter", "x": 75.5, "y": -15.5, "count": n})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", nargs="?", default="status")
    ap.add_argument("-n", type=int, default=10)
    ap.add_argument("--ins", type=int, default=0)
    a = ap.parse_args()
    ai = AIBridge()
    if a.step == "release":
        detached.release([WHO])
        print("released")
        return
    fn = {"kit": lambda ai: kit(ai, a.n, a.ins), "mods": mods, "kitlds": kit_lds, "lds": lds, "ldscheck": lambda ai: lds(ai, False), "status": lambda ai: mods(ai, False)}[a.step]
    print(json.dumps(fn(ai), ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

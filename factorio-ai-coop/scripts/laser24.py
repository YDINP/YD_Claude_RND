"""Run 24 레이저 포탑 들이기 (17:3x) - laser-turret 연구 끝 (17:2x), 사용자: 레이저 · 화염 포탑을 세워라.

    python scripts/laser24.py spots  [--zones east|base|all] [--make]   자리 (def24 LUA_LASER_SPOTS 재사용: 총 포탑 옆 2 칸 · can_place manual · 전봇대 공급 안)
    python scripts/laser24.py carry  --who delta [--n 9]                  레이저 조립기 공급 상자 (93.5,2.5) → 손 → 동쪽 전초 서쪽 문 저장 상자 (344.5,-104.5)
    python scripts/laser24.py acc    --who bravo --n 40                   축전지 손제작 (저장 상자 배터리 · 허브 철) → 저장 상자 (-76.5,-13.5) → 로봇이 새 축전지 칸 유령을 지음
    python scripts/laser24.py cap [--n 10]                                 레이저 결과 팔 (93.5,1.5) 망 조건 «laser-turret < n» (망에 n 개 쌓이면 섬 - 회로를 과학에 남김)
    python scripts/laser24.py status                                       자리별 레이저 (선 · 전기 · 유령 · 잡은 수) · 전력 · 축전
    python scripts/laser24.py --release delta bravo

Lua 아이템 이동 0 - 유령 (can_place manual · 같은 이름 유령 1.5 안 없음) · 사람 손 (꺼내기 · 손제작 · 넣기).
동쪽 전초는 따로인 로봇망 (기지 망과 이어지지 않음) - 레이저를 사람이 들고 가 서쪽 문 상자에 넣어야 전초 로봇이 유령을 짓는다.
전기는 기지와 한 망 (전초 전봇대 70 개 모두 electric_network_id = 기지).
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
from orders import submit  # noqa: E402
from def24 import LUA_LASER_SPOTS, power  # noqa: E402
from ironfix24 import WEST_GATE_STORE, WEST_GATE_WALK, HOME  # noqa: E402

OWNER = "laser24"
LASER_OUT = (93.5, 2.5)            # def24 레이저 조립기 결과 공급 상자
STORE = (-76.5, -13.5)             # 기지 망 저장 상자 (빈 칸 있음)
BATT_SRC = (-88.5, 1.5)            # 저장 상자 배터리 2,371 (17:3x)
IRON_SRC = (74.5, -15.5)           # 허브 쇠 상자 (eastdrill24 KEEP 150 - 이것도 150 남김)

# (x0, y0, x1, y1, 최대, 이름). 동쪽 전초 = 북쪽 드릴 밭 · 동면 · 남면 (사용자 우선), 기지 = NW 무리 · 남벽 (y ~50, 잡은 수 681/501/469) · 동벽 x 130 (487/373)
ZONES = {
    "east": [[388, -200, 430, -150, 4, "east-N"], [410, -150, 428, -120, 3, "east-E"], [385, -115, 425, -105, 2, "east-S"]],
    "base": [[-36, -127, -22, -107, 3, "NW"], [-35, 44, 5, 56, 2, "S-wall"], [125, -50, 135, 20, 2, "E130"]],
}

STATUS_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local Z = helpers.json_to_table('%s')
  local o = {sites = {}}
  local seen = {}
  for _, z in pairs(Z) do
    local r = {built = 0, powered = 0, ghost = 0, kills = 0}
    for _, t in pairs(s.find_entities_filtered{name = 'laser-turret', force = f, area = {{z[1] - 3, z[2] - 3}, {z[3] + 3, z[4] + 3}}}) do
      if not seen[t.unit_number] then
        seen[t.unit_number] = true
        r.built = r.built + 1; r.kills = r.kills + t.kills
        if t.energy > 0 and t.is_connected_to_electric_network() then r.powered = r.powered + 1 end
      end
    end
    r.ghost = s.count_entities_filtered{ghost_name = 'laser-turret', force = f, area = {{z[1] - 3, z[2] - 3}, {z[3] + 3, z[4] + 3}}}
    o.sites[z[6]] = r
  end
  local all, k = 0, 0
  for _, t in pairs(s.find_entities_filtered{name = 'laser-turret', force = f}) do all = all + 1; k = k + t.kills end
  o.all, o.all_kills = all, k
  o.ghosts = s.count_entities_filtered{ghost_name = 'laser-turret', force = f}
  local st = f.get_item_production_statistics(s)
  o.made = math.floor(st.get_input_count('laser-turret'))
  local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
  o.net = {laser = n.get_item_count('laser-turret'), acc = n.get_item_count('accumulator'), circ = n.get_item_count('electronic-circuit'), batt = n.get_item_count('battery')}
  o.acc_built, o.acc_ghost = s.count_entities_filtered{name = 'accumulator', force = f}, s.count_entities_filtered{ghost_name = 'accumulator', force = f}
  local a = s.find_entities_filtered{name = 'assembling-machine-2', position = {93.5, -0.5}, radius = 0.3}[1]
  local stn = {} for k2, v in pairs(defines.entity_status) do stn[v] = k2 end
  o.laser_asm = a and (stn[a.status] .. ' ' .. math.floor(a.crafting_progress * 100)) or 'none'
  local c = s.find_entities_filtered{name = 'passive-provider-chest', position = {93.5, 2.5}, radius = 0.3}[1]
  o.laser_out = c and c.get_item_count('laser-turret') or -1
  o.daytime, o.darkness = s.daytime, s.darkness
  return o
end)()"""


def zones(which):
    return ZONES["east"] + ZONES["base"] if which == "all" else ZONES[which]


def spots(ai, which, make):
    return ai.lua(LUA_LASER_SPOTS % json.dumps({"zones": zones(which), "make": bool(make)}))


def status(ai):
    r = ai.lua(STATUS_LUA % json.dumps(zones("all")))
    r["power"] = power(ai)
    return r


def carry(ai, who, n):
    """공급 상자 레이저 → 손 → 서쪽 문 저장 상자. 레이저는 손제작 불가 (조립기만) 라 있는 만큼만."""
    plan = [("walk_to", {"x": LASER_OUT[0], "y": LASER_OUT[1] + 1.5}),
            ("take", {"name": "laser-turret", "x": LASER_OUT[0], "y": LASER_OUT[1], "count": n}),
            ("walk_to", {"x": WEST_GATE_WALK[0], "y": WEST_GATE_WALK[1]}),
            ("insert", {"name": "laser-turret", "x": WEST_GATE_STORE[0], "y": WEST_GATE_STORE[1], "count": n}),
            ("walk_to", {"x": HOME[0], "y": HOME[1]})]
    return plan


def acc(ai, who, n):
    """축전지 = 배터리 5 · 철 2 (손제작 10 s). 배터리는 망 저장 상자, 철은 허브."""
    bag = {k: int(v) for k, v in ai.agent(who).items().items()}
    batt = max(0, 5 * n - bag.get("battery", 0))
    iron = max(0, 2 * n - bag.get("iron-plate", 0))
    plan = []
    if batt:
        plan += [("walk_to", {"x": BATT_SRC[0], "y": BATT_SRC[1] + 1.5}), ("take", {"name": "battery", "x": BATT_SRC[0], "y": BATT_SRC[1], "count": batt})]
    if iron:
        plan += [("walk_to", {"x": IRON_SRC[0], "y": IRON_SRC[1] + 1.5}), ("take", {"name": "iron-plate", "x": IRON_SRC[0], "y": IRON_SRC[1], "count": iron})]
    plan += [("craft", {"recipe": "accumulator", "count": n, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": "accumulator", "x": STORE[0], "y": STORE[1], "count": n})]
    return plan


CAP_LUA = """(function() local s = game.surfaces[1]
  local i = s.find_entities_filtered{type = 'inserter', position = {93.5, 1.5}, radius = 0.3}[1]
  local cb = i.get_or_create_control_behavior()
  cb.connect_to_logistic_network = true
  cb.logistic_condition = {first_signal = {type = 'item', name = 'laser-turret'}, comparator = '<', constant = %d}
  return {ok = cb.connect_to_logistic_network} end)()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step", nargs="?")
    ap.add_argument("--zones", default="east")
    ap.add_argument("--make", action="store_true")
    ap.add_argument("--who", default="delta")
    ap.add_argument("--n", type=int, default=9)
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--release", nargs="*")
    a = ap.parse_args()
    ai = AIBridge()
    os.environ[detached.ENV] = OWNER
    if a.release:
        detached.release(a.release)
        print("released", a.release)
    if a.step == "spots":
        print(json.dumps(spots(ai, a.zones, a.make), ensure_ascii=False))
    elif a.step == "cap":
        print(ai.lua(CAP_LUA % a.n))
    elif a.step == "status":
        print(json.dumps(status(ai), ensure_ascii=False))
    elif a.step in ("carry", "acc"):
        o = detached.owner(a.who)
        if o not in (None, OWNER):
            print(a.who, "owned by", o, "- skip")
            return 1
        plan = carry(ai, a.who, a.n) if a.step == "carry" else acc(ai, a.who, a.n)
        if a.dry:
            for s in plan:
                print("  ", s)
            return 0
        detached.mark([a.who], OWNER, minutes=40)
        print(submit(ai, a.who, plan, strict=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

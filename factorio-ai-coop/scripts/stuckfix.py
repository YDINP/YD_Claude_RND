"""손에 «넣을 수 없는 것» 을 든 채 선 팔을 찾아 걷고 다시 놓는다 (손을 비운다).

23회차 p28: 섞인 벨트 (철|구리) 에서 긴팔이 구리를 집어 강철 화로 · 관 조립기 앞에서 영영 섰다
(held copper-plate, waiting_for_space_in_destination). 걷고 다시 놓으면 손이 비고, 목적지에 레시피
(또는 화로 입력칸에 철) 가 있으면 다시는 안 집는다.

    python scripts/stuckfix.py --area=-20,-60,40,-10            # 찾기만
    python scripts/stuckfix.py --area=-20,-60,40,-10 --who charlie
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
from client import AIBridge  # noqa: E402


def stuck(ai, area) -> list:
    r = ai.lua("""(function()
      local s, o = game.surfaces[1], {}
      for _, i in pairs(s.find_entities_filtered{type = "inserter", area = {{%f, %f}, {%f, %f}}}) do
        local h, d = i.held_stack, i.drop_target
        if h.valid_for_read and d and i.status == defines.entity_status.waiting_for_space_in_destination then
          local ok = false
          if d.type == "assembling-machine" and d.get_recipe() then
            for _, ing in pairs(d.get_recipe().ingredients) do if ing.name == h.name then ok = true end end
          elseif d.type == "furnace" then
            local src = d.get_inventory(defines.inventory.furnace_source)
            ok = src.is_empty() and (h.name == "iron-plate" or h.name == "iron-ore" or h.name == "copper-ore" or h.name == "stone")
                 or src.get_item_count(h.name) > 0
            if d.get_fuel_inventory() and h.name == "coal" then ok = true end
          else ok = true end
          if not ok then o[#o+1] = {i.name, i.position.x, i.position.y, i.direction, h.name, d.name} end
        end
      end
      return o end)()""" % tuple(area))
    return list(r.values()) if isinstance(r, dict) else list(r or [])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", required=True, help="x0,y0,x1,y1 (음수는 --area=-20,...)")
    ap.add_argument("--who", default="")
    a = ap.parse_args()
    area = [float(v) for v in a.area.split(",")]
    ai = AIBridge()
    bad = stuck(ai, area)
    for b in bad:
        print(f"  {b[0]} ({b[1]},{b[2]}) 손에 {b[4]} -> {b[5]}")
    if not (bad and a.who):
        return 0
    plan = []
    for name, x, y, d, _h, _t in bad:
        plan += [("walk_to", {"x": x, "y": y - 1.5}), ("demolish", {"x": x, "y": y, "name": name, "search_radius": 0.3}),
                 ("build", {"name": name, "x": x, "y": y, "direction": int(d)})]
    ids = ai.agent(a.who).submit_plan(plan[:64])
    while not all(ai.poll(t)["status"] in ("done", "failed") for t in ids):
        time.sleep(3)
    print([(ai.poll(t)["type"], ai.poll(t)["status"], ai.poll(t).get("error", "")[:60]) for t in ids if ai.poll(t)["status"] != "done"])
    time.sleep(10)
    print("남은 것", len(stuck(ai, area)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

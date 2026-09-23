"""How healthy is the flow? Count starving machines and blocked machines.

교리 v2 (docs/doctrine-v2.md): 흐름의 결함은 두 가지뿐이고 둘 다 게임에 물을 수 있다.

    병목 = 입력을 기다리는 기계   (no_ingredients, no_input_fluid, no_fuel, no_minable_resources, low_power, no_power)
    잉여 = 출력이 막힌 기계       (output_full, waiting_for_space_in_destination, full_output)

타입별로 센다 (채굴기·화로·조립기·연구소·정유). 상자에 쌓인 판·중간재는 «아무도 안 쓰는
재고»로 따로 센다. 포탑은 탄 최소값·빈 포탑 수, 적은 진화·공해.

    python scripts/health.py
    python scripts/health.py --json      # 기록용
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge  # noqa: E402

STARVED = {"no_ingredients", "no_input_fluid", "no_fuel", "no_minable_resources",
           "low_power", "no_power", "missing_science_packs", "low_input_fluid",
           "item_ingredient_shortage", "fluid_ingredient_shortage"}
BLOCKED = {"full_output", "output_full", "waiting_for_space_in_destination"}
TYPES = ("mining-drill", "furnace", "assembling-machine", "lab", "boiler", "generator")
STOCK = ("iron-plate", "copper-plate", "steel-plate", "iron-gear-wheel", "copper-cable",
         "electronic-circuit", "coal", "stone", "iron-ore", "copper-ore")


def snapshot(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local name = {}
      for k, v in pairs(defines.entity_status) do name[v] = k end
      local by = {}
      for _, t in pairs({%s}) do
        local h = {}
        for _, e in pairs(s.find_entities_filtered{type = t, force = f}) do
          local k = name[e.status] or "unknown"
          h[k] = (h[k] or 0) + 1
        end
        by[t] = h
      end
      local stock = {}
      for _, c in pairs(s.find_entities_filtered{type = {"container", "logistic-container"}, force = f}) do
        local inv = c.get_inventory(defines.inventory.chest)
        for _, it in pairs({%s}) do
          stock[it] = (stock[it] or 0) + inv.get_item_count(it)
        end
      end
      local tur = {n = 0, empty = 0, low = 0, min = 9999}
      for _, t in pairs(s.find_entities_filtered{type = "ammo-turret", force = f}) do
        local c = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
        tur.n = tur.n + 1
        if c == 0 then tur.empty = tur.empty + 1 elseif c < 20 then tur.low = tur.low + 1 end
        if c < tur.min then tur.min = c end
      end
      local e = game.forces.enemy
      return {by = by, stock = stock, turrets = tur, tick = game.tick,
              evolution = e.get_evolution_factor(s),
              pollution = s.get_total_pollution(),
              research = f.current_research and f.current_research.name or "none"}
    end)()""" % (",".join(f'"{t}"' for t in TYPES), ",".join(f'"{i}"' for i in STOCK)))


def summarize(snap) -> dict:
    rows, tot = [], {"all": 0, "starved": 0, "blocked": 0}
    for t in TYPES:
        h = snap["by"].get(t) or {}
        if isinstance(h, list):
            h = {}
        n = sum(h.values())
        if not n:
            continue
        st = sum(v for k, v in h.items() if k in STARVED)
        bl = sum(v for k, v in h.items() if k in BLOCKED)
        rows.append((t, n, st, bl, h))
        tot["all"] += n
        tot["starved"] += st
        tot["blocked"] += bl
    return {"rows": rows, "tot": tot}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    snap = snapshot(AIBridge())
    s = summarize(snap)
    if args.json:
        print(json.dumps({"snap": snap, "tot": s["tot"]}, ensure_ascii=False))
        return 0
    print(f"  tick {snap['tick']} · 진화 {snap['evolution']:.3f} · 공해 {snap['pollution']:.0f} · 연구 {snap['research']}")
    for t, n, st, bl, h in s["rows"]:
        top = ", ".join(f"{k} {v}" for k, v in sorted(h.items(), key=lambda kv: -kv[1])[:4])
        print(f"  {t:<19} {n:>4}대 · 굶음 {100 * st / n:5.1f}% · 막힘 {100 * bl / n:5.1f}%  ({top})")
    t = s["tot"]
    if t["all"]:
        print(f"  == 전체 {t['all']}대 · 굶음 {100 * t['starved'] / t['all']:.1f}% · 막힘 {100 * t['blocked'] / t['all']:.1f}%"
              f"   (목표: 굶음 < 5%, 막힘 < 10%)")
    idle = {k: v for k, v in (snap.get("stock") or {}).items() if v}
    if idle:
        print("  상자 재고 (소비자 없는 재고 후보): " + ", ".join(f"{k} {v:,}" for k, v in sorted(idle.items(), key=lambda kv: -kv[1])))
    tur = snap["turrets"]
    if tur["n"]:
        print(f"  포탑 {tur['n']}대 · 빈 것 {tur['empty']} · 20발 미만 {tur['low']} · 최소 {tur['min']}발")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

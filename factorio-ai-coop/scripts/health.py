"""How healthy is the flow? Count starving machines and blocked machines.

교리 v2 (docs/doctrine-v2.md): 흐름의 결함은 두 가지뿐이고 둘 다 게임에 물을 수 있다.

    병목 = 입력을 기다리는 기계   (no_ingredients, no_input_fluid, no_fuel, no_minable_resources, low_power, no_power)
    잉여 = 출력이 막힌 기계       (output_full, waiting_for_space_in_destination, full_output)

타입별로 센다 (채굴기·화로·조립기·연구소·정유). 상자에 쌓인 판·중간재는 «아무도 안 쓰는
재고»로 따로 센다. 위협(포탑·탄·공해 구름·가장 가까운 적 구조물·진화)은 늘 찍는다.

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
      -- 전기 없는 것 (종류 무관). 팔은 위 분포에 안 잡힌다 - 출력 팔 넷이 전기 없이 서자
      -- 구리 화로 넷이 «막힘»으로만 보였고 빨강 조립기 다섯이 굶었다 (22회차).
      local dark = {}
      for _, x in pairs(s.find_entities_filtered{force = f, type = {"inserter", "mining-drill", "furnace",
          "assembling-machine", "lab", "pump", "pumpjack", "electric-turret", "radar"}}) do
        if x.status == defines.entity_status.no_power then
          dark[#dark+1] = string.format("%%s@%%.1f,%%.1f", x.name, x.position.x, x.position.y)
        end
      end
      local e = game.forces.enemy
      return {by = by, stock = stock, turrets = tur, tick = game.tick, dark = dark,
              evolution = e.get_evolution_factor(s),
              pollution = s.get_total_pollution(),
              research = f.current_research and f.current_research.name or "none"}
    end)()""" % (",".join(f'"{t}"' for t in TYPES), ",".join(f'"{i}"' for i in STOCK)))


MARGIN = 64          # 공해 구름 가장자리 너머 이 칸 안의 둥지는 곧 온다
FLOOR = 300          # 구름은 공장이 쉬면 줄어든다 (22회차 전멸 뒤 68칸) - 공격해 온 둥지는 213칸이었다. 판정 반경의 하한


def threat(ai) -> dict:
    """위협 (22회차 복기 2: 계기판에 방어가 없었다). 적은 밝혀진 청크 안에서만 센다 (force.chart 금지 규칙)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local sp = f.get_spawn_position(s)
      local cloud, polluted = 0, 0
      for c in s.get_chunks() do
        local cx, cy = c.x * 32 + 16, c.y * 32 + 16
        if s.get_pollution({cx, cy}) > 0 then
          polluted = polluted + 1
          local d = math.sqrt((cx - sp.x)^2 + (cy - sp.y)^2)
          if d > cloud then cloud = d end
        end
      end
      local near, nearest, where = 0, 1e9, ""
      for _, e in pairs(s.find_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"}}) do
        if f.is_chunk_charted(s, {math.floor(e.position.x / 32), math.floor(e.position.y / 32)}) then
          local d = math.sqrt((e.position.x - sp.x)^2 + (e.position.y - sp.y)^2)
          if d < nearest then nearest = d; where = string.format("%%.0f,%%.0f", e.position.x, e.position.y) end
          if d < math.max(cloud + %d, %d) then near = near + 1 end
        end
      end
      local tur = {n = 0, empty = 0, low = 0, min = 0}
      local first = true
      for _, t in pairs(s.find_entities_filtered{type = "ammo-turret", force = f}) do
        local c = t.get_inventory(defines.inventory.turret_ammo).get_item_count()
        tur.n = tur.n + 1
        if c == 0 then tur.empty = tur.empty + 1 elseif c < 20 then tur.low = tur.low + 1 end
        if first or c < tur.min then tur.min = c; first = false end
      end
      return {cloud = cloud, polluted = polluted, nearest = nearest, where = where, near = near, turrets = tur,
              evolution = game.forces.enemy.get_evolution_factor(s)}
    end)()""" % (MARGIN, FLOOR))


def threat_lines(t) -> list:
    tur = t["turrets"]
    out = [f"  위협: 진화 {t['evolution']:.3f} · 공해 구름 반경 {t['cloud']:.0f} ({t['polluted']} 청크) · "
           f"가장 가까운 적 구조물 {t['nearest']:.0f}칸 ({t['where'] or '-'}) · 경계 {max(t['cloud'] + MARGIN, FLOOR):.0f}칸 안 {t['near']}개",
           f"  포탑 {tur['n']}대 · 빈 것 {tur['empty']} · 20발 미만 {tur['low']} · 최소 {tur['min']}발"]
    if t["near"]:
        out.append(f"  ⛔ 경계 안에 적 구조물 {t['near']}개 - 이번 회차 1순위 (지우거나 포탑 줄)")
    if tur["n"] == 0:
        out.append("  ⛔ 포탑 0 - 방어 관문 미통과")
    elif tur["empty"] or tur["low"]:
        out.append("  ⚠ 탄이 모자란 포탑이 있다")
    return out


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
    ai = AIBridge()
    snap = snapshot(ai)
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
    dark = snap.get("dark") or []
    dark = list(dark.values()) if isinstance(dark, dict) else list(dark)
    if dark:
        print(f"  ⚠ 전기 없음 {len(dark)}: " + ", ".join(dark[:8]))
    # 위협은 «늘» 찍는다 - 포탑이 0 이면 줄이 사라지던 것이 22회차 전멸의 한 원인이다 (docs/run22-postmortem.md)
    for line in threat_lines(threat(ai)):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

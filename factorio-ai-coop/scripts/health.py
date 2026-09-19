"""What is actually running, and what stopped without saying so.

The expensive failures in this repo were never loud. A burner that runs out
of coal just stands there; a belt with no endpoint fills up and every drill
behind it goes quiet; a furnace with fuel but no ore reports nothing at all.
Measured on run16: 26 of 30 drills stalled with full belts and not one error
line anywhere.

So this asks the game the questions that catch silence:

    who is stopped, and for which of the two reasons (no fuel / nowhere to put it)
    which furnaces are lit but empty
    which belts are full (a full belt means the thing at its end is the problem)
    who is idle when there is work

    python scripts/health.py            # once
    python scripts/health.py --every 60 # keep watching
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402

REPORT = """(function()
  local s = game.surfaces[1]
  local force = game.forces.player
  local names = {}
  for k, v in pairs(defines.entity_status) do names[v] = k end
  local out = {}

  local drill = {}
  for _, d in pairs(s.find_entities_filtered{type = "mining-drill", force = force}) do
    local st = names[d.status] or "?"
    drill[st] = (drill[st] or 0) + 1
  end
  for st, n in pairs(drill) do out[#out + 1] = "drill|" .. st .. "|" .. n end

  local lit, dark, output = 0, 0, 0
  for _, f in pairs(s.find_entities_filtered{type = "furnace", force = force}) do
    local fuel = f.get_fuel_inventory().get_item_count()
    local src = f.get_inventory(defines.inventory.furnace_source).get_item_count()
    output = output + f.get_output_inventory().get_item_count()
    if fuel > 0 and src == 0 then lit = lit + 1 end
    if fuel == 0 then dark = dark + 1 end
  end
  out[#out + 1] = "furnace|lit_but_empty|" .. lit
  out[#out + 1] = "furnace|no_fuel|" .. dark
  out[#out + 1] = "furnace|output|" .. output

  -- 꽉 찬 벨트는 «그 끝»이 막혔다는 뜻이다. 칸마다 여덟이면 포화다.
  local full, belts = 0, 0
  for _, b in pairs(s.find_entities_filtered{type = "transport-belt", force = force}) do
    belts = belts + 1
    local n = 0
    for i = 1, b.get_max_transport_line_index() do n = n + #b.get_transport_line(i) end
    if n >= 8 then full = full + 1 end
  end
  out[#out + 1] = "belt|total|" .. belts
  out[#out + 1] = "belt|full|" .. full

  local arms, starved = 0, 0
  for _, i in pairs(s.find_entities_filtered{type = "inserter", force = force}) do
    arms = arms + 1
    local tank = i.get_fuel_inventory()
    if tank and tank.get_item_count() == 0 then starved = starved + 1 end
  end
  out[#out + 1] = "arm|total|" .. arms
  out[#out + 1] = "arm|no_fuel|" .. starved

  for _, c in pairs(s.find_entities_filtered{type = "container", force = force}) do
    for _, it in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
      out[#out + 1] = string.format("chest|%s|%d", it.name, it.count)
    end
  end

  local t, ammo = 0, 0
  for _, g in pairs(s.find_entities_filtered{type = "ammo-turret", force = force}) do
    t = t + 1
    ammo = ammo + g.get_inventory(defines.inventory.turret_ammo).get_item_count()
  end
  out[#out + 1] = "turret|count|" .. t
  out[#out + 1] = "turret|ammo|" .. ammo

  local hurt = 0
  for _, e in pairs(s.find_entities_filtered{force = force}) do
    if e.health and e.max_health and e.max_health > 0 and e.health < e.max_health then
      hurt = hurt + 1
    end
  end
  out[#out + 1] = "damage|hurt|" .. hurt
  out[#out + 1] = "enemy|near|" ..
    s.count_entities_filtered{type = "unit", force = "enemy",
                              position = {0, 0}, radius = 400}
  return out
end)()"""


def gather(ai: AIBridge) -> dict:
    rows = ai.lua(REPORT)
    rows = list(rows.values()) if isinstance(rows, dict) else list(rows or [])
    out: dict[str, dict[str, int]] = {}
    for row in rows:
        kind, key, n = row.split("|")
        out.setdefault(kind, {})
        out[kind][key] = out[kind].get(key, 0) + int(n)
    return out


def crew(ai: AIBridge) -> tuple[int, int, list[str]]:
    idle, busy, dead = 0, 0, []
    for w in ai.list():
        if not w.get("alive"):
            dead.append(w["name"])
        elif w.get("current") or w.get("queued"):
            busy += 1
        else:
            idle += 1
    return idle, busy, dead


def once(ai: AIBridge) -> None:
    try:
        r = gather(ai)
        idle, busy, dead = crew(ai)
    except RconError as exc:
        print(f"[health] 게임이 대답하지 않는다: {exc}")
        return

    d = r.get("drill", {})
    working = d.get("working", 0)
    stalled = {k: v for k, v in d.items() if k != "working" and v}
    f = r.get("furnace", {})
    b = r.get("belt", {})
    a = r.get("arm", {})
    print(f"채굴기 {sum(d.values())}대 (도는 것 {working}) {stalled or ''}")
    print(f"화로 불만켜짐 {f.get('lit_but_empty',0)} / 꺼짐 {f.get('no_fuel',0)} "
          f"/ 산출 {f.get('output',0)}")
    print(f"벨트 {b.get('total',0)}칸 중 포화 {b.get('full',0)}   "
          f"팔 {a.get('total',0)} 중 굶음 {a.get('no_fuel',0)}")
    chest = r.get("chest", {})
    if chest:
        print("상자 " + " ".join(f"{k}={v}" for k, v in sorted(chest.items())))
    t = r.get("turret", {})
    print(f"포탑 {t.get('count',0)}대 탄약 {t.get('ammo',0)}   "
          f"다친 것 {r.get('damage',{}).get('hurt',0)}   "
          f"적 {r.get('enemy',{}).get('near',0)}마리")
    print(f"무리 노는 사람 {idle} / 일하는 사람 {busy}"
          + (f" / 죽은 사람 {dead}" if dead else ""))

    # 한 줄로 요약되는 «지금 막힌 곳». 조용한 정지를 소리나게 만드는 자리다.
    warn = []
    if a.get("no_fuel", 0):
        warn.append(f"팔 {a['no_fuel']}개가 굶었다 - 그 뒤 채굴기가 전부 선다")
    if b.get("full", 0) > b.get("total", 1) * 0.5:
        warn.append("벨트 절반이 포화 - 줄 끝이 막혔다")
    if f.get("lit_but_empty", 0):
        warn.append(f"화로 {f['lit_but_empty']}대가 불만 켜져 있다 - 원료가 없다")
    if d.get("no_fuel", 0):
        warn.append(f"채굴기 {d['no_fuel']}대가 연료 없음")
    if t.get("count", 0) and t.get("ammo", 0) < t["count"] * 5:
        warn.append("포탑이 비었다 - 빈 총은 없는 총이다")
    if dead:
        warn.append(f"죽은 사람: {', '.join(dead)}")
    for line in warn:
        print("  [!] " + line)
    if not warn:
        print("  막힌 곳 없음")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=0, help="초. 0이면 한 번만")
    args = ap.parse_args()
    ai = AIBridge()
    while True:
        print("-" * 64)
        once(ai)
        if not args.every:
            return 0
        time.sleep(args.every)


if __name__ == "__main__":
    sys.exit(main())

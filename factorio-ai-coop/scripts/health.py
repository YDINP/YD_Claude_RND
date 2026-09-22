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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import knots as knots_mod                             # noqa: E402
import sortrows as sortrows_mod                       # noqa: E402
import wire as wire_mod                               # noqa: E402
import reserves as reserves_mod                       # noqa: E402

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

  -- 적이 «가까워지는가».
  --
  -- 17회차까지 방어의 시계를 공해로만 쟀다. 그런데 그 판은 공해가 0인
  -- 채로 전멸했다 - 확산 비율 0.02 라 한 청크를 채우기 전에 흩어진다.
  -- 적은 공해와 무관하게 «확장»으로 온다. 4분마다 무리가 떠나 새 둥지를
  -- 짓고, 169분이면 스물여덟 번이다. 92칸까지 밀고 들어와 웜을 세웠다.
  --
  -- 공해는 «화나게 하는 것»이고 확장은 «가까워지는 것»이다.
  local heart = { 0, 0 }
  local n, sx, sy = 0, 0, 0
  for _, e in pairs(s.find_entities_filtered{type = {"mining-drill", "furnace", "lab"},
                                             force = force}) do
    n = n + 1; sx = sx + e.position.x; sy = sy + e.position.y
  end
  if n > 0 then heart = { sx / n, sy / n } end
  out[#out + 1] = "enemy|near|" ..
    s.count_entities_filtered{type = "unit", force = "enemy",
                              position = heart, radius = 120}
  out[#out + 1] = "enemy|nests|" ..
    s.count_entities_filtered{type = "unit-spawner", force = "enemy",
                              position = heart, radius = 150}
  out[#out + 1] = "enemy|worms|" ..
    s.count_entities_filtered{type = "turret", force = "enemy",
                              position = heart, radius = 150}
  local near, nd = nil, 1e9
  for _, sp in pairs(s.find_entities_filtered{type = "unit-spawner", force = "enemy"}) do
    local dx, dy = sp.position.x - heart[1], sp.position.y - heart[2]
    local d = dx * dx + dy * dy
    if d < nd then nd, near = d, sp end
  end
  out[#out + 1] = "enemy|gap|" .. (near and math.floor(math.sqrt(nd)) or 999)
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


# 세우라고 만든 것들. 이것이 가방에 «쌓여 있으면» 세우기가 실패한 것이다.
PLACEABLE = ("burner-mining-drill", "electric-mining-drill", "stone-furnace",
             "steel-furnace", "gun-turret", "wooden-chest", "iron-chest",
             "transport-belt", "burner-inserter", "inserter", "small-electric-pole",
             "lab", "boiler", "steam-engine", "offshore-pump", "stone-wall")


def unplaced(ai: AIBridge) -> dict:
    """무리의 가방에 든 «세울 것»들.

    이 저장소가 한 회차에 «다섯 번» 겪은 고장이 전부 같은 모양이었다.

        탄약을 만들고 넣기 전에 걸어가서 - 포탑이 빈 총으로 섰다
        포탑을 만들고 자리까지 걷는 새 - 가방에 쌓였다
        상자를 만들고 그 자리에서 - 걸음이 없어 늘 가방에 남았다
        연구를 걸고 답을 안 봐서 - 과학팩만 먹였다
        채굴기 여덟을 만들고 한 자리에서 - 일곱이 사거리 밖이라 가방에 남았다

    다섯 번 다 «명령은 나갔고» 로그는 「했다」고 찍혔다. 공통된 자국은
    하나뿐이었다 - 만든 것이 가방에 남아 있었다.

        세우라고 만든 것이 가방에 있으면, 그것은 «아직 안 된 일»이다.

    그래서 증상이 아니라 «자국»을 본다. 어느 고리가 무슨 이유로 실패했는지
    몰라도, 이 한 줄이 실패를 소리나게 만든다.
    """
    held: dict = {}
    for w in ai.list():
        if not w.get("alive"):
            continue
        try:
            bag = ai.agent(w["name"]).items()
        except RconError:
            continue
        for name in PLACEABLE:
            n = int(bag.get(name, 0))
            if n:
                held[name] = held.get(name, 0) + n
    return held


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
    e = r.get("enemy", {})
    print(f"포탑 {t.get('count',0)}대 탄약 {t.get('ammo',0)}   "
          f"다친 것 {r.get('damage',{}).get('hurt',0)}")
    print(f"적 120칸 안 {e.get('near',0)}마리   둥지 150칸 안 {e.get('nests',0)}곳"
          f"   웜 {e.get('worms',0)}기   가장 가까운 둥지 {e.get('gap',0)}칸")
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
    # 벨트가 «마주 서 있나». 21회차까지 이것을 재는 것이 하나도 없었고,
    # 그래서 521칸 중 네 쌍이 마주 선 채로 「꼬임이 풀렸다」고 말했다.
    # 재지 않는 것은 언제나 괜찮아 보인다.
    try:
        world = knots_mod.belts(ai)
        kinds = knots_mod.sort_knots(world, knots_mod.head_on(world))
        hurt = sum(len(v) for v in kinds.values())
        if hurt:
            bits = ", ".join(f"{k} {len(v)}곳" for k, v in kinds.items() if v)
            warn.append(f"벨트가 마주 서 있다 ({bits})"
                        f" - scripts/knots.py --fix")
    except RconError:
        pass

    # 석탄은 «수준»이 아니라 «바닥»을 본다. 21회차에 10,878 이 64 가 될
    # 때까지 아무 경고도 없었다 - 재고 줄에 숫자는 찍혔지만 그 숫자가
    # 위험한지는 아무도 말하지 않았다. 버너 기지에서 석탄 0 은 전부 0 이다:
    # 석탄 채굴기도 석탄으로 돈다.
    try:
        coal = int(ai.lua("""(function()
          local n = 0
          for _, c in pairs(game.surfaces[1].find_entities_filtered{
                type = "container", force = game.forces.player}) do
            n = n + c.get_inventory(defines.inventory.chest).get_item_count("coal")
          end
          return { coal = n }
        end)()""")["coal"])
        if coal < 300:
            warn.append(f"석탄이 바닥이다 ({coal}개) - 석탄 채굴기도 석탄으로 돈다."
                        " 꺼지면 스스로 못 살아난다")
    except (RconError, KeyError, TypeError, ValueError):
        pass

    # 석탄이 «왜» 바닥인지는 위의 숫자가 말해 주지 않는다. 세 번을 「채굴기가
    # 굶는다」로 읽고 연료를 넣었는데, 실은 석탄 선반이 철판으로 가득해서
    # 석탄이 들어갈 칸이 없었다. 증상 옆에 원인을 같이 잰다.
    try:
        depot = sortrows_mod.DEPOT
        mixed = {}
        for _box, item, count in sortrows_mod.strangers(
                sortrows_mod.survey(ai, depot), depot):
            mixed[item] = mixed.get(item, 0) + count
        if sum(mixed.values()) >= 500:
            top = sorted(mixed.items(), key=lambda kv: -kv[1])[:3]
            warn.append("벨트가 채울 선반에 남의 물건이 들었다 ("
                        + ", ".join(f"{k} {v}" for k, v in top)
                        + ") - scripts/sortrows.py")
    except (RconError, KeyError, TypeError, ValueError):
        pass

    # 전봇대는 «선 수»가 아니라 «망의 수»를 센다.
    try:
        main_net, nets = wire_mod.networks(ai)
        if main_net >= 0 and len(nets) > 1:
            warn.append(f"전력망이 {len(nets)}토막이다 - scripts/wire.py")
    except (RconError, KeyError, TypeError, ValueError):
        pass

    # 고갈은 갑자기 온다. 채굴기 아래 광석 / 시간당 채굴량이 열두 시간
    # 아래로 내려오면 여기서 먼저 말한다 (reserves.py).
    try:
        warn.extend(reserves_mod.report(ai))
    except (RconError, KeyError, TypeError, ValueError, ZeroDivisionError):
        pass

    # 공해가 적을 부른다. 사용자: "공해도가 높아질수록 더 강하고 많은적이
    # 오는걸 생각할 것." 진화도(evolution)는 공해 누적·시간·둥지 파괴로
    # 오르고, 0.5 부터 중형, 0.9 부터 대형이 무리에 섞인다. 공습 규모는
    # «둥지에 닿는 공해량»이다 - 구름이 둥지까지 못 가면 습격도 없다.
    try:
        air = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local st = f.get_item_production_statistics(s)
          local ps = game.get_pollution_statistics(s)
          local made = 0
          for name, _ in pairs(ps.input_counts) do
            made = made + ps.get_flow_count{name = name, category = "input",
                      precision_index = defines.flow_precision_index.one_hour}
          end
          local evo = game.forces.enemy.get_evolution_factor(s)
          local n, far = 0, nil
          for _, sp in pairs(s.find_entities_filtered{type = "unit-spawner"}) do
            n = n + 1
            local d = ((sp.position.x + 40) ^ 2 + (sp.position.y - 30) ^ 2) ^ 0.5
            if not far or d < far then far = d end
          end
          local cloud = 0
          for c in s.get_chunks() do
            if s.get_pollution({c.x * 32 + 16, c.y * 32 + 16}) > 1 then cloud = cloud + 1 end
          end
          return { evo = evo, made = made, nests = n, nearest = far or -1, cloud = cloud }
        end)()""")
        evo = float(air["evo"])
        tier = "소형" if evo < 0.3 else "소·중형" if evo < 0.5 else "중형" if evo < 0.9 else "대형"
        line = (f"진화 {evo:.2f} ({tier}) · 시간당 공해 {float(air['made']):,.0f}"
                f" · 구름 {int(air['cloud'])}청크 · 둥지 {int(air['nests'])}곳"
                + (f" (가장 가까운 {float(air['nearest']):.0f}칸)" if float(air["nearest"]) > 0 else ""))
        print("  " + line)
        if evo >= 0.5 and int(air["nests"]):
            warn.append("진화도 0.5 이상 - 중형 바이터가 온다. 돌벽 없는 외곽 포탑은 버틸 수 없다")
        if int(air["cloud"]) > 300:
            warn.append(f"공해 구름이 {int(air['cloud'])}청크 - 둥지에 닿으면 그 크기만큼 습격이 온다")
    except (RconError, KeyError, TypeError, ValueError):
        pass

    stuck = unplaced(ai)
    # 벨트와 팔은 늘 조금씩 들고 다닌다(한 걸음 몫). 쌓이는 것만 본다.
    loud = {k: v for k, v in stuck.items()
            if v >= (8 if k in ("transport-belt", "burner-inserter",
                                "inserter", "small-electric-pole") else 2)}
    if loud:
        warn.append("세울 것이 가방에 쌓였다 - 세우기가 실패하고 있다: "
                    + ", ".join(f"{k} {v}" for k, v in sorted(loud.items())))
    if t.get("count", 0) and t.get("ammo", 0) < t["count"] * 5:
        warn.append("포탑이 비었다 - 빈 총은 없는 총이다")
    # 17회차는 공해 0으로 전멸했다. 적은 확장으로 «걸어온다».
    if not t.get("count", 0):
        warn.append(f"포탑이 한 대도 없다 - 가장 가까운 둥지 {e.get('gap',0)}칸")
    # 웜은 판이 열릴 때부터 있을 수 있다. 「확장했다」고 단정하지 않는다 -
    # 틀린 경보는 다음 경보까지 같이 무시하게 만든다.
    if e.get("worms", 0):
        warn.append(f"웜 {e['worms']}기가 150칸 안에 있다 - 지나가면 물린다")
    if e.get("nests", 0):
        warn.append(f"둥지 {e['nests']}곳이 150칸 안에 있다")
    if e.get("near", 0) >= 10:
        warn.append(f"적 {e['near']}마리가 120칸 안에 있다 - 습격이다")
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

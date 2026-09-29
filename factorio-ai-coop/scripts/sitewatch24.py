"""Site watch for run 24: every 5 minutes, per zone - output and how many buildings still stand.

23회차 복기 §3-19: 철 전초 서반부가 공습으로 ~9 시간 조용히 깎였다 (채굴기 13 · 포탑 17 · 전봇대 14 · 벨트 47).
중계는 다 살아 있었고 «전초 손실을 알리는 줄» 이 없었다. 그래서 처음부터 구역마다 한 줄을 찍는다:

    구역 <이름>: 생산 N · 설비 M/M0        (M0 = 그 구역에서 지금까지 본 가장 많은 설비 수)

떨어지면 (설비 M < M0 · 생산이 앞 구간의 절반 미만 · 포탑 탄 < 5 · 생존 < 8) 그 줄에 «경보» 를 넣는다.

생산 N 의 뜻은 구역 종류마다 다르다:
    smelt / asm  화로 · 조립기 products_finished 의 5 분 증가 (판 · 팩 · 탄창 개수)
    drill        일하는 채굴기 수 (상자로 쏟는 채굴기는 셀 카운터가 없다)
    power        증기 기관 발전 kW (지금)
    turret       포탑에 든 탄창 합
    wall         벽 수 (설비 M/M0 이 곧 손실)

구역은 state/{run}_zones.json {"이름": {"kind": ..., "box": [x0, y0, x1, y1]}} - 없으면 아래 기본값으로 만든다.
새 구역 (전기 채굴 기둥 · 조립 줄) 은 그 파일에 한 줄 더하면 다음 순번부터 찍힌다.

    python scripts/sitewatch24.py --run run24 --once
    python scripts/sitewatch24.py --run run24 --every 300 --log <경로>
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402

CREW = ("alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel")
ZONES = runsite.path("zones")
MEMO = runsite.path("sitewatch")
DEFAULT_LOG = ("C:/Users/parkk/AppData/Local/Temp/claude/D--park-YD-Claude-RND/"
               "9b205ba9-e407-40e8-bb8a-4dff044957ad/scratchpad/loops/sitewatch24.log")

# 24회차 P0 끝 (tick 160k) 의 배치
DEFAULT_ZONES = {
    "철제련": {"kind": "smelt", "box": [68, -60, 100, -50]},
    "구리제련": {"kind": "smelt", "box": [65, 70, 85, 80]},
    "석탄": {"kind": "drill", "box": [100, -30, 118, -20]},
    "발전": {"kind": "power", "box": [-56, 4, -34, 20]},
    "연구소": {"kind": "lab", "box": [-50, 4, -34, 12]},
    "포탑": {"kind": "turret", "box": [-400, -400, 400, 400]},
}

# 구역 종류마다 세는 설비 (전봇대 · 벨트 · 팔도 센다 - 23회차에 끊긴 것은 전봇대 한 개였다)
TYPES = {
    "smelt": ["furnace", "mining-drill", "inserter", "transport-belt", "electric-pole"],
    "drill": ["mining-drill", "container", "inserter", "transport-belt", "electric-pole"],
    "asm": ["assembling-machine", "inserter", "container", "electric-pole", "transport-belt"],
    "power": ["boiler", "generator", "offshore-pump", "electric-pole", "pipe", "inserter"],
    "lab": ["lab", "inserter", "electric-pole"],
    "turret": ["ammo-turret"],
    "wall": ["wall", "gate"],
}

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local Z = helpers.json_to_table('%s')
  local out = {tick = game.tick, zones = {}, alive = {}}
  for name, z in pairs(Z) do
    local b = z.box
    local area = {{b[1], b[2]}, {b[3], b[4]}}
    local ents = s.find_entities_filtered{force = f, area = area, type = z.types}
    local r = {count = #ents, done = 0, working = 0, kw = 0, ammo = 0, low = 0}
    for _, e in pairs(ents) do
      if e.type == "furnace" or e.type == "assembling-machine" then r.done = r.done + (e.products_finished or 0) end
      if e.type == "mining-drill" and e.status == defines.entity_status.working then r.working = r.working + 1 end
      if e.type == "generator" then r.kw = r.kw + (e.energy_generated_last_tick or 0) * 60 / 1000 end
      if e.type == "lab" and e.status == defines.entity_status.working then r.working = r.working + 1 end
      if e.type == "ammo-turret" then
        local n = 0
        for _, v in pairs(e.get_inventory(defines.inventory.turret_ammo).get_contents()) do n = n + v.count end
        r.ammo = r.ammo + n
        if n < 5 then r.low = r.low + 1 end
      end
    end
    out.zones[name] = r
  end
  for _, c in pairs(s.find_entities_filtered{type = "character", force = "player"}) do out.alive[#out.alive+1] = c.name end
  return out
end)()"""


def zones() -> dict:
    try:
        return json.load(open(ZONES, encoding="utf-8"))
    except (OSError, ValueError):
        json.dump(DEFAULT_ZONES, open(ZONES, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return dict(DEFAULT_ZONES)


def memo() -> dict:
    try:
        return json.load(open(MEMO, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def alive_count(ai) -> int:
    try:
        live = {w["name"]: w for w in ai.list()}
    except RconError:
        return -1
    return sum(1 for n in CREW if n in live and live[n].get("alive", True))


def snapshot(ai, zs: dict) -> dict:
    q = {n: {"box": z["box"], "types": TYPES.get(z["kind"], TYPES["smelt"])} for n, z in zs.items()}
    blob = json.dumps(q, ensure_ascii=False).replace("\\", "\\\\").replace("'", "\\'")
    r = ai.lua(LUA % blob)
    return r.get("zones") or {}


def judge(name: str, z: dict, r: dict, m: dict, dt_ticks: int) -> tuple:
    """(한 줄, 경보?) - m 은 이 구역의 기억 {m0, done, prod}."""
    kind = z["kind"]
    count = int(r.get("count", 0))
    m0 = max(int(m.get("m0", 0)), count)
    alarm = []
    if count < m0:
        alarm.append(f"설비 {m0 - count} 줄어듦")
    if kind in ("smelt", "asm"):
        done = int(r.get("done", 0))
        prev = m.get("done")
        prod = done - prev if prev is not None and done >= prev else None
        if prev is not None and done < prev:
            alarm.append("카운터 되감김 (설비가 바뀜)")
        last = m.get("prod")
        if prod is not None and last and last >= 20 and prod < last / 2:
            alarm.append(f"생산 {last} -> {prod} 절반 밑")
        if prod is not None and prod == 0 and count > 0:
            alarm.append("생산 0")
        m.update(done=done, prod=prod if prod is not None else m.get("prod"))
        shown = "-" if prod is None else str(prod)
    elif kind == "drill" or kind == "lab":
        prod = int(r.get("working", 0))
        last = m.get("prod")
        if last and prod < last / 2:
            alarm.append(f"가동 {last} -> {prod}")
        if count > 0 and prod == 0 and kind == "drill":
            alarm.append("가동 0")
        m["prod"] = prod
        shown = f"{prod} 가동"
    elif kind == "power":
        prod = int(r.get("kw", 0))
        m["prod"] = prod
        shown = f"{prod} kW"
        if count > 0 and prod == 0:
            alarm.append("발전 0")
    elif kind == "wall":
        m["prod"] = count
        shown = f"벽 {count}"
    else:  # turret
        prod = int(r.get("ammo", 0))
        m["prod"] = prod
        shown = f"탄창 {prod}"
        if r.get("low"):
            alarm.append(f"탄 5 미만 포탑 {r['low']}")
    m["m0"] = m0
    line = f"구역 {name}: 생산 {shown} · 설비 {count}/{m0}"
    if alarm:
        line += " · 경보 " + ", ".join(alarm)
    return line, bool(alarm)


def once(ai, log) -> None:
    zs = zones()
    mem = memo()
    snap = snapshot(ai, zs)
    stamp = time.strftime("%H:%M:%S")
    lines = []
    for name, z in zs.items():
        if name not in snap:
            continue
        line, _ = judge(name, z, snap[name], mem.setdefault(name, {}), 0)
        lines.append(line)
    alive = alive_count(ai)
    lines.append(f"생존 {alive}/8" + (" · 경보 사람이 줄었다" if 0 <= alive < 8 else ""))
    json.dump(mem, open(MEMO, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    text = "\n".join(f"{stamp} {l}" for l in lines)
    print(text, flush=True)
    if log:
        os.makedirs(os.path.dirname(log), exist_ok=True)
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=300)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--log", default=DEFAULT_LOG)
    a = ap.parse_args()
    ai = None
    while True:
        try:
            ai = ai or AIBridge()
            once(ai, a.log)
        except (RconError, OSError) as e:
            print(f"{time.strftime('%H:%M:%S')} 오류 {e}", flush=True)
            ai = None
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

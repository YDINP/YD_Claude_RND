"""Raid watch for run 24: pollution cloud reach per bearing, nest direction, raid log - every 5 minutes one block.

P2 목표 1: 공해가 커지면 첫 공습은 가장 가까운 둥지 방향에서 온다. 그 방향을 «미리» 알고 방어를 세운다.
공습 규모 = 둥지가 빨아들인 공해 (docs/playbook.md «포탑은 사거리 안에 셋» · 메모리 «공해가 물결을 부른다»).

한 순번에 찍는 것 (기지 중심 run24_site.center 기준, 방위 8 개 - 45° 부채꼴):
    구름 <방위>: 반경 R · 둥지(본 것) D · 틈 D-R          - 본 것 = seen.py 장부의 적 구조물 (걸어서 본 것만)
    흡수 <방위>: 공해가 닿은 둥지 N                       - 안전 판정 (지도를 열지 않는다, 좌표는 적지 않는다)
    적 유닛 기지 200 안 N · 포탑 피격 · 잃은 것 / 잡은 것 (kill 통계 증가)
공해가 닿은 둥지가 생기면 «경보 흡수 <방위>» - 그 방위에서 공격대가 나온다. 방어는 그 방위 면부터.
적 유닛이 기지 200 안에 들어오면 state/{run}_raids.json 에 한 건 (tick · 방위 · 수) 을 더한다.

    python scripts/raidwatch24.py --run run24 --once
    python scripts/raidwatch24.py --run run24 --every 300
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                          # noqa: E402
from client import AIBridge, RconError  # noqa: E402

CX, CY = runsite.center()
SEEN = runsite.path("seen")
RAIDS = runsite.path("raids")
DEFAULT_LOG = ("C:/Users/parkk/AppData/Local/Temp/claude/D--park-YD-Claude-RND/"
               "9b205ba9-e407-40e8-bb8a-4dff044957ad/scratchpad/loops/raidwatch24.log")
BEARINGS = ("E", "SE", "S", "SW", "W", "NW", "N", "NE")      # 게임 좌표: y 가 아래로 (+y = 남)
NEAR = 200
PROBE = 900        # 방위별 둥지 거리 조회 반경 (정찰 800 의 조금 밖)


def bearing(dx, dy) -> str:
    a = math.degrees(math.atan2(dy, dx)) % 360          # 0 = 동, 90 = 남
    return BEARINGS[int(((a + 22.5) % 360) // 45)]


LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local cx, cy, near = %f, %f, %d
  local out = {tick = game.tick, evo = game.forces.enemy.get_evolution_factor(s), cloud = {}, absorb = {}, units = {}, hurt = 0}
  for c in s.get_chunks() do
    local x, y = c.x * 32 + 16, c.y * 32 + 16
    local p = s.get_pollution({x, y})
    if p > 0 then out.cloud[#out.cloud+1] = string.format("%%d,%%d,%%.0f", x, y, p) end
  end
  for _, e in pairs(s.find_entities_filtered{force = "enemy", type = "unit-spawner"}) do
    if s.get_pollution(e.position) > 0 then
      out.absorb[#out.absorb+1] = string.format("%%.0f,%%.0f", e.position.x - cx, e.position.y - cy)
    end
  end
  -- 방위별 가장 가까운 둥지 거리 (안전 조회 - walkscout 출정 조건과 같은 종류, 좌표는 적지 않는다 · 지도 안 엶)
  out.probe = {}
  for _, e in pairs(s.find_entities_filtered{force = "enemy", type = "unit-spawner", position = {cx, cy}, radius = %d}) do
    out.probe[#out.probe+1] = string.format("%%.0f,%%.0f", e.position.x - cx, e.position.y - cy)
  end
  for _, u in pairs(s.find_entities_filtered{force = "enemy", type = "unit", position = {cx, cy}, radius = near}) do
    out.units[#out.units+1] = string.format("%%.0f,%%.0f", u.position.x - cx, u.position.y - cy)
  end
  -- 물가 블록 (발전 · 연구소 · 조립 줄) 은 중심에서 ~120 서쪽 - 그 둘레도 본다
  for _, u in pairs(s.find_entities_filtered{force = "enemy", type = "unit", position = {-50, 5}, radius = 120}) do
    out.units[#out.units+1] = string.format("%%.0f,%%.0f", u.position.x - cx, u.position.y - cy)
  end
  for _, t in pairs(s.find_entities_filtered{force = f, type = {"ammo-turret", "wall", "gate"}}) do
    if t.health < t.max_health then out.hurt = out.hurt + 1 end
  end
  local ks = f.get_kill_count_statistics(s)
  local lost, killed = 0, 0
  for _, v in pairs(ks.output_counts) do lost = lost + v end
  for _, v in pairs(ks.input_counts) do killed = killed + v end
  out.lost, out.killed = lost, killed
  return out
end)()"""


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def seen_nests() -> list:
    try:
        d = json.load(open(SEEN, encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [(e["name"], e["x"], e["y"]) for e in (d.get("enemies") or {}).values()]


def load_raids() -> dict:
    try:
        return json.load(open(RAIDS, encoding="utf-8"))
    except (OSError, ValueError):
        return {"events": [], "lost": None, "killed": None}


def once(ai, log) -> dict:
    r = ai.lua(LUA % (CX, CY, NEAR, PROBE))
    reach = {b: 0 for b in BEARINGS}
    peak = {b: 0.0 for b in BEARINGS}
    for row in _rows(r.get("cloud")):
        x, y, p = (float(v) for v in str(row).split(","))
        d = math.hypot(x - CX, y - CY)
        b = bearing(x - CX, y - CY)
        if d > reach[b]:
            reach[b] = d
        peak[b] = max(peak[b], p)
    nest = {b: None for b in BEARINGS}
    for name, x, y in seen_nests():
        d = math.hypot(x - CX, y - CY)
        b = bearing(x - CX, y - CY)
        if nest[b] is None or d < nest[b][0]:
            nest[b] = (d, name)
    probe = {}
    for row in _rows(r.get("probe")):
        dx, dy = (float(v) for v in str(row).split(","))
        b, d = bearing(dx, dy), math.hypot(dx, dy)
        if b not in probe or d < probe[b][0]:
            probe[b] = (d, 0)
        probe[b] = (probe[b][0], probe[b][1] + 1)
    absorb = {}
    for row in _rows(r.get("absorb")):
        dx, dy = (float(v) for v in str(row).split(","))
        b = bearing(dx, dy)
        absorb[b] = absorb.get(b, 0) + 1
    units = {}
    for row in _rows(r.get("units")):
        dx, dy = (float(v) for v in str(row).split(","))
        b = bearing(dx, dy)
        units[b] = units.get(b, 0) + 1
    raids = load_raids()
    lost, killed = int(r.get("lost", 0)), int(r.get("killed", 0))
    d_lost = lost - raids["lost"] if raids.get("lost") is not None else 0
    d_killed = killed - raids["killed"] if raids.get("killed") is not None else 0
    if units or d_lost > 0:
        raids["events"].append({"tick": r["tick"], "time": time.strftime("%H:%M"), "units": units,
                                "lost": d_lost, "killed": d_killed, "hurt": r.get("hurt", 0)})
    raids["lost"], raids["killed"] = lost, killed
    json.dump(raids, open(RAIDS, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    stamp = time.strftime("%H:%M:%S")
    lines = [f"{stamp} tick {r['tick']} · 진화 {float(r['evo']):.3f} · 공해 청크 {len(_rows(r.get('cloud')))}"]
    def near_nest(b):
        ds = [v for v in ((nest[b] or (None,))[0], (probe.get(b) or (None,))[0]) if v is not None]
        return min(ds) if ds else None
    order = sorted(BEARINGS, key=lambda b: (near_nest(b) - reach[b]) if near_nest(b) else 1e9)
    for b in order:
        n, q = nest[b], probe.get(b)
        gap = f" · 둥지(본 것) {n[0]:.0f} {n[1]}" if n else " · 둥지(본 것) -"
        gap += f" · 둥지(조회) {q[0]:.0f} ×{q[1]}" if q else ""
        if near_nest(b):
            gap += f" · 틈 {near_nest(b) - reach[b]:.0f}"
        lines.append(f"{stamp}   구름 {b:<2}: 반경 {reach[b]:.0f} (최고 {peak[b]:.0f}){gap}"
                     + (f" · 경보 흡수 둥지 {absorb[b]}" if absorb.get(b) else ""))
    lines.append(f"{stamp}   흡수 둥지 {sum(absorb.values())} {absorb or ''} · 기지 {NEAR} 안 적 유닛 {sum(units.values())} {units or ''}"
                 f" · 다친 포탑·벽 {r.get('hurt', 0)} · 잃은 것 +{d_lost} · 잡은 것 +{d_killed} · 공습 기록 {len(raids['events'])}")
    text = "\n".join(lines)
    print(text, flush=True)
    if log:
        os.makedirs(os.path.dirname(log), exist_ok=True)
        with open(log, "a", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return {"reach": reach, "absorb": absorb, "units": units, "probe": probe}


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

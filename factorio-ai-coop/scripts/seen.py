"""Walked-sight ledger: which chunks a body has actually stood near. No map opening.

24회차 (2026-09-29): 새 판에서 밝혀진 청크가 0 이었다. 모드의 chart_underfoot 는 force.chart 로
몸 곁 64칸을 밝히는데, 헤드리스 서버에 접속한 플레이어가 없으면 차트가 처리되지 않는다 (23회차도
사용자 접속 전 0). 그러면 survey.py 는 아무것도 못 본다.

그래서 «누가 어디에 서 봤나» 를 따로 적는다: 2초마다 캐릭터 위치를 묻고, 그 몸의 시야
(chart_underfoot 와 같은 64칸 = 청크 둘) 안의 청크를 state/{run}_seen.json 에 더한다.
시야 안의 적 구조물도 같이 적는다. force.chart 는 쓰지 않는다 - 지도는 여전히 걸은 만큼만 안다.

    python scripts/seen.py --run run24            # 상주
    python scripts/seen.py --run run24 --once     # 한 번 적고 요약
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

SIGHT = 64          # chart_underfoot 의 WALK_SIGHT 와 같다
PATH = runsite.path("seen")

SNAP = """(function()
  local s = game.surfaces[1]
  local out = {bodies = {}, enemies = {}}
  local seen = {}
  for _, c in pairs(s.find_entities_filtered{type = "character", force = "player"}) do
    local p = c.position
    out.bodies[#out.bodies+1] = string.format("%%.0f,%%.0f", p.x, p.y)
    for _, e in pairs(s.find_entities_filtered{force = "enemy", type = {"unit-spawner", "turret"},
        area = {{p.x - %d, p.y - %d}, {p.x + %d, p.y + %d}}}) do
      local k = string.format("%%s|%%.0f|%%.0f", e.name, e.position.x, e.position.y)
      if not seen[k] then seen[k] = true; out.enemies[#out.enemies+1] = k end
    end
  end
  out.tick = game.tick
  return out
end)()""" % (SIGHT, SIGHT, SIGHT, SIGHT)


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def load() -> dict:
    try:
        d = json.load(open(PATH, encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    d.setdefault("chunks", [])
    d.setdefault("enemies", {})
    return d


def chunks_near(x, y) -> set:
    x0, x1 = int((x - SIGHT) // 32), int((x + SIGHT) // 32)
    y0, y1 = int((y - SIGHT) // 32), int((y + SIGHT) // 32)
    return {f"{cx},{cy}" for cx in range(x0, x1 + 1) for cy in range(y0, y1 + 1)}


def record(ai, d) -> int:
    r = ai.lua(SNAP)
    known = set(d["chunks"])
    before = len(known)
    for b in _rows(r.get("bodies")):
        x, y = (float(v) for v in str(b).split(","))
        known |= chunks_near(x, y)
    for e in _rows(r.get("enemies")):
        name, x, y = str(e).split("|")
        d["enemies"].setdefault(f"{x},{y}", {"name": name, "x": float(x), "y": float(y), "first_tick": r.get("tick")})
    d["chunks"] = sorted(known)
    d["tick"] = r.get("tick")
    tmp = PATH + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"))
    os.replace(tmp, PATH)
    return len(known) - before


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=2.0)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    d = load()
    last_e = len(d["enemies"])
    while True:
        try:
            new = record(ai, d)
            if new or len(d["enemies"]) != last_e:
                print(time.strftime("%X"), f"청크 {len(d['chunks'])} (+{new}) · 적 구조물 {len(d['enemies'])}", flush=True)
                last_e = len(d["enemies"])
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc, flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

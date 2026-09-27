"""구리 전초 (52,-401) 경로 - 방어선 안 구간 (resource-expansion-plan 4절 C1, rebuild-plan-run23 «구리 전초 경로»).

--inner 구간 (벨트 110, 지하 4):
  y=-117.5 서향 x 50.5..-42.5 (94)        벽 앞 5칸, 북쪽 포탑 줄 사거리 안
  x=-43.5 남향 y -117.5..-114.5 (4)
  지하 (-43.5,-113.5) -> (-43.5,-110.5)     돌벽 y -112.5/-111.5 밑
  x=-43.5 남향 y -109.5..-107.5 (3)        포탑 사이 빈 기둥
  지하 (-43.5,-106.5) -> (-43.5,-104.5)     포탑 탄 벨트 y=-105.5 밑
  x=-43.5 남향 y -103.5..-95.5 (9)         -> (-43.5,-94.5) 서향 벨트에 북쪽 옆치기
유령만 놓는다 (망 2 로봇이 재고로 짓는다). 이미 같은 방향 벨트·유령이 있으면 건너뛰고,
한 칸이라도 can_place 가 아니면 (--force 없이는) 아무것도 놓지 않는다. 철거·해체 없음. 바깥 구간(x=50.5 간선)은 H2 전까지 놓지 않는다.

    python -u scripts/copperroute23.py --inner            # 건식 (칸 검사 표)
    python -u scripts/copperroute23.py --inner --apply    # 유령 설치
    python -u scripts/copperroute23.py --inner --verify   # 지어진 수 · 남은 유령
"""
import argparse
import json
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

X = -43.5


def inner():
    """(이름, x, y, 방향, 지하 종류)"""
    c = [("transport-belt", x + 0.5, -117.5, "west", None) for x in range(50, -43, -1)]  # 50.5 .. -42.5
    c += [("transport-belt", X, y, "south", None) for y in (-117.5, -116.5, -115.5, -114.5)]
    c += [("underground-belt", X, -113.5, "south", "input"), ("underground-belt", X, -110.5, "south", "output")]
    c += [("transport-belt", X, y, "south", None) for y in (-109.5, -108.5, -107.5)]
    c += [("underground-belt", X, -106.5, "south", "input"), ("underground-belt", X, -104.5, "south", "output")]
    c += [("transport-belt", X, -103.5 + i, "south", None) for i in range(9)]  # -103.5 .. -95.5
    return c


LUA = r"""(function()
local s = game.surfaces[1]
local MODE = '%(mode)s' local FORCE = %(force)s
local C = %(cells)s
local o = {place = 0, have = 0, ghost = 0, bad = {}, made = 0, built = 0, left = 0}
local todo = {}
for _, c in pairs(C) do
  local p = {x = c[2], y = c[3]} local d = defines.direction[c[4]]
  local e = s.find_entities_filtered{name = c[1], position = p, radius = 0.3}[1]
  local g = s.find_entities_filtered{ghost_name = c[1], position = p, radius = 0.3}[1]
  if e and e.direction == d then o.have = o.have + 1 o.built = o.built + 1
  elseif g and g.direction == d then o.ghost = o.ghost + 1 o.left = o.left + 1
  else
    local ok = s.can_place_entity{name = c[1], position = p, direction = d, force = 'player', build_check_type = defines.build_check_type.manual_ghost}
    if ok then o.place = o.place + 1 todo[#todo + 1] = c
    else
      local es = {} for _, x in pairs(s.find_entities_filtered{position = p, radius = 0.4}) do
        es[#es + 1] = x.name .. '/' .. (x.last_user and x.last_user.name or '-') end
      o.bad[#o.bad + 1] = c[2] .. ',' .. c[3] .. ' ' .. table.concat(es, ',')
    end
  end
end
if MODE == 'apply' and (#o.bad == 0 or FORCE) then
  for _, c in pairs(todo) do
    local args = {name = 'entity-ghost', inner_name = c[1], position = {c[2], c[3]}, direction = defines.direction[c[4]], force = 'player'}
    if c[5] then args.type = c[5] end
    local g = s.create_entity(args)
    if g then o.made = o.made + 1 if c[5] and g.belt_to_ground_type ~= c[5] then o.bad[#o.bad + 1] = 'ug-type ' .. c[2] .. ',' .. c[3] end end
  end
end
local net for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end
if net then o.net = {belt = net.get_item_count('transport-belt'), ug = net.get_item_count('underground-belt')} end
-- 흐름: 합류점 북쪽 레인
local j = s.find_entities_filtered{type = 'transport-belt', position = {%(x)s, -94.5}, radius = 0.3}[1]
if j then o.join = j.direction .. ' items=' .. j.get_transport_line(1).get_item_count() .. '/' .. j.get_transport_line(2).get_item_count() end
return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inner", action="store_true", help="방어선 안 구간 (지금 쓰는 유일한 구간)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--force", action="store_true", help="막힌 칸이 있어도 나머지 놓기")
    a = ap.parse_args()
    if not a.inner:
        print("바깥 구간은 H2 전까지 놓지 않는다. --inner 만 지원.")
        return 1
    cells = inner()
    lua_cells = "{" + ", ".join("{'%s', %s, %s, '%s', %s}" % (n, x, y, d, "'%s'" % t if t else "nil")
                                for n, x, y, d, t in cells) + "}"
    mode = "apply" if a.apply else "check"
    r = AIBridge().lua(LUA % {"mode": mode, "force": "true" if a.force else "false", "cells": lua_cells, "x": X})
    bad = r.get("bad") or {}
    bad = list(bad.values()) if isinstance(bad, dict) else bad
    print(f"칸 {len(cells)} | 지어짐 {r.get('have')} | 유령 {r.get('ghost')} | 놓을 수 있음 {r.get('place')} | "
          f"막힘 {len(bad)} | 이번에 놓음 {r.get('made')} | 망2 {r.get('net')} | 합류 {r.get('join')}")
    for b in bad:
        print("  막힘", b)
    if a.verify:
        print(json.dumps({"built": r.get("built"), "ghost_left": r.get("left")}, ensure_ascii=False))
    return 0 if not bad else 2


if __name__ == "__main__":
    raise SystemExit(main())

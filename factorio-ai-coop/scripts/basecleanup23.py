"""기지 용광로 정리 (사용자 07:55: «기지에선 조립만 · 기지 내부의 용광로들은 정리») - 전초 판 도착 확인 뒤 단계별.

cu2    구리 강철 화로 x=-61 (8) · 돌 화로 x=-72.5 중 구리 레시피 (4) + 그 화로에 닿은 팔 해체 (출력 벨트에 소비자 없음, 중계 참조 없음).
       벽돌 화로 · 강철 레시피 화로는 둔다.
cu     구리 cusmelt 기지 줄 (y=-98 돌 화로 16 + 입력 팔 16) 해체. 구리판은 줄 끝에서 smeltcol23 이 망으로. 벨트 · 전봇대 · 조립기는 둔다.
fe     철 전초 판을 «벨트로» 조립 줄에 다시 잇는다 (Lua 옮김 대신):
         1) 석탄 옆치기 (-51.5,-46.5) 해체 - col41 연료였다. 없애지 않으면 석탄이 판 줄로 흘러 조립 줄 끝 상자를 막는다.
         2) (-43.5,-45.5) 동향 -> 남향: 트렁크 흐름을 col41 서쪽 출력 벨트 (x=-43.5) 머리로. 이 벨트는
            탄창 (-47,-35) · 수류탄 3 -> y=-18.5 합류 -> x=-33.5 남향 -> 톱니 3 · 벨트 · 팔 · 회로 -> 끝 상자 (-50,0).
         3) smeltcol23 철 기지 끝 옮김을 끄고 (state fe.tail_off) 지하 (-88.5,-43.5)->(-86.5,-43.5) 유령 (로봇, 기지 망).
         4) col41 돌 화로 24 + 팔 48 해체 (이제 가운데 입력 벨트 x=-38.5 은 빈다).
       강철 · 남는 판은 끝 상자 (-50,0) 로 간다 -> smeltcol23 이 상자의 강철 · 석탄을 망 저장으로 (상한).
Guiltyring 이 last_user 인 것은 건드리지 않는다. 철거는 로봇 (기지 망 안).

    python -u scripts/basecleanup23.py cu|fe [--dry]
로그 state/smeltcol23.log (같은 이야기)
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import smeltcol23 as sc  # noqa: E402

CU_FURN = [(-35 + 2 * i, -98) for i in range(16)]
CU_INS = [(-35.5 + 2 * i, -99.5) for i in range(16)]
COL41_AREA = ((-42.5, -45.2), (-34.5, -21))     # 화로 x -41/-36, 팔 x -42.5 -39.5 -37.5 -34.5
COAL_SIDE = (-51.5, -46.5)
TURN = (-43.5, -45.5)
UG = [(-88.5, -43.5, "input"), (-86.5, -43.5, "output")]

DECON = """(function() local s = game.surfaces[1] local o = {marked = 0, skip_user = 0, have = 0}
  local function mark(e) if not e or not e.valid then return end
    o.have = o.have + 1
    if e.last_user and e.last_user.name == 'Guiltyring' then o.skip_user = o.skip_user + 1 return end
    if %s and not e.to_be_deconstructed() then e.order_deconstruction('player') o.marked = o.marked + 1 end end
  for _, p in pairs({%s}) do
    for _, e in pairs(s.find_entities_filtered{type = {'furnace', 'inserter'}, position = p, radius = 0.3}) do mark(e) end end
  for _, a in pairs({%s}) do
    for _, e in pairs(s.find_entities_filtered{type = {'furnace', 'inserter'}, area = a}) do mark(e) end end
  return o end)()"""


def decon(ai, points, areas, dry):
    pts = ", ".join("{%s, %s}" % p for p in points) or ""
    ars = ", ".join("{{%s, %s}, {%s, %s}}" % (a[0][0], a[0][1], a[1][0], a[1][1]) for a in areas) or ""
    return ai.lua(DECON % ("false" if dry else "true", pts, ars))


FE_FLOW = """(function() local s = game.surfaces[1] local o = {}
  local c = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if c then o.coal_dir = c.direction
    if %s and not c.to_be_deconstructed() and not (c.last_user and c.last_user.name == 'Guiltyring') then c.order_deconstruction('player') o.coal_cut = 'ordered' end
  else o.coal_cut = 'gone' end
  local t = s.find_entities_filtered{type = 'transport-belt', position = {%s, %s}, radius = 0.3}[1]
  if t then o.turn_dir = t.direction if %s and t.direction ~= defines.direction.south then t.direction = defines.direction.south o.turn = 'rotated' end end
  for _, u in pairs({%s}) do
    local e = s.find_entities_filtered{type = 'underground-belt', position = {u[1], u[2]}, radius = 0.3}[1]
      or s.find_entities_filtered{ghost_name = 'underground-belt', position = {u[1], u[2]}, radius = 0.3}[1]
    if e then o['ug' .. u[1]] = e.type
    elseif %s then
      local g = s.create_entity{name = 'entity-ghost', inner_name = 'underground-belt', position = {u[1], u[2]}, direction = defines.direction.east,
        type = u[3], force = 'player', expires = false}
      o['ug' .. u[1]] = g and 'ghost' or 'fail' end
  end
  return o end)()"""


CU2_AREAS = [((-62, -70), (-60, -50)), ((-76, -45), (-69, -37))]   # x=-61 강철 화로 구리 8 · x=-72.5 돌 화로 줄 (구리 레시피만)
BYREC = """(function() local s = game.surfaces[1] local o = {furn = 0, ins = 0, skip_user = 0, keep = 0}
  for _, a in pairs({%s}) do
    for _, f in pairs(s.find_entities_filtered{type = 'furnace', area = a}) do
      local r = f.get_recipe() or f.previous_recipe
      local rn = r and (r.name and (type(r.name) == 'string' and r.name or r.name.name)) or '-'
      if rn ~= 'copper-plate' then o.keep = o.keep + 1
      elseif f.last_user and f.last_user.name == 'Guiltyring' then o.skip_user = o.skip_user + 1
      else
        for _, i in pairs(s.find_entities_filtered{type = 'inserter', position = f.position, radius = 2.2}) do
          if (i.pickup_target == f or i.drop_target == f) and not (i.last_user and i.last_user.name == 'Guiltyring') then
            if %s and not i.to_be_deconstructed() then i.order_deconstruction('player') end o.ins = o.ins + 1 end end
        if %s and not f.to_be_deconstructed() then f.order_deconstruction('player') end o.furn = o.furn + 1
      end
    end
  end return o end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["cu", "fe", "cu2"])
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    act = "false" if a.dry else "true"
    if a.what == "cu2":
        ars = ", ".join("{{%s, %s}, {%s, %s}}" % (x[0][0], x[0][1], x[1][0], x[1][1]) for x in CU2_AREAS)
        r = ai.lua(BYREC % (ars, act, act))
        sc.log("기지 정리 cu2: 구리 화로 (x=-61 강철 · x=-72.5 돌, 구리 레시피만) %s%s" % (r, " (드라이런)" if a.dry else ""))
        return 0
    if a.what == "cu":
        r = decon(ai, CU_FURN + CU_INS, [], a.dry)
        sc.log("기지 정리 cu: cusmelt 줄 화로 · 팔 %s%s" % (r, " (드라이런)" if a.dry else ""))
        return 0
    if not a.dry:
        st = sc.load()
        st.setdefault("fe", {})["tail_off"] = True
        sc.save(st)
    ug = ", ".join("{%s, %s, '%s'}" % u for u in UG)
    r = ai.lua(FE_FLOW % (COAL_SIDE[0], COAL_SIDE[1], act, TURN[0], TURN[1], act, ug, act))
    sc.log("기지 정리 fe: 흐름 %s%s" % (r, " (드라이런)" if a.dry else ""))
    d = decon(ai, [], [COL41_AREA], a.dry)
    sc.log("기지 정리 fe: col41 화로 · 팔 %s%s" % (d, " (드라이런)" if a.dry else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

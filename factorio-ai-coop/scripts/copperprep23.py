"""구리 전초 (52,-401) 준비 - 23회차 (2026-09-28). 사용자 "구리 전초 준비 ㄱ".

배경: 구리 순생산 0 (10분 1438 생산 / 1467 소비), 망 구리 0 -> 배터리 -> 프레임 -> 노랑 정지. 방어선 안 구리 매장 없음.
표적 매장: 북쪽 (52,-401) 한 덩어리 (x 35.5..88.5, y -431.5..-381.5, 1,556만 - 옆 (74,-404) 포함). 부자 줄기는 x 44..60.

이번 범위 = 준비만 (전초 개설은 둥지 정리 뒤):
  1. 대포 1단계 이전: 남서 (-85.5,30.5) 사거리 안 산란기 · 땅벌레 0 -> 북동 벽 안 (33.5,-100.5) (망 2 물류 칸 안, 로보포트 (10,-80)).
     사거리 224 안에 경로 위 둥지 (55,-200) · (136,-120) · (140,-230) 전부와 (14,-312) · (114,-296) 일부.
     전진 로보포트는 지금 못 놓는다 - 벽 북쪽 90칸 (46..63, -206..-192) 에 산란기 4 · 큰 땅벌레 1 이 바로 그 자리에 있다.
  2. 경로: 채굴기 줄 x=50.5 -> 남으로 y=-117.5 -> 서로 x=-43.5 -> 벽 · 탄띠를 지하 두 번 -> (-43.5,-94.5) 서향 벨트에 옆 투입
     -> 구리 강철 화로 7 (x=-61, 서쪽 입력줄 x=-64.5). 자세한 수치는 docs/rebuild-plan-run23.md '## 구리 전초 (52,-401) 경로'.

    python -u scripts/copperprep23.py survey     # 경로 놓기 가능 · 장애물 · 경로 둘레 적 · 재료
    python -u scripts/copperprep23.py reach      # 대포 자리 후보별 사거리 안 둥지
    python -u scripts/copperprep23.py move       # 남서가 비었으면 대포 해체 표시 (artyprep23 루프가 ARTY_SPOTS 첫 자리에 유령)
    python -u scripts/copperprep23.py check      # 대포 상태 · 탄 · 경로 둘레 남은 둥지
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "copperprep23.log")
N, E, S, W = 0, 4, 8, 12
BELT, UG, DRILL = "transport-belt", "underground-belt", "electric-mining-drill"

OLD_ARTY = (-85.5, 30.5)
NEW_ARTY = (33.5, -100.5)
RANGE = 224
# 2단계 이후 후보 (둥지 정리 뒤 로보포트 사슬 끝): 참고용 사거리 표
SPOTS = {"A 벽안 NE": NEW_ARTY, "B 로보포트2 끝": (40.5, -220.5), "C 로보포트3 끝": (50.5, -262.5)}

# ---- 경로 ------------------------------------------------------------------------------
TRUNK_X = 50.5          # 채굴기 모음 = 간선
TURN_Y = -117.5         # 벽 앞 5칸 (포탑 y -108 사거리 안)
ENTRY_X = -43.5         # 벽 · 포탑 사이 빈 기둥 (포탑 x -47..-45 / -41..-39 사이)
DRILL_ROWS = [-412.5, -409.5, -406.5, -403.5, -400.5]           # 1차 10대 (5쌍), 확장은 -397.5 .. -391.5
DRILLS = [(48.5, y, E) for y in DRILL_ROWS] + [(52.5, y, W) for y in DRILL_ROWS]


def route():
    """(이름, x, y, 방향) - 채굴기 쪽에서 기지 쪽 순서."""
    out = []
    y = DRILL_ROWS[0]
    while y < TURN_Y:                       # 간선 남행 (-412.5 .. -118.5)
        out.append((BELT, TRUNK_X, y, S))
        y += 1
    x = TRUNK_X
    while x > ENTRY_X:                      # 벽 앞 서행 (50.5 .. -42.5)
        out.append((BELT, x, TURN_Y, W))
        x -= 1
    for yy in (-117.5, -116.5, -115.5, -114.5):
        out.append((BELT, ENTRY_X, yy, S))
    # 벽 (-112.5 · -111.5) 밑
    out += [(UG + ":input", ENTRY_X, -113.5, S), (UG + ":output", ENTRY_X, -110.5, S)]
    for yy in (-109.5, -108.5, -107.5):
        out.append((BELT, ENTRY_X, yy, S))
    # 포탑 탄띠 (y -105.5, 동행) 밑
    out += [(UG + ":input", ENTRY_X, -106.5, S), (UG + ":output", ENTRY_X, -104.5, S)]
    yy = -103.5
    while yy <= -95.5:
        out.append((BELT, ENTRY_X, yy, S))
        yy += 1
    return out                              # 마지막 (-43.5,-95.5) S -> (-43.5,-94.5) 서향 벨트 옆 투입


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


SURVEY = """(function() local s, f = game.surfaces[1], game.forces.player
  local o = {ok = 0, standing = 0, bad = {}, obst = {}, cliff = 0, water = 0, nests = {}, drills_ok = 0}
  for bit in string.gmatch("%s", "[^;]+") do
    local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
    local ug = string.find(n, ':') local nm = ug and string.sub(n, 1, ug - 1) or n
    local e = s.find_entities_filtered{name = nm, position = {x, y}, radius = 0.1, force = f}[1]
    if e then o.standing = o.standing + 1
    elseif s.can_place_entity{name = nm, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.manual_ghost} then o.ok = o.ok + 1
    else
      local why = 'tile:' .. s.get_tile(x, y).name
      for _, b in pairs(s.find_entities_filtered{area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}}) do
        if b.type == 'cliff' then why = 'cliff' o.cliff = o.cliff + 1
        elseif (b.type == 'tree' or b.type == 'simple-entity') then why = 'obst' o.obst[#o.obst + 1] = b.name
        elseif b.type ~= 'resource' and b.type ~= 'corpse' and b.type ~= 'item-entity' then
          why = b.name .. '/' .. (b.last_user and b.last_user.name or b.force.name) end end
      if string.find(why, 'water') then o.water = o.water + 1 end
      if #o.bad < 40 then o.bad[#o.bad + 1] = n .. '@' .. x .. ',' .. y .. ' ' .. why end
    end
  end
  for _, t in pairs({%s}) do
    if s.can_place_entity{name = 'electric-mining-drill', position = {t[1], t[2]}, direction = t[3], force = f,
                          build_check_type = defines.build_check_type.manual_ghost} then o.drills_ok = o.drills_ok + 1 end end
  -- 경로 둘레 60칸 적 구조물 (10칸 격자로 묶음)
  local seen = {}
  for _, p in pairs({%s}) do
    for _, e in pairs(s.find_entities_filtered{type = {'unit-spawner', 'turret'}, force = 'enemy', position = p, radius = 60}) do
      if not seen[e.unit_number] then seen[e.unit_number] = true
        local k = math.floor(e.position.x / 20) * 20 .. ',' .. math.floor(e.position.y / 20) * 20
        o.nests[k] = o.nests[k] or {sp = 0, worm = 0}
        if e.type == 'unit-spawner' then o.nests[k].sp = o.nests[k].sp + 1 else o.nests[k].worm = o.nests[k].worm + 1 end end end end
  local net = s.find_logistic_network_by_position({10, -80}, 'player')
  o.net = {}
  for _, it in pairs({'transport-belt', 'underground-belt', 'electric-mining-drill', 'small-electric-pole', 'medium-electric-pole',
                      'gun-turret', 'stone-wall', 'iron-plate', 'copper-plate', 'roboport', 'advanced-circuit', 'steel-plate', 'iron-gear-wheel'}) do
    o.net[it] = net and net.get_item_count(it) or 0 end
  return o end)()"""


def survey(ai):
    rt = route()
    blob = ";".join("%s,%s,%s,%s" % t for t in rt)
    drills = ", ".join("{%s, %s, %d}" % d for d in DRILLS)
    probe = [(TRUNK_X, y) for y in range(-400, -117, 40)] + [(x, TURN_Y) for x in range(40, -44, -40)]
    probe_s = ", ".join("{%s, %s}" % p for p in probe)
    r = ai.lua(SURVEY % (blob, drills, probe_s))
    r["bad"] = rows(r.get("bad"))
    obst = {}
    for n in rows(r.get("obst")):
        obst[n] = obst.get(n, 0) + 1
    r["obst"] = obst
    belts = sum(1 for t in rt if t[0] == BELT)
    ugs = sum(1 for t in rt if t[0].startswith(UG))
    r["count"] = {"belt": belts, "underground": ugs, "drill": len(DRILLS),
                  "small_pole_est": math.ceil(len(rt) / 7) + 6}
    log("조사 " + json.dumps(r, ensure_ascii=False))
    return r


REACH = """(function() local s = game.surfaces[1] local o = {}
  for _, p in pairs({%s}) do
    local c = {sp = 0, worm = 0, near_route = 0}
    for _, e in pairs(s.find_entities_filtered{type = {'unit-spawner', 'turret'}, force = 'enemy', position = {p[2], p[3]}, radius = %d}) do
      if e.type == 'unit-spawner' then c.sp = c.sp + 1 else c.worm = c.worm + 1 end
      local ex, ey = e.position.x, e.position.y
      if (math.abs(ex - %s) < 60 and ey < -117) or (math.abs(ey - %s) < 60 and ex > -44 and ex < 51) or
         (ex > 20 and ex < 110 and ey < -370 and ey > -500) then c.near_route = c.near_route + 1 end
    end
    o[p[1]] = c
  end
  return o end)()"""


def reach(ai):
    spots = ", ".join("{'%s', %s, %s}" % (k, v[0], v[1]) for k, v in SPOTS.items())
    r = ai.lua(REACH % (spots, RANGE, TRUNK_X, TURN_Y))
    log("사거리 " + json.dumps(r, ensure_ascii=False))
    return r


MOVE = """(function() local s = game.surfaces[1] local o = {}
  local sp, wm = 0, 0
  for _, e in pairs(s.find_entities_filtered{type = {'unit-spawner', 'turret'}, force = 'enemy', position = {%s, %s}, radius = %d}) do
    if e.type == 'unit-spawner' then sp = sp + 1 else wm = wm + 1 end end
  o.sw = {sp = sp, worm = wm}
  local a = s.find_entities_filtered{name = 'artillery-turret', position = {%s, %s}, radius = 1}[1]
  if not a then o.arty = 'none' return o end
  o.arty = a.position.x .. ',' .. a.position.y
  o.user = a.last_user and a.last_user.name or '-'
  o.ammo = a.get_inventory(defines.inventory.artillery_turret_ammo).get_item_count()
  o.new_ok = s.can_place_entity{name = 'artillery-turret', position = {%s, %s}, force = 'player', build_check_type = defines.build_check_type.manual_ghost}
  local n = s.find_logistic_network_by_position({%s, %s}, 'player') o.new_net = n and n.network_id or 0
  if (sp > 0 and not %s) then o.skip = '남서 사거리 안 산란기 남음' return o end
  if o.user == 'Guiltyring' then o.skip = '사용자 건물' return o end
  if not o.new_ok or o.new_net ~= 2 then o.skip = '새 자리 불가' return o end
  if %s then
    if a.to_be_deconstructed() then o.done = '이미 해체 표시' else o.done = a.order_deconstruction('player') and '해체 표시' or '실패' end
  end
  return o end)()"""


def move(ai, force=False, dry=False):
    r = ai.lua(MOVE % (OLD_ARTY + (RANGE,) + OLD_ARTY + NEW_ARTY + NEW_ARTY + (
        "true" if force else "false", "false" if dry else "true")))
    log("이전 " + json.dumps(r, ensure_ascii=False))
    return r


CHECK = """(function() local s = game.surfaces[1] local o = {arty = {}, ghosts = 0}
  for _, a in pairs(s.find_entities_filtered{name = 'artillery-turret', force = 'player'}) do
    o.arty[#o.arty + 1] = a.position.x .. ',' .. a.position.y .. ' 탄 ' ..
      a.get_inventory(defines.inventory.artillery_turret_ammo).get_item_count() .. (a.to_be_deconstructed() and ' (해체중)' or '') end
  o.ghosts = #s.find_entities_filtered{ghost_name = 'artillery-turret', force = 'player'}
  local c = {sp = 0, worm = 0}
  for _, e in pairs(s.find_entities_filtered{type = {'unit-spawner', 'turret'}, force = 'enemy', position = {%s, %s}, radius = %d}) do
    if e.type == 'unit-spawner' then c.sp = c.sp + 1 else c.worm = c.worm + 1 end end
  o.in_range_new = c
  local g = {sp = 0, worm = 0}
  for _, e in pairs(s.find_entities_filtered{type = {'unit-spawner', 'turret'}, force = 'enemy', area = {{20, -215}, {80, -180}}}) do
    if e.type == 'unit-spawner' then g.sp = g.sp + 1 else g.worm = g.worm + 1 end end
  o.gate_55_200 = g
  return o end)()"""


def check(ai):
    r = ai.lua(CHECK % (NEW_ARTY + (RANGE,)))
    log("점검 " + json.dumps(r, ensure_ascii=False))
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["survey", "reach", "move", "check"])
    ap.add_argument("--force", action="store_true", help="move: 남서 산란기가 남아도 옮긴다 (10분 경과 등)")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "survey":
        survey(ai)
    elif a.cmd == "reach":
        reach(ai)
    elif a.cmd == "move":
        move(ai, a.force, a.dry)
    else:
        check(ai)
    return 0


if __name__ == "__main__":
    sys.exit(main())

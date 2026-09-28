"""석탄 광맥 (-83,-278) -> 철 전초 제련 기둥 벨트. 사용자 09:xx «임시 Lua 중계 대신 진짜 공급».

철 전초 돌 화로 18 + 강철 8 의 연료는 smeltcol23 의 Lua 중계 (옛 col41 석탄 줄 -> 망 석탄 -> 석탄 상자) 였다.
석탄 광맥 (x -101.5..-72.5 · y -294.5..-273.5, 2.57M) 남서 모서리에 채굴기 4 (쌍 2) 를 놓고
광석 기둥 (x=-160.5, 남향 막다른 끝) 의 «서쪽 레인» 으로 석탄을 넣는다. 광석은 동쪽 레인만.

    모음 x=-91.5 남향 (y -279.5..-251.5), 채굴기 (-93.5 E / -89.5 W, y -279.5 · -276.5)
    간선 y=-250.5 서향 (x -91.5..-152.5) -> (-153.5,-250.5..-244.5) 남향
    레인 고르기: (-153.5,-243.5) 서향 직선 (뒤에 빈 벨트 (-152.5,-243.5)) 에 북쪽 옆치기 -> 석탄은 오른쪽(북) 레인만
    지하 (-154.5,-243.5)->(-156.5,-243.5) 로 판 벨트 머리 (-155.5,-243.5) 밑을 지나 (-157.5..-159.5,-243.5) 서향
    (-160.5,-243.5) 남향 = 좌회전 곡선: 북 레인 -> 서 레인.  (-160.5,-242.5) 는 뒤 입력이 생겨 직선, 광석은 동쪽 옆치기 -> 동 레인.
    강철 8: 광석 기둥을 (-160.5,-205.5..-177.5) 로 늘리고 (-159.5, r) 팔 8 (서쪽에서 집음) -> 석탄은 연료칸으로.
방어: 채굴기 둘레 광석 밖에 레이저 3 · 기관총 3 (먼저 짓는다), 전봇대는 전초 전봇대 (-154.5,-245.5) 에서 y=-251.5 를 따라.
짓기는 캐릭터 (outpostcrew23.run_job), 재료는 망 2 저장 -> 가방 (옮김).

    python -u scripts/coalline23.py check          # 칸 검사 (드라이런)
    python -u scripts/coalline23.py build ring|line|steel
    python -u scripts/coalline23.py status         # 채굴기 · 벨트 석탄 · 화로 연료 · 10분 흐름
로그 state/coalline23.log
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "coalline23.log")
AMMO = "piercing-rounds-magazine"

# 철 전초 제련 기둥 (smeltcol23 SITES['fe'])
X_ORE = -160.5
FURN_Y0 = -242.5
STEEL_R0, STEEL_N = -191.5, 8


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def ring():
    """포탑 · 전봇대 (전력선 포함). 포탑은 광석 밖."""
    b = []
    # 전력선: 전초 (-154.5,-245.5) 에서 y=-251.5 따라 동쪽, 모음 줄 옆 x=-92.5 따라 북쪽
    for x in (-154.5, -147.5, -140.5, -133.5, -126.5, -119.5, -112.5, -105.5, -98.5, -92.5):
        b.append(("small-electric-pole", x, -251.5, "north"))
    for y in (-258.5, -265.5, -272.5):
        b.append(("small-electric-pole", -92.5, y, "north"))
    b += [("small-electric-pole", -95.5, -278.5, "north"), ("small-electric-pole", -89.5, -273.5, "north"),
          ("small-electric-pole", -87.5, -278.5, "north"), ("small-electric-pole", -100.5, -279.5, "north")]
    b += [("laser-turret", -95, -272, "north"), ("laser-turret", -87, -272, "north"), ("laser-turret", -103, -280, "north"),
          ("gun-turret", -99, -273, "north"), ("gun-turret", -103, -286, "north"), ("gun-turret", -83, -273, "north")]
    return b


def line():
    b = [("electric-mining-drill", -93.5, y, "east") for y in (-279.5, -276.5)]
    b += [("electric-mining-drill", -89.5, y, "west") for y in (-279.5, -276.5)]
    for k in range(29):                                   # y -279.5 .. -251.5
        b.append(("transport-belt", -91.5, -279.5 + k, "south"))
    for k in range(62):                                   # x -91.5 .. -152.5
        b.append(("transport-belt", -91.5 - k, -250.5, "west"))
    for k in range(7):                                    # y -250.5 .. -244.5
        b.append(("transport-belt", -153.5, -250.5 + k, "south"))
    b += [("transport-belt", -152.5, -243.5, "west"),     # 빈 뒤칸 -> (-153.5,-243.5) 를 직선으로
          ("transport-belt", -153.5, -243.5, "west"),
          ("underground-belt", -154.5, -243.5, "west", "input"),
          ("underground-belt", -156.5, -243.5, "west", "output")]
    for x in (-157.5, -158.5, -159.5):
        b.append(("transport-belt", x, -243.5, "west"))
    b.append(("transport-belt", X_ORE, -243.5, "south"))  # 이것이 서면 광석 기둥 머리가 직선이 된다 - 마지막에
    return b


def steel():
    b = []
    for y in range(-205, -176):                           # -205.5 .. -177.5
        b.append(("transport-belt", X_ORE, y - 0.5, "south"))
    for k in range(STEEL_N):
        b.append(("inserter", X_ORE + 1, STEEL_R0 + 2 * k, "west"))
    for k in range(0, STEEL_N, 2):
        b.append(("small-electric-pole", X_ORE + 1, STEEL_R0 + 1 + 2 * k, "north"))
    return b


PARTS = {"ring": ring, "line": line, "steel": steel}
DIRN = {"north": 0, "east": 4, "south": 8, "west": 12}
SIZE = {"electric-mining-drill": 1.45, "laser-turret": 0.95, "gun-turret": 0.95}

CHECK = """(function() local s = game.surfaces[1] local o = {ok = 0, have = 0, tree = 0, bad = {}}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    local h = t[5]
    local ore = s.count_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}, type = 'resource'}
    if e then o.have = o.have + 1
    elseif t[1] == 'electric-mining-drill' and ore == 0 then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':no-ore'
    elseif (t[1] == 'gun-turret' or t[1] == 'laser-turret') and ore > 0 then o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':ore'
    elseif s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', build_check_type = defines.build_check_type.manual} then
      o.ok = o.ok + 1
    else
      local why, soft = '', true
      for _, x in pairs(s.find_entities_filtered{area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}}) do
        if x.type ~= 'resource' then why = why .. x.name .. ' '
          if x.type ~= 'tree' and x.type ~= 'simple-entity' and x.type ~= 'character' and x.type ~= 'item-entity' and x.type ~= 'corpse' then soft = false end end end
      if soft and why ~= '' then o.tree = o.tree + 1 else o.bad[#o.bad + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ':' .. why end
    end
  end return o end)()"""


def rows(builds):
    return ", ".join("{'%s', %s, %s, %d, %s}" % (b[0], b[1], b[2], DIRN[b[3]], SIZE.get(b[0], 0.45)) for b in builds)


def check(ai, part):
    b = PARTS[part]()
    out = {"ok": 0, "have": 0, "tree": 0, "bad": []}
    for k in range(0, len(b), 100):
        r = ai.lua(CHECK % rows(b[k:k + 100]))
        for f in ("ok", "have", "tree"):
            out[f] += r.get(f, 0)
        bad = r.get("bad") or []
        out["bad"] += list(bad.values()) if isinstance(bad, dict) else bad
    cnt = {}
    for x in b:
        cnt[x[0]] = cnt.get(x[0], 0) + 1
    log("%s 칸 검사: 전체 %d %s · 있음 %d · 가능 %d · 나무/바위 %d · 막힘 %s" % (part, len(b), cnt, out["have"], out["ok"], out["tree"], out["bad"]))
    return out


ENTRY = {"ring": (-120.5, -253.5), "line": (-120.5, -253.5), "steel": (-162.5, -200.5)}


def build(ai, part):
    import outpostcrew23 as crew
    b = PARTS[part]()

    def inserts_for(ch):
        return [(AMMO, x, y, 25) for n, x, y, *_ in ch if n == "gun-turret"]
    ok = crew.run_job(ai, b, inserts_for, ENTRY[part], "coalline23", log, crew_n=3, rounds=6,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s 캐릭터 건설 %s" % (part, "완료" if ok else "미완"))
    return ok


STATUS = """(function() local s = game.surfaces[1] local o = {drills = {}, mainline = 0, col_w = 0, col_e = 0, furn = 0, fuel = 0, low = 0, sfuel = 0, slow = 0}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-96, -282}, {-87, -274}}}) do
    o.drills[#o.drills + 1] = st[d.status] or d.status end
  for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = {{-160, -251}, {-91, -243}}}) do
    for li = 1, 2 do o.mainline = o.mainline + b.get_transport_line(li).get_item_count('coal') end end
  for _, b in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-161, -244}, {-160, -176}}}) do
    -- 남향 벨트: 레인 1 = 왼쪽 = 동, 레인 2 = 오른쪽 = 서
    o.col_e = o.col_e + b.get_transport_line(1).get_item_count('coal') o.col_w = o.col_w + b.get_transport_line(2).get_item_count('coal')
  end
  for _, f in pairs(s.find_entities_filtered{name = 'stone-furnace', area = {{-159, -242}, {-157, -206}}}) do
    local k = f.get_inventory(defines.inventory.fuel).get_item_count('coal') o.furn = o.furn + 1 o.fuel = o.fuel + k if k < 2 then o.low = o.low + 1 end end
  for _, f in pairs(s.find_entities_filtered{name = 'stone-furnace', area = {{-159, -192}, {-157, -175}}}) do
    local k = f.get_inventory(defines.inventory.fuel).get_item_count('coal') o.sfuel = o.sfuel + k if k < 2 then o.slow = o.slow + 1 end end
  local p1 = defines.flow_precision_index.ten_minutes
  local ps = game.forces.player.get_item_production_statistics(s)
  o.coal10 = {math.floor(ps.get_flow_count{name = 'coal', category = 'input', precision_index = p1, count = true}),
              math.floor(ps.get_flow_count{name = 'coal', category = 'output', precision_index = p1, count = true})}
  return o end)()"""


def status(ai):
    r = ai.lua(STATUS)
    d = r.get("drills") or {}
    r["drills"] = list(d.values()) if isinstance(d, dict) else d
    log("상태 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "build", "status"])
    ap.add_argument("part", nargs="?")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        for p in ([a.part] if a.part else PARTS):
            check(ai, p)
    elif a.cmd == "build":
        build(ai, a.part)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

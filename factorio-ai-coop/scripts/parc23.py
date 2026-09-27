"""병렬 C (2026-09-27): 북·북동·동쪽 방어 보강 + 관통탄 여분 → 망 창고 + 돌 전용 채굴.

실측 (17:30, tick ~15.7M):
    · 북 줄 y=-108 포탑 x -106..38 (6칸 간격), 둘째 줄 y=-103 x -40..38. 급탄 = 벨트 y=-105.5 동향, 팔 y=-106.5 (북) · y=-104.5 (남).
      벽 y=-113 (x -38..46 한 겹, 서쪽은 -112 두 겹). 북쪽 공습 (-20..-64) 구간 중 x < -40 은 한 줄뿐, 고아 팔 (-46.5,-104.5) (포탑 없음).
    · 동 줄 x=44 포탑 y -102..30 (6칸) + 틈 4 (관통탄, 팔 없음). 급탄 벨트 x=41.5 남향, 팔 x=42.5, 벽 x=47.5.
      벽 빈칸 y -59.5 · -42.5 · -41.5 = 나무 때문 (유령 3 (4.5/8.5/9.5) 은 이미 섬).
    · 망 2 재고: 포탑 16 · 벽 34 · 팔 38 · 관통탄 0.

    python scripts/parc23.py              # 조사 (dry: 놓을 수 있나)
    python scripts/parc23.py --ghosts     # 나무 해체 표시 + 벽 · 포탑 · 팔 유령 (로봇, 근접 적 0 일 때만)
    python scripts/parc23.py --verify     # 새 포탑 탄 · 벽
    python scripts/parc23.py --stone      # 돌 전용 채굴 (0-11/3-4): 벽돌 화로 쌍 (-57/-54,-97) 자리에 채굴기 2 (로봇)

돌 (0-11/3-4) 설계: 섞인 광맥 y=-92.5 대신 «벽돌 화로 줄 밑» 이 순수 돌 (행 -97..-95, 타일당 2~2.8k).
    화로 6 (x -63/-60/-57/-54/-51/-48, y -97) 중 가운데 쌍 (-57/-54) · 그 사이 전봇대 (-55.5,-96.5) · 출력/연료 팔 4 · 긴팔 2 를 걷고
    채굴기 (-56.5,-96.5) (-53.5,-96.5) 북향 -> 긴팔 자리 (x,-98.5) 벨트 N -> (x,-99.5) N -> 돌 투입 벨트 y=-100.5 (서향) 옆치기.
    하류 (서쪽) 화로 (-60/-63) 가 긴팔로 돌을 받아 벽돌 -> 벽돌 벨트 y=-94.5. 새 전봇대 (-55.5,-99.5) 먼저 (그물망이라 끊김 없음).
    채굴 범위 = 돌만 (행 -99..-95, x -59..-51): 약 39k + 31k.
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402
from wbelt23 import tally, turrets, rows  # noqa: E402

N, E, S, W = 0, 4, 8, 12       # 팔 방향 = 집는 쪽 (N = 남쪽에 떨굼)
LOG = os.path.join(HERE, "..", "state", "par_c.log")

# 북 서쪽 구간 (한 줄뿐): 둘째 줄 (-46/-52,-103) + 첫 줄 사이 채움 (-49/-55/-61/-67,-108)
# 북동 (19,-128) 정면: 첫 줄 사이 채움 (17/23/29,-108)
# 동 (61..69, -2..-50) 정면: 사이 채움 (44, -45/-39/-9/-3)
NEW_GUNS = {
    (-46, -103): (-46.5, -104.5, N), (-52, -103): (-52.5, -104.5, N),
    (-49, -108): (-49.5, -106.5, S), (-55, -108): (-55.5, -106.5, S), (-61, -108): (-61.5, -106.5, S), (-67, -108): (-67.5, -106.5, S),
    (17, -108): (16.5, -106.5, S), (23, -108): (22.5, -106.5, S), (29, -108): (28.5, -106.5, S),
    (44, -45): (42.5, -45.5, W), (44, -39): (42.5, -39.5, W), (44, -9): (42.5, -9.5, W), (44, -3): (42.5, -3.5, W),
}
EAST_GAPS = [(47.5, -59.5), (47.5, -42.5), (47.5, -41.5)]
NE_WALL2 = [(x + 0.5, -111.5) for x in range(8, 30)]     # 북동 둘째 벽 (y=-112 칸, x 8..29) 22 개


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def threat(ai):
    return ai.lua("""(function() local s = game.surfaces[1] local n, big = 0, 0
      for _, e in pairs(s.find_entities_filtered{force = 'enemy', type = 'unit', area = {{-120, -170}, {110, 60}}}) do
        if e.position.y < -95 or e.position.x > 40 then n = n + 1 if string.find(e.name, 'big') or string.find(e.name, 'behemoth') then big = big + 1 end end end
      local net = s.find_logistic_network_by_position({20, -100}, 'player')
      return {near = n, big = big, gun = net.get_item_count('gun-turret'), wall = net.get_item_count('stone-wall'),
              arm = net.get_item_count('inserter'), bots = net.available_construction_robots .. '/' .. net.all_construction_robots} end)()""")


def ghosts(ai, items, dry=False):
    """wbelt23.ghosts 와 같되 blueprint_ghost 검사 (나무는 막지 않음 - 놓을 때 그 칸 나무를 해체 표시)."""
    blob = ";".join("%s,%s,%s,%s" % (t[0], t[1], t[2], t[3] or 0) for t in items)
    r = ai.lua("""(function() local s, f, o, dry = game.surfaces[1], game.forces.player, {}, %s
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local e = s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1]
        if e then o[#o+1] = bit .. (e.direction == d and " standing" or " WRONGDIR")
        elseif s.find_entities_filtered{ghost_name = n, position = {x, y}, radius = 0.1, force = f}[1] then o[#o+1] = bit .. " ghost"
        elseif s.can_place_entity{name = n, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.blueprint_ghost} then
          if dry then o[#o+1] = bit .. " ok" else
            local g = s.create_entity{name = 'entity-ghost', inner_name = n, position = {x, y}, direction = d, force = f}
            if g then for _, t in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = g.bounding_box}) do t.order_deconstruction(f) end end
            o[#o+1] = bit .. (g and " NEW" or " FAIL") end
        else o[#o+1] = bit .. " BLOCKED" end
      end return o end)()""" % ("true" if dry else "false", blob))
    return rows(r)


def mark_trees(ai):
    spots = EAST_GAPS + NE_WALL2 + list(NEW_GUNS) + [v[:2] for v in NEW_GUNS.values()]
    blob = ",".join("{%s,%s}" % p for p in spots)
    return ai.lua("""(function() local s, n = game.surfaces[1], 0
      for _, p in pairs({%s}) do for _, t in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{p[1] - 1.2, p[2] - 1.2}, {p[1] + 1.2, p[2] + 1.2}}}) do
        if not t.to_be_deconstructed() then t.order_deconstruction('player') n = n + 1 end end end
      return {marked = n} end)()""" % blob)


STONE_NEW = [("electric-mining-drill", -56.5, -96.5, N), ("electric-mining-drill", -53.5, -96.5, N)] +     [("transport-belt", x, y, N) for x in (-56.5, -53.5) for y in (-98.5, -99.5)]
STONE_OUT = [("stone-furnace", -57, -97), ("stone-furnace", -54, -97), ("small-electric-pole", -55.5, -96.5),
             ("inserter", -57.5, -95.5), ("inserter", -56.5, -95.5), ("inserter", -54.5, -95.5), ("inserter", -53.5, -95.5),
             ("long-handed-inserter", -56.5, -98.5), ("long-handed-inserter", -53.5, -98.5)]


def do_stone(ai):
    say("돌 전용: 새 전봇대 %s" % ghosts(ai, [("small-electric-pole", -55.5, -99.5, 0)]))
    t0 = time.time()
    while time.time() - t0 < 300 and not ai.lua("{n = game.surfaces[1].count_entities_filtered{name = 'small-electric-pole', position = {-55.5, -99.5}, radius = 0.1}}")["n"]:
        time.sleep(5)
    blob = ",".join("{'%s',%s,%s}" % t for t in STONE_OUT)
    r = ai.lua("""(function() local s, n = game.surfaces[1], 0
      for _, t in pairs({%s}) do local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.1, force = 'player'}[1]
        if e and not e.to_be_deconstructed() then e.order_deconstruction('player') n = n + 1 end end
      return {marked = n} end)()""" % blob)
    say("돌 전용: 화로 쌍 (-57/-54,-97) · 전봇대 · 팔 6 해체 표시 %s" % r)
    t0 = time.time()
    while time.time() - t0 < 600:
        left = ai.lua("""{n = game.surfaces[1].count_entities_filtered{area = {{-58, -99}, {-52, -95}}, type = {'furnace', 'inserter', 'electric-pole'}, force = 'player'}}""")["n"]
        if not left:
            break
        time.sleep(5)
    res = ghosts(ai, STONE_NEW)
    say("돌 전용: 채굴기 2 · 벨트 4 유령 %s" % res)


def items():
    out = [("stone-wall", x, y, 0) for x, y in EAST_GAPS]
    for (tx, ty), (ix, iy, d) in NEW_GUNS.items():
        out += [("gun-turret", tx, ty, 0), ("inserter", ix, iy, d)]
    out += [("stone-wall", x, y, 0) for x, y in NE_WALL2]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ghosts", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--stone", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.stone:
        do_stone(ai)
        return 0
    th = threat(ai)
    if a.ghosts:
        if th["near"]:
            say("유령 보류: 북·동 근접 적 %s (대형 %s)" % (th["near"], th["big"]))
            return 1
        say("시작 망2 %s" % th)
        say("나무 해체 표시 %s" % mark_trees(ai))
        res = ghosts(ai, items())
        say("유령 %s %s" % (tally(res), [r for r in res if "BLOCKED" in r or "FAIL" in r or "WRONG" in r][:12]))
    elif a.verify:
        print(" 망2", th)
        for r in turrets(ai, list(NEW_GUNS)):
            print("   ", r)
        print("  벽", tally(ghosts(ai, [("stone-wall", x, y, 0) for x, y in EAST_GAPS + NE_WALL2], dry=True)))
    else:
        print(" 망2", th)
        res = ghosts(ai, items(), dry=True)
        print(" 점검", tally(res))
        for r in res:
            if not r.endswith(" ok"):
                print("   ", r)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

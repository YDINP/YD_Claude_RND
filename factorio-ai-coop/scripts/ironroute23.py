"""철 전초 (-210,-244) -> 기지 철 벨트 경로 - 23회차. 방어선 안 구간만 로봇 유령으로 미리 깐다.

실측 (2026-09-27 20:30):
    · 철 화로 40 = p27 16 (x -102..-88, y -62/-57, 입력 x=-103.5 줄 <- y=-44.5 서향 <- x=-87.5 북향) +
      col41 24 (x -41/-36, y -44..-22, 입력 x=-38.5 남향). no_ingredients 29 = col41 24 + p27 5.
    · col41 입력 = y=-45.5 동향 줄 (x -86.5 -> -39.5 -> x=-38.5 남향). 레인: 왼쪽(북) = 석탄 (x=-51.5 에서 북쪽 옆치기),
      오른쪽(남) = 철광석 (서쪽 트렁크 x=-85.5 북향이 (-85.5,-45.5) 에서 남쪽 옆치기).
      -> 새 광석은 **오른쪽 레인에만** 들어가야 한다 (왼쪽을 채우면 석탄 옆치기가 막혀 col41 연료가 끊긴다).
    · 합류점: 트렁크 (-85.5,-43.5) 북향의 서쪽 옆치기. 트렁크는 어느 레인이든 y=-45.5 의 오른쪽 레인으로만 옆치기하므로
      석탄 레인은 안전하다. 오른쪽 레인 7.5/s = 돌 화로 24 대 (0.3125/s) 와 딱 맞다.
    · 벽 통과: 북벽 (y -113/-112) NW 모서리 x=-112.5 를 지하로 (입구 (-112.5,-113.5) 벽 바로 바깥 1칸, 출구 (-112.5,-110.5)).
    · 안쪽: x=-112.5 남향 (벽 x -115/-114 과 포탑 줄 x -111/-110 사이 빈 두 칸) -> 탄 벨트 y=-46.5·분배기 (-111.5,-46) 밑 지하 ->
      y=-43.5 동향 (빈 줄) -> p27 광석 줄 x=-87.5 밑 지하 -> (-86.5,-43.5) 출구가 트렁크에 옆치기.
    · 바깥: y=-244.5 동향 (전초 동쪽 끝 x=-194.5) -> x=-155.5 남향 -> y=-114.5 동향 -> (-112.5,-114.5) 남향.
      x=-155.5 는 북쪽 둥지 큰 벌레 (-107,-206) 와 서쪽 둥지 중간 벌레 (-203,-156) 에서 각각 약 48 (사거리 38/30).

    python scripts/ironroute23.py              # 조사 (안쪽 놓을 수 있나 · 재고 · 바깥 장애물)
    python scripts/ironroute23.py --ghosts     # 안쪽 구간 로봇 유령
    python scripts/ironroute23.py --verify     # 선 것 / 유령 / 빈 칸
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
from client import AIBridge  # noqa: E402

N, E, S, W = 0, 4, 8, 12
LOG = os.path.join(HERE, "..", "state", "ironroute23.log")
BELT, UG = "transport-belt", "underground-belt"
HEAD = (-194.5, -244.5)        # 전초 쪽 머리 (광맥 동쪽 끝 x -195.5 바로 옆)
VX = -155.5                    # 바깥 세로 줄
HY = -114.5                    # 북벽 바깥 가로 줄
CX = -112.5                    # 안쪽 세로 줄 (벽 모서리)
IN_Y = -43.5                   # 안쪽 가로 줄
MERGE = (-85.5, -43.5)         # 트렁크 옆치기 칸
WORMS = [(-100, -206, 38), (-107, -206, 38), (-203, -156, 30), (-220, -156, 38), (-215, -153, 30),
         (-227, -150, 30), (-222, -149, 38), (-212, -111, 25), (-212, -106, 30), (-215, -106, 25),
         (-219, -100, 30), (-216, -99, 25)]       # 전초 둥지 (-227..-211,-255..-239) 는 포격 대상이라 뺀다


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def outside():
    """바깥 구간 (짓지 않음): 전초 머리 -> 북벽 바깥 (-112.5,-114.5)."""
    out = []
    x = HEAD[0]
    while x < VX:
        out.append((BELT, x, HEAD[1], E))
        x += 1
    y = HEAD[1]
    while y < HY:
        out.append((BELT, VX, y, S))
        y += 1
    x = VX
    while x < CX:
        out.append((BELT, x, HY, E))
        x += 1
    out.append((BELT, CX, HY, S))
    return out


def inside():
    """벽 통과 + 방어선 안 구간 (로봇)."""
    out = [(UG, CX, -113.5, S, "input"), (UG, CX, -110.5, S, "output")]      # 북벽 y -113/-112 밑
    y = -109.5
    while y <= -48.5:
        out.append((BELT, CX, y, S))
        y += 1
    out += [(UG, CX, -47.5, S, "input"), (UG, CX, -44.5, S, "output")]      # 탄 벨트 y=-46.5 · 분배기 (-111.5,-46) 밑
    x = CX
    while x <= -89.5:
        out.append((BELT, x, IN_Y, E))
        x += 1
    out += [(UG, -88.5, IN_Y, E, "input"), (UG, -86.5, IN_Y, E, "output")]   # p27 광석 줄 x=-87.5 밑 -> 트렁크 옆치기
    return out


def need(items):
    t = {}
    for it in items:
        t[it[0]] = t.get(it[0], 0) + 1
    return t


def ghosts(ai, items, dry=False):
    blob = ";".join("%s,%s,%s,%s,%s" % (t[0], t[1], t[2], t[3], t[4] if len(t) > 4 else "-") for t in items)
    r = ai.lua("""(function() local s, f, o, dry = game.surfaces[1], game.forces.player, {}, %s
      for bit in string.gmatch("%s", "[^;]+") do
        local n, x, y, d, t = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)") x, y, d = tonumber(x), tonumber(y), tonumber(d)
        local e = s.find_entities_filtered{name = n, position = {x, y}, radius = 0.1, force = f}[1]
        if e then o[#o+1] = bit .. (e.direction == d and " standing" or " WRONGDIR")
        elseif s.find_entities_filtered{ghost_name = n, position = {x, y}, radius = 0.1, force = f}[1] then o[#o+1] = bit .. " ghost"
        elseif s.can_place_entity{name = n, position = {x, y}, direction = d, force = f, build_check_type = defines.build_check_type.manual_ghost} then
          if dry then o[#o+1] = bit .. " ok" else
            local a = {name = 'entity-ghost', inner_name = n, position = {x, y}, direction = d, force = f}
            if t ~= '-' then a.type = t end
            o[#o+1] = bit .. (s.create_entity(a) and " NEW" or " FAIL") end
        else
          local b = s.find_entities_filtered{area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}}[1]
          o[#o+1] = bit .. " BLOCKED:" .. (b and (b.name .. "/" .. (b.last_user and b.last_user.name or "-")) or "tile") end
      end return o end)()""" % ("true" if dry else "false", blob))
    return rows(r)


def tally(res):
    out = {}
    for r in res:
        k = r.rsplit(" ", 1)[1].split(":")[0]
        out[k] = out.get(k, 0) + 1
    return out


def stock(ai):
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local n = nil
      for _, c in pairs(s.find_logistic_networks_by_construction_area({%s, %s}, f)) do
        if not n or c.all_construction_robots > n.all_construction_robots then n = c end end
      if not n then return {net = 'none'} end
      return {net = n.network_id, belt = n.get_item_count('transport-belt'), ug = n.get_item_count('underground-belt'),
              bots = n.available_construction_robots} end)()""" % MERGE)
    return r


def survey_outside(ai, items):
    """바깥 칸: 물 · 나무/바위 · 기존 건물 · 벌레 사거리."""
    blob = ";".join("%s,%s" % (t[1], t[2]) for t in items)
    r = ai.lua("""(function() local s, o = game.surfaces[1], {water = 0, tree = 0, rock = 0, other = 0, list = {}}
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)") x, y = tonumber(x), tonumber(y)
        if s.get_tile(x, y).collides_with('water_tile') then o.water = o.water + 1 o.list[#o.list+1] = bit .. ' water' end
        for _, e in pairs(s.find_entities_filtered{area = {{x - 0.4, y - 0.4}, {x + 0.4, y + 0.4}}}) do
          if e.type == 'tree' then o.tree = o.tree + 1 elseif e.type == 'simple-entity' then o.rock = o.rock + 1
          elseif e.type ~= 'resource' and e.type ~= 'fish' and e.type ~= 'corpse' then o.other = o.other + 1
            o.list[#o.list+1] = bit .. ' ' .. e.name .. '/' .. (e.force and e.force.name or '') end end
      end return o end)()""" % blob)
    worst = min(((((t[1] - wx) ** 2 + (t[2] - wy) ** 2) ** 0.5 - rng, t[1], t[2], wx, wy) for t in items
                 for wx, wy, rng in WORMS))
    return r, worst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ghosts", action="store_true")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    ins, outs = inside(), outside()
    if a.ghosts:
        res = ghosts(ai, ins)
        say("ghosts %s" % tally(res))
        for r in res:
            if "BLOCKED" in r or "FAIL" in r or "WRONGDIR" in r:
                say("  " + r)
        say("stock %s  need %s" % (stock(ai), need(ins)))
        return
    res = ghosts(ai, ins, dry=True)
    say(("verify" if a.verify else "inside") + " %s  need %s" % (tally(res), need(ins)))
    for r in res:
        if "BLOCKED" in r or "WRONGDIR" in r:
            say("  " + r)
    say("stock %s" % stock(ai))
    if not a.verify:
        o, worst = survey_outside(ai, outs)
        say("outside %d tiles need %s  water=%s tree=%s rock=%s other=%s" % (
            len(outs), need(outs), o.get("water"), o.get("tree"), o.get("rock"), o.get("other")))
        for line in rows(o.get("list"))[:30]:
            say("  " + line)
        say("closest worm margin %.1f at (%.1f,%.1f) worm (%d,%d)" % worst)


if __name__ == "__main__":
    main()

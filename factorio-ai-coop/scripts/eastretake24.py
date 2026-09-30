"""Run 24: 동쪽 철 전초 되찾기 - 포탑 기어가기 (turret creep) 를 로봇 유령으로.

13:3x~13:4x 공습 (큰 이빨 · 큰 침 섞임, evo 0.54): 포탑 28 · 북쪽 로보포트 · 드릴 46 · 화로 19 잃음, 유령 ~360.
노랑은 큰 이빨 (물리 8/10%) 에 거의 안 들어가 (7.2 < 8) 피어싱만 쓴다 (1 발 ~3.2).

  1) --hold   : 적 한가운데 포탑 유령 (x > HOLD_X) 을 치워 목록 (state/run24_east_hold.json) 에 둔다.
                그냥 두면 로봇이 탄 없는 포탑을 적 곁에 하나씩 지어 또 먹힌다.
  2) --stage  : 서쪽 문 (eastsup 의 로보포트 (347,-103) 동쪽) 에 포탑 12 + 두 겹 벽 유령. 포탑 유령마다 insert_plan 피어싱 20
                → 로봇이 짓고 곧바로 탄을 넣는다. can_place manual 통과 · 같은 이름 선 칸 / 유령 건너뜀.
  3) --advance: 무장 포탑 (탄 ≥ 10) 2 개 이상이 20 칸 안에 있는 목록 자리를 다시 유령으로 (한 번에 ≤ STEP, 망 포탑 · 피어싱 있을 때만).
                기어가기: 서쪽 문 → 남서 줄 (388,-118..-130) → 남쪽 줄 (y -110) → 북쪽 ...
Lua 아이템 이동 0 - 유령 · insert_plan 만 (로봇이 망 상자에서 날라 짓고 넣는다).

    python scripts/eastretake24.py --hold
    python scripts/eastretake24.py --stage
    python scripts/eastretake24.py --advance --every 60
    python scripts/eastretake24.py --status
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge, RconError  # noqa

HOLD_FILE = os.path.join(HERE, "..", "state", "run24_east_hold.json")
BOX = (340, -215, 460, -90)
HOLD_X = 376                       # 이 동쪽 포탑 유령은 붙들어 둔다
PORT3 = (347.0, -103.0)
AMMO = "piercing-rounds-magazine"
FILL = 20
STEP = 4
STAGE = [(x, y) for x in (366, 369, 372) for y in (-116, -113, -110, -107)]
WALLS = [(x + 0.5, y + 0.5) for x in (375, 376) for y in range(-121, -102)] + \
        [(x + 0.5, y + 0.5) for y in (-121, -122) for x in range(363, 377)]

COMMON = """
  local s, f = game.surfaces[1], game.forces.player
  local B = {{%d, %d}, {%d, %d}}
  local function net() return s.find_logistic_network_by_position({347, -103}, f) or s.find_logistic_network_by_position({394, -120}, f) end
  local function place(name, p, ammo)
    if s.count_entities_filtered{position = p, radius = 0.9, name = name} + s.count_entities_filtered{position = p, radius = 0.9, ghost_name = name} > 0 then return 'skip' end
    if not s.can_place_entity{name = name, position = p, force = f, build_check_type = defines.build_check_type.manual} then return 'blocked' end
    local g = s.create_entity{name = 'entity-ghost', inner_name = name, position = p, force = f}
    if g and ammo then pcall(function() g.insert_plan = {{id = {name = '%s'}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = %d}}}}} end) end
    return g and 'ghost' or 'fail'
  end
  local function armed()
    local t = {}
    for _, e in pairs(s.find_entities_filtered{area = B, name = 'gun-turret', force = f}) do
      if e.get_inventory(defines.inventory.turret_ammo).get_item_count() >= 10 then t[#t + 1] = e.position end
    end
    return t
  end
""" % (BOX[0], BOX[1], BOX[2], BOX[3], AMMO, FILL)


def hold(ai):
    old = []
    if os.path.exists(HOLD_FILE):
        old = json.load(open(HOLD_FILE, encoding="utf-8"))
    got = ai.lua("""(function()%s
      local out = {}
      for _, g in pairs(s.find_entities_filtered{area = B, ghost_name = 'gun-turret', force = f}) do
        if g.position.x > %d then out[#out + 1] = {g.position.x, g.position.y} g.destroy() end
      end
      return out
    end)()""" % (COMMON, HOLD_X))
    got = list(got.values()) if isinstance(got, dict) else (got or [])
    got = [list(p.values()) if isinstance(p, dict) else p for p in got]
    keep = old + [p for p in got if p not in old]
    json.dump(keep, open(HOLD_FILE, "w", encoding="utf-8"))
    return {"held_now": len(got), "held_total": len(keep)}


def stage(ai):
    return ai.lua("""(function()%s
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do local r = place('gun-turret', p, true) out[r] = (out[r] or 0) + 1 end
      for _, p in pairs(helpers.json_to_table('%s')) do local r = place('stone-wall', p, false) out['wall_' .. r] = (out['wall_' .. r] or 0) + 1 end
      return out
    end)()""" % (COMMON, json.dumps([list(p) for p in STAGE]), json.dumps([list(p) for p in WALLS])))


def advance(ai):
    held = json.load(open(HOLD_FILE, encoding="utf-8")) if os.path.exists(HOLD_FILE) else []
    if not held:
        return {"held": 0}
    r = ai.lua("""(function()%s
      local H = helpers.json_to_table('%s')
      local A = armed()
      local n = net()
      local tur = n and n.get_item_count('gun-turret') or 0
      local amm = n and n.get_item_count('%s') or 0
      local pend = s.count_entities_filtered{area = B, ghost_name = 'gun-turret', force = f}
      local out = {armed = #A, net_turrets = tur, net_ammo = amm, pending = pend, placed = {}, left = {}}
      local budget = math.min(%d - pend, tur - pend, math.floor(amm / %d) - pend)
      for _, p in pairs(H) do
        local near = 0
        for _, q in pairs(A) do if (q.x - p[1]) ^ 2 + (q.y - p[2]) ^ 2 <= 400 then near = near + 1 end end
        local done = s.count_entities_filtered{position = p, radius = 0.9, name = 'gun-turret'} > 0
        if done then
        elseif near >= 2 and budget > 0 then
          local res = place('gun-turret', p, true)
          if res == 'blocked' then            -- 벽 · 드릴 유령에 막히면 둘레 2~3 칸에서 설 자리
            for _, d in pairs({{0, 3}, {0, -3}, {3, 0}, {-3, 0}, {3, 3}, {-3, 3}, {3, -3}, {-3, -3}}) do
              local q = {p[1] + d[1], p[2] + d[2]}
              if res == 'blocked' and s.count_entities_filtered{position = q, radius = 2.5, type = 'entity-ghost'} == 0 then
                local r2 = place('gun-turret', q, true)
                if r2 == 'ghost' then res = 'ghost' end
              end
            end
          end
          if res == 'ghost' then budget = budget - 1 out.placed[#out.placed + 1] = p
          elseif res == 'skip' then else out.left[#out.left + 1] = {p[1], p[2], res} end
        else out.left[#out.left + 1] = p end
      end
      return out
    end)()""" % (COMMON, json.dumps(held), AMMO, STEP, FILL))
    placed = r.get("placed") or []
    placed = list(placed.values()) if isinstance(placed, dict) else placed
    left = r.get("left") or []
    left = list(left.values()) if isinstance(left, dict) else left
    left = [list(p.values()) if isinstance(p, dict) else p for p in left]
    json.dump([p[:2] for p in left], open(HOLD_FILE, "w", encoding="utf-8"))
    r["placed"], r["left"] = len(placed), len(left)
    return r


def status(ai):
    return ai.lua("""(function()%s
      local n = net()
      local out = {armed = #armed(), turrets = s.count_entities_filtered{area = B, name = 'gun-turret', force = f},
                   tghost = s.count_entities_filtered{area = B, ghost_name = 'gun-turret', force = f},
                   ghosts = s.count_entities_filtered{area = B, type = 'entity-ghost', force = f},
                   foes = s.count_entities_filtered{area = B, force = 'enemy', type = 'unit'}}
      if n then out.net = {id = n.network_id, robots = n.all_construction_robots, turrets = n.get_item_count('gun-turret'),
                           ammo = n.get_item_count('%s'), walls = n.get_item_count('stone-wall'), repair = n.get_item_count('repair-pack')} end
      return out
    end)()""" % (COMMON, AMMO))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--hold", action="store_true")
    ap.add_argument("--stage", action="store_true")
    ap.add_argument("--advance", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--every", type=int, default=0)
    a = ap.parse_args()
    ai = AIBridge()
    if a.hold:
        print(hold(ai))
    if a.stage:
        print(stage(ai))
    if a.status:
        print(status(ai))
    while a.advance:
        try:
            ai = ai or AIBridge()
            print(time.strftime("%H:%M:%S"), json.dumps(advance(ai)), json.dumps(status(ai)), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if not a.every:
            break
        time.sleep(a.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

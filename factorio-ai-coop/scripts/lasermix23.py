"""레이저 포탑 섞기 - 사용자 (01:10): "기관포탑도 좋지만 레이저포탑도 좋음. 방어선으로 구축할때 좀 섞어서 써".

1. (한 번) 망 2 주 창고 (-60.5,-33.5) 옆 빈 전기 자리에 조립기 1 유령 -> 로봇이 망 재고로 짓고, 레시피 laser-turret.
2. (60 초마다) 그 조립기에 로봇 배달 (item-request-proxy, 한 번 ≤100):
   강철 20 은 망 강철 ≥150 일 때만 (대포 포탄이 우선), 회로 20 · 배터리 12 는 재고가 될 때.
   완성된 레이저 포탑은 Lua 로 출력 -> 주 창고로 옮겨 망 재고가 되게 한다 (battfeed23 RELAYS 방식).
3. 망에 레이저 재고가 있으면 대포 방어 링 (state/arty_kit.json "site") 반경 14~20, 적 쪽에
   기관포탑 사이사이로 레이저 유령을 세운다. 전봇대 공급 범위가 덮는 자리만 - 안 덮이면 망에 소형 전봇대가 있을 때만
   전봇대 유령을 곁들이고, 없으면 건너뜀.

세운 레이저·전봇대는 artykit23 의 members 에 넣지 않고 state/laser_ring.json 에 따로 적는다
(대포 키트 이전과 독립으로 나중에 옮길 수 있게). 옮길 때는 이 목록을 읽어 해체 -> 새 site 둘레에 다시 세우면 된다.
Guiltyring 소유 엔티티는 건드리지 않는다 (먹이만).

    nohup python -u scripts/lasermix23.py > state/lasermix23.log 2>&1 &
    python -u scripts/lasermix23.py --once --dry
"""
import argparse
import json
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, "..", "state", "arty_kit.json")
RING = os.path.join(HERE, "..", "state", "laser_ring.json")
STORE = (-60.5, -33.5)  # 망 2 주 창고
ASM_CANDS = [(-58.5, -32.5), (-57.5, -31.5), (-56.5, -32.5), (-55.5, -32.5), (-60.5, -40.5), (-55.5, -39.5)]
STEEL_FLOOR = 150       # 포탄 몫
MAX_LASERS = 8          # 링 레이저 상한 (한 site 당)

LUA_COMMON = """local s = game.surfaces[1]
local function cov(p, half)
  for _, e in pairs(s.find_entities_filtered{type = 'electric-pole', position = p, radius = 14}) do
    local r = e.prototype.get_supply_area_distance()
    if math.abs(e.position.x - p.x) < r + half and math.abs(e.position.y - p.y) < r + half then return true end
  end
  for _, e in pairs(s.find_entities_filtered{ghost_type = 'electric-pole', position = p, radius = 14}) do
    local r = e.ghost_prototype.get_supply_area_distance()
    if math.abs(e.position.x - p.x) < r + half and math.abs(e.position.y - p.y) < r + half then return true end
  end
  return false
end
"""

# 조립기: 이미 있으면 위치만, 없으면 유령 (레시피 유령에 설정)
ASM_LUA = """(function() %s local o = {}
  local DRY = %s
  for _, n in pairs({'assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3'}) do
    for _, a in pairs(s.find_entities_filtered{name = n, position = {%s, %s}, radius = 14}) do
      local r = a.get_recipe() if r and r.name == 'laser-turret' then o.pos = {a.position.x, a.position.y} o.state = 'built' return o end
    end
    for _, g in pairs(s.find_entities_filtered{ghost_name = n, position = {%s, %s}, radius = 14}) do
      local ok, r = pcall(function() return g.get_recipe() end)
      if ok and r and r.name == 'laser-turret' then o.pos = {g.position.x, g.position.y} o.state = 'ghost' return o end
    end
  end
  for _, c in pairs({%s}) do
    local p = {x = c[1], y = c[2]}
    local clear = s.count_entities_filtered{area = {{p.x - 1.4, p.y - 1.4}, {p.x + 1.4, p.y + 1.4}}, type = {'resource', 'tile-ghost'}, invert = true} == 0
    if clear and s.can_place_entity{name = 'assembling-machine-1', position = p, force = 'player'} and cov(p, 1.5)
       and s.find_logistic_network_by_position(p, 'player') then
      if DRY then o.pos = c o.state = 'dry' return o end
      local g = s.create_entity{name = 'entity-ghost', inner_name = 'assembling-machine-1', position = p, force = 'player'}
      local ok = pcall(function() g.set_recipe('laser-turret') end)
      o.pos = {g.position.x, g.position.y} o.state = ok and 'ghost+recipe' or 'ghost' return o
    end
  end
  o.state = 'nospot' return o end)()"""

# 먹이 + 출력 -> 창고. 유령에 레시피가 안 박혔으면 지어진 뒤 여기서 레시피 설정
FEED_LUA = """(function() %s local o = {req = {}}
  local a = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 0.6}[1]
  if not a then o.state = 'noasm' return o end
  if not a.get_recipe() then pcall(function() a.set_recipe('laser-turret') end) end
  local r = a.get_recipe()
  if not r or r.name ~= 'laser-turret' then o.state = 'recipe?' return o end
  local net = s.find_logistic_network_by_position(a.position, 'player')
  local inv = a.get_inventory(defines.inventory.assembling_machine_input)
  local busy = s.count_entities_filtered{name = 'item-request-proxy', position = a.position, radius = 0.6} > 0
  local want = {{'steel-plate', 20, %d}, {'electronic-circuit', 20, 20}, {'battery', 12, 12}}
  local mods = {}
  if net and not busy then
    for _, w in pairs(want) do
      if inv.get_item_count(w[1]) < w[2] and net.get_item_count(w[1]) >= w[3] then
        local stack = 0
        for i, ing in pairs(r.ingredients) do if ing.name == w[1] then stack = i - 1 end end
        mods[#mods + 1] = {id = {name = w[1]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = stack, count = w[2]}}}}
        o.req[#o.req + 1] = w[1] .. ' ' .. w[2]
      end
    end
    if #mods > 0 then s.create_entity{name = 'item-request-proxy', position = a.position, force = 'player', target = a, modules = mods} end
  end
  local out = a.get_output_inventory()
  local n = out.get_item_count('laser-turret')
  if n > 0 then
    local c = s.find_entities_filtered{type = 'logistic-container', position = {%s, %s}, radius = 0.6}[1]
    if c then local k = c.insert{name = 'laser-turret', count = n} if k > 0 then out.remove{name = 'laser-turret', count = k} o.moved = k end end
  end
  o.inv = {steel = inv.get_item_count('steel-plate'), ec = inv.get_item_count('electronic-circuit'), bat = inv.get_item_count('battery')}
  o.status = a.status o.progress = math.floor(a.crafting_progress * 100)
  if net then o.net = {steel = net.get_item_count('steel-plate'), ec = net.get_item_count('electronic-circuit'),
                       bat = net.get_item_count('battery'), laser = net.get_item_count('laser-turret'), pole = net.get_item_count('small-electric-pole')} end
  return o end)()"""

# 링: 적 쪽 반경 14~20, 기관포탑 곁 (7 칸 안에 기관포탑이 있어야 '사이') · 포탑/레이저 3 칸 안엔 없음
RING_LUA = """(function() %s local o = {lasers = {}, poles = {}}
  local A = {x = %s, y = %s} local DRY = %s local N = %d
  local net = s.find_logistic_network_by_position(A, 'player')
  if not net then o.state = 'nonet' return o end
  local pending = s.count_entities_filtered{ghost_name = 'laser-turret', position = A, radius = 26}
  local stock = net.get_item_count('laser-turret')
  N = math.min(N, stock - pending)
  o.stock = stock o.pending = pending
  if N <= 0 then return o end
  local poles = net.get_item_count('small-electric-pole') - s.count_entities_filtered{ghost_name = 'small-electric-pole', position = A, radius = 26}
  local e = s.find_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = A, radius = 400}
  local face = -math.pi / 2
  local bd = 1e18 for _, x in pairs(e) do local d = (x.position.x - A.x)^2 + (x.position.y - A.y)^2 if d < bd then bd = d face = math.atan2(x.position.y - A.y, x.position.x - A.x) end end
  o.face = math.floor(face * 180 / math.pi)
  local function near(name, p, r) return s.count_entities_filtered{name = name, position = p, radius = r} + s.count_entities_filtered{ghost_name = name, position = p, radius = r} end
  for _, R in pairs({16, 14, 18, 20}) do
    for _, da in pairs({10, -10, 30, -30, 50, -50, 70, -70, 90, -90}) do
      if #o.lasers >= N then break end
      local a = face + da * math.pi / 180
      local p = {x = math.floor(A.x + R * math.cos(a) + 0.5), y = math.floor(A.y + R * math.sin(a) + 0.5)}
      if near('gun-turret', p, 7) > 0 and near('gun-turret', p, 3) == 0 and near('laser-turret', p, 4) == 0
         and s.can_place_entity{name = 'laser-turret', position = p, force = 'player'} and s.find_logistic_network_by_position(p, 'player') then
        local ok = cov(p, 1)
        if not ok and poles > 0 then
          -- 전봇대 사슬: 레이저 안쪽 2 칸 q 에서 가장 가까운 전봇대(실물·유령)까지 6.5 칸 간격. 재고가 사슬 전체를 댈 때만
          local ix, iy = A.x - p.x, A.y - p.y local L = math.sqrt(ix * ix + iy * iy)
          local q = {x = math.floor(p.x + ix / L * 2) + 0.5, y = math.floor(p.y + iy / L * 2) + 0.5}
          local P0, bd2 = nil, 1e18
          for _, pe in pairs(s.find_entities_filtered{type = 'electric-pole', position = q, radius = 40}) do
            local d = (pe.position.x - q.x)^2 + (pe.position.y - q.y)^2 if d < bd2 then bd2 = d P0 = pe.position end end
          for _, pe in pairs(s.find_entities_filtered{ghost_type = 'electric-pole', position = q, radius = 40}) do
            local d = (pe.position.x - q.x)^2 + (pe.position.y - q.y)^2 if d < bd2 then bd2 = d P0 = pe.position end end
          if P0 then
            local hops = math.max(1, math.ceil(math.sqrt(bd2) / 6.5))
            local chain = {}
            for k = 1, hops do
              local c = {x = math.floor(P0.x + (q.x - P0.x) * k / hops) + 0.5, y = math.floor(P0.y + (q.y - P0.y) * k / hops) + 0.5}
              local put = nil
              for _, d in pairs({{0, 0}, {1, 0}, {-1, 0}, {0, 1}, {0, -1}}) do
                local c2 = {x = c.x + d[1], y = c.y + d[2]}
                local prev = chain[#chain] or P0
                if not put and (c2.x - prev.x)^2 + (c2.y - prev.y)^2 <= 7.4 * 7.4 and s.can_place_entity{name = 'small-electric-pole', position = c2, force = 'player'} then put = c2 end
              end
              if not put then chain = nil break end
              chain[#chain + 1] = put
            end
            if chain and #chain <= poles then
              local last = chain[#chain]
              if math.abs(last.x - p.x) < 2.5 + 1 and math.abs(last.y - p.y) < 2.5 + 1 then
                for _, c in pairs(chain) do
                  if not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'small-electric-pole', position = c, force = 'player'} end
                  o.poles[#o.poles + 1] = {c.x, c.y}
                end
                poles = poles - #chain ok = true
              end
            else o.short = (o.short or 0) + 1 end
          end
        end
        if ok then
          if not DRY then s.create_entity{name = 'entity-ghost', inner_name = 'laser-turret', position = p, force = 'player'} end
          o.lasers[#o.lasers + 1] = {p.x, p.y}
        end
      end
    end
  end
  return o end)()"""

EXIST_LUA = """(function() local s = game.surfaces[1] local o = {}
  for i, p in pairs({%s}) do
    local n = s.count_entities_filtered{name = 'laser-turret', position = p, radius = 0.6} + s.count_entities_filtered{ghost_name = 'laser-turret', position = p, radius = 0.6}
    o[#o + 1] = n > 0 and 1 or 0
  end
  return o end)()"""


def vals(x):
    return list(x.values()) if isinstance(x, dict) else (x or [])


def load_ring():
    try:
        with open(RING, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"note": "lasermix23 가 세운 레이저·전봇대 (artykit23 members 와 별개, 이전 시 따로 옮길 것)",
                "asm": None, "turrets": [], "poles": []}


def save_ring(d):
    with open(RING, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


# 01:21 배터리 화학공장 (25.5,-4.5) 출력이 9 로 가득 (full_output) - 받아 가는 쪽이 막혀 망엔 7 뿐.
# 가득 찼을 때만 남는 것을 레이저 조립기 입력으로 바로 옮긴다 (Lua 중계). 하류 (프레임) 몫 5 는 남긴다.
BATT_LUA = """(function() local s = game.surfaces[1]
  local p = s.find_entities_filtered{name = 'chemical-plant', position = {25.5, -4.5}, radius = 1}[1]
  local a = s.find_entities_filtered{type = 'assembling-machine', position = {%s, %s}, radius = 1}[1]
  if not (p and a) then return {n = 0} end
  local out = p.get_inventory(defines.inventory.assembling_machine_output) local c = out.get_item_count('battery')
  local inv = a.get_inventory(defines.inventory.assembling_machine_input) local need = 24 - inv.get_item_count('battery')
  local k = math.min(c - 5, need) if k <= 0 then return {n = 0} end
  local got = out.remove{name = 'battery', count = k} if got > 0 then inv.insert{name = 'battery', count = got} end
  return {n = got} end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=60)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    ring = load_ring()
    dry = "true" if a.dry else "false"
    r = ai.lua(ASM_LUA % (LUA_COMMON, dry, STORE[0], STORE[1], STORE[0], STORE[1],
                          ", ".join("{%s, %s}" % p for p in ASM_CANDS)))
    print(time.strftime("%H:%M:%S"), "조립기", r, flush=True)
    if not r.get("pos"):
        return 1
    asm = vals(r["pos"])
    if not a.dry:
        ring["asm"] = asm
        save_ring(ring)
    while True:
        try:
            b = ai.lua(BATT_LUA % (asm[0], asm[1]))
            if b.get("n"):
                print(time.strftime("%H:%M:%S"), "배터리 중계", b["n"], flush=True)
            f = ai.lua(FEED_LUA % (LUA_COMMON, asm[0], asm[1], STEEL_FLOOR + 20, STORE[0], STORE[1]))
            print(time.strftime("%H:%M:%S"), "레이저 조립기", {k: (vals(v) if k == "req" else v) for k, v in f.items()}, flush=True)
            with open(KIT, encoding="utf-8") as fh:
                site = json.load(fh)["site"]
            # 사라진 (해체·파괴 뒤 유령도 없는) 기록은 지운다
            if ring["turrets"]:
                ex = vals(ai.lua(EXIST_LUA % ", ".join("{%s, %s}" % tuple(p) for p in ring["turrets"])))
                ring["turrets"] = [p for p, e in zip(ring["turrets"], ex) if e]
            here = [p for p in ring["turrets"] if (p[0] - site[0]) ** 2 + (p[1] - site[1]) ** 2 <= 26 ** 2]
            left = MAX_LASERS - len(here)
            if left > 0 and (f.get("net") or {}).get("laser", 0) > 0:
                g = ai.lua(RING_LUA % (LUA_COMMON, site[0], site[1], dry, left))
                ls, ps = [vals(p) for p in vals(g.get("lasers"))], [vals(p) for p in vals(g.get("poles"))]
                if ls or ps:
                    print(time.strftime("%H:%M:%S"), "링 레이저 유령", ls, "전봇대", ps, "face", g.get("face"), flush=True)
                    if not a.dry:
                        ring["turrets"] += ls
                        ring["poles"] += ps
                ring["site"] = site
            if not a.dry:
                save_ring(ring)
        except Exception as e:  # noqa: BLE001
            print(f"lasermix: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

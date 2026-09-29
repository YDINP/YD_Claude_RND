"""우라늄 전초 (-391,106) - docs/outpost-mining-plan-run23.md §11.

    station  기지 안 황산 · 통 채우기 역 (로봇 유령, 벽 안). 보일러 뱅크 서쪽 끝 물관 (-50.5,47.5) 에서 북쪽으로 분기.
             화학 공장 (-53.5,41.5) 황산 · 조립기2 (-53.5,37.5) 황산 통 채우기 · 입력 상자 (-56.5,41.5) 황+철 · 빈 통 상자 (-56.5,37.5) · 찬 통 상자 (-50.5,37.5)
    craft    손 제작 (쉬는 캐릭터 1): 조립기2 · 통 · 채굴기 · 철 상자 · 돌벽 · (연구 뒤) 원심분리기. 망 판 -> 가방 -> 제작 -> 망.
    outpost  전초 짓기 (캐릭터, outpostcrew23.run_job): def (벽 · 레이저 · 기관총 · 전봇대) -> mine (채굴기 · 통 비우기 · 벨트 · 원심분리기 · 팔 · 상자)
    relay    상주 Lua 중계 (있는 물건만 옮김, 품목별 상한):
               황   : full_output 황 공장 출력 -> 역 입력 상자 (상자 황 < 60 일 때, 공장에 10 남김)
               철판 : 망 2 -> 역 입력 상자 (< 30)
               찬 통: 역 찬 통 상자 -> 전초 찬 통 상자 (전초 < 20)
               빈 통: 전초 빈 통 상자 -> 역 빈 통 상자 (역 < 60)
               제품 : 전초 제품 상자 U-235 · U-238 -> 망 2 저장 (망 U-235 < 2,000 · U-238 < 10,000). 광석은 기지로 안 보냄.
    status   역 · 전초 상태

    python -u scripts/uranout23.py station
    python -u scripts/uranout23.py craft asm2 2
    python -u scripts/uranout23.py relay --every 20
로그 state/uranout23.log.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "uranout23.log")
OWNER = "uranout23"

N, E, S, W = 0, 4, 8, 12
# 역 (기지 안, 로봇). 팔 방향 = 집는 쪽 (2.0: direction 12 은 서쪽에서 집어 동쪽에 놓음 - (-12.5,-43.5) 실측)
ST_IN = (-56.5, 41.5)       # 황 + 철판
ST_EMPTY = (-56.5, 37.5)    # 빈 통
ST_FULL = (-50.5, 37.5)     # 찬 통
STATION = [
    ("pipe", -50.5, 46.5, N, None), ("pipe", -50.5, 45.5, N, None), ("pipe", -50.5, 44.5, N, None), ("pipe", -50.5, 43.5, N, None),
    ("pipe", -51.5, 43.5, N, None), ("pipe", -52.5, 43.5, N, None), ("pipe", -53.5, 43.5, N, None), ("pipe", -54.5, 43.5, N, None),
    ("chemical-plant", -53.5, 41.5, S, "sulfuric-acid"),  # 2.0 화학 공장 입력은 방향 쪽 - 08:57 N 으로 놓아 물이 출력칸에 붙음 -> S 로 돌림
    ("pipe", -54.5, 39.5, N, None), ("pipe", -53.5, 39.5, N, None), ("pipe", -52.5, 39.5, N, None),
    ("assembling-machine-2", -53.5, 37.5, S, "sulfuric-acid-barrel"),
    ("iron-chest", ST_IN[0], ST_IN[1], N, None), ("inserter", -55.5, 41.5, W, None),
    ("iron-chest", ST_EMPTY[0], ST_EMPTY[1], N, None), ("inserter", -55.5, 37.5, W, None),
    ("inserter", -51.5, 37.5, W, None), ("iron-chest", ST_FULL[0], ST_FULL[1], N, None),
    ("small-electric-pole", -55.5, 39.5, N, None), ("small-electric-pole", -51.5, 39.5, N, None),
    # 09:1x 콘크리트 (원심분리기 2 = 200, 망 70 · 기존 콘크리트 조립기 (-26.5,-61.5) 는 대포 조립기 몫). 물은 관 y=43.5 에서 북쪽 입력.
    ("assembling-machine-2", -53.5, 45.5, N, "concrete"), ("iron-chest", -56.5, 45.5, N, None), ("inserter", -55.5, 45.5, W, None),
    ("inserter", -53.5, 47.5, N, None), ("iron-chest", -53.5, 48.5, N, None),
    ("small-electric-pole", -51.5, 46.5, N, None), ("small-electric-pole", -56.5, 43.5, N, None),
]
CONC_IN = (-56.5, 45.5)
CONC_OUT = (-53.5, 48.5)

GHOST = """(function() local s = game.surfaces[1] local o = {made = 0, have = 0, fail = {}, trees = 0}
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1]
    if e then o.have = o.have + 1
      if t[5] and e.type == 'assembling-machine' and (not e.get_recipe() or e.get_recipe().name ~= t[5]) then e.set_recipe(t[5]) end
    elseif not s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] then
      local proto = prototypes.entity[t[1]] local h = (proto.tile_width or 1) / 2
      for _, x in pairs(s.find_entities_filtered{type = {'tree', 'simple-entity'}, area = {{t[2] - h, t[3] - h}, {t[2] + h, t[3] + h}}}) do
        if not x.to_be_deconstructed() then x.order_deconstruction('player') o.trees = o.trees + 1 end end
      local p = {name = 'entity-ghost', inner_name = t[1], position = {t[2], t[3]}, direction = t[4], force = 'player', expires = false}
      if t[5] then p.recipe = t[5] end
      local g = s.create_entity(p)
      if g then o.made = o.made + 1 else o.fail[#o.fail + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] end
    end
  end return o end)()"""


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def rows(builds):
    return ", ".join("{'%s', %s, %s, %d, %s}" % (n, x, y, d, ("'%s'" % r) if r else "nil") for n, x, y, d, r in builds)


def station(ai):
    r = ai.lua(GHOST % rows(STATION))
    log("역 유령: 만듦 %s · 이미 %s · 나무 해체 %s · 실패 %s" % (r.get("made"), r.get("have"), r.get("trees"), r.get("fail")))
    return r


# ---------------------------------------------------------------- 손 제작
CRAFT = {  # 제작 이름 -> (레시피, 개당 가방 재료)
    "asm2": ("assembling-machine-2", {"iron-plate": 30, "steel-plate": 2, "electronic-circuit": 6}),
    "barrel": ("barrel", {"steel-plate": 1}),
    "drill": ("electric-mining-drill", {"iron-plate": 23, "electronic-circuit": 3}),
    "chest": ("iron-chest", {"iron-plate": 8}),
    "wall": ("stone-wall", {"stone-brick": 5}),
    "centrifuge": ("centrifuge", {"concrete": 100, "steel-plate": 50, "advanced-circuit": 100, "iron-plate": 200}),
    "ptg": ("pipe-to-ground", {"iron-plate": 13}),
}


def craft(ai, what, n, who=None, gather=0):
    import orders
    import outpostcrew23 as crew
    import detached
    import coalp1_23
    recipe, per = CRAFT[what]
    if who is None:
        free = crew.free_crew(ai, 8)
        pick = [w for w in ("hotel", "foxtrot", "bravo", "charlie", "alpha") if w in free]
        if not pick:
            log("제작: 쉬는 사람 없음")
            return False
        who = pick[0]
    detached.mark([who], OWNER, minutes=20 + gather)
    need = {k: v * n for k, v in per.items()}
    bag = crew.load_bag(ai, who, need)
    t0 = time.time()
    # 09:17 망 철판 0 · 강철 12 (철 10 분 생산 6,128 < 소비 7,818) -> 30 초마다 망에 들어온 만큼 가방에 모은다 (gather 분까지)
    while gather and any(int((bag.get("bag") or {}).get(k, 0)) < v for k, v in need.items()) and time.time() - t0 < gather * 60:
        time.sleep(30)
        bag = crew.load_bag(ai, who, need)
    if any(int((bag.get("bag") or {}).get(k, 0)) < v for k, v in need.items()):
        log("%s 재료 모자람 %s / %s - 가방 -> 망, 제작 안 함" % (who, bag.get("bag"), need))
        import coalp1_23 as c1
        c1.bag_to_net(ai, who, list(need))
        detached.release([who])
        return False
    log("%s 가방 %s -> %s %d 손 제작" % (who, bag.get("bag"), recipe, n))
    orders.submit(ai, who, [("craft", {"recipe": recipe, "count": n, "wait": True})], strict=False)
    from proboport23 import BODY
    t0 = time.time()
    while time.time() - t0 < 900:  # 08:48 busy() 는 제작 대기열을 안 봐서 8 초 만에 끝남 -> crafting_queue_size 로 기다린다
        time.sleep(8)
        q = ai.lua(("(function() @BODY@ local b = body('%s') return {q = b and b.crafting_queue_size or 0} end)()" % who).replace("@BODY@", BODY))
        if not crew.busy(ai, [who]) and not q.get("q"):
            break
    r = coalp1_23.bag_to_net(ai, who, [recipe] + list(per) + ["iron-gear-wheel", "assembling-machine-1", "copper-cable"])
    detached.release([who])
    log("제작 뒤 가방 -> 망 %s" % r)
    return True


# ---------------------------------------------------------------- 중계
RELAY = """(function() local s = game.surfaces[1] local o = {}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  local function chest(p) if not p then return nil end return s.find_entities_filtered{type = 'container', position = p, radius = 0.4}[1] end  -- 08:57 p=nil 이면 온 지도 첫 상자 (-83.5,-287.5) 에 통 20 이 들어감
  local function inv(e) return e and e.get_inventory(defines.inventory.chest) end
  local ST_IN, ST_EMPTY, ST_FULL = chest({%s, %s}), chest({%s, %s}), chest({%s, %s})
  local OP_FULL, OP_EMPTY = chest(%s), chest(%s)
  local PROD = {%s}
  -- 황: full_output 황 공장 출력 -> 역 입력 (상자 황 < 60, 공장에 10 남김)
  if ST_IN then local i = inv(ST_IN)
    local want = 60 - i.get_item_count('sulfur') o.sulfur = 0
    if want > 0 then
      for _, c in pairs(s.find_entities_filtered{name = 'chemical-plant', force = 'player'}) do
        local r = c.get_recipe()
        if want > 0 and r and r.name == 'sulfur' and c.status == defines.entity_status.full_output then
          local out = c.get_inventory(defines.inventory.assembling_machine_output)
          local k = math.min(want, out.get_item_count('sulfur') - 10)
          if k > 0 then local put = i.insert{name = 'sulfur', count = k} if put > 0 then out.remove{name = 'sulfur', count = put} want = want - put o.sulfur = o.sulfur + put end end
        end
      end
    end
    local wi = 30 - i.get_item_count('iron-plate')
    if wi > 0 and net then local k = math.min(wi, net.get_item_count('iron-plate') - 200)
      if k > 0 then local got = net.remove_item{name = 'iron-plate', count = k} local put = i.insert{name = 'iron-plate', count = got}
        if put < got then net.insert({name = 'iron-plate', count = got - put}, 'storage') end o.iron = put end end
    o.st_in = {i.get_item_count('sulfur'), i.get_item_count('iron-plate')}
  end
  -- 찬 통: 역 -> 전초 (전초 < 20)
  if ST_FULL and OP_FULL then local a, b = inv(ST_FULL), inv(OP_FULL)
    local k = math.min(a.get_item_count('sulfuric-acid-barrel'), 20 - b.get_item_count('sulfuric-acid-barrel'))
    if k > 0 then local put = b.insert{name = 'sulfuric-acid-barrel', count = k} if put > 0 then a.remove{name = 'sulfuric-acid-barrel', count = put} o.full = put end end
    o.op_full = b.get_item_count('sulfuric-acid-barrel')
  end
  -- 빈 통: 전초 -> 역 (역 < 60)
  if ST_EMPTY and OP_EMPTY then local a, b = inv(OP_EMPTY), inv(ST_EMPTY)
    local k = math.min(a.get_item_count('barrel'), 60 - b.get_item_count('barrel'))
    if k > 0 then local put = b.insert{name = 'barrel', count = k} if put > 0 then a.remove{name = 'barrel', count = put} o.empty = put end end
    o.st_empty = b.get_item_count('barrel')
  end
  -- 빈 통 보충: 망 2 (손 제작한 통) -> 역 빈 통 상자 (< 20)
  if ST_EMPTY and net then local b = inv(ST_EMPTY) local k = math.min(20 - b.get_item_count('barrel'), net.get_item_count('barrel'))
    if k > 0 then local got = net.remove_item{name = 'barrel', count = k} local put = b.insert{name = 'barrel', count = got}
      if put < got then net.insert({name = 'barrel', count = got - put}, 'storage') end o.netbarrel = put end
    o.st_empty = b.get_item_count('barrel')
  end
  -- 콘크리트: 망 벽돌 · 철광석 -> 입력 상자 (벽돌 < 50 · 광석 < 10), 출력 상자 콘크리트 -> 망 (망 콘크리트 < 300)
  local CI, CO = chest({%s, %s}), chest({%s, %s})
  if CI and net then local i = inv(CI)
    for n, cap in pairs({['stone-brick'] = 50, ['iron-ore'] = 10}) do local k = math.min(cap - i.get_item_count(n), net.get_item_count(n))
      if k > 0 then local got = net.remove_item{name = n, count = k} local put = i.insert{name = n, count = got}
        if put < got then net.insert({name = n, count = got - put}, 'storage') end end end
  end
  if CO and net then local i = inv(CO) local k = math.min(i.get_item_count('concrete'), 300 - net.get_item_count('concrete'))
    if k > 0 then local put = net.insert({name = 'concrete', count = k}, 'storage') if put > 0 then i.remove{name = 'concrete', count = put} o.concrete = put end end
    o.net_conc = net.get_item_count('concrete')
  end
  -- 제품 -> 망 2 저장 (상한)
  local CAP = {['uranium-235'] = 2000, ['uranium-238'] = 10000}
  o.prod = {}
  if net then for _, p in pairs(PROD) do local c = chest(p)
    if c then local i = inv(c)
      for n, cap in pairs(CAP) do local k = math.min(i.get_item_count(n), cap - net.get_item_count(n))
        if k > 0 then local put = net.insert({name = n, count = k}, 'storage') if put > 0 then i.remove{name = n, count = put} o.prod[n] = (o.prod[n] or 0) + put end end end
    end end
    o.net = {net.get_item_count('uranium-235'), net.get_item_count('uranium-238')}
  end
  return o end)()"""

# ---------------------------------------------------------------- 전초 배치 (캐릭터가 짓는다)
# 광맥 고품위 칸 x -397..-384 · y 96..110. 채굴기 서 열 x=-392.5 (동향) · 동 열 x=-388.5 (서향), 줄 y 100.5 · 103.5 -> 벨트 x=-390.5 남향.
# 황산: 통 비우기 조립기2 (-390.5,95.5) 남쪽 출력 -> 관 y=98.5 -> 채굴기 북쪽 연결 (2.0 채굴기 유체 연결 = 좌 · 우 · 뒤).
# 원심분리기 (-393.5,109.5) · (-387.5,109.5) 벨트 양옆 (uranium-processing 트리거 연구 뒤).
# 벽 상자 x -401.5..-379.5 · y 91.5..116.5 (94), 안쪽 포탑 14 (레이저 8). 북쪽 바위 (-392..-387, 82..90) 는 벽 밖.
OP_FULL = (-393.5, 95.5)
OP_EMPTY = (-387.5, 95.5)
OP_PROD = [(-396.5, 109.5), (-384.5, 109.5)]
ENTRY = (-374.0, 104.0)   # U6 (-368,90) 링 남서, 벽 동쪽 밖
MED = [(-390.5, 92.5), (-395.5, 98.5), (-395.5, 106.5), (-390.5, 111.5), (-385.5, 106.5), (-385.5, 98.5), (-381.5, 97.5), (-376.5, 95.5)]
LASER = [((-395, 94), (-396.5, 92.5)), ((-386, 94), (-384.5, 92.5)), ((-394, 114), (-392.5, 113.5)), ((-387, 114), (-388.5, 113.5)),
         ((-399, 101), (-397.5, 102.5)), ((-399, 110), (-397.5, 111.5)), ((-382, 101), (-383.5, 102.5)), ((-382, 110), (-383.5, 111.5))]
GUN = [(-398, 94), (-383, 94), (-398, 114), (-383, 114), (-399, 106), (-382, 106)]
AMMO = 25
DEF = ([("medium-electric-pole", x, y, "north") for x, y in MED]
       + [("laser-turret", t[0], t[1], "north") for t, _ in LASER] + [("small-electric-pole", q[0], q[1], "north") for _, q in LASER]
       + [("gun-turret", x, y, "north") for x, y in GUN])
MINE = ([("electric-mining-drill", -392.5, y, "east") for y in (100.5, 103.5)]
        + [("electric-mining-drill", -388.5, y, "west") for y in (100.5, 103.5)]
        + [("assembling-machine-2", -390.5, 95.5, "north"), ("pipe", -390.5, 97.5, "north")]
        + [("pipe", x, 98.5, "north") for x in (-392.5, -391.5, -390.5, -389.5, -388.5)]
        + [("transport-belt", -390.5, y + 0.5, "south") for y in range(99, 111)]
        + [("iron-chest", OP_FULL[0], OP_FULL[1], "north"), ("inserter", -392.5, 95.5, "west"),
           ("inserter", -388.5, 95.5, "west"), ("iron-chest", OP_EMPTY[0], OP_EMPTY[1], "north")])
CENT = [("centrifuge", -393.5, 109.5, "north"), ("centrifuge", -387.5, 109.5, "north"),
        ("inserter", -391.5, 109.5, "east"), ("inserter", -389.5, 109.5, "west"),
        ("inserter", -395.5, 109.5, "east"), ("inserter", -385.5, 109.5, "west"),
        ("iron-chest", OP_PROD[0][0], OP_PROD[0][1], "north"), ("wooden-chest", OP_PROD[1][0], OP_PROD[1][1], "north")]  # 09:29 망 철 0 - 둘째는 나무 상자
WALL = sorted({("stone-wall", x + 0.5, y, "north") for x in range(-402, -379) for y in (91.5, 116.5)}
              | {("stone-wall", x, y + 0.5, "north") for x in (-401.5, -379.5) for y in range(92, 116)})
JOBS = {"def": DEF, "mine": MINE, "cent": CENT, "wall": WALL}
RECIPES = [((-390.5, 95.5), "empty-sulfuric-acid-barrel"), ((-393.5, 109.5), "uranium-processing"), ((-387.5, 109.5), "uranium-processing")]

CANPLACE = """(function() local s = game.surfaces[1] local o = {}
  local D = {north = 0, east = 4, south = 8, west = 12}
  for i, t in pairs({%s}) do
    if not s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.3}[1] then
      if not s.can_place_entity{name = t[1], position = {t[2], t[3]}, direction = D[t[4]], force = 'player', build_check_type = defines.build_check_type.manual} then
        local why = {} for _, e in pairs(s.find_entities_filtered{area = {{t[2] - 1.5, t[3] - 1.5}, {t[2] + 1.5, t[3] + 1.5}}}) do if e.type ~= 'resource' then why[#why + 1] = e.name .. '@' .. e.position.x .. ',' .. e.position.y end end
        o[#o + 1] = t[1] .. '@' .. t[2] .. ',' .. t[3] .. ' <- ' .. table.concat(why, ' ')
      end end end
  return o end)()"""

SETREC = """(function() local s = game.surfaces[1] local o = {}
  for _, t in pairs({%s}) do local e = s.find_entities_filtered{type = 'assembling-machine', position = {t[1], t[2]}, radius = 0.4}[1]
    if e then local r = e.get_recipe()
      if not r or r.name ~= t[3] then local ok = pcall(function() e.set_recipe(t[3]) end) o[#o + 1] = t[3] .. (ok and ' set' or ' fail') else o[#o + 1] = t[3] .. ' ok' end end end
  return o end)()"""

ROUTE = """(function() local s = game.surfaces[1] local o = {}
  for _, q in pairs({{-100, 75}, {-145, 80}, {-190, 80}, {-235, 92}, {-280, 98}, {-325, 100}, {-368, 90}, {-391, 104}}) do
    o[#o + 1] = s.count_entities_filtered{force = 'enemy', type = 'unit', position = q, radius = 50}
      + 100 * s.count_entities_filtered{force = 'enemy', type = {'unit-spawner', 'turret'}, position = q, radius = 60} end
  return o end)()"""


def brow(b):
    return "{'%s', %s, %s, '%s'}" % b[:4]


def check(ai, job):
    r = ai.lua(CANPLACE % ", ".join(brow(b) for b in JOBS[job]))
    return list(r.values()) if isinstance(r, dict) else list(r or [])


def set_recipes(ai):
    return ai.lua(SETREC % ", ".join("{%s, %s, '%s'}" % (p[0], p[1], n) for p, n in RECIPES))


def outpost(ai, job, crew_n):
    import outpostcrew23 as crew
    rt = ai.lua(ROUTE)
    rt = list(rt.values()) if isinstance(rt, dict) else list(rt)
    if max(rt) > 2:  # 도망이 먼저 - 경로 (사슬 로보포트 · 전초) 반경 50 유닛 3 이상 · 구조물이면 안 나간다
        log("%s 출정 보류: 경로 적 %s (유닛 + 100x구조물)" % (job, rt))
        return False
    bad = check(ai, job)
    if bad:
        log("%s 놓을 수 없는 칸 %d: %s" % (job, len(bad), bad[:6]))
    builds = [b for b in JOBS[job]]

    def inserts_for(ch):
        return [("piercing-rounds-magazine", b[1], b[2], AMMO) for b in ch if b[0] == "gun-turret"]
    log("%s 출정: 짓기 %d · 경로 적 %s" % (job, len(builds), rt))
    ok = crew.run_job(ai, builds, inserts_for, ENTRY, OWNER, log, crew_n=crew_n, rounds=4, wait_max=900,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s 끝 %s · 레시피 %s" % (job, ok, set_recipes(ai)))
    return ok


def pt(p):
    return "{%s, %s}" % (p[0], p[1]) if p else "nil"


def relay_once(ai):
    return ai.lua(RELAY % (ST_IN + ST_EMPTY + ST_FULL + (pt(OP_FULL), pt(OP_EMPTY), ", ".join(pt(p) for p in OP_PROD)) + CONC_IN + CONC_OUT))


def relay(ai, every):
    log("relay 시작 (%ss)" % every)
    last = 0
    while True:
        try:
            r = relay_once(ai)
            moved = {k: r.get(k) for k in ("sulfur", "iron", "full", "empty", "netbarrel", "concrete") if r.get(k)}
            if r.get("prod"):
                moved["prod"] = r["prod"]
            if moved or time.time() - last > 600:
                log("중계 %s · 역 입력 %s · 전초 찬 통 %s · 역 빈 통 %s · 망 U235/238 %s" % (
                    moved, r.get("st_in"), r.get("op_full"), r.get("st_empty"), r.get("net")))
                last = time.time()
        except Exception as e:  # noqa: BLE001
            log(f"중계 오류 {type(e).__name__}: {e}"[:300])
        time.sleep(every)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["station", "craft", "relay", "status", "check", "outpost"])
    ap.add_argument("what", nargs="?")
    ap.add_argument("n", nargs="?", type=int, default=1)
    ap.add_argument("--who")
    ap.add_argument("--every", type=float, default=20)
    ap.add_argument("--gather", type=float, default=0, help="craft: 재료를 이 분 동안 모은다")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "station":
        station(ai)
    elif a.cmd == "craft":
        craft(ai, a.what, a.n, a.who, a.gather)
    elif a.cmd == "relay":
        relay(ai, a.every)
    elif a.cmd == "check":
        for j in JOBS:
            print(j, len(JOBS[j]), check(ai, j))
        print("경로", ai.lua(ROUTE), "레시피", set_recipes(ai))
    elif a.cmd == "outpost":
        outpost(ai, a.what, a.n)
    elif a.cmd == "status":
        print(json.dumps(relay_once(ai), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""외부 채굴 Phase 2 - 남쪽 돌 (-144,341) (docs/outpost-mining-plan-run23.md §3 · §6 S · 결정 2).

결정 2 (조정자): 벽돌 화로 = 강철로 3 + Lua 연료 중계 (전기로 · 고급 회로 경합 피함).
실측 변경 (18:3x): 계획 경로 x=-140.5 는 새 둥지 (산란기 (-146,211) · (-155,223), 벌레 10 - 큰 벌레 4) 를 5 칸 옆으로 지난다
    -> 본선을 동쪽 x=-92.5 로 옮김 (산란기 53, 벌레 사거리 38 밖 56+). 전봇대는 x=-93.5.

  site  채굴기 10: E 향 (-145.5,y) · W 향 (-141.5,y), y = 333.5..345.5 (5 줄), 모음 C x=-143.5 북향 (345.5 -> 324.5)
        강철로 3 (-141, 330/328/326): 입력 팔 x=-142.5 (C 에서) · 출력 팔 x=-139.5 -> 벽돌 벨트 B x=-138.5 북향
        C 는 (-143.5..-141.5, 323.5) 동향으로 본선 머리 M (-140.5,323.5) 서쪽 옆치기 -> 생돌 = 서 레인
        B 는 (-138.5..-139.5, 323.5) 서향으로 M 동쪽 옆치기 -> 벽돌 = 동 레인 (레인 분리, 섞지 않음)
  belt  M x=-140.5 북향 -> y=318.5 동향 -> x=-92.5 북향 (318.5 -> 64.5) -> y=63.5 동향 -> (-66.5) S 굽이 -> y=64.5
        -> (-64.5,64.5) 북향 -> 지하 (-64.5,63.5)->(61.5) [F1 석탄 y=62.5 밑] -> 60.5 · 59.5 -> 지하 입구 (-64.5,58.5)
  inner (로봇 유령, 벽 안) 지하 출구 (-64.5,53.5) -> 52.5..47.5 북향 끝 -> 팔 4 (필터: 서쪽 생돌 · 동쪽 벽돌) -> 저장 상자 4 (필터 같게)
        상자가 차면 그 레인만 선다 (레인은 따로 움직임) = 자연 역압. Lua 중계 0.
  sdef  둘레 레이저 8 · 기관총 6 (광석 밖) + 현장 전봇대 - 채굴기보다 먼저
  line  전봇대 x=-93.5 (67.5..319.5, F1 전봇대 (-95.5,61.5) 에서) + y=319.5 서쪽 줄

    python -u scripts/stonep2_23.py check sdef|line|site|belt|inner
    python -u scripts/stonep2_23.py craft                       # 강철로 3 · 저장 상자 4 · 채굴기 2 · 벨트 손 제작 -> 망
    python -u scripts/stonep2_23.py build sdef|line|site|belt
    python -u scripts/stonep2_23.py ghost inner
    python -u scripts/stonep2_23.py config                      # 끝 팔 · 저장 상자 필터
    python -u scripts/stonep2_23.py run                         # 상주: 강철로 연료 (망 석탄) · 필터 · 기록
    python -u scripts/stonep2_23.py decon                       # 기지 돌 채굴기 · 벽돌 화로 해체 표시 (로봇)
    python -u scripts/stonep2_23.py status
로그 state/stonep2_23.log
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import coalp1_23 as cp  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "stonep2_23.log")
OWNER = "stonep2_23"
AMMO = "piercing-rounds-magazine"


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cp.log = log
cp.cl.log = log
cp.cl.SIZE.update({"steel-furnace": 0.95, "inserter": 0.45, "storage-chest": 0.45})

P = "small-electric-pole"
DRILL_ROWS = (333.5, 336.5, 339.5, 342.5, 345.5)
FURN = [(-141, 330), (-141, 328), (-141, 326)]
END_STONE = [(-66.5, 48.5), (-66.5, 47.5)]     # 서쪽 상자 = 생돌
END_BRICK = [(-62.5, 48.5), (-62.5, 47.5)]     # 동쪽 상자 = 벽돌
INS_STONE = [(-65.5, 48.5), (-65.5, 47.5)]
INS_BRICK = [(-63.5, 48.5), (-63.5, 47.5)]


def sdef():
    b = []
    for p in [(-147.5, 330.5), (-147.5, 335.5), (-147.5, 341.5), (-147.5, 346.5),
              (-139.5, 335.5), (-139.5, 341.5), (-139.5, 346.5),
              (-152.5, 326.5), (-156.5, 329.5), (-156.5, 336.5), (-156.5, 343.5), (-156.5, 350.5),
              (-156.5, 355.5), (-149.5, 355.5), (-142.5, 355.5), (-136.5, 355.5),
              (-132.5, 355.5), (-132.5, 349.5), (-132.5, 342.5), (-132.5, 335.5), (-132.5, 328.5)]:
        b.append((P, p[0], p[1], "north"))
    for x, y in [(-159, 331), (-159, 343), (-152, 357), (-136, 357), (-130, 333), (-130, 349), (-153, 324), (-133, 322)]:
        b.append(("laser-turret", x, y, "north"))
    for x, y in [(-159, 337), (-159, 349), (-144, 357), (-130, 341), (-147, 322), (-160, 325)]:
        b.append(("gun-turret", x, y, "north"))
    return b


def line():
    b = [(P, -93.5, 67.5 + 7 * k, "north") for k in range(37)]          # 67.5 .. 319.5
    b += [(P, x, 319.5, "north") for x in (-100.5, -107.5, -114.5, -121.5, -128.5, -135.5, -139.5)]
    b += [(P, -139.5, 325.5, "north"), (P, -139.5, 329.5, "north"), (P, -142.5, 329.5, "north"), (P, -142.5, 325.5, "north")]
    return b


def site():
    b = []
    for y in DRILL_ROWS:
        b.append(("electric-mining-drill", -145.5, y, "east"))
        b.append(("electric-mining-drill", -141.5, y, "west"))
    for fx, fy in FURN:
        b.append(("steel-furnace", fx, fy, "north"))
        b.append(("inserter", -142.5, fy + 0.5, "west"))     # C (서) 에서 집어 화로로
        b.append(("inserter", -139.5, fy + 0.5, "west"))     # 화로 (서) 에서 집어 B 로
    y = 345.5
    while y >= 324.5:
        b.append(("transport-belt", -143.5, y, "north"))
        y -= 1
    b += [("transport-belt", -143.5, 323.5, "east"), ("transport-belt", -142.5, 323.5, "east"),
          ("transport-belt", -141.5, 323.5, "east")]
    y = 330.5
    while y >= 324.5:
        b.append(("transport-belt", -138.5, y, "north"))
        y -= 1
    b += [("transport-belt", -138.5, 323.5, "west"), ("transport-belt", -139.5, 323.5, "west")]
    for y in (323.5, 322.5, 321.5, 320.5, 319.5):
        b.append(("transport-belt", -140.5, y, "north"))
    return b


def belt():
    b = []
    x = -140.5
    while x <= -93.5:
        b.append(("transport-belt", x, 318.5, "east"))
        x += 1
    y = 318.5
    while y >= 64.5:
        b.append(("transport-belt", -92.5, y, "north"))
        y -= 1
    x = -92.5
    while x <= -67.5:
        b.append(("transport-belt", x, 63.5, "east"))
        x += 1
    b += [("transport-belt", -66.5, 63.5, "south"), ("transport-belt", -66.5, 64.5, "east"),
          ("transport-belt", -65.5, 64.5, "east"), ("transport-belt", -64.5, 64.5, "north"),
          ("underground-belt", -64.5, 63.5, "north", "input"), ("underground-belt", -64.5, 61.5, "north", "output"),
          ("transport-belt", -64.5, 60.5, "north"), ("transport-belt", -64.5, 59.5, "north"),
          ("underground-belt", -64.5, 58.5, "north", "input")]
    return b


def inner():
    b = [("underground-belt", -64.5, 53.5, "north", "output")]
    for y in (52.5, 51.5, 50.5, 49.5, 48.5, 47.5):
        b.append(("transport-belt", -64.5, y, "north"))
    for p in INS_STONE:
        b.append(("inserter", p[0], p[1], "east"))           # 벨트 (동) 에서 집어 서쪽 상자로
    for p in INS_BRICK:
        b.append(("inserter", p[0], p[1], "west"))           # 벨트 (서) 에서 집어 동쪽 상자로
    for p in END_STONE + END_BRICK:
        b.append(("storage-chest", p[0], p[1], "north"))
    return b


PARTS = {"sdef": sdef, "line": line, "site": site, "belt": belt, "inner": inner}
cp.PARTS.update(PARTS)
ENTRY = {"sdef": (-128.5, 318.5), "line": (-93.5, 190.5), "site": (-128.5, 318.5), "belt": (-92.5, 190.5)}


def links():
    """전봇대 사슬 끊김 검사 (7.5 이하)."""
    poles = [(x, y) for n, x, y, *_ in sdef() + line() if n == P] + [(-95.5, 61.5)]
    seen = {poles[-1]}
    todo = [poles[-1]]
    while todo:
        a = todo.pop()
        for q in poles:
            if q not in seen and math.hypot(a[0] - q[0], a[1] - q[1]) <= 7.5:
                seen.add(q)
                todo.append(q)
    return [q for q in poles if q not in seen]


# ---------------------------------------------------------------- 손 제작
CRAFTS = [  # (recipe, count, 가방에 넣을 재료)
    ("steel-furnace", 3, {"steel-plate": 18, "stone-brick": 30}),
    ("storage-chest", 4, {"steel-plate": 32, "plastic-bar": 8, "electronic-circuit": 20, "copper-plate": 20, "iron-plate": 20}),
    ("electric-mining-drill", 2, {"iron-plate": 46, "copper-plate": 10}),
    ("transport-belt", 200, {"iron-plate": 300}),
]


def craft(ai, who=None):
    import orders
    import outpostcrew23 as crew
    import detached
    if who is None:
        free = crew.free_crew(ai, 8)
        pick = [w for w in ("golf", "hotel", "foxtrot", "echo", "delta") if w in free]
        if not pick:
            log("제작: 쉬는 사람 없음")
            return False
        who = pick[0]
    detached.mark([who], OWNER, minutes=20)
    need = {}
    for _, _, m in CRAFTS:
        for k, v in m.items():
            need[k] = need.get(k, 0) + v
    bag = crew.load_bag(ai, who, need)
    log("%s 재료 가방 %s" % (who, bag))
    steps = [("craft", {"recipe": r, "count": (n if r != "transport-belt" else n // 2), "wait": True}) for r, n, _ in CRAFTS]
    orders.submit(ai, who, steps, strict=False)
    t0 = time.time()
    while time.time() - t0 < 900:
        time.sleep(10)
        if not crew.busy(ai, [who]):
            break
    names = [r for r, _, _ in CRAFTS] + ["steel-plate", "stone-brick", "plastic-bar", "electronic-circuit", "advanced-circuit",
                                          "steel-chest", "copper-plate", "iron-plate", "iron-gear-wheel", "copper-cable"]
    r = cp.bag_to_net(ai, who, names)
    detached.release([who])
    log("제작 뒤 가방 -> 망 %s" % r)
    return True


# ---------------------------------------------------------------- 캐릭터 건설
TEAM = ("foxtrot", "hotel", "delta", "echo", "golf")


def build(ai, part):
    import outpostcrew23 as crew
    import detached
    b = PARTS[part]()

    def inserts_for(ch):
        return [(AMMO, x, y, 50) for n, x, y, *_ in ch if n == "gun-turret"]
    nb = {"sdef": 3, "line": 3, "site": 3, "belt": 5}[part]
    orig = crew.CREW
    crew.CREW = list(TEAM)
    try:
        ok = crew.run_job(ai, b, inserts_for, ENTRY[part], OWNER, log, crew_n=nb, rounds=8,
                          pre_for=lambda ch: cp.clears(ai, ch))
    finally:
        crew.CREW = orig
    go_home(ai)
    log("%s 캐릭터 건설 %s" % (part, "완료" if ok else "미완"))
    return ok


def go_home(ai):
    """일 끝난 팀: 가방 남은 건설품 -> 망, 집 (방어선 안) 에서 멀면 집으로."""
    import orders
    import outpostcrew23 as crew
    import detached
    live = {c["name"]: c for c in ai.list()}
    for w in TEAM:
        c = live.get(w)
        if not c or not c.get("alive") or crew.busy(ai, [w]):
            continue
        if detached.owner(w) not in (None, OWNER):
            continue
        try:
            r = cp.bag_to_net(ai, w, ["electric-mining-drill", "steel-furnace", "inserter", P, "transport-belt", "underground-belt",
                                      "laser-turret", "gun-turret", AMMO, "storage-chest", "stone", "wood", "coal"])
            if r and not r.get("dead"):
                log("%s 가방 -> 망 %s" % (w, r))
        except Exception:  # noqa: BLE001
            pass
        if math.hypot(c["x"] - crew.HOME[0], c["y"] - crew.HOME[1]) > 6:
            detached.mark([w], OWNER, minutes=10)
            orders.submit(ai, w, [("walk_to", {"x": crew.HOME[0], "y": crew.HOME[1]})], strict=False)
            log("%s (%.0f,%.0f) -> 집" % (w, c["x"], c["y"]))
            detached.release([w])


# ---------------------------------------------------------------- 끝 필터 (팔 · 저장 상자)
CONFIG = """(function() local s = game.surfaces[1] local o = {ins = 0, chest = 0, miss = 0}
  local function ins(p, item) local i = s.find_entities_filtered{name = 'inserter', position = p, radius = 0.3}[1]
    if not i then o.miss = o.miss + 1 return end
    i.use_filters = true i.inserter_filter_mode = 'whitelist'
    local f = i.get_filter(1) local n = f and f.name if n and type(n) ~= 'string' then n = n.name end
    if n ~= item then i.set_filter(1, item) o.ins = o.ins + 1 end end
  local function ch(p, item) local c = s.find_entities_filtered{name = 'storage-chest', position = p, radius = 0.3}[1]
    if not c then o.miss = o.miss + 1 return end
    local f = c.storage_filter local n = f and f.name if n and type(n) ~= 'string' then n = n.name end
    if n ~= item then c.storage_filter = item o.chest = o.chest + 1 end end
  for _, p in pairs({%s}) do ins(p, 'stone') end
  for _, p in pairs({%s}) do ins(p, 'stone-brick') end
  for _, p in pairs({%s}) do ch(p, 'stone') end
  for _, p in pairs({%s}) do ch(p, 'stone-brick') end
  return o end)()"""


def pts(ps):
    return ", ".join("{%s, %s}" % tuple(p) for p in ps)


def config(ai):
    r = ai.lua(CONFIG % (pts(INS_STONE), pts(INS_BRICK), pts(END_STONE), pts(END_BRICK)))
    return r


# ---------------------------------------------------------------- 강철로 연료 (망 석탄 -> 연료칸, 옮김)
FUEL_LOW, FUEL_FILL, NET_KEEP = 5, 12, 400
FUEL = """(function() local s = game.surfaces[1] local o = {put = 0, short = 0}
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  for _, p in pairs({%s}) do
    local f = s.find_entities_filtered{name = 'steel-furnace', position = p, radius = 0.6}[1]
    if f then local fu = f.get_inventory(defines.inventory.fuel) local have = fu.get_item_count('coal')
      if have <= %d then local want = %d - have
        if net.get_item_count('coal') > %d + want then local got = net.remove_item{name = 'coal', count = want}
          if got > 0 then local put = fu.insert{name = 'coal', count = got}
            if put < got then net.insert({name = 'coal', count = got - put}, 'storage') end o.put = o.put + put end
        else o.short = o.short + 1 end end end end
  o.net = net.get_item_count('coal') return o end)()"""


def fuel(ai):
    return ai.lua(FUEL % (pts(FURN), FUEL_LOW, FUEL_FILL, NET_KEEP))


# ---------------------------------------------------------------- 상태
STATUS = """(function() local s = game.surfaces[1] local o = {drills = {}, furn = {}}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-148, 331}, {-139, 348}}}) do
    local k = st[d.status] or d.status o.drills[k] = (o.drills[k] or 0) + 1 end
  for _, p in pairs({%s}) do local f = s.find_entities_filtered{name = 'steel-furnace', position = p, radius = 0.6}[1]
    if f then o.furn[#o.furn + 1] = (st[f.status] or '?') .. ' src' .. f.get_inventory(defines.inventory.furnace_source).get_item_count()
      .. ' out' .. f.get_output_inventory().get_item_count() .. ' fuel' .. f.get_inventory(defines.inventory.fuel).get_item_count() end end
  local function lanes(a) local r = {0, 0, 0, 0} for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = a}) do
    for li = 1, 2 do local L = b.get_transport_line(li) r[li] = r[li] + L.get_item_count('stone') r[li + 2] = r[li + 2] + L.get_item_count('stone-brick') end end
    return r end
  o.belt_col = lanes({{-93, 64}, {-92, 319}})         -- {레인1 돌, 레인2 돌, 레인1 벽돌, 레인2 벽돌}
  o.belt_end = lanes({{-65, 47}, {-64, 65}})
  local c = {} for _, p in pairs({%s}) do local e = s.find_entities_filtered{name = 'storage-chest', position = p, radius = 0.3}[1]
    local f = e and e.storage_filter local n = f and f.name if n and type(n) ~= 'string' then n = n.name end
    if e then c[#c + 1] = (n or '-') .. ':' .. e.get_item_count('stone') .. '/' .. e.get_item_count('stone-brick') end end
  o.chests = c
  local net = s.find_logistic_network_by_position({-24, -88}, 'player')
  o.net = {brick = net.get_item_count('stone-brick'), stone = net.get_item_count('stone'), coal = net.get_item_count('coal')}
  local free = 0 for _, e in pairs(net.storages) do free = free + e.get_inventory(defines.inventory.chest).count_empty_stacks() end o.free = free
  local ps = game.forces.player.get_item_production_statistics(s) local P = defines.flow_precision_index.ten_minutes
  for _, n in pairs({'stone', 'stone-brick', 'automation-science-pack', 'military-science-pack', 'stone-wall'}) do
    o[n] = {math.floor(ps.get_flow_count{name = n, category = 'input', precision_index = P, count = true}),
            math.floor(ps.get_flow_count{name = n, category = 'output', precision_index = P, count = true})} end
  o.enemy60 = s.count_entities_filtered{force = 'enemy', position = {-144, 341}, radius = 60}
  local t = {} for _, e in pairs(s.find_entities_filtered{force = 'player', type = {'ammo-turret', 'electric-turret'}, area = {{-162, 319}, {-127, 360}}}) do
    t[#t + 1] = math.floor(e.health) end o.tur = #t
  return o end)()"""


def status(ai):
    return ai.lua(STATUS % (pts(FURN), pts(END_STONE + END_BRICK)))


# ---------------------------------------------------------------- 기지 돌 채굴기 · 벽돌 화로 해체 (로봇)
DECON = """(function() local s = game.surfaces[1] local o = {drill = 0, furn = 0, ins = 0, keep = {}}
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-66, -108}, {-45, -90}}}) do
    local m = d.mining_target if m and m.name == 'stone' and not d.to_be_deconstructed() then d.order_deconstruction('player') o.drill = o.drill + 1 end end
  for _, p in pairs({%s}) do
    local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.6}[1]
    if f then local r = f.get_recipe and f.get_recipe() or f.previous_recipe
      o.keep[#o.keep + 1] = f.name .. '@' .. p[1] .. ' out' .. f.get_output_inventory().get_item_count()
      if not f.to_be_deconstructed() then f.order_deconstruction('player') o.furn = o.furn + 1 end end end
  return o end)()"""


def decon(ai):
    import brickrelay23 as br
    r = ai.lua(DECON % pts(br.FURN))
    log("기지 돌 채굴기 · 벽돌 화로 해체 표시 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "craft", "build", "ghost", "config", "run", "decon", "status", "links"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--who")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        cp.check(ai, a.arg)
    elif a.cmd == "links":
        log("전봇대 끊긴 것 %s" % links())
    elif a.cmd == "craft":
        craft(ai, a.who)
    elif a.cmd == "build":
        build(ai, a.arg)
    elif a.cmd == "ghost":
        cp.ghost(ai, a.arg)
    elif a.cmd == "config":
        log("필터 %s" % config(ai))
    elif a.cmd == "decon":
        decon(ai)
    elif a.cmd == "status":
        log("상태 %s" % status(ai))
    else:
        log("stonep2_23 상주 시작 (강철로 연료 %d 이하 -> %d, 망 석탄 %d 남김)" % (FUEL_LOW, FUEL_FILL, NET_KEEP))
        n = 0
        while True:
            try:
                f = fuel(ai)
                c = config(ai) if n % 5 == 0 else {}
                if n % 5 == 0 or f.get("short"):
                    log("연료 %s · 필터 %s · 상태 %s" % (f, c, status(ai)))
            except Exception as e:  # noqa: BLE001
                log(f"오류 {type(e).__name__}: {e}"[:300])
            n += 1
            time.sleep(60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

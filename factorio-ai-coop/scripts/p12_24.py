"""P12 for run 24: 보라 · 노랑 세 배 - 회로 블록 (zone N) + P7 병목 풀기.

사용자 규칙 (2026-09-30) 그대로:
  (1) Lua relay 금지 - 벨트 · 팔 · 로봇 (건설 로봇 proxy 는 꼭 필요한 곳만) · 사람 손. 이 파일에 inv.remove → insert 없음.
  (2) 놓을 수 없는 자리에 짓기 금지 - 유령은 can_place_entity{manual} 통과한 칸만 (p7_24.GHOST 재사용), 같은 건물이 선 칸엔 유령 없음.
  (3) 레시피를 바꾸기 전에 결과칸 비었는지 조회. 해체는 search_radius 0.3 (여기서는 order_deconstruction 을 위치 0.3 으로 찾은 것에만).

06:56 실측 (10분): 보라 48 · 노랑 57 · 고급회로 183 (씀 317) · 녹색 1,512 · 강철 433 (씀 675) · 플라스틱 1,106.
  보라 = M (생산 모듈) · EF 가 고급회로에 묶임 (M 15 · EF 17 / 10분 → 보라 ≤ 51).  노랑 = LDS 2 대 상한 60 · PU 39 (녹색 · 고급).
  강철 결과 상자 (75.5,-15.5) 가 벽돌 4,000 으로 차서 강철로 3 대 full_output (07:0x echo 가 벽돌 2,500 을 저장 상자로 - 손).

셈 (10분 180 = 팩 0.3/s, 레시피 게임 조회):
  보라 0.3/s = P 0.1 craft/s (21 s → 속도 2.1) · M 0.1/s (15 s → 1.5) · EF 0.1/s (5 s → 0.5) · 레일 3/s (1.5 craft/s → 0.75) · 강철 2.5/s · 고급 1.0/s
  노랑 0.3/s = Y 0.1 craft/s (2.1) · PU 0.2/s (10 s → 2.0) · LDS 0.3/s (15 s → 4.5) · 틀 0.1/s · 녹색 PU 4/s · 고급 0.4/s · 구리 LDS 6/s
  → 고급회로 1.4/s (지금 ~0.3) · 녹색 +5/s · 강철 ~3/s (지금 0.72) · 구리 +10/s. 판 · 강철이 3 배의 벽 - 이 단계는 고급 · 녹색부터.

zone N (x 24..59, y -25..-2, 허브 서쪽 빈 땅 - free.py 로 칸마다 잼):
  구리  P10 줄기 (x 23.5 빠른, 가득 서 있음) → 빠른 분배기 (24,-25.5) → CU y -24.5 동 (두 레인 구리)
                                           → 빠른 분배기 (24,-13.5) → CU2 y -12.5 동 (A 줄 전선 C_A 몫)
  철    본 줄기 (x 69.5 빠른, 허브가 차서 서 있음) → 빠른 분배기 (69,-29.5) → y -28.5 서 → x 59.5 남 → FE y -25.5 서 (두 레인 철)
  G 줄 (y -21.5): [C G C] × 3 (C = 전선 조립기 2, G = 녹색 조립기 2) - C 는 CU 에서 빠른 팔, G 는 FE 에서 긴팔 (CU 를 넘어), C → G 직결 (빠른 팔)
  GP    y -18.5 서 (녹색 | 플라스틱): G → 빠른 팔 → 먼 레인 (남) = 녹색. 플라스틱 상자 (51.5,-16.5) → 팔 → 먼 레인 (북) (delta blhaul 이 채움)
  A 줄 (y -15.5): A C_A A C_A A C_A A (A = 고급 조립기 2, C_A = 전선 조립기 1) - GP → 팔 → A (녹색 · 플라스틱), C_A → A 직결, CU2 → 팔 → C_A
  ADV   y -11.5 서: A → 긴팔 (CU2 를 넘어) → 끝 → 팔 → 수동 공급 상자 (25.5,-9.5) = 망 (robofeed 가 M · EF · PU 에)
  녹색 내보내기: GP → 필터 빠른 팔 (녹색) → 수동 공급 상자 (52.5,-16.5, 칸 제한) = 망 (robofeed 가 PU 에)
  셈: G 3 × 1.5 = 녹색 4.5/s (구리 C 6 × 1.5 = 9/s ≤ CU 15) · A 4 × 0.125 = 고급 0.5/s (녹 1 · 플라 1 · 전선 2) · 철 4.5/s ≤ FE 15.
      팔: C ← CU 1.5/s (빠른 ~4.3) · G ← FE 1.5/s (긴팔 손 2 ~2.3) · C → G 2.25/s × 2 (빠른 asm→asm ~4.6) · G → GP 1.5/s (빠른) · GP → A 0.5/s (팔 ~1.7).
  넘어가는 몫: 분배기 기본 50:50 - 뒤 (bl · 허브) 도 먹는다. P10 은 12/s 설계 (지금 가득 서 있음).

P7 병목 (p7up): EF · 레일 조립기 1 → 2 (로봇 교체), R → P 긴팔 둘 더 (레일 3/s > 긴팔 하나 2.5), cR · cL · cL2 → 조립기 팔을 빠른 팔로 (돌+강철 3/s · 구리 3/s).

    python scripts/p12_24.py --run run24 --check [--group zn|p7up]
    python scripts/p12_24.py --run run24 --kit echo[,delta] [--group zn]
    python scripts/p12_24.py --run run24 --room          # 줄기 두 칸 해체 표시 (분배기 자리)
    python scripts/p12_24.py --run run24 --ghosts all [--group zn]
    python scripts/p12_24.py --run run24 --recipes --filters
    python scripts/p12_24.py --run run24 --upgrade       # P7 조립기 · 팔 교체 표시
    python scripts/p12_24.py --run run24 --status
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401
import p7_24                             # noqa: E402
from client import AIBridge              # noqa: E402

N, E, S, W = 0, 4, 8, 12
ASM1, ASM2 = "assembling-machine-1", "assembling-machine-2"
INS, FAST, LONG = "inserter", "fast-inserter", "long-handed-inserter"
BELT, FSPLIT = "transport-belt", "fast-splitter"
CHEST, PPC = "iron-chest", "passive-provider-chest"

p7_24.SIZE.update({FSPLIT: 1})
p7_24.POWERED.update({FAST})
p7_24.COST.update({FAST: {"iron-plate": 9, "copper-plate": 4.5}, FSPLIT: {"iron-plate": 45.5, "copper-plate": 22.5},
                   PPC: {"iron-plate": 16, "copper-plate": 7, "plastic-bar": 2, "steel-plate": 8}})

ZN, P7UP, SPLIT = [], [], []
GROUPS = {"zn": ZN, "p7up": P7UP, "split": SPLIT}
_CUR = [ZN]


def add(stage, name, x, y, d=N, extra=None):
    _CUR[0].append((stage, name, float(x), float(y), d, extra))


# --- 철: 본 줄기 분배기 (69,-29.5) 왼쪽 출구 (68.5,-28.5) → 서 → x 59.5 남 → FE y -25.5 서 ------------------------------
for _x in range(60, 69):
    add("iron", BELT, _x + 0.5, -28.5, W)
for _y in (-28.5, -27.5, -26.5):
    add("iron", BELT, 59.5, _y, S)
for _x in range(26, 60):
    add("iron", BELT, _x + 0.5, -25.5, W)            # FE, 끝 (26.5) - 서쪽 (25.5) 은 비워 분배기 옆으로 흘리지 않는다

# --- 구리: CU y -24.5 동 (분배기 (24,-25.5) 오른쪽 출구 (24.5,-24.5) 부터) ------------------------------------------------
for _x in range(24, 60):
    add("copper", BELT, _x + 0.5, -24.5, E)

# --- G 줄 (조립기 가운데 y -21.5) ------------------------------------------------------------------------------------
CELLS = [(25.5, 29.5, 33.5), (37.5, 41.5, 45.5), (50.5, 54.5, 58.5)]     # (C, G, C) - 셋째 칸의 틈 x 52 는 전봇대 (52.5,-22.5) 자리
for c1, g, c2 in CELLS:
    add("grow", ASM2, c1, -21.5, N, "copper-cable")
    add("grow", ASM2, g, -21.5, N, "electronic-circuit")
    add("grow", ASM2, c2, -21.5, N, "copper-cable")
    add("grow", FAST, c1 + 2, -21.5, W)              # C1 → G (서쪽에서 집는다)
    add("grow", FAST, c2 - 2, -21.5, E)              # C2 → G
    add("grow", FAST, c1, -23.5, N)                  # CU → C1
    add("grow", FAST, c2, -23.5, N)                  # CU → C2
    add("grow", LONG, g, -23.5, N)                   # FE (y -25.5) → G, CU 를 넘어
    add("grow", FAST, g, -19.5, N)                   # G → GP (먼 레인 = 남)

# --- GP y -18.5 서 (x 58.5 → 25.5) - 끝 (25.5) 서쪽은 P10 줄기라 비운다 --------------------------------------------------
for _x in range(25, 59):
    add("gp", BELT, _x + 0.5, -18.5, W)
add("gp", CHEST, 51.5, -16.5, N, "cP12")             # 플라스틱 상자 (사람 손 - blhaul delta)
add("gp", INS, 51.5, -17.5, S)                       # 상자 → GP (남쪽에서 넣으니 먼 레인 = 북)
# 녹색 내보내기 (망): 07:5x 처음엔 (52.5,-17.5) 빠른 필터 팔이었는데 G3 (54.5) 녹색을 다 가져가 A4 (49.5) 가 굶었다 (GP 는 서쪽으로 흐르고
#   A4 위쪽 G 는 G3 하나) → 거기 상자는 걷고 (팔은 필터째 둠, 상자가 없어 쉰다), A2~A4 를 다 지난 x 31.5 (A2 와 C_A1 사이 틈) 에서 보통 팔 (~1.4/s) 로 넘치는 몫만.
add("gp", PPC, 31.5, -16.5, N, "green_out")
add("gp", INS, 31.5, -17.5, N, "filter:electronic-circuit")

# --- A 줄 (조립기 가운데 y -15.5): A C_A A C_A A C_A A ---------------------------------------------------------------
AX = (25.5, 33.5, 41.5, 49.5)
CAX = (29.5, 37.5, 45.5)
for a in AX:
    add("arow", ASM2, a, -15.5, N, "advanced-circuit")
    add("arow", INS, a, -17.5, N)                    # GP → A (녹색 · 플라스틱)
    add("arow", LONG, a + 1, -13.5, N)               # A → ADV (y -11.5), CU2 를 넘어
for c in CAX:
    add("arow", ASM1, c, -15.5, N, "copper-cable")
    add("arow", INS, c - 2, -15.5, E)                # C_A → 서쪽 A
    add("arow", INS, c + 2, -15.5, W)                # C_A → 동쪽 A
    add("arow", INS, c, -13.5, S)                    # CU2 → C_A

# --- CU2 y -12.5 동 (분배기 (24,-13.5) 오른쪽 출구 (24.5,-12.5) 부터, C_A 마지막 45.5 까지) ------------------------------
for _x in range(24, 47):
    add("cu2", BELT, _x + 0.5, -12.5, E)

# --- ADV y -11.5 서 (x 50.5 → 25.5), 끝 → 팔 → 공급 상자 ------------------------------------------------------------------
for _x in range(25, 51):
    add("adv", BELT, _x + 0.5, -11.5, W)
add("adv", INS, 25.5, -10.5, N)
add("adv", PPC, 25.5, -9.5, N, "adv_out")

# 분배기 (줄기 칸을 해체한 뒤에만 놓인다 - --room 먼저)
SPLITS = [(FSPLIT, 69.0, -29.5, S, (69.5, -29.5)), (FSPLIT, 24.0, -25.5, S, (23.5, -25.5)), (FSPLIT, 24.0, -13.5, S, (23.5, -13.5))]
for n, x, y, d, _ in SPLITS:
    SPLIT.append(("split", n, x, y, d, None))

# --- P7 병목 (p7up) -------------------------------------------------------------------------------------------------
_CUR[0] = P7UP
add("p7up", LONG, 9.5, 14.5, E)                      # R (12.5,15.5) → P (7.5,15.5) 둘째 · 셋째 긴팔 (버스 x 10.5 를 넘어)
add("p7up", LONG, 9.5, 16.5, E)
_CUR[0] = ZN

UPGRADE_ASM = [(7.5, 19.5, ASM2), (12.5, 15.5, ASM2)]                        # EF · 레일 조립기 1 → 2
UPGRADE_INS = [(12.5, 13.5), (-2.5, 13.5), (1.5, 8.5)]                        # cR → R · cL → LDS · cL2 → LDS2 : 팔 → 빠른 팔


# 속도 모듈 (echo 손제작 → STORE) → 건설 로봇 proxy 로 모듈 칸에 (대상마다 ≤ 2 개). 조립기 2 는 칸 2 개 - 속도 1 × 2 = 0.75 → 1.05.
#   LDS 둘 (노랑 상한 60 → 84) · PU (45 → 63) · Y (64 → 90) · M (30 → 42 = 보라 126). P 는 이미 둘.
MODULES = [(-2.5, 15.5), (1.5, 10.5), (1.5, 20.5), (1.5, 16.5), (7.5, 11.5), (-4.5, 7.5)]   # + LDS3


def modules(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {req = 0, full = 0, busy = 0, short = 0}
      local net = s.find_logistic_network_by_position({11.5, -9.5}, f)
      local have = net and net.get_item_count('speed-module') or 0
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'assembling-machine', force = f, position = q, radius = 0.3}[1]
        local m = e and e.get_module_inventory()
        if m then
          local free = 0
          for i = 1, #m do if not m[i].valid_for_read then free = free + 1 end end
          if free == 0 then out.full = out.full + 1
          elseif s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} > 0 then out.busy = out.busy + 1
          elseif have < free then out.short = out.short + 1
          else
            local slots = {}
            for i = 1, #m do if not m[i].valid_for_read then slots[#slots + 1] = {inventory = defines.inventory.assembling_machine_modules, stack = i - 1, count = 1} end end
            s.create_entity{name = 'item-request-proxy', position = e.position, force = f, target = e,
              modules = {{id = {name = 'speed-module'}, items = {in_inventory = slots}}}}
            have = have - free
            out.req = out.req + free
          end
        end
      end
      return out
    end)()""" % json.dumps(MODULES))


def room(ai) -> dict:
    """분배기 자리의 줄기 칸 해체 표시 (그 칸 하나만: 위치 반경 0.3 으로 찾은 벨트)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {ordered = 0, gone = 0, split = 0}
      for _, q in pairs(helpers.json_to_table('%s')) do
        if s.count_entities_filtered{name = q[1], position = {q[2], q[3]}, radius = 0.3} > 0
           or s.count_entities_filtered{ghost_name = q[1], position = {q[2], q[3]}, radius = 0.3} > 0 then out.split = out.split + 1
        else
          local b = s.find_entities_filtered{type = 'transport-belt', force = f, position = q[4], radius = 0.3}[1]
          if b then if not b.to_be_deconstructed() then b.order_deconstruction(f) end; out.ordered = out.ordered + 1 else out.gone = out.gone + 1 end
        end
      end
      return out
    end)()""" % json.dumps([[n, x, y, list(p)] for n, x, y, d, p in SPLITS]))


def recipes(ai) -> dict:
    rows = [[n, x, y, ex] for plan in GROUPS.values() for st, n, x, y, d, ex in plan if n in (ASM1, ASM2) and ex]
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {set = 0, ok = 0, missing = 0, busy = {}}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'assembling-machine', force = f, position = {q[2], q[3]}, radius = 0.3}[1]
        if not e then out.missing = out.missing + 1
        else
          local r = e.get_recipe()
          if r and r.name == q[4] then out.ok = out.ok + 1
          elseif r and (e.get_output_inventory().get_item_count() > 0) then out.busy[#out.busy + 1] = q[4] .. '@' .. q[2]   -- 결과칸이 비지 않았으면 안 바꾼다
          else e.set_recipe(q[4]); out.set = out.set + 1 end
        end
      end
      return out
    end)()""" % json.dumps(rows))


def filters(ai) -> dict:
    """녹색 내보내기 팔 필터 · 공급 상자 칸 제한 (필터는 더하기만 - 있는 필터는 지우지 않는다)."""
    rows = [[x, y, ex.split(":", 1)[1]] for st, n, x, y, d, ex in ZN if n in (FAST, INS) and ex and ex.startswith("filter:")]
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {filter = 0, bar = 0}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'inserter', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if e and not e.get_filter(1) then e.use_filters = true; e.inserter_filter_mode = 'whitelist'; e.set_filter(1, q[3]); out.filter = out.filter + 1 end
      end
      local g = s.find_entities_filtered{name = 'passive-provider-chest', force = f, position = {31.5, -16.5}, radius = 0.3}[1]
      if g then g.get_inventory(defines.inventory.chest).set_bar(6); out.bar = out.bar + 1 end     -- 녹색 1,000 까지만 (5 칸)
      return out
    end)()""" % json.dumps(rows))


def upgrade(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {asm = 0, ins = 0, done = 0}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'assembling-machine', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if e and e.name == q[3] then out.done = out.done + 1
        elseif e and not e.to_be_upgraded() then e.order_upgrade{force = f, target = q[3]}; out.asm = out.asm + 1 end
      end
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'inserter', force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if e and e.name == 'fast-inserter' then out.done = out.done + 1
        elseif e and e.name == 'inserter' and not e.to_be_upgraded() then e.order_upgrade{force = f, target = 'fast-inserter'}; out.ins = out.ins + 1 end
      end
      return out
    end)()""" % (json.dumps(UPGRADE_ASM), json.dumps(UPGRADE_INS)))


def status(ai) -> dict:
    rows = [[n, x, y] for plan in GROUPS.values() for st, n, x, y, d, ex in plan if n in (ASM1, ASM2)]
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'assembling-machine', force = f, position = {q[2], q[3]}, radius = 0.3}[1]
        local g = s.count_entities_filtered{ghost_name = q[1], force = f, position = {q[2], q[3]}, radius = 0.3}
        out[#out + 1] = string.format('%%s (%%.1f,%%.1f) %%s %%s', e and e.get_recipe() and e.get_recipe().name or '-', q[2], q[3],
          e and (st[e.status] or '?') or (g > 0 and 'ghost' or 'MISSING'), e and e.products_finished or 0)
      end
      local gh = 0
      for _, g in pairs(s.find_entities_filtered{type = 'entity-ghost', force = f, area = {{22, -32}, {72, -8}}}) do gh = gh + 1 end
      out.ghosts = gh
      for _, p in pairs({{25.5, -9.5}, {31.5, -16.5}, {51.5, -16.5}}) do
        local c = s.find_entities_filtered{type = {'container', 'logistic-container'}, force = f, position = p, radius = 0.3}[1]
        if c then local t = {}; for _, v in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do t[#t + 1] = v.name .. v.count end
          out['chest' .. p[1]] = table.concat(t, ',') end
      end
      return out
    end)()""" % json.dumps(rows))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--group", default="zn", choices=tuple(GROUPS))
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--need", action="store_true")
    ap.add_argument("--kit", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--room", action="store_true")
    ap.add_argument("--ghosts", default="")
    ap.add_argument("--recipes", action="store_true")
    ap.add_argument("--filters", action="store_true")
    ap.add_argument("--upgrade", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--modules", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    plan = GROUPS[a.group]
    if a.check:
        print(json.dumps(p7_24.check(ai, plan), ensure_ascii=False))
    if a.need:
        print(p7_24.need_items(ai, plan))
    if a.kit:
        print(p7_24.kit(ai, a.kit.split(","), set(a.only.split(",")) if a.only else None, plan))
    if a.room:
        print("room", room(ai))
    if a.ghosts:
        print("ghosts", p7_24.ghosts(ai, a.ghosts.split(","), plan))
    if a.recipes:
        print("recipes", recipes(ai))
    if a.filters:
        print("filters", filters(ai))
    if a.upgrade:
        print("upgrade", upgrade(ai))
    if a.modules:
        print("modules", modules(ai))
    if a.status:
        r = status(ai)
        for k, v in (r.items() if isinstance(r, dict) else enumerate(r)):
            print(k, v)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

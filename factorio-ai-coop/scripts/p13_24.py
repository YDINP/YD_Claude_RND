"""P13 for run 24: third iron block - more mining + 22 steel furnaces inside the east outpost ring (409,-171), plates onto the P8 trunk's spare lanes.

p8_24.py (동쪽 철 전초) 의 짓기 루프 · 키트 · 겹침 검사를 그대로 쓰고 (모듈 전역을 이 배치로 바꿔 끼운다), 배치 · 현황만 새로.

부지 고르기 (09:3x 조회, 걸어서 본 청크만 - survey --seen 반경 1400 의 철 광맥 다섯):
  주 광맥 (86,-60)      205k - 바닥
  북서 (-215,-347)      8.45M - 둥지가 광맥 위 (가장 가까운 4 칸, 반경 250 둥지 22 · 벌레 15 · 유닛 129)  → 버림 (벌레 둥지를 쳐야 함)
  서 (-677,-47) 5.96M · (-768,-74) 9.73M - 부지 250 안 적 0 이지만 기지 중심에서 750~840, 가는 길 (x -480..-150) 선분 80 안
      둥지 · 벌레 (-360,-120) (-320,40) (-400,-240) … → 출정 조건 (경로 80 적 0) 이 안 선다  → 버림
  동 (409,-171) 5.27M - 반경 150 적 0 · 250 안 둥지 3 · 벌레 1 · 유닛 12 (가장 가까운 둥지 194, 북동) - 치울 필요 없음.
      이미 벽 고리 201 · 포탑 16 · 전력 · 판 줄기 (빠른, 레인 7.5/15 씩 = 15/30 - 반이 빔) 가 있다.
      채굴 연구 mining_drill_productivity_bonus 0.2 → 채굴기 0.6/s: 지금 채굴기 31 = 18.6/s 에 강철로 24 가 15/s 만 먹는다 (3.6/s 남음).
  → 셋째 철 = 동쪽 광맥의 캐지 않은 남쪽 · 북쪽 줄 + 강철로 22 를 고리 안에 더한다. 새 줄기 · 새 벽 없이 줄기 남은 레인을 채운다.

셈 (belt-research §6-1, 채굴기 0.6/s · 강철로 0.625/s):
    새 채굴기: 남쪽 세 줄 (y -160.5 · -157.5 · -154.5) × 4 열 = 12 + 북쪽 한 줄 (y -188.5) × 4 = 4 → 16 × 0.6 = 9.6/s
    채굴 줄 405.5 (→ 입력 W): 옛 16 대 9.6 + 새 8 대 4.8 = 14.4 / 노랑 15 (레인 7.2 / 7.5)  - 빠듯하나 넘치면 채굴기가 기다릴 뿐
    채굴 줄 413.5 (→ 입력 E): 옛 15 대 9.0 + 새 8 대 4.8 = 13.8 / 15
    입력 W 광석 레인 (빠른 15): 14.4 → 강철로 옛 12 + 남쪽 연장 4 (x 404) + 서쪽 곁 7 (x 399) = 23 × 0.625 = 14.4 ✓
    입력 E 광석 레인: 13.8 → 옛 12 + 남쪽 연장 4 (x 409) + 동쪽 곁 7 (x 414) = 23 → 14.4 (0.6 모자라 꼬리 하나 쉼)
    판 줄기 P (빠른, 레인 15 둘): 동쪽 레인 = W 화로 16 × 0.625 10 + 동쪽 곁 판 벨트 옆싣기 4.4 = 14.4 / 15 ·
                                  서쪽 레인 = E 화로 16 → 10 + 서쪽 곁 판 벨트 옆싣기 4.4 = 14.4 / 15  → 28.8 / 30
      (P 는 줄기 끝까지 그대로 → x 69.5 기지 철 줄기 → zone N · rg 가지 · 강철 가지 · 허브)
    곁 판 벨트 (노랑): 7 × 0.625 = 4.4 / 15 ✓ · 팔 (기본 0.83/s): 화로 0.65 → 78% ✓
    석탄: 강철로 22 × 0.0225 = +0.5/s (합 1.0/s) - 입력 줄 석탄 레인 그대로, 석탄 상자 둘 (팔 0.83 ≥ 0.52) · fuelhaul 상자 상한 1,500
    전력: 채굴기 16 × 90 kW + 팔 44 × 13 kW ≈ 2.0 MW
    판 늘기 = 새 강철로 22 × 0.625 = 13.75/s + 옛 3.6/s 남던 광석 몫 (옛 화로는 이미 15 에 참) → 기대 +12~14/s (광석이 상한)

    python scripts/p13_24.py --run run24 --check mine,smelt
    python scripts/p13_24.py --run run24 --ore
    python scripts/p13_24.py --run run24 --build smelt --crew echo
    python scripts/p13_24.py --run run24 --status
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401
from client import AIBridge              # noqa: E402
import p8_24 as base                     # noqa: E402

N, E, S, W = 0, 4, 8, 12
EMD, SF, INS, BELT, FBELT = "electric-mining-drill", "steel-furnace", "inserter", "transport-belt", "fast-transport-belt"
POLE = "small-electric-pole"
OWNER = "p13"
SITE = (409.0, -150.0)
STATE = os.path.join(HERE, "..", "state", "run24_p13.json")

GROUPS = {"mine": [], "smelt": [], "def": [], "trunk": [], "power": []}
_CUR = ["mine"]


def add(name, x, y, d=N):
    GROUPS[_CUR[0]].append((name, float(x), float(y), d))


def col(name, x, y0, y1, d):
    step = 1 if y1 >= y0 else -1
    y = y0
    while (y - y1) * step <= 0:
        add(name, x, y, d)
        y += step


def row(name, y, x0, x1, d):
    step = 1 if x1 >= x0 else -1
    x = x0
    while (x - x1) * step <= 0:
        add(name, x, y, d)
        x += step


# --- mine: P8 채굴 줄 (405.5 · 413.5) 곁 열 (403.5 E · 407.5 W · 411.5 E · 415.5 W) 에 남쪽 세 줄 · 북쪽 한 줄 --------------------
_CUR[0] = "mine"
NEW_ROWS = [-160.5, -157.5, -154.5, -188.5]              # -161.5 는 전봇대 (404.5,-162.5) 에 막힘
for _y in NEW_ROWS:
    for _bx in (405.5, 413.5):
        add(EMD, _bx - 2, _y, E)
        add(EMD, _bx + 2, _y, W)
for _bx in (405.5, 413.5):
    col(BELT, _bx, -189.5, -187.5, S)             # 북쪽 줄: 채굴 줄 머리 (-186.5) 앞으로 세 칸
for _px in (401.5, 409.5, 417.5):
    add(POLE, _px, -188.5)
for _px in (401.5, 417.5):
    add(POLE, _px, -160.5)
    add(POLE, _px, -154.5)

# --- smelt -------------------------------------------------------------------------------------------------------------
#   남쪽 연장: 입력 W (401.5) · E (411.5) 를 -116.5 까지, 강철로 404 · 409 에 fy -123 .. -117 (P8 무늬 그대로)
#   서쪽 곁: 입력 W → 팔 400.5 (E: 동쪽에서 집음) → 강철로 399 → 팔 397.5 (E) → 판 벨트 x 396.5 남 → y -115.5 동 → P (406.5) 서쪽 옆싣기
#   동쪽 곁: 입력 E → 팔 412.5 (W) → 강철로 414 → 팔 415.5 (W) → 판 벨트 x 416.5 남 → y -115.5 서 → P 동쪽 옆싣기
#   곁 줄 fy -129 .. -117 (7): 위는 포탑 무리 (396,-136) · (417,-136) 가 y -133 까지, 전봇대 (413.5,-131.5).
_CUR[0] = "smelt"
EXT = [-123.0, -121.0, -119.0, -117.0]
SIDE = [-129.0 + 2 * k for k in range(7)]         # -129 .. -117
col(FBELT, 401.5, -123.5, -117.5, S)              # 입력 W 연장 (옛 끝 -124.5). -116.5 까지 깔면 끝이 판 줄 y -115.5 에 옆싣기 - 석탄 · 광석이 줄기로 샜다 (09:4x)
col(FBELT, 411.5, -123.5, -117.5, S)              # 입력 E 연장 (같은 까닭으로 -117.5 에서 끝)
for _k, _fy in enumerate(EXT):
    add(SF, 404.0, _fy)
    add(SF, 409.0, _fy)
    add(INS, 402.5, _fy - 0.5, W)
    add(INS, 405.5, _fy - 0.5, W)
    add(INS, 407.5, _fy - 0.5, E)
    add(INS, 410.5, _fy - 0.5, E)
    if _k % 2 == 0:
        for _px in (402.5, 405.5, 410.5):
            add(POLE, _px, _fy + 0.5)
for _fy in SIDE:
    add(SF, 399.0, _fy)
    add(INS, 400.5, _fy - 0.5, E)
    add(INS, 397.5, _fy - 0.5, E)
    add(SF, 414.0, _fy)
    add(INS, 412.5, _fy - 0.5, W)
    add(INS, 415.5, _fy - 0.5, W)
for _py in (-128.5, -124.5, -120.5, -116.5):
    add(POLE, 397.5, _py)
    add(POLE, 415.5, _py)
col(BELT, 396.5, -129.5, -116.5, S)               # 서쪽 곁 판 벨트 (머리 -129.5 - 포탑 무리 탄 벨트 끝 (396.5,-132.5) 과 두 칸 띄움)
row(BELT, -115.5, 396.5, 405.5, E)                #   → P (406.5,-115.5) 서쪽 옆싣기
col(BELT, 416.5, -129.5, -116.5, S)               # 동쪽 곁 판 벨트
row(BELT, -115.5, 416.5, 407.5, W)                #   → P 동쪽 옆싣기

base.GROUPS = GROUPS
base.OWNER = OWNER
base.SITE = SITE
base.STATE = STATE
base.HUB_BOX = (62, -16.1, 76, -14.9)
base.HUB_KEEP.update({"iron-plate": 600, "steel-plate": 100})   # 과학이 철에 굶는 중 - 허브 철을 다 쓰지 않는다
base.COST.update({FBELT: {"iron-plate": 4.5}, SF: {"steel-plate": 6, "stone-brick": 10}})
# 강철은 허브 (286, 100 남김) 로 모자라 zone N 강철 기둥 공급 상자 (55.5,-30.5) 도 본다 (2,300+, hauler 출처라 300 남김)
EXTRA_SRC = [(55.5, -30.5, "steel-plate", 300)]
_sources = base.sources


def _sources_more(ai, items):
    out = _sources(ai, items)
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, q in pairs(helpers.json_to_table('%s')) do
        local c = s.find_entities_filtered{type = {"container", "logistic-container"}, force = f, position = {q[1], q[2]}, radius = 0.3}[1]
        if c then out[#out+1] = q[3] .. "," .. c.get_inventory(defines.inventory.chest).get_item_count(q[3]) .. "," .. q[4] end
      end
      return out
    end)()""" % json.dumps([list(p) for p in EXTRA_SRC]))
    for (x, y, _n, _k), row_ in zip(EXTRA_SRC, ai_rows(r)):
        n, c, keep = str(row_).split(",")
        if n in items and int(c) - int(keep) > 0:
            out.append((n, x, y, int(c) - int(keep), "extra"))
    return out


base.sources = _sources_more


def ai_rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def ore(ai) -> list:
    """새 채굴기 자리마다 5x5 채굴 넓이 안 철 광석 합."""
    spots = [(x, y) for n, x, y, d in GROUPS["mine"] if n == EMD]
    r = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local n = 0
        for _, e in pairs(s.find_entities_filtered{area = {{p[1] - 2.5, p[2] - 2.5}, {p[1] + 2.5, p[2] + 2.5}}, name = "iron-ore"}) do n = n + e.amount end
        out[#out+1] = p[1] .. "," .. p[2] .. "," .. n
      end
      return out
    end)()""" % json.dumps([list(p) for p in spots]))
    return [str(v) for v in ai_rows(r)]


def status(ai) -> dict:
    out = base.status(ai)
    r = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      local function lanes(x, y)
        local b = s.find_entities_filtered{force = f, position = {x, y}, radius = 0.3, type = "transport-belt"}[1]
        if b then return b.get_transport_line(1).get_item_count() .. "/" .. b.get_transport_line(2).get_item_count() end
      end
      out.p_south = lanes(406.5, -110.5)
      out.side_w = lanes(400.5, -115.5)
      out.side_e = lanes(412.5, -115.5)
      out.mine_w = lanes(405.5, -152.5)
      out.mine_e = lanes(413.5, -152.5)
      local c = {}
      for _, e in pairs(s.find_entities_filtered{name = "steel-furnace", force = f, area = {{395, -132}, {418, -115}}}) do
        local k = st[e.status] or "-"; c[k] = (c[k] or 0) + 1
      end
      out.new_furnaces = c
      local coal = {}
      for _, p in pairs({{403.5, -149.5}, {413.5, -147.5}}) do
        local ch = s.find_entities_filtered{type = "container", force = f, position = p, radius = 0.3}[1]
        coal[#coal+1] = ch and ch.get_inventory(defines.inventory.chest).get_item_count("coal") or -1
      end
      out.coal = coal
      local stat = f.get_item_production_statistics(s)
      local function fl(n, cat, pi) return math.floor(stat.get_flow_count{name = n, category = cat, precision_index = pi, count = true}) end
      local T, O = defines.flow_precision_index.ten_minutes, defines.flow_precision_index.one_minute
      out.iron10 = fl("iron-plate", "input", T) .. " / " .. fl("iron-plate", "output", T)
      out.iron1 = fl("iron-plate", "input", O) .. " / " .. fl("iron-plate", "output", O)
      out.steel10 = fl("steel-plate", "input", T) .. " / " .. fl("steel-plate", "output", T)
      out.tick = game.tick
      return out
    end)()""")
    out.update(r if isinstance(r, dict) else {})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--check", default="")
    ap.add_argument("--need", default="")
    ap.add_argument("--ore", action="store_true")
    ap.add_argument("--build", default="")
    ap.add_argument("--crew", default="")
    ap.add_argument("--from", dest="frm", type=int, default=0)
    ap.add_argument("--to", type=int, default=0)
    ap.add_argument("--status", action="store_true")
    a, _ = ap.parse_known_args()
    ai = AIBridge()
    if a.measure:
        base.SEGS = [((69.5, -64.5), (69.5, -100.5)), ((69.5, -100.5), (406.5, -100.5)), ((406.5, -100.5), (406.5, -150)),
                     ((406.5, -150), (409, -190))]
        m = base.measure(ai)
        print(json.dumps(m, ensure_ascii=False))
        try:
            hist = json.load(open(STATE, encoding="utf-8"))
        except (OSError, ValueError):
            hist = {"measure": []}
        hist.setdefault("measure", []).append(m)
        json.dump(hist, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.check:
        print(json.dumps(base.check(ai, a.check.split(",")), ensure_ascii=False, indent=1))
    if a.need:
        print(json.dumps(base.need_total(a.need.split(",")), ensure_ascii=False))
    if a.ore:
        print("\n".join(ore(ai)))
    if a.build:
        g = a.build
        if a.frm or a.to:
            GROUPS[g] = GROUPS[g][a.frm:a.to or None]
        base.build(ai, a.crew, g)
    if a.status:
        print(json.dumps(status(ai), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""P10 for run 24: north copper outpost (22,-130), smelted on site, plates to the base on one fast belt.

p8_24.py (동쪽 철 전초) 의 짓기 루프 · 키트 · 겹침 검사를 그대로 쓰고 (모듈 전역을 이 배치로 바꿔 끼운다), 배치 · 출정 조건 · 채움 · 현황만 새로.

사용자 결정 (2026-09-30) 셋:
  (1) Lua relay 금지 - inv.remove → insert 없음. 석탄 · 탄은 사람 손 (take · insert) → 상자 → 팔 → 벨트 → 팔.
  (2) 못 놓는 자리에 짓기 금지 - 사람이 build (게임 충돌 검사), p1.blocked (can_place manual) 로 먼저 보고 나무 · 바위만 치운다.
  (3) 벨트는 셈부터 - 아래 표, 두 레인 · 빠른 벨트.

부지 고르기 (03:1x 조회 - 지도는 안 연다):
  북 (22,-130) 543k · 기지 중심 (70,-15) 에서 125 · 반경 250 안 적 유닛 0 · 구조물 0 · 가장 가까운 둥지 307 (방위 -140 = 북서, 5 개)
  서 (-165,-84) 663k · 기지 중심 259 · 반경 250 안 유닛 21 · 구조물 4 · 가장 가까운 둥지 221  → 버림
  북 광맥 칸: x 13..30 · y -138..-122 (230 칸), 가운데 (x 18..28, y -134..-125) 가 짙다.

셈 (belt-research §6-1, 여유 1.3):
    채굴기 24 × 0.5 = 12.0/s (5x5 안 광석 ≥ 4k 인 자리만: 열 13.5 ×2 · 17.5 ×6 · 21.5 ×6 · 25.5 ×6 · 29.5 ×4)
    채굴 줄 L x 19.5 (노랑): 채굴기 12 (양쪽) 6/s + M0 (열 13.5, 1/s 옆싣기) = 7/s → 레인 ~3.5 / 7.5 ✓
    채굴 줄 R x 27.5 (노랑): 채굴기 10 = 5/s → 레인 2.5 / 7.5 ✓
    화로 입력 W x 21.5 (빠른): L 을 옆싣기 → 서쪽 레인 7/s / 레인 15 ✓ · 동쪽 레인 석탄 0.27/s (강철 상자 → 팔)
    화로 입력 E x 31.5 (빠른): R 을 옆싣기 → 서쪽 레인 5/s / 15 ✓ · 동쪽 레인 석탄 0.23/s
    강철로 W 12 (7.5/s 한도, 공급 7) + E 10 (6.25/s 한도, 공급 5) = 판 12.0/s
    판 줄 P x 26.5 = 줄기 (빠른): W 화로 → 동쪽 레인 7 · E 화로 → 서쪽 레인 5 = 12 / 30 ✓  ceil(12 × 1.3 / 30) = 1 줄
      (노랑 한 줄은 15 < 12 × 1.3 = 15.6 → 빠른 벨트)
    팔 (기본, 벨트 집기 ~0.83/s): 화로 입력 0.625 + 석탄 0.02 → 78% ✓ · 결과 0.625 → 75% ✓
    석탄: 강철로 90 kW × 22 = 1.98 MW = 0.5/s → 강철 상자 2 (2,400 개씩 = W 2.5 h · E 3 h) 사람 손으로 채움
    전력: 채굴기 24 × 90 kW + 팔 ~70 × 13 kW ≈ 3.1 MW (기지망 12.4 / 24.3 MW → 15.5 / 24.3)

줄기: P x 26.5 남 → (26.5,-85.5) 서 → x 23.5 남 → **(23.5, 0.5) 에서 끝** (연결점, 전환 담당과 맞춤).
  제안: 지하 (23.5,1.5)→(23.5,3.5) 로 rg 벨트 y 2.5 밑 → x 23.5 남 → (24.5 · 25.5, 11.5) 동 → bl 판 벨트 (26.5,11.5) 서쪽 레인 (= 구리 레인) 옆싣기.

    python scripts/p10_24.py --run run24 --measure
    python scripts/p10_24.py --run run24 --scout hotel
    python scripts/p10_24.py --run run24 --check def,mine,smelt,trunk,power
    python scripts/p10_24.py --run run24 --build def --crew hotel
    python scripts/p10_24.py --run run24 --fill ammo --crew hotel
    python scripts/p10_24.py --run run24 --status
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
import detached                          # noqa: E402
from client import AIBridge              # noqa: E402
import p8_24 as base                     # noqa: E402

N, E, S, W = 0, 4, 8, 12
EMD, SF, INS, BELT, FBELT = "electric-mining-drill", "steel-furnace", "inserter", "transport-belt", "fast-transport-belt"
CHEST, SCHEST, POLE, MPOLE, TUR, WALL = "iron-chest", "steel-chest", "small-electric-pole", "medium-electric-pole", "gun-turret", "stone-wall"
OWNER = "p10"
SITE = (22.0, -115.0)
STATE = os.path.join(HERE, "..", "state", "run24_p10.json")

GROUPS = {"def": [], "mine": [], "smelt": [], "trunk": [], "power": []}
_CUR = ["def"]


def add(name, x, y, d=N):
    GROUPS[_CUR[0]].append((name, float(x), float(y), d))


def col(name, x, y0, y1, d):
    """x 고정, y0..y1 (둘 다 포함, 칸 가운데) 한 줄."""
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


# --- mine: 채굴기 24 (방향 = 붓는 쪽) + 채굴 줄 M0 · L · R (노랑) + 중간 전봇대 ---------------------------------------------
_CUR[0] = "mine"
DRILLS = {13.5: ([-130.5, -127.5], W),
          17.5: ([-136.5, -133.5, -130.5, -127.5, -124.5, -121.5], E),
          21.5: ([-136.5, -133.5, -130.5, -127.5, -124.5, -121.5], W),
          25.5: ([-136.5, -133.5, -130.5, -127.5, -124.5, -121.5], E),
          29.5: ([-133.5, -130.5, -127.5, -124.5], W)}
for _x, (_ys, _d) in DRILLS.items():
    for _y in _ys:
        add(EMD, _x, _y, _d)
col(BELT, 11.5, -131.5, -120.5, S)                 # M0 (열 13.5 → 서쪽으로 붓는다)
row(BELT, -119.5, 11.5, 18.5, E)                   #   → L 옆싣기 (19.5,-119.5)
col(BELT, 19.5, -137.5, -118.5, S)                 # L
row(BELT, -117.5, 19.5, 20.5, E)                   #   → W 옆싣기 (21.5,-117.5) = 서쪽 레인
col(BELT, 27.5, -137.5, -119.5, S)                 # R
row(BELT, -118.5, 27.5, 30.5, E)                   #   → E 옆싣기 (31.5,-118.5) = 서쪽 레인
for _x in (15.5, 23.5):
    for _y in (-134.5, -126.5, -120.5):
        add(MPOLE, _x, _y)
for _y in (-134.5, -126.5):
    add(MPOLE, 31.5, _y)

# --- smelt: W 21.5 | 팔 22.5 | 강철로 24 | 팔 25.5 | P 26.5 | 팔 27.5 | 강철로 29 | 팔 30.5 | E 31.5 ------------------------
_CUR[0] = "smelt"
FURN = os.environ.get("P10_FURN", SF)
FW = [-114.0 + 2 * k for k in range(12)]           # -114 .. -92
FE = [-114.0 + 2 * k for k in range(10)]           # -114 .. -96
col(FBELT, 21.5, -118.5, -92.5, S)                 # W (머리 -118.5: 옆싣기 칸 뒤에 한 칸 - 굽이가 아니라 옆싣기가 되게)
col(FBELT, 31.5, -119.5, -96.5, S)                 # E
col(FBELT, 26.5, -115.5, -86.5, S)                 # P
for _fy in FW:
    add(FURN, 24.0, _fy)
    add(INS, 22.5, _fy - 0.5, W)                   # W → 화로
    add(INS, 25.5, _fy - 0.5, W)                   # 화로 → P (동쪽 레인)
for _fy in FE:
    add(FURN, 29.0, _fy)
    add(INS, 27.5, _fy - 0.5, E)                   # 화로 → P (서쪽 레인)
    add(INS, 30.5, _fy - 0.5, E)                   # E → 화로
# 석탄: 강철 상자 → 팔 → 입력 줄 동쪽 레인 (팔은 먼 레인에 놓는다 - 서쪽에서 넣으니 동쪽 레인, 광석은 서쪽 레인)
add(SCHEST, 19.5, -116.5)
add(INS, 20.5, -116.5, W)
add(SCHEST, 29.5, -116.5)
add(INS, 30.5, -116.5, W)
COAL_CHESTS = [(19.5, -116.5), (29.5, -116.5)]
for _y in (-113.5, -107.5, -101.5, -95.5):
    add(MPOLE, 22.5, _y)
    add(MPOLE, 30.5, _y)

# --- trunk: P (26.5,-86.5) 다음부터 → (26.5,-85.5) 서 → x 23.5 남 → (23.5,0.5) 끝 (연결점) --------------------------------
_CUR[0] = "trunk"
row(FBELT, -85.5, 26.5, 24.5, W)
col(FBELT, 23.5, -85.5, 0.5, S)
JOIN = (23.5, 0.5)

# --- power: 기지 작은 전봇대 (24.5,-26.5) → x 24.5 중형 9 칸마다 → 제련 (22.5,-95.5) -------------------------------------
_CUR[0] = "power"
for _y in (-33.5, -42.5, -51.5, -60.5, -69.5, -78.5, -87.5):
    add(MPOLE, 24.5, _y)

# --- def: 벽 고리 (서 x 1.5 · 동 x 43.5 · 북 y -144.5 · 남 y -82.5, 줄기 틈 (23.5,-82.5)) + 포탑 무리 4 × 4 ---------------------
#   둥지는 북서 307 → 서쪽 둘 · 동쪽 둘 (포탑 사거리 18 로 벽 네 면을 다 덮는다). 탄: 손으로 채운 상자 → 팔 → 짧은 벨트 → 팔 → 포탑.
#   03:19 정찰 걸음이 땅을 만들자 북서 200 칸 (-120,-258) 에 침 뱉개 둥지 1 + 작은 바이터 7 → 서쪽 가운데 무리 하나 더 (포탑 20).
_CUR[0] = "def"
CLUSTERS = [(6, -136), (6, -116), (6, -96), (37, -136), (37, -96)]
for _cx, _cy in CLUSTERS:
    add(CHEST, _cx + 0.5, _cy - 5.5)
    add(INS, _cx + 0.5, _cy - 4.5, N)
    for _y in range(_cy - 4, _cy + 4):
        add(BELT, _cx + 0.5, _y + 0.5, S)
    for _ty in (_cy - 2, _cy + 2):
        add(TUR, _cx - 2, _ty)
        add(INS, _cx - 0.5, _ty - 0.5, E)
        add(TUR, _cx + 3, _ty)
        add(INS, _cx + 1.5, _ty - 0.5, W)
    add(POLE, _cx + 1.5, _cy - 0.5)
    add(POLE, _cx - 0.5, _cy - 4.5)
AMMO_CHESTS = [(cx + 0.5, cy - 5.5) for cx, cy in CLUSTERS]
# 무리 전봇대 → 망 (작은 전봇대 전선 7.5)
for _p in ((11.5, -136.5), (11.5, -117.5), (13.5, -96.5), (19.5, -96.5), (34.5, -95.5)):
    add(POLE, *_p)
WALL_SKIP = {(23.5, -82.5)}
for _y in range(-145, -82):
    add(WALL, 1.5, _y + 0.5)
    add(WALL, 43.5, _y + 0.5)
for _x in range(2, 43):
    for _wy in (-144.5, -82.5):
        if (_x + 0.5, _wy) not in WALL_SKIP:
            add(WALL, _x + 0.5, _wy)

SEGS = [((66.0, -15.0), (23.5, -10.0)), ((23.5, -10.0), (23.5, -85.5)), ((23.5, -85.5), (26.5, -115.0)),
        ((22.0, -140.0), (22.0, -85.0)), ((406.5, -102.0), (69.5, -102.0)), ((69.5, -102.0), (26.5, -102.0))]

# p8_24 의 짓기 · 키트 · 겹침 검사가 이 배치를 쓰게 한다
base.GROUPS = GROUPS
base.OWNER = OWNER
base.SITE = SITE
base.SEGS = SEGS
base.STATE = STATE
base.HUB_BOX = (62, -16.1, 76, -14.9)             # 허브 동쪽 강철 · 벽돌 상자 (74.5 · 75.5) 까지
base.HUB_KEEP["steel-plate"] = 100                # 강철은 blhaul (전환 담당) 몫을 남긴다
base.COST.update({FBELT: {"iron-plate": 4.5},           # 03:32 손제작 여유 +2 로는 빠른 벨트 2 개 제작이 «재료 모자람» 으로 돌아 무한 반복
                  MPOLE: {"steel-plate": 2, "copper-plate": 2, "iron-plate": 1}, SCHEST: {"steel-plate": 8},
                  SF: {"steel-plate": 6, "stone-brick": 10}})


def ai_rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def scout(ai, who) -> None:
    """기지 → 줄기 길 → 부지 둘레를 다리 (<= 40 칸) 로, 다리마다 떠나기 직전 선분 반경 80 적 0 을 다시 잰다."""
    import walkscout
    body = walkscout.body(ai, who) or {}
    at = (float(body.get("x") or 0), float(body.get("y") or 0))
    pts = []
    if at[0] > 100:                               # 동쪽 전초에서 오면 P8 줄기 길 (y -102) 로 서쪽
        x = at[0]
        pts.append((at[0], -102.0))
        while x > 70:
            x = max(69.5, x - 40)
            pts.append((x, -102.0))
        pts += [(46.0, -102.0), (26.0, -102.0)]
    else:
        pts += [(23.5, -12.0)]
        y = -12.0
        while y > -85:
            y = max(-85.5, y - 36)
            pts.append((22.0, y))
    pts += [(26.0, -100.0), (4.0, -88.0), (4.0, -118.0), (4.0, -142.0), (22.0, -142.0), (41.0, -142.0),
            (41.0, -115.0), (41.0, -86.0), (22.0, -100.0)]
    detached.mark([who], OWNER, minutes=40)
    home = (23.5, -12.0)
    for i, p in enumerate(pts):
        r = walkscout.body(ai, who)
        if not r or not r.get("alive", True):
            print(who, "사망/부재", flush=True)
            return
        at = (float(r.get("x") or 0), float(r.get("y") or 0))
        walkscout.gen_ahead(ai, p)
        f = walkscout.route_foes(ai, at, p)
        if f.get("units") or f.get("structs"):
            print(f"{who} 다리 {i} -> {p}: 반경 80 적 {f} - 접고 돌아온다", flush=True)
            walkscout.walk(ai, who, home, home, limit=180)
            return
        res = walkscout.walk(ai, who, p, home, limit=120)
        print(time.strftime("%X"), f"{who} 다리 {i} {p}: {res}", flush=True)
        if res in ("dead", "foe"):
            return
    print(who, "정찰 끝 - 부지에 선다", json.dumps(base.measure(ai), ensure_ascii=False), flush=True)


def fill(ai, who, what) -> None:
    """손으로 채움: 석탄 강철 상자 2 (석탄 밭 상자에서) · 탄 상자 4 (허브 · 저장 상자 탄창)."""
    from orders import submit
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=30)
    if what == "coal":
        per, dst = 1000, COAL_CHESTS
        # 03:50 석탄 밭 상자 (채굴기 6 → 상자, 3/s) 는 여럿이 나눠 100 남김이면 69 뿐 → 20 남김 + 저장 상자 석탄 (50 남김)
        src = [(n, x, y, c, cn) for n, x, y, c, cn in base.sources_coal(ai)] + base.sources(ai, {"coal"})
    else:
        per, dst = 100, AMMO_CHESTS                      # 포탑 20 × 20 발 + 벨트 · 팔
        src = base.sources(ai, {"piercing-rounds-magazine", "firearm-magazine"})
    want = per * len(dst)
    plan, got_items = [], {}
    for n, x, y, c, cn in sorted(src, key=lambda r: (r[0] != "piercing-rounds-magazine", -r[3])):
        if want <= 0:
            break
        keep = (20 if what == "coal" else 100) if cn == "coalfield" else (50 if what == "coal" else 20) if cn == "storage-chest" else base.HUB_KEEP.get(n, 0)
        got = min(want, c - keep)
        if got > 0:
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": got})]
            got_items[n] = got_items.get(n, 0) + got
            want -= got
    items = sorted(got_items.items(), key=lambda kv: -kv[1])
    for x, y in dst:
        plan.append(("walk_to", {"x": x + 1.5, "y": y + 0.5}))
        left = per
        for n, k in items:
            q = min(left, got_items[n])
            if q > 0:
                plan.append(("insert", {"name": n, "x": x, "y": y, "count": q}))
                got_items[n] -= q
                left -= q
    submit(ai, who, plan[:59], strict=False)
    print(time.strftime("%X"), who, "채움", what, dict(items), len(plan), flush=True)


def status(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      local A = {{0, -146}, {45, -81}}
      for _, n in pairs({"electric-mining-drill", "steel-furnace", "stone-furnace", "gun-turret", "stone-wall", "inserter", "transport-belt", "fast-transport-belt", "medium-electric-pole", "small-electric-pole"}) do
        local es = s.find_entities_filtered{name = n, force = f, area = A}
        local c = {}
        for _, e in pairs(es) do local k = e.status and st[e.status] or "-"; c[k] = (c[k] or 0) + 1 end
        local t = {}
        for k, v in pairs(c) do t[#t+1] = k .. "=" .. v end
        out[n] = #es .. " " .. table.concat(t, ",")
      end
      out.trunk = s.count_entities_filtered{name = "fast-transport-belt", force = f, area = {{22, -86}, {27, 1}}}
      local function lanes(x, y)
        local b = s.find_entities_filtered{name = "fast-transport-belt", force = f, position = {x, y}, radius = 0.3}[1]
        if b then return b.get_transport_line(1).get_item_count() .. "/" .. b.get_transport_line(2).get_item_count() end
      end
      out.p_lanes = lanes(26.5, -88.5)
      out.join_lanes = lanes(23.5, 0.5)
      local tam = 0
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, area = A}) do tam = tam + t.get_inventory(defines.inventory.turret_ammo).get_item_count() end
      out.turret_ammo = tam
      local coal = {}
      for _, p in pairs({{19.5, -116.5}, {29.5, -116.5}}) do
        local c = s.find_entities_filtered{name = "steel-chest", force = f, position = p, radius = 0.3}[1]
        coal[#coal+1] = c and c.get_inventory(defines.inventory.chest).get_item_count("coal") or -1
      end
      out.coal = coal
      out.copper_made = f.get_item_production_statistics(s).get_flow_count{name = "copper-plate", category = "input", precision_index = defines.flow_precision_index.ten_minutes, count = true}
      return out
    end)()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--scout", default="")
    ap.add_argument("--check", default="")
    ap.add_argument("--need", default="")
    ap.add_argument("--build", default="")
    ap.add_argument("--crew", default="")
    ap.add_argument("--from", dest="frm", type=int, default=0)
    ap.add_argument("--to", type=int, default=0)
    ap.add_argument("--fill", default="")
    ap.add_argument("--status", action="store_true")
    a, _ = ap.parse_known_args()
    ai = AIBridge()
    if a.measure:
        m = base.measure(ai)
        print(json.dumps(m, ensure_ascii=False))
        try:
            hist = json.load(open(STATE, encoding="utf-8"))
        except (OSError, ValueError):
            hist = {"measure": []}
        hist.setdefault("measure", []).append(m)
        json.dump(hist, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if a.scout:
        scout(ai, a.scout)
    if a.check:
        print(json.dumps(base.check(ai, a.check.split(",")), ensure_ascii=False, indent=1))
    if a.need:
        print(json.dumps(base.need_total(a.need.split(",")), ensure_ascii=False))
    if a.build:
        g = a.build
        if a.frm or a.to:
            GROUPS[g] = GROUPS[g][a.frm:a.to or None]
        base.build(ai, a.crew, g)
    if a.fill:
        fill(ai, a.crew, a.fill)
    if a.status:
        print(json.dumps(status(ai), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

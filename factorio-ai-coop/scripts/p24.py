"""P1 completion + P2 (red+green T2 block) for run 23 - design only, pure step builders.

22회차에서 게임으로 확인한 모듈을 그대로 옮긴다: 철 기둥 24 화로 (p1.column_steps 모양), 구리 기둥 8 화로
(p1.copper_steps 모양), 빨강·초록 블록 (p2.layout) 을 한 덩어리로 (DX, 0) 만큼 평행이동. 22회차 x=0 간선이
23회차 x=-39 간선이 된다. 새로 설계한 것은 광석·석탄을 기둥 머리까지 끌어오는 공급선뿐이다.

좌표는 타일 번호 (p2 와 같은 규칙): 3x3 는 가운데 타일, 2x2 화로는 왼쪽 위 타일, 나머지는 그 타일.

    구리+석탄 간선 A  y=-86 서향 (x -48 -> -72) -> (-73,-86) 남향 -> 구리 기둥 (-73, -45..-38)
        석탄 채굴기 1 (-48,-84) 북향 -> 남쪽 레인 · 구리 채굴기 5 (y=-88) 남향 -> 북쪽 레인
        꺾으면: 동쪽 레인 석탄 · 서쪽 레인 구리광석 (22회차 간선과 같은 짝)
    철 석탄 가지 B    y=-82 서향 (석탄 채굴기 2, y=-80 북향) -> (-52,-82) 남향 x=-52 -> (-52,-47)
        -> 철 줄 y=-46 에 북쪽에서 옆치기 = 북쪽 레인만 석탄
    철광석            y=-19 동향, 채굴기 7+7 (양쪽 - 두 레인 모두 광석) -> (-86,-19) 북향 x=-86
        -> 철 줄 y=-46 에 남쪽에서 옆치기 = 남쪽 레인만 광석 (옆치기는 가까운 레인으로 전부 - 22회차 실측)
    철 줄 y=-46       동향 (-87 토막 -> -40), 구리 간선 x=-73 은 지하 (-74 -> -72) 로 넘는다
        -> (-39,-46) 남향 = 철 기둥 간선: 동쪽 레인 석탄 · 서쪽 레인 광석
    판 -> 블록: p2.layout() 의 hookup (철 x=-44 -> y=-19 -> 척추 x=-34, 구리 x=-68/-78 -> y=-1)

p2 에서 뺀 것: 탄창 조립기 (23회차는 허브 곁 (-78.5,-49.5) 탄창 조립기가 방어 벨트를 이미 먹인다) 와
그 팔 둘·탄창 3칸 벨트. 줄 1 (y=0 동향) 은 회로 조립기 CI 가 집는 칸에서 끝난다 = 끝이 소비자.

    python scripts/p24.py --check                   # 오프라인 확인 (서버 없이)
    python scripts/p24.py                           # 단계별 선 것/전체 · 막힘 (게임 읽기만)
    python scripts/p24.py --ores                    # 채굴기 채굴 범위의 광석 순도 (게임 읽기만)
    python scripts/p24.py --recipes --who golf      # 조립기 레시피
    python scripts/p24.py --stage north --who alpha,bravo,charlie
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import p1   # noqa: E402
import p2   # noqa: E402
import p23  # noqa: E402,F401  (p23 이 p1.COST 에 지하관·조립기·포탑 값을 채운다)

N, E, S, W = 0, 4, 8, 12
VEC = p2.VEC
BELT, UG, INS, FAST, LONG = p2.BELT, p2.UG, p2.INS, p2.FAST, p2.LONG
AM, LAB, POLE = p2.AM, p2.LAB, p2.POLE
EMD, FURN = p1.EMD, p1.FURN

DX = -39                                   # 22회차 좌표 -> 23회차 (x 만)
SZ3 = {AM, LAB, EMD}
POWERED = {AM, LAB, INS, FAST, LONG, EMD}
ORE_OF = {"iron-plate": "iron-ore", "copper-plate": "copper-ore"}

# ---- 게임에서 잰 것 (2026-09-26, tick 7.24M) ------------------------------------------------
# 이미 선 소형 전봇대 (엔티티 좌표, 전력망 id). 망이 둘이다: 1 = 보일러 동쪽 엔진·석탄, 2 = 서쪽 엔진·허브·방어
EXISTING_POLES = [
    (-126.5, -47.5, 2), (-121.5, -47.5, 2), (-116.5, -47.5, 2), (-110.5, -47.5, 2), (-103.5, -47.5, 2),
    (-96.5, -47.5, 2), (-89.5, -47.5, 2), (-82.5, -47.5, 2), (-76.5, -50.5, 2), (-77.5, -47.5, 2),
    (-69.5, -50.5, 2), (-62.5, -52.5, 2), (-56.5, -55.5, 2), (-50.5, -58.5, 2), (-49.5, -61.5, 2),
    (-49.5, -67.5, 2), (-37.5, -75.5, 1), (-37.5, -67.5, 1), (-34.5, -67.5, 1), (-34.5, -65.5, 1),
    (-32.5, -88.5, 1), (-32.5, -82.5, 1), (-32.5, -76.5, 1), (-32.5, -70.5, 1), (-37.5, -61.5, 1),
    (-34.5, -61.5, 1), (-31.5, -69.5, 1)]
# 이미 선 것 (전봇대 제외) 의 타일 네모 - 새 전봇대를 거기 두지 않는다. 종류:x1,y1,x2,y2 (끝 포함)
EXISTING = """
    belt:-126,-47,-79,-47 belt:-34,-89,-34,-60 emd:-37,-89,-35,-87 emd:-37,-86,-35,-84 emd:-37,-83,-35,-81
    bmd:-65,-77,-64,-76 bmd:-63,-77,-62,-76 bmd:-61,-77,-60,-76 bmd:-59,-77,-58,-76 bmd:-57,-77,-56,-76
    bmd:-55,-77,-54,-76 bmd:-47,-77,-46,-76 chest:-46,-75,-46,-75 bmd:-45,-77,-44,-76 chest:-44,-75,-44,-75
    bmd:-43,-77,-42,-76 chest:-42,-75,-42,-75 bmd:-41,-77,-40,-76 furn:-65,-75,-64,-74 furn:-63,-75,-62,-74
    furn:-61,-75,-60,-74 furn:-59,-75,-58,-74 furn:-57,-75,-56,-74 furn:-55,-75,-54,-74 eng:-48,-71,-44,-69
    eng:-43,-71,-39,-69 pipe:-38,-70,-38,-70 ins:-35,-70,-35,-70 boiler:-37,-71,-36,-69 eng:-48,-68,-44,-66
    eng:-43,-68,-39,-66 pipe:-38,-67,-38,-67 ins:-35,-67,-35,-67 boiler:-37,-68,-36,-66 rock:-87,-67,-85,-65
    eng:-48,-65,-44,-63 eng:-43,-65,-39,-63 pipe:-38,-64,-38,-64 ins:-35,-64,-35,-64 boiler:-37,-65,-36,-63
    eng:-48,-62,-44,-60 eng:-43,-62,-39,-60 pipe:-38,-61,-38,-61 boiler:-37,-62,-36,-60 ins:-35,-61,-35,-61
    rock:-69,-59,-67,-58 pipe:-36,-59,-29,-59 ptg:-28,-59,-28,-59 ptg:-18,-59,-17,-59
    lab:-55,-57,-53,-55 lab:-49,-57,-47,-55 chest:-81,-53,-74,-53 ins:-79,-52,-79,-52
    turret:-125,-50,-124,-49 turret:-119,-50,-118,-49 am:-80,-51,-78,-49 ins:-125,-48,-125,-48
    ins:-119,-48,-119,-48 ins:-79,-48,-79,-48 ins:-125,-46,-125,-46 ins:-119,-46,-119,-46
    turret:-125,-45,-124,-44 turret:-119,-45,-118,-44 rock:-16,-44,-14,-42 rock:-125,-42,-123,-40
    rock:-44,-36,-41,-34 rock:-43,-34,-40,-32 bmd:-112,-32,-89,-31 rock:-47,-33,-44,-31
    furn:-112,-30,-89,-29 rock:-55,-30,-52,-27 rock:-47,-30,-45,-28
    rock:-51,-29,-49,-27 rock:-44,-27,-42,-25 rock:-38,-16,-36,-15 rock:-37,-13,-35,-11 wreck:-35,-7,-32,-4
    wreck:-19,-3,-17,-3 wreck:-29,-1,-27,2 wreck:-27,0,-25,1 wreck:-24,0,-23,2 wreck:-21,1,-20,2
    wreck:-34,1,-32,3 wreck:-35,3,-33,4 rock:-102,2,-99,5 wreck:-43,3,-40,5 wreck:-28,3,-25,4 wreck:-35,6,-34,7
    rock:-109,8,-107,10
"""
# 치울 것 (이름, 엔티티 x, y, 타일 네모) - 계획한 칸에 걸리는 것만 clear 단계가 캔다
DEBRIS = [
    ("big-rock", -85.13, -65.88, -87, -67, -85, -65), ("big-rock", -67.06, -58.06, -69, -59, -67, -58),
    ("huge-rock", -42.0, -34.56, -44, -36, -41, -34), ("huge-rock", -40.94, -32.25, -43, -34, -40, -32),
    ("huge-rock", -44.88, -31.5, -47, -33, -44, -31), ("huge-rock", -52.81, -28.06, -55, -30, -52, -27),
    ("big-rock", -45.38, -28.31, -47, -30, -45, -28), ("big-rock", -49.31, -27.56, -51, -29, -49, -27),
    ("big-rock", -42.19, -25.38, -44, -27, -42, -25), ("big-rock", -36.56, -15.0, -38, -16, -36, -15),
    ("big-rock", -35.56, -11.81, -37, -13, -35, -11),
    ("crash-site-spaceship-wreck-big-2", -33.22, -5.07, -35, -7, -32, -4),
    ("crash-site-spaceship-wreck-medium-3", -27.53, 0.76, -29, -1, -27, 2),
    ("crash-site-spaceship-wreck-small-6", -25.71, 0.35, -27, 0, -25, 1),
    ("crash-site-spaceship-wreck-small-1", -22.93, 1.41, -24, 0, -23, 2),
    ("crash-site-spaceship-wreck-small-2", -19.95, 1.57, -21, 1, -20, 2),
    ("crash-site-spaceship-wreck-small-4", -32.57, 2.53, -34, 1, -32, 3),
    ("crash-site-spaceship-wreck-big-1", -33.5, 3.3, -35, 3, -33, 4),
    ("crash-site-spaceship-wreck-medium-2", -40.95, 4.51, -43, 3, -40, 5),
    ("crash-site-spaceship-wreck-medium-1", -26.07, 4.29, -28, 3, -25, 4),
    ("crash-site-spaceship-wreck-small-3", -34.3, 7.04, -35, 6, -34, 7)]
# P0 버너 (엔티티 좌표) - retire 단계가 판·석탄을 챙기고 걷는다
BURNER_IRON_XS = [-89 - 2 * i for i in range(12)]          # 채굴기 (x,-31) · 화로 (x,-29)
BURNER_CU_XS = [-54 - 2 * i for i in range(6)]             # 채굴기 (x,-76) · 화로 (x,-74)
BURNER_COAL_XS = [-40, -42, -44, -46]                       # 채굴기 (x,-76) · 상자 (-41.5,-43.5,-45.5 , -74.5)
OLD_LABS = [(-53.5, -55.5), (-47.5, -55.5)]

# ---- 배치 상수 ---------------------------------------------------------------------------
A_Y = -86                                   # 구리+석탄 간선 A (서향)
A_COAL = (-48, -84)                         # 석탄 채굴기 (간선 남쪽, 북향)
CU_DRILL_XS = [-67, -64, -61, -58, -55]     # 구리 채굴기 (간선 북쪽 y=-88, 남향)
CU_X = -73                                  # 구리 간선 (남향) = 22회차 -34 + DX
B_Y, B_X = -82, -52                         # 철 석탄 가지 B (y=-82 서향 -> x=-52 남향)
B_COAL_XS = [-47, -44]                      # 석탄 채굴기 (y=-80, 북향)
IRON_Y = -19                                # 철광석 모음 줄 (동향)
IRON_DRILL_XS = [-109, -106, -103, -100, -97, -94, -91]    # 북 y=-21 (남향) · 남 y=-17 (북향)
IRON_UP_X = -86                             # 철광석 북향 줄
ROW_Y = -46                                 # 철 줄 (동향) -> (-39,-46) 에서 남향
TRUNK_X = DX                                # 철 기둥 간선 x=-39
COL_TOP, COL_ROWS = -45, 12
CU_TOP, CU_ROWS = -45, 4
KEEP_FREE = {(TRUNK_X, COL_TOP + 2 * COL_ROWS), (CU_X, CU_TOP + 2 * CU_ROWS)}   # 간선 끝의 앞칸
PARK = (-30.5, -30.5)                        # 공사 뒤 비켜 서는 곳 (빈 땅)


def ent(name, x, y, d=None, **kw):
    return p2.ent(name, x, y, d, **kw)


def run(x1, y1, x2, y2, d):
    return p2.run(x1, y1, x2, y2, d)


# ------------------------------------------------------------------ 배치 (순수)

def north():
    """석탄 A + 구리 채굴 5 + 간선 A -> 구리 기둥 8, 그리고 철용 석탄 가지 B."""
    out = [ent(EMD, A_COAL[0], A_COAL[1], N)]
    out += [ent(EMD, x, A_Y - 2, S) for x in CU_DRILL_XS]
    out += run(A_COAL[0], A_Y, CU_X + 1, A_Y, W) + [ent(BELT, CU_X, A_Y, S)]
    out += run(CU_X, A_Y + 1, CU_X, CU_TOP - 1, S)
    # 구리 기둥 (p1.copper_steps 모양): 판 -78 · 팔 -77 · 화로 -76,-75 · 팔 -74 · 간선 -73 · 팔 -72 · 화로 -71,-70 · 팔 -69 · 판 -68
    for r in range(CU_ROWS):
        y = CU_TOP + 2 * r
        out += [ent(FURN, CU_X - 3, y, recipe="copper-plate"), ent(FURN, CU_X + 2, y, recipe="copper-plate"),
                ent(INS, CU_X - 1, y, E), ent(INS, CU_X + 1, y, W),
                ent(INS, CU_X - 4, y, E), ent(INS, CU_X + 4, y, W)]
    out += run(CU_X, CU_TOP, CU_X, CU_TOP + 2 * CU_ROWS - 1, S)
    out += run(CU_X - 5, CU_TOP, CU_X - 5, CU_TOP + 2 * CU_ROWS - 1, S)
    out += run(CU_X + 5, CU_TOP, CU_X + 5, CU_TOP + 2 * CU_ROWS - 1, S)
    # 가지 B
    out += [ent(EMD, x, B_Y + 2, N) for x in B_COAL_XS]
    out += run(B_COAL_XS[-1], B_Y, B_X + 1, B_Y, W) + [ent(BELT, B_X, B_Y, S)]
    out += run(B_X, B_Y + 1, B_X, ROW_Y - 1, S)
    return out


def iron():
    """철광석 채굴 14 -> 모음 줄 -> 북향 -> 철 줄 y=-46 (지하로 구리 간선을 넘음) -> 철 기둥 24."""
    out = []
    for x in IRON_DRILL_XS:
        out += [ent(EMD, x, IRON_Y - 2, S), ent(EMD, x, IRON_Y + 2, N)]
    out += run(IRON_DRILL_XS[0], IRON_Y, IRON_UP_X - 1, IRON_Y, E)
    out += run(IRON_UP_X, IRON_Y, IRON_UP_X, ROW_Y + 1, N)
    out += run(IRON_UP_X - 1, ROW_Y, CU_X - 2, ROW_Y, E)
    out += p2.ug_pair(CU_X - 1, ROW_Y, CU_X + 1, ROW_Y, E)
    out += run(CU_X + 2, ROW_Y, TRUNK_X - 1, ROW_Y, E) + [ent(BELT, TRUNK_X, ROW_Y, S)]
    # 철 기둥 (p1.column_steps 모양)
    for r in range(COL_ROWS):
        y = COL_TOP + 2 * r
        out += [ent(FURN, TRUNK_X - 3, y, recipe="iron-plate"), ent(FURN, TRUNK_X + 2, y, recipe="iron-plate"),
                ent(INS, TRUNK_X - 1, y, E), ent(INS, TRUNK_X + 1, y, W),
                ent(INS, TRUNK_X - 4, y, E), ent(INS, TRUNK_X + 4, y, W)]
    for x in (TRUNK_X - 5, TRUNK_X, TRUNK_X + 5):
        out += run(x, COL_TOP, x, COL_TOP + 2 * COL_ROWS - 1, S)
    return out


AMMO_DROP = {(p2.AMMO, 3), (p2.AMMO, 1), (p2.AMMO + 2, 3)}


def block():
    """p2.layout() 을 DX 만큼 옮기고 탄창 조립기 가지를 뺀다. {hookup, belts, chain, science, labs}."""
    st = p2.layout()
    out = {}
    for k in ("hookup", "belts", "chain", "science", "labs"):
        keep = []
        for e in st[k]:
            if k == "chain" and (e["x"], e["y"]) in AMMO_DROP:
                continue
            if e["name"] == BELT and ((e["y"] == 0 and p2.CI < e["x"] <= p2.AMMO)
                                      or (e["x"] == -2 and 1 <= e["y"] <= 3)):
                continue                      # 줄 1 은 CI 가 집는 칸 (-13,0) 에서 끝
            e = dict(e)
            e["x"] += DX
            keep.append(e)
        out[k] = keep
    return out


def layout() -> dict:
    """단계 순서대로 {이름: 엔티티}. 전봇대는 지역마다 앞 단계 + 기존 망에서 이어 욕심 배치."""
    bl = block()
    st = {"north": north(), "iron": iron()}
    st.update(bl)
    everything = [e for v in st.values() for e in v]
    occ, _ = occupancy(everything)
    net = [(x - 0.5, y - 0.5) for x, y, _n in EXISTING_POLES]
    out = {}
    for pname, group in (("n_poles", st["north"]), ("i_poles", st["iron"]),
                         ("b_poles", bl["chain"] + bl["science"] + bl["labs"] + bl["belts"] + bl["hookup"])):
        ps = place_poles(group, occ, net)
        net += ps
        out[pname] = [ent(POLE, x, y) for x, y in ps]
        for x, y in ps:
            occ[(x, y)] = out[pname][-1]
    order = {}
    order["n_poles"], order["north"] = out["n_poles"], st["north"]
    order["i_poles"], order["iron"] = out["i_poles"], st["iron"]
    order["b_poles"] = out["b_poles"]
    for k in ("chain", "belts", "science", "labs", "hookup"):
        order[k] = bl[k]
    return order


# ------------------------------------------------------------------ 타일 · 겹침

def size(e):
    return 3 if e["name"] in SZ3 else (2 if e["name"] == FURN else 1)


def tiles(e):
    s = size(e)
    if s == 3:
        return [(e["x"] + dx, e["y"] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    if s == 2:
        return [(e["x"] + dx, e["y"] + dy) for dx in (0, 1) for dy in (0, 1)]
    return [(e["x"], e["y"])]


def pos(e):
    return (e["x"] + 1.0, e["y"] + 1.0) if size(e) == 2 else (e["x"] + 0.5, e["y"] + 0.5)


def occupancy(ents):
    occ, clash = {}, []
    for e in ents:
        for t in tiles(e):
            if t in occ:
                clash.append((t, occ[t]["name"], e["name"]))
            occ[t] = e
    return occ, clash


def existing_tiles():
    out = set()
    for bit in EXISTING.split():
        _k, r = bit.split(":")
        x1, y1, x2, y2 = (int(v) for v in r.split(","))
        out |= {(x, y) for x in range(x1, x2 + 1) for y in range(y1, y2 + 1)}
    return out


def place_poles(group, occ, net):
    """소형 전봇대 욕심 배치 (p2.poles 와 같은 규칙, 기존 망 + 앞 지역 전봇대에서 이어 간다)."""
    need = [e for e in group if e["name"] in POWERED]
    if not need:
        return []
    blocked_ = existing_tiles() | set(occ) | KEEP_FREE
    xs = [t[0] for e in need for t in tiles(e)]
    ys = [t[1] for e in need for t in tiles(e)]
    x1, x2, y1, y2 = min(xs) - 3, max(xs) + 3, min(ys) - 3, max(ys) + 3
    # 기존 망에서 지역까지 중계가 필요하면 가장 가까운 기존 전봇대까지의 땅도 후보
    q = min(net, key=lambda p: math.dist(p, (min(max(p[0], x1), x2), min(max(p[1], y1), y2))))
    x1, x2 = min(x1, int(q[0]) - 1), max(x2, int(q[0]) + 1)
    y1, y2 = min(y1, int(q[1]) - 1), max(y2, int(q[1]) + 1)
    cand = [(x, y) for x in range(x1, x2 + 1) for y in range(y1, y2 + 1) if (x, y) not in blocked_]
    where = {}
    for i, e in enumerate(need):
        for t in tiles(e):
            where.setdefault(t, set()).add(i)
    covers = {}
    for c in cand:
        s = set()
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                s |= where.get((c[0] + dx, c[1] + dy), set())
        covers[c] = s
    todo = set(range(len(need)))
    chosen = []
    reach = {c for c in cand if any(math.dist(c, p) <= 7.5 for p in net)}
    while todo:
        pool = [c for c in reach if c not in chosen]
        if not pool:
            raise RuntimeError(f"전봇대 후보가 망에 안 닿는다 ({len(todo)} 남음)")
        best = max(pool, key=lambda c: (len(covers[c] & todo),
                                        -min(math.dist(c, (need[i]["x"], need[i]["y"])) for i in todo), c))
        if not covers[best] & todo:
            tgt = min(((need[i]["x"], need[i]["y"]) for i in todo), key=lambda q: min(math.dist(q, c) for c in pool))
            best = min(pool, key=lambda c: (math.dist(c, tgt), c))
        chosen.append(best)
        todo -= covers[best]
        reach |= {c for c in cand if math.dist(c, best) <= 7.5}
    return chosen


# ------------------------------------------------------------------ 오프라인 확인

def left_of(d):
    return {N: W, E: N, S: E, W: S}[d]


def drill_sources(ents):
    """채굴기가 떨구는 칸과 레인: 앞 두 칸의 벨트, 채굴기 쪽 (가까운) 레인."""
    belts = {(e["x"], e["y"]): e for e in ents if e["name"] in (BELT, UG)}
    out, bad = [], []
    for e in ents:
        if e["name"] != EMD:
            continue
        vx, vy = VEC[e["d"]]
        k = (e["x"] + 2 * vx, e["y"] + 2 * vy)
        b = belts.get(k)
        item = "coal" if (e["x"], e["y"]) == A_COAL or e["x"] in B_COAL_XS and e["y"] == B_Y + 2 else (
            "copper-ore" if e["y"] == A_Y - 2 else "iron-ore")
        if b is None:
            bad.append(f"채굴기 {e['x'], e['y']} 앞 {k} 에 벨트가 없다")
            continue
        side = (-vx, -vy)
        if side == VEC[left_of(b["d"])]:
            ln = "L"
        elif side == tuple(-v for v in VEC[left_of(b["d"])]):
            ln = "R"
        else:
            bad.append(f"채굴기 {e['x'], e['y']} 가 벨트 {k} 의 앞/뒤에서 떨군다")
            continue
        out.append((k[0], k[1], b["d"], item, ln))
    return out, bad


def made(e):
    if e is None:
        return None
    if e["name"] == AM:
        return p2.RECIPE[e["recipe"]][1]
    if e["name"] == FURN:
        return e["recipe"]
    return None


def want_of(m):
    if m["name"] == FURN:
        return {ORE_OF[m["recipe"]], "coal"}
    return set(p2.RECIPE[m["recipe"] if m["name"] == AM else LAB][0])


def trace(st):
    """p2.trace 를 이 배치로 돌린다 (타일 크기·생산물·출발 레인만 바꿔 끼운다)."""
    ents = [e for v in st.values() for e in v]
    srcs, bad = drill_sources(ents)
    saved = (p2.tiles, p2.made, p2.SOURCES)
    p2.tiles, p2.made, p2.SOURCES = tiles, made, srcs
    try:
        lanes, probs = p2.trace(st)
    finally:
        p2.tiles, p2.made, p2.SOURCES = saved
    return lanes, bad + probs


def pole_nets(st):
    """새 전봇대마다 기존 망에 닿는가 (전선 7.5, 앞 단계부터 차례로). {새 전봇대: 이어진 기존 망 id}"""
    old = [((x - 0.5, y - 0.5), n) for x, y, n in EXISTING_POLES]
    new = [(e["x"], e["y"]) for k, v in st.items() if k.endswith("_poles") for e in v]
    label = {p: {n} for p, n in old}
    changed = True
    for p in new:
        label.setdefault(p, set())
    while changed:
        changed = False
        for p in new:
            for q, ns in label.items():
                if q != p and math.dist(p, q) <= 7.5 and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    return {p: label[p] for p in new}


def check(st) -> list:
    ents = [e for v in st.values() for e in v]
    occ, clash = occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    ex = existing_tiles()
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']}" for t in occ
            if t in ex and not any(r[3] <= t[0] <= r[5] and r[4] <= t[1] <= r[6] for r in DEBRIS)]
    bad += [f"비워 둘 칸 {t}" for t in KEEP_FREE if t in occ]
    lanes, probs = trace(st)
    bad += probs
    arms = [e for e in ents if e["name"] in p2.ARMS]
    got = {}
    for a in arms:
        r = p2.ARMS[a["name"]]
        px, py = VEC[a["d"]]
        sk, dk = (a["x"] + px * r, a["y"] + py * r), (a["x"] - px * r, a["y"] - py * r)
        src, dst = occ.get(sk), occ.get(dk)
        at = (a["x"], a["y"])
        if src is None or dst is None:
            bad.append(f"팔 {at}: 집는 칸 {src and src['name']} / 놓는 칸 {dst and dst['name']}")
            continue
        have = (lanes[sk]["L"] | lanes[sk]["R"]) if src["name"] in (BELT, UG) else {made(src)} - {None}
        if not have:
            bad.append(f"팔 {at}: 집는 칸 {src['name']} {sk} 에 아무것도 안 온다")
        if dst["name"] in (AM, LAB, FURN):
            use = want_of(dst) & have
            if not use:
                bad.append(f"팔 {at}: {dst.get('recipe', dst['name'])} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(use)
        elif dst["name"] not in (BELT, UG):
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for m in (e for e in ents if e["name"] in (AM, LAB, FURN)):
        lack = want_of(m) - got.get(id(m), set())
        if lack:
            bad.append(f"{m.get('recipe', m['name'])} ({m['x']},{m['y']}): 모자람 {sorted(lack)}")
    # 전력: 덮개 (소형 5x5 = 가운데 타일 ±2) - 새 전봇대 + 기존 전봇대
    ps = [(e["x"], e["y"]) for k, v in st.items() if k.endswith("_poles") for e in v]
    ps += [(x - 0.5, y - 0.5) for x, y, _n in EXISTING_POLES]
    for e in ents:
        if e["name"] in POWERED and not any(
                any(abs(t[0] - p[0]) <= 2.5 and abs(t[1] - p[1]) <= 2.5 for t in tiles(e)) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    for p, ns in pole_nets(st).items():
        if not ns:
            bad.append(f"전봇대 {p}: 기존 망에 안 닿는다 (7.5)")
    return bad


# ------------------------------------------------------------------ 단계 (게임 step)

def steps_of(ents):
    out = []
    for e in ents:
        x, y = pos(e)
        p = {"name": e["name"], "x": x, "y": y}
        if "d" in e:
            p["direction"] = e["d"]
        if "kind" in e:
            p["type"] = e["kind"]
        out.append(("build", p))
    return out


def clear_steps(st):
    planned = {t for v in st.values() for e in v for t in tiles(e)}
    out = []
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        if any((tx, ty) in planned for tx in range(x1, x2 + 1) for ty in range(y1, y2 + 1)):
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 1.0}))
    return out


def oldlabs_steps():
    out = []
    for x, y in OLD_LABS:
        for item in ("automation-science-pack", "logistic-science-pack"):
            out.append(("take", {"name": item, "x": x, "y": y, "count": 400}))
        out.append(("demolish", {"x": x, "y": y, "name": LAB, "search_radius": 0.6}))
    return out


def retire_steps():
    """P0 버너 셋 (철 12 · 구리 6 · 석탄 4) - 판·석탄은 챙기고 걷는다. 기둥이 돈 뒤에만."""
    out = []
    for xs, dy, fy, plate in ((BURNER_IRON_XS, -31, -29, "iron-plate"), (BURNER_CU_XS, -76, -74, "copper-plate")):
        for x in xs:
            out += [("take", {"name": plate, "x": x, "y": fy, "count": 100}),
                    ("demolish", {"x": x, "y": fy, "name": FURN, "search_radius": 0.6}),
                    ("demolish", {"x": x, "y": dy, "name": "burner-mining-drill", "search_radius": 0.6})]
    for cx in (-41.5, -43.5, -45.5):
        out += [("take", {"name": "coal", "x": cx, "y": -74.5, "count": 1600}),
                ("demolish", {"x": cx, "y": -74.5, "name": "wooden-chest", "search_radius": 0.4})]
    out += [("demolish", {"x": x, "y": -76, "name": "burner-mining-drill", "search_radius": 0.6}) for x in BURNER_COAL_XS]
    return out


def stages():
    st = layout()
    out = {"clear": clear_steps(st)}
    for k, v in st.items():
        if k == "labs":
            out["oldlabs"] = oldlabs_steps()
        out[k] = steps_of(v)
    out["retire"] = retire_steps()
    return out


def am_list(st):
    return [e for k in ("chain", "science") for e in st[k] if e["name"] == AM]


def set_recipes(ai, who):
    """조립기 레시피 (GUI 에서 고르는 것). 이미 맞으면 게임이 그대로 둔다."""
    for e in am_list(layout()):
        x, y = pos(e)
        r = ai.set_recipe(who, x, y, e["recipe"])
        if isinstance(r, dict) and r.get("error"):
            print(f"  레시피 {e['recipe']} ({x},{y}): {r['error']}")


def ore_purity(ai, st):
    """채굴기마다 5x5 채굴 범위의 자원 이름들 (섞이면 한 레인 한 품목이 깨진다). 게임 읽기만."""
    ds = [e for v in st.values() for e in v if e["name"] == EMD]
    packed = ";".join(f"{e['x'] + 0.5},{e['y'] + 0.5}" for e in ds)
    reply = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local names, amt = {}, 0
        for _, r in pairs(s.find_entities_filtered{type = "resource", area = {{x - 2.5, y - 2.5}, {x + 2.5, y + 2.5}}}) do
          names[r.name] = (names[r.name] or 0) + 1
          amt = amt + r.amount
        end
        local t = {}
        for n, c in pairs(names) do t[#t+1] = n .. ":" .. c end
        out[#out+1] = bit .. "|" .. table.concat(t, "/") .. "|" .. amt
      end
      return out
    end)()""" % packed)
    for r in p1._rows(reply):
        print("  ", r)


def counts(st):
    n = {}
    for v in st.values():
        for e in v:
            key = e["name"] if e["name"] != AM else f"{AM}:{e['recipe']}"
            n[key] = n.get(key, 0) + 1
    return n


def power_kw(n):
    """최대 전력 (kW): 채굴기 90 · 조립기1 77.5 · 연구소 60 · 팔 13.6 · 고속 47.1 · 긴팔 20.4 (드레인 포함)."""
    am = sum(v for k, v in n.items() if k.startswith(AM))
    return (n.get(EMD, 0) * 90 + am * 77.5 + n.get(LAB, 0) * 60 + n.get(INS, 0) * 13.6
            + n.get(FAST, 0) * 47.1 + n.get(LONG, 0) * 20.4)


def main() -> int:
    ap = argparse.ArgumentParser()
    all_st = list(stages())
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--stage", default="", choices=("", *all_st))
    ap.add_argument("--who", default="")
    ap.add_argument("--recipes", action="store_true")
    ap.add_argument("--ores", action="store_true")
    args = ap.parse_args()
    st = layout()
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 것과 겹침 0 · 팔 집는/놓는 칸 · 레인 한 품목 · 전력 덮개 · 전선 7.5 모두 통과")
        n = counts(st)
        print("  수량:", n)
        print(f"  전봇대 새로 {sum(len(v) for k, v in st.items() if k.endswith('_poles'))} · 이어지는 기존 망 "
              f"{sorted(set().union(*pole_nets(st).values()))}")
        print(f"  최대 전력 {power_kw(n) / 1000:.2f} MW (새것만)")
        for k, v in stages().items():
            print(f"  {k:9s} {len(v)}")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update({AM: {"iron-plate": 22, "copper-plate": 4.5}, FAST: {"iron-plate": 8, "copper-plate": 4.5},
                    LONG: {"iron-plate": 7, "copper-plate": 1.5}, LAB: {"iron-plate": 36, "copper-plate": 15},
                    UG: {"iron-plate": 8.75}})
    p1.PAIRED.add(UG)
    p1.PARK = PARK
    ai = AIBridge()
    sts = stages()
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        if nb:
            bad = p1.blocked(ai, steps)
            print(f"  {name:9s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
        else:
            gone = p1.vanished(ai, steps)
            spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
            print(f"  {name:9s} 치움 {len(gone & spots)}/{len(spots)}")
    if args.ores:
        ore_purity(ai, st)
    if args.recipes:
        set_recipes(ai, (args.who or "golf").split(",")[0])
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p24"
    detached.mark(crew, "p24", minutes=180)
    try:
        ok = p1.build_stage(ai, crew, sts[args.stage], args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

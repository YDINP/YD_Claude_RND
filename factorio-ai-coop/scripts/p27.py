"""P4-5 for run 23: iron plate expansion +5.0/s -> dedicated chests in the hub row. Design + offline check only (p25/p26 structure).

목표율 +4/s 이상 -> 설계 5.0/s (돌 화로 16) - 근거 (게임 실측 2026-09-26, tick 9.26M):
    · 철판 1시간 평균 생산 6.7/s · 소비 7.35/s (포탑 손제작 포함) - 이미 적자. p26 화학팩이 1.2/s, 포탑 한 파 (24 대) 가 철 960 을 더 원한다.
    · 허브 상자 철판 457 · 강철 18 (구리 16,427 로 차 있음). 기존 철 기둥 (p24) 은 빨강·초록·군사 줄에 묶여 허브로 오지 않는다.
    · 돌 화로 1 대 = 철판 0.3125/s (3.2초). 16 대 = 5.0/s. 전기 채굴기 1 대 = 0.5 x 1.1 (채굴 생산성 1) = 0.55/s -> 10 대 5.5/s (여유 10%).
    · 연료 석탄 16 x 0.0225 = 0.36/s -> 석탄 채굴기 1 대 (0.55/s).
    · 전력: 새것 최대 ~1.5MW (채굴기 11 x 90kW + 팔 35). 발전 10.8MW, 지금 발전 0.3~0.65MW (조립기 33 · 화로 34 full_output,
      연구소 15 missing_science_packs - 기지가 역압으로 서 있다).
    · 철 재고: 허브 상자 457 말고 alpha 가방에 철판 6,600 (판 모으기 잔여). fetch 는 짓는 사람 가방부터 쓰므로 alpha 를 크루에 넣으면
      부트스트랩 철 402 가 허브를 건드리지 않는다.

배치 - 제련은 광맥 옆이 아니라 허브 옆. 석탄밭 2 (-99,-104) 가 기지 북쪽, 철광맥 (-104,-20) 이 남쪽이라 허브 (y=-53) 가 둘 사이에 있다.
    광맥 옆 직결 (채굴기 -> 화로, p25 돌 방식) 이면 석탄 벨트 ~150칸 + 판 벨트 ~95칸 + 채굴기 16 = 철 ~940.
    허브 옆 기둥 (p24 방식, L 석탄 · R 광석) 이면 석탄 42 + 광석 33 + 기둥·판 65칸 + 채굴기 11 = 철 ~650.

    광석: 채굴기 5+5 (x=-103 동향 · x=-99 서향, y -26 -29 -32 -35 -38) -> 오름줄 x=-101 북향 -> (-101,-45) 서쪽으로 꺾어
          x=-104 북향 -> 탄약 줄 y=-47 · 전봇대 (-104,-48) 는 지하 (-46 -> -49) -> (-104,-59) 에서 기둥 머리에 남쪽 옆치기 = R (남쪽) 레인
    석탄: 석탄밭 2 채굴기 (-102,-102) 서향 -> x=-104 남향 (y -102..-61) -> 기둥 머리에 북쪽 옆치기 = L (북쪽) 레인
    기둥 K: 간선 y=-60 동향 (x -104..-89), 화로 fx = -103..-89 (2칸 간격) 북쪽 8 (y -63..-62) · 남쪽 8 (y -58..-57)
          팔: 북 (fx,-61) 넣기 · (fx,-64) 빼기 -> 북쪽 판 줄 y=-65 동향 -> (-86,-65) 남향 -> (-86,-55) 에 북쪽 옆치기
              남 (fx,-59) 넣기 · (fx,-56) 빼기 -> 남쪽 판 줄 y=-55 동향 (x -103..-82)
          판 줄 두 레인 = 북쪽 레인 (북쪽 화로 8) | 남쪽 레인 (남쪽 화로 8), 둘 다 철판.
    끝: 새 철 상자 3 (-84..-82, y=-53 타일 = 허브 줄 y=-52.5 의 서쪽 빈칸) <- 팔 (y=-54, 북쪽 판 줄에서 집음).
        p1.hub() 영역 (x -84.5..-73.5, y -52.5 ±0.6) 안이라 build_stage fetch 가 자동으로 쓴다 (p1 수정 없음).
        포탑 창고 상자 (-88,-56)·(-87,-56) 은 남쪽 빼기 팔 줄 (y=-56) 을 피해 화로를 fx ≤ -89 로 멈췄다.
    바위 (-87..-85,-67..-65) 는 북쪽 판 줄 꺾는 자리 - clear 단계가 캔다.

부트스트랩 (철을 가장 적게 쓰는 순서 - 단계별 철은 --check 가 찍는다):
    clear -> c_poles · coal (석탄 먼저, 벨트가 버퍼) -> r_poles · ore_a (오름줄 + 채굴기 4) -> k_poles · col_s (간선 + 남쪽 화로 8 + 상자)
    == 여기서 가동: 채굴기 4 = 2.2/s -> 남쪽 화로 8 (상한 2.5/s) -> 허브 새 상자. 이 철로 ==
    -> ore_b (채굴기 6) -> col_n (북쪽 화로 8 + 북쪽 판 줄) = 5.0/s.

    python scripts/p27.py --check                    # 오프라인 확인 (SNAP · p26 예약 영역)
    python scripts/p27.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만)
    python scripts/p27.py --snapshot                 # 설계 둘레 기존 엔티티·나무 -> SNAP/DEBRIS (게임 읽기만)
    python scripts/p27.py --ores --power             # 채굴 범위 자원 · 망 전력 (게임 읽기만)
    python scripts/p27.py --stage coal --who alpha,golf   # 짓기 (설계자는 돌리지 않았다)
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

N, E, S, W = 0, 4, 8, 12
VEC = p2.VEC
BELT, UG, INS, FAST, LONG = p2.BELT, p2.UG, p2.INS, p2.FAST, p2.LONG
POLE = p2.POLE
EMD, FURN = p1.EMD, p1.FURN
CHEST = "iron-chest"
ARMS = {INS: 1, FAST: 1, LONG: 2}
BELTS = {BELT, UG}
POWERED = {INS, FAST, LONG, EMD}
KW = {EMD: 90, INS: 14.7, FAST: 58.8, LONG: 21}

RATE = 5.0
RECIPE = {"iron-plate": ({"iron-ore", "coal"}, "iron-plate"),      # 화로: 넣는 것 + 연료
          CHEST: ({"iron-plate"}, None)}                          # 끝점 (허브 새 상자)
SMELTABLE = {"stone", "iron-ore", "copper-ore", "iron-plate"}
# 판으로 따진 값 (p1.COST + p25/p26 이 더한 것) - 단계별 철 소모를 오프라인으로 찍는다
COST = {**p1.COST, UG: {"iron-plate": 8.75}, LONG: {"iron-plate": 7, "copper-plate": 1.5}}

# ---- 배치 상수 (타일. 3x3 은 가운데, 2x2 화로는 왼쪽 위, 나머지는 그 타일) ------------------------
COAL_C = (-102, -102)                  # 석탄 채굴기 (서향) -> (-104,-102)
HEAD_X, TRUNK_Y = -104, -60            # 기둥 머리 · 간선 (동향)
FXS = list(range(-103, -88, 2))        # 화로 왼쪽 위 x (8)
N_PLATE_Y, S_PLATE_Y, DROP_X = -65, -55, -86
RISE_X = -101                          # 광석 오름줄 (북향)
ORE_YS = [-26, -29]                    # ore_a (아래 두 줄 = 광석이 가장 두껍다)
ORE_YS_B = [-32, -35, -38]
JOG_Y = -45
UG_IN, UG_OUT = -46, -49               # 탄약 줄 y=-47 · 전봇대 (-104,-48) 밑
CHEST_XS, CHEST_Y = (-84, -83, -82), -53
PARK = (-95.5, -51.5)                  # 공사 뒤 비켜 서는 곳 (빈 땅)


def ent(name, x, y, d=None, **kw):
    return p2.ent(name, x, y, d, **kw)


def dims(e):
    if e["name"] == EMD:
        return 3, 3
    if e["name"] == FURN:
        return 2, 2
    return 1, 1


def _span(v, s):
    return list(range(v - s // 2, v + s // 2 + 1)) if s % 2 else list(range(v, v + s))


def tiles(e):
    w, h = dims(e)
    return [(x, y) for x in _span(e["x"], w) for y in _span(e["y"], h)]


def pos(e):
    w, h = dims(e)
    return (e["x"] + (0.5 if w % 2 else w / 2), e["y"] + (0.5 if h % 2 else h / 2))


def run(x1, y1, x2, y2, d):
    return p2.run(x1, y1, x2, y2, d)


def ug(x1, y1, x2, y2, d):
    return p2.ug_pair(x1, y1, x2, y2, d)


# ------------------------------------------------------------------ 배치 (순수)

def coal():
    """석탄밭 2 채굴기 1 (서향, 벨트 동쪽 = 남향 벨트의 L 레인) -> x=-104 남향 -> 기둥 머리 북쪽 (-104,-61)."""
    return [ent(EMD, *COAL_C, W, ore="coal")] + run(HEAD_X, COAL_C[1], HEAD_X, TRUNK_Y - 1, S)


def riser():
    """오름줄: x=-101 (y -26..-44) -> (-101,-45) 서향 꺾음 -> x=-104 북향, 탄약 줄·전봇대 밑 지하 -> (-104,-59)."""
    out = run(RISE_X, ORE_YS[0], RISE_X, JOG_Y + 1, N) + run(RISE_X, JOG_Y, HEAD_X + 1, JOG_Y, W)
    out += [ent(BELT, HEAD_X, JOG_Y, N)] + ug(HEAD_X, UG_IN, HEAD_X, UG_OUT, N)
    out += run(HEAD_X, UG_OUT - 1, HEAD_X, TRUNK_Y + 1, N)
    return out


def drills(ys):
    """오름줄 양쪽 채굴기: 서쪽 (x=-103, 동향) = W 레인 · 동쪽 (x=-99, 서향) = E 레인 - 두 레인 모두 광석 (기둥 머리에서 한 레인으로 모인다)."""
    out = []
    for y in ys:
        out += [ent(EMD, RISE_X - 2, y, E, ore="iron-ore"), ent(EMD, RISE_X + 2, y, W, ore="iron-ore")]
    return out


def ore_a():
    return riser() + drills(ORE_YS)


def ore_b():
    return drills(ORE_YS_B)


def col_s():
    """간선 (석탄 L | 광석 R) + 남쪽 화로 8 + 남쪽 판 줄 y=-55 -> 새 상자 3. 판 줄은 끝 팔 (-82,-54) 에서 끝난다."""
    out = run(HEAD_X, TRUNK_Y, FXS[-1], TRUNK_Y, E)
    for fx in FXS:
        out += [ent(FURN, fx, TRUNK_Y + 2, recipe="iron-plate"),
                ent(INS, fx, TRUNK_Y + 1, N),              # 간선 (북) 에서 집어 화로 (남) 에
                ent(INS, fx, TRUNK_Y + 4, N)]              # 화로 (북) 에서 집어 판 줄 (남) 에 = 판 줄 남쪽 레인
    out += run(FXS[0], S_PLATE_Y, CHEST_XS[-1], S_PLATE_Y, E)
    for x in CHEST_XS:
        out += [ent(INS, x, CHEST_Y - 1, N), ent(CHEST, x, CHEST_Y)]
    return out


def col_n():
    """북쪽 화로 8 + 북쪽 판 줄 y=-65 -> (-86,-65) 남향 -> (-86,-55) 에 북쪽 옆치기 = 남쪽 판 줄의 북쪽 레인."""
    out = []
    for fx in FXS:
        out += [ent(FURN, fx, TRUNK_Y - 3, recipe="iron-plate"),
                ent(INS, fx, TRUNK_Y - 1, S),              # 간선 (남) 에서 집어 화로 (북) 에
                ent(INS, fx, TRUNK_Y - 4, S)]              # 화로 (남) 에서 집어 북쪽 판 줄 (북) 에
    out += run(FXS[0], N_PLATE_Y, DROP_X - 1, N_PLATE_Y, E) + run(DROP_X, N_PLATE_Y, DROP_X, S_PLATE_Y - 1, S)
    return out


PIECES = (("coal", coal), ("ore_a", ore_a), ("col_s", col_s), ("ore_b", ore_b), ("col_n", col_n))
POLED = {"coal": "c_poles", "ore_a": "r_poles", "ore_b": "r_poles", "col_s": "k_poles", "col_n": "k_poles"}
ORDER = ("c_poles", "coal", "r_poles", "ore_a", "k_poles", "col_s", "ore_b", "col_n")


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p27.py --snapshot 이 찍는다 (2026-09-26, tick 9.26M). 설계 칸 ±4 (전봇대는 ±12). 형식은 p26 과 같다.
# 종류:x1,y1,x2,y2[:d][:i/o 또는 망] - b 벨트 u 지하 s 분배기 i 팔 f 고속 l 긴팔 p 전봇대 P 관 F 화로 A 조립기
# L 연구소 D 채굴기 G 포탑 C 상자 E 보일러·엔진 R 바위 X 잔해 K 절벽 ! 적 ? 그 밖
SNAP = """
    A:-80,-51,-78,-49 C:-78,-53,-78,-53 C:-79,-53,-79,-53 C:-80,-53,-80,-53 C:-81,-53,-81,-53 C:-87,-56,-87,-56
    C:-88,-56,-88,-56 D:-101,-22,-99,-20 D:-104,-22,-102,-20 D:-107,-22,-105,-20 D:-110,-22,-108,-20 D:-95,-22,-93,-20
    D:-98,-22,-96,-20 R:-87,-67,-85,-65 b:-100,-47,-100,-47:12 b:-101,-47,-101,-47:12 b:-102,-47,-102,-47:12
    b:-103,-47,-103,-47:12 b:-104,-47,-104,-47:12 b:-105,-47,-105,-47:12 b:-106,-47,-106,-47:12 b:-107,-47,-107,-47:12
    b:-108,-47,-108,-47:12 b:-97,-47,-97,-47:12 b:-98,-47,-98,-47:12 b:-99,-47,-99,-47:12 i:-79,-52,-79,-52:0
    p:-100,-15,-100,-15:2 p:-103,-23,-103,-23:2 p:-104,-48,-104,-48:2 p:-106,-15,-106,-15:2 p:-109,-23,-109,-23:2
    p:-111,-48,-111,-48:2 p:-115,-15,-115,-15:2 p:-115,-21,-115,-21:2 p:-115,-27,-115,-27:2 p:-115,-33,-115,-33:2
    p:-70,-51,-70,-51:2 p:-72,-44,-72,-44:2 p:-77,-44,-77,-44:2 p:-77,-51,-77,-51:2 p:-78,-48,-78,-48:2
    p:-79,-41,-79,-41:2 p:-83,-48,-83,-48:2 p:-87,-29,-87,-29:2 p:-89,-17,-89,-17:2 p:-90,-48,-90,-48:2
    p:-91,-23,-91,-23:2 p:-94,-15,-94,-15:2 p:-97,-23,-97,-23:2 p:-97,-48,-97,-48:2
"""
DEBRIS = [
    ('big-rock', -85.125, -65.875, -87, -67, -85, -65),
]
TREES = [      # (이름, x, y) - 설계 칸·팔 칸에 걸린 나무 (clear 단계가 한 그루씩 캔다: 벌목은 한 그루 베고 끝나 5x3 엔진이 막혔다)
]

_SNAP = None


def snap():
    global _SNAP
    if _SNAP is not None:
        return _SNAP
    out = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}}
    for bit in SNAP.split():
        parts = bit.split(":")
        k = parts[0]
        x1, y1, x2, y2 = (int(v) for v in parts[1].split(","))
        extra = parts[2:]
        for x in range(x1, x2 + 1):
            for y in range(y1, y2 + 1):
                out["tiles"][(x, y)] = k
                if k in ("b", "u", "s"):
                    out["belts"][(x, y)] = (int(extra[0]), extra[1] if len(extra) > 1 else None, k)
                elif k in ("i", "f", "l"):
                    out["arms"][(x, y)] = (k, int(extra[0]))
                elif k == "p":
                    out["poles"][(x, y)] = int(extra[0]) if extra and extra[0].isdigit() else 0
    _SNAP = out
    return out


def debris_tiles():
    out = {}
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        for tx in range(x1, x2 + 1):
            for ty in range(y1, y2 + 1):
                out[(tx, ty)] = (name, x, y)
    return out


def arm_ends(a):
    r = ARMS[a["name"]]
    px, py = VEC[a["d"]]
    return (a["x"] + px * r, a["y"] + py * r), (a["x"] - px * r, a["y"] - py * r)


def occupancy(ents):
    occ, clash = {}, []
    for e in ents:
        for t in tiles(e):
            if t in occ:
                clash.append((t, occ[t]["name"], e["name"]))
            occ[t] = e
    return occ, clash


def reserved_p26() -> dict:
    """p26 stages() 의 build 전부 (공사 중 - 겹치면 안 된다): 칸 -> 이름. 가운데 좌표 + 크기에서 타일을 되살린다."""
    import p26
    out = {}
    for name, steps in p26.stages().items():
        for k, p in steps:
            if k != "build":
                continue
            w, h = p26.dims({"name": p["name"], "d": p.get("direction", N)})
            x0, y0 = math.floor(p["x"] - w / 2 + 0.01), math.floor(p["y"] - h / 2 + 0.01)
            for x in range(x0, x0 + w):
                for y in range(y0, y0 + h):
                    out[(x, y)] = f"p26 {name} {p['name']}"
    return out


def place_poles(group, occ, net, reach=7.5):
    """소형 전봇대 욕심 배치 (p26 과 같은 규칙): 덮개 ±2 타일, 전선 7.5, 망에서 먼 무리는 다리 전봇대."""
    need = [e for e in group if e["name"] in POWERED]
    if not need:
        return []
    sn = snap()
    arm_spots = {t for e in occ.values() if e["name"] in ARMS for t in arm_ends(e)}
    blocked_ = set(sn["tiles"]) | set(occ) | set(debris_tiles()) | arm_spots | set(_reserved())
    where = {}
    for i, e in enumerate(need):
        for t in tiles(e):
            where.setdefault(t, set()).add(i)
    band = {(x + dx, y + dy) for (x, y) in where for dx in range(-3, 4) for dy in range(-3, 4)}
    cand = [c for c in band if c not in blocked_]
    covers = {c: set().union(*[where.get((c[0] + dx, c[1] + dy), set()) for dx in range(-2, 3) for dy in range(-2, 3)])
              for c in cand}
    todo = {i for i in range(len(need))
            if not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(need[i]) for p in net)}
    chosen = []
    reach_set = {c for c in cand if any(math.dist(c, p) <= reach for p in net)}
    while todo:
        pool = [c for c in reach_set if c not in chosen]
        if pool:
            best = max(pool, key=lambda c: (len(covers[c] & todo),
                                            -min(math.dist(c, (need[i]["x"], need[i]["y"])) for i in todo), c))
            if covers[best] & todo:
                chosen.append(best)
                todo -= covers[best]
                reach_set |= {c for c in cand if math.dist(c, best) <= reach}
                continue
        # 닿는 후보가 아무것도 못 덮는다 -> 가장 가까운 망 전봇대에서 목표 쪽으로 다리 전봇대 (띠 밖이라도 빈칸)
        tgt = min(((need[i]["x"], need[i]["y"]) for i in todo), key=lambda q: min(math.dist(q, p) for p in net + chosen))
        src = min(net + chosen, key=lambda p: math.dist(p, tgt))
        k = max(1, math.ceil(math.dist(src, tgt) / 7))
        c0 = (round(src[0] + (tgt[0] - src[0]) / k), round(src[1] + (tgt[1] - src[1]) / k))
        ring = sorted(((c0[0] + dx, c0[1] + dy) for dx in range(-2, 3) for dy in range(-2, 3)), key=lambda c: math.dist(c, c0))
        c = next((c for c in ring if c not in blocked_ and c not in chosen and math.dist(c, src) <= reach
                  and math.dist(c, tgt) < math.dist(src, tgt)), None)
        if c is None:
            raise RuntimeError(f"전봇대 자리가 없다 ({len(todo)} 남음, {tgt})")
        chosen.append(c)
        covers.setdefault(c, set().union(*[where.get((c[0] + dx, c[1] + dy), set())
                                           for dx in range(-2, 3) for dy in range(-2, 3)]))
        todo -= covers[c]
        reach_set |= {q for q in cand if math.dist(q, c) <= reach}
    return chosen


_RES = None


def _reserved():
    global _RES
    if _RES is None:
        _RES = reserved_p26()
    return _RES


def layout() -> dict:
    """단계 순서대로 {이름: 엔티티}. 전봇대는 지역마다 앞 단계 + 기존 망에서 이어 욕심 배치 (구리·나무만 - 철 0)."""
    st = {k: f() for k, f in PIECES}
    occ, _ = occupancy([e for v in st.values() for e in v])
    net = list(snap()["poles"])
    groups = {}
    for k, _f in PIECES:
        groups.setdefault(POLED[k], []).extend(st[k])
    order = {}
    for pname in ("c_poles", "r_poles", "k_poles"):
        ps = place_poles(groups[pname], occ, net)
        net += ps
        for x, y in ps:
            occ[(x, y)] = ent(POLE, x, y)
        order[pname] = [ent(POLE, x, y) for x, y in ps]
    order.update(st)
    return {k: order[k] for k in ORDER if order.get(k)}


# ------------------------------------------------------------------ 레인 추적 (p25/p26 규칙)

def left_of(d):
    return {N: W, E: N, S: E, W: S}[d]


def lane_of(belt_d, side):
    if side == VEC[left_of(belt_d)]:
        return "L"
    if side == tuple(-v for v in VEC[left_of(belt_d)]):
        return "R"
    return None


def made(e):
    if e is None or e["name"] != FURN:
        return None
    return RECIPE[e["recipe"]][1]


def want_of(m):
    return set(RECIPE[m["recipe"] if m["name"] == FURN else m["name"]][0])


def belt_map(ents):
    return {(e["x"], e["y"]): e for e in ents if e["name"] in BELTS}


def trace(st):
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    belt = belt_map(ents)
    lanes = {k: {"L": set(), "R": set()} for k in belt}
    problems = []
    for e in ents:                                  # 채굴기 -> 앞 칸 벨트, 채굴기 쪽 (가까운) 레인
        if e["name"] == EMD:
            vx, vy = VEC[e["d"]]
            k = (e["x"] + 2 * vx, e["y"] + 2 * vy)
            if k not in belt:
                problems.append(f"채굴기 {e['x'], e['y']} 앞 {k} 에 벨트가 없다")
                continue
            ln = lane_of(belt[k]["d"], (-vx, -vy))
            if ln is None:
                problems.append(f"채굴기 {e['x'], e['y']} 가 벨트 {k} 의 앞/뒤에서 떨군다")
            else:
                lanes[k][ln].add(e["ore"])
    feeders = {}
    for k in belt:
        out = []
        for dx, dy in VEC.values():
            q = (k[0] - dx, k[1] - dy)
            e = belt.get(q)
            if e is None or (e["name"] == UG and e.get("kind") == "input"):
                continue
            fx, fy = VEC[e["d"]]
            if (q[0] + fx, q[1] + fy) == k:
                out.append((q, "back" if e["d"] == belt[k]["d"] else "side"))
        feeders[k] = out

    def ug_exit(k):
        e = belt[k]
        fx, fy = VEC[e["d"]]
        for i in range(1, 6):
            q = (k[0] + fx * i, k[1] + fy * i)
            if q in belt and belt[q]["name"] == UG and belt[q].get("kind") == "output" and belt[q]["d"] == e["d"]:
                return q
        return None

    arms = [e for e in ents if e["name"] in ARMS]
    for _ in range(400):
        changed = False
        for a in arms:
            src, dst = arm_ends(a)
            if dst not in belt:
                continue
            item = made(occ.get(src))
            if item is None:
                continue
            sx, sy = a["x"] - dst[0], a["y"] - dst[1]
            side = ((sx > 0) - (sx < 0), (sy > 0) - (sy < 0))
            ln = {"L": "R", "R": "L"}.get(lane_of(belt[dst]["d"], side))     # 팔은 먼 레인에 놓는다
            if ln is None:
                problems.append(f"팔 {a['x'], a['y']} 이 벨트 {dst} 의 앞/뒤에서 놓는다")
                continue
            if item not in lanes[dst][ln]:
                lanes[dst][ln].add(item)
                changed = True
        for k, e in belt.items():
            ins = feeders[k]
            curve = len(ins) == 1 and ins[0][1] == "side" and e["name"] == BELT
            for q, how in ins:
                src_l = lanes[q]
                if how == "back" or curve:
                    for ln in "LR":
                        if not src_l[ln] <= lanes[k][ln]:
                            lanes[k][ln] |= src_l[ln]
                            changed = True
                else:                               # 옆치기: 가까운 레인으로 전부
                    ln = lane_of(e["d"], (q[0] - k[0], q[1] - k[1]))
                    allc = src_l["L"] | src_l["R"]
                    if not allc <= lanes[k][ln]:
                        lanes[k][ln] |= allc
                        changed = True
            if e["name"] == UG and e.get("kind") == "input":
                ex = ug_exit(k)
                if ex:
                    for ln in "LR":
                        if not lanes[k][ln] <= lanes[ex][ln]:
                            lanes[ex][ln] |= lanes[k][ln]
                            changed = True
        if not changed:
            break
    for k, e in belt.items():
        if e["name"] == UG and e.get("kind") == "input":
            if ug_exit(k) is None:
                problems.append(f"지하 입구 {k} 에 짝 출구가 없다 (5칸 안)")
            if any(how == "side" for _, how in feeders[k]):
                problems.append(f"지하 입구 {k} 가 옆에서 받는다 - 한 레인만 넘어간다")
        if e["name"] == UG and e.get("kind") == "output" and feeders[k]:
            problems.append(f"지하 출구 {k} 로 다른 벨트가 들어온다")
    for k, v in lanes.items():
        for ln in "LR":
            if len(v[ln]) > 1:
                problems.append(f"레인 섞임 {k} {ln}: {sorted(v[ln])}")
    return lanes, problems


def nxt_belt(belt, k):
    e = belt[k]
    vx, vy = VEC[e["d"]]
    if e["name"] == UG and e.get("kind") == "input":
        for i in range(1, 6):
            q = (k[0] + vx * i, k[1] + vy * i)
            if q in belt and belt[q]["name"] == UG and belt[q].get("kind") == "output":
                return [q]
        return []
    q = (k[0] + vx, k[1] + vy)
    return [q] if q in belt else []


def dead_ends(ents, occ, lanes) -> list:
    """소비자 없는 생산은 없다: 레인에 처음 실린 품목마다 하류 어딘가에 집어 쓰는 팔이 있어야 한다 (상자는 허브 끝점)."""
    belt = belt_map(ents)
    takes = {}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        dst = occ.get(dk)
        if sk in belt and dst is not None and dst["name"] in (FURN, CHEST):
            takes.setdefault(sk, set()).update(want_of(dst))

    def down(k):
        got, stack, vis = set(), [k], set()
        while stack:
            q = stack.pop()
            if q in vis:
                continue
            vis.add(q)
            got |= takes.get(q, set())
            stack += nxt_belt(belt, q)
        return got

    up = {}
    for k in belt:
        for q in nxt_belt(belt, k):
            up.setdefault(q, []).append(k)
    bad, told = [], set()
    for k in belt:
        items = lanes[k]["L"] | lanes[k]["R"]
        came = set().union(*[lanes[q]["L"] | lanes[q]["R"] for q in up.get(k, [])]) if up.get(k) else set()
        for it in (items - came) - down(k):
            if it not in told:
                told.add(it)
                bad.append(f"소비자 없음: {it} 이 {k} 에서 하류 끝까지 가도 집어 쓰는 팔이 없다")
    return bad


# ------------------------------------------------------------------ 오프라인 확인

def pole_nets(st):
    old = list(snap()["poles"].items())
    new = [(e["x"], e["y"]) for v in st.values() for e in v if e["name"] == POLE]
    label = {p: {n} for p, n in old}
    for p in new:
        label.setdefault(p, set())
    changed = True
    while changed:
        changed = False
        for p in new:
            for q, ns in label.items():
                if q != p and math.dist(p, q) <= 7.5 and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    return {p: label[p] for p in new}


def check(st) -> list:
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, clash = occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    deb = debris_tiles()
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']} / {sn['tiles'][t]}" for t in occ
            if t in sn["tiles"] and sn["tiles"][t] not in ("R", "X")]
    bad += [f"바위·잔해 {t} 가 DEBRIS 에 없다" for t in occ if sn["tiles"].get(t) in ("R", "X") and t not in deb]
    res = _reserved()
    arm_spots = {t: a for a in ents if a["name"] in ARMS for t in arm_ends(a)}
    bad += [f"p26 예약 칸과 겹침 {t}: {occ[t]['name']} / {res[t]}" for t in occ if t in res]
    bad += [f"팔 {a['x'], a['y']} 의 집는/놓는 칸 {t} 가 p26 예약 칸 ({res[t]})" for t, a in arm_spots.items() if t in res]
    lanes, probs = trace(st)
    bad += probs
    got = {}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        at = (a["x"], a["y"])
        for t in (sk, dk):
            if sn["tiles"].get(t) in ("R", "X") and t not in deb:
                bad.append(f"팔 {at}: {t} 에 바위·잔해 - DEBRIS 에 없다")
        src = occ.get(sk)
        if src is None:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 {sn['tiles'].get(sk, '아무것도 없음')}")
            continue
        have = (lanes[sk]["L"] | lanes[sk]["R"]) if src["name"] in BELTS else {made(src)} - {None}
        if not have:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 아무것도 안 온다")
        dst = occ.get(dk)
        if dst is None:
            bad.append(f"팔 {at}: 놓는 칸 {dk} 에 {sn['tiles'].get(dk, '아무것도 없음')}")
            continue
        if dst["name"] == FURN:
            want = want_of(dst)
            dirty = (have & SMELTABLE) - want
            if dirty:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 녹일 수 있는 딴 것 {sorted(dirty)}")
            if not have & want:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(have & want)
        elif dst["name"] == CHEST:
            if have - want_of(dst):
                bad.append(f"팔 {at}: 상자에 철판 말고 {sorted(have - want_of(dst))} 가 들어간다")
            got.setdefault(id(dst), set()).update(have & want_of(dst))
        elif dst["name"] not in BELTS:
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for m in (e for e in ents if e["name"] in (FURN, CHEST)):
        lack = want_of(m) - got.get(id(m), set())
        if lack:
            bad.append(f"{m.get('recipe', m['name'])} ({m['x']},{m['y']}): 모자람 {sorted(lack)}")
    bad += dead_ends(ents, occ, lanes)
    belt = belt_map(ents)
    for k, e in belt.items():                      # 기존 줄과 엉킴
        if e["name"] == UG and e.get("kind") == "input":
            continue
        vx, vy = VEC[e["d"]]
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ not in belt and nx_ in sn["belts"]:
            bad.append(f"벨트 {k} 가 기존 벨트 {nx_} 로 흘러든다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ in belt:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {nx_} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    ps = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + list(sn["poles"])
    for e in ents:
        if e["name"] in POWERED and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
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
    """설계 칸 전체 + 팔이 집는/놓는 칸의 바위·잔해·나무를 하나씩 캔다 (벌목 한 번은 한 그루만 - 엔진 5x3 이 그렇게 막혔다)."""
    ents = [e for v in st.values() for e in v]
    spots = {t for e in ents for t in tiles(e)} | {t for e in ents if e["name"] in ARMS for t in arm_ends(e)}
    out, seen = [], set()
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        if (name, x, y) not in seen and any((tx, ty) in spots for tx in range(x1, x2 + 1) for ty in range(y1, y2 + 1)):
            seen.add((name, x, y))
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 1.0}))
    for name, x, y in TREES:
        if (math.floor(x), math.floor(y)) in spots:
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 0.5}))
    return out


def stages():
    st = layout()
    out = {"clear": clear_steps(st)}
    for k, v in st.items():
        # 싼 것부터: 채굴기·화로 (철 23 · 돌 5) 가 먼저, 벨트는 뒤 - 순번이 잘려도 앞의 것이 먼저 선다
        rank = {EMD: 0, FURN: 1, CHEST: 2, INS: 3, UG: 4, BELT: 5, POLE: 0}
        out[k] = steps_of(sorted(v, key=lambda e: rank.get(e["name"], 6)))
    return out


def counts(st):
    n = {}
    for v in st.values():
        for e in v:
            key = e["name"] if e["name"] not in (FURN, EMD) else f"{e['name']}:{e.get('recipe', e.get('ore'))}"
            n[key] = n.get(key, 0) + 1
    return n


def plates(ents):
    """이 엔티티들을 판에서 만들 때 드는 철판·구리판·돌 (지하 벨트는 한 개 값)."""
    t = {}
    for e in ents:
        for m, k in COST.get(e["name"], {}).items():
            t[m] = t.get(m, 0) + k
    return t


def power_kw(n):
    return sum(KW.get(k.split(":")[0], 0) * v for k, v in n.items())


# ------------------------------------------------------------------ 게임 (읽기만)

CODE = {"transport-belt": "b", "underground-belt": "u", "splitter": "s", "inserter": "i", "fast-inserter": "f",
        "long-handed-inserter": "l", "small-electric-pole": "p", "medium-electric-pole": "p", "stone-furnace": "F",
        "steel-furnace": "F", "assembling-machine-1": "A", "assembling-machine-2": "A", "lab": "L",
        "electric-mining-drill": "D", "burner-mining-drill": "D", "gun-turret": "G", "iron-chest": "C",
        "wooden-chest": "C", "steam-engine": "E", "boiler": "E", "pipe": "P", "pipe-to-ground": "P",
        "offshore-pump": "E", "pump": "P", "storage-tank": "P", "pumpjack": "P"}

SNAP_LUA = """(function()
  local s, out = game.surfaces[1], {}
  for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}}) do
    if e.type ~= "resource" and e.type ~= "character" and e.type ~= "item-entity"
       and e.type ~= "corpse" and e.type ~= "fish" and e.type ~= "entity-ghost" and e.type ~= "unit" then
      local b = e.bounding_box
      local d, kind, net = 0, "", ""
      pcall(function() d = e.direction end)
      if e.type == "underground-belt" then kind = e.belt_to_ground_type end
      if e.type == "electric-pole" then net = tostring(e.electric_network_id) end
      out[#out+1] = string.format("%%s|%%s|%%.3f|%%.3f|%%.3f|%%.3f|%%.3f|%%.3f|%%d|%%s|%%s",
        e.name, e.type, e.position.x, e.position.y, b.left_top.x, b.left_top.y, b.right_bottom.x, b.right_bottom.y,
        d, kind, net)
    end
  end
  return out
end)()"""


def snapshot(ai):
    """설계 칸 ±4 (전봇대는 ±12) 의 기존 엔티티를 SNAP · DEBRIS, 설계·팔 칸의 나무를 TREES 형식으로 찍는다."""
    global _SNAP
    _SNAP = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}}
    st = {k: f() for k, f in PIECES}
    ents = [e for v in st.values() for e in v]
    ts = {t for e in ents for t in tiles(e)} | {t for e in ents if e["name"] in ARMS for t in arm_ends(e)}
    near = {(x + dx, y + dy) for x, y in ts for dx in range(-4, 5) for dy in range(-4, 5)}
    far = {(x + dx, y + dy) for x, y in ts for dx in range(-12, 13) for dy in range(-12, 13)}
    xs, ys = [t[0] for t in ts], [t[1] for t in ts]
    rows = []
    y = min(ys) - 13
    while y <= max(ys) + 13:
        reply = ai.lua(SNAP_LUA % (min(xs) - 13, y, max(xs) + 14, min(y + 40, max(ys) + 14)))
        rows += [str(r) for r in p1._rows(reply)]
        y += 40
    seen, toks, debris, trees = set(), [], [], []
    for r in rows:
        name, typ, x, y, lx, ly, rx, ry, d, kind, net = r.split("|")
        if (name, x, y) in seen:
            continue
        seen.add((name, x, y))
        if typ == "tree":
            if (math.floor(float(x)), math.floor(float(y))) in ts:
                trees.append((name, float(x), float(y)))
            continue
        tx1, ty1 = math.floor(float(lx) + 0.01), math.floor(float(ly) + 0.01)
        tx2, ty2 = math.ceil(float(rx) - 0.01) - 1, math.ceil(float(ry) - 0.01) - 1
        cells = {(a, b) for a in range(tx1, tx2 + 1) for b in range(ty1, ty2 + 1)}
        if not cells & (far if typ == "electric-pole" else near):
            continue
        if typ == "simple-entity" or name.startswith("crash-site"):
            debris.append((name, float(x), float(y), tx1, ty1, tx2, ty2))
            toks.append(f"{'R' if typ == 'simple-entity' else 'X'}:{tx1},{ty1},{tx2},{ty2}")
            continue
        k = "K" if typ == "cliff" else ("!" if typ in ("unit-spawner", "turret") else CODE.get(name, "?"))
        tok = f"{k}:{tx1},{ty1},{tx2},{ty2}"
        if k in ("b", "s", "i", "f", "l"):
            tok += f":{d}"
        elif k == "u":
            tok += f":{d}:{'i' if kind == 'input' else 'o'}"
        elif k == "p":
            tok += f":{net}"
        toks.append(tok)
    lines, line = [], "   "
    for t in sorted(set(toks)):
        if len(line) + len(t) > 118:
            lines.append(line)
            line = "   "
        line += " " + t
    lines.append(line)
    print('SNAP = """')
    print("\n".join(lines))
    print('"""')
    print("DEBRIS = [")
    for dd in sorted(set(debris)):
        print(f"    ({dd[0]!r}, {dd[1]}, {dd[2]}, {dd[3]}, {dd[4]}, {dd[5]}, {dd[6]}),")
    print("]")
    print("TREES = [")
    for tr in sorted(set(trees), key=lambda t: (t[2], t[1])):
        print(f"    ({tr[0]!r}, {tr[1]}, {tr[2]}),")
    print("]")


ORE_LUA = """(function() local s, out = game.surfaces[1], {}
  for bit in string.gmatch("%s", "[^;]+") do
    local x, y = string.match(bit, "([^,]+),([^,]+)")
    x, y = tonumber(x), tonumber(y)
    local names, amt = {}, 0
    for _, r in pairs(s.find_entities_filtered{type = "resource", area = {{x - 2.5, y - 2.5}, {x + 2.5, y + 2.5}}}) do
      names[r.name] = (names[r.name] or 0) + 1 amt = amt + r.amount end
    local t = {} for n, c in pairs(names) do t[#t+1] = n .. ":" .. c end
    out[#out+1] = bit .. "|" .. table.concat(t, "/") .. "|" .. amt
  end
  return out end)()"""

POWER_LUA = """(function()
  local s, f, out, gen = game.surfaces[1], game.forces.player, {}, 0
  for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
    local ok, v = pcall(function() return g.energy_generated_last_tick end)
    if ok and v then gen = gen + v end
  end
  out[#out+1] = string.format("엔진 출력 (지난 틱) %.0f kW / 상한 %d kW", gen * 60 / 1000, 900 * #s.find_entities_filtered{type = "generator", force = f})
  return out end)()"""


def ore_purity(ai, st):
    ds = [e for v in st.values() for e in v if e["name"] == EMD]
    reply = ai.lua(ORE_LUA % ";".join(f"{pos(e)[0]},{pos(e)[1]}" for e in ds))
    for e, r in zip(ds, p1._rows(reply)):
        _p, kinds, amt = str(r).split("|")
        names = {k.split(":")[0] for k in kinds.split("/") if k}
        print(f"   {e['ore']:8s} ({e['x']},{e['y']}) {kinds} 합 {int(float(amt)):,}{'' if names == {e['ore']} else '  <- 섞임/없음'}")


def main() -> int:
    ap = argparse.ArgumentParser()
    for f in ("check", "snapshot", "ores", "power"):
        ap.add_argument("--" + f, action="store_true")
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    if args.snapshot:
        from client import AIBridge
        snapshot(AIBridge())
        return 0
    st = layout()
    sts = stages()
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 · p26 예약 칸 0 · 팔 집는/놓는 칸 · 레인 한 품목 · 하류 소비자 · "
                                         "기존 줄과 안 엉킴 · 전력 덮개 · 전선 7.5 모두 통과")
        n = counts(st)
        print("  수량:", n)
        nets = sorted(set().union(*pole_nets(st).values()))
        print(f"  새 전봇대 {sum(1 for v in st.values() for e in v if e['name'] == POLE)} · 이어지는 기존 망 {nets}")
        print(f"  최대 전력 {power_kw(n) / 1000:.2f} MW (새것만, 팔이 다 움직일 때)")
        tot = 0.0
        for k, v in sts.items():
            c = plates(st.get(k, []))
            tot += c.get("iron-plate", 0)
            print(f"  {k:8s} {len(v):3d}  철 {c.get('iron-plate', 0):6.1f}  구리 {c.get('copper-plate', 0):5.1f}  돌 {c.get('stone', 0):3.0f}"
                  f"  (누계 철 {tot:.0f})")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update(COST)
    p1.PAIRED.add(UG)
    p1.PARK = PARK
    ai = AIBridge()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        if nb:
            bad = p1.blocked(ai, steps)
            print(f"  {name:8s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
        else:
            spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
            print(f"  {name:8s} 치움 {len(p1.vanished(ai, steps) & spots)}/{len(spots)}")
    if args.ores:
        ore_purity(ai, st)
    if args.power:
        for r in p1._rows(ai.lua(POWER_LUA)):
            print("  ", r)
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    import p25
    os.environ[detached.ENV] = "p27"
    detached.mark(crew, "p27", minutes=180)
    try:
        p25.prep(ai, crew, sts[args.stage])          # 허브에 돌·나무 0 - 화로 돌 · 전봇대 나무를 먼저
        ok = p1.build_stage(ai, crew, sts[args.stage], args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

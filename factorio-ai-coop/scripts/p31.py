"""P5-2 for run 23: steam power +5.4MW (boilers 3 · engines 6) under the existing plant, own coal line. Design + offline check only (p28/p30 tools).

왜: p30 (로봇 블록 최대 2.69MW) + 로보포트 4 (버퍼 채울 때 대당 5MW) 면 10.8MW 망이 넘친다. 정전 = 포탑 급탄 팔이 선다 (23회차 두 번).

근거 (게임 실측 2026-09-26, tick ~11.45M):
    · 발전소: 보일러 6 (x=-36 서향, y -75.5..-60.5 맞붙임) · 엔진 12 (x -40.5 · -45.5 동향) = 10.8MW, 지금 6.9~7.2MW.
      물: 해안 펌프 (38.5,33.5) 하나 -> 관 ~180칸 -> 급수 꼭지 (-35.5,-58.5) (pass23 뒤 보통 관) -> B1 남쪽. 보일러 9 대 물 54/s << 펌프 1,200/s.
    · 보일러 한 대 1.8MW = 석탄 0.45/s (4MJ). 레시피: 보일러 = 관 4 + 돌 화로 1 · 엔진 = 철 10 + 톱니 8 + 관 5.
    · 석탄 (1시간 통계): 생산 12,172 · 소비 12,189 = 3.38/s, 남는 것 0.
      기존 보일러 벨트 x=-33.5 (남향) 를 먹이는 채굴기 6: 동쪽 줄 (-35.5, y -84.5 · -81.5 · -78.5) 11.5천 · 13.2천 · 3.9천 (-90.5 · -87.5 두 대는 다 캤다)
      + p28 coal (-41.5,-97.5) 13.9천 · (-38.5,-97.5) 1.6천 · (-37.5,-93.5) 0.6천 = 합 ~4.5만 (-> 지금 쓰는 2~3/s 로 4~6시간).
      벨트는 지금 두 레인 꽉 참 (부하 66%) 이지만 보일러가 꽉 돌면 (2.7/s) 공급 ~3/s 와 비슷 -> 새 보일러를 이 벨트에 달면 앞 여섯이 먼저 먹고 새것이 굶는다.
      비상 상자 (-31.5,-78.5) 석탄 358 (버너 팔 -> 벨트).
    · 안 캔 석탄: 구리밭 (x ≤ -53) 과 서쪽 채굴기 열 (x -43..-40) 사이 띠 x -51..-45, y -93..-76 ~25.8만. 그중 돌이 안 섞이는 칸
      (-47.5,-90.5) 65,308 · (-47.5,-87.5) 85,268 (5x5 모두 석탄). (-47.5,-93.5) 는 돌 7,183 이 섞여 뺐다 (돌이 막다른 벨트 끝을 막는다).

배치 (발전소 바로 남쪽, y -58..-50 · x -50..-36 - 북쪽 노출 0, 기존 발전소보다 남쪽 = 더 안쪽):
    단위 3 개 (가운데 y = -57 · -54 · -51, 맞붙여 물을 잇는다) - 기존과 좌우를 뒤집었다 (석탄이 서쪽에서 온다):
      석탄 벨트 NB x=-50 (남향) | 팔 (-49,y) 서쪽에서 집음 | 보일러 x -48..-47 동향 | 증기 관 (-46,y) | 엔진 x -45..-41 · -40..-36 동향
      엔진 동쪽 끝 연결 (-35,y) 은 비워 둔다 (기존 석탄 벨트 x=-34 와 한 칸 사이).
    물: 급수 꼭지 (-36,-59) 서쪽에 관 (-37,-59) -> 지하관 (-38 -> -47, y=-59, 9칸 - 기존 전봇대 (-44,-59) 밑) -> 관 (-48,-59) -> 위 보일러 북쪽 물 입구.
    석탄: 새 채굴기 2 (가운데 (-48,-91) · (-48,-88), 서향) -> NB (-50,-91) 부터 남향 -> 지하 (-87 -> -85, y=-85.5 기존 서향 벨트 밑)
          -> (-83 -> -81, y=-81.5 기존 서향 벨트 밑) -> x=-50 (기존 서쪽 석탄 벨트 x=-52 와 기존 엔진 x -48 사이 빈 줄) -> (-50,-51) 막다른 끝.
          x=-50 의 기존 엔진 서쪽 전봇대 셋 (-50, -75 · -68 · -62) 은 지하 벨트로 넘는다 (-76->-74 · -69->-67 · -63->-61) - 지하 5 쌍.
    전력: 전봇대 5 - 채굴기 (-46,-89) · 팔 (-49,-55) (-49,-52) · 엔진 서쪽 (-46,-52) · 엔진 동쪽 (-35,-54). 위 단위 서쪽 엔진은 기존 (-44,-59) 이 덮는다.
    발전 +5.4MW -> 16.2MW. 새 보일러 석탄 최대 1.35/s > 새 채굴기 1.0/s: 망 부하가 74% (12MW) 까지면 새 셋이 1.0/s 로 맞는다.
      그 이상 오래 쓰면 NB 가 비어 새 보일러가 약해진다 -> 다음: 띠 남쪽 (x -51..-49, y -81..-77) 채굴기 자리를 NB 옮겨서 더 (이 설계 밖).

단계 (스텝): clear 9 (나무) · poles 5 · coal 38 · units 15 · water 4. 모두 64 이하. 게임 can_place: 막힘은 나무 7 곳뿐 (clear 가 벤다).
재료 (--check 합, 판 환산): 철 402 · 구리 16 · 돌 15 (보일러 돌 화로 3 - 허브 돌 28 뿐, 모자라면 캐야 한다).
    손제작 큰 부품: 보일러 3 · 엔진 6 · 전기 채굴기 2 · 지하 벨트 5 쌍 · 지하관 1 쌍 · 팔 3 · 전봇대 5 · 벨트 ~28.
위험: 증기 망 전체 +5.4MW 여도 로보포트 4 대가 한꺼번에 버퍼를 채우면 20MW 가 넘는다 (여전히 한 대씩) · 기존 보일러 벨트 공급이 ~4.5만 남음 (4~6시간) - 새 줄과 별개로 기존 줄 석탄 증설이 곧 필요 · 새 보일러는 부하 74% 넘게 오래면 석탄 모자람
    · 물은 여전히 해안 펌프 하나 · 관 하나 (남동 구멍 쪽 펌프가 부서지면 9 대 모두 선다).

    python scripts/p31.py --check                    # 오프라인 확인 (SNAP · p25..p30 예약 칸 · 물/증기 이음 · 전력)
    python scripts/p31.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만: can_place) + 채굴 칸 석탄
    python scripts/p31.py --snapshot                 # 설계 둘레 기존 엔티티·나무 -> SNAP/DEBRIS/TREES (게임 읽기만)
    python scripts/p31.py --stage coal --who alpha,golf   # 짓기 (설계자는 돌리지 않았다)
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import p1    # noqa: E402
import p28   # noqa: E402  (도구: dims · tiles · pos · run · ug · arm_ends · rot · steps_of)
import p30   # noqa: E402  (도구: reserved · stages · snapshot · SNAP 해석)

N, E, S, W = 0, 4, 8, 12
VEC = p28.VEC
BELT, UG, INS, POLE, EMD = p28.BELT, p28.UG, p28.INS, p28.POLE, p28.EMD
PIPE, UGP = p28.PIPE, p28.UGP
BOILER, ENGINE = "boiler", "steam-engine"
ent, dims, tiles, pos = p28.ent, p28.dims, p28.tiles, p28.pos
POWERED = {INS, EMD}
KW = {INS: 14.7, EMD: 90}
POLE_WIRE = 7.5
COST = {**p30.COST, BOILER: {"iron-plate": 4, "stone": 5}, ENGINE: {"iron-plate": 31}}

# ---- 배치 상수 (타일. 홀수 크기는 가운데 타일, 짝수는 왼쪽 위) ----
NB_X = -50                                   # 새 석탄 벨트 (남향)
UNIT_YS = (-57, -54, -51)                    # 단위 가운데 줄
DRILLS = ((-48, -91), (-48, -88))            # 서향 -> (-50, y)
UG_ROWS = ((-87, -85), (-83, -81), (-76, -74), (-69, -67), (-63, -61))   # 기존 서향 벨트 y=-86 · -82 · 기존 전봇대 (-50, -75 · -68 · -62)
TAP = (-36, -59)                             # 기존 급수 꼭지 (보통 관)
POLES = ((-46, -89), (-49, -55), (-49, -52), (-46, -52), (-35, -54))
PARK = (-55.5, -52.5)                        # 공사 뒤 비켜 서는 곳 (빈 땅)
FLUID_JOIN = {(-37, -59): {TAP: "water"}}
# 새 관 옆의 기존 유체 설비 (게임 위치·방향): 연결 칸이 새 관을 향하지 않는지 conns 로 확인한다
OLD_FLUID = [ent("boiler", -37, -61, 12), ent("steam-engine", -46, -61, 4)]     # B1 (-36.0,-60.5) 서향 · 엔진 (-45.5,-60.5) 동향


# ------------------------------------------------------------------ 배치 (순수)

def units():
    """보일러 (동향) + 증기 관 + 엔진 둘 + 급탄 팔. 보일러는 세로로 맞붙어 물을 잇는다."""
    out = []
    for y in UNIT_YS:
        out += [ent(BOILER, -48, y, E), ent(PIPE, -46, y), ent(ENGINE, -43, y, E), ent(ENGINE, -38, y, E),
                ent(INS, NB_X + 1, y, W)]
    return out


def coal():
    """채굴기 2 -> NB (-50,-91) 남향 -> 끝 (-50,-51). 지하 5 쌍: 기존 벨트 줄 둘 · 기존 엔진 서쪽 전봇대 셋 (x=-50) 밑."""
    out = [ent(EMD, x, y, W, ore="coal") for x, y in DRILLS]
    y = DRILLS[0][1]
    for a, b in UG_ROWS:
        out += p28.run(NB_X, y, NB_X, a - 1, S) + p28.ug(NB_X, a, NB_X, b, S)
        y = b + 1
    return out + p28.run(NB_X, y, NB_X, UNIT_YS[-1], S)


def water():
    return [ent(PIPE, -37, -59), ent(UGP, -38, -59, E), ent(UGP, -47, -59, W), ent(PIPE, -48, -59)]


def poles():
    return [ent(POLE, x, y) for x, y in POLES]


PIECES = (("poles", poles), ("coal", coal), ("units", units), ("water", water))
ORDER = ("clear", "poles", "coal", "units", "water")


def layout() -> dict:
    return {k: f() for k, f in PIECES}


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p31.py --snapshot 이 찍는다 (2026-09-26). 설계 칸 ±4 (전봇대 ±12). 형식은 p28 과 같다.
SNAP = """
    D:-43,-86,-41,-84 D:-43,-89,-41,-87 D:-43,-92,-41,-90 D:-43,-95,-41,-93 D:-48,-81,-46,-79 D:-49,-85,-47,-83
    D:-56,-89,-54,-87 E:-37,-62,-36,-60 E:-37,-65,-36,-63 E:-43,-62,-39,-60 E:-43,-65,-39,-63 E:-48,-62,-44,-60
    E:-48,-65,-44,-63 E:-48,-68,-44,-66 E:-48,-71,-44,-69 E:-48,-74,-44,-72 E:-48,-77,-44,-75 P:-35,-59,-35,-59
    P:-36,-59,-36,-59 P:-38,-61,-38,-61 b:-31,-53,-31,-53:4 b:-32,-48,-32,-48:12 b:-32,-49,-32,-49:8
    b:-32,-50,-32,-50:8 b:-32,-51,-32,-51:8 b:-32,-53,-32,-53:4 b:-33,-46,-33,-46:8 b:-33,-47,-33,-47:8
    b:-33,-48,-33,-48:8 b:-33,-49,-33,-49:8 b:-33,-51,-33,-51:4 b:-33,-53,-33,-53:4 b:-34,-51,-34,-51:4
    b:-34,-52,-34,-52:8 b:-34,-53,-34,-53:8 b:-34,-55,-34,-55:8 b:-34,-56,-34,-56:8 b:-34,-57,-34,-57:8
    b:-34,-61,-34,-61:8 b:-34,-62,-34,-62:8 b:-34,-63,-34,-63:8 b:-39,-46,-39,-46:8 b:-40,-46,-40,-46:4
    b:-41,-46,-41,-46:4 b:-42,-46,-42,-46:4 b:-43,-46,-43,-46:4 b:-44,-46,-44,-46:4 b:-44,-85,-44,-85:0
    b:-44,-86,-44,-86:0 b:-44,-87,-44,-87:0 b:-44,-88,-44,-88:0 b:-44,-89,-44,-89:0 b:-44,-90,-44,-90:0
    b:-44,-91,-44,-91:0 b:-44,-92,-44,-92:0 b:-44,-93,-44,-93:0 b:-44,-94,-44,-94:0 b:-44,-95,-44,-95:12
    b:-45,-46,-45,-46:4 b:-45,-95,-45,-95:12 b:-46,-46,-46,-46:4 b:-46,-82,-46,-82:12 b:-46,-95,-46,-95:12
    b:-47,-46,-47,-46:4 b:-47,-82,-47,-82:12 b:-47,-95,-47,-95:12 b:-48,-46,-48,-46:4 b:-48,-82,-48,-82:12
    b:-48,-86,-48,-86:12 b:-48,-95,-48,-95:12 b:-49,-46,-49,-46:4 b:-49,-82,-49,-82:12 b:-49,-86,-49,-86:12
    b:-49,-95,-49,-95:12 b:-50,-46,-50,-46:4 b:-50,-82,-50,-82:12 b:-50,-86,-50,-86:12 b:-50,-95,-50,-95:12
    b:-51,-46,-51,-46:4 b:-51,-82,-51,-82:12 b:-51,-86,-51,-86:12 b:-51,-95,-51,-95:12 b:-52,-46,-52,-46:4
    b:-52,-47,-52,-47:8 b:-52,-48,-52,-48:8 b:-52,-49,-52,-49:8 b:-52,-50,-52,-50:8 b:-52,-51,-52,-51:8
    b:-52,-52,-52,-52:8 b:-52,-53,-52,-53:8 b:-52,-54,-52,-54:8 b:-52,-55,-52,-55:8 b:-52,-56,-52,-56:8
    b:-52,-57,-52,-57:8 b:-52,-58,-52,-58:8 b:-52,-59,-52,-59:8 b:-52,-60,-52,-60:8 b:-52,-61,-52,-61:8
    b:-52,-62,-52,-62:8 b:-52,-63,-52,-63:8 b:-52,-64,-52,-64:8 b:-52,-65,-52,-65:8 b:-52,-66,-52,-66:8
    b:-52,-67,-52,-67:8 b:-52,-68,-52,-68:8 b:-52,-69,-52,-69:8 b:-52,-70,-52,-70:8 b:-52,-71,-52,-71:8
    b:-52,-72,-52,-72:8 b:-52,-73,-52,-73:8 b:-52,-74,-52,-74:8 b:-52,-75,-52,-75:8 b:-52,-76,-52,-76:8
    b:-52,-77,-52,-77:8 b:-52,-78,-52,-78:8 b:-52,-79,-52,-79:8 b:-52,-80,-52,-80:8 b:-52,-81,-52,-81:8
    b:-52,-82,-52,-82:8 b:-52,-86,-52,-86:12 b:-52,-95,-52,-95:12 b:-53,-86,-53,-86:12 b:-53,-95,-53,-95:12
    b:-54,-86,-54,-86:12 b:-54,-95,-54,-95:12 i:-35,-61,-35,-61:4 i:-48,-96,-48,-96:8 i:-49,-96,-49,-96:0
    i:-51,-96,-51,-96:8 i:-52,-96,-52,-96:0 p:-28,-43,-28,-43:2 p:-30,-54,-30,-54:2 p:-31,-38,-31,-38:2
    p:-31,-47,-31,-47:2 p:-33,-43,-33,-43:2 p:-33,-71,-33,-71:2 p:-35,-62,-35,-62:2 p:-35,-66,-35,-66:2
    p:-35,-68,-35,-68:2 p:-35,-75,-35,-75:2 p:-38,-40,-38,-40:2 p:-38,-44,-38,-44:2 p:-38,-62,-38,-62:2
    p:-38,-68,-38,-68:2 p:-38,-75,-38,-75:2 p:-39,-100,-39,-100:2 p:-40,-88,-40,-88:2 p:-40,-94,-40,-94:2
    p:-43,-44,-43,-44:2 p:-44,-59,-44,-59:2 p:-44,-78,-44,-78:2 p:-45,-41,-45,-41:2 p:-46,-84,-46,-84:2
    p:-48,-47,-48,-47:2 p:-49,-38,-49,-38:2 p:-50,-62,-50,-62:2 p:-50,-68,-50,-68:2 p:-50,-75,-50,-75:2
    p:-50,-97,-50,-97:2 p:-51,-43,-51,-43:2 p:-51,-59,-51,-59:2 p:-52,-88,-52,-88:2 p:-55,-49,-55,-49:2
    p:-56,-97,-56,-97:2 p:-57,-56,-57,-56:2 p:-58,-90,-58,-90:2 p:-62,-97,-62,-97:2 s:-34,-54,-33,-54:8
    u:-34,-58,-34,-58:8:o u:-34,-60,-34,-60:8:i
"""
DEBRIS = [
]
TREES = [
    ('tree-07', -49.375, -64.375),
    ('tree-07', -47.875, -57.813),
    ('tree-07', -42.25, -57.625),
    ('tree-07', -46.063, -57.563),
    ('tree-07', -37.875, -56.25),
    ('tree-07', -39.188, -55.75),
    ('tree-07', -42.875, -55.313),
    ('tree-07', -44.438, -53.25),
    ('tree-07', -39.188, -51.0),
]

_SNAP = None


def snap():
    """p30.snap 의 해석을 이 SNAP 으로."""
    global _SNAP
    if _SNAP is None:
        saved, saved_s = p30.SNAP, p30._SNAP
        p30.SNAP, p30._SNAP = SNAP, None
        try:
            _SNAP = p30.snap()
        finally:
            p30.SNAP, p30._SNAP = saved, saved_s
    return _SNAP


_RES = None


def reserved() -> dict:
    """p25..p29 · ore23 · green23 (p30.reserved) + p30 stages() 의 build 칸."""
    global _RES
    if _RES is None:
        _RES = dict(p30.reserved())
        for name, steps in p30.stages().items():
            for k, p in steps:
                if k != "build":
                    continue
                w, h = p30.dims({"name": p["name"], "d": p.get("direction", N)})
                x0, y0 = math.floor(p["x"] - w / 2 + 0.01), math.floor(p["y"] - h / 2 + 0.01)
                for x in range(x0, x0 + w):
                    for y in range(y0, y0 + h):
                        _RES[(x, y)] = f"p30 {name} {p['name']}"
    return _RES


# ------------------------------------------------------------------ 유체 (물 · 증기)
FB = {BOILER: [((-1, 0.5), W, 1), ((1, 0.5), E, 1), ((0, -0.5), N, 2)],       # 게임 프로토타입 (북향 3x2): 물 좌우 · 증기 위
      ENGINE: [((0, 2), S, 1), ((0, -2), N, 1)]}                               # 북향 3x5: 증기 위아래
BOX_FLUID = {(BOILER, 1): "water", (BOILER, 2): "steam", (ENGINE, 1): "steam"}


def conns(e):
    d = e.get("d", N)
    if e["name"] == PIPE:
        return [((e["x"], e["y"]), k, 1, "n") for k in (N, E, S, W)]
    if e["name"] == UGP:
        return [((e["x"], e["y"]), d, 1, "n"), ((e["x"], e["y"]), (d + 8) % 16, 1, "u")]
    px, py = pos(e)
    out = []
    for rel, cd, box in FB.get(e["name"], []):
        rx, ry = p28.rot(rel, d)
        out.append(((math.floor(px + rx), math.floor(py + ry)), (cd + d) % 16, box, "n"))
    return out


def fluid_check(ents) -> list:
    """새 관·보일러·엔진 이음 · 기존 유체 칸은 FLUID_JOIN 만 · 물 망/증기 망 안 섞임 · 보일러마다 물 (꼭지) · 엔진마다 증기 (보일러)."""
    fl = [e for e in ents if e["name"] in (PIPE, UGP, BOILER, ENGINE)]
    at = {}
    for i, e in enumerate(fl):
        for t, cd, box, kind in conns(e):
            if kind == "n":
                at[(t, cd)] = (i, box)
    parent = {}

    def find(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    bad, fluid = [], {}
    sn = snap()
    old_at = {(t, cd) for o in OLD_FLUID for t, cd, _b, k in conns(o) if k == "n"}
    for i, e in enumerate(fl):
        for t, cd, box, kind in conns(e):
            node = (i, box)
            find(node)
            vx, vy = VEC[cd]
            nb = (t[0] + vx, t[1] + vy)
            if kind == "u":
                for k in range(1, 11):
                    q = (t[0] + vx * k, t[1] + vy * k)
                    hit = [j for j, f in enumerate(fl) if f["name"] == UGP and (f["x"], f["y"]) == q]
                    if hit:
                        if fl[hit[0]]["d"] == cd:
                            parent[find(node)] = find((hit[0], 1))
                        break
                else:
                    bad.append(f"지하관 {t} 에 10칸 안 짝이 없다")
                continue
            other = at.get((nb, (cd + 8) % 16))
            if other is not None:
                parent[find(node)] = find(other)
            elif sn["tiles"].get(nb) in ("P", "Q", "E"):
                if nb in FLUID_JOIN.get(t, {}):
                    fluid.setdefault(("join", t), FLUID_JOIN[t][nb])
                elif (nb, (cd + 8) % 16) in old_at:
                    bad.append(f"{e['name']} {t} 이 기존 설비 {nb} 의 연결에 이어진다")
                elif not any(nb in tiles(o) for o in OLD_FLUID):
                    bad.append(f"{e['name']} {t} 이 기존 {sn['tiles'][nb]} {nb} 에 닿는다 (FLUID_JOIN 에 없다)")
    groups = {}
    for i, e in enumerate(fl):
        for t, cd, box, kind in conns(e):
            f = BOX_FLUID.get((e["name"], box))
            if f:
                groups.setdefault(find((i, box)), set()).add(f)
            if e["name"] == PIPE and t in FLUID_JOIN:
                groups.setdefault(find((i, box)), set()).add("water+tap")
    for root, fs in groups.items():
        if len(fs - {"water+tap"}) > 1:
            bad.append(f"유체 섞임: {sorted(fs)}")
    for i, e in enumerate(fl):
        root = find((i, 1))
        if e["name"] == BOILER and "water+tap" not in groups.get(root, set()):
            bad.append(f"보일러 {pos(e)}: 물이 꼭지까지 안 이어졌다")
        if e["name"] == ENGINE and not any(fl[j]["name"] == BOILER and find((j, 2)) == root for j in range(len(fl))):
            bad.append(f"엔진 {pos(e)}: 보일러 증기에 안 이어졌다")
        if e["name"] in (PIPE, UGP) and not groups.get(root):
            bad.append(f"빈 관 {e['x'], e['y']}")
    return bad


# ------------------------------------------------------------------ 오프라인 확인

def check(st) -> list:
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, clash = p28.occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']} / {sn['tiles'][t]}" for t in occ
            if t in sn["tiles"] and sn["tiles"][t] not in ("R", "X")]
    res = reserved()
    bad += [f"예약 칸과 겹침 {t}: {occ[t]['name']} / {res[t]}" for t in occ if t in res]
    belt = p28.belt_map(ents)
    # 벨트: 채굴기 앞 칸 · 흐름이 끝까지 이어짐 · 지하 짝 · 기존 벨트와 안 엉킴
    for e in ents:
        if e["name"] == EMD:
            vx, vy = VEC[e["d"]]
            if (e["x"] + 2 * vx, e["y"] + 2 * vy) not in belt:
                bad.append(f"채굴기 {e['x'], e['y']} 앞에 벨트가 없다")
    for k, e in belt.items():
        vx, vy = VEC[e["d"]]
        nx_ = (k[0] + vx, k[1] + vy)
        if e["name"] == UG and e.get("kind") == "input":
            if not any((k[0] + vx * i, k[1] + vy * i) in belt and belt[(k[0] + vx * i, k[1] + vy * i)].get("kind") == "output"
                       for i in range(1, 6)):
                bad.append(f"지하 입구 {k} 에 짝 출구가 없다 (5칸 안)")
            continue
        if nx_ in sn["belts"]:
            bad.append(f"벨트 {k} 가 기존 벨트 {nx_} 로 흘러든다")
        if nx_ not in belt and k != (NB_X, UNIT_YS[-1]):
            bad.append(f"벨트 {k} 가 {nx_} 에서 끊긴다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        if (k[0] + vx, k[1] + vy) in belt and belt[(k[0] + vx, k[1] + vy)]["name"] == BELT:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {(k[0] + vx, k[1] + vy)} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    # 팔: NB (석탄) 에서 집어 보일러에
    for a in (e for e in ents if e["name"] == INS):
        sk, dk = p28.arm_ends(a)
        if sk not in belt:
            bad.append(f"팔 {a['x'], a['y']}: 집는 칸 {sk} 이 새 석탄 벨트가 아니다")
        if occ.get(dk, {}).get("name") != BOILER:
            bad.append(f"팔 {a['x'], a['y']}: 놓는 칸 {dk} 이 보일러가 아니다")
    for b in (e for e in ents if e["name"] == BOILER):
        if not any(p28.arm_ends(a)[1] in tiles(b) for a in ents if a["name"] == INS):
            bad.append(f"보일러 {pos(b)}: 급탄 팔 없음")
    # 전력: 팔·채굴기는 덮개 안, 엔진은 덮개가 한 칸이라도 겹쳐야 망에 전기를 보낸다
    ps = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + list(sn["poles"])
    for e in ents:
        if e["name"] in POWERED | {ENGINE} and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    old = list(sn["poles"].items())
    new = [(e["x"], e["y"]) for e in ents if e["name"] == POLE]
    label = {p: {n} for p, n in old}
    for p in new:
        label.setdefault(p, set())
    changed = True
    while changed:
        changed = False
        for p in new:
            for q, ns in label.items():
                if q != p and math.dist(p, q) <= POLE_WIRE and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    bad += [f"전봇대 {p}: 기존 망에 안 닿는다" for p in new if not label[p]]
    bad += fluid_check(ents)
    for k, v in stages().items():
        if len(v) > 64:
            bad.append(f"단계 {k}: {len(v)} 스텝 > 64")
    return bad


def clear_steps(st):
    ents = [e for v in st.values() for e in v]
    spots = {t for e in ents for t in tiles(e)} | {t for e in ents if e["name"] == INS for t in p28.arm_ends(e)}
    out = []
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        if any((tx, ty) in spots for tx in range(x1, x2 + 1) for ty in range(y1, y2 + 1)):
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 1.0}))
    for name, x, y in TREES:
        if (math.floor(x), math.floor(y)) in spots:
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 0.5}))
    return out


def stages():
    st = layout()
    out = {"clear": clear_steps(st)}
    rank = {POLE: 0, EMD: 0, BOILER: 0, ENGINE: 0, PIPE: 1, UGP: 1, INS: 2, UG: 3, BELT: 4}
    for k, v in st.items():
        out[k] = p28.steps_of(sorted(v, key=lambda e: rank.get(e["name"], 5)))
    return {k: out[k] for k in ORDER if out.get(k)}


def plates(ents):
    t = {}
    for e in ents:
        for m, k in COST.get(e["name"], {}).items():
            t[m] = t.get(m, 0) + k
    return t


def draw(st, box):
    x1, y1, x2, y2 = box
    ents = [e for v in st.values() for e in v]
    occ, _ = p28.occupancy(ents)
    sn = snap()
    ch = {BELT: None, UG: "u", INS: "i", POLE: "+", EMD: "D", PIPE: "p", UGP: "q", BOILER: "B", ENGINE: "E"}
    arrow = {N: "^", E: ">", S: "v", W: "<"}
    for y in range(y1, y2 + 1):
        row = ""
        for x in range(x1, x2 + 1):
            e = occ.get((x, y))
            if e is not None:
                c = ch.get(e["name"], "?")
                row += arrow[e["d"]] if c is None else c
            elif (x, y) in sn["tiles"]:
                row += sn["tiles"][(x, y)].lower() if sn["tiles"][(x, y)] not in ("R", "X") else "#"
            else:
                row += "."
        print(f"{y:5d} {row}")


ORE_LUA = """(function() local s, out = game.surfaces[1], {}
  for bit in string.gmatch("%s", "[^;]+") do
    local x, y = string.match(bit, "([^,]+),([^,]+)")
    x, y = tonumber(x), tonumber(y)
    local names, amt = {}, 0
    for _, r in pairs(s.find_entities_filtered{type = "resource", area = {{x - 2.4, y - 2.4}, {x + 2.4, y + 2.4}}}) do
      names[r.name] = (names[r.name] or 0) + 1 amt = amt + r.amount end
    local t = {} for n, c in pairs(names) do t[#t+1] = n .. ":" .. c end
    out[#out+1] = bit .. "|" .. table.concat(t, "/") .. "|" .. amt
  end
  return out end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    for f in ("check", "snapshot", "draw"):
        ap.add_argument("--" + f, action="store_true")
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    if args.snapshot:
        from client import AIBridge
        saved = p30.PIECES
        p30.PIECES = PIECES
        try:
            p30.snapshot(AIBridge())
        finally:
            p30.PIECES = saved
        return 0
    st = layout()
    sts = stages()
    if args.draw:
        draw(st, (-54, -94, -30, -46))
        return 0
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 · p25..p30 · ore23 · green23 예약 칸 0 · 채굴기 앞 벨트 · 벨트 끊김 0 · 지하 짝 · "
                                         "기존 줄과 안 엉킴 · 팔 (새 석탄 -> 보일러) · 전력 덮개 (엔진 포함) · 전선 7.5 · 물/증기 이음·안 섞임 · "
                                         "단계 64 스텝 이하 모두 통과")
        ents = [e for v in st.values() for e in v]
        nb_ = sum(1 for e in ents if e["name"] == BOILER)
        ne_ = sum(1 for e in ents if e["name"] == ENGINE)
        print(f"  보일러 {nb_} · 엔진 {ne_} -> +{ne_ * 0.9:.1f}MW (합 {10.8 + ne_ * 0.9:.1f}MW) · 석탄 최대 {nb_ * 0.45:.2f}/s"
              f" · 새 채굴기 {len(DRILLS)} = {len(DRILLS) * 0.5:.1f}/s · 새 소비 (팔·채굴기) {sum(KW.get(e['name'], 0) for e in ents):.0f} kW")
        tot = {}
        for k, v in sts.items():
            c = plates(st.get(k, []))
            for m, n in c.items():
                tot[m] = tot.get(m, 0) + n
            print(f"  {k:6s} {len(v):3d}  철 {c.get('iron-plate', 0):6.1f}  구리 {c.get('copper-plate', 0):5.1f}  돌 {c.get('stone', 0):3.0f}")
        print(f"  합: 철 {tot.get('iron-plate', 0):.0f} · 구리 {tot.get('copper-plate', 0):.0f} · 돌 {tot.get('stone', 0):.0f}")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update(COST)
    p1.PAIRED.update({UG, UGP})
    p1.PARK = PARK
    ai = AIBridge()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        if nb:
            bad = p1.blocked(ai, steps)
            print(f"  {name:6s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
        else:
            spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
            print(f"  {name:6s} 치움 {len(p1.vanished(ai, steps) & spots)}/{len(spots)}")
    ds = [e for e in st["coal"] if e["name"] == EMD]
    for e, r in zip(ds, p1._rows(ai.lua(ORE_LUA % ";".join(f"{pos(e)[0]},{pos(e)[1]}" for e in ds)))):
        _p, kinds, amt = str(r).split("|")
        print(f"   채굴 ({e['x']},{e['y']}) {kinds} 합 {int(float(amt)):,}{'' if kinds.split(':')[0] == 'coal' and '/' not in kinds else '  <- 섞임'}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    import p25
    os.environ[detached.ENV] = "p31"
    detached.mark(crew, "p31", minutes=120)
    try:
        p25.prep(ai, crew, sts[args.stage])          # 허브에 돌·나무 0 - 전봇대 나무 · 보일러 돌 화로 돌을 먼저
        ok = p1.build_stage(ai, crew, sts[args.stage], "p31-" + args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

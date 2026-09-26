"""P5-3 for run 23: copper +5/s (new drills 10 · steel furnaces 8) + coal back onto the boiler belt. Design + offline check only (p28/p30 tools).

(이 설계엔 유체 조립기가 없다. 규칙: 2.0 에서 유체 레시피 없는 조립기는 방향이 없어 레시피 없이 세우면 북으로 돈다
 -> 유체 조립기는 «레시피 지정 뒤 회전» - p30 EE 가 그랬다.)

근거 (게임 실측 2026-09-26, tick ~11.5M, 1시간 통계):
    · 구리판 생산 8,542 (2.37/s) · 소비 12,321 (3.42/s, 허브 재고가 메운다). 구리 광석 2.37/s = 기존 채굴기 4 대 (y=-87.5, x -63.5..-54.5,
      잔량 5.7천 · 15.8천 · 19.3천 · 30.8천 -> 몇 시간이면 마른다) -> y=-86 서향 -> x=-73 남향 (석탄 레인과 한 벨트) -> 돌 화로 8 (x -75 · -70, y -44..-38).
      판은 x=-68 · x=-78 남향 -> x=-68 은 조립기 줄 (녹색 회로 등) 을 지나 분배기 (-67,-10.5) -> y=-9 동향 (p26 구리 가지) -> 고속 팔 탭 하나 (-31,-8) 이
      X3 (p28 M, y=-7) 구리 레인에 싣는다. 탭 전에 x=-68 줄이 1~3 개/칸으로 비어 있다 (굶음) - cu23 상자가 손으로 메우는 중.
    · 구리 광맥 (반경 200 안 유일): x -79..-51, y -100..-69 합 ~47만. 기존 채굴은 y=-87.5 한 줄뿐, 그 남쪽 x -63..-55 · y -85..-71 은 빈 땅 (나무 몇).
    · 석탄: 기존 보일러 벨트 x=-34 쪽 채굴기 동쪽 줄은 잔량 9.5천 · 10.6천 (둘은 0), 동쪽 x ≥ -38 는 석탄이 없다 (칸별 실측).
      부자는 서쪽 열 (-41.5, y -93.5 · -90.5 · -87.5 · -84.5 = 4.4만 · 5.6만 · 7.7만 · 8.4만, 서향 -> x=-44 벨트 -> 벽돌 화로 · x=-65 줄) 인데
      그중 둘이 «자리 없음» 으로 쉰다 (벨트 꽉 참) = 남는 석탄.
    · 강철 ~900 · 벽돌 2,500+ -> 강철 화로 8 (강철 48 · 벽돌 80) 된다. 전력 16.2MW 에 지금 7.4MW.

설계 1 - 구리 (광맥 남쪽 빈 땅, 방어선 안 x -65..-55 · y -85..-42. 북쪽 노출 0):
    채굴: 광석 벨트 OB x=-59 남향 (y -84 .. -52), 양쪽에 채굴기 5 씩 (가운데 x -61 동향 · -57 서향, y -84 · -81 · -78 · -75 · -72) = 10 대 5.0/s.
    제련: OB 서쪽에 강철 화로 한 열 8 (x -62..-61, 위 y -70 -68 · -65 -63 · -60 -58 · -55 -52, 두 대마다 한 줄 비워 전봇대) = 0.625/s x 8 = 5.0/s.
      화로마다: 고속 팔 (-60,위) OB 에서 광석 · 긴팔 (-63,아래) 기존 x=-65 줄 (벽돌 | 석탄) 에서 석탄 (화로는 석탄만 받는다) · 팔 (-63,위) 판 -> PB.
    판 벨트 PB x=-64 남향 (y -70 .. -48) -> 지하 (-47 -> -43, 기존 광석 줄 y=-46 · 벽돌 줄 y=-44 밑) -> (-64,-42) 서향 -> (-68,-42) 기존 구리판 줄 x=-68 에
      동쪽 옆치기 (동쪽 레인). x=-68 줄은 녹색 회로 줄 -> 분배기 -> y=-9 구리 가지 -> X3 탭 으로 이미 이어져 있다 = 새 벨트 0 으로 X3 까지.
      (분배기 남쪽 출력은 이미 꽉 참 -> 넘치는 구리는 가지로 간다. 그래도 남으면 PB 가 차서 화로가 선다 - 배치형으로 안전.)
    석탄: 강철 화로 8 x 90kW = 0.18/s, x=-65 줄 (석탄 레인 꽉 참) 에서.

설계 2 - 석탄 (보일러 벨트 x=-34 에 합류):
    coal_clear (먼저, 한 번만): 새 전봇대 (-39,-87) -> 기존 전봇대 (-40,-88) 철거 · 다 캔 채굴기 (-35.5,-90.5) 철거
      · 서쪽 열 (-41.5,-87.5) (-41.5,-84.5) 철거 (7.7만 · 8.4만, 서향).
    coal: 같은 자리에 동향으로 다시 -> 떨어지는 칸 (-40,-88) (-40,-85) -> 벨트 x=-40 북향 -> (-40,-90) 동향 -> (-35,-90) -> (-34,-90) 보일러 벨트에 서쪽 옆치기.
      +1.0/s, 16만 = 44시간. 서쪽 x=-44 벨트에는 (-41.5,-93.5) (-41.5,-90.5) 둘 (1.0/s) 이 남는다 (지금 둘이 쉬고 있었다).
    ⚠ coal_clear 는 coal 뒤에 다시 돌리면 새 채굴기를 또 뜯는다 - main 이 동향 채굴기를 보면 거부한다.

전력: 새 소비 최대 ~1.66MW (채굴기 10 x 90 · 고속 팔 8 x 58.8 · 긴팔 8 x 21 · 팔 8 x 14.7) -> 7.4 + 1.7 = 9.1MW / 16.2 (56%). 석탄 쪽은 같은 채굴기 수.
단계 (스텝) · 재료는 --check 가 찍는다. 손제작 큰 부품: 전기 채굴기 10 (+ 옮기는 2 는 뜯은 것 재사용) · 강철 화로 8 · 고속 팔 8 · 긴팔 8 · 지하 벨트 1 쌍.
위험: x=-65 줄 석탄이 서쪽 열 둘을 뺀 뒤 모자라면 새 강철 화로 · 벽돌 화로 · p24 쪽이 같이 굶는다 (그 줄의 남은 공급 1.0/s vs 수요 실측 필요)
    · 기존 구리 채굴 4 대가 곧 마르면 돌 화로 8 은 서고 구리는 이 설계 5.0/s 만 남는다 (그래도 지금 2.37 의 2배)
    · X3 로 가는 길은 여전히 고속 팔 탭 하나 (~2.3/s) - X3 에서 더 필요하면 cu23 자리에 탭을 늘린다.
    · 옮기는 채굴기 둘 · 전봇대 (-40,-88) · 다 캔 채굴기는 p25 north/n_poles · p26 power 가 세운 것 - 그 스크립트를 다시 돌리면
      전봇대를 새 벨트 칸 (-40,-88) 에 다시 놓으려다 막힌다 (채굴기는 이름·자리만 봐서 «섰다» 로 넘긴다).

    python scripts/p32.py --check                    # 오프라인 확인
    python scripts/p32.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만) + 새 채굴 칸 광석
    python scripts/p32.py --snapshot                 # 설계 둘레 기존 엔티티·나무 -> SNAP/DEBRIS/TREES (게임 읽기만)
    python scripts/p32.py --stage cu_drills --who alpha,golf   # 짓기 (설계자는 돌리지 않았다)
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import p1    # noqa: E402
import p28   # noqa: E402  (도구: dims · tiles · pos · run · ug · arm_ends · belt_map · steps_of · occupancy)
import p30   # noqa: E402  (도구: reserved · stages · snapshot · SNAP 해석)
import p31   # noqa: E402  (예약 칸: p31 stages)

N, E, S, W = 0, 4, 8, 12
VEC = p28.VEC
BELT, UG, INS, FAST, LONG, POLE, EMD = p28.BELT, p28.UG, p28.INS, p28.FAST, p28.LONG, p28.POLE, p28.EMD
SFURN = p28.SFURN
ent, tiles, pos = p28.ent, p28.tiles, p28.pos
ARMS = p28.ARMS
POWERED = {INS, FAST, LONG, EMD}
KW = {INS: 14.7, FAST: 58.8, LONG: 21, EMD: 90}
POLE_WIRE = 7.5
COST = dict(p30.COST)

# ---- 배치 상수 (타일. 홀수 크기는 가운데 타일, 짝수는 왼쪽 위) ----
OB_X, PB_X = -59, -64                          # 광석 벨트 (남향) · 판 벨트 (남향)
DRILL_YS = (-84, -81, -78, -75, -72)
FURN_TOPS = (-70, -68, -65, -63, -60, -58, -55, -52)
OB_END = FURN_TOPS[-1]
PB_UG = (-47, -43)                             # 기존 y=-46 광석 줄 · y=-44 벽돌 줄 밑
SIDE_Y, CU_LINE = -42, (-68, -42)              # 기존 구리판 줄 x=-68 (남향) 에 동쪽 옆치기
COAL_SRC_X = -65                               # 기존 벽돌|석탄 줄 (남향)
CU_POLES = ((-63, -83), (-63, -77), (-63, -71), (-55, -84), (-55, -78), (-55, -72),
            (-63, -66), (-63, -61), (-63, -56), (-58, -69), (-58, -64), (-58, -59), (-58, -54))
# 석탄
COAL_DRILLS = ((-42, -88), (-42, -85))         # 서쪽 열 두 대 (가운데 타일) - 서향 -> 동향
COAL_BELT_X, COAL_ROW, BOILER_BELT = -40, -90, (-34, -90)
NEW_POLE, OLD_POLE = (-39, -87), (-40, -88)
DEAD_DRILL = (-35.5, -90.5)
PARK = (-58.5, -46.5)
# 기존 벨트에 일부러 흘려 넣는 칸: 내 벨트 -> 기존 칸
OK_FLOWS = {((-67, SIDE_Y), CU_LINE), ((-35, COAL_ROW), BOILER_BELT)}
TAPS = {(COAL_SRC_X, y): "coal" for y in range(-72, -48)}      # 긴팔이 집는 기존 줄 칸 (벽돌 | 석탄 - 화로는 석탄만)


# ------------------------------------------------------------------ 배치 (순수)

def cu_drills():
    out = [ent(EMD, OB_X - 2, y, E, ore="copper-ore") for y in DRILL_YS]
    out += [ent(EMD, OB_X + 2, y, W, ore="copper-ore") for y in DRILL_YS]
    return out + p28.run(OB_X, DRILL_YS[0], OB_X, OB_END, S)


def smelter():
    out = []
    for top in FURN_TOPS:
        out += [ent(SFURN, OB_X - 3, top, recipe="copper-plate"),
                ent(FAST, OB_X - 1, top, E),                  # OB 에서 광석
                ent(INS, OB_X - 4, top, E),                   # 판 -> PB
                ent(LONG, OB_X - 4, top + 1, W)]              # x=-65 줄에서 석탄
    return out


def plates():
    out = p28.run(PB_X, FURN_TOPS[0], PB_X, PB_UG[0] - 1, S) + p28.ug(PB_X, PB_UG[0], PB_X, PB_UG[1], S)
    return out + [ent(BELT, PB_X, SIDE_Y, W)] + p28.run(PB_X - 1, SIDE_Y, CU_LINE[0] + 1, SIDE_Y, W)


def cu_poles():
    return [ent(POLE, x, y) for x, y in CU_POLES]


def coal_clear():
    """새 전봇대 먼저 (드릴 전력 유지) -> 기존 전봇대 · 다 캔 채굴기 · 서향 채굴기 둘 철거. build 1 · demolish 4."""
    return [("build", {"name": POLE, "x": NEW_POLE[0] + 0.5, "y": NEW_POLE[1] + 0.5}),
            ("demolish", {"x": OLD_POLE[0] + 0.5, "y": OLD_POLE[1] + 0.5, "name": POLE, "search_radius": 0.4}),
            ("demolish", {"x": DEAD_DRILL[0], "y": DEAD_DRILL[1], "name": EMD, "search_radius": 0.6})] + \
           [("demolish", {"x": x + 0.5, "y": y + 0.5, "name": EMD, "search_radius": 0.6}) for x, y in COAL_DRILLS]


def coal():
    out = [ent(EMD, x, y, E, ore="coal") for x, y in COAL_DRILLS]
    out += p28.run(COAL_BELT_X, COAL_DRILLS[1][1], COAL_BELT_X, COAL_ROW + 1, N)
    return out + [ent(BELT, COAL_BELT_X, COAL_ROW, E)] + p28.run(COAL_BELT_X + 1, COAL_ROW, BOILER_BELT[0] - 1, COAL_ROW, E)


PIECES = (("cu_poles", cu_poles), ("cu_drills", cu_drills), ("smelter", smelter), ("plates", plates), ("coal", coal))
ORDER = ("clear", "cu_poles", "cu_drills", "smelter", "plates", "coal_clear", "coal")
REMOVED = {(x, y) for x, y in COAL_DRILLS} | {OLD_POLE, (-36, -91)}       # 철거하는 기존 것 (가운데 타일) - SNAP 겹침에서 뺀다


def layout() -> dict:
    return {k: f() for k, f in PIECES}


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p32.py --snapshot 이 찍는다 (2026-09-26). 설계 칸 ±4 (전봇대 ±12). 형식은 p28 과 같다.
SNAP = """
    D:-37,-80,-35,-78 D:-37,-83,-35,-81 D:-37,-86,-35,-84 D:-37,-89,-35,-87 D:-37,-92,-35,-90 D:-39,-95,-37,-93
    D:-43,-86,-41,-84 D:-43,-89,-41,-87 D:-43,-92,-41,-90 D:-43,-95,-41,-93 D:-45,-81,-43,-79 D:-48,-81,-46,-79
    D:-49,-85,-47,-83 D:-49,-89,-47,-87 D:-49,-92,-47,-90 D:-56,-89,-54,-87 D:-59,-89,-57,-87 D:-62,-89,-60,-87
    D:-65,-89,-63,-87 D:-68,-89,-66,-87 F:-71,-39,-70,-38 F:-71,-41,-70,-40 F:-71,-43,-70,-42 F:-71,-45,-70,-44
    b:-34,-86,-34,-86:8 b:-34,-87,-34,-87:8 b:-34,-88,-34,-88:8 b:-34,-89,-34,-89:8 b:-34,-90,-34,-90:8
    b:-34,-91,-34,-91:8 b:-34,-92,-34,-92:8 b:-34,-93,-34,-93:8 b:-34,-94,-34,-94:8 b:-44,-82,-44,-82:12
    b:-44,-85,-44,-85:0 b:-44,-86,-44,-86:0 b:-44,-87,-44,-87:0 b:-44,-88,-44,-88:0 b:-44,-89,-44,-89:0
    b:-44,-90,-44,-90:0 b:-44,-91,-44,-91:0 b:-44,-92,-44,-92:0 b:-44,-93,-44,-93:0 b:-44,-94,-44,-94:0
    b:-45,-82,-45,-82:12 b:-46,-82,-46,-82:12 b:-47,-82,-47,-82:12 b:-51,-82,-51,-82:12 b:-51,-86,-51,-86:12
    b:-52,-67,-52,-67:8 b:-52,-68,-52,-68:8 b:-52,-69,-52,-69:8 b:-52,-70,-52,-70:8 b:-52,-71,-52,-71:8
    b:-52,-72,-52,-72:8 b:-52,-73,-52,-73:8 b:-52,-74,-52,-74:8 b:-52,-75,-52,-75:8 b:-52,-76,-52,-76:8
    b:-52,-77,-52,-77:8 b:-52,-78,-52,-78:8 b:-52,-79,-52,-79:8 b:-52,-80,-52,-80:8 b:-52,-81,-52,-81:8
    b:-52,-82,-52,-82:8 b:-52,-86,-52,-86:12 b:-53,-86,-53,-86:12 b:-54,-86,-54,-86:12 b:-55,-86,-55,-86:12
    b:-56,-86,-56,-86:12 b:-57,-86,-57,-86:12 b:-58,-86,-58,-86:12 b:-59,-86,-59,-86:12 b:-60,-44,-60,-44:4
    b:-60,-46,-60,-46:4 b:-60,-86,-60,-86:12 b:-61,-44,-61,-44:4 b:-61,-46,-61,-46:4 b:-61,-86,-61,-86:12
    b:-62,-44,-62,-44:4 b:-62,-46,-62,-46:4 b:-62,-86,-62,-86:12 b:-63,-44,-63,-44:4 b:-63,-46,-63,-46:4
    b:-63,-86,-63,-86:12 b:-64,-44,-64,-44:4 b:-64,-46,-64,-46:4 b:-64,-86,-64,-86:12 b:-65,-44,-65,-44:4
    b:-65,-46,-65,-46:4 b:-65,-48,-65,-48:8 b:-65,-49,-65,-49:8 b:-65,-50,-65,-50:8 b:-65,-51,-65,-51:8
    b:-65,-52,-65,-52:8 b:-65,-53,-65,-53:8 b:-65,-54,-65,-54:8 b:-65,-55,-65,-55:8 b:-65,-56,-65,-56:8
    b:-65,-57,-65,-57:8 b:-65,-58,-65,-58:8 b:-65,-59,-65,-59:8 b:-65,-60,-65,-60:8 b:-65,-61,-65,-61:8
    b:-65,-62,-65,-62:8 b:-65,-63,-65,-63:8 b:-65,-64,-65,-64:8 b:-65,-65,-65,-65:8 b:-65,-66,-65,-66:8
    b:-65,-67,-65,-67:8 b:-65,-68,-65,-68:8 b:-65,-69,-65,-69:8 b:-65,-70,-65,-70:8 b:-65,-71,-65,-71:8
    b:-65,-72,-65,-72:8 b:-65,-73,-65,-73:8 b:-65,-74,-65,-74:8 b:-65,-75,-65,-75:8 b:-65,-76,-65,-76:8
    b:-65,-77,-65,-77:8 b:-65,-78,-65,-78:8 b:-65,-79,-65,-79:8 b:-65,-80,-65,-80:8 b:-65,-81,-65,-81:8
    b:-65,-82,-65,-82:8 b:-65,-83,-65,-83:8 b:-65,-84,-65,-84:8 b:-65,-86,-65,-86:12 b:-66,-46,-66,-46:4
    b:-66,-86,-66,-86:12 b:-67,-46,-67,-46:4 b:-67,-86,-67,-86:12 b:-68,-38,-68,-38:8 b:-68,-39,-68,-39:8
    b:-68,-40,-68,-40:8 b:-68,-41,-68,-41:8 b:-68,-42,-68,-42:8 b:-68,-43,-68,-43:8 b:-68,-44,-68,-44:8
    b:-68,-45,-68,-45:8 b:-68,-46,-68,-46:4 b:-69,-46,-69,-46:4 b:-70,-46,-70,-46:4 b:-71,-46,-71,-46:4
    i:-69,-39,-69,-39:12 i:-69,-41,-69,-41:12 i:-69,-43,-69,-43:12 i:-69,-45,-69,-45:12 p:-27,-88,-27,-88:2
    p:-33,-77,-33,-77:2 p:-33,-83,-33,-83:2 p:-33,-89,-33,-89:2 p:-35,-75,-35,-75:2 p:-38,-75,-38,-75:2
    p:-39,-100,-39,-100:2 p:-40,-88,-40,-88:2 p:-40,-94,-40,-94:2 p:-44,-59,-44,-59:2 p:-44,-78,-44,-78:2
    p:-46,-52,-46,-52:2 p:-46,-84,-46,-84:2 p:-46,-89,-46,-89:2 p:-48,-47,-48,-47:2 p:-49,-52,-49,-52:2
    p:-49,-55,-49,-55:2 p:-50,-62,-50,-62:2 p:-50,-68,-50,-68:2 p:-50,-75,-50,-75:2 p:-50,-97,-50,-97:2
    p:-51,-43,-51,-43:2 p:-51,-59,-51,-59:2 p:-52,-88,-52,-88:2 p:-55,-49,-55,-49:2 p:-56,-97,-56,-97:2
    p:-57,-56,-57,-56:2 p:-58,-90,-58,-90:2 p:-62,-97,-62,-97:2 p:-63,-53,-63,-53:2 p:-64,-90,-64,-90:2
    p:-66,-34,-66,-34:2 p:-67,-41,-67,-41:2 p:-69,-44,-69,-44:2 p:-70,-51,-70,-51:2 p:-72,-40,-72,-40:2
    p:-72,-44,-72,-44:2 p:-77,-44,-77,-44:2 p:-77,-51,-77,-51:2 p:-78,-48,-78,-48:2 u:-65,-45,-65,-45:8:o
    u:-65,-47,-65,-47:8:i u:-65,-85,-65,-85:8:o
"""
DEBRIS = [
]
TREES = [
    ('tree-07', -58.938, -65.875),
]

_SNAP = None


def snap():
    global _SNAP
    if _SNAP is None:
        saved, saved_s = p30.SNAP, p30._SNAP
        p30.SNAP, p30._SNAP = SNAP, None
        try:
            _SNAP = p30.snap()
        finally:
            p30.SNAP, p30._SNAP = saved, saved_s
    return _SNAP


def removed_tiles() -> set:
    out = set()
    for x, y in REMOVED:
        r = 0 if (x, y) == OLD_POLE else 1
        out |= {(x + dx, y + dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1)}
    return out


_RES = None


def reserved() -> dict:
    """p25..p30 (p31.reserved) + p31 stages() 의 build 칸."""
    global _RES
    if _RES is None:
        _RES = dict(p31.reserved())
        for name, steps in p31.stages().items():
            for k, p in steps:
                if k != "build":
                    continue
                w, h = p30.dims({"name": p["name"], "d": p.get("direction", N)})
                x0, y0 = math.floor(p["x"] - w / 2 + 0.01), math.floor(p["y"] - h / 2 + 0.01)
                for x in range(x0, x0 + w):
                    for y in range(y0, y0 + h):
                        _RES[(x, y)] = f"p31 {name} {p['name']}"
    return _RES


# ------------------------------------------------------------------ 오프라인 확인

def check(st) -> list:
    sn = snap()
    gone = removed_tiles()
    ents = [e for v in st.values() for e in v]
    occ, clash = p28.occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']} / {sn['tiles'][t]}" for t in occ
            if t in sn["tiles"] and sn["tiles"][t] not in ("R", "X") and t not in gone]
    res = reserved()
    bad += [f"예약 칸과 겹침 {t}: {occ[t]['name']} / {res[t]}" for t in occ if t in res and t not in gone]   # 철거 칸 = p25/p26 가 세운 것
    belt = p28.belt_map(ents)
    lanes = {}
    for e in ents:                                     # 채굴기 앞 칸
        if e["name"] == EMD:
            vx, vy = VEC[e["d"]]
            k = (e["x"] + 2 * vx, e["y"] + 2 * vy)
            if k not in belt:
                bad.append(f"채굴기 {e['x'], e['y']} 앞 {k} 에 벨트가 없다")
            lanes.setdefault(k, set()).add(e["ore"])
    ends = {(OB_X, OB_END)}
    for k, e in belt.items():                          # 흐름: 끝까지 이어짐 · 지하 짝 · 기존 벨트는 OK_FLOWS 만
        vx, vy = VEC[e["d"]]
        if e["name"] == UG and e.get("kind") == "input":
            if not any(belt.get((k[0] + vx * i, k[1] + vy * i), {}).get("kind") == "output" for i in range(1, 6)):
                bad.append(f"지하 입구 {k} 에 짝 출구가 없다 (5칸 안)")
            continue
        nx_ = (k[0] + vx, k[1] + vy)
        if nx_ in belt:
            continue
        if (k, nx_) in OK_FLOWS:
            if sn["belts"].get(nx_, (None, None, None))[2] != "b":
                bad.append(f"벨트 {k} -> {nx_}: 합류할 기존 벨트가 스냅숏에 없다")
            elif sn["belts"][nx_][0] in (e["d"], (e["d"] + 8) % 16):
                bad.append(f"벨트 {k} -> {nx_}: 옆치기가 아니다 (기존 방향 {sn['belts'][nx_][0]})")
        elif nx_ in sn["belts"]:
            bad.append(f"벨트 {k} 가 기존 벨트 {nx_} 로 흘러든다")
        elif k not in ends:
            bad.append(f"벨트 {k} 가 {nx_} 에서 끊긴다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        q = (k[0] + vx, k[1] + vy)
        if q in belt and belt[q]["name"] == BELT and q not in gone:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {q} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    # 팔: 화로마다 광석 (OB) · 석탄 (x=-65 줄) · 판 -> PB
    fed = {}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = p28.arm_ends(a)
        at = (a["x"], a["y"])
        src, dst = occ.get(sk), occ.get(dk)
        if src is not None and src["name"] in (BELT, UG):
            have = {"copper-ore"} if sk[0] == OB_X else set()
        elif src is not None and src["name"] == SFURN:
            have = {"copper-plate"}
        elif sk in TAPS and sn["belts"].get(sk):
            have = {TAPS[sk]}
        else:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 {src['name'] if src else sn['tiles'].get(sk, '아무것도 없음')}")
            continue
        if dst is not None and dst["name"] == SFURN:
            fed.setdefault(id(dst), set()).update(have)
        elif dst is not None and dst["name"] in (BELT, UG):
            if have != {"copper-plate"} or dk[0] != PB_X:
                bad.append(f"팔 {at}: 벨트 {dk} 에 {sorted(have)}")
        else:
            bad.append(f"팔 {at}: 놓는 칸 {dk} 에 {dst['name'] if dst else sn['tiles'].get(dk, '아무것도 없음')}")
    for f in (e for e in ents if e["name"] == SFURN):
        lack = {"copper-ore", "coal"} - fed.get(id(f), set())
        if lack:
            bad.append(f"화로 {f['x'], f['y']}: 모자람 {sorted(lack)}")
        if not any(p28.arm_ends(a)[0] in tiles(f) for a in ents if a["name"] == INS):
            bad.append(f"화로 {f['x'], f['y']}: 판 빼는 팔 없음")
    for k, ores in lanes.items():
        if len(ores) > 1:
            bad.append(f"벨트 {k} 에 광석 섞임 {ores}")
    # 전력
    new_poles = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + [NEW_POLE]
    old = {p: n for p, n in sn["poles"].items() if p != OLD_POLE}
    ps = new_poles + list(old)
    for e in ents:
        if e["name"] in POWERED and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    label = {p: {n} for p, n in old.items()}
    for p in new_poles:
        label.setdefault(p, set())
    changed = True
    while changed:
        changed = False
        for p in new_poles:
            for q, ns in label.items():
                if q != p and math.dist(p, q) <= POLE_WIRE and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    bad += [f"전봇대 {p}: 기존 망에 안 닿는다" for p in new_poles if not label[p]]
    if NEW_POLE in sn["tiles"] and NEW_POLE not in gone:
        bad.append(f"새 전봇대 {NEW_POLE} 자리에 기존 {sn['tiles'][NEW_POLE]}")
    for k, v in stages().items():
        if len(v) > 64:
            bad.append(f"단계 {k}: {len(v)} 스텝 > 64")
    return bad


def clear_steps(st):
    ents = [e for v in st.values() for e in v]
    spots = {t for e in ents for t in tiles(e)} | {t for e in ents if e["name"] in ARMS for t in p28.arm_ends(e)}
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
    out = {"clear": clear_steps(st), "coal_clear": coal_clear()}
    rank = {POLE: 0, EMD: 0, SFURN: 0, FAST: 1, LONG: 1, INS: 1, UG: 2, BELT: 3}
    for k, v in st.items():
        out[k] = p28.steps_of(sorted(v, key=lambda e: rank.get(e["name"], 5)))
    return {k: out[k] for k in ORDER if out.get(k)}


def plates_cost(ents):
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
    ch = {BELT: None, UG: "u", INS: "i", FAST: "f", LONG: "l", POLE: "+", EMD: "D", SFURN: "S"}
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
        draw(st, (-70, -86, -52, -40))
        print()
        draw(st, (-46, -96, -30, -80))
        return 0
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 (철거 칸 제외) · p25..p31 · ore23 · green23 예약 칸 0 · 채굴기 앞 벨트 · 광석 한 종 · "
                                         "벨트 끊김 0 · 지하 짝 · 기존 줄엔 옆치기 둘만 · 화로마다 광석·석탄·출력 팔 · 전력 덮개 · 전선 7.5 · "
                                         "단계 64 스텝 이하 모두 통과")
        ents = [e for v in st.values() for e in v]
        nd = sum(1 for e in ents if e["name"] == EMD and e["ore"] == "copper-ore")
        nf = sum(1 for e in ents if e["name"] == SFURN)
        print(f"  구리: 채굴기 {nd} = 광석 {nd * 0.5:.1f}/s · 강철 화로 {nf} = 판 {nf * 0.625:.2f}/s · 화로 석탄 {nf * 0.0225:.2f}/s"
              f" · 석탄: 보일러 벨트에 +{len(COAL_DRILLS) * 0.5:.1f}/s")
        print(f"  새 소비 최대 {sum(KW.get(e['name'], 0) for e in ents) / 1000:.2f} MW (석탄 채굴기 2 는 옮긴 것)")
        tot = {}
        for k, v in sts.items():
            c = plates_cost(st.get(k, []))
            for m, n in c.items():
                tot[m] = tot.get(m, 0) + n
            print(f"  {k:10s} {len(v):3d}  철 {c.get('iron-plate', 0):6.1f}  구리 {c.get('copper-plate', 0):5.1f}"
                  f"  강철 {c.get('steel-plate', 0):3.0f}  벽돌 {c.get('stone-brick', 0):3.0f}")
        print(f"  합 (석탄 채굴기 2 는 뜯은 것 재사용 - 빼면 철 -46 · 구리 -9): 철 {tot.get('iron-plate', 0):.0f} · 구리 {tot.get('copper-plate', 0):.0f}"
              f" · 강철 {tot.get('steel-plate', 0):.0f} · 벽돌 {tot.get('stone-brick', 0):.0f}")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update(COST)
    p1.PAIRED.update({UG})
    p1.PARK = PARK
    ai = AIBridge()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        spots = {(p['x'], p['y']) for k, p in steps if k in ('take', 'demolish')}
        bad = p1.blocked(ai, steps) if nb else []
        print(f"  {name:10s} {len(p1.standing(ai, steps))}/{nb}" + (f" · 치움 {len(p1.vanished(ai, steps) & spots)}/{len(spots)}" if spots else "")
              + f" · 막힘 {len(bad)} {bad[:4]}")
    east = p1._rows(ai.lua("""(function() local s, o = game.surfaces[1], {}
      for _, p in pairs({%s}) do local d = s.find_entity("electric-mining-drill", p)
        o[#o+1] = d and tostring(d.direction) or "-" end return o end)()""" % ",".join(
        f"{{{x + 0.5},{y + 0.5}}}" for x, y in COAL_DRILLS)))
    print(f"   석탄 서쪽 열 두 대 방향 (12 = 아직 서향 · 4 = 옮김 끝): {east}")
    ds = [e for e in st["cu_drills"] if e["name"] == EMD] + [e for e in st["coal"] if e["name"] == EMD]
    for e, r in zip(ds, p1._rows(ai.lua(p31.ORE_LUA % ";".join(f"{pos(e)[0]},{pos(e)[1]}" for e in ds)))):
        _p, kinds, amt = str(r).split("|")
        ok = kinds and "/" not in kinds and kinds.split(":")[0] == e["ore"]
        print(f"   채굴 ({e['x']},{e['y']}) {kinds} 합 {int(float(amt)):,}{'' if ok else '  <- 섞임/다름'}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    if args.stage == "coal_clear" and "4" in [str(v) for v in east]:
        print("coal_clear 거부: 서쪽 열 채굴기가 이미 동향이다 (coal 뒤에 다시 돌리면 새 채굴기를 뜯는다)")
        return 2
    import p25
    os.environ[detached.ENV] = "p32"
    detached.mark(crew, "p32", minutes=120)
    try:
        p25.prep(ai, crew, sts[args.stage])
        ok = p1.build_stage(ai, crew, sts[args.stage], "p32-" + args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

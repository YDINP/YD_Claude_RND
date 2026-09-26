"""P4-7 for run 23: north + east turret lines fed by an ammo belt. Design + offline check only (ammo23 방식, p28 도구).

왜 (게임 실측 2026-09-26, tick 10.35M, 진화 0.507):
    · 북쪽 공습 (tick ~10.09M): 북쪽 포탑 0 -> 보일러 3 · 엔진 6 · 채굴기 17 잃음. 지금 북쪽 줄 y=-108 은 손 탄창 임시 포탑 14 대
      (x -106..-4, 비는 자리 -94 -76 -64 -58).
    · 적 (spawner, 750칸 안): 북 (-69,-277) 둥지 2 · 중형 웜 4 / 북동 (45..67, -205..-182) 둥지 5 · **대형 웜** (63,-200) · 중형 웜 /
      서 (-318,-178) 둥지 2 / 북서 (-256,-354) 둥지 2 / 더 북쪽 (-47,-434) · (-340,-428). 대형 웜 사거리 38 > 포탑 18 -> 밀지 않고 고정 줄.
    · 공해원 기계 165 중 포탑 18칸 안 34 뿐 (서·남 줄 곁). 동쪽엔 줄이 없다 - p28 블록 (x -12..37, y -56..-15) 과
      보일러 물 관 (x=38 y -59..33 · 해안 펌프 (37,33)) 이 북동 둥지 쪽으로 열려 있다.

배치 (포탑 간격 6, 팔 방향 = 집는 쪽 N0 E4 S8 W12, 작은 전봇대는 팔 옆 칸 - ammo23 과 같은 꼴):
    북쪽 줄 N  y=-108, x -106..38 (25 대, 기존 14 자리 그대로)   팔 (x-1,-107) S  · 전봇대 (x,-107) · 탄 벨트 y=-106 동향
    서북 다리 W x=-110, y -102..-72 (6 대)                         팔 (-109,y-1) E · 전봇대 (-109,y+1) · 탄 벨트 x=-108 북향
               - 북쪽 줄 서쪽 끝과 서북 포탑 (-118/-124, -49/-44) 사이 (y -90..-67) 가 비어 서쪽 둥지 직선이 p27 화로·석탄 채굴기에 닿았다.
    동쪽 줄 E  x=44, y -102..24 (22 대)                              팔 (42,y-1) W  · 전봇대 (42,y+1) · 탄 벨트 x=41 남향
               - p28 블록 동쪽 (x 37) 과 물 관 (x=38) 밖. 끝 (44,24) 은 해안 펌프 (37,33) 를 덮고 호수 북쪽 끝 (58,24) 까지 14 - 줄 + 호수로 동쪽이 닫힌다.
               (북·북동 둥지 직선만 보면 북쪽 줄 (x ..38) 로 충분하다 - 동쪽 줄은 줄 끝을 돌아 동쪽에서 오는 무리용, --check 는 x=200 탐침으로 본다)
    탄약 조립기 AM (-88,-68) 1 대 (1형, firearm-magazine) <- 고속 팔 (-88,-66) 이 p27 북쪽 판 줄 (-88,-65) 에서 집는다
               - 북쪽 화로 8 이 다 지난 칸 (2.5/s). 줄 머리 쪽 (x -99) 에서 집으면 위쪽 화로 3 (~0.9/s) 뿐이라 탄 속도가 반이 된다.
    탄 벨트 한 줄 (분배기 0): 출력 팔 (-88,-70) S -> y=-71 서향 -> 지하 (-103 -> -105, p27 석탄 줄 x=-104 밑) -> x=-108 북향
               (서북 다리) -> y=-106 동향 (북쪽 줄) -> x=41 남향 (동쪽 줄) -> (41,23) 막다른 끝. 333칸.
    기존 벨트를 걷는 칸 0 · 기존 벨트 위 분배기/지하 0 (build_stage 가 못 하는 칸 없음) · 철거 단계 0. 막힘은 나무뿐 (build_stage 가 벤다).
    임시 손 탄창 포탑 (4..40, -62) 4 대 (hotel delta) 는 설계 밖 - 동쪽 줄이 서면 걷어 재사용해도 된다 (예약 칸 겹침 0).

탄 속도 (게임 통계, 10시간): 탄창 소비 2,322 + 관통탄 1,705 = 0.11/s - 밀기 (포탑 열 수십 대) 까지 합친 값.
    조립기 1형 탄창 = 1초 / 속도 0.5 = 0.5/s (철 2/s) -> 1 대로 평균의 4.5 배. 고속 팔 벨트->기계 ~2.3/s >= 2 · 판 줄 2.5/s >= 2.
    한 포탑이 쏘는 속도 10발/s x 사속 1.5 = 탄창 1.5/s > 팔 0.83/s -> 싸움은 포탑 안 10 + 벨트 레인이 버틴다.
    버퍼 (처음 채우기): 포탑 53 x 10 + 벨트 한 레인 333 x 4 = ~1,860 탄창 = 철 ~7,400, 1 대로 ~60분 (p27 북쪽 화로 몫 2.5/s 중 2).
    2 대면 30분이지만 판 줄 하나 (2.5/s) 로는 못 먹이고 평소엔 둘 다 역압으로 선다 -> 1 대 + 포탑을 세우면 ammo_run 으로 손 탄창 먼저.
    관통탄 (탄창 1 + 강철 1 + 구리 5) 은 강철이 모자라 일반 탄창. 진화 0.5 부터 대형 바이터 (375hp, 저항 8/10%) 가 섞이면
    일반 탄 한 발 ~1.6 (관통탄 ~6.9) -> 대형이 오기 시작하면 이 조립기를 관통탄으로 바꾸는 것이 다음 (강철·구리 입력 필요).

덮개 (--cover, 게임 2026-09-26): 둥지 -> 기계 직선이 벨트 급탄 포탑 18칸을 안 지나는 공해원 기계
    지금 131/165 (북쪽 둥지에서 73) -> p29 뒤 127 (북쪽 1 = 유전 탄약 조립기, 서·동 0) · p28 뒤 153/201 (북쪽 1).
    남은 것은 모두 남쪽 둥지 (120..165, 420..545) · (-264,510) · (-238,272) 에서 **남동 구멍** (남쪽 줄 끝 x=-68 ~ 호수 x≈37, y≈52) 으로.
    남쪽 줄 y=52 를 x -62..34 로 17 대 늘리면 153 -> 3 (유전 것만) - 다음 설계 (y=54.5 탄 벨트 연장, 회랑 x=-15 는 지하).

    python scripts/p29.py --check                    # 오프라인 확인 (SNAP · p25..p28 예약 영역 · 사거리 덮개)
    python scripts/p29.py                            # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만)
    python scripts/p29.py --cover                    # 공해원 기계 덮개 - 지금 / p29 뒤 x p28 전 / 후 (게임 읽기만)
    python scripts/p29.py --snapshot                 # 설계 둘레 기존 엔티티·바위 -> SNAP/DEBRIS · 포탑·둥지 -> TURRETS/NESTS (게임 읽기만)
    python scripts/p29.py --stage turrets_n --who hotel,delta   # 짓기 (설계자는 돌리지 않았다)
    python scripts/p29.py --recipes --who golf       # 탄약 조립기 레시피 (ammo 단계 뒤)
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import p1    # noqa: E402
import p28   # noqa: E402  (도구: dims · tiles · pos · occupancy · arm_ends · trace · steps_of · reserved · SNAP_LUA)

N, E, S, W = 0, 4, 8, 12
VEC = p28.VEC
BELT, UG, INS, FAST, POLE, AM = p28.BELT, p28.UG, p28.INS, p28.FAST, p28.POLE, p28.AM
GUN, MAG = "gun-turret", "firearm-magazine"
ent, run, ug, dims, tiles, pos = p28.ent, p28.run, p28.ug, p28.dims, p28.tiles, p28.pos
ARMS = p28.ARMS
POWERED = {INS, FAST, AM}
KW = {INS: 14.7, FAST: 58.8, AM: 77.5}
RANGE = 18.0                                    # 포탑 사거리
POLE_WIRE = 7.5

# ---- 배치 상수 (포탑 X,Y 는 게임 가운데 좌표 = 정수. 2x2 왼쪽 위 타일은 (X-1, Y-1)) ----------------
N_Y, N_XS = -108, list(range(-106, 39, 6))      # 북쪽 줄 (25)
W_X, W_YS = -110, list(range(-102, -71, 6))     # 서북 다리 (6)
E_X, E_YS = 44, list(range(-102, 25, 6))        # 동쪽 줄 (22)
BELT_N, BELT_W, BELT_E = -106, -108, 41         # 탄 벨트: 북 (동향) · 서 (북향) · 동 (남향)
AM_C = (-88, -68)                               # 탄약 조립기 가운데 타일
TAP = (-88, -66)                                # 고속 팔 <- p27 북쪽 판 줄 (-88,-65): 북쪽 화로 8 이 다 지난 칸 (2.5/s)
OUT_ARM, FEED_Y = (-88, -70), -71               # 출력 팔 -> y=-71 서향 (남쪽 옆에서 놓는다)
AM_POLE = (-86, -68)                            # 탭·출력 팔·조립기를 한 대로 (기존 (-91,-66) 은 탭 칸에 안 닿는다)
UG_IN, UG_OUT = -103, -105                      # p27 석탄 줄 x=-104 밑
PARK = (-58.5, -78.5)                           # 공사 뒤 비켜 서는 곳 (발전소 서쪽 빈 땅)
# 동쪽은 둥지가 아니라 «탐침» 으로 본다: 동쪽 (x=200) 에서 곧장 오는 직선도 포탑 사거리를 지나야 한다 (북쪽 줄만으로는 안 된다)
EAST_PROBES = [(200.0, float(y)) for y in (-100, -75, -50, -25, 0, 20)]
FED_BOXES = [((-125, -50), (-115, 51)), ((-111, 51), (-67, 53)), ((-92, 360), (-60, 401))]
LAKE_TIP = (58.0, 24.0)                         # 호수 북쪽 끝 (게임 타일: y=24 에 x 58..59, y=29 부터 x 52..63) - 그 남쪽은 물
TAPS = {(-88, -65): "iron-plate"}               # 기존 판 줄 칸 (p27 북쪽 판 줄 y=-65 동향, 두 레인 철)
p28.RECIPE.setdefault(MAG, ({"iron-plate"}, MAG))   # p28.trace · made 가 탄약 조립기를 알게


def turret(X, Y):
    return ent(GUN, X - 1, Y - 1)


# ------------------------------------------------------------------ 배치 (순수)

def turrets_n():
    return [turret(x, N_Y) for x in N_XS]


def turrets_w():
    return [turret(W_X, y) for y in W_YS]


def turrets_e():
    return [turret(E_X, y) for y in E_YS]


def ins():
    """포탑마다 팔 하나: 벨트 쪽을 집어 포탑 칸에 놓는다."""
    out = [ent(INS, x - 1, N_Y + 1, S) for x in N_XS]
    out += [ent(INS, W_X + 1, y - 1, E) for y in W_YS]
    out += [ent(INS, E_X - 2, y - 1, W) for y in E_YS]
    return out


def poles():
    """팔 옆 칸 (공급 ±2.5 가 팔 칸과 겹친다). 줄 사이 전선 6 - 모서리 둘은 6.7 · 7.2."""
    out = [ent(POLE, x, N_Y + 1) for x in N_XS]
    out += [ent(POLE, W_X + 1, y + 1) for y in W_YS]
    out += [ent(POLE, E_X - 2, y + 1) for y in E_YS]
    return out


def ammo():
    """탄약 조립기 + 고속 팔 (판 줄 탭) + 출력 팔 + 전봇대."""
    return [ent(AM, *AM_C, recipe=MAG), ent(FAST, *TAP, S), ent(INS, *OUT_ARM, S), ent(POLE, *AM_POLE)]


def belts():
    """출력 -> 서 -> 지하 (석탄 줄 밑) -> 서북 다리 북향 -> 북쪽 줄 동향 -> 동쪽 줄 남향 -> 막다른 끝."""
    out = run(OUT_ARM[0], FEED_Y, UG_IN + 1, FEED_Y, W) + ug(UG_IN, FEED_Y, UG_OUT, FEED_Y, W)
    out += run(UG_OUT - 1, FEED_Y, BELT_W + 1, FEED_Y, W) + [ent(BELT, BELT_W, FEED_Y, N)]
    out += run(BELT_W, FEED_Y - 1, BELT_W, BELT_N + 1, N) + [ent(BELT, BELT_W, BELT_N, E)]
    out += run(BELT_W + 1, BELT_N, BELT_E - 1, BELT_N, E) + [ent(BELT, BELT_E, BELT_N, S)]
    out += run(BELT_E, BELT_N + 1, BELT_E, E_YS[-1] - 1, S)
    return out


PIECES = (("turrets_n", turrets_n), ("turrets_w", turrets_w), ("turrets_e", turrets_e), ("poles", poles),
          ("ins", ins), ("ammo", ammo), ("belts", belts))
ORDER = [k for k, _ in PIECES]          # 포탑 먼저 (손 탄창으로 임시로라도 막는다) -> 전봇대 -> 팔 -> 조립기 -> 벨트


def layout() -> dict:
    return {k: f() for k, f in PIECES}


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p29.py --snapshot 이 찍는다. 설계 칸 ±4 (전봇대는 ±12). 형식은 p28 과 같다 (G = 포탑).
SNAP = """
    D:-103,-103,-101,-101 F:-89,-63,-88,-62 F:-91,-63,-90,-62 F:-93,-63,-92,-62 G:-101,-109,-100,-108
    G:-107,-109,-106,-108 G:-11,-109,-10,-108 G:-17,-109,-16,-108 G:-23,-109,-22,-108 G:-29,-109,-28,-108
    G:-35,-109,-34,-108 G:-41,-109,-40,-108 G:-47,-109,-46,-108 G:-5,-109,-4,-108 G:-53,-109,-52,-108
    G:-71,-109,-70,-108 G:-83,-109,-82,-108 G:-89,-109,-88,-108 G:39,-63,40,-62 P:37,-59,37,-59 P:38,-1,38,-1
    P:38,-11,38,-11 P:38,-12,38,-12 P:38,-22,38,-22 P:38,-23,38,-23 P:38,-33,38,-33 P:38,-34,38,-34 P:38,-44,38,-44
    P:38,-45,38,-45 P:38,-55,38,-55 P:38,-56,38,-56 P:38,-57,38,-57 P:38,-58,38,-58 P:38,-59,38,-59 P:38,0,38,0
    P:38,10,38,10 P:38,11,38,11 P:38,21,38,21 P:38,22,38,22 R:-83,-114,-82,-112 b:-104,-100,-104,-100:8
    b:-104,-101,-104,-101:8 b:-104,-102,-104,-102:8 b:-104,-67,-104,-67:8 b:-104,-68,-104,-68:8 b:-104,-69,-104,-69:8
    b:-104,-70,-104,-70:8 b:-104,-71,-104,-71:8 b:-104,-72,-104,-72:8 b:-104,-73,-104,-73:8 b:-104,-74,-104,-74:8
    b:-104,-75,-104,-75:8 b:-104,-76,-104,-76:8 b:-104,-77,-104,-77:8 b:-104,-78,-104,-78:8 b:-104,-79,-104,-79:8
    b:-104,-80,-104,-80:8 b:-104,-81,-104,-81:8 b:-104,-82,-104,-82:8 b:-104,-83,-104,-83:8 b:-104,-84,-104,-84:8
    b:-104,-85,-104,-85:8 b:-104,-86,-104,-86:8 b:-104,-87,-104,-87:8 b:-104,-88,-104,-88:8 b:-104,-89,-104,-89:8
    b:-104,-90,-104,-90:8 b:-104,-91,-104,-91:8 b:-104,-92,-104,-92:8 b:-104,-93,-104,-93:8 b:-104,-94,-104,-94:8
    b:-104,-95,-104,-95:8 b:-104,-96,-104,-96:8 b:-104,-97,-104,-97:8 b:-104,-98,-104,-98:8 b:-104,-99,-104,-99:8
    b:-86,-61,-86,-61:8 b:-86,-62,-86,-62:8 b:-86,-63,-86,-63:8 b:-86,-64,-86,-64:8 b:-86,-65,-86,-65:8
    b:-87,-65,-87,-65:4 b:-88,-65,-88,-65:4 b:-89,-65,-89,-65:4 b:-90,-65,-90,-65:4 b:-91,-65,-91,-65:4
    b:-92,-65,-92,-65:4 b:-93,-65,-93,-65:4 i:-89,-61,-89,-61:8 i:-89,-64,-89,-64:8 i:-91,-61,-91,-61:8
    i:-91,-64,-91,-64:8 i:-93,-64,-93,-64:8 p:-100,-56,-100,-56:2 p:-100,-64,-100,-64:2 p:-102,-100,-102,-100:2
    p:-102,-59,-102,-59:2 p:-105,-62,-105,-62:2 p:-105,-69,-105,-69:2 p:-105,-76,-105,-76:2 p:-105,-82,-105,-82:2
    p:-105,-89,-105,-89:2 p:-105,-96,-105,-96:2 p:-39,-100,-39,-100:2 p:-40,-94,-40,-94:2 p:-50,-97,-50,-97:2
    p:-56,-97,-56,-97:2 p:-62,-97,-62,-97:2 p:-88,-59,-88,-59:2 p:-91,-66,-91,-66:2 p:-92,-59,-92,-59:2
    p:-94,-59,-94,-59:2 p:-97,-66,-97,-66:2 p:-98,-61,-98,-61:2
"""
DEBRIS = [
    ('big-rock', -82.0, -112.5, -83, -114, -82, -112),
]
TREES = [
    ('tree-07', -94.0, -108.938),
    ('tree-07', -63.125, -108.313),
    ('tree-07', -76.5, -107.938),
    ('tree-07', -58.438, -107.875),
    ('tree-07', -69.188, -106.625),
    ('tree-07', -70.75, -106.188),
    ('tree-07', -76.563, -106.125),
    ('tree-07', -74.438, -105.813),
    ('tree-07', -62.063, -105.75),
    ('tree-07', -81.813, -105.375),
    ('tree-02', 44.125, -53.563),
    ('tree-02', 41.375, -48.563),
    ('tree-02', 43.563, -47.813),
    ('tree-02', 41.25, -43.0),
]
# 게임의 포탑 (설계 밖 것 포함 - 사거리 덮개 계산용) · 적 둥지 (spawner, 기지 750칸 안) - 2026-09-26 tick 10.35M
TURRETS = [(-288, -77), (-286, -81), (-286, -79), (-268, -324), (-246, -329), (-124, -49), (-124, -44), (-118, -49), (-118, -44), (-116, -34), (-116, -28), (-116, -22), (-116, -16), (-116, -10), (-116, -4), (-116, 2), (-116, 8), (-116, 14), (-116, 20), (-116, 26), (-116, 32), (-116, 38), (-116, 44), (-116, 50), (-110, 52), (-106, -108), (-104, 52), (-100, -108), (-98, 52), (-92, 52), (-91, 362), (-91, 368), (-91, 374), (-91, 380), (-91, 386), (-91, 392), (-88, -108), (-86, 52), (-85, 400), (-83, 52), (-82, -108), (-80, 52), (-79, 400), (-77, 52), (-74, 52), (-73, 400), (-71, 52), (-70, -108), (-68, 52), (-67, 400), (-61, 400), (-52, -108), (-46, -108), (-40, -108), (-34, -108), (-28, -108), (-22, -108), (-16, -108), (-10, -108), (-4, -108), (4, -62), (16, -62), (28, -62), (40, -62)]
NESTS = [(-623.5, -11.5), (-621.5, -120.5), (-599.5, 106.5), (-598.5, 99.5), (-597.5, 112.5), (-591.5, 109.5), (-585.5, 206.5), (-568.5, 311.5), (-567.5, -262.5), (-566.5, 326.5), (-554.5, -257.5), (-543.5, -49.5), (-519.5, 489.5), (-509.5, -569.5), (-509.5, 472.5), (-464.5, 321.5), (-461.5, 331.5), (-460.5, -231.5), (-458.5, -247.5), (-458.5, 313.5), (-447.5, -243.5), (-447.5, 315.5), (-435.5, 48.5), (-418.5, -528.5), (-413.5, -522.5), (-381.5, 191.5), (-380.5, 478.5), (-374.5, 460.5), (-353.5, 368.5), (-350.5, 357.5), (-343.5, -429.5), (-342.5, -438.5), (-340.5, -418.5), (-336.5, -424.5), (-324.5, -173.5), (-311.5, -182.5), (-264.5, 509.5), (-263.5, 524.5), (-259.5, -353.5), (-252.5, -353.5), (-241.5, 276.5), (-234.5, 267.5), (-102.5, 553.5), (-94.5, 534.5), (-69.5, -276.5), (-68.5, -284.5), (-49.5, -426.5), (-44.5, -442.5), (45.5, -199.5), (50.5, -632.5), (54.5, -204.5), (56.5, -633.5), (60.5, -644.5), (61.5, -191.5), (62.5, -205.5), (63.5, -633.5), (66.5, -182.5), (69.5, -641.5), (120.5, 525.5), (129.5, 531.5), (135.5, 530.5), (142.5, 521.5), (144.5, 543.5), (155.5, 425.5), (157.5, 437.5), (165.5, 434.5), (366.5, 376.5), (368.5, 361.5), (370.5, 369.5)]

_SNAP = None


def snap():
    """SNAP 글자 -> {tiles, belts, arms, poles} (p28.snap 과 같은 해석)."""
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


_RES = None


def reserved() -> dict:
    """p25 · p26 · p27 (p28.reserved) + p28 stages() 의 build 칸 -> 이름."""
    global _RES
    if _RES is None:
        _RES = dict(p28.reserved())
        for name, steps in p28.stages().items():
            for k, p in steps:
                if k != "build":
                    continue
                w, h = dims({"name": p["name"], "d": p.get("direction", N)})
                x0, y0 = math.floor(p["x"] - w / 2 + 0.01), math.floor(p["y"] - h / 2 + 0.01)
                for x in range(x0, x0 + w):
                    for y in range(y0, y0 + h):
                        _RES[(x, y)] = f"p28 {name} {p['name']}"
    return _RES


def standing_already(e) -> bool:
    """기존 포탑 자리 그대로 (북쪽 임시 줄 14 대) - 겹침이 아니라 «이미 섰다»."""
    sn = snap()["tiles"]
    return e["name"] == GUN and all(sn.get(t) == "G" for t in tiles(e))


# ------------------------------------------------------------------ 사거리 덮개 (순수)

def seg_dist(p, a, b) -> float:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
    return math.dist(p, (ax + t * dx, ay + t * dy))


def shielded(m, nest, guns) -> bool:
    """둥지 -> 기계 직선이 어느 포탑의 사거리 (18) 를 지나는가 (공격대는 대체로 곧장 온다)."""
    return any(seg_dist(g, nest, m) <= RANGE for g in guns)


def cover_report(machines, guns, nests) -> dict:
    """{'near': 18칸 안에 포탑 없는 기계, 'open': 어떤 둥지에서든 직선이 포탑 사거리를 안 지나는 기계 -> 둥지들}."""
    near = [m for m in machines if not any(math.dist(m[1:], g) <= RANGE for g in guns)]
    opened = {}
    for m in near:                                   # 18칸 안에 포탑이 있으면 직선도 그 사거리에서 끝난다
        bad = [n for n in nests if not shielded(m[1:], n, guns)]
        if bad:
            opened[m] = bad
    return {"near": near, "open": opened}


def gun_positions(st) -> list:
    return [pos(e) for v in st.values() for e in v if e["name"] == GUN]


# ------------------------------------------------------------------ 오프라인 확인

def _trace(st):
    """p28.trace 를 이 설계의 탭으로 (레인 한 품목 · 지하 짝 · 옆치기). p28.TAPS 는 잠깐 바꿨다 되돌린다."""
    saved = dict(p28.TAPS)
    p28.TAPS.clear()
    p28.TAPS.update(TAPS)
    try:
        return p28.trace(st)
    finally:
        p28.TAPS.clear()
        p28.TAPS.update(saved)


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
                if q != p and math.dist(p, q) <= POLE_WIRE and not ns <= label[p]:
                    label[p] |= ns
                    changed = True
    return {p: label[p] for p in new}


def check(st) -> list:
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, clash = p28.occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    deb = {}
    for name, x, y, x1, y1, x2, y2 in DEBRIS:
        for tx in range(x1, x2 + 1):
            for ty in range(y1, y2 + 1):
                deb[(tx, ty)] = name
    already = {id(e) for e in ents if standing_already(e)}
    for t, e in occ.items():
        k = sn["tiles"].get(t)
        if k is None or id(e) in already:
            continue
        if k in ("R", "X"):
            if t not in deb:
                bad.append(f"바위·잔해 {t} 가 DEBRIS 에 없다")
            continue
        bad.append(f"기존 것과 겹침 {t}: {e['name']} / {k}" + (" (기존 벨트 위 - build_stage 가 못 한다)" if k in ("b", "u", "s") else ""))
    res = reserved()
    bad += [f"예약 칸과 겹침 {t}: {occ[t]['name']} / {res[t]}" for t in occ if t in res]
    lanes, probs = _trace(st)
    bad += probs
    belt = p28.belt_map(ents)
    fed = {}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = p28.arm_ends(a)
        at = (a["x"], a["y"])
        if dk in res:
            bad.append(f"팔 {at} 이 예약 칸 {dk} ({res[dk]}) 에 놓는다")
        if sk in res and sk not in TAPS:
            bad.append(f"팔 {at} 이 예약 칸 {sk} ({res[sk]}) 에서 집는다 (TAPS 에 없다)")
        src = occ.get(sk)
        if src is not None:
            have = (lanes[sk]["L"] | lanes[sk]["R"]) if src["name"] in p28.BELTS else {p28.made(src)} - {None}
        elif sk in TAPS:
            have = {TAPS[sk]}
            if sn["belts"].get(sk) is None:
                bad.append(f"팔 {at}: 탭 {sk} 에 스냅숏상 기존 벨트가 없다 ({sn['tiles'].get(sk)})")
        else:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 {sn['tiles'].get(sk, '아무것도 없음')}")
            continue
        dst = occ.get(dk)
        if dst is None:
            bad.append(f"팔 {at}: 놓는 칸 {dk} 에 {sn['tiles'].get(dk, '아무것도 없음')}")
            continue
        if dst["name"] == GUN:
            if have != {MAG}:
                bad.append(f"팔 {at}: 포탑에 줄 것이 {sorted(have) or '없음'} (탄창이어야)")
            fed[id(dst)] = True
        elif dst["name"] == AM:
            if not have & {"iron-plate"}:
                bad.append(f"팔 {at}: 탄약 조립기에 철이 안 온다 ({sorted(have)})")
            fed[id(dst)] = True
        elif dst["name"] in p28.BELTS:
            if not have:
                bad.append(f"팔 {at}: 집는 칸 {sk} 에 아무것도 안 온다")
        else:
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for e in ents:
        if e["name"] in (GUN, AM) and id(e) not in fed:
            bad.append(f"급탄 없음 {e['name']} {pos(e)}")
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
        if (k[0] + vx, k[1] + vy) in belt:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {(k[0] + vx, k[1] + vy)} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    ps = [(e["x"], e["y"]) for e in ents if e["name"] == POLE] + list(sn["poles"])
    for e in ents:                                 # 작은 전봇대 공급 ±2.5 (가운데 기준) 가 기계 칸과 «겹쳐야» 한다
        if e["name"] in POWERED and not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    for p, ns in pole_nets(st).items():
        if not ns:
            bad.append(f"전봇대 {p}: 기존 망에 안 닿는다 ({POLE_WIRE})")
    bad += cover_check(st)
    return bad


def fed(t) -> bool:
    """벨트로 급탄되는 기존 포탑만 덮개로 센다 (손 탄창 포탑은 마른다): 서쪽 줄 + 서북 4 · 남쪽 줄 (ammo23) · 유전 (p26)."""
    return any(x1 <= t[0] <= x2 and y1 <= t[1] <= y2 for (x1, y1), (x2, y2) in FED_BOXES)


def cover_check(st) -> list:
    """사거리 덮개: (1) 줄마다 이웃 포탑 사이 <= 6 (구멍 0) · (2) 북·북동·북서·서 둥지 (y < -150) 와 동쪽 탐침 (x=200) 에서
    p28 공해원 기계 · 해안 펌프 · 물 관 모서리 · p27 로 오는 직선이 모두 포탑 18칸을 지난다 (TURRETS + 설계)
    · (3) 동쪽 줄 끝이 호수 북쪽 끝에서 18 안 (줄 + 호수로 동쪽이 닫힌다)."""
    bad = []
    for name, pts in (("북쪽 줄", [(x, N_Y) for x in N_XS]), ("서북 다리", [(W_X, y) for y in W_YS]),
                      ("동쪽 줄", [(E_X, y) for y in E_YS])):
        for a, b in zip(pts, pts[1:]):
            if math.dist(a, b) > 6:
                bad.append(f"{name} 구멍 {a} - {b}")
    guns = sorted({tuple(t) for t in TURRETS if fed(t)} | set(gun_positions(st)))
    north = [n for n in NESTS if n[1] < -150]
    if not north:
        bad.append("NESTS 비었다 (--snapshot)")
    north += EAST_PROBES
    end = (E_X, E_YS[-1])
    if math.dist(end, LAKE_TIP) > RANGE:
        bad.append(f"동쪽 줄 끝 {end} 이 호수 끝 {LAKE_TIP} 에서 {math.dist(end, LAKE_TIP):.1f} - 사이로 샌다")
    targets = [(f"p28 {e.get('recipe', e.get('ore', e['name']))}", pos(e)) for v in p28.layout().values() for e in v
               if e["name"] in p28.MACH | {p28.EMD, p28.JACK, p28.REF} and pos(e)[1] < 100]
    targets += [("해안 펌프", (37.5, 33.5)), ("물 관 모서리", (38.5, -58.5)), ("p27 화로", (-102.0, -62.0)),
                ("p27 석탄 채굴기", (-101.5, -101.5))]
    for what, t in targets:
        miss = [n for n in north if not shielded(t, n, guns)]
        if miss:
            bad.append(f"사거리 덮개 밖: {what} {t} <- 둥지 {miss[:3]}")
    return bad


# ------------------------------------------------------------------ 단계

def stages():
    st = layout()
    return {k: p28.steps_of(st[k]) for k in ORDER}


def plates(ents):
    t = {}
    for e in ents:
        for m, k in p28.COST.get(e["name"], {}).items():
            t[m] = t.get(m, 0) + k
    return t


def draw(st, box):
    x1, y1, x2, y2 = box
    ents = [e for v in st.values() for e in v]
    occ, _ = p28.occupancy(ents)
    sn = snap()
    ch = {BELT: None, UG: "u", INS: "i", FAST: "f", POLE: "+", AM: "A", GUN: "G"}
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


# ------------------------------------------------------------------ 게임 (읽기만)

GUNS_LUA = """(function() local s, out = game.surfaces[1], {}
  for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = "player"}) do
    out[#out+1] = string.format("G|%.1f|%.1f", t.position.x, t.position.y) end
  for _, e in pairs(s.find_entities_filtered{force = "enemy", type = "unit-spawner", position = {-40, -30}, radius = 750}) do
    out[#out+1] = string.format("N|%.1f|%.1f", e.position.x, e.position.y) end
  for _, e in pairs(s.find_entities_filtered{force = "player", type = {"mining-drill", "furnace", "boiler", "assembling-machine"}}) do
    out[#out+1] = string.format("M|%.1f|%.1f|%s", e.position.x, e.position.y, e.name) end
  return out end)()"""


def world(ai):
    guns, nests, machines = [], [], []
    for r in p1._rows(ai.lua(GUNS_LUA)):
        k, x, y, *rest = str(r).split("|")
        p = (float(x), float(y))
        if k == "G":
            guns.append(p)
        elif k == "N":
            nests.append(p)
        else:
            machines.append((rest[0], *p))
    return guns, nests, machines


def snapshot(ai):
    """p28.snapshot 을 이 설계 조각으로 (SNAP/DEBRIS/TREES) + TURRETS/NESTS."""
    old = p28.PIECES
    p28.PIECES = PIECES
    try:
        p28.snapshot(ai)
    finally:
        p28.PIECES = old
    guns, nests, _m = world(ai)
    print("TURRETS = [" + ", ".join(f"({x:g}, {y:g})" for x, y in sorted(guns)) + "]")
    print("NESTS = [" + ", ".join(f"({x:g}, {y:g})" for x, y in sorted(nests)) + "]")


def bucket(m):
    return f"({int(m[1] // 20) * 20},{int(m[2] // 20) * 20})"


def cover(ai):
    """공해원 기계 덮개 네 경우: 지금 포탑 / p29 뒤 x p28 짓기 전 / 후."""
    guns, nests, machines = world(ai)
    plan = gun_positions(layout())
    after = sorted(set(guns) | set(plan))
    p28m = [(e["name"], *pos(e)) for v in p28.layout().values() for e in v
            if e["name"] in p28.MACH | {p28.EMD, p28.JACK, p28.REF}]
    have = {(round(x, 1), round(y, 1)) for _n, x, y in machines}
    p28m = [m for m in p28m if (round(m[1], 1), round(m[2], 1)) not in have]
    print(f"  포탑 지금 {len(guns)} · 설계 뒤 {len(after)} (새 {len(after) - len(guns)}) · 둥지 {len(nests)} · 공해원 기계 {len(machines)} (+p28 {len(p28m)})")
    for label, g, ms in (("지금, p28 전", guns, machines), ("p29 뒤, p28 전", after, machines),
                         ("지금, p28 후", guns, machines + p28m), ("p29 뒤, p28 후", after, machines + p28m)):
        rep = cover_report(ms, g, nests)
        side = {"북": {}, "서·동": {}, "남": {}}
        for m, ns in rep["open"].items():
            for n in ns:
                k = "북" if n[1] < -100 else ("남" if n[1] > 100 else "서·동")
                side[k].setdefault(m, set()).add(n)
        print(f"  [{label}] 기계 {len(ms)} · 18칸 안 포탑 없음 {len(rep['near'])} · 둥지 직선이 포탑 사거리를 안 지남 {len(rep['open'])}"
              f" (북쪽 둥지에서 {len(side['북'])} · 서·동 {len(side['서·동'])} · 남쪽 {len(side['남'])})")
        for k in ("북", "서·동", "남"):
            by = {}
            for m, ns in side[k].items():
                key = (bucket(m), m[0])
                by.setdefault(key, [0, set()])
                by[key][0] += 1
                by[key][1] |= {f"({n[0]:.0f},{n[1]:.0f})" for n in ns}
            for (bk, n), (c, ns) in sorted(by.items(), key=lambda kv: -kv[1][0])[:6]:
                print(f"      {k:3s} {bk:12s} {n:24s} {c:3d}  <- {', '.join(sorted(ns)[:3])}{' …' if len(ns) > 3 else ''}")


def main() -> int:
    ap = argparse.ArgumentParser()
    for f in ("check", "snapshot", "cover", "recipes", "draw"):
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
    if args.draw:
        draw(st, (-112, -110, 46, -64))
        return 0
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 겹침 0 (기존 포탑 자리는 «이미 섰다») · p25..p28 예약 칸 0 · 팔 집는/놓는 칸 · "
                                         "레인 한 품목 · 포탑마다 탄창 팔 · 기존 줄과 안 엉킴 · 전력 덮개 · 전선 7.5 · 사거리 덮개 모두 통과")
        ents = [e for v in st.values() for e in v]
        new_g = sum(1 for e in ents if e["name"] == GUN and not standing_already(e))
        print(f"  포탑 {sum(1 for e in ents if e['name'] == GUN)} (새 {new_g}) · 팔 {sum(1 for e in ents if e['name'] == INS)} · "
              f"전봇대 {sum(1 for e in ents if e['name'] == POLE)} · 벨트 {sum(1 for e in ents if e['name'] in (BELT, UG))} · "
              f"새 망 {sorted(set().union(*pole_nets(st).values()))}")
        kw = sum(KW.get(e["name"], 0) for e in ents)
        print(f"  최대 전력 {kw / 1000:.2f} MW (팔이 다 움직일 때)")
        tot = 0.0
        for k in ORDER:
            v = [e for e in st[k] if not standing_already(e)]
            c = plates(v)
            tot += c.get("iron-plate", 0)
            print(f"  {k:10s} {len(sts[k]):3d} (새 {len(v):3d})  철 {c.get('iron-plate', 0):6.1f}  구리 {c.get('copper-plate', 0):5.1f}"
                  f"  (누계 철 {tot:.0f})")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update(p28.COST)
    p1.PAIRED.update({UG})
    p1.PARK = PARK
    ai = AIBridge()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
    for name, steps in sts.items():
        nb = sum(1 for k, _ in steps if k == "build")
        bad = p1.blocked(ai, steps)
        print(f"  {name:10s} {len(p1.standing(ai, steps))}/{nb} · 막힘 {len(bad)} {bad[:4]}")
    if args.cover:
        cover(ai)
    if args.recipes:
        x, y = pos(ammo()[0])
        print("  레시피", ai.set_recipe((args.who or "golf").split(",")[0], x, y, MAG))
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p29"
    detached.mark(crew, "p29", minutes=120)
    try:
        ok = p1.build_stage(ai, crew, sts[args.stage], "p29-" + args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""P4-3 for run 23: military science block - 0.25/s, every input on a belt (no hand feeding). Design only.

목표율부터 (ratio.py military-science-pack=0.25, 게임 레시피 2026-09-26):

    군사팩 2 = 관통탄 1 + 수류탄 1 + 돌벽 2 (10초)      관통탄 2 = 탄창 2 + 강철 1 + 구리판 2 (6초)
    수류탄 = 석탄 10 + 철판 5 (8초)                     돌벽 = 벽돌 5 (0.5초) · 탄창 = 철판 4 (1초)
    강철 = 철판 5 (16초, 화로) · 벽돌 = 돌 2 (3.2초, 화로)

    0.25/s -> 돌벽 0.25 · 수류탄 0.125 · 관통탄 0.125 · 탄창 0.125 · 강철 0.0625 · 벽돌 1.25
           -> 돌 2.5/s · 석탄 1.25/s (+ 화로 연료 8 x 0.0225) · 철판 1.44/s · 구리판 0.125/s

| 기계 (조립기 1형 0.5 · 돌 화로 1) | 필요 | 짓는 수 | 상한 (팩/s) |
|---|---|---|---|
| 군사팩 MA | 2.5 | 3 | 0.30 |
| 수류탄 GA | 2.0 | 3 | 0.375 |
| 관통탄 PA | 0.75 | 1 | 0.33 |
| 탄창 FA · 돌벽 WA | 0.25 · 0.25 | 1 · 1 | 2.0 · 1.0 |
| 강철 화로 SF | 1.0 | 2 | 0.5 |
| 벽돌 화로 (채굴기 직결) | 4.0 | 6 | 0.30 (돌 채굴기 6 = 3/s 가 상한) |
| 석탄 채굴기 | 2.9 | 4 | 2.0/s (필요 1.43/s) |

조립기 2형·강철 화로는 강철이 허브에 없어 지금은 못 만든다 - 이 블록이 강철을 만든 뒤 MA·GA 를 2형으로 바꾸면 0.375.

흐름 (타일 번호: 3x3 은 가운데, 2x2 화로는 왼쪽 위, 나머지는 그 타일. 팔 d = 집는 쪽):

    북쪽 돌밭: 돌 채굴기 6 (y=-100, 남향) -> 바로 아래 돌 화로 6 (y -98..-97) -> 팔 (y=-96) -> T (y=-95 서향)
               화로 팔 둘: 출력 (북쪽 화로에서 집어 T 먼 레인 = 남쪽) · 연료 (T 에서 석탄을 집어 화로로)
    석탄: 채굴기 4 (x=-42, y -94..-85, 서향) -> Cn (x=-44 북향, 동쪽 레인) -> (-44,-95) 서쪽으로 꺾음 = T 북쪽 레인
    T = 벽돌 | 석탄 (한 레인 한 품목). 벽돌·석탄은 녹일 수 없는 것과 연료뿐이라 강철 화로에 섞여 들어가지 않는다.
    T: y=-95 서향 -> x=-65 남향 (구리 채굴기 줄 + 간선 A 는 지하 -90 -> -85, 철 줄 y=-46 은 지하 -47 -> -45)
       -> y=-44 동향 -> x=-50 남향 (y -43..-20) = 블록 A 의 석탄·벽돌 기둥
    블록 A (T x=-50 과 기존 철판 줄 x=-44 사이 - 철은 팔로 x=-44 에서 집는다, 분배기 없이):
       강철 화로 2 · 탄창 FA · 돌벽 WA · 수류탄 GA 3. 출력은 긴팔 (x=-49) 이 T 너머 x=-51 에 놓는다.
       x=-51 은 토막 벨트: J1 (-51,-37) 서향 = 북에서 강철 · 남에서 탄창 (옆치기 둘 -> 두 레인) -> K (y=-37 서향)
                         J2 (-51,-29) 서향 = 북에서 돌벽 · 남에서 수류탄 -> Q (y=-29 서향)
    관통탄 PA (-64,-34): K 에서 강철·탄창, 구리는 긴팔로 기존 구리판 줄 x=-68 에서. 출력 -> R (y=-31 -> x=-66 -> y=-23 동향)
    군사팩 MA 3 (y=-26): 북쪽 Q (수류탄|돌벽), 남쪽 R (관통탄), 긴팔로 P (y=-22) 에 출력
    P: y=-22 서향 (구리 줄 x=-68 은 지하) -> x=-83 남향 (서쪽 연구소 7 의 바깥 팔) -> y=46 동향 -> x=-71 북향
       (동쪽 연구소 8 의 바깥 팔) -> (-71,21) 끝 = 마지막 연구소. 기존 팩 벨트 x=-77 (L1 초록 · L2 빨강) 은 건드리지 않는다.

    python scripts/p25.py --check                   # 오프라인 확인 (게임 스냅숏 SNAP 으로)
    python scripts/p25.py                           # 단계별 선 것/전체 · 막힌 자리 (게임 읽기만)
    python scripts/p25.py --ores                    # 채굴기 채굴 범위의 자원 (게임 읽기만)
    python scripts/p25.py --power                   # 망별 발전·소비 (게임 읽기만)
    python scripts/p25.py --snapshot                # 설계 둘레의 기존 엔티티를 SNAP 형식으로 찍는다 (게임 읽기만)
    python scripts/p25.py --recipes --who golf      # 조립기 레시피
    python scripts/p25.py --stage north --who alpha,charlie
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
AM, LAB, POLE = p2.AM, p2.LAB, p2.POLE
EMD, FURN = p1.EMD, p1.FURN
ARMS = {INS: 1, FAST: 1, LONG: 2}
SZ3 = {AM, LAB, EMD}
POWERED = {AM, LAB, INS, FAST, LONG, EMD}
KW = {EMD: 90, AM: 77.5, LAB: 60, INS: 14.7, FAST: 58.8, LONG: 21}      # 게임 get_max_energy_usage (드레인 포함)

RATE = 0.25
RECIPE = {   # 레시피: (재료, 결과) - 화로는 넣는 것 (광석·판) + 연료
    "firearm-magazine": ({"iron-plate"}, "firearm-magazine"),
    "piercing-rounds-magazine": ({"firearm-magazine", "steel-plate", "copper-plate"}, "piercing-rounds-magazine"),
    "grenade": ({"coal", "iron-plate"}, "grenade"),
    "stone-wall": ({"stone-brick"}, "stone-wall"),
    "military-science-pack": ({"piercing-rounds-magazine", "grenade", "stone-wall"}, "military-science-pack"),
    "stone-brick": ({"stone", "coal"}, "stone-brick"),
    "steel-plate": ({"iron-plate", "coal"}, "steel-plate"),
    LAB: ({"military-science-pack"}, None),          # 이 블록이 연구소에 주는 것 (빨강·초록은 기존 팩 벨트)
}
SMELTABLE = {"stone", "iron-ore", "copper-ore", "iron-plate"}
FUEL = {"coal", "wood"}

# ---- 배치 상수 ---------------------------------------------------------------------------
STONE_Y = -100                                   # 돌 채굴기 줄 (남향) -> 화로 (y -98..-97) -> 팔 -96 -> T -95
STONE_XS = [-63, -60, -57, -54, -51, -48]
T_Y, T_HEAD, T_X = -95, -44, -65                 # T 서향 줄 · 석탄 꺾음 x · T 남향 x
COAL_X, COAL_YS = -42, [-94, -91, -88, -85]      # 석탄 채굴기 (서향) -> Cn x=-44
CN_X = -44
JOG_Y, COL_X = -44, -50                          # T 동향 y · 블록 A 의 T 남향 x
IRON_X, CU_X = -44, -68                          # 기존 철판 줄 (x=-44, 남향, L2 = 서쪽 레인) · 구리판 줄 (x=-68, 남향, L1 = 동쪽 레인)
SEG_X = -51                                      # 긴팔이 놓는 토막 벨트
MA_XS, MA_Y = [-54, -58, -62], -26
PA_C = (-64, -34)
P_WEST, P_EAST, P_BOTTOM, P_TOP = -83, -71, 46, 21
WEST_LABS = [22, 25, 28, 31, 37, 40, 43]         # 서쪽 연구소 가운데 타일 y (x=-80) - 34 는 비어 있다 (부서진 뒤 안 섰다)
EAST_LABS = [22, 25, 28, 31, 34, 37, 40, 43]     # 동쪽 연구소 (x=-74)
PARK = (-58.5, -12.5)                            # 공사 뒤 비켜 서는 곳 (빈 땅)


def ent(name, x, y, d=None, **kw):
    return p2.ent(name, x, y, d, **kw)


def run(x1, y1, x2, y2, d):
    return p2.run(x1, y1, x2, y2, d)


def ug(x1, y1, x2, y2, d):
    return p2.ug_pair(x1, y1, x2, y2, d)


# ------------------------------------------------------------------ 배치 (순수)

def north():
    """석탄 채굴 4 -> Cn -> T 서향 줄, 돌 채굴기 6 -> 화로 6 -> T (벽돌 | 석탄)."""
    out = [ent(EMD, COAL_X, y, W, ore="coal") for y in COAL_YS]
    out += run(CN_X, max(COAL_YS), CN_X, T_Y + 1, N) + [ent(BELT, CN_X, T_Y, W)]
    out += run(CN_X - 1, T_Y, T_X + 1, T_Y, W) + [ent(BELT, T_X, T_Y, S)]
    for x in STONE_XS:
        fx = x - 1
        out += [ent(EMD, x, STONE_Y, S, ore="stone"), ent(FURN, fx, STONE_Y + 2, recipe="stone-brick"),
                ent(INS, fx, T_Y - 1, N),          # 출력: 화로(북)에서 집어 T 에
                ent(INS, fx + 1, T_Y - 1, S)]      # 연료: T(남)에서 석탄을 집어 화로에
    return out


def trunk():
    """T 남향: 구리 채굴기 줄 + 간선 A 는 지하, 철 줄 y=-46 도 지하, y=-44 에서 동쪽으로 블록 A 까지."""
    out = run(T_X, T_Y + 1, T_X, -91, S) + ug(T_X, -90, T_X, -85, S)
    out += run(T_X, -84, T_X, -48, S) + ug(T_X, -47, T_X, -45, S)
    out += [ent(BELT, T_X, JOG_Y, E)] + run(T_X + 1, JOG_Y, COL_X - 1, JOG_Y, E) + [ent(BELT, COL_X, JOG_Y, S)]
    return out


def block():
    """블록 A: T 기둥 x=-50 (벽돌|석탄) 과 철판 줄 x=-44 사이. 강철 2 · 탄창 · 돌벽 · 수류탄 3."""
    out = run(COL_X, JOG_Y + 1, COL_X, -22, S)                   # T 기둥: GA3 석탄 팔 (-49,-22) 에서 끝
    for fy in (-43, -41):                       # 강철 화로 (x -48..-47)
        out += [ent(FURN, -48, fy, recipe="steel-plate"),
                ent(INS, -49, fy, W),            # 석탄 (T 에서)
                ent(LONG, -46, fy, E),           # 철판 (x=-44 에서, 두 칸)
                ent(LONG, -49, fy + 1, E)]       # 강철 -> x=-51 (T 너머)
    out += run(SEG_X, -42, SEG_X, -38, S) + [ent(BELT, SEG_X, -37, W)]          # 강철 토막 -> J1
    out += [ent(AM, -47, -35, recipe="firearm-magazine"), ent(INS, -45, -36, E), ent(LONG, -49, -36, E),
            ent(BELT, SEG_X, -36, N)]                                            # 탄창 토막 -> J1 (남에서)
    out += [ent(AM, -47, -31, recipe="stone-wall"), ent(FAST, -49, -32, W), ent(LONG, -49, -30, E),  # 벽돌 입력은 고속 팔: 돌벽 1 = 벽돌 5, 0.25/s 면 1.25/s - 기본 팔 0.83/s 로는 모자랐다 (실측)
            ent(BELT, SEG_X, -30, S), ent(BELT, SEG_X, -29, W)]                  # 돌벽 토막 -> J2 (북에서)
    for gy, iy in ((-27, -27), (-24, -24), (-21, -21)):
        out += [ent(AM, -47, gy, recipe="grenade"), ent(INS, -49, gy - 1, W), ent(INS, -45, iy, E),
                ent(LONG, -49, gy + 1, E)]
    out += run(SEG_X, -20, SEG_X, -28, N)                                        # 수류탄 토막 -> J2 (남에서)
    return out


def chain():
    """K -> 관통탄 PA -> R, Q -> 군사팩 MA 3 -> P 의 머리."""
    out = run(SEG_X - 1, -37, PA_C[0], -37, W)                                   # K (강철|탄창)
    px, py = PA_C
    out += [ent(AM, px, py, recipe="piercing-rounds-magazine"), ent(INS, px, py - 2, N),
            ent(LONG, px - 2, py + 1, W),                                        # 구리: x=-68 에서 두 칸
            ent(INS, px, py + 2, N)]                                             # 관통탄 -> R
    out += [ent(BELT, px, py + 3, W), ent(BELT, px - 1, py + 3, W), ent(BELT, px - 2, py + 3, S)]
    out += run(px - 2, py + 4, px - 2, MA_Y + 2, S) + [ent(BELT, px - 2, MA_Y + 3, E)]
    out += run(px - 1, MA_Y + 3, MA_XS[0] - 1, MA_Y + 3, E)                      # R (관통탄) y=-23 동향, MA1 의 R 팔에서 끝
    out += run(SEG_X - 1, MA_Y - 3, MA_XS[-1] + 1, MA_Y - 3, W)                  # Q (수류탄|돌벽) y=-29 서향
    for i, x in enumerate(MA_XS):
        out += [ent(AM, x, MA_Y, recipe="military-science-pack"),
                ent(INS, x if i < len(MA_XS) - 1 else x + 1, MA_Y - 2, N),     # Q 에서
                ent(INS, x - 1, MA_Y + 2, S),                                    # R 에서
                ent(LONG, x + 1, MA_Y + 2, N)]                                   # 팩 -> P (R 너머)
    return out


def packs():
    """P: 블록 -> 연구소 바깥 고리. 연구소마다 바깥 팔 하나."""
    y0 = MA_Y + 4
    out = run(MA_XS[0] + 1, y0, CU_X + 2, y0, W) + ug(CU_X + 1, y0, CU_X - 1, y0, W)
    out += run(CU_X - 2, y0, P_WEST + 1, y0, W) + [ent(BELT, P_WEST, y0, S)]
    out += run(P_WEST, y0 + 1, P_WEST, P_BOTTOM - 1, S) + [ent(BELT, P_WEST, P_BOTTOM, E)]
    out += run(P_WEST + 1, P_BOTTOM, P_EAST - 1, P_BOTTOM, E) + [ent(BELT, P_EAST, P_BOTTOM, N)]
    out += run(P_EAST, P_BOTTOM - 1, P_EAST, P_TOP, N)
    poles = snap()["poles"]
    for y in WEST_LABS:
        yy = y if (P_WEST + 1, y) not in poles else y - 1
        out.append(ent(INS, P_WEST + 1, yy, W))
    for y in EAST_LABS:
        yy = y if (P_EAST - 1, y) not in poles else y - 1
        out.append(ent(INS, P_EAST - 1, yy, E))
    return out


def layout() -> dict:
    """단계 순서대로 {이름: 엔티티}. 전봇대는 지역마다 앞 단계 + 기존 망에서 이어 욕심 배치."""
    st = {"north": north(), "trunk": trunk(), "block": block(), "chain": chain(), "packs": packs()}
    everything = [e for v in st.values() for e in v]
    occ, _ = occupancy(everything)
    net = [(x, y) for (x, y) in snap()["poles"]]
    order = {}
    for pname, group in (("n_poles", "north"), ("t_poles", "trunk"), ("b_poles", "block"),
                         ("c_poles", "chain"), ("p_poles", "packs")):
        ps = place_poles(st[group], occ, net)
        net += ps
        order[pname] = [ent(POLE, x, y) for x, y in ps]
        for i, (x, y) in enumerate(ps):
            occ[(x, y)] = order[pname][i]
        order[group] = st[group]
    return {k: v for k, v in order.items() if v}


# ------------------------------------------------------------------ 기존 엔티티 (게임 스냅숏)
# python scripts/p25.py --snapshot 이 찍는다 (2026-09-26, tick 8.27M). 설계 둘레 (설계 칸 ±3) 만.
# 형식: 종류:x1,y1,x2,y2[:d][:망] (타일, 끝 포함). b=벨트 u=지하(i/o) s=분배기 i=팔 f=고속 l=긴팔 p=전봇대
# (뒤에 망 id) F=화로 A=조립기 L=연구소 D=채굴기 G=포탑 C=상자 E=보일러·엔진 P=관 R=바위 X=추락선 잔해 ?=그 밖
SNAP = """
    A:-67,15,-65,17 A:-70,15,-68,17 A:-73,15,-71,17 A:-76,15,-74,17 D:-37,-83,-35,-81 D:-37,-86,-35,-84
    D:-37,-89,-35,-87 D:-45,-81,-43,-79 D:-48,-81,-46,-79 D:-49,-85,-47,-83 D:-62,-89,-60,-87 D:-65,-89,-63,-87
    D:-68,-89,-66,-87 F:-42,-23,-41,-22 F:-42,-25,-41,-24 F:-42,-27,-41,-26 F:-42,-29,-41,-28 F:-42,-31,-41,-30
    F:-42,-33,-41,-32 F:-42,-35,-41,-34 F:-42,-37,-41,-36 F:-42,-39,-41,-38 F:-42,-41,-41,-40 F:-42,-43,-41,-42
    F:-42,-45,-41,-44 L:-75,21,-73,23 L:-75,24,-73,26 L:-75,27,-73,29 L:-75,30,-73,32 L:-75,33,-73,35 L:-75,36,-73,38
    L:-75,39,-73,41 L:-75,42,-73,44 L:-81,21,-79,23 L:-81,24,-79,26 L:-81,27,-79,29 L:-81,30,-79,32 L:-81,36,-79,38
    L:-81,39,-79,41 L:-81,42,-79,44 R:-51,-29,-49,-27 R:-55,-30,-52,-27 R:-69,-59,-67,-58 i:-43,-23,-43,-23:4
    i:-43,-25,-43,-25:4 i:-43,-27,-43,-27:4 i:-43,-29,-43,-29:4 i:-43,-31,-43,-31:4 i:-43,-33,-43,-33:4
    i:-43,-35,-43,-35:4 i:-43,-37,-43,-37:4 i:-43,-39,-43,-39:4 i:-43,-41,-43,-41:4 i:-43,-43,-43,-43:4
    i:-43,-45,-43,-45:4 i:-69,-39,-69,-39:12 i:-69,-41,-69,-41:12 i:-69,-43,-69,-43:12 i:-69,-45,-69,-45:12
    i:-69,18,-69,18:0 i:-72,18,-72,18:0 i:-75,18,-75,18:0 i:-76,22,-76,22:12 i:-76,25,-76,25:12 i:-76,28,-76,28:12
    i:-76,31,-76,31:12 i:-76,34,-76,34:12 i:-76,37,-76,37:12 i:-76,40,-76,40:12 i:-76,43,-76,43:12 i:-78,22,-78,22:4
    i:-78,25,-78,25:4 i:-78,28,-78,28:4 i:-78,31,-78,31:4 i:-78,34,-78,34:4 i:-78,37,-78,37:4 i:-78,40,-78,40:4
    i:-78,43,-78,43:4 p:-33,-77,-33,-77:1 p:-33,-83,-33,-83:1 p:-33,-89,-33,-89:1 p:-38,-24,-38,-24:2
    p:-38,-28,-38,-28:2 p:-38,-30,-38,-30:2 p:-38,-34,-38,-34:2 p:-38,-36,-38,-36:2 p:-38,-40,-38,-40:2
    p:-38,-44,-38,-44:2 p:-38,-76,-38,-76:1 p:-43,-30,-43,-30:2 p:-43,-44,-43,-44:2 p:-44,-78,-44,-78:1
    p:-45,-25,-45,-25:2 p:-45,-35,-45,-35:2 p:-45,-41,-45,-41:2 p:-46,-84,-46,-84:1 p:-46,24,-46,24:2
    p:-47,-18,-47,-18:2 p:-47,20,-47,20:2 p:-48,-11,-48,-11:2 p:-48,-4,-48,-4:2 p:-48,-47,-48,-47:2 p:-48,8,-48,8:2
    p:-50,-62,-50,-62:2 p:-50,-68,-50,-68:2 p:-50,2,-50,2:2 p:-51,-59,-51,-59:2 p:-52,-88,-52,-88:1 p:-52,14,-52,14:2
    p:-52,20,-52,20:2 p:-52,24,-52,24:2 p:-53,5,-53,5:2 p:-54,9,-54,9:2 p:-55,-49,-55,-49:2 p:-55,1,-55,1:2
    p:-56,24,-56,24:2 p:-57,-56,-57,-56:2 p:-58,-90,-58,-90:1 p:-58,14,-58,14:2 p:-58,20,-58,20:2 p:-61,24,-61,24:2
    p:-63,-53,-63,-53:2 p:-64,-90,-64,-90:1 p:-64,14,-64,14:2 p:-64,18,-64,18:2 p:-67,-41,-67,-41:2 p:-68,14,-68,14:2
    p:-68,53,-68,53:2 p:-69,-44,-69,-44:2 p:-70,-51,-70,-51:2 p:-70,18,-70,18:2 p:-72,-40,-72,-40:2 p:-72,-44,-72,-44:2
    p:-73,14,-73,14:2 p:-74,53,-74,53:2 p:-76,20,-76,20:2 p:-76,27,-76,27:2 p:-76,33,-76,33:2 p:-76,38,-76,38:2
    p:-76,42,-76,42:2 p:-78,38,-78,38:2 p:-78,42,-78,42:2 p:-80,53,-80,53:2 p:-82,25,-82,25:2 p:-82,31,-82,31:2
    p:-86,53,-86,53:2 p:-87,-29,-87,-29:2 p:-89,-17,-89,-17:2 p:-91,-23,-91,-23:2 p:-91,55,-91,55:2
    u:-67,-36,-67,-36:4:o u:-69,-36,-69,-36:4:i b:-69,-86,-61,-86:12 b:-48,-86,-48,-86:12 b:-48,-82,-44,-82:12
    b:-52,-48,-52,-47:8 b:-69,-46,-42,-46:4 b:-68,-45,-68,-18:8 b:-44,-45,-44,-20:8 b:-70,-36,-70,-36:4
    b:-66,-36,-66,-36:8 b:-67,-35,-66,-35:12 b:-86,-26,-86,-19:0 b:-87,-19,-87,-19:4 b:-44,-19,-41,-19:4
    b:-76,19,-67,19:12 b:-77,42,-77,44:8
"""
# 치울 것 (이름, 엔티티 x, y, 타일 x1,y1,x2,y2) - 바위·잔해. 계획한 칸이나 팔이 집는/놓는 칸에 걸리면 clear 단계가 캔다
DEBRIS = [
    ('big-rock', -67.063, -58.063, -69, -59, -67, -58),
    ('big-rock', -49.313, -27.563, -51, -29, -49, -27),
    ('huge-rock', -52.813, -28.063, -55, -30, -52, -27),
]
# 기존 줄에서 팔로 집는 곳 (게임 실측 레인): 칸 -> 품목
TAPS = {**{(IRON_X, y): "iron-plate" for y in range(-45, -19)},
        **{(CU_X, y): "copper-plate" for y in range(-37, -1)}}


_SNAP = None


def snap():
    """SNAP 을 푼다: {tiles: {칸: 종류}, belts: {칸: (d, 지하 i/o/None)}, arms: {칸: (종류, d)},
    poles: {칸: 망}, labs: {가운데 칸}}"""
    global _SNAP
    if _SNAP is not None:
        return _SNAP
    out = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}, "labs": set()}
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
                    out["poles"][(x, y)] = int(extra[0]) if extra else 0
        if k == "L":
            out["labs"].add(((x1 + x2) // 2, (y1 + y2) // 2))
    _SNAP = out
    return out


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


BAND = 3                     # 전봇대 후보 = 설계 칸 ±3 (스냅숏은 ±4 를 찍는다)
_BANDSET = None


def _band():
    global _BANDSET
    if _BANDSET is None:
        ts = {t for f in (north, trunk, block, chain, packs) for e in f() for t in tiles(e)}
        _BANDSET = {(x + dx, y + dy) for x, y in ts for dx in range(-BAND, BAND + 1) for dy in range(-BAND, BAND + 1)}
    return _BANDSET


def place_poles(group, occ, net):
    """소형 전봇대 욕심 배치 (p24.place_poles 와 같은 규칙): 기존 망 + 앞 지역 전봇대에서 이어 간다.
    후보 칸은 설계·기존 엔티티·바위·팔이 집고 놓는 칸이 아닌 곳."""
    need = [e for e in group if e["name"] in POWERED]
    if not need:
        return []
    sn = snap()
    arm_spots = {t for e in occ.values() if e["name"] in ARMS for t in arm_ends(e)}
    blocked_ = set(sn["tiles"]) | set(occ) | set(debris_tiles()) | arm_spots
    xs = [t[0] for e in need for t in tiles(e)]
    ys = [t[1] for e in need for t in tiles(e)]
    x1, x2, y1, y2 = min(xs) - 3, max(xs) + 3, min(ys) - 3, max(ys) + 3
    q = min(net, key=lambda p: math.dist(p, (min(max(p[0], x1), x2), min(max(p[1], y1), y2))))
    x1, x2 = min(x1, int(q[0]) - 1), max(x2, int(q[0]) + 1)
    y1, y2 = min(y1, int(q[1]) - 1), max(y2, int(q[1]) + 1)
    band = _band()
    cand = [(x, y) for x in range(x1, x2 + 1) for y in range(y1, y2 + 1) if (x, y) not in blocked_ and (x, y) in band]
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
    # 이미 기존 전봇대가 덮는 것은 뺀다
    todo = {i for i in range(len(need))
            if not any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(need[i]) for p in net)}
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


# ------------------------------------------------------------------ 레인 추적

def left_of(d):
    return {N: W, E: N, S: E, W: S}[d]


def lane_of(belt_d, side):
    """벨트 방향 belt_d 기준, side (벨트에서 본 단위 벡터) 쪽 레인: 'L' | 'R' | None (앞/뒤)."""
    if side == VEC[left_of(belt_d)]:
        return "L"
    if side == tuple(-v for v in VEC[left_of(belt_d)]):
        return "R"
    return None


def made(e):
    if e is None:
        return None
    if e["name"] in (AM, FURN):
        return RECIPE[e["recipe"]][1]
    return None


def want_of(m):
    return set(RECIPE[m["recipe"] if m["name"] != LAB else LAB][0])


def drill_drops(ents, occ):
    """채굴기가 떨구는 칸: 앞 두 칸 (몸 바로 밖). 벨트면 채굴기 쪽 (가까운) 레인, 화로면 그 화로에."""
    belts = {(e["x"], e["y"]): e for e in ents if e["name"] in (BELT, UG)}
    srcs, feeds, bad = [], [], []
    for e in ents:
        if e["name"] != EMD:
            continue
        vx, vy = VEC[e["d"]]
        k = (e["x"] + 2 * vx, e["y"] + 2 * vy)
        b = belts.get(k)
        if b is not None:
            ln = lane_of(b["d"], (-vx, -vy))
            if ln is None:
                bad.append(f"채굴기 {e['x'], e['y']} 가 벨트 {k} 의 앞/뒤에서 떨군다")
            else:
                srcs.append((k, e["ore"], ln))
            continue
        m = occ.get(k)
        if m is not None and m["name"] == FURN:
            feeds.append((m, e["ore"]))
            continue
        bad.append(f"채굴기 {e['x'], e['y']} 앞 {k} 에 벨트도 화로도 없다")
    return srcs, feeds, bad


def trace(st):
    """벨트 레인 추적 (p2.trace 규칙 + 긴팔 · 기존 줄 수도꼭지). {칸: {'L','R'}}, 문제 목록."""
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    belt = {(e["x"], e["y"]): e for e in ents if e["name"] in (BELT, UG)}
    lanes = {k: {"L": set(), "R": set()} for k in belt}
    srcs, _feeds, problems = drill_drops(ents, occ)
    for k, item, ln in srcs:
        lanes[k][ln].add(item)

    feeders = {}
    for k in belt:
        x, y = k
        out = []
        for dx, dy in VEC.values():
            q = (x - dx, y - dy)
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
    for _ in range(200):
        changed = False
        for a in arms:
            src, dst = arm_ends(a)
            if dst not in belt:
                continue
            item = made(occ.get(src))
            if item is None:
                continue
            bd = belt[dst]["d"]
            sx, sy = a["x"] - dst[0], a["y"] - dst[1]
            side = (sx // max(1, abs(sx)) if sx else 0, sy // max(1, abs(sy)) if sy else 0)
            ln = lane_of(bd, side)          # 팔은 먼 레인에 놓는다
            ln = {"L": "R", "R": "L"}.get(ln)
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
                else:
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
        if e["name"] == UG and e.get("kind") == "output" and any(True for _ in feeders[k]):
            problems.append(f"지하 출구 {k} 로 다른 벨트가 들어온다")
    for k, v in lanes.items():
        for ln in "LR":
            if len(v[ln]) > 1:
                problems.append(f"레인 섞임 {k} {ln}: {sorted(v[ln])}")
    return lanes, problems


# ------------------------------------------------------------------ 오프라인 확인

def pole_nets(st):
    """새 전봇대마다 이어지는 기존 망 id (전선 7.5, 새 전봇대끼리도)."""
    old = list(snap()["poles"].items())
    new = [(e["x"], e["y"]) for k, v in st.items() if k.endswith("_poles") for e in v]
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


def dead_ends(ents, occ, lanes) -> list:
    """소비자 없는 생산은 없다: 레인에 실린 품목마다 하류 (벨트를 따라 끝까지) 에 그것을 집어 쓰는 팔이 있어야 한다."""
    sn = snap()
    lab_tiles = {(lx + dx, ly + dy) for lx, ly in sn["labs"] for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
    belt = {(e["x"], e["y"]): e for e in ents if e["name"] in (BELT, UG)}
    takes = {}
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        if sk not in belt:
            continue
        dst = occ.get(dk)
        if dst is not None and dst["name"] in (AM, FURN):
            w = want_of(dst)
        elif dst is None and dk in lab_tiles:
            w = set(RECIPE[LAB][0])
        else:
            continue
        takes.setdefault(sk, set()).update(w)

    def nxt(k):
        e = belt[k]
        vx, vy = VEC[e["d"]]
        if e["name"] == UG and e.get("kind") == "input":
            for i in range(1, 6):
                q = (k[0] + vx * i, k[1] + vy * i)
                if q in belt and belt[q]["name"] == UG and belt[q].get("kind") == "output":
                    return q
            return None
        q = (k[0] + vx, k[1] + vy)
        return q if q in belt else None

    memo = {}

    def down(k):
        if k in memo:
            return memo[k]
        memo[k] = set()
        got, q, seen = set(takes.get(k, set())), nxt(k), {k}
        while q is not None and q not in seen:
            if q in memo and memo[q]:
                got |= memo[q]
                break
            seen.add(q)
            got |= takes.get(q, set())
            q = nxt(q)
        memo[k] = got
        return got

    upstream = {}
    for k in belt:
        q = nxt(k)
        if q is not None:
            upstream.setdefault(q, []).append(k)
    bad, told = [], set()
    for k in belt:
        items = lanes[k]["L"] | lanes[k]["R"]
        came = set().union(*[lanes[q]["L"] | lanes[q]["R"] for q in upstream.get(k, [])]) if upstream.get(k) else set()
        for it in (items - came) - down(k):        # 품목이 실리는 칸에서만 (꼬리는 역압으로 차는 것이 정상)
            if it not in told:
                told.add(it)
                bad.append(f"소비자 없음: {it} 이 {k} 에서 하류 끝까지 가도 집어 쓰는 팔이 없다")
    return bad


def check(st) -> list:
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, clash = occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    deb = debris_tiles()
    bad += [f"기존 것과 겹침 {t}: {occ[t]['name']} / {sn['tiles'][t]}" for t in occ
            if t in sn["tiles"] and sn["tiles"][t] not in ("R", "X")]
    bad += [f"바위·잔해 {t} ({sn['tiles'][t]}) 가 DEBRIS 에 없다" for t in occ
            if sn["tiles"].get(t) in ("R", "X") and t not in deb]
    lanes, probs = trace(st)
    bad += probs
    _s, feeds, _b = drill_drops(ents, occ)
    got = {}
    for m, ore in feeds:
        got.setdefault(id(m), set()).add(ore)
    # 팔: 집는 칸 · 놓는 칸
    for a in (e for e in ents if e["name"] in ARMS):
        sk, dk = arm_ends(a)
        at = (a["x"], a["y"])
        for t in (sk, dk):
            if sn["tiles"].get(t) in ("R", "X") and t not in deb:
                bad.append(f"팔 {at}: {t} 에 바위·잔해 (drop_target 이 될 수 있다) - DEBRIS 에 없다")
        src = occ.get(sk)
        if src is not None:
            have = (lanes[sk]["L"] | lanes[sk]["R"]) if src["name"] in (BELT, UG) else {made(src)} - {None}
        elif sk in TAPS:
            have = {TAPS[sk]}
        else:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 {sn['tiles'].get(sk, '아무것도 없음')}")
            continue
        if not have:
            bad.append(f"팔 {at}: 집는 칸 {sk} 에 아무것도 안 온다")
        dst = occ.get(dk)
        if dst is None and dk in {(lx + dx, ly + dy) for lx, ly in sn["labs"] for dx in (-1, 0, 1) for dy in (-1, 0, 1)}:
            dst = {"name": LAB, "x": dk[0], "y": dk[1], "lab_existing": True}
        if dst is None:
            bad.append(f"팔 {at}: 놓는 칸 {dk} 에 {sn['tiles'].get(dk, '아무것도 없음')}")
            continue
        if dst["name"] in (AM, LAB):
            use = want_of(dst) & have
            if not use:
                bad.append(f"팔 {at}: {dst.get('recipe', dst['name'])} 에 줄 것이 없다 (거기 {sorted(have)})")
            if not dst.get("lab_existing"):
                got.setdefault(id(dst), set()).update(use)
        elif dst["name"] == FURN:
            want = want_of(dst)
            use = have & want
            dirty = (have & SMELTABLE) - want
            if dirty:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 녹일 수 있는 딴 것 {sorted(dirty)} 이 들어간다")
            if not use:
                bad.append(f"팔 {at}: 화로 {dst['recipe']} 에 줄 것이 없다 (거기 {sorted(have)})")
            got.setdefault(id(dst), set()).update(use)
        elif dst["name"] not in (BELT, UG):
            bad.append(f"팔 {at}: 놓는 칸이 {dst['name']}")
    for m in (e for e in ents if e["name"] in (AM, FURN)):
        lack = want_of(m) - got.get(id(m), set())
        if lack:
            bad.append(f"{m['recipe']} ({m['x']},{m['y']}): 모자람 {sorted(lack)}")
    bad += dead_ends(ents, occ, lanes)
    # 기존 것과 잇기: 내 벨트 끝이 기존 벨트로 흘러드는가, 기존 벨트·팔이 내 칸에 닿는가
    mine_belt = {(e["x"], e["y"]): e for e in ents if e["name"] in (BELT, UG)}
    for k, e in mine_belt.items():
        if e["name"] == UG and e.get("kind") == "input":
            continue
        vx, vy = VEC[e["d"]]
        nxt = (k[0] + vx, k[1] + vy)
        if nxt not in mine_belt and nxt in sn["belts"]:
            bad.append(f"벨트 {k} 가 기존 벨트 {nxt} 로 흘러든다")
        if nxt not in mine_belt and nxt in sn["tiles"] and nxt not in sn["belts"] and sn["tiles"][nxt] in ("C", "F", "A"):
            bad.append(f"벨트 {k} 끝이 {sn['tiles'][nxt]} 에 닿는다")
    for k, (d, kind, typ) in sn["belts"].items():
        if kind == "i" or typ == "s":
            continue
        vx, vy = VEC[d]
        nxt = (k[0] + vx, k[1] + vy)
        if nxt in mine_belt:
            bad.append(f"기존 벨트 {k} 가 내 벨트 {nxt} 로 흘러든다")
    for k, (typ, d) in sn["arms"].items():
        r = 2 if typ == "l" else 1
        px, py = VEC[d]
        for t in ((k[0] + px * r, k[1] + py * r), (k[0] - px * r, k[1] - py * r)):
            if t in occ:
                bad.append(f"기존 팔 {k} 이 내 {occ[t]['name']} {t} 를 집거나 거기 놓는다")
    # 전력: 덮개 (소형 5x5 = 가운데 ±2) · 전선 7.5
    ps = [(e["x"], e["y"]) for k, v in st.items() if k.endswith("_poles") for e in v] + list(sn["poles"])
    for e in ents:
        if e["name"] in POWERED and not any(
                any(abs(t[0] - p[0]) <= 2 and abs(t[1] - p[1]) <= 2 for t in tiles(e)) for p in ps):
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
    """계획한 칸, 그리고 팔이 집는/놓는 칸에 걸린 바위·추락선 잔해 (잔해는 인벤토리가 있어 팔의 drop_target 이 된다)."""
    ents = [e for v in st.values() for e in v]
    spots = {t for e in ents for t in tiles(e)}
    spots |= {t for e in ents if e["name"] in ARMS for t in arm_ends(e)}
    out, seen = [], set()
    for t, (name, x, y) in debris_tiles().items():
        if t in spots and (name, x, y) not in seen:
            seen.add((name, x, y))
            out.append(("demolish", {"x": x, "y": y, "name": name, "search_radius": 1.0}))
    return out


def stages():
    st = layout()
    out = {"clear": clear_steps(st)}
    for k, v in st.items():
        out[k] = steps_of(v)
    return out


STONE_AT = (-57.5, -105.5)      # 손으로 캘 돌 (드릴 줄 y -101..-99 북쪽의 얇은 돌 - 드릴 범위 밖)
WOOD_AT = (-57.0, -62.0)        # 나무 무리 (run23-site.md)


def prep(ai, crew, steps) -> None:
    """허브에 돌·나무가 없다 (2026-09-26 실측): 이 단계의 돌 화로 (돌 5) · 전봇대 (나무 0.5) 만큼 크루가 먼저 캐고 벤다.
    p1.fetch 의 나무 자리 (7,-76) 는 22회차 좌표라 여기서 채운다."""
    import time
    from orders import submit
    from client import RconError
    up = p1.standing(ai, steps)
    todo = [p for k, p in steps if k == "build" and (p["name"], p["x"], p["y"]) not in up]
    need = {"stone": 5 * sum(1 for p in todo if p["name"] == FURN),
            "wood": (sum(1 for p in todo if p["name"] == POLE) + 1) // 2 + 2 * len(crew)}
    h = p1.hub(ai)
    bags = {}
    for who in crew:
        try:
            bags[who] = ai.agent(who).items()
        except RconError:
            bags[who] = {}
    sent = False
    for who in crew:
        plan = []
        for item, n in need.items():
            if n <= 0:
                continue
            per = -(-n // len(crew))
            short = per - int(bags[who].get(item, 0)) - (h[item][2] // len(crew) if item in h else 0)
            if short <= 0:
                continue
            if item == "stone":
                plan += [("walk_to", {"x": STONE_AT[0], "y": STONE_AT[1] + 2}),
                         ("mine", {"x": STONE_AT[0], "y": STONE_AT[1], "name": "stone", "count": short + 2,
                                   "search_radius": 6})]
            else:
                plan += [("walk_to", {"x": WOOD_AT[0] + 2, "y": WOOD_AT[1] + 2}),
                         ("chop", {"x": WOOD_AT[0], "y": WOOD_AT[1], "count": short // 4 + 1})]
        if plan:
            print(f"{who}: 준비 {plan[1][1].get('name', 'wood')} ...")
            submit(ai, who, plan, strict=False)
            sent = True
    if sent:
        t0 = time.time()
        time.sleep(15)
        while time.time() - t0 < 600 and not p1.idle(ai, crew):
            time.sleep(5)


def am_list(st):
    return [e for v in st.values() for e in v if e["name"] == AM]


def set_recipes(ai, who):
    for e in am_list(layout()):
        x, y = pos(e)
        r = ai.set_recipe(who, x, y, e["recipe"])
        if isinstance(r, dict) and r.get("error"):
            print(f"  레시피 {e['recipe']} ({x},{y}): {r['error']}")


def counts(st):
    n = {}
    for v in st.values():
        for e in v:
            key = e["name"] if e["name"] not in (AM, FURN, EMD) else f"{e['name']}:{e.get('recipe', e.get('ore'))}"
            n[key] = n.get(key, 0) + 1
    return n


def power_kw(n):
    """최대 전력 (kW, 드레인 포함). 팔은 움직일 때만 이만큼 먹는다."""
    tot = 0.0
    for k, v in n.items():
        tot += KW.get(k.split(":")[0], 0) * v
    return tot


def draw(st, box):
    sn = snap()
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    arrow = {N: "^", E: ">", S: "v", W: "<"}
    rec = {"firearm-magazine": "a", "piercing-rounds-magazine": "P", "grenade": "g", "stone-wall": "w",
           "military-science-pack": "M", "stone-brick": "b", "steel-plate": "s"}
    sym = {INS: "i", FAST: "f", LONG: "l", POLE: "p", LAB: "L", EMD: "D"}
    x1, y1, x2, y2 = box
    for y in range(y1, y2 + 1):
        row = []
        for x in range(x1, x2 + 1):
            e = occ.get((x, y))
            if e is None:
                k = sn["tiles"].get((x, y))
                row.append("." if k is None else ("#" if k not in "RX" else k))
            elif e["name"] == BELT:
                row.append(arrow[e["d"]])
            elif e["name"] == UG:
                row.append("u")
            elif e["name"] in (AM, FURN):
                row.append(rec[e["recipe"]])
            else:
                row.append(sym[e["name"]])
        print(f"{y:5d} {''.join(row)}")


# ------------------------------------------------------------------ 게임 (읽기)

def snapshot(ai):
    """설계 칸 ±3 (전봇대 후보 둘레 포함) 의 기존 엔티티를 SNAP · DEBRIS 형식으로 찍는다."""
    global _SNAP
    _SNAP = {"tiles": {}, "belts": {}, "arms": {}, "poles": {}, "labs": set()}
    st = {"north": north(), "trunk": trunk(), "block": block(), "chain": chain(), "packs": packs()}
    ts = {t for v in st.values() for e in v for t in tiles(e)}
    boxes = []
    for v in st.values():
        xs = [t[0] for e in v for t in tiles(e)]
        ys = [t[1] for e in v for t in tiles(e)]
        boxes.append((min(xs) - 9, min(ys) - 9, max(xs) + 9, max(ys) + 9))
    code = {"transport-belt": "b", "underground-belt": "u", "splitter": "s", "inserter": "i", "fast-inserter": "f",
            "long-handed-inserter": "l", "small-electric-pole": "p", "stone-furnace": "F", "steel-furnace": "F",
            "assembling-machine-1": "A", "assembling-machine-2": "A", "lab": "L", "electric-mining-drill": "D",
            "burner-mining-drill": "D", "gun-turret": "G", "iron-chest": "C", "wooden-chest": "C",
            "steam-engine": "E", "boiler": "E", "pipe": "P", "pipe-to-ground": "P", "offshore-pump": "E"}
    rows = []
    for (x1, y1, x2, y2) in boxes:
        reply = ai.lua("""(function()
          local s, out = game.surfaces[1], {}
          for _, e in pairs(s.find_entities_filtered{area = {{%d, %d}, {%d, %d}}}) do
            if e.type ~= "resource" and e.type ~= "tree" and e.type ~= "character" and e.type ~= "item-entity"
               and e.type ~= "corpse" and e.type ~= "fish" and e.type ~= "entity-ghost" then
              local b = e.bounding_box
              local d, kind, net = 0, "", ""
              pcall(function() d = e.direction end)
              if e.type == "underground-belt" then kind = e.belt_to_ground_type end
              if e.type == "electric-pole" then net = tostring(e.electric_network_id) end
              out[#out+1] = string.format("%%s|%%s|%%.3f|%%.3f|%%.3f|%%.3f|%%.3f|%%.3f|%%d|%%s|%%s|%%s",
                e.name, e.type, e.position.x, e.position.y, b.left_top.x, b.left_top.y, b.right_bottom.x, b.right_bottom.y,
                d, kind, net, e.force.name)
            end
          end
          return out
        end)()""" % (x1, y1, x2 + 1, y2 + 1))
        rows += [str(r) for r in p1._rows(reply)]
    seen, toks, debris = set(), [], []
    for r in rows:
        name, typ, x, y, lx, ly, rx, ry, d, kind, net, force = r.split("|")
        if (name, x, y) in seen:
            continue
        seen.add((name, x, y))
        tx1, ty1 = math.floor(float(lx) + 0.01), math.floor(float(ly) + 0.01)
        tx2, ty2 = math.ceil(float(rx) - 0.01) - 1, math.ceil(float(ry) - 0.01) - 1
        near = any(tx1 - BAND - 1 <= t[0] <= tx2 + BAND + 1 and ty1 - BAND - 1 <= t[1] <= ty2 + BAND + 1
                   for t in ts) or name in ("small-electric-pole", "lab")
        if not near:
            continue
        if typ == "simple-entity" or name.startswith("crash-site"):
            k = "R" if typ == "simple-entity" else "X"
            debris.append((name, float(x), float(y), tx1, ty1, tx2, ty2))
            toks.append(f"{k}:{tx1},{ty1},{tx2},{ty2}")
            continue
        k = code.get(name, "?")
        tok = f"{k}:{tx1},{ty1},{tx2},{ty2}"
        if k in ("b", "s", "i", "f", "l"):
            tok += f":{d}"
        elif k == "u":
            tok += f":{d}:{'i' if kind == 'input' else 'o'}"
        elif k == "p":
            tok += f":{net}"
        toks.append(tok)
    # 같은 방향 벨트는 줄로 묶는다
    belts = sorted((t for t in toks if t.startswith("b:")), key=lambda t: t)
    other = [t for t in toks if not t.startswith("b:")]
    cells = {}
    for t in belts:
        _k, r, d = t.split(":")
        x, y = (int(v) for v in r.split(",")[:2])
        cells[(x, y)] = int(d)
    runs, used = [], set()
    for (x, y), d in sorted(cells.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        if (x, y) in used:
            continue
        x2 = x
        while cells.get((x2 + 1, y)) == d and (x2 + 1, y) not in used:
            x2 += 1
        if x2 == x:
            y2 = y
            while cells.get((x, y2 + 1)) == d and (x, y2 + 1) not in used:
                y2 += 1
        else:
            y2 = y
        for xx in range(x, x2 + 1):
            for yy in range(y, y2 + 1):
                used.add((xx, yy))
        runs.append(f"b:{x},{y},{x2},{y2}:{d}")
    allt = sorted(set(other)) + runs
    lines, line = [], "   "
    for t in allt:
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


def ore_purity(ai, st):
    """채굴기마다 5x5 채굴 범위의 자원 (섞이면 한 레인 한 품목이 깨진다). 게임 읽기만."""
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
    bad = 0
    for e, r in zip(ds, p1._rows(reply)):
        _p, kinds, amt = str(r).split("|")
        names = {k.split(":")[0] for k in kinds.split("/") if k}
        ok = names == {e["ore"]}
        bad += not ok
        print(f"   {e['ore']:6s} ({e['x']},{e['y']}) {kinds} 합 {int(float(amt)):,}{'' if ok else '  <- 섞임/없음'}")
    return bad


def power_now(ai):
    reply = ai.lua("""(function()
      local s, f, out, seen = game.surfaces[1], game.forces.player, {}, {}
      for _, p in pairs(s.find_entities_filtered{name = "small-electric-pole", force = f}) do
        local n = p.electric_network_id
        if n and not seen[n] then
          seen[n] = true
          local st, sum = p.electric_network_statistics, 0
          for name, _ in pairs(st.input_counts) do
            sum = sum + st.get_flow_count{name = name, category = "input", precision_index = defines.flow_precision_index.one_minute, count = false}
          end
          local gen = 0
          for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
            if g.electric_network_id == n then gen = gen + 900 end
          end
          out[#out+1] = string.format("망 %d: 소비 (1분 평균) %.0f kW / 상한 %.0f kW", n, sum * 60 / 1000, gen)
        end
      end
      return out
    end)()""")
    for r in p1._rows(reply):
        print("  ", r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--draw", action="store_true")
    ap.add_argument("--snapshot", action="store_true")
    ap.add_argument("--stage", default="")
    ap.add_argument("--who", default="")
    ap.add_argument("--recipes", action="store_true")
    ap.add_argument("--ores", action="store_true")
    ap.add_argument("--power", action="store_true")
    args = ap.parse_args()
    if args.snapshot:
        from client import AIBridge
        snapshot(AIBridge())
        return 0
    st = layout()
    if args.draw:
        for box in ((-68, -108, -38, -84), (-70, -50, -40, -18), (-86, -24, -66, 48)):
            draw(st, box)
            print()
    if args.check:
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 기존 것과 겹침 0 · 팔 집는/놓는 칸 · 레인 한 품목 · 기존 줄과 안 엉킴 · "
                                         "전력 덮개 · 전선 7.5 모두 통과")
        n = counts(st)
        print("  수량:", n)
        nets = sorted(set().union(*pole_nets(st).values()))
        print(f"  전봇대 새로 {sum(len(v) for k, v in st.items() if k.endswith('_poles'))} · 이어지는 기존 망 {nets}"
              + ("  (망 둘을 잇는다 = 7.2MW 한 망)" if len(nets) > 1 else ""))
        print(f"  최대 전력 {power_kw(n) / 1000:.2f} MW (새것만, 팔이 다 움직일 때)")
        sts = stages()
        for k, v in sts.items():
            print(f"  {k:9s} {len(v)}")
        return 1 if bad else 0
    from client import AIBridge
    import detached
    p1.COST.update({AM: {"iron-plate": 22, "copper-plate": 4.5}, FAST: {"iron-plate": 8, "copper-plate": 4.5},
                    LONG: {"iron-plate": 7, "copper-plate": 1.5}, UG: {"iron-plate": 8.75}})
    p1.PAIRED.add(UG)
    p1.PARK = PARK
    ai = AIBridge()
    sts = stages()
    if args.stage and args.stage not in sts:
        print(f"단계 {args.stage} 없음: {list(sts)}")
        return 2
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
    if args.power:
        power_now(ai)
    if args.recipes:
        set_recipes(ai, (args.who or "golf").split(",")[0])
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p25"
    detached.mark(crew, "p25", minutes=180)
    try:
        prep(ai, crew, sts[args.stage])
        ok = p1.build_stage(ai, crew, sts[args.stage], args.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

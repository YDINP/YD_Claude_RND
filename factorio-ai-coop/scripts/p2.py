"""P2 builder for run 22: red+green science at T2 rate (0.75/s each) + 10 labs + ammo.

배치는 순수 함수 layout() 하나가 정한다. check() 가 서버 없이 겹침·팔의 집는 칸/놓는 칸·
레인(한 레인 = 한 품목)·전력(소형 전봇대 덮개·전선 7.5)을 확인한다.

    python scripts/p2.py --check                  # 오프라인 확인 + 그림
    python scripts/p2.py                          # 단계별로 몇 개 섰나 · 막힌 자리
    python scripts/p2.py --stage chain --who charlie,delta,echo,foxtrot
    python scripts/p2.py --recipes                # 조립기 레시피 (GUI 에서 고르는 것)
    python scripts/p2.py --measure 180            # 팩/초 · 연구소 가동

좌표는 타일 번호 (x, y) - 엔티티 가운데는 +0.5. 3x3 는 가운데 타일 번호.

흐름 (ratio.py automation-science-pack=0.75 logistic-science-pack=0.75, 조립기 1형):
    철 합류: x=-5 판 줄 -> y=-19 동쪽 -> x=5 판 줄 옆치기 (두 레인 모두 철, 약 6/s)
    척추 x=5 남향 -> G1(빨강 톱니) -> y=10 서향(줄 2: G3·BA·IA·G2) -> x=-19 북향
      -> y=0 동향(줄 1: CI -> AMMO) 끝. 뱀처럼 한 줄 - 탄약이 맨 끝이라 남는 철만 먹는다.
    구리: x=-29 판 줄(동쪽 레인) + x=-39 판 줄을 지하로 넘겨 «동쪽에서» 옆치기 -> 둘 다 동쪽 레인.
      y=-1 동향 (구리 = 북쪽 레인): C1·C2 가 긴팔로 집는다 -> x=-1 남향이 곧 R-in.
      G1 이 서쪽 레인에 톱니를 얹는다 -> y=25 서향 = 빨강 줄 입력 (구리 남쪽 · 톱니 북쪽).
    전자: C1 -> CI <- C2 (직결), CI -> IA (직결), G2 -> IA, G3 -> BA (직결).
      IA·BA 가 x=-10 남향 G-in 양쪽에서 얹는다 -> y=13 서향 = 초록 줄 입력.
    팩 벨트 y=19 서향: 초록(북쪽 줄) -> 남쪽 레인, 빨강(남쪽 줄) -> 북쪽 레인 -> x=-38 남향, 연구소 10.
"""
import argparse
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

N, E, S, W = 0, 4, 8, 12
VEC = {N: (0, -1), E: (1, 0), S: (0, 1), W: (-1, 0)}
BELT, UG, INS, FAST, LONG = ("transport-belt", "underground-belt", "inserter",
                             "fast-inserter", "long-handed-inserter")
AM, LAB, POLE = "assembling-machine-1", "lab", "small-electric-pole"
ARMS = {INS: 1, FAST: 1, LONG: 2}
BIG = {AM, LAB}

RECIPE = {   # 레시피: (재료, 결과)
    "iron-gear-wheel": ({"iron-plate"}, "iron-gear-wheel"),
    "copper-cable": ({"copper-plate"}, "copper-cable"),
    "electronic-circuit": ({"iron-plate", "copper-cable"}, "electronic-circuit"),
    "inserter": ({"electronic-circuit", "iron-gear-wheel", "iron-plate"}, "inserter"),
    "transport-belt": ({"iron-gear-wheel", "iron-plate"}, "transport-belt"),
    "automation-science-pack": ({"copper-plate", "iron-gear-wheel"}, "automation-science-pack"),
    "logistic-science-pack": ({"inserter", "transport-belt"}, "logistic-science-pack"),
    "firearm-magazine": ({"iron-plate"}, "firearm-magazine"),
    LAB: ({"automation-science-pack", "logistic-science-pack"}, None),
}

# 지금 서 있는 것 (P1, 실측 2026-09-24): 판 줄 끝과 그 끝의 임시 받는 곳
SOURCES = [   # (x, y, 방향, 품목, 레인 'L'|'R') - 레인은 벨트 방향 기준 왼쪽/오른쪽
    (-5, -22, S, "iron-plate", "R"),      # x=-4.5 서쪽 레인 (남향의 오른쪽)
    (5, -22, S, "iron-plate", "L"),       # x=5.5 동쪽 레인
    (-29, -38, S, "copper-plate", "L"),   # x=-28.5 동쪽 레인
    (-39, -38, S, "copper-plate", "R"),   # x=-38.5 서쪽 레인
]
TEMP = [  # 판 줄 끝 임시 받는 곳 (팔, 상자) - 버스가 이어받을 때 걷는다
    ((-5, -21), (-5, -20)), ((5, -21), (5, -20)), ((-29, -37), (-29, -36)), ((-39, -37), (-39, -36))]
NET = [(10.5, -15.5), (11.5, -8.5), (11.5, -1.5), (12.5, 5.5), (12.5, 12.5), (13.5, 19.5),
       (13.5, 26.5), (14.5, 33.5)]           # 기존 전봇대 줄 (발전소까지 이어짐)
KEEP_FREE = {(0, -21)}                        # 간선 x=0.5 끝의 앞칸 - 벨트를 놓으면 광석·석탄이 쏟아진다
PARK = (8.5, 16.5)                            # 공사 뒤 비켜 서는 곳 (배치 밖)

C1, CI, C2 = -17, -13, -9                     # 줄 A (가운데 y=3): 구리선 · 회로 · 구리선
G2, IA, BA, G3 = -17, -13, -7, -3            # 줄 B (가운데 y=7)
AMMO = -5                                      # 줄 A 끝 (줄 1 의 끝에서 철)
G1 = (2, 3)                                    # 척추와 R-in 사이
GREEN_XS = [-12 - 3 * i for i in range(9)]    # 초록 가운데 y=16
RED_XS = [-3 - 3 * i for i in range(8)]       # 빨강 가운데 y=22
LAB_YS = [22, 25, 28, 31, 34]
LAB_XS = (-41, -35)                            # 팩 벨트 x=-38 양쪽


def ent(name, x, y, d=None, **kw):
    e = {"name": name, "x": x, "y": y}
    if d is not None:
        e["d"] = d
    e.update(kw)
    return e


def run(x1, y1, x2, y2, d):
    """(x1,y1) 부터 (x2,y2) 까지 한 방향 벨트 (끝 포함)."""
    out = []
    dx, dy = (x2 > x1) - (x2 < x1), (y2 > y1) - (y2 < y1)
    x, y = x1, y1
    while True:
        out.append(ent(BELT, x, y, d))
        if (x, y) == (x2, y2):
            return out
        x, y = x + dx, y + dy


def ug_pair(x1, y1, x2, y2, d):
    return [ent(UG, x1, y1, d, kind="input"), ent(UG, x2, y2, d, kind="output")]


def layout() -> dict:
    """단계 -> 엔티티 목록. 순수 함수 (게임을 묻지 않는다)."""
    st = {}
    # --- 합류 (마지막에: 임시 받는 곳을 걷고 잇는다)
    iron = run(-5, -21, -5, -20, S) + [ent(BELT, -5, -19, E)] + run(-4, -19, 4, -19, E) + run(5, -21, 5, -20, S)
    copper = (run(-29, -37, -29, -2, S) + [ent(BELT, -29, -1, E)]
              + run(-39, -37, -39, -37, S) + [ent(BELT, -39, -36, E)] + run(-38, -36, -31, -36, E)
              + ug_pair(-30, -36, -28, -36, E) + [ent(BELT, -27, -36, S), ent(BELT, -27, -35, W), ent(BELT, -28, -35, W)])
    st["hookup"] = iron + copper
    # --- 척추 · 뱀 · 구리/R-in
    belts = (run(5, -19, 5, 9, S) + [ent(BELT, 5, 10, W)] + run(4, 10, -18, 10, W)
             + [ent(BELT, -19, 10, N)] + run(-19, 9, -19, 1, N) + [ent(BELT, -19, 0, E)] + run(-18, 0, -5, 0, E)
             + run(-28, -1, -2, -1, E) + [ent(BELT, -1, -1, S)] + run(-1, 0, -1, 8, S))
    # 줄 2 를 지하로 넘는 둘: R-in (x=-1), G-in (x=-10). 입구는 곧게 들어온다 (옆치기 금지)
    belts += ug_pair(-1, 9, -1, 11, S) + run(-1, 12, -1, 24, S) + [ent(BELT, -1, 25, W)] + run(-2, 25, -25, 25, W)
    belts += run(-10, 7, -10, 8, S) + ug_pair(-10, 9, -10, 11, S) + [ent(BELT, -10, 12, S), ent(BELT, -10, 13, W)]
    belts += run(-11, 13, -36, 13, W)
    belts += run(-2, 19, -37, 19, W) + [ent(BELT, -38, 19, S)] + run(-38, 20, -38, 35, S)
    belts += run(-2, 3, -2, 1, N)                  # 탄창 줄 (P3 포탑 보급이 여기서 잇는다)
    st["belts"] = belts
    # --- 전자·톱니 사슬
    chain = [ent(AM, C1, 3, recipe="copper-cable"), ent(AM, CI, 3, recipe="electronic-circuit"),
             ent(AM, C2, 3, recipe="copper-cable"), ent(AM, AMMO, 3, recipe="firearm-magazine"),
             ent(AM, G2, 7, recipe="iron-gear-wheel"), ent(AM, IA, 7, recipe="inserter"),
             ent(AM, BA, 7, recipe="transport-belt"), ent(AM, G3, 7, recipe="iron-gear-wheel"),
             ent(AM, G1[0], G1[1], recipe="iron-gear-wheel"),
             ent(LONG, C1, 1, N), ent(FAST, CI, 1, N), ent(LONG, C2, 1, N), ent(INS, AMMO, 1, N),
             ent(FAST, C1 + 2, 3, W), ent(FAST, C2 - 2, 3, E), ent(INS, AMMO + 2, 3, W),
             ent(FAST, CI, 5, N),
             ent(FAST, G2 + 2, 7, W), ent(FAST, IA + 2, 7, W), ent(FAST, BA - 2, 7, E), ent(FAST, G3 - 2, 7, E),
             ent(FAST, G2, 9, S), ent(FAST, IA, 9, S), ent(INS, BA, 9, S), ent(FAST, G3, 9, S),
             ent(FAST, G1[0] - 2, G1[1], E), ent(FAST, G1[0] + 2, G1[1], E)]
    st["chain"] = chain
    # --- 과학 줄
    sci = []
    for x in GREEN_XS:
        sci += [ent(AM, x, 16, recipe="logistic-science-pack"), ent(INS, x, 14, N), ent(INS, x, 18, N)]
    for x in RED_XS:
        sci += [ent(AM, x, 22, recipe="automation-science-pack"), ent(INS, x, 24, S), ent(INS, x, 20, S)]
    st["science"] = sci
    labs = []
    for y in LAB_YS:
        labs += [ent(LAB, LAB_XS[0], y), ent(INS, -39, y, E), ent(LAB, LAB_XS[1], y), ent(INS, -37, y, W)]
    st["labs"] = labs
    st["poles"] = [ent(POLE, x, y) for x, y in poles(st)]
    return st


# ------------------------------------------------------------------ 오프라인 확인

def tiles(e):
    r = 1 if e["name"] in BIG else 0
    return [(e["x"] + dx, e["y"] + dy) for dx in range(-r, r + 1) for dy in range(-r, r + 1)]


def occupancy(ents):
    occ, clash = {}, []
    for e in ents:
        for t in tiles(e):
            if t in occ:
                clash.append((t, occ[t]["name"], e["name"]))
            occ[t] = e
    return occ, clash


POWERED = {AM, LAB, INS, FAST, LONG}


def poles(st):
    """소형 전봇대 (덮개 5x5, 전선 7.5): 기존 줄에 이어지면서 전기 쓰는 것을 다 덮는 욕심 배치."""
    ents = [e for k, v in st.items() if k != "poles" for e in v]
    occ, _ = occupancy(ents)
    need = [e for e in ents if e["name"] in POWERED]
    todo = set(range(len(need)))
    xs = [t[0] for t in occ]
    ys = [t[1] for t in occ]
    cand = [(x, y) for x in range(min(xs) - 1, max(xs) + 2) for y in range(min(ys) - 1, max(ys) + 2)
            if (x, y) not in occ and (x, y) not in KEEP_FREE and not near_temp(x, y)]
    covers = {c: {i for i in todo if any(abs(t[0] - c[0]) <= 2 and abs(t[1] - c[1]) <= 2 for t in tiles(need[i]))}
              for c in cand}
    net = [(x - 0.5, y - 0.5) for x, y in NET]      # 타일 번호로
    chosen = []
    while todo:
        reach = [c for c in cand if c not in chosen and any(math.dist(c, p) <= 7.5 for p in net + chosen)]
        best = max(reach, key=lambda c: (len(covers[c] & todo), -min(math.dist(c, (need[i]["x"], need[i]["y"])) for i in todo)))
        if not covers[best] & todo:
            # 덮을 것이 없으면 남은 것 쪽으로 한 걸음 (중계)
            tgt = min(((need[i]["x"], need[i]["y"]) for i in todo), key=lambda q: min(math.dist(q, c) for c in reach))
            best = min(reach, key=lambda c: math.dist(c, tgt))
        chosen.append(best)
        todo -= covers[best]
    return chosen


def near_temp(x, y):
    return y < -18 and -40 <= x <= 6


def trace(st):
    """벨트 레인 추적: {(x,y): {'L': 품목집합, 'R': 품목집합}} 과 문제 목록."""
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    belt = {(e["x"], e["y"]): e for e in ents if e["name"] in (BELT, UG)}
    for x, y, d, item, lane in SOURCES:
        belt.setdefault((x, y), ent(BELT, x, y, d))
    lanes = {k: {"L": set(), "R": set()} for k in belt}
    problems = []

    def left_of(d):
        return {N: W, E: N, S: E, W: S}[d]

    def feeds_into(k):
        """k 로 들어오는 벨트: [(출발, '뒤'|'옆', 옆이면 어느 쪽 방향)]"""
        out = []
        x, y = k
        d = belt[k]["d"]
        for q, e in belt.items():
            if q == k:
                continue
            if e["name"] == UG and e.get("kind") == "input":
                continue
            fx, fy = VEC[e["d"]]
            if (q[0] + fx, q[1] + fy) != (x, y):
                continue
            out.append((q, "back" if e["d"] == d else "side"))
        return out

    def ug_exit(k):
        e = belt[k]
        fx, fy = VEC[e["d"]]
        for i in range(1, 6):
            q = (k[0] + fx * i, k[1] + fy * i)
            if q in belt and belt[q]["name"] == UG and belt[q].get("kind") == "output" and belt[q]["d"] == e["d"]:
                return q
        problems.append(f"지하 입구 {k} 에 짝 출구가 없다")
        return None

    for x, y, d, item, lane in SOURCES:
        lanes[(x, y)][lane].add(item)
    # 팔이 벨트에 놓는 것: 먼 레인
    arms = [e for e in ents if e["name"] in ARMS]
    for _ in range(80):
        changed = False
        for a in arms:
            r = ARMS[a["name"]]
            px, py = VEC[a["d"]]
            src = (a["x"] + px * r, a["y"] + py * r)
            dst = (a["x"] - px * r, a["y"] - py * r)
            if dst not in belt:
                continue
            item = made(occ.get(src))
            if item is None:
                continue
            bd = belt[dst]["d"]
            # 팔이 벨트의 어느 옆에 있나 -> 먼 레인
            side = (a["x"] - dst[0], a["y"] - dst[1])
            if side == VEC[left_of(bd)]:
                ln = "R"
            elif side == tuple(-v for v in VEC[left_of(bd)]):
                ln = "L"
            else:
                problems.append(f"팔 {a['x'],a['y']} 이 벨트 {dst} 의 앞/뒤에서 놓는다 (레인 불명)")
                continue
            if item not in lanes[dst][ln]:
                lanes[dst][ln].add(item)
                changed = True
        for k, e in belt.items():
            for q, how in feeds_into(k):
                src_l = lanes[q]
                if how == "back" or (how == "side" and is_curve(k, belt, feeds_into)):
                    for ln in "LR":
                        if not src_l[ln] <= lanes[k][ln]:
                            lanes[k][ln] |= src_l[ln]
                            changed = True
                else:
                    # 옆치기: 가까운 레인으로 다 들어간다
                    fromv = (q[0] - k[0], q[1] - k[1])
                    ln = "L" if fromv == VEC[left_of(e["d"])] else "R"
                    if belt[q]["name"] == UG:
                        problems.append(f"지하 출구 {q} 가 옆치기")
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
                if any(how == "side" for _, how in feeds_into(k)):
                    problems.append(f"지하 입구 {k} 가 옆에서 받는다 - 한 레인만 넘어간다")
        if not changed:
            break
    for k, v in lanes.items():
        for ln in "LR":
            if len(v[ln]) > 1:
                problems.append(f"레인 섞임 {k} {ln}: {sorted(v[ln])}")
    return lanes, problems


def is_curve(k, belt, feeds_into):
    ins = feeds_into(k)
    return len(ins) == 1 and ins[0][1] == "side" and belt[k]["name"] == BELT


def made(e):
    if e is None:
        return None
    if e["name"] == AM:
        return RECIPE[e["recipe"]][1]
    return None


def check(st) -> list:
    ents = [e for v in st.values() for e in v]
    occ, clash = occupancy(ents)
    bad = [f"겹침 {t}: {a} / {b}" for t, a, b in clash]
    bad += [f"비워 둘 칸 {t}" for t in KEEP_FREE if t in occ]
    lanes, probs = trace(st)
    bad += probs
    # 팔: 집는 칸 / 놓는 칸 에 무엇이 있고, 필요한 것이 거기 오나
    for a in (e for e in ents if e["name"] in ARMS):
        r = ARMS[a["name"]]
        px, py = VEC[a["d"]]
        src = occ.get((a["x"] + px * r, a["y"] + py * r)) or (
            {"name": BELT} if (a["x"] + px * r, a["y"] + py * r) in lanes else None)
        dst = occ.get((a["x"] - px * r, a["y"] - py * r))
        at = (a["x"], a["y"])
        if src is None or dst is None:
            bad.append(f"팔 {at}: 집는 칸 {src and src['name']} / 놓는 칸 {dst and dst['name']}")
            continue
        if dst["name"] in (AM, LAB):
            want = RECIPE[dst["recipe"] if dst["name"] == AM else LAB][0]
            if src["name"] in (BELT, UG):
                k = (a["x"] + px * r, a["y"] + py * r)
                have = lanes[k]["L"] | lanes[k]["R"]
            else:
                have = {made(src)}
            if not want & have:
                bad.append(f"팔 {at}: {dst.get('recipe', dst['name'])} 에 줄 것이 없다 (거기 {sorted(have)})")
    # 조립기 재료가 다 오나
    for m in (e for e in ents if e["name"] in (AM, LAB)):
        want = set(RECIPE[m["recipe"] if m["name"] == AM else LAB][0])
        got = set()
        for a in (e for e in ents if e["name"] in ARMS):
            r = ARMS[a["name"]]
            px, py = VEC[a["d"]]
            if occ.get((a["x"] - px * r, a["y"] - py * r)) is not m:
                continue
            k = (a["x"] + px * r, a["y"] + py * r)
            s = occ.get(k)
            got |= (lanes[k]["L"] | lanes[k]["R"]) if k in lanes else {made(s)}
        if want - got:
            bad.append(f"{m.get('recipe', m['name'])} ({m['x']},{m['y']}): 모자람 {sorted(want - got)}")
    # 전력
    ps = [e for e in st["poles"]]
    for e in ents:
        if e["name"] in POWERED and not any(
                any(abs(t[0] - p["x"]) <= 2 and abs(t[1] - p["y"]) <= 2 for t in tiles(e)) for p in ps):
            bad.append(f"전기 없음 {e['name']} {e['x'], e['y']}")
    return bad


def draw(st, box=(-43, -38, 10, 36)):
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    sym = {BELT: None, UG: "u", INS: "i", FAST: "f", LONG: "l", POLE: "p", LAB: "L"}
    arrow = {N: "^", E: ">", S: "v", W: "<"}
    rec = {"copper-cable": "c", "electronic-circuit": "e", "inserter": "I", "transport-belt": "b",
           "iron-gear-wheel": "g", "automation-science-pack": "R", "logistic-science-pack": "G",
           "firearm-magazine": "a"}
    x1, y1, x2, y2 = box
    for y in range(y1, y2 + 1):
        row = []
        for x in range(x1, x2 + 1):
            e = occ.get((x, y))
            if e is None:
                row.append("." if (x, y) not in KEEP_FREE else "!")
            elif e["name"] == BELT:
                row.append(arrow[e["d"]])
            elif e["name"] == AM:
                row.append(rec[e["recipe"]])
            else:
                row.append(sym[e["name"]])
        print(f"{y:4d} {''.join(row)}")


def lane_table(st):
    lanes, _ = trace(st)
    probes = {"철 합류 (0,-19)": (0, -19), "척추 (5,0)": (5, 0), "줄 2 (-5,10)": (-5, 10), "줄 1 (-10,0)": (-10, 0),
              "구리 x=-29 (-29,-20)": (-29, -20), "구리 y=-1 (-20,-1)": (-20, -1), "R-in (-1,5)": (-1, 5),
              "R-in 줄 (-10,25)": (-10, 25), "G-in (-10,12)": (-10, 12), "G-in 줄 (-20,13)": (-20, 13),
              "팩 (-20,19)": (-20, 19), "팩 연구소 (-38,30)": (-38, 30), "탄창 (-2,1)": (-2, 1)}
    names = {N: "북", E: "동", S: "남", W: "서"}
    for label, k in probes.items():
        v = lanes.get(k)
        if not v:
            print(f"  {label}: (없음)")
            continue
        # 레인을 지리로: 왼쪽 레인의 방위
        d = ([e for s in st.values() for e in s if (e["x"], e["y"]) == k and e["name"] in (BELT, UG)] or [{"d": S}])[0]["d"]
        lft = {N: W, E: N, S: E, W: S}[d]
        rgt = {N: E, E: S, S: W, W: N}[d]
        print(f"  {label:22s} {names[d]}향 · {names[lft]}쪽 레인 {sorted(v['L']) or '-'} · {names[rgt]}쪽 레인 {sorted(v['R']) or '-'}")


# ------------------------------------------------------------------ 게임

def steps_of(ents):
    out = []
    for e in ents:
        p = {"name": e["name"], "x": e["x"] + 0.5, "y": e["y"] + 0.5}
        if "d" in e:
            p["direction"] = e["d"]
        if "kind" in e:
            p["type"] = e["kind"]
        out.append(("build", p))
    return out


def stand_spots(st):
    """사람이 서도 되는 칸: 배치의 어떤 것에도 안 걸리는 칸 (벨트 위는 떠밀린다)."""
    ents = [e for v in st.values() for e in v]
    occ, _ = occupancy(ents)
    return occ


def spot_near(occ, x, y, taken):
    best = None
    for r in range(2, 7):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:
                    continue
                t = (math.floor(x) + dx, math.floor(y) + dy)
                # 사람 몸이 걸치는 이웃 칸까지 비어야 한다
                if any((t[0] + a, t[1] + c) in occ for a in (-1, 0, 1) for c in (-1, 0, 1)):
                    continue
                if t in taken:
                    continue
                d = math.dist(t, (x, y))
                if best is None or d < best[0]:
                    best = (d, t)
        if best:
            return best[1][0] + 0.5, best[1][1] + 0.5
    return x + 3.0, y + 3.0


def build_stage(ai, crew, st, name, rounds=8):
    import p1
    from orders import submit
    from client import RconError
    p1.COST.update({
        AM: {"iron-plate": 22, "copper-plate": 4.5},
        FAST: {"iron-plate": 8, "copper-plate": 4.5},
        LONG: {"iron-plate": 7, "copper-plate": 1.5},
        LAB: {"iron-plate": 36, "copper-plate": 15},
        UG: {"iron-plate": 8.75},
    })
    p1.PAIRED.add(UG)
    occ = stand_spots(st)
    steps = steps_of(st[name])
    for n_round in range(rounds):
        up = p1.standing(ai, steps)
        todo = [s for s in steps if (s[1]["name"], s[1]["x"], s[1]["y"]) not in up]
        if not todo:
            print(f"  {name}: 다 섰다 ({len(up)})")
            return True
        bad = {s.split("|")[0]: s.split("|")[1] for s in p1.blocked(ai, todo)}
        hard = {k: v for k, v in bad.items() if v != "tree" and not v.startswith("rock:")}
        if hard:
            print(f"  {name}: 막힌 자리 {len(hard)}: {list(hard.items())[:6]}")
        todo = [s for s in todo if f"{s[1]['name']},{s[1]['x']},{s[1]['y']},{s[1].get('direction', 0)}" not in hard]
        todo.sort(key=lambda s: (round(s[1]["y"] / 6), s[1]["x"]))
        per = max(1, (len(todo) + len(crew) - 1) // len(crew))
        for i, who in enumerate(crew):
            part = todo[i * per:(i + 1) * per][:34]
            if not part:
                continue
            need = {}
            for _, p in part:
                need[p["name"]] = need.get(p["name"], 0) + 1
            lack = p1.short_of(ai, who, need)
            if lack:
                print(f"{who}: {name} - 허브에 재료가 모자라 기다린다 {lack}")
                continue
            plan = p1.fetch(ai, who, need)
            last = None
            for k, p in part:
                key = f"{p['name']},{p['x']},{p['y']},{p.get('direction', 0)}"
                why = bad.get(key, "")
                if why == "tree":
                    plan.append(("chop", {"x": p["x"], "y": p["y"], "count": 3}))
                elif why.startswith("rock:"):
                    _r, rname, rx, ry = why.split(":")
                    plan.append(("demolish", {"x": float(rx), "y": float(ry), "name": rname, "search_radius": 0.8}))
                if last is None or math.dist(last, (p["x"], p["y"])) > 6:
                    sx, sy = spot_near(occ, p["x"], p["y"], set())
                    plan.append(("walk_to", {"x": sx, "y": sy}))
                    last = (p["x"], p["y"])
                plan.append((k, p))
            plan = plan[:59] + [("walk_to", {"x": PARK[0] + i, "y": PARK[1]})]
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            submit(ai, who, plan, strict=False)
            print(f"{who}: {name} {n_round + 1}순번 ({len(part)}개)")
        t0 = time.time()
        time.sleep(20)
        while time.time() - t0 < 900 and not p1.idle(ai, crew):
            time.sleep(5)
    up = p1.standing(ai, steps)
    print(f"  {name}: {len(up)}/{len(steps)}")
    return False


def set_recipes(ai, st, who):
    for e in st["chain"] + st["science"]:
        if e["name"] == AM:
            r = ai.set_recipe(who, e["x"] + 0.5, e["y"] + 0.5, e["recipe"])
            if r.get("error"):
                print(f"  레시피 {e['recipe']} ({e['x']},{e['y']}): {r['error']}")


def measure(ai, st, secs):
    """조립기 products_finished 차이 -> 초당, 연구소 가동."""
    ams = [e for e in st["chain"] + st["science"] if e["name"] == AM]
    q = ";".join(f"{e['x'] + 0.5},{e['y'] + 0.5}" for e in ams)
    lua = """(function()
      local s, out = game.surfaces[1], {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        local m = s.find_entities_filtered{name = "assembling-machine-1", position = {tonumber(x), tonumber(y)}, radius = 0.4}[1]
        out[#out+1] = m and string.format("%%s|%%d|%%d", m.get_recipe() and m.get_recipe().name or "-", m.products_finished, m.status) or "none|0|0"
      end
      local work, labs = 0, 0
      for _, l in pairs(s.find_entities_filtered{name = "lab", area = {{-43, 20}, {-33, 37}}}) do
        labs = labs + 1
        if l.status == defines.entity_status.working then work = work + 1 end
      end
      out[#out+1] = "labs|" .. labs .. "|" .. work
      out[#out+1] = "tick|" .. game.tick .. "|0"
      return out
    end)()""" % q
    a = [str(r).split("|") for r in _rows(ai.lua(lua))]
    samples = []
    t_end = time.time() + secs
    while time.time() < t_end:
        time.sleep(15)
        b = [str(r).split("|") for r in _rows(ai.lua(lua))]
        samples.append((int(b[-2][1]), int(b[-2][2])))
    b = [str(r).split("|") for r in _rows(ai.lua(lua))]
    dt = (int(b[-1][1]) - int(a[-1][1])) / 60.0
    per = {}
    status = {}
    for e, x, y in zip(ams, a, b):
        per[e["recipe"]] = per.get(e["recipe"], 0) + (int(y[1]) - int(x[1]))
        status.setdefault(e["recipe"], []).append(int(y[2]))
    print(f"  {dt:.0f}초")
    for r, n in per.items():
        print(f"  {r:26s} {n / dt:.3f}/s  ({n}개)")
    if samples:
        print(f"  연구소 {samples[-1][0]}대 · 가동 평균 {sum(w for _, w in samples) / max(1, sum(l for l, _ in samples)) * 100:.0f}%")
    return per, dt


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


ORDER = ("chain", "belts", "science", "labs", "poles", "hookup")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--stage", default="", choices=("",) + ORDER)
    ap.add_argument("--who", default="")
    ap.add_argument("--recipes", action="store_true")
    ap.add_argument("--measure", type=int, default=0)
    args = ap.parse_args()
    st = layout()
    if args.check:
        draw(st)
        bad = check(st)
        print("\n".join(bad) if bad else "확인: 겹침 0 · 팔 연결 · 레인 한 품목 · 전력 덮개 모두 통과")
        lane_table(st)
        n = {}
        for v in st.values():
            for e in v:
                n[e["name"]] = n.get(e["name"], 0) + 1
        print("  수량:", n)
        return 1 if bad else 0
    from client import AIBridge
    import detached
    import p1
    ai = AIBridge()
    for name in ORDER:
        steps = steps_of(st[name])
        print(f"  {name}: {len(p1.standing(ai, steps))}/{len(steps)} · 막힘 {len(p1.blocked(ai, steps))}")
    if args.recipes:
        set_recipes(ai, st, (args.who or "charlie").split(",")[0])
    if args.measure:
        measure(ai, st, args.measure)
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p2"
    detached.mark(crew, "p2", minutes=180)
    ok = build_stage(ai, crew, st, args.stage)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

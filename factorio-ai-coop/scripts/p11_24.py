"""P11 for run 24: second oil field - three pumpjacks at the south-west wells, crude home by underground pipe, two more refineries.

사용자 결정 (2026-09-30) 그대로:
  (1) Lua relay 금지 - 이 파일에는 inv.remove → insert 가 없다. 탄 · 펌프 · 정유는 사람 손 (take · craft · insert · build) → 상자 / 망 저장 → 로봇.
  (2) 못 놓는 자리에 짓기 금지 - 전초는 사람이 build (게임 충돌 검사), 기지 안 정유는 로봇 유령 (can_place manual).
      관 · 전봇대 자리는 `--plan` 이 칸마다 재서 고른다 (나무 · 바위는 짓기 루프가 치우고, 절벽 · 벽 칸은 지하관 쌍의 끝이 비켜 간다).
  (3) 벌레 둥지를 치워야 하는 곳은 고르지 않는다 (E24 크립 실패 - 포탑 20 잃음).

부지 고르기 (04:5x 조회, 걸어서 본 청크의 crude-oil 만 - force.chart 없음):
    북서 (-347,-218) 우물 8 · ~104/s : 무리 A 가 우물에서 12~37 칸 (둥지 3 → 4 + 작은 벌레), 둘째 무리 (-455,-240) 둥지 5 + 작은 벌레 105 칸,
                                   반경 250 안 구조물 27 · 유닛 83 → 벌레 둥지를 치워야 한다 → 버림
    남서 (-446.5,253.5) 우물 1 (245k) : 반경 80 안 적 0, 가장 가까운 것 (-378,313) 둥지 무리 (중형 벌레 2) 91 · 유닛은 둥지 곁 89~110 (떠도는 무리 없음) → 고름
    05:04 정찰 걸음이 서쪽 청크 (y 160~191 · x -512..-321) 를 보자 **우물 둘이 더** : (-459.5,252.5) 855k · (-468.5,251.5) 693k
    → 우물 셋 = 245k + 855k + 693k = 1.79M → 598% × 채굴 생산성 1.1 = **원유 ~66/s** (지금 유전 15.5/s).

셈:
    원유 15.5 + 66 = 81/s. 정유 둘 (고급 20/s + 기본 20/s = 40/s) 로는 모자람 → **기본 정유 둘 더** (R3 · R4, 각 20/s → 80/s).
      기본 정유 (원유 100 → 석유가스 45) 는 물 · 중유 · 경유가 없어 막힐 일이 없다. 현지 정유는 물 · 전력 · 방어를 새로 세워야 해 버림 → 원유를 관으로.
      석유가스: 기본 3 × 9 + 고급 11 + 분해 ~8 ≈ 46/s (지금 10.6/s). 플라스틱 화학 둘 = 석유가스 40/s 받이 → 플라스틱 공장은 안 늘림 (석탄이 먼저 모자람).
    관: 2.0 유체 구간 상한 320 (22회차: 넘으면 경고 없이 안 흐름) → 펌프 둘로 셋으로 끊는다:
      모음 관 (-466.5..-444.5, 248.5) → x -444.5 북 (90) → y 158.5 동 → 펌프 P1 (-320,158.5) = ~240 · P1 → 동 (126) → x -192.5 북 (121) → 펌프 P2 (-192.5,37) = ~247 ·
      P2 → 유전 세로 관 끝 (-192.5,33.5) = 기존 구간 (정유까지 ~100). 66/s 는 관 한 줄 (구간마다 수천/s) 의 몇 % - 줄 하나로 넉넉.
    지하관은 10 칸마다 한 쌍 (입구 → 출구 거리 9 - 기존 유전 줄과 같은 간격) = 94 개.
    전력: 작은 전봇대 67 (유전 (-188.5,30.5) → x -190.5 남 → y 156.5 서 → x -442.5 남). 펌프잭 3 × 90 kW + 펌프 2 × 30 + 팔 20 × 13 ≈ 0.6 MW.
    방어: 포탑 무리 넷 (세로 2 · 가로 2, 16 대) + 벽 고리 x -482.5 ~ -434.5 · y 245.5 ~ 265.5, 사람 틈 (-470.5,245.5).
      출정 조건 (반경 80) 을 짓는 동안에도 지키려고 둥지 곁 유닛 (-385,319) 에서 83 칸 밖에만 짓는다 → 남동 모서리는 원을 따라 계단 벽.
      탄은 사람이 채운 상자 → 팔 → 짧은 벨트 → 팔 → 포탑 (p10 꼴). 망 밖이라 로봇 보충 없음 - 상자를 사람이 다시 채운다.

    python scripts/p11_24.py --run run24 --plan            # 칸 재기 → state/run24_p11.json (관 · 전봇대 자리)
    python scripts/p11_24.py --run run24 --measure         # 출정 조건 (경로 선분 반경 80 · 부지 반경 80 적 0)
    python scripts/p11_24.py --run run24 --scout hotel
    python scripts/p11_24.py --run run24 --check def,pipe,power
    python scripts/p11_24.py --run run24 --build power --crew echo
    python scripts/p11_24.py --run run24 --pumps echo      # 엔진 2 → 펌프 2 손제작
    python scripts/p11_24.py --run run24 --fill bag --crew hotel      # 가방 탄창을 상자 넷에 고루
    python scripts/p11_24.py --run run24 --fill ammo --crew hotel --per 60
    python scripts/p11_24.py --run run24 --refine kit --crew hotel    # 정유 2 손제작 → 망 저장 상자
    python scripts/p11_24.py --run run24 --refine ghost    # R3 · R4 · 관 · 전봇대 유령 (로봇)
    python scripts/p11_24.py --run run24 --status
"""
import argparse
import json
import math
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
INS, BELT, CHEST, POLE, TUR, WALL = "inserter", "transport-belt", "iron-chest", "small-electric-pole", "gun-turret", "stone-wall"
PIPE, PTG, PJ, PUMP = "pipe", "pipe-to-ground", "pumpjack", "pump"
OWNER = "p11"
SITE = (-458.0, 253.0)
STATE = os.path.join(HERE, "..", "state", "run24_p11.json")
PTG_GAP = 9                              # 입구 → 출구 거리 (기존 유전 줄 (-191.5 → -182.5) 과 같다. 최대 10)

GROUPS = {"def": [], "pipe": [], "power": []}
_CUR = ["def"]


def add(name, x, y, d=N):
    GROUPS[_CUR[0]].append((name, float(x), float(y), d))


# --- 우물 셋 (05:04 정찰 걸음이 서쪽 청크를 보자 우물 둘이 더 나왔다) - 펌프잭 dir E, 출구 (+2,-1) (기존 유전 펌프잭 dir 4 와 같은 꼴) -----
WELLS = [(-446.5, 253.5), (-459.5, 252.5), (-468.5, 251.5)]
HEADER_Y = 248.5                         # 모음 관 (보통 관) - 우물 출구에서 북으로 올라와 동쪽 끝 (-444.5,248.5) 에서 줄기로
HEADER = [(x + 0.5, HEADER_Y) for x in range(-467, -444)]
for _wx, _wy in WELLS:
    _ox, _oy = _wx + 2, _wy - 1
    HEADER += [(_ox, y + 0.5) for y in range(int(HEADER_Y + 0.5), int(_oy - 0.5) + 1)]

# --- 관 고정점 (모음 관 · 모서리 · 펌프 앞뒤 · 유전 이음) - 사이는 --plan 이 지하관 쌍으로 채운다 ---------------------------
A0 = (-444.5, HEADER_Y)
C1 = (-444.5, 158.5)
P1 = (-320.0, 158.5)                     # 펌프 dir E: 입구 (-321.5) · 출구 (-318.5)
P1_IN, P1_OUT = (-321.5, 158.5), (-318.5, 158.5)
C2 = (-192.5, 158.5)
P2 = (-192.5, 37.0)                      # 펌프 dir N: 입구 (38.5) · 출구 (35.5)
P2_IN, P2_OUT = (-192.5, 38.5), (-192.5, 35.5)
JOIN = (-192.5, 34.5)                    # 기존 유전 세로 관 끝 (-192.5,33.5) 바로 밑
FIXED_PIPES = sorted(set(HEADER)) + [C1, P1_IN, P1_OUT, C2, P2_IN, P2_OUT, JOIN]
RUNS = [(A0, C1, "N"), (C1, P1_IN, "E"), (P1_OUT, C2, "E"), (C2, P2_IN, "N")]
PTG_DIRS = {"N": (S, N), "E": (W, E)}    # (입구 방향 = 관 연결이 뒤를 봄, 출구 방향 = 앞을 봄)

# --- 전봇대 줄 (작은, 7 칸) -------------------------------------------------------------------------------------------
POLE0 = (-188.5, 30.5)                   # 유전 망의 기존 전봇대
POLE_PATH = [(-190.5, 37.5), (-190.5, 156.5), (-442.5, 156.5), (-442.5, 244.5)]
POLE_FORCE = [(-190.5, 37.5), (-320.5, 156.5)]     # P2 · P1 공급 (5x5 안)

# --- def: 포탑 무리 넷 + 벽 고리 ----------------------------------------------------------------------------------------
#   출정 조건 (경로 반경 80 적 0) 을 짓는 동안에도 지키려고, 둥지 곁 유닛 (-386~-380, 319~) 에서 82 칸 밖에만 짓는다 → 남동 모서리는
#   원 (-385,319) 반지름 83 을 따라 계단 벽.
NEST_U = (-385.0, 319.0)
KEEP_R = 83.0
_CUR[0] = "def"


def vcluster(cx, cy):
    """세로 무리 (p10 꼴): 상자 (cx+.5, cy-5.5) → 팔 → 벨트 x cx+.5 남 → 팔 → 포탑 (cx-2 · cx+3, cy±2)."""
    add(CHEST, cx + 0.5, cy - 5.5)
    add(INS, cx + 0.5, cy - 4.5, N)
    for y in range(cy - 4, cy + 4):
        add(BELT, cx + 0.5, y + 0.5, S)
    for ty in (cy - 2, cy + 2):
        add(TUR, cx - 2, ty)
        add(INS, cx - 0.5, ty - 0.5, E)
        add(TUR, cx + 3, ty)
        add(INS, cx + 1.5, ty - 0.5, W)
    add(POLE, cx + 1.5, cy - 0.5)
    add(POLE, cx - 0.5, cy - 4.5)
    return (cx + 0.5, cy - 5.5)


def hcluster(cx, cy):
    """가로 무리: 상자 (cx-5.5, cy+.5) → 팔 (W 에서 집음) → 벨트 y cy+.5 동 → 팔 → 포탑 (cx-2 · cx+2, cy-2 · cy+3)."""
    add(CHEST, cx - 5.5, cy + 0.5)
    add(INS, cx - 4.5, cy + 0.5, W)
    for x in range(cx - 4, cx + 4):
        add(BELT, x + 0.5, cy + 0.5, E)
    for tx in (cx - 2, cx + 2):
        add(TUR, tx, cy - 2)
        add(INS, tx - 0.5, cy - 0.5, S)
        add(TUR, tx, cy + 3)
        add(INS, tx - 0.5, cy + 1.5, N)
    add(POLE, cx - 0.5, cy - 0.5)
    add(POLE, cx - 5.5, cy - 0.5)
    return (cx - 5.5, cy + 0.5)


AMMO_CHESTS = [vcluster(-440, 252), hcluster(-450, 259), hcluster(-464, 259), vcluster(-476, 253)]
P0 = (-444.5, 254.5)                     # 우물 1 곁
for _p in (P0, (-451.5, 255.5), (-457.5, 254.5), (-462.5, 255.5), (-466.5, 253.5), (-470.5, 254.5)):
    add(POLE, *_p)                       # 우물 1 · 2 · 3 과 무리 전봇대를 잇는 줄 (서로 7.5 안)
WALL_X0, WALL_X1, WALL_Y0, WALL_Y1 = -482.5, -434.5, 245.5, 265.5
WALL_SKIP = {(-470.5, 245.5)}            # 사람 드나드는 틈 (북쪽이 트였다)


def _far(x, y):
    return math.hypot(x - NEST_U[0], y - NEST_U[1]) >= KEEP_R


_wall = []
for _x in range(math.floor(WALL_X0), math.floor(WALL_X1) + 1):
    for _wy in (WALL_Y0, WALL_Y1):
        _wall.append((_x + 0.5, _wy))
for _y in range(int(WALL_Y0 + 0.5), int(WALL_Y1 - 0.5)):
    for _wx in (WALL_X0, WALL_X1):
        _wall.append((_wx, _y + 0.5))
_wall = [p for p in _wall if p not in WALL_SKIP and _far(*p)]
# 계단 벽: 동쪽 벽 끝 ~ 남쪽 벽 끝 사이를 원 밖 첫 칸으로
_prev = None
for _x in range(int(WALL_X1 - 0.5), int(WALL_X0 - 0.5), -1):
    _y = math.floor(NEST_U[1] - math.sqrt(max(0.0, KEEP_R ** 2 - (_x + 0.5 - NEST_U[0]) ** 2)))
    if _y + 0.5 >= WALL_Y1:
        _wall.append((_x + 0.5, WALL_Y1))
        break
    _ys = [_y] if _prev is None else list(range(min(_prev, _y), max(_prev, _y) + 1))
    for _yy in _ys:
        _wall.append((_x + 0.5, _yy + 0.5))
    _prev = _y
_taken = set()
for _n, _x, _y, _d in GROUPS["def"]:
    _sz = 2 if _n == TUR else 1
    for _tx in range(math.floor(_x - _sz / 2 + 0.01), math.ceil(_x + _sz / 2 - 0.01)):
        for _ty in range(math.floor(_y - _sz / 2 + 0.01), math.ceil(_y + _sz / 2 - 0.01)):
            _taken.add((_tx, _ty))
for _p in sorted(set(_wall)):
    if (math.floor(_p[0]), math.floor(_p[1])) not in _taken:      # 계단이 동쪽 무리를 지나는 칸은 무리 (포탑) 가 벽 몫
        add(WALL, *_p)

SEGS = [((66.0, -15.0), (-100.0, -20.0)), ((-100.0, -20.0), (-188.0, 36.0)), ((-188.0, 36.0), (-190.5, 156.5)),
        ((-190.5, 156.5), (-442.5, 156.5)), ((-442.5, 156.5), (-446.5, 253.5))]

# p8_24 의 짓기 · 키트 · 겹침 검사가 이 배치를 쓰게 한다
base.GROUPS = GROUPS
base.OWNER = OWNER
base.SITE = SITE
base.SEGS = SEGS
base.STATE = STATE
base.SIZE.update({PJ: 3, TUR: 2})
base.HUB_BOX = (62, -16.1, 76, -14.9)
base.HUB_KEEP["steel-plate"] = 100
base.PAIRED.add(PTG)
base.COST.update({PTG: {"iron-plate": 7.5}, PIPE: {"iron-plate": 1}, PJ: {"iron-plate": 35, "copper-plate": 7.5, "steel-plate": 5},
                  TUR: {"iron-plate": 40, "copper-plate": 10}, WALL: {"stone-brick": 5}})


# 기지 ↔ 서쪽 길목 (05:12 · 05:21 echo · hotel 둘 다 (-96,34.8) 에 갇힘 - 물 관 x -96.5 · y 35.5 와 호수 · 증기기관 사이 주머니.
#   route.detour 의 격자 경유점이 호수 칸에 떨어져 «설 수 있는 칸» 으로 옮겨진 것이 그 주머니였다). 정찰이 무사히 걸은 길목
#   (-100,-20) → (-140,5) 을 x -100 을 넘는 모든 긴 걸음 앞에 끼운다. 빠져나올 때는 관 하나를 캐고 바로 다시 놓았다 (텔레포트 없음).
import route                             # noqa: E402
CORRIDOR = [(-100.0, -20.0), (-140.0, 5.0)]
_detour0 = route.detour


def _detour(ai, who, steps):
    live = {w["name"]: w for w in ai.list()}
    me = live.get(who)
    if not (me and me.get("x") is not None):
        return _detour0(ai, who, steps)
    cur = (float(me["x"]), float(me["y"]))
    out = []
    for kind, p in steps:
        x, y = p.get("x"), p.get("y")
        if x is not None and y is not None and kind != "craft":
            goal = (float(x), float(y))
            east, west = (cur, goal) if cur[0] > goal[0] else (goal, cur)
            if east[0] > -100 and west[0] < -140:
                pts = CORRIDOR if cur[0] > goal[0] else CORRIDOR[::-1]
                out += [("walk_to", {"x": px, "y": py}) for px, py in pts]
            cur = goal
        out.append((kind, p))
    return _detour0(ai, who, out)


route.detour = _detour


def _load_plan() -> dict:
    try:
        return json.load(open(STATE, encoding="utf-8")).get("plan") or {}
    except (OSError, ValueError):
        return {}


def _apply_plan(plan) -> None:
    GROUPS["pipe"] = [tuple(r) for r in plan.get("pipe", [])]
    GROUPS["power"] = [tuple(r) for r in plan.get("power", [])]


_apply_plan(_load_plan())


def def_tiles() -> set:
    out = set()
    for n, x, y, d in GROUPS["def"]:
        s = base.SIZE.get(n, 1)
        for tx in range(math.floor(x - s / 2 + 0.01), math.ceil(x + s / 2 - 0.01)):
            for ty in range(math.floor(y - s / 2 + 0.01), math.ceil(y + s / 2 - 0.01)):
                out.add((tx, ty))
    return out


def classify(ai, tiles) -> dict:
    """칸마다 '.' 놓임 · 't' 나무 · 'r' 바위 (짓기 루프가 치움) · '#' 절벽 · 물 · 건물 · '?' 안 생긴 땅."""
    out = {}
    tiles = list(tiles)
    for i in range(0, len(tiles), 600):
        part = tiles[i:i + 600]
        r = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local out = {}
          local OWN = {["small-electric-pole"] = true, ["pipe"] = true, ["pipe-to-ground"] = true, ["pump"] = true}
          for _, t in pairs(helpers.json_to_table('%s')) do
            local x, y = t[1] + 0.5, t[2] + 0.5
            local c = "."
            if not s.is_chunk_generated({math.floor(x / 32), math.floor(y / 32)}) then c = "?"
            elseif not s.can_place_entity{name = "pipe-to-ground", position = {x, y}, force = f, build_check_type = defines.build_check_type.manual} then
              c = "#"
              local es = s.find_entities_filtered{area = {{x - 0.45, y - 0.45}, {x + 0.45, y + 0.45}}}
              local hard = false
              local own = false
              for _, q in pairs(es) do
                if q.force == f and OWN[q.name] then own = true end
              end
              for _, q in pairs(es) do
                if own then c = "o"
                elseif q.type == "tree" then if c == "#" then c = "t" end
                elseif q.type == "simple-entity" then if c == "#" then c = "r" end
                elseif q.type ~= "resource" and q.type ~= "character" then hard = true end
              end
              if not own and (hard or s.get_tile(x, y).collides_with("water_tile")) then c = "#" end
            end
            out[#out + 1] = c
          end
          return {s = table.concat(out)}
        end)()""" % json.dumps([list(t) for t in part]))
        for t, c in zip(part, r["s"]):
            out[t] = c
    return out


def _tile(p):
    return (math.floor(p[0]), math.floor(p[1]))


def plan(ai) -> dict:
    """관 (고정점 사이 지하관 쌍) · 전봇대 (7 칸, 막힌 칸은 옆으로) 를 칸 재기로 고른다."""
    reserved = def_tiles() | {_tile(p) for p in FIXED_PIPES} | {(-321, 158), (-320, 158), (-193, 36), (-193, 37)}
    # --- 관
    runs_tiles = []
    for a, b, d in RUNS:
        dx, dy = {"N": (0, -1), "E": (1, 0)}[d]
        n = int(round(abs(b[0] - a[0]) + abs(b[1] - a[1]))) - 1
        runs_tiles.append([(a[0] + dx * k, a[1] + dy * k) for k in range(1, n + 1)])
    cls = classify(ai, {_tile(p) for run in runs_tiles for p in run} | {_tile(p) for p in FIXED_PIPES})
    bad_fixed = [p for p in FIXED_PIPES if cls.get(_tile(p)) in ("#", "?")]
    pipe = [(PJ, wx, wy, E) for wx, wy in WELLS]
    pipe += [(PIPE, x, y, N) for x, y in FIXED_PIPES]
    pipe += [(PUMP, P1[0], P1[1], E), (PUMP, P2[0], P2[1], N)]
    fails = []

    def ok(p):
        t = _tile(p)
        return cls.get(t) in (".", "t", "r", "o") and t not in reserved
    for (a, b, d), tiles in zip(RUNS, runs_tiles):
        din, dout = PTG_DIRS[d]
        i, n = 0, len(tiles)
        while i < n:
            if n - i == 1:
                if ok(tiles[i]):
                    pipe.append((PIPE, tiles[i][0], tiles[i][1], N))
                else:
                    fails.append(("last", tiles[i]))
                i += 1
                continue
            if not ok(tiles[i]):
                fails.append(("entry", tiles[i]))
                break
            best = None
            for j in range(min(i + PTG_GAP, n - 1), i, -1):
                if ok(tiles[j]) and (j == n - 1 or ok(tiles[j + 1])):
                    best = j
                    break
            if best is None:
                fails.append(("gap", tiles[i]))
                break
            pipe.append((PTG, tiles[i][0], tiles[i][1], din))
            pipe.append((PTG, tiles[best][0], tiles[best][1], dout))
            i = best + 1
    pipe_tiles = {_tile((x, y)) for n_, x, y, d in pipe if n_ in (PIPE, PTG)} | reserved
    # --- 전봇대
    path = []
    for (ax, ay), (bx, by) in zip(POLE_PATH, POLE_PATH[1:]):
        L = int(round(abs(bx - ax) + abs(by - ay)))
        sx, sy = (bx - ax) / L, (by - ay) / L
        path += [(ax + sx * k, ay + sy * k) for k in range(0 if not path else 1, L + 1)]
    band = set()
    for x, y in path:
        for ox in range(-2, 3):
            for oy in range(-2, 3):
                band.add(_tile((x + ox, y + oy)))
    band |= {_tile(p) for p in POLE_FORCE}
    pc = classify(ai, band)

    def pole_ok(t):
        return pc.get(t) in (".", "t", "r", "o") and t not in pipe_tiles

    if not pole_ok(_tile(path[0])) or math.hypot(path[0][0] - POLE0[0], path[0][1] - POLE0[1]) > 7.4:
        fails.append(("pole-start", path[0]))
    poles, prev, k = [(POLE, path[0][0], path[0][1], N)], path[0], 0
    force = {_tile(p) for p in POLE_FORCE}
    while k < len(path) - 1:
        best = None
        for step in range(7, 0, -1):
            if k + step >= len(path):
                continue
            ix, iy = path[k + step]
            cands = [(ix, iy)] + [(ix + ox, iy + oy) for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1))]
            for c in cands:
                if math.hypot(c[0] - prev[0], c[1] - prev[1]) <= 7.4 and pole_ok(_tile(c)):
                    best = (k + step, c)
                    break
            # 억지 자리 (펌프 공급) 가 이 다리 안에 있으면 그 자리를 먼저
            for f_ in force:
                fx, fy = f_[0] + 0.5, f_[1] + 0.5
                for s2 in range(1, step + 1):
                    if k + s2 < len(path) and _tile(path[k + s2]) == f_ and math.hypot(fx - prev[0], fy - prev[1]) <= 7.4 and pole_ok(f_):
                        best = (k + s2, (fx, fy))
            if best:
                break
        if not best:
            fails.append(("pole", path[k]))
            break
        k, prev = best[0], best[1]
        poles.append((POLE, prev[0], prev[1], N))
    site_poles = [(x, y) for n_, x, y, d in GROUPS["def"] if n_ == POLE]
    if min(math.hypot(x - prev[0], y - prev[1]) for x, y in site_poles) > 7.4:
        fails.append(("pole-end", prev))
    for f_ in force:
        if not any(_tile((x, y)) == f_ for n_, x, y, d in poles):
            fails.append(("pole-force", f_))
    out = {"pipe": pipe, "power": poles}
    cnt = {}
    for n_, *_ in pipe + poles:
        cnt[n_] = cnt.get(n_, 0) + 1
    res = {"count": cnt, "fails": fails, "bad_fixed": bad_fixed,
           "unknown": sum(1 for c in list(cls.values()) + list(pc.values()) if c == "?")}
    try:
        st = json.load(open(STATE, encoding="utf-8"))
    except (OSError, ValueError):
        st = {}
    st["plan"] = out
    st["plan_info"] = res
    json.dump(st, open(STATE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    _apply_plan(out)
    return res


def measure(ai) -> dict:
    """출정 조건: 경로 선분 반경 80 (walkscout.PAD) 안 적 유닛 · 구조물 0 + 부지 반경 80 안 0. 조회만."""
    import walkscout
    out = {"t": time.strftime("%X"), "route": [walkscout.route_foes(ai, a, b) for a, b in SEGS]}
    r = ai.lua("""(function()
      local s = game.surfaces[1]
      local c = {%f, %f}
      local out = {evo = game.forces.enemy.get_evolution_factor(s)}
      for _, R in pairs({80, 150}) do
        out["u" .. R] = s.count_entities_filtered{force = "enemy", position = c, radius = R, type = "unit"}
        out["s" .. R] = s.count_entities_filtered{force = "enemy", position = c, radius = R, type = {"unit-spawner", "turret"}}
      end
      return out
    end)()""" % SITE)
    out["site"] = r
    out["ok"] = all(not (f.get("units") or f.get("structs")) for f in out["route"]) and not r.get("u80") and not r.get("s80")
    return out


def scout(ai, who) -> None:
    """기지 → 유전 → 남 → 서 → 부지 를 다리 (<= 40 칸) 로, 다리마다 떠나기 직전 선분 반경 80 적 0 을 다시 잰다.
    걷는 몸이 y 160~191 의 안 생긴 청크 (-512..-321) 를 보게 된다 (지도는 안 연다)."""
    import walkscout
    pts = [(-100.0, -20.0), (-140.0, 5.0), (-188.0, 36.0)]
    y = 36.0
    while y < 156:
        y = min(156.5, y + 40)
        pts.append((-189.0, y))
    x = -189.0
    while x > -442:
        x = max(-442.5, x - 40)
        pts.append((x, 156.5))
    pts += [(-442.5, 190.0), (-452.0, 225.0), (-452.0, 248.0), (-460.0, 260.0), (-440.0, 262.0), (-430.0, 250.0), (-455.5, 247.0)]
    detached.mark([who], OWNER, minutes=40)
    home = (-188.0, 36.0)
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
            walkscout.walk(ai, who, home, home, limit=240)
            return
        res = walkscout.walk(ai, who, p, home, limit=150)
        print(time.strftime("%X"), f"{who} 다리 {i} {p}: {res}", flush=True)
        if res in ("dead", "foe"):
            return
    print(who, "정찰 끝 - 부지에 선다", json.dumps(measure(ai), ensure_ascii=False), flush=True)


def pumps_kit(ai, who, n=2) -> None:
    """펌프 = 엔진 1 · 강철 1 · 관 1 (손제작). 엔진은 조립기 전용이라 저장 상자 (103.5,-14.5) 의 엔진을 든다."""
    from orders import submit
    os.environ[detached.ENV] = OWNER
    src = base.sources(ai, {"engine-unit", "steel-plate", "iron-plate"})
    plan, want = [], {"engine-unit": n, "steel-plate": n, "iron-plate": n}
    for item, k in want.items():
        for nm, x, y, c, cn in sorted(src, key=lambda r: -r[3]):
            if nm != item or k <= 0:
                continue
            got = min(k, c - base.HUB_KEEP.get(nm, 0))
            if got > 0:
                plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": nm, "x": x, "y": y, "count": got})]
                k -= got
    plan.append(("craft", {"recipe": PUMP, "count": n, "wait": "block"}))
    submit(ai, who, plan, strict=False)
    print(time.strftime("%X"), who, "펌프 키트", plan, flush=True)


def fill_bag(ai, who, item="firearm-magazine") -> None:
    """가방에 든 탄창을 그대로 탄 상자 넷에 고루 (만들지 않음 - 첫 채움은 빨리)."""
    from orders import submit
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=30)
    have = int(ai.agent(who).items().get(item, 0))
    per = have // len(AMMO_CHESTS)
    plan = []
    for x, y in AMMO_CHESTS:
        plan += [("walk_to", {"x": x + 1.5, "y": y - 1.0}), ("insert", {"name": item, "x": x, "y": y, "count": per})]
    submit(ai, who, plan, strict=False)
    print(time.strftime("%X"), who, "가방 탄", item, per, "x", len(AMMO_CHESTS), flush=True)


def fill(ai, who, per=60, item="firearm-magazine") -> None:
    """탄 상자 넷에 탄창 per 개씩 (사람 손). 허브에 탄창이 없어 손제작: 노랑 = 철 4 (1 초) · 관통 = 구리 2 · 강철 1 · 노랑 2 (6 초).
    05:34 첫 채움이 노랑이라 같은 종류로 잇는다 (든 것과 다른 종류는 팔이 든 채 선다 - P10 함정)."""
    from orders import submit
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=60)
    n = per * len(AMMO_CHESTS)
    try:
        bag = ai.agent(who).items()
    except Exception:                    # noqa: BLE001
        bag = {}
    make = max(0, n - int(bag.get(item, 0)))
    plan = []
    if make:
        need = {"iron-plate": 4 * make + 2} if item == "firearm-magazine" else             {"iron-plate": 8 * make + 4, "copper-plate": 2 * make + 2, "steel-plate": make + 1}
        src = base.sources(ai, set(need))
        for it, k in need.items():
            k -= int(bag.get(it, 0))
            for nm, x, y, c, cn in sorted(src, key=lambda r: -r[3]):
                if nm != it or k <= 0:
                    continue
                got = min(k, c - base.HUB_KEEP.get(nm, 0))
                if got > 0:
                    plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": nm, "x": x, "y": y, "count": got})]
                    k -= got
        if item == "firearm-magazine":
            plan.append(("craft", {"recipe": item, "count": make, "wait": "block"}))
        else:
            plan += [("craft", {"recipe": "firearm-magazine", "count": 2 * make, "wait": "block"}),
                     ("craft", {"recipe": item, "count": make, "wait": "block"})]
    for x, y in AMMO_CHESTS:
        plan += [("walk_to", {"x": x + 1.5, "y": y - 1.0}), ("insert", {"name": item, "x": x, "y": y, "count": per})]
    submit(ai, who, plan[:59], strict=False)
    print(time.strftime("%X"), who, "탄 채움", item, n, "(만듦", make, ")", flush=True)


def status(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = {}
      for k, v in pairs(defines.entity_status) do st[v] = k end
      local out = {}
      local A = {{-486, 243}, {-432, 268}}
      for _, n in pairs({"pumpjack", "gun-turret", "stone-wall", "inserter", "transport-belt", "iron-chest", "small-electric-pole"}) do
        local es = s.find_entities_filtered{name = n, force = f, area = A}
        local c = {}
        for _, e in pairs(es) do local k = e.status and st[e.status] or "-"; c[k] = (c[k] or 0) + 1 end
        local t = {}
        for k, v in pairs(c) do t[#t+1] = k .. "=" .. v end
        out[n] = #es .. " " .. table.concat(t, ",")
      end
      local R = {{-450, 30}, {-185, 260}}
      out.ptg = s.count_entities_filtered{name = "pipe-to-ground", force = f, area = R}
      out.poles = s.count_entities_filtered{name = "small-electric-pole", force = f, area = R}
      local pumps = {}
      for _, p in pairs(s.find_entities_filtered{name = "pump", force = f, area = R}) do
        local fl = p.fluidbox[1]
        pumps[#pumps+1] = string.format("(%%.1f,%%.1f) %%s %%s", p.position.x, p.position.y, st[p.status] or "?", fl and (fl.name .. " " .. math.floor(fl.amount)) or "빈")
      end
      out.pumps = pumps
      local pjs = {}
      for _, pj in pairs(s.find_entities_filtered{name = "pumpjack", force = f, area = A}) do
        local fl = pj.fluidbox[1]
        pjs[#pjs+1] = string.format("(%%.1f,%%.1f) %%s %%d", pj.position.x, pj.position.y, st[pj.status] or "?", fl and math.floor(fl.amount) or 0)
      end
      out.pj = pjs
      local tam = 0
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = f, area = A}) do tam = tam + t.get_inventory(defines.inventory.turret_ammo).get_item_count() end
      out.turret_ammo = tam
      local ch = {}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local c = s.find_entities_filtered{name = "iron-chest", force = f, position = p, radius = 0.3}[1]
        ch[#ch+1] = c and c.get_inventory(defines.inventory.chest).get_item_count() or -1
      end
      out.ammo_chests = ch
      local fs = f.get_fluid_production_statistics(s)
      local is = f.get_item_production_statistics(s)
      local P = defines.flow_precision_index
      out.crude_10m = fs.get_flow_count{name = "crude-oil", category = "output", precision_index = P.ten_minutes, count = true}
      out.crude_1m = fs.get_flow_count{name = "crude-oil", category = "output", precision_index = P.one_minute, count = true}
      out.pgas_10m = fs.get_flow_count{name = "petroleum-gas", category = "input", precision_index = P.ten_minutes, count = true}
      out.plastic_10m = is.get_flow_count{name = "plastic-bar", category = "input", precision_index = P.ten_minutes, count = true}
      out.tick = game.tick
      return out
    end)()""" % json.dumps([list(p) for p in AMMO_CHESTS]))


# --- 정유 증설 (P11-4) - 원유 15.5 + 9.0 + 우물 2 · 3 (285% · 231%) ≈ 81/s > 정유 둘 40/s → 기본 정유 (basic, 원유 100 → 석유가스 45, 물 · 부산물 없음) 둘 더 = 80/s.
#   기본 정유는 중유 · 경유가 안 나와 막힐 일이 없다 (고급 정유 옆 분해 공장은 지금 원료 부족). 로봇 유령 (망 9 안), 사람은 정유를 만들어 저장 상자에만.
#   R3 (-119.5,18.5) dir N: 원유 (+1,+3) = (-118.5,21.5) ← 원유 줄 y 21.5 의 지하관 쌍 (-121.5 → -114.5) 을 보통 관 8 로 바꿈 (해체 표시 → 빈 뒤 유령),
#      석유가스 (+2,-3) = (-117.5,15.5) → 기본 정유 R2 의 석유가스 줄 y 15.5 (플라스틱 1 · 황 1) 서쪽 끝에 관 셋.
#   R4 (-90.5,21.5) dir E: 원유 (-3,+1) = (-93.5,22.5) ← 원유 세로 줄 x -94.5, 석유가스 (+3,+2) = (-87.5,23.5) → x -87.5 북 → y 13.5 동 → x -84.5 북 →
#      고급 정유 석유가스 줄 (-84.5,10.5) (플라스틱 2 · 황 2 · 분해).
REF_STORE = (-78.5, 20.5)                # R_W 저장 상자 (망 9)
R3, R4 = (-119.5, 18.5), (-90.5, 21.5)
REF_PTG = [(-121.5, 21.5), (-114.5, 21.5)]
REF_GHOSTS = ([("oil-refinery", R3[0], R3[1], N)] + [(PIPE, x + 0.5, 21.5, N) for x in range(-122, -114)]
              + [(PIPE, x, 15.5, N) for x in (-117.5, -116.5, -115.5)]
              + [("oil-refinery", R4[0], R4[1], E), (PIPE, -93.5, 22.5, N)]
              + [(PIPE, -87.5, y + 0.5, N) for y in range(13, 24)] + [(PIPE, -86.5, 13.5, N), (PIPE, -85.5, 13.5, N), (PIPE, -84.5, 13.5, N),
                                                                    (PIPE, -84.5, 12.5, N), (PIPE, -84.5, 11.5, N)]
              + [(POLE, -116.5, 20.5, N), (POLE, -86.5, 19.5, N)])      # 05:47 둘 다 no_power - R3 ← (-109.5,22.5) 7.3 · R4 ← (-84.5,20.5)


def refine_ghosts(ai) -> dict:
    """해체 표시 (지하관 쌍) → 빈 자리부터 유령 (can_place manual, 나무 · 바위만 벌목 표시)."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {decon = 0, placed = 0, have = 0, wait = 0, blocked = {}}
      for _, p in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{name = "pipe-to-ground", force = f, position = p, radius = 0.3}[1]
        if e and not e.to_be_deconstructed() then e.order_deconstruction(f); out.decon = out.decon + 1 end
      end
      for _, g in pairs(helpers.json_to_table('%s')) do
        local n, pos, d = g[1], {g[2], g[3]}, g[4]
        if s.count_entities_filtered{name = n, force = f, position = pos, radius = 0.3} > 0
           or s.count_entities_filtered{ghost_name = n, force = f, position = pos, radius = 0.3} > 0 then out.have = out.have + 1
        elseif s.can_place_entity{name = n, position = pos, direction = d, force = f, build_check_type = defines.build_check_type.manual} then
          s.create_entity{name = "entity-ghost", inner_name = n, position = pos, direction = d, force = f}
          out.placed = out.placed + 1
        else
          local why = "?"
          for _, q in pairs(s.find_entities_filtered{position = pos, radius = (n == "oil-refinery") and 2.6 or 0.5}) do
            if q.type == "tree" or q.type == "simple-entity" then if not q.to_be_deconstructed() then q.order_deconstruction(f) end why = "tree"
            elseif q.type ~= "resource" and q.type ~= "character" then why = q.name end
          end
          if why == "tree" or why == "pipe-to-ground" then out.wait = out.wait + 1 else out.blocked[#out.blocked + 1] = n .. "@" .. g[2] .. "," .. g[3] .. ":" .. why end
        end
      end
      for _, r in pairs(s.find_entities_filtered{name = "oil-refinery", force = f}) do
        if not r.get_recipe() then r.set_recipe("basic-oil-processing"); out.recipe = (out.recipe or 0) + 1 end
      end
      return out
    end)()""" % (json.dumps([list(p) for p in REF_PTG]), json.dumps([list(g) for g in REF_GHOSTS])))


def refine_kit(ai, who, n=2) -> None:
    """정유 n 대 손제작 (강철 15 · 톱니 10 · 회로 10 · 관 10 · 벽돌 10) → 망 9 저장 상자. 로봇이 유령을 짓는다."""
    from orders import submit
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=30)
    src = base.sources(ai, {"iron-plate", "copper-plate", "steel-plate", "stone-brick"})
    plan = []
    for item, k in (("iron-plate", 40 * n + 4), ("copper-plate", 15 * n + 2), ("steel-plate", 15 * n), ("stone-brick", 10 * n)):
        for nm, x, y, c, cn in sorted(src, key=lambda r: -r[3]):
            if nm != item or k <= 0:
                continue
            got = min(k, c - base.HUB_KEEP.get(nm, 0))
            if got > 0:
                plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": nm, "x": x, "y": y, "count": got})]
                k -= got
    plan += [("craft", {"recipe": "oil-refinery", "count": n, "wait": "block"}),
             ("walk_to", {"x": REF_STORE[0], "y": REF_STORE[1] + 1.5}),
             ("insert", {"name": "oil-refinery", "x": REF_STORE[0], "y": REF_STORE[1], "count": n})]
    submit(ai, who, plan, strict=False)
    print(time.strftime("%X"), who, "정유 키트", n, flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run24")
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--scout", default="")
    ap.add_argument("--check", default="")
    ap.add_argument("--need", default="")
    ap.add_argument("--build", default="")
    ap.add_argument("--crew", default="")
    ap.add_argument("--from", dest="frm", type=int, default=0)
    ap.add_argument("--to", type=int, default=0)
    ap.add_argument("--pumps", default="")
    ap.add_argument("--fill", default="")
    ap.add_argument("--per", type=int, default=60)
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--refine", default="", help="ghost | kit")
    a, _ = ap.parse_known_args()
    ai = AIBridge()
    if a.plan:
        print(json.dumps(plan(ai), ensure_ascii=False))
    if a.measure:
        print(json.dumps(measure(ai), ensure_ascii=False))
    if a.scout:
        scout(ai, a.scout)
    if a.check:
        print(json.dumps(base.check(ai, a.check.split(",")), ensure_ascii=False, indent=1))
    if a.need:
        print(json.dumps(base.need_total(a.need.split(",")), ensure_ascii=False))
    if a.pumps:
        pumps_kit(ai, a.pumps)
    if a.build:
        g = a.build
        if a.frm or a.to:
            GROUPS[g] = GROUPS[g][a.frm:a.to or None]
        base.build(ai, a.crew, g)
    if a.fill == "bag":
        fill_bag(ai, a.crew)
    elif a.fill:
        fill(ai, a.crew, a.per)
    if a.refine == "ghost":
        print(json.dumps(refine_ghosts(ai), ensure_ascii=False))
    if a.refine == "kit":
        refine_kit(ai, a.crew)
    if a.status:
        print(json.dumps(status(ai), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

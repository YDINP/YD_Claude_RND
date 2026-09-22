"""Twelve labs need a line, not a chain. A science block south of the smelter.

    사용자: "연구소는 한 12개정도로 늘리고 그에 맞게 병목이 되지 않도록
             생산시설들도 추가배치할 것. 심시티 공간이 부족하면 어떻게
             확장할것인지, 기지를 개편할것인지 추론하고 진행해."

추론
----
연구소 12대는 팩을 초당 0.6개씩(빨강·초록 각각) 먹는다. 지금 생산은
빨강 0.2 / 초록 0.17. 세 배가 필요하다.

지금까지의 조립 모듈은 «사슬»이다 - 조립기 여섯 대가 팔로 이어져 팩
조립기 «하나»를 먹인다. 앞의 다섯은 10%만 일한다. 사슬로 세 배를 내려면
조립기 마흔 대가 든다. 자리도 없다: 간선 옆 x -43..-12, y 13..29 는 이미
찼고, 사슬은 조립기 한 대의 네 변을 다 쓰므로 «끼워 넣을» 수도 없다.

그래서 «개편»이 아니라 «확장»이다: 있는 모듈은 그대로 돌리고(팩 벨트에
이미 붙어 있다), 제련구역 남쪽 빈 땅(x -44..-8, y 45..72)에 벨트로 짠
블록을 하나 더 짓는다. 벨트 줄은 «중간 재료를 나눠 쓰므로» 조립기 12대로
사슬 40대 몫을 한다.

블록
----
    y=49  판 버스 (동쪽으로) - 간선 x=-19 에 분배기, y=30 서쪽, x=-43 남쪽
                             (화로 줄 셋은 지하로), x=-41 구리 기둥은 지하로
    y=51..53  A 줄: 구리선 · 회로 · 톱니 · 팔 · 벨트 · 빨간팩   (판은 북쪽 버스에서)
    y=55  중간 고리 (동쪽으로, x=-14 남쪽, y=63 서쪽, x=-40 북쪽)
              A 줄이 만든 것을 얹고, B 줄과 A 줄이 거기서 집는다.
              고리라 안 쓰는 것은 돌고, 그래도 남는 것은 상자(SINK)가 받는다.
    y=57..59  B 줄: 녹색팩 x6   (팔·벨트를 고리에서 집고, 팩을 고리에 얹는다)
    x=-13     «출구»: 필터 고속 팔이 고리에서 팩만 집어 팩 기둥(x=-12)에 얹는다
    x=-12     팩 기둥, 북쪽으로 y=29 까지 - 연구소 줄(x=-13, labline.py)의
              꼬리 뒤에 붙는다. 연구소 아홉 대가 이 기둥 양옆에 더 선다.

한 줄에 6칸(3+1 팔+... ) 씩, 조립기 중심은 4칸 간격이다. 팔의 direction
은 «집는 쪽»이다.

    python scripts/science_block.py                     # 어디까지 됐나
    python scripts/science_block.py --who charlie --all # 차례로
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import shelf as shelf_mod                # noqa: E402
import fuel                              # noqa: E402  (belt/ug/gone/col/standing/place_ugs)

AM = "assembling-machine-1"
ARM = "inserter"
FAST = "fast-inserter"
BOX = "iron-chest"
POLE = "small-electric-pole"
LAB = "lab"
DEPOT = (-55, 10)
N, E, S, W = 0, 4, 8, 12

belt, ug, gone, col = fuel.belt, fuel.ug, fuel.gone, fuel.col

BUS_Y, A_Y, RING_Y, B_Y = 49, 52.5, 55, 58.5
XA = (-36.5, -32.5, -28.5, -24.5, -20.5, -16.5)
A_RECIPES = ("copper-cable", "electronic-circuit", "iron-gear-wheel",
             "inserter", "transport-belt", "automation-science-pack")
A_FROM_RING = {1: True, 3: True, 4: True, 5: True}   # 고리에서도 집는 것 (회로·팔·벨트·빨강)
XB = XA
XRING_W, XRING_E, RING_BOTTOM = -40, -14, 63
XCOL = -12                # 팩 기둥
SINK = (-14.5, 57.5)      # 고리 남는 것 받는 상자
EXIT = (-12.5, 58.5)      # 필터 고속 팔 (고리 x=-13.5 -> 팩 기둥 x=-11.5). -13.5 는 고리 자리다
PACKS = ("automation-science-pack", "logistic-science-pack")

LABS = [(-14.5, 36.5), (-14.5, 40.5), (-14.5, 44.5),          # 기둥 서쪽 (팔 x=-13)
        (-8.5, 45.5), (-8.5, 55.5), (-8.5, 58.5), (-8.5, 66.5),  # 기둥 동쪽 (팔 x=-11)
        (-9.5, 17.5), (-9.5, 21.5), (-9.5, 25.5)]                # 북쪽 기둥 x=-13 동쪽 (팔 x=-12)


def arm(x, y, d, name=ARM):
    return ("build", {"name": name, "x": x, "y": y, "direction": d})


def am(x, y):
    return ("build", {"name": AM, "x": x, "y": y})


def pole(x, y):
    return ("build", {"name": POLE, "x": x, "y": y})


def _branch():
    out = [gone(-19, 31),
           ("build", {"name": "splitter", "x": -19.0, "y": 31.5, "direction": N}),
           belt(-20, 30, W)]
    out += [belt(x, 30, W) for x in range(-21, -43, -1)]
    out += [belt(-43, 30, S), belt(-43, 31, S),
            ug(-43, 32, S, "input"), ug(-43, 34, S, "output"),
            belt(-43, 35, S), belt(-43, 36, S),
            ug(-43, 37, S, "input"), ug(-43, 39, S, "output"),
            belt(-43, 40, S), belt(-43, 41, S),
            ug(-43, 42, S, "input"), ug(-43, 44, S, "output"),
            *col(-43, 45, 48, S),
            belt(-43, BUS_Y, E),
            ug(-42, BUS_Y, E, "input"), ug(-40, BUS_Y, E, "output")]
    out += [belt(x, BUS_Y, E) for x in range(-39, -14)]
    return out


def _ring():
    out = [belt(x, RING_Y, E) for x in range(XRING_W, XRING_E)]        # 동쪽으로
    out += [belt(XRING_E, y, S) for y in range(RING_Y, RING_BOTTOM)]     # 남쪽으로
    out += [belt(x, RING_BOTTOM, W) for x in range(XRING_E, XRING_W, -1)]  # 서쪽으로
    out += [belt(XRING_W, y, N) for y in range(RING_BOTTOM, RING_Y, -1)]   # 북쪽으로
    return out


def _row_a():
    out = []
    for i, x in enumerate(XA):
        out.append(am(x, A_Y))
        # 톱니는 철판 둘, 구리선은 구리판 하나에 «초당 하나» 꼴로 먹는다 - 보통 팔
        # (0.83/s)로는 그 둘의 입력이 줄 전체의 상한이 된다. 그 둘은 빠른 팔.
        out.append(arm(x, BUS_Y + 1.5, N, FAST if i in (0, 2) else ARM))   # 버스 -> 조립기
        if i in A_FROM_RING:
            out.append(arm(x - 1, RING_Y - 0.5, S, FAST if i == 1 else ARM))   # 고리 -> 조립기
        # 구리선 출구와 회로 입구는 빠른 팔: 회로 하나에 구리선 셋이라 보통 팔
        # (0.83/s)로는 회로 조립기가 늘 굶는다 - 실측으로 A 줄 전체가 막혔다.
        out.append(arm(x + 1, RING_Y - 0.5, N, FAST if i in (0, 2) else ARM))   # 조립기 -> 고리
    out += [pole(x, BUS_Y + 1.5) for x in (-34.5, -30.5, -26.5, -22.5, -18.5)]
    out += [pole(x, RING_Y - 0.5) for x in (-38.5, -34.5, -30.5, -26.5, -22.5, -18.5, -14.5)]
    return out


def _row_b():
    out = []
    for x in XB:
        out.append(am(x, B_Y))
        out.append(arm(x, RING_Y + 1.5, N))                    # 고리 -> 조립기 (팔·벨트)
        out.append(arm(x + 1, RING_Y + 1.5, S))                # 조립기 -> 고리 (팩)
    out += [arm(SINK[0], SINK[1] - 1, N), ("build", {"name": BOX, "x": SINK[0], "y": SINK[1]}),
            arm(EXIT[0], EXIT[1], W, FAST)]
    # 전봇대는 B 줄 «남쪽» y=60.5 에. A 줄 전봇대(y=54.5)의 5x5 공급 구역은
    # y=57 까지라 B 조립기(57..60)에 «닿기만» 하고 안 든다 - 다섯 대가 no_power 였다.
    out += [pole(x, 60.5) for x in (-34.5, -30.5, -26.5, -22.5, -18.5, -15.5)]
    return out


def _pack_col():
    out = [belt(XCOL, y, N) for y in range(RING_BOTTOM, 34, -1)]
    out += [ug(XCOL, 34, N, "input"), ug(XCOL, 32, N, "output"),
            belt(XCOL, 31, N), belt(XCOL, 30, N), belt(XCOL, 29, W),
            belt(-13, 29, N)]
    return out


def _labs():
    out = []
    for x, y in LABS:
        out.append(("build", {"name": LAB, "x": x, "y": y}))
        if x < XCOL:                                            # 서쪽: 팔이 동쪽(기둥)에서 집는다
            out.append(arm(x + 2, y, E))
        elif x > -9:                                            # 동쪽 (블록 구간, 기둥 x=-12)
            out.append(arm(x - 2, y, W))
        else:                                                   # 북쪽 구간 (기둥 x=-13)
            out.append(arm(x - 2, y, W))
    out += [pole(-10.5, 47.5), pole(-10.5, 53.5), pole(-10.5, 60.5), pole(-10.5, 64.5),
            pole(-12.5, 38.5), pole(-12.5, 42.5),
            pole(-11.5, 15.5), pole(-11.5, 19.5), pole(-11.5, 23.5)]
    return out


# probe 는 그 단계의 «마지막» 것이다. 첫 것을 보면 반쯤 짓고 「됐다」가 된다.
STAGES = (
    ("branch", ("transport-belt", -14.5, BUS_Y + 0.5), {"transport-belt": 60, "underground-belt": 8, "splitter": 1}, _branch()),
    ("ring", ("transport-belt", XRING_W + 0.5, RING_Y + 1.5), {"transport-belt": 70}, _ring()),
    ("rowA", (POLE, -14.5, RING_Y - 0.5), {AM: 6, ARM: 11, FAST: 5, POLE: 12}, _row_a()),
    ("rowB", (POLE, -15.5, 60.5), {AM: 6, ARM: 13, FAST: 1, BOX: 1, POLE: 6}, _row_b()),
    ("packcol", ("transport-belt", -12.5, 29.5), {"transport-belt": 38, "underground-belt": 2}, _pack_col()),
    ("labs", (POLE, -11.5, 23.5), {LAB: 10, ARM: 10, POLE: 9}, _labs()),
)


def idle(ai, who) -> bool:
    live = {w["name"]: w for w in ai.list()}
    w = live.get(who)
    return bool(w and w.get("alive") and not (w.get("current") or w.get("queued")))


def done(ai, probe) -> bool:
    name, x, y = probe
    return bool(ai.lua("""(function()
      return { n = game.surfaces[1].count_entities_filtered{name = "%s",
                 force = game.forces.player, area = {{%f, %f}, {%f, %f}}} }
    end)()""" % (name, x - 0.4, y - 0.4, x + 0.4, y + 0.4))["n"])


def settle(ai) -> list:
    """세운 뒤 정하는 것: A 줄 레시피, 출구 팔의 필터."""
    packed = ";".join(f"{x},{A_Y},{r}" for x, r in zip(XA, A_RECIPES))
    packed += ";" + ";".join(f"{x},{B_Y},logistic-science-pack" for x in XB)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y, r = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        local m = s.find_entities_filtered{name = "%s", force = f,
                    area = {{tonumber(x) - 0.5, tonumber(y) - 0.5}, {tonumber(x) + 0.5, tonumber(y) + 0.5}}}[1]
        if m then
          if not m.get_recipe() or m.get_recipe().name ~= r then m.set_recipe(r) end
          out[#out+1] = r
        end
      end
      local e = s.find_entities_filtered{name = "%s", force = f,
                  area = {{%f, %f}, {%f, %f}}}[1]
      if e then
        e.use_filters = true
        e.set_filter(1, "%s")
        e.set_filter(2, "%s")
        out[#out+1] = "exit:filtered"
      end
      -- SINK 팔은 «팩만 빼고» 걷는다 (블랙리스트). 실측: 필터 없는 팔이 고리
      -- 모서리에서 팩을 먼저 집어 상자에 넣었고 연구소 열셋이 다 굶었다.
      -- 보통 팔이라 0.83/s - 넘치는 중간재만 천천히 빠진다. 2.0 은 보통 팔도
      -- 필터 5칸이 있다.
      local k = s.find_entities_filtered{name = "%s", force = f,
                  area = {{%f, %f}, {%f, %f}}}[1]
      if k then
        k.use_filters = true
        k.inserter_filter_mode = "blacklist"
        k.set_filter(1, "%s")
        k.set_filter(2, "%s")
        out[#out+1] = "sink:packs-kept"
      end
      return out
    end)()""" % (packed, AM, FAST, EXIT[0] - 0.4, EXIT[1] - 0.4, EXIT[0] + 0.4, EXIT[1] + 0.4,
                 PACKS[0], PACKS[1],
                 ARM, SINK[0] - 0.4, SINK[1] - 1.4, SINK[0] + 0.4, SINK[1] - 0.6,
                 PACKS[0], PACKS[1]))
    return list(reply.values()) if isinstance(reply, dict) else list(reply or [])


def run(ai, who, stage):
    name, _probe, kit, steps = stage
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    plan = []
    have = shelf_mod.shelves(ai, DEPOT, span=36)
    for item, n in (("iron-plate", 400), ("copper-plate", 120), ("wood", 8)):
        at = have.get(item)
        if at and int(bag.get(item, 0)) < n:
            plan.append(("walk_to", {"x": at[0], "y": at[1] + 1.5}))
            plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
    for item, n in kit.items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            count = (short + 1) // 2 if item in ("transport-belt", "underground-belt", POLE) else short
            plan.append(("craft", {"recipe": item, "count": count, "wait": True}))
    up = fuel.standing(ai, steps)
    todo = [st for st in steps
            if st[0] != "_ug" and not (st[0] == "build" and (st[1]["x"], st[1]["y"]) in up)]
    for n, st in enumerate(todo):
        if st[0] == "build" and n % 9 == 0:
            plan.append(("walk_to", {"x": st[1]["x"] + 2, "y": st[1]["y"] + 2}))
        plan.append(st)
    # 계획은 64단계. 넘치면 앞부분만 보내고 다음 부름에 이어 짓는다 (선 것은 뺀다).
    plan = plan[:60]
    if not idle(ai, who):                       # 지난 부름의 꼬리가 남아 있으면 비운다
        ai.agent(who).cancel()
        time.sleep(2)
    submit(ai, who, plan, strict=False)
    print(f"{who}: 과학 블록 {name} ({len(plan)}단계, 선 것 {len(up)} 뺌)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--stage", default="")
    args = ap.parse_args()

    ai = AIBridge()
    state = [(st[0], done(ai, st[1])) for st in STAGES]
    print("  " + " · ".join(f"{n} {'됨' if ok else '아직'}" for n, ok in state))
    if not args.who:
        return 0
    todo = [st for st, (_n, ok) in zip(STAGES, state) if not ok or st[0] == args.stage]
    if args.stage:
        todo = [st for st in STAGES if st[0] == args.stage]
    elif not args.all:
        todo = todo[:1]
    for stage in todo:
        for _round in range(6):                # 64단계씩 이어 짓는다
            run(ai, args.who, stage)
            for _ in range(240):
                time.sleep(5)
                if idle(ai, args.who):
                    break
            fuel.place_ugs(ai, args.who, stage[3])
            if done(ai, stage[1]):
                break
        print(f"  {stage[0]}: {'됨' if done(ai, stage[1]) else '아직'}")
    print("  " + ", ".join(settle(ai)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

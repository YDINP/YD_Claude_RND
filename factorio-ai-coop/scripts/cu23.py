"""23회차 파란 팩 병목 - 구리 (사용자: "지속적인 빌드업할 것").

실측 (tick ~11.35M): 파란 팩 10분 88 생산 · 223 소비. 조립기 11 중 7 이 고급 회로 없음 ← 고급 회로 6 중 4 · 구리선 9 중 7 이
재료 없음 ← 버스 X3 (y=-6.5 동향 → x=-15.5 북향 → y=-41.5 → y=-28.5 동쪽 조립기 열) 의 구리 레인 (남쪽, lane 2) 이
중간에서 빈다. 철 레인은 끝까지 찬다. 구리 제련은 2.2/s 로 소비 2.47/s 보다 적은데 허브 상자엔 구리 ~2만 이 서 있다.
green23 (철) 과 같은 병: 있는 것이 필요한 곳에 닿지 않는다.

X3 머리 (x -32 .. , y=-6.5) 위 빈 칸에 상자 2 + 고속 팔 2 (북쪽 상자에서 집어 남쪽 벨트의 «먼 레인» = 남쪽 = 구리 레인에 놓음):
    상자 (-23.5,-8.5) (-22.5,-8.5) · 고속 팔 (-23.5,-7.5) (-22.5,-7.5) N · 작은 전봇대 (-21.5,-8.5) ← (-21.5,-1.5) 7칸
    고속 팔 2 = ~4.6/s 까지. 상자 2 = 구리 6,400 = X3 구리 레인 ~2/s 로 ~50분.
채우기는 허브 구리 상자에서 사람이 나른다 (--fill). 물류 로봇이 생기면 요청 상자로 바꾼다.

    python scripts/cu23.py                          # 선 것 · 상자 구리
    python scripts/cu23.py --who alpha,bravo        # 짓기
    python scripts/cu23.py --fill --who alpha,bravo # 허브 구리 → 상자
"""
import argparse
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
os.environ.setdefault("AI_RUN", "run23")
import detached  # noqa: E402
import p1  # noqa: E402
from client import AIBridge  # noqa: E402

N = 0
FI = "fast-inserter"
CHESTS = [(-23.5, -8.5), (-22.5, -8.5)]
HUB_CU = [(-79.5, -52.5), (-76.5, -52.5), (-73.5, -52.5), (-75.5, -52.5), (-77.5, -52.5), (-78.5, -52.5)]
FILL = 3200
p1.COST.setdefault(FI, {"iron-plate": 8.5, "copper-plate": 4.5})


def steps() -> list:
    out = [p1.b("iron-chest", x, y) for x, y in CHESTS]
    out += [p1.b(FI, x, y + 1, N) for x, y in CHESTS]
    out += [p1.b(p1.POLE, -21.5, -8.5)]
    return out


def stock(ai) -> list:
    packed = ";".join(f"{x},{y}" for x, y in CHESTS)
    r = ai.lua("""(function() local o = {} local s = game.surfaces[1]
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local c = s.find_entity("iron-chest", {tonumber(x), tonumber(y)})
        o[#o + 1] = c and c.get_inventory(defines.inventory.chest).get_item_count("copper-plate") or -1 end
      return o end)()""" % packed)
    return list(r.values()) if isinstance(r, dict) else list(r or [])


def fill(ai, crew) -> None:
    have = stock(ai)
    ids = {}
    for i, who in enumerate(crew):
        if i >= len(CHESTS):
            break
        need = FILL - max(0, int(have[i]))
        if need <= 100:
            continue
        hx, hy = HUB_CU[i % len(HUB_CU)]
        cx, cy = CHESTS[i]
        ids[who] = ai.agent(who).submit_plan([
            ("walk_to", {"x": hx, "y": hy + 1.5}),
            ("take", {"name": "copper-plate", "x": hx, "y": hy, "count": need}),
            ("walk_to", {"x": cx, "y": cy - 1.5}),
            ("insert", {"name": "copper-plate", "x": cx, "y": cy, "count": need})])
    t0 = time.time()
    while ids and time.time() - t0 < 900:
        time.sleep(6)
        if all(ai.poll(t)["status"] in ("done", "failed") for v in ids.values() for t in v):
            break
    for who, v in ids.items():
        print(who, [(p.get("type"), p["status"], p.get("error")) for p in (ai.poll(t) for t in v) if p["status"] == "failed"])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--fill", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    st = steps()
    nb = sum(1 for k, _ in st if k == "build")
    print(f"  cu {len(p1.standing(ai, st))}/{nb} · 막힘 {p1.blocked(ai, st)[:4]} · 상자 구리 {stock(ai)}")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    os.environ[detached.ENV] = "cu23"
    detached.mark(crew, "cu23", minutes=40)
    try:
        if a.fill:
            fill(ai, crew)
        else:
            p1.PARK = (-26.5, -11.5)
            p1.build_stage(ai, crew, st, "cu")
    finally:
        detached.release(crew)
    print(f"  cu {len(p1.standing(ai, st))}/{nb} · 상자 구리 {stock(ai)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

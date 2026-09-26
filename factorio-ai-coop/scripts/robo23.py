"""로봇망 넓히기 - 과학 블록 · 서쪽 줄 (사용자: "로봇이 수리를 자동으로 하도록").

23회차 침입 피해 (유령 45) 는 북동 로봇망 밖이라 사람이 손으로 다시 세웠다 (ghosts23). 같은 일을 로봇이 하게,
구역마다 로보포트 1 대를 «홀로 선 망» 으로 세운다 - 북동 망까지 잇자면 포트 3~4 대가 더 들고 (물류 반경 25 → 간격 ≤ 50),
그때마다 5MW 충전이 겹친다. 홀로 선 포트도 로봇 칸 · 수리팩 칸이 있어 수리는 스스로 한다 (재건은 망 창고에 부품이 있어야 해서 아직).
로봇 · 수리팩은 북동 포트에서 덜어 온다 (take/insert 는 엔티티 전체 인벤토리를 쓴다 - tasks.lua target_entity).

자리: 구역 가운데에서 가까운 빈 4x4 + 기존 전봇대 7 칸 안 (없으면 사이에 작은 전봇대 하나).

    python scripts/robo23.py                    # 고른 자리
    python scripts/robo23.py --who delta,echo   # 짓고 채우기 (한 대씩 - 충전 5MW)
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

PORT = "roboport"
AREAS = {"sci": (-50.0, 20.0), "west": (-112.0, -40.0)}
PORT_OUT = (34.5, -41.5)                       # 로보포트 조립기 출력 상자
NE_PORTS = [(-24, -88), (10, -80), (36, -84), (20, -40)]
BOTS, PACKS = 10, 40
p1.SIZE.setdefault(PORT, 4)


def site(ai, cx, cy):
    """{x, y, pole: (x,y) 또는 None} - 포트 가운데 (정수 좌표, 4x4)."""
    r = ai.lua("""(function() local s = game.surfaces[1]
      for rr = 0, 14 do for dx = -rr, rr do for dy = -rr, rr do
        if math.max(math.abs(dx), math.abs(dy)) == rr then
          local x, y = %d + dx, %d + dy
          if s.can_place_entity{name = 'roboport', position = {x, y}, force = 'player'} then
            local pl = s.find_entities_filtered{type = 'electric-pole', force = 'player', position = {x, y}, radius = 9}
            local best, bd = nil, 1e9
            for _, p in pairs(pl) do local d = (p.position.x - x)^2 + (p.position.y - y)^2 if d < bd then best, bd = p, d end end
            if best then
              -- 작은 전봇대 공급 5x5: 포트 가장자리 (±2) 에서 2.5 안이면 그대로 닿는다
              local near = math.abs(best.position.x - x) <= 4.5 and math.abs(best.position.y - y) <= 4.5 and best.name ~= 'medium-electric-pole' or
                           math.abs(best.position.x - x) <= 5.5 and math.abs(best.position.y - y) <= 5.5 and best.name == 'medium-electric-pole'
              local px, py = nil, nil
              if not near then
                -- 포트 모서리 바깥 한 칸 · 기존 전봇대 쪽
                px = x + (best.position.x > x and 2.5 or -2.5); py = y + (best.position.y > y and 2.5 or -2.5)
                if not s.can_place_entity{name = 'small-electric-pole', position = {px, py}, force = 'player'} then px = nil end
                if px and ((px - best.position.x)^2 + (py - best.position.y)^2) > 7.5^2 then px = nil end
              end
              if near or px then return {x = x, y = y, px = px, py = py, pole = best.name} end
            end
          end
        end
      end end end
      return {} end)()""" % (round(cx), round(cy)))
    return r if r and r.get("x") is not None else None


def port_stock(ai, x, y):
    return ai.lua("""(function() local p = game.surfaces[1].find_entity('roboport', {%f, %f})
      if not p then return {n = -1} end
      return {bots = p.get_item_count('construction-robot'), packs = p.get_item_count('repair-pack'),
              e = math.floor(p.energy / 1e6)} end)()""" % (x, y))


def richest(ai, item):
    packed = ";".join(f"{x},{y}" for x, y in NE_PORTS)
    r = ai.lua("""(function() local b, m = nil, 0
      for bit in string.gmatch("%s", "[^;]+") do local x, y = string.match(bit, "([^,]+),([^,]+)")
        local p = game.surfaces[1].find_entity('roboport', {tonumber(x), tonumber(y)})
        if p and p.get_item_count('%s') > m then b, m = p.position, p.get_item_count('%s') end end
      return b and {x = b.x, y = b.y, n = m} or {} end)()""" % (packed, item, item))
    return (float(r["x"]), float(r["y"]), int(r["n"])) if r and r.get("x") is not None else None


def wait(ai, ids, limit=1200):
    t0 = time.time()
    while time.time() - t0 < limit:
        time.sleep(8)
        if all(ai.poll(t)["status"] in ("done", "failed") for t in ids):
            break
    return [(p.get("type"), p.get("error")) for p in (ai.poll(t) for t in ids) if p["status"] == "failed"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    ai = AIBridge()
    sites = {k: site(ai, *xy) for k, xy in AREAS.items() if not a.only or k == a.only}
    for k, s in sites.items():
        print(f"  {k}: {s} · {port_stock(ai, s['x'], s['y']) if s else '-'}")
    crew = [w for w in a.who.split(",") if w]
    if not crew:
        return 0
    os.environ[detached.ENV] = "robo23"
    detached.mark(crew, "robo23", minutes=60)
    try:
        for k, s in sites.items():
            if not s:
                print(f"  {k}: 자리 없음")
                continue
            x, y = float(s["x"]), float(s["y"])
            who = crew[0]
            bots, packs = richest(ai, "construction-robot"), richest(ai, "repair-pack")
            plan = [("walk_to", {"x": PORT_OUT[0], "y": PORT_OUT[1] + 1.5}),
                    ("take", {"name": PORT, "x": PORT_OUT[0], "y": PORT_OUT[1], "count": 1})]
            if bots:
                plan += [("walk_to", {"x": bots[0], "y": bots[1] + 3}),
                         ("take", {"name": "construction-robot", "x": bots[0], "y": bots[1], "count": min(BOTS, bots[2] - 5)})]
            if packs:
                plan += [("walk_to", {"x": packs[0], "y": packs[1] + 3}),
                         ("take", {"name": "repair-pack", "x": packs[0], "y": packs[1], "count": min(PACKS, packs[2] - 20)})]
            ids = ai.agent(who).submit_plan(plan)
            print(f"  {k}: {who} 모으는 중 - 실패 {wait(ai, ids)}")
            steps = [p1.b(PORT, x, y)] + ([p1.b(p1.POLE, float(s["px"]), float(s["py"]))] if s.get("px") else [])
            p1.PARK = (x + 4, y + 4)
            p1.build_stage(ai, [who], steps, f"robo-{k}")
            ids = ai.agent(who).submit_plan([
                ("walk_to", {"x": x, "y": y + 3.5}),
                ("insert", {"name": "construction-robot", "x": x, "y": y, "count": BOTS}),
                ("insert", {"name": "repair-pack", "x": x, "y": y, "count": PACKS})])
            print(f"  {k}: 채움 - 실패 {wait(ai, ids, 300)} · {port_stock(ai, x, y)}")
            crew = crew[1:] + crew[:1]
    finally:
        detached.release([w for w in a.who.split(",") if w])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

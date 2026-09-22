"""Seat a drill by where its ore lands, not by where the ore is.

grow.py 의 파종은 「광석이 많은 칸」에 채굴기를 놓는다. 그 채굴기가 캔
것이 어디 떨어지는지는 보지 않는다. 그래서 벨트를 깐 뒤에도 새 채굴기는
상자를 끼고 앉았고, 사용자는 세 번 같은 말을 했다.

    "아직 광석들이 상자로들어감. 화로로직행연결해야함"

이 스크립트는 거꾸로 센다. «벨트 칸»에서 시작해 그 옆 자리를 고른다.

    전기 채굴기는 3x3 이고, 캔 것은 몸 바로 바깥 한 칸에 떨어진다.
    그러니 벨트 칸 중심에서 옆으로 2 칸이 채굴기 중심이고,
    채굴기는 벨트 쪽을 본다.  (-68.5,-1.5) 동향 -> (-66.65,-1.5) 에 떨어짐

자리는 벨트의 «옆»에만 낸다. 머리와 꼬리에 내면 다음에 벨트를 늘릴 칸을
채굴기가 막는다.

전기가 안 닿는 자리는 뒤로 미룬다. 전봇대를 같이 세우는 일은 wire.py 의
몫이 아니고(그것은 끊긴 망을 잇는다) 여기서 한다 - 자리 옆에 전봇대
한 개. 그 전봇대가 본망에 닿는지는 다음 순번에 wire.py 가 잰다.

다 캔 버너 채굴기가 앉은 자리는 «빈 자리»로 친다. 걷고 그 위에 세운다.

    python scripts/edrill.py --ore coal --lane=-68,-8,-66,8
    python scripts/edrill.py --ore coal --lane=-68,-8,-66,8 --who golf --max 4
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

sys.path.insert(0, HERE)
from unbox import going_somewhere       # noqa: E402

DRILL = "electric-mining-drill"
POLE = "small-electric-pole"
OLD = "burner-mining-drill"

MIN_ORE = 3000            # 5x5 안에 이만큼은 있어야 세울 값을 한다
HALF = 1.5                # 3x3 의 반
STEPS_PER_SEAT = 6        # 걷기 + 걷어내기 + 전봇대 + 채굴기. 계획은 64단계

# 벨트가 가는 방향 -> 그 «옆» 두 쪽. (dx, dy, 채굴기가 볼 방향)
SIDES = {
    0: ((-2, 0, 4), (2, 0, 12)), 8: ((-2, 0, 4), (2, 0, 12)),
    4: ((0, -2, 8), (0, 2, 0)), 12: ((0, -2, 8), (0, 2, 0)),
}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def belts(ai, box) -> dict:
    """{(타일 x, 타일 y): 방향}"""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, b in pairs(s.find_entities_filtered{type = "transport-belt", force = f,
            area = {{%d, %d}, {%d, %d}}}) do
        out[#out+1] = math.floor(b.position.x) .. "|" .. math.floor(b.position.y)
                   .. "|" .. b.direction
      end
      return out
    end)()""" % box)
    out = {}
    for row in _rows(reply):
        x, y, d = str(row).split("|")
        out[(int(x), int(y))] = int(d)
    return out


def candidates(lane: dict) -> list:
    """벨트 옆 자리들. [(cx, cy, 방향), ...] - 아직 세계를 재지 않은 값."""
    out, seen = [], set()
    for (x, y), way in lane.items():
        for dx, dy, face in SIDES.get(way, ()):
            spot = (x + 0.5 + dx, y + 0.5 + dy)
            if spot not in seen:
                seen.add(spot)
                out.append((spot[0], spot[1], face))
    return out


def measure(ai, spots, ore) -> list:
    """자리마다 [매장량, 세울 수 있나, 전기 닿나, 걷어낼 헌 채굴기들]."""
    if not spots:
        return []
    packed = ";".join(f"{x},{y},{d}" for x, y, d in spots)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local dead = defines.entity_status.no_minable_resources
      -- 전봇대에게 is_connected_to_electric_network() 를 물으면 늘 거짓이다.
      -- 발전기가 붙은 망의 번호와 견준다.
      local main = -1
      for _, g in pairs(s.find_entities_filtered{type = "generator", force = f}) do
        if g.electric_network_id then main = g.electric_network_id break end
      end
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local cx, cy, face = string.match(bit, "([^,]+),([^,]+),([^,]+)")
        cx, cy, face = tonumber(cx), tonumber(cy), tonumber(face)
        local amount, foreign = 0, 0
        for _, r in pairs(s.find_entities_filtered{type = "resource",
              area = {{cx - 2.5, cy - 2.5}, {cx + 2.5, cy + 2.5}}}) do
          if r.name == "%s" then amount = amount + r.amount
          else foreign = foreign + 1 end
        end
        -- 5x5 에 남의 광석이 한 칸이라도 있으면 그 줄이 섞인다. 돌밭은 철밭
        -- 서쪽에 붙어 있고, 돌이 철 줄에 오르면 화로가 벽돌을 굽는다.
        if foreign > 0 then amount = 0 end
        -- 몸이 앉을 3x3. 광석·사람·바닥에 떨어진 물건은 걸림돌이 아니다
        -- (걷어낸 상자에서 쏟아진 석탄이 자리 스물둘을 전부 막은 적이 있다).
        local old, other = {}, 0
        for _, e in pairs(s.find_entities_filtered{
              area = {{cx - 1.45, cy - 1.45}, {cx + 1.45, cy + 1.45}}}) do
          if e.type == "resource" or e.type == "character"
             or e.type == "item-entity" then
          elseif e.name == "%s" and e.status == dead then
            old[#old+1] = e.position.x .. ":" .. e.position.y
          else
            other = other + 1
          end
        end
        -- build_check_type 을 안 주면 바닥의 물건 하나에도 «못 놓는다»고 한다.
        -- 사람이 놓는 기준(manual)으로 묻는다 - 실제로 그렇게 놓는다.
        local ok = other == 0 and (#old > 0 or s.can_place_entity{
                     name = "%s", position = {cx, cy}, direction = face, force = f,
                     build_check_type = defines.build_check_type.manual})
        local lit = false
        for _, p in pairs(s.find_entities_filtered{type = "electric-pole", force = f,
              area = {{cx - 3.9, cy - 3.9}, {cx + 3.9, cy + 3.9}}}) do
          -- 영역 검색은 전봇대 «몸통»이 걸치기만 해도 잡는다. 거리로 다시 잰다:
          -- 공급 반경 2.5 + 채굴기 반 1.5 = 4 «미만».
          if p.electric_network_id == main
             and math.abs(p.position.x - cx) < 3.6
             and math.abs(p.position.y - cy) < 3.6 then lit = true end
        end
        out[#out+1] = cx .. "|" .. cy .. "|" .. face .. "|" .. amount .. "|"
                   .. (ok and 1 or 0) .. "|" .. (lit and 1 or 0) .. "|"
                   .. table.concat(old, ",")
      end
      return out
    end)()""" % (packed, ore, OLD, DRILL))
    out = []
    for row in _rows(reply):
        cx, cy, face, amount, ok, lit, old = (str(row).split("|") + [""])[:7]
        out.append({"x": float(cx), "y": float(cy), "face": int(face),
                    "ore": int(float(amount)), "ok": ok == "1", "lit": lit == "1",
                    "old": [tuple(float(v) for v in o.split(":"))
                            for o in old.split(",") if o]})
    return out


def overlap(a, b) -> bool:
    return abs(a["x"] - b["x"]) < 2 * HALF and abs(a["y"] - b["y"]) < 2 * HALF


def choose(seats, limit, min_ore) -> list:
    """많이 묻힌 데부터, 서로 겹치지 않게. 전기 닿는 자리를 먼저."""
    good = [s for s in seats if s["ok"] and s["ore"] >= min_ore]
    good.sort(key=lambda s: (not s["lit"], -s["ore"]))
    out = []
    for seat in good:
        if len(out) >= limit:
            break
        if not any(overlap(seat, o) for o in out):
            out.append(seat)
    return out


def pole_for(ai, seat, taken):
    """이 자리에 전기를 댈 전봇대 칸. 고른 자리들의 몸은 피한다."""
    blocked = ";".join(f"{s['x']},{s['y']}" for s in taken)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local cx, cy = %f, %f
      local bodies = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        bodies[#bodies+1] = {tonumber(x), tonumber(y)}
      end
      for ring = 2, 3 do
        for x = cx - ring, cx + ring do
          for y = cy - ring, cy + ring do
            local free = true
            for _, b in pairs(bodies) do
              if math.abs(x - b[1]) < 2 and math.abs(y - b[2]) < 2 then free = false end
            end
            if free and s.can_place_entity{name = "%s", position = {x, y}, force = f} then
              return { x = x, y = y }
            end
          end
        end
      end
      return {}
    end)()""" % (seat["x"], seat["y"], blocked, POLE))
    if not reply or "x" not in reply:
        return None
    return float(reply["x"]), float(reply["y"])


def unlit(ai) -> list:
    """서 있는데 전기가 없는 전기 채굴기. 세운 것과 도는 것은 다르다."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, d in pairs(s.find_entities_filtered{name = "%s", force = f}) do
        if d.status == defines.entity_status.no_power then
          out[#out+1] = d.position.x .. "|" .. d.position.y
        end
      end
      return out
    end)()""" % DRILL)
    return [{"x": float(a), "y": float(b)}
            for a, b in (str(r).split("|") for r in _rows(reply))]


def relight(ai, who, dark) -> None:
    try:
        held = int(ai.agent(who).items().get(POLE, 0))
    except RconError:
        held = 0
    plan = []
    if held < len(dark):
        plan.append(("craft", {"recipe": POLE, "wait": True,
                               "count": (len(dark) - held + 1) // 2}))
    for seat in dark:
        spot = pole_for(ai, seat, dark)
        if spot:
            plan.append(("walk_to", {"x": spot[0] + 1.0, "y": spot[1] + 1.0}))
            plan.append(("build", {"name": POLE, "x": spot[0], "y": spot[1]}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 전기 없는 채굴기 {len(dark)}대 옆에 전봇대")


def build(ai, who, seats) -> None:
    seats = seats[:60 // STEPS_PER_SEAT]
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    dark = [s for s in seats if not s["lit"]]
    plan = []
    short = len(seats) - int(bag.get(DRILL, 0))
    if short > 0:
        plan.append(("craft", {"recipe": DRILL, "count": short, "wait": True}))
    short = len(dark) - int(bag.get(POLE, 0))
    if short > 0:
        plan.append(("craft", {"recipe": POLE, "count": (short + 1) // 2,
                               "wait": True}))
    for seat in seats:
        # 벨트 반대쪽에 선다. 벨트 쪽은 다른 채굴기와 팔로 붐빈다.
        away = {4: (-3, 0), 12: (3, 0), 8: (0, -3), 0: (0, 3)}[seat["face"]]
        plan.append(("walk_to", {"x": seat["x"] + away[0], "y": seat["y"] + away[1]}))
        for ox, oy in seat["old"]:
            plan.append(("demolish", {"x": ox, "y": oy, "name": OLD}))
        if not seat["lit"]:
            spot = pole_for(ai, seat, seats)
            if spot:
                plan.append(("build", {"name": POLE, "x": spot[0], "y": spot[1]}))
        plan.append(("build", {"name": DRILL, "x": seat["x"], "y": seat["y"],
                               "direction": seat["face"]}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 전기 채굴기 {len(seats)}대"
          + (f" (전봇대 {len(dark)}개 포함)" if dark else ""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ore", required=True, help="coal / iron-ore / copper-ore / stone")
    ap.add_argument("--lane", required=True,
                    help="벨트를 볼 네모 x1,y1,x2,y2 (타일)")
    ap.add_argument("--who", default="")
    ap.add_argument("--max", type=int, default=4)
    ap.add_argument("--min-ore", type=int, default=MIN_ORE)
    args = ap.parse_args()
    x1, y1, x2, y2 = (int(v) for v in args.lane.split(","))
    box = (min(x1, x2), min(y1, y2), max(x1, x2) + 1, max(y1, y2) + 1)

    ai = AIBridge()
    lane = belts(ai, box)
    # 벨트가 «있다»와 «나른다»는 다르다. 빼는 팔이 붙은 덩어리만 줄로 친다 -
    # 토막 옆에 앉힌 채굴기는 토막을 채우고 선다.
    alive = going_somewhere(ai)
    stubs = len(lane) - len([k for k in lane if k in alive])
    lane = {k: v for k, v in lane.items() if k in alive}
    if stubs:
        print(f"  어디로도 안 가는 벨트 {stubs}칸은 뺐다")
    seats = measure(ai, candidates(lane), args.ore)
    picked = choose(seats, args.max, args.min_ore)
    print(f"  벨트 {len(lane)}칸 · 옆자리 {len(seats)}곳 · 세울 만한 곳 {len(picked)}곳")
    for seat in picked:
        print(f"    ({seat['x']},{seat['y']}) {seat['ore']:>6}"
              f"  {'전기 닿음' if seat['lit'] else '전봇대 필요'}"
              + (f"  헌 채굴기 {len(seat['old'])}대 걷음" if seat["old"] else ""))
    dark = unlit(ai)
    if dark:
        print(f"  [!] 서 있는데 전기가 없는 채굴기 {len(dark)}대: "
              + ", ".join(f"({d['x']},{d['y']})" for d in dark))
    if args.who and dark:
        relight(ai, args.who, dark)       # 새로 세우기보다 선 것을 돌리는 게 먼저
    elif picked and args.who:
        build(ai, args.who, picked)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

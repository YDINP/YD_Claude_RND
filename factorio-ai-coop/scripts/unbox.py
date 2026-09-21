"""When the belt arrives, the chest goes.

사용자가 짚었다 - "채굴기쪽에 벨트연결할거면 상자는 없애야지"

측정해 보니 벨트로 떨구는 채굴기 여섯 대가 «전부» 옆에 상자를 두세 개씩
달고 있었다.

    벨트로 떨구는 채굴기   6대   (그 여섯 대 곁의 상자 14개)
    상자로 떨구는 채굴기  20대

상자는 「벨트가 아직 없을 때의 임시 출구」였다. 벨트가 오면 그 자리는
벨트 것이고, 남은 상자는 세 가지를 한다. 운반 당번이 헛걸음을 하고,
길찾기가 그 칸을 피해 돌아가고, 돌아간 길이 또 한 줄 깔린다.

    임시로 둔 것을 안 걷으면, 임시가 아니라 «지형»이 된다.

걷어내면 상자도 안에 든 것도 걷은 사람 가방으로 돌아온다. 그러니 버리는
것이 아니라 «옮기는» 것이다 - 다음 순번에 haul 이 창고에 푼다.

건드리지 않는 것: 팔(인서터)이 붙어 있는 상자. 그것은 적재소의 은행이지
임시 출구가 아니다. 그리고 창고 구역 안의 상자.

    python scripts/unbox.py --depot=-55,10               # 보기만
    python scripts/unbox.py --depot=-55,10 --who delta   # 걷어낸다
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

sys.path.insert(0, HERE)

PER_TRIP = 5              # 한 걸음에 걷는 상자 수 (계획 64단계 제한)
DEPOT_KEEP = 10           # 창고 한가운데에서 이만큼 안은 손대지 않는다
TIGHT = 0.4


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def idle(ai, names):
    live = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if live.get(n) and live[n].get("alive")
            and not (live[n].get("current") or live[n].get("queued"))]


def going_somewhere(ai) -> set:
    """«누가 비워 주는» 줄에 속한 벨트 칸들.

    21회차 - 이 스크립트가 석탄을 말렸다.

        석탄   상자 10,878 -> 64
        석탄 채굴기 6대 중 4대 "둘 곳 없음"

    기준이 「채굴기가 벨트에 떨구면 곁의 상자는 임시 출구다」였다. 그런데
    석탄 밭의 벨트는 한 칸에서 일곱 칸짜리 «토막»이었다. 어디로도 안
    간다. 상자를 걷자 그 채굴기들은 토막을 채우고 섰고, 운반 당번은
    집을 상자가 없어졌다.

        벨트가 «있다»와 벨트가 «나른다»는 다른 말이다.

    그래서 lines.py 에 묻는다. 빼는 팔이 하나라도 붙은 덩어리만 「가는
    줄」이다. 거기 떨구는 채굴기 곁의 상자만 임시 출구다.
    """
    import lines as lines_mod
    belt, _drill, pick, _put = lines_mod.look(ai)
    alive = set()
    for seg in lines_mod.segments(belt):
        if set(seg) & pick:
            alive.update(seg)
    return alive


def stale(ai, depot) -> list:
    """벨트로 떨구는 채굴기 곁에 남은, 아무도 안 쓰는 상자.

    「곁」은 채굴기 몸(2x2)에서 한 칸이다. 그보다 멀면 그 상자가 이
    채굴기의 출구였다고 말할 수 없다.
    """
    dx, dy = depot
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local belt = {}
      for _, b in pairs(s.find_entities_filtered{
            type = "transport-belt", force = f}) do
        belt[math.floor(b.position.x) .. "," .. math.floor(b.position.y)] = true
      end
      local seen, out = {}, {}
      for _, d in pairs(s.find_entities_filtered{
            type = "mining-drill", force = f}) do
        local p = d.drop_position
        local key = math.floor(p.x) .. "," .. math.floor(p.y)
        if belt[key] then
          local bx = math.floor(d.position.x)
          local by = math.floor(d.position.y)
          for _, c in pairs(s.find_entities_filtered{type = "container",
                force = f, area = {{bx - 2, by - 2}, {bx + 3, by + 3}}}) do
            local cx = math.floor(c.position.x)
            local cy = math.floor(c.position.y)
            local id = cx .. "," .. cy
            -- 창고 상자는 건드리지 않는다.
            local far = math.abs(cx - %d) > %d or math.abs(cy - %d) > %d
            -- 팔이 붙은 상자는 임시 출구가 아니라 은행이다.
            local arms = s.count_entities_filtered{type = {"inserter",
                           "burner-inserter"}, force = f,
                           area = {{cx - 1, cy - 1}, {cx + 2, cy + 2}}}
            if not seen[id] and far and arms == 0 then
              seen[id] = true
              local inv = c.get_inventory(defines.inventory.chest)
              local held = 0
              for _, i in pairs(inv.get_contents()) do held = held + i.count end
              out[#out+1] = cx .. "|" .. cy .. "|" .. c.name .. "|" .. held
            end
          end
        end
      end
      return out
    end)()""" % (dx, DEPOT_KEEP, dy, DEPOT_KEEP))
    out = []
    for row in _rows(reply):
        parts = str(row).split("|")
        if len(parts) == 4:
            out.append({"x": int(parts[0]), "y": int(parts[1]),
                        "name": parts[2], "held": int(parts[3])})
    return out


def clear(ai, who, boxes) -> bool:
    """걷어낸다. 그 자리에 «서서» 걷는다 - 멀리서 시킨 걷기는 조용히 실패한다."""
    boxes = boxes[:PER_TRIP]
    if not boxes:
        return False
    plan = []
    for box in boxes:
        plan.append(("walk_to", {"x": box["x"] + 1.5, "y": box["y"] + 1.5}))
        plan.append(("demolish", {"x": box["x"] + 0.5, "y": box["y"] + 0.5,
                                  "search_radius": TIGHT}))
    submit(ai, who, plan, strict=False)
    held = sum(b["held"] for b in boxes)
    print(f"{who}: 임시 출구 상자 {len(boxes)}개 걷기"
          f" (안에 든 것 {held}개는 가방으로)")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="-55,10")
    ap.add_argument("--who", default="")
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=4000)
    args = ap.parse_args()

    dx, dy = (int(v) for v in args.depot.split(","))
    who = [n.strip() for n in args.who.split(",") if n.strip()]

    ai = AIBridge()
    for _ in range(args.rounds if args.every else 1):
        try:
            alive = going_somewhere(ai)
            boxes = [b for b in stale(ai, (dx, dy))
                     if any((b["x"] + ox, b["y"] + oy) in alive
                            for ox in range(-3, 4) for oy in range(-3, 4))]
            if not boxes:
                print("  벨트로 바뀐 채굴기 곁에 남은 상자 없음")
            elif not who:
                held = sum(b["held"] for b in boxes)
                print(f"  임시 출구 상자 {len(boxes)}개 (안에 {held}개)"
                      f" - --who 를 주면 걷는다")
                for b in boxes[:8]:
                    print(f"    ({b['x']}, {b['y']}) {b['name']} {b['held']}개")
            else:
                hands = idle(ai, who)
                if not hands:
                    print(f"  걷을 상자 {len(boxes)}개 - 손이 비지 않는다")
                else:
                    clear(ai, hands[0], boxes)
        except RconError as exc:
            print(f"  [!] {exc}")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

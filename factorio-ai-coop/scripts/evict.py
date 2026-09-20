"""Take back the rows the smelting column reserved.

모드가 «앞으로는» 제련 기둥의 줄을 안 건드리게 됐다(belts.lua 의
smelt_guard). 그런데 이미 거기 선 것들은 그대로 남는다. 계획에서 빠지는
것과 «이미 선 것이 사라지는 것»은 다른 일이다.

    실측(배포 직후):
      (50,16) (52,16) (54,16)  벨트에서 집어 벨트에 놓는 팔 - 헛일
      (56,16) (58,16)          놓을 데가 아예 없는 팔
      y=15 / y=17              화로에서 «꺼내는 팔»이 설 줄인데 벨트가 깔림

사용자가 사진을 보고 물었다: "이렇게두면 인서터설치는 어떻게하게?"
걷어내야 그 자리에 팔이 선다.

이 고리는 «예약된 줄 위의 남의 것»만 걷는다. 제련 기둥 자신의 것은
건드리지 않는다 - 무엇이 제 것인지는 자리가 말해 준다.

    python scripts/evict.py --who echo --dry
    python scripts/evict.py --who echo
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402
import rows                             # noqa: E402

PER_TRIP = 12
TIGHT = 0.4               # 줄 안에서 한 칸만 집는다. flow.py 와 같은 이유


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def crossers(ai, x0, x1, ys):
    """위아래로 이어진 벨트 칸. 그 줄에 누운 것이 아니라 «지나가는» 것이다."""
    if not ys:
        return set()
    lo, hi = min(ys) - 1, max(ys) + 1
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local belt = {}
      for _, b in pairs(s.find_entities_filtered{
            area = {{%d, %d}, {%d, %d}},
            type = "transport-belt", force = f}) do
        belt[math.floor(b.position.x) .. "," .. math.floor(b.position.y)] = true
      end
      local out = {}
      for k, _ in pairs(belt) do
        local cx, cy = k:match("(-?%%d+),(-?%%d+)")
        cx, cy = tonumber(cx), tonumber(cy)
        if belt[cx .. "," .. (cy - 1)] and belt[cx .. "," .. (cy + 1)] then
          out[#out+1] = k
        end
      end
      return out
    end)()""" % (x0, lo, x1 + 1, hi + 1))
    out = set()
    for row in _rows(reply):
        cx, cy = str(row).split(",")
        out.add((int(cx), int(cy)))
    return out


def squatters(ai, zones):
    """예약된 줄 위에 선 «어울리지 않는» 것.

    처음에는 예약된 줄 위의 벨트와 팔을 전부 걷으려 했다. 마른 실행이
    아니었다면 방금 살려 놓은 급전 설비를 제 손으로 끊을 뻔했다.

        실측: y=11 벨트 35칸과 y=12 버너 인서터 14대가 목록에 섞여 있었다.
              둘 다 제련 기둥 «자신의 것»이고 지금 잘 돌고 있다.

    예약은 「아무것도 서면 안 된다」가 아니라 「그 줄의 주인만 선다」는
    뜻이다. 그리고 무엇이 주인인지는 줄이 말해 준다.

        벨트 줄(smelt.y-3, +2)   벨트가 맞다. 팔이 서 있으면 틀린 것이다
        팔 줄(smelt.y-2, +1, +3) 팔이 맞다. 벨트가 깔려 있으면 틀린 것이다

    화로 몸통 줄은 건드리지 않는다. 화로가 그 줄에 없다면 그것은 화로 줄이
    어긋난 것이고, 옮기는 일은 걷어내는 일과 다르다(grow 가 맡는다).
    """
    smelt = zones.get("smelt")
    if not smelt:
        return []
    x0, y, x1, _ = rows._box(smelt)

    # (줄 y, 이 줄의 주인, 걷어낼 갈래)
    duty = []
    for dy in rows.LANES:
        duty.append((y + dy, "벨트 줄", ["inserter", "splitter"]))
    for dy in rows.ARMS:
        duty.append((y + dy, "팔 줄",
                     ["transport-belt", "underground-belt", "splitter"]))

    # 세로로 «가로지르는» 벨트는 남긴다.
    #
    # belts.lua 는 화로 기둥 «사이» 칸으로 지나가는 것을 일부러 허용한다 -
    # 그런 칸은 어떤 팔도 막지 않기 때문이다. 실측: x=59 의 세로 벨트가
    # 그런 자리였고, 위아래로 이어져 제 일을 하고 있었다.
    #
    # 가로지르는 것과 «그 줄에 누운» 것은 다르다. 위아래에 제 짝이 있으면
    # 지나가는 중이고, 없으면 그 줄을 차지한 것이다.
    crossing = crossers(ai, x0, x1, [row_y for row_y, _, _ in duty])

    out = []
    for row_y, why, kinds in duty:
        body = ", ".join('"%s"' % k for k in kinds)
        reply = ai.lua("""(function()
          local s, f = game.surfaces[1], game.forces.player
          local out = {}
          for _, e in pairs(s.find_entities_filtered{
                area = {{%d, %d}, {%d, %d}},
                type = { %s }, force = f}) do
            out[#out+1] = string.format("%%d|%%d|%%s",
              math.floor(e.position.x), math.floor(e.position.y), e.name)
          end
          return out
        end)()""" % (x0, row_y, x1 + 1, row_y + 1, body))
        for row in _rows(reply):
            ex, ey, name = str(row).split("|")
            if (int(ex), int(ey)) in crossing:
                continue
            out.append({"x": int(ex), "y": int(ey), "name": name, "why": why})
    return sorted(out, key=lambda o: (o["y"], o["x"]))


def pull(ai, who, take):
    """걷는다. 한 칸을 가리키려면 그 칸의 «가운데»를 가리켜야 한다."""
    plan = [("walk_to", {"x": take[0]["x"] + 1, "y": take[0]["y"] + 2})]
    for one in take:
        plan.append(("demolish", {"x": one["x"] + 0.5, "y": one["y"] + 0.5,
                                  "name": one["name"],
                                  "search_radius": TIGHT}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 예약된 줄 위의 {len(take)}칸을 걷는다 "
          f"({take[0]['x']},{take[0]['y']}) 부터")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="echo")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    ai = AIBridge()
    zones = ai.zones(args.who)
    sitting = squatters(ai, zones)
    if not sitting:
        print("예약된 줄 위에 남의 것이 없다")
        return 0

    seen = {}
    for one in sitting:
        seen.setdefault(one["y"], []).append(one)
    print(f"예약된 줄 위의 남의 것 {len(sitting)}칸:")
    for y, group in sorted(seen.items()):
        spots = " ".join(f"({o['x']},{o['y']})" for o in group[:8])
        rest = f" 외 {len(group) - 8}" if len(group) > 8 else ""
        print(f"  y={y} {group[0]['why']}에 {group[0]['name']} "
              f"[{len(group)}]: {spots}{rest}")
    if args.dry:
        return 0

    pull(ai, args.who, sitting[:PER_TRIP])
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RconError as exc:
        print("게임이 대답하지 않는다:", exc)
        sys.exit(1)

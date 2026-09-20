"""Too many poles: the wire only has to reach, not to be everywhere.

    사용자: "전선이 불필요하게 과도하게 깔린 부분 발생함.
             이거 정리하고 로직개선할 것."

실측(20회차): 전봇대 39 대, 전기를 먹는 것 17 개. 제련줄 한 구간에만
열아홉 대가 서 있었다.

    [47,-1] [45,1]   두 대가 같은 인서터 둘을 덮는다
    [50,-1] [51,1]   여기도
    [53,-1] [56,-1] [57,1] [56,4]   네 대가 서로를 덮는다

원인은 `mains.cover()` 다. 굶는 것을 만나면 덮을 자리를 찾아 세우는데,
«이미 덮고 있는 전봇대»를 안 봤다. 전력망이 둘로 갈라져 있던 동안 제련줄
쪽 소비자들이 계속 「굶는다」고 나왔고, 고리는 그때마다 한 대씩 더 세웠다.
선이 안 이어진 것이 원인인데 덮개를 더 씌운 셈이다.

    덮이지 않아서 굶는 것과, 전기가 안 와서 굶는 것은 다른 말이다.

세운 것을 걷는 일에는 조심할 것이 하나 있다. 전봇대는 «덮는 일»과
«잇는 일»을 겸한다. 아무도 안 덮는 전봇대라도 그것을 걷는 순간 망이
둘로 갈라질 수 있다. 그래서 한 대를 걷을 때마다 두 가지를 다시 묻는다.

    1. 덮이던 것이 여전히 다 덮이나
    2. 남은 전봇대가 여전히 한 덩어리인가

둘 다 그렇다면 그 전봇대는 «없어도 되는» 것이다.

    python scripts/thin.py --who bravo
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

SUPPLY = 2.5              # 소형 전봇대가 덮는 반경 (5x5)
WIRE = 7.5                # 전선이 닿는 거리
PER_TRIP = 6              # 한 걸음에 걷는 수. 적게 걷고 «자주 확인»한다

# 거리가 닿는 것과 «이어진 것»은 또 다르다.
#
# 팩토리오는 전봇대를 세울 때 둘레의 것들과 자동으로 잇는다. 그런데 걷을
# 때는 남은 것들끼리 다시 잇지 않는다 - 가운데 한 대가 양옆을 이어 주고
# 있었다면, 그 한 대를 걷는 순간 양옆은 «거리가 닿아도» 끊긴다.
#
# 그래서 이 계산(거리 7.5 안이면 이어진다)은 낙관적이다. 낙관을 고치는
# 대신 «조금씩 걷고 매번 다시 잇는» 쪽을 택한다. mains.py 가 끊긴 곳을
# 찾아 메우는 일을 이미 하므로, 둘을 번갈아 돌리면 스스로 바로잡힌다.
#
#     python scripts/thin.py --who bravo
#     python scripts/mains.py --who bravo --from=... --to=... --depot=...


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def survey(ai):
    """전봇대·전기를 먹는 것·전기를 만드는 것. 좌표는 «중심»으로 받는다.

    타일 번호로 받으면 반 칸씩 어긋나고, 덮는 넓이가 5 칸일 때 반 칸은
    한 대를 살리거나 죽인다.
    """
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local poles, eats, makes = {}, {}, {}
      for _, p in pairs(s.find_entities_filtered{
            type = "electric-pole", force = f}) do
        poles[#poles+1] = string.format("%.2f|%.2f|%s|%d",
          p.position.x, p.position.y, p.name, p.unit_number)
      end
      for _, e in pairs(s.find_entities_filtered{force = f}) do
        local proto = e.prototype
        if proto.electric_energy_source_prototype
           and e.type ~= "electric-pole" then
          -- 덮이는지는 «중심»이 아니라 «상자»가 정한다. 증기기관은
          -- 5x3 이라 중심이 두 칸 반 밖에 있어도 몸통은 덮인다.
          -- 중심으로만 쟀더니 멀쩡히 돌던 발전기 둘을 「아무도 안 덮는
          -- 다」고 읽었다.
          local b = e.bounding_box
          eats[#eats+1] = string.format("%.2f|%.2f|%s|%.2f|%.2f|%.2f|%.2f",
            e.position.x, e.position.y, e.name,
            b.left_top.x, b.left_top.y, b.right_bottom.x, b.right_bottom.y)
        end
        if e.type == "generator" or e.type == "solar-panel"
           or e.type == "burner-generator" then
          makes[#makes+1] = string.format("%.2f|%.2f|%s", e.position.x,
            e.position.y, e.name)
        end
      end
      return { poles = poles, eats = eats, makes = makes }
    end)()""")

    def parse(rows, with_id=False, boxed=False):
        out = []
        for row in _rows(rows):
            bits = str(row).split("|")
            one = {"x": float(bits[0]), "y": float(bits[1]), "name": bits[2]}
            if with_id and len(bits) > 3:
                one["id"] = int(bits[3])
            if boxed and len(bits) > 6:
                one["box"] = (float(bits[3]), float(bits[4]),
                              float(bits[5]), float(bits[6]))
            out.append(one)
        return out

    return (parse(reply.get("poles"), True),
            parse(reply.get("eats"), boxed=True),
            parse(reply.get("makes")))


def covers(pole, thing, reach=SUPPLY):
    """이 전봇대가 저것을 덮나.

    공급 넓이는 전봇대 중심에서 사방 reach 만큼의 네모다. 건물도 네모다.
    두 네모가 «겹치면» 덮인 것이다 - 건물의 중심이 안에 들어와야 하는
    것이 아니다.
    """
    box = thing.get("box")
    if not box:
        return (abs(pole["x"] - thing["x"]) <= reach
                and abs(pole["y"] - thing["y"]) <= reach)
    lx, ly, rx, ry = box
    return (lx <= pole["x"] + reach and rx >= pole["x"] - reach
            and ly <= pole["y"] + reach and ry >= pole["y"] - reach)


def whole(poles, seeds):
    """남은 전봇대가 «한 덩어리»인가. seeds 에서 걸어가 다 닿아야 한다.

    발전기에서 출발해 걷는다. 발전기가 없으면 아무 데서나 출발한다 -
    그때는 「전기가 오는가」를 물을 수 없고 「끊겼는가」만 물을 수 있다.
    """
    if not poles:
        return True
    start = None
    for pole in poles:
        if any(covers(pole, one, SUPPLY) for one in seeds):
            start = pole
            break
    if start is None:
        start = poles[0]

    seen = {start["id"]}
    edge = [start]
    while edge:
        here = edge.pop()
        for pole in poles:
            if pole["id"] in seen:
                continue
            if math.hypot(pole["x"] - here["x"], pole["y"] - here["y"]) <= WIRE:
                seen.add(pole["id"])
                edge.append(pole)
    return len(seen) == len(poles)


def spare(poles, eats, makes):
    """없어도 되는 전봇대. 한 대씩 빼 보고 «둘 다» 성하면 뺀다.

    한꺼번에 여럿을 빼고 검사하면 안 된다. 각각은 없어도 되는 둘이 서로의
    유일한 다리일 수 있다 - 따로 보면 둘 다 군더더기인데 같이 빼면 길이
    끊긴다.
    """
    left = list(poles)
    dropped = []
    # 이웃이 많은 것부터 빼 본다. 겹침이 심한 곳이 먼저 정리된다.
    order = sorted(poles, key=lambda p: -sum(
        1 for q in poles if q["id"] != p["id"]
        and math.hypot(q["x"] - p["x"], q["y"] - p["y"]) <= WIRE))
    for pole in order:
        rest = [p for p in left if p["id"] != pole["id"]]
        if len(rest) == len(left):
            continue
        naked = [one for one in eats
                 if not any(covers(p, one) for p in rest)]
        if naked:
            continue
        if not whole(rest, makes):
            continue
        left = rest
        dropped.append(pole)
    return dropped, left


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="bravo")
    ap.add_argument("--dry", action="store_true", help="세지만 걷지는 않는다")
    args = ap.parse_args()

    ai = AIBridge()
    poles, eats, makes = survey(ai)
    print(f"전봇대 {len(poles)}대 · 먹는 것 {len(eats)}개 · 만드는 것 {len(makes)}개")

    naked = [one for one in eats if not any(covers(p, one) for p in poles)]
    if naked:
        print(f"  [!] 아무도 안 덮는 것 {len(naked)}개 - 걷기 전에 덮을 것")
        return 1
    if not whole(poles, makes):
        print("  [!] 지금 이미 망이 갈라져 있다 - 이어 놓고 다시 부를 것")
        return 1

    drop, left = spare(poles, eats, makes)
    if not drop:
        print("군더더기 없음 - 전봇대가 전부 제 몫을 한다")
        return 0

    print(f"없어도 되는 전봇대 {len(drop)}대 "
          f"({len(poles)} -> {len(left)}):")
    for pole in drop[:PER_TRIP]:
        print(f"  [{pole['x']:.0f},{pole['y']:.0f}]")
    if args.dry:
        return 0

    batch = drop[:PER_TRIP]
    plan = [("walk_to", {"x": batch[0]["x"], "y": batch[0]["y"] + 2})]
    for pole in batch:
        plan.append(("demolish", {"x": math.floor(pole["x"]),
                                  "y": math.floor(pole["y"]),
                                  "name": pole["name"]}))
    submit(ai, args.who, plan, strict=False)
    print(f"{args.who}: 겹친 전봇대 {len(batch)}대를 걷는다")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RconError as exc:
        print("게임이 대답하지 않는다:", exc)
        sys.exit(1)

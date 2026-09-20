"""Take back what we built in the wrong place.

기준점이 어긋나면 «제대로 지은 것»이 통째로 쓸모를 잃는다. 21회차가
그랬다 - 화로는 `--smelt` 를 따라 y=10 에 섰고, 벨트를 까는 쪽은 모드
구역 (-53,36) 을 따라 y=30..38 에 깔았다.

    화로 8대 전부   「넣어 줄 팔도 꺼내 줄 팔도 없다」
    팔 48대 중 36대 「집을 것도 놓을 데도 없다」
    벨트 155칸      아무것도 안 들어오고 아무 데도 안 간다

양쪽 다 제 기준에는 맞게 지었으므로 아무도 틀렸다고 말하지 않았다.
한 줄도 쓸모가 없었을 뿐이다.

기준점은 고쳤다(`grow.smelt_row` 가 대체 좌표를 쓸 때 구역도 못 박는다).
남은 것은 이미 깔린 것을 «되찾는» 일이다. 벨트 한 칸이 철판 둘이고,
그때 창고 철판은 0이었다.

    잘못 놓인 것은 버린 것이 아니라 «아직 안 쓴 재료»다.

⚠️ **벨트를 까는 고리가 도는 동안에는 쓰지 말 것.**

세 번째로 배운 것이 이것이다. 줄 단위로 물었더니 판정은 정확해졌는데,
「아직 안 이어진 줄」과 「영영 안 이어질 줄」이 똑같이 죽은 것으로 나왔다.

    죽은 칸 72 중 y=9..30 의 스물두 칸은 «지금 깔리는 중»인 세로줄이었다.
    한 칸씩 놓이는 중이라 아직 아무 데도 안 닿았을 뿐이다.

    짓는 중인 것과 버린 것은 밖에서 보면 같다.

모양으로는 가를 수 없다. 가르는 것은 «시간»이다 - 그래서 이 스크립트는
flow 가 멈춘 «뒤에» 돌린다. 그때 죽어 있는 줄은 정말 죽은 줄이다.

    python scripts/flow.py ...        # 먼저 길이 다 이어지길 기다리고
    python scripts/reclaim.py --box=-56,-20,0,110 --depot=-55,10
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

# 걷을 것. 화로와 채굴기는 손대지 않는다 - 잘못 놓였더라도 그것은
# 「옮길 것」이지 「걷을 것」이 아니고, 판단이 다르면 다루는 손도 달라야 한다.
# 상자는 «여기서» 걷지 않는다. 채굴기가 아직 그 상자를 보고 있으면
# 걷는 순간 갈 곳을 잃는다 - 그 판단은 tidy.py 가 「벨트가 곁에 있는가」를
# 먼저 묻고 내린다. 판단이 다르면 다루는 손도 달라야 한다.
TAKEABLE = ("transport-belt", "underground-belt", "splitter",
            "burner-inserter", "inserter")

# 한 걸음에 걷는 칸 수. 계획이 64단계를 넘으면 모드가 «통째로» 거절한다.
PER_TRIP = 20

# 한 칸만 집는다. 줄 안에서 이웃을 집으면 엉뚱한 구멍이 남는다.
TIGHT = 0.4


def middle(x, y):
    """타일 번호를 그 칸의 «가운데»로. 한 칸을 가리키려면 여기를 찍는다."""
    return x + 0.5, y + 0.5


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def strays(ai, box, dry=False):
    """이 상자 안에서 «쓸모가 없는» 것들. 판단은 칸이 아니라 «줄»이 받는다.

    두 번 틀리고 알았다.

    처음에는 네모 안의 벨트와 팔을 전부 걷었다. 곧바로 틀렸다 - 옛 제련
    기둥과, 그 자리를 가로질러 «새로 깔리는 길»이 같은 네모 안에 있었다.
    네모는 「어디」를 말할 뿐 「쓸모」를 말하지 않는다.

    그래서 칸마다 「이웃이 있나」를 물었다. 이번에는 한 칸도 안 잡혔다 -
    고아 벨트들은 «서로» 붙어 있기 때문이다. 백서른일곱 칸이 사이좋게
    이웃하며 아무 데도 안 가고 있었다.

        쓸모는 한 칸의 성질이 아니라 «줄»의 성질이다.

    그래서 붙어 있는 벨트를 한 줄로 묶고, 그 줄에 «진짜 팔»이나 채굴기가
    하나라도 닿는지 묻는다. 진짜 팔이란 한쪽이 기계(화로.채굴기.상자)고
    다른 쪽이 벨트인 팔이다 - 양쪽 다 허공이면 그것도 고아다.

    아무것도 안 닿는 줄은, 아무리 길고 아무리 반듯해도, 길이 아니다.
    """
    left, top, right, bottom = box
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local f = game.forces.player
      local box = {{%d,%d},{%d,%d}}
      local BELT = {"transport-belt","underground-belt","splitter"}
      local MACHINE = {"furnace","mining-drill","container",
                       "assembling-machine","lab","ammo-turret","boiler"}

      local function at(p, types)
        return s.count_entities_filtered{position=p, radius=0.4,
                 force=f, type=types} > 0
      end

      -- 1. 벨트를 붙은 것끼리 묶는다.
      local belts = s.find_entities_filtered{area=box, force=f, type=BELT}
      local key = {}
      local function k(p) return string.format("%%d:%%d",
        math.floor(p.x), math.floor(p.y)) end
      for _, e in pairs(belts) do key[k(e.position)] = e end
      local group, groups = {}, {}
      for _, e in pairs(belts) do
        local root = k(e.position)
        if not group[root] then
          local id = #groups + 1
          groups[id] = { tiles = {}, alive = false }
          local stack = { root }
          group[root] = id
          while #stack > 0 do
            local cur = table.remove(stack)
            local ent = key[cur]
            groups[id].tiles[#groups[id].tiles+1] = ent
            for _, d in pairs({{1,0},{-1,0},{0,1},{0,-1}}) do
              local n = string.format("%%d:%%d",
                math.floor(ent.position.x) + d[1],
                math.floor(ent.position.y) + d[2])
              if key[n] and not group[n] then
                group[n] = id
                stack[#stack+1] = n
              end
            end
          end
        end
      end

      -- 2. 「진짜 팔」을 가린다: 한쪽이 기계, 다른 쪽이 벨트.
      local arms = s.find_entities_filtered{area=box, force=f, type="inserter"}
      local dead_arms = {}
      for _, a in pairs(arms) do
        local pm, pb = at(a.pickup_position, MACHINE), at(a.pickup_position, BELT)
        local dm, db = at(a.drop_position, MACHINE), at(a.drop_position, BELT)
        local real = (pm and db) or (pb and dm) or (pm and dm)
        if real then
          for _, p in pairs({a.pickup_position, a.drop_position}) do
            local id = group[k(p)]
            if id then groups[id].alive = true end
          end
        else
          dead_arms[#dead_arms+1] = a
        end
      end

      -- 3. 채굴기가 직접 떨구는 줄도 살아 있다.
      for _, d in pairs(s.find_entities_filtered{area=box, force=f,
            type="mining-drill"}) do
        local id = group[k(d.drop_position)]
        if id then groups[id].alive = true end
      end

      local out, live, dead = {}, 0, 0
      for _, g in pairs(groups) do
        if g.alive then live = live + #g.tiles
        else
          dead = dead + #g.tiles
          for _, e in pairs(g.tiles) do
            out[#out+1] = string.format("%%.1f|%%.1f|%%s",
              e.position.x, e.position.y, e.name)
          end
        end
      end
      for _, a in pairs(dead_arms) do
        out[#out+1] = string.format("%%.1f|%%.1f|%%s",
          a.position.x, a.position.y, a.name)
      end
      return { found = out, live = live, dead = dead,
               groups = #groups, dead_arms = #dead_arms }
    end)()""" % (left, top, right, bottom))
    out = []
    for row in _rows(reply.get("found")):
        x, y, name = row.split("|")
        out.append((float(x), float(y), name))
    if dry:
        print(f"  줄 {reply.get('groups')}개 · 살아 있는 칸 {reply.get('live')} "
              f"· 죽은 칸 {reply.get('dead')} · 고아 팔 {reply.get('dead_arms')}")
    return out


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def haul_back(ai, who, found, shelf):
    """가까운 것부터 걷고, 창고에 돌려놓는다."""
    batch = sorted(found, key=lambda p: (p[1], p[0]))[:PER_TRIP]
    if not batch:
        return False
    plan = [("walk_to", {"x": batch[0][0], "y": batch[0][1] - 2})]
    for x, y, _ in batch:
        # 이미 «중심» 좌표로 받았다. 여기서 또 반 칸을 더하면 이웃을 집는다.
        plan.append(("demolish", {"x": x, "y": y, "search_radius": TIGHT}))
    plan.append(("walk_to", {"x": shelf[0] - 2, "y": shelf[1] + 1}))
    for name in ("transport-belt", "burner-inserter", "inserter",
                 "underground-belt", "splitter"):
        if any(n == name for _, _, n in batch):
            plan.append(("insert", {"name": name, "x": shelf[0], "y": shelf[1],
                                    "count": PER_TRIP}))
    submit(ai, who, plan, strict=False)
    kinds = {}
    for _, _, n in batch:
        kinds[n] = kinds.get(n, 0) + 1
    print(f"{who}: 잘못 놓인 {len(batch)}칸 회수 - {kinds}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--box", required=True,
                    help="걷을 네모. left,top,right,bottom (음수는 --box=-5,-9,..)")
    ap.add_argument("--depot", required=True, help="음수는 --depot=-5,-90")
    ap.add_argument("--who", action="append", default=None)
    ap.add_argument("--every", type=float, default=12)
    ap.add_argument("--rounds", type=int, default=400)
    args = ap.parse_args()

    box = tuple(int(v) for v in args.box.split(","))
    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = (dx + 0.5, dy + 0.5)
    crew = args.who or ["delta"]

    ai = AIBridge()
    for _ in range(args.rounds):
        try:
            found = strays(ai, box)
            if not found:
                print("  다 걷었다 - 그 네모에 남은 것이 없다")
                return 0
            free = idle(ai, crew)
            if not free:
                time.sleep(args.every)
                continue
            for who in free:
                if not haul_back(ai, who, found, shelf):
                    break
                found = found[PER_TRIP:]
                if not found:
                    break
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:                   # 고리는 «안 죽는다»
            print("  건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

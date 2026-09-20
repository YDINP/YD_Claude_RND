"""Cold start: keep turning plates into drills, and keep those drills running.

    사용자: "시작했을때 제일 우선으로 할거는 채굴기를 만들어서 광석마다
             배치해서 생산효율을 올리는게 콜드스타트의 지점이야."

This is the only exponential stretch in the game. A burner drill costs nine
iron plates and five stone and then mines 0.25/s forever - several hands'
worth, and unlike a hand it never has to be somewhere else. So: plates
become drills, and those drills make the plates for the next batch.

**Two duties, not one.** Run 18 had seven drills standing and production
zero:

    drill(-5,-111)  waiting_for_space_in_destination
    drill(49,-97)   no_fuel

A drill with nowhere to put what it digs is the same as no drill, and every
character went on mining by hand beside it. Sowing without tending is not
half the job, it is none of it - so `tend` runs **first** every round, and
it looks at what the game reports rather than at what this loop remembers,
which means it also fixes drills someone else left standing.

    python scripts/grow.py --depot 60,-115
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
from settle import near_patch           # noqa: E402
import rows                             # noqa: E402
from guard import covered                # noqa: E402

# 지킬 수 있는 만큼만 넓힌다.
#
#     사용자: "이게 너무 포탑을 띄워놓으면 안되는이유야."
#
# 20회차에서 여덟 중 여섯이 죽었다. 그때 우리 건물은 443채였고 포탑
# 사거리 안에 있던 것은 169채(38%)뿐이었다. 기지는 멀쩡했다 - 죽은 것은
# 그 62% 바깥으로 걸어간 사람들이다.
#
# 채굴기를 늘릴수록 밭은 바깥으로 자라고, 무리는 그만큼 멀리 나간다.
# 방어선이 못 따라오는데 계속 늘리면 그것은 늘리는 것이 아니라 «내주는»
# 것이다. 덮인 비율이 이보다 낮으면 늘리지 않고 기다린다.
SAFE_ENOUGH = 80

# 늘리는 것 «자체»가 물결을 불러들인다.
#
#     사용자: "공습은 공해농도가짙을수록 더 많고 쌘애들이 오니까 이점
#              유의하고. 채굴기는 너무막 늘리기보단 병목/부족 현상이
#              없을정도로 천천히 늘려가는게 좋음."
#
# 실측(여섯이 죽은 직후): 기지 둘레 공해 합 32731, 가장 짙은 칸 258 이
# (80,-16) - 사람들이 죽은 «바로 그 동쪽 밭»이다. 진화도 0.2219.
#
# 버너 채굴기는 전기 채굴기와 달리 제 몸으로 석탄을 태운다. 181대를
# 세워 놓으면 181개의 굴뚝이 선 것과 같다. 공해는 퍼져서 둥지에 닿고,
# 둥지는 «공해가 오는 쪽»으로 물결을 보낸다.
#
#     많이 캐려고 늘린 것이 «많이 맞는» 이유가 된다.
#
# 그래서 재료가 있다고 늘리지 않는다. 모자랄 때만 늘린다.
POLLUTION_CEIL = 220      # 기지 칸 공해가 이보다 짙으면 더 안 늘린다
GUARD_FROM = 40           # 공해가 이만큼 되기 전에는 방어선을 안 따진다

# 문턱에도 «때»가 있다.
#
# 방어선을 요구하는 이유는 공해가 물결을 부르기 때문이다. 그러니 공해가
# 아직 없고 적도 멀면 그 요구는 뜻이 없다 - 콜드스타트에는 포탑도 건물도
# 없어서 덮인 비율이 언제나 0%고, 그 0% 때문에 첫 채굴기조차 못 세운다.
#
#     지킬 것이 없을 때 「지키고 나서 하라」는 말은 «하지 말라»는 말이다.
#
# 그래서 공해가 둥지에 닿을 만큼 쌓이기 시작할 때부터 따진다.
HUNGRY_FURNACES = 3       # 화로가 이만큼 굶어야 «채굴기»를 늘린다
ORE_BACKLOG = 2500        # 광석이 이만큼 쌓여야 «화로»를 늘린다

DRILL = "burner-mining-drill"
CHEST = "iron-chest"
DRILL_COST = {"iron-plate": 9, "stone": 5}
CHEST_COST = {"iron-plate": 8}
# 한 걸음에 세우는 채굴기.
#
#     사용자: "채굴기들은 늘릴 수 있으면 늘려도됨"
#
# 넷으로 잡아 둔 것은 판이 귀하던 개국의 값이다. 지금은 화로가 판을
# 2368장 물고 있고 밭 상자에는 광석이 16289 쌓여 있다 - 아끼는 쪽이
# 아니라 «푸는 쪽»을 늘려야 한다.
PER_TRIP = 8
FUEL_EACH = 25

# 연구소가 설 때까지 «건드리지 않는» 판.
#
# 채굴기 한 대는 자기 값을 갚는다. 그래서 판이 생기는 족족 채굴기로
# 바꾸는 것이 맞는 것처럼 보이는데, 18.19회차가 그렇게 하다 졌다:
# 창고 판이 0~15에서 못 올라가 발전 사슬이 「짐이 모자란다」에서 한
# 발짝도 못 나갔고, 연구가 없으니 포탑이 없었고, 그래서 전멸했다.
#
# 채굴기는 «늦어도» 되지만 연구는 늦으면 안 된다. 둥지는 기다려 주지
# 않는다. 연구소가 서면 이 몫은 사라진다.
SPARK_RESERVE = 170
COLD_START = 12           # 이만큼 서기 전에는 «발전 사슬 몫»을 안 뗀다

# 몫을 떼는 데도 «때»가 있다.
#
# 사용자 교리: 채굴기(콜드스타트) -> 생산자동화 -> 재련·유통 -> 조립 ->
#              포탑 방어선 -> 고도화
#
# 발전과 연구는 그 줄의 뒤쪽이다. 그런데 판이 생기자마자 백칠십을 떼어
# 두면 첫 채굴기조차 못 선다.
#
#     실측(21회차): 화로 8대 전부 원료 없음, 노는 사람 6명, 판 80.
#                   그 80이 전부 「발전 사슬 몫」으로 묶여 있었다.
#
# 채굴기가 없으면 광석이 없고, 광석이 없으면 판도 안 는다. 떼어 둔 몫은
# 영영 안 채워지고 채굴기도 영영 안 선다.
#
#     맨 앞에 두어야 할 것을 뒤로 미루면, 뒤엣것도 같이 못 온다.

# 화로는 «채굴기를 따라간다».
#
# 버너 채굴기는 0.25/s 를 캐고 돌화로는 0.3125/s 를 녹인다. 그러니
# 화로 한 대가 채굴기 1.25대를 감당하고, 뒤집으면 채굴기 한 대에
# 화로 0.8대가 필요하다.
#
# 20회차 32분 실측: 채굴기 14대(3.5/s)에 화로 8대(2.5/s). 캔 것의
# 30%가 상자에 쌓이기만 했다. 「생산이 느리다」의 정체가 그것이다.
#
# 숫자를 손으로 올리면 다음 판에서 또 어긋난다. 비율을 적어 둔다.
DRILL_PER_SECOND = 0.25
FURNACE_PER_SECOND = 0.3125
MELT_RATIO = DRILL_PER_SECOND / FURNACE_PER_SECOND     # 0.8
FURNACE = "stone-furnace"
FURNACE_COST = {"stone": 5}
# 화로 상한. 채굴기를 늘리면 여기도 따라 올려야 한다 - 안 그러면
# 캔 것이 상자에서 잠기고, 그 채굴기는 없는 것과 같아진다.
#
# 예전에는 줄을 다섯 줄까지 접어 마흔 대를 채웠다. 지금은 모드 구역이
# 잡아 둔 두 줄만 쓴다(rows.py) - 나머지 줄은 벨트 줄과 팔 줄이다. 실제
# 상한은 구역 폭이 정하고, 마흔은 그 위의 목표치일 뿐이다. 자리가
# 없으면 widen() 이 스스로 멈춘다.
MAX_FURNACE = 40
FURNACE_PER_TRIP = 4
PER_ROW = 8                   # rows.py 가 구역을 아직 모를 때의 대체 줄 폭
TEND_PER_TRIP = 3

# 한 대라도 멈춰 있으면 그것부터. 세우는 것보다 «세워 둔 것을 돌리는» 편이
# 언제나 싸다 - 재료가 안 들고, 이미 광맥 위에 서 있다.
STUCK = ("waiting_for_space_in_destination", "no_fuel")

# 사방이 다 막힌 채굴기는 다음 순번에 또 봐도 막혀 있다. 매번 손보기
# 차례를 거기에 쓰면 고칠 수 있는 것들이 영영 차례를 못 받는다.
HOPELESS: set = set()

# 매듭은 한 번만 끊으면 된다. 순번마다 다른 사람을 또 보내면 세 명이
# 같은 돌밭에서 손으로 캐고, 정작 채굴기를 세울 사람이 없어진다.
PRIMING: dict = {}


def stock(ai, depot):
    x, y = depot
    return ai.lua("""(function()
      local s = game.surfaces[1]
      -- 「비었다」와 «아직 없다»는 다른 말이다. 창고가 서기도 전에
      -- 물건을 넣으러 가면 그 걸음은 통째로 버려진다.
      local out = { plate = 0, stone = 0, coal = 0, copper = 0, chests = 0,
                    stone_room = 0, plate_room = 0, coal_room = 0,
                    lab = s.count_entities_filtered{ name = "lab",
                          force = game.forces.player } }
      for _, c in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="container", force=game.forces.player}) do
        local inv = c.get_inventory(defines.inventory.chest)
        out.chests = out.chests + 1
        out.plate = out.plate + inv.get_item_count("iron-plate")
        out.stone = out.stone + inv.get_item_count("stone")
        out.coal = out.coal + inv.get_item_count("coal")
        out.copper = out.copper + inv.get_item_count("copper-plate")
                               + inv.get_item_count("copper-ore")
        -- 빈 칸이 몇인가. 찬 상자에 넣으러 가는 걸음은 통째로 버려진다.
        local free = 0
        for i = 1, #inv do
          if not inv[i].valid_for_read then free = free + 1 end
        end
        if math.abs(c.position.y - (%d + 2.5)) < 1 then
          out.stone_room = out.stone_room + free
        elseif math.abs(c.position.y - (%d + 4.5)) < 1 then
          out.coal_room = out.coal_room + free
        else
          out.plate_room = out.plate_room + free
        end
      end
      return out
    end)()""" % (x - 3, y - 4, x + 3, y + 6, y, y))


def stalled(ai):
    """멈춰 선 채굴기. 「무엇이 없나」까지 게임이 말해 준다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, d in pairs(s.find_entities_filtered{type="mining-drill",
                force=game.forces.player}) do
        local why = nil
        if d.status == defines.entity_status.waiting_for_space_in_destination then
          why = "no_outlet"
        elseif d.status == defines.entity_status.no_fuel then
          why = "no_fuel"
        end
        if why then
          out[#out+1] = string.format("%.1f|%.1f|%s", d.position.x, d.position.y, why)
        end
      end
      return out
    end)()""")
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for row in rows:
        x, y, why = row.split("|")
        out.append({"x": float(x), "y": float(y), "why": why})
    return out


def spent(ai):
    """캘 것이 없어진 채굴기. 사용자 요청으로 «알아서» 걷는다.

        "채취가능자원 없는 채굴기 발생하면 알아서 정리해"

    광맥이 마른 자리의 채굴기는 연료만 태우면서 공해를 낸다 - 세워 둔
    채로 두면 「채굴기 스물일곱 대」라는 숫자만 남고 캐는 것은 줄어든다.
    걷으면 채굴기가 손으로 돌아오므로, 다음 순번에 «살아 있는 칸»에
    다시 선다. 버리는 것이 아니라 옮기는 것이다.
    """
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, d in pairs(s.find_entities_filtered{type = "mining-drill",
                force = game.forces.player}) do
        if d.status == defines.entity_status.no_minable_resources then
          out[#out+1] = string.format("%.1f|%.1f|%s", d.position.x,
                                      d.position.y, d.name)
        end
      end
      return out
    end)()""")
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for row in rows:
        x, y, name = row.split("|")
        out.append({"x": float(x), "y": float(y), "name": name})
    return out


def reclaim(ai, who, dead, shelf):
    """마른 채굴기를 걷어 창고에 돌려놓는다."""
    take = dead[:6]
    plan = [("walk_to", {"x": take[0]["x"] + 2, "y": take[0]["y"] + 2})]
    for one in take:
        # 안엣것(연료)을 먼저 꺼낸다. 그냥 걷으면 같이 사라진다.
        plan.append(("take", {"name": "coal", "x": one["x"], "y": one["y"],
                              "count": 50}))
        plan.append(("demolish", {"x": one["x"], "y": one["y"],
                                  "name": one["name"]}))
    plan.append(("walk_to", {"x": shelf["coal"][0] - 2, "y": shelf["coal"][1] + 1}))
    plan.append(("insert", {"name": "coal", "x": shelf["coal"][0],
                            "y": shelf["coal"][1], "count": 300}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 마른 채굴기 {len(take)}대 걷기 - 다음 순번에 살아 있는 칸으로")
    return True


def fields(ai, anchor):
    """밭은 게임에 묻는다. 적어 두면 판이 바뀔 때마다 틀린다.

    그리고 «밭 전체»가 아니라 기지에서 가까운 덩어리를 묻는다. 19회차
    돌밭은 전체 경계가 (33,-76)..(57,128) 로 200칸짜리 허수 상자였는데,
    실제로 캘 수 있는 덩어리는 그 중 (42,-76)..(57,-60) 뿐이었다.
    """
    out = {}
    for ore in ("iron-ore", "coal", "stone", "copper-ore"):
        patch = near_patch(ai, ore, anchor)
        if patch:
            out[ore] = patch
    return out


def idle(ai, names):
    rows = {w["name"]: w for w in ai.list()}
    return [n for n in names
            if rows.get(n) and rows[n].get("alive")
            and not (rows[n].get("current") or rows[n].get("queued"))]


def shopping(shelf, need):
    """창고에서 집어 올 것들. 없는 것을 달라고 하면 계획 전체가 멈춘다."""
    return [("take", {"name": item, "x": shelf[item][0], "y": shelf[item][1],
                      "count": count})
            for item, count in need.items() if count > 0]


KEEP = 20          # 손에 남겨 두는 몫. 다 비우면 다음 걸음에 또 창고에 들른다
WORTH_A_TRIP = 25  # 이만큼도 안 되면 창고까지 다녀올 값을 못 한다


ROOM_OF = {"stone": "stone_room", "coal": "coal_room",
           "iron-plate": "plate_room"}


def unload(ai, who, shelf, st=None):
    """들고만 있는 것을 창고에 내려놓는다.

    창고가 비었는데 고리가 「제련이 따라오길 기다린다」만 되풀이한 적이
    있다. 그때 창고의 석탄은 0이었고, 한 사람이 석탄 200을 들고 서 있었다.
    가진 것과 «쓸 수 있는 것»은 다르다 - 창고에 있어야 쓸 수 있다.
    """
    held = ai.agent(who).items()
    drop = {k: v - KEEP for k, v in held.items()
            if k in shelf and v - KEEP >= WORTH_A_TRIP
            and (st is None or int(st.get(ROOM_OF.get(k, ""), 1)) > 0)}
    if not drop:
        return False
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1})]
    plan += [("insert", {"name": k, "x": shelf[k][0], "y": shelf[k][1], "count": v})
             for k, v in drop.items()]
    submit(ai, who, plan, strict=False)
    print(f"{who}: 창고에 내려놓기 {drop}")
    return True


def has_box(ai, at):
    """이 칸에 «받아 줄 것»이 서 있나. 상자든 벨트든 받으면 된다."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      return { n = s.count_entities_filtered{ position = {%.2f, %.2f}, radius = 0.7,
        type = {"container", "logistic-container", "transport-belt"},
        force = game.forces.player } }
    end)()""" % (at[0], at[1]))
    return int(reply["n"]) > 0


def tend(ai, who, shelf, sick):
    """멈춘 채굴기에 출구와 연료를 준다.

    어디가 출구인지는 «채굴기에게 묻는다». 방향을 짐작해 상자를 놓으면
    상자는 서 있는데 광석은 여전히 땅에 쌓인다. 막혀 있으면 aim_drill 이
    비는 쪽으로 돌려 주므로, 돌린 뒤의 답을 쓴다.
    """
    jobs, full = [], []
    sick = [d for d in sick if (round(d["x"]), round(d["y"])) not in HOPELESS]
    # 몫을 «자르고 나서» 거르면, 앞의 셋이 전부 「상자가 찬」 것일 때
    # 손볼 수 있는 뒤엣것들이 영영 차례를 못 받는다. 거르고 나서 센다.
    for one in sick:
        if len(jobs) >= TEND_PER_TRIP:
            break
        if one["why"] == "no_fuel":
            jobs.append({"drill": one, "drop": None})
            continue
        aimed = ai.aim_drill(who, one["x"], one["y"])
        if aimed.get("error"):
            print(f"  ({one['x']:.0f},{one['y']:.0f}) 사방이 막혔다 - 이 대는 접는다")
            HOPELESS.add((round(one["x"]), round(one["y"])))
            continue
        drop = (aimed["drop_x"], aimed["drop_y"])
        # 상자가 «이미» 있는데도 멈춰 있으면 그 상자가 찬 것이다. 그것은
        # 정비가 아니라 «운반»의 일이다 - 여기서 또 손보러 가면 순번마다
        # 「상자 0」만 찍고 돌아온다(18.19회차에 계속 그랬다).
        if has_box(ai, drop):
            full.append(one)
            continue
        jobs.append({"drill": one, "drop": drop})
    if not jobs:
        if full:
            print(f"  상자가 찬 채굴기 {len(full)}대 - 정비가 아니라 «운반»이 밀렸다")
        return False

    boxes = [j for j in jobs if j["drop"]]

    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2, "y": shelf["iron-plate"][1] + 1})]
    plan += shopping(shelf, {"iron-plate": len(boxes) * CHEST_COST["iron-plate"] + 2,
                             "coal": len(jobs) * FUEL_EACH})
    if boxes:
        plan.append(("craft", {"recipe": CHEST, "count": len(boxes), "wait": False}))
    for job in jobs:
        d = job["drill"]
        if job in boxes:
            plan.append(("build", {"name": CHEST, "x": job["drop"][0], "y": job["drop"][1]}))
        plan.append(("insert", {"name": "coal", "x": d["x"], "y": d["y"],
                                "count": FUEL_EACH}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 멈춘 채굴기 {len(jobs)}대 손보기 (상자 {len(boxes)})")
    return True


# 자기 꼬리를 문 것은 돌만이 아니다.
#
#   돌   - 채굴기에 돌 5가 든다. 창고 돌이 0이면 돌밭 채굴기를 못 만든다
#   석탄 - 석탄 채굴기도 석탄을 먹는다. 0이면 못 켠다
#   구리 - 구리가 없으면 회로도 과학팩도 없고, 그러면 연구가 없고,
#          연구가 없으면 포탑이 없다. 18.19회차가 여기서 죽었다
#
# 셋 다 「없어서 못 만들고, 못 만들어서 없는」 같은 모양이다. 손으로
# 한 번만 끊어 주면 그 뒤로는 기계가 돈다.
KNOTS = ("stone", "coal", "copper-ore")

# 손으로 캔 것을 어느 칸에 내려놓나. 구리광은 전용 칸이 없지만, 유통
# 고리가 창고 칸들을 모두 훑어 구리 화로로 나르므로 어디든 창고면 된다.
PRIME_SHELF = {"stone": "stone", "coal": "coal", "copper-ore": "stone"}


def prime(ai, who, shelf, field):
    """손으로 한 번만 캔다. 매듭을 끊는 데만 쓴다.

    채굴기 한 대에 돌 5가 든다. 창고에 돌이 0이면 돌밭 채굴기도 못
    만들고, 돌밭 채굴기가 없으면 돌도 안 들어온다 - 자기 꼬리를 문
    매듭이라 사람이 한 번 끊어 줘야 열린다.

    사용자의 순서는 「채굴기로 시작한다」이지 「손으로 캔다」가 아니므로,
    이 걸음은 «그 밭에 채굴기가 설 때까지»만 산다.
    """
    x = (field["left"] + field["right"]) // 2
    y = (field["top"] + field["bottom"]) // 2
    submit(ai, who, [
        ("walk_to", {"x": x, "y": y}),
        ("mine", {"name": field["ore"], "x": x, "y": y, "count": 150,
                  "search_radius": 14, "timeout_ticks": 60 * 60 * 5}),
        ("walk_to", {"x": shelf[PRIME_SHELF[field["ore"]]][0] - 2,
                     "y": shelf[PRIME_SHELF[field["ore"]]][1] + 1}),
        ("insert", {"name": field["ore"],
                    "x": shelf[PRIME_SHELF[field["ore"]]][0],
                    "y": shelf[PRIME_SHELF[field["ore"]]][1], "count": 150}),
    ], strict=False)
    PRIMING[field["ore"]] = who
    print(f"{who}: 매듭 끊기 - {field['ore']} 150을 손으로 (채굴기가 설 때까지만)")
    return True


def short_of(st, ore):
    """이 매듭이 아직 안 풀렸나."""
    if ore == "stone":
        return int(st["stone"]) < DRILL_COST["stone"]
    if ore == "coal":
        return int(st["coal"]) < FUEL_EACH
    # 구리는 «판»이 있어야 쓸모가 있다. 광석이든 판이든 하나도 없을 때만.
    return int(st["copper"]) < 20


def priming(ai, ore, names):
    """이 밭의 매듭을 «이미 누가» 끊고 있나."""
    who = PRIMING.get(ore)
    if not who:
        return False
    row = next((w for w in ai.list() if w["name"] == who), None)
    if row and row.get("alive") and (row.get("current") or row.get("queued")):
        return True
    PRIMING.pop(ore, None)
    return False


def pressure(ai, depot):
    """지금 무엇이 모자란가. 늘릴 «이유»가 없으면 늘리지 않는다.

    화로가 굶으면 캐는 쪽이 모자란 것이고, 광석이 쌓이면 녹이는 쪽이
    모자란 것이다. 둘 다 아니면 지금 판은 균형이 맞은 것이다 - 그때
    늘리는 것은 공해만 늘리는 일이다.
    """
    dx, dy = depot
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local hungry = 0
      for _, fu in pairs(s.find_entities_filtered{type = "furnace", force = f}) do
        local inv = fu.get_inventory(defines.inventory.furnace_source)
        if inv and inv.is_empty() then hungry = hungry + 1 end
      end
      local waiting = 0
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f}) do
        local held = c.get_inventory(defines.inventory.chest)
        waiting = waiting + held.get_item_count("iron-ore")
                          + held.get_item_count("copper-ore")
      end
      return { hungry = hungry, waiting = waiting,
               drills = s.count_entities_filtered{
                 type = "mining-drill", force = f},
               smoke = math.floor(s.get_pollution({%d, %d})) }
    end)()""" % (dx, dy))


def smelt_row(ai, agent, want, smelt_xy=None):
    """화로가 몇 대 섰고, 다음 `want` 대를 «어디에» 세울 수 있나.

        사용자: "화로사이에 벨트가 왜있는거임?"

    자리는 더 이상 여기서 계산하지 않는다. 예전에는 `for row = 0, 5` 로
    SY+0,5,10,15,20,25 여섯 줄에 화로를 뿌렸는데, 모드(belts.lua)가 벨트
    줄과 팔 줄로 이미 잡아 둔 자리가 그 사이에 있었다. 화로가 그 위에
    서면 모드는 남은 빈칸으로 길을 이으려 하고, 그래서 화로 사이마다
    아무 데도 안 닿는 벨트 토막이 남았다 - 기준점이 둘이면 줄은 반드시
    흩어진다.

    이제는 `rows.py` 가 하나뿐인 기준점이다. `ai.zones()` 가 아는 제련
    구역에서 `rows.clear_spots()` 로 «화로를 세워도 되는 두 줄»만 받고,
    그 후보 칸 중 광맥 위가 아니고 놓을 수 있는 칸만 게임에 물어 고른다.

    구역을 아직 모르면(초반, 벨트를 하나도 안 깐 때) `smelt_xy` 를
    두 줄짜리 좌표로만 쓴다 - 그때는 모드도 벨트 줄을 계획하지 않았으니
    두 줄만 비우면 충분하다. 둘 다 없으면 `None` 을 돌려준다 - 아직
    「화로를 어디에 세울지」 물을 자리 자체가 없다는 뜻이라, 부르는 쪽은
    이것을 «빈 땅이 없다»와 구별해야 한다.
    """
    zones = ai.zones(agent)
    zone = zones.get("smelt")
    if zone:
        cand = rows.clear_spots(zones)
    elif smelt_xy:
        sx, sy = smelt_xy
        cand = [(sx + col * rows.PITCH, sy + r)
                for r in (rows.ROW_A, rows.ROW_B) for col in range(PER_ROW)]
    else:
        return None
    if not cand:
        return {"n": 0, "spots": [], "drills": 0}

    # 세는 구역도 후보 칸과 같은 상자를 쓴다 - 딴 자리에 선 화로까지
    # 세면 「이미 다 찼다」고 잘못 읽는다.
    xs = [x for x, _ in cand]
    ys = [y for _, y in cand]
    x0, x1 = min(xs) - 3, max(xs) + 3
    y0, y1 = min(ys) - 3, max(ys) + 3
    body = ", ".join("{%d,%d}" % (x, y) for x, y in cand)
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local cand, WANT = { %s }, %d
      local box = {{%d, %d}, {%d, %d}}
      local n = s.count_entities_filtered{area = box, type = "furnace", force = f}
      local taken = {}
      for _, fu in pairs(s.find_entities_filtered{
            area = box, type = "furnace", force = f}) do
        taken[math.floor(fu.position.x) .. "," .. math.floor(fu.position.y)] = true
      end
      local spots = {}
      for _, c in ipairs(cand) do
        if #spots >= WANT then break end
        local x, y = c[1], c[2]
        local key = math.floor(x) .. "," .. math.floor(y)
        if not taken[key] then
          -- 광맥 위에는 놓지 않는다. 건물이 덮은 광맥은 영영 못 캔다.
          local ore = s.count_entities_filtered{
            area = {{x - 1, y - 1}, {x + 1, y + 1}}, type = "resource"}
          if ore == 0 and s.can_place_entity{name = "stone-furnace",
                position = {x, y}, force = f} then
            spots[#spots+1] = string.format("%%d|%%d", x, y)
          end
        end
      end
      return { n = n, spots = spots,
        drills = s.count_entities_filtered{type = "mining-drill", force = f} }
    end)()""" % (body, want, x0, y0, x1, y1))


def widen(ai, who, shelf, smelt, row, st):
    """녹이는 쪽이 캐는 쪽을 못 따라가면 화로를 «더» 세운다.

    캔 것이 상자에 쌓이기만 하면 그 채굴기는 없는 것과 같다. 늘릴 대수는
    사람이 정하지 않는다 - 채굴기 수와 비율이 정한다.
    """
    want = min(MAX_FURNACE, max(1, int(-(-int(row["drills"]) * MELT_RATIO // 1))))
    short = want - int(row["n"])
    if short <= 0:
        return False
    n = min(short, FURNACE_PER_TRIP, int(st["stone"]) // FURNACE_COST["stone"])
    if n <= 0:
        return False

    rows = row.get("spots") or []
    rows = list(rows.values()) if isinstance(rows, dict) else list(rows)
    spots = [tuple(int(v) for v in r.split("|")) for r in rows][:n]
    if not spots:
        print("  화로를 더 세울 «빈 땅»이 없다 - 광맥을 피할 자리가 안 나온다")
        return False
    n = len(spots)

    plan = [("walk_to", {"x": shelf["stone"][0] - 2, "y": shelf["stone"][1] + 1}),
            ("take", {"name": "stone", "x": shelf["stone"][0], "y": shelf["stone"][1],
                      "count": n * FURNACE_COST["stone"] + 5}),
            ("craft", {"recipe": FURNACE, "count": n, "wait": False}),
            ("walk_to", {"x": spots[0][0], "y": spots[0][1] + 2})]
    for x, y in spots:
        plan.append(("build", {"name": FURNACE, "x": x, "y": y}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 화로 {n}대 더 ({row['n']} -> {int(row['n']) + n}, "
          f"채굴기 {row['drills']}대에 필요한 것 {want})")
    return True


def drills_on(ai, field):
    """이 밭에 우리 채굴기가 몇 대 서 있나."""
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      return { n = s.count_entities_filtered{ area = {{%d,%d},{%d,%d}},
        type = "mining-drill", force = game.forces.player } }
    end)()""" % (field["left"] - 2, field["top"] - 2,
                 field["right"] + 2, field["bottom"] + 2))
    return int(reply["n"])


def sow(ai, who, shelf, field, st):
    """새 채굴기를 세우고 «그 자리에서» 출구와 연료까지 준다.

    출구는 다음 순번에 달아 주면 된다고 미루면, 그 사이 채굴기는 한 톨도
    안 캐면서 연료만 태우고 공해를 낸다. 세우는 손이 상자도 놓는다.
    """
    laid = ai.mine_seats(who, field, wanted=PER_TRIP, rich=850, ore=field["ore"])
    seats = laid.get("free") or []
    if not seats:
        return False
    n = len(seats)
    if int(st["plate"]) < n * 17 or int(st["stone"]) < n * 5:
        n = min(n, int(st["plate"]) // 17, int(st["stone"]) // 5)
        seats = seats[:n]
    if not seats:
        return False

    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2, "y": shelf["iron-plate"][1] + 1})]
    plan += shopping(shelf, {
        "iron-plate": n * (DRILL_COST["iron-plate"] + CHEST_COST["iron-plate"]) + 4,
        "stone": n * DRILL_COST["stone"] + 4,
        "coal": n * FUEL_EACH,
    })
    plan += [("craft", {"recipe": DRILL, "count": n, "wait": False}),
             ("craft", {"recipe": CHEST, "count": n, "wait": False}),
             ("walk_to", {"x": seats[0]["x"] + 3, "y": seats[0]["y"]})]
    for seat in seats:
        plan.append(("build", {"name": DRILL, "x": seat["x"], "y": seat["y"],
                               "direction": seat.get("direction")}))
        plan.append(("insert", {"name": "coal", "x": seat["x"], "y": seat["y"],
                                "count": FUEL_EACH}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: {field['ore']} 채굴기 {n}대 "
          f"(창고 판 {st['plate']} 돌 {st['stone']} 석탄 {st['coal']})")
    # 출구는 다음 순번의 tend 가 «게임에 물어» 달아 준다. 여기서 미리
    # 자리를 짐작하면, 자리표가 돌려준 방향과 실제로 선 방향이 어긋난다.
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default="60,-115",
                    help="창고 줄의 첫 칸. 판/돌/석탄 상자가 두 칸 간격으로 선다")
    ap.add_argument("--smelt", default=None,
                    help="화로 줄의 첫 칸. 주면 채굴기에 맞춰 화로도 늘린다. "
                         "모드가 제련 구역을 이미 잡았으면 그쪽이 우선이고, "
                         "이 값은 구역이 아직 없을 때의 대체 좌표일 뿐이다")
    ap.add_argument("--builders", default="alpha,bravo,charlie,delta,golf")
    ap.add_argument("--rounds", type=int, default=2000)
    ap.add_argument("--every", type=float, default=15)
    args = ap.parse_args()

    dx, dy = (int(v) for v in args.depot.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}
    builders = [n.strip() for n in args.builders.split(",") if n.strip()]
    smelt = tuple(int(v) for v in args.smelt.split(",")) if args.smelt else None

    ai = AIBridge()
    FIELD = fields(ai, (dx, dy))
    # 구리도 밭이다. 구리가 없으면 회로도 과학팩도 없고, 발전 사슬이
    # 「짐이 모자란다」에서 영영 안 떠난다 - 18.19회차가 그랬다.
    order = [o for o in ("iron-ore", "coal", "stone", "copper-ore") if o in FIELD]
    print("밭:", ", ".join(f"{k} {v['n']}칸 {v['gap']}칸거리"
                           for k, v in FIELD.items()))
    if not order:
        print("밭이 하나도 없다. 좌표 범위를 의심할 것.")
        return 1

    turn = 0
    for _ in range(args.rounds):
        try:
            free = idle(ai, builders)
            if not free:
                time.sleep(args.every)
                continue
            if int(stock(ai, (dx, dy))["chests"]) < 3:
                print("  창고가 아직 안 섰다 - 발판을 기다린다")
                time.sleep(args.every)
                continue

            # 0. 들고만 있는 것을 창고에 푼다. 손에 있는 석탄은 연료가 아니다.
            st = stock(ai, (dx, dy))
            if int(st["coal"]) < FUEL_EACH or int(st["stone"]) < 10:
                for who in list(free):
                    if unload(ai, who, shelf, st):
                        free.remove(who)
                        break

            # 0.5 녹이는 쪽이 캐는 쪽을 못 따라가면 화로부터 늘린다.
            #     캔 것이 상자에 쌓이기만 하면 그 채굴기는 없는 것과 같다.
            #
            #     자리는 `--smelt` 가 아니라 모드 구역(ai.zones)이 정한다.
            #     `--smelt` 는 구역이 아직 없을 때만 쓰는 대체 좌표다 -
            #     smelt_row() 가 그 우선순위를 알아서 가른다. 구역도
            #     대체 좌표도 없으면 None 이 와서 이 단계를 건너뛴다.
            # 무엇이 모자란지 «먼저» 본다. 모자란 것이 없으면 늘리는 일은
            # 공해만 늘린다 - 그리고 공해는 물결을 부른다.
            push = pressure(ai, (dx, dy))
            smoke = int(push["smoke"])
            hungry = int(push["hungry"])
            waiting = int(push["waiting"])
            standing = int(push["drills"])
            choked = smoke >= POLLUTION_CEIL

            if free and waiting >= ORE_BACKLOG and not choked:
                row = smelt_row(ai, free[0], FURNACE_PER_TRIP, smelt)
                if row and widen(ai, free[0], shelf, smelt, row,
                                  stock(ai, (dx, dy))):
                    free = free[1:]

            # 0.7 캘 것이 없어진 채굴기부터 걷는다. 마른 자리의 채굴기는
            #     연료만 태우고 공해를 내면서 숫자만 채운다.
            if free:
                dead = spent(ai)
                if dead and reclaim(ai, free[0], dead, shelf):
                    free = free[1:]

            # 1. 세워 둔 것부터 돌린다.
            #
            # 앞 단계들이 사람을 다 써 버렸을 수 있다. 일꾼이 한 명이면
            # 늘 그렇다 - 화로를 세우러 보내고 나면 손이 없다. 「할 일이
            # 있나」와 「할 사람이 있나」를 따로 묻지 않으면 그 순번은
            # IndexError 로 통째로 날아간다.
            sick = stalled(ai)
            if sick and free and tend(ai, free[0], shelf, sick):
                free = free[1:]
                if len(sick) > TEND_PER_TRIP and free:
                    tend(ai, free[0], shelf, sick[TEND_PER_TRIP:])
                    free = free[1:]

            # 2. 그 다음에 새로 세운다 - «지킬 수 있을 때만».
            #
            # 다만 지킬 것이 없을 때는 안 따진다. 공해가 아직 옅으면
            # 물결을 부를 일도 없고, 그때 「방어선부터」를 고집하면 첫
            # 채굴기조차 못 세운다.
            if smoke >= GUARD_FROM:
                safe_n, all_n = covered(ai)
                pct = safe_n * 100 // max(1, all_n)
                if pct < SAFE_ENOUGH:
                    if free:
                        print(f"  공해 {smoke} · 덮인 건물 {safe_n}/{all_n} "
                              f"= {pct}% - {SAFE_ENOUGH}% 를 넘기 전에는 "
                              f"안 늘린다")
                    free = []
            if free:
                st = stock(ai, (dx, dy))
                # 돌이 0이면 돌 채굴기를, 석탄이 0이면 석탄 채굴기를 못
                # 켠다. 매듭은 밭마다 «손으로 한 번»만 끊는다.
                for ore in KNOTS:
                    if (free and ore in FIELD
                            and short_of(st, ore)
                            and not priming(ai, ore, builders)
                            and not drills_on(ai, FIELD[ore])):
                        prime(ai, free[0], shelf, FIELD[ore])
                        free = free[1:]
                # 연구소가 아직 없으면 발전 사슬 몫을 남긴다.
                # 연구소가 섰으면 몫이 필요 없고, 채굴기가 아직 콜드스타트
                # 만큼도 안 섰으면 몫보다 «캐는 것»이 먼저다.
                started = standing >= COLD_START
                spare = 0 if (int(st["lab"]) or not started) else SPARK_RESERVE
                usable = int(st["plate"]) - spare
                # 화로가 굶는다고 «캐는 쪽»이 모자란 것은 아니다.
                #
                #   실측: 굶는 화로 8대, 그런데 밭 상자에 쌓인 광석 88677.
                #
                # 캔 것이 산더미인데 화로가 굶는다면 모자란 것은 채굴기가
                # 아니라 «나르는 길»이다. 그때 채굴기를 늘리면 산더미가
                # 커지고 공해가 짙어질 뿐이다 - 그리고 공해는 물결을 부른다.
                short_of_ore = hungry >= HUNGRY_FURNACES and waiting < ORE_BACKLOG
                if (free and usable >= 17 and int(st["coal"]) >= FUEL_EACH
                        and short_of_ore and not choked):
                    # 돌이 마르면 전부 마른다. 돌밭을 먼저 연다.
                    short = int(st["stone"]) < PER_TRIP * DRILL_COST["stone"]
                    ore = "stone" if (short and "stone" in FIELD) else order[turn % len(order)]
                    turn += 1
                    sow(ai, free[0], shelf, dict(FIELD[ore]),
                        dict(st, plate=usable))
                elif not sick:
                    if choked:
                        why = f"공해 {smoke} 가 짙다 - 늘리면 물결이 커진다"
                    elif waiting >= ORE_BACKLOG:
                        why = (f"광석 {waiting}이 밭에 쌓여 있다 - 모자란 것은 "
                               f"채굴기가 아니라 나르는 길이다")
                    elif hungry < HUNGRY_FURNACES:
                        why = (f"굶는 화로 {hungry}대뿐 - 캐는 쪽은 모자라지 "
                               f"않다")
                    else:
                        why = ("발전 사슬 몫을 남긴다"
                               if spare and int(st["plate"]) > 0
                               else "제련이 따라오길 기다린다")
                    print(f"  판 {st['plate']}(쓸 수 있는 몫 {max(0, usable)}) "
                          f"돌 {st['stone']} 석탄 {st['coal']} - {why}")
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
        except Exception as exc:                       # 고리는 «안 죽는다»
            print("  이번 순번 건너뜀:", type(exc).__name__, exc)
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    sys.exit(main())

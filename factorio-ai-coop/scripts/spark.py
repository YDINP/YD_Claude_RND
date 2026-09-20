"""Light the lamp: water -> steam -> lab -> gun turrets.

Three runs in a row ended the same way. 19회차 had eight turrets in the
wrong place, 16회차 had twelve guarding empty ground, and 17회차 had none
at all and lost all eight characters in 169 minutes. The wipe report says
why:

> 방어가 «한 시간 반짜리 사슬»에 매달려 있었다.

`gun-turret` costs ten automation science. Science needs a lab. A lab needs
electricity. Electricity needs water - and on this map the nearest water is
159 tiles south of the base. Nothing in that chain can be skipped, and
until it finishes the base cannot defend itself at all.

**The lab goes to the water, not the power to the base.** Twenty poles
strung across 159 tiles of open ground is a second thing to defend and a
long list of ways to stop halfway. One outpost is one trip.

    python scripts/spark.py --who echo --depot 60,-115

It is a sequence, not a loop: each stage waits for the one before by asking
the game, so it can be re-run after a death or a restart and will pick up
wherever the world actually is.
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

LAB = "lab"
POLE = "small-electric-pole"
SCIENCE = "automation-science-pack"
# 열 기술은 밖에서 받는다. 포탑이 열렸다고 발전 사슬의 일이 끝나는 것이
# 아니다 - 다음은 조립기(automation)고, 그 다음은 벨트(logistics)다.
WANT_TECH = ("gun-turret", "stone-wall")

# 들고 갈 것. 159칸을 되돌아오는 것보다 넉넉히 드는 편이 싸다.
LOAD = {"iron-plate": 200, "copper-plate": 55, "stone": 15, "coal": 80, "wood": 10}
SCIENCE_EACH = 12          # 기술 하나에 10. 두 개면 20, 여유로 24


def researched(ai, techs):
    """이 기술들이 끝났나. 「뭘 열 건가」는 부르는 쪽이 정한다."""
    body = ", ".join('"%s"' % t for t in techs)
    reply = ai.lua("""(function()
      local f = game.forces.player
      local out = {}
      for _, name in ipairs({ %s }) do
        local t = f.technologies[name]
        out[name] = (t and t.researched) and 1 or 0
      end
      return out
    end)()""" % body)
    return reply


def survey(ai):
    """사슬의 어디까지 왔나. 기억이 아니라 게임에 묻는다."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local lab = s.find_entities_filtered{name="lab", force=f, limit=1}[1]
      local powered, science = 0, 0
      if lab then
        if lab.status ~= defines.entity_status.no_power
           and lab.status ~= defines.entity_status.no_power_network then powered = 1 end
        for _, item in pairs(lab.get_inventory(defines.inventory.lab_input).get_contents()) do
          science = science + item.count
        end
      end
      return {
        pump = s.count_entities_filtered{name="offshore-pump", force=f},
        boiler = s.count_entities_filtered{name="boiler", force=f},
        engine = s.count_entities_filtered{name="steam-engine", force=f},
        lab = lab and 1 or 0,
        lab_x = lab and lab.position.x or 0,
        lab_y = lab and lab.position.y or 0,
        powered = powered, science = science,
        pole = s.count_entities_filtered{name="small-electric-pole", force=f},
        eng_x = (function()
          local e = s.find_entities_filtered{name="steam-engine", force=f, limit=1}[1]
          return e and e.position.x or 0 end)(),
        eng_y = (function()
          local e = s.find_entities_filtered{name="steam-engine", force=f, limit=1}[1]
          return e and e.position.y or 0 end)(),
        gun = f.technologies["gun-turret"].researched and 1 or 0,
        wall = f.technologies["stone-wall"].researched and 1 or 0,
        queued = #f.research_queue,
      }
    end)()""")


def depot_has(ai, depot):
    x, y = depot
    return ai.lua("""(function()
      local s = game.surfaces[1]
      local out = {}
      for _, c in pairs(s.find_entities_filtered{area={{%d,%d},{%d,%d}},
                type="container", force=game.forces.player}) do
        for _, item in pairs(c.get_inventory(defines.inventory.chest).get_contents()) do
          out[item.name] = (out[item.name] or 0) + item.count
        end
      end
      return out
    end)()""" % (x - 3, y - 4, x + 3, y + 6))


def busy(ai, who):
    row = next((w for w in ai.list() if w["name"] == who), None)
    if not row or not row.get("alive"):
        return None                                   # 죽었거나 없다
    return bool(row.get("current") or row.get("queued"))


def wait_for(ai, who, what, every=10, limit=600):
    """이 사람이 하던 일을 마칠 때까지. 돌아오지 않으면 None."""
    for _ in range(limit):
        state = busy(ai, who)
        if state is None:
            print(f"  {who} 가 사라졌다 ({what})")
            return False
        if not state:
            return True
        time.sleep(every)
    print(f"  {what}: 너무 오래 걸린다")
    return False


def load_up(ai, who, shelf, depot):
    """창고에서 짐을 싣는다. 모자라면 «모자란 대로» 싣고 간다.

    다 모일 때까지 기다리면 영영 안 떠난다 - 광석은 계속 들어오지만
    구리는 화로 두 대뿐이다. 부족분은 현지에서 한 번 더 채운다.
    """
    have = depot_has(ai, depot)
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1})]
    got = {}
    for item, want in LOAD.items():
        n = min(want, int(have.get(item, 0)))
        if n <= 0:
            continue
        at = shelf["iron-plate"] if item.endswith("-plate") else (
            shelf["coal"] if item == "coal" else shelf["stone"])
        plan.append(("take", {"name": item, "x": at[0], "y": at[1], "count": n}))
        got[item] = n
    if got.get("iron-plate", 0) < 120 or got.get("copper-plate", 0) < 30:
        print(f"  아직 짐이 모자란다: {got}")
        return None
    submit(ai, who, plan, strict=False)
    print(f"{who}: 짐 싣기 {got}")
    return got


def raise_plant(ai, who, spot):
    """물가에 펌프.보일러.기관.연구소를 세운다. 한 걸음에 끝낸다."""
    pump, boiler = spot["pump"], spot["boiler"]
    engines = spot["engines"] or []
    if not engines:
        print("  기관 자리가 안 나온다")
        return False
    eng = engines[0]

    plan = [("craft", {"recipe": "offshore-pump", "count": 1, "wait": False}),
            ("craft", {"recipe": "boiler", "count": 1, "wait": False}),
            ("craft", {"recipe": "steam-engine", "count": len(engines), "wait": False}),
            ("craft", {"recipe": LAB, "count": 1, "wait": False}),
            ("chop", {"x": pump["x"], "y": pump["y"], "count": 12}),
            ("craft", {"recipe": POLE, "count": 6, "wait": False}),
            ("walk_to", {"x": pump["x"], "y": pump["y"] - 4}),
            ("build", {"name": "offshore-pump", "x": pump["x"], "y": pump["y"],
                       "direction": pump.get("direction")}),
            ("build", {"name": "boiler", "x": boiler["x"], "y": boiler["y"],
                       "direction": boiler.get("direction")})]
    for e in engines:
        plan.append(("build", {"name": "steam-engine", "x": e["x"], "y": e["y"],
                               "direction": e.get("direction")}))
    plan += [("insert", {"name": "coal", "x": boiler["x"], "y": boiler["y"],
                         "count": 60}),
             # 연구소는 기관 «옆»에 둔다. 전선 한 칸이 159칸보다 짧다.
             ("build", {"name": LAB, "x": eng["x"], "y": eng["y"] - 6, "snap": True}),
             ("build", {"name": POLE, "x": eng["x"], "y": eng["y"] - 2, "snap": True}),
             ("build", {"name": POLE, "x": eng["x"], "y": eng["y"] - 4, "snap": True})]
    submit(ai, who, plan, strict=False)
    print(f"{who}: 발전소+연구소 세우기 ({pump['x']:.0f},{pump['y']:.0f})")
    return True


# 물가를 틔우는 데 드는 목재. 나무 한 그루가 대략 넷이니 여남은 그루다.
CLEARING = 40
CLEARINGS = 3             # 이만큼 틔워 보고도 안 되면 물가 자체가 틀린 것


def clear_shore(ai, who, wx, wy, want=CLEARING):
    """물가의 나무를 벤다. 「자리가 없다」를 되받는 유일한 방법.

        사용자: "나무가 진로방해 / 건설방해 가 된다면 벌목도 어느정도 하도록"

    설계가 「자리가 없다」고 답했을 때, 그것을 결론으로 받으면 사슬이
    거기서 끝난다. 그런데 실측해 보니 없던 것은 자리가 아니었다:

        기관이 앉을 수 있는 자리   0
        나무 다섯 그루를 치우면    160

    다섯 그루가 발전소 하나를, 그러니까 연구소와 포탑과 방어선 전체를
    막고 서 있었다. 「막혔다」는 결론이 아니라 질문이다 - 무엇이 막았나,
    그것은 치울 수 있는 것인가.

    치울 수 있는 것이었다.
    """
    submit(ai, who, [
        ("walk_to", {"x": wx, "y": wy - 3}),
        ("chop", {"x": wx, "y": wy, "count": want}),
    ], strict=False)
    print(f"{who}: 물가 틔우기 - 나무를 목재 {want}만큼 벤다 ({wx:.0f},{wy:.0f})")
    return True


def wire_up(ai, who, at, eng=None):
    """연구소에 전기가 안 들어오면 전봇대로 «잇는다».

    「세웠다」와 «돌아간다»는 다른 일이다. 전선이 닿았는지는 연구소에게
    물어야 알 수 있다.

    그리고 전봇대는 나무를 먹는다. 20회차 42분에 이 함수가 「전봇대
    보강」을 여섯 번 찍었는데 세상에 전봇대는 한 대도 없었다 - 나무가
    없어 제작이 조용히 실패했기 때문이다. 부하가 없으니 기관은 놀고
    보일러는 증기가 차서 멈췄고, 연구는 한 칸도 안 나갔다.
    그래서 «먼저 벤다».
    """
    plan = [("chop", {"x": at["x"], "y": at["y"], "count": 8}),
            ("craft", {"recipe": POLE, "count": 4, "wait": False})]
    # 기관과 연구소 사이를 이어야 전기가 흐른다. 아무 데나 한 대가
    # 아니라 «둘 사이»에 놓는다.
    if eng:
        steps = 3
        for i in range(1, steps + 1):
            plan.append(("build", {
                "name": POLE,
                "x": eng["x"] + (at["x"] - eng["x"]) * i / (steps + 1),
                "y": eng["y"] + (at["y"] - eng["y"]) * i / (steps + 1),
                "snap": True}))
    else:
        plan.append(("build", {"name": POLE, "x": at["x"] + 2,
                               "y": at["y"] + 2, "snap": True}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 나무를 베어 전봇대로 기관과 연구소를 잇는다")


def feed_science(ai, who, at, count):
    plan = [("craft", {"recipe": SCIENCE, "count": count, "wait": False}),
            ("walk_to", {"x": at["x"], "y": at["y"] + 2}),
            ("insert", {"name": SCIENCE, "x": at["x"], "y": at["y"], "count": count})]
    submit(ai, who, plan, strict=False)
    print(f"{who}: 빨간 과학 {count}개를 연구소에")


def queue_tech(ai, techs=WANT_TECH):
    """연구를 «선행부터» 건다. 그리고 걸렸는지 확인해서 돌려준다.

    여기 있던 것은 `f.add_research(t)` 를 부르고 답을 안 봤다. 2.0 에서
    포탑과 돌벽 앞에는 `automation-science-pack` 이라는 선행 기술이
    붙는데, 그것이 없으면 add_research 는 조용히 false 를 돌려준다.

        gun-turret  add_research=false  pre=[automation-science-pack(MISSING)]
        stone-wall  add_research=false  pre=[automation-science-pack(MISSING)]
        queue len = 0        <- 그런데 화면에는 「연구 대기열: ...」

    그동안 알파는 빨간 과학을 순번마다 연구소에 넣었다. 연구소는 아무
    것도 연구하지 않고 있었다. 부르고 답을 안 보면, 안 된 일이 된 일로
    보고된다 - 조용한 고장은 고칠 수 없다.

    그래서 두 가지를 고친다: 선행을 «먼저» 걸고, 무엇이 걸렸는지
    이름으로 돌려준다.
    """
    reply = ai.lua("""(function()
      local f = game.forces.player
      local seen = {}
      local function want(t)
        if not t or t.researched or seen[t.name] then return end
        seen[t.name] = true
        -- 선행이 먼저다. 대기열은 «넣은 차례»대로 돈다.
        for _, p in pairs(t.prerequisites) do want(p) end
        f.add_research(t)
      end
      for _, name in ipairs({%s}) do want(f.technologies[name]) end
      local queued = {}
      for _, t in pairs(f.research_queue) do queued[#queued+1] = t.name end
      return { queued = queued,
               current = f.current_research and f.current_research.name or "" }
    end)()""" % ", ".join('"%s"' % t for t in techs))
    rows = reply.get("queued")
    rows = list(rows.values()) if isinstance(rows, dict) else (rows or [])
    return rows


def triggers_for(ai, techs=WANT_TECH):
    """대기열에 «넣을 수 없는» 선행이 무엇을 요구하는가.

    2.0 에는 과학팩으로 연구하지 않는 기술이 있다. 연구 비용이 1 인데
    재료 목록이 비어 있고, add_research 는 언제나 false 다 - 대신 무언가를
    «하면» 저절로 열린다.

        automation-science-pack : craft-item  lab x1

    포탑도 돌벽도 그 기술을 선행으로 달고 있으니, 랩을 한 대 만들기
    전에는 방어선 연구가 통째로 시작조차 안 된다. 과학팩을 아무리 부어도
    소용없다 - 연구소는 아무것도 연구하고 있지 않았다.

        묻지 않은 것은 모자라지 않은 것이 된다.

    그래서 «무엇을 해야 열리는가»를 게임에 직접 묻는다. 돌려주는 것은
    만들어야 할 물건 목록이다.
    """
    reply = ai.lua("""(function()
      local f = game.forces.player
      local seen, want = {}, {}
      local function walk(t)
        if not t or t.researched or seen[t.name] then return end
        seen[t.name] = true
        for _, p in pairs(t.prerequisites) do walk(p) end
        local tr = t.prototype and t.prototype.research_trigger
        if tr and tr.type == "craft-item" and tr.item then
          local name = tr.item.name or tr.item
          want[#want+1] = name .. "|" .. tostring(tr.count or 1)
        end
      end
      for _, name in ipairs({%s}) do walk(f.technologies[name]) end
      return { want = want }
    end)()""" % ", ".join('"%s"' % t for t in techs))
    rows = reply.get("want")
    rows = list(rows.values()) if isinstance(rows, dict) else (rows or [])
    out = []
    for row in rows:
        name, count = row.rsplit("|", 1)
        out.append((name, int(count)))
    return out


def pull_trigger(ai, who, shelf, wants):
    """트리거가 요구하는 것을 «만든다». 세우는 것이 아니라 만드는 것이다."""
    plan = [("walk_to", {"x": shelf["iron-plate"][0] - 2,
                         "y": shelf["iron-plate"][1] + 1}),
            ("take", {"name": "iron-plate", "x": shelf["iron-plate"][0],
                      "y": shelf["iron-plate"][1], "count": 80}),
            ("take", {"name": "copper-plate", "x": shelf["iron-plate"][0],
                      "y": shelf["iron-plate"][1], "count": 60})]
    for name, count in wants:
        plan.append(("craft", {"recipe": name, "count": count, "wait": True}))
    submit(ai, who, plan, strict=False)
    print(f"{who}: 연구를 여는 열쇠를 만든다 - "
          + ", ".join(f"{n} x{c}" for n, c in wants))
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", action="append", default=None,
                    help="발전 사슬 당번. 여러 번 줄 수 있다. 앞사람이 죽으면 다음 사람")
    ap.add_argument("--depot", default="60,-115")
    ap.add_argument("--water", default="24.5,44.5")
    ap.add_argument("--engines", type=int, default=2)
    ap.add_argument("--tech", action="append", default=None,
                    help="열 기술. 여러 번 줄 수 있다. 안 주면 포탑.벽")
    args = ap.parse_args()

    dx, dy = (int(float(v)) for v in args.depot.split(","))
    wx, wy = (float(v) for v in args.water.split(","))
    shelf = {"iron-plate": (dx + 0.5, dy + 0.5),
             "stone": (dx + 0.5, dy + 2.5),
             "coal": (dx + 0.5, dy + 4.5)}
    crew = args.who or ["echo"]
    techs = tuple(args.tech) if args.tech else WANT_TECH

    ai = AIBridge()
    cleared = 0
    while True:
        try:
            # 159칸 남쪽은 죽어서 안 돌아오는 걸음이다. 죽은 사람에게 계속
            # 일을 시키면 사슬이 거기서 조용히 멈춘다 - 18회차가 그랬다.
            who = next((n for n in crew if busy(ai, n) is not None), None)
            if not who:
                print("  발전 사슬을 맡을 사람이 없다")
                time.sleep(30)
                continue
            st = survey(ai)
            done = researched(ai, techs)
            if all(int(done.get(t, 0)) for t in techs):
                print(f"{', '.join(techs)} 이(가) 열렸다.")
                return 0

            if busy(ai, who):
                time.sleep(20)
                continue

            # 1. 발전소가 아직 없다 -> 짐 싣고 물가로.
            if not int(st["engine"]):
                if not load_up(ai, who, shelf, (dx, dy)):
                    time.sleep(30)
                    continue
                if not wait_for(ai, who, "짐 싣기"):
                    time.sleep(20)
                    continue
                spot = ai.power_plan(who, wx, wy, radius=45, engines=args.engines)
                if spot.get("error") or not spot.get("pump"):
                    # 「자리가 없다」는 대개 「나무가 있다」였다. 물어보기
                    # 전에 치워 보고, 치워도 안 되면 그때 물가를 의심한다.
                    if cleared < CLEARINGS:
                        cleared += 1
                        clear_shore(ai, who, wx, wy)
                        wait_for(ai, who, "물가 틔우기", every=10, limit=120)
                        continue
                    print("  발전소 자리를 못 찾는다:", spot,
                          f"(물가를 {cleared}번 틔워 보고도)")
                    time.sleep(60)
                    continue
                raise_plant(ai, who, spot)
                wait_for(ai, who, "발전소 세우기", every=15, limit=400)
                continue

            # 2. 연구소가 섰는데 전기가 안 들어온다 -> 전봇대.
            at = {"x": float(st["lab_x"]), "y": float(st["lab_y"])}
            if int(st["lab"]) and not int(st["powered"]):
                wire_up(ai, who, at,
                        {"x": float(st["eng_x"]), "y": float(st["eng_y"])}
                        if int(st["engine"]) else None)
                wait_for(ai, who, "전봇대", every=10, limit=60)
                continue

            # 3. 불이 들어왔다 -> 연구를 걸고 과학을 먹인다.
            if int(st["lab"]) and int(st["powered"]):
                if not int(st["queued"]):
                    got = queue_tech(ai, techs)
                    if got:
                        print("연구 대기열:", " -> ".join(got))
                    else:
                        # 「못 걸었다」는 결론이 아니라 질문이다.
                        wants = triggers_for(ai, techs)
                        if wants:
                            pull_trigger(ai, who, shelf, wants)
                            wait_for(ai, who, "연구 열쇠 만들기",
                                     every=10, limit=180)
                            continue
                        print("  연구를 «못» 걸었다 - 선행 기술을 확인할 것:",
                              ", ".join(techs))
                if int(st["science"]) < 8:
                    feed_science(ai, who, at, SCIENCE_EACH)
                    wait_for(ai, who, "과학 나르기", every=15, limit=200)
                    continue

            print(f"  기다린다 - {dict(st)}")
            time.sleep(30)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc)
            time.sleep(20)
        except Exception as exc:
            print("  건너뜀:", type(exc).__name__, exc)
            time.sleep(20)


if __name__ == "__main__":
    sys.exit(main())

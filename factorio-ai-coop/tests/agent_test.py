"""Unit tests for the agent's pure layers. No Factorio required."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bridge"))

import brain  # noqa: E402
import mission  # noqa: E402
# 각 이름을 «사는 곳»에서 부른다. agent.py 가 전부 다시 내보내주기는 하지만,
# 여기서 그렇게 부르면 무엇이 어디로 갔는지 이 파일이 증언하지 못한다.
from settings import (BURNER_DRILLS, COAL_RIGS, DRILL, FIRST_PACKS,  # noqa: E402
                      FOCUS_ORDER,
                      MAX_FURNACES,
                      STUCK_STRIKES)
from world import Snapshot  # noqa: E402
from jobs import Job, errand_label  # noqa: E402
from layout import (belt_pairs, carry_split, cluster,  # noqa: E402
                    craft_seat, furnace_seat, interleave, nearest_to,
                    spread_sites)
from ladder import (STAGE_TARGET, chain_job, drill_target, furnace_target,  # noqa: E402
                    missing_item, next_goal, plan, worth_building)
from crew import Crew  # noqa: E402

# 반장이 내릴 수 있다고 적어둔 명령은 전부 실제로 처리되는 것이어야 한다.
# 표에만 있고 처리기가 없는 명령은 조용히 무시되고, 왜 안 먹는지 아무도
# 모른다.
KNOWN_INTENTS = {"stop", "autopilot_on", "autopilot_off", "come", "mine",
                 "place", "craft", "automate", "report_inventory",
                 "report_scout", "report_status"}

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (PASSED if ok else FAILED).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{'  ' + detail if detail else ''}")


def kind(message: str) -> str | None:
    intents = parse(message)
    return intents[0][0] if intents else None


def params(message: str) -> dict:
    intents = parse(message)
    return intents[0][1] if intents else {}


def main() -> int:
    print("\n3. the self-directed ladder climbs from hands to a working mine")
    world = dict(x=0.0, y=0.0, resources={
        "stone": {"nearest": {"x": 10, "y": 0}, "nearest_dist": 10, "tiles": 5},
        "coal": {"nearest": {"x": 20, "y": 0}, "nearest_dist": 20, "tiles": 5},
        "iron-ore": {"nearest": {"x": 30, "y": 0}, "nearest_dist": 30, "tiles": 5},
        "copper-ore": {"nearest": {"x": 40, "y": 0}, "nearest_dist": 40, "tiles": 5},
    })
    FURNACE = {"stone-furnace": {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4, "count": 1}}
    PAIRED = {"iron-chest": {"nearest": {"x": 10, "y": 9}, "nearest_dist": 12,
                             "count": 1, "spots": [{"x": 10, "y": 9, "distance": 12}]}}
    WITH_DRILL = {**FURNACE, **PAIRED,
                  "burner-mining-drill": {"nearest": {"x": 9, "y": 9},
                                          "nearest_dist": 12, "count": 1,
                                          "spots": [{"x": 9, "y": 9, "distance": 12}]}}
    CAN_TOOL = {"burner-mining-drill": 1, "iron-chest": 2, "stone-furnace": 1}

    ALL_TECH = {"electronics", "steam-power", "automation-science-pack", "automation"}

    def at(items=None, buildings=None, craftable=None, tech=None, powered=None):
        # Default to "the early technologies are in": the ladder below is about
        # gathering and building, and unresearched tech has its own rungs.
        #
        # 전력은 기관이 서 있느냐가 아니라 흐르느냐다. 기관을 세워둔 세계는
        # 기본적으로 «흐르는» 세계로 치고, 죽은 발전소는 powered=False 로
        # 따로 시험한다.
        standing = "steam-engine" in (buildings or {})
        live = standing if powered is None else powered
        # 전기가 흐르는 세계는 랩도 «도는» 세계로 친다. 서 있는 랩은
        # 26a 에서 따로 시험한다 - 거기가 「손에 든 팩은 연구가 아니다」를
        # 보는 자리다.
        return Snapshot(**world, items=items or {}, buildings=buildings or {},
                        craftable=craftable or {},
                        researched=set(ALL_TECH if tech is None else tech),
                        powered=live,
                        working_labs=1 if live else 0)

    rungs = [
        ("bare hands go for stone", at(), "mine", lambda j: j.steps[0][1]["x"] == 10),
        ("crafts once the game says it can", at({"stone": 5}, None, {"stone-furnace": 1}),
         "craft", None),
        ("then it is placed", at({"stone-furnace": 1}), "build", None),
        ("then fuel", at({}, FURNACE), "mine", lambda j: j.steps[0][1]["x"] == 20),
        ("then iron ore", at({"coal": 10}, FURNACE), "mine",
         lambda j: j.steps[0][1]["x"] == 30),
        ("then smelting", at({"coal": 10, "iron-ore": 20}, FURNACE), "insert",
         lambda j: [s[0] for s in j.steps] == ["insert", "insert", "wait", "take"]),
    ]
    for label, snap, first_step, extra in rungs:
        job = next_goal(snap)
        ok = job is not None and job.steps and job.steps[0][0] == first_step
        if ok and extra:
            ok = extra(job)
        check(label, bool(ok), (job.narration if job else "no job"))

    print("\n3b. it checks the recipe instead of trying and failing")
    # The bug this pins: plates alone do not buy a drill - its recipe needs a
    # stone furnace too. Announcing the build and watching the craft fail, over
    # and over, is what the ladder used to do.
    plates_only = at({"coal": 10, "iron-plate": 20}, FURNACE, {"burner-mining-drill": 0})
    job = next_goal(plates_only, focus="coal")
    check("no drill without the stone for it",
          job is not None and job.routine is None, str(job.routine if job else None))
    check("it goes and gets the stone",
          job is not None and job.steps[0][0] == "mine" and job.steps[0][1]["x"] == 10,
          job.narration if job else "no job")

    affordable = at({"coal": 10, "iron-plate": 20}, FURNACE, CAN_TOOL)
    job = next_goal(affordable, focus="coal")
    check("builds it once affordable",
          job is not None and job.routine == "automate" and job.ore == "coal",
          str(job.routine if job else None))

    in_hand = at({"coal": 10, "iron-plate": 20, "burner-mining-drill": 1},
                 FURNACE, {"iron-chest": 1})
    check("owning one is as good as affording one",
          (next_goal(in_hand, focus="coal") or Job("")).routine == "automate")

    running = at({"coal": 10, "iron-plate": 20}, WITH_DRILL, CAN_TOOL)
    job = next_goal(running, focus="copper-ore")
    check("with one drill up it mechanises its own patch next",
          job is not None and job.key.startswith("automate:copper-ore"),
          str(job.key if job else None))
    # 한 광맥에 한 대씩만 놓으면 화로 스물셋을 드릴 넷이 먹여야 한다.
    many = at({"coal": 10, "iron-plate": 20},
              {**WITH_DRILL, "stone-furnace": {"nearest": {"x": 1, "y": 1},
                                               "nearest_dist": 2, "count": 12}},
              CAN_TOOL)
    plans = [j.key for j in plan(many, focus="copper-ore", crew=6)
             if j.key.startswith("automate:")]
    check("more furnaces means more drills", len(plans) > 1, str(plans))
    check("and each one is its own job", len(set(plans)) == len(plans))

    # Once every patch has a drill and the stockpile is full there is genuinely
    # nothing left on the ladder.
    ALL_DRILLED = {**FURNACE, **PAIRED,
                   "burner-mining-drill": {"nearest": {"x": 9, "y": 9},
                                           "nearest_dist": 12, "count": 4,
                                           "spots": [{"x": 9, "y": 9, "distance": 12}]}}
    # 과학팩 열 개는 이미 만들어둔 세계로 둔다. 안 그러면 아래 시험들이
    # 전부 「첫 열 개부터 만들어라」를 먼저 받는다 - 그건 그것대로 맞는
    # 답이지만(26a 에서 따로 시험한다), 여기서 보려는 것은 «할 일이 없는
    # 세계와 있는 세계의 구분»이다.
    full = {"coal": 99, "iron-plate": 40, "iron-ore": 99, "copper-ore": 99, "stone": 99,
            "lab": 1, "automation-science-pack": FIRST_PACKS}
    # 드릴 4대를 화로 하나가 못 받는다. 광석이 쌓이는 동안 노는 것은
    # «할 일이 없는» 것이 아니다.
    check("four drills on one furnace is not idleness",
          (next_goal(at(full, {**ALL_DRILLED, "lab": {"nearest": {"x": 4, "y": -4},
                                                      "nearest_dist": 6, "count": 1},
                             "steam-engine": {"nearest": {"x": 20, "y": 20},
                                              "nearest_dist": 28, "count": 1}},
                       CAN_TOOL), focus="copper-ore") or Job("")).key.startswith("furnace:"))

    ENOUGH = {"stone-furnace": {"nearest": {"x": 5, "y": 5}, "nearest_dist": 7, "count": 5,
                                "spots": [{"x": 5 + 4 * i, "y": 5, "distance": 7}
                                          for i in range(5)]}}
    # 드릴 5 : 화로 5 가 두 비율의 고정점이다. 드릴이 모자라면 «채굴기를 더
    # 놓을 수 있는» 세계고, 드릴이 넘치면 «화로를 더 지어야 하는» 세계다.
    # 둘 다 «할 일이 없는» 세계가 아니다.
    #
    # 예전에는 5 : 4 였다. 버너 드릴 0.25/s 가 돌 화로 0.3125/s 를 못 채우니
    # 화로 넷이면 된다고 봤는데, 그건 상자를 사이에 둘 때의 비율이다. 우리는
    # 드릴을 화로에 «직결»하고, 직결이면 드릴 하나가 화로 하나를 먹인다.
    # 화로를 덜 두면 남는 광석이 갈 데가 없어 드릴이 선다 - 실제로 101대가
    # 그렇게 서 있었다.
    PLENTY = {**ALL_DRILLED, "burner-mining-drill": {
        **ALL_DRILLED["burner-mining-drill"], "count": 5}}
    settled = {**PLENTY, **ENOUGH,
               "lab": {"nearest": {"x": 4, "y": -4}, "nearest_dist": 6, "count": 1},
               "steam-engine": {"nearest": {"x": 20, "y": 20}, "nearest_dist": 28, "count": 1}}
    # 비율이 맞아떨어진 5:5 는 «다 됐다»가 아니라 «다음 걸음»이다.
    #
    # 예전에는 여기서 할 일이 없다고 봤다. 그런데 그것이 교착이었다 -
    # 채굴기 목표는 화로 수이고 화로 목표는 채굴기 수라, 비율이 맞는
    # 순간 둘 다 영원히 안 늘어난다. 실측(37분째) 채굴기 5, 화로 6에서
    # 공장이 얼어붙어 있었다.
    check("a balanced five-on-five is a next step, not a finish line",
          next_goal(at(full, settled, CAN_TOOL), focus="copper-ore") is not None)

    # 정말로 할 일이 없는 세계는 «상한에 닿은» 세계다. 버너 한계까지
    # 채우고 화로도 그만큼이면 그때 멈춘다.
    capped = {**settled,
              "burner-mining-drill": {**PLENTY["burner-mining-drill"],
                                      "count": BURNER_DRILLS},
              "stone-furnace": {**ENOUGH["stone-furnace"],
                                "count": MAX_FURNACES}}
    check("but the burner cap really is a finish line",
          next_goal(at(full, capped, CAN_TOOL), focus="copper-ore") is None,
          str(next_goal(at(full, capped, CAN_TOOL), focus="copper-ore")))

    print("\n3i. a standing engine is not power")
    dead = at(full, settled, CAN_TOOL, powered=False)
    check("a dead power plant does not count as power",
          (next_goal(dead, focus="copper-ore") or Job("")).routine == "power",
          str((next_goal(dead, focus="copper-ore") or Job("")).key))
    check("a running one does not ask for power again",
          all(j.routine != "power" for j in plan(at(full, settled, CAN_TOOL))))

    print("\n3h. a drill with no chest is fixed before a new one is built")
    stranded = at({"coal": 10, "iron-plate": 20},
                  {**FURNACE, "burner-mining-drill": {
                      "nearest": {"x": 9, "y": 9}, "nearest_dist": 12, "count": 1,
                      "spots": [{"x": 9, "y": 9, "distance": 12}]}},
                  CAN_TOOL)
    job = next_goal(stranded, focus="copper-ore")
    check("the stalled drill comes first",
          job is not None and job.routine == "rescue",
          str(job.key if job else None))
    check("and it knows which drill", job.at == {"x": 9, "y": 9}, str(job.at))
    check("a drill with a chest is left alone",
          all(j.routine != "rescue" for j in plan(running, focus="copper-ore")))

    print("\n3g. with nothing else to do it climbs the tech tree")
    # "할 일이 없다"는 예전엔 광석만 쌓는다는 뜻이었다. 이제는 연구를 연다.
    early = at({"coal": 99, "iron-plate": 40, "iron-ore": 99, "copper-ore": 99,
                "stone": 99}, ALL_DRILLED, CAN_TOOL, tech=set())
    job = next_goal(early, focus="copper-ore")
    check("smelts for the first technology",
          job is not None and job.key == "smelt:copper-plate",
          str(job.key if job else None))

    after_copper = at({"coal": 99, "iron-ore": 99, "iron-plate": 20}, ALL_DRILLED, CAN_TOOL,
                      tech={"electronics"})
    job = next_goal(after_copper)
    check("then for the second", job is not None and job.key == "smelt:iron-plate",
          str(job.key if job else None))

    both = at({"coal": 99, "iron-plate": 20}, ALL_DRILLED, {**CAN_TOOL, "lab": 1},
              tech={"electronics", "steam-power"})
    job = next_goal(both)
    check("then builds a lab", job is not None and job.key == "craft:lab",
          str(job.key if job else None))

    lab_up = at({"coal": 99, "iron-plate": 20}, {**ALL_DRILLED,
                               "lab": {"nearest": {"x": 4, "y": -4}, "nearest_dist": 6,
                                       "count": 1}},
                CAN_TOOL, tech={"electronics", "steam-power"})
    job = next_goal(lab_up)
    check("then goes for power", job is not None and job.routine == "power",
          str(job.key if job else None))

    print("\n3c. work that just failed is not proposed again")
    # One unreachable furnace used to fill the chat with the same line forever.
    stuck = at({"coal": 10, "iron-ore": 20}, FURNACE, CAN_TOOL)
    check("smelting is the plan while it works",
          (next_goal(stuck) or Job("")).steps[0][0] == "insert")
    after_failure = next_goal(stuck, blocked=frozenset({"insert"}))
    still_smelting = bool(after_failure and after_failure.steps
                          and after_failure.steps[0][0] == "insert")
    check("after it fails the agent moves on", not still_smelting,
          after_failure.narration if after_failure else "nothing left to try")

    blocked_automate = next_goal(affordable, focus="coal", blocked=frozenset({"automate"}))
    check("a failed build-out is not retried",
          blocked_automate is None or blocked_automate.routine != "automate",
          str(blocked_automate.narration if blocked_automate else None))

    print("\n3d. the crew divides the work instead of duplicating it")
    # The complaint this pins: three agents all walking to the same rock.
    busy = at({}, None, {})
    first = next_goal(busy, focus="iron-ore")
    check("the first agent takes the top job", first is not None and first.key == "furnace",
          str(first.key if first else None))

    second = next_goal(busy, focus="coal", taken=frozenset({first.key}))
    check("the second takes a different one",
          second is not None and second.key != first.key,
          f"{first.key} vs {second.key if second else None}")

    third = next_goal(busy, focus="copper-ore",
                      taken=frozenset({first.key, second.key}))
    check("and so does the third",
          third is not None and third.key not in {first.key, second.key},
          str(third.key if third else None))

    keys = [j.key for j in plan(busy)]
    check("job keys are unique", len(keys) == len(set(keys)), str(keys))

    # One furnace, one cook. Two agents stuffing the same furnace and both
    # waiting on its output is not teamwork.
    smelting = at({"coal": 10, "iron-ore": 20}, FURNACE, CAN_TOOL)
    cook = next_goal(smelting)
    check("smelting is keyed to the furnace", cook is not None and cook.key.startswith("smelt:"),
          str(cook.key if cook else None))
    other = next_goal(smelting, focus="coal", taken=frozenset({cook.key}))
    check("the second cook does something else",
          other is None or not other.key.startswith("smelt:"),
          str(other.key if other else None))

    # Drills go on different patches, not four onto one.
    tooled = at({"coal": 10, "iron-plate": 40}, FURNACE, CAN_TOOL)
    automations = [j.key for j in plan(tooled) if j.routine == "automate"]
    check("one automation offered per ore",
          len(automations) == len(set(automations)) and len(automations) > 1,
          str(automations))

    print("\n3e. hands only dig what no drill can")

    # 사용자: "채굴기건설후 / 채굴기를 만들 수 있는조건이면 직접 광질하지
    # 않도록 해줘." 기계가 할 수 있는 일을 손으로 하지 않는다.
    tooled_up = at({"coal": 10, "iron-plate": 40, "iron-ore": 99},
                   WITH_DRILL, CAN_TOOL)
    check("no hand-mining once a drill stands",
          not [j.key for j in plan(tooled_up, focus="copper-ore")
               if j.key.startswith("stock:")])

    # 개국 직후에는 손이 유일한 시작점이다. 그 문은 닫지 않는다.
    bare = at({"coal": 10, "iron-plate": 40, "iron-ore": 99})
    stock_first = [j.key for j in plan(bare, focus="copper-ore")
                   if j.key.startswith("stock:")]
    check("bare hands still dig when nothing else can",
          bool(stock_first), str(stock_first[:2]))
    check("and its own ore is offered first",
          stock_first and stock_first[0] == "stock:copper-ore", str(stock_first[:2]))

    print("\n3f. each agent works a different resource")
    focuses = [FOCUS_ORDER[i % len(FOCUS_ORDER)] for i in range(4)]
    check("four agents, four resources", len(set(focuses)) == 4, str(focuses))
    check("a fifth wraps around", FOCUS_ORDER[4 % len(FOCUS_ORDER)] == FOCUS_ORDER[0])

    print("\n4. planning is pure")
    twice = at({"coal": 10, "iron-ore": 20}, FURNACE, CAN_TOOL)
    check("same snapshot, same plan", next_goal(twice) == next_goal(twice))

    print("\n5. LLM output is treated as untrusted")
    check("plain json", brain._extract_json('{"say":"hi","steps":[]}') == {"say": "hi", "steps": []})
    check("fenced json", brain._extract_json('```json\n{"say":"hi"}\n```') == {"say": "hi"})
    check("json with trailing prose",
          brain._extract_json('{"say":"hi"}\n설명입니다') == {"say": "hi"})
    check("garbage", brain._extract_json("전혀 json이 아님") is None)

    check("invented task type is dropped",
          brain._clean_steps([{"type": "nuke_the_map", "params": {}}]) == [])
    check("missing required args dropped",
          brain._clean_steps([{"type": "build", "params": {"x": 1, "y": 2}}]) == [])
    check("absurd coordinates dropped",
          brain._clean_steps([{"type": "walk_to", "params": {"x": 1e9, "y": 0}}]) == [])
    check("counts are clamped",
          brain._clean_steps([{"type": "mine", "params": {"x": 1, "y": 2, "count": 99999}}])
          [0][1]["count"] == brain.MAX_COUNT)
    check("step list is capped",
          len(brain._clean_steps([{"type": "wait", "params": {"ticks": 10}}] * 50))
          == brain.MAX_STEPS)
    check("valid step survives",
          brain._clean_steps([{"type": "mine", "params": {"x": 5, "y": -3, "count": 7}}])
          == [("mine", {"x": 5.0, "y": -3.0, "count": 7})])
    check("non-list steps", brain._clean_steps("drop everything") == [])


    print("\n6. the mission ladder")
    FURNACE_ONLY = {"stone-furnace": {"nearest": {"x": 1, "y": 1},
                                      "nearest_dist": 2, "count": 1}}

    def world_at(items=None, buildings=None, tech=None):
        return Snapshot(tick=0, x=0.0, y=0.0, items=items or {},
                        craftable={}, buildings=buildings or {}, resources={},
                        researched=set(tech or ()))

    check("nothing done yet -> first rung",
          mission.stage_of(world_at()).key == "furnace")
    check("a furnace moves the crew up",
          mission.stage_of(world_at(buildings=FURNACE_ONLY)).key == "electronics")
    check("trigger tech is a rung of its own",
          mission.stage_of(world_at(buildings=FURNACE_ONLY,
                                    tech={"electronics"})).key == "steam-power")
    done, total = mission.progress(world_at(buildings=FURNACE_ONLY))
    check("progress counts rungs, not guesses", (done, total) == (1, len(mission.LADDER)),
          f"{done}/{total}")
    check("the goal is stated", mission.GOAL in mission.briefing(world_at()))
    check("ladder ends at the rocket", mission.LADDER[-1].key == "rocket")
    check("rungs the crew cannot climb are marked",
          not mission.LADDER[-1].automated and mission.LADDER[0].automated)

    print("\n7. what the game said was missing")
    for kind_, error, par, expected in [
        ("insert", "no coal to insert", None, "coal"),
        ("build", "no iron-chest in inventory", None, "iron-chest"),
        ("give", "nothing to give: no stone", None, "stone"),
        ("mine", "no resource near 30,0", {"name": "iron-ore"}, "iron-ore"),
        ("mine", "no resource near 30,0", None, None),
        ("walk_to", "stuck at 1.0,2.0 after 5 routes", None, None),
        ("craft", "no such recipe: banana", None, None),
    ]:
        got = missing_item(kind_, error, par)
        check(f"{kind_}: {error[:28]}", got == expected, f"-> {got}")

    print("\n8. shortfall picks one thing")
    check("the biggest gap first",
          mission.shortfall({"coal": 5, "iron-ore": 25}, {"coal": 1}) == ("iron-ore", 25))
    check("nothing missing", mission.shortfall({"coal": 5}, {"coal": 9}) is None)
    check("empty needs", mission.shortfall({}, {}) is None)

    print("\n9. the request board")
    board = mission.Board()
    first = board.post("alpha", "coal", 25, "제련하려면", now=0.0)
    check("a request goes up", first is not None and first.open)
    check("the same ask twice is one request",
          board.post("alpha", "coal", 25, "또", now=1.0) is None
          and len(board.requests) == 1)
    check("a different item is a different request",
          board.post("alpha", "stone", 5, "화로", now=1.0) is not None)

    check("whoever has it is offered the job",
          board.offer("bravo", {"coal": 40}).item == "coal")
    check("empty-handed gets nothing to deliver",
          board.offer("bravo", {"coal": 2}) is None)
    check("not enough is not enough",
          board.offer("bravo", {"coal": 24}) is None)
    check("nobody serves their own request",
          board.offer("alpha", {"coal": 99, "stone": 99}) is None)

    taken = board.offer("bravo", {"coal": 40})
    board.take(taken, "bravo", now=2.0)
    check("a claimed request is off the board", board.offer("charlie", {"coal": 99}) is None)
    check("the asker can see what it waits for",
          [r.item for r in board.waiting_for("alpha")] == ["coal", "stone"])

    board.fill(taken)
    check("a delivered request is gone",
          [r.item for r in board.waiting_for("alpha")] == ["stone"])

    errands = mission.Board()
    errands.post("delta", "copper-ore", 25, "연구", now=10.0)
    errands.post("echo", "stone", 5, "화로", now=11.0)
    check("an errand is offered to the idle even empty-handed",
          errands.errand("foxtrot").item == "copper-ore")
    check("the oldest ask is served first",
          errands.errand("delta").item == "stone")

    board.take(board.errand("echo"), "echo", now=10.0)
    board.expire(now=10.0 + mission.CLAIM_TTL + 1)
    check("a courier that never arrives lets go",
          all(r.helper is None for r in board.requests))
    board.expire(now=10.0 + mission.CLAIM_TTL + mission.REQUEST_TTL + 2)
    check("a request nobody takes comes down", board.requests == [])

    board2 = mission.Board()
    board2.post("alpha", "coal", 5, "x", now=0.0)
    board2.take(board2.requests[0], "bravo", now=0.0)
    board2.release("bravo")
    check("a fired courier releases what it held", board2.requests[0].open)


    print("\n10. the crew does not queue at one furnace")

    def furnaces(*positions):
        return {"stone-furnace": {
            "count": len(positions),
            "nearest": {"x": positions[0][0], "y": positions[0][1]},
            "nearest_dist": 3,
            "spots": [{"x": x, "y": y, "distance": 3} for x, y in positions]}}

    def stocked(buildings):
        return Snapshot(tick=0, x=0.0, y=0.0,
                        items={"coal": 30, "iron-ore": 40},
                        craftable={}, buildings=buildings,
                        resources={"stone": {"nearest": {"x": 10, "y": 0},
                                             "nearest_dist": 10, "tiles": 50}},
                        researched={"electronics", "steam-power",
                                    "automation-science-pack", "automation"})

    two = stocked(furnaces((5, 5), (8, 5)))
    smelts = [j.key for j in plan(two, crew=2) if j.key.startswith("smelt:")]
    check("one smelting job per furnace", len(smelts) == 2, str(smelts))
    check("and they are different jobs", len(set(smelts)) == 2)

    first = next_goal(two, crew=2)
    second = next_goal(two, "coal", taken=frozenset({first.key}), crew=2)
    check("two agents get two furnaces",
          first.key != second.key and second.key.startswith("smelt:"),
          f"{first.key} / {second.key}")

    one = stocked(furnaces((5, 5)))

    # 돌이 손에 있어야 화로를 더 놓을 수 있다. 없으면 계획은 돌부터 캐라고
    # 말하지, 못 만들 화로를 약속하지 않는다.
    with_stone = Snapshot(**{**vars(one), "items": {**one.items, "stone-furnace": 2}})
    keys = [j.key for j in plan(with_stone, crew=4)]
    check("a lone furnace for four means building more",
          any(k.startswith("furnace:") for k in keys), str(keys[:4]))
    check("a lone furnace for one is enough",
          not any(j.key.startswith("furnace:") for j in plan(with_stone, crew=1)))
    check("no stone, no promises",
          not any(j.key.startswith("furnace:") for j in plan(one, crew=4)))

    # spots 가 8개에서 잘려도, 오래된 모드가 spots 를 아예 안 줘도, 이미
    # 세운 화로를 다시 세우면 안 된다.
    blind = Snapshot(**{**vars(with_stone), "buildings": {
        "stone-furnace": {"count": 4, "nearest": {"x": 5, "y": 5}, "nearest_dist": 3}}})
    check("count is what says how many are standing",
          not any(j.key.startswith("furnace:") for j in plan(blind, crew=4)),
          str([j.key for j in plan(blind, crew=4)][:3]))

    check("older observations still work",
          stocked({"stone-furnace": {"count": 1, "nearest": {"x": 2, "y": 2},
                                     "nearest_dist": 3}}).spots("stone-furnace")
          == [{"x": 2, "y": 2}])
    check("nothing built, nothing to pick", one.spots("lab") == [])

    print("\n11. the crew chief's output is untrusted too")
    roster = {"alpha", "bravo"}
    check("an invented command is dropped",
          brain._clean_commands([{"name": "delete_the_save"}], roster) == [])
    check("a real command survives",
          brain._clean_commands([{"name": "save"}], roster) == [{"name": "save"}])
    check("an agent who does not exist is forgotten, the command is not",
          brain._clean_commands([{"name": "come", "agent": "zulu"}], roster)
          == [{"name": "come"}])
    check("a real agent is kept",
          brain._clean_commands([{"name": "come", "agent": "alpha"}], roster)
          == [{"name": "come", "agent": "alpha"}])
    check("counts are clamped",
          brain._clean_commands([{"name": "add_agent", "count": 99999}], roster)
          [0]["count"] == brain.MAX_COUNT)
    check("nonsense count is ignored, not fatal",
          brain._clean_commands([{"name": "add_agent", "count": "many"}], roster)
          == [{"name": "add_agent"}])
    check("the list is capped",
          len(brain._clean_commands([{"name": "save"}] * 50, roster))
          == brain.MAX_COMMANDS)
    check("not a list at all", brain._clean_commands("stop everything", roster) == [])
    check("every command is one the crew can actually run",
          brain.ALLOWED_COMMANDS <= (Crew.CREW_COMMANDS | KNOWN_INTENTS),
          str(brain.ALLOWED_COMMANDS - (Crew.CREW_COMMANDS | KNOWN_INTENTS)))


    print("\n13. the game is asked what to do next, and answers a chain")
    FURNACE_AT = {"x": 5, "y": 5}

    # 랩을 만들려면 구리판이 필요하고, 구리판은 화로에서 나온다. mod 가
    # 돌려주는 모양 그대로.
    smelt_first = {"item": "lab", "count": 1, "ready": False,
                   "steps": [{"action": "smelt", "name": "copper-plate",
                              "recipe": "copper-plate", "count": 15,
                              "input": "copper-ore", "input_count": 15,
                              "seconds": 48.0,
                              "hand": False, "category": "smelting"}],
                   "mine": {}, "locked": {}, "blocked": {}}
    job = chain_job(smelt_first, "lab", FURNACE_AT)
    check("smelting is a load, not a vigil",
          job is not None and [st[0] for st in job.steps] == ["insert", "insert"],
          str(job.steps if job else None))
    check("it feeds the ore, not the plate",
          job.steps[1][1]["name"] == "copper-ore", str(job.steps[1][1]))
    # 예전에는 여기에 wait 와 take 가 붙어 있었고, 여섯 중 다섯이 각자
    # 화로 앞에 서서 1분씩 아무것도 안 했다.
    check("nobody stands and waits",
          all(st[0] != "wait" for st in job.steps), str(job.steps))
    check("the furnace is in the key, so two agents use two furnaces",
          job.key == "chain:smelt:copper-plate@5,5", job.key)

    check("no furnace, no smelting job", chain_job(smelt_first, "lab", None) is None)

    # 돌 2개가 벽돌 1개가 된다. 개수를 산출물에서 짐작하면 절반만 넣는다.
    bricks = {"item": "x", "count": 1, "ready": False,
              "steps": [{"action": "smelt", "name": "stone-brick",
                         "recipe": "stone-brick", "count": 10,
                         "input": "stone", "input_count": 20,
                         "hand": False, "category": "smelting"}],
              "mine": {}, "locked": {}, "blocked": {}}
    brick_job = chain_job(bricks, "x", FURNACE_AT)
    check("the game says how much ore goes in, we do not guess",
          brick_job.steps[1][1] == {"name": "stone", "count": 20, "x": 5, "y": 5},
          str(brick_job.steps[1][1]))

    check("what the chain names is what we bother collecting",
          Crew.chain_wants(smelt_first) == {"copper-plate", "copper-ore"},
          str(Crew.chain_wants(smelt_first)))
    check("ores it still has to dig for count too",
          "iron-ore" in Crew.chain_wants({"steps": [], "mine": {"iron-ore": 25}}))

    hand = {"item": "lab", "count": 1, "ready": False,
            "steps": [{"action": "craft", "name": "electronic-circuit",
                       "recipe": "electronic-circuit", "count": 10,
                       "hand": True, "category": "crafting"}],
            "mine": {}, "locked": {}, "blocked": {}}
    job = chain_job(hand, "lab", FURNACE_AT)
    check("hand crafting comes back as a craft job",
          job is not None and job.steps[0][0] == "craft"
          and job.steps[0][1]["recipe"] == "electronic-circuit",
          str(job.steps[0] if job else None))

    not_by_hand = {"item": "x", "count": 1, "ready": False,
                   "steps": [{"action": "craft", "name": "sulfur", "recipe": "sulfur",
                              "count": 1, "hand": False,
                              "category": "chemistry"}],
                   "mine": {}, "locked": {}, "blocked": {}}
    check("what hands cannot make is not offered",
          chain_job(not_by_hand, "x", FURNACE_AT) is None)

    check("an error answer is not a plan",
          chain_job({"error": "no such item: banana"}, "banana", FURNACE_AT) is None)
    check("garbage is not a plan", chain_job("nope", "lab", FURNACE_AT) is None)
    check("lua's empty table is not a step list",
          chain_job({"steps": {}, "mine": {}}, "lab", FURNACE_AT) is None)

    check("every rung the crew can climb has something to aim at",
          all(stage.key in STAGE_TARGET
              for stage in mission.LADDER
              if stage.automated and stage.key not in
              ("electronics", "steam-power", "automation")),
          str([st.key for st in mission.LADDER
               if st.automated and st.key not in STAGE_TARGET]))

    print("\n14. work in one area is done in one trip")
    here = [{"x": 0, "y": 0}, {"x": 3, "y": 2}, {"x": -4, "y": 1}]
    far = [{"x": 80, "y": 80}, {"x": 82, "y": 79}]
    groups = cluster(here + far)
    check("two areas, two trips", len(groups) == 2, str([len(g) for g in groups]))
    check("everything is carried along",
          sum(len(g) for g in groups) == 5)
    check("the near ones travel together", len(groups[0]) == 3, str(groups[0]))

    # 사슬처럼 이어 붙이면 묶음이 지도 반대편까지 번진다. 거리는 언제나
    # 씨앗 기준으로 잰다.
    chain = [{"x": i * 10, "y": 0} for i in range(6)]
    spread = cluster(chain, reach=12)
    check("a chain does not swallow the map",
          all(max(abs(p["x"] - g[0]["x"]) for p in g) <= 12 for g in spread),
          str([[p["x"] for p in g] for g in spread]))

    check("a trip is capped so one agent is not stuck forever",
          all(len(g) <= 3 for g in cluster(
              [{"x": i, "y": 0} for i in range(10)], reach=50, cap=3)))
    check("nothing to do, nothing to group", cluster([]) == [])
    check("one machine is still a trip", len(cluster([{"x": 5, "y": 5}])) == 1)

    print("\n15. one kind of work cannot crowd out the rest")
    many = ["fuel%d" % i for i in range(25)]
    check("every kind gets a turn near the front",
          interleave([many, ["unload"], ["gather"], []])[:4]
          == ["fuel0", "unload", "gather", "fuel1"],
          str(interleave([many, ["unload"], ["gather"], []])[:4]))
    check("nothing is lost",
          len(interleave([many, ["unload"], ["gather"]])) == 27)
    check("order inside a kind is kept",
          [j for j in interleave([many, ["x"]]) if j.startswith("fuel")] == many)
    check("empty lists are harmless", interleave([[], [], []]) == [])
    check("a single kind passes through", interleave([["a", "b"]]) == ["a", "b"])

    print("\n16. the crew chief says what it handed to whom")
    label = errand_label
    check("task names become words",
          label([("mine", {"name": "coal", "count": 20})]) == "coal 채굴")
    check("the same thing twice is counted, not repeated",
          label([("place", {"name": "stone-furnace"})] * 3)
          == "stone-furnace 건설 x3",
          label([("place", {"name": "stone-furnace"})] * 3))
    check("a long errand is cut short",
          label([("mine", {"name": o}) for o in "abcde"]).endswith("…"))
    check("a step with nothing to name still reads",
          label([("walk", {"x": 1, "y": 2})]) == "이동")
    check("an unknown task keeps its own name",
          label([("teleport", {})]) == "teleport")

    print("\n17. a drill is only as good as the four tiles under it")
    rich = [{"x": 0, "y": 0, "richness": 1600},
            {"x": 1, "y": 0, "richness": 1500},   # 첫 자리와 겹친다
            {"x": 2, "y": 0, "richness": 1400},
            {"x": 2, "y": 1, "richness": 1300},   # 셋째와 겹친다
            {"x": 4, "y": 0, "richness": 1200}]
    check("overlapping sites are dropped",
          [p["x"] for p in spread_sites(rich, 4)] == [0, 2, 4],
          str([p["x"] for p in spread_sites(rich, 4)]))
    check("it stops at what was asked for",
          len(spread_sites(rich, 1)) == 1)
    check("nowhere to build is not a crash", spread_sites([], 4) == [])
    check("order is kept, so the richest is built first",
          spread_sites(rich, 4)[0]["richness"] == 1600)
    check("a wider machine needs a wider gap",
          [p["x"] for p in spread_sites(rich, 4, gap=3)] == [0, 4],
          str([p["x"] for p in spread_sites(rich, 4, gap=3)]))

    print("\n18. the chief can say: take that away")
    cleaned = brain._clean_steps([
        {"type": "demolish", "params": {"x": -5, "y": -6}},
        {"type": "chop", "params": {"x": 10, "y": 3, "count": 8}},
        {"type": "give", "params": {"to": "bravo", "name": "coal", "count": 20}},
    ])
    check("clearing wreckage survives the filter",
          [kind for kind, _ in cleaned] == ["demolish", "chop", "give"],
          str([kind for kind, _ in cleaned]))
    check("the crewmate's name is carried through",
          cleaned[2][1].get("to") == "bravo")
    check("a demolish without a place is dropped",
          brain._clean_steps([{"type": "demolish", "params": {}}]) == [])
    check("invented task types are still refused",
          brain._clean_steps([{"type": "teleport", "params": {"x": 0, "y": 0}}]) == [])
    check("every task the prompt offers is a task the filter allows",
          {"demolish", "chop", "give"} <= brain.ALLOWED_TASKS)

    print("\n19. build another, or fix the ones standing?")
    measured = {"built": 194, "working": 24,
                "why": {"waiting_for_space_in_destination": 101, "no_fuel": 57}}
    ok, why = worth_building(measured)
    check("194 built and 24 running means stop building", not ok)
    check("and it says which reason dominates",
          "waiting_for_space_in_destination 101" in why, why)
    check("early on, a stopped machine is just early",
          worth_building({"built": 3, "working": 1, "why": {"no_fuel": 2}})[0])
    check("half running is healthy enough to grow",
          worth_building({"built": 10, "working": 5, "why": {"no_fuel": 5}})[0])
    check("just under half is not",
          not worth_building({"built": 10, "working": 4, "why": {"no_fuel": 6}})[0])
    check("nothing built yet is never a reason to stop",
          worth_building({})[0])

    print("\n20. what is already mined is not mined again")
    stocked = chain_job({"fetch": [{"name": "iron-plate", "count": 40,
                                    "x": 12, "y": -3}],
                         "steps": [{"name": "iron-plate", "action": "smelt",
                                    "count": 40}],
                         "mine": {"iron-ore": 40}},
                        "automation-science-pack", {"x": 0, "y": 0})
    check("the chest comes before the ore patch",
          stocked is not None and stocked.key.startswith("fetch:"),
          stocked.key if stocked else "None")
    check("and it walks to the chest, not the patch",
          stocked.at == {"x": 12, "y": -3})
    check("it takes what the plan said to take",
          stocked.steps[0] == ("take", {"name": "iron-plate", "count": 40,
                                        "x": 12, "y": -3}))
    empty_shelf = chain_job({"fetch": [], "steps": [], "mine": {"iron-ore": 40}},
                            "iron-plate", None)
    check("an empty chest still sends them to the patch",
          empty_shelf is None or not empty_shelf.key.startswith("fetch:"))

    print("\n21. the nearest chest is nearest to the work, not to me")
    shelves = [{"x": 92, "y": 6, "count": 900},
               {"x": -55, "y": 80, "count": 300},
               {"x": -50, "y": 84, "count": 20}]
    rigs = {"x": -51, "y": 85}
    check("it loads from the chest beside the job",
          nearest_to(shelves, rigs, 50) == shelves[1],
          str(nearest_to(shelves, rigs, 50)))
    check("a chest too small to help is skipped",
          nearest_to(shelves, rigs, 200) == shelves[1])
    # 여덟이 같은 상자를 노린다. 딱 맞는 양만 든 상자는 도착할 때쯤 비어 있다.
    thin = [{"x": -50, "y": 84, "count": 55}, {"x": -56, "y": 80, "count": 900}]
    check("a fat chest a little further beats a thin one next door",
          nearest_to(thin, rigs, 50) == thin[1],
          str(nearest_to(thin, rigs, 50)))
    check("but a thin one is still better than nothing",
          nearest_to([thin[0]], rigs, 50) == thin[0])
    check("a two-hundred-tile haul is nobody's job",
          nearest_to([shelves[0]], rigs, 50) is None)
    check("standing next to it, the near one wins",
          nearest_to(shelves, {"x": 92, "y": 6}, 50) == shelves[0])
    check("no chest at all is not a crash",
          nearest_to([], rigs, 50) is None)

    print("\n22. a trapped crewmate is read from where, not where to")
    where = Crew.where_lost
    check("the first coordinate is the one that traps you",
          where("no path from 92.2,6.1 to -54,-66") == (92, 6),
          str(where("no path from 92.2,6.1 to -54,-66")))
    check("a different destination is the same trap",
          where("no path from 92.2,6.1 to -81,4") == (92, 6))
    check("stuck reads the same way",
          where("stuck at -58.0,-64.9 after 5 routes") == (-58, -65),
          str(where("stuck at -58.0,-64.9 after 5 routes")))
    check("an unrelated failure traps nobody",
          where("no coal to insert") is None)
    check("three strikes, not one", STUCK_STRIKES == 3)

    print("\n23. promise only what you can carry")
    six = list("abcdef")
    check("sixty coal feeds one chest of fifty, not six",
          carry_split(six, 60, 50) == (["a"], 50),
          str(carry_split(six, 60, 50)))
    check("forty coal at twenty-five each feeds one",
          carry_split(six, 40, 25) == (["a"], 25),
          str(carry_split(six, 40, 25)))
    check("a full load serves everyone",
          carry_split(six, 300, 50) == (six, 300))
    check("the load is trimmed to what is actually placed",
          carry_split(six, 130, 50) == (["a", "b"], 100),
          str(carry_split(six, 130, 50)))
    check("one is always worth the trip",
          carry_split(six, 5, 50)[0] == ["a"])
    check("a zero share is not a division by zero",
          carry_split(six, 10, 0) == (six, 10))

    print("\n24. the crew chief can actually be called")
    # 9회차에 [창고] 절을 프롬프트에 넣으면서 _stores_text 정의가 파일에
    # 들어가지 않았다. import 는 통과했다 - 그 이름은 호출할 때야 찾는다.
    # 그래서 반장은 열여덟 회차 동안 NameError 로 죽어 있었고, 예외는
    # 스레드 안에서 잡혀 stderr 로만 나갔다. 사람이 채팅에 쓴 모든 지시가
    # 그렇게 사라졌다.
    #
    # 프롬프트를 조립하는 데까지는 게임도 모델도 필요 없다. 여기서 막는다.
    class FakeSnap:
        x, y = 0.0, 0.0
        items = {"coal": 3}
        resources = {}
        buildings = {}
        humans = []
        mates = []

    fleet = [{"name": "alpha", "x": 0, "y": 0, "focus": "", "items": {},
              "doing": ""}]
    built = brain.delegate("나 관찰자로 바꿔줘", FakeSnap(), fleet,
                           cli="definitely-not-a-real-binary-xyz")
    check("a missing CLI is a clean None, not an exception", built is None)
    check("the chief can describe what is in the chests",
          "coal 40" in brain._stores_text([{"x": 1, "y": 2,
                                            "items": {"coal": 40}}]),
          brain._stores_text([{"x": 1, "y": 2, "items": {"coal": 40}}]))
    check("and says so plainly when it cannot see them",
          "확인 못 함" in brain._stores_text(None))
    check("every helper the prompt calls exists",
          all(hasattr(brain, n) for n in
              ("_stores_text", "_fleet_text", "_snapshot_text", "_clean_commands")))

    print("\n25. an ore spot remembers which ore it is")
    # (78,46)에서 석탄을 캐라고 시켰더니 copper-ore 를 캐 왔다. 구리 광맥이
    # 석탄 위에 겹쳐 있었고, mine 이 이름 없이 「그 자리의 자원」을 집었다.
    # 호출부가 열한 군데라 거기마다 이름을 붙이면 언젠가 하나를 빠뜨린다.
    overlap = Snapshot(resources={
        "coal": {"nearest": {"x": 78, "y": 46}, "nearest_dist": 10, "tiles": 309},
        "copper-ore": {"nearest": {"x": 72, "y": 38}, "nearest_dist": 0,
                       "tiles": 432}})
    check("the coal spot says it is coal",
          overlap.ore("coal") == {"x": 78, "y": 46, "name": "coal"},
          str(overlap.ore("coal")))
    check("and spreading it into a step carries the name",
          dict(**overlap.ore("coal"), count=30)["name"] == "coal")
    check("copper keeps its own name",
          overlap.ore("copper-ore")["name"] == "copper-ore")
    check("an ore that is not there is still None",
          overlap.ore("uranium-ore") is None)

    print("\n26. one belt kills two bottlenecks")
    stuck = [{"x": 0, "y": 0}, {"x": 100, "y": 100}]
    hungry = [{"x": 6, "y": 0}, {"x": 9, "y": 0}]
    got = belt_pairs(stuck, hungry)
    check("the blocked drill is joined to the nearest starving furnace",
          got and got[0][1] == hungry[0], str(got))
    check("a furnace across the map is nobody's belt",
          len(got) == 1, str(len(got)))
    check("one furnace is not fed by two belts",
          len({id(o) for _, o in belt_pairs(
              [{"x": 0, "y": 0}, {"x": 1, "y": 0}], [{"x": 5, "y": 0}])}) == 1)
    check("the second drill takes the second furnace",
          [o["x"] for _, o in belt_pairs(
              [{"x": 0, "y": 0}, {"x": 1, "y": 0}],
              [{"x": 5, "y": 0}, {"x": 7, "y": 0}])] == [5, 7],
          str([o["x"] for _, o in belt_pairs(
              [{"x": 0, "y": 0}, {"x": 1, "y": 0}],
              [{"x": 5, "y": 0}, {"x": 7, "y": 0}])]))
    check("nothing starving means nothing to lay", belt_pairs(stuck, []) == [])

    print("\n26a. ten packs open the door, and hands are faster than a factory")
    # 리서치(2026-09-18): Automation 연구는 빨간 과학팩 열 개면 되고 손으로
    # 만들어도 된다. 우리는 채굴기를 161대까지 늘리면서 이 열 개를 한 번도
    # 안 만들었다.
    def with_lab(packs, working=0):
        return Snapshot(
            x=0, y=0,
            working_labs=working,
            items={"iron-plate": 500, "copper-plate": 500,
                   "automation-science-pack": packs},
            craftable={"automation-science-pack": 200},
            buildings={"lab": {"count": 1, "nearest": {"x": 5, "y": 5},
                               "spots": [{"x": 5, "y": 5}]},
                       "stone-furnace": {"count": 4, "nearest": {"x": 1, "y": 1},
                                         "spots": [{"x": 1, "y": 1}]}},
            researched={"electronics", "steam-power"},
            powered=True)

    keys = [job.key for job in plan(with_lab(0))]
    check("with a lab standing and no packs, the first packs come first",
          "first-packs" in keys, str(keys[:4]))
    # 만든 것만으로는 안 끝난다. 랩에 «들어가야» 끝난다.
    #
    # 실측(2026-09-18): alpha 가 팩 열 개를 손에 쥐고, 랩 세 대가 전기망에
    # 물려 있고, 도는 랩은 0, 연구 진척도 0 이었다. 예전 조건은 「열 개를
    # 가졌는가」였으므로 그 순간 일감이 사라졌다 - 목표가 「열 개를 갖는
    # 것」이 되어버린 것이다.
    check("holding ten with idle labs still asks - held packs are not research",
          "first-packs" in [job.key for job in plan(with_lab(12, working=0))])
    check("once the packs are in a working lab it stops asking",
          "first-packs" not in [job.key for job in plan(with_lab(12, working=3))])

    # 상한은 «모든 경로»에서 지켜야 한다.
    #
    # 지난 판을 망친 것이 이것이다. 사다리는 버너 시대 상한 마흔 대에서
    # 멈추는데, 「할 일이 비어 하나 더 놓겠습니다」가 그 상한을 안 봤다.
    # 그래서 채굴기가 157대, 화로가 106대까지 갔고, 남는 백스무 대가
    # 캐지도 않으면서 연료를 태워 공해를 냈다. 그 공해가 둥지를 깨웠고
    # 습격에 화로 8대와 요원 하나를 잃었다.
    #
    # 규칙을 한 곳에 적고 다른 곳에서 안 보면 규칙이 없는 것과 같다.
    packed = Snapshot(x=0, y=0, researched=set(),
                      buildings={"stone-furnace": {"count": 300},
                                 DRILL: {"count": BURNER_DRILLS}})
    check("the burner cap leaves no room once it is reached",
          drill_target(packed, crew=8) - BURNER_DRILLS <= 0,
          str(drill_target(packed, crew=8)))

    # 자리표가 다 찼으면 화로를 «안» 놓는다. 예전에는 빈 자리가 없으면
    # 번호로 계산해서 그냥 놓았고, 그것이 마흔여덟 칸짜리 자리표에 화로
    # 백여섯 대가 선 경로다.
    seated = Snapshot(
        x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
        items={"stone-furnace": 5, "coal": 99},
        smelter={"x": 10, "y": 10}, next_furnace=None,
        buildings={"stone-furnace": {"count": 48, "nearest": {"x": 10, "y": 10},
                                     "nearest_dist": 2,
                                     "spots": [{"x": 10, "y": 10, "distance": 2}]},
                   DRILL: {"count": 40}})
    check("a full seat map stops the furnace line",
          not any(j.key.startswith("furnace:") for j in plan(seated, crew=8)),
          str([j.key for j in plan(seated, crew=8)][:4]))

    # 방어 빚이 있으면 굴뚝을 더 세우지 않는다.
    #
    # 사용자: "공해도가 올라가면 적이 공격오니까 우린 자원도 자원나름이지만
    # 방어가 최우선임."
    #
    # 버너 채굴기도 돌 화로도 하나하나가 굴뚝이다. 굴뚝을 더 세우는 것은
    # 빚을 더 지는 일이다. 갚기 전에는 늘리지 않고 이미 선 것으로 버틴다.
    def owing(debt):
        return Snapshot(x=0, y=0, researched=set(), debt=debt,
                        buildings={"stone-furnace": {"count": 8},
                                   DRILL: {"count": 8}})

    check("with the defence paid up the factory grows",
          drill_target(owing(0), crew=8) > 8, str(drill_target(owing(0), crew=8)))
    check("but a defence debt stops new smokestacks",
          drill_target(owing(3), crew=8) <= 8, str(drill_target(owing(3), crew=8)))
    check("furnaces stop for the same reason",
          furnace_target(owing(3), crew=8) <= 8,
          str(furnace_target(owing(3), crew=8)))
    # 다만 이미 선 것을 줄이지는 않는다. 멈춘 공장은 총도 못 만든다.
    check("and it never shrinks what already stands",
          drill_target(owing(99), crew=8) >= len(FOCUS_ORDER),
          str(drill_target(owing(99), crew=8)))

    # 갚을 수 없는 빚은 빚이 아니라 벌이다.
    #
    # 실측(새 판 13분째): gun-turret 연구가 안 끝났는데(can_turret False)
    # 빚이 2로 잡혀 있었다. 그대로 두면 성장이 영원히 멈추는데, 정작 총을
    # 세울 방법이 없다. 그때 할 일은 총을 세우는 것이 아니라 연구를 끝내는
    # 것이고, 연구는 공장이 돌아야 끝난다.
    #
    # 이 판단은 게임 쪽(defence.lua)에서 한다 - 연구 상태를 아는 곳이
    # 거기다. 여기서는 그 규칙이 지켜지는지 «형태»로 본다.
    _dl = open(os.path.join(os.path.dirname(__file__), "..", "mods",
                            "ai-bridge_0.3.0", "defence.lua"),
               encoding="utf-8").read()
    _at = _dl.find("debt = ")
    _rule = _dl[_at:_at + 200] if _at >= 0 else ""
    check("an unpayable defence debt is not charged",
          "researched" in _rule,
          _rule.split(",")[0][:70] if _rule else "debt 를 못 찾음")

    # 공해가 둥지에 닿아가면 방어가 급한 일이 된다.
    #
    # 실측(지난 판): 여유 13타일에서 터렛 2대, 탄약 0. 화로 11대, 채굴기
    # 14대, 그리고 캐릭터 74번을 잃었다. 그때 방어는 「급하지 않은 일」
    # 칸에 있었다.
    #
    # 터렛 한 대를 세우고 탄약을 채우는 데 몇 분이 든다. 닿은 뒤에 시작하면
    # 세우는 동안 습격이 온다.
    from settings import DEFEND_WHEN
    check("far from the nests, defence can wait",
          DEFEND_WHEN < 200)
    check("and the threshold leaves time to build one",
          DEFEND_WHEN >= 30, str(DEFEND_WHEN))

    # 굶고 있으면 새로 넣는 일보다 되살리는 일이 먼저다.
    #
    # 실측(181분째): 채굴기 28대 중 도는 것 0, 화로 27대 중 0. 연료 없이
    # 선 채굴기가 열일곱인데 상자에 석탄이 324개 있었다. 요원 다섯은 석탄을
    # 손에 들고도 사다리가 시키는 제련만 반복했다 - 화로에 한 줌씩 넣는
    # 것은 그 화로 한 대를 잠깐 살릴 뿐인데.
    def kitchen(starving):
        return Snapshot(
            x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
            starving=starving,
            items={"coal": 99, "iron-ore": 99, "iron-plate": 5},
            buildings={"stone-furnace": {"count": 4, "nearest": {"x": 1, "y": 1},
                                         "nearest_dist": 2,
                                         "spots": [{"x": 1, "y": 1},
                                                   {"x": 5, "y": 1}]},
                       DRILL: {"count": 4}})

    check("a fed factory still cooks",
          any(j.key.startswith("smelt:") for j in plan(kitchen(False), crew=4)))
    check("a starving one stops cooking and goes to revive",
          not any(j.key.startswith("smelt:") for j in plan(kitchen(True), crew=4)),
          str([j.key for j in plan(kitchen(True), crew=4)][:3]))

    # 석탄은 광석 하나가 아니라 «모든 것의 연료»다.
    #
    # 실측(41분째): 채굴기 여섯 대가 돌 2, 구리 3, 철 1. 석탄 0대,
    # 상자 속 석탄도 0. 그래서 넷이 돌아가며 "연료가 없습니다. 석탄 캐러
    # 갑니다"만 했다. 먼저 온 광맥이 예산을 다 써버린 것이다.
    #
    # 다른 광맥은 없으면 느려질 뿐이지만 석탄은 없으면 «멈춘다».
    def with_fields(ores, drills):
        return Snapshot(
            x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
            items={"burner-mining-drill": 3, "iron-chest": 3, "coal": 50},
            fields=[{"ore": o} for o in ores],
            resources={o: {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4}
                       for o in ("coal", "iron-ore", "copper-ore", "stone")},
            buildings={"stone-furnace": {"count": drills,
                                         "nearest": {"x": 1, "y": 1},
                                         "nearest_dist": 2,
                                         "spots": [{"x": 1, "y": 1}]},
                       DRILL: {"count": drills}})

    no_coal = [j.key for j in plan(with_fields(
        ["stone", "copper-ore", "iron-ore"], 6), focus="iron-ore", crew=4)]
    check("with no coal field the next drill goes to coal",
          any(k.startswith("automate:coal") for k in no_coal), str(no_coal[:3]))

    # 한 대로는 모자란다. 버너 채굴기 하나가 캐는 0.25/s 중 제가 태우는
    # 것이 0.0375/s 라 여섯 대치를 남기는데, 우리는 스물여덟 대를 돌린다.
    thin = [j.key for j in plan(with_fields(["coal", "copper-ore"], 6),
                                focus="iron-ore", crew=4)
            if j.key.startswith("automate:")]
    check("one coal rig is not enough to stop asking",
          thin and thin[0].startswith("automate:coal"), str(thin[:3]))

    enough_coal = [{"ore": "coal", "count": COAL_RIGS}, {"ore": "copper-ore"}]
    full_coal = [j.key for j in plan(
        Snapshot(x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
                 items={"burner-mining-drill": 3, "iron-chest": 3, "coal": 50},
                 fields=enough_coal,
                 resources={o: {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4}
                            for o in ("coal", "iron-ore", "copper-ore", "stone")},
                 buildings={"stone-furnace": {"count": 6,
                                              "nearest": {"x": 1, "y": 1},
                                              "nearest_dist": 2,
                                              "spots": [{"x": 1, "y": 1}]},
                            DRILL: {"count": 6}}),
        focus="iron-ore", crew=4) if j.key.startswith("automate:")]
    check("with the coal quota met it does not jump the queue",
          not full_coal or not full_coal[0].startswith("automate:coal"),
          str(full_coal[:3]))

    # 「모른다」와 「없다」는 다르다. 모를 때는 석탄을 앞으로 당기지 않는다 -
    # 모른다고 상한을 넘기면 상한이 없는 것과 같아진다.
    unknown = [j.key for j in plan(with_fields([], 6), focus="iron-ore", crew=4)
               if j.key.startswith("automate:")]
    check("and an unknown field list does not promote coal",
          not unknown or not unknown[0].startswith("automate:coal"),
          str(unknown[:3]))

    # 둥지가 가까우면 덜 짓는다.
    #
    # 사용자: "이번맵은 적기지가 가까이있는데 이점 유의해". 실측으로
    # 가장 가까운 둥지가 130타일 - 지난 판(264타일)의 절반이다. 그리고
    # 지난 판에서 공해는 224타일까지 뻗었다. 같은 공장을 이 맵에 그대로
    # 지으면 훨씬 일찍 닿는다.
    #
    # 버너 기계는 하나하나가 굴뚝이다. 「몇 대까지」는 벨트가 먹일 수 있는
    # 수만으로 정할 일이 아니다.
    def with_slack(room):
        return Snapshot(x=0, y=0, researched=set(), slack=room,
                        buildings={"stone-furnace": {"count": 300}})

    roomy = drill_target(with_slack(200), crew=8)
    tight = drill_target(with_slack(30), crew=8)
    check("a far nest leaves the cap alone",
          roomy == drill_target(with_slack(None), crew=8), str(roomy))
    check("a near nest cuts the cap", tight < roomy, f"{tight} < {roomy}")
    check("pollution already at the nest stops new smokestacks",
          drill_target(with_slack(0), crew=8) < roomy,
          str(drill_target(with_slack(0), crew=8)))
    # 다만 0 으로 만들지는 않는다. 멈춘 공장은 방어를 세울 재료도 못 만든다.
    check("but never to zero - a stopped factory cannot arm itself",
          drill_target(with_slack(0), crew=8) >= len(FOCUS_ORDER),
          str(drill_target(with_slack(0), crew=8)))

    # 소모품을 «가지고 있는가»로 물으면 사다리가 굴러떨어진다.
    #
    # 실측: automation 연구가 끝났는데(빨간 과학팩 열 개를 «써야» 끝난다)
    # 조립기가 0대였다. 사다리가 「빨간 과학팩 생산」 단에서 못 올라오고
    # 있었고, 조립기 단은 그 위에 있었다. 팩은 랩이 먹어서 가방에 안 남는다.
    from mission import stage_of

    def after_research(made):
        return Snapshot(
            x=0, y=0,
            items={"iron-plate": 500, "copper-plate": 500},   # 팩은 다 썼다
            made={"automation-science-pack": made},
            buildings={"lab": {"count": 1, "nearest": {"x": 5, "y": 5},
                               "spots": [{"x": 5, "y": 5}]},
                       "stone-furnace": {"count": 4, "nearest": {"x": 1, "y": 1},
                                         "spots": [{"x": 1, "y": 1}]}},
            researched={"electronics", "steam-power", "automation"},
            powered=True)

    check("packs spent on research still count as made",
          stage_of(after_research(10)).key != "red-science",
          stage_of(after_research(10)).key)
    check("and the crew moves up to the assembler",
          stage_of(after_research(10)).key == "assembler",
          stage_of(after_research(10)).key)
    check("never having made one still holds the ladder there",
          stage_of(after_research(0)).key == "red-science",
          stage_of(after_research(0)).key)

    # 버너 시대 상한. 숙련자 권장치는 마흔 대 안팎인데 우리는 161대를 세웠다.
    wide = Snapshot(x=0, y=0, buildings={"stone-furnace": {"count": 300}},
                    researched=set())
    electric = Snapshot(x=0, y=0, buildings={"stone-furnace": {"count": 300}},
                        researched={"electric-mining-drill"})
    check("burner drills are capped at forty while they are still burners",
          drill_target(wide, crew=8) <= 40, str(drill_target(wide, crew=8)))
    check("the cap lifts once electric drills are researched",
          drill_target(electric, crew=8) > drill_target(wide, crew=8))

    print("\n26b. every zone has its own grid")
    shop = {"x": 66, "y": -8}
    line = [craft_seat(shop, n) for n in range(6)]
    check("six machines to a row, four tiles apart",
          all(p["y"] == -8 for p in line)
          and [p["x"] for p in line] == list(range(66, 66 + 24, 4)))
    check("the seventh drops to the next band with a lane between",
          craft_seat(shop, 6) == {"x": 66, "y": -8 + 5})
    check("a whole craft zone stays inside its 24 by 14 plot",
          max(craft_seat(shop, n)["x"] for n in range(18)) - 66 <= 24
          and max(craft_seat(shop, n)["y"] for n in range(18)) + 8 <= 14)

    print("\n27. furnaces stand in rows, not in a spray")
    home = {"x": 52, "y": 16}
    first = [furnace_seat(home, n) for n in range(12)]
    check("the first twelve make one row",
          all(p["y"] == 16 for p in first)
          and [p["x"] for p in first] == list(range(52, 52 + 36, 3)))
    second = [furnace_seat(home, n) for n in range(12, 24)]
    check("the next twelve face them across an aisle",
          all(p["y"] == 21 for p in second)
          and [p["x"] for p in second] == list(range(52, 52 + 36, 3)))
    check("the aisle is wide enough for a belt between them",
          second[0]["y"] - first[0]["y"] >= 4)
    check("a new block starts below, not further right",
          furnace_seat(home, 24) == {"x": 52, "y": 16 + 5 + 9})
    # 한 줄로 274타일, 여섯 칸 줄로 40타일, 겹겹이로 16타일을 거쳐 여기까지 왔다.
    reach = [furnace_seat(home, n) for n in range(60)]
    check("sixty furnaces fit in 36 by 42 tiles",
          max(p["x"] for p in reach) - 52 <= 36
          and max(p["y"] for p in reach) - 16 <= 42,
          "%d x %d" % (max(p["x"] for p in reach) - 52,
                        max(p["y"] for p in reach) - 16))

    # ------------------------------------------------------------------
    print("\n11. the board does not hold a request it can never fill")

    # 514분 판에서 죽은 delta 앞으로 붙은 부탁 하나가 여덟 시간을 살아남아
    # 남은 한 사람의 순찰을 통째로 먹었다. 두 갈래로 막는다.

    board = mission.Board()
    board.post("delta", "iron-chest", 1, "needs a chest", 0.0)
    check("a gone crewmate's request comes down at once",
          len(board.forget({"delta"})) == 1 and not board.requests)

    board = mission.Board()
    board.post("delta", "iron-chest", 1, "needs a chest", 0.0)
    # 집고 -> 못 지키고 -> 다시 열리고 를 반복한다. `take` 가 `posted` 를
    # 매번 지금으로 덮으므로 예전 시효로는 영영 안 내려간다.
    now = 0.0
    for _ in range(40):
        now += 100.0
        req = board.offer("bravo", {"iron-chest": 1})
        if req is not None:
            board.take(req, "bravo", now)
            req.helper = None          # 못 지켰다
        board.expire(now)
    check("it comes down however many times it is re-taken", not board.requests,
          "%d left after %ds" % (len(board.requests), now))

    board = mission.Board()
    board.post("alpha", "coal", 20, "fuel", 0.0)
    check("a living crewmate's request is still picked up",
          board.offer("bravo", {"coal": 20}) is not None)


    # ------------------------------------------------------------------
    print("\n12. a machine in the bag is placed before a new one is made")

    # 실측(37분째): 땅에 채굴기 2 화로 1, 가방에 채굴기 2 화로 3 벨트 38.
    # 완성된 기계를 주머니에 넣고 다니며 다섯이 손으로 캤다. 일감 목록에
    # «있었지만» 앞쪽 일감이 다섯을 다 먹어서 차례가 안 왔다.
    from ladder import in_hand_first, _just_placing
    from jobs import Job

    held = Snapshot(tick=0, x=0.0, y=0.0,
                    items={"burner-mining-drill": 2}, craftable={},
                    buildings={}, resources={}, researched=set())
    make = Job("드릴을 만듭니다", key="craft",
               steps=[("craft", {"recipe": "burner-mining-drill", "count": 1})])
    power = Job("보일러를 놓습니다", key="power",
                steps=[("build", {"name": "boiler", "x": 0, "y": 0})])
    place = Job("드릴을 놓습니다", key="drill:1,1",
                steps=[("build", {"name": "burner-mining-drill", "x": 1, "y": 1})])

    check("a held machine is what 'just placing' means",
          _just_placing(place, held) and not _just_placing(make, held))
    check("a machine not in the bag does not jump the queue",
          not _just_placing(power, held))
    check("placing what is held goes first",
          in_hand_first([make, power, place], held)[0] is place)
    check("everything else keeps its order",
          in_hand_first([make, power, place], held)[1:] == [make, power])
    check("nothing moves when nothing is held",
          in_hand_first([make, power], held) == [make, power])

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

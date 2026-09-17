"""Unit tests for the agent's pure layers. No Factorio required."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bridge"))

import brain  # noqa: E402
import mission  # noqa: E402
from agent import (FOCUS_ORDER, Crew, Job, Snapshot,  # noqa: E402
                   missing_item, next_goal, plan)

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

    def at(items=None, buildings=None, craftable=None, tech=None):
        # Default to "the early technologies are in": the ladder below is about
        # gathering and building, and unresearched tech has its own rungs.
        return Snapshot(**world, items=items or {}, buildings=buildings or {},
                        craftable=craftable or {},
                        researched=set(ALL_TECH if tech is None else tech))

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
          job is not None and job.key == "automate:copper-ore",
          str(job.key if job else None))

    # Once every patch has a drill and the stockpile is full there is genuinely
    # nothing left on the ladder.
    ALL_DRILLED = {**FURNACE, **PAIRED,
                   "burner-mining-drill": {"nearest": {"x": 9, "y": 9},
                                           "nearest_dist": 12, "count": 4,
                                           "spots": [{"x": 9, "y": 9, "distance": 12}]}}
    full = {"coal": 99, "iron-plate": 40, "iron-ore": 99, "copper-ore": 99, "stone": 99,
            "lab": 1}
    settled = {**ALL_DRILLED, "lab": {"nearest": {"x": 4, "y": -4}, "nearest_dist": 6, "count": 1},
               "steam-engine": {"nearest": {"x": 20, "y": 20}, "nearest_dist": 28, "count": 1}}
    check("and stops when there is nothing left to do",
          next_goal(at(full, settled, CAN_TOOL), focus="copper-ore") is None,
          str(next_goal(at(full, settled, CAN_TOOL), focus="copper-ore")))

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

    print("\n3e. each agent still prefers its own resource")
    stock_first = [j.key for j in plan(
        at({"coal": 10, "iron-plate": 40, "iron-ore": 99}, WITH_DRILL, CAN_TOOL),
        focus="copper-ore") if j.key.startswith("stock:")]
    check("its own ore is offered first",
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

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

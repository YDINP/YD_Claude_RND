"""Unit tests for the agent's pure layers. No Factorio required."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bridge"))

import brain  # noqa: E402
from agent import (ALL, FOCUS_ORDER, Snapshot, next_goal, parse, share,  # noqa: E402
                   split_target)

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
    print("1. chat parsing")
    for text, expected in [
        ("철 20개 캐와", "mine"),
        ("구리 좀 캐줘", "mine"),
        ("석탄 캐", "mine"),
        ("이리와", "come"),
        ("따라와봐", "come"),
        ("멈춰", "stop"),
        ("그만해", "stop"),
        ("알아서 해", "autopilot_on"),
        ("자율 모드", "autopilot_on"),
        ("수동으로 바꿔", "autopilot_off"),
        ("벨트 10칸 깔아", "place"),
        ("화로 놔줘", "place"),
        ("가방 뭐있어", "report_inventory"),
        ("주변 정찰해", "report_scout"),
        ("상태 어때", "report_status"),
        ("mine iron", "mine"),
        ("stop", "stop"),
        ("오늘 날씨 좋네", None),
        ("", None),
        # "자동화" is a job, not a mode switch: the "자동" inside it used to
        # swallow the sentence before it could ever reach the automation path.
        ("석탄 자동화좀해봐", "automate"),
        ("석탄캐는데 건물로 자동화되게 진행해바", "automate"),
        ("자동화 해줘", "automate"),
        # "수동" contains "동", which used to resolve to copper ore and made
        # the line look like work instead of a mode switch.
        ("수동", "autopilot_off"),
    ]:
        got = kind(text)
        check(f"{text!r} -> {expected}", got == expected, f"got {got}")

    print("\n1b. keyword matching prefers the longest word")
    check("석탄 자동화 is about coal", params("석탄 자동화").get("ore") == "coal",
          str(params("석탄 자동화")))
    check("철광석 resolves past 철", params("철광석 30개 캐와").get("ore") == "iron-ore")
    check("bare 자동화 has no ore", params("자동화 해줘").get("ore") is None)

    print("\n1c. addressing one agent, or all of them")
    roster = ["alpha", "bravo", "charlie"]
    for text, want_target, want_kind in [
        ("alpha 철 캐와", "alpha", "mine"),
        ("bravo 이리와", "bravo", "come"),
        ("2번 멈춰", "bravo", "stop"),
        ("1번아 석탄 캐와", "alpha", "mine"),
        ("모두 멈춰", ALL, "stop"),
        ("전부 이리와", ALL, "come"),
        ("철 캐와", None, "mine"),            # nobody named: caller picks
        ("9번 멈춰", None, "stop"),           # out of range: not an address
    ]:
        target, rest = split_target(text, roster)
        got = parse(rest)
        got_kind = got[0][0] if got else None
        ok = target == want_target and got_kind == want_kind
        check(f"{text!r} -> {want_target}/{want_kind}", ok, f"got {target}/{got_kind}")

    print("\n1d. an order given to the crew is divided, not multiplied")
    order = ("mine", {"ore": "coal", "count": 30})
    portions = [share(order, 3, i)[1]["count"] for i in range(3)]
    check("30 across 3 is 10 each", portions == [10, 10, 10], str(portions))

    uneven = [share(("mine", {"ore": "coal", "count": 10}), 3, i)[1]["count"] for i in range(3)]
    check("remainder goes to the first", uneven == [4, 3, 3], str(uneven))
    check("total is what was asked", sum(uneven) == 10)

    tiny = [share(("mine", {"ore": "coal", "count": 2}), 3, i)[1]["count"] for i in range(3)]
    check("nobody is given zero", all(c >= 1 for c in tiny), str(tiny))

    spreads = [share(order, 3, i)[1]["spread"] for i in range(3)]
    check("miners stand apart", spreads == [0, 1, 2], str(spreads))

    check("a lone agent keeps the whole order",
          share(order, 1, 0)[1]["count"] == 30)
    check("countless intents pass through unchanged",
          share(("come", {}), 3, 1) == ("come", {}))

    print("\n2. counts")
    check("digits win", params("철 37개 캐와").get("count") == 37)
    check("korean numeral", params("돌 다섯개 캐").get("count") == 5)
    check("default applies", params("철 캐와").get("count") == 20)
    check("count is clamped", params("철 99999개 캐와").get("count") == 1000)

    print("\n3. the self-directed ladder climbs from hands to a working mine")
    world = dict(x=0.0, y=0.0, resources={
        "stone": {"nearest": {"x": 10, "y": 0}, "nearest_dist": 10, "tiles": 5},
        "coal": {"nearest": {"x": 20, "y": 0}, "nearest_dist": 20, "tiles": 5},
        "iron-ore": {"nearest": {"x": 30, "y": 0}, "nearest_dist": 30, "tiles": 5},
        "copper-ore": {"nearest": {"x": 40, "y": 0}, "nearest_dist": 40, "tiles": 5},
    })
    FURNACE = {"stone-furnace": {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4, "count": 1}}
    WITH_DRILL = {**FURNACE, "burner-mining-drill": {"nearest": {"x": 9, "y": 9},
                                                     "nearest_dist": 12, "count": 1}}

    def at(items=None, buildings=None):
        return Snapshot(**world, items=items or {}, buildings=buildings or {})

    rungs = [
        ("bare hands go for stone", at(), "mine", lambda j: j.steps[0][1]["x"] == 10),
        ("then a furnace is crafted", at({"stone": 5}), "craft", None),
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

    print("\n3b. with plates in hand it mechanises, then keeps the patch stocked")
    tooled = at({"coal": 10, "iron-plate": 20}, FURNACE)
    job = next_goal(tooled, focus="coal")
    check("builds a drill instead of mining by hand",
          job is not None and job.routine == "automate" and job.ore == "coal",
          str(job.routine if job else None))

    running = at({"coal": 10, "iron-plate": 20}, WITH_DRILL)
    job = next_goal(running, focus="copper-ore")
    check("then stockpiles its own resource",
          job is not None and job.steps and job.steps[0][1]["x"] == 40,
          str(job.steps[0] if job and job.steps else None)[:70])

    stocked = at({"coal": 10, "iron-plate": 20, "copper-ore": 99}, WITH_DRILL)
    check("and stops when the stockpile is full",
          next_goal(stocked, focus="copper-ore") is None)

    print("\n3c. each agent works a different resource")
    focuses = [FOCUS_ORDER[i % len(FOCUS_ORDER)] for i in range(4)]
    check("four agents, four resources", len(set(focuses)) == 4, str(focuses))
    check("a fifth wraps around", FOCUS_ORDER[4 % len(FOCUS_ORDER)] == FOCUS_ORDER[0])

    print("\n4. planning is pure")
    twice = at({"coal": 10, "iron-ore": 20}, FURNACE)
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

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

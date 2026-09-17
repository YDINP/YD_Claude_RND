"""Unit tests for the agent's pure layers. No Factorio required."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bridge"))

import brain  # noqa: E402
from agent import ALL, Snapshot, next_goal, parse, split_target  # noqa: E402

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

    print("\n2. counts")
    check("digits win", params("철 37개 캐와").get("count") == 37)
    check("korean numeral", params("돌 다섯개 캐").get("count") == 5)
    check("default applies", params("철 캐와").get("count") == 20)
    check("count is clamped", params("철 99999개 캐와").get("count") == 1000)

    print("\n3. the self-directed ladder is ordered and pure")
    empty = Snapshot(x=0, y=0, resources={
        "stone": {"nearest": {"x": 10, "y": 0}, "nearest_dist": 10, "tiles": 5},
        "coal": {"nearest": {"x": 20, "y": 0}, "nearest_dist": 20, "tiles": 5},
        "iron-ore": {"nearest": {"x": 30, "y": 0}, "nearest_dist": 30, "tiles": 5},
    })
    goal = next_goal(empty)
    check("starts with stone", goal is not None and goal[1][0][0] == "mine"
          and goal[1][0][1]["x"] == 10, str(goal[1] if goal else None)[:80])

    with_stone = Snapshot(**{**empty.__dict__, "items": {"stone": 5}})
    goal = next_goal(with_stone)
    check("then crafts a furnace", goal is not None and goal[1][0][0] == "craft")

    with_furnace_item = Snapshot(**{**empty.__dict__, "items": {"stone-furnace": 1}})
    goal = next_goal(with_furnace_item)
    check("then places it", goal is not None and goal[1][0][0] == "build")

    placed = Snapshot(**{**empty.__dict__,
                         "buildings": {"stone-furnace": {"nearest": {"x": 3, "y": 3},
                                                         "nearest_dist": 4, "count": 1}}})
    goal = next_goal(placed)
    check("then fuels up", goal is not None and goal[1][0][1].get("count") == 10
          and goal[1][0][0] == "mine", str(goal[1][0] if goal else None)[:80])

    fuelled = Snapshot(**{**placed.__dict__, "items": {"coal": 10}})
    goal = next_goal(fuelled)
    check("then mines iron", goal is not None and goal[1][0][1]["x"] == 30)

    loaded = Snapshot(**{**placed.__dict__, "items": {"coal": 10, "iron-ore": 20}})
    goal = next_goal(loaded)
    steps = [s[0] for s in goal[1]] if goal else []
    check("then smelts", steps == ["insert", "insert", "wait", "take"], str(steps))

    still_short = Snapshot(**{**placed.__dict__, "items": {"coal": 10, "iron-plate": 20}})
    check("keeps going while short of target", next_goal(still_short) is not None)

    done = Snapshot(**{**placed.__dict__, "items": {"coal": 10, "iron-plate": 50}})
    check("and stops once the target is met", next_goal(done) is None)

    print("\n4. planning is pure")
    check("same snapshot, same plan", next_goal(loaded) == next_goal(loaded))

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

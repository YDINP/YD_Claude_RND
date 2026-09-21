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
                      FURNACE_AISLE, FURNACE_GAP,
                      FURNACE_PITCH, FURNACE_ROW,
                      MAX_FURNACES,
                      STUCK_STRIKES)
from world import Snapshot  # noqa: E402
from jobs import Job, errand_label  # noqa: E402
from layout import (belt_pairs, carry_split, cluster,  # noqa: E402
                    craft_seat, furnace_seat, interleave, nearest_to,
                    spread_sites)
from ladder import (STAGE_TARGET, chain_job, coal_rigs_needed,  # noqa: E402
                    drills_first as _first,
                    drill_target, furnace_target,
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
    # 채굴기를 «한 대 세워둔» 세계로 둔다. 안 그러면 이 세계의 답은
    # 제련이 아니라 「채굴기부터 세워라」다 - 땅에 한 대도 없고 만들 수는
    # 있는 판에서 손으로 굽는 것은 쳇바퀴이기 때문이다. 여기서 보려는
    # 것은 그 순서가 아니라 «실패한 일을 다시 제안하지 않는가»다.
    stuck = at({"coal": 10, "iron-ore": 20},
               {**FURNACE, DRILL: {"nearest": {"x": 9, "y": 9},
                                   "nearest_dist": 12, "count": 1,
                                   "spots": [{"x": 9, "y": 9, "distance": 12}]}},
               CAN_TOOL)
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

    # 땅에 채굴기가 한 대도 없으면 채굴기가 먼저다.
    #
    # 사용자: "반장이 채굴기 심시티부터 한번 진행해봐"
    #
    # 실측(새 판 9분째): 사람 다섯, 화로 다섯, 채굴기 0대. 반장이 고른
    # 아홉 가지 중 앞의 «다섯»이 전부 smelt 였다. 손으로 캐서 손으로
    # 굽는 것은 쳇바퀴다 - 한 줌 넣으면 한 줌 나오고 그 사이 아무것도
    # 자라지 않는다. 채굴기는 세워두면 자는 동안에도 캔다.
    bare = at({"coal": 10, "iron-ore": 20}, FURNACE, CAN_TOOL)
    bare_keys = [j.key for j in plan(bare, focus="iron-ore", crew=5)]
    first_smelt = next((i for i, k in enumerate(bare_keys)
                        if k.startswith("smelt:")), len(bare_keys))
    first_drill = next((i for i, k in enumerate(bare_keys)
                        if k.startswith("automate:")), len(bare_keys))
    check("with no drill standing the drill comes first",
          first_drill < first_smelt, str(bare_keys[:6]))

    # 그런데 «버리지는» 않는다. 채굴기를 못 세우는 판에서 굽는 일까지
    # 없애면 사다리가 통째로 멈춘다.
    check("and the hand smelting is only deferred, not dropped",
          any(k.startswith("smelt:") for k in bare_keys), str(bare_keys))

    # 한 대라도 서 있으면 그 광맥은 기계가 캐고 있다. 손은 굽는 쪽을 돕는다.
    running = at({"coal": 10, "iron-ore": 20},
                 {**FURNACE, DRILL: {"nearest": {"x": 9, "y": 9},
                                     "nearest_dist": 12, "count": 1,
                                     "spots": [{"x": 9, "y": 9, "distance": 12}]}},
                 CAN_TOOL)
    run_keys = [j.key for j in plan(running, focus="iron-ore", crew=5)]
    # 석탄 채굴기는 «녹이는» 쪽의 여유를 먹지 않는다.
    #
    # 실측(새 판 45분째): 화로 5대, 선 채굴기 4대가 전부 석탄, 가방 속
    # 채굴기 11대. 총량으로 여유를 재니 5-4=1 이라, 화로 다섯이 빈 채로
    # 기다리는데 철 채굴기를 한 대밖에 못 놓았다.
    #
    # 앞서 비율에서 석탄을 뺐는데 정작 여유를 재는 자리가 총량을 쓰고
    # 있었다. 규칙을 반만 옮긴 것이다.
    def _rigs(coal, total, furnaces):
        return Snapshot(
            x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
            items={"burner-mining-drill": 9, "iron-chest": 9, "coal": 50},
            fields=[{"ore": "coal", "count": coal},
                    {"ore": "iron-ore", "count": max(0, total - coal)}],
            resources={o: {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4}
                       for o in ("coal", "iron-ore", "copper-ore", "stone")},
            buildings={"stone-furnace": {"count": furnaces,
                                         "nearest": {"x": 1, "y": 1},
                                         "nearest_dist": 2,
                                         "spots": [{"x": 1, "y": 1}]},
                       DRILL: {"count": total}})

    # 화로 다섯이 광석을 기다리는 판이다. 선 넷이 전부 석탄이면 «녹이는»
    # 채굴기는 0대이므로 철·구리·돌 세 자리가 다 열려 있어야 한다.
    # 깨졌을 때는 room = 5 - 4 = 1 이라 한 자리뿐이었다.
    _smelters = [j.key for j in plan(_rigs(4, 4, 5), focus="iron-ore", crew=5)
                 if j.key.startswith("automate:")
                 and not j.key.startswith("automate:coal")]
    # 석탄은 제 몫을 채우면 «그만» 판다. 예산에서 빼는 것과 상한을 없애는
    # 것은 다른 일이라, 빼면서 제 상한을 같이 줘야 한다 - 안 그러면 그
    # 항목만 무한이 된다. 실측(새 판 74분째): 석탄 20대, 철 1대, 구리 1대.
    # 필요한 석탄은 «넷»이었다.
    _plenty = [j.key for j in plan(_rigs(20, 22, 5), focus="iron-ore", crew=5)
               if j.key.startswith("automate:coal")]
    _thin_coal = [j.key for j in plan(_rigs(1, 4, 5), focus="iron-ore", crew=5)
                  if j.key.startswith("automate:coal")]
    # 가방에 채굴기가 놀고 있으면 «세우는 일»이 먼저다.
    #
    # 사다리 일감(채굴기)은 물류 일감 뒤에 붙는다. 그래서 벨트가 한 칸이라도
    # 모자라면 채굴기는 영영 차례가 안 온다 - 그리고 물류는 언제나 한 칸쯤
    # 모자라다. 실측(새 판 51분째): 땅에 3대, 가방에 11대, 다섯 전원 벨트.
    # main() 뒤쪽에 `from jobs import Job` 가 있어서 Job 은 여기서 «지역»이다.
    # 열쇠만 보는 함수라 대역이면 충분하다.
    class _K:
        def __init__(self, key):
            self.key = key

    _pool = [_K("belt:1"), _K("depot:2"), _K("automate:iron-ore:0"),
             _K("belt:3"), _K("automate:coal:1")]
    _pulled = [j.key for j in _first(_pool, holding=11)]
    check("drills in the bag jump the queue",
          _pulled[:2] == ["automate:iron-ore:0", "automate:coal:1"], str(_pulled))
    # 빼지 않고 «당기기만» 한다. 물류는 그 다음 차례에 그대로 있다.
    check("and the hauling is only pushed back, not dropped",
          sorted(_pulled) == sorted(j.key for j in _pool), str(_pulled))
    # 가방이 비면 평소 순서다.
    check("an empty bag leaves the order alone",
          [j.key for j in _first(_pool, holding=0)] == [j.key for j in _pool])

    check("coal rigs leave the smelting budget alone",
          len(_smelters) >= 3, f"녹이는 채굴기 자리 {len(_smelters)}개: {_smelters}")
    check("and coal stops once its own quota is met", not _plenty, str(_plenty))
    check("but it still digs coal while short", bool(_thin_coal), str(_thin_coal))

    check("but a standing drill puts smelting back in front",
          next((i for i, k in enumerate(run_keys) if k.startswith("smelt:")), 99)
          < next((i for i, k in enumerate(run_keys) if k.startswith("automate:")), 99),
          str(run_keys[:6]))

    # One furnace, one cook. Two agents stuffing the same furnace and both
    # waiting on its output is not teamwork.
    # 여기도 채굴기를 한 대 세워둔다. 보려는 것은 «한 화로에 한 사람»이지
    # 제련과 채굴기의 순서가 아니다.
    smelting = at({"coal": 10, "iron-ore": 20},
                  {**FURNACE, DRILL: {"nearest": {"x": 9, "y": 9},
                                      "nearest_dist": 12, "count": 1,
                                      "spots": [{"x": 9, "y": 9, "distance": 12}]}},
                  CAN_TOOL)
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

    # 석탄 채굴기는 화로를 요구하지 않는다.
    #
    # 1:1 은 「캔 광석을 받을 화로가 있는가」의 규칙인데, 석탄은 화로에
    # 안 들어간다. 태우는 입으로 간다. 그런데 한 무더기로 세고 있었다.
    #
    # 값이 두 번 어긋난다. 석탄 채굴기가 녹이는 쪽의 예산을 먹어서 철이
    # 안 늘고, 동시에 제 몫만큼 화로를 요구해서 돌이 헛되이 나간다. 돌은
    # 지금 채굴기를 더 만들지 못하게 막고 있는 바로 그것이다.
    def rigged(coal, total, furnaces):
        rest = max(0, total - coal)
        return Snapshot(
            x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
            items={"coal": 50},
            fields=[{"ore": "coal", "count": coal},
                    {"ore": "iron-ore", "count": rest}],
            resources={o: {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4}
                       for o in ("coal", "iron-ore", "copper-ore", "stone")},
            buildings={"stone-furnace": {"count": furnaces,
                                         "nearest": {"x": 1, "y": 1},
                                         "nearest_dist": 2,
                                         "spots": [{"x": 1, "y": 1}]},
                       DRILL: {"count": total}})

    mostly_coal = furnace_target(rigged(10, 13, 3), crew=2)
    all_smelting = furnace_target(rigged(0, 13, 3), crew=2)
    check("coal drills do not ask for furnaces",
          mostly_coal < all_smelting,
          f"석탄 10/13 -> 화로 {mostly_coal}, 전부 제련 -> 화로 {all_smelting}")

    # 그리고 녹이는 쪽의 상한도 석탄이 먹으면 안 된다. 같은 화로 수에
    # 석탄 채굴기만 늘어난 판은 «철을 더 놓을 수 있는» 판이어야 한다.
    check("nor do they eat the smelting budget",
          drill_target(rigged(10, 13, 3), crew=2)
          - drill_target(rigged(0, 13, 3), crew=2) >= 0,
          f"{drill_target(rigged(10, 13, 3), crew=2)} vs "
          f"{drill_target(rigged(0, 13, 3), crew=2)}")

    # 몇 대면 되는지는 세어서 나온다. 넷은 «바닥»이지 답이 아니다.
    #
    # 상수 넷이 나온 산수는 주석에 이미 적혀 있었다 - 그런데 화로를 안
    # 셌다. 화로도 석탄을 태운다. 산수가 있는데 결과만 박아두면 판이
    # 달라졌을 때 아무도 다시 세지 않는다.
    check("the coal quota is counted, not a constant",
          coal_rigs_needed(40, 40) > coal_rigs_needed(6, 6),
          f"40/40 -> {coal_rigs_needed(40, 40)}, "
          f"6/6 -> {coal_rigs_needed(6, 6)}")
    check("and it never drops below the floor",
          coal_rigs_needed(0, 0) >= COAL_RIGS, str(coal_rigs_needed(0, 0)))

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
    # 줄 길이를 여기 박아 두었더니 제련 구역을 12줄에서 18줄로 늘린 날
    # 시험 넷이 한꺼번에 빨개졌다. 배치가 틀린 것이 아니라 시험이 어제
    # 숫자를 붙들고 있었다.
    #
    #     지키려는 것이 «모양»이면 숫자는 상수에서 끌어와야 한다.
    home = {"x": 52, "y": 16}
    span = FURNACE_PITCH * FURNACE_ROW
    wanted = list(range(52, 52 + span, FURNACE_PITCH))
    first = [furnace_seat(home, n) for n in range(FURNACE_ROW)]
    check("one row holds a whole row's worth",
          all(p["y"] == 16 for p in first)
          and [p["x"] for p in first] == wanted)
    second = [furnace_seat(home, n)
              for n in range(FURNACE_ROW, FURNACE_ROW * 2)]
    check("the next row faces them across an aisle",
          all(p["y"] == 16 + FURNACE_AISLE for p in second)
          and [p["x"] for p in second] == wanted)
    check("the aisle is wide enough for a belt between them",
          second[0]["y"] - first[0]["y"] >= 4)
    check("a new block starts below, not further right",
          furnace_seat(home, FURNACE_ROW * 2)
          == {"x": 52, "y": 16 + FURNACE_AISLE + FURNACE_GAP})
    reach = [furnace_seat(home, n) for n in range(MAX_FURNACES)]
    blocks = -(-MAX_FURNACES // (FURNACE_ROW * 2))
    wide = FURNACE_PITCH * (FURNACE_ROW - 1)
    tall = blocks * (FURNACE_AISLE + FURNACE_GAP)
    check("%d furnaces fit in %d by %d tiles" % (MAX_FURNACES, wide, tall),
          max(p["x"] for p in reach) - 52 <= wide
          and max(p["y"] for p in reach) - 16 <= tall,
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

    # 루틴도 «놓는 일»이다. 채굴기를 놓는 일은 걸음 목록이 아니라 루틴이라
    # 걸음이 없다. 그래서 앞으로 안 당겨졌고, 실측(156분째)이 그 값을
    # 보여줬다 - 땅에 4대, 가방에 6대, 자리표의 빈 자리 16칸.
    routine = Job("채굴기를 한 대 더 놓겠습니다", key="automate:iron-ore:a",
                  routine="automate", ore="iron-ore",
                  needs={"burner-mining-drill": 1})
    check("a routine that just places what is held counts too",
          _just_placing(routine, held))
    check("and it goes first",
          in_hand_first([make, power, routine], held)[0] is routine)

    empty_hands = Snapshot(tick=0, x=0.0, y=0.0, items={}, craftable={},
                           buildings={}, resources={}, researched=set())
    check("but not when the machine is not in the bag",
          not _just_placing(routine, empty_hands))

    # 캐고 나르는 루틴은 «놓기만 하는 일»이 아니다.
    hauling = Job("벨트를 깝니다", key="belt:f1", routine="belt",
                  needs={"transport-belt": 20})
    check("a hauling routine is not a placement",
          not _just_placing(hauling, held))

    # ------------------------------------------------------------------
    print("\n13. as many furnace jobs as there are furnaces missing")

    # 사용자: "인원들 대기가 너무 심해졌는데"
    # 실측(4분째): 여섯 중 다섯이 대기. 화로 2대, 목표 6대인데 일감은 «하나».
    # 모자란 것이 넷인데 한 대씩 내놓으면 다섯이 논다.
    SEATED = {"stone-furnace": {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4,
                                "count": 2,
                                "spots": [{"x": 3, "y": 3, "distance": 4},
                                          {"x": 6, "y": 3, "distance": 7}]}}
    lonely = at({"coal": 99, "stone": 99, "iron-ore": 99, "copper-ore": 99,
                 "stone-furnace": 9}, SEATED, {"stone-furnace": 9})
    seats = [j.key for j in plan(lonely, crew=6) if j.key.startswith("furnace:")]
    check("one job per missing furnace, not one job total",
          len(seats) > 1, str(seats))
    check("and every one has its own key",
          len(seats) == len(set(seats)), str(seats))

    # 자리는 «물어서 받은 것»만 쓴다. 번호로 세어 잡으면 자리표가 막힌
    # 칸을 건너뛴 것을 모르고 두 사람이 같은 타일을 받는다 - 그리고
    # 자리표를 넘어서도 계속 좌표를 내주어 구역 밖에 화로가 선다.
    asked = at({"coal": 99, "stone": 99, "stone-furnace": 9},
               SEATED, {"stone-furnace": 9})
    asked.smelter = {"x": 0, "y": 0}
    asked.furnace_seats = [{"x": 9, "y": 0}, {"x": 12, "y": 0}]
    got = [j.steps[0][1] for j in plan(asked, crew=6)
           if j.key.startswith("furnace:")]
    tiles = [(p["x"], p["y"]) for p in got]
    check("seats come from the plot map, not from counting",
          tiles == [(9, 0), (12, 0)], str(tiles))
    check("no two furnace jobs share a tile", len(tiles) == len(set(tiles)))

    # 빈 자리가 떨어지면 «안 놓는다». 자리표는 마흔여덟 칸인데 번호로
    # 세면 마흔아홉 번째가 구역 밖에 선다 - 화로 106대가 그렇게 섰다.
    empty = at({"coal": 99, "stone": 99, "stone-furnace": 9},
               SEATED, {"stone-furnace": 9})
    empty.smelter = {"x": 0, "y": 0}
    empty.furnace_seats = []
    check("with a smelting zone and no free seat, it builds nothing",
          not [j for j in plan(empty, crew=6) if j.key.startswith("furnace:")
               and j.steps and j.steps[0][0] == "build"])

    # ------------------------------------------------------------------
    print("\n14. the mind decides what, the chief decides where")

    import mind as mind_mod
    from pantry import Pantry

    # 사용자: "심시티건설은 메인반장에게 물어보고 진행할 것."
    # 모델에게 「좌표를 지어내지 마라」고 적어두는 것으로는 여러 번 샜다.
    # 적어두는 대신 «말할 수 없게» 만든다 - 좌표는 뜻의 일부가 아니다.
    sneaky = mind_mod.read({"do": "build",
                            "args": {"what": "stone-furnace", "x": 9, "y": -4}})
    check("a build intent carries no coordinates",
          sneaky.do == "build" and set(sneaky.args) == {"what"}, str(sneaky.args))

    check("an unknown doing falls back to follow",
          mind_mod.read({"do": "launch-rocket"}).do == "follow")
    check("a build with nothing to build falls back too",
          mind_mod.read({"do": "build", "args": {}}).do == "follow")
    check("counts are clamped, not trusted",
          mind_mod.read({"do": "mine", "args": {"ore": "coal",
                         "count": 10 ** 9}}).args["count"] == mind_mod.MAX_COUNT)
    check("junk in is follow out", mind_mod.read(None).do == "follow")

    # 수첩: 겪은 것을 쌓다가 규칙으로 줄인다. 쌓는 것은 기억이고 줄이는 것이 배움이다.
    import lessons
    book = lessons.Journal("__test__")
    book.entries.clear()
    book.rules = ""
    book._since_distil = lessons.DISTIL_AT
    check("an empty distillation is refused", not book.learn("생각해보니 잘 모르겠습니다"))
    # 거절해도 «세는 것은 되돌린다». 안 되돌리면 ripe 가 영영 참이고,
    # 그 사람은 매 순찰 압축만 다시 띄우며 다시는 생각하지 못한다.
    check("a refused distillation still lets the mind think again", not book.ripe)
    check("a rule list is kept", book.learn("- 화로가 굶으면 먼저 먹인다"))
    check("and it shows up in the next brief", "화로가 굶으면" in book.brief())

    # 공용 창고: 목록이 아니라 «소식»으로 말한다. 같은 목록을 되풀이하면 안 읽힌다.
    shelf = Pantry()
    shelf.remember({"total": {"iron-ore": 120}, "chest_count": 1,
                    "chests": [{"x": 4, "y": 4, "items": {"iron-ore": 120}}]})
    check("the pantry remembers what is in it", shelf.has("iron-ore", 100))

    # 합계로 「있다」를 판단하고 «가장 가까운» 상자로 가면 안 된다.
    # 돌만 든 상자 앞에서 철광석을 꺼내려 한 적이 있다.
    mixed = Pantry()
    mixed.remember({"total": {"iron-ore": 120, "stone": 40}, "chest_count": 2,
                    "chests": [{"x": 1, "y": 1, "items": {"stone": 40}},
                               {"x": 9, "y": 9, "items": {"iron-ore": 120}}]})
    spot = mixed.shelf("iron-ore", 30)
    check("it fetches from the chest that actually holds it",
          spot is not None and (spot[0]["x"], spot[0]["y"]) == (9, 9), str(spot))
    check("and says no when no single chest has enough",
          not mixed.has("iron-ore", 200))
    check("and no when nothing has it at all", mixed.shelf("coal", 1) is None)
    check("and says what changed", "들어온 것" in (shelf.news() or ""))
    check("but does not repeat itself", shelf.news() is None)

    # ------------------------------------------------------------------
    print("\n15. every name the mind calls on the crew actually exists")

    # 「self.give」라고만 써두고 그런 메서드를 안 만들었다. 머리가 생각을
    # 마칠 때마다 순찰이 터졌는데, 로그에는 머리가 한 «말»만 남아서 잘
    # 도는 것처럼 보였다 - 말은 일을 맡기기 «전»에 하기 때문이다.
    #
    # 게임 없이는 순찰을 못 돌리므로 «이름»만 본다. 부르는 이름이 실제로
    # 있는지는 게임이 없어도 알 수 있다.
    import ast as _ast
    import crew as _crew

    _src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "bridge", "crew", "thinking.py"),
                encoding="utf-8").read()
    _called = {n.func.attr for n in _ast.walk(_ast.parse(_src))
               if isinstance(n, _ast.Call)
               and isinstance(n.func, _ast.Attribute)
               and isinstance(n.func.value, _ast.Name)
               and n.func.value.id == "self"}
    _missing = sorted(n for n in _called if not hasattr(_crew.Crew, n))
    check("thinking.py invents no crew methods", not _missing, str(_missing))

    # ------------------------------------------------------------------
    print("\n16. the crew divides the work")

    # 사용자: "다같이 기준없이 행동하니까 망가지는듯."
    # 실측(20분째): echo 가 기어를 «만들려» 할 때 셋이 스물한 개를 들고 있었다.
    import roles

    check("four in a crew of five get different kinds of work",
          len(set(roles.share(5))) >= 3, str(roles.share(5)))
    check("a small crew is not carved up",
          len(set(roles.share(3))) == 1, str(roles.share(3)))
    check("a debt puts exactly one on defence",
          roles.share(5, guarded=True).count(roles.GUARD) == 1,
          str(roles.share(5, guarded=True)))
    check("the same crew size always gets the same split",
          roles.share(6) == roles.share(6))

    # 열쇠로 가른다. 일감을 만드는 자리가 여러 파일에 흩어져 있어서,
    # 만드는 쪽마다 역할을 적게 하면 새 일감이 생길 때마다 빠뜨린다.
    for key, want in (("automate:iron-ore:a", roles.MINE),
                      ("belt:f1", roles.HAUL),
                      ("craft:lab", roles.MAKE),
                      ("defend:1,2", roles.GUARD),
                      ("mind-build:lab:3,4", roles.MAKE)):
        if roles.role_of(key) != want:
            check(f"{key} belongs to {want}", False, str(roles.role_of(key)))
    check("every job kind lands somewhere", True)

    # 모르는 일감은 «아무나»의 것이다. 울타리가 아니라 편향이라는 뜻이다.
    check("an unknown job is nobody's and everybody's",
          roles.role_of("what-is-this:1") is None)

    # ------------------------------------------------------------------
    print("\n17. the nearest shore, not the first shore")

    # 실측(116분째): 설계가 잰 물은 기지에서 146타일인데 펌프는 213타일에
    # 섰고, 발전소에서 랩까지 220타일이 됐다. 전봇대 사거리가 7.5이니
    # 서른 개가 든다. 랩 두 대가 no_power 로 서 있었다.
    #
    # 물가는 고를 수 있는 것이 아니지만 «물가의 어디»는 고를 수 있다.
    # 게임이 주는 타일 순서에는 아무 뜻이 없으므로 거리로 세워야 한다.
    _power = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "mods", "ai-bridge_0.3.0", "power.lua"),
                  encoding="utf-8").read()
    _head = _power.split("local function water_sites_near", 1)[-1]
    _head = _head.split("local sites, seen", 1)[0]
    check("water tiles are sorted by distance before picking",
          "table.sort(tiles" in _head and "- x) ^ 2" in _head)

    # ------------------------------------------------------------------
    print("\n18. drills line up on a belt lane, they do not scatter")

    # 사용자: "채굴기를 만들어서 매립지들에 채굴기를 심시티하는것부터 해보자"
    #
    # 화로에는 자리표가 있는데 채굴기에는 없었다. 한 대씩 「근처에서 제일
    # 두꺼운 칸」을 탐욕스럽게 골라서, 넷이 네 방향을 보고 서고 나중에
    # 줄을 깔 자리가 안 남았다.
    #
    # 순서가 거꾸로였다. 벨트 줄이 채굴기를 따라가는 것이 아니라 «채굴기가
    # 줄을 따라야» 한다. 여기서 그 규칙을 plots.lua 와 같은 셈으로 본다.
    LANE, PITCH, ROW = 5, 2, 8

    def mine_seat(lane, nth, wide=True):
        pair, side = nth // 2, nth % 2
        band, step = pair // ROW, (pair % ROW) * PITCH
        off = lane + band * LANE
        if wide:
            return (step, (off - 2) if side == 0 else (off + 1),
                    "south" if side == 0 else "north")
        return ((off - 2) if side == 0 else (off + 1), step,
                "east" if side == 0 else "west")

    # 2x2 채굴기가 (y, y+1) 을 차지하고 바라보는 쪽 한 칸에 떨군다.
    def drops_at(seat, wide=True):
        x, y, face = seat
        if wide:
            return {"south": y + 2, "north": y - 1}[face]
        return {"east": x + 2, "west": x - 1}[face]

    first = [mine_seat(2, n) for n in range(16)]
    check("every drill in a band drops onto the same lane",
          {drops_at(s) for s in first} == {2},
          str(sorted({drops_at(s) for s in first})))
    check("the two rows face each other",
          {s[2] for s in first} == {"south", "north"})
    check("drills step by two along the lane - no overlap",
          sorted({s[0] for s in first}) == [0, 2, 4, 6, 8, 10, 12, 14])
    check("a full band is sixteen drills", ROW * 2 == 16)

    # 다음 줄은 정확히 lane 만큼 떨어진다. 붙으면 두 줄이 한 벨트를
    # 나눠 쓰게 되고, 멀면 광맥을 헛되이 넓게 쓴다.
    second = [mine_seat(2, n) for n in range(16, 32)]
    check("the next lane is exactly one lane away",
          {drops_at(s) for s in second} == {2 + LANE},
          str(sorted({drops_at(s) for s in second})))

    # 세로 밭도 같은 규칙이라야 한다. 밭의 긴 쪽이 어디냐에 따라 배치가
    # 달라지는 것은 맞지만, «마주보고 가운데로 떨군다»는 안 달라진다.
    tall = [mine_seat(2, n, wide=False) for n in range(16)]
    check("a tall patch lays out the same way",
          {drops_at(s, wide=False) for s in tall} == {2})

    # 방향은 «숫자»로 나가야 한다. 이름으로 내보내면 place 가 조용히
    # 0(북쪽)으로 읽고, 열여섯 대가 전부 엉뚱한 데로 떨군다 - 자리표를
    # 만든 보람이 통째로 사라진다.
    _plots = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "mods", "ai-bridge_0.3.0", "plots.lua"),
                  encoding="utf-8").read()
    check("seats hand out numeric directions",
          "direction = defines.direction[seat.direction]" in _plots)

    # 첫 대도 자리표를 쓴다.
    #
    # zones 는 «채굴기가 선» 밭만 알려준다. 그래서 첫 대는 영원히 자리표를
    # 못 쓰고 옛 길(drill_site)로 아무 데나 섰다. 그런데 첫 대가 줄을 정한다 -
    # 한 번 어긋나면 그 뒤가 전부 어긋나고, 어긋난 것들이 자리표 자리를 막는다.
    #
    # 실측(새 판 78분째): 석탄 채굴기 18대가 서 있는데 자리표는 「이미 선 것 0,
    # 막힘 26, 남은 자리 2」라고 답했다. 떨구는 자리가 여섯 줄로 흩어졌고
    # 대부분이 서로에게 떨구고 있었다 - 석탄끼리 서로 먹이면 둘 다 멈춘다.
    #
    # 게임 없이는 자리를 못 고르므로 «코드의 모양»을 본다.
    _mining = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "bridge", "crew", "mining.py"), encoding="utf-8").read()
    _auto = _mining.split("routine 자동 채굴" if "routine 자동 채굴" in _mining
                          else "sites = []")[-1][:2000]
    # 상자는 상자다.
    #
    # 나무 상자를 먼저 찾는 것은 맞다(나무 둘 대 철판 여덟). 그런데 나무가
    # 없는 자리에서 나무 상자«만» 고집하면 채굴기가 한 대도 안 선다.
    #
    # 실측(새 판 84분째): 넷이 동시에 "wooden-chest를 못 구했습니다" 였고,
    # 그때 가방에는 철 상자가 아홉 개, 채굴기가 스물세 대 있었다.
    # 가방이 안 찼어도 «넘치는 것»은 창고에 붓는다.
    #
    # 사용자: "캐릭터들 인벤토리에 남는 자원들이 많은데 왜 물류창고에 안넣지?"
    #
    # 붓는 일감이 「가방이 꽉 찼을 때」(빈 칸 6 이하)만 돌았다. 아무도 그만큼
    # 안 찬다. 실측(새 판 125분째): 빈 칸 27~60개인데 다섯이 석탄 4,831개,
    # 구리판 1,255장을 들고 있었고 창고에는 40개와 0개였다.
    from settings import BAG_KEEP as _KEEP, BAG_SPILL as _SPILL
    check("the spill threshold sits above what a bag keeps",
          _SPILL > 1.0,
          f"두는 양과 붓는 문턱이 같으면 붓고 바로 꺼내 온다 (SPILL={_SPILL})")
    check("and the ores the crew actually hoards are covered",
          {"coal", "iron-plate", "copper-plate", "stone"} <= set(_KEEP),
          str(sorted(_KEEP)))
    _sv2 = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "bridge", "crew", "survey.py"), encoding="utf-8").read()
    check("and a full bag is no longer the only way to pour",
          "have >= keep * BAG_SPILL" in _sv2 and 'key=f"spill:' in _sv2,
          "넘치는 것을 붓는 일감이 없다")

    # 창고 기억은 «생각»이 아니라 살림이다. 머리를 꺼도 돌아야 한다.
    _init = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "bridge", "crew", "__init__.py"), encoding="utf-8").read()
    _think = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "bridge", "crew", "thinking.py"), encoding="utf-8").read()
    check("minding the pantry does not depend on the minds",
          "self.mind_the_pantry(free[0][0].name)" in _init
          and "self.mind_the_pantry(free[0][0].name)" not in _think,
          "창고 읽기가 아직 생각 경로에 세들어 있다")

    # 밭을 모르면 채굴기 일감이 «한 개도» 안 만들어진다.
    #
    # survey 는 첫 번째 사람 하나만 받아 돈다. 그래서 worker.fields 가 한
    # 사람에게만 채워졌고, 나머지 넷은 석탄 채굴기를 녹이는 쪽에서 못 빼서
    # 여유가 음수가 됐다:
    #
    #     room = 채굴기 목표 6 - (선 채굴기 8 - 석탄 0) = -2
    #
    # 실측(새 판 120분째): 일감 25개 중 채굴기 일감 0개, 가방 속 채굴기
    # 18대, 자리 2칸. 로그 300줄에 채굴기 세우기가 한 줄도 없었다.
    def _known(fields):
        return Snapshot(
            x=0, y=0, researched=ALL_TECH, powered=True, working_labs=1,
            items={"burner-mining-drill": 9, "iron-chest": 9, "coal": 50},
            fields=fields,
            resources={o: {"nearest": {"x": 3, "y": 3}, "nearest_dist": 4}
                       for o in ("coal", "iron-ore", "copper-ore", "stone")},
            buildings={"stone-furnace": {"count": 6, "nearest": {"x": 1, "y": 1},
                                         "nearest_dist": 2,
                                         "spots": [{"x": 1, "y": 1}]},
                       DRILL: {"count": 8}})

    _blind = [j.key for j in plan(_known([]), focus="iron-ore", crew=5)
              if j.key.startswith("automate:")]
    _sees = [j.key for j in plan(
        _known([{"ore": "coal", "count": 4}, {"ore": "iron-ore", "count": 4}]),
        focus="iron-ore", crew=5) if j.key.startswith("automate:")]
    check("knowing the fields is what opens drill seats",
          not _blind and bool(_sees),
          f"밭 모를 때 {_blind}, 밭 알 때 {_sees}")

    # 그리고 그 앎이 «모두»에게 가야 한다. 한 사람만 아는 것은 반장이
    # 나누는 판에서 언제나 사고가 된다.
    _sv = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "bridge", "crew", "survey.py"), encoding="utf-8").read()
    check("and every hand is told, not just the first",
          "for mate, shot in free:" in _sv and "mate.fields = rows" in _sv
          and "shot.fields = rows" in _sv,
          "밭 목록을 한 사람에게만 준다(또는 스냅샷을 안 고친다)")

    check("a chest is a chest when the cheap one runs out",
          "spare = CHEST if receiver != CHEST else MINE_CHEST" in _mining
          and "receiver = spare" in _mining,
          "싼 상자를 못 구했을 때 들고 있는 상자로 바꾸지 않는다")

    check("the first drill on a patch still gets a seat map",
          "if not patch:" in _auto and "spot[\"x\"] - 1" in _auto,
          "밭이 없을 때 광맥 위의 점으로 자리표를 부르지 않는다")

    # 각자 생각하는 머리는 «꺼둘 수 있어야» 한다.
    #
    # 사용자: "에이전트들 자가생각행동 잠시 멈추고 반장이 채굴기 심시티부터
    # 한번 진행해봐"
    #
    # 「잠시」라 코드를 고쳐서 끄면 안 된다. 고쳐서 끄면 다시 켜는 것을
    # 잊고, 잊은 것은 영영 꺼져 있다.
    #
    # 그리고 «손잡이가 있다»와 «손잡이가 먹는다»는 다른 말이다. 설정에는
    # 「빈 값이면 머리를 안 단다」고 적혀 있었지만, 그것이 모듈 상수를
    # 읽고 있으면 실행 인자로는 못 끈다. 여기서 보는 것은 뒤엣것이다.
    from crew.thinking import ThinkingMixin as _Think

    class _Quiet(_Think):
        pass

    _off = _Quiet()
    _off.mind_model = ""
    _off.minds = {}

    class _Body:
        name = "alpha"

    # 꺼져 있으면 «바로» 돌아와야 한다. 안 꺼지면 그 다음 줄에서 창고를
    # 찾다가 터지는데, 터지는 것도 「안 꺼졌다」의 한 모양이다.
    try:
        _quiet = _off.let_them_think([(_Body(), None)], set()) == set()
        _why = ""
    except Exception as _exc:
        _quiet, _why = False, f"{type(_exc).__name__}: {_exc}"
    check("minds can be switched off at run time", _quiet, _why)
    check("and switching them off spawns no mind", not _off.minds)

    # 손잡이가 실제로 «인스턴스»를 읽는지. 모듈 상수를 읽으면 위 시험이
    # 통과해도 실행 인자로는 못 끈다.
    _wire = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "bridge", "agent.py"), encoding="utf-8").read()
    check("and the flag reaches the crew",
          "--no-minds" in _wire and 'mind_model="" if args.no_minds' in _wire)


    # -- 보급 순찰: 줄 끝의 팔이 굶으면 그 뒤가 전부 선다 ---------------
    #
    # 16회차 실측: 철.구리 인서터가 둘 다 no_fuel 이었고, 채굴기 서른 대
    # 중 스물여섯이 waiting_for_space_in_destination 으로 서 있었다. 벨트는
    # 꽉 차 있었다. 아무것도 「실패」하지 않았고 그래서 아무도 몰랐다.
    #
    # 사용자: "항상 연료랑 탄약같이 소비성재료들은 넉넉하게 넣어둘 것."
    import upkeep as _up
    def _need(kind, x, held, room):
        return {"type": kind, "name": kind, "x": float(x), "y": 0.0,
                "held": held, "room": room, "item": _up.wants(kind)}
    _low = [_need("mining-drill", 0, 0, 50), _need("mining-drill", 2, 5, 45),
            _need("inserter", 40, 0, 50)]
    _shelf = {"coal": [{"x": 1, "y": 0, "count": 5},
                       {"x": 60, "y": 0, "count": 900}]}
    _round, _why = _up.plan_round(["a", "b"], _low, _shelf)
    _lead = _round[0][1] if _round else []
    check("the arm at the end of a lane is fed first",
          any(v.get("x") == 40 for k, v in _lead if k == "insert"), repr(_lead))
    check("a supply round starts by loading up",
          bool(_lead) and _lead[0][0] == "take")
    # 「가지고 있는가」가 아니라 «달라는 만큼 가지고 있는가». 석탄 다섯 개
    # 든 상자가 바로 옆에 있어도 그리로 가면 걸어간 보람이 없다.
    check("supplies come from a chest that actually holds enough",
          bool(_lead) and _lead[0][1]["x"] == 60, repr(_lead[:1]))
    check("two hands never top up the same machine",
          len({v["x"] for _w, _p in _round for k, v in _p if k == "insert"})
          == sum(1 for _w, _p in _round for k, v in _p if k == "insert"))
    check("nobody is sent out when everything is topped up",
          _up.plan_round(["a", "b"], [], _shelf) == ([], []))

    # 못 하는 것은 못 한다고 «말하고» 끝나야 한다. 조용히 빈손으로
    # 돌아오면 그 침묵이 「이상 없음」으로 읽힌다 - 실제로 한 번 그랬다.
    _none, _said = _up.plan_round(["a", "b"], _low, {})
    check("and nobody is sent out when there is nothing to fetch", _none == [])
    check("but the patrol says why it did nothing", bool(_said), repr(_said))

    # 창고에 조금밖에 없어도 급한 것 하나는 살린다.
    _thin, _ = _up.plan_round(["a"], _low, {"coal": [{"x": 9, "y": 0, "count": 20}]})
    _pours = [v for k, v in _thin[0][1] if k == "insert"] if _thin else []
    # «누구에게 얼마나»와 «어느 순서로 걷나»는 다른 결정이다. 둘을 한
    # 고리에서 정했더니 가까운 채굴기가 스무 개를 다 먹고 급한 팔이
    # 빈손으로 남았다.
    check("a thin chest still saves the most urgent one",
          any(v["x"] == 40 for v in _pours), repr(_thin))
    # 그리고 «있는 만큼만» 나선다. 스무 개 들고 나가 다섯 대를 채우겠다고
    # 하면 첫 대에서 다 쓰고 나머지가 「no coal to insert」로 무너진다.
    check("and never promises more than the chest holds",
          bool(_thin) and sum(v["count"] for v in _pours) <= 20, repr(_pours))

    # 손에 든 것이 있으면 창고를 보러 가지 않는다. 실측: 둘이 천 개를
    # 들고 서서 석탄 26개짜리 상자를 보고 「퍼올 것이 없다」고 했다.
    _bag, _ = _up.plan_round(["a"], _low, {}, {"a": {"coal": 500}})
    check("what is already in the bag is used before walking to a chest",
          bool(_bag) and all(k == "insert" for k, _v in _bag[0][1]), repr(_bag))

    # 떨어지기 «전에» 간다. 다섯 개 남은 채굴기도 부르면 나와야 한다.
    check("a machine that is merely low still gets a visit",
          any(v["x"] == 2 for _w, _p in _up.plan_round(["a"], _low, _shelf)[0]
              for k, v in _p if k == "insert"))

    # 못 하는 일 하나가 «할 수 있는 일 전부»를 막으면 안 된다. 포탑이 제일
    # 급한데 탄창이 없는 날, 석탄은 창고에 있고 인서터는 굶은 채였다.
    _mixed = [_need("ammo-turret", 99, 0, 100)] + _low
    _fall, _ = _up.plan_round(["a"], _mixed, _shelf)
    check("no ammo does not stop the coal round",
          bool(_fall) and any(v["name"] == "coal"
                              for k, v in _fall[0][1] if k == "insert"),
          repr(_fall))
    check("and a turret asks for magazines, not coal",
          _up.wants("ammo-turret") == "firearm-magazine"
          and _up.wants("mining-drill") == "coal")

    # 순찰은 «무리와 같이» 떠야 한다. 16회차에서 따로 돌리다가 배포 때
    # 꺼졌고, 다시 켜는 것을 잊었다. 그 사이에 줄 끝의 팔들이 굶고 포탑이
    # 비었다. 사람이 손으로 켜야 하는 것은 언젠가 안 켜진다.
    _agent_src = open(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "bridge", "agent.py"), encoding="utf-8").read()
    check("the upkeep patrol starts with the crew",
          "--upkeep" in _agent_src and "start_upkeep(bridge" in _agent_src)
    check("and it is stopped when the crew leaves",
          "stop_upkeep.set()" in _agent_src)

    # 주기는 «얼마나 자주 보는가»이지 «얼마나 자주 시키는가»가 아니다.
    # 주기만 줄이면 걷는 중인 사람에게 계획이 겹겹이 쌓이고, 밀린 계획이
    # 나중에 «이미 채워진 기계»를 다시 채우러 간다.
    # -- 인서터는 «집는 쪽»을 보고 선다 --------------------------------
    #
    # 방향 숫자가 가리키는 것은 놓는 곳이 아니라 집는 곳이다. 손으로 셀
    # 때마다 틀렸다 - 한 판에서만 네 번. 세는 대신 묻게 했다.
    from layout import arm, arm_dir, arm_drop
    check("an arm that picks from the north faces north",
          arm_dir((5, 5), (5, 4)) == 0)
    check("from the south, south", arm_dir((5, 5), (5, 6)) == 8)
    check("from the west, west", arm_dir((5, 5), (4, 5)) == 12)
    check("from the east, east", arm_dir((5, 5), (6, 5)) == 4)
    # 놓는 칸은 집는 쪽의 «반대편»이다. 벨트에서 집어 화로에 넣는 팔은
    # 벨트와 화로 사이에 선다.
    check("and it drops on the far side", arm_drop((5, 5), (5, 6)) == (5, 4))
    check("a belt tile below, a furnace tile above",
          arm((80, -80), (80, -81)) ==
          ("build", {"name": "burner-inserter", "x": 80, "y": -80,
                     "direction": 0})
          and arm_drop((80, -80), (80, -81)) == (80, -79))
    _diag = None
    try:
        arm_dir((0, 0), (1, 1))
    except ValueError as exc:
        _diag = str(exc)
    check("and a diagonal is refused, not guessed", bool(_diag), repr(_diag))

    # -- 없는 것을 가리키는 계획은 «보내기 전에» 막는다 -----------------
    #
    # 한 세션에서 같은 실수를 세 번 했다. 하나가 지어야 할 것을 나머지가
    # 쓰도록, 여럿에게 «동시에» 일을 던진 것이다.
    #
    #     급유를 채굴기가 서기 전에   -> nothing with an inventory  x16
    #     출구를 벨트가 닿기 전에     -> 팔 열 개가 두 칸 떨어져 섬
    #     입고를 창고가 서기 전에     -> 돌 100을 든 채, 고리는 돌을 기다림
    #
    # 적어두는 것으로는 안 막혔다 - 플레이북에 이미 적혀 있었다.
    from orders import unmet
    _nothing = lambda at: False
    _plan = [("walk_to", {"x": 0, "y": 0}),
             ("insert", {"name": "coal", "x": 10, "y": 10, "count": 5})]
    check("a plan that reaches into nothing is caught",
          len(unmet(_plan, _nothing)) == 1)
    # 같은 계획이 «먼저 짓는» 것은 있는 것으로 친다. 안 그러면 상자를
    # 세우고 곧바로 채우는 멀쩡한 계획까지 막힌다.
    _builds = [("build", {"name": "iron-chest", "x": 10, "y": 10}),
               ("insert", {"name": "coal", "x": 10, "y": 10, "count": 5})]
    check("but building it first in the same plan is fine",
          unmet(_builds, _nothing) == [])
    # 칸 모서리와 엔티티 가운데는 0.5 어긋난다. 그만큼은 같은 자리다.
    _half = [("build", {"name": "iron-chest", "x": 10, "y": 10}),
             ("take", {"name": "coal", "x": 10.5, "y": 10.5, "count": 5})]
    check("and half a tile is the same place", unmet(_half, _nothing) == [])
    # 먼저 짓는 것이 «다른» 자리면 못 막는다.
    _elsewhere = [("build", {"name": "iron-chest", "x": 0, "y": 0}),
                  ("insert", {"name": "coal", "x": 10, "y": 10, "count": 5})]
    check("a build somewhere else does not excuse it",
          len(unmet(_elsewhere, _nothing)) == 1)
    # 이미 서 있으면 통과한다.
    check("and what is already standing passes",
          unmet(_plan, lambda at: True) == [])
    # 걷기.제작처럼 «아무것도 건드리지 않는» 단계는 보지 않는다.
    check("steps that touch nothing are not checked",
          unmet([("walk_to", {"x": 9, "y": 9}),
                 ("craft", {"recipe": "pipe", "count": 3})], _nothing) == [])

    check("the patrol only loads up whoever is idle",
          "def idle(" in _agent_src and "bridge.list()" in _agent_src
          and 'row.get("current") or row.get("queued")' in _agent_src)


    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

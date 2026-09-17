"""The crew: several AI characters listening to one human's orders in chat.

Layers, deliberately separated:

  mission.py      pure: the goal ladder and the request board
  plan/next_goal  pure: a world snapshot -> what is worth doing, best first
  brain.delegate  the crew chief: reads what the human wrote and splits it
  Crew            the only part that touches the game

Nothing here reads the human's words by matching keywords any more. A table of
words could not tell "stop" from "the drills have stopped", and a report of a
problem would halt the whole crew. Sentences go to the part that can read them.

Keeping the pure parts pure means the interesting logic is testable without a
running Factorio server, which matters because it is exactly the logic that is
hard to debug through a game window.

    python bridge/agent.py                  # two agents, working on their own
    python bridge/agent.py --agents 4       # four of them, one per resource
    python bridge/agent.py --manual         # wait for orders instead
    python bridge/agent.py --observer NAME  # put that player in the observer seat
"""

from __future__ import annotations

import argparse
import math
import queue
import re
import sys
import threading
import time
from itertools import zip_longest
from dataclasses import dataclass, field
from typing import Any

import brain
import mission
from client import Agent, AIBridge, RconError, TaskFailed

Step = tuple[str, dict]
Intent = tuple[str, dict]

# Call signs are ASCII so they survive Lua, JSON and chat without surprises.
# "1번" addressing exists for anyone who would rather not type them.
CALL_SIGNS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]

DRILL = "burner-mining-drill"
CHEST = "iron-chest"
DRILL_FUEL = 10


@dataclass
class Snapshot:
    tick: int = 0
    x: float = 0.0
    y: float = 0.0
    items: dict[str, int] = field(default_factory=dict)
    craftable: dict[str, int] = field(default_factory=dict)
    buildings: dict[str, dict] = field(default_factory=dict)
    resources: dict[str, dict] = field(default_factory=dict)
    humans: list[dict] = field(default_factory=list)
    mates: list[dict] = field(default_factory=list)
    researched: set[str] = field(default_factory=set)
    researching: str | None = None
    # 기관이 서 있는 것과 전기가 흐르는 것은 다르다. 물 없는 보일러에 물린
    # 기관은 밖에서 보면 멀쩡한 발전소와 똑같이 생겼다.
    powered: bool = False

    def have(self, item: str) -> int:
        return self.items.get(item, 0)

    def can_make(self, recipe: str, count: int = 1) -> bool:
        """Whether the game says this is hand-craftable right now.

        Asked rather than derived: the recipe tree, the intermediates and the
        research state all live in the game, and guessing at them is how an
        agent ends up announcing a build it cannot afford.
        """
        return self.craftable.get(recipe, 0) >= count

    def ore(self, name: str) -> dict | None:
        found = self.resources.get(name)
        return found.get("nearest") if found else None

    def building(self, name: str) -> dict | None:
        found = self.buildings.get(name)
        return found.get("nearest") if found else None

    def spots(self, name: str) -> list[dict]:
        """이 종류 건물이 서 있는 자리들, 가까운 순.

        가장 가까운 하나만 알면 화로가 셋이어도 넷이 같은 화로 앞에 줄을
        선다. 자리가 여럿이면 각자 자기 화로를 집을 수 있다.
        """
        found = self.buildings.get(name) or {}
        spots = found.get("spots")
        if isinstance(spots, dict):      # Lua 빈 테이블은 {} 로 온다
            spots = list(spots.values())
        if spots:
            return [{"x": p["x"], "y": p["y"]} for p in spots]
        near = found.get("nearest")
        return [near] if near else []

    def knows(self, technology: str) -> bool:
        return technology in self.researched


# ------------------------------------------------------------------ planning

FURNACE_FUEL = 5
SMELT_BATCH = 20
PLATES_FOR_TOOLS = 12   # enough to hand-craft a drill and a chest
STOCKPILE = 30
BACKOFF_SECONDS = 120

# 길이 없어 실패한 일감은 그 사람에게 오래 막아둔다. 호수는 다음 배차 때도
# 그 자리에 있다.
UNREACHABLE_QUIET = 900.0

# 같은 자리에서 길찾기가 이만큼 연달아 실패하면 갇힌 것으로 본다. 한 번은
# 운이 나쁜 것이고, 세 번은 지형이다.
STUCK_STRIKES = 3

# 창고에 이만큼 쌓였으면 그만 캐도 된다. 485분째에 돌이 48,099개 있는데
# 채굴기 22대가 돌로 꽉 찬 상자 앞에서 여전히 서 있었다. 캐는 것도 일이고
# 막힌 채로 서 있는 것도 자리다.
SURPLUS = 6000   # how long a failed kind of work stays off the ladder

# Each agent takes one resource so a crew does not all stand on the same patch.
FOCUS_ORDER = ["iron-ore", "coal", "copper-ore", "stone"]

# 2.0 opens its first technologies with an action rather than science packs:
# ten copper plates smelted opens electronics (circuits, lab, inserters), fifty
# iron plates opens steam power (pipes, boiler, engine, pump). Nothing else can
# start until those two are in, because the lab itself is behind electronics.
SMELT_FOR_TECH = [
    ("electronics", "copper-ore", "copper-plate"),
    ("steam-power", "iron-ore", "iron-plate"),
]
ORE_BATCH = 25


@dataclass
class Job:
    """One piece of work: either a queue of tasks, or a named routine.

    Automation cannot be expressed as a fixed step list - where the chest goes
    depends on what the drill says after it is built - so it is named here and
    carried out by the crew.

    `key` is what makes a crew a crew rather than a crowd. Two agents may not
    hold the same key at once, so the second one moves down the list instead of
    walking to the same ore tile as the first.
    """
    narration: str
    steps: list[Step] = field(default_factory=list)
    routine: str | None = None
    ore: str | None = None
    key: str = ""
    # 이 일이 먹는 재료. 모자라면 동료에게 부탁할 근거가 된다.
    needs: dict[str, int] = field(default_factory=dict)
    # 루틴이 손봐야 할 자리. 어느 채굴기인지 같은 것.
    at: dict | None = None


# 상자가 이 거리 안에 있으면 그 채굴기는 돌보는 사람이 있다고 본다.
# 2x2 채굴기의 산출 타일은 중심에서 1.5타일 안쪽이라 넉넉하게 잡았다.
CHEST_REACH = 2.5


# 한 번 걸어가서 몇 대까지 손볼 것인가. 너무 크게 묶으면 한 사람이 오래
# 붙들려 있고, 너무 작게 묶으면 같은 구역을 여러 번 왕복한다.
CLUSTER_REACH = 14
CLUSTER_MAX = 6


# 태스크 이름은 사람이 쓰는 말이 아니다. 배정표에 «mine x8»이라고 적으면
# 읽는 쪽에서 다시 번역해야 한다.
STEP_WORDS = {
    "mine": "채굴", "place": "건설", "insert": "넣기", "take": "꺼내기",
    "craft": "제작", "walk": "이동", "chop": "벌목", "demolish": "철거",
    "give": "전달", "rotate": "방향 전환", "drop": "내려놓기",
}


def blocked_by(answer: dict) -> tuple[str, list[tuple[str, int]]]:
    """계획이 어디서 막혔는지 «이유 한 마디»와 «모자란 목록»으로 나눈다.

    "못 구했습니다"는 보고가 아니다. 게임은 이미 무엇이 왜 모자란지 세 갈래로
    나눠서 답해준다 - 땅에서 캐야 하는 것(mine), 연구가 먼저인 것(locked),
    손으로는 못 만드는 것(blocked). 그 셋을 구분하지 않으면 다음에 무엇을
    할지도 정할 수 없다. 캘 수 있는 것이면 캐면 되고, 잠긴 것이면 캐봐야
    소용없다.
    """
    for key, why in (("locked", "연구가 먼저입니다"),
                     ("blocked", "손으로는 못 만듭니다"),
                     ("mine", "땅에서 캐와야 합니다")):
        short = {k: int(v) for k, v in (answer.get(key) or {}).items() if v}
        if short:
            return why, sorted(short.items())
    return "이유를 모르겠습니다", []


def worth_building(row: dict, floor: int = 6) -> tuple[bool, str]:
    """이 기계를 한 대 더 세울 때인가, 서 있는 것을 고칠 때인가.

    실측(259분째): 버너 채굴기 194대 중 도는 것은 24대였다. 101대는 상자가
    꽉 차서, 57대는 연료가 없어서 서 있었는데 무리는 계속 더 세우고 있었다.
    「세운 수」만 셌기 때문이다.

    스물넷이 도는데 백칠십이 서 있으면 문제는 부족이 아니라 막힘이다.
    한 대 더 세우는 것은 낭비를 한 대 더 세우는 것이다.

    floor 아래로는 이 판단을 하지 않는다. 세 대 중 한 대가 멈춘 것은
    막힘이 아니라 그냥 초반이다.
    """
    built = int(row.get("built") or 0)
    working = int(row.get("working") or 0)
    if built < floor:
        return True, ""
    if working >= built // 2:
        return True, ""
    why = row.get("why") or {}
    worst = max(why.items(), key=lambda kv: kv[1], default=("?", 0))
    return False, (f"{built}대 중 {working}대만 돕니다. "
                   f"가장 많은 이유는 {worst[0]} {worst[1]}대입니다")


# 싣는 곳과 붓는 곳이 이보다 멀면 한 사람의 일이 아니다. 실제로 200타일
# 떨어진 상자에서 실어 오라는 계획이 나왔고, 길을 못 찾아 다섯 번 헤매다
# 빈손으로 「no coal to insert」로 끝났다.
HAUL_REACH = 120.0


def carry_split(group: list, load: int, each: int) -> tuple[list, int]:
    """실을 수 있는 만큼으로 약속을 줄인다.

    같은 실수를 두 번 했다. 급유 상자 여섯 개를 채우겠다고 나서놓고 60개만
    싣고 가서 첫 상자에서 다 쓰고 끝났고, 채굴기 여섯 대에 넣겠다고 나서놓고
    40개만 싣고 가서 두 대 넣고 끝났다. 둘 다 「no coal to insert」로 남았다.

    여섯 대에 넣겠다고 말하고 둘만 넣느니, 처음부터 둘에게 넣겠다고 말하는
    편이 낫다. 약속과 짐은 같은 저울에 올려야 한다.
    """
    if each <= 0:
        return group, load
    fits = max(1, load // each)
    kept = group[:fits]
    return kept, min(load, each * len(kept))


def nearest_to(spots: list[dict], at: dict, least: int = 0,
               reach: float = HAUL_REACH) -> dict | None:
    """그 «일감에서» 가장 가까운 창고. 내가 아니라 일감이 기준이다.

    chest_stock 은 부르는 사람에게 가까운 순으로 돌려준다. 그래서 (92,6)에
    선 사람이 자기 옆 상자에서 석탄을 싣고 (-51,85)까지 걸어가라는 계획이
    나왔다 - 실제 로그가 «no path from 92.2,6.1 to -51,85»였다.

    싣는 곳과 붓는 곳이 200타일 떨어져 있으면 그건 한 사람의 일이 아니다.
    reach 밖이면 아예 없다고 답한다. 못 할 일을 배차하는 것보다 낫다.
    """
    best, best_d = None, reach * reach
    for spot in spots:
        if int(spot.get("count") or 0) < least:
            continue
        d = ((spot["x"] - at["x"]) ** 2 + (spot["y"] - at["y"]) ** 2)
        if d < best_d:
            best, best_d = spot, d
    return best


def spread_sites(sites: list[dict], want: int, gap: int = 2) -> list[dict]:
    """겹치지 않는 자리만 고른다. 목록은 이미 «오래 갈 순서»로 와 있다.

    drill_site 는 광석 칸마다 하나씩 자리를 만들어 돌려주는데, 광석 칸은
    서로 붙어 있어서 그 자리들도 거의 다 겹친다. 그대로 여덟 개를 세우려
    들면 첫 대를 놓은 순간 나머지 일곱이 «자리 없음»이 된다.

    버너 채굴기는 2x2 라 중심끼리 두 칸은 떨어져야 한다.
    """
    picked: list[dict] = []
    for site in sites:
        if len(picked) >= want:
            break
        if all(max(abs(site["x"] - p["x"]), abs(site["y"] - p["y"])) >= gap
               for p in picked):
            picked.append(site)
    return picked


def errand_label(steps: list) -> str:
    """맡긴 일을 사람이 읽을 수 있는 한 줄로 줄인다."""
    parts: list[str] = []
    for kind, params in steps:
        word = STEP_WORDS.get(kind, kind)
        what = params.get("name") or params.get("item") or params.get("ore")
        parts.append(f"{what} {word}" if what else word)
    squashed: list[str] = []
    for part in parts:
        if squashed and squashed[-1].startswith(part):
            count = squashed[-1][len(part):].strip("x ") or "1"
            squashed[-1] = f"{part} x{int(count) + 1}"
        else:
            squashed.append(part)
    return ", ".join(squashed[:4]) + (" …" if len(squashed) > 4 else "")


def interleave(groups: list[list]) -> list:
    """종류별 목록을 돌아가며 하나씩 뽑아 한 줄로 만든다.

    한 종류가 목록을 다 차지하면 나머지는 영영 차례가 오지 않는다. 실제로
    연료 보급 일감이 스물다섯 개 쌓여서, 창고 입고와 화로 거두기가 한 번도
    배차되지 않았다. 급한 순서는 종류 안에서 지키고, 종류끼리는 번갈아
    가져간다.
    """
    out = []
    for row in zip_longest(*groups):
        out.extend(item for item in row if item is not None)
    return out


def cluster(points: list[dict], reach: float = CLUSTER_REACH,
            cap: int = CLUSTER_MAX) -> list[list[dict]]:
    """가까이 모인 것끼리 묶는다. 묶음 안 순서는 가까운 순.

    채굴기 여섯 대가 한 광맥에 모여 있는데 여섯 번 따로 걸어가는 것이
    가장 흔한 낭비다. 씨앗에서 reach 안에 드는 것들을 한 묶음으로 끌어온다 -
    사슬처럼 이어 붙이면 묶음이 지도 반대편까지 번지므로, 거리는 언제나
    씨앗 기준으로 잰다.
    """
    left = list(points)
    groups: list[list[dict]] = []
    while left:
        seed = left.pop(0)
        group = [seed]
        rest = []
        for other in left:
            if len(group) < cap and \
                    (other["x"] - seed["x"]) ** 2 + (other["y"] - seed["y"]) ** 2 \
                    <= reach * reach:
                group.append(other)
            else:
                rest.append(other)
        left = rest
        groups.append(group)
    return groups


def orphan_drills(snap: Snapshot) -> list[dict]:
    """출구에 상자가 없는 채굴기들.

    상자 없는 채굴기는 광석을 땅바닥에 몇 개 떨구고 그대로 멈춘다. 멀쩡한
    기계가 서 있는 셈이라, 새 채굴기를 놓는 것보다 이쪽을 먼저 고쳐야 한다.
    """
    chests = snap.spots(CHEST)
    orphans = []
    for drill in snap.spots(DRILL):
        near = any((drill["x"] - c["x"]) ** 2 + (drill["y"] - c["y"]) ** 2
                   <= CHEST_REACH ** 2 for c in chests)
        if not near:
            orphans.append(drill)
    return orphans


# 화로는 돌 5개라 싸다. 상한이 8이었던 것이 259분 뒤의 상태를 만들었다 -
# 채굴기 194대가 화로 21대를 바라보고 있었고(정상 비율의 9.2배), 그래서
# 채굴기 101대가 «내놓을 데가 없어» 서 있는 옆에서 화로 21대가 굶었다.
# 캐는 능력이 모자란 적은 한 번도 없었다. 녹이는 능력이 모자랐다.
MAX_FURNACES = 60

# 버너 채굴기 0.25 광석/초, 돌 화로는 철광석 하나에 3.2초라 0.3125 광석/초.
# 화로가 살짝 빠르므로 «직결»이면 1 : 1 이다 - 드릴이 병목이라 화로를 더
# 붙여봐야 논다. 5:4 는 상자를 사이에 둘 때의 비율이고, 우리는 드릴을 화로에
# 바로 붙인다.
FURNACES_PER_DRILL = 1.0

# 화로는 2x2지만 전기 화로는 3x3이다. 3타일 간격으로 붙여 놓으면 나중에
# 전기 화로로 못 바꾼다. 4타일이면 그 자리에서 교체된다.
FURNACE_PITCH = 4

# 보일러 60 증기/초 : 증기기관 30 증기/초. 기관을 하나만 붙이면 보일러가
# 만든 증기의 절반을 버리면서 석탄은 전부 태운다.
ENGINES_PER_BOILER = 2

# 보일러는 0.45/s 로 태운다. 20개면 44초다.
BOILER_FUEL = 20

# small-electric-pole 은 7.5타일까지 배선이 닿는다. 여유를 두고 7로 잡는다.
POLE_REACH = 7
# 전봇대 한 개는 나무 1 + 구리선 2. 랩 한 대는 전자회로 10 + 기어 10 +
# 벨트 4 라, 118타일을 잇는 전봇대 열일곱 개가 랩 한 대보다 싸다.
# 실제로 «랩을 못 만들었습니다»에서 막혀 전력이 서지 못했다.
# 이보다 멀면 전선을 끄는 대신 소비하는 쪽을 발전소 옆으로 옮긴다.
# 118타일에 전봇대 18개는 구리판 18장과 나무 18개다. 랩 하나가 훨씬 싸고,
# 사람도 그렇게 한다 - 전기는 길게 끌지 않고 공장을 전기 쪽으로 붙인다.
MAX_POLE_RUN = 8


# 버너 드릴 5대가 돌 화로 4대를 채운다. 뒤집으면 화로 4대에 드릴 5대.
DRILLS_PER_FURNACE = 1.0

# 버너 드릴은 석탄을 손으로 넣어줘야 한다. 돌볼 수 있는 것보다 많이 지으면
# 멈춘 기계만 늘어난다 - 한 사람이 셋까지.
DRILLS_PER_AGENT = 6

# 한 번 걸어가서 몇 대를 세우는가. 한 대씩 세우러 다니면 걷는 시간이 짓는
# 시간보다 길다 - 사용자가 «1개만 건설한다»고 지적한 것이 이것이다.
DRILLS_PER_TRIP = 4


def drill_target(snap: Snapshot, crew: int) -> int:
    """채굴기를 몇 대까지 세울 것인가.

    화로가 요구하는 만큼 세우되, 손으로 연료를 넣어줄 수 있는 만큼만.
    드릴 4대로 화로 23대를 채우려던 것이 지금까지의 상태였다.
    """
    furnaces = snap.buildings.get("stone-furnace", {}).get("count", 0)
    wanted = math.ceil(furnaces * DRILLS_PER_FURNACE)
    return max(len(FOCUS_ORDER), min(crew * DRILLS_PER_AGENT, wanted))


def furnace_target(snap: Snapshot, crew: int) -> int:
    """화로를 몇 대까지 세울 것인가.

    손으로 나르는 동안에는 사람 수가 공급량이고, 채굴기가 돌기 시작하면
    채굴기 수가 공급량이다. 둘 중 큰 쪽을 따라간다.
    """
    drills = snap.buildings.get(DRILL, {}).get("count", 0)
    from_drills = math.ceil(drills * FURNACES_PER_DRILL)
    return max(1, min(MAX_FURNACES, max(crew, from_drills)))


def rebalance(health: dict) -> tuple[str, int, str] | None:
    """채굴기와 화로의 비율이 어긋났으면 무엇을 지어야 하는지 한 줄로.

    실측(259분째): 채굴기 194 : 화로 21 = 9.2 : 1. 바른 비율은 1 : 1 이다.
    이 상태에서 채굴기를 한 대 더 세우는 것은 아무 의미가 없다 - 캔 광석을
    받을 데가 없어서 서 있는 채굴기가 이미 101대다.

    싼 쪽을 늘린다. 화로는 돌 5개고 채굴기는 철판 3 + 기어 3 + 돌 1 이다.
    """
    drills = int((health.get(DRILL) or {}).get("built") or 0)
    furnaces = int((health.get("stone-furnace") or {}).get("built") or 0)
    if drills < 4 or furnaces >= drills:
        return None
    if drills < furnaces * 2:
        return None
    return ("stone-furnace", drills - furnaces,
            f"채굴기 {drills}대에 화로 {furnaces}대입니다. "
            f"바른 비율은 1:1이고, 지금은 캔 광석을 받을 데가 없습니다")


def plan(snap: Snapshot, focus: str = "iron-ore", crew: int = 1) -> list[Job]:
    """Everything worth doing right now, best first.

    Pure, and deliberately a *list*: the crew hands out different entries to
    different agents. A single "what should I do" answer is how three agents end
    up shoulder to shoulder on the same rock.
    """
    jobs: list[Job] = []
    furnaces = snap.spots("stone-furnace")
    furnace = furnaces[0] if furnaces else None
    drills = snap.buildings.get(DRILL, {}).get("count", 0)

    # --- infrastructure the whole crew shares ----------------------------
    # One furnace serves everybody, so only one agent should be building it.
    if not furnace:
        if snap.have("stone-furnace") >= 1:
            jobs.append(Job("화로를 설치합니다.", key="furnace", steps=[
                ("build", {"name": "stone-furnace", "x": snap.x + 3, "y": snap.y + 3,
                           "snap": True})
            ]))
        elif snap.can_make("stone-furnace"):
            jobs.append(Job("화로를 제작합니다.", key="furnace",
                            steps=[("craft", {"recipe": "stone-furnace", "count": 1})]))
        else:
            spot = snap.ore("stone")
            if spot:
                jobs.append(Job("돌부터 캐서 화로를 만들겠습니다.", key="furnace",
                                steps=[("mine", {**spot, "count": 5})]))

    # A lab is the gate to everything past the trigger technologies, and
    # crafting one is itself what unlocks the red science pack recipe.
    if snap.knows("electronics") and snap.knows("steam-power"):
        if snap.have("lab") < 1 and not snap.building("lab"):
            if snap.can_make("lab"):
                jobs.append(Job("랩을 제작합니다.", key="craft:lab",
                                steps=[("craft", {"recipe": "lab", "count": 1})]))
            elif snap.can_make("electronic-circuit", 10):
                jobs.append(Job("랩에 쓸 전자회로를 만듭니다.", key="craft:circuit",
                                steps=[("craft", {"recipe": "electronic-circuit", "count": 10})]))
        elif snap.have("lab") >= 1 and not snap.building("lab"):
            jobs.append(Job("랩을 설치합니다.", key="build:lab", steps=[
                ("build", {"name": "lab", "x": snap.x + 4, "y": snap.y - 4, "snap": True})
            ]))
        elif snap.building("lab") and not snap.powered:
            # «기관이 서 있는가»가 아니라 «전기가 흐르는가». 죽은 발전소를
            # 발전소로 세는 바람에 새로 짓지 않고 그대로 멈춰 있었다.
            jobs.append(Job("랩을 돌리려면 전력이 필요합니다.", key="power", routine="power"))

    # --- feed the smelting loop ------------------------------------------
    if snap.have("coal") < FURNACE_FUEL:
        spot = snap.ore("coal")
        if spot:
            jobs.append(Job("연료가 없습니다. 석탄 캐러 갑니다.", key="gather:coal",
                            steps=[("mine", {**spot, "count": 10})]))

    if snap.have("iron-plate") < PLATES_FOR_TOOLS:
        if snap.have("iron-ore") < SMELT_BATCH:
            spot = snap.ore("iron-ore")
            if spot:
                jobs.append(Job("철광석 캐러 갑니다.", key="gather:iron-ore",
                                steps=[("mine", {**spot, "count": SMELT_BATCH})]))
        else:
            # Keyed by the furnace, not by the agent: two agents stuffing one
            # furnace and both waiting for its output is not teamwork. 화로가
            # 여럿이면 일도 여럿이라, 각자 빈 화로를 집어간다.
            for spot in furnaces:
                jobs.append(Job("화로에 석탄과 철광석을 넣고 제련합니다.",
                                key=f"smelt:{spot['x']:.0f},{spot['y']:.0f}",
                                needs={"coal": FURNACE_FUEL, "iron-ore": SMELT_BATCH},
                                steps=[
                                    ("insert", {"name": "coal", "count": FURNACE_FUEL, **spot}),
                                    ("insert", {"name": "iron-ore", "count": SMELT_BATCH, **spot}),
                                    ("wait", {"ticks": 60 * 40}),
                                    ("take", {"name": "iron-plate", "count": SMELT_BATCH, **spot}),
                                ]))

    # 세워놓고 잊은 채굴기부터 되살린다. 상자 하나면 다시 도는 기계를
    # 두고 새 채굴기를 놓는 것은 철판 낭비다.
    for drill in orphan_drills(snap):
        jobs.append(Job(
            f"({drill['x']:.0f},{drill['y']:.0f}) 채굴기에 출구 상자가 없습니다. 달아주겠습니다.",
            key=f"rescue:{drill['x']:.0f},{drill['y']:.0f}",
            routine="rescue", at=drill, needs={CHEST: 1}))

    # --- mechanise: a drill beats hands ----------------------------------
    # A drill costs iron *and* stone (through the furnace in its recipe). Asking
    # the game whether it is affordable is the difference between building one
    # and announcing it forever while the craft fails.
    if snap.have(DRILL) >= 1 or (snap.can_make(DRILL) and snap.can_make(CHEST)):
        # Own patch first, then whatever else still lacks a drill. 한 광맥에
        # 한 대씩만 놓으면 화로 스물셋을 드릴 넷이 먹여야 한다.
        room = drill_target(snap, crew) - drills
        seat = 0
        for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
            if snap.ore(ore) and seat < room:
                jobs.append(Job(f"{ore} 자동 채굴을 준비하겠습니다.",
                                key=f"automate:{ore}:{drills + seat}",
                                routine="automate", ore=ore,
                                needs={DRILL: 1, CHEST: 1, "coal": DRILL_FUEL}))
                seat += 1
    elif snap.have("iron-plate") >= PLATES_FOR_TOOLS and not snap.can_make("stone-furnace"):
        spot = snap.ore("stone")
        if spot:
            jobs.append(Job("채굴기를 만들려면 돌이 더 필요합니다.", key="gather:stone",
                            steps=[("mine", {**spot, "count": 10})]))

    # --- climb the tech tree ---------------------------------------------
    # This is what "there is nothing to do" used to mean: stockpiling ore
    # forever while every machine stayed locked behind research nobody started.
    for tech, ore, plate in SMELT_FOR_TECH:
        if snap.knows(tech):
            continue
        if snap.have(ore) < ORE_BATCH:
            spot = snap.ore(ore)
            if spot:
                jobs.append(Job(f"{tech} 연구를 열려면 {ore}가 필요합니다.",
                                key=f"gather:{ore}",
                                steps=[("mine", {**spot, "count": ORE_BATCH,
                                                 "search_radius": 10,
                                                 "timeout_ticks": 60 * 60 * 5})]))
        elif furnace and snap.have("coal") >= FURNACE_FUEL:
            jobs.append(Job(f"{plate}를 제련합니다. ({tech} 연구가 열립니다)",
                            key=f"smelt:{plate}",
                            needs={"coal": FURNACE_FUEL, ore: ORE_BATCH},
                            steps=[
                                ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
                                ("insert", {"name": ore, "count": ORE_BATCH, **furnace}),
                                ("wait", {"ticks": 60 * 45}),
                                ("take", {"name": plate, "count": ORE_BATCH, **furnace}),
                            ]))

    # 공급량만큼 화로를 세운다. 줄을 서는 시간도, 노는 화로도 둘 다 손해다.
    # spots 는 MAX_SPOTS 에서 잘리고, 오래된 모드는 아예 주지 않는다. 몇
    # 개가 서 있는지는 count 가 안다 - 이걸 안 보면 이미 세운 화로를 못 세고
    # 영원히 하나씩 더 만든다.
    standing = snap.buildings.get("stone-furnace", {}).get("count", len(furnaces))
    want = furnace_target(snap, crew)
    if furnace and standing < want:
        nth = standing
        if snap.have("stone-furnace") >= 1:
            jobs.append(Job(f"화로를 하나 더 놓겠습니다 ({nth + 1}번째).",
                            key=f"furnace:{nth}", steps=[
                                ("build", {"name": "stone-furnace",
                                           "x": furnace["x"] + FURNACE_PITCH * (nth + 1),
                                           "y": furnace["y"], "snap": True})]))
        elif snap.can_make("stone-furnace"):
            jobs.append(Job("화로를 하나 더 만들겠습니다.", key=f"furnace:{nth}",
                            needs={"stone": 5},
                            steps=[("craft", {"recipe": "stone-furnace", "count": 1})]))

    # --- keep patches stocked, starting with this agent's own ------------
    # 공장은 끊임없이 돌아야 하고, 그러려면 광석이 끊임없이 들어와야 한다.
    # 예전에는 서른 개를 채우면 멈췄다 - 그래서 여섯 명 중 셋이 가방에
    # 광석을 안고 서 있었다. 화로가 놀고 있으면 더 캔다.
    hungry = snap.have("coal") < FURNACE_FUEL * 4
    for ore in [focus] + [o for o in FOCUS_ORDER if o != focus]:
        spot = snap.ore(ore)
        if not spot:
            continue
        if snap.have(ore) >= STOCKPILE and not (ore == "coal" and hungry):
            continue
        jobs.append(Job(f"{ore}를 더 캐 오겠습니다.", key=f"stock:{ore}", steps=[
            ("mine", {**spot, "count": STOCKPILE, "search_radius": 10,
                      "timeout_ticks": 60 * 60 * 5})
        ]))

    # Two jobs with the same key would be one job as far as the crew is
    # concerned: claiming the first silently hides the second. Keep the
    # higher-priority one.
    unique, seen = [], set()
    for job in jobs:
        if job.key in seen:
            continue
        seen.add(job.key)
        unique.append(job)
    return unique


def missing_item(kind: str, error: str, params: dict | None = None) -> str | None:
    """실패 메시지에서 «무엇이 없었는지»를 뽑아낸다.

    부탁은 여기서 시작한다. 짐작으로 «아마 석탄이 없겠지»라고 붙이는 부탁은
    틀릴 수 있지만, 방금 실제로 시도했다가 실패한 것은 틀릴 수가 없다.
    """
    text = (error or "").strip()
    params = params or {}

    # "no coal to insert" / "no iron-chest in inventory"
    for tail in (" to insert", " in inventory"):
        if text.startswith("no ") and text.endswith(tail):
            return text[3: -len(tail)].strip() or None

    # "nothing to give: no coal"
    if text.startswith("nothing to give: no "):
        return text[len("nothing to give: no "):].strip() or None

    # 광맥이 말라버린 경우. 어디에 있었는지는 params가 안다.
    if kind == "mine" and text.startswith("no resource near"):
        return params.get("name") or None

    return None


# 사다리의 단마다 «이걸 손에 넣으면 올라간다»는 물건이 있다. 그 물건 하나만
# 정해주면 나머지는 게임의 레시피 그래프가 알려준다.
STAGE_TARGET = {
    "furnace": ("stone-furnace", 1),
    "lab": ("lab", 1),
    "power": ("steam-engine", ENGINES_PER_BOILER),
    "red-science": ("automation-science-pack", 10),
    "assembler": ("assembling-machine-1", 1),
    "belts": ("transport-belt", 20),
}


def chain_job(answer: dict, target: str, furnace: dict | None) -> Job | None:
    """게임이 «지금 이것부터»라고 답한 것을 실제 작업으로 옮긴다.

    answer 는 mod 의 plan_item 이 돌려준 것이다. steps 는 깊은 것부터 쌓여
    있으므로 첫 번째가 지금 당장 할 수 있는 일이다. 아무것도 못 하면
    mine 에 적힌 것을 캐러 간다 - 사슬의 맨 밑이 땅이라는 뜻이다.
    """
    if not isinstance(answer, dict) or answer.get("error"):
        return None

    # 창고에 있는 것부터 꺼낸다. 이미 캔 것을 두고 다시 캐러 가는 것이
    # 가장 비싼 낭비다 - 상자에 철판 819장이 있는데 계획은 「철광석을 캐라」
    # 로 끝나고 있었다.
    errands = _as_rows(answer.get("fetch"))
    if errands:
        head = errands[0]
        listed = ", ".join(f"{e['name']} {int(e['count'])}개" for e in errands[:3])
        return Job(f"{target}에 필요한 {listed}은(는) 창고에 있습니다. 꺼내오겠습니다.",
                   key=f"fetch:{target}:{head['x']:.0f},{head['y']:.0f}",
                   steps=[("take", {"name": e["name"], "count": int(e["count"]),
                                    "x": e["x"], "y": e["y"]})
                          for e in errands[:3]],
                   at={"x": head["x"], "y": head["y"]})

    steps = _as_rows(answer.get("steps"))
    for step in steps:
        name = step.get("name")
        count = int(step.get("count") or 1)
        if step.get("action") == "smelt":
            if not furnace:
                continue
            # 넣고 바로 떠난다. 예전에는 여기에 wait 와 take 가 붙어 있어서,
            # 여섯 명 중 다섯이 각자 화로 앞에 서서 1분씩 아무것도 안 했다.
            # 사람은 광석을 넣고 딴 일을 하러 간다. 다 녹은 것은 나중에
            # 누구든 지나가는 사람이 거둬간다.
            return Job(f"{target}을(를) 만들려면 {name}이(가) 필요합니다. 화로에 넣겠습니다.",
                       key=f"chain:smelt:{name}@{furnace['x']:.0f},{furnace['y']:.0f}",
                       needs={"coal": FURNACE_FUEL},
                       steps=[
                           ("insert", {"name": "coal", "count": FURNACE_FUEL, **furnace}),
                           ("insert", {"name": step.get("input") or _ore_for(name),
                                       "count": int(step.get("input_count") or count),
                                       **furnace}),
                       ])
        if step.get("hand"):
            return Job(f"{target}을(를) 만들려면 {name} {count}개가 필요합니다. 제작하겠습니다.",
                       key=f"chain:craft:{name}",
                       steps=[("craft", {"recipe": step.get("recipe") or name,
                                         "count": count})])

    return None


# 화로가 다 녹이기 전에 꺼내러 가면 광석은 화로 안에 남고 손은 빈 채로
# 돌아온다. 게임이 알려준 시간에 여유를 더해서 기다린다.
SMELT_MARGIN = 8.0

# 화로 하나에 이만큼 쌓였으면 거두러 간다. 두세 개씩 집으러 왔다 갔다 하면
# 걷는 시간이 녹이는 시간보다 길어진다.
HARVEST_MIN = 10

# 화로가 받아주는 것들. 노는 화로에 무엇을 넣을지 고를 때 쓴다.
SMELTABLE = ("iron-ore", "copper-ore", "stone")

# 채굴기 출구에 화로를 바로 붙일 만한 광석. 채굴기가 앞 칸에 떨구면 그대로
# 제련이 시작되므로 사람이 퍼 나를 일이 없어진다. 돌은 화로에 넣을 일이
# 드물어 상자로 받는다.
SMELTED_BY_FURNACE = ("iron-ore", "copper-ore")

# 연구가 걸려 있는지 보는 주기. 매 틱 물어볼 일은 아니지만, 비어 있는 채로
# 오래 두면 랩이 그만큼 논다.
RESEARCH_CHECK = 20.0

# 둥지를 살피는 주기와, 이 거리 안이면 알리는 기준. 공해가 퍼지는 속도에
# 비하면 30초는 충분히 촘촘하다.
THREAT_CHECK = 30.0
NEST_ALARM = 200

# 미리 세워둘 터렛 수와 한 대에 넣을 탄약. 습격이 온 다음에 짓기 시작하면
# 이미 늦다 - 터렛은 낭비가 아니라 대비다.
TURRET_TARGET = 4
TURRET_AMMO = 10
# 기지 중심에서 터렛까지. 공해가 나가는 쪽이 습격이 들어오는 쪽이다.
TURRET_RING = 18
# 연구는 이 순서로 고른다. 방어가 과학팩보다 뒤로 밀리면, 둥지가 가까워진
# 다음에야 터렛을 만들기 시작한다.
RESEARCH_ORDER = ("military", "automation", "logistics", "electric-mining-drill",
                  "steel-processing", "logistic-science-pack")

# 같은 사람이 같은 말을 이 시간 안에 되풀이하면 삼킨다.
ECHO_QUIET = 60.0

# 규칙이 할 일을 못 찾았을 때만 모델에게 묻는다. 이 간격 안에 두 번 묻지
# 않는다 - 막혀 있는 상태는 몇 초 만에 바뀌지 않는다.
# 배차 주기. 매 틱 무리 전체를 훑으면 RCON 왕복이 아깝고, 너무 뜸하면
# 놀고 있는 사람이 생긴다.
DISPATCH_INTERVAL = 10.0
# 한 번에 한 사람이 받아 가는 석탄.
HAUL_BATCH = 40

# 가방에 이만큼 넘게 쌓이면 공용 창고에 넣는다. 각자 안고 다니면 필요한
# 사람에게 가지 않는다 - 옆 사람이 철광석 150개를 든 채로 «철광석이
# 필요합니다»라고 말하는 일이 생긴다.
KEEP_IN_HAND = 50
DEPOT_MIN = 20

# 연료 떨어진 기계가 이만큼이면 «굶고 있다»고 본다. 그럴 때는 광석보다
# 석탄이 먼저다.
STARVING = 4

# 같은 것을 이만큼이 부탁하면 그건 부탁이 아니라 부족이다. 없는 사람끼리
# 주고받아 봐야 아무것도 안 채워진다 - 늘려야 한다.
SHORTAGE_VOICES = 3

# 한 번에 세울 급유 장치 수, 그리고 상자에 부어둘 석탄.
# 버너 인서터는 자기가 나르는 게 연료일 때만 자급한다. 석탄을 나르는
# 인서터는 영원히 돌고, 광석을 나르는 인서터는 손이 계속 간다 - 그래서
# 급유만 자동화하고 광석은 아직 손으로 옮긴다.
RIGS_PER_TRIP = 3
RIG_COAL = 50

IDLE_ASK_QUIET = 150.0
# 그럴 때 쓰는 모델. 반장이 지시를 쪼갤 때와는 판단의 무게가 다르고,
# 자주 일어나는 일이라 싼 쪽이 맞다.
IDLE_MODEL = "haiku"


def _smelt_ticks(step: dict, count: int) -> int:
    seconds = float(step.get("seconds") or 0) or (count * 3.2)
    return int(60 * (seconds + SMELT_MARGIN))


def _ore_for(plate: str) -> str:
    """원료 이름이 안 왔을 때의 마지막 수단.

    보통은 게임이 step.input 으로 알려준다. 이 표는 옛 모드가 붙어 있을 때만
    쓰이고, 돌벽돌처럼 «돌 2개에 벽돌 1개»인 레시피에서는 개수를 못 맞춘다.
    """
    return {"iron-plate": "iron-ore", "copper-plate": "copper-ore",
            "stone-brick": "stone"}.get(plate, plate)


def _as_rows(value: Any) -> list[dict]:
    """Lua 의 빈 테이블은 {} 로 오고, 채워진 배열은 리스트로 온다."""
    if isinstance(value, dict):
        return list(value.values())
    return value or []


def next_goal(snap: Snapshot, focus: str = "iron-ore",
              blocked: frozenset[str] = frozenset(),
              taken: frozenset[str] = frozenset(),
              crew: int = 1) -> Job | None:
    """The best job this agent may take.

    `blocked` is what has just failed for it - re-proposing that is how one
    unreachable furnace fills the chat with the same line forever. `taken` is
    what the rest of the crew is already doing.
    """
    for job in plan(snap, focus, crew):
        if job.key in taken:
            continue
        # Failures are recorded by task type ("mine", "insert", ...) as well as
        # by job key, because that is what the game reports back.
        if job.key in blocked or (job.routine or "") in blocked:
            continue
        if job.steps and job.steps[0][0] in blocked:
            continue
        return job
    return None


# -------------------------------------------------------------------- worker

class Worker:
    """One agent, plus the bookkeeping that belongs to it alone."""

    def __init__(self, handle: Agent, focus: str = "iron-ore") -> None:
        self.handle = handle
        self.name = handle.name
        self.focus = focus
        self.autopilot = True
        self.watching: list[int] = []
        self.said_idle = False
        # One slow job (an LLM call, a build-out) at a time per agent.
        self.slot = threading.Semaphore(1)
        # What has just failed, and until when it stays off the table.
        self.blocked: dict[str, float] = {}
        # The job key this agent currently holds, so the crew can hand the rest
        # of the list to somebody else.
        self.job_key: str | None = None
        # 갇혔는지 세는 자리. 「어디서」 실패했는지까지 기억해야 한다 -
        # 움직이면서 한 번씩 실패하는 것과 한자리에 못 박힌 것은 다르다.
        self.lost_at: tuple[int, int] | None = None
        self.lost_count = 0
        # 지금 대신 해주고 있는 부탁과, 그걸 실어나르는 태스크 번호.
        self.errand: tuple[int, object] | None = None
        # 막혀서 모델에게 물어본 마지막 시각.
        self.asked_at = 0.0

    def snapshot(self, radius: int = 200) -> Snapshot:
        world = self.handle.observe(radius=radius)
        inventory = self.handle.inventory()
        research = self.handle.bridge.research_state()
        try:
            power = self.handle.bridge.power_status(self.name)
        except RconError:
            power = {}
        humans = world.get("humans") or {}
        mates = world.get("agents") or {}
        return Snapshot(
            tick=world.get("tick", 0),
            x=world.get("position", {}).get("x", 0.0),
            y=world.get("position", {}).get("y", 0.0),
            items=inventory.get("items") or {},
            craftable=inventory.get("craftable") or {},
            buildings=world.get("buildings") or {},
            resources=world.get("resources") or {},
            humans=list(humans.values()) if isinstance(humans, dict) else humans,
            mates=list(mates.values()) if isinstance(mates, dict) else mates,
            researched=research["researched"],
            researching=research.get("current"),
            powered=bool(power.get("powered")),
        )

    def block(self, kind: str, seconds: float = BACKOFF_SECONDS) -> None:
        self.blocked[kind] = time.monotonic() + seconds

    def blocked_now(self) -> frozenset[str]:
        now = time.monotonic()
        self.blocked = {k: t for k, t in self.blocked.items() if t > now}
        return frozenset(self.blocked)


# ---------------------------------------------------------------------- crew

class Crew:
    def __init__(self, bridge: AIBridge, autopilot: bool = True,
                 use_llm: bool = True) -> None:
        self.bridge = bridge
        self.autopilot = autopilot
        self.use_llm = use_llm
        self.since_tick: int | None = None
        self.workers: dict[str, Worker] = {}
        self.thoughts: queue.Queue[tuple[str, str, list[Step]]] = queue.Queue()
        # 반장이 나눠준 결과가 여기로 온다. LLM 호출은 6초쯤 걸려서 채팅을
        # 읽는 루프를 멈춰 세울 수 없다.
        self.orders: queue.Queue[tuple[str, list, list, str]] = queue.Queue()
        # 반장은 한 번에 한 지시만 나눈다. 두 지시가 겹쳐 들어오면 뒤엣것이
        # 앞엣것의 배정을 지워버린다.
        self.chief = threading.Semaphore(1)
        # job key -> agent holding it. This is the whole of the orchestration:
        # nobody may start work someone else has already taken.
        self.claims: dict[str, str] = {}
        # 부탁이 오가는 곳, 그리고 누가 무엇을 쥐고 있는지에 대한 마지막 기억.
        # 남의 인벤토리는 스냅샷을 찍을 때만 알 수 있으니, 찍을 때마다 적어둔다.
        self.board = mission.Board()
        self.stock: dict[str, dict[str, int]] = {}
        self.stage: str | None = None
        self.goal_line = f"목표 {mission.GOAL}"
        self.dispatched_at = 0.0
        # 이번 틱에 찍은 스냅샷들. 배차가 무리 전체를 볼 때 쓴다.
        self.snaps: dict[str, Snapshot] = {}
        # 연료가 떨어진 기계가 얼마나 되는지. 굶는 판에 광석 채굴기를 더
        # 놓으면 굶는 기계만 늘어난다.
        self.starving = False
        self.research_checked = 0.0
        self.threat_checked = 0.0
        self.danger: dict = {}
        self.danger_said: str | None = None
        self.research_said: str | None = None
        # 방금 한 말들. 같은 줄을 되풀이하지 않기 위한 것.
        self.echoes: dict[tuple[str, str], float] = {}
        self.shown: tuple[str, tuple[str, ...]] | None = None

    # -- roster -----------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self.workers)

    def adopt(self, name: str) -> Worker:
        focus = FOCUS_ORDER[len(self.workers) % len(FOCUS_ORDER)]
        worker = Worker(self.bridge.agent(name), focus=focus)
        worker.autopilot = self.autopilot
        self.workers[name] = worker
        # The panel shows this, so the mod has to be told.
        try:
            self.bridge.set_focus(name, focus)
        except RconError:
            pass
        return worker

    def hire(self, name: str | None = None) -> Worker | None:
        if name is None:
            for sign in CALL_SIGNS:
                if sign not in self.workers:
                    name = sign
                    break
        if name is None:
            self.say("자리가 다 찼습니다.")
            return None
        try:
            self.bridge.spawn(name)
        except RconError as exc:
            self.say(f"에이전트를 못 만들겠습니다: {exc}")
            return None
        worker = self.adopt(name)
        self.say(f"{name} 합류했습니다.", who=name)
        return worker

    def fire(self, name: str) -> None:
        self.board.release(name)
        self.stock.pop(name, None)
        self.bridge.remove(name)
        worker = self.workers.pop(name, None)
        if worker:
            self.release(worker)
        self.say(f"{name} 내보냈습니다.")

    def sync_roster(self) -> None:
        """Take over whatever the server already has, so a restart keeps them."""
        for state in self.bridge.list():
            if state["name"] not in self.workers:
                self.adopt(state["name"])

    # -- speech -----------------------------------------------------------

    def say(self, text: str, who: str = "AI") -> None:
        # 같은 사람이 같은 말을 반복하면 대화창이 그 한 줄로 가득 찬다.
        # «연료가 떨어져 멈췄습니다»가 다섯 번 연속으로 찍혀 있었다.
        now = time.monotonic()
        said = self.echoes.get((who, text))
        if said and now - said < ECHO_QUIET:
            print(f"[{who}] {text}  (반복 생략)")
            return
        self.echoes = {k: t for k, t in self.echoes.items() if now - t < ECHO_QUIET}
        self.echoes[(who, text)] = now
        print(f"[{who}] {text}")
        self.bridge.say(text, who=who)

    # -- who is doing what -------------------------------------------------

    def taken(self) -> frozenset[str]:
        return frozenset(self.claims)

    def claim(self, worker: Worker, key: str) -> None:
        self.release(worker)
        if key:
            self.claims[key] = worker.name
            worker.job_key = key

    def release(self, worker: Worker) -> None:
        if worker.job_key:
            self.claims.pop(worker.job_key, None)
            worker.job_key = None

    def seat(self, worker: Worker) -> tuple[float, float]:
        """이 캐릭터가 지금 서 있는 곳. 못 물어보면 원점으로 친다."""
        try:
            pos = worker.handle.observe(radius=1).get("position") or {}
        except RconError:
            return (0.0, 0.0)
        return (pos.get("x", 0.0), pos.get("y", 0.0))

    def targets(self, target: str | None) -> list[Worker]:
        """Who carries out an order.

        An unaddressed order goes to the whole crew. Having hired several
        agents, watching one of them walk off alone is not what anybody meant;
        naming one is how you ask for that.
        """
        if target and target in self.workers:
            return [self.workers[target]]
        return list(self.workers.values())

    # -- the slow brain ---------------------------------------------------

    def ask_when_stuck(self, worker: Worker, snap: Snapshot) -> bool:
        """규칙이 할 일을 못 찾았을 때만 모델에게 묻는다.

        봇마다 모델을 상시로 붙이는 것과는 다르다. 정비와 보급은 초 단위로
        판단해야 하는데 한 번 왕복이 6초라, 상시로 붙이면 느려지기만 한다.
        규칙이 막혔을 때는 사정이 반대다 - 어차피 서 있을 거라면 6초를
        들여서라도 물어보는 편이 낫다.
        """
        if not self.use_llm:
            return False
        now = time.monotonic()
        if now - worker.asked_at < IDLE_ASK_QUIET:
            return False
        if not worker.slot.acquire(blocking=False):
            return False
        worker.asked_at = now

        here = mission.stage_of(snap)
        question = (
            f"규칙으로는 지금 할 일을 못 찾았다. 목표는 «{here.title}»이고, "
            f"이 공장을 그쪽으로 한 걸음 옮기는 일을 하나만 정해서 해라. "
            f"할 만한 게 정말 없으면 steps 를 비우고 이유를 말해라."
        )

        def think() -> None:
            try:
                answer = brain.think(question, snap, agent_name=worker.name,
                                     model=IDLE_MODEL)
                if answer and (answer[0] or answer[1]):
                    self.thoughts.put((worker.name, answer[0], answer[1]))
            except Exception as exc:  # noqa: BLE001 - 죽은 스레드도 답은 해야 한다
                print(f"[warn] idle brain failed: {exc!r}", file=sys.stderr)
            finally:
                worker.slot.release()

        threading.Thread(target=think, daemon=True).start()
        return True

    def ask_llm(self, worker: Worker, message: str, snap: Snapshot) -> None:
        if not worker.slot.acquire(blocking=False):
            self.say("아직 앞의 말을 생각하는 중입니다.", who=worker.name)
            return

        def think() -> None:
            try:
                answer = brain.think(message, snap, agent_name=worker.name)
                if answer is None:
                    self.thoughts.put((worker.name, "무슨 말인지 모르겠습니다.", []))
                else:
                    self.thoughts.put((worker.name, answer[0], answer[1]))
            except Exception as exc:  # noqa: BLE001 - a dead thread must still answer
                print(f"[warn] brain failed: {exc!r}", file=sys.stderr)
                self.thoughts.put((worker.name, "생각하다 문제가 생겼습니다.", []))
            finally:
                worker.slot.release()

        threading.Thread(target=think, daemon=True).start()

    def delegate(self, message: str, speaker: str) -> None:
        """지시 하나를 보고 캐릭터들에게 나눠준다.

        예전에는 알아듣지 못한 문장을 한 명에게만 물어봤다. 그 한 명이
        혼자 걸어가 일하고 나머지 셋은 서 있었다. 이제는 무리 전체를 한 장에
        적어 보내고, 겹치지 않게 쪼갠 배정을 받는다.
        """
        if not self.use_llm or not self.workers:
            return
        if not self.chief.acquire(blocking=False):
            self.say("앞의 지시를 아직 나누는 중입니다. 잠시만요.")
            return

        # 나누는 데 6초쯤 걸린다. 그동안 아무 말이 없으면 사람은 무시당한
        # 줄 안다. 받았다는 말이 먼저고, 어떻게 나눴는지는 정해지면 말한다.
        self.say(f"{speaker}님 말씀 받았습니다. 누가 뭘 할지 정해서 알려드리겠습니다.")

        fleet: list[dict] = []
        view: Snapshot | None = None
        for worker in self.workers.values():
            try:
                snap = worker.snapshot()
                busy = worker.handle.busy()
            except RconError:
                continue
            view = view or snap
            self.stock[worker.name] = dict(snap.items)
            fleet.append({
                "name": worker.name, "x": snap.x, "y": snap.y,
                "focus": worker.focus, "items": snap.items,
                "doing": (worker.job_key or "작업 중") if busy else "",
            })

        if not fleet or view is None:
            self.chief.release()
            return

        # 반장이 «없습니다»라고 말하기 전에 창고 안을 보여준다. 사람이
        # «상자에 석탄 많이 남았잖아»라고 했는데 «석탄이 없습니다»로 답한
        # 적이 있다. 반장이 본 것은 각자의 가방뿐이었다.
        shelves: list[dict] = []
        try:
            answer = self.bridge.stores(next(iter(self.workers)))
            shelves = _as_rows(answer.get("chests"))
        except (RconError, StopIteration):
            pass

        def think() -> None:
            try:
                answer = brain.delegate(message, view, fleet, stores=shelves)
                if answer is None:
                    self.orders.put(("무슨 말인지 모르겠습니다.", [], [], speaker))
                else:
                    self.orders.put((*answer, speaker))
            except Exception as exc:  # noqa: BLE001 - a dead thread must still answer
                print(f"[warn] delegate failed: {exc!r}", file=sys.stderr)
                self.orders.put(("지시를 나누다 문제가 생겼습니다.", [], [], speaker))
            finally:
                self.chief.release()

        threading.Thread(target=think, daemon=True).start()

    # 반장이 내릴 수 있는 운영 명령. 앞의 것들은 무리 전체에 대한 것이고,
    # 뒤의 것들은 캐릭터 한 명에게 간다.
    CREW_COMMANDS = {"panel", "save", "add_agent", "remove_agent",
                     "list_agents", "observer", "unobserver"}

    def run_command(self, order: dict, speaker: str) -> None:
        """반장이 내린 운영 명령을 실행한다.

        steps 로 표현할 수 없는 것들 - 저장, 관찰자 전환, 인원 조절 - 만
        여기로 온다. 이미 있던 인텐트 처리기를 그대로 쓴다.
        """
        name = order.get("name")
        if not name:
            return
        params = {k: v for k, v in order.items() if k in ("count", "ore")}
        intent: Intent = (name, params)

        if name in self.CREW_COMMANDS:
            self.handle_crew(intent, speaker, order.get("agent"))
            return

        who = order.get("agent")
        crew = [self.workers[who]] if who in self.workers else list(self.workers.values())
        for worker in crew:
            self.handle(worker, intent, speaker)

    def collect_orders(self) -> None:
        """나눠진 배정을 실제로 꽂는다.

        취소가 먼저다. 하던 일을 남겨두고 새 일을 큐에 얹으면, 사람이 방금
        시킨 것이 앞의 일이 끝난 뒤에야 시작된다.
        """
        while True:
            try:
                plan, commands, assignments, speaker = self.orders.get_nowait()
            except queue.Empty:
                return
            if plan:
                self.say(plan)
            for order in commands:
                self.run_command(order, speaker)

            # 누구에게 무엇을 맡겼는지 한 줄로 되돌려준다. 사람이 시킨
            # 다음에 알 수 있는 것은 «받았다»뿐이었고, 그래서 여덟 명이
            # 흩어져도 무엇이 어디로 갔는지 볼 방법이 없었다. 반장이 하겠다고
            # «말한» 것이 아니라 실제로 «꽂은» 것을 적는다 - 둘은 다르다.
            handed: list[str] = []
            for name, say, steps in assignments:
                worker = self.workers.get(name)
                if not worker:
                    continue
                try:
                    worker.handle.cancel()
                except RconError:
                    pass
                worker.watching = []
                worker.errand = None
                self.board.release(name)
                self.release(worker)
                worker.said_idle = False
                if say:
                    self.say(say, who=name)
                if not steps:
                    handed.append(f"{name}: 하던 일 정리")
                    continue
                try:
                    worker.watching = worker.handle.submit_plan(steps)
                    handed.append(f"{name}: {errand_label(steps)}")
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)
                    handed.append(f"{name}: 못 받음")

            if handed:
                spare = [w for w in self.workers
                         if not any(row.startswith(w + ":") for row in handed)]
                line = "배정했습니다 — " + " / ".join(handed)
                if spare:
                    line += f" / 나머지({', '.join(spare)})는 하던 일 계속합니다."
                self.say(line)
            elif not commands:
                self.say("이번 지시로는 새로 맡길 일이 없었습니다. 하던 일을 계속합니다.")

    def collect_thoughts(self) -> None:
        while True:
            try:
                name, say, steps = self.thoughts.get_nowait()
            except queue.Empty:
                return
            worker = self.workers.get(name)
            if say:
                self.say(say, who=name)
            if steps and worker:
                try:
                    worker.watching = worker.handle.submit_plan(steps)
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)

    # -- automation --------------------------------------------------------

    def obtain(self, worker: Worker, item: str, count: int = 1,
               rounds: int = 6) -> bool:
        """이 아이템을 count 개 손에 넣는다. 없으면 만들고, 재료가 없으면 구해온다.

        ensure() 는 «만들 수 있으면 만든다»까지였다. 전봇대는 나무 1개를
        요구하는데 나무가 없으면 그대로 포기했고, 그래서 랩을 세워두고
        전력을 영영 못 만들었다. 무엇이 모자란지는 게임이 사슬로 답해주므로,
        그 사슬을 여기서 한 단씩 밟아 내려간다.

        rounds 는 안전장치다. 사슬이 끝나지 않는 경우(연구가 막혔다든가)
        영원히 도는 것보다 실패하는 편이 낫다.
        """
        name = worker.name
        replanned = False
        for _ in range(rounds):
            if worker.handle.items().get(item, 0) >= count:
                return True
            try:
                answer = self.bridge.plan_item(name, item, count)
            except RconError:
                return False
            if answer.get("error"):
                self.say(f"{item}을(를) 어떻게 만드는지 모르겠습니다: "
                         f"{answer['error']}", who=name)
                return False

            # 창고에 있는 것을 꺼내오는 것이 맨 먼저다. 캐야 할 것이 없는데
            # 캐러 가는 일이 없도록 - 상자에 철판 819장이 있는데 철광석을
            # 캐러 보내고 있었다.
            errands = _as_rows(answer.get("fetch"))
            if errands:
                got = False
                for shelf in errands[:3]:
                    try:
                        worker.handle.take(shelf["name"], shelf["x"], shelf["y"],
                                           count=int(shelf["count"]),
                                           timeout=300, timeout_ticks=60 * 60 * 3)
                        got = True
                    except TaskFailed:
                        continue
                if got:
                    continue

            steps = _as_rows(answer.get("steps"))
            step = next((st for st in steps if st.get("hand")), None)
            if step:
                try:
                    worker.handle.craft(step.get("recipe") or step["name"],
                                        count=int(step.get("count") or 1), timeout=240)
                    continue
                except TaskFailed as exc:
                    # 계획은 «된다»고 했는데 실제로는 안 됐다. 그 사이에
                    # 재료가 창고로 들어갔거나 동료가 가져갔다는 뜻이다.
                    # 포기하지 않고 지금 상태로 다시 물어본다 - 한 번만.
                    if replanned:
                        self.say(f"{step['name']} 제작이 두 번 막혔습니다: "
                                 f"{exc.task.get('error')}", who=name)
                        return False
                    replanned = True
                    continue

            snap = worker.snapshot()
            wanted = answer.get("mine") or {}
            if "wood" in wanted:
                try:
                    worker.handle.chop(snap.x, snap.y,
                                       count=max(4, min(int(wanted["wood"]) * 2, 40)),
                                       timeout=300, timeout_ticks=60 * 60 * 3)
                    continue
                except TaskFailed:
                    return False

            smelt = next((st for st in steps if st.get("action") == "smelt"), None)
            if smelt and answer.get("furnace"):
                furnace = answer["furnace"]
                try:
                    worker.handle.insert("coal", furnace["x"], furnace["y"],
                                         count=FURNACE_FUEL, timeout=180)
                    worker.handle.insert(smelt.get("input") or smelt["name"],
                                         furnace["x"], furnace["y"],
                                         count=int(smelt.get("input_count") or 1),
                                         timeout=180)
                except TaskFailed:
                    return False
                # 녹는 동안 기다리는 대신, 다음 바퀴에서 다시 물어본다.
                time.sleep(float(smelt.get("seconds") or 10) + SMELT_MARGIN)
                try:
                    worker.handle.take(smelt["name"], furnace["x"], furnace["y"],
                                       count=int(smelt.get("count") or 1), timeout=180)
                except TaskFailed:
                    pass
                continue

            # 캐러 가기 전에 창고를 먼저 본다. 남이 이미 캐다 넣어둔 것을
            # 두고 다시 캐는 것만큼 헛된 일이 없다.
            if self.fetch_from_store(worker, answer):
                continue

            for ore, amount in sorted(wanted.items()):
                spot = snap.ore(ore)
                if not spot:
                    continue
                try:
                    worker.handle.mine(spot["x"], spot["y"],
                                       count=max(10, min(int(amount), 60)),
                                       timeout=420, timeout_ticks=60 * 60 * 5)
                except TaskFailed:
                    return False
                break
            else:
                # 캘 자리가 하나도 없다. 여기서 끝내되, 조용히 끝내지 않는다.
                self.explain_shortfall(worker, item, count, answer)
                return False

        got = worker.handle.items().get(item, 0) >= count
        if not got:
            self.explain_shortfall(worker, item, count, answer)
        return got

    def fetch_from_store(self, worker: Worker, answer: dict) -> bool:
        """계획이 모자라다고 한 것을 공용 상자에서 꺼내 온다.

        창고에 구리판이 쌓여 있는데 광맥까지 걸어가 다시 캐는 일이 있었다.
        가진 것을 세는 자리가 손 하나뿐이라서다.
        """
        name = worker.name
        for item, amount in sorted((answer.get("mine") or {}).items()):
            try:
                chests = self.bridge.chest_stock(name, item)
            except RconError:
                return False
            for chest in chests:
                if int(chest.get("count") or 0) <= 0:
                    continue
                try:
                    worker.handle.take(item, chest["x"], chest["y"],
                                       count=min(int(amount), int(chest["count"])),
                                       timeout=300, timeout_ticks=60 * 60 * 3)
                except TaskFailed:
                    continue
                self.say(f"{item}은(는) 창고에 있어서 꺼내 왔습니다. "
                         f"({chest['x']:.0f}, {chest['y']:.0f})", who=name)
                return True
        return False

    def explain_shortfall(self, worker: Worker, item: str, count: int,
                          answer: dict) -> None:
        """못 구한 이유를 말하고, 남이 도울 수 있게 게시판에 올린다.

        «전봇대를 못 구했습니다»로 끝나면 다음에 할 일이 없다. 무엇이 몇 개
        모자란지 말하면 그것이 곧 다음 할 일이고, 게시판에 올려두면 놀고 있는
        동료의 다음 할 일이 된다.
        """
        why, short = blocked_by(answer)
        if not short:
            self.say(f"{item}을(를) 못 구했고 이유도 모르겠습니다. 다른 일을 하겠습니다.",
                     who=worker.name)
            return
        listed = ", ".join(f"{k} {v}개" for k, v in short[:3])
        self.say(f"{item} {count}개를 못 구했습니다. {listed}이(가) 모자라고, "
                 f"{why}.", who=worker.name)

        # 연구나 유체로 막힌 것은 부탁해도 소용없다. 캘 수 있는 것만 올린다.
        if answer.get("mine"):
            now = time.monotonic()
            for missing, amount in short[:2]:
                if self.board.post(worker.name, missing, amount,
                                   f"{item} 만들기", now):
                    self.say(f"{missing} {amount}개, 손 비는 분 부탁드립니다.",
                             who=worker.name)

    def ensure(self, worker: Worker, item: str, count: int = 1) -> bool:
        """Have `count` of an item, crafting it only if the game says we can."""
        stock = worker.handle.inventory()
        if (stock.get("items") or {}).get(item, 0) >= count:
            return True
        if (stock.get("craftable") or {}).get(item, 0) < count:
            self.say(f"{item} 재료가 모자랍니다.", who=worker.name)
            return False
        try:
            self.say(f"{item}이(가) 부족해서 제작합니다.", who=worker.name)
            worker.handle.craft(item, count=count)
            return True
        except TaskFailed as exc:
            self.say(f"{item}을(를) 못 만들겠습니다: {exc.task.get('error')}", who=worker.name)
            return False

    def start_routine(self, worker: Worker, routine: str, ore: str | None = None,
                      at: dict | None = None) -> bool:
        """Run a long build-out off the main loop; it walks, crafts and builds."""
        if not worker.slot.acquire(blocking=False):
            return False

        def run() -> None:
            try:
                if routine == "power":
                    self.build_power(worker)
                elif routine == "rescue":
                    self.rescue(worker, at or {})
                elif routine == "depot":
                    self.build_depot(worker, at or {})
                elif routine == "defend":
                    self.build_defence(worker, at or {})
                elif routine == "pipe":
                    self.lay_pipe(worker, at or {})
                elif routine == "plug":
                    self.plug_in(worker, at or {})
                elif routine == "bridge":
                    self.bridge_networks(worker, at or {})
                elif routine == "rig":
                    self.build_rig(worker, at or {})
                elif routine == "convert":
                    self.convert_chest(worker, at or {})
                elif routine == "stoke":
                    self.stoke(worker, at or {})
                else:
                    self.automate(worker, ore)
            except Exception as exc:  # noqa: BLE001
                print(f"[warn] {routine} failed: {exc!r}", file=sys.stderr)
                self.thoughts.put((worker.name, f"{routine} 중 문제가 생겼습니다.", []))
            finally:
                worker.slot.release()

        threading.Thread(target=run, daemon=True).start()
        return True

    def build_power(self, worker: Worker) -> None:
        """발전소를 세운다. 자리는 게임이 계산한 것을 그대로 쓴다.

        예전에는 «펌프에서 축을 따라 2~7칸» 같은 어림으로 놓았고, 그 결과
        펌프 둘·보일러 하나·기관 둘이 흩어진 채 기관이 no_input_fluid 로
        서 있었다. 어림은 맞을 때만 맞는다.

        이제 모드가 임시로 세워 보고 «여기에 이 방향으로 놓으면 붙는다»를
        확인한 좌표만 준다. 파이프 자리까지 함께 온다.
        """
        name = worker.name
        try:
            snap = worker.snapshot()
            # «기관이 서 있다»가 아니라 «전기가 흐른다». 계획 쪽만 고치고
            # 여기를 안 고쳐서, 보일러와 기관을 손에 쥔 채 «이미 발전기가
            # 있습니다»라며 돌아서고 있었다.
            if snap.powered:
                self.say("이미 전기가 들어오고 있습니다.", who=name)
                return

            # 랩 옆에 세운다. 발전소가 랩에서 141타일 떨어져 있으면 전봇대
            # 스물두 개를 세워야 하고, 그 전봇대에 또 나무가 든다.
            anchor = snap.building("lab") or snap.building("stone-furnace") \
                or {"x": snap.x, "y": snap.y}

            # 배관이 다 맞았는데 전봇대가 없어 노는 기관이 있으면, 새로
            # 짓는 대신 거기에 전선을 잇는다. 이걸 못 보고 있어서 완성된
            # 발전소가 두 벌 서 있는데도 계속 새로 짓고 있었다.
            standing = self.bridge.power_status(name).get("unplugged")
            if standing:
                self.say(f"발전기가 이미 서 있는데 전선이 없습니다. "
                         f"({standing['x']:.0f}, {standing['y']:.0f})에 잇겠습니다.",
                         who=name)
                self.connect_power(worker, standing, snap)
                return

            # 랩 옆이 제일 좋지만, 앞선 시도가 남긴 펌프로 해안이 막혀
            # 있을 수 있다. 한 곳에서 못 찾았다고 포기하면 전력이 영영
            # 안 선다 - 실제로 펌프 열한 개가 서 있는 채로 0와트였다.
            plan = {}
            for spot, reach in ((anchor, 150), ({"x": snap.x, "y": snap.y}, 150),
                                (anchor, 400)):
                plan = self.bridge.power_plan(name, spot["x"], spot["y"],
                                              radius=reach,
                                              engines=ENGINES_PER_BOILER)
                if not plan.get("error"):
                    break
            if plan.get("error"):
                self.say(f"발전소 자리를 못 찾았습니다: {plan['error']}", who=name)
                worker.block("power", 600)
                return

            pipes = _as_rows(plan.get("pipes"))
            engines = _as_rows(plan.get("engines"))
            needed = [("offshore-pump", 1), ("boiler", 1),
                      ("steam-engine", len(engines))]
            if pipes:
                needed.append(("pipe", len(pipes)))
            for part, count in needed:
                self.say(f"{part} {count}개를 준비합니다.", who=name)
                if not self.obtain(worker, part, count):
                    self.say(f"{part}를 못 구했습니다. 전력은 나중에.", who=name)
                    worker.block("power", 300)
                    return

            self.say(f"발전소를 세웁니다. ({plan['pump']['x']:.0f}, "
                     f"{plan['pump']['y']:.0f})", who=name)
            worker.handle.place("offshore-pump", plan["pump"]["x"], plan["pump"]["y"],
                                direction=plan["pump"]["direction"], timeout=420)
            for spot in pipes:
                worker.handle.place("pipe", spot["x"], spot["y"], timeout=180)
            worker.handle.place("boiler", plan["boiler"]["x"], plan["boiler"]["y"],
                                direction=plan["boiler"]["direction"], timeout=240)
            for spot in engines:
                worker.handle.place("steam-engine", spot["x"], spot["y"],
                                    direction=spot["direction"], timeout=240)

            if not self.obtain(worker, "coal", 20):
                self.say("보일러에 넣을 석탄이 없습니다.", who=name)
            else:
                worker.handle.insert("coal", plan["boiler"]["x"], plan["boiler"]["y"],
                                     count=20, timeout=180)

            # 정말 도는지 본다. 물 없는 보일러와 증기 없는 기관은 밖에서
            # 보면 멀쩡한 발전소와 똑같이 생겼다.
            last = engines[-1] if engines else plan["boiler"]
            running = [e for e in self.bridge.inspect(last["x"], last["y"], 3)
                       if e.get("name") == "steam-engine"]
            energy = running[0].get("energy", 0) if running else 0
            self.say(f"발전소를 세웠습니다. 기관 {len(engines)}대. "
                     + ("전력 생산 중입니다." if energy and energy > 0
                        else "아직 증기가 안 올라왔습니다."), who=name)

            self.connect_power(worker, last, snap)

        except TaskFailed as exc:
            worker.block("power")
            self.say(f"전력 구축 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("power")
            self.say(f"전력 구축 중 오류: {exc}", who=name)

    def connect_power(self, worker: Worker, source: dict, snap: Snapshot) -> None:
        """발전소에서 랩까지 전봇대를 잇는다.

        전봇대를 세우기 전까지 발전소는 아무것도 돌리지 않는다. 기관이
        돌아가는데 랩이 멈춰 있는 상태가 제일 헷갈린다 - 둘 다 멀쩡해
        보이기 때문이다.
        """
        name = worker.name
        target = snap.building("lab")
        if not target:
            return

        span = math.hypot(target["x"] - source["x"], target["y"] - source["y"])
        if span > POLE_REACH * MAX_POLE_RUN:
            # 물이 있는 곳과 랩이 있는 곳은 우리가 고른 게 아니다. 115타일을
            # 전봇대로 잇느니 전기가 있는 자리에 랩을 하나 더 세우는 게 싸다 -
            # 사람도 그렇게 한다.
            self.say(f"랩이 {span:.0f}타일 떨어져 있습니다. 발전소 옆에 랩을 "
                     f"하나 더 세우겠습니다.", who=name)
            if not self.obtain(worker, "lab", 1):
                self.say("랩을 못 만들었습니다.", who=name)
                return
            try:
                target = worker.handle.place("lab", source["x"] + 4, source["y"],
                                             snap=True, timeout=420)
            except TaskFailed as exc:
                self.say(f"랩을 못 세웠습니다: {exc.task.get('error')}", who=name)
                return
            span = math.hypot(target["x"] - source["x"], target["y"] - source["y"])

        # 양 끝이 먼저다. 전선이 7.5칸까지 늘어나는 것은 «전봇대끼리»의
        # 이야기고, 기계가 전기를 받으려면 기계가 전봇대의 공급 범위(작은
        # 전봇대는 5x5) 안에 들어와야 한다. 한 걸음 떨어뜨려 세운 전봇대
        # 넷이 아무것도 못 켜고 서 있었던 이유가 이것이다.
        #
        # 어디까지 닿는지는 계산하지 않고 게임에 물어본다. 세워보고 기계가
        # 전기망에 들어갔는지 확인하는 쪽이 짧고 틀리지 않는다.
        try:
            head = self.bridge.wire_spot(name, source["x"], source["y"])
            foot = self.bridge.wire_spot(name, target["x"], target["y"])
        except RconError as exc:
            self.say(f"전봇대 자리를 못 물어봤습니다: {exc}", who=name)
            return
        if head.get("error") or foot.get("error"):
            self.say(f"전봇대가 닿는 자리가 없습니다: "
                     f"{head.get('error') or foot.get('error')}", who=name)
            return

        ends = [spot for spot in (head, foot) if not spot.get("already")]
        middle = max(0, math.ceil(span / POLE_REACH) - 1)
        poles = len(ends) + middle
        if poles == 0:
            self.say("이미 전기가 이어져 있습니다.", who=name)
            return

        self.say(f"발전소에서 랩까지 {span:.0f}타일, 전봇대 {poles}개를 세웁니다. "
                 f"양 끝은 기계에 닿는 자리에 붙입니다.", who=name)
        if not self.obtain(worker, "small-electric-pole", poles):
            return

        # 끝 -> 중간 -> 끝. 중간이 끊겨도 양쪽 기계는 이미 붙어 있어서,
        # 다음에 가운데만 이으면 된다.
        spots = list(ends)
        for i in range(1, middle + 1):
            share = i / (middle + 1)
            spots.append({"x": head["x"] + (foot["x"] - head["x"]) * share,
                          "y": head["y"] + (foot["y"] - head["y"]) * share})

        placed = 0
        for spot in spots:
            try:
                worker.handle.place("small-electric-pole", spot["x"], spot["y"],
                                    snap=True, timeout=240)
                placed += 1
            except TaskFailed:
                # 한 자리가 막혔다고 전선 전체를 포기할 이유는 없다.
                continue

        try:
            live = self.bridge.power_status(name)
        except RconError:
            live = {}
        watt = int(live.get("watts") or 0)
        if watt > 0:
            self.say(f"전봇대 {placed}개를 세웠고 전기가 들어왔습니다. {watt}W",
                     who=name)
        else:
            self.say(f"전봇대 {placed}개를 세웠는데 아직 0W입니다. "
                     f"가운데가 끊겼거나 보일러에 연료가 없습니다.", who=name)

    def build_depot(self, worker: Worker, base: dict) -> None:
        """공용 창고를 세우고 그 자리를 무리에게 알린다."""
        name = worker.name
        try:
            if not self.obtain(worker, CHEST, 1):
                self.say("창고로 쓸 상자를 못 구했습니다.", who=name)
                worker.block("depot:build", 300)
                return
            spot = worker.handle.place(CHEST, base["x"] + 3, base["y"] + 3,
                                       snap=True, timeout=420)
            self.bridge.set_depot(spot["x"], spot["y"])
            self.say(f"공용 창고를 세웠습니다. ({spot['x']:.0f}, {spot['y']:.0f}) "
                     f"남는 물자는 여기에 모읍니다.", who=name)
        except TaskFailed as exc:
            worker.block("depot:build", 300)
            self.say(f"창고를 못 세웠습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("depot:build", 300)
            self.say(f"창고 구축 중 오류: {exc}", who=name)

    def rescue(self, worker: Worker, at: dict) -> None:
        """멈춰 선 채굴기에 출구 상자를 달아주고 연료를 채운다.

        어디가 출구인지는 채굴기에게 묻는다. 방향을 짐작해서 놓으면 상자는
        서 있는데 광석은 여전히 땅에 쌓인다.
        """
        name = worker.name
        if not at:
            return
        try:
            # 출구가 막혔으면 상자를 놓을 자리가 아예 없다. 건물은 돌릴 수
            # 있으니, 상자를 만들기 전에 비는 쪽으로 돌려본다.
            aimed = self.bridge.aim_drill(worker.name, at["x"], at["y"])
            if aimed.get("error"):
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}", 300)
                self.say(f"채굴기를 어느 쪽으로 돌려도 출구가 막혔습니다. "
                         f"({at['x']:.0f}, {at['y']:.0f})", who=name)
                return
            if aimed.get("turned"):
                self.say("출구가 막혀 채굴기를 돌렸습니다.", who=name)
            drill = {"x": aimed["x"], "y": aimed["y"],
                     "drop_x": aimed["drop_x"], "drop_y": aimed["drop_y"]}

            # 그 사이에 누가 상자를 달아줬을 수도 있다.
            already = [e for e in self.bridge.inspect(drill["drop_x"], drill["drop_y"], 0.8)
                       if (e.get("name") or "").endswith("-chest")]
            if already:
                worker.block(f"rescue:{at['x']:.0f},{at['y']:.0f}")
                return

            if not self.ensure(worker, CHEST):
                worker.block("rescue")
                return

            worker.handle.place(CHEST, drill["drop_x"], drill["drop_y"], timeout=180)
            self.say(f"({drill['x']:.0f},{drill['y']:.0f}) 채굴기에 상자를 달았습니다.",
                     who=name)

            if worker.handle.items().get("coal", 0) >= DRILL_FUEL:
                worker.handle.insert("coal", drill["x"], drill["y"],
                                     count=DRILL_FUEL, timeout=180)
        except TaskFailed as exc:
            worker.block("rescue")
            self.say(f"상자를 못 달았습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("rescue")
            self.say(f"채굴기 수리 중 오류: {exc}", who=name)

    def automate(self, worker: Worker, ore: str | None) -> None:
        """광맥 하나를 사람 손에서 떼어낸다.

        무엇을 놓느냐가 «손으로 나르는가»를 가른다.

        - 석탄: 마주보는 채굴기 두 대. 각자 캔 석탄이 상대의 연료함으로
          직행해서 둘이 서로를 영원히 먹인다. 이게 없으면 사람이 드릴
          열여덟 대에 석탄을 손으로 날라야 하고, 실제로 여덟 중 넷이 그
          일만 하고 있었다.
        - 철/구리: 채굴기 출력면에 화로를 바로 붙인다. 채굴기는 캐자마자
          앞 칸에 떨구고, 그 칸이 화로면 인서터 없이 제련이 시작된다.
          광석을 상자에 쌓아두고 사람이 퍼 나를 이유가 없다.
        - 그 밖: 상자. 돌은 화로에 넣을 일이 드물다.
        """
        ore = ore or "coal"
        name = worker.name
        if ore == "coal":
            self.automate_coal(worker)
            return

        receiver = CHEST if ore not in SMELTED_BY_FURNACE else "stone-furnace"
        try:
            # 더 세우기 전에, 이미 선 것들이 도는지 본다.
            row = (self.bridge.health(name) or {}).get(DRILL) or {}
            ok, why = worth_building(row)
            if not ok:
                self.say(f"채굴기를 더 세우지 않겠습니다. {why}. "
                         f"막힌 것을 먼저 풀어야 합니다.", who=name)
                worker.block(f"automate:{ore}", BACKOFF_SECONDS)
                return
        except RconError:
            pass

        try:
            snap = worker.snapshot()
            spot = snap.ore(ore)
            if not spot:
                self.say(f"{ore} 광맥이 주변 200타일 안에 안 보입니다.", who=name)
                return

            for part in (DRILL, receiver):
                if not self.obtain(worker, part, 1):
                    self.say(f"{part}를 못 구했습니다.", who=name)
                    worker.block("automate")
                    return

            sites = self.bridge.drill_site(name, spot["x"], spot["y"],
                                           radius=12, receiver=receiver)
            if not sites:
                self.say(f"{ore} 광맥에 {receiver}를 붙일 자리가 없습니다.", who=name)
                worker.block(f"automate:{ore}", 300)
                return

            # 한 번 걸어가서 여러 대를 세운다. 자리는 이미 «오래 갈 순서»로
            # 와 있고, 겹치는 것만 걸러내면 그대로 한 줄이 된다.
            field = spread_sites(sites, DRILLS_PER_TRIP)
            what = "화로" if receiver == "stone-furnace" else "상자"
            head = field[0]
            life = int(head.get("seconds") or 0)
            self.say(f"{ore} 광맥에 채굴기 {len(field)}대와 {what}를 붙이겠습니다. "
                     f"가장 두꺼운 자리는 ({head['x']:.0f}, {head['y']:.0f}), "
                     f"{head.get('richness', 0)}개 묻혀 있어 {life // 60}분짜리입니다.",
                     who=name)

            built = 0
            for site in field:
                # 두 대째부터는 재료를 다시 구한다. 첫 대 값만 들고 가서
                # 나머지를 못 세우는 일이 없도록.
                if built and not (self.obtain(worker, DRILL, 1)
                                  and self.obtain(worker, receiver, 1)):
                    self.say(f"자재가 떨어져 {built}대까지만 세웠습니다.", who=name)
                    break
                try:
                    drill = worker.handle.place(DRILL, site["x"], site["y"],
                                                direction=site["direction"],
                                                timeout=420)
                except TaskFailed:
                    # 한 자리가 막혔다고 줄 전체를 포기할 이유는 없다.
                    continue

                aimed = self.bridge.aim_drill(name, drill["x"], drill["y"])
                if aimed.get("error"):
                    continue
                if aimed.get("turned"):
                    self.say("출구가 막혀 채굴기를 돌렸습니다.", who=name)

                if site.get("outlet") == "free":
                    try:
                        worker.handle.place(receiver, aimed["drop_x"],
                                            aimed["drop_y"], timeout=240)
                    except TaskFailed:
                        pass

                # 채굴기는 광석만 떨군다. 연료는 절대 넣어주지 않는다 -
                # 화로도 채굴기도 석탄은 따로 받아야 한다.
                for target in ((drill["x"], drill["y"]),
                               (aimed["drop_x"], aimed["drop_y"])):
                    if receiver != "stone-furnace" and target[0] == aimed["drop_x"]:
                        continue
                    if worker.handle.items().get("coal", 0) < DRILL_FUEL:
                        if not self.obtain(worker, "coal", DRILL_FUEL):
                            break
                    try:
                        worker.handle.insert("coal", target[0], target[1],
                                             count=DRILL_FUEL, timeout=180)
                    except TaskFailed:
                        pass
                built += 1

            if built:
                self.say(f"{ore} 채굴기 {built}대를 세웠습니다. "
                         f"손으로 캐는 것보다 {built * 4}배 빠릅니다.", who=name)
            else:
                self.say(f"{ore} 채굴기를 한 대도 못 세웠습니다.", who=name)
                worker.block(f"automate:{ore}", 300)

        except TaskFailed as exc:
            worker.block("automate")
            self.say(f"자동화 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("automate")
            self.say(f"자동화 중 오류: {exc}", who=name)

    def automate_coal(self, worker: Worker) -> None:
        """석탄 광맥 위에 서로를 먹이는 채굴기 두 대를 세운다."""
        name = worker.name
        try:
            snap = worker.snapshot()
            spot = snap.ore("coal")
            if not spot:
                self.say("석탄 광맥이 주변에 안 보입니다.", who=name)
                worker.block("automate:coal", 300)
                return

            pair = self.bridge.coal_pair_site(name, spot["x"], spot["y"], radius=16)
            if pair.get("error"):
                self.say(f"석탄 자급쌍 자리가 없습니다: {pair['error']}", who=name)
                worker.block("automate:coal", 300)
                return

            if not self.obtain(worker, DRILL, 2):
                self.say("채굴기 두 대를 못 구했습니다.", who=name)
                worker.block("automate:coal")
                return

            self.say(f"석탄 광맥에 서로 먹이는 채굴기 두 대를 놓겠습니다. "
                     f"({pair['first']['x']:.0f}, {pair['first']['y']:.0f})", who=name)
            for seat in ("first", "second"):
                where = pair[seat]
                worker.handle.place(DRILL, where["x"], where["y"],
                                    direction=where["direction"], timeout=420)

            # 첫 삽만 사람이 떠준다. 그 뒤로는 둘이 서로 먹인다.
            if self.obtain(worker, "coal", DRILL_FUEL):
                worker.handle.insert("coal", pair["first"]["x"], pair["first"]["y"],
                                     count=DRILL_FUEL, timeout=180)
            self.say("석탄 자급쌍 완성. 이제 손으로 넣어줄 필요가 없습니다.", who=name)

        except TaskFailed as exc:
            worker.block("automate:coal")
            self.say(f"석탄 자급쌍 구축 중 막혔습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("automate:coal")
            self.say(f"석탄 자급쌍 구축 중 오류: {exc}", who=name)

    # -- reporting ---------------------------------------------------------

    # -- 배차 -------------------------------------------------------------

    def survey(self, worker: Worker) -> list[Job]:
        """무리 전체가 나눠 가질 일감을 한 번에 만든다.

        예전에는 각자 자기 스냅샷을 보고 «가장 급한 일 하나»를 골랐다.
        열쇠는 한 명만 잡을 수 있으니, 급한 일이 셋이면 나머지 다섯은 서
        있었다. 실제로 여덟 중 넷이 그랬다.

        여기서는 한 번 훑어서 «할 수 있는 일 전부»를 목록으로 만든다.
        목록이 사람보다 길면 아무도 놀지 않는다.
        """
        refuel: list[Job] = []
        gather: list[Job] = []
        unblock: list[Job] = []
        jobs: list[Job] = []

        # 0. 서 있는 발전소를 고치는 것이 새 발전소보다 언제나 싸다.
        #    전봇대 둘과 파이프 둘이 2.7MW 였던 적이 있다.
        jobs.extend(self.power_repair_jobs(worker))

        # 0. 모두가 같은 것을 부탁하고 있으면, 나르는 일이 아니라 만드는
        #    일이다. 이걸 먼저 걷어내지 않으면 게시판이 굳는다.
        jobs.extend(self.shortage_jobs())

        # 창고가 먼저다. 물자가 각자 가방에 갇혀 있는 한 나머지 일감은
        # 재료가 없어서 계속 막힌다.
        opening = self.depot_job(worker, self.snaps.get(worker.name)
                                 or worker.snapshot())
        if opening and opening.key == "depot:build":
            jobs.append(opening)

        try:
            stopped = self.bridge.broken(worker.name)
            stock = self.bridge.furnace_stock(worker.name)
            coal_chests = self.bridge.chest_stock(worker.name, "coal")
            # 창고에 무엇이 얼마나 있는지. 「그만 캐도 되는가」를 이걸로 정한다.
            shelved = (self.bridge.stores(worker.name).get("total") or {})
        except RconError:
            return jobs

        # 이미 선 장치를 살리는 것이 새 장치를 세우는 것보다 먼저다.
        # 빈 찬장을 서른 개 지어놓고 서른한 번째를 지으러 가면 안 된다.
        unblock.extend(self.restock_jobs(worker, coal_chests))

        # 1. 연료가 떨어진 기계. 세 가지를 이 순서로 한다.
        #
        #    ① 빈 급유 상자를 채운다  - 이미 선 장치를 살리는 게 가장 싸다
        #    ② 새 급유 장치를 세운다  - 한 번 세우면 영원히 산다
        #    ③ 손으로 석탄을 넣는다   - 그 기계를 한 번 살릴 뿐
        #
        #    195대를 손으로 먹이는 것은 불가능하고, 장치를 세우는 것은
        #    가능하다. 그런데 빈 찬장을 서른 개 지어놓고 서른한 번째를
        #    지으러 가면 그것도 소용없다 - 그래서 ①이 ②보다 앞이다.
        unblock.extend(self.rig_job(worker, [e for e in stopped
                                             if e.get("fix") == "fuel"]))

        # 한 구역에 모인 기계는 한 번 걸어가서 한꺼번에 채운다. 채굴기
        # 여섯 대가 한 광맥에 모여 있는데 여섯 번 따로 가는 것이 가장 흔한
        # 낭비다. 석탄도 그만큼 한 번에 실어간다.
        for group in cluster([e for e in stopped if e.get("fix") == "fuel"]):
            head = group[0]
            at = {"x": head["x"], "y": head["y"]}
            key = f"tend:{head['x']:.0f},{head['y']:.0f}"
            source = nearest_to(coal_chests, at, DRILL_FUEL)
            steps: list[Step] = []
            if source:
                # 실을 수 있는 만큼으로 약속을 줄인다. 급유 상자에서 고친
                # 것과 같은 실수가 여기 남아 있었다 - 여섯 대에 넣겠다고
                # 나서놓고 40개만 싣고 가서, 두 대 넣고 「no coal to insert」
                # 로 끝났다. 여덟 번 그랬다.
                group, load = carry_split(
                    group, min(HAUL_BATCH, int(source["count"])), DRILL_FUEL)
                steps.append(("take", {"name": "coal", "count": load,
                                       "x": source["x"], "y": source["y"]}))
            wanted = DRILL_FUEL * len(group)
            for machine in group:
                steps.append(("insert", {"name": "coal", "count": DRILL_FUEL,
                                         "x": machine["x"], "y": machine["y"]}))
            where = (f"({head['x']:.0f}, {head['y']:.0f})" if len(group) == 1
                     else f"({head['x']:.0f}, {head['y']:.0f}) 일대 {len(group)}대")
            refuel.append(Job(f"{where}에 석탄을 넣겠습니다.",
                              key=key, steps=steps,
                              needs={} if source else {"coal": wanted},
                              at=at))

        # 2. 다 녹아서 화로를 막고 있는 것들. 화로마다 따로 걷는다.
        for group in cluster([e for e in stock
                              if int(e.get("count") or 0) >= HARVEST_MIN]):
            head = group[0]
            total = sum(int(e.get("count") or 0) for e in group)
            gather.append(Job(
                f"화로 {len(group)}대에서 {total}개를 거둬오겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
                key=f"harvest:{head['x']:.0f},{head['y']:.0f}",
                steps=[("take", {"name": e["name"], "count": e["count"],
                                 "x": e["x"], "y": e["y"]}) for e in group],
                at={"x": head["x"], "y": head["y"]}))

        # 3. 내놓을 데가 없어 선 채굴기. 지금 가장 큰 무더기(123대)인데,
        #    세어보니 한 가지 문제가 아니었다:
        #
        #      83대  받을 곳이 아예 없다 (땅에 떨구다 막힘)
        #      22대  상자가 돌로 꽉 참    — 창고에 이미 48,099개
        #       6대  상자가 석탄으로 꽉 참 — 창고에 이미 19,590개
        #      10대  석탄 드릴끼리 서로 먹임 (정상)
        #       2대  상자가 철광석으로 꽉 참
        #
        #    「상자가 있고 녹일 수 있는 광석」만 보던 앞의 판단은 2대에만
        #    해당했다. 셋을 갈라서 각각 맞는 손을 쓴다.
        surplus = {k for k, v in (shelved or {}).items() if int(v) >= SURPLUS}
        for entry in [e for e in stopped if e.get("fix") == "chest"][:4]:
            holding, outlet = entry.get("holding"), entry.get("outlet")
            at = {"x": entry["x"], "y": entry["y"]}

            # 이미 넘치게 쌓인 것을 계속 캐고 있다. 캐는 것도 일이고 막힌
            # 채로 서 있는 것도 자리다 — 걷어내서 두꺼운 광맥에 다시 쓴다.
            if holding in surplus:
                unblock.append(Job(
                    f"{holding}은(는) 창고에 {int(shelved[holding]):,}개나 "
                    f"있습니다. 이 채굴기는 걷어내겠습니다. "
                    f"({entry['x']:.0f}, {entry['y']:.0f})",
                    key=f"enough:{entry['x']:.0f},{entry['y']:.0f}",
                    steps=[("demolish", {"x": entry["x"], "y": entry["y"],
                                         "name": entry.get("name")})],
                    at=at))
                continue

            # 녹일 수 있는 광석이 찬 상자는 화로로 바꾼다. 비우면 이십 분
            # 뒤에 똑같이 막히지만, 화로는 영원히 받아준다.
            if outlet and holding in SMELTED_BY_FURNACE:
                unblock.append(Job(
                    f"{entry.get('name', '채굴기')}의 상자가 {holding}으로 "
                    f"꽉 찼습니다. 화로로 바꾸면 다시 막히지 않습니다. "
                    f"({entry['x']:.0f}, {entry['y']:.0f})",
                    key=f"convert:{entry['x']:.0f},{entry['y']:.0f}",
                    routine="convert", at=entry))
                continue

            # 받을 곳이 아예 없다. 여든세 대가 이 상태로 땅에 떨구다 막혀
            # 있었는데, 앞의 판단은 이걸 통째로 건너뛰었다.
            if not outlet:
                unblock.append(Job(
                    f"{entry.get('name', '채굴기')}이(가) 내놓을 데가 없어 "
                    f"멈췄습니다. 받을 것을 달겠습니다. "
                    f"({entry['x']:.0f}, {entry['y']:.0f})",
                    key=f"outlet:{entry['x']:.0f},{entry['y']:.0f}",
                    routine="rescue", at=at, needs={CHEST: 1}))

        # 3b. 밑의 광석이 다 떨어진 채굴기. 「고장」이 아니라 「끝난 것」이라
        #     손볼 방법이 없다. 걷어내면 채굴기가 통째로 재고로 돌아와,
        #     다음 automate 가 두꺼운 자리에 다시 세운다. 5회차에 매장량으로
        #     자리를 고르게 만든 것이 여기서 쓸모가 있다.
        for spot in cluster([e for e in stopped if e.get("fix") == "spent"])[:2]:
            head = spot[0]
            unblock.append(Job(
                f"광맥이 말라 선 채굴기 {len(spot)}대를 걷어내겠습니다. "
                f"두꺼운 자리에 다시 세우겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
                key=f"spent:{head['x']:.0f},{head['y']:.0f}",
                steps=[("demolish", {"x": e["x"], "y": e["y"],
                                     "name": e.get("name")}) for e in spot],
                at={"x": head["x"], "y": head["y"]}))

        # 3c. 굶고 있는 화로. 다섯 회차째 54대가 그대로였고, 그 사이
        #     철광석은 창고에 10,264개까지 쌓였다. 캐는 능력이 모자란 적은
        #     없고, 캔 것이 화로까지 가지 않을 뿐이다.
        #
        #     한 구역의 화로를 한 번에 먹인다. 상자는 화로 옆에서 고른다 -
        #     내가 선 자리가 아니라.
        for group in cluster([e for e in stopped if e.get("fix") == "feed"])[:2]:
            head = group[0]
            at = {"x": head["x"], "y": head["y"]}
            key = f"feed:{head['x']:.0f},{head['y']:.0f}"
            for ore in SMELTED_BY_FURNACE:
                try:
                    shelves = self.bridge.chest_stock(worker.name, ore)
                except RconError:
                    break
                source = nearest_to(shelves, at, SMELT_BATCH)
                if not source:
                    continue
                fed, load = carry_split(
                    group, min(HAUL_BATCH, int(source["count"])), SMELT_BATCH)
                gather.append(Job(
                    f"화로 {len(fed)}대가 굶고 있습니다. {ore}을(를) "
                    f"{load}개 실어다 넣겠습니다. "
                    f"({head['x']:.0f}, {head['y']:.0f})",
                    key=key,
                    steps=[("take", {"name": ore, "count": load,
                                     "x": source["x"], "y": source["y"]})]
                          + [("insert", {"name": ore, "count": SMELT_BATCH,
                                         "x": e["x"], "y": e["y"]}) for e in fed],
                    at=at))
                break

        # 4. 미리 세우는 터렛. 급하지 않지만 미뤄두면 영영 안 하고,
        #    습격이 온 다음에 시작하면 늦는다.
        guard = self.defence_job(worker, self.snaps.get(worker.name)
                                 or worker.snapshot())
        if guard:
            unblock.append(guard)

        # 5. 길을 막고 선 우리 건물. 여덟 칸마다 비워두기로 한 줄 위에
        #    이미 놓여버린 것들이다. 놓을 줄만 알고 치울 줄을 모르면 실수는
        #    영원히 남는다 - 자재는 캐면 가방으로 돌아온다.
        try:
            for spot in cluster(self.bridge.blocking(worker.name))[:2]:
                head = spot[0]
                unblock.append(Job(
                    f"길을 막은 {head['name']} {len(spot)}개를 걷어냅니다. "
                    f"({head['x']:.0f}, {head['y']:.0f})",
                    key=f"clear:{head['x']:.0f},{head['y']:.0f}",
                    steps=[("demolish", {"x": e["x"], "y": e["y"], "name": e["name"]})
                           for e in spot],
                    at={"x": head["x"], "y": head["y"]}))
        except RconError:
            pass

        # 6. 출구가 막혀 선 채굴기.
        for entry in stopped:
            if entry.get("fix") != "chest":
                continue
            at = {"x": entry["x"], "y": entry["y"]}
            unblock.append(Job(
                f"채굴기 출구가 막혔습니다. ({entry['x']:.0f}, {entry['y']:.0f})",
                key=f"tend:{entry['x']:.0f},{entry['y']:.0f}",
                routine="rescue", at=at))

        # 한 종류가 목록을 다 차지하면 나머지는 차례가 오지 않는다. 연료
        # 보급만 스물다섯 개 쌓여서 창고 입고와 거두기가 한 번도 배차되지
        # 않았다. 창고 짓기만 맨 앞에 두고, 나머지는 번갈아 나눠준다.
        return jobs + interleave([refuel, gather, unblock])

    def dispatch(self, free: list[tuple[Worker, Snapshot]]) -> set[str]:
        """만든 일감을 가까운 사람에게 나눠준다. 배차된 사람 이름을 돌려준다.

        가까운 순으로 주는 이유는 단순하다 - 지도 반대편 사람이 바로 옆
        사람을 지나쳐 같은 기계까지 걸어가는 것이 가장 흔한 낭비다.
        """
        if not free:
            return set()

        pool = self.survey(free[0][0])
        taken = self.taken()
        pool = [j for j in pool if j.key not in taken]
        if not pool:
            return set()

        seats = {w.name: (snap.x, snap.y) for w, snap in free}
        handed: set[str] = set()
        for job in pool:
            if len(handed) >= len(free):
                break
            spot = job.at or {}
            # 가방을 부리는 일은 그 가방의 주인만 할 수 있다. 나머지는
            # 가까운 사람에게.
            owner = job.key.split(":", 1)[1] if job.key.startswith("depot:") else None
            if owner:
                order = [owner] if owner in seats and owner not in handed else []
            else:
                order = sorted(
                    (n for n in seats if n not in handed),
                    key=lambda n: ((seats[n][0] - spot.get("x", seats[n][0])) ** 2
                                   + (seats[n][1] - spot.get("y", seats[n][1])) ** 2, n))
            if not order:
                # 이 일감의 주인이 지금 손이 비어 있지 않을 뿐이다. 목록
                # 전체를 여기서 끊으면 뒤에 있는 일감이 통째로 사라진다 -
                # 창고 입고가 목록 중간에 있어서 그 뒤가 전부 날아갔다.
                continue
            # 가장 가까운 사람이 이 일을 막아뒀으면 다음 사람에게 준다.
            # 예전에는 order[0] 하나만 보고, 그 사람이 막아뒀으면 일감
            # 자체를 버렸다. 호수 건너에 갇힌 한 사람 때문에 급유 상자
            # 채우기가 통째로 사라지고 있었다 - 다른 셋은 갈 수 있는데도.
            name = next((n for n in order
                         if job.key not in self.workers[n].blocked_now()), None)
            if name is None:
                continue
            worker = self.workers[name]

            # 먼저 «시작할 수 있는가»를 확인하고, 그 다음에 말한다.
            # 예전에는 start_routine 의 반환값을 버렸다. 앞의 작업이 아직
            # 슬롯을 쥐고 있으면 그 함수는 아무것도 안 하고 False 를
            # 돌려주는데, 배차는 그걸 성공으로 치고 「급유 장치를
            # 세우겠습니다」라고 말한 뒤 일감을 점유했다. 스물여덟 분 동안
            # 열두 번 말하고 한 대도 안 세운 이유가 이것이다.
            if job.routine:
                if not self.start_routine(worker, job.routine, job.ore, job.at):
                    continue
            else:
                try:
                    plan = worker.handle.submit_plan(job.steps)
                except RconError as exc:
                    self.say(f"그건 못 하겠습니다: {exc}", who=name)
                    continue
                worker.watching = plan

            self.claim(worker, job.key)
            self.say(job.narration, who=name)
            worker.said_idle = False
            handed.add(name)

        return handed

    def power_repair_jobs(self, worker: Worker) -> list[Job]:
        """서 있는 발전소를 새로 짓는 대신 고친다.

        실측(259분째): 보일러 5 + 기관 7 + 펌프 7 을 지어놓고 0W 였다. 그런데
        기관 셋은 증기가 가득한 채 전봇대만 없었고, 셋은 보일러와 «한 칸»
        떨어져 있었다. 전봇대 둘과 파이프 둘이면 2.7MW 가 들어온다.

        그동안 무리는 «전력 없음»만 보고 발전소를 또 지었다. 고칠 줄 모르면
        고장난 것이 쌓이기만 한다.
        """
        try:
            faults = self.bridge.power_faults(worker.name)
        except RconError:
            return []
        if faults.get("error"):
            return []

        out: list[Job] = []
        # 전기를 만드는 망과 쓰는 망이 갈라져 있으면 그것부터. 전봇대 한 대에
        # 1.8MW 가 걸려 있고, 다른 무엇보다 싸다.
        for spot in _as_rows(faults.get("bridges"))[:2]:
            out.append(Job(
                f"전기는 만들어지는데 랩이 다른 전기망에 있습니다. "
                f"{spot.get('gap', 0)}타일 사이에 전봇대를 하나 놓아 잇겠습니다. "
                f"({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"bridge:{spot['x']:.0f},{spot['y']:.0f}",
                routine="bridge", at=spot))

        # 파이프가 먼저다. 이어지지 않은 기관은 전봇대를 꽂아도 0W 다.
        for spot in _as_rows(faults.get("pipes"))[:3]:
            out.append(Job(
                f"{spot.get('joins', '발전소')} 사이가 한 칸 떠 있습니다. "
                f"파이프로 잇겠습니다. ({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"pipe:{spot['x']:.0f},{spot['y']:.0f}",
                routine="pipe", at=spot))
        for spot in _as_rows(faults.get("poles"))[:3]:
            out.append(Job(
                f"{spot.get('name', '기관')}에 증기는 찼는데 전봇대가 없습니다. "
                f"({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"plug:{spot['x']:.0f},{spot['y']:.0f}",
                routine="plug", at=spot))
        for spot in _as_rows(faults.get("fuel"))[:2]:
            out.append(Job(
                f"보일러에 연료가 없습니다. ({spot['x']:.0f}, {spot['y']:.0f})",
                key=f"stoke:{spot['x']:.0f},{spot['y']:.0f}",
                routine="stoke", at=spot))
        return out

    def rig_job(self, worker: Worker, stopped: list[dict]) -> list[Job]:
        """연료가 없어 선 기계에 급유 장치를 세운다.

        손으로 195대를 먹이는 것은 불가능하다. 하지만 기계 한 대 옆에
        «석탄 상자 + 버너 인서터»를 한 번 세워두면 그 기계는 영구히 연료
        걱정이 없어진다 - 인서터가 나르는 것이 석탄이라 자기 연료를 그중에서
        떼어 쓰기 때문이다.

        인서터 한 대는 채굴기 스물한 대분 연료를 감당한다. 66대가 굶는 것은
        처리량 한계가 아니라 인서터가 안 박혀서다.
        """
        out: list[Job] = []
        for machine in stopped[:RIGS_PER_TRIP]:
            if machine.get("fix") != "fuel":
                continue
            key = f"rig:{machine['x']:.0f},{machine['y']:.0f}"
            if key in worker.blocked_now():
                continue
            out.append(Job(
                f"{machine['name']}에 급유 장치를 세우겠습니다. 한 번 세우면 "
                f"연료를 다시 넣어줄 일이 없습니다. "
                f"({machine['x']:.0f}, {machine['y']:.0f})",
                key=key, routine="rig", at=machine))
        return out

    def build_rig(self, worker: Worker, at: dict) -> None:
        """«석탄 상자 + 버너 인서터»를 한 벌 세우고 석탄을 부어둔다."""
        name = worker.name
        key = f"rig:{at['x']:.0f},{at['y']:.0f}"
        try:
            plan = self.bridge.fuel_rig(name, at["x"], at["y"])
        except RconError:
            return
        if plan.get("error"):
            worker.block(key, BACKOFF_SECONDS)
            return

        arm, shelf = plan["inserter"], plan["chest"]

        # 밥이 먼저다. 예전에는 상자와 인서터를 먼저 놓고 석탄은 나중에
        # 구했는데, 구하기가 실패해도 조용히 넘어갔다. 그래서 315분째에
        # 빈 찬장이 서른 개 서 있었고 인서터 29대가 «집을 게 없음»으로
        # 멈춰 있었다. 못 먹일 거면 짓지 않는 편이 낫다.
        if not self.obtain(worker, "coal", RIG_COAL):
            self.say("급유 장치에 넣을 석탄을 못 구해서 짓지 않았습니다.", who=name)
            worker.block(key, BACKOFF_SECONDS)
            return

        wanted = ["burner-inserter"] + ([] if shelf.get("standing") else [CHEST])
        for part in wanted:
            if not self.obtain(worker, part, 1):
                worker.block(key, BACKOFF_SECONDS)
                return

        try:
            if not shelf.get("standing"):
                worker.handle.place(CHEST, shelf["x"], shelf["y"], timeout=420)
            worker.handle.insert("coal", shelf["x"], shelf["y"],
                                 count=RIG_COAL, timeout=300)
            worker.handle.place("burner-inserter", arm["x"], arm["y"],
                                direction=arm["direction"], timeout=300)
        except TaskFailed as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"급유 장치를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return

        self.say(f"{plan.get('machine', '기계')}에 급유 장치를 세우고 석탄 "
                 f"{RIG_COAL}개를 채웠습니다. 이제 알아서 먹습니다.", who=name)

    def restock_jobs(self, worker: Worker,
                     coal_chests: list[dict]) -> list[Job]:
        """빈 급유 상자에 석탄을 붓는다.

        상자 하나에 50개를 부으면 그 기계는 한참을 혼자 돈다. 기계에 직접
        20개를 넣어주는 것보다 같은 걸음으로 훨씬 오래 간다 - 손이 닿는
        곳을 기계에서 상자로 옮긴 것이 이 장치의 전부다.
        """
        try:
            empty = self.bridge.hungry_rigs(worker.name)
        except RconError:
            return []
        if not empty:
            return []

        # 배차 경로는 needs 를 보지 않는다. 그러니 실을 곳을 여기서 직접
        # 첫 단계로 붙인다 - 빈손으로 보내면 insert 가 그냥 실패한다.
        # 급유 상자 자신은 비어 있으니 출처가 될 수 없고, 다른 급유 상자에서
        # 퍼오는 것도 곤란하다. 넉넉한 상자만 고른다.
        out: list[Job] = []
        for group in cluster(empty)[:2]:
            head = group[0]
            wanted = RIG_COAL * len(group)
            source = (nearest_to(coal_chests, head, wanted)
                      or nearest_to(coal_chests, head, RIG_COAL))
            if not source:
                continue

            # 실을 수 있는 만큼만 붓기로 한다. 예전에는 상자 여섯 개를
            # 채우겠다고 나서놓고 60개만 싣고 갔다 - 첫 상자에서 50을 쓰고
            # 나머지 다섯 번이 «no coal to insert» 로 끝났다. 아홉 번 그랬다.
            group, load = carry_split(group, min(int(source["count"]), wanted),
                                      RIG_COAL)

            steps: list[Step] = [
                ("take", {"name": "coal", "count": load,
                          "x": source["x"], "y": source["y"]})]
            steps += [("insert", {"name": "coal", "count": RIG_COAL,
                                  "x": spot["x"], "y": spot["y"]})
                      for spot in group]
            out.append(Job(
                f"급유 상자 {len(group)}개가 비었습니다. 석탄을 실어 붓겠습니다. "
                f"({head['x']:.0f}, {head['y']:.0f})",
                key=f"restock:{head['x']:.0f},{head['y']:.0f}", steps=steps,
                at={"x": head["x"], "y": head["y"]}))
        return out

    def convert_chest(self, worker: Worker, entry: dict) -> None:
        """꽉 찬 상자를 걷어내고 그 자리에 화로를 세운다.

        비우기는 이 채굴기를 한 번 살리고 이십 분 뒤에 똑같이 막힌다. 화로는
        영원히 받아준다 - 채굴기가 캔 광석이 바로 화로로 들어가서, 나를 일
        자체가 없어진다. 401분째에 채굴기 112대가 꽉 찬 상자에 막혀 선 옆에서
        화로 54대가 굶고 있었다. 둘은 같은 문제의 두 얼굴이다.

        상자를 캐면 안에 든 것이 가방으로 따라온다. 그 광석을 그대로 새
        화로에 넣으면 버리는 것도 없다.
        """
        name = worker.name
        outlet = entry.get("outlet") or {}
        key = f"convert:{entry['x']:.0f},{entry['y']:.0f}"
        if not outlet:
            worker.block(key, BACKOFF_SECONDS)
            return
        if not self.obtain(worker, "stone-furnace", 1):
            worker.block(key, BACKOFF_SECONDS)
            return

        ore = entry.get("holding")
        try:
            worker.handle.demolish(outlet["x"], outlet["y"], timeout=420,
                                   timeout_ticks=60 * 60 * 3)
            spot = worker.handle.place("stone-furnace", outlet["x"], outlet["y"],
                                       timeout=300)
        except TaskFailed as exc:
            worker.block(key, BACKOFF_SECONDS)
            self.say(f"상자를 화로로 못 바꿨습니다: {exc.task.get('error')}", who=name)
            return

        # 상자에서 딸려온 광석과 석탄을 새 화로에 넣어준다. 없으면 그냥 둔다 -
        # 채굴기가 곧 채워준다.
        for item, amount in (("coal", FURNACE_FUEL), (ore, SMELT_BATCH)):
            if not item:
                continue
            have = worker.handle.items().get(item, 0)
            if have <= 0:
                continue
            try:
                worker.handle.insert(item, spot["x"], spot["y"],
                                     count=min(have, amount), timeout=180)
            except TaskFailed:
                pass
        self.say(f"상자를 화로로 바꿨습니다. 이제 이 채굴기는 캐는 대로 "
                 f"바로 녹습니다. ({spot['x']:.0f}, {spot['y']:.0f})", who=name)

    def lay_pipe(self, worker: Worker, at: dict) -> None:
        """끊긴 한 칸에 파이프를 놓는다."""
        name = worker.name
        if not self.obtain(worker, "pipe", 1):
            worker.block(f"pipe:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        try:
            worker.handle.place("pipe", at["x"], at["y"], timeout=420)
            self.say("파이프를 놓았습니다.", who=name)
        except TaskFailed as exc:
            worker.block(f"pipe:{at['x']:.0f},{at['y']:.0f}", 300)
            self.say(f"파이프를 못 놓았습니다: {exc.task.get('error')}", who=name)

    def plug_in(self, worker: Worker, at: dict) -> None:
        """전기가 안 통하는 기계에 닿는 자리를 물어보고 전봇대를 세운다."""
        name = worker.name
        try:
            spot = self.bridge.wire_spot(name, at["x"], at["y"])
        except RconError:
            return
        if spot.get("already"):
            return
        if spot.get("error"):
            self.say(f"전봇대가 닿는 자리가 없습니다: {spot['error']}", who=name)
            worker.block(f"plug:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        if not self.obtain(worker, "small-electric-pole", 1):
            worker.block(f"plug:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        try:
            worker.handle.place("small-electric-pole", spot["x"], spot["y"],
                                snap=True, timeout=420)
        except TaskFailed as exc:
            worker.block(f"plug:{at['x']:.0f},{at['y']:.0f}", 300)
            self.say(f"전봇대를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return
        try:
            watt = int((self.bridge.power_status(name) or {}).get("watts") or 0)
        except RconError:
            watt = 0
        self.say(f"전봇대를 세웠습니다. 전기 {watt}W" if watt
                 else "전봇대를 세웠는데 아직 0W입니다.", who=name)

    def bridge_networks(self, worker: Worker, at: dict) -> None:
        """갈라진 두 전기망 사이에 전봇대 하나를 놓는다.

        부하가 없는 기관은 0W 를 낸다. 만들지 않는 게 아니라 쓸 사람이 그
        망에 없다. 기관 셋이 «working» 인데 전력이 0W 였던 이유가 이것이다.
        """
        name = worker.name
        key = f"bridge:{at['x']:.0f},{at['y']:.0f}"
        if not self.obtain(worker, "small-electric-pole", 1):
            worker.block(key, 300)
            return
        try:
            worker.handle.place("small-electric-pole", at["x"], at["y"],
                                snap=True, timeout=420)
        except TaskFailed as exc:
            worker.block(key, 300)
            self.say(f"전봇대를 못 세웠습니다: {exc.task.get('error')}", who=name)
            return
        try:
            watt = int((self.bridge.power_status(name) or {}).get("watts") or 0)
        except RconError:
            watt = 0
        self.say(f"전기망을 이었습니다. 전력 {watt}W" if watt
                 else "전봇대는 놓았는데 아직 0W입니다. 보일러 연료를 봐야겠습니다.",
                 who=name)

    def stoke(self, worker: Worker, at: dict) -> None:
        """보일러에 석탄을 넣는다. 보일러는 0.45/s 로 태우니 20개면 44초다."""
        name = worker.name
        if not self.obtain(worker, "coal", BOILER_FUEL):
            worker.block(f"stoke:{at['x']:.0f},{at['y']:.0f}", 300)
            return
        try:
            worker.handle.insert("coal", at["x"], at["y"],
                                 count=BOILER_FUEL, timeout=300)
            self.say(f"보일러에 석탄 {BOILER_FUEL}개를 넣었습니다.", who=name)
        except TaskFailed as exc:
            worker.block(f"stoke:{at['x']:.0f},{at['y']:.0f}", 300)
            self.say(f"보일러에 못 넣었습니다: {exc.task.get('error')}", who=name)

    def shortage_jobs(self) -> list[Job]:
        """여럿이 같은 것을 부탁하면, 나르는 대신 늘린다.

        게시판에 «coal x25 (대기)»가 여섯 줄 걸린 채 굳어 있었다. 여섯 모두
        석탄이 없어서 부탁한 것이라, 서로 갖다줄 사람이 애초에 없었다.
        부탁을 돌리는 것으로는 풀 수 없는 종류의 문제다.

        이럴 때 할 일은 하나다 - 그 광석에 채굴기를 더 세우는 것. 그러면
        부탁 여섯 줄은 한 번에 사라진다.
        """
        # 창고에 얼마나 있는지부터 본다. 손에 없는 것과 없는 것은 다르다 -
        # 석탄이 상자에 9,958개 들어 있는데 「석탄이 없습니다」라며 석탄
        # 채굴기를 더 짓고 있었다. 그건 부족이 아니라 운반 문제다.
        try:
            shelved = (self.bridge.stores(next(iter(self.workers)))
                       .get("total") or {})
        except (RconError, StopIteration):
            shelved = {}

        out: list[Job] = []
        for item, (total, voices) in sorted(self.board.demand().items()):
            if voices < SHORTAGE_VOICES or item not in SMELTABLE + ("coal",):
                continue
            askers = self.board.drop_item(item)
            stocked = int(shelved.get(item) or 0)
            if stocked >= total:
                self.say(f"{len(askers)}명이 {item}을(를) 찾는데, 창고에 "
                         f"{stocked}개가 있습니다. 더 캘 일이 아니라 나를 일입니다. "
                         f"(부탁 {total}개는 내립니다)")
                continue
            self.say(f"{len(askers)}명이 {item}을(를) 찾고 있습니다. 창고에도 "
                     f"{stocked}개뿐입니다 — {item} 채굴기를 늘리겠습니다. "
                     f"(부탁 {total}개는 내립니다)")
            out.append(Job(f"{item}이 무리 전체에 모자랍니다. 채굴기를 늘립니다.",
                           key=f"shortage:{item}", routine="automate", ore=item))
        return out

    def depot_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """가방에 넘치는 것을 공용 창고에 넣는다.

        각자 안고 다니면 물자가 필요한 사람에게 가지 않는다. 옆 사람이
        철광석 150개를 든 채로 «철광석이 필요합니다»라고 말하는 일이
        실제로 벌어졌다. 한 자리에 모아두면 누구든 꺼내 쓸 수 있다.
        """
        try:
            found = self.bridge.depot()
        except RconError:
            return None

        where = found.get("depot")
        if not where:
            # 창고가 없으면 하나 세운다. 자리는 무리가 모이는 곳 - 화로 옆.
            # 상자를 손에 든 사람이 없어서 영영 안 섰으므로, 구하는 것까지
            # 루틴이 맡는다.
            base = snap.building("stone-furnace")
            if not base:
                return None
            return Job("공용 창고를 세우겠습니다.", key="depot:build",
                       routine="depot", at=base)

        surplus = [(name, count - KEEP_IN_HAND)
                   for name, count in snap.items.items()
                   if count - KEEP_IN_HAND >= DEPOT_MIN and name != "coal"]
        if not surplus:
            return None
        surplus.sort(key=lambda pair: -pair[1])
        name, amount = surplus[0]
        return Job(f"{name} {amount}개를 공용 창고에 넣겠습니다.",
                   key=f"depot:{worker.name}",
                   # 좁게 겨냥한다. 기본 반경으로는 옆 상자에 넣고, 세는
                   # 쪽은 창고를 보고 있어서 영원히 0으로 남는다.
                   steps=[("insert", {"name": name, "count": amount,
                                      "search_radius": 0.5, **where})],
                   at=where)

    def keep_busy(self, worker: Worker, snap: Snapshot) -> Job | None:
        """마지막 수단. 손으로 캐기 전에 먼저 채굴기를 늘린다.

        사람이 곡괭이를 드는 것은 0.5 광석/초고 버너 채굴기는 0.25지만,
        채굴기는 자지도 않고 걷지도 않는다. 한 번 세우면 계속 캐는 것과
        한 사람이 그 자리에 붙어 있는 것은 비교가 안 된다 - 손 채굴은
        부트스트랩 임시방편이지 일감이 아니다.
        """
        # 1. 채굴기를 하나 더. 만들 수 있으면 언제나 이쪽이 낫다.
        #    다만 연료가 모자란 판에 광석 채굴기를 더 놓으면 굶는 기계만
        #    늘어난다 - 그럴 때는 석탄 자급쌍이 먼저다.
        order = list(FOCUS_ORDER)
        if self.starving:
            order = ["coal"] + [o for o in FOCUS_ORDER if o != "coal"]
            worker_first = order
        else:
            worker_first = [worker.focus] + [o for o in order if o != worker.focus]

        if snap.can_make(DRILL) or snap.have(DRILL) >= 1:
            for ore in worker_first:
                if snap.ore(ore):
                    return Job(f"할 일이 비어 {ore} 채굴기를 하나 더 놓겠습니다.",
                               key=f"automate:{ore}:{worker.name}",
                               routine="automate", ore=ore,
                               needs={DRILL: 1})

        # 2. 정말 못 만들면 그때 손으로 캔다. 곡괭이질은 여기까지 밀린다.
        for ore in worker_first:
            spot = snap.ore(ore)
            if not spot:
                continue
            return Job(f"채굴기를 못 만들어 {ore}를 손으로 캐겠습니다.",
                       key=f"gather:{worker.name}",
                       steps=[("mine", {**spot, "count": STOCKPILE,
                                        "search_radius": 12,
                                        "timeout_ticks": 60 * 60 * 5})])
        return None

    def chain_toward(self, worker: Worker, snap: Snapshot) -> Job | None:
        """사다리의 다음 단이 요구하는 물건을 향해 한 걸음.

        예전에는 랩을 못 만들면 그냥 다른 일을 하러 갔다. 구리 광석과 화로를
        손에 쥐고도 «구리를 제련하면 회로를 만들 수 있다»는 걸 몰랐다.
        이제는 게임에게 묻는다 - 레시피 그래프도 인벤토리도 게임이 갖고 있다.
        """
        stage = mission.stage_of(snap)
        target = STAGE_TARGET.get(stage.key)
        if not target:
            return None
        item, count = target
        if snap.have(item) >= count or snap.building(item):
            return None

        try:
            answer = self.bridge.plan_item(worker.name, item, count)
        except RconError:
            return None
        if answer.get("error"):
            return None

        # 사람마다 다른 화로를 쓰게 한다. 23대가 서 있는데 한 대 앞에
        # 줄을 서는 일이 다시 생기면 안 된다.
        spots = snap.spots("stone-furnace")
        furnace = None
        if spots:
            seat = list(self.workers).index(worker.name) if worker.name in self.workers else 0
            furnace = spots[seat % len(spots)]
        elif answer.get("furnace"):
            furnace = answer["furnace"]

        job = chain_job(answer, item, furnace)
        if job:
            return job

        # 새로 캐기 전에 이미 녹아 있는 걸 먼저 꺼낸다. 사슬이 원하는
        # 것이면 한 개라도 가져온다.
        harvest = self.harvest_job(worker, self.chain_wants(answer))
        if harvest:
            return harvest

        # 사슬의 맨 밑이 땅이면 캐러 간다. 무엇을 얼마나 캐야 하는지도
        # 게임이 세어줬다.
        for ore, amount in sorted((answer.get("mine") or {}).items()):
            # 나무는 광맥이 아니다. 전봇대가 나무 1개를 요구하는데 벨 줄을
            # 몰라서 전력이 통째로 막혀 있었다.
            if ore == "wood":
                return Job(f"{item}을(를) 만들려면 나무가 {int(amount)}개 필요합니다. 베러 갑니다.",
                           key="chain:chop",
                           steps=[("chop", {"x": snap.x, "y": snap.y,
                                            "count": max(4, min(int(amount) * 2, 40)),
                                            "timeout_ticks": 60 * 60 * 3})])
            spot = snap.ore(ore)
            if not spot:
                continue
            wanted = max(10, min(int(amount), 100))
            return Job(f"{item}을(를) 만들려면 {ore}가 {int(amount)}개 필요합니다. 캐러 갑니다.",
                       key=f"chain:mine:{ore}",
                       steps=[("mine", {**spot, "count": wanted, "search_radius": 10,
                                        "timeout_ticks": 60 * 60 * 5})])

        # 잠긴 레시피가 막고 있으면 말이라도 해준다. 조용히 멈춰 있는 것이
        # 제일 나쁘다.
        locked = sorted((answer.get("locked") or {}))
        if locked:
            worker.block(f"chain:{item}", 300)
            self.say(f"{item}은(는) {locked[0]} 연구가 없어서 못 만듭니다.", who=worker.name)
        return None

    def tend_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """멈춰 선 기계를 고친다. 새로 짓는 것보다 먼저다.

        연료가 떨어진 채굴기, 출력이 꽉 찬 화로 - 지어놓고 아무도 돌아오지
        않아서 멈춘 것들이다. 멈춘 기계는 지어지지 않은 기계보다 나쁘다.
        재료는 이미 들어갔는데 아무것도 내놓지 않기 때문이다.

        무엇이 왜 멈췄는지는 짐작하지 않는다. 게임이 기계마다 status 로
        들고 있고, 거기에 답이 적혀 있다.
        """
        try:
            stopped = self.bridge.broken(worker.name)
        except RconError:
            return None

        # 정비는 끝이 없다. 버너 드릴 열여덟 대는 계속 연료가 떨어지고,
        # 여섯 명이 전부 거기 매달리면 발전소는 영영 안 선다. 손이 모자란
        # 것과 할 일이 없는 것은 다르다 - 절반만 돌본다.
        tending = sum(1 for key in self.claims if key.startswith("tend:"))
        if tending >= max(1, len(self.workers) // 2):
            return None

        # 진짜 고장이 먼저고, 노는 화로를 먹이는 일은 그 뒤다. 순서를
        # 거꾸로 하면 빈 화로 스무 대가 연료 떨어진 드릴을 가린다.
        self.starving = sum(1 for e in stopped if e.get("fix") == "fuel") >= STARVING
        rank = {"fuel": 0, "chest": 1, "empty": 2, "feed": 3}
        stopped.sort(key=lambda e: (rank.get(e.get("fix"), 9), e.get("distance", 0)))

        taken = self.taken()
        for entry in stopped:
            key = f"tend:{entry['x']:.0f},{entry['y']:.0f}"
            if key in taken or key in worker.blocked_now():
                continue
            at = {"x": entry["x"], "y": entry["y"]}
            what, fix = entry.get("name", "기계"), entry.get("fix")

            if fix == "fuel":
                if snap.have("coal") < DRILL_FUEL:
                    # 연료를 넣어주려면 연료가 있어야 한다. 부탁의 근거가 된다.
                    continue
                return Job(f"{what}이(가) 연료가 떨어져 멈췄습니다. 석탄을 넣겠습니다.",
                           key=key, needs={"coal": DRILL_FUEL},
                           steps=[("insert", {"name": "coal", "count": DRILL_FUEL, **at})])

            if fix == "empty":
                # 무엇이 찼는지는 화로 재고 쪽이 안다. 이름 없이 꺼낼 수는
                # 없으므로 거두기에 맡긴다.
                harvest = self.harvest_job(worker)
                if harvest:
                    return harvest
                continue

            if fix == "feed":  # noqa: SIM102 - 묶음은 배차 쪽에서 다룬다
                # 공장은 끊임없이 돌아야 한다. 목표에 필요한 만큼만 녹이면
                # 화로 절반이 서 있고, 그동안 광석은 가방에서 잠잔다.
                ore = max(SMELTABLE, key=lambda o: snap.have(o), default=None)
                if not ore or snap.have(ore) < SMELT_BATCH                         or snap.have("coal") < FURNACE_FUEL:
                    continue
                return Job(f"화로가 비어 있습니다. {ore}를 넣어 계속 돌리겠습니다.",
                           key=key, needs={"coal": FURNACE_FUEL, ore: SMELT_BATCH},
                           steps=[
                               ("insert", {"name": "coal", "count": FURNACE_FUEL, **at}),
                               ("insert", {"name": ore, "count": SMELT_BATCH, **at}),
                           ])

            if fix == "chest":
                # 내놓을 데가 없어 멈췄다. 상자가 꽉 찼으면 비우면 되고,
                # 아예 없으면 달아줘야 한다 - 손보는 방법이 다르다.
                if entry.get("holding") and entry.get("outlet"):
                    # 녹일 수 있는 광석이 찬 상자라면, 비우는 대신 그 자리를
                    # 화로로 바꾼다. 비우기는 이 채굴기를 한 번 살리고 20분
                    # 뒤에 똑같이 막힌다. 화로는 영원히 받아준다 - 채굴기가
                    # 캔 광석이 바로 화로로 들어가니 나를 일 자체가 없어진다.
                    #
                    # 상자를 캐면 안에 든 것이 가방으로 따라온다. 그 광석을
                    # 그대로 새 화로에 넣으면 버리는 것도 없다.
                    if entry["holding"] in SMELTED_BY_FURNACE:
                        return Job(
                            f"{what}의 상자가 {entry['holding']}으로 꽉 찼습니다. "
                            f"상자를 화로로 바꾸면 다시 막히지 않습니다.",
                            key=f"convert:{entry['x']:.0f},{entry['y']:.0f}",
                            routine="convert", at=entry)
                    return Job(
                        f"{what}의 상자가 꽉 차서 멈췄습니다. 비우겠습니다.",
                        key=key,
                        steps=[("take", {"name": entry["holding"],
                                         "count": int(entry.get("held") or 1),
                                         **entry["outlet"]})])
                return Job(f"{what}이(가) 내놓을 데가 없어 멈췄습니다. 상자를 달겠습니다.",
                           key=key, routine="rescue", at=at, needs={CHEST: 1})

        return None

    def harvest_job(self, worker: Worker, wanted: set[str] | None = None) -> Job | None:
        """화로에 다 녹아 있는 것을 거둬온다.

        이건 «여유 있으면 하는 일»이 아니다. 출력 슬롯이 찬 화로는 제련을
        멈춘다. 즉 거두지 않은 판금은 그 자체로 병목이고, 새 광석을 캐러
        가는 것보다 언제나 먼저다 - 실제로 화로 안에 철판 100개를 재워둔 채
        «철광석 25개를 캐야 한다»고 말하고 있었다.

        조금 녹은 걸 계속 집으러 다니면 그것대로 낭비라, 쌓인 것만 거둔다.
        사슬이 지금 당장 필요로 하는 것은 한 개라도 가져온다.
        """
        try:
            stock = self.bridge.furnace_stock(worker.name)
        except RconError:
            return None

        taken = self.taken()
        for entry in stock:
            name, count = entry.get("name"), int(entry.get("count") or 0)
            if count < HARVEST_MIN and not (wanted and name in wanted):
                continue
            key = f"harvest:{entry['x']:.0f},{entry['y']:.0f}"
            if key in taken:
                continue
            return Job(f"화로에 {name} {count}개가 다 녹아 있습니다. 거둬오겠습니다.",
                       key=key,
                       steps=[("take", {"name": name, "count": count,
                                        "x": entry["x"], "y": entry["y"]})])
        return None

    @staticmethod
    def chain_wants(answer: dict) -> set[str]:
        """사슬이 이름을 부른 모든 물건."""
        wanted = set(answer.get("mine") or {})
        for step in _as_rows(answer.get("steps")):
            if step.get("name"):
                wanted.add(step["name"])
            if step.get("input"):
                wanted.add(step["input"])
        return wanted

    def defence_job(self, worker: Worker, snap: Snapshot) -> Job | None:
        """터렛을 미리 세운다.

        습격이 온 다음에 짓기 시작하면 이미 늦다. 터렛은 낭비가 아니라
        대비고, 총알을 넣어두지 않은 터렛은 세우지 않은 것과 같다.

        자리는 기지 둘레다 - 화로가 모인 곳을 기지로 보고, 네 방향으로
        조금 떨어뜨려 세운다.
        """
        if not self.danger.get("can_build_turret"):
            return None
        if int(self.danger.get("turrets") or 0) >= TURRET_TARGET:
            return None

        base = snap.building("stone-furnace") or {"x": snap.x, "y": snap.y}
        nth = int(self.danger.get("turrets") or 0)
        corner = ((1, 1), (-1, 1), (-1, -1), (1, -1))[nth % 4]
        spot = {"x": base["x"] + corner[0] * TURRET_RING,
                "y": base["y"] + corner[1] * TURRET_RING}
        return Job(f"터렛을 미리 세웁니다 ({nth + 1}/{TURRET_TARGET}).",
                   key=f"defend:{nth}", routine="defend", at=spot)

    def build_defence(self, worker: Worker, spot: dict) -> None:
        """터렛 한 대를 세우고 총알을 채운다."""
        name = worker.name
        try:
            if not self.obtain(worker, "gun-turret", 1):
                self.say("터렛을 못 만들었습니다.", who=name)
                worker.block("defend", 300)
                return
            placed = worker.handle.place("gun-turret", spot["x"], spot["y"],
                                         snap=True, timeout=420)
            if self.obtain(worker, "firearm-magazine", TURRET_AMMO):
                worker.handle.insert("firearm-magazine", placed["x"], placed["y"],
                                     count=TURRET_AMMO, timeout=180)
                self.say(f"터렛을 세우고 총알 {TURRET_AMMO}발을 넣었습니다. "
                         f"({placed['x']:.0f}, {placed['y']:.0f})", who=name)
            else:
                self.say("터렛은 세웠는데 총알이 없습니다. 빈 터렛은 세우지 않은 것과 같습니다.",
                         who=name)
        except TaskFailed as exc:
            worker.block("defend", 300)
            self.say(f"터렛을 못 세웠습니다: {exc.task.get('error')}", who=name)
        except RconError as exc:
            worker.block("defend", 300)
            self.say(f"방어 구축 중 오류: {exc}", who=name)

    def watch_for_trouble(self) -> None:
        """둥지가 가까워지는지 지켜보고, 필요하면 방어를 목표에 올린다.

        공해는 퍼져서 둥지에 닿고, 닿으면 그쪽이 찾아온다. 첫 습격이 온
        다음에 터렛을 만들기 시작하면 이미 늦다. 그런데 터렛은 military
        연구 뒤에 있고 그 연구는 전력이 있어야 돌아가므로, 전력이 곧
        방어의 선행 조건이다 - 그 사실을 사람에게 말해두는 것도 대비다.
        """
        now = time.monotonic()
        if now < self.threat_checked or not self.workers:
            return
        self.threat_checked = now + THREAT_CHECK

        scout = next(iter(self.workers.values()))
        try:
            found = self.bridge.threat(scout.name)
        except RconError:
            return
        if found.get("error"):
            return

        self.danger = found
        attackers = int(found.get("attackers") or 0)
        nest = found.get("nearest_nest")
        armed = bool(found.get("can_build_turret"))

        if attackers:
            note = (f"적 {attackers}마리가 {found.get('nearest_attacker')}타일 앞에 "
                    f"있습니다.")
        elif nest is not None and nest < NEST_ALARM:
            note = f"둥지가 {nest}타일까지 왔습니다. 공해가 닿으면 찾아옵니다."
        else:
            return

        if not armed:
            note += " 터렛은 military 연구가 있어야 만들 수 있고, 그 연구는 전력이 필요합니다."
        if note != self.danger_said:
            self.danger_said = note
            self.say(note)

    def keep_research_going(self) -> None:
        """연구가 멈춰 있으면 다시 건다.

        숙련자들이 입을 모으는 첫 번째 경보가 «랩이 놀고 있다»다. 우리는
        랩을 세워놓고 연구를 하나도 걸지 않은 채 광석을 캐고 있었다.

        2.0 의 앞쪽 기술들은 과학팩이 아니라 «무엇을 만들었는가»로 열리는데,
        그 트리거도 현재 연구로 걸려 있어야 세어진다. 그래서 랩을 만들고도
        automation-science-pack 이 안 열렸다.
        """
        now = time.monotonic()
        if now < self.research_checked:
            return
        self.research_checked = now + RESEARCH_CHECK

        try:
            status = self.bridge.research_status()
            if status.get("current"):
                return
            options = self.bridge.available_research()
        except RconError:
            return
        if not options:
            return

        # 트리거 기술은 랩이 연구하는 것이 아니라 «무엇을 만들면» 열린다.
        # 큐에 넣으려 하면 엔진이 거부하므로, 걸 수 있는 것부터 건다.
        queueable = [t for t in options if not t.get("trigger_type")]

        def rank(tech: dict) -> tuple:
            name = tech.get("name", "")
            order = (RESEARCH_ORDER.index(name) if name in RESEARCH_ORDER
                     else len(RESEARCH_ORDER))
            return (order, name)

        queueable.sort(key=rank)
        for pick in queueable:
            try:
                reply = self.bridge.research(pick["name"])
            except RconError:
                return
            if not reply.get("error") and reply.get("queued"):
                self.say(f"연구를 걸었습니다: {pick['name']}")
                return

        # 걸 수 있는 게 없으면 열쇠는 제작이다. 사다리가 그걸 목표로 삼고
        # 있으므로 여기서는 사람에게 알리기만 한다.
        for pick in options:
            if pick.get("trigger_type") == "craft-item":
                # 20초마다 같은 줄을 반복하면 채팅창이 가려진다.
                if self.research_said == pick["name"]:
                    return
                self.research_said = pick["name"]
                self.say(f"«{pick['name']}»은(는) {pick.get('trigger_item')} "
                         f"{pick.get('trigger_count', 1)}개를 손으로 만들면 열립니다.")
                return

    def announce_stage(self, snap: Snapshot) -> None:
        """사다리에서 한 단 오르면 알린다.

        무리가 지금 어디쯤인지 사람이 알 방법이 이것뿐이다. 매번 말하면
        소음이니, 바뀔 때만 말한다.
        """
        here = mission.stage_of(snap)
        self.goal_line = mission.briefing(snap)
        if here.key == self.stage:
            return
        self.stage = here.key
        self.say(self.goal_line)

    def show_board(self) -> None:
        """게임 안 패널에 목표와 대기 중인 부탁을 실어보낸다."""
        lines = tuple(self.board.summary())
        state = (self.goal_line, lines)
        if state == self.shown:
            return
        try:
            self.bridge.set_board(self.goal_line, list(lines))
        except RconError:
            return
        self.shown = state

    # -- 부탁 -------------------------------------------------------------

    def ask_for(self, worker: Worker, item: str, count: int, reason: str) -> None:
        """게시판에 부족분을 붙이고, 채팅으로도 말한다.

        채팅으로 말하는 게 중요하다. 사람이 보고 있는 화면은 게시판이 아니라
        채팅창이고, 누가 왜 멈춰 있는지는 거기에 나와야 한다.
        """
        req = self.board.post(worker.name, item, count, reason, time.monotonic())
        if req is None:
            return
        self.say(f"{reason} — {item} {count}개가 필요합니다. 여유 있는 분 부탁드립니다.",
                 who=worker.name)

    def serve_board(self, worker: Worker, snap: Snapshot, idle: bool) -> bool:
        """남이 붙여둔 부탁을 집는다. 집었으면 True.

        이미 손에 쥐고 있으면 하던 일을 잠깐 미루고 갖다준다 — 걸어가기만
        하면 되니 싸다. 없는 걸 캐다 주는 심부름은 달리 할 일이 없을 때만
        받는다. 그러지 않으면 온 무리가 심부름꾼이 된다.
        """
        if worker.errand:
            return True

        req = self.board.offer(worker.name, snap.items)
        fetch = False
        if req is None and idle:
            req = self.board.errand(worker.name)
            # 캐올 데가 안 보이는 부탁은 받아봐야 못 지킨다.
            if req is not None and not snap.ore(req.item):
                req = None
            fetch = req is not None
        if req is None:
            return False

        steps: list[Step] = []
        if fetch:
            spot = snap.ore(req.item)
            steps.append(("mine", {**spot, "count": req.count, "search_radius": 10,
                                   "timeout_ticks": 60 * 60 * 5}))
        steps.append(("give", {"to": req.asker, "name": req.item, "count": req.count}))

        try:
            ids = worker.handle.submit_plan(steps)
        except RconError as exc:
            self.say(f"심부름을 못 맡겠습니다: {exc}", who=worker.name)
            return False

        self.board.take(req, worker.name, time.monotonic())
        worker.watching = ids
        worker.errand = (ids[-1], req)
        worker.said_idle = False
        verb = "캐다 드리겠습니다" if fetch else "갖다 드리겠습니다"
        self.say(f"{req.asker}님, {req.item} {req.count}개 {verb}.", who=worker.name)
        return True

    def check_errand(self, worker: Worker) -> None:
        """실어나르던 부탁이 끝났는지 본다."""
        if not worker.errand:
            return
        task_id, req = worker.errand
        try:
            state = self.bridge.poll(task_id)
        except RconError:
            return
        status = state.get("status")
        if status in ("queued", "running"):
            return

        worker.errand = None
        if status == "done":
            self.board.fill(req)  # type: ignore[arg-type]
            self.say(f"{req.asker}님께 {req.item} {req.count}개 전달했습니다.",
                     who=worker.name)
            # 받은 쪽은 상황이 달라졌다. 아까 막혔던 일을 다시 해보게 한다.
            asker = self.workers.get(req.asker)
            if asker:
                asker.blocked.clear()
                asker.said_idle = False
        else:
            self.board.release(worker.name)
            self.say(f"{req.asker}님 부탁을 못 지켰습니다: {state.get('error')}",
                     who=worker.name)

    @staticmethod
    def where_lost(trouble: str) -> tuple[int, int] | None:
        """실패 메시지에서 «어디서» 못 갔는지 읽는다.

        「no path from 92.2,6.1 to -54,-66」에서 앞의 좌표. 뒤의 좌표는
        목적지라 매번 다르고, 갇힌 것은 앞자리다.
        """
        hit = re.search(r"from\s+(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", trouble)
        if not hit:
            hit = re.search(r"stuck at\s+(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",
                            trouble)
        if not hit:
            return None
        return (round(float(hit.group(1))), round(float(hit.group(2))))

    def count_lost(self, worker: Worker, trouble: str) -> None:
        """같은 자리에서 거듭 못 가면 꺼내준다.

        한 명이 호숫가에 한 시간 넘게 서서 같은 실패만 반복했다. 서로 다른
        실패 44종 중 25종이 그 한 좌표에서 나왔다. 죽은 인력이었을 뿐
        아니라, 동쪽 일감에 「가장 가까운 사람」이라 배차를 계속 빨아들였다.

        걸어서 못 나오는 곳에 있으면 걸어서 꺼낼 수 없다.
        """
        here = self.where_lost(trouble)
        if here is None:
            return
        if worker.lost_at != here:
            worker.lost_at, worker.lost_count = here, 1
            return

        worker.lost_count += 1
        if worker.lost_count < STUCK_STRIKES:
            return
        worker.lost_at, worker.lost_count = None, 0
        try:
            moved = self.bridge.unstick(worker.name)
        except RconError:
            return
        if moved.get("error"):
            self.say(f"({here[0]}, {here[1]})에서 못 나가는데 옮길 데도 "
                     f"없습니다: {moved['error']}", who=worker.name)
            return
        worker.blocked.clear()
        self.say(f"({here[0]}, {here[1]})에 갇혀서 {moved.get('moved', 0)}타일 "
                 f"떨어진 동료 옆으로 옮겼습니다.", who=worker.name)

    def report_finished(self) -> None:
        for worker in self.workers.values():
            still: list[int] = []
            for task_id in worker.watching:
                state = self.bridge.poll(task_id)
                status = state.get("status")
                if status in ("queued", "running"):
                    still.append(task_id)
                elif status == "failed":
                    kind = state.get("type") or "unknown"
                    # Remember what failed. Re-proposing it every second is how
                    # one unreachable furnace fills the chat with the same line.
                    worker.block(kind)

                    # 「길이 없다」는 세상에 길이 없다는 뜻이 아니라 이 사람이
                    # 못 간다는 뜻이다. 실제로 한 명이 호수 건너에 서서 같은
                    # 실패를 다섯 번 반복했다 - 직선거리로는 73타일이었지만
                    # 걸어서는 물을 크게 돌아야 했다.
                    #
                    # 이 일감을 이 사람에게만 오래 막아두면, 배차가 다음
                    # 사람에게 넘긴다.
                    trouble = str(state.get("error") or "")
                    if worker.job_key and ("no path" in trouble
                                           or "stuck" in trouble):
                        worker.block(worker.job_key, UNREACHABLE_QUIET)
                        self.count_lost(worker, trouble)
                    self.say(f"{kind} 실패: {state.get('error')}", who=worker.name)
                    # 방금 실제로 해보고 없다는 걸 알았다. 짐작이 아니므로
                    # 이걸 근거로 동료에게 부탁해도 된다.
                    want = missing_item(kind, state.get("error") or "",
                                        state.get("params"))
                    if want:
                        self.ask_for(worker, want, self.wanted(want),
                                     f"{kind} 작업이 막혔습니다")
            worker.watching = still

    @staticmethod
    def wanted(item: str) -> int:
        """부탁할 때 몇 개나 달라고 할지.

        광석은 한 번 제련할 만큼, 나머지는 하나면 된다. 스무 개짜리 부탁을
        한 개로 붙이면 받아도 또 막힌다."""
        if item in ("iron-ore", "copper-ore", "coal", "stone"):
            return ORE_BATCH
        return 1

    # -- dispatch ----------------------------------------------------------

    def handle(self, worker: Worker, intent: Intent, speaker: str) -> None:
        kind, params = intent
        name = worker.name
        handle = worker.handle

        if kind == "stop":
            worker.autopilot = False
            handle.cancel()
            worker.watching = []
            self.say("멈췄습니다.", who=name)

        elif kind == "autopilot_on":
            worker.autopilot = True
            worker.said_idle = False
            self.say("자율로 진행하겠습니다.", who=name)

        elif kind == "autopilot_off":
            worker.autopilot = False
            self.say("대기하겠습니다.", who=name)

        elif kind == "come":
            snap = worker.snapshot()
            here = next((h for h in snap.humans if h["name"] == speaker), None) \
                or (snap.humans[0] if snap.humans else None)
            if not here:
                self.say("어디로 갈지 모르겠습니다.", who=name)
                return
            self.say(f"{here['name']}님께 가겠습니다.", who=name)
            worker.watching = handle.submit_plan(
                [("walk_to", {"x": here["x"] + 2, "y": here["y"], "tolerance": 1.5})])

        elif kind == "mine":
            snap = worker.snapshot()
            spot = snap.ore(params["ore"])
            if not spot:
                self.say(f"{params['ore']} 광맥이 주변 200타일 안에 안 보입니다.", who=name)
                return
            # Stand a few tiles apart inside the patch; the task widens its own
            # search so the offset does not have to land on ore exactly.
            spread = params.get("spread", 0) * 3
            self.say(f"{params['ore']} {params['count']}개 캐러 갑니다. "
                     f"({spot['x']:.0f}, {spot['y']:.0f})", who=name)
            worker.watching = handle.submit_plan([("mine", {
                "x": spot["x"] + spread, "y": spot["y"],
                "count": params["count"], "search_radius": 10,
                "timeout_ticks": 60 * 60 * 5,
            })])

        elif kind == "place":
            entity, count = params["entity"], params["count"]
            snap = worker.snapshot()
            have = snap.have(entity)
            if have < 1:
                self.say(f"{entity}이(가) 없습니다.", who=name)
                return
            count = min(count, have)
            self.say(f"{entity} {count}개 설치하겠습니다.", who=name)
            worker.watching = handle.submit_plan([
                ("build", {"name": entity, "x": snap.x + 3 + i, "y": snap.y + 3, "snap": True})
                for i in range(count)
            ])

        elif kind == "craft":
            self.say(f"{params['recipe']} {params['count']}개 제작합니다.", who=name)
            worker.watching = handle.submit_plan(
                [("craft", {"recipe": params["recipe"], "count": params["count"]})])

        elif kind == "automate":
            if not self.start_routine(worker, "automate", params.get("ore")):
                self.say("앞의 작업을 아직 하는 중입니다.", who=name)

        elif kind == "report_inventory":
            items = worker.snapshot().items
            self.say(", ".join(f"{k} {v}" for k, v in sorted(items.items())) or "빈손입니다.",
                     who=name)

        elif kind == "report_scout":
            snap = worker.snapshot()
            lines = sorted(snap.resources.items(), key=lambda kv: kv[1]["nearest_dist"])[:4]
            self.say(" / ".join(
                f"{res} {info['nearest_dist']:.0f}타일 "
                f"({info['nearest']['x']:.0f},{info['nearest']['y']:.0f})"
                for res, info in lines) or "주변에 자원이 안 보입니다.", who=name)

        elif kind == "report_status":
            state = handle.status()
            doing = state.get("current")
            self.say(f"{'자율' if worker.autopilot else '대기'} 모드, "
                     f"({state.get('x', 0):.0f}, {state.get('y', 0):.0f}), "
                     f"{doing['type'] if doing else '유휴'}", who=name)

    def handle_crew(self, intent: Intent, speaker: str, target: str | None) -> bool:
        """Roster and observer commands, which belong to nobody in particular."""
        kind, params = intent

        if kind == "panel":
            try:
                state = self.bridge.panel(speaker)
                self.say("현황판을 " + ("띄웠습니다." if state.get("open") else "닫았습니다."))
            except RconError as exc:
                self.say(f"현황판 실패: {exc}")
            return True

        if kind == "save":
            try:
                self.bridge.save()
                self.say("저장했습니다.")
            except RconError as exc:
                self.say(f"저장 실패: {exc}")
            return True

        if kind == "add_agent":
            for _ in range(min(params.get("count", 1), len(CALL_SIGNS))):
                if not self.hire():
                    break
            return True

        if kind == "remove_agent":
            victim = target if target in self.workers else (self.names[-1] if self.names else None)
            if not victim:
                self.say("내보낼 에이전트가 없습니다.")
            else:
                self.fire(victim)
            return True

        if kind == "list_agents":
            if not self.workers:
                self.say("에이전트가 없습니다. '에이전트 추가'라고 하시면 만들겠습니다.")
                return True
            parts = []
            for index, state in enumerate(self.bridge.list(), start=1):
                doing = state.get("current")
                parts.append(f"{index}. {state['name']} "
                             f"({state.get('x', 0):.0f},{state.get('y', 0):.0f}) "
                             f"{doing['type'] if doing else '유휴'}")
            self.say(" | ".join(parts))
            return True

        if kind == "observer":
            try:
                # Their body becomes a worker rather than a corpse in a field.
                free = next((s for s in CALL_SIGNS if s not in self.workers), None)
                result = self.bridge.spectate(speaker, adopt_as=free)
            except RconError as exc:
                self.say(f"관찰자 전환 실패: {exc}")
                return True
            try:
                # A watcher with no body should not have to ask for the list,
                # nor for what the crew is saying to each other.
                self.bridge.panel(speaker, True)
                self.bridge.chat_window(speaker, True)
            except RconError:
                pass
            adopted = result.get("adopted")
            if adopted:
                self.adopt(adopted)
                self.say(f"{speaker}님은 관찰자입니다. 쓰시던 캐릭터는 {adopted}이(가) 이어받았습니다.")
            else:
                self.say(f"{speaker}님은 관찰자입니다.")
            return True

        if kind == "unobserver":
            try:
                self.bridge.unspectate(speaker)
                self.say(f"{speaker}님 몸으로 돌아왔습니다.")
            except RconError as exc:
                self.say(f"복귀 실패: {exc}")
            return True

        return False

    # -- loop -------------------------------------------------------------

    def tick(self) -> None:
        self.collect_thoughts()
        self.collect_orders()
        for worker in self.workers.values():
            self.check_errand(worker)
        self.report_finished()
        self.keep_research_going()
        self.watch_for_trouble()
        self.board.expire(time.monotonic())
        self.show_board()

        log = self.bridge.chat(self.since_tick)
        self.since_tick = log.get("tick", self.since_tick)
        messages = log.get("messages") or []

        for line in messages:
            speaker = line.get("player", "")
            text = line.get("message", "")
            print(f"[chat] {speaker}: {text}")
            # 반장이 유일한 입구다. 예전에는 문장에서 낱말을 주워 인텐트를
            # 만들었는데, «작업이 멈춰있음»이라는 보고에서 «멈춰»를 집어
            # 전원이 정지하는 식으로 계속 틀렸다. 문장은 읽을 줄 아는 쪽이
            # 읽어야 한다.
            self.delegate(text, speaker)

        if messages:
            return

        # 먼저 «누가 손이 비었는가»를 한 번에 본다. 각자 자기 스냅샷만 보고
        # 가장 급한 일 하나씩 고르면, 급한 일이 셋일 때 나머지는 서 있는다.
        free: list[tuple[Worker, Snapshot]] = []
        for worker in self.workers.values():
            if not worker.autopilot:
                continue
            # A long routine holds the slot; do not start a second one on top.
            if not worker.slot.acquire(blocking=False):
                continue
            worker.slot.release()
            try:
                if worker.handle.busy():
                    continue
                free.append((worker, worker.snapshot()))
            except RconError:
                continue

        if not free:
            return
        self.snaps = {w.name: snap for w, snap in free}

        # 반장이 판을 보고 나눠준다. 여기서 받은 사람은 각자 고르지 않는다.
        handed: set[str] = set()
        now = time.monotonic()
        if now >= self.dispatched_at:
            self.dispatched_at = now + DISPATCH_INTERVAL
            try:
                handed = self.dispatch(free)
            except RconError:
                handed = set()

        for worker, snap in free:
            if worker.name in handed:
                continue

            # 남이 나에게 부탁하려면 내가 뭘 쥐고 있는지 알아야 한다.
            self.stock[worker.name] = dict(snap.items)
            self.announce_stage(snap)

            self.release(worker)

            # 가방을 부리는 것은 개인 용무지 공용 일감이 아니다. 공용
            # 배차에 섞어뒀더니 주인이 마침 손이 빈 그 순간에만 걸려서,
            # 광석 725개를 안고도 한참을 그냥 다녔다.
            job = self.depot_job(worker, snap)
            if job and job.key != "depot:build":
                self.claim(worker, job.key)
                self.say(job.narration, who=worker.name)
                worker.said_idle = False
                try:
                    worker.watching = worker.handle.submit_plan(job.steps)
                    continue
                except RconError:
                    self.release(worker)

            # 멈춘 기계와 찬 화로는 배차가 맡는다. 여기서 또 물어보면
            # 같은 것을 여덟 번 조회하게 되고, 그 사이 배차가 이미 누구에게
            # 준 일을 두 번 잡으려 든다.
            job = None
            if job is None:
                job = next_goal(snap, worker.focus, worker.blocked_now(), self.taken(),
                                crew=len(self.workers))

            # «비축»밖에 안 남았다는 건 할 일이 없다는 뜻이지 광석을 더
            # 쌓으라는 뜻이 아니다. 그럴 때 사다리의 다음 단을 물어본다.
            if job is None or job.key.startswith("stock:"):
                chained = self.chain_toward(worker, snap)
                if chained and chained.key not in self.taken() \
                        and chained.key not in worker.blocked_now():
                    job = chained

            # 부탁이 내 일보다 먼저다. 이미 쥔 걸 건네주는 건 걸어가기만
            # 하면 되고, 기다리는 쪽은 그동안 아무것도 못 한다.
            if self.serve_board(worker, snap, idle=job is None):
                continue

            if job is None:
                # 일감 종류가 사람 수보다 적으면 나머지는 서 있게 된다.
                # 광맥은 무한하고 화로는 언제나 배가 고프므로, 정말로 할
                # 일이 없다는 것은 캘 곳이 없다는 뜻일 때뿐이다.
                job = self.keep_busy(worker, snap)
            if job is None:
                # 규칙이 막혔다. 서 있느니 물어본다.
                if self.ask_when_stuck(worker, snap):
                    continue
                if not worker.said_idle:
                    self.say(f"당장 할 일이 없습니다. {mission.briefing(snap)}",
                             who=worker.name)
                    worker.said_idle = True
                continue

            # 재료가 모자란 일은 시작하기 전에 부탁을 붙이고 물러난다.
            # 시작해놓고 실패하는 것보다 낫고, 기다리는 동안 다른 일을 한다.
            # 스스로 만들 수 있는 것은 부탁하지 않는다. 상자가 없다고
            # 부탁을 걸고 일을 접으면, 만들 줄 알면서도 영영 안 만든다 -
            # 실제로 드릴 여덟 대에 상자 다섯 개인 채로 멈춰 있었다.
            short = mission.shortfall(job.needs, snap.items)
            if short and snap.can_make(short[0], short[1]):
                short = None
            if short and not snap.ore(short[0]):
                self.ask_for(worker, short[0], short[1], job.narration)
                worker.block(job.key)
                continue

            worker.said_idle = False
            self.claim(worker, job.key)
            self.say(job.narration, who=worker.name)
            if job.routine:
                self.start_routine(worker, job.routine, job.ore, job.at)
            else:
                worker.watching = worker.handle.submit_plan(job.steps)

    def prime(self) -> None:
        """Start from now.

        The mod keeps the last 50 chat lines, so a fresh crew that polled with no
        `since_tick` would read the whole backlog and start obeying orders given
        twenty minutes ago to a process that no longer exists.
        """
        self.since_tick = self.bridge.chat().get("tick")

    def run(self, interval: float = 1.0) -> None:
        print(f"listening to game chat - {len(self.workers)} agent(s)"
              + (", working on their own" if self.autopilot else ", waiting for orders")
              + " - ctrl-c to stop")
        while True:
            try:
                self.tick()
            except RconError as exc:
                print(f"[warn] {exc}", file=sys.stderr)
                time.sleep(3)
            time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agents", type=int, default=2, help="how many to start with")
    parser.add_argument("--manual", action="store_true",
                        help="wait for orders instead of working on their own")
    parser.add_argument("--no-llm", action="store_true",
                        help="rules only; do not ask the Claude CLI about unknown lines")
    parser.add_argument("--observer", metavar="PLAYER",
                        help="put this player in the observer seat on startup")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    bridge = AIBridge()
    crew = Crew(bridge, autopilot=not args.manual, use_llm=not args.no_llm)
    crew.prime()
    crew.sync_roster()

    if args.observer:
        try:
            free = next((s for s in CALL_SIGNS if s not in crew.workers), None)
            result = bridge.spectate(args.observer, adopt_as=free)
            if result.get("adopted"):
                crew.adopt(result["adopted"])
        except RconError as exc:
            print(f"[warn] could not switch {args.observer} to observer: {exc}", file=sys.stderr)

    while len(crew.workers) < max(1, args.agents):
        if not crew.hire():
            break

    roles = ", ".join(f"{w.name}={w.focus}" for w in crew.workers.values())
    crew.say(f"{len(crew.workers)}명 나왔습니다 ({roles}). "
             + ("지시 기다리겠습니다." if args.manual else "알아서 진행하겠습니다.")
             + f" '{'/'.join(crew.names)}' 또는 '1번', '모두'로 부르시면 됩니다.")
    try:
        crew.run(interval=args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        # Leaving without saving is how an hour of the crew's work disappears.
        try:
            bridge.save()
            print("saved the world before leaving")
        except RconError as exc:
            print(f"[warn] could not save on the way out: {exc}", file=sys.stderr)
        bridge.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

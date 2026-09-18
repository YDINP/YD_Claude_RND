"""어디에 놓을 것인가 - 순수 계산.

게임도 네트워크도 건드리지 않는다. 배치가 틀렸을 때 게임 창을 들여다보며
디버깅하는 대신 여기에 테스트를 쓸 수 있는 것이 이 경계의 값어치다.
"""

from __future__ import annotations

from itertools import zip_longest

from settings import (BELT_REACH, CHEST, CHEST_REACH, CLUSTER_MAX, CLUSTER_REACH,
                      CRAFT_PITCH, CRAFT_ROW, DRILL, FURNACE_AISLE, FURNACE_GAP,
                      FURNACE_PITCH, FURNACE_ROW, HAUL_REACH)
from world import Snapshot


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
    # 넉넉한 곳을 먼저 본다. 딱 맞는 양만 든 상자는 우리가 도착할 때쯤
    # 동료가 이미 비워두기 쉽다 - 여덟이 같은 상자를 노리고 있어서다.
    # 실제로 창고에 석탄이 22,884개인데 「no coal to insert」가 열 번
    # 나왔다. 없어서가 아니라, 고른 상자가 도착했을 때 비어 있어서다.
    for bar in (least * 4, least):
        best, best_d = None, reach * reach
        for spot in spots:
            if int(spot.get("count") or 0) < bar:
                continue
            d = ((spot["x"] - at["x"]) ** 2 + (spot["y"] - at["y"]) ** 2)
            if d < best_d:
                best, best_d = spot, d
        if best is not None:
            return best
    return None


def furnace_seat(origin: dict, nth: int,
                 pitch: int = FURNACE_PITCH) -> dict:
    """n번째 화로가 설 자리. 두 줄이 마주보는 블록으로 쌓는다.

    세 번 고쳤다. 처음에는 `x + pitch * n` 한 줄이었고, 열아홉 대째가
    274타일 밖에 섰다. 다음에는 여섯 칸마다 줄을 바꿨는데 그래도 오른쪽
    아래로만 자랐다. 다음에는 중심에서 겹겹이 둘렀는데 촘촘하기는 해도
    «줄»이 없어서, 나중에 벨트로 먹이려면 전부 다시 놓아야 한다.

    고수들이 쓰는 꼴은 두 줄이 마주보고 가운데로 뽑는 제련 블록이다. 그
    모양이어야 벨트 한 줄로 전부 먹이고 전부 거둘 수 있다. 보기 좋으라고
    줄을 세우는 게 아니라, 줄이어야 이을 수 있어서 세우는 것이다.

        블록 0  ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■     <- 줄 0
                          (판금 벨트 길)
                ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■     <- 줄 1
                          (통로)
        블록 1  ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■
    """
    block, within = divmod(nth, FURNACE_ROW * 2)
    row, col = divmod(within, FURNACE_ROW)
    return {"x": origin["x"] + pitch * col,
            "y": origin["y"] + row * FURNACE_AISLE
                 + block * (FURNACE_AISLE + FURNACE_GAP)}


def craft_seat(origin: dict, nth: int, pitch: int = CRAFT_PITCH,
               row: int = CRAFT_ROW) -> dict:
    """조립 구역에서 n번째 기계가 설 자리.

    조립기도 랩도 3x3 이다. 4칸 간격으로 한 줄에 여섯 대씩, 줄 사이는
    한 칸을 띄운다 - 그 한 칸이 나중에 인서터와 벨트가 지나갈 길이다.

    화로와 달리 여기는 줄이 마주볼 필요가 없다. 과학팩은 한 줄로 흐르고,
    랩은 그 줄을 따라 늘어선다(reference/red-science-block.png).
    """
    band, within = divmod(nth, row)
    return {"x": origin["x"] + pitch * within,
            "y": origin["y"] + band * (pitch + 1)}


def belt_pairs(blocked: list[dict], starving: list[dict],
               reach: float = BELT_REACH) -> list[tuple[dict, dict]]:
    """벨트 한 줄로 이을 만한 «막힌 채굴기 ↔ 굶는 화로» 짝.

    두 병목은 내내 같은 숫자였다 — 캔 광석이 갈 데가 없어 선 채굴기와,
    받을 것이 없어 선 화로. 둘 사이가 벨트로 이을 만큼 가까우면, 한 줄이
    둘을 동시에 없앤다. 손으로 나르는 일감도 같이 사라진다.

    짝은 한 번씩만 쓴다. 화로 하나에 벨트 다섯 줄을 물리면 넷은 헛일이다.
    """
    used_ovens: set[tuple[float, float]] = set()
    out: list[tuple[dict, dict]] = []
    for drill in blocked:
        best, best_d = None, reach * reach
        for oven in starving:
            seat = (oven["x"], oven["y"])
            if seat in used_ovens:
                continue
            d = (oven["x"] - drill["x"]) ** 2 + (oven["y"] - drill["y"]) ** 2
            if d < best_d:
                best, best_d = oven, d
        if best is None:
            continue
        used_ovens.add((best["x"], best["y"]))
        out.append((drill, best))
    return out


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

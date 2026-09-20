"""Map tags: put what we know on the map the human is looking at.

사용자가 화면에서 보는 것과 우리가 아는 것이 어긋나는 일이 되풀이됐다.
「포탑 스물다섯 대」라고 보고해도, 그것이 «어디에» 있고 무엇이 아직
비어 있는지는 지도 위에서만 읽힌다.

    사용자: "포탑방어선 어디에 구성되어있는지 맵에 태그달아줘"

태그는 안개를 걷지 않는다. 이미 아는 것을 «보이게» 할 뿐이다 - 지도를
직접 여는 것(force.chart)과는 다른 일이고, 그쪽은 이 저장소에서 안 쓴다.

    python scripts/tag.py --depot=30,0

거는 것은 셋이다.

    방어선   구역마다 포탑 몇 대가 무엇을 지키는가
    구멍     사거리 밖에 남은 우리 건물
    살림     창고.발전소.연구소처럼 「여기가 어디인가」를 알려 주는 것
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

sys.path.insert(0, HERE)

from client import AIBridge                                   # noqa: E402
from guard import (RANGE, clusters, covers, holdings,          # noqa: E402
                   standing_turrets, unguarded, worth)

MINE = "ai-coop"          # 우리가 단 태그의 표식. 지울 때 남의 것은 안 건드린다


def clear(ai):
    """지난번에 우리가 단 것만 지운다."""
    reply = ai.lua("""(function()
      local f = game.forces.player
      local n = 0
      for _, tag in pairs(f.find_chart_tags(game.surfaces[1])) do
        if tag.text and tag.text:find("%s", 1, true) then
          tag.destroy(); n = n + 1
        end
      end
      return { gone = n }
    end)()""" % MINE)
    return int(reply["gone"])


def put(ai, marks):
    """태그를 건다. 안 그려진 칸에는 안 걸리므로 «걸린 수»를 돌려준다."""
    body = ", ".join(
        '{%d, %d, "%s", "%s"}' % (int(m["x"]), int(m["y"]),
                                  m["text"].replace('"', "'"), m.get("icon", ""))
        for m in marks)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local marks = { %s }
      local done, skipped = 0, 0
      for _, m in ipairs(marks) do
        local tag = { position = {m[1], m[2]}, text = m[3] }
        if m[4] ~= "" then tag.icon = { type = "item", name = m[4] } end
        local ok = pcall(function() f.add_chart_tag(s, tag) end)
        if ok then done = done + 1 else skipped = skipped + 1 end
      end
      return { done = done, skipped = skipped }
    end)()""" % body)
    return int(reply["done"]), int(reply["skipped"])


def label(group, have):
    """이 구역이 무엇이고 얼마나 지켜지나."""
    kinds = {p[2] for p in group}
    what = "본진"
    if any("lab" in k for k in kinds):
        what = "연구소.발전소"
    elif any("mining-drill" in k for k in kinds) and not any(
            "furnace" in k for k in kinds):
        what = "채굴 초소"
    elif any("furnace" in k for k in kinds):
        what = "제련.창고"
    n = covers(group, have)
    state = f"포탑 {n}대" if n else "포탑 없음"
    return f"[{MINE}] {what} - {state} / 건물 {len(group)}채"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--depot", default=None, help="음수는 --depot=-5,-90")
    ap.add_argument("--keep", action="store_true", help="지난 태그를 안 지운다")
    args = ap.parse_args()

    ai = AIBridge()
    if not args.keep:
        print(f"지난 태그 {clear(ai)}개 지움")

    ours = holdings(ai)
    have = standing_turrets(ai)
    marks = []

    # 1. 구역마다 «무엇을 몇 대가 지키는가»
    for group in sorted(clusters(ours), key=worth, reverse=True):
        mid = (sum(p[0] for p in group) / len(group),
               sum(p[1] for p in group) / len(group))
        marks.append({"x": mid[0], "y": mid[1], "text": label(group, have),
                      "icon": "gun-turret" if covers(group, have) else "stone-wall"})

    # 2. 포탑 하나하나. 선이 «어디를 따라가는지»는 점을 봐야 읽힌다.
    for i, t in enumerate(sorted(have, key=lambda t: (t[1], t[0])), 1):
        marks.append({"x": t[0], "y": t[1], "text": f"[{MINE}] 포탑 {i}",
                      "icon": "firearm-magazine"})

    # 3. 구멍. 있는 것보다 «없는 것»이 급하다.
    holes = unguarded(ai, RANGE)
    for x, y, gap in holes[:12]:
        marks.append({"x": x, "y": y,
                      "text": f"[{MINE}] 무방비 - 포탑까지 {gap:.0f}칸",
                      "icon": "stone-wall"})

    if args.depot:
        dx, dy = (int(v) for v in args.depot.split(","))
        marks.append({"x": dx, "y": dy, "text": f"[{MINE}] 창고",
                      "icon": "iron-chest"})

    done, skipped = put(ai, marks)
    print(f"태그 {done}개 걸었다 (못 건 것 {skipped}개 - 아직 안 그려진 칸)")
    print(f"  구역 {len(clusters(ours))}개 / 포탑 {len(have)}대 / "
          f"무방비 {len(holes)}채")
    for group in sorted(clusters(ours), key=worth, reverse=True):
        mid = (sum(p[0] for p in group) / len(group),
               sum(p[1] for p in group) / len(group))
        print(f"  ({mid[0]:6.0f},{mid[1]:5.0f}) {label(group, have)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""철 전초 루트 복구 - 사용자 (00:50): "철광석 추가채굴지에서 오는 루트에 벨트랑 전선 파괴된 거 빨리 복구" + "이것도 언넝 설치" (스플리터 유령).

망 벨트·작은 전봇대 재고 0 (구리 0 이라 전봇대 조립 불가) 이라 로봇이 유령을 못 짓는다. 루트 바깥 구간은 망 밖이기도 하다.
그래서 망 창고에서 철·나무·회로, 레이더 줄 조립기 (-14.5,-70.5) 입력칸에서 구리선을 delta 가방으로 옮기고 (Lua 중계),
delta 가 손으로 벨트·스플리터·전봇대를 만들어 유령 자리에 직접 세운다. 유령 목록은 실행 때 게임에서 읽는다.

    python -u scripts/routefix23.py
"""
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402
import orders  # noqa: E402
from proboport23 import BODY  # noqa: E402

WHO = "delta"
# 루트 바깥 구간 + 사용자 스플리터 + 대포 옆 사용자 전봇대
AREAS = [((-160, -170), (-140, -110)), ((-113, -44), (-110, -42)), ((-190, -110), (-182, -100))]
KINDS = ("transport-belt", "small-electric-pole", "splitter")

PULL = """(function() @BODY@
  local s = game.surfaces[1] local b = body('delta') if not b then return {dead = 1} end
  local m = b.get_main_inventory() local o = {}
  local net = s.find_logistic_network_by_position({-60, -33}, 'player')
  for n, k in pairs({['iron-plate'] = 80, ['wood'] = 6, ['electronic-circuit'] = 5}) do
    local have = m.get_item_count(n) if have < k then
      local got = net.remove_item{name = n, count = k - have} if got > 0 then m.insert{name = n, count = got} end o[n] = got end end
  local a = s.find_entities_filtered{type = 'assembling-machine', position = {-14.5, -70.5}, radius = 1}[1]
  if a then local inv = a.get_inventory(defines.inventory.assembling_machine_input)
    local got = inv.remove{name = 'copper-cable', count = 12} if got > 0 then m.insert{name = 'copper-cable', count = got} end o.cable = got end
  o.belt = m.get_item_count('transport-belt') o.pole = m.get_item_count('small-electric-pole') o.x = b.position.x o.y = b.position.y
  return o end)()""".replace("@BODY@", BODY)

GHOSTS = """(function() local s = game.surfaces[1] local o = {}
  for _, a in pairs({%s}) do
    for _, e in pairs(s.find_entities_filtered{type = 'entity-ghost', force = 'player', area = a}) do
      o[#o + 1] = {n = e.ghost_name, x = e.position.x, y = e.position.y, d = e.direction} end end
  return o end)()"""


def say(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def ghosts(ai):
    lua_areas = ", ".join("{{%s, %s}, {%s, %s}}" % (a[0][0], a[0][1], a[1][0], a[1][1]) for a in AREAS)
    r = ai.lua(GHOSTS % lua_areas)
    g = list(r.values()) if isinstance(r, dict) else (r or [])
    return [x for x in g if x["n"] in KINDS]


def main() -> int:
    ai = AIBridge()
    say("가방 채움 %s" % ai.lua(PULL))
    g = ghosts(ai)
    say("유령 %d: %s" % (len(g), sorted({x["n"] for x in g})))
    # 순서: 스플리터 (벽 안) -> 벽 따라 북 -> 서쪽 y=-114.5 -> 북쪽 x=-155.5 -> 대포 옆 전봇대
    def key(x):
        if x["n"] == "splitter":
            return (0, 0)
        if x["x"] < -180:
            return (3, x["y"])
        if x["y"] > -116.5 and x["x"] > -155.6 and x["n"] == "transport-belt" and x["y"] == -114.5:
            return (1, -x["x"])
        return (2, -x["y"])
    g.sort(key=key)
    plan = [("craft", {"recipe": "transport-belt", "count": 12, "wait": True}),
            ("craft", {"recipe": "splitter", "count": 1, "wait": True}),
            ("craft", {"recipe": "small-electric-pole", "count": 5, "wait": True})]
    for x in g:
        plan += [("walk_to", {"x": x["x"] + 1.5, "y": x["y"]}),
                 ("build", {"name": x["n"], "x": x["x"], "y": x["y"], "direction": x["d"]})]
    plan.append(("walk_to", {"x": -81, "y": -43}))
    say("delta 계획 %d 단계" % len(plan))
    print(orders.submit(ai, WHO, plan), flush=True)
    for _ in range(90):
        time.sleep(10)
        left = ghosts(ai)
        if not left:
            say("루트 유령 0 - 복구 완료")
            return 0
    say("시간 초과, 남은 유령 %d" % len(left))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

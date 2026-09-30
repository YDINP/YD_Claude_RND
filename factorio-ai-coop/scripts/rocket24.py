"""run24 사일로 재료 모으기 (2026-09-30 18:2x) - rocket-silo 연구 76.7 % (보라 기다림). 사일로는 연구가 끝나야 짓는다.

사일로 = 강철 1000 · PU 200 · 전기 엔진 200 · 관 100 · 콘크리트 1000. 18:1x 망: 강철 8.0k · 콘크리트 1000 · 전기 엔진 151 · **PU 0 · 관 0**.
  PU: 조립기 (1.5,20.5) 하나가 노랑 (1.5,16.5) 에만 팔 직결 → full_output (결과칸 100). 망으로 가는 길 0.
    → 동쪽 빈 칸에 결과 팔 (3.5,21.5, 서쪽 집기) → 공급 상자 (4.5,21.5) 칸 제한 2 (= PU 200). 노랑 팔과 나눠 가짐 - 노랑이 쉬면 상자로.
  관: 관 조립기 넷은 엔진에 팔 직결 → 망 0. delta 가 허브 철로 100 손제작 → 저장 상자 (59.5,-14.5).
    robofeed24 엔진 관 요청 남김 10 → 120 · 틀 전기 엔진 남김 0 → 200 (사일로 몫이 먹히지 않게).
Lua 아이템 이동 0 - 유령 (can_place manual) · 칸 제한 · 사람 손 (허브 → 손제작 → 저장 상자 → 로봇).

    python scripts/rocket24.py check|ghosts|config|kit|status|site|sitecheck|silokit|siteghost|release
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite  # noqa: E402,F401
import detached  # noqa: E402
from client import AIBridge  # noqa: E402
import p7_24  # noqa: E402
import purple24  # noqa: E402
import silo24  # noqa: E402

W = 12
WHO, OWNER = "delta", "rocket24"
STORE = purple24.STORE
ADV_BOX = purple24.ADV_BOX
PU_BOX = (4.5, 21.5, 2)
G = [("inserter", 3.5, 21.5, W), ("passive-provider-chest", PU_BOX[0], PU_BOX[1], 0)]
PIPES = 100


def place(ai, make):
    return ai.lua(purple24.LUA_PLACE % ("true" if make else "false", json.dumps([list(g) for g in G])))


def config(ai):
    return ai.lua("""(function()
      local b = game.surfaces[1].find_entities_filtered{name = 'passive-provider-chest', force = 'player', position = {%s, %s}, radius = 0.3}[1]
      if not b then return {bar = 'none'} end
      b.get_inventory(defines.inventory.chest).set_bar(%d + 1)
      return {bar = %d, pu = b.get_item_count('processing-unit')} end)()""" % (PU_BOX[0], PU_BOX[1], PU_BOX[2], PU_BOX[2]))


def kit(ai):
    """delta: 허브 철 · 강철 · 전선 + 고급 1 → 녹색 4 · 톱니 1 · 팔 1 · 강철 상자 1 · 공급 상자 1 · 관 100 → 저장 상자."""
    from orders import submit
    detached.mark([WHO], OWNER, minutes=20)
    green = 4
    plan = [("walk_to", {"x": ADV_BOX[0], "y": ADV_BOX[1] + 1.5}),
            ("take", {"name": "advanced-circuit", "x": ADV_BOX[0], "y": ADV_BOX[1], "count": 1})]
    plan += p7_24.take_plan(ai, {"steel-plate": 8, "copper-cable": 3 * green, "iron-plate": PIPES + 3 + green + 4},
                            {"steel-plate": 500, "copper-cable": 500, "iron-plate": 300})
    plan += [("craft", {"recipe": "electronic-circuit", "count": green, "wait": "block"}),
             ("craft", {"recipe": "iron-gear-wheel", "count": 1, "wait": "block"}),
             ("craft", {"recipe": "inserter", "count": 1, "wait": "block"}),
             ("craft", {"recipe": "steel-chest", "count": 1, "wait": "block"}),
             ("craft", {"recipe": "passive-provider-chest", "count": 1, "wait": "block"}),
             ("craft", {"recipe": "pipe", "count": PIPES, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": "inserter", "x": STORE[0], "y": STORE[1], "count": 1}),
             ("insert", {"name": "passive-provider-chest", "x": STORE[0], "y": STORE[1], "count": 1}),
             ("insert", {"name": "pipe", "x": STORE[0], "y": STORE[1], "count": PIPES})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan), "plan": [p[0] for p in plan]}


# 사일로 자리: 옛 자리 (-85.5,-35.5) 는 18:2x 에 태양판 20 · 전봇대 4 가 섰다 (can_place false) →
#   (110.5,-47.5) - 13 × 13 빈 땅 (can_place manual, busy 0), 적 80 칸 안 0, 기지 망 건설 범위 안 (물류 범위는 밖),
#   벽 · 포탑 30 칸 안 45 (안쪽). 전기: 중형 전봇대 (109.5,-41.5) ← (109.5,-38.5) 3 칸.
SITE = (110.5, -47.5)
SITE_G = [("rocket-silo", SITE[0], SITE[1], 0), ("medium-electric-pole", 109.5, -41.5, 0)]
# 재료 출처 (18:3x 망 조회) - 사람 손으로 꺼낸다
SRC = [("steel-plate", 55.5, -30.5, 1000), ("pipe", 59.5, -14.5, 100), ("electric-engine-unit", -81.5, -1.5, 200),
       ("concrete", -15.5, 36.5, 1000), ("processing-unit", 4.5, 21.5, 200)]


def silo_site(ai, make):
    return ai.lua(purple24.LUA_PLACE % ("true" if make else "false", json.dumps([list(g) for g in SITE_G])))


def silokit(ai):
    """delta: 재료 다섯 → 손제작 rocket-silo (30 s) → 저장 상자. 연구가 끝난 뒤에만."""
    from orders import submit
    if not ai.lua("(function() return {r = game.forces.player.technologies['rocket-silo'].researched} end)()").get("r"):
        return {"skip": "rocket-silo 연구 안 끝남"}
    detached.mark([WHO], OWNER, minutes=25)
    plan = []
    for n, x, y, c in SRC:
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": n, "x": x, "y": y, "count": c})]
    plan += [("craft", {"recipe": "rocket-silo", "count": 1, "wait": "block"}),
             ("walk_to", {"x": STORE[0], "y": STORE[1] + 1.5}),
             ("insert", {"name": "rocket-silo", "x": STORE[0], "y": STORE[1], "count": 1})]
    submit(ai, WHO, plan, strict=False)
    return {"steps": len(plan)}


def status(ai):
    o = silo24.status(ai)
    o["pu_box"] = ai.lua("""(function() local b = game.surfaces[1].find_entities_filtered{name = 'passive-provider-chest', force = 'player', position = {%s, %s}, radius = 0.3}[1]
      return {pu = b and b.get_item_count('processing-unit') or -1} end)()""" % (PU_BOX[0], PU_BOX[1]))
    o["delta"] = ai.agent(WHO).inventory() if hasattr(ai.agent(WHO), "inventory") else None
    return o


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    ai = AIBridge()
    if step == "release":
        detached.release([WHO])
        print("released")
        return
    fn = {"check": lambda ai: place(ai, False), "ghosts": lambda ai: place(ai, True), "config": config, "kit": kit,
          "status": status, "site": silo24.site, "sitecheck": lambda ai: silo_site(ai, False),
          "siteghost": lambda ai: silo_site(ai, True), "silokit": silokit}[step]
    print(json.dumps(fn(ai), ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

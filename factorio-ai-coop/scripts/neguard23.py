"""북동 포탑 보강 - 사용자 (00:16): "북동쪽 포탑 세워줘 계속 공격당함".

북동 모서리 (40..54, -116..-100) 는 로봇망 밖이라 유령이 안 지어진다 (사용자 유령 (42,-108) 도 멈춤), 망 포탑 재고 0,
구리 0 이라 새 포탑도 못 만든다. 그래서 둥지를 다 치운 남서 줄 (x=-116 / y=52) 에서 포탑 6 대를 로봇으로 걷어 창고로 보내고,
delta 가 창고에서 들고 가 북동 모서리에 손으로 세운다 (+ 사용자 유령 인서터·전봇대, 탄 50 씩).

    python -u scripts/neguard23.py
"""
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402
import orders  # noqa: E402

# 남서 줄에서 하나 건너 하나 (방어 공백 최소)
TAKE = [(-116, 26), (-116, 35), (-116, 44), (-104, 52), (-86, 52), (-74, 52)]
# 북동 자리: 사용자 유령 (42,-108) 먼저, 나머지는 공습 지점 (50,-115) 쪽 부채꼴
SPOTS = [(42, -108), (46, -112), (50, -114), (52, -108), (50, -102), (46, -104)]
N = 0  # north


def say(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def main() -> int:
    ai = AIBridge()
    r = ai.lua("""(function() local s = game.surfaces[1] local n = 0
      for _, p in pairs({%s}) do local t = s.find_entities_filtered{name = 'gun-turret', position = p, radius = 0.6}[1]
        if t and t.order_deconstruction('player') then n = n + 1 end end
      return {n = n} end)()""" % ", ".join("{%s, %s}" % p for p in TAKE))
    say("남서 포탑 해체 표시 %s" % r)
    chests = []
    for _ in range(60):
        time.sleep(10)
        r = ai.lua("""(function() local s = game.surfaces[1] local o = {c = {}}
          o.left = s.count_entities_filtered{name = 'gun-turret', to_be_deconstructed = true}
          for _, c in pairs(s.find_entities_filtered{type = 'logistic-container', force = 'player'}) do
            local k = c.get_item_count('gun-turret') if k > 0 then o.c[#o.c + 1] = {x = c.position.x, y = c.position.y, n = k} end end
          return o end)()""")
        chests = list(r["c"].values()) if isinstance(r.get("c"), dict) else (r.get("c") or [])
        if r.get("left", 1) == 0 and sum(c["n"] for c in chests) >= len(TAKE):
            break
    say("창고 포탑 %s" % chests)
    if not chests:
        say("포탑이 창고에 없음 - 중단")
        return 1
    # 탄: 망 창고 (-60.5,-33.5) 에 일반탄이 있다
    plan = []
    got = 0
    for c in chests:
        k = min(int(c["n"]), len(SPOTS) - got)
        if k <= 0:
            break
        plan += [("walk_to", {"x": c["x"], "y": c["y"] + 1.5}), ("take", {"name": "gun-turret", "x": c["x"], "y": c["y"], "count": k})]
        got += k
    plan += [("walk_to", {"x": -60.5, "y": -31.5}), ("take", {"name": "firearm-magazine", "x": -60.5, "y": -33.5, "count": 50 * got}),
             ("walk_to", {"x": 38, "y": -104})]
    for x, y in SPOTS[:got]:
        plan += [("build", {"name": "gun-turret", "x": x, "y": y, "direction": N}),
                 ("insert", {"name": "firearm-magazine", "x": x, "y": y, "count": 50})]
    plan.append(("walk_to", {"x": -20, "y": -60}))
    say("delta 계획 %d 단계 (포탑 %d)" % (len(plan), got))
    print(orders.submit(ai, "delta", plan), flush=True)
    for _ in range(90):
        time.sleep(10)
        r = ai.lua("""(function() local s = game.surfaces[1] local o = {}
          for _, p in pairs({%s}) do local t = s.find_entities_filtered{name = 'gun-turret', position = p, radius = 0.6}[1]
            o[#o + 1] = t and t.get_inventory(defines.inventory.turret_ammo).get_item_count() or -1 end return o end)()"""
                   % ", ".join("{%s, %s}" % p for p in SPOTS[:got]))
        v = list(r.values()) if isinstance(r, dict) else r
        if all(x >= 0 for x in v):
            say("북동 포탑 완료 탄 %s" % v)
            return 0
    say("시간 초과 %s" % r)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

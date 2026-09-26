"""실시간 판단 고리 - 캐릭터마다 1초에 한 번 «지금 도망쳐야 하나» 를 Jev 에 묻는다.

    사용자: "캐릭터가 실시간으로 체크하고 행동해야하는 로직은 jev로 구현해둘 것."
    사용자 (앞서): "적이 모여있는걸 왜 체크안함" · "항상 적을 발견하면 도망가는걸 최우선으로 체크해야함."

층이 둘이다:
  * 모드 반사 (reflex.lua) - «맞은 뒤» 한 틱 안에 포탑 쪽으로 튄다. 그대로 둔다.
  * 이 고리 - «맞기 전» 에 본다. 23회차 북동 둥지에서 넷 · 둘이 죽은 것은 반사가 늦어서가 아니라 무리 한복판에
    이미 서 있었기 때문이다 (바이터가 사람보다 빠르다). 둘레 무리 · 대형 유닛 · 웜 사거리 · 체력을 매초 보고,
    Jev 가 retreat 를 고르면 하던 일을 끊고 가장 가까운 «탄 있는 안전 포탑» 뒤로 보낸다.

결정은 Jev (bridge/jev.py) - 키가 없거나 늦으면 같은 모양의 규칙이 답한다 (source=rules).
적이 둘레 SEE 칸 안에 없는 사람은 묻지 않는다 (비용 0, 대부분의 초).

    python scripts/jevloop.py                 # 상주 (Ctrl+C)
    python scripts/jevloop.py --once          # 한 번 보고 결정만 찍기 (움직이지 않음)
"""
import argparse
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(__file__)]
from client import AIBridge  # noqa: E402
from jev import Choice, Jev  # noqa: E402

TICK = 1.0
SEE = 45                 # 이 안에 적 유닛·구조물이 있으면 묻는다
HOLD = 8.0               # 한 번 후퇴시키면 이 동안은 다시 안 시킨다
ACT = ["continue", "retreat", "fight"]
WEIGHT = {"small": 1, "medium": 2, "big": 4, "behemoth": 8}

SNAP = """(function()
  local s = game.surfaces[1]
  local out = {}
  for _, c in pairs(s.find_entities_filtered{type = "character"}) do
    local p = c.position
    local u = {w = 0, n = 0, big = 0, near = 999}
    for _, e in pairs(s.find_entities_filtered{type = "unit", force = "enemy", position = p, radius = %d}) do
      local d = math.sqrt((e.position.x - p.x)^2 + (e.position.y - p.y)^2)
      u.n = u.n + 1
      if d < u.near then u.near = d end
      local w = 1
      if string.find(e.name, "medium") then w = 2 elseif string.find(e.name, "big") then w = 4; u.big = u.big + 1
      elseif string.find(e.name, "behemoth") then w = 8; u.big = u.big + 1 end
      u.w = u.w + w
    end
    local worm = 999
    for _, e in pairs(s.find_entities_filtered{type = {"turret", "unit-spawner"}, force = "enemy", position = p, radius = %d}) do
      local d = math.sqrt((e.position.x - p.x)^2 + (e.position.y - p.y)^2)
      if d < worm then worm = d end
    end
    if u.n > 0 or worm < 999 then
      local gun, gd = nil, 1e9
      for _, t in pairs(s.find_entities_filtered{name = "gun-turret", force = "player", position = p, radius = 250}) do
        local inv = t.get_inventory(defines.inventory.turret_ammo)
        if inv and inv.get_item_count() >= 5 and s.count_entities_filtered{force = "enemy", type = {"turret", "unit-spawner"},
             position = t.position, radius = 45, limit = 1} == 0 then
          local d = (t.position.x - p.x)^2 + (t.position.y - p.y)^2
          if d < gd then gun, gd = t.position, d end
        end
      end
      out[#out + 1] = {x = p.x, y = p.y, hp = c.health, hpmax = c.max_health or 250,
                       n = u.n, w = u.w, big = u.big, near = u.near, worm = worm,
                       gx = gun and gun.x, gy = gun and gun.y, gd = gun and math.sqrt(gd)}
    end
  end
  return out
end)()"""


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def state_text(who, r) -> str:
    gun = f"가장 가까운 안전 포탑 {r['gd']:.0f}칸" if r.get("gd") else "안전 포탑 없음"
    worm = f"적 구조물(웜·둥지) {r['worm']:.0f}칸" if r["worm"] < 999 else "적 구조물 없음"
    return (f"팩토리오 캐릭터 {who}. 체력 {r['hp']:.0f}/{r['hpmax']:.0f}. 둘레 {SEE}칸 적 유닛 {r['n']} "
            f"(무게 {r['w']}, 대형 {r['big']}), 가장 가까운 적 {r['near']:.0f}칸. {worm} (대형 웜 사거리 38). {gun}. "
            f"기관단총 사거리 18. 바이터는 사람보다 빠르다 - 늦게 도망치면 따라잡힌다.")


def rules(r) -> dict:
    """Jev 가 없을 때의 답 - 같은 모양 (선택지별 확률)."""
    hp = r["hp"] / max(1, r["hpmax"])
    danger = 0.0
    danger += min(1.0, r["w"] / 8)                    # 중형 4 마리 = 1 (5 마리 20칸에 «계속» 이 나와 조였다)
    danger += 0.5 if r["big"] else 0
    danger += 0.6 if r["worm"] < 40 else 0
    danger += (1 - hp) * 0.8
    danger += 0.3 if r["near"] < 12 and r["w"] >= 4 else 0
    p_ret = max(0.0, min(1.0, danger - 0.4))
    p_fight = max(0.0, min(1.0 - p_ret, 0.6 if (r["w"] <= 3 and hp > 0.6 and r["worm"] > 40) else 0.1))
    return {"act": {"retreat": p_ret, "fight": p_fight, "continue": max(0.0, 1 - p_ret - p_fight)}}


def retreat_goal(r):
    if not r.get("gx"):
        return None
    dx, dy = r["gx"] - r["x"], r["gy"] - r["y"]
    span = max(1.0, math.hypot(dx, dy))
    return (r["gx"] + dx / span * 4, r["gy"] + dy / span * 4)       # 포탑 «너머» 4 칸


def who_at(ai):
    """list() 의 이름 <-> 좌표 (SNAP 은 이름을 모른다)."""
    return {(round(float(a["x"]), 1), round(float(a["y"]), 1)): a["name"]
            for a in ai.list() if a.get("alive") and a.get("x") is not None}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--threshold", type=float, default=0.55, help="retreat 확률이 이 이상이면 후퇴")
    a = ap.parse_args()
    ai, jev = AIBridge(), Jev()
    print(f"jevloop: Jev {'연결' if jev.live else '키 없음 - 규칙으로'} · 주기 {TICK}s · 문턱 {a.threshold}", flush=True)
    held: dict[str, float] = {}
    while True:
        t0 = time.time()
        try:
            rows = _rows(ai.lua(SNAP % (SEE, SEE)))
            names = who_at(ai) if rows else {}
            for r in rows:
                who = min(names.items(), key=lambda kv: (kv[0][0] - r["x"]) ** 2 + (kv[0][1] - r["y"]) ** 2,
                          default=(None, None))[1]
                if not who:
                    continue
                res = jev.decide(state_text(who, r),
                                 {"act": Choice("지금 이 캐릭터는 하던 일을 계속할까, 안전 포탑 뒤로 후퇴할까, 제자리에서 싸울까? "
                                                "살아남는 것이 최우선.", ACT)},
                                 fallback=lambda r=r: rules(r))
                act = res["act"]
                line = (f"{time.strftime('%H:%M:%S')} {who} hp{r['hp']:.0f} 적{r['n']}(w{r['w']},big{r['big']}) "
                        f"{r['near']:.0f}칸 웜{r['worm'] if r['worm'] < 999 else '-'} -> {act.best} "
                        f"(후퇴 {act.of('retreat'):.2f}, {res.source} {res.ms:.0f}ms)")
                if a.once:
                    print(line, flush=True)
                    continue
                if act.of("retreat") >= a.threshold and time.time() >= held.get(who, 0):
                    goal = retreat_goal(r)
                    if goal:
                        ag = ai.agent(who)
                        ag.cancel()
                        ag.submit("walk_to", x=goal[0], y=goal[1])
                        held[who] = time.time() + HOLD
                        print(line + f" => 후퇴 ({goal[0]:.0f},{goal[1]:.0f})", flush=True)
        except Exception as e:  # noqa: BLE001 - 고리는 죽지 않는다
            print(f"jevloop: {type(e).__name__}: {e}"[:300], flush=True)
            time.sleep(3)
        if a.once:
            return 0
        time.sleep(max(0.0, TICK - (time.time() - t0)))


if __name__ == "__main__":
    raise SystemExit(main())

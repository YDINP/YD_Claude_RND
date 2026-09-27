"""공습 감시 - 방어선에 적이 오는지 주기적으로 본다 (사용자: "공격오는지 주기적으로 체크할것").

15초마다 (기본) 한 번:
  * 우리 포탑 35칸 안의 적 유닛을 방향별 (N · NE · E · SE · S · SW · W · NW, 기지 중심 (-40,-20) 기준) 로 묶어,
    무리 (5마리 이상 또는 대형 포함) 가 «새로» 붙거나 커지면 한 줄.
  * 무리가 빠지면 (그 방향 0) 결과 한 줄: 부서진 것 (유령) · 손상 포탑 · 탄 부족 포탑.
  * 탄 5 미만 포탑엔 로봇 탄 배달 (item-request-proxy).
  * 캐릭터 체력 200 미만 · 사망 (수가 줄면) 한 줄.
바뀐 것만 찍는다 (Monitor 알림용). 조용하면 아무것도 안 찍는다.

    python -u scripts/raidwatch23.py              # 상주
    python -u scripts/raidwatch23.py --once       # 지금 상태 한 번
"""
import argparse
import math
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

CENTER = (-40.0, -20.0)
DIRS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"]

SNAP = """(function() local s = game.surfaces[1] local o = {u = {}, c = {}}
  for _, e in pairs(s.find_entities_filtered{force = 'enemy', type = 'unit', area = {{-200, -170}, {110, 120}}}) do
    if s.count_entities_filtered{name = 'gun-turret', force = 'player', position = e.position, radius = 35, limit = 1} > 0 then
      o.u[#o.u + 1] = {x = e.position.x, y = e.position.y, big = (string.find(e.name, 'big') or string.find(e.name, 'behemoth')) and 1 or 0}
    end
  end
  for _, ch in pairs(s.find_entities_filtered{type = 'character'}) do
    o.c[#o.c + 1] = {x = ch.position.x, y = ch.position.y, hp = ch.health} end
  o.ghosts = s.count_entities_filtered{type = 'entity-ghost', force = 'player', area = {{-250, -200}, {150, 150}}}
  local dmg, low = 0, 0
  for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player'}) do
    if t.health < 300 then dmg = dmg + 1 end
    if t.get_inventory(defines.inventory.turret_ammo).get_item_count() < 3 then low = low + 1 end
  end
  o.dmg, o.low, o.turrets = dmg, low, s.count_entities_filtered{name = 'gun-turret', force = 'player'}
  -- 탄 5 미만 포탑엔 로봇 배달 요청 (슬롯에 든 종류로 - 다른 종류는 안 섞인다). 전진 포트 호위가 빈 탄으로 서 있었다 (14:00)
  o.req = 0
  for _, t in pairs(s.find_entities_filtered{name = 'gun-turret', force = 'player'}) do
    local inv = t.get_inventory(defines.inventory.turret_ammo)
    if inv.get_item_count() < 5 and s.count_entities_filtered{name = 'item-request-proxy', position = t.position, radius = 0.5} == 0 then
      local nm = inv.is_empty() and 'piercing-rounds-magazine' or inv[1].name
      -- 빈 포탑은 망에 재고가 있는 탄으로 (관통탄 고갈 15:30 - 요청만 걸리고 안 오던 것)
      local net = s.find_logistic_network_by_position(t.position, 'player')
      if inv.is_empty() and (not net or net.get_item_count('piercing-rounds-magazine') < 20) then nm = 'firearm-magazine' end
      if pcall(function() s.create_entity{name = 'item-request-proxy', position = t.position, force = 'player', target = t,
          modules = {{id = {name = nm}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = 20}}}}}} end) then
        o.req = o.req + 1 end
    end
  end
  o.tick = game.tick
  return o end)()"""


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def direction(x, y):
    a = math.degrees(math.atan2(y - CENTER[1], x - CENTER[0]))
    return DIRS[int(((a + 22.5) % 360) // 45)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=15)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    active: dict[str, dict] = {}          # 방향 -> {n, big, peak, ghosts0}
    chars_n, hurt = None, set()
    while True:
        try:
            r = ai.lua(SNAP)
            groups: dict[str, dict] = {}
            for u in rows(r.get("u")):
                g = groups.setdefault(direction(u["x"], u["y"]), {"n": 0, "big": 0, "x": 0.0, "y": 0.0})
                g["n"] += 1
                g["big"] += u["big"]
                g["x"] += u["x"]
                g["y"] += u["y"]
            now = time.strftime("%H:%M:%S")
            if a.once:
                print(now, "무리", {k: (v["n"], v["big"]) for k, v in groups.items()} or "없음",
                      "· 유령", r["ghosts"], "· 포탑", r["turrets"], "손상", r["dmg"], "탄부족", r["low"])
                return 0
            for d, g in groups.items():
                big_group = g["n"] >= 5 or g["big"] > 0
                prev = active.get(d)
                if big_group and (prev is None or g["n"] >= prev["peak"] + 5):
                    cx, cy = g["x"] / g["n"], g["y"] / g["n"]
                    print(f"{now} 공습 {d}: 적 {g['n']} (대형 {g['big']}) @ ({cx:.0f},{cy:.0f}) · 포탑 {r['turrets']}", flush=True)
                    active[d] = {"peak": g["n"], "ghosts0": prev["ghosts0"] if prev else r["ghosts"]}
                elif prev:
                    prev["peak"] = max(prev["peak"], g["n"])
            for d in [d for d in active if d not in groups]:
                st = active.pop(d)
                lost = r["ghosts"] - st["ghosts0"]
                print(f"{now} 공습 끝 {d}: 최대 {st['peak']} · 새 유령 {max(0, lost)} · 손상 포탑 {r['dmg']} · 탄부족 {r['low']}", flush=True)
            if r.get("req"):
                print(f"{now} 탄 배달 요청 {r['req']}", flush=True)
            cs = rows(r.get("c"))
            if chars_n is not None and len(cs) < chars_n:
                print(f"{now} ⚠ 캐릭터 수 {chars_n} → {len(cs)} (사망?)", flush=True)
            chars_n = len(cs)
            now_hurt = {(round(c["x"]), round(c["y"])) for c in cs if c["hp"] < 200}
            if now_hurt and not hurt:
                print(f"{now} ⚠ 체력 200 미만 {len(now_hurt)} 명: " + ", ".join(f"({x},{y})" for x, y in now_hurt), flush=True)
            hurt = now_hurt
        except Exception as e:  # noqa: BLE001 - 감시는 죽지 않는다
            print(f"raidwatch: {type(e).__name__}: {e}"[:200], flush=True)
            time.sleep(10)
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

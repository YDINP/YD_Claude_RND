"""Run 24: 플라스틱 화학 석탄을 정유 곁 망 상자에 (코디네이터 06:1x 결정) + 남서 유전 포탑 탄 손 고리.

까닭: robofeed24 가 플라스틱 화학 둘 ((-106.5,13.5) · (-71.5,11.5)) 에 석탄 100 개씩 요청하는데, 망의 석탄은 석탄 밭 공급 상자
(122.5,-29.5) 에만 있어 건설 로봇이 ~235 칸을 난다 (석유가스 46/s 로 플라스틱이 석탄에 묶임). 정유 곁 저장 상자 (필터 석탄) 에
사람이 석탄을 들고 와 두면 로봇은 가까운 상자에서 집는다 (Lua 아이템 이동 없음 - 사람 손 · 로봇만).

상자: 저장 상자 (-102.5,6.5) - 화학 (-106.5,13.5) 에서 ~8 · (-71.5,11.5) 에서 ~31. 갇힘 주머니 (x -96..-79, y 11..34) 밖.
석탄 셈: 플라스틱 10분 1,235 → 석탄 ~620 / 10 분 = ~1/s. 고리 5 분마다, 상자 < LOW 면 FILL 까지 (한 번 ≤ 1,500 = 가방 30 칸).
탄: `--ammo-every` 초마다 p11_24.fill (남서 유전 포탑 탄 상자 넷, 망 밖) - 같은 사람.

    python scripts/coalnet24.py --run run24 --who hotel --build
    python scripts/coalnet24.py --run run24 --who hotel --every 300 --ammo-every 1800
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge, RconError  # noqa
from orders import submit  # noqa

OWNER = "coalnet"
CHEST = (-102.5, 6.5)
LOW, FILL, TRIP = 600, 1500, 1500
SRC_AREA = [[100, -34], [126, -22]]          # 석탄 밭 상자 (iron-chest 줄 + 공급 상자 (122.5,-29.5))
SRC_KEEP = 100                                # 상자마다 남김 (fuelhaul · p10 석탄 고리 몫)

Q_LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {src = {}}
  local c = s.find_entities_filtered{name = 'storage-chest', force = f, position = {%f, %f}, radius = 0.3}[1]
  out.have = c and c.get_inventory(defines.inventory.chest).get_item_count('coal') or -1
  out.ghost = s.count_entities_filtered{ghost_name = 'storage-chest', force = f, position = {%f, %f}, radius = 0.3}
  local g = c and c.get_filter(1)                    -- 2.0 저장 상자 필터 = set_filter(1, ...) (storage_filter 는 안 먹힘)
  if c and not g then c.set_filter(1, {name = 'coal', quality = 'normal'}); g = c.get_filter(1) end
  out.filter = g and (type(g.name) == 'table' and g.name.name or g.name) or ''
  for _, e in pairs(s.find_entities_filtered{type = {'container', 'logistic-container'}, force = f, area = %s}) do
    local n = e.get_inventory(defines.inventory.chest).get_item_count('coal')
    if n > 0 then out.src[#out.src + 1] = {e.position.x, e.position.y, n} end
  end
  return out
end)()"""


def listify(v):
    return list(v.values()) if isinstance(v, dict) else (v or [])


def query(ai):
    return ai.lua(Q_LUA % (CHEST[0], CHEST[1], CHEST[0], CHEST[1], json.dumps(SRC_AREA).replace("[", "{").replace("]", "}")))


def take_coal(src, want):
    plan, got = [], 0
    for x, y, n in sorted(src, key=lambda c: -c[2]):
        k = min(n - SRC_KEEP, want - got)
        if k <= 0:
            continue
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "coal", "x": x, "y": y, "count": k})]
        got += k
        if got >= want:
            break
    return plan, got


def build(ai, who):
    """사람이 허브 판으로 저장 상자를 손제작 (강철 상자 · 회로 3 · 고급회로 1 - 플라스틱 2 는 가방) → 석탄을 들고 와 놓고 (build = 충돌 검사) 넣는다."""
    import p7_24
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=20)
    r = query(ai)
    plan = []
    if r.get("have", -1) < 0:
        bag = ai.agent(who).items()
        if int(bag.get("plastic-bar", 0)) < 2:
            return {"error": "가방 플라스틱 < 2 (고급회로 손제작)"}
        plan += p7_24.take_plan(ai, {"steel-plate": 10, "iron-plate": 12, "copper-plate": 16}, {"iron-plate": 600, "copper-plate": 300, "steel-plate": 250})
        plan.append(("craft", {"recipe": "storage-chest", "count": 1, "wait": "block"}))
    tk, got = take_coal(listify(r.get("src")), TRIP)
    plan += tk
    plan.append(("walk_to", {"x": CHEST[0], "y": CHEST[1] - 1.5}))
    if r.get("have", -1) < 0:
        plan.append(("build", {"name": "storage-chest", "x": CHEST[0], "y": CHEST[1]}))
    if got:
        plan.append(("insert", {"name": "coal", "x": CHEST[0], "y": CHEST[1], "count": got}))
    submit(ai, who, plan, strict=False)
    return {"steps": len(plan), "coal": got}


def once(ai, who):
    r = query(ai)
    have = r.get("have", -1)
    if have < 0:
        return build(ai, who)
    if have >= LOW:
        return {"have": have, "filter": r.get("filter")}
    os.environ[detached.ENV] = OWNER
    detached.mark([who], OWNER, minutes=15)
    tk, got = take_coal(listify(r.get("src")), min(TRIP, FILL - have))
    if got < 100:
        return {"have": have, "src": "empty"}
    plan = tk + [("walk_to", {"x": CHEST[0], "y": CHEST[1] - 1.5}), ("insert", {"name": "coal", "x": CHEST[0], "y": CHEST[1], "count": got})]
    submit(ai, who, plan, strict=False)
    return {"have": have, "carry": got}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="hotel")
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--every", type=int, default=300)
    ap.add_argument("--ammo-every", type=int, default=0, help="초 - 0 이면 탄 고리 없음")
    ap.add_argument("--ammo-per", type=int, default=60)
    a = ap.parse_args()
    ai = AIBridge()
    if a.build:
        print(build(ai, a.who))
        return 0
    last_ammo = 0.0
    while True:
        try:
            ai = ai or AIBridge()
            body = [b for b in ai.list() if b["name"] == a.who]
            if body and not body[0].get("queued"):
                if a.ammo_every and time.time() - last_ammo >= a.ammo_every:
                    import p11_24
                    p11_24.fill(ai, a.who, a.ammo_per)          # 남서 유전 탄 상자 넷 (노랑, 모자라면 손제작)
                    last_ammo = time.time()
                else:
                    print(time.strftime("%H:%M:%S"), once(ai, a.who), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        time.sleep(a.every if not a.ammo_every else min(a.every, 60))


if __name__ == "__main__":
    raise SystemExit(main())

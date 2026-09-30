"""Run 24 P7: 화로 연료 (relay S4 화로 몫 · FURN) 를 사람 손 석탄 고리로 바꾼다 (허용된 방식: 캐릭터가 들고 간다).

석탄 밭 상자 (y -29.5, 북쪽 채굴기 줄이 채움) 에서 석탄을 꺼내 연료 < LOW 인 강철 · 돌 화로에 FILL 까지 넣는다.
화로 90 kW → 석탄 50 = ~37 분. 한 바퀴 ≤ 28 화로 (걸음 + 넣기), 모자란 순으로.
동쪽 전초 (P8) 화로는 석탄 벨트 상자 (403.5,-149.5) · (413.5,-146.5) 가 대신 - 그 상자를 채운다.

    python scripts/fuelhaul24.py --run run24 --who golf --once
    python scripts/fuelhaul24.py --run run24 --who golf --every 300
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge, RconError  # noqa
from orders import submit  # noqa

COAL_BOX = [[106, -30.1], [124, -28.9]]          # relay COAL_BOX 상자 줄
LOW, FILL = 20, 50
MAX_STOPS = 28
# 동쪽 전초 석탄 상자 (P8 설계 - 팔이 광석 벨트 석탄 레인에 붓는다) : 목표
OUTPOST = [(403.5, -149.5, 1500), (413.5, -147.5, 1500)]  # P13 (09:4x) 강철로 24 → 46 - 석탄 0.54 → 1.0/s, 상한 1200 → 1500      # 동쪽 줄은 (413.5,-147.5) (03:4x 새 상자 - 옛 (413.5,-146.5) 는 첫 화로 (409,-147) 팔보다 하류라 그 화로가 relay 연료뿐이었다)
OUTPOST_LOW = 700
SKIP = [[380, -195, 440, -110]]                   # 전초 화로는 벨트 석탄 (상자로)

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {fur = {}, src = {}, post = {}}
  local function skip(p)
    for _, z in pairs(A.skip) do if p.x >= z[1] and p.y >= z[2] and p.x <= z[3] and p.y <= z[4] then return true end end
    return false
  end
  for _, e in pairs(s.find_entities_filtered{name = {"stone-furnace", "steel-furnace"}, force = f}) do
    if not skip(e.position) then
      local n = e.get_fuel_inventory().get_item_count("coal")
      if n < A.low then out.fur[#out.fur + 1] = {e.position.x, e.position.y, n} end
    end
  end
  for _, c in pairs(s.find_entities_filtered{name = "iron-chest", force = f, area = A.box}) do
    local n = c.get_inventory(defines.inventory.chest).get_item_count("coal")
    if n > 0 then out.src[#out.src + 1] = {c.position.x, c.position.y, n} end
  end
  for i, q in pairs(A.post) do
    local c = s.find_entities_filtered{name = "iron-chest", force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    out.post[i] = c and c.get_inventory(defines.inventory.chest).get_item_count("coal") or -1
  end
  return out
end)()"""


def listify(v):
    return list(v.values()) if isinstance(v, dict) else (v or [])


def once(ai, who) -> dict:
    r = ai.lua(LUA % json.dumps({"low": LOW, "box": COAL_BOX, "post": OUTPOST, "skip": SKIP}))
    fur = sorted(listify(r.get("fur")), key=lambda f: f[2])[:MAX_STOPS]
    post = listify(r.get("post"))
    post_need = [(x, y, goal - h) for (x, y, goal), h in zip(OUTPOST, post) if 0 <= h < OUTPOST_LOW]
    if not fur and not post_need:
        return {"ok": "full"}
    need = sum(FILL - f[2] for f in fur) + sum(n for _, _, n in post_need)
    src = sorted(listify(r.get("src")), key=lambda c: -c[2])
    plan, carry = [], 0
    for x, y, n in src:
        k = min(n, need - carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "coal", "x": x, "y": y, "count": k})]
        carry += k
    if carry < 50:
        return {"fur": len(fur), "coal_src": "empty"}
    fur.sort(key=lambda f: (round(f[0] / 16), f[1]))          # 걸음이 짧게 - 열 (x 16 칸) 마다 위→아래
    for x, y, h in fur:
        k = min(FILL - h, carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("insert", {"name": "coal", "x": x, "y": y, "count": k})]
        carry -= k
    for x, y, n in post_need:
        k = min(n, carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x + 1.5, "y": y}), ("insert", {"name": "coal", "x": x, "y": y, "count": k})]
        carry -= k
    plan.append(("walk_to", {"x": 100.5, "y": -26.5}))
    submit(ai, who, plan[:2 * MAX_STOPS + 12], strict=False)
    return {"fur": len(fur), "min": min([f[2] for f in fur], default=None), "post": post, "carry0": need}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="golf")
    ap.add_argument("--every", type=int, default=300)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = None
    while True:
        try:
            ai = ai or AIBridge()
            body = [b for b in ai.list() if b["name"] == a.who]
            if body and not body[0].get("queued"):
                print(time.strftime("%H:%M:%S"), once(ai, a.who), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

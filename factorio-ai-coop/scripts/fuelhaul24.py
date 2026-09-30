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
NET_BOX, NET_KEEP = [[106, -39.1], [121, -37.9]], 600   # coalnet 공급 상자 5 (107.5..119.5,-38.5) - 망 (보일러 · 화학 · 강철로 요청) 몫 600 씩 남김
MAX_STOPS = 28
# 동쪽 전초 석탄 상자 (P8 설계 - 팔이 광석 벨트 석탄 레인에 붓는다) : 목표
OUTPOST = [(403.5, -149.5, 1500), (413.5, -147.5, 1500)]  # P13 (09:4x) 강철로 24 → 46 - 석탄 0.54 → 1.0/s, 상한 1200 → 1500      # 동쪽 줄은 (413.5,-147.5) (03:4x 새 상자 - 옛 (413.5,-146.5) 는 첫 화로 (409,-147) 팔보다 하류라 그 화로가 relay 연료뿐이었다)
OUTPOST_LOW = 700
SKIP = [[380, -195, 440, -110]]                   # 전초 화로는 벨트 석탄 (상자로)
# 19:4x oil24: 석탄 위기 뒤 망 석탄 < NET_KEEP 이라 coal_src empty 가 30 분 넘게 → 전초 철 화로 46 no_fuel · 기지 철 10분 17k → 2.2k.
#   석탄이 없을 때만 고체 연료 (12 MJ = 석탄 3 몫) 를 전초 상자에 (같은 팔이 벨트 석탄 레인에 붓고, 화로 팔은 받을 수 있는 연료만 집는다).
#   출처는 망 상자 (SF 칸) - 망 고체 연료가 SF_RES 밑이면 안 가져감 (로켓 연료 몫 먼저). 손으로 들고 감, Lua 아이템 이동 0.
# 19:5x 코디네이터: 망 석탄은 coal24 탭 공급 상자 둘 · P10 강철 상자 둘에 있다 (위 두 영역 밖) → 콕 집어 출처로 (x, y, 남김)
COAL_SRC = [(100.5, -26.5, 100), (101.5, -26.5, 100), (19.5, -116.5, 0), (29.5, -116.5, 0)]
SF_SRC = [(59.5, -14.5), (61.5, -15.5)]   # SF1 상자 (-63.5,-4.5) 는 로켓 연료 몫, (-92.5,15.5) 는 RF 줄 서쪽 - 거기서 동쪽으로 가는 길이 RF 줄 관 틈 (y 0 · 1) 에 갇힌다 (19:4x ~ 19:5x 세 번)
SF_GOAL, SF_LOW, SF_RES = 250, 120, 300

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
  -- 13:1x (adv24): 상자 줄 석탄 324 뿐인데 망 석탄 ~10.8k 는 coalnet 공급 상자 (y -38.5) 에 - 여기서도 손으로 (상자마다 NET_KEEP 남김)
  for _, c in pairs(s.find_entities_filtered{name = "passive-provider-chest", force = f, area = A.netbox}) do
    local n = c.get_inventory(defines.inventory.chest).get_item_count("coal") - A.netkeep
    if n > 0 then out.src[#out.src + 1] = {c.position.x, c.position.y, n} end
  end
  for _, q in pairs(A.coalsrc) do
    local c = s.find_entities_filtered{type = {"container", "logistic-container"}, force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    local n = c and (c.get_inventory(defines.inventory.chest).get_item_count("coal") - q[3]) or 0
    if n > 0 then out.src[#out.src + 1] = {q[1], q[2], n} end
  end
  for i, q in pairs(A.post) do
    local c = s.find_entities_filtered{name = "iron-chest", force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    out.post[i] = c and c.get_inventory(defines.inventory.chest).get_item_count("coal") or -1
  end
  out.postsf, out.sfsrc = {}, {}
  for i, q in pairs(A.post) do
    local c = s.find_entities_filtered{name = "iron-chest", force = f, position = {q[1], q[2]}, radius = 0.3}[1]
    out.postsf[i] = c and c.get_inventory(defines.inventory.chest).get_item_count("solid-fuel") or -1
  end
  for _, q in pairs(A.sfsrc) do
    local c = s.find_entities_filtered{type = {"container", "logistic-container"}, force = f, position = q, radius = 0.3}[1]
    local n = c and c.get_inventory(defines.inventory.chest).get_item_count("solid-fuel") or 0
    if n > 0 then out.sfsrc[#out.sfsrc + 1] = {q[1], q[2], n} end
  end
  local net = s.find_logistic_network_by_position({66.5, -15.5}, f)
  out.netsf = net and net.get_item_count("solid-fuel") or 0
  return out
end)()"""


def listify(v):
    return list(v.values()) if isinstance(v, dict) else (v or [])


def once(ai, who) -> dict:
    r = ai.lua(LUA % json.dumps({"low": LOW, "box": COAL_BOX, "post": OUTPOST, "skip": SKIP, "netbox": NET_BOX, "netkeep": NET_KEEP, "sfsrc": SF_SRC, "coalsrc": COAL_SRC}))
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
        return sf_run(ai, who, r, post_need) or {"fur": len(fur), "coal_src": "empty"}
    # 12:5x (adv24): 전초 상자를 «먼저». 화로 28 곳 뒤에 붙이면 계획이 64 단계에서 잘려 전초 몫이 12:42 부터 한 번도 안 갔다
    #   (전초 상자 0 · 전초 철 화로 46 no_fuel · 기지 철 10분 17.8k → 2.3k). 전초 철이 기지 철의 대부분이다.
    for x, y, n in post_need:
        k = min(n, carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x + 1.5, "y": y}), ("insert", {"name": "coal", "x": x, "y": y, "count": k})]
        carry -= k
    fur.sort(key=lambda f: (round(f[0] / 16), f[1]))          # 걸음이 짧게 - 열 (x 16 칸) 마다 위→아래
    for x, y, h in fur:
        k = min(FILL - h, carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("insert", {"name": "coal", "x": x, "y": y, "count": k})]
        carry -= k
    plan.append(("walk_to", {"x": 100.5, "y": -26.5}))
    submit(ai, who, plan[:2 * MAX_STOPS + 12], strict=False)
    return {"fur": len(fur), "min": min([f[2] for f in fur], default=None), "post": post, "carry0": need}


def sf_run(ai, who, r, post_need):
    """석탄이 없을 때 전초 상자에 고체 연료."""
    if not post_need:
        return None
    postsf = listify(r.get("postsf"))
    want = [(x, y, SF_GOAL - h) for (x, y, _g), h in zip(OUTPOST, postsf) if 0 <= h < SF_LOW]
    held = 0
    body = [b for b in ai.list() if b["name"] == who and "x" in b]
    if body:   # 19:4x: 갇혔다 풀린 사람이 들고 있던 몫 먼저
        held = int(ai.lua("""(function() local c = game.surfaces[1].find_entities_filtered{type = 'character', position = {%f, %f}, radius = 1}[1]
          return {n = c and c.get_main_inventory().get_item_count('solid-fuel') or 0} end)()""" % (body[0]["x"], body[0]["y"])).get("n") or 0)
    room = int(r.get("netsf") or 0) - SF_RES
    need = min(sum(n for _, _, n in want), held + max(0, min(room, sum(c[2] for c in listify(r.get("sfsrc"))))))
    if need < 50:
        return {"coal_src": "empty", "sf": "skip", "postsf": postsf, "netsf": r.get("netsf")}
    plan, carry = [], min(held, need)
    for x, y, n in sorted(listify(r.get("sfsrc")), key=lambda c: -c[2]):
        k = min(n, need - carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "solid-fuel", "x": x, "y": y, "count": k})]
        carry += k
    if carry < 50:
        return {"coal_src": "empty", "sf": "no_src"}
    for x, y, n in want:
        k = min(n, carry)
        if k <= 0:
            break
        plan += [("walk_to", {"x": x + 1.5, "y": y}), ("insert", {"name": "solid-fuel", "x": x, "y": y, "count": k})]
        carry -= k
    plan.append(("walk_to", {"x": 100.5, "y": -26.5}))
    submit(ai, who, plan, strict=False)
    return {"coal_src": "empty", "sf": "haul", "carry": need, "postsf": postsf}


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

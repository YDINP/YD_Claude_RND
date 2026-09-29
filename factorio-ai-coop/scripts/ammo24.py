"""Run 24 P7: 탄 줄 (relay S1 · S2 · S3 · 탄 FEEDS) 을 건설 로봇 요청 (item-request-proxy) 으로 바꾼다.

로봇이 망 공급 · 저장 상자에서 실제로 날라 넣는다 (Lua 는 요청만 만든다 - 요청 하나 ≤ 100 개).
  1) 먹이: 노랑 탄창 조립기 ← 철 · 피어싱 조립기 둘 ← 노랑 탄창 · 강철 · 구리 (결과는 logi24 ammo 의 팔 → 공급 상자)
  2) 포탑 (망 안): 탄 < LOW 이면 든 탄과 같은 종류로 채움 (빈 포탑 = 피어싱 먼저). --switch 면 노랑 포탑을 피어싱으로 (빼기 + 넣기 요청)
  3) 망 밖 포탑은 목록만 (outside) - 손 고리 (--who) 가 공급 상자 피어싱을 들고 돈다 (탄 적은 순, 한 바퀴 ≤ 8 포탑)

    python scripts/ammo24.py --run run24 --once
    python scripts/ammo24.py --run run24 --every 60 --who golf
"""
import argparse, json, math, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
from client import AIBridge, RconError  # noqa

# (x, y, 품목, 이 밑이면, 요청 수, 망에 이만큼은 남김)
FEED = [(-53.5, 3.5, "iron-plate", 20, 40, 300)]
for _x, _y in ((-92.5, -6.5), (-68.5, -10.5)):
    FEED += [(_x, _y, "firearm-magazine", 4, 10, 200), (_x, _y, "steel-plate", 4, 10, 50), (_x, _y, "copper-plate", 10, 25, 300)]
# 03:3x 노랑은 포탑 몫 먼저 (망 200 넘을 때만 피어싱 재료로) - 노랑 조립기 결과 팔 (-53.5,5.5) 은 걷음: relay S1 (망 밖 포탑 · P10 북쪽 포탑) 의 노랑 출처가 그 결과칸이다
# 공급 상자 (logi24 ammo) - 손 고리가 여기서 꺼낸다
OUT_CHESTS = [(-92.5, -3.5), (-68.5, -13.5)]
LOW, FILL = 10, 20
YELLOW_KEEP = 40          # 노랑은 피어싱 재료 몫을 남긴다
MAX_REQ = 40              # 한 번에 만드는 요청 수 상한
SW_MAX = 6                # 한 번에 피어싱으로 바꾸는 포탑 수 (빼기 + 넣기 - 망 피어싱을 넘겨 요청하면 빼기만 되어 빈 포탑이 된다)
PIERCE_KEEP = 60          # 바꿈은 망 피어싱이 이만큼 남을 때만 (빈 포탑 채우기 몫)
# 바꾸는 순서: 발전 남쪽 호숫가 (01:38 공습, 코디네이터) → relay PIERCE_ZONES 순
SW_ZONES = [[-40, 30, 12, 56]]
# relay S1 · S2 가 살아 있는 곳에서는 바꾸지 않는다 (relay 가 노랑을 다시 넣어 빼기만 된다) - relay SAFE_OFF 와 같게 넓힌다.
#   다음: [-220, 14, -178, 56], [-130, 0, -84, 50], [115, -50, 140, 14], [-104, -12, -30, 16], [70, -70, 100, -58], [48, 70, 90, 102]

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local out = {req = {}, skip = {}, outside = {}, net = {}, sw = 0}
  local nreq = 0
  local function busy(e) return s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} > 0 end
  local function net_of(p) return s.find_logistic_network_by_position(p, f) end
  -- 포탑 · 조립기 요청은 건설 로봇이 채운다 → 건설 범위 (로보포트 55) 안의 망이면 된다 (로봇이 가장 많은 망)
  local function cnet_of(p)
    local best
    for _, n in pairs(s.find_logistic_networks_by_construction_area(p, f) or {}) do
      if not best or n.all_construction_robots > best.all_construction_robots then best = n end
    end
    return best
  end
  local function proxy(e, ins, rem)
    local t = {name = 'item-request-proxy', position = e.position, force = f, target = e, modules = ins}
    if rem then t.removal_plan = rem end
    return s.create_entity(t)
  end
  -- 1) 조립기 먹이
  for _, q in pairs(A.feed) do
    local a = s.find_entities_filtered{type = 'assembling-machine', force = f, position = {q[1], q[2]}, radius = 0.5}[1]
    local net = a and cnet_of(a.position)
    if a and net and nreq < A.max then
      local have = a.get_inventory(defines.inventory.assembling_machine_input).get_item_count(q[3])
      local r = a.get_recipe()
      local stack
      if r then for i, ing in pairs(r.ingredients) do if ing.name == q[3] then stack = i - 1 end end end
      if stack and have < q[4] and not busy(a) and net.get_item_count(q[3]) >= q[5] + q[6] then
        proxy(a, {{id = {name = q[3]}, items = {in_inventory = {{inventory = defines.inventory.assembling_machine_input, stack = stack, count = q[5]}}}}})
        nreq = nreq + 1
        out.req[#out.req + 1] = q[3] .. ' ' .. q[5] .. ' @' .. q[1] .. ',' .. q[2]
      end
    elseif not net then out.skip[#out.skip + 1] = q[3] .. ' nonet @' .. q[1] .. ',' .. q[2] end
  end
  -- 2) 포탑
  local TI = defines.inventory.turret_ammo
  local spent = {}      -- 망마다 이번에 요청한 탄 (요청이 망 재고를 넘지 않게)
  local function left(net, it) local k = net.network_id .. it return net.get_item_count(it) - (spent[k] or 0) end
  local function spend(net, it, n) local k = net.network_id .. it spent[k] = (spent[k] or 0) + n end
  local nsw = 0
  local turrets = s.find_entities_filtered{name = 'gun-turret', force = f}
  -- 바꿈 먼저 볼 곳 (A.zones 순서) - 나머지는 뒤에
  local function zone_of(t)
    for i, z in pairs(A.zones) do
      if t.position.x >= z[1] and t.position.y >= z[2] and t.position.x <= z[3] and t.position.y <= z[4] then return i end
    end
    return 99
  end
  table.sort(turrets, function(a, b) return zone_of(a) < zone_of(b) end)
  for _, t in pairs(turrets) do
    local inv = t.get_inventory(TI)
    local y, p = inv.get_item_count('firearm-magazine'), inv.get_item_count('piercing-rounds-magazine')
    local net = cnet_of(t.position)
    if not net or net.all_construction_robots == 0 then
      out.outside[#out.outside + 1] = {t.position.x, t.position.y, y + p, (p > 0 or y == 0) and 'piercing-rounds-magazine' or 'firearm-magazine'}
    elseif nreq < A.max and not busy(t) then
      local np, ny = left(net, 'piercing-rounds-magazine'), left(net, 'firearm-magazine')
      if A.switch and nsw < A.swmax and zone_of(t) < 99 and y > 0 and p == 0 and np >= A.fill + A.pkeep then
        spend(net, 'piercing-rounds-magazine', A.fill) nsw = nsw + 1
        proxy(t, {{id = {name = 'piercing-rounds-magazine'}, items = {in_inventory = {{inventory = TI, stack = 0, count = A.fill}}}}},
                 {{id = {name = 'firearm-magazine'}, items = {in_inventory = {{inventory = TI, stack = 0, count = y}}}}})
        nreq = nreq + 1 out.sw = out.sw + 1
      elseif y + p < A.low then
        local it
        if p > 0 then it = 'piercing-rounds-magazine'
        elseif y > 0 then it = 'firearm-magazine'
        elseif np >= A.fill then it = 'piercing-rounds-magazine' else it = 'firearm-magazine' end
        local avail = (it == 'piercing-rounds-magazine') and np or (ny - A.ykeep)
        local n = math.min(A.fill - (y + p), avail)
        if n >= 5 then
          spend(net, it, n)
          proxy(t, {{id = {name = it}, items = {in_inventory = {{inventory = TI, stack = 0, count = n}}}}})
          nreq = nreq + 1
          out.req[#out.req + 1] = it .. ' ' .. n .. ' @' .. t.position.x .. ',' .. t.position.y
        else out.skip[#out.skip + 1] = 'turret ' .. it .. ' short @' .. t.position.x .. ',' .. t.position.y end
      end
    end
  end
  local n0 = net_of({66.5, -15.5})
  if n0 then for _, k in pairs({'iron-plate', 'copper-plate', 'steel-plate', 'firearm-magazine', 'piercing-rounds-magazine'}) do out.net[k] = n0.get_item_count(k) end end
  return out
end)()"""


def lua_args(switch):
    return json.dumps({"feed": FEED, "low": LOW, "fill": FILL, "ykeep": YELLOW_KEEP, "max": MAX_REQ, "switch": bool(switch),
                       "swmax": SW_MAX, "pkeep": PIERCE_KEEP, "zones": SW_ZONES})


def hand_round(ai, who, outside):
    """망 밖 포탑 - 탄 적은 순 ≤ 8, 공급 상자 피어싱을 들고 가 넣는다 (사람 손, 허용된 방식)."""
    from orders import submit
    low = sorted([o for o in outside if o[2] < LOW], key=lambda o: o[2])[:8]
    if not low:
        return {"hand": 0}
    need = sum(FILL - o[2] for o in low)
    src = ai.lua("""(function() local s = game.surfaces[1] local r = {}
      for i, c in pairs(helpers.json_to_table('%s')) do
        local e = s.find_entities_filtered{type = 'logistic-container', position = c, radius = 0.3}[1]
        r[i] = e and e.get_inventory(defines.inventory.chest).get_item_count('piercing-rounds-magazine') or 0 end
      return r end)()""" % json.dumps(OUT_CHESTS))
    src = [src[str(i + 1)] if isinstance(src, dict) else src[i] for i in range(len(OUT_CHESTS))]
    plan, carry = [], 0
    for (x, y), n in zip(OUT_CHESTS, src):
        k = min(n, need - carry)
        if k > 0:
            plan += [("walk_to", {"x": x + 1.5, "y": y}), ("take", {"name": "piercing-rounds-magazine", "x": x, "y": y, "count": k})]
            carry += k
    if carry < 10:
        return {"hand": 0, "src": src}
    for x, y, have, it in low:
        k = min(FILL - have, carry)
        if k <= 0:
            break
        if have > 0 and it != "piercing-rounds-magazine":
            continue                       # 노랑이 든 포탑에는 피어싱이 안 들어간다
        plan += [("walk_to", {"x": x + 2, "y": y + 2}), ("insert", {"name": "piercing-rounds-magazine", "x": x, "y": y, "count": k})]
        carry -= k
    plan.append(("walk_to", {"x": -60.5, "y": -3.5}))
    submit(ai, who, plan[:40], strict=False)
    return {"hand": len(low), "carry": carry}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=int, default=60)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--switch", action="store_true", help="노랑 포탑을 피어싱으로 (망 피어싱이 넉넉할 때)")
    ap.add_argument("--who", default="", help="망 밖 포탑 손 고리 캐릭터 (없으면 목록만)")
    ap.add_argument("--hand-every", type=int, default=600)
    a = ap.parse_args()
    ai, last_hand = None, 0.0
    while True:
        try:
            ai = ai or AIBridge()
            r = ai.lua(LUA % lua_args(a.switch))
            outside = r.get("outside") or []
            outside = list(outside.values()) if isinstance(outside, dict) else outside
            low_out = sum(1 for o in outside if o[2] < LOW)
            line = {"req": len(r.get("req") or []), "sw": r.get("sw"), "skip": r.get("skip") or [], "net": r.get("net"),
                    "outside": len(outside), "outside_low": low_out, "min_out": min([o[2] for o in outside], default=None)}
            if a.who and time.time() - last_hand >= a.hand_every and low_out:
                body = [b for b in ai.list() if b["name"] == a.who]
                if body and not body[0].get("queued"):
                    line["hand"] = hand_round(ai, a.who, outside)
                    last_hand = time.time()
            print(time.strftime("%H:%M:%S"), json.dumps(line, ensure_ascii=False), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

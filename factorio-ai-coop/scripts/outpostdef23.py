"""전초 방어선 (광석 밖) - 구리 (61,-407) · 철 (-213,-248). 사용자 07:45 «채굴지에 방어선 (광석 바로 위 X)».

광맥 경계 상자 (자원 칸 중심 x0..x1 · y0..y1) 에서 3칸 밖에 포탑 줄, 2.5칸 안쪽에 작은 전봇대 줄 (6칸 간격, 사거리 7.5).
포탑 · 전봇대 모두 발밑 (2×2 / 1×1) 자원 0 을 확인하고, 막히면 줄에 수직 (바깥 · 안쪽 1) → 줄 따라 ±1 · ±2 로 옮긴다.
포탑은 전봇대 칸마다 (적 쪽 변 dense) · 두 칸마다 (나머지 sparse). 레이저 · 기관총 번갈아 (현장별 레이저 상한).
레이저는 바로 옆 전봇대 공급 칸 (±2.5) 과 겹친다. 전봇대 줄은 CONNECT (기존 주 전력망 전봇대) 에서 이어진다.
나무 · 바위는 로봇 해체 표시. 유령만 놓는다 (로봇이 짓는다). 철거 없음.
철 전초는 망 32 (로봇 10) 라 재료 · 탄을 망 2 저장 상자에서 망 32 저장 상자 (-199.5,-236.5) 로 옮긴다 (있는 물건만).

    python -u scripts/outpostdef23.py plan  cu|fe     # 드라이런 (칸 · 자원 검사)
    python -u scripts/outpostdef23.py build cu|fe     # 유령 설치 (state/outpostdef23.json 에 고른 칸 기록)
    python -u scripts/outpostdef23.py check           # 지어짐 · 레이저 전력 · 탄
    python -u scripts/outpostdef23.py watch           # 상주 60 초: 탄 proxy (≤100), 망 32 재료 옮기기, 유령 복구
로그 state/outpostdef23.log
"""
import argparse
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge")]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "outpostdef23.log")
STATE = os.path.join(HERE, "..", "state", "outpostdef23.json")
NET32_CHEST = (-199.5, -236.5)

SITES = {
    # bbox = 자원 칸 중심 (x0, x1, y0, y1). sides: 변 -> 'dense' | 'sparse' | None
    "cu": dict(bbox=(35.5, 88.5, -431.5, -381.5), sides={"N": "dense", "E": "sparse", "W": "sparse", "S": None},
               lasers=8, net_pos=(46, -404), connect=[(38.5, -379.5), (44.5, -379.5), (50.5, -379.5)], label="구리"),
    "fe": dict(bbox=(-231.5, -195.5, -268.5, -228.5), sides={"N": "dense", "W": "dense", "S": "sparse", "E": "sparse"},
               lasers=10, net_pos=(-202, -237), connect=[], label="철"),
}
ORDER = ["N", "E", "W", "S"]
STEP = 6


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(st):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)


def lines(site):
    """변마다 (전봇대 목록, 포탑 목록). 포탑 = (x, y, 바깥 방향 벡터)."""
    x0, x1, y0, y1 = site["bbox"]
    yN, yS = math.floor(y0) - 3, math.ceil(y1) + 3          # 포탑 중심 (정수)
    xW, xE = math.floor(x0) - 3, math.ceil(x1) + 3
    pN, pS, pW, pE = yN + 2.5, yS - 2.5, xW + 2.5, xE - 2.5  # 전봇대 줄 (반칸)

    def span(a, b):
        n = max(1, math.ceil((b - a) / STEP))
        return [a + (b - a) * k / n for k in range(n + 1)]
    out = {}
    # 전봇대: 0.5 격자에 맞춘다
    snap = lambda v: math.floor(v) + 0.5  # noqa: E731
    sides = site["sides"]
    has_s = sides.get("S") is not None
    yend = pS if has_s else y1 - 1        # 남쪽 변이 없으면 동·서 줄은 광맥 남단까지만
    out["N"] = [(snap(v), pN) for v in span(pW, pE)]
    out["W"] = [(pW, snap(v)) for v in span(pN, yend)]
    out["E"] = [(pE, snap(v)) for v in span(pN, yend)]
    out["S"] = [(snap(v), pS) for v in span(pW, pE)] if has_s else []
    vec = {"N": (0, -1), "S": (0, 1), "W": (-1, 0), "E": (1, 0)}
    res = {}
    for side in ORDER:
        mode = sides.get(side)
        if mode is None:
            continue
        poles = out[side]
        every = 1 if mode == "dense" else 2
        tur = []
        for k, (px, py) in enumerate(poles):
            if k == 0 or k == len(poles) - 1:
                continue                  # 모서리는 이웃 변과 겹친다
            if k % every:
                continue
            dx, dy = vec[side]
            tx = px + 0.5 if dx == 0 else px + 2.5 * dx
            ty = py + 0.5 if dy == 0 else py + 2.5 * dy
            tur.append((tx, ty, dx, dy))
        res[side] = (poles, tur)
    return res


LUA_FIND = r"""
local function blockers(s, x, y, w)
  local h = w / 2 - 0.05
  local bad, soft = {}, {}
  if s.count_entities_filtered{area = {{x - h, y - h}, {x + h, y + h}}, type = 'resource'} > 0 then return {'ore'}, soft end
  for _, e in pairs(s.find_entities_filtered{area = {{x - h, y - h}, {x + h, y + h}}}) do
    if e.type == 'tree' or e.type == 'simple-entity' then bad[#bad + 1] = 'tree'
    elseif e.type ~= 'character' and e.type ~= 'corpse' and e.type ~= 'fish' and e.type ~= 'item-entity' then bad[#bad + 1] = e.name end
  end
  for tx = math.floor(x - h), math.floor(x + h) do for ty = math.floor(y - h), math.floor(y + h) do
    local t = s.get_tile(tx, ty) if t.collides_with('water_tile') then bad[#bad + 1] = 'water' end end end
  return bad, soft
end
local function pick(s, name, x, y, w, offs)
  local e = s.find_entities_filtered{name = name, position = {x, y}, radius = 0.6}[1] or s.find_entities_filtered{ghost_name = name, position = {x, y}, radius = 0.6}[1]
  if e then return {e.position.x, e.position.y, 'have'} end
  local why
  for _, o in pairs(offs) do
    local px, py = x + o[1], y + o[2]
    local e2 = s.find_entities_filtered{name = name, position = {px, py}, radius = 0.6}[1] or s.find_entities_filtered{ghost_name = name, position = {px, py}, radius = 0.6}[1]
    if e2 then return {e2.position.x, e2.position.y, 'have'} end
    local bad, soft = blockers(s, px, py, w)
    if #bad == 0 then return {px, py, 'free', soft} end
    why = bad[1]
  end
  return {x, y, 'fail', nil, why}
end
"""

PLAN = r"""(function() """ + LUA_FIND + r"""
  local s = game.surfaces[1] local o = {}
  for i, t in pairs({%s}) do
    local r = pick(s, t[1], t[2], t[3], t[4], t[5])
    o[i] = {r[1], r[2], r[3], 0, r[5]}
  end
  return o end)()"""


def offsets(dx, dy, w):
    """수직 (바깥 1 · 안쪽 1) 먼저, 그다음 줄 따라."""
    perp = [(0, 0), (dx, dy), (-dx, -dy)]
    along = (1, 0) if dx == 0 else (0, 1)
    out = list(perp)
    for k in (1, -1, 2, -2):
        out.append((along[0] * k, along[1] * k))
    return out


def lua_rows(items):
    parts = []
    for name, x, y, w, offs in items:
        o = ", ".join("{%s, %s}" % p for p in offs)
        parts.append("{'%s', %s, %s, %s, {%s}}" % (name, x, y, w, o))
    return ", ".join(parts)


def items_for(site_key):
    site = SITES[site_key]
    res = lines(site)
    items, kinds = [], []
    for c in site["connect"]:
        items.append(("small-electric-pole", c[0], c[1], 1, [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0)]))
        kinds.append(("conn", "-"))
    nl = 0
    alt = 0
    for side in ORDER:
        if side not in res:
            continue
        poles, tur = res[side]
        dx, dy = {"N": (0, -1), "S": (0, 1), "W": (-1, 0), "E": (1, 0)}[side]
        for p in poles:
            items.append(("small-electric-pole", p[0], p[1], 1, offsets(dx, dy, 1)))
            kinds.append(("pole", side))
        for tx, ty, _, _ in tur:
            laser = alt % 2 == 0 and nl < site["lasers"]
            alt += 1
            if laser:
                nl += 1
                # 레이저는 전봇대 공급 칸과 겹쳐야 한다 -> 줄 따라 ±1 까지만 (수직 이동 금지)
                offs = [(0, 0)] + ([(1, 0), (-1, 0), (2, 0), (-2, 0)] if dx == 0 else [(0, 1), (0, -1), (0, 2), (0, -2)])
            else:
                al = [(k, 0) if dx == 0 else (0, k) for k in (1, -1, 2, -2, 3, -3)]
                offs = [(0, 0), (dx, dy)] + al + [(dx + a2[0], dy + a2[1]) for a2 in al[:4]]
            items.append(("laser-turret" if laser else "gun-turret", tx, ty, 2, offs))
            kinds.append(("tur", side))
    return items, kinds


def move_to_net32(ai, wants):
    """망 2 저장 상자 -> 망 32 저장 상자. 있는 물건만 옮긴다. wants: {item: 망 32 목표}"""
    rows = ", ".join("{'%s', %d}" % kv for kv in wants.items())
    return ai.lua("""(function() local s = game.surfaces[1] local o = {}
      local n2 = s.find_logistic_network_by_position({-24, -88}, 'player')
      local n32 = s.find_logistic_network_by_position({-202, -237}, 'player')
      local ch = s.find_entities_filtered{name = 'storage-chest', position = {%s, %s}, radius = 0.6}[1]
      if not (n2 and n32 and ch) then return {err = 'no net/chest'} end
      local inv = ch.get_inventory(defines.inventory.chest)
      for _, w in pairs({%s}) do
        local need = w[2] - n32.get_item_count(w[1])
        if need > 0 then
          local can = math.min(need, n2.get_item_count(w[1]), inv.get_insertable_count(w[1]))
          if can > 0 then local got = n2.remove_item{name = w[1], count = can}
            if got > 0 then local put = inv.insert{name = w[1], count = got}
              if put < got then n2.insert({name = w[1], count = got - put}, 'storage') end
              o[w[1]] = put end end end
      end return o end)()""" % (NET32_CHEST[0], NET32_CHEST[1], rows))


def plan(ai, key, place=False):
    items, kinds = items_for(key)
    r = ai.lua(PLAN % lua_rows(items))
    chosen = []
    fails = []
    for i, (it, kd) in enumerate(zip(items, kinds)):
        v = r.get(str(i + 1)) if isinstance(r, dict) else r[i]
        if v is None:
            continue
        x, y, how, soft, why = (list(v) + [None] * 5)[:5]
        if how in ("fail", "ghostfail"):
            fails.append("%s@%s,%s(%s)" % (it[0][:5], it[1], it[2], why))
        else:
            chosen.append([it[0], x, y, kd[1], how])
    return chosen, fails


ENTRY = {"cu": (40.5, -380.5), "fe": (-190.5, -236.5)}


def ammo_for(ai):
    r = ai.lua("""(function() local n = game.surfaces[1].find_logistic_network_by_position({-24, -88}, 'player')
      return {pr = n.get_item_count('piercing-rounds-magazine'), fm = n.get_item_count('firearm-magazine')} end)()""")
    return "piercing-rounds-magazine" if r.get("pr", 0) >= 300 else "firearm-magazine"


def cmd_plan(ai, key, place):
    """plan: 칸 고르기 (드라이런). build: 고른 칸을 캐릭터가 짓는다 (유령 없음)."""
    site = SITES[key]
    chosen, fails = plan(ai, key, False)
    cnt = {}
    for c in chosen:
        cnt[c[0]] = cnt.get(c[0], 0) + 1
    log("%s 계획: %s · 실패 %s" % (site["label"], cnt, fails))
    if not place:
        return chosen, fails
    st = load()
    st[key] = {"items": chosen, "t": time.strftime("%H:%M:%S")}
    save(st)
    builds = [(c[0], c[1], c[2], "north") for c in chosen]
    mag = ammo_for(ai)

    def inserts_for(chunk):
        return [(mag, b[1], b[2], 50) for b in chunk if b[0] == "gun-turret"]
    import outpostcrew23 as crew
    ok = crew.run_job(ai, builds, inserts_for, ENTRY[key], "outpostdef23", log, crew_n=3, rounds=5)
    log("%s 방어선 캐릭터 건설 %s · 점검 %s" % (site["label"], "완료" if ok else "미완", check(ai, key)))
    return chosen, fails


CHECK = r"""(function() local s = game.surfaces[1] local o = {built = {}, ghost = 0, laser_ok = 0, laser_bad = {}, ammo_low = 0, poles = 0, gun = 0}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  for _, t in pairs({%s}) do
    local e = s.find_entities_filtered{name = t[1], position = {t[2], t[3]}, radius = 0.6}[1]
    if e then o.built[t[1]] = (o.built[t[1]] or 0) + 1
      if t[1] == 'laser-turret' then
        local ok = e.is_connected_to_electric_network() and e.energy > 0
        if ok then o.laser_ok = o.laser_ok + 1 else o.laser_bad[#o.laser_bad + 1] = t[2] .. ',' .. t[3] .. ':' .. (st[e.status] or '?') end
      elseif t[1] == 'gun-turret' then o.gun = o.gun + 1
        local inv = e.get_inventory(defines.inventory.turret_ammo)
        if inv.get_item_count() < 20 then o.ammo_low = o.ammo_low + 1 end
        if t[4] and inv.get_item_count() < 20 and s.count_entities_filtered{name = 'item-request-proxy', position = e.position, radius = 0.6} == 0 then
          local net = e.surface.find_logistic_network_by_position(e.position, 'player')
          local nm = nil
          if net then
            if net.get_item_count('piercing-rounds-magazine') >= 60 then nm = 'piercing-rounds-magazine'
            elseif net.get_item_count('firearm-magazine') >= 60 then nm = 'firearm-magazine' end
          end
          if nm then pcall(function() s.create_entity{name = 'item-request-proxy', position = e.position, force = 'player', target = e,
            modules = {{id = {name = nm}, items = {in_inventory = {{inventory = defines.inventory.turret_ammo, stack = 0, count = 50}}}}}} end)
            o.req = (o.req or 0) + 1 end
        end
      end
    elseif s.find_entities_filtered{ghost_name = t[1], position = {t[2], t[3]}, radius = 0.6}[1] then o.ghost = o.ghost + 1
    else o.missing = (o.missing or 0) + 1 end
  end
  return o end)()"""


def check(ai, key, act=False):
    st = load().get(key)
    if not st:
        return None
    rows = ", ".join("{'%s', %s, %s, %s}" % (c[0], c[1], c[2], "true" if act else "false") for c in st["items"])
    return ai.lua(CHECK % rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["plan", "build", "check", "watch"])
    ap.add_argument("site", nargs="?", default=None)
    ap.add_argument("--every", type=float, default=60)
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd in ("plan", "build"):
        sys.path.insert(0, HERE)
        cmd_plan(ai, a.site, a.cmd == "build")
        return 0
    keys = [a.site] if a.site else list(SITES)
    if a.cmd == "check":
        for k in keys:
            log("%s 점검 %s" % (SITES[k]["label"], check(ai, k)))
        return 0
    log("outpostdef23 상주 시작")
    last = {}
    while True:
        try:
            for k in keys:
                if k == "fe" and load().get("fe"):
                    mv = move_to_net32(ai, {"piercing-rounds-magazine": 200, "firearm-magazine": 200, "repair-pack": 60})
                    if mv:
                        log("망 32 로 옮김 %s" % mv)
                r = check(ai, k, act=True)
                if r is None:
                    continue
                key = json.dumps({x: r.get(x) for x in ("built", "ghost", "laser_ok", "laser_bad", "ammo_low")}, sort_keys=True)
                if key != last.get(k) or r.get("req"):
                    log("%s %s" % (SITES[k]["label"], r))
                    last[k] = key
        except Exception as e:  # noqa: BLE001
            log(f"오류 {type(e).__name__}: {e}"[:300])
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

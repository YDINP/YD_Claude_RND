"""run23 방어선 안 짜내기 - 노랑 사슬 철·구리.

    python scripts/inner23.py metrics
    python scripts/inner23.py show x0 y0 x1 y1
    python scripts/inner23.py <stage> [--go]

로그 state/inner23.log. 사람 일은 state/yellow23_orders.json 로만.
"""
import argparse
import json
import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
os.environ.setdefault("AI_RUN", "run23")
import rebuild23 as R  # noqa: E402
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "inner23.log")
R.LOG = LOG


def say(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def metrics(ai):
    items = ("iron-ore", "iron-plate", "copper-ore", "copper-plate", "electronic-circuit",
             "utility-science-pack")
    names = ",".join("'%s'" % n for n in items)
    r = ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local P, o = f.get_item_production_statistics(s), {tick = game.tick}
      for _, n in pairs({%s}) do
        local a = P.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true}
        local c = P.get_flow_count{name = n, category = 'output', precision_index = defines.flow_precision_index.ten_minutes, count = true}
        local a1 = P.get_flow_count{name = n, category = 'input', precision_index = defines.flow_precision_index.one_minute, count = true}
        o[n] = string.format("%%.0f/%%.0f (1m %%.0f)", a / 10, c / 10, a1)
      end
      local ys = P.get_flow_count{name = 'utility-science-pack', category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true}
      o.yellow10 = ys
      local r = f.current_research o.research = r and r.name or '-' o.progress = f.research_progress
      return o end)()""" % names)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("stage")
    ap.add_argument("args", nargs="*")
    ap.add_argument("--go", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.stage == "metrics":
        say("수치[%s] %s" % (a.args[0] if a.args else "-", json.dumps(metrics(ai), ensure_ascii=False)))
    elif a.stage == "show":
        x0, y0, x1, y1 = map(float, a.args)
        R.show(ai, x0, y0, x1, y1)
    else:
        STAGES[a.stage](ai, a.go)
    return 0


STAGES = {}


def stage(name):
    def deco(fn):
        STAGES[name] = fn
        return fn
    return deco


# ---------------------------------------------------------------- 1. 철 배분
# 원인 (17:58): col41 동쪽 출구 x=-33.5 가 비어 탭1 (-32.5,-7.5) 이 회로 조건 (G 우선) 으로 꺼짐 → X3 (y=-6.5 → x=-15.5 → y=-41.5)
# 철 레인 0 → 회로 (-10.5,-21.5) 등 노랑 G 블록 철 0. X3 철 레인 보조 긴팔 (-23.5/-22.5,-4.5) 은 손 먹이 상자 (cu23 FE_CHESTS) 에서 집음 - 비었음.
# 회로 (9.5,-8.5) 는 손 먹이 상자 (9.5,-5.5) - 비었음. 망 (13 포트) 창고 철판 1.3만 → item-request-proxy 로봇 배달로 손 먹이 대체.
FEED = [(-23.5, -2.5), (-22.5, -2.5), (9.5, -5.5)]
FEED_TO = 1600                    # 채울 목표 (상자 3200 의 절반; 긴팔 2 · AM1 회로 최대 ~60/분 → 25분 넘게)
FEED_MIN = 800                    # 이 밑이면 요청


def chest_iron(ai, xy):
    return ai.lua("""(function() local s = game.surfaces[1]
      local c = s.find_entities_filtered{type = 'container', position = {%s, %s}, radius = 0.1}[1]
      if not c then return {n = -1} end
      local p = s.find_entities_filtered{name = 'item-request-proxy', position = c.position, radius = 0.3}[1]
      return {n = c.get_inventory(defines.inventory.chest).get_item_count('iron-plate'), proxy = p and true or false} end)()""" % xy)


def request_iron(ai, xy, n):
    """item-request-proxy: 칸마다 100 (한 칸에 100 넘게 적으면 요청이 사라진다). 빈 칸부터."""
    return ai.lua("""(function() local s = game.surfaces[1]
      local c = s.find_entities_filtered{type = 'container', position = {%s, %s}, radius = 0.1}[1]
      if not c then return {err = 'no chest'} end
      if s.find_entities_filtered{name = 'item-request-proxy', position = c.position, radius = 0.3}[1] then return {err = 'already'} end
      local inv, want, pos = c.get_inventory(defines.inventory.chest), %d, {}
      for i = 1, #inv do if want <= 0 then break end
        local st = inv[i] local room = 0
        if not st.valid_for_read then room = 100 elseif st.name == 'iron-plate' then room = 100 - st.count end
        if room > 0 then local k = math.min(room, want) pos[#pos+1] = {inventory = defines.inventory.chest, stack = i - 1, count = k} want = want - k end end
      if #pos == 0 then return {err = 'full'} end
      local ok, e = pcall(function() return s.create_entity{name = 'item-request-proxy', position = c.position, force = 'player', target = c,
        modules = {{id = {name = 'iron-plate'}, items = {in_inventory = pos}}}} end)
      return {ok = ok, slots = #pos, err = (not ok) and tostring(e) or nil} end)()""" % (xy[0], xy[1], n))


def feed_once(ai, go):
    out = []
    for xy in FEED:
        st = chest_iron(ai, xy)
        want = FEED_TO - st["n"]
        if st["n"] < 0:
            out.append("%s 상자없음" % (xy,))
        elif st["proxy"] or st["n"] >= FEED_MIN:
            out.append("%s %d%s" % (xy, st["n"], " 배달중" if st["proxy"] else ""))
        elif go:
            r = request_iron(ai, xy, want)
            out.append("%s %d +%d %s" % (xy, st["n"], want, "요청" if r.get("ok") else r))
        else:
            out.append("%s %d (요청 예정 +%d)" % (xy, st["n"], want))
    return out


@stage("feed")
def st_feed(ai, go):
    say("철 배분 1회: %s" % " · ".join(feed_once(ai, go)))


# 조정자 (18:13): 상자당 1,600 로봇 요청이 건설 로봇 55대를 묶어 전진 포대 탄 배달이 막혔다.
# → 로봇은 상자당 한 번에 ROBOT_N (≤100) 이하, 탄/다른 요청이 걸려 있거나 쉬는 로봇 < 40 이면 건너뜀.
#   대량은 사람 운반 (state/yellow23_orders.json, 빈 제작꾼 1명, 한 번에 1건).
ROBOT_N = 50
ROBOT_FEED = [(-23.5, -2.5), (-22.5, -2.5)]          # (9.5,-5.5) 는 accel23 이 손으로 1,000 씩 (18:54 까지)
HAUL = {(-23.5, -2.5): (-23.0, -1.5), (-22.5, -2.5): (-22.0, -1.5), (9.5, -5.5): (10.5, -3.5),
        (-31.5, 1.5): (-30.5, 1.5)}  # 톱니 (-36.5,3.5) 공급 상자 (사이클 2)
# 수류탄 철은 battfeed23 ASM 로봇 직접 보충으로 옮김 - 상자 -> 벨트 x=-43.5 로 넣으면 조립기를 지나쳐 샌다 (21:00 185 -> 수류탄 6)
HAUL_BELOW, HAUL_N = 300, 800


def robots_free(ai):
    return ai.lua("""(function() local s, f = game.surfaces[1], game.forces.player
      local n = f.find_logistic_network_by_position({-60, -40}, s)
      local other = 0
      for _, p in pairs(s.find_entities_filtered{name = 'item-request-proxy', force = f}) do
        for _, ip in pairs(p.insert_plan) do if ip.id.name ~= 'iron-plate' then other = other + 1 end end end
      return {avail = n and n.available_construction_robots or 0, other = other} end)()""")


def haul_once(ai, go):
    import yellow23 as Y
    pending = Y_orders(Y)
    if any(any(st[0] == "insert" and st[1].get("name") == "iron-plate" for st in pending[w]) for w in pending):
        return "손 운반: 철 주문 대기 중"
    low = [(xy, chest_iron(ai, xy)["n"]) for xy in HAUL]
    low = [(xy, n) for xy, n in low if 0 <= n < HAUL_BELOW]
    if not low:
        return "손 운반: 필요 없음"
    # 우선순위: 수류탄 (검정팩 - artillery 남은 440 단위에 검정 440 필요) > 노랑 회로 상자 > 나머지. 전엔 늘 X3 상자만 골랐다
    pri = {(-45.5, -44.5): 0, (9.5, -5.5): 1}
    xy, n = min(low, key=lambda t: (pri.get(t[0], 2), t[1]))
    live = {w["name"]: w for w in ai.list()}
    makers = ["hotel", "foxtrot", "charlie", "echo", "bravo", "alpha"]
    pos = {w: (live[w]["x"], live[w]["y"]) for w in makers if w in live}
    idle = [w for w in makers if w in live and not (live[w].get("current") or live[w].get("queued")) and w not in pending]
    if not idle:
        return "손 운반: 빈 제작꾼 없음 (%s %d)" % (xy, n)
    who = idle[0]
    # 허브 철은 공급 상자 (-83.5/-82.5/-81.5,-52.5) 에 있다 (yellow23.snap 은 이 상자를 안 봄)
    src = ai.lua("""(function() local s, o = game.surfaces[1], {}
      for _, x in pairs({-83.5, -82.5, -81.5}) do local c = s.find_entities_filtered{type = 'logistic-container', position = {x, -52.5}, radius = 0.1}[1]
        o[#o+1] = c and c.get_item_count('iron-plate') or 0 end return o end)()""")
    x = [-83.5, -82.5, -81.5][max(range(3), key=lambda i: src[i])]
    # 우선 상자 (수류탄·회로) 는 허브가 800 이 안 돼도 있는 만큼 (150 이상) 나른다 - 철 고갈 중 (20:56)
    n_take = HAUL_N if max(src) >= HAUL_N else (int(max(src)) if pri.get(xy, 2) < 2 and max(src) >= 150 else 0)
    if not n_take:
        return "손 운반: 허브 공급 상자 철 모자람 %s" % src
    steps = [Y.walk(x, Y.HUB_Y + 2.0), ("take", {"name": "iron-plate", "x": x, "y": -52.5, "count": n_take})]
    if go:
        Y.put_order(who, steps + [Y.walk(*HAUL[xy]), ("insert", {"name": "iron-plate", "x": xy[0], "y": xy[1], "count": n_take})])
    return "손 운반: %s %d -> +%d (%s)%s" % (xy, n, n_take, who, "" if go else " 시험")


def Y_orders(Y):
    try:
        with open(Y.ORDERS, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def robot_once(ai, go):
    rf = robots_free(ai)
    if rf["other"] > 0 or rf["avail"] < 40:
        return "로봇: 건너뜀 (다른 요청 %d · 쉬는 로봇 %d)" % (rf["other"], rf["avail"])
    out = []
    for xy in ROBOT_FEED:
        st = chest_iron(ai, xy)
        if st["proxy"] or st["n"] >= 100:
            out.append("%s %d" % (xy, st["n"]))
        elif go:
            r = request_iron(ai, xy, ROBOT_N)
            out.append("%s %d +%d%s" % (xy, st["n"], ROBOT_N, "" if r.get("ok") else " %s" % r))
    return "로봇: " + " · ".join(out)


@stage("feedloop")
def st_feedloop(ai, go):
    """5분마다: 로봇 소량 (상자당 ≤50, 탄 요청 우선) + 부족하면 사람 운반 주문 1건. 240분."""
    t_end = time.time() + 240 * 60
    say("철 배분 루프 v2 시작 (5분, 로봇 상자당 %d · 손 %d 이하면 +%d)" % (ROBOT_N, HAUL_BELOW, HAUL_N))
    while time.time() < t_end:
        try:
            say("철 배분: %s | %s" % (robot_once(ai, go), haul_once(ai, go)))
        except Exception as e:  # noqa: BLE001
            say("철 배분 오류 %s" % e)
        time.sleep(5 * 60)


@stage("feed2")
def st_feed2(ai, go):
    say("철 배분 1회: %s | %s" % (robot_once(ai, go), haul_once(ai, go)))


# ---------------------------------------------------------------- 3. 구리
# (-53.5,-80.5) 순수 구리 ~3만. 서쪽은 채굴기 (-56.5,-80.5), 동쪽은 석탄 벨트 x=-51.5 → 남향 출력 (-53.5,-78.5) →
# x=-53.5 남행 → y=-75.5 서행 → 구리 광석 줄 x=-58.5 (남행, 구리 강철 화로 x=-61 열) 에 옆치기.
# 길목의 고갈 채굴기 (-56.5,-74.5) (no_minable_resources) 는 로봇 해체. 전력은 전봇대 (-54.5,-77.5).
# (-57.5,-92.5) 구리·돌 섞임은 로봇망 밖 + 출력 자리가 석탄/벽돌 줄뿐이라 돌이 구리 화로에 섞일 위험 → 보류.
CU_DRILL = ("electric-mining-drill", -53.5, -80.5, 8)
CU_BELTS = [("transport-belt", -53.5, y, 8) for y in (-78.5, -77.5, -76.5)] + \
           [("transport-belt", x, -75.5, 12) for x in (-53.5, -54.5, -55.5, -56.5, -57.5)]
CU_OLD = (-56.5, -74.5)


@stage("cu")
def st_cu(ai, go):
    r = ai.lua("""(function() local s = game.surfaces[1]
      local d = s.find_entities_filtered{type = 'mining-drill', position = {%s, %s}, radius = 0.1}[1]
      if not d then return {old = 'gone'} end
      local left = 0 for _, e in pairs(s.find_entities_filtered{type = 'resource', area = {{d.position.x - 2.5, d.position.y - 2.5}, {d.position.x + 2.5, d.position.y + 2.5}}}) do left = left + e.amount end
      if left > 0 then return {old = 'ore left ' .. left} end
      if %s then d.order_deconstruction('player') end
      return {old = 'decon', marked = d.to_be_deconstructed()} end)()""" % (CU_OLD[0], CU_OLD[1], "true" if go else "false"))
    say("구리: 고갈 채굴기 %s %s" % (CU_OLD, r))
    if not go:
        say("  (시험) %s" % R.can_place(ai, [CU_DRILL] + CU_BELTS))
        return
    t0 = time.time()
    while time.time() - t0 < 300 and r.get("old") != "gone":
        time.sleep(5)
        r = ai.lua("{n = game.surfaces[1].count_entities_filtered{type = 'mining-drill', position = {%s, %s}, radius = 0.1}}" % CU_OLD)
        if r["n"] == 0:
            r = {"old": "gone"}
    say("  유령: %s" % R.ghosts(ai, [CU_DRILL] + CU_BELTS))


if __name__ == "__main__":
    raise SystemExit(main())

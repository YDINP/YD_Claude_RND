"""로켓 P3 - 발전 뱅크 3 (보일러 10 · 증기기관 20, +18 MW, 36 -> 54 MW). docs/rocket-plan-run23.md P3 · docs/power-relocation-plan.md §11.

자리 (실측 09-28 21:3x): 뱅크 1·2 서쪽 연장 (l = -53 - 3i) 은 F1 석탄 줄 (x=-52.5) · 돌 끝 상자 (x -67..-63) · 연구소 블록 (x -84..-69) 에 막혀 10 칸이 안 들어간다.
벽 안 서쪽 빈 땅 (x -113..-86, y 10..47, 나무 몇 그루뿐) 에 «두 줄 5 칸, 석탄 벨트 하나를 가운데 두고 마주 보는» 뱅크를 놓는다.

    y 18.5        P . . . . . P . . . . . P            P = 중형 전봇대
    y 19..29      E (먼 · 가까운) 5 칸 (세로, 북향)
    y 29..31      B 보일러 A 5 (북향, 물 y 30.5)
    y 31.5        i P i . i P i . i P ...             팔 (남에서 집어 북 보일러) · 전봇대
    y 32.5        <<<<<<<<<<<<<<<<<<<<<<<<<<<<< 석탄 (동 -> 서)
    y 33.5        i P i . i P i . i P ...             팔 (북에서 집어 남 보일러)
    y 34..36      B 보일러 B 5 (남향, 물 y 34.5)
    y 36..46      E (가까운 · 먼) 5 칸
    y 46.5        P . . . . . P . . . . . P
          x -103                              -88 | x -87.5 물 기둥 · x -85.5 석탄 기둥
칸 i = 0..4, 왼쪽 x l = -103 + 3i. 두 줄 보일러 물은 동쪽 끝 (-87.5, 30.5 / 34.5) 에서 지하관 한 쌍으로 이음.

물: 뱅크 2 칸 0 보일러 서쪽 구멍 (-50.5,47.5) 에서 같은 seg 74 를 연장 (2.0 은 seg 안 유량 제한 없음 - wiki «Fluid system»; 양수기 2 = 2,400/s ≥ 보일러 30 × 60 = 1,800/s).
   관 (-50.5,47.5)(-50.5,48.5) -> 지하관 y=48.5 (-51.5→-60.5)(-61.5→-70.5)(-71.5→-80.5)(-81.5→-86.5) (돌 끝 상자 · 석탄 기둥 밑) -> 관 x=-87.5 (48.5..34.5) -> 지하관 (33.5→31.5, 석탄 줄 밑) -> 관 (-87.5,30.5).
석탄: F1 줄 (x=-52.5 북향, 벽 안) 칸 (-52.5,51.5) 을 북향 분배기 (-53,51.5) 로 바꿈 -> 오른쪽 출력 = 기존 뱅크 2 · 1, 왼쪽 출력 (-53.5,50.5) 북 -> y=49.5 서향
   (돌 벨트 x=-64.5 는 지하 벨트 (-63.5→-65.5)) -> (-85.5,49.5) 북 -> x=-85.5 북향 -> (-85.5,32.5) 서 -> y=32.5 서향 (x -86.5..-102.5).
   분배기는 우선 없음 - 뱅크 3 줄이 차면 전부 뱅크 2·1 로 (F1 채굴기 16 중 8 이 지금 «출력 막힘» = 여유 ~4/s).

정전 0 순서: 보일러 · 엔진 · 팔 · 관 · 벨트를 전봇대 없이 먼저 -> 물 차면 분배기 교체 -> 벨트 끝까지 석탄 + 보일러 연료 (boilerguard23 도 모든 보일러를 봄)
   -> 그때 전봇대 14 (윗줄 (-90.5,18.5) 이 주 전력망 작은 전봇대 (-85.5,22.5) 에 자동 연결).

하위 명령
  boot   : 전봇대 조립기 (-21.5,-76.5, polefeed) 를 잠깐 빌려 조립기1 3 대 -> 되돌림 (small-electric-pole) · 조립기1 유령 3 (premake23 방식)
  make   : 내 조립기 3 대에 망 재고만 옮겨 보일러 10 · 증기기관 20 · 중형 전봇대 15 · 지하관 10 · 지하 벨트 2 (망 합계 목표) -> 조립기 해체
  build  : A 나무 해체 + 뱅크 · 물 · 벨트 유령 (전봇대 X) / B 물 차면 분배기 교체 / C 석탄 오면 전봇대 / V 확인
  status : 한 줄

    python -u scripts/bank3_23.py boot
    nohup python -u scripts/bank3_23.py make  >> state/bank3_23.log 2>&1 &
    nohup python -u scripts/bank3_23.py build >> state/bank3_23.log 2>&1 &
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import power2_23 as p2  # noqa: E402
import power3_23 as p3  # noqa: E402

STATE = os.path.join(HERE, "..", "state", "bank3_23.json")
TARGET = [("boiler", 10), ("steam-engine", 20), ("medium-electric-pole", 15), ("pipe-to-ground", 10), ("underground-belt", 2)]
INTER = ["iron-gear-wheel", "pipe", "iron-stick", "copper-cable"]
IRON_FLOOR = 1200            # 망 철판 2,008 (21:26) - 뱅크 3 몫 ~750

L = p2.to_lua
T = p2.T
BORROW = (-21.5, -76.5)
ANCHOR = (-21.5, -76.5)

SLOTS = [-103 + 3 * i for i in range(5)]
BANK = []
for l in SLOTS:
    c = l + 1.5
    BANK += [["boiler", c, 30.0, 0], ["steam-engine", c, 26.5, 0], ["steam-engine", c, 21.5, 0], ["inserter", c, 31.5, 8],
             ["boiler", c, 35.0, 8], ["steam-engine", c, 38.5, 0], ["steam-engine", c, 43.5, 0], ["inserter", c, 33.5, 0]]
WATER = [["pipe", -50.5, 47.5, 0, ""], ["pipe", -50.5, 48.5, 0, ""],
         ["pipe-to-ground", -51.5, 48.5, 4, ""], ["pipe-to-ground", -60.5, 48.5, 12, ""],
         ["pipe-to-ground", -61.5, 48.5, 4, ""], ["pipe-to-ground", -70.5, 48.5, 12, ""],
         ["pipe-to-ground", -71.5, 48.5, 4, ""], ["pipe-to-ground", -80.5, 48.5, 12, ""],
         ["pipe-to-ground", -81.5, 48.5, 4, ""], ["pipe-to-ground", -86.5, 48.5, 12, ""]] \
    + [["pipe", -87.5, y + 0.5, 0, ""] for y in range(34, 49)] \
    + [["pipe-to-ground", -87.5, 33.5, 8, ""], ["pipe-to-ground", -87.5, 31.5, 0, ""], ["pipe", -87.5, 30.5, 0, ""]]
BELT = [["transport-belt", -53.5, 50.5, 0, ""], ["transport-belt", -53.5, 49.5, 12, ""]] \
    + [["transport-belt", x + 0.5, 49.5, 12, ""] for x in range(-63, -54)] \
    + [["underground-belt", -63.5, 49.5, 12, "input"], ["underground-belt", -65.5, 49.5, 12, "output"]] \
    + [["transport-belt", x + 0.5, 49.5, 12, ""] for x in range(-85, -66)] \
    + [["transport-belt", -85.5, 49.5, 0, ""]] \
    + [["transport-belt", -85.5, y + 0.5, 0, ""] for y in range(33, 49)] \
    + [["transport-belt", x + 0.5, 32.5, 12, ""] for x in range(-103, -85)]
POLE_X = (-102.5, -96.5, -90.5)
POLES = [["medium-electric-pole", x, y, 0, ""] for x in POLE_X for y in (18.5, 31.5, 33.5, 46.5)] \
    + [["medium-electric-pole", -104.5, 25.5, 0, ""], ["medium-electric-pole", -104.5, 40.5, 0, ""]]
CLEAR_AREAS = [[[-106, 17], [-84, 50]], [[-87, 47], [-50, 52]]]
B3 = [[-104, 17], [-86, 48]]          # 뱅크 3 영역
SPLIT_AT = (-53.0, 51.5)


def log(msg):
    print(time.strftime("%H:%M:%S ") + msg, flush=True)


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"phase": "A"}


def save(d):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def lua(ai, src, **kw):
    return p2.lua(ai, src, **kw)


def cnt(ai, name):
    return lua(ai, "(function() " + p2.HEAD + " return {v = net.get_item_count('%s')} end)()" % name)["v"]


# ---------------------------------------------------------------- boot (premake23 와 같음)
def boot(ai):
    st = load()
    if st.get("asms"):
        log("boot: 이미 조립기 %s" % st["asms"])
        return
    bx, by = BORROW
    need_am = 3 - cnt(ai, "assembling-machine-1")
    if need_am > 0:
        gear_need = max(0, 5 * need_am - cnt(ai, "iron-gear-wheel"))
        if gear_need > 0:
            s1 = lua(ai, p2.BORROW_SET, bx=str(bx), by=str(by), recipe="'iron-gear-wheel'", feed=L([["iron-plate", 2 * gear_need]]))
            log("빌림 톱니: %s" % s1)
            if s1.get("err"):
                return
            for _ in range(40):
                time.sleep(2)
                lua(ai, p2.BORROW_TAKE, bx=str(bx), by=str(by))
                if cnt(ai, "iron-gear-wheel") >= 5 * need_am:
                    break
        feed = [["electronic-circuit", 3 * need_am], ["iron-gear-wheel", 5 * need_am], ["iron-plate", 9 * need_am]]
        s2 = lua(ai, p2.BORROW_SET, bx=str(bx), by=str(by), recipe="'assembling-machine-1'", feed=L(feed))
        log("빌림 조립기1: %s" % s2)
        if s2.get("err"):
            return
        am = 0
        for _ in range(40):
            time.sleep(2)
            lua(ai, p2.BORROW_TAKE, bx=str(bx), by=str(by))
            am = cnt(ai, "assembling-machine-1")
            if am >= 3:
                break
        s3 = lua(ai, p2.BORROW_SET, bx=str(bx), by=str(by), recipe="'small-electric-pole'", feed="{}")
        log("되돌림 small-electric-pole: %s · 망 조립기1 %s" % (s3, am))
    g = lua(ai, p2.ASM_GHOSTS, ax=str(ANCHOR[0]), ay=str(ANCHOR[1]), n="3")
    st["asms"] = [T(p) for p in (T(g.get("spots")) or [])]
    save(st)
    log("내 조립기 유령 %s" % st["asms"])


POLES_BUILT = """(function() local s = game.surfaces[1] local n = 0
for _, e in pairs($list) do if s.find_entities_filtered{name = e[1], position = {e[2], e[3]}, radius = 0.3}[1] then n = n + 1 end end
return {n = n} end)()"""


def make(ai, every=6, poles_only=False):
    """목표는 «망 재고» 합계라 로봇이 유령 짓느라 가져가면 또 만든다 (21:52 실측: 엔진 13 더 만들기 시작 -> 정지).
    그래서 make 는 build A 전에 끝내고, 전봇대는 poles 모드로 «뱅크 3 에 선 수 + 망 재고 ≥ 15» 만 채운다."""
    st = load()
    if not st.get("asms"):
        log("make: 조립기 없음 - boot 먼저")
        return
    target = [("medium-electric-pole", len(POLES) + 1)] if poles_only else TARGET
    order = L([k for k, _ in target] + INTER)
    last = ""
    for _ in range(900):
        try:
            tgt = list(target)
            if poles_only:
                built = lua(ai, POLES_BUILT, list=L(POLES)).get("n", 0)
                tgt = [("medium-electric-pole", max(0, len(POLES) + 1 - built))]
            tg = "{" + ", ".join("['%s'] = %d" % kv for kv in tgt) + "}"
            r = lua(ai, p3.MAKE, asms=L(st["asms"]), tg=tg, order=order, floor=str(IRON_FLOOR))
        except Exception as e:  # noqa: BLE001
            log("make 오류 %s" % str(e)[:200])
            time.sleep(every)
            continue
        msg = "make %s 대 %s | 남음 %s" % (r.get("nasm"), T(r.get("a")), r.get("R"))
        if msg != last:
            log(msg)
            last = msg
        if r.get("done"):
            n = lua(ai, p3.ASM_DECON, asms=L(st["asms"])).get("n")
            log("make 끝 - 조립기 %s 대 해체 표시 (망으로)" % n)
            st = load()
            st["made"] = True
            save(st)
            return
        time.sleep(every)
    log("make 시간 초과")


# ---------------------------------------------------------------- build
CLEAR = """(function() local s = game.surfaces[1] local o = {marked = 0, left = 0}
for _, a in pairs($areas) do
  for _, e in pairs(s.find_entities_filtered{area = a, type = {'tree', 'simple-entity'}}) do
    if e.to_be_deconstructed() then o.left = o.left + 1
    elseif e.order_deconstruction('player') then o.marked = o.marked + 1 o.left = o.left + 1 end
  end
end return o end)()"""

SPLIT = """(function() """ + p2.HEAD + """
local o = {}
local sp = s.find_entities_filtered{name = 'splitter', position = {$sx, $sy}, radius = 0.3}[1]
if sp then o.state = 'already' return o end
local b = s.find_entities_filtered{type = 'transport-belt', position = {-52.5, 51.5}, radius = 0.3}[1]
if not b or b.direction ~= defines.direction.north then o.state = 'nobelt' return o end
if s.count_entities_filtered{area = {{-54, 51}, {-53, 52}}} > 0 then o.state = 'occupied' return o end
if net.get_item_count('splitter') < 1 then o.state = 'noitems' return o end
local items = {}
for i = 1, b.get_max_transport_line_index() do for _, c in pairs(b.get_transport_line(i).get_contents()) do items[c.name] = (items[c.name] or 0) + c.count end end
take('splitter', 1)
b.destroy() store('transport-belt', 1)
for n, c in pairs(items) do store(n, c) end
sp = s.create_entity{name = 'splitter', position = {$sx, $sy}, direction = defines.direction.north, force = 'player'}
o.state = sp and 'swapped' or 'create-failed' o.items = items
return o end)()"""

B3STAT = """(function() local s = game.surfaces[1] local o = {eng = 0, on = 0, b = {}}
local m = s.find_entities_filtered{type = 'electric-pole', position = {2, 33}, radius = 6}[1]
local main = m.electric_network_id
for _, e in pairs(s.find_entities_filtered{name = 'steam-engine', area = $a}) do o.eng = o.eng + 1 if e.electric_network_id == main then o.on = o.on + 1 end end
local minw, minc = 999, 999
for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = $a}) do
  local w = b.fluidbox[1] local f = b.get_inventory(defines.inventory.fuel).get_item_count('coal')
  w = w and w.amount or 0 if w < minw then minw = w end if f < minc then minc = f end
  o.b[#o.b + 1] = f .. '/' .. math.floor(w) .. '/' .. (b.burner.currently_burning and 1 or 0)
end
o.nb = #o.b o.minw = math.floor(minw) o.minc = minc
local n = 0 for _, e in pairs(s.find_entities_filtered{type = 'transport-belt', area = {{-103, 32}, {-86, 33}}}) do
  for i = 1, 2 do n = n + e.get_transport_line(i).get_item_count('coal') end end
o.rowcoal = n
local west = s.find_entities_filtered{type = 'transport-belt', position = {-101.5, 32.5}, radius = 0.3}[1]
o.westcoal = 0 if west then for i = 1, 2 do o.westcoal = o.westcoal + west.get_transport_line(i).get_item_count('coal') end end
local cap = 0 for _, e in pairs(s.find_entities_filtered{name = 'steam-engine'}) do if e.electric_network_id == main then cap = cap + 0.9 end end
o.cap = math.floor(cap * 10 + 0.5) / 10
local es = m.electric_network_statistics local P = defines.flow_precision_index
o.mw1 = math.floor(es.get_flow_count{name = 'steam-engine', category = 'output', precision_index = P.one_minute, count = false} * 600 / 1e6) / 10
return o end)()"""


def b3(ai):
    r = lua(ai, B3STAT, a=L(B3))
    r["b"] = T(r.get("b")) or []
    return r


def bstr(r):
    return "뱅크3 보일러 %s (물 최소 %s · 석탄 최소 %s) · 엔진 %s/%s 주망 · 줄 석탄 %s (서끝 %s) · 최대 %.1f MW · 1분 %.1f MW" % (
        r["nb"], r["minw"], r["minc"], r["on"], r["eng"], r["rowcoal"], r["westcoal"], r["cap"], r["mw1"])


def ghosts(ai, lst):
    return lua(ai, p2.GHOSTS, list=L(lst), place="true")


def build(ai, every=15):
    st = load()
    last = ""
    while True:
        st["made"] = st.get("made") or load().get("made")
        ph = st.get("phase", "A")
        msg = ""
        if ph == "A":
            c = lua(ai, CLEAR, areas=L(CLEAR_AREAS))
            if not st.get("made"):
                msg = "A 나무 남음 %s · 자재 대기 (make)" % c["left"]
            else:
                g = ghosts(ai, BANK + WATER + BELT)
                r = b3(ai)
                msg = "A 나무 %s · 뱅크/물/벨트 %s/%s 유령 %s 막힘 %s · %s" % (c["left"], g["built"], g["total"], g["ghost"], T(g.get("blocked")), bstr(r))
                if g["built"] == g["total"] and r["nb"] == 10 and r["minw"] >= 100:
                    st["phase"] = "B"
                    log("A 끝 - 뱅크 3 다 섬, 보일러 물 %s" % r["minw"])
        elif ph == "B":
            r = lua(ai, SPLIT, sx=str(SPLIT_AT[0]), sy=str(SPLIT_AT[1]))
            msg = "B 분배기 %s" % r
            if r.get("state") in ("swapped", "already"):
                st["phase"] = "C"
                log("B 분배기 교체 %s" % r)
        elif ph == "C":
            r = b3(ai)
            msg = "C 석탄 대기 · " + bstr(r)
            if r["westcoal"] > 0 and r["minc"] >= 1 and r["minw"] >= 100:
                g = ghosts(ai, POLES)
                msg = "C 전봇대 %s/%s 막힘 %s · %s" % (g["built"], g["total"], T(g.get("blocked")), bstr(r))
                if g["built"] == g["total"] and r["on"] == 20:
                    st["phase"] = "V"
                    log("C 끝 - 주 전력망 연결 · " + bstr(r))
        elif ph == "V":
            r = b3(ai)
            log("V " + bstr(r) + " · 보일러 " + " ".join(r["b"]))
            save(st)
            return
        save(st)
        if msg and msg != last:
            log(msg)
            last = msg
        time.sleep(every)


def status(ai):
    r = b3(ai)
    log("status 단계 %s · %s · %s" % (load().get("phase"), bstr(r), " ".join(r["b"])))


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    ai = AIBridge()
    if cmd == "make" and len(sys.argv) > 2 and sys.argv[2] == "poles":
        make(ai, poles_only=True)
        return
    {"boot": boot, "make": make, "build": build}.get(cmd, status)(ai)


if __name__ == "__main__":
    main()

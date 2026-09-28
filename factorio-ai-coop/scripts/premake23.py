"""P2 구리 ×2 출정 자재를 기지에서 미리 만든다 (docs/rocket-plan-run23.md «P2 구리 조사» 재개 조건 2).

목표 망 재고: 강철로 18 · 전기 채굴기 18 · 빨간 벨트 60 · 빨간 지하 벨트 4 (2 쌍) · 빨간 분배기 1.
  실측 (tick 21.39M): 판 벨트 x=47.5 는 첫 화로 팔 (46.5,-360.5) 부터 노란 분배기 (47,-327.5) 까지 33 칸 + 우회 (48.5~49.5, -345.5~-344.5) 4 칸
  = 37 칸, 지하 벨트 0. 분배기 아래는 두 줄 (44.5 · 47.5) 이라 20/s 도 노랑으로 충분 -> 빨강 37 + 분배기 1 (노란 분배기는 15/s 상한).
  남는 빨강 23 · 지하 2 쌍은 광석 벨트 (47.5, -395.5..-362.5 34 칸) 또는 둘째 기둥 몫.

하위 명령 (power2_23.py 의 boot/make 패턴 - Lua 문자열 재사용)
  boot : 전봇대 조립기 (-21.5,-76.5, polefeed) 를 잠깐 빌려 톱니 -> 조립기1 3 대, 되돌림 (small-electric-pole).
         조립기1 유령 3 을 전기 · 망 2 가 닿는 빈 자리에 (로봇이 지음).
  make : 내 조립기 3 대에 Lua 로 망 재고만 옮겨 넣어 만든다. 바닥: 철 2500 · 강철 1500 · 벽돌 250 (회색팩 벽 몫) · 녹색회로 40.
         다 차면 조립기 해체 표시 (망으로).

    python -u scripts/premake23.py boot
    nohup python -u scripts/premake23.py make >> state/premake23.log 2>&1 &
"""
import json
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge"), os.path.dirname(os.path.abspath(__file__))]
from client import AIBridge  # noqa: E402
from power2_23 import (HEAD, BORROW_SET, BORROW_TAKE, ASM_GHOSTS, ASM_DECON,  # noqa: E402
                       lua, to_lua, T)

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "..", "state", "premake23.json")

BORROW = (-21.5, -76.5)
ANCHOR = (-21.5, -76.5)
TARGET = {"steel-furnace": 18, "electric-mining-drill": 18, "fast-transport-belt": 60,
          "fast-underground-belt": 4, "fast-splitter": 1}
FLOOR = {"iron-plate": 2500, "steel-plate": 1500, "stone-brick": 250, "electronic-circuit": 40}


def log(msg):
    print(time.strftime("%H:%M:%S ") + msg, flush=True)


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"asms": []}


def save(d):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def cnt(ai, name):
    return lua(ai, "(function() " + HEAD + " return {v = net.get_item_count('%s')} end)()" % name)["v"]


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
            s1 = lua(ai, BORROW_SET, bx=str(bx), by=str(by), recipe="'iron-gear-wheel'", feed=to_lua([["iron-plate", 2 * gear_need]]))
            log("빌림 톱니: %s" % s1)
            if s1.get("err"):
                return
            for _ in range(40):
                time.sleep(2)
                lua(ai, BORROW_TAKE, bx=str(bx), by=str(by))
                if cnt(ai, "iron-gear-wheel") >= 5 * need_am:
                    break
        feed = [["electronic-circuit", 3 * need_am], ["iron-gear-wheel", 5 * need_am], ["iron-plate", 9 * need_am]]
        s2 = lua(ai, BORROW_SET, bx=str(bx), by=str(by), recipe="'assembling-machine-1'", feed=to_lua(feed))
        log("빌림 조립기1: %s" % s2)
        if s2.get("err"):
            return
        am = 0
        for _ in range(40):
            time.sleep(2)
            lua(ai, BORROW_TAKE, bx=str(bx), by=str(by))
            am = cnt(ai, "assembling-machine-1")
            if am >= 3:
                break
        s3 = lua(ai, BORROW_SET, bx=str(bx), by=str(by), recipe="'small-electric-pole'", feed="{}")
        log("되돌림 small-electric-pole: %s · 망 조립기1 %s" % (s3, am))
    g = lua(ai, ASM_GHOSTS, ax=str(ANCHOR[0]), ay=str(ANCHOR[1]), n="3")
    st["asms"] = [T(p) for p in (T(g.get("spots")) or [])]
    save(st)
    log("내 조립기 유령 %s" % st["asms"])


MAKE = """(function() """ + HEAD + """
local asms = $asms local TG = $tg local FL = $floor
local o = {a = {}}
local list = {}
for _, p in pairs(asms) do
  local a = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1]
  if a then
    local out = a.get_output_inventory()
    for _, it in pairs(out.get_contents()) do local k = store(it.name, it.count) if k > 0 then out.remove{name = it.name, count = k} end end
    list[#list + 1] = a
  end
end
local N = setmetatable({}, {__index = function(t, k) local v = net.get_item_count(k) rawset(t, k, v) return v end})
local R = {} for k, v in pairs(TG) do R[k] = math.max(0, v - N[k]) end
local need = {
  ['splitter'] = R['fast-splitter'] - N['splitter'],
  ['underground-belt'] = R['fast-underground-belt'] - N['underground-belt'],
  ['iron-gear-wheel'] = 5 * R['fast-transport-belt'] + 20 * R['fast-underground-belt'] + 5 * R['electric-mining-drill']
                        + 10 * R['fast-splitter'] - N['iron-gear-wheel']}
o.R = R
local order = {'splitter', 'underground-belt', 'fast-splitter', 'fast-underground-belt', 'electric-mining-drill', 'steel-furnace',
               'fast-transport-belt', 'iron-gear-wheel'}
local function deficit(n) if TG[n] then return R[n] end return need[n] or 0 end
local function can(r)
  for _, ing in pairs(r.ingredients) do if N[ing.name] - (FL[ing.name] or 0) < ing.amount then return false end end
  return true
end
local busy = {}
local done = true
for _, n in pairs(order) do if TG[n] and deficit(n) > 0 then done = false end end
o.done = done
for _, a in pairs(list) do
  local cur = a.get_recipe() and a.get_recipe().name
  local keep = cur and deficit(cur) > 0 and not (TG[cur] and busy[cur]) and can(game.forces.player.recipes[cur])
  if cur and a.is_crafting() and deficit(cur) > 0 then keep = true end
  local pick = keep and cur or nil
  if not pick then
    for _, n in pairs(order) do
      if not pick and deficit(n) > 0 and not (TG[n] and busy[n]) and can(game.forces.player.recipes[n]) then pick = n end
    end
  end
  if pick ~= cur then
    local back = a.set_recipe(pick)
    for _, it in pairs(back or {}) do if it.count and it.count > 0 then store(it.name, it.count) end end
  end
  if pick then
    busy[pick] = true
    local r = game.forces.player.recipes[pick]
    local crafts = math.max(1, math.min(5, math.ceil(deficit(pick) / r.products[1].amount)))
    local inv = a.get_inventory(defines.inventory.assembling_machine_input)
    for _, ing in pairs(r.ingredients) do
      local want = math.min(ing.amount * crafts - inv.get_item_count(ing.name), N[ing.name] - (FL[ing.name] or 0))
      if want > 0 then
        local got = take(ing.name, want)
        if got > 0 then local p = inv.insert{name = ing.name, count = got} if p < got then store(ing.name, got - p) end N[ing.name] = N[ing.name] - got end
      end
    end
  end
  o.a[#o.a + 1] = (pick or '-') .. ' ' .. a.status
end
o.N = {sf = N['steel-furnace'], drill = N['electric-mining-drill'], fb = N['fast-transport-belt'], fug = N['fast-underground-belt'],
       fsp = N['fast-splitter'], gear = N['iron-gear-wheel'], iron = N['iron-plate'], brick = N['stone-brick'], ec = N['electronic-circuit']}
o.nasm = #list
return o end)()"""


def lmap(d):
    return "{" + ", ".join("['%s'] = %d" % (k, v) for k, v in d.items()) + "}"


def make(ai, every=6):
    st = load()
    asms = st.get("asms") or []
    if not asms:
        log("make: 조립기 없음 - boot 먼저")
        return
    last = ""
    while True:
        try:
            r = lua(ai, MAKE, asms=to_lua(asms), tg=lmap(TARGET), floor=lmap(FLOOR))
        except Exception as e:  # noqa: BLE001
            log("make 오류 %s" % str(e)[:200])
            time.sleep(every)
            continue
        msg = "make %s | %s" % (T(r.get("a")), r.get("N"))
        if msg != last:
            log(msg)
            last = msg
        if r.get("done"):
            n = lua(ai, ASM_DECON, asms=to_lua(asms)).get("n")
            log("make 끝 %s - 내 조립기 %s 대 해체 표시" % (r.get("N"), n))
            st["made"] = True
            save(st)
            return
        time.sleep(every)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "make"
    ai = AIBridge()
    if cmd == "boot":
        boot(ai)
    elif cmd == "make":
        make(ai)


if __name__ == "__main__":
    main()

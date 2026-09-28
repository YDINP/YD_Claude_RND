"""기지 벽돌 되살리기 (13:xx, 회색팩 0 -> 연구 정지) - 돌 채굴 10분 0 의 원인은 고갈이 아니라 «막힘».

실측 (tick ~19.9M): 기지 벽 안 돌 광맥 (x -63..-47 · y -107..-91) 남은 약 13만. 돌 채굴기 3 (-61.5,-102.5 잔량 563 ·
-56.5,-96.5 3.3만 · -53.5,-96.5 2.6만) 전부 waiting_for_space. 벽돌 화로 (y=-97) 4 중 -63 · -60 은 full_output (벽돌 100 씩),
-51 · -48 은 돌이 안 옴 (돌 벨트 y=-100.5 는 x -53.5 부터 서쪽으로만 흐른다).
막힘 사슬: stone23 설계대로 벽돌 출력 팔 (y=-95.5) 이 벽돌을 «석탄 벨트» y=-94.5 에 낸다 -> x=-64.5 -> y=-43.5 -> x=-49.5 남향
    -> 벽 조립기 (-46.5,-30.5) 를 지난 벽돌이 수류탄 조립기 앞 L1 (-30.5..-21.5) 에 쌓여 막다른 끝 -> 석탄 줄 전체 정지
    -> 벽 조립기 팔 (-49.5,-31.5) 앞은 석탄뿐 (벽돌 0) -> 화로 출력 막힘 -> 긴팔 멈춤 -> 돌 벨트 정지 -> 채굴기 정지.
    (돌 벨트 끝 x=-68.5 -> y=-86.5 -> (-92.5,-86.5) 도 막다른 끝이라 화로 말고는 돌이 빠질 곳이 없다.)
고침 (사용자: 벨트 섞지 말 것, Lua 중계로 망 저장 · 품목 상한):
    setup  벽돌 출력 팔 (y=-95.5, 화로 -> 석탄 벨트) 을 active=false (필터 · 엔티티 그대로, 되돌리기 = active=true)
           석탄 줄에 끼인 벽돌 (x=-49.5 · y=-43.5 · x=-64.5 · y=-94.5) 을 망 저장으로 옮김 -> 수류탄 석탄 다시 흐름.
    run    30 초마다 벽돌 화로 출력칸 벽돌 -> 망 2 저장 (망 벽돌 < CAP 2000 일 때만). 벽 조립기는 battfeed23 RELAYS
           (stone-brick 출처 비면 망 2 에서, 100 남김) 가 받는다.
    check  채굴기 · 화로 · 망 벽돌 · 10분 돌/벽돌 흐름.

    python -u scripts/brickrelay23.py check|setup|run
로그 state/brickrelay23.log
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "brickrelay23.log")
CAP = 2000
FURN = [(-63, -97), (-60, -97), (-51, -97), (-48, -97)]
OUT_INS = [(-63.5, -95.5), (-60.5, -95.5), (-51.5, -95.5), (-48.5, -95.5)]   # 화로 -> 석탄 벨트 (y=-94.5)
# 석탄 줄 (벽돌이 섞여 흘렀던 길): 머리 y=-94.5 서향 -> x=-64.5 남향 -> y=-43.5 동향 -> x=-49.5 남향 (끝 -21.5)
COAL_LINE = [((-65, -95), (-43, -94)), ((-65, -95), (-64, -43)), ((-65, -44), (-49, -43)), ((-50, -44), (-49, -20))]


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def pts(ps):
    return ", ".join("{%s, %s}" % p for p in ps)


NET = """local net = nil
  for _, n in pairs(game.forces.player.logistic_networks[s.name]) do if n.network_id == 2 then net = n end end"""

CHECK = """(function() local s = game.surfaces[1] local o = {drills = {}, furn = {}, ins = {}}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  %s
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-66, -106}, {-46, -94}}}) do
    local m = d.mining_target if m and m.name == 'stone' then
      o.drills[#o.drills + 1] = d.position.x .. ',' .. d.position.y .. ' ' .. (st[d.status] or '?') .. ' ' .. m.amount end end
  for _, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.6}[1]
    if f then o.furn[#o.furn + 1] = p[1] .. ' ' .. (st[f.status] or '?') .. ' src=' .. f.get_inventory(defines.inventory.furnace_source).get_item_count()
      .. ' out=' .. f.get_output_inventory().get_item_count() .. ' fuel=' .. f.get_inventory(defines.inventory.fuel).get_item_count() end end
  for _, p in pairs({%s}) do local i = s.find_entities_filtered{type = 'inserter', position = p, radius = 0.3}[1]
    if i then o.ins[#o.ins + 1] = p[1] .. (i.active and ' on' or ' off') end end
  local line = 0
  for _, a in pairs({%s}) do for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = a}) do
    for li = 1, 2 do line = line + b.get_transport_line(li).get_item_count('stone-brick') end end end
  o.brick_on_coal = line
  o.net = {brick = net.get_item_count('stone-brick'), stone = net.get_item_count('stone'), wall = net.get_item_count('stone-wall')}
  local a = s.find_entities_filtered{type = 'assembling-machine', position = {-46.5, -30.5}, radius = 0.5}[1]
  o.wall_asm = a and (st[a.status] or '?') .. ' brick=' .. a.get_inventory(defines.inventory.assembling_machine_input).get_item_count('stone-brick') or '-'
  local p1 = defines.flow_precision_index.ten_minutes local ps = game.forces.player.get_item_production_statistics(s)
  for _, n in pairs({'stone', 'stone-brick', 'stone-wall', 'military-science-pack'}) do
    o[n] = {math.floor(ps.get_flow_count{name = n, category = 'input', precision_index = p1, count = true}),
            math.floor(ps.get_flow_count{name = n, category = 'output', precision_index = p1, count = true})} end
  return o end)()"""


def check(ai):
    lines = pts(OUT_INS)
    areas = ", ".join("{{%s, %s}, {%s, %s}}" % (a[0], a[1], b[0], b[1]) for a, b in COAL_LINE)
    return ai.lua(CHECK % (NET, pts(FURN), lines, areas))


SETUP = """(function() local s = game.surfaces[1] local o = {off = 0, moved = 0}
  %s
  for _, p in pairs({%s}) do local i = s.find_entities_filtered{type = 'inserter', position = p, radius = 0.3}[1]
    if i and i.active then i.active = false o.off = o.off + 1 end end
  local room = %d - net.get_item_count('stone-brick')
  for _, a in pairs({%s}) do for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt'}, area = a}) do
    for li = 1, 2 do local L = b.get_transport_line(li) local k = math.min(room, L.get_item_count('stone-brick'))
      if k > 0 then local put = net.insert({name = 'stone-brick', count = k}, 'storage')
        if put > 0 then L.remove_item{name = 'stone-brick', count = put} o.moved = o.moved + put room = room - put end end end end end
  return o end)()"""


def setup(ai):
    areas = ", ".join("{{%s, %s}, {%s, %s}}" % (a[0], a[1], b[0], b[1]) for a, b in COAL_LINE)
    r = ai.lua(SETUP % (NET, pts(OUT_INS), CAP, areas))
    log("setup: 출력 팔 끔 %s · 석탄 줄 벽돌 -> 망 %s" % (r.get("off"), r.get("moved")))
    return r


RELAY = """(function() local s = game.surfaces[1] local o = {moved = 0}
  %s
  local room = %d - net.get_item_count('stone-brick')
  for _, p in pairs({%s}) do local f = s.find_entities_filtered{type = 'furnace', position = p, radius = 0.6}[1]
    if f and room > 0 then local out = f.get_output_inventory() local k = math.min(room, out.get_item_count('stone-brick'))
      if k > 0 then local put = net.insert({name = 'stone-brick', count = k}, 'storage')
        if put > 0 then out.remove{name = 'stone-brick', count = put} o.moved = o.moved + put room = room - put end end end end
  o.net = net.get_item_count('stone-brick') return o end)()"""


def relay(ai):
    return ai.lua(RELAY % (NET, CAP, pts(FURN)))


def main() -> int:
    ai = AIBridge()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        log("검사 %s" % check(ai))
    elif cmd == "setup":
        setup(ai)
        log("검사 %s" % check(ai))
    elif cmd == "run":
        log("brickrelay23 상주 시작 (상한 %d)" % CAP)
        n = 0
        tot = 0
        while True:
            try:
                r = relay(ai)
                tot += int(r.get("moved", 0))
                if n % 20 == 0:
                    log("벽돌 -> 망 누적 %d · 망 %s · %s" % (tot, r.get("net"), check(ai)))
            except Exception as e:  # noqa: BLE001
                log(f"오류 {type(e).__name__}: {e}"[:300])
            n += 1
            time.sleep(30)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

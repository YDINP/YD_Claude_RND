"""빨강 줄 톱니 조립기 G (-36.5,3.5) 에 철판 우선권 - 23회차 (2026-09-27).

원인: 빨강 조립기 8 (y=22.5) 톱니 0 ← G 가 철판 0 ← G 의 철판 벨트 x=-33.5 (남향, col41 동쪽 화로 x=-36 출력) 에서
G 보다 «위» 에 탭 둘이 먼저 집는다:
  탭1 고속 팔 (-32.5,-7.5) → (-31.5,-7.5) → 블록 G 버스 X2 (화학팩 쪽, 끝 (34.5,-28.5) 은 이미 가득)
  탭2 고속 팔 (-32.5,-4.5) → 유전 탄약 조립기 회랑 (가득 - 대부분 쉼)
col41 에 광석이 조금만 오면 (p27 이 먼저 먹음) 동쪽 줄 판 ~5/s 를 탭1 (~4.6/s) 이 거의 다 가져가 G 는 굶는다.

고침 (회로): 탭1 을 G 앞 벨트 (-33.5,0.5) 에 빨강 선으로 잇고 «그 칸에 철판 > 0» 일 때만 켠다.
G 가 배부르면 판이 (-33.5,0.5) 까지 밀려와 탭1 이 켜지고, G 가 굶으면 칸이 비어 탭1 이 꺼져 판이 G 로 간다.
(고속 팔 · 벨트 선 거리 ~8.1 < 9)

    python scripts/redgear23.py           # 상태
    python scripts/redgear23.py --apply   # 선 잇기 + 조건
    python scripts/redgear23.py --undo    # 되돌림
"""
import argparse
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

TAP = (-32.5, -7.5)
PROBE = (-33.5, 0.5)
G = (-36.5, 3.5)

LUA_HEAD = """local s, f = game.surfaces[1], game.forces.player
  local tap = s.find_entities_filtered{name = 'fast-inserter', position = {%f, %f}, radius = 0.1}[1]
  local belt = s.find_entities_filtered{type = 'transport-belt', position = {%f, %f}, radius = 0.1}[1]
  local g = s.find_entities_filtered{type = 'assembling-machine', position = {%f, %f}, radius = 0.1}[1]
  if not (tap and belt and g) then return {err = 'missing', tap = tap ~= nil, belt = belt ~= nil, g = g ~= nil} end
  local function st(e) for k, v in pairs(defines.entity_status) do if v == e.status then return k end end return '?' end
""" % (TAP[0], TAP[1], PROBE[0], PROBE[1], G[0], G[1])


def status(ai):
    return ai.lua("""(function() """ + LUA_HEAD + """
      local cb = tap.get_control_behavior()
      local o = {tap = st(tap), g = st(g), wired = false}
      local rc = tap.get_wire_connector(defines.wire_connector_id.circuit_red, false)
      if rc then for _, c in pairs(rc.connections) do if c.target.owner == belt then o.wired = true end end end
      o.enable_disable = cb and cb.circuit_enable_disable or false
      local n = 0 for l = 1, 2 do n = n + belt.get_transport_line(l).get_item_count('iron-plate') end
      o.probe_plates = n
      return o end)()""")


def apply(ai):
    return ai.lua("""(function() """ + LUA_HEAD + """
      local a = tap.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      local b = belt.get_wire_connector(defines.wire_connector_id.circuit_red, true)
      local ok = a.connect_to(b, false)
      local bc = belt.get_or_create_control_behavior()
      bc.read_contents = true
      bc.read_contents_mode = defines.control_behavior.transport_belt.content_read_mode.hold
      local cb = tap.get_or_create_control_behavior()
      cb.circuit_enable_disable = true
      cb.circuit_condition = {comparator = '>', first_signal = {type = 'item', name = 'iron-plate'}, constant = 0}
      return {connected = ok} end)()""")


def undo(ai):
    return ai.lua("""(function() """ + LUA_HEAD + """
      local cb = tap.get_or_create_control_behavior()
      cb.circuit_enable_disable = false
      local a = tap.get_wire_connector(defines.wire_connector_id.circuit_red, false)
      local b = belt.get_wire_connector(defines.wire_connector_id.circuit_red, false)
      local ok = false
      if a and b then ok = a.disconnect_from(b) end
      local bc = belt.get_control_behavior()
      if bc then bc.read_contents = false end
      return {disconnected = ok} end)()""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--undo", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    if a.apply:
        print("  apply:", apply(ai))
    elif a.undo:
        print("  undo:", undo(ai))
    print("  status:", status(ai))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

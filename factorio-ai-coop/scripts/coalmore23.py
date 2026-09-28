"""기지 석탄 광맥 (x -51..-32, y -98..-74) 채굴기 증설 -> 발전소 석탄 줄 (사용자 09:2x «공습 전부하 석탄 8.5/s»).

실측 (09:2x): 광맥 잔량 ~280k, 채굴기 10 중 발전소 몫 7 (3.5/s)
    x=-33.5 옛 보일러 줄 (분배기 (-34,-55.5) 넘침 -> 새 뱅크) : 채굴기 3  (-41.5,-87.5) (-41.5,-84.5) (-39.5,-81.5)
    x=-51.5 -> y=-48 새 뱅크 줄                                 : 채굴기 2  (-46.5,-79.5) (-43.5,-79.5)
    x=-49.5 옛 보일러 3 (x=-48.5)                                : 채굴기 2  (-47.5,-90.5) (-47.5,-87.5)
    나머지 2 는 화로 · 조립기 연료 줄 (막힘 = 넘침)
광맥 위는 건물 · 채굴기로 거의 찼고 남은 자리는 동쪽 가장자리뿐 (5x5 채굴 범위 석탄 1~1.7 만).

east : 채굴기 4 동향 -> x=-33.5 남향 벨트에 옆치기 (옛 보일러 우선, 넘치면 분배기로 새 뱅크)
    (-36.5, -86.5 / -83.5 / -80.5) 동향, 떨굼 칸 (-34.5, y) 동향 벨트 1 칸
    (-39.5, -78.5) 동향, (-37.5..-34.5, -78.5) 동향 벨트 4 칸
    작은 전봇대 (-34.5,-84.5) (-34.5,-81.5) (-37.5,-77.5) -> 기존 (-32.5,-82.5) 주 전력망
짓기는 캐릭터 (outpostcrew23.run_job), 재료는 망 2 저장 -> 가방 (옮김).

    python -u scripts/coalmore23.py check [part]
    python -u scripts/coalmore23.py build east
    python -u scripts/coalmore23.py status
로그 state/coalmore23.log
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, "..", "bridge"), HERE]
from client import AIBridge  # noqa: E402
import coalline23 as cl  # noqa: E402

LOG = os.path.join(HERE, "..", "state", "coalmore23.log")


def log(msg):
    line = time.strftime("%H:%M:%S") + " " + msg
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


cl.log = log


def east():
    b = [("electric-mining-drill", -36.5, y, "east") for y in (-86.5, -83.5, -80.5)]
    b.append(("electric-mining-drill", -39.5, -78.5, "east"))
    b += [("transport-belt", -34.5, y, "east") for y in (-86.5, -83.5, -80.5)]
    b += [("transport-belt", x, -78.5, "east") for x in (-37.5, -36.5, -35.5, -34.5)]
    b += [("small-electric-pole", -34.5, -84.5, "north"), ("small-electric-pole", -34.5, -81.5, "north"),
          ("small-electric-pole", -37.5, -77.5, "north")]
    return b


PARTS = {"east": east}
cl.PARTS.update(PARTS)
ENTRY = {"east": (-30.5, -80.5)}


def build(ai, part):
    import outpostcrew23 as crew
    ok = crew.run_job(ai, PARTS[part](), lambda ch: [], ENTRY[part], "coalmore23", log, crew_n=2, rounds=5,
                      pre_for=lambda ch: crew.chops(ai, ch))
    log("%s 캐릭터 건설 %s" % (part, "완료" if ok else "미완"))
    return ok


STATUS = """(function() local s = game.surfaces[1] local o = {work = 0, wait = 0, other = 0, nonet = 0, bank = {}, old = {}}
  local st = {} for n, v in pairs(defines.entity_status) do st[v] = n end
  local p = s.find_entities_filtered{type = 'electric-pole', position = {56, -127}, radius = 4}[1]
  local main = p and p.electric_network_id
  for _, d in pairs(s.find_entities_filtered{name = 'electric-mining-drill', area = {{-55, -100}, {-30, -70}}}) do
    if d.mining_target and d.mining_target.name == 'coal' then
      local k = st[d.status] or d.status
      if k == 'working' then o.work = o.work + 1 elseif k == 'waiting_for_space_in_destination' then o.wait = o.wait + 1 else o.other = o.other + 1 end
      if d.electric_network_id ~= main then o.nonet = o.nonet + 1 end end end
  for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-12, 30}, {20, 52}}}) do
    o.bank[#o.bank + 1] = b.get_fuel_inventory().get_item_count('coal') end
  for _, b in pairs(s.find_entities_filtered{name = 'boiler', area = {{-60, -80}, {-20, -40}}}) do
    o.old[#o.old + 1] = b.get_fuel_inventory().get_item_count('coal') end
  local amt = 0 for _, r in pairs(s.find_entities_filtered{name = 'coal', area = {{-52, -99}, {-31, -73}}}) do amt = amt + r.amount end
  o.ore = amt
  local p1 = defines.flow_precision_index.ten_minutes
  local ps = game.forces.player.get_item_production_statistics(s)
  o.coal10 = {math.floor(ps.get_flow_count{name = 'coal', category = 'input', precision_index = p1, count = true}),
              math.floor(ps.get_flow_count{name = 'coal', category = 'output', precision_index = p1, count = true})}
  return o end)()"""


def status(ai):
    r = ai.lua(STATUS)
    for k in ("bank", "old"):
        v = r.get(k) or {}
        r[k] = list(v.values()) if isinstance(v, dict) else v
    log("상태 %s" % r)
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["check", "build", "status"])
    ap.add_argument("part", nargs="?")
    a = ap.parse_args()
    ai = AIBridge()
    if a.cmd == "check":
        for p in ([a.part] if a.part else PARTS):
            cl.check(ai, p)
    elif a.cmd == "build":
        build(ai, a.part)
    else:
        status(ai)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

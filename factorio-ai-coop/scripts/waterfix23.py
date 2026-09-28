"""북쪽 물 복구 (09-28 16:40) - 폭약 · 콘크리트 · 황 공장이 물 0.

원인: §10 (power3_23) 에서 옛 보일러 물 seg 33 (양수기 (38.5,33.5) + 관 67) 을 «소비처 0» 으로 보고 해체했는데,
artyprep23 가 그 지하 물 줄의 노출 관 (-28.5,-58.5) 에서 물을 따 폭약 공장 P (-24.5,-70.5) · 콘크리트 (-26.5,-61.5) 에 대고 있었고
황 공장 (-14.5,-43.5) 도 같은 줄이었다 (-> 포탄 10분 0). 기지 호수는 남동쪽뿐.

복구: 남쪽 화학 블록 물 (양수기 (32.5,40.5) seg, 크래킹 입력 관 (14.5,4.5)) 에서 북쪽으로 관 47 (관 13 · 지하관 34).
경로는 빈 칸 격자에서 다익스트라 (지하관 쌍 ≤10 칸, 같은 줄 기존 지하관 ±10 금지, 일반 관은 이웃에 유체 건물 없을 때만):
  본선 (14.5,3.5) -> y=0.5 서향 -> x=-30.5 북향 -> (-25.5,-72.5) 폭약 / 가지 -> 콘크리트 (-26.5,-59.5) -> 황 (-15.5,-45.5).
로봇 유령 (망 2), 1 분 안에 다 지음. 결과: 폭약 물 20 working, 황 물 60 working, 콘크리트 물 200.

    python -u scripts/waterfix23.py          # 유령 (이미 있으면 건너뜀) + 점검
"""
import os
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

PLAN = [  # (가지, 건물, x, y, 방향 - 지하관은 땅 위 이음 쪽)
    ("main", "pipe", 14.5, 3.5, 0),
    ("main", "pipe", 14.5, 2.5, 0),
    ("main", "pipe", 14.5, 1.5, 0),
    ("main", "pipe", 14.5, 0.5, 0),
    ("main", "pipe-to-ground", 13.5, 0.5, 4),
    ("main", "pipe-to-ground", 3.5, 0.5, 12),
    ("main", "pipe-to-ground", 2.5, 0.5, 4),
    ("main", "pipe-to-ground", -7.5, 0.5, 12),
    ("main", "pipe-to-ground", -8.5, 0.5, 4),
    ("main", "pipe-to-ground", -18.5, 0.5, 12),
    ("main", "pipe-to-ground", -19.5, 0.5, 4),
    ("main", "pipe-to-ground", -29.5, 0.5, 12),
    ("main", "pipe", -30.5, 0.5, 0),
    ("main", "pipe-to-ground", -30.5, -0.5, 8),
    ("main", "pipe-to-ground", -30.5, -9.5, 0),
    ("main", "pipe-to-ground", -30.5, -10.5, 8),
    ("main", "pipe-to-ground", -30.5, -19.5, 0),
    ("main", "pipe-to-ground", -30.5, -20.5, 8),
    ("main", "pipe-to-ground", -30.5, -30.5, 0),
    ("main", "pipe-to-ground", -30.5, -31.5, 8),
    ("main", "pipe-to-ground", -30.5, -41.5, 0),
    ("main", "pipe-to-ground", -30.5, -42.5, 8),
    ("main", "pipe-to-ground", -30.5, -49.5, 0),
    ("main", "pipe-to-ground", -30.5, -50.5, 8),
    ("main", "pipe-to-ground", -30.5, -60.5, 0),
    ("main", "pipe-to-ground", -30.5, -61.5, 8),
    ("main", "pipe-to-ground", -30.5, -71.5, 0),
    ("main", "pipe", -30.5, -72.5, 0),
    ("main", "pipe-to-ground", -29.5, -72.5, 12),
    ("main", "pipe-to-ground", -26.5, -72.5, 4),
    ("main", "pipe", -25.5, -72.5, 0),
    ("conc", "pipe", -31.5, -72.5, 0),
    ("conc", "pipe", -31.5, -71.5, 0),
    ("conc", "pipe-to-ground", -31.5, -70.5, 0),
    ("conc", "pipe-to-ground", -31.5, -60.5, 8),
    ("conc", "pipe", -31.5, -59.5, 0),
    ("conc", "pipe-to-ground", -30.5, -59.5, 12),
    ("conc", "pipe-to-ground", -27.5, -59.5, 4),
    ("conc", "pipe", -26.5, -59.5, 0),
    ("sulf", "pipe", -26.5, -58.5, 0),
    ("sulf", "pipe-to-ground", -25.5, -58.5, 12),
    ("sulf", "pipe-to-ground", -16.5, -58.5, 4),
    ("sulf", "pipe", -15.5, -58.5, 0),
    ("sulf", "pipe-to-ground", -15.5, -57.5, 0),
    ("sulf", "pipe-to-ground", -15.5, -54.5, 8),
    ("sulf", "pipe-to-ground", -15.5, -53.5, 0),
    ("sulf", "pipe-to-ground", -15.5, -45.5, 8),
]
LUA = """(function() local s = game.surfaces[1] local o = {placed = 0, have = 0, fail = 0}
  for _, q in pairs({%s}) do local pos = {q[2], q[3]}
    if s.find_entities_filtered{name = q[1], position = pos, radius = 0.3}[1] or s.find_entities_filtered{ghost_name = q[1], position = pos, radius = 0.3}[1] then o.have = o.have + 1
    elseif s.create_entity{name = 'entity-ghost', inner_name = q[1], position = pos, direction = q[4], force = 'player'} then o.placed = o.placed + 1
    else o.fail = o.fail + 1 end end
  for _, p in pairs({{-24.5, -70.5}, {-26.5, -61.5}, {-14.5, -43.5}}) do
    local e = s.find_entities_filtered{type = 'assembling-machine', position = p, radius = 0.6}[1] local f = e and e.fluidbox[1]
    o[p[1] .. ',' .. p[2]] = f and (f.name .. '=' .. math.floor(f.amount)) or 'dry' end
  return o end)()"""


def main() -> int:
    items = ", ".join('{"%s", %s, %s, %d}' % (b, x, y, d) for _, b, x, y, d in PLAN)
    print(AIBridge().lua(LUA % items), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Run 25: 캐릭터 시야 - 사람 플레이어 몸이 걸을 때 엔진이 하는 일만 대신한다.

헤드리스 서버에서 우리 캐릭터에는 플레이어가 붙어 있지 않아, 걸어도 땅이 생기지 않고 지도도 밝혀지지 않는다
(run25 개막: ±320 밖 정찰 불가 · 차트 0 이라 유령 · 해체 표시 주문이 막힘).
사용자 결정 (2026-10-01): «걸은 캐릭터 주변만» 지형 생성 · «걸어서 본 곳만» 차트 - 예외로 허용.
무작위 force.chart 는 여전히 금지. 여기서는 살아 있는 캐릭터 둘레 SIGHT 칸만.

    python scripts/vision25.py --run run25 --every 10
"""
import argparse, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
from client import AIBridge, RconError  # noqa

SIGHT = 64      # 청크 둘 - seen.py · chart_underfoot 와 같다
GEN_CHUNKS = 2  # 플레이어 몸이 걸으면 생기는 반경

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local n = 0
  for _, c in pairs(s.find_entities_filtered{type = 'character', force = f}) do
    local p = c.position
    s.request_to_generate_chunks(p, %d)  -- apilint: ok 사용자 결정 2026-10-01 - 걸은 캐릭터 주변 지형 생성만
    f.chart(s, {{p.x - %d, p.y - %d}, {p.x + %d, p.y + %d}})  -- apilint: ok 사용자 결정 2026-10-01 - 걸어서 본 곳만 차트
    n = n + 1
  end
  return {chars = n}
end)()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="run25")
    ap.add_argument("--every", type=int, default=10)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = None
    while True:
        try:
            ai = ai or AIBridge()
            r = ai.lua(LUA % (GEN_CHUNKS, SIGHT, SIGHT, SIGHT, SIGHT))
            if a.once:
                print(time.strftime("%H:%M:%S"), r, flush=True)
                return 0
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

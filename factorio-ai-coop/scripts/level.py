"""Fill a row of chests like water - level, not first-come.

사용자가 짚었다 - "상자가 한쪽에만 모든 물류가 저장되고있으니까 분산되서
저장되도록 하고"

벨트 한 줄이 상자 열세 개 앞을 지나가고 상자마다 받는 팔이 하나씩 있다.
그러면 «맨 앞 팔»이 지나가는 것을 다 집는다. 첫 상자가 가득 찰 때까지
둘째 상자에는 한 개도 안 온다.

    상자 1: 3200   상자 2: 0   상자 3: 0   ...   상자 13: 0

틀린 데가 없는 배치인데 결과는 「상자 하나짜리 창고」다. 그 상자가 차는
동안 나머지 열둘은 없는 것과 같고, 꺼내 쓰는 사람은 늘 한 상자에 몰린다.

답은 상자의 «칸 제한»(빨간 X) 이다. 게임이 원래 주는 기능이다. 제한에
닿은 상자에는 팔이 더 못 넣고, 못 넣은 물건은 벨트를 타고 다음 팔로 간다.

    매 순번:  제한 = (가장 덜 찬 상자의 찬 칸 수) + STEP

그러면 앞 상자가 그 높이에 닿는 순간 멈추고, 뒤 상자들이 같은 높이까지
따라온 다음에야 제한이 한 칸 올라간다. 물을 붓는 것과 같다 - 어디에
붓든 수면은 같이 오른다.

    줄 세우기가 아니라 «수위»를 정한다.

    python scripts/level.py --row=-61,10,-49,10            # 한 번
    python scripts/level.py --row=-61,10,-49,10 --row=-61,5,-49,5 --every 30
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402

STEP = 1                  # 수면 위로 열어 두는 칸 수. 작을수록 고르다


def level(ai, box, step=STEP) -> dict:
    """상자 줄 하나의 수위를 맞춘다. 돌려주는 것은 «재 본 값»이다."""
    x1, y1, x2, y2 = box
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local rows = {}
      for _, c in pairs(s.find_entities_filtered{type = "container", force = f,
            area = {{%d, %d}, {%d, %d}}}) do
        local inv = c.get_inventory(defines.inventory.chest)
        local used = 0
        for i = 1, #inv do
          if inv[i].valid_for_read then used = used + 1 end
        end
        rows[#rows+1] = { inv = inv, used = used, size = #inv }
      end
      if #rows == 0 then return { chests = 0 } end
      local low, high = rows[1].used, rows[1].used
      for _, r in pairs(rows) do
        if r.used < low then low = r.used end
        if r.used > high then high = r.used end
      end
      -- 제한은 «칸 번호»다. bar = n 이면 1..n-1 칸만 쓴다.
      local bar = low + %d + 1
      local set = 0
      for _, r in pairs(rows) do
        local want = math.min(bar, r.size + 1)
        if r.inv.supports_bar() and r.inv.get_bar() ~= want then
          r.inv.set_bar(want)
          set = set + 1
        end
      end
      return { chests = #rows, low = low, high = high, bar = bar, changed = set }
    end)()""" % (min(x1, x2), min(y1, y2), max(x1, x2) + 1, max(y1, y2) + 1,
                 step))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--row", action="append", default=[],
                    help="상자 줄 x1,y1,x2,y2. 여러 번 줄 수 있다")
    ap.add_argument("--step", type=int, default=STEP)
    ap.add_argument("--every", type=float, default=0)
    ap.add_argument("--rounds", type=int, default=100000)
    args = ap.parse_args()
    rows = [tuple(int(v) for v in r.split(",")) for r in args.row]
    if not rows:
        ap.error("--row 가 하나는 있어야 한다")

    ai = AIBridge()
    last = {}
    for _ in range(args.rounds if args.every else 1):
        for box in rows:
            try:
                got = level(ai, box, args.step)
            except RconError as exc:
                print(f"  [!] {exc}")
                continue
            if not got.get("chests"):
                if last.get(box) != "none":
                    last[box] = "none"
                    print(f"  {box}: 상자가 아직 없다")
                continue
            # 달라졌을 때만 말한다. 같은 말을 되풀이하면 다른 말이 묻힌다.
            key = (got["low"], got["high"], got["bar"])
            if last.get(box) != key:
                last[box] = key
                print(f"  {box}: 상자 {got['chests']}개 · 찬 칸 "
                      f"{got['low']}~{got['high']} · 수위 {got['bar'] - 1}칸"
                      f" (차이 {got['high'] - got['low']})")
        if not args.every:
            break
        time.sleep(args.every)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

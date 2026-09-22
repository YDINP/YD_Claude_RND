"""How many hours are left in each field, and where the next one is.

    사용자: "슬슬 자원고갈에 대한 대비도 진행해야함."

고갈은 «갑자기» 온다. 채굴기 상태에 no_minable_resources 가 찍히는 것은
이미 끝난 뒤다. 미리 알려면 두 수를 나눠야 한다 - 채굴기가 덮고 있는
매장량과, 지난 열 분의 채굴량.

    남은 시간 = 채굴기 5x5 아래 광석 / 시간당 채굴량

밭 전체의 광석은 그보다 많다(채굴기가 안 덮은 곳). 그 차이가 «줄을 더 내면
버는 시간»이고, 그것도 바닥나면 다음 밭이다. 다음 밭은 정찰이 열어 둔
지도에서 찾는다 - 청크마다 광석을 더해 덩어리로 보고, 기지에서의 거리를
같이 적는다.

    python scripts/reserves.py
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge  # noqa: E402

BASE = (-40, 30)
FIELDS = {                      # 이름: (광석, 네모)
    "석탄": ("coal", (-90, -25, -50, 10)),
    "철": ("iron-ore", (-100, 30, -55, 75)),
    "구리": ("copper-ore", (-65, 85, -20, 125)),
    "돌": ("stone", (-100, 39, -80, 58)),
}
WARN_HOURS = 12


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def fields(ai) -> list:
    """[(이름, 광석, 밭 전체, 채굴기가 덮은 양, 시간당 채굴)]"""
    packed = ";".join(f"{n},{ore},{b[0]},{b[1]},{b[2]},{b[3]}" for n, (ore, b) in FIELDS.items())
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local st = f.get_item_production_statistics(s)
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local name, ore, x1, y1, x2, y2 = string.match(bit, "([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),([^,]+)")
        local box = {{tonumber(x1), tonumber(y1)}, {tonumber(x2), tonumber(y2)}}
        local total = 0
        for _, r in pairs(s.find_entities_filtered{name = ore, area = box}) do total = total + r.amount end
        local covered = 0
        for _, d in pairs(s.find_entities_filtered{type = "mining-drill", force = f, area = box}) do
          local r = (d.name == "electric-mining-drill") and 2.5 or 1
          for _, o in pairs(s.find_entities_filtered{name = ore,
                area = {{d.position.x - r, d.position.y - r}, {d.position.x + r, d.position.y + r}}}) do
            covered = covered + o.amount
          end
        end
        local ten = st.get_flow_count{name = ore, category = "input",
                      precision_index = defines.flow_precision_index.ten_minutes, count = true}
        out[#out+1] = name .. "|" .. ore .. "|" .. total .. "|" .. covered .. "|" .. (ten * 6)
      end
      return out
    end)()""" % packed)
    out = []
    for row in _rows(reply):
        name, ore, total, covered, hourly = str(row).split("|")
        out.append((name, ore, int(float(total)), int(float(covered)), float(hourly)))
    return out


def patches(ai, limit=12) -> list:
    """차트된 땅의 광맥 덩어리. [(광석, 중심 x, 중심 y, 양, 거리)] 큰 것부터."""
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local sum, cnt, sx, sy = {}, {}, {}, {}
      for c in s.get_chunks() do
        if f.is_chunk_charted(s, {c.x, c.y}) then
          for _, r in pairs(s.find_entities_filtered{type = "resource", area = c.area}) do
            local k = r.name .. ":" .. math.floor(c.x / 3) .. "," .. math.floor(c.y / 3)
            sum[k] = (sum[k] or 0) + r.amount
            cnt[k] = (cnt[k] or 0) + 1
            sx[k] = (sx[k] or 0) + r.position.x
            sy[k] = (sy[k] or 0) + r.position.y
          end
        end
      end
      local out = {}
      for k, v in pairs(sum) do
        local name = string.match(k, "([^:]+):")
        out[#out+1] = name .. "|" .. (sx[k] / cnt[k]) .. "|" .. (sy[k] / cnt[k]) .. "|" .. v
      end
      return out
    end)()""")
    out = []
    for row in _rows(reply):
        name, x, y, amt = str(row).split("|")
        x, y, amt = float(x), float(y), int(float(amt))
        out.append((name, x, y, amt, math.hypot(x - BASE[0], y - BASE[1])))
    out.sort(key=lambda r: -r[3])
    return out[:limit]


def report(ai) -> list:
    """경고 줄 목록 (health.py 가 쓴다)."""
    warn = []
    for name, _ore, total, covered, hourly in fields(ai):
        if hourly <= 0:
            continue
        left = covered / hourly
        if left < WARN_HOURS:
            warn.append(f"{name}밭이 {left:.0f}시간이면 마른다 (덮은 광석 {covered:,}"
                        f" / 시간당 {hourly:,.0f}) - 줄을 더 내거나 다음 밭으로")
    return warn


def main() -> int:
    ai = AIBridge()
    print("  밭        전체       채굴기 아래   시간당     남은 시간(덮은 것 / 전체)")
    for name, _ore, total, covered, hourly in fields(ai):
        if hourly > 0:
            print(f"  {name:<4} {total:>11,} {covered:>12,} {hourly:>9,.0f}"
                  f"   {covered / hourly:>5.0f}h / {total / hourly:.0f}h")
        else:
            print(f"  {name:<4} {total:>11,} {covered:>12,}        -   (안 캐는 중)")
    print("  지도에 보이는 광맥 (큰 것부터)")
    for name, x, y, amt, dist in patches(ai):
        print(f"    {name:<11} ({x:>5.0f},{y:>5.0f}) {amt:>11,}  기지에서 {dist:>4.0f}칸")
    for line in report(ai):
        print("  [!] " + line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

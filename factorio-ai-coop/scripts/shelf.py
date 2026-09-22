"""Which chest actually holds it - ask, do not assume.

창고 선반은 지금까지 «계산»으로 찾았다. iron-plate 는 (dx, dy), stone 은
(dx, dy+2), coal 은 (dx, dy+4), copper-plate 는 (dx, dy+6).

그런데 (dx, dy+6) 에는 상자가 없었다. 구리판은 철판과 «같은 상자»에 있다.

    창고 상자: [30,0] iron-plate 70 + copper-plate 764
               [30,2] stone 1600
               [30,4] coal 110

그 한 줄 때문에 전기 인서터가 한 대도 안 섰다. take 가 없는 상자를 가리켜
조용히 실패하고, craft 는 구리판이 없어 조용히 실패하고, build 는 손에
없는 것을 세우려다 조용히 실패한다. 로그에는 「인서터 11개」가 네 번
찍혔고 세상의 인서터는 일곱 대 그대로였다.

    선반 자리는 «규칙»이 아니라 «사실»이다.

같은 함정을 전봇대에서 이미 한 번 겪었다. 그때는 재료가 둘인데 하나만
챙겼고, 이번에는 그 하나가 어디 있는지를 틀렸다. 둘 다 「시킨 것」과
「된 것」이 다른 경우다.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

SPAN = 9                  # 창고 한가운데에서 이만큼 안이면 «창고 상자»다

# 벨트가 채우는 줄. {창고 한가운데에서 본 y: 그 줄에 들어가도 되는 단 하나}
#
# 21회차에 석탄이 세 번 바닥났다. 세 번 다 「채굴기가 굶는다」로 읽고
# 연료를 손으로 넣었다. 네 번째에 전기 채굴기 넉 대를 세웠더니 세우자마자
# 「놓을 데 없음」으로 섰다 - 석탄 선반 상자 여덟 개가 «전부 찼고 석탄은
# 0 개»였다. 철판 17,900 · 구리판 5,700 · 포탑 30.
#
#     제자리가 찼을 때 「가장 가까운 빈 상자」로 가게 한 것이 나였다.
#     그 가장 가까운 상자가 벨트가 채울 상자였다.
#
# 벨트는 다른 데로 못 간다. 사람은 간다. 그러니 양보는 사람 쪽이 한다.
BELT_ROWS = {0: "iron-plate", -5: "copper-plate", 4: "coal"}


def fits(item, chest_y, depot) -> bool:
    """이 물건을 이 줄에 «손으로» 넣어도 되나. 벨트 줄은 제 물건만 받는다."""
    only = BELT_ROWS.get(int(chest_y) - int(depot[1]))
    return only is None or only == item


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def stock(ai, depot, span=SPAN):
    """창고 상자마다 «무엇이 얼마나» 들었나.

    [{x, y, name, held: {item: count}, room: 빈 칸 수}, ...]
    """
    dx, dy = depot
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local out = {}
      for _, c in pairs(s.find_entities_filtered{
            type = "container", force = f,
            area = {{%d, %d}, {%d, %d}}}) do
        local inv = c.get_inventory(defines.inventory.chest)
        local bits = {}
        for _, i in pairs(inv.get_contents()) do
          bits[#bits+1] = i.name .. "=" .. i.count
        end
        local room = 0
        for i = 1, #inv do
          if not inv[i].valid_for_read then room = room + 1 end
        end
        out[#out+1] = string.format("%%d|%%d|%%s|%%d|%%s",
          math.floor(c.position.x), math.floor(c.position.y), c.name,
          room, table.concat(bits, ","))
      end
      return out
    end)()""" % (dx - span, dy - span, dx + span, dy + span))

    out = []
    for row in _rows(reply):
        parts = str(row).split("|")
        if len(parts) < 5:
            continue
        x, y, name, room, bits = parts[0], parts[1], parts[2], parts[3], parts[4]
        held = {}
        for bit in bits.split(","):
            if "=" in bit:
                item, count = bit.split("=", 1)
                held[item] = int(count)
        out.append({"x": int(x), "y": int(y), "name": name,
                    "room": int(room), "held": held})
    return out


def shelves(ai, depot, span=SPAN):
    """{물건: (x, y)} - «그 물건이 실제로 들어 있는» 상자.

    한 물건이 여러 상자에 있으면 많이 든 쪽. 가서 한 번에 집을 수 있는
    곳이 나은 자리다.
    """
    out = {}
    best = {}
    for chest in stock(ai, depot, span):
        for item, count in chest["held"].items():
            if count > best.get(item, 0):
                best[item] = count
                out[item] = (chest["x"] + 0.5, chest["y"] + 0.5)
    return out


def spare(ai, depot, span=SPAN, item=None):
    """빈 칸이 남은 상자 중 창고 한가운데에 가장 가까운 것.

    벨트가 채우는 줄은 뺀다 (item 을 주면 그 물건의 줄만 허락한다).

    새 물건을 내려놓을 자리다. 없으면 None - 그러면 «상자를 하나 더
    두어야» 하는 것이지, 나르기를 포기할 일이 아니다.
    """
    dx, dy = depot
    rest = [c for c in stock(ai, depot, span)
            if c["room"] > 0 and fits(item, c["y"], depot)]
    if not rest:
        return None
    near = min(rest, key=lambda c: (c["x"] - dx) ** 2 + (c["y"] - dy) ** 2)
    return (near["x"] + 0.5, near["y"] + 0.5)


def where(ai, depot, items, span=SPAN):
    """집으러 갈 자리를 «물건마다». 없는 물건은 빼고 돌려준다.

    없는 선반을 가리키느니 그 물건을 빼는 편이 낫다. 가리키면 계획 전체가
    그 자리에서 멎지만, 빼면 나머지는 그대로 된다.
    """
    have = shelves(ai, depot, span)
    return {item: have[item] for item in items if item in have}


def slots(ai, depot, span=36):
    """벨트 줄마다 «지금 빈 칸이 있는» 상자 하나. {물건: (x, y)}

    haul.py 는 구리판 자리를 (dx, dy-4.5) 한 칸으로 «계산»했다. 그 상자가
    3,200 으로 차자 운반 당번 셋이 구리판 3,758 을 들고 그 앞에 서서
    「0 개 넣음」을 되풀이했다. 옆으로 상자 서른여섯 개가 비어 있었다.

    줄이 다 찼으면 그 물건은 빠진다 - 부르는 쪽은 «벨트 줄 아닌 데»로
    보내고, racks.py 가 줄을 늘린다.
    """
    dx, dy = depot
    out = {}
    for row_dy, item in BELT_ROWS.items():
        row = [c for c in stock(ai, depot, span)
               if c["y"] - dy == row_dy and c["room"] > 0]
        if row:
            near = min(row, key=lambda c: (c["x"] - dx) ** 2)
            out[item] = (near["x"] + 0.5, near["y"] + 0.5)
    return out

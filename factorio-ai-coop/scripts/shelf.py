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


def spare(ai, depot, span=SPAN):
    """빈 칸이 남은 상자 중 창고 한가운데에 가장 가까운 것.

    새 물건을 내려놓을 자리다. 없으면 None - 그러면 «상자를 하나 더
    두어야» 하는 것이지, 나르기를 포기할 일이 아니다.
    """
    dx, dy = depot
    rest = [c for c in stock(ai, depot, span) if c["room"] > 0]
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

"""Where a furnace may stand - ask the map that already has one.

    사용자: "화로사이에 벨트가 왜있는거임?"

사진에는 화로와 화로 사이 빈칸마다 벨트가 한 칸씩 박혀 있었다. 아무 데도
안 닿는 토막들이다. 누가 잘못 깔아서가 아니라, **같은 땅에 계획이 둘**
이었기 때문이다.

    모드(belts.lua)  제련 구역 = (25,14). 화로는 y=13 과 y=18 에 설 것이고
                     그 사이로 들어오는 벨트 y=11, 나가는 벨트 y=16 이 지난다
    grow.py          --smelt=40,0 을 받아 y=0,5,10,15,20 에 화로를 뿌렸다

모드는 제가 비워 둔 줄에 화로가 올 줄 알고 길을 냈고, grow 는 그 길 위에
화로를 세웠다. 모드는 남은 빈칸으로 길을 이어 보려 했고 - 그래서 화로
사이마다 벨트 토막이 남았다.

    기준점이 둘이면 줄은 반드시 흩어진다.

이 말은 플레이북에 이미 적혀 있었다. 적어 두는 것과 «그것을 못 틀리게
만드는 것»은 다른 일이다. 그래서 「화로가 어디에 서도 되는가」를 인자가
아니라 **모드 구역에서** 답하도록 한 곳에 모은다.

제련 기둥의 모양(belts.lua 279행)은 모드가 정한다:

    smelt.y - 3   들어오는 벨트  (광석 + 석탄)
    smelt.y - 2   버너 인서터 ↑
    smelt.y - 1   화로 줄 0
    smelt.y + 1   버너 인서터 ↑
    smelt.y + 2   나가는 벨트    (판금)
    smelt.y + 3   버너 인서터 ↓
    smelt.y + 4   화로 줄 1
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

PITCH = 3                 # 화로 2칸 + 사이 1칸. belts.lua 의 FURNACE_PITCH

# 줄의 «첫 칸»은 구역 왼쪽 끝 그 자체다. 한 칸 안으로 들여 시작하면
# 안전해 보이지만 그 한 칸이 위상을 바꾼다.
#
# belts.lua 의 out_arms 는 `smelt.x + FURNACE_PITCH * n` 에 선다. 화로가
# 그 x 에 없으면 팔은 화로가 아니라 «화로 사이 빈칸»을 집는다. 실제로
# 이미 선 화로 마흔 대는 x=40,43,... 인데 40 - 25 = 15 로 위상이 맞다 -
# 여기서 26 부터 세었다면 마흔 대 전부를 «틀린 자리»로 판정했을 것이다.
#
# 여백은 안전이 아니다. 맞물려야 하는 곳에서 여백은 어긋남이다.

# smelt.y 기준 상대 줄. belts.lua 의 feed_line() 과 «같은 숫자»여야 한다.
#
# 화로는 2x2 라 (x,y) 에 세우면 y-1 과 y 두 줄을 먹는다. 그래서 「화로 줄 0
# 은 smelt.y-1 과 smelt.y 를 차지한다」는 말은 «세우는 자리가 smelt.y»라는
# 뜻이다. 차지하는 칸과 세우는 칸을 헷갈리면 줄이 통째로 한 칸 어긋나고,
# 한 칸 어긋난 화로는 팔이 못 닿는다.
ROW_A, ROW_B = 0, 5                     # 화로를 «세우는» 두 줄
LANES = (-3, 2)                         # 벨트가 지나는 줄
ARMS = (-2, 1, 3)                       # 팔이 서는 줄


def _box(zone):
    """구역 상자. 모드는 (x,y,w,h) 로 준다 - x,y 는 «왼쪽 위»다."""
    x, y = int(zone["x"]), int(zone["y"])
    return x, y, x + int(zone.get("w") or 0), y + int(zone.get("h") or 0)


def furnace_rows(smelt):
    """모드가 «화로를 기다리는» 줄. [(y, x0, x1), ...]

    이 두 줄에만 세우면 들어오는 벨트도 나가는 벨트도 팔도 모드가 이미
    계획해 둔 자리에 그대로 맞는다. 내가 따로 벨트를 깔 이유가 없어진다.
    """
    x0, y, x1, _ = _box(smelt)
    return [(y + ROW_A, x0, x1), (y + ROW_B, x0, x1)]


def spots(rows, pitch=PITCH):
    """줄 위에 화로가 설 수 있는 «모든» 자리. 왼쪽부터."""
    out = []
    for y, x0, x1 in rows:
        for x in range(x0, x1 + 1, pitch):
            out.append((x, y))
    return out


def reserved(zones):
    """화로도 상자도 «세우면 안 되는» 띠. [(x0, y0, x1, y1, why), ...]

    벨트가 지날 줄과 팔이 설 줄이다. 여기가 비어 있어야 모드가 길을
    잇는다. 한 칸이라도 막히면 cut 이 그 자리에서 멈추고, 멈춘 앞쪽까지만
    깔린 것이 곧 «토막»이다.
    """
    out = []
    smelt = zones.get("smelt")
    if smelt:
        x0, y, x1, _ = _box(smelt)
        for dy in LANES:
            out.append((x0, y + dy, x1, y + dy, "벨트 줄"))
        for dy in ARMS:
            out.append((x0, y + dy, x1, y + dy, "팔 줄"))
    return out


# 구역 상자는 «잡아 둔 땅»이지 «깔린 길»이 아니다.
#
# 처음에는 창고 구역과 조립 구역도 통째로 금지 띠에 넣었다. 그랬더니 화로를
# 세울 자리가 0 개로 나왔다 - 모드의 craft(32..56, 13..27) 가 smelt(25..63,
# 14..30) 를 거의 덮고 있기 때문이다. 구역끼리 겹치는 것은 이 문제와 별개의
# 오래된 일이고, 그것까지 여기서 막으면 «고치려던 것»을 못 고친다.
#
# 사진을 만든 원인은 하나다: 화로가 «벨트 줄과 팔 줄» 위에 섰다는 것.
# 금지 띠는 딱 그것만 막는다.


def inside(bands, x, y):
    """이 칸이 잡혀 있나. 잡혔으면 «무엇으로» 잡혔는지 돌려준다."""
    for x0, y0, x1, y1, why in bands:
        if x0 <= x <= x1 and y0 <= y <= y1:
            return why
    return None


def clear_spots(zones, pitch=PITCH):
    """화로를 세워도 되는 자리만. 남의 줄은 빼고.

    화로는 2x2 라 (x,y) 에 세우면 x-1..x, y-1..y 네 칸을 먹는다. 네 칸
    모두가 성해야 «세워도 되는» 자리다 - 한 칸만 걸쳐도 그 줄은 끊긴다.
    """
    smelt = zones.get("smelt")
    if not smelt:
        return []
    bands = reserved(zones)
    out = []
    for x, y in spots(furnace_rows(smelt), pitch):
        why = (inside(bands, x, y) or inside(bands, x - 1, y)
               or inside(bands, x, y - 1) or inside(bands, x - 1, y - 1))
        if not why:
            out.append((x, y))
    return out


def trespassing(ai, zones):
    """남의 줄 위에 앉은 «우리» 건물. 벨트는 뺀다 - 그건 길이다.

    무엇이 잡고 있는지 알아야 무엇을 걷을지 정한다. 「못 놓는다」와
    「걷어내면 놓는다」는 다른 말이고, 여기 걸린 것은 후자다.
    """
    bands = reserved(zones)
    if not bands:
        return []
    body = ", ".join('{%d,%d,%d,%d}' % (b[0], b[1], b[2], b[3]) for b in bands)
    why_of = [b[4] for b in bands]
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local bands = { %s }
      local out = {}
      local seen = {}
      for i, b in ipairs(bands) do
        for _, e in pairs(s.find_entities_filtered{
              area = {{b[1] - 0.5, b[2] - 0.5}, {b[3] + 1.5, b[4] + 1.5}},
              force = f}) do
          local t = e.type
          if t ~= "character" and t ~= "item-entity"
             and t ~= "transport-belt" and t ~= "electric-pole"
             and t ~= "underground-belt" and t ~= "splitter" then
            local k = e.unit_number or (e.name .. e.position.x .. e.position.y)
            if not seen[k] then
              seen[k] = true
              out[#out+1] = string.format("%%d|%%d|%%s|%%d",
                math.floor(e.position.x), math.floor(e.position.y), e.name, i)
            end
          end
        end
      end
      return out
    end)()""" % body)
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for row in rows:
        x, y, name, i = str(row).split("|")
        idx = int(i) - 1
        out.append({"x": int(x), "y": int(y), "name": name,
                    "why": why_of[idx] if 0 <= idx < len(why_of) else "?"})
    return out

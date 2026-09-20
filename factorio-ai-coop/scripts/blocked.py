"""What is in the way, why it is there, and what to do about it.

    사용자: "배치해야하는데 다른건물이 막고있다면 해당 건물이 무엇인지
             왜거기설치되어있는지 체크해서 해당건물을 재설치할것인지,
             배치를 새롭게 다시 구성할것인지 시도해"

지금까지 「막혔다」는 한 마디였다. 그 한 마디 뒤에 아주 다른 것들이 숨어
있었고, 같은 말로 부르는 바람에 전부 같은 대접을 받았다.

    전봇대가 막았다      자리는 뜻이 아니다. 닿기만 하면 된다 -> 비켜 세운다
    우리 상자가 막았다   벨트가 오기 전의 임시 출구였다     -> 비우고 걷는다
    채굴기가 막았다      제 일을 하고 있다                  -> 길을 다시 그린다
    광맥·물·절벽         우리가 놓은 것이 아니다            -> 길을 다시 그린다

실제로 값을 치렀다. 창고 양옆이 전봇대 세 대에 막혀 상자 줄 급전이 통째로
멈췄는데, 그 전봇대들은 «한 칸 옆에 서도 똑같이» 전기를 보내는 것들이었다.
반대로 밭 상자 줄에 벨트를 들이대려 한 적도 있다 - 그쪽은 채굴기가 직접
떨구는 자리라, 밀어냈으면 채굴기가 갈 곳을 잃었다.

    「막혔다」는 결론이 아니라 질문이다.

그래서 막은 것을 만나면 이름을 묻고, 왜 거기 있는지를 묻고, 그 다음에
무엇을 할지 정한다.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

SHOVE = "비켜세운다"      # 자리가 뜻이 아닌 것. 옆으로 옮기면 그만
LIFT = "걷어낸다"         # 우리가 임시로 둔 것. 비우고 걷는다
REPLAN = "다시그린다"     # 제 일을 하는 건물이거나 땅. 길을 바꾼다
FREE = "비었다"

# 자리가 «뜻이 아닌» 것들. 옮겨도 하는 일이 같다.
MOVABLE = {"small-electric-pole", "medium-electric-pole",
           "big-electric-pole", "substation"}
# 우리가 «임시로» 둔 것들. 벨트가 오면 자리를 돌려줘야 한다.
LIFTABLE = {"wooden-chest", "iron-chest", "steel-chest"}


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def look(ai, tiles):
    """이 칸들에 무엇이 있고 «왜» 있나.

    [{x, y, name, kind, role, verdict}, ...] - 빈 칸도 같이 돌려준다.
    빠뜨리면 부르는 쪽에서 번호를 맞춰야 하고, 번호가 어긋나면 엉뚱한
    건물을 걷는다.
    """
    if not tiles:
        return []
    body = ", ".join("{%d,%d}" % (t["x"], t["y"]) for t in tiles)
    reply = ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local want = { %s }
      local out = {}
      for i, w in ipairs(want) do
        local hit = nil
        for _, e in pairs(s.find_entities_filtered{
              area = {{w[1] + 0.1, w[2] + 0.1}, {w[1] + 0.9, w[2] + 0.9}}}) do
          local t = e.type
          -- 우리가 «놓으려던 것»이 이미 놓여 있는 것은 방해가 아니라
          -- 진행이다. 그것을 막은 것으로 세었더니, 왼쪽에 절반 깔아 둔
          -- 길을 보고 「왼쪽은 막혔다」며 오른쪽에 처음부터 다시 그렸다.
          -- 사람이 서 있는 것도, 떨어진 광석도 마찬가지다 - 걸어가고
          -- 주우면 그만이다.
          if t ~= "character" and t ~= "item-entity"
             and t ~= "transport-belt" and t ~= "inserter"
             and t ~= "underground-belt" and t ~= "splitter" then
            hit = e break
          end
        end
        if not hit then
          out[i] = string.format("%%d|%%d|||", w[1], w[2])
        else
          -- «왜 거기 있나». 이름만으로는 모른다 - 상자 하나도 채굴기가
          -- 떨구는 출구일 수도, 우리가 쌓아 둔 창고일 수도 있다.
          local why = ""
          if hit.type == "container" then
            local held = 0
            for _, it in pairs(hit.get_inventory(defines.inventory.chest)
                                  .get_contents()) do
              held = held + it.count
            end
            local drills = s.count_entities_filtered{position = hit.position,
                           radius = 2.5, type = "mining-drill", force = f}
            why = (drills > 0 and ("채굴기 " .. drills .. "대의 출구")
                   or "쌓아 둔 상자") .. " (" .. held .. "개 들었다)"
          elseif hit.type == "mining-drill" then
            why = "캐는 중 (" .. (hit.status == defines.entity_status.no_minable_resources
                  and "캘 것 없음" or "가동") .. ")"
          elseif hit.type == "electric-pole" then
            local n = s.count_entities_filtered{position = hit.position,
                      radius = 7.0, type = "electric-pole", force = f} - 1
            why = "전기를 잇는 중 (이웃 " .. n .. ")"
          elseif hit.type == "furnace" then
            why = "녹이는 중"
          elseif hit.type == "ammo-turret" or hit.type == "electric-turret" then
            why = "지키는 중"
          elseif hit.type == "resource" then
            why = "광맥 " .. (hit.amount or 0)
          else
            why = hit.type
          end
          out[i] = string.format("%%d|%%d|%%s|%%s|%%s",
            w[1], w[2], hit.name, hit.type, why)
        end
      end
      return out
    end)()""" % body)

    out = []
    for row in _rows(reply):
        parts = str(row).split("|")
        while len(parts) < 5:
            parts.append("")
        x, y, name, kind, why = parts[0], parts[1], parts[2], parts[3], parts[4]
        out.append({"x": int(x), "y": int(y), "name": name, "kind": kind,
                    "role": why, "verdict": call(name, kind)})
    return out


def call(name, kind):
    """무엇을 할 것인가. 이름과 «갈래»를 같이 본다.

    이름만 보면 목록을 영원히 늘려야 한다. 갈래로 보면 새 건물이 생겨도
    규칙이 그대로 선다 - 우리가 정말 묻는 것은 「이것이 자리에 매여 있나」
    이지 「이것의 이름이 무엇인가」가 아니다.
    """
    if not name:
        return FREE
    if name in MOVABLE:
        return SHOVE
    if name in LIFTABLE:
        return LIFT
    return REPLAN


def verdict(ai, tiles):
    """이 칸들을 통째로 놓고 «하나의» 결론을 낸다.

    한 줄을 까는 일에서 칸마다 다른 결론을 내면 반만 깔린 줄이 남는다.
    반쪽 줄은 아무것도 안 나른다 - 그러느니 통째로 미루고 다른 쪽을
    보는 편이 낫다.

    돌려주는 것: (결론, [막은 것들])
    """
    found = [one for one in look(ai, tiles) if one["verdict"] != FREE]
    if not found:
        return FREE, []
    if any(one["verdict"] == REPLAN for one in found):
        return REPLAN, found
    if any(one["verdict"] == LIFT for one in found):
        return LIFT, found
    return SHOVE, found


def tell(found, limit=4):
    """사람이 읽을 한 줄. 무엇이, 어디에, 왜."""
    bits = [f"{one['name']}({one['x']},{one['y']}) - {one['role']}"
            for one in found[:limit]]
    rest = len(found) - len(bits)
    return " / ".join(bits) + (f" 외 {rest}" if rest > 0 else "")

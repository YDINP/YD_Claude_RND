"""Check a plan against the world before handing it over.

Three times in one session the same mistake: work was dispatched to several
agents at once when one of them had to build the thing the others were told
to use.

    급유를 채굴기가 서기 «전에»   -> nothing with an inventory at 39,-37  x16
    출구를 벨트가 닿기 «전에»     -> 팔 열 개가 벨트에서 두 칸 떨어져 섬
    입고를 창고가 서기 «전에»     -> 돌 100을 든 채 서 있고, 고리는 돌을 기다림

The last one cost the most: the growth loop sat waiting for twenty stone
while a character stood next to it holding a hundred.

Writing it down did not stop it - the playbook already says "앞사람이 끝난
것을 게임에 물어 확인하고 뒷사람을 보낸다". So ask the game instead of
remembering: every step that reaches into something (insert, take, demolish,
fuel) names a place, and that place either has something or it does not.

A plan may build what it later uses, so a build step earlier in the same
plan counts as satisfied. That is the whole rule.

    from orders import submit
    submit(ai, "hotel", plan)          # 없는 것을 가리키면 OrderError
    submit(ai, "hotel", plan, strict=False)   # 경고만 하고 보낸다
"""
from __future__ import annotations

import detached
import route

# 이 단계들은 «이미 거기 있는 것»을 건드린다.
REACHES = {"insert", "take", "demolish", "fuel", "set_recipe", "aim_drill"}

# 짓는 단계. 같은 계획 안에서 먼저 지었으면 그 자리는 찬 것으로 친다.
MAKES = {"build"}

# 한 칸 어긋남은 흔하다(칸 모서리 대 엔티티 가운데). 그만큼은 같은 자리로 본다.
NEAR = 1.6


def _spot(params: dict) -> tuple[float, float] | None:
    x, y = params.get("x"), params.get("y")
    if x is None or y is None:
        return None
    return float(x), float(y)


def _close(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return abs(a[0] - b[0]) <= NEAR and abs(a[1] - b[1]) <= NEAR


def unmet(steps, occupied) -> list[dict]:
    """이 계획에서 «없는 것을 가리키는» 단계들.

    `occupied` 는 「이 자리에 뭔가 있나」를 답하는 함수다. 서버 없이
    시험할 수 있도록 밖에서 받는다.
    """
    made: list[tuple[float, float]] = []
    bad: list[dict] = []
    for i, (kind, params) in enumerate(steps):
        at = _spot(params or {})
        if at is None:
            continue
        if kind in MAKES:
            made.append(at)
            continue
        if kind not in REACHES:
            continue
        if any(_close(at, m) for m in made):
            continue                      # 이 계획이 먼저 짓는다
        if not occupied(at):
            bad.append({"step": i, "type": kind, "x": at[0], "y": at[1],
                        "name": (params or {}).get("name")})
    return bad


_LOOK = """(function()
  local s = game.surfaces[1]
  local out = {}
  local spots = { %s }
  for i, p in ipairs(spots) do
    local e = s.find_entities_filtered {
      position = { p[1], p[2] }, radius = %s, force = game.forces.player,
    }
    local n = 0
    for _, one in pairs(e) do
      if one.type ~= "character" and one.type ~= "item-entity" then n = n + 1 end
    end
    out[i] = n
  end
  return out
end)()"""


def occupancy(ai, spots: list[tuple[float, float]]) -> dict:
    """여러 자리를 «한 번에» 묻는다. 자리마다 묻는 것은 비싸다."""
    if not spots:
        return {}
    body = ", ".join(f"{{{x},{y}}}" for x, y in spots)
    reply = ai.lua(_LOOK % (body, NEAR))
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    return {spots[i]: int(n) > 0 for i, n in enumerate(rows) if i < len(spots)}


class OrderError(RuntimeError):
    """계획이 없는 것을 가리킨다."""


def check(ai, steps) -> list[dict]:
    """계획을 내기 «전에» 게임에 묻는다. 없는 것을 가리키는 단계 목록."""
    wanted = []
    made: list[tuple[float, float]] = []
    for kind, params in steps:
        at = _spot(params or {})
        if at is None:
            continue
        if kind in MAKES:
            made.append(at)
        elif kind in REACHES and not any(_close(at, m) for m in made):
            wanted.append(at)
    seen = occupancy(ai, sorted(set(wanted)))
    return unmet(steps, lambda at: seen.get(at, False))


# 걸음의 목적지가 «설 수 있는 자리»인지 이만큼 안에서 찾는다.
STAND_SEARCH = 6


def footing(ai, steps):
    """walk_to 마다 목적지를 «설 수 있는 가장 가까운 칸»으로 고쳐 준다.

        사용자: "이동할때 상자랑상자사이는 건너갈 수 없으니까 이동할 때
                 이동경로를 먼저 짜고나서 이동시키도록"

    선반은 상자 줄·팔 줄·상자 줄이 붙어 y 3..12 가 통째로 벽이다. 「상자
    앞 한 칸」으로 잡은 목적지가 팔 줄이거나 다른 상자 줄이면 길찾기는
    목적지에서 막혀 «못 간다»로 끝나고, 그 뒤 단계는 손이 안 닿아 다
    무너진다. 목적지를 세울 수 있는 칸으로 바꿔 두면 길찾기가 알아서
    돌아간다 - 팔 뻗는 거리(10칸)가 넉넉해서 줄 바깥에 서도 닿는다.

    아직 안 지어진 것 위를 가리키는 걸음은 그대로 둔다: 그 자리는 지금
    비어 있으므로 «설 수 있는 칸»으로 통과한다.
    """
    spots = [(i, _spot(p or {})) for i, (kind, p) in enumerate(steps)
             if kind == "walk_to"]
    spots = [(i, at) for i, at in spots if at]
    if not spots:
        return steps
    packed = ";".join(f"{x},{y}" for _i, (x, y) in spots)
    reply = ai.lua("""(function()
      local s = game.surfaces[1]
      -- «설 수 있다»만으로는 모자란다. 팔 줄은 팔의 충돌 상자가 작아 설 수는
      -- 있는데, 양옆이 상자 줄이면 거기서 못 나온다 (사진: foxtrot 과 bravo
      -- 가 상자 사이 팔 줄에 서서 walk_to 를 되풀이). 큰 것(상자·화로·
      -- 조립기·연구소)이 «바로 옆»에 없는 칸을 고른다.
      local BIG = { "container", "furnace", "assembling-machine", "lab", "boiler",
                    "generator", "electric-pole", "mining-drill", "cliff" }
      local function roomy(px, py)
        if not s.can_place_entity{name = "character", position = {px, py},
                                  build_check_type = defines.build_check_type.manual} then
          return false
        end
        -- 벨트 위도 뺀다. 설 수는 있지만 서 있는 사람을 실어 나른다.
        if s.count_entities_filtered{type = { "transport-belt", "splitter", "underground-belt" },
                 area = {{px - 0.4, py - 0.4}, {px + 0.4, py + 0.4}}} > 0 then
          return false
        end
        return s.count_entities_filtered{type = BIG,
                 area = {{px - 1.2, py - 1.2}, {px + 1.2, py + 1.2}}} == 0
      end
      local out = {}
      for bit in string.gmatch("%s", "[^;]+") do
        local x, y = string.match(bit, "([^,]+),([^,]+)")
        x, y = tonumber(x), tonumber(y)
        local best
        for r = 0, %d do
          for dx = -r, r do
            for dy = -r, r do
              if (math.abs(dx) == r or math.abs(dy) == r) and not best then
                local px, py = math.floor(x + dx) + 0.5, math.floor(y + dy) + 0.5
                if roomy(px, py) then best = { px, py } end
              end
            end
          end
          if best then break end
        end
        if best then out[#out+1] = best[1] .. "|" .. best[2]
        else out[#out+1] = x .. "|" .. y end
      end
      return out
    end)()""" % (packed, STAND_SEARCH))
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    fixed = list(steps)
    moved = 0
    for (i, (x, y)), row in zip(spots, rows):
        nx, ny = (float(v) for v in str(row).split("|"))
        if abs(nx - x) > 0.6 or abs(ny - y) > 0.6:
            kind, p = fixed[i]
            fixed[i] = (kind, dict(p, x=nx, y=ny))
            moved += 1
    if moved:
        print(f"  걸음 {moved}개의 목적지를 설 수 있는 칸으로 옮겼다")
    return fixed


def submit(ai, who: str, steps, strict: bool = True):
    """확인하고 보낸다. 없는 것을 가리키면 «보내지 않고» 말한다.

    조용히 보내면 그 계획은 「nothing with an inventory at ...」로 한 줄씩
    무너지는데, 그것은 오류로 기록될 뿐 아무도 안 본다. 보내기 전에
    막는 편이 싸다.
    """
    # 출정 중인 사람은 출정 스크립트만 부린다 (detached.py). 다른 루프의 지시는 버린다.
    if not detached.mine(who):
        print(f"  {who}: {detached.owner(who)} 에 딸려 있다 - 이 지시는 보내지 않는다")
        return None
    try:
        steps = footing(ai, steps)
    except Exception as exc:              # noqa: BLE001 - 걸음 보정은 덤이다
        print(f"  [주의] 걸음 보정 실패: {exc}")
    # 긴 걸음은 적을 피해 경유한다 (route.py). charlie 는 직선으로 둥지를 가로질러 죽었다.
    try:
        steps = route.detour(ai, who, steps)
        if len(steps) > 64:
            print(f"  [주의] 경유점을 끼우니 {len(steps)}단계 - 64 뒤는 다음 순번으로")
            steps = steps[:64]
    except Exception as exc:              # noqa: BLE001
        print(f"  [주의] 길 짜기 실패: {exc}")
    bad = check(ai, steps)
    if bad:
        lines = ", ".join(f"[{b['step']}] {b['type']} {b.get('name') or ''}"
                          f"({b['x']:.0f},{b['y']:.0f})" for b in bad[:6])
        note = f"{who}: 아직 없는 것을 가리키는 단계 {len(bad)}개 - {lines}"
        if strict:
            raise OrderError(note)
        print("  [주의] " + note)
    return ai.agent(who).submit_plan(steps)

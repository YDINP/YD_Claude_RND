-- 도시 설계 - 반장이 지도를 «먼저» 보고 한 번에 정한다.
--
-- 사용자 지시: "건설은 전체적으로 맵을보고 반장이 설계위임하고"
--
-- 지금까지 구역은 «짓다 보니» 정해졌다. 첫 화로가 선 자리가 제련 구역이
-- 되고, 채굴기가 선 자리가 채굴 구역이 되고, 조립 구역은 남는 빈 땅에서
-- 찾았다. 그래서 이런 일이 생겼다:
--
--   * 첫 일이 「돌부터 캐서 화로를 만들겠습니다」라 제련 구역이 돌 광맥
--     위에 앉았다. 광맥의 76%를 깔고 앉은 채로.
--   * 그것을 피하게 했더니 광석에서 «멀어지는» 쪽으로 피해, 제련 구역이
--     철광석에서 200타일 밖에 섰다.
--   * 유통 구역과 제련 구역 사이가 49타일인데 길은 154칸이 나왔다.
--
-- 짓는 순서가 자리를 정하면, 자리는 짓는 순서만큼 우연해진다.
--
-- 그래서 «먼저» 본다. 광맥이 어디에 얼마나 있고, 물이 어디고, 둥지가
-- 어느 쪽인지. 그다음 네 구역을 «한꺼번에» 정한다. 서로의 위치를 알고
-- 정하므로 사이가 가깝고, 광맥 위에 앉지 않고, 둥지 반대쪽으로 물러선다.
--
-- 한 번 정하면 남는다. 설계가 흔들리면 그 위에 지은 것이 전부 흔들린다.

local Core = require("core")
local agent = Core.agent
local body = Core.body

local Stock = require("stock")
local base = Stock.base

-- 구역 크기. 한 자리에 적어두고 여기서만 고친다.
-- 제련 블록 치수는 plots.lua 한 곳에서 온다.
local SMELT_W, SMELT_H = require("plots").FURNACE.w,
                         require("plots").FURNACE.h
local CRAFT_W, CRAFT_H = 24, 14
local DEPOT_W, DEPOT_H = 12, 5

local ORE = { "iron-ore", "copper-ore", "coal", "stone", "uranium-ore" }
local WATER = { "water", "deepwater", "water-shallow", "water-mud",
                "water-green", "deepwater-green" }
local BUILT = { "furnace", "mining-drill", "assembling-machine", "lab",
                "boiler", "generator", "container", "transport-belt",
                "inserter", "electric-pole", "pipe" }

-- 지도를 읽는다. 광맥마다 중심과 매장량, 물, 둥지.
local function read_map(surface, home, reach)
  local out = { patches = {}, home = home }
  for _, name in pairs(ORE) do
    local found = surface.find_entities_filtered {
      position = home, radius = reach, name = name,
    }
    if #found > 0 then
      local sx, sy, amount = 0, 0, 0
      local lo = { x = math.huge, y = math.huge }
      local hi = { x = -math.huge, y = -math.huge }
      for _, e in pairs(found) do
        sx, sy = sx + e.position.x, sy + e.position.y
        amount = amount + e.amount
        lo.x, lo.y = math.min(lo.x, e.position.x), math.min(lo.y, e.position.y)
        hi.x, hi.y = math.max(hi.x, e.position.x), math.max(hi.y, e.position.y)
      end
      local cx, cy = sx / #found, sy / #found
      out.patches[name] = {
        x = math.floor(cx), y = math.floor(cy), tiles = #found,
        amount = math.floor(amount),
        left = math.floor(lo.x), top = math.floor(lo.y),
        right = math.ceil(hi.x), bottom = math.ceil(hi.y),
        gap = math.floor(math.sqrt((cx - home.x) ^ 2 + (cy - home.y) ^ 2)),
      }
    end
  end

  local wet = surface.find_tiles_filtered {
    position = home, radius = reach, name = WATER, limit = 3000,
  }
  if #wet > 0 then
    local best, gap = nil, math.huge
    for _, t in pairs(wet) do
      local d = math.abs(t.position.x - home.x) + math.abs(t.position.y - home.y)
      if d < gap then best, gap = t, d end
    end
    out.water = { x = math.floor(best.position.x), y = math.floor(best.position.y),
                  gap = gap, tiles = #wet }
  end

  -- 둥지는 반경에 매이지 않는다. 멀어도 방향은 알아야 한다.
  local nests = surface.find_entities_filtered {
    force = game.forces.enemy, type = "unit-spawner",
  }
  out.nests = #nests
  local near, gap = nil, math.huge
  for _, n in pairs(nests) do
    local d = math.sqrt((n.position.x - home.x) ^ 2 + (n.position.y - home.y) ^ 2)
    if d < gap then near, gap = n, d end
  end
  if near then
    out.nest = { x = math.floor(near.position.x), y = math.floor(near.position.y),
                 gap = math.floor(gap) }
    -- 둥지 «반대» 방향. 구역은 이쪽으로 물러선다.
    local dx, dy = home.x - near.position.x, home.y - near.position.y
    local span = math.sqrt(dx * dx + dy * dy)
    if span > 1 then
      out.away = { x = dx / span, y = dy / span }
    end
  end
  return out
end

-- 이 네모가 쓸 만한가. 광맥 위도 물 위도 안 되고, 이미 선 것도 없어야 한다.
local function clear(surface, at, w, h, slack)
  local box = { { at.x - 2, at.y - 2 }, { at.x + w + 2, at.y + h + 2 } }
  return surface.count_entities_filtered { area = box, name = ORE } == 0
     and surface.count_tiles_filtered { area = box, name = WATER } == 0
     and surface.count_entities_filtered { area = box, type = BUILT } <= (slack or 0)
end

-- 어느 한 점에서 가까우면서 쓸 만한 자리. 둥지 반대쪽을 먼저 본다.
local function seat_near(surface, toward, w, h, away, slack)
  local rings = {}
  for r = 4, 80, 4 do rings[#rings + 1] = r end
  for _, r in pairs(rings) do
    local steps = {}
    -- 둥지 반대 방향부터 훑는다. 같은 값이면 안전한 쪽이 낫다.
    if away then
      steps[#steps + 1] = { away.x * r, away.y * r }
    end
    for _, s in pairs({ { r, 0 }, { 0, r }, { -r, 0 }, { 0, -r },
                        { r, r }, { -r, r }, { r, -r }, { -r, -r } }) do
      steps[#steps + 1] = s
    end
    for _, step in pairs(steps) do
      local at = { x = math.floor(toward.x + step[1] - w / 2),
                   y = math.floor(toward.y + step[2] - h / 2) }
      if clear(surface, at, w, h, slack) then return at end
    end
  end
  return nil
end

local function mid(a, b)
  return { x = math.floor((a.x + b.x) / 2), y = math.floor((a.y + b.y) / 2) }
end

-- 네 구역을 한꺼번에 정한다.
--
--   제련   녹일 것(철·구리) 가운데에서 가깝고, 광맥 위는 아닌 자리
--   유통   밭들과 제련 구역 사이
--   조립   제련 구역 옆. 판금이 짧게 오도록
--
-- 순서가 뜻이 있다. 제련이 기준점이고 나머지는 그로부터 잰다 - 세 곳이
-- 각자 좋은 자리를 고르면 서로 멀어진다.
local function lay_out(name, redo)
  local a = agent(name)
  local b = body(a)
  local surface = b and b.surface or game.surfaces[1]
  -- 어디를 중심으로 지도를 볼 것인가.
  --
  -- 실측: 설계가 (0,0) 기준으로 잡혀 제련 구역이 철광석 80타일 밖에 섰다.
  -- `base()` 는 우리 «건물»의 무게중심인데, 개국 직후에는 건물이 없어서
  -- 원점을 줬다. 그리고 설계는 한 번 정하면 남으므로 그 엉뚱한 자리가
  -- 굳었다.
  --
  -- 사람이 서 있는 자리가 맞다. 요원은 광맥이 있는 데서 시작한다.
  -- 건물이 서고 나면 그때는 건물의 무게중심이 더 낫다 - 둘 다 있으면
  -- 건물 쪽을 쓴다.
  --
  -- 그리고 «모르면 미룬다». 원점을 기본값으로 쓰면, 모르는 것을 (0,0)
  -- 이라고 아는 척하는 것이 된다. 이 저장소가 여러 번 한 실수다.
  local seen = base() or {}
  -- 건물이 «한 채도 없으면» 그 무게중심은 무게중심이 아니다. 개수를
  -- 같이 보지 않으면 빈 합계를 좌표로 믿게 된다.
  local home = (seen.count or 0) > 0 and seen.home or nil
  if (not home) and b then
    home = { x = math.floor(b.position.x), y = math.floor(b.position.y) }
  end
  if not home then return { error = "nobody on the map yet" } end

  storage.city = storage.city or {}
  if storage.city.plan and not redo then
    return storage.city.plan
  end

  local map = read_map(surface, home, 250)
  local iron = map.patches["iron-ore"]
  local copper = map.patches["copper-ore"]
  if not iron and not copper then
    return { error = "no iron or copper in sight - nothing to lay out yet" }
  end

  -- 화로가 먹는 것의 가운데.
  --
  -- 「녹일 것의 가운데」로 뒀더니 석탄이 빠졌다. 실측(run11):
  --
  --   제련 구역 중심 (-6,82)
  --     철   (31,101)  56타일
  --     구리 (-37,60)  53타일
  --     석탄 (51,65)   74타일   <- 가장 멀다
  --
  -- 버너 시대에 석탄은 «가장 많이 움직이는 것»이다. 화로마다 들어가고
  -- 채굴기마다 들어간다 - 광석은 제 밭에서 제련까지 한 번 가지만 석탄은
  -- 모든 기계로 간다. 그것을 빼고 가운데를 잡으면, 가장 굵은 흐름만
  -- 빼놓고 가운데를 잡은 셈이다.
  --
  -- 석탄을 넣으면 같은 지도에서 합계 183 -> 155 타일이 된다.
  --
  -- 사람이 지은 68시간 공장이 이 실수의 큰 판이었다(docs/user-base-study.md):
  -- 제련을 광맥으로 보내 전기화로 150대가 332x343에 흩어졌고, 그 값을
  -- 벨트 6,829칸으로 치렀다.
  local burns = {}
  for _, p in pairs({ iron, copper, map.patches["coal"] }) do
    if p then burns[#burns + 1] = p end
  end
  local heart = burns[1]
  if #burns > 1 then
    local hx, hy = 0, 0
    for _, p in pairs(burns) do hx, hy = hx + p.x, hy + p.y end
    heart = { x = math.floor(hx / #burns), y = math.floor(hy / #burns) }
  end
  local smelt = seat_near(surface, heart, SMELT_W, SMELT_H, map.away, 1)
  if not smelt then
    return { error = "no room for a smelting block near the ore" }
  end

  -- 밭들의 가운데. 유통 구역은 그것과 제련 사이에 선다.
  local fields, fx, fy, n = {}, 0, 0, 0
  for _, ore in pairs({ "iron-ore", "copper-ore", "coal" }) do
    local p = map.patches[ore]
    if p then
      fields[#fields + 1] = { ore = ore, x = p.x, y = p.y,
                              tiles = p.tiles, amount = p.amount, gap = p.gap }
      fx, fy, n = fx + p.x, fy + p.y, n + 1
    end
  end
  local depot = nil
  if n > 0 then
    local between = mid({ x = fx / n, y = fy / n },
                        { x = smelt.x + SMELT_W / 2, y = smelt.y + SMELT_H / 2 })
    depot = seat_near(surface, between, DEPOT_W, DEPOT_H, map.away, 0)
  end

  -- 조립 구역은 제련 구역 옆. 판금이 짧게 와야 한다.
  local craft = seat_near(surface,
    { x = smelt.x + SMELT_W / 2, y = smelt.y - 10 }, CRAFT_W, CRAFT_H, map.away, 0)

  local plan = {
    home = home,
    smelt = { x = smelt.x, y = smelt.y, w = SMELT_W, h = SMELT_H },
    depot = depot and { x = depot.x, y = depot.y, w = DEPOT_W, h = DEPOT_H } or nil,
    craft = craft and { x = craft.x, y = craft.y, w = CRAFT_W, h = CRAFT_H } or nil,
    fields = fields,
    water = map.water,
    nest = map.nest,
    nests = map.nests,
    made_at = game.tick,
  }
  storage.city.plan = plan
  -- 구역 쪽이 보는 자리에도 적어둔다. 답은 한 군데서 나와야 한다.
  storage.smelter = { x = smelt.x, y = smelt.y }
  storage.zones = storage.zones or {}
  storage.zones.craft = craft
  storage.zones.depot = depot
  return plan
end

return {
  read_map = read_map,
  lay_out = lay_out,
}

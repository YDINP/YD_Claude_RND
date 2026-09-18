-- 구역 - 무엇을 «어디서» 하는가.
--
-- 지금까지는 구역이라는 개념이 없었다. 채굴기 앞에 화로를 놓고, 화로 옆에
-- 조립기를 놓고, 조립기 옆에 랩을 놓았다. 그래서 광맥 위에서 캐고 녹이고
-- 만드는 일이 전부 벌어졌고, 서로 자리를 뺏고 길을 막았다.
--
-- 사람이 짓는 공장은 그렇지 않다. 캐는 데가 따로 있고, 녹이는 데가 따로
-- 있고, 만드는 데가 따로 있다. 그 사이를 벨트가 잇는다. 그렇게 나누는
-- 이유는 보기 좋아서가 아니다:
--
--   * 광맥은 언젠가 마른다. 캐는 구역은 옮겨가고 나머지는 남는다.
--   * 녹이는 줄은 벨트 하나로 먹이고 벨트 하나로 거둔다. 흩어져 있으면 못 한다.
--   * 만드는 구역은 전기가 필요하다. 전기는 발전소에서 온다.
--
-- 구역은 한 번 정하면 남는다. 누가 묻든 같은 답이라야 모두가 같은 곳에
-- 짓는다 - 이 저장소가 세 번 겪은 「기준점이 흔들려 줄이 흩어지는」 문제의
-- 뿌리가 그것이었다.

local Core = require("core")
local agent = Core.agent
local body = Core.body

local Stock = require("stock")
local base = Stock.base
local smelter = Stock.smelter

local Power = require("power")
local power_reach = Power.power_reach

-- 구역 하나의 크기. 채굴은 광맥이 정하므로 여기 없다.
local SMELT_W, SMELT_H = 38, 16   -- 화로 두 줄짜리 블록 둘
local CRAFT_W, CRAFT_H = 24, 14   -- 조립기 몇 대와 랩 줄
local CLEAR = { "furnace", "mining-drill", "assembling-machine", "lab",
                "boiler", "generator", "container", "transport-belt",
                "inserter", "electric-pole", "pipe" }
local WATER = { "water", "deepwater", "water-shallow", "water-mud",
                "water-green", "deepwater-green" }

local function room(surface, at, w, h)
  local box = { { at.x - 2, at.y - 2 }, { at.x + w, at.y + h } }
  return surface.count_entities_filtered { area = box, type = CLEAR } == 0
     and surface.count_tiles_filtered { area = box, name = WATER } == 0
end

-- 캐는 구역: 우리 채굴기들이 실제로 서 있는 곳. 광맥이 정하지 우리가
-- 정하는 것이 아니므로, 매번 다시 잰다.
local function mine_zone(surface, force)
  local drills = surface.find_entities_filtered {
    type = "mining-drill", force = force,
  }
  if #drills == 0 then return nil end
  local sx, sy = 0, 0
  local lo = { x = math.huge, y = math.huge }
  local hi = { x = -math.huge, y = -math.huge }
  for _, d in pairs(drills) do
    sx, sy = sx + d.position.x, sy + d.position.y
    lo.x, lo.y = math.min(lo.x, d.position.x), math.min(lo.y, d.position.y)
    hi.x, hi.y = math.max(hi.x, d.position.x), math.max(hi.y, d.position.y)
  end
  return {
    x = math.floor(sx / #drills + 0.5), y = math.floor(sy / #drills + 0.5),
    left = math.floor(lo.x), top = math.floor(lo.y),
    right = math.floor(hi.x), bottom = math.floor(hi.y),
    count = #drills,
  }
end

-- 만드는 구역: 전기가 닿는 곳이어야 한다. 조립기도 랩도 전기를 먹는다.
-- 그러니 «전기가 있는 전봇대 가까이»에서 빈 땅을 찾는다.
local function craft_zone(surface, force, home)
  if storage.zones and storage.zones.craft then return storage.zones.craft end
  local live = power_reach(home.x, home.y)
  local anchor = live.powered or home
  for r = 6, 60, 4 do
    for _, step in pairs({ { r, 0 }, { 0, r }, { -r, 0 }, { 0, -r },
                           { r, r }, { -r, r }, { r, -r }, { -r, -r } }) do
      local at = { x = math.floor(anchor.x + step[1]),
                   y = math.floor(anchor.y + step[2]) }
      if room(surface, at, CRAFT_W, CRAFT_H) then
        storage.zones = storage.zones or {}
        storage.zones.craft = at
        return at
      end
    end
  end
  return nil
end

-- 세 구역을 한 번에 답한다. 부르는 쪽이 「여기는 어느 구역인가」를 묻는
-- 자리는 여기 하나뿐이어야 한다.
local function zones(name)
  local a = agent(name)
  local b = body(a)
  local surface = b and b.surface or game.surfaces[1]
  local force = b and b.force or game.forces.player

  local home = base().home
  if not home then return { zones = nil } end

  local out = {
    home = home,
    mine = mine_zone(surface, force),
    smelt = smelter().smelter,
    craft = craft_zone(surface, force, home),
  }
  if out.smelt then
    out.smelt.w, out.smelt.h = SMELT_W, SMELT_H
  end
  if out.craft then
    out.craft.w, out.craft.h = CRAFT_W, CRAFT_H
  end
  return out
end

-- 지도에 구역을 그린다. 사람이 관전하면서 «어디가 어디인지» 보게 하는 것이
-- 목적이다. 같은 자리에 두 번 그리지 않도록 기억해 둔다.
local LABELS = { mine = "채굴", smelt = "제련", craft = "조립" }

local function draw_zones(name)
  local here = zones(name)
  if not here or not here.home then return { drawn = 0 } end
  local force = game.forces.player
  local surface = game.surfaces[1]

  storage.zone_tags = storage.zone_tags or {}
  local drawn = 0
  for key, label in pairs(LABELS) do
    local spot = here[key]
    if spot then
      local old = storage.zone_tags[key]
      if old and old.valid then
        -- 3타일 넘게 움직였을 때만 다시 그린다. 매번 지웠다 그리면
        -- 지도에서 깜빡인다.
        local dx, dy = old.position.x - spot.x, old.position.y - spot.y
        if dx * dx + dy * dy <= 9 then goto next end
        old.destroy()
      end
      storage.zone_tags[key] = force.add_chart_tag(surface, {
        position = { spot.x, spot.y }, text = label,
      })
      drawn = drawn + 1
    end
    ::next::
  end
  return { drawn = drawn, zones = here }
end

return {
  zones = zones,
  draw_zones = draw_zones,
}

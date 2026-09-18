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

local Tasks = require("tasks")

local Core = require("core")
local agent = Core.agent
local body = Core.body

local Stock = require("stock")
local base = Stock.base
local smelter = Stock.smelter

local Plots = require("plots")
local plot_seats = Plots.plot_seats

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

-- 광맥 위에는 구역을 놓지 않는다.
--
-- 건물이 덮은 광맥은 영영 못 캔다. 그리고 그 자리는 언젠가 채굴 구역이
-- 되고 싶어하는 땅이다 - 조립기를 거기 세우면 나중에 둘이 싸운다.
--
-- 제련 쪽에서 이 조건이 빠져 돌 광맥의 76%를 깔고 앉은 일이 있었다.
-- 여기도 같은 구멍이 있었다.
local ORE = { "stone", "iron-ore", "copper-ore", "coal", "uranium-ore" }

local function room(surface, at, w, h)
  local box = { { at.x - 2, at.y - 2 }, { at.x + w, at.y + h } }
  return surface.count_entities_filtered { area = box, type = CLEAR } == 0
     and surface.count_tiles_filtered { area = box, name = WATER } == 0
     and surface.count_entities_filtered { area = box, name = ORE } == 0
end

-- 캐는 구역: 우리 채굴기들이 실제로 서 있는 곳.
--
-- 사용자가 짚었다: "채굴구역이 왜 나무숲쪽에 잡혀있지?"
--
-- 채굴기 «전부»를 감싸는 상자 하나를 채굴 구역이라고 불렀기 때문이다.
-- 실측이 그대로였다:
--
--     채굴기 (79,67) 구리, (107,-45) 철, (109,-45) 철
--     구역   79,-45 ~ 109,67  =  30 x 112 타일
--     그 안  나무 65그루, 철 98, 구리 108
--
-- 광맥이 둘인데 구역이 하나면, 그 하나는 두 광맥 «사이의 빈 숲»까지
-- 삼킨다. 캐는 구역이 광맥 위가 아니라 나무 위에 잡힌 것이다.
--
-- 광맥은 흩어져 있다. 그러니 캐는 구역도 흩어져 있어야 한다. 한 덩어리로
-- 묶을 수 있는 것은 «모여 있는 것»뿐이다.
local FIELD_GAP = 24

-- 가까운 것끼리 묶는다. 스물네 타일 안에 있으면 한 밭이다.
local function fields_of(drills)
  local seen, out = {}, {}
  for i = 1, #drills do
    if not seen[i] then
      local group = { drills[i] }
      seen[i] = true
      local n = 1
      while n <= #group do
        local here = group[n]
        for j = 1, #drills do
          if not seen[j] then
            local dx = drills[j].position.x - here.position.x
            local dy = drills[j].position.y - here.position.y
            if dx * dx + dy * dy <= FIELD_GAP * FIELD_GAP then
              seen[j] = true
              group[#group + 1] = drills[j]
            end
          end
        end
        n = n + 1
      end
      out[#out + 1] = group
    end
  end
  return out
end

local function box_of(group)
  local sx, sy = 0, 0
  local lo = { x = math.huge, y = math.huge }
  local hi = { x = -math.huge, y = -math.huge }
  for _, d in pairs(group) do
    sx, sy = sx + d.position.x, sy + d.position.y
    lo.x, lo.y = math.min(lo.x, d.position.x), math.min(lo.y, d.position.y)
    hi.x, hi.y = math.max(hi.x, d.position.x), math.max(hi.y, d.position.y)
  end
  return {
    x = math.floor(sx / #group + 0.5), y = math.floor(sy / #group + 0.5),
    left = math.floor(lo.x), top = math.floor(lo.y),
    right = math.floor(hi.x), bottom = math.floor(hi.y),
    count = #group,
  }
end

local function mine_zone(surface, force)
  local drills = surface.find_entities_filtered {
    type = "mining-drill", force = force,
  }
  if #drills == 0 then return nil, {} end

  local fields = {}
  for _, group in ipairs(fields_of(drills)) do
    local box = box_of(group)
    -- 무엇을 캐는 밭인가. 그 자리의 자원이 말해준다.
    local digs = group[1].mining_target
    box.ore = digs and digs.valid and digs.name or nil
    fields[#fields + 1] = box
  end
  table.sort(fields, function(p, q) return p.count > q.count end)

  -- 가장 큰 밭이 「그 채굴 구역」이다. 나머지는 fields 로 따로 준다.
  -- 상자 하나로 답해야 하는 자리(겹침 판정)가 아직 여럿이라 그렇다.
  return fields[1], fields
end

-- 두 사각형이 겹치는가. 구역이 서로 겹치면 나눈 것이 아니다.
local function overlaps(at, w, h, box, margin)
  margin = margin or 0
  return not (at.x + w < box.left - margin or at.x > box.right + margin
           or at.y + h < box.top - margin or at.y > box.bottom + margin)
end

-- 만드는 구역: 전기가 닿는 곳이어야 한다. 조립기도 랩도 전기를 먹는다.
-- 그러니 «전기가 있는 전봇대 가까이»에서 빈 땅을 찾는다.
--
-- 다만 «빈 땅»만으로는 모자랐다. 처음 골라준 자리가 채굴 구역 한복판이었다 -
-- 그 순간 마침 건물이 없었을 뿐, 거기는 곧 채굴기가 설 땅이다. 구역은
-- «지금 비어 있는가»가 아니라 «누구 땅인가»로 정해야 한다.
local MINE_MARGIN = 6

local function craft_zone(surface, force, home, mine, smelt)
  local kept = storage.zones and storage.zones.craft
  if kept and not (mine and overlaps(kept, CRAFT_W, CRAFT_H, mine, MINE_MARGIN)) then
    return kept
  end

  local live = power_reach(home.x, home.y)
  local anchor = live.powered or home
  for r = 6, 90, 4 do
    for _, step in pairs({ { r, 0 }, { 0, r }, { -r, 0 }, { 0, -r },
                           { r, r }, { -r, r }, { r, -r }, { -r, -r } }) do
      local at = { x = math.floor(anchor.x + step[1]),
                   y = math.floor(anchor.y + step[2]) }
      local clash = mine and overlaps(at, CRAFT_W, CRAFT_H, mine, MINE_MARGIN)
      if not clash and smelt then
        clash = overlaps(at, CRAFT_W, CRAFT_H, {
          left = smelt.x, top = smelt.y,
          right = smelt.x + SMELT_W, bottom = smelt.y + SMELT_H }, 4)
      end
      if not clash and room(surface, at, CRAFT_W, CRAFT_H) then
        storage.zones = storage.zones or {}
        storage.zones.craft = at
        return at
      end
    end
  end
  return nil
end

-- 발전 구역: 보일러와 기관이 실제로 서 있는 곳.
--
-- 이것을 구역으로 안 본 값이 실측에 그대로 나왔다:
--
--   offshore-pump  (-79,-55)   기지에서 176타일
--   전봇대 53개    -94..84     179타일에 걸쳐 흩어짐
--   랩 4대         -91..82     174타일에 걸쳐 흩어짐
--
-- 발전소가 먼 것은 우리 탓이 아니다. 기지 반경 150 안의 가장 가까운 물이
-- 176타일 밖이고, 해양 펌프는 물가에만 선다. 옮길 수 없다.
--
-- 그런데 «먼 것»과 «흩어진 것»은 다르다. 발전소가 구역이 아니면 그 사이를
-- 잇는 전봇대에 주인이 없고, 주인이 없으니 랩이 그 선을 따라 아무 데나
-- 섰다. 멀면 멀수록 한 덩어리여야 한다.
local POWER_PAD = 8

local function power_zone(surface, force)
  local lo = { x = math.huge, y = math.huge }
  local hi = { x = -math.huge, y = -math.huge }
  local seen = 0
  for _, e in pairs(surface.find_entities_filtered {
    type = { "boiler", "generator", "offshore-pump" }, force = force,
  }) do
    lo.x, lo.y = math.min(lo.x, e.position.x), math.min(lo.y, e.position.y)
    hi.x, hi.y = math.max(hi.x, e.position.x), math.max(hi.y, e.position.y)
    seen = seen + 1
  end
  if seen == 0 then return nil end
  return {
    x = math.floor(lo.x) - POWER_PAD, y = math.floor(lo.y) - POWER_PAD,
    w = math.ceil(hi.x - lo.x) + POWER_PAD * 2,
    h = math.ceil(hi.y - lo.y) + POWER_PAD * 2,
    count = seen,
  }
end

-- 유통 구역: 캐는 곳과 녹이는 곳 «사이».
--
-- 사용자 지시: "채굴지에서 채굴해서 자원을수집해서 관리하는 유통구역 ->
-- 제련/조립 구역으로 순차적으로 물류가 유통순환이 되도록"
--
-- 자리는 밭과 제련 구역을 잇는 선 위다. 가운데에 두면 어느 밭에서 와도
-- 비슷하게 걸리고, 거기서 제련까지는 한 줄이면 된다.
--
-- 다른 구역과 마찬가지로 광맥 위는 안 된다. 그리고 한 번 정하면 남는다 -
-- 모으는 곳이 움직이면 그리로 깔아둔 길이 전부 헛것이 된다.
local DEPOT_W, DEPOT_H = 12, 5

local function depot_zone(surface, force, mine, smelt)
  local kept = storage.zones and storage.zones.depot
  if kept then return kept end
  if not mine or not smelt then return nil end

  -- 밭과 제련 구역의 가운데에서 시작해 밖으로 넓혀간다.
  local mid = { x = math.floor((mine.x + smelt.x) / 2),
                y = math.floor((mine.y + smelt.y) / 2) }
  for r = 0, 60, 4 do
    local ring = (r == 0) and { { 0, 0 } }
      or { { r, 0 }, { 0, r }, { -r, 0 }, { 0, -r },
           { r, r }, { -r, r }, { r, -r }, { -r, -r } }
    for _, step in pairs(ring) do
      local at = { x = mid.x + step[1], y = mid.y + step[2] }
      local clash = overlaps(at, DEPOT_W, DEPOT_H, {
        left = smelt.x, top = smelt.y,
        right = smelt.x + SMELT_W, bottom = smelt.y + SMELT_H }, 4)
      if not clash and mine then
        clash = overlaps(at, DEPOT_W, DEPOT_H, mine, 4)
      end
      if not clash and room(surface, at, DEPOT_W, DEPOT_H) then
        storage.zones = storage.zones or {}
        storage.zones.depot = at
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
    mine = nil,    -- 아래에서 밭 목록과 함께 받는다.
    smelt = smelter().smelter,
    craft = nil,   -- 아래에서 채운다. 채굴/제련 구역을 알아야 고를 수 있다.
    power = power_zone(surface, force),
  }
  out.mine, out.fields = mine_zone(surface, force)
  out.craft = craft_zone(surface, force, home, out.mine, out.smelt)
  out.depot = depot_zone(surface, force, out.mine, out.smelt)
  if out.smelt then
    out.smelt.w, out.smelt.h = SMELT_W, SMELT_H
  end
  if out.craft then
    out.craft.w, out.craft.h = CRAFT_W, CRAFT_H
  end
  if out.depot then
    out.depot.w, out.depot.h = DEPOT_W, DEPOT_H
  end
  return out
end

-- 다음에 놓을 자리. 세지 않고 «비어 있는 첫 자리»를 묻는다.
--
-- 예전에는 「이미 선 화로가 열두 대니 다음은 열세 번째 자리」로 정했다.
-- 그런데 그 열두 대 중 하나가 자리표에서 벗어나 있으면 번호가 밀리고,
-- 이미 찬 자리에 또 놓으려 든다. 세는 것과 비어 있는가는 다른 질문이다.
local function next_seat(name, which)
  local here = zones(name)
  local origin = (which == "smelt") and here.smelt or here.craft
  if not origin then return { error = "no " .. tostring(which) .. " zone yet" } end
  local map = plot_seats(name, which, origin)
  if map.error then return map end
  local first = map.free[1]
  return { seat = first, plot = which, origin = origin,
           ours = map.ours, taken = map.taken, blocked = map.blocked,
           free = #map.free, want = map.want }
end

-- 제자리가 아닌 건물들.
--
-- 구역을 정해놓고 새로 짓는 것만 그리로 보내면, 이미 흩어져 있는 것은 영원히
-- 흩어진 채로 남는다. 사용자가 그것을 짚었다 - "구역나눴는데 왜 심시티안함?
-- 건물들 배치를 새로 조정하고 그런걸 목표로하는건데".
--
-- 맞다. 구역을 나누는 일의 절반은 «이미 있는 것을 옮기는 일»이다.
--
--   화로        제련 구역 밖에 있으면 옮긴다
--   랩/조립기   조립 구역 밖에 있으면 옮긴다
--   채굴기      옮기지 않는다. 광맥이 자리를 정하지 우리가 정하는 것이 아니다.
--   상자        옮기지 않는다. 채굴기 앞에 있어야 한다.
--
-- 걷어내면 건물이 통째로 손에 돌아오므로, 옮기는 값은 걸음뿐이다.
local HOMES = {
  ["stone-furnace"] = "smelt",
  ["steel-furnace"] = "smelt",
  ["lab"] = "craft",
  ["assembling-machine-1"] = "craft",
  ["assembling-machine-2"] = "craft",
}

local function inside(at, zone, w, h, margin)
  margin = margin or 2
  return at.x >= zone.x - margin and at.x <= zone.x + w + margin
     and at.y >= zone.y - margin and at.y <= zone.y + h + margin
end

-- 그 건물이 자리표 위에 서 있는가.
local function on_grid(at, origin, zone)
  local seat = (zone == "smelt") and Plots.furnace_seat or Plots.craft_seat
  local plan = (zone == "smelt") and 48 or 18
  for nth = 0, plan - 1 do
    local spot = seat(origin, nth)
    if math.abs(spot.x - at.x) < 0.6 and math.abs(spot.y - at.y) < 0.6 then
      return true
    end
  end
  return false
end

local function misplaced(name, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local here = zones(name)
  local box = {
    smelt = here.smelt and { at = here.smelt, w = SMELT_W, h = SMELT_H } or nil,
    craft = here.craft and { at = here.craft, w = CRAFT_W, h = CRAFT_H } or nil,
  }

  local out, home = {}, { smelt = 0, craft = 0 }
  for what, zone in pairs(HOMES) do
    local plot = box[zone]
    if plot then
      for _, e in pairs(b.surface.find_entities_filtered {
        name = what, force = b.force,
      }) do
        if inside(e.position, plot.at, plot.w, plot.h) then
          home[zone] = home[zone] + 1
          -- 구역 안이라도 자리표에서 벗어나 있으면 옮긴다. 비뚜로 선
          -- 한 채가 자리 하나를 영영 막고, 자리표의 번호도 밀린다.
          if not on_grid(e.position, plot.at, zone) then
            out[#out + 1] = {
              name = what, zone = zone, askew = true,
              x = e.position.x, y = e.position.y,
              distance = math.floor(Tasks.dist(b.position, e.position)),
            }
          end
        elseif e.minable then
          out[#out + 1] = {
            name = what, zone = zone,
            x = e.position.x, y = e.position.y,
            distance = math.floor(Tasks.dist(b.position, e.position)),
          }
        end
      end
    end
  end

  -- 가까운 것부터. 먼 것을 먼저 옮기면 한 번에 하나씩만 옮기게 된다.
  table.sort(out, function(p, q) return p.distance < q.distance end)
  local near = {}
  for i = 1, math.min(#out, limit or 8) do near[i] = out[i] end
  return { misplaced = near, total = #out, settled = home,
           smelt = here.smelt, craft = here.craft }
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
  next_seat = next_seat,
  misplaced = misplaced,
  draw_zones = draw_zones,
}

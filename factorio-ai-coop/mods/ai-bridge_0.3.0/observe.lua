-- 무엇이 보이는가 - 한 번의 호출로 주변을 통째로 읽는다.

local Tasks = require("tasks")
local Core = require("core")
local MAX_OBSERVE_RADIUS = Core.MAX_OBSERVE_RADIUS
local MAX_SPOTS          = Core.MAX_SPOTS
local PLANNING_RECIPES   = Core.PLANNING_RECIPES
local agent              = Core.agent
local body               = Core.body
local Stock = require("stock")
local health = Stock.health

--------------------------------------------------------------- observation

-- Aggregated, not enumerated. An LLM does not need 4,000 ore tiles; it needs
-- "iron ore: 812 tiles, 96k units, nearest at (34,-12)".
local function observe(name, opts)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  opts = opts or {}
  -- An observe runs entirely inside one tick, and a console command is
  -- replicated to every peer, so an unbounded scan freezes the humans too.
  local radius = math.min(opts.radius or 64, MAX_OBSERVE_RADIUS)
  local surface, origin = b.surface, b.position

  local resources = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = origin, radius = radius, type = "resource",
  }) do
    local r = resources[e.name]
    if not r then
      r = { tiles = 0, amount = 0, nearest = nil, nearest_dist = math.huge }
      resources[e.name] = r
    end
    r.tiles = r.tiles + 1
    r.amount = r.amount + e.amount
    local d = Tasks.dist(origin, e.position)
    if d < r.nearest_dist then
      r.nearest_dist = d
      r.nearest = { x = e.position.x, y = e.position.y }
    end
  end
  for _, r in pairs(resources) do
    r.nearest_dist = math.floor(r.nearest_dist * 10) / 10
  end

  -- Filter by force in the engine rather than walking every tree, rock and
  -- dropped item in the radius and asking each one what it is.
  local buildings = {}
  for _, e in pairs(surface.find_entities_filtered {
    position = origin, radius = radius, force = b.force,
  }) do
    if e.type ~= "character" and e.type ~= "resource" then
      local entry = buildings[e.name]
      if not entry then
        entry = { count = 0, nearest = nil, nearest_dist = math.huge, spots = {} }
        buildings[e.name] = entry
      end
      entry.count = entry.count + 1
      local d = Tasks.dist(origin, e.position)
      if d < entry.nearest_dist then
        entry.nearest_dist = d
        entry.nearest = { x = e.position.x, y = e.position.y }
      end
      if #entry.spots < MAX_SPOTS then
        entry.spots[#entry.spots + 1] = {
          x = e.position.x, y = e.position.y,
          distance = math.floor(d * 10) / 10,
        }
      end
    end
  end
  for _, entry in pairs(buildings) do
    entry.nearest_dist = math.floor(entry.nearest_dist * 10) / 10
    -- 가까운 순으로. 그래야 «내 몫의 화로»를 거리순 자리로 고를 수 있다.
    table.sort(entry.spots, function(p, q) return p.distance < q.distance end)
  end

  local hostiles = #surface.find_entities_filtered {
    position = origin, radius = radius, force = "enemy",
  }

  -- Who else is nearby: the humans watching, and the other agents working.
  local humans, mates = {}, {}
  for _, p in pairs(game.connected_players) do
    humans[#humans + 1] = {
      name = p.name,
      spectating = p.character == nil,
      x = p.position.x, y = p.position.y,
      distance = math.floor(Tasks.dist(origin, p.position) * 10) / 10,
    }
  end
  for _, other in ipairs(storage.order) do
    local o = storage.agents[other]
    local ob = body(o)
    if ob and other ~= name then
      mates[#mates + 1] = {
        name = other, x = ob.position.x, y = ob.position.y,
        distance = math.floor(Tasks.dist(origin, ob.position) * 10) / 10,
        busy = o.current ~= nil,
      }
    end
  end

  return {
    tick = game.tick,
    agent = name,
    position = { x = origin.x, y = origin.y },
    radius = radius,
    resources = resources,
    buildings = buildings,
    hostiles = hostiles,
    humans = humans,
    agents = mates,
  }
end

local function inventory(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local inv = b.get_main_inventory()
  local out = {}
  if inv then
    -- 2.0 returns an array of {name, count, quality}; normalise to name -> count.
    for _, stack in pairs(inv.get_contents()) do
      out[stack.name] = (out[stack.name] or 0) + stack.count
    end
  end
  -- What could be hand-crafted right now, counting intermediates. Guessing this
  -- from the raw item list means re-deriving every recipe tree in the agent;
  -- the game already knows, and it knows about research too.
  local craftable = {}
  for _, recipe in ipairs(PLANNING_RECIPES) do
    if prototypes.recipe[recipe] then
      local ok, count = pcall(function() return b.get_craftable_count(recipe) end)
      craftable[recipe] = (ok and count) or 0
    end
  end

  -- 빈 칸 수. 가방이 차면 캐는 일도 걷어내는 일도 전부 조용히 실패한다.
  local bag = b.get_main_inventory()
  return {
    agent = name, items = out, craftable = craftable,
    free = bag and bag.count_empty_stacks() or 0,
    health = b.health, x = b.position.x, y = b.position.y,
  }
end

return {
  inventory = inventory,
  observe = observe,
}

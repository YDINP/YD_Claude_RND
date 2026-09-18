-- 모두가 쓰는 것 - 숫자, 저장소, 그리고 «누가 어느 몸인가».

local RESULT_HISTORY = 128     -- completed tasks kept for polling, all agents

-- Long enough for a walk that has to re-route around terrain a few times.
local DEFAULT_TIMEOUT = 7200   -- ticks (2 minutes) before a task is abandoned

local MAX_QUEUE = 64           -- per agent; refuse work rather than grow forever

local MAX_AGENTS = 8

-- 건물 하나당 돌려주는 좌표 개수. 한 종류에 수백 개가 되는 벨트까지 전부
-- 실어보내면 한 번의 observe가 RCON 한 프레임을 통째로 먹는다.
local MAX_SPOTS = 8

local MAX_OBSERVE_RADIUS = 200 -- one observe runs inside a single tick

local PATH_ANSWER_TTL = 1800   -- ticks an uncollected path answer may linger

local CHAT_HISTORY = 50

-- Recipes the self-directed ladder reasons about. Reported with every
-- inventory so an agent can ask "can I build this yet?" instead of trying and
-- failing in a loop.
local PLANNING_RECIPES = {
  "burner-mining-drill", "iron-chest", "stone-furnace", "wooden-chest",
  "iron-gear-wheel", "transport-belt", "copper-cable", "electronic-circuit",
  "lab", "automation-science-pack", "assembling-machine-1", "inserter",
  "pipe", "boiler", "steam-engine", "offshore-pump", "small-electric-pole",
}

-- A headless server only writes back to the save it was started from when it
-- shuts down cleanly. Closing the window or killing the process loses
-- everything, and the autosaves the server settings produce go to separate
-- `_autosave` files that the next start never loads. So the world saves itself
-- over the file it came from, on a timer.
-- 헤드리스 서버는 깨끗하게 종료할 때만 세이브를 되쓴다. 그 사이에 죽으면
-- 마지막 저장 이후는 전부 사라지므로, 간격이 곧 «잃을 수 있는 시간»이다.
-- 작은 맵에서 server_save는 수백 밀리초라 1분마다 해도 눈에 띄지 않는다.
local AUTOSAVE_INTERVAL = 60 * 60       -- ticks (1 minute)

local MARKER_INTERVAL = 30   -- ticks between nametag/map-tag refreshes

local TAG_MOVE_EPSILON = 6   -- tiles an agent may drift before its map tag moves

-- Distinct enough to tell apart at a glance on a dark map.
local COLORS = {
  { r = 0.35, g = 0.80, b = 1.00 },
  { r = 1.00, g = 0.75, b = 0.25 },
  { r = 0.55, g = 1.00, b = 0.45 },
  { r = 1.00, g = 0.50, b = 0.80 },
  { r = 0.70, g = 0.60, b = 1.00 },
  { r = 1.00, g = 0.40, b = 0.35 },
  { r = 0.45, g = 0.95, b = 0.90 },
  { r = 0.90, g = 0.90, b = 0.55 },
}

--------------------------------------------------------------------- storage

local function init()
  storage.agents = storage.agents or {}
  -- Iteration order of a hash table is not something to bet a multiplayer
  -- checksum on, so the agents are driven through an explicit list.
  storage.order = storage.order or {}
  storage.results = storage.results or {}
  storage.result_order = storage.result_order or {}
  storage.paths = storage.paths or {}
  storage.chat = storage.chat or {}
  storage.next_id = storage.next_id or 1
  storage.next_index = storage.next_index or 0
end

local function agent(name)
  return storage.agents[name]
end

local function body(a)
  if a and a.char and a.char.valid then return a.char end
  return nil
end

return {
  AUTOSAVE_INTERVAL = AUTOSAVE_INTERVAL,
  CHAT_HISTORY = CHAT_HISTORY,
  COLORS = COLORS,
  DEFAULT_TIMEOUT = DEFAULT_TIMEOUT,
  MARKER_INTERVAL = MARKER_INTERVAL,
  MAX_AGENTS = MAX_AGENTS,
  MAX_OBSERVE_RADIUS = MAX_OBSERVE_RADIUS,
  MAX_QUEUE = MAX_QUEUE,
  MAX_SPOTS = MAX_SPOTS,
  PATH_ANSWER_TTL = PATH_ANSWER_TTL,
  PLANNING_RECIPES = PLANNING_RECIPES,
  RESULT_HISTORY = RESULT_HISTORY,
  TAG_MOVE_EPSILON = TAG_MOVE_EPSILON,
  agent = agent,
  body = body,
  init = init,
}

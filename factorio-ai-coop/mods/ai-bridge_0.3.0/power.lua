-- 전기 - 물가와 발전소 자리, 전선이 닿는 곳, 끊긴 데.

local Tasks = require("tasks")
local Core = require("core")
local agent = Core.agent
local body  = Core.body

-- 펌프를 세울 수 있는 물가. 「해안의 한 칸」을 주는 API 가 없어서,
-- 물 타일 둘레의 칸마다 네 방향을 시도하고 게임이 받아주는 것만 남긴다.
local function water_sites_near(surface, force, x, y, radius, wanted)
  local tiles = surface.find_tiles_filtered {
    position = { x, y }, radius = math.min(radius or 120, 200),
    name = { "water", "deepwater" }, limit = 400,
  }
  local sites, seen = {}, {}
  local directions = { defines.direction.north, defines.direction.east,
                       defines.direction.south, defines.direction.west }
  for _, tile in pairs(tiles) do
    for dx = -1, 1 do
      for dy = -1, 1 do
        local spot = { x = tile.position.x + dx + 0.5, y = tile.position.y + dy + 0.5 }
        local key = spot.x .. ":" .. spot.y
        if not seen[key] then
          seen[key] = true
          for _, direction in ipairs(directions) do
            if surface.can_place_entity {
              name = "offshore-pump", position = spot, direction = direction,
              force = force, build_check_type = defines.build_check_type.manual,
            } then
              sites[#sites + 1] = { x = spot.x, y = spot.y, direction = direction }
              break
            end
          end
        end
        if #sites >= (wanted or 3) then return sites end
      end
    end
  end
  return sites
end

---------------------------------------------------------------- 발전소 자리

-- 눈 감고 좌표를 재다가 이렇게 됐다: 펌프 둘, 보일러 하나, 기관 둘이
-- 흩어져 놓이고 파이프는 한 개도 없어서 기관이 no_input_fluid 로 서 있었다.
-- «펌프에서 축을 따라 2~7칸» 같은 어림은 맞을 때만 맞는다.
--
-- 게임은 정확히 안다. fluidbox 가 «내 관이 어느 칸으로 나가는지»를 들고
-- 있으므로, 임시로 세워 물어보고 지운 다음, 확인된 좌표만 에이전트에게
-- 넘긴다. 실제 설치는 에이전트가 자기 인벤토리로 한다 - 여기서 다 지어
-- 버리면 그건 플레이가 아니라 치트다.

local function outward(pump)
  -- 펌프의 물이 나가는 칸. 없으면 nil.
  local ok, connections = pcall(function()
    return pump.fluidbox.get_pipe_connections(1)
  end)
  if not ok or not connections then return nil end
  for _, conn in pairs(connections) do
    if conn.target_position then return conn.target_position end
  end
  return nil
end

local function unit_step(from, to)
  local dx, dy = to.x - from.x, to.y - from.y
  if math.abs(dx) >= math.abs(dy) then
    return { x = (dx >= 0) and 1 or -1, y = 0 }
  end
  return { x = 0, y = (dy >= 0) and 1 or -1 }
end

local function step_direction(step)
  if step.y < 0 then return defines.direction.north end
  if step.y > 0 then return defines.direction.south end
  if step.x > 0 then return defines.direction.east end
  return defines.direction.west
end

-- 물가 한 곳에 펌프-보일러-기관이 통째로 들어가는지 확인하고, 들어가면
-- 정확한 좌표를 돌려준다. 하나라도 안 들어가면 통째로 버린다 - 반쯤 지어진
-- 발전소는 안 지은 것보다 나쁘다.
--
-- 좌표는 실측에서 나왔다. 게임에 임시로 세워 fluidbox 의 연결구를 읽어보니:
--   펌프  : 자기 칸에서 바라보는 반대쪽 한 칸으로 물을 내보낸다.
--   보일러: 물 연결구가 중심에서 «옆구리» 양쪽 한 칸씩(축은 바라보는 방향에
--           수직), 증기 출구는 «바라보는 쪽» 두 칸 앞.
--   기관  : 증기 연결구가 중심에서 긴 축 양끝 두 칸.
-- 그래서 보일러는 펌프 출구 칸에서 한 칸 더, 기관은 보일러에서 네 칸,
-- 다음 기관은 그 앞에서 다섯 칸(기관이 5칸 길이)이다.

-- 연결구가 맞물리는지는 짐작하지 않는다. 엔티티마다 «내 관이 있는 칸»과
-- «그 관이 닿는 칸»을 게임이 들고 있으므로, 세워보고 물어본 다음 어긋나면
-- 지우고 옆 칸을 시도한다.
--
-- 이 확인이 필요한 이유: 2x3 짜리 보일러는 중심 좌표가 축마다 .0 이거나
-- .5 여야 해서, 내가 계산한 자리를 게임이 반 칸 밀어 놓는다. 그런데 나는
-- 요청한 좌표를 계획에 적고 있었다. 그래서 펌프 여섯과 보일러 넷이 서 있는
-- 채로 0와트였다.

local function ports(entity)
  local out = {}
  for box = 1, 6 do
    local ok, conns = pcall(function()
      return entity.fluidbox.get_pipe_connections(box)
    end)
    if not ok or not conns then break end
    for _, c in pairs(conns) do
      if c.position and c.target_position then
        out[#out + 1] = {
          at = { x = c.position.x, y = c.position.y },
          to = { x = c.target_position.x, y = c.target_position.y },
          flow = c.flow_direction,
        }
      end
    end
  end
  return out
end

local function same_tile(a, b)
  return math.abs(a.x - b.x) < 0.1 and math.abs(a.y - b.y) < 0.1
end

-- 두 엔티티의 연결구가 서로를 향하고 있는가.
local function meets(one, two)
  for _, p in pairs(one) do
    for _, q in pairs(two) do
      if same_tile(p.to, q.at) and same_tile(q.to, p.at) then return true end
    end
  end
  return false
end

-- 증기가 나가는 연결구가 닿는 칸. 기관은 그 칸에 관을 대야 한다.
local function steam_target(boiler_ports)
  for _, p in pairs(boiler_ports) do
    if p.flow == "output" then return p.to end
  end
  return nil
end

local DIRS = { defines.direction.north, defines.direction.east,
               defines.direction.south, defines.direction.west }

-- 어떤 칸 둘레에서 이 엔티티가 들어가고 연결구도 맞물리는 자리를 찾는다.

local function fit_against(surface, force, name, near, anchor_ports, spread)
  spread = spread or 3
  for dx = -spread, spread do
    for dy = -spread, spread do
      for _, dir in pairs(DIRS) do
        local at = { x = near.x + dx, y = near.y + dy }
        if surface.can_place_entity {
          name = name, position = at, direction = dir, force = force,
        } then
          local made = surface.create_entity {
            name = name, position = at, direction = dir, force = force,
            raise_built = false,
          }
          if made then
            local mine = ports(made)
            if meets(anchor_ports, mine) then
              return made, mine
            end
            made.destroy()
          end
        end
      end
    end
  end
  return nil
end

local function try_power_site(surface, force, site, engines)
  local temporary = {}
  local function keep(e) temporary[#temporary + 1] = e return e end
  local function sweep()
    for i = #temporary, 1, -1 do
      if temporary[i].valid then temporary[i].destroy() end
    end
    temporary = {}
  end

  local pump = surface.create_entity {
    name = "offshore-pump", position = { site.x, site.y },
    direction = site.direction, force = force, raise_built = false,
  }
  if not pump then return nil end
  keep(pump)

  local pump_ports = ports(pump)
  local water = nil
  for _, p in pairs(pump_ports) do water = p.to break end
  if not water then sweep() return nil end

  local boiler, boiler_ports = fit_against(surface, force, "boiler",
                                           water, pump_ports, 2)
  if not boiler then sweep() return nil end
  keep(boiler)

  local steam = steam_target(boiler_ports)
  if not steam then sweep() return nil end

  local plan = {
    pump = { x = pump.position.x, y = pump.position.y, direction = pump.direction },
    boiler = { x = boiler.position.x, y = boiler.position.y,
               direction = boiler.direction },
    pipes = {}, engines = {},
  }

  -- 기관은 증기가 닿는 칸에 관을 대고, 그 다음 기관은 앞 기관의 반대편
  -- 관에 잇는다. 기관끼리도 증기를 넘긴다.
  local anchor_ports, anchor_tile = boiler_ports, steam
  for _ = 1, (engines or 2) do
    local engine, engine_ports = fit_against(surface, force, "steam-engine",
                                             anchor_tile, anchor_ports, 3)
    if not engine then break end
    keep(engine)
    plan.engines[#plan.engines + 1] = {
      x = engine.position.x, y = engine.position.y, direction = engine.direction,
    }
    -- 다음 기관을 위해, 방금 세운 기관의 «반대쪽» 관이 닿는 칸으로 옮긴다.
    local next_tile = nil
    for _, p in pairs(engine_ports) do
      if not same_tile(p.at, anchor_tile) then next_tile = p.to end
    end
    if not next_tile then break end
    anchor_ports, anchor_tile = engine_ports, next_tile
  end

  sweep()
  if #plan.engines == 0 then return nil end
  return plan
end

-- 전봇대가 기계에 «닿는» 자리를 찾는다.
--
-- 실측(2026-09-18): 기관에서 일곱 칸 떨어진 곳에 전봇대를 넷 세워두고도
-- 전기가 0W 였다. 전선이 7.5칸까지 늘어나는 것은 «전봇대끼리»의 이야기고,
-- 기계가 전기를 받으려면 기계가 전봇대의 «공급 범위» 안에 들어와야 한다.
-- 작은 전봇대의 공급 범위는 5x5, 그러니까 중심에서 두 칸 반이다. 기관은
-- 3x5 라 중심에서 두 칸 반이 더 있다 - 한 걸음이면 이미 늦는다.
--
-- 계산으로 맞히는 대신 세워보고 물어본다. 붙었는지 아닌지는 게임이 안다.
local function wire_spot(name, x, y, pole)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  pole = pole or "small-electric-pole"

  local surface, force = b.surface, b.force
  local machine = surface.find_entities_filtered {
    position = { x, y }, radius = 3, force = force, limit = 8,
  }
  local target = nil
  for _, e in pairs(machine) do
    if e.type ~= "character" and e.type ~= "item-entity"
        and e.type ~= "electric-pole" then
      target = e
      break
    end
  end
  if not target then
    return { error = string.format("nothing at %.0f,%.0f", x, y) }
  end

  -- 이미 붙어 있으면 세울 이유가 없다.
  if target.electric_network_id ~= nil then
    return { already = true, x = target.position.x, y = target.position.y }
  end

  -- 가까운 자리부터 본다. 첫 번째로 붙는 곳이 가장 좋은 곳이고, 그러면
  -- 임시 전봇대를 백 번 세웠다 지우지 않아도 된다.
  local order = {}
  local REACH = 6
  for dx = -REACH, REACH do
    for dy = -REACH, REACH do
      order[#order + 1] = { dx = dx, dy = dy, d = dx * dx + dy * dy }
    end
  end
  table.sort(order, function(p, q) return p.d < q.d end)

  local best, best_d = nil, nil
  for _, off in ipairs(order) do
    local at = { x = target.position.x + off.dx, y = target.position.y + off.dy }
    if surface.can_place_entity { name = pole, position = at, force = force } then
      local probe = surface.create_entity {
        name = pole, position = at, force = force, raise_built = false,
      }
      if probe then
        local live = target.electric_network_id ~= nil
        probe.destroy()
        if live then
          best, best_d = at, math.sqrt(off.d)
          break
        end
      end
    end
  end

  if not best then
    return { error = "no spot reaches " .. target.name }
  end
  return { x = best.x, y = best.y, machine = target.name,
           distance = math.floor(best_d * 10) / 10 }
end

-- 발전소가 어디서 끊겼는지 조목조목 돌려준다.
--
-- 실측(2026-09-18, 259분째): 보일러 5 + 기관 7 + 펌프 7 을 지어놓고 0W 였다.
-- 뜯어보니 고칠 것은 네 가지뿐이었다.
--   기관 3대: 증기는 가득한데 전봇대가 없다        -> 전봇대 하나씩
--   기관 3대: 보일러와 «한 칸» 떨어져 있다         -> 파이프 하나씩
--   보일러 2대: 연료 없음                          -> 석탄
--   보일러 1대: 물 없음                            -> 펌프까지 파이프
--
-- 파이프 자리를 찾는 방법이 이 함수의 핵심이다. 안 이어진 연결구 둘이
-- «같은 칸»을 바라보고 있으면, 그 칸에 파이프 하나를 놓는 것으로 둘이
-- 이어진다. 기하를 다시 계산할 필요가 없다 - 게임이 이미 서로를 가리키고
-- 있다고 말해주고 있다.
local function power_faults(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local out = { poles = {}, pipes = {}, fuel = {}, water = {},
                bridges = {}, starved = {} }
  local open = {}   -- 안 이어진 연결구들. 키는 바라보는 칸.

  for _, e in pairs(surface.find_entities_filtered {
    force = force, name = { "boiler", "steam-engine", "offshore-pump" },
  }) do
    if e.status == defines.entity_status.not_plugged_in_electric_network then
      out.poles[#out.poles + 1] = {
        x = e.position.x, y = e.position.y, name = e.name,
        distance = math.floor(Tasks.dist(b.position, e.position)),
      }
    end
    if e.name == "boiler" then
      if e.status == defines.entity_status.no_fuel then
        out.fuel[#out.fuel + 1] = { x = e.position.x, y = e.position.y }
      elseif e.status == defines.entity_status.no_input_fluid then
        out.water[#out.water + 1] = { x = e.position.x, y = e.position.y }
      end
    end

    for box = 1, 4 do
      local ok, conns = pcall(function()
        return e.fluidbox.get_pipe_connections(box)
      end)
      if not ok or not conns then break end
      for _, c in pairs(conns) do
        if c.target == nil and c.target_position then
          local key = string.format("%.1f,%.1f", c.target_position.x,
                                    c.target_position.y)
          open[key] = open[key] or { x = c.target_position.x,
                                     y = c.target_position.y, who = {} }
          open[key].who[#open[key].who + 1] = e.name
        end
      end
    end
  end

  -- 전기망이 갈라져 있는가.
  --
  -- 실측(275분째): 기관 셋이 «working» 인데 전력은 0W 였다. 전기망이 넷으로
  -- 갈라져 있었다 - net16 에 기관 둘(1.8MW, 소비자 0), net8 에 기관 하나
  -- (0.9MW, 소비자 0), net1 과 net2 에는 랩만 있고 발전기가 없었다. 부하가
  -- 없는 기관은 0W 를 낸다. 만들지 않는 게 아니라 쓸 사람이 그 망에 없다.
  --
  -- net8 의 전봇대와 net1 의 전봇대는 10칸 떨어져 있었다. 전선은 7.5칸까지
  -- 늘어나므로 2.5칸이 모자랐고, 그래서 사이에 전봇대 하나면 이어진다.
  -- 파이프와 같은 모양의 문제다 - 닿을 뻔한 것을 닿게 만드는 일.
  local WIRE = 7.5
  local nets = {}
  for _, pole in pairs(surface.find_entities_filtered {
    force = force, type = "electric-pole",
  }) do
    local id = pole.electric_network_id
    if id then
      nets[id] = nets[id] or { poles = {}, supply = false, demand = false }
      nets[id].poles[#nets[id].poles + 1] = pole
    end
  end
  for _, e in pairs(surface.find_entities_filtered { force = force }) do
    local id = e.electric_network_id
    if id and nets[id] then
      if e.type == "generator" or e.type == "solar-panel"
          or e.type == "electric-energy-interface" then
        nets[id].supply = true
      elseif e.type ~= "electric-pole" then
        nets[id].demand = true
      end
    end
  end

  -- 전기를 만드는 망과 쓰는 망을 짝지어, 가장 가까운 전봇대 둘 사이에
  -- 한 대가 들어갈 자리가 있는지 본다.
  for from_id, from in pairs(nets) do
    if from.supply and not from.demand then
      for to_id, to in pairs(nets) do
        if to_id ~= from_id and to.demand and not to.supply then
          local best, best_d = nil, math.huge
          for _, a in pairs(from.poles) do
            for _, b in pairs(to.poles) do
              local d = Tasks.dist(a.position, b.position)
              if d < best_d then best, best_d = { a, b }, d end
            end
          end
          if best and best_d <= WIRE * 2 then
            local a, b = best[1].position, best[2].position
            local spot = nil
            for step = -2, 2 do
              for side = -2, 2 do
                local at = { x = math.floor((a.x + b.x) / 2) + step + 0.5,
                             y = math.floor((a.y + b.y) / 2) + side + 0.5 }
                if Tasks.dist(at, a) <= WIRE and Tasks.dist(at, b) <= WIRE
                    and surface.can_place_entity {
                      name = "small-electric-pole", position = at, force = force,
                    } then
                  spot = at
                  break
                end
              end
              if spot then break end
            end
            if spot then
              out.bridges[#out.bridges + 1] = {
                x = spot.x, y = spot.y,
                gap = math.floor(best_d * 10) / 10,
                distance = math.floor(Tasks.dist(b, spot)),
              }
            end
          end
        end
      end
    end
  end

  -- 둘 이상이 같은 칸을 바라보면 그 칸이 파이프 자리다.
  for _, spot in pairs(open) do
    if #spot.who >= 2 and surface.can_place_entity {
      name = "pipe", position = { spot.x, spot.y }, force = force,
    } then
      out.pipes[#out.pipes + 1] = {
        x = spot.x, y = spot.y,
        joins = table.concat(spot.who, "+"),
        distance = math.floor(Tasks.dist(b.position, spot)),
      }
    end
  end

  local function nearest(list)
    table.sort(list, function(p, q)
      return (p.distance or 0) < (q.distance or 0)
    end)
  end
  -- 전기를 먹어야 하는데 아예 전기망에 안 붙은 기계들.
  --
  -- 실측(2026-09-18): 랩 하나가 (86,18)에 서 있는데 가장 가까운 전봇대가
  -- 23타일 밖이었다. 전선을 기지 «무게중심»까지 끌어왔을 뿐, 정작 쓰는
  -- 기계가 그 안에 들어오는지는 아무도 안 봤다.
  --
  -- 소형 전봇대의 공급 범위는 5x5 이고 전선 도달은 7.5 다. 둘은 다르다 -
  -- 전봇대끼리는 7.5타일까지 손을 잡지만, 기계는 전봇대의 5x5 안에 서 있어야
  -- 먹는다. 이 저장소가 이미 한 번 틀렸던 구분이다.
  for _, e in pairs(surface.find_entities_filtered {
    force = force, type = { "lab", "assembling-machine" },
  }) do
    if e.electric_network_id == nil then
      out.starved[#out.starved + 1] = {
        name = e.name, x = e.position.x, y = e.position.y,
        distance = math.floor(Tasks.dist(b.position, e.position)),
      }
    end
  end

  local function nearest(list)
    table.sort(list, function(p, q)
      return (p.distance or 0) < (q.distance or 0)
    end)
  end
  nearest(out.poles)
  nearest(out.pipes)
  nearest(out.bridges)
  nearest(out.starved)
  return out
end

local function power_status(name)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local made, engines, running = 0, 0, 0
  for _, e in pairs(b.surface.find_entities_filtered {
    type = "generator", force = b.force,
  }) do
    engines = engines + 1
    local output = e.energy_generated_last_tick or 0
    made = made + output
    if output > 0 then running = running + 1 end
  end

  -- 발전기가 붙어 있는 망들. 「전기가 있는 망」은 이것뿐이다.
  local live = {}
  for _, g in pairs(b.surface.find_entities_filtered {
    type = "generator", force = b.force,
  }) do
    if g.electric_network_id then live[g.electric_network_id] = true end
  end

  local labs, working_labs, wired_labs = 0, 0, 0
  for _, lab in pairs(b.surface.find_entities_filtered {
    name = "lab", force = b.force,
  }) do
    labs = labs + 1
    if lab.status == defines.entity_status.working then
      working_labs = working_labs + 1
    end
    if lab.electric_network_id and live[lab.electric_network_id] then
      wired_labs = wired_labs + 1
    end
  end

  -- 배관이 다 맞았는데 전봇대가 없어서 노는 기관. 이걸 못 보고 있어서
  -- 무리가 발전소를 계속 새로 지었다 - 완성된 발전소가 두 벌 서 있는데도.
  local unplugged = nil
  for _, e in pairs(b.surface.find_entities_filtered {
    type = "generator", force = b.force,
  }) do
    if e.status == defines.entity_status.not_plugged_in_electric_network then
      unplugged = { x = e.position.x, y = e.position.y }
      break
    end
  end

  return {
    agent = name,
    generators = engines, running = running,
    watts = math.floor(made * 60),
    labs = labs, working_labs = working_labs, wired_labs = wired_labs,
    -- 「전기가 있는가」는 «발전기가 지금 돌고 있는가»가 아니라 «전기를 쓸
    -- 기계가 발전기 붙은 망에 있는가»다. 둘은 다르다.
    --
    -- 증기기관은 «쓰는 사람이 있을 때만» 돈다. 그래서 running > 0 을
    -- powered 로 쓰면 교착이 생긴다 - 랩은 전기가 있어야 과학팩을 먹고,
    -- 기관은 랩이 먹어야 돈다. 실제로 그렇게 멈춰 있었다:
    --
    --     기관 7대 전부 steam=200 만땅, running 0, 랩 셋은 「과학팩 없음」
    --
    -- 아무도 안 쓰니 아무도 안 돌고, 안 도니까 「전기가 없다」고 판단해서
    -- 과학팩을 안 만들었다.
    powered = wired_labs > 0 or running > 0,
    unplugged = unplugged,
  }
end

local function power_plan(name, x, y, radius, engines)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end

  local surface, force = b.surface, b.force
  local sites = water_sites_near(surface, force, x, y, radius or 150, 60)
  if #sites == 0 then return { error = "no water within " .. tostring(radius) .. " tiles" } end

  -- 지난 시도가 남긴 외톨이 펌프들. 보일러도 기관도 없이 해안만 차지하고
  -- 있어서 다음 시도의 자리를 막는다. 치우면 그 자리가 다시 후보가 된다.
  for _, pump in pairs(surface.find_entities_filtered {
    position = { x, y }, radius = math.min(radius or 150, 200),
    name = "offshore-pump", force = force,
  }) do
    local near = surface.find_entities_filtered {
      position = pump.position, radius = 8, name = { "boiler", "steam-engine" },
      force = force, limit = 1,
    }[1]
    if not near then pump.destroy() end
  end

  for _, site in pairs(sites) do
    local ok, plan = pcall(try_power_site, surface, force, site, engines or 2)
    if ok and plan then
      plan.distance = math.floor(Tasks.dist(b.position, { x = plan.pump.x, y = plan.pump.y }))
      return plan
    end
  end
  return { error = "no shore with room for a whole power block" }
end

-- 전기가 있는 곳에서 전기가 필요한 곳까지 얼마나 먼가.
--
-- 실측(2026-09-18): 발전소가 (-96,-70), 기지가 (77,24) 였다. 196타일이다.
-- 물이 기지에서 141타일 밖이라 발전소를 옮길 수도 없다. 그러면 답은 하나다 -
-- 전봇대를 길게 깐다. 소형 전봇대는 목재 하나와 구리선 둘이니, 196타일이면
-- 스물일곱 개, 목재 스물일곱 개다. 판금 하나보다 싸다.
local function power_reach(x, y)
  local s = game.surfaces[1]
  local f = game.forces.player
  local here = { x = x, y = y }

  -- 발전기가 붙어 있는 망만 «전기가 있는 망»이다. 전봇대끼리만 이어진
  -- 섬은 아무리 커도 전기가 없다.
  local live = {}
  for _, g in pairs(s.find_entities_filtered { type = "generator", force = f }) do
    local net = g.electric_network_id
    if net then live[net] = (live[net] or 0) + 1 end
  end

  local best, bd = nil, math.huge
  local near, nd = nil, math.huge
  for _, e in pairs(s.find_entities_filtered { type = "electric-pole", force = f }) do
    local d = Tasks.dist(here, e.position)
    if live[e.electric_network_id] then
      if d < bd then best, bd = e, d end
    elseif d < nd then
      near, nd = e, d
    end
  end
  if not best then return { powered = nil, generators = 0 } end
  return {
    powered = { x = best.position.x, y = best.position.y },
    net = best.electric_network_id,
    generators = live[best.electric_network_id],
    gap = math.floor(bd),
    island = near and { x = near.position.x, y = near.position.y,
                        gap = math.floor(nd) } or nil,
  }
end

-- 두 점 사이에 전봇대를 놓을 자리들. 전선이 닿는 간격으로.
--
-- 이미 전봇대가 선 자리는 can_place_entity 가 거절한다. 예전에는 그것을
-- 「막혔다」로 읽고 옆으로 비켜서 하나를 더 놓았다. 그래서 전봇대 마흔세
-- 개 중 스물두 쌍이 3타일 안에 붙어 섰고, 어떤 자리에는 셋이 겹쳤다.
--
-- 이미 선 전봇대는 장애물이 아니라 «이미 해둔 일»이다. 그 자리는 건너뛰고,
-- 거기서부터 다시 재야 한다.
local WIRE_STEP = 7        -- 소형 전봇대 전선 도달 7.5, 안전하게 7
local POLE_CLEAR = 4       -- 이보다 가까이에 전봇대가 있으면 놓지 않는다

local function pole_route(name, fx, fy, tx, ty, limit)
  local a = agent(name)
  local b = body(a)
  if not b then return { error = "no such agent: " .. tostring(name) } end
  local s, f = b.surface, b.force

  local goal = { x = tx, y = ty }
  local here = { x = fx, y = fy }
  local out, hops = {}, 0

  while Tasks.dist(here, goal) > WIRE_STEP do
    hops = hops + 1
    if hops > 200 then break end

    -- 이 앞에 이미 선 전봇대가 있으면 그리로 건너뛴다. 새로 놓을 일이 아니다.
    local jumped = nil
    for _, e in pairs(s.find_entities_filtered {
      position = here, radius = WIRE_STEP + 0.5, type = "electric-pole",
      force = f,
    }) do
      if Tasks.dist(e.position, goal) < Tasks.dist(here, goal) - 0.5 then
        if not jumped or Tasks.dist(e.position, goal) < Tasks.dist(jumped, goal) then
          jumped = e.position
        end
      end
    end
    if jumped then
      here = { x = jumped.x, y = jumped.y }
      goto continue
    end

    do
      local span = Tasks.dist(here, goal)
      local ux, uy = (goal.x - here.x) / span, (goal.y - here.y) / span
      local want = { x = math.floor(here.x + ux * WIRE_STEP) + 0.5,
                     y = math.floor(here.y + uy * WIRE_STEP) + 0.5 }
      local seat = nil
      for _, nudge in pairs({ { 0, 0 }, { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 },
                              { 2, 0 }, { -2, 0 }, { 0, 2 }, { 0, -2 } }) do
        local try = { x = want.x + nudge[1], y = want.y + nudge[2] }
        -- 옆에 이미 전봇대가 있는 자리는 비켜도 소용없다. 그건 겹쳐 놓는 것이다.
        local crowded = s.count_entities_filtered {
          position = try, radius = POLE_CLEAR, type = "electric-pole", force = f,
        } > 0
        if not crowded and s.can_place_entity {
          name = "small-electric-pole", position = try, force = f,
        } then
          seat = try
          break
        end
      end
      if not seat then break end
      out[#out + 1] = seat
      here = seat
      if limit and #out >= limit then break end
    end

    ::continue::
  end

  return { poles = out, done = Tasks.dist(here, goal) <= WIRE_STEP,
           left = math.floor(Tasks.dist(here, goal)) }
end

return {
  DIRS = DIRS,
  pole_route = pole_route,
  power_reach = power_reach,
  fit_against = fit_against,
  meets = meets,
  outward = outward,
  ports = ports,
  power_faults = power_faults,
  power_plan = power_plan,
  power_status = power_status,
  same_tile = same_tile,
  steam_target = steam_target,
  step_direction = step_direction,
  try_power_site = try_power_site,
  unit_step = unit_step,
  water_sites_near = water_sites_near,
  wire_spot = wire_spot,
}

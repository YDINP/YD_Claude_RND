-- 체인 감사 - «사슬이 실제로 흐르고 있는가».
--
-- 리서치(2026-09-18, github.com/clawdbotatg/factorio-agents)가 우리가 반복해
-- 겪은 것에 이름을 붙여 왔다. 두 가지다.
--
--   topology blindness
--     "models check individual entities, never the whole chain
--      (source -> belt -> inserter -> machine -> out)"
--     기계 하나하나의 상태는 보면서 «사슬이 이어져 있는가»는 아무도 안 본다.
--     우리가 채굴기 161대를 세우고도 과학팩 0개였던 이유가 정확히 이것이다.
--
--   silent killer
--     "Warnings lie: drills report 'output blocked' while the furnace IS
--      accepting - trust climbing inventory counts, not status strings."
--     상태 문자열은 거짓말을 한다. 우리도 보일러의 full_output 을 열 번쯤
--     「막혔다」로 읽었는데 실제로는 「아무도 안 가져간다」는 뜻이었다.
--
-- 그래서 이 파일은 status 를 한 번도 안 본다. 게임이 세고 있는 «누적 생산량»만
-- 본다. 숫자가 올라가면 흐르는 것이고, 안 올라가면 안 흐르는 것이다. 기계가
-- 무슨 말을 하든 상관없다.
--
-- 같은 리서치가 전한 또 하나: Claude Opus 4.1 의 실패 중 97.7%가 「게임 상태에
-- 대한 잘못된 신념」이었고 구문 오류는 0%였다. 「코드가 틀렸다」보다 「믿음이
-- 틀렸다」를 먼저 의심해야 한다. 이 감사가 그 믿음을 깨는 자리다.

local Core = require("core")
local agent = Core.agent
local body = Core.body

-- 사슬의 단. 앞 칸이 흐르는데 뒤 칸이 안 흐르면 «거기가 끊긴 데»다.
local RUNGS = {
  { key = "iron-ore", label = "철광석 캐기" },
  { key = "iron-plate", label = "철 제련" },
  { key = "copper-ore", label = "구리광석 캐기" },
  { key = "copper-plate", label = "구리 제련" },
  { key = "iron-gear-wheel", label = "기어 제작" },
  { key = "automation-science-pack", label = "빨간 과학팩" },
}

-- 2.0 과 1.1 의 이름이 다르다. 둘 다 해보고 되는 쪽을 쓴다.
local function production(force, surface)
  local ok, stats = pcall(function()
    return force.get_item_production_statistics(surface)
  end)
  if ok and stats then return stats end
  ok, stats = pcall(function() return force.item_production_statistics end)
  if ok then return stats end
  return nil
end

local function made(stats, item, window)
  if not stats then return nil end
  local ok, n = pcall(function()
    return stats.get_flow_count {
      name = item, category = "input", precision_index = window, count = true,
    }
  end)
  if ok and n then return n end
  -- 1.1 식 이름
  ok, n = pcall(function()
    return stats.get_flow_count {
      name = item, input = true, precision_index = window, count = true,
    }
  end)
  return ok and n or nil
end

local function audit(name)
  local a = agent(name)
  local b = body(a)
  local surface = b and b.surface or game.surfaces[1]
  local force = b and b.force or game.forces.player
  local stats = production(force, surface)
  if not stats then return { error = "no production statistics" } end

  local minute = defines.flow_precision_index.one_minute
  local hour = defines.flow_precision_index.one_hour
  -- 「여태 한 번이라도 만들었는가」. 사다리가 이것을 물어야 한다.
  --
  -- 지금까지는 「가방에 열 개 있는가」로 물었다. 그런데 과학팩은 랩이
  -- 먹는다. 열 개를 만들어 연구를 돌리면 가방이 다시 비고, 사다리는
  -- 그 단을 «아직 못 올랐다»고 판단한다. automation 연구가 끝났는데도
  -- 무리가 영원히 빨간 과학팩 단에 서 있던 이유가 이것이다.
  --
  -- 쓴 것은 없어져도 만든 것은 없어지지 않는다.
  -- 전체 누적은 버킷이 아니라 카운터로 묻는다. precision 버킷은 굴러가는
  -- 창이라 「여태」를 재는 도구가 아니다.
  local function ever_count(item)
    local ok, n = pcall(function() return stats.get_input_count(item) end)
    if ok and n then return n end
    ok, n = pcall(function()
      return stats.get_flow_count {
        name = item, category = "input",
        precision_index = defines.flow_precision_index.one_thousand_hours,
        count = true,
      }
    end)
    return (ok and n) or 0
  end

  local rungs, broken_at = {}, nil
  local flowed_above = true
  for _, rung in ipairs(RUNGS) do
    local per_minute = made(stats, rung.key, minute) or 0
    local per_hour = made(stats, rung.key, hour) or 0
    local ever = ever_count(rung.key)
    local flowing = per_minute > 0
    rungs[#rungs + 1] = {
      item = rung.key, label = rung.label,
      minute = math.floor(per_minute * 10) / 10,
      hour = math.floor(per_hour),
      ever = math.floor(ever),
      flowing = flowing,
    }
    -- 첫 번째로 «위는 흐르는데 여기는 안 흐르는» 칸이 끊긴 데다.
    if not broken_at and flowed_above and not flowing then
      broken_at = rung.key
    end
    flowed_above = flowing
  end

  local research = force.current_research
  return {
    rungs = rungs,
    broken_at = broken_at,
    research = research and research.name or nil,
    -- 연구가 도는가. 이것도 상태가 아니라 숫자다.
    research_progress = research and math.floor(force.research_progress * 1000) / 1000 or nil,
    techs = (function()
      local n = 0
      for _, t in pairs(force.technologies) do
        if t.researched then n = n + 1 end
      end
      return n
    end)(),
  }
end

return {
  audit = audit,
}

"""acts.lua (run25 캐릭터 조작) 를 가짜 게임 위에서 돌려 본다.

서버를 건드리지 않는다. 진짜 Lua 로 모드 파일을 읽고 (lupa), 필요한 만큼만
흉내 낸 game / surface / entity 위에서 일감을 즉시 실행 (act) 해 본다:
손이 닿는가 · 지도에 보이는가 · 놓을 수 있는가 를 제대로 거르는지.

    pip install lupa        (없으면 이 검사는 건너뛴다)
    python tests/acts_mock.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mods", "ai-bridge_0.3.0")

try:
    from lupa import LuaRuntime  # type: ignore
except ImportError:  # pragma: no cover
    print("SKIP: lupa 가 없다 (pip install lupa)")
    sys.exit(0)

MOCK = r"""
defines = {
  direction = { north = 0, northeast = 2, east = 4, southeast = 6, south = 8, southwest = 10, west = 12, northwest = 14 },
  inventory = { chest = 1, fuel = 1, turret_ammo = 1, assembling_machine_modules = 4, furnace_modules = 4,
                mining_drill_modules = 2, lab_modules = 3, beacon_modules = 1, rocket_silo_modules = 4,
                artillery_turret_ammo = 1, cargo_wagon = 1 },
  build_check_type = { script = 0, manual = 1, manual_ghost = 2 },
  rocket_silo_status = { building_rocket = 0, rocket_ready = 9 },
  shooting = { not_shooting = 0 },
}
game = { tick = 100 }
storage = { agents = {}, order = {} }

local function d(a, b) local dx, dy = a.x - b.x, a.y - b.y return math.sqrt(dx*dx + dy*dy) end

WORLD = {}
local force = { name = "player" }
local neutral = { name = "neutral" }
force.recipes = {
  ["iron-gear-wheel"] = { name = "iron-gear-wheel", enabled = true },
  ["gun-turret"] = { name = "gun-turret", enabled = true },
  ["rocket-control-unit"] = { name = "rocket-control-unit", enabled = false },
}
force.technologies = {
  a = { name = "a", researched = false, enabled = true },
  b = { name = "b", researched = false, enabled = true },
  done = { name = "done", researched = true, enabled = true },
}
force.research_queue = {}
force.current_research = nil
function force.add_research(t) table.insert(force.research_queue, t) return true end
function force.is_chunk_charted(surface, c) return c.x >= -2 and c.x <= 1 and c.y >= -2 and c.y <= 1 end

prototypes = {
  entity = {
    ["gun-turret"] = { name = "gun-turret", type = "ammo-turret", items_to_place_this = { { name = "gun-turret" } } },
    ["assembling-machine-1"] = { name = "assembling-machine-1", type = "assembling-machine",
                                  items_to_place_this = { { name = "assembling-machine-1" } },
                                  fast_replaceable_group = "assembling-machine",
                                  next_upgrade = { name = "assembling-machine-2" } },
    ["assembling-machine-2"] = { name = "assembling-machine-2", type = "assembling-machine",
                                  items_to_place_this = { { name = "assembling-machine-2" } },
                                  fast_replaceable_group = "assembling-machine" },
  },
  item = {
    ["iron-plate"] = { name = "iron-plate", type = "item", stack_size = 100 },
    ["coal"] = { name = "coal", type = "item", stack_size = 50, fuel_value = 4000000 },
    ["firearm-magazine"] = { name = "firearm-magazine", type = "ammo", stack_size = 200 },
    ["speed-module"] = { name = "speed-module", type = "module", stack_size = 50 },
  },
}
function prototypes.get_recipe_filtered(filters)
  local want = filters[1].elem_filters[1].name
  local out = {}
  if want == "gun-turret" then out["gun-turret"] = true end
  if want == "assembling-machine-2" then out["iron-gear-wheel"] = true end  -- 열렸다고 치자
  return out
end

local function matches(e, f)
  if not e.valid then return false end
  if f.name and e.name ~= f.name then return false end
  if f.ghost_name and not (e.type == "entity-ghost" and e.ghost_name == f.ghost_name) then return false end
  if f.force and e.force ~= f.force then return false end
  if f.type then
    local ok = false
    if type(f.type) == "table" then for _, t in pairs(f.type) do if e.type == t then ok = true end end
    else ok = (e.type == f.type) end
    if not ok then return false end
  end
  if f.position then
    local p = { x = f.position[1] or f.position.x, y = f.position[2] or f.position.y }
    if d(p, e.position) > (f.radius or 0.5) then return false end
  end
  if f.area then
    local a = f.area
    if e.position.x < a[1][1] or e.position.x > a[2][1] or e.position.y < a[1][2] or e.position.y > a[2][2] then return false end
  end
  return true
end

SURFACE = { name = "nauvis", blocked = {} }
function SURFACE.find_entities_filtered(f)
  local out = {}
  for _, e in ipairs(WORLD) do if matches(e, f) then out[#out + 1] = e if f.limit and #out >= f.limit then break end end end
  return out
end
function SURFACE.can_place_entity(t)
  local k = t.position[1] .. "," .. t.position[2]
  return not SURFACE.blocked[k]
end
function SURFACE.spill_item_stack(t) SURFACE.spilled = (SURFACE.spilled or 0) + t.stack.count end

function ENT(t)
  local e = t
  e.valid = true
  e.force = t.force or force
  e.direction = t.direction or 0
  if e.rotatable == nil then e.rotatable = true end
  e.prototype = t.prototype or prototypes.entity[t.name] or { name = t.name, type = t.type }
  e.bounding_box = { { e.position.x - 0.5, e.position.y - 0.5 }, { e.position.x + 0.5, e.position.y + 0.5 } }
  e.marks = 0
  function e.rotate(o) e.direction = (e.direction + ((o and o.reverse) and 12 or 4)) % 16 return true end
  function e.get_recipe() return e.recipe and { name = e.recipe } or nil end
  function e.set_recipe(r) local had = e.recipe e.recipe = r
    if had then return { { name = "iron-plate", count = 5, quality = "normal" } } end return {} end
  function e.to_be_deconstructed() return e.decon == true end
  function e.order_deconstruction(f) e.decon = true return true end
  function e.cancel_deconstruction(f) e.decon = false return true end
  function e.to_be_upgraded() return e.upg ~= nil end
  function e.order_upgrade(o) e.upg = o.target return true end
  function e.cancel_upgrade() e.upg = nil return true end
  function e.launch_rocket() e.rocket_silo_status = 0 return true end
  function e.get_inventory(i) return e.inv end
  function e.destroy() e.valid = false end
  WORLD[#WORLD + 1] = e
  return e
end

function SURFACE.create_entity(t)
  local g = ENT { name = t.name, type = t.name, ghost_name = t.inner_name, position = { x = t.position[1], y = t.position[2] },
                  direction = t.direction, force = t.force }
  return g
end

BOT = ENT { name = "character", type = "character", position = { x = 0, y = 0 } }
BOT.surface = SURFACE
BOT.reach_distance = 10
BOT.bag = {}
function BOT.can_reach_entity(e) return d(BOT.position, e.position) <= BOT.reach_distance end
function BOT.get_item_count(n) return BOT.bag[n] or 0 end
function BOT.insert(s) BOT.bag[s.name] = (BOT.bag[s.name] or 0) + s.count return s.count end
-- 캐릭터 물류 요청 (가짜)
local function sections()
  local sec = { is_manual = true, slots = {} }
  sec.filters_count = 0
  function sec.get_slot(i) return sec.slots[i] end
  function sec.set_slot(i, f) sec.slots[i] = f if i > sec.filters_count then sec.filters_count = i end end
  function sec.clear_slot(i) sec.slots[i] = nil end
  local lp = { sections = { sec } }
  function lp.add_section() lp.sections[#lp.sections + 1] = { is_manual = true, slots = {} } end
  return lp
end
BOT.lp = sections()
function BOT.get_logistic_sections() return BOT.lp end

package.path = ROOT .. "/?.lua;" .. package.path
Tasks = require("tasks")
Acts = require("acts")
A = { name = "alpha" }
function act(kind, params) return Acts.act(A, BOT, kind, params) end
"""


def main() -> int:
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.globals().ROOT = ROOT.replace("\\", "/")
    lua.execute(MOCK)
    act = lua.globals().act
    ENT = lua.globals().ENT
    fails: list[str] = []

    def table(d: dict):
        t = lua.table()
        for k, v in d.items():
            t[k] = table(v) if isinstance(v, dict) else (lua.table(*v) if isinstance(v, list) else v)
        return t

    def check(label, reply, want_ok=True, contains=None):
        err = reply["error"] if reply is not None else "nil"
        ok = err is None
        good = ok == want_ok and (contains is None or (err and contains in err))
        print(f"  [{'ok' if good else 'FAIL'}] {label}: {'done' if ok else err}")
        if not good:
            fails.append(label)
        return reply

    near = ENT(table({"name": "assembling-machine-1", "type": "assembling-machine", "position": {"x": 3, "y": 0}}))
    far = ENT(table({"name": "assembling-machine-1", "type": "assembling-machine", "position": {"x": 40, "y": 0}}))
    near.recipe = "iron-gear-wheel"

    check("set_recipe 닿는 곳", act("set_recipe", table({"x": 3, "y": 0, "recipe": "gun-turret"})))
    if lua.globals().BOT.bag["iron-plate"] != 5:
        fails.append("set_recipe 가 빠진 재료를 가방에 안 넣음")
    check("set_recipe 먼 곳 (act 는 걷지 않는다)", act("set_recipe", table({"x": 40, "y": 0, "recipe": "gun-turret"})),
          False, "out of reach")
    check("set_recipe 안 열린 레시피", act("set_recipe", table({"x": 3, "y": 0, "recipe": "rocket-control-unit"})),
          False, "not researched")
    _ = far

    r = check("rotate 방향 맞추기", act("rotate", table({"x": 3, "y": 0, "direction": 8})))
    if r["direction"] != 8:
        fails.append("rotate 방향")

    check("set_requests 자기 몸", act("set_requests", table({"target": "self", "requests": {"iron-plate": 100, "coal": 50}})))
    lp = lua.globals().BOT.lp.sections[1]
    names = sorted(lp.slots[i].value.name for i in (1, 2))
    if names != ["coal", "iron-plate"]:
        fails.append(f"set_requests 칸 {names}")
    check("set_requests merge 로 지우기", act("set_requests", table({"target": "self", "mode": "merge", "requests": {"coal": 0}})))

    check("place_ghost 지도 안", act("place_ghost", table({"name": "gun-turret", "x": 10.5, "y": 10.5,
                                                          "items": {"firearm-magazine": 20}})))
    check("place_ghost 같은 자리 두 번 = already", act("place_ghost", table({"name": "gun-turret", "x": 10.5, "y": 10.5})))
    check("place_ghost 안개 속", act("place_ghost", table({"name": "gun-turret", "x": 500.5, "y": 10.5})),
          False, "uncharted")
    lua.execute('SURFACE.blocked["12.5,10.5"] = true')
    check("place_ghost 못 놓는 자리", act("place_ghost", table({"name": "gun-turret", "x": 12.5, "y": 10.5})),
          False, "blocked")

    tree = ENT(table({"name": "tree-01", "type": "tree", "position": {"x": 5, "y": 5}}))
    tree.force = lua.eval("{ name = 'neutral' }")
    tree.minable = True
    check("deconstruct_mark 나무", act("deconstruct_mark", table({"x": 5, "y": 5})))
    check("deconstruct_mark 유령 지우기", act("deconstruct_mark", table({"x": 10.5, "y": 10.5, "ghosts": True,
                                                                       "name": "gun-turret"})))
    check("유령 지운 뒤 다시 지우기", act("deconstruct_mark", table({"x": 10.5, "y": 10.5, "ghosts": True})),
          False, "no ghost")
    check("upgrade_mark 조립기 1→2", act("upgrade_mark", table({"x": 3, "y": 0, "target": "assembling-machine-2"})))

    check("research add", act("research", table({"name": "a"})))
    r = check("research front", act("research", table({"name": "b", "mode": "front"})))
    if r["queue"][1] != "b":
        fails.append("research front 순서")
    check("research 이미 끝난 것", act("research", table({"name": "done"})), False, "already")

    silo = ENT(table({"name": "rocket-silo", "type": "rocket-silo", "position": {"x": 2, "y": 2}}))
    silo.rocket_silo_status = 0
    check("launch_rocket 준비 안 됨", act("launch_rocket", table({"x": 2, "y": 2})), False, "not ready")
    silo.rocket_silo_status = 9
    check("launch_rocket 발사", act("launch_rocket", table({"x": 2, "y": 2})))

    check("모르는 act", act("teleport", table({})), False, "act supports")

    print(f"\n{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass
    sys.exit(main())

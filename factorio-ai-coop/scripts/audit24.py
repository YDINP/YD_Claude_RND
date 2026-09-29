"""run24 기지 상태 감사 - 전력 망 · no_power · 상태별 건물 수 (읽기 전용)."""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'bridge'))
from client import AIBridge

LUA = r"""(function()
local s=game.surfaces[1]; local f=game.forces.player
local st={} for k,v in pairs(defines.entity_status) do st[v]=k end
local out={count={},nopower={},nets={},by={}}
local types={'inserter','assembling-machine','furnace','mining-drill','lab','boiler','generator','electric-pole'}
for _,e in pairs(s.find_entities_filtered{force=f,type=types}) do
  local t=e.type
  if t=='electric-pole' then
    local id=e.electric_network_id or -1
    out.nets[tostring(id)]=(out.nets[tostring(id)] or 0)+1
  else
    local k=st[e.status] or tostring(e.status)
    local key=e.name..'|'..k
    out.count[key]=(out.count[key] or 0)+1
    if k=='no_power' then out.nopower[#out.nopower+1]={e.name,e.position.x,e.position.y} end
    if k=='no_minable_resources' or k=='no_ingredients' or k=='full_output' or k=='item_ingredient_shortage' or k=='missing_science_packs' then
      local cx=math.floor(e.position.x/32); local cy=math.floor(e.position.y/32)
      local r=(e.type=='assembling-machine' or e.type=='furnace') and e.get_recipe and e.get_recipe() and e.get_recipe().name or ''
      local bk=k..'|'..e.name..'|'..r..'|'..cx..','..cy
      out.by[bk]=(out.by[bk] or 0)+1
    end
  end
end
out.ghosts=#s.find_entities_filtered{force=f,type='entity-ghost',ghost_name='small-electric-pole'}
return out end)()"""

def main():
    b = AIBridge()
    r = b.lua(LUA)
    if '--raw' in sys.argv:
        print(json.dumps(r, ensure_ascii=False)); return
    print('nets', r['nets'], 'small-pole ghosts', r['ghosts'])
    print('no_power', r['nopower'])
    agg = {}
    for k, v in r['count'].items():
        n, s = k.split('|'); agg[s] = agg.get(s, 0) + v
    print('status', dict(sorted(agg.items(), key=lambda x: -x[1])))
    want = ['electric-mining-drill|no_minable_resources', 'steel-furnace|no_ingredients', 'steel-furnace|full_output',
            'electric-mining-drill|waiting_for_space_in_destination', 'assembling-machine-1|full_output', 'assembling-machine-2|full_output',
            'assembling-machine-1|item_ingredient_shortage', 'assembling-machine-2|item_ingredient_shortage',
            'inserter|waiting_for_space_in_destination', 'fast-inserter|waiting_for_space_in_destination', 'long-handed-inserter|waiting_for_space_in_destination',
            'steam-engine|no_input_fluid', 'boiler|no_fuel', 'lab|missing_science_packs']
    for w in want: print(' ', w, r['count'].get(w, 0))
    if '--by' in sys.argv:
        for k, v in sorted(r['by'].items()): print('   ', k, v)

if __name__ == '__main__':
    main()

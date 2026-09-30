"""Run 24: 탄 · 과학 철 저울 (ammo/science iron balancer).

17:0x 망 피어싱 ~1,500 인데 톱니 · 빨강 · 초록 10분 0, 연구소 0/18 - 망 철이 들어오는 족족 탄 요청 (요청 상자 넷 철 100 · ammo24 로봇 먹이 남김 0) 이 먼저 가져간다.

저울 (게임 안 조건 먼저, Lua 아이템 이동 0):
  1) 탄 블록 (ammoplus 둘 · ammoplus2 둘) 의 «철 요청 상자 → 노랑 조립기» 빠른 팔 넷에 **망 조건** «piercing-rounds-magazine < ON (800)».
     망 피어싱이 800 이상이면 팔이 서고 → 노랑이 안 만들어지고 → 요청 상자가 100 에서 차 더는 철을 안 부른다. 800 밑이면 저절로 다시.
     (게임 망 조건은 문턱 하나 - 800 근처에서 몇 판씩 오르내림. 피어싱 조립기에 이미 든 노랑 · 결과 상자가 있어 떨어지는 폭은 작다.)
  2) ammo24 로봇 먹이 (노랑 조립기 셋 철, 남김 0) - 같은 저울을 Python 이력 (hysteresis) 으로: 피어싱 ≥ 800 이면 멈춤, < 500 이면 다시.
     단 포탑 노랑 조립기 (-53.5,3.5) 는 망 노랑 < 200 이면 멈추지 않는다 (포탑 노랑 몫).
  3) robofeed24 - 멈춘 동안 과학 철 (SCI_IRON_KEEP 100 → 0) · 톱니 4 철 (600 → 0) · 빨강 · 초록 톱니 (200 → 0) 를 먼저.

    python scripts/ironbal24.py            # 상태
    python scripts/ironbal24.py --apply    # 팔 넷에 망 조건
    python scripts/ironbal24.py --off      # 조건 끔 (되돌리기)
"""
import argparse, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
from client import AIBridge  # noqa

PRC = "piercing-rounds-magazine"
ON, OFF, YELLOW_MIN = 800, 500, 200          # 탄 멈춤 문턱 · 다시 문턱 · 포탑 노랑 몫
# 철 요청 상자 → 빠른 팔 → 노랑 조립기 (결과 노랑은 피어싱 조립기로만)
INSERTERS = [(28.5, -6.5), (41.5, -6.5), (30.5, -49.5), (30.5, -58.5)]

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local A = helpers.json_to_table('%s')
  local n = s.find_logistic_network_by_position({66.5, -15.5}, f)
  local o = {tick = game.tick, ins = {}}
  for _, p in pairs(A.ins) do
    local i = s.find_entities_filtered{type = 'inserter', force = f, position = p, radius = 0.3}[1]
    if not i then o.ins[#o.ins + 1] = 'miss ' .. p[1] .. ',' .. p[2]
    else
      if A.mode == 'apply' then
        local cb = i.get_or_create_control_behavior()
        cb.connect_to_logistic_network = true
        cb.logistic_condition = {first_signal = {type = 'item', name = A.prc}, comparator = '<', constant = A.on}
      elseif A.mode == 'off' then
        local cb = i.get_control_behavior()
        if cb then cb.connect_to_logistic_network = false end
      end
      local cb = i.get_control_behavior()
      local on = cb and cb.connect_to_logistic_network
      o.ins[#o.ins + 1] = string.format('%%.1f,%%.1f cond=%%s disabled=%%s', i.position.x, i.position.y, tostring(on), tostring(cb and cb.disabled))
    end
  end
  if n then
    o.net = {pierce = n.get_item_count(A.prc), yellow = n.get_item_count('firearm-magazine'), iron = n.get_item_count('iron-plate'),
             gear = n.get_item_count('iron-gear-wheel')}
  end
  local st = f.get_item_production_statistics(s)
  o.p10, o.p1 = {}, {}
  for _, k in pairs({'iron-gear-wheel', 'automation-science-pack', 'logistic-science-pack', 'chemical-science-pack', 'military-science-pack', A.prc, 'firearm-magazine'}) do
    o.p10[k] = math.floor(st.get_flow_count{name = k, category = 'input', precision_index = defines.flow_precision_index.ten_minutes, count = true})
    o.p1[k] = math.floor(st.get_flow_count{name = k, category = 'input', precision_index = defines.flow_precision_index.one_minute, count = true})
  end
  local w, labs = 0, s.find_entities_filtered{type = 'lab', force = f}
  for _, l in pairs(labs) do if l.status == defines.entity_status.working then w = w + 1 end end
  o.labs = w .. '/' .. #labs
  o.research = f.current_research and (f.current_research.name .. ' ' .. string.format('%%.1f', f.research_progress * 100)) or '-'
  return o
end)()"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--off", action="store_true")
    a = ap.parse_args()
    mode = "apply" if a.apply else ("off" if a.off else "status")
    arg = json.dumps({"ins": [list(p) for p in INSERTERS], "mode": mode, "prc": PRC, "on": ON})
    r = AIBridge().lua(LUA % arg)
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""사용자 건설 감시 - 사람(관찰자)이 놓은 유령·건물·해체 표시를 찾아 주변 맥락과 함께 한 줄로 알린다.

사용자 (2026-09-27): "나도 건설을 요청할 수 있도록 해줘. 내가 건설하면 왜 했는지 체크하고 어떤 영향이 있는지 분석".
사람은 god 컨트롤러 (몸 없음 - 적에게 안전)로 유령 / 청사진 / 해체 계획을 놓고, 로봇이 망 재고로 짓는다.
이 스크립트는 그 흔적 (entity.last_user == 사람) 을 60초마다 찾아, 새로 생긴 것만 맥락과 함께 찍는다
(조정자가 Monitor 로 받아 의도·영향을 분석한다).

맥락: 가장 가까운 조립기 레시피·화로, 3칸 안 벨트 내용, 팔의 집는 곳/놓는 곳, 로봇망 안 여부, 망 재고, 근처 포탑·적.

    python -u scripts/userbuild23.py                 # 상주 (기본 사람 = Guiltyring)
    python -u scripts/userbuild23.py --once
"""
import argparse
import json
import os
import sys
import time

sys.path[:0] = [os.path.join(os.path.dirname(__file__), "..", "bridge")]
from client import AIBridge  # noqa: E402

SCAN = """(function() local s = game.surfaces[1] local who = '%s' local o = {e = {}, d = {}}
  local function ctx(pos)
    local c = {}
    local a = s.find_entities_filtered{type = {'assembling-machine', 'furnace'}, position = pos, radius = 6, limit = 3}
    local rs = {} for _, m in pairs(a) do local r = m.get_recipe() rs[#rs + 1] = m.name .. ':' .. (r and r.name or '-') end
    c.near = table.concat(rs, ',')
    local bs = {} for _, b in pairs(s.find_entities_filtered{type = {'transport-belt', 'underground-belt', 'splitter'}, position = pos, radius = 3, limit = 4}) do
      local t = {} for l = 1, 2 do for _, it in pairs(b.get_transport_line(l).get_contents()) do t[#t + 1] = it.name end end
      bs[#bs + 1] = table.concat(t, '/') end
    c.belts = table.concat(bs, ',')
    local net = s.find_logistic_network_by_position(pos, 'player') c.net = net and 1 or 0
    c.turrets = s.count_entities_filtered{name = 'gun-turret', force = 'player', position = pos, radius = 20}
    c.enemy = s.count_entities_filtered{force = 'enemy', position = pos, radius = 40}
    return c
  end
  for _, e in pairs(s.find_entities_filtered{force = 'player'}) do
    local u = e.last_user
    if u and u.name == who and e.unit_number then
      local name = e.type == 'entity-ghost' and ('ghost:' .. e.ghost_name) or e.name
      local r = {id = e.unit_number, name = name, x = e.position.x, y = e.position.y, dir = e.direction}
      if e.type == 'inserter' then
        r.pick = e.pickup_target and e.pickup_target.name or '-' r.drop = e.drop_target and e.drop_target.name or '-' end
      if e.type == 'assembling-machine' then local rc = e.get_recipe() r.recipe = rc and rc.name or '-' end
      if e.type == 'entity-ghost' and e.ghost_type == 'assembling-machine' then local ok, rc = pcall(function() return e.get_recipe() end) r.recipe = ok and rc and rc.name or '-' end
      r.ctx = ctx(e.position)
      o.e[#o.e + 1] = r
    end
    if e.to_be_deconstructed() and e.unit_number then o.d[#o.d + 1] = {id = e.unit_number, name = e.name, x = e.position.x, y = e.position.y} end
  end
  return o end)()"""


def rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="Guiltyring")
    ap.add_argument("--every", type=float, default=60)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = AIBridge()
    seen, dseen, first = set(), set(), True
    while True:
        try:
            r = ai.lua(SCAN % a.who)
            now = time.strftime("%H:%M:%S")
            for e in rows(r.get("e")):
                if e["id"] in seen:
                    continue
                seen.add(e["id"])
                if not first:
                    print(f"{now} 사용자 건설: {json.dumps(e, ensure_ascii=False)}", flush=True)
            d_now = {d["id"]: d for d in rows(r.get("d"))}
            new_d = [d for i, d in d_now.items() if i not in dseen]
            dseen = set(d_now)
            if new_d and not first:
                # 해체 표시는 누가 했는지 API 로 알 수 없다 - 에이전트(drillclean 등)의 것도 섞인다
                print(f"{now} 해체 표시 (누가 했는지 모름): {json.dumps(new_d[:20], ensure_ascii=False)}", flush=True)
            if first:
                print(f"{now} userbuild: 시작 - 기존 사용자 흔적 {len(seen)} 개는 건너뜀", flush=True)
            first = False
        except Exception as e:  # noqa: BLE001
            print(f"userbuild: {type(e).__name__}: {e}"[:200], flush=True)
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

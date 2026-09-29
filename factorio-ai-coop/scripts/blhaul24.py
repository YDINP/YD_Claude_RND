"""Run 24 P7: 파랑 블록 (logi24 bl) 의 강철 · 황 · 플라스틱 상자를 사람 손으로 채운다 (허용된 방식: 캐릭터가 들고 간다).

허브 (강철은 허브 동쪽 끝 벨트 상자 74.5/75.5) 에서 꺼내 상자마다 목표량까지. 허브에 남길 몫 (KEEP) 밑으로는 안 꺼낸다.
나중에 벨트로 바꾸면 이 고리는 뺀다.

    python scripts/blhaul24.py --run run24 --who delta --once
    python scripts/blhaul24.py --run run24 --who delta --every 300
"""
import argparse, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge")); sys.path.insert(0, HERE)
import runsite  # noqa
import detached  # noqa
from client import AIBridge, RconError  # noqa
from orders import submit  # noqa

# (x, y, 품목, 목표) - logi24.bl 의 상자 자리
CHESTS = [(35.5, 17.5, "steel-plate", 150), (43.5, 17.5, "steel-plate", 150), (51.5, 17.5, "steel-plate", 150),
          (23.5, 17.5, "sulfur", 60), (27.5, 17.5, "sulfur", 60), (23.5, 32.5, "sulfur", 60), (27.5, 32.5, "sulfur", 60),
          (39.5, 32.5, "plastic-bar", 300), (47.5, 32.5, "plastic-bar", 300)]
CHESTS += [(x, y + 16, it, goal) for x, y, it, goal in CHESTS]          # 모듈 둘째 (logi24 bl2, dy 16)
KEEP = {"steel-plate": 150, "sulfur": 100, "plastic-bar": 100}   # 03:3x 플라스틱 200 → 100 (bl1 고급회로 플라스틱 0)
SRC_BOX = [[62.5, -16.1], [76.1, -14.9]]
# 04:0x relay M3 걷기: 화학 결과 공급 상자 (logi24 chemout) 도 출처 - 플라스틱 (-106.5,10.5) · 황 (-101.5,10.5) · 황 (-75.5,1.5)
EXTRA_SRC = [[-106.5, 10.5], [-101.5, 10.5], [-75.5, 1.5]]

LUA = """(function()
  local s, f = game.surfaces[1], game.forces.player
  local out = {have = {}, src = {}}
  for i, c in pairs(helpers.json_to_table('%s')) do
    local e = s.find_entities_filtered{name = "iron-chest", force = f, position = {c[1], c[2]}, radius = 0.3}[1]
    out.have[i] = e and e.get_inventory(defines.inventory.chest).get_item_count(c[3]) or -1
  end
  local srcs = s.find_entities_filtered{type = {"container", "logistic-container"}, force = f, area = %s}
  for _, p in pairs(helpers.json_to_table('%s')) do
    local c = s.find_entities_filtered{type = "logistic-container", force = f, position = p, radius = 0.3}[1]
    if c then srcs[#srcs + 1] = c end
  end
  for _, e in pairs(srcs) do
    local inv = e.get_inventory(defines.inventory.chest)
    for _, it in pairs({"steel-plate", "sulfur", "plastic-bar"}) do
      local n = inv.get_item_count(it)
      if n > 0 then out.src[#out.src + 1] = {e.position.x, e.position.y, it, n} end
    end
  end
  return out
end)()"""


def once(ai, who) -> dict:
    r = ai.lua(LUA % (json.dumps(CHESTS), json.dumps(SRC_BOX).replace("[", "{").replace("]", "}"), json.dumps(EXTRA_SRC)))
    have = r.get("have") or {}
    have = [have[str(i + 1)] if isinstance(have, dict) else have[i] for i in range(len(CHESTS))]
    short = {}
    for (x, y, it, goal), h in zip(CHESTS, have):
        if h >= 0 and h < goal * 0.5:
            short.setdefault(it, []).append((x, y, goal - h))
    if not short:
        return {"ok": "full"}
    src = r.get("src") or []
    src = list(src.values()) if isinstance(src, dict) else src
    plan, carry = [], {}
    for it, lst in short.items():
        want = sum(n for _, _, n in lst)
        total = sum(s[3] for s in src if s[2] == it)
        can = max(0, min(want, total - KEEP.get(it, 0)))
        for sx, sy, sit, n in sorted([s for s in src if s[2] == it], key=lambda s: -s[3]):
            if can <= 0:
                break
            k = min(can, n)
            plan += [("walk_to", {"x": sx, "y": sy + 1.5}), ("take", {"name": it, "x": sx, "y": sy, "count": k})]
            carry[it] = carry.get(it, 0) + k
            can -= k
    for it, lst in short.items():
        for x, y, n in lst:
            k = min(n, carry.get(it, 0))
            if k <= 0:
                continue
            plan += [("walk_to", {"x": x + 1.5, "y": y}), ("insert", {"name": it, "x": x, "y": y, "count": k})]
            carry[it] -= k
    if not plan:
        return {"short": short, "hub": "empty"}
    plan.append(("walk_to", {"x": 66.5, "y": -20.5}))
    submit(ai, who, plan[:60], strict=False)
    return {"short": {k: sum(n for _, _, n in v) for k, v in short.items()}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="delta")
    ap.add_argument("--every", type=int, default=300)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    ai = None
    while True:
        try:
            ai = ai or AIBridge()
            body = [b for b in ai.list() if b["name"] == a.who]
            if body and not body[0].get("queued"):
                print(time.strftime("%H:%M:%S"), once(ai, a.who), flush=True)
        except (RconError, OSError) as e:
            print(time.strftime("%H:%M:%S"), "오류", e, flush=True)
            ai = None
        if a.once:
            return 0
        time.sleep(a.every)


if __name__ == "__main__":
    raise SystemExit(main())

"""Keep the labs fed with a goal they can actually eat.

실측(21회차): 연구 큐에 «defender» 가 걸려 있었다. 군용 팩이 드는 기술이라
빨강·녹색만 있는 연구소 열셋이 전부 missing_science_packs 로 놀았다. 팩은
넉넉히 오는데 «먹을 수 있는 목표»가 없었다.

    큐를 «지금 만드는 팩만으로 되는» 기술로 채운다. 못 먹는 것은 큐에서 뺀다.

순서는 교리대로 - 방어(포탑 위력·연사)와 물류(철도·차)를 앞에, 나머지는
게임이 주는 순서대로. 이미 한 것, 전제가 안 된 것, 다른 팩이 드는 것은 뺀다.

    python scripts/research.py            # 큐만 본다
    python scripts/research.py --fix      # 못 먹는 것을 빼고 셋을 채운다
    python scripts/research.py --fix --every 300
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402

PACKS = ("automation-science-pack", "logistic-science-pack")
# 앞쪽부터. 여기 없는 것은 뒤에 게임 순서대로 붙는다.
DOCTRINE = (
    "military-science-pack",
    "physical-projectile-damage-1", "weapon-shooting-speed-1",
    "physical-projectile-damage-2", "weapon-shooting-speed-2",
    "gate", "railway", "automobilism", "steel-axe", "toolbelt",
    "fluid-handling", "oil-processing", "circuit-network", "electric-energy-distribution-1",
    "advanced-material-processing", "engine", "logistics-2",
)
KEEP = 3


def _rows(v):
    return list(v.values()) if isinstance(v, dict) else list(v or [])


def survey(ai) -> dict:
    """큐, 먹을 수 있는 후보, 못 먹는 큐 항목."""
    packs = ",".join(PACKS)
    reply = ai.lua("""(function()
      local f = game.forces.player
      local ok = {}
      for bit in string.gmatch("%s", "[^,]+") do ok[bit] = true end
      local function eatable(t)
        for _, u in pairs(t.research_unit_ingredients) do
          if not ok[u.name] then return false end
        end
        return true
      end
      local queue, bad = {}, {}
      for _, t in pairs(f.research_queue) do
        queue[#queue+1] = t.name
        if not eatable(t) then bad[#bad+1] = t.name end
      end
      local can = {}
      for name, t in pairs(f.technologies) do
        if t.enabled and not t.researched and eatable(t) then
          local pre = true
          for _, p in pairs(t.prerequisites) do if not p.researched then pre = false end end
          if pre then can[#can+1] = name .. "|" .. t.research_unit_count end
        end
      end
      table.sort(can)
      return { queue = queue, bad = bad, can = can }
    end)()""" % packs)
    can = []
    for row in _rows(reply.get("can")):
        name, units = str(row).split("|")
        can.append((name, int(float(units))))
    return {"queue": _rows(reply.get("queue")), "bad": _rows(reply.get("bad")), "can": can}


def ordered(can) -> list:
    rank = {n: i for i, n in enumerate(DOCTRINE)}
    return sorted(can, key=lambda r: (rank.get(r[0], len(DOCTRINE)), r[1]))


def fix(ai) -> list:
    """못 먹는 것을 빼고 KEEP 개까지 채운다. 한 일의 목록을 돌려준다."""
    got = survey(ai)
    done = []
    if got["bad"]:
        packed = ",".join(got["bad"])
        ai.lua("""(function()
          local f = game.forces.player
          local drop = {}
          for bit in string.gmatch("%s", "[^,]+") do drop[bit] = true end
          local keep = {}
          for _, t in pairs(f.research_queue) do if not drop[t.name] then keep[#keep+1] = t.name end end
          f.research_queue = keep
          return { n = #keep }
        end)()""" % packed)
        done.append("뺌: " + ", ".join(got["bad"]))
        got = survey(ai)
    queue = list(got["queue"])
    for name, _units in ordered(got["can"]):
        if len(queue) >= KEEP:
            break
        if name in queue:
            continue
        reply = ai.research(name)
        if reply.get("queued"):
            queue.append(name)
            done.append("넣음: " + name)
    return done


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--every", type=float, default=0)
    args = ap.parse_args()
    ai = AIBridge()
    while True:
        try:
            got = survey(ai)
            print(f"  큐 {got['queue'] or '없음'}"
                  + (f" · 못 먹는 것 {got['bad']}" if got["bad"] else ""))
            print("  먹을 수 있는 것: " + ", ".join(f"{n}({u})" for n, u in ordered(got["can"])[:8]))
            if args.fix:
                for line in fix(ai):
                    print("  " + line)
        except RconError as exc:
            print("  [!]", exc)
        if not args.every:
            return 0
        time.sleep(args.every)


if __name__ == "__main__":
    raise SystemExit(main())

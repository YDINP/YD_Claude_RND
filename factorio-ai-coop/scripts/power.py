"""More drills need more steam. Add a boiler module before the lights dim.

전기 채굴기 한 대는 90 kW 다. 보일러 하나(1.8 MW)로 열여덟 대 남짓이고,
연구소 둘이 그 중 120 kW 를 먼저 가져간다. 21회차에 열세 대를 세우고 나니
남은 것이 400 kW 였다 - 다음 여섯 대를 세우면 «전부» 느려진다. 정전은
한 대가 서는 것이 아니라 모두가 같이 느려지는 것이라 알아채기가 늦다.

    부하가 이만큼 차면 (LOAD) 모듈 하나를 더 놓는다.

모듈 하나 = 보일러 1 + 증기기관 2. 물은 앞 보일러에서 관으로 이어 받고,
석탄은 보일러 간선에 분배기를 물려 가지를 낸다. 자리는 미리 잰 것을
적어 둔다 - 물길과 석탄길이 모두 닿는 자리는 손으로 재는 편이 확실하다.

    python scripts/power.py                 # 부하만 본다
    python scripts/power.py --who charlie   # 차면 모듈을 놓는다
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge, RconError  # noqa: E402
from orders import submit               # noqa: E402

LOAD = 0.7                # 이 비율을 넘으면 늘린다
ENGINE_W = 900_000        # 증기기관 한 대, W

# 모듈 자리. 순서대로 채운다. 각 단계는 (동작, 인자) 그대로 계획이 된다.
# 2호: 1호 보일러(55.5,-34) 서쪽. 물은 관 세 개로, 석탄은 간선 기둥 x=53 에
#      분배기를 물려 서쪽 가지 (52..50, -32) 로.
MODULES = (
    {
        "name": "2호",
        "probe": ("steam-engine", 49.5, -37.5),       # 이것이 서 있으면 지은 것
        "stand": (47.0, -31.0),
        "steps": (
            ("build", {"name": "pipe", "x": 53.5, "y": -33.5}),
            ("build", {"name": "pipe", "x": 52.5, "y": -33.5}),
            ("build", {"name": "pipe", "x": 51.5, "y": -33.5}),
            ("build", {"name": "boiler", "x": 49.5, "y": -34.0, "direction": 0}),
            ("build", {"name": "steam-engine", "x": 49.5, "y": -37.5, "direction": 0}),
            ("build", {"name": "steam-engine", "x": 49.5, "y": -42.5, "direction": 0}),
            # demolish 는 반지름 1.5 안에서 «먼저 찾은» 것을 걷는다. 벨트가
            # 줄지어 선 데서는 옆 칸을 걷는다 - 21회차에 보일러 석탄길이 그렇게
            # 끊겼다. 반지름을 좁혀 그 칸만 가리킨다.
            ("demolish", {"x": 53.5, "y": -30.5, "name": "transport-belt",
                          "search_radius": 0.4}),
            ("build", {"name": "splitter", "x": 53.0, "y": -30.5, "direction": 0}),
            ("build", {"name": "transport-belt", "x": 52.5, "y": -31.5, "direction": 12}),
            ("build", {"name": "transport-belt", "x": 51.5, "y": -31.5, "direction": 12}),
            ("build", {"name": "transport-belt", "x": 50.5, "y": -31.5, "direction": 12}),
            ("build", {"name": "burner-inserter", "x": 50.5, "y": -32.5, "direction": 8}),
            ("insert", {"name": "coal", "x": 50.5, "y": -32.5, "count": 5}),
            ("insert", {"name": "coal", "x": 49.5, "y": -34.0, "count": 20}),
        ),
        # 관은 맨 뒤다. 보일러와 증기기관이 관을 «재료로» 먹는다 - 먼저
        # 만들어 두면 그 조합에 들어가 버리고 놓을 관이 없다.
        "kit": {"boiler": 1, "steam-engine": 2, "splitter": 1,
                "transport-belt": 3, "burner-inserter": 1, "pipe": 3},
    },
)


def load(ai) -> dict:
    """발전 능력 대비 지금 쓰는 비율. 증기기관 수와 분당 흐름으로 잰다."""
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      local engines = s.count_entities_filtered{name = "steam-engine", force = f}
      local pole = s.find_entities_filtered{type = "electric-pole", force = f, limit = 1}[1]
      if not pole then return { engines = engines, used = 0 } end
      local st = pole.electric_network_statistics
      local used = 0
      for name, _ in pairs(st.input_counts) do
        used = used + st.get_flow_count{name = name, category = "input",
                 precision_index = defines.flow_precision_index.one_minute}
      end
      return { engines = engines, used = used }
    end)()""")


def built(ai, module) -> bool:
    name, x, y = module["probe"]
    return bool(ai.lua("""(function()
      return { n = game.surfaces[1].count_entities_filtered{name = "%s",
                 force = game.forces.player, area = {{%f, %f}, {%f, %f}}} }
    end)()""" % (name, x - 0.5, y - 0.5, x + 0.5, y + 0.5))["n"])


def add(ai, who, module) -> None:
    try:
        bag = ai.agent(who).items()
    except RconError:
        bag = {}
    plan = []
    for item, n in module["kit"].items():
        short = n - int(bag.get(item, 0))
        if short > 0:
            plan.append(("craft", {"recipe": item, "count": short, "wait": True}))
    sx, sy = module["stand"]
    plan.append(("walk_to", {"x": sx, "y": sy}))
    plan.extend(module["steps"])
    submit(ai, who, plan, strict=False)
    print(f"{who}: 발전 {module['name']} 모듈 (보일러 1 + 증기기관 2)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--who", default="")
    ap.add_argument("--force", action="store_true", help="부하와 상관없이 놓는다")
    args = ap.parse_args()

    ai = AIBridge()
    got = load(ai)
    engines = int(got["engines"])
    # 통계는 «틱당 J»를 분 단위로 평균한 값이다. 60 을 곱해 W 로 본다.
    used_w = float(got["used"]) * 60
    cap_w = engines * ENGINE_W
    ratio = used_w / cap_w if cap_w else 1.0
    print(f"  증기기관 {engines}대 = {cap_w / 1e6:.1f} MW · 쓰는 것 {used_w / 1e6:.2f} MW"
          f" ({ratio:.0%})")
    if ratio < LOAD and not args.force:
        print("  아직 넉넉하다")
        return 0
    todo = [m for m in MODULES if not built(ai, m)]
    if not todo:
        print("  [!] 적어 둔 자리를 다 썼다 - 다음 모듈 자리를 재서 적어야 한다")
        return 0
    if args.who:
        add(ai, args.who, todo[0])
    else:
        print(f"  {todo[0]['name']} 모듈을 놓을 차례 (--who 로 시킨다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

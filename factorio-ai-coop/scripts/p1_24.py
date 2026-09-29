"""P1 builder for run 24: assembler row at the lake (ammo · red · green chain), pole line to the iron field, electric iron pairs.

짓는 엔진은 p1.build_stage (허브 판으로 만들고, 막힌 자리는 벌목 · 바위, 선 것은 건너뜀) 를 그대로 쓴다.
배치:
  조립 줄 (전기가 있는 물가, 연구소 북쪽):
    줄 1 (y 3.5)  탄창 (-53.5) · 톱니 (-49.5) · 빨강 1 (-45.5) · 빨강 2 (-41.5) · 전선 (-37.5)
    줄 2 (y -0.5) 회로 (-53.5) · 팔 (-49.5) · 벨트 (-45.5) · 초록 (-41.5)
    전봇대 (x, 1.5) x = -51.5 -47.5 -43.5 -39.5 + 연구소 망으로 (-43.5, 6.5)
    팔 · 상자 없이 relay24.py (Lua 중계, 품목마다 상한) 가 재료를 넣고 결과를 뺀다.
  전봇대 줄: (-39.5,1.5) -> 철 기둥 (81.5,-48.5) - 모드 pole_route 가 자리를 고른다 (실행할 때 잰다).
  석탄 전기 채굴기 6 (107.5+3i, -31.5) 남향 -> 철 상자 (x, -29.5), 전봇대 (108.5+6k, -29.5) - 철 기둥 동쪽 끝에서 잇는다.
  철 전기 쌍 (채굴기 -> 화로 직결, 버너 줄 y -56 의 남쪽 광석):
    줄 A 채굴기 (81.5+3i, -50.5) 남향 -> 화로 (82+3i, -48)   i = 0..4   (붓는 칸 = 채굴기 x, y+2.3)
    줄 B 채굴기 (81.5+3i, -45.5) 남향 -> 화로 (82+3i, -43)   i = 0..6
    전봇대 (83.5+6k, -48.5) 화로 사이 틈.

    python scripts/p1_24.py --run run24                      # 단계별로 몇 개 섰나
    python scripts/p1_24.py --run run24 --stage asm --who alpha,bravo
    python scripts/p1_24.py --run run24 --arm alpha,bravo    # 기관단총 + 탄창 (허브 탄창 상자에서)
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

import runsite                           # noqa: E402,F401  (--run 을 먼저 뽑는다)
import p1                                 # noqa: E402
import detached                           # noqa: E402
from client import AIBridge, RconError    # noqa: E402
from orders import submit                 # noqa: E402

N, E, S, W = 0, 4, 8, 12
ASM, EMD, FURN, POLE = "assembling-machine-1", "electric-mining-drill", "stone-furnace", "small-electric-pole"
p1.COST[ASM] = {"iron-plate": 22, "copper-plate": 4.5}
p1.COST["submachine-gun"] = {"iron-plate": 30, "copper-plate": 5}
b = p1.b

# 조립 줄 - relay24.py 가 같은 표를 읽는다
ASMS = {
    "ammo": (-53.5, 3.5, "firearm-magazine"),
    "gear": (-49.5, 3.5, "iron-gear-wheel"),
    "red1": (-45.5, 3.5, "automation-science-pack"),
    "red2": (-41.5, 3.5, "automation-science-pack"),
    "cable": (-37.5, 3.5, "copper-cable"),
    "circuit": (-53.5, -0.5, "electronic-circuit"),
    "inserter": (-49.5, -0.5, "inserter"),
    "belt": (-45.5, -0.5, "transport-belt"),
    "green": (-41.5, -0.5, "logistic-science-pack"),
    "red3": (-37.5, -0.5, "automation-science-pack"),
    "green2": (-57.5, -0.5, "logistic-science-pack"),
    "green3": (-57.5, 3.5, "logistic-science-pack"),
}
LINE_FROM = (-39.5, 1.5)
IRON_POLE = (83.5, -48.5)
ROW_A = [(81.5 + 3 * i, -50.5) for i in range(5)]
ROW_B = [(81.5 + 3 * i, -45.5) for i in range(7)]


def asm_steps():
    out = [b(ASM, x, y) for (x, y, _r) in ASMS.values()]
    out += [b(POLE, x, 1.5) for x in (-51.5, -47.5, -43.5, -39.5)]
    out.append(b(POLE, -43.5, 6.5))
    return out


def powerline_steps(ai, who):
    r = ai.pole_route(who, LINE_FROM[0], LINE_FROM[1], IRON_POLE[0], IRON_POLE[1], 40) or {}
    pts = [(p["x"], p["y"]) for p in (r.get("poles") or []) if isinstance(p, dict)]
    return [b(POLE, x, y) for x, y in pts] + [b(POLE, *IRON_POLE)]


# 채굴기 (x, y) 남향이 붓는 칸은 (x, y + 2.3). 화로 (2x2) 가운데를 x + 0.5 에 두어야 그 칸을 덮는다.
# 실측 (P1-1): x - 1.5 에 둔 화로 12 는 [x-2.5, x-0.5] 라 붓는 칸 (x) 밖 - 채굴기 12 가 땅에 한 개씩 떨구고 섰다.
def iron_steps():
    out = []
    for (x, y) in ROW_A + ROW_B:
        out += [b(EMD, x, y, S), b(FURN, x + 0.5, y + 2.5)]
    out += [b(POLE, 83.5 + 6 * k, -48.5) for k in range(4)]
    return out


def ironfix_steps():
    """잘못 둔 화로 12 (x - 1.5) 와 그 사이 전봇대 4 (81.5+6k) 를 걷고 iron_steps 대로 다시."""
    out = [("demolish", {"x": x - 1.5, "y": y + 2.5, "name": FURN, "search_radius": 0.4}) for (x, y) in ROW_A + ROW_B]
    out += [("demolish", {"x": 81.5 + 6 * k, "y": -48.5, "name": POLE, "search_radius": 0.4}) for k in range(4)]
    return out + iron_steps()


COAL_XS = [107.5 + 3 * i for i in range(6)]
COAL_Y = -31.5


def coal_steps(ai=None, who=None):
    """석탄 전기 채굴기 6 (남향) -> 철 상자 - relay24 연료 중계가 여기서 집는다. 전봇대 줄은 철 기둥 동쪽 끝에서."""
    out = [("demolish", {"x": 108.5, "y": -30.5, "name": POLE, "search_radius": 0.4})]
    if ai is not None:
        r = ai.pole_route(who, 99.5, -48.5, 108.5, -29.5, 10) or {}
        # 채굴기 자리 (y -33..-30) 에 떨어진 경로 전봇대는 뺀다 - 실측: (108.5,-30.5) 가 첫 채굴기를 막았다
        out += [b(POLE, p["x"], p["y"]) for p in (r.get("poles") or []) if isinstance(p, dict) and p["y"] < -33.5]
    for x in COAL_XS:
        out += [b(EMD, x, COAL_Y, S), b("iron-chest", x, COAL_Y + 2)]
    out += [b(POLE, 108.5 + 6 * k, COAL_Y + 2) for k in range(3)]
    out.append(b(POLE, 106.5, -33.5))          # 경로 끝 (105.5,-36.5) 과 (108.5,-29.5) 사이 7.6 칸 틈
    return out


def linefix_steps(ai):
    """끊긴 전력망 섬마다 본망 (가장 큰 망) 과 가장 가까운 전봇대 쌍 가운데에 한 개 (틈 < 15 칸만).
    실측: pole_route 자리가 7.6 · 8.5 간격으로 서서 물가 → 철 줄이 13 조각이었다. 한 번에 안 닿는 틈은 다음 순번에."""
    rows = ai.lua("""(function() local s, out = game.surfaces[1], {}
      for _, p in pairs(s.find_entities_filtered{name = "small-electric-pole", force = "player"}) do
        out[#out+1] = string.format("%.1f,%.1f,%d", p.position.x, p.position.y, p.electric_network_id or -1) end
      return out end)()""")
    pts = [tuple(float(v) for v in str(r).split(",")) for r in p1._rows(rows)]
    nets = {}
    for x, y, n in pts:
        nets.setdefault(n, []).append((x, y))
    if len(nets) < 2:
        return []
    main_n = max(nets, key=lambda k: len(nets[k]))
    out = []
    for n, ps in nets.items():
        if n == main_n:
            continue
        best = None
        for (x0, y0) in ps:
            for m, qs in nets.items():
                if m == n:
                    continue
                for (x1, y1) in qs:
                    d = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
                    if best is None or d < best[0]:
                        best = (d, x0, y0, x1, y1)
        if best and best[0] < 15:
            _d, x0, y0, x1, y1 = best
            out.append(b(POLE, round((x0 + x1) / 2 - 0.5) + 0.5, round((y0 + y1) / 2 - 0.5) + 0.5))
    return list({st[1]["x"] * 1000 + st[1]["y"]: st for st in out}.values())


STONE_XS = [99.5, 102.5, 105.5, 108.5]
CU_A = [(65.5 + 3 * i, 79.5) for i in range(6)]
CU_B = [(65.5 + 3 * i, 84.5) for i in range(7)]


def stone_steps(ai=None, who=None):
    """돌 전기 채굴기 4 (북향, y -4.5) -> 철 상자 (x, -6.5). relay24 가 허브로 (≤ 500). 전봇대 줄은 석탄 줄 (108.5,-29.5) 에서."""
    out = []
    if ai is not None:
        r = ai.pole_route(who, 108.5, -29.5, 106.5, -6.5, 10) or {}
        out += [b(POLE, p["x"], p["y"]) for p in (r.get("poles") or []) if isinstance(p, dict)]
    for x in STONE_XS:
        out += [b(EMD, x, -4.5, N), b("iron-chest", x, -6.5)]
    out += [b(POLE, 100.5, -6.5), b(POLE, 106.5, -6.5)]
    return out


def copper_steps(ai=None, who=None):
    """구리 전기 쌍 13 (남쪽 광맥, 철과 같은 모양): 채굴기 (65.5+3i, 79.5 / 84.5) 남향 -> 화로 (x-1.5, y+2.5).
    전봇대 (65.5+6k, 81.5) · 줄은 물가→철 줄의 (64.5,-41.5) 에서 남쪽으로."""
    out = []
    if ai is not None:
        r = ai.pole_route(who, 64.5, -41.5, 65.5, 81.5, 40) or {}
        out += [b(POLE, p["x"], p["y"]) for p in (r.get("poles") or []) if isinstance(p, dict)]
    for (x, y) in CU_A + CU_B:
        out += [b(EMD, x, y, S), b(FURN, x + 0.5, y + 2.5)]
    out += [b(POLE, 67.5 + 6 * k, 81.5) for k in range(4)]
    return out


def labs2_steps():
    """연구소 2 더 (-51.5,8.5) · (-35.5,8.5) + 빨강 3 은 asm 표 (red3). 실측 20:25: 연구소 2 · 빨강 10분 112 - 둘 다 병목."""
    p1.COST["lab"] = {"iron-plate": 36, "copper-plate": 15}
    return [b("lab", -51.5, 8.5), b("lab", -35.5, 8.5), b(POLE, -37.5, 6.5), b(ASM, -37.5, -0.5),
            # 초록 2 · 3 (초록 한 대 12 초에 1 개 - 빨강 3 대 0.3/s 의 1/4 뿐)
            b(ASM, -57.5, -0.5), b(ASM, -57.5, 3.5), b(POLE, -55.5, 1.5)]


def power2_steps():
    """둘째 발전 단위 (모드 power_plan 확인 좌표): 펌프 (-56.5,16.5) · 보일러 (-57,14.5) 서향 · 기관 (-60.5,14.5) (-65.5,14.5).
    기관 1.8MW 가 채굴기 18 (1.62MW) + 조립기 9 + 연구소 2 에 모자라서. 연료는 relay24 (보일러 ≤ 20)."""
    p1.COST.update({"offshore-pump": {"iron-plate": 5, "copper-plate": 3}})
    return [b("offshore-pump", -56.5, 16.5, S), b("boiler", -57, 14.5, W),
            b("steam-engine", -60.5, 14.5, E), b("steam-engine", -65.5, 14.5, E),
            b(POLE, -52.5, 11.5), b(POLE, -58.5, 12.5), b(POLE, -64.5, 12.5)]


def power3_steps():
    """셋째 발전 단위 (power_plan 확인): 펌프 (-74.5,18.5) · 보일러 (-75,16.5) 서향 · 기관 (-78.5,16.5) (-83.5,16.5).
    실측 20:30: 기관 4 가 다 900 kW (3.6 MW 꽉) - 채굴기 30 이 3.05 MW."""
    p1.COST.update({"offshore-pump": {"iron-plate": 5, "copper-plate": 3}})
    return [b("offshore-pump", -74.5, 18.5, S), b("boiler", -75, 16.5, W),
            b("steam-engine", -78.5, 16.5, E), b("steam-engine", -83.5, 16.5, E),
            b(POLE, -70.5, 13.5), b(POLE, -76.5, 13.5), b(POLE, -82.5, 13.5)]


def curetire_steps():
    """구리 버너 줄 은퇴 (채굴기 (69+2i, 74) · 화로 (69+2i, 76), i = 0..5): 화로 판을 챙기고 걷는다.
    구리 전기 쌍 13 (4 판/s) 이 버너 6 (1.5 광석/s) 을 넘은 뒤. 석탄 0.36/s 를 아낀다."""
    out = []
    for i in range(6):
        x = 69 + 2 * i
        out += [("take", {"name": "copper-plate", "x": x, "y": 76, "count": 100}),
                ("demolish", {"x": x, "y": 76, "name": FURN, "search_radius": 0.6}),
                ("demolish", {"x": x, "y": 74, "name": "burner-mining-drill", "search_radius": 0.6})]
    return out


def turretsnw_steps():
    """물가 조립 줄 · 발전소 북쪽 포탑 4 (y -8). 걸어서 본 적: 북 ~600 에 구조물 2 (출정 조건 조회) · 북서 (-413,-616) 작은 벌레.
    철 줄 북쪽 4 (y -61·-66) 가 기지 북면, 이것이 물가 블록 북면. 탄창은 relay24 (포탑마다 ≤ 20)."""
    return [b("gun-turret", x, -8) for x in (-58, -50, -42, -34)]


def recipes(ai, who) -> None:
    """조립기 레시피 - 연구가 안 된 것 (초록) 은 건너뛴다."""
    for name, (x, y, rec) in ASMS.items():
        try:
            r = ai.set_recipe(who, x, y, rec)
            print(f"  {name} {rec}: {r.get('ok', r)}")
        except RconError as e:
            print(f"  {name} {rec}: {e}")


def arm(ai, crew) -> None:
    """기관단총 1 + 탄창 (허브 탄창 상자) - 총은 허브 판으로 손제작 (block)."""
    import arm as armmod
    armmod.GUN, armmod.AMMO_ITEM, armmod.ARMOR, armmod.AMMO = "submachine-gun", "firearm-magazine", "heavy-armor", 20
    # 상주 고리 (collect · handore) 에 딸린 사람도 무장 동안은 이 스크립트 것 - 끝나면 원래 주인으로 돌려준다
    owners = {w: detached.owner(w) for w in crew}
    os.environ[detached.ENV] = "arm24"
    detached.mark(crew, "arm24", minutes=10)
    got = armmod.kit(ai)
    hub = p1.hub(ai)
    for who in crew:
        gun, ammo, _ = got.get(who, ("-", 0, "-"))
        plan = []
        bag = ai.agent(who).items()
        if gun == "-" and not bag.get("submachine-gun"):
            plan += p1.fetch(ai, who, {"submachine-gun": 1})
            plan = [st for st in plan if st[0] != "craft"] + [("craft", {"recipe": "submachine-gun", "count": 1, "wait": "block"})]
        want = max(0, 20 - ammo - int(bag.get("firearm-magazine", 0)))
        if want and "firearm-magazine" in hub:
            x, y, c = hub["firearm-magazine"]
            plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": "firearm-magazine", "x": x, "y": y, "count": min(want, c)})]
        if plan:
            try:
                ai.agent(who).cancel()
            except RconError:
                pass
            submit(ai, who, plan, strict=False)
            print(f"{who}: 무장 {len(plan)} 단계")
    for _ in range(60):
        time.sleep(5)
        live = {w["name"]: w for w in ai.list()}
        if all(not (live[w].get("current") or live[w].get("queued")) for w in crew if w in live):
            break
    for who in crew:
        print(f"  {who}: {armmod.equip(ai, who).get('moved', '')}")
    detached.release(crew)
    for who, own in owners.items():
        if own and own != "arm24":
            detached.mark([who], own, minutes=600)
    for name, (gun, ammo, _a) in armmod.kit(ai).items():
        print(f"  {name:<8} {gun:<15} {ammo:>3}")


STAGES = {"asm": asm_steps, "iron": iron_steps, "coal": coal_steps, "power2": power2_steps,
          "stone": stone_steps, "copper": copper_steps, "ironfix": ironfix_steps, "labs2": labs2_steps, "power3": power3_steps, "curetire": curetire_steps, "turretsnw": turretsnw_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", "powerline", "linefix", "recipes", *STAGES))
    ap.add_argument("--who", default="")
    ap.add_argument("--arm", default="")
    a = ap.parse_args()
    ai = AIBridge()
    if a.arm:
        arm(ai, [n.strip() for n in a.arm.split(",") if n.strip()])
        return 0
    for name, fn in STAGES.items():
        steps = fn()
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}"
              f" · 막힘 {len(p1.blocked(ai, steps))}")
    crew = [n.strip() for n in a.who.split(",") if n.strip()]
    if not (crew and a.stage):
        return 0
    if a.stage == "recipes":
        recipes(ai, crew[0])
        return 0
    os.environ[detached.ENV] = "p1_24"
    detached.mark(crew, "p1_24", minutes=60)
    try:
        steps = (powerline_steps(ai, crew[0]) if a.stage == "powerline"
                 else coal_steps(ai, crew[0]) if a.stage == "coal"
                 else stone_steps(ai, crew[0]) if a.stage == "stone"
                 else copper_steps(ai, crew[0]) if a.stage == "copper"
                 else linefix_steps(ai) if a.stage == "linefix" else STAGES[a.stage]())
        ok = p1.build_stage(ai, crew, steps, a.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

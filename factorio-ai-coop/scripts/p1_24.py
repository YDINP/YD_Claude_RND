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
    줄 A 채굴기 (81.5+3i, -50.5) 남향 -> 화로 (81+3i... 가운데 80+3i, -48)   i = 0..4
    줄 B 채굴기 (81.5+3i, -45.5) 남향 -> 화로 (80+3i, -43)                  i = 0..6
    전봇대 (81.5+6k, -48.5) 화로 사이 틈.

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
}
LINE_FROM = (-39.5, 1.5)
IRON_POLE = (81.5, -48.5)
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


def iron_steps():
    out = []
    for (x, y) in ROW_A + ROW_B:
        out += [b(EMD, x, y, S), b(FURN, x - 1.5, y + 2.5)]
    out += [b(POLE, 81.5 + 6 * k, -48.5) for k in range(4)]
    return out


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
    """전봇대 줄의 끊긴 틈 (전선 7.5 넘음) 마다 가운데 한 개. 실측: pole_route 자리가 7.6 · 8.5 간격으로 서서 망이 13 조각."""
    rows = ai.lua("""(function() local s, out = game.surfaces[1], {}
      for _, p in pairs(s.find_entities_filtered{name = "small-electric-pole", force = "player", area = {{-40, -50}, {82, 2}}}) do
        out[#out+1] = string.format("%.1f,%.1f,%d", p.position.x, p.position.y, p.electric_network_id or -1) end
      return out end)()""")
    pts = sorted(tuple(float(v) for v in str(r).split(",")) for r in p1._rows(rows))
    out = []
    for (x0, y0, n0), (x1, y1, n1) in zip(pts, pts[1:]):
        if n0 != n1 and ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 > 7.4:
            out.append(b(POLE, int((x0 + x1) / 2) + 0.5, int((y0 + y1) / 2) - 0.5))
    return out


def power2_steps():
    """둘째 발전 단위 (모드 power_plan 확인 좌표): 펌프 (-56.5,16.5) · 보일러 (-57,14.5) 서향 · 기관 (-60.5,14.5) (-65.5,14.5).
    기관 1.8MW 가 채굴기 18 (1.62MW) + 조립기 9 + 연구소 2 에 모자라서. 연료는 relay24 (보일러 ≤ 20)."""
    p1.COST.update({"offshore-pump": {"iron-plate": 5, "copper-plate": 3}})
    return [b("offshore-pump", -56.5, 16.5, S), b("boiler", -57, 14.5, W),
            b("steam-engine", -60.5, 14.5, E), b("steam-engine", -65.5, 14.5, E),
            b(POLE, -52.5, 11.5), b(POLE, -58.5, 12.5), b(POLE, -64.5, 12.5)]


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


STAGES = {"asm": asm_steps, "iron": iron_steps, "coal": coal_steps, "power2": power2_steps}


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
                 else linefix_steps(ai) if a.stage == "linefix" else STAGES[a.stage]())
        ok = p1.build_stage(ai, crew, steps, a.stage)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

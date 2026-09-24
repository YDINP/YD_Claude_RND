"""P5 builder for run 22: crude oil from field A (165..185, -359..-346) to a refinery site at base.

정찰(fogwalk, 2026-09-24)로 원유 두 곳을 찾았다: A (165..185, -359..-346) 6곳 - 기지에서 약 360칸,
B (347..359, -217..-202) 7곳. 알려진 둥지 셋은 다 570칸 밖이다. A 부터.

연구 경로 (전부 빨강·초록): engine -> fluid-handling -> oil-gathering(펌프잭) -> oil-processing
(원유를 캐면 열린다) -> plastics · sulfur-processing -> advanced-circuit -> chemical-science-pack.
관로는 연구와 따로 지금 깐다.

관로: 지하 파이프 쌍 (게임 실측: 방향 d 면 지상 연결이 d 쪽, 지하는 반대쪽 최대 10칸).
    남향 구간: 입구 N · 출구 S / 서향 구간: 입구 E · 출구 W
유전 집결점 (170.5,-340.5) -> 남쪽 x=170.5 -> y=-40.5 -> 서쪽 -> 정유소 부지 (60.5,-40.5).
전력: 관 옆 x=172.5 / y=-38.5 에 소형 전봇대 7칸 간격, 기지 망 (9.5,-36.5) 까지.

    python scripts/p5.py
    python scripts/p5.py --stage probe --who bravo      # 첫 쌍만 - 이어지는지 잰다
    python scripts/p5.py --stage pipeline --who bravo,hotel
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge  # noqa: E402
import detached               # noqa: E402
import p1                     # noqa: E402

b = p1.b
N, E, S, W = 0, 4, 8, 12
UGP, PIPE, POLE = "pipe-to-ground", "pipe", p1.POLE
SPAN = 10
TOP = (170.5, -340.5)         # 유전 집결점
CORNER = (170.5, -40.5)
END = (60.5, -40.5)           # 정유소 부지 입구

p1.COST.update({UGP: {"iron-plate": 7.5}})
p1.PAIRED.add(UGP)


def run(x0, y0, x1, y1):
    """직선 한 구간을 지하 파이프 쌍으로. 남는 칸은 보통 파이프."""
    out = []
    if x0 == x1:                                  # 남향
        y = y0
        while y + SPAN <= y1:
            out += [b(UGP, x0, y, N), b(UGP, x0, y + SPAN, S)]
            y += SPAN + 1
        while y <= y1:
            out.append(b(PIPE, x0, y))
            y += 1
    else:                                         # 서향
        x = x0
        while x - SPAN >= x1:
            out += [b(UGP, x, y0, E), b(UGP, x - SPAN, y0, W)]
            x -= SPAN + 1
        while x >= x1:
            out.append(b(PIPE, x, y0))
            x -= 1
    return out


def pipeline_steps():
    out = run(TOP[0], TOP[1], CORNER[0], CORNER[1] - 1)
    out.append(b(PIPE, CORNER[0], CORNER[1]))                 # 꺾이는 칸
    out += run(CORNER[0] - 1, CORNER[1], END[0], END[1])
    return out


def poles_steps():
    out = []
    y = TOP[1]
    while y <= CORNER[1]:
        out.append(b(POLE, TOP[0] + 2, y))
        y += 7
    if y - 7 < CORNER[1] + 2 - 7.5:                   # 7칸 간격이 모서리 직전에서 끝나면 한 대 더 (실측: -46.5 -> -38.5 는 8칸, 안 닿는다)
        out.append(b(POLE, TOP[0] + 2, CORNER[1] - 2))
    x = CORNER[0] + 2
    while x >= 9.5:
        if abs(x - 25.5) < 0.1:                      # 보일러 가지 벨트 위 - 양옆 둘로 나눈다
            out += [b(POLE, 22.5, CORNER[1] + 2), b(POLE, 28.5, CORNER[1] + 2)]
        else:
            out.append(b(POLE, x, CORNER[1] + 2))
        x -= 7
    return out


def probe_steps():
    return pipeline_steps()[:2] + [b(PIPE, TOP[0], TOP[1] - 1)]


JACK = "pumpjack"
p1.COST.update({JACK: {"steel-plate": 5, "iron-plate": 35, "copper-plate": 7.5}})
# 유정과 방향 - 서로의 출구를 막지 않게 (3x3, 출구는 한 변에 하나)
WELLS = ((175.5, -358.5, N), (179.5, -358.5, N), (180.5, -355.5, W),
         (184.5, -355.5, S), (164.5, -348.5, E), (172.5, -345.5, W))
MANIFOLD_X = 170.5


def wells_steps():
    out = [b(JACK, x, y, d) for x, y, d in WELLS]
    y = -361.5
    while y <= TOP[1] - 1:                                   # 집결관 x=170.5, 관로 입구 (170.5,-340.5) 까지
        out.append(b(PIPE, MANIFOLD_X, y))
        y += 1
    return out


def spurs_steps(ai):
    """펌프잭 출구 칸에서 집결관까지 보통 관 (출구 칸은 게임에 묻는다)."""
    reply = ai.lua("""(function()
      local s, out = game.surfaces[1], {}
      for _, j in pairs(s.find_entities_filtered{name = "pumpjack", area = {{150, -370}, {200, -335}}}) do
        for _, c in pairs(j.fluidbox.get_pipe_connections(1)) do
          if c.target_position then out[#out+1] = string.format("%.1f,%.1f", c.target_position.x, c.target_position.y) end
        end
      end
      return out
    end)()""")
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = []
    for r in rows:
        tx, ty = (float(v) for v in str(r).split(","))
        step = -1 if tx > MANIFOLD_X else 1
        x = tx
        while abs(x - MANIFOLD_X) > 0.4:
            out.append(b(PIPE, x, ty))
            x += step
        if ty < -361.5 or ty > TOP[1] - 1:                   # 집결관 범위 밖이면 세로로 이어 준다
            y = ty
            while abs(y - (-361.5)) > 0.4 and y < -361.5:
                out.append(b(PIPE, MANIFOLD_X, y))
                y += 1
    return out


def fieldpoles_steps():
    return [b(POLE, x, y) for x, y in ((172.5, -347.5), (177.5, -352.5), (183.5, -352.5), (177.5, -361.5), (167.5, -351.5),
                                             (177.5, -356.5))]      # -361.5 <-> -352.5 는 9칸 - 사이에 하나


PUMP = "pump"
p1.COST.update({PUMP: {"steel-plate": 2, "iron-plate": 6}})
# 2.0 유체 구간은 크기 320 이 상한 (utility-constants default_pipeline_extent). 이 관로는 세로만 321 이라
# 펌프잭이 원유를 502 채운 채 waiting_for_space 로 섰다 - 오류 표시 없이. 펌프는 구간을 끊는다:
# 집결관 끝과 모서리 직전에 하나씩 -> 20 · 298 · 111.
SPLITS = ((MANIFOLD_X, TOP[1] - 1.5), (CORNER[0], CORNER[1] - 1.5))


def _unsplit(steps):
    """펌프 자리의 보통 관은 계획에서 뺀다."""
    taken = {(x, y + d) for x, y in SPLITS for d in (-0.5, 0.5)}
    return [(k, a) for k, a in steps if not (k == "build" and a["name"] == PIPE and (a["x"], a["y"]) in taken)]


def split_steps():
    out = []
    for x, y in SPLITS:
        out += [("demolish", {"x": x, "y": y - 0.5, "name": PIPE, "search_radius": 0.3}),
                ("demolish", {"x": x, "y": y + 0.5, "name": PIPE, "search_radius": 0.3}),
                b(PUMP, x, y, S)]                                  # 남쪽으로 민다
    return out


STAGES = {"probe": probe_steps, "pipeline": lambda: _unsplit(pipeline_steps()), "poles": poles_steps,
          "wells": lambda: _unsplit(wells_steps()), "fieldpoles": fieldpoles_steps, "spurs": None, "split": split_steps}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", default="", choices=("", *STAGES))
    ap.add_argument("--who", default="")
    args = ap.parse_args()
    ai = AIBridge()
    for name, fn in STAGES.items():
        steps = fn() if fn else spurs_steps(ai)
        print(f"  {name}: {len(p1.standing(ai, steps))}/{sum(1 for k, _ in steps if k == 'build')}")
    crew = [n.strip() for n in args.who.split(",") if n.strip()]
    if not (crew and args.stage):
        return 0
    os.environ[detached.ENV] = "p5"
    detached.mark(crew, "p5", minutes=180)
    try:
        steps = STAGES[args.stage]() if STAGES[args.stage] else spurs_steps(ai)
        ok = p1.build_stage(ai, crew, steps, args.stage, rounds=20)
    finally:
        detached.release(crew)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

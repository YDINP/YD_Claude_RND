"""From a target rate back to machine counts - using the running game's recipes.

교리 v2 규칙 1: 목표 소비량에서 거꾸로. 계산 없이 기계를 놓지 않는다.

레시피는 위키가 아니라 실행 중인 게임에 묻는다 (2.0 은 1.1 과 다르다 - progression.md).
품목마다 «그 이름의 레시피»를 쓰고, 광석·원유·물처럼 레시피가 없는 것은 원료로 멈춘다.

    python scripts/ratio.py automation-science-pack=0.75 logistic-science-pack=0.75
    python scripts/ratio.py military-science-pack=0.5 --am 0.75      # 조립기 2형
    python scripts/ratio.py iron-plate=15 --furnace 2                 # 강철 화로

출력: 품목별 초당 량 · 기계 종류 · 기계 수(올림) · 원료 초당 량 · 전기 채굴기 수 · 노란 벨트 몇 줄.
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))

from client import AIBridge  # noqa: E402

BELT = 15.0                  # 노란 벨트 초당
DRILL = 0.5                  # 전기 채굴기 초당 (채굴 속도 0.5, 광석 경도 1)


def recipes(ai, names) -> dict:
    """{레시피: {energy, category, ing: {품목: 수}, out: 그 품목 산출 수}}"""
    packed = ";".join(names)
    reply = ai.lua("""(function()
      local out = {}
      for n in string.gmatch("%s", "[^;]+") do
        local r = prototypes.recipe[n]
        if r then
          local ing = {}
          for _, i in pairs(r.ingredients) do ing[#ing+1] = i.name .. "=" .. i.amount end
          local made = 0
          for _, p in pairs(r.products) do
            if p.name == n then made = made + (p.amount or ((p.amount_min + p.amount_max) / 2)) * (p.probability or 1) end
          end
          out[#out+1] = n .. "|" .. r.energy .. "|" .. r.category .. "|" .. made .. "|" .. table.concat(ing, ",")
        end
      end
      return out
    end)()""" % packed)
    rows = list(reply.values()) if isinstance(reply, dict) else list(reply or [])
    out = {}
    for row in rows:
        n, energy, cat, made, ing = str(row).split("|")
        d = {}
        for bit in ing.split(","):
            if bit:
                k, v = bit.split("=")
                d[k] = float(v)
        out[n] = {"energy": float(energy), "category": cat, "out": float(made), "ing": d}
    return out


def expand(ai, targets: dict) -> tuple:
    """품목별 초당 량과 레시피 표. 레시피가 없는 것은 원료."""
    book, need, raw = {}, {}, {}
    queue = list(targets.items())
    while queue:
        item, rate = queue.pop()
        if item not in book:
            book.update(recipes(ai, [item]))
        r = book.get(item)
        # 판·강철은 제련 레시피 이름이 품목과 같다. 광석·물·원유는 레시피가 없다.
        if not r or r["out"] <= 0:
            raw[item] = raw.get(item, 0) + rate
            continue
        need[item] = need.get(item, 0) + rate
        for k, v in r["ing"].items():
            queue.append((k, rate * v / r["out"]))
    return need, raw, book


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="+", help="품목=초당 량")
    ap.add_argument("--am", type=float, default=0.5, help="조립기 속도 (1형 0.5, 2형 0.75)")
    ap.add_argument("--furnace", type=float, default=1.0, help="화로 속도 (돌 1, 강철 2)")
    args = ap.parse_args()
    targets = {}
    for t in args.targets:
        k, v = t.split("=")
        targets[k] = float(v)
    need, raw, book = expand(AIBridge(), targets)
    print(f"  목표: " + ", ".join(f"{k} {v}/s" for k, v in targets.items()))
    print(f"  {'품목':<30}{'초당':>8}  {'기계':<10}{'대수':>6}")
    for item, rate in sorted(need.items(), key=lambda kv: -kv[1]):
        r = book[item]
        speed = args.furnace if r["category"] == "smelting" else args.am
        kind = "화로" if r["category"] == "smelting" else ("조립기" if r["category"].startswith("crafting") or r["category"] == "advanced-crafting" else r["category"])
        machines = rate * r["energy"] / (r["out"] * speed)
        print(f"  {item:<30}{rate:>8.2f}  {kind:<10}{machines:>6.1f} -> {math.ceil(machines - 1e-9)}")
    print("  원료:")
    for item, rate in sorted(raw.items(), key=lambda kv: -kv[1]):
        extra = ""
        if item.endswith("-ore") or item in ("coal", "stone"):
            extra = f"  전기 채굴기 {math.ceil(rate / DRILL - 1e-9)}대 · 노란 벨트 {rate / BELT:.2f}줄"
        print(f"    {item:<28}{rate:>8.2f}/s{extra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

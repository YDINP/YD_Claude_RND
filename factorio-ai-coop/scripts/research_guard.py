"""Keep the research queue filled with techs we can actually feed.

대기열이 비면 게임이 아무 연구나 고른다. 22회차에 세 번 그랬다 (defender 두 번, advanced-combinators
한 번 - 화학팩). 연구소 22대가 모두 서고, 역압이 조립기 -> 화로 -> 채굴기까지 올라가 막힘이 56% 가
됐다. 사람이 아니라 루프가 지킨다.

    python scripts/research_guard.py --every 60
    python scripts/research_guard.py --packs automation-science-pack,logistic-science-pack,chemical-science-pack
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "bridge"))
sys.path.insert(0, HERE)

from client import AIBridge, RconError  # noqa: E402
import p4                                # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--every", type=float, default=60)
    ap.add_argument("--packs", default="automation-science-pack,logistic-science-pack")
    ap.add_argument("--skip", default="", help="이 접두사로 시작하는 연구는 고르지 않는다 (쉼표)")
    ap.add_argument("--prefer", default="", help="이 접두사 순서로 먼저 (쉼표, 없으면 p4.PREFER)")
    ap.add_argument("--gate", default="", help="팩:켜는수:끄는수 - 연구소 · 조립기 결과칸에 든 그 팩이 켜는수 이상이면 쓰고 끄는수 미만이면 뺀다 "
                                              "(24회차 20:30: 초록 0 인데 logistics-2 를 골라 연구소 4 중 3 이 missing_science_packs)")
    args = ap.parse_args()
    packs = tuple(p.strip() for p in args.packs.split(",") if p.strip())
    skip = tuple(p.strip() for p in args.skip.split(",") if p.strip())
    prefer = tuple(p.strip() for p in args.prefer.split(",") if p.strip()) or p4.PREFER
    ai = AIBridge()
    last = None
    forced_off = {}
    _stall = 0
    gates = {}
    for g in (x for x in args.gate.split(",") if x.strip()):
        name, on, off = g.split(":")
        gates[name] = [int(on), int(off), None]  # None: 첫 측정에서 «끄는수 이상이면 켜진 상태» 로 시작 (재시작 직후 모든 게이트가 닫혀 연구가 서던 문제, run24 02:2x)
    while True:
        try:
            use = list(packs)
            # 09-30 06:0x 멈춤 감지: 연구소 절반 이상이 missing_science_packs 가 2 번 연속이면, 연구소들에 실제로 모자란 팩
            # (연구소 수보다 적게 든 팩) 을 15 분 동안 강제로 끈다 - 재고가 벨트·상자에 있어도 연구소까지 못 오면 소용없다.
            st = ai.lua('''(function() local s = game.surfaces[1] local labs = s.find_entities_filtered{type = "lab", force = "player"}
              local miss, cnt = 0, {} local r = game.forces.player.current_research
              for _, l in pairs(labs) do if l.status == defines.entity_status.missing_science_packs then miss = miss + 1 end end
              if r then for _, u in pairs(r.research_unit_ingredients) do local n = 0
                for _, l in pairs(labs) do n = n + l.get_item_count(u.name) end cnt[u.name] = n end end
              return {labs = #labs, miss = miss, cnt = cnt} end)()''')
            if st.get("labs") and st.get("miss", 0) * 2 >= st["labs"]:
                stall = _stall + 1
            else:
                stall = 0
            _stall = stall
            if stall >= 2:
                for pk, n in (st.get("cnt") or {}).items():
                    if n < max(3, st["labs"] // 3) and pk in gates:  # 06:5x 문턱 완화: 연구소 수 → 연구소 수/3 (생산이 적어도 흐르면 켜 둔다)
                        forced_off[pk] = time.time() + 900
                        print(time.strftime("%X"), f"멈춤: 연구소 {st['miss']}/{st['labs']} 팩 없음 - {pk} 연구소 합 {n} → 15 분 끔", flush=True)
            for pk, until in list(forced_off.items()):
                if time.time() < until and pk in use:
                    use.remove(pk)
            for name, gate in gates.items():
                # 09-30 03:3x: 10 분 생산 «또는» 재고 (연구소·조립기 결과칸·상자·벨트). 켜기는 둘 중 하나가 켜는수 이상,
                # 끄기는 둘 다 끄는수 미만. 재고만 보면 공장이 서도 연구소 잔량으로 켜진 채 남고 (보라 0 인데 automation-3),
                # 생산만 보면 팩이 벨트에 막혀 생산 0 → 연구를 끔 → 계속 막힘 (교착). 둘을 같이 봐야 둘 다 피한다.
                r = ai.lua("""(function() local s = game.surfaces[1] local n, name = 0, "%s"
                  local st = game.forces.player.get_item_production_statistics(s)
                  local prod = math.floor(st.get_flow_count{name = name, category = "input",
                    precision_index = defines.flow_precision_index.ten_minutes, count = true})
                  for _, l in pairs(s.find_entities_filtered{type = "lab", force = "player"}) do n = n + l.get_item_count(name) end
                  for _, m in pairs(s.find_entities_filtered{type = "assembling-machine", force = "player"}) do
                    n = n + m.get_inventory(defines.inventory.assembling_machine_output).get_item_count(name) end
                  for _, c in pairs(s.find_entities_filtered{type = {"container", "logistic-container"}, force = "player"}) do
                    n = n + c.get_inventory(defines.inventory.chest).get_item_count(name) end
                  for _, b in pairs(s.find_entities_filtered{type = {"transport-belt", "underground-belt", "splitter"}, force = "player"}) do
                    for i = 1, b.get_max_transport_line_index() do n = n + b.get_transport_line(i).get_item_count(name) end end
                  return {prod = prod, stock = n} end)()""" % name)
                have = max(r.get("prod", 0), r.get("stock", 0))
                if gate[2] is None:
                    gate[2] = have >= gate[1]
                    print(time.strftime("%X"), f"{name} {have} - 시작 상태 {'켬' if gate[2] else '끔'}", flush=True)
                elif not gate[2] and have >= gate[0]:
                    gate[2] = True
                    print(time.strftime("%X"), f"{name} {have} - 켠다", flush=True)
                elif gate[2] and r.get("prod", 0) < gate[1] and r.get("stock", 0) < gate[1]:
                    gate[2] = False
                    print(time.strftime("%X"), f"{name} {have} - 끈다 (그 팩 연구는 대기열에서 뺀다)", flush=True)
                if not gate[2] and name in use:
                    use.remove(name)
            q = p4.queue_fill(ai, tuple(use), prefer=prefer, skip=skip)
            if not q and tuple(use) != tuple(packs):
                # 08:4x: 게이트·멈춤 감지로 먹일 연구가 0 이 되면 연구소가 통째로 선다 - 느리게라도 도는 편이 낫다.
                # 이때는 게이트를 무시하고 모든 팩으로 대기열을 채운다.
                live = tuple(pk for pk in packs if not (pk in forced_off and time.time() < forced_off[pk]))
                q = p4.queue_fill(ai, live, prefer=prefer, skip=skip)  # 멈춤 감지로 끈 팩 (연구소에 실제로 없는 팩) 은 빼고
                if not q:
                    q = p4.queue_fill(ai, tuple(packs), prefer=prefer, skip=skip)
                if q:
                    print(time.strftime("%X"), "게이트로 연구 0 - 전체 팩으로 대기열 (느리게라도 돌린다)", flush=True)
            if q != last:
                print(time.strftime("%X"), "대기열", q, flush=True)
                last = q
            if not q:
                print(time.strftime("%X"), "먹일 수 있는 연구가 없다 - 연구소가 선다 (다음 팩이 필요하다)", flush=True)
        except RconError as exc:
            print("  게임이 대답하지 않는다:", exc, flush=True)
        time.sleep(args.every)


if __name__ == "__main__":
    raise SystemExit(main())

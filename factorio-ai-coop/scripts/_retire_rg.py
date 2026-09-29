"""delta 가 옛 빨강 · 초록 사슬 조립기의 결과칸을 손으로 비운다 (게임 안 행동)."""
import sys, json
sys.path.insert(0, 'bridge'); sys.path.insert(0, 'scripts')
import runsite, relay24
from client import AIBridge
ai = AIBridge(); a = ai.agent(sys.argv[1])
for n in relay24.DROP_TARGETS:
    x, y, rec = relay24.ASMS[n]
    got = ai.lua('''(function() local e=game.surfaces[1].find_entities_filtered{type='assembling-machine',position={%f,%f},radius=0.6}[1]
      if not e then return {} end local t={} for _,v in pairs(e.get_inventory(defines.inventory.assembling_machine_output).get_contents()) do t[v.name]=v.count end return t end)()''' % (x, y))
    if not got:
        continue
    a.walk_to(x, y + 2.5)
    for item, c in got.items():
        try:
            print(n, a.take(item, x, y, count=c))
        except Exception as e:
            print(n, 'fail', e)
print(a.items())

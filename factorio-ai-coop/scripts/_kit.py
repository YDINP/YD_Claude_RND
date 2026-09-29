"""손 키트: python scripts/_kit.py --run run24 who '<json>'  json = {"take": [[x,y,item,n],...], "craft": [[recipe,n],...], "put": [x,y], "insert": [[item,n],...]}
캐릭터가 걸어가 꺼내고 (게임 안 행동) 손제작해 저장 상자에 넣는다."""
import json, sys
sys.path.insert(0, 'bridge'); sys.path.insert(0, 'scripts')
import runsite  # noqa
from client import AIBridge
from orders import submit
who, spec = sys.argv[1], json.loads(sys.argv[2])
ai = AIBridge()
plan = []
for x, y, item, n in spec.get("take", []):
    plan += [("walk_to", {"x": x, "y": y + 1.5}), ("take", {"name": item, "x": x, "y": y, "count": n})]
for rec, n in spec.get("craft", []):
    plan.append(("craft", {"recipe": rec, "count": n, "wait": "block"}))
px, py = spec.get("put", [59.5, -14.5])
plan.append(("walk_to", {"x": px, "y": py + 1.5}))
for item, n in spec.get("insert", []):
    plan.append(("insert", {"name": item, "x": px, "y": py, "count": n}))
plan.append(("walk_to", {"x": 66.5, "y": -20.5}))
print(submit(ai, who, plan, strict=False))

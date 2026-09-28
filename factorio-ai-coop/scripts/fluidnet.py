"""Offline fluid connectivity checker (northadv23, 09-28): area entity dump + design delta -> segments, mixed fluids, unpaired pipe-to-ground."""
import json
import math
from collections import defaultdict

V = {0: (0, -1), 4: (1, 0), 8: (0, 1), 12: (-1, 0)}


def rot(dx, dy, d):
    if d == 0: return dx, dy
    if d == 4: return -dy, dx
    if d == 8: return -dx, -dy
    if d == 12: return dy, -dx
    raise ValueError(d)


def K(x, y):
    return (round(x * 2) / 2, round(y * 2) / 2)


# chemical plant / refinery templates: list of (fb, fluid, [(dx,dy), ...]) in north orientation (d0)
CHEM = {
    "light-oil-cracking": [(1, "water", [(-1, -2)]), (2, "light-oil", [(1, -2)]), (3, "petroleum-gas", [(-1, 2), (1, 2)])],
    "heavy-oil-cracking": [(1, "water", [(-1, -2)]), (2, "heavy-oil", [(1, -2)]), (3, "light-oil", [(-1, 2), (1, 2)])],
    "solid-fuel-from-heavy-oil": [(1, "heavy-oil", [(-1, -2), (1, -2)])],
    "solid-fuel-from-light-oil": [(1, "light-oil", [(-1, -2), (1, -2)])],
    "plastic-bar": [(1, "petroleum-gas", [(-1, -2), (1, -2)])],
    "sulfur": [(1, "water", [(-1, -2)]), (2, "petroleum-gas", [(1, -2)])],
}
REF = {
    "advanced-oil-processing": [(1, "water", [(-1, 3)]), (2, "crude-oil", [(1, 3)]), (3, "heavy-oil", [(-2, -3)]),
                                (4, "light-oil", [(0, -3)]), (5, "petroleum-gas", [(2, -3)])],
    "basic-oil-processing": [(1, "crude-oil", [(1, 3)]), (2, "petroleum-gas", [(2, -3)])],
}


class Net:
    def __init__(self, dump):
        es = dump["e"]
        es = list(es.values()) if isinstance(es, dict) else es
        self.ents = []
        for e in es:
            if e["f"] == "neutral" and e["t"] in ("tree", "simple-entity", "cliff", "fish"):
                pass
            self.add_raw(e)

    def add_raw(self, e):
        e = dict(e)
        e.setdefault("new", False)
        e["id"] = len(self.ents)
        self.ents.append(e)
        return e

    def remove(self, name, x, y):
        for e in self.ents:
            if not e.get("dead") and e["n"] == name and abs(e["x"] - x) < 0.3 and abs(e["y"] - y) < 0.3:
                e["dead"] = True
                return e
        raise KeyError("remove: no %s@%s,%s" % (name, x, y))

    def add(self, name, x, y, d=0, rec=None):
        size = {"pipe": 1, "pipe-to-ground": 1, "chemical-plant": 3, "small-electric-pole": 1, "iron-chest": 1, "inserter": 1,
                "medium-electric-pole": 1, "oil-refinery": 5, "pump": 1}[name]
        h = size // 2
        b = [math.floor(x) - h, math.floor(y) - h, math.floor(x) + h, math.floor(y) + h]
        t = {"pipe": "pipe", "pipe-to-ground": "pipe-to-ground", "chemical-plant": "assembling-machine"}.get(name, name)
        return self.add_raw({"n": name, "t": t, "x": x, "y": y, "d": d, "f": "player", "b": b, "rec": rec, "new": True})

    def set_recipe(self, x, y, rec):
        for e in self.ents:
            if not e.get("dead") and e["t"] == "assembling-machine" and abs(e["x"] - x) < 0.6 and abs(e["y"] - y) < 0.6:
                e["rec"] = rec
                e["recipe_changed"] = True
                return e
        raise KeyError((x, y))

    # ------------------------------------------------------------------
    def build(self):
        self.occ = {}
        errs = []
        for e in self.ents:
            if e.get("dead") or e["t"] in ("entity-ghost",):
                continue
            x0, y0, x1, y1 = e["b"]
            for tx in range(x0, x1 + 1):
                for ty in range(y0, y1 + 1):
                    k = (tx + 0.5, ty + 0.5)
                    if k in self.occ and e["new"]:
                        errs.append("COLLIDE %s@%s,%s with %s@%s,%s" % (e["n"], e["x"], e["y"], self.occ[k]["n"], self.occ[k]["x"], self.occ[k]["y"]))
                    if k not in self.occ or e["new"]:
                        self.occ[k] = e
        # connections: list of (node, src_tile, dst_tile)
        self.conns = []
        self.nodefluid = {}
        for e in self.ents:
            if e.get("dead") or e["t"] == "entity-ghost":
                continue
            p = K(e["x"], e["y"])
            if e["t"] == "pipe":
                n = (e["id"], 1)
                for d, (vx, vy) in V.items():
                    self.conns.append((n, p, K(p[0] + vx, p[1] + vy)))
                if not e["new"] and e.get("fb") and e["fb"][0]["fl"]:
                    self.nodefluid.setdefault(n, set()).add(e["fb"][0]["fl"] + "(pipe)")
            elif e["t"] == "pipe-to-ground":
                n = (e["id"], 1)
                vx, vy = V[e["d"]]
                self.conns.append((n, p, K(p[0] + vx, p[1] + vy)))
                if not e["new"] and e.get("fb") and e["fb"][0]["fl"]:
                    self.nodefluid.setdefault(n, set()).add(e["fb"][0]["fl"] + "(pipe)")
            else:
                tmpl = None
                if e["n"] == "chemical-plant" and (e["new"] or e.get("recipe_changed")):
                    tmpl = CHEM[e["rec"]]
                elif e["n"] == "oil-refinery" and e.get("recipe_changed"):
                    tmpl = REF[e["rec"]]
                if tmpl is not None:
                    for fb, fl, offs in tmpl:
                        n = (e["id"], fb)
                        self.nodefluid.setdefault(n, set()).add(fl)
                        for dx, dy in offs:
                            rx, ry = rot(dx, dy, e["d"])
                            t = K(p[0] + rx, p[1] + ry)
                            src = self.edge_src(e, t)
                            self.conns.append((n, src, t))
                elif e.get("fb"):
                    for fb in e["fb"]:
                        n = (e["id"], fb["i"])
                        f = fb["fi"] or fb["fl"]
                        if f:
                            self.nodefluid.setdefault(n, set()).add(f + ("" if fb["fi"] else "(content)"))
                        for c in fb["c"]:
                            if c[2] != "normal":
                                continue
                            t = K(c[0], c[1])
                            self.conns.append((n, self.edge_src(e, t), t))
        return errs

    def edge_src(self, e, t):
        x0, y0, x1, y1 = e["b"]
        for vx, vy in V.values():
            s = K(t[0] - vx, t[1] - vy)
            if x0 <= s[0] - 0.5 <= x1 and y0 <= s[1] - 0.5 <= y1:
                return s
        return K(e["x"], e["y"])

    def solve(self):
        errs = self.build()
        parent = {}

        def f(a):
            parent.setdefault(a, a)
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        def u(a, b):
            parent[f(a)] = f(b)

        by = defaultdict(list)
        for n, s, t in self.conns:
            f(n)
            by[(s, t)].append(n)
        for n, s, t in self.conns:
            for m in by.get((t, s), []):
                if m[0] != n[0]:
                    u(n, m)
        # underground pairing
        for e in self.ents:
            if e.get("dead") or e["t"] != "pipe-to-ground":
                continue
            vx, vy = V[e["d"]]
            ux, uy = -vx, -vy
            p = K(e["x"], e["y"])
            for k in range(1, 12):
                q = K(p[0] + ux * k, p[1] + uy * k)
                o = self.occ.get(q)
                if o and not o.get("dead") and o["t"] == "pipe-to-ground" and o["d"] in ((e["d"] + 8) % 16, e["d"]):
                    if o["d"] == (e["d"] + 8) % 16:
                        u((e["id"], 1), (o["id"], 1))
                    else:
                        errs.append("PTG same-facing block %s,%s -> %s,%s" % (e["x"], e["y"], o["x"], o["y"]))
                    break
            else:
                errs.append("PTG unpaired %s,%s d%s" % (e["x"], e["y"], e["d"]))
        comps = defaultdict(set)
        for n in parent:
            comps[f(n)].add(n)
        self.comp_of = {n: f(n) for n in parent}
        self.comps = comps
        bad = []
        for r, ns in comps.items():
            fl = set()
            for n in ns:
                for x in self.nodefluid.get(n, ()):
                    fl.add(x.split("(")[0])
            if len(fl) > 1:
                bad.append((r, fl))
        return errs, bad

    def describe(self, r, only_machines=True):
        out = []
        for n in sorted(self.comps[r]):
            e = self.ents[n[0]]
            if only_machines and e["t"] in ("pipe", "pipe-to-ground"):
                continue
            out.append("%s@%s,%s fb%d %s %s" % (e["n"], e["x"], e["y"], n[1], e.get("rec") or "", sorted(self.nodefluid.get(n, []))))
        return out

    def comp_at(self, x, y, fb=1):
        for e in self.ents:
            if not e.get("dead") and e["t"] != "entity-ghost" and x - 0.01 >= e["b"][0] and x - 0.01 <= e["b"][2] + 1 and e["b"][1] <= y - 0.01 <= e["b"][3] + 1 and abs(e["x"] - x) < (e["b"][2] - e["b"][0] + 1) / 2 and abs(e["y"] - y) < (e["b"][3] - e["b"][1] + 1) / 2:
                return self.comp_of.get((e["id"], fb))
        return None

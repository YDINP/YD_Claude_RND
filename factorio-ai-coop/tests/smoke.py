"""End-to-end smoke test against a live Factorio server running ai-bridge.

Run the server first (scripts/start-test-server.sh), then:
    python tests/smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bridge"))

from client import AIBridge, TaskFailed  # noqa: E402

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    (PASSED if condition else FAILED).append(name)
    print(f"  [{'PASS' if condition else 'FAIL'}] {name}{'  ' + detail if detail else ''}")


def main() -> int:
    print("connecting...")
    deadline = time.time() + 90
    ai = None
    while time.time() < deadline:
        try:
            ai = AIBridge()
            break
        except OSError:
            time.sleep(1)
    if ai is None:
        print("server never came up")
        return 1
    print("connected\n")

    print("1. spawn")
    spawned = ai.spawn()
    check("character spawned", bool(spawned and spawned.get("unit_number")), json.dumps(spawned))
    check("same force as humans", spawned.get("force") == "player")

    print("\n2. observe (aggregated, not enumerated)")
    world = ai.observe(radius=96)
    res = world.get("resources", {})
    check("observation returned", bool(world.get("tick")))
    check("resources aggregated", bool(res), ", ".join(f"{k}:{v['tiles']}t" for k, v in res.items()))
    # Lua cannot tell an empty array from an empty table, so zero humans
    # serialises as {} rather than [].
    check("humans reported", isinstance(world.get("humans"), (list, dict)),
          f"{len(world.get('humans') or [])} online")

    print("\n3. walk_to with pathfinding")
    t0 = time.time()
    landed = ai.walk_to(25, -18, tolerance=1.0)
    check("walked to goal", abs(landed.get("x", 0) - 25) < 3 and abs(landed.get("y", 0) + 18) < 3,
          f"{landed.get('x'):.1f},{landed.get('y'):.1f} in {time.time() - t0:.1f}s")

    print("\n4. mine ore (walks into reach, mines over ticks)")
    spot = ai.nearest("iron-ore", radius=200)
    if spot:
        t0 = time.time()
        mined = ai.mine(spot["x"], spot["y"], count=8, timeout=300, timeout_ticks=14400)
        check("mined iron ore", mined.get("mined", 0) >= 8,
              f"{json.dumps(mined)} in {time.time() - t0:.1f}s")
    else:
        check("mined iron ore", False, "no iron ore within 200 tiles")

    print("\n5. craft from mined materials")
    ai.give(**{"iron-plate": 20})
    crafted = ai.craft("iron-chest", count=2)
    check("crafted iron-chest", crafted.get("crafted", 0) == 2, json.dumps(crafted))

    print("\n6. build (consumes inventory, respects placement rules)")
    st = ai.status()
    placed = ai.place("iron-chest", round(st["x"]) + 2, round(st["y"]))
    check("placed iron-chest", placed.get("name") == "iron-chest",
          f"at {placed.get('x')},{placed.get('y')}")
    inv = ai.inventory()
    check("inventory consumed", inv["items"].get("iron-chest", 0) == 1,
          f"chests left: {inv['items'].get('iron-chest', 0)}")

    print("\n7. failure is reported, not hung")
    try:
        ai.place("nuclear-reactor", 0, 0)
        check("missing item rejected", False, "should have raised")
    except TaskFailed as exc:
        check("missing item rejected", "no nuclear-reactor" in str(exc), str(exc))

    print("\n8. batched plan in one round trip")
    ids = ai.submit_plan([
        ("walk_to", {"x": st["x"] - 10, "y": st["y"], "tolerance": 1.5}),
        ("wait", {"ticks": 30}),
        ("walk_to", {"x": st["x"], "y": st["y"], "tolerance": 1.5}),
    ])
    check("plan queued", len(ids) == 3, f"ids={ids}")
    ai.wait(ids[-1], timeout=180)
    check("plan completed", True)

    print("\n9. world still saves with the agent attached")
    ai.rcon.command('/silent-command game.server_save("ai-bridge-phase1")')
    time.sleep(4)
    save = r"D:\park\YD_Claude_RND\.factorio-bot\saves\ai-bridge-phase1.zip"
    check("server_save wrote a file", os.path.exists(save),
          f"{os.path.getsize(save)} bytes" if os.path.exists(save) else "missing")

    print("\n10. hostile input cannot kill the server")
    # A Lua error raised inside on_tick makes Factorio quit with "multiplayer
    # error", kicking every human in the game. Anything the agent can type must
    # therefore come back as a task failure instead.
    hostile = (
        ("bad recipe", lambda: ai.craft("does-not-exist")),
        ("bad entity", lambda: ai.place("not-a-real-entity", 0, 0)),
        ("absurd coordinates", lambda: ai.run("walk_to", timeout=40, x=1e9, y=1e9,
                                              timeout_ticks=120)),
        ("unknown task type", lambda: ai.submit("teleport_to_the_moon")),
    )
    for label, fn in hostile:
        try:
            outcome = f"returned {json.dumps(fn())}"
        except Exception as exc:  # noqa: BLE001 - any clean refusal is fine
            outcome = f"{type(exc).__name__}: {exc}"
        print(f"       {label}: {outcome[:110]}")

    alive = ai.status()
    check("server survived every hostile task", bool(alive.get("tick")), f"tick={alive.get('tick')}")

    ai.close()
    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

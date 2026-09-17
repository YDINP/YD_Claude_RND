"""Save the world with the agent attached, restart the server, keep playing.

This is the failure mode that stops FLE from being used on a persistent server
shared with humans (issue #381): Lua functions stored in `storage` cannot be
serialised, so the save silently fails and the session cannot be resumed. The
agent has to survive an ordinary server restart, because a coop game will get
restarted.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bridge"))

from client import AIBridge  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE = "persistence-test"
SAVE_PATH = rf"D:\park\YD_Claude_RND\.factorio-bot\saves\{SAVE}.zip"

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (PASSED if ok else FAILED).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{'  ' + detail if detail else ''}")


def connect(timeout: float = 120.0) -> AIBridge:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            return AIBridge()
        except OSError:
            time.sleep(1)
    raise RuntimeError("server never came up")


def restart_server(save_name: str) -> subprocess.Popen:
    return subprocess.Popen(
        ["bash", os.path.join(ROOT, "scripts", "start-test-server.sh"), save_name],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def main() -> int:
    print("1. set up a recognisable state")
    ai = connect()
    ai.spawn()
    ai.walk_to(18, 12, tolerance=1.0)
    ai.give(**{"iron-plate": 37})
    before = ai.status()
    inv_before = ai.inventory()["items"]
    print(f"     at {before['x']:.1f},{before['y']:.1f} carrying {inv_before}")

    print("\n2. save with the agent attached")
    if os.path.exists(SAVE_PATH):
        os.remove(SAVE_PATH)
    ai.rcon.command(f'/silent-command game.server_save("{SAVE}")')
    deadline = time.time() + 30
    while time.time() < deadline and not os.path.exists(SAVE_PATH):
        time.sleep(1)
    check("save file written", os.path.exists(SAVE_PATH),
          f"{os.path.getsize(SAVE_PATH)} bytes" if os.path.exists(SAVE_PATH) else "missing")
    ai.close()

    print("\n3. restart the server from that save")
    restart_server(SAVE)
    ai = connect()

    print("\n4. the agent is still there, mid-world, with its inventory")
    after = ai.status()
    check("character survived the restart", after.get("alive") is True, json.dumps(after)[:120])
    check("position preserved",
          abs(after.get("x", 0) - before["x"]) < 1 and abs(after.get("y", 0) - before["y"]) < 1,
          f"{after.get('x'):.1f},{after.get('y'):.1f} vs {before['x']:.1f},{before['y']:.1f}")
    inv_after = ai.inventory()["items"]
    check("inventory preserved", inv_after.get("iron-plate") == inv_before.get("iron-plate"),
          f"{inv_after.get('iron-plate')} iron plates")

    print("\n5. and it still takes orders")
    moved = ai.walk_to(after["x"] + 6, after["y"], tolerance=1.0)
    check("accepts tasks after reload", abs(moved.get("x", 0) - (after["x"] + 6)) < 2,
          f"walked to {moved.get('x'):.1f},{moved.get('y'):.1f}")
    ai.close()

    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

"""High-level client for the ai-bridge mod.

Everything an agent does goes through `remote.call("ai", fn, ...)` inside a
`/silent-command`. This module hides three sharp edges:

  1. The *first* Lua command of a server session is swallowed by Factorio's
     "this disables achievements, send it again to confirm" prompt. We warm up
     on connect so the caller never sees a mysterious empty reply.
  2. Lua argument marshalling: values go over as JSON and are rebuilt with
     `helpers.json_to_table`, so nested tables and floats survive intact.
  3. Tasks are asynchronous by design. `run()` submits and polls for you;
     `submit()` is there when you want to fire a plan and check back later.
"""

from __future__ import annotations

import json
import threading
import time
from typing import Any

from rcon import Rcon, RconError


class TaskFailed(RconError):
    def __init__(self, task: dict) -> None:
        super().__init__(f"{task.get('type')} failed: {task.get('error')}")
        self.task = task


class TaskTimeout(RconError):
    pass


def _lua_literal(value: Any) -> str:
    """Render a Python value as a Lua expression."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        escaped = (value.replace("\\", "\\\\")
                        .replace("'", "\\'")
                        .replace("\n", "\\n")
                        .replace("\r", "\\r")
                        .replace("\t", "\\t"))
        return "'" + escaped + "'"
    if value is None:
        return "nil"
    # Tables travel as JSON and are rebuilt on the Lua side.
    blob = json.dumps(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"helpers.json_to_table('{blob}')"


class AIBridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 27015,
                 password: str = "rcontest123") -> None:
        self.rcon = Rcon(host, port, password)
        # RCON is one socket carrying strictly paired request/response. Two
        # threads sending at once would each read the other's answer, so every
        # command goes through here one at a time. A single command is a
        # millisecond; long tasks poll, so this never blocks the caller for long.
        self._lock = threading.Lock()
        self._warm_up()

    def _warm_up(self) -> None:
        # Burn the achievement-confirmation prompt; the second one lands.
        for _ in range(2):
            self.rcon.command("/silent-command rcon.print('ready')")

    # -- plumbing ---------------------------------------------------------

    def lua(self, expr: str) -> Any:
        """Run `rcon.print(helpers.table_to_json(<expr>))` and parse the reply."""
        with self._lock:
            raw = self.rcon.command(
                f"/silent-command rcon.print(helpers.table_to_json({expr}))"
            ).strip()
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise RconError(f"unexpected reply from server: {raw[:300]}")

    def call(self, fn: str, *args: Any) -> dict:
        rendered = ", ".join(_lua_literal(a) for a in args)
        sep = ", " if rendered else ""
        reply = self.lua(f"remote.call('ai', '{fn}'{sep}{rendered})")
        if reply is None:
            # An empty reply means the command never produced output, which is
            # a transport problem, not an empty result.
            raise RconError(f"no reply from remote.call('ai', '{fn}')")
        return reply

    # -- world ------------------------------------------------------------

    def spawn(self, force: str = "player") -> dict:
        return self.call("spawn", force)

    def despawn(self) -> dict:
        return self.call("despawn")

    def status(self) -> dict:
        return self.call("status")

    def observe(self, radius: int = 64) -> dict:
        return self.call("observe", {"radius": radius})

    def inventory(self) -> dict:
        return self.call("inventory")

    def give(self, **items: int) -> dict:
        return self.call("give", items)

    # -- talking to the humans you are playing with ------------------------

    def chat(self, since_tick: int | None = None) -> dict:
        reply = self.call("chat", since_tick) if since_tick is not None else self.call("chat")
        # Lua serialises an empty list as {}; normalise for callers.
        messages = reply.get("messages")
        reply["messages"] = list(messages.values()) if isinstance(messages, dict) else (messages or [])
        return reply

    def say(self, text: str) -> dict:
        return self.call("say", text)

    # -- tasks ------------------------------------------------------------

    def submit(self, task_type: str, **params: Any) -> int:
        reply = self.call("submit", task_type, params)
        if not reply or "error" in reply:
            raise RconError((reply or {}).get("error", "submit failed"))
        return reply["id"]

    def submit_plan(self, steps: list[tuple[str, dict]]) -> list[int]:
        payload = [{"type": t, "params": p} for t, p in steps]
        reply = self.call("submit_many", payload)
        if "error" in reply:
            raise RconError(reply["error"])
        return reply["ids"]

    def poll(self, task_id: int) -> dict:
        return self.call("poll", task_id)

    def wait(self, task_id: int, timeout: float = 120.0, interval: float = 0.4) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            state = self.poll(task_id)
            status = state.get("status")
            if status == "done":
                return state.get("result") or {}
            if status == "failed":
                raise TaskFailed(state)
            if status == "unknown":
                raise RconError(f"task {task_id} vanished")
            time.sleep(interval)
        raise TaskTimeout(f"task {task_id} still running after {timeout}s")

    def run(self, task_type: str, timeout: float = 120.0, **params: Any) -> dict:
        return self.wait(self.submit(task_type, **params), timeout=timeout)

    # -- ergonomics (FLE-style verbs over the task queue) ------------------

    def walk_to(self, x: float, y: float, **kw: Any) -> dict:
        return self.run("walk_to", x=x, y=y, **kw)

    def mine(self, x: float, y: float, count: int = 10, **kw: Any) -> dict:
        return self.run("mine", x=x, y=y, count=count, **kw)

    def place(self, name: str, x: float, y: float, direction: int = 0, **kw: Any) -> dict:
        return self.run("build", name=name, x=x, y=y, direction=direction, **kw)

    def craft(self, recipe: str, count: int = 1, **kw: Any) -> dict:
        return self.run("craft", recipe=recipe, count=count, **kw)

    def insert(self, name: str, x: float, y: float, count: int = 1, **kw: Any) -> dict:
        return self.run("insert", name=name, x=x, y=y, count=count, **kw)

    def take(self, name: str, x: float, y: float, count: int = 1, **kw: Any) -> dict:
        return self.run("take", name=name, x=x, y=y, count=count, **kw)

    def buildings(self, radius: int = 64) -> dict:
        return self.observe(radius=radius).get("buildings") or {}

    def inspect(self, x: float, y: float, radius: float = 2) -> list[dict]:
        found = self.call("inspect", x, y, radius).get("entities")
        if isinstance(found, dict):
            return list(found.values())
        return found or []

    def nearest(self, resource: str, radius: int = 128) -> dict | None:
        found = self.observe(radius=radius).get("resources", {}).get(resource)
        return found.get("nearest") if found else None

    def cancel_all(self) -> dict:
        return self.call("cancel_all")

    def close(self) -> None:
        self.rcon.close()

    def __enter__(self) -> "AIBridge":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

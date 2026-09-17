"""Drive the MCP server the way a client would: spawn it, speak JSON-RPC at it."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER = os.path.join(ROOT, "bridge", "mcp_server.py")

PASSED: list[str] = []
FAILED: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    (PASSED if ok else FAILED).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}{'  ' + detail if detail else ''}")


class McpClient:
    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            [sys.executable, "-u", SERVER],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8",
        )
        self._id = 0

    def request(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        payload = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            payload["params"] = params
        self.proc.stdin.write(json.dumps(payload) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError("server closed stdout: " + self.proc.stderr.read())
        return json.loads(line)

    def notify(self, method: str) -> None:
        self.proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method}) + "\n")
        self.proc.stdin.flush()

    def tool(self, tool_name: str, **args: object) -> dict:
        # Not `name`: several tools take a `name` argument of their own.
        reply = self.request("tools/call", {"name": tool_name, "arguments": args})
        result = reply.get("result", {})
        text = (result.get("content") or [{}])[0].get("text", "")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = {"raw": text}
        return {"isError": result.get("isError", False), "data": parsed}

    def close(self) -> None:
        try:
            self.proc.stdin.close()
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()


def main() -> int:
    mcp = McpClient()

    print("1. handshake")
    init = mcp.request("initialize", {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "mcp_test", "version": "0"},
    })
    check("initialize", init.get("result", {}).get("serverInfo", {}).get("name") == "factorio-ai-coop",
          json.dumps(init.get("result", {}).get("serverInfo", {})))
    mcp.notify("notifications/initialized")

    print("\n2. tools/list")
    tools = mcp.request("tools/list").get("result", {}).get("tools", [])
    names = [t["name"] for t in tools]
    check("tools advertised", len(tools) >= 20, f"{len(tools)} tools")
    check("every tool has a schema", all("inputSchema" in t and t.get("description") for t in tools))
    check("coop chat tools present",
          "factorio_say" in names and "factorio_chat_read" in names)
    check("multi-agent tools present",
          {"factorio_agents", "factorio_add_agent", "factorio_remove_agent",
           "factorio_observer"} <= set(names))

    print("\n3. tools/call against the live game")
    spawned = mcp.tool("factorio_add_agent", name="alpha")
    check("add agent", not spawned["isError"] and spawned["data"].get("alive") is True,
          json.dumps(spawned["data"]))
    roster = mcp.tool("factorio_agents")
    names = [a["name"] for a in roster["data"].get("agents", [])]
    check("roster lists it", "alpha" in names, str(names))

    status = mcp.tool("factorio_status", agent="alpha")
    check("status call", not status["isError"] and status["data"].get("alive") is True,
          json.dumps(status["data"])[:120])

    observed = mcp.tool("factorio_observe", agent="alpha", radius=64)
    check("observe call", not observed["isError"] and "resources" in observed["data"],
          ", ".join((observed["data"].get("resources") or {}).keys()))

    print("\n4. chat round trip")
    said = mcp.tool("factorio_say", text="hello from the agent")
    check("say", not said["isError"], json.dumps(said["data"]))
    log = mcp.tool("factorio_chat_read")
    check("chat_read", not log["isError"] and "messages" in log["data"],
          f"{len(log['data'].get('messages') or [])} human messages so far")

    print("\n5. errors come back as errors, not hangs")
    bad = mcp.tool("factorio_craft", agent="alpha", recipe="does-not-exist")
    check("bad recipe reported", bad["isError"], json.dumps(bad["data"])[:140])
    unknown = mcp.tool("no_such_tool")
    check("unknown tool reported", unknown["isError"])

    print("\n6. async plan via MCP")
    plan = mcp.tool("factorio_plan", agent="alpha", steps=[
        {"type": "wait", "params": {"ticks": 30}},
        {"type": "wait", "params": {"ticks": 30}},
    ])
    ids = plan["data"].get("ids") or []
    check("plan queued", len(ids) == 2, f"ids={ids}")
    deadline = time.time() + 30
    final = {}
    while time.time() < deadline:
        final = mcp.tool("factorio_poll", task_id=ids[-1])["data"]
        if final.get("status") in ("done", "failed"):
            break
        time.sleep(0.5)
    check("plan finished", final.get("status") == "done", json.dumps(final))

    print("\n7. several agents at once")
    second = mcp.tool("factorio_add_agent", name="bravo")
    check("second agent added", not second["isError"] and second["data"].get("alive") is True,
          json.dumps(second["data"]))

    roster = mcp.tool("factorio_agents")["data"].get("agents", [])
    check("both on the roster", {"alpha", "bravo"} <= {a["name"] for a in roster},
          str([a["name"] for a in roster]))

    # With two of them, an unaddressed order is ambiguous. Guessing would
    # silently move whichever came first, so the tool refuses instead.
    ambiguous = mcp.tool("factorio_status")
    check("ambiguous order refused", ambiguous["isError"],
          json.dumps(ambiguous["data"])[:120])

    named = mcp.tool("factorio_status", agent="bravo")
    check("addressed order works", not named["isError"] and named["data"]["name"] == "bravo")

    apart = mcp.tool("factorio_observe", agent="alpha", radius=64)["data"]
    mates = apart.get("agents") or {}
    mates = list(mates.values()) if isinstance(mates, dict) else mates
    check("agents see each other", any(m["name"] == "bravo" for m in mates), str(mates)[:120])

    # Each one has its own queue: bravo working must not block alpha.
    bravo_plan = mcp.tool("factorio_plan", agent="bravo",
                          steps=[{"type": "wait", "params": {"ticks": 240}}])
    alpha_plan = mcp.tool("factorio_plan", agent="alpha",
                          steps=[{"type": "wait", "params": {"ticks": 30}}])
    alpha_id = (alpha_plan["data"].get("ids") or [None])[-1]
    deadline = time.time() + 25
    alpha_final = {}
    while time.time() < deadline:
        alpha_final = mcp.tool("factorio_poll", task_id=alpha_id)["data"]
        if alpha_final.get("status") in ("done", "failed"):
            break
        time.sleep(0.5)
    bravo_id = (bravo_plan["data"].get("ids") or [None])[-1]
    bravo_state = mcp.tool("factorio_poll", task_id=bravo_id)["data"]
    check("queues are independent",
          alpha_final.get("status") == "done" and bravo_state.get("status") == "running",
          f"alpha={alpha_final.get('status')} bravo={bravo_state.get('status')}")

    gone = mcp.tool("factorio_remove_agent", name="bravo")
    check("agent removed", not gone["isError"], json.dumps(gone["data"]))
    left = [a["name"] for a in mcp.tool("factorio_agents")["data"].get("agents", [])]
    check("roster shrank", "bravo" not in left, str(left))

    mcp.close()
    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

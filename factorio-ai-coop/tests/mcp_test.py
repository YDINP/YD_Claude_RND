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

    def tool(self, name: str, **args: object) -> dict:
        reply = self.request("tools/call", {"name": name, "arguments": args})
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
    check("tools advertised", len(tools) >= 13, f"{len(tools)} tools")
    check("every tool has a schema", all("inputSchema" in t and t.get("description") for t in tools))
    check("coop chat tools present",
          "factorio_say" in names and "factorio_chat_read" in names)

    print("\n3. tools/call against the live game")
    status = mcp.tool("factorio_status")
    check("status call", not status["isError"] and "tick" in status["data"],
          json.dumps(status["data"])[:120])

    spawned = mcp.tool("factorio_spawn")
    check("spawn call", not spawned["isError"] and spawned["data"].get("unit_number") is not None,
          json.dumps(spawned["data"]))

    observed = mcp.tool("factorio_observe", radius=64)
    check("observe call", not observed["isError"] and "resources" in observed["data"],
          ", ".join((observed["data"].get("resources") or {}).keys()))

    print("\n4. chat round trip")
    said = mcp.tool("factorio_say", text="hello from the agent")
    check("say", not said["isError"], json.dumps(said["data"]))
    log = mcp.tool("factorio_chat_read")
    check("chat_read", not log["isError"] and "messages" in log["data"],
          f"{len(log['data'].get('messages') or [])} human messages so far")

    print("\n5. errors come back as errors, not hangs")
    bad = mcp.tool("factorio_craft", recipe="does-not-exist")
    check("bad recipe reported", bad["isError"], json.dumps(bad["data"])[:140])
    unknown = mcp.tool("no_such_tool")
    check("unknown tool reported", unknown["isError"])

    print("\n6. async plan via MCP")
    plan = mcp.tool("factorio_plan", steps=[
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

    mcp.close()
    print(f"\n{len(PASSED)} passed, {len(FAILED)} failed")
    if FAILED:
        print("failed: " + ", ".join(FAILED))
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())

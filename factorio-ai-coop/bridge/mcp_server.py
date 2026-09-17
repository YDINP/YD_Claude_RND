"""MCP stdio server exposing the Factorio ai-bridge as tools.

Dependency-free on purpose: plain JSON-RPC over newline-delimited stdio, so the
same file works from Claude Code, Codex or anything else that speaks MCP without
a virtualenv to keep in sync.

Connection is lazy and self-healing. The server starts even when Factorio is
not running; the first tool call connects, and a dropped connection is retried
once, so restarting the game does not mean restarting the agent.

Environment:
    FACTORIO_RCON_HOST      default 127.0.0.1
    FACTORIO_RCON_PORT      default 27015
    FACTORIO_RCON_PASSWORD  default rcontest123
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any, Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from client import AIBridge, TaskFailed, TaskTimeout  # noqa: E402
from rcon import RconError  # noqa: E402

PROTOCOL_VERSION = "2025-06-18"
SERVER_INFO = {"name": "factorio-ai-coop", "version": "0.2.0"}

_bridge: AIBridge | None = None


def bridge() -> AIBridge:
    global _bridge
    if _bridge is None:
        _bridge = AIBridge(
            host=os.environ.get("FACTORIO_RCON_HOST", "127.0.0.1"),
            port=int(os.environ.get("FACTORIO_RCON_PORT", "27015")),
            password=os.environ.get("FACTORIO_RCON_PASSWORD", "rcontest123"),
        )
    return _bridge


def drop_bridge() -> None:
    global _bridge
    if _bridge is not None:
        _bridge.close()
    _bridge = None


# --------------------------------------------------------------------- tools

def _num(name: str, description: str) -> dict:
    return {name: {"type": "number", "description": description}}


TOOLS: list[dict] = [
    {
        "name": "factorio_status",
        "description": "Where the agent's character is, what it is doing right now, "
                       "what is queued, and how many humans are online.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "factorio_observe",
        "description": "Aggregated view of the surroundings: ore patches with tile counts "
                       "and nearest coordinates, own buildings by name, hostile count, and "
                       "where the human players are. Use this before deciding what to do.",
        "inputSchema": {
            "type": "object",
            "properties": {**_num("radius", "Tiles to look around, default 64")},
        },
    },
    {
        "name": "factorio_inventory",
        "description": "Items the agent's character is carrying, plus health and position.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "factorio_spawn",
        "description": "Create the agent's character next to a human player (or at origin if "
                       "nobody is online). Replaces any previous one and clears the queue.",
        "inputSchema": {
            "type": "object",
            "properties": {"force": {"type": "string",
                                     "description": "Force to join, default 'player' (same team as the humans)"}},
        },
    },
    {
        "name": "factorio_walk_to",
        "description": "Walk to a coordinate using the game's pathfinder. Blocks until arrival "
                       "or failure.",
        "inputSchema": {
            "type": "object",
            "properties": {**_num("x", "target x"), **_num("y", "target y"),
                           **_num("tolerance", "how close is close enough, default 0.5")},
            "required": ["x", "y"],
        },
    },
    {
        "name": "factorio_mine",
        "description": "Walk to an ore tile and hand-mine it until the requested number of "
                       "items is collected. Mining runs at normal hand-mining speed, so this "
                       "can take a while; raise timeout for large amounts.",
        "inputSchema": {
            "type": "object",
            "properties": {**_num("x", "ore x"), **_num("y", "ore y"),
                           **_num("count", "items to collect, default 10"),
                           **_num("timeout", "seconds to wait, default 300")},
            "required": ["x", "y"],
        },
    },
    {
        "name": "factorio_place",
        "description": "Walk into build range and place an entity from the character's "
                       "inventory. Fails if the item is missing or the spot is blocked.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Entity prototype name, e.g. 'transport-belt'"},
                **_num("x", "target x"), **_num("y", "target y"),
                **_num("direction", "0-15, north is 0 and values grow clockwise; default 0"),
            },
            "required": ["name", "x", "y"],
        },
    },
    {
        "name": "factorio_craft",
        "description": "Hand-craft a recipe. Fails if ingredients are missing or the recipe "
                       "is not researched.",
        "inputSchema": {
            "type": "object",
            "properties": {"recipe": {"type": "string", "description": "Recipe name, e.g. 'iron-gear-wheel'"},
                           **_num("count", "how many, default 1")},
            "required": ["recipe"],
        },
    },
    {
        "name": "factorio_plan",
        "description": "Queue several steps in one call and return their task ids without "
                       "waiting. Use factorio_poll to check on them. Steps are objects like "
                       '{"type": "walk_to", "params": {"x": 10, "y": 4}}.',
        "inputSchema": {
            "type": "object",
            "properties": {
                "steps": {
                    "type": "array",
                    "description": "Ordered steps; type is one of walk_to, mine, build, craft, wait",
                    "items": {
                        "type": "object",
                        "properties": {"type": {"type": "string"}, "params": {"type": "object"}},
                        "required": ["type"],
                    },
                }
            },
            "required": ["steps"],
        },
    },
    {
        "name": "factorio_poll",
        "description": "Check a task id submitted by factorio_plan: queued, running, done or failed.",
        "inputSchema": {
            "type": "object",
            "properties": {**_num("task_id", "id returned by factorio_plan")},
            "required": ["task_id"],
        },
    },
    {
        "name": "factorio_cancel",
        "description": "Stop the current task and drop everything queued. Use when a human "
                       "asks the agent to stop or change plans.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "factorio_chat_read",
        "description": "Read what the human players have typed in chat. Pass since_tick to get "
                       "only what is new; the reply carries the current tick to pass next time.",
        "inputSchema": {
            "type": "object",
            "properties": {**_num("since_tick", "only messages after this tick")},
        },
    },
    {
        "name": "factorio_say",
        "description": "Say something in the shared game chat, prefixed with [AI]. Use it to "
                       "tell your teammate what you are about to do or what you found.",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "Message to send"}},
            "required": ["text"],
        },
    },
]


HANDLERS: dict[str, Callable[[dict], Any]] = {
    "factorio_status": lambda a: bridge().status(),
    "factorio_observe": lambda a: bridge().observe(radius=int(a.get("radius", 64))),
    "factorio_inventory": lambda a: bridge().inventory(),
    "factorio_spawn": lambda a: bridge().spawn(force=a.get("force", "player")),
    "factorio_walk_to": lambda a: bridge().walk_to(
        a["x"], a["y"], **({"tolerance": a["tolerance"]} if "tolerance" in a else {})),
    "factorio_mine": lambda a: bridge().mine(
        a["x"], a["y"], count=int(a.get("count", 10)),
        timeout=float(a.get("timeout", 300)), timeout_ticks=14400),
    "factorio_place": lambda a: bridge().place(
        a["name"], a["x"], a["y"], direction=int(a.get("direction", 0))),
    "factorio_craft": lambda a: bridge().craft(a["recipe"], count=int(a.get("count", 1))),
    "factorio_plan": lambda a: {"ids": bridge().submit_plan(
        [(s["type"], s.get("params", {})) for s in a["steps"]])},
    "factorio_poll": lambda a: bridge().poll(int(a["task_id"])),
    "factorio_cancel": lambda a: bridge().cancel_all(),
    "factorio_chat_read": lambda a: bridge().chat(
        int(a["since_tick"]) if "since_tick" in a else None),
    "factorio_say": lambda a: bridge().say(a["text"]),
}


# Retrying is only safe when re-running the tool cannot change the world twice.
# A dropped reply does not mean the command never reached the server: it usually
# means it did, and the answer was lost. Replaying factorio_place would build a
# second chest; replaying factorio_spawn would destroy the character (and its
# inventory) that the first attempt created.
IDEMPOTENT = {
    "factorio_status", "factorio_observe", "factorio_inventory",
    "factorio_poll", "factorio_chat_read",
}


def call_tool(name: str, args: dict) -> dict:
    handler = HANDLERS.get(name)
    if handler is None:
        return {"content": [{"type": "text", "text": f"unknown tool: {name}"}], "isError": True}

    try:
        try:
            result = handler(args)
        except (RconError, OSError) as first:
            if isinstance(first, (TaskFailed, TaskTimeout)) or name not in IDEMPOTENT:
                drop_bridge()
                if isinstance(first, (TaskFailed, TaskTimeout)):
                    raise
                raise RconError(
                    f"{first}; the connection was reset and this tool is not safe to "
                    f"retry automatically. Call factorio_status to reconnect, check "
                    f"whether the action took effect, then decide."
                ) from first
            # Read-only tool: the game may simply have restarted. Reconnect.
            drop_bridge()
            result = handler(args)
    except TaskFailed as exc:
        return {"content": [{"type": "text", "text": json.dumps(exc.task, ensure_ascii=False)}],
                "isError": True}
    except Exception as exc:  # noqa: BLE001 - surfaced to the model, not swallowed
        return {"content": [{"type": "text", "text": f"{type(exc).__name__}: {exc}"}],
                "isError": True}

    return {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]}


# ------------------------------------------------------------------ jsonrpc

def handle(message: dict) -> dict | None:
    method = message.get("method")
    msg_id = message.get("id")

    if method == "initialize":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        }}
    if method in ("notifications/initialized", "notifications/cancelled"):
        return None
    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}
    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}}
    if method == "tools/call":
        params = message.get("params") or {}
        return {"jsonrpc": "2.0", "id": msg_id,
                "result": call_tool(params.get("name", ""), params.get("arguments") or {})}

    if msg_id is None:
        return None
    return {"jsonrpc": "2.0", "id": msg_id,
            "error": {"code": -32601, "message": f"method not found: {method}"}}


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        try:
            response = handle(message)
        except Exception:  # noqa: BLE001
            traceback.print_exc(file=sys.stderr)
            response = {"jsonrpc": "2.0", "id": message.get("id"),
                        "error": {"code": -32603, "message": "internal error"}}
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())

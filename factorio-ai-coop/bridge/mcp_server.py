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
SERVER_INFO = {"name": "factorio-ai-coop", "version": "0.3.0"}

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

AGENT_ARG = {"agent": {"type": "string",
                       "description": "Which agent to order. Required once more than one exists."}}


TOOLS: list[dict] = [
    {
        "name": "factorio_agents",
        "description": "The roster: every agent, where it is, and what it is doing. "
                       "Call this first - most other tools need an agent name.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "factorio_add_agent",
        "description": "Add an AI character to the game, next to whoever is already there. "
                       "Up to 8. They join the same force as the humans, so research, map and "
                       "buildings are shared.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Call sign, e.g. alpha"},
                "force": {"type": "string", "description": "Team, default player"},
            },
        },
    },
    {
        "name": "factorio_remove_agent",
        "description": "Remove an agent and its character from the game.",
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
    },
    {
        "name": "factorio_observer",
        "description": "Put a human player into the free-flying observer camera so they can watch "
                       "and give orders instead of playing. Passing adopt_as hands their character, "
                       "with everything in its pockets, to a new agent of that name; without it the "
                       "character is destroyed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "player": {"type": "string", "description": "In-game player name"},
                "adopt_as": {"type": "string",
                             "description": "Call sign for the agent that takes over their body"},
            },
            "required": ["player"],
        },
    },
    {
        "name": "factorio_unobserver",
        "description": "Give a spectating player a body again.",
        "inputSchema": {
            "type": "object",
            "properties": {"player": {"type": "string"}},
            "required": ["player"],
        },
    },
    {
        "name": "factorio_status",
        "description": "Where an agent is, what it is doing right now, and what is queued.",
        "inputSchema": {"type": "object", "properties": {**AGENT_ARG}},
    },
    {
        "name": "factorio_observe",
        "description": "Aggregated view around an agent: ore patches with tile counts and nearest "
                       "coordinates, own buildings, hostile count, where the humans are and where "
                       "the other agents are. Use this before deciding what to do.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "radius": {"type": "number",
                                      "description": "Tiles, default 64, capped at 200"}},
        },
    },
    {
        "name": "factorio_inventory",
        "description": "What an agent is carrying, plus health and position.",
        "inputSchema": {"type": "object", "properties": {**AGENT_ARG}},
    },
    {
        "name": "factorio_walk_to",
        "description": "Walk to a coordinate using the pathfinder. Blocks until arrival or failure.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "x": {"type": "number"}, "y": {"type": "number"},
                           "tolerance": {"type": "number", "description": "default 0.5"}},
            "required": ["x", "y"],
        },
    },
    {
        "name": "factorio_mine",
        "description": "Walk to an ore tile and hand-mine it until the requested number of items is "
                       "collected. Runs at normal hand-mining speed, so large amounts take a while. "
                       "Crude oil cannot be hand-mined.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "x": {"type": "number"}, "y": {"type": "number"},
                           "count": {"type": "number", "description": "default 10"},
                           "timeout": {"type": "number", "description": "seconds, default 300"}},
            "required": ["x", "y"],
        },
    },
    {
        "name": "factorio_place",
        "description": "Walk into build range and place an entity from the inventory. Fails if the "
                       "item is missing or the spot is blocked; pass snap to let the game pick a "
                       "free tile nearby instead.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "name": {"type": "string", "description": "e.g. transport-belt"},
                           "x": {"type": "number"}, "y": {"type": "number"},
                           "direction": {"type": "number",
                                         "description": "0-15, north is 0, growing clockwise"},
                           "snap": {"type": "boolean", "description": "allow a nearby free tile"}},
            "required": ["name", "x", "y"],
        },
    },
    {
        "name": "factorio_craft",
        "description": "Hand-craft a recipe. Fails if ingredients are missing or it is not researched.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "recipe": {"type": "string"},
                           "count": {"type": "number", "description": "default 1"}},
            "required": ["recipe"],
        },
    },
    {
        "name": "factorio_insert",
        "description": "Put items from the inventory into a building: fuel into a drill, ore into a "
                       "furnace, anything into a chest.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "name": {"type": "string", "description": "item name"},
                           "x": {"type": "number"}, "y": {"type": "number"},
                           "count": {"type": "number", "description": "default 1"}},
            "required": ["name", "x", "y"],
        },
    },
    {
        "name": "factorio_take",
        "description": "Take items out of a building, for example plates out of a furnace.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "name": {"type": "string", "description": "item name"},
                           "x": {"type": "number"}, "y": {"type": "number"},
                           "count": {"type": "number", "description": "default 1"}},
            "required": ["name", "x", "y"],
        },
    },
    {
        "name": "factorio_inspect",
        "description": "What is standing on a spot, including where a mining drill drops its ore. "
                       "Use this to put a chest exactly where a drill outputs.",
        "inputSchema": {
            "type": "object",
            "properties": {"x": {"type": "number"}, "y": {"type": "number"},
                           "radius": {"type": "number", "description": "default 2"}},
            "required": ["x", "y"],
        },
    },
    {
        "name": "factorio_plan",
        "description": "Queue several steps for one agent in a single call and return their task ids "
                       "without waiting. A step looks like "
                       "{\"type\": \"walk_to\", \"params\": {\"x\": 10, \"y\": 4}}. "
                       "Types: walk_to, mine, build, craft, insert, take, wait.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG,
                           "steps": {"type": "array",
                                     "items": {"type": "object",
                                               "properties": {"type": {"type": "string"},
                                                              "params": {"type": "object"}},
                                               "required": ["type"]}}},
            "required": ["steps"],
        },
    },
    {
        "name": "factorio_poll",
        "description": "Check a task id from factorio_plan: queued, running, done or failed.",
        "inputSchema": {
            "type": "object",
            "properties": {"task_id": {"type": "number"}},
            "required": ["task_id"],
        },
    },
    {
        "name": "factorio_cancel",
        "description": "Stop what an agent is doing and drop its queue. Without agent, stops all.",
        "inputSchema": {"type": "object", "properties": {**AGENT_ARG}},
    },
    {
        "name": "factorio_chat_read",
        "description": "Read what the human players have typed in chat. Pass since_tick for only "
                       "what is new; the reply carries the current tick to pass next time.",
        "inputSchema": {
            "type": "object",
            "properties": {"since_tick": {"type": "number"}},
        },
    },
    {
        "name": "factorio_say",
        "description": "Say something in the shared game chat. Pass agent to speak as that one.",
        "inputSchema": {
            "type": "object",
            "properties": {**AGENT_ARG, "text": {"type": "string"}},
            "required": ["text"],
        },
    },
]


def who(args: dict):
    """Which character a tool call is about.

    With one agent the caller can leave `agent` out; with several, leaving it
    out would silently order whichever one happens to be first, so it is
    required as soon as a second agent exists.
    """
    roster = bridge().names()
    if not roster:
        raise RconError("no agents yet; call factorio_add_agent first")
    name = args.get("agent")
    if name:
        if name not in roster:
            raise RconError(f"no such agent: {name}; roster is {', '.join(roster)}")
        return bridge().agent(name)
    if len(roster) > 1:
        raise RconError(f"several agents exist ({', '.join(roster)}); pass `agent`")
    return bridge().agent(roster[0])


HANDLERS: dict[str, Callable[[dict], Any]] = {
    "factorio_agents": lambda a: {"agents": bridge().list()},
    "factorio_add_agent": lambda a: bridge().spawn(
        a.get("name") or f"agent{len(bridge().names()) + 1}",
        force=a.get("force", "player")).status(),
    "factorio_remove_agent": lambda a: bridge().remove(a["name"]),
    "factorio_status": lambda a: who(a).status(),
    "factorio_observe": lambda a: who(a).observe(radius=int(a.get("radius", 64))),
    "factorio_inventory": lambda a: who(a).inventory(),
    "factorio_walk_to": lambda a: who(a).walk_to(
        a["x"], a["y"], **({"tolerance": a["tolerance"]} if "tolerance" in a else {})),
    "factorio_mine": lambda a: who(a).mine(
        a["x"], a["y"], count=int(a.get("count", 10)),
        timeout=float(a.get("timeout", 300)), timeout_ticks=14400),
    "factorio_place": lambda a: who(a).place(
        a["name"], a["x"], a["y"], direction=int(a.get("direction", 0)),
        **({"snap": True} if a.get("snap") else {})),
    "factorio_craft": lambda a: who(a).craft(a["recipe"], count=int(a.get("count", 1))),
    "factorio_insert": lambda a: who(a).insert(
        a["name"], a["x"], a["y"], count=int(a.get("count", 1))),
    "factorio_take": lambda a: who(a).take(
        a["name"], a["x"], a["y"], count=int(a.get("count", 1))),
    "factorio_plan": lambda a: {"ids": who(a).submit_plan(
        [(s["type"], s.get("params", {})) for s in a["steps"]])},
    "factorio_poll": lambda a: bridge().poll(int(a["task_id"])),
    "factorio_cancel": lambda a: (who(a).cancel() if a.get("agent")
                                  else bridge().cancel_all()),
    "factorio_inspect": lambda a: {"entities": bridge().inspect(
        a["x"], a["y"], float(a.get("radius", 2)))},
    "factorio_chat_read": lambda a: bridge().chat(
        int(a["since_tick"]) if "since_tick" in a else None),
    "factorio_say": lambda a: bridge().say(a["text"], who=a.get("agent") or "AI"),
    "factorio_observer": lambda a: bridge().spectate(
        a["player"], adopt_as=a.get("adopt_as")),
    "factorio_unobserver": lambda a: bridge().unspectate(a["player"]),
}


# Retrying is only safe when re-running the tool cannot change the world twice.
# A dropped reply does not mean the command never reached the server: it usually
# means it did, and the answer was lost. Replaying factorio_place would build a
# second chest; replaying factorio_spawn would destroy the character (and its
# inventory) that the first attempt created.
IDEMPOTENT = {
    "factorio_agents", "factorio_status", "factorio_observe",
    "factorio_inventory", "factorio_poll", "factorio_chat_read", "factorio_inspect",
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

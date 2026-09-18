"""High-level client for the ai-bridge mod.

Everything goes through `remote.call("ai", fn, ...)` inside a `/silent-command`.
This module hides three sharp edges:

  1. The *first* Lua command of a server session is swallowed by Factorio's
     "this disables achievements, send it again to confirm" prompt. We warm up
     on connect so the caller never sees a mysterious empty reply.
  2. Lua argument marshalling: values go over as JSON and are rebuilt with
     `helpers.json_to_table`, so nested tables and floats survive intact.
  3. Tasks are asynchronous by design. `run()` submits and polls for you;
     `submit()` is there when you want to fire a plan and check back later.

The connection and the characters are separate things. `AIBridge` is the
connection and the world-level calls; `Agent` is one character you can order
around. Several agents share one connection.
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


def _as_list(value: Any) -> list:
    """Lua cannot tell an empty array from an empty table; both arrive as {}."""
    if isinstance(value, dict):
        return list(value.values())
    return value or []


class AIBridge:
    """The RCON connection and everything that is not about one character."""

    def __init__(self, host: str = "127.0.0.1", port: int = 27015,
                 password: str = "rcontest123") -> None:
        self.rcon = Rcon(host, port, password)
        # RCON is one socket carrying strictly paired request/response. Two
        # threads sending at once would each read the other's answer, so every
        # command goes through here one at a time. A single command is a
        # millisecond; long tasks poll, so this never blocks a caller for long.
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
            raise RconError(f"no reply from remote.call('ai', '{fn}')")
        return reply

    # -- the roster -------------------------------------------------------

    def spawn(self, name: str = "agent", force: str = "player") -> "Agent":
        reply = self.call("spawn", name, force)
        if "error" in reply:
            raise RconError(reply["error"])
        return Agent(self, name)

    def agent(self, name: str) -> "Agent":
        """A handle for an agent that already exists."""
        return Agent(self, name)

    def remove(self, name: str) -> dict:
        return self.call("remove", name)

    def list(self) -> list[dict]:
        return _as_list(self.call("list").get("agents"))

    def names(self) -> list[str]:
        return [a["name"] for a in self.list()]

    def cancel_all(self) -> dict:
        return self.call("cancel_all")

    # -- the world --------------------------------------------------------

    def inspect(self, x: float, y: float, radius: float = 2) -> list[dict]:
        return _as_list(self.call("inspect", x, y, radius).get("entities"))

    def poll(self, task_id: int) -> dict:
        return self.call("poll", task_id)

    # -- talking to the humans --------------------------------------------

    def chat(self, since_tick: int | None = None) -> dict:
        reply = self.call("chat", since_tick) if since_tick is not None else self.call("chat")
        reply["messages"] = _as_list(reply.get("messages"))
        return reply

    def say(self, text: str, who: str = "AI") -> dict:
        return self.call("say", text, who)

    # -- keeping the world ------------------------------------------------

    def save(self) -> dict:
        """Write the world back over the save the server is running.

        A headless server only does this by itself on a clean shutdown, and a
        closed window is not a clean shutdown.
        """
        return self.call("save")

    def save_status(self) -> dict:
        return self.call("save_status")

    # -- the tech tree -----------------------------------------------------

    def technology(self, name: str) -> dict:
        return self.call("technology", name)

    def research(self, name: str) -> dict:
        return self.call("research", name)

    def available_research(self) -> list[dict]:
        """지금 시작할 수 있는 연구들."""
        return _as_list(self.call("available_research").get("available"))

    def research_status(self) -> dict:
        return self.call("research_status")

    def research_state(self) -> dict:
        """Which of the technologies the planner reasons about are in already.

        Only the ones on the path to an assembling machine: asking the game for
        all 217 every second would be a scan nobody needs.
        """
        status = self.call("research_status")
        done = set()
        for name in ("electronics", "steam-power", "automation-science-pack", "automation"):
            if self.call("technology", name).get("researched"):
                done.add(name)
        return {"researched": done, "current": status.get("current"),
                "progress": status.get("progress"), "labs": status.get("labs")}

    def panel(self, player: str, show: bool | None = None) -> dict:
        """Open, close or toggle the crew panel for a player."""
        return self.call("panel", player, show)

    def crew_log(self, limit: int = 20) -> list[dict]:
        """The agent chatter the mod has collected, oldest first."""
        return _as_list(self.call("crew_log", limit).get("lines"))

    def chat_window(self, player: str, show: bool | None = None) -> dict:
        """Open, close or toggle the crew's own chat window for a player."""
        return self.call("chat_window", player, show)

    def set_focus(self, name: str, focus: str) -> dict:
        return self.call("set_focus", name, focus)

    def plan_item(self, agent: str, item: str, count: int = 1) -> dict:
        """이 아이템을 만들려면 지금 무엇부터 해야 하는가.

        레시피 트리를 파이썬에서 걸어다니면 RCON을 스무 번 왕복한다. 게임은
        레시피도 인벤토리도 알고 있으니 한 번만 물어본다.
        """
        return self.call("plan_item", agent, item, count)

    def drill_site(self, agent: str, x: float, y: float, radius: int = 12,
                   receiver: str = "iron-chest",
                   ore: str | None = None) -> list[dict]:
        """이 광석의 두꺼운 자리들. 채굴기가 들어가고 출구에 receiver 가 놓인다.

        receiver 가 화로면 광석이 인서터 없이 바로 제련된다. 상자면 쌓이기만
        한다 - 무엇을 놓을지가 «손으로 나르는가»를 가른다.

        ore 를 주지 않으면 그 근처의 아무 자원이나 고른다. 돌을 자동화하러
        간 일감이 옆의 석탄을 집어 상자를 달아버린 적이 있다.
        """
        return _as_list(
            self.call("drill_site", agent, x, y, radius, receiver, ore)
                .get("sites"))

    def coal_pair_site(self, agent: str, x: float, y: float,
                       radius: int = 16, pairs: int = 2) -> dict:
        """석탄 위에서 서로를 먹이는 채굴기 두 대의 자리."""
        return self.call("coal_pair_site", agent, x, y, radius, pairs)

    def aim_drill(self, agent: str, x: float, y: float) -> dict:
        """이미 놓인 채굴기를 출구가 비는 방향으로 돌린다."""
        return self.call("aim_drill", agent, x, y)

    def broken(self, agent: str, radius: int = 200) -> list[dict]:
        """지금 멈춰 서 있는 기계들, 가까운 순.

        무엇이 왜 멈췄는지는 게임이 엔티티마다 status 로 들고 있다. 짐작할
        필요가 없다.
        """
        return _as_list(self.call("broken", agent, radius).get("stopped"))

    def set_depot(self, x: float, y: float) -> dict:
        """공용 창고 자리를 정한다."""
        return self.call("set_depot", x, y)

    def depot(self) -> dict:
        """공용 창고와 그 안에 든 것. 없어졌으면 depot 이 None."""
        return self.call("depot")

    def chest_stock(self, agent: str, item: str, radius: int = 200) -> list[dict]:
        """이 아이템이 든 상자들, 가까운 순."""
        return _as_list(self.call("chest_stock", agent, item, radius).get("chests"))

    def stores(self, agent: str, radius: int = 200, limit: int = 12) -> dict:
        """상자들 안을 통째로. {chests: [...], total: {...}, chest_count: n}"""
        return self.call("stores", agent, radius, limit)

    def furnace_stock(self, agent: str, radius: int = 200) -> list[dict]:
        """화로 안에 다 녹은 채 남아 있는 것들, 가까운 순."""
        return _as_list(self.call("furnace_stock", agent, radius).get("stock"))

    def set_board(self, goal: str, lines: list[str]) -> dict:
        """The goal line and the open requests, for the in-game panel.

        The mod cannot know either: both live in the daemon. It stores what it
        is given and draws it, so the panel says the same thing the chat does.
        """
        return self.call("set_board", goal, lines)

    def blocking(self, agent: str, radius: int = 120) -> list[dict]:
        """길 위에 서 있는 우리 건물들, 가까운 순."""
        return _as_list(self.call("blocking", agent, radius).get("blocking"))

    def threat(self, agent: str, radius: int = 300) -> dict:
        """둥지가 얼마나 가까운지, 대비 수단이 열려 있는지."""
        return self.call("threat", agent, radius)

    def wire_spot(self, agent: str, x: float, y: float,
                  pole: str = "small-electric-pole") -> dict:
        """이 기계에 전봇대가 실제로 «닿는» 자리. 이미 붙어 있으면 already."""
        return self.call("wire_spot", agent, x, y, pole)

    def fuel_rig(self, agent: str, x: float, y: float) -> dict:
        """이 기계를 영구히 먹일 «상자-인서터» 자리. 없으면 error."""
        return self.call("fuel_rig", agent, x, y)

    def set_recipe(self, agent: str, x: float, y: float, recipe: str) -> dict:
        """조립기에 무엇을 만들지 정해준다."""
        return self.call("set_recipe", agent, x, y, recipe)

    def assembler_site(self, agent: str, x: float, y: float,
                       arm: str = "inserter") -> dict:
        """랩 옆 조립기 자리와 그 사이 인서터 자리."""
        return self.call("assembler_site", agent, x, y, arm)

    def unstick(self, agent: str, x: float | None = None,
                y: float | None = None) -> dict:
        """걸어서 못 나오는 곳에 갇힌 사람을 동료 옆으로 옮긴다."""
        if x is None or y is None:
            return self.call("unstick", agent)
        return self.call("unstick", agent, x, y)

    def hungry_rigs(self, agent: str, radius: int = 200) -> list[dict]:
        """세워는 놨는데 상자가 빈 급유 장치들, 가까운 순."""
        return _as_list(self.call("hungry_rigs", agent, radius).get("empty"))

    def belt_route(self, agent: str, fx: float, fy: float,
                   tx: float, ty: float,
                   kind: str = "transport-belt") -> dict:
        """두 점을 잇는 벨트 길. tiles = [{x, y, dir}, ...]"""
        return self.call("belt_route", agent, fx, fy, tx, ty, kind)

    def poor_drills(self, agent: str, floor: int = 400,
                    radius: int = 200) -> list[dict]:
        """얇은 자리에 선 채굴기들, 얇은 순. 마르기를 기다릴 이유가 없다."""
        return _as_list(self.call("poor_drills", agent, floor, radius).get("poor"))

    def blind_drills(self, agent: str, radius: int = 200) -> list[dict]:
        """출구가 없어 멈춘 채굴기들. seat 은 그 앞에 화로를 놓을 자리다."""
        return _as_list(self.call("blind_drills", agent, radius).get("blind"))

    def ore_line(self, agent: str, fx: float | None = None,
                 fy: float | None = None, limit: int = 20) -> dict:
        """캐는 구역에서 제련 구역까지의 광석 길. 아직 없는 것만 돌려준다."""
        return self.call("ore_line", agent, fx, fy, limit)

    def flows(self, agent: str, limit: int = 1) -> list[dict]:
        """물류 전체 - 무엇이 어디서 어디로 흐르고, 무엇이 아직 없는가."""
        return _as_list(self.call("flows", agent, limit).get("flows"))

    def flow_plan(self, agent: str, which: str, limit: int = 20) -> dict:
        """한 흐름의 다음 할 일."""
        return self.call("flow_plan", agent, which, limit)

    def loose_belts(self, agent: str, limit: int = 12) -> list[dict]:
        """정해진 길 위에 없는 벨트들. 걷어내면 손에 돌아온다."""
        return _as_list(self.call("loose_belts", agent, limit).get("loose"))

    def zones(self, agent: str) -> dict:
        """무엇을 어디서 하는가 - 채굴 / 제련 / 조립."""
        return self.call("zones", agent)

    def misplaced(self, agent: str, limit: int = 8) -> dict:
        """제자리가 아닌 건물들. settled 는 이미 제자리에 선 수."""
        return self.call("misplaced", agent, limit)

    def draw_zones(self, agent: str) -> dict:
        """구역을 지도에 표시한다. 관전하는 사람이 보라고."""
        return self.call("draw_zones", agent)

    def base(self) -> dict:
        """우리 건물 전체의 무게중심. 사람 반경에 매이지 않는 유일한 시야다."""
        return self.call("base")

    def smelter(self, x: float | None = None,
                y: float | None = None) -> dict | None:
        """제련 블록의 왼쪽 위 모서리. 한 번 정하면 모두가 같은 곳을 본다."""
        reply = self.call("smelter", x, y) if x is not None else self.call("smelter")
        return reply.get("smelter")

    def strays(self, kind: str = "stone-furnace", far: int = 60) -> dict:
        """기지에서 너무 멀리 홀로 선 우리 건물들, 먼 것부터."""
        return self.call("strays", kind, far)

    def feeds(self, x: float, y: float) -> dict:
        """그 채굴기가 지금 무엇에게 넣고 있는가. 세운 뒤 확인용."""
        return self.call("feeds", x, y)

    def health(self, agent: str, radius: int = 400) -> dict:
        """세운 수가 아니라 도는 수. {이름: {built, working, why}}"""
        answer = self.call("health", agent, radius).get("machines")
        return answer if isinstance(answer, dict) else {}

    def power_reach(self, x: float, y: float) -> dict:
        """전기가 있는 가장 가까운 전봇대와, 여기까지의 거리."""
        return self.call("power_reach", x, y)

    def pole_route(self, agent: str, fx: float, fy: float, tx: float, ty: float,
                   limit: int = 8) -> dict:
        """두 점 사이에 전봇대를 놓을 자리들. 막히면 거기까지만."""
        return self.call("pole_route", agent, fx, fy, tx, ty, limit)

    def power_faults(self, agent: str) -> dict:
        """발전소가 어디서 끊겼는지. poles / pipes / fuel / water."""
        return self.call("power_faults", agent)

    def power_status(self, agent: str) -> dict:
        """전기가 실제로 흐르는가. 서 있는 기관 수가 아니라."""
        return self.call("power_status", agent)

    def power_plan(self, agent: str, x: float, y: float, radius: int = 150,
                   engines: int = 2) -> dict:
        """펌프-보일러-기관이 통째로 들어가는 자리. 확인된 좌표만 돌려준다."""
        return self.call("power_plan", agent, x, y, radius, engines)

    def water_sites(self, x: float, y: float, radius: int = 120,
                    wanted: int = 3) -> list[dict]:
        return _as_list(self.call("water_sites", x, y, radius, wanted).get("sites"))

    # -- the observer seat -------------------------------------------------

    def spectate(self, player: str, adopt_as: str | None = None) -> dict:
        """Move a human to the observer camera.

        `adopt_as` hands their character (and its inventory) to a new agent of
        that name instead of destroying it.
        """
        reply = self.call("spectate", player, adopt_as)
        if "error" in reply:
            raise RconError(reply["error"])
        return reply

    def unspectate(self, player: str) -> dict:
        reply = self.call("unspectate", player)
        if "error" in reply:
            raise RconError(reply["error"])
        return reply

    def close(self) -> None:
        self.rcon.close()

    def __enter__(self) -> "AIBridge":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


class Agent:
    """One character. Ordering it around is asynchronous underneath."""

    def __init__(self, bridge: AIBridge, name: str) -> None:
        self.bridge = bridge
        self.name = name

    def __repr__(self) -> str:
        return f"<Agent {self.name}>"

    # -- state ------------------------------------------------------------

    def status(self) -> dict:
        return self.bridge.call("status", self.name)

    def observe(self, radius: int = 64) -> dict:
        return self.bridge.call("observe", self.name, {"radius": radius})

    def inventory(self) -> dict:
        return self.bridge.call("inventory", self.name)

    def items(self) -> dict[str, int]:
        return self.inventory().get("items", {})

    def give(self, **items: int) -> dict:
        return self.bridge.call("give", self.name, items)

    def nearest(self, resource: str, radius: int = 200) -> dict | None:
        found = self.observe(radius=radius).get("resources", {}).get(resource)
        return found.get("nearest") if found else None

    # -- tasks ------------------------------------------------------------

    def submit(self, task_type: str, **params: Any) -> int:
        reply = self.bridge.call("submit", self.name, task_type, params)
        if "error" in reply:
            raise RconError(reply["error"])
        return reply["id"]

    def submit_plan(self, steps: list[tuple[str, dict]]) -> list[int]:
        payload = [{"type": t, "params": p} for t, p in steps]
        reply = self.bridge.call("submit_many", self.name, payload)
        if "error" in reply:
            raise RconError(reply["error"])
        return reply["ids"]

    def poll(self, task_id: int) -> dict:
        return self.bridge.poll(task_id)

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

    def cancel(self) -> dict:
        return self.bridge.call("cancel", self.name)

    def busy(self) -> bool:
        state = self.status()
        return bool(state.get("current")) or bool(state.get("queued"))

    # -- verbs ------------------------------------------------------------

    def walk_to(self, x: float, y: float, **kw: Any) -> dict:
        return self.run("walk_to", x=x, y=y, **kw)

    def mine(self, x: float, y: float, count: int = 10, **kw: Any) -> dict:
        return self.run("mine", x=x, y=y, count=count, **kw)

    def sweep(self, x: float, y: float, radius: int = 3, **kw: Any) -> dict:
        """바닥에 흩어진 것을 줍는다. 치우는 일이면서 동시에 거두는 일이다."""
        return self.run("sweep", x=x, y=y, radius=radius, **kw)

    def place(self, name: str, x: float, y: float, direction: int = 0, **kw: Any) -> dict:
        return self.run("build", name=name, x=x, y=y, direction=direction, **kw)

    def demolish(self, x: float, y: float, name: str | None = None,
                 **kw: Any) -> dict:
        """우리 건물을 걷어낸다. 자재는 가방으로 돌아온다.

        놓을 줄만 알고 치울 줄을 모르면 실수가 영원히 남는다. 자리를 옮기는
        것은 이것과 place 를 이어 붙이면 된다.
        """
        params = {"x": x, "y": y, **kw}
        if name:
            params["name"] = name
        return self.run("demolish", **params)

    def chop(self, x: float, y: float, count: int = 4, **kw: Any) -> dict:
        """Fell trees for wood. Trees are not a resource, so mine cannot see them."""
        return self.run("chop", x=x, y=y, count=count, **kw)

    def craft(self, recipe: str, count: int = 1, **kw: Any) -> dict:
        return self.run("craft", recipe=recipe, count=count, **kw)

    def insert(self, name: str, x: float, y: float, count: int = 1, **kw: Any) -> dict:
        return self.run("insert", name=name, x=x, y=y, count=count, **kw)

    def take(self, name: str, x: float, y: float, count: int = 1, **kw: Any) -> dict:
        return self.run("take", name=name, x=x, y=y, count=count, **kw)

    def say(self, text: str) -> dict:
        return self.bridge.say(text, who=self.name)

"""LLM fallback for chat the rule parser does not recognise.

Shells out to the Claude Code CLI (`claude -p`), so it needs no API key of its
own and no extra dependency - it reuses the login the user already has.

A call costs several seconds, which is fine for "build two furnaces near the
lake" and far too slow for a per-tick decision. That is why this sits behind the
rule parser rather than replacing it: known phrasings answer instantly, and only
the rest pay for a round trip.

Whatever comes back is treated as untrusted input. The model can propose steps;
it cannot invent task types, and every number is range-checked before it reaches
the game.
"""

from __future__ import annotations

import json
import re
import subprocess
from typing import Any

ALLOWED_TASKS = {"walk_to", "mine", "build", "craft", "insert", "take", "wait"}
MAX_STEPS = 12
MAX_COORD = 100_000
MAX_COUNT = 200

BRIEF = """\
너는 Factorio 멀티플레이 게임 안에서 사람과 함께 플레이하는 AI 캐릭터다.
사람이 게임 채팅으로 말을 걸었다. 아래 상황을 보고 무엇을 할지 정해라.

출력은 JSON 하나만. 설명도, 코드펜스도 붙이지 마라.
{"say": "게임 채팅으로 할 말 (한국어, 한두 문장)", "steps": [...]}

steps는 비워도 된다(잡담이나 질문이면 비운다). 쓸 수 있는 동작은 이것뿐이다:

  {"type":"walk_to","params":{"x":숫자,"y":숫자}}          - 걸어간다
  {"type":"mine","params":{"x":숫자,"y":숫자,"count":숫자}} - 그 좌표의 광맥을 캔다
  {"type":"build","params":{"name":"엔티티명","x":숫자,"y":숫자,"snap":true}} - 설치(인벤토리에 있어야 함)
  {"type":"craft","params":{"recipe":"레시피명","count":숫자}} - 손 제작
  {"type":"insert","params":{"name":"아이템","x":숫자,"y":숫자,"count":숫자}} - 건물에 넣기
  {"type":"take","params":{"name":"아이템","x":숫자,"y":숫자,"count":숫자}}   - 건물에서 꺼내기
  {"type":"wait","params":{"ticks":숫자}}                  - 기다린다 (60틱 = 1초)

규칙:
- 좌표는 아래 상황에 실제로 나온 값을 써라. 없는 좌표를 지어내지 마라.
- 인벤토리에 없는 것은 설치할 수 없다. 필요하면 craft를 먼저 넣어라.
- 최대 {max_steps}단계까지.
- 할 수 없는 일이면 steps를 비우고 say로 이유를 말해라.
"""


def _snapshot_text(snap: Any) -> str:
    lines = [
        f"내 위치: ({snap.x:.0f}, {snap.y:.0f})",
        "내 인벤토리: " + (", ".join(f"{k} {v}" for k, v in sorted(snap.items.items())) or "비어있음"),
    ]

    if snap.resources:
        lines.append("주변 광맥 (최근접 좌표):")
        for name, info in sorted(snap.resources.items(), key=lambda kv: kv[1]["nearest_dist"]):
            near = info["nearest"]
            lines.append(f"  {name}: ({near['x']:.0f}, {near['y']:.0f}) 거리 {info['nearest_dist']:.0f}, "
                         f"{info['tiles']}타일")
    else:
        lines.append("주변 광맥: 없음")

    if snap.buildings:
        lines.append("주변 우리 건물:")
        for name, info in sorted(snap.buildings.items()):
            near = info.get("nearest") or {}
            lines.append(f"  {name} x{info['count']}, 최근접 ({near.get('x', 0):.0f}, {near.get('y', 0):.0f})")
    else:
        lines.append("주변 우리 건물: 없음")

    if snap.humans:
        who = ", ".join(f"{h['name']} ({h['x']:.0f}, {h['y']:.0f})" for h in snap.humans)
        lines.append(f"접속한 사람: {who}")

    return "\n".join(lines)


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)\s*```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    start = text.find("{")
    if start == -1:
        return None
    # Walk to the matching brace so trailing prose cannot break the parse.
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "{":
            depth += 1
        elif text[index] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:index + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _clean_steps(raw: Any) -> list[tuple[str, dict]]:
    """Keep only steps the game can actually run, with sane numbers."""
    if not isinstance(raw, list):
        return []

    steps: list[tuple[str, dict]] = []
    for item in raw[:MAX_STEPS]:
        if not isinstance(item, dict):
            continue
        task_type = item.get("type")
        if task_type not in ALLOWED_TASKS:
            continue

        params = item.get("params")
        params = dict(params) if isinstance(params, dict) else {}
        clean: dict[str, Any] = {}

        for key in ("x", "y"):
            if key in params:
                try:
                    value = float(params[key])
                except (TypeError, ValueError):
                    continue
                if abs(value) > MAX_COORD:
                    continue
                clean[key] = value

        for key in ("count", "ticks"):
            if key in params:
                try:
                    value = int(params[key])
                except (TypeError, ValueError):
                    continue
                limit = MAX_COUNT if key == "count" else 60 * 120
                clean[key] = max(1, min(limit, value))

        for key in ("name", "recipe"):
            if isinstance(params.get(key), str):
                clean[key] = params[key][:64]

        if params.get("snap"):
            clean["snap"] = True

        # Required arguments per task type; a step missing them would only fail
        # in the game a second later with a worse message.
        needs = {
            "walk_to": ("x", "y"), "mine": ("x", "y"), "build": ("name", "x", "y"),
            "craft": ("recipe",), "insert": ("name", "x", "y"), "take": ("name", "x", "y"),
            "wait": (),
        }[task_type]
        if any(key not in clean for key in needs):
            continue

        steps.append((task_type, clean))

    return steps


def think(message: str, snap: Any, timeout: float = 90.0,
          cli: str = "claude") -> tuple[str, list[tuple[str, dict]]] | None:
    """Ask the model what to do. Returns (what to say, steps) or None."""
    # Not str.format: the brief is full of JSON braces, which format() would
    # read as replacement fields.
    prompt = (
        BRIEF.replace("{max_steps}", str(MAX_STEPS))
        + "\n[상황]\n" + _snapshot_text(snap)
        + f"\n\n[사람이 한 말]\n{message}\n"
    )

    try:
        done = subprocess.run(
            [cli, "-p", prompt, "--output-format", "text"],
            capture_output=True, text=True, encoding="utf-8", timeout=timeout,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None

    if done.returncode != 0:
        return None

    payload = _extract_json(done.stdout or "")
    if not payload:
        return None

    say = payload.get("say")
    say = say.strip()[:300] if isinstance(say, str) else ""
    return say, _clean_steps(payload.get("steps"))

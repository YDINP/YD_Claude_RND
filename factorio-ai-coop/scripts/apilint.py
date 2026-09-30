"""run25 규칙 검사기: 스크립트가 «게임을 직접 바꾸는 Lua» 를 쓰는가.

사용자(2026-10-01): run25 부터 스크립트는 게임을 바꾸는 Lua API 를 못 쓴다.
사람이 할 수 있는 행동(걷기·캐기·짓기·손제작·상자에 넣고 꺼내기·돌리기·
레시피·요청·필터·유령·해체 표시·연구 선택·발사 버튼)은 «캐릭터 주문»
(orders.submit / 모드의 태스크) 으로만, 손이 닿는지 게임이 확인하게 해서.
읽기만 하는 질의는 괜찮다. 자세한 표는 docs/run25-api-rules.md.

이 검사기는 파이썬 파일 안의 «문자열» (ai.lua 로 보내는 Lua 조각) 과
세계를 바꾸던 옛 원격을 감싸개 없이 직접 부르는 것 (ai.call("give", ...)) 을 본다.
주석과 docstring 은 안 본다. 위반이 있는 다른 스크립트를 import 하면 [참고] 로 적는다
(개수에는 안 넣는다 - 그 함수를 부르는지는 사람이 본다).

    python scripts/apilint.py                     # scripts/ + bridge/ 전부
    python scripts/apilint.py scripts/foo25.py    # 파일 몇 개
    python scripts/apilint.py --summary           # 파일별 개수만
    python scripts/apilint.py --since run25       # 이름이 *25*.py 인 것만 (새 스크립트)

예외가 정말 필요하면 그 줄(Lua 안이면 `-- apilint: ok 이유`, 파이썬이면
`# apilint: ok 이유`) 에 이유를 적는다. 이유 없는 ok 는 무시한다.

끝 코드: 위반이 있으면 1, 없으면 0. 배포 전 검사에 걸 수 있다.
"""
from __future__ import annotations

import argparse
import ast
import glob
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ------------------------------------------------------------------ 규칙
# (이름, 정규식, 대신 쓸 것). Lua 문자열 안에서 찾는다.
LUA_RULES: list[tuple[str, str, str]] = [
    ("create_entity", r"\bcreate_entity\b",
     "build / place_ghost 주문 (유령·item-request-proxy 도 스크립트 생성 금지)"),
    ("teleport", r"\.teleport\s*[({]", "walk_to 주문 (갇히면 사람을 부른다)"),
    ("entity.insert", r"(?<!table)\.insert\s*[({]", "insert 주문 (손이 닿는 거리에서)"),
    ("remove_item", r"\bremove_item\s*[({]", "take 주문"),
    ("inventory.remove", r"(?<!table)\.remove\s*\{", "take 주문"),
    ("clear_items", r"\.clear_items_inside\b|\.clear\s*\(\s*\)", "take 주문 여러 번"),
    ("set_stack", r"\.set_stack\s*[({]|\.transfer_stack\s*[({]|\.swap_stack\s*[({]",
     "insert / take 주문"),
    ("insert_fluid", r"\binsert_fluid\b|\bremove_fluid\b|\bfluidbox\s*\[[^\]]*\]\s*=",
     "금지 (유체는 관·펌프로)"),
    ("set_recipe", r"\bset_recipe\s*[({]", "set_recipe 주문"),
    ("logistic_sections", r"\bget_logistic_sections\b|\badd_section\b|\bset_slot\b|\bclear_slot\b"
     r"|\bset_request_slot\b|\bclear_request_slot\b|\brequest_from_buffers\s*=",
     "set_requests 주문"),
    ("filter", r"\bset_filter\s*[({]|\binserter_filter_mode\s*=|\buse_filters\s*=",
     "set_filter 주문"),
    ("circuit", r"\bcircuit_condition\s*=|\blogistic_condition\s*=|\bconnect_to_logistic_network\s*="
     r"|\bcircuit_enable_disable\s*=|\bget_or_create_control_behavior\b",
     "set_condition 주문"),
    ("wire", r"\bconnect_neighbour\b|\bdisconnect_neighbour\b|\bget_wire_connector\b",
     "금지 (전선은 전봇대를 지어 잇는다)"),
    ("direction", r"\.direction\s*=(?!=)|\.rotate\s*\(", "rotate 주문"),
    ("research", r"\bresearch_queue\s*=|\badd_research\b|\bcancel_current_research\b"
     r"|\bresearched\s*=(?!=)|\bresearch_progress\s*=|\bcurrent_research\s*=",
     "research 주문 (GUI 행동, 거리 무관)"),
    ("launch_rocket", r"\blaunch_rocket\b|\bauto_launch\s*=", "launch_rocket 주문"),
    ("destroy", r"\.destroy\s*\(|\.die\s*\(|\bdamage\s*\(", "demolish 주문 / deconstruct_mark 주문"),
    ("order_upgrade", r"\border_upgrade\b|\bcancel_upgrade\b", "upgrade_mark 주문"),
    ("order_deconstruction", r"\border_deconstruction\b|\bcancel_deconstruction\b"
     r"|\bdeconstruct_area\b|\bcancel_deconstruct_area\b",
     "deconstruct_mark 주문"),
    ("revive", r"\.revive\s*\(|\.silent_revive\s*\(", "build 주문 (유령 위에 짓기)"),
    ("chart", r"\bchart\s*\(|\bchart_all\b|\brechart\b|\bunchart_chunk\b",
     "금지 - 안개는 캐릭터가 걸어서 걷는다"),
    ("entity_state", r"\.active\s*=(?!=)|\.operable\s*=(?!=)|\.minable\s*=(?!=)"
     r"|\.destructible\s*=(?!=)|\.health\s*=(?!=)|\.energy\s*=(?!=)|\.amount\s*=(?!=)"
     r"|\.force\s*=(?!=)|\.drop_position\s*=(?!=)|\.pickup_position\s*=(?!=)"
     r"|\.temperature\s*=(?!=)|\.backer_name\s*=(?!=)",
     "금지 (사람이 못 바꾸는 값)"),
    ("character_control", r"\bwalking_state\s*=|\bmining_state\s*=|\bshooting_state\s*="
     r"|\bbegin_crafting\b|\bcancel_crafting\b|\bmine_entity\b|\bmine_tile\b",
     "walk_to / mine / craft / demolish / attack 주문 (몸은 모드만 움직인다)"),
    ("tiles", r"\bset_tiles\b|\bclone_area\b|\bclone_entities\b|\bclone_brush\b"
     r"|\bregenerate_entity\b|\bdestroy_decoratives\b|\bcreate_decoratives\b",
     "금지 (타일은 build 주문으로 깔 수 있는 것만)"),
    ("spill", r"\bspill_item_stack\b|\bcreate_item_on_ground\b", "금지"),
    ("game_settings", r"\bgame\.speed\s*=|\btick_paused\s*=|\bset_game_state\b"
     r"|\bmanual_mining_speed_modifier\s*=|\bcharacter_\w+_bonus\s*=|\bworker_robots_\w+\s*="
     r"|\bevolution_factor\s*=|\bset_evolution_factor\b",
     "금지 (규칙·보너스를 스크립트로 못 바꾼다)"),
    ("remote_mutator", r"remote\.call\s*\(\s*['\"]ai['\"]\s*,\s*['\"]"
     r"(give|set_recipe|unstick|aim_drill|feed_belts|research|spawn|revive|remove)['\"]",
     "캐릭터 주문 (위 표 참고)"),
]

# 파이썬 쪽: AIBridge 의 set_recipe · aim_drill · feed_belts · research · unstick · give
# 감싸개는 run25 모드 (모드에 act 가 있으면) 에서 캐릭터 조작으로 돌거나 error 를 돌려주므로
# 규칙 위반이 아니다. 감싸개를 건너뛰고 원격을 «직접» 부르는 것만 잡는다: ai.call("give", ...)
PY_CALL_NAMES = re.compile(r"^(give|set_recipe|unstick|aim_drill|feed_belts|research|spawn|revive|remove)$")

# 이런 말이 하나라도 있으면 Lua 조각으로 본다. 한국어 안내문의 «destroy» 같은 오탐을 줄인다.
LUA_HINT = re.compile(r"\b(game\.|surface|storage\.|remote\.call|find_entit|local\s|end\b|then\b"
                      r"|pairs\(|prototypes\.|defines\.|force)")

ALLOW = re.compile(r"(--|#)\s*apilint:\s*ok\s+\S")

COMPILED = [(name, re.compile(rx), hint) for name, rx, hint in LUA_RULES]


# ------------------------------------------------------------------ 문자열 모으기
def _docstring_ids(tree: ast.AST) -> set[int]:
    ids = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            body = getattr(node, "body", [])
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) \
                    and isinstance(body[0].value.value, str):
                ids.add(id(body[0].value))
    return ids


def lua_strings(tree: ast.AST):
    """(시작 줄, 본문) - 파이썬 파일 안의 문자열. f-string 은 {} 로 이어 붙인다."""
    skip = _docstring_ids(tree)
    inner = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):
            for v in node.values:
                inner.add(id(v))
    for node in ast.walk(tree):
        if id(node) in skip or id(node) in inner:
            continue
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            yield node.lineno, node.value
        elif isinstance(node, ast.JoinedStr):
            parts = []
            for v in node.values:
                if isinstance(v, ast.Constant) and isinstance(v.value, str):
                    parts.append(v.value)
                else:
                    parts.append("{}")
            yield node.lineno, "".join(parts)


def _strip_lua_comments(line: str) -> str:
    # 한 줄 주석만 지운다. 문자열 안의 -- 는 드물다.
    i = line.find("--")
    return line if i < 0 else line[:i]


# ------------------------------------------------------------------ 검사
def check_file(path: str) -> list[dict]:
    src = io.open(path, encoding="utf-8", errors="replace").read()
    try:
        tree = ast.parse(src, filename=path)
    except SyntaxError as exc:
        return [{"file": path, "line": exc.lineno or 0, "rule": "syntax", "text": str(exc),
                 "hint": "파이썬 문법 오류"}]
    src_lines = src.splitlines()
    hits: list[dict] = []

    for lineno, text in lua_strings(tree):
        if not LUA_HINT.search(text):
            continue
        for k, raw in enumerate(text.splitlines() or [text]):
            if ALLOW.search(raw):
                continue
            code = _strip_lua_comments(raw)
            for name, rx, hint in COMPILED:
                if rx.search(code):
                    # 파이썬 줄 끝의 # apilint: ok 도 받는다 (한 줄 문자열).
                    pyline = src_lines[lineno - 1 + k] if lineno - 1 + k < len(src_lines) else ""
                    if ALLOW.search(pyline):
                        continue
                    hits.append({"file": path, "line": lineno + k, "rule": name,
                                 "text": raw.strip()[:120], "hint": hint})

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        attr = node.func.attr
        pyline = src_lines[node.lineno - 1] if node.lineno - 1 < len(src_lines) else ""
        if ALLOW.search(pyline):
            continue
        if attr == "call" and node.args and isinstance(node.args[0], ast.Constant) \
                and isinstance(node.args[0].value, str) and PY_CALL_NAMES.match(node.args[0].value):
            hits.append({"file": path, "line": node.lineno, "rule": "py:call:" + node.args[0].value,
                         "text": pyline.strip()[:120], "hint": "캐릭터 주문 (client 감싸개를 쓴다)"})
    hits.sort(key=lambda h: (h["line"], h["rule"]))
    return hits


def local_imports(path: str) -> list[str]:
    """scripts/ 안의 다른 스크립트를 가져오는가 (import p7_24 · from p4 import ...)."""
    try:
        tree = ast.parse(io.open(path, encoding="utf-8", errors="replace").read())
    except SyntaxError:
        return []
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            names.add(node.module.split(".")[0])
    out = []
    for n in sorted(names):
        cand = os.path.join(ROOT, "scripts", n + ".py")
        if os.path.exists(cand) and os.path.abspath(cand) != os.path.abspath(path):
            out.append(cand)
    return out


def default_targets(since: str | None) -> list[str]:
    files = sorted(glob.glob(os.path.join(ROOT, "scripts", "*.py")))
    files += sorted(glob.glob(os.path.join(ROOT, "bridge", "*.py")))
    files += sorted(glob.glob(os.path.join(ROOT, "bridge", "crew", "*.py")))
    me = os.path.abspath(__file__)
    files = [f for f in files if os.path.abspath(f) != me]
    if since:
        tag = since.replace("run", "")
        files = [f for f in files if tag in os.path.basename(f)]
    return files


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="run25 게임 조작 API 금지 검사")
    ap.add_argument("files", nargs="*")
    ap.add_argument("--summary", action="store_true", help="파일별 개수만")
    ap.add_argument("--since", help="예: run25 - 이름에 25 가 든 파일만")
    args = ap.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

    files = args.files or default_targets(args.since)
    total, dirty = 0, 0
    cache: dict[str, int] = {}

    def count(path: str) -> int:
        if path not in cache:
            cache[path] = len(check_file(path))
        return cache[path]

    for path in files:
        hits = check_file(path)
        # 참고: 위반이 있는 다른 스크립트를 가져다 쓰면 (예: research_guard -> p4.queue_fill)
        # 그 함수를 부르는 순간 같은 위반이다. 개수에는 넣지 않고 적어만 둔다.
        via = [(os.path.basename(m)[:-3], count(m)) for m in local_imports(path)]
        via = [(m, n) for m, n in via if n]
        if via and not args.summary:
            rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
            print(f"{rel}: [참고] 위반이 있는 스크립트를 가져온다 - "
                  + ", ".join(f"{m} ({n})" for m, n in via))
        if not hits:
            continue
        dirty += 1
        total += len(hits)
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if args.summary:
            rules = sorted({h["rule"] for h in hits})
            print(f"{rel}: {len(hits)}  [{', '.join(rules)}]")
            continue
        print(f"{rel}: {len(hits)}")
        for h in hits:
            print(f"  {h['line']:>5}  {h['rule']:<20} {h['text']}")
            print(f"         -> {h['hint']}")
    print(f"\n위반 {total}건 / 파일 {dirty}개 (검사 {len(files)}개)")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())

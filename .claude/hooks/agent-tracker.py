#!/usr/bin/env python3
"""
PreToolUse Hook: Task 도구 호출 시 에이전트 이름을 추적 파일에 기록
설정: settings.local.json > hooks > PreToolUse > matcher: "Task"
"""
import json
import os
import sys
import time

TRACKING_FILE = os.path.expanduser("~/.claude/running-agents.json")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return

    if data.get("tool_name") != "Task":
        return

    tool_use_id = data.get("tool_use_id", "")
    if not tool_use_id:
        return

    tool_input = data.get("tool_input", {})

    # 표시 이름: name 우선, 없으면 subagent_type
    name = tool_input.get("name", "").strip()
    subagent_type = tool_input.get("subagent_type", "agent")
    display_name = name if name else subagent_type

    is_background = bool(tool_input.get("run_in_background", False))

    # 기존 추적 데이터 로드
    tracking = {}
    if os.path.exists(TRACKING_FILE):
        try:
            with open(TRACKING_FILE, "r", encoding="utf-8") as f:
                tracking = json.load(f)
        except Exception:
            pass

    # 새 에이전트 항목 추가
    tracking[tool_use_id] = {
        "name": display_name,
        "started_at": int(time.time()),
        "is_background": is_background,
    }

    # 저장
    os.makedirs(os.path.dirname(TRACKING_FILE), exist_ok=True)
    with open(TRACKING_FILE, "w", encoding="utf-8") as f:
        json.dump(tracking, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()

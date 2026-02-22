#!/usr/bin/env python3
"""
PostToolUse Hook: Task 도구 완료 시 에이전트 추적 파일에서 항목 제거
설정: settings.local.json > hooks > PostToolUse > matcher: "Task"
"""
import json
import os
import sys
import time

TRACKING_FILE = os.path.expanduser("~/.claude/running-agents.json")
TTL_SECONDS = 600  # 백그라운드 태스크 10분 TTL


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

    # 기존 추적 데이터 로드
    tracking = {}
    if os.path.exists(TRACKING_FILE):
        try:
            with open(TRACKING_FILE, "r", encoding="utf-8") as f:
                tracking = json.load(f)
        except Exception:
            pass

    now = int(time.time())
    entry = tracking.get(tool_use_id, {})
    is_background = entry.get("is_background", False)

    # 포그라운드 태스크: 즉시 제거 (완료됨)
    if not is_background:
        tracking.pop(tool_use_id, None)

    # TTL 만료된 항목 정리 (백그라운드 태스크 포함)
    expired = [
        tid for tid, info in tracking.items()
        if now - info.get("started_at", 0) > TTL_SECONDS
    ]
    for tid in expired:
        tracking.pop(tid, None)

    # 저장
    os.makedirs(os.path.dirname(TRACKING_FILE), exist_ok=True)
    with open(TRACKING_FILE, "w", encoding="utf-8") as f:
        json.dump(tracking, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()

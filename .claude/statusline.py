#!/usr/bin/env python3
"""
Statusline 스크립트: 실행 중인 에이전트 이름 + Claude 세션 정보 표시
설정: settings.local.json > statusLine > command
출력 예시: "[executor | qa-tester]  Sonnet  8%"
"""
import io
import json
import os
import sys
import time

# Windows cp949 인코딩 문제 해결
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

TRACKING_FILE = os.path.expanduser("~/.claude/running-agents.json")
TTL_SECONDS = 600


def get_running_agents():
    """실행 중인 에이전트 목록 반환 (TTL 만료 제외)"""
    if not os.path.exists(TRACKING_FILE):
        return []

    try:
        with open(TRACKING_FILE, "r", encoding="utf-8") as f:
            tracking = json.load(f)
    except Exception:
        return []

    now = int(time.time())
    names = []
    for info in tracking.values():
        started_at = info.get("started_at", 0)
        if now - started_at <= TTL_SECONDS:
            names.append(info.get("name", "agent"))
    return names


def main():
    # Claude 세션 데이터 읽기 (stdin)
    session_data = {}
    try:
        raw = sys.stdin.read()
        if raw.strip():
            session_data = json.loads(raw)
    except Exception:
        pass

    # 모델 정보
    model_info = session_data.get("model", {})
    model_name = model_info.get("display_name", "")

    # 컨텍스트 사용률
    ctx = session_data.get("context_window", {})
    ctx_pct = ctx.get("used_percentage", 0)

    # 실행 중인 에이전트
    agents = get_running_agents()

    # 출력 구성
    parts = []

    if agents:
        agent_str = " | ".join(agents)
        parts.append(f"[{agent_str}]")

    session_parts = []
    if model_name:
        session_parts.append(model_name)
    if ctx_pct:
        session_parts.append(f"{ctx_pct:.0f}%")

    if session_parts:
        parts.append("  ".join(session_parts))

    print("  │  ".join(parts) if parts else "")


if __name__ == "__main__":
    main()

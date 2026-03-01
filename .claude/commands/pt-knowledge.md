세션에서 발견된 지식을 .omc/notepads/ 구조로 자동 저장합니다.

**컨텍스트**: $ARGUMENTS

---

## 실행 방법

### Step 1: 에이전트 파일 로드

```
Read(".claude/agents/knowledge-tracker.md") → KNOWLEDGE_TRACKER_PROMPT
```

파일의 두 번째 `---` 이후 내용이 시스템 프롬프트입니다.

### Step 2: knowledge-tracker 실행

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: """
  {KNOWLEDGE_TRACKER_PROMPT 전체 내용}

  ---
  ## 지금 수행할 작업

  이번 세션의 작업 내용을 분석하고 지식을 .omc/notepads/에 저장하세요.

  **컨텍스트**: $ARGUMENTS

  **실행 규칙**:
  - git diff/log로 세션 작업 내용 파악
  - learnings/decisions/issues/problems 4개 카테고리로 분류
  - .omc/notepads/{오늘날짜}/ 폴더에 저장
  - _index.md 업데이트
  """
)
```

---

## 사용 예시

```
/pt-knowledge 오늘 SnapWise 워드카운트 기능 구현 세션
/pt-knowledge auto-pipeline QA 루프 구현 완료
/pt-knowledge (인자 없이 실행 시 git log 자동 분석)
```

---

## 참고

- 저장 위치: `.omc/notepads/{YYYY-MM-DD}/`
- 인덱스 파일: `.omc/notepads/_index.md`
- 언제든 `/pt-knowledge`로 수동 트리거 가능
- 중요 결정사항은 세션 종료 전 실행 권장

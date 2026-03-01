executor → qa-tester 자동 반복 루프를 실행합니다. 실패 시 QA 피드백을 포함해 최대 3회 재시도합니다.

**요청**: $ARGUMENTS

---

## 루프 흐름

```
executor (sonnet)   → 코드 구현 / 수정
    ↓
qa-tester (sonnet)  → QA 검증 (QA 루프 모드)
    ↓
PASS → 완료
FAIL → QA 피드백 포함 executor 재시도 (최대 3회 총 QA 검사)
```

---

## 실행 방법

### Step 1: 에이전트 파일 로드

```
Read(".claude/agents/executor.md")   → EXECUTOR_PROMPT
Read(".claude/agents/qa-tester.md")  → QA_TESTER_PROMPT
```

각 파일에서 두 번째 `---` 이후의 내용이 시스템 프롬프트입니다.

### Step 2: qa-loop 에이전트 실행

`.claude/agents/qa-loop.md`를 읽어 시스템 프롬프트를 추출한 후,
아래 형식으로 `general-purpose` Task를 호출합니다:

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: """
  {qa-loop.md의 두 번째 --- 이후 내용 전체}

  ---
  ## 지금 수행할 작업

  아래 태스크를 QA 루프로 구현 및 검증하세요.

  **태스크**: $ARGUMENTS

  **실행 규칙**:
  - executor → qa-tester 순서로 실행 (MAX_ITERATIONS = 3)
  - QA_RESULT: PASS 시 즉시 종료
  - QA_RESULT: FAIL 시 QA_FAILURES 피드백 포함 executor 재시도
  - 3회 모두 실패 시 수동 개입 요청
  - 각 이터레이션마다 [QA-LOOP] 이터레이션 N/3 로그 출력
  """
)
```

---

## 사용 예시

```
/qa-loop UserViewModel의 loadData() 메서드 구현
/qa-loop AuthRepository 단위 테스트 작성
/qa-loop 결제 화면 폼 유효성 검사 로직 추가
```

---

## 참고

- 기존 개별 에이전트 직접 호출 방식은 그대로 유지됩니다 (기본 모드)
- 이 커맨드는 **단일 기능 구현 + 즉시 검증**이 필요한 경우에 최적화되어 있습니다
- 기획/설계 단계까지 포함한 전체 개발 사이클은 `/auto-pipeline` 커맨드를 사용하세요

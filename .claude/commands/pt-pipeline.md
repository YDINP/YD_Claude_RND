완전 자율 5단계 개발 파이프라인을 실행합니다.

**요청**: $ARGUMENTS

---

## 파이프라인 흐름

```
planner (opus)      → 요구사항 분석 + 작업 계획
    ↓
architect (opus)    → 아키텍처 검토 + 구현 가이드라인
    ↓
executor (sonnet)   → 코드 구현
    ↓
QA 게이트 (sonnet)  → qa-tester 자동 검증 (최대 3회, 실패 시 executor 재시도)
    ↓
리뷰 게이트 (opus)  → code-reviewer 최종 승인 (최대 2회, BLOCKED 시 executor 수정)
```

---

## resume 기능 (특정 Stage부터 재시작)

파이프라인 중단 시 처음부터 재시작하지 않고 특정 Stage부터 재시작할 수 있습니다.

**사용법:**

```
/pt-pipeline resume:stageN {요구사항}
```

**예시:**

```
/pt-pipeline resume:stage3 인증 버그 수정 — JWT 토큰 만료 처리 누락
/pt-pipeline resume:stage4 캐싱 레이어 추가 (executor 구현 완료 후)
/pt-pipeline resume:stage5 UserRepository 리팩토링 (QA PASS 후)
```

**resume 처리 규칙:**

```
1. $ARGUMENTS에서 "resume:stage(\d)" 패턴 감지
2. 감지된 N = 재시작 Stage 번호 (1~5)
3. Stage 1 ~ Stage N-1 스킵 (이전 단계 출력 없음)
4. 아래 알림 출력 후 Stage N부터 즉시 실행:

   "[RESUME] Stage N부터 재시작합니다. 이전 단계(Stage 1~N-1) 출력 없음 — 요구사항만으로 진행합니다."

5. 요구사항에서 "resume:stageN" 부분을 제거한 나머지 텍스트를 실제 요구사항으로 사용
```

**Stage 3 resume 시 Stage 3.5(빌드 게이트) 자동 포함:**

```
resume:stage3 → executor 구현 → Stage 3.5 빌드 게이트 → Stage 4 QA → Stage 5 리뷰
```

**범위:** Stage 1~5 (resume:stage1은 전체 실행과 동일)

---

## 실행 방법

### Step 1: resume 감지 및 처리

```
RESUME_STAGE = 0  # 기본값: 전체 실행

if $ARGUMENTS에 "resume:stage(\d)" 패턴 있음:
  RESUME_STAGE = 감지된 숫자 (1~5)
  ACTUAL_REQUIREMENTS = $ARGUMENTS에서 "resume:stageN" 제거한 나머지
  출력: "[RESUME] Stage {RESUME_STAGE}부터 재시작합니다. 이전 단계 출력 없음 — 요구사항만으로 진행합니다."
else:
  ACTUAL_REQUIREMENTS = $ARGUMENTS
```

### Step 2: 에이전트 파일 로드

아래 5개 파일을 읽어 각 에이전트의 시스템 프롬프트를 추출합니다.
각 파일에서 두 번째 `---` 이후의 내용 전체가 해당 에이전트의 시스템 프롬프트입니다.

```
Read(".claude/agents/planner.md")       → PLANNER_PROMPT
Read(".claude/agents/architect.md")     → ARCHITECT_PROMPT
Read(".claude/agents/executor.md")      → EXECUTOR_PROMPT
Read(".claude/agents/qa-tester.md")     → QA_TESTER_PROMPT
Read(".claude/agents/code-reviewer.md") → REVIEWER_PROMPT
```

### Step 3: 파이프라인 실행

`.claude/agents/auto-pipeline.md`를 읽어 시스템 프롬프트를 추출한 후,
아래 형식으로 `general-purpose` Task를 호출합니다:

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: """
  {auto-pipeline.md의 두 번째 --- 이후 내용 전체}

  ---
  ## 지금 수행할 작업

  아래 요구사항을 완전 자율 파이프라인으로 구현하세요.

  **요구사항**: {ACTUAL_REQUIREMENTS}

  **실행 규칙**:
  - planner → architect → executor → QA 게이트 → code-reviewer 5단계를 순서대로 실행
  - RESUME_STAGE > 1인 경우: Stage 1~{RESUME_STAGE-1} 스킵, Stage {RESUME_STAGE}부터 시작
  - 각 단계 출력을 다음 단계 컨텍스트로 전달 (STAGE_OUTPUT 파싱 우선)
  - QA 3회 / 리뷰 2회 실패 시 중단 + 수동 개입 요청
  - 각 단계 진행 시 [AUTO-PIPELINE] Stage N/5 로그 출력
  - 마지막에 MODIFIED_FILES: 로 시작하는 수정 파일 목록 보고
  """
)
```

---

## 사용 예시

```
# 전체 파이프라인 실행
/pt-pipeline 알림 기능 구현 — 사용자가 설정한 시간에 푸시 알림 발송
/pt-pipeline UserRepository에 캐싱 레이어 추가
/pt-pipeline 로그인 화면 Compose로 리팩토링

# 특정 Stage부터 재시작 (resume)
/pt-pipeline resume:stage3 인증 버그 수정 (planner/architect 이미 완료됨)
/pt-pipeline resume:stage4 결제 모듈 추가 (executor 구현 완료 후 QA부터)
/pt-pipeline resume:stage5 API 클라이언트 리팩토링 (QA PASS, 리뷰만 남음)
```

---

## 참고

- 기존 개별 에이전트 직접 호출 방식은 그대로 유지됩니다 (기본 모드)
- 이 커맨드는 기획→구현→QA→리뷰 전 과정이 필요한 **신규 기능 개발**에 최적화되어 있습니다
- QA만 자동화하려면 `/qa-loop` 커맨드를 사용하세요
- resume 기능은 파이프라인 중단 후 재시작 비용을 절감합니다

완전 자율 5단계 파이프라인 + 자동 PR 생성까지 실행합니다.

**요구사항**: $ARGUMENTS

---

## 파이프라인 흐름

```
planner (opus)      → 요구사항 분석 + 스펙 문서 + 작업 계획
    ↓
architect (opus)    → 아키텍처 검토 + 구현 가이드라인
    ↓
executor (sonnet)   → 코드 구현
    ↓
QA 게이트 (sonnet)  → qa-tester 자동 검증 (최대 3회)
    ↓
리뷰 게이트 (opus)  → code-reviewer 최종 승인 (최대 2회)
    ↓
PR 생성             → 브랜치 생성 + 커밋 + gh pr create
```

---

## 실행 방법

### Step 1: 에이전트 파일 로드

아래 6개 파일을 읽어 시스템 프롬프트를 추출합니다:

```
Read(".claude/agents/planner.md")       → PLANNER_PROMPT
Read(".claude/agents/architect.md")     → ARCHITECT_PROMPT
Read(".claude/agents/executor.md")      → EXECUTOR_PROMPT
Read(".claude/agents/qa-tester.md")     → QA_TESTER_PROMPT
Read(".claude/agents/code-reviewer.md") → REVIEWER_PROMPT
Read(".claude/agents/auto-pipeline.md") → PIPELINE_PROMPT
```

각 파일에서 두 번째 `---` 이후 내용이 시스템 프롬프트입니다.

### Step 2: 5단계 파이프라인 실행

`auto-pipeline.md` 시스템 프롬프트를 사용하여 파이프라인을 실행합니다:

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: """
  {auto-pipeline.md의 두 번째 --- 이후 내용 전체}

  ---
  ## 지금 수행할 작업

  아래 요구사항을 완전 자율 파이프라인으로 구현하세요.

  **요구사항**: $ARGUMENTS

  **실행 규칙**:
  - planner → architect → executor → QA 게이트 → code-reviewer 5단계 순서대로 실행
  - 각 단계 출력을 다음 단계 컨텍스트로 전달
  - QA 3회 / 리뷰 2회 실패 시 중단 + 수동 개입 요청
  - 각 단계 진행 시 [PT-PR] Stage N/5 로그 출력
  - **마지막에 반드시 수정된 파일 목록을 MODIFIED_FILES: 로 시작하는 줄에 보고**
  """
)
→ PIPELINE_RESULT 저장 (APPROVED/중단 여부, 수정 파일 목록 포함)
```

### Step 3: 파이프라인 결과 확인

`PIPELINE_RESULT`에서 결과 판별:
- `REVIEW_RESULT: APPROVED` 포함 → Step 4 (PR 생성)로 진행
- `REVIEW_RESULT: BLOCKED` 또는 중단 → PR 생성 중단, 결과 보고

### Step 4: PR 자동 생성

파이프라인이 APPROVED인 경우:

```bash
# 4-1. 현재 브랜치 확인
CURRENT_BRANCH=$(git branch --show-current)

# 4-2. feature 브랜치 생성 (main/master에 있을 경우)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  # 요구사항에서 슬러그 생성 (소문자, 하이픈)
  SLUG=$(echo "$ARGUMENTS" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | cut -c1-40 | sed 's/[^a-z0-9-]//g')
  BRANCH="feature/${SLUG}"
  git checkout -b "$BRANCH"
fi

# 4-3. 변경사항 스테이징 + 커밋
git add -A
git commit -m "feat: $ARGUMENTS

- 파이프라인 자동 구현 (planner→architect→executor→QA→reviewer)
- QA: PASS / Review: APPROVED

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# 4-4. 브랜치 push
git push -u origin HEAD

# 4-5. PR 생성
gh pr create \
  --title "feat: $ARGUMENTS" \
  --body "$(cat <<'PRBODY'
## Summary

- auto-pipeline으로 구현된 기능입니다
- 5단계 파이프라인 (planner → architect → executor → QA → code-reviewer) 전체 통과

## 구현 내용

{PIPELINE_RESULT의 수정 파일 목록 + 주요 결정사항}

## QA / 리뷰 결과

- QA: PASS
- Code Review: APPROVED (CRITICAL/HIGH 이슈 없음)

## Test plan

- [ ] 로컬에서 빌드 확인
- [ ] 기능 동작 수동 검증

Generated with [Claude Code](https://claude.ai/claude-code) via `/pt-pr`
PRBODY
)"
```

### Step 5: 완료 보고

```markdown
## PT-PR 실행 결과

**상태**: PR 생성 완료 / 파이프라인 미통과 (PR 미생성)

### 파이프라인 결과
| 단계 | 결과 |
|------|------|
| Stage 1-5 | APPROVED |
| PR 생성 | 완료 |

### PR 정보
- **브랜치**: feature/{slug}
- **PR URL**: {gh pr create 출력 URL}
- **수정 파일**: {N}개

[파이프라인 미통과 시]
### 미해결 항목
- 파이프라인 결과: {BLOCKED/QA FAIL}
- PR 생성: 미실행 (파이프라인 통과 후 재시도 필요)
```

---

## 사용 예시

```
/pt-pr 알림 기능 구현 — 사용자가 설정한 시간에 푸시 알림 발송
/pt-pr UserRepository에 캐싱 레이어 추가
/pt-pr 로그인 화면 반응형 개선
```

---

## 참고

- **`/pt-pipeline`과의 차이**: PR 자동 생성 유무 (`/pt-pipeline`은 코드만 구현, PR 없음)
- 파이프라인 미통과 시 PR 생성하지 않음 (품질 보장)
- `gh` CLI 설치 및 GitHub 인증 필요 (`gh auth login`)
- main/master 브랜치에서 실행 시 자동으로 feature 브랜치 생성
- 이미 feature 브랜치에 있으면 해당 브랜치 그대로 사용

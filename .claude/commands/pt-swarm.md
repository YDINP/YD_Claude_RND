독립적인 태스크를 Git worktree로 격리하여 병렬 실행합니다. 파일 충돌 없이 다수의 executor가 동시 작업합니다.

**태스크 목록**: $ARGUMENTS

---

## 흐름

```
태스크 분석
    ↓
각 태스크별 git worktree 생성 (.claude/worktrees/swarm-{n}/)
    ↓
N개 executor 병렬 실행 (각자 격리된 worktree에서)
    ↓
완료 후 변경 브랜치 목록 + 머지 가이드 출력
```

---

## 실행 방법

### Step 1: 에이전트 프롬프트 로드

```
Read(".claude/agents/executor.md") → EXECUTOR_PROMPT
```

파일의 두 번째 `---` 이후 내용이 시스템 프롬프트입니다.

### Step 2: 태스크 파싱

`$ARGUMENTS`에서 독립적인 태스크 목록을 파악합니다:
- 줄바꿈/번호로 구분된 태스크 목록
- 또는 하나의 복잡한 태스크를 독립 서브태스크로 분해

### Step 3: Worktree 생성 + 병렬 실행

각 태스크에 대해:

```bash
# 1. 고유 브랜치명 생성
BRANCH="swarm/{태스크-슬러그}-$(date +%s)"
WORKTREE_PATH=".claude/worktrees/swarm-{n}"

# 2. 워크트리 생성
git worktree add {WORKTREE_PATH} -b {BRANCH}
```

모든 워크트리 생성 후 **동시에** Task 호출:

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: """
  {EXECUTOR_PROMPT 전체 내용}

  ---
  ## 지금 수행할 작업

  **워크트리 경로**: {WORKTREE_PATH}  ← 이 경로에서 작업
  **태스크**: {개별 태스크 내용}

  **중요**: 모든 파일 Read/Write/Edit은 {WORKTREE_PATH}/ 기준 절대경로 사용.
  예: {WORKTREE_PATH}/src/components/Button.tsx

  **완료 기준**:
  - 태스크의 모든 구현 완료
  - 수정/생성한 파일 목록 보고 (워크트리 내 경로)
  """
)
```

모든 Task를 **단일 메시지에서 동시에** 호출하여 병렬 실행.

### Step 4: 자동 머지 + 완료 보고

모든 executor 완료 후, 충돌 여부를 검사하여 자동 머지를 시도합니다.

```bash
# 각 브랜치에 대해 순서대로:
MERGE_RESULTS = []

for each (BRANCH, 태스크) in 완료 브랜치 목록:

  # 1. 충돌 사전 확인 (dry-run)
  git checkout main
  git merge --no-commit --no-ff {BRANCH}

  if 충돌 없음 (exit code 0):
    # 2a. 자동 머지 실행
    git merge --abort        # dry-run 취소
    git merge {BRANCH} --no-ff -m "feat: {태스크 요약} [swarm-auto-merge]"
    git worktree remove .claude/worktrees/swarm-{n}
    MERGE_RESULTS.append({브랜치: BRANCH, 상태: "✅ 자동 머지 완료"})

  else:
    # 2b. 충돌 → 머지 취소, 수동 안내
    git merge --abort
    MERGE_RESULTS.append({브랜치: BRANCH, 상태: "⚠️ 충돌 — 수동 머지 필요"})
```

완료 보고:

```markdown
## Swarm 실행 결과

### 완료된 태스크
| # | 태스크 | 브랜치 | 수정 파일 | 머지 |
|---|--------|--------|---------|------|
| 1 | {태스크} | swarm/{브랜치} | {파일 수}개 | ✅ 자동 완료 |
| 2 | {태스크} | swarm/{브랜치} | {파일 수}개 | ⚠️ 수동 필요 |

### 수동 머지가 필요한 브랜치 (충돌 발생)

충돌 파일을 수동으로 해결 후 아래 명령을 실행하세요:

```bash
git checkout main
git merge swarm/{충돌-브랜치} --no-ff -m "feat: {태스크 요약}"
# 충돌 파일 수동 수정 후:
git add . && git merge --continue

# 워크트리 정리
git worktree remove .claude/worktrees/swarm-{n}
```
```

---

## 사용 예시

```
# 독립적인 3개 태스크 병렬 실행
/pt-swarm
1. UserProfile 컴포넌트 반응형 수정
2. API 에러 핸들링 추가
3. 다크모드 CSS 변수 정리

# 또는 한 줄로
/pt-swarm 로그인/회원가입/비밀번호찾기 화면 각각 독립 구현
```

---

## 참고

- **독립적인 태스크만 적합**: 동일 파일을 수정하는 태스크는 머지 충돌 발생
- 태스크당 워크트리 1개, 브랜치 1개 생성
- 워크트리는 `.claude/worktrees/swarm-{n}/` 경로 사용
- 작업 완료 후 워크트리 정리 권장 (`git worktree remove`)
- 기존 `/pt` 커맨드 대비 파일 격리가 필요한 대규모 병렬 작업에 최적화

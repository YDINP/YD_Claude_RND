# OMC 신기능 레퍼런스 (v3.1 - v3.4)

> 이 파일은 `.claude/CLAUDE.md`의 Part 4에서 분리된 참조 문서입니다.

## Notepad Wisdom System

계획 범위의 지식 캡처 시스템.

**위치:** `.omc/notepads/{plan-name}/`

| 파일 | 목적 |
|------|------|
| `learnings.md` | 기술적 발견 및 패턴 |
| `decisions.md` | 아키텍처 및 설계 결정 |
| `issues.md` | 알려진 이슈 및 우회법 |
| `problems.md` | 블로커 및 도전 과제 |

**API:** `initPlanNotepad()`, `addLearning()`, `addDecision()`, `addIssue()`, `addProblem()`, `getWisdomSummary()`, `readPlanWisdom()`

## Delegation Categories

| 카테고리 | 티어 | Temperature | Thinking | 사용 목적 |
|----------|------|-------------|----------|----------|
| `visual-engineering` | HIGH | 0.7 | high | UI/UX, 프론트엔드, 디자인 시스템 |
| `ultrabrain` | HIGH | 0.3 | max | 복잡한 추론, 아키텍처, 심층 디버깅 |
| `artistry` | MEDIUM | 0.9 | medium | 창의적 솔루션, 브레인스토밍 |
| `quick` | LOW | 0.1 | low | 단순 조회, 기본 작업 |
| `writing` | MEDIUM | 0.5 | medium | 문서화, 기술 글쓰기 |

**자동 감지:** 프롬프트 키워드에서 카테고리 자동 탐지.

## Directory Diagnostics Tool

`lsp_diagnostics_directory` 도구를 통한 프로젝트 레벨 타입 체킹.

**전략:**
- `auto` (기본) — tsconfig.json 존재 시 tsc 선호
- `tsc` — 빠름, TypeScript 컴파일러 사용
- `lsp` — 폴백, LSP로 파일 반복

## Ultrapilot (v3.4)

최대 5개 동시 워커로 3-5x 빠른 병렬 오토파일럿.

**트리거:** "ultrapilot", "parallel build", "swarm build"

**상태 파일:**
- `.omc/state/ultrapilot-state.json`
- `.omc/state/ultrapilot-ownership.json`

## Swarm (v3.4)

공유 풀에서 원자 태스크 클레임하는 N 에이전트 조율.

**사용법:** `/swarm 5:executor "fix all TypeScript errors"`

**특징:**
- 공유 태스크 목록 (pending/claimed/done)
- 5분 타임아웃 후 자동 해제

## Pipeline (v3.4)

단계 간 데이터 전달 순차 에이전트 체이닝.

**내장 프리셋:**
| 프리셋 | 단계 |
|--------|------|
| `review` | explore → architect → critic → executor |
| `implement` | planner → executor → tdd-guide |
| `debug` | explore → architect → build-fixer |
| `research` | parallel(researcher, explore) → architect → writer |
| `refactor` | explore → architect-medium → executor-high → qa-tester |
| `security` | explore → security-reviewer → executor → security-reviewer-low |

**커스텀 파이프라인:** `/pipeline explore:haiku -> architect:opus -> executor:sonnet`

## Verification Module (v3.4)

재사용 가능한 검증 프로토콜.

**표준 체크:** BUILD, TEST, LINT, FUNCTIONALITY, ARCHITECT, TODO, ERROR_FREE

**증거 검증:** 5분 신선도 감지, 통과/실패 추적

## State Management (v3.4)

표준화된 상태 파일 위치.

**표준 경로:**
- 로컬: `.omc/state/{name}.json`
- 글로벌: `~/.omc/state/{name}.json`

레거시 위치는 읽기 시 자동 마이그레이션.

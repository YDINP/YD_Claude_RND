# OMC 에이전트 & 스킬 레퍼런스

> 이 파일은 `.claude/CLAUDE.md`의 Part 3에서 분리된 참조 문서입니다.
> 런타임 규칙은 CLAUDE.md를 참고하세요.

## 모든 스킬 목록

| 스킬 | 목적 | 자동 트리거 | 수동 |
|------|------|------------|------|
| `autopilot` | 아이디어→코드 완전 자동 실행 | "autopilot", "build me", "I want a" | `/oh-my-claudecode:autopilot` |
| `orchestrate` | 핵심 멀티에이전트 오케스트레이션 | 항상 활성 | - |
| `ralph` | 검증 완료까지 지속 실행 | "don't stop", "must complete" | `/oh-my-claudecode:ralph` |
| `ultrawork` | 최대 병렬 실행 | "ulw", "ultrawork" | `/oh-my-claudecode:ultrawork` |
| `plan` | 인터뷰 방식 계획 세션 | "plan this", "plan the", 광범위 요청 | `/oh-my-claudecode:plan` |
| `ralplan` | 반복 계획 (Planner+Architect+Critic) | "ralplan" 키워드 | `/oh-my-claudecode:ralplan` |
| `review` | Critic으로 계획 검토 | "review plan" | `/oh-my-claudecode:review` |
| `analyze` | 심층 분석/조사 | "analyze", "debug", "why" | `/oh-my-claudecode:analyze` |
| `deepsearch` | 코드베이스 철저 탐색 | "search", "find", "where" | `/oh-my-claudecode:deepsearch` |
| `deepinit` | AGENTS.md 계층 생성 | "index codebase" | `/oh-my-claudecode:deepinit` |
| `frontend-ui-ux` | UI 디자인 감각 | UI/컴포넌트 컨텍스트 | (무음) |
| `git-master` | Git 전문성, 원자 커밋 | git/커밋 컨텍스트 | (무음) |
| `ultraqa` | QA 사이클: 테스트/수정/반복 | "test", "QA", "verify" | `/oh-my-claudecode:ultraqa` |
| `learner` | 세션에서 재사용 가능 스킬 추출 | "extract skill" | `/oh-my-claudecode:learner` |
| `note` | 메모장에 저장 | "remember", "note" | `/oh-my-claudecode:note` |
| `hud` | HUD 상태바 설정 | - | `/oh-my-claudecode:hud` |
| `doctor` | 설치 문제 진단 | - | `/oh-my-claudecode:doctor` |
| `help` | OMC 사용 가이드 | - | `/oh-my-claudecode:help` |
| `omc-setup` | 최초 설정 마법사 | - | `/oh-my-claudecode:omc-setup` |
| `ralph-init` | 구조화된 ralph용 PRD 초기화 | - | `/oh-my-claudecode:ralph-init` |
| `release` | 자동 릴리스 워크플로우 | - | `/oh-my-claudecode:release` |
| `ultrapilot` | 병렬 오토파일럿 (3-5x 빠름) | "ultrapilot", "parallel build", "swarm build" | `/oh-my-claudecode:ultrapilot` |
| `swarm` | N 에이전트 조율 | "swarm N agents" | `/oh-my-claudecode:swarm` |
| `pipeline` | 순차 에이전트 체이닝 | "pipeline", "chain" | `/oh-my-claudecode:pipeline` |
| `cancel` | 모든 모드 통합 취소 | "stop", "cancel" | `/oh-my-claudecode:cancel` |
| `ecomode` | 토큰 효율적 병렬 실행 | "eco", "efficient", "budget" | `/oh-my-claudecode:ecomode` |
| `research` | 병렬 scientist 오케스트레이션 | "research", "analyze data" | `/oh-my-claudecode:research` |
| `tdd` | TDD 강제: 테스트 우선 개발 | "tdd", "test first" | `/oh-my-claudecode:tdd` |
| `mcp-setup` | MCP 서버 설정 | "setup mcp", "configure mcp" | `/oh-my-claudecode:mcp-setup` |

## 32 에이전트 전체 목록

Task tool 호출 시 `oh-my-claudecode:` 접두사 필수.

| 도메인 | LOW (Haiku) | MEDIUM (Sonnet) | HIGH (Opus) |
|--------|-------------|-----------------|-------------|
| **분석** | `architect-low` | `architect-medium` | `architect` |
| **실행** | `executor-low` | `executor` | `executor-high` |
| **탐색** | `explore` | `explore-medium` | `explore-high` |
| **리서치** | `researcher-low` | `researcher` | - |
| **프론트엔드** | `designer-low` | `designer` | `designer-high` |
| **문서** | `writer` | - | - |
| **비주얼** | - | `vision` | - |
| **계획** | - | - | `planner` |
| **비평** | - | - | `critic` |
| **사전계획** | - | - | `analyst` |
| **테스팅** | - | `qa-tester` | `qa-tester-high` |
| **보안** | `security-reviewer-low` | - | `security-reviewer` |
| **빌드** | `build-fixer-low` | `build-fixer` | - |
| **TDD** | `tdd-guide-low` | `tdd-guide` | - |
| **코드리뷰** | `code-reviewer-low` | - | `code-reviewer` |
| **데이터과학** | `scientist-low` | `scientist` | `scientist-high` |

## 에이전트 선택 가이드

| 작업 유형 | 최적 에이전트 | 모델 |
|-----------|-------------|------|
| 빠른 코드 조회 | `explore` | haiku |
| 파일/패턴 탐색 | `explore` or `explore-medium` | haiku/sonnet |
| 복잡한 아키텍처 탐색 | `explore-high` | opus |
| 단순 코드 변경 | `executor-low` | haiku |
| 기능 구현 | `executor` | sonnet |
| 복잡한 리팩토링 | `executor-high` | opus |
| 간단한 버그 디버그 | `architect-low` | haiku |
| 복잡한 버그 디버그 | `architect` | opus |
| UI 컴포넌트 | `designer` | sonnet |
| 복잡한 UI 시스템 | `designer-high` | opus |
| 문서/주석 작성 | `writer` | haiku |
| API/문서 리서치 | `researcher` | sonnet |
| 이미지/다이어그램 분석 | `vision` | sonnet |
| 전략 계획 | `planner` | opus |
| 계획 검토/비평 | `critic` | opus |
| 사전 계획 분석 | `analyst` | opus |
| CLI 테스트 | `qa-tester` | sonnet |
| 보안 리뷰 | `security-reviewer` | opus |
| 빠른 보안 스캔 | `security-reviewer-low` | haiku |
| 빌드 에러 수정 | `build-fixer` | sonnet |
| 간단한 빌드 수정 | `build-fixer-low` | haiku |
| TDD 워크플로우 | `tdd-guide` | sonnet |
| 데이터 분석/통계 | `scientist` | sonnet |
| 복잡한 ML/가설 | `scientist-high` | opus |

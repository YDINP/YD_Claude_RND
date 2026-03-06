# 11~12. Git Worktree 계획 + 팀별 문서화 에이전트
> 원본: PRD_Unified_v5.md §11~§12 (lines 1577-1766)

## 11. Git Worktree 8팀 병렬 작업 계획

### 11.1 브랜치 전략 (8팀 매핑)

```
main (안정, 릴리스용)
├── arcane/team-a-battle      ← TEAM A: 전투 통합 (systems + battle scenes)
├── arcane/team-b-scenes      ← TEAM B: 신규 씬 & UI (Tower/Login/Quest)
├── arcane/team-c-data        ← TEAM C: 데이터 & 백엔드 (migration, Supabase)
├── arcane/team-d-qa          ← TEAM D: 통합 QA & 최적화
├── arcane/team-e-chars       ← TEAM E: 캐릭터 데이터 설계
├── arcane/team-f-verify      ← TEAM F: 씬/패널 로직 검증
├── arcane/team-g-debug       ← TEAM G: 치트/디버그 API
├── arcane/team-h-design      ← TEAM H: 디자인 시스템 & 에셋
├── arcane/integration        ← 통합 테스트 브랜치
└── arcane/mood-migration     ← v5.2 속성→분위기 마이그레이션 전용
```

### 11.2 Worktree 폴더 구조

```
D:\park\
├── YD_Claude_RND/                    (main - 원본)
├── YD_Claude_RND-integration/        (arcane/integration - 통합)
├── YD_Claude_RND-team-a/             (arcane/team-a-battle)
├── YD_Claude_RND-team-b/             (arcane/team-b-scenes)
├── YD_Claude_RND-team-c/             (arcane/team-c-data)
├── YD_Claude_RND-team-d/             (arcane/team-d-qa)
├── YD_Claude_RND-team-e/             (arcane/team-e-chars)
├── YD_Claude_RND-team-f/             (arcane/team-f-verify)
├── YD_Claude_RND-team-g/             (arcane/team-g-debug)
├── YD_Claude_RND-team-h/             (arcane/team-h-design)
└── YD_Claude_RND-mood-migration/     (arcane/mood-migration)
```

### 11.3 파일 소유권 (충돌 방지)

| 팀 | 소유 파일/디렉터리 | 공유 금지 |
|----|-------------------|----------|
| A | `src/systems/BattleSystem.js`, `src/scenes/BattleScene.js` | BattleSystem 직접 수정 |
| B | `src/scenes/Tower*.js`, `src/scenes/Login*.js`, `src/scenes/Quest*.js` (신규) | 신규 씬 생성 |
| C | `src/data/**`, `src/api/**`, `src/services/**`, `supabase/**` | JSON 데이터, API |
| D | `tests/**`, `docs/test-reports/**` | 테스트 스크립트 |
| E | `src/data/characters.json`, `src/data/enemies.json`, `src/data/equipment.json` | 캐릭터/장비 데이터 |
| F | `src/scenes/*Scene.js` (기존 씬 검증, 수정은 A/B와 협의) | 읽기+검증 위주 |
| G | `src/systems/DebugManager.js`, `src/utils/cheatAPI.js` (신규) | 디버그 도구 |
| H | `src/components/**`, `src/config/gameConfig.js` (스타일), `assets/**` | UI 컴포넌트 |

> **충돌 해결 우선순위**: C(데이터) > A(시스템) > E(캐릭터) > B(씬) > H(디자인) > G(디버그) > F(검증) > D(QA)

### 11.4 Phase별 병렬 실행 계획

```
Week 1 (기반):
  [C] ─── 데이터 마이그레이션 (element→mood, JSON 정리)
  [E] ─── 캐릭터 감사 + 분위기(mood) 재배정
  [G] ─── DebugManager ES Module 수정
  [mood-migration] ─── 119개 element 참조 일괄 교체
  ↓ merge → integration

Week 2 (핵심):
  [A] ─── BattleSystem↔BattleScene 연결, MoodSystem 통합
  [B] ─── TowerScene, PartyEditScene 생성
  [H] ─── 공통 UI 컴포넌트 (BottomNav 5탭, TopBar)
  ↓ merge → integration

Week 3 (확장):
  [A] ─── SynergySystem 통합, 자동전투 AI
  [B] ─── LoginScene, QuestScene
  [C] ─── Supabase 연동
  [E] ─── 42명 추가 캐릭터 + 장비 81개
  [F] ─── 모든 Scene 데이터 바인딩 검증
  ↓ merge → integration

Week 4 (폴리싱):
  [D] ─── E2E 테스트, 크로스 브라우저 검증
  [H] ─── 최종 디자인, 애니메이션 폴리싱
  [ALL] ─── 버그 수정, 최종 통합
  ↓ merge → main (릴리스)
```

### 11.5 커밋 컨벤션 (v5.2)
```
[TEAM-X][TASK-ID] 설명

예시:
[TEAM-A][A-1] BattleSystem↔BattleScene 연결
[TEAM-C][C-1] data/index.js Element→Mood 마이그레이션
[TEAM-E][E-1] 39명 캐릭터 mood 필드 검증 완료
[MOOD] 119개 element 참조 일괄 교체
```

---

## 12. 팀별 문서화 에이전트 구성

> 각 팀에 전담 **문서화 에이전트**를 배정하여 개발 계획/구성/구현을 체계적으로 기록합니다.

### 12.1 문서화 에이전트 역할

| 역할 | 산출물 | 생성 시점 | 저장 위치 |
|------|--------|----------|----------|
| **계획 문서** | `PLAN.md` — 팀 목표, 의존성, 일정 | TASK 시작 전 | `docs/teams/{team}/PLAN.md` |
| **구성 문서** | `ARCHITECTURE.md` — 파일 구조, 데이터 흐름, API 계약 | TASK 설계 시 | `docs/teams/{team}/ARCHITECTURE.md` |
| **구현 로그** | `IMPLEMENTATION.md` — 완료 항목, 변경 이력, 이슈/해결 | TASK 완료 시 | `docs/teams/{team}/IMPLEMENTATION.md` |
| **검증 보고** | `VERIFICATION.md` — 테스트 결과, 미해결 이슈 | Phase 종료 시 | `docs/teams/{team}/VERIFICATION.md` |

### 12.2 팀별 에이전트 배정

| 팀 | 구현 에이전트 (기존) | **문서화 에이전트 (신규)** | 문서화 범위 |
|----|---------------------|--------------------------|------------|
| **TEAM A** | executor-high (opus) | **writer** (haiku) | 전투 시스템 통합 과정, MoodSystem 연동 API |
| **TEAM B** | executor (sonnet) | **writer** (haiku) | 신규 씬 설계서, UI 플로우 다이어그램 |
| **TEAM C** | executor (sonnet) | **writer** (haiku) | 데이터 스키마 변경 이력, Supabase 마이그레이션 가이드 |
| **TEAM D** | qa-tester-high (opus) | **writer** (haiku) | 테스트 케이스 목록, QA 보고서 |
| **TEAM E** | executor (sonnet) | **writer** (haiku) | 캐릭터 밸런스 시트, mood 배정 근거 |
| **TEAM F** | architect (opus) | **writer** (haiku) | 검증 체크리스트, 버그 트래커 |
| **TEAM G** | executor-low (haiku) | **writer** (haiku) | 치트 API 사용 가이드, 디버그 명령어 레퍼런스 |
| **TEAM H** | designer-high (opus) | **writer** (haiku) | 디자인 시스템 가이드, 컴포넌트 카탈로그 |

### 12.3 문서 디렉터리 구조 (신규)
```
docs/
├── PRD_Unified_v5.md          (마스터 문서)
├── TEAM_COMPOSITION.md        (팀 구성 참조)
├── WORKTREE_GUIDE.md          (Git Worktree 가이드)
├── teams/
│   ├── team-a/
│   │   ├── PLAN.md            ← 전투 통합 계획
│   │   ├── ARCHITECTURE.md    ← BattleSystem↔Scene API 계약
│   │   ├── IMPLEMENTATION.md  ← 구현 로그
│   │   └── VERIFICATION.md    ← 전투 시나리오 테스트 결과
│   ├── team-b/
│   │   ├── PLAN.md            ← 신규 씬 생성 계획
│   │   ├── ARCHITECTURE.md    ← 씬 플로우, 데이터 전달 패턴
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-c/
│   │   ├── PLAN.md            ← 데이터 마이그레이션 계획
│   │   ├── ARCHITECTURE.md    ← JSON 스키마, Supabase 테이블 설계
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-d/
│   │   ├── PLAN.md            ← QA 전략
│   │   ├── ARCHITECTURE.md    ← 테스트 프레임워크 구성
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-e/
│   │   ├── PLAN.md            ← 캐릭터 설계 계획
│   │   ├── ARCHITECTURE.md    ← 밸런스 공식, mood 배정 기준
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-f/
│   │   ├── PLAN.md            ← 검증 계획
│   │   ├── ARCHITECTURE.md    ← 검증 체크리스트 설계
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   ├── team-g/
│   │   ├── PLAN.md            ← 치트 API 계획
│   │   ├── ARCHITECTURE.md    ← 디버그 명령어 설계
│   │   ├── IMPLEMENTATION.md
│   │   └── VERIFICATION.md
│   └── team-h/
│       ├── PLAN.md            ← 디자인 시스템 계획
│       ├── ARCHITECTURE.md    ← 컴포넌트 카탈로그
│       ├── IMPLEMENTATION.md
│       └── VERIFICATION.md
└── changelogs/
    └── v5.2-mood-migration.md ← 속성→분위기 변경 이력
```

### 12.4 문서화 에이전트 실행 프로토콜

```
1. TASK 시작 시:
   → writer 에이전트가 PLAN.md 생성 (목표, 의존성, 예상 파일 변경 목록)

2. 설계 완료 시:
   → writer 에이전트가 ARCHITECTURE.md 생성 (API 계약, 데이터 흐름도, 인터페이스 명세)

3. 구현 중:
   → writer 에이전트가 IMPLEMENTATION.md에 변경 사항 누적 기록
   (변경 파일, 라인 범위, 변경 이유, 이슈 해결 방법)

4. Phase 종료 시:
   → writer 에이전트가 VERIFICATION.md 생성 (테스트 결과, 미해결 이슈, 다음 Phase 의존사항)
```

---

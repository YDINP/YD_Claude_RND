# ArcaneCollectors — 문서 인덱스 (DOCS_INDEX.md)

> **작성일**: 2026-03-07
> **담당**: game-design-director
> **기준**: Sprint 6 완료 기준 전체 문서 목록 정리

---

## 카테고리 1. 기획 문서 (GDD류)

### 통합 PRD

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `PRD_Unified_v5.md` | PRD 통합 최신본 (v5.2 기준) | 현행 |
| `PRD_Unified_v5_BACKUP.md` | PRD v5 백업본 | 아카이브 |

### 게임 디자인 문서 (GDD)

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `SPRINT6_GAMEDESIGN_PLAN.md` | Sprint 6 게임 디자인 격차 분석 및 로드맵 | 현행 |
| `SPRINT7_SYSTEM_GDD.md` | Sprint 7~10 시스템 디자인 — 스킬/경제/시즌 | **신규 (2026-03-07)** |
| `SPRINT7_NARRATIVE_GDD.md` | Sprint 7~10 내러티브 — 캐릭터/프롤로그/컷씬 | **신규 (2026-03-07)** |
| `SPRINT7_LEVEL_GDD.md` | Sprint 7~10 레벨 디자인 — 챕터/타워/레이드 | **신규 (2026-03-07)** |
| `SPRINT7_UX_GDD.md` | Sprint 7~10 UX/UI — 메인메뉴/가챠/소셜 | **신규 (2026-03-07)** |
| `CHARACTER_SYSTEM_GDD.md` | 전직 시스템 v1.0 (구버전 참고용) | 레거시 |
| `EVOLUTION_SYSTEM_GDD.md` | 기본영웅 복수 진화루트 v2.0 (최신 최종) | 현행 |
| `AWAKENING_SYSTEM_GDD.md` | 교단 각성 시스템 전체 설계 | 현행 |

### 교단 & 세계관 설계

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `CULT_NARRATIVE_DESIGN.md` | 교단 내러티브 & 캐릭터 아이덴티티 (v1.0) | 현행 |
| `CULT_SYSTEM_DESIGN.md` | 교단별 전투 메커니즘 & 상성 시스템 | 현행 |
| `CULT_REDESIGN_V2.md` | 교단 서브컬쳐 리디자인 v2 | 현행 |
| `INSTITUTION_REDESIGN.md` | 소환 기관/학파 컨셉 리디자인 | 현행 |

### 디자인 시스템 & 에셋

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `DESIGN_SYSTEM.md` | 컬러/폰트/컴포넌트 토큰 (Blue Archive × NIKKE 하이브리드) | 현행 |
| `PROCEDURAL_ART_GUIDE.md` | 프로시저럴 렌더러 가이드 | 현행 |
| `character_prompts.md` | 캐릭터 이미지 생성 프롬프트 | 현행 |
| `ASSET_MAPPING_GUIDE.md` | 에셋 매핑 가이드 | 현행 |

---

## 카테고리 2. 구현/아키텍처 문서

### 아키텍처

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `ARCHITECTURE.md` | 전체 시스템 아키텍처 | 현행 |
| `ARCHITECTURE_VFX-2.1.md` | VFX 2.1 아키텍처 | 현행 |
| `AUTH_SYSTEM.md` | 인증 시스템 설계 | 현행 |
| `IDLE_BATTLE_INTEGRATION.md` | 유휴 전투 통합 설계 | 현행 |

### VFX & 구현 보고서

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `VFX-2.1_EXECUTIVE_SUMMARY.md` | VFX 2.1 요약 | 현행 |
| `VFX-2.1_IMPLEMENTATION_CHECKLIST.md` | VFX 2.1 구현 체크리스트 | 현행 |
| `INFRA-2-CI-CD-REPORT.md` | CI/CD 인프라 보고서 | 현행 |
| `GP-3-EventDungeonSystem-Implementation.md` | 이벤트 던전 구현 보고서 | 현행 |
| `GP-5-SANDBAG-BOSS-PROGRESS.md` | 샌드백 보스 진행 보고서 | 현행 |

### 기타 구현 문서

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `PLAN_RESOLUTION_LAYOUT.md` | 레이아웃 해상도 계획 | 현행 |
| `PRD_MOBILE_DEBUG.md` | 모바일 디버그 PRD | 현행 |
| `BUGFIX_PRD_v1.md` | 버그픽스 PRD v1 | 아카이브 |

---

## 카테고리 3. 테스트/QA 문서

### 활성 테스트 문서

| 파일명 (경로) | 설명 | 상태 |
|------------|------|------|
| `testing/SPRINT2_WAVE1_TEST_SCENARIOS.md` | Sprint 2 Wave 1 테스트 시나리오 | 완료 |
| `testing/SPRINT2_WAVE2_TEST_SCENARIOS.md` | Sprint 2 Wave 2 테스트 시나리오 | 완료 |
| `testing/SPRINT2_WAVE2_TEST_RESULTS.md` | Sprint 2 Wave 2 테스트 결과 | 완료 |
| `testing/PLAYWRIGHT_MCP_TEST_SCENARIOS.md` | Playwright MCP 테스트 시나리오 | 현행 |
| `QA_SCENARIOS_v1.md` | QA 시나리오 v1 | 현행 |

### 완료된 테스트 문서

| 파일명 (경로) | 설명 |
|------------|------|
| `done/testing/CROSS_BROWSER_TEST_PLAN.md` | 크로스 브라우저 테스트 계획 |
| `done/testing/SCENE_FLOW_TEST.md` | 씬 플로우 테스트 |
| `done/testing/BATTLE_E2E_TEST.md` | 전투 E2E 테스트 |
| `done/testing/GACHA_PROBABILITY_TEST.md` | 가챠 확률 테스트 |
| `done/testing/BALANCE_SIMULATION.md` | 밸런스 시뮬레이션 |

---

## 카테고리 4. 완료/아카이브 문서

### 완료된 PRD 및 기획

| 파일명 (경로) | 설명 |
|------------|------|
| `done/prd-completed/TEAM_COMPOSITION.md` | 팀 구성 |
| `done/prd-completed/11_WORKTREE_DOCS.md` | 워크트리 문서 |
| `done/prd-completed/PRD_POPUP_ARCHITECTURE.md` | 팝업 아키텍처 PRD |
| `done/prd-completed/CHANGELOG_v5.3_mood_expansion.md` | v5.3 무드 확장 체인지로그 |
| `done/prd-completed/10_MIGRATION.md` | 마이그레이션 문서 |
| `done/prd-completed/WORKTREE_GUIDE.md` | 워크트리 가이드 |

### 완료된 태스크 및 개발 로그

| 파일명 (경로) | 설명 |
|------------|------|
| `done/tasks/TASK_TRACKER.md` | 전체 태스크 트래커 |
| `done/tasks/SPRINT2_WAVE2_PLAN.md` | Sprint 2 Wave 2 계획 |
| `done/tasks/TASK_PROGRESS.md` | 태스크 진행도 |
| `done/tasks/TASK_8_COMPLETE.md` | 태스크 8 완료 보고 |
| `done/dev-logs/2025-02-04_코드베이스_분석.md` | 코드베이스 분석 로그 |
| `done/dev-logs/2025-02-04_병렬작업_시작.md` | 병렬 작업 시작 로그 |
| `done/dev-logs/2025-02-04_v5_통합완료.md` | v5 통합 완료 로그 |

### 완료된 워커 문서

| 파일명 (경로) | 설명 |
|------------|------|
| `done/workers/W1_BACKEND.md` | 백엔드 워커 |
| `done/workers/W2_DATA.md` | 데이터 워커 |
| `done/workers/W3_UI.md` | UI 워커 |
| `done/workers/W4_SYSTEM.md` | 시스템 워커 |
| `done/workers/W5_CONFIG.md` | 설정 워커 |

---

## 카테고리 5. PRD 서브 문서 (prd/ 폴더)

| 파일명 | 설명 |
|--------|------|
| `prd/00_INDEX.md` | PRD 인덱스 |
| `prd/01_OVERVIEW.md` | 개요 |
| `prd/02_CORE_SYSTEMS.md` | 핵심 시스템 |
| `prd/03_ARCHITECTURE.md` | 아키텍처 |
| `prd/04_TEAMS.md` | 팀 구성 |
| `prd/05_TASKS_AB.md` | 태스크 A~B |
| `prd/06_TASKS_CD.md` | 태스크 C~D |
| `prd/07_TASKS_EF.md` | 태스크 E~F |
| `prd/08_TASKS_GH.md` | 태스크 G~H |
| `prd/09_STANDARDS_PHASES.md` | 표준 & 단계 |
| `prd/12_SYNERGY.md` | 시너지 시스템 |
| `prd/13_EXPANSION_BALANCE.md` | 확장 밸런스 |
| `prd/14_CHARACTER_DESIGN.md` | 캐릭터 디자인 |
| `prd/15_COMPATIBILITY_LINT.md` | 호환성 Lint |
| `prd/16_ANIMATION_VFX.md` | 애니메이션 VFX |
| `prd/17_UI_UX_ENHANCEMENT.md` | UI/UX 개선 |
| `prd/18_RESOURCE_ASSETS.md` | 리소스 에셋 |
| `prd/19_TYPESCRIPT_OPTIMIZATION.md` | TypeScript 최적화 |
| `prd/20_QA_TESTING.md` | QA 테스팅 |
| `prd/PRD_Sprint3_UIX.md` | Sprint 3 UI/X PRD |
| `prd/APPENDIX.md` | 부록 |

---

## 카테고리 6. 디자인 스펙 (design-specs/ 폴더)

| 파일명 | 설명 |
|--------|------|
| `design-specs/main-menu.md` | 메인 메뉴 씬 스펙 |
| `design-specs/entry-flow.md` | 진입(로그인/부트) 플로우 |
| `design-specs/gacha-stage.md` | 가챠/스테이지 화면 스펙 |
| `design-specs/hero-system.md` | 영웅 시스템 UI 스펙 |
| `design-specs/secondary-scenes.md` | 보조 씬 스펙 |
| `design-specs/battle-flow.md` | 전투 화면 플로우 |

---

## 기타 문서

| 파일명 | 설명 | 상태 |
|--------|------|------|
| `CURRENT_STATUS.md` | 현재 프로젝트 상태 요약 | 현행 (주기적 업데이트) |
| `ISSUES_2026-02-17.md` | 이슈 목록 (2026-02-17) | 아카이브 |
| `PRD_SPRINT5_BUGFIX.md` | Sprint 5 버그픽스 PRD | 완료 |
| `handoff.md` | 핸드오프 문서 | 현행 |
| `done/POPUP_USAGE.md` | 팝업 사용 가이드 | 완료 |

---

## 문서 우선순위 가이드 (신규 팀원용)

**처음 읽어야 할 문서 (필수):**
1. `CURRENT_STATUS.md` — 현재 상태 파악
2. `PRD_Unified_v5.md` — 전체 기획 방향
3. `ARCHITECTURE.md` — 시스템 구조 이해
4. `DESIGN_SYSTEM.md` — 디자인 기준

**스프린트 구현 참고 (Sprint 7~10):**
1. `SPRINT7_SYSTEM_GDD.md` — 스킬/경제/시즌 시스템
2. `SPRINT7_NARRATIVE_GDD.md` — 캐릭터/스토리
3. `SPRINT7_LEVEL_GDD.md` — 레벨/타워/레이드
4. `SPRINT7_UX_GDD.md` — UX/UI 설계

**세계관 & 캐릭터 참고:**
1. `CULT_NARRATIVE_DESIGN.md` — 교단 세계관 전체
2. `AWAKENING_SYSTEM_GDD.md` — 각성 시스템
3. `EVOLUTION_SYSTEM_GDD.md` — 진화 시스템

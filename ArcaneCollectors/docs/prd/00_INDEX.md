# ArcaneCollectors PRD — 문서 인덱스

> 원본 백업: `docs/PRD_Unified_v5_BACKUP.md` (2194줄)
> 최종 업데이트: 2026-02-07
> 버전: v5.3 (Phase 2 계획 PRD 6개 추가, DONE 폴더 정리)

---

## 문서 구조

### Phase 1: 핵심 설계 (v5.2 확정)

| # | 파일명 | 내용 |
|---|--------|------|
| 01 | `01_OVERVIEW.md` | 프로젝트 개요, 세계관, 교단 시스템 |
| 02 | `02_CORE_SYSTEMS.md` | 캐릭터/가챠/전투/에너지/소탕/탑/장비/스테이지/시너지/퀘스트/오프라인 보상 |
| 03 | `03_ARCHITECTURE.md` | 기술 아키텍처, 프로젝트 구조, Supabase 백엔드 |
| 04 | `04_TEAMS.md` | 8팀 구성 (A~H), 에이전트 배정 |
| 05 | `05_TASKS_AB.md` | TASK: Team A (전투 통합) + Team B (신규 씬 & UI) |
| 06 | `06_TASKS_CD.md` | TASK: Team C (데이터 & 백엔드) + Team D (통합 QA) |
| 07 | `07_TASKS_EF.md` | TASK: Team E (캐릭터 데이터) + Team F (씬/패널 검증) |
| 08 | `08_TASKS_GH.md` | TASK: Team G (치트 API) + Team H (디자인 & 에셋) |
| 09 | `09_STANDARDS_PHASES.md` | 코딩 표준, 확장 아이디어, Phase별 실행 계획 |
| 12 | `12_SYNERGY.md` | 시너지 조합 시스템 + 시너지 스킬 (패시브/액티브/궁극기) |
| 13 | `13_EXPANSION_BALANCE.md` | 확장가능성 평가 + 캐릭터 밸런스 분석 (91명) |
| 14 | `14_CHARACTER_DESIGN.md` | 캐릭터 디자인 가이드: 분위기별 이펙트, 교단별 테마, 91명 로스터 |
| A | `APPENDIX.md` | 부록 A: 8개 사양 불일치 결정 + 부록 B: 변경이력 |

### Phase 2: 고도화 계획 PRD (v5.3 신규)

| # | 파일명 | 내용 | 핵심 태스크 ID |
|---|--------|------|--------------|
| 15 | `15_COMPATIBILITY_LINT.md` | 타입 호환성, ESLint 강화, 데이터 스키마 검증 | CMP, LINT, SCHEMA, PIPE |
| 16 | `16_ANIMATION_VFX.md` | 연출/애니메이션/VFX: 씬전환, 전투이펙트, 가챠연출, UI 인터랙션 | VFX |
| 17 | `17_UI_UX_ENHANCEMENT.md` | UI/UX 고도화, 로직 무결성 검증, 씬별 개선 계획 | UIX |
| 18 | `18_RESOURCE_ASSETS.md` | 리소스/에셋 교체: 캐릭터 일러스트, 배경, UI, 이펙트 | RES |
| 19 | `19_TYPESCRIPT_OPTIMIZATION.md` | JS→TS 전환, 디자인 패턴, 코드 분할, 성능 최적화 | TSO, PAT, REFAC, PERF |
| 20 | `20_QA_TESTING.md` | QA 테스팅, Electron MCP 활용, Vitest 도입, 시나리오 테스트 | QAT, QA-F, QA-E, QA-D |

### 완료/아카이브 (`docs/done/`)

| 폴더 | 내용 |
|------|------|
| `done/tasks/` | TASK_PROGRESS.md, TASK_TRACKER.md (Phase 1 태스크 100% 완료) |
| `done/dev-logs/` | 개발 로그 3개 (2025-02-04) |
| `done/testing/` | 수동 테스트 결과 5개 (E2E, 씬플로우, 가챠, 밸런스, 크로스브라우저) |
| `done/workers/` | 워커 문서 5개 (W1~W5) |
| `done/prd-completed/` | 완료된 PRD (10_MIGRATION, 11_WORKTREE, CHANGELOG, TEAM_COMPOSITION, WORKTREE_GUIDE) |

---

## Phase 2 계획 PRD 상호 의존성

```
15_COMPATIBILITY_LINT ←→ 19_TYPESCRIPT (ESLint TS 확장 연계)
15_COMPATIBILITY_LINT ←→ 20_QA_TESTING (데이터 스키마 검증 연계)
16_ANIMATION_VFX ←→ 17_UI_UX (연출과 UI 개선 연동)
16_ANIMATION_VFX ←→ 18_RESOURCE_ASSETS (파티클 스프라이트 에셋)
17_UI_UX ←→ 18_RESOURCE_ASSETS (UI 에셋 교체)
19_TYPESCRIPT ←→ 20_QA_TESTING (Vitest + TS 연계)
14_CHARACTER_DESIGN → 16_ANIMATION_VFX (분위기별 이펙트 참조)
14_CHARACTER_DESIGN → 18_RESOURCE_ASSETS (캐릭터 디자인 참조)
```

### 권장 실행 순서

```
Phase 2-A (기반):  15_COMPATIBILITY → 20_QA_TESTING (린트+테스트 먼저)
Phase 2-B (코드):  19_TYPESCRIPT (타입 안전성 확보)
Phase 2-C (비주얼): 16_ANIMATION + 17_UI_UX (병렬 가능)
Phase 2-D (에셋):  18_RESOURCE_ASSETS (마지막, 에셋 준비 시간 필요)
```

---

## 팀별 필요 문서 매핑

### Phase 1 (기존)
| 팀 | 필수 문서 | 참고 문서 |
|----|----------|----------|
| **Team A** (전투 통합) | `02`, `05`, `12` | `APPENDIX` |
| **Team B** (신규 씬 & UI) | `02`, `05` | `03` |
| **Team C** (데이터 & 백엔드) | `02`, `06` | `03`, `APPENDIX` |
| **Team D** (통합 QA) | `06`, `09` | 전체 |
| **Team E** (캐릭터 데이터) | `02`, `07`, `13` | `12` |
| **Team F** (씬/패널 검증) | `02`, `07` | `03` |
| **Team G** (치트 API) | `08` | `02`, `03` |
| **Team H** (디자인 & 에셋) | `08`, `01`, `14` | `02` |

### Phase 2 (신규)
| 역할 | 필수 문서 | 참고 문서 |
|------|----------|----------|
| **린트/검증 담당** | `15` | `09`, `19` |
| **애니메이션 담당** | `16` | `14`, `17` |
| **UI/UX 담당** | `17` | `16`, `18` |
| **에셋 담당** | `18` | `14`, `16` |
| **TS 전환 담당** | `19` | `15`, `20` |
| **QA 담당** | `20` | `15`, `19` |

---

## 핵심 시스템 퀵 레퍼런스

- **분위기(Mood) 9종**: brave(열혈)/fierce(격렬)/wild(광폭)/calm(고요)/stoic(의연)/devoted(헌신)/cunning(냉철)/noble(고결)/mystic(신비) → `02`, `14`
- **교단(Cult) 9교단**: olympus/takamagahara/yomi/asgard/valhalla/tartarus/avalon/helheim/kunlun → `01`, `14`
- **캐릭터**: 91명 로스터, ★1~★5, 4클래스 → `14`, `13`
- **데미지 공식**: `ATK × mult × (1 - DEF/1000, min 10%)` → `APPENDIX` A-3
- **시너지 스킬**: 패시브/액티브/궁극기 3종 → `12`
- **타입 변환**: `getRarityKey()`/`getRarityNum()` → `src/utils/helpers.js`
- **데이터 정규화**: `normalizeHero()`/`normalizeHeroes()` → `src/data/index.js`

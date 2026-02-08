# ArcaneCollectors 태스크 진행 추적

> 각 태스크별 Git 브랜치 개발 + 진행 상태 추적
> 베이스 브랜치: `arcane/integration`

## 워크플로우
1. `arcane/integration`에서 각 워크트리 브랜치로 작업
2. 구현 + 커밋
3. `arcane/integration`으로 머지
4. 이 문서 업데이트

---

## Phase 1 완료 (DONE) — 71/71 (100%)

<details>
<summary>Phase 1 완료 태스크 목록 (접기/펼치기)</summary>

### 사전 통합 (Pre-integration)
| ID | 태스크 | 브랜치 | 완료일 |
|----|--------|--------|--------|
| A-1~A-8 | 전투 시스템 전체 통합 | arcane/integration | 2026-02-07 |
| G-1~G-10 | DebugManager 치트 시스템 | arcane/integration | 2026-02-07 |
| H-1~H-10 | 디자인/에셋/UX 시스템 | arcane/integration | 2026-02-07 |
| C-1~C-5 | 데이터/백엔드 기초 | arcane/integration | 2026-02-07 |
| B-1,B-2,B-3,B-5,B-6 | 신규 씬 & UI 기초 | arcane/integration | 2026-02-07 |
| D-5 | 크로스브라우저 테스트 계획 | arcane/integration | 2026-02-07 |
| E-1~E-3,E-5,E-7~E-9 | 캐릭터 데이터 기초 | arcane/integration | 2026-02-07 |
| W-대부분 | 워커 태스크 (23/25) | arcane/integration | 2026-02-07 |

### 브랜치별 개발 (Session 1~3)
| ID | 태스크 | 브랜치 | 커밋 | 완료일 |
|----|--------|--------|------|--------|
| B-4 | SweepSystem UI | `task/B-4-sweep-ui` | `237e7ab` | 2026-02-07 |
| B-7 | 장비 가챠 천장 카운터 UI | `task/B-7-equipment-gacha` | `dab4d68` | 2026-02-07 |
| C-6 | 쿠폰 입력 UI 개선 | `task/C-6-coupon-ui` | `2786b28` | 2026-02-07 |
| W3-3.3 | BottomNav 전 씬 통합 | `task/W3-3.3-bottomnav-integration` | `3367521` | 2026-02-07 |
| F-1~F-12 | 전체 씬 검증 | `task/F-batch-scene-verification` | `aebc346` | 2026-02-07 |
| D-1~D-4 | 테스트 + 빌드 최적화 | 각 task/ 브랜치 | - | 2026-02-07 |
| E-4,E-6,E-10 | 스킬/적/밸런스 확장 | 각 task/ 브랜치 | - | 2026-02-07 |
| W1-1.4 | Supabase 마이그레이션 유틸 | `task/W1-1.4-supabase-migration` | `4775dad` | 2026-02-07 |
| QA-1 | 전 씬 shutdown + Error Boundary | `task/code-quality-improvements` | `2496a53` | 2026-02-07 |
| DOC-1 | 프로젝트 종합 문서화 | `task/project-documentation` | - | 2026-02-07 |

</details>

---

## Phase 2 — 코드 품질 · 연출 · UI/UX · 에셋 · 테스팅

### 워크트리별 병렬 작업 배정

| 워크트리 | PRD | 담당 영역 | 브랜치 |
|----------|-----|---------|--------|
| **w1** | 15_COMPAT_LINT | 호환성 · 린트 · 스키마 검증 | `arcane/w1-backend` |
| **w2** | 19_TYPESCRIPT | TypeScript 전환 · 패턴 최적화 | `arcane/w2-data` |
| **w3** | 17_UI_UX | UI/UX 고도화 · 무결성 검증 | `arcane/w3-ui` |
| **w4** | 16_ANIMATION_VFX | 연출 · 애니메이션 · VFX | `arcane/w4-system` |
| **w5** | 20_QA_TESTING | QA 테스팅 · Vitest · MCP 연동 | `arcane/w5-config` |
| **w6** | 18_RESOURCE_ASSETS | 리소스 · 에셋 추상화 레이어 | `arcane/w6-content` |

---

### 진행중 (IN PROGRESS)

| ID | 태스크 | 워크트리 | 브랜치 | 시작일 | 상태 |
|----|--------|---------|--------|--------|------|
| - | (Sprint 1 완료, Sprint 2 대기) | - | - | - | - |

---

### 예정 (TODO) — Sprint 2 (의존 태스크)

#### W1: 호환성 · 린트 (PRD 15)
| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| COMPAT-1.2 | Stats 스키마 통일 (baseStats→stats) | H | COMPAT-1.1 ✅ |
| SCHEMA-3.1 | JSON Schema 정의 | M | COMPAT-1.1 ✅ |

#### W2: TypeScript 전환 (PRD 19)
| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| TSO-3.1 | src/utils/ .ts 전환 시작 | M | TSO-2.1 ✅ |
| PAT-1.1 | Command 패턴 적용 | M | TSO-2.1 ✅ |

#### W3: UI/UX (PRD 17)
| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| UIX-4.2.1 | 시스템 호출 null/undefined 방어 | M | UIX-4.1.1 ✅ |
| UIX-2.1 | MainMenu 씬 UI 개선 | M | UIX-3.1.1 ✅ |

#### W4: 연출 · VFX (PRD 16)
| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| VFX-2.1 | 스킬 애니메이션 시스템 | H | VFX-1.1 ✅ |
| VFX-2.2 | 분위기 9종 파티클 이펙트 | H | VFX-2.1 |

#### W5: QA 테스팅 (PRD 20)
| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| QAT-T2-1 | MoodSystem 유닛 테스트 (~20개) | M | QAT-FW ✅ |
| QAT-T2-2 | BattleSystem 유닛 테스트 (~30개) | H | QAT-FW ✅ |
| QAT-T2-3 | GachaSystem 유닛 테스트 (~15개) | M | QAT-FW ✅ |

#### W6: 리소스 · 에셋 (PRD 18)
| ID | 태스크 | 복잡도 | 의존성 |
|----|--------|--------|--------|
| RES-ABS-4 | 레이지 로딩 패턴 구현 | M | RES-ABS-3 ✅ |
| RES-PH1 | UI 아이콘 에셋 교체 (Phase 1) | M | RES-ABS-1 ✅ |

---

### Phase 2 Sprint 1 완료 (DONE) — 28/31 (90%)

| ID | 태스크 | 워크트리 | 커밋 | 완료일 |
|----|--------|---------|------|--------|
| **COMPAT-1.1** | Rarity 타입 통합 (rarityUtils.js) | w1 | `337f28f` | 2026-02-08 |
| **LINT-2.1** | Phaser 특화 ESLint 규칙 추가 | w1 | `337f28f` | 2026-02-08 |
| **LINT-2.3** | 데이터 접근 패턴 린트 | w1 | `337f28f` | 2026-02-08 |
| **LINT-2.4** | Import 순서 정리 | w1 | `337f28f` | 2026-02-08 |
| **TSO-1.1** | tsconfig.json 생성 | w2 | `ed510a8` | 2026-02-08 |
| **TSO-1.2** | Vite TS 설정 확인 | w2 | `ed510a8` | 2026-02-08 |
| **TSO-1.3** | npm scripts 추가 (typecheck) | w2 | `ed510a8` | 2026-02-08 |
| **TSO-1.4** | ESLint TS 플러그인 설치 | w2 | `ed510a8` | 2026-02-08 |
| **TSO-2.1** | src/types/ 핵심 인터페이스 정의 (9파일) | w2 | `ed510a8` | 2026-02-08 |
| **UIX-3.1.1** | 색상 팔레트 통일 (designSystem.js) | w3 | `067e463` | 2026-02-08 |
| **UIX-3.1.2** | 폰트 시스템 통일 (textStyles.js 강화) | w3 | `067e463` | 2026-02-08 |
| **UIX-3.1.3** | 간격/여백 표준 (4px 단위) | w3 | `067e463` | 2026-02-08 |
| **UIX-4.1.1** | 씬 초기화 검증 (null 체크 강화) | w3 | `067e463` | 2026-02-08 |
| **UIX-3.4.2** | 터치 영역 최적화 검증 | w3 | `067e463` | 2026-02-08 |
| **VFX-1.1** | TransitionManager 신규 구현 | w4 | `d8c157a` | 2026-02-08 |
| **VFX-1.2** | 씬별 전환 매핑 적용 (11개 씬) | w4 | `d8c157a` | 2026-02-08 |
| **VFX-4.1** | 버튼 터치 피드백 (tint+scale) | w4 | `1e54f53` | 2026-02-08 |
| **VFX-4.6** | 토스트 슬라이드+fade 애니메이션 | w4 | `1e54f53` | 2026-02-08 |
| **VFX-4.7** | 모달 scale+fade 애니메이션 | w4 | `1e54f53` | 2026-02-08 |
| **QAT-FW-1** | Vitest 설치 | w5 | `ba646c4` | 2026-02-08 |
| **QAT-FW-2** | vitest.config.js 작성 | w5 | `ba646c4` | 2026-02-08 |
| **QAT-FW-3** | npm scripts 추가 (test, test:watch, coverage) | w5 | `ba646c4` | 2026-02-08 |
| **QAT-T1-1** | data/index.js 유닛 테스트 (78개) | w5 | `ba646c4` | 2026-02-08 |
| **QAT-T1-2** | helpers.js 유닛 테스트 (69개) | w5 | `ba646c4` | 2026-02-08 |
| **QAT-T1-3** | constants.js 무결성 테스트 (37개) | w5 | `ba646c4` | 2026-02-08 |
| **RES-DIR** | 에셋 디렉토리 구조 생성 (20개 폴더) | w6 | `a2c3100` | 2026-02-08 |
| **RES-ABS-1** | CharacterRenderer 추상화 레이어 | w6 | `a2c3100` | 2026-02-08 |
| **RES-ABS-2** | UIRenderer 추상화 레이어 | w6 | `a2c3100` | 2026-02-08 |
| **RES-ABS-3** | PreloadScene Phase별 로딩 구조화 | w6 | `7f0c0fc` | 2026-02-08 |

### Sprint 1 미완료 (다음 Sprint으로 이월)
| ID | 태스크 | 사유 |
|----|--------|------|
| COMPAT-1.2 | Stats 스키마 통일 | COMPAT-1.1 의존, Sprint 2로 |
| RES-ABS-4 | 레이지 로딩 패턴 | RES-ABS-3 의존, Sprint 2로 |

---

## 통계
- **Phase 1**: 71/71 완료 (100%)
- **Phase 2 Sprint 1**: 29/31 완료 (94%) — 6개 워크트리 병렬 진행 ✅
- **Phase 2 Sprint 2**: 0/?? (대기)
- **총 테스트**: 184/184 통과 (Vitest, 232ms)
- **빌드**: 정상 (vite build 3.61s, 99 modules)
- **통합 커밋**: `83621e7` (arcane/integration)

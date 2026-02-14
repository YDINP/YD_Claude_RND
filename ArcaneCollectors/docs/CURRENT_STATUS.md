# ArcaneCollectors 현재 상태

> **최종 업데이트**: 2026-02-14
> **브랜치**: `arcane/integration`
> **테스트**: 562/562 유닛 + 34/34 E2E = 596개 통과 | **빌드**: tsc 0 에러

---

## 완료된 작업 (전체)

### Phase 1: 통합 기초 — 69/69 (100%)
Team A~H + Worker 전체 완료. 상세: `docs/done/tasks/TASK_TRACKER.md`

### Phase 2 Sprint 1: 코드 품질 — 29/31 (94%)
6개 워크트리 병렬 (COMPAT, TS, UIX, VFX, QA, RES). 상세: `docs/done/tasks/TASK_PROGRESS.md`

### Phase 2 Sprint 2: 심화 — Wave 1(14) + Wave 2(19) = 33/33 (100%)
baseStats→stats 통일, TS 전환, RadarChart, Mood 파티클, 유닛테스트 337개. 상세: 동일 파일

### Sprint 3: UI/UX + 팝업 전환 — 전체 완료
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| Task #7 | 자동전투 파티 연동 | `7c6fd82` | 02-14 |
| Task #8 | BottomNav 제거 + 하단 메뉴 아이콘 | `366ca10` | 02-14 |
| Task #9 | 7개 씬 → 팝업 전환 (PopupBase) | `366ca10` | 02-14 |
| Task #10 | 전투력 ProgressionSystem 통일 | `7c6fd82` | 02-14 |
| Task #11 | 모험 속도 개선 + 자동 스테이지 진행 | `7c6fd82` | 02-14 |
| Task #12 | 자동전투 HP바/스테이지 저장 버그 수정 | `dcd784f` | 02-14 |
| 보스전 | 턴제 전투 구현 (데이터 기반 + 인트로) | `4cacc63`~`cf83f74` | 02-14 |
| 팝업 Fix | 닫기 라이프사이클 + 이름 표시 | `66ede26`, `d50fb9a` | 02-14 |
| 에너지 Fix | 초기화 + 보석충전 + 레이아웃 | `69d6a1b` | 02-14 |

### Sprint 3 후속: 백로그 일괄 완료
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| QA-OPT-1 | scene.restart() → 부분 갱신 최적화 | `27f4b6d` | 02-14 |
| QA-OPT-2 | clearedStages 숫자 정렬 개선 | `27f4b6d` | 02-14 |
| QA-OPT-3 | IdleBattleView/IdleProgressSystem 타이밍 동기화 | `27f4b6d` | 02-14 |
| AUTH-1.1 | 자동로그인 (BootScene localStorage) | `b8f9ad5` | 02-14 |
| AUTH-1.2 | 계정 변경 (SettingsPopup) | `b8f9ad5` | 02-14 |
| AUTH-1.3 | 로그인 화면 개선 (체크박스) | `b8f9ad5` | 02-14 |
| ART-1.1 | 프로시저럴 배경 5종 (BackgroundFactory) | `f1e0ccf` | 02-14 |
| ART-1.2 | 프로시저럴 UI 아이콘 7종 (IconFactory) | `f1e0ccf` | 02-14 |
| ART-1.3 | 캐릭터 렌더러 강화 (실루엣/글로우/Mood) | `f1e0ccf` | 02-14 |

### 테스트 커버리지 확장
| 항목 | 커밋 | 날짜 |
|------|------|------|
| 유닛 테스트 9개 시스템 추가 (353→562) | `654c71a` | 02-14 |
| Playwright E2E 34개 (로그인/메뉴/팝업/전투/자동로그인) | `654c71a` | 02-14 |

---

## 남은 태스크 (백로그)

> 기존 P1~P3 백로그가 모두 완료되어 새로운 백로그를 정리합니다.

### P1: 실제 아트 에셋 교체
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| ART-2.1 | 실제 배경 이미지 교체 | M | 프로시저럴 → 실제 PNG/WebP (BackgroundFactory 추상화 활용) |
| ART-2.2 | 실제 캐릭터 스프라이트 | H | 91캐릭터 스프라이트시트 (CharacterRenderer 교체) |
| ART-2.3 | UI 테마/스킨 | M | 버튼/패널 이미지 에셋, 폰트 교체 |

### P2: 게임플레이 확장
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| GP-1 | PvP/랭킹 | H | 실시간/비동기 PvP, 리더보드 |
| GP-2 | 길드 시스템 | H | 길드 생성/가입, 길드전 |
| GP-3 | 이벤트 던전 | M | 기간 한정 스테이지, 특별 보상 |

### P3: 인프라/배포
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| INFRA-1 | 프로덕션 빌드 최적화 | M | 번들 분석, 코드 스플리팅, 에셋 CDN |
| INFRA-2 | CI/CD 파이프라인 | M | GitHub Actions (빌드+테스트+배포) |
| INFRA-3 | 호스팅 배포 | L | Vercel/Netlify/Firebase Hosting |

---

## 테스트 현황

### Vitest 유닛 테스트 (562개)
| # | 파일 | 테스트 수 |
|---|------|----------|
| 1 | data/index.test.js | 62 |
| 2 | BattleSystem.test.js | 45 |
| 3 | EquipmentSystem.test.js | 44 |
| 4 | constants.test.js | 37 |
| 5 | PartyManager.test.js | 33 |
| 6 | SaveManager.test.js | 33 |
| 7 | ProgressionSystem.test.js | 26 |
| 8 | SweepSystem.test.js | 25 |
| 9 | CouponSystem.test.js | 24 |
| 10 | EvolutionSystem.test.js | 24 |
| 11 | EventBus.test.js | 23 |
| 12 | errorPatterns.test.js | 23 |
| 13 | MoodSystem.test.js | 21 |
| 14 | TowerSystem.test.js | 21 |
| 15 | QuestSystem.test.js | 20 |
| 16 | IdleProgressSystem.test.js | 17 |
| 17 | EnergySystem.test.js | 17 |
| 18 | GachaSystem.test.js | 16 |
| 19 | SynergySystem.test.js | 16 |
| 20 | AutoLogin.test.js | 16 |
| 21 | helpers.test.js | 13 |

### Playwright E2E 테스트 (34개)
| 카테고리 | 테스트 수 | 내용 |
|----------|----------|------|
| 로그인 플로우 | 3 | 캔버스, LoginScene, MainMenu 전환 |
| 메인 메뉴 | 3 | 활성화, IdleBattleView, UI 요소 |
| 팝업 7종 | 21 | 열기/닫기/복귀 × 7 |
| 자동전투 | 4 | HP바, 전투사이클, 적 유닛 |
| 자동 로그인 | 3 | localStorage, 씬 스킵 |

실행 명령:
```bash
npm test          # Vitest 유닛 테스트
npm run test:e2e  # Playwright E2E (headless)
npm run test:e2e:headed  # E2E (브라우저 표시)
```

---

## 프로젝트 문서 구조

```
docs/
├── PRD_Unified_v5.md          ← 메인 기획서 (91캐릭터, 시스템 전체)
├── CURRENT_STATUS.md          ← 이 파일 (현재 상태 + 남은 태스크)
├── AUTH_SYSTEM.md             ← 자동로그인 시스템 문서
├── PROCEDURAL_ART_GUIDE.md   ← 프로시저럴 아트 가이드
├── prd/
│   └── PRD_Sprint3_UIX.md     ← Sprint 3 PRD
└── done/                      ← 완료된 문서 아카이브
    ├── tasks/
    │   ├── TASK_TRACKER.md    ← Phase 1 (69/69)
    │   ├── TASK_PROGRESS.md   ← Phase 2 Sprint 1~2 (61/61)
    │   └── TASK_8_COMPLETE.md ← Task 8 완료 보고서
    ├── prd-completed/
    │   └── PRD_POPUP_ARCHITECTURE.md ← Task #7~#11 PRD (완료)
    ├── POPUP_USAGE.md         ← 팝업 시스템 가이드
    ├── testing/               ← 테스트 결과
    ├── dev-logs/              ← 개발 로그
    └── workers/               ← 워커 태스크 기록
```

---

## 기술 스택

| 항목 | 값 |
|------|-----|
| 엔진 | Phaser 3 (v3.90.0) |
| 번들러 | Vite 5 |
| 모듈 | ES Modules |
| 해상도 | 720x1280 |
| 유닛 테스트 | Vitest (562개, 21파일) |
| E2E 테스트 | Playwright (34개) |
| 타입체크 | TypeScript (tsc --noEmit) |
| 백엔드 | Supabase (하이브리드 저장) |
| 배포 | 미정 (dev 모드) |
| 빌드 크기 | ~504KB gzip |

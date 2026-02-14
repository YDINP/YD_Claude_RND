# ArcaneCollectors 현재 상태

> **최종 업데이트**: 2026-02-14
> **브랜치**: `arcane/integration`
> **테스트**: 337/337 통과 | **빌드**: tsc 0 에러

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

---

## 남은 태스크 (백로그)

### P1: 아트 에셋
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| ART-1.1 | 배경 이미지 5종 | M | Main/Battle/Gacha/Stage/Tower (720x1280) |
| ART-1.2 | UI 아이콘/버튼 | M | 탭5, 통화3, 클래스4, 버튼3 = 15개 에셋 |
| ART-1.3 | 캐릭터 플레이스홀더 | M | 직업4 + 등급프레임5 + 적3 = 12개 에셋 |

> 현재: 이모지 + 프로시저럴 도형. 실제 에셋 교체 시 `CharacterRenderer` / `UIRenderer` 추상화 레이어 활용 가능.

### P2: 자동로그인 + 계정 관리
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| AUTH-1.1 | 자동로그인 | M | BootScene에서 localStorage auth 확인 → LoginScene 스킵 |
| AUTH-1.2 | 계정 변경 (설정) | M | SettingsPopup에 로그아웃/계정전환 버튼 |
| AUTH-1.3 | 로그인 화면 개선 | L | 자동로그인 체크박스, 최근 계정 |

> PRD 상세: `docs/prd/PRD_Sprint3_UIX.md` AUTH-1 섹션

### P3: 품질 개선
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| QA-OPT-1 | scene.restart() 최적화 | L | 팝업 닫기 시 전체 재시작 대신 부분 갱신 |
| QA-OPT-2 | clearedStages 정렬 개선 | L | 렉시코그래픽 → 숫자 정렬 (stage 10+ 대비) |
| QA-OPT-3 | IdleBattleView/IdleProgressSystem 동기화 | L | 시각(5s)과 로직(2.5s) 타이밍 통일 검토 |

---

## 프로젝트 문서 구조

```
docs/
├── PRD_Unified_v5.md          ← 메인 기획서 (91캐릭터, 시스템 전체)
├── CURRENT_STATUS.md          ← 이 파일 (현재 상태 + 남은 태스크)
├── prd/
│   └── PRD_Sprint3_UIX.md     ← Sprint 3 PRD (AUTH-1 백로그 포함)
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
| 테스트 | Vitest (337개) |
| 타입체크 | TypeScript (tsc --noEmit) |
| 백엔드 | Supabase (하이브리드 저장) |
| 배포 | 미정 (dev 모드) |
| 빌드 크기 | ~504KB gzip |

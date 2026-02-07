# ArcaneCollectors 태스크 추적기
> **마지막 업데이트**: 2026-02-07
> **상태 태그**: `[DONE]` 완료 | `[WIP]` 진행중 | `[TODO]` 예정 | `[BLOCKED]` 차단됨
> **통합 진행률**: 100% (69/69 완료, 시스템 통합 100%)

---

## Phase 진행 요약

| Phase | 설명 | 진행률 | 상태 |
|-------|------|--------|------|
| Phase 1 | 인프라 기초 | 100% | `[DONE]` |
| Phase 2 | 핵심 시스템 와이어링 | 100% | `[DONE]` |
| Phase 3 | 시스템 체인 | 100% | `[DONE]` |
| Phase 4 | 데이터/UI 정리 | 100% | `[DONE]` |
| Phase 5 | 신규 씬 & UI 개편 | 100% | `[DONE]` |
| Phase 6 | QA & 최적화 | 100% | `[DONE]` |

---

## Team A: 전투 통합 (8 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| A-1 | systems/index.js barrel export | P0 | `[DONE]` | 17개 시스템 export 완료 |
| A-2 | MoodSystem → BattleScene 연결 | P0 | `[DONE]` | 상성 데미지 + UI 색상 표시 |
| A-3 | SynergySystem 전투 반영 | P1 | `[DONE]` | 4종 시너지 + 미리보기 |
| A-4 | 별점 성과 기반 계산 | P1 | `[DONE]` | 생존/HP/턴 기반 1~3성 |
| A-5 | 카드 덱 스킬 시스템 검증 | P1 | `[DONE]` | 멀티 스킬(skill1/skill2) + 게이지 + 수동선택 |
| A-6 | 자동전투 AI 스마트 로직 | P1 | `[DONE]` | 힐러 AI + 광역/단일 선택 + 보스전 보존 |
| A-7 | 전투결과→보상→저장 체인 | P0 | `[DONE]` | EXP/골드/레벨업 체인 완료 |
| A-8 | 전투 이펙트 & 연출 고도화 | P2 | `[DONE]` | ParticleManager + 궁극기 컷인 완료 |

**완료**: 8/8 (100%) ✅

---

## Team B: 신규 씬 & UI (7 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| B-1 | TowerScene 신규 생성 | P1 | `[DONE]` | 탑 UI + TowerSystem + 100층 데이터 완료 |
| B-2 | StageSelectScene → stages.json 동적 로드 | P0 | `[DONE]` | getChapterStages() 연동 |
| B-3 | EnergySystem ↔ StageSelectScene 연결 | P0 | `[DONE]` | 에너지 바 + 차감 + 타이머 |
| B-4 | SweepSystem UI 구현 | P1 | `[DONE]` | 소탕 횟수 선택 모달 (×1/3/5/10) + 보상 팝업 |
| B-5 | LoginScene 인증 UI | P1 | `[DONE]` | 게스트/이메일 로그인 완료 |
| B-6 | QuestScene 퀘스트 UI | P1 | `[DONE]` | 일일 퀘스트 8종 + QuestSystem 연동 완료 |
| B-7 | 장비 가챠 활성화 | P2 | `[DONE]` | 장비 탭 천장 카운터 + SR 보장 텍스트 |

**완료**: 7/7 (100%) ✅

---

## Team C: 데이터 & 백엔드 (7 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| C-1 | data/index.js 마이그레이션 검증 | P0 | `[DONE]` | 레거시 없음 확인 |
| C-2 | GachaScene ↔ GachaSystem 교체 | P0 | `[DONE]` | 실 캐릭터, 천장, SaveManager |
| C-3 | Supabase 마이그레이션 SQL 검증 | P1 | `[DONE]` | RLS + 10테이블 마이그레이션 완료 |
| C-4 | 하이브리드 저장 (Local+Supabase) | P1 | `[DONE]` | HybridSaveManager 완료 |
| C-5 | 오프라인 보상 시스템 검증 | P1 | `[DONE]` | SaveManager.calculateOfflineRewards 완료 |
| C-6 | 쿠폰 시스템 UI 연결 | P2 | `[DONE]` | HTML input 오버레이 + CouponSystem.formatRewards() |
| C-7 | DebugManager 통합 | P2 | `[DONE]` | ESM 전환 + barrel export |

**완료**: 7/7 (100%) ✅

---

## Team D: 통합 QA & 최적화 (5 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| D-1 | 전체 Scene 전환 흐름 테스트 | P1 | `[DONE]` | 15/15 씬 전환 PASS |
| D-2 | 전투 E2E 테스트 | P1 | `[DONE]` | 13/13 항목 PASS |
| D-3 | 가챠 확률 시뮬레이션 | P1 | `[DONE]` | 확률 일치, 천장 동작, 레거시 삭제 |
| D-4 | Vite 빌드 최적화 | P2 | `[DONE]` | gzip 504KB (목표 <2MB 달성) |
| D-5 | 크로스 브라우저 & 모바일 | P2 | `[DONE]` | TouchManager + 테스트 플랜 완료 |

**완료**: 5/5 (100%) ✅

---

## Team E: 캐릭터 데이터 (10 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| E-1 | 기존 캐릭터 데이터 감사 | P0 | `[DONE]` | 91명 mood/cult 재분배 완료 |
| E-2 | 신규 캐릭터 52명 추가 | P0 | `[DONE]` | 91명 완성 (characters.json) |
| E-3 | 스탯 밸런스 설계 | P0 | `[DONE]` | 등급/클래스별 범위 설정 |
| E-4 | 스킬 데이터 확장 | P1 | `[DONE]` | 91명×3=273스킬 완성 (49명 skill2 추가) |
| E-5 | 장비 데이터 확장 | P1 | `[DONE]` | 82개 equipment.json |
| E-6 | 적(Enemy) 데이터 확장 | P1 | `[DONE]` | 48→65종 (avalon 7 + kunlun 7 + 공통 3) |
| E-7 | 시너지 데이터 검증 & 확장 | P1 | `[DONE]` | 4종 시너지 완료 |
| E-8 | 캐릭터 비주얼 에셋 가이드 | P2 | `[DONE]` | 14_CHARACTER_DESIGN.md |
| E-9 | N등급 캐릭터 설계 | P0 | `[DONE]` | 91명에 N등급 포함 |
| E-10 | 캐릭터 밸런스 시뮬레이션 | P1 | `[DONE]` | 1000회 시뮬레이션, 14명 스탯 조정 |

**완료**: 10/10 (100%) ✅

---

## Team F: 씬/패널 검증 (12 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| F-1 | BootScene 로직 검증 | P0 | `[DONE]` | SaveManager, 오프라인 보상 정상 |
| F-2 | PreloadScene 에셋 검증 | P0 | `[DONE]` | 에셋 프리로드, 에러 핸들링 정상 |
| F-3 | MainMenuScene 데이터 바인딩 | P0 | `[DONE]` | TopBar, BottomNav, 보상 팝업 정상 |
| F-4 | GachaScene 데이터 흐름 | P1 | `[DONE]` | 확률/천장/저장 검증 PASS |
| F-5 | HeroListScene 표시 로직 | P1 | `[DONE]` | 9종 mood/cult 필터 업데이트 |
| F-6 | HeroDetailScene 육성 시스템 | P1 | `[DONE]` | SaveManager 저장 연결 완료 |
| F-7 | StageSelectScene 전체 검증 | P1 | `[DONE]` | 챕터 탭, 잠금, 별점 정상 |
| F-8 | BattleScene 전체 검증 | P1 | `[DONE]` | Mood/Synergy/Progression 통합 완료 |
| F-9 | 공통 컴포넌트 일관성 | P2 | `[DONE]` | Button, Panel, TopBar 일관성 확인 |
| F-10 | EventBus 이벤트 매핑 | P2 | `[DONE]` | 정의됨, 미사용 (현재 허용) |
| F-11 | GachaScene 완전 검증 | P1 | `[DONE]` | GachaSystem.pull() 체인 PASS |
| F-12 | 전체 데이터 흐름 무결성 | P2 | `[DONE]` | registry↔SaveManager 정합성 PASS |

**완료**: 12/12 (100%) ✅

---

## Team G: 치트 API (10 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| G-1 | DebugManager ESM 마이그레이션 | P0 | `[DONE]` | require→import 완료 |
| G-2 | clearAllStages/skipToChapter | P0 | `[DONE]` | stages.json 연동 + 25종 치트코드 |
| G-3 | 에너지 시스템 치트 API | P1 | `[DONE]` | refillEnergy/setEnergy/infiniteEnergy 등 |
| G-4 | 가챠 시스템 치트 API | P1 | `[DONE]` | setPityCounter/freeGacha/simulateGacha 등 7종 |
| G-5 | 장비 시스템 치트 API | P1 | `[DONE]` | giveEquipment/maxEnhance 등 4종 |
| G-6 | 무한의 탑 치트 API | P1 | `[DONE]` | setTowerFloor/clearAll/resetTower 등 5종 |
| G-7 | 소탕 & 퀘스트 치트 API | P1 | `[DONE]` | addSweepTickets/completeAllQuests 등 7종 |
| G-8 | 세이브 & 시간 치트 API | P2 | `[DONE]` | exportSave/importSave/resetAll 등 8종 |
| G-9 | 분위기/시너지/파티 치트 API | P2 | `[DONE]` | setMoodAdvantage/autoOptimalParty 등 6종 |
| G-10 | 디버그 콘솔 UI & 치트코드 | P2 | `[DONE]` | showDebugUI + 25종 치트코드 완료 |

**완료**: 10/10 (100%) ✅

---

## Team H: 디자인 & 에셋 (10 tasks)

| ID | 태스크 | 우선순위 | 상태 | 비고 |
|----|--------|----------|------|------|
| H-1 | UI 디자인 시스템 정립 | P1 | `[DONE]` | 9종 Mood/Cult 색상 통일 |
| H-2 | 영웅 이미지 에셋 시스템 | P1 | `[DONE]` | HeroAssetLoader + 향상 플레이스홀더 |
| H-3 | 가챠 소환 연출 디자인 | P1 | `[DONE]` | ParticleManager 등급별 연출 |
| H-4 | 전투 이펙트 & 애니메이션 | P1 | `[DONE]` | ParticleManager + Mood 이펙트 |
| H-5 | 메인 로비 연출 | P2 | `[DONE]` | 동적 파티클 + breathing 효과 |
| H-6 | HeroCard & 등급 프레임 | P2 | `[DONE]` | 교단 배경색 + 이름 라벨 |
| H-7 | 사운드 & BGM | P3 | `[DONE]` | SoundManager 크로스페이드 시스템 |
| H-8 | 반응형 & 모바일 터치 | P2 | `[DONE]` | TouchManager + 미디어쿼리 |
| H-9 | 로딩 & 스플래시 | P2 | `[DONE]` | 마법진 로딩 + 3초 스플래시 |
| H-10 | 이펙트 파티클 라이브러리 | P2 | `[DONE]` | ParticleManager + ObjectPool |

**완료**: 10/10 (100%) ✅

---

## Worker 태스크 (W1~W5)

| ID | 태스크 | 상태 | 비고 |
|----|--------|------|------|
| **W1-1.1** | Supabase 프로젝트 설정 | `[DONE]` | supabaseClient.js 존재 |
| **W1-1.2** | DB 스키마 생성 | `[DONE]` | 3개 migration + full_schema |
| **W1-1.3** | API 서비스 구현 | `[DONE]` | 7개 Service 파일 |
| **W1-1.4** | 데이터 마이그레이션 유틸 | `[DONE]` | MigrationService + 5테이블 + RLS |
| **W2-2.1** | 분위기(Mood) 데이터 | `[DONE]` | 9종 완료 |
| **W2-2.2** | 캐릭터 데이터 개편 | `[DONE]` | 91명 완료 |
| **W2-2.3** | 시너지 데이터 개편 | `[DONE]` | 4종 시너지 |
| **W2-2.4** | 장비/아이템 확장 | `[DONE]` | 82개 장비 |
| **W2-2.5** | 스테이지 확장 | `[DONE]` | 5챕터 25스테이지 |
| **W3-3.1** | 해상도 720x1280 | `[DONE]` | gameConfig 설정 |
| **W3-3.2** | 하단 메뉴 탭 | `[DONE]` | BottomNav.js 존재 |
| **W3-3.3** | 메인화면 개편 | `[DONE]` | BottomNav 5개 주요 씬 통합 |
| **W3-3.4** | BattleResultScene | `[DONE]` | BattleScene 데이터 전달 100% 연결 완료 |
| **W3-3.5** | StageSelectScene 개편 | `[DONE]` | 에너지/파티/시너지 연동 |
| **W3-3.6** | PartyEditScene | `[DONE]` | 5슬롯 4인 파티편성 + 시너지 미리보기 |
| **W3-3.7** | BattleScene 4인 조정 | `[DONE]` | 시스템 와이어링 완료 |
| **W4-4.1** | EnergySystem | `[DONE]` | 시스템 구현 완료 |
| **W4-4.2** | SweepSystem | `[DONE]` | 시스템 구현 완료 |
| **W4-4.3** | PartyManager | `[DONE]` | 시스템 구현 완료 |
| **W4-4.4** | MoodSystem | `[DONE]` | 9종 상성 완료 |
| **W4-4.5** | SynergySystem | `[DONE]` | 4종 시너지 완료 |
| **W4-4.6** | BattleSystem 4인 조정 | `[DONE]` | 분위기 데미지 통합 |
| **W5-5.1** | gameConfig 업데이트 | `[DONE]` | 720x1280, Mood 팔레트 |
| **W5-5.2** | constants.js 업데이트 | `[DONE]` | 9종 상성, 에너지/소탕 |
| **W5-5.3** | 기획서 업데이트 | `[DONE]` | PRD v5.3 문서화 |

**Worker 완료**: 25/25 (100%) ✅

---

## 전체 진행 요약

| 팀 | 완료 | 전체 | 비율 |
|----|------|------|------|
| Team A | **8** | **8** | **100%** ✅ |
| Team B | **7** | **7** | **100%** ✅ |
| Team C | **7** | **7** | **100%** ✅ |
| Team D | **5** | **5** | **100%** ✅ |
| Team E | **10** | **10** | **100%** ✅ |
| Team F | **12** | **12** | **100%** ✅ |
| Team G | **10** | **10** | **100%** ✅ |
| Team H | **10** | **10** | **100%** ✅ |
| **총합** | **69** | **69** | **100%** ✅ |
| Worker | **25** | **25** | **100%** ✅ |

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-02-07 | 초기 트래커 생성, 이전 통합 작업 반영 (19/69 완료) |
| 2026-02-07 | H-1~H-10, D-5 완료 (디자인/파티클/사운드/터치/에셋/테스트 전체) |
| 2026-02-07 | B-4, B-7, C-6, W3-3.3 완료 (Sweep UI, 장비 가챠, 쿠폰 UI, BottomNav) |
| 2026-02-07 | F-1~F-12 전체 검증 완료 (HeroListScene 9종 mood/cult 업데이트) |
| 2026-02-07 | D-1~D-4 완료 (씬 플로우 15/15, E2E 13/13, 가챠 확률, 빌드 504KB) |
| 2026-02-07 | E-4 완료 (91명×3=273스킬), E-6 완료 (65종 적), E-10 밸런스 시뮬레이션 |
| 2026-02-07 | W1-1.4 완료 (MigrationService + 5 DB 테이블) → **전체 69/69 완료** |

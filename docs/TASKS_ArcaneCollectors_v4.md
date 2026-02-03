# Arcane Collectors v4 - TASKS

## 개요
- **총 Phase**: 5개
- **워커 배정**: 5개 병렬 워커
- **우선순위**: 백엔드/DB 먼저

---

## Worker 배정

| Worker | 담당 영역 | 파일 소유권 |
|--------|---------|-----------|
| W1 | 백엔드/Supabase | supabase/**, src/api/** |
| W2 | 게임 데이터 개편 | src/data/** |
| W3 | UI/화면 개편 | src/scenes/**, src/components/** |
| W4 | 게임 시스템 | src/systems/** |
| W5 | 설정/문서 | src/config/**, docs/** |

---

## Phase 1: 백엔드 구축 (W1 우선)

### Task 1.1: Supabase 프로젝트 설정
- **Worker**: W1
- **상태**: pending
- **설명**: Supabase 프로젝트 초기화 및 환경 설정
- **작업 내용**:
  - [ ] supabase 폴더 구조 생성
  - [ ] .env 파일에 Supabase URL/Key 설정
  - [ ] supabase client 초기화 코드

### Task 1.2: 데이터베이스 스키마 생성
- **Worker**: W1
- **상태**: pending
- **의존성**: Task 1.1
- **작업 내용**:
  - [ ] users 테이블
  - [ ] player_data 테이블
  - [ ] heroes 테이블
  - [ ] parties 테이블
  - [ ] stage_progress 테이블
  - [ ] inventory 테이블
  - [ ] RLS 정책 설정

### Task 1.3: API 서비스 구현
- **Worker**: W1
- **상태**: pending
- **의존성**: Task 1.2
- **작업 내용**:
  - [ ] AuthService (로그인/회원가입)
  - [ ] PlayerService (플레이어 데이터)
  - [ ] HeroService (영웅 관리)
  - [ ] GachaService (가챠)
  - [ ] BattleService (전투 결과)
  - [ ] SweepService (소탕)

### Task 1.4: 데이터 마이그레이션
- **Worker**: W1
- **상태**: pending
- **의존성**: Task 1.3
- **작업 내용**:
  - [ ] LocalStorage → Supabase 마이그레이션 유틸
  - [ ] 기존 저장 데이터 변환
  - [ ] 오프라인 폴백 처리

---

## Phase 2: 게임 데이터 개편 (W2)

### Task 2.1: 성격(Personality) 시스템 데이터
- **Worker**: W2
- **상태**: pending
- **작업 내용**:
  - [ ] personalities.json 생성
  - [ ] 5가지 성격 정의 (Brave, Cunning, Calm, Wild, Mystic)
  - [ ] 성격 상호작용 매트릭스
  - [ ] 성격-교단 보너스 정의

### Task 2.2: 캐릭터 데이터 개편
- **Worker**: W2
- **상태**: pending
- **의존성**: Task 2.1
- **작업 내용**:
  - [ ] characters.json에서 element → personality 변경
  - [ ] cult 필드 명시적 추가
  - [ ] 신규 캐릭터 추가 (포세이돈, 하데스, 츠쿠요미, 카파 등)
  - [ ] 캐릭터별 대사 추가

### Task 2.3: 시너지 데이터 개편
- **Worker**: W2
- **상태**: pending
- **의존성**: Task 2.1, Task 2.2
- **작업 내용**:
  - [ ] synergies.json 전면 개편
  - [ ] 속성 시너지 제거
  - [ ] 성격 시너지 추가
  - [ ] 특수 시너지 확장 (10개+)
  - [ ] 교단 시너지 4인용 조정

### Task 2.4: 장비/아이템 데이터 확장
- **Worker**: W2
- **상태**: pending
- **작업 내용**:
  - [ ] equipment.json 확장 (81개 장비)
  - [ ] items.json 확장 (소비 아이템)
  - [ ] 등급별 균형 배분
  - [ ] 신화 테마 유지

### Task 2.5: 스테이지 데이터 확장
- **Worker**: W2
- **상태**: pending
- **작업 내용**:
  - [ ] stages.json 확장 (5챕터 25스테이지)
  - [ ] 초반 난이도 완화
  - [ ] 에너지 소모량 설정
  - [ ] 소탕 가능 여부 필드 추가

---

## Phase 3: UI/화면 개편 (W3)

### Task 3.1: 해상도 및 레이아웃 설정
- **Worker**: W3
- **상태**: pending
- **작업 내용**:
  - [ ] gameConfig.js 해상도 변경 (720x1280)
  - [ ] 반응형 스케일링 설정
  - [ ] 레이아웃 상수 조정

### Task 3.2: 하단 메뉴 탭 구현
- **Worker**: W3
- **상태**: pending
- **작업 내용**:
  - [ ] BottomNav 컴포넌트 개편
  - [ ] 5개 탭 (홈/모험/가방/소환/더보기)
  - [ ] 모든 씬에서 고정 표시
  - [ ] 아이콘 및 라벨

### Task 3.3: 메인화면 개편
- **Worker**: W3
- **상태**: pending
- **의존성**: Task 3.2
- **작업 내용**:
  - [ ] MainMenuScene 전면 개편
  - [ ] 상단 플레이어 정보/재화
  - [ ] 중앙 캐릭터 표시
  - [ ] 퀵 메뉴 버튼
  - [ ] 에너지 표시 추가

### Task 3.4: 모험 결과 화면 개편
- **Worker**: W3
- **상태**: pending
- **작업 내용**:
  - [ ] BattleResultScene 개편
  - [ ] 별 표시 강화
  - [ ] 다음 스테이지 버튼
  - [ ] 다시하기 버튼
  - [ ] 소탕 버튼 (조건부)

### Task 3.5: 스테이지 선택 화면 개편
- **Worker**: W3
- **상태**: pending
- **작업 내용**:
  - [ ] StageSelectScene 개편
  - [ ] 5챕터 네비게이션
  - [ ] 에너지 소모 표시
  - [ ] 소탕 버튼 표시
  - [ ] 파티 선택 연동

### Task 3.6: 파티 편성 화면 구현
- **Worker**: W3
- **상태**: pending
- **작업 내용**:
  - [ ] PartyEditScene 신규 생성
  - [ ] 4인 슬롯 UI
  - [ ] 5개 파티 저장 슬롯
  - [ ] 영웅 선택 인터페이스

### Task 3.7: 전투 화면 4인 조정
- **Worker**: W3
- **상태**: pending
- **작업 내용**:
  - [ ] BattleScene 4인 레이아웃 조정
  - [ ] 스킬 카드 4개로 조정
  - [ ] 성격 표시 (속성 대체)
  - [ ] 시너지 표시 개편

---

## Phase 4: 게임 시스템 (W4)

### Task 4.1: 에너지 시스템 구현
- **Worker**: W4
- **상태**: pending
- **작업 내용**:
  - [ ] EnergySystem.js 생성
  - [ ] 최대 에너지 계산
  - [ ] 시간 기반 회복
  - [ ] 보석 충전
  - [ ] SaveManager 연동

### Task 4.2: 소탕 시스템 구현
- **Worker**: W4
- **상태**: pending
- **의존성**: Task 4.1
- **작업 내용**:
  - [ ] SweepSystem.js 생성
  - [ ] 조건 체크 (별 3개)
  - [ ] 보상 계산
  - [ ] 소탕권 소모
  - [ ] 일일 제한

### Task 4.3: 파티 저장 시스템 구현
- **Worker**: W4
- **상태**: pending
- **작업 내용**:
  - [ ] PartyManager.js 생성
  - [ ] 5개 슬롯 관리
  - [ ] 활성 파티 지정
  - [ ] 서버 동기화

### Task 4.4: 성격 상호작용 시스템
- **Worker**: W4
- **상태**: pending
- **작업 내용**:
  - [ ] PersonalitySystem.js 생성
  - [ ] 상성 데미지 계산
  - [ ] 교단-성격 보너스
  - [ ] BattleSystem 연동

### Task 4.5: 시너지 시스템 개편
- **Worker**: W4
- **상태**: pending
- **의존성**: Task 4.4
- **작업 내용**:
  - [ ] SynergySystem.js 개편
  - [ ] 4인 파티용 조정
  - [ ] 성격 시너지 추가
  - [ ] 특수 시너지 확장

### Task 4.6: 전투 시스템 4인 조정
- **Worker**: W4
- **상태**: pending
- **의존성**: Task 4.4, Task 4.5
- **작업 내용**:
  - [ ] BattleSystem.js 4인 조정
  - [ ] 성격 기반 데미지 계산
  - [ ] 에너지 소모 연동

---

## Phase 5: 설정/문서 (W5)

### Task 5.1: 게임 설정 업데이트
- **Worker**: W5
- **상태**: pending
- **작업 내용**:
  - [ ] gameConfig.js 전면 업데이트
  - [ ] 해상도 설정
  - [ ] 성격 색상 팔레트
  - [ ] 에너지/소탕 상수

### Task 5.2: 상수 및 유틸 업데이트
- **Worker**: W5
- **상태**: pending
- **작업 내용**:
  - [ ] constants.js 업데이트
  - [ ] 성격 상수 추가
  - [ ] 에너지 상수 추가
  - [ ] 소탕 상수 추가

### Task 5.3: 게임 기획서 업데이트
- **Worker**: W5
- **상태**: pending
- **작업 내용**:
  - [ ] GameDesignDocument 업데이트
  - [ ] 성격 시스템 문서화
  - [ ] 에너지/소탕 문서화
  - [ ] 백엔드 API 문서화

---

## 워커별 파일 소유권

### W1 (백엔드)
```
supabase/**
src/api/**
src/services/AuthService.js
src/services/PlayerService.js
src/services/HeroService.js
src/services/GachaService.js
src/services/BattleService.js
src/services/SweepService.js
.env.local
```

### W2 (데이터)
```
src/data/personalities.json
src/data/characters.json
src/data/synergies.json
src/data/equipment.json
src/data/items.json
src/data/stages.json
src/data/index.js
```

### W3 (UI)
```
src/scenes/MainMenuScene.js
src/scenes/StageSelectScene.js
src/scenes/BattleScene.js (UI 부분만)
src/scenes/PartyEditScene.js (신규)
src/scenes/BattleResultScene.js (신규)
src/components/**
```

### W4 (시스템)
```
src/systems/EnergySystem.js (신규)
src/systems/SweepSystem.js (신규)
src/systems/PartyManager.js (신규)
src/systems/PersonalitySystem.js (신규)
src/systems/SynergySystem.js (개편)
src/systems/BattleSystem.js (개편)
```

### W5 (설정)
```
src/config/gameConfig.js
src/utils/constants.js
docs/**
```

---

## 통합 순서

1. W1 완료 후 → W2, W4가 API 사용 가능
2. W2 완료 후 → W3, W4가 데이터 사용 가능
3. W5는 독립적으로 진행 가능
4. 전체 완료 후 → 통합 테스트

---

## 요약

| Phase | Task 수 | Worker |
|-------|--------|--------|
| Phase 1 | 4 | W1 |
| Phase 2 | 5 | W2 |
| Phase 3 | 7 | W3 |
| Phase 4 | 6 | W4 |
| Phase 5 | 3 | W5 |
| **Total** | **25** | **5 Workers** |

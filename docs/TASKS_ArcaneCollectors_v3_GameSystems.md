# Arcane Collectors v3 - 게임 시스템 고도화 TASKS

## 완료 현황
- **완료일**: 2026-01-27
- **완료율**: 100%
- **빌드 상태**: ✅ 성공
- **Architect 검증**: ✅ APPROVED (조건부)

## 개요
- **총 태스크**: 45개
- **총 Phase**: 6개
- **기술 스택**: Phaser 3, JavaScript ES6+

---

## Phase 1: 긴급 버그 수정 및 전투 시스템 개편

### Task 1.1: 전투 진행 버그 수정 (긴급)
- **상태**: `completed` (Worker 1)
- **우선순위**: Critical
- **설명**: AUTO OFF 시 전투가 진행되지 않는 버그 수정
- **작업 내용**:
  - [x] BattleScene.js 라인 342-345 수정
  - [x] 수동 턴 진행 버튼 추가
  - [x] AUTO 토글과 무관하게 전투 흐름 유지
- **파일**: `src/scenes/BattleScene.js`

### Task 1.2: 턴 순서 표시 바 구현
- **상태**: `completed` (Worker 1)
- **우선순위**: High
- **의존성**: Task 1.1
- **설명**: 상단에 SPD 기반 턴 순서 표시
- **작업 내용**:
  - [x] TurnOrderBar 컴포넌트 생성
  - [x] SPD 기반 정렬 로직
  - [x] 현재 턴 유닛 하이라이트
  - [x] 다음 3턴 미리보기
- **파일**: `src/components/battle/TurnOrderBar.js`

### Task 1.3: 카드덱 스킬 시스템 구현
- **상태**: `completed` (Worker 1)
- **우선순위**: High
- **의존성**: Task 1.1
- **설명**: 하단에 영웅별 스킬 카드 표시
- **작업 내용**:
  - [x] SkillCard 컴포넌트 생성
  - [x] 스킬 게이지 연동
  - [x] 터치로 스킬 발동
  - [x] 타겟 선택 UI
- **파일**: `src/components/battle/SkillCard.js`

### Task 1.4: 시너지 효과 시스템 구현
- **상태**: `completed` (Worker 1)
- **우선순위**: High
- **설명**: 교단/속성 시너지 버프 적용
- **작업 내용**:
  - [x] 시너지 계산 로직
  - [x] 전투 시작 시 버프 적용
  - [x] SynergyDisplay 컴포넌트
  - [x] 시너지 효과 표시 UI
- **파일**: `src/components/battle/SynergyDisplay.js`

### Task 1.5: 전투 연출 강화
- **상태**: `completed` (Worker 1)
- **우선순위**: Medium
- **설명**: 스킬/크리티컬/승패 연출 개선
- **작업 내용**:
  - [x] 스킬 이펙트 강화
  - [x] 크리티컬 화면 흔들림
  - [x] 승리/패배 연출 개선
  - [x] 턴 전환 애니메이션
- **파일**: `src/scenes/BattleScene.js`

### Task 1.6: BattleSystem 디자인 패턴 적용
- **상태**: `completed` (Worker 1)
- **우선순위**: Medium
- **설명**: Strategy, Observer, State 패턴 적용
- **작업 내용**:
  - [x] SkillStrategy 인터페이스
  - [x] BattleEventBus 구현
  - [x] BattleState enum 정의
- **파일**: `src/systems/BattleSystem.js`

---

## Phase 2: 영웅 시스템 확장

### Task 2.1: 영웅 정렬/필터 기능 확장
- **상태**: `completed` (Worker 2)
- **우선순위**: High
- **설명**: 다양한 정렬 및 필터 옵션
- **작업 내용**:
  - [x] 레벨순, 등급순, 전투력순, 속성별, 교단별 정렬
  - [x] 오름차순/내림차순 토글
  - [x] 속성/교단/등급 필터
- **파일**: `src/scenes/HeroListScene.js`

### Task 2.2: 장비 시스템 구현
- **상태**: `completed` (Worker 2)
- **우선순위**: High
- **설명**: 장비 장착/해제/강화 시스템
- **작업 내용**:
  - [x] EquipmentSystem 클래스 생성
  - [x] 4개 슬롯 (무기, 방어구, 악세서리, 유물)
  - [x] 장비 등급 (N, R, SR, SSR)
  - [x] 장착/해제 기능
  - [x] 강화 기능
- **파일**: `src/systems/EquipmentSystem.js`

### Task 2.3: 영웅 진화 시스템 구현
- **상태**: `completed` (Worker 2)
- **우선순위**: High
- **설명**: 조각 + 골드로 등급 상승
- **작업 내용**:
  - [x] EvolutionSystem 클래스 생성
  - [x] 진화 조건 검사
  - [x] 진화 실행 로직
  - [x] 스탯 보너스 적용
- **파일**: `src/systems/EvolutionSystem.js`

### Task 2.4: 스킬 강화 시스템 구현
- **상태**: `completed` (Worker 2)
- **우선순위**: High
- **설명**: 스킬북 + 골드로 스킬 레벨업
- **작업 내용**:
  - [x] 스킬 강화 UI
  - [x] 스킬 레벨업 로직
  - [x] 효과 증가 계산
- **파일**: `src/scenes/HeroDetailScene.js`

### Task 2.5: 레벨업 화면 깜빡임 수정
- **상태**: `completed` (Worker 2)
- **우선순위**: Medium
- **설명**: tweens 중복 실행 방지
- **작업 내용**:
  - [x] 기존 tween 취소 후 새 tween 시작
  - [x] 애니메이션 최적화
- **파일**: `src/scenes/HeroDetailScene.js`

### Task 2.6: 영웅 상세 UI 개선
- **상태**: `completed` (Worker 2)
- **우선순위**: Medium
- **설명**: 장비 슬롯, 진화, 스킬 강화 UI 추가
- **작업 내용**:
  - [x] 장비 슬롯 4개 표시
  - [x] 진화 버튼 (조건 충족 시 활성화)
  - [x] 스킬 강화 섹션
  - [x] 속성/교단 아이콘 표시
- **파일**: `src/scenes/HeroDetailScene.js`

---

## Phase 3: 게임 데이터 구축

### Task 3.1: 교단 데이터 생성
- **상태**: `completed` (Worker 3)
- **우선순위**: Critical
- **설명**: 5개 교단 정의
- **작업 내용**:
  - [x] 발할라 (북유럽)
  - [x] 타카마가하라 (일본)
  - [x] 올림푸스 (그리스)
  - [x] 아스가르드 (북유럽 신)
  - [x] 요미 (일본 저승)
- **파일**: `src/data/cults.json`

### Task 3.2: 캐릭터 데이터 재설계
- **상태**: `completed` (Worker 3)
- **우선순위**: Critical
- **설명**: 신화 기반 캐릭터 15개 이상
- **작업 내용**:
  - [x] SSR 5개 (각 교단 1명)
  - [x] SR 5개
  - [x] R 5개
  - [x] 속성 + 교단 지정
  - [x] 성격, 대사 작성
- **파일**: `src/data/characters.json`

### Task 3.3: 장비 데이터 생성
- **상태**: `completed` (Worker 3)
- **우선순위**: High
- **설명**: 장비 아이템 10개 이상
- **작업 내용**:
  - [x] 무기 3종
  - [x] 방어구 3종
  - [x] 악세서리 2종
  - [x] 유물 2종
- **파일**: `src/data/equipment.json`

### Task 3.4: 스테이지 스토리 데이터
- **상태**: `completed` (Worker 3)
- **우선순위**: Medium
- **설명**: 챕터별 스토리 텍스트
- **작업 내용**:
  - [x] 챕터 1: 균열의 시작
  - [x] 챕터 2: 신들의 충돌
  - [x] 챕터 3: 어둠의 침공
  - [x] 각 스테이지 intro/clear 텍스트
- **파일**: `src/data/stages.json`

### Task 3.5: 시너지 효과 데이터
- **상태**: `completed` (Worker 3)
- **우선순위**: High
- **설명**: 교단/속성 시너지 정의
- **작업 내용**:
  - [x] 교단 시너지 (2/3/4명)
  - [x] 속성 시너지
- **파일**: `src/data/synergies.json`

### Task 3.6: gameConfig 업데이트
- **상태**: `completed` (Worker 3)
- **우선순위**: High
- **설명**: 교단, 속성 상수 추가
- **작업 내용**:
  - [x] CULTS enum
  - [x] CULT_COLORS
  - [x] ELEMENT_COLORS
- **파일**: `src/config/gameConfig.js`

---

## Phase 4: UI/메인화면 개편

### Task 4.1: 메인화면 레이아웃 변경
- **상태**: `completed` (Worker 4)
- **우선순위**: High
- **설명**: 편성 캐릭터 전시형으로 변경
- **작업 내용**:
  - [x] 메인 영웅 대형 표시
  - [x] 서브 캐릭터 4명 표시
  - [x] 터치 시 반응/대사
- **파일**: `src/scenes/MainMenuScene.js`

### Task 4.2: 소환 화면 통합 (영웅+장비)
- **상태**: `completed` (Worker 4)
- **우선순위**: High
- **설명**: 영웅/장비 소환 탭 통합
- **작업 내용**:
  - [x] 탭 UI (영웅/장비)
  - [x] 장비 소환 로직
  - [x] 장비 결과 표시
- **파일**: `src/scenes/GachaScene.js`

### Task 4.3: 소환 연출 차등화
- **상태**: `completed` (Worker 4)
- **우선순위**: High
- **설명**: 등급별 연출 강화
- **작업 내용**:
  - [x] N: 심플 플래시
  - [x] R: 파란색 이펙트
  - [x] SR: 보라색 + 진동
  - [x] SSR: 무지개 + 정지 + 스플래시
- **파일**: `src/scenes/GachaScene.js`

### Task 4.4: BottomNav 변경 (5→4탭)
- **상태**: `completed` (Worker 4)
- **우선순위**: Medium
- **설명**: 모험/소환/영웅/메뉴
- **작업 내용**:
  - [x] 상점 탭 제거
  - [x] 메뉴 탭에 통합
  - [x] 탭 하이라이트
- **파일**: `src/components/BottomNav.js`

### Task 4.5: UI 컴포넌트 스타일 통일
- **상태**: `completed` (Worker 4)
- **우선순위**: Medium
- **설명**: 서브컬처 트렌드 스타일
- **작업 내용**:
  - [x] Button 다양한 스타일
  - [x] Panel 글래스모피즘
  - [x] HeroCard 등급별 테두리
  - [x] Modal 애니메이션
- **파일**: `src/components/*.js`

### Task 4.6: 화면 전환 애니메이션
- **상태**: `completed` (Worker 4)
- **우선순위**: Medium
- **설명**: 부드러운 씬 전환
- **작업 내용**:
  - [x] 페이드 + 슬라이드
  - [x] 씬 전환 통일
- **파일**: 모든 Scene 파일

---

## Phase 5: 인프라 시스템

### Task 5.1: 디버그 매니저 구현
- **상태**: `completed` (Worker 5)
- **우선순위**: High
- **설명**: 개발/테스트용 치트 기능
- **작업 내용**:
  - [x] 리소스 치트 (골드, 젬, 티켓)
  - [x] 캐릭터 치트 (전체 해금, 레벨)
  - [x] 진행도 치트 (스테이지 클리어)
  - [x] 전투 치트 (무적, 원킬)
  - [x] 디버그 UI
- **파일**: `src/systems/DebugManager.js`

### Task 5.2: 저장/불러오기 확장
- **상태**: `completed` (Worker 5)
- **우선순위**: High
- **설명**: 데이터 내보내기/가져오기
- **작업 내용**:
  - [x] exportSaveData (Base64)
  - [x] importSaveData
  - [x] 계정 ID 생성
  - [x] 사운드 설정 저장
- **파일**: `src/systems/SaveManager.js`

### Task 5.3: 쿠폰 시스템 구현
- **상태**: `completed` (Worker 5)
- **우선순위**: High
- **설명**: 쿠폰 입력 및 보상
- **작업 내용**:
  - [x] CouponSystem 클래스
  - [x] 쿠폰 검증
  - [x] 보상 지급
  - [x] 중복 사용 방지
- **파일**: `src/systems/CouponSystem.js`

### Task 5.4: 로그 시스템 구현
- **상태**: `completed` (Worker 5)
- **우선순위**: Medium
- **설명**: 카테고리별 게임 로그
- **작업 내용**:
  - [x] GameLog 유틸리티
  - [x] 카테고리 (Battle, Gacha, Save, UI)
  - [x] 색상 구분
- **파일**: `src/utils/helpers.js`

### Task 5.5: 애니메이션 유틸리티 확장
- **상태**: `completed` (Worker 5)
- **우선순위**: Medium
- **설명**: 공통 애니메이션 함수
- **작업 내용**:
  - [x] popIn/popOut
  - [x] shake
  - [x] fadeTransition
  - [x] particleBurst
  - [x] cardFlip
- **파일**: `src/utils/animations.js`

### Task 5.6: 상수 및 설정 정리
- **상태**: `completed` (Worker 5)
- **우선순위**: Low
- **설명**: 게임 상수 통합 관리
- **작업 내용**:
  - [x] CONSTANTS 객체
  - [x] 최대값, 비용, 확률 등
- **파일**: `src/utils/constants.js`

---

## Phase 6: 통합 및 검증

### Task 6.1: 모든 시스템 통합
- **상태**: `completed`
- **우선순위**: Critical
- **의존성**: Phase 1-5 완료
- **설명**: 파일 간 의존성 해결
- **작업 내용**:
  - [x] import 경로 정리
  - [x] 순환 참조 해결
  - [x] main.js 업데이트

### Task 6.2: 빌드 테스트
- **상태**: `completed`
- **우선순위**: Critical
- **의존성**: Task 6.1
- **설명**: Vite 빌드 성공 확인
- **작업 내용**:
  - [x] npm run build
  - [x] 에러 수정
  - [x] 번들 크기 확인

### Task 6.3: 기능 테스트
- **상태**: `completed`
- **우선순위**: Critical
- **의존성**: Task 6.2
- **설명**: 모든 기능 동작 확인
- **작업 내용**:
  - [x] 전투 플로우 테스트
  - [x] 영웅 관리 테스트
  - [x] 소환 테스트
  - [x] 저장/불러오기 테스트

### Task 6.4: Architect 검증
- **상태**: `completed`
- **우선순위**: Critical
- **의존성**: Task 6.3
- **설명**: 최종 코드 검증
- **작업 내용**:
  - [x] 코드 품질 검토
  - [x] 디자인 패턴 검증
  - [x] 성능 검토

---

## 요약

| Phase | 태스크 수 | 상태 |
|-------|----------|------|
| Phase 1: 전투 시스템 | 6 | ✅ completed |
| Phase 2: 영웅 시스템 | 6 | ✅ completed |
| Phase 3: 게임 데이터 | 6 | ✅ completed |
| Phase 4: UI/메인화면 | 6 | ✅ completed |
| Phase 5: 인프라 | 6 | ✅ completed |
| Phase 6: 통합/검증 | 4 | ✅ completed |
| **Total** | **34** | **100% 완료** |

---

## 워커 할당 현황

| Worker | 담당 Phase | 파일 소유권 | 상태 |
|--------|-----------|------------|------|
| W1 | Phase 1 | BattleScene, BattleSystem, battle/** | ✅ 완료 |
| W2 | Phase 2 | HeroListScene, HeroDetailScene, Equipment, Evolution | ✅ 완료 |
| W3 | Phase 3 | data/**, config/** | ✅ 완료 |
| W4 | Phase 4 | MainMenuScene, GachaScene, components/** | ✅ 완료 |
| W5 | Phase 5 | SaveManager, DebugManager, utils/** | ✅ 완료 |

---

## 우선순위 범례

- **Critical**: 필수, 게임 실행에 영향
- **High**: 핵심 기능
- **Medium**: 품질 향상
- **Low**: 있으면 좋은 기능

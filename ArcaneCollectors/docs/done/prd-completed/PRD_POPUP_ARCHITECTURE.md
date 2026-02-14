# PRD: ArcaneCollectors 메인화면 중심 팝업 아키텍처 전환

> **버전**: v1.0
> **날짜**: 2026-02-14
> **범위**: Task #7~#11 (5개 태스크)

---

## 1. 개요

현재 ArcaneCollectors는 BottomNav 탭 기반으로 여러 씬(Scene)을 전환하는 구조.
이를 **메인화면 단일 허브 + 팝업 오버레이** 아키텍처로 전환한다.

### 변경 전
```
MainMenuScene ←→ HeroListScene
              ←→ GachaScene
              ←→ InventoryScene
              ←→ QuestScene
              ←→ TowerScene
              ←→ SettingsScene
              ←→ PartyEditScene
              ←→ BattleScene
[BottomNav: 홈 | 소환 | 영웅 | 가방 | 메뉴(드로어)]
```

### 변경 후
```
MainMenuScene (유일한 허브)
  ├─ [하단 메뉴 아이콘] 소환/영웅/파티/퀘스트/무한탑/가방/설정
  ├─ 클릭 → PopupBase 위에 각 팝업 오버레이
  │   ├─ GachaPopup
  │   ├─ HeroListPopup
  │   ├─ PartyEditPopup
  │   ├─ QuestPopup
  │   ├─ TowerPopup
  │   ├─ InventoryPopup
  │   └─ SettingsPopup
  └─ 보스전 → BattleScene (유일한 씬 전환)
```

---

## 2. 태스크별 PRD

---

### Task #7: 자동전투 영웅 = 내파티 연동

#### 목표
IdleBattleView의 아군 영웅이 실제 파티 데이터 반영. 파티 비면 전투 중단.

#### 워크트리
```
T7
├── T7.1 IdleBattleView.updateParty() 검증
│   └── 파티 heroIds → getCharacter() → 스프라이트 매칭 확인
├── T7.2 파티 비어있을 때 처리
│   ├── startBattleCycle() 미실행
│   ├── "파티를 먼저 편성해주세요" 안내 텍스트
│   └── 소탕/보스전 버튼 비활성화
└── T7.3 파티 변경 시 IdleBattleView 실시간 갱신
```

#### 에이전트 팀
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| explore | haiku | IdleBattleView 파티 로딩 로직 조사 | IdleBattleView.js, MainMenuScene.js |
| executor | sonnet | 파티 연동 + 빈 파티 처리 구현 | MainMenuScene.js, IdleBattleView.js |

**예상 소요**: 15분

---

### Task #8: BottomNav 제거 + 메인화면 하단 메뉴 아이콘 배치

#### 목표
BottomNav 탭 시스템 완전 제거. 메인화면 하단에 7개 메뉴 아이콘을 직접 배치.

#### 워크트리
```
T8
├── T8.1 BottomNav 참조 제거 (8개 씬)
│   ├── MainMenuScene.js — import + createBottomNavigation() 제거
│   ├── GachaScene.js — import + new BottomNav() 제거
│   ├── HeroListScene.js — 동일
│   ├── InventoryScene.js — 동일
│   ├── QuestScene.js — 동일
│   ├── TowerScene.js — 동일
│   ├── SettingsScene.js — 동일
│   └── StageSelectScene.js — 동일
├── T8.2 메인화면 하단 메뉴 아이콘 그리드
│   ├── y=980~1130 영역에 아이콘 배치
│   ├── 7개 버튼: 소환🎲/영웅🦸/파티👥/퀘스트📜/무한탑🗼/가방📦/설정⚙️
│   ├── 2행 4열 그리드 (마지막 행 3개 중앙 정렬)
│   └── 각 아이콘 클릭 → 팝업 열기 (Task #9 연동)
├── T8.3 BottomNav.js 파일 삭제 or 사용중단
└── T8.4 LAYOUT.bottomNav 설정 정리
```

#### 에이전트 팀
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| executor-1 | sonnet | BottomNav import/참조 제거 (8개 씬) | 8개 씬 파일 |
| executor-2 | sonnet | 메인화면 하단 메뉴 아이콘 구현 | MainMenuScene.js |
| build-fixer | haiku | 빌드 검증 | - |

**의존성**: Task #9 완료 후 아이콘 클릭 → 팝업 연동
**예상 소요**: 20분

---

### Task #9: 전체 씬 팝업 전환 시스템 구축 (7개 씬 → 팝업)

#### 목표
모든 서브 씬을 MainMenuScene 위의 팝업 오버레이로 전환. 보스전만 씬 유지.

#### 아키텍처
```
PopupBase (공통 베이스)
├── overlay (반투명 배경, depth 2000)
├── panel (메인 패널, depth 2001)
├── header (제목 + 닫기 버튼)
├── contentArea (스크롤 가능 영역)
├── show() / hide() 애니메이션
└── destroy() 클린업

각 팝업은 PopupBase를 확장하여 contentArea에 컨텐츠 렌더링
```

#### 워크트리
```
T9
├── T9.1 PopupBase 컴포넌트 설계 및 구현
│   ├── src/components/PopupBase.js
│   ├── 공통: overlay, panel (680x1100), header, close button
│   ├── show()/hide() 슬라이드업 애니메이션
│   ├── 스크롤 지원 (geometry mask + drag)
│   └── depth: 2000+ (모든 UI 위)
│
├── T9.2 GachaPopup (소환)
│   ├── src/components/popups/GachaPopup.js
│   ├── 배너, 천장, 소환버튼, 소환연출, 결과 표시
│   └── 기존 GachaScene 로직 이식
│
├── T9.3 HeroListPopup (영웅목록)
│   ├── src/components/popups/HeroListPopup.js
│   ├── 필터, 정렬, 가상스크롤 영웅 그리드
│   └── 영웅 클릭 → HeroInfoPopup 표시
│
├── T9.4 PartyEditPopup (파티편성)
│   ├── src/components/popups/PartyEditPopup.js
│   ├── 파티 슬롯 5개, 드래그&드롭, 시너지 표시
│   └── 저장 시 메인화면 파티 디스플레이 갱신
│
├── T9.5 QuestPopup (퀘스트)
│   ├── src/components/popups/QuestPopup.js
│   ├── 일일 퀘스트 목록, 보상 수령
│   └── 전체 수령 버튼
│
├── T9.6 TowerPopup (무한탑)
│   ├── src/components/popups/TowerPopup.js
│   ├── 층 표시, 도전 버튼 → BattleScene 전환
│   └── 도전 시 팝업 닫기 → 씬 전환
│
├── T9.7 InventoryPopup (가방)
│   ├── src/components/popups/InventoryPopup.js
│   ├── 탭(장비/소비/재료), 아이템 목록
│   └── 아이템 클릭 → 상세/장착
│
├── T9.8 SettingsPopup (설정)
│   ├── src/components/popups/SettingsPopup.js
│   ├── 사운드/BGM/진동/알림 토글
│   └── 계정 정보, 데이터 초기화
│
└── T9.9 MainMenuScene 팝업 매니저 통합
    ├── this.popupManager = new PopupManager(this)
    ├── 하단 아이콘 클릭 → popupManager.open('gacha')
    └── 팝업 닫기 시 메인화면 데이터 갱신
```

#### 에이전트 팀 (Wave 구성)

**Wave 1: 기반 + 간단한 팝업 (병렬)**
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| architect | opus | PopupBase 아키텍처 설계 + 코드 작성 | PopupBase.js |
| executor-A | sonnet | QuestPopup + SettingsPopup | QuestPopup.js, SettingsPopup.js |

**Wave 2: 중간 복잡도 팝업 (병렬)**
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| executor-B | sonnet | HeroListPopup + InventoryPopup | HeroListPopup.js, InventoryPopup.js |
| executor-C | sonnet | TowerPopup + PartyEditPopup | TowerPopup.js, PartyEditPopup.js |

**Wave 3: 소환 (가장 복잡)**
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| executor-D | sonnet | GachaPopup (연출 포함) | GachaPopup.js |

**Wave 4: 통합 + 검증**
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| executor-E | sonnet | MainMenuScene 팝업매니저 통합 | MainMenuScene.js |
| build-fixer | haiku | tsc + vitest 검증 | - |
| qa-tester | sonnet | Playwright 전체 화면 테스트 | test-*.mjs |

**예상 소요**: 60~90분 (가장 큰 태스크)

---

### Task #10: 전투력 계산 완전 통일

#### 목표
모든 전투력 표시가 ProgressionSystem.calculatePower() 단일 함수 사용.

#### 현재 불일치 지점
| 위치 | 현재 방식 | 수정 |
|------|-----------|------|
| MainMenuScene.calculateCombatPower() | ProgressionSystem ✅ | 유지 |
| PartyEditScene.updatePower() | ProgressionSystem ✅ | 유지 |
| **HeroListScene.calculatePower()** | **자체 공식** ❌ | → ProgressionSystem |
| **IdleProgressSystem.getPartyPower()** | **자체 계산** ❌ | → ProgressionSystem |
| **data/index.ts calculatePower()** | **별도 공식** ❌ | → ProgressionSystem 호출 래퍼 |

#### 워크트리
```
T10
├── T10.1 HeroListScene.calculatePower() → ProgressionSystem 위임
├── T10.2 IdleProgressSystem.getPartyPower() → ProgressionSystem.calculateTeamPower()
├── T10.3 data/index.ts calculatePower() → ProgressionSystem 래퍼
└── T10.4 전체 빌드 + 스크린샷 검증 (파티편성/메인 전투력 일치 확인)
```

#### 에이전트 팀
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| executor | sonnet | 3개 파일 전투력 공식 통일 | HeroListScene.js, IdleProgressSystem.js, data/index.ts |
| build-fixer | haiku | 빌드 + 테스트 검증 | - |

**예상 소요**: 10분

---

### Task #11: 모험 챕터 자동 진행 속도 개선

#### 목표
방치 전투 속도와 챕터 자동 진행 속도 대폭 향상.

#### 현재 문제
| 설정 | 현재 값 | 문제 |
|------|---------|------|
| battleInterval | 5000ms | 너무 느림 |
| 자동 스테이지 진행 | 없음 | 전투 승리해도 다음 스테이지 안 감 |
| BASE_GOLD_PER_SEC | 2 | 보상 적음 |
| BASE_EXP_PER_SEC | 0.5 | 경험치 적음 |

#### 워크트리
```
T11
├── T11.1 battleInterval 단축: 5000 → 2500ms
├── T11.2 자동 스테이지 진행 로직 추가
│   ├── simulateBattle() 승리 시 전투 카운터 증가
│   ├── 연속 승리 N회 → 다음 스테이지 자동 이동
│   ├── 스테이지 10 → 다음 챕터 1 자동 이동
│   └── 진행 시 SaveManager에 lastClearedStage 저장
├── T11.3 보상 배율 상향
│   ├── BASE_GOLD_PER_SEC: 2 → 5
│   ├── BASE_EXP_PER_SEC: 0.5 → 1.5
│   └── 챕터별 보상 스케일링 강화
├── T11.4 UI 피드백
│   ├── 스테이지 클리어 시 "챕터 1-2 클리어!" 토스트
│   ├── IdleBattleView 스테이지 정보 실시간 갱신
│   └── 진행률 바 표시
└── T11.5 밸런스 테스트
```

#### 에이전트 팀
| 에이전트 | 모델 | 역할 | 파일 |
|----------|------|------|------|
| executor | sonnet | 전투 속도 + 자동 진행 + 보상 조정 | IdleProgressSystem.js |
| executor-2 | sonnet | UI 피드백 (토스트, 갱신) | MainMenuScene.js, IdleBattleView.js |
| build-fixer | haiku | 테스트 검증 | - |

**예상 소요**: 20분

---

## 3. 실행 순서 (의존성 기반)

```
Phase 1 (병렬, 독립적):
  ├── Task #7  자동전투 파티 연동        [15분]
  ├── Task #10 전투력 통일              [10분]
  └── Task #11 모험 속도 개선           [20분]

Phase 2 (Phase 1 완료 후):
  └── Task #9  팝업 시스템 구축          [60~90분]
       ├── Wave 1: PopupBase + 간단팝업
       ├── Wave 2: 중간 복잡도 팝업
       ├── Wave 3: 소환 팝업
       └── Wave 4: 통합 검증

Phase 3 (Phase 2 완료 후):
  └── Task #8  BottomNav 제거 + 하단 메뉴 [20분]

총 예상: ~2시간
```

---

## 4. 리스크 및 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 7개 씬→팝업 전환 시 기능 누락 | 높음 | 씬별 기능 체크리스트 + QA 테스트 |
| 스크롤 팝업 성능 | 중간 | geometry mask + 가상 스크롤 유지 |
| 소환 연출 팝업 내 구현 | 중간 | 기존 로직 최대한 재사용 |
| 전투 밸런스 붕괴 (속도 증가) | 낮음 | 보상 배율 점진적 조정 |

---

## 5. 검증 기준

- [ ] tsc --noEmit 에러 0
- [ ] vitest 337/337 통과
- [ ] 메인화면에서 7개 메뉴 아이콘 클릭 → 각 팝업 정상 표시
- [ ] 팝업 닫기 → 메인화면 데이터 갱신 (파티, 전투력 등)
- [ ] 파티편성 전투력 = 메인화면 전투력 (동일 수치)
- [ ] 빈 파티 → 자동전투 미진행 + 안내 표시
- [ ] 모험 챕터 자동 진행 (스테이지 클리어 → 다음 이동)
- [ ] 보스전만 씬 전환 작동

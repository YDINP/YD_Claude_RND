# ArcaneCollectors Bugfix & UI 개선 PRD v1

**작성일**: 2026-02-16
**브랜치**: `arcane/integration`
**총 이슈**: 14건 (Critical 3 / High 6 / Medium 5)

---

## 이슈 요약

| ID | 우선순위 | 카테고리 | 제목 |
|----|----------|----------|------|
| BUG-01 | 🔴 Critical | UI/Depth | 팝업 열 때 메인씬 타이틀 중복 생성 |
| BUG-02 | 🟡 High | UI/Layout | 보상받기 버튼-하단 팝업 버튼 겹침 |
| BUG-03 | 🟡 High | UI/Layout | 현재 모험 패널 내부 요소 겹침 + 파티 영웅 미표시 |
| BUG-04 | 🟡 High | UI/Depth | 상단 바(TopBar) 항목 겹침 |
| BUG-05 | 🟢 Medium | Data | 초기 재화 수정 (보석 2700, 소환권 10) |
| BUG-06 | 🟡 High | UI/UX | 파티 편집 영웅 선택 팝업 → 그리드 레이아웃 변경 |
| BUG-07 | 🟡 High | UI/Layout | 영웅 상세정보 팝업 레이아웃 + 스킬 상세 부족 |
| BUG-08 | 🔴 Critical | Logic | 무한탑 클리어 시 진행도 오류 (다른 항목 증가) |
| BUG-09 | 🟢 Medium | UI/Layout | 영웅 리스트 그리드 팝업 맞춤 + 상단 짤림 + 정렬 UI 개선 |
| BUG-10 | 🟢 Medium | Feature | 설정 팝업에 치트패널 활성화 버튼 추가 |
| BUG-11 | 🟡 High | UI/Depth | 현재 모험 소탕/보스전 버튼 + 챕터 표시 depth 문제 |
| BUG-12 | 🔴 Critical | Logic | 재접속 시 진행도 100% but 보스전 준비 미표시, 보상받기 후 진행도 리셋 오류 |
| BUG-13 | 🟡 High | Balance | 초반 보스 난이도 하향 + 밸런스 커브 재설계 |
| BUG-14 | 🟢 Medium | UI/Visual | 영웅 상세팝업 등급별 배경색 차별화 |

---

## TASK 1: 팝업 열 때 메인씬 타이틀 중복 생성 (BUG-01)

**우선순위**: 🔴 Critical
**카테고리**: UI / Depth
**영향 파일**: `src/scenes/MainMenuScene.js`, `src/components/PopupBase.js`

### 현상
- 팝업을 열 때마다 메인씬의 타이틀 텍스트가 "프리팹 타이틀"처럼 계속 새로 생성되어 겹침
- 팝업을 여러 번 열고 닫으면 타이틀이 점점 많아짐

### 원인 분석
- MainMenuScene의 `create()`가 팝업 닫힌 후 또는 씬 resume 시 재호출될 가능성
- 또는 팝업이 씬을 sleep/wake 하면서 UI 요소가 중복 생성

### 수정 방향
1. MainMenuScene에서 타이틀/UI 요소 생성 전 기존 요소 존재 여부 체크
2. 또는 `create()`가 아닌 `init()`에서 한 번만 생성하고, 플래그로 중복 방지
3. PopupBase의 show/hide가 씬 라이프사이클에 영향을 주는지 확인

### 완료 조건
- [ ] 팝업을 10회 이상 열고 닫아도 타이틀 1개만 존재
- [ ] 다른 UI 요소도 중복 생성되지 않음

---

## TASK 2: 보상받기 버튼-하단 버튼 겹침 (BUG-02)

**우선순위**: 🟡 High
**카테고리**: UI / Layout
**영향 파일**: `src/scenes/MainMenuScene.js`

### 현상
- 보상받기 버튼(y≈s(840))이 하단 팝업 버튼들(BottomNav)과 겹침

### 원인 분석
- 보상받기 버튼 Y좌표가 하단 네비게이션 영역과 충돌
- BOTTOM_NAV.HEIGHT = s(120), GAME_HEIGHT = 1920 기준 하단 영역 시작 = s(1800)
- 실제 배치가 화면 비율에 따라 달라질 수 있음

### 수정 방향
1. 보상받기 버튼을 CONTENT 영역 내부로 재배치
2. `GAME_HEIGHT - BOTTOM_NAV.HEIGHT - s(margin)` 이하로 제한
3. 또는 현재 모험 패널 내부에 통합

### 완료 조건
- [ ] 보상받기 버튼과 하단 네비 버튼이 겹치지 않음
- [ ] 다양한 화면 비율에서 확인

---

## TASK 3: 현재 모험 패널 요소 겹침 + 파티 영웅 표시 (BUG-03)

**우선순위**: 🟡 High
**카테고리**: UI / Layout
**영향 파일**: `src/scenes/MainMenuScene.js`, `src/systems/IdleProgressSystem.js`

### 현상
- 현재 모험 패널 내부의 항목들(진행도바, 스테이지명, DPS, 보상 정보 등)이 서로 겹침
- 현재 전투 중인 파티 영웅들이 표시되지 않거나 잘못 표시

### 수정 방향
1. 모험 패널 내부 요소들의 Y좌표를 재계산, 겹치지 않도록 간격 확보
2. 각 요소에 명시적 depth 설정
3. 파티 영웅 표시: `playerManager.getParty()` → 영웅 초상화/아이콘을 모험 패널에 표시
4. IdleBattleView의 `updateParty()` 호출을 확인하여 실시간 반영

### 완료 조건
- [ ] 모험 패널 내부 모든 요소가 겹치지 않고 읽기 쉬움
- [ ] 현재 파티 영웅 4인의 아이콘/초상화가 모험 패널에 표시

---

## TASK 4: 상단 바(TopBar) 항목 겹침 (BUG-04)

**우선순위**: 🟡 High
**카테고리**: UI / Depth
**영향 파일**: `src/scenes/MainMenuScene.js` (createTopBar), `src/components/TopBar.js`

### 현상
- 상단 바의 레벨, 보석, 골드, 에너지바, 파워, 설정 버튼 등이 서로 겹침

### 원인 분석
- TopBar 내부 요소들의 X좌표 배치가 화면 폭에 비해 조밀
- TopBar.js 자체 depth(100) vs MainMenuScene의 TopBar depth(300) 불일치
- 1080px 폭에서 요소 간 간격 부족

### 수정 방향
1. TopBar 내부 요소들의 X좌표를 재배치, 최소 간격 s(16) 확보
2. 우선순위 낮은 항목(파워 등)은 축약 또는 2열로 변경
3. depth를 Z_INDEX.TOP_BAR로 통일

### 완료 조건
- [ ] 1080x1920 해상도에서 모든 상단 바 항목이 겹치지 않음
- [ ] 아이콘과 텍스트가 명확히 구분됨

---

## TASK 5: 초기 재화 수정 (BUG-05)

**우선순위**: 🟢 Medium
**카테고리**: Data
**영향 파일**: `src/systems/SaveManager.js`

### 현상
- 현재 초기 재화: 보석 1500, 소환권 5
- 요구 사항: 보석 2700, 소환권 10

### 수정 방향
```javascript
// SaveManager.js:28-34
resources: {
  gold: 10000,
  gems: 2700,          // 1500 → 2700
  summonTickets: 10,   // 5 → 10
  skillBooks: 0,
  characterShards: {}
}
```

### 완료 조건
- [ ] 새 계정 생성 시 보석 2700, 소환권 10 확인
- [ ] 기존 세이브 데이터에는 영향 없음

---

## TASK 6: 파티 편집 영웅 선택 팝업 그리드화 (BUG-06)

**우선순위**: 🟡 High
**카테고리**: UI / UX
**영향 파일**: `src/components/PartyEditPopup.js`

### 현상
- 파티 편집에서 영웅 클릭 시 나오는 영웅 선택 서브팝업이 리스트 형태
- 영웅 리스트 팝업(HeroListPopup)과 다른 레이아웃이라 선택하기 어려움
- 서브팝업이 Container가 아닌 개별 요소(depth 2100-2103)로 관리

### 수정 방향
1. `openHeroSelect()`를 HeroListPopup과 동일한 그리드 레이아웃으로 재구성
2. 개별 요소 → Container 기반으로 리팩토링
3. 각 영웅 카드: 초상화 + 이름 + 등급 프레임 + 레벨
4. 3~4열 그리드, 스크롤 지원

### 완료 조건
- [ ] 영웅 선택 팝업이 HeroListPopup과 유사한 그리드 레이아웃
- [ ] 영웅 카드 터치 영역이 충분히 넓음 (최소 s(80)×s(80))
- [ ] 스크롤로 전체 영웅 목록 탐색 가능

---

## TASK 7: 영웅 상세정보 팝업 레이아웃 + 스킬 상세 (BUG-07)

**우선순위**: 🟡 High
**카테고리**: UI / Layout
**영향 파일**: `src/components/HeroInfoPopup.js`

### 현상
- 레이아웃이 잘 안 맞음 (요소 겹침 또는 잘림)
- 영웅 스킬에 대한 상세 정보 부족 (스킬명만 표시, 효과/쿨타임/데미지 미표시)
- depth 410으로 다른 팝업(2000)보다 낮아 가려질 수 있음

### 수정 방향
1. depth를 `Z_INDEX.MODAL`(2000) 이상으로 조정
2. 레이아웃 재배치: 초상화/스탯/장비/스킬 섹션 간격 확보
3. 스킬 섹션 확장:
   - 스킬명 + 아이콘
   - 효과 설명 (damage, heal, buff 등)
   - 쿨타임/마나 비용
   - 대상 범위 (single/aoe)
4. 스크롤 가능한 콘텐츠 영역

### 완료 조건
- [ ] 모든 요소가 겹치지 않음
- [ ] 스킬 상세정보 표시 (효과, 쿨타임, 대상)
- [ ] 다른 팝업 위에서 정상 표시

---

## TASK 8: 무한탑 클리어 시 진행도 오류 (BUG-08)

**우선순위**: 🔴 Critical
**카테고리**: Logic
**영향 파일**: `src/scenes/TowerScene.js`, `src/systems/TowerSystem.js`, `src/scenes/BattleScene.js`, `src/scenes/BattleResultScene.js`

### 현상
- 이벤트/무한탑 클리어 시 무한탑 진행도가 오르지 않음
- 다른 항목(스테이지?)의 진행도가 대신 올라감

### 원인 추정
- BattleResultScene에서 승리 처리 시 전투 유형(tower vs stage)을 구분하지 않고 스테이지 진행도만 업데이트
- 또는 TowerSystem.completeFloor() 호출이 누락

### 수정 방향
1. BattleScene/BattleResultScene에서 전투 출처(`battleType: 'tower'/'stage'`) 확인
2. tower 전투 승리 시 → `TowerSystem.completeFloor()` 호출
3. stage 전투 승리 시 → `StageManager/IdleProgressSystem` 업데이트
4. 전투 유형별 분기 처리 검증

### 완료 조건
- [ ] 무한탑 클리어 시 `currentFloor`가 정확히 +1
- [ ] 일반 스테이지 클리어 시 스테이지 진행도만 증가
- [ ] 두 시스템 간 간섭 없음

---

## TASK 9: 영웅 리스트 그리드/스크롤/정렬 UI 개선 (BUG-09)

**우선순위**: 🟢 Medium
**카테고리**: UI / Layout
**영향 파일**: `src/components/HeroListPopup.js`

### 현상
- 그리드가 팝업 크기에 맞지 않음
- 상단 아이템이 짤림 (마스크/스크롤 시작점 문제)
- 정렬/카테고리 버튼이 클릭하기 어렵고 구성 이해가 안 됨

### 수정 방향
1. 그리드 열 수를 팝업 폭에 맞게 동적 계산: `cols = floor(popupWidth / cardWidth)`
2. 스크롤 시작 Y를 필터바 아래로 정확히 설정, mask 영역 재조정
3. 정렬 카테고리 UI 개선:
   - 버튼 크기 확대 (최소 s(48) 높이)
   - 현재 선택된 정렬 기준 하이라이트
   - 라벨 명확화 (등급↓, 레벨↓, 이름↓ 등)

### 완료 조건
- [ ] 상단 아이템 짤리지 않음
- [ ] 정렬 버튼 쉽게 터치 가능
- [ ] 그리드가 팝업 폭에 맞게 정렬

---

## TASK 10: 설정 팝업에 치트패널 버튼 추가 (BUG-10)

**우선순위**: 🟢 Medium
**카테고리**: Feature
**영향 파일**: `src/scenes/SettingsScene.js` 또는 설정 팝업, `src/systems/DebugManager.js`

### 현상
- 설정에서 치트패널(디버그 패널)을 활성화할 방법이 없음
- 현재 DebugFAB는 main.js에서 자동 부착되지만 접근성이 낮음

### 수정 방향
1. 설정 팝업에 "개발자 도구" 또는 "치트 패널" 토글 버튼 추가
2. 버튼 클릭 시 `DebugManager.toggle()` 또는 DebugFAB visibility 전환
3. 프로덕션 빌드에서는 숨김 처리 (또는 특정 조건에서만 노출)

### 완료 조건
- [ ] 설정 팝업에 치트패널 버튼 존재
- [ ] 버튼으로 디버그 패널 on/off 가능

---

## TASK 11: 현재 모험 소탕/보스전 버튼 + 챕터 표시 depth (BUG-11)

**우선순위**: 🟡 High
**카테고리**: UI / Depth
**영향 파일**: `src/scenes/MainMenuScene.js` (createAdventurePanel)

### 현상
- 소탕/보스전 버튼이 모험 패널 배경 뒤쪽에 위치 (클릭 불가 또는 안 보임)
- 챕터 표시 텍스트도 배경 뒤에 깔려 있음

### 원인 분석
- createAdventurePanel()에서 버튼/텍스트에 명시적 depth 미설정
- 배경 graphics가 나중에 추가되어 버튼 위를 덮음

### 수정 방향
1. 모험 패널 요소 생성 순서 정리: 배경 → 텍스트 → 버튼
2. 또는 모든 요소에 명시적 depth 설정:
   - 패널 배경: `Z_INDEX.UI` (200)
   - 텍스트/진행도: `Z_INDEX.UI + 1` (201)
   - 버튼: `Z_INDEX.UI + 2` (202)
3. Container 기반으로 리팩토링하면 내부 요소 순서로 자동 해결

### 완료 조건
- [ ] 소탕/보스전 버튼이 화면에 보이고 클릭 가능
- [ ] 챕터 표시 텍스트가 배경 위에 표시
- [ ] 버튼 hover/press 인터랙션 정상 작동

---

## TASK 12: 재접속 시 진행도/보스전 준비 표시 오류 (BUG-12) ✅

**우선순위**: 🔴 Critical
**카테고리**: Logic
**영향 파일**: `src/systems/IdleProgressSystem.js`, `src/scenes/MainMenuScene.js`
**완료일**: 2026-02-16
**커밋**: `809360a`

### 현상
1. 재접속 후 진행도가 100%로 표시되지만 보스전 준비 표시가 비활성
2. 보상받기를 누르면 진행도가 80%로 줄었다가 다시 100%로 올라가면서 보스전 준비가 활성화

### 원인 분석
- 재접속 시 `accumulatedDamage`는 저장/복원되지만 `bossReady` 플래그가 재계산되지 않음
- `isBossReady()` 체크가 씬 생성 시 한 번만 호출되고, 그 시점에 아직 보스 데이터가 로드되지 않음
- `simulateBattle()`이 실행된 이후에만 상태가 반영되어 지연 발생

### 적용된 수정
1. **IdleProgressSystem 생성자 수정**
   - `_loadSavedProgress()` 직후 `loadCurrentBoss()` 호출
   - 보스 데이터 로드와 동시에 `bossReady` 상태 즉시 계산

2. **MainMenuScene.create() 수정**
   - 보스 버튼 생성 전 보스 로드 완료 보장 (constructor에서 이미 완료)
   - `isBossReady()` 호출 시 정확한 상태 반환

3. **MainMenuScene.update() 개선**
   - 매 프레임 `isBossReady()` 상태 체크
   - 보스 버튼 동적 갱신 (재접속 시 즉시 반영)

4. **로그 메시지 개선**
   - `loadCurrentBoss()`에서 `bossReady` 상태 출력
   - `claimRewards()`에서 진행도 리셋 명시

### 테스트 시나리오
1. ✅ 진행도 100% 상태에서 게임 종료 → 재접속 → 보스전 버튼 즉시 활성화
2. ✅ 보상받기 클릭 → 진행도 0%, 보스전 버튼 비활성화
3. ✅ 방치 후 진행도 100% → 보스전 버튼 즉시 활성화 (펄스 애니메이션)
4. ✅ 오프라인 보상 적용 후에도 상태 정확히 반영

### 완료 조건
- [x] 재접속 시 진행도 100%이면 보스전 준비 즉시 표시
- [x] 보상받기 없이도 보스전 진입 가능
- [x] 오프라인 누적 후에도 상태 정확
- [x] 매 프레임 상태 동기화로 UI 지연 없음

---

## TASK 13: 초반 보스 난이도 하향 + 밸런스 커브 재설계 (BUG-13)

**우선순위**: 🟡 High
**카테고리**: Balance
**영향 파일**: `src/data/enemies.json`, `src/systems/IdleProgressSystem.js`, `src/data/stages.json`, (신규) `src/config/balanceConfig.js`

### 현상
- 초반(1~5챕터) 보스가 너무 어려움
- 1-1(권장 100) → 1-5 보스(권장 1000) = 10배 점프
- 고블린왕 HP 1980 vs 플레이어 DPS 60 = 33초 전투 (방치형 치고 과다)

### 현재 보스 밸런스

| 챕터 | 보스 | Lv | HP | ATK | 권장전투력 | 문제 |
|------|------|-----|------|-----|-----------|------|
| 1 | 고블린 왕 | 10 | 1980 | 190 | 1000 | 챕터 내 10배 점프 |
| 2 | 균열의 수호자 | 25 | ~3000 | ~280 | 2500 | 2.5배 |
| 3 | 이자나미 | 35 | ~22k | ~1100 | 4000 | 급격한 HP 스케일 |

### 수정 방향

#### A. `balanceConfig.js` 신규 생성 (중앙집중 밸런스)
```javascript
export const BALANCE = {
  IDLE_DPS_RATIO: 0.20,          // 0.15 → 0.20 (DPS 33% 증가)
  BOSS_HP_MULTIPLIER: {
    chapter1: 0.6,               // 보스 HP 40% 감소
    chapter2: 0.7,               // 30% 감소
    chapter3: 0.8,               // 20% 감소
    chapter4: 0.9,               // 10% 감소
    chapter5: 1.0                // 원본 유지
  },
  STAGE_POWER_CURVE: 'logarithmic', // linear → log (완만한 커브)
  TARGET_BOSS_CLEAR_TIME: 15,    // 목표: 15초 이내 클리어
};
```

#### B. enemies.json 초반 보스 하향
- 고블린 왕: HP 900→600, growthHP 120→80, ATK 55→40
- 균열의 수호자: HP/ATK 30% 하향
- 이자나미: HP 4000→2800, growthHP 520→360

#### C. stages.json 권장 전투력 커브 완만화
- 1-1: 100 → 1-5: 350 (3.5배, 기존 10배)
- 2-1: 400 → 2-5: 1000 (2.5배)
- 챕터 간: 2~3배 증가로 통일

### 완료 조건
- [ ] balanceConfig.js 생성, 기존 하드코딩 수치 이관
- [ ] 1챕터 보스 15초 이내 클리어 가능 (초기 파티 기준)
- [ ] 챕터 내 난이도 커브 3~4배 이내
- [ ] 기존 후반 콘텐츠 밸런스 유지

---

## TASK 14: 영웅 상세팝업 등급별 배경색 차별화 (BUG-14)

**우선순위**: 🟢 Medium
**카테고리**: UI / Visual
**영향 파일**: `src/components/HeroInfoPopup.js`, `src/config/layoutConfig.js`

### 현상
- 영웅 상세정보 팝업이 모든 등급에서 동일한 배경색

### 수정 방향
layoutConfig.js의 RARITY_COLORS 활용:

| 등급 | 배경색 | 테두리색 | 글로우 |
|------|--------|----------|--------|
| N | `0x374151` (어두운 회색) | `0x6B7280` | 없음 |
| R | `0x1E3A5F` (어두운 청색) | `0x3B82F6` | 없음 |
| SR | `0x4C1D95` (어두운 보라) | `0xA855F7` | 미세한 보라 글로우 |
| SSR | `0x78350F` (어두운 금갈) | `0xF59E0B` | 금색 글로우 + 파티클 |

### 구현
1. `show()` 시 영웅 rarity 확인
2. 팝업 배경 fillColor를 `RARITY_COLORS[rarity].bg`로 설정
3. 테두리를 `RARITY_COLORS[rarity].border`로 설정
4. SR/SSR은 글로우 이펙트 추가 (외곽 lineStyle glow)

### 완료 조건
- [ ] N/R/SR/SSR 각각 다른 배경색
- [ ] SR/SSR 글로우 이펙트 표시
- [ ] 기존 팝업 레이아웃 깨지지 않음

---

## 구현 순서 (권장)

### Phase 1: Critical 버그 수정
1. **TASK 12** — 재접속 진행도/보스전 준비 오류
2. **TASK 8** — 무한탑 진행도 오류
3. **TASK 1** — 타이틀 중복 생성

### Phase 2: Depth/Layout 일괄 수정
4. **TASK 4** — 상단 바 겹침
5. **TASK 11** — 모험 패널 버튼/챕터 depth
6. **TASK 3** — 모험 패널 내부 겹침 + 파티 영웅
7. **TASK 2** — 보상받기 버튼 위치

### Phase 3: 팝업 UI 개선
8. **TASK 9** — 영웅 리스트 그리드/스크롤
9. **TASK 6** — 파티 편집 영웅 선택 그리드화
10. **TASK 7** — 영웅 상세정보 + 스킬
11. **TASK 14** — 영웅 상세팝업 등급별 배경색

### Phase 4: 밸런스/기능/데이터
12. **TASK 13** — 초반 보스 난이도 + balanceConfig
13. **TASK 5** — 초기 재화 수정
14. **TASK 10** — 설정 치트패널 버튼

---

## 공통 리팩토링 (Phase 2와 병행)

### Z_INDEX 체계 통일
```javascript
// layoutConfig.js 개선안
export const Z_INDEX = {
    BACKGROUND: 0,
    GAME_OBJECTS: 100,
    UI: 200,
    UI_CONTENT: 201,
    UI_BUTTON: 202,
    TOP_BAR: 300,
    BOTTOM_NAV: 300,
    MODAL: 2000,
    MODAL_CONTENT: 2001,
    SUB_MODAL: 2100,
    SUB_MODAL_CONTENT: 2101,
    TOOLTIP: 3000,
    DEBUG: 9999
};
```

### Container 기반 리팩토링
- 모험 패널, 파티 표시, 보상 영역을 각각 Container로 묶기
- Container 내부 요소는 추가 순서로 자동 정렬
- depth는 Container 레벨에서만 설정

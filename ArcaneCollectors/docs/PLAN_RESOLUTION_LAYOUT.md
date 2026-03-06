# ArcaneCollectors 해상도 변경 + 전체 레이아웃 수정 + 보스전 난이도 조정

## Context
- 현재 720x1280 해상도 → 1080x1920 기본 + **동적 해상도 대응**
- **모든 씬과 팝업**에서 하드코딩된 픽셀값으로 인한 레이아웃 겹침/깨짐 발생
- 초반 보스**전**(BattleScene) 난이도가 너무 높음 → 보스 스탯 하향 필요

## 핵심 전략: `s()` 동적 스케일 헬퍼

```javascript
// src/config/gameConfig.js
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;
export const BASE_WIDTH = 720;  // 기준 해상도
export const SCALE_FACTOR = GAME_WIDTH / BASE_WIDTH; // 현재 1.5

// 스케일 헬퍼 (모든 파일에서 import)
export function s(value) {
  return Math.round(value * SCALE_FACTOR);
}

// 폰트 스케일 헬퍼 (px 문자열 반환)
export function sf(basePx) {
  return `${Math.round(basePx * SCALE_FACTOR)}px`;
}
```

- 모든 하드코딩 값을 `s(기존값)` 또는 `sf(기존값)`으로 감싸면 해상도 변경 시 자동 대응
- 나중에 `GAME_WIDTH`만 바꾸면 전체 UI 자동 스케일

---

## PHASE 1: 설정 파일 + 스케일 헬퍼

### 1.1 `src/config/gameConfig.js`
- `GAME_WIDTH = 1080`, `GAME_HEIGHT = 1920`
- `BASE_WIDTH = 720` 추가
- `SCALE_FACTOR = GAME_WIDTH / BASE_WIDTH` export
- `s(value)`, `sf(basePx)` 헬퍼 함수 export
- `LAYOUT` 객체: `s()` 적용

### 1.2 `src/config/layoutConfig.js`
- `LAYOUT.WIDTH: 1080`, `LAYOUT.HEIGHT: 1920`
- 모든 상수에 `s()` 적용:
  - TOP_BAR: HEIGHT `s(80)=120`, PADDING `s(16)=24`
  - BOTTOM_NAV: HEIGHT `s(120)=180`, ICON_SIZE `s(48)=72`
  - PARTY: SLOT_SIZE `s(120)=180`, SLOT_GAP `s(20)=30`
  - BATTLE: UNIT_SIZE `s(100)=150`, SKILL_CARD `s(140)×s(180)`
  - ENERGY_UI: BAR_WIDTH `s(200)=300`, BAR_HEIGHT `s(24)=36`
  - UI_STYLES.FONT_SIZE: SMALL `s(14)=21`, MEDIUM `s(18)=27`, LARGE `s(24)=36`, TITLE `s(32)=48`

---

## PHASE 2: 전체 씬 스케일링

### 2.1 `src/scenes/MainMenuScene.js` (가장 큰 변경)

**새 Y 좌표 맵 (1080x1920, 섹션 간 `s(15)`=20px 간격)**
```
Top Bar:          0 ~ s(80)=120
Party Panel:      s(95)=140 ~ s(230)=340
Combat Power:     s(245)=360 ~ s(295)=440
Adventure Panel:  s(310)=460 ~ s(485)=720
IdleBattleView:   s(500)=740 ~ s(780)=1160
Idle Summary:     s(795)=1180 ~ s(835)=1240
Claim Rewards:    s(845)=1260 ~ s(885)=1320
Bottom Menu:      s(910)=1360 ~ s(1280)=1920
```

수정 메서드: `createTopBar()`, `createPartyDisplay()`, `createCombatPowerDisplay()`, `createAdventurePanel()`, `createIdleBattleView()`, `createIdleSummary()`, `_createClaimRewardsButton()`, `createBottomMenu()`, `showOfflineRewardsPopup()`

### 2.2 `src/scenes/LoginScene.js`
- 버튼 크기: `280×52` → `s(280)×s(52)`
- 폼 배경: `320×280` → `s(320)×s(280)`
- 입력 필드: `240×36` → `s(240)×s(36)`
- 폰트: `48px` → `sf(48)`, `28px` → `sf(28)` 등

### 2.3 `src/scenes/BattleScene.js`
- 턴 순서 바: y=`70` → `s(70)`, height `50` → `s(50)`
- 상단 바: height `60` → `s(60)`
- 시너지 컨테이너: y=`130` → `s(130)`
- 스킬 카드: y=`GAME_HEIGHT-160` → `GAME_HEIGHT-s(160)`
- 카드 크기: `65×50` → `s(65)×s(50)`
- 게이지 바: `55×6` → `s(55)×s(6)`
- 히트박스 반지름: `40` → `s(40)`
- 초상화 반지름: `35` → `s(35)`
- 폰트 전체: `sf()` 적용

### 2.4 `src/scenes/BattleResultScene.js`
- 타이틀 y=`100` → `s(100)`
- 별 디스플레이 y=`180` → `s(180)`
- 보상 패널 y=`380` → `s(380)`, height `200` → `s(200)`
- 버튼 `200×55` → `s(200)×s(55)`
- 별 크기 `50` → `s(50)`, spacing `60` → `s(60)`
- 소탕 모달 `340×320` → `s(340)×s(320)`

### 2.5 `src/scenes/GachaScene.js`
- 탭: `180×50` → `s(180)×s(50)`
- 배너 height `240` → `s(240)`
- 소환 버튼: `280×55` → `s(280)×s(55)`
- Pity 바: `300×20` → `s(300)×s(20)`

### 2.6 `src/scenes/HeroDetailScene.js`
- 캐릭터 프레임: `180×200` → `s(180)×s(200)`
- 스탯 패널 height `220` → `s(220)`
- 스킬 패널 height `100` → `s(100)`
- 버튼: `180×50` → `s(180)×s(50)`
- 스탯 간격: `28px` → `s(28)`

### 2.7 `src/scenes/HeroListScene.js`
- 카드: `110×150` → `s(110)×s(150)`
- 필터 바 y, 그리드 startY 전체 `s()` 적용
- 카드 spacing `10` → `s(10)`

### 2.8 `src/scenes/StageSelectScene.js`
- 스테이지 높이: `90` → `s(90)`
- 모달: `GAME_WIDTH-60` → `GAME_WIDTH-s(60)`, height `450` → `s(450)`

### 2.9 `src/scenes/PartyEditScene.js`
- 슬롯 크기: `140` → `s(140)`
- 탭 너비: `120` → `s(120)`
- 버튼: `180×48` → `s(180)×s(48)`

### 2.10 나머지 씬 (QuestScene, TowerScene, InventoryScene, SettingsScene)
- 패턴 동일: 모든 하드코딩 좌표/크기/폰트에 `s()` / `sf()` 적용

---

## PHASE 3: 컴포넌트 스케일링

### 3.1 `src/components/PopupBase.js`
- 기본 크기: `680×1100` → `s(680)×s(1100)` = 1020×1650
- 헤더 폰트: `24px` → `sf(24)`
- 닫기 버튼 오프셋: `30`, `20` → `s(30)`, `s(20)`
- 분리선: `20` → `s(20)`
- contentBounds padding: `15` → `s(15)`
- addText 기본 폰트: `16px` → `sf(16)`
- addButton 기본 폰트: `16px` → `sf(16)`

### 3.2 `src/components/IdleBattleView.js`
- 파티 아바타 반지름: `18` → `s(18)`
- 적 원 반지름: `40` → `s(40)`
- HP 바: `80×6` → `s(80)×s(6)`
- 데미지 텍스트: `18px` → `sf(18)`
- 보스 이모지: `40px` → `sf(40)`
- 진행 바 height: `8` → `s(8)`
- 레벨 배지: `24×14` → `s(24)×s(14)`

### 3.3 `src/components/Modal.js`
- 기본 크기: `320×240` → `s(320)×s(240)`
- 버튼: `120×40` → `s(120)×s(40)`
- cornerRadius: `16` → `s(16)`
- 닫기 버튼 반지름: `14` → `s(14)`
- 폰트: `sf()` 적용

### 3.4 `src/components/Toast.js`
- 높이: `40` → `s(40)`
- startY: `70` → `s(70)`
- borderRadius: `8` → `s(8)`
- 아이콘 크기: `20` → `s(20)`
- 폰트: `14px` → `sf(14)`

### 3.5 `src/components/HeroCard.js`
- 카드: `100×120` → `s(100)×s(120)`
- cornerRadius: `8` → `s(8)`
- 초상화: `70` → `s(70)`
- 별 크기, 배지 크기 전체 `s()` 적용
- 폰트: `sf()` 적용

### 3.6 `src/components/EnergyBar.js`
- 바 크기/폰트 `s()` / `sf()` 적용

### 3.7 `src/components/HeroInfoPopup.js`
- 팝업 크기/폰트 `s()` / `sf()` 적용

### 3.8 `src/components/TopBar.js`
- barHeight: `50` → `s(50)`
- 아이콘 크기: `24` → `s(24)`
- 폰트: `sf()` 적용

### 3.9 `src/components/BottomNav.js`
- navHeight: `80` → `s(80)`
- 아이콘 폰트: `28px` → `sf(28)`
- 라벨 폰트: `13px` → `sf(13)`

### 3.10 전투 컴포넌트
- **SkillCard.js**: 카드 `65×50` → `s(65)×s(50)`, 게이지 `55×6` → `s(55)×s(6)`
- **TurnOrderBar.js**: height `50` → `s(50)`, 아이콘 크기 `18/15` → `s(18)/s(15)`
- **SynergyDisplay.js**: 너비 `90` → `s(90)`, 간격 전체 `s()` 적용
- **EnhancedHPBar.js**: height `12` → `s(12)`, 아이콘 `14` → `s(14)`

### 3.11 기타 컴포넌트
- **Panel.js**: cornerRadius `12` → `s(12)`, titleFontSize `20` → `s(20)`, titleBarHeight `40` → `s(40)`
- **StatBar.js**: height `16` → `s(16)`, labelWidth `40` → `s(40)`, valueWidth `60` → `s(60)`
- **StarRating.js**: starSize `12` → `s(12)`, spacing `2` → `s(2)`
- **RadarChart.js**: radius `80` → `s(80)`, labelSize `12` → `s(12)`
- **LoadingSpinner.js**: size `20` → `s(20)`

### 3.12 팝업들 (PopupBase 상속)
- **HeroListPopup.js**: 카드 크기, 그리드 간격, 필터 버튼 등 `s()` 적용
- **SettingsPopup.js**: 토글/다이얼로그 크기, 행 높이 `s()` 적용
- **GachaPopup.js**: 카드/배너/버튼 크기 `s()` 적용
- **PartyEditPopup.js**: 슬롯/그리드 크기 `s()` 적용
- **QuestPopup.js**: 카드/보상 크기 `s()` 적용
- **TowerPopup.js**: 층 표시/버튼 크기 `s()` 적용
- **InventoryPopup.js**: 아이템 행/슬롯 크기 `s()` 적용
- **EventDungeonPopup.js**: 레이아웃 전체 `s()` 적용

---

## PHASE 4: 보스전(BattleScene) 난이도 하향

### 문제 분석
| 항목 | 현재 값 | 문제 |
|------|---------|------|
| Chapter 1 보스 HP (Lv10) | 3,300 | 파티 DPS 대비 너무 높음 |
| 보스 ATK (Lv10) | 215 | 영웅 4~6턴 만에 사망 |
| 영웅 평균 데미지/턴 | 77 | 보스 처치에 11턴 필요 |
| 스킬 게이지 충전 | 기본공격 +20 (5턴 필요) | 너무 느림 |

### 수정 내용

#### 4.1 `src/data/enemies.json` — 보스 스탯 하향
```
챕터 1 보스 (Goblin King):
  HP: 1500 → 900 (-40%)
  ATK: 80 → 55 (-31%)
  DEF: 40 → 30 (-25%)
  HP 성장: 200/레벨 → 120/레벨

챕터 2 보스:
  비슷한 비율로 하향
```

#### 4.2 `src/scenes/BattleScene.js` — 스킬 게이지 빨리 채우기
- 기본공격 게이지 충전: `20` → `30` (+50%)
- 3턴 만에 스킬 사용 가능 (기존 5턴)

### 예상 결과
| 항목 | 기존 | 변경 후 |
|------|------|---------|
| 보스 HP (Lv10) | 3,300 | 1,980 |
| 보스 ATK (Lv10) | 215 | 163 |
| 처치 필요 턴 | 11턴 | 6~7턴 |
| 영웅 생존 턴 | 6턴 | 8~9턴 |
| 스킬 사용 | 5턴마다 | 3턴마다 |
| **결과** | 영웅 먼저 사망 | **파티 승리 가능** |

---

## PHASE 5: 검증

1. `npx vite build` — 빌드 에러 없음 확인
2. Playwright로 게임 실행:
   - 메인 화면 스크린샷 → 레이아웃 겹침 없음 확인
   - 각 팝업 (영웅목록, 설정, 가챠 등) 스크린샷 → 크기 적절 확인
   - 보스전 진입 → 초반 보스 클리어 가능 확인
3. 콘솔 에러 0건 확인

---

## 전체 수정 파일 목록 (35개+)

### 설정 (2개)
1. `src/config/gameConfig.js` — 해상도 + `s()`/`sf()` 헬퍼
2. `src/config/layoutConfig.js` — 레이아웃 상수 스케일링

### 씬 (11개)
3. `src/scenes/MainMenuScene.js` — 메인 레이아웃 (최대 변경)
4. `src/scenes/LoginScene.js` — 로그인 화면
5. `src/scenes/BattleScene.js` — 전투 + 스킬 게이지 조정
6. `src/scenes/BattleResultScene.js` — 전투 결과
7. `src/scenes/GachaScene.js` — 소환
8. `src/scenes/HeroDetailScene.js` — 영웅 상세
9. `src/scenes/HeroListScene.js` — 영웅 목록
10. `src/scenes/StageSelectScene.js` — 스테이지 선택
11. `src/scenes/PartyEditScene.js` — 파티 편성
12. `src/scenes/QuestScene.js` — 퀘스트
13. `src/scenes/TowerScene.js` — 탑
14. `src/scenes/InventoryScene.js` — 인벤토리
15. `src/scenes/SettingsScene.js` — 설정

### 기본 컴포넌트 (11개)
16. `src/components/PopupBase.js` — 팝업 기본
17. `src/components/IdleBattleView.js` — 전투 미니뷰
18. `src/components/Modal.js` — 모달
19. `src/components/Toast.js` — 토스트
20. `src/components/HeroCard.js` — 영웅 카드
21. `src/components/EnergyBar.js` — 에너지 바
22. `src/components/HeroInfoPopup.js` — 영웅 정보 팝업
23. `src/components/TopBar.js` — 상단 바
24. `src/components/BottomNav.js` — 하단 네비
25. `src/components/Panel.js` — 패널
26. `src/components/Button.js` — 버튼

### 전투 컴포넌트 (4개)
27. `src/components/battle/SkillCard.js`
28. `src/components/battle/TurnOrderBar.js`
29. `src/components/battle/SynergyDisplay.js`
30. `src/components/EnhancedHPBar.js`

### 팝업 (8개)
31. `src/components/popups/HeroListPopup.js`
32. `src/components/popups/SettingsPopup.js`
33. `src/components/popups/GachaPopup.js`
34. `src/components/popups/PartyEditPopup.js`
35. `src/components/popups/QuestPopup.js`
36. `src/components/popups/TowerPopup.js`
37. `src/components/popups/InventoryPopup.js`
38. `src/components/popups/EventDungeonPopup.js`

### 데이터 (1개)
39. `src/data/enemies.json` — 보스 스탯 하향

### 기타 (스케일링 불필요 — 비율 기반 또는 로직만)
- ProgressBar.js, StarRating.js, StatBar.js — 외부에서 크기 전달받음
- RadarChart.js — radius 파라미터 전달받음
- LoadingSpinner.js — 작은 변경
- VirtualCardPool.js — 로직만

---

## 구현 순서 (의존성 기반)
1. **PHASE 1**: gameConfig.js + layoutConfig.js (`s()`/`sf()` 정의)
2. **PHASE 3.1-3.5**: 기본 컴포넌트 (PopupBase, Modal, Toast, HeroCard 등)
3. **PHASE 2.1**: MainMenuScene (가장 큰 변경, 기본 컴포넌트에 의존)
4. **PHASE 2.2-2.10**: 나머지 씬들 (병렬 가능)
5. **PHASE 3.6-3.12**: 팝업들 + 전투 컴포넌트
6. **PHASE 4**: 보스 난이도 (독립적)
7. **PHASE 5**: 빌드 + 테스트

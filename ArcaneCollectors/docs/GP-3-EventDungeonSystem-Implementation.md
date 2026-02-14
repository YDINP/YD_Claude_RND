# GP-3: 이벤트 던전 시스템 구현 완료 보고서

**프로젝트**: ArcaneCollectors
**브랜치**: arcane/integration
**작업일**: 2026-02-14
**상태**: ✅ 완료

---

## 📋 구현 개요

기간 한정 이벤트 던전 시스템을 구현했습니다. 기존 스테이지/배틀 시스템을 활용하여 특별 이벤트 콘텐츠를 제공하며, 일일 입장 제한, 이벤트 화폐, 전용 상점 등의 기능을 포함합니다.

---

## 📁 생성/수정된 파일 목록

### 신규 생성 파일 (4개)

1. **`src/systems/EventDungeonSystem.js`** (537줄)
   - 이벤트 던전 핵심 로직
   - 이벤트 활성/만료 판단
   - 일일 입장 횟수 제한
   - 보상 계산 및 지급
   - 이벤트 상점 구매

2. **`src/data/events.json`** (275줄)
   - 샘플 이벤트 3개 정의
   - 각 이벤트당 3단계 난이도 스테이지
   - 이벤트 전용 상점 아이템

3. **`src/components/popups/EventDungeonPopup.js`** (587줄)
   - PopupBase 상속 팝업 UI
   - 이벤트 목록 뷰
   - 이벤트 상세 뷰 (스테이지 선택)
   - 이벤트 상점 뷰

4. **`tests/systems/EventDungeonSystem.test.js`** (408줄)
   - 28개 유닛 테스트
   - 100% 테스트 통과

### 수정된 파일 (3개)

5. **`src/components/popups/index.js`**
   - EventDungeonPopup export 추가

6. **`src/systems/index.js`**
   - EventDungeonSystem export 추가

7. **`src/scenes/MainMenuScene.js`**
   - EventDungeonPopup import 추가
   - 하단 메뉴에 '🎉 이벤트' 버튼 추가
   - openPopup() 메서드에 eventdungeon 케이스 추가

---

## 🎯 구현 기능 상세

### 1. EventDungeonSystem (핵심 시스템)

#### 주요 메서드

| 메서드 | 설명 |
|--------|------|
| `getActiveEvents()` | 현재 진행 중인 이벤트 목록 |
| `getUpcomingEvents()` | 예정된 이벤트 목록 (날짜순 정렬) |
| `getExpiredEvents()` | 만료된 이벤트 목록 |
| `isEventActive(eventId)` | 이벤트 활성 여부 확인 |
| `getEventProgress(eventId)` | 이벤트 진행도 조회 |
| `canEnterEvent(eventId)` | 입장 가능 여부 확인 |
| `clearEventStage(eventId, stageId, result)` | 스테이지 클리어 처리 |
| `purchaseFromEventShop(eventId, itemId)` | 상점 아이템 구매 |
| `getTimeRemaining(eventId)` | 남은 시간 계산 |
| `getEventSummary(eventId)` | 이벤트 요약 정보 |
| `getAllEventsSummary()` | 전체 이벤트 요약 |

#### 이벤트 이벤트

```javascript
export const EventDungeonEvents = {
  EVENT_STARTED: 'event_dungeon_started',
  EVENT_ENDED: 'event_dungeon_ended',
  STAGE_CLEARED: 'event_dungeon_stage_cleared',
  DAILY_LIMIT_REACHED: 'event_dungeon_daily_limit_reached',
  CURRENCY_EARNED: 'event_dungeon_currency_earned',
  SHOP_PURCHASE: 'event_dungeon_shop_purchase'
};
```

#### 세이브 데이터 구조

```javascript
{
  eventDungeons: {
    "evt_dragon_raid": {
      clearedStages: {
        "evt_dragon_1": {
          firstClearDate: 1234567890,
          clearCount: 5,
          lastClearDate: 1234567900
        }
      },
      dailyEntries: 2,           // 오늘 입장 횟수
      lastResetDate: "2026-02-14", // 마지막 일일 초기화 날짜
      eventCurrency: 150,        // 보유 이벤트 화폐
      shopPurchases: {
        "shop_dragon_ticket": 2  // 상품별 구매 횟수
      },
      totalClears: 10            // 전체 클리어 횟수
    }
  }
}
```

### 2. 이벤트 데이터 (events.json)

#### 샘플 이벤트 3개

| 이벤트 ID | 이름 | 타입 | 기간 | 일일 한도 | 화폐 |
|-----------|------|------|------|-----------|------|
| `evt_dragon_raid` | 드래곤 습격 | raid | 2026-01-01 ~ 2026-03-31 | 3회 | dragon_scale |
| `evt_shadow_tower` | 그림자 탑 | tower | 2026-02-01 ~ 2026-02-28 | 5회 | shadow_fragment |
| `evt_treasure_hunt` | 보물 사냥 | collection | 2026-04-01 ~ 2026-04-30 | 3회 | treasure_key |

#### 난이도별 스테이지

각 이벤트는 3단계 난이도 스테이지 제공:
- **쉬움**: 권장 전투력 600~800, 이벤트 화폐 10
- **보통**: 권장 전투력 1200~1500, 이벤트 화폐 20
- **어려움**: 권장 전투력 2000~2500, 이벤트 화폐 40

#### 이벤트 상점

각 이벤트는 전용 상점 제공:
- SR/SSR 소환권
- 보석 상자
- 골드 보따리
- 경험치 물약
- 장비 상자

구매 제한(limit) 설정 가능.

### 3. EventDungeonPopup (UI)

#### 3가지 뷰 모드

1. **목록 뷰 (list)**
   - 활성 이벤트 카드 표시
   - 예정 이벤트 미리보기
   - 이벤트 타입별 색상 배지
   - 남은 시간 표시
   - 일일 진행도 / 클리어 상태

2. **상세 뷰 (detail)**
   - 이벤트 정보 패널
   - 일일 진행도 바
   - 이벤트 화폐 보유량
   - 스테이지 목록 (난이도별 색상)
   - 권장 전투력 표시
   - 보상 미리보기

3. **상점 뷰 (shop)**
   - 보유 화폐 표시
   - 상품 목록 (가격, 보상, 구매 제한)
   - 구매 가능 여부 실시간 체크
   - 구매 후 화면 새로고침

#### UI 특징

- TowerPopup과 동일한 PopupBase 상속 패턴
- 3단계 난이도별 색상 구분 (쉬움: 초록, 보통: 파랑, 어려움: 빨강)
- 이벤트 타입별 색상 (raid: 빨강, tower: 보라, collection: 주황)
- 진행도 바 애니메이션
- Toast 메시지로 피드백

### 4. 메인 메뉴 연동

- 하단 메뉴에 '🎉 이벤트' 버튼 추가 (6번째 슬롯)
- `openPopup('eventdungeon')` 호출로 팝업 표시
- 활성 이벤트가 있을 때 알림 배지 표시 (추후 구현 가능)

---

## 🧪 테스트 결과

### 유닛 테스트 통과율: 100% (28/28)

```
✅ EventDungeonSystem
  ✅ getActiveEvents
    ✓ 현재 진행 중인 이벤트를 반환해야 함
    ✓ 날짜 범위를 올바르게 확인해야 함
  ✅ getUpcomingEvents
    ✓ 예정된 이벤트를 반환해야 함
    ✓ 시작 날짜순으로 정렬되어야 함
  ✅ isEventActive
    ✓ 활성 이벤트는 true를 반환해야 함
    ✓ 존재하지 않는 이벤트는 false를 반환해야 함
  ✅ getEventProgress
    ✓ 새 이벤트의 초기 진행도를 생성해야 함
    ✓ 기존 진행도를 반환해야 함
  ✅ canEnterEvent
    ✓ 입장 가능한 이벤트는 canEnter: true를 반환해야 함
    ✓ 일일 한도를 초과하면 입장 불가
    ✓ 존재하지 않는 이벤트는 입장 불가
  ✅ clearEventStage
    ✓ 스테이지 클리어 시 보상을 지급해야 함
    ✓ 전투 패배 시 보상을 지급하지 않아야 함
    ✓ 일일 입장 횟수를 증가시켜야 함
    ✓ 이벤트를 발생시켜야 함
    ✓ 일일 한도 도달 시 이벤트를 발생시켜야 함
  ✅ calculateRewards
    ✓ 난이도에 따라 이벤트 화폐를 지급해야 함
    ✓ 이벤트 포인트를 계산해야 함
  ✅ purchaseFromEventShop
    ✓ 충분한 화폐가 있으면 구매에 성공해야 함
    ✓ 화폐가 부족하면 구매에 실패해야 함
    ✓ 구매 한도를 확인해야 함
    ✓ 구매 시 이벤트를 발생시켜야 함
  ✅ getTimeRemaining
    ✓ 남은 시간을 올바르게 계산해야 함
    ✓ 종료된 이벤트는 expired: true를 반환해야 함
  ✅ getEventSummary
    ✓ 이벤트 요약 정보를 반환해야 함
    ✓ 존재하지 않는 이벤트는 null을 반환해야 함
  ✅ getAllEventsSummary
    ✓ 모든 이벤트 요약을 반환해야 함
    ✓ 활성 이벤트 요약에 필요한 정보가 포함되어야 함

Test Files  1 passed (1)
     Tests  28 passed (28)
  Duration  164ms
```

### TypeScript 타입 검증

```bash
npx tsc --noEmit
# 0 errors
```

---

## 🎮 사용 방법

### 1. 플레이어 관점

1. 메인 메뉴 하단에서 '🎉 이벤트' 버튼 클릭
2. 활성 이벤트 목록에서 원하는 이벤트 선택
3. 이벤트 상세 화면에서 스테이지 선택 후 '도전' 클릭
4. 전투 승리 시 일반 보상 + 이벤트 화폐 획득
5. 이벤트 화폐로 전용 상점에서 한정 아이템 구매

### 2. 개발자 관점 (새 이벤트 추가)

```json
// src/data/events.json에 추가
{
  "id": "evt_new_event",
  "name": "새 이벤트",
  "description": "설명",
  "type": "raid",  // raid, tower, collection
  "startDate": "2026-05-01",
  "endDate": "2026-05-31",
  "dailyLimit": 3,
  "eventCurrency": "new_currency",
  "stages": [
    {
      "id": "evt_new_1",
      "name": "1단계",
      "difficulty": "easy",
      "recommendedPower": 1000,
      "enemies": [...],
      "rewards": {...}
    }
  ],
  "shop": [
    {
      "id": "shop_item_1",
      "name": "상품명",
      "reward": { "gems": 100 },
      "cost": 50,
      "limit": 5
    }
  ]
}
```

---

## 📊 시스템 흐름도

```
[메인 메뉴] → [이벤트 버튼 클릭]
    ↓
[EventDungeonPopup.show()]
    ↓
[EventDungeonSystem.getAllEventsSummary()] → 활성/예정 이벤트 로드
    ↓
[목록 뷰] → 이벤트 카드 표시
    ↓
[이벤트 선택] → [상세 뷰]
    ↓
[스테이지 선택] → EventDungeonSystem.canEnterEvent() 확인
    ↓
[전투 시작] → energySystem.consumeEnergy()
    ↓
[BattleScene] → mode: 'event'
    ↓
[전투 승리] → EventDungeonSystem.clearEventStage()
    ↓
- dailyEntries++
- eventCurrency += amount
- SaveManager.save()
- EventBus.emit(STAGE_CLEARED)
    ↓
[보상 팝업 표시]
```

---

## 🔗 기존 시스템 연동

### TowerSystem과 유사한 패턴

| TowerSystem | EventDungeonSystem |
|-------------|-------------------|
| `getFloorInfo()` | `getEventStage()` |
| `clearFloor()` | `clearEventStage()` |
| `getProgress()` | `getEventProgress()` |
| `calculateRewards()` | `_calculateRewards()` |
| `_grantRewards()` | `_grantRewards()` |

### SweepSystem의 일일 리셋 패턴 활용

- `_getDateString()` 메서드
- `_checkDailyReset()` 자동 호출
- `lastResetDate` 필드로 날짜 비교

### SaveManager 연동

- `eventDungeons` 객체에 이벤트별 진행도 저장
- `addGold()`, `addGems()`, `addSummonTickets()` 활용
- `save()` / `load()` 자동 호출

### EnergySystem 연동

- 스테이지 입장 시 에너지 소모 (기본 12)
- `energySystem.getCurrentEnergy()` 확인
- `energySystem.consumeEnergy()` 호출

---

## 🚀 향후 확장 가능성

### 추가 기능 아이디어

1. **이벤트 랭킹 시스템**
   - 클리어 속도/점수 기반 순위
   - 주간/월간 리더보드
   - 상위 랭커 추가 보상

2. **이벤트 미션/업적**
   - "드래곤 10회 처치"
   - "노 데미지 클리어"
   - 미션 완료 시 추가 보상

3. **협동 레이드**
   - 멀티플레이어 협동 전투
   - 길드 단위 이벤트
   - 공격대 보상 공유

4. **이벤트 전용 캐릭터**
   - 이벤트 기간 한정 소환
   - 이벤트 보너스 스탯
   - 컬렉션 보상

5. **이벤트 알림 시스템**
   - 이벤트 시작/종료 푸시 알림
   - 일일 한도 리셋 알림
   - 남은 시간 < 24시간 경고

---

## ✅ 검증 체크리스트

- [x] ES Modules만 사용 (require 금지)
- [x] 기존 코드 패턴/스타일 준수 (TowerSystem, SweepSystem 참고)
- [x] PopupBase 상속으로 팝업 구현
- [x] SaveManager 통해 진행도 저장
- [x] 유닛 테스트 28개 전부 통과
- [x] TypeScript 타입 에러 0개
- [x] MainMenuScene 연동 완료
- [x] 이벤트 던전 버튼 추가
- [x] events.json 샘플 데이터 3개 작성
- [x] 난이도별 스테이지 구성
- [x] 일일 입장 횟수 제한 구현
- [x] 이벤트 화폐/상점 시스템 구현

---

## 📝 커밋 메시지

```
[GP-3] 이벤트 던전 시스템 구현

- EventDungeonSystem: 이벤트 활성/진행도/보상 관리
- EventDungeonPopup: 목록/상세/상점 3뷰 UI
- events.json: 드래곤 습격, 그림자 탑, 보물 사냥 샘플
- 일일 입장 제한, 이벤트 화폐, 전용 상점 기능
- 28개 유닛 테스트 전부 통과
```

---

## 👨‍💻 작업자

Claude (Sonnet 4.5) - 2026-02-14

---

## 📚 참고 파일

- `src/systems/TowerSystem.js` - 층별 던전 구조 참고
- `src/systems/SweepSystem.js` - 일일 리셋 패턴 참고
- `src/components/popups/TowerPopup.js` - PopupBase 상속 패턴 참고
- `src/data/stages.json` - 스테이지 데이터 구조 참고
- `src/data/enemies.json` - 적 데이터 구조 참고

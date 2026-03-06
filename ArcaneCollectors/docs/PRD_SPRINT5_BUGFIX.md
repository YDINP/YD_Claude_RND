# Sprint 5 - 모험 시스템 버그 수정 및 개선 PRD

## 개요
모험(방치전투) 시스템의 핵심 버그 3건 + 기능 개선 1건을 수정합니다.

---

## TASK-1: 보스 진행도 영속화 (Critical Bug)

### 문제
- `IdleProgressSystem`이 `MainMenuScene.create()`에서 매번 `new`로 생성됨 (line 44)
- `accumulatedDamage`가 메모리에만 존재하고 `SaveManager`에 저장되지 않음
- `loadCurrentBoss()`가 호출될 때마다 `accumulatedDamage = 0`으로 리셋 (line 317)
- 결과: 씬 전환 후 돌아오면 진행도가 항상 0%로 초기화

### 수정 방안
1. `SaveManager`에 `idleProgress` 필드 추가: `{ accumulatedDamage, currentBossId, currentStage }`
2. `IdleProgressSystem.constructor()`에서 저장된 진행도 로드
3. `loadCurrentBoss()` 수정: 같은 보스면 `accumulatedDamage` 유지, 다른 보스면 리셋
4. `simulateBattle()`에서 진행도 변경 시 주기적으로 저장 (매 10초)
5. `MainMenuScene.shutdown()`에서 현재 진행도 저장

### 파일
- `src/systems/IdleProgressSystem.js` — 핵심 수정
- `src/scenes/MainMenuScene.js` — 저장/로드 로직 추가

---

## TASK-2: 보스전 버튼 동적 활성화 (Critical Bug)

### 문제
- 보스전 버튼이 `createAdventurePanel()` 시점(씬 생성 시)에만 활성/비활성 판정
- 진행도가 100%에 도달해도 버튼이 비활성 상태 유지 (이미 그려진 Graphics는 변경 불가)
- `update()` 루프에서 `bossReady` 감지하지만 버튼 상태를 업데이트하지 않음

### 수정 방안
1. 보스전 버튼과 소탕 버튼을 `this.bossBtnGraphics`, `this.sweepBtnGraphics` 등 인스턴스 변수로 보관
2. `update()` 루프에서 `bossReady` 상태 변경 감지 시 버튼 색상 + interactive 상태 동적 업데이트
3. 보스전 준비 완료 시 버튼 펄스 애니메이션 추가

### 파일
- `src/scenes/MainMenuScene.js` — `createAdventurePanel()`, `update()` 수정

---

## TASK-3: 소탕 항상 가능하게 변경 (Feature Change)

### 문제
- 현재 `performSweep()`이 `SweepSystem`을 사용하지 않고 인라인 구현 (line 681)
- 소탕 가능 조건이 `clearedStages > 0 && hasParty`로 되어있지만, 사용자 요구: **소탕은 항상 가능**
- 보상이 랜덤(50~150골드)이고 스테이지 무관

### 수정 방안
1. 소탕 조건: **파티 편성됨** (hasParty)만 필요. 클리어 이력 불필요
2. 보상: **이전 스테이지의 대략적 시간 기반 보상** — 현재 스테이지의 보스 HP 대비 파티 DPS로 예상 클리어 시간 계산 → 시간 비례 골드/EXP
3. 에너지 소모: 10 유지
4. SweepSystem의 3성 조건(`REQUIRED_STARS: 3`)은 SweepSystem 자체는 유지하되 MainMenuScene에서 직접 구현

### 보상 공식
```
estimatedClearTime = bossHp / partyDPS (초)
goldReward = Math.floor(estimatedClearTime * BASE_GOLD_PER_SEC * stageMultiplier)
expReward = Math.floor(estimatedClearTime * BASE_EXP_PER_SEC * stageMultiplier)
```

### 파일
- `src/scenes/MainMenuScene.js` — `createAdventurePanel()`, `performSweep()` 수정
- `src/systems/IdleProgressSystem.js` — `calculateSweepRewards()` 메서드 추가

---

## TASK-4: 파티편성 팝업 전환 (UX Improvement)

### 문제
- `MainMenuScene.createPartyDisplay()` line 390에서 `transitionManager.fadeTransition(this, 'PartyEditScene', ...)`로 씬 전환
- 씬 전환으로 인해 `IdleProgressSystem` 소멸 → 진행도 초기화 (TASK-1과 연관)
- `PartyEditPopup`이 이미 존재하고 하단 메뉴에서 동작함 (line 884)

### 수정 방안
1. 파티 패널의 "편성" 버튼을 `PartyEditPopup` 호출로 변경
2. `fadeTransition` → `this.openPopup('partyedit')` 로 변경
3. 팝업 닫힐 때 `refreshAfterPopup()` 호출 (이미 구현됨)

### 파일
- `src/scenes/MainMenuScene.js` — `createPartyDisplay()` line 389~391 수정

---

## 구현 순서
1. **TASK-1** (진행도 영속화) — 핵심, 다른 모든 태스크의 전제조건
2. **TASK-4** (파티편성 팝업) — 가장 간단, TASK-1 영속화 후 씬 전환 없으므로 완전 해결
3. **TASK-2** (보스전 버튼 동적 활성화) — TASK-1 영속화 완료 후 의미 있음
4. **TASK-3** (소탕 항상 가능) — 독립적이지만 보상 공식이 IdleProgressSystem에 의존

## 영향 범위
- `IdleProgressSystem.js` — 주요 수정 (영속화, 보상 계산)
- `MainMenuScene.js` — 주요 수정 (UI 동적 업데이트, 소탕/보스 로직)
- `SaveManager.js` — 경미한 수정 (idleProgress 필드 추가 — 기존 save/load 구조에 자연 통합)

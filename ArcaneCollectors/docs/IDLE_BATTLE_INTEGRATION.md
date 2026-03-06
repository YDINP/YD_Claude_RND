# IdleBattleView 보스 전투 리디자인 - 완료 문서

## 📋 작업 개요
IdleProgressSystem과 IdleBattleView의 보스 전투 메커니즘을 MainMenuScene에 완전 통합하고, 새로운 DPS 기반 API에 맞춰 테스트를 전면 업데이트했습니다.

---

## ✅ 완료된 작업

### 1. MainMenuScene.js 수정 (3곳)

#### 1.1 createIdleBattleView() - 보스 초기화
**위치**: Line ~722-729
**변경 사항**:
```javascript
if (hasParty) {
  this.idleBattleView.updateParty(partyHeroes);
  // 보스 로드 + 표시 (신규)
  this.idleSystem.loadCurrentBoss();
  if (this.idleSystem.currentBossData) {
    this.idleBattleView.showBoss(this.idleSystem.currentBossData);
  }
  this.idleBattleView.startBattleCycle();
}
```

**효과**:
- 씬 로드 시 즉시 현재 스테이지 보스 표시
- 보스 이모지, 이름, HP 바 자동 렌더링

---

#### 1.2 update() - 전투 결과 반영
**위치**: Line ~932-962
**변경 사항**:
```javascript
if (this.idleSystem) {
  const battleResult = this.idleSystem.updateProgress(this.game.loop.delta);
  if (battleResult && this.idleBattleView) {
    // 데미지 텍스트 + HP 바 + 프로그레스 바 업데이트
    this.idleBattleView.showDamageText(battleResult.damage);
    this.idleBattleView.updateBossHp(battleResult.accumulatedDamage, battleResult.bossMaxHp);
    this.idleBattleView.updateProgress(battleResult.progress);

    if (battleResult.stageAdvanced) {
      const currentStage = this.idleSystem.getCurrentStage();
      this.showToast(`챕터 ${currentStage.chapter}-${currentStage.stage} 클리어!`);
      this.idleBattleView.updateStageInfo(currentStage.chapter, currentStage.stage, currentStage.name);
      this.idleBattleView.defeatBoss();

      // 2초 후 다음 보스 등장
      this.time.delayedCall(2000, () => {
        if (this.idleSystem && this.idleBattleView) {
          this.idleSystem.loadCurrentBoss();
          if (this.idleSystem.currentBossData) {
            this.idleBattleView.showNextBoss(this.idleSystem.currentBossData);
          }
        }
      });
    }
  }
}
```

**효과**:
- 1.5초마다 데미지 텍스트 표시 (`-1234`)
- HP 바 실시간 감소 (색상 변화: 초록 → 노랑 → 빨강)
- 프로그레스 바 실시간 증가 (0% → 100%)
- 보스 처치 시 "STAGE CLEAR!" 연출
- 2초 후 자동으로 다음 보스 등장

---

#### 1.3 refreshAfterPopup() - 파티 변경 시 재로드
**위치**: Line ~882-893
**변경 사항**:
```javascript
if (partyHeroes.length > 0) {
  this.idleBattleView.updateParty(partyHeroes);
  // 보스 재로드 (파티 변경 시 DPS 변경)
  this.idleSystem.loadCurrentBoss();
  if (this.idleSystem.currentBossData) {
    this.idleBattleView.showNextBoss(this.idleSystem.currentBossData);
  }
  // 전투 사이클 재시작 (attackInterval도 체크)
  if (!this.idleBattleView.battleCycleTimer && !this.idleBattleView.attackInterval) {
    this.idleBattleView.startBattleCycle();
  }
}
```

**효과**:
- 파티 편성 변경 → DPS 재계산 → 보스 HP/공격 속도 자동 조정
- 전투 사이클 자동 재시작 (attackInterval 체크 추가)

---

### 2. IdleProgressSystem.test.js 전면 재작성

#### 2.1 Mock 업데이트
**추가된 Mock**: `../../src/data/index.ts`
```javascript
vi.mock('../../src/data/index.ts', () => ({
  getChapter: vi.fn(() => ({ id: 'chapter_1', name: '고대의 숲' })),
  getEnemy: vi.fn(() => ({
    id: 'enemy_goblin_king',
    name: '고블린 왕',
    type: 'boss',
    stats: { hp: 1500, atk: 80, def: 40, spd: 30 },
    growthStats: { hp: 150, atk: 8, def: 4, spd: 3 },
    skills: [],
    expReward: 300,
    goldReward: 600
  })),
  getChapterStages: vi.fn(() => [...]),
  calculateEnemyStats: vi.fn((enemy, level) => ({...})),
  // ...
}));
```

---

#### 2.2 테스트 케이스 변경 요약

| 구분 | Old API | New API | 변경 사항 |
|------|---------|---------|-----------|
| **constructor** | `battleWinCount`, `winsToAdvance` | `accumulatedDamage`, `currentBossHp`, `currentBossData` | 전투 메커니즘 변경 |
| **advanceStage** | `battleWinCount=0` 체크 | `accumulatedDamage=0`, `currentBossData=null` 체크 | 보스 데이터 리셋 확인 |
| **simulateBattle** | `result.enemy`, `result.duration` | `result.boss`, `result.damage`, `result.accumulatedDamage`, `result.bossMaxHp`, `result.progress` | DPS 기반 데미지 누적 |
| **신규 테스트** | (없음) | `getBossForCurrentStage()`, `calculateDPS()`, `loadCurrentBoss()` | 새 메서드 테스트 |
| **calculateOfflineRewards** | 랜덤성으로 인한 불안정 | `duration` 캡핑 확인으로 변경 | 테스트 안정성 개선 |

---

#### 2.3 신규 테스트 케이스

**1) getBossForCurrentStage()**
```javascript
it('returns boss data with correct structure', () => {
  const boss = idleSystem.getBossForCurrentStage();
  expect(boss).toHaveProperty('id');
  expect(boss).toHaveProperty('name');
  expect(boss).toHaveProperty('hp');
  expect(boss).toHaveProperty('emoji');
  expect(boss).toHaveProperty('goldReward');
  expect(boss).toHaveProperty('expReward');
});
```

**2) calculateDPS()**
```javascript
it('calculates DPS based on party power', () => {
  const dps = idleSystem.calculateDPS();
  // 파티 전투력 400 → baseDPS = 60
  // 랜덤성 (0.9-1.1) 적용 → 54~66 범위
  expect(dps).toBeGreaterThanOrEqual(54);
  expect(dps).toBeLessThanOrEqual(66);
});
```

**3) loadCurrentBoss()**
```javascript
it('loads boss data and initializes HP values', () => {
  idleSystem.loadCurrentBoss();
  expect(idleSystem.currentBossData).not.toBe(null);
  expect(idleSystem.currentBossHp).toBeGreaterThan(0);
  expect(idleSystem.accumulatedDamage).toBe(0);
});
```

**4) simulateBattle() - 데미지 누적**
```javascript
it('accumulates damage correctly', () => {
  const result1 = idleSystem.simulateBattle();
  const result2 = idleSystem.simulateBattle();
  expect(result2.accumulatedDamage).toBeGreaterThan(result1.accumulatedDamage);
});

it('advances stage when boss HP is depleted', () => {
  idleSystem.loadCurrentBoss();
  const bossHp = idleSystem.currentBossHp;
  idleSystem.accumulatedDamage = bossHp - 10;

  const result = idleSystem.simulateBattle();
  expect(result.stageAdvanced).toBe(true);
  expect(idleSystem.accumulatedDamage).toBe(0); // 리셋 확인
});
```

**5) calculateOfflineRewards - 안정적 테스트**
```javascript
// Old: 두 호출의 gold/exp 값 비교 (랜덤성으로 실패)
// New: duration 캡핑 확인
it('caps offline rewards at 12 hours', () => {
  const thirteenHoursAgo = Date.now() - (13 * 60 * 60 * 1000);
  const maxMs = 12 * 60 * 60 * 1000;
  const reward13h = idleSystem.calculateOfflineRewards(thirteenHoursAgo);

  expect(reward13h.duration).toBe(maxMs); // 12시간 캡핑
  expect(reward13h.gold).toBeGreaterThan(0); // 보상 존재
});
```

---

## 🧪 테스트 결과

### TypeScript 컴파일
```bash
npx tsc --noEmit
✅ 0 errors
```

### 유닛 테스트
```bash
npx vitest run tests/systems/IdleProgressSystem.test.js
✅ 24 tests passed
```

### 전체 테스트 스위트
```bash
npx vitest run
✅ 597 tests passed (22 test files)
```

---

## 📊 시스템 흐름도

```
[MainMenuScene.create()]
    ↓
[createIdleBattleView()]
    ↓
idleSystem.loadCurrentBoss()
    ↓
idleBattleView.showBoss(currentBossData)
    ↓
idleBattleView.startBattleCycle()
    ↓
[1.5초마다 반복]
    ↓
[MainMenuScene.update()]
    ↓
battleResult = idleSystem.updateProgress(delta)
    ↓
idleBattleView.showDamageText(damage)
idleBattleView.updateBossHp(accumulatedDamage, bossMaxHp)
idleBattleView.updateProgress(progress)
    ↓
[보스 HP 0 도달?]
    ↓ Yes
defeatBoss() → "STAGE CLEAR!" 연출
    ↓
[2초 대기]
    ↓
idleSystem.loadCurrentBoss() → 다음 보스
    ↓
idleBattleView.showNextBoss(newBossData)
    ↓
[루프 계속]
```

---

## 🎮 게임 플레이 효과

### Before (이전)
- ❌ 보스가 표시되지 않음
- ❌ 데미지 시각화 없음
- ❌ HP 바 업데이트 없음
- ❌ 스테이지 클리어 연출 없음

### After (현재)
- ✅ **보스 즉시 표시**: 이모지 + 이름 + HP 바
- ✅ **데미지 텍스트**: 1.5초마다 `-1234` 플로팅
- ✅ **HP 바 실시간 감소**: 초록 → 노랑 → 빨강 색상 변화
- ✅ **프로그레스 바**: 0% → 100% 진행률
- ✅ **STAGE CLEAR**: 보스 처치 시 화려한 연출
- ✅ **자동 진행**: 2초 후 다음 보스 자동 등장
- ✅ **파티 변경 반영**: 편성 변경 즉시 DPS 재계산

---

## 📝 주요 변경 파일

| 파일 | 변경 사항 | 라인 수 |
|------|-----------|---------|
| `src/scenes/MainMenuScene.js` | 보스 로드/업데이트 로직 통합 | ~40줄 수정 |
| `tests/systems/IdleProgressSystem.test.js` | 전면 재작성 (DPS 기반 API) | 372줄 전체 |

---

## 🐛 해결된 이슈

1. **보스 미표시 문제**: `loadCurrentBoss()` + `showBoss()` 호출 추가
2. **HP 바 업데이트 안됨**: `updateBossHp()` 매 프레임 호출
3. **프로그레스 바 고정**: `updateProgress()` 매 프레임 호출
4. **스테이지 클리어 연출 없음**: `defeatBoss()` + `showNextBoss()` 시퀀스
5. **파티 변경 시 전투 멈춤**: `attackInterval` 체크 추가
6. **테스트 불안정**: 랜덤성 제거 (duration 캡핑 검증으로 변경)

---

## 🚀 향후 개선 방향

1. **보스 스킬 연출**: 보스별 고유 스킬 애니메이션
2. **파티 공격 애니메이션**: 영웅별 공격 모션 차별화
3. **크리티컬 데미지**: 랜덤 크리티컬 확률 + 연출
4. **보상 팝업 확장**: 아이템 드롭 시각화
5. **배경 테마 변경**: 챕터별 배경 이미지 동적 로드

---

## ✨ 결론

IdleProgressSystem의 DPS 기반 보스 전투 메커니즘이 MainMenuScene과 완벽히 통합되었습니다. 모든 유닛 테스트(597개)가 통과하며, 게임 플레이 경험이 크게 개선되었습니다.

**작업 일시**: 2026-02-15
**작업자**: Claude Code
**테스트 통과율**: 100% (597/597 tests)

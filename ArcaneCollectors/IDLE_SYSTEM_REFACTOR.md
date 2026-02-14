# IdleProgressSystem 리팩터 완료

## 변경 개요
유휴 전투 시스템을 "3킬 → 스테이지 진행" 방식에서 "보스 HP 누적 → HP 0이면 스테이지 진행" 방식으로 변경했습니다.

## 주요 변경 사항

### 1. Constructor 수정
**이전:**
- `battleWinCount` / `winsToAdvance = 3`: 3킬 카운터
- `battleInterval = 5000`: 5초마다 전투

**이후:**
- `accumulatedDamage = 0`: 현재 보스 누적 데미지
- `currentBossHp = 0`: 현재 보스 최대 HP
- `currentBossData = null`: 현재 보스 데이터 객체
- `battleInterval = 1500`: 1.5초마다 공격 (더 빠른 타격감)

### 2. 새로운 메서드

#### `getBossForCurrentStage()`
- stages.json에서 현재 챕터의 보스 스테이지 찾기
- enemies.json에서 보스 스탯 가져오기 (`getEnemy`, `calculateEnemyStats`)
- 비보스 스테이지에서는 HP 스케일링: `보스HP × (현재스테이지 / 5)`
  - 예: 1-1 → 보스HP × 0.2, 1-5 → 보스HP × 1.0
- 반환: `{ id, name, hp, atk, def, emoji, goldReward, expReward }`

#### `getBossEmoji(bossId)`
- 보스별 이모지 매핑
- 지원: 고블린왕(👑), 균열수호자(🛡️), 이자나미(💀), 제우스(⚡), 오딘(👁️)
- 기본값: 👹

#### `calculateDPS()`
- 파티 전투력 기반 초당 데미지 계산
- 공식: `파티전투력 × 0.15 × (0.9~1.1 랜덤)`
- 예: 전투력 400 → DPS 60

#### `loadCurrentBoss()`
- 현재 보스 데이터 로드 및 초기화
- `accumulatedDamage = 0` 리셋
- GameLogger 기록

### 3. 리팩터된 메서드

#### `simulateBattle()`
**이전 로직:**
```javascript
랜덤 적 선택 → 1회 공격 → battleWinCount++ → 3킬이면 스테이지 진행
```

**이후 로직:**
```javascript
보스 데이터 로드 → DPS 기반 데미지 계산 → 누적 데미지 증가
→ 보스 HP 0이면 스테이지 진행
```

**반환 데이터 변경:**
- `enemy` → `boss` (현재 보스 전체 데이터)
- `damage` (동일)
- `reward` (동일)
- 추가: `accumulatedDamage`, `bossMaxHp`, `progress` (0~1 진행도)

#### `calculateOfflineRewards()`
**이전:**
- 시간 비례 고정 보상 (goldPerSec × offlineSec)

**이후:**
- DPS 기반 보스 처치 수 계산
- `bossesKilled = floor(offlineSec × DPS / bossHP)`
- `gold = bossesKilled × bossGoldReward × 0.8` (80% 효율)
- `exp = bossesKilled × bossExpReward × 0.8`

#### `advanceStage()`
**변경:**
- `this.battleWinCount = 0` 제거
- `this.accumulatedDamage = 0` 추가
- `this.currentBossData = null` 추가 (다음 보스 로드 트리거)

### 4. 제거된 메서드
- `getRandomEnemy()`: 하드코딩 적 풀 제거 (더 이상 사용하지 않음)

### 5. Import 추가
```javascript
import { getChapter, getEnemy, getChapterStages, calculateEnemyStats } from '../data/index.ts';
```

## 게임플레이 변화

### 이전
1. 5초마다 랜덤 적 1마리 처치
2. 3마리 처치 시 스테이지 진행
3. 고정된 5종 적 풀

### 이후
1. 1.5초마다 보스에게 DPS 기반 데미지
2. 보스 HP 0이 되면 스테이지 진행
3. stages.json/enemies.json 기반 정확한 보스 데이터
4. 진행도 UI 표시 가능 (`progress: 0~1`)

## 호환성

### 유지된 인터페이스
- `updateProgress(delta)`: 시그니처 동일
- `getCurrentStage()`: 동일
- `getStageMultiplier()`: 동일
- `getIdleBattleRate()`: 동일
- `getPartyPower()`: 동일
- `formatDuration()`: 동일
- `generateRandomItem()`: 동일
- `getStageName()`: 동일
- 정적 변수: `MAX_OFFLINE_HOURS`, `BASE_GOLD_PER_SEC`, `BASE_EXP_PER_SEC`

### 변경된 반환값
- `simulateBattle()`: 반환 구조 변경 (UI 업데이트 필요)
  - `enemy` → `boss`
  - 추가: `accumulatedDamage`, `bossMaxHp`, `progress`

## UI 업데이트 필요
IdleBattleView 등에서 `simulateBattle()` 반환값 사용하는 부분 수정 필요:

**이전:**
```javascript
const { enemy, damage, reward } = battleResult;
console.log(`${enemy.name}에게 ${damage} 데미지!`);
```

**이후:**
```javascript
const { boss, damage, reward, progress, accumulatedDamage, bossMaxHp } = battleResult;
console.log(`${boss.name}에게 ${damage} 데미지! (${Math.floor(progress * 100)}%)`);
```

## 테스트 결과
- TypeScript 컴파일: ✅ 에러 없음
- ES Module import: ✅ 정상
- 기존 메서드 시그니처: ✅ 유지

## 다음 단계
1. IdleBattleView 컴포넌트 업데이트 (반환값 구조 변경 대응)
2. 보스 HP 진행 바 UI 추가
3. 보스 이모지 표시
4. 게임 내 테스트 및 밸런스 조정

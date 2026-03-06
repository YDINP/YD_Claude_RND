# QAT-T2 태스크 탐색 결과 (MoodSystem/BattleSystem/GachaSystem 유닛 테스트)

## 1. MoodSystem 유닛 테스트 설계 (QAT-T2-1, ~20개)

### 시스템 구조
- **클래스**: MoodSystem (싱글톤)
- **주요 상수**:
  - MOOD_TYPES: 9종 분위기 (brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic)
  - MOOD_MATCHUPS: 배열 기반 상성 매트릭스 (각 분위기는 2강 2약, 4중립)
  - MATCHUP_CONFIG: 상성 배율 (ADVANTAGE=1.2, DISADVANTAGE=0.8, NEUTRAL=1.0)
  - CULT_MOOD_BONUSES: 9교단-분위기 1:1 매핑 (각 ×1.15 보너스)

### 테스트 대상 메서드 (9개)
1. **getMatchupMultiplier(attacker, defender)** - 상성 배율 계산
   - 유효한 분위기 예외 처리
   - 상성 우위/열세/중립 반환
   - 대소문자 정규화 (toUpperCase)
   - 테스트 케이스: 우위/열세/중립/동일/유효하지 않은 분위기

2. **getCultBonus(cult, mood)** - 교단-분위기 보너스
   - 최적 조합 → bonus값 반환
   - 비최적 → 0 반환
   - 유효하지 않은 교단 → 0 반환
   - 테스트 케이스: 9교단 전체 × 9분위기

3. **calculatePartyBonus(party)** - 파티 전체 보너스
   - 다양성 보너스 (uniqueMoods 개수별)
   - 시너지 보너스 (특정 조합)
   - 교단 보너스 합산
   - 빈 파티/null 처리

4. **_calculateDiversityBonus(uniqueCount, totalCount)** (private) - 다양성
   - 4종 이상 다른 분위기 → 0.15 (15%)
   - 3종 → 0.08 (8%)
   - 2종 → 0.03 (3%)
   - 1종 → 0 (0%)

5. **_calculateSynergyBonus(moods)** (private) - 시너지
   - BRAVE + WILD → +5%
   - CALM + DEVOTED → +5%
   - CUNNING + NOBLE → +5%
   - FIERCE + STOIC → +5%
   - MYSTIC 포함 → +3%

6. **_generatePartyDetails(uniqueMoods, diversityBonus, synergyBonus)** (private)
   - 문자열 포맷팅 검증
   - 다양성/시너지 보너스 포함 여부

7. **getAdvantageousMoods(defenderMood)** - 상성 역조회
   - advantageous/neutral/disadvantageous 분류
   - recommendation 문자열 생성

8. **getMatchupChart()** - 전체 상성표
   - 9×9 매트릭스 반환
   - 모든 조합 커버

9. **getSystemInfo()** - 시스템 정보
   - 상수 및 설명 반환

### Mock 필요 항목
- MoodSystem 자체 (싱글톤이므로 직접 테스트)
- MOOD_TYPES, MOOD_MATCHUPS, MATCHUP_CONFIG (constants에서 import)
- CULT_MOOD_BONUSES (constants에서 import)

### 제약 조건
- ES6 module (import/export)
- Vitest 사용
- describe/it/expect 패턴
- 기존 constants.test.js 참고 (184개 기존 테스트)

### 성공 기준
- 테스트 수: ~20개
- 커버리지: MoodSystem 메서드 100%
- 엣지 케이스 포함 (null/undefined/유효하지 않은 입력)

---

## 2. BattleSystem 유닛 테스트 설계 (QAT-T2-2, ~30개)

### 시스템 구조
- **클래스**: BattleSystem (singleton)
- **헬퍼 클래스**: 
  - BattleUnit: 전투 유닛 (캐릭터/적)
  - BattleEventEmitter: 커스텀 이벤트
  - SynergyCalculator: 시너지 계산
  - 스킬 전략: BasicAttackStrategy, SkillStrategy, AoeAttackStrategy, HealStrategy, PowerStrikeStrategy

### 테스트 대상 메서드 (주요 10개)
1. **constructor()** - 초기화
   - battleState = IDLE
   - turnCount = 0
   - alliesDefeated = false
   - enemiesDefeated = false

2. **initBattle(allies, enemies)** - 전투 초기화
   - BattleUnit 배열 생성
   - turnOrder 계산
   - state = INITIALIZING

3. **calculateTurnOrder()** - 턴 순서 계산
   - 속도(spd) 기반 정렬
   - 동일 속도시 random 처리

4. **calculateDamage(attacker, defender, skill)** - 데미지 계산
   - 기본 공식: ATK × multiplier × (1 - DEF/1000)
   - 분위기 상성 적용 (getMoodBonus)
   - 크리티컬 (5% 확률 × 1.5배)
   - 데미지 분산 (90%~110%)
   - 테스트 케이스:
     - 우위/열세/중립 상성
     - 크리티컬 확률
     - 최소 데미지 (1)
     - 방어력 감소 공식

5. **getMoodBonus(attacker, defender)** - 분위기 보너스
   - 우위 → +0.20 (+20%)
   - 열세 → -0.20 (-20%)
   - 중립 → 0
   - neutral 무시
   - 테스트 케이스: 9×9 상성 일부 샘플

6. **executeAction(unit, skill, targets)** - 액션 실행
   - 스킬 게이지 소비 (consumeSkillGauge)
   - 각 대상에 데미지 또는 회복
   - 결과 로깅

7. **processTurn()** - 턴 처리
   - getNextUnit() → 다음 유닛 선택
   - getAIAction() → AI 액션
   - executeAction() 실행
   - 승패 확인

8. **finishBattle(result)** - 전투 종료
   - state = VICTORY 또는 DEFEAT
   - calculateRewards() / calculateStars()
   - isFinished = true

9. **isVictory() / isDefeat()** - 승패 판정
   - 모든 적 전멸 → victory
   - 모든 아군 전멸 → defeat

10. **calculateRewards()**  / **calculateStars()** - 보상/별점
    - 경험치/골드/드롭 계산
    - 1~3★ 조건 (HP 백분율, 턴 수 등)

### BattleUnit 테스트 대상 메서드 (주요 5개)
1. **constructor(characterData, level, isEnemy)** - 초기화
   - stats 계산 (calculateStat)
   - 스킬 로드
   - HP/ATK/DEF/SPD 설정

2. **calculateStat(stat)** - 스탯 계산
   - 공식: (baseStats[stat] + growth[stat] × (level - 1)) × rarityBonus
   - 등급별 보정 (N=1.0, R=1.1, SR=1.25, SSR=1.5)

3. **takeDamage(amount)** - 피해 처리
   - HP 감소 (최소 1 데미지)
   - isAlive 플래그 (HP ≤ 0)

4. **heal(amount)** - 회복
   - 최대 HP 한정
   - 실제 회복량 반환

5. **chargeSkill(amount) / consumeSkillGauge(skillIndex)**
   - 게이지 증감 (0~maxSkillGauge 범위)

### Mock 필요 항목
- SaveManager (addCharacter, spendGems 등)
- EventBus (emit)
- characters.json 데이터 (getCharacter)
- 스킬 데이터 (skills 배열)
- MoodSystem (getMoodBonus 호출)

### 제약 조건
- 이벤트 기반 (on/emit) 테스트 포함
- Console.log 무시 또는 mock
- Strategy Pattern 검증

### 성공 기준
- 테스트 수: ~30개 (BattleSystem 20개, BattleUnit 10개)
- 커버리지: 핵심 메서드 100%
- 데미지 계산 엣지 케이스 (분산, 크리티컬, 방어력)
- 턴 순서 결정론적 테스트 (seed 사용)

---

## 3. GachaSystem 유닛 테스트 설계 (QAT-T2-3, ~15개)

### 시스템 구조
- **클래스**: GachaSystem (정적 메서드 기반)
- **주요 상수**:
  - RATES: { SSR: 0.03, SR: 0.15, R: 0.82 }
  - PITY_CONFIG: { softPity: 75, hardPity: 90, softPityBonus: 0.06 }
  - SOFT_PITY_START: 75
  - PITY_THRESHOLD: 90
  - SINGLE_COST: 160, MULTI_COST: 1480
  - TICKET_SINGLE: 1, TICKET_MULTI: 10

### 테스트 대상 메서드 (9개)
1. **pull(count, paymentType)** - 소환 실행
   - 비용 확인 (canPull)
   - 비용 차감 (SaveManager)
   - 천장 카운터 업데이트
   - SSR 획득 시 카운터 리셋
   - 10연차 SR 이상 확정
   - 결과 배열 반환
   - 테스트 케이스:
     - 1회/10회 소환
     - gems/ticket 결제
     - 천장/소프트 천장 도달

2. **determineRarity(currentPity)** - 등급 결정
   - 90연차 확정 SSR
   - 75연차 이후 소프트 천장 (+6% 매 회)
   - 기본 확률 (SSR 3%, SR 15%, R 82%)
   - 테스트 케이스:
     - pity 0: 기본 확률
     - pity 75: 소프트 천장 시작
     - pity 89: 소프트 천장
     - pity 90: 확정 SSR

3. **getRandomCharacterByRarity(rarity)** - 캐릭터 선택
   - 등급별 풀에서 랜덤
   - 유효한 캐릭터만 반환

4. **getPityInfo()** - 천장 정보
   - currentPity, nextSSRGuarantee, softPityStarted 반환

5. **isPickupGuaranteed()** - 픽업 보장 여부
   - isPickupGuaranteed 플래그 반환

6. **calculatePityBonus()** - 천장 보너스 (deprecated, 구버전)
   - 사용되지 않는 경우 스킵

7. **canPull(count, paymentType)** - 소환 가능 여부
   - gems/ticket 충분 여부 확인
   - count 유효성 (1 또는 10)

8. **getCurrentBanner()** - 현재 배너 반환
   - 활성 배너 정보

9. **getRateInfo()** - 확률 정보 반환
   - SSR/SR/R/N 확률

### Mock 필요 항목
- SaveManager (getGems, spendGems, addCharacter, updateGachaCounter, getGachaInfo)
- EventBus (emit)
- characters.json (getRandomCharacterByRarity에서 필터링)
- 배너 데이터 (_banners 초기화)

### 제약 조건
- 확률성 테스트 (여러 번 실행 통계)
- 천장 카운터 상태 추적
- SaveManager 호출 검증

### 성공 기준
- 테스트 수: ~15개
- 커버리지: GachaSystem 메서드 100%
- 확률 테스트: 통계적 유의성 (100회 이상)
- 천장 로직: 경계값 테스트 (75, 89, 90)
- 비용 검증: gems/ticket 모두

---

## 4. 테스트 파일 구조 (예상)

```
tests/
├── systems/
│   ├── MoodSystem.test.js (20개 테스트)
│   ├── BattleSystem.test.js (30개 테스트)
│   └── GachaSystem.test.js (15개 테스트)
└── [기존]
    ├── data/index.test.js
    └── utils/constants.test.js
```

## 5. 공통 Mock 패턴

```js
// SaveManager Mock
const mockSaveManager = {
  getGems: vi.fn(() => 10000),
  spendGems: vi.fn(),
  addCharacter: vi.fn(() => ({ duplicate: false })),
  getGachaInfo: vi.fn(() => ({ pityCounter: 0, totalPulls: 0 })),
  updateGachaCounter: vi.fn()
};

// EventBus Mock
const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};

// 랜덤 시드 (테스트 결정론성)
vi.spyOn(Math, 'random').mockReturnValue(0.5);
```

## 6. 테스트 우선순위

| 우선순위 | 메서드 | 이유 |
|---------|--------|------|
| 1 | getMatchupMultiplier | MoodSystem 핵심 로직 |
| 2 | calculateDamage | 데미지 = 게임 플레이의 핵심 |
| 3 | pull | 가챠 = 매출 직결 |
| 4 | processTurn | 전투 루프의 중심 |
| 5 | determineRarity | 천장 정책 검증 |
| 6 | calculatePartyBonus | 파티 편성 밸런싱 |
| 7 | BattleUnit.calculateStat | 스탯 계산 기반 |
| 8 | finishBattle | 승패 로직 |

---

## 7. 테스트 패턴 (constants.test.js 기준)

- describe 블록: 메서드/기능별 분류
- it 테스트: 케이스별 1개 (예: "상성 우위 → 1.2 배율")
- expect: 명확한 assertion
- 주석: 테스트 목적 설명
- 엣지 케이스: null/undefined/유효하지 않은 입력 포함

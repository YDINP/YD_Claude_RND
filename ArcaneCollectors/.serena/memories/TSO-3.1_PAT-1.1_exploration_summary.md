# TSO-3.1 & PAT-1.1 태스크 탐색 결과 요약

## 프로젝트 정보
- **경로**: D:\park\YD_Claude_RND-w2\ArcaneCollectors
- **타입**: Phaser 3.80.1 (ES6 모듈) + Vite 5 + TypeScript 5.9.3
- **타입 체크**: `tsconfig.json` (ES2022, moduleResolution: bundler, checkJs: false, strict: false)

## TSO-3.1: src/utils/ JS → TS 전환

### 대상 파일 9개
1. `src/utils/helpers.js` - 46개 export (formatNumber, randomInt, colorLerp 등)
2. `src/utils/constants.js` - 분위기/교단 시스템 상수 (MOOD 9종, CULT 9종)
3. `src/utils/animations.js` - 46개 Phaser 애니메이션 함수
4. `src/utils/drawUtils.js` - 28개 그래픽 그리기 함수
5. `src/utils/textStyles.js` - TextStyles 객체 + 4개 헬퍼 함수 (Phaser 텍스트 스타일)
6. `src/utils/GameLogger.js` - Singleton 클래스 (카테고리별 로깅)
7. `src/utils/TouchManager.js` - 터치 제스처 클래스 (swipe, longpress, doubletap)
8. `src/utils/rarityUtils.js` - 6개 등급 변환 함수 (숫자↔문자열)
9. `src/utils/TransitionManager.js` - Singleton 클래스 (씬 전환 효과)

### 기존 타입 정의 (src/types/)
- `character.d.ts` - MoodType, CultType, ClassType, RarityNumber, CharacterSkill 등
- `battle.d.ts` - Battler, DamageResult, TurnActionResult 등
- `index.d.ts` - 모든 타입의 중앙 re-export

### 특징
- **Phaser 의존성 강함**: scene, graphics, tweens, text 객체 많음
- **디자인 시스템 참조**: `designSystem.js` 에서 DESIGN, getMoodColor() 등 가져옴
- **재-export 패턴**: helpers.js → rarityUtils.js 함수 재-export
- **Singleton 패턴**: GameLogger, TransitionManager (클래스 인스턴스 단일화)
- **임포트 경로**: 현재 모든 파일이 `.js` 확장자로 명시적 지정 필요

### 현재 임포트 사용처 (20개 파일)
```
BattleScene, GachaScene, HeroListScene, HeroDetailScene, InventoryScene,
MainMenuScene, PartyEditScene, QuestScene, SettingsScene, StageSelectScene,
TowerScene, BattleResultScene, BottomNav, HeroCard, 
CharacterRenderer, UIRenderer, EnergySystem, HeroAssetLoader,
ProgressionSystem, SaveManager
```

### 변경 내용
- **helpers.js → helpers.ts**: 전체 함수에 JSDoc → TypeScript 타입 지정
  - `formatNumber(num: number): string`
  - `randomInt(min: number, max: number): number`
  - `colorLerp(color1: string, color2: string, t: number): string` 등

- **constants.js → constants.ts**: 타입 정의 + 상수 내보내기
  ```typescript
  export const MOOD: Record<string, MoodType> = { ... }
  export const MOOD_MATCHUP: Record<MoodType, MoodMatchupConfig> = { ... }
  ```

- **GameLogger.js → GameLogger.ts**: 클래스 타입 지정
  ```typescript
  class GameLogger {
    static categories: Record<string, CategoryConfig> = { ... }
    static log(category: string, message: string, data?: any): void
  }
  ```

- **TouchManager.js → TouchManager.ts**: 클래스 타입 + 이벤트 콜백
  ```typescript
  export class TouchManager {
    on(event: 'swipe' | 'longpress' | 'doubletap', callback: (data: GestureData) => void): this
  }
  ```

- **rarityUtils.js → rarityUtils.ts**: 숫자/문자열 타입 안전
  ```typescript
  export function getRarityKey(rarity: number | string): RarityKey
  export function getRarityNum(rarity: number | string): RarityNumber
  ```

### 성공 기준
- ✅ 모든 9개 파일 .ts 확장자로 전환
- ✅ `src/types/` 기존 9개 .d.ts 활용 (새 파일 불필요)
- ✅ 모든 임포트 경로 `.js` → `.ts` 자동 업데이트
- ✅ `tsconfig.json` 수정 불필요 (이미 ES2022, checkJs: false 설정)
- ✅ JSDoc 타입 제거 + TypeScript 네이티브 타입 지정
- ✅ Vite 빌드 테스트: `npm run build` 성공
- ✅ 타입 체크: `npm run typecheck` 오류 0개

---

## PAT-1.1: BattleSystem Command 패턴 적용

### 적용 위치
`src/systems/BattleSystem.js` - 전투 실행 엔진 (780줄)

### 기존 구조
- **Strategy Pattern** (이미 적용)
  - SkillStrategy 기본 클래스
  - BasicAttackStrategy, PowerStrikeStrategy, HealStrategy, AoeAttackStrategy
  - SKILL_STRATEGIES 맵으로 전략 선택
  
- **Observer Pattern** (이미 적용)
  - BattleEventEmitter (on/off/emit)
  - 턴 시작/종료, 데미지, 회복 이벤트 발행

- **State Pattern** (이미 적용)
  - BattleState enum (idle, initializing, turn_start, processing_action, turn_end, victory, defeat, timeout)

### Command 패턴 추가 대상

#### 1. BattleCommand 인터페이스 추가 (src/types/battle.d.ts)
```typescript
export interface BattleCommand {
  execute(): Promise<TurnActionResult[]>;
  undo(): void;
  getDescription(): string;
  canExecute(): boolean;
}
```

#### 2. Command 구현체 (src/systems/BattleSystem.js 내부)

**AttackCommand**
```typescript
class AttackCommand implements BattleCommand {
  constructor(unit: BattleUnit, targets: BattleUnit[], battleSystem: BattleSystem)
  execute(): TurnActionResult[]
  undo(): void
  getDescription(): string
}
```

**SkillCommand**
```typescript
class SkillCommand implements BattleCommand {
  constructor(unit: BattleUnit, skillIndex: number, targets: BattleUnit[], battleSystem: BattleSystem)
  execute(): TurnActionResult[]
  undo(): void
  canExecute(): boolean
}
```

**DefendCommand**
```typescript
class DefendCommand implements BattleCommand {
  constructor(unit: BattleUnit, battleSystem: BattleSystem)
  execute(): TurnActionResult[]
  undo(): void
  getDescription(): string
}
```

#### 3. BattleSystem 통합
- `executeCommand(command: BattleCommand): TurnActionResult[]` 메서드 추가
- `commandHistory: BattleCommand[]` 배열로 undo/redo 기록
- `processTurn()` 리팩토링: AI가 Command 객체 반환 → executeCommand() 호출

### 변경 내용

#### BattleSystem.js의 `processTurn()` 수정
```typescript
processTurn() {
  const unit = this.getNextUnit();
  const command = this.getAIAction(unit); // → BattleCommand 반환으로 변경
  const result = this.executeCommand(command);
  this.commandHistory.push(command);
  // ...
}
```

#### `executeCommand()` 메서드 신규
```typescript
executeCommand(command: BattleCommand): TurnActionResult[] {
  if (!command.canExecute()) {
    return []; // fallback to basic attack
  }
  return command.execute();
}
```

#### `getAIAction()` 메서드 수정
```typescript
getAIAction(unit: BattleUnit): BattleCommand {
  // 기존 로직 유지하되 Command 객체 반환
  if (shouldAttack) {
    return new AttackCommand(unit, targets, this);
  } else if (shouldUseSkill) {
    return new SkillCommand(unit, skillIndex, targets, this);
  } else if (shouldDefend) {
    return new DefendCommand(unit, this);
  }
}
```

### 이점
- **실행 취소 가능**: 각 Command에 undo() 구현 가능
- **대기열 처리**: 명령 큐 구성 가능 (네트워크 전투 등)
- **로깅**: 각 명령의 getDescription() 호출로 로그 일관성 보장
- **테스트**: Command 단위 테스트 용이
- **확장성**: 새 명령 타입 추가 간단 (DefendCommand, DebuffCommand 등)

### 파일 수정 목록

**신규 생성**
- (없음 - 모두 BattleSystem.js 내부 추가)

**수정 파일**
1. `src/systems/BattleSystem.js`
   - Command 4개 클래스 추가 (AttackCommand, SkillCommand, DefendCommand, 선택사항: BuffCommand)
   - executeCommand() 메서드 추가
   - processTurn() 리팩토링
   - getAIAction() 리팩토링 (Strategy → Command 반환)

2. `src/types/battle.d.ts`
   - BattleCommand 인터페이스 추가
   - BattleSystem.executeCommand() 타입 시그니처 추가

### 제약 조건
- **기존 Strategy 패턴 유지**: Strategy는 Command 내부에서 호출 (중첩 가능)
- **Observer Pattern 호환**: 이벤트 발행은 Command 실행 후 (emit 위치 유지)
- **State Pattern 호환**: 상태 변경은 processTurn()에서 수행 (Command는 순수 액션만)
- **AI 로직 보존**: getAIAction() 리팩토링하되 선택 로직 동일
- **이전 호환성**: 기존 코드에서 processTurn() 호출 방식 변경 없음

### 성공 기준
- ✅ BattleCommand 인터페이스 정의
- ✅ 4개 Command 구현체 완성 (execute/undo/getDescription/canExecute)
- ✅ BattleSystem.executeCommand() 추가
- ✅ processTurn() 리팩토링 완료
- ✅ getAIAction() → BattleCommand 반환으로 변경
- ✅ 기존 BattleEventEmitter, BattleState 호환
- ✅ 기존 SkillStrategy 호환 (Command 내부에서 사용)
- ✅ 타입 체크: `npm run typecheck` 오류 0개
- ✅ 빌드: `npm run build` 성공
- ✅ BattleScene 시나리오 테스트 통과 (턴 진행, 승패 판정)

---

## 준비물 체크리스트

### TSO-3.1 수행 전
- [ ] `src/types/utils.d.ts` 신규 생성 (선택) - 복잡한 함수 타입 집중화
  - animations.d.ts, drawUtils.d.ts 등으로 분할 가능
- [ ] 각 파일별 JSDoc → TypeScript 시그니처 변환 계획

### PAT-1.1 수행 전
- [ ] battle.d.ts에 BattleCommand 인터페이스 추가
- [ ] BattleSystem.js 백업 (기존 로직 보존 확인용)
- [ ] Command 구현체 테스트 케이스 작성 계획
  - AttackCommand.execute() → TurnActionResult[] 반환 확인
  - SkillCommand.canExecute() → 게이지 체크 확인
  - DefendCommand.undo() → 방어 상태 복구 확인

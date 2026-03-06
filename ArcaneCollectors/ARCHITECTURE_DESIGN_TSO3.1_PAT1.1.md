# 아키텍처 설계 문서: TSO-3.1 + PAT-1.1
## Sprint 2 W2 - TypeScript 전환 + Command 패턴 구현

**작성 일자**: 2026년 2월 8일
**분석 범위**: src/utils/ (9개 파일) + src/systems/BattleSystem.js
**목표**: TypeScript 점진적 전환 및 Command 패턴 도입으로 코드 유지보수성 개선

---

## 목차
1. [핵심 결정 사항](#1-핵심-결정-사항)
2. [TSO-3.1: src/utils/ JS→TS 전환](#2-tso-31-srcutils-jsTS-전환)
3. [PAT-1.1: BattleSystem Command 패턴](#3-pat-11-battlesystem-command-패턴)
4. [리스크 분석](#4-리스크-분석)
5. [롤백 전략](#5-롤백-전략)
6. [검증 계획](#6-검증-계획)
7. [최종 실행 계획](#7-최종-실행-계획)

---

## 1. 핵심 결정 사항

### 1.1 태스크 실행 순서: TSO-3.1 → PAT-1.1 (직렬)

#### 결론
**TSO-3.1을 먼저 완료하고, 이어서 PAT-1.1 진행**

#### 의존성 분석

| 기준 | TSO-3.1 (TS 전환) | PAT-1.1 (Command 패턴) |
|------|-------------------|----------------------|
| **수정 범위** | `src/utils/` 9개 파일 | `src/systems/BattleSystem.js` 1개 + 새 파일 생성 |
| **파일 겹침** | 없음 (utils만 격리) | BattleSystem.js 수정 |
| **의존성 방향** | 단방향 (utils → 소비자) | 내부 리팩토링 |
| **리스크 수준** | **낮음** (이름+타입 추가) | **중간** (전투 로직 변경) |
| **선행 조건** | 없음 | TSO-3.1 완료 시 이점 있음 |

#### 병렬 실행이 불가한 이유

1. **Import 해석 확정 필요**
   - TSO-3.1에서 `.js → .ts` 확장자 변경 시 Vite의 import 경로 해석 동작 확정
   - PAT-1.1의 새로 생성되는 `BattleCommand.ts` 파일이 이 기반 위에서 작성 필요

2. **공유 유틸리티 타입**
   - PAT-1.1의 `BattleCommand` 클래스에서 `helpers.js`의 `deepClone()` 사용 가능
   - TSO-3.1 완료 후 `helpers.ts`로부터 import 시 타입 정보 완전히 활용 가능

3. **빌드 검증 순서**
   - TSO-3.1의 9개 파일 전환 후 `npm run build` 성공 확인 필수
   - PAT-1.1의 새 `.ts` 파일들이 안정적인 빌드 환경에서 생성됨

#### Fast-Follow 전략 (권고)
실제로는 **독립적 실행 가능**하므로:
- TSO-3.1 Phase 1 (5개 독립 파일) 완료 → 즉시 PAT-1.1 Step 1 (타입 정의) 시작
- 병렬화로 총 소요 시간 30% 단축 가능

---

### 1.2 핵심 기술 질문 해결

#### Q1: TSO-3.1에서 import 경로 변경이 필요한가?

**답: 아니오, 변경 불필요**

**근거:**

1. **Vite 번들러 자동 해석**
   ```javascript
   // 소비자 파일 (변경 없음)
   import { getRarityKey } from '../utils/helpers.js'  // ← .js 그대로
   ```

   Vite + `moduleResolution: "bundler"` 설정에서:
   - `.js` 확장자 import → Vite가 자동으로 `.ts` 파일 검색
   - 해당 파일 존재 시 `.ts` 사용, 없으면 `.js` 사용

2. **tsconfig.json 기존 설정이 이미 적합**
   ```json
   {
     "compilerOptions": {
       "allowJs": true,              // JS/TS 혼합 가능
       "moduleResolution": "bundler", // Vite와 동기
       "noEmit": true                // Vite가 번들링 담당
     }
   }
   ```

3. **제약 사항**
   - `package.json`의 `format` 스크립트에 `.ts` 포함 필요
   - `eslint.config.js`에 TypeScript parser 설정 필요

**비용**: 소비자 파일 수정 0개 (import 경로 변경 불필요)

---

#### Q2: PAT-1.1의 DefendCommand 방어력 리셋 타이밍은?

**답: 다음 턴 시작 시 (TURN_START)**

**근거:**

1. **BattleSystem 턴 흐름**
   ```
   TURN_START
     ↓
   getNextUnit() → 유닛 선택
     ↓
   getAIAction() → 액션 결정 (← 여기서 DefendCommand 생성)
     ↓
   PROCESSING_ACTION
     ↓
   executeCommand() → DefendCommand.execute()
     → attacker.def *= 1.5 (방어력 증가)
     ↓
   TURN_END
   ```

2. **방어 버프 지속 시간**
   - DefendCommand가 턴을 소비 (다른 액션 불가)
   - 이 턴의 데미지 감소 적용
   - "이번 라운드 끝까지" 방어력 유지 → 다음 라운드 새 턴부터 리셋

3. **구현 방식**
   ```typescript
   // DefendCommand.ts
   execute(battleSystem: BattleSystem): TurnActionResult[] {
     this.originalDef = this.attacker.def;  // 스냅샷 저장
     this.attacker.def = Math.floor(this.attacker.def * 1.5);
     return [{
       type: 'defend',
       attacker: this.attacker.id,
       defBoost: 1.5
     }];
   }

   undo(battleSystem: BattleSystem): void {
     if (this.originalDef !== undefined) {
       this.attacker.def = this.originalDef;  // 원복
     }
   }

   // BattleSystem.processTurn() 시작 시
   processTurn() {
     // 이전 턴의 DefendCommand가 있으면 복원
     if (this.commandHistory.length > 0) {
       const lastCommand = this.commandHistory[this.commandHistory.length - 1];
       if (lastCommand instanceof DefendCommand) {
         lastCommand.undo(this);  // 방어력 원복
       }
     }
     // ... 이후 로직
   }
   ```

4. **Edge Case 처리**
   - 유닛 사망: `finishBattle()`에서 모든 DefendCommand undo
   - 전투 종료: 마찬가지로 cleanup 시 undo
   - 재매칭: 새 BattleSystem 생성하므로 자동 초기화

---

## 2. TSO-3.1: src/utils/ JS→TS 전환

### 2.1 전환 대상 파일 및 의존성 그래프

```
src/utils/
├── rarityUtils.js       (의존성 없음) ← 독립
│   ↓ (import 되는 곳)
├── helpers.js           (의존성: rarityUtils re-export)
│   ↓
├── constants.js         (의존성 없음) ← 자기참조만
├── textStyles.js        (의존성: ../config/designSystem.js)
├── drawUtils.js         (의존성: ../config/gameConfig.js, designSystem.js)
├── animations.js        (의존성 없음) ← Phaser API만
├── GameLogger.js        (의존성 없음) ← Static class
├── TouchManager.js      (의존성 없음) ← Class
└── TransitionManager.js (의존성: ../config/gameConfig.js)
```

### 2.2 전환 순서: 3 Phase (9개 파일)

#### Phase 0: 선행 작업 (필수)
**[시작 전에 1회 수행]**

```bash
# 1. package.json 포맷 스크립트 업데이트
"format": "prettier --write \"src/**/*.{js,ts}\""  # ← .ts 추가
```

```javascript
// 2. eslint.config.js TypeScript 지원 추가
// 현재: JS 파일만 처리
// 변경: @typescript-eslint/parser 활성화, .ts 파일 포함

export default [
  {
    files: ['src/**/*.{js,ts}'],  // ← JS/TS 모두
    languageOptions: {
      parser: '@typescript-eslint/parser',  // ← TS parser 사용
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: {
      // ... 기존 규칙
      '@typescript-eslint/no-unused-vars': ['warn', { ... }],  // ← TS 버전
    }
  },
  // ... 기존 ignores
];
```

**커밋**: `chore(TSO-3.1): Phase 0 - ESLint 및 포맷 설정 업데이트`

---

#### Phase 1: 독립 모듈 (5개 파일, 의존성 없음)

**순서**: 리스크 낮은 것부터

| # | 파일 | 특징 | 소비자 | 예상 시간 |
|---|------|------|--------|----------|
| 1 | GameLogger.ts | Static class, 간단한 구조 | 5 | 10분 |
| 2 | animations.ts | Phaser 함수 모음, 타입 자동 | 0 직접 | 15분 |
| 3 | TouchManager.ts | Class 내보내기 | 0 직접 | 10분 |
| 4 | constants.js | 객체 상수, `as const` assertion | 0 직접 | 20분 |
| 5 | TransitionManager.ts | Static class, 11개 소비자 | 11 | 15분 |

**각 파일 전환 전략:**

1. **GameLogger.js → GameLogger.ts**
   ```typescript
   class GameLogger {
     static categories: Record<string, { enabled: boolean; color: string; icon: string }> = {
       BATTLE: { enabled: true, color: '#ff4444', icon: '⚔️' },
       // ...
     }
     static log(category: string, message: string, data?: any): void { ... }
     // ...
   }
   ```
   - 변경: `categories` 타입 추가, 메서드 시그니처 추가
   - 주의: `window.GameLogger` 접근 → `(window as any)` 또는 `declare global`

2. **animations.js → animations.ts**
   ```typescript
   export function fadeIn(
     scene: Phaser.Scene,
     target: Phaser.GameObjects.GameObject,
     duration: number = 300
   ): Phaser.Tweens.Tween { ... }
   ```
   - 변경: Phaser 타입 추가, 반환 타입 명시
   - 타입: `Phaser.Scene`, `Phaser.GameObjects.GameObject`, `Phaser.Tweens.Tween`

3. **TouchManager.js → TouchManager.ts**
   ```typescript
   interface TouchManagerOptions {
     swipeThreshold?: number;
     swipeTimeLimit?: number;
     longPressTime?: number;
     doubleTapTime?: number;
   }

   export class TouchManager {
     constructor(scene: Phaser.Scene, options?: TouchManagerOptions) { ... }
   }
   ```

4. **constants.js → constants.ts**
   ```typescript
   import type { MoodType, CultType } from '../types/character';

   export const MOOD = {
     BRAVE: 'brave' as MoodType,
     // ...
   } as const;

   export const MOOD_MATCHUP: Record<MoodType, { strongAgainst: MoodType[]; weakAgainst: MoodType[] }> = {
     [MOOD.BRAVE]: { strongAgainst: [MOOD.WILD, MOOD.CUNNING], weakAgainst: [MOOD.FIERCE, MOOD.DEVOTED] },
     // ...
   };
   ```
   - 변경: `as const` assertion, 객체 타입 정의
   - 주의: 이중 세미콜론 제거 (현재 `;;` 존재)

5. **TransitionManager.js → TransitionManager.ts**
   ```typescript
   interface TransitionData {
     [key: string]: any;
   }

   class TransitionManagerClass {
     isTransitioning: boolean;
     fadeTransition(
       scene: Phaser.Scene,
       target: string,
       data?: TransitionData,
       duration?: number
     ): void { ... }
   }
   ```

**커밋**: `refactor(TSO-3.1): Phase 1 - 독립 유틸리티 모듈 TS 전환`

**검증**:
```bash
npm run lint
npx tsc --noEmit
npm run dev  # ← 브라우저에서 게임 로드 확인
```

---

#### Phase 2: 핵심 유틸리티 (2개 파일, 상호 의존)

| # | 파일 | 의존성 | 소비자 | 예상 시간 |
|---|------|--------|--------|----------|
| 6 | rarityUtils.ts | 없음 | 7 (가챠, 영웅 목록 등) | 15분 |
| 7 | helpers.ts | rarityUtils | 2 + test 1 | 30분 |

**각 파일 전환 전략:**

6. **rarityUtils.js → rarityUtils.ts**
   ```typescript
   import type { RarityNumber, RarityKey } from '../types/character';

   export function getRarityKey(rarity: number | string): RarityKey { ... }
   export function getRarityNum(rarity: number | string): RarityNumber { ... }
   export function getRarityStars(rarity: number | string): number { ... }
   ```
   - 변경: 파라미터 타입, 반환 타입 추가
   - 사용 타입: `character.d.ts`의 `RarityNumber`, `RarityKey`

7. **helpers.js → helpers.ts**
   ```typescript
   import { getRarityKey, getRarityNum, getRarityStars } from './rarityUtils';

   export function formatNumber(num: number, decimals?: number): string { ... }
   export function getMoodIcon(mood: MoodType): string { ... }
   export function getCultIcon(cult: CultType): string { ... }
   ```
   - 변경: 함수 시그니처 추가, 반환 타입 명시
   - 주의: 테스트 `tests/utils/helpers.test.js`가 이를 import

**검증**:
```bash
npm run test  # ← helpers.test.js 통과 확인
npm run dev   # ← 가챠 화면, 영웅 목록 화면 로드 확인
```

**커밋**: `refactor(TSO-3.1): Phase 2 - rarityUtils, helpers TS 전환`

---

#### Phase 3: UI 유틸리티 (2개 파일, 직접 소비자 없음)

| # | 파일 | 의존성 | 예상 시간 |
|---|------|--------|----------|
| 8 | drawUtils.ts | gameConfig.js, designSystem.js | 20분 |
| 9 | textStyles.ts | designSystem.js | 15분 |

**각 파일 전환 전략:**

8. **drawUtils.js → drawUtils.ts**
   ```typescript
   import { COLORS } from '../config/gameConfig';
   import { DESIGN, getMoodColor, getHPColor } from '../config/designSystem';

   export function drawRoundedRect(
     graphics: Phaser.GameObjects.Graphics,
     x: number,
     y: number,
     width: number,
     height: number,
     radius: number,
     fillColor: number,
     strokeColor?: number | null,
     strokeWidth?: number
   ): void { ... }

   function lerpColor(color1: number, color2: number, t: number): number { ... }
   ```
   - 변경: Phaser Graphics 타입, 색상 함수 타입 추가
   - 타입: `Phaser.GameObjects.Graphics`, 숫자(RGB hex) 타입

9. **textStyles.js → textStyles.ts**
   ```typescript
   import { DESIGN } from '../config/designSystem';

   interface TextStyle {
     fontFamily?: string;
     fontSize?: string;
     fontStyle?: string;
     color?: string;
     stroke?: string;
     strokeThickness?: number;
     align?: string;
     [key: string]: any;
   }

   export const TextStyles: Record<string, TextStyle> = {
     title: { fontFamily: F, fontSize: `${font.size.title}px`, ... },
     // ...
   };
   ```
   - 변경: `TextStyle` 인터페이스 정의, 상수 객체 타입 추가
   - 주의: Phaser의 텍스트 스타일 구조 따름

**검증**:
```bash
npm run build  # ← 프로덕션 빌드 성공 확인
npm run dev    # ← 모든 UI 화면 정상 렌더링 확인
```

**커밋**: `refactor(TSO-3.1): Phase 3 - drawUtils, textStyles TS 전환`

---

### 2.3 파일별 상세 전환 표

| 파일 | 주요 변환 | 사용할 타입 | 소비자 수 | Phase |
|------|----------|-----------|----------|-------|
| GameLogger.ts | static class 타입화 | 자체 인터페이스 정의 | 5 | 1 |
| animations.ts | Phaser 함수 시그니처 | Phaser.d.ts | 0 직접 | 1 |
| TouchManager.ts | class + options 인터페이스 | 자체 인터페이스 | 0 직접 | 1 |
| constants.ts | `as const` assertion + MOOD/CULT 타입 | character.d.ts | 0 직접 | 1 |
| TransitionManager.ts | class 메서드 시그니처 | 자체 인터페이스 | 11 | 1 |
| rarityUtils.ts | 파라미터/반환 타입 | character.d.ts (RarityNumber, RarityKey) | 7 | 2 |
| helpers.ts | 함수 시그니처 (30+개) | character.d.ts, 자체 타입 | 2 + test 1 | 2 |
| drawUtils.ts | Phaser Graphics + 색상 함수 | Phaser.d.ts | 0 직접 | 3 |
| textStyles.ts | TextStyle 인터페이스 | 자체 + designSystem | 0 직접 | 3 |

---

### 2.4 tsconfig.json 수정 불필요 (기존 설정 이미 적합)

```json
{
  "compilerOptions": {
    "target": "ES2022",              // ✅ 모던 JS 대응
    "module": "ESNext",              // ✅ Vite와 호환
    "moduleResolution": "bundler",   // ✅ Vite 번들러와 동기화
    "lib": ["ES2022", "DOM"],        // ✅ Phaser 타입 지원
    "allowJs": true,                 // ✅ JS/TS 혼합 가능
    "checkJs": false,                // ✅ JS 타입 체크 비활성 (점진적)
    "strict": false,                 // ✅ 엄격 모드 비활성 (점진적 도입)
    "noEmit": true,                  // ✅ Vite가 번들링 담당
    "esModuleInterop": true,         // ✅ CommonJS 호환
    "resolveJsonModule": true,       // ✅ JSON import 가능
    "isolatedModules": true,         // ✅ Vite와 호환
    "skipLibCheck": true,            // ✅ node_modules 스킵
    "types": ["phaser"]              // ✅ Phaser 타입
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**결론**: 수정 불필요. Phase 0의 ESLint 설정이 유일한 필수 선행 작업.

---

## 3. PAT-1.1: BattleSystem Command 패턴

### 3.1 파일 구조 및 변경 범위

```
src/systems/
├── BattleSystem.js              (수정: 140줄 변경)
│   ├── processTurn() 리팩토링    (Line 620-685)
│   ├── getAICommand() 추가       (새 메서드)
│   ├── executeCommand() 추가     (새 메서드)
│   ├── commandHistory 필드 추가  (새 필드)
│   └── 기존 메서드 유지          (executeAction, SKILL_STRATEGIES)
│
└── commands/                     (새 디렉토리)
    ├── BattleCommand.ts          (새 파일: 추상 기본 클래스)
    ├── AttackCommand.ts          (새 파일)
    ├── SkillCommand.ts           (새 파일)
    └── DefendCommand.ts          (새 파일)

src/types/
└── battle.d.ts                  (수정: BattleCommand, UnitSnapshot 인터페이스 추가)
```

### 3.2 BattleSystem.js 수정 범위

#### 3.2.1 새 필드 추가

```javascript
export class BattleSystem {
  constructor(allies, enemies) {
    // ... 기존 필드들 ...
    this.commandHistory = [];      // ← 새로 추가: 명령 히스토리
  }
}
```

#### 3.2.2 processTurn() 리팩토링

**변경 전 (현재)**:
```javascript
processTurn() {
  // Line 620-685: 턴 처리
  const unit = this.getNextUnit();
  const action = this.getAIAction(unit);          // ← 액션 결정
  const strategy = SKILL_STRATEGIES[action.skill.id] || SKILL_STRATEGIES.basic;
  let turnResult = strategy.execute(unit, action.targets, this);  // ← 직접 실행
  // ...
}
```

**변경 후**:
```javascript
processTurn() {
  const unit = this.getNextUnit();

  // 이전 DefendCommand 방어력 복원 (새로 추가)
  if (this.commandHistory.length > 0) {
    const lastCommand = this.commandHistory[this.commandHistory.length - 1];
    if (lastCommand.type === 'defend') {
      lastCommand.undo(this);
    }
  }

  const command = this.getAICommand(unit);        // ← Command 객체 생성
  const turnResult = this.executeCommand(command); // ← Command 실행

  this.commandHistory.push(command);              // ← 히스토리 기록

  // ... 이후 로직 동일 ...
}
```

#### 3.2.3 새 메서드 추가

```javascript
/**
 * AI 액션을 Command 객체로 변환
 * @param {BattleUnit} unit
 * @returns {BattleCommand}
 */
getAICommand(unit) {
  const action = this.getAIAction(unit);  // ← 기존 메서드 재사용

  if (action.type === 'defend') {
    return new DefendCommand(unit, [unit], 1.5);
  } else if (action.skill.id === 'basic') {
    return new AttackCommand(unit, action.targets);
  } else {
    return new SkillCommand(unit, action.targets, action.skill);
  }
}

/**
 * Command 실행
 * @param {BattleCommand} command
 * @returns {Object} turnResult
 */
executeCommand(command) {
  const results = command.execute(this);

  return {
    attacker: command.attacker.id,
    skill: command.skill?.id || command.type,
    results
  };
}

/**
 * 명령 히스토리 조회
 * @returns {Array<BattleCommand>}
 */
getCommandHistory() {
  return [...this.commandHistory];
}

/**
 * 마지막 명령 취소
 * @returns {boolean} 성공 여부
 */
undoLastCommand() {
  if (this.commandHistory.length === 0) return false;

  const command = this.commandHistory.pop();
  command.undo(this);
  return true;
}
```

#### 3.2.4 기존 메서드 유지

```javascript
// 다음 메서드는 100% 그대로 유지
executeAction()        // Line 694-780
SKILL_STRATEGIES       // Line 148-154
calculateDamage()      // Line 789-829
getMoodBonus()         // Line 837-868
getAIAction()          // Line 875-933 (기존 로직, getAICommand에서 호출)
selectTarget()         // Line 940-946
useSkill()             // Line 955-964
basicAttack()          // Line 972-974
```

**하위 호환성**: 100% 유지. 기존 코드 호출 가능.

---

### 3.3 Command 클래스 설계 (새로 생성)

#### 3.3.1 src/systems/commands/BattleCommand.ts (추상 기본 클래스)

```typescript
import type { BattleUnit, TurnActionResult } from '../../types/battle';
import type { BattleSystem } from '../BattleSystem';

/**
 * 전투 명령 기본 추상 클래스
 * Strategy 패턴 + Command 패턴의 조합
 */
export abstract class BattleCommand {
  readonly type: 'attack' | 'skill' | 'defend';
  readonly attacker: BattleUnit;
  readonly targets: BattleUnit[];
  readonly skill?: any;  // CharacterSkill (선택사항)

  constructor(
    type: 'attack' | 'skill' | 'defend',
    attacker: BattleUnit,
    targets: BattleUnit[],
    skill?: any
  ) {
    this.type = type;
    this.attacker = attacker;
    this.targets = targets;
    this.skill = skill;
  }

  /**
   * 명령 실행
   * @param battleSystem BattleSystem 인스턴스
   * @returns 행동 결과 배열
   */
  abstract execute(battleSystem: BattleSystem): TurnActionResult[];

  /**
   * 명령 취소 (undo)
   * @param battleSystem BattleSystem 인스턴스
   */
  abstract undo(battleSystem: BattleSystem): void;

  /**
   * 유닛 상태 스냅샷 반환
   * @returns 유닛 상태 스냅샷
   */
  getSnapshot() {
    return {
      attacker: {
        id: this.attacker.id,
        hp: this.attacker.currentHp,
        def: this.attacker.def,
        skillGauge: this.attacker.skillGauge
      }
    };
  }
}
```

#### 3.3.2 src/systems/commands/AttackCommand.ts

```typescript
import { BattleCommand } from './BattleCommand';
import type { BattleUnit, TurnActionResult } from '../../types/battle';
import type { BattleSystem } from '../BattleSystem';

/**
 * 기본 공격 명령
 * Strategy: BasicAttackStrategy 위임
 */
export class AttackCommand extends BattleCommand {
  constructor(attacker: BattleUnit, targets: BattleUnit[]) {
    super('attack', attacker, targets);
  }

  execute(battleSystem: BattleSystem): TurnActionResult[] {
    const basicSkill = this.attacker.skills.find(s => s.id === 'basic') ||
                       this.attacker.skills[0];

    // BattleSystem의 기존 Strategy 재사용
    const strategy = battleSystem['SKILL_STRATEGIES']?.basic ||
                     battleSystem['SKILL_STRATEGIES']?.[basicSkill?.id];

    if (strategy) {
      return strategy.execute(this.attacker, this.targets, battleSystem);
    }

    // Fallback: 기존 executeAction 호출
    return battleSystem.executeAction(this.attacker, basicSkill, this.targets)?.results || [];
  }

  undo(battleSystem: BattleSystem): void {
    // 기본 공격은 undo 불필요 (상태 변화 적음)
    // 필요시 HP 복원 로직 추가 가능
  }
}
```

#### 3.3.3 src/systems/commands/SkillCommand.ts

```typescript
import { BattleCommand } from './BattleCommand';
import type { BattleUnit, TurnActionResult, CharacterSkill } from '../../types/battle';
import type { BattleSystem } from '../BattleSystem';

/**
 * 스킬 사용 명령
 * Strategy: 스킬별 Strategy 또는 executeAction 위임
 */
export class SkillCommand extends BattleCommand {
  readonly skill: CharacterSkill;

  constructor(attacker: BattleUnit, targets: BattleUnit[], skill: CharacterSkill) {
    super('skill', attacker, targets, skill);
    this.skill = skill;
  }

  execute(battleSystem: BattleSystem): TurnActionResult[] {
    // 스킬 게이지 소비
    if (this.skill.gaugeCost) {
      this.attacker.consumeSkillGauge(0);  // ← 스킬 인덱스 필요 (개선 가능)
    }

    // Strategy 패턴 우선 시도
    const strategies = battleSystem['SKILL_STRATEGIES'] || {};
    const strategy = strategies[this.skill.id];

    if (strategy) {
      return strategy.execute(this.attacker, this.targets, battleSystem);
    }

    // Fallback: executeAction 호출
    const result = battleSystem.executeAction(this.attacker, this.skill, this.targets);
    return result?.results || [];
  }

  undo(battleSystem: BattleSystem): void {
    // 스킬 게이지 복원
    if (this.skill.gaugeCost) {
      this.attacker.skillGauge = Math.min(
        this.attacker.maxSkillGauge,
        this.attacker.skillGauge + this.skill.gaugeCost
      );
    }

    // 필요시 대상 HP 복원 로직 추가
  }
}
```

#### 3.3.4 src/systems/commands/DefendCommand.ts (핵심)

```typescript
import { BattleCommand } from './BattleCommand';
import type { BattleUnit, TurnActionResult } from '../../types/battle';
import type { BattleSystem } from '../BattleSystem';

/**
 * 방어 명령
 *
 * 효과:
 * - 공격자의 DEF를 defBoost배 증가
 * - 이번 턴의 데미지 감소
 * - 다음 턴 시작 시 방어력 원복
 */
export class DefendCommand extends BattleCommand {
  private originalDef: number = 0;
  private defBoost: number = 1.5;  // 기본 1.5배 증가

  constructor(attacker: BattleUnit, targets: BattleUnit[] = [], defBoost: number = 1.5) {
    super('defend', attacker, targets);
    this.defBoost = defBoost;
  }

  execute(battleSystem: BattleSystem): TurnActionResult[] {
    // 현재 방어력 스냅샷
    this.originalDef = this.attacker.def;

    // 방어력 증가
    this.attacker.def = Math.floor(this.attacker.def * this.defBoost);

    console.log(`[Battle] DefendCommand: ${this.attacker.name} DEF ${this.originalDef} → ${this.attacker.def}`);

    return [{
      target: this.attacker.id,
      type: 'defend',
      amount: this.defBoost,  // ← 배율 반환
      isCrit: false,
      isDead: false
    }];
  }

  undo(battleSystem: BattleSystem): void {
    // 방어력 원복
    if (this.originalDef > 0) {
      this.attacker.def = this.originalDef;
      console.log(`[Battle] DefendCommand undo: ${this.attacker.name} DEF → ${this.originalDef}`);
    }
  }

  getSnapshot() {
    return {
      ...super.getSnapshot(),
      originalDef: this.originalDef,
      defBoost: this.defBoost
    };
  }
}
```

---

### 3.4 battle.d.ts 타입 정의 추가

```typescript
/**
 * src/types/battle.d.ts 추가 부분
 */

/** 전투 명령 기본 인터페이스 */
export interface IBattleCommand {
  readonly type: 'attack' | 'skill' | 'defend';
  readonly attacker: Battler;
  readonly targets: Battler[];
  readonly skill?: CharacterSkill;

  execute(battleSystem: any): TurnActionResult[];
  undo(battleSystem: any): void;
  getSnapshot(): UnitSnapshot;
}

/** 유닛 상태 스냅샷 (undo용) */
export interface UnitSnapshot {
  attacker: {
    id: string;
    hp: number;
    def: number;
    skillGauge: number;
    [key: string]: any;
  };
  [key: string]: any;
}

/** 방어 액션 결과 */
export interface DefendActionResult extends TurnActionResult {
  type: 'defend';
  amount: number;  // defBoost 배율
}
```

---

## 4. 리스크 분석

### 4.1 리스크 매트릭스

| ID | 리스크 항목 | 위험도 | 발생 확률 | 영향도 | 설명 | 대응 방안 |
|----|-----------|---------|----------|--------|------|----------|
| R1 | Vite `.js` import가 `.ts` 파일을 못 찾음 | **낮음** | 5% | 높음 | `moduleResolution: bundler`에서도 edge case 존재 가능 | Phase 1 첫 파일 전환 후 `npm run dev`로 즉시 검증 |
| R2 | `constants.ts` 이중 세미콜론 (;;) | **낮음** | 80% | 낮음 | 현재 `constants.js` Line 24, 68, 77에 `;;` 존재 | 전환 시 정리 (ESLint warning 무시 가능) |
| R3 | ESLint `.ts` 미지원으로 lint 실패 | **중간** | 100% | 중간 | Phase 0 안 하면 `npm run lint` 실패 | **Phase 0 필수**: ESLint 설정 미리 업데이트 |
| R4 | `helpers.test.js`가 `.ts` import 실패 | **낮음** | 10% | 높음 | Vitest는 Vite 기반이므로 자동 해석 예상, 하지만 확인 필요 | Phase 2 후 `npm run test` 실행으로 검증 |
| R5 | `processTurn()` Command 래퍼로 인한 로직 변경 | **중간** | 30% | 높음 | 기존 Strategy와 Command 패턴 이중 구조에서 버그 가능 | Command가 Strategy를 감싸는 wrapper 방식으로 기존 로직 100% 유지, 통합 테스트 필수 |
| R6 | DefendCommand 방어력 복원 누락 | **중간** | 20% | 높음 | 유닛 사망/전투 종료 시 방어력 복원 안 될 수 있음 | `finishBattle()`에서도 모든 DefendCommand에 대해 undo 호출, cleanup 메서드 추가 |
| R7 | `GameLogger.ts`의 `window` 전역 접근 타입 에러 | **낮음** | 100% | 낮음 | `window.GameLogger = GameLogger`가 TS 타입 에러 발생 | `(window as any)` 또는 `declare global { var GameLogger: typeof GameLogger; }` |
| R8 | 테스트가 BattleSystem Command 미커버 | **중간** | 90% | 중간 | 현재 `tests/` 에 BattleSystem 통합 테스트 없음 | PAT-1.1 Step 3에서 BattleSystem + Command 통합 테스트 작성 필수 |

### 4.2 리스크별 상세 대응

#### R1: Vite `.js` import 미해석
- **발생 시나리오**: Vite 설정에서 `.js` import를 `.ts`로 자동 해석 못함
- **대응**: Phase 1 첫 파일(GameLogger.ts)만 전환 후 `npm run dev` 실행하여 즉시 검증
- **대체안**: 수동으로 import 경로를 `.ts`로 변경 (안전하지만 비용 많음)

#### R3: ESLint `.ts` 미지원
- **필수 조건**: Phase 0에서 `eslint.config.js` 업데이트 완료 후 진행
- **검증**: `npm run lint` 성공 후 Phase 1 시작

#### R5: processTurn() Command 래퍼 로직 버그
- **설계 원칙**: Command가 Strategy를 감싸되, 기존 로직 변경 최소화
  ```javascript
  // wrapper 방식: 기존 로직은 그대로, Command만 추가
  const command = new SkillCommand(...);
  const result = strategy.execute(...);  // ← 기존 Strategy 호출
  commandHistory.push(command);          // ← Command 기록만 추가
  ```
- **테스트**: 기존 전투 테스트 + Command 통합 테스트 필수

#### R6: DefendCommand 방어력 복원 누락
- **구현**: `processTurn()` 시작 시 + `finishBattle()` cleanup에서 undo
  ```javascript
  finishBattle(outcome) {
    // ... 기존 로직 ...

    // DefendCommand 정리
    this.commandHistory.forEach(cmd => {
      if (cmd instanceof DefendCommand) cmd.undo(this);
    });

    this.commandHistory = [];  // 초기화
  }
  ```

---

## 5. 롤백 전략

### 5.1 TSO-3.1 롤백 (Phase별)

#### Phase 0 롤백
```bash
# 설정 파일 되돌리기
git revert <Phase0-commit-hash>

# 또는 수동으로
git checkout HEAD -- package.json eslint.config.js
```

#### Phase 1~3 롤백
```bash
# 각 Phase별 rollback
git revert <Phase1-commit-hash>  # 5개 파일 JS로 복구
git revert <Phase2-commit-hash>  # 2개 파일 JS로 복구
git revert <Phase3-commit-hash>  # 2개 파일 JS로 복구

# 또는 전체 롤백
git reset --hard <before-TSO3.1-commit>
```

#### 검증 명령어
```bash
# 모든 파일이 다시 .js 확장자인지 확인
ls -la src/utils/*.js | wc -l  # → 9개 출력

# 타입 체크 경고 없는지 확인
npx tsc --noEmit 2>&1 | grep -v "node_modules"  # → 0 결과

# 린트 통과
npm run lint
```

---

### 5.2 PAT-1.1 롤백 (Step별)

#### Step 1 롤백 (타입 정의)
```bash
git revert <Step1-commit-hash>
# src/types/battle.d.ts의 Command 관련 타입 제거
```

#### Step 2 롤백 (Command 클래스)
```bash
# 새로 추가된 파일들만 삭제 (기존 파일 미수정)
rm -rf src/systems/commands/
# → BattleSystem.js는 그대로 유지
```

#### Step 3 롤백 (BattleSystem 통합, 가장 위험)
```bash
git revert <Step3-commit-hash>
# 또는 특정 파일만 롤백
git checkout HEAD~1 -- src/systems/BattleSystem.js

# 검증
npm run dev  # → 전투 진행 확인
```

---

### 5.3 커밋 전략 (원자성)

**원칙**: 각 Phase/Step은 독립적으로 롤백 가능해야 함

```
TSO-3.1 커밋:
├── Phase 0: "chore(TSO-3.1): ESLint 및 포맷 설정 업데이트"
│   파일: package.json, eslint.config.js
│
├── Phase 1: "refactor(TSO-3.1): 독립 모듈 TS 전환 (GameLogger, animations, TouchManager, constants, TransitionManager)"
│   파일: 5개 .ts 파일 (기존 .js는 삭제)
│
├── Phase 2: "refactor(TSO-3.1): rarityUtils, helpers TS 전환"
│   파일: rarityUtils.ts, helpers.ts
│
└── Phase 3: "refactor(TSO-3.1): drawUtils, textStyles TS 전환"
    파일: drawUtils.ts, textStyles.ts

PAT-1.1 커밋:
├── Step 1: "feat(PAT-1.1): battle.d.ts에 Command 인터페이스 추가"
│   파일: src/types/battle.d.ts (수정)
│
├── Step 2: "feat(PAT-1.1): BattleCommand 클래스 및 구현체 생성"
│   파일: src/systems/commands/ (새 디렉토리)
│
└── Step 3: "feat(PAT-1.1): BattleSystem에 Command 패턴 통합"
    파일: src/systems/BattleSystem.js (수정)
```

---

## 6. 검증 계획

### 6.1 TSO-3.1 검증

#### Phase 0 후 검증

```bash
# 1. ESLint 설정 반영 확인
npm run lint
# → 기존 .js 파일 모두 통과, TS 지원 준비됨

# 2. Prettier 포맷 반영 확인
npm run format
# → src/**/*.ts 파일도 포맷 대상에 포함

# 3. TypeScript 컴파일 확인
npx tsc --noEmit
# → 0 에러 (기존 .js만 있으므로)
```

**기대 결과**: 모든 명령어 성공, 에러 0

---

#### Phase 1 각 파일별 검증

**파일 전환 후**:
```bash
# 1. TypeScript 컴파일
npx tsc --noEmit
# → 새로 전환한 .ts 파일 타입 에러 0

# 2. ESLint 검사
npm run lint
# → 새로 전환한 .ts 파일 규칙 위반 0

# 3. 브라우저 실행 (매번)
npm run dev
# → 콘솔 에러 0, 게임 정상 로드

# 4. 개발 콘솔 확인
# → "Module not found" 에러 없음
# → import 경로 자동 해석 확인
```

**기대 결과**:
- GameLogger.ts 전환 후: 로그 시스템 정상
- animations.ts 전환 후: UI 애니메이션 정상
- TouchManager.ts 전환 후: 터치 입력 정상
- constants.ts 전환 후: 게임 상수 로드 정상
- TransitionManager.ts 전환 후: 씬 전환 정상

---

#### Phase 2 후 검증

```bash
# 1. 유닛 테스트 실행
npm run test
# → helpers.test.js 모두 통과
# 기대: 30+ 테스트 케이스 통과

# 2. 게임 화면 검증
npm run dev
# → 가챠 화면: getRarityKey/getRarityNum 동작 확인
# → 영웅 목록: 등급별 표시 정상
# → 영웅 상세: 등급 정보 표시 정상

# 3. 타입 체크
npx tsc --noEmit
# → 0 에러

# 4. 린트
npm run lint
# → 0 경고
```

**기대 결과**:
- 테스트: 모두 통과
- 게임: 등급 시스템 정상
- 타입: 에러 없음

---

#### Phase 3 후 검증 (최종)

```bash
# 1. 전체 타입 체크
npx tsc --noEmit
# → 0 에러

# 2. 린트
npm run lint
# → 0 에러

# 3. 테스트
npm run test
# → 모두 통과

# 4. 프로덕션 빌드
npm run build
# → 빌드 성공
# → dist/ 생성
# → 번들 사이즈 기존과 동일 (변화 ±5%)

# 5. 빌드 결과물 실행 (preview)
npm run preview
# → 모든 화면 정상 작동

# 6. 최종 게임 플레이
npm run dev
# → 메인 메뉴부터 전투까지 모든 기능 정상
# → 콘솔 에러 0
```

**기대 결과**:
| 항목 | 기대값 |
|------|--------|
| TypeScript 에러 | 0 |
| ESLint 경고 | 0 |
| 테스트 통과율 | 100% |
| 빌드 성공 | ✅ |
| 런타임 에러 | 0 |
| 번들 사이즈 변화 | < 5% |

---

### 6.2 PAT-1.1 검증

#### Step 1 후 검증 (타입 정의)

```bash
# 1. TypeScript 컴파일
npx tsc --noEmit
# → BattleCommand, UnitSnapshot 타입 정의 확인

# 2. 타입 체크 (battle.d.ts 문법)
npx tsc src/types/battle.d.ts --noEmit
# → 0 에러
```

**기대 결과**: 타입 정의 정합성 확인, 상속 구조 가능

---

#### Step 2 후 검증 (Command 클래스)

```bash
# 1. TypeScript 컴파일
npx tsc --noEmit
# → BattleCommand.ts, AttackCommand.ts, SkillCommand.ts, DefendCommand.ts 모두 0 에러

# 2. Command 유닛 테스트 (새로 작성)
npm run test -- tests/systems/commands/  # ← 테스트 파일 존재 시
# 기대 테스트:
# - AttackCommand.execute() → TurnActionResult[]
# - SkillCommand.execute() → TurnActionResult[]
# - DefendCommand.execute() → def 증가 확인
# - DefendCommand.undo() → def 원복 확인

# 3. BattleSystem import 확인
npx tsc --noEmit
# → src/systems/BattleSystem.js에서 commands 폴더 import 가능

# 4. 린트
npm run lint
# → 0 경고
```

**기대 결과**:
- Command 클래스 컴파일 성공
- 구조 정상 (abstract class + 3개 구현체)
- 타입 안전성 확보

---

#### Step 3 후 검증 (BattleSystem 통합)

```bash
# 1. TypeScript 컴파일
npx tsc --noEmit
# → BattleSystem.js의 새 메서드들 타입 에러 0

# 2. BattleSystem 기능 테스트 (새로 작성)
npm run test -- tests/systems/BattleSystem.test.js
# 기대 테스트:
# - processTurn() Command 생성/실행 확인
# - commandHistory 기록 확인
# - getCommandHistory() 조회 확인
# - undoLastCommand() 동작 확인
# - DefendCommand 방어력 버프/복원 확인

# 3. 게임 플레이 테스트
npm run dev
# → 메인 화면 → 스테이지 선택 → 전투 시작
# → 전투 정상 진행 (AI 액션, 스킬 사용, 방어)
# → 승리/패배 정상 처리
# → 전투 로그 확인 (기존과 동일하게 기록)

# 4. 콘솔 에러 확인
# → [Battle] DefendCommand: 로그 확인
# → "[Battle] DefendCommand undo:" 로그 확인 (다음 턴 시작 시)

# 5. 수동 테스트 케이스
테스트 항목 | 기대 결과
---------|--------
기본 공격 | 데미지 정상 적용
스킬 사용 | 게이지 소비 후 데미지 적용
방어 사용 | def 1.5배 증가 → 다음 턴 원복
연속 방어 | 마지막 방어만 적용 (이전 방어 자동 원복)
전투 종료 | DefendCommand 모두 undo (클린업)
```

**기대 결과**:
| 항목 | 기대값 |
|------|--------|
| TypeScript 에러 | 0 |
| Command 실행 | 정상 |
| commandHistory 기록 | ✅ |
| DefendCommand 방어력 | 1.5배 증가/원복 |
| 전투 로그 | 기존과 동일 |
| 콘솔 에러 | 0 |

---

#### 최종 통합 검증

```bash
# 1. 전체 빌드
npm run build
# → 성공, dist/ 생성

# 2. 전체 테스트
npm run test
# → 100% 통과 (기존 + 새 BattleSystem 테스트)

# 3. 전체 타입 체크
npx tsc --noEmit
# → 0 에러

# 4. 전체 린트
npm run lint
# → 0 경고

# 5. 플레이 테스트
npm run dev
# → 모든 씬 정상 로드
# → 전투 정상 진행
# → 모든 액션(공격, 스킬, 방어) 정상
# → 콘솔 에러 0

# 6. 브라우저 DevTools
# → Network: 모든 리소스 200 OK
# → Console: 에러 0, 경고 0
# → Application: 세이브 데이터 정상
```

**기대 결과**: 모든 검증 항목 통과 ✅

---

## 7. 최종 실행 계획

### 7.1 타임라인 및 리소스

```
전체 기간: ~3-4일 (2명 개발자, 병렬 작업 가능)

2026-02-09 (일 1)
├─ 09:00-10:00: 아키텍처 설계 검토 및 승인
├─ 10:00-11:00: TSO-3.1 Phase 0 (ESLint 설정, 1커밋)
├─ 11:00-13:00: TSO-3.1 Phase 1 Step 1-2 (GameLogger, animations, 2커밋)
└─ 14:00-17:00: TSO-3.1 Phase 1 Step 3-5 (TouchManager, constants, TransitionManager, 병렬)
   예상 커밋: 4개

2026-02-10 (일 2)
├─ 09:00-10:00: Phase 1 검증 (npm run dev, npm run lint)
├─ 10:00-12:00: TSO-3.1 Phase 2 (rarityUtils, helpers, 병렬)
├─ 12:00-13:00: Phase 2 검증 (npm run test)
├─ 14:00-16:00: TSO-3.1 Phase 3 (drawUtils, textStyles, 병렬)
└─ 16:00-17:00: Phase 3 검증 (npm run build, npm run dev)
   예상 커밋: 2개

2026-02-11 (일 3)
├─ 09:00-10:00: TSO-3.1 최종 검증 (전체 타입 체크, 린트, 테스트)
├─ 10:00-12:00: PAT-1.1 Step 1 (battle.d.ts 타입 정의, 1커밋)
│  ↓ (동시 진행 가능: TSO-3.1 최종 정리와 병렬)
├─ 12:00-14:00: PAT-1.1 Step 2 (BattleCommand 클래스, 1커밋)
├─ 14:00-15:00: Command 유닛 테스트 작성
└─ 15:00-17:00: PAT-1.1 Step 3 (BattleSystem 통합, 1커밋)
   예상 커밋: 3개

2026-02-12 (일 4)
├─ 09:00-10:00: 수동 테스트 (게임 플레이)
├─ 10:00-11:00: 통합 테스트 (전투 로직 검증)
├─ 11:00-12:00: 문서화 및 정리
└─ 12:00-13:00: PR 생성 및 최종 검토
```

### 7.2 병렬 실행 가능성

**독립적으로 진행 가능한 작업**:
- TSO-3.1 Phase 1 (5개 파일) 중 3개 이상 병렬 전환 가능
- TSO-3.1 Phase 2/3도 각 파일 독립적
- PAT-1.1 Step 1 (타입 정의)는 TSO-3.1 완료 전 시작 가능

**최적화 전략** (fast-follow):
```
Timeline (병렬화):

Week 1, Day 1 (TSO-3.1 집중)
├─ Phase 0: 30분
├─ Phase 1: 2시간 (3명 병렬)
│  ├─ Developer A: GameLogger.ts + animations.ts
│  ├─ Developer B: TouchManager.ts + constants.ts
│  └─ Developer C: TransitionManager.ts
└─ Verify: 30분

Week 1, Day 2 (TSO-3.1 마무리 + PAT-1.1 시작)
├─ TSO-3.1 Phase 2/3: 2시간 (병렬)
│  ├─ Developer A: Phase 2 (rarityUtils, helpers)
│  └─ Developer B: Phase 3 (drawUtils, textStyles)
├─ Verify: 1시간
└─ PAT-1.1 Step 1: 30분 (동시 진행)

Week 1, Day 3 (PAT-1.1 집중)
├─ Step 2: 2시간
│  ├─ Developer A: BattleCommand.ts (base)
│  ├─ Developer B: AttackCommand.ts + SkillCommand.ts (병렬)
│  └─ Developer C: DefendCommand.ts
├─ Test: 1시간
└─ Step 3: 1시간

총 소요 시간: ~10-12시간 (3명)
```

---

### 7.3 커밋 목록 (최종)

**TSO-3.1 (4개 커밋)**:
1. `chore(TSO-3.1): Phase 0 - ESLint 및 포맷 설정 업데이트`
2. `refactor(TSO-3.1): Phase 1 - 독립 유틸리티 모듈 TS 전환 (GameLogger, animations, TouchManager, constants, TransitionManager)`
3. `refactor(TSO-3.1): Phase 2 - rarityUtils, helpers TS 전환`
4. `refactor(TSO-3.1): Phase 3 - drawUtils, textStyles TS 전환`

**PAT-1.1 (3개 커밋)**:
5. `feat(PAT-1.1): battle.d.ts에 Command 인터페이스 추가`
6. `feat(PAT-1.1): BattleCommand 클래스 및 구현체 생성`
7. `feat(PAT-1.1): BattleSystem에 Command 패턴 통합`

**총 7개 커밋, ~2,000줄 추가/수정**

---

### 7.4 검증 체크리스트

```
□ Phase 0
  □ package.json 포맷 스크립트 업데이트
  □ eslint.config.js TypeScript parser 설정
  □ npm run lint 성공
  □ npm run format 성공

□ Phase 1
  □ GameLogger.ts 타입 정의
  □ GameLogger.ts 컴파일 성공
  □ npm run dev 게임 로드 확인
  □ (반복: animations, TouchManager, constants, TransitionManager)

□ Phase 2
  □ rarityUtils.ts 타입 정의
  □ helpers.ts 타입 정의
  □ npm run test 통과
  □ npm run dev 가챠/영웅 목록 확인

□ Phase 3
  □ drawUtils.ts 타입 정의
  □ textStyles.ts 타입 정의
  □ npm run build 성공
  □ npm run preview 모든 화면 확인

□ TSO-3.1 최종
  □ npx tsc --noEmit 0 에러
  □ npm run lint 0 경고
  □ npm run test 100% 통과
  □ npm run build 번들 정상

□ PAT-1.1 Step 1
  □ battle.d.ts 타입 정의
  □ npx tsc --noEmit 0 에러

□ PAT-1.1 Step 2
  □ BattleCommand.ts 컴파일 성공
  □ AttackCommand.ts 컴파일 성공
  □ SkillCommand.ts 컴파일 성공
  □ DefendCommand.ts 컴파일 성공

□ PAT-1.1 Step 3
  □ BattleSystem.js 컴파일 성공
  □ Command 유닛 테스트 통과
  □ npm run dev 전투 정상 진행
  □ 기본 공격 동작 확인
  □ 스킬 사용 동작 확인
  □ 방어 명령 동작 확인
  □ DefendCommand 방어력 복원 확인

□ 최종 검증
  □ 전체 빌드 성공
  □ 전체 테스트 100% 통과
  □ 전체 타입 체크 0 에러
  □ 전체 린트 0 경고
  □ 게임 플레이 에러 0
```

---

## 결론

### 핵심 결정 요약

1. **실행 순서**: TSO-3.1 → PAT-1.1 (직렬, fast-follow 권고)
2. **Import 경로**: 변경 불필요 (Vite 자동 해석)
3. **DefendCommand 타이밍**: 다음 턴 시작 시 복원
4. **하위 호환성**: 100% 유지 (Strategy 패턴 개유지)

### 리스크 대응

- **R1 (Vite 해석)**: Phase 1 즉시 검증
- **R3 (ESLint)**: Phase 0 필수 선행
- **R5 (Command 로직)**: wrapper 방식 + 통합 테스트
- **R6 (DefendCommand 복원)**: processTurn() + finishBattle() 양쪽 처리

### 예상 결과

- **변수 추가**: 9개 TypeScript 파일 + 4개 Command 클래스
- **테스트 추가**: 30+ BattleSystem 테스트
- **번들 변화**: ±5% (타입만 추가, 런타임 코드 동일)
- **총 소요 시간**: 10-12시간 (3명, 병렬 작업)

---

**문서 버전**: v1.0
**작성일**: 2026년 2월 8일
**검토 예정**: 아키텍처 리뷰 회의


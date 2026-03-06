# 19. TypeScript 전환 및 코드 최적화 계획 PRD

> **버전**: v1.0
> **작성일**: 2026-02-07
> **목적**: JS→TS 마이그레이션 타당성 분석, 디자인 패턴 최적화, 코드 구조 개선 계획

---

## 1. 현재 상태 분석

### 1.1 기술 스택
| 항목 | 현재 | 비고 |
|------|------|------|
| 언어 | JavaScript (ES Modules) | `type: "module"` |
| 번들러 | Vite 5.4.0 | esbuild 트랜스파일 (TS 네이티브 지원) |
| 게임 엔진 | Phaser 3.80.1 | TypeScript 타입 정의 내장 |
| 린트 | ESLint 9.39.2 | 플랫 컨피그 |
| 포맷 | Prettier 3.8.1 | |
| 테스트 | 없음 | 테스트 코드 0개 |
| 타입 체크 | 없음 | tsconfig.json 없음 |

### 1.2 코드 규모
| 카테고리 | 파일 수 | 총 줄 수 | 비고 |
|---------|--------|---------|------|
| Scenes | 15 | ~10,000 | 가장 큰: BattleScene 2,006줄 |
| Systems | 20 | ~10,000 | 가장 큰: BattleSystem 1,202줄 |
| Components | 14 | ~3,400 | |
| Services | 8 | ~3,900 | |
| Utils | 7 | ~2,500 | |
| Config | 3 | ~720 | |
| Data(JS) | 1 | ~400 | data/index.js |
| **합계** | **68** | **~31,000** | JSON 제외 |

### 1.3 이미 해결된 타입 관련 이슈
- Rarity 타입 불일치 → `getRarityKey()`/`getRarityNum()` 유틸
- ownedHeroes 스키마 분열 → `normalizeHero()`/`normalizeHeroes()`
- Stats 필드 불일치 → `stats || baseStats` 패턴

---

## 2. TypeScript 전환 타당성 분석

### 2.1 기대 효과

| 효과 | 설명 | 영향도 |
|------|------|-------|
| 컴파일 타임 타입 체크 | rarity number/string 같은 런타임 버그 사전 방지 | 높음 |
| IDE 자동완성 강화 | 시스템 메서드 파라미터/반환값 자동완성 | 높음 |
| 리팩토링 안전성 | 이름 변경, 시그니처 변경 시 영향범위 자동 탐지 | 높음 |
| 데이터 스키마 계약 | characters.json 등 JSON 인터페이스 정의 | 중간 |
| 문서 역할 | 코드 자체가 타입 문서 역할 | 중간 |

### 2.2 리스크 및 비용

| 리스크 | 설명 | 완화 방안 |
|--------|------|----------|
| 전환 기간 혼재 | .js/.ts 파일 혼재 | `allowJs: true` + 점진적 전환 |
| Phaser 동적 패턴 | `this.add.*`, Scene 라이프사이클 | Phaser 타입 활용 + 필요시 타입 단언 |
| JSON import 타입 | `import data from '*.json'` | `resolveJsonModule: true` |
| 동적 객체 접근 | `obj[key]` 패턴 다수 | Record 타입 + 타입 가드 |
| 학습 곡선 | 프로젝트 참여자 TS 학습 | 최소한의 고급 기능 사용 |
| 빌드 시간 증가 | 타입 체크 + 트랜스파일 | Vite esbuild는 타입 체크 안함 (빠름) |

### 2.3 전환 결정 매트릭스

| 항목 | 점수 (1-5) | 가중치 | 합계 |
|------|-----------|--------|------|
| 런타임 버그 감소 효과 | 5 | 3 | 15 |
| 개발 생산성 향상 | 4 | 3 | 12 |
| 전환 비용 | 3 (중간) | 2 | 6 |
| 유지보수 용이성 | 5 | 2 | 10 |
| 리스크 | 2 (낮음) | 2 | 4 |
| **총점** | | | **47/55** |

**결론: 전환 권장** (점수 47/55 = 85%)

---

## 3. 전환 전략

### 3.1 권장 전략: 점진적 마이그레이션

**원칙**: 기존 .js 파일을 깨지 않으면서 점진적으로 .ts로 전환

#### TSO-1: Phase 0 — 인프라 설정 (1일)

##### TSO-1.1: tsconfig.json 생성
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["phaser"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

##### TSO-1.2: Vite 설정 확인
- Vite는 `.ts` 파일 네이티브 처리 (esbuild)
- 타입 체크는 별도 (`tsc --noEmit` 또는 `vue-tsc`)
- 빌드 성능 영향 없음

##### TSO-1.3: npm scripts 추가
```json
{
  "typecheck": "tsc --noEmit",
  "typecheck:watch": "tsc --noEmit --watch"
}
```

##### TSO-1.4: ESLint 확장
```bash
npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

#### TSO-2: Phase 1 — 타입 정의 파일 (2-3일)

##### TSO-2.1: 핵심 인터페이스 정의
```
src/types/
├── character.d.ts    # Character, OwnedHero, HeroStats, GrowthStats
├── battle.d.ts       # Battler, BattleState, DamageResult, TurnAction
├── gacha.d.ts        # Banner, PullResult, PityInfo
├── equipment.d.ts    # Equipment, EquipmentSlot, EquipmentSet
├── synergy.d.ts      # Synergy, SynergyEffect, SynergyCondition
├── stage.d.ts        # Stage, Chapter, Wave, Enemy
├── save.d.ts         # SaveData, GameConfig, PlayerData
├── events.d.ts       # EventPayload (각 이벤트별 페이로드)
├── ui.d.ts           # UIConfig, LayoutConfig, TextStyle
└── index.d.ts        # 전체 re-export
```

##### TSO-2.2: Character 인터페이스 예시
```typescript
export interface CharacterStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export type MoodType = 'brave' | 'fierce' | 'wild' | 'calm' | 'stoic' | 'devoted' | 'cunning' | 'noble' | 'mystic';
export type CultType = 'olympus' | 'takamagahara' | 'yomi' | 'asgard' | 'valhalla' | 'tartarus' | 'avalon' | 'helheim' | 'kunlun';
export type ClassType = 'warrior' | 'mage' | 'healer' | 'archer';
export type RarityKey = 'N' | 'R' | 'SR' | 'SSR';

export interface Character {
  id: string;
  name: string;
  rarity: number;          // 1-5
  cult: CultType;
  class: ClassType;
  mood: MoodType;
  stats: CharacterStats;
  growthStats: CharacterStats;
  skills: string[];         // skill IDs
  designKeywords: string[];
  colorPalette: string[];
}

export interface OwnedHero extends Character {
  instanceId: string;
  characterId: string;
  level: number;
  exp: number;
  stars: number;
  rarityKey: RarityKey;
  skillLevels: number[];
  equipped: string | null;
  evolutionCount: number;
}
```

##### TSO-2.3: BattleSystem 인터페이스 예시
```typescript
export interface Battler {
  id: string;
  name: string;
  stats: CharacterStats;
  currentHp: number;
  mood: MoodType;
  skills: Skill[];
  isAlly: boolean;
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
}

export interface DamageResult {
  damage: number;
  isCritical: boolean;
  moodAdvantage: 'strong' | 'weak' | 'neutral';
  moodMultiplier: number;
}

export interface BattleResult {
  isVictory: boolean;
  turns: number;
  survivors: Battler[];
  rewards: BattleReward;
  starRating: 1 | 2 | 3;
}
```

#### TSO-3: Phase 2 — 유틸리티 전환 (2-3일)
| 파일 | 현재 줄수 | 전환 복잡도 | 우선순위 |
|------|----------|-----------|---------|
| `helpers.js` → `.ts` | ~400 | S | 1 |
| `constants.js` → `.ts` | ~300 | S | 1 |
| `animations.js` → `.ts` | ~500 | M | 2 |
| `drawUtils.js` → `.ts` | ~400 | M | 2 |
| `textStyles.js` → `.ts` | ~200 | S | 1 |
| `GameLogger.js` → `.ts` | ~200 | S | 2 |
| `TouchManager.js` → `.ts` | ~200 | M | 3 |

#### TSO-4: Phase 3 — 데이터 레이어 전환 (1-2일)
- `data/index.ts` — 모든 헬퍼 함수에 타입 적용
- JSON import 타입 연결 (Character[], Enemy[], Equipment[] 등)
- `normalizeHero()` 반환 타입 `OwnedHero` 명시

#### TSO-5: Phase 4 — 시스템 레이어 전환 (5-7일)
전환 순서 (의존성 최소 → 최대):
1. `EventBus.ts` (독립적)
2. `MoodSystem.ts` (독립적)
3. `EnergySystem.ts` (SaveManager 의존)
4. `SynergySystem.ts` (Character 의존)
5. `GachaSystem.ts` (SaveManager, Character 의존)
6. `ProgressionSystem.ts` (SaveManager 의존)
7. `EquipmentSystem.ts` (SaveManager 의존)
8. `PartyManager.ts` (SaveManager, Character 의존)
9. `BattleSystem.ts` (Mood, Synergy 의존 — 가장 복잡)
10. `SaveManager.ts` (모든 시스템의 중심)
11. 나머지 시스템들

#### TSO-6: Phase 5 — 씬/컴포넌트 전환 (7-10일)
- Phaser.Scene 확장 클래스 타입 처리
- `this.add.*`, `this.scene.*` 등 Phaser API 타입 활용
- 컴포넌트 Props 인터페이스 정의

### 3.2 대안 전략: JSDoc 타입 어노테이션 (최소 침습)

**파일 확장자 변경 없이 타입 체크만 활성화**

```js
// helpers.js (JSDoc 방식)
/**
 * @param {number|string} rarity
 * @returns {import('../types/character').RarityKey}
 */
export function getRarityKey(rarity) { ... }
```

| 장점 | 단점 |
|------|------|
| 파일 확장자 변경 없음 | 표현력 제한 (제네릭 어려움) |
| 즉시 적용 가능 | 타입 가드/유니온 표현 제한 |
| 기존 도구 호환 | 인라인 타입 지저분 |
| 점진적 적용 | IDE 지원 TS보다 약함 |

**권장: Phase 1-2에서 JSDoc 선도입 → Phase 3+에서 TS 전환**

---

## 4. 디자인 패턴 최적화

### 4.1 현재 사용 패턴 분석

| 패턴 | 사용 위치 | 상태 |
|------|----------|------|
| Singleton | 대부분의 시스템 (export instance) | ✅ 적절 |
| Scene State Machine | Phaser Scene 매니저 | ✅ 적절 |
| Observer | EventBus (커스텀 이벤트) | ⚠️ 타입 미정의 |
| Repository | SaveManager (데이터 접근) | ⚠️ 과도한 책임 |
| Factory | 캐릭터 생성 (분산) | ❌ 미구현 |
| Strategy | BattleSystem 데미지 계산 | ⚠️ 부분적 |

### 4.2 도입 권장 패턴

#### PAT-1: Command Pattern — 전투 액션 캡슐화
```typescript
interface BattleCommand {
  execute(): DamageResult;
  undo?(): void;        // 리플레이/실행취소 지원
  getDescription(): string;
}

class AttackCommand implements BattleCommand { ... }
class SkillCommand implements BattleCommand { ... }
class HealCommand implements BattleCommand { ... }
class GuardCommand implements BattleCommand { ... }
```
- **목적**: 전투 액션 기록 → 리플레이 기능, 전투 로그
- **적용**: `BattleSystem.executeTurn()`

#### PAT-2: State Pattern — BattleScene 상태 관리
```typescript
enum BattlePhase {
  INITIALIZING,    // 전투 초기화
  PLAYER_INPUT,    // 플레이어 입력 대기
  TARGETING,       // 타겟 선택 중
  EXECUTING,       // 액션 실행 중
  ANIMATING,       // 애니메이션 재생 중
  RESOLVING,       // 턴 결과 처리
  WAVE_TRANSITION, // 웨이브 전환
  BATTLE_END,      // 전투 종료
}
```
- **목적**: BattleScene의 복잡한 상태 전환 명확화
- **적용**: BattleScene 내부 상태 머신

#### PAT-3: Facade Pattern — 시스템 복합 호출 단순화
```typescript
class GameFacade {
  startBattle(party: OwnedHero[], stage: Stage): BattleResult;
  pullGacha(bannerId: string, count: number): PullResult[];
  levelUpHero(heroId: string): LevelUpResult;
  equipItem(heroId: string, equipmentId: string): void;
}
```
- **목적**: 씬에서 여러 시스템을 직접 호출하는 대신 Facade 사용
- **적용**: 복잡한 시스템 연계 작업

#### PAT-4: Factory Pattern — 데이터 객체 생성 표준화
```typescript
class HeroFactory {
  static createFromCharacterData(charData: Character): OwnedHero;
  static createFromSaveData(saveData: SavedHero): OwnedHero;
  static createStarter(): OwnedHero;  // 초기 캐릭터
}

class EnemyFactory {
  static createFromStageData(enemyId: string, level: number): Battler;
  static createBoss(bossId: string, chapter: number): Battler;
}
```
- **목적**: `normalizeHero()` 기능을 Factory로 격상
- **적용**: GachaScene, BattleScene, BootScene

#### PAT-5: Mediator Pattern — Scene↔System 통신 중개
```typescript
class GameMediator {
  notify(sender: string, event: string, data: any): void;
  // Scene이 직접 System을 import하지 않고 Mediator를 통해 통신
}
```
- **목적**: 씬-시스템 간 결합도 감소
- **적용**: 장기 목표 (단기는 EventBus 강화로 대체)

---

## 5. 코드 구조 개선 (대형 파일 분할)

### 5.1 BattleScene.js 분할 (2,006줄 → 4파일)

#### REFAC-1: BattleScene 분할 계획
```
src/scenes/battle/
├── BattleScene.js        (~500줄) — 메인 제어, 라이프사이클, 상태 관리
├── BattleRenderer.js     (~600줄) — UI 렌더링 (HP바, 스킬카드, 턴바)
├── BattleInputHandler.js (~300줄) — 터치/타겟 선택, 스킬 선택
├── BattleAnimator.js     (~400줄) — 전투 애니메이션 (VFX-2 연동)
└── index.js              (export)
```

#### REFAC-2: 분할 기준
- `create()` → BattleRenderer.initializeUI()
- `handleInput()` → BattleInputHandler
- `playAnimation()` → BattleAnimator
- 상태 관리/턴 진행 → BattleScene (핵심)

### 5.2 SaveManager.js 분할 (1,100줄 → 3파일)

#### REFAC-3: SaveManager 분할 계획
```
src/systems/save/
├── SaveManager.js              (~400줄) — 저장/로드 코어, 로컬 스토리지
├── CloudSyncManager.js         (~400줄) — Supabase 동기화, 충돌 해결
├── OfflineRewardCalculator.js  (~200줄) — 오프라인 보상 계산
└── index.js                    (export)
```

### 5.3 GachaScene.js 분할 (1,275줄 → 3파일)

#### REFAC-4: GachaScene 분할 계획
```
src/scenes/gacha/
├── GachaScene.js          (~400줄) — 메인 제어, 배너 관리
├── GachaRenderer.js       (~500줄) — UI 렌더링 (배너, 결과, 카드)
├── GachaAnimator.js       (~300줄) — 소환 연출 (VFX-3 연동)
└── index.js               (export)
```

### 5.4 DebugManager.js 리팩토링 (1,075줄)

#### REFAC-5: DebugManager 개선
- ESM 호환 (현재 `require()` 잔존 가능)
- 카테고리별 치트 코드 분리
- 개발 모드에서만 로드 (dynamic import)
```js
// main.js에서
if (import.meta.env.DEV) {
  const { DebugManager } = await import('./systems/DebugManager.js');
  DebugManager.init();
}
```

---

## 6. 성능 최적화

### 6.1 번들 최적화

#### PERF-1: Tree-shaking 개선
- 현재: gzip 503KB (Phaser ~1MB 별도 청크)
- 목표: gzip 450KB 이하
- 사용되지 않는 export 제거 (dead code)
- DebugManager 프로덕션 빌드에서 제외

#### PERF-2: 코드 스플리팅 강화
```js
// vite.config.js
manualChunks: {
  phaser: ['phaser'],
  data: ['./src/data/characters.json', './src/data/enemies.json', ...],
  battle: ['./src/scenes/BattleScene.js', './src/systems/BattleSystem.js'],
  gacha: ['./src/scenes/GachaScene.js', './src/systems/GachaSystem.js'],
}
```

#### PERF-3: 데이터 레이지 로딩
- characters.json (237KB) → 필요한 씬에서만 로드
- 전체 로드 → 인덱스만 로드 + 상세 on-demand

### 6.2 런타임 성능

#### PERF-4: Object Pooling
- 데미지 텍스트: 20개 풀 (생성/파괴 대신 reset + reposition)
- 파티클: ParticleManager에 풀링 추가
- 전투 UI 오브젝트: HP바, 버프 아이콘 등 재사용

#### PERF-5: Render Texture 캐싱
- 반복 그리기 방지 (동일 프레임 내 중복 렌더링)
- 정적 UI 요소는 RenderTexture로 캐싱
- HeroCard: 한번 그린 후 텍스처로 캐시

#### PERF-6: 이벤트 리스너 최적화
- 스크롤 이벤트: requestAnimationFrame 기반 throttle
- 터치 이벤트: 불필요한 리스너 해제 확인
- EventBus: 미사용 리스너 주기적 정리

### 6.3 메모리 최적화

#### PERF-7: Scene Shutdown 강화
- 현재: 15개 씬 모두 shutdown() 구현됨
- 추가 검증: tween 완전 정지, 파티클 이미터 파괴, 이벤트 해제
- Phaser DevTools로 메모리 프로파일링

#### PERF-8: 대형 JSON 청크 분할
```
characters.json (237KB) →
  characters_index.json (5KB)  — id, name, rarity, cult, class, mood
  characters_stats.json (50KB) — id, stats, growthStats
  characters_design.json (120KB) — id, designKeywords, colorPalette, ...
  characters_skills.json (50KB) — id, skills
```

---

## 7. 태스크 요약 및 우선순위

### Phase 0: 인프라 설정 (1일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| TSO-1.1 | tsconfig.json 생성 | S | P0 |
| TSO-1.2 | Vite 설정 확인 | S | P0 |
| TSO-1.3 | npm scripts 추가 | S | P0 |
| TSO-1.4 | ESLint TS 확장 | S | P0 |

### Phase 1: 타입 정의 (2-3일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| TSO-2.1 | src/types/ 핵심 인터페이스 정의 | L | P0 |
| TSO-2.2 | Character/OwnedHero 인터페이스 | M | P0 |
| TSO-2.3 | Battle 관련 인터페이스 | M | P0 |
| PAT-1 | Command Pattern 인터페이스 설계 | M | P1 |
| PAT-2 | BattlePhase 열거형 정의 | S | P1 |

### Phase 2: 유틸+데이터 전환 (3-4일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| TSO-3 | 유틸리티 7개 파일 .ts 전환 | M | P1 |
| TSO-4 | data/index.ts 전환 | M | P1 |
| PAT-4 | HeroFactory 구현 | M | P1 |
| PERF-1 | Tree-shaking 개선 | M | P2 |

### Phase 3: 시스템 전환 (5-7일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| TSO-5 | 시스템 20개 .ts 전환 | XL | P1 |
| PAT-3 | GameFacade 구현 | M | P2 |
| REFAC-3 | SaveManager 분할 | L | P2 |
| REFAC-5 | DebugManager ESM 리팩토링 | M | P2 |

### Phase 4: 씬/컴포넌트 전환 (7-10일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| TSO-6 | 씬 15개 + 컴포넌트 14개 .ts 전환 | XL | P2 |
| REFAC-1~2 | BattleScene 분할 | L | P2 |
| REFAC-4 | GachaScene 분할 | L | P2 |
| PERF-4~6 | 런타임 성능 최적화 | L | P3 |
| PERF-7~8 | 메모리 최적화 | L | P3 |

### Phase 5: 마무리 (2-3일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| - | `strict: true` 활성화 | L | P3 |
| - | checkJs → 완전 TS 전환 확인 | M | P3 |
| PERF-2~3 | 번들 스플리팅 + 레이지 로딩 | L | P3 |

### 복잡도 범례
- **S**: 1-2시간 / **M**: 3-8시간 / **L**: 1-2일 / **XL**: 3-5일

---

## 8. 검증 기준

| 단계 | 성공 기준 |
|------|----------|
| Phase 0 | `npm run typecheck` 실행 가능 (에러 허용) |
| Phase 1 | 핵심 인터페이스 10개+ 정의, 타입 문서 역할 |
| Phase 2 | 유틸+데이터 파일 `tsc --noEmit` 에러 0 |
| Phase 3 | 시스템 파일 `tsc --noEmit` 에러 0 |
| Phase 4 | 전체 `tsc --noEmit` 에러 0, `npm run build` 성공 |
| Phase 5 | `strict: true` + 에러 0, 번들 gzip < 450KB |

---

## 9. 관련 문서

- [15_COMPATIBILITY_LINT.md](./15_COMPATIBILITY_LINT.md) — ESLint 강화 (TS ESLint 연계)
- [09_STANDARDS_PHASES.md](./09_STANDARDS_PHASES.md) — 코딩 표준
- [20_QA_TESTING.md](./20_QA_TESTING.md) — 테스트 프레임워크 (Vitest + TS)
- [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) — 아키텍처 (분할 연계)

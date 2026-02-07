# 20. QA 테스팅 및 Electron MCP 활용 계획 PRD

> **버전**: v1.0
> **작성일**: 2026-02-07
> **목적**: 테스트 프레임워크 도입, Electron MCP 기반 자동화 QA, 시나리오별 테스트 계획

---

## 1. 현재 테스팅 상태

### 1.1 현재 인프라
| 항목 | 상태 | 비고 |
|------|------|------|
| 유닛 테스트 코드 | ❌ 없음 | *.test.js, *.spec.js 0개 |
| 테스트 프레임워크 | ❌ 없음 | Vitest/Jest 미설치 |
| 테스트 문서 | ✅ 5개 존재 | 수동 테스트 시나리오 (markdown) |
| 디버그 도구 | ✅ DebugManager | 25종 치트코드 |
| 로깅 | ✅ GameLogger | 카테고리별 로그 레벨 |
| ESLint | ✅ ESLint 9 | 기본 규칙 |
| Electron MCP | ✅ 별도 프로젝트 | `D:\park\YD_Claude_RND\electron-mcp-server` |

### 1.2 기존 테스트 문서 (수동 시나리오)
| 파일 | 내용 | 상태 |
|------|------|------|
| `BATTLE_E2E_TEST.md` | 전투 E2E 13항목 | PASS (수동) |
| `SCENE_FLOW_TEST.md` | 씬 전환 15항목 | PASS (수동) |
| `GACHA_PROBABILITY_TEST.md` | 가챠 확률 검증 | PASS (수동) |
| `BALANCE_SIMULATION.md` | 밸런스 시뮬레이션 | 문서만 존재 |
| `CROSS_BROWSER_TEST_PLAN.md` | 크로스 브라우저 | 미실행 |

### 1.3 디버그 인프라 상세
- **DebugManager.js** (1,075줄): 25종 치트코드
  - `gold [amount]`, `gems [amount]`, `energy [amount]`
  - `addchar [id]`, `levelup [id] [level]`
  - `clearstage [chapter] [stage]`
  - `gacha [count]`, `resetpity`
  - `godmode`, `oneshotkill`
  - `timewarp [hours]` (오프라인 보상 테스트)
  - `allheroes`, `allequip`
  - `resetall`, `saveinfo`, `debuginfo`
- **GameLogger.js** (~200줄): 카테고리별 로그
  - 레벨: debug, info, warn, error
  - 카테고리: battle, gacha, save, scene, system, ui

---

## 2. Electron MCP 서버 활용 계획

### 2.1 현재 Electron MCP 구조
```
D:\park\YD_Claude_RND\electron-mcp-server\
├── src/           # TypeScript 소스
├── build/         # 빌드 결과물
├── package.json
└── tsconfig.json
```

### 2.2 MCP-게임 연동 아키텍처

```
┌─────────────────────────────────────┐
│         Electron Application        │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     BrowserView (Game)      │    │
│  │  ┌─────────────────────┐   │    │
│  │  │  ArcaneCollectors    │   │    │
│  │  │  (Phaser 3)          │   │    │
│  │  │                      │   │    │
│  │  │  GameLogger ─────┐   │   │    │
│  │  │  DebugManager ──┐│   │   │    │
│  │  │  game.registry ─┤│   │   │    │
│  │  └─────────────────┤┤───┘   │    │
│  │                    ││        │    │
│  │              preload.js      │    │
│  │              (IPC Bridge)    │    │
│  └─────────────────────────────┘    │
│                    │                 │
│  ┌─────────────────▼───────────┐    │
│  │      MCP Server (IPC)       │    │
│  │                             │    │
│  │  Tools:                     │    │
│  │  ├── game:getState          │    │
│  │  ├── game:executeCheat      │    │
│  │  ├── game:screenshot        │    │
│  │  ├── game:navigate          │    │
│  │  ├── game:getLogs           │    │
│  │  ├── game:getRegistry       │    │
│  │  ├── game:triggerEvent      │    │
│  │  └── game:waitForScene      │    │
│  └─────────────────────────────┘    │
└──────────────────┬──────────────────┘
                   │ stdio/SSE
        ┌──────────▼──────────┐
        │   Claude Code       │
        │   (MCP Client)      │
        │                     │
        │   자동화 테스트      │
        │   시나리오 실행      │
        │   로그 분석          │
        └─────────────────────┘
```

### 2.3 MCP 도구 명세

#### QAT-MCP-1: game:getState
```typescript
// 게임 전체 상태 조회
interface GameState {
  currentScene: string;
  registry: {
    ownedHeroes: OwnedHero[];
    gold: number;
    gems: number;
    energy: { current: number; max: number; lastRecharge: number };
    parties: Party[];
    questProgress: QuestProgress;
    stageProgress: StageProgress;
  };
  battleState?: BattleState;  // BattleScene 활성 시
}
```

#### QAT-MCP-2: game:executeCheat
```typescript
// DebugManager 치트코드 실행
input: { command: string }  // e.g., "gold 99999"
output: { success: boolean; result: string }
```

#### QAT-MCP-3: game:screenshot
```typescript
// 현재 화면 캡처
output: { base64: string; width: number; height: number; scene: string }
```

#### QAT-MCP-4: game:navigate
```typescript
// 특정 씬으로 이동
input: { scene: string; data?: object }
output: { success: boolean; currentScene: string }
```

#### QAT-MCP-5: game:getLogs
```typescript
// GameLogger 로그 수집
input: { level?: string; category?: string; since?: number; limit?: number }
output: { logs: LogEntry[] }
```

#### QAT-MCP-6: game:getRegistry
```typescript
// Phaser Registry 특정 키 조회
input: { key: string }
output: { value: any; exists: boolean }
```

#### QAT-MCP-7: game:triggerEvent
```typescript
// EventBus 이벤트 트리거
input: { event: string; data?: object }
output: { success: boolean }
```

#### QAT-MCP-8: game:waitForScene
```typescript
// 특정 씬 로드 완료 대기
input: { scene: string; timeout?: number }
output: { success: boolean; loadTime: number }
```

### 2.4 MCP Bridge 구현 (게임 측)

#### QAT-MCP-9: IPC Bridge 스크립트
```javascript
// electron/preload.js — 게임↔MCP 통신 브릿지
const { ipcRenderer } = require('electron');

// 게임 → MCP (로그 전달)
window.__MCP_BRIDGE = {
  sendLog: (entry) => ipcRenderer.send('game:log', entry),
  getState: () => ipcRenderer.invoke('game:getState'),
};

// MCP → 게임 (치트코드/이벤트)
ipcRenderer.on('game:executeCheat', (event, command) => {
  window.__GAME_DEBUG?.executeCommand(command);
});
ipcRenderer.on('game:navigate', (event, scene, data) => {
  window.__GAME_SCENE?.start(scene, data);
});
```

#### QAT-MCP-10: 게임 측 expose
```javascript
// BootScene.js 또는 main.js
if (window.__MCP_BRIDGE) {
  window.__GAME_DEBUG = DebugManager;
  window.__GAME_SCENE = game.scene;
  window.__GAME_REGISTRY = game.registry;

  // GameLogger 후킹
  GameLogger.addTransport((entry) => {
    window.__MCP_BRIDGE.sendLog(entry);
  });
}
```

---

## 3. 테스트 프레임워크 도입

### 3.1 프레임워크 선정

| 프레임워크 | ESM 지원 | Vite 통합 | 평가 |
|-----------|---------|----------|------|
| **Vitest** | ✅ 네이티브 | ✅ 네이티브 | **권장** |
| Jest | ⚠️ 실험적 | ❌ 별도 설정 | 차선 |
| Mocha | ✅ | ❌ 별도 설정 | 비권장 |

**Vitest 선정 이유**:
- Vite 프로젝트에 제로 설정
- ES Modules 네이티브 지원
- Jest 호환 API (describe, it, expect)
- 빠른 실행 (HMR 기반)

### 3.2 설치 및 설정

#### QAT-FW-1: Vitest 설치
```bash
npm install -D vitest @vitest/coverage-v8
```

#### QAT-FW-2: vitest.config.js
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js', 'tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/data/**', 'src/utils/**', 'src/systems/**'],
      exclude: ['src/scenes/**', 'src/components/**'],  // Phaser 의존 제외
    },
  },
});
```

#### QAT-FW-3: npm scripts 추가
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

### 3.3 Phaser Mock 전략
- Phaser Scene/Game 객체는 직접 테스트 어려움
- **전략 1**: 시스템/유틸 함수만 유닛 테스트 (Phaser 의존 없는 로직)
- **전략 2**: 씬 테스트는 MCP E2E로 대체
- **전략 3**: 필요시 간단한 Phaser Mock 제작

---

## 4. 유닛 테스트 계획

### 4.1 테스트 대상 및 우선순위

#### Tier 1: 핵심 데이터 함수 (P0)
| 파일 | 테스트 대상 | 테스트 수 |
|------|-----------|----------|
| `data/index.js` | normalizeHero, normalizeHeroes, getCharacter, calculatePower, calculateStats, getMoodMatchup, getMaxLevel, getChapterStages | ~25 |
| `utils/helpers.js` | getRarityKey, getRarityNum, formatNumber, formatTime, clamp, generateId | ~15 |
| `utils/constants.js` | MOOD_MATCHUP, CULT_MOOD_BONUS 데이터 무결성 | ~10 |

#### Tier 2: 시스템 로직 (P1)
| 시스템 | 테스트 대상 | 테스트 수 |
|--------|-----------|----------|
| `MoodSystem.js` | getMoodAdvantage, calculateMoodMultiplier, getMoodBonus | ~15 |
| `GachaSystem.js` | calculatePullResult, getPityInfo, shouldGuaranteeSSR, applyRateUp | ~20 |
| `EnergySystem.js` | consume, canConsume, calculateRechargeTime, getStatus | ~10 |
| `SynergySystem.js` | calculatePartySynergies, findMatchingSynergies, applySynergyBonuses | ~15 |
| `ProgressionSystem.js` | calculateExpForLevel, getLevelUpCost, calculateStats | ~10 |
| `EquipmentSystem.js` | equip, unequip, calculateEquipmentBonus | ~10 |
| `EvolutionSystem.js` | canEvolve, getEvolutionCost, calculatePostEvolutionStats | ~8 |

#### Tier 3: 전투 로직 (P1)
| 시스템 | 테스트 대상 | 테스트 수 |
|--------|-----------|----------|
| `BattleSystem.js` | calculateDamage, determineTurnOrder, applyBuffDebuff, checkBattleEnd | ~20 |
| `PartyManager.js` | setParty, autoFormParty, validateParty | ~10 |
| `SweepSystem.js` | canSweep, calculateSweepRewards | ~8 |

### 4.2 테스트 예시

#### 예시: normalizeHero 테스트
```javascript
// tests/data/normalizeHero.test.js
import { describe, it, expect } from 'vitest';
import { normalizeHero, normalizeHeroes } from '../../src/data/index.js';

describe('normalizeHero', () => {
  it('SaveManager 형식 데이터를 완전한 Hero 객체로 변환', () => {
    const saved = { instanceId: 'inst_001', characterId: 'hero_001', level: 5, exp: 120 };
    const result = normalizeHero(saved);

    expect(result).toBeDefined();
    expect(result.id).toBe('hero_001');
    expect(result.name).toBeTruthy();      // characters.json에서 채워짐
    expect(result.rarity).toBeTypeOf('number');
    expect(result.stats).toHaveProperty('hp');
    expect(result.stats).toHaveProperty('atk');
    expect(result.level).toBe(5);
    expect(result.exp).toBe(120);
  });

  it('null 입력 시 null 반환', () => {
    expect(normalizeHero(null)).toBeNull();
  });

  it('id 없는 객체 시 null 반환', () => {
    expect(normalizeHero({ level: 1 })).toBeNull();
  });

  it('이미 완전한 Hero 데이터는 그대로 통과', () => {
    const full = { id: 'hero_001', name: 'Test', rarity: 5, stats: { hp: 100 } };
    const result = normalizeHero(full);
    expect(result.name).toBe('Test');
  });
});

describe('normalizeHeroes', () => {
  it('배열의 각 요소를 정규화', () => {
    const input = [
      { characterId: 'hero_001', level: 1 },
      { characterId: 'hero_002', level: 3 },
    ];
    const result = normalizeHeroes(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBeTruthy();
  });

  it('비배열 입력 시 빈 배열 반환', () => {
    expect(normalizeHeroes(null)).toEqual([]);
    expect(normalizeHeroes(undefined)).toEqual([]);
    expect(normalizeHeroes('string')).toEqual([]);
  });
});
```

#### 예시: MoodSystem 테스트
```javascript
// tests/systems/MoodSystem.test.js
import { describe, it, expect } from 'vitest';
import { moodSystem } from '../../src/systems/MoodSystem.js';

describe('MoodSystem', () => {
  describe('getMoodAdvantage', () => {
    it('brave는 calm, stoic에 유리', () => {
      expect(moodSystem.getMoodAdvantage('brave', 'calm')).toBe('strong');
      expect(moodSystem.getMoodAdvantage('brave', 'stoic')).toBe('strong');
    });

    it('brave는 cunning, mystic에 불리', () => {
      expect(moodSystem.getMoodAdvantage('brave', 'cunning')).toBe('weak');
      expect(moodSystem.getMoodAdvantage('brave', 'mystic')).toBe('weak');
    });

    it('같은 분위기끼리는 중립', () => {
      expect(moodSystem.getMoodAdvantage('brave', 'brave')).toBe('neutral');
    });

    it('9종 모든 분위기 상성이 정의됨', () => {
      const moods = ['brave','fierce','wild','calm','stoic','devoted','cunning','noble','mystic'];
      for (const a of moods) {
        for (const b of moods) {
          const result = moodSystem.getMoodAdvantage(a, b);
          expect(['strong','weak','neutral']).toContain(result);
        }
      }
    });
  });
});
```

---

## 5. 시나리오별 QA 테스트 계획

### 5.1 핵심 플로우 테스트 (Critical Path)

| ID | 시나리오 | 전제조건 | 단계 | 검증 항목 |
|----|---------|---------|------|----------|
| QA-F01 | 신규 유저 온보딩 | 빈 localStorage | Login→Boot→MainMenu | 초기 데이터 생성, 기본 캐릭터 지급(hero_001), 골드/젬 지급 |
| QA-F02 | 가챠 1연차 | 젬 ≥ 300 | MainMenu→Gacha→1연차 | 재화 차감(-300), 캐릭터 추가, 천장 카운터 +1, 등급 확률 검증 |
| QA-F03 | 가챠 10연차 | 젬 ≥ 3000 | Gacha→10연차 | 재화 차감(-3000), 10명 추가, R↑ 보장, 천장 +10 |
| QA-F04 | 전투 진입~승리 | 에너지 ≥ 10, 파티 편성 | StageSelect→Battle→Result | 에너지 차감, 턴 진행, 보상 지급, EXP 부여 |
| QA-F05 | 전투 패배 | 약한 파티 vs 강한 적 | Battle→Result(패배) | 에너지 차감(소모됨), 보상 없음, 진행도 미변경 |
| QA-F06 | 영웅 레벨업 | 골드 보유, 경험서 보유 | HeroList→Detail→LevelUp | 골드 차감, 스탯 상승, 저장 반영 |
| QA-F07 | 파티 편성 | 캐릭터 4명↑ | PartyEdit | 파티 저장, 시너지 계산, 전투 반영 |
| QA-F08 | 장비 장착 | 장비 보유 | Inventory→장착 | 스탯 변화, 중복 장착 방지, 저장 |
| QA-F09 | 퀘스트 완료 | 일일 퀘스트 진행 | Quest→완료→보상 | 진행도 추적, 보상 수령, 초기화 |
| QA-F10 | 무한의 탑 | 에너지 보유 | Tower→Battle→Clear | 층수 진행, 보상 차등, 최고층 기록 |

### 5.2 데이터 무결성 테스트

| ID | 시나리오 | 절차 | 검증 |
|----|---------|------|------|
| QA-D01 | 저장/로드 사이클 | 플레이→수동저장→새로고침→로드 | 모든 데이터 일치 (골드, 캐릭터, 진행도, 파티) |
| QA-D02 | 오프라인 보상 정상 | 종료→5시간 경과→재접속 | 보상 1회만 지급, 중복 없음, lastOnline 갱신 |
| QA-D03 | 오프라인 보상 한도 | 종료→24시간+ 경과→재접속 | 최대 한도 적용, 과다 보상 없음 |
| QA-D04 | 캐릭터 데이터 정합성 | 가챠→소유→레벨업→진화 | 모든 단계에서 normalizeHero 결과와 일치 |
| QA-D05 | 재화 정합성 | 여러 소비 행동 연속 | 골드/젬 잔액 = 초기 - Σ(소비) + Σ(획득) |

### 5.3 엣지 케이스 테스트

| ID | 시나리오 | 조건 | 기대 결과 |
|----|---------|------|----------|
| QA-E01 | 재화 부족 가챠 | 젬 < 300 | 소환 불가 안내, 상태 무변화 |
| QA-E02 | 에너지 0 전투 | energy.current = 0 | 진입 차단, "에너지 부족" 안내 |
| QA-E03 | 3명 미만 파티 전투 | 파티 1~3명 | 정상 진행 or 경고 (기획 확인) |
| QA-E04 | 천장(90회) 도달 | pity = 89, 1연차 | SSR 보장 소환, 카운터 리셋 |
| QA-E05 | 만렙 캐릭터 EXP | level = max(등급별) | EXP 미증가 or "만렙" 안내 |
| QA-E06 | 빈 인벤토리 | 장비 0개 | 빈 상태 UI 정상, 크래시 없음 |
| QA-E07 | 빈 영웅 목록 | ownedHeroes = [] | 빈 목록 표시, "영웅을 소환하세요" 안내 |
| QA-E08 | localStorage 비활성화 | 시크릿 모드 | Graceful 에러 처리, 크래시 없음 |
| QA-E09 | 씬 빠른 전환 스패밍 | 0.1초 간격 씬 전환 반복 | 메모리 누수 없음, 상태 안정 |
| QA-E10 | 네트워크 끊김 | Supabase 연결 해제 | localStorage 폴백, "오프라인 모드" 표시 |
| QA-E11 | 중복 캐릭터 소환 | 이미 보유 캐릭터 | 조각 변환, 정상 처리 |
| QA-E12 | 장비 중복 장착 | A 착용 중인 장비를 B에 장착 | A에서 해제 → B에 장착, 또는 경고 |

### 5.4 성능/안정성 테스트

| ID | 시나리오 | 방법 | 기준 |
|----|---------|------|------|
| QA-P01 | 초기 로딩 시간 | Boot→MainMenu 시간 측정 | < 3초 |
| QA-P02 | 전투 프레임레이트 | Battle 30턴 진행 중 fps | 평균 55fps↑ |
| QA-P03 | 가챠 10연차 연출 | 연출 중 fps | 평균 50fps↑ |
| QA-P04 | 메모리 누수 | 씬 전환 50회 반복 | 메모리 증가 < 10MB |
| QA-P05 | 대량 데이터 | 91명 전부 소유 + 장비 82개 | 영웅목록 스크롤 60fps |
| QA-P06 | 긴 세션 | 30분 연속 플레이 | 성능 저하 없음 |

---

## 6. 로그 기반 디버깅 전략

### 6.1 GameLogger 카테고리 체계

| 카테고리 | 로그 대상 | 중요 패턴 |
|---------|----------|----------|
| `scene` | 씬 전환, create/shutdown | "[SceneName] create() 실패" |
| `battle` | 턴 진행, 데미지, 상성 | "undefined" 접근 |
| `gacha` | 소환 결과, 확률, 천장 | "NaN", "Infinity" |
| `save` | 저장/로드, 동기화 | "save failed", "load error" |
| `system` | 시스템 초기화, 에러 | "TypeError", "ReferenceError" |
| `ui` | 컴포넌트 렌더링 | "null", "undefined" 접근 |
| `energy` | 에너지 변동, 회복 | 음수값, 최대값 초과 |
| `quest` | 퀘스트 진행, 보상 | 중복 보상, 진행도 역행 |

### 6.2 자동 이슈 탐지 패턴

#### QAT-LOG-1: 에러 패턴 자동 탐지
```javascript
const ERROR_PATTERNS = [
  { pattern: /TypeError|ReferenceError|RangeError/, severity: 'critical' },
  { pattern: /Cannot read properties of (null|undefined)/, severity: 'critical' },
  { pattern: /is not a function/, severity: 'critical' },
  { pattern: /NaN|Infinity/, severity: 'warning' },
  { pattern: /undefined/, severity: 'info' },
];
```

#### QAT-LOG-2: 성능 타이머
```javascript
// 씬 로딩 시간 측정
GameLogger.time('scene:BattleScene:create');
// ... create() 로직 ...
GameLogger.timeEnd('scene:BattleScene:create');
// → "[PERF] scene:BattleScene:create: 245ms"

// 임계값 초과 시 경고
// create() > 1000ms → warn
// 턴 처리 > 500ms → warn
```

#### QAT-LOG-3: 데이터 이상 탐지
```javascript
// normalizeHero 후 필수 필드 누락 감지
if (!hero.name || !hero.stats || !hero.mood) {
  GameLogger.warn('data', `Incomplete hero data: ${hero.id}`, hero);
}

// 재화 음수 감지
if (gold < 0 || gems < 0) {
  GameLogger.error('system', `Negative currency: gold=${gold}, gems=${gems}`);
}
```

### 6.3 MCP 로그 수집 자동화

#### QAT-LOG-4: 실시간 로그 스트리밍
- MCP Bridge를 통해 GameLogger 출력을 실시간 수집
- Claude Code에서 `game:getLogs` 도구로 조회
- 필터링: 레벨(error/warn), 카테고리(battle/save), 시간 범위

#### QAT-LOG-5: 테스트 실행 로그 수집
```
1. 테스트 시나리오 시작 전: game:getLogs 초기화
2. 시나리오 실행 (MCP 도구로 자동화)
3. 시나리오 종료 후: game:getLogs 수집
4. ERROR/WARN 패턴 자동 분석
5. 결과 리포트 생성
```

---

## 7. 자동화 테스트 파이프라인

### 7.1 개발 중 (로컬)
```
코드 수정 → save
  ↓
lint-staged (pre-commit)
  ├── ESLint --fix
  ├── Prettier --write
  └── vitest related (변경 파일 관련 테스트만)
  ↓
commit
```

### 7.2 CI/CD (GitHub Actions)

#### QAT-CI-1: PR 검증 워크플로우
```yaml
name: PR Validation
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run test -- --coverage
      - run: npm run build

      # 번들 사이즈 체크
      - name: Check bundle size
        run: |
          SIZE=$(stat -f%z dist/assets/*.js | awk '{s+=$1} END {print s}')
          if [ $SIZE -gt 650000 ]; then
            echo "Bundle too large: ${SIZE} bytes"
            exit 1
          fi
```

#### QAT-CI-2: 데이터 검증 (별도 Job)
```yaml
  data-validation:
    runs-on: ubuntu-latest
    steps:
      - run: node scripts/validate-data.js
      # 15_COMPATIBILITY_LINT.md의 SCHEMA-2 참조
```

### 7.3 릴리스 전 QA (MCP 기반)
```
1. Electron MCP 서버 기동
2. 게임 로드 (Electron BrowserView)
3. 자동화 시나리오 실행:
   a. QA-F01~F10 핵심 플로우
   b. QA-D01~D05 데이터 무결성
   c. QA-E01~E12 엣지 케이스 (선택)
4. 로그 수집 + 분석
5. 스크린샷 증거 저장
6. 리포트 생성
```

---

## 8. 테스트 커버리지 목표

### 8.1 단계별 목표

| 단계 | 유닛 커버리지 | E2E 시나리오 | 기간 |
|------|-------------|-------------|------|
| Phase 1 | 30% (data, helpers) | 0 | 2-3일 |
| Phase 2 | 50% (+systems) | 5개 핵심 | 5-7일 |
| Phase 3 | 65% (+battle) | 10개 전체 | 3-5일 |
| Phase 4 | 75% (+edge cases) | 10+12 엣지 | 3-5일 |

### 8.2 커버리지 대상/비대상

| 카테고리 | 유닛 테스트 | E2E (MCP) | 비고 |
|---------|-----------|----------|------|
| data/index.js | ✅ | - | 순수 함수 |
| utils/ | ✅ | - | 순수 함수 |
| systems/ | ✅ | ✅ | 로직 + 연동 |
| scenes/ | ❌ | ✅ | Phaser 의존 |
| components/ | ❌ | ✅ | Phaser 의존 |
| services/ | ❌ | ✅ | Supabase 의존 |

---

## 9. 태스크 요약 및 우선순위

### Phase 1: 기반 구축 (3-4일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| QAT-FW-1~3 | Vitest 설치 + 설정 | S | P0 |
| QAT-LOG-1 | 에러 패턴 자동 탐지 | S | P0 |
| QAT-LOG-2 | 성능 타이머 삽입 | S | P0 |
| - | data/index.js 테스트 25개 | M | P0 |
| - | helpers.js 테스트 15개 | S | P0 |
| - | constants.js 무결성 테스트 10개 | S | P0 |

### Phase 2: 시스템 테스트 (5-7일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| - | MoodSystem 테스트 15개 | M | P0 |
| - | GachaSystem 테스트 20개 | M | P0 |
| - | EnergySystem 테스트 10개 | S | P1 |
| - | SynergySystem 테스트 15개 | M | P1 |
| - | ProgressionSystem 테스트 10개 | S | P1 |
| - | BattleSystem 테스트 20개 | L | P1 |

### Phase 3: MCP 통합 (5-7일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| QAT-MCP-1~8 | MCP 도구 8종 구현 | L | P1 |
| QAT-MCP-9~10 | IPC Bridge + 게임 expose | M | P1 |
| - | 핵심 E2E 시나리오 10개 자동화 | L | P1 |
| QAT-LOG-4~5 | 로그 수집 자동화 | M | P2 |

### Phase 4: CI + 엣지케이스 (3-5일)
| ID | 태스크 | 복잡도 | 우선순위 |
|----|--------|--------|---------|
| QAT-CI-1 | GitHub Actions PR 검증 | M | P2 |
| QAT-CI-2 | 데이터 검증 Job | S | P2 |
| - | 엣지 케이스 12개 자동화 | L | P2 |
| - | 성능 테스트 자동화 | M | P3 |

### 복잡도 범례
- **S**: 1-2시간 / **M**: 3-8시간 / **L**: 1-2일

---

## 10. 검증 기준 총괄

| 항목 | 기준 |
|------|------|
| 유닛 테스트 | `npm run test` → 전체 PASS |
| 커버리지 | data+utils+systems ≥ 65% |
| E2E (핵심) | 10개 시나리오 전부 PASS |
| E2E (엣지) | 12개 시나리오 중 10개↑ PASS |
| CI/CD | PR 자동 검증 green |
| 로그 | ERROR 0건 (플레이 세션 중) |
| 번들 | gzip < 600KB (테스트 제외) |
| 성능 | 전투 55fps↑, 로딩 3초↓ |

---

## 11. 관련 문서

- [15_COMPATIBILITY_LINT.md](./15_COMPATIBILITY_LINT.md) — 데이터 스키마 검증 (SCHEMA 태스크 연계)
- [19_TYPESCRIPT_OPTIMIZATION.md](./19_TYPESCRIPT_OPTIMIZATION.md) — TS 전환 (Vitest + TS 연계)
- [03_ARCHITECTURE.md](./03_ARCHITECTURE.md) — 아키텍처 (시스템 의존성)
- `done/testing/` — 기존 수동 테스트 문서 (참조)

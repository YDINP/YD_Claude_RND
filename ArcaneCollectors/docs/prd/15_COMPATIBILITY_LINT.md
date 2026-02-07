# 15. 호환성·린트·검증 계획 PRD

## 문서 정보
- **버전**: 1.0
- **작성일**: 2026-02-07
- **프로젝트**: ArcaneCollectors (Phaser 3 Web RPG)
- **목적**: 타입 호환성, 린트 강화, 데이터 스키마 검증을 통한 코드 품질 향상

---

## 1. 타입 호환성 점검 (Type Compatibility Audit)

### 1.1 현재 상태 분석

**알려진 불일치 사항:**
- Rarity 타입: 일부 시스템은 number (1-5), 다른 시스템은 string ('N','R','SR','SSR','UR')
- Stats 스키마: characters.json은 `stats`, enemies.json은 `baseStats`
- ownedHeroes 스키마: GachaScene과 SaveManager 간 형식 차이
- System-to-Scene 인터페이스: 반환 데이터 형식 불일치

### 1.2 태스크 세부 사항

#### COMPAT-1.1: Rarity 타입 통합
**설명**: 전체 코드베이스에서 rarity 타입 사용 패턴 통일
**복잡도**: Medium
**의존성**: 없음
**세부 작업**:
- COMPAT-1.1.1: rarity 사용 현황 전수 조사 (Grep 도구 활용)
- COMPAT-1.1.2: `src/utils/rarityUtils.js` 헬퍼 함수 강화
  ```javascript
  // 표준 형식: number (1-5)
  export const RARITY = { N: 1, R: 2, SR: 3, SSR: 4, UR: 5 };
  export const getRarityKey = (num) => Object.keys(RARITY).find(k => RARITY[k] === num);
  export const getRarityNum = (key) => RARITY[key] || 1;
  export const isValidRarity = (value) => { /* 검증 로직 */ };
  ```
- COMPAT-1.1.3: 모든 시스템에서 `rarityUtils` import 및 적용
- COMPAT-1.1.4: JSON 데이터 일괄 변환 (number로 통일)
**검증 기준**:
- [ ] 모든 rarity 참조가 rarityUtils를 통해 이루어짐
- [ ] characters.json, equipment.json의 rarity 필드가 number 타입
- [ ] 린트 에러 0건

#### COMPAT-1.2: Stats 스키마 통일
**설명**: characters.json과 enemies.json 간 stats 필드명 통일
**복잡도**: High
**의존성**: COMPAT-1.1
**세부 작업**:
- COMPAT-1.2.1: 스키마 표준 정의
  ```javascript
  // 표준: stats (기본 스탯)
  {
    "stats": { "hp": 100, "atk": 20, "def": 10, "spd": 15, "crit": 5, "critDmg": 150 }
  }
  ```
- COMPAT-1.2.2: enemies.json의 `baseStats` → `stats` 일괄 변경
- COMPAT-1.2.3: BattleSystem.js에서 stats 접근 로직 통일
- COMPAT-1.2.4: 모든 Scene에서 stats 접근 패턴 수정
**검증 기준**:
- [ ] characters.json과 enemies.json이 동일한 stats 스키마 사용
- [ ] BattleSystem.loadCharacter/loadEnemy 정상 동작
- [ ] 전투 진입 시 스탯 계산 오류 0건

#### COMPAT-1.3: ownedHeroes 스키마 통일
**설명**: GachaScene과 SaveManager 간 영웅 데이터 형식 표준화
**복잡도**: Medium
**의존성**: COMPAT-1.2
**세부 작업**:
- COMPAT-1.3.1: 표준 스키마 정의 (SaveManager 형식 우선)
  ```javascript
  {
    "id": "char_001",
    "rarity": 5,
    "level": 1,
    "exp": 0,
    "constellation": 0, // 돌파 단계
    "equipment": { "weapon": null, "armor": null, "accessory": null },
    "acquiredAt": "2026-02-07T12:34:56.789Z"
  }
  ```
- COMPAT-1.3.2: GachaScene의 `normalizeHero` 함수 검증 및 개선
- COMPAT-1.3.3: SaveManager의 `saveHero`/`loadHero` 검증
- COMPAT-1.3.4: HeroDetailScene 로드 로직 검증
**검증 기준**:
- [ ] 가챠 획득 → 저장 → 로드 → 상세보기 전체 플로우 정상 동작
- [ ] 스키마 불일치로 인한 에러 0건
- [ ] 기존 저장 데이터 마이그레이션 스크립트 작성

#### COMPAT-1.4: System-to-Scene 인터페이스 문서화
**설명**: 각 시스템의 공개 API 및 반환 타입 명세 작성
**복잡도**: High
**의존성**: COMPAT-1.1, COMPAT-1.2, COMPAT-1.3
**세부 작업**:
- COMPAT-1.4.1: 시스템별 인터페이스 문서 작성
  - BattleSystem: `startBattle(partyIds, stageId) → Promise<BattleResult>`
  - GachaSystem: `performGacha(type, count) → Promise<GachaResult[]>`
  - SaveManager: `save(key, data) → boolean`, `load(key) → any`
  - PartyManager: `getParty(slot) → Party`, `setParty(slot, heroIds) → boolean`
- COMPAT-1.4.2: JSDoc 타입 어노테이션 추가
  ```javascript
  /**
   * @typedef {Object} BattleResult
   * @property {boolean} victory
   * @property {number} goldEarned
   * @property {string[]} itemsDropped
   * @property {number} expGained
   */
  ```
- COMPAT-1.4.3: 인터페이스 문서 `docs/interfaces/SYSTEM_INTERFACES.md` 생성
**검증 기준**:
- [ ] 20개 시스템의 인터페이스 문서 완성
- [ ] JSDoc 커버리지 80% 이상
- [ ] eslint-plugin-jsdoc 규칙 통과

#### COMPAT-1.5: JSON 데이터 스키마 검증 도구 도입
**설명**: ajv 또는 커스텀 validator를 사용한 JSON 데이터 검증
**복잡도**: Medium
**의존성**: COMPAT-1.1, COMPAT-1.2
**세부 작업**:
- COMPAT-1.5.1: JSON Schema 정의 파일 작성 (`src/schemas/`)
  - `characterSchema.json`
  - `enemySchema.json`
  - `equipmentSchema.json`
  - `skillSchema.json`
  - `stageSchema.json`
  - `synergySchema.json`
  - `itemSchema.json`
- COMPAT-1.5.2: ajv 설치 및 검증 스크립트 작성 (`scripts/validate-data.js`)
- COMPAT-1.5.3: 빌드 파이프라인에 검증 단계 추가 (`package.json`)
  ```json
  "scripts": {
    "validate": "node scripts/validate-data.js",
    "prebuild": "npm run validate && npm run lint"
  }
  ```
- COMPAT-1.5.4: 런타임 검증 (개발 모드에서만)
  ```javascript
  if (import.meta.env.DEV) {
    validateData(characters, characterSchema);
  }
  ```
**검증 기준**:
- [ ] 모든 JSON 데이터가 스키마 검증 통과
- [ ] 빌드 시 자동 검증 실행
- [ ] 스키마 위반 시 명확한 에러 메시지 출력

---

## 2. ESLint 강화 계획

### 2.1 현재 상태
- ESLint 9.17.0 설치됨
- 기본 규칙만 적용 중 (`eslint.config.js`)
- Phaser 프로젝트 특화 규칙 없음

### 2.2 태스크 세부 사항

#### LINT-2.1: Phaser 특화 커스텀 규칙 추가
**설명**: Phaser 게임 프로젝트에 적합한 린트 규칙 세트 구성
**복잡도**: Low
**의존성**: 없음
**세부 작업**:
- LINT-2.1.1: `eslint.config.js` 확장
  ```javascript
  export default [
    // 기존 규칙
    {
      rules: {
        // Phaser 특화
        'no-magic-numbers': ['warn', { ignore: [0, 1, -1, 2] }],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
        'prefer-const': 'error',
        'no-var': 'error',
        'consistent-return': 'error',
        'no-shadow': 'error',
        'prefer-destructuring': ['warn', { object: true, array: false }],
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      }
    }
  ];
  ```
- LINT-2.1.2: Scene lifecycle 메서드 순서 규칙 (커스텀 플러그인)
- LINT-2.1.3: Singleton 패턴 검증 (시스템 클래스)
**검증 기준**:
- [ ] 전체 코드베이스 린트 실행 시 새로운 규칙 적용 확인
- [ ] 기존 코드의 주요 위반 사항 수정

#### LINT-2.2: JSDoc 타입 어노테이션 린트
**설명**: eslint-plugin-jsdoc를 사용한 JSDoc 검증
**복잡도**: Medium
**의존성**: COMPAT-1.4
**세부 작업**:
- LINT-2.2.1: `eslint-plugin-jsdoc` 설치
  ```bash
  npm install --save-dev eslint-plugin-jsdoc
  ```
- LINT-2.2.2: JSDoc 규칙 설정
  ```javascript
  import jsdoc from 'eslint-plugin-jsdoc';
  export default [
    jsdoc.configs['flat/recommended'],
    {
      rules: {
        'jsdoc/require-jsdoc': ['warn', {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true
          }
        }],
        'jsdoc/require-param-type': 'error',
        'jsdoc/require-returns-type': 'error',
        'jsdoc/check-types': 'error'
      }
    }
  ];
  ```
- LINT-2.2.3: 시스템 클래스 JSDoc 작성 (20개 시스템)
- LINT-2.2.4: Scene 클래스 JSDoc 작성 (15개 씬)
**검증 기준**:
- [ ] 모든 공개 메서드에 JSDoc 주석 존재
- [ ] JSDoc 타입 어노테이션이 실제 코드와 일치
- [ ] eslint-plugin-jsdoc 규칙 100% 통과

#### LINT-2.3: 데이터 접근 패턴 린트
**설명**: 직접 JSON import 대신 `data/index.js` 헬퍼 사용 강제
**복잡도**: Low
**의존성**: 없음
**세부 작업**:
- LINT-2.3.1: 커스텀 ESLint 규칙 작성
  ```javascript
  // scripts/eslint-rules/no-direct-json-import.js
  module.exports = {
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow direct JSON imports, use data/index.js helpers',
      },
    },
    create(context) {
      return {
        ImportDeclaration(node) {
          if (node.source.value.endsWith('.json')) {
            context.report({
              node,
              message: 'Use data/index.js helpers instead of direct JSON import',
            });
          }
        },
      };
    },
  };
  ```
- LINT-2.3.2: 규칙 활성화 및 기존 코드 수정
**검증 기준**:
- [ ] `.json` 직접 import 0건 (헬퍼 함수 사용으로 전환)
- [ ] 린트 통과

#### LINT-2.4: Import 순서 정리
**설명**: eslint-plugin-import를 사용한 import 문 정렬
**복잡도**: Low
**의존성**: 없음
**세부 작업**:
- LINT-2.4.1: `eslint-plugin-import` 설치
  ```bash
  npm install --save-dev eslint-plugin-import
  ```
- LINT-2.4.2: Import 순서 규칙 설정
  ```javascript
  {
    'import/order': ['error', {
      'groups': [
        'builtin',  // Node.js 내장 모듈
        'external', // npm 패키지
        'internal', // 프로젝트 내부 모듈
        'parent',   // 상위 디렉토리
        'sibling',  // 같은 디렉토리
        'index'     // index 파일
      ],
      'newlines-between': 'always',
      'alphabetize': { order: 'asc', caseInsensitive: true }
    }]
  }
  ```
- LINT-2.4.3: Prettier와 통합 (import 정렬)
**검증 기준**:
- [ ] 모든 파일의 import 문이 규칙에 따라 정렬됨
- [ ] `npm run lint --fix` 실행 시 자동 정렬

---

## 3. 데이터 스키마 검증 (Runtime + Build-time)

### 3.1 태스크 세부 사항

#### SCHEMA-3.1: JSON Schema 정의
**설명**: 모든 데이터 파일에 대한 JSON Schema 작성
**복잡도**: High
**의존성**: COMPAT-1.5
**세부 작업**:
- SCHEMA-3.1.1: `src/schemas/characterSchema.json`
  ```json
  {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "array",
    "items": {
      "type": "object",
      "required": ["id", "name", "mood", "cult", "class", "rarity", "stats"],
      "properties": {
        "id": { "type": "string", "pattern": "^char_[0-9]{3}$" },
        "name": { "type": "string", "minLength": 1 },
        "mood": { "enum": ["brave", "fierce", "wild", "calm", "stoic", "devoted", "cunning", "noble", "mystic"] },
        "cult": { "enum": ["olympus", "takamagahara", "yomi", "asgard", "valhalla", "tartarus", "avalon", "helheim", "kunlun"] },
        "class": { "enum": ["warrior", "mage", "healer", "archer"] },
        "rarity": { "type": "integer", "minimum": 1, "maximum": 5 },
        "stats": {
          "type": "object",
          "required": ["hp", "atk", "def", "spd", "crit", "critDmg"],
          "properties": {
            "hp": { "type": "integer", "minimum": 1 },
            "atk": { "type": "integer", "minimum": 1 },
            "def": { "type": "integer", "minimum": 0 },
            "spd": { "type": "integer", "minimum": 1 },
            "crit": { "type": "number", "minimum": 0, "maximum": 100 },
            "critDmg": { "type": "number", "minimum": 100 }
          }
        }
      }
    }
  }
  ```
- SCHEMA-3.1.2: 나머지 스키마 작성 (enemies, equipment, items, stages, synergies, skills, tower, quests)
**검증 기준**:
- [ ] 9개 주요 JSON 데이터 파일의 스키마 완성
- [ ] 스키마 자체의 유효성 검증 (draft-07 표준 준수)

#### SCHEMA-3.2: 빌드 시 자동 검증 스크립트
**설명**: `scripts/validate-data.js` 작성 및 빌드 파이프라인 통합
**복잡도**: Medium
**의존성**: SCHEMA-3.1
**세부 작업**:
- SCHEMA-3.2.1: 검증 스크립트 작성
  ```javascript
  import Ajv from 'ajv';
  import fs from 'fs';
  import path from 'path';

  const ajv = new Ajv({ allErrors: true });

  const dataFiles = [
    { data: 'characters.json', schema: 'characterSchema.json' },
    { data: 'enemies.json', schema: 'enemySchema.json' },
    // ... 나머지
  ];

  let hasErrors = false;

  dataFiles.forEach(({ data, schema }) => {
    const dataPath = path.join('src/data', data);
    const schemaPath = path.join('src/schemas', schema);

    const jsonData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const jsonSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    const validate = ajv.compile(jsonSchema);
    const valid = validate(jsonData);

    if (!valid) {
      console.error(`❌ ${data} validation failed:`);
      console.error(validate.errors);
      hasErrors = true;
    } else {
      console.log(`✅ ${data} validated successfully`);
    }
  });

  if (hasErrors) {
    process.exit(1);
  }
  ```
- SCHEMA-3.2.2: `package.json`에 스크립트 추가
  ```json
  {
    "scripts": {
      "validate": "node scripts/validate-data.js",
      "prebuild": "npm run validate && npm run lint",
      "predev": "npm run validate"
    }
  }
  ```
**검증 기준**:
- [ ] `npm run validate` 실행 시 모든 데이터 검증
- [ ] 스키마 위반 시 명확한 에러 메시지 및 빌드 실패
- [ ] CI/CD 파이프라인에 통합

#### SCHEMA-3.3: 런타임 검증 (개발 모드)
**설명**: 개발 모드에서만 런타임 데이터 검증 활성화
**복잡도**: Low
**의존성**: SCHEMA-3.1
**세부 작업**:
- SCHEMA-3.3.1: `src/utils/validator.js` 작성
  ```javascript
  import Ajv from 'ajv';

  const ajv = new Ajv({ allErrors: true });
  let schemasLoaded = false;

  export function validateData(data, schemaName) {
    if (!import.meta.env.DEV) return true; // 프로덕션에서는 스킵

    if (!schemasLoaded) {
      // 스키마 로드 (동적 import)
      // ...
      schemasLoaded = true;
    }

    const validate = ajv.getSchema(schemaName);
    const valid = validate(data);

    if (!valid) {
      console.error(`Runtime validation failed for ${schemaName}:`, validate.errors);
      return false;
    }

    return true;
  }
  ```
- SCHEMA-3.3.2: 데이터 로드 시점에 검증 호출
  ```javascript
  // src/data/index.js
  import { validateData } from '../utils/validator.js';

  export function getCharacters() {
    const data = charactersData;
    validateData(data, 'characterSchema');
    return data;
  }
  ```
**검증 기준**:
- [ ] 개발 모드에서 잘못된 데이터 로드 시 콘솔 에러 출력
- [ ] 프로덕션 빌드에서는 검증 코드 제거 (tree-shaking)

#### SCHEMA-3.4: 필수 필드 체크리스트
**설명**: 각 JSON 데이터의 필수 필드 목록 문서화
**복잡도**: Low
**의존성**: SCHEMA-3.1
**세부 작업**:
- SCHEMA-3.4.1: `docs/data/REQUIRED_FIELDS.md` 작성
  ```markdown
  ## characters.json
  - id (string, pattern: char_XXX)
  - name (string)
  - mood (enum: 9종)
  - cult (enum: 9종)
  - class (enum: 4종)
  - rarity (integer: 1-5)
  - stats (object: hp, atk, def, spd, crit, critDmg)

  ## enemies.json
  - id (string, pattern: enemy_XXX)
  - ...
  ```
- SCHEMA-3.4.2: 스키마 파일과 문서 동기화 스크립트
**검증 기준**:
- [ ] 모든 데이터 타입의 필수 필드 문서 완성
- [ ] 스키마 변경 시 문서 자동 업데이트

#### SCHEMA-3.5: 상호 참조 무결성 검증
**설명**: 데이터 간 외래 키 관계 검증 (예: synergies의 characterId가 characters에 존재하는지)
**복잡도**: High
**의존성**: SCHEMA-3.2
**세부 작업**:
- SCHEMA-3.5.1: 참조 관계 정의
  ```javascript
  const references = [
    { from: 'synergies', field: 'requirements.characters', to: 'characters', key: 'id' },
    { from: 'stages', field: 'enemies', to: 'enemies', key: 'id' },
    { from: 'quests', field: 'rewards.items', to: 'items', key: 'id' },
    // ...
  ];
  ```
- SCHEMA-3.5.2: 참조 검증 함수 작성
  ```javascript
  function validateReferences(references, dataMap) {
    references.forEach(ref => {
      const fromData = dataMap[ref.from];
      const toData = dataMap[ref.to];
      const toIds = new Set(toData.map(item => item[ref.key]));

      fromData.forEach(item => {
        const refIds = getNestedValue(item, ref.field); // 중첩 필드 처리
        refIds.forEach(refId => {
          if (!toIds.has(refId)) {
            console.error(`❌ Reference error: ${ref.from}.${ref.field} references non-existent ${ref.to}.${ref.key}: ${refId}`);
          }
        });
      });
    });
  }
  ```
- SCHEMA-3.5.3: `scripts/validate-data.js`에 통합
**검증 기준**:
- [ ] 모든 참조 관계 검증 통과
- [ ] 존재하지 않는 ID 참조 시 명확한 에러 메시지

---

## 4. 시스템간 인터페이스 검증

### 4.1 태스크 세부 사항

#### INTERFACE-4.1: Scene → System 호출 규약 문서화
**설명**: Scene에서 System을 호출할 때의 매개변수/반환값 명세
**복잡도**: High
**의존성**: COMPAT-1.4
**세부 작업**:
- INTERFACE-4.1.1: 호출 규약 문서 작성 (`docs/interfaces/SCENE_SYSTEM_CALLS.md`)
  ```markdown
  ## BattleScene → BattleSystem

  ### startBattle(partyIds, stageId)
  **Parameters:**
  - partyIds: string[] - 파티원 캐릭터 ID 배열 (최대 4명)
  - stageId: string - 스테이지 ID (예: "stage_001")

  **Returns:** Promise<BattleResult>
  ```javascript
  {
    victory: boolean,
    goldEarned: number,
    itemsDropped: string[],
    expGained: number,
    turns: number
  }
  ```

  ### calculateDamage(attacker, defender, skill)
  **Parameters:**
  - attacker: Character
  - defender: Character
  - skill: Skill

  **Returns:** DamageResult
  ```javascript
  {
    damage: number,
    isCritical: boolean,
    moodAdvantage: number, // -0.2, 0, +0.2
    synergyBonuses: string[]
  }
  ```
  ```
- INTERFACE-4.1.2: 20개 시스템의 주요 메서드 문서화
**검증 기준**:
- [ ] 각 Scene이 호출하는 System 메서드 100% 문서화
- [ ] 매개변수/반환값 타입이 실제 코드와 일치

#### INTERFACE-4.2: System → System 의존성 맵
**설명**: 시스템 간 호출 관계 시각화 및 순환 의존성 검증
**복잡도**: Medium
**의존성**: INTERFACE-4.1
**세부 작업**:
- INTERFACE-4.2.1: 의존성 그래프 생성 스크립트
  ```javascript
  // scripts/generate-dependency-graph.js
  // AST 파싱하여 import 문 추출 → Mermaid 다이어그램 생성
  ```
- INTERFACE-4.2.2: 순환 의존성 검출 및 경고
- INTERFACE-4.2.3: 의존성 맵 문서 (`docs/architecture/SYSTEM_DEPENDENCIES.md`)
  ```mermaid
  graph TD
    BattleScene --> BattleSystem
    BattleSystem --> MoodSystem
    BattleSystem --> SynergySystem
    MoodSystem --> constants
    SynergySystem --> data/index
  ```
**검증 기준**:
- [ ] 시스템 간 의존성 그래프 생성
- [ ] 순환 의존성 0건
- [ ] 의존성 깊이 3단계 이하 유지

#### INTERFACE-4.3: EventBus 이벤트 타입 정의
**설명**: Phaser EventEmitter를 통한 이벤트 통신 명세
**복잡도**: Medium
**의존성**: INTERFACE-4.1
**세부 작업**:
- INTERFACE-4.3.1: 이벤트 타입 정의 파일 (`src/types/events.js`)
  ```javascript
  /**
   * @typedef {Object} BattleEvents
   * @property {string} TURN_START - 'battle:turnStart'
   * @property {string} ATTACK - 'battle:attack'
   * @property {string} DAMAGE - 'battle:damage'
   * @property {string} HEAL - 'battle:heal'
   * @property {string} BUFF_APPLIED - 'battle:buffApplied'
   * @property {string} VICTORY - 'battle:victory'
   * @property {string} DEFEAT - 'battle:defeat'
   */
  export const BATTLE_EVENTS = {
    TURN_START: 'battle:turnStart',
    ATTACK: 'battle:attack',
    // ...
  };

  /**
   * @typedef {Object} TurnStartPayload
   * @property {number} turnNumber
   * @property {string} activeCharacterId
   */
  ```
- INTERFACE-4.3.2: 이벤트 발행/구독 패턴 문서화
- INTERFACE-4.3.3: 린트 규칙: 이벤트 이름은 상수 사용 강제
**검증 기준**:
- [ ] 모든 커스텀 이벤트 타입 정의됨
- [ ] 이벤트 payload 타입 문서화
- [ ] 하드코딩 이벤트 문자열 0건

#### INTERFACE-4.4: SaveManager 데이터 구조 계약
**설명**: 저장/로드 데이터의 스키마 명세
**복잡도**: Medium
**의존성**: COMPAT-1.3
**세부 작업**:
- INTERFACE-4.4.1: 저장 데이터 스키마 정의 (`src/schemas/saveDataSchema.json`)
  ```json
  {
    "saveVersion": "1.0.0",
    "player": {
      "name": "string",
      "level": "integer",
      "exp": "integer",
      "gold": "integer",
      "gems": "integer"
    },
    "ownedHeroes": [
      { /* COMPAT-1.3의 표준 스키마 */ }
    ],
    "parties": {
      "1": ["char_001", "char_002", "char_003", "char_004"],
      "2": [...]
    },
    "inventory": {
      "equipment": [...],
      "items": [...]
    },
    "progress": {
      "currentStage": "stage_001",
      "completedStages": [...],
      "tower": { "floor": 1 }
    }
  }
  ```
- INTERFACE-4.4.2: SaveManager의 `validateSaveData` 메서드 추가
- INTERFACE-4.4.3: 버전 마이그레이션 로직 (`migrateFromV1toV2` 등)
**검증 기준**:
- [ ] 저장 데이터 스키마 문서 완성
- [ ] 로드 시 스키마 검증 실행
- [ ] 구버전 데이터 자동 마이그레이션

---

## 5. 빌드 타임 검증 파이프라인

### 5.1 태스크 세부 사항

#### PIPELINE-5.1: Pre-commit Hook 설정
**설명**: Husky + lint-staged를 사용한 커밋 전 자동 검증
**복잡도**: Low
**의존성**: LINT-2.1, SCHEMA-3.2
**세부 작업**:
- PIPELINE-5.1.1: Husky 설치 및 초기화
  ```bash
  npm install --save-dev husky lint-staged
  npx husky init
  ```
- PIPELINE-5.1.2: `.husky/pre-commit` 작성
  ```bash
  #!/bin/sh
  npx lint-staged
  ```
- PIPELINE-5.1.3: `package.json`에 lint-staged 설정
  ```json
  {
    "lint-staged": {
      "*.js": [
        "eslint --fix",
        "prettier --write"
      ],
      "src/data/*.json": [
        "node scripts/validate-data.js"
      ]
    }
  }
  ```
**검증 기준**:
- [ ] 커밋 시 자동으로 lint + format + 데이터 검증 실행
- [ ] 검증 실패 시 커밋 중단

#### PIPELINE-5.2: CI/CD 통합 (GitHub Actions)
**설명**: GitHub Actions를 통한 자동 빌드 및 검증
**복잡도**: Medium
**의존성**: PIPELINE-5.1
**세부 작업**:
- PIPELINE-5.2.1: `.github/workflows/ci.yml` 작성
  ```yaml
  name: CI

  on:
    push:
      branches: [main, develop, arcane/integration]
    pull_request:
      branches: [main]

  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
          with:
            node-version: '20'
        - run: npm ci
        - run: npm run validate
        - run: npm run lint
        - run: npm run build
        - name: Check bundle size
          run: |
            SIZE=$(stat -c%s "dist/assets/index-*.js" | awk '{sum+=$1} END {print sum}')
            MAX_SIZE=1638400  # 1600KB
            if [ $SIZE -gt $MAX_SIZE ]; then
              echo "Bundle size $SIZE exceeds limit $MAX_SIZE"
              exit 1
            fi
  ```
- PIPELINE-5.2.2: PR 머지 전 필수 검증 설정
**검증 기준**:
- [ ] 푸시 시 자동으로 CI 실행
- [ ] 모든 검증 단계 통과 시에만 머지 가능

#### PIPELINE-5.3: 번들 사이즈 경고
**설명**: Vite 빌드 후 번들 사이즈 검증 (현재 1600KB limit)
**복잡도**: Low
**의존성**: PIPELINE-5.2
**세부 작업**:
- PIPELINE-5.3.1: `vite.config.js`에 빌드 후 스크립트 추가
  ```javascript
  export default defineConfig({
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ['phaser'],
            data: ['./src/data/index.js']
          }
        }
      }
    },
    plugins: [
      {
        name: 'bundle-size-check',
        closeBundle() {
          // 번들 사이즈 체크 로직
        }
      }
    ]
  });
  ```
- PIPELINE-5.3.2: 번들 사이즈 리포트 생성 (rollup-plugin-visualizer)
**검증 기준**:
- [ ] 빌드 후 번들 사이즈 자동 체크
- [ ] 1600KB 초과 시 경고 또는 빌드 실패

#### PIPELINE-5.4: Phase별 우선순위
**설명**: 검증 파이프라인을 3개 Phase로 분할 운영
**복잡도**: Low
**의존성**: 모든 태스크
**세부 작업**:
- PIPELINE-5.4.1: Phase 1 (즉시 적용)
  - COMPAT-1.1 (Rarity 타입 통합)
  - LINT-2.1 (Phaser 특화 규칙)
  - SCHEMA-3.1 (JSON Schema 정의)
  - PIPELINE-5.1 (Pre-commit hook)
- PIPELINE-5.4.2: Phase 2 (1주 이내)
  - COMPAT-1.2 (Stats 스키마 통일)
  - COMPAT-1.3 (ownedHeroes 스키마)
  - LINT-2.2 (JSDoc 린트)
  - SCHEMA-3.2 (빌드 시 검증)
  - PIPELINE-5.2 (CI/CD)
- PIPELINE-5.4.3: Phase 3 (2주 이내)
  - COMPAT-1.4 (인터페이스 문서화)
  - COMPAT-1.5 (검증 도구 도입)
  - LINT-2.3, 2.4 (데이터 접근 패턴, import 순서)
  - SCHEMA-3.3~3.5 (런타임 검증, 참조 무결성)
  - INTERFACE-4.1~4.4 (시스템 인터페이스)
  - PIPELINE-5.3 (번들 사이즈)
**검증 기준**:
- [ ] 각 Phase 완료 시 모든 해당 태스크 검증 통과
- [ ] Phase 3 완료 시 전체 검증 파이프라인 가동

---

## 6. 전체 검증 기준

### 6.1 Phase 1 완료 기준
- [ ] Rarity 타입이 전체 코드베이스에서 통일됨 (number 1-5)
- [ ] Phaser 특화 ESLint 규칙 적용 및 주요 위반 수정
- [ ] 9개 JSON 데이터의 스키마 정의 완성
- [ ] Pre-commit hook 설정 완료

### 6.2 Phase 2 완료 기준
- [ ] Stats 스키마 통일 (stats 필드로 일원화)
- [ ] ownedHeroes 스키마 표준화 및 마이그레이션
- [ ] 20개 시스템의 JSDoc 커버리지 80% 이상
- [ ] 빌드 시 자동 데이터 검증 실행
- [ ] GitHub Actions CI 파이프라인 가동

### 6.3 Phase 3 완료 기준
- [ ] 모든 시스템 인터페이스 문서화 완성
- [ ] 시스템 간 순환 의존성 0건
- [ ] EventBus 이벤트 타입 100% 정의
- [ ] 저장 데이터 스키마 검증 및 마이그레이션 로직 구현
- [ ] 런타임 검증 (개발 모드) 활성화
- [ ] 데이터 참조 무결성 검증 통과
- [ ] 번들 사이즈 1600KB 이하 유지

### 6.4 최종 검증
```bash
# 전체 검증 실행
npm run validate        # 데이터 스키마 검증
npm run lint            # ESLint 검증
npm run build           # 빌드 + 번들 사이즈 검증

# 결과: 모든 검증 통과, 에러 0건
```

---

## 7. 참고 자료

- **관련 문서**:
  - `docs/interfaces/SYSTEM_INTERFACES.md` (COMPAT-1.4에서 생성 예정)
  - `docs/architecture/SYSTEM_DEPENDENCIES.md` (INTERFACE-4.2에서 생성 예정)
  - `docs/data/REQUIRED_FIELDS.md` (SCHEMA-3.4에서 생성 예정)

- **도구 및 라이브러리**:
  - [ajv](https://ajv.js.org/) - JSON Schema 검증
  - [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc)
  - [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import)
  - [Husky](https://typicode.github.io/husky/)
  - [lint-staged](https://github.com/okonet/lint-staged)

- **JSON Schema 표준**:
  - [JSON Schema Draft-07](https://json-schema.org/draft-07/schema)

---

**문서 버전**: 1.0
**마지막 업데이트**: 2026-02-07
**작성자**: Claude (Sonnet 4.5)

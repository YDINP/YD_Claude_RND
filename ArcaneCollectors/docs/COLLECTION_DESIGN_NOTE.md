# COLL-01 — 컬렉션 시스템 설계노트 (S-1 / C-4 / S-2 구체화)

> **작성일**: 2026-08-25
> **상위 문서**: `docs/EVOLUTION_SYSTEM_GDD.md` v2.0 — §2-4(다중 루트 개방), §5(재화), §7-4(저장 스키마), §8 MoSCoW의 S-1/C-4/S-2
> **대상 데이터**: `src/data/base-heroes.json`(기본영웅 10명 × ascensionRoutes 24루트), `src/data/ascended-heroes.json`(`collectionId` 필드)
> **목표**: 이 문서만 읽고 바로 코딩에 들어갈 수 있는 수준 — 트리거 조건·공식·비용표·인터페이스 시그니처·저장 필드 전부 확정값 제시

---

## 0. 용어 및 데이터 근거

| 용어 | 정의 | 데이터 위치 |
|------|------|------------|
| 기본영웅 (baseHero) | 수집의 축. 10명 | `base-heroes.json[].id` |
| 진화 루트 (route) | `{cultId, ascendedHeroId, resultRarity, ...}` | `baseHeroes[].ascensionRoutes[]` |
| 컬렉션 (collection) | 한 기본영웅의 루트 완성도 단위 | `ascended-heroes.json[].collectionId` |
| 개방 (open) | 해당 루트의 전직 영웅을 실제 보유한 상태 | SaveManager `baseHeroes[n].openedRoutes[]` |

**컬렉션 10개 / 총 루트 24개**:

| collectionId | 기본영웅 | 루트 (cultId · 등급 · 공명) | 루트 수 |
|--------------|---------|---------------------------|--------|
| iris_collection | 아이리스 | olympus·SSR / valhalla·SSR(공명) / chaos·SSR | 3 |
| sera_collection | 세라 | avalon·SSR(공명) / kunlun·SR / nature·SR | 3 |
| luca_collection | 루카 | asgard·SSR(공명) / tartarus·SR | 2 |
| kai_collection | 카이 | yomi·SSR / helheim·SR(공명) | 2 |
| lin_collection | 린 | takamagahara·SSR(공명) / balance·R | 2 |
| omar_collection | 오마르 | valhalla·SR / avalon·SR | 2 |
| sol_collection | 솔 | nature·SSR(공명) / kunlun·SR | 2 |
| hana_collection | 하나 | yomi·SSR / helheim·R / chaos·SSR | 3 |
| leon_collection | 레온 | asgard·SR / olympus·SSR | 2 |
| paolo_collection | 파올로 | tartarus·SSR(공명) / chaos·SSR / balance·R | 3 |

---

## 1. S-1 — 컬렉션 진행도 (트리거 조건)

### 1-1. 진행도 계산

```
obtainedRoutes(baseHeroId) = openedRoutes ∩ ascensionRoutes.cultId   // 실보유 전직 기준
rate    = |obtainedRoutes| / routes.length                            // 소수 (0.0 ~ 1.0)
tier    = TIER_OF(rate, routes.length)
```

### 1-2. 티어 판정 (확정)

| Tier | 조건 | 명칭 |
|------|------|------|
| 0 | rate == 0 | — |
| **1** | `|obtainedRoutes| >= ceil(routes.length / 2)` (과반) | 공명 각인 (Resonance Seal) |
| **2** | `|obtainedRoutes| == routes.length` (전체 완성) | 운명 완성 (Destiny Complete) |

예: 3루트 영웅 → Tier1은 2루트부터, 2루트 영웅 → 1루트부터 Tier1.

> 판정은 **항상 저장된 보유 목록에서 재계산한다(파생값 비저장)**. obtained 목록만 저장하면 티어/완성일은 유도 가능 → 마이그레이션·정합성 문제 최소화.

---

## 2. C-4 — 컬렉션 완성 보너스 (칭호 + 스탯)

### 2-1. 보너스 공식 (확정)

```
// 단위 컬렉션 보너스 — 같은 baseHeroId를 공유하는 "보유 중인" 전직 영웅에게 적용
Tier1: { hp: +0.03, atk: +0.03 }                       // +3%
Tier2: { hp: +0.06, atk: +0.06, def: +0.06, spd: +0.06 }  // +6% (Tier1 대체, 합산 아님)

// 계정 공용 보너스 — 컬렉션 10개 모두 Tier2 달성 시
AccountComplete: { atk: +0.02, def: +0.02 }            // 파티 전원

최종 스탯 = floor(baseStat × (1 + Σ applicable bonuses))
```

적용 순서와 다른 시스템과의 곱연산 관계:

```
최종 = baseStat
       × (1 + personalityBonus)        // PersonalitySystem
       × (1 + synergyPct/100)          // SynergySystem (cult/mood/role/special)
       × (1 + collectionBonus)         // ← 신규 (본 문서)
```

**밸런스 근거**: 교단 파티 시너지 4명(최대 +20~25%p)보다 낮게 잡아, 컬렉션은 "수집 동기"이지 파워크리프 수단이 아니도록 한다. Tier2 +6%는 전직 등급 격차(SSR vs SR 스탯 차 ≈ 15~20%)보다 작다.

### 2-2. 칭호 (확정 목록)

| collectionId | Tier1 칭호 | Tier2 칭호 |
|--------------|-----------|-----------|
| iris_collection | 번개의 각인 | 삼중뇌전의 주인 |
| sera_collection | 성약의 손길 | 생명의 세 가지 길 |
| luca_collection | 룬의 독자 | 마법의 집대성자 |
| kai_collection | 침묵의 낫 | 생사의 경계인 |
| lin_collection | 하늘의 인도자 | 균형의 사제 |
| omar_collection | 불굴의 방패 | 두 개의 성벽 |
| sol_collection | 대지의 화살 | 순환의 사수 |
| hana_collection | 황천의 그림자 | 경계 너머의 자 |
| leon_collection | 룬의 맹세 | 신벌의 용장 |
| paolo_collection | 분해의 공식 | 만물의 조율사 |

칭호는 `HeroDetailScene`/`MainMenuScene` 프로필에 표기하고 전투 스탯에는 영향 없음(보너스와 별개).

### 2-3. 적용 지점 (구현 위치)

- **단위 보너스**: `BattleUnitV2.applyPersonalityBonus()` 직후 또는 `HeroFactory.createCharacter()` 최종 스탯 산출 단계에서 `CollectionSystem.getTierBonus(baseHeroId)` 반영. BattleUnit은 `data.baseHeroId`(ascended-heroes.json에 존재)로 역참조.
- **계정 공용**: `BattleSystemV2.initBattle()`의 `calculateAdvancedSynergies()` 다음에 파티 전원에 일괄 적용.
- UI 배지: `PartyEditScene.js:414` 부근의 시너지 아이콘 라인에 `collection` 타입 추가(`⛪🎭⚔️✨` 옆 `📖`).

---

## 3. S-2 — 추가 루트 개방 (세계수의 씨앗)

### 3-1. 획득처 (확정)

| 획득처 | 수량 | 주기 | 비고 |
|--------|------|------|------|
| 극한 탑 20F+ 클리어 | 1 | 층당 최초 1회 + 주간 리셋 재클리어 1회 | TowerSystem 연동 필요 |
| 시즌 종료 랭크 보상 | 1~3 | 시즌별 | 골드 1 / 플래티넘 2 / 다이아 3 |
| 결제 패키지 | 1~5 | 상품별 | 유료 가속 포인트 |

목표 수급: 무과금 **월 4~6개**. 컬렉션 Tier1(2루트)까지는 무과금 도달 가능, Tier2(3루트 영웅)는 월 단위 장기 목표.

### 3-2. 개방 비용 로직 (확정 — GDD §2-4 "첫 진화 비용의 1.5배" 공식화)

```
n = 해당 기본영웅의 extraIndex (첫 추가 루트 = 1, 두 번째 = 2)
essenceCost = ceil(baseEssence[cultId] × 1.5^n)     // n승 누적
worldTreeSeeds = n                                   // 추가 루트당 1개씩 증가
institutionSeal = 1                                  // 첫 진화와 동일
awakeningFlame  = resultRarity === 'SSR' ? 3 : 0     // 첫 진화와 동일

baseEssence: SSR 루트 30 / SR 루트 20 / R 루트 10   // ascended-heroes.json acquisitionCost.cultEssence
```

### 3-3. 비용표 (전체 24루트, extraIndex별)

| extraIndex | SSR 루트 에센스 | SR 루트 에센스 | R 루트 에센스 | 씨앗 | 각인서 | 각성의 불꽃 |
|-----------|---------------|---------------|--------------|------|--------|-----------|
| 1 (2번째 루트) | ceil(30×1.5)=**45** | ceil(20×1.5)=**30** | ceil(10×1.5)=**15** | 1 | 1 | SSR 3 |
| 2 (3번째 루트) | ceil(30×2.25)=**68** | ceil(20×2.25)=**45** | ceil(10×2.25)=**23** | 2 | 1 | SSR 3 |

적용 예 — 아이리스(olympus 보유 상태에서):
- valhalla(SSR) 추가: 에센스(valhalla) 45 + 씨앗 1 + 각인서 1 + 불꽃 3
- 이후 chaos(SSR) 추가: 에센스(chaos) 68 + 씨앗 2 + 각인서 1 + 불꽃 3

### 3-4. 검증 규칙 & 에러 코드

| 검증 | 실패 시 error |
|------|--------------|
| 기본영웅 각성 완료 (`baseHeroes[n].awakened === true`) | `NOT_AWAKENED` |
| 요청 cultId가 ascensionRoutes에 존재 | `ROUTE_NOT_FOUND` |
| 미개방 루트 (`openedRoutes`에 없음) | `ALREADY_OPENED` |
| 재화 충분 (씨앗/에센스/각인서/불꽃) | `INSUFFICIENT_<RESOURCE>` |

성공 시: 재화 차감 → `openedRoutes.push(cultId)` → `SaveManager.addCharacter(ascendedHeroId)` → EventBus `CHARACTER_ADDED` + `COLLECTION_UPDATED` 발행.

---

## 4. CollectionSystem 인터페이스 초안

프로젝트 컨벤션(SynergySystem류 static 클래스 + SaveManager 로드/저장) 준수. 신규 파일 권장 위치: `src/systems/CollectionSystem.js`.

```js
import baseHeroesData from '../data/base-heroes.json';
import ascendedHeroesData from '../data/ascended-heroes.json';
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';

export class CollectionSystem {
  static BONUS_TIERS = {
    1: { hp: 0.03, atk: 0.03 },
    2: { hp: 0.06, atk: 0.06, def: 0.06, spd: 0.06 },
  };
  static ACCOUNT_COMPLETE_BONUS = { atk: 0.02, def: 0.02 };

  // ---- 조회 (S-1) ----
  /** @returns {{ baseHeroId, collectionId, total:number, obtained:string[], rate:number, tier:0|1|2 }} */
  static getProgress(baseHeroId, saveData = SaveManager.load()) {}

  /** 전체 컬렉션 진행도 배열 (도감 UI용) @returns {Array<Progress>} */
  static getAllProgress(saveData = SaveManager.load()) {}

  static isComplete(baseHeroId, saveData = SaveManager.load()) {}      // tier === 2

  // ---- 보너스 (C-4) ----
  /** 해당 기본영웅 계열에 적용될 스탯 배율 @returns {{hp,atk,def,spd}} (미달 시 전부 0) */
  static getTierBonus(baseHeroId, saveData = SaveManager.load()) {}

  /** 계정 공용 보너스 @returns {{atk,def}} */
  static getAccountWideBonus(saveData = SaveManager.load()) {}

  /** 칭호 반환 @returns {string|null} */
  static getTitle(baseHeroId, saveData = SaveManager.load()) {}

  /**
   * 전투 유닛 배열에 단위 보너스 일괄 반영 (unit.data.baseHeroId 역참조)
   * @param {Array<BattleUnit>} units 변형 대상 (in-place)
   * @returns {Array<BattleUnit>}
   */
  static applyCollectionBonuses(units, saveData = SaveManager.load()) {}

  // ---- 변경 (S-1 등록 / S-2 개방) ----
  /** 전직 영웅 획득 직후 호출 — obtained 등록 + 완성 이벤트 발행
   *  @fires COLLECTION_UPDATED @fires COLLECTION_COMPLETED */
  static registerAscension(saveData, ascendedHeroId) {}   // { added:boolean, tier:number }

  /** 추가 루트 개방 비용 미리보기
   *  @returns {{ worldTreeSeeds:number, cultEssence:{[cultId]:number}, institutionSeal:number, awakeningFlame:number }} */
  static getExtraRouteCost(baseHeroId, cultId) {}

  /** @returns {{ ok:boolean, reason?:'NOT_AWAKENED'|'ROUTE_NOT_FOUND'|'ALREADY_OPENED'|'INSUFFICIENT_WORLD_TREE_SEEDS'|... }} */
  static canOpenExtraRoute(baseHeroId, cultId, saveData = SaveManager.load()) {}

  /** S-2 핵심 — 비용 검증/차감/openedRoutes 갱신/addCharacter까지 원자적 실행
   *  @returns {{ success:boolean, error?:string, ascendedHeroId? }} */
  static openExtraRoute(saveData, baseHeroId, cultId) {}
}
```

EventBus 확장 (`src/systems/EventBus.js` GameEvents에 추가):

```js
COLLECTION_UPDATED:  'collection:updated',    // { collectionId, tier }
COLLECTION_COMPLETED:'collection:completed',  // { collectionId, title }
```

호출 지점:
- `registerAscension` — EvolutionSystem/GachaSystem이 전직 영웅 지급 직후 1회.
- `applyCollectionBonuses` — `BattleSystemV2.initBattle()` (synergy 계산 직후).
- `openExtraRoute` — 기관 선택 UI(EvolutionSystem 진화 플로우)의 "새 루트 개방" 버튼.

---

## 5. SaveManager 저장 필드 제안

`getDefaultSave()`(SaveManager.js:26)에 추가:

```js
resources: {
  gold: 10000,
  gems: 2700,
  summonTickets: 10,
  skillBooks: 0,
  characterShards: {},
  worldTreeSeeds: 0,          // ★ 신규 (S-2 재화)
},

collections: {                // ★ 신규 블록 (S-1/C-4)
  // [collectionId]: {
  //   obtained: ['asc_iris_olympus', 'asc_iris_valhalla'],  // 보유 확정 전직 영웅 id
  //   completedAt: null,                                     // tier 2 달성 타임스탬프 (표시용)
  //   titleClaimed: false                                    // 칭호 수령 여부 (UI)
  // }
},
```

`load()` 마이그레이션 가드 (CHAR-3 패턴 준수, SaveManager.js:118-120 바로 뒤):

```js
if (!data.collections) data.collections = {};
if (data.resources && data.resources.worldTreeSeeds === undefined) data.resources.worldTreeSeeds = 0;
if (!data.baseHeroes) data.baseHeroes = [];   // 기존 가드 유지 — openedRoutes는 GDD §7-4 스키마 그대로 사용
```

> 설계 의도: `tier/rate/bonus`는 저장하지 않고 `obtained`만 저장 → 티어 상향/보너스 수치 조정이 패치로 자동 반영되며 구세이브 정합성이 깨지지 않는다. Supabase 클라우드 동기화는 기존 `save()` 직렬화 경로를 그대로 타므로 별도 작업 불필요.

---

## 6. 구현 순서 및 테스트 체크리스트

**구현 순서** (의존성 방향):

1. SaveManager 필드 + 마이그레이션 가드 (§5) — 다른 모든 것의 선행.
2. `CollectionSystem` 조회 API(getProgress/isComplete/getTitle) + `registerAscension`.
3. C-4 보너스: `getTierBonus`/`getAccountWideBonus` + `BattleSystemV2.initBattle()` 연동.
4. S-2: `getExtraRouteCost`/`canOpenExtraRoute`/`openExtraRoute` + 세계수의 씨앗 획득처(탑 20F+ 보상 1줄 추가).
5. UI: 도감 진행도(HeroListScene), 칭호 배지(HeroDetailScene), 개방 버튼(진화 플로우).

**테스트 체크리스트** (vitest):

- [ ] 2루트 영웅 1루트 개방 = Tier1(+3%), 3루트 영웅 1루트 = Tier0
- [ ] 3루트 영웅 2루트 = Tier1, 3루트 = Tier2(+6%, 합산 아님 확인)
- [ ] 10/10 완성 시 account-wide +2%가 파티 4명 전원에 적용
- [ ] `openExtraRoute`: NOT_AWAKENED / ALREADY_OPENED / INSUFFICIENT_* 각각 거부, 성공 시 재화 차감+openedRoutes+addCharacter 원자성
- [ ] extraIndex 2 비용 = ceil(base×2.25), 씨앗 2
- [ ] 구버전 세이브(필드 없음) 로드 시 가드 동작, 크래시 없음
- [ ] 밸런스 회귀: Tier2 4명 파티 vs 시너지 4명 파티 전투 시뮬 승률 편차 ±5%p 이내

---

## 부록 A — 계산 예시 (아이리스 풀완성 플레이어)

```
보유: asc_iris_olympus(Lv60), asc_iris_valhalla(Lv60), asc_iris_chaos(Lv55)
progress: 3/3 → tier 2 → 보너스 HP/ATK/DEF/SPD +6%, 칭호 "삼중뇌전의 주인"

asc_iris_olympus Lv60 ATK 258 → floor(258 × 1.06) = 273
(추가로 계정 10/10 완성이면 ×1.02 → 278)

누적 비용 (olympus 최초 + valhalla + chaos 개방 시):
  에센스: 30 + 45 + 68 = 143 (olympus/valhalla/chaos 혼합)
  씨앗 3 · 각인서 3 · 각성의 불꽃 9
```

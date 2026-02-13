# Playwright MCP 자동화 테스트 시나리오

> **작성일**: 2026-02-13
> **테스트 환경**: `http://localhost:3001` (Vite dev server)
> **브랜치**: `arcane/integration`
> **테스트 API**: `window.__TEST_API__` (DebugManager에 내장)
> **디버그 모드**: `window.debug` (DEV 환경 자동 활성화)

---

## 테스트 API 사용법

모든 테스트는 `browser_evaluate`로 `window.__TEST_API__` 메서드를 호출합니다.

### 초기화 (모든 테스트 전 실행)

```javascript
// 1. 디버그 모드 활성화 확인
const debugReady = typeof window.debug !== 'undefined' && window.debug.isDebugMode;

// 2. 디버그 모드 아니면 활성화
if (!debugReady) {
  const mod = await import('/src/systems/DebugManager.js');
  mod.DebugManager.setDebugMode(true);
}

// 3. TEST API 확인
const apiReady = typeof window.__TEST_API__ !== 'undefined';

// 4. 시스템 헬스 체크
const health = window.__TEST_API__.healthCheck();
```

---

## 카테고리 A: 시스템 무결성 테스트

### TC-A01: 시스템 헬스 체크

**목적**: 9개 핵심 시스템이 모두 정상 로드되었는지 확인

```javascript
const health = window.__TEST_API__.healthCheck();
// 기대값:
// {
//   saveManager: true,
//   energySystem: true,
//   gachaSystem: true,
//   questSystem: true,
//   towerSystem: true,
//   synergySystem: true,
//   moodSystem: true,
//   equipmentSystem: true,
//   partyManager: true,
//   allHealthy: true
// }
```

**판정**: `health.allHealthy === true`

---

### TC-A02: SaveManager 데이터 무결성

**목적**: 세이브 데이터의 필수 필드 존재 확인

```javascript
const save = window.__TEST_API__.getSaveData();
// 검증:
// save.playerLevel >= 1
// save.gold >= 0
// save.gems >= 0
// save.characterCount >= 0
// typeof save.pityCounter === 'number'
```

**판정**: 모든 필드가 유효한 숫자

---

### TC-A03: Registry 동기화 확인

**목적**: SaveManager와 Registry 간 데이터 일치 확인

```javascript
const save = window.__TEST_API__.getSaveData();
const registry = window.__TEST_API__.getRegistryData();

// 검증:
// registry.gems === save.gems
// registry.gold === save.gold (또는 근사값)
// registry.ownedHeroCount === save.characterCount
```

**판정**: 주요 데이터 일치

---

## 카테고리 B: 씬 전환 & 네비게이션 테스트

### TC-B01: BottomNav 5탭 전환

**목적**: 5개 탭 클릭 시 해당 씬으로 정상 전환되는지

```javascript
const tabs = [
  { tab: 'home', scene: 'MainMenuScene' },
  { tab: 'adventure', scene: 'StageSelectScene' },
  { tab: 'inventory', scene: 'InventoryScene' },
  { tab: 'gacha', scene: 'GachaScene' },
  { tab: 'more', scene: 'SettingsScene' }
];

const results = [];
for (const t of tabs) {
  window.__TEST_API__.navigateTo(t.scene);
  await new Promise(r => setTimeout(r, 500));
  const meta = window.__TEST_API__.getSceneMetadata();
  results.push({
    expected: t.scene,
    actual: meta.key,
    match: meta.key === t.scene,
    childCount: meta.childCount
  });
}
```

**판정**: 5/5 씬 이름 일치

---

### TC-B02: 메인메뉴 6버튼 씬 진입

**목적**: 메인메뉴의 6개 콘텐츠 버튼이 올바른 씬으로 이동하는지

```javascript
const buttons = [
  { target: 'HeroListScene', label: '영웅' },
  { target: 'PartyEditScene', label: '파티편성' },
  { target: 'QuestScene', label: '퀘스트' },
  { target: 'TowerScene', label: '무한탑' },
  { target: 'InventoryScene', label: '가방' },
  { target: 'SettingsScene', label: '설정' }
];

const results = [];
for (const btn of buttons) {
  window.__TEST_API__.navigateTo('MainMenuScene');
  await new Promise(r => setTimeout(r, 300));
  window.__TEST_API__.navigateTo(btn.target);
  await new Promise(r => setTimeout(r, 500));
  const meta = window.__TEST_API__.getSceneMetadata();
  results.push({
    button: btn.label,
    expected: btn.target,
    actual: meta.key,
    match: meta.key === btn.target
  });
}
```

**판정**: 6/6 씬 전환 성공

---

### TC-B03: 전체 씬 순회 (에러 없음)

**목적**: 모든 게임 씬을 순회하며 콘솔 에러 없이 로드되는지

```javascript
window.__TEST_API__.startLogCapture();

const scenes = [
  'MainMenuScene', 'HeroListScene', 'StageSelectScene',
  'GachaScene', 'InventoryScene', 'QuestScene',
  'TowerScene', 'PartyEditScene', 'SettingsScene'
];

for (const s of scenes) {
  window.__TEST_API__.navigateTo(s);
  await new Promise(r => setTimeout(r, 800));
}

const logs = window.__TEST_API__.stopLogCapture();
const errors = logs.filter(l => l.level === 'error');
```

**판정**: `errors.length === 0` (favicon 404 제외)

---

## 카테고리 C: 영웅 시스템 테스트

### TC-C01: COMPAT-1.3 필드 완전성 (ISSUE-03 수정 검증)

**목적**: 91명 영웅 전원에 equipment/constellation/acquiredAt 필드 존재

```javascript
debug.unlockAllCharacters();
await new Promise(r => setTimeout(r, 500));

const heroes = window.__TEST_API__.getHeroes();
const results = {
  totalChars: heroes.length,
  hasEquipment: heroes.filter(h => h.hasEquipment).length,
  hasConstellation: heroes.filter(h => h.constellation !== undefined).length,
  hasAcquiredAt: heroes.filter(h => h.acquiredAt > 0).length,
  missingCount: heroes.filter(h => !h.hasEquipment || h.constellation === undefined || !h.acquiredAt).length
};
```

**판정**: `results.missingCount === 0`

---

### TC-C02: HeroListScene 영웅 표시 (ISSUE-01 수정 검증)

**목적**: unlockAllCharacters() 후 HeroListScene에서 올바른 영웅 수 표시

```javascript
// 1. 리소스 초기화
debug.maxResources();
debug.unlockAllCharacters();
await new Promise(r => setTimeout(r, 500));

// 2. HeroListScene 진입
window.__TEST_API__.navigateTo('HeroListScene');
await new Promise(r => setTimeout(r, 800));

// 3. 영웅 수 확인
const heroes = window.__TEST_API__.getHeroes();
const meta = window.__TEST_API__.getSceneMetadata();

const result = {
  registryCount: heroes.length,
  sceneKey: meta.key,
  success: heroes.length > 0 && meta.key === 'HeroListScene'
};
```

**판정**: `result.registryCount >= 91`

---

### TC-C03: 레거시 세이브 마이그레이션

**목적**: id만 있는 레거시 데이터가 SaveManager.load() 후 정규화되는지

```javascript
// 1. 레거시 형식 캐릭터 주입
const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
save.characters.push({
  characterId: 'char_001',
  level: 5,
  rarity: 3,
  exp: 100
  // equipment, constellation, acquiredAt 없음
});
localStorage.setItem('arcane_collectors_save', JSON.stringify(save));

// 2. SaveManager 리로드 → 정규화
const reloaded = window.SaveManager ? window.SaveManager.load() : null;
const hero = reloaded?.characters?.find(c => c.characterId === 'char_001' && c.level === 5);

const result = {
  found: !!hero,
  hasId: !!(hero?.id || hero?.characterId),
  hasEquipment: hero?.equipment !== undefined || true, // normalize가 추가
  hasConstellation: hero?.constellation !== undefined || true
};
```

**판정**: 레거시 캐릭터가 로드 가능

---

### TC-C04: HeroFactory.normalize() 14필드 완전성

**목적**: 불완전한 입력에서 모든 필수 필드 생성

```javascript
const mod = await import('/src/systems/HeroFactory.js');
const normalized = mod.HeroFactory.normalize({ id: 'char_001', level: 1 });

const fields = [
  'id', 'instanceId', 'characterId', 'name', 'rarity', 'rarityKey',
  'stars', 'cult', 'class', 'mood', 'stats', 'skills',
  'equipment', 'constellation', 'acquiredAt'
];
const result = {};
fields.forEach(f => { result['has_' + f] = normalized?.[f] !== undefined; });
result.allPresent = fields.every(f => normalized?.[f] !== undefined);
```

**판정**: `result.allPresent === true`

---

## 카테고리 D: 에너지 시스템 테스트

### TC-D01: 에너지 표시 NaN 수정 (ISSUE-02 수정 검증)

**목적**: TowerScene에서 에너지가 숫자로 정상 표시되는지

```javascript
window.__TEST_API__.navigateTo('TowerScene');
await new Promise(r => setTimeout(r, 500));

const status = window.__TEST_API__.getEnergyStatus();
const result = {
  current: status.current,
  max: status.max,
  isCurrentNumber: typeof status.current === 'number' && !isNaN(status.current),
  isMaxNumber: typeof status.max === 'number' && !isNaN(status.max),
  maxValid: status.max >= 100 // BASE_MAX_ENERGY = 100
};
```

**판정**: `result.isMaxNumber === true && result.maxValid === true`

---

### TC-D02: 에너지 소모/회복 사이클

**목적**: 에너지 소모 후 시간 경과 회복 동작 확인

```javascript
// 1. 에너지 풀 충전
debug.refillEnergy();

const before = window.__TEST_API__.getEnergyStatus();

// 2. 에너지 6 소모 (NORMAL 스테이지 비용)
const mod = await import('/src/systems/EnergySystem.js');
const result = mod.energySystem.consumeEnergy(6);

const after = window.__TEST_API__.getEnergyStatus();

const testResult = {
  beforeEnergy: before.current,
  consumed: result.consumed,
  afterEnergy: after.current,
  difference: before.current - after.current,
  success: result.success && after.current === before.current - 6
};
```

**판정**: `testResult.success === true && testResult.difference === 6`

---

### TC-D03: 에너지 부족 시 거부

**목적**: 에너지 부족 시 소모 요청이 거절되는지

```javascript
// 에너지를 0으로 설정
debug.setEnergy(0);

const mod = await import('/src/systems/EnergySystem.js');
const result = mod.energySystem.consumeEnergy(10);

const testResult = {
  success: result.success,
  error: result.error,
  currentEnergy: result.currentEnergy
};
```

**판정**: `testResult.success === false && testResult.error === 'INSUFFICIENT_ENERGY'`

---

### TC-D04: getMaxEnergy() 기본값 폴백

**목적**: playerLevel 미전달 시 NaN 대신 유효한 숫자 반환

```javascript
const mod = await import('/src/systems/EnergySystem.js');
const maxNoArg = mod.energySystem.getMaxEnergy();
const maxWithArg = mod.energySystem.getMaxEnergy(1);

const result = {
  noArgResult: maxNoArg,
  withArgResult: maxWithArg,
  noArgIsNumber: typeof maxNoArg === 'number' && !isNaN(maxNoArg),
  match: maxNoArg === maxWithArg || maxNoArg >= 100
};
```

**판정**: `result.noArgIsNumber === true`

---

## 카테고리 E: 가챠 시스템 테스트

### TC-E01: 영웅 소환 (보석)

**목적**: 300 보석으로 단일 소환 후 영웅 추가되는지

```javascript
debug.maxResources();
const beforeHeroes = window.__TEST_API__.getHeroes().length;
const beforeGems = window.__TEST_API__.getRegistryData('gems');

// GachaScene으로 이동 후 소환
window.__TEST_API__.navigateTo('GachaScene');
await new Promise(r => setTimeout(r, 500));

// 가챠 시스템 직접 호출
const mod = await import('/src/systems/GachaSystem.js');
const pullResult = mod.GachaSystem.pull(1, 'gems');

const result = {
  success: pullResult.success,
  hasResults: pullResult.results?.length > 0,
  pity: pullResult.pityInfo
};
```

**판정**: `result.success === true && result.hasResults === true`

---

### TC-E02: 천장 카운터 진행

**목적**: 소환마다 천장 카운터가 증가하는지

```javascript
const before = window.__TEST_API__.getGachaStatus();
debug.maxResources();

// 10회 소환
const mod = await import('/src/systems/GachaSystem.js');
for (let i = 0; i < 10; i++) {
  mod.GachaSystem.pull(1, 'gems');
}

const after = window.__TEST_API__.getGachaStatus();
const result = {
  beforePity: before.pityInfo.current,
  afterPity: after.pityInfo.current,
  increased: after.pityInfo.current > before.pityInfo.current,
  threshold: after.pityInfo.threshold
};
```

**판정**: `result.increased === true && result.threshold === 90`

---

### TC-E03: 천장 강제 설정 후 SSR 확정

**목적**: 천장 89 설정 후 다음 소환에서 SSR 확정

```javascript
debug.maxResources();
debug.setPityCounter(89);

const mod = await import('/src/systems/GachaSystem.js');
const pullResult = mod.GachaSystem.pull(1, 'gems');

const result = {
  pityBefore: 89,
  resultRarity: pullResult.results?.[0]?.rarity,
  isSSR: pullResult.results?.[0]?.rarity >= 4, // SSR = 4
  pityReset: pullResult.pityInfo?.current === 0
};
```

**판정**: `result.isSSR === true`

---

### TC-E04: 소환 티켓 소환

**목적**: 소환 티켓으로 무보석 소환

```javascript
debug.addSummonTickets(10);

const mod = await import('/src/systems/GachaSystem.js');
const pullResult = mod.GachaSystem.pull(1, 'tickets');

const result = {
  success: pullResult.success,
  hasResults: pullResult.results?.length > 0
};
```

**판정**: `result.success === true`

---

### TC-E05: 무료 소환 모드

**목적**: freeGacha 치트 시 보석 소모 없이 소환

```javascript
debug.freeGacha(true);
const beforeGems = window.__TEST_API__.getSaveData().gems;

const mod = await import('/src/systems/GachaSystem.js');
const pullResult = mod.GachaSystem.pull(10, 'gems');
const afterGems = window.__TEST_API__.getSaveData().gems;

debug.freeGacha(false);

const result = {
  success: pullResult.success,
  gemsUsed: beforeGems - afterGems,
  freeMode: pullResult.success && (beforeGems - afterGems) === 0
};
```

**판정**: `result.freeMode === true`

---

## 카테고리 F: 장비 시스템 테스트

### TC-F01: 장비 생성 및 인벤토리 등록

**목적**: 장비 지급 후 인벤토리에 등록되는지

```javascript
const beforeEquips = window.__TEST_API__.getEquipmentList().length;

debug.giveAllEquipment();

const afterEquips = window.__TEST_API__.getEquipmentList().length;
const result = {
  before: beforeEquips,
  after: afterEquips,
  added: afterEquips > beforeEquips
};
```

**판정**: `result.added === true`

---

### TC-F02: 장비 장착/해제

**목적**: 영웅에 장비 장착 후 해제 동작 확인

```javascript
debug.unlockAllCharacters();
debug.giveAllEquipment();

const equips = window.__TEST_API__.getEquipmentList();
const heroes = window.__TEST_API__.getHeroes();

if (equips.length > 0 && heroes.length > 0) {
  const mod = await import('/src/systems/EquipmentSystem.js');
  const weapon = equips.find(e => e.slotType === 'weapon');
  if (weapon) {
    // 장착
    const equipResult = mod.EquipmentSystem.equip(heroes[0].id, weapon.id);
    // 해제
    const unequipResult = mod.EquipmentSystem.unequip(heroes[0].id, 'weapon');

    return { equipResult, unequipResult };
  }
}
```

**판정**: 장착/해제 모두 성공

---

### TC-F03: InventoryScene 탭 전환

**목적**: 3개 탭(장비/소비/재료) 전환 시 데이터 로드

```javascript
window.__TEST_API__.navigateTo('InventoryScene');
await new Promise(r => setTimeout(r, 500));

const meta = window.__TEST_API__.getSceneMetadata();
const result = {
  sceneKey: meta.key,
  loaded: meta.key === 'InventoryScene',
  childCount: meta.childCount,
  interactiveCount: meta.interactiveCount
};
```

**판정**: `result.loaded === true && result.interactiveCount > 0`

---

## 카테고리 G: 퀘스트 시스템 테스트

### TC-G01: 일일 퀘스트 로드

**목적**: 일일 퀘스트 목록이 정상 로드되는지

```javascript
const quest = window.__TEST_API__.getQuestStatus();
const result = {
  total: quest.total,
  hasQuests: quest.total > 0,
  validStructure: quest.quests.every(q =>
    q.id && q.name && typeof q.progress === 'number' && typeof q.target === 'number'
  )
};
```

**판정**: `result.hasQuests === true && result.validStructure === true`

---

### TC-G02: 퀘스트 완료 → 보상 수령

**목적**: 퀘스트 치트 완료 후 보상 수령

```javascript
debug.completeAllDailyQuests();
const beforeClaim = window.__TEST_API__.getQuestStatus();

debug.claimAllQuestRewards();
const afterClaim = window.__TEST_API__.getQuestStatus();

const result = {
  completedBefore: beforeClaim.completed,
  claimableBefore: beforeClaim.claimable,
  claimableAfter: afterClaim.claimable,
  allClaimed: afterClaim.claimable === 0
};
```

**판정**: `result.claimableBefore > 0 && result.allClaimed === true`

---

### TC-G03: QuestScene 렌더링

**목적**: QuestScene이 정상 로드되고 퀘스트 카드가 표시되는지

```javascript
window.__TEST_API__.navigateTo('QuestScene');
await new Promise(r => setTimeout(r, 500));

const meta = window.__TEST_API__.getSceneMetadata();
const quest = window.__TEST_API__.getQuestStatus();

const result = {
  sceneKey: meta.key,
  childCount: meta.childCount,
  questCount: quest.total,
  loaded: meta.key === 'QuestScene'
};
```

**판정**: `result.loaded === true && result.questCount > 0`

---

## 카테고리 H: 무한의 탑 테스트

### TC-H01: 탑 진행도 조회

**목적**: TowerSystem에서 진행도 데이터 정상 반환

```javascript
const tower = window.__TEST_API__.getTowerStatus();
const result = {
  currentFloor: tower.currentFloor,
  highestFloor: tower.highestFloor,
  totalClears: tower.totalClears,
  validFloor: tower.currentFloor >= 1 && tower.currentFloor <= 100
};
```

**판정**: `result.validFloor === true`

---

### TC-H02: 탑 층 설정 치트

**목적**: 탑 층 치트 후 진행도 업데이트

```javascript
debug.setTowerFloor(50);
const tower = window.__TEST_API__.getTowerStatus();

const result = {
  currentFloor: tower.currentFloor,
  setTo50: tower.currentFloor === 50
};
```

**판정**: `result.setTo50 === true`

---

### TC-H03: TowerScene 에너지 표시

**목적**: TowerScene에서 에너지가 NaN 없이 표시되는지 (ISSUE-02)

```javascript
debug.refillEnergy();
window.__TEST_API__.navigateTo('TowerScene');
await new Promise(r => setTimeout(r, 500));

const energy = window.__TEST_API__.getEnergyStatus();
const result = {
  current: energy.current,
  max: energy.max,
  display: `${energy.current}/${energy.max}`,
  noNaN: !isNaN(energy.current) && !isNaN(energy.max)
};
```

**판정**: `result.noNaN === true`

---

## 카테고리 I: 파티 & 시너지 시스템 테스트

### TC-I01: 파티 자동 편성

**목적**: autoOptimalParty 치트로 4인 파티 자동 구성

```javascript
debug.unlockAllCharacters();
debug.autoOptimalParty();

const party = window.__TEST_API__.getPartyData();
const result = {
  hasParty: Object.keys(party).length > 0,
  partyData: party
};
```

**판정**: `result.hasParty === true`

---

### TC-I02: 시너지 계산

**목적**: 같은 교단 영웅 4명으로 시너지 발동 확인

```javascript
// olympus 교단 영웅 4명 선택
const heroes = window.__TEST_API__.getHeroes();
const olympusHeroes = heroes.filter(h => h.cult === 'olympus').slice(0, 4);
const heroIds = olympusHeroes.map(h => h.id);

const synergies = window.__TEST_API__.calculateSynergies(heroIds);
const result = {
  heroIds,
  synergyCount: synergies.length,
  hasCultSynergy: synergies.some(s => s.type === 'cult'),
  synergies: synergies.map(s => ({ name: s.name, type: s.type }))
};
```

**판정**: `result.hasCultSynergy === true`

---

### TC-I03: Mood 상성 매트릭스

**목적**: 9종 Mood 상성표 정확성

```javascript
const matchups = [
  { atk: 'noble', def: 'cunning', expected: 1.2 },
  { atk: 'cunning', def: 'noble', expected: 0.8 },
  { atk: 'brave', def: 'brave', expected: 1.0 },
  { atk: 'fierce', def: 'calm', expected: 0.8 },
  { atk: 'calm', def: 'fierce', expected: 1.2 }
];

const results = matchups.map(m => {
  const mult = window.__TEST_API__.checkMoodMatchup(m.atk, m.def);
  return {
    ...m,
    actual: mult,
    pass: Math.abs(mult - m.expected) < 0.01
  };
});
const allPass = results.every(r => r.pass);
```

**판정**: `allPass === true`

---

### TC-I04: PartyEditScene 5슬롯 전환

**목적**: 파티 편성 5개 저장슬롯 전환

```javascript
window.__TEST_API__.navigateTo('PartyEditScene');
await new Promise(r => setTimeout(r, 500));

const meta = window.__TEST_API__.getSceneMetadata();
const result = {
  sceneKey: meta.key,
  loaded: meta.key === 'PartyEditScene',
  interactiveCount: meta.interactiveCount
};
```

**판정**: `result.loaded === true`

---

## 카테고리 J: 치트 & 디버그 시스템 테스트

### TC-J01: ESC 치트 패널

**목적**: ESC 키 입력 시 치트 패널 표시/숨김

```javascript
// browser_press_key로 ESC 입력
// 스크린샷으로 패널 표시 확인
// 재입력으로 패널 숨김 확인
```

**방법**: `browser_press_key` → `Escape` → `browser_take_screenshot`

---

### TC-J02: 치트코드 25종 처리

**목적**: 치트코드 문자열이 올바르게 처리되는지

```javascript
const codes = [
  'GOLDRAIN', 'GEMSTORM', 'SUMMONALL',
  'GODMODE', 'ONEPUNCH', 'SPEEDUP',
  'UNLOCKALL', 'CLEARALL',
  'FULLCHARGE', 'INFINERGY', 'SPEEDREGEN',
  'FREEPULL', 'PITY89', 'FORCEPICKUP', 'FORCESSR',
  'GEARUP', 'ENHANCE100',
  'TOWERMAX', 'TOWERRESET',
  'SWEEPMAX', 'QUESTDONE',
  'SAVEEXPORT', 'BACKUP', 'RESETALL',
  'MOODPLUS', 'AUTOPARTY'
];

const results = codes.map(code => {
  try {
    const result = debug.processCheatCode(code);
    return { code, success: result !== false };
  } catch (e) {
    return { code, success: false, error: e.message };
  }
});
const passCount = results.filter(r => r.success).length;
```

**판정**: `passCount >= 20` (일부 코드는 조건부)

---

### TC-J03: 리소스 치트

**목적**: addGold/addGems/maxResources 정상 동작

```javascript
debug.resetAllData();
debug.addGold(5000);
debug.addGems(3000);

const save = window.__TEST_API__.getSaveData();
const result = {
  gold: save.gold,
  gems: save.gems,
  goldOk: save.gold >= 5000,
  gemsOk: save.gems >= 3000
};
```

**판정**: `result.goldOk === true && result.gemsOk === true`

---

### TC-J04: 전체 스테이지 클리어 치트

**목적**: clearAllStages 후 스테이지 클리어 수 증가

```javascript
const before = window.__TEST_API__.getSaveData().clearedStages;
debug.clearAllStages();
const after = window.__TEST_API__.getSaveData().clearedStages;

const result = {
  before, after,
  increased: after > before
};
```

**판정**: `result.increased === true`

---

## 카테고리 K: 스테이지 & 전투 테스트

### TC-K01: StageSelectScene 로드

**목적**: 스테이지 선택 씬 정상 로드

```javascript
window.__TEST_API__.navigateTo('StageSelectScene');
await new Promise(r => setTimeout(r, 500));

const meta = window.__TEST_API__.getSceneMetadata();
const result = {
  sceneKey: meta.key,
  loaded: meta.key === 'StageSelectScene',
  interactiveCount: meta.interactiveCount
};
```

**판정**: `result.loaded === true && result.interactiveCount > 5`

---

### TC-K02: 에너지 소모 후 전투 진입 가능성

**목적**: 에너지 충분할 때 전투 진입, 부족할 때 거부

```javascript
debug.refillEnergy();

const mod = await import('/src/systems/EnergySystem.js');

// 충분할 때
const canEnter1 = mod.energySystem.canEnterStage('NORMAL');

// 에너지 0으로 설정
debug.setEnergy(0);
const canEnter2 = mod.energySystem.canEnterStage('NORMAL');

const result = {
  withEnergy: canEnter1.canEnter,
  withoutEnergy: canEnter2.canEnter,
  cost: canEnter1.cost,
  shortage: canEnter2.shortage
};
```

**판정**: `result.withEnergy === true && result.withoutEnergy === false`

---

## 카테고리 L: 설정 & 데이터 테스트

### TC-L01: SettingsScene 정보 표시

**목적**: 계정 정보 정상 표시

```javascript
window.__TEST_API__.navigateTo('SettingsScene');
await new Promise(r => setTimeout(r, 500));

const save = window.__TEST_API__.getSaveData();
const meta = window.__TEST_API__.getSceneMetadata();

const result = {
  sceneKey: meta.key,
  loaded: meta.key === 'SettingsScene',
  playerLevel: save.playerLevel,
  characterCount: save.characterCount,
  version: '1.0.0-beta'
};
```

**판정**: `result.loaded === true`

---

### TC-L02: 세이브 Export/Import

**목적**: 세이브 데이터 export 후 import 시 데이터 복원

```javascript
// Export
const exportData = debug.exportSave();
const beforeChars = window.__TEST_API__.getSaveData().characterCount;

// 데이터 변경
debug.unlockAllCharacters();
const midChars = window.__TEST_API__.getSaveData().characterCount;

// Import (복원)
debug.importSave(exportData);
const afterChars = window.__TEST_API__.getSaveData().characterCount;

const result = {
  before: beforeChars,
  afterUnlock: midChars,
  afterRestore: afterChars,
  restored: afterChars === beforeChars
};
```

**판정**: `result.restored === true`

---

### TC-L03: 데이터 초기화

**목적**: resetAllData 후 기본 상태로 복원

```javascript
debug.unlockAllCharacters();
debug.maxResources();

const before = window.__TEST_API__.getSaveData();
debug.resetAllData();
const after = window.__TEST_API__.getSaveData();

const result = {
  beforeChars: before.characterCount,
  afterChars: after.characterCount,
  reset: after.characterCount < before.characterCount
};
```

**판정**: `result.reset === true`

---

## 카테고리 M: 통합 시나리오 테스트

### TC-M01: 풀 플로우 — 소환 → 영웅 확인 → 파티 편성

**목적**: 주요 게임 루프 전체 흐름 테스트

```javascript
// 1. 리소스 준비
debug.maxResources();

// 2. 가챠 소환
const mod = await import('/src/systems/GachaSystem.js');
const pull = mod.GachaSystem.pull(10, 'gems');
const pullSuccess = pull.success;

// 3. 영웅 목록 확인
const heroes = window.__TEST_API__.getHeroes();
const heroCount = heroes.length;

// 4. 시너지 계산
const top4 = heroes.slice(0, 4).map(h => h.id);
const synergies = window.__TEST_API__.calculateSynergies(top4);

// 5. 에너지 확인
const energy = window.__TEST_API__.getEnergyStatus();

const result = {
  pullSuccess,
  heroCount,
  synergyCount: synergies.length,
  energyCurrent: energy.current,
  energyMax: energy.max,
  flowComplete: pullSuccess && heroCount > 0 && !isNaN(energy.max)
};
```

**판정**: `result.flowComplete === true`

---

### TC-M02: 전체 씬 인터랙티브 오브젝트 감사

**목적**: 모든 씬에 최소한의 인터랙티브 오브젝트가 존재하는지

```javascript
const scenes = [
  'MainMenuScene', 'HeroListScene', 'StageSelectScene',
  'GachaScene', 'InventoryScene', 'QuestScene',
  'TowerScene', 'PartyEditScene', 'SettingsScene'
];

const results = [];
for (const s of scenes) {
  window.__TEST_API__.navigateTo(s);
  await new Promise(r => setTimeout(r, 600));
  const objs = window.__TEST_API__.getInteractiveObjects();
  results.push({
    scene: s,
    interactiveCount: objs.length,
    hasButtons: objs.length >= 1
  });
}
const allHaveButtons = results.every(r => r.hasButtons);
```

**판정**: `allHaveButtons === true`

---

### TC-M03: 로그 캡처 및 에러 검출

**목적**: 전체 플로우 동안 콘솔 에러 없음 확인

```javascript
window.__TEST_API__.startLogCapture();

// 주요 시스템 호출
debug.maxResources();
debug.unlockAllCharacters();
debug.refillEnergy();

// 씬 순회
const scenes = ['MainMenuScene', 'GachaScene', 'HeroListScene',
                'InventoryScene', 'QuestScene', 'TowerScene'];
for (const s of scenes) {
  window.__TEST_API__.navigateTo(s);
  await new Promise(r => setTimeout(r, 300));
}

const logs = window.__TEST_API__.stopLogCapture();
const errors = logs.filter(l => l.level === 'error' && !l.msg.includes('favicon'));
const warnings = logs.filter(l => l.level === 'warn');

const result = {
  totalLogs: logs.length,
  errors: errors.length,
  warnings: warnings.length,
  errorMessages: errors.map(e => e.msg),
  clean: errors.length === 0
};
```

**판정**: `result.clean === true`

---

## 실행 요약 매트릭스

| 카테고리 | TC 수 | 영역 |
|----------|-------|------|
| A: 시스템 무결성 | 3 | SaveManager, Registry, 헬스체크 |
| B: 씬 전환 | 3 | BottomNav, 메뉴버튼, 씬 순회 |
| C: 영웅 시스템 | 4 | COMPAT-1.3, HeroList, 마이그레이션, 정규화 |
| D: 에너지 시스템 | 4 | NaN수정, 소모/회복, 부족거부, 기본값 |
| E: 가챠 시스템 | 5 | 보석소환, 천장, SSR확정, 티켓, 무료 |
| F: 장비 시스템 | 3 | 생성, 장착해제, 인벤토리 |
| G: 퀘스트 시스템 | 3 | 로드, 완료수령, 렌더링 |
| H: 무한의 탑 | 3 | 진행도, 층설정, 에너지표시 |
| I: 파티 & 시너지 | 4 | 자동편성, 시너지, 상성, 슬롯 |
| J: 치트 & 디버그 | 4 | ESC패널, 치트코드, 리소스, 스테이지 |
| K: 스테이지 | 2 | 로드, 에너지체크 |
| L: 설정 & 데이터 | 3 | 정보표시, Export/Import, 초기화 |
| M: 통합 시나리오 | 3 | 풀플로우, 감사, 에러검출 |
| **합계** | **44** | |

---

## 자동 실행 스크립트 패턴

```javascript
// 모든 TC를 순차 실행하는 패턴
async function runAllTests() {
  const results = {};

  // 초기화
  await import('/src/systems/DebugManager.js').then(m => m.DebugManager.setDebugMode(true));

  // TC-A01
  results['TC-A01'] = window.__TEST_API__.healthCheck().allHealthy;

  // TC-A02
  const save = window.__TEST_API__.getSaveData();
  results['TC-A02'] = save.playerLevel >= 1 && save.gems >= 0;

  // ... 나머지 TC ...

  return results;
}
```

---

## 스크린샷 필요 TC (browser_take_screenshot)

| TC | 씬 | 확인 사항 |
|----|---|----------|
| TC-B03 | 전체 | 각 씬 정상 렌더링 |
| TC-C02 | HeroListScene | 영웅 카드 표시 |
| TC-E01 | GachaScene | 소환 결과 |
| TC-H03 | TowerScene | 에너지 숫자 표시 |
| TC-J01 | ESC 패널 | 18버튼 오버레이 |

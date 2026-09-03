/**
 * SaveManager.test.js
 * Unit tests for SaveManager - 저장 및 로드 시스템
 * QAT-T3-1: 18 tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveManager } from '../../src/systems/SaveManager.js';

describe('SaveManager', () => {
  let mockLocalStorage;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      removeItem(key) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      }
    };

    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('save/load 기본 동작', () => {
    it('saves data to localStorage', () => {
      const testData = SaveManager.getDefaultSave();
      testData.resources.gold = 5000;

      const result = SaveManager.save(testData);

      expect(result).toBe(true);
      expect(mockLocalStorage.getItem(SaveManager.SAVE_KEY)).toBeTruthy();
    });

    it('loads data from localStorage', () => {
      const testData = SaveManager.getDefaultSave();
      testData.resources.gold = 7500;
      SaveManager.save(testData);

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.resources.gold).toBe(7500);
    });

    it('returns default data when no save exists', () => {
      mockLocalStorage.clear();

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.resources.gold).toBe(10000);
    });
  });

  describe('데이터 무결성', () => {
    it('maintains data integrity after save/load cycle', () => {
      const original = SaveManager.getDefaultSave();
      original.player.name = 'TestHero';
      original.player.level = 5;
      original.resources.gold = 12345;
      original.resources.gems = 678;

      SaveManager.save(original);
      const loaded = SaveManager.load();

      expect(loaded.player.name).toBe('TestHero');
      expect(loaded.player.level).toBe(5);
      expect(loaded.resources.gold).toBe(12345);
      expect(loaded.resources.gems).toBe(678);
    });

    it('preserves ownedHeroes array', () => {
      const data = SaveManager.getDefaultSave();
      data.characters = [
        { characterId: 'hero_1', level: 1 },
        { characterId: 'hero_2', level: 3 }
      ];

      SaveManager.save(data);
      const loaded = SaveManager.load();

      expect(loaded.characters).toHaveLength(2);
      expect(loaded.characters[0].characterId).toBe('hero_1');
      expect(loaded.characters[1].level).toBe(3);
    });

    it('preserves gold, exp, and level', () => {
      const data = SaveManager.getDefaultSave();
      data.resources.gold = 99999;
      data.player.exp = 5000;
      data.player.level = 10;

      SaveManager.save(data);
      const loaded = SaveManager.load();

      expect(loaded.resources.gold).toBe(99999);
      expect(loaded.player.exp).toBe(5000);
      expect(loaded.player.level).toBe(10);
    });
  });

  describe('마이그레이션 핸들링', () => {
    it('migrates old version save data', () => {
      const oldData = {
        version: 0,
        player: { name: 'OldPlayer', level: 1, exp: 0 },
        resources: { gold: 500 }
      };

      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.player.name).toBe('OldPlayer');
      expect(loaded.resources.gold).toBe(500);
    });

    it('preserves data during migration', () => {
      const oldData = {
        version: 0,
        player: { name: 'MigratedHero', level: 8, exp: 1200 },
        resources: { gold: 8888 }
      };

      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.player.level).toBe(8);
      expect(loaded.resources.gold).toBe(8888);
    });

    it('T-S2/BLK-05: gacha.freeTenPullUsed 필드가 없는 구버전 세이브는 기본값 false로 마이그레이션됨', () => {
      const oldData = {
        version: SaveManager.VERSION, // 버전은 최신이지만 gacha 필드가 옛 스키마인 경우
        player: { name: 'OldGachaPlayer', level: 3, exp: 100 },
        resources: { gold: 1000 },
        gacha: { pityCounter: 12, totalPulls: 12 } // freeTenPullUsed 없음
      };

      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.gacha.freeTenPullUsed).toBe(false);
      expect(loaded.gacha.pityCounter).toBe(12); // 기존 값 보존
    });

    it('T-S2/BLK-05: 버전 마이그레이션(migrate()) 경로에서도 freeTenPullUsed 기본값이 보장됨', () => {
      const oldData = {
        version: 0,
        player: { name: 'AncientPlayer', level: 1, exp: 0 },
        resources: { gold: 500 },
        gacha: { pityCounter: 5, totalPulls: 5 } // freeTenPullUsed 없음
      };

      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.gacha.freeTenPullUsed).toBe(false);
      expect(loaded.gacha.pityCounter).toBe(5);
    });
  });

  describe('에러 처리', () => {
    it('handles localStorage access failure gracefully', () => {
      vi.stubGlobal('localStorage', {
        getItem() {
          throw new Error('Access denied');
        },
        setItem() {
          throw new Error('Access denied');
        }
      });

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.version).toBe(SaveManager.VERSION);
    });

    it('returns default data on corrupted JSON', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, '{invalid json}');

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.version).toBe(SaveManager.VERSION);
    });

    it('returns false when save fails', () => {
      vi.stubGlobal('localStorage', {
        setItem() {
          throw new Error('Storage full');
        }
      });

      const data = SaveManager.getDefaultSave();
      const result = SaveManager.save(data);

      expect(result).toBe(false);
    });
  });

  describe('리소스 관리', () => {
    it('adds gold correctly', () => {
      SaveManager.reset();
      const initialGold = SaveManager.load().resources.gold;

      SaveManager.addGold(500);
      const newGold = SaveManager.load().resources.gold;

      expect(newGold).toBe(initialGold + 500);
    });

    it('spends gold when sufficient', () => {
      SaveManager.reset();
      SaveManager.addGold(1000);

      const result = SaveManager.spendGold(300);

      expect(result).toBe(true);
      expect(SaveManager.load().resources.gold).toBeGreaterThanOrEqual(700);
    });

    it('refuses to spend gold when insufficient', () => {
      SaveManager.reset();
      const data = SaveManager.load();
      data.resources.gold = 100;
      SaveManager.save(data);

      const result = SaveManager.spendGold(500);

      expect(result).toBe(false);
      expect(SaveManager.load().resources.gold).toBe(100);
    });
  });

  describe('캐릭터 관리', () => {
    it('adds new character correctly', () => {
      SaveManager.reset();

      const result = SaveManager.addCharacter('ssr_hero_1', 1);

      expect(result.duplicate).toBe(false);
      expect(result.character).toBeDefined();
      expect(result.character.characterId).toBe('ssr_hero_1');
    });

    it('handles duplicate character', () => {
      SaveManager.reset();
      SaveManager.addCharacter('r_hero_1', 1);

      const result = SaveManager.addCharacter('r_hero_1', 1);

      expect(result.duplicate).toBe(true);
      expect(result.shardsGained).toBeGreaterThan(0);
    });
  });

  describe('저장 슬롯 시스템', () => {
    it('saves to specific slot', () => {
      const data = SaveManager.getDefaultSave();
      data.player.name = 'SlotTest';

      const result = SaveManager.saveToSlot(0, data);

      expect(result).toBe(true);
    });

    it('loads from specific slot', () => {
      const data = SaveManager.getDefaultSave();
      data.player.name = 'LoadSlotTest';
      SaveManager.saveToSlot(1, data);

      const loaded = SaveManager.loadFromSlot(1);

      expect(loaded).toBeDefined();
      expect(loaded.player.name).toBe('LoadSlotTest');
    });

    it('returns null for empty slot', () => {
      const loaded = SaveManager.loadFromSlot(2);

      expect(loaded).toBeNull();
    });
  });

  // ========== CHAR-5: 피티 시스템 테스트 ==========
  describe('피티 시스템 (CHAR-5)', () => {
    it('getPityCount 초기값 0 확인', () => {
      SaveManager.reset();

      const count = SaveManager.getPityCount('hero_base_1');

      expect(count).toBe(0);
    });

    it('incrementPityCount 정상 동작 확인', () => {
      SaveManager.reset();

      SaveManager.incrementPityCount('hero_base_1', 5);
      const count = SaveManager.getPityCount('hero_base_1');

      expect(count).toBe(5);
    });

    it('incrementPityCount 누적 증가 확인', () => {
      SaveManager.reset();

      SaveManager.incrementPityCount('hero_base_1', 3);
      SaveManager.incrementPityCount('hero_base_1', 7);
      const count = SaveManager.getPityCount('hero_base_1');

      expect(count).toBe(10);
    });

    it('resetPityCount → 0 복귀 확인', () => {
      SaveManager.reset();
      SaveManager.incrementPityCount('hero_base_1', 25);

      SaveManager.resetPityCount('hero_base_1');
      const count = SaveManager.getPityCount('hero_base_1');

      expect(count).toBe(0);
    });

    it('영웅 ID별 피티 카운터 독립성 확인', () => {
      SaveManager.reset();

      SaveManager.incrementPityCount('hero_base_1', 10);
      SaveManager.incrementPityCount('hero_base_2', 20);

      expect(SaveManager.getPityCount('hero_base_1')).toBe(10);
      expect(SaveManager.getPityCount('hero_base_2')).toBe(20);
    });

    it('getPityInfo softPity 구간 정확도 (count=30)', () => {
      SaveManager.reset();
      SaveManager.incrementPityCount('hero_base_1', 30);

      const info = SaveManager.getPityInfo('hero_base_1');

      expect(info.count).toBe(30);
      expect(info.isSoftPity).toBe(true);
      expect(info.isHardPity).toBe(false);
      expect(info.pullsUntilSoft).toBe(0);
      expect(info.pullsUntilHard).toBe(20);
      expect(info.currentRate).toBeCloseTo(0.04, 5);
    });

    it('getPityInfo hardPity 구간 정확도 (count=50)', () => {
      SaveManager.reset();
      SaveManager.incrementPityCount('hero_base_1', 50);

      const info = SaveManager.getPityInfo('hero_base_1');

      expect(info.count).toBe(50);
      expect(info.isSoftPity).toBe(true);
      expect(info.isHardPity).toBe(true);
      expect(info.pullsUntilSoft).toBe(0);
      expect(info.pullsUntilHard).toBe(0);
      expect(info.currentRate).toBe(1.0);
    });

    it('마이그레이션 가드: pity 없는 구버전 데이터 → 자동 추가', () => {
      // 구버전 데이터 (pity 필드 없음) 시뮬레이션
      const oldData = SaveManager.getDefaultSave();
      delete oldData.pity;
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.pity).toBeDefined();
      expect(typeof loaded.pity).toBe('object');
    });
  });

  // ==================== T-C2: 신규 계정 초기 상태 ====================

  describe('신규 계정 초기 상태 (T-C2)', () => {
    it('레거시 스타터 4명 대신 base_iris 1인 파티로 시작한다', () => {
      mockLocalStorage.clear();

      const fresh = SaveManager.load();

      expect(fresh.characters).toHaveLength(1);
      expect(fresh.characters[0].characterId).toBe('base_iris');
      expect(fresh.parties[0]).toEqual(['base_iris', null, null, null]);
      expect(fresh.baseHeroes.map(h => h.baseHeroId)).toEqual(['base_iris']);
      expect(fresh.statistics.charactersCollected).toBe(1);

      const ownedIds = fresh.characters.map(c => c.characterId);
      SaveManager.LEGACY_STARTER_IDS.forEach(id => {
        expect(ownedIds).not.toContain(id);
      });
    });

    it('초기 지급 재화가 설계 표와 일치한다', () => {
      mockLocalStorage.clear();

      const { resources } = SaveManager.load();

      expect(resources.gold).toBe(10000);
      expect(resources.gems).toBe(1500);
      expect(resources.summonTickets).toBe(10);
      expect(resources.spiritStones).toBe(6);
      expect(resources.institutionSeal).toBe(1);
      expect(resources.awakeningFlame).toBe(0);
      expect(resources.worldTreeSeeds).toBe(0);
      expect(resources.cultEssence).toEqual({});
      expect(resources.characterShards).toEqual({ base_omar: 0 });
    });

    it('신규 세이브는 튜토리얼 미시작 상태이고 해금된 메뉴가 없다', () => {
      mockLocalStorage.clear();

      const fresh = SaveManager.load();

      expect(fresh.version).toBe(2);
      expect(fresh.tutorial.currentStep).toBe('T-01');
      expect(fresh.tutorial.completedSteps).toEqual([]);
      expect(fresh.tutorial.completed).toBe(false);
      expect(fresh.story.viewedCutscenes).toEqual([]);
      expect(fresh.onboarding.unlockedMenus).toEqual([]);
      expect(fresh.onboarding.firstAscensionGrantUsed).toBe(false);
      expect(fresh.onboarding.starterHeroId).toBe('base_iris');
    });
  });

  // ==================== T-C1: 세이브 스키마 v1 -> v2 마이그레이션 ====================

  describe('세이브 스키마 v1 → v2 마이그레이션 (T-C1)', () => {
    /** 온보딩 도입 이전의 v1 세이브 (tutorial/story/onboarding 없음) */
    const makeV1Save = (overrides = {}) => ({
      version: 1,
      player: { name: '구버전', level: 1, exp: 0 },
      resources: { gold: 10000, gems: 2700, summonTickets: 10, skillBooks: 0, characterShards: {} },
      characters: [
        { id: 'char_1', characterId: 'char_1', level: 12, exp: 0, stars: 2, skillLevels: [1, 1, 1] },
        { id: 'char_2', characterId: 'char_2', level: 10, exp: 0, stars: 2, skillLevels: [1, 1, 1] }
      ],
      parties: [['char_1', 'char_2', null, null]],
      inventory: [],
      progress: { currentChapter: 'chapter_1', clearedStages: { stage_1_1: 3 }, towerFloor: 1, totalBattles: 12 },
      gacha: { pityCounter: 4, totalPulls: 12 },
      quests: { daily: {}, dailyProgress: {}, lastReset: null },
      settings: { bgmVolume: 1, sfxVolume: 1, autoSkip: false, battleSpeed: 1 },
      statistics: { totalGoldEarned: 500, totalGemsSpent: 0, charactersCollected: 2, highestDamage: 0 },
      createdAt: 1700000000000,
      ...overrides
    });

    it('version 1 세이브가 로드 후 version 2가 되고 신규 섹션 기본값을 갖는다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeV1Save()));

      const loaded = SaveManager.load();

      expect(loaded.version).toBe(2);
      expect(loaded.tutorial).toBeDefined();
      expect(loaded.story).toBeDefined();
      expect(loaded.onboarding).toBeDefined();
      expect(Array.isArray(loaded.tutorial.completedSteps)).toBe(true);
      expect(Array.isArray(loaded.story.viewedCutscenes)).toBe(true);
      expect(loaded.resources.spiritStones).toBeGreaterThanOrEqual(0);
      // 기존 진행도는 보존된다
      expect(loaded.progress.clearedStages.stage_1_1).toBe(3);
      expect(loaded.gacha.pityCounter).toBe(4);
    });

    it('진행 이력이 있는 기존 유저는 튜토리얼 완주 처리되고 메뉴 13개가 열린다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeV1Save()));

      const loaded = SaveManager.load();

      expect(loaded.tutorial.completed).toBe(true);
      expect(loaded.tutorial.skipped).toBe(true);
      expect(loaded.tutorial.currentStep).toBeNull();
      expect(loaded.tutorial.completedSteps).toEqual(SaveManager.TUTORIAL_STEP_IDS);
      expect(loaded.onboarding.unlockedMenus).toEqual(SaveManager.ALL_MENU_KEYS);
      expect(loaded.onboarding.unlockedMenus).toHaveLength(13);
    });

    it('레거시 char_1~4는 로드 시 제거되고 레벨이 보유 영웅에 승계된다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeV1Save()));

      const loaded = SaveManager.load();

      const legacy = loaded.characters.filter(c => SaveManager.LEGACY_STARTER_IDS.includes(c.characterId));
      expect(legacy).toHaveLength(0);
      // char_1의 레벨 12가 소실되지 않고 이관된다
      expect(loaded.characters.find(c => c.characterId === 'base_iris').level).toBe(12);
    });

    it('온보딩 미경험 기존 유저에게 소급 지급이 1회만 적용된다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeV1Save()));

      const first = SaveManager.load();

      expect(first.characters.some(c => c.characterId === 'base_iris')).toBe(true);
      expect(first.baseHeroes.some(h => h.baseHeroId === 'base_iris')).toBe(true);
      expect(first.resources.characterShards.base_omar).toBe(30);
      expect(first.resources.spiritStones).toBe(6);
      expect(first.resources.institutionSeal).toBe(1);
      expect(first.onboarding.grantVersion).toBe(SaveManager.ONBOARDING_GRANT_VERSION);
      // 레거시 편성은 보유 영웅으로 교체된다
      expect(first.parties[0]).toEqual(['base_iris', null, null, null]);

      const second = SaveManager.load();

      expect(second.characters.filter(c => c.characterId === 'base_iris')).toHaveLength(1);
      expect(second.resources.characterShards.base_omar).toBe(30);
      expect(second.resources.spiritStones).toBe(6);
      expect(second.resources.institutionSeal).toBe(1);
    });

    it('이미 진화 시스템을 사용한 기존 유저는 소급 지급 대상이 아니다', () => {
      const v1 = makeV1Save({
        baseHeroes: [{ baseHeroId: 'base_sera', fragmentCount: 12, openedRoutes: [] }],
        ascendedHeroes: []
      });
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(v1));

      const loaded = SaveManager.load();

      // 소급 재화는 지급되지 않는다
      expect(loaded.resources.characterShards.base_omar).toBeUndefined();
      expect(loaded.resources.spiritStones).toBe(0);
      expect(loaded.resources.institutionSeal).toBe(0);
      expect(loaded.onboarding.grantVersion).toBe(SaveManager.ONBOARDING_GRANT_VERSION);
      // 다만 레거시 정리로 보유 캐릭터가 0이 되므로 진행 가능하도록 base_iris는 편성된다
      expect(loaded.characters.map(c => c.characterId)).toEqual(['base_iris']);
    });

    it('v2 세이브를 다시 로드해도 진행 중인 튜토리얼 상태가 덮이지 않는다', () => {
      mockLocalStorage.clear();
      const data = SaveManager.load();
      data.tutorial.currentStep = 'T-05';
      data.tutorial.completedSteps = ['T-01', 'T-02', 'T-03', 'T-04'];
      data.onboarding.unlockedMenus = ['herolist', 'partyedit'];
      data.onboarding.freeMultiPullUsed = true;
      SaveManager.save(data);

      const reloaded = SaveManager.load();

      expect(reloaded.tutorial.currentStep).toBe('T-05');
      expect(reloaded.tutorial.completedSteps).toEqual(['T-01', 'T-02', 'T-03', 'T-04']);
      expect(reloaded.tutorial.completed).toBe(false);
      expect(reloaded.onboarding.unlockedMenus).toEqual(['herolist', 'partyedit']);
      expect(reloaded.onboarding.freeMultiPullUsed).toBe(true);
    });
  });

  // ==================== 레거시 스타터(char_1~4) 정리 마이그레이션 ====================

  describe('레거시 스타터 정리 (char_1~4 제거)', () => {
    /** char_1~4를 보유한 v1 세이브. 장비 1점과 파티 편성 포함 */
    const makeLegacySave = (overrides = {}) => ({
      version: 1,
      player: { name: '구버전', level: 1, exp: 0 },
      resources: { gold: 10000, gems: 2700, summonTickets: 10, skillBooks: 0, characterShards: {} },
      characters: [
        {
          id: 'char_1', characterId: 'char_1', level: 27, exp: 340, stars: 2, skillLevels: [1, 1, 1],
          equipment: { weapon: 'eq_sword_01', armor: null, accessory: null }
        },
        { id: 'char_2', characterId: 'char_2', level: 12, exp: 60, stars: 2, skillLevels: [1, 1, 1] },
        { id: 'char_3', characterId: 'char_3', level: 8, exp: 10, stars: 2, skillLevels: [1, 1, 1] },
        { id: 'char_4', characterId: 'char_4', level: 5, exp: 0, stars: 2, skillLevels: [1, 1, 1] }
      ],
      parties: [['char_1', 'char_2', 'char_3', 'char_4']],
      inventory: { equipment: [{ id: 'eq_sword_01', slotType: 'weapon', equippedBy: 'char_1' }] },
      progress: { currentChapter: 'chapter_1', clearedStages: { stage_1_1: 3 }, towerFloor: 1, totalBattles: 20 },
      gacha: { pityCounter: 0, totalPulls: 0 },
      quests: { daily: {}, dailyProgress: {}, lastReset: null },
      settings: { bgmVolume: 1, sfxVolume: 1, autoSkip: false, battleSpeed: 1 },
      statistics: { totalGoldEarned: 0, totalGemsSpent: 0, charactersCollected: 4, highestDamage: 0 },
      createdAt: 1700000000000,
      ...overrides
    });

    it('레거시 캐릭터를 제거하고 최고 레벨과 누적 경험치를 보유 영웅에게 이관한다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

      const loaded = SaveManager.load();

      const remainingIds = loaded.characters.map(c => c.characterId);
      SaveManager.LEGACY_STARTER_IDS.forEach(id => expect(remainingIds).not.toContain(id));

      const heir = loaded.characters.find(c => c.characterId === 'base_iris');
      expect(heir).toBeDefined();
      // 최고 레거시 레벨 27 승계 (base_iris 상한 30 이내)
      expect(heir.level).toBe(27);
      // 누적 경험치 340 + 60 + 10 + 0
      expect(heir.exp).toBe(410);
      expect(loaded.onboarding.legacyMigratedAt).toEqual(expect.any(Number));
    });

    it('레거시가 장착 중이던 장비를 해제해 인벤토리로 되돌린다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

      const loaded = SaveManager.load();

      const item = loaded.inventory.equipment.find(e => e.id === 'eq_sword_01');
      expect(item).toBeDefined();
      expect(item.equippedBy).toBeNull();
      // 장비 자체는 소멸하지 않는다
      expect(loaded.inventory.equipment).toHaveLength(1);
    });

    it('파티 슬롯의 레거시 id를 보유 영웅으로 교체하고 남는 칸은 null로 둔다', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

      const loaded = SaveManager.load();

      expect(loaded.parties[0]).toEqual(['base_iris', null, null, null]);
      const ownedIds = loaded.characters.map(c => c.characterId);
      loaded.parties[0].filter(Boolean).forEach(id => expect(ownedIds).toContain(id));
    });

    it('보유 영웅이 레거시뿐이면 base_iris를 지급해 진행이 막히지 않게 한다', () => {
      const onlyLegacy = makeLegacySave({
        characters: [{ id: 'char_3', characterId: 'char_3', level: 4, exp: 0, stars: 2, skillLevels: [1, 1, 1] }],
        parties: [['char_3', null, null, null]]
      });
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(onlyLegacy));

      const loaded = SaveManager.load();

      expect(loaded.characters).toHaveLength(1);
      expect(loaded.characters[0].characterId).toBe('base_iris');
      expect(loaded.baseHeroes.some(h => h.baseHeroId === 'base_iris')).toBe(true);
      expect(loaded.parties[0][0]).toBe('base_iris');
    });

    it('재로드해도 결과가 변하지 않는다 (멱등)', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

      const first = SaveManager.load();
      const snapshot = {
        characters: first.characters.map(c => ({ id: c.characterId, level: c.level, exp: c.exp })),
        parties: JSON.parse(JSON.stringify(first.parties)),
        legacyMigratedAt: first.onboarding.legacyMigratedAt
      };

      const second = SaveManager.load();

      expect(second.characters.map(c => ({ id: c.characterId, level: c.level, exp: c.exp })))
        .toEqual(snapshot.characters);
      expect(second.parties).toEqual(snapshot.parties);
      // 이미 정리된 계정은 시각을 덮어쓰지 않는다
      expect(second.onboarding.legacyMigratedAt).toBe(snapshot.legacyMigratedAt);
    });

    it('신규 세이브는 정리 대상이 없어 아무 영향도 받지 않는다', () => {
      mockLocalStorage.clear();

      const fresh = SaveManager.load();

      expect(fresh.characters).toHaveLength(1);
      expect(fresh.characters[0].characterId).toBe('base_iris');
      expect(fresh.characters[0].level).toBe(1);
      expect(fresh.characters[0].exp).toBe(0);
      expect(fresh.parties[0]).toEqual(['base_iris', null, null, null]);
      // 정리를 수행하지 않았으므로 시각도 찍히지 않는다
      expect(fresh.onboarding.legacyMigratedAt).toBeNull();
    });

    // QA P1-5: 보유 영웅 4→1 변화를 아무 말 없이 하면 유저는 계정 손상으로 읽는다
    describe('1회성 통합 안내 (legacyMigrationNotice)', () => {
      it('정리를 수행하면 이관 내역을 담은 안내 플래그가 남는다', () => {
        mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

        const notice = SaveManager.load().onboarding.legacyMigrationNotice;

        expect(notice).toBeDefined();
        expect(notice.removedCount).toBe(4);
        expect(notice.removedIds).toEqual(['char_1', 'char_2', 'char_3', 'char_4']);
        expect(notice.heirId).toBe('base_iris');
        expect(notice.heirLevel).toBe(27);
        expect(notice.equipmentReturned).toBe(1);
      });

      it('안내의 파티는 자동 편성까지 끝난 최종 편성과 같다', () => {
        mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

        const loaded = SaveManager.load();
        const notice = loaded.onboarding.legacyMigrationNotice;

        expect(notice.partyIds).toEqual(SaveManager._readPartySlots(loaded.parties[0]).filter(Boolean));
      });

      it('consumeLegacyMigrationNotice 는 한 번만 값을 주고 플래그를 지운다', () => {
        mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(makeLegacySave()));

        const first = SaveManager.consumeLegacyMigrationNotice();
        const second = SaveManager.consumeLegacyMigrationNotice();

        expect(first?.removedCount).toBe(4);
        expect(second).toBeNull();
        expect(SaveManager.load().onboarding.legacyMigrationNotice).toBeUndefined();
      });

      it('신규 세이브에는 안내할 것이 없다', () => {
        mockLocalStorage.clear();

        expect(SaveManager.load().onboarding.legacyMigrationNotice).toBeUndefined();
        expect(SaveManager.consumeLegacyMigrationNotice()).toBeNull();
      });
    });
  });

  // ==================== 현재 파티 자동 편성 보장 ====================

  describe('현재 파티 자동 편성 (ensureActiveParty)', () => {
    it('신규 세이브의 현재 파티에 base_iris가 편성되어 있다', () => {
      mockLocalStorage.clear();

      const fresh = SaveManager.load();

      expect(SaveManager._readPartySlots(fresh.parties[0])).toContain('base_iris');
    });

    it('파티가 비어 있으면 보유 영웅 상위 4명으로 채운다', () => {
      mockLocalStorage.clear();
      const data = SaveManager.load();
      data.characters = [
        { id: 'base_iris', characterId: 'base_iris', level: 5, exp: 0, stars: 3, skillLevels: [1, 1, 1] },
        { id: 'asc_iris_olympus', characterId: 'asc_iris_olympus', level: 5, exp: 0, stars: 5, skillLevels: [1, 1, 1] },
        { id: 'base_omar', characterId: 'base_omar', level: 9, exp: 0, stars: 3, skillLevels: [1, 1, 1] }
      ];
      data.parties = [[null, null, null, null]];

      const changed = SaveManager.ensureActiveParty(data);

      expect(changed).toBe(true);
      // 성급 → 레벨 순으로 강한 영웅이 앞 슬롯에 온다
      expect(data.parties[0]).toEqual(['asc_iris_olympus', 'base_omar', 'base_iris', null]);
    });

    it('이미 보유 영웅이 편성되어 있으면 건드리지 않는다', () => {
      mockLocalStorage.clear();
      const data = SaveManager.load();
      data.parties = [['base_iris', null, null, null]];

      const changed = SaveManager.ensureActiveParty(data);

      expect(changed).toBe(false);
      expect(data.parties[0]).toEqual(['base_iris', null, null, null]);
    });

    it('{ heroIds } 형식의 파티도 형식을 유지한 채 채운다', () => {
      mockLocalStorage.clear();
      const data = SaveManager.load();
      data.parties = [{ heroIds: [], name: '파티 1', isActive: true }];

      const changed = SaveManager.ensureActiveParty(data);

      expect(changed).toBe(true);
      expect(data.parties[0].name).toBe('파티 1');
      expect(data.parties[0].heroIds).toEqual(['base_iris', null, null, null]);
    });

    it('레거시 세이브를 로드하면 파티가 비어 있지 않다', () => {
      const legacy = {
        version: 1,
        player: { name: '구버전', level: 1, exp: 0 },
        resources: { gold: 1000, gems: 100, characterShards: {} },
        characters: [{ id: 'char_1', characterId: 'char_1', level: 9, exp: 0, stars: 2, skillLevels: [1, 1, 1] }],
        parties: [['char_1', null, null, null]],
        progress: { currentChapter: 'chapter_1', clearedStages: {}, towerFloor: 1, totalBattles: 7 },
        statistics: {}
      };
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(legacy));

      const loaded = SaveManager.load();

      const slots = SaveManager._readPartySlots(loaded.parties[0]);
      expect(slots.filter(Boolean).length).toBeGreaterThan(0);
      expect(slots).toContain('base_iris');
    });

    it('보유 영웅이 없으면 편성을 시도하지 않는다', () => {
      const data = { characters: [], parties: [[null, null, null, null]] };

      expect(SaveManager.ensureActiveParty(data)).toBe(false);
      expect(data.parties[0]).toEqual([null, null, null, null]);
    });
  });
});

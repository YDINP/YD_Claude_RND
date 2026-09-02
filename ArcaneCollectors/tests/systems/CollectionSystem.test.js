/**
 * CollectionSystem.test.js
 * COLL-01 / COLL-02 - 컬렉션 진행도, 완성 보너스, 추가 루트 개방
 * 설계 근거: docs/COLLECTION_DESIGN_NOTE.md §6 테스트 체크리스트
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CollectionSystem,
  buildOwnedSet,
  computeProgress,
  computeExtraRouteCost,
  tierOf,
  resolveCollectionId,
  getBaseHeroList,
  COLLECTION_ERRORS,
  COLLECTION_BONUS_TIERS,
  ACCOUNT_COMPLETE_BONUS,
} from '../../src/systems/CollectionSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus, GameEvents } from '../../src/systems/EventBus.js';

/** 테스트용 최소 세이브 데이터 */
function makeSave(overrides = {}) {
  return {
    version: 1,
    resources: {
      gold: 0,
      gems: 0,
      characterShards: {},
      worldTreeSeeds: 0,
      cultEssence: {},
      institutionSeal: 0,
      awakeningFlame: 0,
      ...(overrides.resources || {}),
    },
    characters: overrides.characters || [],
    baseHeroes: overrides.baseHeroes || [],
    ascendedHeroes: overrides.ascendedHeroes || [],
    collections: overrides.collections || {},
    statistics: { charactersCollected: 0 },
  };
}

/** 보유 전직 영웅 등록 헬퍼 */
function own(save, ...ascendedHeroIds) {
  ascendedHeroIds.forEach((id) => {
    save.ascendedHeroes.push({ ascendedHeroId: id });
  });
  return save;
}

describe('CollectionSystem', () => {
  let mockLocalStorage;

  beforeEach(() => {
    mockLocalStorage = {
      data: {},
      getItem(key) { return this.data[key] || null; },
      setItem(key, value) { this.data[key] = value; },
      removeItem(key) { delete this.data[key]; },
      clear() { this.data = {}; },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    EventBus.clear?.();
  });

  // ==================== 데이터 정합성 ====================

  describe('데이터 정합성', () => {
    it('기본영웅 10명 · 총 루트 24개 (설계노트 §0)', () => {
      const heroes = getBaseHeroList();
      const totalRoutes = heroes.reduce((sum, h) => sum + h.ascensionRoutes.length, 0);

      expect(heroes.length).toBe(10);
      expect(totalRoutes).toBe(24);
    });

    it('모든 기본영웅이 collectionId로 해석된다', () => {
      getBaseHeroList().forEach((hero) => {
        expect(resolveCollectionId(hero)).toMatch(/_collection$/);
      });
    });

    it('전직 영웅 id로 기본영웅을 역참조한다', () => {
      expect(CollectionSystem.resolveBaseHeroId('asc_iris_valhalla')).toBe('base_iris');
      expect(CollectionSystem.resolveBaseHeroId('unknown_hero')).toBeNull();
    });
  });

  // ==================== S-1 진행도 ====================

  describe('S-1 진행도 계산', () => {
    it('tierOf: 과반 이상은 Tier1, 전체 완성은 Tier2', () => {
      expect(tierOf(0, 3)).toBe(0);
      expect(tierOf(1, 3)).toBe(0);   // 3루트 중 1루트 = 과반 미만
      expect(tierOf(2, 3)).toBe(1);
      expect(tierOf(3, 3)).toBe(2);
      expect(tierOf(1, 2)).toBe(1);   // 2루트 중 1루트 = 과반
      expect(tierOf(2, 2)).toBe(2);
    });

    it('2루트 영웅 1루트 개방 = Tier1 (+3%)', () => {
      const save = own(makeSave(), 'asc_luca_asgard'); // 루카 = 2루트
      const progress = CollectionSystem.getProgress('base_luca', save);

      expect(progress.total).toBe(2);
      expect(progress.obtained).toEqual(['asc_luca_asgard']);
      expect(progress.tier).toBe(1);
      expect(progress.rate).toBeCloseTo(0.5);
      expect(CollectionSystem.getTierBonus('base_luca', save)).toEqual(COLLECTION_BONUS_TIERS[1]);
    });

    it('3루트 영웅 1루트 개방 = Tier0 (보너스 없음)', () => {
      const save = own(makeSave(), 'asc_iris_olympus'); // 아이리스 = 3루트
      const progress = CollectionSystem.getProgress('base_iris', save);

      expect(progress.tier).toBe(0);
      expect(progress.title).toBeNull();
      expect(CollectionSystem.getTierBonus('base_iris', save)).toEqual(COLLECTION_BONUS_TIERS[0]);
    });

    it('3루트 영웅 2루트 = Tier1, 3루트 = Tier2 (Tier1과 합산하지 않음)', () => {
      const partial = own(makeSave(), 'asc_iris_olympus', 'asc_iris_valhalla');
      expect(CollectionSystem.getProgress('base_iris', partial).tier).toBe(1);

      const full = own(makeSave(), 'asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos');
      const bonus = CollectionSystem.getTierBonus('base_iris', full);

      expect(CollectionSystem.getProgress('base_iris', full).tier).toBe(2);
      expect(bonus).toEqual({ hp: 0.06, atk: 0.06, def: 0.06, spd: 0.06 });
      expect(bonus.hp).not.toBeCloseTo(0.09); // Tier1 + Tier2 합산이 아님
    });

    it('collectionId로도 진행도를 조회할 수 있다', () => {
      const save = own(makeSave(), 'asc_iris_olympus');
      const byCollection = CollectionSystem.getProgress('iris_collection', save);

      expect(byCollection.baseHeroId).toBe('base_iris');
      expect(byCollection.collectionId).toBe('iris_collection');
    });

    it('getAllProgress는 컬렉션 10개를 모두 반환한다', () => {
      const all = CollectionSystem.getAllProgress(makeSave());

      expect(all).toHaveLength(10);
      expect(all.every((p) => p.tier === 0)).toBe(true);
      expect(all.reduce((sum, p) => sum + p.total, 0)).toBe(24);
    });

    it('isComplete는 전체 루트 보유 시에만 true', () => {
      const partial = own(makeSave(), 'asc_kai_yomi');
      const full = own(makeSave(), 'asc_kai_yomi', 'asc_kai_helheim');

      expect(CollectionSystem.isComplete('base_kai', partial)).toBe(false);
      expect(CollectionSystem.isComplete('base_kai', full)).toBe(true);
    });

    it('보유 목록은 ascendedHeroes/characters/openedRoutes/collections의 합집합', () => {
      const save = makeSave({
        ascendedHeroes: [{ ascendedHeroId: 'asc_iris_olympus' }],
        characters: [{ characterId: 'asc_iris_valhalla' }, { characterId: 'char_1' }],
        baseHeroes: [{ baseHeroId: 'base_hana', openedRoutes: ['yomi'] }],
        collections: { paolo_collection: { obtained: ['asc_paolo_balance'] } },
      });
      const owned = buildOwnedSet(save);

      expect(owned.has('asc_iris_olympus')).toBe(true);
      expect(owned.has('asc_iris_valhalla')).toBe(true);
      expect(owned.has('asc_hana_yomi')).toBe(true);
      expect(owned.has('asc_paolo_balance')).toBe(true);
      expect(owned.has('char_1')).toBe(false);
    });
  });

  // ==================== C-4 보너스 / 칭호 ====================

  describe('C-4 완성 보너스와 칭호', () => {
    it('Tier1/Tier2 칭호가 설계노트 확정 목록과 일치한다', () => {
      const tier1 = own(makeSave(), 'asc_iris_olympus', 'asc_iris_valhalla');
      const tier2 = own(makeSave(), 'asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos');

      expect(CollectionSystem.getTitle('base_iris', tier1)).toBe('번개의 각인');
      expect(CollectionSystem.getTitle('base_iris', tier2)).toBe('삼중뇌전의 주인');
      expect(CollectionSystem.getTitle('base_iris', makeSave())).toBeNull();
    });

    it('10/10 완성 시에만 계정 공용 보너스가 적용된다', () => {
      const partial = own(makeSave(), 'asc_iris_olympus', 'asc_iris_valhalla', 'asc_iris_chaos');
      expect(CollectionSystem.getAccountWideBonus(partial)).toEqual({ hp: 0, atk: 0, def: 0, spd: 0 });

      const allRoutes = getBaseHeroList().flatMap((h) => h.ascensionRoutes.map((r) => r.ascendedHeroId));
      const complete = own(makeSave(), ...allRoutes);
      const summary = CollectionSystem.getAccountSummary(complete);

      expect(summary.completed).toBe(10);
      expect(summary.accountComplete).toBe(true);
      expect(CollectionSystem.getAccountWideBonus(complete)).toEqual(ACCOUNT_COMPLETE_BONUS);
    });

    it('계정 완성 시 파티 4명 전원의 ATK가 계정 보너스만큼 상승한다', () => {
      const allRoutes = getBaseHeroList().flatMap((h) => h.ascensionRoutes.map((r) => r.ascendedHeroId));
      const complete = own(makeSave(), ...allRoutes);

      const units = ['asc_iris_olympus', 'asc_sera_avalon', 'asc_luca_asgard', 'asc_kai_yomi']
        .map((id) => ({ id, data: { id }, maxHp: 1000, currentHp: 1000, atk: 100, def: 100, spd: 100 }));

      CollectionSystem.applyCollectionBonuses(units, complete);

      // Tier2(+6%) + 계정(+2%) = +8%
      units.forEach((unit) => {
        expect(unit.atk).toBe(108);
        expect(unit.def).toBe(108);
        expect(unit.maxHp).toBe(1060); // HP는 계정 보너스 없음
        expect(unit.spd).toBe(106);
      });
    });

    it('applyCollectionBonuses는 적 유닛과 미달 컬렉션을 건드리지 않는다', () => {
      const save = own(makeSave(), 'asc_iris_olympus'); // Tier0
      const units = [
        { id: 'asc_iris_olympus', data: { id: 'asc_iris_olympus' }, maxHp: 1000, currentHp: 1000, atk: 100, def: 100, spd: 100 },
        { id: 'enemy_1', data: { id: 'enemy_1' }, isEnemy: true, maxHp: 1000, currentHp: 1000, atk: 100, def: 100, spd: 100 },
      ];

      CollectionSystem.applyCollectionBonuses(units, save);

      expect(units[0].atk).toBe(100);
      expect(units[1].atk).toBe(100);
    });

    it('HP 보너스 적용 시 현재 HP 비율이 유지된다', () => {
      const save = own(makeSave(), 'asc_kai_yomi', 'asc_kai_helheim'); // Tier2
      const units = [{
        id: 'asc_kai_yomi', data: { id: 'asc_kai_yomi' },
        maxHp: 1000, currentHp: 500, atk: 100, def: 100, spd: 100,
      }];

      CollectionSystem.applyCollectionBonuses(units, save);

      expect(units[0].maxHp).toBe(1060);
      expect(units[0].currentHp).toBe(530);
    });
  });

  // ==================== registerAscension ====================

  describe('registerAscension', () => {
    it('보유 등록 시 collections.obtained에 추가되고 COLLECTION_UPDATED가 발행된다', () => {
      const save = makeSave();
      const spy = vi.fn();
      EventBus.on(GameEvents.COLLECTION_UPDATED, spy);

      const result = CollectionSystem.registerAscension(save, 'asc_luca_asgard');

      expect(result.added).toBe(true);
      expect(result.tier).toBe(1);
      expect(save.collections.luca_collection.obtained).toContain('asc_luca_asgard');
      expect(spy).toHaveBeenCalledTimes(1);

      EventBus.off(GameEvents.COLLECTION_UPDATED, spy);
    });

    it('중복 등록은 added=false이며 목록이 늘어나지 않는다', () => {
      const save = makeSave();
      CollectionSystem.registerAscension(save, 'asc_luca_asgard');
      const second = CollectionSystem.registerAscension(save, 'asc_luca_asgard');

      expect(second.added).toBe(false);
      expect(save.collections.luca_collection.obtained).toHaveLength(1);
    });

    it('Tier2 달성 시 COLLECTION_COMPLETED 발행 + completedAt 기록', () => {
      const save = makeSave();
      const spy = vi.fn();
      EventBus.on(GameEvents.COLLECTION_COMPLETED, spy);

      CollectionSystem.registerAscension(save, 'asc_kai_yomi');
      expect(spy).not.toHaveBeenCalled();

      const result = CollectionSystem.registerAscension(save, 'asc_kai_helheim');

      expect(result.tier).toBe(2);
      expect(result.title).toBe('생사의 경계인');
      expect(save.collections.kai_collection.completedAt).toBeTypeOf('number');
      expect(spy).toHaveBeenCalledTimes(1);

      EventBus.off(GameEvents.COLLECTION_COMPLETED, spy);
    });
  });

  // ==================== S-2 추가 루트 개방 (COLL-02) ====================

  describe('S-2 추가 루트 개방 비용', () => {
    it('computeExtraRouteCost: extraIndex 1 = ceil(base×1.5), 씨앗 1', () => {
      expect(computeExtraRouteCost(30, 1, 'SSR')).toEqual({
        worldTreeSeeds: 1, essence: 45, institutionSeal: 1, awakeningFlame: 3,
      });
      expect(computeExtraRouteCost(20, 1, 'SR')).toEqual({
        worldTreeSeeds: 1, essence: 30, institutionSeal: 1, awakeningFlame: 0,
      });
      expect(computeExtraRouteCost(10, 1, 'R').essence).toBe(15);
    });

    it('computeExtraRouteCost: extraIndex 2 = ceil(base×2.25), 씨앗 2', () => {
      expect(computeExtraRouteCost(30, 2, 'SSR').essence).toBe(68);
      expect(computeExtraRouteCost(20, 2, 'SR').essence).toBe(45);
      expect(computeExtraRouteCost(10, 2, 'R').essence).toBe(23);
      expect(computeExtraRouteCost(30, 2, 'SSR').worldTreeSeeds).toBe(2);
    });

    it('getExtraRouteCost는 보유 루트 수로 extraIndex를 결정한다', () => {
      const one = own(makeSave(), 'asc_iris_olympus');
      const two = own(makeSave(), 'asc_iris_olympus', 'asc_iris_valhalla');

      const first = CollectionSystem.getExtraRouteCost('base_iris', 'valhalla', one);
      const second = CollectionSystem.getExtraRouteCost('base_iris', 'chaos', two);

      expect(first).toMatchObject({
        extraIndex: 1, worldTreeSeeds: 1, institutionSeal: 1, awakeningFlame: 3,
      });
      expect(first.cultEssence.valhalla).toBe(45);
      expect(second).toMatchObject({ extraIndex: 2, worldTreeSeeds: 2 });
      expect(second.cultEssence.chaos).toBe(68);
    });
  });

  describe('S-2 개방 검증 및 실행', () => {
    /** 첫 루트 보유 + 충분한 재화를 가진 세이브 */
    function readySave() {
      const save = own(makeSave({
        resources: {
          worldTreeSeeds: 5,
          cultEssence: { valhalla: 100, chaos: 100 },
          institutionSeal: 5,
          awakeningFlame: 10,
        },
        baseHeroes: [{ baseHeroId: 'base_iris', fragmentCount: 0, openedRoutes: ['olympus'], awakened: true }],
      }), 'asc_iris_olympus');
      return save;
    }

    it('각성 전(보유 루트 0)에는 NOT_AWAKENED로 거부한다', () => {
      const save = makeSave({ resources: { worldTreeSeeds: 5, cultEssence: { valhalla: 100 }, institutionSeal: 5, awakeningFlame: 10 } });
      const result = CollectionSystem.openExtraRoute(save, 'base_iris', 'valhalla');

      expect(result.success).toBe(false);
      expect(result.error).toBe(COLLECTION_ERRORS.NOT_AWAKENED);
    });

    it('존재하지 않는 루트는 ROUTE_NOT_FOUND', () => {
      const result = CollectionSystem.openExtraRoute(readySave(), 'base_iris', 'nature');
      expect(result.error).toBe(COLLECTION_ERRORS.ROUTE_NOT_FOUND);
    });

    it('이미 보유한 루트는 ALREADY_OPENED', () => {
      const result = CollectionSystem.openExtraRoute(readySave(), 'base_iris', 'olympus');
      expect(result.error).toBe(COLLECTION_ERRORS.ALREADY_OPENED);
    });

    it('재화 부족 시 각각의 INSUFFICIENT_* 사유로 거부하고 차감하지 않는다', () => {
      const noSeeds = readySave();
      noSeeds.resources.worldTreeSeeds = 0;
      expect(CollectionSystem.openExtraRoute(noSeeds, 'base_iris', 'valhalla').error)
        .toBe(COLLECTION_ERRORS.INSUFFICIENT_WORLD_TREE_SEEDS);
      expect(noSeeds.resources.cultEssence.valhalla).toBe(100);

      const noEssence = readySave();
      noEssence.resources.cultEssence.valhalla = 10;
      expect(CollectionSystem.openExtraRoute(noEssence, 'base_iris', 'valhalla').error)
        .toBe(COLLECTION_ERRORS.INSUFFICIENT_CULT_ESSENCE);

      const noSeal = readySave();
      noSeal.resources.institutionSeal = 0;
      expect(CollectionSystem.openExtraRoute(noSeal, 'base_iris', 'valhalla').error)
        .toBe(COLLECTION_ERRORS.INSUFFICIENT_INSTITUTION_SEAL);

      const noFlame = readySave();
      noFlame.resources.awakeningFlame = 0;
      expect(CollectionSystem.openExtraRoute(noFlame, 'base_iris', 'valhalla').error)
        .toBe(COLLECTION_ERRORS.INSUFFICIENT_AWAKENING_FLAME);
      expect(noFlame.resources.worldTreeSeeds).toBe(5);
    });

    it('성공 시 재화 차감 + openedRoutes + 캐릭터 등록이 모두 반영된다', () => {
      const save = readySave();
      const result = CollectionSystem.openExtraRoute(save, 'base_iris', 'valhalla');

      expect(result.success).toBe(true);
      expect(result.ascendedHeroId).toBe('asc_iris_valhalla');

      expect(save.resources.worldTreeSeeds).toBe(4);       // 5 - 1
      expect(save.resources.cultEssence.valhalla).toBe(55); // 100 - 45
      expect(save.resources.institutionSeal).toBe(4);
      expect(save.resources.awakeningFlame).toBe(7);

      const entry = save.baseHeroes.find((b) => b.baseHeroId === 'base_iris');
      expect(entry.openedRoutes).toEqual(['olympus', 'valhalla']);
      expect(save.ascendedHeroes.some((h) => h.ascendedHeroId === 'asc_iris_valhalla')).toBe(true);
      expect(save.characters.some((c) => c.characterId === 'asc_iris_valhalla')).toBe(true);
      expect(save.collections.iris_collection.obtained).toContain('asc_iris_valhalla');
      expect(CollectionSystem.getProgress('base_iris', save).tier).toBe(1);
    });

    it('연속 개방 시 두 번째는 extraIndex 2 비용(에센스 68 · 씨앗 2)이 적용된다', () => {
      const save = readySave();
      CollectionSystem.openExtraRoute(save, 'base_iris', 'valhalla');
      const seedsAfterFirst = save.resources.worldTreeSeeds;

      const second = CollectionSystem.openExtraRoute(save, 'base_iris', 'chaos');

      expect(second.success).toBe(true);
      expect(second.cost.cultEssence.chaos).toBe(68);
      expect(save.resources.worldTreeSeeds).toBe(seedsAfterFirst - 2);
      expect(save.resources.cultEssence.chaos).toBe(32); // 100 - 68
      expect(CollectionSystem.getProgress('base_iris', save).tier).toBe(2);
      expect(CollectionSystem.getTitle('base_iris', save)).toBe('삼중뇌전의 주인');
    });
  });

  // ==================== 파티 제약 ====================

  describe('파티 제약 (같은 기본영웅 중복 편성 불가)', () => {
    it('같은 기본영웅의 다른 루트 2체는 중복으로 판정된다', () => {
      const dup = CollectionSystem.checkPartyBaseHeroUnique([
        'asc_iris_olympus', 'asc_iris_valhalla', 'asc_kai_yomi',
      ]);

      expect(dup.ok).toBe(false);
      expect(dup.duplicates).toEqual(['base_iris']);
    });

    it('서로 다른 기본영웅 파티는 통과한다', () => {
      const ok = CollectionSystem.checkPartyBaseHeroUnique([
        'asc_iris_olympus', 'asc_sera_avalon', 'asc_luca_asgard', 'char_1',
      ]);

      expect(ok.ok).toBe(true);
      expect(ok.duplicates).toEqual([]);
    });
  });

  // ==================== 저장 왕복 / 마이그레이션 ====================

  describe('저장 왕복과 마이그레이션', () => {
    it('기본 세이브에 collections와 세계수의 씨앗 필드가 존재한다', () => {
      const fresh = SaveManager.getDefaultSave();

      expect(fresh.collections).toEqual({});
      expect(fresh.resources.worldTreeSeeds).toBe(0);
      expect(fresh.resources.cultEssence).toEqual({});
      expect(fresh.resources.institutionSeal).toBe(0);
      expect(fresh.resources.awakeningFlame).toBe(0);
    });

    it('구버전 세이브(필드 없음) 로드 시 기본값이 채워지고 크래시하지 않는다', () => {
      const legacy = {
        version: SaveManager.VERSION,
        player: { name: '구버전', level: 5, exp: 0 },
        resources: { gold: 100, gems: 10, characterShards: {} },
        characters: [{ characterId: 'char_1', level: 1, stars: 1, skillLevels: [1, 1] }],
        parties: [[]],
        progress: { totalBattles: 3, clearedStages: {} },
        statistics: {},
      };
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(legacy));

      const loaded = SaveManager.load();

      expect(loaded.collections).toEqual({});
      expect(loaded.resources.worldTreeSeeds).toBe(0);
      expect(loaded.resources.cultEssence).toEqual({});
      expect(loaded.baseHeroes).toEqual([]);
      expect(CollectionSystem.getAllProgress(loaded)).toHaveLength(10);
      expect(CollectionSystem.getTierBonus('base_iris', loaded)).toEqual(COLLECTION_BONUS_TIERS[0]);
    });

    it('구버전 openedRoutes 누락 엔트리도 배열로 보정된다', () => {
      const legacy = {
        version: SaveManager.VERSION,
        resources: { gold: 0, gems: 0, characterShards: {} },
        characters: [{ characterId: 'char_1', level: 1, stars: 1, skillLevels: [1] }],
        progress: { totalBattles: 1, clearedStages: {} },
        statistics: {},
        baseHeroes: [{ baseHeroId: 'base_iris', fragmentCount: 3 }],
      };
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(legacy));

      const loaded = SaveManager.load();

      expect(loaded.baseHeroes[0].openedRoutes).toEqual([]);
    });

    it('컬렉션 상태가 저장/로드 왕복 후에도 동일한 진행도를 산출한다', () => {
      const save = SaveManager.getDefaultSave();
      CollectionSystem.registerAscension(save, 'asc_iris_olympus');
      CollectionSystem.registerAscension(save, 'asc_iris_valhalla');
      SaveManager.save(save);

      const loaded = SaveManager.load();
      const progress = CollectionSystem.getProgress('base_iris', loaded);

      expect(progress.tier).toBe(1);
      expect(progress.obtained).toHaveLength(2);
      expect(CollectionSystem.getTitle('base_iris', loaded)).toBe('번개의 각인');
    });

    it('addWorldTreeSeeds는 보유량을 누적한다', () => {
      SaveManager.save(SaveManager.getDefaultSave());

      expect(SaveManager.addWorldTreeSeeds(3)).toBe(3);
      expect(SaveManager.addWorldTreeSeeds(2)).toBe(5);
      expect(SaveManager.load().resources.worldTreeSeeds).toBe(5);
    });

    it('computeProgress는 파생값을 저장하지 않고 매번 재계산한다', () => {
      const save = own(makeSave(), 'asc_hana_yomi', 'asc_hana_helheim');
      const hero = getBaseHeroList().find((h) => h.id === 'base_hana');

      const first = computeProgress(hero, buildOwnedSet(save));
      own(save, 'asc_hana_chaos');
      const second = computeProgress(hero, buildOwnedSet(save));

      expect(first.tier).toBe(1);
      expect(second.tier).toBe(2);
      expect(save.collections).toEqual({}); // 파생값 미저장
    });
  });
});

/**
 * ProgressionSystem.test.js
 * Unit tests for ProgressionSystem - 캐릭터 성장 시스템
 * 20 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      characters: [],
      resources: { gold: 10000, gems: 1000, skillBooks: 50, characterShards: {} }
    })),
    save: vi.fn(),
    getCharacter: vi.fn(() => ({
      id: 'hero_001',
      level: 1,
      exp: 0,
      rarity: 'SR',
      stars: 1,
      skillLevels: [1, 1]
    })),
    updateCharacter: vi.fn(),
    spendGold: vi.fn(),
    getResources: vi.fn(() => ({
      gold: 10000,
      skillBooks: 50,
      characterShards: {}
    }))
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    LEVEL_UP: 'level_up'
  }
}));

const MOCK_HERO_001 = {
  id: 'hero_001',
  name: 'Test Hero',
  rarity: 'SR',
  baseStats: { hp: 1200, atk: 120, def: 60, spd: 105 },
  growth: { hp: 120, atk: 12, def: 6, spd: 2 }
};

// getCharacterOrHero는 실제 JSON을 조회한다 (BLK-03 ID 조회 회귀 테스트용).
// 미지의 ID는 기존 목 영웅으로 폴백해 기존 테스트 동작을 보존한다.
vi.mock('../../src/data/index.js', async () => {
  const legacy = (await import('../../src/data/characters.json')).default;
  const ascended = (await import('../../src/data/ascended-heroes.json')).default;
  const base = (await import('../../src/data/base-heroes.json')).default;

  const findReal = (id) =>
    legacy.characters.find(c => c.id === id) ||
    ascended.ascendedHeroes.find(h => h.id === id) ||
    base.baseHeroes.find(h => h.id === id) ||
    null;

  return {
    getCharacter: vi.fn(() => MOCK_HERO_001),
    getCharacterOrHero: vi.fn((id) => findReal(id) || MOCK_HERO_001)
  };
});

vi.mock('../../src/utils/rarityUtils.js', () => ({
  getRarityKey: vi.fn((rarity) => {
    if (typeof rarity === 'string') return rarity;
    const map = { 1: 'N', 2: 'R', 3: 'SR', 4: 'SSR' };
    return map[rarity] || 'N';
  })
}));

import { ProgressionSystem } from '../../src/systems/ProgressionSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus, GameEvents } from '../../src/systems/EventBus.js';
import legacyData from '../../src/data/characters.json';
import ascendedData from '../../src/data/ascended-heroes.json';
import baseHeroData from '../../src/data/base-heroes.json';

describe('ProgressionSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getExpForLevel', () => {
    it('calculates exp requirement for level 1', () => {
      const exp = ProgressionSystem.getExpForLevel(1);
      expect(exp).toBe(100); // 1^2 * 100
    });

    it('calculates exp requirement for level 5', () => {
      const exp = ProgressionSystem.getExpForLevel(5);
      expect(exp).toBe(2500); // 5^2 * 100
    });

    it('scales quadratically', () => {
      const exp1 = ProgressionSystem.getExpForLevel(1);
      const exp2 = ProgressionSystem.getExpForLevel(2);
      const exp3 = ProgressionSystem.getExpForLevel(3);

      expect(exp2).toBe(400);
      expect(exp3).toBe(900);
      expect(exp3).toBeGreaterThan(exp2);
    });
  });

  describe('getTotalExpForLevel', () => {
    it('calculates cumulative exp to reach target level', () => {
      const totalExp = ProgressionSystem.getTotalExpForLevel(3);
      // Level 1->2: 100, Level 2->3: 400
      expect(totalExp).toBe(500);
    });
  });

  describe('addExp', () => {
    it('adds exp and levels up character', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        level: 1,
        exp: 0,
        rarity: 'SR',
        skillLevels: [1, 1]
      });

      const result = ProgressionSystem.addExp('hero_001', 500);

      expect(result.success).toBe(true);
      expect(result.levelsGained).toBeGreaterThan(0);
      expect(SaveManager.updateCharacter).toHaveBeenCalled();
    });

    it('returns overflow exp at max level', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        level: 50,
        exp: 0,
        rarity: 'SR'
      });

      const result = ProgressionSystem.addExp('hero_001', 1000);

      expect(result.overflow).toBe(1000);
      expect(result.levelsGained).toBe(0);
    });

    it('emits LEVEL_UP event when leveling', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        level: 1,
        exp: 0,
        rarity: 'SR',
        skillLevels: [1, 1]
      });

      ProgressionSystem.addExp('hero_001', 500);

      expect(EventBus.emit).toHaveBeenCalledWith(
        GameEvents.LEVEL_UP,
        expect.objectContaining({
          characterId: 'hero_001'
        })
      );
    });

    it('returns error for non-existent character', () => {
      SaveManager.getCharacter.mockReturnValue(null);

      const result = ProgressionSystem.addExp('invalid_id', 100);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('getStatsAtLevel', () => {
    it('returns base stats at level 1', () => {
      const stats = ProgressionSystem.getStatsAtLevel('hero_001', 1);

      expect(stats).toHaveProperty('hp');
      expect(stats).toHaveProperty('atk');
      expect(stats).toHaveProperty('def');
      expect(stats).toHaveProperty('spd');
    });

    it('increases stats with level', () => {
      const stats1 = ProgressionSystem.getStatsAtLevel('hero_001', 1);
      const stats10 = ProgressionSystem.getStatsAtLevel('hero_001', 10);

      expect(stats10.hp).toBeGreaterThan(stats1.hp);
      expect(stats10.atk).toBeGreaterThan(stats1.atk);
    });
  });

  describe('skill enhancement', () => {
    it('calculates skill enhance cost correctly', () => {
      const cost1 = ProgressionSystem.getSkillEnhanceCost(1);
      const cost5 = ProgressionSystem.getSkillEnhanceCost(5);

      expect(cost1.gold).toBe(1000);
      expect(cost5.gold).toBe(25000);
      expect(cost5.skillBooks).toBeGreaterThan(cost1.skillBooks);
    });

    it('checks if skill can be enhanced', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        skillLevels: [1, 1]
      });

      const check = ProgressionSystem.canEnhanceSkill('hero_001', 0);

      expect(check).toHaveProperty('canEnhance');
      // When canEnhance is true, there's a 'cost' property instead of 'reason'
      if (check.canEnhance) {
        expect(check).toHaveProperty('cost');
      } else {
        expect(check).toHaveProperty('reason');
      }
    });

    it('prevents enhancement at max skill level', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        skillLevels: [10, 1]
      });

      const result = ProgressionSystem.enhanceSkill('hero_001', 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('최대 레벨');
    });
  });

  describe('evolution (각성)', () => {
    it('calculates evolution cost correctly', () => {
      const cost1 = ProgressionSystem.getEvolutionCost(1);
      const cost3 = ProgressionSystem.getEvolutionCost(3);

      expect(cost1.gold).toBe(5000);
      expect(cost1.shards).toBe(10);
      expect(cost3.shards).toBe(40);
    });

    it('checks if character can evolve', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        stars: 1
      });
      SaveManager.getResources.mockReturnValue({
        gold: 10000,
        characterShards: { hero_001: 20 }
      });

      const check = ProgressionSystem.canEvolve('hero_001');

      expect(check).toHaveProperty('canEvolve');
      // When canEvolve is true, there's no 'reason', only when false
      if (!check.canEvolve) {
        expect(check).toHaveProperty('reason');
      }
    });

    it('prevents evolution at max stars', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        stars: 6
      });

      const result = ProgressionSystem.evolve('hero_001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('최대 성급');
    });

    it('calculates star bonus correctly', () => {
      const bonus1 = ProgressionSystem.getStarBonus(1);
      const bonus3 = ProgressionSystem.getStarBonus(3);

      expect(bonus1.hp).toBe(0); // (1-1) * 5
      expect(bonus3.hp).toBe(10); // (3-1) * 5
    });
  });

  describe('calculatePower', () => {
    it('calculates combat power from stats', () => {
      const character = {
        characterId: 'hero_001',
        level: 5,
        stars: 1,
        skillLevels: [1, 1]
      };

      const power = ProgressionSystem.calculatePower(character);

      expect(power).toBeGreaterThan(0);
      expect(typeof power).toBe('number');
    });

    it('returns 0 for null character', () => {
      const power = ProgressionSystem.calculatePower(null);
      expect(power).toBe(0);
    });

    it('increases power with skill levels', () => {
      const char1 = {
        characterId: 'hero_001',
        level: 5,
        stars: 1,
        skillLevels: [1, 1]
      };
      const char2 = {
        characterId: 'hero_001',
        level: 5,
        stars: 1,
        skillLevels: [5, 5]
      };

      const power1 = ProgressionSystem.calculatePower(char1);
      const power2 = ProgressionSystem.calculatePower(char2);

      expect(power2).toBeGreaterThan(power1);
    });
  });

  describe('calculateTeamPower', () => {
    it('sums power of all characters', () => {
      const characters = [
        { characterId: 'hero_001', level: 5, stars: 1, skillLevels: [1, 1] },
        { characterId: 'hero_002', level: 3, stars: 1, skillLevels: [1, 1] }
      ];

      const teamPower = ProgressionSystem.calculateTeamPower(characters);

      expect(teamPower).toBeGreaterThan(0);
    });
  });

  describe('getCharacterDetails', () => {
    it('returns full character details', () => {
      SaveManager.getCharacter.mockReturnValue({
        id: 'hero_001',
        level: 5,
        exp: 100,
        rarity: 'SR',
        stars: 2,
        skillLevels: [2, 1]
      });

      const details = ProgressionSystem.getCharacterDetails('hero_001');

      expect(details).toHaveProperty('stats');
      expect(details).toHaveProperty('power');
      expect(details).toHaveProperty('expProgress');
      expect(details).toHaveProperty('skills');
      expect(details).toHaveProperty('evolution');
    });
  });
});

// ==================== BLK-03: 전투력 공식 통합 + 장비 편입 ====================

describe('BLK-03 전투력 통합', () => {
  const ZERO_COLLECTION = { hp: 0, atk: 0, def: 0, spd: 0 };
  const SKILLS = [1, 1];

  /** 컬렉션 보너스를 0으로 고정해 장비/성급 항만 검증한다 */
  const withoutCollection = () =>
    vi.spyOn(ProgressionSystem, 'getCollectionBonus').mockReturnValue({ ...ZERO_COLLECTION });

  /** 캐릭터 원천 데이터를 그대로 넘겨 전투력을 구한다 */
  const powerOf = (data, level, stars = 1, extra = {}) =>
    ProgressionSystem.calculatePower({
      ...data, characterId: data.id, level, stars, skillLevels: SKILLS, ...extra
    });

  const findAscended = (id) => ascendedData.ascendedHeroes.find(h => h.id === id);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('전직영웅 ID가 등급 폴백 테이블이 아니라 자신의 JSON 스탯으로 계산된다', () => {
    withoutCollection();
    const iris = findAscended('asc_iris_olympus');

    // 세이브 레코드처럼 ID만 있는 형태 — 예전에는 getCharacter() 조회 실패로 N 폴백이 됐다
    const byId = ProgressionSystem.calculatePower({
      characterId: 'asc_iris_olympus', level: 1, stars: 1, skillLevels: SKILLS
    });

    const expected = Math.floor(
      iris.stats.hp / 10 + iris.stats.atk + iris.stats.def + iris.stats.spd + 20
    );
    const nFallbackPower = Math.floor(800 / 10 + 80 + 40 + 95 + 20);

    expect(byId).toBe(expected);
    expect(byId).not.toBe(nFallbackPower);
  });

  it('모든 계보에서 만렙 전직영웅이 만렙 기본영웅보다 강하다', () => {
    withoutCollection();

    for (const bh of baseHeroData.baseHeroes) {
      const basePower = powerOf(bh, bh.maxLevel);
      const routes = ascendedData.ascendedHeroes.filter(a => a.baseHeroId === bh.id);
      expect(routes.length).toBeGreaterThan(0);

      const bestRoute = Math.max(...routes.map(r => powerOf(r, r.maxLevel)));
      expect(bestRoute).toBeGreaterThan(basePower);
    }
  });

  it('레거시 char_1~4는 최대 성장 전직영웅보다 높지 않다 (장비 유무 무관)', () => {
    withoutCollection();
    const EQUIP = { HP: 3150, ATK: 750, DEF: 450, SPD: 120 };
    const maxed = (data, level) =>
      ProgressionSystem.calculatePower({
        ...data, characterId: data.id, level, stars: 6, skillLevels: [10, 10, 10]
      });
    const maxedWithEquip = (data, level) =>
      ProgressionSystem.calculatePower({
        ...data, characterId: data.id, level, stars: 6, skillLevels: [10, 10, 10],
        equipmentStats: EQUIP
      });

    const bestAscended = Math.max(
      ...ascendedData.ascendedHeroes.map(h => maxed(h, h.maxLevel))
    );
    const bestAscendedEquipped = Math.max(
      ...ascendedData.ascendedHeroes.map(h => maxedWithEquip(h, h.maxLevel))
    );

    for (const c of legacyData.characters) {
      expect(maxed(c, 60)).toBeLessThan(bestAscended);
      expect(maxedWithEquip(c, 60)).toBeLessThan(bestAscendedEquipped);
    }
  });

  it('장착 장비의 스탯이 EquipmentSystem을 거쳐 전투력에 합산된다', () => {
    withoutCollection();
    const hero = { id: 'hero_equip', equipment: { weapon: 'eq_w', armor: 'eq_a' } };
    const inventory = () => ({
      equipment: [
        { id: 'eq_w', slotType: 'weapon', rarity: 'N', stats: { ATK: 100 }, enhancedStats: {} },
        { id: 'eq_a', slotType: 'armor', rarity: 'N', stats: { HP: 500, DEF: 40 }, enhancedStats: {} }
      ]
    });

    SaveManager.load.mockReturnValue({ characters: [hero], inventory: inventory() });

    const character = {
      characterId: 'hero_equip', level: 1, stars: 1, skillLevels: SKILLS,
      stats: { hp: 1000, atk: 100, def: 100, spd: 100 },
      growthStats: { hp: 0, atk: 0, def: 0, spd: 0 }
    };

    expect(ProgressionSystem.getFinalStats(character))
      .toEqual({ hp: 1500, atk: 200, def: 140, spd: 100 });

    const equipped = ProgressionSystem.calculatePower(character);

    // 장비 없는 동일 캐릭터 대비 증가분 = HP/10 + ATK + DEF + SPD = 50 + 100 + 40 + 0
    SaveManager.load.mockReturnValue({ characters: [], inventory: { equipment: [] } });
    const bare = ProgressionSystem.calculatePower(character);

    expect(equipped - bare).toBe(190);
  });

  it('강화 보너스와 장비 등급 배율이 장비 합산에 반영된다', () => {
    withoutCollection();
    const hero = { id: 'hero_enh', equipment: { weapon: 'eq_w' } };
    // base ATK 100 + 강화 20 = 120, SSR 배율 2.0 → 240
    SaveManager.load.mockReturnValue({
      characters: [hero],
      inventory: {
        equipment: [{
          id: 'eq_w', slotType: 'weapon', rarity: 'SSR',
          stats: { ATK: 100 }, enhancedStats: { ATK: 20 }, enhanceLevel: 4
        }]
      }
    });

    const bonus = ProgressionSystem.getEquipmentBonus({ characterId: 'hero_enh' });
    expect(bonus).toEqual({ hp: 0, atk: 240, def: 0, spd: 0 });
  });

  it('스탯 적용 순서는 기본 → 성급 → 장비(가산) → 컬렉션(곱) 이다', () => {
    vi.spyOn(ProgressionSystem, 'getCollectionBonus')
      .mockReturnValue({ hp: 0.1, atk: 0.1, def: 0.1, spd: 0.1 });

    const stats = ProgressionSystem.getFinalStats({
      characterId: 'order_test', level: 1, stars: 3, skillLevels: SKILLS,
      stats: { hp: 1000, atk: 100, def: 100, spd: 100 },
      growthStats: { hp: 0, atk: 0, def: 0, spd: 0 },
      equipmentStats: { HP: 100, ATK: 10, DEF: 10, SPD: 10 }
    });

    // hp: (1000 x 1.10 + 100) x 1.1 = 1320  (장비를 성급 앞에 두면 1331 이 된다)
    expect(stats).toEqual({ hp: 1320, atk: 132, def: 132, spd: 126 });
  });

  it('skillLevels 가 없어도 예외 없이 기본값 [1, 1] 로 계산된다', () => {
    withoutCollection();
    const character = {
      characterId: 'legacy_save', level: 1, stars: 1,
      stats: { hp: 1000, atk: 100, def: 100, spd: 100 }
    };

    expect(() => ProgressionSystem.calculatePower(character)).not.toThrow();
    expect(ProgressionSystem.calculatePower(character))
      .toBe(ProgressionSystem.calculatePower({ ...character, skillLevels: [1, 1] }));
  });

  it('skillLevels 가 빈 배열이거나 배열이 아니어도 기본값으로 대체된다', () => {
    withoutCollection();
    const record = {
      characterId: 'legacy_save', level: 1, stars: 1,
      stats: { hp: 1000, atk: 100, def: 100, spd: 100 }
    };
    const expected = ProgressionSystem.calculatePower({ ...record, skillLevels: [1, 1] });

    expect(ProgressionSystem.calculatePower({ ...record, skillLevels: [] })).toBe(expected);
    expect(ProgressionSystem.calculatePower({ ...record, skillLevels: null })).toBe(expected);
    expect(ProgressionSystem.calculatePower({ ...record, skillLevels: 'broken' })).toBe(expected);
  });

  it('stars 가 없으면 등급에서 유도하며 NaN 이 되지 않는다', () => {
    withoutCollection();
    const character = {
      characterId: 'no_stars', level: 1, rarity: 'SSR', skillLevels: SKILLS,
      stats: { hp: 1000, atk: 100, def: 100, spd: 100 }
    };

    const power = ProgressionSystem.calculatePower(character);
    expect(Number.isFinite(power)).toBe(true);
    expect(power).toBe(ProgressionSystem.calculatePower({ ...character, stars: 4 }));
  });
});

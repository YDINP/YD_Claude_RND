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

vi.mock('../../src/data/index.js', () => ({
  getCharacter: vi.fn(() => ({
    id: 'hero_001',
    name: 'Test Hero',
    rarity: 'SR',
    baseStats: { hp: 1200, atk: 120, def: 60, spd: 105 },
    growth: { hp: 120, atk: 12, def: 6, spd: 2 }
  }))
}));

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

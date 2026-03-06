/**
 * EvolutionSystem.test.js
 * Unit tests for EvolutionSystem - 영웅 진화 시스템
 * 18 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      characters: [
        {
          id: 'hero_001',
          characterId: 'hero_001',
          rarity: 'SR',
          stats: { hp: 1200, atk: 120, def: 60, spd: 105 },
          skillLevels: [1, 1],
          evolutionCount: 0
        }
      ],
      resources: {
        gold: 50000,
        characterShards: {
          hero_001: 100
        }
      }
    })),
    save: vi.fn(),
    getCharacter: vi.fn(() => ({
      id: 'hero_001',
      characterId: 'hero_001',
      rarity: 'SR',
      stats: { hp: 1200, atk: 120, def: 60, spd: 105 },
      skillLevels: [1, 1],
      evolutionCount: 0
    })),
    getResources: vi.fn(() => ({
      gold: 50000,
      characterShards: {
        hero_001: 100
      }
    }))
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    HERO_EVOLVED: 'heroEvolved'
  }
}));

import { EvolutionSystem } from '../../src/systems/EvolutionSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus } from '../../src/systems/EventBus.js';

describe('EvolutionSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEvolutionCost', () => {
    it('returns cost for N rarity', () => {
      const cost = EvolutionSystem.getEvolutionCost('N');

      expect(cost.shards).toBe(10);
      expect(cost.gold).toBe(1000);
    });

    it('returns cost for R rarity', () => {
      const cost = EvolutionSystem.getEvolutionCost('R');

      expect(cost.shards).toBe(20);
      expect(cost.gold).toBe(5000);
    });

    it('returns cost for SR rarity', () => {
      const cost = EvolutionSystem.getEvolutionCost('SR');

      expect(cost.shards).toBe(50);
      expect(cost.gold).toBe(20000);
    });

    it('returns null for SSR (max rarity)', () => {
      const cost = EvolutionSystem.getEvolutionCost('SSR');

      expect(cost).toBeNull();
    });
  });

  describe('canEvolve', () => {
    it('allows evolution when requirements met', () => {
      SaveManager.load.mockReturnValue({
        characters: [{
          id: 'hero_001',
          characterId: 'hero_001',
          rarity: 'N'
        }],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      });

      const check = EvolutionSystem.canEvolve('hero_001');

      expect(check.canEvolve).toBe(true);
      expect(check.nextRarity).toBe('R');
    });

    it('fails for character not found', () => {
      SaveManager.load.mockReturnValue({
        characters: [],
        resources: {}
      });

      const check = EvolutionSystem.canEvolve('invalid_id');

      expect(check.canEvolve).toBe(false);
      expect(check.reason).toContain('찾을 수 없습니다');
    });

    it('fails at max rarity', () => {
      SaveManager.load.mockReturnValue({
        characters: [{
          id: 'hero_001',
          characterId: 'hero_001',
          rarity: 'SSR'
        }],
        resources: {}
      });

      const check = EvolutionSystem.canEvolve('hero_001');

      expect(check.canEvolve).toBe(false);
      expect(check.reason).toContain('최고 등급');
    });

    it('fails for insufficient gold', () => {
      SaveManager.load.mockReturnValue({
        characters: [{
          id: 'hero_001',
          characterId: 'hero_001',
          rarity: 'N'
        }],
        resources: {
          gold: 100,
          characterShards: { hero_001: 20 }
        }
      });

      const check = EvolutionSystem.canEvolve('hero_001');

      expect(check.canEvolve).toBe(false);
      expect(check.reason).toContain('골드가 부족');
    });

    it('fails for insufficient shards', () => {
      SaveManager.load.mockReturnValue({
        characters: [{
          id: 'hero_001',
          characterId: 'hero_001',
          rarity: 'N'
        }],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 5 }
        }
      });

      const check = EvolutionSystem.canEvolve('hero_001');

      expect(check.canEvolve).toBe(false);
      expect(check.reason).toContain('조각이 부족');
    });
  });

  describe('evolve', () => {
    it('upgrades rarity successfully', () => {
      const character = {
        id: 'hero_001',
        characterId: 'hero_001',
        rarity: 'N',
        stats: { hp: 800, atk: 80, def: 40, spd: 95 },
        skillLevels: [1, 1]
      };
      SaveManager.load.mockReturnValue({
        characters: [character],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      });

      const result = EvolutionSystem.evolve('hero_001');

      expect(result.success).toBe(true);
      expect(result.previousRarity).toBe('N');
      expect(result.newRarity).toBe('R');
    });

    it('applies stat bonuses', () => {
      const character = {
        id: 'hero_001',
        characterId: 'hero_001',
        rarity: 'N',
        stats: { hp: 800, atk: 80, def: 40, spd: 95 },
        skillLevels: [1, 1]
      };
      SaveManager.load.mockReturnValue({
        characters: [character],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      });

      const result = EvolutionSystem.evolve('hero_001');

      expect(result.statBonus).toBeTruthy();
      expect(result.statBonus.hp).toBe(10);
    });

    it('boosts skill levels', () => {
      const character = {
        id: 'hero_001',
        characterId: 'hero_001',
        rarity: 'N',
        stats: { hp: 800, atk: 80, def: 40, spd: 95 },
        skillLevels: [1, 1]
      };
      SaveManager.load.mockReturnValue({
        characters: [character],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      });

      const result = EvolutionSystem.evolve('hero_001');

      expect(result.skillBoost).toBe(1);
    });

    it('consumes resources', () => {
      const character = {
        id: 'hero_001',
        characterId: 'hero_001',
        rarity: 'N',
        stats: { hp: 800, atk: 80, def: 40, spd: 95 },
        skillLevels: [1, 1]
      };
      const saveData = {
        characters: [character],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      };
      SaveManager.load.mockReturnValue(saveData);

      EvolutionSystem.evolve('hero_001');

      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('emits evolution event', () => {
      const character = {
        id: 'hero_001',
        characterId: 'hero_001',
        rarity: 'N',
        stats: { hp: 800, atk: 80, def: 40, spd: 95 },
        skillLevels: [1, 1]
      };
      SaveManager.load.mockReturnValue({
        characters: [character],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      });

      EvolutionSystem.evolve('hero_001');

      expect(EventBus.emit).toHaveBeenCalled();
    });

    it('increments evolution count', () => {
      const character = {
        id: 'hero_001',
        characterId: 'hero_001',
        rarity: 'N',
        stats: { hp: 800, atk: 80, def: 40, spd: 95 },
        skillLevels: [1, 1],
        evolutionCount: 0
      };

      SaveManager.getCharacter.mockReturnValue(character);
      SaveManager.load.mockReturnValue({
        characters: [character],
        resources: {
          gold: 5000,
          characterShards: { hero_001: 20 }
        }
      });

      EvolutionSystem.evolve('hero_001');

      expect(character.evolutionCount).toBe(1);
    });
  });

  describe('previewEvolution', () => {
    it('returns preview of evolution stats', () => {
      SaveManager.load.mockReturnValue({
        characters: [{
          id: 'hero_001',
          characterId: 'hero_001',
          rarity: 'N',
          stats: { hp: 800, atk: 80, def: 40, spd: 95 },
          skillLevels: [1, 1]
        }]
      });

      const preview = EvolutionSystem.previewEvolution('hero_001');

      expect(preview).toBeTruthy();
      expect(preview.currentRarity).toBe('N');
      expect(preview.nextRarity).toBe('R');
      expect(preview.previewStats.hp).toBeGreaterThan(preview.currentStats.hp);
      expect(preview).toHaveProperty('statGain');
      expect(preview).toHaveProperty('skillBoost');
    });

    it('returns null for max rarity', () => {
      SaveManager.load.mockReturnValue({
        characters: [{
          id: 'hero_001',
          rarity: 'SSR',
          stats: { hp: 1500, atk: 150, def: 75, spd: 110 },
          skillLevels: [5, 5]
        }]
      });

      const preview = EvolutionSystem.previewEvolution('hero_001');

      expect(preview).toBeNull();
    });
  });

  describe('addShards', () => {
    it('adds shards successfully', () => {
      SaveManager.load.mockReturnValue({
        resources: {
          characterShards: { hero_001: 10 }
        }
      });

      const result = EvolutionSystem.addShards('hero_001', 5);

      expect(result.success).toBe(true);
      expect(result.addedShards).toBe(5);
      expect(result.totalShards).toBe(15);
    });

    it('fails for invalid amount', () => {
      const result = EvolutionSystem.addShards('hero_001', 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('유효하지 않은');
    });
  });

  describe('getShards', () => {
    it('returns shard count for hero', () => {
      SaveManager.load.mockReturnValue({
        resources: {
          characterShards: { hero_001: 50 }
        }
      });

      const shards = EvolutionSystem.getShards('hero_001');

      expect(shards).toBe(50);
    });

    it('returns 0 for hero with no shards', () => {
      SaveManager.load.mockReturnValue({
        resources: {
          characterShards: {}
        }
      });

      const shards = EvolutionSystem.getShards('hero_002');

      expect(shards).toBe(0);
    });
  });

  describe('getAllEvolutionPaths', () => {
    it('returns all evolution paths', () => {
      const paths = EvolutionSystem.getAllEvolutionPaths();

      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBe(3);
      expect(paths[0]).toHaveProperty('from');
      expect(paths[0]).toHaveProperty('to');
      expect(paths[0]).toHaveProperty('cost');
      expect(paths[0]).toHaveProperty('statBonus');
      expect(paths[0]).toHaveProperty('skillBoost');
    });
  });

  describe('isMaxRarity', () => {
    it('returns true for SSR', () => {
      const isMax = EvolutionSystem.isMaxRarity('SSR');
      expect(isMax).toBe(true);
    });

    it('returns false for lower rarities', () => {
      expect(EvolutionSystem.isMaxRarity('N')).toBe(false);
      expect(EvolutionSystem.isMaxRarity('R')).toBe(false);
      expect(EvolutionSystem.isMaxRarity('SR')).toBe(false);
    });
  });
});

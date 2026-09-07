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

  // ==================== T-C8: 첫 각인 보증 ====================

  describe('첫 각인 보증 (T-C8)', () => {
    // SYSTEM_ONBOARDING_ECONOMY §1-6 — 기관 선택 확정 시점에 레이어 2 재화
    // 부족분을 계정당 1회 한정으로 보전한다.
    const IRIS_OLYMPUS_COST = { cultEssence: { olympus: 30 }, institutionSeal: 1, awakeningFlame: 3 };

    let mockSave;

    beforeEach(() => {
      mockSave = {
        resources: {
          gold: 10000,
          gems: 1500,
          spiritStones: 6,
          characterShards: {},
          cultEssence: {},
          institutionSeal: 0,
          awakeningFlame: 0
        },
        onboarding: {
          grantVersion: 2,
          firstAscensionGrantUsed: false,
          firstAscensionCultId: null
        }
      };

      SaveManager.load.mockImplementation(() => mockSave);
      SaveManager.save.mockImplementation(data => { mockSave = data; return true; });
      SaveManager.getBaseHeroData = vi.fn(id => (id === 'base_iris' ? {
        id: 'base_iris',
        ascensionRoutes: [{ cultId: 'olympus', ascendedHeroId: 'asc_iris_olympus', resultRarity: 'SSR' }]
      } : null));
      SaveManager.getAscendedHeroData = vi.fn(id => (id === 'asc_iris_olympus' ? {
        id: 'asc_iris_olympus',
        acquisitionCost: IRIS_OLYMPUS_COST
      } : null));
      SaveManager._createDefaultOnboarding = vi.fn(() => ({
        grantVersion: 2,
        firstAscensionGrantUsed: false,
        firstAscensionCultId: null
      }));
    });

    it('보유 0에서 각인 루트가 요구하는 레이어 2 재화를 필요량까지 보전한다', () => {
      const result = EvolutionSystem.applyFirstAscensionGuarantee('base_iris', 'olympus');

      expect(result.applied).toBe(true);
      expect(mockSave.resources.institutionSeal).toBe(1);
      expect(mockSave.resources.cultEssence.olympus).toBe(30);
      expect(mockSave.resources.awakeningFlame).toBe(3);
      expect(mockSave.onboarding.firstAscensionGrantUsed).toBe(true);
      expect(mockSave.onboarding.firstAscensionCultId).toBe('olympus');
    });

    it('이미 보유한 만큼은 지급하지 않고 부족분만 보전한다', () => {
      mockSave.resources.institutionSeal = 1;
      mockSave.resources.cultEssence.olympus = 12;
      mockSave.resources.awakeningFlame = 3;

      const result = EvolutionSystem.applyFirstAscensionGuarantee('base_iris', 'olympus');

      expect(result.granted).toEqual({
        institutionSeal: 0,
        awakeningFlame: 0,
        cultEssence: { olympus: 18 }
      });
      expect(mockSave.resources.cultEssence.olympus).toBe(30);
      expect(mockSave.resources.institutionSeal).toBe(1);
      expect(mockSave.resources.awakeningFlame).toBe(3);
    });

    it('두 번째 각인부터는 보증이 적용되지 않는다 (계정당 1회)', () => {
      EvolutionSystem.applyFirstAscensionGuarantee('base_iris', 'olympus');
      const afterFirst = JSON.parse(JSON.stringify(mockSave.resources));

      expect(EvolutionSystem.isFirstAscensionGuaranteeAvailable()).toBe(false);

      const second = EvolutionSystem.applyFirstAscensionGuarantee('base_iris', 'olympus');

      expect(second.applied).toBe(false);
      expect(second.reason).toBe('already_used');
      expect(mockSave.resources).toEqual(afterFirst);
    });

    it('존재하지 않는 각인 루트는 보증을 소모하지 않는다', () => {
      const result = EvolutionSystem.applyFirstAscensionGuarantee('base_iris', 'unknown_cult');

      expect(result.applied).toBe(false);
      expect(result.reason).toBe('invalid_route');
      expect(mockSave.onboarding.firstAscensionGrantUsed).toBe(false);
      expect(EvolutionSystem.isFirstAscensionGuaranteeAvailable()).toBe(true);
    });
  });

  // ================================================================
  // 등급 표기 정규화 · 세이브 null 방어 (라이브 P0)
  //
  // base-heroes.json 의 기본 영웅에는 rarity 필드가 없고, characters.json 은
  // 숫자 등급을 쓴다. 정규화하지 않으면 진화 비용이 null 로 떨어져
  // 호출부의 `cost.gold` 에서 TypeError 로 죽었다.
  // ================================================================
  describe('등급 표기 정규화', () => {
    it('rarity 가 없는 기본 영웅도 N 진화 비용을 받는다', () => {
      const cost = EvolutionSystem.getEvolutionCost(undefined);

      expect(cost).not.toBeNull();
      expect(cost.gold).toBe(1000);
      expect(cost.shards).toBe(10);
    });

    it('숫자 등급(characters.json 레거시)도 문자열 등급과 같게 다룬다', () => {
      expect(EvolutionSystem.getEvolutionCost(4)).toEqual(EvolutionSystem.getEvolutionCost('SR'));
      expect(EvolutionSystem.getEvolutionCost(3)).toEqual(EvolutionSystem.getEvolutionCost('R'));
    });

    it('rarity 가 없어도 최고 등급으로 오판하지 않는다', () => {
      expect(EvolutionSystem.isMaxRarity(undefined)).toBe(false);
      expect(EvolutionSystem.isMaxRarity(null)).toBe(false);
      expect(EvolutionSystem.isMaxRarity('SSR')).toBe(true);
      expect(EvolutionSystem.isMaxRarity(5)).toBe(true);
    });

    it('rarity 없는 캐릭터의 진화 판정이 예외 없이 통과한다', () => {
      SaveManager.load.mockReturnValue({
        characters: [{ id: 'base_iris', level: 5 }],
        resources: { gold: 50000, characterShards: { base_iris: 100 } }
      });

      const result = EvolutionSystem.canEvolve('base_iris');

      expect(result.canEvolve).toBe(true);
      expect(result.cost.gold).toBe(1000);
      expect(result.nextRarity).toBe('R');
    });
  });

  describe('세이브 null 방어', () => {
    it('세이브가 null 이어도 canEvolve 가 예외 없이 실패를 돌려준다', () => {
      SaveManager.load.mockReturnValue(null);

      const result = EvolutionSystem.canEvolve('hero_001');

      expect(result.canEvolve).toBe(false);
      expect(result.reason).toBe('캐릭터를 찾을 수 없습니다');
    });

    it('세이브가 null 이어도 previewEvolution 은 null 만 돌려준다', () => {
      SaveManager.load.mockReturnValue(null);

      expect(EvolutionSystem.previewEvolution('hero_001')).toBeNull();
    });

    it('세이브가 null 이어도 조각 조회는 0 이다', () => {
      SaveManager.load.mockReturnValue(null);

      expect(EvolutionSystem.getShards('hero_001')).toBe(0);
    });

    it('resources 가 없는 세이브에서도 진화가 골드를 음수로 차감하며 진행된다', () => {
      const save = { characters: [{ id: 'h', rarity: 'N', stats: { hp: 100, atk: 10, def: 10, spd: 10 } }] };
      SaveManager.load.mockReturnValue(save);

      // 재화가 없으니 진행 자체가 막혀야 한다 (예외가 아니라 안내)
      const result = EvolutionSystem.evolve('h');

      expect(result.success).toBe(false);
      expect(result.error).toContain('골드');
    });
  });

  describe('previewEvolution 스탯 폴백', () => {
    it('세이브에 스탯이 없으면 호출부가 준 baseStats 로 미리보기를 만든다', () => {
      SaveManager.load.mockReturnValue({
        characters: [{ id: 'base_iris', level: 5 }],
        resources: { gold: 50000, characterShards: { base_iris: 100 } }
      });

      const preview = EvolutionSystem.previewEvolution('base_iris',
        { hp: 1000, atk: 100, def: 80, spd: 100 });

      expect(preview).not.toBeNull();
      expect(preview.currentRarity).toBe('N');
      expect(preview.nextRarity).toBe('R');
      expect(preview.previewStats.hp).toBe(1100);
      expect(preview.statGain.atk).toBe(10);
    });

    it('baseStats 도 없으면 0 으로 채우되 죽지 않는다', () => {
      SaveManager.load.mockReturnValue({
        characters: [{ id: 'base_iris' }],
        resources: {}
      });

      const preview = EvolutionSystem.previewEvolution('base_iris');

      expect(preview.previewStats).toEqual({ hp: 0, atk: 0, def: 0, spd: 0 });
    });
  });

});

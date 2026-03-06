/**
 * GachaSystem.test.js
 * Unit tests for GachaSystem - 캐릭터 소환 시스템
 * 15 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SaveManager before importing GachaSystem
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    getGachaInfo: vi.fn(() => ({
      pityCounter: 0,
      totalPulls: 0,
      totalSSR: 0,
      banners: {}
    })),
    getResources: vi.fn(() => ({
      gems: 10000,
      summonTickets: 20
    })),
    spendGems: vi.fn(),
    spendSummonTickets: vi.fn(),
    addCharacter: vi.fn((id) => ({
      success: true,
      duplicate: false,
      shardsGained: 0
    })),
    updateGachaCounter: vi.fn(),
    updateHighestDamage: vi.fn(),
    saveGachaInfo: vi.fn(),
    load: vi.fn(() => ({ ascendedHeroes: [] })),
    save: vi.fn()
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    CHARACTER_ADDED: 'character_added',
    BATTLE_START: 'battle_start',
    BATTLE_END: 'battle_end'
  }
}));

// Mock EnergySystem (PRD-3: 기존 테스트 보호 - 항상 성공 반환)
vi.mock('../../src/systems/EnergySystem.js', () => {
  const mockConsume = vi.fn(() => ({ success: true, currentEnergy: 100, consumed: 10 }));
  const mockEnergySystem = { consume: mockConsume, consumeEnergy: mockConsume };
  return {
    default: mockEnergySystem,
    EnergySystem: vi.fn(() => mockEnergySystem),
    energySystem: mockEnergySystem,
    ENERGY_CONFIG: { MAX_ENERGY: 200, RECOVERY_RATE: 1 },
    STAGE_COSTS: { NORMAL: 6, ELITE: 10, BOSS: 20 }
  };
});

// Mock data/index.js (PRD-1: initializePool 테스트용)
vi.mock('../../src/data/index.js', () => ({
  getAllAscendedHeroes: vi.fn(() => [
    { id: 'asc_ssr_1', rarity: 'SSR' },
    { id: 'asc_ssr_2', rarity: 'SSR' },
    { id: 'asc_sr_1', rarity: 'SR' }
  ]),
  getAllBaseHeroes: vi.fn(() => [
    { id: 'base_r_1', rarity: 'R' },
    { id: 'base_r_2', rarity: 'R' },
    { id: 'base_n_1', rarity: 'N' },
    { id: 'base_n_2', rarity: 'N' }
  ]),
  getAscendedHero: vi.fn((id) => null),
  getBaseHero: vi.fn((id) => null),
  getCharacterOrHero: vi.fn((id) => null)
}));

import { GachaSystem } from '../../src/systems/GachaSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus } from '../../src/systems/EventBus.js';

describe('GachaSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset CHARACTER_POOL for tests (pool is disabled in production)
    GachaSystem.CHARACTER_POOL = {
      SSR: ['char_ssr_1', 'char_ssr_2'],
      SR: ['char_sr_1', 'char_sr_2', 'char_sr_3'],
      R: ['char_r_1', 'char_r_2', 'char_r_3', 'char_r_4'],
      N: ['char_n_1', 'char_n_2', 'char_n_3', 'char_n_4', 'char_n_5']
    };

    // Reset default mocks
    SaveManager.getGachaInfo.mockReturnValue({
      pityCounter: 0,
      totalPulls: 0,
      totalSSR: 0,
      banners: {}
    });
    SaveManager.getResources.mockReturnValue({
      gems: 10000,
      summonTickets: 20
    });
  });

  describe('single pull', () => {
    it('returns 1 character when doing single pull', () => {
      const result = GachaSystem.pull(1, 'gems');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toHaveProperty('characterId');
      expect(result.results[0]).toHaveProperty('rarity');
    });

    it('deducts gems for single pull with gems', () => {
      GachaSystem.pull(1, 'gems');

      expect(SaveManager.spendGems).toHaveBeenCalledWith(GachaSystem.SINGLE_COST);
    });

    it('deducts tickets for single pull with tickets', () => {
      GachaSystem.pull(1, 'tickets');

      expect(SaveManager.spendSummonTickets).toHaveBeenCalledWith(GachaSystem.TICKET_SINGLE);
    });

    it('fails when not enough gems', () => {
      SaveManager.getResources.mockReturnValue({ gems: 100, summonTickets: 0 });

      const result = GachaSystem.pull(1, 'gems');

      expect(result.success).toBe(false);
      expect(result.error).toContain('젬이 부족');
    });

    it('fails when not enough tickets', () => {
      SaveManager.getResources.mockReturnValue({ gems: 0, summonTickets: 0 });

      const result = GachaSystem.pull(1, 'tickets');

      expect(result.success).toBe(false);
      expect(result.error).toContain('티켓이 부족');
    });
  });

  describe('multi pull (10x)', () => {
    it('returns 10 characters when doing 10-pull', () => {
      const result = GachaSystem.pull(10, 'gems');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(10);
    });

    it('applies discount for 10-pull with gems', () => {
      GachaSystem.pull(10, 'gems');

      expect(SaveManager.spendGems).toHaveBeenCalledWith(GachaSystem.MULTI_COST);
      expect(GachaSystem.MULTI_COST).toBeLessThan(GachaSystem.SINGLE_COST * 10);
    });

    it('guarantees at least one SR or higher in 10-pull', () => {
      const result = GachaSystem.pull(10, 'gems');

      const hasRare = result.results.some(r => r.rarity === 'SR' || r.rarity === 'SSR');
      expect(hasRare).toBe(true);
    });
  });

  describe('pity system', () => {
    it('increments pity counter on each pull', () => {
      GachaSystem.pull(1, 'gems');

      expect(SaveManager.updateGachaCounter).toHaveBeenCalledWith(1, expect.any(Boolean));
    });

    it('guarantees SSR at hard pity (90 pulls)', () => {
      SaveManager.getGachaInfo.mockReturnValue({
        pityCounter: 89,
        totalPulls: 89,
        totalSSR: 0,
        banners: {}
      });

      const result = GachaSystem.pull(1, 'gems');

      expect(result.results[0].rarity).toBe('SSR');
    });

    it('increases SSR rate at soft pity (75+ pulls)', () => {
      const normalRate = GachaSystem.calculatePityBonus(0);
      const softPityRate = GachaSystem.calculatePityBonus(76); // Bonus starts after 75

      expect(softPityRate).toBeGreaterThan(normalRate);
    });

    it('resets pity counter when SSR is obtained', () => {
      SaveManager.getGachaInfo.mockReturnValue({
        pityCounter: 89,
        totalPulls: 89,
        totalSSR: 0,
        banners: {}
      });

      GachaSystem.pull(1, 'gems');

      // Should call updateGachaCounter with gotSSR=true
      expect(SaveManager.updateGachaCounter).toHaveBeenCalledWith(1, true);
    });
  });

  describe('rarity distribution', () => {
    it('respects rarity weights in probability', () => {
      // Simulate 100 pulls to check distribution (simple smoke test)
      SaveManager.getGachaInfo.mockReturnValue({
        pityCounter: 0,
        totalPulls: 0,
        totalSSR: 0,
        banners: {}
      });

      const rarities = { SSR: 0, SR: 0, R: 0, N: 0 };

      for (let i = 0; i < 100; i++) {
        const rarity = GachaSystem.determineRarity(i % 90 + 1);
        rarities[rarity]++;
      }

      // N should be most common, SSR should be rarest
      expect(rarities.N).toBeGreaterThan(rarities.SSR);
    });

    it('returns valid character IDs for each rarity', () => {
      ['SSR', 'SR', 'R', 'N'].forEach(rarity => {
        const charId = GachaSystem.getRandomCharacterByRarity(rarity);
        expect(charId).toBeTruthy();
        expect(typeof charId).toBe('string');
      });
    });
  });

  describe('banner system', () => {
    it('retrieves active banners correctly', () => {
      const banners = GachaSystem.getActiveBanners();
      expect(Array.isArray(banners)).toBe(true);
    });

    it('gets banner info by ID', () => {
      const banner = GachaSystem.getBannerById('standard');
      expect(banner).toBeTruthy();
    });
  });


  // PRD-1: GachaSystem.initializePool() 테스트
  describe('initializePool() - PRD-1', () => {
    it('initializes CHARACTER_POOL from ascended-heroes and base-heroes', () => {
      const pool = GachaSystem.initializePool();

      expect(Array.isArray(pool.SSR)).toBe(true);
      expect(Array.isArray(pool.SR)).toBe(true);
      expect(Array.isArray(pool.R)).toBe(true);
      expect(pool.SSR).toContain('asc_ssr_1');
      expect(pool.SSR).toContain('asc_ssr_2');
      expect(pool.SR).toContain('asc_sr_1');
    });

    it('includes base-heroes in pool when ascendedOnly is false', () => {
      const pool = GachaSystem.initializePool({ ascendedOnly: false });

      expect(pool.R).toContain('base_r_1');
      expect(pool.R).toContain('base_r_2');
    });

    it('excludes base-heroes when ascendedOnly is true', () => {
      const pool = GachaSystem.initializePool({ ascendedOnly: true });

      expect(pool.R).not.toContain('base_r_1');
    });

    it('updates GachaSystem.CHARACTER_POOL after initialization', () => {
      GachaSystem.initializePool();
      // CHARACTER_POOL should be updated with the new pool
      const hasPool = Object.values(GachaSystem.CHARACTER_POOL).some(p => p.length > 0);
      expect(hasPool).toBe(true);
    });
  });

  // PRD-3: GachaSystem pull() 에너지 소비 테스트
  describe('pull() energy consumption - PRD-3', () => {
    it('consumes energy when pulling (skipEnergyCheck: false)', async () => {
      const { default: energySystemMock } = await import('../../src/systems/EnergySystem.js');

      GachaSystem.pull(1, 'gems', { skipEnergyCheck: false });

      expect(energySystemMock.consume).toHaveBeenCalledWith(10, 'gacha');
    });

    it('skips energy check when skipEnergyCheck is true', async () => {
      const { default: energySystemMock } = await import('../../src/systems/EnergySystem.js');
      energySystemMock.consume.mockClear();

      GachaSystem.pull(1, 'gems', { skipEnergyCheck: true });

      expect(energySystemMock.consume).not.toHaveBeenCalled();
    });

    it('fails pull when energy is insufficient', async () => {
      const { default: energySystemMock } = await import('../../src/systems/EnergySystem.js');
      energySystemMock.consume.mockReturnValueOnce({
        success: false, error: 'INSUFFICIENT_ENERGY', currentEnergy: 5, consumed: 0
      });

      const result = GachaSystem.pull(1, 'gems', { skipEnergyCheck: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('에너지');
    });
  });

  // TASK-A: 가챠-전직 연동 활성화 테스트
  describe('gacha-ascended integration - TASK-A', () => {
    it('pull() succeeds after initializePool() with ascended-hero data', () => {
      // initializePool로 풀 초기화 후 pull() 성공 확인
      GachaSystem.initializePool();
      // CHARACTER_POOL이 채워졌는지 확인
      const hasPool = Object.values(GachaSystem.CHARACTER_POOL).some(p => p.length > 0);
      expect(hasPool).toBe(true);

      // pull() 가 성공 반환하는지 확인
      const result = GachaSystem.pull(1, 'gems', { skipEnergyCheck: true });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].characterId).toBeTruthy();
    });

    it('ascended-hero IDs appear in pull results after initializePool', () => {
      // SSR 풀에 ascended-hero가 포함되도록 초기화
      GachaSystem.initializePool({ ascendedOnly: true });
      // SSR 풀에 asc_ssr_1, asc_ssr_2 포함 확인
      expect(GachaSystem.CHARACTER_POOL.SSR).toContain('asc_ssr_1');

      // SSR 결과에서 ascended-hero가 반환될 수 있도록 직접 선택 테스트
      const charId = GachaSystem.getRandomCharacterByRarity('SSR');
      expect(['asc_ssr_1', 'asc_ssr_2']).toContain(charId);
    });

    it('pull() re-initializes pool if CHARACTER_POOL is empty at pull time', () => {
      // 풀을 비워서 fallback 초기화 경로 테스트
      GachaSystem.CHARACTER_POOL = { SSR: [], SR: [], R: [], N: [] };

      // pull() 호출 시 initializePool()이 재실행되어야 함
      const result = GachaSystem.pull(1, 'gems', { skipEnergyCheck: true });
      // initializePool이 mock 데이터로 풀을 채우므로 success 기대
      expect(result.success).toBe(true);
    });

    it('initializePool with ascendedOnly includes SSR ascended-heroes', () => {
      const pool = GachaSystem.initializePool({ ascendedOnly: true });
      expect(pool.SSR.length).toBeGreaterThan(0);
      expect(pool.SR.length).toBeGreaterThan(0);
      // R 풀에 base-hero 없음
      expect(pool.R).not.toContain('base_r_1');
    });
  });
});
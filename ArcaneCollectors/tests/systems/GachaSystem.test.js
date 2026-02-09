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
    saveGachaInfo: vi.fn()
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

import { GachaSystem } from '../../src/systems/GachaSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus } from '../../src/systems/EventBus.js';

describe('GachaSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
});

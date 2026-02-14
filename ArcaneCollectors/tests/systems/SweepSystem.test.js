/**
 * SweepSystem.test.js
 * Unit tests for SweepSystem - 소탕 시스템
 * 16 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock energySystem - must be defined in the factory function
vi.mock('../../src/systems/EnergySystem.js', () => ({
  default: {
    getStageCost: vi.fn((type) => {
      const costs = { NORMAL: 5, ELITE: 8, BOSS: 10 };
      return costs[type] || 5;
    }),
    getCurrentEnergy: vi.fn(() => 100),
    consumeEnergy: vi.fn((amount) => ({
      success: true,
      currentEnergy: 100 - amount
    }))
  }
}));

import { SweepSystem, SWEEP_CONFIG } from '../../src/systems/SweepSystem.js';
import energySystem from '../../src/systems/EnergySystem.js';

describe('SweepSystem', () => {
  let sweepSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    energySystem.getCurrentEnergy.mockReturnValue(100);
    energySystem.consumeEnergy.mockReturnValue({
      success: true,
      currentEnergy: 95
    });

    sweepSystem = new SweepSystem();
    sweepSystem.initialize();
  });

  describe('initialize', () => {
    it('sets default values on initialization', () => {
      expect(sweepSystem.dailySweepCount).toBe(0);
      expect(sweepSystem.sweepTickets).toBe(10);
    });

    it('restores from saved data', () => {
      const savedData = {
        dailySweepCount: 5,
        sweepTickets: 20,
        stageProgress: {
          '1-1': { cleared: true, stars: 3 }
        }
      };

      sweepSystem.initialize(savedData);

      expect(sweepSystem.dailySweepCount).toBe(5);
      expect(sweepSystem.sweepTickets).toBe(20);
    });
  });

  describe('recordStageClear', () => {
    it('records stage clear with stars', () => {
      sweepSystem.recordStageClear('1-1', 3);

      const progress = sweepSystem.getStageProgress('1-1');
      expect(progress.cleared).toBe(true);
      expect(progress.stars).toBe(3);
    });

    it('updates stars if higher', () => {
      sweepSystem.recordStageClear('1-1', 1);
      sweepSystem.recordStageClear('1-1', 3);

      const progress = sweepSystem.getStageProgress('1-1');
      expect(progress.stars).toBe(3);
    });

    it('does not downgrade stars', () => {
      sweepSystem.recordStageClear('1-1', 3);
      sweepSystem.recordStageClear('1-1', 1);

      const progress = sweepSystem.getStageProgress('1-1');
      expect(progress.stars).toBe(3);
    });
  });

  describe('canSweep', () => {
    beforeEach(() => {
      sweepSystem.recordStageClear('1-1', 3);
      sweepSystem.sweepTickets = 10;
      energySystem.getCurrentEnergy.mockReturnValue(100);
    });

    it('allows sweep when conditions met', () => {
      const check = sweepSystem.canSweep('1-1', 1);

      expect(check.canSweep).toBe(true);
      expect(check.reasons).toHaveLength(0);
    });

    it('fails if stage not cleared', () => {
      const check = sweepSystem.canSweep('2-1', 1);

      expect(check.canSweep).toBe(false);
      expect(check.reasons.some(r => r.code === 'NOT_CLEARED')).toBe(true);
    });

    it('fails if insufficient stars', () => {
      sweepSystem.recordStageClear('1-2', 2);
      const check = sweepSystem.canSweep('1-2', 1);

      expect(check.canSweep).toBe(false);
      expect(check.reasons.some(r => r.code === 'INSUFFICIENT_STARS')).toBe(true);
    });

    it('fails if insufficient tickets', () => {
      sweepSystem.sweepTickets = 0;
      const check = sweepSystem.canSweep('1-1', 1);

      expect(check.canSweep).toBe(false);
      expect(check.reasons.some(r => r.code === 'INSUFFICIENT_TICKETS')).toBe(true);
    });

    it('fails if insufficient energy', () => {
      energySystem.getCurrentEnergy.mockReturnValue(2);
      const check = sweepSystem.canSweep('1-1', 1);

      expect(check.canSweep).toBe(false);
      expect(check.reasons.some(r => r.code === 'INSUFFICIENT_ENERGY')).toBe(true);
    });

    it('fails if exceeds daily limit', () => {
      sweepSystem.dailySweepCount = SWEEP_CONFIG.DAILY_LIMIT;
      const check = sweepSystem.canSweep('1-1', 1);

      expect(check.canSweep).toBe(false);
      expect(check.reasons.some(r => r.code === 'DAILY_LIMIT_EXCEEDED')).toBe(true);
    });

    it('fails if exceeds max sweep at once', () => {
      const check = sweepSystem.canSweep('1-1', SWEEP_CONFIG.MAX_SWEEP_AT_ONCE + 1);

      expect(check.canSweep).toBe(false);
      expect(check.reasons.some(r => r.code === 'EXCEEDS_MAX_SWEEP')).toBe(true);
    });
  });

  describe('executeSweep', () => {
    beforeEach(() => {
      sweepSystem.recordStageClear('1-1', 3);
      sweepSystem.sweepTickets = 10;
      energySystem.getCurrentEnergy.mockReturnValue(100);
    });

    it('executes sweep successfully', () => {
      const result = sweepSystem.executeSweep('1-1', 1);

      expect(result.success).toBe(true);
      expect(result.rewards).toBeTruthy();
      expect(result.costs).toBeTruthy();
    });

    it('consumes tickets and energy', () => {
      const initialTickets = sweepSystem.sweepTickets;
      sweepSystem.executeSweep('1-1', 1);

      expect(sweepSystem.sweepTickets).toBe(initialTickets - 1);
      expect(energySystem.consumeEnergy).toHaveBeenCalled();
    });

    it('increments daily sweep count', () => {
      const initialCount = sweepSystem.dailySweepCount;
      sweepSystem.executeSweep('1-1', 1);

      expect(sweepSystem.dailySweepCount).toBe(initialCount + 1);
    });

    it('fails if conditions not met', () => {
      sweepSystem.sweepTickets = 0;
      const result = sweepSystem.executeSweep('1-1', 1);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SWEEP_NOT_AVAILABLE');
    });
  });

  describe('calculateRewards', () => {
    it('calculates rewards for stage', () => {
      const rewards = sweepSystem.calculateRewards('1-1', 1);

      expect(rewards).toHaveProperty('gold');
      expect(rewards).toHaveProperty('exp');
      expect(rewards).toHaveProperty('items');
      expect(rewards.sweepCount).toBe(1);
    });

    it('multiplies rewards by sweep count', () => {
      const rewards1 = sweepSystem.calculateRewards('1-1', 1);
      const rewards3 = sweepSystem.calculateRewards('1-1', 3);

      expect(rewards3.gold).toBe(rewards1.gold * 3);
      expect(rewards3.exp).toBe(rewards1.exp * 3);
    });
  });

  describe('getDailyRemaining', () => {
    it('returns daily sweep status', () => {
      sweepSystem.dailySweepCount = 10;
      const status = sweepSystem.getDailyRemaining();

      expect(status.remaining).toBe(SWEEP_CONFIG.DAILY_LIMIT - 10);
      expect(status.used).toBe(10);
      expect(status.limit).toBe(SWEEP_CONFIG.DAILY_LIMIT);
    });
  });

  describe('addSweepTickets', () => {
    it('adds tickets successfully', () => {
      const result = sweepSystem.addSweepTickets(5);

      expect(result.success).toBe(true);
      expect(result.added).toBe(5);
    });

    it('fails for invalid amount', () => {
      const result = sweepSystem.addSweepTickets(0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_AMOUNT');
    });
  });

  describe('purchaseSweepTickets', () => {
    it('purchases tickets with gems', () => {
      const inventory = { gems: 100 };
      const result = sweepSystem.purchaseSweepTickets(5, inventory);

      expect(result.success).toBe(true);
      expect(result.purchased).toBe(5);
      expect(result.gemsSpent).toBe(50);
      expect(inventory.gems).toBe(50);
    });

    it('fails if insufficient gems', () => {
      const inventory = { gems: 10 };
      const result = sweepSystem.purchaseSweepTickets(5, inventory);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_GEMS');
    });
  });

  describe('getSweepableStages', () => {
    it('returns only 3-star cleared stages', () => {
      sweepSystem.recordStageClear('1-1', 3);
      sweepSystem.recordStageClear('1-2', 2);
      sweepSystem.recordStageClear('1-3', 3);

      const sweepable = sweepSystem.getSweepableStages();

      expect(sweepable.length).toBe(2);
      expect(sweepable.every(s => s.stars === 3)).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('returns system status', () => {
      const status = sweepSystem.getStatus();

      expect(status).toHaveProperty('sweepTickets');
      expect(status).toHaveProperty('daily');
      expect(status).toHaveProperty('sweepableStageCount');
      expect(status).toHaveProperty('config');
    });
  });
});

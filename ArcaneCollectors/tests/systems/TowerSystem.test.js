/**
 * TowerSystem.test.js
 * Unit tests for TowerSystem - 무한의 탑 시스템
 * 16 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      tower: {
        currentFloor: 1,
        highestFloor: 0,
        lastResetDate: null,
        totalClears: 0,
        bossClears: {}
      }
    })),
    save: vi.fn(),
    addGold: vi.fn(),
    addGems: vi.fn(),
    addSummonTickets: vi.fn()
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    ACHIEVEMENT_UNLOCKED: 'achievement_unlocked'
  }
}));

vi.mock('../../src/data/tower.json', () => ({
  default: {
    config: {
      maxFloor: 100,
      bossFloors: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      resetType: 'monthly'
    },
    floors: [
      {
        floor: 1,
        enemies: [{ id: 'enemy_slime', count: 2 }],
        bossReward: null
      }
    ],
    rewards: {
      '1-10': { gold: 500, exp: 250, equipmentChance: 0 },
      '11-30': { gold: 800, exp: 400, equipmentChance: 0.05 },
      '31-50': { gold: 1200, exp: 600, equipmentChance: 0.1 },
      '51-70': { gold: 1800, exp: 900, equipmentChance: 0.15 },
      '71-100': { gold: 2500, exp: 1250, equipmentChance: 0.2 }
    }
  }
}));

import { TowerSystem } from '../../src/systems/TowerSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus } from '../../src/systems/EventBus.js';

describe('TowerSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFloorInfo', () => {
    it('returns floor data for valid floor', () => {
      const info = TowerSystem.getFloorInfo(1);

      expect(info).toBeTruthy();
      expect(info.floor).toBe(1);
      expect(info).toHaveProperty('enemies');
      expect(info).toHaveProperty('rewards');
    });

    it('returns null for invalid floor', () => {
      const info = TowerSystem.getFloorInfo(0);
      expect(info).toBeNull();

      const info2 = TowerSystem.getFloorInfo(101);
      expect(info2).toBeNull();
    });

    it('identifies boss floors correctly', () => {
      const floor10 = TowerSystem.getFloorInfo(10);
      const floor5 = TowerSystem.getFloorInfo(5);

      expect(floor10.isBoss).toBe(true);
      expect(floor5.isBoss).toBe(false);
    });
  });

  describe('calculateDifficulty', () => {
    it('increases with floor number', () => {
      const diff1 = TowerSystem.calculateDifficulty(1);
      const diff10 = TowerSystem.calculateDifficulty(10);

      expect(diff10).toBeGreaterThan(diff1);
    });

    it('applies boss floor multiplier', () => {
      const diff9 = TowerSystem.calculateDifficulty(9);
      const diff10 = TowerSystem.calculateDifficulty(10);

      expect(diff10).toBeGreaterThan(diff9 * 1.4);
    });
  });

  describe('getRecommendedPower', () => {
    it('returns recommended power for floor', () => {
      const power = TowerSystem.getRecommendedPower(5);

      expect(power).toBeGreaterThan(0);
      expect(typeof power).toBe('number');
    });

    it('scales with floor difficulty', () => {
      const power1 = TowerSystem.getRecommendedPower(1);
      const power20 = TowerSystem.getRecommendedPower(20);

      expect(power20).toBeGreaterThan(power1);
    });
  });

  describe('calculateRewards', () => {
    it('returns rewards for floor', () => {
      const rewards = TowerSystem.calculateRewards(5);

      expect(rewards).toHaveProperty('gold');
      expect(rewards).toHaveProperty('exp');
      expect(rewards.gold).toBeGreaterThan(0);
      expect(rewards.exp).toBeGreaterThan(0);
    });

    it('scales rewards with floor number', () => {
      const rewards1 = TowerSystem.calculateRewards(1);
      const rewards10 = TowerSystem.calculateRewards(10);

      expect(rewards10.gold).toBeGreaterThan(rewards1.gold);
    });
  });

  describe('clearFloor', () => {
    it('succeeds on victory', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 1,
          highestFloor: 0,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(1, { victory: true });

      expect(result.success).toBe(true);
      expect(result.rewards).toBeTruthy();
      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('fails on defeat', () => {
      const result = TowerSystem.clearFloor(1, { victory: false });

      expect(result.success).toBe(false);
    });

    it('updates highest floor on new record', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 5,
          highestFloor: 4,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(5, { victory: true });

      expect(result.newHighFloor).toBe(true);
    });

    it('grants boss rewards on boss floor clear', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 10,
          highestFloor: 9,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(10, { victory: true });

      expect(result.success).toBe(true);
      expect(result.isBossCleared).toBe(true);
    });

    it('updates currentFloor to next floor on victory', () => {
      const mockData = {
        tower: {
          currentFloor: 5,
          highestFloor: 5,
          totalClears: 0,
          bossClears: {}
        }
      };
      SaveManager.load.mockReturnValue(mockData);

      const result = TowerSystem.clearFloor(5, { victory: true });

      expect(result.success).toBe(true);
      expect(result.nextFloor).toBe(6);
      // SaveManager.save가 호출될 때 currentFloor가 6으로 업데이트되었는지 확인
      expect(SaveManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tower: expect.objectContaining({
            currentFloor: 6
          })
        })
      );
    });
  });

  describe('nextFloor', () => {
    it('returns next floor info', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 5 }
      });

      const result = TowerSystem.nextFloor();

      expect(result.success).toBe(true);
      expect(result.floorInfo.floor).toBe(5);
    });

    it('fails at max floor', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 101 }
      });

      const result = TowerSystem.nextFloor();

      expect(result.success).toBe(false);
    });
  });

  describe('getProgress', () => {
    it('returns current tower progress', () => {
      const progress = TowerSystem.getProgress();

      expect(progress).toHaveProperty('currentFloor');
      expect(progress).toHaveProperty('highestFloor');
      expect(progress).toHaveProperty('maxFloor');
      expect(progress).toHaveProperty('nextBossFloor');
    });

    it('calculates next boss floor correctly', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 5, highestFloor: 5 }
      });

      const progress = TowerSystem.getProgress();

      expect(progress.nextBossFloor).toBe(10);
    });
  });

  describe('jumpToFloor', () => {
    it('allows jump to cleared floor', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 1, highestFloor: 10 }
      });

      const result = TowerSystem.jumpToFloor(5);

      expect(result.success).toBe(true);
      expect(result.newFloor).toBe(5);
    });

    it('prevents jump to uncleared floor', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 1, highestFloor: 5 }
      });

      const result = TowerSystem.jumpToFloor(10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('도달하지 않은');
    });
  });

  describe('resetTower', () => {
    it('resets progress and grants rewards', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 1,
          highestFloor: 50,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.resetTower();

      expect(result.success).toBe(true);
      expect(result.rewards).toBeTruthy();
      expect(result.previousHighest).toBe(50);
    });
  });

  describe('getSummary', () => {
    it('returns comprehensive tower status', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 15,
          highestFloor: 20,
          totalClears: 0,
          bossClears: {}
        }
      });

      const summary = TowerSystem.getSummary();

      expect(summary).toHaveProperty('currentFloor');
      expect(summary).toHaveProperty('highestFloor');
      expect(summary).toHaveProperty('progressPercent');
      expect(summary).toHaveProperty('recommendedPower');
      expect(summary).toHaveProperty('currentFloorInfo');
    });
  });
});

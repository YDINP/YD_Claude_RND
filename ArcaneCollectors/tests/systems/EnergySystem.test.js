/**
 * EnergySystem.test.js
 * Unit tests for EnergySystem - 에너지 관리 시스템
 * QAT-T3-2: 15 tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnergySystem, energySystem, ENERGY_CONFIG } from '../../src/systems/EnergySystem.js';

describe('EnergySystem', () => {
  let system;

  beforeEach(() => {
    system = new EnergySystem();
    system.initialize();
  });

  describe('consume() 기본 동작', () => {
    it('consumes energy when sufficient', () => {
      system.currentEnergy = 100;

      const result = system.consumeEnergy(20);

      expect(result.success).toBe(true);
      expect(result.currentEnergy).toBe(80);
      expect(result.consumed).toBe(20);
    });

    it('fails when energy is insufficient', () => {
      system.currentEnergy = 10;

      const result = system.consumeEnergy(50);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INSUFFICIENT_ENERGY');
      expect(result.currentEnergy).toBe(10);
      expect(result.consumed).toBe(0);
    });

    it('fails when amount is zero', () => {
      system.currentEnergy = 100;

      const result = system.consumeEnergy(0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_AMOUNT');
    });

    it('fails when amount is negative', () => {
      system.currentEnergy = 100;

      const result = system.consumeEnergy(-10);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_AMOUNT');
    });
  });

  describe('addEnergy() 기본 동작', () => {
    it('adds energy correctly', () => {
      system.currentEnergy = 50;
      system.playerLevel = 1;

      const result = system.addEnergy(30);

      expect(result.success).toBe(true);
      expect(result.added).toBe(30);
      expect(result.currentEnergy).toBe(80);
    });

    it('does not exceed 200% of max energy', () => {
      system.playerLevel = 1;
      const maxEnergy = system.getMaxEnergy(1);
      system.currentEnergy = maxEnergy;

      const result = system.addEnergy(maxEnergy * 2);

      expect(result.currentEnergy).toBeLessThanOrEqual(maxEnergy * 2);
    });

    it('fails when amount is zero', () => {
      const result = system.addEnergy(0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_AMOUNT');
    });

    it('fails when amount is negative', () => {
      const result = system.addEnergy(-20);

      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_AMOUNT');
    });
  });

  describe('시간 경과 자동 회복', () => {
    it('recovers energy based on time elapsed', () => {
      system.currentEnergy = 50;
      system.playerLevel = 1;
      const pastTime = Date.now() - (ENERGY_CONFIG.RECOVERY_INTERVAL_MINUTES * 60 * 1000 * 2); // 2 intervals ago
      system.lastRecoveryTime = pastTime;

      const currentEnergy = system.getCurrentEnergy();

      expect(currentEnergy).toBeGreaterThan(50);
    });

    it('does not exceed maxEnergy during recovery', () => {
      system.playerLevel = 1;
      const maxEnergy = system.getMaxEnergy(1);
      system.currentEnergy = maxEnergy - 5;
      const pastTime = Date.now() - (ENERGY_CONFIG.RECOVERY_INTERVAL_MINUTES * 60 * 1000 * 10); // 10 intervals
      system.lastRecoveryTime = pastTime;

      const currentEnergy = system.getCurrentEnergy();

      expect(currentEnergy).toBe(maxEnergy);
    });
  });

  describe('최대값 제한', () => {
    it('respects maxEnergy limit', () => {
      system.playerLevel = 1;
      const maxEnergy = system.getMaxEnergy(1);

      expect(maxEnergy).toBe(ENERGY_CONFIG.BASE_MAX_ENERGY + ENERGY_CONFIG.ENERGY_PER_LEVEL);
    });

    it('maxEnergy increases with player level', () => {
      const maxLevel1 = system.getMaxEnergy(1);
      const maxLevel5 = system.getMaxEnergy(5);

      expect(maxLevel5).toBeGreaterThan(maxLevel1);
      expect(maxLevel5).toBe(ENERGY_CONFIG.BASE_MAX_ENERGY + (5 * ENERGY_CONFIG.ENERGY_PER_LEVEL));
    });
  });

  describe('getter 메서드', () => {
    it('getCurrentEnergy() returns current energy', () => {
      system.currentEnergy = 75;

      expect(system.getCurrentEnergy()).toBe(75);
    });

    it('getMaxEnergy() returns correct max based on level', () => {
      const maxEnergy = system.getMaxEnergy(3);

      expect(maxEnergy).toBe(ENERGY_CONFIG.BASE_MAX_ENERGY + (3 * ENERGY_CONFIG.ENERGY_PER_LEVEL));
    });
  });

  describe('스테이지 비용', () => {
    it('returns correct cost for NORMAL stage', () => {
      const cost = system.getStageCost('NORMAL');

      expect(cost).toBe(6);
    });

    it('returns correct cost for BOSS stage', () => {
      const cost = system.getStageCost('BOSS');

      expect(cost).toBe(20);
    });

    it('throws error for invalid stage type', () => {
      expect(() => system.getStageCost('INVALID')).toThrow('알 수 없는 스테이지 타입');
    });
  });
});

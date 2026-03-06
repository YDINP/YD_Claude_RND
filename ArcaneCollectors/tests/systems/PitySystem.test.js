/**
 * PitySystem.test.js
 * Unit tests for PitySystem - CHAR-5 피티 시스템
 */
import { describe, it, expect } from 'vitest';
import { PitySystem } from '../../src/systems/PitySystem.js';

describe('PitySystem', () => {
  describe('calculateDropRate', () => {
    it('기본 확률 0.03 반환 (0회)', () => {
      expect(PitySystem.calculateDropRate(0)).toBe(0.03);
    });

    it('소프트 피티 직전 (29회) 기본 확률 유지', () => {
      expect(PitySystem.calculateDropRate(29)).toBe(0.03);
    });

    it('소프트 피티 시작 (30회) → 0.04', () => {
      expect(PitySystem.calculateDropRate(30)).toBe(0.04);
    });

    it('소프트 피티 31회 → 0.05', () => {
      expect(PitySystem.calculateDropRate(31)).toBe(0.05);
    });

    it('하드 피티 (50회) → 1.0', () => {
      expect(PitySystem.calculateDropRate(50)).toBe(1.0);
    });

    it('초과 (55회) → 1.0 유지', () => {
      expect(PitySystem.calculateDropRate(55)).toBe(1.0);
    });
  });

  describe('isSoftPity / isHardPity', () => {
    it('isSoftPity(30) = true', () => {
      expect(PitySystem.isSoftPity(30)).toBe(true);
    });

    it('isSoftPity(29) = false', () => {
      expect(PitySystem.isSoftPity(29)).toBe(false);
    });

    it('isHardPity(50) = true', () => {
      expect(PitySystem.isHardPity(50)).toBe(true);
    });

    it('isHardPity(49) = false', () => {
      expect(PitySystem.isHardPity(49)).toBe(false);
    });
  });

  describe('getPullsUntil', () => {
    it('getPullsUntilSoftPity(25) = 5', () => {
      expect(PitySystem.getPullsUntilSoftPity(25)).toBe(5);
    });

    it('getPullsUntilHardPity(45) = 5', () => {
      expect(PitySystem.getPullsUntilHardPity(45)).toBe(5);
    });

    it('getPullsUntilSoftPity(30) = 0 (이미 도달)', () => {
      expect(PitySystem.getPullsUntilSoftPity(30)).toBe(0);
    });

    it('getPullsUntilHardPity(50) = 0 (이미 도달)', () => {
      expect(PitySystem.getPullsUntilHardPity(50)).toBe(0);
    });
  });
});

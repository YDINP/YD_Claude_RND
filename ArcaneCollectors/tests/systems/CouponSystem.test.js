/**
 * CouponSystem.test.js
 * Unit tests for CouponSystem - 쿠폰 코드 관리 및 보상 지급 시스템
 * 16 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      usedCoupons: []
    })),
    save: vi.fn(),
    addGold: vi.fn(),
    addGems: vi.fn(),
    addSummonTickets: vi.fn()
  }
}));

import { CouponSystem } from '../../src/systems/CouponSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';

describe('CouponSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SaveManager.load.mockReturnValue({
      usedCoupons: []
    });
  });

  describe('isValidFormat', () => {
    it('validates correct formats', () => {
      expect(CouponSystem.isValidFormat('WELCOME-2025-GIFT')).toBe(true);
      expect(CouponSystem.isValidFormat('DEBUG-TEST-9999')).toBe(true);
      expect(CouponSystem.isValidFormat('DAILYBONUS')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(CouponSystem.isValidFormat('abc')).toBe(false);
      expect(CouponSystem.isValidFormat('12345')).toBe(false);
      expect(CouponSystem.isValidFormat('A-B')).toBe(false);
    });
  });

  describe('isUsed', () => {
    it('returns false for unused coupon', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: []
      });

      const used = CouponSystem.isUsed('WELCOME-2025-GIFT');
      expect(used).toBe(false);
    });

    it('returns true for used coupon', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['WELCOME-2025-GIFT']
      });

      const used = CouponSystem.isUsed('WELCOME-2025-GIFT');
      expect(used).toBe(true);
    });
  });

  describe('markAsUsed', () => {
    it('marks coupon as used', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: []
      });

      CouponSystem.markAsUsed('WELCOME-2025-GIFT');

      const savedData = SaveManager.save.mock.calls[0][0];
      expect(savedData.usedCoupons).toContain('WELCOME-2025-GIFT');
    });

    it('prevents duplicates in used list', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['WELCOME-2025-GIFT']
      });

      CouponSystem.markAsUsed('WELCOME-2025-GIFT');

      const savedData = SaveManager.save.mock.calls[0][0];
      const count = savedData.usedCoupons.filter(c => c === 'WELCOME-2025-GIFT').length;
      expect(count).toBe(1);
    });
  });

  describe('redeemCoupon', () => {
    it('redeems valid coupon successfully', () => {
      const result = CouponSystem.redeemCoupon('WELCOME-2025-GIFT');

      expect(result.success).toBe(true);
      expect(result.rewards).toBeTruthy();
      expect(SaveManager.addGems).toHaveBeenCalled();
      expect(SaveManager.addGold).toHaveBeenCalled();
    });

    it('normalizes coupon code to uppercase', () => {
      const result = CouponSystem.redeemCoupon('welcome-2025-gift');

      expect(result.success).toBe(true);
    });

    it('fails for invalid format', () => {
      const result = CouponSystem.redeemCoupon('abc');

      expect(result.success).toBe(false);
      expect(result.error).toContain('형식');
    });

    it('fails for non-existent coupon', () => {
      // Use a valid format but non-existent coupon code
      const result = CouponSystem.redeemCoupon('INVALID-CODE-XXXX');

      expect(result.success).toBe(false);
      expect(result.error).toContain('유효하지 않은');
    });

    it('fails for already used one-time coupon', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['WELCOME-2025-GIFT']
      });

      const result = CouponSystem.redeemCoupon('WELCOME-2025-GIFT');

      expect(result.success).toBe(false);
      expect(result.error).toContain('이미 사용');
    });

    it('allows multiple use of non-once coupons', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['DAILY-BONUS']
      });

      const result = CouponSystem.redeemCoupon('DAILY-BONUS');

      expect(result.success).toBe(true);
    });

    it('grants all reward types', () => {
      CouponSystem.redeemCoupon('WELCOME-2025-GIFT');

      expect(SaveManager.addGold).toHaveBeenCalledWith(10000);
      expect(SaveManager.addGems).toHaveBeenCalledWith(500);
      expect(SaveManager.addSummonTickets).toHaveBeenCalledWith(5);
    });
  });

  describe('grantRewards', () => {
    it('grants gold reward', () => {
      const coupon = { gold: 1000 };
      const rewards = CouponSystem.grantRewards(coupon);

      expect(SaveManager.addGold).toHaveBeenCalledWith(1000);
      expect(rewards.gold).toBe(1000);
    });

    it('grants gems reward', () => {
      const coupon = { gems: 500 };
      const rewards = CouponSystem.grantRewards(coupon);

      expect(SaveManager.addGems).toHaveBeenCalledWith(500);
      expect(rewards.gems).toBe(500);
    });

    it('grants tickets reward', () => {
      const coupon = { tickets: 3 };
      const rewards = CouponSystem.grantRewards(coupon);

      expect(SaveManager.addSummonTickets).toHaveBeenCalledWith(3);
      expect(rewards.tickets).toBe(3);
    });
  });

  describe('getAvailableCoupons', () => {
    it('returns list of all coupons', () => {
      const coupons = CouponSystem.getAvailableCoupons();

      expect(Array.isArray(coupons)).toBe(true);
      expect(coupons.length).toBeGreaterThan(0);
      expect(coupons[0]).toHaveProperty('code');
      expect(coupons[0]).toHaveProperty('description');
      expect(coupons[0]).toHaveProperty('rewards');
    });

    it('marks used coupons', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['WELCOME-2025-GIFT']
      });

      const coupons = CouponSystem.getAvailableCoupons();
      const welcomeCoupon = coupons.find(c => c.code === 'WELCOME-2025-GIFT');

      expect(welcomeCoupon.used).toBe(true);
    });
  });

  describe('getCouponInfo', () => {
    it('returns coupon info for valid code', () => {
      const info = CouponSystem.getCouponInfo('WELCOME-2025-GIFT');

      expect(info).toBeTruthy();
      expect(info.code).toBe('WELCOME-2025-GIFT');
      expect(info).toHaveProperty('description');
      expect(info).toHaveProperty('rewards');
      expect(info).toHaveProperty('once');
    });

    it('returns null for invalid code', () => {
      const info = CouponSystem.getCouponInfo('INVALID-CODE');

      expect(info).toBeNull();
    });
  });

  describe('formatRewards', () => {
    it('formats multiple reward types', () => {
      const rewards = { gold: 1000, gems: 50, tickets: 2 };
      const formatted = CouponSystem.formatRewards(rewards);

      expect(formatted).toContain('골드');
      expect(formatted).toContain('젬');
      expect(formatted).toContain('소환권');
    });

    it('handles empty rewards', () => {
      const formatted = CouponSystem.formatRewards({});

      expect(formatted).toBe('');
    });
  });

  describe('resetUsedCoupons', () => {
    it('clears used coupons list', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['WELCOME-2025-GIFT', 'DAILY-BONUS']
      });

      CouponSystem.resetUsedCoupons();

      const savedData = SaveManager.save.mock.calls[0][0];
      expect(savedData.usedCoupons).toEqual([]);
    });
  });

  describe('getUsedCoupons', () => {
    it('returns list of used coupons', () => {
      SaveManager.load.mockReturnValue({
        usedCoupons: ['WELCOME-2025-GIFT', 'LAUNCH-SPECIAL']
      });

      const used = CouponSystem.getUsedCoupons();

      expect(Array.isArray(used)).toBe(true);
      expect(used).toContain('WELCOME-2025-GIFT');
      expect(used).toContain('LAUNCH-SPECIAL');
    });
  });
});

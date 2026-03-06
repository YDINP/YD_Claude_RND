/**
 * CouponSystem - 쿠폰 코드 관리 및 보상 지급 시스템
 */
import { SaveManager } from './SaveManager.js';

export class CouponSystem {
  // 하드코딩된 쿠폰 목록 (데모용)
  // 실제 서비스에서는 서버에서 관리
  static VALID_COUPONS = {
    'WELCOME-2025-GIFT': {
      gems: 500,
      gold: 10000,
      tickets: 5,
      once: true,
      description: '신규 유저 환영 선물'
    },
    'NEWYEAR-EVENT-88': {
      gems: 88,
      gold: 8888,
      once: true,
      description: '신년 이벤트 기념'
    },
    'LAUNCH-SPECIAL': {
      gems: 300,
      gold: 5000,
      tickets: 3,
      once: true,
      description: '출시 기념 특별 선물'
    },
    'DEBUG-TEST-9999': {
      gems: 9999,
      gold: 99999,
      tickets: 99,
      once: false,
      description: '개발자 테스트 쿠폰'
    },
    'DAILY-BONUS': {
      gems: 50,
      gold: 1000,
      once: false,
      description: '일일 보너스'
    },
    'COMEBACK-REWARD': {
      gems: 200,
      gold: 3000,
      tickets: 2,
      once: true,
      description: '복귀 유저 보상'
    }
  };

  /**
   * 쿠폰 사용
   * @param {string} code 쿠폰 코드
   * @returns {Object} { success: boolean, error?: string, rewards?: Object }
   */
  static redeemCoupon(code) {
    // 입력값 정규화
    const normalizedCode = code.toUpperCase().trim();

    // 쿠폰 형식 검증
    if (!this.isValidFormat(normalizedCode)) {
      return {
        success: false,
        error: '쿠폰 형식이 올바르지 않습니다'
      };
    }

    // 쿠폰 존재 여부 확인
    const coupon = this.VALID_COUPONS[normalizedCode];
    if (!coupon) {
      return {
        success: false,
        error: '유효하지 않은 쿠폰 코드입니다'
      };
    }

    // 이미 사용한 쿠폰인지 확인 (1회 제한 쿠폰만)
    if (coupon.once && this.isUsed(normalizedCode)) {
      return {
        success: false,
        error: '이미 사용한 쿠폰입니다'
      };
    }

    // 보상 지급
    const rewards = this.grantRewards(coupon);

    // 사용 기록 저장 (1회 제한 쿠폰만)
    if (coupon.once) {
      this.markAsUsed(normalizedCode);
    }

    return {
      success: true,
      rewards,
      description: coupon.description
    };
  }

  /**
   * 쿠폰 형식 검증
   * @param {string} code 쿠폰 코드
   * @returns {boolean} 유효한 형식 여부
   */
  static isValidFormat(code) {
    // 형식: XXXX-XXXX-XXXX 또는 XXXXXX (6자 이상)
    return /^[A-Z0-9]{4,}-[A-Z0-9]{4,}(-[A-Z0-9]{4,})?$/.test(code) ||
           /^[A-Z0-9]{6,}$/.test(code);
  }

  /**
   * 쿠폰 사용 여부 확인
   * @param {string} code 쿠폰 코드
   * @returns {boolean} 사용 여부
   */
  static isUsed(code) {
    const data = SaveManager.load();
    const usedCoupons = data.usedCoupons || [];
    return usedCoupons.includes(code);
  }

  /**
   * 쿠폰을 사용한 것으로 표시
   * @param {string} code 쿠폰 코드
   */
  static markAsUsed(code) {
    const data = SaveManager.load();
    if (!data.usedCoupons) {
      data.usedCoupons = [];
    }
    data.usedCoupons.push(code);
    data.usedCoupons = [...new Set(data.usedCoupons)]; // 중복 제거
    SaveManager.save(data);
  }

  /**
   * 보상 지급
   * @param {Object} coupon 쿠폰 정보
   * @returns {Object} 지급된 보상 내역
   */
  static grantRewards(coupon) {
    const rewards = {};

    if (coupon.gold) {
      SaveManager.addGold(coupon.gold);
      rewards.gold = coupon.gold;
    }

    if (coupon.gems) {
      SaveManager.addGems(coupon.gems);
      rewards.gems = coupon.gems;
    }

    if (coupon.tickets) {
      SaveManager.addSummonTickets(coupon.tickets);
      rewards.tickets = coupon.tickets;
    }

    return rewards;
  }

  /**
   * 사용 가능한 쿠폰 목록 조회 (디버그용)
   * @returns {Array} 쿠폰 코드 목록
   */
  static getAvailableCoupons() {
    const usedCoupons = SaveManager.load().usedCoupons || [];
    return Object.keys(this.VALID_COUPONS).map(code => ({
      code,
      description: this.VALID_COUPONS[code].description,
      used: this.VALID_COUPONS[code].once && usedCoupons.includes(code),
      rewards: {
        gold: this.VALID_COUPONS[code].gold || 0,
        gems: this.VALID_COUPONS[code].gems || 0,
        tickets: this.VALID_COUPONS[code].tickets || 0
      }
    }));
  }

  /**
   * 쿠폰 사용 내역 조회
   * @returns {Array} 사용한 쿠폰 코드 목록
   */
  static getUsedCoupons() {
    const data = SaveManager.load();
    return data.usedCoupons || [];
  }

  /**
   * 쿠폰 사용 내역 초기화 (디버그용)
   */
  static resetUsedCoupons() {
    const data = SaveManager.load();
    data.usedCoupons = [];
    SaveManager.save(data);
  }

  /**
   * 쿠폰 정보 조회
   * @param {string} code 쿠폰 코드
   * @returns {Object|null} 쿠폰 정보
   */
  static getCouponInfo(code) {
    const normalizedCode = code.toUpperCase().trim();
    const coupon = this.VALID_COUPONS[normalizedCode];

    if (!coupon) return null;

    return {
      code: normalizedCode,
      description: coupon.description,
      rewards: {
        gold: coupon.gold || 0,
        gems: coupon.gems || 0,
        tickets: coupon.tickets || 0
      },
      once: coupon.once,
      used: coupon.once && this.isUsed(normalizedCode)
    };
  }

  /**
   * 보상 포맷팅 (UI 표시용)
   * @param {Object} rewards 보상 객체
   * @returns {string} 포맷된 문자열
   */
  static formatRewards(rewards) {
    const parts = [];

    if (rewards.gold) {
      parts.push(`골드 ${rewards.gold.toLocaleString()}`);
    }
    if (rewards.gems) {
      parts.push(`젬 ${rewards.gems.toLocaleString()}`);
    }
    if (rewards.tickets) {
      parts.push(`소환권 ${rewards.tickets}`);
    }

    return parts.join(', ');
  }
}

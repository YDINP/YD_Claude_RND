/**
 * PitySystem - 기본영웅 피티(Pity) 시스템
 * CHAR-5: 조각/각인 수집 피티 메커니즘
 *
 * 소프트 피티: 30회 시작 → 매 회마다 SSR 확률 +1%
 * 하드 피티: 50회 → SSR 확정 100%
 */
export class PitySystem {
  static SOFT_PITY_THRESHOLD = 30;
  static HARD_PITY_THRESHOLD = 50;
  static BASE_SSR_RATE = 0.03;

  /**
   * 현재 뽑기 횟수에 따른 SSR 드롭률 계산
   * @param {number} pullCount - 현재까지 뽑은 횟수
   * @param {number} baseRate - 기본 SSR 확률 (기본값: 0.03 = 3%)
   * @returns {number} 적용 확률 (0.0 ~ 1.0)
   */
  static calculateDropRate(pullCount, baseRate = PitySystem.BASE_SSR_RATE) {
    if (pullCount < PitySystem.SOFT_PITY_THRESHOLD) return baseRate;
    if (pullCount >= PitySystem.HARD_PITY_THRESHOLD) return 1.0;
    return baseRate + (pullCount - PitySystem.SOFT_PITY_THRESHOLD + 1) * 0.01;
  }

  /**
   * 소프트 피티 구간 여부 확인
   * @param {number} pullCount
   * @returns {boolean}
   */
  static isSoftPity(pullCount) {
    return pullCount >= PitySystem.SOFT_PITY_THRESHOLD;
  }

  /**
   * 하드 피티 도달 여부 확인
   * @param {number} pullCount
   * @returns {boolean}
   */
  static isHardPity(pullCount) {
    return pullCount >= PitySystem.HARD_PITY_THRESHOLD;
  }

  /**
   * 소프트 피티까지 남은 횟수
   * @param {number} pullCount
   * @returns {number} 0이면 이미 소프트 피티 구간
   */
  static getPullsUntilSoftPity(pullCount) {
    return Math.max(0, PitySystem.SOFT_PITY_THRESHOLD - pullCount);
  }

  /**
   * 하드 피티까지 남은 횟수
   * @param {number} pullCount
   * @returns {number} 0이면 이미 하드 피티 도달
   */
  static getPullsUntilHardPity(pullCount) {
    return Math.max(0, PitySystem.HARD_PITY_THRESHOLD - pullCount);
  }
}

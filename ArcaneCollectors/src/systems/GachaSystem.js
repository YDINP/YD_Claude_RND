/**
 * GachaSystem - 캐릭터 소환 시스템
 * 확률 기반 소환 및 천장(pity) 시스템 구현
 * v5: 천장/픽업 시스템 추가
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import bannersData from '../data/banners.json';

export class GachaSystem {
  // 등급별 기본 확률 (PRD v5.2 명세)
  static RATES = {
    SSR: 0.015, // 1.5%
    SR: 0.085, // 8.5%
    R: 0.30, // 30%
    N: 0.60 // 60%
  };

  // 천장 시스템 설정 (v5)
  static PITY_CONFIG = {
    softPity: 75,        // 75회부터 SSR 확률 증가
    hardPity: 90,        // 90회 SSR 확정
    softPityBonus: 0.06, // 소프트 천장 후 회당 +6%
    pickupPity: 180      // 180회 픽업 확정
  };

  // 레거시 호환성을 위한 상수
  static PITY_THRESHOLD = 90;
  static SOFT_PITY_START = 75;

  // 비용
  static SINGLE_COST = 300; // 젬
  static MULTI_COST = 2700; // 젬 (10연차, 10% 할인)
  static TICKET_SINGLE = 1; // 티켓 1장
  static TICKET_MULTI = 10; // 티켓 10장

  // 등급별 캐릭터 풀 (characters.json 기반 91명)
  static CHARACTER_POOL = {
    SSR: ['hero_001', 'hero_002', 'hero_003', 'hero_016', 'hero_017', 'hero_018', 'hero_019', 'hero_022', 'hero_023', 'hero_024', 'hero_028', 'hero_029', 'hero_030', 'hero_031', 'hero_034', 'hero_035', 'hero_040', 'hero_041', 'hero_049', 'hero_050', 'hero_058', 'hero_059', 'hero_067', 'hero_068', 'hero_083', 'hero_084'],
    SR: ['hero_004', 'hero_005', 'hero_006', 'hero_007', 'hero_008', 'hero_020', 'hero_021', 'hero_025', 'hero_026', 'hero_027', 'hero_032', 'hero_033', 'hero_036', 'hero_037', 'hero_038', 'hero_039', 'hero_042', 'hero_043', 'hero_051', 'hero_052', 'hero_060', 'hero_061', 'hero_069', 'hero_070', 'hero_085'],
    R: ['hero_009', 'hero_010', 'hero_011', 'hero_012', 'hero_013', 'hero_014', 'hero_015', 'hero_044', 'hero_045', 'hero_053', 'hero_054', 'hero_062', 'hero_063', 'hero_071', 'hero_072', 'hero_080', 'hero_086', 'hero_089'],
    N: ['hero_046', 'hero_047', 'hero_048', 'hero_055', 'hero_056', 'hero_057', 'hero_064', 'hero_065', 'hero_066', 'hero_073', 'hero_074', 'hero_075', 'hero_076', 'hero_077', 'hero_078', 'hero_079', 'hero_081', 'hero_082', 'hero_087', 'hero_088', 'hero_090', 'hero_091']
  };

  // 배너 데이터
  static _banners = bannersData.banners;
  static _currentBannerId = 'standard';
  static _bannerPityCounters = {};

  /** 천장 보너스 확률 계산 (v5) */
  static calculatePityBonus(pullCount) {
    if (pullCount >= this.PITY_CONFIG.hardPity) return 1.0;
    if (pullCount >= this.PITY_CONFIG.softPity) {
      const extraPulls = pullCount - this.PITY_CONFIG.softPity;
      return Math.min(this.RATES.SSR + (extraPulls * this.PITY_CONFIG.softPityBonus), 1.0);
    }
    return this.RATES.SSR;
  }

  /** 다음 SSR 획득 확률 계산 (v5) */
  static getNextSSRChance(bannerId = null) {
    const targetBanner = bannerId || this._currentBannerId;
    const gachaInfo = this.getBannerGachaInfo(targetBanner);
    const pullCount = gachaInfo.pityCounter;
    const baseRate = this.calculatePityBonus(pullCount);
    return {
      currentRate: `${(baseRate * 100).toFixed(2)  }%`,
      rawRate: baseRate,
      pullCount,
      remainingToSoftPity: Math.max(0, this.PITY_CONFIG.softPity - pullCount),
      remainingToHardPity: Math.max(0, this.PITY_CONFIG.hardPity - pullCount),
      inSoftPity: pullCount >= this.PITY_CONFIG.softPity,
      isGuaranteed: pullCount >= this.PITY_CONFIG.hardPity - 1
    };
  }

  /** 픽업 확정 여부 확인 (v5) */
  static isPickupGuaranteed(bannerId = null) {
    const targetBanner = bannerId || this._currentBannerId;
    const banner = this.getBannerById(targetBanner);
    if (!banner || banner.type === 'standard') {
      return { hasPickup: false, isGuaranteed: false, remainingToGuarantee: 0, pickupCharacters: [] };
    }
    const gachaInfo = this.getBannerGachaInfo(targetBanner);
    const pickupPityCount = gachaInfo.pickupPityCounter || 0;
    const lostPrevious5050 = gachaInfo.lost5050 || false;
    const isGuaranteed = lostPrevious5050 || pickupPityCount >= this.PITY_CONFIG.pickupPity - 1;
    return {
      hasPickup: true,
      isGuaranteed,
      lost5050: lostPrevious5050,
      remainingToGuarantee: Math.max(0, this.PITY_CONFIG.pickupPity - pickupPityCount),
      pickupPityCount,
      pickupCharacters: banner.pickupCharacters,
      pickupRate: banner.pickupRate
    };
  }

  /** 배너 ID로 배너 정보 조회 */
  static getBannerById(bannerId) {
    return this._banners.find(b => b.id === bannerId) || null;
  }

  /** 활성 배너 목록 조회 */
  static getActiveBanners() {
    const now = new Date();
    return this._banners.filter(banner => {
      if (banner.isPermanent) return true;
      if (!banner.isActive) return false;
      if (banner.startDate && banner.endDate) {
        return now >= new Date(banner.startDate) && now <= new Date(banner.endDate);
      }
      return banner.isActive;
    });
  }

  /** 배너별 가챠 정보 조회 */
  static getBannerGachaInfo(bannerId) {
    const saved = SaveManager.getGachaInfo();
    const bannerInfo = saved.banners?.[bannerId] || {
      pityCounter: 0, pickupPityCounter: 0, totalPulls: 0, totalSSR: 0, lost5050: false
    };
    if (bannerId === 'standard' && !saved.banners?.standard) {
      return {
        pityCounter: saved.pityCounter || 0,
        pickupPityCounter: 0,
        totalPulls: saved.totalPulls || 0,
        totalSSR: saved.totalSSR || 0,
        lost5050: false
      };
    }
    return bannerInfo;
  }

  /** 배너별 가챠 카운터 업데이트 */
  static updateBannerGachaInfo(bannerId, updates) {
    const saved = SaveManager.getGachaInfo();
    if (!saved.banners) saved.banners = {};
    if (!saved.banners[bannerId]) {
      saved.banners[bannerId] = { pityCounter: 0, pickupPityCounter: 0, totalPulls: 0, totalSSR: 0, lost5050: false };
    }
    Object.assign(saved.banners[bannerId], updates);
    if (bannerId === 'standard') {
      saved.pityCounter = updates.pityCounter ?? saved.pityCounter;
      saved.totalPulls = updates.totalPulls ?? saved.totalPulls;
    }
    SaveManager.saveGachaInfo(saved);
  }

  /** 현재 배너 설정 */
  static setCurrentBanner(bannerId) {
    const banner = this.getBannerById(bannerId);
    if (banner) { this._currentBannerId = bannerId; return true; }
    return false;
  }

  /** 픽업 캐릭터 결정 (v5) */
  static determinePickupCharacter(banner, lost5050, pickupPityCount) {
    const pickupCharacters = banner.pickupCharacters || [];
    if (pickupCharacters.length === 0) {
      return { characterId: this.getRandomCharacterByRarity('SSR'), isPickup: false, won5050: null };
    }
    if (pickupPityCount >= this.PITY_CONFIG.pickupPity || lost5050) {
      const pickupChar = pickupCharacters[Math.floor(Math.random() * pickupCharacters.length)];
      return { characterId: pickupChar, isPickup: true, won5050: null };
    }
    const roll = Math.random();
    if (roll < (banner.pickupRate || 0.5)) {
      const pickupChar = pickupCharacters[Math.floor(Math.random() * pickupCharacters.length)];
      return { characterId: pickupChar, isPickup: true, won5050: true };
    } else {
      const nonPickupSSR = this.CHARACTER_POOL.SSR.filter(c => !pickupCharacters.includes(c));
      const charId = nonPickupSSR.length > 0
        ? nonPickupSSR[Math.floor(Math.random() * nonPickupSSR.length)]
        : this.CHARACTER_POOL.SSR[Math.floor(Math.random() * this.CHARACTER_POOL.SSR.length)];
      return { characterId: charId, isPickup: false, won5050: false };
    }
  }

  /** 배너 천장 카운터 초기화 */
  static resetBannerPity(bannerId) {
    this.updateBannerGachaInfo(bannerId, { pityCounter: 0, pickupPityCounter: 0, lost5050: false });
  }

  /**
   * 소환 실행
   * @param {number} count 소환 횟수 (1 또는 10)
   * @param {string} paymentType 'gems' 또는 'tickets'
   * @returns {Object} { success, results, pityInfo }
   */
  static pull(count = 1, paymentType = 'gems') {
    // 비용 확인 및 차감
    if (!this.canPull(count, paymentType)) {
      return {
        success: false,
        error: paymentType === 'gems' ? '젬이 부족합니다' : '소환 티켓이 부족합니다',
        results: []
      };
    }

    // 비용 차감
    if (paymentType === 'gems') {
      const cost = count === 10 ? this.MULTI_COST : this.SINGLE_COST * count;
      SaveManager.spendGems(cost);
    } else {
      const ticketCost = count === 10 ? this.TICKET_MULTI : this.TICKET_SINGLE * count;
      SaveManager.spendSummonTickets(ticketCost);
    }

    const results = [];
    let gotSSR = false;
    const gachaInfo = SaveManager.getGachaInfo();
    let currentPity = gachaInfo.pityCounter;

    for (let i = 0; i < count; i++) {
      currentPity++;

      // 등급 결정
      const rarity = this.determineRarity(currentPity);

      // 캐릭터 선택
      const characterId = this.getRandomCharacterByRarity(rarity);

      // 캐릭터 추가 (SaveManager 통해)
      const addResult = SaveManager.addCharacter(characterId);

      results.push({
        characterId,
        rarity,
        isNew: !addResult.duplicate,
        shardsGained: addResult.duplicate ? addResult.shardsGained : 0,
        pullNumber: gachaInfo.totalPulls + i + 1
      });

      // SSR 획득 시 천장 초기화
      if (rarity === 'SSR') {
        gotSSR = true;
        currentPity = 0;
      }

      // 10연차 SR 이상 확정 (마지막 뽑기)
      if (count === 10 && i === 9) {
        const allRarities = results.map(r => r.rarity);
        const hasSROrHigher = allRarities.some(r => r === 'SR' || r === 'SSR');

        if (!hasSROrHigher) {
          // SR 확정 재뽑기
          const guaranteedRarity = 'SR';
          const guaranteedCharId = this.getRandomCharacterByRarity(guaranteedRarity);
          const guaranteedResult = SaveManager.addCharacter(guaranteedCharId);

          results[9] = {
            characterId: guaranteedCharId,
            rarity: guaranteedRarity,
            isNew: !guaranteedResult.duplicate,
            shardsGained: guaranteedResult.duplicate ? guaranteedResult.shardsGained : 0,
            pullNumber: gachaInfo.totalPulls + 10,
            guaranteed: true
          };
        }
      }
    }

    // 가챠 카운터 업데이트
    SaveManager.updateGachaCounter(count, gotSSR);

    // 이벤트 발생
    results.forEach(result => {
      if (result.isNew) {
        EventBus.emit(GameEvents.CHARACTER_ADDED, {
          characterId: result.characterId,
          rarity: result.rarity
        });
      }
    });

    return {
      success: true,
      results,
      pityInfo: this.getPityInfo()
    };
  }

  /**
   * 등급 결정 (천장/확률 적용)
   * @param {number} currentPity 현재 천장 카운터
   * @returns {string} 등급
   */
  static determineRarity(currentPity) {
    // 90연차 확정 천장
    if (currentPity >= this.PITY_THRESHOLD) {
      return 'SSR';
    }

    // 소프트 천장 (75연차 이후 SSR 확률 증가: 매 회 +6%)
    let ssrRate = this.RATES.SSR;
    if (currentPity >= this.SOFT_PITY_START) {
      const extraRate = (currentPity - this.SOFT_PITY_START) * this.PITY_CONFIG.softPityBonus;
      ssrRate = Math.min(ssrRate + extraRate, 1);
    }

    const roll = Math.random();
    let cumulative = 0;

    // SSR
    cumulative += ssrRate;
    if (roll < cumulative) return 'SSR';

    // SR (소프트 천장 시 SR 확률도 약간 조정)
    const srRate = currentPity >= this.SOFT_PITY_START
      ? this.RATES.SR * 0.8
      : this.RATES.SR;
    cumulative += srRate;
    if (roll < cumulative) return 'SR';

    // R
    const rRate = currentPity >= this.SOFT_PITY_START
      ? this.RATES.R * 0.9
      : this.RATES.R;
    cumulative += rRate;
    if (roll < cumulative) return 'R';

    // N (나머지)
    return 'N';
  }

  /**
   * 등급에 따른 랜덤 캐릭터 선택
   * @param {string} rarity 등급
   * @returns {string} 캐릭터 ID
   */
  static getRandomCharacterByRarity(rarity) {
    const pool = this.CHARACTER_POOL[rarity];
    if (!pool || pool.length === 0) {
      console.error(`GachaSystem: ${rarity} 캐릭터 풀이 비어있습니다`);
      return this.CHARACTER_POOL.N[0]; // 폴백
    }

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  /**
   * 소환 가능 여부 확인
   * @param {number} count 소환 횟수
   * @param {string} paymentType 지불 수단
   * @returns {boolean} 가능 여부
   */
  static canPull(count, paymentType = 'gems') {
    const resources = SaveManager.getResources();

    if (paymentType === 'gems') {
      const cost = count === 10 ? this.MULTI_COST : this.SINGLE_COST * count;
      return resources.gems >= cost;
    } else {
      const ticketCost = count === 10 ? this.TICKET_MULTI : this.TICKET_SINGLE * count;
      return resources.summonTickets >= ticketCost;
    }
  }

  /**
   * 천장 정보 조회
   * @returns {Object} 천장 상태
   */
  static getPityInfo() {
    const gachaInfo = SaveManager.getGachaInfo();
    const remaining = this.PITY_THRESHOLD - gachaInfo.pityCounter;
    const inSoftPity = gachaInfo.pityCounter >= this.SOFT_PITY_START;

    // 현재 SSR 확률 계산
    let currentSSRRate = this.RATES.SSR;
    if (inSoftPity) {
      const extraRate = (gachaInfo.pityCounter - this.SOFT_PITY_START) * 0.05;
      currentSSRRate = Math.min(currentSSRRate + extraRate, 1);
    }

    return {
      current: gachaInfo.pityCounter,
      threshold: this.PITY_THRESHOLD,
      remaining,
      softPityStart: this.SOFT_PITY_START,
      inSoftPity,
      currentSSRRate: `${(currentSSRRate * 100).toFixed(2)  }%`,
      totalPulls: gachaInfo.totalPulls
    };
  }

  /**
   * 소환 비용 조회
   * @param {number} count 소환 횟수
   * @param {string} paymentType 지불 수단
   * @returns {Object} 비용 정보
   */
  static getCost(count, paymentType = 'gems') {
    if (paymentType === 'gems') {
      const regularCost = this.SINGLE_COST * count;
      const actualCost = count === 10 ? this.MULTI_COST : regularCost;
      const discount = count === 10 ? regularCost - this.MULTI_COST : 0;

      return {
        type: 'gems',
        amount: actualCost,
        regularPrice: regularCost,
        discount,
        discountPercent: discount > 0 ? '10%' : '0%'
      };
    } else {
      return {
        type: 'tickets',
        amount: count === 10 ? this.TICKET_MULTI : this.TICKET_SINGLE * count,
        regularPrice: this.TICKET_SINGLE * count,
        discount: 0,
        discountPercent: '0%'
      };
    }
  }

  /**
   * 등급별 확률 정보
   * @returns {Object} 확률 정보
   */
  static getRateInfo() {
    return {
      SSR: { rate: `${this.RATES.SSR * 100  }%`, description: '전설 등급' },
      SR: { rate: `${this.RATES.SR * 100  }%`, description: '영웅 등급' },
      R: { rate: `${this.RATES.R * 100  }%`, description: '희귀 등급' },
      N: { rate: `${this.RATES.N * 100  }%`, description: '일반 등급' },
      pity: {
        hard: `${this.PITY_THRESHOLD}회 SSR 확정`,
        soft: `${this.SOFT_PITY_START}회부터 SSR 확률 증가`
      },
      tenPull: '10연차 SR 이상 1개 확정'
    };
  }

  /**
   * 캐릭터 풀 업데이트 (픽업 배너용)
   * @param {string} bannerId 배너 ID
   * @param {Object} customPool 커스텀 캐릭터 풀
   */
  static setCharacterPool(bannerId, customPool) {
    // 추후 픽업 배너 구현용
    this._currentBanner = bannerId;
    this._customPool = { ...this.CHARACTER_POOL, ...customPool };
  }

  /**
   * 기본 풀로 초기화
   */
  static resetCharacterPool() {
    this._currentBanner = null;
    this._customPool = null;
  }

  /**
   * 현재 활성 배너 조회
   * @returns {string|null} 배너 ID
   */
  static getCurrentBanner() {
    return this._currentBanner || 'standard';
  }

  /**
   * 시뮬레이션 (UI 미리보기용)
   * @param {number} simCount 시뮬레이션 횟수
   * @returns {Object} 시뮬레이션 결과
   */
  static simulate(simCount = 1000) {
    const results = { SSR: 0, SR: 0, R: 0, N: 0 };
    let pity = 0;

    for (let i = 0; i < simCount; i++) {
      pity++;
      const rarity = this.determineRarity(pity);
      results[rarity]++;

      if (rarity === 'SSR') {
        pity = 0;
      }
    }

    return {
      totalPulls: simCount,
      results,
      rates: {
        SSR: `${((results.SSR / simCount) * 100).toFixed(2)  }%`,
        SR: `${((results.SR / simCount) * 100).toFixed(2)  }%`,
        R: `${((results.R / simCount) * 100).toFixed(2)  }%`,
        N: `${((results.N / simCount) * 100).toFixed(2)  }%`
      }
    };
  }
}

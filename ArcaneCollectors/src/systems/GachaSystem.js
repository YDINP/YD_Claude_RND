/**
 * GachaSystem - 캐릭터 소환 시스템
 * 확률 기반 소환 및 천장(pity) 시스템 구현
 * v5: 천장/픽업 시스템 추가
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import bannersData from '../data/banners.json';
import equipmentData from '../data/equipment.json';
import { getAllAscendedHeroes, getAllBaseHeroes } from '../data/index.js';
import energySystem from './EnergySystem.js';
import { EquipmentSystem } from './EquipmentSystem.js';
import { EQUIPMENT_GACHA } from '../config/equipmentConfig.js';

export class GachaSystem {
  // 등급별 기본 확률 (T-S2: N등급 캐릭터 풀 공백으로 인한 크래시(GA-1/BLK-02) 대응 — N 확률을 R로 흡수)
  static RATES = {
    SSR: 0.015, // 1.5%
    SR: 0.085, // 8.5%
    R: 0.90, // 90% (기존 N 60%를 흡수)
    N: 0 // 0% (N등급 캐릭터 데이터 없음 — 확률 배정 안 함)
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

  // 등급별 캐릭터 풀 (임시 비활성화 - 가챠 시스템 준비 중)
  static CHARACTER_POOL = {
    SSR: [],
    SR: [],
    R: [],
    N: []
  };

  // PRD-3: 소환 1회당 에너지 소비량
  static ENERGY_COST_PER_PULL = 10;

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
   * @param {Object} [options]
   * @param {boolean} [options.skipEnergyCheck]
   * @param {string} [options.bannerId] 배너 ID. 미지정 시 'standard'(픽업 없음, 기존 동작)로
   *   취급한다 — `_currentBannerId`(배너 UI 선택 상태)에 암묵적으로 의존하면 bannerId를
   *   넘기지 않는 기존 호출부(테스트/무료 10연 등)가 예기치 않게 픽업 라우팅을 타게 된다.
   * @returns {Object} { success, results, pityInfo }
   */
  static pull(count = 1, paymentType = 'gems', options = {}) {
    // 풀 미초기화 방지: 비어있으면 lazy 자동 초기화 후 재검사 (PRD-1)
    let hasPool = Object.values(this.CHARACTER_POOL).some(pool => pool.length > 0);
    if (!hasPool) {
      this.initializePool();
      hasPool = Object.values(this.CHARACTER_POOL).some(pool => pool.length > 0);
    }
    if (!hasPool) {
      console.warn('[GachaSystem] CHARACTER_POOL is empty even after initialization.');
      return { success: false, error: '소환 가능한 캐릭터가 없습니다.', results: [] };
    }

    // 배너별 픽업 라우팅. bannerId 미지정 시 'standard'로 취급(픽업 없음, 기존 동작 유지)
    const bannerId = options.bannerId || 'standard';
    const banner = this.getBannerById(bannerId) || this.getBannerById('standard');
    const hasPickup = !!(banner && Array.isArray(banner.pickupCharacters) && banner.pickupCharacters.length > 0);

    // T-S2/BLK-05: 첫 무료 10연은 재화/에너지 모두 면제
    const gachaInfo = SaveManager.getGachaInfo();
    const isFreeTenPull = count === 10 && !gachaInfo.freeTenPullUsed;

    // PRD-3: 에너지 소비 (skipEnergyCheck 옵션으로 기존 테스트 보호, 무료 10연은 면제)
    const energyCost = (count || 1) * this.ENERGY_COST_PER_PULL;
    if (!isFreeTenPull && !options.skipEnergyCheck) {
      const energyResult = energySystem.consume(energyCost, 'gacha');
      if (!energyResult.success) {
        return { success: false, error: '에너지가 부족합니다.', results: [], energyRequired: energyCost };
      }
    }

    // 비용 확인 및 차감 (무료 10연은 면제)
    if (!isFreeTenPull) {
      if (!this.canPull(count, paymentType)) {
        return {
          success: false,
          error: paymentType === 'gems' ? '젬이 부족합니다' : '소환 티켓이 부족합니다',
          results: []
        };
      }

      if (paymentType === 'gems') {
        const cost = count === 10 ? this.MULTI_COST : this.SINGLE_COST * count;
        SaveManager.spendGems(cost);
      } else {
        const ticketCost = count === 10 ? this.TICKET_MULTI : this.TICKET_SINGLE * count;
        SaveManager.spendSummonTickets(ticketCost);
      }
    }

    // 픽업 배너 카운터 로드 (배너별 분리 저장 — standard/픽업 없는 배너는 건드리지 않는다)
    const bannerInfo = hasPickup ? this.getBannerGachaInfo(bannerId) : null;
    let pickupPityCount = bannerInfo ? (bannerInfo.pickupPityCounter || 0) : 0;
    let lost5050 = bannerInfo ? !!bannerInfo.lost5050 : false;
    let bannerSSRCount = 0;

    const results = [];
    let gotSSR = false;
    let currentPity = gachaInfo.pityCounter;

    for (let i = 0; i < count; i++) {
      currentPity++;

      // 등급 결정
      const rarity = this.determineRarity(currentPity);

      // 픽업 확정 천장은 누적 뽑기 횟수 기준이다(등급 무관 — tools/simulate/gacha-sim.mjs
      // rollPickup()과 동일 해석. isPickupGuaranteed()의 remaining = pickupPity - counter 도
      // 이 해석을 전제로 한다).
      if (hasPickup) pickupPityCount++;

      // 캐릭터 선택 — 픽업 배너의 SSR은 determinePickupCharacter()로 라우팅한다
      let characterId;
      let isPickup;
      if (rarity === 'SSR' && hasPickup) {
        const pick = this.determinePickupCharacter(banner, lost5050, pickupPityCount);
        characterId = pick.characterId;
        isPickup = pick.isPickup;
        if (pick.isPickup) {
          pickupPityCount = 0;
          lost5050 = false;
        } else {
          lost5050 = true; // 50/50 패배 — 다음 SSR은 픽업 확정
        }
      } else {
        characterId = this.getRandomCharacterByRarity(rarity);
      }

      // 캐릭터 추가 (SaveManager 통해)
      const addResult = SaveManager.addCharacter(characterId);

      const entry = {
        characterId,
        rarity,
        isNew: !addResult.duplicate,
        shardsGained: addResult.duplicate ? addResult.shardsGained : 0,
        pullNumber: gachaInfo.totalPulls + i + 1
      };
      if (isPickup !== undefined) entry.isPickup = isPickup;
      results.push(entry);

      // SSR 획득 시 천장 초기화
      if (rarity === 'SSR') {
        gotSSR = true;
        bannerSSRCount++;
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

    // 픽업 배너 카운터 저장 (배너별 분리 — standard 배너는 기존 동작대로 건드리지 않는다)
    if (hasPickup) {
      this.updateBannerGachaInfo(bannerId, {
        pickupPityCounter: pickupPityCount,
        lost5050,
        totalPulls: (bannerInfo.totalPulls || 0) + count,
        totalSSR: (bannerInfo.totalSSR || 0) + bannerSSRCount
      });
    }

    // 가챠 카운터 업데이트 (뽑기 횟수, SSR 획득 여부)
    SaveManager.updateGachaCounter(count, gotSSR);

    // T-S2/BLK-05: 무료 10연 사용 처리 (재사용 방지 플래그)
    if (isFreeTenPull) {
      SaveManager.saveGachaInfo({ freeTenPullUsed: true });
    }

    // 이벤트 발생
    results.forEach(result => {
      if (result.isNew) {
        EventBus.emit(GameEvents.CHARACTER_ADDED, {
          characterId: result.characterId,
          rarity: result.rarity
        });
      }
    });

    const pityInfo = this.getPityInfo();

    // 소환이 끝났다는 사실 자체를 알린다.
    // CHARACTER_ADDED 는 **신규 영웅이 나왔을 때만** 발행되므로, 10연이 전부 중복이면
    // 아무 이벤트도 뜨지 않는다. 그 상태에 걸리면 메뉴 배지가 갱신되지 않고,
    // 무료 10연으로 완료되는 튜토리얼 T-05 가 커밋되지 않아 온보딩이 잠긴 팝업 안에
    // 갇힌다(소환 팝업은 T-05 커밋 전까지 닫기가 잠겨 있다).
    // 구독자(MainMenuScene 배지, TutorialManager.attachEvents)는 이미 이 이벤트를
    // 기다리고 있었고 발행부만 없었다.
    EventBus.emit(GameEvents.GACHA_COMPLETE, { results, pityInfo });

    return {
      success: true,
      results,
      pityInfo
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
    if (pool && pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      return pool[randomIndex];
    }

    // GA-1/BLK-02: 풀이 비어있으면 null을 반환하지 않고 인접 등급으로 폴백한다.
    // 아래 등급 → 위 등급 순으로 탐색해 가장 가까운 비어있지 않은 풀을 사용한다.
    console.warn(`[GachaSystem] ${rarity} 캐릭터 풀이 비어있습니다. 인접 등급으로 폴백합니다.`);
    const rarityOrder = ['N', 'R', 'SR', 'SSR'];
    const currentIndex = rarityOrder.indexOf(rarity);

    for (let i = currentIndex - 1; i >= 0; i--) {
      const fallbackPool = this.CHARACTER_POOL[rarityOrder[i]];
      if (fallbackPool && fallbackPool.length > 0) {
        return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      }
    }
    for (let i = currentIndex + 1; i < rarityOrder.length; i++) {
      const fallbackPool = this.CHARACTER_POOL[rarityOrder[i]];
      if (fallbackPool && fallbackPool.length > 0) {
        return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      }
    }

    // 모든 등급의 풀이 비어있는 극단적 상황에서만 null 반환
    console.error('[GachaSystem] 모든 등급의 캐릭터 풀이 비어있습니다.');
    return null;
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
   * CHARACTER_POOL을 base-heroes + ascended-heroes 기반으로 초기화 (PRD-1)
   * ascended-heroes의 rarity 필드를 기준으로 분류.
   * base-heroes는 rarity 없으면 기본값 R 사용.
   * @param {Object} [options]
   * @param {boolean} [options.ascendedOnly=false] ascended-heroes만 사용
   */
  static initializePool(options = {}) {
    const pool = { SSR: [], SR: [], R: [], N: [] };

    // ascended-heroes 로드 (rarity 필드 기준)
    try {
      const ascendedHeroes = getAllAscendedHeroes();
      for (const hero of ascendedHeroes) {
        const rarity = hero.rarity;
        if (pool[rarity]) {
          pool[rarity].push(hero.id);
        }
      }
    } catch (e) {
      console.warn('[GachaSystem] ascended-heroes 로드 실패:', e.message);
    }

    // base-heroes 로드 (ascendedOnly 옵션이 false일 때만)
    if (!options.ascendedOnly) {
      try {
        const baseHeroes = getAllBaseHeroes();
        for (const hero of baseHeroes) {
          const rarity = hero.rarity || 'R';
          if (pool[rarity]) {
            pool[rarity].push(hero.id);
          }
        }
      } catch (e) {
        console.warn('[GachaSystem] base-heroes 로드 실패:', e.message);
      }
    }

    this.CHARACTER_POOL = pool;
    return pool;
  }

  // ========== 장비 가챠 (T-XX: 소환 화면 '장비 소환' 탭 SSOT) ==========
  // 카테고리(weapons/armors/accessories/relics) → 슬롯 타입 매핑
  static _EQUIPMENT_CATEGORY_TO_SLOT = {
    weapons: 'weapon', armors: 'armor', accessories: 'accessory', relics: 'relic'
  };

  static _equipmentPool = null;

  /**
   * equipment.json 을 등급별로 묶어 캐싱한다. 실제 카탈로그 항목(이름/스탯 포함)을 그대로
   * 가챠 지급 대상으로 쓴다 — EquipmentSystem.createEquipment()의 절차적 생성과 달리
   * 기존에 정의된 장비(Iron Sword 등)가 나온다.
   * @returns {{SSR:Array,SR:Array,R:Array,N:Array}}
   */
  static getEquipmentPool() {
    if (this._equipmentPool) return this._equipmentPool;
    const pool = { SSR: [], SR: [], R: [], N: [] };
    const categories = (equipmentData && equipmentData.equipment) || {};
    Object.entries(categories).forEach(([category, items]) => {
      const slotType = this._EQUIPMENT_CATEGORY_TO_SLOT[category] || category;
      Object.values(items || {}).forEach((item) => {
        if (pool[item.rarity]) {
          pool[item.rarity].push({ ...item, slotType });
        }
      });
    });
    this._equipmentPool = pool;
    return pool;
  }

  /** 장비 등급 결정 (EQUIPMENT_GACHA.rates SSOT — src/config/equipmentConfig.js) */
  static determineEquipmentRarity() {
    const rates = EQUIPMENT_GACHA.rates;
    const roll = Math.random();
    let cumulative = 0;
    for (const grade of ['SSR', 'SR', 'R', 'N']) {
      cumulative += rates[grade] || 0;
      if (roll < cumulative) return grade;
    }
    return 'N';
  }

  /**
   * 등급에 맞는 장비 카탈로그 항목을 무작위로 선택한다. 풀이 비어있으면 인접 등급으로
   * 폴백한다 (getRandomCharacterByRarity와 동일한 방어 전략).
   * @param {string} rarity
   * @returns {Object|null} equipment.json 항목 + slotType
   */
  static getRandomEquipmentByRarity(rarity) {
    const pool = this.getEquipmentPool();
    const list = pool[rarity];
    if (list && list.length > 0) return list[Math.floor(Math.random() * list.length)];

    const order = ['N', 'R', 'SR', 'SSR'];
    const currentIndex = order.indexOf(rarity);
    for (let i = currentIndex - 1; i >= 0; i--) {
      const fallback = pool[order[i]];
      if (fallback && fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];
    }
    for (let i = currentIndex + 1; i < order.length; i++) {
      const fallback = pool[order[i]];
      if (fallback && fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];
    }
    return null;
  }

  /**
   * 장비 소환 실행 (소환 화면 '장비 소환' 탭). 캐릭터 가챠와 별개의 SSOT(EQUIPMENT_GACHA)를
   * 쓰며 천장/픽업이 없다. 10연차는 SR 이상 1개를 보장한다(캐릭터 가챠와 동일 규칙).
   * 지급은 EquipmentSystem.createEquipment()를 재사용해 SaveManager 인벤토리 경로를 그대로 탄다.
   * @param {number} count 소환 횟수 (1 또는 10)
   * @param {string} paymentType 'gems' 또는 'tickets'
   * @returns {Object} { success, results, error? }
   */
  static pullEquipment(count = 1, paymentType = 'gems') {
    const cost = count === 10 ? EQUIPMENT_GACHA.cost.multi : EQUIPMENT_GACHA.cost.single * count;
    const ticketCost = count === 10 ? EQUIPMENT_GACHA.ticketCost.multi : EQUIPMENT_GACHA.ticketCost.single * count;
    const resources = SaveManager.getResources();

    if (paymentType === 'gems') {
      if ((resources.gems || 0) < cost) {
        return { success: false, error: '젬이 부족합니다', results: [] };
      }
      SaveManager.spendGems(cost);
    } else {
      if ((resources.summonTickets || 0) < ticketCost) {
        return { success: false, error: '소환 티켓이 부족합니다', results: [] };
      }
      SaveManager.spendSummonTickets(ticketCost);
    }

    const results = [];
    let guaranteeSRPlus = count >= 10; // 10연차 SR 이상 1개 보장

    for (let i = 0; i < count; i++) {
      let rarity = this.determineEquipmentRarity();

      // 10연차 마지막인데 아직 SR 이상이 없으면 SR로 승격 (SSR이면 그대로 둔다)
      if (i === count - 1 && guaranteeSRPlus && rarity !== 'SSR') {
        rarity = 'SR';
      }
      if (rarity === 'SSR' || rarity === 'SR') guaranteeSRPlus = false;

      const def = this.getRandomEquipmentByRarity(rarity);
      if (!def) continue; // 극단적으로 모든 등급 풀이 비어있는 경우만 스킵

      const equipment = EquipmentSystem.createEquipment(def.slotType, rarity, {
        definitionId: def.id,
        name: def.nameKr || def.name,
        stats: def.stats
      });

      results.push({
        equipmentId: equipment.id,
        definitionId: def.id,
        slotType: def.slotType,
        slotIcon: EQUIPMENT_GACHA.slotIcons[def.slotType] || '⚔️',
        rarity,
        name: equipment.name,
        stats: equipment.stats
      });
    }

    return { success: true, results };
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

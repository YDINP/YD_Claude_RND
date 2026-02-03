/**
 * GachaSystem - 캐릭터 소환 시스템
 * 확률 기반 소환 및 천장(pity) 시스템 구현
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';

export class GachaSystem {
  // 등급별 확률
  static RATES = {
    SSR: 0.015, // 1.5%
    SR: 0.085, // 8.5%
    R: 0.30, // 30%
    N: 0.60 // 60%
  };

  // 천장 시스템
  static PITY_THRESHOLD = 90; // 90연차 SSR 확정
  static SOFT_PITY_START = 75; // 75연차부터 확률 증가

  // 비용
  static SINGLE_COST = 300; // 젬
  static MULTI_COST = 2700; // 젬 (10연차, 10% 할인)
  static TICKET_SINGLE = 1; // 티켓 1장
  static TICKET_MULTI = 10; // 티켓 10장

  // 등급별 캐릭터 풀 (실제 게임에서는 데이터에서 로드)
  static CHARACTER_POOL = {
    SSR: ['ssr_aelara', 'ssr_krom', 'ssr_lyra', 'ssr_vex', 'ssr_nova'],
    SR: ['sr_finn', 'sr_mira', 'sr_bolt', 'sr_sage', 'sr_ash', 'sr_ivy', 'sr_rex'],
    R: ['r_guard', 'r_scout', 'r_mage', 'r_healer', 'r_archer', 'r_knight', 'r_rogue', 'r_priest'],
    N: ['n_soldier', 'n_peasant', 'n_apprentice', 'n_acolyte', 'n_hunter', 'n_villager']
  };

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

    // 소프트 천장 (75연차 이후 SSR 확률 증가)
    let ssrRate = this.RATES.SSR;
    if (currentPity >= this.SOFT_PITY_START) {
      const extraRate = (currentPity - this.SOFT_PITY_START) * 0.05;
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
      currentSSRRate: (currentSSRRate * 100).toFixed(2) + '%',
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
      SSR: { rate: this.RATES.SSR * 100 + '%', description: '전설 등급' },
      SR: { rate: this.RATES.SR * 100 + '%', description: '영웅 등급' },
      R: { rate: this.RATES.R * 100 + '%', description: '희귀 등급' },
      N: { rate: this.RATES.N * 100 + '%', description: '일반 등급' },
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
        SSR: ((results.SSR / simCount) * 100).toFixed(2) + '%',
        SR: ((results.SR / simCount) * 100).toFixed(2) + '%',
        R: ((results.R / simCount) * 100).toFixed(2) + '%',
        N: ((results.N / simCount) * 100).toFixed(2) + '%'
      }
    };
  }
}

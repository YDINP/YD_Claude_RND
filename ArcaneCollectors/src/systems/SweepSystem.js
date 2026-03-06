/**
 * SweepSystem.js
 * 소탕 시스템 - 클리어한 스테이지를 빠르게 반복 클리어
 * 
 * ArcaneCollectors v4 - 핵심 게임 시스템
 */

import energySystem from './EnergySystem.js';

// 소탕 시스템 설정
const SWEEP_CONFIG = {
  DAILY_LIMIT: 50,              // 일일 소탕 제한 횟수
  REQUIRED_STARS: 3,            // 소탕 필요 별 개수
  TICKET_COST: 1,               // 소탕권 비용 (회당)
  MAX_SWEEP_AT_ONCE: 10,        // 한 번에 최대 소탕 횟수
};

// 스테이지별 기본 보상 테이블 (예시)
const STAGE_REWARDS = {
  // 1장 스테이지
  '1-1': { gold: 100, exp: 50, drops: [{ itemId: 'material_001', chance: 0.3 }] },
  '1-2': { gold: 120, exp: 60, drops: [{ itemId: 'material_001', chance: 0.35 }] },
  '1-3': { gold: 150, exp: 75, drops: [{ itemId: 'material_002', chance: 0.25 }] },
  '1-ELITE': { gold: 300, exp: 150, drops: [{ itemId: 'material_rare_001', chance: 0.15 }] },
  '1-BOSS': { gold: 500, exp: 250, drops: [{ itemId: 'material_epic_001', chance: 0.10 }] },
  
  // 2장 스테이지
  '2-1': { gold: 180, exp: 90, drops: [{ itemId: 'material_002', chance: 0.3 }] },
  '2-2': { gold: 200, exp: 100, drops: [{ itemId: 'material_002', chance: 0.35 }] },
  '2-3': { gold: 230, exp: 115, drops: [{ itemId: 'material_003', chance: 0.25 }] },
  '2-ELITE': { gold: 450, exp: 225, drops: [{ itemId: 'material_rare_002', chance: 0.15 }] },
  '2-BOSS': { gold: 750, exp: 375, drops: [{ itemId: 'material_epic_002', chance: 0.10 }] },
};

class SweepSystem {
  constructor() {
    this.dailySweepCount = 0;
    this.lastResetDate = this._getDateString();
    this.stageProgress = new Map(); // stageId -> { stars: number, cleared: boolean }
    this.sweepTickets = 0;
  }

  /**
   * 초기화
   * @param {Object} savedData - 저장된 소탕 데이터
   */
  initialize(savedData = null) {
    if (savedData) {
      this.dailySweepCount = savedData.dailySweepCount || 0;
      this.lastResetDate = savedData.lastResetDate || this._getDateString();
      this.sweepTickets = savedData.sweepTickets || 0;
      
      // 스테이지 진행도 복원
      if (savedData.stageProgress) {
        this.stageProgress = new Map(Object.entries(savedData.stageProgress));
      }
      
      // 일일 초기화 확인
      this._checkDailyReset();
    } else {
      this.dailySweepCount = 0;
      this.lastResetDate = this._getDateString();
      this.sweepTickets = 10; // 초기 소탕권
    }
  }

  /**
   * 현재 날짜 문자열 반환
   * @private
   */
  _getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * 일일 초기화 확인 및 수행
   * @private
   */
  _checkDailyReset() {
    const today = this._getDateString();
    if (this.lastResetDate !== today) {
      this.dailySweepCount = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * 스테이지 클리어 기록
   * @param {string} stageId - 스테이지 ID
   * @param {number} stars - 획득한 별 (1-3)
   */
  recordStageClear(stageId, stars) {
    const existing = this.stageProgress.get(stageId);
    
    if (!existing || existing.stars < stars) {
      this.stageProgress.set(stageId, {
        cleared: true,
        stars: Math.min(3, Math.max(1, stars)),
        firstClearDate: existing?.firstClearDate || Date.now(),
        lastClearDate: Date.now(),
      });
    } else {
      this.stageProgress.set(stageId, {
        ...existing,
        lastClearDate: Date.now(),
      });
    }
  }

  /**
   * 소탕 가능 여부 확인
   * @param {string} stageId - 스테이지 ID
   * @param {number} count - 소탕 횟수 (기본 1)
   * @returns {Object} { canSweep, reasons }
   */
  canSweep(stageId, count = 1) {
    this._checkDailyReset();
    
    const reasons = [];
    const progress = this.stageProgress.get(stageId);
    
    // 1. 스테이지 클리어 여부 확인
    if (!progress || !progress.cleared) {
      reasons.push({
        code: 'NOT_CLEARED',
        message: '해당 스테이지를 먼저 클리어해야 합니다.',
      });
    }
    
    // 2. 별 3개 확인
    if (progress && progress.stars < SWEEP_CONFIG.REQUIRED_STARS) {
      reasons.push({
        code: 'INSUFFICIENT_STARS',
        message: `별 ${SWEEP_CONFIG.REQUIRED_STARS}개가 필요합니다. (현재: ${progress.stars}개)`,
      });
    }
    
    // 3. 일일 소탕 횟수 확인
    if (this.dailySweepCount + count > SWEEP_CONFIG.DAILY_LIMIT) {
      reasons.push({
        code: 'DAILY_LIMIT_EXCEEDED',
        message: `일일 소탕 횟수를 초과합니다. (남은 횟수: ${SWEEP_CONFIG.DAILY_LIMIT - this.dailySweepCount})`,
      });
    }
    
    // 4. 소탕권 확인
    const requiredTickets = SWEEP_CONFIG.TICKET_COST * count;
    if (this.sweepTickets < requiredTickets) {
      reasons.push({
        code: 'INSUFFICIENT_TICKETS',
        message: `소탕권이 부족합니다. (필요: ${requiredTickets}, 보유: ${this.sweepTickets})`,
      });
    }
    
    // 5. 에너지 확인
    const stageType = this._getStageType(stageId);
    const energyCost = energySystem.getStageCost(stageType) * count;
    const currentEnergy = energySystem.getCurrentEnergy();
    
    if (currentEnergy < energyCost) {
      reasons.push({
        code: 'INSUFFICIENT_ENERGY',
        message: `에너지가 부족합니다. (필요: ${energyCost}, 보유: ${currentEnergy})`,
      });
    }
    
    // 6. 최대 소탕 횟수 확인
    if (count > SWEEP_CONFIG.MAX_SWEEP_AT_ONCE) {
      reasons.push({
        code: 'EXCEEDS_MAX_SWEEP',
        message: `한 번에 최대 ${SWEEP_CONFIG.MAX_SWEEP_AT_ONCE}회까지만 소탕 가능합니다.`,
      });
    }
    
    return {
      canSweep: reasons.length === 0,
      stageId,
      count,
      reasons,
      requirements: {
        stars: SWEEP_CONFIG.REQUIRED_STARS,
        tickets: requiredTickets,
        energy: energyCost,
        dailyRemaining: SWEEP_CONFIG.DAILY_LIMIT - this.dailySweepCount,
      },
    };
  }

  /**
   * 스테이지 타입 추출
   * @private
   */
  _getStageType(stageId) {
    if (stageId.includes('BOSS')) return 'BOSS';
    if (stageId.includes('ELITE')) return 'ELITE';
    return 'NORMAL';
  }

  /**
   * 소탕 실행
   * @param {string} stageId - 스테이지 ID
   * @param {number} count - 소탕 횟수
   * @returns {Object} 소탕 결과
   */
  executeSweep(stageId, count = 1) {
    // 소탕 가능 여부 확인
    const sweepCheck = this.canSweep(stageId, count);
    
    if (!sweepCheck.canSweep) {
      return {
        success: false,
        error: 'SWEEP_NOT_AVAILABLE',
        reasons: sweepCheck.reasons,
      };
    }
    
    // 에너지 소모
    const stageType = this._getStageType(stageId);
    const energyCost = energySystem.getStageCost(stageType) * count;
    const energyResult = energySystem.consumeEnergy(energyCost);
    
    if (!energyResult.success) {
      return {
        success: false,
        error: 'ENERGY_CONSUME_FAILED',
        message: energyResult.message,
      };
    }
    
    // 소탕권 소모
    const ticketCost = SWEEP_CONFIG.TICKET_COST * count;
    this.sweepTickets -= ticketCost;
    
    // 일일 카운트 증가
    this.dailySweepCount += count;
    
    // 보상 계산
    const rewards = this.calculateRewards(stageId, count);
    
    return {
      success: true,
      stageId,
      count,
      costs: {
        energy: energyCost,
        tickets: ticketCost,
      },
      rewards,
      status: {
        remainingEnergy: energyResult.currentEnergy,
        remainingTickets: this.sweepTickets,
        dailyRemaining: this.getDailyRemaining(),
      },
    };
  }

  /**
   * 보상 계산
   * @param {string} stageId - 스테이지 ID
   * @param {number} count - 소탕 횟수 (기본 1)
   * @returns {Object} 보상 정보
   */
  calculateRewards(stageId, count = 1) {
    const baseReward = STAGE_REWARDS[stageId] || {
      gold: 100,
      exp: 50,
      drops: [],
    };
    
    const totalRewards = {
      gold: 0,
      exp: 0,
      items: [],
    };
    
    // 각 소탕마다 보상 계산
    for (let i = 0; i < count; i++) {
      totalRewards.gold += baseReward.gold;
      totalRewards.exp += baseReward.exp;
      
      // 드롭 아이템 확률 계산
      for (const drop of baseReward.drops) {
        if (Math.random() < drop.chance) {
          const existingItem = totalRewards.items.find(item => item.itemId === drop.itemId);
          if (existingItem) {
            existingItem.quantity += 1;
          } else {
            totalRewards.items.push({
              itemId: drop.itemId,
              quantity: 1,
            });
          }
        }
      }
    }
    
    return {
      ...totalRewards,
      sweepCount: count,
      breakdown: {
        goldPerSweep: baseReward.gold,
        expPerSweep: baseReward.exp,
        possibleDrops: baseReward.drops,
      },
    };
  }

  /**
   * 남은 일일 소탕 횟수 조회
   * @returns {Object} { remaining, used, limit }
   */
  getDailyRemaining() {
    this._checkDailyReset();
    
    return {
      remaining: SWEEP_CONFIG.DAILY_LIMIT - this.dailySweepCount,
      used: this.dailySweepCount,
      limit: SWEEP_CONFIG.DAILY_LIMIT,
    };
  }

  /**
   * 소탕권 추가
   * @param {number} amount - 추가할 소탕권 수
   * @returns {Object} 결과
   */
  addSweepTickets(amount) {
    if (amount <= 0) {
      return {
        success: false,
        error: 'INVALID_AMOUNT',
        message: '추가할 소탕권 수는 0보다 커야 합니다.',
      };
    }
    
    this.sweepTickets += amount;
    
    return {
      success: true,
      added: amount,
      total: this.sweepTickets,
    };
  }

  /**
   * 소탕권 구매 (보석으로)
   * @param {number} count - 구매할 소탕권 수
   * @param {Object} playerInventory - 플레이어 인벤토리
   * @returns {Object} 구매 결과
   */
  purchaseSweepTickets(count, playerInventory) {
    const gemCost = count * 10; // 소탕권 1장 = 10보석
    
    if (!playerInventory || playerInventory.gems < gemCost) {
      return {
        success: false,
        error: 'INSUFFICIENT_GEMS',
        message: `보석이 부족합니다. (필요: ${gemCost}, 보유: ${playerInventory?.gems || 0})`,
      };
    }
    
    playerInventory.gems -= gemCost;
    this.sweepTickets += count;
    
    return {
      success: true,
      purchased: count,
      gemsSpent: gemCost,
      totalTickets: this.sweepTickets,
    };
  }

  /**
   * 스테이지 진행도 조회
   * @param {string} stageId - 스테이지 ID
   * @returns {Object|null} 스테이지 진행도
   */
  getStageProgress(stageId) {
    return this.stageProgress.get(stageId) || null;
  }

  /**
   * 소탕 가능한 스테이지 목록 조회
   * @returns {Array} 소탕 가능 스테이지 목록
   */
  getSweepableStages() {
    const sweepable = [];
    
    for (const [stageId, progress] of this.stageProgress.entries()) {
      if (progress.cleared && progress.stars >= SWEEP_CONFIG.REQUIRED_STARS) {
        sweepable.push({
          stageId,
          stars: progress.stars,
          lastClearDate: progress.lastClearDate,
        });
      }
    }
    
    return sweepable.sort((a, b) => a.stageId.localeCompare(b.stageId));
  }

  /**
   * 현재 상태 저장 데이터 반환
   * @returns {Object} 저장용 데이터
   */
  getSaveData() {
    return {
      dailySweepCount: this.dailySweepCount,
      lastResetDate: this.lastResetDate,
      sweepTickets: this.sweepTickets,
      stageProgress: Object.fromEntries(this.stageProgress),
    };
  }

  /**
   * 소탕 시스템 상태 요약 조회
   * @returns {Object} 상태 요약
   */
  getStatus() {
    this._checkDailyReset();
    
    return {
      sweepTickets: this.sweepTickets,
      daily: this.getDailyRemaining(),
      sweepableStageCount: this.getSweepableStages().length,
      config: { ...SWEEP_CONFIG },
    };
  }
}

// 싱글톤 인스턴스
const sweepSystem = new SweepSystem();

// ES6 모듈 export
export { SweepSystem, sweepSystem, SWEEP_CONFIG, STAGE_REWARDS };
export default sweepSystem;

/**
 * EnergySystem.js
 * 에너지 시스템 - 스테이지 입장에 필요한 에너지 관리
 * 
 * ArcaneCollectors v4 - 핵심 게임 시스템
 */
import GameLogger from '../utils/GameLogger.js';

// 에너지 회복 설정
const ENERGY_CONFIG = {
  BASE_MAX_ENERGY: 100,           // 기본 최대 에너지
  ENERGY_PER_LEVEL: 2,            // 레벨당 추가 에너지
  RECOVERY_INTERVAL_MINUTES: 5,   // 에너지 회복 간격 (분)
  RECOVERY_AMOUNT: 1,             // 회복당 에너지량
  GEM_CHARGE_COST: 50,            // 보석 충전 비용
  GEM_CHARGE_AMOUNT: 50,          // 보석 충전 에너지량
};

// 스테이지 타입별 에너지 비용
const STAGE_COSTS = {
  NORMAL: 6,
  ELITE: 12,
  BOSS: 20,
};

class EnergySystem {
  constructor() {
    this.currentEnergy = 0;
    this.lastRecoveryTime = Date.now();
    this.playerLevel = 1;
  }

  /**
   * 초기화
   * @param {Object} savedData - 저장된 에너지 데이터
   */
  initialize(savedData = null) {
    if (savedData) {
      this.currentEnergy = savedData.currentEnergy || 0;
      this.lastRecoveryTime = savedData.lastRecoveryTime || Date.now();
      this.playerLevel = savedData.playerLevel || 1;
      // 저장 이후 시간 경과에 따른 회복 적용
      this._applyTimeBasedRecovery();
    } else {
      // 새 게임 - 최대 에너지로 시작
      this.currentEnergy = this.getMaxEnergy(1);
      this.lastRecoveryTime = Date.now();
      this.playerLevel = 1;
    }
  }

  /**
   * 최대 에너지 계산
   * @param {number} playerLevel - 플레이어 레벨
   * @returns {number} 최대 에너지
   */
  getMaxEnergy(playerLevel) {
    return ENERGY_CONFIG.BASE_MAX_ENERGY + (playerLevel * ENERGY_CONFIG.ENERGY_PER_LEVEL);
  }

  /**
   * 현재 에너지 조회 (시간 경과 회복 포함)
   * @returns {number} 현재 에너지
   */
  getCurrentEnergy() {
    this._applyTimeBasedRecovery();
    return this.currentEnergy;
  }

  /**
   * 시간 경과에 따른 에너지 회복 적용
   * @private
   */
  _applyTimeBasedRecovery() {
    const now = Date.now();
    const elapsedMinutes = Math.floor((now - this.lastRecoveryTime) / (60 * 1000));
    const recoveryIntervals = Math.floor(elapsedMinutes / ENERGY_CONFIG.RECOVERY_INTERVAL_MINUTES);
    
    if (recoveryIntervals > 0) {
      const maxEnergy = this.getMaxEnergy(this.playerLevel);
      const recoveryAmount = recoveryIntervals * ENERGY_CONFIG.RECOVERY_AMOUNT;
      
      this.currentEnergy = Math.min(maxEnergy, this.currentEnergy + recoveryAmount);
      this.lastRecoveryTime = now - ((elapsedMinutes % ENERGY_CONFIG.RECOVERY_INTERVAL_MINUTES) * 60 * 1000);
    }
  }

  /**
   * 에너지 소모
   * @param {number} amount - 소모할 에너지량
   * @returns {Object} 결과 { success, currentEnergy, consumed }
   */
  consumeEnergy(amount) {
    this._applyTimeBasedRecovery();
    
    if (amount <= 0) {
      return {
        success: false,
        error: 'INVALID_AMOUNT',
        message: '소모 에너지는 0보다 커야 합니다.',
        currentEnergy: this.currentEnergy,
        consumed: 0,
      };
    }
    
    if (this.currentEnergy < amount) {
      return {
        success: false,
        error: 'INSUFFICIENT_ENERGY',
        message: `에너지가 부족합니다. (필요: ${amount}, 보유: ${this.currentEnergy})`,
        currentEnergy: this.currentEnergy,
        consumed: 0,
      };
    }
    
    const before = this.currentEnergy;
    this.currentEnergy -= amount;
    GameLogger.log('ENERGY', `에너지 소모: ${before} → ${this.currentEnergy}`, { consumed: amount, max: this.getMaxEnergy(this.playerLevel) });

    return {
      success: true,
      currentEnergy: this.currentEnergy,
      consumed: amount,
    };
  }

  /**
   * 스테이지 타입별 에너지 비용 조회
   * @param {string} stageType - 스테이지 타입 (NORMAL, ELITE, BOSS)
   * @returns {number} 에너지 비용
   */
  getStageCost(stageType) {
    const cost = STAGE_COSTS[stageType.toUpperCase()];
    if (cost === undefined) {
      throw new Error(`알 수 없는 스테이지 타입: ${stageType}`);
    }
    return cost;
  }

  /**
   * 스테이지 입장 가능 여부 확인
   * @param {string} stageType - 스테이지 타입
   * @returns {Object} 결과 { canEnter, cost, currentEnergy, shortage }
   */
  canEnterStage(stageType) {
    this._applyTimeBasedRecovery();
    
    const cost = this.getStageCost(stageType);
    const canEnter = this.currentEnergy >= cost;
    
    return {
      canEnter,
      cost,
      currentEnergy: this.currentEnergy,
      shortage: canEnter ? 0 : cost - this.currentEnergy,
    };
  }

  /**
   * 보석으로 에너지 충전
   * @param {Object} playerInventory - 플레이어 인벤토리 (gems 속성 필요)
   * @returns {Object} 결과 { success, energyGained, gemsSpent, currentEnergy }
   */
  chargeWithGems(playerInventory) {
    this._applyTimeBasedRecovery();
    
    const gemCost = ENERGY_CONFIG.GEM_CHARGE_COST;
    const chargeAmount = ENERGY_CONFIG.GEM_CHARGE_AMOUNT;
    const maxEnergy = this.getMaxEnergy(this.playerLevel);
    
    if (!playerInventory || playerInventory.gems < gemCost) {
      return {
        success: false,
        error: 'INSUFFICIENT_GEMS',
        message: `보석이 부족합니다. (필요: ${gemCost}, 보유: ${playerInventory?.gems || 0})`,
        energyGained: 0,
        gemsSpent: 0,
        currentEnergy: this.currentEnergy,
      };
    }
    
    // 보석 차감
    playerInventory.gems -= gemCost;
    
    // 에너지 충전 (최대치 초과 가능)
    const previousEnergy = this.currentEnergy;
    this.currentEnergy = Math.min(this.currentEnergy + chargeAmount, maxEnergy * 2); // 최대 200%까지
    const actualGain = this.currentEnergy - previousEnergy;
    
    return {
      success: true,
      energyGained: actualGain,
      gemsSpent: gemCost,
      currentEnergy: this.currentEnergy,
      maxEnergy,
    };
  }

  /**
   * 레벨업 시 에너지 전량 회복
   * @param {number} newLevel - 새로운 레벨
   * @returns {Object} 결과 { previousLevel, newLevel, previousEnergy, newEnergy, maxEnergy }
   */
  onLevelUp(newLevel) {
    const previousLevel = this.playerLevel;
    const previousEnergy = this.currentEnergy;
    
    this.playerLevel = newLevel;
    const newMaxEnergy = this.getMaxEnergy(newLevel);
    this.currentEnergy = newMaxEnergy; // 전량 회복
    this.lastRecoveryTime = Date.now();
    
    return {
      previousLevel,
      newLevel,
      previousEnergy,
      newEnergy: this.currentEnergy,
      maxEnergy: newMaxEnergy,
    };
  }

  /**
   * 다음 회복까지 남은 시간 조회
   * @returns {Object} { secondsRemaining, nextRecoveryAmount, isFull }
   */
  getTimeToNextRecovery() {
    this._applyTimeBasedRecovery();
    
    const maxEnergy = this.getMaxEnergy(this.playerLevel);
    
    if (this.currentEnergy >= maxEnergy) {
      return {
        secondsRemaining: 0,
        nextRecoveryAmount: 0,
        isFull: true,
      };
    }
    
    const now = Date.now();
    const elapsedMs = now - this.lastRecoveryTime;
    const intervalMs = ENERGY_CONFIG.RECOVERY_INTERVAL_MINUTES * 60 * 1000;
    const remainingMs = intervalMs - (elapsedMs % intervalMs);
    
    return {
      secondsRemaining: Math.ceil(remainingMs / 1000),
      nextRecoveryAmount: ENERGY_CONFIG.RECOVERY_AMOUNT,
      isFull: false,
    };
  }

  /**
   * 에너지 직접 추가 (이벤트 보상 등)
   * @param {number} amount - 추가할 에너지량
   * @returns {Object} 결과 { success, added, currentEnergy }
   */
  addEnergy(amount) {
    if (amount <= 0) {
      return {
        success: false,
        error: 'INVALID_AMOUNT',
        message: '추가 에너지는 0보다 커야 합니다.',
        added: 0,
        currentEnergy: this.currentEnergy,
      };
    }
    
    const maxEnergy = this.getMaxEnergy(this.playerLevel);
    const previousEnergy = this.currentEnergy;
    
    // 보상 에너지는 최대치의 200%까지 가능
    this.currentEnergy = Math.min(this.currentEnergy + amount, maxEnergy * 2);
    const actualAdded = this.currentEnergy - previousEnergy;
    GameLogger.log('ENERGY', `에너지 추가: ${previousEnergy} → ${this.currentEnergy}`, { added: actualAdded, max: maxEnergy });

    return {
      success: true,
      added: actualAdded,
      currentEnergy: this.currentEnergy,
      maxEnergy,
    };
  }

  /**
   * 현재 상태 저장 데이터 반환
   * @returns {Object} 저장용 데이터
   */
  getSaveData() {
    return {
      currentEnergy: this.currentEnergy,
      lastRecoveryTime: this.lastRecoveryTime,
      playerLevel: this.playerLevel,
    };
  }

  /**
   * 에너지 상태 요약 조회
   * @returns {Object} 상태 요약
   */
  getStatus() {
    this._applyTimeBasedRecovery();
    
    const maxEnergy = this.getMaxEnergy(this.playerLevel);
    const timeToNext = this.getTimeToNextRecovery();
    
    return {
      current: this.currentEnergy,
      max: maxEnergy,
      percentage: Math.round((this.currentEnergy / maxEnergy) * 100),
      playerLevel: this.playerLevel,
      recoveryInfo: timeToNext,
      stageCosts: { ...STAGE_COSTS },
    };
  }
}

// 싱글톤 인스턴스
const energySystem = new EnergySystem();

// ES6 모듈 export
export { EnergySystem, energySystem, ENERGY_CONFIG, STAGE_COSTS };
export default energySystem;

/**
 * TowerSystem - 무한의 탑 시스템
 * 로그라이크 스타일 층 기반 컨텐츠 관리
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import towerData from '../data/tower.json';

/**
 * 무한의 탑 관련 이벤트
 */
export const TowerEvents = {
  FLOOR_CLEARED: 'tower_floor_cleared',
  FLOOR_FAILED: 'tower_floor_failed',
  TOWER_RESET: 'tower_reset',
  BOSS_FLOOR_REACHED: 'boss_floor_reached',
  NEW_HIGH_FLOOR: 'new_high_floor'
};

export class TowerSystem {
  // 탑 기본 설정
  static MAX_FLOOR = towerData.config.maxFloor;
  static BOSS_FLOORS = towerData.config.bossFloors;
  static RESET_TYPE = towerData.config.resetType;

  // 층당 스케일링
  static DIFFICULTY_SCALING = 0.05; // 층당 5% 증가
  static REWARD_SCALING = 0.03; // 층당 3% 보상 증가

  /**
   * 층 정보 가져오기
   * @param {number} floor 층 번호
   * @returns {Object} 층 정보 (적, 보스 여부, 보상 등)
   */
  static getFloorInfo(floor) {
    if (floor < 1 || floor > this.MAX_FLOOR) {
      return null;
    }

    // 데이터에서 해당 층 정보 찾기
    const floorData = towerData.floors.find(f => f.floor === floor);

    // 보스 층 여부
    const isBoss = this.BOSS_FLOORS.includes(floor);

    // 기본 층 정보 생성 (데이터 없는 층의 경우)
    if (!floorData) {
      return this._generateFloorInfo(floor, isBoss);
    }

    return {
      floor,
      enemies: floorData.enemies,
      isBoss,
      difficulty: this.calculateDifficulty(floor),
      rewards: this.calculateRewards(floor),
      bossReward: floorData.bossReward || null
    };
  }

  /**
   * 층 정보 자동 생성 (데이터에 없는 층)
   * @private
   */
  static _generateFloorInfo(floor, isBoss) {
    // 일반 적 목록
    const normalEnemies = ['enemy_goblin', 'enemy_wolf', 'enemy_slime', 'enemy_mushroom'];
    const eliteEnemies = ['enemy_goblin_shaman', 'enemy_goblin_warrior', 'enemy_wolf_alpha', 'enemy_slime_large', 'enemy_treant'];
    const bossEnemies = ['enemy_goblin_king'];

    let enemies = [];

    if (isBoss) {
      // 보스 층: 보스 1마리
      const bossIndex = Math.floor(floor / 10) % bossEnemies.length;
      enemies = [{ id: bossEnemies[bossIndex] || bossEnemies[0], count: 1 }];
    } else if (floor % 5 === 0) {
      // 5층마다 엘리트 층
      const eliteIndex = Math.floor(floor / 5) % eliteEnemies.length;
      enemies = [{ id: eliteEnemies[eliteIndex], count: 2 }];
    } else {
      // 일반 층
      const enemyCount = 2 + Math.floor(floor / 20);
      const normalIndex = floor % normalEnemies.length;
      enemies = [{ id: normalEnemies[normalIndex], count: Math.min(enemyCount, 5) }];
    }

    return {
      floor,
      enemies,
      isBoss,
      difficulty: this.calculateDifficulty(floor),
      rewards: this.calculateRewards(floor),
      bossReward: isBoss ? this._generateBossReward(floor) : null
    };
  }

  /**
   * 보스 보상 생성
   * @private
   */
  static _generateBossReward(floor) {
    const bossLevel = floor / 10;
    return {
      gems: 30 + (bossLevel * 20),
      srTicket: bossLevel >= 5 ? 1 : 0,
      ssrTicket: bossLevel >= 10 ? 1 : 0
    };
  }

  /**
   * 층 클리어 처리
   * @param {number} floor 클리어한 층
   * @param {Object} result 전투 결과
   * @returns {Object} 클리어 결과 및 보상
   */
  static clearFloor(floor, result) {
    const towerProgress = this.getProgress();
    const floorInfo = this.getFloorInfo(floor);

    if (!floorInfo) {
      return { success: false, error: '유효하지 않은 층입니다' };
    }

    // 전투 실패 시
    if (!result.victory) {
      EventBus.emit(TowerEvents.FLOOR_FAILED, { floor, result });
      return {
        success: false,
        floor,
        message: `${floor}층 도전 실패`
      };
    }

    // 보상 지급
    const rewards = this._grantRewards(floor, floorInfo);

    // 최고 층 갱신
    let newHighFloor = false;
    if (floor > towerProgress.highestFloor) {
      this._updateHighestFloor(floor);
      newHighFloor = true;
      EventBus.emit(TowerEvents.NEW_HIGH_FLOOR, { floor, previousHigh: towerProgress.highestFloor });
    }

    // 현재 층 업데이트
    this._updateCurrentFloor(floor + 1);

    // 이벤트 발생
    EventBus.emit(TowerEvents.FLOOR_CLEARED, {
      floor,
      rewards,
      isBoss: floorInfo.isBoss,
      newHighFloor
    });

    // 보스 층 클리어 시 추가 이벤트
    if (floorInfo.isBoss) {
      EventBus.emit(GameEvents.ACHIEVEMENT_UNLOCKED, {
        type: 'tower_boss',
        floor
      });
    }

    return {
      success: true,
      floor,
      rewards,
      nextFloor: floor + 1,
      newHighFloor,
      isBossCleared: floorInfo.isBoss
    };
  }

  /**
   * 보상 지급
   * @private
   */
  static _grantRewards(floor, floorInfo) {
    const rewards = { ...floorInfo.rewards };

    // 기본 보상 지급
    if (rewards.gold > 0) {
      SaveManager.addGold(rewards.gold);
    }
    if (rewards.exp > 0) {
      // 경험치는 파티 캐릭터에게 분배 (SaveManager에 메서드 필요)
      rewards.expGranted = rewards.exp;
    }

    // 장비 드롭 확률 체크
    if (rewards.equipmentChance && Math.random() < rewards.equipmentChance) {
      rewards.equipmentDropped = true;
      // TODO: 장비 생성 및 지급
    }

    // 보스 보상 지급
    if (floorInfo.bossReward) {
      const bossReward = floorInfo.bossReward;
      if (bossReward.gems > 0) {
        SaveManager.addGems(bossReward.gems);
        rewards.gems = bossReward.gems;
      }
      if (bossReward.srTicket > 0) {
        SaveManager.addSummonTickets(bossReward.srTicket);
        rewards.srTicket = bossReward.srTicket;
      }
      if (bossReward.ssrTicket > 0) {
        // SSR 티켓은 별도 처리 필요
        rewards.ssrTicket = bossReward.ssrTicket;
      }
    }

    return rewards;
  }

  /**
   * 다음 층으로 이동
   * @returns {Object} 다음 층 정보
   */
  static nextFloor() {
    const progress = this.getProgress();
    const nextFloorNum = progress.currentFloor;

    // 최대 층 초과 체크
    if (nextFloorNum > this.MAX_FLOOR) {
      return {
        success: false,
        error: '최고 층에 도달했습니다'
      };
    }

    const nextFloorInfo = this.getFloorInfo(nextFloorNum);

    // 보스 층 진입 시 이벤트
    if (nextFloorInfo.isBoss) {
      EventBus.emit(TowerEvents.BOSS_FLOOR_REACHED, { floor: nextFloorNum });
    }

    return {
      success: true,
      floorInfo: nextFloorInfo
    };
  }

  /**
   * 층별 난이도 계산
   * @param {number} floor 층 번호
   * @returns {number} 난이도 배율
   */
  static calculateDifficulty(floor) {
    const base = 1.0;
    const scaling = this.DIFFICULTY_SCALING;

    // 기본 스케일링
    let difficulty = base + (floor - 1) * scaling;

    // 보스 층은 추가 난이도
    if (this.BOSS_FLOORS.includes(floor)) {
      difficulty *= 1.5;
    }

    // 10층마다 추가 난이도 점프
    difficulty += Math.floor(floor / 10) * 0.1;

    return Math.round(difficulty * 100) / 100;
  }

  /**
   * 층별 권장 전투력 계산
   * @param {number} floor 층 번호
   * @returns {number} 권장 전투력
   */
  static getRecommendedPower(floor) {
    const basePower = 1000;
    const difficulty = this.calculateDifficulty(floor);
    return Math.floor(basePower * difficulty);
  }

  /**
   * 보상 계산
   * @param {number} floor 층 번호
   * @returns {Object} 보상 정보
   */
  static calculateRewards(floor) {
    // 구간별 기본 보상 찾기
    const rewardTier = this._getRewardTier(floor);
    const baseRewards = towerData.rewards[rewardTier];

    if (!baseRewards) {
      return {
        gold: 500 * floor,
        exp: 250 * floor,
        equipmentChance: 0
      };
    }

    // 스케일링 적용
    const floorBonus = 1 + (floor - 1) * this.REWARD_SCALING;

    return {
      gold: Math.floor(baseRewards.gold * floorBonus),
      exp: Math.floor(baseRewards.exp * floorBonus),
      equipmentChance: baseRewards.equipmentChance || 0
    };
  }

  /**
   * 층에 해당하는 보상 구간 찾기
   * @private
   */
  static _getRewardTier(floor) {
    if (floor <= 10) return '1-10';
    if (floor <= 30) return '11-30';
    if (floor <= 50) return '31-50';
    if (floor <= 70) return '51-70';
    return '71-100';
  }

  /**
   * 진행도 저장
   */
  static saveProgress() {
    const data = SaveManager.load();
    if (!data.tower) {
      data.tower = {
        currentFloor: 1,
        highestFloor: 0,
        lastResetDate: null,
        totalClears: 0,
        bossClears: {}
      };
    }
    SaveManager.save(data);
  }

  /**
   * 진행도 로드
   * @returns {Object} 탑 진행 정보
   */
  static loadProgress() {
    return this.getProgress();
  }

  /**
   * 진행 상황 조회
   * @returns {Object} 탑 진행 정보
   */
  static getProgress() {
    const data = SaveManager.load();

    if (!data.tower) {
      data.tower = {
        currentFloor: 1,
        highestFloor: 0,
        lastResetDate: null,
        totalClears: 0,
        bossClears: {}
      };
      SaveManager.save(data);
    }

    return {
      currentFloor: data.tower.currentFloor,
      highestFloor: data.tower.highestFloor,
      maxFloor: this.MAX_FLOOR,
      totalClears: data.tower.totalClears,
      bossClears: data.tower.bossClears,
      lastResetDate: data.tower.lastResetDate,
      nextBossFloor: this._getNextBossFloor(data.tower.currentFloor)
    };
  }

  /**
   * 다음 보스 층 찾기
   * @private
   */
  static _getNextBossFloor(currentFloor) {
    for (const bossFloor of this.BOSS_FLOORS) {
      if (bossFloor >= currentFloor) {
        return bossFloor;
      }
    }
    return null;
  }

  /**
   * 현재 층 업데이트
   * @private
   */
  static _updateCurrentFloor(floor) {
    const data = SaveManager.load();
    if (!data.tower) {
      data.tower = { currentFloor: 1, highestFloor: 0 };
    }
    data.tower.currentFloor = Math.min(floor, this.MAX_FLOOR + 1);
    data.tower.totalClears = (data.tower.totalClears || 0) + 1;
    SaveManager.save(data);
  }

  /**
   * 최고 층 업데이트
   * @private
   */
  static _updateHighestFloor(floor) {
    const data = SaveManager.load();
    if (!data.tower) {
      data.tower = { currentFloor: 1, highestFloor: 0 };
    }
    data.tower.highestFloor = floor;

    // 보스 클리어 기록
    if (this.BOSS_FLOORS.includes(floor)) {
      if (!data.tower.bossClears) {
        data.tower.bossClears = {};
      }
      data.tower.bossClears[floor] = Date.now();
    }

    SaveManager.save(data);
  }

  /**
   * 탑 리셋 (월간)
   */
  static resetTower() {
    const data = SaveManager.load();

    // 리셋 보상 계산 (최고 층 기준)
    const highestFloor = data.tower?.highestFloor || 0;
    const resetRewards = this._calculateResetRewards(highestFloor);

    // 보상 지급
    if (resetRewards.gems > 0) {
      SaveManager.addGems(resetRewards.gems);
    }

    // 진행도 초기화
    data.tower = {
      currentFloor: 1,
      highestFloor: 0,
      lastResetDate: Date.now(),
      totalClears: 0,
      bossClears: {}
    };
    SaveManager.save(data);

    EventBus.emit(TowerEvents.TOWER_RESET, {
      previousHighest: highestFloor,
      rewards: resetRewards
    });

    return {
      success: true,
      previousHighest: highestFloor,
      rewards: resetRewards
    };
  }

  /**
   * 리셋 보상 계산
   * @private
   */
  static _calculateResetRewards(highestFloor) {
    // 최고 층 기준 젬 보상
    const gemsPerFloor = 5;
    const bonusGems = Math.floor(highestFloor / 10) * 50; // 10층마다 보너스

    return {
      gems: highestFloor * gemsPerFloor + bonusGems,
      message: `${highestFloor}층 달성 보상`
    };
  }

  /**
   * 특정 층으로 이동 (디버그/스킵 티켓용)
   * @param {number} targetFloor 목표 층
   * @returns {Object} 결과
   */
  static jumpToFloor(targetFloor) {
    const progress = this.getProgress();

    // 이미 클리어한 층까지만 스킵 가능
    if (targetFloor > progress.highestFloor) {
      return {
        success: false,
        error: '아직 도달하지 않은 층입니다'
      };
    }

    if (targetFloor < 1 || targetFloor > this.MAX_FLOOR) {
      return {
        success: false,
        error: '유효하지 않은 층입니다'
      };
    }

    const data = SaveManager.load();
    data.tower.currentFloor = targetFloor;
    SaveManager.save(data);

    return {
      success: true,
      newFloor: targetFloor,
      floorInfo: this.getFloorInfo(targetFloor)
    };
  }

  /**
   * 탑 상태 요약 조회
   * @returns {Object} 상태 요약
   */
  static getSummary() {
    const progress = this.getProgress();
    const currentFloorInfo = this.getFloorInfo(progress.currentFloor);

    return {
      currentFloor: progress.currentFloor,
      highestFloor: progress.highestFloor,
      progressPercent: Math.floor((progress.highestFloor / this.MAX_FLOOR) * 100),
      recommendedPower: this.getRecommendedPower(progress.currentFloor),
      nextBossFloor: progress.nextBossFloor,
      floorsUntilBoss: progress.nextBossFloor ? progress.nextBossFloor - progress.currentFloor : null,
      currentFloorInfo,
      canContinue: progress.currentFloor <= this.MAX_FLOOR
    };
  }
}

// 싱글톤 인스턴스 (선택적 사용)
export const towerSystem = TowerSystem;

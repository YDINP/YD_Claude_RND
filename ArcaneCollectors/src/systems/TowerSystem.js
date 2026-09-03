/**
 * TowerSystem - 무한의 탑 시스템
 * 로그라이크 스타일 층 기반 컨텐츠 관리
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import { ProgressionSystem } from './ProgressionSystem.js';
import { supabase, isOnline } from '../api/supabaseClient.js';
import towerData from '../data/tower.json';

/**
 * 시즌 기준 시간대 오프셋(분). 한국 표준시 UTC+9 기준으로 월이 바뀐다.
 * 예) 2026-03-01 00:00 KST = 2026-02-28 15:00 UTC 부터 '2026-03' 시즌
 */
const SEASON_TZ_OFFSET_MINUTES = 9 * 60;

/** 시즌 오프셋 밀리초 */
const SEASON_TZ_OFFSET_MS = SEASON_TZ_OFFSET_MINUTES * 60 * 1000;

/** 하루 밀리초 */
const DAY_MS = 24 * 60 * 60 * 1000;

/** 시즌 순위 localStorage 폴백 캐시 키 (PvP 캐시와 동일 패턴) */
const TOWER_SEASON_CACHE_KEY = 'arcane_collectors_tower_season_cache';

/** 시즌 리더보드 기본 조회 수 */
const SEASON_LEADERBOARD_LIMIT = 20;

/** 세이브에 보관할 과거 시즌 기록 최대 개수 */
const SEASON_HISTORY_LIMIT = 24;

/** Supabase 시즌 기록 테이블 / 순위 뷰 */
const SEASON_TABLE = 'tower_season_records';
const SEASON_RANK_VIEW = 'tower_season_rankings';

/** 기록이 없는 플레이어 기본 이름 */
const DEFAULT_PLAYER_NAME = '모험가';

/**
 * 무한의 탑 관련 이벤트
 */
export const TowerEvents = {
  FLOOR_CLEARED: 'tower_floor_cleared',
  FLOOR_FAILED: 'tower_floor_failed',
  TOWER_RESET: 'tower_reset',
  BOSS_FLOOR_REACHED: 'boss_floor_reached',
  NEW_HIGH_FLOOR: 'new_high_floor',
  SEASON_RESET: 'tower_season_reset'
};

export class TowerSystem {
  // 탑 기본 설정
  static MAX_FLOOR = towerData.config.maxFloor;
  static BOSS_FLOORS = towerData.config.bossFloors;
  static RESET_TYPE = towerData.config.resetType;

  // 시즌 설정 (TOWER-03)
  static SEASON_TZ_OFFSET_MINUTES = SEASON_TZ_OFFSET_MINUTES;
  static SEASON_LEADERBOARD_LIMIT = SEASON_LEADERBOARD_LIMIT;
  static SEASON_HISTORY_LIMIT = SEASON_HISTORY_LIMIT;

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
      recommendedPower: typeof floorData.recommendedPower === 'number'
        ? floorData.recommendedPower
        : this.getRecommendedPower(floor),
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
      recommendedPower: this.getRecommendedPower(floor),
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
    rewards.worldTreeSeeds = 0;

    // 최고 층 갱신
    let newHighFloor = false;
    if (floor > towerProgress.highestFloor) {
      this._updateHighestFloor(floor);
      newHighFloor = true;
      EventBus.emit(TowerEvents.NEW_HIGH_FLOOR, { floor, previousHigh: towerProgress.highestFloor });

      // COLL-02: 20층 이상 신기록 클리어 시 세계수의 씨앗 1개 지급 (재클리어는 미지급)
      if (floor >= 20) {
        SaveManager.addWorldTreeSeeds(1);
        rewards.worldTreeSeeds = 1;
      }
    }

    // 시즌 최고층 갱신 (수동 리셋으로 highestFloor 가 0 이 된 뒤에도 시즌 기록은 이어진다)
    const seasonUpdate = this._updateSeasonRecord(floor);

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
      isBossCleared: floorInfo.isBoss,
      season: seasonUpdate
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
   * tower.json에 권장 전투력이 정의되어 있으면 그 값 사용,
   * 없으면 1층 ~500 → 최고층 ~25000 선형 곡선으로 산출 (PRD §5.2)
   * @param {number} floor 층 번호
   * @returns {number} 권장 전투력
   */
  static getRecommendedPower(floor) {
    const floorData = towerData.floors.find(f => f.floor === floor);
    if (floorData && typeof floorData.recommendedPower === 'number') {
      return floorData.recommendedPower;
    }

    const basePower = 500;
    const maxPower = 25000;
    const step = (maxPower - basePower) / Math.max(1, this.MAX_FLOOR - 1);
    return Math.floor(basePower + (floor - 1) * step);
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
        equipmentChance: 0,
        shardRarity: null
      };
    }

    // 스케일링 적용
    const floorBonus = 1 + (floor - 1) * this.REWARD_SCALING;

    return {
      gold: Math.floor(baseRewards.gold * floorBonus),
      exp: Math.floor(baseRewards.exp * floorBonus),
      equipmentChance: baseRewards.equipmentChance || 0,
      shardRarity: baseRewards.shardRarity || null
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
    // TOWER-03: 첫 조회 시점에 시즌 경계를 확인하고, 월이 바뀌었으면 자동 리셋한다
    this.ensureSeason();

    const data = SaveManager.load();

    if (!data.tower) {
      data.tower = this._defaultTowerRecord();
      SaveManager.save(data);
    }

    const season = data.tower.season || this._defaultSeasonRecord(this.getSeasonId());

    return {
      currentFloor: data.tower.currentFloor,
      highestFloor: data.tower.highestFloor,
      maxFloor: this.MAX_FLOOR,
      totalClears: data.tower.totalClears,
      bossClears: data.tower.bossClears,
      lastResetDate: data.tower.lastResetDate,
      nextBossFloor: this._getNextBossFloor(data.tower.currentFloor),
      season: { ...season },
      seasonHistory: Array.isArray(data.tower.seasonHistory) ? data.tower.seasonHistory : [],
      bestFloorAllTime: data.tower.bestFloorAllTime || data.tower.highestFloor || 0
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

    // 시즌 기록은 진행도 초기화와 무관하게 보존한다 (TOWER-03)
    const preservedSeason = data.tower?.season || null;
    const preservedHistory = Array.isArray(data.tower?.seasonHistory) ? data.tower.seasonHistory : [];
    const preservedBestAllTime = Math.max(data.tower?.bestFloorAllTime || 0, highestFloor);

    // 진행도 초기화
    data.tower = {
      currentFloor: 1,
      highestFloor: 0,
      lastResetDate: Date.now(),
      totalClears: 0,
      bossClears: {},
      season: preservedSeason,
      seasonHistory: preservedHistory,
      bestFloorAllTime: preservedBestAllTime
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
   * 층 정보({id,count} 적 구성)를 BattleScene이 소비하는 stage.enemies({id,level} 배열) 형태로 변환
   * TowerScene / TowerPopup 양쪽의 전투 진입 로직에서 공유하는 순수 함수 (TOWER_AUDIT B-6)
   * @param {number} floor 층 번호
   * @param {Object} floorInfo TowerSystem.getFloorInfo(floor) 결과
   * @returns {Object} { id, name, enemies } 형태의 stage 객체
   */
  static buildStageForFloor(floor, floorInfo) {
    const enemyLevel = Math.min(10, Math.max(1, Math.floor(floor / 10)));
    const stageEnemies = [];
    (floorInfo?.enemies || []).forEach(def => {
      for (let i = 0; i < (def.count || 1); i++) {
        stageEnemies.push({ id: def.id, level: enemyLevel });
      }
    });

    return {
      id: `tower_floor_${floor}`,
      name: `무한의 탑 ${floor}층`,
      enemies: stageEnemies
    };
  }


  // ═══════════════════════════════════════════════════════════
  // TOWER-03: 월간 시즌 (UTC+9 기준 YYYY-MM) + 순위
  // ═══════════════════════════════════════════════════════════

  /**
   * 기본 탑 레코드 (시즌 필드 포함)
   * @private
   */
  static _defaultTowerRecord(seasonId = null) {
    return {
      currentFloor: 1,
      highestFloor: 0,
      lastResetDate: null,
      totalClears: 0,
      bossClears: {},
      season: this._defaultSeasonRecord(seasonId || this.getSeasonId()),
      seasonHistory: [],
      bestFloorAllTime: 0
    };
  }

  /**
   * 기본 시즌 레코드
   * @private
   */
  static _defaultSeasonRecord(seasonId) {
    return { id: seasonId, bestFloor: 0, clearedAt: null };
  }

  /**
   * 현재 시즌 ID 계산 — UTC+9(KST) 기준 `YYYY-MM`
   * @param {Date} [now] 기준 시각
   * @returns {string} 예) '2026-09'
   */
  static getSeasonId(now = new Date()) {
    const shifted = new Date(now.getTime() + SEASON_TZ_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * 시즌 구간 정보 — 시작/종료 시각(ms)과 남은 일수
   * 시즌은 KST 매월 1일 00:00 에 시작해 다음 달 1일 00:00 직전에 끝난다.
   * @param {Date} [now] 기준 시각
   * @returns {{id: string, startsAt: number, endsAt: number, daysRemaining: number, msRemaining: number}}
   */
  static getSeasonInfo(now = new Date()) {
    const id = this.getSeasonId(now);
    const [year, month] = id.split('-').map(Number);

    // KST 월초 00:00 을 UTC 타임스탬프로 환산
    const startsAt = Date.UTC(year, month - 1, 1) - SEASON_TZ_OFFSET_MS;
    const endsAt = Date.UTC(year, month, 1) - SEASON_TZ_OFFSET_MS;
    const msRemaining = Math.max(0, endsAt - now.getTime());

    return {
      id,
      startsAt,
      endsAt,
      msRemaining,
      daysRemaining: Math.max(0, Math.ceil(msRemaining / DAY_MS))
    };
  }

  /**
   * 시즌 경계 확인 및 자동 리셋 (첫 로드 시 호출)
   *
   * - `season` 필드가 없는 레거시 세이브: 리셋 없이 현재 시즌으로 마이그레이션
   * - 저장된 시즌 ID != 현재 시즌 ID: 이전 시즌 기록을 보존한 뒤 resetTower() 규칙으로 리셋
   *
   * @param {Date} [now] 기준 시각
   * @returns {{reset: boolean, migrated: boolean, seasonId: string, previousSeason?: Object, rewards?: Object}}
   */
  static ensureSeason(now = new Date()) {
    const currentId = this.getSeasonId(now);
    const data = SaveManager.load();

    if (!data.tower) {
      data.tower = this._defaultTowerRecord(currentId);
      SaveManager.save(data);
      return { reset: false, migrated: true, seasonId: currentId };
    }

    const tower = data.tower;

    // 레거시 세이브 마이그레이션 — 기존 최고층을 현재 시즌 기록으로 승계 (리셋 없음)
    if (!tower.season || !tower.season.id) {
      tower.season = {
        id: currentId,
        bestFloor: tower.highestFloor || 0,
        clearedAt: tower.highestFloor > 0 ? (tower.lastResetDate || null) : null
      };
      if (!Array.isArray(tower.seasonHistory)) tower.seasonHistory = [];
      if (typeof tower.bestFloorAllTime !== 'number') {
        tower.bestFloorAllTime = tower.highestFloor || 0;
      }
      SaveManager.save(data);
      return { reset: false, migrated: true, seasonId: currentId };
    }

    if (tower.season.id === currentId) {
      return { reset: false, migrated: false, seasonId: currentId };
    }

    // ── 월 경계 통과: 시즌 롤오버 ──
    const previous = tower.season;
    const finishedBest = Math.max(previous.bestFloor || 0, tower.highestFloor || 0);
    const archived = {
      id: previous.id,
      bestFloor: finishedBest,
      clearedAt: previous.clearedAt || null
    };

    const history = Array.isArray(tower.seasonHistory) ? tower.seasonHistory : [];
    tower.seasonHistory = [archived, ...history.filter(r => r && r.id !== archived.id)]
      .slice(0, SEASON_HISTORY_LIMIT);
    tower.bestFloorAllTime = Math.max(tower.bestFloorAllTime || 0, finishedBest);
    SaveManager.save(data);

    // 리셋 보상은 기존 resetTower 규칙을 그대로 사용 (진행도 초기화 + 최고층 기준 젬)
    const resetResult = this.resetTower();

    // 새 시즌 개시
    const after = SaveManager.load();
    if (!after.tower) after.tower = this._defaultTowerRecord(currentId);
    after.tower.season = this._defaultSeasonRecord(currentId);
    SaveManager.save(after);

    EventBus.emit(TowerEvents.SEASON_RESET, {
      previousSeason: archived,
      seasonId: currentId,
      rewards: resetResult.rewards
    });

    return {
      reset: true,
      migrated: false,
      seasonId: currentId,
      previousSeason: archived,
      rewards: resetResult.rewards
    };
  }

  /**
   * 시즌 최고층 기록 갱신 (clearFloor 내부에서 호출)
   * @private
   * @param {number} floor 클리어한 층
   * @returns {{id: string, bestFloor: number, clearedAt: number|null, improved: boolean}}
   */
  static _updateSeasonRecord(floor) {
    const currentId = this.getSeasonId();
    const data = SaveManager.load();
    if (!data.tower) data.tower = this._defaultTowerRecord(currentId);
    if (!data.tower.season || !data.tower.season.id) {
      data.tower.season = this._defaultSeasonRecord(currentId);
    }

    const season = data.tower.season;
    const improved = floor > (season.bestFloor || 0);

    if (improved) {
      season.bestFloor = floor;
      season.clearedAt = Date.now();
      data.tower.bestFloorAllTime = Math.max(data.tower.bestFloorAllTime || 0, floor);
      SaveManager.save(data);
    }

    return { ...season, improved };
  }

  /**
   * 현재 시즌 상태 요약 (UI용)
   * @param {Date} [now] 기준 시각
   * @returns {Object} 시즌 ID · 남은 일수 · 내 시즌 최고층 · 역대 최고층 · 지난 시즌 기록
   */
  static getSeasonStatus(now = new Date()) {
    this.ensureSeason(now);

    const info = this.getSeasonInfo(now);
    const data = SaveManager.load();
    const tower = data.tower || {};
    const season = tower.season || this._defaultSeasonRecord(info.id);
    const history = Array.isArray(tower.seasonHistory) ? tower.seasonHistory : [];

    return {
      seasonId: info.id,
      startsAt: info.startsAt,
      endsAt: info.endsAt,
      daysRemaining: info.daysRemaining,
      bestFloor: Math.max(season.bestFloor || 0, tower.highestFloor || 0),
      clearedAt: season.clearedAt || null,
      bestFloorAllTime: tower.bestFloorAllTime || tower.highestFloor || 0,
      previousSeason: history[0] || null,
      history
    };
  }

  /**
   * 현재 파티 전투력 (ProgressionSystem.calculatePower SSOT 사용)
   * @returns {number} 파티 전투력 합
   */
  static getPartyPower() {
    try {
      const data = SaveManager.load();
      const rawParty = (data.parties || [])[0];
      const partyIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
      const characters = data.characters || [];

      return partyIds.reduce((sum, id) => {
        const char = characters.find(c => c && c.id === id);
        if (!char) return sum;
        return sum + ProgressionSystem.calculatePower(char);
      }, 0);
    } catch {
      return 0;
    }
  }

  /**
   * 현재 시즌 기록을 서버에 제출
   * Supabase 실패/오프라인 시 localStorage 캐시로 폴백 (PvPSystem 패턴 동일)
   *
   * @param {Object} [options]
   * @param {number} [options.power] 전투력 직접 지정 (미지정 시 파티 전투력 계산)
   * @param {Date} [options.now] 기준 시각
   * @returns {Promise<{success: boolean, record: Object, offline?: boolean, fallback?: boolean, error?: string}>}
   */
  static async submitSeasonRecord(options = {}) {
    const now = options.now instanceof Date ? options.now : new Date();
    this.ensureSeason(now);

    const data = SaveManager.load();
    const tower = data.tower || {};
    const seasonId = tower.season?.id || this.getSeasonId(now);
    const bestFloor = Math.max(tower.season?.bestFloor || 0, tower.highestFloor || 0);
    const clearedAtMs = tower.season?.clearedAt || null;
    const power = typeof options.power === 'number' ? options.power : this.getPartyPower();

    const record = {
      user_id: SaveManager._userId || null,
      season_id: seasonId,
      player_name: data.player?.name || DEFAULT_PLAYER_NAME,
      best_floor: bestFloor,
      cleared_at: clearedAtMs ? new Date(clearedAtMs).toISOString() : null,
      power
    };

    // 폴백 캐시는 온·오프라인 무관하게 항상 갱신
    this._cacheMyRecord(seasonId, record);

    if (!isOnline() || !supabase) {
      return { success: true, offline: true, record };
    }

    try {
      const { error } = await supabase
        .from(SEASON_TABLE)
        .upsert(record, { onConflict: 'user_id,season_id' });

      if (error) {
        return { success: true, fallback: true, record, error: error.message };
      }
      return { success: true, record };
    } catch (err) {
      return { success: true, fallback: true, record, error: err?.message || String(err) };
    }
  }

  /**
   * 시즌 리더보드 조회 (상위 N명)
   * Supabase 실패/오프라인 시 localStorage 캐시로 폴백
   *
   * @param {string} [seasonId] 시즌 ID (기본: 현재 시즌)
   * @param {number} [limit] 조회 수
   * @returns {Promise<{success: boolean, seasonId: string, rankings: Array, offline?: boolean, fallback?: boolean, error?: string}>}
   */
  static async getSeasonLeaderboard(seasonId = null, limit = SEASON_LEADERBOARD_LIMIT) {
    const targetSeason = seasonId || this.getSeasonId();

    if (!isOnline() || !supabase) {
      return {
        success: true,
        offline: true,
        seasonId: targetSeason,
        rankings: this._localRankings(targetSeason, limit)
      };
    }

    try {
      const { data, error } = await supabase
        .from(SEASON_RANK_VIEW)
        .select('user_id, season_id, player_name, best_floor, cleared_at, power, rank')
        .eq('season_id', targetSeason)
        .order('rank', { ascending: true })
        .limit(limit);

      if (error) {
        return {
          success: true,
          fallback: true,
          seasonId: targetSeason,
          rankings: this._localRankings(targetSeason, limit),
          error: error.message
        };
      }

      const rankings = this.sortSeasonRankings(data || []).slice(0, limit);
      this._cacheRankings(targetSeason, rankings);
      return { success: true, seasonId: targetSeason, rankings };
    } catch (err) {
      return {
        success: true,
        fallback: true,
        seasonId: targetSeason,
        rankings: this._localRankings(targetSeason, limit),
        error: err?.message || String(err)
      };
    }
  }

  /**
   * 내 시즌 순위 조회
   * @param {string} [seasonId] 시즌 ID (기본: 현재 시즌)
   * @returns {Promise<{success: boolean, seasonId: string, rank: number|null, bestFloor: number, offline?: boolean, fallback?: boolean, error?: string}>}
   */
  static async getMyRank(seasonId = null) {
    const targetSeason = seasonId || this.getSeasonId();
    const userId = SaveManager._userId || null;
    const local = this._localMyRank(targetSeason);

    if (!isOnline() || !supabase) {
      return { success: true, offline: true, seasonId: targetSeason, ...local };
    }

    try {
      const { data, error } = await supabase
        .from(SEASON_RANK_VIEW)
        .select('user_id, season_id, player_name, best_floor, cleared_at, power, rank')
        .eq('season_id', targetSeason)
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        return { success: true, fallback: true, seasonId: targetSeason, ...local, error: error.message };
      }

      const row = (data || [])[0] || null;
      if (!row) {
        return { success: true, seasonId: targetSeason, rank: null, bestFloor: local.bestFloor, record: null };
      }

      return {
        success: true,
        seasonId: targetSeason,
        rank: row.rank ?? null,
        bestFloor: row.best_floor || 0,
        record: row
      };
    } catch (err) {
      return {
        success: true,
        fallback: true,
        seasonId: targetSeason,
        ...local,
        error: err?.message || String(err)
      };
    }
  }

  /**
   * 시즌 순위 정렬 규칙 — 최고층 내림차순 → 먼저 도달한 순 → 전투력 내림차순
   * 정렬 후 rank 를 1부터 재부여한다 (완전히 동일한 기록은 같은 순위).
   *
   * @param {Array<Object>} rows 시즌 기록 배열
   * @returns {Array<Object>} rank 가 부여된 정렬 결과
   */
  static sortSeasonRankings(rows) {
    const toTime = (value) => {
      if (!value) return Number.POSITIVE_INFINITY;
      const ms = new Date(value).getTime();
      return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
    };

    const sorted = [...(rows || [])].sort((a, b) => {
      const floorDiff = (b.best_floor || 0) - (a.best_floor || 0);
      if (floorDiff !== 0) return floorDiff;

      const timeDiff = toTime(a.cleared_at) - toTime(b.cleared_at);
      if (timeDiff !== 0) return timeDiff;

      return (b.power || 0) - (a.power || 0);
    });

    let lastRank = 0;
    let lastKey = null;
    return sorted.map((row, index) => {
      const key = `${row.best_floor || 0}|${toTime(row.cleared_at)}|${row.power || 0}`;
      if (key !== lastKey) {
        lastRank = index + 1;
        lastKey = key;
      }
      return { ...row, rank: lastRank };
    });
  }

  // ── localStorage 폴백 캐시 ────────────────────────────────

  /**
   * @private
   * @returns {{mine: Object, leaderboards: Object}}
   */
  static _loadSeasonCache() {
    try {
      const raw = localStorage.getItem(TOWER_SEASON_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        mine: parsed.mine || {},
        leaderboards: parsed.leaderboards || {}
      };
    } catch {
      return { mine: {}, leaderboards: {} };
    }
  }

  /**
   * @private
   */
  static _saveSeasonCache(cache) {
    try {
      localStorage.setItem(TOWER_SEASON_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // 저장 실패는 무시 (폴백 캐시일 뿐 게임 진행에 영향 없음)
    }
  }

  /**
   * @private
   */
  static _cacheMyRecord(seasonId, record) {
    const cache = this._loadSeasonCache();
    cache.mine[seasonId] = record;
    this._saveSeasonCache(cache);
  }

  /**
   * @private
   */
  static _cacheRankings(seasonId, rankings) {
    const cache = this._loadSeasonCache();
    cache.leaderboards[seasonId] = rankings;
    this._saveSeasonCache(cache);
  }

  /**
   * 캐시된 순위 + 내 기록 병합 후 정렬
   * @private
   */
  static _localRankings(seasonId, limit = SEASON_LEADERBOARD_LIMIT) {
    const cache = this._loadSeasonCache();
    const cached = Array.isArray(cache.leaderboards[seasonId]) ? cache.leaderboards[seasonId] : [];
    const mine = cache.mine[seasonId] || null;

    const merged = mine
      ? [mine, ...cached.filter(row => row && row.user_id !== mine.user_id)]
      : cached;

    return this.sortSeasonRankings(merged).slice(0, limit);
  }

  /**
   * @private
   * @returns {{rank: number|null, bestFloor: number, record: Object|null}}
   */
  static _localMyRank(seasonId) {
    const userId = SaveManager._userId || null;
    const rankings = this._localRankings(seasonId, Number.MAX_SAFE_INTEGER);
    const mine = rankings.find(row => row.user_id === userId) || null;

    return {
      rank: mine ? mine.rank : null,
      bestFloor: mine ? (mine.best_floor || 0) : 0,
      record: mine
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
      canContinue: progress.currentFloor <= this.MAX_FLOOR,
      season: progress.season,
      bestFloorAllTime: progress.bestFloorAllTime
    };
  }
}

// 싱글톤 인스턴스 (선택적 사용)
export const towerSystem = TowerSystem;

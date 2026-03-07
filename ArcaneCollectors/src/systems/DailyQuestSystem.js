/**
 * DailyQuestSystem - 일일 퀘스트 시스템 (GDD 기반)
 * 5종 일일 퀘스트 트래킹, 보상 지급, 완주 보너스
 *
 * localStorage 키: 'arcane_daily_quest_state'
 * 갱신 기준: 매일 오전 5시 (05:00)
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';

// ======================================================
// 상수 정의
// ======================================================

const DAILY_QUEST_STORAGE_KEY = 'arcane_daily_quest_state';

/** 일일 초기화 기준 시각 (오전 5시) */
const RESET_HOUR = 5;

/**
 * 5종 일일 퀘스트 정의 (GDD 기반)
 */
const DAILY_QUESTS = [
  {
    id: 'DQ-001',
    name: '신성의 흔적',
    description: '스테이지 3회 클리어',
    goal: { type: 'stage_clear', count: 3 },
    rewards: { energy_gem: 5, gold: 1000 }
  },
  {
    id: 'DQ-002',
    name: '수집가의 소명',
    description: '가챠 1회 이상 시도',
    goal: { type: 'gacha_attempt', count: 1 },
    rewards: { gacha_ticket_free: 1, gold: 500 }
  },
  {
    id: 'DQ-003',
    name: '교단의 시험',
    description: '교단 시너지 파티로 스테이지 클리어 1회',
    goal: { type: 'synergy_clear', count: 1 },
    rewards: { energy_gem: 8, awakening_material: 1 }
  },
  {
    id: 'DQ-004',
    name: '불굴의 수련',
    description: '누적 적 처치 20마리',
    goal: { type: 'kill_count', count: 20 },
    rewards: { exp_potion_small: 3, gold: 1500 }
  },
  {
    id: 'DQ-005',
    name: '심연의 도전',
    description: 'Abyss Tower 5층 도달',
    goal: { type: 'tower_floor', count: 5 },
    rewards: { energy_gem: 15, sr_awakening_material: 1 }
  }
];

/**
 * 5개 모두 완료 시 지급되는 완주 보너스
 */
const COMPLETION_BONUS = {
  gacha_ticket_free: 3,
  cult_material_random: 2,
  gold: 3000
};

/**
 * 이벤트 타입 → 해당 퀘스트 ID 매핑
 */
const EVENT_MAP = {
  stage_clear:    ['DQ-001'],
  gacha_attempt:  ['DQ-002'],
  synergy_clear:  ['DQ-003'],
  kill_count:     ['DQ-004'],
  tower_floor:    ['DQ-005']
};

// ======================================================
// 유틸리티
// ======================================================

/**
 * "오늘"의 기준 날짜 키 반환 (오전 5시 기준)
 * ex) "2026-03-07" — 오전 5시 이전이면 전날 기준
 * @returns {string} YYYY-MM-DD
 */
function getResetDateKey() {
  const now = new Date();
  // 오전 5시 이전이면 전날로 처리
  if (now.getHours() < RESET_HOUR) {
    now.setDate(now.getDate() - 1);
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 기본 퀘스트 진행 상태 객체 생성
 * @returns {Object}
 */
function buildDefaultState() {
  const dateKey = getResetDateKey();
  const quests = {};

  DAILY_QUESTS.forEach(q => {
    quests[q.id] = {
      id:        q.id,
      name:      q.name,
      description: q.description,
      goal:      { ...q.goal },
      rewards:   { ...q.rewards },
      progress:  0,
      completed: false,
      claimed:   false
    };
  });

  return {
    dateKey,
    quests,
    completionBonusClaimed: false
  };
}

// ======================================================
// DailyQuestSystem 클래스
// ======================================================

export class DailyQuestSystem {
  /**
   * @param {Object|null} gameState - 외부 gameState 참조 (선택)
   */
  constructor(gameState = null) {
    this.gameState = gameState;
    this._state = null;
    this.initialize();
  }

  // ====================================================
  // 초기화 / 리셋
  // ====================================================

  /**
   * 초기화: localStorage 로드 후 날짜 갱신 체크
   */
  initialize() {
    this._state = this.load();
    this.resetDailyQuests(); // 날짜가 다르면 자동 초기화
  }

  /**
   * 날짜 체크 후 필요하면 퀘스트 초기화
   * @returns {boolean} 실제로 리셋이 일어났으면 true
   */
  resetDailyQuests() {
    const currentKey = getResetDateKey();

    if (!this._state || this._state.dateKey !== currentKey) {
      this._state = buildDefaultState();
      this.save();

      EventBus.emit(GameEvents.DAILY_QUESTS_RESET, {
        dateKey: currentKey,
        quests:  this.getQuestStatus()
      });

      return true;
    }

    return false;
  }

  // ====================================================
  // 진행 추적
  // ====================================================

  /**
   * 이벤트 타입에 따라 관련 퀘스트 진행도 갱신
   * @param {string} eventType - EVENT_MAP 키 (예: 'stage_clear')
   * @param {number} amount    - 증가량 (기본 1)
   * @returns {string[]} 진행도가 갱신된 퀘스트 ID 배열
   */
  trackProgress(eventType, amount = 1) {
    const affected = EVENT_MAP[eventType] || [];
    const updated = [];

    affected.forEach(questId => {
      const quest = this._state.quests[questId];
      if (!quest || quest.completed) return;

      quest.progress = Math.min(quest.goal.count, quest.progress + amount);

      if (quest.progress >= quest.goal.count) {
        quest.completed = true;

        EventBus.emit(GameEvents.QUEST_COMPLETE, {
          questId,
          questName: quest.name,
          rewards:   quest.rewards
        });
      }

      updated.push(questId);
    });

    if (updated.length > 0) {
      this.save();
    }

    return updated;
  }

  // ====================================================
  // 완료 상태 조회
  // ====================================================

  /**
   * 특정 퀘스트 완료 여부
   * @param {string} questId
   * @returns {boolean}
   */
  checkCompletion(questId) {
    return this._state.quests[questId]?.completed === true;
  }

  /**
   * 5개 퀘스트 모두 완료 여부
   * @returns {boolean}
   */
  isAllQuestsComplete() {
    return DAILY_QUESTS.every(q => this._state.quests[q.id]?.completed === true);
  }

  // ====================================================
  // 보상 수령
  // ====================================================

  /**
   * 단일 퀘스트 보상 수령
   * @param {string} questId
   * @returns {{ success: boolean, rewards?: Object, error?: string }}
   */
  claimReward(questId) {
    const quest = this._state.quests[questId];

    if (!quest) {
      return { success: false, error: '퀘스트를 찾을 수 없습니다' };
    }
    if (!quest.completed) {
      return { success: false, error: '퀘스트가 완료되지 않았습니다' };
    }
    if (quest.claimed) {
      return { success: false, error: '이미 보상을 수령했습니다' };
    }

    this._applyRewards(quest.rewards);

    quest.claimed = true;
    this.save();

    EventBus.emit(GameEvents.QUEST_REWARD_CLAIMED, {
      questId,
      questName: quest.name,
      rewards:   quest.rewards
    });

    return { success: true, questId, questName: quest.name, rewards: quest.rewards };
  }

  /**
   * 수령 가능한 모든 퀘스트 보상 일괄 수령
   * @returns {{ success: boolean, claimedCount: number, totalRewards: Object, error?: string }}
   */
  claimAllRewards() {
    const claimable = DAILY_QUESTS
      .map(q => this._state.quests[q.id])
      .filter(q => q && q.completed && !q.claimed);

    if (claimable.length === 0) {
      return { success: false, claimedCount: 0, totalRewards: {}, error: '수령 가능한 보상이 없습니다' };
    }

    const totalRewards = {};

    claimable.forEach(quest => {
      const result = this.claimReward(quest.id);
      if (result.success) {
        Object.entries(result.rewards).forEach(([key, val]) => {
          totalRewards[key] = (totalRewards[key] || 0) + val;
        });
      }
    });

    return { success: true, claimedCount: claimable.length, totalRewards };
  }

  /**
   * 완주 보너스 수령 (5개 모두 완료 + 미수령 시)
   * @returns {{ success: boolean, rewards?: Object, error?: string }}
   */
  claimCompletionBonus() {
    if (!this.isAllQuestsComplete()) {
      return { success: false, error: '모든 일일 퀘스트를 완료해야 합니다' };
    }
    if (this._state.completionBonusClaimed) {
      return { success: false, error: '완주 보너스를 이미 수령했습니다' };
    }

    this._applyRewards(COMPLETION_BONUS);
    this._state.completionBonusClaimed = true;
    this.save();

    EventBus.emit(GameEvents.QUEST_REWARD_CLAIMED, {
      questId:  'COMPLETION_BONUS',
      questName: '일일 퀘스트 완주 보너스',
      rewards:   COMPLETION_BONUS
    });

    return { success: true, rewards: COMPLETION_BONUS };
  }

  // ====================================================
  // 상태 조회
  // ====================================================

  /**
   * 현재 퀘스트 진행 상태 배열 반환
   * @returns {Array<Object>}
   */
  getQuestStatus() {
    return DAILY_QUESTS.map(template => {
      const q = this._state.quests[template.id];
      return {
        id:            template.id,
        name:          template.name,
        description:   template.description,
        goalType:      template.goal.type,
        goalCount:     template.goal.count,
        progress:      q?.progress ?? 0,
        progressPercent: Math.min(100, Math.floor(((q?.progress ?? 0) / template.goal.count) * 100)),
        completed:     q?.completed ?? false,
        claimed:       q?.claimed ?? false,
        rewards:       template.rewards
      };
    });
  }

  /**
   * 진행 요약 반환
   * @returns {{ completed: number, total: number, claimable: number, allComplete: boolean, completionBonusClaimed: boolean }}
   */
  getProgressSummary() {
    const quests = this.getQuestStatus();
    const total     = quests.length;
    const completed = quests.filter(q => q.completed).length;
    const claimable = quests.filter(q => q.completed && !q.claimed).length;

    return {
      completed,
      total,
      claimable,
      allComplete:            completed === total,
      completionBonusClaimed: this._state.completionBonusClaimed,
      completionBonusClaimable: completed === total && !this._state.completionBonusClaimed
    };
  }

  /**
   * 다음 리셋까지 남은 시간
   * @returns {{ hours: number, minutes: number, seconds: number, formatted: string }}
   */
  getTimeUntilReset() {
    const now  = new Date();
    const next = new Date(now);

    // 오전 5시 기준으로 다음 리셋 시각 계산
    next.setHours(RESET_HOUR, 0, 0, 0);
    if (now >= next) {
      next.setDate(next.getDate() + 1);
    }

    const diff    = next.getTime() - now.getTime();
    const hours   = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return {
      hours,
      minutes,
      seconds,
      formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    };
  }

  // ====================================================
  // 저장 / 로드
  // ====================================================

  /**
   * 진행 상태를 localStorage에 저장
   */
  save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DAILY_QUEST_STORAGE_KEY, JSON.stringify(this._state));
      }
    } catch (e) {
      console.warn('[DailyQuestSystem] 저장 실패:', e);
    }
  }

  /**
   * localStorage에서 진행 상태 로드
   * @returns {Object} 상태 객체
   */
  load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(DAILY_QUEST_STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      }
    } catch (e) {
      console.warn('[DailyQuestSystem] 로드 실패:', e);
    }
    return buildDefaultState();
  }

  // ====================================================
  // 이벤트 핸들러 등록 (GameEvents 연동)
  // ====================================================

  /**
   * 게임 이벤트 버스와 연동
   * 호출 시 STAGE_CLEARED, CHARACTER_ADDED(가챠), UNIT_DIED, BATTLE_END(타워) 이벤트 구독
   */
  registerEventHandlers() {
    // 스테이지 클리어 → DQ-001, 교단 시너지 사용 시 DQ-003
    EventBus.on(GameEvents.STAGE_CLEARED, (data) => {
      this.trackProgress('stage_clear', 1);
      if (data && data.synergyUsed) {
        this.trackProgress('synergy_clear', 1);
      }
    });

    // 가챠 시도 → DQ-002
    EventBus.on(GameEvents.CHARACTER_ADDED, (data) => {
      if (data && data.source === 'gacha') {
        this.trackProgress('gacha_attempt', 1);
      }
    });

    // 적 처치 → DQ-004
    EventBus.on(GameEvents.UNIT_DIED, (data) => {
      if (data && data.isEnemy) {
        this.trackProgress('kill_count', 1);
      }
    });

    // 타워 층 도달 → DQ-005
    EventBus.on(GameEvents.BATTLE_END, (data) => {
      if (data && data.towerFloor && data.outcome === 'victory') {
        this.trackProgress('tower_floor', data.towerFloor);
      }
    });
  }

  // ====================================================
  // 내부 유틸
  // ====================================================

  /**
   * 보상 적용 (SaveManager 연동)
   * @param {Object} rewards
   * @private
   */
  _applyRewards(rewards) {
    if (!rewards) return;

    try {
      const data = SaveManager.load();

      if (rewards.gold) {
        data.resources.gold = (data.resources.gold || 0) + rewards.gold;
      }
      if (rewards.energy_gem) {
        data.resources.gems = (data.resources.gems || 0) + rewards.energy_gem;
      }
      if (rewards.gacha_ticket_free) {
        data.resources.summonTickets = (data.resources.summonTickets || 0) + rewards.gacha_ticket_free;
      }
      if (rewards.exp_potion_small) {
        data.resources.expPotionSmall = (data.resources.expPotionSmall || 0) + rewards.exp_potion_small;
      }
      if (rewards.awakening_material) {
        data.resources.awakeningMaterial = (data.resources.awakeningMaterial || 0) + rewards.awakening_material;
      }
      if (rewards.sr_awakening_material) {
        data.resources.srAwakeningMaterial = (data.resources.srAwakeningMaterial || 0) + rewards.sr_awakening_material;
      }
      if (rewards.cult_material_random) {
        data.resources.cultMaterialRandom = (data.resources.cultMaterialRandom || 0) + rewards.cult_material_random;
      }

      SaveManager.save(data);
    } catch (e) {
      console.warn('[DailyQuestSystem] 보상 적용 실패:', e);
    }
  }
}

// ======================================================
// 싱글톤 인스턴스 (모듈 전체 공유)
// ======================================================
export const dailyQuestSystem = new DailyQuestSystem();

// ======================================================
// 상수 재export (테스트·외부 참조용)
// ======================================================
export { DAILY_QUESTS, COMPLETION_BONUS, EVENT_MAP, DAILY_QUEST_STORAGE_KEY };

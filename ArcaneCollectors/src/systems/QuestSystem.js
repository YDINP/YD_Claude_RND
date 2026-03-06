/**
 * QuestSystem - 퀘스트 시스템
 * 일일 퀘스트, 진행도 추적, 보상 지급
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';

export class QuestSystem {
  // 퀘스트 타입 정의
  static QUEST_TYPES = {
    BATTLE_COUNT: 'battle_count',
    SUMMON_COUNT: 'summon_count',
    ENHANCE_COUNT: 'enhance_count',
    STAGE_CLEAR: 'stage_clear',
    COLLECT_GOLD: 'collect_gold',
    LOGIN: 'login',
    EVOLVE: 'evolve',
    SKILL_ENHANCE: 'skill_enhance'
  };

  // 일일 퀘스트 템플릿
  static DAILY_QUEST_TEMPLATES = [
    {
      id: 'daily_login',
      type: 'login',
      name: '매일 출석',
      description: '게임에 접속하기',
      target: 1,
      rewards: { gems: 50 }
    },
    {
      id: 'daily_battle_3',
      type: 'battle_count',
      name: '전투 3회',
      description: '전투 3회 완료',
      target: 3,
      rewards: { gold: 1000 }
    },
    {
      id: 'daily_battle_10',
      type: 'battle_count',
      name: '전투 10회',
      description: '전투 10회 완료',
      target: 10,
      rewards: { gems: 30, gold: 2000 }
    },
    {
      id: 'daily_summon_1',
      type: 'summon_count',
      name: '소환 1회',
      description: '캐릭터 소환 1회',
      target: 1,
      rewards: { gold: 500 }
    },
    {
      id: 'daily_summon_10',
      type: 'summon_count',
      name: '소환 10회',
      description: '캐릭터 소환 10회',
      target: 10,
      rewards: { gems: 100 }
    },
    {
      id: 'daily_enhance_1',
      type: 'enhance_count',
      name: '강화 1회',
      description: '캐릭터 강화 1회',
      target: 1,
      rewards: { skillBooks: 1 }
    },
    {
      id: 'daily_stage_3star',
      type: 'stage_clear',
      name: '3성 클리어',
      description: '스테이지 3성 클리어 1회',
      target: 1,
      rewards: { gems: 20, gold: 500 }
    },
    {
      id: 'daily_gold_5000',
      type: 'collect_gold',
      name: '골드 수집',
      description: '골드 5000 획득',
      target: 5000,
      rewards: { summonTickets: 1 }
    }
  ];

  // 주간 퀘스트 템플릿 (추후 확장)
  static WEEKLY_QUEST_TEMPLATES = [
    {
      id: 'weekly_battle_50',
      type: 'battle_count',
      name: '주간 전투 50회',
      description: '이번 주 전투 50회 완료',
      target: 50,
      rewards: { gems: 300 }
    },
    {
      id: 'weekly_evolve',
      type: 'evolve',
      name: '캐릭터 각성',
      description: '캐릭터 1회 각성',
      target: 1,
      rewards: { gems: 200, skillBooks: 5 }
    }
  ];

  /**
   * 일일 퀘스트 리셋 체크 및 수행
   */
  static checkAndResetDaily() {
    const data = SaveManager.load();
    const now = new Date();
    const lastReset = data.quests.lastReset ? new Date(data.quests.lastReset) : null;

    // 날짜가 변경되었는지 확인 (자정 기준)
    const shouldReset = !lastReset ||
      now.getDate() !== lastReset.getDate() ||
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear();

    if (shouldReset) {
      this.resetDailyQuests();
      return true;
    }

    return false;
  }

  /**
   * 일일 퀘스트 초기화
   */
  static resetDailyQuests() {
    const data = SaveManager.load();

    // 새 일일 퀘스트 생성
    const dailyQuests = {};
    this.DAILY_QUEST_TEMPLATES.forEach(template => {
      dailyQuests[template.id] = {
        ...template,
        progress: 0,
        completed: false,
        claimed: false
      };
    });

    data.quests.daily = dailyQuests;
    data.quests.dailyProgress = {};
    data.quests.lastReset = Date.now();

    // 로그인 퀘스트 자동 완료
    if (dailyQuests['daily_login']) {
      dailyQuests['daily_login'].progress = 1;
      dailyQuests['daily_login'].completed = true;
    }

    SaveManager.save(data);

    return dailyQuests;
  }

  /**
   * 현재 일일 퀘스트 목록 조회
   * @returns {Array} 퀘스트 목록
   */
  static getDailyQuests() {
    // 리셋 체크 먼저
    this.checkAndResetDaily();

    const data = SaveManager.load();
    const quests = data.quests.daily || {};

    return Object.values(quests).map(quest => ({
      ...quest,
      progressPercent: Math.min(100, Math.floor((quest.progress / quest.target) * 100))
    }));
  }

  /**
   * 퀘스트 진행도 업데이트
   * @param {string} questType 퀘스트 타입
   * @param {number} amount 증가량
   */
  static updateProgress(questType, amount = 1) {
    // 리셋 체크
    this.checkAndResetDaily();

    const data = SaveManager.load();
    const quests = data.quests.daily || {};

    let updated = false;

    Object.keys(quests).forEach(questId => {
      const quest = quests[questId];

      if (quest.type === questType && !quest.completed) {
        quest.progress = Math.min(quest.target, quest.progress + amount);

        if (quest.progress >= quest.target) {
          quest.completed = true;

          EventBus.emit(GameEvents.QUEST_COMPLETE, {
            questId,
            questName: quest.name
          });
        }

        updated = true;
      }
    });

    if (updated) {
      data.quests.daily = quests;
      SaveManager.save(data);
    }

    return updated;
  }

  /**
   * 퀘스트 완료 여부 확인
   * @param {string} questId 퀘스트 ID
   * @returns {boolean}
   */
  static isQuestComplete(questId) {
    const data = SaveManager.load();
    const quest = data.quests.daily?.[questId];
    return quest?.completed || false;
  }

  /**
   * 퀘스트 보상 수령 여부 확인
   * @param {string} questId 퀘스트 ID
   * @returns {boolean}
   */
  static isQuestClaimed(questId) {
    const data = SaveManager.load();
    const quest = data.quests.daily?.[questId];
    return quest?.claimed || false;
  }

  /**
   * 퀘스트 보상 수령
   * @param {string} questId 퀘스트 ID
   * @returns {Object} 수령 결과
   */
  static claimReward(questId) {
    const data = SaveManager.load();
    const quest = data.quests.daily?.[questId];

    if (!quest) {
      return { success: false, error: '퀘스트를 찾을 수 없습니다' };
    }

    if (!quest.completed) {
      return { success: false, error: '퀘스트가 완료되지 않았습니다' };
    }

    if (quest.claimed) {
      return { success: false, error: '이미 보상을 수령했습니다' };
    }

    // 보상 지급
    const rewards = quest.rewards;
    const givenRewards = {};

    if (rewards.gold) {
      SaveManager.addGold(rewards.gold);
      givenRewards.gold = rewards.gold;
    }

    if (rewards.gems) {
      SaveManager.addGems(rewards.gems);
      givenRewards.gems = rewards.gems;
    }

    if (rewards.summonTickets) {
      SaveManager.addSummonTickets(rewards.summonTickets);
      givenRewards.summonTickets = rewards.summonTickets;
    }

    if (rewards.skillBooks) {
      const saveData = SaveManager.load();
      saveData.resources.skillBooks = (saveData.resources.skillBooks || 0) + rewards.skillBooks;
      SaveManager.save(saveData);
      givenRewards.skillBooks = rewards.skillBooks;
    }

    // 수령 완료 표시
    quest.claimed = true;
    data.quests.daily[questId] = quest;
    SaveManager.save(data);

    return {
      success: true,
      questId,
      questName: quest.name,
      rewards: givenRewards
    };
  }

  /**
   * 수령 가능한 퀘스트 목록
   * @returns {Array}
   */
  static getClaimableQuests() {
    const quests = this.getDailyQuests();
    return quests.filter(q => q.completed && !q.claimed);
  }

  /**
   * 모든 보상 일괄 수령
   * @returns {Object} 수령 결과
   */
  static claimAllRewards() {
    const claimable = this.getClaimableQuests();

    if (claimable.length === 0) {
      return { success: false, error: '수령 가능한 보상이 없습니다' };
    }

    const totalRewards = {
      gold: 0,
      gems: 0,
      summonTickets: 0,
      skillBooks: 0
    };

    claimable.forEach(quest => {
      const result = this.claimReward(quest.id);
      if (result.success) {
        Object.keys(result.rewards).forEach(key => {
          totalRewards[key] += result.rewards[key];
        });
      }
    });

    return {
      success: true,
      claimedCount: claimable.length,
      totalRewards
    };
  }

  /**
   * 퀘스트 진행 요약
   * @returns {Object} 요약 정보
   */
  static getQuestSummary() {
    const quests = this.getDailyQuests();

    const total = quests.length;
    const completed = quests.filter(q => q.completed).length;
    const claimed = quests.filter(q => q.claimed).length;
    const claimable = quests.filter(q => q.completed && !q.claimed).length;

    return {
      total,
      completed,
      claimed,
      claimable,
      completionPercent: Math.floor((completed / total) * 100),
      isAllComplete: completed === total,
      isAllClaimed: claimed === total
    };
  }

  /**
   * 특정 타입의 퀘스트 진행도 조회
   * @param {string} questType 퀘스트 타입
   * @returns {Array} 해당 타입 퀘스트들
   */
  static getQuestsByType(questType) {
    const quests = this.getDailyQuests();
    return quests.filter(q => q.type === questType);
  }

  /**
   * 퀘스트 진행 이벤트 핸들러 등록
   * (게임 시스템들과 연동)
   */
  static registerEventHandlers() {
    // 전투 완료 시
    EventBus.on(GameEvents.BATTLE_END, (data) => {
      if (data.outcome === 'victory') {
        this.updateProgress(this.QUEST_TYPES.BATTLE_COUNT, 1);

        // 3성 클리어 체크
        if (data.stars === 3) {
          this.updateProgress(this.QUEST_TYPES.STAGE_CLEAR, 1);
        }
      }
    });

    // 캐릭터 추가 시 (소환)
    EventBus.on(GameEvents.CHARACTER_ADDED, () => {
      this.updateProgress(this.QUEST_TYPES.SUMMON_COUNT, 1);
    });

    // 레벨업 시 (강화)
    EventBus.on(GameEvents.LEVEL_UP, () => {
      this.updateProgress(this.QUEST_TYPES.ENHANCE_COUNT, 1);
    });

    // 골드 획득 시 (리소스 변경 이벤트 필요)
    EventBus.on(GameEvents.RESOURCE_CHANGED, (data) => {
      if (data.type === 'gold' && data.amount > 0) {
        this.updateProgress(this.QUEST_TYPES.COLLECT_GOLD, data.amount);
      }
    });
  }

  /**
   * 다음 리셋까지 남은 시간
   * @returns {Object} { hours, minutes, seconds, formatted }
   */
  static getTimeUntilReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const diff = tomorrow.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return {
      hours,
      minutes,
      seconds,
      formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    };
  }

  /**
   * 완료 보상 미리보기 (모든 일일 퀘스트 완료 시)
   * @returns {Object} 총 보상
   */
  static getTotalDailyRewards() {
    const totals = {
      gold: 0,
      gems: 0,
      summonTickets: 0,
      skillBooks: 0
    };

    this.DAILY_QUEST_TEMPLATES.forEach(quest => {
      Object.keys(quest.rewards).forEach(key => {
        totals[key] = (totals[key] || 0) + quest.rewards[key];
      });
    });

    return totals;
  }
}

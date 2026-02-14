/**
 * EventDungeonSystem - 이벤트 던전 시스템
 * 기간 한정 이벤트 콘텐츠 관리
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import eventsData from '../data/events.json';

/**
 * 이벤트 던전 관련 이벤트
 */
export const EventDungeonEvents = {
  EVENT_STARTED: 'event_dungeon_started',
  EVENT_ENDED: 'event_dungeon_ended',
  STAGE_CLEARED: 'event_dungeon_stage_cleared',
  DAILY_LIMIT_REACHED: 'event_dungeon_daily_limit_reached',
  CURRENCY_EARNED: 'event_dungeon_currency_earned',
  SHOP_PURCHASE: 'event_dungeon_shop_purchase'
};

export class EventDungeonSystem {
  /**
   * 활성 이벤트 목록 가져오기
   * @returns {Array} 활성 이벤트 배열
   */
  static getActiveEvents() {
    const now = new Date();
    const events = eventsData.events || [];

    return events.filter(event => {
      const startDate = new Date(event.startDate);
      const endDate = new Date(event.endDate);
      return now >= startDate && now <= endDate;
    });
  }

  /**
   * 예정된 이벤트 목록 가져오기
   * @returns {Array} 예정 이벤트 배열
   */
  static getUpcomingEvents() {
    const now = new Date();
    const events = eventsData.events || [];

    return events.filter(event => {
      const startDate = new Date(event.startDate);
      return now < startDate;
    }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }

  /**
   * 만료된 이벤트 목록 가져오기
   * @returns {Array} 만료 이벤트 배열
   */
  static getExpiredEvents() {
    const now = new Date();
    const events = eventsData.events || [];

    return events.filter(event => {
      const endDate = new Date(event.endDate);
      return now > endDate;
    });
  }

  /**
   * 특정 이벤트 정보 가져오기
   * @param {string} eventId 이벤트 ID
   * @returns {Object|null} 이벤트 정보
   */
  static getEvent(eventId) {
    const events = eventsData.events || [];
    return events.find(event => event.id === eventId) || null;
  }

  /**
   * 이벤트 활성 여부 확인
   * @param {string} eventId 이벤트 ID
   * @returns {boolean} 활성 여부
   */
  static isEventActive(eventId) {
    const event = this.getEvent(eventId);
    if (!event) return false;

    const now = new Date();
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);

    return now >= startDate && now <= endDate;
  }

  /**
   * 이벤트 진행도 가져오기
   * @param {string} eventId 이벤트 ID
   * @returns {Object} 진행도 정보
   */
  static getEventProgress(eventId) {
    const data = SaveManager.load();

    if (!data.eventDungeons) {
      data.eventDungeons = {};
      SaveManager.save(data);
    }

    if (!data.eventDungeons[eventId]) {
      data.eventDungeons[eventId] = {
        clearedStages: {},
        dailyEntries: 0,
        lastResetDate: this._getDateString(),
        eventCurrency: 0,
        shopPurchases: {},
        totalClears: 0
      };
      SaveManager.save(data);
    }

    // 일일 초기화 체크
    this._checkDailyReset(eventId);

    return data.eventDungeons[eventId];
  }

  /**
   * 이벤트 스테이지 정보 가져오기
   * @param {string} eventId 이벤트 ID
   * @param {string} stageId 스테이지 ID
   * @returns {Object|null} 스테이지 정보
   */
  static getEventStage(eventId, stageId) {
    const event = this.getEvent(eventId);
    if (!event) return null;

    return event.stages.find(stage => stage.id === stageId) || null;
  }

  /**
   * 입장 가능 여부 확인
   * @param {string} eventId 이벤트 ID
   * @returns {Object} { canEnter, reason }
   */
  static canEnterEvent(eventId) {
    const event = this.getEvent(eventId);

    if (!event) {
      return { canEnter: false, reason: '존재하지 않는 이벤트입니다.' };
    }

    if (!this.isEventActive(eventId)) {
      return { canEnter: false, reason: '이벤트가 종료되었거나 시작되지 않았습니다.' };
    }

    const progress = this.getEventProgress(eventId);
    const dailyLimit = event.dailyLimit || 3;

    if (progress.dailyEntries >= dailyLimit) {
      return {
        canEnter: false,
        reason: `오늘의 입장 횟수를 모두 사용했습니다. (${progress.dailyEntries}/${dailyLimit})`
      };
    }

    return { canEnter: true, remainingEntries: dailyLimit - progress.dailyEntries };
  }

  /**
   * 이벤트 스테이지 클리어 처리
   * @param {string} eventId 이벤트 ID
   * @param {string} stageId 스테이지 ID
   * @param {Object} battleResult 전투 결과
   * @returns {Object} 클리어 결과 및 보상
   */
  static clearEventStage(eventId, stageId, battleResult) {
    const event = this.getEvent(eventId);
    const stage = this.getEventStage(eventId, stageId);

    if (!event || !stage) {
      return { success: false, error: '유효하지 않은 이벤트 또는 스테이지입니다.' };
    }

    if (!this.isEventActive(eventId)) {
      return { success: false, error: '이벤트가 종료되었습니다.' };
    }

    // 전투 실패 시
    if (!battleResult.victory) {
      return {
        success: false,
        message: `${stage.name} 도전 실패`
      };
    }

    const progress = this.getEventProgress(eventId);

    // 일일 입장 횟수 증가
    progress.dailyEntries += 1;
    progress.totalClears += 1;

    // 스테이지 클리어 기록
    if (!progress.clearedStages[stageId]) {
      progress.clearedStages[stageId] = {
        firstClearDate: Date.now(),
        clearCount: 0
      };
    }
    progress.clearedStages[stageId].clearCount += 1;
    progress.clearedStages[stageId].lastClearDate = Date.now();

    // 보상 계산 및 지급
    const rewards = this._calculateRewards(event, stage, battleResult);
    this._grantRewards(eventId, rewards);

    const data = SaveManager.load();
    data.eventDungeons[eventId] = progress;
    SaveManager.save(data);

    // 이벤트 발생
    EventBus.emit(EventDungeonEvents.STAGE_CLEARED, {
      eventId,
      stageId,
      rewards,
      dailyRemaining: event.dailyLimit - progress.dailyEntries
    });

    // 일일 한도 도달 시
    if (progress.dailyEntries >= event.dailyLimit) {
      EventBus.emit(EventDungeonEvents.DAILY_LIMIT_REACHED, { eventId });
    }

    return {
      success: true,
      stageId,
      rewards,
      progress: {
        dailyEntries: progress.dailyEntries,
        dailyLimit: event.dailyLimit,
        totalClears: progress.totalClears
      }
    };
  }

  /**
   * 보상 계산
   * @private
   */
  static _calculateRewards(event, stage, battleResult) {
    const rewards = { ...stage.rewards };

    // 이벤트 화폐 지급
    if (event.eventCurrency) {
      const currencyAmount = this._calculateEventCurrency(stage.difficulty);
      rewards.eventCurrency = {
        type: event.eventCurrency,
        amount: currencyAmount
      };
    }

    // 이벤트 포인트 계산 (난이도 기반)
    const difficultyMultiplier = {
      easy: 1,
      normal: 1.5,
      hard: 2.5
    };
    const pointMultiplier = difficultyMultiplier[stage.difficulty] || 1;
    rewards.eventPoints = Math.floor((rewards.gold || 0) * 0.1 * pointMultiplier);

    return rewards;
  }

  /**
   * 이벤트 화폐 계산
   * @private
   */
  static _calculateEventCurrency(difficulty) {
    const baseCurrency = {
      easy: 10,
      normal: 20,
      hard: 40
    };
    return baseCurrency[difficulty] || 10;
  }

  /**
   * 보상 지급
   * @private
   */
  static _grantRewards(eventId, rewards) {
    const data = SaveManager.load();

    // 기본 보상 (골드, 경험치)
    if (rewards.gold > 0) {
      SaveManager.addGold(rewards.gold);
    }

    // 이벤트 화폐 지급
    if (rewards.eventCurrency) {
      if (!data.eventDungeons[eventId]) {
        data.eventDungeons[eventId] = { eventCurrency: 0 };
      }
      data.eventDungeons[eventId].eventCurrency =
        (data.eventDungeons[eventId].eventCurrency || 0) + rewards.eventCurrency.amount;

      EventBus.emit(EventDungeonEvents.CURRENCY_EARNED, {
        eventId,
        currency: rewards.eventCurrency.type,
        amount: rewards.eventCurrency.amount
      });
    }

    // 아이템 드롭 확률 체크
    if (rewards.items) {
      rewards.droppedItems = [];
      rewards.items.forEach(item => {
        if (Math.random() < item.chance) {
          rewards.droppedItems.push(item.id);
          // TODO: 인벤토리에 아이템 추가
        }
      });
    }

    SaveManager.save(data);
  }

  /**
   * 이벤트 상점에서 구매
   * @param {string} eventId 이벤트 ID
   * @param {string} itemId 상품 ID
   * @returns {Object} 구매 결과
   */
  static purchaseFromEventShop(eventId, itemId) {
    const event = this.getEvent(eventId);

    if (!event || !event.shop) {
      return { success: false, error: '이벤트 상점을 찾을 수 없습니다.' };
    }

    const shopItem = event.shop.find(item => item.id === itemId);
    if (!shopItem) {
      return { success: false, error: '존재하지 않는 상품입니다.' };
    }

    const progress = this.getEventProgress(eventId);
    const currentCurrency = progress.eventCurrency || 0;

    // 화폐 부족 체크
    if (currentCurrency < shopItem.cost) {
      return {
        success: false,
        error: `${event.eventCurrency}이(가) 부족합니다.`,
        required: shopItem.cost,
        current: currentCurrency
      };
    }

    // 구매 제한 체크
    if (shopItem.limit) {
      const purchases = progress.shopPurchases[itemId] || 0;
      if (purchases >= shopItem.limit) {
        return {
          success: false,
          error: '구매 한도에 도달했습니다.',
          limit: shopItem.limit
        };
      }
    }

    // 화폐 차감
    const data = SaveManager.load();
    data.eventDungeons[eventId].eventCurrency -= shopItem.cost;

    // 구매 기록
    if (!data.eventDungeons[eventId].shopPurchases) {
      data.eventDungeons[eventId].shopPurchases = {};
    }
    data.eventDungeons[eventId].shopPurchases[itemId] =
      (data.eventDungeons[eventId].shopPurchases[itemId] || 0) + 1;

    // 보상 지급
    this._grantShopReward(shopItem);

    SaveManager.save(data);

    EventBus.emit(EventDungeonEvents.SHOP_PURCHASE, {
      eventId,
      itemId,
      cost: shopItem.cost,
      reward: shopItem.reward
    });

    return {
      success: true,
      itemId,
      cost: shopItem.cost,
      reward: shopItem.reward,
      remainingCurrency: data.eventDungeons[eventId].eventCurrency
    };
  }

  /**
   * 상점 보상 지급
   * @private
   */
  static _grantShopReward(shopItem) {
    const reward = shopItem.reward;

    if (reward.gold) {
      SaveManager.addGold(reward.gold);
    }

    if (reward.gems) {
      SaveManager.addGems(reward.gems);
    }

    if (reward.summonTickets) {
      SaveManager.addSummonTickets(reward.summonTickets);
    }

    // TODO: 다른 아이템 타입 처리
  }

  /**
   * 일일 초기화 확인 및 수행
   * @private
   */
  static _checkDailyReset(eventId) {
    const data = SaveManager.load();
    const progress = data.eventDungeons[eventId];

    if (!progress) return;

    const today = this._getDateString();
    if (progress.lastResetDate !== today) {
      progress.dailyEntries = 0;
      progress.lastResetDate = today;
      SaveManager.save(data);
    }
  }

  /**
   * 현재 날짜 문자열 반환
   * @private
   */
  static _getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * 이벤트 남은 시간 계산
   * @param {string} eventId 이벤트 ID
   * @returns {Object} { days, hours, minutes }
   */
  static getTimeRemaining(eventId) {
    const event = this.getEvent(eventId);
    if (!event) return null;

    const now = new Date();
    const endDate = new Date(event.endDate);
    const diffMs = endDate - now;

    if (diffMs <= 0) {
      return { days: 0, hours: 0, minutes: 0, expired: true };
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { days, hours, minutes, expired: false };
  }

  /**
   * 이벤트 상태 요약 조회
   * @param {string} eventId 이벤트 ID
   * @returns {Object} 상태 요약
   */
  static getEventSummary(eventId) {
    const event = this.getEvent(eventId);
    if (!event) return null;

    const progress = this.getEventProgress(eventId);
    const timeRemaining = this.getTimeRemaining(eventId);
    const canEnter = this.canEnterEvent(eventId);

    return {
      event,
      progress: {
        dailyEntries: progress.dailyEntries,
        dailyLimit: event.dailyLimit || 3,
        totalClears: progress.totalClears,
        eventCurrency: progress.eventCurrency,
        clearedStages: Object.keys(progress.clearedStages).length
      },
      timeRemaining,
      canEnter: canEnter.canEnter,
      reason: canEnter.reason,
      isActive: this.isEventActive(eventId)
    };
  }

  /**
   * 모든 이벤트 요약 조회
   * @returns {Object} 전체 이벤트 요약
   */
  static getAllEventsSummary() {
    const active = this.getActiveEvents();
    const upcoming = this.getUpcomingEvents();

    return {
      active: active.map(event => this.getEventSummary(event.id)),
      upcoming: upcoming.map(event => ({
        id: event.id,
        name: event.name,
        description: event.description,
        startDate: event.startDate,
        type: event.type
      })),
      totalActive: active.length,
      totalUpcoming: upcoming.length
    };
  }
}

// 싱글톤 인스턴스
export const eventDungeonSystem = EventDungeonSystem;

/**
 * EventDungeonSystem 테스트
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventDungeonSystem, EventDungeonEvents } from '../../src/systems/EventDungeonSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus } from '../../src/systems/EventBus.js';

// SaveManager 모킹
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      eventDungeons: {},
      resources: { gold: 10000, gems: 1000 }
    })),
    save: vi.fn(),
    addGold: vi.fn(),
    addGems: vi.fn(),
    addSummonTickets: vi.fn()
  }
}));

// EventBus 모킹
vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {}
}));

describe('EventDungeonSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 기본 세이브 데이터 설정
    SaveManager.load.mockReturnValue({
      eventDungeons: {},
      resources: { gold: 10000, gems: 1000 }
    });
  });

  describe('getActiveEvents', () => {
    it('현재 진행 중인 이벤트를 반환해야 함', () => {
      const activeEvents = EventDungeonSystem.getActiveEvents();

      expect(Array.isArray(activeEvents)).toBe(true);

      // 현재 날짜가 2026년이므로 evt_dragon_raid와 evt_shadow_tower가 활성
      const dragonEvent = activeEvents.find(e => e.id === 'evt_dragon_raid');
      const shadowEvent = activeEvents.find(e => e.id === 'evt_shadow_tower');

      expect(dragonEvent).toBeDefined();
      expect(shadowEvent).toBeDefined();
    });

    it('날짜 범위를 올바르게 확인해야 함', () => {
      const activeEvents = EventDungeonSystem.getActiveEvents();
      const now = new Date();

      activeEvents.forEach(event => {
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);

        expect(now >= startDate).toBe(true);
        expect(now <= endDate).toBe(true);
      });
    });
  });

  describe('getUpcomingEvents', () => {
    it('예정된 이벤트를 반환해야 함', () => {
      const upcomingEvents = EventDungeonSystem.getUpcomingEvents();

      expect(Array.isArray(upcomingEvents)).toBe(true);
    });

    it('시작 날짜순으로 정렬되어야 함', () => {
      const upcomingEvents = EventDungeonSystem.getUpcomingEvents();

      if (upcomingEvents.length > 1) {
        for (let i = 0; i < upcomingEvents.length - 1; i++) {
          const date1 = new Date(upcomingEvents[i].startDate);
          const date2 = new Date(upcomingEvents[i + 1].startDate);
          expect(date1 <= date2).toBe(true);
        }
      }
    });
  });

  describe('isEventActive', () => {
    it('활성 이벤트는 true를 반환해야 함', () => {
      const isActive = EventDungeonSystem.isEventActive('evt_dragon_raid');
      expect(isActive).toBe(true);
    });

    it('존재하지 않는 이벤트는 false를 반환해야 함', () => {
      const isActive = EventDungeonSystem.isEventActive('non_existent_event');
      expect(isActive).toBe(false);
    });
  });

  describe('getEventProgress', () => {
    it('새 이벤트의 초기 진행도를 생성해야 함', () => {
      const progress = EventDungeonSystem.getEventProgress('evt_dragon_raid');

      expect(progress).toBeDefined();
      expect(progress.clearedStages).toBeDefined();
      expect(progress.dailyEntries).toBe(0);
      expect(progress.eventCurrency).toBe(0);
      expect(progress.totalClears).toBe(0);
      expect(progress.shopPurchases).toBeDefined();
    });

    it('기존 진행도를 반환해야 함', () => {
      const mockProgress = {
        clearedStages: { 'evt_dragon_1': { clearCount: 5 } },
        dailyEntries: 2,
        lastResetDate: EventDungeonSystem._getDateString(),
        eventCurrency: 150,
        shopPurchases: {},
        totalClears: 5
      };

      SaveManager.load.mockReturnValue({
        eventDungeons: {
          'evt_dragon_raid': mockProgress
        },
        resources: { gold: 10000, gems: 1000 }
      });

      const progress = EventDungeonSystem.getEventProgress('evt_dragon_raid');

      expect(progress.dailyEntries).toBe(2);
      expect(progress.eventCurrency).toBe(150);
      expect(progress.totalClears).toBe(5);
    });
  });

  describe('canEnterEvent', () => {
    it('입장 가능한 이벤트는 canEnter: true를 반환해야 함', () => {
      const result = EventDungeonSystem.canEnterEvent('evt_dragon_raid');

      expect(result.canEnter).toBe(true);
      expect(result.remainingEntries).toBe(3);
    });

    it('일일 한도를 초과하면 입장 불가', () => {
      SaveManager.load.mockReturnValue({
        eventDungeons: {
          'evt_dragon_raid': {
            clearedStages: {},
            dailyEntries: 3,
            lastResetDate: EventDungeonSystem._getDateString(),
            eventCurrency: 0,
            shopPurchases: {},
            totalClears: 3
          }
        },
        resources: { gold: 10000, gems: 1000 }
      });

      const result = EventDungeonSystem.canEnterEvent('evt_dragon_raid');

      expect(result.canEnter).toBe(false);
      expect(result.reason).toContain('입장 횟수');
    });

    it('존재하지 않는 이벤트는 입장 불가', () => {
      const result = EventDungeonSystem.canEnterEvent('non_existent');

      expect(result.canEnter).toBe(false);
      expect(result.reason).toContain('존재하지 않는');
    });
  });

  describe('clearEventStage', () => {
    it('스테이지 클리어 시 보상을 지급해야 함', () => {
      const battleResult = { victory: true };

      const result = EventDungeonSystem.clearEventStage(
        'evt_dragon_raid',
        'evt_dragon_1',
        battleResult
      );

      expect(result.success).toBe(true);
      expect(result.rewards).toBeDefined();
      expect(result.rewards.gold).toBeGreaterThan(0);
      expect(result.rewards.eventCurrency).toBeDefined();
      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('전투 패배 시 보상을 지급하지 않아야 함', () => {
      const battleResult = { victory: false };

      const result = EventDungeonSystem.clearEventStage(
        'evt_dragon_raid',
        'evt_dragon_1',
        battleResult
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('실패');
    });

    it('일일 입장 횟수를 증가시켜야 함', () => {
      const battleResult = { victory: true };

      EventDungeonSystem.clearEventStage(
        'evt_dragon_raid',
        'evt_dragon_1',
        battleResult
      );

      const savedData = SaveManager.save.mock.calls[SaveManager.save.mock.calls.length - 1][0];
      expect(savedData.eventDungeons['evt_dragon_raid'].dailyEntries).toBe(1);
    });

    it('이벤트를 발생시켜야 함', () => {
      const battleResult = { victory: true };

      EventDungeonSystem.clearEventStage(
        'evt_dragon_raid',
        'evt_dragon_1',
        battleResult
      );

      expect(EventBus.emit).toHaveBeenCalledWith(
        EventDungeonEvents.STAGE_CLEARED,
        expect.any(Object)
      );
    });

    it('일일 한도 도달 시 이벤트를 발생시켜야 함', () => {
      SaveManager.load.mockReturnValue({
        eventDungeons: {
          'evt_dragon_raid': {
            clearedStages: {},
            dailyEntries: 2,
            lastResetDate: EventDungeonSystem._getDateString(),
            eventCurrency: 0,
            shopPurchases: {},
            totalClears: 2
          }
        },
        resources: { gold: 10000, gems: 1000 }
      });

      const battleResult = { victory: true };

      EventDungeonSystem.clearEventStage(
        'evt_dragon_raid',
        'evt_dragon_1',
        battleResult
      );

      expect(EventBus.emit).toHaveBeenCalledWith(
        EventDungeonEvents.DAILY_LIMIT_REACHED,
        expect.objectContaining({ eventId: 'evt_dragon_raid' })
      );
    });
  });

  describe('calculateRewards', () => {
    it('난이도에 따라 이벤트 화폐를 지급해야 함', () => {
      const event = EventDungeonSystem.getEvent('evt_dragon_raid');
      const easyStage = event.stages.find(s => s.difficulty === 'easy');
      const hardStage = event.stages.find(s => s.difficulty === 'hard');

      const easyRewards = EventDungeonSystem._calculateRewards(event, easyStage, { victory: true });
      const hardRewards = EventDungeonSystem._calculateRewards(event, hardStage, { victory: true });

      expect(easyRewards.eventCurrency.amount).toBeLessThan(hardRewards.eventCurrency.amount);
    });

    it('이벤트 포인트를 계산해야 함', () => {
      const event = EventDungeonSystem.getEvent('evt_dragon_raid');
      const stage = event.stages[0];

      const rewards = EventDungeonSystem._calculateRewards(event, stage, { victory: true });

      expect(rewards.eventPoints).toBeGreaterThan(0);
    });
  });

  describe('purchaseFromEventShop', () => {
    beforeEach(() => {
      SaveManager.load.mockReturnValue({
        eventDungeons: {
          'evt_dragon_raid': {
            clearedStages: {},
            dailyEntries: 0,
            lastResetDate: EventDungeonSystem._getDateString(),
            eventCurrency: 200,
            shopPurchases: {},
            totalClears: 0
          }
        },
        resources: { gold: 10000, gems: 1000 }
      });
    });

    it('충분한 화폐가 있으면 구매에 성공해야 함', () => {
      const result = EventDungeonSystem.purchaseFromEventShop(
        'evt_dragon_raid',
        'shop_dragon_gold'
      );

      expect(result.success).toBe(true);
      expect(result.cost).toBe(50);
      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('화폐가 부족하면 구매에 실패해야 함', () => {
      SaveManager.load.mockReturnValue({
        eventDungeons: {
          'evt_dragon_raid': {
            clearedStages: {},
            dailyEntries: 0,
            lastResetDate: EventDungeonSystem._getDateString(),
            eventCurrency: 10,
            shopPurchases: {},
            totalClears: 0
          }
        },
        resources: { gold: 10000, gems: 1000 }
      });

      const result = EventDungeonSystem.purchaseFromEventShop(
        'evt_dragon_raid',
        'shop_dragon_gold'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('부족');
    });

    it('구매 한도를 확인해야 함', () => {
      SaveManager.load.mockReturnValue({
        eventDungeons: {
          'evt_dragon_raid': {
            clearedStages: {},
            dailyEntries: 0,
            lastResetDate: EventDungeonSystem._getDateString(),
            eventCurrency: 500,
            shopPurchases: {
              'shop_dragon_ticket': 5
            },
            totalClears: 0
          }
        },
        resources: { gold: 10000, gems: 1000 }
      });

      const result = EventDungeonSystem.purchaseFromEventShop(
        'evt_dragon_raid',
        'shop_dragon_ticket'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('한도');
    });

    it('구매 시 이벤트를 발생시켜야 함', () => {
      EventDungeonSystem.purchaseFromEventShop(
        'evt_dragon_raid',
        'shop_dragon_gold'
      );

      expect(EventBus.emit).toHaveBeenCalledWith(
        EventDungeonEvents.SHOP_PURCHASE,
        expect.any(Object)
      );
    });
  });

  describe('getTimeRemaining', () => {
    it('남은 시간을 올바르게 계산해야 함', () => {
      const timeRemaining = EventDungeonSystem.getTimeRemaining('evt_dragon_raid');

      expect(timeRemaining).toBeDefined();
      expect(timeRemaining.days).toBeGreaterThanOrEqual(0);
      expect(timeRemaining.hours).toBeGreaterThanOrEqual(0);
      expect(timeRemaining.minutes).toBeGreaterThanOrEqual(0);
    });

    it('종료된 이벤트는 expired: true를 반환해야 함', () => {
      const expiredEvents = EventDungeonSystem.getExpiredEvents();

      if (expiredEvents.length > 0) {
        const timeRemaining = EventDungeonSystem.getTimeRemaining(expiredEvents[0].id);
        expect(timeRemaining.expired).toBe(true);
      }
    });
  });

  describe('getEventSummary', () => {
    it('이벤트 요약 정보를 반환해야 함', () => {
      const summary = EventDungeonSystem.getEventSummary('evt_dragon_raid');

      expect(summary).toBeDefined();
      expect(summary.event).toBeDefined();
      expect(summary.progress).toBeDefined();
      expect(summary.timeRemaining).toBeDefined();
      expect(summary.canEnter).toBeDefined();
      expect(summary.isActive).toBe(true);
    });

    it('존재하지 않는 이벤트는 null을 반환해야 함', () => {
      const summary = EventDungeonSystem.getEventSummary('non_existent');

      expect(summary).toBeNull();
    });
  });

  describe('getAllEventsSummary', () => {
    it('모든 이벤트 요약을 반환해야 함', () => {
      const summary = EventDungeonSystem.getAllEventsSummary();

      expect(summary).toBeDefined();
      expect(summary.active).toBeDefined();
      expect(summary.upcoming).toBeDefined();
      expect(summary.totalActive).toBeGreaterThanOrEqual(0);
      expect(summary.totalUpcoming).toBeGreaterThanOrEqual(0);
    });

    it('활성 이벤트 요약에 필요한 정보가 포함되어야 함', () => {
      const summary = EventDungeonSystem.getAllEventsSummary();

      if (summary.active.length > 0) {
        const firstEvent = summary.active[0];
        expect(firstEvent.event).toBeDefined();
        expect(firstEvent.progress).toBeDefined();
        expect(firstEvent.timeRemaining).toBeDefined();
      }
    });
  });
});

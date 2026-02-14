/**
 * QuestSystem.test.js
 * Unit tests for QuestSystem - 퀘스트 시스템
 * 18 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      quests: {
        daily: {},
        dailyProgress: {},
        lastReset: null
      },
      resources: { gold: 10000, gems: 500, summonTickets: 10, skillBooks: 20 }
    })),
    save: vi.fn(),
    addGold: vi.fn(),
    addGems: vi.fn(),
    addSummonTickets: vi.fn()
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn(),
    on: vi.fn()
  },
  GameEvents: {
    QUEST_COMPLETE: 'quest_complete',
    BATTLE_END: 'battle_end',
    CHARACTER_ADDED: 'character_added',
    LEVEL_UP: 'level_up',
    RESOURCE_CHANGED: 'resource_changed'
  }
}));

import { QuestSystem } from '../../src/systems/QuestSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus, GameEvents } from '../../src/systems/EventBus.js';

describe('QuestSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDailyQuests', () => {
    it('returns list of daily quests', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_login': {
              id: 'daily_login',
              type: 'login',
              progress: 1,
              target: 1,
              completed: true,
              claimed: false,
              rewards: { gems: 50 }
            }
          },
          lastReset: Date.now()
        }
      });

      const quests = QuestSystem.getDailyQuests();

      expect(Array.isArray(quests)).toBe(true);
      expect(quests.length).toBeGreaterThan(0);
      expect(quests[0]).toHaveProperty('progressPercent');
    });

    it('includes progress percentage', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': {
              id: 'daily_battle_3',
              progress: 2,
              target: 3,
              completed: false
            }
          },
          lastReset: Date.now()
        }
      });

      const quests = QuestSystem.getDailyQuests();
      const quest = quests.find(q => q.id === 'daily_battle_3');

      expect(quest.progressPercent).toBeCloseTo(66, 0);
    });
  });

  describe('updateProgress', () => {
    it('updates quest progress for matching type', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': {
              id: 'daily_battle_3',
              type: 'battle_count',
              progress: 0,
              target: 3,
              completed: false
            }
          },
          lastReset: Date.now()
        }
      });

      const updated = QuestSystem.updateProgress('battle_count', 1);

      expect(updated).toBe(true);
      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('completes quest when target reached', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': {
              id: 'daily_battle_3',
              type: 'battle_count',
              progress: 2,
              target: 3,
              completed: false,
              name: '전투 3회'
            }
          },
          lastReset: Date.now()
        }
      });

      QuestSystem.updateProgress('battle_count', 1);

      expect(EventBus.emit).toHaveBeenCalledWith(
        GameEvents.QUEST_COMPLETE,
        expect.objectContaining({
          questId: 'daily_battle_3'
        })
      );
    });

    it('does not exceed target progress', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': {
              id: 'daily_battle_3',
              type: 'battle_count',
              progress: 2,
              target: 3,
              completed: false
            }
          },
          lastReset: Date.now()
        }
      });

      QuestSystem.updateProgress('battle_count', 10);

      const data = SaveManager.save.mock.calls[0][0];
      const quest = data.quests.daily['daily_battle_3'];
      expect(quest.progress).toBe(3);
    });
  });

  describe('isQuestComplete', () => {
    it('returns true for completed quest', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_login': {
              completed: true
            }
          }
        }
      });

      const isComplete = QuestSystem.isQuestComplete('daily_login');
      expect(isComplete).toBe(true);
    });

    it('returns false for incomplete quest', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': {
              completed: false
            }
          }
        }
      });

      const isComplete = QuestSystem.isQuestComplete('daily_battle_3');
      expect(isComplete).toBe(false);
    });
  });

  describe('isQuestClaimed', () => {
    it('returns true if reward claimed', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_login': {
              claimed: true
            }
          }
        }
      });

      const isClaimed = QuestSystem.isQuestClaimed('daily_login');
      expect(isClaimed).toBe(true);
    });
  });

  describe('claimReward', () => {
    it('grants rewards on claim', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_login': {
              id: 'daily_login',
              name: '매일 출석',
              completed: true,
              claimed: false,
              rewards: { gems: 50, gold: 1000 }
            }
          }
        }
      });

      const result = QuestSystem.claimReward('daily_login');

      expect(result.success).toBe(true);
      expect(SaveManager.addGems).toHaveBeenCalledWith(50);
      expect(SaveManager.addGold).toHaveBeenCalledWith(1000);
    });

    it('fails if quest not completed', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': {
              completed: false,
              claimed: false
            }
          }
        }
      });

      const result = QuestSystem.claimReward('daily_battle_3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('완료되지 않았습니다');
    });

    it('fails if already claimed', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_login': {
              completed: true,
              claimed: true
            }
          }
        }
      });

      const result = QuestSystem.claimReward('daily_login');

      expect(result.success).toBe(false);
      expect(result.error).toContain('이미 보상');
    });

    it('marks quest as claimed after success', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_login': {
              id: 'daily_login',
              name: '출석',
              completed: true,
              claimed: false,
              rewards: { gems: 50 }
            }
          }
        }
      });

      QuestSystem.claimReward('daily_login');

      const savedData = SaveManager.save.mock.calls[0][0];
      expect(savedData.quests.daily['daily_login'].claimed).toBe(true);
    });

    it('grants skillBooks if present in rewards', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_enhance_1': {
              id: 'daily_enhance_1',
              name: '강화 1회',
              completed: true,
              claimed: false,
              rewards: { skillBooks: 1 }
            }
          }
        },
        resources: { skillBooks: 10 }
      });

      const result = QuestSystem.claimReward('daily_enhance_1');

      expect(result.success).toBe(true);
      expect(result.rewards.skillBooks).toBe(1);
    });
  });

  describe('getClaimableQuests', () => {
    it('returns only completed unclaimed quests', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'quest1': { completed: true, claimed: false },
            'quest2': { completed: false, claimed: false },
            'quest3': { completed: true, claimed: true }
          },
          lastReset: Date.now()
        }
      });

      const claimable = QuestSystem.getClaimableQuests();

      expect(claimable.length).toBe(1);
    });
  });

  describe('claimAllRewards', () => {
    it('claims all available rewards', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'quest1': {
              id: 'quest1',
              name: 'Quest 1',
              completed: true,
              claimed: false,
              rewards: { gold: 100 }
            },
            'quest2': {
              id: 'quest2',
              name: 'Quest 2',
              completed: true,
              claimed: false,
              rewards: { gems: 50 }
            }
          },
          lastReset: Date.now()
        },
        resources: {}
      });

      const result = QuestSystem.claimAllRewards();

      expect(result.success).toBe(true);
      expect(result.claimedCount).toBe(2);
      expect(result.totalRewards.gold).toBe(100);
      expect(result.totalRewards.gems).toBe(50);
    });

    it('fails if no claimable rewards', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {},
          lastReset: Date.now()
        }
      });

      const result = QuestSystem.claimAllRewards();

      expect(result.success).toBe(false);
    });
  });

  describe('getQuestSummary', () => {
    it('returns summary of quest progress', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'quest1': { completed: true, claimed: true },
            'quest2': { completed: true, claimed: false },
            'quest3': { completed: false, claimed: false }
          },
          lastReset: Date.now()
        }
      });

      const summary = QuestSystem.getQuestSummary();

      expect(summary.total).toBe(3);
      expect(summary.completed).toBe(2);
      expect(summary.claimed).toBe(1);
      expect(summary.claimable).toBe(1);
      expect(summary).toHaveProperty('completionPercent');
    });
  });

  describe('getQuestsByType', () => {
    it('filters quests by type', () => {
      SaveManager.load.mockReturnValue({
        quests: {
          daily: {
            'daily_battle_3': { type: 'battle_count' },
            'daily_summon_1': { type: 'summon_count' },
            'daily_battle_10': { type: 'battle_count' }
          },
          lastReset: Date.now()
        }
      });

      const battleQuests = QuestSystem.getQuestsByType('battle_count');

      expect(battleQuests.length).toBe(2);
    });
  });

  describe('getTimeUntilReset', () => {
    it('returns time until midnight', () => {
      const time = QuestSystem.getTimeUntilReset();

      expect(time).toHaveProperty('hours');
      expect(time).toHaveProperty('minutes');
      expect(time).toHaveProperty('seconds');
      expect(time).toHaveProperty('formatted');
      expect(time.hours).toBeGreaterThanOrEqual(0);
      expect(time.hours).toBeLessThan(24);
    });
  });

  describe('getTotalDailyRewards', () => {
    it('calculates total possible rewards', () => {
      const totals = QuestSystem.getTotalDailyRewards();

      expect(totals).toHaveProperty('gold');
      expect(totals).toHaveProperty('gems');
      expect(totals.gems).toBeGreaterThan(0);
    });
  });
});

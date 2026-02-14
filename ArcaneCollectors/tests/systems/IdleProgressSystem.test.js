/**
 * IdleProgressSystem.test.js
 * Unit tests for IdleProgressSystem - 방치형 진행 시스템
 * Updated for new boss battle mechanics (DPS-based)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      characters: [],
      parties: [],
      progress: { clearedStages: {} },
      resources: {}
    })),
    save: vi.fn(),
    getProgress: vi.fn(() => ({ clearedStages: {} }))
  }
}));

vi.mock('../../src/utils/GameLogger.js', () => ({
  default: {
    log: vi.fn()
  }
}));

vi.mock('../../src/systems/ProgressionSystem.js', () => ({
  ProgressionSystem: {
    calculatePower: vi.fn(() => 400)
  }
}));

vi.mock('../../src/data/index.ts', () => ({
  getChapter: vi.fn(() => ({ id: 'chapter_1', name: '고대의 숲' })),
  getEnemy: vi.fn(() => ({
    id: 'enemy_goblin_king',
    name: '고블린 왕',
    type: 'boss',
    stats: { hp: 1500, atk: 80, def: 40, spd: 30 },
    growthStats: { hp: 150, atk: 8, def: 4, spd: 3 },
    skills: [],
    expReward: 300,
    goldReward: 600
  })),
  getChapterStages: vi.fn(() => [
    {
      id: '1-1',
      name: '슬라임 평원',
      enemies: [{ id: 'enemy_slime', level: 1 }],
      rewards: { gold: 100, exp: 50 }
    },
    {
      id: '1-5',
      name: '고블린 왕의 성',
      isBoss: true,
      enemies: [{ id: 'enemy_goblin_king', level: 5 }],
      rewards: { gold: 600, exp: 300 }
    }
  ]),
  calculateEnemyStats: vi.fn((enemy, level) => ({
    hp: enemy.stats.hp + (enemy.growthStats?.hp || 0) * (level - 1),
    atk: enemy.stats.atk + (enemy.growthStats?.atk || 0) * (level - 1),
    def: enemy.stats.def + (enemy.growthStats?.def || 0) * (level - 1),
    spd: enemy.stats.spd + (enemy.growthStats?.spd || 0) * (level - 1)
  })),
  getCharacter: vi.fn(),
  calculatePower: vi.fn(),
  getStage: vi.fn()
}));

import { IdleProgressSystem } from '../../src/systems/IdleProgressSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';

describe('IdleProgressSystem', () => {
  let scene;
  let idleSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = {};
    idleSystem = new IdleProgressSystem(scene);
  });

  describe('constructor', () => {
    it('sets correct initial values', () => {
      expect(idleSystem.battleInterval).toBe(1500);
      expect(idleSystem.accumulatedDamage).toBe(0);
      expect(idleSystem.currentBossHp).toBe(0);
      expect(idleSystem.currentBossData).toBe(null);
    });

    it('initializes current stage', () => {
      expect(idleSystem.currentStage).toEqual({
        chapter: 1,
        stage: 1,
        name: '슬라임 평원'
      });
    });
  });

  describe('getCurrentStage', () => {
    it('returns stage_1_1 by default when no progress', () => {
      SaveManager.getProgress.mockReturnValue({ clearedStages: {} });

      const stage = idleSystem.getCurrentStage();

      expect(stage.chapter).toBe(1);
      expect(stage.stage).toBe(1);
      expect(stage.name).toBe('슬라임 평원');
    });

    it('advances to next stage after clearing', () => {
      SaveManager.getProgress.mockReturnValue({
        clearedStages: {
          'stage_1_1': true,
          'stage_1_2': true
        }
      });

      const stage = idleSystem.getCurrentStage();

      expect(stage.chapter).toBe(1);
      expect(stage.stage).toBe(3);
    });

    it('sorts cleared stages numerically (stage_1_10 > stage_1_9)', () => {
      SaveManager.getProgress.mockReturnValue({
        clearedStages: {
          'stage_1_9': true,
          'stage_1_10': true
        }
      });

      const stage = idleSystem.getCurrentStage();

      // Last cleared is stage_1_10
      // Logic: nextStage = stage < 10 ? stage + 1 : stage; -> 10 (stays 10)
      //        nextChapter = stage < 10 ? chapter : chapter + 1; -> 2
      expect(stage.chapter).toBe(2);
      expect(stage.stage).toBe(10);
    });
  });

  describe('advanceStage', () => {
    it('increments stage correctly', () => {
      SaveManager.getProgress.mockReturnValue({
        clearedStages: {
          'stage_1_1': true
        }
      });
      const saveData = {
        progress: { clearedStages: { 'stage_1_1': true } }
      };
      SaveManager.load.mockReturnValue(saveData);

      idleSystem.advanceStage();

      // getCurrentStage with stage_1_1 cleared returns stage 2
      // So advancing from there goes to stage 3
      expect(idleSystem.currentStage.chapter).toBe(1);
      expect(idleSystem.currentStage.stage).toBe(3);
      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('resets accumulated damage and boss data after advancing', () => {
      SaveManager.getProgress.mockReturnValue({
        clearedStages: {}
      });
      SaveManager.load.mockReturnValue({
        progress: { clearedStages: {} }
      });

      idleSystem.accumulatedDamage = 500;
      idleSystem.currentBossData = { name: 'Test Boss' };
      idleSystem.advanceStage();

      expect(idleSystem.accumulatedDamage).toBe(0);
      expect(idleSystem.currentBossData).toBe(null);
    });

    it('advances to next chapter after stage 10', () => {
      SaveManager.getProgress.mockReturnValue({
        clearedStages: {}
      });
      const saveData = {
        progress: { clearedStages: {} }
      };
      SaveManager.load.mockReturnValue(saveData);

      // Set current stage to 1-10 manually
      idleSystem.currentStage = { chapter: 1, stage: 10, name: '고블린 왕의 성' };

      idleSystem.advanceStage();

      expect(SaveManager.save).toHaveBeenCalled();
    });
  });

  describe('getBossForCurrentStage', () => {
    it('returns boss data with correct structure', () => {
      const boss = idleSystem.getBossForCurrentStage();

      expect(boss).toHaveProperty('id');
      expect(boss).toHaveProperty('name');
      expect(boss).toHaveProperty('hp');
      expect(boss).toHaveProperty('atk');
      expect(boss).toHaveProperty('def');
      expect(boss).toHaveProperty('emoji');
      expect(boss).toHaveProperty('goldReward');
      expect(boss).toHaveProperty('expReward');
    });

    it('returns goblin king as default boss', () => {
      const boss = idleSystem.getBossForCurrentStage();

      expect(boss.id).toBe('enemy_goblin_king');
      expect(boss.name).toBe('고블린 왕');
      expect(boss.hp).toBeGreaterThan(0);
    });
  });

  describe('calculateDPS', () => {
    it('calculates DPS based on party power', () => {
      const dps = idleSystem.calculateDPS();

      expect(dps).toBeGreaterThan(0);
      // With party power 400, baseDPS = 400 * 0.15 = 60
      // With 0.9-1.1 multiplier, should be around 54-66
      expect(dps).toBeGreaterThanOrEqual(54);
      expect(dps).toBeLessThanOrEqual(66);
    });
  });

  describe('loadCurrentBoss', () => {
    it('loads boss data and initializes HP values', () => {
      idleSystem.loadCurrentBoss();

      expect(idleSystem.currentBossData).not.toBe(null);
      expect(idleSystem.currentBossHp).toBeGreaterThan(0);
      expect(idleSystem.accumulatedDamage).toBe(0);
      expect(idleSystem.currentBossData.name).toBe('고블린 왕');
    });
  });

  describe('simulateBattle', () => {
    it('returns battle results with boss and damage', () => {
      const result = idleSystem.simulateBattle();

      expect(result).toHaveProperty('boss');
      expect(result).toHaveProperty('damage');
      expect(result).toHaveProperty('accumulatedDamage');
      expect(result).toHaveProperty('bossMaxHp');
      expect(result).toHaveProperty('progress');
      expect(result).toHaveProperty('reward');
      expect(result.boss).toHaveProperty('name');
      expect(result.damage).toBeGreaterThan(0);
    });

    it('accumulates damage correctly', () => {
      const result1 = idleSystem.simulateBattle();
      const firstDamage = result1.damage;
      const firstAccumulated = result1.accumulatedDamage;

      expect(firstAccumulated).toBe(firstDamage);

      const result2 = idleSystem.simulateBattle();
      const secondAccumulated = result2.accumulatedDamage;

      expect(secondAccumulated).toBeGreaterThan(firstAccumulated);
    });

    it('calculates progress as ratio of accumulated damage to boss max HP', () => {
      const result = idleSystem.simulateBattle();

      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(1);

      const expectedProgress = result.accumulatedDamage / result.bossMaxHp;
      expect(result.progress).toBeCloseTo(expectedProgress, 5);
    });

    it('sets bossReady when progress reaches 100%', () => {
      // Force high accumulated damage to reach 100%
      idleSystem.loadCurrentBoss();
      const bossHp = idleSystem.currentBossHp;
      idleSystem.accumulatedDamage = bossHp - 10;

      const result = idleSystem.simulateBattle();

      expect(result.bossReady).toBe(true);
      expect(result.progress).toBe(1);
      // 샌드백 모드: 자동 스테이지 진행 없음
      expect(idleSystem.accumulatedDamage).toBeGreaterThanOrEqual(bossHp);
    });

    it('does not set bossReady when progress is below 100%', () => {
      idleSystem.loadCurrentBoss();
      idleSystem.accumulatedDamage = 0;

      const result = idleSystem.simulateBattle();

      expect(result.bossReady).toBe(false);
    });

    it('bossReady fires only once (not on subsequent calls)', () => {
      idleSystem.loadCurrentBoss();
      const bossHp = idleSystem.currentBossHp;
      idleSystem.accumulatedDamage = bossHp - 10;

      const result1 = idleSystem.simulateBattle();
      expect(result1.bossReady).toBe(true);

      const result2 = idleSystem.simulateBattle();
      expect(result2.bossReady).toBe(false);
      expect(result2.progress).toBe(1);
    });

    it('continues accumulating damage past 100%', () => {
      idleSystem.loadCurrentBoss();
      const bossHp = idleSystem.currentBossHp;
      idleSystem.accumulatedDamage = bossHp + 100;

      const result = idleSystem.simulateBattle();

      expect(result.accumulatedDamage).toBeGreaterThan(bossHp + 100);
      expect(result.progress).toBe(1);
    });

    it('isBossReady returns true when damage >= bossHp', () => {
      idleSystem.loadCurrentBoss();
      idleSystem.accumulatedDamage = idleSystem.currentBossHp;

      expect(idleSystem.isBossReady()).toBe(true);
    });

    it('provides gold and exp rewards', () => {
      const result = idleSystem.simulateBattle();

      expect(result.reward.gold).toBeGreaterThanOrEqual(0);
      expect(result.reward.exp).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateOfflineRewards', () => {
    it('returns zero rewards for less than 30 seconds offline', () => {
      const lastLogout = Date.now() - 20000; // 20 seconds ago
      const rewards = idleSystem.calculateOfflineRewards(lastLogout);

      expect(rewards.gold).toBe(0);
      expect(rewards.exp).toBe(0);
    });

    it('calculates rewards based on DPS and damage ratio', () => {
      const lastLogout = Date.now() - 120000; // 2 minutes ago
      const rewards = idleSystem.calculateOfflineRewards(lastLogout);

      expect(rewards.gold).toBeGreaterThan(0);
      expect(rewards.exp).toBeGreaterThan(0);
      expect(rewards.progressGained).toBeGreaterThanOrEqual(0);
    });

    it('caps offline rewards at 12 hours', () => {
      const thirteenHoursAgo = Date.now() - (13 * 60 * 60 * 1000);
      const maxMs = 12 * 60 * 60 * 1000;

      const reward13h = idleSystem.calculateOfflineRewards(thirteenHoursAgo);

      // Verify that duration is capped at 12 hours max
      expect(reward13h.duration).toBe(maxMs);

      // Verify rewards are non-zero (capped, but still rewarded)
      expect(reward13h.gold).toBeGreaterThan(0);
      expect(reward13h.exp).toBeGreaterThan(0);
    });

    it('generates items based on offline hours', () => {
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const rewards = idleSystem.calculateOfflineRewards(twoHoursAgo);

      expect(rewards.items).toBeInstanceOf(Array);
      // 1시간당 50% 확률이므로 0~2개 예상
      expect(rewards.items.length).toBeGreaterThanOrEqual(0);
      expect(rewards.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getPartyPower', () => {
    it('returns default 400 when no party', () => {
      SaveManager.load.mockReturnValue({ characters: [], parties: [] });

      const power = idleSystem.getPartyPower();

      expect(power).toBe(400);
    });
  });

  describe('boss detection', () => {
    it('detects boss stage (stage 10)', () => {
      const bossStage = idleSystem.getStageName(1, 10);
      expect(bossStage).toContain('왕');
    });
  });
});

/**
 * TowerSystem.test.js
 * Unit tests for TowerSystem - 무한의 탑 시스템
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';

// Mock dependencies
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    load: vi.fn(() => ({
      tower: {
        currentFloor: 1,
        highestFloor: 0,
        lastResetDate: null,
        totalClears: 0,
        bossClears: {}
      }
    })),
    save: vi.fn(),
    addGold: vi.fn(),
    addGems: vi.fn(),
    addSummonTickets: vi.fn(),
    addWorldTreeSeeds: vi.fn()
  }
}));

// TOWER-03: 시즌 기록 제출에 쓰이는 전투력 SSOT
vi.mock('../../src/systems/ProgressionSystem.js', () => ({
  ProgressionSystem: {
    calculatePower: vi.fn(char => (char?.level || 1) * 100)
  }
}));

// TOWER-03: Supabase 시즌 순위 (기본 오프라인 — 필요한 테스트에서 온라인으로 전환)
// vi.mock 팩토리는 파일 최상단으로 호이스팅되므로 vi.hoisted 로 핸들을 먼저 만든다
const { mockSeasonQuery, mockIsOnline } = vi.hoisted(() => ({
  mockSeasonQuery: {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null })
  },
  mockIsOnline: vi.fn(() => false)
}));

vi.mock('../../src/api/supabaseClient.js', () => ({
  supabase: { from: vi.fn(() => mockSeasonQuery) },
  isSupabaseConfigured: true,
  isOnline: mockIsOnline
}));

// TOWER-03: node 환경에는 localStorage 가 없다 (폴백 캐시용)
const localStorageMock = vi.hoisted(() => {
  const store = new Map();
  return {
    getItem: vi.fn(key => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => { store.set(key, String(value)); }),
    removeItem: vi.fn(key => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); })
  };
});
vi.stubGlobal('localStorage', localStorageMock);

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    ACHIEVEMENT_UNLOCKED: 'achievement_unlocked'
  }
}));

vi.mock('../../src/data/tower.json', () => ({
  default: {
    config: {
      maxFloor: 100,
      bossFloors: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      resetType: 'monthly'
    },
    floors: [
      {
        floor: 1,
        enemies: [{ id: 'enemy_slime', count: 2 }],
        recommendedPower: 500,
        bossReward: null
      }
    ],
    rewards: {
      '1-10': { gold: 500, exp: 250, equipmentChance: 0 },
      '11-30': { gold: 800, exp: 400, equipmentChance: 0.05, shardRarity: 'R' },
      '31-50': { gold: 1200, exp: 600, equipmentChance: 0.1 },
      '51-70': { gold: 1800, exp: 900, equipmentChance: 0.15 },
      '71-100': { gold: 2500, exp: 1250, equipmentChance: 0.2 }
    }
  }
}));

import { TowerSystem } from '../../src/systems/TowerSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus } from '../../src/systems/EventBus.js';

describe('TowerSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFloorInfo', () => {
    it('returns floor data for valid floor', () => {
      const info = TowerSystem.getFloorInfo(1);

      expect(info).toBeTruthy();
      expect(info.floor).toBe(1);
      expect(info).toHaveProperty('enemies');
      expect(info).toHaveProperty('rewards');
    });

    it('returns null for invalid floor', () => {
      const info = TowerSystem.getFloorInfo(0);
      expect(info).toBeNull();

      const info2 = TowerSystem.getFloorInfo(101);
      expect(info2).toBeNull();
    });

    it('identifies boss floors correctly', () => {
      const floor10 = TowerSystem.getFloorInfo(10);
      const floor5 = TowerSystem.getFloorInfo(5);

      expect(floor10.isBoss).toBe(true);
      expect(floor5.isBoss).toBe(false);
    });
  });

  describe('calculateDifficulty', () => {
    it('increases with floor number', () => {
      const diff1 = TowerSystem.calculateDifficulty(1);
      const diff10 = TowerSystem.calculateDifficulty(10);

      expect(diff10).toBeGreaterThan(diff1);
    });

    it('applies boss floor multiplier', () => {
      const diff9 = TowerSystem.calculateDifficulty(9);
      const diff10 = TowerSystem.calculateDifficulty(10);

      expect(diff10).toBeGreaterThan(diff9 * 1.4);
    });
  });

  describe('getRecommendedPower', () => {
    it('returns recommended power for floor', () => {
      const power = TowerSystem.getRecommendedPower(5);

      expect(power).toBeGreaterThan(0);
      expect(typeof power).toBe('number');
    });

    it('scales with floor difficulty', () => {
      const power1 = TowerSystem.getRecommendedPower(1);
      const power20 = TowerSystem.getRecommendedPower(20);

      expect(power20).toBeGreaterThan(power1);
    });

    it('uses tower.json recommendedPower when defined', () => {
      const info = TowerSystem.getFloorInfo(1);

      expect(info.recommendedPower).toBe(500);
    });

    it('falls back to linear curve (~500 -> ~25000) monotonically', () => {
      const floors = [2, 20, 40, 60, 80, 100];
      const powers = floors.map(f => TowerSystem.getRecommendedPower(f));

      for (let i = 1; i < powers.length; i++) {
        expect(powers[i]).toBeGreaterThan(powers[i - 1]);
      }
      // 1층 ~500, 100층 ~25000 (PRD §5.2 난이도 곡선)
      expect(TowerSystem.getRecommendedPower(100)).toBeGreaterThanOrEqual(24000);
      expect(TowerSystem.getRecommendedPower(100)).toBeLessThanOrEqual(25000);
    });
  });

  describe('calculateRewards', () => {
    it('returns rewards for floor', () => {
      const rewards = TowerSystem.calculateRewards(5);

      expect(rewards).toHaveProperty('gold');
      expect(rewards).toHaveProperty('exp');
      expect(rewards.gold).toBeGreaterThan(0);
      expect(rewards.exp).toBeGreaterThan(0);
    });

    it('scales rewards with floor number', () => {
      const rewards1 = TowerSystem.calculateRewards(1);
      const rewards10 = TowerSystem.calculateRewards(10);

      expect(rewards10.gold).toBeGreaterThan(rewards1.gold);
    });
  });

  describe('clearFloor', () => {
    it('succeeds on victory', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 1,
          highestFloor: 0,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(1, { victory: true });

      expect(result.success).toBe(true);
      expect(result.rewards).toBeTruthy();
      expect(SaveManager.save).toHaveBeenCalled();
    });

    it('fails on defeat', () => {
      const result = TowerSystem.clearFloor(1, { victory: false });

      expect(result.success).toBe(false);
    });

    it('updates highest floor on new record', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 5,
          highestFloor: 4,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(5, { victory: true });

      expect(result.newHighFloor).toBe(true);
    });

    it('grants boss rewards on boss floor clear', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 10,
          highestFloor: 9,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(10, { victory: true });

      expect(result.success).toBe(true);
      expect(result.isBossCleared).toBe(true);
    });

    it('passes reward tier shardRarity through on clear (PRD §5.2)', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 11,
          highestFloor: 10,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(11, { victory: true });

      expect(result.success).toBe(true);
      expect(result.rewards.shardRarity).toBe('R');
    });

    it('updates currentFloor to next floor on victory', () => {
      const mockData = {
        tower: {
          currentFloor: 5,
          highestFloor: 5,
          totalClears: 0,
          bossClears: {}
        }
      };
      SaveManager.load.mockReturnValue(mockData);

      const result = TowerSystem.clearFloor(5, { victory: true });

      expect(result.success).toBe(true);
      expect(result.nextFloor).toBe(6);
      // SaveManager.save가 호출될 때 currentFloor가 6으로 업데이트되었는지 확인
      expect(SaveManager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          tower: expect.objectContaining({
            currentFloor: 6
          })
        })
      );
    });

    it('grants 1 world tree seed on a floor-20+ new-record clear (COLL-02)', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 20,
          highestFloor: 19,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(20, { victory: true });

      expect(result.newHighFloor).toBe(true);
      expect(result.rewards.worldTreeSeeds).toBe(1);
      expect(SaveManager.addWorldTreeSeeds).toHaveBeenCalledWith(1);
    });

    it('does not grant a world tree seed on a new-record clear below floor 20', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 19,
          highestFloor: 18,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(19, { victory: true });

      expect(result.newHighFloor).toBe(true);
      expect(result.rewards.worldTreeSeeds).toBe(0);
      expect(SaveManager.addWorldTreeSeeds).not.toHaveBeenCalled();
    });

    it('does not grant a world tree seed on a re-clear of an already-cleared floor 20', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 20,
          highestFloor: 20,
          totalClears: 1,
          bossClears: {}
        }
      });

      const result = TowerSystem.clearFloor(20, { victory: true });

      expect(result.newHighFloor).toBe(false);
      expect(result.rewards.worldTreeSeeds).toBe(0);
      expect(SaveManager.addWorldTreeSeeds).not.toHaveBeenCalled();
    });
  });

  describe('nextFloor', () => {
    it('returns next floor info', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 5 }
      });

      const result = TowerSystem.nextFloor();

      expect(result.success).toBe(true);
      expect(result.floorInfo.floor).toBe(5);
    });

    it('fails at max floor', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 101 }
      });

      const result = TowerSystem.nextFloor();

      expect(result.success).toBe(false);
    });
  });

  describe('buildStageForFloor', () => {
    it('expands {id,count} enemy defs into a flat {id,level} array', () => {
      const floorInfo = {
        enemies: [
          { id: 'enemy_goblin', count: 3 },
          { id: 'enemy_wolf', count: 2 }
        ]
      };

      const stage = TowerSystem.buildStageForFloor(1, floorInfo);

      expect(stage.enemies).toHaveLength(5);
      expect(stage.enemies.filter(e => e.id === 'enemy_goblin')).toHaveLength(3);
      expect(stage.enemies.filter(e => e.id === 'enemy_wolf')).toHaveLength(2);
    });

    it('clamps enemy level to floor/10 within [1, 10]', () => {
      const floorInfo = { enemies: [{ id: 'enemy_slime', count: 1 }] };

      expect(TowerSystem.buildStageForFloor(1, floorInfo).enemies[0].level).toBe(1);
      expect(TowerSystem.buildStageForFloor(35, floorInfo).enemies[0].level).toBe(3);
      expect(TowerSystem.buildStageForFloor(150, floorInfo).enemies[0].level).toBe(10);
    });

    it('formats stage id as tower_floor_N', () => {
      const floorInfo = { enemies: [{ id: 'enemy_slime', count: 1 }] };

      const stage = TowerSystem.buildStageForFloor(42, floorInfo);

      expect(stage.id).toBe('tower_floor_42');
      expect(stage.name).toContain('42');
    });

    it('handles missing count as 1 and empty enemies gracefully', () => {
      const stage = TowerSystem.buildStageForFloor(1, { enemies: [{ id: 'enemy_boss' }] });
      expect(stage.enemies).toEqual([{ id: 'enemy_boss', level: 1 }]);

      const emptyStage = TowerSystem.buildStageForFloor(1, { enemies: [] });
      expect(emptyStage.enemies).toEqual([]);

      const nullStage = TowerSystem.buildStageForFloor(1, null);
      expect(nullStage.enemies).toEqual([]);
    });
  });

  describe('getProgress', () => {
    it('returns current tower progress', () => {
      const progress = TowerSystem.getProgress();

      expect(progress).toHaveProperty('currentFloor');
      expect(progress).toHaveProperty('highestFloor');
      expect(progress).toHaveProperty('maxFloor');
      expect(progress).toHaveProperty('nextBossFloor');
    });

    it('calculates next boss floor correctly', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 5, highestFloor: 5 }
      });

      const progress = TowerSystem.getProgress();

      expect(progress.nextBossFloor).toBe(10);
    });
  });

  describe('jumpToFloor', () => {
    it('allows jump to cleared floor', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 1, highestFloor: 10 }
      });

      const result = TowerSystem.jumpToFloor(5);

      expect(result.success).toBe(true);
      expect(result.newFloor).toBe(5);
    });

    it('prevents jump to uncleared floor', () => {
      SaveManager.load.mockReturnValue({
        tower: { currentFloor: 1, highestFloor: 5 }
      });

      const result = TowerSystem.jumpToFloor(10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('도달하지 않은');
    });
  });

  describe('resetTower', () => {
    it('resets progress and grants rewards', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 1,
          highestFloor: 50,
          totalClears: 0,
          bossClears: {}
        }
      });

      const result = TowerSystem.resetTower();

      expect(result.success).toBe(true);
      expect(result.rewards).toBeTruthy();
      expect(result.previousHighest).toBe(50);
    });
  });

  describe('getSummary', () => {
    it('returns comprehensive tower status', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 15,
          highestFloor: 20,
          totalClears: 0,
          bossClears: {}
        }
      });

      const summary = TowerSystem.getSummary();

      expect(summary).toHaveProperty('currentFloor');
      expect(summary).toHaveProperty('highestFloor');
      expect(summary).toHaveProperty('progressPercent');
      expect(summary).toHaveProperty('recommendedPower');
      expect(summary).toHaveProperty('currentFloorInfo');
    });
  });


  // ═══════════════════════════════════════════════════════════
  // TOWER-03: 월간 시즌 (UTC+9 기준) + 순위
  // ═══════════════════════════════════════════════════════════
  describe('season — id/구간 계산', () => {
    it('formats season id as YYYY-MM in KST', () => {
      // 2026-09-03 12:00 KST = 2026-09-03 03:00 UTC
      expect(TowerSystem.getSeasonId(new Date('2026-09-03T03:00:00Z'))).toBe('2026-09');
    });

    it('rolls to the next season at KST month boundary, not UTC', () => {
      // 2026-08-31 23:59 UTC 는 KST 로 2026-09-01 08:59 → 이미 9월 시즌
      expect(TowerSystem.getSeasonId(new Date('2026-08-31T23:59:00Z'))).toBe('2026-09');
      // 2026-08-31 14:59 UTC 는 KST 로 2026-08-31 23:59 → 아직 8월 시즌
      expect(TowerSystem.getSeasonId(new Date('2026-08-31T14:59:00Z'))).toBe('2026-08');
      // 정확히 KST 09-01 00:00 (= 08-31 15:00 UTC) 부터 9월 시즌
      expect(TowerSystem.getSeasonId(new Date('2026-08-31T15:00:00Z'))).toBe('2026-09');
    });

    it('computes season window and remaining days from KST month end', () => {
      const info = TowerSystem.getSeasonInfo(new Date('2026-09-20T00:00:00Z'));

      expect(info.id).toBe('2026-09');
      // 시즌 시작 = KST 2026-09-01 00:00 = 2026-08-31 15:00 UTC
      expect(new Date(info.startsAt).toISOString()).toBe('2026-08-31T15:00:00.000Z');
      // 시즌 종료 = KST 2026-10-01 00:00 = 2026-09-30 15:00 UTC
      expect(new Date(info.endsAt).toISOString()).toBe('2026-09-30T15:00:00.000Z');
      expect(info.daysRemaining).toBe(11);
    });
  });

  describe('season — 자동 리셋 / 기록 보존', () => {
    it('migrates legacy save without a season field and does NOT reset', () => {
      const data = {
        tower: { currentFloor: 32, highestFloor: 31, totalClears: 40, bossClears: { 10: 1, 20: 2, 30: 3 } }
      };
      SaveManager.load.mockReturnValue(data);

      const result = TowerSystem.ensureSeason(new Date('2026-09-03T03:00:00Z'));

      expect(result.migrated).toBe(true);
      expect(result.reset).toBe(false);
      expect(data.tower.season).toEqual({
        id: '2026-09',
        bestFloor: 31,
        clearedAt: null
      });
      expect(data.tower.bestFloorAllTime).toBe(31);
      // 진행도는 그대로여야 한다
      expect(data.tower.currentFloor).toBe(32);
      expect(SaveManager.addGems).not.toHaveBeenCalled();
    });

    it('does nothing when the stored season equals the current season', () => {
      const data = {
        tower: {
          currentFloor: 12, highestFloor: 11, totalClears: 11, bossClears: {},
          season: { id: '2026-09', bestFloor: 11, clearedAt: 1756000000000 },
          seasonHistory: [], bestFloorAllTime: 11
        }
      };
      SaveManager.load.mockReturnValue(data);

      const result = TowerSystem.ensureSeason(new Date('2026-09-03T03:00:00Z'));

      expect(result).toEqual({ reset: false, migrated: false, seasonId: '2026-09' });
      expect(data.tower.currentFloor).toBe(12);
      expect(SaveManager.addGems).not.toHaveBeenCalled();
    });

    it('resets progress when the month changes', () => {
      const data = {
        tower: {
          currentFloor: 41, highestFloor: 40, totalClears: 55, bossClears: { 40: 1 },
          season: { id: '2026-08', bestFloor: 40, clearedAt: 1756000000000 },
          seasonHistory: [], bestFloorAllTime: 40
        }
      };
      SaveManager.load.mockReturnValue(data);

      const result = TowerSystem.ensureSeason(new Date('2026-09-03T03:00:00Z'));

      expect(result.reset).toBe(true);
      expect(result.seasonId).toBe('2026-09');
      expect(data.tower.currentFloor).toBe(1);
      expect(data.tower.highestFloor).toBe(0);
      expect(data.tower.totalClears).toBe(0);
      expect(data.tower.bossClears).toEqual({});
      expect(data.tower.season).toEqual({ id: '2026-09', bestFloor: 0, clearedAt: null });
    });

    it('preserves the finished season record and all-time best across the reset', () => {
      const data = {
        tower: {
          currentFloor: 41, highestFloor: 40, totalClears: 55, bossClears: {},
          season: { id: '2026-08', bestFloor: 37, clearedAt: 1756000000000 },
          seasonHistory: [{ id: '2026-07', bestFloor: 22, clearedAt: 1753000000000 }],
          bestFloorAllTime: 37
        }
      };
      SaveManager.load.mockReturnValue(data);

      TowerSystem.ensureSeason(new Date('2026-09-03T03:00:00Z'));

      // 아카이브: 시즌 기록과 highestFloor 중 더 높은 값이 남는다
      expect(data.tower.seasonHistory[0]).toEqual({
        id: '2026-08', bestFloor: 40, clearedAt: 1756000000000
      });
      expect(data.tower.seasonHistory[1]).toEqual({
        id: '2026-07', bestFloor: 22, clearedAt: 1753000000000
      });
      expect(data.tower.bestFloorAllTime).toBe(40);
    });

    it('grants reset rewards using the existing resetTower rule', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 51, highestFloor: 50, totalClears: 60, bossClears: {},
          season: { id: '2026-08', bestFloor: 50, clearedAt: null },
          seasonHistory: [], bestFloorAllTime: 50
        }
      });

      const result = TowerSystem.ensureSeason(new Date('2026-09-03T03:00:00Z'));

      // resetTower 규칙: 최고층 × 5 + floor(최고층/10) × 50 = 250 + 250 = 500
      expect(result.rewards.gems).toBe(500);
      expect(SaveManager.addGems).toHaveBeenCalledWith(500);
    });

    it('emits SEASON_RESET with the archived season', () => {
      SaveManager.load.mockReturnValue({
        tower: {
          currentFloor: 21, highestFloor: 20, totalClears: 20, bossClears: {},
          season: { id: '2026-08', bestFloor: 20, clearedAt: 1756000000000 },
          seasonHistory: [], bestFloorAllTime: 20
        }
      });

      TowerSystem.ensureSeason(new Date('2026-09-03T03:00:00Z'));

      expect(EventBus.emit).toHaveBeenCalledWith(
        'tower_season_reset',
        expect.objectContaining({
          seasonId: '2026-09',
          previousSeason: { id: '2026-08', bestFloor: 20, clearedAt: 1756000000000 }
        })
      );
    });

    it('keeps season records through a manual resetTower', () => {
      const season = { id: '2026-09', bestFloor: 33, clearedAt: 1757000000000 };
      const history = [{ id: '2026-08', bestFloor: 28, clearedAt: 1755000000000 }];
      const data = {
        tower: {
          currentFloor: 34, highestFloor: 33, totalClears: 40, bossClears: {},
          season, seasonHistory: history, bestFloorAllTime: 33
        }
      };
      SaveManager.load.mockReturnValue(data);

      TowerSystem.resetTower();

      expect(data.tower.currentFloor).toBe(1);
      expect(data.tower.highestFloor).toBe(0);
      expect(data.tower.season).toEqual(season);
      expect(data.tower.seasonHistory).toEqual(history);
      expect(data.tower.bestFloorAllTime).toBe(33);
    });
  });

  describe('season — clearFloor 기록 갱신', () => {
    it('raises the season best floor on a new clear', () => {
      const seasonId = TowerSystem.getSeasonId();
      const data = {
        tower: {
          currentFloor: 5, highestFloor: 4, totalClears: 4, bossClears: {},
          season: { id: seasonId, bestFloor: 4, clearedAt: null },
          seasonHistory: [], bestFloorAllTime: 4
        }
      };
      SaveManager.load.mockReturnValue(data);

      const result = TowerSystem.clearFloor(5, { victory: true });

      expect(result.success).toBe(true);
      expect(result.season.bestFloor).toBe(5);
      expect(result.season.improved).toBe(true);
      expect(data.tower.season.bestFloor).toBe(5);
      expect(typeof data.tower.season.clearedAt).toBe('number');
    });

    it('never lowers the season best floor when replaying a lower floor', () => {
      const seasonId = TowerSystem.getSeasonId();
      const data = {
        tower: {
          currentFloor: 3, highestFloor: 20, totalClears: 30, bossClears: {},
          season: { id: seasonId, bestFloor: 20, clearedAt: 1757000000000 },
          seasonHistory: [], bestFloorAllTime: 20
        }
      };
      SaveManager.load.mockReturnValue(data);

      const result = TowerSystem.clearFloor(3, { victory: true });

      expect(result.season.bestFloor).toBe(20);
      expect(result.season.improved).toBe(false);
      expect(data.tower.season.clearedAt).toBe(1757000000000);
    });
  });

  describe('season — 순위 정렬', () => {
    it('orders by best floor desc, then earliest clear, then power desc', () => {
      const ranked = TowerSystem.sortSeasonRankings([
        { user_id: 'c', best_floor: 30, cleared_at: '2026-09-05T00:00:00Z', power: 9000 },
        { user_id: 'a', best_floor: 50, cleared_at: '2026-09-10T00:00:00Z', power: 8000 },
        { user_id: 'b', best_floor: 50, cleared_at: '2026-09-02T00:00:00Z', power: 100 }
      ]);

      expect(ranked.map(r => r.user_id)).toEqual(['b', 'a', 'c']);
      expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
    });

    it('breaks a full tie on clear time with higher power', () => {
      const ranked = TowerSystem.sortSeasonRankings([
        { user_id: 'low', best_floor: 40, cleared_at: '2026-09-04T00:00:00Z', power: 1000 },
        { user_id: 'high', best_floor: 40, cleared_at: '2026-09-04T00:00:00Z', power: 5000 }
      ]);

      expect(ranked[0].user_id).toBe('high');
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
    });
  });

  describe('season — 제출 / 리더보드 / 내 순위', () => {
    beforeEach(() => {
      localStorageMock.clear();
      mockIsOnline.mockReturnValue(false);
      SaveManager._userId = 'user-me';
      SaveManager.load.mockReturnValue({
        player: { name: '테스트등반가' },
        parties: [['char_1']],
        characters: [{ id: 'char_1', level: 12 }],
        tower: {
          currentFloor: 26, highestFloor: 25, totalClears: 25, bossClears: {},
          season: { id: '2026-09', bestFloor: 25, clearedAt: Date.parse('2026-09-02T00:00:00Z') },
          seasonHistory: [], bestFloorAllTime: 25
        }
      });
    });

    it('caches the record locally when offline', async () => {
      const result = await TowerSystem.submitSeasonRecord({ now: new Date('2026-09-03T03:00:00Z') });

      expect(result.success).toBe(true);
      expect(result.offline).toBe(true);
      expect(result.record).toMatchObject({
        user_id: 'user-me',
        season_id: '2026-09',
        player_name: '테스트등반가',
        best_floor: 25,
        cleared_at: '2026-09-02T00:00:00.000Z'
      });
      // 파티 전투력(모킹된 ProgressionSystem: level × 100)
      expect(result.record.power).toBe(1200);
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('upserts to Supabase when online', async () => {
      mockIsOnline.mockReturnValue(true);

      const result = await TowerSystem.submitSeasonRecord({
        now: new Date('2026-09-03T03:00:00Z'),
        power: 7777
      });

      expect(result.success).toBe(true);
      expect(result.offline).toBeUndefined();
      expect(mockSeasonQuery.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ season_id: '2026-09', best_floor: 25, power: 7777 }),
        { onConflict: 'user_id,season_id' }
      );
    });

    it('falls back to the local cache when the leaderboard query fails', async () => {
      await TowerSystem.submitSeasonRecord({ now: new Date('2026-09-03T03:00:00Z') });

      mockIsOnline.mockReturnValue(true);
      mockSeasonQuery.limit.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });

      const result = await TowerSystem.getSeasonLeaderboard('2026-09', 20);

      expect(result.success).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.error).toBe('boom');
      expect(result.rankings).toHaveLength(1);
      expect(result.rankings[0]).toMatchObject({ user_id: 'user-me', best_floor: 25, rank: 1 });
    });

    it('serves the offline leaderboard from the local cache', async () => {
      await TowerSystem.submitSeasonRecord({ now: new Date('2026-09-03T03:00:00Z') });

      const result = await TowerSystem.getSeasonLeaderboard('2026-09', 20);

      expect(result.offline).toBe(true);
      expect(result.seasonId).toBe('2026-09');
      expect(result.rankings[0].user_id).toBe('user-me');
    });

    it('returns ranked rows from Supabase and honours the limit', async () => {
      mockIsOnline.mockReturnValue(true);
      mockSeasonQuery.limit.mockResolvedValueOnce({
        data: [
          { user_id: 'u2', season_id: '2026-09', best_floor: 60, cleared_at: '2026-09-08T00:00:00Z', power: 100 },
          { user_id: 'u1', season_id: '2026-09', best_floor: 80, cleared_at: '2026-09-09T00:00:00Z', power: 200 }
        ],
        error: null
      });

      const result = await TowerSystem.getSeasonLeaderboard('2026-09', 1);

      expect(result.success).toBe(true);
      expect(result.rankings).toHaveLength(1);
      expect(result.rankings[0]).toMatchObject({ user_id: 'u1', rank: 1 });
    });

    it('computes my rank from the local cache when offline', async () => {
      await TowerSystem.submitSeasonRecord({ now: new Date('2026-09-03T03:00:00Z') });

      const result = await TowerSystem.getMyRank('2026-09');

      expect(result.offline).toBe(true);
      expect(result.rank).toBe(1);
      expect(result.bestFloor).toBe(25);
    });

    it('reads my rank from the Supabase ranking view when online', async () => {
      mockIsOnline.mockReturnValue(true);
      mockSeasonQuery.limit.mockResolvedValueOnce({
        data: [{ user_id: 'user-me', season_id: '2026-09', best_floor: 25, cleared_at: null, power: 1200, rank: 7 }],
        error: null
      });

      const result = await TowerSystem.getMyRank('2026-09');

      expect(result.rank).toBe(7);
      expect(result.bestFloor).toBe(25);
    });

    it('reports a null rank when the player has no season record', async () => {
      mockIsOnline.mockReturnValue(true);
      mockSeasonQuery.limit.mockResolvedValueOnce({ data: [], error: null });

      const result = await TowerSystem.getMyRank('2026-09');

      expect(result.rank).toBeNull();
    });
  });

  // TOWER-02: 실제 데이터 파일 무결성 (vi.mock 우회 — fs 직접 읽기)
  describe('tower.json data integrity (real file)', () => {
    const realTower = JSON.parse(
      readFileSync(new URL('../../src/data/tower.json', import.meta.url), 'utf-8')
    );
    const realEnemies = JSON.parse(
      readFileSync(new URL('../../src/data/enemies.json', import.meta.url), 'utf-8')
    );
    const enemyIds = new Set(realEnemies.enemies.map(e => e.id));

    it('has exactly 100 floors covering 1..100 without gaps', () => {
      expect(realTower.floors).toHaveLength(100);
      const nums = realTower.floors.map(f => f.floor).sort((a, b) => a - b);
      for (let i = 0; i < 100; i++) {
        expect(nums[i]).toBe(i + 1);
      }
    });

    it('marks exactly config.bossFloors as boss floors with bossReward', () => {
      const bossFloors = realTower.floors.filter(f => f.isBoss);
      expect(bossFloors.map(f => f.floor)).toEqual([...realTower.config.bossFloors]);

      bossFloors.forEach(f => {
        expect(f.bossReward).toBeTruthy();
        expect(f.bossReward.gems).toBeGreaterThan(0);
        expect(typeof f.bossReward.srTicket).toBe('number');
        expect(typeof f.bossReward.ssrTicket).toBe('number');
      });

      realTower.floors
        .filter(f => !f.isBoss)
        .forEach(f => expect(f.bossReward).toBeUndefined());
    });

    it('uses only enemy ids that exist in enemies.json', () => {
      realTower.floors.forEach(floor => {
        floor.enemies.forEach(def => {
          expect(enemyIds.has(def.id)).toBe(true);
        });
      });
    });

    it('keeps enemy counts within 1..5 per entry', () => {
      realTower.floors.forEach(floor => {
        floor.enemies.forEach(def => {
          expect(def.count).toBeGreaterThanOrEqual(1);
          expect(def.count).toBeLessThanOrEqual(5);
        });
      });
    });

    // BAL-BLK03 밸런스 v1.1 (docs/balance/BALANCE_DESIGN_v1.md §9-3/§9-6):
    // v1의 400+140×(floor−1)(층100=14,260)이 등급 역전 수정(Omar/Leon Asgard 하향)으로
    // 재계산된 파티 상한(13,347)을 초과해 94~100층 도달 불가 상태였다.
    // v1.1에서 recommendedPower = 400 + 128 × (floor − 1) 로 재재스케일링했다
    // (층1=400, 층100=13,072 ≤ 파티 상한 13,347).
    it('has monotonic recommendedPower following 400 + 128*(floor-1), floor100 = 13072', () => {
      const byFloor = [...realTower.floors].sort((a, b) => a.floor - b.floor);

      for (let i = 1; i < byFloor.length; i++) {
        expect(byFloor[i].recommendedPower).toBeGreaterThan(byFloor[i - 1].recommendedPower);
      }
      byFloor.forEach((f, i) => {
        expect(f.recommendedPower).toBe(400 + 128 * i);
      });
      expect(byFloor[0].recommendedPower).toBe(400);
      expect(byFloor[99].recommendedPower).toBe(13072);
    });

    it('maps reward bands to PRD §5.2 shard rarities', () => {
      expect(realTower.rewards['1-10'].shardRarity).toBeNull();
      expect(realTower.rewards['11-30'].shardRarity).toBe('R');
      expect(realTower.rewards['31-50'].shardRarity).toBe('SR');
      expect(realTower.rewards['51-70'].shardRarity).toBe('SSR');
      expect(realTower.rewards['71-100'].shardRarity).toBe('LEGENDARY');
    });

    it('escalates boss gem rewards without decrease', () => {
      const gems = realTower.config.bossFloors.map(
        f => realTower.floors.find(fl => fl.floor === f).bossReward.gems
      );

      for (let i = 1; i < gems.length; i++) {
        expect(gems[i]).toBeGreaterThanOrEqual(gems[i - 1]);
      }
    });
  });
});

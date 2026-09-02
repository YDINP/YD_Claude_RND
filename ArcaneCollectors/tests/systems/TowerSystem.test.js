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

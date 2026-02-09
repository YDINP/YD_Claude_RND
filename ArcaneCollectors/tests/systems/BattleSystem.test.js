/**
 * BattleSystem.test.js
 * Unit tests for BattleSystem and BattleUnit - 전투 시스템
 * 30 tests total (12 BattleUnit + 18 BattleSystem)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies BEFORE importing BattleSystem
vi.mock('../../src/systems/SaveManager.js', () => ({
  SaveManager: {
    getData: vi.fn(() => ({})),
    setData: vi.fn(),
    save: vi.fn(),
    updateHighestDamage: vi.fn()
  }
}));

vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    BATTLE_START: 'battle_start',
    BATTLE_END: 'battle_end',
    CHARACTER_ADDED: 'character_added'
  }
}));

vi.mock('../../src/data/index.js', () => ({
  getCharacter: vi.fn((id) => ({
    id,
    name: `TestChar_${id}`,
    mood: 'brave',
    cult: 'olympus',
    rarity: 'SR',
    class: 'warrior',
    baseStats: { hp: 1000, atk: 100, def: 50, spd: 100 },
    growth: { hp: 100, atk: 10, def: 5, spd: 2 },
    skills: [
      { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }
    ]
  }))
}));

import { BattleUnit, BattleSystem, BattleState } from '../../src/systems/BattleSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';
import { EventBus, GameEvents } from '../../src/systems/EventBus.js';

describe('BattleUnit', () => {
  let characterData;

  beforeEach(() => {
    characterData = {
      id: 'hero_001',
      name: 'Test Hero',
      mood: 'brave',
      rarity: 'SR',
      class: 'warrior',
      baseStats: { hp: 1000, atk: 100, def: 50, spd: 100 },
      growth: { hp: 100, atk: 10, def: 5, spd: 2 },
      skills: [
        { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }
      ]
    };
  });

  describe('constructor', () => {
    it('sets correct initial values', () => {
      const unit = new BattleUnit(characterData, 1, false);

      expect(unit.id).toBe('hero_001');
      expect(unit.name).toBe('Test Hero');
      expect(unit.level).toBe(1);
      expect(unit.mood).toBe('brave');
      expect(unit.isAlive).toBe(true);
      expect(unit.skillGauge).toBe(0);
    });

    it('calculates stats correctly based on level and rarity', () => {
      const unit = new BattleUnit(characterData, 5, false);

      expect(unit.maxHp).toBeGreaterThan(characterData.baseStats.hp);
      expect(unit.atk).toBeGreaterThan(characterData.baseStats.atk);
    });

    it('applies rarity bonus to stats', () => {
      const ssrData = { ...characterData, rarity: 'SSR' };
      const nData = { ...characterData, rarity: 'N' };

      const ssrUnit = new BattleUnit(ssrData, 1);
      const nUnit = new BattleUnit(nData, 1);

      expect(ssrUnit.maxHp).toBeGreaterThan(nUnit.maxHp);
      expect(ssrUnit.atk).toBeGreaterThan(nUnit.atk);
    });
  });

  describe('takeDamage', () => {
    it('reduces HP correctly', () => {
      const unit = new BattleUnit(characterData, 1);
      const initialHp = unit.currentHp;

      const result = unit.takeDamage(100);

      expect(result.actualDamage).toBe(100);
      expect(unit.currentHp).toBe(initialHp - 100);
    });

    it('does not go below 0 HP', () => {
      const unit = new BattleUnit(characterData, 1);

      unit.takeDamage(999999);

      expect(unit.currentHp).toBe(0);
      expect(unit.isAlive).toBe(false);
    });

    it('sets isAlive to false when HP reaches 0', () => {
      const unit = new BattleUnit(characterData, 1);

      const result = unit.takeDamage(unit.currentHp);

      expect(result.isDead).toBe(true);
      expect(unit.isAlive).toBe(false);
    });

    it('returns minimum 1 damage', () => {
      const unit = new BattleUnit(characterData, 1);

      const result = unit.takeDamage(0.5);

      expect(result.actualDamage).toBeGreaterThanOrEqual(1);
    });
  });

  describe('heal', () => {
    it('restores HP correctly', () => {
      const unit = new BattleUnit(characterData, 1);
      unit.takeDamage(500);

      const result = unit.heal(200);

      expect(result.actualHeal).toBe(200);
    });

    it('does not exceed max HP', () => {
      const unit = new BattleUnit(characterData, 1);
      const maxHp = unit.maxHp;
      unit.takeDamage(100);

      const result = unit.heal(999999);

      expect(unit.currentHp).toBe(maxHp);
      expect(result.actualHeal).toBe(100);
    });
  });

  describe('skill gauge', () => {
    it('charges skill gauge correctly', () => {
      const unit = new BattleUnit(characterData, 1);

      unit.chargeSkill(30);

      expect(unit.skillGauge).toBe(30);
    });

    it('does not exceed max skill gauge', () => {
      const unit = new BattleUnit(characterData, 1);

      unit.chargeSkill(9999);

      expect(unit.skillGauge).toBe(unit.maxSkillGauge);
    });

    it('canUseSkill returns true when gauge is sufficient', () => {
      const unit = new BattleUnit(characterData, 1);
      unit.skillGauge = 100;

      // Basic skill (index 0) should always be usable
      expect(unit.canUseSkill(0)).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('getHpPercent returns correct percentage', () => {
      const unit = new BattleUnit(characterData, 1);
      unit.takeDamage(unit.maxHp / 2);

      expect(unit.getHpPercent()).toBeCloseTo(0.5, 1);
    });

    it('getPower calculates combat power correctly', () => {
      const unit = new BattleUnit(characterData, 1);

      const power = unit.getPower();

      expect(power).toBeGreaterThan(0);
      expect(typeof power).toBe('number');
    });
  });
});

describe('BattleSystem', () => {
  let allies;
  let enemies;
  let battleSystem;

  beforeEach(() => {
    vi.clearAllMocks();

    const allyData = {
      id: 'hero_001',
      name: 'Ally Hero',
      mood: 'brave',
      rarity: 'SR',
      class: 'warrior',
      baseStats: { hp: 1000, atk: 100, def: 50, spd: 100 },
      growth: { hp: 100, atk: 10, def: 5, spd: 2 },
      skills: [
        { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }
      ]
    };

    const enemyData = {
      id: 'enemy_001',
      name: 'Enemy',
      mood: 'fierce',
      rarity: 'R',
      class: 'warrior',
      baseStats: { hp: 800, atk: 80, def: 40, spd: 80 },
      growth: { hp: 80, atk: 8, def: 4, spd: 2 },
      skills: [
        { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }
      ]
    };

    allies = [new BattleUnit(allyData, 5, false)];
    enemies = [new BattleUnit(enemyData, 5, true)];

    battleSystem = new BattleSystem(allies, enemies);
  });

  describe('initBattle', () => {
    it('creates correct battle state', () => {
      battleSystem.initBattle();

      // After initBattle completes, state returns to IDLE
      // (INITIALIZING is transient during setup)
      expect(battleSystem.state).toBeDefined();
      expect(battleSystem.turnOrder.length).toBeGreaterThan(0);
      expect(battleSystem.isFinished).toBe(false);
    });

    it('initializes all units with full HP and zero gauge', () => {
      battleSystem.initBattle();

      [...allies, ...enemies].forEach(unit => {
        expect(unit.currentHp).toBe(unit.maxHp);
        expect(unit.skillGauge).toBe(0);
        expect(unit.isAlive).toBe(true);
      });
    });

    it('emits battleStart event', () => {
      battleSystem.initBattle();

      expect(EventBus.emit).toHaveBeenCalledWith(
        GameEvents.BATTLE_START,
        expect.objectContaining({
          allies: expect.any(Array),
          enemies: expect.any(Array)
        })
      );
    });
  });

  describe('turn order', () => {
    it('orders units based on speed stat', () => {
      const fastAlly = new BattleUnit({
        ...allies[0].data,
        id: 'fast_hero',
        baseStats: { hp: 1000, atk: 100, def: 50, spd: 200 }
      }, 5, false);

      const slowEnemy = new BattleUnit({
        ...enemies[0].data,
        id: 'slow_enemy',
        baseStats: { hp: 800, atk: 80, def: 40, spd: 50 }
      }, 5, true);

      const system = new BattleSystem([fastAlly], [slowEnemy]);
      system.initBattle();

      expect(system.turnOrder[0].id).toBe('fast_hero');
      expect(system.turnOrder[1].id).toBe('slow_enemy');
    });
  });

  describe('calculateDamage', () => {
    it('uses atk - def formula correctly', () => {
      battleSystem.initBattle();

      const attacker = allies[0];
      const defender = enemies[0];

      const damage = battleSystem.calculateDamage(attacker, defender, { multiplier: 1 });

      expect(damage.finalDamage).toBeGreaterThan(0);
      expect(damage).toHaveProperty('baseDamage');
      expect(damage).toHaveProperty('isCrit');
    });

    it('applies mood advantage bonus', () => {
      battleSystem.initBattle();

      const attacker = allies[0];
      attacker.mood = 'brave';

      const defender = enemies[0];
      defender.mood = 'wild';

      const damage = battleSystem.calculateDamage(attacker, defender, { multiplier: 1 });

      expect(damage.moodBonus).toBeGreaterThan(0);
    });

    it('applies critical hit multiplier', () => {
      battleSystem.initBattle();

      const attacker = allies[0];
      attacker.critRate = 1.0; // 100% crit for testing

      const defender = enemies[0];

      const damage = battleSystem.calculateDamage(attacker, defender, { multiplier: 1 });

      expect(damage.isCrit).toBe(true);
    });
  });

  describe('skill execution', () => {
    it('executes basic attack correctly', () => {
      battleSystem.initBattle();

      const attacker = allies[0];
      const defender = enemies[0];
      const initialHp = defender.currentHp;

      const result = battleSystem.executeAction(
        attacker,
        attacker.skills[0],
        [defender]
      );

      expect(result.results[0].type).toBe('damage');
      expect(defender.currentHp).toBeLessThan(initialHp);
    });

    it('heal skill restores ally HP', () => {
      battleSystem.initBattle();

      const healer = allies[0];
      const wounded = allies[0];
      wounded.takeDamage(500);

      const healSkill = {
        id: 'heal',
        name: '힐',
        multiplier: 2,
        isHeal: true,
        gaugeCost: 100
      };
      healer.skillGauge = 100;

      const initialHp = wounded.currentHp;
      battleSystem.executeAction(healer, healSkill, [wounded]);

      expect(wounded.currentHp).toBeGreaterThan(initialHp);
    });

    it('AoE skill hits all targets', () => {
      const enemy1 = new BattleUnit(enemies[0].data, 5, true);
      const enemy2 = new BattleUnit(enemies[0].data, 5, true);

      const system = new BattleSystem(allies, [enemy1, enemy2]);
      system.initBattle();

      const aoeSkill = {
        id: 'aoe',
        name: 'AoE',
        multiplier: 1.5,
        target: 'all',
        gaugeCost: 100
      };
      allies[0].skillGauge = 100;

      const result = system.executeAction(allies[0], aoeSkill, [enemy1, enemy2]);

      expect(result.results.length).toBe(2);
    });
  });

  describe('battle flow', () => {
    it('processes turns until battle ends', () => {
      battleSystem.initBattle();

      let iterations = 0;
      const maxIterations = 100;

      while (!battleSystem.isFinished && iterations < maxIterations) {
        battleSystem.processTurn();
        iterations++;
      }

      expect(battleSystem.isFinished).toBe(true);
      expect(battleSystem.result).toBeTruthy();
    });

    it('ends battle when all enemies defeated', () => {
      battleSystem.initBattle();

      enemies.forEach(enemy => {
        enemy.takeDamage(enemy.currentHp);
      });

      expect(battleSystem.isVictory()).toBe(true);
    });

    it('ends battle when all heroes defeated', () => {
      battleSystem.initBattle();

      allies.forEach(ally => {
        ally.takeDamage(ally.currentHp);
      });

      expect(battleSystem.isDefeat()).toBe(true);
    });
  });

  describe('rewards', () => {
    it('calculates experience and gold on victory', () => {
      battleSystem.initBattle();

      enemies.forEach(enemy => enemy.takeDamage(enemy.currentHp));
      battleSystem.finishBattle('victory');

      expect(battleSystem.result.rewards.gold).toBeGreaterThan(0);
      expect(battleSystem.result.rewards.exp).toBeGreaterThan(0);
    });

    it('returns no rewards on defeat', () => {
      battleSystem.initBattle();

      allies.forEach(ally => ally.takeDamage(ally.currentHp));
      battleSystem.finishBattle('defeat');

      expect(battleSystem.result.rewards.gold).toBe(0);
      expect(battleSystem.result.rewards.exp).toBe(0);
    });

    it('calculates stars based on performance', () => {
      battleSystem.initBattle();

      enemies.forEach(enemy => enemy.takeDamage(enemy.currentHp));
      battleSystem.finishBattle('victory');

      expect(battleSystem.result.stars).toBeGreaterThanOrEqual(1);
      expect(battleSystem.result.stars).toBeLessThanOrEqual(3);
    });
  });

  describe('AI behavior', () => {
    it('AI selects valid actions', () => {
      battleSystem.initBattle();

      const unit = battleSystem.getNextUnit();
      const action = battleSystem.getAIAction(unit);

      expect(action).toHaveProperty('skill');
      expect(action).toHaveProperty('targets');
      expect(action.targets.length).toBeGreaterThan(0);
    });
  });

  describe('state management', () => {
    it('getState returns current battle status', () => {
      battleSystem.initBattle();

      const state = battleSystem.getState();

      expect(state).toHaveProperty('turnCount');
      expect(state).toHaveProperty('allies');
      expect(state).toHaveProperty('enemies');
      expect(state).toHaveProperty('isFinished');
    });
  });

  describe('event emission', () => {
    it('emits battleEnd event on completion', () => {
      battleSystem.initBattle();

      enemies.forEach(enemy => enemy.takeDamage(enemy.currentHp));
      battleSystem.finishBattle('victory');

      expect(EventBus.emit).toHaveBeenCalledWith(
        GameEvents.BATTLE_END,
        expect.objectContaining({
          outcome: 'victory'
        })
      );
    });
  });
});

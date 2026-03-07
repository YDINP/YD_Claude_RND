/**
 * BattleSystem - 전투 시스템
 * 턴제 전투, 스킬, 분위기 상성, AI 관리
 *
 * Design Patterns:
 * - Strategy Pattern: 스킬 효과 (SkillStrategy)
 * - Observer Pattern: 전투 이벤트 (BattleEventEmitter)
 * - State Pattern: 전투 상태 관리 (BattleState)
 */
import { EventBus, GameEvents } from './EventBus.js';
import { SaveManager } from './SaveManager.js';
import { getCharacter, getCharacterOrHero } from '../data/index.js';
import { AttackCommand, SkillCommand, DefendCommand } from './commands/index.js';
import { ProgressionSystem } from './ProgressionSystem.js';

// ============================================
// Strategy Pattern: 스킬 효과 전략
// ============================================

/**
 * 스킬 전략 기본 인터페이스
 */
class SkillStrategy {
  execute(attacker, targets, battleSystem) {
    throw new Error('execute() must be implemented');
  }
}

/**
 * 기본 공격 전략
 */
class BasicAttackStrategy extends SkillStrategy {
  execute(attacker, targets, battleSystem) {
    console.log(`[Battle] BasicAttackStrategy: ${attacker.name} attacks`);
    const results = [];

    targets.forEach(target => {
      if (!target.isAlive) return;

      const damage = battleSystem.calculateDamage(attacker, target, { multiplier: 1 });
      const damageResult = target.takeDamage(damage.finalDamage);

      results.push({
        target: target.id,
        type: 'damage',
        amount: damageResult.actualDamage,
        isCrit: damage.isCrit,
        isDead: damageResult.isDead
      });

      // 게이지 충전
      attacker.chargeSkill(20);
    });

    return results;
  }
}

/**
 * 강력 일격 전략
 */
class PowerStrikeStrategy extends SkillStrategy {
  execute(attacker, targets, battleSystem) {
    console.log(`[Battle] PowerStrikeStrategy: ${attacker.name} uses Power Strike`);
    const results = [];

    targets.forEach(target => {
      if (!target.isAlive) return;

      const damage = battleSystem.calculateDamage(attacker, target, { multiplier: 2.5 });
      const damageResult = target.takeDamage(damage.finalDamage);

      results.push({
        target: target.id,
        type: 'damage',
        amount: damageResult.actualDamage,
        isCrit: damage.isCrit,
        isDead: damageResult.isDead,
        isSkill: true
      });
    });

    // 게이지 소비
    attacker.skillGauge = 0;

    return results;
  }
}

/**
 * 힐 전략
 */
class HealStrategy extends SkillStrategy {
  execute(attacker, targets, battleSystem) {
    console.log(`[Battle] HealStrategy: ${attacker.name} heals`);
    const results = [];

    targets.forEach(target => {
      if (!target.isAlive) return;

      const healAmount = Math.floor(attacker.atk * 2);
      const healResult = target.heal(healAmount);

      results.push({
        target: target.id,
        type: 'heal',
        amount: healResult.actualHeal
      });
    });

    // 게이지 소비
    attacker.skillGauge = 0;

    return results;
  }
}

/**
 * 전체 공격 전략
 */
class AoeAttackStrategy extends SkillStrategy {
  execute(attacker, targets, battleSystem) {
    console.log(`[Battle] AoeAttackStrategy: ${attacker.name} uses AOE attack`);
    const results = [];

    targets.forEach(target => {
      if (!target.isAlive) return;

      // AOE는 데미지가 70%
      const damage = battleSystem.calculateDamage(attacker, target, { multiplier: 1.5 });
      const damageResult = target.takeDamage(damage.finalDamage);

      results.push({
        target: target.id,
        type: 'damage',
        amount: damageResult.actualDamage,
        isCrit: damage.isCrit,
        isDead: damageResult.isDead,
        isAoe: true
      });
    });

    // 게이지 소비
    attacker.skillGauge = 0;

    return results;
  }
}

// 스킬 전략 맵
const SKILL_STRATEGIES = {
  basic: new BasicAttackStrategy(),
  skill1: new PowerStrikeStrategy(),
  heal: new HealStrategy(),
  aoe: new AoeAttackStrategy()
};

// ============================================
// 스킬 쿨타임 & 교단 시너지 시스템
// ============================================

/**
 * 스킬 쿨타임 관리자
 * 각 캐릭터의 스킬 쿨타임을 턴마다 추적
 */
class SkillCooldownManager {
  constructor() {
    /** @type {Map<string, Map<string, number>>} unitId -> (skillId -> remainingCooldown) */
    this.cooldowns = new Map();
  }

  /**
   * 유닛 쿨타임 초기화
   * @param {string} unitId
   * @param {Array<Object>} characterSkills character_skills 배열
   */
  initUnit(unitId, characterSkills) {
    const skillMap = new Map();
    characterSkills.forEach(skill => {
      if (skill.trigger_condition?.type === 'cooldown') {
        const initial = skill.trigger_condition.initial_cooldown || 0;
        skillMap.set(skill.skill_id, initial);
      }
    });
    this.cooldowns.set(unitId, skillMap);
    console.log(`[SkillCD] Initialized cooldowns for unit ${unitId}`);
  }

  /**
   * 쿨타임 감소 (턴 시작 시 호출)
   * @param {string} unitId
   */
  tickCooldowns(unitId) {
    const skillMap = this.cooldowns.get(unitId);
    if (!skillMap) return;
    skillMap.forEach((cd, skillId) => {
      if (cd > 0) {
        skillMap.set(skillId, cd - 1);
        console.log(`[SkillCD] ${unitId} - ${skillId} cooldown: ${cd} -> ${cd - 1}`);
      }
    });
  }

  /**
   * 스킬 발동 가능 여부 (쿨타임=0)
   * @param {string} unitId
   * @param {string} skillId
   * @returns {boolean}
   */
  isReady(unitId, skillId) {
    const skillMap = this.cooldowns.get(unitId);
    if (!skillMap) return false;
    const cd = skillMap.get(skillId);
    return cd !== undefined && cd === 0;
  }

  /**
   * 스킬 사용 후 쿨타임 리셋
   * @param {string} unitId
   * @param {string} skillId
   * @param {number} cooldownTurns
   */
  resetCooldown(unitId, skillId, cooldownTurns) {
    const skillMap = this.cooldowns.get(unitId);
    if (!skillMap) return;
    skillMap.set(skillId, cooldownTurns);
    console.log(`[SkillCD] ${unitId} - ${skillId} reset to ${cooldownTurns} turns`);
  }

  /**
   * 남은 쿨타임 조회
   * @param {string} unitId
   * @param {string} skillId
   * @returns {number}
   */
  getRemaining(unitId, skillId) {
    const skillMap = this.cooldowns.get(unitId);
    if (!skillMap) return 0;
    return skillMap.get(skillId) || 0;
  }
}

/**
 * 교단 시너지 계산기 (cult 기반)
 */
class CultSynergyCalculator {
  /**
   * 파티 내 교단별 인원수 계산 후 시너지 보너스 반환
   * @param {Array<BattleUnit>} allies
   * @param {Array<Object>} synergySkills skills.json synergy_skills
   * @returns {{ atk: number, def: number }} 보정 배율 (1.0 기준)
   */
  static calculate(allies, synergySkills) {
    const cultCounts = {};
    allies.forEach(unit => {
      const cult = unit.data?.cult || unit.data?.faction || null;
      if (cult) {
        cultCounts[cult] = (cultCounts[cult] || 0) + 1;
      }
    });

    let atkBonus = 1.0;
    let defBonus = 1.0;

    if (!synergySkills || !Array.isArray(synergySkills)) return { atk: atkBonus, def: defBonus };

    Object.entries(cultCounts).forEach(([cult, count]) => {
      // 해당 교단의 시너지 조건 중 count에 부합하는 최고 단계 적용
      const matched = synergySkills
        .filter(s => s.cult === cult && s.required_count <= count)
        .sort((a, b) => b.required_count - a.required_count);

      if (matched.length === 0) return;
      const best = matched[0];

      const effects = best.effects || (best.effect ? [best.effect] : []);
      effects.forEach(eff => {
        if (eff.stat === 'ATK') atkBonus *= eff.modifier;
        if (eff.stat === 'DEF') defBonus *= eff.modifier;
      });

      console.log(`[CultSynergy] ${cult} x${count}: ATK x${atkBonus.toFixed(2)}, DEF x${defBonus.toFixed(2)}`);
    });

    return { atk: atkBonus, def: defBonus };
  }

  /**
   * 교단 시너지 보너스를 파티에 적용
   * @param {Array<BattleUnit>} allies
   * @param {{ atk: number, def: number }} bonus
   */
  static apply(allies, bonus) {
    allies.forEach(unit => {
      unit.atk = Math.floor(unit.atk * bonus.atk);
      unit.def = Math.floor(unit.def * bonus.def);
    });
    console.log(`[CultSynergy] Applied to party: ATK x${bonus.atk.toFixed(2)}, DEF x${bonus.def.toFixed(2)}`);
  }
}

// ============================================
// Observer Pattern: 전투 이벤트
// ============================================

/**
 * 전투 이벤트 발행자
 */
class BattleEventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    console.log(`[Battle] Event listener added: ${event}`);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    console.log(`[Battle] Event emitted: ${event}`, data);
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }

  clear() {
    this.listeners = {};
  }
}

// ============================================
// State Pattern: 전투 상태
// ============================================

const BattleState = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  TURN_START: 'turn_start',
  PROCESSING_ACTION: 'processing_action',
  TURN_END: 'turn_end',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  TIMEOUT: 'timeout'
};

// ============================================
// 시너지 시스템
// ============================================

/**
 * 시너지 계산기
 */
class SynergyCalculator {
  /**
   * 팀 시너지 계산
   * @param {Array<BattleUnit>} allies 아군 유닛들
   * @returns {Object} 시너지 버프
   */
  static calculate(allies) {
    console.log('[Battle] Calculating synergy...');

    const classCounts = {};
    const moodCounts = {};

    allies.forEach(unit => {
      const unitClass = unit.data?.class || 'warrior';
      const mood = unit.mood || 'neutral';

      classCounts[unitClass] = (classCounts[unitClass] || 0) + 1;
      moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });

    const buffs = { atk: 0, def: 0, spd: 0 };

    // 클래스 시너지
    Object.entries(classCounts).forEach(([cls, count]) => {
      if (count >= 4) {
        buffs.atk += 0.20;
        buffs.def += 0.15;
        buffs.spd += 0.10;
        console.log(`[Battle] Class synergy (${cls}) 4+: ATK +20%, DEF +15%, SPD +10%`);
      } else if (count >= 3) {
        buffs.atk += 0.15;
        buffs.def += 0.10;
        console.log(`[Battle] Class synergy (${cls}) 3: ATK +15%, DEF +10%`);
      } else if (count >= 2) {
        buffs.atk += 0.10;
        console.log(`[Battle] Class synergy (${cls}) 2: ATK +10%`);
      }
    });

    // 분위기 시너지
    Object.entries(moodCounts).forEach(([mood, count]) => {
      if (count >= 3) {
        buffs.atk += 0.10;
        console.log(`[Battle] Mood synergy (${mood}) 3+: ATK +10%`);
      } else if (count >= 2) {
        buffs.def += 0.05;
        console.log(`[Battle] Mood synergy (${mood}) 2: DEF +5%`);
      }
    });

    console.log('[Battle] Total synergy buffs:', buffs);
    return buffs;
  }

  /**
   * 시너지 버프 적용
   * @param {Array<BattleUnit>} allies 아군 유닛들
   * @param {Object} buffs 시너지 버프
   */
  static apply(allies, buffs) {
    allies.forEach(unit => {
      unit.atk = Math.floor(unit.atk * (1 + buffs.atk));
      unit.def = Math.floor(unit.def * (1 + buffs.def));
      unit.spd = Math.floor(unit.spd * (1 + buffs.spd));
    });
    console.log('[Battle] Synergy buffs applied to all allies');
  }
}

/**
 * 전투 유닛 클래스
 */
export class BattleUnit {
  /**
   * @param {Object} characterData 캐릭터 기본 데이터
   * @param {number} level 레벨
   * @param {boolean} isEnemy 적 유닛 여부
   */
  constructor(characterData, level = 1, isEnemy = false) {
    this.id = characterData.id;
    this.instanceId = `${characterData.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.data = characterData;
    this.name = characterData.name || characterData.id;
    this.level = level;
    this.isEnemy = isEnemy;
    this.mood = characterData.mood || 'neutral';
    this.rarity = characterData.rarity || 'N';

    // 스탯 계산
    this.maxHp = this.calculateStat('hp');
    this.currentHp = this.maxHp;
    this.atk = this.calculateStat('atk');
    this.def = this.calculateStat('def');
    this.spd = this.calculateStat('spd');
    this.critRate = characterData.critRate || 0.05;
    this.critDmg = characterData.critDmg || 1.5;

    // 전투 상태
    this.skillGauge = 0;
    this.maxSkillGauge = 100;
    this.isAlive = true;
    this.buffs = [];
    this.debuffs = [];

    // 스킬 시스템 확장: 반응 스킬 발동 추적
    this.reactionSkillFired = {}; // { skillId: boolean } — 전투 중 1회 발동 추적
    this.passiveBonusApplied = false; // 패시브 적용 여부

    // 스킬 정보 - characters.json → ascended-heroes → base-heroes 순서로 조회
    this.skills = characterData.skills && characterData.skills.length > 0
      ? characterData.skills
      : (() => {
          try {
            // v2.0: getCharacterOrHero가 characters.json → ascended-heroes → base-heroes 순서로 탐색
            const charData = getCharacterOrHero(characterData.id) || getCharacter(characterData.id);
            return charData?.skills || [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }];
          } catch {
            return [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 20 }];
          }
        })();
  }

  /**
   * 스탯 계산
   * @param {string} stat 스탯 이름
   * @returns {number} 계산된 스탯 값
   */
  calculateStat(stat) {
    const baseStats = this.data.stats || this.data.baseStats || {
      hp: 1000,
      atk: 100,
      def: 50,
      spd: 100
    };

    const growth = this.data.growthStats || this.data.growth || {
      hp: 100,
      atk: 10,
      def: 5,
      spd: 2
    };

    // 등급 보정
    const rarityBonus = {
      N: 1,
      R: 1.1,
      SR: 1.25,
      SSR: 1.5
    };

    const bonus = rarityBonus[this.rarity] || 1;
    const base = baseStats[stat] || 0;
    const growthValue = growth[stat] || 0;

    return Math.floor((base + growthValue * (this.level - 1)) * bonus);
  }

  /**
   * 피해 받기
   * @param {number} amount 피해량
   * @returns {Object} { actualDamage, isDead }
   */
  takeDamage(amount) {
    // 방어력 적용
    const actualDamage = Math.max(1, Math.floor(amount));
    this.currentHp = Math.max(0, this.currentHp - actualDamage);

    if (this.currentHp <= 0) {
      this.isAlive = false;
      this.currentHp = 0;
    }

    return {
      actualDamage,
      remainingHp: this.currentHp,
      isDead: !this.isAlive
    };
  }

  /**
   * 회복
   * @param {number} amount 회복량
   * @returns {Object} { actualHeal, currentHp }
   */
  heal(amount) {
    const actualHeal = Math.min(amount, this.maxHp - this.currentHp);
    this.currentHp = Math.min(this.maxHp, this.currentHp + actualHeal);

    return {
      actualHeal,
      currentHp: this.currentHp
    };
  }

  /**
   * 스킬 게이지 충전
   * @param {number} amount 충전량
   */
  chargeSkill(amount) {
    this.skillGauge = Math.min(this.maxSkillGauge, this.skillGauge + amount);
  }

  /**
   * 스킬 사용 가능 여부
   * @param {number} skillIndex 스킬 인덱스
   * @returns {boolean}
   */
  canUseSkill(skillIndex) {
    const skill = this.skills[skillIndex];
    if (!skill) return false;

    if (skill.gaugeCost) {
      return this.skillGauge >= skill.gaugeCost;
    }
    return true; // 기본 공격
  }

  /**
   * 스킬 게이지 소비
   * @param {number} skillIndex 스킬 인덱스
   */
  consumeSkillGauge(skillIndex) {
    const skill = this.skills[skillIndex];
    if (skill && skill.gaugeCost) {
      this.skillGauge = Math.max(0, this.skillGauge - skill.gaugeCost);
    }
  }

  /**
   * HP 퍼센트
   * @returns {number}
   */
  getHpPercent() {
    return this.currentHp / this.maxHp;
  }

  /**
   * 전투력 계산
   * @returns {number}
   */
  getPower() {
    return Math.floor(this.maxHp / 10 + this.atk + this.def + this.spd);
  }
}

/**
 * 전투 시스템 메인 클래스
 * Strategy Pattern, Observer Pattern, State Pattern 적용
 */
export class BattleSystem {
  /**
   * @param {Array<BattleUnit>} allies 아군 유닛 배열
   * @param {Array<BattleUnit>} enemies 적 유닛 배열
   */
  constructor(allies, enemies) {
    console.log('[Battle] BattleSystem created');

    this.allies = allies;
    this.enemies = enemies;
    this.turnOrder = [];
    this.currentTurnIndex = 0;
    this.turnCount = 0;
    this.isAutoMode = true;
    this.speedMultiplier = 1;
    this.battleLog = [];
    this.isFinished = false;
    this.result = null;

    // 전투 설정
    this.maxTurns = 30; // 최대 턴 제한

    // State Pattern: 전투 상태
    this.state = BattleState.IDLE;

    // Observer Pattern: 이벤트 발행자
    this.eventEmitter = new BattleEventEmitter();

    // 시너지 버프
    this.synergyBuffs = { atk: 0, def: 0, spd: 0 };

    // Command Pattern: 커맨드 히스토리
    this.commandHistory = [];
    this.maxCommandHistory = 100; // 최대 히스토리 개수

    // 스킬 시스템 확장
    this.skillCooldownManager = new SkillCooldownManager();
    /** @type {Array<Object>} character_skills from skills.json */
    this.characterSkills = [];
    /** @type {Array<Object>} synergy_skills from skills.json */
    this.synergySkillDefs = [];
    /** @type {Object} grade_multipliers from skills.json */
    this.gradeMultipliers = {
      N: { active_multiplier: 1.5, cooldown: 4, passive_bonus: 0.03 },
      R: { active_multiplier: 2.0, cooldown: 4, passive_bonus: 0.05 },
      SR: { active_multiplier: 2.8, cooldown: 3, passive_bonus: 0.08 },
      SSR: { active_multiplier: 4.0, cooldown: 3, passive_bonus: 0.12 }
    };
    // 교단 시너지 보너스 (적용 후 캐시)
    this.cultSynergyBonus = { atk: 1.0, def: 1.0 };
  }

  /**
   * 전투 상태 변경 (State Pattern)
   * @param {string} newState 새 상태
   */
  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    console.log(`[Battle] State changed: ${oldState} -> ${newState}`);
    this.eventEmitter.emit('stateChange', { oldState, newState });
  }

  /**
   * 이벤트 리스너 등록 (Observer Pattern)
   */
  on(event, callback) {
    this.eventEmitter.on(event, callback);
  }

  /**
   * 이벤트 발행
   */
  emit(event, data) {
    this.eventEmitter.emit(event, data);
  }

  /**
   * 커맨드 실행 (Command Pattern)
   * @param {BaseCommand} command 실행할 커맨드
   * @returns {Array<Object>} 액션 결과
   */
  executeCommand(command) {
    if (!command.canExecute()) {
      console.warn(`[Battle] Command cannot be executed: ${command.getDescription()}`);
      return [];
    }

    console.log(`[Battle] Executing command: ${command.getDescription()}`);

    // 커맨드 실행
    const results = command.execute();

    // 히스토리에 기록
    this.commandHistory.push({
      metadata: command.getMetadata(),
      results: results,
      turnCount: this.turnCount
    });

    // 히스토리 크기 제한
    if (this.commandHistory.length > this.maxCommandHistory) {
      this.commandHistory.shift();
    }

    // 커맨드 실행 이벤트 발행
    this.emit('commandExecuted', {
      command: command.getMetadata(),
      results: results
    });

    return results;
  }

  /**
   * 만료된 버프를 해제하고 원래 스탯으로 복원
   * @param {BattleUnit} unit - 버프를 체크할 유닛
   */
  _processExpiredBuffs(unit) {
    if (!unit.buffs || unit.buffs.length === 0) return;

    const expiredBuffs = unit.buffs.filter(buff => {
      const turnsElapsed = this.turnCount - buff.appliedAt;
      return turnsElapsed >= buff.duration;
    });

    for (const buff of expiredBuffs) {
      if (buff.type === 'defense' && buff.originalValue !== undefined) {
        unit.def = buff.originalValue;
        console.log(`[Battle] Defense buff expired for ${unit.name}: DEF restored to ${unit.def}`);
      }
    }

    // 만료된 버프 제거
    unit.buffs = unit.buffs.filter(buff => {
      const turnsElapsed = this.turnCount - buff.appliedAt;
      return turnsElapsed < buff.duration;
    });
  }

  /**
   * 커맨드 히스토리 조회
   * @param {number} count 조회할 개수 (기본: 전체)
   * @returns {Array<Object>}
   */
  getCommandHistory(count = null) {
    if (count === null) {
      return [...this.commandHistory];
    }
    return this.commandHistory.slice(-count);
  }

  /**
   * 커맨드 히스토리 초기화
   */
  clearCommandHistory() {
    this.commandHistory = [];
  }

  /**
   * 전투 초기화
   */
  initBattle() {
    console.log('[Battle] Initializing battle...');
    this.setState(BattleState.INITIALIZING);

    // HP, 스킬 게이지 초기화
    [...this.allies, ...this.enemies].forEach(unit => {
      unit.currentHp = unit.maxHp;
      unit.skillGauge = 0;
      unit.isAlive = true;
      unit.buffs = [];
      unit.debuffs = [];
      unit.reactionSkillFired = {};
      unit.passiveBonusApplied = false;
    });

    // 시너지 계산 및 적용 (기존 클래스/분위기 기반)
    this.synergyBuffs = SynergyCalculator.calculate(this.allies);
    SynergyCalculator.apply(this.allies, this.synergyBuffs);

    // 교단 시너지 계산 및 적용
    this.cultSynergyBonus = CultSynergyCalculator.calculate(this.allies, this.synergySkillDefs);
    if (this.cultSynergyBonus.atk !== 1.0 || this.cultSynergyBonus.def !== 1.0) {
      CultSynergyCalculator.apply(this.allies, this.cultSynergyBonus);
    }

    // 패시브 스킬 적용 (항상 적용)
    this.allies.forEach(unit => {
      this._applyPassiveSkills(unit);
    });

    // 스킬 쿨타임 초기화
    [...this.allies, ...this.enemies].forEach(unit => {
      const unitSkills = this.characterSkills.filter(s => s.character_id === unit.id);
      if (unitSkills.length > 0) {
        this.skillCooldownManager.initUnit(unit.id, unitSkills);
      }
    });

    // 턴 순서 계산
    this.calculateTurnOrder();

    this.turnCount = 0;
    this.isFinished = false;
    this.result = null;
    this.battleLog = [];

    this.log('전투 시작!');

    // Observer Pattern: 이벤트 발행
    this.emit('battleStart', {
      allies: this.allies.map(u => ({ id: u.id, name: u.name })),
      enemies: this.enemies.map(u => ({ id: u.id, name: u.name })),
      synergyBuffs: this.synergyBuffs
    });

    EventBus.emit(GameEvents.BATTLE_START, {
      allies: this.allies.map(u => u.id),
      enemies: this.enemies.map(u => u.id)
    });

    console.log('[Battle] Battle initialized, turn order:', this.turnOrder.map(u => u.name).join(' > '));

    return this.turnOrder;
  }

  /**
   * 시너지 버프 정보 조회
   */
  getSynergyBuffs() {
    return { ...this.synergyBuffs };
  }

  /**
   * 턴 순서 계산 (SPD 기준)
   */
  calculateTurnOrder() {
    const allUnits = [...this.allies, ...this.enemies].filter(u => u.isAlive);
    this.turnOrder = allUnits.sort((a, b) => b.spd - a.spd);
    this.currentTurnIndex = 0;

    console.log('[Battle] Turn order calculated:', this.turnOrder.map(u => `${u.name}(SPD:${u.spd})`).join(' > '));

    // Observer Pattern: 턴 순서 이벤트 발행
    this.emit('turnOrderUpdate', {
      order: this.turnOrder.map(u => ({ id: u.id, name: u.name, spd: u.spd, isAlly: !u.isEnemy }))
    });
  }

  /**
   * 다음 유닛 가져오기
   * @returns {BattleUnit|null}
   */
  getNextUnit() {
    if (this.isFinished) return null;

    // 모든 유닛이 턴을 마쳤으면 새 라운드
    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.turnCount++;
      this.calculateTurnOrder();

      if (this.turnCount >= this.maxTurns) {
        this.finishBattle('timeout');
        return null;
      }
    }

    // 살아있는 유닛 찾기
    while (this.currentTurnIndex < this.turnOrder.length) {
      const unit = this.turnOrder[this.currentTurnIndex];
      if (unit.isAlive) {
        return unit;
      }
      this.currentTurnIndex++;
    }

    // 재귀적으로 다음 라운드 시작
    return this.getNextUnit();
  }

  /**
   * 턴 처리 (자동 모드)
   * @returns {Object} 턴 결과
   */
  processTurn() {
    console.log(`[Battle] Processing turn ${this.turnCount}`);
    this.setState(BattleState.TURN_START);

    const unit = this.getNextUnit();
    if (!unit) {
      return { finished: true, result: this.result };
    }

    console.log(`[Battle] Current unit: ${unit.name} (HP: ${unit.currentHp}/${unit.maxHp}, Gauge: ${unit.skillGauge}/${unit.maxSkillGauge})`);

    // Observer Pattern: 턴 시작 이벤트
    this.emit('turnStart', {
      turn: this.turnCount,
      unit: { id: unit.id, name: unit.name, isAlly: !unit.isEnemy }
    });

    // PAT-1.1: 만료된 버프 해제 (방어 커맨드 등)
    this._processExpiredBuffs(unit);

    // 스킬 쿨타임 감소
    this.skillCooldownManager.tickCooldowns(unit.id);

    // 반응 스킬 체크 (HP 임계값)
    const reactionResult = this._checkReactionSkills(unit);
    if (reactionResult) {
      this.log(`[반응] ${unit.name}: ${reactionResult.skillName} 발동!`);
    }

    this.setState(BattleState.PROCESSING_ACTION);

    // AI 액션 결정
    const action = this.getAIAction(unit);

    console.log(`[Battle] AI decision: ${action.skill.name} -> ${action.targets.map(t => t.name).join(', ')}`);

    // Strategy Pattern: 스킬 전략 실행
    const strategy = SKILL_STRATEGIES[action.skill.id] || SKILL_STRATEGIES.basic;
    let turnResult;

    if (strategy) {
      const results = strategy.execute(unit, action.targets, this);
      turnResult = {
        attacker: unit.id,
        skill: action.skill.id,
        results
      };
    } else {
      // 폴백: 기존 방식
      turnResult = this.executeAction(unit, action.skill, action.targets);
    }

    this.setState(BattleState.TURN_END);

    // 턴 종료 처리
    this.currentTurnIndex++;

    // Observer Pattern: 턴 종료 이벤트
    this.emit('turnEnd', {
      turn: this.turnCount,
      unit: { id: unit.id, name: unit.name },
      result: turnResult
    });

    // 승패 확인
    if (this.isVictory()) {
      this.finishBattle('victory');
    } else if (this.isDefeat()) {
      this.finishBattle('defeat');
    }

    return {
      finished: this.isFinished,
      result: this.result,
      turnResult,
      nextUnit: this.getNextUnit()
    };
  }

  /**
   * 액션 실행
   * @param {BattleUnit} unit 행동 유닛
   * @param {Object} skill 사용 스킬
   * @param {Array<BattleUnit>} targets 타겟들
   * @returns {Object} 액션 결과
   */
  executeAction(unit, skill, targets) {
    console.log(`[Battle] Executing action: ${unit.name} uses ${skill.name || skill.id}`);

    const results = [];

    targets.forEach(target => {
      if (!target.isAlive) return;

      if (skill.isHeal) {
        // 힐 스킬
        const healAmount = Math.floor(unit.atk * skill.multiplier);
        const healResult = target.heal(healAmount);
        results.push({
          target: target.id,
          type: 'heal',
          amount: healResult.actualHeal
        });
        this.log(`${unit.name}이(가) ${target.name}에게 ${healResult.actualHeal} 회복!`);

        console.log(`[Battle] Heal: ${unit.name} -> ${target.name}, amount=${healResult.actualHeal}`);

        // Observer Pattern: 힐 이벤트
        this.emit('heal', {
          healer: unit.id,
          target: target.id,
          amount: healResult.actualHeal
        });
      } else {
        // 공격 스킬
        const damage = this.calculateDamage(unit, target, skill);
        const damageResult = target.takeDamage(damage.finalDamage);

        results.push({
          target: target.id,
          type: 'damage',
          amount: damageResult.actualDamage,
          isCrit: damage.isCrit,
          moodBonus: damage.moodBonus,
          isDead: damageResult.isDead
        });

        const critText = damage.isCrit ? '크리티컬! ' : '';
        this.log(`${unit.name}이(가) ${target.name}에게 ${critText}${damageResult.actualDamage} 피해!`);

        console.log(`[Battle] Damage: ${unit.name} -> ${target.name}, damage=${damageResult.actualDamage}, crit=${damage.isCrit}, mood=${damage.moodBonus}%`);

        // Observer Pattern: 데미지 이벤트
        this.emit('damage', {
          attacker: unit.id,
          target: target.id,
          amount: damageResult.actualDamage,
          isCrit: damage.isCrit,
          moodBonus: damage.moodBonus
        });

        if (damageResult.isDead) {
          this.log(`${target.name} 쓰러짐!`);
          console.log(`[Battle] Unit died: ${target.name}`);

          // Observer Pattern: 사망 이벤트
          this.emit('unitDeath', {
            unit: target.id,
            killedBy: unit.id
          });
        }

        // 최고 데미지 기록
        SaveManager.updateHighestDamage(damageResult.actualDamage);
      }
    });

    // 스킬 게이지 처리
    if (skill.gaugeCost) {
      unit.consumeSkillGauge(0); // 실제 스킬 인덱스
      console.log(`[Battle] Skill gauge consumed: ${unit.name} now has ${unit.skillGauge}`);
    }
    if (skill.gaugeGain) {
      unit.chargeSkill(skill.gaugeGain);
      console.log(`[Battle] Skill gauge charged: ${unit.name} now has ${unit.skillGauge}`);
    }

    return {
      attacker: unit.id,
      skill: skill.id,
      results
    };
  }

  /**
   * 스킬 시스템: 외부에서 character_skills/synergy_skills 등록
   * @param {Object} skillsData skills.json 전체 객체
   */
  loadSkillData(skillsData) {
    if (!skillsData) return;
    this.characterSkills = skillsData.character_skills || [];
    this.synergySkillDefs = skillsData.synergy_skills || [];
    if (skillsData.grade_multipliers) {
      this.gradeMultipliers = skillsData.grade_multipliers;
    }
    console.log(`[Battle] Skill data loaded: ${this.characterSkills.length} character skills, ${this.synergySkillDefs.length} synergy skills`);
  }

  /**
   * 패시브 스킬 적용 (항상 적용, 전투 시작 1회)
   * @param {BattleUnit} unit
   */
  _applyPassiveSkills(unit) {
    if (unit.passiveBonusApplied) return;

    const unitSkills = this.characterSkills.filter(s => s.character_id === unit.id);
    unitSkills.forEach(skill => {
      const passive = skill.passive_bonus;
      if (!passive || passive.condition !== 'always') return;

      const stat = passive.stat.toLowerCase();
      const modifier = passive.modifier;

      if (stat === 'hp') {
        unit.maxHp = Math.floor(unit.maxHp * modifier);
        unit.currentHp = unit.maxHp;
      } else if (stat === 'atk') {
        unit.atk = Math.floor(unit.atk * modifier);
      } else if (stat === 'def') {
        unit.def = Math.floor(unit.def * modifier);
      }

      console.log(`[Passive] ${unit.name} - ${skill.name}: ${passive.stat} x${modifier}`);
    });

    unit.passiveBonusApplied = true;
  }

  /**
   * 반응 스킬 조건 체크 및 발동 (HP 임계값 타입)
   * @param {BattleUnit} unit
   * @returns {Object|null} 발동된 스킬 결과 또는 null
   */
  _checkReactionSkills(unit) {
    const unitSkills = this.characterSkills.filter(
      s => s.character_id === unit.id && s.skill_type === 'reaction'
    );

    for (const skill of unitSkills) {
      if (unit.reactionSkillFired[skill.skill_id]) continue;

      const cond = skill.trigger_condition;
      if (!cond || cond.type !== 'hp_threshold') continue;

      const hpRatio = unit.currentHp / unit.maxHp;
      if (hpRatio > cond.threshold) continue;

      // 발동 조건 충족
      unit.reactionSkillFired[skill.skill_id] = true;
      console.log(`[Reaction] ${unit.name} fires reaction skill: ${skill.name} (HP ${(hpRatio * 100).toFixed(0)}%)`);

      const effect = skill.effect;
      const targets = effect.target === 'all_enemies'
        ? (unit.isEnemy ? this.getAliveAllies() : this.getAliveEnemies())
        : (unit.isEnemy ? this.getAliveEnemies() : this.getAliveAllies());

      const results = [];
      targets.forEach(target => {
        if (!target.isAlive) return;
        const dmg = this._calculateSkillDamage(unit, target, effect.modifier);
        const dmgResult = target.takeDamage(dmg.finalDamage);
        results.push({
          target: target.id,
          type: 'reaction_damage',
          amount: dmgResult.actualDamage,
          isCrit: dmg.isCrit
        });
        this.log(`${unit.name}(반응) -> ${target.name}: ${dmgResult.actualDamage} 피해`);
      });

      this.emit('reactionSkill', { unit: unit.id, skill: skill.skill_id, results });
      return { skillName: skill.name, results };
    }

    return null;
  }

  /**
   * 액티브 스킬 쿨타임 기반 발동 판정
   * ATK 순으로 정렬된 아군에 대해 쿨타임=0인 스킬 발동
   * @param {Array<BattleUnit>} units 처리할 유닛 배열
   * @returns {Array<Object>} 발동 결과 목록
   */
  processActiveSkills(units) {
    const results = [];

    // ATK 내림차순으로 처리
    const sorted = [...units].sort((a, b) => b.atk - a.atk);

    sorted.forEach(unit => {
      if (!unit.isAlive) return;

      const unitSkills = this.characterSkills.filter(
        s => s.character_id === unit.id && s.skill_type === 'active'
      );

      unitSkills.forEach(skill => {
        if (!this.skillCooldownManager.isReady(unit.id, skill.skill_id)) return;

        const effect = skill.effect;
        const targets = this._resolveTargets(unit, effect.target);

        const skillResults = [];
        if (effect.stat === 'ATK' || effect.target.includes('enemy')) {
          // 공격 스킬
          targets.forEach(target => {
            if (!target.isAlive) return;
            const dmg = this._calculateSkillDamage(unit, target, effect.modifier);
            const dmgResult = target.takeDamage(dmg.finalDamage);
            skillResults.push({
              target: target.id,
              type: 'active_damage',
              amount: dmgResult.actualDamage,
              isCrit: dmg.isCrit,
              isDead: dmgResult.isDead
            });
            this.log(`${unit.name}(${skill.name}) -> ${target.name}: ${dmgResult.actualDamage} 피해${dmg.isCrit ? ' [CRIT]' : ''}`);
          });
        } else if (effect.stat === 'DEF') {
          // 방어 버프 스킬
          targets.forEach(target => {
            if (!target.isAlive) return;
            const originalDef = target.def;
            target.def = Math.floor(target.def * effect.modifier);
            target.buffs.push({
              type: 'defense',
              stat: 'def',
              originalValue: originalDef,
              appliedAt: this.turnCount,
              duration: effect.duration_turns
            });
            skillResults.push({
              target: target.id,
              type: 'buff',
              stat: 'DEF',
              modifier: effect.modifier,
              duration: effect.duration_turns
            });
            this.log(`${unit.name}(${skill.name}) -> ${target.name}: DEF x${effect.modifier} (${effect.duration_turns}턴)`);
          });
        }

        // 쿨타임 리셋
        this.skillCooldownManager.resetCooldown(
          unit.id,
          skill.skill_id,
          skill.trigger_condition.cooldown_turns
        );

        results.push({ unit: unit.id, skill: skill.skill_id, results: skillResults });
        this.emit('activeSkill', { unit: unit.id, skill: skill.skill_id, results: skillResults });
      });
    });

    return results;
  }

  /**
   * 타겟 문자열을 실제 BattleUnit 배열로 변환
   * @param {BattleUnit} caster
   * @param {string} targetType
   * @returns {Array<BattleUnit>}
   */
  _resolveTargets(caster, targetType) {
    const allies = caster.isEnemy ? this.getAliveEnemies() : this.getAliveAllies();
    const enemies = caster.isEnemy ? this.getAliveAllies() : this.getAliveEnemies();

    switch (targetType) {
      case 'party_all':
        return allies;
      case 'all_enemies':
        return enemies;
      case 'single_enemy': {
        const target = this.selectTarget(enemies);
        return target ? [target] : [];
      }
      case 'self':
        return [caster];
      default:
        return enemies;
    }
  }

  /**
   * 스킬 피해량 계산 (스펙 공식 적용)
   * 기본 피해량 = ATK × 스킬배율 × (1 - DEF / (DEF + 500))
   * 크리티컬 피해량 = 기본 피해량 × (1 + CRIT_DMG) // CRIT_DMG 기본 0.5
   * @param {BattleUnit} attacker
   * @param {BattleUnit} defender
   * @param {number} multiplier 스킬 배율
   * @returns {{ baseDamage: number, finalDamage: number, isCrit: boolean }}
   */
  _calculateSkillDamage(attacker, defender, multiplier) {
    const CRIT_RATE = attacker.critRate || 0.05;
    const CRIT_DMG = attacker.critDmg ? attacker.critDmg - 1.0 : 0.5; // critDmg=1.5 → bonus=0.5

    // 기본 피해량 = ATK × 스킬배율 × (1 - DEF / (DEF + 500))
    const defMitigation = 1 - defender.def / (defender.def + 500);
    let baseDamage = attacker.atk * multiplier * defMitigation;

    // 크리티컬 판정
    const isCrit = Math.random() < CRIT_RATE;
    if (isCrit) {
      baseDamage *= (1 + CRIT_DMG);
      console.log(`[SkillDmg] CRIT! x${(1 + CRIT_DMG).toFixed(2)}`);
    }

    // 분위기 상성 반영
    const moodBonus = this.getMoodBonus(attacker.mood, defender.mood);
    baseDamage *= (1 + moodBonus);

    // 데미지 분산 (95% ~ 105%)
    const variance = 0.95 + Math.random() * 0.10;
    const finalDamage = Math.floor(baseDamage * variance);

    console.log(`[SkillDmg] ${attacker.name} -> ${defender.name}: ATK=${attacker.atk}, x${multiplier}, DEF_mit=${defMitigation.toFixed(2)}, final=${finalDamage}`);

    return { baseDamage: Math.floor(baseDamage), finalDamage, isCrit };
  }

  /**
   * 데미지 계산
   * @param {BattleUnit} attacker 공격자
   * @param {BattleUnit} defender 방어자
   * @param {Object} skill 스킬
   * @returns {Object} { baseDamage, finalDamage, isCrit, moodBonus }
   */
  calculateDamage(attacker, defender, skill) {
    // 기본 데미지 = ATK * 배율
    const multiplier = skill.multiplier || 1;
    let baseDamage = attacker.atk * multiplier;

    console.log(`[Battle] Damage calc start: ATK=${attacker.atk}, multiplier=${multiplier}, base=${baseDamage}`);

    // 방어력 적용 (1 - DEF/1000, 최소 10%)
    const defReduction = Math.min(0.9, defender.def / 1000);
    baseDamage *= (1 - defReduction);

    console.log(`[Battle] After DEF reduction (${defender.def}): ${baseDamage.toFixed(0)}`);

    // 분위기 상성
    const moodBonus = this.getMoodBonus(attacker.mood, defender.mood);
    baseDamage *= (1 + moodBonus);

    if (moodBonus !== 0) {
      console.log(`[Battle] Mood bonus (${attacker.mood} vs ${defender.mood}): ${moodBonus > 0 ? '+' : ''}${(moodBonus * 100).toFixed(0)}%`);
    }

    // 크리티컬
    const isCrit = Math.random() < attacker.critRate;
    if (isCrit) {
      baseDamage *= attacker.critDmg;
      console.log(`[Battle] CRITICAL! x${attacker.critDmg}`);
    }

    // 데미지 분산 (90% ~ 110%)
    const variance = 0.9 + Math.random() * 0.2;
    const finalDamage = Math.floor(baseDamage * variance);

    console.log(`[Battle] Final damage: ${finalDamage} (variance: ${(variance * 100).toFixed(0)}%)`);

    return {
      baseDamage: Math.floor(baseDamage),
      finalDamage,
      isCrit,
      moodBonus: moodBonus * 100 // 퍼센트로 변환
    };
  }

  /**
   * 분위기 상성 보너스 계산
   * @param {string} attackerMood 공격자 분위기
   * @param {string} defenderMood 방어자 분위기
   * @returns {number} 보너스 배율 (-0.25 ~ 0.25)
   */
  getMoodBonus(attackerMood, defenderMood) {
    if (attackerMood === defenderMood) return 0;
    if (attackerMood === 'neutral' || defenderMood === 'neutral') return 0;

    // 분위기 상성 매트릭스 (각 2강 2약)
    const moodAdvantage = {
      brave: ['wild', 'cunning'],
      fierce: ['brave', 'noble'],
      wild: ['fierce', 'mystic'],
      calm: ['devoted', 'fierce'],
      stoic: ['calm', 'wild'],
      devoted: ['stoic', 'brave'],
      cunning: ['mystic', 'calm'],
      noble: ['cunning', 'devoted'],
      mystic: ['noble', 'stoic']
    };

    const advantages = moodAdvantage[attackerMood];
    if (!advantages) return 0;

    if (advantages.includes(defenderMood)) {
      return 0.20; // 유리 +20%
    }

    // 역방향 체크 (상대가 나에게 유리하면 나는 불리)
    const defenderAdvantages = moodAdvantage[defenderMood];
    if (defenderAdvantages && defenderAdvantages.includes(attackerMood)) {
      return -0.20; // 불리 -20%
    }

    return 0;
  }

  /**
   * AI 액션 결정
   * @param {BattleUnit} unit 유닛
   * @returns {Object} { skill, targets }
   */
  getAIAction(unit) {
    const isHealer = unit.data.role === 'healer' || unit.data.class === 'healer';
    const basicSkill = unit.skills?.find(s => s.id === 'basic') || unit.skills?.[0];
    const skill1 = unit.skills?.find(s => s.id === 'skill1') || unit.skills?.[1];
    const skill2 = unit.skills?.find(s => s.id === 'skill2') || unit.skills?.[2];

    // 스킬 사용 가능 여부 (skill2 우선, 없으면 skill1)
    const skill2Ready = skill2 && unit.skillGauge >= (skill2.gaugeCost || 150);
    const skill1Ready = skill1 && unit.skillGauge >= (skill1.gaugeCost || unit.maxSkillGauge);

    // 힐러인 경우
    if (isHealer) {
      const allies = unit.isEnemy ? this.getAliveEnemies() : this.getAliveAllies();
      const lowestHpAlly = allies.reduce((min, curr) =>
        curr.getHpPercent() < min.getHpPercent() ? curr : min
      );

      // HP가 50% 이하인 아군이 있고 힐 스킬 사용 가능하면 힐
      const healSkill = unit.skills?.find(s =>
        s.isHeal || s.target === 'ally' || s.target === 'all_allies' ||
        s.name?.includes('힐') || s.name?.includes('치유') || s.name?.includes('회복')
      );
      if (lowestHpAlly.getHpPercent() < 0.5 && healSkill && unit.skillGauge >= (healSkill.gaugeCost || unit.maxSkillGauge)) {
        return {
          skill: { ...healSkill, isHeal: true },
          targets: [lowestHpAlly]
        };
      }
    }

    // 스킬2 우선 사용 (더 강한 궁극기)
    if (skill2Ready) {
      const targets = unit.isEnemy ? this.getAliveAllies() : this.getAliveEnemies();
      const target = this.selectTarget(targets);
      return {
        skill: skill2,
        targets: skill2.target === 'all' ? targets : [target]
      };
    }

    // 스킬1 사용 (게이지 충분)
    if (skill1Ready) {
      const targets = unit.isEnemy ? this.getAliveAllies() : this.getAliveEnemies();
      const target = this.selectTarget(targets);
      return {
        skill: skill1,
        targets: skill1.target === 'all' ? targets : [target]
      };
    }

    // 기본 공격
    const targets = unit.isEnemy ? this.getAliveAllies() : this.getAliveEnemies();
    const target = this.selectTarget(targets);

    return {
      skill: basicSkill || { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeGain: 20 },
      targets: [target]
    };
  }

  /**
   * 타겟 선택 (가장 낮은 HP 우선)
   * @param {Array<BattleUnit>} targets 가능한 타겟들
   * @returns {BattleUnit}
   */
  selectTarget(targets) {
    if (targets.length === 0) return null;

    return targets.reduce((min, curr) =>
      curr.currentHp < min.currentHp ? curr : min
    );
  }

  /**
   * 스킬 수동 사용
   * @param {BattleUnit} unit 유닛
   * @param {number} skillIndex 스킬 인덱스
   * @param {Array<BattleUnit>} targets 타겟
   * @returns {Object} 결과
   */
  useSkill(unit, skillIndex, targets) {
    if (!unit.canUseSkill(skillIndex)) {
      return { success: false, error: '스킬을 사용할 수 없습니다' };
    }

    const skill = unit.skills[skillIndex];
    const result = this.executeAction(unit, skill, targets);

    return { success: true, result };
  }

  /**
   * 기본 공격
   * @param {BattleUnit} unit 유닛
   * @param {BattleUnit} target 타겟
   * @returns {Object} 결과
   */
  basicAttack(unit, target) {
    return this.useSkill(unit, 0, [target]);
  }

  /**
   * 승리 확인
   * @returns {boolean}
   */
  isVictory() {
    return this.enemies.every(e => !e.isAlive);
  }

  /**
   * 패배 확인
   * @returns {boolean}
   */
  isDefeat() {
    return this.allies.every(a => !a.isAlive);
  }

  /**
   * 살아있는 아군
   * @returns {Array<BattleUnit>}
   */
  getAliveAllies() {
    return this.allies.filter(a => a.isAlive);
  }

  /**
   * 살아있는 적
   * @returns {Array<BattleUnit>}
   */
  getAliveEnemies() {
    return this.enemies.filter(e => e.isAlive);
  }

  /**
   * 전투 종료 처리
   * @param {string} outcome 결과 ('victory', 'defeat', 'timeout')
   */
  finishBattle(outcome) {
    console.log(`[Battle] Battle finished: ${outcome}`);

    // State Pattern: 상태 변경
    if (outcome === 'victory') {
      this.setState(BattleState.VICTORY);
    } else if (outcome === 'defeat') {
      this.setState(BattleState.DEFEAT);
    } else {
      this.setState(BattleState.TIMEOUT);
    }

    this.isFinished = true;

    const stars = this.calculateStars(outcome);
    const rewards = this.calculateRewards(outcome);

    // ProgressionSystem 경험치 분배 (승리 시)
    const expResults = [];
    if (outcome === 'victory' && rewards.exp > 0) {
      const expPerHero = Math.floor(rewards.exp / Math.max(1, this.allies.length));
      this.allies.forEach(ally => {
        if (!ally.id) return;
        try {
          const result = ProgressionSystem.addExp(ally.id, expPerHero);
          if (result && result.success) {
            expResults.push({
              heroId: ally.id,
              heroName: ally.name || ally.id,
              expGained: expPerHero,
              newLevel: result.newLevel,
              levelsGained: result.levelsGained,
              leveledUp: result.levelsGained > 0
            });
            if (result.levelsGained > 0) {
              console.log('[Battle] Level up: ' + (ally.name || ally.id) + ' -> Level ' + result.newLevel + ' (+' + result.levelsGained + ')');
            }
          }
        } catch (e) {
          console.warn('[Battle] EXP grant failed for ' + ally.id + ':', e.message);
        }
      });
      console.log('[Battle] EXP distributed: ' + expPerHero + ' each to ' + this.allies.length + ' heroes');
    }

    this.result = {
      outcome,
      stars,
      rewards,
      turnCount: this.turnCount,
      survivingAllies: this.getAliveAllies().length,
      totalAllies: this.allies.length,
      synergyBuffs: this.synergyBuffs,
      expResults
    };

    this.log(`전투 종료: ${outcome === 'victory' ? '승리' : outcome === 'defeat' ? '패배' : '시간 초과'}`);

    console.log(`[Battle] Result: ${outcome}, Stars: ${stars}, Turns: ${this.turnCount}`);
    console.log(`[Battle] Rewards: Gold=${rewards.gold}, EXP=${rewards.exp}`);

    // Observer Pattern: 전투 종료 이벤트
    this.emit('battleEnd', this.result);

    EventBus.emit(GameEvents.BATTLE_END, this.result);

    return this.result;
  }

  /**
   * 별 계산
   * @param {string} outcome 결과
   * @returns {number} 별 수 (0-3)
   */
  calculateStars(outcome) {
    if (outcome !== 'victory') return 0;

    const aliveRatio = this.getAliveAllies().length / this.allies.length;
    const turnBonus = this.turnCount <= 10;

    if (aliveRatio === 1 && turnBonus) return 3;
    if (aliveRatio >= 0.5) return 2;
    return 1;
  }

  /**
   * 보상 계산
   * @param {string} outcome 결과
   * @returns {Object} 보상
   */
  calculateRewards(outcome) {
    if (outcome !== 'victory') {
      return { gold: 0, exp: 0, items: [] };
    }

    const baseGold = 100 * (1 + this.turnCount * 0.05);
    const baseExp = 50 * this.allies.length;
    const stars = this.calculateStars(outcome);

    return {
      gold: Math.floor(baseGold * stars),
      exp: Math.floor(baseExp * (1 + (stars - 1) * 0.25)),
      items: this.generateDrops()
    };
  }

  /**
   * 드롭 아이템 생성
   * @returns {Array} 아이템 배열
   */
  generateDrops() {
    const drops = [];

    // 10% 확률로 스킬 북
    if (Math.random() < 0.1) {
      drops.push({ type: 'skill_book', count: 1 });
    }

    // 5% 확률로 캐릭터 조각
    if (Math.random() < 0.05) {
      drops.push({ type: 'shard', count: 1 });
    }

    return drops;
  }

  /**
   * 전투 결과 가져오기
   * @returns {Object|null}
   */
  getBattleResult() {
    return this.result;
  }

  /**
   * 배틀 로그 추가
   * @param {string} message 메시지
   */
  log(message) {
    const entry = {
      turn: this.turnCount,
      time: Date.now(),
      message
    };
    this.battleLog.push(entry);
  }

  /**
   * 배틀 로그 조회
   * @returns {Array}
   */
  getLog() {
    return [...this.battleLog];
  }

  /**
   * 자동 모드 토글
   * @returns {boolean} 현재 자동 모드 상태
   */
  toggleAutoMode() {
    this.isAutoMode = !this.isAutoMode;
    return this.isAutoMode;
  }

  /**
   * 배속 설정
   * @param {number} multiplier 배속 (1, 2, 3)
   */
  setSpeed(multiplier) {
    this.speedMultiplier = Math.min(3, Math.max(1, multiplier));
  }

  /**
   * 전투 상태 요약
   * @returns {Object}
   */
  getState() {
    return {
      turnCount: this.turnCount,
      isFinished: this.isFinished,
      isAutoMode: this.isAutoMode,
      speedMultiplier: this.speedMultiplier,
      battleState: this.state,
      synergyBuffs: this.synergyBuffs,
      allies: this.allies.map(a => ({
        id: a.id,
        name: a.name,
        hp: a.currentHp,
        maxHp: a.maxHp,
        skillGauge: a.skillGauge,
        isAlive: a.isAlive,
        mood: a.mood
      })),
      enemies: this.enemies.map(e => ({
        id: e.id,
        name: e.name,
        hp: e.currentHp,
        maxHp: e.maxHp,
        isAlive: e.isAlive,
        mood: e.mood
      })),
      currentUnit: this.turnOrder[this.currentTurnIndex]?.id || null,
      turnOrder: this.turnOrder.map(u => ({ id: u.id, name: u.name, spd: u.spd }))
    };
  }

  /**
   * 이벤트 리스너 정리
   */
  cleanup() {
    console.log('[Battle] Cleaning up BattleSystem...');
    this.eventEmitter.clear();
  }
}

// Export design pattern classes for external use
export { SkillStrategy, BasicAttackStrategy, PowerStrikeStrategy, HealStrategy, AoeAttackStrategy };
export { BattleEventEmitter };
export { BattleState };
export { SynergyCalculator };
export { SkillCooldownManager, CultSynergyCalculator };

// Export Command Pattern classes
export { AttackCommand, SkillCommand, DefendCommand };

/**
 * SkillCommand.js - 스킬 사용 커맨드
 */
import { BaseCommand } from './BaseCommand.js';

/**
 * 스킬 사용 커맨드
 * 스킬 게이지(MP) 소비하고 더 강력한 공격 또는 힐 수행
 */
export class SkillCommand extends BaseCommand {
  /**
   * @param {BattleUnit} unit - 스킬 사용자
   * @param {Array<BattleUnit>} targets - 타겟들
   * @param {BattleSystem} battleSystem - 전투 시스템
   * @param {Object} skill - 스킬 정보 { name, multiplier, gaugeCost, isHeal }
   */
  constructor(unit, targets, battleSystem, skill) {
    super(unit, targets, battleSystem);
    this.skill = skill;
  }

  canExecute() {
    // 기본 조건 + 스킬 게이지 확인
    if (!super.canExecute()) return false;

    if (this.skill.gaugeCost) {
      return this.unit.skillGauge >= this.skill.gaugeCost;
    }
    return true;
  }

  execute() {
    console.log(`[Command] SkillCommand: ${this.unit.name} uses ${this.skill.name || this.skill.id}`);
    const results = [];

    // MECH-03: 시전 훅 (아군 방어막/룬/버프 계열) — 전략 경로와 동일 규약
    const castEffects = this.battleSystem.applyCultSkillUse(this.unit, this.targets, this.skill);

    this.targets.forEach(target => {
      if (!target.isAlive) return;

      if (this.skill.isHeal) {
        // 힐 스킬 (Round Table Bond 보정)
        const healAmount = Math.floor(
          this.unit.atk * this.skill.multiplier * this.battleSystem.getCultHealMultiplier(this.unit)
        );
        const healResult = target.heal(healAmount);

        results.push({
          target: target.id,
          type: 'heal',
          amount: healResult.actualHeal
        });

        this.battleSystem.log(
          `${this.unit.name}이(가) ${target.name}에게 ${healResult.actualHeal} 회복!`
        );

        this.battleSystem.emit('heal', {
          healer: this.unit.id,
          target: target.id,
          amount: healResult.actualHeal
        });
      } else {
        // MECH-03: 피해는 BattleSystem.resolveDamage 단일 경로를 지난다
        const { damage, damageResult, cultEffects } = this.battleSystem.resolveDamage(
          this.unit,
          target,
          this.skill
        );

        results.push({
          target: target.id,
          type: 'damage',
          amount: damageResult.actualDamage,
          isCrit: damage.isCrit,
          moodBonus: damage.moodBonus,
          isDead: damageResult.isDead,
          isSkill: true,
          cultEffects
        });

        const critText = damage.isCrit ? '크리티컬! ' : '';
        this.battleSystem.log(
          `${this.unit.name}이(가) ${target.name}에게 ${critText}${damageResult.actualDamage} 피해!`
        );

        this.battleSystem.emit('damage', {
          attacker: this.unit.id,
          target: target.id,
          amount: damageResult.actualDamage,
          isCrit: damage.isCrit,
          moodBonus: damage.moodBonus
        });
      }
    });

    // 스킬 게이지 소비 (직접 차감 — 인덱스 의존 제거)
    if (this.skill.gaugeCost) {
      this.unit.skillGauge = Math.max(0, this.unit.skillGauge - this.skill.gaugeCost);
      console.log(`[Command] Skill gauge consumed: ${this.unit.name} now has ${this.unit.skillGauge}`);
    }

    if (castEffects.length > 0) results.push({ type: 'cultEffects', effects: castEffects });

    return results;
  }

  getDescription() {
    return `${this.unit.name} uses skill "${this.skill.name || this.skill.id}" on ${this.targets.map(t => t.name).join(', ')}`;
  }
}

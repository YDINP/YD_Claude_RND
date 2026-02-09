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

    this.targets.forEach(target => {
      if (!target.isAlive) return;

      if (this.skill.isHeal) {
        // 힐 스킬
        const healAmount = Math.floor(this.unit.atk * this.skill.multiplier);
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
        // 공격 스킬
        const damage = this.battleSystem.calculateDamage(this.unit, target, this.skill);
        const damageResult = target.takeDamage(damage.finalDamage);

        results.push({
          target: target.id,
          type: 'damage',
          amount: damageResult.actualDamage,
          isCrit: damage.isCrit,
          moodBonus: damage.moodBonus,
          isDead: damageResult.isDead,
          isSkill: true
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

        if (damageResult.isDead) {
          this.battleSystem.log(`${target.name} 쓰러짐!`);
          this.battleSystem.emit('unitDeath', {
            unit: target.id,
            killedBy: this.unit.id
          });
        }
      }
    });

    // 스킬 게이지 소비 (직접 차감 — 인덱스 의존 제거)
    if (this.skill.gaugeCost) {
      this.unit.skillGauge = Math.max(0, this.unit.skillGauge - this.skill.gaugeCost);
      console.log(`[Command] Skill gauge consumed: ${this.unit.name} now has ${this.unit.skillGauge}`);
    }

    return results;
  }

  getDescription() {
    return `${this.unit.name} uses skill "${this.skill.name || this.skill.id}" on ${this.targets.map(t => t.name).join(', ')}`;
  }
}

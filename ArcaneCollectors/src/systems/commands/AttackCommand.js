/**
 * AttackCommand.js - 일반 공격 커맨드
 */
import { BaseCommand } from './BaseCommand.js';

/**
 * 일반 공격 커맨드
 * 기본 데미지 배수 1.0, 스킬 게이지 충전
 */
export class AttackCommand extends BaseCommand {
  /**
   * @param {BattleUnit} unit - 공격자
   * @param {Array<BattleUnit>} targets - 타겟들
   * @param {BattleSystem} battleSystem - 전투 시스템
   * @param {number} damageMultiplier - 데미지 배수 (기본 1.0)
   */
  constructor(unit, targets, battleSystem, damageMultiplier = 1.0) {
    super(unit, targets, battleSystem);
    this.damageMultiplier = damageMultiplier;
  }

  execute() {
    console.log(`[Command] AttackCommand: ${this.unit.name} attacks`);
    const results = [];

    this.targets.forEach(target => {
      if (!target.isAlive) return;

      // 데미지 계산
      const damage = this.battleSystem.calculateDamage(
        this.unit,
        target,
        { multiplier: this.damageMultiplier }
      );
      const damageResult = target.takeDamage(damage.finalDamage);

      results.push({
        target: target.id,
        type: 'damage',
        amount: damageResult.actualDamage,
        isCrit: damage.isCrit,
        moodBonus: damage.moodBonus,
        isDead: damageResult.isDead
      });

      // 로그 기록
      const critText = damage.isCrit ? '크리티컬! ' : '';
      this.battleSystem.log(
        `${this.unit.name}이(가) ${target.name}에게 ${critText}${damageResult.actualDamage} 피해!`
      );

      // 이벤트 발행
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
    });

    // 스킬 게이지 충전
    this.unit.chargeSkill(20);

    return results;
  }

  getDescription() {
    return `${this.unit.name} attacks ${this.targets.map(t => t.name).join(', ')}`;
  }
}

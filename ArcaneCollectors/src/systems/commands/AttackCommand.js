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

      // MECH-03: 피해는 BattleSystem.resolveDamage 단일 경로를 지난다
      // (교단 적중 훅 / Holy Thorns 반사 / 사망 처리가 커맨드 경로에서도 동일하게 적용된다)
      const { damage, damageResult, cultEffects } = this.battleSystem.resolveDamage(
        this.unit,
        target,
        { multiplier: this.damageMultiplier }
      );

      results.push({
        target: target.id,
        type: 'damage',
        amount: damageResult.actualDamage,
        isCrit: damage.isCrit,
        moodBonus: damage.moodBonus,
        isDead: damageResult.isDead,
        cultEffects
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
    });

    // 스킬 게이지 충전
    this.unit.chargeSkill(20);

    return results;
  }

  getDescription() {
    return `${this.unit.name} attacks ${this.targets.map(t => t.name).join(', ')}`;
  }
}

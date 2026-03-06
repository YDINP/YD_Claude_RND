/**
 * DefendCommand.js - 방어 커맨드
 */
import { BaseCommand } from './BaseCommand.js';

/**
 * 방어 커맨드
 * 다음 턴까지 방어력 1.5배 증가 버프 적용
 */
export class DefendCommand extends BaseCommand {
  /**
   * @param {BattleUnit} unit - 방어하는 유닛
   * @param {BattleSystem} battleSystem - 전투 시스템
   */
  constructor(unit, battleSystem) {
    super(unit, [unit], battleSystem);
    this.defenseMultiplier = 1.5;
  }

  execute() {
    console.log(`[Command] DefendCommand: ${this.unit.name} defends`);

    // 방어 버프 적용
    const originalDef = this.unit.def;
    this.unit.def = Math.floor(this.unit.def * this.defenseMultiplier);

    // 버프 정보 저장 (다음 턴에 해제하기 위해)
    if (!this.unit.buffs) {
      this.unit.buffs = [];
    }
    this.unit.buffs.push({
      type: 'defense',
      originalValue: originalDef,
      duration: 1, // 1턴 지속
      appliedAt: this.battleSystem.turnCount
    });

    const defenseIncrease = this.unit.def - originalDef;

    this.battleSystem.log(
      `${this.unit.name}이(가) 방어 태세! (방어력 +${defenseIncrease})`
    );

    console.log(`[Command] Defense buff applied: ${this.unit.name} DEF ${originalDef} -> ${this.unit.def}`);

    // 이벤트 발행
    this.battleSystem.emit('buff', {
      unit: this.unit.id,
      buffType: 'defense',
      multiplier: this.defenseMultiplier,
      originalDef: originalDef,
      newDef: this.unit.def
    });

    return [{
      target: this.unit.id,
      type: 'buff',
      buffType: 'defense',
      amount: defenseIncrease
    }];
  }

  getDescription() {
    return `${this.unit.name} takes defensive stance`;
  }

  canExecute() {
    // 방어는 자신만 타겟이므로 살아있기만 하면 됨
    return this.unit.isAlive;
  }
}

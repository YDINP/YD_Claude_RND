/**
 * BaseCommand.js - Command Pattern base class
 * 모든 전투 액션 커맨드의 기본 클래스
 */

/**
 * 전투 액션의 기본 커맨드 클래스
 * Command Pattern을 적용하여 액션을 캡슐화
 */
export class BaseCommand {
  /**
   * @param {BattleUnit} unit - 액션을 수행하는 유닛
   * @param {Array<BattleUnit>} targets - 타겟 유닛들
   * @param {BattleSystem} battleSystem - 전투 시스템 참조
   */
  constructor(unit, targets, battleSystem) {
    this.unit = unit;
    this.targets = targets;
    this.battleSystem = battleSystem;
    this.timestamp = Date.now();
  }

  /**
   * 커맨드 실행
   * 서브클래스에서 반드시 구현해야 함
   * @returns {Array<Object>} 액션 결과 배열
   */
  execute() {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * 커맨드 설명 반환 (로그용)
   * @returns {string}
   */
  getDescription() {
    return `${this.unit.name} performs action`;
  }

  /**
   * 커맨드가 실행 가능한지 확인
   * @returns {boolean}
   */
  canExecute() {
    return this.unit.isAlive && this.targets.some(t => t.isAlive);
  }

  /**
   * 커맨드 메타데이터 반환 (히스토리 기록용)
   * @returns {Object}
   */
  getMetadata() {
    return {
      type: this.constructor.name,
      unit: this.unit.id,
      unitName: this.unit.name,
      targets: this.targets.map(t => ({ id: t.id, name: t.name })),
      timestamp: this.timestamp
    };
  }
}

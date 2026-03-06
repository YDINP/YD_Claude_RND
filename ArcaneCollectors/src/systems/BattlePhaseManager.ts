/**
 * BattlePhaseManager - State Pattern for BattleScene
 * 전투 씬의 페이즈 전환 관리
 */

export enum BattlePhase {
  INITIALIZING = 'INITIALIZING',
  PLAYER_INPUT = 'PLAYER_INPUT',
  TARGETING = 'TARGETING',
  EXECUTING = 'EXECUTING',
  ANIMATING = 'ANIMATING',
  RESOLVING = 'RESOLVING',
  WAVE_TRANSITION = 'WAVE_TRANSITION',
  BATTLE_END = 'BATTLE_END'
}

/**
 * 전투 페이즈 관리자
 * State Pattern을 사용하여 전투 페이즈 전환을 명확히 관리
 */
export class BattlePhaseManager {
  private currentPhase: BattlePhase;
  private allowedTransitions: Map<BattlePhase, BattlePhase[]>;
  private phaseHistory: BattlePhase[];

  constructor() {
    this.currentPhase = BattlePhase.INITIALIZING;
    this.phaseHistory = [BattlePhase.INITIALIZING];
    this.allowedTransitions = this.initializeTransitions();
  }

  /**
   * 허용된 페이즈 전환 규칙 정의
   */
  private initializeTransitions(): Map<BattlePhase, BattlePhase[]> {
    const transitions = new Map<BattlePhase, BattlePhase[]>();

    transitions.set(BattlePhase.INITIALIZING, [
      BattlePhase.PLAYER_INPUT,
      BattlePhase.EXECUTING,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.PLAYER_INPUT, [
      BattlePhase.TARGETING,
      BattlePhase.EXECUTING,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.TARGETING, [
      BattlePhase.PLAYER_INPUT,
      BattlePhase.EXECUTING,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.EXECUTING, [
      BattlePhase.ANIMATING,
      BattlePhase.RESOLVING,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.ANIMATING, [
      BattlePhase.RESOLVING,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.RESOLVING, [
      BattlePhase.PLAYER_INPUT,
      BattlePhase.EXECUTING,
      BattlePhase.WAVE_TRANSITION,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.WAVE_TRANSITION, [
      BattlePhase.PLAYER_INPUT,
      BattlePhase.EXECUTING,
      BattlePhase.BATTLE_END
    ]);

    transitions.set(BattlePhase.BATTLE_END, [
      // BATTLE_END는 종료 상태, 전환 불가
    ]);

    return transitions;
  }

  /**
   * 특정 페이즈로 전환 가능한지 확인
   */
  canTransitionTo(phase: BattlePhase): boolean {
    const allowedPhases = this.allowedTransitions.get(this.currentPhase);
    if (!allowedPhases) return false;
    return allowedPhases.includes(phase);
  }

  /**
   * 페이즈 전환 시도
   * @throws {Error} 유효하지 않은 전환인 경우
   */
  transitionTo(phase: BattlePhase): void {
    if (!this.canTransitionTo(phase)) {
      throw new Error(
        `[BattlePhaseManager] Invalid transition: ${this.currentPhase} -> ${phase}`
      );
    }

    console.log(`[BattlePhase] ${this.currentPhase} -> ${phase}`);
    this.currentPhase = phase;
    this.phaseHistory.push(phase);
  }

  /**
   * 현재 페이즈 반환
   */
  getCurrentPhase(): BattlePhase {
    return this.currentPhase;
  }

  /**
   * 페이즈 히스토리 반환
   */
  getPhaseHistory(): BattlePhase[] {
    return [...this.phaseHistory];
  }

  /**
   * 특정 페이즈인지 확인
   */
  isPhase(phase: BattlePhase): boolean {
    return this.currentPhase === phase;
  }

  /**
   * 여러 페이즈 중 하나인지 확인
   */
  isAnyPhase(...phases: BattlePhase[]): boolean {
    return phases.includes(this.currentPhase);
  }

  /**
   * 페이즈 리셋 (새로운 전투 시작 시)
   */
  reset(): void {
    this.currentPhase = BattlePhase.INITIALIZING;
    this.phaseHistory = [BattlePhase.INITIALIZING];
  }

  /**
   * 강제 페이즈 전환 (디버그용, 검증 없음)
   */
  forceTransition(phase: BattlePhase): void {
    console.warn(`[BattlePhase] FORCED transition: ${this.currentPhase} -> ${phase}`);
    this.currentPhase = phase;
    this.phaseHistory.push(phase);
  }
}

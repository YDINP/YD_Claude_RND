/**
 * ArcaneCollectors v4 - 게임 시스템 모듈
 *
 * 핵심 게임 시스템 Export (17개 전체)
 */

// ==================== 전투 시스템 ====================

// 전투 시스템
export {
  BattleSystem,
  BattleUnit,
  BattleState,
  BattleEventEmitter,
  SynergyCalculator,
  SkillStrategy,
  BasicAttackStrategy,
  PowerStrikeStrategy,
  HealStrategy,
  AoeAttackStrategy
} from './BattleSystem.js';

// 시너지 시스템
export { SynergySystem } from './SynergySystem.js';

// 분위기 상성 시스템
export {
  MoodSystem,
  moodSystem,
  MOOD_TYPES,
  MATCHUP_CONFIG,
  MOOD_MATCHUPS,
  CULT_MOOD_BONUSES,
} from './MoodSystem.js';

// ==================== 캐릭터 관리 ====================

// 파티 매니저
export { PartyManager } from './PartyManager.js';

// 진행(성장) 시스템
export { ProgressionSystem } from './ProgressionSystem.js';

// 장비 시스템
export { EquipmentSystem } from './EquipmentSystem.js';

// 진화 시스템
export { EvolutionSystem } from './EvolutionSystem.js';

// ==================== 경제/보상 시스템 ====================

// 에너지 시스템
export {
  EnergySystem,
  energySystem,
  ENERGY_CONFIG,
  STAGE_COSTS
} from './EnergySystem.js';

// 가챠 시스템
export { GachaSystem } from './GachaSystem.js';

// 쿠폰 시스템
export { CouponSystem } from './CouponSystem.js';

// 퀘스트 시스템
export { QuestSystem } from './QuestSystem.js';

// ==================== 인프라 ====================

// 이벤트 버스
export {
  EventBus,
  GameEvents,
  EventUtils
} from './EventBus.js';

// 저장 매니저
export { SaveManager } from './SaveManager.js';

// 소탕 시스템
export {
  SweepSystem,
  sweepSystem,
  SWEEP_CONFIG,
  STAGE_REWARDS
} from './SweepSystem.js';

// 무한의 탑 시스템
export {
  TowerSystem,
  towerSystem,
  TowerEvents
} from './TowerSystem.js';

// 디버그 매니저
export { DebugManager } from './DebugManager.js';

// 기본 export - 싱글톤 인스턴스들
export default {
  energySystem: () => import('./EnergySystem.js').then(m => m.energySystem),
  moodSystem: () => import('./MoodSystem.js').then(m => m.moodSystem),
  sweepSystem: () => import('./SweepSystem.js').then(m => m.sweepSystem),
  towerSystem: () => import('./TowerSystem.js').then(m => m.towerSystem),
};

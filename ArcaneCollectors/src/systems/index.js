/**
 * ArcaneCollectors v4 - 게임 시스템 모듈
 *
 * 핵심 게임 시스템 Export
 */

// 에너지 시스템
export {
  EnergySystem,
  energySystem,
  ENERGY_CONFIG,
  STAGE_COSTS
} from './EnergySystem.js';

// 분위기 상성 시스템
export {
  MoodSystem,
  moodSystem,
  MOOD_TYPES,
  MATCHUP_CONFIG,
  MOOD_MATCHUPS,
  CULT_MOOD_BONUSES,
} from './MoodSystem.js';

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

// 기본 export - 싱글톤 인스턴스들
export default {
  energySystem: () => import('./EnergySystem.js').then(m => m.energySystem),
  moodSystem: () => import('./MoodSystem.js').then(m => m.moodSystem),
  sweepSystem: () => import('./SweepSystem.js').then(m => m.sweepSystem),
  towerSystem: () => import('./TowerSystem.js').then(m => m.towerSystem),
};

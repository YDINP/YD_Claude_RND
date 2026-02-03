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

// 성격 상성 시스템
export { 
  PersonalitySystem, 
  personalitySystem, 
  PERSONALITY_TYPES, 
  MATCHUP_CONFIG,
  PERSONALITY_MATCHUPS,
  CULT_PERSONALITY_BONUSES,
} from './PersonalitySystem.js';

// 소탕 시스템
export { 
  SweepSystem, 
  sweepSystem, 
  SWEEP_CONFIG, 
  STAGE_REWARDS 
} from './SweepSystem.js';

// 기본 export - 싱글톤 인스턴스들
export default {
  energySystem: () => import('./EnergySystem.js').then(m => m.energySystem),
  personalitySystem: () => import('./PersonalitySystem.js').then(m => m.personalitySystem),
  sweepSystem: () => import('./SweepSystem.js').then(m => m.sweepSystem),
};

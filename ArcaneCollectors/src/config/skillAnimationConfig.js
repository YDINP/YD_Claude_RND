/**
 * Skill Animation Configuration
 * Defines animation phases, timings, VFX mappings, and feature flags
 */

export const ANIMATION_PHASES = {
  WINDUP: 'windup',
  IMPACT: 'impact',
  RECOVERY: 'recovery'
};

/**
 * Base timing configurations for different action types (in milliseconds)
 * - windup: preparation/charge-up phase
 * - impact: main effect execution
 * - recovery: return to idle state
 */
export const BASE_TIMINGS = {
  basic_attack: { windup: 150, impact: 200, recovery: 50 },   // total 400ms
  skill1: { windup: 250, impact: 400, recovery: 150 },        // total 800ms
  skill2: { windup: 400, impact: 1200, recovery: 400 },       // total 2000ms
  ultimate: { windup: 500, impact: 1000, recovery: 500 },     // total 2000ms
  heal: { windup: 200, impact: 300, recovery: 100 }           // total 600ms
};

/**
 * VFX mapping per mood (9 moods from v2 system)
 * Each mood has unique color, particle type, and trail effect
 */
export const MOOD_VFX = {
  // Offensive moods
  brave: {
    color: 0xFF6B35,
    particle: 'flame_burst',
    trail: true,
    description: 'Fiery burst with trailing flames'
  },
  fierce: {
    color: 0xDC143C,
    particle: 'slash_wave',
    trail: true,
    description: 'Crimson slash waves'
  },
  wild: {
    color: 0x8B4513,
    particle: 'earth_shatter',
    trail: false,
    description: 'Earth-shattering impacts'
  },

  // Defensive moods
  calm: {
    color: 0x4169E1,
    particle: 'water_ripple',
    trail: false,
    description: 'Tranquil water ripples'
  },
  stoic: {
    color: 0x808080,
    particle: 'stone_shield',
    trail: false,
    description: 'Solid stone barriers'
  },
  devoted: {
    color: 0xFFD700,
    particle: 'holy_light',
    trail: true,
    description: 'Golden holy light'
  },

  // Strategic moods
  cunning: {
    color: 0x9370DB,
    particle: 'shadow_step',
    trail: true,
    description: 'Purple shadow trails'
  },
  noble: {
    color: 0xFFFFFF,
    particle: 'radiant_burst',
    trail: true,
    description: 'Brilliant radiant bursts'
  },
  mystic: {
    color: 0x7B68EE,
    particle: 'arcane_spiral',
    trail: true,
    description: 'Mystic arcane spirals'
  }
};

/**
 * Screen shake configurations
 * - intensity: shake magnitude in pixels
 * - duration: shake duration in milliseconds
 */
export const SCREEN_SHAKE = {
  light: { intensity: 2, duration: 100 },
  medium: { intensity: 4, duration: 200 },
  heavy: { intensity: 8, duration: 400 }
};

/**
 * Feature flags for gradual rollout and rollback capability
 */
export const FEATURE_FLAGS = {
  useNewAnimations: true,  // Master switch: set to false to revert to old behavior
  enableScreenShake: true,
  enableParticles: true,
  enableTrails: true
};

/**
 * Animation configuration presets for different game modes
 */
export const ANIMATION_PRESETS = {
  // Fast mode for quick battles
  FAST: {
    timingMultiplier: 0.5,  // All animations 50% faster
    particleCount: 0.5,     // Fewer particles
    enableTrails: false
  },

  // Normal mode (default)
  NORMAL: {
    timingMultiplier: 1.0,
    particleCount: 1.0,
    enableTrails: true
  },

  // Cinematic mode for dramatic battles
  CINEMATIC: {
    timingMultiplier: 1.5,  // All animations 50% slower
    particleCount: 1.5,     // More particles
    enableTrails: true,
    enhancedEffects: true
  }
};

/**
 * Get timing configuration with preset multiplier applied
 * @param {string} actionType - Action type key from BASE_TIMINGS
 * @param {string} preset - Preset key from ANIMATION_PRESETS
 * @returns {object} Modified timing object
 */
export function getTimingForPreset(actionType, preset = 'NORMAL') {
  const baseTiming = BASE_TIMINGS[actionType] || BASE_TIMINGS.basic_attack;
  const presetConfig = ANIMATION_PRESETS[preset] || ANIMATION_PRESETS.NORMAL;
  const multiplier = presetConfig.timingMultiplier;

  return {
    windup: Math.round(baseTiming.windup * multiplier),
    impact: Math.round(baseTiming.impact * multiplier),
    recovery: Math.round(baseTiming.recovery * multiplier)
  };
}

/**
 * Check if a specific feature is enabled
 * @param {string} featureName - Feature flag key
 * @returns {boolean}
 */
export function isFeatureEnabled(featureName) {
  return FEATURE_FLAGS[featureName] === true;
}

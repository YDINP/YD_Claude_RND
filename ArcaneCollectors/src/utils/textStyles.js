/**
 * textStyles.js - Phaser text style definitions
 */

import { COLORS } from '../config/gameConfig.js';

/**
 * Predefined text styles for consistent UI typography
 */
export const TextStyles = {
  // ============================================
  // Headers & Titles
  // ============================================

  title: {
    fontFamily: 'Noto Sans KR',
    fontSize: '32px',
    fontStyle: 'bold',
    color: '#F8FAFC',
    stroke: '#000000',
    strokeThickness: 2
  },

  subtitle: {
    fontFamily: 'Noto Sans KR',
    fontSize: '24px',
    fontStyle: 'bold',
    color: '#F8FAFC'
  },

  heading: {
    fontFamily: 'Noto Sans KR',
    fontSize: '20px',
    fontStyle: 'bold',
    color: '#F8FAFC'
  },

  // ============================================
  // Body Text
  // ============================================

  body: {
    fontFamily: 'Noto Sans KR',
    fontSize: '16px',
    color: '#F8FAFC'
  },

  bodySmall: {
    fontFamily: 'Noto Sans KR',
    fontSize: '14px',
    color: '#94A3B8'
  },

  bodyTiny: {
    fontFamily: 'Noto Sans KR',
    fontSize: '12px',
    color: '#64748B'
  },

  // ============================================
  // UI Elements
  // ============================================

  button: {
    fontFamily: 'Noto Sans KR',
    fontSize: '18px',
    fontStyle: 'bold',
    color: '#FFFFFF'
  },

  buttonSmall: {
    fontFamily: 'Noto Sans KR',
    fontSize: '14px',
    fontStyle: 'bold',
    color: '#FFFFFF'
  },

  label: {
    fontFamily: 'Noto Sans KR',
    fontSize: '12px',
    fontStyle: 'bold',
    color: '#94A3B8'
  },

  tooltip: {
    fontFamily: 'Noto Sans KR',
    fontSize: '14px',
    color: '#F8FAFC',
    backgroundColor: '#1E293B',
    padding: { x: 8, y: 4 }
  },

  // ============================================
  // Numbers & Currency
  // ============================================

  number: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#F8FAFC'
  },

  numberLarge: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '24px',
    fontStyle: 'bold',
    color: '#F8FAFC'
  },

  gold: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#F59E0B'
  },

  gem: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#EC4899'
  },

  stamina: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#22C55E'
  },

  // ============================================
  // Rarity Colors
  // ============================================

  rarity: {
    N: { color: '#9CA3AF' },
    R: { color: '#3B82F6' },
    SR: { color: '#A855F7' },
    SSR: { color: '#F59E0B' }
  },

  rarityName: {
    N: {
      fontFamily: 'Noto Sans KR',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#9CA3AF'
    },
    R: {
      fontFamily: 'Noto Sans KR',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#3B82F6'
    },
    SR: {
      fontFamily: 'Noto Sans KR',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#A855F7'
    },
    SSR: {
      fontFamily: 'Noto Sans KR',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#F59E0B'
    }
  },

  // ============================================
  // Battle Text
  // ============================================

  damage: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '24px',
    fontStyle: 'bold',
    color: '#EF4444',
    stroke: '#000000',
    strokeThickness: 3
  },

  heal: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '24px',
    fontStyle: 'bold',
    color: '#22C55E',
    stroke: '#000000',
    strokeThickness: 3
  },

  critical: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '32px',
    fontStyle: 'bold',
    color: '#FBBF24',
    stroke: '#000000',
    strokeThickness: 4
  },

  miss: {
    fontFamily: 'Noto Sans KR',
    fontSize: '18px',
    fontStyle: 'italic',
    color: '#94A3B8',
    stroke: '#000000',
    strokeThickness: 2
  },

  buff: {
    fontFamily: 'Noto Sans KR',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#3B82F6',
    stroke: '#000000',
    strokeThickness: 2
  },

  debuff: {
    fontFamily: 'Noto Sans KR',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#F97316',
    stroke: '#000000',
    strokeThickness: 2
  },

  // ============================================
  // Hero Card Text
  // ============================================

  heroName: {
    fontFamily: 'Noto Sans KR',
    fontSize: '16px',
    fontStyle: 'bold',
    color: '#F8FAFC'
  },

  heroLevel: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '12px',
    fontStyle: 'bold',
    color: '#F8FAFC',
    backgroundColor: '#1E293B'
  },

  heroStat: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '14px',
    color: '#94A3B8'
  },

  heroStatValue: {
    fontFamily: 'Roboto Mono, monospace',
    fontSize: '14px',
    fontStyle: 'bold',
    color: '#F8FAFC'
  },

  // ============================================
  // Element Colors
  // ============================================

  element: {
    fire: { color: '#EF4444' },
    water: { color: '#3B82F6' },
    wind: { color: '#22C55E' },
    light: { color: '#FACC15' },
    dark: { color: '#8B5CF6' }
  }
};

/**
 * Merge base style with overrides
 * @param {object} base - Base text style
 * @param {object} overrides - Style overrides
 * @returns {object} Merged style
 */
export function mergeStyles(base, overrides) {
  return { ...base, ...overrides };
}

/**
 * Get text style for rarity
 * @param {string} rarity - Rarity code (N, R, SR, SSR)
 * @param {string} baseStyle - Base style name to use
 * @returns {object} Text style with rarity color
 */
export function getRarityStyle(rarity, baseStyle = 'body') {
  const base = TextStyles[baseStyle] || TextStyles.body;
  const rarityColor = TextStyles.rarity[rarity] || TextStyles.rarity.N;
  return mergeStyles(base, rarityColor);
}

/**
 * Get text style for element
 * @param {string} element - Element name (fire, water, wind, light, dark)
 * @param {string} baseStyle - Base style name to use
 * @returns {object} Text style with element color
 */
export function getElementStyle(element, baseStyle = 'body') {
  const base = TextStyles[baseStyle] || TextStyles.body;
  const elementColor = TextStyles.element[element] || { color: '#F8FAFC' };
  return mergeStyles(base, elementColor);
}

/**
 * Create centered text style
 * @param {object} style - Base style
 * @returns {object} Style with center alignment
 */
export function centerStyle(style) {
  return mergeStyles(style, { align: 'center' });
}

/**
 * Create word-wrapped text style
 * @param {object} style - Base style
 * @param {number} width - Word wrap width
 * @returns {object} Style with word wrap
 */
export function wrapStyle(style, width) {
  return mergeStyles(style, {
    wordWrap: { width, useAdvancedWrap: true }
  });
}

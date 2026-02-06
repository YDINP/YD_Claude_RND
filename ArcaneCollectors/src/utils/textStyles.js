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
  // Mood Colors
  // ============================================

  mood: {
    brave: { color: '#E74C3C' },     // 열혈 - 빨강
    fierce: { color: '#FF5722' },    // 격렬 - 주홍
    wild: { color: '#27AE60' },      // 광폭 - 초록
    calm: { color: '#3498DB' },      // 고요 - 파랑
    stoic: { color: '#607D8B' },     // 의연 - 청회색
    devoted: { color: '#E91E63' },   // 헌신 - 핑크
    cunning: { color: '#9B59B6' },   // 냉철 - 보라
    noble: { color: '#FFD700' },     // 고결 - 금색
    mystic: { color: '#F39C12' }     // 신비 - 주황금
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
 * Get text style for mood
 * @param {string} mood - Mood name (brave, cunning, calm, wild, mystic)
 * @param {string} baseStyle - Base style name to use
 * @returns {object} Text style with mood color
 */
export function getMoodStyle(mood, baseStyle = 'body') {
  const base = TextStyles[baseStyle] || TextStyles.body;
  const moodColor = TextStyles.mood[mood] || { color: '#F8FAFC' };
  return mergeStyles(base, moodColor);
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

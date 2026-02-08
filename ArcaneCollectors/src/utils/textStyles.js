/**
 * textStyles.js - Phaser text style definitions
 * Design System 기반 통합 타이포그래피
 */

import { DESIGN } from '../config/designSystem.js';

const { font, colors } = DESIGN;
const F = font.family.primary;
const M = font.family.mono;

/**
 * Predefined text styles for consistent UI typography
 */
export const TextStyles = {
  // ============================================
  // Headers & Titles
  // ============================================

  title: {
    fontFamily: F,
    fontSize: `${font.size.title}px`,
    fontStyle: 'bold',
    color: colors.text.primary,
    stroke: '#000000',
    strokeThickness: 2
  },

  subtitle: {
    fontFamily: F,
    fontSize: `${font.size.header}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  heading: {
    fontFamily: F,
    fontSize: `${font.size.subheader}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  // ============================================
  // Body Text
  // ============================================

  body: {
    fontFamily: F,
    fontSize: `${font.size.body}px`,
    color: colors.text.primary
  },

  bodySmall: {
    fontFamily: F,
    fontSize: `${font.size.small}px`,
    color: colors.text.secondary
  },

  bodyTiny: {
    fontFamily: F,
    fontSize: `${font.size.caption}px`,
    color: colors.text.muted
  },

  // ============================================
  // UI Elements
  // ============================================

  button: {
    fontFamily: F,
    fontSize: `${font.size.button}px`,
    fontStyle: 'bold',
    color: '#FFFFFF'
  },

  buttonSmall: {
    fontFamily: F,
    fontSize: `${font.size.small}px`,
    fontStyle: 'bold',
    color: '#FFFFFF'
  },

  label: {
    fontFamily: F,
    fontSize: `${font.size.caption}px`,
    fontStyle: 'bold',
    color: colors.text.secondary
  },

  tooltip: {
    fontFamily: F,
    fontSize: `${font.size.small}px`,
    color: colors.text.primary,
    backgroundColor: '#1E293B',
    padding: { x: 8, y: 4 }
  },

  // ============================================
  // Numbers & Currency
  // ============================================

  number: {
    fontFamily: M,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  numberLarge: {
    fontFamily: M,
    fontSize: `${font.size.header}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  gold: {
    fontFamily: M,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.currency.gold
  },

  gem: {
    fontFamily: M,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.currency.gem
  },

  stamina: {
    fontFamily: M,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.currency.stamina
  },

  // ============================================
  // Rarity Colors
  // ============================================

  rarity: {
    N: { color: colors.rarityNamed.N.css },
    R: { color: colors.rarityNamed.R.css },
    SR: { color: colors.rarityNamed.SR.css },
    SSR: { color: colors.rarityNamed.SSR.css }
  },

  rarityName: {
    N: {
      fontFamily: F,
      fontSize: `${font.size.small}px`,
      fontStyle: 'bold',
      color: colors.rarityNamed.N.css
    },
    R: {
      fontFamily: F,
      fontSize: `${font.size.small}px`,
      fontStyle: 'bold',
      color: colors.rarityNamed.R.css
    },
    SR: {
      fontFamily: F,
      fontSize: `${font.size.small}px`,
      fontStyle: 'bold',
      color: colors.rarityNamed.SR.css
    },
    SSR: {
      fontFamily: F,
      fontSize: `${font.size.small}px`,
      fontStyle: 'bold',
      color: colors.rarityNamed.SSR.css
    }
  },

  // ============================================
  // Battle Text
  // ============================================

  damage: {
    fontFamily: M,
    fontSize: `${font.size.header}px`,
    fontStyle: 'bold',
    color: colors.battle.damage,
    stroke: '#000000',
    strokeThickness: 3
  },

  heal: {
    fontFamily: M,
    fontSize: `${font.size.header}px`,
    fontStyle: 'bold',
    color: colors.battle.heal,
    stroke: '#000000',
    strokeThickness: 3
  },

  critical: {
    fontFamily: M,
    fontSize: `${font.size.title}px`,
    fontStyle: 'bold',
    color: colors.battle.critical,
    stroke: '#000000',
    strokeThickness: 4
  },

  miss: {
    fontFamily: F,
    fontSize: `${font.size.button}px`,
    fontStyle: 'italic',
    color: colors.battle.miss,
    stroke: '#000000',
    strokeThickness: 2
  },

  buff: {
    fontFamily: F,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.battle.buff,
    stroke: '#000000',
    strokeThickness: 2
  },

  debuff: {
    fontFamily: F,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.battle.debuff,
    stroke: '#000000',
    strokeThickness: 2
  },

  // ============================================
  // Hero Card Text
  // ============================================

  heroName: {
    fontFamily: F,
    fontSize: `${font.size.body}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  heroLevel: {
    fontFamily: M,
    fontSize: `${font.size.caption}px`,
    fontStyle: 'bold',
    color: colors.text.primary,
    backgroundColor: '#1E293B'
  },

  heroStat: {
    fontFamily: M,
    fontSize: `${font.size.small}px`,
    color: colors.text.secondary
  },

  heroStatValue: {
    fontFamily: M,
    fontSize: `${font.size.small}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  // ============================================
  // Mood Colors
  // ============================================

  mood: {
    brave:   { color: colors.moodCSS.brave },
    fierce:  { color: colors.moodCSS.fierce },
    wild:    { color: colors.moodCSS.wild },
    calm:    { color: colors.moodCSS.calm },
    stoic:   { color: colors.moodCSS.stoic },
    devoted: { color: colors.moodCSS.devoted },
    cunning: { color: colors.moodCSS.cunning },
    noble:   { color: colors.moodCSS.noble },
    mystic:  { color: colors.moodCSS.mystic }
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
 * @param {string} mood - Mood name (brave, cunning, calm, wild, mystic, etc.)
 * @param {string} baseStyle - Base style name to use
 * @returns {object} Text style with mood color
 */
export function getMoodStyle(mood, baseStyle = 'body') {
  const base = TextStyles[baseStyle] || TextStyles.body;
  const moodColor = TextStyles.mood[mood] || { color: colors.text.primary };
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

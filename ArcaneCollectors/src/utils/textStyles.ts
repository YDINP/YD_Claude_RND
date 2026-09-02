/**
 * textStyles.ts - Phaser text style definitions
 * Design System 기반 통합 타이포그래피
 */

import { DESIGN, getTypoToken } from '../config/designSystem.js';
import { sf } from '../config/scaleConfig.js';

const { font, colors } = DESIGN;
const F = font.family.primary;   // Noto Sans KR — 캐릭터명/본문
const D = font.family.display;   // Orbitron — 타이틀/헤드라인 (서브컬쳐)
const M = font.family.mono;      // Roboto Mono — 수치/재화

/**
 * Text style configuration for Phaser text objects
 */
export interface TextStyle {
  fontFamily?: string;
  fontSize?: string;
  fontStyle?: string;
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  backgroundColor?: string;
  padding?: { x: number; y: number };
  align?: string;
  wordWrap?: { width: number; useAdvancedWrap?: boolean };
}

/**
 * Rarity text styles type
 */
export interface RarityStyles {
  N: TextStyle;
  R: TextStyle;
  SR: TextStyle;
  SSR: TextStyle;
}

/**
 * Mood text styles type
 */
export interface MoodStyles {
  brave: TextStyle;
  fierce: TextStyle;
  wild: TextStyle;
  calm: TextStyle;
  stoic: TextStyle;
  devoted: TextStyle;
  cunning: TextStyle;
  noble: TextStyle;
  mystic: TextStyle;
}

/**
 * Predefined text styles for consistent UI typography
 */
export const TextStyles = {
  // ============================================
  // Headers & Titles
  // ============================================

  title: {
    fontFamily: D,              // Orbitron — 서브컬쳐 헤드라인
    fontSize: `${font.size.title}px`,
    fontStyle: 'bold',
    color: colors.text.primary,
    stroke: '#000000',
    strokeThickness: 2
  },

  subtitle: {
    fontFamily: D,              // Orbitron
    fontSize: `${font.size.header}px`,
    fontStyle: 'bold',
    color: colors.text.primary
  },

  heading: {
    fontFamily: D,              // Orbitron
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
    backgroundColor: '#141627',
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
  } as RarityStyles,

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
  } as RarityStyles,

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
    backgroundColor: '#141627'
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
  } as MoodStyles
};

/**
 * Merge base style with overrides
 * @param base - Base text style
 * @param overrides - Style overrides
 * @returns Merged style
 */
export function mergeStyles(base: TextStyle, overrides: TextStyle): TextStyle {
  return { ...base, ...overrides };
}

/**
 * Get text style for rarity
 * @param rarity - Rarity code (N, R, SR, SSR)
 * @param baseStyle - Base style name to use
 * @returns Text style with rarity color
 */
export function getRarityStyle(rarity: string, baseStyle: string = 'body'): TextStyle {
  const base = (TextStyles as any)[baseStyle] || TextStyles.body;
  const rarityColor = (TextStyles.rarity as any)[rarity] || TextStyles.rarity.N;
  return mergeStyles(base, rarityColor);
}

/**
 * Get text style for mood
 * @param mood - Mood name (brave, cunning, calm, wild, mystic, etc.)
 * @param baseStyle - Base style name to use
 * @returns Text style with mood color
 */
export function getMoodStyle(mood: string, baseStyle: string = 'body'): TextStyle {
  const base = (TextStyles as any)[baseStyle] || TextStyles.body;
  const moodColor = (TextStyles.mood as any)[mood] || { color: colors.text.primary };
  return mergeStyles(base, moodColor);
}

/**
 * Create centered text style
 * @param style - Base style
 * @returns Style with center alignment
 */
export function centerStyle(style: TextStyle): TextStyle {
  return mergeStyles(style, { align: 'center' });
}

/**
 * Create word-wrapped text style
 * @param style - Base style
 * @param width - Word wrap width
 * @returns Style with word wrap
 */
export function wrapStyle(style: TextStyle, width: number): TextStyle {
  return mergeStyles(style, {
    wordWrap: { width, useAdvancedWrap: true }
  });
}


// ============================================
// Typography Tokens (REDESIGN_PLAN §2-6) — T-08
// ts('display.lg') 한 줄로 서체·크기·굵기·색을 한꺼번에 얻는다.
// 서체는 세 역할로 분리된다: Orbitron(display) / Noto Sans KR(body) / Roboto Mono(mono)
// ============================================

/** 타이포 역할 이름 */
export const TYPO_ROLE = {
  DISPLAY: 'display',
  BODY: 'body',
  MONO: 'mono'
} as const;

/** CSS font-weight 숫자 → Phaser fontStyle 문자열 */
const WEIGHT_TO_FONT_STYLE: Record<number, string> = {
  400: 'normal',
  500: '500',
  700: 'bold'
};

/**
 * 역할 이름에 대응하는 폰트 패밀리 문자열을 반환한다.
 * DESIGN 을 함수 안에서 읽어 모듈 초기화 순서에 의존하지 않는다.
 */
export function familyForRole(role: string): string {
  const family = DESIGN.font.family;
  if (role === TYPO_ROLE.DISPLAY) return family.display;
  if (role === TYPO_ROLE.MONO) return family.mono;
  return family.primary;
}

/** 해석된 타이포 토큰 */
export interface ResolvedTypo {
  token: string;
  base: number;
  role: string;
  weight: number;
  family: string;
  fontSize: string;
  fontStyle: string;
}

/**
 * 타이포 토큰을 서체·크기·굵기로 해석한다 (순수 함수).
 * @param token - 'display.xl' | 'display.lg' | 'title' | 'subtitle' | 'body'
 *                | 'label' | 'caption' | 'num.lg' | 'num.md' | 'num.sm'
 * @returns 해석 결과. 알 수 없는 토큰은 'body' 로 폴백한다
 */
export function resolveTypoToken(token: string): ResolvedTypo {
  const spec = getTypoToken(token) || getTypoToken('body');
  const role = spec!.role;
  const weight = spec!.weight;
  return {
    token,
    base: spec!.base,
    role,
    weight,
    family: familyForRole(role),
    fontSize: sf(spec!.base),
    fontStyle: WEIGHT_TO_FONT_STYLE[weight] || 'normal'
  };
}

/**
 * 타이포 토큰으로 Phaser 텍스트 스타일을 만든다.
 * @param token - 타이포 토큰 경로
 * @param overrides - 색상·정렬 등 개별 덮어쓰기
 * @returns Phaser Text 에 그대로 넘길 수 있는 스타일
 *
 * @example
 *   scene.add.text(x, y, 'VICTORY', ts('display.xl', { color: '#FFD60A' }));
 *   scene.add.text(x, y, '12,340', ts('num.md'));
 */
export function ts(token: string, overrides: TextStyle = {}): TextStyle {
  const resolved = resolveTypoToken(token);
  return {
    fontFamily: resolved.family,
    fontSize: resolved.fontSize,
    fontStyle: resolved.fontStyle,
    color: DESIGN.colors.text.primary,
    ...overrides
  };
}

/**
 * 사용 가능한 모든 타이포 토큰 경로 (검증·문서용)
 */
export const TYPO_TOKENS: string[] = [
  'display.xl', 'display.lg',
  'title', 'subtitle', 'body', 'label', 'caption',
  'num.lg', 'num.md', 'num.sm'
];

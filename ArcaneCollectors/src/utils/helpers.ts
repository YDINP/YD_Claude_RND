/**
 * helpers.ts - General utility functions
 */

// ============================================
// Rarity Conversion - rarityUtils에서 재export
// ============================================
export { getRarityKey, getRarityNum, isValidRarity } from './rarityUtils.js';

// ============================================
// Number Formatting
// ============================================

/**
 * Format number with K/M/B suffixes or commas
 * @param num - Number to format
 * @returns Formatted string
 */
export function formatNumber(num: number): string {
  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(1)}B`;
  }
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return num.toLocaleString();
  }
  return num.toString();
}

/**
 * Format seconds to human readable time
 * @param seconds - Total seconds
 * @returns Formatted time string like "1h 30m" or "45m 20s"
 */
export function formatTime(seconds: number): string {
  if (seconds < 0) seconds = 0;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format timestamp to date string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date like "2024-01-26"
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================
// Random Utilities
// ============================================

/**
 * Generate random integer between min and max (inclusive)
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer
 */
export function randomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float between min and max
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random float
 */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Select random item based on weights
 * @param items - Array of items to choose from
 * @param weights - Corresponding weights for each item
 * @returns Selected item
 */
export function weightedRandom<T>(items: T[], weights: number[]): T {
  if (items.length !== weights.length) {
    throw new Error('Items and weights arrays must have same length');
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param array - Array to shuffle
 * @returns New shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================
// Math Utilities
// ============================================

/**
 * Clamp value between min and max
 * @param value - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param start - Start value
 * @param end - End value
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp(t, 0, 1);
}

// ============================================
// Color Utilities
// ============================================

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Convert hex color string to RGB object
 * @param hex - Hex color string (e.g., "#FF5733" or "FF5733")
 * @returns RGB object
 */
export function hexToRgb(hex: string): RGBColor {
  const cleanHex = hex.replace(/^#/, '');
  const bigint = parseInt(cleanHex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

/**
 * Convert RGB values to hex color string
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns Hex color string with # prefix
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number): string => {
    const hex = clamp(Math.round(c), 0, 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Linear interpolation between two colors
 * @param color1 - Start hex color
 * @param color2 - End hex color
 * @param t - Interpolation factor (0-1)
 * @returns Interpolated hex color
 */
export function colorLerp(color1: string, color2: string, t: number): string {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  return rgbToHex(
    lerp(c1.r, c2.r, t),
    lerp(c1.g, c2.g, t),
    lerp(c1.b, c2.b, t)
  );
}

// ============================================
// Object Utilities
// ============================================

/**
 * Deep clone an object
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  const cloned: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Generate simple unique ID
 * @returns Unique ID string
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${randomPart}`;
}

// ============================================
// Array Utilities
// ============================================

/**
 * Pick random element from array
 * @param array - Source array
 * @returns Random element or null if empty
 */
export function randomElement<T>(array: T[]): T | null {
  if (!array || array.length === 0) return null;
  return array[randomInt(0, array.length - 1)];
}

/**
 * Remove element from array by value
 * @param array - Source array
 * @param element - Element to remove
 * @returns True if element was removed
 */
export function removeElement<T>(array: T[], element: T): boolean {
  const index = array.indexOf(element);
  if (index > -1) {
    array.splice(index, 1);
    return true;
  }
  return false;
}

// ============================================
// Game Log System
// ============================================

type LogCategory = 'Battle' | 'Gacha' | 'Save' | 'UI' | 'Error' | 'System' | 'Network';

/**
 * 게임 로그 유틸리티
 */
export const GameLog = {
  enabled: true,

  battle(msg: string, data?: any): void {
    this._log('Battle', msg, data, '#FF6B6B');
  },

  gacha(msg: string, data?: any): void {
    this._log('Gacha', msg, data, '#9B59B6');
  },

  save(msg: string, data?: any): void {
    this._log('Save', msg, data, '#3498DB');
  },

  ui(msg: string, data?: any): void {
    this._log('UI', msg, data, '#2ECC71');
  },

  error(msg: string, data?: any): void {
    this._log('Error', msg, data, '#E74C3C');
  },

  system(msg: string, data?: any): void {
    this._log('System', msg, data, '#F39C12');
  },

  network(msg: string, data?: any): void {
    this._log('Network', msg, data, '#1ABC9C');
  },

  _log(category: LogCategory, msg: string, data: any, color: string): void {
    if (!this.enabled) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c[${timestamp}] [${category}] ${msg}`,
      `color: ${color}; font-weight: bold;`,
      data !== undefined ? data : ''
    );
  },

  /**
   * 로그 활성화/비활성화
   * @param enabled 활성화 여부
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
};

// Energy formatting
export function formatEnergy(current: number, max: number): string {
  return `⚡ ${current}/${max}`;
}

// Time formatting (mm:ss) for battle timer
export function formatBattleTimer(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type Mood = 'brave' | 'fierce' | 'wild' | 'calm' | 'stoic' | 'devoted' | 'cunning' | 'noble' | 'mystic';
type Cult = 'valhalla' | 'takamagahara' | 'olympus' | 'asgard' | 'yomi' | 'tartarus' | 'avalon' | 'helheim' | 'kunlun';

// Mood icon
export function getMoodIcon(mood: Mood): string {
  const icons: Record<Mood, string> = {
    brave: '⚔️',
    fierce: '🔥',
    wild: '🐺',
    calm: '🛡️',
    stoic: '🪨',
    devoted: '💖',
    cunning: '🗡️',
    noble: '👑',
    mystic: '✨'
  };
  return icons[mood] || '❓';
}

// Cult icon
export function getCultIcon(cult: Cult): string {
  const icons: Record<Cult, string> = {
    valhalla: '⚡',
    takamagahara: '☀️',
    olympus: '🔱',
    asgard: '❄️',
    yomi: '💀',
    tartarus: '🌑',
    avalon: '🍀',
    helheim: '🥶',
    kunlun: '🐉'
  };
  return icons[cult] || '❓';
}

// Stars
export function generateStars(count: number, max: number = 3): string {
  return '⭐'.repeat(count) + '☆'.repeat(max - count);
}

// Compact number formatting (1000 → 1K)
export function formatNumberShort(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Random range
export function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Array shuffle
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * helpers.js - General utility functions
 */

// ============================================
// Number Formatting
// ============================================

/**
 * Format number with K/M/B suffixes or commas
 * @param {number} num - Number to format
 * @returns {string} Formatted string
 */
export function formatNumber(num) {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return num.toLocaleString();
  }
  return num.toString();
}

/**
 * Format seconds to human readable time
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time string like "1h 30m" or "45m 20s"
 */
export function formatTime(seconds) {
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
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted date like "2024-01-26"
 */
export function formatDate(timestamp) {
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
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random integer
 */
export function randomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random float
 */
export function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Select random item based on weights
 * @param {Array} items - Array of items to choose from
 * @param {Array<number>} weights - Corresponding weights for each item
 * @returns {*} Selected item
 */
export function weightedRandom(items, weights) {
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
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function shuffleArray(array) {
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
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum bound
 * @param {number} max - Maximum bound
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

// ============================================
// Color Utilities
// ============================================

/**
 * Convert hex color string to RGB object
 * @param {string} hex - Hex color string (e.g., "#FF5733" or "FF5733")
 * @returns {{r: number, g: number, b: number}} RGB object
 */
export function hexToRgb(hex) {
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
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} Hex color string with # prefix
 */
export function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = clamp(Math.round(c), 0, 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Linear interpolation between two colors
 * @param {string} color1 - Start hex color
 * @param {string} color2 - End hex color
 * @param {number} t - Interpolation factor (0-1)
 * @returns {string} Interpolated hex color
 */
export function colorLerp(color1, color2, t) {
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
 * @param {*} obj - Object to clone
 * @returns {*} Deep cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Generate simple unique ID
 * @returns {string} Unique ID string
 */
export function generateId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${randomPart}`;
}

// ============================================
// Array Utilities
// ============================================

/**
 * Pick random element from array
 * @param {Array} array - Source array
 * @returns {*} Random element
 */
export function randomElement(array) {
  if (!array || array.length === 0) return null;
  return array[randomInt(0, array.length - 1)];
}

/**
 * Remove element from array by value
 * @param {Array} array - Source array
 * @param {*} element - Element to remove
 * @returns {boolean} True if element was removed
 */
export function removeElement(array, element) {
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

/**
 * 게임 로그 유틸리티
 */
export const GameLog = {
  enabled: true,

  battle(msg, data) {
    this._log('Battle', msg, data, '#FF6B6B');
  },

  gacha(msg, data) {
    this._log('Gacha', msg, data, '#9B59B6');
  },

  save(msg, data) {
    this._log('Save', msg, data, '#3498DB');
  },

  ui(msg, data) {
    this._log('UI', msg, data, '#2ECC71');
  },

  error(msg, data) {
    this._log('Error', msg, data, '#E74C3C');
  },

  system(msg, data) {
    this._log('System', msg, data, '#F39C12');
  },

  network(msg, data) {
    this._log('Network', msg, data, '#1ABC9C');
  },

  _log(category, msg, data, color) {
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
   * @param {boolean} enabled 활성화 여부
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
};
// Energy formatting
export function formatEnergy(current, max) {
  return `⚡ ${current}/${max}`;
}

// Time formatting (mm:ss) for battle timer
export function formatBattleTimer(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Mood icon
export function getMoodIcon(mood) {
  const icons = {
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
export function getCultIcon(cult) {
  const icons = {
    valhalla: '⚡',
    takamagahara: '☀️',
    olympus: '🔱',
    asgard: '❄️',
    yomi: '💀'
  };
  return icons[cult] || '❓';
}

// Stars
export function generateStars(count, max = 3) {
  return '⭐'.repeat(count) + '☆'.repeat(max - count);
}

// Compact number formatting (1000 → 1K)
export function formatNumberShort(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Random range
export function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Array shuffle
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

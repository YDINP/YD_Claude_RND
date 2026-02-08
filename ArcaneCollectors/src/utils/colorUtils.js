/**
 * ArcaneCollectors - Color Utilities
 * 에너지 및 UI 색상 관련 유틸리티
 */

/**
 * 에너지 비율에 따른 색상 반환
 * @param {number} percentage - 에너지 비율 (0-1)
 * @returns {number} Phaser 색상 값 (hex)
 */
export function getEnergyColor(percentage) {
  if (percentage > 0.6) {
    return 0x22C55E; // green - 충분
  }
  if (percentage > 0.3) {
    return 0xEAB308; // yellow - 중간
  }
  return 0xEF4444; // red - 부족
}

/**
 * 시간(초)을 MM:SS 포맷으로 변환
 * @param {number} seconds - 초 단위 시간
 * @returns {string} MM:SS 형식 문자열
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 색상 값을 CSS hex 문자열로 변환
 * @param {number} color - Phaser 색상 값
 * @returns {string} CSS hex 색상 문자열 (예: '#FFFFFF')
 */
export function colorToHex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * RGB 값을 Phaser 색상으로 변환
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Phaser 색상 값
 */
export function rgbToColor(r, g, b) {
  return (r << 16) + (g << 8) + b;
}

/**
 * 색상 보간 (두 색상 사이의 중간 색상)
 * @param {number} color1 - 시작 색상
 * @param {number} color2 - 끝 색상
 * @param {number} t - 보간 비율 (0-1)
 * @returns {number} 보간된 색상
 */
export function lerpColor(color1, color2, t) {
  const r1 = (color1 >> 16) & 0xFF;
  const g1 = (color1 >> 8) & 0xFF;
  const b1 = color1 & 0xFF;

  const r2 = (color2 >> 16) & 0xFF;
  const g2 = (color2 >> 8) & 0xFF;
  const b2 = color2 & 0xFF;

  const r = Math.floor(r1 + (r2 - r1) * t);
  const g = Math.floor(g1 + (g2 - g1) * t);
  const b = Math.floor(b1 + (b2 - b1) * t);

  return (r << 16) + (g << 8) + b;
}

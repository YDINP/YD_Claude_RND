/**
 * ArcaneCollectors - Scale Configuration
 * 순환 의존성 방지를 위해 gameConfig.js에서 분리
 * 모든 씬/컴포넌트는 이 파일에서 s(), sf()를 import
 */

// ============================================
// Game Dimensions & Dynamic Scaling
// ============================================
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;
export const BASE_WIDTH = 720;
export const SCALE_FACTOR = GAME_WIDTH / BASE_WIDTH;

/** 픽셀 스케일 헬퍼 — 모든 하드코딩 값에 적용 */
export function s(value) {
  return Math.round(value * SCALE_FACTOR);
}

/** 폰트 스케일 헬퍼 — px 문자열 반환 */
export function sf(basePx) {
  return `${Math.round(basePx * SCALE_FACTOR)}px`;
}

/**
 * particleConfig.js - 파티클 이펙트 설정
 * H-10: 이펙트 파티클 라이브러리
 */

// ============================================
// Mood별 파티클 색상
// ============================================
export const MOOD_PARTICLE_COLORS = {
  brave:   [0xE74C3C, 0xFF6B6B, 0xFFA07A],  // 열혈 - 불꽃 계열
  fierce:  [0xFF5722, 0xFF7043, 0xFFAB91],  // 격렬 - 폭발 계열
  wild:    [0x27AE60, 0x2ECC71, 0x82E0AA],  // 광폭 - 번개/바람 계열
  calm:    [0x3498DB, 0x5DADE2, 0xAED6F1],  // 고요 - 물결 계열
  stoic:   [0x607D8B, 0x90A4AE, 0xB0BEC5],  // 의연 - 강철 계열
  devoted: [0xE91E63, 0xF48FB1, 0xF8BBD0],  // 헌신 - 치유 계열
  cunning: [0x9B59B6, 0xBB8FCE, 0xD7BDE2],  // 냉철 - 얼음 계열
  noble:   [0xFFD700, 0xFFE44D, 0xFFF176],  // 고결 - 금빛 계열
  mystic:  [0xF39C12, 0xF5B041, 0xFAD7A0]   // 신비 - 별빛 계열
};

// ============================================
// 등급별 파티클 색상
// ============================================
export const RARITY_PARTICLE_COLORS = {
  N:   null,                                   // 없음
  R:   [0x3B82F6, 0x60A5FA, 0x93C5FD],       // 파랑
  SR:  [0xA855F7, 0xC084FC, 0xD8B4FE],       // 보라
  SSR: [0xF59E0B, 0xFBBF24, 0xFDE68A]        // 금색
};

// ============================================
// 공통 파티클 프리셋
// ============================================
export const PARTICLE_PRESETS = {
  // H-10.1: 별 반짝임
  sparkle: {
    count: 8,
    speed: { min: 30, max: 80 },
    scale: { start: 0.6, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 400, max: 800 },
    angle: { min: 0, max: 360 },
    shape: 'circle',
    size: 3
  },

  // H-10.1: 연기
  smoke: {
    count: 6,
    speed: { min: 10, max: 30 },
    scale: { start: 0.3, end: 1.2 },
    alpha: { start: 0.5, end: 0 },
    lifespan: { min: 600, max: 1200 },
    angle: { min: 250, max: 290 },
    shape: 'circle',
    size: 8
  },

  // H-10.1: 불꽃
  flame: {
    count: 12,
    speed: { min: 50, max: 120 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 300, max: 600 },
    angle: { min: 240, max: 300 },
    gravity: -100,
    shape: 'circle',
    size: 4
  },

  // H-10.1: 빛기둥
  lightPillar: {
    count: 16,
    speed: { min: 100, max: 200 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.8, end: 0 },
    lifespan: { min: 500, max: 1000 },
    angle: { min: 260, max: 280 },
    shape: 'rect',
    size: 2,
    width: 2,
    height: 12
  },

  // H-10.2: 소환 수렴
  converge: {
    count: 20,
    speed: { min: 150, max: 300 },
    scale: { start: 0.8, end: 0.2 },
    alpha: { start: 0.8, end: 1 },
    lifespan: { min: 600, max: 1000 },
    shape: 'circle',
    size: 4,
    converge: true
  },

  // H-10.3: 레벨업 축하
  celebration: {
    count: 24,
    speed: { min: 100, max: 250 },
    scale: { start: 0.6, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 800, max: 1500 },
    angle: { min: 0, max: 360 },
    gravity: 80,
    shape: 'star',
    size: 5
  },

  // 전투 히트 이펙트
  hit: {
    count: 6,
    speed: { min: 80, max: 160 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 200, max: 400 },
    angle: { min: 0, max: 360 },
    shape: 'circle',
    size: 3
  },

  // 크리티컬 히트
  criticalHit: {
    count: 12,
    speed: { min: 100, max: 220 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 300, max: 600 },
    angle: { min: 0, max: 360 },
    shape: 'circle',
    size: 4
  },

  // 힐링 이펙트
  heal: {
    count: 10,
    speed: { min: 40, max: 80 },
    scale: { start: 0.4, end: 0 },
    alpha: { start: 0.8, end: 0 },
    lifespan: { min: 600, max: 1000 },
    angle: { min: 250, max: 290 },
    shape: 'circle',
    size: 3,
    colors: [0x22C55E, 0x4ADE80, 0xBBF7D0]
  },

  // 버프 이펙트
  buff: {
    count: 8,
    speed: { min: 30, max: 60 },
    scale: { start: 0.3, end: 0.6 },
    alpha: { start: 0.6, end: 0 },
    lifespan: { min: 800, max: 1200 },
    angle: { min: 250, max: 290 },
    shape: 'circle',
    size: 3,
    colors: [0x3B82F6, 0x60A5FA]
  },

  // 디버프 이펙트
  debuff: {
    count: 8,
    speed: { min: 30, max: 60 },
    scale: { start: 0.3, end: 0.6 },
    alpha: { start: 0.6, end: 0 },
    lifespan: { min: 800, max: 1200 },
    angle: { min: 70, max: 110 },
    shape: 'circle',
    size: 3,
    colors: [0xEF4444, 0xF87171]
  }
};

// ============================================
// 풀 설정
// ============================================
export const POOL_CONFIG = {
  initialSize: 50,      // 초기 풀 크기
  maxSize: 200,          // 최대 풀 크기
  growthRate: 20,        // 부족 시 확장 개수
  shrinkThreshold: 0.3,  // 사용률 30% 미만 시 축소
  shrinkInterval: 10000  // 축소 확인 간격 (ms)
};

// ============================================
// 데미지 숫자 스타일
// ============================================
export const DAMAGE_NUMBER_STYLES = {
  normal: {
    fontSize: '22px',
    color: '#FFFFFF',
    stroke: '#000000',
    strokeThickness: 3,
    duration: 800,
    rise: 40
  },
  critical: {
    fontSize: '32px',
    color: '#FBBF24',
    stroke: '#000000',
    strokeThickness: 4,
    duration: 1000,
    rise: 60,
    shake: true
  },
  moodAdvantage: {
    fontSize: '24px',
    color: '#FDE047',
    stroke: '#000000',
    strokeThickness: 3,
    duration: 900,
    rise: 50,
    suffix: '▲'
  },
  moodDisadvantage: {
    fontSize: '20px',
    color: '#93C5FD',
    stroke: '#000000',
    strokeThickness: 3,
    duration: 800,
    rise: 35,
    suffix: '▼'
  },
  heal: {
    fontSize: '22px',
    color: '#4ADE80',
    stroke: '#000000',
    strokeThickness: 3,
    duration: 900,
    rise: 45,
    prefix: '+'
  },
  miss: {
    fontSize: '18px',
    color: '#94A3B8',
    stroke: '#000000',
    strokeThickness: 2,
    duration: 600,
    rise: 30,
    text: 'MISS'
  }
};

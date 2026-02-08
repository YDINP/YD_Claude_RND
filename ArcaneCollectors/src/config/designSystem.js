/**
 * ArcaneCollectors - Design System
 * 통합 디자인 토큰: 색상, 간격, 폰트, 터치 규격
 * 모든 UI 컴포넌트와 씬에서 이 파일의 상수를 참조할 것
 */

// ============================================
// Design Tokens
// ============================================

export const DESIGN = {
  // ----------------------------------------
  // Colors
  // ----------------------------------------
  colors: {
    // 배경
    bg: {
      primary: 0x0F172A,    // 최상위 배경 (가장 어두움)
      secondary: 0x1E293B,  // 카드/패널 배경
      surface: 0x334155,    // 표면/입력 필드
      overlay: 0x000000     // 오버레이 (alpha와 함께 사용)
    },

    // 텍스트 (CSS 문자열)
    text: {
      primary: '#F8FAFC',
      secondary: '#94A3B8',
      muted: '#64748B',
      inverse: '#0F172A'
    },

    // 브랜드/액션
    brand: {
      primary: 0x6366F1,    // 인디고 - 주요 액션
      secondary: 0xEC4899,  // 핑크 - 보조 액션
      accent: 0xF59E0B      // 앰버 - 강조/하이라이트
    },

    // 상태
    status: {
      success: 0x10B981,
      warning: 0xF59E0B,
      error: 0xEF4444,
      info: 0x3B82F6
    },

    // 등급 (Phaser hex)
    rarity: {
      1: 0x9CA3AF,  // N - 회색
      2: 0x3B82F6,  // R - 파랑
      3: 0xA855F7,  // SR - 보라
      4: 0xF59E0B,  // SSR - 금색
      5: 0xF59E0B   // SSR+ - 금색 (확장용)
    },

    // 등급 (이름 키)
    rarityNamed: {
      N:   { hex: 0x9CA3AF, css: '#9CA3AF', bg: 0x374151, glow: null },
      R:   { hex: 0x3B82F6, css: '#3B82F6', bg: 0x1E3A5F, glow: null },
      SR:  { hex: 0xA855F7, css: '#A855F7', bg: 0x4C1D95, glow: 0xA855F7 },
      SSR: { hex: 0xF59E0B, css: '#F59E0B', bg: 0x78350F, glow: 0xF59E0B }
    },

    // 분위기 (Phaser hex)
    mood: {
      brave:   0xE74C3C,  // 열혈 - 빨강
      fierce:  0xFF5722,  // 격렬 - 주홍
      wild:    0x27AE60,  // 광폭 - 초록
      calm:    0x3498DB,  // 고요 - 파랑
      stoic:   0x607D8B,  // 의연 - 청회색
      devoted: 0xE91E63,  // 헌신 - 핑크
      cunning: 0x9B59B6,  // 냉철 - 보라
      noble:   0xFFD700,  // 고결 - 금색
      mystic:  0xF39C12   // 신비 - 주황금
    },

    // 분위기 (CSS 문자열)
    moodCSS: {
      brave:   '#E74C3C',
      fierce:  '#FF5722',
      wild:    '#27AE60',
      calm:    '#3498DB',
      stoic:   '#607D8B',
      devoted: '#E91E63',
      cunning: '#9B59B6',
      noble:   '#FFD700',
      mystic:  '#F39C12'
    },

    // 교단 (Phaser hex)
    cult: {
      valhalla:      0x4A90D9,  // 발할라 - 바람의 파랑
      takamagahara:  0xFFD700,  // 타카마가하라 - 빛의 황금
      olympus:       0xFF6B35,  // 올림푸스 - 불의 주황
      asgard:        0x5DADE2,  // 아스가르드 - 물의 청록
      yomi:          0x8E44AD,  // 요미 - 어둠의 보라
      tartarus:      0xB71C1C,  // 타르타로스 - 심연의 진홍
      avalon:        0x4CAF50,  // 아발론 - 요정의 초록
      helheim:       0x37474F,  // 헬하임 - 죽음의 청흑
      kunlun:        0x00BCD4   // 곤륜 - 선계의 청옥
    },

    // HP 바 색상
    hp: {
      high: 0x22C55E,     // 초록 (>50%)
      medium: 0xF59E0B,   // 노랑 (25-50%)
      low: 0xEF4444       // 빨강 (<25%)
    },

    // 에너지 바 색상
    energy: {
      high: 0x2ECC71,     // 충분 (>60%)
      medium: 0xE67E22,   // 중간 (30-60%)
      low: 0xE74C3C       // 부족 (<30%)
    },

    // 전투 텍스트
    battle: {
      damage: '#EF4444',
      heal: '#22C55E',
      critical: '#FBBF24',
      miss: '#94A3B8',
      buff: '#3B82F6',
      debuff: '#F97316'
    },

    // 재화
    currency: {
      gold: '#F59E0B',
      gem: '#EC4899',
      stamina: '#22C55E'
    }
  },

  // ----------------------------------------
  // Spacing (px)
  // ----------------------------------------
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48
  },

  // ----------------------------------------
  // Font
  // ----------------------------------------
  font: {
    family: {
      primary: 'Noto Sans KR',
      mono: 'Roboto Mono, monospace',
      display: 'Georgia, serif'
    },
    size: {
      tiny: 10,
      caption: 12,
      small: 14,
      body: 16,
      button: 18,
      subheader: 20,
      header: 24,
      title: 32
    },
    weight: {
      regular: '400',
      medium: '500',
      bold: '700'
    }
  },

  // ----------------------------------------
  // Touch / Interaction
  // ----------------------------------------
  touch: {
    minSize: 44,   // 최소 터치 영역 (px)
    gap: 8         // 터치 요소 간 최소 간격 (px)
  },

  // ----------------------------------------
  // Border / Radius
  // ----------------------------------------
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    round: 9999
  },

  // ----------------------------------------
  // Shadows & Effects
  // ----------------------------------------
  effects: {
    borderColor: 0x334155,
    borderAlpha: 1,
    glowAlpha: 0.3,
    overlayAlpha: 0.7,
    panelAlpha: 0.9
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * Phaser hex 색상을 CSS 문자열로 변환
 * @param {number} hex - Phaser hex 색상 (예: 0xE74C3C)
 * @returns {string} CSS 색상 문자열 (예: '#E74C3C')
 */
export function hexToCSS(hex) {
  return '#' + hex.toString(16).padStart(6, '0').toUpperCase();
}

/**
 * 분위기 색상 반환 (Phaser hex)
 * @param {string} mood - 분위기 이름
 * @returns {number} Phaser hex 색상
 */
export function getMoodColor(mood) {
  return DESIGN.colors.mood[mood] || 0x95A5A6;
}

/**
 * 분위기 CSS 색상 반환
 * @param {string} mood - 분위기 이름
 * @returns {string} CSS 색상 문자열
 */
export function getMoodColorCSS(mood) {
  return DESIGN.colors.moodCSS[mood] || '#95A5A6';
}

/**
 * 교단 색상 반환 (Phaser hex)
 * @param {string} cult - 교단 이름
 * @returns {number} Phaser hex 색상
 */
export function getCultColor(cult) {
  return DESIGN.colors.cult[cult] || 0x95A5A6;
}

/**
 * 등급 색상 반환
 * @param {string} rarity - 등급 코드 (N, R, SR, SSR)
 * @returns {{ hex: number, css: string, bg: number, glow: number|null }}
 */
export function getRarityColors(rarity) {
  return DESIGN.colors.rarityNamed[rarity] || DESIGN.colors.rarityNamed.N;
}

/**
 * HP 퍼센트에 따른 바 색상 반환
 * @param {number} percent - HP 비율 (0-1)
 * @returns {number} Phaser hex 색상
 */
export function getHPColor(percent) {
  if (percent > 0.5) return DESIGN.colors.hp.high;
  if (percent > 0.25) return DESIGN.colors.hp.medium;
  return DESIGN.colors.hp.low;
}

export default DESIGN;

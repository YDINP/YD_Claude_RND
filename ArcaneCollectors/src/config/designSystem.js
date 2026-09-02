/**
 * ArcaneCollectors - Design System
 * 통합 디자인 토큰: 색상, 간격, 폰트, 터치 규격
 * 모든 UI 컴포넌트와 씬에서 이 파일의 상수를 참조할 것
 */

// ============================================
// Design Tokens
// ============================================

// ============================================
// Palette Primitives (glass/typo 토큰과 colors가 공유하는 SSOT)
// ============================================
const BG_PRIMARY = 0x0D0F1A;    // 심야 인디고 — 배경이자 글래스 틴트 원색
const BRAND_PRIMARY = 0x06BBFA; // 차가운 신호광
const RIM_LIGHT = 0xFFFFFF;     // 글래스 상단 하이라이트
const RIM_SHADOW = 0x000000;    // 글래스 하단 그림자

export const DESIGN = {
  // ----------------------------------------
  // Colors
  // ----------------------------------------
  colors: {
    // 배경
    bg: {
      primary: BG_PRIMARY,  // 최상위 배경 (NIKKE식 딥 다크)
      secondary: 0x141627,  // 카드/패널 배경
      surface: 0x1E2235,    // 표면/입력 필드
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
      primary: BRAND_PRIMARY, // 시안 - 주요 액션 (Blue Archive 시그니처)
      secondary: 0xFF4D6D,  // 핫핑크 - 보조 액션
      accent: 0xFFD60A      // 브라이트 골드 - 강조/하이라이트
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
      4: 0xFFD60A,  // SSR - 브라이트 골드
      5: 0xFFD60A   // SSR+ - 브라이트 골드 (확장용)
    },

    // 등급 (이름 키)
    rarityNamed: {
      N:   { hex: 0x9CA3AF, css: '#9CA3AF', bg: 0x374151, glow: null },
      R:   { hex: 0x3B82F6, css: '#3B82F6', bg: 0x1E3A5F, glow: 0x3B82F6 },
      SR:  { hex: 0xA855F7, css: '#A855F7', bg: 0x4C1D95, glow: 0xA855F7 },
      SSR: { hex: 0xFFD60A, css: '#FFD60A', bg: 0x78350F, glow: 0xFFD60A }
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

    // 교단 (Phaser hex) — cults.json 기준 단일 진실 원천
    cult: {
      valhalla:      0x4A90D9,  // 발할라 - 바람의 파랑
      takamagahara:  0xFFD700,  // 타카마가하라 - 빛의 황금
      olympus:       0xFF6B35,  // 올림푸스 - 불의 주황
      asgard:        0x5DADE2,  // 아스가르드 - 물의 청록
      yomi:          0x8E44AD,  // 요미 - 어둠의 보라
      tartarus:      0x2C3E50,  // 타르타로스 - 심연의 짙은 남색
      avalon:        0x4ECDC4,  // 아발론 - 요정의 청록민트
      helheim:       0xB0C4DE,  // 헬하임 - 죽음의 연청회
      kunlun:        0x50C878,  // 곤륜 - 선계의 에메랄드
      balance:       0x95A5A6,  // 발란스 - 중립의 회색
      chaos:         0xE74C3C,  // 카오스 - 원초적 빨강
      nature:        0x27AE60   // 나투레 - 자연의 초록
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
      display: 'Orbitron, Georgia, serif'  // 서브컬쳐 SF 헤드라인
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
    minSize: 44,     // 최소 터치 영역 (px) — 레거시 하한
    minTarget: 48,   // REDESIGN_PLAN §2-5 권장 하한 (base px, 렌더 72px)
    gap: 8           // 터치 요소 간 최소 간격 (px)
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
  // Glass Surfaces (REDESIGN_PLAN §2-3)
  // 사전 블러 배경 페어링. 5겹 = 원본 배경 / 블러본 crop / 틴트 / 림 / 아웃라인
  // fallbackTintAlpha 는 블러 백드롭을 못 쓸 때(텍스처 부재 또는
  // effects.useBlurBackdrop === false) 대신 올리는 틴트 알파다.
  // ----------------------------------------
  glass: {
    tintColor: BG_PRIMARY,
    rim: {
      topColor: RIM_LIGHT,
      topAlpha: 0.10,
      bottomColor: RIM_SHADOW,
      bottomAlpha: 0.25,
      thickness: 1          // base px
    },
    panel: {
      tintAlpha: 0.55,
      fallbackTintAlpha: 0.88,
      outline: { width: 2, color: null, alpha: 0.45 },  // color=null → 교단색, 없으면 brand.primary
      useCultOutline: true,
      rim: true,
      radius: 'lg'
    },
    card: {
      tintAlpha: 0.62,
      fallbackTintAlpha: 0.90,
      outline: { width: 1, color: RIM_LIGHT, alpha: 0.12 },
      useCultOutline: false,
      rim: true,
      radius: 'md'
    },
    popup: {
      tintAlpha: 0.78,
      fallbackTintAlpha: 0.92,
      outline: { width: 2, color: BRAND_PRIMARY, alpha: 0.55 },
      useCultOutline: false,
      rim: true,
      radius: 'xl'
    },
    hud: {
      tintAlpha: 0.70,
      fallbackTintAlpha: 0.90,
      outline: null,        // 아웃라인 없음. 하단 1px 그림자만 남긴다
      useCultOutline: false,
      rim: 'bottom',
      radius: 'sm'
    },
    scrim: {
      tintAlpha: 0.72,
      fallbackTintAlpha: 0.72,
      outline: null,
      useCultOutline: false,
      rim: false,
      radius: 'sm'
    }
  },

  // ----------------------------------------
  // Icon Sizes (REDESIGN_PLAN §2-5) — base px. 렌더 px 는 s() 적용
  // 터치 타겟은 아이콘 크기와 분리한다: 최소 touch.minTarget
  // ----------------------------------------
  icon: {
    xs: 16,   // 인라인 수치 앞
    sm: 24,   // 리스트 항목, 재화 표시
    md: 32,   // 스탯, 탭
    lg: 48,   // 메뉴 그리드, 장비 슬롯
    xl: 64    // 교단 엠블럼, 결과 화면
  },

  // ----------------------------------------
  // Typography Scale (REDESIGN_PLAN §2-6)
  // role: 'display'(Orbitron) | 'body'(Noto Sans KR) | 'mono'(Roboto Mono)
  // base 는 720 기준 px. 렌더 px 는 sf() 적용
  // ----------------------------------------
  typo: {
    display: {
      xl: { base: 40, role: 'display', weight: 700 },  // 결과 화면 대문자
      lg: { base: 28, role: 'display', weight: 700 }   // 씬·팝업 타이틀
    },
    title:    { base: 24, role: 'body', weight: 700 },  // 섹션 제목, 영웅 이름
    subtitle: { base: 20, role: 'body', weight: 700 },  // 카드 제목
    body:     { base: 16, role: 'body', weight: 400 },  // 본문
    label:    { base: 14, role: 'body', weight: 400 },  // 라벨, 캡션
    caption:  { base: 12, role: 'body', weight: 400 },  // 부가 정보
    num: {
      lg: { base: 24, role: 'mono', weight: 500 },      // 전투력, 층수
      md: { base: 16, role: 'mono', weight: 500 },      // 재화, 스탯
      sm: { base: 12, role: 'mono', weight: 500 }       // 배지, 확률
    }
  },

  // ----------------------------------------
  // Shadows & Effects
  // ----------------------------------------
  effects: {
    borderColor: 0x1E2235,
    borderAlpha: 1,
    glowAlpha: 0.4,       // 더 선명한 교단/등급 글로우
    overlayAlpha: 0.75,
    panelAlpha: 0.92,
    useBlurBackdrop: true   // false 면 글래스가 블러 백드롭을 건너뛰고 fallbackTintAlpha 사용
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

/**
 * 글래스 표면 스펙 반환 (REDESIGN_PLAN §2-3)
 * @param {string} variant - 'panel' | 'card' | 'popup' | 'hud' | 'scrim'
 * @returns {Object} 해당 변형의 스펙. 알 수 없는 이름은 panel 로 폴백
 */
export function getGlassSpec(variant) {
  return DESIGN.glass[variant] || DESIGN.glass.panel;
}

/**
 * 아이콘 크기 반환 (base px)
 * @param {string} size - 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * @returns {number} base px. 알 수 없는 이름은 md
 */
export function getIconSize(size) {
  const value = DESIGN.icon[size];
  return typeof value === 'number' ? value : DESIGN.icon.md;
}

/**
 * 타이포 토큰 조회 — 점 표기 경로 ('display.lg', 'num.md', 'body')
 * @param {string} token - 토큰 경로
 * @returns {{ base: number, role: string, weight: number }|null} 없으면 null
 */
export function getTypoToken(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  let node = DESIGN.typo;
  for (const part of token.split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = node[part];
  }
  return node && typeof node.base === 'number' ? node : null;
}

export default DESIGN;

/**
 * ArcaneCollectors - Layout Configuration
 * 게임 UI 레이아웃 및 색상 설정
 */

// 기본 레이아웃 설정
export const LAYOUT = {
    WIDTH: 720,
    HEIGHT: 1280
};

// 상단 바 설정
export const TOP_BAR = {
    HEIGHT: 80,
    PADDING: 16
};

// 하단 네비게이션 설정
export const BOTTOM_NAV = {
    HEIGHT: 100,
    ICON_SIZE: 48,
    TABS: ['home', 'adventure', 'inventory', 'gacha', 'more']
};

// 콘텐츠 영역 설정
export const CONTENT = {
    TOP: TOP_BAR.HEIGHT,
    BOTTOM: BOTTOM_NAV.HEIGHT,
    get HEIGHT() {
        return LAYOUT.HEIGHT - TOP_BAR.HEIGHT - BOTTOM_NAV.HEIGHT;
    }
};

// 파티 슬롯 설정
export const PARTY = {
    SLOT_COUNT: 4,
    SLOT_SIZE: 120,
    SLOT_GAP: 20
};

// 전투 UI 설정
export const BATTLE = {
    UNIT_SIZE: 100,
    SKILL_CARD: {
        WIDTH: 140,
        HEIGHT: 180
    }
};

// 성격별 색상 (Phaser hex 형식)
export const PERSONALITY_COLORS = {
    // 기본 성격 유형
    AGGRESSIVE: 0xE74C3C,    // 빨강 - 공격적
    DEFENSIVE: 0x3498DB,     // 파랑 - 방어적
    BALANCED: 0x2ECC71,      // 초록 - 균형
    STRATEGIC: 0x9B59B6,     // 보라 - 전략적
    SUPPORT: 0xF1C40F,       // 노랑 - 서포트

    // 추가 성격 유형
    WILD: 0xE67E22,          // 주황 - 야생적
    CALM: 0x1ABC9C,          // 청록 - 차분함
    MYSTERIOUS: 0x8E44AD,    // 진보라 - 신비로운

    // 기본값
    DEFAULT: 0x95A5A6        // 회색 - 기본
};

// 에너지 UI 설정
export const ENERGY_UI = {
    BAR_WIDTH: 200,
    BAR_HEIGHT: 24,

    // 에너지 레벨별 색상
    COLORS: {
        LOW: 0xE74C3C,       // 빨강 - 부족 (0-30%)
        MEDIUM: 0xE67E22,    // 주황 - 중간 (30-60%)
        HIGH: 0x2ECC71       // 초록 - 충분 (60-100%)
    },

    // 에너지 임계값
    THRESHOLDS: {
        LOW: 0.3,
        MEDIUM: 0.6
    }
};

// 공통 UI 스타일
export const UI_STYLES = {
    // 배경 색상
    BACKGROUND: {
        PRIMARY: 0x1A1A2E,
        SECONDARY: 0x16213E,
        ACCENT: 0x0F3460
    },

    // 텍스트 색상
    TEXT: {
        PRIMARY: '#FFFFFF',
        SECONDARY: '#B0B0B0',
        ACCENT: '#FFD700'
    },

    // 버튼 색상
    BUTTON: {
        PRIMARY: 0x3498DB,
        SECONDARY: 0x2C3E50,
        SUCCESS: 0x27AE60,
        WARNING: 0xF39C12,
        DANGER: 0xE74C3C
    },

    // 폰트 크기
    FONT_SIZE: {
        SMALL: 14,
        MEDIUM: 18,
        LARGE: 24,
        TITLE: 32
    }
};

// Z-인덱스 레이어
export const Z_INDEX = {
    BACKGROUND: 0,
    GAME_OBJECTS: 100,
    UI: 200,
    TOP_BAR: 300,
    BOTTOM_NAV: 300,
    MODAL: 400,
    TOOLTIP: 500
};

export default {
    LAYOUT,
    TOP_BAR,
    BOTTOM_NAV,
    CONTENT,
    PARTY,
    BATTLE,
    PERSONALITY_COLORS,
    ENERGY_UI,
    UI_STYLES,
    Z_INDEX
};

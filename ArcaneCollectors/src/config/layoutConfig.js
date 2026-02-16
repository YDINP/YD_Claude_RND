/**
 * ArcaneCollectors - Layout Configuration
 * 게임 UI 레이아웃 및 색상 설정
 * 모든 픽셀값은 s() 헬퍼로 동적 스케일링
 */
import { GAME_WIDTH, GAME_HEIGHT, s } from './scaleConfig.js';

// 기본 레이아웃 설정
export const LAYOUT = {
    WIDTH: GAME_WIDTH,
    HEIGHT: GAME_HEIGHT
};

// 상단 바 설정
export const TOP_BAR = {
    HEIGHT: s(80),
    PADDING: s(16)
};

// 하단 네비게이션 설정
export const BOTTOM_NAV = {
    HEIGHT: s(120),
    ICON_SIZE: s(48),
    TABS: ['home', 'inventory', 'gacha', 'more']
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
    SLOT_SIZE: s(120),
    SLOT_GAP: s(20)
};

// 전투 UI 설정
export const BATTLE = {
    UNIT_SIZE: s(100),
    SKILL_CARD: {
        WIDTH: s(140),
        HEIGHT: s(180)
    }
};

// 분위기별 색상 (Phaser hex 형식)
export const MOOD_COLORS = {
    // 공격형 분위기
    BRAVE: 0xE74C3C,       // 열혈 - 빨강
    FIERCE: 0xFF5722,      // 격렬 - 주홍
    WILD: 0x27AE60,        // 광폭 - 초록

    // 방어형 분위기
    CALM: 0x3498DB,        // 고요 - 파랑
    STOIC: 0x607D8B,       // 의연 - 청회색
    DEVOTED: 0xE91E63,     // 헌신 - 핑크

    // 전략형 분위기
    CUNNING: 0x9B59B6,     // 냉철 - 보라
    NOBLE: 0xFFD700,       // 고결 - 금색
    MYSTIC: 0xF39C12,      // 신비 - 주황금

    // 기본값
    DEFAULT: 0x95A5A6      // 회색 - 기본
};

// 에너지 UI 설정
export const ENERGY_UI = {
    BAR_WIDTH: s(200),
    BAR_HEIGHT: s(24),

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
        SMALL: s(14),
        MEDIUM: s(18),
        LARGE: s(24),
        TITLE: s(32)
    }
};

// 교단별 색상 (Phaser hex 형식)
export const CULT_COLORS = {
    valhalla: 0x4A90D9,      // 발할라 - 바람의 파랑
    takamagahara: 0xFFD700,  // 타카마가하라 - 빛의 황금
    olympus: 0xFF6B35,       // 올림푸스 - 불의 주황
    asgard: 0x5DADE2,        // 아스가르드 - 물의 청록
    yomi: 0x8E44AD,          // 요미 - 어둠의 보라
    tartarus: 0xB71C1C,      // 타르타로스 - 심연의 진홍
    avalon: 0x4CAF50,        // 아발론 - 요정의 초록
    helheim: 0x37474F,       // 헬하임 - 죽음의 청흑
    kunlun: 0x00BCD4,        // 곤륜 - 선계의 청옥
    DEFAULT: 0x95A5A6        // 기본 - 회색
};

// 등급별 프레임 색상
export const RARITY_COLORS = {
    N: { border: 0x6B7280, bg: 0x374151, glow: null },
    R: { border: 0x3B82F6, bg: 0x1E3A5F, glow: null },
    SR: { border: 0xA855F7, bg: 0x4C1D95, glow: 0xA855F7 },
    SSR: { border: 0xF59E0B, bg: 0x78350F, glow: 0xF59E0B }
};

// Z-인덱스 레이어
export const Z_INDEX = {
    BACKGROUND: 0,
    PANELS: 10,          // 파티/전투력/모험 패널 배경
    PANEL_CONTENT: 15,   // 패널 내부 텍스트/아이콘
    PANEL_BUTTONS: 20,   // 패널 내부 버튼 (소탕/보스전/편성)
    GAME_OBJECTS: 100,
    IDLE_BATTLE: 150,    // IdleBattleView
    CLAIM_BUTTON: 160,   // 보상받기 버튼
    BOTTOM_MENU: 170,    // 하단 메뉴 버튼
    UI: 200,
    TOP_BAR: 300,
    BOTTOM_NAV: 300,
    MODAL: 400,
    TOOLTIP: 500,
    POPUP_BASE: 2000,    // PopupBase 기본 depth
    POPUP_NESTED: 2100   // 중첩 팝업 (HeroInfoPopup 등)
};

export default {
    LAYOUT,
    TOP_BAR,
    BOTTOM_NAV,
    CONTENT,
    PARTY,
    BATTLE,
    MOOD_COLORS,
    CULT_COLORS,
    RARITY_COLORS,
    ENERGY_UI,
    UI_STYLES,
    Z_INDEX
};

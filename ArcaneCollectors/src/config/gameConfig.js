import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { MainMenuScene } from '../scenes/MainMenuScene.js';
import { GachaScene } from '../scenes/GachaScene.js';
import { HeroListScene } from '../scenes/HeroListScene.js';
import { HeroDetailScene } from '../scenes/HeroDetailScene.js';
import { StageSelectScene } from '../scenes/StageSelectScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { BattleResultScene } from '../scenes/BattleResultScene.js';
import { PartyEditScene } from '../scenes/PartyEditScene.js';
import { InventoryScene } from '../scenes/InventoryScene.js';
import { TowerScene } from '../scenes/TowerScene.js';
import { QuestScene } from '../scenes/QuestScene.js';
import { SettingsScene } from '../scenes/SettingsScene.js';
import { LoginScene } from '../scenes/LoginScene.js';
import { TutorialScene } from '../scenes/TutorialScene.js';

// Re-export from scaleConfig (순환 의존성 방지)
export { GAME_WIDTH, GAME_HEIGHT, BASE_WIDTH, SCALE_FACTOR, s, sf } from './scaleConfig.js';
import { GAME_WIDTH, GAME_HEIGHT, s } from './scaleConfig.js';

export const gameConfig = {
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0F172A',
  dom: {
    createContainer: true // LoginScene의 HTML input 요소를 위해 필요
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  input: {
    activePointers: 3,
    touch: { capture: true }
  },
  scene: [
    BootScene,
    TutorialScene,
    LoginScene,
    PreloadScene,
    MainMenuScene,
    GachaScene,
    HeroListScene,
    HeroDetailScene,
    StageSelectScene,
    BattleScene,
    BattleResultScene,
    PartyEditScene,
    InventoryScene,
    TowerScene,
    QuestScene,
    SettingsScene
  ]
};

// ============================================
// Color Definitions
// ============================================
export const COLORS = {
  primary: 0x6366F1,
  secondary: 0xEC4899,
  accent: 0xF59E0B,
  success: 0x10B981,
  danger: 0xEF4444,
  bgDark: 0x0F172A,
  bgLight: 0x1E293B,
  bgPanel: 0x334155,
  backgroundLight: 0x1E293B,  // Alias for bgLight (legacy compatibility)
  background: 0x0F172A,       // Alias for bgDark
  text: 0xF8FAFC,
  textLight: 0xF8FAFC,
  textDark: 0x94A3B8,
  rarity: {
    N: 0x9CA3AF,
    R: 0x3B82F6,
    SR: 0xA855F7,
    SSR: 0xF97316
  },
  // Flat rarity aliases (legacy compatibility)
  rarityN: 0x9CA3AF,
  rarityR: 0x3B82F6,
  raritySR: 0xA855F7,
  raritySSR: 0xF97316,
  mood: {
    // 공격형
    brave: 0xE74C3C,
    fierce: 0xFF5722,
    wild: 0x27AE60,
    // 방어형
    calm: 0x3498DB,
    stoic: 0x607D8B,
    devoted: 0xE91E63,
    // 전략형
    cunning: 0x9B59B6,
    noble: 0xFFD700,
    mystic: 0xF39C12
  },
  cult: {
    prism_stars:     0xFF6EB4,  // 프리즘 스타즈 - 핑크
    neon_crow:       0x00F5FF,  // 네온 크로우 - 시안
    ink_cyclone:     0xFF4500,  // 잉크 사이클론 - 오렌지
    stella_club:     0xE8E8FF,  // 스텔라 클럽 - 블루화이트
    card_cartel:     0x2D2D5B,  // 카드 카르텔 - 다크퍼플
    buddy_garden:    0x3DDC84,  // 버디 가든 - 그린
    glitch_paradise: 0xFF00FF,  // 글리치 파라다이스 - 마젠타
    cafe_encore:     0xC8602A,  // 카페 앙코르 - 브라운
    lunatic_circus:  0x8B2BE2,  // 루나틱 서커스 - 퍼플
    iron_beat:       0xE63946   // 아이언 비트 - 레드
  }
};

// ============================================
// Mood Colors (CSS 형식)
// ============================================
export const MOOD_COLORS = {
  // 공격형
  BRAVE: '#E74C3C',     // 열혈 - 빨강
  FIERCE: '#FF5722',    // 격렬 - 주홍
  WILD: '#27AE60',      // 광폭 - 초록
  // 방어형
  CALM: '#3498DB',      // 고요 - 파랑
  STOIC: '#607D8B',     // 의연 - 청회색
  DEVOTED: '#E91E63',   // 헌신 - 핑크
  // 전략형
  CUNNING: '#9B59B6',   // 냉철 - 보라
  NOBLE: '#FFD700',     // 고결 - 금색
  MYSTIC: '#F39C12'     // 신비 - 주황금
};

// ============================================
// Layout Configuration
// ============================================
export const LAYOUT = {
  topBar: { height: s(100), padding: s(20) },
  bottomNav: { height: s(120), y: s(1160) },
  content: { y: s(120), height: s(1040) },
  character: { mainY: s(450), partyY: s(750), size: s(200) },
  button: { width: s(200), height: s(60), spacing: s(20) }
};

// ============================================
// Game Constants
// ============================================
export const GAME_CONSTANTS = {
  maxPartySize: 4,
  maxPartySaves: 5,
  baseMaxEnergy: 100,
  energyPerLevel: 2,
  energyRecoveryMinutes: 5,
  energyRefillCost: 50,
  energyRefillAmount: 50,
  sweepDailyLimit: 50,
  sweepTicketCost: 1,
  battleSpeedOptions: [1, 2, 3],
  gachaCost: { single: 300, multi: 2700 },
  gachaRates: { SSR: 0.03, SR: 0.15, R: 0.82 },
  pitySystem: { ssrGuarantee: 90, pickupGuarantee: 180 }
};

// ============================================
// Energy System Configuration
// ============================================
export const ENERGY = {
  BASE_MAX: 100,              // 기본 최대 에너지
  PER_LEVEL: 2,               // 레벨당 추가 에너지
  RECOVERY_INTERVAL: 5 * 60 * 1000,  // 5분 (밀리초)
  RECOVERY_AMOUNT: 1,         // 회복량
  REFILL_COST: 50,            // 젬으로 충전 비용
  REFILL_AMOUNT: 50           // 젬 충전 시 회복량
};

// ============================================
// Stage Energy Cost
// ============================================
export const STAGE_ENERGY_COST = {
  NORMAL: 6,    // 일반 스테이지
  ELITE: 12,    // 엘리트 스테이지
  BOSS: 20      // 보스 스테이지
};

// ============================================
// Sweep (Auto-Clear) Configuration
// ============================================
export const SWEEP = {
  DAILY_LIMIT: 50,    // 일일 소탕 제한
  REQUIRED_STARS: 3,  // 소탕 필요 별 개수 (3성 클리어 필요)
  TICKET_COST: 1      // 소탕권 비용
};

// ============================================
// Party Configuration
// ============================================
export const PARTY = {
  MAX_SLOTS: 5,   // 최대 파티 저장 슬롯
  PARTY_SIZE: 4   // 파티당 영웅 수
};

// ============================================
// Rarity Configuration
// ============================================
export const RARITY = {
  N: { name: 'N', color: COLORS.rarity.N, stars: 2 },
  R: { name: 'R', color: COLORS.rarity.R, stars: 3 },
  SR: { name: 'SR', color: COLORS.rarity.SR, stars: 4 },
  SSR: { name: 'SSR', color: COLORS.rarity.SSR, stars: 5 }
};

// ============================================
// Mood Types (분위기 시스템)
// ============================================
export const MOODS = {
  brave: { name: '열혈', color: 0xE74C3C, group: 'attack' },
  fierce: { name: '격렬', color: 0xFF5722, group: 'attack' },
  wild: { name: '광폭', color: 0x27AE60, group: 'attack' },
  calm: { name: '고요', color: 0x3498DB, group: 'defense' },
  stoic: { name: '의연', color: 0x607D8B, group: 'defense' },
  devoted: { name: '헌신', color: 0xE91E63, group: 'defense' },
  cunning: { name: '냉철', color: 0x9B59B6, group: 'strategy' },
  noble: { name: '고결', color: 0xFFD700, group: 'strategy' },
  mystic: { name: '신비', color: 0xF39C12, group: 'strategy' }
};

// ============================================
// Class Types
// ============================================
export const CLASSES = {
  warrior: { name: '전사', icon: 'warrior' },
  mage: { name: '마법사', icon: 'mage' },
  archer: { name: '궁수', icon: 'archer' },
  healer: { name: '힐러', icon: 'healer' }
};

// ============================================
// Cult Types (교단 시스템)
// ============================================
export const CULTS = {
  PRISM_STARS:     'prism_stars',
  NEON_CROW:       'neon_crow',
  INK_CYCLONE:     'ink_cyclone',
  STELLA_CLUB:     'stella_club',
  CARD_CARTEL:     'card_cartel',
  BUDDY_GARDEN:    'buddy_garden',
  GLITCH_PARADISE: 'glitch_paradise',
  CAFE_ENCORE:     'cafe_encore',
  LUNATIC_CIRCUS:  'lunatic_circus',
  IRON_BEAT:       'iron_beat'
};

// ============================================
// Cult Colors and Info
// ============================================
export const CULT_COLORS = {
  prism_stars:     0xFF6EB4,  // 프리즘 스타즈 - 핑크
  neon_crow:       0x00F5FF,  // 네온 크로우 - 시안
  ink_cyclone:     0xFF4500,  // 잉크 사이클론 - 오렌지
  stella_club:     0xE8E8FF,  // 스텔라 클럽 - 블루화이트
  card_cartel:     0x2D2D5B,  // 카드 카르텔 - 다크퍼플
  buddy_garden:    0x3DDC84,  // 버디 가든 - 그린
  glitch_paradise: 0xFF00FF,  // 글리치 파라다이스 - 마젠타
  cafe_encore:     0xC8602A,  // 카페 앙코르 - 브라운
  lunatic_circus:  0x8B2BE2,  // 루나틱 서커스 - 퍼플
  iron_beat:       0xE63946   // 아이언 비트 - 레드
};

export const CULT_INFO = {
  prism_stars:     { name: '프리즘 스타즈',     origin: '허구 — 아이돌/팬덤 서브컬쳐',         description: '무대 위 완벽한 퍼포먼스를 추구하는 아이돌 교단' },
  neon_crow:       { name: '네온 크로우',       origin: '허구 — 사이버펑크/해커 서브컬쳐',     description: '디지털 세계의 그림자에서 활동하는 해커 교단' },
  ink_cyclone:     { name: '잉크 사이클론',     origin: '허구 — 스트리트 그라피티 서브컬쳐',  description: '도시 곳곳에 작품을 남기는 그라피티 아티스트 교단' },
  stella_club:     { name: '스텔라 클럽',       origin: '허구 — 천문 동아리/성좌 서브컬쳐',   description: '별을 관측하고 성좌의 비밀을 연구하는 천문 동아리 교단' },
  card_cartel:     { name: '카드 카르텔',       origin: '허구 — TCG 대회 문화',               description: 'TCG 대회를 지배하는 전략가 교단' },
  buddy_garden:    { name: '버디 가든',         origin: '허구 — 원예/식물 덕후 서브컬쳐',     description: '식물을 키우고 나누는 원예 동호회 교단' },
  glitch_paradise: { name: '글리치 파라다이스', origin: '허구 — 인터넷 밈/카오스 미학',        description: '버그를 예술로 승화시키는 밈 교단' },
  cafe_encore:     { name: '카페 앙코르',       origin: '허구 — 카페/바리스타 문화 (중립)',   description: '모든 교단원이 쉬어가는 중립 카페 교단' },
  lunatic_circus:  { name: '루나틱 서커스',     origin: '허구 — 서커스/마술사 서브컬쳐',      description: '현실과 환상의 경계에서 공연하는 마술사 교단' },
  iron_beat:       { name: '아이언 비트',       origin: '허구 — 록밴드/언더그라운드 음악',    description: '지하 공연장에서 폭발적인 사운드를 쏟아내는 록밴드 교단' }
};

// ============================================
// Role Types (역할)
// ============================================
export const ROLES = {
  attacker: { name: '공격수', icon: 'attacker' },
  tank: { name: '탱커', icon: 'tank' },
  support: { name: '지원', icon: 'support' },
  debuffer: { name: '디버퍼', icon: 'debuffer' }
};

// ============================================
// Equipment Configuration
// ============================================
export const EQUIPMENT_SLOTS = {
  weapon: { name: '무기', icon: 'weapon' },
  armor: { name: '방어구', icon: 'armor' },
  accessory: { name: '악세서리', icon: 'accessory' },
  relic: { name: '유물', icon: 'relic' }
};

export const EQUIPMENT_RARITY = {
  N: { name: 'N', color: 0x9CA3AF, multiplier: 1.0 },
  R: { name: 'R', color: 0x3B82F6, multiplier: 1.2 },
  SR: { name: 'SR', color: 0xA855F7, multiplier: 1.5 },
  SSR: { name: 'SSR', color: 0xF59E0B, multiplier: 2.0 }
};

export default gameConfig;

import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { PreloadScene } from '../scenes/PreloadScene.js';
import { MainMenuScene } from '../scenes/MainMenuScene.js';
import { GachaScene } from '../scenes/GachaScene.js';
import { HeroListScene } from '../scenes/HeroListScene.js';
import { HeroDetailScene } from '../scenes/HeroDetailScene.js';
import { StageSelectScene } from '../scenes/StageSelectScene.js';
import { BattleScene } from '../scenes/BattleScene.js';

// ============================================
// Game Dimensions
// ============================================
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

export const gameConfig = {
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0F172A',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    GachaScene,
    HeroListScene,
    HeroDetailScene,
    StageSelectScene,
    BattleScene
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
  personality: {
    brave: 0xE74C3C,
    cunning: 0x9B59B6,
    calm: 0x3498DB,
    wild: 0x27AE60,
    mystic: 0xF39C12
  },
  cult: {
    valhalla: 0x4A90D9,
    takamagahara: 0xFFD700,
    olympus: 0xFF6B35,
    asgard: 0x5DADE2,
    yomi: 0x8E44AD
  }
};

// ============================================
// Personality Colors (CSS 형식)
// ============================================
export const PERSONALITY_COLORS = {
  BRAVE: '#E74C3C',     // 용감 - 빨강
  CUNNING: '#9B59B6',   // 교활 - 보라
  CALM: '#3498DB',      // 침착 - 파랑
  WILD: '#27AE60',      // 야성 - 초록
  MYSTIC: '#F39C12'     // 신비 - 황금
};

// ============================================
// Layout Configuration
// ============================================
export const LAYOUT = {
  topBar: { height: 100, padding: 20 },
  bottomNav: { height: 120, y: 1160 },
  content: { y: 120, height: 1040 },
  character: { mainY: 450, partyY: 750, size: 200 },
  button: { width: 200, height: 60, spacing: 20 }
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
// Personality Types (성격 시스템 - 속성 대체)
// ============================================
export const PERSONALITIES = {
  brave: { name: '용감', color: 0xE74C3C, strongAgainst: 'cunning', weakAgainst: 'calm' },
  cunning: { name: '교활', color: 0x9B59B6, strongAgainst: 'calm', weakAgainst: 'wild' },
  calm: { name: '침착', color: 0x3498DB, strongAgainst: 'wild', weakAgainst: 'brave' },
  wild: { name: '야성', color: 0x27AE60, strongAgainst: 'brave', weakAgainst: 'cunning' },
  mystic: { name: '신비', color: 0xF39C12, specialEffect: '모든 성격에 +10% 데미지' }
};

// ============================================
// Element Types (Legacy - 호환성 유지용)
// Note: v4에서 Personality 시스템으로 대체되었으나, 기존 데이터 호환성 유지
// ============================================
export const ELEMENTS = {
  fire: { name: '화염', color: 0xE74C3C },
  water: { name: '물', color: 0x3498DB },
  wind: { name: '바람', color: 0x27AE60 },
  light: { name: '빛', color: 0xF39C12 },
  dark: { name: '어둠', color: 0x9B59B6 }
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
  VALHALLA: 'valhalla',
  TAKAMAGAHARA: 'takamagahara',
  OLYMPUS: 'olympus',
  ASGARD: 'asgard',
  YOMI: 'yomi'
};

// ============================================
// Cult Colors and Info
// ============================================
export const CULT_COLORS = {
  valhalla: 0x4A90D9,      // 발할라 - 바람의 파랑
  takamagahara: 0xFFD700,  // 타카마가하라 - 빛의 황금
  olympus: 0xFF6B35,       // 올림푸스 - 불의 주황
  asgard: 0x5DADE2,        // 아스가르드 - 물의 청록
  yomi: 0x8E44AD          // 요미 - 어둠의 보라
};

export const CULT_INFO = {
  valhalla: { name: '발할라', origin: '북유럽 신화', description: '용맹한 전사들의 낙원' },
  takamagahara: { name: '타카마가하라', origin: '일본 신화', description: '아마테라스의 천상계' },
  olympus: { name: '올림푸스', origin: '그리스 신화', description: '제우스와 12신의 성지' },
  asgard: { name: '아스가르드', origin: '북유럽 신화', description: '신들의 세계' },
  yomi: { name: '요미', origin: '일본 신화', description: '이자나미의 저승' }
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

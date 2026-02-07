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
    valhalla: 0x4A90D9,
    takamagahara: 0xFFD700,
    olympus: 0xFF6B35,
    asgard: 0x5DADE2,
    yomi: 0x8E44AD,
    tartarus: 0xB71C1C,
    avalon: 0x4CAF50,
    helheim: 0x37474F,
    kunlun: 0x00BCD4
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
  VALHALLA: 'valhalla',
  TAKAMAGAHARA: 'takamagahara',
  OLYMPUS: 'olympus',
  ASGARD: 'asgard',
  YOMI: 'yomi',
  TARTARUS: 'tartarus',
  AVALON: 'avalon',
  HELHEIM: 'helheim',
  KUNLUN: 'kunlun'
};

// ============================================
// Cult Colors and Info
// ============================================
export const CULT_COLORS = {
  valhalla: 0x4A90D9,      // 발할라 - 바람의 파랑
  takamagahara: 0xFFD700,  // 타카마가하라 - 빛의 황금
  olympus: 0xFF6B35,       // 올림푸스 - 불의 주황
  asgard: 0x5DADE2,        // 아스가르드 - 물의 청록
  yomi: 0x8E44AD,          // 요미 - 어둠의 보라
  tartarus: 0xB71C1C,      // 타르타로스 - 심연의 진홍
  avalon: 0x4CAF50,        // 아발론 - 요정의 초록
  helheim: 0x37474F,       // 헬하임 - 죽음의 청흑
  kunlun: 0x00BCD4         // 곤륜 - 선계의 청옥
};

export const CULT_INFO = {
  valhalla: { name: '발할라', origin: '북유럽 신화', description: '용맹한 전사들의 낙원' },
  takamagahara: { name: '타카마가하라', origin: '일본 신화', description: '아마테라스의 천상계' },
  olympus: { name: '올림푸스', origin: '그리스 신화', description: '제우스와 12신의 성지' },
  asgard: { name: '아스가르드', origin: '북유럽 신화', description: '신들의 세계' },
  yomi: { name: '요미', origin: '일본 신화', description: '이자나미의 저승' },
  tartarus: { name: '타르타로스', origin: '그리스 신화', description: '심연 속 형벌의 감옥' },
  avalon: { name: '아발론', origin: '켈트 신화', description: '치유의 사과가 열리는 섬' },
  helheim: { name: '헬하임', origin: '북유럽 신화', description: '헬이 다스리는 명계' },
  kunlun: { name: '곤륜', origin: '중국 신화', description: '서왕모의 불사 선계' }
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

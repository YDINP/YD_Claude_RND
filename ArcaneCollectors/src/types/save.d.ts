/**
 * Save Data Type Definitions
 * SaveManager.js 기반 저장 데이터 타입 정의
 */

import type { OwnedHero } from './character';

/** 플레이어 정보 */
export interface PlayerData {
  name: string;
  level: number;
  exp: number;
}

/** 리소스 데이터 */
export interface ResourceData {
  gold: number;
  gems: number;
  summonTickets: number;
  skillBooks: number;
  characterShards: Record<string, number>;
}

/** 진행 데이터 */
export interface ProgressData {
  currentChapter: string;
  clearedStages: Record<string, number>;
  towerFloor: number;
  totalBattles: number;
}

/** 가챠 데이터 */
export interface GachaData {
  pityCounter: number;
  totalPulls: number;
}

/** 퀘스트 데이터 */
export interface QuestData {
  daily: Record<string, boolean>;
  dailyProgress: Record<string, number>;
  lastReset: string | null;
}

/** 설정 데이터 */
export interface SettingsData {
  bgmVolume: number;
  sfxVolume: number;
  autoSkip: boolean;
  battleSpeed: number;
}

/** 통계 데이터 */
export interface StatisticsData {
  totalGoldEarned: number;
  totalGemsSpent: number;
  charactersCollected: number;
  highestDamage: number;
}

/** 인벤토리 아이템 인스턴스 */
export interface InventoryItem {
  id: string;
  count: number;
}

/** 전체 세이브 데이터 구조 */
export interface SaveData {
  version: number;
  player: PlayerData;
  resources: ResourceData;
  characters: OwnedHero[];
  parties: string[][];
  inventory: InventoryItem[];
  progress: ProgressData;
  gacha: GachaData;
  quests: QuestData;
  settings: SettingsData;
  statistics: StatisticsData;
  lastOnline: number;
  createdAt: number;
}

/**
 * Gacha Type Definitions
 * GachaSystem.js 기반 가챠 관련 타입 정의
 */

import type { RarityKey } from './character';

/** 배너 타입 */
export type BannerType = 'standard' | 'pickup';

/** 등급별 소환 확률 */
export interface GachaRates {
  SSR: number;
  SR: number;
  R: number;
  N: number;
}

/** 배너 데이터 (banners.json 엔트리) */
export interface Banner {
  id: string;
  name: string;
  type: BannerType;
  description: string;
  pickupCharacters: string[];
  pickupRate: number;
  rates: GachaRates;
  isActive: boolean;
  isPermanent: boolean;
  startDate?: string;
  endDate?: string;
}

/** banners.json 루트 구조 */
export interface BannersData {
  banners: Banner[];
}

/** 소환 결과 */
export interface PullResult {
  characterId: string;
  rarity: RarityKey;
  isNew: boolean;
  isPickup?: boolean;
  isPityGuarantee?: boolean;
}

/** 천장(Pity) 설정 */
export interface PityConfig {
  softPity: number;
  hardPity: number;
  softPityBonus: number;
  pickupPity: number;
}

/** 천장 정보 */
export interface PityInfo {
  currentRate: string;
  rawRate: number;
  pullCount: number;
  remainingToSoftPity: number;
  remainingToHardPity: number;
  inSoftPity: boolean;
  isGuaranteed: boolean;
}

/** 등급별 캐릭터 풀 */
export type CharacterPool = Record<RarityKey, string[]>;

/** 배너별 천장 카운터 */
export type BannerPityCounters = Record<string, number>;

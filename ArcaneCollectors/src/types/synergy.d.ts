/**
 * Synergy Type Definitions
 * synergies.json 기반 시너지 관련 타입 정의
 */

import type { MoodType } from './character';

/** 시너지 효과 (키: 스탯/특수효과, 값: 배율) */
export interface SynergyEffect {
  ATK?: number;
  DEF?: number;
  HP?: number;
  SPD?: number;
  CRIT?: number;
  CRIT_DMG?: number;
  COOLDOWN?: number;
  EVASION?: number;
  HEAL?: number;
  SPECIAL_PROC?: number;
  ALL_STATS?: number;
  SKILL_DMG?: number;
  REVIVE_CHANCE?: number;
  DEBUFF?: number;
  ULTIMATE_CHARGE?: number;
  LIGHT_IMMUNITY?: boolean;
  DARK_IMMUNITY?: boolean;
  FEMALE_ATK?: number;
  LIGHTNING_DMG?: number;
  INSTANT_KILL_CHANCE?: number;
}

/** 교단 시너지 (인원 수 기반 버프) */
export type CultSynergyTiers = Record<string, SynergyEffect>;

/** 분위기 시너지 조건 */
export interface MoodSynergy {
  id: string;
  name: string;
  required: string[];
  effect: SynergyEffect;
  /** 최소 필요 인원 */
  minCount?: number;
  /** 전부 다른 분위기여야 하는지 */
  allDifferent?: boolean;
}

/** 특수 시너지 (특정 캐릭터 조합) */
export interface SpecialSynergy {
  id: string;
  name: string;
  /** 필요한 캐릭터 ID 목록 */
  characters?: string[];
  /** 캐릭터 패턴 매칭 */
  characterPattern?: string;
  /** 최소 필요 인원 */
  minCount?: number;
  effect: SynergyEffect;
}

/** synergies.json 루트 구조 */
export interface SynergiesData {
  cultSynergies: CultSynergyTiers;
  moodSynergies: MoodSynergy[];
  specialSynergies: SpecialSynergy[];
}

/** 발동된 시너지 정보 */
export interface ActiveSynergy {
  id: string;
  name: string;
  type: 'cult' | 'mood' | 'special';
  effect: SynergyEffect;
}

/**
 * Equipment Type Definitions
 * equipment.json 기반 장비 관련 타입 정의
 */

import type { CultType } from './character';

/** 장비 슬롯 타입 */
export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';

/** 장비 등급 */
export type EquipmentRarity = 'N' | 'R' | 'SR' | 'SSR';

/** 장비 스탯 (부분적 - 장비마다 다른 스탯 조합) */
export interface EquipmentStats {
  atk?: number;
  def?: number;
  hp?: number;
  spd?: number;
  crit_rate?: number;
  crit_dmg?: number;
}

/** 장비 아이템 */
export interface Equipment {
  id: string;
  name: string;
  nameKr: string;
  rarity: EquipmentRarity;
  type: EquipmentSlot;
  cultAffinity: CultType | 'none';
  stats: EquipmentStats;
  description: string;
  lore: string;
}

/** equipment.json 내부의 슬롯별 장비 맵 */
export type EquipmentSlotMap = Record<string, Equipment>;

/** equipment.json 루트 구조 */
export interface EquipmentData {
  equipment: {
    weapons: EquipmentSlotMap;
    armors: EquipmentSlotMap;
    accessories: EquipmentSlotMap;
  };
}

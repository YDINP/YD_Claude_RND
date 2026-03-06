/**
 * Stage Type Definitions
 * stages.json 기반 스테이지 관련 타입 정의
 */

/** 스테이지 내 적 배치 */
export interface StageEnemy {
  id: string;
  level: number;
}

/** 스테이지 보상 아이템 */
export interface StageRewardItem {
  id: string;
  chance: number;
}

/** 스테이지 보상 */
export interface StageRewards {
  gold: number;
  exp: number;
  items?: StageRewardItem[];
}

/** 스테이지 드롭 */
export interface StageDrop {
  id: string;
  chance: number;
}

/** 첫 클리어 보상 */
export interface FirstClearRewards {
  gems?: number;
  items?: StageRewardItem[];
}

/** 스테이지 데이터 */
export interface Stage {
  id: string;
  name: string;
  nameEn: string;
  recommendedPower: number;
  energyCost: number;
  story_intro: string;
  story_clear: string;
  enemies: StageEnemy[];
  rewards: StageRewards;
  drops?: StageDrop[];
  firstClearRewards?: FirstClearRewards;
}

/** 챕터 데이터 */
export interface Chapter {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  lore: string;
  stages: Stage[];
}

/** stages.json 루트 구조 */
export interface StagesData {
  chapters: Chapter[];
}

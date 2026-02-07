/**
 * Event Type Definitions
 * EventBus.js 기반 이벤트 타입 정의
 */

import type { PullResult, PityInfo } from './gacha';

// ==================== 이벤트 이름 상수 ====================

/** 전투 이벤트 */
export type BattleEventName =
  | 'battle_start'
  | 'battle_end'
  | 'turn_start'
  | 'turn_end'
  | 'skill_used'
  | 'unit_damaged'
  | 'unit_healed'
  | 'unit_died';

/** UI 이벤트 */
export type UIEventName =
  | 'screen_changed'
  | 'modal_opened'
  | 'modal_closed'
  | 'toast_show'
  | 'loading_start'
  | 'loading_end';

/** 리소스 이벤트 */
export type ResourceEventName = 'resource_changed';

/** 캐릭터 이벤트 */
export type CharacterEventName =
  | 'character_added'
  | 'level_up'
  | 'evolve'
  | 'skill_enhanced'
  | 'equipment_changed';

/** 진행 이벤트 */
export type ProgressEventName =
  | 'stage_cleared'
  | 'chapter_completed'
  | 'achievement_unlocked';

/** 퀘스트 이벤트 */
export type QuestEventName =
  | 'quest_progress'
  | 'quest_complete'
  | 'quest_reward_claimed'
  | 'daily_reset';

/** 가챠 이벤트 */
export type GachaEventName =
  | 'gacha_start'
  | 'gacha_complete'
  | 'pity_reached'
  | 'ssr_obtained';

/** 시스템 이벤트 */
export type SystemEventName =
  | 'game_initialized'
  | 'game_saved'
  | 'game_loaded'
  | 'settings_changed'
  | 'offline_rewards_claimed'
  | 'error_occurred';

/** 모든 게임 이벤트 */
export type GameEventName =
  | BattleEventName
  | UIEventName
  | ResourceEventName
  | CharacterEventName
  | ProgressEventName
  | QuestEventName
  | GachaEventName
  | SystemEventName;

// ==================== 이벤트 데이터 페이로드 ====================

/** RESOURCE_CHANGED 이벤트 데이터 */
export interface ResourceChangedPayload {
  type: string;
  amount: number;
  newTotal: number;
}

/** CHARACTER_ADDED 이벤트 데이터 */
export interface CharacterAddedPayload {
  characterId: string;
  rarity: string;
  isNew: boolean;
}

/** LEVEL_UP 이벤트 데이터 */
export interface LevelUpPayload {
  characterId: string;
  newLevel: number;
  levelsGained: number;
}

/** BATTLE_END 이벤트 데이터 */
export interface BattleEndPayload {
  outcome: 'victory' | 'defeat' | 'timeout';
  stars: number;
  rewards: Record<string, any>;
}

/** GACHA_COMPLETE 이벤트 데이터 */
export interface GachaCompletePayload {
  results: PullResult[];
  pityInfo: PityInfo;
}

/** TOAST_SHOW 이벤트 데이터 */
export interface ToastPayload {
  message: string;
  type: 'success' | 'error' | 'info';
  duration: number;
}

/** ERROR_OCCURRED 이벤트 데이터 */
export interface ErrorPayload {
  source: string;
  message: string;
  timestamp: number;
}

/** QUEST_COMPLETE 이벤트 데이터 */
export interface QuestCompletePayload {
  questId: string;
  questName: string;
}

/** 로딩 이벤트 데이터 */
export interface LoadingPayload {
  context: string;
}

/** EventBus 리스너 콜백 */
export type EventCallback<T = any> = (data: T) => void;

/** EventBus 인터페이스 */
export interface IEventBus {
  on(event: string, callback: EventCallback): () => void;
  once(event: string, callback: EventCallback): void;
  off(event: string, callback: EventCallback): void;
  offAll(event: string): void;
  emit(event: string, data?: any): void;
  clear(): void;
  listenerCount(event: string): number;
  getEventNames(): string[];
}

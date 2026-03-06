/**
 * Battle Type Definitions
 * BattleSystem.js 기반 전투 관련 타입 정의
 */

import type { CharacterStats, MoodType, ClassType, CultType, RarityNumber, CharacterSkill } from './character';

/** 전투 상태 */
export type BattleStateType =
  | 'idle'
  | 'initializing'
  | 'turn_start'
  | 'processing_action'
  | 'turn_end'
  | 'victory'
  | 'defeat'
  | 'timeout';

/** 전투 유닛 (BattleUnit 클래스 구조) */
export interface Battler {
  id: string;
  instanceId: string;
  data: BattlerSourceData;
  name: string;
  level: number;
  isEnemy: boolean;
  mood: MoodType;
  rarity: RarityNumber | string;

  // 전투 스탯
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
  critDmg: number;

  // 전투 상태
  skillGauge: number;
  maxSkillGauge: number;
  isAlive: boolean;
  buffs: StatusEffect[];
  debuffs: StatusEffect[];
  skills: CharacterSkill[];
}

/** BattleUnit에 전달되는 원본 데이터 */
export interface BattlerSourceData {
  id: string;
  name?: string;
  mood?: MoodType;
  class?: ClassType;
  cult?: CultType;
  rarity?: RarityNumber | string;
  stats?: CharacterStats;
  growthStats?: CharacterStats;
  skills?: CharacterSkill[];
  critRate?: number;
  critDmg?: number;
}

/** 상태 효과 (버프/디버프) */
export interface StatusEffect {
  type: string;
  value: number;
  duration: number;
  chance?: number;
}

/** 데미지 계산 결과 */
export interface DamageResult {
  finalDamage: number;
  isCrit: boolean;
  moodMultiplier?: number;
}

/** 피해 적용 결과 */
export interface DamageApplyResult {
  actualDamage: number;
  isDead: boolean;
}

/** 회복 적용 결과 */
export interface HealResult {
  actualHeal: number;
}

/** 턴 액션 결과 */
export interface TurnActionResult {
  target: string;
  type: 'damage' | 'heal';
  amount: number;
  isCrit?: boolean;
  isDead?: boolean;
  isSkill?: boolean;
  isAoe?: boolean;
}

/** 스킬 옵션 (calculateDamage에 전달) */
export interface SkillOptions {
  multiplier: number;
}

/** 전투 결과 */
export interface BattleResult {
  outcome: 'victory' | 'defeat' | 'timeout';
  stars?: number;
  turns: number;
  rewards?: BattleRewards;
}

/** 전투 보상 */
export interface BattleRewards {
  gold?: number;
  exp?: number;
  items?: ItemDrop[];
}

/** 아이템 드롭 */
export interface ItemDrop {
  id: string;
  count?: number;
}

/** 시너지 버프 */
export interface SynergyBuffs {
  atk: number;
  def: number;
  spd: number;
}

/** 스킬 전략 인터페이스 */
export interface SkillStrategy {
  execute(attacker: Battler, targets: Battler[], battleSystem: any): TurnActionResult[];
}

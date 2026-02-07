/**
 * ArcaneCollectors Type Definitions - Central Export
 * 모든 게임 타입 정의의 통합 re-export
 */

// Character types
export type {
  MoodType,
  MoodGroup,
  CultType,
  ClassType,
  RarityNumber,
  RarityKey,
  CharacterStats,
  CharacterSkill,
  CharacterDesign,
  VoiceLines,
  Character,
  OwnedHero,
  NormalizedHero,
  CharactersData,
  MoodAdvantage,
  MoodAdvantages,
} from './character';

// Battle types
export type {
  BattleStateType,
  Battler,
  BattlerSourceData,
  StatusEffect,
  DamageResult,
  DamageApplyResult,
  HealResult,
  TurnActionResult,
  SkillOptions,
  BattleResult,
  BattleRewards,
  ItemDrop,
  SynergyBuffs,
  SkillStrategy,
} from './battle';

// Gacha types
export type {
  BannerType,
  GachaRates,
  Banner,
  BannersData,
  PullResult,
  PityConfig,
  PityInfo,
  CharacterPool,
  BannerPityCounters,
} from './gacha';

// Equipment types
export type {
  EquipmentSlot,
  EquipmentRarity,
  EquipmentStats,
  Equipment,
  EquipmentSlotMap,
  EquipmentData,
} from './equipment';

// Synergy types
export type {
  SynergyEffect,
  CultSynergyTiers,
  MoodSynergy,
  SpecialSynergy,
  SynergiesData,
  ActiveSynergy,
} from './synergy';

// Stage types
export type {
  StageEnemy,
  StageRewardItem,
  StageRewards,
  StageDrop,
  FirstClearRewards,
  Stage,
  Chapter,
  StagesData,
} from './stage';

// Save types
export type {
  PlayerData,
  ResourceData,
  ProgressData,
  GachaData,
  QuestData,
  SettingsData,
  StatisticsData,
  InventoryItem,
  SaveData,
} from './save';

// Event types
export type {
  BattleEventName,
  UIEventName,
  ResourceEventName,
  CharacterEventName,
  ProgressEventName,
  QuestEventName,
  GachaEventName,
  SystemEventName,
  GameEventName,
  ResourceChangedPayload,
  CharacterAddedPayload,
  LevelUpPayload,
  BattleEndPayload,
  GachaCompletePayload,
  ToastPayload,
  ErrorPayload,
  QuestCompletePayload,
  LoadingPayload,
  EventCallback,
  IEventBus,
} from './events';

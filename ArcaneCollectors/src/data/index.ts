/**
 * Game Data Access Module
 * 게임 데이터 접근 모듈
 */

import type {
  Character,
  CharactersData,
  CharacterStats,
  OwnedHero,
  NormalizedHero,
  MoodType,
  MoodAdvantages,
  RarityNumber,
  RarityKey,
  CharacterSkill,
} from '../types';

import charactersData from './characters.json';
import skillsData from './skills.json';
import stagesData from './stages.json';
import enemiesData from './enemies.json';
import itemsData from './items.json';
import questsData from './quests.json';
import { getRarityKey, getRarityStars } from '../utils/rarityUtils.js';
import { HeroFactory } from '../systems/HeroFactory.js';

// Type assertions for imported JSON
const characters = charactersData as CharactersData;
const skills = skillsData as { skills: any[] };
const stages = stagesData as { chapters: any[] };
const enemies = enemiesData as { enemies: any[] };
const items = itemsData as { items: any[] };
const quests = questsData as { dailyQuests: any[]; weeklyQuests: any[]; achievementQuests: any[] };

// ==================== Hero Data Normalization ====================
// Migrated to HeroFactory (PAT-4), re-exported for backward compatibility

/**
 * SaveManager/Registry의 불완전한 영웅 데이터를 characters.json으로 보강합니다.
 * 모든 씬에서 동일한 형태의 완전한 영웅 객체를 보장합니다.
 *
 * @deprecated Use HeroFactory.normalize() instead
 * @param hero - 불완전할 수 있는 영웅 데이터 (최소 id 또는 characterId 필요)
 * @returns 정규화된 영웅 객체 (null = 알 수 없는 캐릭터)
 */
export function normalizeHero(hero: Partial<OwnedHero> | null | undefined): NormalizedHero | null {
  return HeroFactory.normalize(hero);
}

/**
 * 영웅 배열 전체를 정규화합니다. null 결과는 자동 필터링.
 * @deprecated Use HeroFactory.normalizeAll() instead
 * @param heroes - 불완전한 영웅 배열
 * @returns 정규화된 영웅 배열
 */
export function normalizeHeroes(heroes: Array<Partial<OwnedHero>> | null | undefined): NormalizedHero[] {
  return HeroFactory.normalizeAll(heroes);
}

// ==================== Character Functions ====================

/**
 * ID로 캐릭터를 가져옵니다
 * @param id - 캐릭터 ID
 * @returns 캐릭터 데이터
 */
export function getCharacter(id: string): Character | undefined {
  return characters.characters.find(char => char.id === id);
}

/**
 * 모든 캐릭터를 가져옵니다
 * @returns 모든 캐릭터 배열
 */
export function getAllCharacters(): Character[] {
  return characters.characters;
}

/**
 * 등급별 캐릭터를 가져옵니다
 * @param rarity - 등급 (SSR, SR, R)
 * @returns 해당 등급의 캐릭터 배열
 */
export function getCharactersByRarity(rarity: RarityNumber): Character[] {
  return characters.characters.filter(char => char.rarity === rarity);
}

/**
 * 분위기별 캐릭터를 가져옵니다
 * @param mood - 분위기 (brave, cunning, calm, wild, mystic)
 * @returns 해당 분위기의 캐릭터 배열
 */
export function getCharactersByMood(mood: MoodType): Character[] {
  return characters.characters.filter(char => char.mood === mood);
}

/**
 * 클래스별 캐릭터를 가져옵니다
 * @param charClass - 클래스 (warrior, mage, archer, healer)
 * @returns 해당 클래스의 캐릭터 배열
 */
export function getCharactersByClass(charClass: string): Character[] {
  return characters.characters.filter(char => char.class === charClass);
}

/**
 * 캐릭터의 전투력을 계산합니다
 * NOTE: This matches ProgressionSystem.calculatePower() formula
 * Formula: HP/10 + ATK + DEF + SPD + skillBonus (with star multiplier)
 * @param character - 캐릭터 데이터
 * @param level - 캐릭터 레벨 (기본값: 1)
 * @returns 전투력
 */
export function calculatePower(character: Character | OwnedHero, level: number = 1): number {
  const base = character.stats;
  if (!base) return 0;
  const growthStats = character.growthStats || { hp: 0, atk: 0, def: 0, spd: 0 };
  const levelMultiplier = level - 1;

  // Calculate level-scaled stats
  const levelStats = {
    hp: base.hp + (growthStats.hp * levelMultiplier),
    atk: base.atk + (growthStats.atk * levelMultiplier),
    def: base.def + (growthStats.def * levelMultiplier),
    spd: base.spd + (growthStats.spd * levelMultiplier)
  };

  // Apply star bonus (5% per star)
  const stars = (character as OwnedHero).stars || getRarityStars(character.rarity) || 1;
  const starBonusPercent = (stars - 1) * 5;

  const finalStats = {
    hp: Math.floor(levelStats.hp * (1 + starBonusPercent / 100)),
    atk: Math.floor(levelStats.atk * (1 + starBonusPercent / 100)),
    def: Math.floor(levelStats.def * (1 + starBonusPercent / 100)),
    spd: Math.floor(levelStats.spd * (1 + starBonusPercent / 100))
  };

  // Skill level bonus (10 per skill level)
  const skillLevels = (character as OwnedHero).skillLevels || [1, 1];
  const skillBonus = skillLevels.reduce((sum, lv) => sum + lv, 0) * 10;

  // Canonical formula: HP/10 + ATK + DEF + SPD + skillBonus
  return Math.floor(
    finalStats.hp / 10 +
    finalStats.atk +
    finalStats.def +
    finalStats.spd +
    skillBonus
  );
}

/**
 * 특정 레벨에서의 캐릭터 스탯을 계산합니다
 * @param character - 캐릭터 데이터
 * @param level - 캐릭터 레벨
 * @returns 계산된 스탯
 */
export function calculateStats(character: Character | OwnedHero, level: number): CharacterStats {
  const base = character.stats;
  if (!base) return { hp: 100, atk: 10, def: 10, spd: 10 };
  const growthStats = character.growthStats || { hp: 0, atk: 0, def: 0, spd: 0 };
  const levelMultiplier = level - 1;

  return {
    hp: base.hp + (growthStats.hp * levelMultiplier),
    atk: base.atk + (growthStats.atk * levelMultiplier),
    def: base.def + (growthStats.def * levelMultiplier),
    spd: base.spd + (growthStats.spd * levelMultiplier)
  };
}

// ==================== Skill Functions ====================

/**
 * ID로 스킬을 가져옵니다
 * @param id - 스킬 ID
 * @returns 스킬 데이터
 */
export function getSkill(id: string): any | undefined {
  return skills.skills.find(skill => skill.id === id);
}

/**
 * 모든 스킬을 가져옵니다
 * @returns 모든 스킬 배열
 */
export function getAllSkills(): any[] {
  return skills.skills;
}

/**
 * 캐릭터의 스킬 정보를 가져옵니다
 * @param character - 캐릭터 데이터
 * @returns 스킬 데이터 배열
 */
export function getCharacterSkills(character: Character | OwnedHero): any[] {
  return (character.skills || []).map(skillId => {
    if (typeof skillId === 'string') {
      return getSkill(skillId);
    }
    return skillId;
  }).filter(Boolean);
}

/**
 * 타입별 스킬을 가져옵니다
 * @param type - 스킬 타입 (basic, active, ultimate)
 * @returns 해당 타입의 스킬 배열
 */
export function getSkillsByType(type: string): any[] {
  return skills.skills.filter(skill => skill.type === type);
}

// ==================== Stage Functions ====================

/**
 * 특정 스테이지를 가져옵니다
 * @param chapterId - 챕터 ID
 * @param stageId - 스테이지 ID
 * @returns 스테이지 데이터
 */
export function getStage(chapterId: string, stageId: string): any | undefined {
  const chapter = stages.chapters.find(ch => ch.id === chapterId);
  if (!chapter) return undefined;
  return chapter.stages.find(stage => stage.id === stageId);
}

/**
 * 챕터를 가져옵니다
 * @param chapterId - 챕터 ID
 * @returns 챕터 데이터
 */
export function getChapter(chapterId: string): any | undefined {
  return stages.chapters.find(ch => ch.id === chapterId);
}

/**
 * 모든 챕터를 가져옵니다
 * @returns 모든 챕터 배열
 */
export function getAllChapters(): any[] {
  return stages.chapters;
}

/**
 * 챕터의 모든 스테이지를 가져옵니다
 * @param chapterId - 챕터 ID
 * @returns 스테이지 배열
 */
export function getChapterStages(chapterId: string): any[] {
  const chapter = getChapter(chapterId);
  return chapter ? chapter.stages : [];
}

// ==================== Enemy Functions ====================

/**
 * ID로 적을 가져옵니다
 * @param id - 적 ID
 * @returns 적 데이터
 */
export function getEnemy(id: string): any | undefined {
  return enemies.enemies.find(enemy => enemy.id === id);
}

/**
 * 모든 적을 가져옵니다
 * @returns 모든 적 배열
 */
export function getAllEnemies(): any[] {
  return enemies.enemies;
}

/**
 * 타입별 적을 가져옵니다
 * @param type - 적 타입 (normal, elite, boss)
 * @returns 해당 타입의 적 배열
 */
export function getEnemiesByType(type: string): any[] {
  return enemies.enemies.filter(enemy => enemy.type === type);
}

/**
 * 특정 레벨에서의 적 스탯을 계산합니다
 * @param enemy - 적 데이터
 * @param level - 적 레벨
 * @returns 계산된 스탯
 */
export function calculateEnemyStats(enemy: any, level: number): CharacterStats {
  const stats = enemy.stats;
  const growthStats = enemy.growthStats;
  const levelMultiplier = level - 1;

  return {
    hp: stats.hp + (growthStats.hp * levelMultiplier),
    atk: stats.atk + (growthStats.atk * levelMultiplier),
    def: stats.def + (growthStats.def * levelMultiplier),
    spd: stats.spd + (growthStats.spd * levelMultiplier)
  };
}

// ==================== Item Functions ====================

/**
 * ID로 아이템을 가져옵니다
 * @param id - 아이템 ID
 * @returns 아이템 데이터
 */
export function getItem(id: string): any | undefined {
  return items.items.find(item => item.id === id);
}

/**
 * 모든 아이템을 가져옵니다
 * @returns 모든 아이템 배열
 */
export function getAllItems(): any[] {
  return items.items;
}

/**
 * 타입별 아이템을 가져옵니다
 * @param type - 아이템 타입 (consumable, currency, material, equipment)
 * @returns 해당 타입의 아이템 배열
 */
export function getItemsByType(type: string): any[] {
  return items.items.filter(item => item.type === type);
}

/**
 * 등급별 아이템을 가져옵니다
 * @param rarity - 등급 (common, uncommon, rare, epic)
 * @returns 해당 등급의 아이템 배열
 */
export function getItemsByRarity(rarity: string): any[] {
  return items.items.filter(item => item.rarity === rarity);
}

// ==================== Quest Functions ====================

/**
 * 일일 퀘스트를 가져옵니다
 * @returns 일일 퀘스트 배열
 */
export function getDailyQuests(): any[] {
  return quests.dailyQuests;
}

/**
 * 주간 퀘스트를 가져옵니다
 * @returns 주간 퀘스트 배열
 */
export function getWeeklyQuests(): any[] {
  return quests.weeklyQuests;
}

/**
 * 업적 퀘스트를 가져옵니다
 * @returns 업적 퀘스트 배열
 */
export function getAchievementQuests(): any[] {
  return quests.achievementQuests;
}

/**
 * ID로 퀘스트를 가져옵니다
 * @param id - 퀘스트 ID
 * @returns 퀘스트 데이터
 */
export function getQuest(id: string): any | undefined {
  const allQuests = [
    ...quests.dailyQuests,
    ...quests.weeklyQuests,
    ...quests.achievementQuests
  ];
  return allQuests.find(quest => quest.id === id);
}

// ==================== Utility Functions ====================

/**
 * 등급별 소환 확률을 반환합니다
 * @returns 등급별 확률
 */
export function getSummonRates(): { SSR: number; SR: number; R: number } {
  return {
    SSR: 0.03,  // 3%
    SR: 0.15,   // 15%
    R: 0.82     // 82%
  };
}

/**
 * 분위기 상성을 반환합니다
 * @returns 분위기 상성 정보
 */
export function getMoodAdvantages(): MoodAdvantages {
  return {
    brave: { strong: ['wild', 'cunning'], weak: ['fierce', 'devoted'] },
    fierce: { strong: ['brave', 'noble'], weak: ['wild', 'calm'] },
    wild: { strong: ['fierce', 'mystic'], weak: ['brave', 'stoic'] },
    calm: { strong: ['devoted', 'fierce'], weak: ['stoic', 'cunning'] },
    stoic: { strong: ['calm', 'wild'], weak: ['devoted', 'mystic'] },
    devoted: { strong: ['stoic', 'brave'], weak: ['calm', 'noble'] },
    cunning: { strong: ['mystic', 'calm'], weak: ['noble', 'brave'] },
    noble: { strong: ['cunning', 'devoted'], weak: ['mystic', 'fierce'] },
    mystic: { strong: ['noble', 'stoic'], weak: ['cunning', 'wild'] }
  };
}

/**
 * 분위기 상성에 따른 데미지 배율을 계산합니다
 * @param attackerMood - 공격자 분위기
 * @param defenderMood - 방어자 분위기
 * @returns 데미지 배율 (1.0, 1.2, 0.8)
 */
export function calculateMoodMultiplier(attackerMood: MoodType, defenderMood: MoodType): number {
  const advantages = getMoodAdvantages();
  const attackerAdvantage = advantages[attackerMood];

  if (!attackerAdvantage) return 1.0;

  if (attackerAdvantage.strong.includes(defenderMood)) return 1.2;
  if (attackerAdvantage.weak.includes(defenderMood)) return 0.8;

  return 1.0;
}

/**
 * 레벨업에 필요한 경험치를 계산합니다
 * @param level - 현재 레벨
 * @returns 다음 레벨업에 필요한 경험치
 */
export function getExpRequiredForLevel(level: number): number {
  // 기본 공식: 100 * level * (1 + level * 0.1)
  return Math.floor(100 * level * (1 + level * 0.1));
}

/**
 * 캐릭터의 최대 레벨을 등급별로 반환합니다
 * @param rarity - 캐릭터 등급
 * @returns 최대 레벨
 */
export function getMaxLevel(rarity: RarityNumber | RarityKey | string): number {
  const key = typeof rarity === 'number' ? getRarityKey(rarity) : (rarity as any);
  const maxLevels: Record<string, number> = { N: 30, R: 40, SR: 50, SSR: 60 };
  // Default to N (30) for unknown rarity
  return maxLevels[key] !== undefined ? maxLevels[key] : 30;
}

// Default export for convenience
export default {
  // Character
  getCharacter,
  getAllCharacters,
  getCharactersByRarity,
  getCharactersByMood,
  getCharactersByClass,
  calculatePower,
  calculateStats,
  normalizeHero,
  normalizeHeroes,

  // Skill
  getSkill,
  getAllSkills,
  getCharacterSkills,
  getSkillsByType,

  // Stage
  getStage,
  getChapter,
  getAllChapters,
  getChapterStages,

  // Enemy
  getEnemy,
  getAllEnemies,
  getEnemiesByType,
  calculateEnemyStats,

  // Item
  getItem,
  getAllItems,
  getItemsByType,
  getItemsByRarity,

  // Quest
  getDailyQuests,
  getWeeklyQuests,
  getAchievementQuests,
  getQuest,

  // Utility
  getSummonRates,
  getMoodAdvantages,
  calculateMoodMultiplier,
  getExpRequiredForLevel,
  getMaxLevel
};

/**
 * Game Data Access Module
 * 게임 데이터 접근 모듈
 */

import characters from './characters.json';
import skills from './skills.json';
import stages from './stages.json';
import enemies from './enemies.json';
import items from './items.json';
import quests from './quests.json';
import { getRarityKey } from '../utils/helpers.js';

// ==================== Hero Data Normalization ====================

const DEFAULT_STATS = { hp: 100, atk: 10, def: 10, spd: 10 };

/**
 * SaveManager/Registry의 불완전한 영웅 데이터를 characters.json으로 보강합니다.
 * 모든 씬에서 동일한 형태의 완전한 영웅 객체를 보장합니다.
 *
 * @param {Object} hero - 불완전할 수 있는 영웅 데이터 (최소 id 또는 characterId 필요)
 * @returns {Object|null} 정규화된 영웅 객체 (null = 알 수 없는 캐릭터)
 */
export function normalizeHero(hero) {
  if (!hero) return null;

  const heroId = hero.id || hero.characterId;
  if (!heroId) return null;

  const base = getCharacter(heroId);

  // 숫자 rarity → 문자열 키 변환용 (stars 계산)
  const rarity = hero.rarity ?? base?.rarity ?? 1;
  const rarityKey = getRarityKey(rarity);

  return {
    // 식별자
    id: heroId,
    instanceId: hero.instanceId || heroId,
    characterId: heroId,

    // 기본 정보 (characters.json 우선, 오버라이드 허용)
    name: hero.name || base?.name || '???',
    rarity: rarity,
    rarityKey: rarityKey,
    stars: hero.stars || (typeof rarity === 'number' ? rarity : ({ SSR: 5, SR: 4, R: 3, N: 1 }[rarity] || 1)),
    cult: hero.cult || base?.cult || 'olympus',
    class: hero.class || base?.class || 'warrior',
    mood: hero.mood || base?.mood || 'brave',
    description: hero.description || base?.description || '',

    // 상태 (세이브 데이터 우선)
    level: hero.level || 1,
    exp: hero.exp || 0,

    // 스탯 (세이브에 레벨 반영 스탯 있으면 사용, 없으면 base)
    stats: hero.stats || base?.stats || { ...DEFAULT_STATS },
    growthStats: base?.growthStats || { hp: 0, atk: 0, def: 0, spd: 0 },

    // 스킬 (characters.json에서 가져옴)
    skills: hero.skills || base?.skills || [],
    skillLevels: hero.skillLevels || [1, 1, 1],

    // 장비
    equipped: hero.equipped || null,

    // 진화
    evolutionCount: hero.evolutionCount || 0
  };
}

/**
 * 영웅 배열 전체를 정규화합니다. null 결과는 자동 필터링.
 * @param {Array} heroes - 불완전한 영웅 배열
 * @returns {Array} 정규화된 영웅 배열
 */
export function normalizeHeroes(heroes) {
  if (!Array.isArray(heroes)) return [];
  return heroes.map(normalizeHero).filter(Boolean);
}

// ==================== Character Functions ====================

/**
 * ID로 캐릭터를 가져옵니다
 * @param {string} id - 캐릭터 ID
 * @returns {Object|undefined} 캐릭터 데이터
 */
export function getCharacter(id) {
  return characters.characters.find(char => char.id === id);
}

/**
 * 모든 캐릭터를 가져옵니다
 * @returns {Array} 모든 캐릭터 배열
 */
export function getAllCharacters() {
  return characters.characters;
}

/**
 * 등급별 캐릭터를 가져옵니다
 * @param {string} rarity - 등급 (SSR, SR, R)
 * @returns {Array} 해당 등급의 캐릭터 배열
 */
export function getCharactersByRarity(rarity) {
  return characters.characters.filter(char => char.rarity === rarity);
}

/**
 * 분위기별 캐릭터를 가져옵니다
 * @param {string} mood - 분위기 (brave, cunning, calm, wild, mystic)
 * @returns {Array} 해당 분위기의 캐릭터 배열
 */
export function getCharactersByMood(mood) {
  return characters.characters.filter(char => char.mood === mood);
}

/**
 * 클래스별 캐릭터를 가져옵니다
 * @param {string} charClass - 클래스 (warrior, mage, archer, healer)
 * @returns {Array} 해당 클래스의 캐릭터 배열
 */
export function getCharactersByClass(charClass) {
  return characters.characters.filter(char => char.class === charClass);
}

/**
 * 캐릭터의 전투력을 계산합니다
 * @param {Object} character - 캐릭터 데이터
 * @param {number} level - 캐릭터 레벨 (기본값: 1)
 * @returns {number} 전투력
 */
export function calculatePower(character, level = 1) {
  const base = character.stats || character.baseStats;
  if (!base) return 0;
  const growthStats = character.growthStats || { hp: 0, atk: 0, def: 0, spd: 0 };
  const levelMultiplier = level - 1;

  const hp = base.hp + (growthStats.hp * levelMultiplier);
  const atk = base.atk + (growthStats.atk * levelMultiplier);
  const def = base.def + (growthStats.def * levelMultiplier);
  const spd = base.spd + (growthStats.spd * levelMultiplier);

  return Math.floor((hp * 0.1) + (atk * 2) + (def * 1.5) + (spd * 1));
}

/**
 * 특정 레벨에서의 캐릭터 스탯을 계산합니다
 * @param {Object} character - 캐릭터 데이터
 * @param {number} level - 캐릭터 레벨
 * @returns {Object} 계산된 스탯
 */
export function calculateStats(character, level) {
  const base = character.stats || character.baseStats;
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
 * @param {string} id - 스킬 ID
 * @returns {Object|undefined} 스킬 데이터
 */
export function getSkill(id) {
  return skills.skills.find(skill => skill.id === id);
}

/**
 * 모든 스킬을 가져옵니다
 * @returns {Array} 모든 스킬 배열
 */
export function getAllSkills() {
  return skills.skills;
}

/**
 * 캐릭터의 스킬 정보를 가져옵니다
 * @param {Object} character - 캐릭터 데이터
 * @returns {Array} 스킬 데이터 배열
 */
export function getCharacterSkills(character) {
  return character.skills.map(skillId => getSkill(skillId)).filter(Boolean);
}

/**
 * 타입별 스킬을 가져옵니다
 * @param {string} type - 스킬 타입 (basic, active, ultimate)
 * @returns {Array} 해당 타입의 스킬 배열
 */
export function getSkillsByType(type) {
  return skills.skills.filter(skill => skill.type === type);
}

// ==================== Stage Functions ====================

/**
 * 특정 스테이지를 가져옵니다
 * @param {string} chapterId - 챕터 ID
 * @param {string} stageId - 스테이지 ID
 * @returns {Object|undefined} 스테이지 데이터
 */
export function getStage(chapterId, stageId) {
  const chapter = stages.chapters.find(ch => ch.id === chapterId);
  if (!chapter) return undefined;
  return chapter.stages.find(stage => stage.id === stageId);
}

/**
 * 챕터를 가져옵니다
 * @param {string} chapterId - 챕터 ID
 * @returns {Object|undefined} 챕터 데이터
 */
export function getChapter(chapterId) {
  return stages.chapters.find(ch => ch.id === chapterId);
}

/**
 * 모든 챕터를 가져옵니다
 * @returns {Array} 모든 챕터 배열
 */
export function getAllChapters() {
  return stages.chapters;
}

/**
 * 챕터의 모든 스테이지를 가져옵니다
 * @param {string} chapterId - 챕터 ID
 * @returns {Array} 스테이지 배열
 */
export function getChapterStages(chapterId) {
  const chapter = getChapter(chapterId);
  return chapter ? chapter.stages : [];
}

// ==================== Enemy Functions ====================

/**
 * ID로 적을 가져옵니다
 * @param {string} id - 적 ID
 * @returns {Object|undefined} 적 데이터
 */
export function getEnemy(id) {
  return enemies.enemies.find(enemy => enemy.id === id);
}

/**
 * 모든 적을 가져옵니다
 * @returns {Array} 모든 적 배열
 */
export function getAllEnemies() {
  return enemies.enemies;
}

/**
 * 타입별 적을 가져옵니다
 * @param {string} type - 적 타입 (normal, elite, boss)
 * @returns {Array} 해당 타입의 적 배열
 */
export function getEnemiesByType(type) {
  return enemies.enemies.filter(enemy => enemy.type === type);
}

/**
 * 특정 레벨에서의 적 스탯을 계산합니다
 * @param {Object} enemy - 적 데이터
 * @param {number} level - 적 레벨
 * @returns {Object} 계산된 스탯
 */
export function calculateEnemyStats(enemy, level) {
  const baseStats = enemy.baseStats;
  const growthStats = enemy.growthStats;
  const levelMultiplier = level - 1;

  return {
    hp: baseStats.hp + (growthStats.hp * levelMultiplier),
    atk: baseStats.atk + (growthStats.atk * levelMultiplier),
    def: baseStats.def + (growthStats.def * levelMultiplier),
    spd: baseStats.spd + (growthStats.spd * levelMultiplier)
  };
}

// ==================== Item Functions ====================

/**
 * ID로 아이템을 가져옵니다
 * @param {string} id - 아이템 ID
 * @returns {Object|undefined} 아이템 데이터
 */
export function getItem(id) {
  return items.items.find(item => item.id === id);
}

/**
 * 모든 아이템을 가져옵니다
 * @returns {Array} 모든 아이템 배열
 */
export function getAllItems() {
  return items.items;
}

/**
 * 타입별 아이템을 가져옵니다
 * @param {string} type - 아이템 타입 (consumable, currency, material, equipment)
 * @returns {Array} 해당 타입의 아이템 배열
 */
export function getItemsByType(type) {
  return items.items.filter(item => item.type === type);
}

/**
 * 등급별 아이템을 가져옵니다
 * @param {string} rarity - 등급 (common, uncommon, rare, epic)
 * @returns {Array} 해당 등급의 아이템 배열
 */
export function getItemsByRarity(rarity) {
  return items.items.filter(item => item.rarity === rarity);
}

// ==================== Quest Functions ====================

/**
 * 일일 퀘스트를 가져옵니다
 * @returns {Array} 일일 퀘스트 배열
 */
export function getDailyQuests() {
  return quests.dailyQuests;
}

/**
 * 주간 퀘스트를 가져옵니다
 * @returns {Array} 주간 퀘스트 배열
 */
export function getWeeklyQuests() {
  return quests.weeklyQuests;
}

/**
 * 업적 퀘스트를 가져옵니다
 * @returns {Array} 업적 퀘스트 배열
 */
export function getAchievementQuests() {
  return quests.achievementQuests;
}

/**
 * ID로 퀘스트를 가져옵니다
 * @param {string} id - 퀘스트 ID
 * @returns {Object|undefined} 퀘스트 데이터
 */
export function getQuest(id) {
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
 * @returns {Object} 등급별 확률
 */
export function getSummonRates() {
  return {
    SSR: 0.03,  // 3%
    SR: 0.15,   // 15%
    R: 0.82     // 82%
  };
}

/**
 * 분위기 상성을 반환합니다
 * @returns {Object} 분위기 상성 정보
 */
export function getMoodAdvantages() {
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
 * @param {string} attackerMood - 공격자 분위기
 * @param {string} defenderMood - 방어자 분위기
 * @returns {number} 데미지 배율 (1.0, 1.2, 0.8)
 */
export function calculateMoodMultiplier(attackerMood, defenderMood) {
  const advantages = getMoodAdvantages();
  const attackerAdvantage = advantages[attackerMood];

  if (!attackerAdvantage) return 1.0;

  if (attackerAdvantage.strong.includes(defenderMood)) return 1.2;
  if (attackerAdvantage.weak.includes(defenderMood)) return 0.8;

  return 1.0;
}

/**
 * 레벨업에 필요한 경험치를 계산합니다
 * @param {number} level - 현재 레벨
 * @returns {number} 다음 레벨업에 필요한 경험치
 */
export function getExpRequiredForLevel(level) {
  // 기본 공식: 100 * level * (1 + level * 0.1)
  return Math.floor(100 * level * (1 + level * 0.1));
}

/**
 * 캐릭터의 최대 레벨을 등급별로 반환합니다
 * @param {string} rarity - 캐릭터 등급
 * @returns {number} 최대 레벨
 */
export function getMaxLevel(rarity) {
  const key = getRarityKey(rarity);
  const maxLevels = { N: 30, R: 40, SR: 50, SSR: 60 };
  return maxLevels[key] || 40;
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

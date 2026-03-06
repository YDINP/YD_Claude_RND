/**
 * HeroService - 영웅 서비스
 *
 * 영웅 목록 조회, 영웅 추가 (가챠 결과), 영웅 레벨업/진화
 * Supabase 또는 로컬 스토리지 폴백
 */

import {
  supabase,
  isSupabaseConfigured,
  getLocalData,
  setLocalData
} from '../api/supabaseClient';
import { getUserId } from './AuthService';

const COLLECTION = 'heroes';

// 레벨업 필요 경험치 계산
const EXP_PER_LEVEL = 100;
const EXP_GROWTH_RATE = 1.2;

// 진화 필요 조각 수 (성급별)
const SHARDS_FOR_EVOLUTION = {
  1: 10,  // 1성 -> 2성
  2: 20,  // 2성 -> 3성
  3: 50,  // 3성 -> 4성
  4: 100, // 4성 -> 5성
  5: 200, // 5성 -> 6성
  6: 500  // 6성 -> 7성
};

/**
 * 모든 영웅 조회
 */
export const getHeroes = async () => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    return getLocalData(COLLECTION, userId) || [];
  }

  try {
    const { data, error } = await supabase
      .from('heroes')
      .select('*')
      .eq('user_id', userId)
      .order('stars', { ascending: false })
      .order('level', { ascending: false });

    if (error) {
      console.error('Failed to get heroes:', error);
      return getLocalData(COLLECTION, userId) || [];
    }

    // 로컬에 동기화
    setLocalData(COLLECTION, data, userId);
    return data;
  } catch (error) {
    console.error('HeroService.getHeroes error:', error);
    return getLocalData(COLLECTION, userId) || [];
  }
};

/**
 * 특정 영웅 조회
 */
export const getHero = async (heroId) => {
  const userId = await getUserId();

  if (!isSupabaseConfigured || !supabase) {
    const heroes = getLocalData(COLLECTION, userId) || [];
    return heroes.find(h => h.hero_id === heroId) || null;
  }

  try {
    const { data, error } = await supabase
      .from('heroes')
      .select('*')
      .eq('user_id', userId)
      .eq('hero_id', heroId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Failed to get hero:', error);
      const heroes = getLocalData(COLLECTION, userId) || [];
      return heroes.find(h => h.hero_id === heroId) || null;
    }

    return data;
  } catch (error) {
    console.error('HeroService.getHero error:', error);
    return null;
  }
};

/**
 * 영웅 보유 여부 확인
 */
export const hasHero = async (heroId) => {
  const hero = await getHero(heroId);
  return hero !== null;
};

/**
 * 영웅 추가 (가챠 결과 등)
 * 이미 보유한 영웅이면 조각으로 변환
 */
export const addHero = async (heroId, stars = 1) => {
  const userId = await getUserId();
  const existingHero = await getHero(heroId);

  if (existingHero) {
    // 이미 보유한 영웅이면 조각 추가 (나중에 InventoryService로 연동)
    return {
      isNew: false,
      hero: existingHero,
      shardsReceived: stars * 10 // 성급별 조각 수
    };
  }

  const newHero = {
    id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    hero_id: heroId,
    level: 1,
    exp: 0,
    stars: stars,
    skill_levels: {},
    equipment: {},
    is_locked: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (!isSupabaseConfigured || !supabase) {
    const heroes = getLocalData(COLLECTION, userId) || [];
    heroes.push(newHero);
    setLocalData(COLLECTION, heroes, userId);
    return { isNew: true, hero: newHero, shardsReceived: 0 };
  }

  try {
    const { data, error } = await supabase
      .from('heroes')
      .insert(newHero)
      .select()
      .single();

    if (error) {
      console.error('Failed to add hero:', error);
      // 로컬에만 저장
      const heroes = getLocalData(COLLECTION, userId) || [];
      heroes.push(newHero);
      setLocalData(COLLECTION, heroes, userId);
      return { isNew: true, hero: newHero, shardsReceived: 0 };
    }

    // 로컬 동기화
    const heroes = getLocalData(COLLECTION, userId) || [];
    heroes.push(data);
    setLocalData(COLLECTION, heroes, userId);

    return { isNew: true, hero: data, shardsReceived: 0 };
  } catch (error) {
    console.error('HeroService.addHero error:', error);
    return { isNew: false, hero: null, error: error.message };
  }
};

/**
 * 영웅 여러 개 추가 (10연 가챠 등)
 */
export const addHeroes = async (heroDataList) => {
  const results = [];
  for (const { heroId, stars } of heroDataList) {
    const result = await addHero(heroId, stars);
    results.push(result);
  }
  return results;
};

/**
 * 영웅 업데이트
 */
export const updateHero = async (heroId, updates) => {
  const userId = await getUserId();

  // 로컬 먼저 업데이트
  const heroes = getLocalData(COLLECTION, userId) || [];
  const heroIndex = heroes.findIndex(h => h.hero_id === heroId);

  if (heroIndex === -1) {
    return { success: false, error: 'Hero not found' };
  }

  heroes[heroIndex] = {
    ...heroes[heroIndex],
    ...updates,
    updated_at: new Date().toISOString()
  };
  setLocalData(COLLECTION, heroes, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, hero: heroes[heroIndex] };
  }

  try {
    const { data, error } = await supabase
      .from('heroes')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('hero_id', heroId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update hero:', error);
      return { success: true, hero: heroes[heroIndex] }; // 로컬 데이터 반환
    }

    // 로컬 동기화
    heroes[heroIndex] = data;
    setLocalData(COLLECTION, heroes, userId);

    return { success: true, hero: data };
  } catch (error) {
    console.error('HeroService.updateHero error:', error);
    return { success: true, hero: heroes[heroIndex] };
  }
};

/**
 * 레벨업 필요 경험치 계산
 */
export const getExpForLevel = (level) => {
  return Math.floor(EXP_PER_LEVEL * Math.pow(EXP_GROWTH_RATE, level - 1));
};

/**
 * 영웅 경험치 추가 및 레벨업 처리
 */
export const addHeroExp = async (heroId, expAmount) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  let newExp = hero.exp + expAmount;
  let newLevel = hero.level;
  const maxLevel = hero.stars * 20; // 성급당 최대 레벨 20

  // 레벨업 처리
  while (newExp >= getExpForLevel(newLevel) && newLevel < maxLevel) {
    newExp -= getExpForLevel(newLevel);
    newLevel++;
  }

  // 최대 레벨이면 경험치 초과분 제거
  if (newLevel >= maxLevel) {
    newExp = 0;
  }

  const result = await updateHero(heroId, {
    exp: newExp,
    level: newLevel
  });

  return {
    ...result,
    leveledUp: newLevel > hero.level,
    levelsGained: newLevel - hero.level,
    reachedMaxLevel: newLevel >= maxLevel
  };
};

/**
 * 영웅 레벨업 (재화 소모)
 */
export const levelUpHero = async (heroId, targetLevel) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  const maxLevel = hero.stars * 20;
  if (targetLevel > maxLevel) {
    return { success: false, error: 'Target level exceeds max level for current stars' };
  }

  // 필요 경험치 및 골드 계산
  let totalExpNeeded = 0;
  for (let lv = hero.level; lv < targetLevel; lv++) {
    totalExpNeeded += getExpForLevel(lv);
  }
  totalExpNeeded -= hero.exp;

  const result = await updateHero(heroId, {
    level: targetLevel,
    exp: 0
  });

  return {
    ...result,
    expUsed: totalExpNeeded
  };
};

/**
 * 진화 필요 조각 수 조회
 */
export const getShardsForEvolution = (currentStars) => {
  return SHARDS_FOR_EVOLUTION[currentStars] || 999;
};

/**
 * 영웅 진화 (성급 상승)
 */
export const evolveHero = async (heroId) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  if (hero.stars >= 7) {
    return { success: false, error: 'Already at max stars' };
  }

  const requiredShards = getShardsForEvolution(hero.stars);
  // TODO: 조각 소모 로직 (InventoryService 연동)

  const result = await updateHero(heroId, {
    stars: hero.stars + 1
  });

  return {
    ...result,
    newStars: hero.stars + 1,
    shardsUsed: requiredShards
  };
};

/**
 * 스킬 레벨업
 */
export const upgradeSkill = async (heroId, skillIndex) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  const skillLevels = { ...hero.skill_levels };
  const currentLevel = skillLevels[skillIndex] || 1;
  const maxSkillLevel = hero.level; // 영웅 레벨이 스킬 최대 레벨

  if (currentLevel >= maxSkillLevel) {
    return { success: false, error: 'Skill already at max level' };
  }

  skillLevels[skillIndex] = currentLevel + 1;

  const result = await updateHero(heroId, {
    skill_levels: skillLevels
  });

  return {
    ...result,
    newSkillLevel: skillLevels[skillIndex]
  };
};

/**
 * 장비 장착
 */
export const equipItem = async (heroId, slot, itemId) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  const equipment = { ...hero.equipment };
  const previousItemId = equipment[slot];
  equipment[slot] = itemId;

  const result = await updateHero(heroId, {
    equipment
  });

  return {
    ...result,
    previousItemId,
    newItemId: itemId
  };
};

/**
 * 장비 해제
 */
export const unequipItem = async (heroId, slot) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  const equipment = { ...hero.equipment };
  const previousItemId = equipment[slot];
  delete equipment[slot];

  const result = await updateHero(heroId, {
    equipment
  });

  return {
    ...result,
    unequippedItemId: previousItemId
  };
};

/**
 * 영웅 잠금/해제
 */
export const toggleHeroLock = async (heroId) => {
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  const result = await updateHero(heroId, {
    is_locked: !hero.is_locked
  });

  return {
    ...result,
    isLocked: !hero.is_locked
  };
};

/**
 * 영웅 삭제 (분해 등)
 */
export const deleteHero = async (heroId) => {
  const userId = await getUserId();
  const hero = await getHero(heroId);

  if (!hero) {
    return { success: false, error: 'Hero not found' };
  }

  if (hero.is_locked) {
    return { success: false, error: 'Hero is locked' };
  }

  // 로컬에서 삭제
  const heroes = getLocalData(COLLECTION, userId) || [];
  const updatedHeroes = heroes.filter(h => h.hero_id !== heroId);
  setLocalData(COLLECTION, updatedHeroes, userId);

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, deletedHero: hero };
  }

  try {
    const { error } = await supabase
      .from('heroes')
      .delete()
      .eq('user_id', userId)
      .eq('hero_id', heroId);

    if (error) {
      console.error('Failed to delete hero:', error);
    }

    return { success: true, deletedHero: hero };
  } catch (error) {
    console.error('HeroService.deleteHero error:', error);
    return { success: true, deletedHero: hero };
  }
};

/**
 * 영웅 필터링 및 정렬
 */
export const filterHeroes = async (options = {}) => {
  const heroes = await getHeroes();
  let filtered = [...heroes];

  // 필터링
  if (options.minStars) {
    filtered = filtered.filter(h => h.stars >= options.minStars);
  }
  if (options.maxStars) {
    filtered = filtered.filter(h => h.stars <= options.maxStars);
  }
  if (options.minLevel) {
    filtered = filtered.filter(h => h.level >= options.minLevel);
  }

  // 정렬
  const sortBy = options.sortBy || 'stars';
  const sortOrder = options.sortOrder || 'desc';

  filtered.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'stars') {
      comparison = a.stars - b.stars;
    } else if (sortBy === 'level') {
      comparison = a.level - b.level;
    } else if (sortBy === 'created_at') {
      comparison = new Date(a.created_at) - new Date(b.created_at);
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  return filtered;
};

// 서비스 객체로 내보내기
const HeroService = {
  getHeroes,
  getHero,
  hasHero,
  addHero,
  addHeroes,
  updateHero,
  getExpForLevel,
  addHeroExp,
  levelUpHero,
  getShardsForEvolution,
  evolveHero,
  upgradeSkill,
  equipItem,
  unequipItem,
  toggleHeroLock,
  deleteHero,
  filterHeroes
};

export default HeroService;

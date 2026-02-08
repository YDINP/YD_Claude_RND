/**
 * data/index.js Unit Tests
 * QAT-T1-1: 게임 데이터 접근 모듈 유닛 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeHero,
  normalizeHeroes,
  getCharacter,
  getAllCharacters,
  getCharactersByRarity,
  getCharactersByMood,
  getCharactersByClass,
  calculatePower,
  calculateStats,
  getSkill,
  getAllSkills,
  getSkillsByType,
  getCharacterSkills,
  getStage,
  getChapter,
  getAllChapters,
  getChapterStages,
  getEnemy,
  getAllEnemies,
  getEnemiesByType,
  calculateEnemyStats,
  getItem,
  getAllItems,
  getItemsByType,
  getItemsByRarity,
  getDailyQuests,
  getWeeklyQuests,
  getAchievementQuests,
  getQuest,
  getSummonRates,
  getMoodAdvantages,
  calculateMoodMultiplier,
  getExpRequiredForLevel,
  getMaxLevel,
} from '../../src/data/index.js';

// ==================== normalizeHero ====================

describe('normalizeHero', () => {
  it('null 입력 시 null 반환', () => {
    expect(normalizeHero(null)).toBeNull();
    expect(normalizeHero(undefined)).toBeNull();
  });

  it('id 없는 객체 → null 반환', () => {
    expect(normalizeHero({})).toBeNull();
    expect(normalizeHero({ name: 'test' })).toBeNull();
  });

  it('id로 정규화 (characters.json 기반 보강)', () => {
    const allChars = getAllCharacters();
    if (allChars.length === 0) return;
    const firstChar = allChars[0];

    const result = normalizeHero({ id: firstChar.id });
    expect(result).not.toBeNull();
    expect(result.id).toBe(firstChar.id);
    expect(result.characterId).toBe(firstChar.id);
    expect(result.name).toBe(firstChar.name);
    expect(result.level).toBe(1);
    expect(result.exp).toBe(0);
    expect(result.stats).toEqual(firstChar.stats);
  });

  it('characterId 필드로도 인식', () => {
    const allChars = getAllCharacters();
    if (allChars.length === 0) return;
    const firstChar = allChars[0];

    const result = normalizeHero({ characterId: firstChar.id });
    expect(result).not.toBeNull();
    expect(result.id).toBe(firstChar.id);
  });

  it('세이브 데이터 우선 적용 (level, exp, stats)', () => {
    const allChars = getAllCharacters();
    if (allChars.length === 0) return;
    const firstChar = allChars[0];

    const customStats = { hp: 999, atk: 99, def: 99, spd: 99 };
    const result = normalizeHero({
      id: firstChar.id,
      level: 50,
      exp: 12345,
      stats: customStats,
    });

    expect(result.level).toBe(50);
    expect(result.exp).toBe(12345);
    expect(result.stats).toEqual(customStats);
  });

  it('존재하지 않는 캐릭터 ID → 기본값으로 보강', () => {
    const result = normalizeHero({ id: 'nonexistent_hero_xyz' });
    expect(result).not.toBeNull();
    expect(result.id).toBe('nonexistent_hero_xyz');
    expect(result.name).toBe('???');
    expect(result.cult).toBe('olympus');
    expect(result.class).toBe('warrior');
    expect(result.mood).toBe('brave');
  });

  it('instanceId 유지', () => {
    const result = normalizeHero({ id: 'test_id', instanceId: 'inst_123' });
    expect(result.instanceId).toBe('inst_123');
  });

  it('instanceId 없으면 id 사용', () => {
    const result = normalizeHero({ id: 'test_id' });
    expect(result.instanceId).toBe('test_id');
  });

  it('기본 필드 존재 확인 (equipped, evolutionCount, skillLevels)', () => {
    const result = normalizeHero({ id: 'some_id' });
    expect(result.equipped).toBeNull();
    expect(result.evolutionCount).toBe(0);
    expect(result.skillLevels).toEqual([1, 1, 1]);
  });
});

// ==================== normalizeHeroes ====================

describe('normalizeHeroes', () => {
  it('배열 정규화', () => {
    const allChars = getAllCharacters();
    if (allChars.length < 2) return;

    const heroes = [{ id: allChars[0].id }, { id: allChars[1].id }];
    const result = normalizeHeroes(heroes);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(allChars[0].id);
    expect(result[1].id).toBe(allChars[1].id);
  });

  it('비배열 입력 → 빈 배열', () => {
    expect(normalizeHeroes(null)).toEqual([]);
    expect(normalizeHeroes(undefined)).toEqual([]);
    expect(normalizeHeroes('string')).toEqual([]);
    expect(normalizeHeroes(123)).toEqual([]);
  });

  it('null 요소 자동 필터링', () => {
    const result = normalizeHeroes([null, { id: 'test_id' }, undefined, {}]);
    // null, undefined → null, {} (no id) → null, 이므로 test_id만 남음
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test_id');
  });

  it('빈 배열 입력', () => {
    expect(normalizeHeroes([])).toEqual([]);
  });
});

// ==================== getCharacter ====================

describe('getCharacter', () => {
  it('존재하는 ID로 캐릭터 반환', () => {
    const allChars = getAllCharacters();
    if (allChars.length === 0) return;

    const firstChar = allChars[0];
    const result = getCharacter(firstChar.id);
    expect(result).toBeDefined();
    expect(result.id).toBe(firstChar.id);
    expect(result.name).toBeDefined();
  });

  it('존재하지 않는 ID → undefined', () => {
    expect(getCharacter('nonexistent_id_12345')).toBeUndefined();
  });

  it('null/undefined ID → undefined', () => {
    expect(getCharacter(null)).toBeUndefined();
    expect(getCharacter(undefined)).toBeUndefined();
  });
});

// ==================== getAllCharacters ====================

describe('getAllCharacters', () => {
  it('배열 반환', () => {
    const result = getAllCharacters();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('각 캐릭터에 id, name, rarity 필드 존재', () => {
    const result = getAllCharacters();
    result.forEach((char) => {
      expect(char.id).toBeDefined();
      expect(char.name).toBeDefined();
      expect(char.rarity).toBeDefined();
    });
  });
});

// ==================== getCharactersByRarity ====================

describe('getCharactersByRarity', () => {
  it('SSR 등급 캐릭터 필터링', () => {
    const result = getCharactersByRarity('SSR');
    expect(Array.isArray(result)).toBe(true);
    result.forEach((char) => {
      expect(char.rarity).toBe('SSR');
    });
  });

  it('존재하지 않는 등급 → 빈 배열', () => {
    const result = getCharactersByRarity('LEGENDARY');
    expect(result).toEqual([]);
  });
});

// ==================== getCharactersByMood ====================

describe('getCharactersByMood', () => {
  it('brave 분위기 캐릭터 필터링', () => {
    const result = getCharactersByMood('brave');
    expect(Array.isArray(result)).toBe(true);
    result.forEach((char) => {
      expect(char.mood).toBe('brave');
    });
  });

  it('존재하지 않는 분위기 → 빈 배열', () => {
    expect(getCharactersByMood('unknown_mood')).toEqual([]);
  });
});

// ==================== getCharactersByClass ====================

describe('getCharactersByClass', () => {
  it('warrior 클래스 캐릭터 필터링', () => {
    const result = getCharactersByClass('warrior');
    expect(Array.isArray(result)).toBe(true);
    result.forEach((char) => {
      expect(char.class).toBe('warrior');
    });
  });

  it('존재하지 않는 클래스 → 빈 배열', () => {
    expect(getCharactersByClass('wizard')).toEqual([]);
  });
});

// ==================== calculatePower ====================

describe('calculatePower', () => {
  it('레벨 1 기본 전투력 계산', () => {
    const char = {
      stats: { hp: 500, atk: 50, def: 30, spd: 20 },
      growthStats: { hp: 10, atk: 2, def: 1, spd: 1 },
    };
    // (500*0.1) + (50*2) + (30*1.5) + (20*1) = 50 + 100 + 45 + 20 = 215
    const power = calculatePower(char, 1);
    expect(power).toBe(215);
  });

  it('레벨 10 전투력 계산 (growthStats 적용)', () => {
    const char = {
      stats: { hp: 500, atk: 50, def: 30, spd: 20 },
      growthStats: { hp: 10, atk: 2, def: 1, spd: 1 },
    };
    // levelMultiplier = 9
    // hp = 500 + 90 = 590, atk = 50 + 18 = 68, def = 30 + 9 = 39, spd = 20 + 9 = 29
    // (590*0.1) + (68*2) + (39*1.5) + (29*1) = 59 + 136 + 58.5 + 29 = 282.5 → 282
    const power = calculatePower(char, 10);
    expect(power).toBe(282);
  });

  it('stats 없는 캐릭터 → 0', () => {
    expect(calculatePower({}, 1)).toBe(0);
    expect(calculatePower({ name: 'test' }, 5)).toBe(0);
  });

  it('baseStats 필드도 인식', () => {
    const char = {
      baseStats: { hp: 200, atk: 20, def: 20, spd: 10 },
    };
    // (200*0.1) + (20*2) + (20*1.5) + (10*1) = 20 + 40 + 30 + 10 = 100
    expect(calculatePower(char, 1)).toBe(100);
  });

  it('growthStats 없으면 성장 0으로 처리', () => {
    const char = {
      stats: { hp: 100, atk: 10, def: 10, spd: 10 },
    };
    const powerL1 = calculatePower(char, 1);
    const powerL10 = calculatePower(char, 10);
    expect(powerL1).toBe(powerL10);
  });
});

// ==================== calculateStats ====================

describe('calculateStats', () => {
  it('레벨 1 기본 스탯', () => {
    const char = {
      stats: { hp: 100, atk: 10, def: 10, spd: 10 },
      growthStats: { hp: 5, atk: 1, def: 1, spd: 1 },
    };
    const result = calculateStats(char, 1);
    expect(result).toEqual({ hp: 100, atk: 10, def: 10, spd: 10 });
  });

  it('레벨 11 성장 스탯 적용', () => {
    const char = {
      stats: { hp: 100, atk: 10, def: 10, spd: 10 },
      growthStats: { hp: 5, atk: 1, def: 1, spd: 1 },
    };
    const result = calculateStats(char, 11);
    // levelMultiplier = 10
    expect(result).toEqual({ hp: 150, atk: 20, def: 20, spd: 20 });
  });

  it('stats 없는 캐릭터 → 기본값', () => {
    const result = calculateStats({}, 1);
    expect(result).toEqual({ hp: 100, atk: 10, def: 10, spd: 10 });
  });

  it('baseStats 필드도 인식', () => {
    const char = {
      baseStats: { hp: 200, atk: 20, def: 15, spd: 12 },
      growthStats: { hp: 10, atk: 2, def: 1, spd: 1 },
    };
    const result = calculateStats(char, 1);
    expect(result).toEqual({ hp: 200, atk: 20, def: 15, spd: 12 });
  });
});

// ==================== getMoodAdvantages ====================

describe('getMoodAdvantages', () => {
  const ALL_MOODS = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];

  it('9종 분위기 모두 포함', () => {
    const advantages = getMoodAdvantages();
    ALL_MOODS.forEach((mood) => {
      expect(advantages[mood]).toBeDefined();
    });
  });

  it('각 분위기에 strong/weak 2개씩', () => {
    const advantages = getMoodAdvantages();
    ALL_MOODS.forEach((mood) => {
      expect(advantages[mood].strong).toHaveLength(2);
      expect(advantages[mood].weak).toHaveLength(2);
    });
  });

  it('자기 자신이 strong/weak에 포함되지 않음', () => {
    const advantages = getMoodAdvantages();
    ALL_MOODS.forEach((mood) => {
      expect(advantages[mood].strong).not.toContain(mood);
      expect(advantages[mood].weak).not.toContain(mood);
    });
  });

  it('상성 대칭 검증: A가 B에 강하면 B는 A에 약해야 함', () => {
    const advantages = getMoodAdvantages();
    ALL_MOODS.forEach((mood) => {
      advantages[mood].strong.forEach((target) => {
        expect(advantages[target].weak).toContain(mood);
      });
      advantages[mood].weak.forEach((target) => {
        expect(advantages[target].strong).toContain(mood);
      });
    });
  });
});

// ==================== calculateMoodMultiplier ====================

describe('calculateMoodMultiplier', () => {
  it('상성 우위 → 1.2', () => {
    expect(calculateMoodMultiplier('brave', 'wild')).toBe(1.2);
    expect(calculateMoodMultiplier('brave', 'cunning')).toBe(1.2);
  });

  it('상성 열세 → 0.8', () => {
    expect(calculateMoodMultiplier('brave', 'fierce')).toBe(0.8);
    expect(calculateMoodMultiplier('brave', 'devoted')).toBe(0.8);
  });

  it('중립 → 1.0', () => {
    expect(calculateMoodMultiplier('brave', 'brave')).toBe(1.0);
    expect(calculateMoodMultiplier('brave', 'calm')).toBe(1.0);
  });

  it('존재하지 않는 분위기 → 1.0', () => {
    expect(calculateMoodMultiplier('unknown', 'brave')).toBe(1.0);
    expect(calculateMoodMultiplier('brave', 'unknown')).toBe(1.0);
  });

  it('9종 전체 상성 검증', () => {
    const moods = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];
    const advantages = getMoodAdvantages();

    moods.forEach((attacker) => {
      moods.forEach((defender) => {
        const multiplier = calculateMoodMultiplier(attacker, defender);
        if (advantages[attacker].strong.includes(defender)) {
          expect(multiplier).toBe(1.2);
        } else if (advantages[attacker].weak.includes(defender)) {
          expect(multiplier).toBe(0.8);
        } else {
          expect(multiplier).toBe(1.0);
        }
      });
    });
  });
});

// ==================== getMaxLevel ====================

describe('getMaxLevel', () => {
  it('등급별 최대 레벨', () => {
    expect(getMaxLevel('N')).toBe(30);
    expect(getMaxLevel('R')).toBe(40);
    expect(getMaxLevel('SR')).toBe(50);
    expect(getMaxLevel('SSR')).toBe(60);
  });

  it('숫자 등급도 처리', () => {
    expect(getMaxLevel(1)).toBe(30);  // 1 → N
    expect(getMaxLevel(3)).toBe(40);  // 3 → R
    expect(getMaxLevel(4)).toBe(50);  // 4 → SR
    expect(getMaxLevel(5)).toBe(60);  // 5 → SSR
  });

  it('알 수 없는 등급 → N등급 기본값 30 (getRarityKey 폴백)', () => {
    expect(getMaxLevel('UNKNOWN')).toBe(30);
  });
});

// ==================== getExpRequiredForLevel ====================

describe('getExpRequiredForLevel', () => {
  it('레벨 1: 100 * 1 * (1 + 0.1) = 110', () => {
    expect(getExpRequiredForLevel(1)).toBe(110);
  });

  it('레벨 10: 100 * 10 * (1 + 1.0) = 2000', () => {
    expect(getExpRequiredForLevel(10)).toBe(2000);
  });

  it('레벨이 높을수록 필요 경험치 증가', () => {
    const exp5 = getExpRequiredForLevel(5);
    const exp10 = getExpRequiredForLevel(10);
    const exp20 = getExpRequiredForLevel(20);
    expect(exp10).toBeGreaterThan(exp5);
    expect(exp20).toBeGreaterThan(exp10);
  });
});

// ==================== getSummonRates ====================

describe('getSummonRates', () => {
  it('확률 합이 1.0', () => {
    const rates = getSummonRates();
    const total = rates.SSR + rates.SR + rates.R;
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('SSR < SR < R 순서', () => {
    const rates = getSummonRates();
    expect(rates.SSR).toBeLessThan(rates.SR);
    expect(rates.SR).toBeLessThan(rates.R);
  });

  it('SSR 3%, SR 15%, R 82%', () => {
    const rates = getSummonRates();
    expect(rates.SSR).toBe(0.03);
    expect(rates.SR).toBe(0.15);
    expect(rates.R).toBe(0.82);
  });
});

// ==================== Skill Functions ====================

describe('Skill Functions', () => {
  it('getAllSkills: 배열 반환', () => {
    const result = getAllSkills();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getSkill: 존재하는 스킬 반환', () => {
    const allSkills = getAllSkills();
    if (allSkills.length === 0) return;
    const firstSkill = allSkills[0];
    const result = getSkill(firstSkill.id);
    expect(result).toBeDefined();
    expect(result.id).toBe(firstSkill.id);
  });

  it('getSkill: 존재하지 않는 ID → undefined', () => {
    expect(getSkill('nonexistent_skill_xyz')).toBeUndefined();
  });

  it('getSkillsByType: 타입별 필터링', () => {
    const allSkills = getAllSkills();
    if (allSkills.length === 0) return;
    const types = [...new Set(allSkills.map((s) => s.type))];
    types.forEach((type) => {
      const result = getSkillsByType(type);
      result.forEach((s) => expect(s.type).toBe(type));
    });
  });

  it('getCharacterSkills: 캐릭터 스킬 데이터 반환', () => {
    const allChars = getAllCharacters();
    const charWithSkills = allChars.find((c) => c.skills && c.skills.length > 0);
    if (!charWithSkills) return;

    const result = getCharacterSkills(charWithSkills);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ==================== Stage Functions ====================

describe('Stage Functions', () => {
  it('getAllChapters: 배열 반환', () => {
    const result = getAllChapters();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getChapter: 존재하는 챕터 반환', () => {
    const chapters = getAllChapters();
    if (chapters.length === 0) return;
    const result = getChapter(chapters[0].id);
    expect(result).toBeDefined();
    expect(result.id).toBe(chapters[0].id);
  });

  it('getChapter: 존재하지 않는 ID → undefined', () => {
    expect(getChapter('nonexistent_chapter')).toBeUndefined();
  });

  it('getChapterStages: 챕터 스테이지 반환', () => {
    const chapters = getAllChapters();
    if (chapters.length === 0) return;
    const result = getChapterStages(chapters[0].id);
    expect(Array.isArray(result)).toBe(true);
  });

  it('getChapterStages: 존재하지 않는 챕터 → 빈 배열', () => {
    expect(getChapterStages('nonexistent')).toEqual([]);
  });

  it('getStage: 존재하는 스테이지 반환', () => {
    const chapters = getAllChapters();
    if (chapters.length === 0) return;
    const chapter = chapters[0];
    if (!chapter.stages || chapter.stages.length === 0) return;
    const stage = chapter.stages[0];
    const result = getStage(chapter.id, stage.id);
    expect(result).toBeDefined();
    expect(result.id).toBe(stage.id);
  });

  it('getStage: 존재하지 않는 챕터 → undefined', () => {
    expect(getStage('nonexistent', 'stage1')).toBeUndefined();
  });
});

// ==================== Enemy Functions ====================

describe('Enemy Functions', () => {
  it('getAllEnemies: 배열 반환', () => {
    const result = getAllEnemies();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('getEnemy: 존재하는 적 반환', () => {
    const allEnemies = getAllEnemies();
    const result = getEnemy(allEnemies[0].id);
    expect(result).toBeDefined();
    expect(result.id).toBe(allEnemies[0].id);
  });

  it('getEnemy: 존재하지 않는 ID → undefined', () => {
    expect(getEnemy('nonexistent_enemy')).toBeUndefined();
  });

  it('getEnemiesByType: 타입별 필터링', () => {
    const allEnemies = getAllEnemies();
    const types = [...new Set(allEnemies.map((e) => e.type))];
    types.forEach((type) => {
      const result = getEnemiesByType(type);
      result.forEach((e) => expect(e.type).toBe(type));
    });
  });

  it('calculateEnemyStats: 레벨별 스탯 계산', () => {
    const allEnemies = getAllEnemies();
    const enemy = allEnemies[0];
    if (!enemy.baseStats || !enemy.growthStats) return;

    const statsL1 = calculateEnemyStats(enemy, 1);
    expect(statsL1).toEqual(enemy.baseStats);

    const statsL10 = calculateEnemyStats(enemy, 10);
    expect(statsL10.hp).toBe(enemy.baseStats.hp + enemy.growthStats.hp * 9);
    expect(statsL10.atk).toBe(enemy.baseStats.atk + enemy.growthStats.atk * 9);
  });
});

// ==================== Item Functions ====================

describe('Item Functions', () => {
  it('getAllItems: 배열 반환', () => {
    const result = getAllItems();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('getItem: 존재하는 아이템 반환', () => {
    const allItems = getAllItems();
    const result = getItem(allItems[0].id);
    expect(result).toBeDefined();
    expect(result.id).toBe(allItems[0].id);
  });

  it('getItem: 존재하지 않는 ID → undefined', () => {
    expect(getItem('nonexistent_item')).toBeUndefined();
  });

  it('getItemsByType: 타입별 필터링', () => {
    const allItems = getAllItems();
    const types = [...new Set(allItems.map((i) => i.type))];
    types.forEach((type) => {
      const result = getItemsByType(type);
      result.forEach((i) => expect(i.type).toBe(type));
    });
  });

  it('getItemsByRarity: 등급별 필터링', () => {
    const allItems = getAllItems();
    const rarities = [...new Set(allItems.map((i) => i.rarity).filter(Boolean))];
    rarities.forEach((rarity) => {
      const result = getItemsByRarity(rarity);
      result.forEach((i) => expect(i.rarity).toBe(rarity));
    });
  });
});

// ==================== Quest Functions ====================

describe('Quest Functions', () => {
  it('getDailyQuests: 배열 반환', () => {
    const result = getDailyQuests();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getWeeklyQuests: 배열 반환', () => {
    const result = getWeeklyQuests();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getAchievementQuests: 배열 반환', () => {
    const result = getAchievementQuests();
    expect(Array.isArray(result)).toBe(true);
  });

  it('getQuest: 존재하는 퀘스트 반환', () => {
    const dailyQuests = getDailyQuests();
    if (dailyQuests.length === 0) return;
    const result = getQuest(dailyQuests[0].id);
    expect(result).toBeDefined();
    expect(result.id).toBe(dailyQuests[0].id);
  });

  it('getQuest: 존재하지 않는 ID → undefined', () => {
    expect(getQuest('nonexistent_quest')).toBeUndefined();
  });
});

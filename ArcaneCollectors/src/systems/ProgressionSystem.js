/**
 * ProgressionSystem - 캐릭터 성장 시스템
 * 레벨업, 스킬 강화, 각성(진화) 관리
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import { getRarityKey } from '../utils/rarityUtils.js';
import { getCharacter } from '../data/index.js';

export class ProgressionSystem {
  // 최대 레벨 (등급별)
  static MAX_LEVEL = {
    N: 30,
    R: 40,
    SR: 50,
    SSR: 60
  };

  // 최대 성급
  static MAX_STARS = 6;

  // 스킬 최대 레벨
  static MAX_SKILL_LEVEL = 10;

  /**
   * 레벨업에 필요한 경험치 계산
   * @param {number} level 현재 레벨
   * @returns {number} 다음 레벨까지 필요한 경험치
   */
  static getExpForLevel(level) {
    // 경험치 곡선: level^2 * 100
    return Math.floor(Math.pow(level, 2) * 100);
  }

  /**
   * 특정 레벨까지의 총 필요 경험치
   * @param {number} targetLevel 목표 레벨
   * @returns {number} 총 필요 경험치
   */
  static getTotalExpForLevel(targetLevel) {
    let total = 0;
    for (let i = 1; i < targetLevel; i++) {
      total += this.getExpForLevel(i);
    }
    return total;
  }

  /**
   * 캐릭터에게 경험치 추가
   * @param {string} characterId 캐릭터 ID
   * @param {number} amount 경험치 양
   * @returns {Object} { newLevel, levelsGained, overflow, statsGained }
   */
  static addExp(characterId, amount) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) {
      return { success: false, error: '캐릭터를 찾을 수 없습니다' };
    }

    const charData = getCharacter(characterId);
    const rarity = getRarityKey(character.rarity ?? charData?.rarity ?? 1);
    const maxLevel = this.MAX_LEVEL[rarity] || 30;

    // 이미 최대 레벨이면 오버플로우
    if (character.level >= maxLevel) {
      return {
        success: true,
        newLevel: character.level,
        levelsGained: 0,
        overflow: amount,
        statsGained: null
      };
    }

    let currentExp = character.exp + amount;
    let currentLevel = character.level;
    let levelsGained = 0;
    const initialStats = this.getStatsAtLevel(characterId, currentLevel);

    // 레벨업 처리
    while (currentLevel < maxLevel) {
      const expNeeded = this.getExpForLevel(currentLevel);

      if (currentExp >= expNeeded) {
        currentExp -= expNeeded;
        currentLevel++;
        levelsGained++;
      } else {
        break;
      }
    }

    // 최대 레벨 도달 시 오버플로우 경험치
    const overflow = currentLevel >= maxLevel ? currentExp : 0;
    if (currentLevel >= maxLevel) {
      currentExp = 0;
    }

    // 캐릭터 업데이트
    SaveManager.updateCharacter(characterId, {
      level: currentLevel,
      exp: currentExp
    });

    // 스탯 증가량 계산
    const finalStats = this.getStatsAtLevel(characterId, currentLevel);
    const statsGained = {
      hp: finalStats.hp - initialStats.hp,
      atk: finalStats.atk - initialStats.atk,
      def: finalStats.def - initialStats.def,
      spd: finalStats.spd - initialStats.spd
    };

    if (levelsGained > 0) {
      EventBus.emit(GameEvents.LEVEL_UP, {
        characterId,
        newLevel: currentLevel,
        levelsGained
      });
    }

    return {
      success: true,
      newLevel: currentLevel,
      previousLevel: character.level,
      levelsGained,
      currentExp,
      overflow,
      statsGained
    };
  }

  /**
   * 특정 레벨의 스탯 계산
   * @param {string} characterId 캐릭터 ID
   * @param {number} level 레벨
   * @returns {Object} 스탯
   */
  static getStatsAtLevel(characterId, level) {
    const charData = getCharacter(characterId);
    const savedChar = SaveManager.getCharacter(characterId);
    const rarity = getRarityKey(savedChar?.rarity ?? charData?.rarity ?? 1);

    // 기본 스탯 (등급별 베이스)
    const baseStats = {
      N: { hp: 800, atk: 80, def: 40, spd: 95 },
      R: { hp: 1000, atk: 100, def: 50, spd: 100 },
      SR: { hp: 1200, atk: 120, def: 60, spd: 105 },
      SSR: { hp: 1500, atk: 150, def: 75, spd: 110 }
    };

    // 성장률 (등급별)
    const growth = {
      N: { hp: 80, atk: 8, def: 4, spd: 1 },
      R: { hp: 100, atk: 10, def: 5, spd: 1.5 },
      SR: { hp: 120, atk: 12, def: 6, spd: 2 },
      SSR: { hp: 150, atk: 15, def: 7.5, spd: 2.5 }
    };

    const base = baseStats[rarity] || baseStats.N;
    const growthRate = growth[rarity] || growth.N;

    return {
      hp: Math.floor(base.hp + growthRate.hp * (level - 1)),
      atk: Math.floor(base.atk + growthRate.atk * (level - 1)),
      def: Math.floor(base.def + growthRate.def * (level - 1)),
      spd: Math.floor(base.spd + growthRate.spd * (level - 1))
    };
  }

  // ========== 스킬 강화 ==========

  /**
   * 스킬 강화 비용 계산
   * @param {number} currentLevel 현재 스킬 레벨
   * @returns {Object} { gold, skillBooks }
   */
  static getSkillEnhanceCost(currentLevel) {
    // 레벨별 비용 증가
    const goldBase = 1000;
    const bookBase = 1;

    return {
      gold: goldBase * currentLevel * currentLevel,
      skillBooks: Math.ceil(bookBase * Math.pow(1.5, currentLevel - 1))
    };
  }

  /**
   * 스킬 강화
   * @param {string} characterId 캐릭터 ID
   * @param {number} skillIndex 스킬 인덱스 (0: 기본, 1: 스킬1, 2: 스킬2)
   * @returns {Object} 결과
   */
  static enhanceSkill(characterId, skillIndex) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) {
      return { success: false, error: '캐릭터를 찾을 수 없습니다' };
    }

    const currentLevel = character.skillLevels[skillIndex] || 1;

    // 최대 레벨 체크
    if (currentLevel >= this.MAX_SKILL_LEVEL) {
      return { success: false, error: '스킬이 이미 최대 레벨입니다' };
    }

    // 비용 확인
    const cost = this.getSkillEnhanceCost(currentLevel);
    const resources = SaveManager.getResources();

    if (resources.gold < cost.gold) {
      return { success: false, error: '골드가 부족합니다' };
    }

    if ((resources.skillBooks || 0) < cost.skillBooks) {
      return { success: false, error: '스킬 북이 부족합니다' };
    }

    // 비용 차감
    SaveManager.spendGold(cost.gold);
    // skillBooks 차감 (SaveManager에 추가 필요)
    const data = SaveManager.load();
    data.resources.skillBooks = (data.resources.skillBooks || 0) - cost.skillBooks;
    SaveManager.save(data);

    // 스킬 레벨 증가
    const newSkillLevels = [...character.skillLevels];
    newSkillLevels[skillIndex] = currentLevel + 1;

    SaveManager.updateCharacter(characterId, {
      skillLevels: newSkillLevels
    });

    return {
      success: true,
      skillIndex,
      newLevel: currentLevel + 1,
      cost
    };
  }

  /**
   * 스킬 강화 가능 여부
   * @param {string} characterId 캐릭터 ID
   * @param {number} skillIndex 스킬 인덱스
   * @returns {Object} { canEnhance, reason }
   */
  static canEnhanceSkill(characterId, skillIndex) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) {
      return { canEnhance: false, reason: '캐릭터 없음' };
    }

    const currentLevel = character.skillLevels[skillIndex] || 1;

    if (currentLevel >= this.MAX_SKILL_LEVEL) {
      return { canEnhance: false, reason: '최대 레벨' };
    }

    const cost = this.getSkillEnhanceCost(currentLevel);
    const resources = SaveManager.getResources();

    if (resources.gold < cost.gold) {
      return { canEnhance: false, reason: '골드 부족' };
    }

    if ((resources.skillBooks || 0) < cost.skillBooks) {
      return { canEnhance: false, reason: '스킬 북 부족' };
    }

    return { canEnhance: true, cost };
  }

  // ========== 각성 (성급 강화) ==========

  /**
   * 각성 비용 계산
   * @param {number} currentStars 현재 성급
   * @returns {Object} { gold, shards }
   */
  static getEvolutionCost(currentStars) {
    // 성급별 필요 조각 수
    const shardsRequired = {
      1: 10, // 1성 → 2성
      2: 20, // 2성 → 3성
      3: 40, // 3성 → 4성
      4: 80, // 4성 → 5성
      5: 160 // 5성 → 6성
    };

    // 성급별 필요 골드
    const goldRequired = {
      1: 5000,
      2: 10000,
      3: 25000,
      4: 50000,
      5: 100000
    };

    return {
      gold: goldRequired[currentStars] || 100000,
      shards: shardsRequired[currentStars] || 160
    };
  }

  /**
   * 캐릭터 각성 (진화)
   * @param {string} characterId 캐릭터 ID
   * @returns {Object} 결과
   */
  static evolve(characterId) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) {
      return { success: false, error: '캐릭터를 찾을 수 없습니다' };
    }

    const currentStars = character.stars;

    // 최대 성급 체크
    if (currentStars >= this.MAX_STARS) {
      return { success: false, error: '이미 최대 성급입니다' };
    }

    // 비용 확인
    const cost = this.getEvolutionCost(currentStars);
    const resources = SaveManager.getResources();
    const shards = resources.characterShards?.[characterId] || 0;

    if (resources.gold < cost.gold) {
      return { success: false, error: '골드가 부족합니다' };
    }

    if (shards < cost.shards) {
      return {
        success: false,
        error: `조각이 부족합니다 (${shards}/${cost.shards})`
      };
    }

    // 비용 차감
    SaveManager.spendGold(cost.gold);

    const data = SaveManager.load();
    data.resources.characterShards[characterId] -= cost.shards;
    SaveManager.save(data);

    // 성급 증가
    const newStars = currentStars + 1;
    SaveManager.updateCharacter(characterId, {
      stars: newStars
    });

    // 스탯 보너스 계산
    const statBonus = this.getStarBonus(newStars);

    return {
      success: true,
      characterId,
      previousStars: currentStars,
      newStars,
      cost,
      statBonus
    };
  }

  /**
   * 각성 가능 여부
   * @param {string} characterId 캐릭터 ID
   * @returns {Object} { canEvolve, reason, cost, currentShards }
   */
  static canEvolve(characterId) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) {
      return { canEvolve: false, reason: '캐릭터 없음' };
    }

    if (character.stars >= this.MAX_STARS) {
      return { canEvolve: false, reason: '최대 성급' };
    }

    const cost = this.getEvolutionCost(character.stars);
    const resources = SaveManager.getResources();
    const shards = resources.characterShards?.[characterId] || 0;

    if (resources.gold < cost.gold) {
      return {
        canEvolve: false,
        reason: '골드 부족',
        cost,
        currentShards: shards
      };
    }

    if (shards < cost.shards) {
      return {
        canEvolve: false,
        reason: '조각 부족',
        cost,
        currentShards: shards
      };
    }

    return {
      canEvolve: true,
      cost,
      currentShards: shards
    };
  }

  /**
   * 성급 보너스 계산
   * @param {number} stars 성급
   * @returns {Object} 스탯 보너스 (퍼센트)
   */
  static getStarBonus(stars) {
    // 성급당 5% 스탯 증가
    const bonusPercent = (stars - 1) * 5;

    return {
      hp: bonusPercent,
      atk: bonusPercent,
      def: bonusPercent,
      spd: Math.floor(bonusPercent / 2)
    };
  }

  // ========== 전투력 계산 ==========

  /**
   * 캐릭터 전투력 계산
   * @param {Object} character 캐릭터 데이터
   * @returns {number} 전투력
   */
  static calculatePower(character) {
    if (!character) return 0;

    const stats = this.getStatsAtLevel(character.characterId, character.level);
    const starBonus = this.getStarBonus(character.stars);

    // 성급 보너스 적용
    const finalStats = {
      hp: Math.floor(stats.hp * (1 + starBonus.hp / 100)),
      atk: Math.floor(stats.atk * (1 + starBonus.atk / 100)),
      def: Math.floor(stats.def * (1 + starBonus.def / 100)),
      spd: Math.floor(stats.spd * (1 + starBonus.spd / 100))
    };

    // 스킬 레벨 보너스
    const skillBonus = character.skillLevels.reduce((sum, lv) => sum + lv, 0) * 10;

    // 전투력 = HP/10 + ATK + DEF + SPD + 스킬 보너스
    return Math.floor(
      finalStats.hp / 10 +
      finalStats.atk +
      finalStats.def +
      finalStats.spd +
      skillBonus
    );
  }

  /**
   * 팀 전투력 계산
   * @param {Array} characters 캐릭터 배열
   * @returns {number} 총 전투력
   */
  static calculateTeamPower(characters) {
    return characters.reduce((total, char) => total + this.calculatePower(char), 0);
  }

  /**
   * 캐릭터 상세 정보
   * @param {string} characterId 캐릭터 ID
   * @returns {Object} 상세 정보
   */
  static getCharacterDetails(characterId) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) return null;

    const charData = getCharacter(characterId);
    const rarity = getRarityKey(character.rarity ?? charData?.rarity ?? 1);
    const maxLevel = this.MAX_LEVEL[rarity];
    const stats = this.getStatsAtLevel(characterId, character.level);
    const starBonus = this.getStarBonus(character.stars);
    const power = this.calculatePower(character);
    const expForNextLevel = this.getExpForLevel(character.level);

    return {
      ...character,
      rarity,
      maxLevel,
      stats,
      starBonus,
      power,
      expProgress: {
        current: character.exp,
        required: expForNextLevel,
        percent: Math.floor((character.exp / expForNextLevel) * 100)
      },
      skills: character.skillLevels.map((level, index) => ({
        index,
        level,
        maxLevel: this.MAX_SKILL_LEVEL,
        canEnhance: this.canEnhanceSkill(characterId, index).canEnhance
      })),
      evolution: {
        currentStars: character.stars,
        maxStars: this.MAX_STARS,
        canEvolve: this.canEvolve(characterId).canEvolve
      }
    };
  }

  /**
   * 레벨업 미리보기 (필요 경험치, 최종 스탯)
   * @param {string} characterId 캐릭터 ID
   * @param {number} targetLevel 목표 레벨
   * @returns {Object} 미리보기 정보
   */
  static previewLevelUp(characterId, targetLevel) {
    const character = SaveManager.getCharacter(characterId);
    if (!character) return null;

    const currentStats = this.getStatsAtLevel(characterId, character.level);
    const targetStats = this.getStatsAtLevel(characterId, targetLevel);

    let expNeeded = 0;
    for (let lv = character.level; lv < targetLevel; lv++) {
      expNeeded += this.getExpForLevel(lv);
    }
    expNeeded -= character.exp; // 현재 보유 경험치 제외

    return {
      currentLevel: character.level,
      targetLevel,
      expNeeded: Math.max(0, expNeeded),
      statsGain: {
        hp: targetStats.hp - currentStats.hp,
        atk: targetStats.atk - currentStats.atk,
        def: targetStats.def - currentStats.def,
        spd: targetStats.spd - currentStats.spd
      },
      powerGain: this.calculatePower({ ...character, level: targetLevel }) -
        this.calculatePower(character)
    };
  }
}

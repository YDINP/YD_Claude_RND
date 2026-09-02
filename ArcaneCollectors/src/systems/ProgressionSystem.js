/**
 * ProgressionSystem - 캐릭터 성장 시스템
 * 레벨업, 스킬 강화, 각성(진화) 관리
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import { getRarityKey } from '../utils/rarityUtils.js';
import { getCharacter, getCharacterOrHero } from '../data/index.js';
import { CollectionSystem } from './CollectionSystem.js';
import { EquipmentSystem } from './EquipmentSystem.js';

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

  // ===== 전투력 공식 상수 (BLK-03 통합 SSOT) =====

  /** 전투력에 산입되는 스탯 키 */
  static POWER_STAT_KEYS = ['hp', 'atk', 'def', 'spd'];

  /** 전투력 산식에서 HP를 나누는 값 (HP/10 + ATK + DEF + SPD) */
  static POWER_HP_DIVISOR = 10;

  /** 스킬 레벨 1당 전투력 가산치 */
  static POWER_PER_SKILL_LEVEL = 10;

  /** skillLevels 필드가 없는 레거시/신규 세이브의 기본값 */
  static DEFAULT_SKILL_LEVELS = [1, 1];

  /** 성급 미기재 시 등급에서 유도할 기본 성급 */
  static DEFAULT_STARS_BY_RARITY = { N: 1, R: 2, SR: 3, SSR: 4 };

  /** EquipmentSystem 스탯 키 → 전투력 스탯 키 매핑 (CRIT_*는 전투력 미산입) */
  static EQUIPMENT_STAT_MAP = { HP: 'hp', ATK: 'atk', DEF: 'def', SPD: 'spd' };

  /** 캐릭터 데이터를 찾지 못했을 때의 등급별 기본 스탯 폴백 */
  static FALLBACK_BASE_STATS = {
    N: { hp: 800, atk: 80, def: 40, spd: 95 },
    R: { hp: 1000, atk: 100, def: 50, spd: 100 },
    SR: { hp: 1200, atk: 120, def: 60, spd: 105 },
    SSR: { hp: 1500, atk: 150, def: 75, spd: 110 }
  };

  /** 폴백 성장률 (등급별) */
  static FALLBACK_GROWTH_STATS = {
    N: { hp: 80, atk: 8, def: 4, spd: 1 },
    R: { hp: 100, atk: 10, def: 5, spd: 1.5 },
    SR: { hp: 120, atk: 12, def: 6, spd: 2 },
    SSR: { hp: 150, atk: 15, def: 7.5, spd: 2.5 }
  };

  /** 스탯 0 객체 */
  static get ZERO_STATS() {
    return { hp: 0, atk: 0, def: 0, spd: 0 };
  }

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
    const charData = this.lookupCharacterData(characterId);
    let savedChar = null;
    try {
      savedChar = SaveManager.getCharacter(characterId);
    } catch {
      savedChar = null;
    }
    const rarity = getRarityKey(savedChar?.rarity ?? charData?.rarity ?? 1);

    return this.getBaseStatsAtLevel(charData, level, rarity);
  }

  /**
   * 캐릭터 ID로 원천 데이터를 조회한다.
   * 레거시 characters.json 뿐 아니라 base-heroes / ascended-heroes 까지 포함한다.
   * (기존 getCharacter() 단독 조회는 base_ / asc_ 접두 ID에서 undefined를 반환해
   *  모든 전직영웅이 N등급 폴백 스탯으로 계산되는 원인이었다 — BLK-03)
   * @param {string} characterId
   * @returns {Object|null}
   */
  static lookupCharacterData(characterId) {
    if (!characterId) return null;
    try {
      const hero = typeof getCharacterOrHero === 'function'
        ? getCharacterOrHero(characterId)
        : null;
      if (hero) return hero;
    } catch {
      // 데이터 모듈 미가용 — 아래 레거시 조회로 폴백
    }
    try {
      return getCharacter(characterId) || null;
    } catch {
      return null;
    }
  }

  /**
   * 전투력 계산에 쓰이는 캐릭터 원천 데이터를 해석한다.
   * 스탯을 직접 들고 있는 객체(JSON 캐릭터/정규화된 영웅)면 그대로 쓰고,
   * 세이브 레코드처럼 ID만 있으면 데이터 모듈에서 조회한다.
   * @param {Object} character
   * @returns {Object|null}
   */
  static resolveCharacterData(character) {
    if (!character) return null;
    if (character.stats) return character;
    return this.lookupCharacterData(character.characterId || character.id);
  }

  /**
   * 레벨 반영 기본 스탯 (성급·장비·컬렉션 이전 단계).
   * JSON의 stats + growthStats 가 있으면 그것을 쓰고, 없을 때만 등급 테이블로 폴백한다.
   * @param {Object|null} charData 캐릭터 원천 데이터
   * @param {number} level 레벨
   * @param {string} rarityKey 등급 키 (N/R/SR/SSR)
   * @returns {Object} { hp, atk, def, spd }
   */
  static getBaseStatsAtLevel(charData, level, rarityKey) {
    const lv = Math.max(1, Number(level) || 1);
    const levelSteps = lv - 1;

    const base = charData?.stats || this.FALLBACK_BASE_STATS[rarityKey] || this.FALLBACK_BASE_STATS.N;
    const growth = charData?.stats
      ? (charData.growthStats || this.ZERO_STATS)
      : (this.FALLBACK_GROWTH_STATS[rarityKey] || this.FALLBACK_GROWTH_STATS.N);

    const result = {};
    for (const key of this.POWER_STAT_KEYS) {
      result[key] = Math.floor((base[key] || 0) + (growth[key] || 0) * levelSteps);
    }
    return result;
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
   * COLL-01/C-4: 컬렉션 완성 보너스 배율 조회
   * 단위 보너스(Tier1 +3% / Tier2 +6%) + 계정 공용 보너스(10/10 완성 시 ATK·DEF +2%)
   * @param {Object} character 캐릭터 데이터
   * @returns {Object} { hp, atk, def, spd } 배율 (0 = 보너스 없음)
   */
  static getCollectionBonus(character) {
    const none = { hp: 0, atk: 0, def: 0, spd: 0 };
    if (!character) return none;
    try {
      const heroId = character.sourceBaseHeroId || character.characterId || character.id;
      return CollectionSystem.getStatMultipliers(heroId) || none;
    } catch {
      return none;
    }
  }

  /**
   * 캐릭터 최종 스탯 (성급 보너스 + 컬렉션 완성 보너스 반영)
   * 전투력 계산의 SSOT — 스탯 표시 UI도 이 메서드를 사용한다.
   * @param {Object} character 캐릭터 데이터
   * @returns {Object} { hp, atk, def, spd }
   */
  static getFinalStats(character) {
    if (!character) return this.ZERO_STATS;

    const charData = this.resolveCharacterData(character);
    const rarityKey = getRarityKey(character.rarity ?? charData?.rarity ?? 1);

    const stats = this.getBaseStatsAtLevel(charData, character.level, rarityKey);
    const starBonus = this.getStarBonus(this.resolveStars(character, rarityKey));
    const equipmentBonus = this.getEquipmentBonus(character);
    const collectionBonus = this.getCollectionBonus(character);

    // 적용 순서: 기본(레벨) → 성급(%) → 장비(가산) → 컬렉션(곱)
    const result = {};
    for (const key of this.POWER_STAT_KEYS) {
      const withStars = stats[key] * (1 + (starBonus[key] || 0) / 100);
      const withEquipment = withStars + (equipmentBonus[key] || 0);
      result[key] = Math.floor(withEquipment * (1 + (collectionBonus[key] || 0)));
    }
    return result;
  }

  /**
   * 성급 해석. 세이브에 stars가 없으면 등급에서 유도한다(레거시 세이브 안전장치).
   * @param {Object} character
   * @param {string} rarityKey
   * @returns {number} 성급
   */
  static resolveStars(character, rarityKey) {
    const stars = Number(character?.stars);
    if (Number.isFinite(stars) && stars > 0) return stars;
    return this.DEFAULT_STARS_BY_RARITY[rarityKey] || 1;
  }

  /**
   * BLK-03: 장착 장비의 스탯 합(기본 스탯 + 강화 보너스 + 장비 등급 배율)
   * EquipmentSystem.getTotalEquipmentStats()가 SSOT이며 여기서는 키 매핑만 한다.
   * @param {Object} character 캐릭터 데이터
   * @returns {Object} { hp, atk, def, spd } 가산치
   */
  static getEquipmentBonus(character) {
    const none = this.ZERO_STATS;
    if (!character) return none;

    // 호출부가 이미 합산한 장비 스탯을 넘긴 경우(전투 프리뷰 등) 그대로 사용
    if (character.equipmentStats) {
      return this.mapEquipmentStats(character.equipmentStats);
    }

    const heroId = character.characterId || character.id;
    if (!heroId) return none;

    try {
      return this.mapEquipmentStats(EquipmentSystem.getTotalEquipmentStats(heroId));
    } catch {
      return none;
    }
  }

  /**
   * EquipmentSystem 스탯 키(ATK/DEF/HP/SPD)를 전투력 스탯 키로 변환
   * @param {Object} equipmentStats
   * @returns {Object} { hp, atk, def, spd }
   */
  static mapEquipmentStats(equipmentStats) {
    const result = this.ZERO_STATS;
    if (!equipmentStats) return result;

    for (const [equipKey, statKey] of Object.entries(this.EQUIPMENT_STAT_MAP)) {
      result[statKey] += Number(equipmentStats[equipKey]) || 0;
    }
    return result;
  }

  /**
   * 스킬 레벨 배열 해석. 누락/비정상 시 기본값으로 대체한다.
   * @param {Object} character
   * @returns {Array<number>}
   */
  static resolveSkillLevels(character) {
    const levels = character?.skillLevels;
    if (!Array.isArray(levels) || levels.length === 0) {
      return [...this.DEFAULT_SKILL_LEVELS];
    }
    return levels.map(lv => Number(lv) || 0);
  }

  /**
   * 캐릭터 전투력 계산 — 프로젝트 전체의 SSOT (BLK-03)
   * 공식: floor(HP/10 + ATK + DEF + SPD + 스킬레벨합 × 10)
   * 스탯 적용 순서: 기본(레벨) → 성급(%) → 장비(가산) → 컬렉션(곱)
   * @param {Object} character 캐릭터 데이터 (세이브 레코드 또는 JSON 캐릭터)
   * @returns {number} 전투력
   */
  static calculatePower(character) {
    if (!character) return 0;

    const finalStats = this.getFinalStats(character);

    // 스킬 레벨 보너스 (skillLevels 누락 시 기본값 — 레거시 세이브 안전)
    const skillBonus = this.resolveSkillLevels(character)
      .reduce((sum, lv) => sum + lv, 0) * this.POWER_PER_SKILL_LEVEL;

    // 전투력 = HP/10 + ATK + DEF + SPD + 스킬 보너스
    return Math.floor(
      finalStats.hp / this.POWER_HP_DIVISOR +
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
      // COLL-01/C-4: 컬렉션 완성 보너스 (기존 stats 필드는 하위 호환 위해 유지)
      collectionBonus: this.getCollectionBonus(character),
      finalStats: this.getFinalStats(character),
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

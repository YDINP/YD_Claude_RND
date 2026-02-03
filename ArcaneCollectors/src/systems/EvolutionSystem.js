/**
 * EvolutionSystem - 영웅 진화 시스템
 * 등급 진화: N -> R -> SR -> SSR
 * 진화 조건: 같은 캐릭터 조각 + 골드
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';

export class EvolutionSystem {
  // 등급 순서
  static RARITY_ORDER = ['N', 'R', 'SR', 'SSR'];

  // 진화 비용 테이블
  static EVOLUTION_COSTS = {
    N: { shards: 10, gold: 1000 },     // N → R
    R: { shards: 20, gold: 5000 },     // R → SR
    SR: { shards: 50, gold: 20000 }    // SR → SSR
  };

  // 진화 시 스탯 보너스 (%)
  static EVOLUTION_STAT_BONUS = {
    N: { hp: 10, atk: 10, def: 10, spd: 5 },   // N → R 보너스
    R: { hp: 15, atk: 15, def: 15, spd: 8 },   // R → SR 보너스
    SR: { hp: 25, atk: 25, def: 25, spd: 12 }  // SR → SSR 보너스
  };

  // 진화 시 스킬 강화 레벨
  static SKILL_BOOST_ON_EVOLUTION = {
    N: 1,  // N → R: 스킬 +1
    R: 2,  // R → SR: 스킬 +2
    SR: 3  // SR → SSR: 스킬 +3
  };

  /**
   * 영웅 진화 가능 여부 확인
   * @param {string} heroId - 영웅 ID
   * @returns {Object} { canEvolve, reason, cost, currentShards }
   */
  static canEvolve(heroId) {
    const data = SaveManager.load();
    const character = data.characters?.find(c => c.id === heroId || c.characterId === heroId);

    if (!character) {
      return { canEvolve: false, reason: '캐릭터를 찾을 수 없습니다' };
    }

    const currentRarity = character.rarity;
    const rarityIndex = this.RARITY_ORDER.indexOf(currentRarity);

    // 최대 등급 체크
    if (rarityIndex >= this.RARITY_ORDER.length - 1) {
      return { canEvolve: false, reason: '이미 최고 등급입니다' };
    }

    // 진화 비용 확인
    const cost = this.getEvolutionCost(currentRarity);
    if (!cost) {
      return { canEvolve: false, reason: '진화할 수 없는 등급입니다' };
    }

    const resources = data.resources || {};
    const characterShards = resources.characterShards || {};
    const currentShards = characterShards[heroId] || 0;

    if ((resources.gold || 0) < cost.gold) {
      return {
        canEvolve: false,
        reason: `골드가 부족합니다 (${cost.gold} 필요)`,
        cost,
        currentShards,
        currentGold: resources.gold || 0
      };
    }

    if (currentShards < cost.shards) {
      return {
        canEvolve: false,
        reason: `조각이 부족합니다 (${currentShards}/${cost.shards})`,
        cost,
        currentShards,
        currentGold: resources.gold || 0
      };
    }

    return {
      canEvolve: true,
      cost,
      currentShards,
      currentGold: resources.gold || 0,
      nextRarity: this.RARITY_ORDER[rarityIndex + 1]
    };
  }

  /**
   * 영웅 진화 실행
   * @param {string} heroId - 영웅 ID
   * @returns {Object} 진화 결과
   */
  static evolve(heroId) {
    const checkResult = this.canEvolve(heroId);
    if (!checkResult.canEvolve) {
      return { success: false, error: checkResult.reason };
    }

    const data = SaveManager.load();
    const character = data.characters?.find(c => c.id === heroId || c.characterId === heroId);
    const currentRarity = character.rarity;
    const rarityIndex = this.RARITY_ORDER.indexOf(currentRarity);
    const nextRarity = this.RARITY_ORDER[rarityIndex + 1];

    // 비용 차감
    const cost = checkResult.cost;
    data.resources.gold -= cost.gold;
    if (!data.resources.characterShards) {
      data.resources.characterShards = {};
    }
    data.resources.characterShards[heroId] = (data.resources.characterShards[heroId] || 0) - cost.shards;

    // 등급 업그레이드
    const previousRarity = character.rarity;
    character.rarity = nextRarity;

    // 스탯 보너스 적용
    const statBonus = this.EVOLUTION_STAT_BONUS[currentRarity];
    if (statBonus && character.stats) {
      character.stats.hp = Math.floor(character.stats.hp * (1 + statBonus.hp / 100));
      character.stats.atk = Math.floor(character.stats.atk * (1 + statBonus.atk / 100));
      character.stats.def = Math.floor(character.stats.def * (1 + statBonus.def / 100));
      character.stats.spd = Math.floor(character.stats.spd * (1 + statBonus.spd / 100));
    }

    // 스킬 레벨 보너스
    const skillBoost = this.SKILL_BOOST_ON_EVOLUTION[currentRarity] || 0;
    if (character.skillLevels && skillBoost > 0) {
      character.skillLevels = character.skillLevels.map(lv => Math.min(10, lv + skillBoost));
    }

    // 진화 횟수 기록
    character.evolutionCount = (character.evolutionCount || 0) + 1;
    character.lastEvolution = Date.now();

    SaveManager.save(data);

    EventBus.emit(GameEvents.HERO_EVOLVED || 'heroEvolved', {
      heroId,
      previousRarity,
      newRarity: nextRarity,
      statBonus,
      skillBoost
    });

    return {
      success: true,
      heroId,
      previousRarity,
      newRarity: nextRarity,
      statBonus,
      skillBoost,
      cost
    };
  }

  /**
   * 특정 등급의 진화 비용 조회
   * @param {string} currentRarity - 현재 등급
   * @returns {Object|null} { shards, gold } 또는 null
   */
  static getEvolutionCost(currentRarity) {
    return this.EVOLUTION_COSTS[currentRarity] || null;
  }

  /**
   * 진화 미리보기 (최종 스탯 확인)
   * @param {string} heroId - 영웅 ID
   * @returns {Object} 진화 후 예상 스탯
   */
  static previewEvolution(heroId) {
    const data = SaveManager.load();
    const character = data.characters?.find(c => c.id === heroId || c.characterId === heroId);

    if (!character) {
      return null;
    }

    const currentRarity = character.rarity;
    const rarityIndex = this.RARITY_ORDER.indexOf(currentRarity);

    if (rarityIndex >= this.RARITY_ORDER.length - 1) {
      return null;
    }

    const nextRarity = this.RARITY_ORDER[rarityIndex + 1];
    const statBonus = this.EVOLUTION_STAT_BONUS[currentRarity];
    const skillBoost = this.SKILL_BOOST_ON_EVOLUTION[currentRarity] || 0;

    const currentStats = character.stats || { hp: 0, atk: 0, def: 0, spd: 0 };
    const previewStats = {
      hp: Math.floor(currentStats.hp * (1 + statBonus.hp / 100)),
      atk: Math.floor(currentStats.atk * (1 + statBonus.atk / 100)),
      def: Math.floor(currentStats.def * (1 + statBonus.def / 100)),
      spd: Math.floor(currentStats.spd * (1 + statBonus.spd / 100))
    };

    const currentSkillLevels = character.skillLevels || [1, 1];
    const previewSkillLevels = currentSkillLevels.map(lv => Math.min(10, lv + skillBoost));

    return {
      currentRarity,
      nextRarity,
      currentStats,
      previewStats,
      statGain: {
        hp: previewStats.hp - currentStats.hp,
        atk: previewStats.atk - currentStats.atk,
        def: previewStats.def - currentStats.def,
        spd: previewStats.spd - currentStats.spd
      },
      currentSkillLevels,
      previewSkillLevels,
      skillBoost
    };
  }

  /**
   * 캐릭터 조각 추가
   * @param {string} heroId - 영웅 ID
   * @param {number} amount - 조각 수
   * @returns {Object} 결과
   */
  static addShards(heroId, amount) {
    if (amount <= 0) {
      return { success: false, error: '유효하지 않은 조각 수입니다' };
    }

    const data = SaveManager.load();

    if (!data.resources) {
      data.resources = {};
    }
    if (!data.resources.characterShards) {
      data.resources.characterShards = {};
    }

    const currentShards = data.resources.characterShards[heroId] || 0;
    data.resources.characterShards[heroId] = currentShards + amount;

    SaveManager.save(data);

    return {
      success: true,
      heroId,
      previousShards: currentShards,
      addedShards: amount,
      totalShards: currentShards + amount
    };
  }

  /**
   * 캐릭터 조각 수 조회
   * @param {string} heroId - 영웅 ID
   * @returns {number} 조각 수
   */
  static getShards(heroId) {
    const data = SaveManager.load();
    return data.resources?.characterShards?.[heroId] || 0;
  }

  /**
   * 모든 진화 경로 정보 조회
   * @returns {Array} 진화 경로 정보
   */
  static getAllEvolutionPaths() {
    return [
      {
        from: 'N',
        to: 'R',
        cost: this.EVOLUTION_COSTS.N,
        statBonus: this.EVOLUTION_STAT_BONUS.N,
        skillBoost: this.SKILL_BOOST_ON_EVOLUTION.N
      },
      {
        from: 'R',
        to: 'SR',
        cost: this.EVOLUTION_COSTS.R,
        statBonus: this.EVOLUTION_STAT_BONUS.R,
        skillBoost: this.SKILL_BOOST_ON_EVOLUTION.R
      },
      {
        from: 'SR',
        to: 'SSR',
        cost: this.EVOLUTION_COSTS.SR,
        statBonus: this.EVOLUTION_STAT_BONUS.SR,
        skillBoost: this.SKILL_BOOST_ON_EVOLUTION.SR
      }
    ];
  }

  /**
   * 최대 등급 도달 여부
   * @param {string} rarity - 현재 등급
   * @returns {boolean}
   */
  static isMaxRarity(rarity) {
    const index = this.RARITY_ORDER.indexOf(rarity);
    return index >= this.RARITY_ORDER.length - 1;
  }
}

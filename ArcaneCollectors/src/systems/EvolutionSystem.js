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

  // ========== T-C8: 첫 각인 보증 (SYSTEM_ONBOARDING_ECONOMY §1-6) ==========
  //
  // 레이어 2 재화(기관 에센스 / 각인서 / 각성의 불꽃)는 현재 획득처가 없다.
  // 첫 전직이 재화 부족으로 영구히 막히는 것을 막기 위해,
  // "기관 선택 확정 순간"에 부족분만 1회 한정으로 보전한다.
  // 두 번째 각인부터는 보전하지 않는다 (정상 경제).

  /**
   * 각인 루트의 레이어 2 요구 재화 조회
   * @param {string} baseHeroId - 기본영웅 ID
   * @param {string} cultId - 기관 ID
   * @returns {Object|null} { ascendedHeroId, cultEssence, institutionSeal, awakeningFlame }
   */
  static getAscensionRouteCost(baseHeroId, cultId) {
    const heroData = SaveManager.getBaseHeroData(baseHeroId);
    if (!heroData) return null;

    const route = (heroData.ascensionRoutes || []).find(r => r.cultId === cultId);
    if (!route) return null;

    const ascData = SaveManager.getAscendedHeroData(route.ascendedHeroId);
    const cost = (ascData && ascData.acquisitionCost) || {};

    return {
      ascendedHeroId: route.ascendedHeroId,
      cultEssence: cost.cultEssence || {},
      institutionSeal: cost.institutionSeal || 0,
      awakeningFlame: cost.awakeningFlame || 0
    };
  }

  /**
   * 첫 각인 보증을 아직 사용할 수 있는지 확인
   * @returns {boolean}
   */
  static isFirstAscensionGuaranteeAvailable() {
    const data = SaveManager.load();
    return data.onboarding?.firstAscensionGrantUsed !== true;
  }

  /**
   * 보증 대상 부족분 계산 (지급하지 않고 계산만)
   * @param {string} baseHeroId - 기본영웅 ID
   * @param {string} cultId - 기관 ID
   * @returns {Object|null} { institutionSeal, awakeningFlame, cultEssence: { [cultId]: n }, hasShortfall }
   */
  static getFirstAscensionShortfall(baseHeroId, cultId) {
    const cost = this.getAscensionRouteCost(baseHeroId, cultId);
    if (!cost) return null;

    const resources = SaveManager.load().resources || {};
    const ownedEssence = resources.cultEssence || {};

    const shortfall = {
      institutionSeal: Math.max(0, cost.institutionSeal - (resources.institutionSeal || 0)),
      awakeningFlame: Math.max(0, cost.awakeningFlame - (resources.awakeningFlame || 0)),
      cultEssence: {}
    };

    Object.entries(cost.cultEssence).forEach(([essenceCultId, required]) => {
      const lack = Math.max(0, required - (ownedEssence[essenceCultId] || 0));
      if (lack > 0) shortfall.cultEssence[essenceCultId] = lack;
    });

    shortfall.hasShortfall =
      shortfall.institutionSeal > 0 ||
      shortfall.awakeningFlame > 0 ||
      Object.keys(shortfall.cultEssence).length > 0;

    return shortfall;
  }

  /**
   * 첫 각인 보증 적용 — 부족분을 필요량까지 보전하고 계정당 1회로 플래그를 잠근다.
   * 각인 확정(기관 선택 확정) 직전에 호출한다.
   * @param {string} baseHeroId - 기본영웅 ID
   * @param {string} cultId - 기관 ID
   * @returns {Object} { applied, reason?, granted? }
   */
  static applyFirstAscensionGuarantee(baseHeroId, cultId) {
    const data = SaveManager.load();

    if (!data.onboarding || typeof data.onboarding !== 'object') {
      data.onboarding = SaveManager._createDefaultOnboarding();
    }
    if (data.onboarding.firstAscensionGrantUsed === true) {
      return { applied: false, reason: 'already_used' };
    }

    const shortfall = this.getFirstAscensionShortfall(baseHeroId, cultId);
    if (!shortfall) {
      return { applied: false, reason: 'invalid_route' };
    }

    if (!data.resources) data.resources = {};
    if (!data.resources.cultEssence || typeof data.resources.cultEssence !== 'object') {
      data.resources.cultEssence = {};
    }

    data.resources.institutionSeal = (data.resources.institutionSeal || 0) + shortfall.institutionSeal;
    data.resources.awakeningFlame = (data.resources.awakeningFlame || 0) + shortfall.awakeningFlame;
    Object.entries(shortfall.cultEssence).forEach(([essenceCultId, lack]) => {
      data.resources.cultEssence[essenceCultId] =
        (data.resources.cultEssence[essenceCultId] || 0) + lack;
    });

    // 보전량이 0이어도 "첫 각인은 1회뿐"이라는 성질은 동일하게 소모된다.
    data.onboarding.firstAscensionGrantUsed = true;
    data.onboarding.firstAscensionCultId = cultId;

    SaveManager.save(data);

    EventBus.emit(GameEvents.FIRST_ASCENSION_GRANTED || 'firstAscensionGranted', {
      baseHeroId,
      cultId,
      granted: shortfall
    });

    return {
      applied: true,
      granted: {
        institutionSeal: shortfall.institutionSeal,
        awakeningFlame: shortfall.awakeningFlame,
        cultEssence: shortfall.cultEssence
      }
    };
  }
}

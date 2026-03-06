/**
 * EquipmentSystem - 장비 시스템
 * 장비 장착, 해제, 강화 관리
 */
import { SaveManager } from './SaveManager.js';
import { EventBus, GameEvents } from './EventBus.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_RARITY } from '../config/gameConfig.js';

export class EquipmentSystem {
  // 장비 슬롯 타입
  static SLOTS = ['weapon', 'armor', 'accessory', 'relic'];

  // 장비 스탯 종류
  static STAT_TYPES = ['ATK', 'DEF', 'HP', 'SPD', 'CRIT_RATE', 'CRIT_DMG'];

  // 강화 최대 레벨
  static MAX_ENHANCE_LEVEL = 15;

  /**
   * 장비를 캐릭터에 장착
   * @param {string} heroId - 영웅 ID
   * @param {string} slotType - 슬롯 타입 (weapon, armor, accessory, relic)
   * @param {string} equipmentId - 장비 ID
   * @returns {Object} 결과
   */
  static equip(heroId, slotType, equipmentId) {
    if (!this.SLOTS.includes(slotType)) {
      return { success: false, error: '유효하지 않은 슬롯 타입입니다' };
    }

    const data = SaveManager.load();
    const character = data.characters?.find(c => c.id === heroId || c.characterId === heroId);

    if (!character) {
      return { success: false, error: '캐릭터를 찾을 수 없습니다' };
    }

    const equipment = data.inventory?.equipment?.find(e => e.id === equipmentId);

    if (!equipment) {
      return { success: false, error: '장비를 찾을 수 없습니다' };
    }

    if (equipment.slotType !== slotType) {
      return { success: false, error: '슬롯 타입이 일치하지 않습니다' };
    }

    // 이미 장착된 장비가 있으면 해제
    const currentEquipped = character.equipment?.[slotType];
    if (currentEquipped) {
      this.unequip(heroId, slotType);
    }

    // 다른 캐릭터가 장착 중이면 해제
    if (equipment.equippedBy && equipment.equippedBy !== heroId) {
      this.unequip(equipment.equippedBy, slotType);
    }

    // 장착 처리
    if (!character.equipment) {
      character.equipment = {};
    }
    character.equipment[slotType] = equipmentId;
    equipment.equippedBy = heroId;

    SaveManager.save(data);

    EventBus.emit(GameEvents.EQUIPMENT_CHANGED, {
      heroId,
      slotType,
      equipmentId,
      action: 'equip'
    });

    return {
      success: true,
      heroId,
      slotType,
      equipment,
      stats: this.getEquipmentStats(equipment)
    };
  }

  /**
   * 장비 해제
   * @param {string} heroId - 영웅 ID
   * @param {string} slotType - 슬롯 타입
   * @returns {Object} 결과
   */
  static unequip(heroId, slotType) {
    if (!this.SLOTS.includes(slotType)) {
      return { success: false, error: '유효하지 않은 슬롯 타입입니다' };
    }

    const data = SaveManager.load();
    const character = data.characters?.find(c => c.id === heroId || c.characterId === heroId);

    if (!character) {
      return { success: false, error: '캐릭터를 찾을 수 없습니다' };
    }

    const equippedId = character.equipment?.[slotType];
    if (!equippedId) {
      return { success: false, error: '해당 슬롯에 장착된 장비가 없습니다' };
    }

    const equipment = data.inventory?.equipment?.find(e => e.id === equippedId);

    // 장비 해제
    character.equipment[slotType] = null;
    if (equipment) {
      equipment.equippedBy = null;
    }

    SaveManager.save(data);

    EventBus.emit(GameEvents.EQUIPMENT_CHANGED, {
      heroId,
      slotType,
      equipmentId: equippedId,
      action: 'unequip'
    });

    return { success: true, heroId, slotType, unequippedId: equippedId };
  }

  /**
   * 장비 강화
   * @param {string} equipmentId - 장비 ID
   * @param {Object} material - 강화 재료 { gold, enhanceStones }
   * @returns {Object} 결과
   */
  static enhance(equipmentId, material = {}) {
    const data = SaveManager.load();
    const equipment = data.inventory?.equipment?.find(e => e.id === equipmentId);

    if (!equipment) {
      return { success: false, error: '장비를 찾을 수 없습니다' };
    }

    const currentLevel = equipment.enhanceLevel || 0;

    if (currentLevel >= this.MAX_ENHANCE_LEVEL) {
      return { success: false, error: '이미 최대 강화 레벨입니다' };
    }

    // 강화 비용 계산
    const cost = this.getEnhanceCost(currentLevel, equipment.rarity);
    const resources = data.resources || {};

    if ((resources.gold || 0) < cost.gold) {
      return { success: false, error: `골드가 부족합니다 (${cost.gold} 필요)` };
    }

    if ((resources.enhanceStones || 0) < cost.enhanceStones) {
      return { success: false, error: `강화석이 부족합니다 (${cost.enhanceStones} 필요)` };
    }

    // 강화 성공 확률 계산
    const successRate = this.getEnhanceSuccessRate(currentLevel);
    const isSuccess = Math.random() < successRate;

    // 비용 차감
    resources.gold = (resources.gold || 0) - cost.gold;
    resources.enhanceStones = (resources.enhanceStones || 0) - cost.enhanceStones;

    if (isSuccess) {
      equipment.enhanceLevel = currentLevel + 1;

      // 스탯 업그레이드
      const statBonus = this.getEnhanceStatBonus(equipment);
      if (!equipment.enhancedStats) {
        equipment.enhancedStats = {};
      }
      for (const [stat, value] of Object.entries(statBonus)) {
        equipment.enhancedStats[stat] = (equipment.enhancedStats[stat] || 0) + value;
      }
    }

    SaveManager.save(data);

    return {
      success: true,
      enhanceSuccess: isSuccess,
      newLevel: isSuccess ? currentLevel + 1 : currentLevel,
      cost,
      successRate: Math.floor(successRate * 100)
    };
  }

  /**
   * 캐릭터의 장착된 장비 목록 조회
   * @param {string} heroId - 영웅 ID
   * @returns {Object} 슬롯별 장비 정보
   */
  static getEquippedItems(heroId) {
    const data = SaveManager.load();
    const character = data.characters?.find(c => c.id === heroId || c.characterId === heroId);

    if (!character || !character.equipment) {
      return {
        weapon: null,
        armor: null,
        accessory: null,
        relic: null
      };
    }

    const equipped = {};
    for (const slot of this.SLOTS) {
      const equipId = character.equipment[slot];
      if (equipId) {
        const equipment = data.inventory?.equipment?.find(e => e.id === equipId);
        equipped[slot] = equipment || null;
      } else {
        equipped[slot] = null;
      }
    }

    return equipped;
  }

  /**
   * 장비 스탯 계산
   * @param {Object} equipment - 장비 데이터
   * @returns {Object} 최종 스탯
   */
  static getEquipmentStats(equipment) {
    if (!equipment) return {};

    const baseStats = equipment.stats || {};
    const enhancedStats = equipment.enhancedStats || {};
    const rarityMultiplier = EQUIPMENT_RARITY[equipment.rarity]?.multiplier || 1.0;

    const finalStats = {};
    for (const stat of this.STAT_TYPES) {
      const base = baseStats[stat] || 0;
      const enhanced = enhancedStats[stat] || 0;
      finalStats[stat] = Math.floor((base + enhanced) * rarityMultiplier);
    }

    return finalStats;
  }

  /**
   * 캐릭터의 장비 보너스 스탯 합계
   * @param {string} heroId - 영웅 ID
   * @returns {Object} 총 장비 스탯
   */
  static getTotalEquipmentStats(heroId) {
    const equipped = this.getEquippedItems(heroId);
    const totalStats = {};

    for (const stat of this.STAT_TYPES) {
      totalStats[stat] = 0;
    }

    for (const slot of this.SLOTS) {
      const equipment = equipped[slot];
      if (equipment) {
        const stats = this.getEquipmentStats(equipment);
        for (const [stat, value] of Object.entries(stats)) {
          totalStats[stat] = (totalStats[stat] || 0) + value;
        }
      }
    }

    return totalStats;
  }

  /**
   * 강화 비용 계산
   * @param {number} currentLevel - 현재 강화 레벨
   * @param {string} rarity - 장비 등급
   * @returns {Object} { gold, enhanceStones }
   */
  static getEnhanceCost(currentLevel, rarity) {
    const rarityMult = { N: 1, R: 1.5, SR: 2, SSR: 3 };
    const mult = rarityMult[rarity] || 1;

    return {
      gold: Math.floor(500 * (currentLevel + 1) * mult),
      enhanceStones: Math.floor((currentLevel + 1) * mult)
    };
  }

  /**
   * 강화 성공률 계산
   * @param {number} currentLevel - 현재 강화 레벨
   * @returns {number} 성공률 (0~1)
   */
  static getEnhanceSuccessRate(currentLevel) {
    // 레벨이 높을수록 성공률 감소
    const baseRate = 1.0;
    const decay = 0.05;
    return Math.max(0.3, baseRate - (currentLevel * decay));
  }

  /**
   * 강화 시 증가하는 스탯 계산
   * @param {Object} equipment - 장비 데이터
   * @returns {Object} 증가 스탯
   */
  static getEnhanceStatBonus(equipment) {
    const bonus = {};
    const baseStats = equipment.stats || {};

    // 주 스탯의 5% 증가
    for (const [stat, value] of Object.entries(baseStats)) {
      if (value > 0) {
        bonus[stat] = Math.floor(value * 0.05);
      }
    }

    return bonus;
  }

  /**
   * 슬롯에 맞는 장비 목록 조회
   * @param {string} slotType - 슬롯 타입
   * @returns {Array} 장비 목록
   */
  static getEquipmentBySlot(slotType) {
    const data = SaveManager.load();
    const allEquipment = data.inventory?.equipment || [];

    return allEquipment.filter(e => e.slotType === slotType && !e.equippedBy);
  }

  /**
   * 새 장비 생성 (드랍 등)
   * @param {string} slotType - 슬롯 타입
   * @param {string} rarity - 등급
   * @param {Object} options - 추가 옵션
   * @returns {Object} 생성된 장비
   */
  static createEquipment(slotType, rarity, options = {}) {
    const id = `equip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 기본 스탯 생성
    const baseStats = this.generateBaseStats(slotType, rarity);

    const equipment = {
      id,
      slotType,
      rarity,
      name: options.name || this.generateEquipmentName(slotType, rarity),
      stats: baseStats,
      enhanceLevel: 0,
      enhancedStats: {},
      equippedBy: null,
      createdAt: Date.now()
    };

    // 인벤토리에 추가
    const data = SaveManager.load();
    if (!data.inventory) data.inventory = {};
    if (!data.inventory.equipment) data.inventory.equipment = [];

    data.inventory.equipment.push(equipment);
    SaveManager.save(data);

    return equipment;
  }

  /**
   * 슬롯과 등급에 따른 기본 스탯 생성
   * @param {string} slotType - 슬롯 타입
   * @param {string} rarity - 등급
   * @returns {Object} 기본 스탯
   */
  static generateBaseStats(slotType, rarity) {
    const rarityMult = { N: 1, R: 1.5, SR: 2, SSR: 3 };
    const mult = rarityMult[rarity] || 1;

    const slotStats = {
      weapon: { ATK: 50, CRIT_RATE: 5, CRIT_DMG: 10 },
      armor: { HP: 200, DEF: 30 },
      accessory: { SPD: 10, CRIT_RATE: 3, CRIT_DMG: 5 },
      relic: { HP: 100, ATK: 25, DEF: 15, SPD: 5 }
    };

    const base = slotStats[slotType] || {};
    const stats = {};

    for (const [stat, value] of Object.entries(base)) {
      stats[stat] = Math.floor(value * mult);
    }

    return stats;
  }

  /**
   * 장비 이름 생성
   * @param {string} slotType - 슬롯 타입
   * @param {string} rarity - 등급
   * @returns {string} 장비 이름
   */
  static generateEquipmentName(slotType, rarity) {
    const prefixes = {
      N: ['일반', '기본'],
      R: ['희귀한', '강화된'],
      SR: ['영웅의', '전설의'],
      SSR: ['신화의', '신성한']
    };

    const suffixes = {
      weapon: ['검', '도끼', '창', '지팡이'],
      armor: ['갑옷', '로브', '판금갑', '가죽갑'],
      accessory: ['반지', '목걸이', '귀걸이', '팔찌'],
      relic: ['부적', '유물', '성물', '보주']
    };

    const prefix = prefixes[rarity]?.[Math.floor(Math.random() * prefixes[rarity].length)] || '일반';
    const suffix = suffixes[slotType]?.[Math.floor(Math.random() * suffixes[slotType].length)] || '아이템';

    return `${prefix} ${suffix}`;
  }
}

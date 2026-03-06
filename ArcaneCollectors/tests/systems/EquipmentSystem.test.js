/**
 * EquipmentSystem.test.js
 * Unit tests for EquipmentSystem - 장비 시스템
 * QAT-T3-4: 18 tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EquipmentSystem } from '../../src/systems/EquipmentSystem.js';
import { SaveManager } from '../../src/systems/SaveManager.js';

// Mock EventBus to avoid Phaser dependencies
vi.mock('../../src/systems/EventBus.js', () => ({
  EventBus: {
    emit: vi.fn()
  },
  GameEvents: {
    EQUIPMENT_CHANGED: 'equipment_changed'
  }
}));

// Mock gameConfig to avoid Phaser dependencies
vi.mock('../../src/config/gameConfig.js', () => ({
  EQUIPMENT_SLOTS: ['weapon', 'armor', 'accessory', 'relic'],
  EQUIPMENT_RARITY: {
    N: { multiplier: 1.0 },
    R: { multiplier: 1.5 },
    SR: { multiplier: 2.0 },
    SSR: { multiplier: 3.0 }
  }
}));

describe('EquipmentSystem', () => {
  let mockLocalStorage;

  beforeEach(() => {
    // Mock localStorage
    mockLocalStorage = {
      data: {},
      getItem(key) {
        return this.data[key] || null;
      },
      setItem(key, value) {
        this.data[key] = value;
      },
      removeItem(key) {
        delete this.data[key];
      },
      clear() {
        this.data = {};
      }
    };

    vi.stubGlobal('localStorage', mockLocalStorage);

    // Setup test data
    const data = SaveManager.getDefaultSave();
    data.characters = [
      { id: 'hero_1', characterId: 'hero_1', equipment: {} }
    ];
    data.inventory = {
      equipment: [
        {
          id: 'weapon_1',
          slotType: 'weapon',
          rarity: 'R',
          stats: { ATK: 50 },
          equippedBy: null
        },
        {
          id: 'armor_1',
          slotType: 'armor',
          rarity: 'SR',
          stats: { HP: 200, DEF: 30 },
          equippedBy: null
        },
        {
          id: 'weapon_2',
          slotType: 'weapon',
          rarity: 'SSR',
          stats: { ATK: 100, CRIT_RATE: 5 },
          equippedBy: null
        }
      ]
    };
    SaveManager.save(data);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('equip() 기본 동작', () => {
    it('equips item to hero successfully', () => {
      const result = EquipmentSystem.equip('hero_1', 'weapon', 'weapon_1');

      expect(result.success).toBe(true);
      expect(result.heroId).toBe('hero_1');
      expect(result.equipment.id).toBe('weapon_1');
    });

    it('returns error for invalid slot type', () => {
      const result = EquipmentSystem.equip('hero_1', 'invalid_slot', 'weapon_1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('유효하지 않은 슬롯 타입');
    });

    it('returns error for non-existent hero', () => {
      const result = EquipmentSystem.equip('hero_999', 'weapon', 'weapon_1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('캐릭터를 찾을 수 없습니다');
    });

    it('returns error for non-existent equipment', () => {
      const result = EquipmentSystem.equip('hero_1', 'weapon', 'weapon_999');

      expect(result.success).toBe(false);
      expect(result.error).toContain('장비를 찾을 수 없습니다');
    });

    it('returns error for mismatched slot type', () => {
      const result = EquipmentSystem.equip('hero_1', 'armor', 'weapon_1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('슬롯 타입이 일치하지 않습니다');
    });
  });

  describe('unequip() 기본 동작', () => {
    it('unequips item successfully', () => {
      EquipmentSystem.equip('hero_1', 'weapon', 'weapon_1');

      const result = EquipmentSystem.unequip('hero_1', 'weapon');

      expect(result.success).toBe(true);
      expect(result.unequippedId).toBe('weapon_1');
    });

    it('returns error when slot is empty', () => {
      const result = EquipmentSystem.unequip('hero_1', 'weapon');

      expect(result.success).toBe(false);
      expect(result.error).toContain('장착된 장비가 없습니다');
    });

    it('returns error for invalid slot', () => {
      const result = EquipmentSystem.unequip('hero_1', 'invalid_slot');

      expect(result.success).toBe(false);
      expect(result.error).toContain('유효하지 않은 슬롯 타입');
    });
  });

  describe('장비 스탯 적용 정확성', () => {
    it('applies equipment stats correctly', () => {
      const equipment = {
        stats: { ATK: 50, HP: 100 },
        enhancedStats: { ATK: 10 },
        rarity: 'R'
      };

      const finalStats = EquipmentSystem.getEquipmentStats(equipment);

      expect(finalStats.ATK).toBeGreaterThan(50);
    });

    it('increases stats after equipping', () => {
      const initialStats = EquipmentSystem.getTotalEquipmentStats('hero_1');

      EquipmentSystem.equip('hero_1', 'weapon', 'weapon_1');
      const afterStats = EquipmentSystem.getTotalEquipmentStats('hero_1');

      expect(afterStats.ATK).toBeGreaterThan(initialStats.ATK);
    });

    it('restores stats after unequipping', () => {
      EquipmentSystem.equip('hero_1', 'weapon', 'weapon_1');
      const equippedStats = EquipmentSystem.getTotalEquipmentStats('hero_1');

      EquipmentSystem.unequip('hero_1', 'weapon');
      const afterStats = EquipmentSystem.getTotalEquipmentStats('hero_1');

      expect(afterStats.ATK).toBeLessThan(equippedStats.ATK);
    });
  });

  describe('이미 장착된 장비 교체', () => {
    it('replaces existing equipment when equipping new item', () => {
      EquipmentSystem.equip('hero_1', 'weapon', 'weapon_1');

      const result = EquipmentSystem.equip('hero_1', 'weapon', 'weapon_2');

      expect(result.success).toBe(true);
      expect(result.equipment.id).toBe('weapon_2');

      // Verify new equipment is equipped
      const equipped = EquipmentSystem.getEquippedItems('hero_1');
      expect(equipped.weapon.id).toBe('weapon_2');
    });
  });

  describe('빈 슬롯 처리', () => {
    it('returns null for empty slot', () => {
      const equipped = EquipmentSystem.getEquippedItems('hero_1');

      expect(equipped.weapon).toBeNull();
      expect(equipped.armor).toBeNull();
      expect(equipped.accessory).toBeNull();
      expect(equipped.relic).toBeNull();
    });
  });

  describe('존재하지 않는 장비 ID 처리', () => {
    it('handles missing equipment gracefully', () => {
      const data = SaveManager.load();
      data.characters[0].equipment = { weapon: 'non_existent' };
      SaveManager.save(data);

      const equipped = EquipmentSystem.getEquippedItems('hero_1');

      expect(equipped.weapon).toBeNull();
    });
  });

  describe('장비 타입별 슬롯 검증', () => {
    it('validates weapon slot correctly', () => {
      const result = EquipmentSystem.equip('hero_1', 'weapon', 'weapon_1');

      expect(result.success).toBe(true);
    });

    it('validates armor slot correctly', () => {
      const result = EquipmentSystem.equip('hero_1', 'armor', 'armor_1');

      expect(result.success).toBe(true);
    });

    it('rejects armor in weapon slot', () => {
      const result = EquipmentSystem.equip('hero_1', 'weapon', 'armor_1');

      expect(result.success).toBe(false);
    });
  });

  describe('강화 시스템', () => {
    it('calculates enhancement cost correctly', () => {
      const cost = EquipmentSystem.getEnhanceCost(0, 'R');

      expect(cost.gold).toBeGreaterThan(0);
      expect(cost.enhanceStones).toBeGreaterThan(0);
    });

    it('calculates enhancement success rate', () => {
      const rate = EquipmentSystem.getEnhanceSuccessRate(0);

      expect(rate).toBeGreaterThanOrEqual(0.3);
      expect(rate).toBeLessThanOrEqual(1.0);
    });
  });
});

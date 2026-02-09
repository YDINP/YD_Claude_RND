/**
 * SaveManager.test.js
 * Unit tests for SaveManager - 저장 및 로드 시스템
 * QAT-T3-1: 18 tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SaveManager } from '../../src/systems/SaveManager.js';

describe('SaveManager', () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('save/load 기본 동작', () => {
    it('saves data to localStorage', () => {
      const testData = SaveManager.getDefaultSave();
      testData.resources.gold = 5000;

      const result = SaveManager.save(testData);

      expect(result).toBe(true);
      expect(mockLocalStorage.getItem(SaveManager.SAVE_KEY)).toBeTruthy();
    });

    it('loads data from localStorage', () => {
      const testData = SaveManager.getDefaultSave();
      testData.resources.gold = 7500;
      SaveManager.save(testData);

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.resources.gold).toBe(7500);
    });

    it('returns default data when no save exists', () => {
      mockLocalStorage.clear();

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.resources.gold).toBe(10000);
    });
  });

  describe('데이터 무결성', () => {
    it('maintains data integrity after save/load cycle', () => {
      const original = SaveManager.getDefaultSave();
      original.player.name = 'TestHero';
      original.player.level = 5;
      original.resources.gold = 12345;
      original.resources.gems = 678;

      SaveManager.save(original);
      const loaded = SaveManager.load();

      expect(loaded.player.name).toBe('TestHero');
      expect(loaded.player.level).toBe(5);
      expect(loaded.resources.gold).toBe(12345);
      expect(loaded.resources.gems).toBe(678);
    });

    it('preserves ownedHeroes array', () => {
      const data = SaveManager.getDefaultSave();
      data.characters = [
        { characterId: 'hero_1', level: 1 },
        { characterId: 'hero_2', level: 3 }
      ];

      SaveManager.save(data);
      const loaded = SaveManager.load();

      expect(loaded.characters).toHaveLength(2);
      expect(loaded.characters[0].characterId).toBe('hero_1');
      expect(loaded.characters[1].level).toBe(3);
    });

    it('preserves gold, exp, and level', () => {
      const data = SaveManager.getDefaultSave();
      data.resources.gold = 99999;
      data.player.exp = 5000;
      data.player.level = 10;

      SaveManager.save(data);
      const loaded = SaveManager.load();

      expect(loaded.resources.gold).toBe(99999);
      expect(loaded.player.exp).toBe(5000);
      expect(loaded.player.level).toBe(10);
    });
  });

  describe('마이그레이션 핸들링', () => {
    it('migrates old version save data', () => {
      const oldData = {
        version: 0,
        player: { name: 'OldPlayer', level: 1, exp: 0 },
        resources: { gold: 500 }
      };

      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.player.name).toBe('OldPlayer');
      expect(loaded.resources.gold).toBe(500);
    });

    it('preserves data during migration', () => {
      const oldData = {
        version: 0,
        player: { name: 'MigratedHero', level: 8, exp: 1200 },
        resources: { gold: 8888 }
      };

      mockLocalStorage.setItem(SaveManager.SAVE_KEY, JSON.stringify(oldData));

      const loaded = SaveManager.load();

      expect(loaded.version).toBe(SaveManager.VERSION);
      expect(loaded.player.level).toBe(8);
      expect(loaded.resources.gold).toBe(8888);
    });
  });

  describe('에러 처리', () => {
    it('handles localStorage access failure gracefully', () => {
      vi.stubGlobal('localStorage', {
        getItem() {
          throw new Error('Access denied');
        },
        setItem() {
          throw new Error('Access denied');
        }
      });

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.version).toBe(SaveManager.VERSION);
    });

    it('returns default data on corrupted JSON', () => {
      mockLocalStorage.setItem(SaveManager.SAVE_KEY, '{invalid json}');

      const loaded = SaveManager.load();

      expect(loaded).toBeDefined();
      expect(loaded.version).toBe(SaveManager.VERSION);
    });

    it('returns false when save fails', () => {
      vi.stubGlobal('localStorage', {
        setItem() {
          throw new Error('Storage full');
        }
      });

      const data = SaveManager.getDefaultSave();
      const result = SaveManager.save(data);

      expect(result).toBe(false);
    });
  });

  describe('리소스 관리', () => {
    it('adds gold correctly', () => {
      SaveManager.reset();
      const initialGold = SaveManager.load().resources.gold;

      SaveManager.addGold(500);
      const newGold = SaveManager.load().resources.gold;

      expect(newGold).toBe(initialGold + 500);
    });

    it('spends gold when sufficient', () => {
      SaveManager.reset();
      SaveManager.addGold(1000);

      const result = SaveManager.spendGold(300);

      expect(result).toBe(true);
      expect(SaveManager.load().resources.gold).toBeGreaterThanOrEqual(700);
    });

    it('refuses to spend gold when insufficient', () => {
      SaveManager.reset();
      const data = SaveManager.load();
      data.resources.gold = 100;
      SaveManager.save(data);

      const result = SaveManager.spendGold(500);

      expect(result).toBe(false);
      expect(SaveManager.load().resources.gold).toBe(100);
    });
  });

  describe('캐릭터 관리', () => {
    it('adds new character correctly', () => {
      SaveManager.reset();

      const result = SaveManager.addCharacter('ssr_hero_1', 1);

      expect(result.duplicate).toBe(false);
      expect(result.character).toBeDefined();
      expect(result.character.characterId).toBe('ssr_hero_1');
    });

    it('handles duplicate character', () => {
      SaveManager.reset();
      SaveManager.addCharacter('r_hero_1', 1);

      const result = SaveManager.addCharacter('r_hero_1', 1);

      expect(result.duplicate).toBe(true);
      expect(result.shardsGained).toBeGreaterThan(0);
    });
  });

  describe('저장 슬롯 시스템', () => {
    it('saves to specific slot', () => {
      const data = SaveManager.getDefaultSave();
      data.player.name = 'SlotTest';

      const result = SaveManager.saveToSlot(0, data);

      expect(result).toBe(true);
    });

    it('loads from specific slot', () => {
      const data = SaveManager.getDefaultSave();
      data.player.name = 'LoadSlotTest';
      SaveManager.saveToSlot(1, data);

      const loaded = SaveManager.loadFromSlot(1);

      expect(loaded).toBeDefined();
      expect(loaded.player.name).toBe('LoadSlotTest');
    });

    it('returns null for empty slot', () => {
      const loaded = SaveManager.loadFromSlot(2);

      expect(loaded).toBeNull();
    });
  });
});

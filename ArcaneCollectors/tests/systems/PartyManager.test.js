/**
 * PartyManager.test.js
 * Unit tests for PartyManager - 파티 관리 시스템
 * 20 tests total
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PartyManager } from '../../src/systems/PartyManager.js';

describe('PartyManager', () => {
  describe('createParty', () => {
    it('creates valid party', () => {
      const heroIds = ['hero1', 'hero2', 'hero3'];
      const result = PartyManager.createParty(heroIds, '테스트 파티');

      expect(result.success).toBe(true);
      expect(result.party.heroIds).toEqual(heroIds);
      expect(result.party.name).toBe('테스트 파티');
    });

    it('fails for empty party', () => {
      const result = PartyManager.createParty([]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('최소 1명');
    });

    it('fails for too many heroes', () => {
      const heroIds = ['hero1', 'hero2', 'hero3', 'hero4', 'hero5'];
      const result = PartyManager.createParty(heroIds);

      expect(result.success).toBe(false);
      expect(result.error).toContain('최대');
    });

    it('fails for duplicate heroes', () => {
      const heroIds = ['hero1', 'hero1', 'hero2'];
      const result = PartyManager.createParty(heroIds);

      expect(result.success).toBe(false);
      expect(result.error).toContain('중복');
    });

    it('sets default name if not provided', () => {
      const result = PartyManager.createParty(['hero1']);

      expect(result.success).toBe(true);
      expect(result.party.name).toBe('파티');
    });
  });

  describe('saveParty', () => {
    it('saves party to slot', () => {
      const parties = PartyManager.ensurePartySlots([]);
      const result = PartyManager.saveParty(parties, 1, ['hero1', 'hero2']);

      expect(result.success).toBe(true);
      expect(result.savedSlot).toBe(1);
      expect(result.parties[0].heroIds).toEqual(['hero1', 'hero2']);
    });

    it('fails for invalid slot number', () => {
      const parties = [];
      const result = PartyManager.saveParty(parties, 0, ['hero1']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('슬롯 번호');
    });

    it('preserves active status when updating', () => {
      const parties = PartyManager.ensurePartySlots([]);
      parties[0] = {
        heroIds: ['oldHero'],
        name: '파티 1',
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const result = PartyManager.saveParty(parties, 1, ['hero1', 'hero2']);

      expect(result.parties[0].isActive).toBe(true);
    });
  });

  describe('ensurePartySlots', () => {
    it('fills empty slots up to MAX_SLOTS', () => {
      const parties = PartyManager.ensurePartySlots([]);

      expect(parties.length).toBe(PartyManager.MAX_SLOTS);
      expect(parties.every(p => p.heroIds)).toBe(true);
    });
  });

  describe('setActiveParty', () => {
    let parties;

    beforeEach(() => {
      parties = PartyManager.ensurePartySlots([]);
      parties[0].heroIds = ['hero1'];
      parties[1].heroIds = ['hero2'];
    });

    it('sets specified party as active', () => {
      const result = PartyManager.setActiveParty(parties, 2);

      expect(result.success).toBe(true);
      expect(result.parties[1].isActive).toBe(true);
      expect(result.parties[0].isActive).toBe(false);
    });

    it('fails for empty party', () => {
      const result = PartyManager.setActiveParty(parties, 3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('빈 파티');
    });

    it('deactivates all other parties', () => {
      parties[0].isActive = true;
      parties[1].isActive = true;

      const result = PartyManager.setActiveParty(parties, 1);

      const activeCount = result.parties.filter(p => p.isActive).length;
      expect(activeCount).toBe(1);
    });
  });

  describe('getActiveParty', () => {
    it('returns party marked as active', () => {
      const parties = PartyManager.ensurePartySlots([]);
      parties[1].heroIds = ['hero1'];
      parties[1].isActive = true;

      const active = PartyManager.getActiveParty(parties);

      expect(active).toBe(parties[1]);
    });

    it('returns first valid party if none active', () => {
      const parties = PartyManager.ensurePartySlots([]);
      parties[2].heroIds = ['hero1'];

      const active = PartyManager.getActiveParty(parties);

      expect(active).toBe(parties[2]);
    });

    it('returns null if no valid parties', () => {
      const parties = PartyManager.ensurePartySlots([]);

      const active = PartyManager.getActiveParty(parties);

      expect(active).toBeNull();
    });
  });

  describe('addHeroToParty', () => {
    it('adds hero to party', () => {
      const party = { heroIds: ['hero1'], name: '파티' };
      const result = PartyManager.addHeroToParty(party, 'hero2');

      expect(result.success).toBe(true);
      expect(result.party.heroIds).toContain('hero2');
    });

    it('fails when party full', () => {
      const party = { heroIds: ['hero1', 'hero2', 'hero3', 'hero4'], name: '파티' };
      const result = PartyManager.addHeroToParty(party, 'hero5');

      expect(result.success).toBe(false);
      expect(result.error).toContain('가득');
    });

    it('fails for duplicate hero', () => {
      const party = { heroIds: ['hero1'], name: '파티' };
      const result = PartyManager.addHeroToParty(party, 'hero1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('이미');
    });
  });

  describe('removeHeroFromParty', () => {
    it('removes hero from party', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '파티' };
      const result = PartyManager.removeHeroFromParty(party, 'hero1');

      expect(result.success).toBe(true);
      expect(result.party.heroIds).not.toContain('hero1');
      expect(result.removedHeroId).toBe('hero1');
    });

    it('fails for non-existent hero', () => {
      const party = { heroIds: ['hero1'], name: '파티' };
      const result = PartyManager.removeHeroFromParty(party, 'hero2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('없는');
    });
  });

  describe('swapPositions', () => {
    it('swaps hero positions', () => {
      const party = { heroIds: ['hero1', 'hero2', 'hero3'], name: '파티' };
      const result = PartyManager.swapPositions(party, 0, 2);

      expect(result.success).toBe(true);
      expect(result.party.heroIds[0]).toBe('hero3');
      expect(result.party.heroIds[2]).toBe('hero1');
    });

    it('returns unchanged for same position', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '파티' };
      const result = PartyManager.swapPositions(party, 0, 0);

      expect(result.success).toBe(true);
      expect(result.party.heroIds).toEqual(['hero1', 'hero2']);
    });

    it('fails for invalid positions', () => {
      const party = { heroIds: ['hero1'], name: '파티' };
      const result = PartyManager.swapPositions(party, 0, 5);

      expect(result.success).toBe(false);
      expect(result.error).toContain('유효하지 않은');
    });
  });

  describe('replaceHero', () => {
    it('replaces hero in party', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '파티' };
      const result = PartyManager.replaceHero(party, 'hero1', 'hero3');

      expect(result.success).toBe(true);
      expect(result.party.heroIds).toContain('hero3');
      expect(result.party.heroIds).not.toContain('hero1');
    });

    it('fails if new hero already in party', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '파티' };
      const result = PartyManager.replaceHero(party, 'hero1', 'hero2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('이미');
    });
  });

  describe('calculatePartyPower', () => {
    it('calculates total power', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '파티' };
      const heroData = [
        { id: 'hero1', stats: { hp: 1000, atk: 100, def: 50, spd: 100 } },
        { id: 'hero2', stats: { hp: 800, atk: 120, def: 40, spd: 90 } }
      ];

      const power = PartyManager.calculatePartyPower(party, heroData);

      expect(power).toBeGreaterThan(0);
    });

    it('returns 0 for empty party', () => {
      const party = { heroIds: [], name: '파티' };
      const power = PartyManager.calculatePartyPower(party, []);

      expect(power).toBe(0);
    });
  });

  describe('validateParty', () => {
    it('validates party against owned heroes', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '파티' };
      const ownedHeroIds = ['hero1', 'hero2', 'hero3'];

      const result = PartyManager.validateParty(party, ownedHeroIds);

      expect(result.isValid).toBe(true);
      expect(result.invalidHeroes).toHaveLength(0);
    });

    it('finds invalid heroes', () => {
      const party = { heroIds: ['hero1', 'hero4'], name: '파티' };
      const ownedHeroIds = ['hero1', 'hero2', 'hero3'];

      const result = PartyManager.validateParty(party, ownedHeroIds);

      expect(result.isValid).toBe(false);
      expect(result.invalidHeroes).toContain('hero4');
    });
  });

  describe('getPartySummary', () => {
    it('returns party summary with aggregated stats', () => {
      const party = { heroIds: ['hero1', 'hero2'], name: '테스트 파티', isActive: true, updatedAt: Date.now() };
      const heroData = [
        { id: 'hero1', name: 'Hero 1', mood: 'brave', class: 'warrior', rarity: 'SR', stats: { hp: 1000, atk: 100, def: 50, spd: 100 } },
        { id: 'hero2', name: 'Hero 2', mood: 'brave', class: 'mage', rarity: 'R', stats: { hp: 800, atk: 120, def: 40, spd: 90 } }
      ];

      const summary = PartyManager.getPartySummary(party, heroData);

      expect(summary.name).toBe('테스트 파티');
      expect(summary.size).toBe(2);
      expect(summary.heroes).toHaveLength(2);
      expect(summary.moods.brave).toBe(2);
      expect(summary.classes).toHaveProperty('warrior');
      expect(summary.isActive).toBe(true);
    });
  });

  describe('autoFormParty', () => {
    it('forms party from strongest heroes', () => {
      const heroes = [
        { id: 'hero1', stats: { hp: 1000, atk: 100, def: 50, spd: 100 } },
        { id: 'hero2', stats: { hp: 1200, atk: 120, def: 60, spd: 110 } },
        { id: 'hero3', stats: { hp: 800, atk: 80, def: 40, spd: 90 } }
      ];

      const partyIds = PartyManager.autoFormParty(heroes);

      expect(partyIds).toHaveLength(3);
      expect(partyIds[0]).toBe('hero2'); // Strongest first
    });

    it('excludes specified heroes', () => {
      const heroes = [
        { id: 'hero1', stats: { hp: 1000, atk: 100, def: 50, spd: 100 } },
        { id: 'hero2', stats: { hp: 1200, atk: 120, def: 60, spd: 110 } }
      ];

      const partyIds = PartyManager.autoFormParty(heroes, { excludeIds: ['hero1'] });

      expect(partyIds).not.toContain('hero1');
    });

    it('limits to PARTY_SIZE', () => {
      const heroes = Array.from({ length: 10 }, (_, i) => ({
        id: `hero${i}`,
        stats: { hp: 1000, atk: 100, def: 50, spd: 100 }
      }));

      const partyIds = PartyManager.autoFormParty(heroes);

      expect(partyIds.length).toBeLessThanOrEqual(PartyManager.PARTY_SIZE);
    });
  });

  // QA P1-1: 스테이지 파티 선택 모달이 저장된 편성을 버리던 결함의 판정부
  describe('resolvePartyHeroes / resolveDisplayParty', () => {
    const owned = [
      { id: 'asc_iris_olympus', name: '올림푸스의 아이리스', stats: { hp: 2000, atk: 200, def: 90, spd: 120 } },
      { id: 'asc_sera_avalon', name: '아발론의 세라', stats: { hp: 1800, atk: 180, def: 80, spd: 110 } },
      { id: 'base_luca', name: '루카', stats: { hp: 900, atk: 90, def: 40, spd: 80 } },
      { id: 'base_kai', name: '카이', stats: { hp: 800, atk: 80, def: 35, spd: 75 } },
      { id: 'base_leon', name: '레온', stats: { hp: 700, atk: 70, def: 30, spd: 70 } }
    ];

    it('저장된 슬롯 순서 그대로 영웅 객체를 되돌린다', () => {
      const slots = ['base_kai', 'asc_iris_olympus', null, 'base_luca'];
      const result = PartyManager.resolvePartyHeroes(slots, owned);

      expect(result).toHaveLength(PartyManager.PARTY_SIZE);
      expect(result.map(h => (h ? h.id : null))).toEqual(['base_kai', 'asc_iris_olympus', null, 'base_luca']);
    });

    it('보유 목록에 없는 id(마이그레이션으로 사라진 영웅)는 빈 칸으로 남긴다', () => {
      const result = PartyManager.resolvePartyHeroes(['char_1', 'base_kai'], owned);

      expect(result[0]).toBeNull();
      expect(result[1]?.id).toBe('base_kai');
    });

    it('같은 영웅이 두 슬롯에 있으면 첫 슬롯만 채운다', () => {
      const result = PartyManager.resolvePartyHeroes(['base_kai', 'base_kai'], owned);

      expect(result[0]?.id).toBe('base_kai');
      expect(result[1]).toBeNull();
    });

    it('resolveDisplayParty: 저장된 편성이 있으면 자동 편성으로 덮어쓰지 않는다', () => {
      const result = PartyManager.resolveDisplayParty(['base_leon', null, null, null], owned);

      expect(result[0]?.id).toBe('base_leon');
      expect(result.filter(Boolean)).toHaveLength(1);
    });

    it('resolveDisplayParty: 저장된 편성이 비면 보유 상위 4인으로 채운다', () => {
      const result = PartyManager.resolveDisplayParty([null, null, null, null], owned);

      expect(result.filter(Boolean)).toHaveLength(PartyManager.PARTY_SIZE);
      expect(result[0]?.id).toBe('asc_iris_olympus');
    });

    it('resolveDisplayParty: 보유 영웅이 없으면 전부 빈 칸이다', () => {
      const result = PartyManager.resolveDisplayParty(['base_kai'], []);

      expect(result.filter(Boolean)).toHaveLength(0);
    });
  });
});

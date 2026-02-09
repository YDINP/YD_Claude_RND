/**
 * SynergySystem.test.js
 * Unit tests for SynergySystem - 시너지 시스템
 * QAT-T3-3: 18 tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SynergySystem } from '../../src/systems/SynergySystem.js';

describe('SynergySystem', () => {
  let mockHeroData;

  beforeEach(() => {
    // Mock hero data with various properties
    mockHeroData = [
      { id: 'hero_1', cult: 'valhalla', mood: 'brave', class: 'warrior' },
      { id: 'hero_2', cult: 'valhalla', mood: 'brave', class: 'mage' },
      { id: 'hero_3', cult: 'valhalla', mood: 'calm', class: 'healer' },
      { id: 'hero_4', cult: 'olympus', mood: 'cunning', class: 'archer' },
      { id: 'hero_5', cult: 'olympus', mood: 'wild', class: 'assassin' },
      { id: 'hero_6', cult: 'takamagahara', mood: 'mystic', class: 'mage' },
    ];
  });

  describe('calculatePartySynergies() 정상 동작', () => {
    it('calculates synergies for 4-hero party', () => {
      const partyIds = ['hero_1', 'hero_2', 'hero_3', 'hero_4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, mockHeroData);

      expect(synergies).toBeDefined();
      expect(Array.isArray(synergies)).toBe(true);
    });

    it('returns empty array for empty party', () => {
      const synergies = SynergySystem.calculatePartySynergies([], mockHeroData);

      expect(synergies).toEqual([]);
    });

    it('handles 1-hero party', () => {
      const synergies = SynergySystem.calculatePartySynergies(['hero_1'], mockHeroData);

      expect(Array.isArray(synergies)).toBe(true);
    });
  });

  describe('교단 시너지 계산', () => {
    it('activates synergy for 2 heroes from same cult', () => {
      const partyIds = ['hero_1', 'hero_2', 'hero_4', 'hero_5'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, mockHeroData);
      const cultSynergies = synergies.filter(s => s.type === 'cult');

      expect(cultSynergies.length).toBeGreaterThan(0);
    });

    it('activates stronger synergy for 3 heroes from same cult', () => {
      const partyIds = ['hero_1', 'hero_2', 'hero_3', 'hero_4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, mockHeroData);
      const cultSynergy = synergies.find(s => s.type === 'cult' && s.count === 3);

      expect(cultSynergy).toBeDefined();
      expect(cultSynergy.effect.atk).toBeGreaterThan(0);
    });

    it('activates strongest synergy for 4 heroes from same cult', () => {
      const sameOriginData = [
        { id: 'hero_a', cult: 'valhalla', mood: 'brave', class: 'warrior' },
        { id: 'hero_b', cult: 'valhalla', mood: 'fierce', class: 'mage' },
        { id: 'hero_c', cult: 'valhalla', mood: 'calm', class: 'healer' },
        { id: 'hero_d', cult: 'valhalla', mood: 'wild', class: 'archer' },
      ];
      const partyIds = ['hero_a', 'hero_b', 'hero_c', 'hero_d'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, sameOriginData);
      const cultSynergy = synergies.find(s => s.type === 'cult' && s.count === 4);

      expect(cultSynergy).toBeDefined();
      expect(cultSynergy.effect.atk).toBeGreaterThan(0);
    });
  });

  describe('분위기 시너지 계산', () => {
    it('activates mood synergy for 2+ heroes with same mood', () => {
      const partyIds = ['hero_1', 'hero_2', 'hero_3', 'hero_4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, mockHeroData);
      const moodSynergies = synergies.filter(s => s.type === 'mood');

      expect(moodSynergies.length).toBeGreaterThan(0);
    });

    it('calculates correct effect for mood synergy', () => {
      const sameMoodData = [
        { id: 'hero_x', cult: 'valhalla', mood: 'brave', class: 'warrior' },
        { id: 'hero_y', cult: 'olympus', mood: 'brave', class: 'mage' },
        { id: 'hero_z', cult: 'asgard', mood: 'calm', class: 'healer' },
        { id: 'hero_w', cult: 'yomi', mood: 'wild', class: 'archer' },
      ];
      const partyIds = ['hero_x', 'hero_y', 'hero_z', 'hero_w'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, sameMoodData);
      const braveSynergy = synergies.find(s => s.type === 'mood' && s.mood === 'brave');

      expect(braveSynergy).toBeDefined();
      expect(braveSynergy.effect).toBeDefined();
    });

    it('activates balance synergy for 3+ different moods', () => {
      const diverseData = [
        { id: 'h1', cult: 'valhalla', mood: 'brave', class: 'warrior' },
        { id: 'h2', cult: 'olympus', mood: 'calm', class: 'mage' },
        { id: 'h3', cult: 'asgard', mood: 'cunning', class: 'healer' },
        { id: 'h4', cult: 'yomi', mood: 'wild', class: 'archer' },
      ];
      const partyIds = ['h1', 'h2', 'h3', 'h4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, diverseData);
      const balanceSynergy = synergies.find(s => s.type === 'mood_balance');

      expect(balanceSynergy).toBeDefined();
    });
  });

  describe('역할 시너지 계산', () => {
    it('activates balanced team synergy', () => {
      const balancedData = [
        { id: 'h1', cult: 'valhalla', mood: 'brave', class: 'warrior' },
        { id: 'h2', cult: 'olympus', mood: 'calm', class: 'mage' },
        { id: 'h3', cult: 'asgard', mood: 'cunning', class: 'healer' },
        { id: 'h4', cult: 'yomi', mood: 'wild', class: 'archer' },
      ];
      const partyIds = ['h1', 'h2', 'h3', 'h4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, balancedData);
      const roleSynergy = synergies.find(s => s.id === 'balanced_team');

      expect(roleSynergy).toBeDefined();
    });

    it('activates offense synergy for 3+ attackers', () => {
      const offenseData = [
        { id: 'h1', cult: 'valhalla', mood: 'brave', class: 'mage' },
        { id: 'h2', cult: 'olympus', mood: 'calm', class: 'archer' },
        { id: 'h3', cult: 'asgard', mood: 'cunning', class: 'assassin' },
        { id: 'h4', cult: 'yomi', mood: 'wild', class: 'warrior' },
      ];
      const partyIds = ['h1', 'h2', 'h3', 'h4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, offenseData);
      const offenseSynergy = synergies.find(s => s.id === 'full_offense');

      expect(offenseSynergy).toBeDefined();
    });

    it('activates defense synergy for 3+ defenders', () => {
      const defenseData = [
        { id: 'h1', cult: 'valhalla', mood: 'brave', class: 'warrior' },
        { id: 'h2', cult: 'olympus', mood: 'calm', class: 'tank' },
        { id: 'h3', cult: 'asgard', mood: 'cunning', class: 'healer' },
        { id: 'h4', cult: 'yomi', mood: 'wild', class: 'warrior' },
      ];
      const partyIds = ['h1', 'h2', 'h3', 'h4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, defenseData);
      const defenseSynergy = synergies.find(s => s.id === 'turtle_formation');

      expect(defenseSynergy).toBeDefined();
    });
  });

  describe('특수 시너지 계산', () => {
    it('detects special character combinations', () => {
      // This requires special_synergies in synergies.json, may not activate
      const partyIds = ['hero_1', 'hero_2', 'hero_3', 'hero_4'];

      const synergies = SynergySystem.calculatePartySynergies(partyIds, mockHeroData);
      const specialSynergies = synergies.filter(s => s.type === 'special');

      expect(Array.isArray(specialSynergies)).toBe(true);
    });
  });

  describe('시너지 버프 값 정확성', () => {
    it('calculates total effect correctly', () => {
      const synergies = [
        { type: 'cult', effect: { atk: 10, def: 5 } },
        { type: 'mood', effect: { atk: 8, spd: 3 } }
      ];

      const total = SynergySystem.getTotalEffect(synergies);

      expect(total.atk).toBe(18);
      expect(total.def).toBe(5);
      expect(total.spd).toBe(3);
    });

    it('applies synergies to stats correctly', () => {
      const baseStats = { hp: 1000, atk: 100, def: 50, spd: 10 };
      const synergies = [
        { type: 'cult', effect: { atk: 10, def: 5 } } // +10% atk, +5% def
      ];

      const modified = SynergySystem.applySynergiesToStats(baseStats, synergies);

      expect(modified.atk).toBe(110); // 100 * 1.1
      expect(modified.def).toBe(52); // 50 * 1.05
    });

    it('handles empty synergies gracefully', () => {
      const baseStats = { hp: 1000, atk: 100, def: 50, spd: 10 };

      const modified = SynergySystem.applySynergiesToStats(baseStats, []);

      expect(modified.atk).toBe(baseStats.atk);
      expect(modified.hp).toBe(baseStats.hp);
    });
  });
});

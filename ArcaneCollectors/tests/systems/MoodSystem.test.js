/**
 * MoodSystem.test.js
 * Unit tests for MoodSystem - 분위기 상성 시스템
 * 20 tests total
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { moodSystem, MOOD_TYPES, MATCHUP_CONFIG } from '../../src/systems/MoodSystem.js';

describe('MoodSystem', () => {
  describe('getMatchupMultiplier', () => {
    it('returns advantage multiplier for advantageous matchup (BRAVE > WILD)', () => {
      const result = moodSystem.getMatchupMultiplier('brave', 'wild');
      expect(result.multiplier).toBe(MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER);
      expect(result.advantage).toBe('ADVANTAGE');
    });

    it('returns advantage multiplier for advantageous matchup (BRAVE > CUNNING)', () => {
      const result = moodSystem.getMatchupMultiplier('brave', 'cunning');
      expect(result.multiplier).toBe(MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER);
      expect(result.advantage).toBe('ADVANTAGE');
    });

    it('returns disadvantage multiplier for disadvantageous matchup (BRAVE < FIERCE)', () => {
      const result = moodSystem.getMatchupMultiplier('brave', 'fierce');
      expect(result.multiplier).toBe(MATCHUP_CONFIG.DISADVANTAGE_MULTIPLIER);
      expect(result.advantage).toBe('DISADVANTAGE');
    });

    it('returns disadvantage multiplier for disadvantageous matchup (BRAVE < DEVOTED)', () => {
      const result = moodSystem.getMatchupMultiplier('brave', 'devoted');
      expect(result.multiplier).toBe(MATCHUP_CONFIG.DISADVANTAGE_MULTIPLIER);
      expect(result.advantage).toBe('DISADVANTAGE');
    });

    it('returns neutral multiplier for neutral matchup', () => {
      const result = moodSystem.getMatchupMultiplier('brave', 'noble');
      expect(result.multiplier).toBe(MATCHUP_CONFIG.NEUTRAL_MULTIPLIER);
      expect(result.advantage).toBe('NEUTRAL');
    });

    it('returns neutral multiplier for same mood', () => {
      const result = moodSystem.getMatchupMultiplier('brave', 'brave');
      expect(result.multiplier).toBe(MATCHUP_CONFIG.NEUTRAL_MULTIPLIER);
      expect(result.advantage).toBe('NEUTRAL');
      expect(result.description).toContain('동일 분위기');
    });

    it('handles all 9 mood types without error', () => {
      const moods = Object.values(MOOD_TYPES);
      moods.forEach(m1 => {
        moods.forEach(m2 => {
          expect(() => moodSystem.getMatchupMultiplier(m1.toLowerCase(), m2.toLowerCase())).not.toThrow();
        });
      });
    });

    it('throws error for invalid attacker mood', () => {
      expect(() => moodSystem.getMatchupMultiplier('invalid', 'brave')).toThrow('알 수 없는 공격자 분위기');
    });

    it('throws error for invalid defender mood', () => {
      expect(() => moodSystem.getMatchupMultiplier('brave', 'invalid')).toThrow('알 수 없는 방어자 분위기');
    });
  });

  describe('getCultBonus', () => {
    it('returns bonus for matching cult-mood pair (valhalla + brave)', () => {
      const result = moodSystem.getCultBonus('valhalla', 'brave');
      expect(result.bonus).toBe(0.10);
      expect(result.description).toContain('보너스');
    });

    it('returns secondary bonus for matching cult-mood pair (valhalla + fierce)', () => {
      const result = moodSystem.getCultBonus('valhalla', 'fierce');
      expect(result.bonus).toBe(0.05);
    });

    it('returns 0 for non-matching cult-mood pair', () => {
      const result = moodSystem.getCultBonus('valhalla', 'noble');
      expect(result.bonus).toBe(0);
      expect(result.description).toContain('보너스 없음');
    });

    it('returns 0 for unknown cult', () => {
      const result = moodSystem.getCultBonus('unknown', 'brave');
      expect(result.bonus).toBe(0);
      expect(result.description).toContain('알 수 없는 교단');
    });

    it('handles all 9 cults correctly', () => {
      const cults = ['valhalla', 'takamagahara', 'olympus', 'asgard', 'yomi', 'tartarus', 'avalon', 'helheim', 'kunlun'];
      cults.forEach(cult => {
        expect(() => moodSystem.getCultBonus(cult, 'brave')).not.toThrow();
      });
    });
  });

  describe('calculatePartyBonus', () => {
    it('returns 0 bonus for empty party', () => {
      const result = moodSystem.calculatePartyBonus([]);
      expect(result.totalBonus).toBe(0);
      expect(result.diversityBonus).toBe(0);
      expect(result.synergyBonus).toBe(0);
    });

    it('calculates diversity bonus for 2 unique moods', () => {
      const party = [
        { mood: 'brave', name: 'Hero1' },
        { mood: 'fierce', name: 'Hero2' }
      ];
      const result = moodSystem.calculatePartyBonus(party);
      expect(result.diversityBonus).toBe(0.03);
      expect(result.uniqueMoods).toHaveLength(2);
    });

    it('calculates diversity bonus for 3 unique moods', () => {
      const party = [
        { mood: 'brave', name: 'Hero1' },
        { mood: 'fierce', name: 'Hero2' },
        { mood: 'calm', name: 'Hero3' }
      ];
      const result = moodSystem.calculatePartyBonus(party);
      expect(result.diversityBonus).toBe(0.08);
      expect(result.uniqueMoods).toHaveLength(3);
    });

    it('calculates diversity bonus for 4+ unique moods', () => {
      const party = [
        { mood: 'brave', name: 'Hero1' },
        { mood: 'fierce', name: 'Hero2' },
        { mood: 'calm', name: 'Hero3' },
        { mood: 'noble', name: 'Hero4' }
      ];
      const result = moodSystem.calculatePartyBonus(party);
      expect(result.diversityBonus).toBe(0.15);
      expect(result.uniqueMoods).toHaveLength(4);
    });

    it('calculates synergy bonus for brave + wild combination', () => {
      const party = [
        { mood: 'brave', name: 'Hero1' },
        { mood: 'wild', name: 'Hero2' }
      ];
      const result = moodSystem.calculatePartyBonus(party);
      expect(result.synergyBonus).toBeGreaterThanOrEqual(0.05);
    });

    it('includes cult bonuses in total calculation', () => {
      const party = [
        { mood: 'brave', cult: 'valhalla', name: 'Hero1' },
        { mood: 'fierce', cult: 'valhalla', name: 'Hero2' }
      ];
      const result = moodSystem.calculatePartyBonus(party);
      expect(result.cultBonuses).toHaveLength(2);
      expect(result.totalBonus).toBeGreaterThan(result.diversityBonus + result.synergyBonus);
    });
  });

  describe('getAdvantageousMoods', () => {
    it('returns correct advantageous moods for a given defender', () => {
      const result = moodSystem.getAdvantageousMoods('brave');
      expect(result.defender).toBe('BRAVE');
      expect(result.advantageous.length).toBeGreaterThan(0);
      expect(result.disadvantageous.length).toBeGreaterThan(0);
    });
  });
});

/**
 * utils/constants.js Integrity Tests
 * QAT-T1-3: 상수 무결성 테스트
 */
import { describe, it, expect } from 'vitest';
import {
  MOOD,
  MOOD_MATCHUP,
  MOOD_DAMAGE,
  MOOD_INFO,
  CULT,
  CULT_INFO,
  CULT_MOOD_BONUS,
  getCultMoodBonus,
} from '../../src/utils/constants.js';

const ALL_MOOD_VALUES = Object.values(MOOD);
const ALL_CULT_VALUES = Object.values(CULT);

// ==================== MOOD 상수 ====================

describe('MOOD 상수', () => {
  it('9종 분위기 정의', () => {
    expect(ALL_MOOD_VALUES).toHaveLength(9);
  });

  it('필수 분위기 포함', () => {
    const expected = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];
    expected.forEach((mood) => {
      expect(ALL_MOOD_VALUES).toContain(mood);
    });
  });

  it('공격형 그룹: brave, fierce, wild', () => {
    expect(MOOD.BRAVE).toBe('brave');
    expect(MOOD.FIERCE).toBe('fierce');
    expect(MOOD.WILD).toBe('wild');
  });

  it('방어형 그룹: calm, stoic, devoted', () => {
    expect(MOOD.CALM).toBe('calm');
    expect(MOOD.STOIC).toBe('stoic');
    expect(MOOD.DEVOTED).toBe('devoted');
  });

  it('전략형 그룹: cunning, noble, mystic', () => {
    expect(MOOD.CUNNING).toBe('cunning');
    expect(MOOD.NOBLE).toBe('noble');
    expect(MOOD.MYSTIC).toBe('mystic');
  });
});

// ==================== MOOD_MATCHUP 상성 ====================

describe('MOOD_MATCHUP 상성', () => {
  it('9종 모두 상성 정의됨', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      expect(MOOD_MATCHUP[mood]).toBeDefined();
      expect(MOOD_MATCHUP[mood].strongAgainst).toBeDefined();
      expect(MOOD_MATCHUP[mood].weakAgainst).toBeDefined();
    });
  });

  it('각 분위기에 강한 상대 2개', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      expect(MOOD_MATCHUP[mood].strongAgainst).toHaveLength(2);
    });
  });

  it('각 분위기에 약한 상대 2개', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      expect(MOOD_MATCHUP[mood].weakAgainst).toHaveLength(2);
    });
  });

  it('자기 자신에 대한 상성 없음', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      expect(MOOD_MATCHUP[mood].strongAgainst).not.toContain(mood);
      expect(MOOD_MATCHUP[mood].weakAgainst).not.toContain(mood);
    });
  });

  it('strong과 weak에 중복 없음', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      const strong = MOOD_MATCHUP[mood].strongAgainst;
      const weak = MOOD_MATCHUP[mood].weakAgainst;
      const overlap = strong.filter((m) => weak.includes(m));
      expect(overlap).toHaveLength(0);
    });
  });

  it('상성 대칭: A→B strong이면 B→A weak', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      MOOD_MATCHUP[mood].strongAgainst.forEach((target) => {
        expect(MOOD_MATCHUP[target].weakAgainst).toContain(mood);
      });
    });
  });

  it('상성 대칭: A→B weak이면 B→A strong', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      MOOD_MATCHUP[mood].weakAgainst.forEach((target) => {
        expect(MOOD_MATCHUP[target].strongAgainst).toContain(mood);
      });
    });
  });

  it('상성 값이 유효한 MOOD 값만 포함', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      MOOD_MATCHUP[mood].strongAgainst.forEach((target) => {
        expect(ALL_MOOD_VALUES).toContain(target);
      });
      MOOD_MATCHUP[mood].weakAgainst.forEach((target) => {
        expect(ALL_MOOD_VALUES).toContain(target);
      });
    });
  });
});

// ==================== MOOD_DAMAGE 배율 ====================

describe('MOOD_DAMAGE 배율', () => {
  it('우위 배율 1.2', () => {
    expect(MOOD_DAMAGE.ADVANTAGE).toBe(1.2);
  });

  it('열세 배율 0.8', () => {
    expect(MOOD_DAMAGE.DISADVANTAGE).toBe(0.8);
  });

  it('중립 배율 1.0', () => {
    expect(MOOD_DAMAGE.NEUTRAL).toBe(1.0);
  });
});

// ==================== MOOD_INFO ====================

describe('MOOD_INFO', () => {
  it('9종 모두 정보 정의됨', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      expect(MOOD_INFO[mood]).toBeDefined();
    });
  });

  it('각 분위기에 name, description, color 존재', () => {
    ALL_MOOD_VALUES.forEach((mood) => {
      expect(MOOD_INFO[mood].name).toBeDefined();
      expect(typeof MOOD_INFO[mood].name).toBe('string');
      expect(MOOD_INFO[mood].description).toBeDefined();
      expect(MOOD_INFO[mood].color).toBeDefined();
      expect(MOOD_INFO[mood].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ==================== CULT 상수 ====================

describe('CULT 상수', () => {
  it('10개 교단 정의', () => {
    expect(ALL_CULT_VALUES).toHaveLength(10);
  });

  it('필수 교단 포함', () => {
    const expected = [
      'prism_stars', 'neon_crow', 'ink_cyclone', 'stella_club', 'card_cartel',
      'buddy_garden', 'glitch_paradise', 'cafe_encore', 'lunatic_circus', 'iron_beat'
    ];
    expected.forEach((cult) => {
      expect(ALL_CULT_VALUES).toContain(cult);
    });
  });
});

// ==================== CULT_INFO ====================

describe('CULT_INFO', () => {
  it('10교단 모두 정보 정의됨', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(CULT_INFO[cult]).toBeDefined();
    });
  });

  it('각 교단에 name, origin, description, color 존재', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(CULT_INFO[cult].name).toBeDefined();
      expect(CULT_INFO[cult].origin).toBeDefined();
      expect(CULT_INFO[cult].description).toBeDefined();
      expect(CULT_INFO[cult].color).toBeDefined();
      expect(CULT_INFO[cult].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

// ==================== CULT_MOOD_BONUS ====================

describe('CULT_MOOD_BONUS', () => {
  it('10교단 모두 보너스 정의됨', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(CULT_MOOD_BONUS[cult]).toBeDefined();
    });
  });

  it('각 교단에 optimalMood, bonusMultiplier 존재', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(CULT_MOOD_BONUS[cult].optimalMood).toBeDefined();
      expect(CULT_MOOD_BONUS[cult].bonusMultiplier).toBeDefined();
      expect(typeof CULT_MOOD_BONUS[cult].bonusMultiplier).toBe('number');
    });
  });

  it('교단-분위기 매핑 — 각 교단마다 optimalMood가 유효한 MOOD 값', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(ALL_MOOD_VALUES).toContain(CULT_MOOD_BONUS[cult].optimalMood);
    });
  });

  it('optimalMood가 유효한 MOOD 값', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(ALL_MOOD_VALUES).toContain(CULT_MOOD_BONUS[cult].optimalMood);
    });
  });

  it('보너스 배율이 1.15', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      expect(CULT_MOOD_BONUS[cult].bonusMultiplier).toBe(1.15);
    });
  });

  it('특정 교단-분위기 매핑 확인 (서브컬쳐 v3.0)', () => {
    expect(CULT_MOOD_BONUS[CULT.PRISM_STARS].optimalMood).toBe(MOOD.NOBLE);
    expect(CULT_MOOD_BONUS[CULT.NEON_CROW].optimalMood).toBe(MOOD.CUNNING);
    expect(CULT_MOOD_BONUS[CULT.INK_CYCLONE].optimalMood).toBe(MOOD.WILD);
    expect(CULT_MOOD_BONUS[CULT.STELLA_CLUB].optimalMood).toBe(MOOD.MYSTIC);
    expect(CULT_MOOD_BONUS[CULT.CARD_CARTEL].optimalMood).toBe(MOOD.CUNNING);
    expect(CULT_MOOD_BONUS[CULT.BUDDY_GARDEN].optimalMood).toBe(MOOD.DEVOTED);
    expect(CULT_MOOD_BONUS[CULT.GLITCH_PARADISE].optimalMood).toBe(MOOD.FIERCE);
    expect(CULT_MOOD_BONUS[CULT.CAFE_ENCORE].optimalMood).toBe(MOOD.CALM);
    expect(CULT_MOOD_BONUS[CULT.LUNATIC_CIRCUS].optimalMood).toBe(MOOD.BRAVE);
    expect(CULT_MOOD_BONUS[CULT.IRON_BEAT].optimalMood).toBe(MOOD.FIERCE);
  });
});

// ==================== getCultMoodBonus ====================

describe('getCultMoodBonus', () => {
  it('최적 조합 → 1.15', () => {
    expect(getCultMoodBonus('prism_stars', 'noble')).toBe(1.15);
    expect(getCultMoodBonus('neon_crow', 'cunning')).toBe(1.15);
    expect(getCultMoodBonus('cafe_encore', 'calm')).toBe(1.15);
  });

  it('비최적 조합 → 1.0', () => {
    expect(getCultMoodBonus('prism_stars', 'calm')).toBe(1.0);
    expect(getCultMoodBonus('cafe_encore', 'brave')).toBe(1.0);
  });

  it('존재하지 않는 교단 → 1.0', () => {
    expect(getCultMoodBonus('unknown_cult', 'brave')).toBe(1.0);
  });

  it('9교단 전체 최적 조합 테스트', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      const optimalMood = CULT_MOOD_BONUS[cult].optimalMood;
      expect(getCultMoodBonus(cult, optimalMood)).toBe(1.15);
    });
  });

  it('9교단 전체 비최적 조합 → 1.0', () => {
    ALL_CULT_VALUES.forEach((cult) => {
      const optimalMood = CULT_MOOD_BONUS[cult].optimalMood;
      const nonOptimalMoods = ALL_MOOD_VALUES.filter((m) => m !== optimalMood);
      nonOptimalMoods.forEach((mood) => {
        expect(getCultMoodBonus(cult, mood)).toBe(1.0);
      });
    });
  });
});

// ==================== MOOD-CULT 키 일치 ====================

describe('MOOD-CULT 키 일치', () => {
  it('MOOD_MATCHUP 키 = MOOD 값', () => {
    const matchupKeys = Object.keys(MOOD_MATCHUP);
    expect(matchupKeys.sort()).toEqual(ALL_MOOD_VALUES.sort());
  });

  it('MOOD_INFO 키 = MOOD 값', () => {
    const infoKeys = Object.keys(MOOD_INFO);
    expect(infoKeys.sort()).toEqual(ALL_MOOD_VALUES.sort());
  });

  it('CULT_INFO 키 = CULT 값', () => {
    const infoKeys = Object.keys(CULT_INFO);
    expect(infoKeys.sort()).toEqual(ALL_CULT_VALUES.sort());
  });

  it('CULT_MOOD_BONUS 키 = CULT 값', () => {
    const bonusKeys = Object.keys(CULT_MOOD_BONUS);
    expect(bonusKeys.sort()).toEqual(ALL_CULT_VALUES.sort());
  });
});

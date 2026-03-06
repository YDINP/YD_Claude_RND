/**
 * MoodSystem.js
 * 분위기 상성 시스템 - 캐릭터 분위기에 따른 전투 보너스 계산
 *
 * ArcaneCollectors v4 - 핵심 게임 시스템
 */

// 분위기 타입 정의 (9종)
const MOOD_TYPES = {
  BRAVE: 'BRAVE',       // 열혈
  FIERCE: 'FIERCE',     // 격렬
  WILD: 'WILD',         // 광폭
  CALM: 'CALM',         // 고요
  STOIC: 'STOIC',       // 의연
  DEVOTED: 'DEVOTED',   // 헌신
  CUNNING: 'CUNNING',   // 냉철
  NOBLE: 'NOBLE',       // 고결
  MYSTIC: 'MYSTIC',     // 신비
};

// 상성 배율 설정
const MATCHUP_CONFIG = {
  ADVANTAGE_MULTIPLIER: 1.20,    // 유리 상성 +20%
  DISADVANTAGE_MULTIPLIER: 0.80, // 불리 상성 -20%
  NEUTRAL_MULTIPLIER: 1.00,      // 중립 상성 100%
};

// 상성 관계 정의 (매트릭스 구조: 각 분위기 2강 2약)
const MOOD_MATCHUPS = {
  [MOOD_TYPES.BRAVE]: {
    advantage: [MOOD_TYPES.WILD, MOOD_TYPES.CUNNING],
    disadvantage: [MOOD_TYPES.FIERCE, MOOD_TYPES.DEVOTED],
  },
  [MOOD_TYPES.FIERCE]: {
    advantage: [MOOD_TYPES.BRAVE, MOOD_TYPES.NOBLE],
    disadvantage: [MOOD_TYPES.WILD, MOOD_TYPES.CALM],
  },
  [MOOD_TYPES.WILD]: {
    advantage: [MOOD_TYPES.FIERCE, MOOD_TYPES.MYSTIC],
    disadvantage: [MOOD_TYPES.BRAVE, MOOD_TYPES.STOIC],
  },
  [MOOD_TYPES.CALM]: {
    advantage: [MOOD_TYPES.DEVOTED, MOOD_TYPES.FIERCE],
    disadvantage: [MOOD_TYPES.STOIC, MOOD_TYPES.CUNNING],
  },
  [MOOD_TYPES.STOIC]: {
    advantage: [MOOD_TYPES.CALM, MOOD_TYPES.WILD],
    disadvantage: [MOOD_TYPES.DEVOTED, MOOD_TYPES.MYSTIC],
  },
  [MOOD_TYPES.DEVOTED]: {
    advantage: [MOOD_TYPES.STOIC, MOOD_TYPES.BRAVE],
    disadvantage: [MOOD_TYPES.CALM, MOOD_TYPES.NOBLE],
  },
  [MOOD_TYPES.CUNNING]: {
    advantage: [MOOD_TYPES.MYSTIC, MOOD_TYPES.CALM],
    disadvantage: [MOOD_TYPES.NOBLE, MOOD_TYPES.BRAVE],
  },
  [MOOD_TYPES.NOBLE]: {
    advantage: [MOOD_TYPES.CUNNING, MOOD_TYPES.DEVOTED],
    disadvantage: [MOOD_TYPES.MYSTIC, MOOD_TYPES.FIERCE],
  },
  [MOOD_TYPES.MYSTIC]: {
    advantage: [MOOD_TYPES.NOBLE, MOOD_TYPES.STOIC],
    disadvantage: [MOOD_TYPES.CUNNING, MOOD_TYPES.WILD],
  },
};

// 교단별 분위기 보너스 (9교단)
const CULT_MOOD_BONUSES = {
  valhalla: {
    [MOOD_TYPES.BRAVE]: 0.10,
    [MOOD_TYPES.FIERCE]: 0.05,
  },
  takamagahara: {
    [MOOD_TYPES.MYSTIC]: 0.10,
    [MOOD_TYPES.DEVOTED]: 0.05,
  },
  olympus: {
    [MOOD_TYPES.CUNNING]: 0.10,
    [MOOD_TYPES.NOBLE]: 0.05,
  },
  asgard: {
    [MOOD_TYPES.CALM]: 0.10,
    [MOOD_TYPES.STOIC]: 0.05,
  },
  yomi: {
    [MOOD_TYPES.WILD]: 0.10,
    [MOOD_TYPES.FIERCE]: 0.05,
  },
  tartarus: {
    [MOOD_TYPES.FIERCE]: 0.10,
    [MOOD_TYPES.WILD]: 0.05,
  },
  avalon: {
    [MOOD_TYPES.NOBLE]: 0.10,
    [MOOD_TYPES.DEVOTED]: 0.05,
  },
  helheim: {
    [MOOD_TYPES.STOIC]: 0.10,
    [MOOD_TYPES.CUNNING]: 0.05,
  },
  kunlun: {
    [MOOD_TYPES.DEVOTED]: 0.10,
    [MOOD_TYPES.NOBLE]: 0.05,
  },
};

class MoodSystem {
  constructor() {
    this.matchupHistory = [];
  }

  /**
   * 상성 배율 계산
   * @param {string} attackerMood - 공격자 분위기
   * @param {string} defenderMood - 방어자 분위기
   * @returns {Object} { multiplier, advantage, description }
   */
  getMatchupMultiplier(attackerMood, defenderMood) {
    const attacker = attackerMood.toUpperCase();
    const defender = defenderMood.toUpperCase();

    // 유효성 검사
    if (!MOOD_TYPES[attacker]) {
      throw new Error(`알 수 없는 공격자 분위기: ${attackerMood}`);
    }
    if (!MOOD_TYPES[defender]) {
      throw new Error(`알 수 없는 방어자 분위기: ${defenderMood}`);
    }

    // 같은 분위기끼리는 중립
    if (attacker === defender) {
      return {
        multiplier: MATCHUP_CONFIG.NEUTRAL_MULTIPLIER,
        advantage: 'NEUTRAL',
        description: '동일 분위기 - 상성 효과 없음',
      };
    }

    // 상성 확인 (배열 기반)
    const matchup = MOOD_MATCHUPS[attacker];

    if (matchup.advantage.includes(defender)) {
      return {
        multiplier: MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER,
        advantage: 'ADVANTAGE',
        description: `${attacker}는 ${defender}에게 유리 (+${(MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER - 1) * 100}%)`,
      };
    }

    if (matchup.disadvantage.includes(defender)) {
      return {
        multiplier: MATCHUP_CONFIG.DISADVANTAGE_MULTIPLIER,
        advantage: 'DISADVANTAGE',
        description: `${attacker}는 ${defender}에게 불리 (${(MATCHUP_CONFIG.DISADVANTAGE_MULTIPLIER - 1) * 100}%)`,
      };
    }

    // 기타 조합은 중립
    return {
      multiplier: MATCHUP_CONFIG.NEUTRAL_MULTIPLIER,
      advantage: 'NEUTRAL',
      description: `${attacker}와 ${defender} - 상성 효과 없음`,
    };
  }

  /**
   * 교단-분위기 보너스 계산
   * @param {string} cult - 교단 이름
   * @param {string} mood - 분위기
   * @returns {Object} { bonus, description }
   */
  getCultBonus(cult, mood) {
    const cultName = cult.toLowerCase();
    const moodType = mood.toUpperCase();

    const cultBonuses = CULT_MOOD_BONUSES[cultName];

    if (!cultBonuses) {
      return {
        bonus: 0,
        description: `알 수 없는 교단: ${cult}`,
      };
    }

    const bonus = cultBonuses[moodType] || 0;

    if (bonus > 0) {
      return {
        bonus,
        description: `${cultName} 교단에서 ${moodType} 분위기는 +${bonus * 100}% 보너스`,
      };
    }

    return {
      bonus: 0,
      description: `${cultName} 교단에서 ${moodType} 분위기는 보너스 없음`,
    };
  }

  /**
   * 파티 전체 보너스 계산
   * @param {Array} party - 파티 멤버 배열 [{ mood, cult? }]
   * @returns {Object} 파티 보너스 정보
   */
  calculatePartyBonus(party) {
    if (!Array.isArray(party) || party.length === 0) {
      return {
        totalBonus: 0,
        synergyBonus: 0,
        diversityBonus: 0,
        cultBonuses: [],
        details: '파티가 비어있습니다.',
      };
    }

    const moods = party.map(member => member.mood.toUpperCase());
    const uniqueMoods = [...new Set(moods)];

    // 다양성 보너스: 서로 다른 분위기 수에 따른 보너스
    const diversityBonus = this._calculateDiversityBonus(uniqueMoods.length, party.length);

    // 시너지 보너스: 특정 조합에 대한 보너스
    const synergyBonus = this._calculateSynergyBonus(moods);

    // 교단 보너스 합산
    const cultBonuses = party
      .filter(member => member.cult)
      .map(member => ({
        member: member.name || 'Unknown',
        ...this.getCultBonus(member.cult, member.mood),
      }));

    const totalCultBonus = cultBonuses.reduce((sum, cb) => sum + cb.bonus, 0);

    return {
      totalBonus: diversityBonus + synergyBonus + totalCultBonus,
      diversityBonus,
      synergyBonus,
      cultBonuses,
      uniqueMoods,
      details: this._generatePartyDetails(uniqueMoods, diversityBonus, synergyBonus),
    };
  }

  /**
   * 다양성 보너스 계산
   * @private
   */
  _calculateDiversityBonus(uniqueCount, totalCount) {
    // 모든 멤버가 다른 분위기일 때 최대 보너스
    if (uniqueCount >= 4) return 0.15;
    if (uniqueCount >= 3) return 0.08;
    if (uniqueCount >= 2) return 0.03;
    return 0;
  }

  /**
   * 시너지 보너스 계산
   * @private
   */
  _calculateSynergyBonus(moods) {
    let bonus = 0;

    // 공격형 조합: 열혈 + 광폭
    if (moods.includes(MOOD_TYPES.BRAVE) &&
        moods.includes(MOOD_TYPES.WILD)) {
      bonus += 0.05;
    }

    // 방어형 조합: 고요 + 헌신
    if (moods.includes(MOOD_TYPES.CALM) &&
        moods.includes(MOOD_TYPES.DEVOTED)) {
      bonus += 0.05;
    }

    // 전략형 조합: 냉철 + 고결
    if (moods.includes(MOOD_TYPES.CUNNING) &&
        moods.includes(MOOD_TYPES.NOBLE)) {
      bonus += 0.05;
    }

    // 격렬 + 의연 조합: 공수 밸런스
    if (moods.includes(MOOD_TYPES.FIERCE) &&
        moods.includes(MOOD_TYPES.STOIC)) {
      bonus += 0.05;
    }

    // 신비 포함 파티: 마법 강화
    if (moods.includes(MOOD_TYPES.MYSTIC)) {
      bonus += 0.03;
    }

    return bonus;
  }

  /**
   * 파티 상세 설명 생성
   * @private
   */
  _generatePartyDetails(uniqueMoods, diversityBonus, synergyBonus) {
    const details = [];

    if (diversityBonus > 0) {
      details.push(`다양성 보너스: +${(diversityBonus * 100).toFixed(0)}% (${uniqueMoods.length}개 분위기)`);
    }

    if (synergyBonus > 0) {
      details.push(`시너지 보너스: +${(synergyBonus * 100).toFixed(0)}%`);
    }

    return details.join(', ') || '특별 보너스 없음';
  }

  /**
   * 특정 방어자에게 유리한 분위기 목록 반환
   * @param {string} defenderMood - 방어자 분위기
   * @returns {Object} { advantageous, neutral, disadvantageous }
   */
  getAdvantageousMoods(defenderMood) {
    const defender = defenderMood.toUpperCase();

    if (!MOOD_TYPES[defender]) {
      throw new Error(`알 수 없는 방어자 분위기: ${defenderMood}`);
    }

    const advantageous = [];
    const neutral = [];
    const disadvantageous = [];

    // 각 분위기별로 상성 확인
    for (const [attackerType, matchup] of Object.entries(MOOD_MATCHUPS)) {
      if (attackerType === defender) continue;

      if (matchup.advantage.includes(defender)) {
        advantageous.push({
          mood: attackerType,
          multiplier: MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER,
          reason: `${attackerType}는 ${defender}에게 유리`,
        });
      } else if (matchup.disadvantage.includes(defender)) {
        disadvantageous.push({
          mood: attackerType,
          multiplier: MATCHUP_CONFIG.DISADVANTAGE_MULTIPLIER,
          reason: `${attackerType}는 ${defender}에게 불리`,
        });
      } else {
        neutral.push({
          mood: attackerType,
          multiplier: MATCHUP_CONFIG.NEUTRAL_MULTIPLIER,
          reason: '상성 효과 없음',
        });
      }
    }

    return {
      defender,
      advantageous,
      neutral,
      disadvantageous,
      recommendation: advantageous.length > 0
        ? `${defender}에게는 ${advantageous.map(a => a.mood).join(', ')} 분위기가 유리합니다.`
        : '특별히 유리한 분위기가 없습니다.',
    };
  }

  /**
   * 전체 상성표 반환
   * @returns {Object} 상성표
   */
  getMatchupChart() {
    const chart = {};

    for (const attacker of Object.values(MOOD_TYPES)) {
      chart[attacker] = {};
      for (const defender of Object.values(MOOD_TYPES)) {
        const { multiplier, advantage } = this.getMatchupMultiplier(attacker, defender);
        chart[attacker][defender] = { multiplier, advantage };
      }
    }

    return chart;
  }

  /**
   * 상성 시스템 정보 조회
   * @returns {Object} 시스템 정보
   */
  getSystemInfo() {
    return {
      moods: { ...MOOD_TYPES },
      matchupConfig: { ...MATCHUP_CONFIG },
      cultBonuses: { ...CULT_MOOD_BONUSES },
      description: `
상성 시스템 (9종 매트릭스):
- 공격형: Brave(열혈), Fierce(격렬), Wild(광폭)
- 방어형: Calm(고요), Stoic(의연), Devoted(헌신)
- 전략형: Cunning(냉철), Noble(고결), Mystic(신비)
- 각 분위기는 2개에 강하고 2개에 약함 (±20%)
      `.trim(),
    };
  }
}

// 싱글톤 인스턴스
const moodSystem = new MoodSystem();

// ES6 모듈 export
export {
  MoodSystem,
  moodSystem,
  MOOD_TYPES,
  MATCHUP_CONFIG,
  MOOD_MATCHUPS,
  CULT_MOOD_BONUSES,
};
export default moodSystem;

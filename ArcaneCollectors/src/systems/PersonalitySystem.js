/**
 * PersonalitySystem.js
 * 성격 상성 시스템 - 캐릭터 성격에 따른 전투 보너스 계산
 * 
 * ArcaneCollectors v4 - 핵심 게임 시스템
 */

// 성격 타입 정의
const PERSONALITY_TYPES = {
  BRAVE: 'BRAVE',       // 용맹
  CUNNING: 'CUNNING',   // 교활
  CALM: 'CALM',         // 침착
  WILD: 'WILD',         // 야성
  MYSTIC: 'MYSTIC',     // 신비
};

// 상성 배율 설정
const MATCHUP_CONFIG = {
  ADVANTAGE_MULTIPLIER: 1.20,    // 유리 상성 +20%
  DISADVANTAGE_MULTIPLIER: 0.80, // 불리 상성 -20%
  NEUTRAL_MULTIPLIER: 1.00,      // 중립 상성 100%
  MYSTIC_ADVANTAGE: 1.10,        // 신비는 모두에게 +10%
};

// 상성 관계 정의 (key가 attacker, value가 defender에게 유리/불리)
const PERSONALITY_MATCHUPS = {
  [PERSONALITY_TYPES.BRAVE]: {
    advantage: PERSONALITY_TYPES.CUNNING,   // Brave → Cunning (+20%)
    disadvantage: PERSONALITY_TYPES.CALM,   // Brave → Calm (-20%)
  },
  [PERSONALITY_TYPES.CUNNING]: {
    advantage: PERSONALITY_TYPES.CALM,      // Cunning → Calm (+20%)
    disadvantage: PERSONALITY_TYPES.WILD,   // Cunning → Wild (-20%)
  },
  [PERSONALITY_TYPES.CALM]: {
    advantage: PERSONALITY_TYPES.WILD,      // Calm → Wild (+20%)
    disadvantage: PERSONALITY_TYPES.BRAVE,  // Calm → Brave (-20%)
  },
  [PERSONALITY_TYPES.WILD]: {
    advantage: PERSONALITY_TYPES.BRAVE,     // Wild → Brave (+20%)
    disadvantage: PERSONALITY_TYPES.CUNNING, // Wild → Cunning (-20%)
  },
  [PERSONALITY_TYPES.MYSTIC]: {
    advantage: null,  // 신비는 특별 규칙 적용
    disadvantage: null,
  },
};

// 교단별 성격 보너스
const CULT_PERSONALITY_BONUSES = {
  SHADOW: {
    [PERSONALITY_TYPES.CUNNING]: 0.10,   // 어둠 교단 - 교활 +10%
    [PERSONALITY_TYPES.MYSTIC]: 0.05,    // 어둠 교단 - 신비 +5%
  },
  FLAME: {
    [PERSONALITY_TYPES.BRAVE]: 0.10,     // 화염 교단 - 용맹 +10%
    [PERSONALITY_TYPES.WILD]: 0.05,      // 화염 교단 - 야성 +5%
  },
  FROST: {
    [PERSONALITY_TYPES.CALM]: 0.10,      // 냉기 교단 - 침착 +10%
    [PERSONALITY_TYPES.MYSTIC]: 0.05,    // 냉기 교단 - 신비 +5%
  },
  NATURE: {
    [PERSONALITY_TYPES.WILD]: 0.10,      // 자연 교단 - 야성 +10%
    [PERSONALITY_TYPES.CALM]: 0.05,      // 자연 교단 - 침착 +5%
  },
  VOID: {
    [PERSONALITY_TYPES.MYSTIC]: 0.15,    // 공허 교단 - 신비 +15%
  },
};

class PersonalitySystem {
  constructor() {
    this.matchupHistory = [];
  }

  /**
   * 상성 배율 계산
   * @param {string} attackerPersonality - 공격자 성격
   * @param {string} defenderPersonality - 방어자 성격
   * @returns {Object} { multiplier, advantage, description }
   */
  getMatchupMultiplier(attackerPersonality, defenderPersonality) {
    const attacker = attackerPersonality.toUpperCase();
    const defender = defenderPersonality.toUpperCase();
    
    // 유효성 검사
    if (!PERSONALITY_TYPES[attacker]) {
      throw new Error(`알 수 없는 공격자 성격: ${attackerPersonality}`);
    }
    if (!PERSONALITY_TYPES[defender]) {
      throw new Error(`알 수 없는 방어자 성격: ${defenderPersonality}`);
    }
    
    // 신비 성격 특별 처리 (공격자가 신비인 경우)
    if (attacker === PERSONALITY_TYPES.MYSTIC) {
      return {
        multiplier: MATCHUP_CONFIG.MYSTIC_ADVANTAGE,
        advantage: 'MYSTIC_BONUS',
        description: `신비 성격은 모든 상대에게 ${(MATCHUP_CONFIG.MYSTIC_ADVANTAGE - 1) * 100}% 보너스`,
      };
    }
    
    // 같은 성격끼리는 중립
    if (attacker === defender) {
      return {
        multiplier: MATCHUP_CONFIG.NEUTRAL_MULTIPLIER,
        advantage: 'NEUTRAL',
        description: '동일 성격 - 상성 효과 없음',
      };
    }
    
    // 상성 확인
    const matchup = PERSONALITY_MATCHUPS[attacker];
    
    if (matchup.advantage === defender) {
      return {
        multiplier: MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER,
        advantage: 'ADVANTAGE',
        description: `${attacker}는 ${defender}에게 유리 (+${(MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER - 1) * 100}%)`,
      };
    }
    
    if (matchup.disadvantage === defender) {
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
   * 교단-성격 보너스 계산
   * @param {string} cult - 교단 이름
   * @param {string} personality - 성격
   * @returns {Object} { bonus, description }
   */
  getCultBonus(cult, personality) {
    const cultName = cult.toUpperCase();
    const personalityType = personality.toUpperCase();
    
    const cultBonuses = CULT_PERSONALITY_BONUSES[cultName];
    
    if (!cultBonuses) {
      return {
        bonus: 0,
        description: `알 수 없는 교단: ${cult}`,
      };
    }
    
    const bonus = cultBonuses[personalityType] || 0;
    
    if (bonus > 0) {
      return {
        bonus,
        description: `${cultName} 교단에서 ${personalityType} 성격은 +${bonus * 100}% 보너스`,
      };
    }
    
    return {
      bonus: 0,
      description: `${cultName} 교단에서 ${personalityType} 성격은 보너스 없음`,
    };
  }

  /**
   * 파티 전체 보너스 계산
   * @param {Array} party - 파티 멤버 배열 [{ personality, cult? }]
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
    
    const personalities = party.map(member => member.personality.toUpperCase());
    const uniquePersonalities = [...new Set(personalities)];
    
    // 다양성 보너스: 서로 다른 성격 수에 따른 보너스
    const diversityBonus = this._calculateDiversityBonus(uniquePersonalities.length, party.length);
    
    // 시너지 보너스: 특정 조합에 대한 보너스
    const synergyBonus = this._calculateSynergyBonus(personalities);
    
    // 교단 보너스 합산
    const cultBonuses = party
      .filter(member => member.cult)
      .map(member => ({
        member: member.name || 'Unknown',
        ...this.getCultBonus(member.cult, member.personality),
      }));
    
    const totalCultBonus = cultBonuses.reduce((sum, cb) => sum + cb.bonus, 0);
    
    return {
      totalBonus: diversityBonus + synergyBonus + totalCultBonus,
      diversityBonus,
      synergyBonus,
      cultBonuses,
      uniquePersonalities,
      details: this._generatePartyDetails(uniquePersonalities, diversityBonus, synergyBonus),
    };
  }

  /**
   * 다양성 보너스 계산
   * @private
   */
  _calculateDiversityBonus(uniqueCount, totalCount) {
    // 모든 멤버가 다른 성격일 때 최대 보너스
    if (uniqueCount >= 4) return 0.15;
    if (uniqueCount >= 3) return 0.08;
    if (uniqueCount >= 2) return 0.03;
    return 0;
  }

  /**
   * 시너지 보너스 계산
   * @private
   */
  _calculateSynergyBonus(personalities) {
    let bonus = 0;
    
    // 용맹 + 침착 조합: 공수 균형 시너지
    if (personalities.includes(PERSONALITY_TYPES.BRAVE) && 
        personalities.includes(PERSONALITY_TYPES.CALM)) {
      bonus += 0.05;
    }
    
    // 교활 + 야성 조합: 기습 시너지
    if (personalities.includes(PERSONALITY_TYPES.CUNNING) && 
        personalities.includes(PERSONALITY_TYPES.WILD)) {
      bonus += 0.05;
    }
    
    // 신비가 포함된 파티: 마법 강화
    if (personalities.includes(PERSONALITY_TYPES.MYSTIC)) {
      bonus += 0.03;
    }
    
    return bonus;
  }

  /**
   * 파티 상세 설명 생성
   * @private
   */
  _generatePartyDetails(uniquePersonalities, diversityBonus, synergyBonus) {
    const details = [];
    
    if (diversityBonus > 0) {
      details.push(`다양성 보너스: +${(diversityBonus * 100).toFixed(0)}% (${uniquePersonalities.length}개 성격)`);
    }
    
    if (synergyBonus > 0) {
      details.push(`시너지 보너스: +${(synergyBonus * 100).toFixed(0)}%`);
    }
    
    return details.join(', ') || '특별 보너스 없음';
  }

  /**
   * 특정 방어자에게 유리한 성격 목록 반환
   * @param {string} defenderPersonality - 방어자 성격
   * @returns {Object} { advantageous, neutral, disadvantageous }
   */
  getAdvantageousPersonalities(defenderPersonality) {
    const defender = defenderPersonality.toUpperCase();
    
    if (!PERSONALITY_TYPES[defender]) {
      throw new Error(`알 수 없는 방어자 성격: ${defenderPersonality}`);
    }
    
    const advantageous = [];
    const neutral = [];
    const disadvantageous = [];
    
    // 신비는 항상 유리
    advantageous.push({
      personality: PERSONALITY_TYPES.MYSTIC,
      multiplier: MATCHUP_CONFIG.MYSTIC_ADVANTAGE,
      reason: '신비는 모든 상대에게 유리',
    });
    
    // 각 성격별로 상성 확인
    for (const [attackerType, matchup] of Object.entries(PERSONALITY_MATCHUPS)) {
      if (attackerType === PERSONALITY_TYPES.MYSTIC) continue;
      
      if (matchup.advantage === defender) {
        advantageous.push({
          personality: attackerType,
          multiplier: MATCHUP_CONFIG.ADVANTAGE_MULTIPLIER,
          reason: `${attackerType}는 ${defender}에게 유리`,
        });
      } else if (matchup.disadvantage === defender) {
        disadvantageous.push({
          personality: attackerType,
          multiplier: MATCHUP_CONFIG.DISADVANTAGE_MULTIPLIER,
          reason: `${attackerType}는 ${defender}에게 불리`,
        });
      } else if (attackerType !== defender) {
        neutral.push({
          personality: attackerType,
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
        ? `${defender}에게는 ${advantageous.map(a => a.personality).join(', ')} 성격이 유리합니다.`
        : '특별히 유리한 성격이 없습니다.',
    };
  }

  /**
   * 전체 상성표 반환
   * @returns {Object} 상성표
   */
  getMatchupChart() {
    const chart = {};
    
    for (const attacker of Object.values(PERSONALITY_TYPES)) {
      chart[attacker] = {};
      for (const defender of Object.values(PERSONALITY_TYPES)) {
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
      personalities: { ...PERSONALITY_TYPES },
      matchupConfig: { ...MATCHUP_CONFIG },
      cultBonuses: { ...CULT_PERSONALITY_BONUSES },
      description: `
상성 시스템:
- Brave(용맹) → Cunning(교활) 유리 (+20%), Calm(침착) 불리 (-20%)
- Cunning(교활) → Calm(침착) 유리 (+20%), Wild(야성) 불리 (-20%)
- Calm(침착) → Wild(야성) 유리 (+20%), Brave(용맹) 불리 (-20%)
- Wild(야성) → Brave(용맹) 유리 (+20%), Cunning(교활) 불리 (-20%)
- Mystic(신비) → 모든 상대에게 +10%
      `.trim(),
    };
  }
}

// 싱글톤 인스턴스
const personalitySystem = new PersonalitySystem();

// ES6 모듈 export
export { 
  PersonalitySystem, 
  personalitySystem, 
  PERSONALITY_TYPES, 
  MATCHUP_CONFIG,
  PERSONALITY_MATCHUPS,
  CULT_PERSONALITY_BONUSES,
};
export default personalitySystem;

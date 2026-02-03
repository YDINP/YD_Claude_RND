/**
 * constants.js - Game system constants and configurations
 * 성격 시스템, 교단 시스템, 상성 관계 정의
 */

// ============================================
// Personality System (성격 시스템)
// ============================================

/**
 * 성격 타입 정의
 * 4가지 기본 성격 + 1가지 특수 성격 (신비)
 */
export const PERSONALITY = {
  BRAVE: 'brave',       // 용감 - 공격적, 전투 지향
  CUNNING: 'cunning',   // 교활 - 전략적, 계략 사용
  CALM: 'calm',         // 침착 - 방어적, 안정적
  WILD: 'wild',         // 야성 - 본능적, 예측 불가
  MYSTIC: 'mystic'      // 신비 - 신비로운, 모든 성격에 보너스
};

/**
 * 성격 상성 관계 (가위바위보 구조)
 * - BRAVE > CUNNING > CALM > WILD > BRAVE
 * - MYSTIC은 모든 성격에 약간의 보너스
 */
export const PERSONALITY_MATCHUP = {
  [PERSONALITY.BRAVE]: {
    strongAgainst: PERSONALITY.CUNNING,   // 용감 > 교활
    weakAgainst: PERSONALITY.CALM,        // 용감 < 침착
    neutral: [PERSONALITY.WILD, PERSONALITY.MYSTIC]
  },
  [PERSONALITY.CUNNING]: {
    strongAgainst: PERSONALITY.CALM,      // 교활 > 침착
    weakAgainst: PERSONALITY.WILD,        // 교활 < 야성
    neutral: [PERSONALITY.BRAVE, PERSONALITY.MYSTIC]
  },
  [PERSONALITY.CALM]: {
    strongAgainst: PERSONALITY.WILD,      // 침착 > 야성
    weakAgainst: PERSONALITY.BRAVE,       // 침착 < 용감
    neutral: [PERSONALITY.CUNNING, PERSONALITY.MYSTIC]
  },
  [PERSONALITY.WILD]: {
    strongAgainst: PERSONALITY.BRAVE,     // 야성 > 용감
    weakAgainst: PERSONALITY.CUNNING,     // 야성 < 교활
    neutral: [PERSONALITY.CALM, PERSONALITY.MYSTIC]
  },
  [PERSONALITY.MYSTIC]: {
    strongAgainst: null,                  // 신비는 특정 상성 없음
    weakAgainst: null,                    // 약점 없음
    neutral: [PERSONALITY.BRAVE, PERSONALITY.CUNNING, PERSONALITY.CALM, PERSONALITY.WILD],
    specialBonus: true                    // 모든 성격에 보너스
  }
};

/**
 * 성격 상성 데미지 배율
 */
export const PERSONALITY_DAMAGE = {
  ADVANTAGE: 1.2,       // 상성 우위: 20% 추가 데미지
  DISADVANTAGE: 0.8,    // 상성 열세: 20% 데미지 감소
  NEUTRAL: 1.0,         // 중립: 변화 없음
  MYSTIC_BONUS: 1.1     // 신비 보너스: 10% 추가 데미지 (모든 대상)
};

/**
 * 성격별 한글 이름 및 설명
 */
export const PERSONALITY_INFO = {
  [PERSONALITY.BRAVE]: {
    name: '용감',
    description: '두려움을 모르는 전사의 기질',
    color: '#E74C3C'
  },
  [PERSONALITY.CUNNING]: {
    name: '교활',
    description: '상대의 허점을 노리는 전략가',
    color: '#9B59B6'
  },
  [PERSONALITY.CALM]: {
    name: '침착',
    description: '어떤 상황에서도 냉정함을 유지',
    color: '#3498DB'
  },
  [PERSONALITY.WILD]: {
    name: '야성',
    description: '본능에 따라 행동하는 야수의 기질',
    color: '#27AE60'
  },
  [PERSONALITY.MYSTIC]: {
    name: '신비',
    description: '신비로운 힘을 지닌 존재',
    color: '#F39C12'
  }
};

// ============================================
// Cult System (교단 시스템)
// ============================================

/**
 * 교단 타입 정의
 * 5개의 신화 기반 교단
 */
export const CULT = {
  VALHALLA: 'valhalla',           // 발할라 (북유럽)
  TAKAMAGAHARA: 'takamagahara',   // 타카마가하라 (일본)
  OLYMPUS: 'olympus',             // 올림푸스 (그리스)
  ASGARD: 'asgard',               // 아스가르드 (북유럽)
  YOMI: 'yomi'                    // 요미 (일본)
};

/**
 * 교단별 상세 정보
 */
export const CULT_INFO = {
  [CULT.VALHALLA]: {
    name: '발할라',
    origin: '북유럽 신화',
    description: '용맹한 전사들의 낙원',
    color: '#4A90D9',
    element: 'wind'
  },
  [CULT.TAKAMAGAHARA]: {
    name: '타카마가하라',
    origin: '일본 신화',
    description: '아마테라스의 천상계',
    color: '#FFD700',
    element: 'light'
  },
  [CULT.OLYMPUS]: {
    name: '올림푸스',
    origin: '그리스 신화',
    description: '제우스와 12신의 성지',
    color: '#FF6B35',
    element: 'fire'
  },
  [CULT.ASGARD]: {
    name: '아스가르드',
    origin: '북유럽 신화',
    description: '신들의 세계',
    color: '#5DADE2',
    element: 'water'
  },
  [CULT.YOMI]: {
    name: '요미',
    origin: '일본 신화',
    description: '이자나미의 저승',
    color: '#8E44AD',
    element: 'dark'
  }
};

/**
 * 교단-성격 최적 조합 보너스
 * 특정 교단에서 특정 성격 영웅이 추가 보너스를 받음
 */
export const CULT_PERSONALITY_BONUS = {
  [CULT.VALHALLA]: {
    optimalPersonality: PERSONALITY.BRAVE,   // 발할라 - 용감한 전사들
    bonusMultiplier: 1.15,                   // 15% 추가 스탯 보너스
    description: '발할라의 전사는 용맹함을 높이 평가합니다'
  },
  [CULT.TAKAMAGAHARA]: {
    optimalPersonality: PERSONALITY.MYSTIC,  // 타카마가하라 - 신비로운 존재
    bonusMultiplier: 1.15,
    description: '천상계는 신비로운 힘을 환영합니다'
  },
  [CULT.OLYMPUS]: {
    optimalPersonality: PERSONALITY.CUNNING, // 올림푸스 - 전략적인 신들
    bonusMultiplier: 1.15,
    description: '올림푸스의 신들은 지혜와 전략을 중시합니다'
  },
  [CULT.ASGARD]: {
    optimalPersonality: PERSONALITY.CALM,    // 아스가르드 - 침착한 수호자
    bonusMultiplier: 1.15,
    description: '아스가르드는 냉정한 수호자를 필요로 합니다'
  },
  [CULT.YOMI]: {
    optimalPersonality: PERSONALITY.WILD,    // 요미 - 야성적인 어둠
    bonusMultiplier: 1.15,
    description: '저승은 야성적인 영혼을 끌어들입니다'
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * 성격 상성 데미지 배율 계산
 * @param {string} attackerPersonality - 공격자 성격
 * @param {string} defenderPersonality - 방어자 성격
 * @returns {number} 데미지 배율
 */
export function getPersonalityDamageMultiplier(attackerPersonality, defenderPersonality) {
  // 신비 성격은 항상 보너스
  if (attackerPersonality === PERSONALITY.MYSTIC) {
    return PERSONALITY_DAMAGE.MYSTIC_BONUS;
  }

  const matchup = PERSONALITY_MATCHUP[attackerPersonality];
  if (!matchup) return PERSONALITY_DAMAGE.NEUTRAL;

  if (matchup.strongAgainst === defenderPersonality) {
    return PERSONALITY_DAMAGE.ADVANTAGE;
  }
  if (matchup.weakAgainst === defenderPersonality) {
    return PERSONALITY_DAMAGE.DISADVANTAGE;
  }

  return PERSONALITY_DAMAGE.NEUTRAL;
}

/**
 * 교단-성격 보너스 배율 계산
 * @param {string} cult - 교단
 * @param {string} personality - 성격
 * @returns {number} 보너스 배율 (1.0 = 보너스 없음)
 */
export function getCultPersonalityBonus(cult, personality) {
  const bonus = CULT_PERSONALITY_BONUS[cult];
  if (!bonus) return 1.0;

  if (bonus.optimalPersonality === personality) {
    return bonus.bonusMultiplier;
  }

  return 1.0;
}

/**
 * 성격 상성 관계 설명 문자열 반환
 * @param {string} personality - 성격
 * @returns {string} 상성 설명
 */
export function getPersonalityMatchupDescription(personality) {
  const matchup = PERSONALITY_MATCHUP[personality];
  const info = PERSONALITY_INFO[personality];

  if (!matchup || !info) return '';

  if (personality === PERSONALITY.MYSTIC) {
    return `${info.name}: 모든 성격에 ${(PERSONALITY_DAMAGE.MYSTIC_BONUS - 1) * 100}% 보너스 데미지`;
  }

  const strongInfo = PERSONALITY_INFO[matchup.strongAgainst];
  const weakInfo = PERSONALITY_INFO[matchup.weakAgainst];

  return `${info.name}: ${strongInfo.name}에 강함, ${weakInfo.name}에 약함`;
}

export default {
  PERSONALITY,
  PERSONALITY_MATCHUP,
  PERSONALITY_DAMAGE,
  PERSONALITY_INFO,
  CULT,
  CULT_INFO,
  CULT_PERSONALITY_BONUS,
  getPersonalityDamageMultiplier,
  getCultPersonalityBonus,
  getPersonalityMatchupDescription
};

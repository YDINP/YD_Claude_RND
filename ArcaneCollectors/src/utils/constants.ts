/**
 * constants.ts - Game system constants and configurations
 * 분위기 시스템, 교단 시스템, 상성 관계 정의
 */

// ============================================
// Mood System (분위기 시스템)
// ============================================

/**
 * 분위기 타입 정의
 * 9가지 분위기 (공격형: 열혈/격렬/광폭, 방어형: 고요/의연/헌신, 전략형: 냉철/고결/신비)
 */
export const MOOD = {
  BRAVE: 'brave',       // 열혈 - 공격적, 전투 지향
  FIERCE: 'fierce',     // 격렬 - 폭발적, 근접 극대화
  WILD: 'wild',         // 광폭 - 본능적, 예측 불가
  CALM: 'calm',         // 고요 - 방어적, 안정적
  STOIC: 'stoic',       // 의연 - 인내, 생존 특화
  DEVOTED: 'devoted',   // 헌신 - 자기희생, 치유/보호
  CUNNING: 'cunning',   // 냉철 - 전략적, 약점 공략
  NOBLE: 'noble',       // 고결 - 리더십, 팀 버프
  MYSTIC: 'mystic'      // 신비 - 초월적, 마법 특화
} as const;

export type MoodType = typeof MOOD[keyof typeof MOOD];

/**
 * 분위기 상성 관계 (매트릭스 구조)
 * 각 분위기는 2개에 강하고 2개에 약함, 나머지 4개는 중립
 * 그룹: 공격형(brave/fierce/wild), 방어형(calm/stoic/devoted), 전략형(cunning/noble/mystic)
 */
export interface MoodMatchup {
  strongAgainst: MoodType[];
  weakAgainst: MoodType[];
}

export const MOOD_MATCHUP: Record<MoodType, MoodMatchup> = {
  [MOOD.BRAVE]: {
    strongAgainst: [MOOD.WILD, MOOD.CUNNING],
    weakAgainst: [MOOD.FIERCE, MOOD.DEVOTED]
  },
  [MOOD.FIERCE]: {
    strongAgainst: [MOOD.BRAVE, MOOD.NOBLE],
    weakAgainst: [MOOD.WILD, MOOD.CALM]
  },
  [MOOD.WILD]: {
    strongAgainst: [MOOD.FIERCE, MOOD.MYSTIC],
    weakAgainst: [MOOD.BRAVE, MOOD.STOIC]
  },
  [MOOD.CALM]: {
    strongAgainst: [MOOD.DEVOTED, MOOD.FIERCE],
    weakAgainst: [MOOD.STOIC, MOOD.CUNNING]
  },
  [MOOD.STOIC]: {
    strongAgainst: [MOOD.CALM, MOOD.WILD],
    weakAgainst: [MOOD.DEVOTED, MOOD.MYSTIC]
  },
  [MOOD.DEVOTED]: {
    strongAgainst: [MOOD.STOIC, MOOD.BRAVE],
    weakAgainst: [MOOD.CALM, MOOD.NOBLE]
  },
  [MOOD.CUNNING]: {
    strongAgainst: [MOOD.MYSTIC, MOOD.CALM],
    weakAgainst: [MOOD.NOBLE, MOOD.BRAVE]
  },
  [MOOD.NOBLE]: {
    strongAgainst: [MOOD.CUNNING, MOOD.DEVOTED],
    weakAgainst: [MOOD.MYSTIC, MOOD.FIERCE]
  },
  [MOOD.MYSTIC]: {
    strongAgainst: [MOOD.NOBLE, MOOD.STOIC],
    weakAgainst: [MOOD.CUNNING, MOOD.WILD]
  }
};

/**
 * 분위기 상성 데미지 배율
 */
export const MOOD_DAMAGE = {
  ADVANTAGE: 1.2,       // 상성 우위: 20% 추가 데미지
  DISADVANTAGE: 0.8,    // 상성 열세: 20% 데미지 감소
  NEUTRAL: 1.0          // 중립: 변화 없음
} as const;

/**
 * 분위기별 한글 이름 및 설명
 */
export interface MoodInfo {
  name: string;
  description: string;
  color: string;
}

export const MOOD_INFO: Record<MoodType, MoodInfo> = {
  [MOOD.BRAVE]: {
    name: '열혈',
    description: '두려움을 모르는 전사의 기질',
    color: '#E74C3C'
  },
  [MOOD.FIERCE]: {
    name: '격렬',
    description: '폭발적인 힘으로 적을 압도하는 파괴자',
    color: '#FF5722'
  },
  [MOOD.WILD]: {
    name: '광폭',
    description: '본능에 따라 행동하는 야수의 기질',
    color: '#27AE60'
  },
  [MOOD.CALM]: {
    name: '고요',
    description: '어떤 상황에서도 냉정함을 유지',
    color: '#3498DB'
  },
  [MOOD.STOIC]: {
    name: '의연',
    description: '어떤 고통도 견디는 불굴의 인내',
    color: '#607D8B'
  },
  [MOOD.DEVOTED]: {
    name: '헌신',
    description: '동료를 위해 모든 것을 바치는 수호자',
    color: '#E91E63'
  },
  [MOOD.CUNNING]: {
    name: '냉철',
    description: '상대의 허점을 노리는 전략가',
    color: '#9B59B6'
  },
  [MOOD.NOBLE]: {
    name: '고결',
    description: '고귀한 의지로 아군을 이끄는 지휘관',
    color: '#FFD700'
  },
  [MOOD.MYSTIC]: {
    name: '신비',
    description: '신비로운 힘을 지닌 초월적 존재',
    color: '#F39C12'
  }
};

// ============================================
// Cult System (교단 시스템)
// ============================================

/**
 * 교단 타입 정의
 * 9개의 신화 기반 교단
 */
export const CULT = {
  VALHALLA: 'valhalla',           // 발할라 (북유럽 - 전사의 낙원)
  TAKAMAGAHARA: 'takamagahara',   // 타카마가하라 (일본 - 천상계)
  OLYMPUS: 'olympus',             // 올림푸스 (그리스 - 12신)
  ASGARD: 'asgard',               // 아스가르드 (북유럽 - 신들의 세계)
  YOMI: 'yomi',                   // 요미 (일본 - 저승)
  TARTARUS: 'tartarus',           // 타르타로스 (그리스 - 티탄의 감옥)
  AVALON: 'avalon',               // 아발론 (켈트 - 성스러운 섬)
  HELHEIM: 'helheim',             // 헬하임 (북유럽 - 명계)
  KUNLUN: 'kunlun'                // 곤륜 (중국 - 선인의 산)
} as const;

export type CultType = typeof CULT[keyof typeof CULT];

/**
 * 교단별 상세 정보
 */
export interface CultInfo {
  name: string;
  origin: string;
  description: string;
  color: string;
}

export const CULT_INFO: Record<CultType, CultInfo> = {
  [CULT.VALHALLA]: {
    name: '발할라',
    origin: '북유럽 신화',
    description: '용맹한 전사들의 낙원',
    color: '#4A90D9'
  },
  [CULT.TAKAMAGAHARA]: {
    name: '타카마가하라',
    origin: '일본 신화',
    description: '아마테라스의 천상계',
    color: '#FFD700'
  },
  [CULT.OLYMPUS]: {
    name: '올림푸스',
    origin: '그리스 신화',
    description: '제우스와 12신의 성지',
    color: '#FF6B35'
  },
  [CULT.ASGARD]: {
    name: '아스가르드',
    origin: '북유럽 신화',
    description: '신들의 세계',
    color: '#5DADE2'
  },
  [CULT.YOMI]: {
    name: '요미',
    origin: '일본 신화',
    description: '이자나미의 저승',
    color: '#8E44AD'
  },
  [CULT.TARTARUS]: {
    name: '타르타로스',
    origin: '그리스 신화',
    description: '티탄과 괴물이 갇힌 지하세계',
    color: '#B71C1C'
  },
  [CULT.AVALON]: {
    name: '아발론',
    origin: '켈트 전설',
    description: '전설의 기사왕이 잠든 성스러운 섬',
    color: '#4CAF50'
  },
  [CULT.HELHEIM]: {
    name: '헬하임',
    origin: '북유럽 신화',
    description: '죽음의 여왕 헬이 다스리는 명계',
    color: '#455A64'
  },
  [CULT.KUNLUN]: {
    name: '곤륜',
    origin: '중국 신화',
    description: '선인과 무협의 영웅이 수련하는 산',
    color: '#FF9800'
  }
};

/**
 * 교단-분위기 최적 조합 보너스
 * 특정 교단에서 특정 분위기 영웅이 추가 보너스를 받음
 */
export interface CultMoodBonusInfo {
  optimalMood: MoodType;
  bonusMultiplier: number;
  description: string;
}

export const CULT_MOOD_BONUS: Record<CultType, CultMoodBonusInfo> = {
  [CULT.VALHALLA]: {
    optimalMood: MOOD.BRAVE,
    bonusMultiplier: 1.15,
    description: '발할라의 전사는 열혈의 기운을 높이 평가합니다'
  },
  [CULT.TAKAMAGAHARA]: {
    optimalMood: MOOD.MYSTIC,
    bonusMultiplier: 1.15,
    description: '천상계는 신비로운 힘을 환영합니다'
  },
  [CULT.OLYMPUS]: {
    optimalMood: MOOD.CUNNING,
    bonusMultiplier: 1.15,
    description: '올림푸스의 신들은 지혜와 전략을 중시합니다'
  },
  [CULT.ASGARD]: {
    optimalMood: MOOD.CALM,
    bonusMultiplier: 1.15,
    description: '아스가르드는 고요한 수호자를 필요로 합니다'
  },
  [CULT.YOMI]: {
    optimalMood: MOOD.WILD,
    bonusMultiplier: 1.15,
    description: '저승은 광폭한 영혼을 끌어들입니다'
  },
  [CULT.TARTARUS]: {
    optimalMood: MOOD.FIERCE,
    bonusMultiplier: 1.15,
    description: '타르타로스는 격렬한 파괴의 힘을 해방합니다'
  },
  [CULT.AVALON]: {
    optimalMood: MOOD.NOBLE,
    bonusMultiplier: 1.15,
    description: '아발론은 고결한 기사의 정신을 찬양합니다'
  },
  [CULT.HELHEIM]: {
    optimalMood: MOOD.STOIC,
    bonusMultiplier: 1.15,
    description: '헬하임은 의연한 영혼만이 버텨낼 수 있습니다'
  },
  [CULT.KUNLUN]: {
    optimalMood: MOOD.DEVOTED,
    bonusMultiplier: 1.15,
    description: '곤륜산은 헌신적인 수행자를 이끌어줍니다'
  }
};

// ============================================
// Helper Functions
// ============================================

/**
 * 분위기 상성 데미지 배율 계산
 * @param attackerMood - 공격자 분위기
 * @param defenderMood - 방어자 분위기
 * @returns 데미지 배율
 */
export function getMoodDamageMultiplier(attackerMood: MoodType, defenderMood: MoodType): number {
  const matchup = MOOD_MATCHUP[attackerMood];
  if (!matchup) return MOOD_DAMAGE.NEUTRAL;

  if (matchup.strongAgainst.includes(defenderMood)) {
    return MOOD_DAMAGE.ADVANTAGE;
  }
  if (matchup.weakAgainst.includes(defenderMood)) {
    return MOOD_DAMAGE.DISADVANTAGE;
  }

  return MOOD_DAMAGE.NEUTRAL;
}

/**
 * 교단-분위기 보너스 배율 계산
 * @param cult - 교단
 * @param mood - 분위기
 * @returns 보너스 배율 (1.0 = 보너스 없음)
 */
export function getCultMoodBonus(cult: CultType, mood: MoodType): number {
  const bonus = CULT_MOOD_BONUS[cult];
  if (!bonus) return 1.0;

  if (bonus.optimalMood === mood) {
    return bonus.bonusMultiplier;
  }

  return 1.0;
}

/**
 * 분위기 상성 관계 설명 문자열 반환
 * @param mood - 분위기
 * @returns 상성 설명
 */
export function getMoodMatchupDescription(mood: MoodType): string {
  const matchup = MOOD_MATCHUP[mood];
  const info = MOOD_INFO[mood];

  if (!matchup || !info) return '';

  const strongNames = matchup.strongAgainst
    .map(m => MOOD_INFO[m]?.name)
    .filter(Boolean)
    .join(', ');
  const weakNames = matchup.weakAgainst
    .map(m => MOOD_INFO[m]?.name)
    .filter(Boolean)
    .join(', ');

  return `${info.name}: ${strongNames}에 강함, ${weakNames}에 약함`;
}

export default {
  MOOD,
  MOOD_MATCHUP,
  MOOD_DAMAGE,
  MOOD_INFO,
  CULT,
  CULT_INFO,
  CULT_MOOD_BONUS,
  getMoodDamageMultiplier,
  getCultMoodBonus,
  getMoodMatchupDescription
};
